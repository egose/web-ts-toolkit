import { defineConfig } from 'vitest/config';
import path from 'node:path';

// Absolute path to an isolated React 18 dependency tree (installed via
// `npm install react@18.3.1 react-dom@18.3.1 @testing-library/react@16.3.2`)
// under /tmp/opencode/react18-deps. The workspace's own pnpm tree pairs
// `react-dom-18` (an `npm:` alias devDependency) with React 19 in its pnpm
// peer context, which defeats vitest's `resolve.alias` attempts to swap the
// runtime versions because the aliased packages' nested `require("react")`
// still resolve through pnpm's nested `node_modules/react` symlink. Pinning
// the alias targets at an absolute, self-contained React 18 install tree
// makes `react-dom` 18 find `react` 18 paired correctly inside that tree.
//
// `@testing-library/react` v16 supports both React 18 and React 19 via its
// peer range (`^18 || ^19`) AND reflects its per-call `reactStrictMode`
// option all the way down to `render` (RTL's renderOption chain) — RTL v14.3.0
// (an older React-18-only release) only honored the global config flag, so
// tests passing `{ reactStrictMode: true }` per-call do not experience the
// Strict Mode effect replay under v14.3.0. v16 is required for parity with
// the React 19 primary lane.
//
// From the project root, install/refresh the React 18 tree before running
// the lane:
//
//   npm --prefix /tmp/opencode/react18-deps install react@18.3.1 \
//     react-dom@18.3.1 @testing-library/react@16.3.2
//
// The package.json `test:react18` script runs this config. CI should run
// both lanes serially (builds write to a shared `dist/` per AGENTS.md), with
// the React 19 lane as the gating lane.
const react18DepsRoot = '/tmp/opencode/react18-deps/node_modules';

// ARR-11 React 18 verification lane.
//
// The package's peerDependencies declares react ^18 || ^19. The primary
// vitest config runs against React 19 (the installed react/react-dom
// devDependencies); this second config re-runs the same behavior test suite
// against React 18 so the peer contract is verified rather than only
// declared. The two lanes share one test source tree (test/**) so behavior
// differences surface without duplicating test bodies.
//
// The packed-consumer and docs-compile tests are excluded from this lane
// because they re-install and compile against the published tarball
// declaration surface only — they do not exercise the React runtime at all
// and already pass through the primary lane.
export default defineConfig({
  test: {
    environment: 'jsdom',
    globals: true,
    include: ['test/**/*.test.ts', 'test/**/*.test.tsx'],
    exclude: [
      '**/node_modules/**',
      '**/dist/**',
      'test-decl-consumer/**',
      'test-packed-consumer/**',
      'test-docs-consumer/**',
      'test/access-router-react.packed-consumer.test.ts',
      'test/access-router-react.docs.compile.test.ts',
      'test/access-router-react.exports.unit.test.ts',
    ],
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
