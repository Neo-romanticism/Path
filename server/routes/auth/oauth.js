const express = require('express');
const bcrypt = require('bcryptjs');
const axios = require('axios');
const crypto = require('crypto');
const router = express.Router();
const {
  pool,
  USER_FIELDS,
  addPercentile,
  enforceAlwaysMainAdminByNickname,
  ensureUserCode,
} = require('./_helpers');

function makeOAuthState() {
  return crypto.randomBytes(24).toString('hex');
}

function appendQueryParam(url, key, value) {
  if (!url) return url;
  const sep = url.includes('?') ? '&' : '?';
  return `${url}${sep}${encodeURIComponent(key)}=${encodeURIComponent(value)}`;
}

function resolveOauthPlatform(req) {
  const raw = String(req.query.platform || '').toLowerCase();
  return raw === 'app' ? 'app' : 'web';
}

function getRequestOrigin(req) {
  const forwardedProto = String(req.headers['x-forwarded-proto'] || '')
    .split(',')[0]
    .trim();
  const forwardedHost = String(req.headers['x-forwarded-host'] || '')
    .split(',')[0]
    .trim();
  const proto = forwardedProto || req.protocol;
  const host = forwardedHost || req.get('host');
  if (!proto || !host) return null;
  return `${proto}://${host}`;
}

function resolveGoogleRedirectUri(req, platform) {
  if (platform === 'app' && process.env.GOOGLE_REDIRECT_URI_APP) {
    return process.env.GOOGLE_REDIRECT_URI_APP;
  }

  if (platform === 'app') {
    const origin = getRequestOrigin(req);
    if (origin) return `${origin}/api/auth/google/callback`;
  }

  return process.env.GOOGLE_REDIRECT_URI;
}

function resolveGoogleSuccessRedirect(platform) {
  if (platform === 'app') {
    return process.env.GOOGLE_AUTH_SUCCESS_REDIRECT_APP || '/study-hub/';
  }
  return process.env.GOOGLE_AUTH_SUCCESS_REDIRECT || '/study-hub/';
}

function resolveGoogleErrorRedirect(platform) {
  if (platform === 'app') {
    return process.env.GOOGLE_AUTH_ERROR_REDIRECT_APP || '/login/?error=google_auth';
  }
  return process.env.GOOGLE_AUTH_ERROR_REDIRECT || '/login/?error=google_auth';
}

function resolveAppleRedirectUri(req, platform) {
  if (platform === 'app' && process.env.APPLE_REDIRECT_URI_APP) {
    return process.env.APPLE_REDIRECT_URI_APP;
  }

  if (platform === 'app') {
    const origin = getRequestOrigin(req);
    if (origin) return `${origin}/api/auth/apple/callback`;
  }

  return process.env.APPLE_REDIRECT_URI;
}

function resolveAppleSuccessRedirect(platform) {
  if (platform === 'app') {
    return process.env.APPLE_AUTH_SUCCESS_REDIRECT_APP || '/study-hub/';
  }
  return process.env.APPLE_AUTH_SUCCESS_REDIRECT || '/study-hub/';
}

function resolveAppleErrorRedirect(platform) {
  if (platform === 'app') {
    return process.env.APPLE_AUTH_ERROR_REDIRECT_APP || '/login/?error=apple_auth';
  }
  return process.env.APPLE_AUTH_ERROR_REDIRECT || '/login/?error=apple_auth';
}

function decodeJwtPayload(jwt) {
  const parts = String(jwt || '').split('.');
  if (parts.length < 2) return null;

  try {
    const payload = parts[1].replace(/-/g, '+').replace(/_/g, '/');
    const padded = payload.padEnd(Math.ceil(payload.length / 4) * 4, '=');
    const decoded = Buffer.from(padded, 'base64').toString('utf8');
    return JSON.parse(decoded);
  } catch {
    return null;
  }
}

function slugifyNickname(source) {
  const safe = (source || 'user').toLowerCase().replace(/[^a-z0-9가-힣_]/g, '');
  return safe.slice(0, 18) || 'user';
}

async function makeUniqueNickname(base) {
  const root = slugifyNickname(base);
  for (let i = 0; i < 10; i += 1) {
    const suffix = i === 0 ? '' : String(Math.floor(Math.random() * 10000)).padStart(4, '0');
    const candidate = `${root}${suffix}`.slice(0, 20);
    const exists = await pool.query('SELECT id FROM users WHERE nickname = $1', [candidate]);
    if (exists.rows.length === 0) return candidate;
  }
  return `user${Date.now().toString().slice(-8)}`;
}

// ===== Google OAuth =====

router.get('/google', (req, res) => {
  const clientId = process.env.GOOGLE_CLIENT_ID;
  const platform = resolveOauthPlatform(req);
  const redirectUri = resolveGoogleRedirectUri(req, platform);

  if (!clientId || !redirectUri) {
    return res.status(500).json({ error: 'Google OAuth 설정이 누락되었습니다.' });
  }

  const state = makeOAuthState();
  req.session.googleOAuth = { state, platform };
  req.session.googleOAuthState = state;

  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: redirectUri,
    response_type: 'code',
    scope: 'openid email profile',
    state,
    prompt: 'select_account',
  });

  res.redirect(`https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`);
});

router.get('/google/callback', async (req, res) => {
  const { code, state } = req.query;
  const oauthContext = req.session.googleOAuth || {};
  const platform = oauthContext.platform === 'app' ? 'app' : 'web';
  const expectedState = oauthContext.state || req.session.googleOAuthState;
  const clientId = process.env.GOOGLE_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
  const redirectUri = resolveGoogleRedirectUri(req, platform);
  const successRedirect = resolveGoogleSuccessRedirect(platform);
  const errorRedirect = resolveGoogleErrorRedirect(platform);

  function clearOauthState() {
    req.session.googleOAuth = null;
    req.session.googleOAuthState = null;
  }

  if (!code || !state || !expectedState || state !== expectedState) {
    clearOauthState();
    return res.redirect(errorRedirect);
  }

  if (!clientId || !clientSecret || !redirectUri) {
    clearOauthState();
    return res.redirect(appendQueryParam(errorRedirect, 'reason', 'missing_config'));
  }

  try {
    const tokenRes = await axios.post(
      'https://oauth2.googleapis.com/token',
      new URLSearchParams({
        code: String(code),
        client_id: clientId,
        client_secret: clientSecret,
        redirect_uri: redirectUri,
        grant_type: 'authorization_code',
      }),
      {
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      },
    );

    const tokenJson = tokenRes.data;
    const accessToken = tokenJson.access_token;
    if (!accessToken) throw new Error('missing access token');

    const userRes = await axios.get('https://openidconnect.googleapis.com/v1/userinfo', {
      headers: { Authorization: `Bearer ${accessToken}` },
    });

    const profile = userRes.data;
    const googleId = profile.sub;
    const email = profile.email || null;
    const name = profile.name || 'Google User';

    if (!googleId) throw new Error('missing google subject');

    let userQuery = await pool.query(`SELECT ${USER_FIELDS} FROM users WHERE google_id = $1`, [
      googleId,
    ]);

    if (userQuery.rows.length === 0 && email) {
      userQuery = await pool.query(`SELECT ${USER_FIELDS} FROM users WHERE google_email = $1`, [
        email,
      ]);
    }

    let user;
    if (userQuery.rows.length > 0) {
      user = userQuery.rows[0];
      await pool.query(
        `UPDATE users SET google_id = COALESCE(google_id, $1), google_email = COALESCE(google_email, $2), auth_provider = 'google' WHERE id = $3`,
        [googleId, email, user.id],
      );

      clearOauthState();
      req.session.userId = user.id;
      return res.redirect(successRedirect);
    } else {
      const nickname = await makeUniqueNickname((email || name).split('@')[0]);
      const randomPasswordHash = await bcrypt.hash(crypto.randomUUID(), 10);

      const created = await pool.query(
        `INSERT INTO users (
                    nickname, password_hash, university, real_name, privacy_agreed,
                    is_n_su, prev_university, auth_provider, google_id, google_email
                ) VALUES ($1, $2, $3, $4, true, false, NULL, 'google', $5, $6)
                RETURNING ${USER_FIELDS}`,
        [nickname, randomPasswordHash, null, name, googleId, email],
      );
      user = created.rows[0];

      clearOauthState();
      req.session.userId = user.id;
      if (platform === 'app' && process.env.GOOGLE_AUTH_SETUP_REDIRECT_APP) {
        return res.redirect(process.env.GOOGLE_AUTH_SETUP_REDIRECT_APP);
      }
      return res.redirect('/setup-profile/');
    }
  } catch (err) {
    console.error('google callback error:', err);
    clearOauthState();
    return res.redirect(appendQueryParam(errorRedirect, 'reason', 'oauth_failed'));
  }
});

// ===== Apple OAuth =====

router.get('/apple', (req, res) => {
  const clientId = process.env.APPLE_CLIENT_ID;
  const platform = resolveOauthPlatform(req);
  const redirectUri = resolveAppleRedirectUri(req, platform);

  if (!clientId || !redirectUri) {
    return res.status(500).json({ error: 'Apple OAuth 설정이 누락되었습니다.' });
  }

  const state = makeOAuthState();
  req.session.appleOAuth = { state, platform };

  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: redirectUri,
    response_type: 'code',
    response_mode: 'form_post',
    scope: 'name email',
    state,
  });

  return res.redirect(`https://appleid.apple.com/auth/authorize?${params.toString()}`);
});

async function handleAppleCallback(req, res) {
  const source = req.method === 'POST' ? req.body : req.query;
  const { code, state } = source || {};
  const oauthContext = req.session.appleOAuth || {};
  const platform = oauthContext.platform === 'app' ? 'app' : 'web';
  const expectedState = oauthContext.state;

  const clientId = process.env.APPLE_CLIENT_ID;
  const clientSecret = process.env.APPLE_CLIENT_SECRET;
  const redirectUri = resolveAppleRedirectUri(req, platform);
  const successRedirect = resolveAppleSuccessRedirect(platform);
  const errorRedirect = resolveAppleErrorRedirect(platform);

  function clearOauthState() {
    req.session.appleOAuth = null;
  }

  if (!code || !state || !expectedState || state !== expectedState) {
    let reason = 'invalid_state';
    if (!code) reason = 'missing_code';
    else if (!state) reason = 'missing_state';
    else if (!expectedState) reason = 'missing_session_state';
    else if (state !== expectedState) reason = 'state_mismatch';

    console.warn('apple callback precheck failed:', {
      reason,
      method: req.method,
      hasCode: !!code,
      hasState: !!state,
      hasExpectedState: !!expectedState,
      platform,
    });
    clearOauthState();
    return res.redirect(appendQueryParam(errorRedirect, 'reason', reason));
  }

  if (!clientId || !clientSecret || !redirectUri) {
    clearOauthState();
    return res.redirect(appendQueryParam(errorRedirect, 'reason', 'missing_config'));
  }

  try {
    const tokenRes = await axios.post(
      'https://appleid.apple.com/auth/token',
      new URLSearchParams({
        code: String(code),
        client_id: clientId,
        client_secret: clientSecret,
        grant_type: 'authorization_code',
        redirect_uri: redirectUri,
      }),
      {
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      },
    );

    const tokenJson = tokenRes.data || {};
    const idToken = tokenJson.id_token;
    const claims = decodeJwtPayload(idToken);
    const appleId = claims?.sub || null;
    const email = claims?.email || null;
    const issuer = claims?.iss;
    const audience = claims?.aud;

    if (!appleId) throw new Error('missing apple subject');
    if (issuer && issuer !== 'https://appleid.apple.com') throw new Error('invalid apple issuer');
    if (audience && audience !== clientId) throw new Error('invalid apple audience');

    let userQuery = await pool.query(`SELECT ${USER_FIELDS} FROM users WHERE apple_id = $1`, [
      appleId,
    ]);

    if (userQuery.rows.length === 0 && email) {
      userQuery = await pool.query(
        `SELECT ${USER_FIELDS} FROM users WHERE apple_email = $1 OR google_email = $1`,
        [email],
      );
    }

    let user;
    if (userQuery.rows.length > 0) {
      user = userQuery.rows[0];
      await pool.query(
        `UPDATE users
                 SET apple_id = COALESCE(apple_id, $1),
                     apple_email = COALESCE(apple_email, $2),
                     auth_provider = CASE WHEN auth_provider = 'local' THEN 'apple' ELSE auth_provider END
                 WHERE id = $3`,
        [appleId, email, user.id],
      );

      clearOauthState();
      req.session.userId = user.id;
      return res.redirect(successRedirect);
    }

    const nickname = await makeUniqueNickname((email || 'apple_user').split('@')[0]);
    const randomPasswordHash = await bcrypt.hash(crypto.randomUUID(), 10);
    const created = await pool.query(
      `INSERT INTO users (
                nickname, password_hash, university, real_name, privacy_agreed,
                is_n_su, prev_university, auth_provider, apple_id, apple_email
            ) VALUES ($1, $2, $3, $4, true, false, NULL, 'apple', $5, $6)
            RETURNING ${USER_FIELDS}`,
      [nickname, randomPasswordHash, null, 'Apple User', appleId, email],
    );

    user = created.rows[0];
    clearOauthState();
    req.session.userId = user.id;
    if (platform === 'app' && process.env.APPLE_AUTH_SETUP_REDIRECT_APP) {
      return res.redirect(process.env.APPLE_AUTH_SETUP_REDIRECT_APP);
    }
    return res.redirect('/setup-profile/');
  } catch (err) {
    console.error('apple callback error:', err);
    clearOauthState();
    return res.redirect(appendQueryParam(errorRedirect, 'reason', 'oauth_failed'));
  }
}

router.get('/apple/callback', handleAppleCallback);
router.post('/apple/callback', handleAppleCallback);

module.exports = router;
