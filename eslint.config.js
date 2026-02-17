import js from '@eslint/js';
import globals from 'globals';
import importPlugin from 'eslint-plugin-import';
import nPlugin from 'eslint-plugin-n';
import prettierRecommended from 'eslint-plugin-prettier/recommended';
import promisePlugin from 'eslint-plugin-promise';

export default [
  {
    ignores: ['.npm-cache/**', 'node_modules/**'],
  },
  js.configs.recommended,
  importPlugin.flatConfigs.recommended,
  nPlugin.configs['flat/recommended'],
  promisePlugin.configs['flat/recommended'],
  {
    files: ['**/*.js'],
    languageOptions: {
      ecmaVersion: 'latest',
      sourceType: 'module',
      globals: globals.node,
    },
  },
  {
    files: ['eslint.config.js'],
    rules: {
      'n/no-unpublished-import': 'off',
    },
  },
  prettierRecommended,
];
