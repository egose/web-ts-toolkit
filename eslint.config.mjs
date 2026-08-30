import js from '@eslint/js';
import globals from 'globals';
import tseslint from 'typescript-eslint';
import reactHooks from 'eslint-plugin-react-hooks';

export default tseslint.config(
  {
    ignores: ['**/dist/**', '**/coverage/**', '**/node_modules/**', 'packages/**/src/**/*.js'],
  },
  {
    ignores: ['packages/access-router/_tmp_examples/**', 'website/**', 'packages/create-access-router-mongo-starter/template/**', '.mongoose/**'],
  },
  {
    files: ['**/*.{js,mjs,cjs,ts,tsx,mts,cts}'],
    languageOptions: {
      ecmaVersion: 'latest',
      globals: globals.node,
      sourceType: 'module',
      parserOptions: {
        // typescript-eslint v8.67 auto-registers the eslint config dir as a
        // candidate tsconfigRootDir and throws when more than one is present
        // (the root config plus apps/react-vite/eslint.config.js are both
        // loaded during `eslint .`). Pinning the root here disambiguates.
        tsconfigRootDir: import.meta.dirname,
      },
    },
  },
  {
    files: ['packages/access-router-react/**/*.{ts,tsx,js,jsx}'],
    languageOptions: {
      ecmaVersion: 'latest',
      globals: { ...globals.browser, ...globals.node },
      sourceType: 'module',
      parserOptions: {
        tsconfigRootDir: import.meta.dirname,
      },
    },
    plugins: {
      'react-hooks': reactHooks,
    },
    rules: {
      ...reactHooks.configs.recommended.rules,
      // Match the unused-vars convention used by every other package in
      // the repo (apps/nodejs, message-service, express-runtime,
      // mongoose-rxab). The access-router-react block above does not
      // inherit those overrides because eslint flat config does not
      // merge sibling `files` blocks; declaring the rule explicitly
      // here keeps test props deliberately prefixed with `_` (e.g.
      // `_tick` in render-loop regression tests) from raising a
      // lint error.
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_', varsIgnorePattern: '^_' }],
    },
  },
  {
    files: ['**/*.cjs'],
    languageOptions: {
      sourceType: 'commonjs',
    },
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    files: ['packages/access-router/**/*.{ts,mts,cts,js,mjs,cjs}'],
    rules: {
      '@typescript-eslint/ban-ts-comment': 'off',
      '@typescript-eslint/no-empty-object-type': 'off',
      '@typescript-eslint/no-explicit-any': 'off',
      '@typescript-eslint/no-this-alias': 'off',
      '@typescript-eslint/no-unsafe-function-type': 'off',
      '@typescript-eslint/no-unused-expressions': 'off',
      '@typescript-eslint/no-unused-vars': 'off',
      'no-extra-boolean-cast': 'off',
      'no-prototype-builtins': 'off',
      'prefer-const': 'off',
    },
  },
  {
    files: ['packages/access-router-deco/**/*.{ts,mts,cts,js,mjs,cjs}'],
    rules: {
      '@typescript-eslint/no-explicit-any': 'off',
      '@typescript-eslint/no-unsafe-function-type': 'off',
      '@typescript-eslint/no-unused-vars': 'off',
      'no-prototype-builtins': 'off',
    },
  },
  {
    files: ['apps/nodejs/src/**/*.{ts,mts,cts,js,mjs,cjs}'],
    rules: {
      '@typescript-eslint/no-explicit-any': 'off',
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_', varsIgnorePattern: '^_' }],
    },
  },
  {
    files: ['packages/message-service/**/*.{ts,mts,cts,js,mjs,cjs}'],
    rules: {
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_', varsIgnorePattern: '^_' }],
    },
  },
  {
    files: ['packages/express-runtime/**/*.{ts,mts,cts,js,mjs,cjs}'],
    rules: {
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_', varsIgnorePattern: '^_' }],
    },
  },
  {
    files: ['packages/message-service/test/**/*.{ts,mts,cts,js,mjs,cjs}'],
    rules: {
      '@typescript-eslint/no-explicit-any': 'off',
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_', varsIgnorePattern: '^_' }],
    },
  },
  {
    files: ['packages/mongoose-rxdb/**/*.{ts,mts,cts,js,mjs,cjs}'],
    rules: {
      '@typescript-eslint/no-explicit-any': 'off',
      '@typescript-eslint/no-empty-object-type': 'off',
      '@typescript-eslint/no-wrapper-object-types': 'off',
      '@typescript-eslint/no-unsafe-function-type': 'off',
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_', varsIgnorePattern: '^_' }],
      '@typescript-eslint/no-unused-expressions': 'off',
      'no-extra-boolean-cast': 'off',
      'no-prototype-builtins': 'off',
      'prefer-const': 'off',
    },
  },
  {
    files: ['apps/mongoose-rxdb-example/**/*.{ts,mts,cts,js,mjs,cjs}'],
    rules: {
      '@typescript-eslint/no-explicit-any': 'off',
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_', varsIgnorePattern: '^_' }],
    },
  },
  {
    files: ['packages/access-router-react/test-docs-consumer/examples/**/*.{ts,tsx}'],
    rules: {
      '@typescript-eslint/no-unused-vars': 'off',
    },
  },
  {
    files: ['packages/asset-inliner/**/*.{ts,mts,cts,js,mjs,cjs}'],
    rules: {
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_', varsIgnorePattern: '^_' }],
    },
  },
  {
    files: ['packages/asset-inliner/test/**/*.{ts,mts,cts,js,mjs,cjs}'],
    rules: {
      '@typescript-eslint/no-explicit-any': 'off',
      '@typescript-eslint/no-unused-vars': 'off',
      'no-empty': 'off',
      'prefer-const': 'off',
    },
  },
);
