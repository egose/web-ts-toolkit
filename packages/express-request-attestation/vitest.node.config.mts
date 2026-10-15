import { defineConfig } from 'vitest/config';

/**
 * Node unit/runtime lane, including memory-store conformance and stubbed
 * Redis/MongoDB command, validation, and error paths. No live database is
 * required; the signer-bundle and signer-discovery-http suites do require
 * Playwright Chromium for native ESM import and HTTP response ownership checks.
 *
 * Keep this explicit list disjoint from the live Redis/MongoDB, browser
 * (`*.browser.ts`), and packed-consumer configs so the serial package test
 * script runs each suite once. Add new Node suites here; an empty lane fails
 * via `passWithNoTests: false`.
 */
export default defineConfig({
  test: {
    environment: 'node',
    include: [
      'test/protocol.test.ts',
      'test/time-policy.test.ts',
      'test/memory-store.test.ts',
      'test/body-capture.test.ts',
      'test/middleware.test.ts',
      'test/verification-order.test.ts',
      'test/redis-store.test.ts',
      'test/mongo-store.test.ts',
      'test/signer.test.ts',
      'test/signer-client.test.ts',
      'test/signer-discovery-http.test.ts',
      'test/keys.test.ts',
      'test/signer-bundle.test.ts',
      'test/fetch-client.test.ts',
      'test/boundary.test.ts',
      'test/clock-guard.test.ts',
      'test/failure-limits.test.ts',
      'test/request-body.test.ts',
    ],
    passWithNoTests: false,
  },
});
