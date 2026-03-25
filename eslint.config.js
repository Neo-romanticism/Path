const js = require('@eslint/js');
const prettier = require('eslint-plugin-prettier/recommended');
const globals = require('globals');

module.exports = [
  js.configs.recommended,
  prettier,
  {
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: 'commonjs',
      globals: {
        ...globals.node,
      },
    },
    rules: {
      'no-unused-vars': ['warn', { argsIgnorePattern: '^_' }],
      'no-console': 'off',
      'prefer-const': 'warn',
      eqeqeq: ['error', 'always'],
      'no-var': 'error',
    },
  },
  {
    files: ['P.A.T.H/**/*.js'],
    languageOptions: {
      sourceType: 'module',
      globals: {
        ...globals.browser,
        UI: 'readonly',
        TimerEngine: 'readonly',
        CamManager: 'readonly',
        WakeLockManager: 'readonly',
        GroupRooms: 'readonly',
        isRunning: 'writable',
        io: 'readonly',
        clients: 'readonly',
        applyStudyPowerSaveMode: 'readonly',
        cancelFileUpload: 'readonly',
        clearConversationSearchHistory: 'readonly',
        openTimerSettings: 'readonly',
      },
    },
  },
  {
    ignores: ['node_modules/', 'android/', 'uploads/', 'scripts/'],
  },
];
