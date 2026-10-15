import { defineConfig } from 'vitest/config';

// Opt-in independent-review probes. A failing probe blocks DPH-09 even when the
// ordinary package gates pass; follow-up implementers should retain regressions
// in the regular suite when remediating the recorded finding.
export default defineConfig({
  test: { environment: 'node', include: ['test/dph09-*.probe.ts'], testTimeout: 5_000 },
});
