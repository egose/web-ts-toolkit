# ARTS-04 installed-export fixture cleanup

**Cleanup delivered; both exporter cases passed.** This supplement supersedes
**only** the current identity of `packages/access-router/test/contracts/arts04-installed-exports.test.ts`
in [the historical ARTS-04 manifest](arts-04-manifest.json). That manifest, the
original [report](arts-04-report.md), coverage, verification and every earlier
artifact remain historical and unchanged. Shared task/index files were not edited.

## Narrow change and preservation

- Extend the two existing imports with `rmSync` / `afterAll`; allow the local
  consumer variable to be undefined; append guarded `afterAll` **after** the
  describe block. No setup/assertion/title/expected-value change or added case.
- Before: **2069 bytes**, SHA-256
  `5c63137dbe061b4c8eedf2486769b1847a66189bbc7ac0b362350a5bac1cd9d4`.
- After: **2189 bytes**, SHA-256
  `ed8eab1ada425861d917d092b775976992342bbd9d9f0ee1d8a87832663ee772`.
- The entire describe and beforeAll bodies remain byte-identical; exact edits,
  body hashes and current passed case identities are in
  [verification JSON](arts-04-cleanup-verification.json). ESM stays at **33:3**,
  CJS at **38:3**; both case IDs are unchanged.
- All other **five ARTS-04 runnable files and four support files**, all **31**
  sealed historical evidence files and the coordinator task match their before
  hashes. The fresh unchanged ARTS-03 checkpoint also verifies **248 originals,
  152 sources, eight declarations and all 10 ARTS-03 tooling files**.

## Cleanup review

The directory is assigned from this module's own `mkdtempSync` return before
copy/symlink/write setup. An allocation failure leaves it undefined, so teardown
does nothing. A later setup failure leaves an owned partial root, which guarded
`rmSync(consumer, { recursive: true, force: true })` can remove. It never targets
the TMPDIR parent, prior fixtures or another fixture's root; directory symlinks
are removed as links, not traversed to delete external targets. This follows the
existing installed-consumer fs pattern. Cleanup errors are not swallowed.

The two real installed Node probes passed in a fresh ignored task TMPDIR, with
no owned consumer directories left afterward. Undefined/partial-startup behavior
was reviewed in the exact code, not fault-injected into the package tests.

## Actual sequential checks

From repo root, with absolute repo-local
`TMPDIR='<repo-root>/_tmp-arts-04-cleanup-20261108-155707'` (replace the root placeholder):

- `pnpm exec eslint packages/access-router/test/contracts/arts04-installed-exports.test.ts` — **passed**.
- `pnpm --filter @web-ts-toolkit/access-router test:contracts test/contracts/arts04-installed-exports.test.ts --reporter=default --reporter=json --outputFile.json='<repo-root>/_tmp-arts-04-cleanup-20261108-155707/exports.json' --includeTaskLocation`
  — **two passed / one file**, no failures/skips/todos; normal filtered build
  and unchanged guard preflight passed (103/64/51, exact union, 137/237 closure).
- `node docs/task-artifacts/access-router/20261108-094712-test-contract-separation/arts-03-verify-checkpoint.mjs` — **passed**.
- `git diff --check`, exact-edit/body/case/hash checks and supplement
  JSON/link/privacy/ignore review — **passed**.

[Supplement manifest](arts-04-cleanup-manifest.json) seals the new file identity
and these two evidence files; it does not rewrite the old seal. Raw logs/report,
consumer/dependency trees and temporary capture/verification scripts are omitted.
Exact argv, timings, exits, hashes and both per-case results are retained.

No full 93-case/layer/package or downstream run was needed or performed; the
other five runnable identities are unchanged. No production/original test/tooling
edit, further agent, commit, reset or unrelated deletion occurred. No jobs remain.
