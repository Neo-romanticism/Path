const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const router = express.Router();
const { pool, requireAuth, setPrivateNoStore, isPrivilegedAdmin } = require('./_helpers');
const { getUploadDir } = require('../../utils/uploadRoot');

async function ownsImagePath(userId, columnName, imagePath) {
  const allowedColumns = new Set(['score_image_url', 'gpa_image_url', 'profile_image_url']);
  if (!allowedColumns.has(columnName)) return false;

  const result = await pool.query(
    `SELECT 1
                     FROM users
                    WHERE id = $1
                        AND ${columnName} = $2
                    LIMIT 1`,
    [userId, imagePath],
  );

  return result.rows.length > 0;
}

const scoreStorage = multer.diskStorage({
  destination: (req, file, cb) => {
    const dir = getUploadDir('scores');
    cb(null, dir);
  },
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname) || '.jpg';
    cb(null, `score_${req.session.userId}_${Date.now()}${ext}`);
  },
});

const gpaStorage = multer.diskStorage({
  destination: (req, file, cb) => {
    const dir = getUploadDir('gpa');
    cb(null, dir);
  },
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname) || '.jpg';
    cb(null, `gpa_${req.session.userId}_${Date.now()}${ext}`);
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

const SCORE_IMAGE_MAX_SIZE = 15 * 1024 * 1024;
const GPA_IMAGE_MAX_SIZE = 15 * 1024 * 1024;

const upload = multer({
  storage: scoreStorage,
  limits: { fileSize: SCORE_IMAGE_MAX_SIZE },
  fileFilter: imageFilter,
});
const uploadGpa = multer({
  storage: gpaStorage,
  limits: { fileSize: GPA_IMAGE_MAX_SIZE },
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

router.post('/upload-score', requireAuth, (req, res) => {
  upload.single('scoreImage')(req, res, async (err) => {
    if (err) return sendMulterUploadError(res, err, SCORE_IMAGE_MAX_SIZE);
    if (!req.file) return res.status(400).json({ error: '이미지 파일을 선택해주세요.' });

    try {
      const imageUrl = `/uploads/scores/${req.file.filename}`;
      await pool.query(
        `UPDATE users SET score_image_url = $1, score_status = 'pending' WHERE id = $2`,
        [imageUrl, req.session.userId],
      );
      res.json({ ok: true, message: '점수 이미지가 업로드되었습니다. 관리자 승인 후 반영됩니다.' });
    } catch (dbErr) {
      console.error('upload-score error:', dbErr);
      res.status(500).json({ error: '서버 오류가 발생했습니다.' });
    }
  });
});

router.get('/score-image/:filename', requireAuth, async (req, res) => {
  const isAdmin = await isPrivilegedAdmin(req.session.userId);
  const filename = path.basename(req.params.filename);
  const imagePath = `/uploads/scores/${filename}`;

  if (!isAdmin) {
    const isOwner = await ownsImagePath(req.session.userId, 'score_image_url', imagePath);
    if (!isOwner) {
      return res.status(403).json({ error: '접근 권한이 없습니다.' });
    }
  }

  const filePath = path.join(getUploadDir('scores'), filename);
  if (!fs.existsSync(filePath)) return res.status(404).json({ error: '파일을 찾을 수 없습니다.' });
  setPrivateNoStore(res);
  res.sendFile(filePath);
});

router.post('/upload-gpa', requireAuth, (req, res) => {
  uploadGpa.single('gpaImage')(req, res, async (err) => {
    if (err) return sendMulterUploadError(res, err, GPA_IMAGE_MAX_SIZE);
    if (!req.file) return res.status(400).json({ error: '이미지 파일을 선택해주세요.' });

    try {
      const imageUrl = `/uploads/gpa/${req.file.filename}`;
      await pool.query(
        `UPDATE users SET gpa_image_url = $1, gpa_status = 'pending' WHERE id = $2`,
        [imageUrl, req.session.userId],
      );
      res.json({
        ok: true,
        message: '내신 성적 이미지가 업로드되었습니다. 관리자 승인 후 반영됩니다.',
      });
    } catch (dbErr) {
      console.error('upload-gpa error:', dbErr);
      res.status(500).json({ error: '서버 오류가 발생했습니다.' });
    }
  });
});

router.post('/toggle-gpa-public', requireAuth, async (req, res) => {
  try {
    const result = await pool.query(
      `UPDATE users SET gpa_public = NOT gpa_public WHERE id = $1 RETURNING gpa_public`,
      [req.session.userId],
    );
    res.json({ ok: true, gpa_public: result.rows[0].gpa_public });
  } catch (err) {
    console.error('toggle-gpa error:', err);
    res.status(500).json({ error: '서버 오류가 발생했습니다.' });
  }
});

router.get('/gpa-image/:filename', requireAuth, async (req, res) => {
  const isAdmin = await isPrivilegedAdmin(req.session.userId);
  const filename = path.basename(req.params.filename);
  const imagePath = `/uploads/gpa/${filename}`;

  if (!isAdmin) {
    const isOwner = await ownsImagePath(req.session.userId, 'gpa_image_url', imagePath);
    if (!isOwner) {
      return res.status(403).json({ error: '접근 권한이 없습니다.' });
    }
  }

  const filePath = path.join(getUploadDir('gpa'), filename);
  if (!fs.existsSync(filePath)) return res.status(404).json({ error: '파일을 찾을 수 없습니다.' });
  setPrivateNoStore(res);
  res.sendFile(filePath);
});

router.get('/profile-image/:filename', requireAuth, async (req, res) => {
  const isAdmin = await isPrivilegedAdmin(req.session.userId);
  const filename = path.basename(req.params.filename);
  const imagePath = `/uploads/profiles/${filename}`;

  if (!isAdmin) {
    const isOwner = await ownsImagePath(req.session.userId, 'profile_image_url', imagePath);
    if (!isOwner) {
      return res.status(403).json({ error: '접근 권한이 없습니다.' });
    }
  }

  const filePath = path.join(getUploadDir('profiles'), filename);
  if (!fs.existsSync(filePath)) return res.status(404).json({ error: '파일을 찾을 수 없습니다.' });
  setPrivateNoStore(res);
  res.sendFile(filePath);
});

module.exports = router;
