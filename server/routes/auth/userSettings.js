const express = require('express');
const multer = require('multer');
const path = require('path');
const router = express.Router();
const { pool, requireAuth, validateNickname, USER_FIELDS, addPercentile } = require('./_helpers');
const { getUploadDir } = require('../../utils/uploadRoot');

const profileStorage = multer.diskStorage({
  destination: (req, file, cb) => {
    const dir = getUploadDir('profiles');
    cb(null, dir);
  },
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname) || '.jpg';
    cb(null, `profile_${req.session.userId}_${Date.now()}${ext}`);
  },
});

const imageFilter = (req, file, cb) => {
  const allowed = ['.jpg', '.jpeg', '.png', '.webp', '.heic', '.heif', '.avif'];
  const ext = path.extname(file.originalname).toLowerCase();
  const mime = String(file.mimetype || '').toLowerCase();
  if (!mime.startsWith('image/')) return cb(new Error('ONLY_IMAGE_ALLOWED'));
  if (ext && !allowed.includes(ext)) return cb(new Error('ONLY_IMAGE_ALLOWED'));
  return cb(null, true);
};

const PROFILE_IMAGE_MAX_SIZE = 5 * 1024 * 1024;

const uploadProfile = multer({
  storage: profileStorage,
  limits: { fileSize: PROFILE_IMAGE_MAX_SIZE },
  fileFilter: imageFilter,
});

function sendMulterUploadError(res, err, maxSizeBytes) {
  if (err instanceof multer.MulterError) {
    if (err.code === 'LIMIT_FILE_SIZE') {
      return res.status(413).json({
        error: `이미지 용량은 최대 ${Math.floor(maxSizeBytes / (1024 * 1024))}MB까지 가능합니다.`,
      });
    }
    if (err.code === 'LIMIT_UNEXPECTED_FILE') {
      return res.status(400).json({ error: '업로드 필드가 올바르지 않습니다.' });
    }
    return res.status(400).json({ error: '이미지 업로드 요청이 올바르지 않습니다.' });
  }

  if (err?.message === 'ONLY_IMAGE_ALLOWED') {
    return res.status(400).json({
      error: '지원하지 않는 이미지 형식입니다. JPG, PNG, WEBP, HEIC/HEIF를 사용해주세요.',
    });
  }

  console.error('multer upload error:', err);
  return res.status(400).json({ error: '이미지 업로드에 실패했습니다.' });
}

router.post('/profile-custom', requireAuth, (req, res) => {
  uploadProfile.single('profileImage')(req, res, async (err) => {
    if (err) return sendMulterUploadError(res, err, PROFILE_IMAGE_MAX_SIZE);

    const rawNickname = typeof req.body.nickname === 'string' ? req.body.nickname.trim() : '';
    const rawUniversity = typeof req.body.university === 'string' ? req.body.university.trim() : '';
    const isNsu = req.body.is_n_su === 'true' || req.body.is_n_su === true;
    const rawPrevUniversity =
      typeof req.body.prev_university === 'string' ? req.body.prev_university.trim() : '';
    const hasUniversityUpdate = rawUniversity !== '';

    let nickname = null;
    if (rawNickname) {
      const nickValidation = validateNickname(rawNickname);
      if (!nickValidation.ok) {
        return res.status(400).json({ error: nickValidation.error });
      }
      nickname = nickValidation.value;
    }

    if (hasUniversityUpdate && isNsu && !rawPrevUniversity) {
      return res.status(400).json({ error: 'N수생은 전적 대학교를 입력해주세요.' });
    }

    if (!nickname && !req.file && !hasUniversityUpdate) {
      return res.status(400).json({ error: '변경할 프로필 정보가 없습니다.' });
    }

    try {
      if (nickname) {
        const existing = await pool.query('SELECT id FROM users WHERE nickname = $1 AND id != $2', [
          nickname,
          req.session.userId,
        ]);
        if (existing.rows.length > 0) {
          return res.status(409).json({ error: '이미 사용 중인 닉네임입니다.' });
        }
      }

      const nextProfileImageUrl = req.file ? `/uploads/profiles/${req.file.filename}` : null;
      const result = await pool.query(
        `UPDATE users
                 SET nickname = COALESCE($1, nickname),
                     profile_image_url = COALESCE($2, profile_image_url),
                     university = CASE WHEN $3 THEN $4 ELSE university END,
                     is_n_su = CASE WHEN $3 THEN $5 ELSE is_n_su END,
                     prev_university = CASE WHEN $3 THEN $6 ELSE prev_university END
                 WHERE id = $7
                 RETURNING ${USER_FIELDS}`,
        [
          nickname,
          nextProfileImageUrl,
          hasUniversityUpdate,
          rawUniversity || null,
          isNsu,
          isNsu ? rawPrevUniversity || null : null,
          req.session.userId,
        ],
      );

      res.json({ ok: true, user: addPercentile(result.rows[0]) });
    } catch (dbErr) {
      console.error('profile-custom error:', dbErr);
      res.status(500).json({ error: '프로필 저장 중 오류가 발생했습니다.' });
    }
  });
});

router.post('/status-emoji', requireAuth, async (req, res) => {
  const { emoji } = req.body;
  const allowed = [
    '📚',
    '☕',
    '💪',
    '🔥',
    '😴',
    '😊',
    '🎯',
    '💤',
    '🤔',
    '✨',
    '🏃',
    '🌙',
    '⭐',
    '🍀',
    '💯',
  ];
  const value = emoji && allowed.includes(emoji) ? emoji : null;
  try {
    await pool.query('UPDATE users SET status_emoji=$1 WHERE id=$2', [value, req.session.userId]);
    res.json({ ok: true, status_emoji: value });
  } catch (err) {
    res.status(500).json({ error: '서버 오류' });
  }
});

router.post('/status-message', requireAuth, async (req, res) => {
  const raw = (req.body.message || '').trim().slice(0, 60);
  try {
    await pool.query('UPDATE users SET status_message=$1 WHERE id=$2', [
      raw || null,
      req.session.userId,
    ]);
    res.json({ ok: true, status_message: raw || null });
  } catch (err) {
    res.status(500).json({ error: '서버 오류' });
  }
});

router.post('/update-profile', requireAuth, async (req, res) => {
  const { nickname, university, is_n_su, prev_university } = req.body;
  const normalizedUniversity = typeof university === 'string' ? university.trim() : '';
  const wantsNsu = !!is_n_su && !!normalizedUniversity;
  const normalizedPrevUniversity =
    wantsNsu && typeof prev_university === 'string' ? prev_university.trim() : '';

  const nickValidation = validateNickname(nickname);
  if (!nickValidation.ok) {
    return res.status(400).json({ error: nickValidation.error });
  }

  if (wantsNsu && !normalizedPrevUniversity) {
    return res.status(400).json({ error: 'N수생은 전적 대학교를 입력해주세요.' });
  }

  try {
    const existing = await pool.query('SELECT id FROM users WHERE nickname = $1 AND id != $2', [
      nickValidation.value,
      req.session.userId,
    ]);

    if (existing.rows.length > 0) {
      return res.status(409).json({ error: '이미 사용 중인 닉네임입니다.' });
    }

    await pool.query(
      `UPDATE users
             SET nickname = $1,
                 university = $2,
                 is_n_su = $3,
                 prev_university = $4
             WHERE id = $5`,
      [
        nickValidation.value,
        normalizedUniversity || null,
        wantsNsu,
        wantsNsu ? normalizedPrevUniversity : null,
        req.session.userId,
      ],
    );

    res.json({ ok: true });
  } catch (err) {
    console.error('update-profile error:', err);
    res.status(500).json({ error: '서버 오류가 발생했습니다.' });
  }
});

router.get('/titles', requireAuth, async (req, res) => {
  try {
    const [titlesRes, userRes] = await Promise.all([
      pool.query(
        `SELECT code, title, is_active, achieved_at
                 FROM user_titles
                 WHERE user_id = $1
                 ORDER BY achieved_at ASC`,
        [req.session.userId],
      ),
      pool.query('SELECT active_title FROM users WHERE id = $1', [req.session.userId]),
    ]);

    res.json({
      titles: titlesRes.rows,
      active_title: userRes.rows[0]?.active_title || null,
    });
  } catch (err) {
    console.error('titles error:', err);
    res.status(500).json({ error: '서버 오류' });
  }
});

router.post('/active-title', requireAuth, async (req, res) => {
  const code = typeof req.body.code === 'string' ? req.body.code.trim() : '';
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    if (!code) {
      await client.query('UPDATE user_titles SET is_active = FALSE WHERE user_id = $1', [
        req.session.userId,
      ]);
      const userRes = await client.query(
        `UPDATE users
                 SET active_title = NULL
                 WHERE id = $1
                 RETURNING ${USER_FIELDS}`,
        [req.session.userId],
      );
      await client.query('COMMIT');
      return res.json({ ok: true, user: addPercentile(userRes.rows[0]) });
    }

    const ownedRes = await client.query(
      `SELECT code, title
             FROM user_titles
             WHERE user_id = $1 AND code = $2`,
      [req.session.userId, code],
    );
    if (!ownedRes.rows.length) {
      await client.query('ROLLBACK');
      return res.status(400).json({ error: '보유하지 않은 칭호입니다.' });
    }

    const titleText = ownedRes.rows[0].title;
    await client.query('UPDATE user_titles SET is_active = FALSE WHERE user_id = $1', [
      req.session.userId,
    ]);
    await client.query('UPDATE user_titles SET is_active = TRUE WHERE user_id = $1 AND code = $2', [
      req.session.userId,
      code,
    ]);
    const userRes = await client.query(
      `UPDATE users
             SET active_title = $2
             WHERE id = $1
             RETURNING ${USER_FIELDS}`,
      [req.session.userId, titleText],
    );

    await client.query('COMMIT');
    res.json({ ok: true, user: addPercentile(userRes.rows[0]) });
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('active-title error:', err);
    res.status(500).json({ error: '서버 오류' });
  } finally {
    client.release();
  }
});

module.exports = router;
