import { defineConfig } from 'vitest/config';

/**
 * Live Redis lane (owned by ATT-04).
 *
 * Disposable Docker Redis 6.2/7.2 parity via `test/redis-live.test.ts` with
 * `test/redis-harness.ts` (randomized prefixes, two independent clients,
 * per-test cleanup, no production `REDIS_URL`). Unit command/error paths run
 * without Docker in `test/redis-store.test.ts` (node lane). `passWithNoTests`
 * stays `false` and Docker absence blocks this lane; it never skip-passes.
 * Time-travel conformance blocks real server time (up to ~10s per case), so
 * the per-test timeout is generous while the suite stays serial.
 */
export default defineConfig({
  test: {
    environment: 'node',
    include: ['test/redis-live.test.ts'],
    passWithNoTests: false,
    testTimeout: 60_000,
    hookTimeout: 120_000,
  },
});
