const express = require('express');
const { createServer } = require('http');
const { Server: SocketServer } = require('socket.io');
const path = require('path');
const pool = require('./db');
const { initSchema } = require('./schema');
const { setupSecurity, corsOriginHandler } = require('./middleware/security');
const { setupStaticServing } = require('./middleware/staticServing');
const { projectRoot } = require('./config/brandAssets');

const app = express();
const PORT = process.env.PORT || 5000;
const isProduction = process.env.NODE_ENV === 'production';

// ── Environment guards ──────────────────────────────────────────────────────
if (isProduction && !process.env.SESSION_SECRET) {
  console.error(
    '[FATAL] SESSION_SECRET 환경변수가 설정되지 않았습니다. 프로덕션 환경에서는 필수입니다.',
  );
  process.exit(1);
}

if (isProduction && !process.env.USE_CLOUD_STORAGE) {
  console.warn('[WARNING] 파일 업로드가 로컬 디스크에 저장됩니다.');
  console.warn(
    '[WARNING] Render 등 에페머럴 환경에서는 재배포 시 uploads/ 디렉토리의 모든 파일이 삭제됩니다.',
  );
  console.warn(
    '[WARNING] 프로덕션에서는 S3, Cloudinary 등 외부 오브젝트 스토리지 사용을 강력히 권장합니다.',
  );
}

// ── Security middleware (helmet, CORS, session, CSRF) ────────────────────────
setupSecurity(app, pool);

// ── Health check ─────────────────────────────────────────────────────────────
app.get('/api/health', (req, res) => {
  res.json({ ok: true, service: 'path-api' });
});

// ── API routes ───────────────────────────────────────────────────────────────
app.use('/api/auth', require('./routes/auth'));
app.use('/api/study', require('./routes/study'));
app.use('/api/ranking', require('./routes/ranking'));
app.use('/api/estate', require('./routes/estate'));
app.use('/api/invasion', require('./routes/invasion'));
app.use('/api/notifications', require('./routes/notifications'));
app.use('/api/admin', require('./routes/admin'));
app.use('/api/university', require('./routes/university'));
app.use('/api/cam', require('./routes/cam'));
app.use('/api/friends', require('./routes/friends'));
app.use('/api/messages', require('./routes/messages'));
app.use('/api/community', require('./routes/community'));
app.use('/api/rooms', require('./routes/rooms'));
app.use('/api/apply', require('./routes/apply'));

// ── Upload proxy routes ──────────────────────────────────────────────────────
app.use(require('./routes/uploadProxy'));

// ── Static file serving & PWA ────────────────────────────────────────────────
setupStaticServing(app);

// ── SSR pages ────────────────────────────────────────────────────────────────
app.use(require('./routes/communitySSR'));
app.use(require('./routes/roomInviteSSR'));
app.use(require('./routes/seo'));

// ── Legacy URL compatibility ─────────────────────────────────────────────────
app.get('/P.A.T.H/login', (_req, res) => res.redirect(301, '/login/'));
app.get('/P.A.T.H/login/', (_req, res) => res.redirect(301, '/login/'));
app.get('/P.A.T.H/login/index.html', (_req, res) => res.redirect(301, '/login/'));

app.get('/P.A.T.H/mainPageDev', (_req, res) => res.redirect(301, '/study-hub/'));
app.get('/P.A.T.H/mainPageDev/', (_req, res) => res.redirect(301, '/study-hub/'));
app.get('/P.A.T.H/mainPageDev/index.html', (_req, res) => res.redirect(301, '/study-hub/'));

app.get('/P.A.T.H/community', (_req, res) => res.redirect(301, '/community/'));
app.get('/P.A.T.H/community/', (_req, res) => res.redirect(301, '/community/'));
app.get('/P.A.T.H/community/index.html', (_req, res) => res.redirect(301, '/community/'));

app.get('/P.A.T.H/messages', (_req, res) => res.redirect(301, '/messages/'));
app.get('/P.A.T.H/messages/', (_req, res) => res.redirect(301, '/messages/'));
app.get('/P.A.T.H/messages/index.html', (_req, res) => res.redirect(301, '/messages/'));

app.get('/P.A.T.H/setup-profile', (_req, res) => res.redirect(301, '/setup-profile/'));
app.get('/P.A.T.H/setup-profile/', (_req, res) => res.redirect(301, '/setup-profile/'));
app.get('/P.A.T.H/setup-profile/index.html', (_req, res) => res.redirect(301, '/setup-profile/'));

app.get('/P.A.T.H/admin', (_req, res) => res.redirect(301, '/admin/'));
app.get('/P.A.T.H/admin/', (_req, res) => res.redirect(301, '/admin/'));
app.get('/P.A.T.H/admin/index.html', (_req, res) => res.redirect(301, '/admin/'));

// ── Root handler ─────────────────────────────────────────────────────────────
app.get('/', (_req, res) => {
  res.sendFile(path.join(projectRoot, 'P.A.T.H', 'login', 'index.html'), {
    headers: {
      'Cache-Control': 'no-store, no-cache, must-revalidate, proxy-revalidate',
      Pragma: 'no-cache',
      Expires: '0',
      'Surrogate-Control': 'no-store',
    },
  });
});

// ── Server bootstrap ─────────────────────────────────────────────────────────
initSchema()
  .then(() => {
    const httpServer = createServer(app);

    const io = new SocketServer(httpServer, {
      cors: {
        origin: corsOriginHandler,
        credentials: true,
      },
      transports: ['websocket', 'polling'],
    });
    app.set('io', io);

    httpServer.listen(PORT, '0.0.0.0', () => {
      console.log(`P.A.T.H 서버 실행 중 - http://0.0.0.0:${PORT}`);
    });
  })
  .catch((err) => {
    console.error('서버 시작 실패 (DB 초기화 오류):', err.message);
    process.exit(1);
  });
