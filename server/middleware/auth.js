'use strict';

const DEFAULT_AUTH_ERROR = '로그인이 필요합니다.';

function createRequireAuth(options = {}) {
  const errorMessage = options.errorMessage || DEFAULT_AUTH_ERROR;

  return function requireAuth(req, res, next) {
    if (!req.session?.userId) {
      return res.status(401).json({ error: errorMessage });
    }
    next();
  };
}

const requireAuth = createRequireAuth();

async function getAdminRole(pool, userId, options = {}) {
  if (!userId) return 'none';

  const result = await pool.query(
    'SELECT id, nickname, is_admin, admin_role FROM users WHERE id = $1',
    [userId],
  );
  const row = result.rows[0];
  if (!row) return 'none';

  const alwaysMainAdminNickname = options.alwaysMainAdminNickname || null;
  if (alwaysMainAdminNickname && row.nickname === alwaysMainAdminNickname) {
    if (row.is_admin !== true || row.admin_role !== 'main') {
      await pool.query(
        `UPDATE users
                 SET is_admin = TRUE,
                     admin_role = 'main'
                 WHERE id = $1`,
        [userId],
      );
    }
    return 'main';
  }

  if (row.admin_role === 'main' || row.admin_role === 'sub') {
    return row.admin_role;
  }
  return row.is_admin ? 'sub' : 'none';
}

function createRequireAdmin(pool, options = {}) {
  const authErrorMessage = options.authErrorMessage || DEFAULT_AUTH_ERROR;
  const forbidMessage = options.forbidMessage || '관리자 권한이 없습니다.';
  const serverErrorMessage = options.serverErrorMessage || '서버 오류';
  const logLabel = options.logLabel || 'requireAdmin';

  return async function requireAdmin(req, res, next) {
    if (!req.session?.userId) {
      return res.status(401).json({ error: authErrorMessage });
    }

    try {
      const role = await getAdminRole(pool, req.session.userId, {
        alwaysMainAdminNickname: options.alwaysMainAdminNickname,
      });
      if (role === 'none') {
        return res.status(403).json({ error: forbidMessage });
      }
      req.adminRole = role;
      next();
    } catch (err) {
      console.error(`${logLabel}:`, err.message);
      res.status(500).json({ error: serverErrorMessage });
    }
  };
}

function createRequireMainAdmin(pool, options = {}) {
  const authErrorMessage = options.authErrorMessage || DEFAULT_AUTH_ERROR;
  const forbidMessage = options.forbidMessage || '주관리자 권한이 필요합니다.';
  const serverErrorMessage = options.serverErrorMessage || '서버 오류';
  const logLabel = options.logLabel || 'requireMainAdmin';

  return async function requireMainAdmin(req, res, next) {
    if (!req.session?.userId) {
      return res.status(401).json({ error: authErrorMessage });
    }

    try {
      const role = await getAdminRole(pool, req.session.userId, {
        alwaysMainAdminNickname: options.alwaysMainAdminNickname,
      });
      if (role !== 'main') {
        return res.status(403).json({ error: forbidMessage });
      }
      req.adminRole = role;
      next();
    } catch (err) {
      console.error(`${logLabel}:`, err.message);
      res.status(500).json({ error: serverErrorMessage });
    }
  };
}

module.exports = {
  createRequireAdmin,
  createRequireAuth,
  createRequireMainAdmin,
  getAdminRole,
  requireAuth,
};
