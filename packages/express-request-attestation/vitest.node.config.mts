import { defineConfig } from 'vitest/config';

/**
 * ATT-01/ATT-03 Node lane plus ATT-04 Redis unit lane (no Docker) plus
 * ATT-06 signer/client unit lane plus ATT-05 key/asset lane plus ATT-09
 * hardening lane:
 * protocol/codec/target/time-policy unit tests, the bounded memory
 * replay-store suite (shared `test/store-conformance.ts` via
 * `test/memory-store.test.ts`), ATT-02 middleware verification,
 * ATT-04 `test/redis-store.test.ts` (fake-Redis parity + command/error
 * paths), ATT-06 `test/signer.test.ts` + `test/signer-client.test.ts`
 * (WebCrypto determinism via Node WebCrypto plus fixture ESM loader mocks;
 * real Chromium lives in `vitest.browser.config.mts`), and ATT-05
 *   `test/keys.test.ts` + `test/signer-bundle.test.ts` (owned rotation plus
 *   immutable ESM delivery with a Playwright Chromium import check in the
 *   Node lane; Vite-served `*.browser.ts` fixtures stay in the browser lane),
 *   and ATT-07 `test/fetch-client.test.ts` (prepared signed fetch, bounded
 *   retry, bearer + OIDC-vault composition over live Express), and ATT-09
 *   `test/boundary.test.ts` + `test/clock-guard.test.ts` +
 *   `test/failure-limits.test.ts` (cross-path boundaries, lifetime
 *   invariants, bounded failure behavior).
 *
 * Explicit includes with `passWithNoTests: false` so this gate fails loudly
 * instead of passing vacuously. Real-browser files (`*.browser.ts`) and
 * release-tarball tests stay in their dedicated lanes.
 */
export default defineConfig({
  test: {
    environment: 'node',
    include: ['test/protocol.test.ts', 'test/time-policy.test.ts', 'test/memory-store.test.ts', 'test/body-capture.test.ts', 'test/middleware.test.ts', 'test/verification-order.test.ts', 'test/redis-store.test.ts', 'test/signer.test.ts', 'test/signer-client.test.ts', 'test/keys.test.ts', 'test/signer-bundle.test.ts', 'test/fetch-client.test.ts', 'test/boundary.test.ts', 'test/clock-guard.test.ts', 'test/failure-limits.test.ts'],
    passWithNoTests: false,
  },
});
