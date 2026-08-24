# Mongoose-RxDB Review Remediation

Created: 2026-08-23 15:16:58 PDT

Package: `packages/mongoose-rxdb`

## Objective

Remediate confirmed data-safety, query-correctness, persistence, concurrency, typing, packaging, performance, and maintainability gaps in `@web-ts-toolkit/mongoose-rxdb`. The end state must fail closed for untrusted filters and requested persistent storage, apply writes atomically through one schema-aware path, expose truthful Mongoose-shaped behavior and TypeScript declarations, isolate RxDB behind a testable persistence boundary, and verify the installed package rather than only repository source imports.

## Scope And Working Rules

- Add a focused regression that fails on the current implementation before each behavioral fix.
- Distinguish intentionally supported Mongoose compatibility from merely Mongoose-shaped naming. Remove or reject unsupported behavior rather than accepting options that do nothing.
- Prefer shared enforcement points: filter normalization for query safety, one write-normalization pipeline for all mutations, one connection-owned collection registry, and one metadata-free persistence port.
- Preserve unrelated worktree changes. The review started while other packages and `CHANGELOG.md` had concurrent edits; do not revert or modify them.
- Do not manually edit `packages/mongoose-rxdb/dist/`; rebuild generated output.
- Keep `packages/mongoose-rxdb/README.md` authoritative for installed consumers and update `website/docs/packages/mongoose-rxdb.md` with it when public behavior changes.
- Treat `apps/mongoose-rxdb-example` as a consumer fixture, not as a place to hide package typing gaps with local casts.
- Run package tests serially. The package test script rebuilds transitive dependencies and shared `dist/` output; agents must not run package or root build/test commands concurrently.
- Use isolated temporary directories and unique RxDB database/collection names in tests. Clean up databases, files, listeners, and subprocesses deterministically.
- Do not broaden public exports while refactoring internals. Removing currently exported low-level helpers requires the maintainer decision recorded below and release notes.

## Non-Goals

- Do not implement full Mongoose parity, transactions, aggregation, population, cursors, discriminators, or index synchronization as part of this plan.
- Do not emulate uniqueness with a race-prone read-before-insert check and call it a database constraint.
- Do not preserve silent memory fallback, ignored connection strings, ignored options, or fail-open sanitization solely for compatibility.
- Do not add `llms.txt` before metadata, declarations, README examples, and packed-consumer behavior are correct.
- Do not perform a broad immutable-query rewrite unless the smaller execution guard and state-copying fix proves insufficient.

## Review Baseline

Confirmed on 2026-08-23 before this task file was created:

- `pnpm --filter @web-ts-toolkit/mongoose-rxdb test`: passed, 2 files and 21 tests.
- `pnpm exec tsc --noEmit -p packages/mongoose-rxdb/tsconfig.json`: passed.
- `pnpm exec eslint "packages/mongoose-rxdb/src/**/*.ts" "packages/mongoose-rxdb/test/**/*.ts"`: passed.
- `npm pack --dry-run --json` from the package included the expected README, manifest, and root/storage CJS, ESM, and declaration outputs. This did not validate the release-time placeholder/workspace manifest rewrite.
- Isolated CJS and ESM smoke probes loaded both root and `./storage` entrypoints, but mixed loading produced different `Schema` identities and different `defaultConnection` singletons.
- Runtime probes confirmed dropped update options, invalid updates bypassing validators, lost concurrent increments, incorrect skip/limit, ignored projection, incorrect `updateOne()` counts, replayed write queries, shallow query clones, RxDB metadata leakage, lost nested mutations, collection creation races, and silent string-to-memory connection behavior.
- Strict declaration probes confirmed that `await User.find()` is not a valid TypeScript await expression, inferred document fields are not available without casts, and the README's unparameterized schema style can infer constructor types instead of document values.
- Existing tests import `../src/*`; no test installs or executes the packed package.
- The SQLite smoke test can select Premium because it is installed as a dev dependency, accepts memory fallback as success, and does not reopen data to prove persistence.

## Priorities

- P0: a filter can broaden into a destructive match-all operation, requested durable storage can silently become volatile, or concurrent writes can lose data.
- P1: broken public behavior, lifecycle races, validation or middleware bypass, invalid published declarations, or unbounded avoidable work on normal query paths.
- P2: encapsulation, readability, package discoverability, compatibility precision, and maintainability gaps without an independent P0/P1 outcome.
- P3: optional API reduction or structural redesign that requires compatibility evidence and maintainer approval.

## Wave 1: Regression And Consumer Harnesses

### Task MRX-01: Build Deterministic Adapter, Concurrency, And Packed-Consumer Harnesses

Status: completed

Priority: P1

Suggested agent: TypeScript package and integration-test specialist

Dependencies: none

Primary ownership:

- focused helpers and fixtures under `packages/mongoose-rxdb/test/`
- strict consumer fixtures under `packages/mongoose-rxdb/test-decl-consumer/` or equivalent
- packed-consumer harness only; no production behavior changes beyond narrow dependency injection

Finding:

The two current test files exercise repository source with one shared real memory database. They do not verify adapter call counts, deterministic storage backend selection, collection initialization failures, concurrent writes, published exports, emitted declarations, npm/pnpm installation, CJS/ESM loading, or persistence across process/database reopen. Existing `any` casts also conceal declaration failures.

References:

- `packages/mongoose-rxdb/test/core.test.ts:1-39`
- `packages/mongoose-rxdb/test/core.test.ts:64-85`
- `packages/mongoose-rxdb/test/_sqlite-smoke.test.ts:18-74`
- `packages/mongoose-rxdb/package.json:17-41`
- `packages/mongoose-rxdb/tsup.config.ts:3-9`

Implementation requirements:

1. Add a typed fake persistence adapter and spies for reads, writes, hydration, count, bulk operations, and initialization without importing RxDB.
2. Add deferred-promise/barrier helpers for deterministic concurrent update and collection-initialization tests; do not use arbitrary sleeps.
3. Add subprocess/temp-directory helpers that clean up databases, files, and child processes after success and failure.
4. Add strict NodeNext and Bundler consumer fixtures with `skipLibCheck: false`, including `.mts` and `.cts` entrypoints.
5. Add a packed runtime harness for root and `./storage` named/default imports in CJS and ESM. Use the repository's release manifest rewrite path so placeholders and `workspace:*` are tested as published.
6. Add a deterministic storage-loader seam or isolated dependency trees so memory, native trial, npm SQLite, Premium, no-backend, and backend-open-failure paths can be selected independently.
7. Keep new harness APIs internal to tests unless later tasks identify a real consumer need.

Acceptance criteria:

- A focused test can pause two mutations after their common read and release them concurrently.
- A focused test can make collection initialization succeed, reject, or remain pending without unhandled rejections.
- Fake-adapter tests can assert exact query, hydration, and mutation call counts.
- Strict installed-consumer fixtures compile root and storage imports under NodeNext and Bundler settings.
- Packed CJS and ESM smoke tests execute from a clean temporary installation, not source aliases.
- `pnpm --filter @web-ts-toolkit/mongoose-rxdb test` passes.

Completion evidence:

- Added internal async barrier/deferred helpers, temp/subprocess cleanup helpers, and a typed fake persistence adapter under `packages/mongoose-rxdb/test/support/`.
- Added focused fake-adapter, concurrent mutation barrier, collection initialization pending/success/reject, and deterministic storage-loader tests under `packages/mongoose-rxdb/test/`.
- Added strict installed-consumer declaration fixtures under `packages/mongoose-rxdb/test-decl-consumer/` for NodeNext and Bundler, including `.mts` and `.cts` entrypoints with `skipLibCheck: false`.
- Added a packed-consumer harness that stages release-like tarballs through the repository publish manifest rewrite path, installs into clean temporary consumers, and executes root and `./storage` named/default imports in CJS and ESM.
- Added the internal `src/storage/loader.ts` seam used by `createSqliteDatabase()` to select memory, Premium, native trial, npm SQLite, no-backend, and backend-open-failure paths deterministically in tests.
- Added a rejection handler to the collection readiness side-effect promise so controlled collection-initialization rejection tests do not produce unhandled rejections.
- Verification passed: `pnpm --filter @web-ts-toolkit/mongoose-rxdb test`.
- Verification passed: `pnpm exec tsc --noEmit -p packages/mongoose-rxdb/tsconfig.json`.

## Wave 2: Immediate Data Safety

### Task MRX-02: Make Filter Sanitization Fail Closed And Bound Regex Risk

Status: completed

Priority: P0

Suggested agent: query-language security specialist

Dependencies: MRX-01

Primary ownership:

- `packages/mongoose-rxdb/src/query-compiler.ts` filter normalization only
- focused sanitizer/security tests
- sanitizer sections in package and website documentation

Finding:

`sanitizeFilter()` drops an unknown top-level `$` key. An input such as `{ $where: 'evil()' }` therefore becomes `{}`, and a caller following the documented pattern can pass that match-all result to `deleteMany()` or `updateMany()`. Direct assignment into an ordinary output object also lets an own JSON `__proto__` key alter the result prototype and collapse the effective selector. The sanitizer permits attacker-controlled `$regex` patterns and flags without a size, flag, or complexity policy; RxDB's query stack ultimately executes native regular expressions across matching records.

References:

- `packages/mongoose-rxdb/src/query-compiler.ts:7-54`
- `packages/mongoose-rxdb/src/query-compiler.ts:56-119`
- `packages/mongoose-rxdb/README.md:83-97`
- `website/docs/packages/mongoose-rxdb.md:270-286`
- `packages/mongoose-rxdb/test/core.test.ts:214-233`

Implementation requirements:

1. Reject invalid top-level operators and malformed logical values with a package-owned error; never remove input in a way that broadens the selector.
2. Normalize into null-prototype objects or otherwise reject dangerous keys including `__proto__`, `prototype`, and `constructor` at the filter boundary.
3. Validate logical operator operands recursively, including depth and total-node limits so request-controlled recursion and arrays are bounded.
4. Implement the maintainer-approved regex policy: reject request-derived regex by default, or enforce documented pattern length, allowed flags, and a defensible complexity check.
5. Ensure `translateFilter()` also rejects unsupported operators when callers do not opt into sanitization; do not forward unknown operators through `translateOps()`.
6. Update the README and website together. State whether sanitization is caller-invoked or automatic and show fail-closed destructive-operation behavior.

Acceptance criteria:

- `$where`, `$func`, malformed `$and`/`$or`/`$nor`, and dangerous object keys cannot produce `{}` or a broader selector.
- `deleteMany(sanitizeFilter(payload))` and `updateMany(sanitizeFilter(payload), ...)` leave unrelated documents unchanged for every rejected payload.
- Excessive filter nesting and logical-array width fail before adapter execution.
- Invalid regex flags and over-budget or disallowed patterns fail before adapter execution.
- A subprocess timeout regression covers a known pathological regex without hanging the main test runner.
- `pnpm --filter @web-ts-toolkit/mongoose-rxdb test` passes.

Completion evidence:

- Added package-owned `QueryFilterError` and fail-closed recursive filter normalization in `packages/mongoose-rxdb/src/query-compiler.ts`.
- Invalid top-level operators, unsupported field operators, malformed logical operands, dangerous keys, excessive nesting, and excessive logical width now reject instead of producing `{}` or a broader selector.
- Normalized filters/selectors use null-prototype objects and literal nested objects are cloned after dangerous-key validation.
- Regex filters now use a documented bounded policy: 128-character pattern budget, allowed flags `i`, `m`, `s`, `u`, JS syntax validation, and rejection of duplicate/invalid flags plus known high-risk shapes including nested quantified groups.
- Added focused MRX-02 regressions in `packages/mongoose-rxdb/test/sanitize-filter-security.test.ts`, including destructive `deleteMany(sanitizeFilter(payload))` and `updateMany(sanitizeFilter(payload), ...)` unchanged-document checks for every rejected payload, direct `translateFilter`/query-bypass adapter-call checks, depth/width checks, regex checks, and a subprocess timeout guard for `^(a+)+$`.
- Updated `packages/mongoose-rxdb/README.md` and `website/docs/packages/mongoose-rxdb.md` with caller-invoked sanitization, fail-closed destructive-operation behavior, and regex policy.
- Verification passed: `pnpm --filter @web-ts-toolkit/mongoose-rxdb test`.

### Task MRX-03: Make Storage Selection Explicit And Persistence Fail Closed

Status: completed

Priority: P0

Suggested agent: Node storage and package-resolution specialist

Dependencies: MRX-01

Primary ownership:

- `packages/mongoose-rxdb/src/storage/index.ts`
- storage option/result types and deterministic backend tests
- `packages/mongoose-rxdb/package.json` peer dependency declarations
- storage documentation

Finding:

`createSqliteDatabase({ filePath })` resolves successfully with volatile memory when every SQLite backend is unavailable, using only a warning to signal loss of persistence. Backend import errors are swallowed without preserving causes, while failures during final database creation do not advance to another tier. `rxdb` and `rxjs` are optional peers even though both documented helpers require them; dynamically resolved `rxdb-premium` and `sqlite3` are not declared as optional peers. Documentation describes `filePath` as an exact file even though the trial adapter receives it as `databaseNamePrefix`.

References:

- `packages/mongoose-rxdb/src/storage/index.ts:33-50`
- `packages/mongoose-rxdb/src/storage/index.ts:52-136`
- `packages/mongoose-rxdb/package.json:45-64`
- `packages/mongoose-rxdb/README.md:7-18`
- `packages/mongoose-rxdb/README.md:68-81`
- `packages/mongoose-rxdb/test/_sqlite-smoke.test.ts:18-74`

Implementation requirements:

1. Make a persistent request fail closed by default when no SQLite backend can be opened. Memory fallback must require an explicit option and return or expose the selected backend.
2. Preserve backend-specific causes so callers can distinguish missing dependency, license failure, unsupported runtime, and database-open failure.
3. Define exact semantics for the path/prefix option and rename it if needed; update docs and release notes for a breaking rename or fallback change.
4. Align required and optional peer metadata with actual runtime imports, using bounded supported ranges.
5. Remove impossible claims about `sqlite3` in non-Node runtimes and resolve the Node `>=22` versus “older Node” documentation conflict.
6. Verify each backend tier in isolation and prove durable paths survive close and reopen in a second process.

Acceptance criteria:

- Requesting persistent SQLite with no usable backend rejects and never creates a memory database unless explicit fallback is enabled.
- Callers can inspect which backend was selected.
- A failed Premium initialization follows the documented fallback/error policy with its cause preserved.
- Native trial and npm SQLite tests assert actual generated paths and persistence after reopen.
- Clean npm and pnpm packed installations resolve each declared optional backend when present and fail predictably when absent.
- `package.json`, declarations, README, and website agree on dependencies, Node support, backend order, and path semantics.

Completion evidence:

- Changed SQLite selection to try Premium, trial native, and trial npm as openable tiers; persistent requests now reject with `SqliteStorageError` when no SQLite backend can be opened.
- Added explicit `{ allowMemoryFallback: true }` memory fallback and exposed `sqliteBackend` plus `sqliteStorageInfo` on databases returned by `createSqliteDatabase()`.
- Preserved backend-specific load/open failures through `SqliteStorageError.causes` and successful `sqliteStorageInfo.fallbackCauses`.
- Documented `filePath` semantics: exact `sqliteDatabasePath` for Premium and `databaseNamePrefix` for RxDB trial backends; no rename was needed.
- Aligned package peer metadata so `rxdb` and `rxjs` are required bounded peers, while `rxdb-premium` and `sqlite3` are optional bounded peers; added workspace build-policy metadata for optional native `sqlite3`.
- Removed non-Node and older-Node sqlite3 claims from package and website docs; documented Node 22+ support and the fail-closed fallback break without editing `CHANGELOG.md`.
- Added deterministic storage-loader regressions for default fail-closed behavior, explicit memory fallback, fallback cause preservation, backend annotation, and trial path-prefix arguments.
- Updated the SQLite smoke to assert selected backend/path metadata and, when a real SQLite backend is available, verify file creation and persistence after a second-process reopen.
- Added packed-manifest peer metadata assertions and a clean npm packed-install runtime import smoke alongside the existing pnpm packed-consumer checks.
- Verification passed: `pnpm exec vitest run --config ../../vitest.config.ts test/storage-loader.test.ts test/_sqlite-smoke.test.ts test/packed-consumer.test.ts`.
- Verification passed: `pnpm --filter @web-ts-toolkit/mongoose-rxdb test`.
- Verification passed: `pnpm exec tsc --noEmit -p packages/mongoose-rxdb/tsconfig.json`.

### Task MRX-04: Serialize Connection And Collection Lifecycles

Status: completed

Priority: P1

Suggested agent: asynchronous lifecycle specialist

Dependencies: MRX-01, MRX-03

Primary ownership:

- `packages/mongoose-rxdb/src/model.ts` connection/model/collection lifecycle
- lifecycle and collection-sharing tests

Finding:

Each `buildModel()` independently checks `db.collections` and starts `addCollections()`. Concurrent models for the same lowercased collection can race, one readiness promise can reject, and the unhandled promise returned by `promise.then(...)` can terminate the process even when the exposed promise is handled. Models are registered before collection initialization succeeds. Reconnect replaces the database without closing or rebinding existing models, and disconnect does not coordinate pending collection creation. The public string overload is ignored and silently opens memory storage.

References:

- `packages/mongoose-rxdb/src/model.ts:36-70`
- `packages/mongoose-rxdb/src/model.ts:72-103`
- `packages/mongoose-rxdb/src/model.ts:107-126`
- `packages/mongoose-rxdb/src/model.ts:178-181`
- `packages/mongoose-rxdb/src/model.ts:219-239`

Implementation requirements:

1. Add explicit disconnected, connecting, connected, closing, and failed connection states with single-flight connect/disconnect behavior.
2. Remove the string overload or reject unsupported URLs before creating storage; never interpret a string as a request for memory.
3. Own a collection registry keyed by normalized collection name containing one initialization promise, adapter, and stable schema fingerprint.
4. Share initialization for equivalent schemas and reject incompatible same-name or case-colliding schemas deterministically.
5. Do not leave failed models in `Connection.models`; handle all internally derived promise rejections.
6. Define reconnect and disconnect-during-initialization behavior. Existing models must not retain adapters to a closed database.
7. Clarify that model overwrite does not migrate persisted collection schemas unless migration support is explicitly implemented later.

Acceptance criteria:

- Equivalent models targeting one normalized collection cause one `addCollections()` call and share readiness.
- Incompatible schemas fail with model and collection context and produce no `unhandledRejection`.
- Failed model compilation is absent from `modelNames()` and can be retried according to a documented policy.
- Disconnect during pending initialization settles deterministically with no live adapter.
- Reconnect is either rejected or closes and invalidates previous state under a tested contract.
- `connect('...')` is a compile-time error after removal or a clear runtime error if retained temporarily.

Completion evidence:

- Added explicit `Connection.state` values (`disconnected`, `connecting`, `connected`, `closing`, `failed`) with single-flight connect/disconnect behavior in `packages/mongoose-rxdb/src/model.ts`.
- Removed the public TypeScript string overload from `Connection#connect` and root `connect`; retained a runtime guard that rejects strings before any storage factory is created.
- Added a connection-owned collection registry keyed by normalized lower-case collection name with one initialization promise, one adapter, and a stable schema fingerprint.
- Equivalent same-collection schemas now share one `addCollections()` call and adapter; incompatible same-name or case-only collection collisions reject deterministically before storage is touched.
- Collection initialization failures clear the failed model from `Connection.models`; internally derived readiness promises are catch-handled to avoid unhandled rejections.
- `disconnect()` invalidates pending collections and existing model adapters, clears model registrations, and rejects later use of stale model objects. Reconnect while already connected is rejected; reconnect after disconnect requires fresh model compilation.
- Documented the lifecycle/reconnect/string-connection contract and the model overwrite/no schema-migration limitation in the package README and website docs.
- Added focused lifecycle regressions in `packages/mongoose-rxdb/test/collection-init-harness.test.ts`, plus strict declaration consumer negative checks for unsupported connection strings.
- Verification passed: `pnpm --filter @web-ts-toolkit/mongoose-rxdb test`.
- Verification passed: `pnpm exec tsc --noEmit -p packages/mongoose-rxdb/tsconfig.json`.

## Wave 3: Write Correctness And Concurrency

### Task MRX-05: Centralize Schema-Aware Write Normalization

Status: completed

Priority: P1

Suggested agent: schema and data-normalization specialist

Dependencies: MRX-04

Primary ownership:

- `packages/mongoose-rxdb/src/converter.ts` casting/storage normalization
- `packages/mongoose-rxdb/src/document.ts` validation primitives
- `packages/mongoose-rxdb/src/query-compiler.ts` update-plan normalization
- focused normalization tests

Finding:

Document creation casts values, while query updates write raw values. A numeric `$set` can persist a string that hydration later recasts, hiding invalid storage. Dates are cast to `Date` while the RxDB schema declares string/number values. Dotted paths become literal keys, and query updates do not enforce immutable or primary-key restrictions. Defaults, casting, validation, and storage serialization have separate or missing paths.

References:

- `packages/mongoose-rxdb/src/converter.ts:106-155`
- `packages/mongoose-rxdb/src/document.ts:19-40`
- `packages/mongoose-rxdb/src/document.ts:171-204`
- `packages/mongoose-rxdb/src/query-compiler.ts:152-182`
- `packages/mongoose-rxdb/src/converter.ts:46-70`

Implementation requirements:

1. Define one normalized update plan and one domain-to-storage conversion pipeline used by create, insert-many, save, operator updates, replacement updates, and upserts.
2. Cast update operands against the target schema path before persistence; reject incompatible arithmetic and collection operations.
3. Serialize dates to one documented storage representation and hydrate them consistently across memory and SQLite.
4. Implement dotted-path access without allowing dangerous path segments or literal dotted top-level keys.
5. Reject `_id`, immutable-path, RxDB metadata, and unknown operator modification at the shared write boundary.
6. Ensure validation evaluates the exact normalized value that will be persisted.

Acceptance criteria:

- Query updates and document saves persist identical storage types for every supported primitive and nested value.
- Invalid `$set`, `$inc`, `$push`, and dotted paths fail before adapter mutation.
- Dates round-trip identically through memory and SQLite contract tests.
- `_id`, immutable fields, `_rev`, `_meta`, `_attachments`, and `_deleted` cannot be changed through any write route.
- A JSON update containing `__proto__`, `prototype`, or `constructor` cannot alter any object prototype.
- All write entrypoints use the shared normalization pipeline in adapter-spy tests.

Completion evidence:

- Added `WriteNormalizationError`, schema-aware `documentToStorage()` / `storageToDocument()` conversion, normalized update plans, storage update application, ISO-string date serialization, dotted-path access, and dangerous/protected-path rejection in `packages/mongoose-rxdb/src/converter.ts`.
- Routed document save, create/insertMany through save, query operator updates, replacement-style updates, and supported `findOneAndUpdate(..., { upsert: true })` through the shared normalization/conversion pipeline.
- Query hydration and `findById()` now hydrate storage values through `storageToDocument()`, including Date restoration and RxDB metadata stripping.
- Validation for saves and `runValidators` query updates now evaluates normalized storage-shaped values before adapter mutation.
- Added focused fake-adapter MRX-05 regressions in `packages/mongoose-rxdb/test/write-normalization.test.ts` for storage type parity, dotted paths, invalid operands, protected paths, dangerous segments, upsert normalization, and pre-mutation validation.
- Extended the SQLite smoke reopen contract to verify persisted dates hydrate back to identical `Date` values when a SQLite backend is available.
- Documented ISO date storage, shared write normalization, dotted-path behavior, and rejected write paths/operators in the package README and website docs.
- Verification passed: `pnpm exec tsc --noEmit -p packages/mongoose-rxdb/tsconfig.json`.
- Verification passed: `pnpm --filter @web-ts-toolkit/mongoose-rxdb test`.

### Task MRX-06: Make Query Mutations Atomic, Bounded, And Truthful

Status: completed

Priority: P0

Suggested agent: RxDB concurrency specialist

Dependencies: MRX-05

Primary ownership:

- `packages/mongoose-rxdb/src/rx-adapter.ts` mutation capabilities
- `packages/mongoose-rxdb/src/query.ts` update/delete execution
- mutation concurrency and result tests

Finding:

Query updates read all matching records, calculate a full stale replacement outside RxDB, perform a second ID lookup, and call `incrementalPatch()`. Concurrent `$inc` operations can both compute the same value and lose one write; full stale patches can overwrite unrelated changes. `updateOne()` materializes every match, reports all matches in `matchedCount`, and increments `modifiedCount` for no-op writes. Delete operations similarly perform an initial scan plus a lookup per record.

References:

- `packages/mongoose-rxdb/src/query.ts:216-237`
- `packages/mongoose-rxdb/src/query.ts:239-264`
- `packages/mongoose-rxdb/src/rx-adapter.ts:43-70`
- `packages/mongoose-rxdb/test/core.test.ts:186-195`

Implementation requirements:

1. Move update-plan application into adapter-owned `incrementalModify()` callbacks so each retry computes from the current document.
2. Add operation-specific persistence methods for one/many update and delete rather than passing stale full records between layers.
3. Constrain one-document operations before materializing results and eliminate redundant ID lookups.
4. Return accurate matched, modified, and deleted counts; compare normalized values so no-op writes report zero modifications.
5. Define and test multi-document partial-failure and conflict semantics. Use RxDB bulk APIs where they preserve the selected contract.
6. Prevent primary key and RxDB metadata from entering patches even if a caller bypasses higher-level helpers.

Acceptance criteria:

- Fifty concurrent `$inc: { n: 1 }` updates produce `n === 50` under memory storage and the supported SQLite backend.
- Concurrent updates to different fields preserve both values.
- `updateOne()` reads and mutates at most one matching document and reports `matchedCount` only as `0` or `1`.
- A no-op update reports `modifiedCount: 0`.
- `deleteOne()` performs no full-result scan or redundant ID lookup.
- Adapter-spy tests demonstrate bounded calls for one-document operations and documented calls for many-document operations.

Completion evidence:

- Added adapter-owned operation methods in `packages/mongoose-rxdb/src/rx-adapter.ts` for `updateOne`, `updateMany`, `findOneAndUpdate`, `deleteOne`, `deleteMany`, and `findOneAndDelete`, with update-plan callbacks executed inside `incrementalModify()` so RxDB retries recompute from the current document.
- Query update/delete execution in `packages/mongoose-rxdb/src/query.ts` now delegates to operation-specific adapter methods, constrains one-document mutations before materializing full results, avoids redundant ID lookups, and returns bounded `matchedCount`, `modifiedCount`, and `deletedCount` values.
- No-op updates compare normalized storage records and report `modifiedCount: 0`; adapter-level mutation sanitization preserves the primary key and strips RxDB metadata even when callers bypass query normalization helpers.
- Defined multi-document mutation semantics as ordered and non-transactional: earlier successes remain persisted and a `MutationPartialFailureError` reports counts completed before the first failure.
- Extended fake-adapter spy tests in `packages/mongoose-rxdb/test/adapter-harness.test.ts` for bounded one-document calls, no-op counts, bypass metadata protection, and ordered partial failure behavior.
- Added real storage concurrency coverage in `packages/mongoose-rxdb/test/mutation-atomicity.test.ts`: 50 concurrent increments under memory storage, concurrent disjoint-field preservation, and the same 50-increment contract under SQLite when a supported backend is available.
- Verification passed: `pnpm exec vitest run --config ../../vitest.config.ts test/adapter-harness.test.ts test/write-normalization.test.ts test/mutation-atomicity.test.ts`.
- Verification passed: `pnpm exec tsc --noEmit -p packages/mongoose-rxdb/tsconfig.json`.
- Verification passed: `pnpm --filter @web-ts-toolkit/mongoose-rxdb test`.
- Verification passed on repeated concurrency-focused run: `pnpm exec vitest run --config ../../vitest.config.ts test/mutation-atomicity.test.ts`.

### Task MRX-07: Implement Mutation Options And Upsert Semantics

Status: completed

Priority: P1

Suggested agent: query behavior specialist

Dependencies: MRX-05, MRX-06, MRX-09

Primary ownership:

- `packages/mongoose-rxdb/src/model.ts` option transfer
- `packages/mongoose-rxdb/src/query.ts` update option behavior
- focused update-option tests and documentation

Finding:

Public mutation methods accept `runValidators`, `upsert`, `new`, `returnDocument`, and `setDefaultsOnInsert`, but `makeQuery()` drops all of them. The corresponding branches are unreachable; `findOneAndUpdate()` also omits validation. Its upsert path does not merge eligible equality predicates, cast, apply defaults, validate, or reliably create `_id`. The current validator regression uses a valid increment, so it passes even though validation is disabled.

References:

- `packages/mongoose-rxdb/src/types.ts:95-106`
- `packages/mongoose-rxdb/src/model.ts:152-172`
- `packages/mongoose-rxdb/src/model.ts:186-206`
- `packages/mongoose-rxdb/src/query.ts:216-257`
- `packages/mongoose-rxdb/test/core.test.ts:186-195`
- `website/docs/packages/mongoose-rxdb.md:203-218`

Implementation requirements:

1. Transfer all supported options through an explicit immutable operation descriptor; do not copy options ad hoc in multiple model methods.
2. Apply `runValidators` to the final normalized value before persistence for every supported update route.
3. Define `new` and `returnDocument` precedence and before/after behavior consistently.
4. Build upserts from eligible equality filter fields plus the normalized update; generate `_id`, cast, validate, and apply defaults only under the documented `setDefaultsOnInsert` policy.
5. Reject unsupported options or combinations with actionable errors rather than ignoring them.
6. Update declarations, README, website, and release notes together for any narrowed contract.

Acceptance criteria:

- Invalid validated updates reject and leave persisted records byte-for-byte unchanged; the same update follows documented non-validating behavior when validation is disabled.
- Upsert inserts one record with equality fields, generated `_id`, normalized update values, and documented defaults.
- `new: true`, `returnDocument: 'before'`, and `returnDocument: 'after'` each return the documented result.
- Unsupported option combinations fail before adapter execution.
- Existing and new mutation-option tests cannot pass when options are discarded.

Completion evidence:

- Added immutable `QueryOperationDescriptor` transfer from model methods into `Query`, with centralized runtime validation for supported per-operation mutation options and package-owned `MutationOptionError` for ignored/unsupported combinations.
- `runValidators` now flows through public model update methods and validates the final normalized storage value before persistence for `updateOne`, `updateMany`, and `findOneAndUpdate` matches.
- Implemented `returnDocument` precedence over `new` for `findOneAndUpdate`; `returnDocument: 'before'` returns the previous document, while `returnDocument: 'after'` and `new: true` return the updated or inserted document.
- Implemented supported upserts for `updateOne` and `findOneAndUpdate`: inserts are built from eligible equality filter fields plus normalized update values, generate `_id` when needed, cast to storage, validate as new records, and apply defaults only when `setDefaultsOnInsert: true` is paired with `upsert: true`.
- Added `packages/mongoose-rxdb/test/mutation-options.test.ts` covering option-transfer regressions, invalid validated updates leaving storage unchanged, documented non-validating behavior, upsert construction/default policy, before/after result behavior, and unsupported option rejection before adapter calls.
- Updated `packages/mongoose-rxdb/src/types.ts`, package README, and website docs with narrowed mutation-option declarations and behavior. `CHANGELOG.md` was not edited.
- Verification passed: `pnpm exec tsc --noEmit -p packages/mongoose-rxdb/tsconfig.json`.
- Verification passed: `pnpm exec vitest run --config ../../vitest.config.ts test/mutation-options.test.ts`.
- Verification passed: `pnpm --filter @web-ts-toolkit/mongoose-rxdb test`.

## Wave 4: Document, Query, And Middleware Semantics

### Task MRX-08: Make Document Snapshots And Nested Dirty Tracking Reliable

Status: completed

Priority: P1

Suggested agent: document state-management specialist

Dependencies: MRX-05, MRX-06

Primary ownership:

- `packages/mongoose-rxdb/src/document.ts` document state and serialization
- focused dirty-tracking and snapshot tests

Finding:

Dirty tracking only runs in generated top-level setters. Loaded arrays and objects are exposed by reference, so `tags.push()`, index assignment, nested property changes, and mutations through `toObject()` can be silently lost or can mutate document state outside tracking. The `ORIGINAL` snapshot is maintained but never read and is shallow, while unchanged documents still enter the storage mutation path.

References:

- `packages/mongoose-rxdb/src/document.ts:6-40`
- `packages/mongoose-rxdb/src/document.ts:72-91`
- `packages/mongoose-rxdb/src/document.ts:101-115`
- `packages/mongoose-rxdb/src/document.ts:117-134`
- `packages/mongoose-rxdb/test/core.test.ts:197-212`

Implementation requirements:

1. Use a well-defined deep snapshot/diff strategy or tracked proxies for supported mutable values; prefer snapshot/diff unless measurements justify proxy complexity.
2. Clone arrays, plain objects, nested subdocuments, and dates at document and `toObject()` boundaries.
3. Reconcile explicit `markModified()` with automatic structural diffing and document the behavior for mixed values.
4. Skip adapter mutation for an unchanged document and recognize a value reverted to its original state.
5. Refresh the snapshot only after persistence succeeds; preserve dirty state after failure.

Acceptance criteria:

- Array push/splice/index assignment and nested object/subdocument mutation persist after save and reload.
- Mutating a `toObject()` result cannot mutate or mark the live document.
- Reverted and unchanged documents perform no storage mutation.
- Failed saves retain accurate modified paths for retry.
- Snapshot behavior is deterministic for dates, arrays, nested objects, and supported mixed values.

Completion evidence:

- Added deep document snapshots and structural diffing in `packages/mongoose-rxdb/src/document.ts`; document saves now detect mutable array/object/subdocument/date changes, skip unchanged or reverted loaded documents, and refresh snapshots only after successful persistence.
- Cloned constructor input, setter input, and `toObject()` / `toJSON()` output for arrays, plain objects, nested subdocuments, mixed JSON-like values, and dates.
- Reconciled `markModified(path)` with snapshot comparisons so unchanged explicitly marked paths do not force adapter mutation, while changed mixed values persist normally.
- Added focused MRX-08 regressions in `packages/mongoose-rxdb/test/document-snapshot-dirty.test.ts` for structural mutation persistence, boundary cloning, no-op/reverted saves, failed-save retry state, and explicit `markModified()` behavior.
- Documented the snapshot and dirty-tracking contract in `packages/mongoose-rxdb/README.md` and `website/docs/packages/mongoose-rxdb.md`.
- Verification passed: `pnpm exec vitest run --config ../../vitest.config.ts test/document-snapshot-dirty.test.ts`.
- Verification passed: `pnpm exec tsc --noEmit -p packages/mongoose-rxdb/tsconfig.json`.
- Verification passed: `pnpm --filter @web-ts-toolkit/mongoose-rxdb test`.

### Task MRX-09: Unify Recursive Validation And Middleware Ordering

Status: completed

Priority: P1

Suggested agent: validation and middleware specialist

Dependencies: MRX-05

Primary ownership:

- `packages/mongoose-rxdb/src/document.ts` validation orchestration
- `packages/mongoose-rxdb/src/middleware.ts`
- schema hook types and middleware matrix tests

Finding:

Validation only visits top-level schema paths. Nested schemas and subdocument arrays bypass required, enum, and custom validators. Function-valued `required` executes with `this === undefined`; custom validators cannot inspect the document context. `validate()` bypasses middleware, save validates outside the save error boundary, `insertMany` and hydration never execute their advertised hooks, and document `deleteOne()` runs only remove hooks. Callback-style post hooks receive `(next, result)` instead of `(result, next)`, and pre-hook failures bypass post-error middleware.

References:

- `packages/mongoose-rxdb/src/document.ts:93-99`
- `packages/mongoose-rxdb/src/document.ts:117-143`
- `packages/mongoose-rxdb/src/document.ts:171-204`
- `packages/mongoose-rxdb/src/middleware.ts:26-68`
- `packages/mongoose-rxdb/src/middleware.ts:71-83`
- `packages/mongoose-rxdb/src/types.ts:68-93`
- `website/docs/packages/mongoose-rxdb.md:220-237`

Implementation requirements:

1. Recursively validate nested schemas and arrays with full logical paths and aggregate errors under a stable package-owned error shape.
2. Invoke conditional required and custom validators with the documented document/subdocument context.
3. Run validate middleware around validation and place validation inside the save error boundary.
4. Define exact document versus query middleware context, callback argument order, promise/callback completion rules, and error middleware behavior without ambiguous arity guessing where avoidable.
5. Implement every retained hook name, including `insertMany`, `init`, and document `deleteOne`, or remove unsupported hooks from declarations/docs.
6. Honor or remove `validateBeforeSave`; prevent callbacks that both return promises and call `next()` from completing twice.

Acceptance criteria:

- Nested required, enum, custom, conditional, and array-subdocument validation fail with correct paths and context.
- Pre/post validate hooks, save error hooks, callback post hooks, and query hooks execute once in documented order with documented `this` and arguments.
- Every publicly listed hook has a positive execution test and an error-path test, or is removed from the public surface.
- Middleware completion cannot hang or settle twice under mixed callback/promise usage.
- `validateBeforeSave` has observable tested behavior if retained.

Completion evidence:

- Added recursive validation in `packages/mongoose-rxdb/src/document.ts` for nested schemas, arrays of subdocuments, and primitive array item validators, with aggregate package-owned `ValidationError.errors` keyed by full logical paths.
- Conditional `required` and custom validators now run with the documented owning document or plain subdocument context.
- `Document#validate()` now runs validate middleware; `Document#save()` honors `validateBeforeSave` and routes validation failures through save error middleware exactly once.
- Fixed middleware callback argument order, promise/callback mixed completion, query context (`this` is the `Query` instance), explicit `{ errorHandler: true }` error middleware, and pre-hook error handling.
- Retained and implemented the public hook names covered by MRX-09, including model `insertMany`, hydration `init`, and document `deleteOne`; narrowed schema hook TypeScript declarations to the retained hook-name union.
- Added MRX-09 validation and middleware matrix coverage in `packages/mongoose-rxdb/test/validation-middleware.test.ts`.
- Updated `packages/mongoose-rxdb/README.md` and `website/docs/packages/mongoose-rxdb.md` with the supported compatibility scope, context rules, callback argument order, error middleware registration, and `validateBeforeSave` behavior.
- Verification passed: `pnpm exec tsc --noEmit -p packages/mongoose-rxdb/tsconfig.json`.
- Verification passed: `pnpm --filter @web-ts-toolkit/mongoose-rxdb test`.

### Task MRX-10: Correct Query Pagination, Projection, Lean, And Execution State

Status: completed

Priority: P1

Suggested agent: query engine and performance specialist

Dependencies: MRX-01, MRX-06

Primary ownership:

- `packages/mongoose-rxdb/src/query.ts` read execution and state
- `packages/mongoose-rxdb/src/query-compiler.ts` read option normalization
- `packages/mongoose-rxdb/src/rx-adapter.ts` read capabilities
- query semantics and performance tests

Finding:

The adapter applies limit before slicing skip, so `skip(5).limit(10)` can return only five records. Projection is compiled but ignored; string exclusion such as `-secret` is parsed as a literal inclusion key. `findOne()` ignores skip and projection. Lean reads hydrate every row into a full `Document` before converting it back to an object. Count materializes every matching record. Query instances can execute a write repeatedly through multiple `await`/`exec`/`then` calls, and clone/caller filter state is shallowly shared.

References:

- `packages/mongoose-rxdb/src/query-compiler.ts:121-149`
- `packages/mongoose-rxdb/src/query.ts:35-39`
- `packages/mongoose-rxdb/src/query.ts:142-163`
- `packages/mongoose-rxdb/src/query.ts:199-214`
- `packages/mongoose-rxdb/src/query.ts:273-283`
- `packages/mongoose-rxdb/src/rx-adapter.ts:25-40`

Implementation requirements:

1. Validate limit/skip as bounded non-negative integers and apply skip before limit using native adapter capability or a correct bounded fallback.
2. Normalize inclusion and exclusion projections, including `_id` behavior, reject invalid mixed modes, and apply projection before hydration.
3. Return normalized plain records directly for lean queries and prevent defaults from recreating projected-out fields.
4. Add a native/count adapter capability that does not hydrate or serialize records and define whether count honors skip/limit.
5. Reject a second query execution with a Mongoose-compatible error, or memoize one execution under an explicitly approved contract.
6. Deep-copy caller filters, options, and updates at query construction/clone, and snapshot execution state before middleware runs.

Acceptance criteria:

- Skip-only, limit-only, and skip-plus-limit return the expected ordered IDs; one-document reads follow a documented skip policy.
- Inclusion, exclusion, string, and `_id` projections work for hydrated and lean reads.
- Lean adapter-spy tests show no `Document` construction.
- Count performs one native count operation, ignores sort, and follows documented pagination semantics.
- A mutation query cannot execute twice through any combination of `exec()`, `await`, `then`, `catch`, and `finally`.
- Mutating caller input or clone state cannot alter another query's execution.

Completion evidence:

- Added bounded read option normalization and package-owned `QueryOptionError` in `packages/mongoose-rxdb/src/query-compiler.ts`; `limit` and `skip` now require non-negative safe integers.
- Fixed adapter read pagination in `packages/mongoose-rxdb/src/rx-adapter.ts` and the fake adapter so skip is applied before limit, and `findOne()` follows the documented skip-then-one policy.
- Added normalized inclusion/exclusion projection support, including string syntax and `_id` overrides, with mixed-mode rejection and projection applied before query hydration.
- Lean reads now return normalized plain records directly without constructing `Document` instances or running `init` hooks, and projected-out fields are not recreated by schema defaults during hydration.
- Added adapter `count()` capability and query count execution that uses one native adapter count call, ignores sort, and counts the paginated match window after skip/limit.
- Added package-owned `QueryExecutionError` with Mongoose-compatible `name: 'MongooseError'`; repeated query execution through `exec()`, `await`/`then`, `catch`, or `finally` now rejects instead of replaying writes.
- Deep-copied filters, options, updates, builder arrays/projections, and clone state; query execution now snapshots state before middleware so later mutation cannot alter that execution.
- Added focused MRX-10 regressions in `packages/mongoose-rxdb/test/query-read-semantics.test.ts` for pagination, projections, lean no-hydration behavior, native count semantics, repeated execution rejection, caller input mutation, clone isolation, and middleware snapshot isolation.
- Updated `packages/mongoose-rxdb/README.md` and `website/docs/packages/mongoose-rxdb.md` with read pagination, projection, lean, count, and single-use query semantics.
- Verification passed: `pnpm exec vitest run --config ../../vitest.config.ts test/query-read-semantics.test.ts`.
- Verification passed: `pnpm exec tsc --noEmit -p packages/mongoose-rxdb/tsconfig.json`.
- Verification passed: `pnpm --filter @web-ts-toolkit/mongoose-rxdb test`.

## Wave 5: Architecture, Types, And Published Contract

### Task MRX-11: Establish A Metadata-Free Persistence Port And Efficient Bulk Paths

Status: completed

Priority: P1

Suggested agent: ports-and-adapters architecture specialist

Dependencies: MRX-04, MRX-06, MRX-10

Primary ownership:

- `packages/mongoose-rxdb/src/rx-adapter.ts`
- `packages/mongoose-rxdb/src/rx-types.ts`
- model runtime's internal adapter access
- adapter contract and bulk performance tests

Finding:

The adapter uses `toJSON(true)`, exposing `_deleted`, `_attachments`, `_meta`, and `_rev`; those records flow through query update logic and back into patches. `Model.collection` publicly claims a ready adapter while runtime initializes it as `null`. Undeclared `collectionReady` is accessed via `any` from Model, Query, and Document. Hand-written RxDB types omit the `close()` method that disconnect actually calls. Count and many-record writes materialize and mutate records serially; `create()` and `insertMany()` duplicate sequential save loops.

References:

- `packages/mongoose-rxdb/src/rx-adapter.ts:4-16`
- `packages/mongoose-rxdb/src/rx-adapter.ts:18-70`
- `packages/mongoose-rxdb/src/rx-types.ts:1-32`
- `packages/mongoose-rxdb/src/model.ts:10-18`
- `packages/mongoose-rxdb/src/model.ts:117-181`
- `packages/mongoose-rxdb/src/model.ts:209-227`

Implementation requirements:

1. Define a narrow persistence port whose records contain domain fields plus the logical primary key, never RxDB revision metadata.
2. Keep collection readiness in one typed internal model runtime; remove repeated `any` casts and represent public readiness truthfully.
3. Use supported RxDB public types where feasible or one accurate minimal database contract including the lifecycle methods actually called.
4. Add native count and bulk insert/update/delete capabilities where semantics permit; preserve per-document middleware behavior explicitly when it prevents batching.
5. Consolidate `create()` and `insertMany()` around one insertion pipeline and define ordered/unordered partial-failure results.
6. Keep the fake adapter free of RxDB imports so domain/query unit tests remain fast and deterministic.

Acceptance criteria:

- No public document, lean result, update plan, or fake adapter record exposes RxDB metadata.
- No `collectionReady` access or database close requires `any`.
- A fake implementation satisfies the persistence port without importing RxDB.
- Count and bulk insertion call counts remain bounded for 1, 100, and 1,000 records.
- Real memory and SQLite adapters pass the same contract suite.
- Bulk partial failures return documented record-level outcomes without silently losing successes.

Completion evidence:

- Added a metadata-free persistence port in `packages/mongoose-rxdb/src/rx-adapter.ts` using `PersistenceRecord` values that contain domain fields plus `_id`, with adapter boundary stripping for `_rev`, `_meta`, `_attachments`, and `_deleted`.
- Added adapter bulk insertion contracts (`BulkInsertResult`, `BulkWritePartialFailureError`, ordered/unordered `BulkInsertOptions`) and implemented fake and real adapter `insertMany()` support; count remains a native adapter path.
- Routed `Model.create()` and `Model.insertMany()` through one insertion helper in `packages/mongoose-rxdb/src/model.ts`; `create()` preserves per-document save middleware, while `insertMany()` uses the bulk persistence path and reports partial failures.
- Kept collection readiness behind the typed internal model runtime via `resolveCollection()` and removed `collectionReady` access from query/document runtime and lifecycle tests.
- Kept the fake adapter free of RxDB imports while satisfying the persistence port, with bounded count/bulk insertion call-count coverage for 1, 100, and 1,000 records.
- Added real adapter contract coverage for memory storage and SQLite when a supported backend is available in `packages/mongoose-rxdb/test/adapter-contract.test.ts`.
- Updated package and website documentation for metadata-free adapter records and ordered/unordered bulk insertion semantics.
- Verification passed: `pnpm exec vitest run --config ../../vitest.config.ts test/adapter-harness.test.ts test/adapter-contract.test.ts`.
- Verification passed: `pnpm --filter @web-ts-toolkit/mongoose-rxdb test`.
- Verification passed: `pnpm exec tsc --noEmit -p packages/mongoose-rxdb/tsconfig.json`.

### Task MRX-12: Reconcile Schema Features And Freeze Compiled Structure

Status: completed

Priority: P2

Suggested agent: schema architecture specialist

Dependencies: MRX-05, MRX-09, MRX-11

Primary ownership:

- `packages/mongoose-rxdb/src/schema.ts`
- `packages/mongoose-rxdb/src/converter.ts` schema compilation only
- `packages/mongoose-rxdb/src/types.ts` schema options
- schema behavior tests and docs

Finding:

`Schema.toJSONSchema()` and `convertToRxJsonSchema()` are separate, inconsistent conversion paths. Structural schema maps remain mutable after the RxDB schema is generated, so later `Schema.add()` can change casting without changing storage. `Schema.add()` does not update every schema representation and `clone()` shares nested mutable state. Public options including timestamps, getters, setters, alias, versionKey, query helpers, sparse, expires, and unique are accepted or advertised but are partially or wholly inert; `unique` currently creates only a normal index.

References:

- `packages/mongoose-rxdb/src/schema.ts:13-38`
- `packages/mongoose-rxdb/src/schema.ts:44-49`
- `packages/mongoose-rxdb/src/schema.ts:108-128`
- `packages/mongoose-rxdb/src/schema.ts:131-213`
- `packages/mongoose-rxdb/src/converter.ts:14-104`
- `packages/mongoose-rxdb/src/types.ts:9-31`
- `packages/mongoose-rxdb/src/types.ts:60-66`
- `website/docs/packages/mongoose-rxdb.md:107-158`

Implementation requirements:

1. Create one compiled schema representation that drives casting, validation, update normalization, public JSON Schema, and RxDB schema generation.
2. Freeze or model-snapshot structural schema state at compilation; reject structural mutation that would diverge from persisted schema.
3. Make clone semantics independent for mutable paths, options, hooks, virtuals, child schemas, and query helpers.
4. Classify each public option as implemented, storage-dependent, or unsupported. Implement retained options with behavior tests and reject unsupported options at construction/compilation.
5. Resolve `unique` explicitly: implement a real backend guarantee if supported, or remove the compatibility claim and expose only an index hint.
6. Add stable timestamp/clock injection if timestamps are retained, so tests do not depend on wall-clock timing.

Acceptance criteria:

- One canonical compiled representation produces both public and RxDB schemas without contradictory field types or required sets.
- Structural mutation after model compilation is rejected or cannot affect that model.
- Cloned schemas share no mutable structural or hook collections unintentionally.
- Every accepted schema option has an observable test; unsupported options fail early and disappear from docs/types.
- Duplicate values for a retained `unique` option are rejected safely under concurrent insertion, or `unique` is no longer claimed.
- Timestamp, getter/setter, immutable, alias, and version-key behavior is either implemented end to end or explicitly removed.

Completion evidence:

- Added canonical compiled schema metadata in `packages/mongoose-rxdb/src/schema.ts`; `Schema.toJSONSchema()` and `convertToRxJsonSchema()` now consume the same compiled representation for properties, required paths, and index hints.
- `Connection#model()` now compiles models against an isolated schema snapshot, marks the original schema structurally locked, rejects post-compilation `Schema.add()`, and prevents later direct original-schema path mutations from affecting model casting, validation, or RxDB schema generation.
- Deepened `Schema#clone()` semantics for mutable paths, options, hooks, virtuals, child schemas, and query helpers.
- Narrowed schema option declarations to implemented behavior and added `SchemaConfigurationError` for unsupported schema/path options. Removed inert timestamp, version-key, getter/setter, alias, select, ref, auto, sparse, expires, and unique claims from package and website docs; `unique` is no longer accepted or claimed, and `index: true` is documented only as a storage-dependent lookup hint.
- Added focused MRX-12 coverage in `packages/mongoose-rxdb/test/schema-behavior.test.ts` for canonical public/RxDB schema output, model snapshot isolation, clone independence, accepted option behavior, and early unsupported-option failures.
- Updated `packages/mongoose-rxdb/README.md`, `website/docs/packages/mongoose-rxdb.md`, and schema option types in `packages/mongoose-rxdb/src/types.ts`. `CHANGELOG.md` was not edited.
- Verification passed: `pnpm exec vitest run --config ../../vitest.config.ts test/schema-behavior.test.ts`.
- Verification passed: `pnpm --filter @web-ts-toolkit/mongoose-rxdb test`.
- Verification passed: `pnpm exec tsc --noEmit -p packages/mongoose-rxdb/tsconfig.json`.

### Task MRX-13: Make The Public Type Surface Strict And Awaitable

Status: completed

Priority: P1

Suggested agent: advanced TypeScript library specialist

Dependencies: MRX-07, MRX-09, MRX-10, MRX-11, MRX-12

Primary ownership:

- public types in `packages/mongoose-rxdb/src/types.ts`, `schema.ts`, `document.ts`, `query.ts`, and `model.ts`
- strict declaration consumer fixtures
- typed README/example snippets only as needed to prove the API

Finding:

`Document<T>` does not expose `T` fields, while many model methods return `any`; the example app manually reconstructs document/model intersections and overloads. The schema constructor can infer schema constructors as document values. `Query.then()` does not satisfy `PromiseLike<ResultType>`, so strict TypeScript rejects `await User.find()`. `FilterQuery<T> & Record<string, any>` defeats field checking, update operators are not field-type-aware, `Model.collection` has untruthful readiness typing, and asynchronous `validateSync()` contradicts its name.

References:

- `packages/mongoose-rxdb/src/types.ts:33-58`
- `packages/mongoose-rxdb/src/types.ts:95-140`
- `packages/mongoose-rxdb/src/schema.ts:13-30`
- `packages/mongoose-rxdb/src/document.ts:9-19`
- `packages/mongoose-rxdb/src/document.ts:93-99`
- `packages/mongoose-rxdb/src/query.ts:19-31`
- `packages/mongoose-rxdb/src/query.ts:273-283`
- `packages/mongoose-rxdb/src/model.ts:10-34`
- `apps/mongoose-rxdb-example/src/index.ts:5-33`
- `apps/mongoose-rxdb-example/src/index.ts:89`

Implementation requirements:

1. Define raw document, hydrated document, lean result, model methods/statics, filter, update, and result types without leaking storage metadata.
2. Make `Query<ResultType>` correctly implement `PromiseLike<ResultType>` with generic `then` behavior and precise `catch`/`finally` returns.
3. Make the documented schema/model flow either infer raw fields correctly or require and clearly teach `Schema<User>`; do not solve inference by widening to `any`.
4. Type create/find/findOne/findById/mutations, methods, statics, and virtual augmentation under one documented strategy.
5. Remove the blanket filter `Record<string, any>` escape hatch or replace it with an explicit bounded extension point; type operators by compatible field kind.
6. Implement truly synchronous validation or rename/remove `validateSync()`.

Acceptance criteria:

- Strict NodeNext and Bundler consumers can construct, create, await, query, mutate, and read typed documents without package-local casts.
- `await User.find()` and `await User.findOne()` preserve exact result types.
- Lean queries infer plain records and hydrated queries infer document methods plus raw fields.
- Negative type tests reject misspelled fields, invalid filter operators, incompatible update values, and unsupported connection strings.
- The example app removes its manual copies of core model methods and its broad model cast.
- Emitted declarations pass with `skipLibCheck: false` in `.ts`, `.mts`, and `.cts` consumers.

Completion evidence:

- Added strict public document/model/query type aliases in `packages/mongoose-rxdb/src/types.ts`, including `RawDocument`, `HydratedDocument`, `LeanResult`, `UpdateResult`, `DeleteResult`, strict `FilterQuery`, explicit `LooseFilterQuery`, and field-kind-aware `UpdateQuery` operators without RxDB metadata fields.
- Threaded schema-driven method/static/virtual typing through `Schema`, `Connection#model()`, root `model()`, and `Model` so compiled models infer hydrated document fields, instance methods, virtuals, statics, lean records, and mutation/count result types without broad consumer casts.
- Made `Query<ResultType>` implement `PromiseLike<ResultType>` with generic `then`, typed `catch`, and typed `finally`; `lean(true)` now changes query result types to plain `LeanResult<T>` records.
- Replaced async `validateSync()` with a synchronous validation path returning `ValidationError | undefined`; async validators produce a synchronous validation error and middleware remains on async `validate()`.
- Updated `apps/mongoose-rxdb-example/src/index.ts` to remove the manual model-method copies and broad compiled-model cast, using `HydratedDocument` plus schema-based model inference instead.
- Extended strict declaration consumer fixtures under `packages/mongoose-rxdb/test-decl-consumer/` for NodeNext and Bundler `.ts`, `.mts`, and `.cts` entrypoints with positive create/find/await/lean/mutation/method/static coverage and negative misspelled-field/operator/update/connection-string checks.
- Updated `packages/mongoose-rxdb/README.md` and `website/docs/packages/mongoose-rxdb.md` with the strict TypeScript strategy, schema/model flow, lean/hydrated/query result behavior, strict filters, `LooseFilterQuery`, update operator typing, and `validateSync()` semantics.
- Verification passed: `pnpm exec vitest run --config ../../vitest.config.ts test/validation-middleware.test.ts`.
- Verification passed: `pnpm --filter @web-ts-toolkit/mongoose-rxdb test`.
- Verification passed: `pnpm exec tsc --noEmit -p packages/mongoose-rxdb/tsconfig.json`.
- Verification passed: `pnpm exec tsc --noEmit -p packages/mongoose-rxdb/test-decl-consumer/tsconfig-nodenext.json`.
- Verification passed: `pnpm exec tsc --noEmit -p packages/mongoose-rxdb/test-decl-consumer/tsconfig-bundler.json`.
- Verification passed: `pnpm --filter mongoose-rxdb-example typecheck`.
- Verification passed: `pnpm --filter mongoose-rxdb-example build`.

### Task MRX-14: Align Package Metadata, Entrypoints, README, And Compatibility Matrix

Status: completed

Priority: P2

Suggested agent: TypeScript package publishing specialist

Dependencies: MRX-03, MRX-12, MRX-13

Primary ownership:

- `packages/mongoose-rxdb/package.json`
- `packages/mongoose-rxdb/tsup.config.ts`
- `packages/mongoose-rxdb/src/index.ts`
- `packages/mongoose-rxdb/src/storage/index.ts` export surface only
- package README, website package docs, packed-consumer fixtures

Finding:

The package publishes separate CJS and ESM bundles, producing two class identities and two `defaultConnection` singletons in a mixed graph. `.d.mts` files are emitted but exports always select `.d.ts`. Peer ranges (`rxdb >=16`, `rxjs >=7`) include untested future majors and do not match the installed RxDB peer range. `@web-ts-toolkit/utils` is an unused runtime dependency. Root and storage default exports coexist with named exports without a documented canonical style. The shipped README omits the strict typing workaround and many public-contract details while website docs overclaim inert options.

References:

- `packages/mongoose-rxdb/package.json:17-65`
- `packages/mongoose-rxdb/tsup.config.ts:3-9`
- `packages/mongoose-rxdb/src/index.ts:1-43`
- `packages/mongoose-rxdb/src/storage/index.ts:139`
- `packages/mongoose-rxdb/README.md:20-112`
- `website/docs/packages/mongoose-rxdb.md:40-65`
- `website/docs/packages/mongoose-rxdb.md:107-237`

Implementation requirements:

1. Decide whether mixed CJS/ESM consumers share one runtime singleton, one format is canonical, or singleton APIs are removed/de-emphasized; test and document the decision.
2. Align condition-specific runtime and declaration exports, or stop emitting unreachable declaration variants.
3. Pin peer ranges to tested RxDB/RxJS majors and add minimum/current compatibility jobs for every claimed major.
4. Remove unused runtime dependencies and verify the release-staged manifest contains no placeholders or workspace protocols.
5. Choose named imports as canonical unless a concrete default-import consumer requires otherwise; remove or explicitly document redundant defaults.
6. Make README examples strict, copy-pasteable, and packed-consumer tested. Keep package README and website export/option tables synchronized.
7. Add concise JSDoc to `Schema`, `Connection`, `Model`, `Query`, and `sanitizeFilter` after their contracts stabilize and verify it survives in declarations.

Acceptance criteria:

- Mixed CJS/ESM loading follows the approved singleton/class-identity contract and has a regression test.
- Root and `./storage` exports resolve correct JS and declarations in CJS, ESM, NodeNext, and Bundler consumers.
- Clean npm and pnpm installations satisfy exact peer behavior across every supported RxDB version.
- The staged manifest contains no `PLACEHOLDER`, `workspace:*`, or unused `@web-ts-toolkit/utils` dependency.
- README quickstart compiles verbatim from the packed package and names the canonical import style, peers, Node support, storage policy, and custom-factory plugin requirement.
- Editor-visible declarations retain high-value JSDoc and expose no accidental internal readiness or RxDB metadata types.

Completion evidence:

- Chose and documented the minimal safe mixed-module contract: named imports are canonical, default exports are redundant compatibility conveniences, and mixed ESM/CJS consumers get independent class identities plus independent `defaultConnection` singletons rather than a shared cross-format singleton.
- Added packed-consumer regression coverage for the mixed ESM/CJS identity contract and for the README quickstart compiling and executing from the staged tarball.
- Aligned root and `./storage` export maps with condition-specific declaration files: ESM resolves `.d.mts`, CommonJS resolves `.d.ts`, and both emitted variants are asserted in the packed tarball.
- Removed the unused `@web-ts-toolkit/utils` runtime dependency and narrowed the packed-consumer staging harness so the release-staged manifest has no unused internal dependency, `workspace:*`, or placeholder values.
- Kept RxDB/RxJS peer ranges pinned to the tested majors (`rxdb >=17.4.0 <18`, `rxjs >=7.8.0 <8`) and documented the compatibility matrix/evidence for the single claimed RxDB/RxJS major pair.
- Updated the package README and website docs with canonical named imports, module identity, peer/Node support, storage fail-closed policy, custom RxDB factory plugin requirement, and a strict copy-pasteable quickstart.
- Added concise JSDoc to `Schema`, `Document`, `Model`, `Connection`, `Query`, and `sanitizeFilter`; verified the comments survive in generated `.d.ts` and `.d.mts` declarations.
- Verification passed: `pnpm exec vitest run --config ../../vitest.config.ts test/packed-consumer.test.ts`.
- Verification passed: `pnpm --filter @web-ts-toolkit/mongoose-rxdb test`.
- Verification passed: `pnpm exec tsc --noEmit -p packages/mongoose-rxdb/tsconfig.json`.
- Verification passed: `npm pack --dry-run --json` from `packages/mongoose-rxdb` included README, package.json, CJS/ESM runtime files, and both `.d.ts`/`.d.mts` declaration variants.

## Wave 6: Independent Integration Review

### Task MRX-15: Perform Final Security, Correctness, Performance, And Package Review

Status: completed

Priority: P1

Suggested agent: independent reviewer who did not implement MRX-02 through MRX-14

Dependencies: MRX-02, MRX-03, MRX-04, MRX-05, MRX-06, MRX-07, MRX-08, MRX-09, MRX-10, MRX-11, MRX-12, MRX-13, MRX-14

Primary ownership:

- review and focused regression additions across `packages/mongoose-rxdb`
- task completion evidence and deferred-risk audit
- no broad redesign unless a release-blocking defect is confirmed

Finding:

This plan changes security boundaries, persistence policy, concurrency behavior, adapter ownership, query semantics, middleware ordering, public types, and published package contracts. An independent pass is required to catch alternate paths that bypass shared enforcement and to prove documentation and packed artifacts match runtime behavior.

References:

- all MRX tasks in this document
- `packages/mongoose-rxdb/src/`
- `packages/mongoose-rxdb/test/`
- `packages/mongoose-rxdb/package.json`
- `packages/mongoose-rxdb/README.md`
- `website/docs/packages/mongoose-rxdb.md`

Implementation requirements:

1. Reproduce every confirmed baseline defect against the remediated package and verify the intended new behavior.
2. Trace every read/write path through create, save, insert-many, update-one/many, find-one-and-update, delete, upsert, hydration, lean, and custom adapters.
3. Verify rejected filters, dangerous keys, recursive input limits, regex policy, immutable/primary-key boundaries, and metadata stripping across direct and builder entrypoints.
4. Run concurrency tests repeatedly under memory and supported SQLite storage and review partial-failure behavior.
5. Compare runtime exports, declarations, README, website, example app, packed files, and release-staged manifest.
6. Record completion evidence for each task and preserve rationale/residual risk for every deferred item.

Acceptance criteria:

- Every preceding task's observable acceptance criteria is independently verified.
- No untrusted filter or update path broadens scope, mutates prototypes, bypasses bounds, or writes storage metadata.
- Persistent storage never silently becomes volatile under the default contract.
- Concurrent writes and collection lifecycle operations complete without lost updates, unhandled rejections, stale adapters, or leaked resources.
- Public types, runtime behavior, README, website, and packed artifact agree.
- Required targeted, package, root, consumer, and artifact commands pass serially, or an external blocker is documented with exact output and owner.

Completion evidence:

- Independently reviewed MRX-01 through MRX-14 completion evidence plus `packages/mongoose-rxdb` source, tests, strict declaration consumers, generated declarations, package README, website docs, example app, packed-consumer harness, and release-staged manifest assertions.
- Confirmed filter normalization rejects unsupported top-level/field operators, malformed logical operands, dangerous object keys, excessive depth/width, and unsafe regex before adapter execution; added a final fail-closed regression so `sanitizeFilter(null)` cannot become a destructive match-all selector.
- Confirmed update/write paths route through schema-aware normalization, reject dangerous/protected paths and RxDB metadata writes, strip adapter metadata, validate normalized storage values where documented, and preserve prototype safety.
- Confirmed default persistent SQLite requests fail closed unless Premium, trial native, or trial npm SQLite opens; volatile fallback remains explicit through `allowMemoryFallback: true` and selected backend metadata is observable.
- Confirmed connection and collection lifecycle ownership uses single-flight connect/disconnect and per-collection readiness; stale model adapters are invalidated after disconnect/overwrite/reconnect and pending initialization rejection is handled.
- Confirmed public runtime exports, condition-specific declarations, README, website docs, example app, npm dry-run packed contents, and release-staged manifest behavior agree on root/storage entrypoints, peers, Node support, canonical named imports, mixed-module identity, and storage policy.
- Fixed example-app drift where its `sanitizeFilter` demo still described unsupported field operators as literal-wrapped instead of fail-closed rejected.
- Fixed root lint coverage for intentional CommonJS declaration-consumer fixtures by adding file-local `@typescript-eslint/no-require-imports` exceptions.
- Verification passed: `pnpm exec vitest run --config ../../vitest.config.ts test/sanitize-filter-security.test.ts`.
- Verification passed: `pnpm --filter @web-ts-toolkit/mongoose-rxdb test` (15 files, 119 tests).
- Verification passed: `pnpm exec tsc --noEmit -p packages/mongoose-rxdb/tsconfig.json`.
- Verification passed: `pnpm exec tsc --noEmit -p packages/mongoose-rxdb/test-decl-consumer/tsconfig-nodenext.json`.
- Verification passed: `pnpm exec tsc --noEmit -p packages/mongoose-rxdb/test-decl-consumer/tsconfig-bundler.json`.
- Verification passed: `pnpm exec vitest run --config ../../vitest.config.ts test/packed-consumer.test.ts`.
- Verification passed: `npm pack --dry-run --json` from `packages/mongoose-rxdb` included README, package.json, CJS/ESM runtime files, and `.d.ts`/`.d.mts` declaration variants.
- Verification passed twice for concurrency/lifecycle focus: `pnpm exec vitest run --config ../../vitest.config.ts test/mutation-atomicity.test.ts test/collection-init-harness.test.ts`.
- Verification passed: `pnpm --filter mongoose-rxdb-example typecheck`.
- Verification passed: `pnpm --filter mongoose-rxdb-example build`.
- Verification passed: `pnpm lint`.
- Verification passed: `pnpm build`.
- Verification passed: `pnpm test` on retry with a longer timeout. An earlier run hit the 600s tool timeout while entering `@web-ts-toolkit/access-router-runtime`; a direct `pnpm --filter @web-ts-toolkit/access-router-runtime test` run passed, and the longer full-root retry completed successfully. The full-root test output includes expected React 18 negative-path console errors from `packages/access-router-react/test/dependency-policy.test.tsx`, but the command exited successfully.
- Verification passed: `pnpm build-artifact -- --version 0.99.0-mrx15`.
- Verification passed: `pnpm verify-artifact -- --version 0.99.0-mrx15`.

## Dependency And Parallelization Guidance

| Wave | Task   | Suggested owner            | Parallel guidance                                                                                                      |
| ---- | ------ | -------------------------- | ---------------------------------------------------------------------------------------------------------------------- |
| 1    | MRX-01 | Test/package harness agent | Runs alone because later tasks depend on its fixtures.                                                                 |
| 2    | MRX-02 | Query security agent       | Can run with MRX-03; avoid shared README edits until merge.                                                            |
| 2    | MRX-03 | Storage/package agent      | Can run with MRX-02; serialize `package.json` and docs integration.                                                    |
| 2    | MRX-04 | Lifecycle agent            | Starts after MRX-03 establishes connection/storage policy.                                                             |
| 3    | MRX-05 | Normalization agent        | Runs before all mutation tasks; owns shared converter/update hotspots.                                                 |
| 3    | MRX-06 | Concurrency agent          | Runs after MRX-05; do not overlap `query.ts`/`rx-adapter.ts` edits with MRX-10.                                        |
| 3    | MRX-07 | Query behavior agent       | Starts after MRX-06 and MRX-09 settle mutation and validation contracts.                                               |
| 4    | MRX-08 | Document state agent       | Can run with MRX-10 after MRX-06; coordinate shared normalization helpers.                                             |
| 4    | MRX-09 | Middleware agent           | Can run with MRX-08; owns `document.ts` orchestration, so merge it before MRX-08 final integration if both touch save. |
| 4    | MRX-10 | Read-query agent           | Starts after MRX-06; serialize changes to `query.ts` and `rx-adapter.ts`.                                              |
| 5    | MRX-11 | Architecture agent         | Integrates lifecycle and query adapter contracts after MRX-06/MRX-10.                                                  |
| 5    | MRX-12 | Schema agent               | Can begin design after MRX-05 but merge after MRX-09/MRX-11 contracts stabilize.                                       |
| 5    | MRX-13 | Type-system agent          | Starts only after runtime contracts stabilize; owns public declaration changes.                                        |
| 5    | MRX-14 | Publishing agent           | Runs after MRX-13; owns final metadata/docs/export integration.                                                        |
| 6    | MRX-15 | Independent reviewer       | Runs alone after all implementation tasks.                                                                             |

Shared hotspots that require sequencing:

- `src/query.ts`: MRX-06, then MRX-07/MRX-10, then MRX-13.
- `src/rx-adapter.ts`: MRX-06/MRX-10, then MRX-11.
- `src/document.ts`: MRX-05, then coordinate MRX-08 and MRX-09, then MRX-13.
- `src/model.ts`: MRX-04, then MRX-07/MRX-11, then MRX-13.
- `src/types.ts`: behavioral tasks first, then MRX-12 and MRX-13.
- `package.json`, README, and website docs: stage task-local edits but let MRX-14 perform final reconciliation.

Package test/build commands must remain serialized because package tests rebuild shared outputs. Agents may develop independent unit tests concurrently only when neither invokes package/root build or test scripts and their file ownership does not overlap.

## Deferred Decisions Requiring Maintainer Input

1. SQLite fallback policy: recommended default is fail closed for any explicit persistent request, with opt-in memory fallback that exposes the selected backend. This blocks final MRX-03 API naming but not its regression harness.
2. Regex policy for untrusted filters: recommended default is reject regex in a strict sanitizer mode; bounded native regex support remains vulnerable to engine-level pathological cases. This blocks final MRX-02 semantics.
3. Compatibility scope: choose whether currently advertised but inert Mongoose options are implemented or removed. Recommended approach is to retain only options with complete behavior and tests. This affects MRX-07, MRX-09, and MRX-12.
4. `unique`: recommended approach is to remove the uniqueness claim unless the selected RxDB backend provides an atomic enforceable constraint. This blocks the final MRX-12 contract.
5. Mixed module singleton: choose a shared singleton strategy, ESM-only package, or deprecation of default-connection APIs. This blocks final MRX-14 packaging behavior.
6. Low-level root exports: `MiddlewareEngine`, converters, query compiler helpers, and `RxCollectionAdapter` expose internals and constrain refactoring. Removing them is a breaking change; retain them temporarily unless usage evidence and a release plan approve removal.
7. Repeated query execution: recommended behavior is Mongoose-compatible rejection on second execution rather than promise memoization. This blocks one MRX-10 assertion but not pagination/projection work.

## Verification Strategy

After each focused task:

```sh
pnpm exec vitest run --config vitest.config.ts packages/mongoose-rxdb/test/<focused-test>.test.ts
pnpm exec tsc --noEmit -p packages/mongoose-rxdb/tsconfig.json
pnpm exec eslint "packages/mongoose-rxdb/src/**/*.ts" "packages/mongoose-rxdb/test/**/*.ts"
```

After each wave, run serially:

```sh
pnpm --filter @web-ts-toolkit/mongoose-rxdb build
pnpm --filter @web-ts-toolkit/mongoose-rxdb test
pnpm --filter mongoose-rxdb-example build
```

At final integration, run serially:

```sh
pnpm lint
pnpm build
pnpm test
pnpm build-artifact -- --version <ver>
pnpm verify-artifact -- --version <ver>
```

The packed-consumer harness must additionally verify clean npm and pnpm installs, CJS, ESM, mixed-loading policy, strict NodeNext/Bundler declarations, README snippets, supported RxDB versions, and each storage backend tier. Do not run the package test script concurrently with root tests or another package test because each can rebuild shared `dist/` dependencies.

## Definition Of Done

- Every confirmed P0 and P1 finding is fixed with a regression that fails on the reviewed implementation, or explicitly deferred by the maintainer with rationale and residual risk.
- Invalid or hostile filters fail closed and cannot broaden destructive operations; recursion, collections, and regex input have documented bounds.
- Explicit persistent storage cannot silently select memory, and backend/dependency selection is observable and packed-install tested.
- Connection and collection initialization are single-owner, race-free, and free of unhandled promise rejections or stale adapters.
- Every write route shares casting, storage serialization, immutable/primary-key checks, validation, and metadata exclusion.
- Concurrent updates preserve writes; one-document operations are bounded and result counts are accurate.
- Nested mutations, validation, and middleware follow documented semantics without silent data loss.
- Pagination, projection, lean, count, query cloning, and repeated execution have correct tested behavior and avoid unnecessary hydration/materialization.
- RxDB is isolated behind a metadata-free typed persistence port with fake and real adapter contract tests.
- Accepted schema options are implemented and tested; unsupported options are rejected and removed from claims.
- Strict installed consumers receive useful document/model/query types and a valid awaitable query without broad `any` workarounds.
- Package exports, declaration conditions, peers, engine support, README, website, example app, and release-staged artifact agree.
- MRX-15 is completed by an independent reviewer and all required verification is recorded in this file.
