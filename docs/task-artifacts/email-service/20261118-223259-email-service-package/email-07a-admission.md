# EMAIL-07A admission verification and handoff

Admission checkpoint for [EMAIL-07](../../../tasks/20261118-223259-email-service-package.md#email-07--implement-job-service-and-worker-lifecycle).
The [V1 contract](v1-contract.md#admission-staging-and-batches) and public types are unchanged. EMAIL-07 remains
`in_progress`: worker implementation (07B) and integrated lifecycle evidence (07C) are outstanding.

## Implemented boundary

- The root named [`createEmailService`](../../../../packages/email-service/src/service.ts) binds one scope to a
  caller-ready store and registry. It snapshots effective retry and retention policies at creation; only a fresh
  insertion saves them. Its only store calls are `findAdmission` and `insert`; it never calls a provider.
- `enqueue` uses `parseCommandIdentity` before its first await. The key, explicit intent, profile, template key and
  schedule are detached; only the opaque input is retained by reference for the host parser on a miss. The
  first operation is the exact scoped committed lookup. A hit either returns the current redacted summary or
  throws `idempotency_conflict`, independently of template availability, current policies, expiry and payload
  pruning. The identity guard, not payload retention, limits the replay guarantee.
- The built-in registry reuses its original pipeline and slots rather than adding a second limit. For an injected
  registry, the same object across services shares eight outstanding preparation slots per module instance. A
  cancelled/timed-out wait does not free a slot until the callback actually settles, and late values never start
  an insert. There is no process-wide limit across unrelated registry objects or separately loaded builds. The
  service validates and detaches the V1 prepared DTO and checks both hashes and all original static metadata.
- `enqueuePrepared` validates and copies the staged DTO before lookup, never invokes the registry and never
  recalculates expiry from relay time. Existing matching fingerprint wins even if the supplied snapshot hash is
  different. Freshness and skew for new jobs are decided by store time, not the admission clock.
- Lookup, preparation, insert and confirmation share one elapsed admission budget (10s by default), with up to
  5s for preparation and 5s for each store call, further shortened by the remaining budget. The caller can use
  a 50–60,000ms override. A duplicate or unconfirmed write triggers one exact-key confirmation read when time
  remains. A matching committed winner returns `replayed`, a conflicting one throws `idempotency_conflict`,
  and an absent or unproven winner returns `write_unconfirmed`. There is no second insert in the same call.
- Adapter responses are descriptor-validated, cross-checked and copied into deeply frozen summaries. A
  malformed initial read is `store_incompatible`, not a miss. A malformed or late insert acknowledgement
  is not proof. Boundary-specific own `code` allowlists work without `instanceof`; errors are reconstructed
  with fixed messages and no raw cause. Unknown store errors are redacted (`store_unavailable` for a read,
  `write_unconfirmed` for a possibly dispatched write). The service waits for actual store settlement after
  signalling abort; a custom store must cooperate and enforce its driver/server deadlines. Trusted synchronous
  callbacks cannot be preempted.

## 07B / 07C continuation

These are package-internal source paths, not published deep imports.

- [`internal/store-call.ts`](../../../../packages/email-service/src/internal/store-call.ts) provides
  `runStoreCall(clock, budget, { maxMs, effect, invoke, accept, definite? })`. Take the monotonic dispatch
  timestamp inside `invoke` for claim/renew/marker safety windows. The helper clamps the signal and `StoreCall`
  to the enclosing budget, validates/copies acknowledgement evidence via synchronous `accept`, and never races
  outstanding I/O against a timer. A pre-dispatch stop is definite; an invoked mutation with unproven effect
  maps conservatively to `write_unconfirmed`, including bare `aborted` or `deadline` from the store. Pass only
  true primitive-specific definite rejections; adapter code `store_unavailable` means a known failure, not lost
  ACK. `STORE_PERSISTENCE_ERRORS` is the four-code persistence subset for batch. Do not use this helper as a
  provider submit wrapper or as a substitute for worker state/evidence accounting.
- [`internal/budget.ts`](../../../../packages/email-service/src/internal/budget.ts) adds `createChildBudget`.
  Use `check()` before dispatch and close a child in `finally`; it observes the parent boundary and preserves
  the parent's deadline code. Use a separate finish grace after stop as the contract specifies.
  [`internal/callbacks.ts`](../../../../packages/email-service/src/internal/callbacks.ts) still owns bounded host
  abandonment, not provider I/O. `bindMethod` captures a trusted port's data method without invoking
  configuration getters. Use [`allowedErrorCode`](../../../../packages/email-service/src/internal/validation.ts)
  when an allowlisted foreign error is useful; never return the original error object.
- [`internal/job-summary.ts`](../../../../packages/email-service/src/internal/job-summary.ts) decodes the
  redacted store summary without accessing the payload, fences or raw results. Worker/admin still need to check
  exact operation IDs, lease/phase, snapshot and attempt context as applicable. In particular, never authorize
  submit from a read of a possibly committed marker. See the [store](email-03-store.md#provider--worker--admin-continuation),
  [Mongoose](email-04-mongoose.md#next-phase), [SMTP](email-05-smtp.md) and
  [SendGrid](email-06-sendgrid.md#reuse-for-email-07) handoffs.
- In 07C, run service and worker on both actual store adapters, with separate ready Mongo connections and an
  exact committed-winner replay after insert response loss. Include the Mongoose edge where a wire duplicate
  is followed by a failed confirmation read inside
  [`MongoOperations.insert`](../../../../packages/email-service/src/stores/mongoose/operations.ts).
  That adapter path currently propagates read errors from `byAdmission`/`byJob`; distinguish a definite
  unrelated job-ID collision or pre-write store failure from an inability to prove the winner after a possible
  admission collision. If needed, narrow the uncertainty translation to that adapter phase, not to all insert
  `store_unavailable` errors. No concrete store was changed or executed against MongoDB in 07A.

## 08 batch reuse

Validate the outer envelope and unique item IDs first; construct each tagged batch key and pass the exact command
to [`parseCommandIdentity`](../../../../packages/email-service/src/internal/command-codecs.ts) before any write,
using its detached `.command` and `.identity`. For a locally constructed service,
`findServiceAdmission(service)` returns the very same parsed-command admission implementation as `enqueue`.
Pass the batch's existing `OperationBudget` directly; do not close it after an item, reparse the input, start
a new item timer, or call the registry separately. For a structural service or service from another module copy,
fall back to its public `enqueue` with the detached command, remaining time and batch signal (which still caps
a child below the public override floor). Treat structural service output/errors as boundary data. Neither path
requires adding methods, symbols or clock configuration to the public service.

## Verification and limits

Node 26.12.1, pnpm 11.24.0, TypeScript 6.0.3, Vitest 4.1.12 and tsup 8.5.1. From `<repo-root>`, serially with a
fresh verified gitignored repository-local `TMPDIR`:

```sh
pnpm --filter @web-ts-toolkit/email-service typecheck
pnpm --filter @web-ts-toolkit/email-service test:unit
pnpm --filter @web-ts-toolkit/email-service build:package
pnpm exec eslint packages/email-service/src/{index,service}.ts \
  packages/email-service/src/internal/{attempt-codecs,budget,callbacks,command-codecs,job-record,job-summary,store-call,validation}.ts \
  packages/email-service/src/templates/registry.ts \
  packages/email-service/test/unit/{service.test,service-budget.test,template-types}.ts
```

- **105 tests, 10 files passed** (27 new admission tests).
  [`service.test.ts`](../../../../packages/email-service/test/unit/service.test.ts) covers static validation and
  copying, competing same/different intent, replay of accepted/pruned/retiring jobs, scoped keys, outbox validation
  and expiry, injected DTO mismatches and mutation, policy/diagnostic privacy, and frozen outputs.
  [`service-budget.test.ts`](../../../../packages/email-service/test/unit/service-budget.test.ts) uses a manual
  clock and explicit barriers for lost-ACK on both sides, a later commit after a confirmation miss, late output,
  positive confirmation before the deadline, exact remaining budgets, callback retention and reuse.
  `template-types.ts` checks the unchanged per-template type inference and readonly public result.
- The root's emitted ESM/CJS and matching declarations include `createEmailService`; the private clock and
  batch seams are not exports. Unit tests exercise structurally separate errors; this was not a packed consumer
  execution. Changed-path Prettier, ESLint, whitespace and local artifact-link checks passed.
- Acceptance in the admission tests is fabricated store evidence, not an SMTP or SendGrid submission. Store-seam
  ACK injection is not wire failure. No MongoDB, packed consumer, providers, live mail, workspace build/test/lint,
  CI changes, or deployment ran. All fixtures are maintained and synthetic; scratch had only disposable compile
  cache. No scratch files, raw data, binaries, builds, dependencies or logs were archived.
