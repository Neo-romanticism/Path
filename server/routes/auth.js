const express = require('express');
const rateLimit = require('express-rate-limit');
const router = express.Router();
const {
  pool,
  requireAuth,
  EULA_VERSION,
  EULA_TITLE,
  EULA_SUMMARY,
  isPrivilegedAdmin,
} = require('./auth/_helpers');
const {
  normalizeDomain,
  isValidDomain,
  parseUniversityDomainText,
} = require('../utils/schoolEmailDomain');

// ── Sub-routers ─────────────────────────────────────────────────────────────
router.use(require('./auth/coreAuth'));
router.use(require('./auth/oauth'));
router.use(require('./auth/imageUpload'));
router.use(require('./auth/userSettings'));

// ── EULA ────────────────────────────────────────────────────────────────────
router.get('/eula', (_req, res) => {
  res.json({
    version: EULA_VERSION,
    title: EULA_TITLE,
    content: EULA_SUMMARY,
  });
});

router.post('/eula/agree', requireAuth, async (req, res) => {
  const { version } = req.body || {};
  if (version && String(version) !== EULA_VERSION) {
    return res
      .status(400)
      .json({ error: '최신 약관 버전이 아닙니다. 화면을 새로고침 후 다시 시도해주세요.' });
  }

  try {
    const result = await pool.query(
      `UPDATE users
             SET eula_version = $1,
                 eula_agreed_at = NOW()
             WHERE id = $2
             RETURNING eula_version, eula_agreed_at`,
      [EULA_VERSION, req.session.userId],
    );
    if (!result.rows.length) {
      return res.status(404).json({ error: '유저를 찾을 수 없습니다.' });
    }

    return res.json({
      ok: true,
      eula_version: result.rows[0].eula_version,
      eula_agreed_at: result.rows[0].eula_agreed_at,
    });
  } catch (err) {
    console.error('eula agree error:', err);
    return res.status(500).json({ error: '서버 오류가 발생했습니다.' });
  }
});

// ── School email domain ─────────────────────────────────────────────────────
function extractDomainFromEmail(rawEmail) {
  const email = String(rawEmail || '')
    .trim()
    .toLowerCase();
  if (!/^[^@\s]+@[^@\s]+$/.test(email)) return '';
  return normalizeDomain(email.split('@')[1] || '');
}

router.get('/school-email-domain/check', async (req, res) => {
  const email = String(req.query.email || '').trim();
  if (!email) {
    return res.status(400).json({ error: '이메일을 입력해주세요.' });
  }

  const domain = extractDomainFromEmail(email);
  if (!domain || !isValidDomain(domain)) {
    return res.status(400).json({ error: '올바른 이메일 형식이 아닙니다.' });
  }

  try {
    const domainResult = await pool.query(
      'SELECT domain FROM school_email_domains WHERE domain = $1 AND is_active = TRUE LIMIT 1',
      [domain],
    );

    if (!domainResult.rows.length) {
      return res.json({
        ok: true,
        email,
        domain,
        allowed: false,
        universities: [],
      });
    }

    const uniResult = await pool.query(
      `SELECT university_name
             FROM school_email_domain_universities
             WHERE domain = $1
             ORDER BY university_name ASC`,
      [domain],
    );

    return res.json({
      ok: true,
      email,
      domain,
      allowed: true,
      universities: uniResult.rows.map((row) => row.university_name),
    });
  } catch (err) {
    console.error('school-email-domain/check error:', err);
    return res.status(500).json({ error: '도메인 확인 중 오류가 발생했습니다.' });
  }
});

router.post('/school-email-domain/import', requireAuth, async (req, res) => {
  const isAdmin = await isPrivilegedAdmin(req.session.userId);
  if (!isAdmin) {
    return res.status(403).json({ error: '관리자만 접근할 수 있습니다.' });
  }

  const rawText = String(req.body?.rawText || '');
  if (!rawText.trim()) {
    return res.status(400).json({ error: 'rawText를 입력해주세요.' });
  }

  const { entries, invalidLines, stats } = parseUniversityDomainText(rawText);
  if (!entries.length) {
    return res.status(400).json({
      error: '유효한 학교/도메인 데이터가 없습니다.',
      invalidLines: invalidLines.slice(0, 20),
    });
  }

  const domains = [...new Set(entries.map((entry) => entry.domain))];
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    let insertedDomains = 0;
    for (const domain of domains) {
      const result = await client.query(
        `INSERT INTO school_email_domains (domain, is_active, source)
                 VALUES ($1, TRUE, 'admin-api')
                 ON CONFLICT (domain) DO NOTHING`,
        [domain],
      );
      insertedDomains += result.rowCount;
    }

    let insertedMappings = 0;
    for (const entry of entries) {
      const result = await client.query(
        `INSERT INTO school_email_domain_universities (domain, university_name)
                 VALUES ($1, $2)
                 ON CONFLICT (domain, university_name) DO NOTHING`,
        [entry.domain, entry.universityName],
      );
      insertedMappings += result.rowCount;
    }

    await client.query('COMMIT');

    return res.json({
      ok: true,
      parsed: stats,
      insertedDomains,
      insertedMappings,
      ignoredDuplicates: stats.validEntries - insertedMappings,
      invalidLines: invalidLines.slice(0, 20),
    });
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('school-email-domain/import error:', err);
    return res.status(500).json({ error: '도메인 가져오기 중 오류가 발생했습니다.' });
  } finally {
    client.release();
  }
});

// ── Deprecated phone verification stubs ─────────────────────────────────────
const verificationLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 5,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: '인증번호 요청이 너무 많습니다. 1시간 후 다시 시도해주세요.' },
});

router.post('/send-verification', verificationLimiter, async (req, res) => {
  return res.status(410).json({
    error: '휴대폰 인증 기능이 종료되었습니다.',
  });
});

router.post('/verify-phone', async (req, res) => {
  return res.status(410).json({
    error: '휴대폰 인증 기능이 종료되었습니다.',
  });
});

router.get('/verification-status', (req, res) => {
  res.json({
    verified: false,
    expiresIn: 0,
    phone: null,
    disabled: true,
  });
});

// ── Password recovery ───────────────────────────────────────────────────────
function maskEmail(email) {
  const value = String(email || '').trim();
  const atIndex = value.indexOf('@');
  if (atIndex <= 1) return null;
  const local = value.slice(0, atIndex);
  const domain = value.slice(atIndex + 1);
  if (!domain) return null;
  const maskedLocal = `${local[0]}${'*'.repeat(Math.max(1, local.length - 2))}${local[local.length - 1]}`;
  return `${maskedLocal}@${domain}`;
}

const recoverySendLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 5,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: '복구 인증번호 요청이 너무 많습니다. 잠시 후 다시 시도해주세요.' },
});

const recoveryResetLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: '비밀번호 재설정 시도가 너무 많습니다. 잠시 후 다시 시도해주세요.' },
});

router.get('/password-recovery/options', async (req, res) => {
  const nickname = String(req.query.nickname || '').trim();
  if (!nickname) {
    return res.json({
      ok: true,
      hasGoogleRecovery: false,
      maskedGoogleEmail: null,
      hasAppleRecovery: false,
      maskedAppleEmail: null,
    });
  }

  try {
    const result = await pool.query(
      'SELECT google_email, apple_email FROM users WHERE nickname = $1 LIMIT 1',
      [nickname],
    );

    if (!result.rows.length) {
      return res.json({
        ok: true,
        hasGoogleRecovery: false,
        maskedGoogleEmail: null,
        hasAppleRecovery: false,
        maskedAppleEmail: null,
      });
    }

    const row = result.rows[0];
    return res.json({
      ok: true,
      hasGoogleRecovery: !!row.google_email,
      maskedGoogleEmail: maskEmail(row.google_email),
      hasAppleRecovery: !!row.apple_email,
      maskedAppleEmail: maskEmail(row.apple_email),
    });
  } catch (err) {
    console.error('password-recovery/options error:', err);
    return res.status(500).json({ error: '복구 옵션 조회 중 오류가 발생했습니다.' });
  }
});

router.post('/password-recovery/send-code', recoverySendLimiter, async (req, res) => {
  return res.status(410).json({
    error: '휴대폰 비밀번호 복구 기능이 종료되었습니다. Google 또는 Apple 로그인으로 복구해주세요.',
  });
});

router.post('/password-recovery/reset', recoveryResetLimiter, async (req, res) => {
  return res.status(410).json({
    error: '휴대폰 비밀번호 복구 기능이 종료되었습니다. Google 또는 Apple 로그인으로 복구해주세요.',
  });
});

// ── Friend request setting ──────────────────────────────────────────────────
router.post('/friend-request-setting', requireAuth, async (req, res) => {
  const allow = req.body.allow_friend_requests;
  if (typeof allow !== 'boolean') {
    return res.status(400).json({ error: '잘못된 요청입니다.' });
  }
  try {
    await pool.query('UPDATE users SET allow_friend_requests = $1 WHERE id = $2', [
      allow,
      req.session.userId,
    ]);
    res.json({ ok: true, allow_friend_requests: allow });
  } catch (err) {
    console.error('friend-request-setting error:', err);
    res.status(500).json({ error: '서버 오류' });
  }
});

// ── User search ─────────────────────────────────────────────────────────────
router.get('/users/search', requireAuth, async (req, res) => {
  const q = String(req.query.q || '').trim();
  if (!q || q.length < 1) return res.json({ users: [] });
  if (q.length > 30) return res.status(400).json({ error: '검색어가 너무 깁니다.' });

  try {
    const result = await pool.query(
      `SELECT u.id, u.nickname, u.university, u.profile_image_url, u.is_studying,
                    u.allow_friend_requests,
                    f.status AS friendship_status,
                    CASE WHEN f.sender_id = $2 THEN 'sent'
                         WHEN f.receiver_id = $2 THEN 'received'
                         ELSE NULL END AS friendship_dir,
                    f.id AS friendship_id
             FROM users u
             LEFT JOIN friendships f ON (
                 (f.sender_id = u.id AND f.receiver_id = $2)
                 OR (f.sender_id = $2 AND f.receiver_id = u.id)
             )
             WHERE u.id != $2
               AND u.nickname ILIKE $1
             ORDER BY u.nickname ASC
             LIMIT 20`,
      [`%${q}%`, req.session.userId],
    );
    res.json({ users: result.rows });
  } catch (err) {
    console.error('users/search error:', err);
    res.status(500).json({ error: '서버 오류' });
  }
});

module.exports = router;
