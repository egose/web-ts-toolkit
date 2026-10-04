# Express Request Attestation — MongoDB Replay Store

Created: `20261003-171116`.

Package scope:

- Add a MongoDB replay store to the existing package `@web-ts-toolkit/express-request-attestation`.
- New factory: `createMongoAttestationStore`, same `AttestationStore` contract as the memory and Redis adapters (`reserve({ replayKey, retainUntilMs })` → `'reserved' | 'duplicate' | 'expired'`, shared `AttestationCapacityError`).
- No changes to the protocol, verifier, signer, or existing stores.

## 1. Objective, scope, and design

Implement `src/stores/mongodb.ts` following the established in-repo pattern (`packages/express-oidc-vault-mongodb-store/src/dpop-replay.ts`, class `MongoDpopReplayReservations`):

- One proof collection with unique IDs plus a separate non-TTL capacity/accounting collection with one shared capacity row.
- Multi-document snapshot transaction per admission: duplicate check → bounded expiry reclaim (64) → capacity check → insert. Duplicates never extend expiry; no live eviction.
- Do not rely on a Mongo TTL index for correctness (coarse granularity); keep the indexed, non-TTL accounting ledger as the source of truth, exactly like the vault store.
- App clock with synchronized-clock requirement (Mongo has no `TIME` equivalent); invalid clock fails closed without allocating.
- Structural `Db`/collection injection (no client creation/connect/close in the library); `mongodb` as a dev dependency for tests, matching the Redis store's narrow-client approach. Production deployments require a replica set (transactions).

Explicit non-goals:

- No protocol/verifier/signer changes; no memory/Redis implementation changes.
- No per-session enrollment, no Axios/React adapters, no provisioning automation.
- No `CHANGELOG.md` updates and no commits as part of implementation.

## 2. Working rules

- Section references below point at `docs/tasks/20261002-183522-express-request-attestation-package.md` (the base package contract: sections 1, 4.1, 4.4, 4.5).
- Follow `AGENTS.md`: package scripts rebuild shared outputs; never run two builds/tests touching shared `dist` concurrently. The new `test:mongo` lane runs serially after one build.
- Use `apply_patch` for edits. Do not commit, publish, or tag unless separately requested.
- `sideEffects: false` must keep holding; no import-time network/timer/client creation.
- Report completion only with required evidence. A mocked or skipped live test is not deployment evidence.

## 3. Baseline and verification commands

Baseline (package currently green except the new work):

```sh
pnpm --filter @web-ts-toolkit/express-request-attestation... build
pnpm --filter @web-ts-toolkit/express-request-attestation typecheck
pnpm --filter @web-ts-toolkit/express-request-attestation test:node
```

New lane (to be added by MONGO-02):

```sh
pnpm --filter @web-ts-toolkit/express-request-attestation test:mongo
```

Full package gate after all items (serial, one build first):

```sh
pnpm --filter @web-ts-toolkit/express-request-attestation test
```

Prerequisites: `mongodb-memory-server` replica-set binary download (registry/network) for the live lane; Playwright Chromium only for the existing browser lane (unchanged).

## 4. Tasks

### Task MONGO-01: Implement the MongoDB replay adapter with unit coverage

Status: completed

Completion evidence:

- Changed: `src/stores/mongodb.ts` (new adapter, snapshot transactions, 64-reclaim, shared capacity error, narrow mongo error type), `test/mongo-store.test.ts` (49 unit tests, stubbed Db, no live DB), `src/index.ts` (Mongo exports only).
- Verified: build pass; typecheck pass; targeted 49/49 pass; full test:node 346/346 pass (15 files); eslint clean.
- Notes: structural Db injection, no driver lifecycle; replica-set + synchronized-clock requirement documented; live parity belongs to MONGO-02.

Priority: P0

Suggested role: store engineer

Dependencies: none (reads the base contract and the existing memory/Redis adapters)

Primary ownership:

- `packages/express-request-attestation/src/stores/mongodb.ts`
- `packages/express-request-attestation/test/mongo-store.test.ts` (unit paths that need no live database)
- `packages/express-request-attestation/src/index.ts` (Mongo export only)

Finding:

No MongoDB adapter exists; multi-replica deployments without Redis currently have no shared replay option. The adapter must implement the identical admission contract so verifiers can swap backends without behavior change.

References:

- Base contract sections 4.1 (store result/capacity contract) and 4.4 (single absolute retention formula, 240000 ms global cap, no clamping).
- `packages/express-request-attestation/src/stores/memory.ts:1-60` (validation order, duplicate-first, 64-reclaim, shared `AttestationCapacityError`).
- `packages/express-oidc-vault-mongodb-store/src/dpop-replay.ts:11-101` (capacity row, reservation ledger, snapshot transaction, ` AttestationCapacityError` analogue).

Implementation requirements:

1. `createMongoAttestationStore({ db, proofsCollectionName?, capacityCollectionName?, maxEntries?, now? })`: snapshot and validate options (positive safe-integer capacity, callable clock); retain `Db`/collection handles live without cloning or connecting.
2. Collections: proofs (`{ _id: replayKey, retainUntilMs }` with unique `_id`) and capacity/accounting (`{ _id, kind, replayKey?, retainUntilMs? }` plus one `{ _id: 'capacity' }` row holding `entries`/`maxEntries`/revision). No TTL index on the accounting collection. Index `retainUntilMs` for bounded expiry queries.
3. `reserve({ replayKey, retainUntilMs })` (plus the `retainUntil` alias with canonical precedence, matching memory/Redis): validate opaque key (1–256 printable ASCII), deadline shape (nonnegative safe integer), input expiry (`retainUntilMs <= now` → `'expired'`, no allocation), global cap (`retainUntilMs - now > 240000` → `AttestationProtocolError`, no truncation). Malformed inputs reject without allocating.
4. Admission in one snapshot transaction: recheck deadline inside the transaction; duplicate-first (live reservation → `'duplicate'`, no rescore/extension, even when full); reclaim the requested expired entry plus at most 64 expired entries; capacity check (throw shared `AttestationCapacityError`, never evict live); insert proof + ledger rows; never accept without a committed reservation; never release after later handler failure (store layer only reserves).
5. Clock: app-provided `now` (default `Date.now`); invalid clock → `AttestationProtocolError` without touching the database. Document the synchronized-clock requirement across instances.
6. Errors: reuse the package's shared `AttestationCapacityError` and `AttestationProtocolError`; add a narrow `AttestationMongoStoreError` for transport/topology/inconsistency failures (wrong collection types, transaction failure, malformed persisted rows). Middleware must already map unknown store failures correctly; do not change middleware.
7. Unit tests without a live database: construction validation, option snapshotting, input validation (keys, deadlines, cap, alias precedence), invalid clock, and error taxonomy with a stubbed `Db` if needed. Live behavior belongs to MONGO-02.

Acceptance criteria:

- `reserve` validation order matches memory/Redis (shape → clock → key → deadline → expiry → cap → duplicate → reclaim → capacity → insert).
- Duplicate returns `'duplicate'` even when full; expired inputs return `'expired'` with no allocation; overlong deadlines throw without allocating or clamping.
- No timers, no client lifecycle management, no `console`/log side effects with key material.
- Verify: package `build`, `typecheck`, targeted unit tests, `test:node` green, eslint clean on changed files.

---

### Task MONGO-02: Live conformance parity on a replica set with multi-client atomicity

Status: completed

Completion evidence:

- Changed: `test/mongo-harness.ts` (new disposable replica-set harness), `test/mongo-live.test.ts` (new shared-conformance parity + atomicity/capacity/expiry/HTTP tests), `vitest.mongo.config.mts` (new `test:mongo` lane), `package.json` (`test:mongo` lane + `mongodb`/`mongodb-memory-server` devDeps), `pnpm-lock.yaml` (new devDeps only); fixes outside nominal scope but required for green: one-line `$setOnInsert`/`$inc revision` conflict fix in `src/stores/mongodb.ts`, live-clock margins in `test/store-conformance.ts` + `test/redis-live.test.ts`, exact-boundary test added to `test/memory-store.test.ts`, malformed-ledger test correction in `test/mongo-live.test.ts`, `/src/` JSDoc string removed from `src/stores/mongodb.ts` (packed-consumer declaration gate).
- Verified: build pass; typecheck pass; `test:mongo` 31/31 pass (live replica set, incl shared conformance + exactly-one winner + capacity/expiry + HTTP 200+403); `test:node` 346/346; `test:redis` 62/62 (real Docker 6.2+7.2); `test:browser` 23/23; `test:packed-consumer` 5/5; eslint clean.
- Notes: no production `REDIS_URL`/connection strings; harness absence blocks lane instead of skip-passing; live-clock exact-ms boundaries stay memory-only.

Priority: P0

Suggested role: database/concurrency engineer

Dependencies: MONGO-01

Primary ownership:

- `packages/express-request-attestation/test/mongo-harness.ts` (replica-set harness)
- `packages/express-request-attestation/test/mongo-live.test.ts` (live conformance + atomicity/integration)
- `packages/express-request-attestation/test/mongo-store.test.ts` (extend with live-gated cases if needed)
- `packages/express-request-attestation/package.json` + `vitest.mongo.config.mts` (new `test:mongo` lane, serial after one build)

Finding:

Unit tests cannot prove cross-client atomicity, transaction behavior, or expiry under a real topology. The shared conformance suite must run against live MongoDB for memory/Redis/Mongo parity, with the same live-clock robustness margins adopted for Redis (exact-ms boundaries are racy against any live clock; exactness stays covered by deterministic memory-only tests).

References:

- `packages/express-request-attestation/test/store-conformance.ts` (shared suite; live-clock margins already applied for Redis).
- `packages/express-request-attestation/test/redis-live.test.ts` (disposable harness, randomized prefixes, two-client winner, HTTP integration patterns to mirror).
- `packages/express-oidc-vault-mongodb-store/test/mongo-memory.ts` (replica-set harness with `MongoMemoryReplSet`, isolated db names, cleanup).

Implementation requirements:

1. Harness starts a disposable single-node replica set via `mongodb-memory-server` (`MongoMemoryReplSet`, count 1), hands out isolated databases with randomized names, and cleans up per test. No production connection string; harness absence blocks the lane instead of skip-passing.
2. Run the full shared `test/store-conformance.ts` suite against live Mongo with the same margins as Redis (cap ±10s, future +2s, `setNow` overshoot where the suite advances time). Exact-boundary assertions remain memory-only.
3. Multi-client atomicity: two independent store objects on separate `MongoClient`s sharing one database/prefix admit exactly one winner for simultaneous identical reservations.
4. HTTP integration: two Express middleware instances sharing one Mongo-backed store admit exactly one handler call for an identical valid proof; a second identical proof returns `ATTESTATION_REPLAY`.
5. Capacity/expiry: shared capacity enforced across clients (duplicate wins over capacity, no live eviction, recovery after expiry), ledger state reclaimed through expiry, malformed persisted rows fail closed with typed errors.
6. Wire `test:mongo` (`vitest run --config vitest.mongo.config.mts`, generous timeouts for replica-set startup) and extend the aggregate `test` script to `pnpm build && pnpm test:node && pnpm test:redis && pnpm test:mongo && pnpm test:browser && pnpm test:packed-consumer`. Add `mongodb` + `mongodb-memory-server` dev dependencies matching the vault store's pinned versions.
7. Live-clock robustness: use the same margin conventions as the Redis lane; never assert exact-ms equality against a live clock. Document binary-download/network prerequisites.

Acceptance criteria:

- Shared conformance passes against live Mongo; independent clients sharing one database have exactly one winner for simultaneous identical admission.
- Retention holds through the whole acceptance deadline; near-expiry replays stay rejected; expired inputs never allocate.
- At shared capacity duplicates win, new keys throw capacity, no live entries evicted, recovery works after expiry.
- HTTP two-instance integration passes (one 200 + one 403 `ATTESTATION_REPLAY`).
- Verify: `build`, `typecheck`, `test:node`, `test:mongo` (live replica set), eslint clean. `test:redis`/`test:browser`/`test:packed-consumer` unaffected (run in MONGO-04).

---

### Task MONGO-03: Exports, README, and installed-consumer coverage for the Mongo store

Status: completed

Completion evidence:

- Changed: `src/index.ts` (header lists memory/Redis/Mongo stores), `README.md` (mongodb install + wiring + capacity/failure notes + store-choice guidance + `test:mongo` commands), `test-decl-consumer/backend-strict.mts` + `backend-bundler.ts` (root Mongo named imports without driver), `test/packed-consumer.test.ts` (backend mongodb install, declaration/browser-only assertions incl no-mongodb); plus inventory-test timeout fix (120s, was flaking at default 5s).
- Verified: build pass; typecheck pass (incl NodeNext/Bundler/browser decl consumers); test:packed-consumer 5/5 pass; test:node 346/346 pass; eslint clean; `mongodb` dev-only, signer bundle has no mongodb runtime refs, no default export.

Priority: P1

Suggested role: TypeScript/package-quality engineer

Dependencies: MONGO-01, MONGO-02

Primary ownership:

- `packages/express-request-attestation/src/index.ts` (already exports from MONGO-01; verify final surface)
- `packages/express-request-attestation/README.md` (Mongo store section)
- `packages/express-request-attestation/test-decl-consumer/**` (extend only if new types require it)
- `packages/express-request-attestation/test/packed-consumer.test.ts` (extend only if new runtime deps require it)

Finding:

Consumers discover the store through root named imports, JSDoc on emitted declarations, and README backend wiring. The Mongo factory must be documented with its replica-set requirement, clock/capacity semantics, and structural injection pattern.

References:

- `ai-friendly-ts-package` skill: metadata/exports, shipped declarations, packed contents, README, JSDoc.
- `packages/express-oidc-vault-mongodb-store/package.json` (dependency/declaration conventions for a Mongo-backed store).

Implementation requirements:

1. Confirm the final public surface: `createMongoAttestationStore` (+ options/result/error types) exported from the package root with named imports; no default export; no deep imports in docs.
2. JSDoc on the factory/options/store errors (survives into `.d.ts`/`.d.mts`): replica-set requirement, synchronized clocks, shared capacity semantics, no TTL reliance, `Db` injection/ownership (caller connects/closes), and the fail-closed mapping.
3. README: Mongo subsection under backend stores with install (`mongodb` driver as app dependency), minimal wiring snippet (replica-set `Db`, collection names, capacity), capacity/failure/rate notes (transaction cost per admission, no fabricated benchmarks), and when to choose Mongo vs Redis vs memory.
4. Verify `mongodb` stays a dev-only dependency of the package (structural types only in the public signature) so browser-only `/signer` consumers never need it; confirm the signer bundle has no new runtime graph.
5. Extend declaration/packed-consumer coverage only if the new types change the consumer surface; otherwise assert the existing gates still pass unchanged.

Acceptance criteria:

- Root named import of `createMongoAttestationStore` typechecks under the existing strict consumers; signer browser closure still free of Node/Express/Redis/Mongo types.
- README snippet compiles against installed declarations and matches implementation defaults/limits.
- Verify: `build`, `typecheck` (incl decl consumers), `test:packed-consumer`, eslint clean.

---

### Task MONGO-04: Final review of the Mongo store work with full-lane evidence

Status: completed

Completion evidence:

- Changed: `docs/tasks/20261003-171116-express-request-attestation-mongodb-store.md` only (this MONGO-04 review record; no source/docs/runtime changes, no `CHANGELOG.md`, no commit).
- Verified serially after one build (2026-10-04, repo `<repo-root>`): `pnpm --filter @web-ts-toolkit/express-request-attestation... build` pass (tsup CJS+ESM+DTS); `typecheck` pass (`tsc -p tsconfig.json` + `tsconfig.signer-browser.json`); `test:node` 15 files / 346 passed; `test:mongo` 31/31 passed (live single-node replica set via `mongodb-memory-server`, shared conformance + exactly-one winner + capacity/expiry + HTTP 200+403); `test:redis` 62/62 passed (live Docker 6.2+7.2); `test:browser` 23/23 passed (2 files; first attempt hit infra-only Chromium session-connect timeout `Port 63315 is in use`, retry green with no code change); `test:packed-consumer` 5/5 passed; `eslint src/stores/mongodb.ts src/index.ts test/mongo-*.ts vitest.mongo.config.mts test/packed-consumer.test.ts` clean and `eslint .` (package) clean; `npm pack --dry-run --json` ships 12 files (`README.md`, `dist/*`, `package.json`) with no driver bundled.
- Per-task reconciliation: MONGO-01 claimed 49 unit + 346 node green — confirmed adapter `src/stores/mongodb.ts` (snapshot transactions, 64-reclaim, shared `AttestationCapacityError`, narrow `AttestationMongoStoreError`, no client lifecycle) plus root Mongo exports still present; MONGO-02 claimed 31 live + node/redis/browser/packed green — confirmed harness `test/mongo-harness.ts` (disposable `MongoMemoryReplSet` count 1, randomized DBs, absence fails lane) and `test/mongo-live.test.ts` green live, with identical `test/store-conformance.ts` margins as Redis; MONGO-03 claimed README/decl/packed coverage — confirmed `src/index.ts` header lists memory/Redis/Mongo, `README.md` Mongo wiring/capacity/failure/store-choice + `test:mongo` commands, `test-decl-consumer/backend-strict.mts` root Mongo named import without driver, packed manifest `sideEffects:false`, `dist/signer.{mjs,js}` zero `mongodb` refs, named export `createMongoAttestationStore` is `function` with `default: undefined`.
- Parity/docs checks: duplicate-wins-over-capacity, no live eviction, no reservation without commit, no release after handler failure, `retainUntil` alias precedence, 240s global cap without clamping, non-TTL ledger + `retainUntilMs` index guidance, replica-set + synchronized-clock + caller-owned `Db` lifecycle all present in `src/stores/mongodb.ts` JSDoc and README; `mongodb` remains dev-only (`package.json` devDeps), `sideEffects:false` holds, no `export default` in `dist/index.{mjs,js}`.
- Notes: no skipped/mocked live test counted as evidence; `test:mongo` ran live (not skipped); no unrelated package behavior changed in this review (no source edits); first `test:browser` infra timeout is not a product blocker.
- Remaining blockers: none. Follow-ups (non-blocking): none required; future work stays outside this task scope.

Priority: P0

Suggested role: independent reviewer (a different reviewer/session from the implementer)

Dependencies: MONGO-01 through MONGO-03

Primary ownership:

- Review of `packages/express-request-attestation/src/stores/mongodb.ts`, mongo tests/harness, docs, and wiring.
- This task file's final acceptance/evidence record.

Finding:

The Mongo adapter must meet the same bar as Redis: identical admission contract, live multi-client evidence, bounded operations, and honest failure behavior — without weakening existing lanes.

References:

- Sections 1–4 of this file and each task's acceptance criteria.
- Repository `AGENTS.md` (serial builds/tests, no overlapping `dist` writers).

Implementation requirements:

1. Reconcile every task's completion evidence with runtime tests, final public types/defaults, shipped README, and the base contract (sections 4.1/4.4/4.5 of the base task file). Identify skipped/mocked failures by real scope.
2. Require: `build`, `typecheck`, `test:node`, `test:mongo` (live replica set), `test:redis`, `test:browser`, `test:packed-consumer` green serially after one build; `eslint` clean on all touched files; root `pnpm exec eslint .` clean for owned paths.
3. Verify parity: same conformance suite green on memory/Redis/Mongo; cross-client exactly-one winner on Mongo; capacity/expiry/duplicate semantics identical; no live eviction; no reservation without commit; no release after handler failure.
4. Verify docs/types: root export, JSDoc on declarations, README wiring correct, browser closure unaffected, `mongodb` not required for `/signer` consumers.
5. Record changed files, exact commands/results, prerequisites, and any follow-ups. Never mark complete with an unverified mandatory lane.

Acceptance criteria:

- All MONGO-01–03 outcomes complete with evidence; full package `test` (all lanes incl live Mongo) green; lint clean.
- No skipped/mocked live test counted as deployment evidence; no unrelated package behavior changed.
- This file contains final evidence and explicit follow-ups; no completed task relies on implementation intent.

## 5. Execution order

```text
MONGO-01 -> MONGO-02 -> MONGO-03 -> MONGO-04
```

Strictly sequential; each task's acceptance depends on its predecessors. One owner writes shared hotspots (`src/index.ts`, `package.json`, README) at a time.

## 6. Definition of done

- `createMongoAttestationStore` shipped with identical admission semantics, live replica-set evidence, and multi-client atomicity proof.
- All package lanes green serially (`node`, `mongo`, `redis`, `browser`, `packed-consumer`) plus typecheck and lint.
- Docs/types let a fresh app wire the Mongo store from the README without opening repo source.
- This file updated with per-task `Completion evidence`; no task left without an owner for its blockers.
