import { defineConfig } from 'vitest/config';

/**
 * Live MongoDB lane (owned by MONGO-02).
 *
 * Disposable single-node replica set via `test/mongo-harness.ts`
 * (`MongoMemoryReplSet`, count 1; isolated databases with randomized names,
 * per-test `dropDatabase`, no production connection string) running
 * `test/mongo-live.test.ts` (shared `test/store-conformance.ts` parity plus
 * two-client atomicity, capacity/expiry, and HTTP integration).
 *
 * `passWithNoTests` stays `false` and harness absence blocks this lane; it
 * never skip-passes. Replica-set startup plus binary download can take a
 * while, so the per-test timeout is generous while the suite stays serial.
 *
 * Prerequisites: `mongodb-memory-server` replica-set binary download
 * (registry/network) for the live lane.
 */
export default defineConfig({
  test: {
    environment: 'node',
    include: ['test/mongo-live.test.ts'],
    passWithNoTests: false,
    testTimeout: 60_000,
    hookTimeout: 120_000,
  },
});
