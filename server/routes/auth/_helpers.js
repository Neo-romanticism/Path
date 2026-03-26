const pool = require('../../db');
const { requireAuth } = require('../../middleware/auth');
const { getPercentile } = require('../../data/universities');
const { getActiveStreakFromUser, formatDisplayName } = require('../../utils/progression');
const { validateNickname } = require('../../utils/validateNickname');
const { ALWAYS_MAIN_ADMIN_NICKNAME } = require('../../utils/constants');
const { EULA_VERSION } = require('../../utils/eulaVersion');

const EULA_TITLE = 'P.A.T.H 서비스 이용약관';
const EULA_SUMMARY = [
  '1) 본 서비스는 학습 기록/커뮤니티 기능을 제공하며, 이용자는 관련 법령과 약관을 준수해야 합니다.',
  '2) 혐오, 성적, 폭력, 불법 정보, 개인정보 노출, 도배/광고 등 유해 게시물은 제한될 수 있습니다.',
  '3) 이용자는 자신의 계정 활동에 대한 책임이 있으며, 위반 시 게시물 삭제/서비스 이용 제한이 가능합니다.',
  '4) 신고된 콘텐츠는 운영 정책에 따라 검토되며, 필요 시 법적 의무에 따라 조치될 수 있습니다.',
  '5) 본 약관 동의가 없으면 커뮤니티 작성/상호작용 등 주요 기능 이용이 제한될 수 있습니다.',
].join('\n');

const USER_FIELDS =
  'id, nickname, university, gold, diamond, exp, tier, tickets, is_studying, real_name, is_n_su, prev_university, score_status, score_image_url, gpa_score, gpa_status, gpa_image_url, gpa_public, profile_image_url, status_emoji, status_message, phone_verified, phone_verified_at, auth_provider, google_email, apple_email, is_admin, admin_role, active_title, streak_count, streak_last_date, eula_version, eula_agreed_at, ui_theme, owned_themes, user_code, allow_friend_requests';

function addPercentile(user) {
  if (!user) return user;
  user.percentile = getPercentile(user.university);
  user.active_streak = getActiveStreakFromUser(user);
  user.display_nickname = formatDisplayName(user.nickname, user.active_title);
  return user;
}

function setPrivateNoStore(res) {
  res.setHeader('Cache-Control', 'no-store, private, max-age=0, must-revalidate');
  res.setHeader('Pragma', 'no-cache');
  res.setHeader('Expires', '0');
}

async function enforceAlwaysMainAdminByNickname(userId) {
  const result = await pool.query(
    'SELECT id, nickname, is_admin, admin_role FROM users WHERE id = $1',
    [userId],
  );
  const user = result.rows[0];
  if (!user) return null;

  if (user.nickname !== ALWAYS_MAIN_ADMIN_NICKNAME) return user;

  if (user.is_admin === true && user.admin_role === 'main') return user;

  await pool.query(
    `UPDATE users
         SET is_admin = TRUE,
             admin_role = 'main'
         WHERE id = $1`,
    [user.id],
  );

  return {
    ...user,
    is_admin: true,
    admin_role: 'main',
  };
}

async function ensureUserCode(userId) {
  const existing = await pool.query('SELECT user_code FROM users WHERE id = $1', [userId]);
  if (!existing.rows.length) return null;
  if (existing.rows[0].user_code) return existing.rows[0].user_code;

  const nextCode = `PATH-${String(userId).padStart(6, '0')}`;
  const updated = await pool.query(
    `UPDATE users
         SET user_code = $2
         WHERE id = $1
         RETURNING user_code`,
    [userId, nextCode],
  );
  return updated.rows[0]?.user_code || nextCode;
}

async function isPrivilegedAdmin(userId) {
  const result = await pool.query('SELECT is_admin, admin_role FROM users WHERE id = $1', [userId]);
  const row = result.rows[0];
  if (!row) return false;
  return row.is_admin === true || row.admin_role === 'main' || row.admin_role === 'sub';
}

module.exports = {
  pool,
  requireAuth,
  validateNickname,
  USER_FIELDS,
  EULA_VERSION,
  EULA_TITLE,
  EULA_SUMMARY,
  addPercentile,
  setPrivateNoStore,
  enforceAlwaysMainAdminByNickname,
  ensureUserCode,
  isPrivilegedAdmin,
};
