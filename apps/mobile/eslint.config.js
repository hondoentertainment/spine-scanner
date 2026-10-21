const expoConfig = require('eslint-config-expo/flat');
const { defineConfig } = require('eslint/config');

module.exports = defineConfig([
  expoConfig,
  {
    ignores: ['node_modules/**', '.expo/**', 'dist/**', 'web-build/**', 'ios/**', 'android/**'],
  },
  {
    rules: {
      'import/no-unresolved': 'off',
    },
  },
]);
