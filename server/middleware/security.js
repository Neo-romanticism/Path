const session = require('express-session');
const pgSession = require('connect-pg-simple')(session);
const cors = require('cors');
const compression = require('compression');
const helmet = require('helmet');
const crypto = require('crypto');

const isProduction = process.env.NODE_ENV === 'production';

const allowedOrigins = (process.env.CORS_ORIGIN || '')
  .split(',')
  .map((origin) => origin.trim())
  .filter(Boolean);

if (isProduction && allowedOrigins.length === 0) {
  console.warn(
    '[WARNING] CORS_ORIGIN 환경변수가 설정되지 않았습니다. 프로덕션에서 모든 cross-origin 요청이 차단됩니다.',
  );
  console.warn('[WARNING] 예시: CORS_ORIGIN=https://path.sdij.cloud,https://www.path.sdij.cloud');
}

function corsOriginHandler(origin, callback) {
  if (!origin) return callback(null, true);
  if (allowedOrigins.length === 0) {
    return callback(null, !isProduction);
  }
  return callback(null, allowedOrigins.includes(origin));
}

function isSecureRequest(req) {
  if (req.secure) return true;

  const cfVisitor = req.headers['cf-visitor'];
  if (typeof cfVisitor === 'string') {
    try {
      const parsed = JSON.parse(cfVisitor);
      if (parsed && String(parsed.scheme || '').toLowerCase() === 'https') return true;
    } catch {
      if (cfVisitor.toLowerCase().includes('https')) return true;
    }
  }

  const forwardedSsl = req.headers['x-forwarded-ssl'];
  if (typeof forwardedSsl === 'string' && forwardedSsl.toLowerCase() === 'on') return true;

  const forwardedPort = req.headers['x-forwarded-port'];
  if (typeof forwardedPort === 'string' && forwardedPort.split(',').some((p) => p.trim() === '443'))
    return true;

  const forwardedProto = req.headers['x-forwarded-proto'];
  if (!forwardedProto || typeof forwardedProto !== 'string') return false;
  return forwardedProto
    .split(',')
    .map((proto) => proto.trim().toLowerCase())
    .includes('https');
}

// Emergency-safe default: disable app-level HTTPS redirect.
// TLS enforcement should be handled by Cloudflare/edge to avoid proxy loop risk.
const forceHttps = false;

function setupSecurity(app, pool) {
  app.set('trust proxy', true);

  const cspConnectSrc = isProduction
    ? ["'self'", 'wss:', 'https:']
    : ["'self'", 'wss:', 'ws:', 'https:'];

  app.use(
    helmet({
      contentSecurityPolicy: {
        directives: {
          defaultSrc: ["'self'"],
          scriptSrc: [
            "'self'",
            "'unsafe-inline'",
            'https://cdn.jsdelivr.net',
            'https://cdn.socket.io',
            'https://unpkg.com',
          ],
          styleSrc: [
            "'self'",
            "'unsafe-inline'",
            'https://cdn.jsdelivr.net',
            'https://fonts.googleapis.com',
          ],
          fontSrc: ["'self'", 'https://fonts.gstatic.com', 'https://cdn.jsdelivr.net'],
          imgSrc: ["'self'", 'data:', 'https:', 'blob:'],
          connectSrc: cspConnectSrc,
          workerSrc: ["'self'"],
          frameSrc: ["'none'"],
          objectSrc: ["'none'"],
          upgradeInsecureRequests: isProduction ? [] : null,
        },
      },
      crossOriginEmbedderPolicy: false,
      hsts: isProduction
        ? {
            maxAge: 31536000,
            includeSubDomains: true,
            preload: true,
          }
        : false,
    }),
  );
  app.use(compression());
  app.use(express.json());
  app.use(express.urlencoded({ extended: true }));
  app.use(
    cors({
      origin: corsOriginHandler,
      credentials: true,
    }),
  );

  // HTTPS redirect
  app.use((req, res, next) => {
    if (!forceHttps) return next();
    if (isSecureRequest(req)) return next();

    if (req.method === 'GET' || req.method === 'HEAD') {
      const host = req.get('host');
      if (host) return res.redirect(308, `https://${host}${req.originalUrl}`);
    }

    return res.status(400).json({ error: 'HTTPS 요청만 허용됩니다.' });
  });

  // Session
  app.use(
    session({
      store: new pgSession({ pool, tableName: 'sessions' }),
      secret:
        process.env.SESSION_SECRET ||
        (isProduction ? undefined : crypto.randomBytes(32).toString('hex')),
      resave: false,
      saveUninitialized: false,
      cookie: {
        maxAge: 30 * 24 * 60 * 60 * 1000,
        httpOnly: true,
        secure: isProduction,
        sameSite: process.env.SESSION_SAME_SITE || 'lax',
        domain: process.env.SESSION_COOKIE_DOMAIN || undefined,
      },
    }),
  );

  // CSRF protection
  app.use((req, res, next) => {
    if (!['POST', 'PUT', 'PATCH', 'DELETE'].includes(req.method)) return next();
    if (!req.path.startsWith('/api/')) return next();
    if (req.path === '/api/auth/apple/callback') return next();

    const origin = req.headers['origin'];
    const referer = req.headers['referer'];
    const host = req.get('host');

    if (origin) {
      try {
        const originHost = new URL(origin).host;
        if (originHost === host || allowedOrigins.some((o) => new URL(o).host === originHost)) {
          return next();
        }
      } catch {
        /* invalid origin URL */
      }
      if (!isProduction) return next();
      return res.status(403).json({ error: '잘못된 요청 출처입니다.' });
    }

    if (referer) {
      try {
        const refHost = new URL(referer).host;
        if (refHost === host || allowedOrigins.some((o) => new URL(o).host === refHost)) {
          return next();
        }
      } catch {
        /* invalid referer URL */
      }
      if (!isProduction) return next();
      return res.status(403).json({ error: '잘못된 요청 출처입니다.' });
    }

    if (!isProduction) return next();
    return res.status(403).json({ error: '잘못된 요청 출처입니다.' });
  });
}

// express is needed inside setupSecurity for body parsers
const express = require('express');

module.exports = { setupSecurity, corsOriginHandler };
