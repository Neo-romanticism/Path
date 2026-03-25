(function (global) {
  'use strict';

  const DEFAULT_KEY = 'path_theme';
  const DEFAULT_MODE = 'light';

  function getSystemMode() {
    try {
      if (global.matchMedia && global.matchMedia('(prefers-color-scheme: light)').matches) {
        return 'light';
      }
    } catch (_) {}
    return 'dark';
  }

  function normalizeFallback(fallback) {
    if (fallback === 'light' || fallback === 'dark') {
      return fallback;
    }
    if (fallback === 'system') {
      return getSystemMode();
    }
    return DEFAULT_MODE;
  }

  function normalizeMode(mode, fallback) {
    const safeFallback = normalizeFallback(fallback);
    return mode === 'dark' || mode === 'light' ? mode : safeFallback;
  }

  function getStorageValue(key) {
    try {
      if (global.localStorage) {
        return global.localStorage.getItem(key);
      }
    } catch (_) {}
    return null;
  }

  function setStorageValue(key, value) {
    try {
      if (global.localStorage) {
        global.localStorage.setItem(key, value);
      }
    } catch (_) {}
  }

  function readMode(options) {
    const opts = options || {};
    const key = opts.key || DEFAULT_KEY;
    const fallback = normalizeFallback(opts.fallback);
    return normalizeMode(getStorageValue(key), fallback);
  }

  function applyMode(mode, options) {
    const opts = options || {};
    const fallback = normalizeFallback(opts.fallback);
    const normalizedMode = normalizeMode(mode, fallback);
    const body = opts.body || document.body;
    const root = document.documentElement;

    if (body && body.classList) {
      body.classList.toggle('light', normalizedMode === 'light');
    }
    if (body && typeof body.setAttribute === 'function') {
      body.setAttribute('data-theme-mode', normalizedMode);
    }
    if (body && body.style) {
      body.style.colorScheme = normalizedMode;
    }

    if (root && root.classList) {
      root.classList.toggle('light', normalizedMode === 'light');
    }
    if (root && typeof root.setAttribute === 'function') {
      root.setAttribute('data-theme-mode', normalizedMode);
    }
    if (root && root.style) {
      root.style.colorScheme = normalizedMode;
    }

    return normalizedMode;
  }

  function applyStoredTheme(options) {
    const mode = readMode(options);
    return applyMode(mode, options);
  }

  function setMode(mode, options) {
    const opts = options || {};
    const key = opts.key || DEFAULT_KEY;
    const fallback = normalizeFallback(opts.fallback);
    const normalizedMode = normalizeMode(mode, fallback);

    setStorageValue(key, normalizedMode);
    return applyMode(normalizedMode, opts);
  }

  function setLightMode(isLight, options) {
    return setMode(isLight ? 'light' : 'dark', options);
  }

  function toggle(options) {
    const opts = options || {};
    const body = opts.body || document.body;
    let nextIsLight;

    if (body && body.classList) {
      nextIsLight = !body.classList.contains('light');
    } else {
      nextIsLight = readMode(opts) !== 'light';
    }

    return setLightMode(nextIsLight, opts);
  }

  global.PathTheme = {
    readMode: readMode,
    applyMode: applyMode,
    applyStoredTheme: applyStoredTheme,
    setMode: setMode,
    setLightMode: setLightMode,
    toggle: toggle,
  };
})(window);
