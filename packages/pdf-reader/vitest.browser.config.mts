import { defineConfig } from 'vitest/config';
import { playwright } from '@vitest/browser-playwright';

/**
 * PDFR-01: Real-browser integration config for `@web-ts-toolkit/pdf-reader`.
 *
 * The repository already ships a `vitest.browser.config.ts` for
 * `@web-ts-toolkit/access-router-client`, but that runner uses `jsdom`, which
 * the PDFR-01 task explicitly calls out as insufficient for real canvas and
 * PDF.js Web Worker validation. This config instead runs the suite through
 * Vitest's Playwright provider against real Headless Chromium.
 *
 * PDF.js worker + canvas + page rendering only behave like production when
 * executed inside a real browser process, so we keep this runner strictly
 * separate from the Node `vitest.config.mts` config and invoke it from a
 * dedicated `test:browser` package script (see `package.json`). The two suites
 * execute serially during `pnpm --filter @web-ts-toolkit/pdf-reader test` to
 * satisfy the AGENTS.md race rule about not running `tsup` concurrently across
 * packages.
 *
 * System requirements:
 * - `@vitest/browser-playwright` must be installed in the package (it is, as
 *   a devDependency). Vitest uses Playwright's installed Chromium binary;
 *   `npx playwright install chromium` (or `pnpm --filter
 *   @web-ts-toolkit/pdf-reader exec playwright install chromium`) downloads
 *   Headless Chromium into `~/.cache/ms-playwright/` on first run.
 * - The tests load the *built* ESM bundle from `dist/index.mjs` so they
 *   exercise what an installed browser consumer connects to, not the
 *   TypeScript source.
 *
 * Keep `fileParallelism: false`: PDF.js worker configuration is process-global
 * state in the browser realm and must not be mutated concurrently by files.
 */
export default defineConfig({
  test: {
    // Browser tests. Vitest's `browser` mode transfers test files into the
    // real chromium process; `jsdom` is NOT used and is intentionally absent
    // from this config.
    browser: {
      enabled: true,
      headless: true,
      provider: playwright({
        // `--no-sandbox` keeps the runner usable in CI containers that do not
        // permit the SUID sandbox helper.
        launchOptions: { args: ['--no-sandbox'] },
      }),
      instances: [{ browser: 'chromium', name: 'chromium' }],
    },
    // Run only the browser integration suite. The file uses the
    // `*.browser.ts` suffix (mirroring `@web-ts-toolkit/access-router-client`
    // uses `access-router-client.browser-smoke.ts`) so the Node
    // `vitest.config.mts` default `*.test.ts` glob does not also try to load
    // this file in Node, where `pdfjs-dist` cannot resolve `DOMMatrix`.
    include: ['test/**/*.browser.ts'],
    // Serialise browser cases so global PDF.js worker configuration cannot
    // leak between tests (PDFR-01 implementation requirement #7).
    fileParallelism: false,
  },
});
