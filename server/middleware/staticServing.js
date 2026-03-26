const express = require('express');
const path = require('path');
const { projectRoot, brandAssetMap, appIconSourcePath } = require('../config/brandAssets');

const staticOptions = {
  maxAge: '1d',
  etag: true,
  index: 'index.html',
};

// Safari/edge CDN combinations can keep stale app-shell files despite query params.
// For route entrypoints and their JS/CSS, disable caching completely.
const noCacheStaticOptions = {
  maxAge: 0,
  etag: false,
  index: 'index.html',
  setHeaders(res) {
    res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
    res.setHeader('Pragma', 'no-cache');
    res.setHeader('Expires', '0');
    res.setHeader('Surrogate-Control', 'no-store');
  },
};

function setupStaticServing(app) {
  // ── PWA: Service Worker (must be at root scope, no-cache)
  app.get('/sw.js', (req, res) => {
    res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate');
    res.setHeader('Service-Worker-Allowed', '/');
    res.setHeader('Content-Type', 'application/javascript');
    res.sendFile(path.join(projectRoot, 'P.A.T.H', 'sw.js'));
  });

  // ── PWA: Manifest (short-lived cache)
  app.get('/manifest.json', (req, res) => {
    res.setHeader('Cache-Control', 'public, max-age=86400');
    res.setHeader('Content-Type', 'application/manifest+json');
    res.sendFile(path.join(projectRoot, 'P.A.T.H', 'manifest.json'));
  });

  // Use a single master image for PWA icon aliases.
  app.get('/app-icon.png', (req, res) => {
    res.setHeader('Cache-Control', 'public, max-age=2592000, immutable');
    res.type('png');
    res.sendFile(appIconSourcePath);
  });

  app.get('/icons/:filename', (req, res, next) => {
    const filename = String(req.params.filename || '');
    if (!/^icon-(72|96|128|144|152|192|384|512)\.png$/.test(filename)) {
      return next();
    }

    res.setHeader('Cache-Control', 'public, max-age=2592000, immutable');
    res.type('png');
    return res.sendFile(appIconSourcePath);
  });

  // Clean aliases for brand assets kept under /icons.
  app.get('/brand/:filename', (req, res, next) => {
    const filename = String(req.params.filename || '');
    const sourcePath = brandAssetMap[filename];

    if (!sourcePath) return next();

    res.setHeader('Cache-Control', 'public, max-age=2592000, immutable');
    return res.sendFile(sourcePath);
  });

  // ── PWA: Icons (long-lived cache)
  app.use(
    '/icons',
    express.static(path.join(projectRoot, 'P.A.T.H', 'icons'), {
      maxAge: '30d',
      etag: true,
    }),
  );

  // ── PWA: Install helper script (no-cache)
  app.get('/pwa-install.js', (req, res) => {
    res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate');
    res.setHeader('Content-Type', 'application/javascript');
    res.sendFile(path.join(projectRoot, 'P.A.T.H', 'pwa-install.js'));
  });

  // Public URL mounts (hide internal folder structure from browser address bar)
  app.use('/assets', express.static(path.join(projectRoot, 'P.A.T.H', 'assets'), staticOptions));
  app.use('/shared', express.static(path.join(projectRoot, 'P.A.T.H', 'shared'), staticOptions));
  app.use(
    '/login',
    express.static(path.join(projectRoot, 'P.A.T.H', 'login'), noCacheStaticOptions),
  );
  app.get('/study-hub', (req, res, next) => {
    if (req.path.endsWith('/')) return next();
    const queryIndex = req.url.indexOf('?');
    const query = queryIndex >= 0 ? req.url.slice(queryIndex) : '';
    return res.redirect(301, `/study-hub/${query}`);
  });
  app.use(
    '/study-hub',
    express.static(path.join(projectRoot, 'P.A.T.H', 'study-hub'), noCacheStaticOptions),
  );
  app.use('/timer', (req, res) => {
    const queryIndex = req.url.indexOf('?');
    const query = queryIndex >= 0 ? req.url.slice(queryIndex) : '';
    const targetPath = req.path === '/' ? '/study-hub/' : `/study-hub${req.path}`;
    return res.redirect(301, `${targetPath}${query}`);
  });
  app.use(
    '/community',
    express.static(path.join(projectRoot, 'P.A.T.H', 'community'), noCacheStaticOptions),
  );
  app.use(
    '/messages',
    express.static(path.join(projectRoot, 'P.A.T.H', 'messages'), noCacheStaticOptions),
  );
  app.use(
    '/setup-profile',
    express.static(path.join(projectRoot, 'P.A.T.H', 'setup-profile'), noCacheStaticOptions),
  );
  app.use(
    '/admin',
    express.static(path.join(projectRoot, 'P.A.T.H', 'admin'), noCacheStaticOptions),
  );
  app.use(
    '/apply',
    express.static(path.join(projectRoot, 'P.A.T.H', 'apply'), noCacheStaticOptions),
  );
  app.use('/legal', express.static(path.join(projectRoot, 'P.A.T.H', 'legal'), staticOptions));

  app.use('/study-hub/messages', (req, res) => {
    const queryIndex = req.url.indexOf('?');
    const query = queryIndex >= 0 ? req.url.slice(queryIndex) : '';
    return res.redirect(301, `/messages/${query}`);
  });
}

module.exports = { setupStaticServing };
