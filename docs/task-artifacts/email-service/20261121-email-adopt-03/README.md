# EMAIL-ADOPT-03 implementation handoff

Initial verification for [EMAIL-ADOPT-03](../../../tasks/20261121-022138-email-service-cross-project-adoption.md#email-adopt-03--make-provider-result-types-agree-with-accepted-evidence), on `39848121` plus the shared EMAIL-ADOPT-01/02 changes and this item. See the [reopened resolution](../20261121-email-adopt-03-reopened/README.md) for the later acceptance-evidence follow-up. Task status remains with the coordinator.

## Compatibility and evidence

- [`ProviderResult`](../../../../packages/email-service/src/contracts/provider.ts) now couples reason, outcome, retry, and stage. Both SMTP acceptance reasons require recipients. Only compatible reasons and stages allow optional evidence. The [evidence table](../../../../packages/email-service/src/internal/attempt-codecs.ts) has a compile-time check that its provider tuples and the public union agree in both directions.
- This intentionally tightens TypeScript source compatibility for custom providers returning independently widened fields, missing SMTP recipients, or incompatible metadata. [`AttemptResult`](../../../../packages/email-service/src/contracts/provider.ts) remains the broader persisted/ledger shape. Entrypoints, dependency requirements, wire classifications, record formats, retry policy, and cancellation semantics are unchanged.
- New [worker regressions](../../../../packages/email-service/test/unit/worker-fences.test.ts) supply missing recipients, contradictory safe-retry evidence, and both SendGrid mode mismatches. All produce a committed `unknown / transport_uncertain`, never an automatic retry or a second submission. Existing envelope coverage and late-result/cancellation tests still run.
- The packed [ESM](../../../../packages/email-service/test/packed-consumer/fixtures/esm.mts) and [CommonJS](../../../../packages/email-service/test/packed-consumer/fixtures/cjs.cts) fixtures accept complete SMTP success/partial and SendGrid live/sandbox results and reject the invalid tuples without dropping existing type cases. The [installed adapter example](../../../../packages/email-service/README.md#implement-a-custom-provider) is compiled and run against the memory queue with outbound mail blocked; the rollout and expiry guidance remains intact.

## Serial verification

Node 26.12.1, pnpm 11.24.0, TypeScript 6.0.3. Each package script below was invoked as `pnpm --filter @web-ts-toolkit/email-service <script>`, with a fresh ignored checkout-local `TMPDIR`.

<!-- prettier-ignore -->
| Script | Result |
| --- | --- |
| `typecheck` | Pass |
| `test:unit` | 235 passed in 19 files |
| `test:lifecycle` | 34 passed in 3 files |
| `test:smtp` | 65 passed in 2 files; 2 optional extended timing cases skipped (`SMTP_CAPACITY_TIMING` not set to `1`) |
| `test:sendgrid` | 91 passed in 3 files |
| `build` | Pass; inspected the emitted ESM and CJS `ProviderResult` declarations |
| `test:packed-consumer` | 12 passed, none skipped; ordinary and flattened-release tarballs, four optional-peer profiles each, strict NodeNext ESM/CJS and Bundler ESM |

`pnpm lint`, targeted `pnpm exec prettier --check` for the changed package files, and `git diff --check` passed. The packed lane used `EMAIL_SERVICE_CONSUMER_OFFLINE=1` with a warm pnpm store and a prepared MongoDB 8.2.6 binary (`MONGOMS_SYSTEM_BINARY`, `MONGOMS_VERSION=8.2.6`, `MONGOMS_RUNTIME_DOWNLOAD=false`) for its disposable loopback replica sets. The standalone `test:mongodb` lane, other Node versions, extended SMTP timing, release publication, and live providers were not exercised. Raw logs, generated packages, dependencies, and disposable databases are omitted; the maintained tests are the reproduction inputs.
