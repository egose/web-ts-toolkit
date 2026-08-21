import { defineConfig } from 'vitest/config';
import path from 'node:path';

import { resolveReact18DepsRoot } from './test/react18-lane';
import { runtimeTestConfig } from './vitest.runtime-shared';

// The React 18 lane runs the same runtime suite as the React 19 lane, but
// against an isolated dependency tree created by `pnpm test:react18`. The
// wrapper script installs exact React/React DOM/RTL versions into a fresh
// temp workspace, validates them before starting Vitest, exports the
// resulting `node_modules` path through `ACCESS_ROUTER_REACT18_DEPS_ROOT`,
// and removes the tree in `finally` so concurrent jobs cannot share stale
// deps or partial installs.
const react18DepsRoot = resolveReact18DepsRoot();

export default defineConfig({
  test: {
    ...runtimeTestConfig,
    deps: {
      // Force Vite to inline-process the React runtime + testing-library so
      // the `resolve.alias` below is applied to their *internal* `require("react")`
      // / `require("react-dom")` calls. The pnpm peer context would otherwise
      // win in the workspace's own tree.
      inline: [/react/, /react-dom/, /scheduler/, /@testing-library\/react/],
    },
  },
  resolve: {
    dedupe: ['react', 'react-dom', 'scheduler'],
    alias: [
      { find: /^react\/jsx-runtime$/, replacement: path.join(react18DepsRoot, 'react/jsx-runtime') },
      { find: /^react\/jsx-dev-runtime$/, replacement: path.join(react18DepsRoot, 'react/jsx-dev-runtime') },
      { find: /^react$/, replacement: path.join(react18DepsRoot, 'react') },
      { find: /^react-dom\/client$/, replacement: path.join(react18DepsRoot, 'react-dom/client') },
      { find: /^react-dom$/, replacement: path.join(react18DepsRoot, 'react-dom') },
      { find: /^@testing-library\/react$/, replacement: path.join(react18DepsRoot, '@testing-library/react') },
      { find: /^scheduler$/, replacement: path.join(react18DepsRoot, 'scheduler') },
    ],
  },
});
