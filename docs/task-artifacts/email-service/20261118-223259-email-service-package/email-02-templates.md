# EMAIL-02 templates and codecs handoff

Completion evidence for [EMAIL-02](../../../tasks/20261118-223259-email-service-package.md#email-02--implement-typed-templates-preparation-and-rendering).
This phase implemented preparation and shared codec boundaries only. The [V1 contract](v1-contract.md) still owns
admission, persistence, provider I/O, and lifecycle behavior. No store, worker, provider adapter or workspace
integration was added in this phase.

## Reuse in EMAIL-03 onward

These paths are **package-internal source modules**, not published deep imports. Only `createEmailTemplateRegistry`,
`defineLocalTemplate` and `defineSendGridTemplate` were added to the public root runtime exports.

- [`src/internal/command-codecs.ts`](../../../../packages/email-service/src/internal/command-codecs.ts):
  `validatePreparedCommand(scope, input)` verifies exact V1 shape, scope, the schedule/expiry relationship, provider
  and both hashes; it returns a detached, deeply frozen command. `parseCommandIdentity(scope, command)` returns
  `{ identity, command }` with the tagged key, intent hash and fingerprint; it does not inspect raw input or consult
  the clock, registry or provider. Its `command` is a detached static copy except for the opaque `input` reference.
  `validateAdmissionKey` and `encodeAdmissionKey` handle the `s:<id>` / `b:<batchId>:<itemId>` encoding. Encode only
  a validated key.
- [`src/internal/message-codecs.ts`](../../../../packages/email-service/src/internal/message-codecs.ts):
  `validateSnapshot(input)` yields `{ snapshot, snapshotHash }`, enforcing the full canonical byte bound as well as
  variant and metadata fields. Compare that hash against the stored digest when reading an unpruned snapshot; check
  the exact configured profile key/kind/mode before provider use. Reuse `validateProviderRef`, `validateTemplateIdentity`,
  `validateEnvelope`, `validateMailbox`, `validateSmtpContent`, `sendGridTemplateId`, `validateCorrelation`,
  `validateAttachmentRefs` / `validateAttachmentRef` and `validateExpiry`. `copyAttachmentBytes(validatedRef, input)`
  checks view length, rejects shared memory, copies, and checks SHA-256; it does not resolve, retry, or classify availability.
- [`src/internal/canonical-json.ts`](../../../../packages/email-service/src/internal/canonical-json.ts):
  `canonicalJson(input, maxBytes, code?)` returns `{ value, encoded }`: a frozen copy and the canonical UTF-8
  representation. Use `hashJson` for canonical digests and `sha256` for bytes or already-encoded strings. Do not use
  `JSON.stringify(value)` instead of `encoded` for a digest; JS reorders integer-looking keys. `copyJsonObject` enforces
  object-root data.
- [`src/internal/validation.ts`](../../../../packages/email-service/src/internal/validation.ts):
  descriptor-only readers `readRecord`, `readArray`, `plainKeys`, `ownData`; `scopeToken`, `identifier`, `opaqueToken`,
  `hashToken`, `unixMs`, `integer`, `boundedOption`, `utf8String`, `headerString`. Pass the error code for the later API boundary.
- [`src/internal/budget.ts`](../../../../packages/email-service/src/internal/budget.ts) exports `systemEmailClock`,
  `readClock`, `readCallOptions`, `createBudget` (`signal`, `check`, `remainingMs`, `close`) and `syncStage`.
  `CallbackSlot`, `runHostCallback` and `runSyncCallback` in
  [`src/internal/callbacks.ts`](../../../../packages/email-service/src/internal/callbacks.ts) are for trusted application
  code; they can abandon a wait, not actual provider/store I/O. Use `close()` in `finally` and check before dispatching a new
  stage. An internal child budget may be below the public override floor.

**For EMAIL-03 store insertion:** Call `validatePreparedCommand` on the bound scope before consuming or retaining
the snapshot. Use the validated tagged identity and compare against the committed winner; don't let a changed
snapshot hash override a matching fingerprint. Keep store-time guards separate from serialization: on a genuinely
new insert reject `preparedAt > storeNow + MAX_PREPARED_AT_SKEW_MS` and reject effective
`max(storeNow, scheduleAt ?? storeNow) >= expiresAt`. Use the existing constants; don't make expiry a pre-replay
check or extend it on relay. The codec does not validate the rest of `StoreAdmission`, row/lease/result/retention
shapes or UUIDs, or provide a store time/transaction. Those are store work.

**For EMAIL-07/08 admission:** Use the result of `parseCommandIdentity` for the committed scoped lookup and conflict
check before template lookup or relative expiry checks. On a genuine miss use the detached `command` to call a
typed registry; the internal parser cannot assert the business input type or registry membership. Keep and verify
the original identity across awaits, including when a caller injects a registry. For an outbox relay don't call a
registry: revalidate the staged DTO and compare its fingerprint. Hashes are equality checks, not authorization.
No durable replay or lost-acknowledgement behavior was exercised in EMAIL-02.

## Decisions and limitations

- `parseInput` handles opaque host objects. `parseData` sees a strict, frozen JSON copy, and its returned object is
  validated and copied independently. Templates never retain the local values after rendering. For async return
  values the package copies at the first fulfillment observer; it cannot prevent mutation before that observer.
- Native promises and method-based thenables are supported for preparers/loaders. Accessor-backed thenables can be
  wrapped in a host `async` function; the registry does not run an accessor to distinguish a thenable from a malformed
  DTO. Native promises accidentally returned from synchronous parsers/helpers fail in that stage and retain their slot
  until settlement. A trusted callback must expose its asynchronous work through its return value; the package cannot
  police background work scheduled by a host. An injected clock's `sleep` must honor abort.
- The local renderer uses the lazy pure Handlebars compiler entry `handlebars/dist/cjs/handlebars.js` from the installed,
  locked Handlebars 4.7.10. The package's default Node loader would install process-wide `.hbs`/`.handlebars` extension
  hooks. Keep this choice and the source-only declaration shim in mind when updating Handlebars. Each registry owns its
  helpers and cache; the built-in `log` helper is removed. Handlebars syntax and helpers are still trusted, not a sandbox.
  When extending the packed fixture to render in EMAIL-11, allow that exact compiler specifier in its import guard.
- Compilation, rendering, helpers, parsers and other synchronous JS cannot be preempted. Bounds are checked before
  starting subsequent stages and host helpers; `Reflect.ownKeys` must enumerate a record to detect hidden/symbol keys
  before width rejection, but there is no recursive traversal or sorting of an oversized record. File abort requests
  closure and waits for the opened descriptor to close before reporting completion. Node cannot forcibly interrupt every
  in-progress filesystem syscall; use suitable host paths and don't assume an exact return-time SLA for stalled FS I/O.
- The contract changes in this phase clarify frozen `parseData` input, rejecting accessor-backed thenables, and waiting for
  descriptor closure on abort. No serialization limit or store/handoff condition was weakened.

## Verification

Node 26.12.1, pnpm 11.24.0, TypeScript 6.0.3, Vitest 4.1.12, tsup 8.5.1. Serial from `<repo-root>` with `TMPDIR` set
to a fresh ignored repo-local directory:

```sh
pnpm --filter @web-ts-toolkit/email-service typecheck
pnpm --filter @web-ts-toolkit/email-service test:unit
pnpm --filter @web-ts-toolkit/email-service build:package
```

- Compile-only [`template-types.ts`](../../../../packages/email-service/test/unit/template-types.ts) checks public
  inference and expected type failures. All 42 unit tests passed in six package-local test files. The maintained
  coverage checks staged hash round trips, exact serialization limits, both prepare paths, error stages, runtime
  mismatch before callbacks, cache isolation and in-flight invalidation, file descriptors on abort, and callback
  slot retention after a deadline.
- Changed package paths passed Prettier and ESLint where applicable. Inspected emitted root declarations and used
  the package's own export map in a plain Node ESM/CJS smoke: both rendered an escaped synthetic template, returned
  a frozen DTO, and did not install Handlebars extension hooks. The first probe compared the extension table to a copy
  with a different prototype; comparing their entries instead passed. This was not an installed-tarball or minimum-Node run.
- Checked the handoff links, task anchor, nonignored destination, privacy and changed-file whitespace. The ignored scratch
  directories contained only disposable compile cache after test fixture cleanup; no scratch input is required.
- No provider or database tests, live mail, CI activation, workspace build/test/lint, or packed/release consumer
  verification ran. Fixtures are synthetic and maintained in `packages/email-service/test/unit/`; no third-party
  source, scratch dependencies, logs, generated builds, or mail data were archived.
