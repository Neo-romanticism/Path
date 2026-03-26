const pool = require('../../db');
const multer = require('multer');
const path = require('path');
const { getAdminRole, requireAuth, createRequireAdmin } = require('../../middleware/auth');
const { formatDisplayName } = require('../../utils/progression');
const { getUploadDir } = require('../../utils/uploadRoot');
const { EULA_VERSION } = require('../../utils/eulaVersion');

const BEST_MIN_LIKES = 15;
const GOLD_LIKE_COST = 30;
const REPORT_REASON_CODES = new Set([
  'spam',
  'abuse',
  'sexual',
  'hate',
  'personal_info',
  'illegal',
  'other',
]);

const communityUploadDir = getUploadDir('community');

const imageUpload = multer({
  storage: multer.diskStorage({
    destination: (_req, _file, cb) => cb(null, communityUploadDir),
    filename: (req, file, cb) => {
      const userId = req.session?.userId || 'guest';
      const ext = (path.extname(file.originalname || '') || '.jpg').toLowerCase();
      const safeExt = /^\.[a-z0-9]{1,8}$/i.test(ext) ? ext : '.jpg';
      const suffix = `${Date.now()}-${Math.round(Math.random() * 1e9)}`;
      cb(null, `community_${userId}_${suffix}${safeExt}`);
    },
  }),
  limits: {
    fileSize: 8 * 1024 * 1024,
  },
  fileFilter: (_req, file, cb) => {
    if (typeof file.mimetype === 'string' && file.mimetype.startsWith('image/')) {
      cb(null, true);
      return;
    }
    cb(new Error('이미지 파일만 업로드할 수 있습니다.'));
  },
});

const requireAdmin = createRequireAdmin(pool, {
  logLabel: '[community] requireAdmin',
  serverErrorMessage: '서버 오류가 발생했습니다.',
});

function normalizeCommunityNickname(raw) {
  const fallback = '익명';
  if (typeof raw !== 'string') return fallback;
  const trimmed = raw.trim();
  if (!trimmed) return fallback;
  if (trimmed.length < 2 || trimmed.length > 20) return null;
  return trimmed;
}

function normalizeProfileImageUrl(raw) {
  if (typeof raw !== 'string') return '';
  const trimmed = raw.trim();
  if (!trimmed) return '';
  if (/^\/uploads\/profiles\/[a-zA-Z0-9._-]+$/.test(trimmed)) return trimmed;
  return '';
}

async function requireLatestEula(req, res, next) {
  if (!req.session.userId) return res.status(401).json({ error: '로그인이 필요합니다.' });

  try {
    const result = await pool.query(
      'SELECT eula_version, eula_agreed_at FROM users WHERE id = $1',
      [req.session.userId],
    );
    const row = result.rows[0];
    if (!row) return res.status(401).json({ error: '사용자를 찾을 수 없습니다.' });

    const agreed = !!row.eula_agreed_at && row.eula_version === EULA_VERSION;
    if (!agreed) {
      return res.status(403).json({
        error: '최신 이용약관 동의가 필요합니다.',
        code: 'EULA_REQUIRED',
        eula_version: EULA_VERSION,
      });
    }

    return next();
  } catch (err) {
    console.error('[community] requireLatestEula', err.message);
    return res.status(500).json({ error: '서버 오류가 발생했습니다.' });
  }
}

async function requireLatestEulaIfAuthenticated(req, res, next) {
  if (!req.session.userId) return next();
  return requireLatestEula(req, res, next);
}

function makeBlockedPostCondition(userId, placeholderIndex, tableAlias = 'p') {
  if (!userId) return { sql: '', params: [] };
  return {
    sql: `(${tableAlias}.user_id IS NULL OR NOT EXISTS (
            SELECT 1
            FROM user_blocks ub
            WHERE ub.blocker_id = $${placeholderIndex}
              AND ub.blocked_id = ${tableAlias}.user_id
        ))`,
    params: [userId],
  };
}

/* ── IP prefix helper ───────────────────────────────────────── */
function getIpPrefix(req) {
  const raw = (req.headers['x-forwarded-for'] || '').split(',')[0].trim() || req.ip || '0.0.0.0';
  const clean = raw.replace(/^::ffff:/, '');
  const parts = clean.split('.');
  if (parts.length >= 2) return `${parts[0]}.${parts[1]}`;
  // IPv6: 앞 두 그룹만
  return clean.split(':').slice(0, 2).join(':') || '?';
}

/* ── 유효 카테고리 ──────────────────────────────────────────── */
const VALID_CATS = new Set(['념글', '정보', '질문', '잡담']);
const WRITABLE_CATS = new Set(['정보', '질문', '잡담']);

module.exports = {
  pool,
  requireAuth,
  getAdminRole,
  formatDisplayName,
  imageUpload,
  requireAdmin,
  normalizeCommunityNickname,
  normalizeProfileImageUrl,
  requireLatestEula,
  requireLatestEulaIfAuthenticated,
  makeBlockedPostCondition,
  getIpPrefix,
  VALID_CATS,
  WRITABLE_CATS,
  BEST_MIN_LIKES,
  GOLD_LIKE_COST,
  REPORT_REASON_CODES,
};
