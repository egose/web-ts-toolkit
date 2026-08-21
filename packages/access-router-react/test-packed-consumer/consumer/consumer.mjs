/**
 * Consumer ESM entry exercised by ARR-H08 packed-tarball install test.
 *
 * A real `import` statement resolves
 * `@web-ts-toolkit/access-router-react` from a fresh `node_modules`
 * containing the produced npm tarball through the `exports.import`
 * (= ./dist/index.mjs → ./index.mjs in published tree) map. The script mounts
 * packed hooks through the installed React peer deps so an export-map,
 * externalization, or bundled-React regression fails against the published
 * artifact rather than source imports.
 */
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

import * as accessRouterReact from '@web-ts-toolkit/access-router-react';
import * as accessRouterClient from '@web-ts-toolkit/access-router-client';
import React from 'react';
import * as testingLibrary from '@testing-library/react';

const require = createRequire(import.meta.url);
const { runHookSmoke } = require('./hooks-smoke-core.cjs');

await runHookSmoke({
  mode: 'ESM',
  packageEntryPath: fileURLToPath(import.meta.resolve('@web-ts-toolkit/access-router-react')),
  accessRouterReact,
  accessRouterClient,
  react: React,
  testingLibrary,
});
