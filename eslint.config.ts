import eslint from '@eslint/js';
import { FlatCompat } from '@eslint/eslintrc';
import tseslint from 'typescript-eslint';
import importPlugin from 'eslint-plugin-import';
import react from 'eslint-plugin-react';
import unicorn from 'eslint-plugin-unicorn';

const compat = new FlatCompat();

export default tseslint.config(
  {
    ignores: [
      '**/dist/',
      '**/.cache/',
      'packages/create-waku/template/',
      'examples/07_cloudflare/.wrangler/',
    ],
  },
  eslint.configs.recommended,
  tseslint.configs.recommended,
  importPlugin.flatConfigs.recommended,
  react.configs.flat.recommended,
  react.configs.flat['jsx-runtime'],
  ...compat.extends('plugin:react-hooks/recommended'),
  {
    files: ['**/*.{ts,tsx,js,jsx}'],
    settings: {
      'import/resolver': {
        typescript: {
          project: './tsconfig.eslint.json',
        },
      },
      react: { version: '999.999.999' },
    },
    languageOptions: {
      parserOptions: {
        project: './tsconfig.eslint.json',
      },
      globals: {
        globalThis: 'readonly',
        document: 'readonly',
        setTimeout: 'readonly',
      },
    },
    plugins: {
      unicorn,
    },
    rules: {
      '@typescript-eslint/no-floating-promises': 'error',
      '@typescript-eslint/no-explicit-any': 'off',
      '@typescript-eslint/no-empty-object-type': 'off',
      '@typescript-eslint/no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_' },
      ],
      'react/prop-types': 'off',
      curly: ['error', 'all'],
      'unicorn/prefer-string-slice': 'error',
      'no-restricted-syntax': [
        'error',
        {
          selector: "TSQualifiedName[left.name='React']",
          message:
            'Import React types directly instead of using React.* namespace',
        },
      ],
    },
  },
  {
    files: [
      'packages/waku/cli.js',
      'packages/create-waku/cli.js',
      'examples/41_path-alias/**/*.tsx',
    ],
    rules: {
      'import/no-unresolved': 'off',
    },
  },
);
