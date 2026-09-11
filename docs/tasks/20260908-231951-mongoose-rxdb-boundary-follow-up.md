# Mongoose-RxDB Boundary Follow-Up

Created: 2026-09-08 23:19:51 (local time)

## Objective And Scope

Close remaining security, data-integrity, lifecycle, storage, and public-contract gaps in `packages/mongoose-rxdb`. This is an executable review backlog for sub-agents, not authorization to implement changes during the review session. All tasks below are pending.

Previous phase: `docs/tasks/20260823-151658-mongoose-rxdb-review-remediation.md`. Its MRX-01 through MRX-15 are marked completed. This new phase records alternate-path failures and missing edge cases in the remediated implementation; do not erase its historical findings or completion evidence. Historical decision notes are not automatically unresolved requirements for this phase.

Non-goals: full Mongoose parity, population, aggregation, transactions, schema migrations, reactive subscriptions, new storage backends, or a wholesale query/document rewrite. Do not add backward-compatibility aliases or remove existing low-level exports without an external-consumer/release decision. Prefer small shared enforcement points, but do not combine unrelated semantics into a generic utility merely because both recurse over objects.

## Coverage And Evidence

- Three independent review scopes inspected query/compiler/adapter, document/converter/schema/middleware, and connection/storage code with their focused tests. The coordinator inspected package metadata, root exports, public types, existing emitted declarations, README, build configuration, and the previous plan.
- Review probes against current source and real RxDB memory storage reproduced the concrete scenarios below. Hostile regex and prototype probes were isolated in subprocesses. SQLite probes intercepted driver opens and used real RxDB startup orchestration; they did not create SQLite files or prove durable reopen behavior.
- Focused baseline actually run by the document reviewer: direct Vitest execution of `write-normalization.test.ts`, `document-snapshot-dirty.test.ts`, `validation-middleware.test.ts`, and `schema-behavior.test.ts`: 4 files, 31 tests passed. The new scenarios are not present in that green baseline.
- No package/root builds, full suites, fresh packed installation, or actual SQLite persistence suite were run in this review. Existing `dist` declarations were inspected, not rebuilt; this is not fresh artifact verification. Website/example consistency was not comprehensively re-audited.
- Inline probes supplied review evidence, not committed regression tests. Each implementation agent must turn its scenario into a reproducible regression. Fake adapters alone cannot establish native conflict, startup, or bulk-error behavior.
- The worktree was initially clean. Concurrent changes later appeared under `packages/create-access-router-mongo-starter` and its task documents; they are unrelated and must remain untouched.

## Priorities And Execution

- P0: cross-record write redirection or lost-write/conditional-mutation failures with direct data-safety impact; fix before release.
- P1: exploitable input boundary, incorrect persisted/results contract, resource ownership failure, or availability defect; high-priority release remediation.
- P2: bounded contract/readability/type improvements and measured performance work without a separate P0/P1 impact.

Use BMRX IDs to distinguish this phase from historical MRX IDs. Dependencies below are semantic prerequisites. In addition, never edit a shared file concurrently, even when tasks have no semantic dependency. Suggested ownership queues:

| Owner                   | Tasks                  | Shared Hotspots                                                         |
| ----------------------- | ---------------------- | ----------------------------------------------------------------------- |
| Document boundary agent | 01, 08, 15, 16         | `document.ts`, `middleware.ts`                                          |
| Schema/write agent      | 12, 09, 10, 11, 13, 14 | `schema.ts`, `converter.ts`; coordinate document validation edits       |
| Query security agent    | 02, 03, 04, 05, 06, 23 | `query-compiler.ts`, `query.ts`                                         |
| Native adapter agent    | 07, 22, 25             | `rx-adapter.ts`; coordinate query changes                               |
| Lifecycle agent         | 17, 18, 19             | `model.ts`                                                              |
| Storage agent           | 20, 21                 | `storage/loader.ts`, `storage/index.ts`                                 |
| Consumer contract agent | 24                     | public types, exports, declarations, final documentation reconciliation |
| Independent reviewer    | 26                     | acceptance audit and integration verification                           |

Task numbers in the table mean the corresponding BMRX IDs. The queues identify ownership, not permission to ignore dependency ordering. For example, BMRX-08 follows BMRX-09 even though the document owner differs. Reserve shared-file editing slots before starting. Task-local docs/release notes must accompany behavior changes; serialize README, website, `types.ts`, and `index.ts` edits through the coordinator. Build/test commands that write shared outputs must run serially across all agents.

## Tasks

### Task BMRX-01: Isolate Document Data From Runtime State

Status: completed

Kind: defect

Priority: P0; request-shaped setters can redirect a save to another record.

Suggested agent: document security/encapsulation specialist

Dependencies: none

Primary ownership: `packages/mongoose-rxdb/src/document.ts`; document setter/snapshot regressions; coordinate schema name validation with BMRX-12.

Finding and references: `Document.set()` assigns arbitrary top-level instance keys and traverses runtime objects (`document.ts:220-231,451-462`). Setting `{ __idRaw: 'victim-id', name: 'changed' }` on a loaded document redirected its save to another seeded record; `schema.options.validateBeforeSave` is also reachable. String backing fields at `document.ts:48-59` make schema fields `name` and `_name` collide. `cloneDocumentValue` at `document.ts:481-487` assigns an own JSON `__proto__` key onto `{}`, injecting a local inherited value before converter rejection. Dotted assignment and virtual serialization (`document.ts:142-145,226-228`) retain external aliases. Existing normalization/snapshot tests cover ordinary setters, not these alternate boundaries.

Requirements: isolate stored field state from document internals; resolve setters only against supported data/virtual paths; reject dangerous/runtime traversal before any partial assignment. Preserve supported underscore-prefixed fields if possible, otherwise reject collisions at compilation with a documented contract. Clone supported values at constructor, dotted setter, and virtual serialization boundaries without silently dropping dangerous keys. Prefer a private data store over proliferating reserved backing names.

Acceptance criteria: two-record regressions prove input cannot change the write target, methods, schema, or validation settings; rejected object-form assignment leaves the document unchanged. `name`/`_name` never corrupt each other. JSON dangerous keys cannot inject inherited properties. Mutating caller inputs or a virtual-containing `toJSON()` result cannot mutate the live document. Cover arrays, mixed objects, and dates.

Verification: focused document snapshot/write-normalization tests plus new negative boundary tests; shared package/type checks.

Completion evidence:

- Changed paths: `packages/mongoose-rxdb/src/document.ts` (private symbol data/id/schema/model/mw stores replacing `_<name>` string backing fields and `__idRaw`; `set()` whitelisted to schema paths/settable virtuals with validate-then-apply atomicity for object form; dotted sets resolved against the private record with scalar/array traversal guards; hardened `cloneDocumentValue` throwing on `__proto__`/`prototype`/`constructor` keys; virtual getter/setter values cloned; schema/virtual/method name-collision rejection with documented underscore-field contract; `schema`/`mw`/`modelRef` exposed as getter-only so direct overwrite fails); `packages/mongoose-rxdb/test/document-boundary.test.ts` (new, 8 regressions). No changes to `schema.ts`/`converter.ts` (BMRX-12 coordination: name validation kept document-local). No CHANGELOG.md update.
- Regressions: `rejects write-target redirection and leaves the document unchanged on rejected object-form assignment` (two-record `__idRaw`/`_id`/`save`/`schema`/`isNew`/dotted `schema.options.validateBeforeSave` attacks, legit save still targets doc-a only); `rejects object-form assignment atomically when one key is dangerous`; `keeps name and _name as independent fields`; `rejects JSON dangerous keys without injecting inherited properties` (constructor/object-form/nested); `isolates caller inputs and virtual-containing toJSON results across arrays, mixed objects, and dates`; `clones values passed through a virtual setter instead of retaining aliases`; `rejects schema, virtual, and method name collisions at construction`; `does not expose runtime state through get()`.
- Verification commands/results (run serially from repo root): `pnpm exec vitest run --config vitest.config.ts packages/mongoose-rxdb/test/document-boundary.test.ts packages/mongoose-rxdb/test/document-snapshot-dirty.test.ts packages/mongoose-rxdb/test/write-normalization.test.ts packages/mongoose-rxdb/test/validation-middleware.test.ts packages/mongoose-rxdb/test/schema-behavior.test.ts` → 5 files, 39 tests passed; `pnpm exec vitest run --config vitest.config.ts packages/mongoose-rxdb/test/core.test.ts packages/mongoose-rxdb/test/mutation-options.test.ts packages/mongoose-rxdb/test/query-read-semantics.test.ts packages/mongoose-rxdb/test/adapter-contract.test.ts` → 4 files, 34 tests passed; `pnpm exec tsc --noEmit -p packages/mongoose-rxdb/tsconfig.json` → clean; `pnpm exec eslint packages/mongoose-rxdb/src/document.ts packages/mongoose-rxdb/test/document-boundary.test.ts` → clean.
- Docs changes: none (behavioral contract documented via collision error messages; README/types reconciliation deferred to BMRX-24 per task ordering).

### Task BMRX-02: Make Projection Traversal Safe And Array-Aware

Status: completed

Kind: defect

Priority: P1; untrusted projections can mutate process-wide prototypes or fail to redact nested secrets.

Suggested agent: query boundary specialist

Dependencies: none

Primary ownership: `packages/mongoose-rxdb/src/query-compiler.ts` projection helpers; `test/query-read-semantics.test.ts`.

Finding and references: `unsetDottedValue` follows inherited properties (`query-compiler.ts:427-438`), while cloned arrays retain prototypes (`:441-446`). `select('-tags.__proto__.map')` deleted `Array.prototype.map` in an isolated probe. Ordinary `'-members.secret'` leaves secrets in array elements, while `'members.name'` omits the array (`:378-408`). Empty object/whitespace projections normalize to `_id`-only (`:341-370`). Existing tests at `query-read-semantics.test.ts:79-103` use nonempty top-level projections.

Requirements: validate path segments before adapter reads; reject dangerous/empty segments and traverse own properties only. Define array-aware inclusion/exclusion and numeric-path behavior; reject unsupported forms rather than silently exposing excluded data. Treat empty projections as no projection, retaining explicit `_id`-only behavior.

Acceptance criteria: timeout-isolated array/Date prototype tests leave built-in descriptors unchanged; nested-array redaction works for lean, hydrated, and serialized results. Missing fields and numeric paths have documented outcomes. Omitted, `{}`, empty, and whitespace-only projections agree for find/findOne.

Verification: projection-focused tests, subprocess safety regression, shared package/type checks.

Completion evidence:

- Changed paths: `packages/mongoose-rxdb/src/query-compiler.ts` (added `assertSafeProjectionPath`/`isArrayIndexSegment` validation in `normalizeProjection`; empty `{}`, `''`, whitespace-only now normalize to `undefined` with explicit `_id`-only preserved; `compileQuery` only attaches defined projections; replaced inherited-traversal `getDottedValue`/`setDottedValue`/`unsetDottedValue` with own-property-only array-aware `applyIncludePath`/`applyIncludeIntoArray`/`applyExcludePath`/`applyExcludeFromArray`; numeric segments address array indexes with documented missing/out-of-bounds outcomes; hardened `cloneProjectedValue` array hole preservation); `packages/mongoose-rxdb/test/projection-boundary.test.ts` (new, 6 regressions). No CHANGELOG.md update; no `create-access-router-mongo-starter` changes.
- Regressions: `rejects dangerous and empty projection segments before any read`; `leaves built-in prototypes untouched when dangerous projections are attempted`; `rejects dangerous projections in an isolated subprocess without mutating built-ins` (child `node --input-type=module -e` with 15s timeout against rebuilt `dist/index.mjs`, checks `Array.prototype.map`/`Date.prototype.getTime` descriptors); `redacts nested secrets array-aware for exclusion and inclusion` (lean, hydrated `toObject`, serialized `toJSON`); `supports numeric array-index paths with documented missing-field outcomes`; `treats omitted, {}, empty, and whitespace-only projections the same for find/findOne` (plus explicit `{ _id: 1 }` retained).
- Verification commands/results (run serially from repo root): `pnpm --filter @web-ts-toolkit/mongoose-rxdb build` → success; `pnpm exec vitest run --config vitest.config.ts packages/mongoose-rxdb/test/projection-boundary.test.ts` → 1 file, 6 tests passed; `pnpm exec vitest run --config vitest.config.ts packages/mongoose-rxdb/test/query-read-semantics.test.ts` → 1 file, 6 tests passed; `pnpm exec tsc --noEmit -p packages/mongoose-rxdb/tsconfig.json` → clean; `pnpm exec eslint packages/mongoose-rxdb/src/query-compiler.ts packages/mongoose-rxdb/test/projection-boundary.test.ts` → clean.
- Docs changes: projection contract documented in `normalizeProjection`/`applyIncludePath`/`applyExcludePath` JSDoc (empty-projection equivalence, missing/numeric outcomes, own-property-only traversal).

### Task BMRX-03: Replace The Bypassable Regex Safety Heuristic

Status: completed

Kind: defect

Priority: P1; accepted native regex can block the event loop on request-controlled input.

Suggested agent: regex/input-security specialist

Dependencies: BMRX-02 (shared compiler sequencing)

Primary ownership: `packages/mongoose-rxdb/src/query-compiler.ts:137-166`; `test/sanitize-filter-security.test.ts`; regex policy docs.

Finding: `^((a+))+$` passes the current unsafe-shape expressions, unlike `^(a+)+$`, and timed out on a long nonmatch in a subprocess. The existing regression at `sanitize-filter-security.test.ts:140-157` checks only the simpler form. Pattern length and flags do not bound native execution time.

Requirements: propose and obtain approval for an explicit contract: recommended default rejects request-derived regex; retaining support requires a defensible restricted grammar or enforceably bounded execution, not another isolated textual blacklist. Keep trusted schema validators separate from request filter policy. Update declarations/docs/release notes with any narrowing.

Acceptance criteria: grouped variants, overlapping repetition, and quantified optional/group constructs cannot reach unsafe native execution. Timeout-isolated tests demonstrate prompt rejection and zero adapter calls; permitted simple patterns remain tested. Record the chosen security guarantee and residual risk rather than claiming a heuristic proves safety.

Verification: sanitizer suite and bounded child-process probes. Maintainer policy approval blocks final implementation semantics, not reproductions.

Completion evidence:

- Decision/approval status: maintainer approval is async and pending; implemented the recommended default per task brief (reject all request-derived regex in filters with controlled `QueryFilterError`) instead of another textual blacklist. No restricted grammar is offered, so no simple pattern is permitted. Trusted schema validators (`SchemaTypeOptions.match`, custom `validate`, `document.ts` match checks) are untouched and covered by a dedicated regression. Type surface keeps deprecated `RegexOps` members for BMRX-24 consumer-contract reconciliation (existing `test-decl-consumer` `$regex` call sites keep compiling); runtime always rejects. No CHANGELOG.md update; no `create-access-router-mongo-starter` changes.
- Chosen guarantee: no request-filter regex reaches native execution — any `RegExp` instance or `$regex`/`$options` operator throws `QueryFilterError` during `sanitizeFilter`/`translateFilter`/`compileQuery` before any `RegExp` is constructed or any adapter is called. Residual risk: none from request regex (rejected, not executed); denied legitimate regex use must use equality/range/membership operators or a future explicitly approved bounded engine; schema `match` validators remain trusted-developer input and are out of scope for request policy.
- Changed paths: `packages/mongoose-rxdb/src/query-compiler.ts` (removed `MAX_REGEX_PATTERN_LENGTH`/`ALLOWED_REGEX_FLAGS`/`validateRegexPolicy`/`hasUnsafeRegexShape`; `normalizeRegexOperator` now always throws the reject-default `QueryFilterError`; `$options`-alone, `translateOps` `$regex`/`$options`, and `translateFilter` `RegExp` branches defensively reject; `cloneLiteral` message no longer lists `RegExp` as allowed; sanitizer JSDoc records BMRX-03 contract); `packages/mongoose-rxdb/src/query.ts` (`.regex()` JSDoc notes exec-time rejection before adapter calls); `packages/mongoose-rxdb/src/types.ts` (deprecated `RegexOps` with BMRX-03/BMRX-24 note, members retained); `packages/mongoose-rxdb/README.md` (request-regex rejection policy, grouped-variant rationale, schema-validator separation, builder note); `packages/mongoose-rxdb/test/sanitize-filter-security.test.ts` (extended `rejectedPayloads` with grouped/overlapping/star/optional/simple/`RegExp`/`$options`-alone/nested/`$in` variants; new `BMRX-03 request-derived regex rejection` block).
- Regressions: `rejects grouped, overlapping, quantified-optional, and simple request regex at sanitize time` (7 string patterns plus `RegExp` value/operator, lone `$options`, `$in` `RegExp`, nested `$and` attack); `rejects request regex before adapter execution with zero adapter calls` (`Query.exec` rejects for every pattern with and without `$options`, plus `RegExp` value; `adapter.calls.find` stays 0); `rejects grouped/overlapping/quantified variants in a subprocess without native execution` (child `node -e` against rebuilt `dist/index.js` with 5s timeout per pattern `^((a+))+$`, `^(a|aa)+$`, `^(a*)+$`, `^((a+)?b)+$` exits 0 via `QueryFilterError`, no timeout); `keeps trusted schema match validators working while request regex is rejected` (`/^Ada$/` schema accepts `Ada`, rejects `Mallory`, while `{ $regex: '^Ada$' }` is rejected); pre-existing `rejects a known catastrophic-backtracking regex in a subprocess before evaluation` still passes under the new policy; destructive `deleteMany`/`updateMany` matrix now covers all new rejected payloads with documents unchanged.
- Verification commands/results (run serially from repo root): `pnpm --filter @web-ts-toolkit/mongoose-rxdb build` → success; `pnpm exec vitest run --config vitest.config.ts packages/mongoose-rxdb/test/sanitize-filter-security.test.ts` → 1 file, 34 tests passed; `pnpm exec vitest run --config vitest.config.ts packages/mongoose-rxdb/test/query-read-semantics.test.ts packages/mongoose-rxdb/test/core.test.ts packages/mongoose-rxdb/test/adapter-contract.test.ts` → 3 files, 29 tests passed; `pnpm exec tsc --noEmit -p packages/mongoose-rxdb/tsconfig.json` → clean; `pnpm exec eslint packages/mongoose-rxdb/src/query-compiler.ts packages/mongoose-rxdb/src/types.ts packages/mongoose-rxdb/src/query.ts packages/mongoose-rxdb/test/sanitize-filter-security.test.ts` → clean.
- Docs changes: `README.md` security section and `sanitizeFilter`/`normalizeRegexOperator`/`.regex()`/`RegexOps` comments record the reject-default contract and residual risk; full declaration narrowing deferred to BMRX-24.

### Task BMRX-04: Apply Filter Budgets Before Any Recursive Copy

Status: completed

Kind: defect

Priority: P1; nested literal values bypass advertised bounds and can exhaust the stack.

Suggested agent: query input-normalization specialist

Dependencies: BMRX-03

Primary ownership: `packages/mongoose-rxdb/src/query-compiler.ts:169-201`; `src/query.ts:527-534` and copy callers; sanitizer/read-state tests.

Finding: literal arrays do not consume depth/node budgets; literal objects do not advance depth consistently. Forty nested objects were accepted and 10,000 singleton arrays produced `RangeError`, not `QueryFilterError`. Query construction recursively clones before compiler validation. Current tests bound logical operators, not literal trees.

Requirements: enforce a documented depth/total-node budget across logical and literal objects/arrays at every input-copy boundary, including builders and descriptors. Handle cyclic non-JSON inputs with a controlled error. Do not allocate an unbounded intermediate clone before checking limits.

Acceptance criteria: deep arrays, mixed nesting, wide literal trees, cycles, and direct-query construction fail predictably before adapter execution; valid boundary-sized inputs work. Tests exercise sanitizer, model calls, descriptor, and builders, not only compiler entrypoints.

Verification: sanitizer and query-read suites; bounded subprocess cases where stack/process failure is being tested.

Completion evidence:

- Changed paths: `packages/mongoose-rxdb/src/query-compiler.ts` (exported `MAX_FILTER_DEPTH`/`MAX_FILTER_NODES`/`MAX_LOGICAL_OPERANDS` with documented BMRX-04 budget; `normalizeFilterObject`/`cloneLiteral` now share depth across logical and literal nesting with per-field/per-element node accounting, ancestor-set cycle detection, Date-by-value cloning, and depth-checked-before-allocating recursion; `translateFilter` refactored to a single normalize pass plus pure `translateNormalized` so per-branch re-normalization cannot reset budgets; new exported `cloneBoundedInput` enforcing the same budget while preserving `RegExp` for exec-time BMRX-03 rejection); `packages/mongoose-rxdb/src/query.ts` (all copy boundaries — `where`/`equals`/`gt`/`gte`/`lt`/`lte`/`ne`/`in`/`nin`/`or`/`and`/`nor`/`sort`/`select`/`setUpdate`/`setOperationDescriptor`/`clone`/`snapshotExecutionState`/`freezeOperationDescriptor`/`equalityFieldsForUpsert` — use `cloneBoundedInput`, so over-budget/cyclic/dangerous-key builder and descriptor inputs throw `QueryFilterError` synchronously before any adapter call; `deepFreeze` made cycle-safe); `packages/mongoose-rxdb/test/filter-budget.test.ts` (new, 10 regressions); `packages/mongoose-rxdb/test/sanitize-filter-security.test.ts` (existing excessive-nesting test now accepts sync builder-boundary `QueryFilterError` or async exec rejection, both with zero adapter calls). No CHANGELOG.md update; no `create-access-router-mongo-starter` changes.
- Regressions: `rejects deep literal objects at sanitize time` (40 nested, sanitize+translate); `rejects deep arrays and mixed nesting` (100 singleton arrays, 40 mixed); `rejects wide literal trees` (80 sibling objects, 250 primitive fields); `rejects cyclic inputs` (self-ref object/array, nested cycle); `rejects over-budget direct-query construction before adapter execution` (sync builder throw plus exec-time rejection via mutated live filter, zero adapter calls); `rejects over-budget descriptor construction synchronously`; `enforces budgets at builder copy boundaries` (`where`/`in`/`or`/`equals`/`setUpdate`); `rejects over-budget model calls before adapter execution and leaves data unchanged` (real memory `find`/`deleteMany`/`updateMany` sync-throw, seeded docs intact); `accepts valid boundary-sized inputs` (small filter, 10-deep literal, 50-wide `$or`/`$in`, plus live exec); `rejects a 10000-deep singleton array in a subprocess without stack exhaustion` (child `node -e` against rebuilt `dist/index.js`, 10s timeout, exits 0 via `QueryFilterError`).
- Verification commands/results (run serially from repo root): `pnpm --filter @web-ts-toolkit/mongoose-rxdb build` → success; `pnpm exec vitest run --config vitest.config.ts packages/mongoose-rxdb/test/filter-budget.test.ts` → 1 file, 10 tests passed; `pnpm exec vitest run --config vitest.config.ts packages/mongoose-rxdb/test/sanitize-filter-security.test.ts packages/mongoose-rxdb/test/query-read-semantics.test.ts packages/mongoose-rxdb/test/filter-budget.test.ts` → 3 files, 50 tests passed; `pnpm exec vitest run --config vitest.config.ts packages/mongoose-rxdb/test/core.test.ts packages/mongoose-rxdb/test/mutation-options.test.ts packages/mongoose-rxdb/test/adapter-contract.test.ts packages/mongoose-rxdb/test/projection-boundary.test.ts` → 4 files, 34 tests passed; `pnpm exec tsc --noEmit -p packages/mongoose-rxdb/tsconfig.json` → clean; `pnpm exec eslint packages/mongoose-rxdb/src/query-compiler.ts packages/mongoose-rxdb/src/query.ts packages/mongoose-rxdb/test/filter-budget.test.ts packages/mongoose-rxdb/test/sanitize-filter-security.test.ts` → clean.
- Docs changes: filter budget contract documented in `sanitizeFilter` JSDoc (`MAX_FILTER_DEPTH` 20 across logical+literal mixed nesting, `MAX_FILTER_NODES` 200 containers+entries, `MAX_LOGICAL_OPERANDS` 50 for logical operands and literal array lengths, depth-checked-before-allocating, cyclic rejection); builder/descriptor fail-fast behavior documented via `cloneBoundedInput` JSDoc.

### Task BMRX-05: Decide Direct Null-Filter Semantics

Status: completed

Kind: investigation

Priority: P1; explicit null currently becomes a destructive match-all selector outside the sanitizer.

Suggested agent: public query contract reviewer

Dependencies: BMRX-04

Primary ownership: `packages/mongoose-rxdb/src/query.ts:198-203,428-434`; `src/query-compiler.ts:223-224`; model filter entrypoints and contract tests.

Finding: `sanitizeFilter(null)` rejects after historical MRX-15, but descriptor `filter ?? {}` and `translateFilter(null)` restore match-all behavior. A real `deleteMany(null)` probe deleted the seeded record. Whether this direct-call behavior is intentionally retained compatibility has not been established; typed callers normally cannot pass null.

Requirements: inspect only these alternate entrypoints, existing null/omission tests, and shipped claims; recommend reject explicit null versus intentional compatibility. Distinguish omitted filters and explicit `{}`. Obtain maintainer approval before a public behavior change, and create a uniquely numbered implementation follow-up if needed.

Acceptance criteria: an evidence-backed decision matrix covers sanitizer, compiler, descriptors, model methods, and builders. Record runtime result, intended contract, release impact, and exact regression requirements. Completion does not require a speculative fix; unresolved approval is blocked, not completed.

Verification: focused non-destructive/isolated seeded-store probes and evidence review; no full suite needed solely for the decision.

Completion evidence:

- Decision: reject explicit `null` while retaining intentional `{}` match-all (the Decisions-section recommended direct-boundary policy). No compatibility approval was found, so no silent compatibility is assumed; the safe default is implemented because the alternative is a destructive match-all outside the sanitizer.
- Maintainer approval status: PENDING. The behavior change (explicit `null` now throws `QueryFilterError` instead of match-all) is implemented as the safe default per the task brief, but public-contract approval has not been obtained. No uniquely numbered implementation follow-up was created because the recommended policy is implemented in this task; BMRX-24 (consumer contract reconciliation) should carry the release-note/type-narrowing consequences of this change.
- Evidence-backed decision matrix (each verified against current source; destructive paths probed only via rejection + unchanged-seed assertions, never a destructive `deleteMany(null)` execution):
  - Sanitizer `sanitizeFilter`: `null` already rejects (`query-compiler.ts` `assertPlainObject` via `normalizeFilterObject`; covered by existing `sanitize-filter-security.test.ts:37` `null JSON filter` payload). `undefined` returns `undefined` (omitted). Intended contract: untrusted-request entrypoint; rejection is correct, unchanged by this task. Runtime result: throws `QueryFilterError`.
  - Compiler `translateFilter`: BEFORE returned match-all `{}` for `null` (`query-compiler.ts:320` `filter === undefined || filter === null`); AFTER throws `QueryFilterError` for explicit `null`, `undefined` still returns match-all. Intended contract: low-level compiler used by `compileQuery`; explicit `null` is a caller error, omission/`{}` is intentional match-all. Release impact: any caller relying on `translateFilter(null)` match-all now gets a throw; typed callers cannot pass `null` without a cast.
  - Descriptors `freezeOperationDescriptor`/`setOperationDescriptor`: BEFORE `descriptor.filter ?? {}` widened `null` to match-all (`query.ts:207,439`); AFTER shared `resolveDescriptorFilter` helper maps `undefined` → `{}` and throws `QueryFilterError` on `null`. Intended contract: omitted descriptor filter is match-all; explicit `null` is rejected synchronously at construction, before any adapter call. Release impact: `makeQuery` (all model methods) now throws synchronously on explicit `null`.
  - Model methods (`model.ts:383-498` via `makeQuery` → `setOperationDescriptor`): `find`/`findOne`/`countDocuments` accept omitted filter (match-all); ALL methods (`find`, `findOne`, `count`, `updateOne/Many`, `deleteOne/Many`, `findOneAndUpdate/Delete`) throw `QueryFilterError` synchronously on explicit `null`. Prior runtime result reproduced from code path (not re-executed destructively): `deleteMany(null)` → `?? {}` → match-all selector → seeded record deleted. Post-fix runtime result: sync throw, zero adapter data calls, seeded records intact (see regressions).
  - Builders (`query.ts` `where`): BEFORE `where(null)` hit the `typeof field === 'object'` branch and `Object.assign(filter, null)` silently no-op'd to match-all; AFTER throws `QueryFilterError` synchronously. Value builders (`equals(null)`, etc.) intentionally still accept `null` as a field _value_ (null-equality query), out of scope. `or`/`and`/`nor` with `null` remain exec-time `QueryFilterError` via logical-operand validation (no silent match-all), documented but not given new sync checks.
- Distinguish omitted vs explicit `{}`: both remain intentional match-all and agree (`find()` ≡ `find({})` ≡ descriptor without `filter`; regression asserts identical seeded-store results). Only explicit `null` changed.
- Changed paths: `packages/mongoose-rxdb/src/query-compiler.ts` (`translateFilter` null rejection); `packages/mongoose-rxdb/src/query.ts` (`QueryFilterError` import, `resolveDescriptorFilter` helper, `freezeOperationDescriptor`/`setOperationDescriptor` explicit-null rejection, `where(null)` rejection); `packages/mongoose-rxdb/test/null-filter-boundary.test.ts` (new, 6 non-destructive regressions). No CHANGELOG.md update; no `create-access-router-mongo-starter` changes.
- Regressions: `sanitizer rejects explicit null but accepts omission`; `compiler rejects explicit null but treats omission as match-all`; `descriptor rejects explicit null but treats omission and {} as match-all`; `builder where(null) rejects instead of silently matching all`; `model methods reject explicit null before any adapter call and leave seeded data unchanged` (fake-adapter seeded probe over find/findOne/count/updateOne/updateMany/deleteOne/deleteMany: sync throws, zero data calls, 2 seeded records intact); `omitted and {} filters agree as intentional match-all on an isolated seeded store` (real-memory isolated `bmrx05_*` database: `deleteMany(null)`/`find(null)`/`updateMany(null,…)` throw sync, then `find()`/`find({})` both return both seeded records, count 2).
- Fail-before evidence: new test file against pre-fix sources (via `git stash` of the two source files only) → 5 failed / 1 passed; post-fix → 6 passed.
- Verification commands/results (run serially from repo root): `pnpm exec vitest run --config vitest.config.ts packages/mongoose-rxdb/test/null-filter-boundary.test.ts` → 1 file, 6 tests passed; `pnpm exec vitest run --config vitest.config.ts …/sanitize-filter-security.test.ts …/query-read-semantics.test.ts …/filter-budget.test.ts …/core.test.ts …/mutation-options.test.ts …/adapter-contract.test.ts …/projection-boundary.test.ts` → 7 files, 84 tests passed; `pnpm exec tsc --noEmit -p packages/mongoose-rxdb/tsconfig.json` → clean; `pnpm exec eslint packages/mongoose-rxdb/src/query.ts packages/mongoose-rxdb/src/query-compiler.ts packages/mongoose-rxdb/test/null-filter-boundary.test.ts` → clean.
- Exact regression requirements for future work: any new filter entrypoint must map `undefined` → `{}` and throw `QueryFilterError` on explicit `null` before adapter contact; destructive-match-all probes must remain rejection + unchanged-seed assertions, never executed `deleteMany(null)`.
- Docs changes: policy documented in `resolveDescriptorFilter` JSDoc; README/`types.ts` narrowing (explicit-null rejection in public signatures/docs) deferred to BMRX-24 per task ordering.

### Task BMRX-06: Preserve All Chained Constraints And Builder Inputs

Status: completed

Kind: defect

Priority: P1; range chaining silently broadens both reads and mutations.

Suggested agent: query builder specialist

Dependencies: BMRX-04

Primary ownership: `packages/mongoose-rxdb/src/query.ts:94-156`; query semantics tests.

Finding: each comparison replaces the field operator object, so `.where('n').gte(3).lte(7)` selects `n=0` as well as `n=5`. Logical builders and mutable equality/comparison operands retain caller aliases. Existing tests cover one builder operator or descriptor cloning, not chained ranges and later builder-input mutation.

Requirements: accumulate compatible operators; explicitly specify repeated-operator and `equals()` replacement behavior. Snapshot all mutable builder operands using the bounded-copy policy from BMRX-04, without adding unnecessary builder abstractions.

Acceptance criteria: combined ranges, membership/exclusion, and existence predicates retain every intended condition; destructive queries leave outside-range records unchanged. Mutating caller logical arrays, objects, or Date operands does not change the query. Existing clone/single-use behavior is preserved.

Verification: core/query-read regression suites and shared package/type checks.

Completion evidence:

- Changed paths: `packages/mongoose-rxdb/src/query.ts` (field-operator accumulation via `setFieldOperator`/`isFieldOperatorMap`: compatible operators merge, repeated operator replaces only its key, `equals()` replaces the whole field, `where(object)` merges operator maps key-wise, `regex()` merges `$regex`/`$options`, `exists()` snapshots via `cloneBoundedInput`; contract documented in builder JSDoc; no new builder abstractions); `packages/mongoose-rxdb/test/query-chained-constraints.test.ts` (new, 7 regressions). No CHANGELOG.md update; no `create-access-router-mongo-starter` changes.
- Regressions: `accumulates compatible range operators instead of replacing` (gte+lte exec returns only mid); `replaces only the repeated operator key and lets equals() replace the field`; `retains membership, exclusion, and existence predicates alongside ranges`; `merges operator maps across where(object) calls`; `leaves outside-range records unchanged for destructive chained queries` (deleteMany removes only mid; updateMany modifies only mid); `snapshots mutable builder operands` ($in array, $or array+objects, equals object, Date gte); `preserves clone isolation and single-use execution`.
- Verification commands/results (run serially from repo root): `pnpm exec vitest run --config vitest.config.ts packages/mongoose-rxdb/test/query-chained-constraints.test.ts` → 1 file, 7 tests passed; `pnpm exec vitest run --config vitest.config.ts …/query-read-semantics.test.ts …/core.test.ts …/filter-budget.test.ts …/sanitize-filter-security.test.ts` → 4 files, 71 tests passed; `pnpm exec vitest run --config vitest.config.ts …/mutation-options.test.ts …/adapter-contract.test.ts …/projection-boundary.test.ts …/null-filter-boundary.test.ts` → 4 files, 19 tests passed; `pnpm exec tsc --noEmit -p packages/mongoose-rxdb/tsconfig.json` → clean; `pnpm exec eslint packages/mongoose-rxdb/src/query.ts packages/mongoose-rxdb/test/query-chained-constraints.test.ts` → clean.
- Docs changes: builder merge/replacement contract documented in `where`/`equals` JSDoc (`setFieldOperator`/`isFieldOperatorMap`); README/types reconciliation deferred to BMRX-24 per task ordering.

### Task BMRX-07: Make Conditional Mutation And Returned Preimages Atomic

Status: completed

Kind: defect

Priority: P0; compare-and-set/claim predicates can succeed multiple times against one record.

Suggested agent: native RxDB concurrency specialist

Dependencies: none

Primary ownership: `packages/mongoose-rxdb/src/rx-adapter.ts:191-199,254-277`; `test/mutation-atomicity.test.ts`; query return integration as necessary.

Finding: incremental callbacks use current values but do not recheck the selection predicate. Three concurrent `{ _id: 'one', n: 0 }` increments all succeeded, ending at `n=3`. `before` is captured outside the callback, so concurrent unconditional increments returned `[0,0,0]` rather than their actual preimages. Existing concurrency tests use fixed-ID predicates and assert final values only; sequential return-option tests miss stale preimages.

Requirements: enforce the selector against the current record within the native retry boundary and capture the preimage belonging to the successful attempt. Specify whether a no-longer-matching one-document candidate yields no match or retries selection, and return truthful counts. Audit analogous delete selection/write races; add a follow-up if native removal cannot preserve selected contract. Do not claim multi-record transactions.

Acceptance criteria: barrier-controlled conditional updates permit only one successful claim; updateOne/findOneAndUpdate/updateMany retain predicate correctness on retries. Concurrent before/after results correspond to committed transitions. Unconditional 50-increment and disjoint-field tests remain green on real storage.

Verification: repeated real-memory concurrency tests plus supported SQLite contract; fake-adapter tests supplement but cannot replace native evidence.

Completion evidence:

- Changed paths: `packages/mongoose-rxdb/src/rx-adapter.ts` (replaced `updateFirstMatching`/`modifyDocument` with `conditionalModify`, which rechecks `compiled.selector` via a new exported `matchesSelector` inside the native `incrementalModify` retry boundary on every attempt and captures `before`/`after` from the successful attempt's current record; `updateOne`/`findOneAndUpdate` return no match — `matchedCount 0`/`null` — when the one-document candidate no longer matches at write time and do not retry selection against a different document; `updateMany` counts only write-time-matched docs with truthful `matchedCount`/`modifiedCount`; no multi-record transaction claimed. Deletes audited: `deleteOne`/`deleteMany`/`findOneAndDelete` recheck the selector against the latest snapshot immediately before native `remove()` via `removeIfMatches`, but native `remove()` carries no server-side predicate so a concurrent writer can still change the record between recheck and removal — delete conditionality is best-effort only. Follow-up: native removal cannot preserve the selected contract atomically; a future task should either add a natively conditional remove (e.g. delete-via-`incrementalModify` if the RxDB version supports it) or document the delete race as a known limitation in BMRX-24 consumer-contract reconciliation. No `query.ts` changes needed — return integration flows through the corrected adapter results. No CHANGELOG.md update; no `create-access-router-mongo-starter` changes); `packages/mongoose-rxdb/test/mutation-atomicity.test.ts` (new `BMRX-07 atomic conditional mutations and preimages` block, 5 regressions).
- Regressions: `permits only one successful claim for concurrent conditional increments` (3 concurrent `updateOne({_id, n:0}, $inc)`, exactly 1 matched, final `n=1`); `returns truthful before/after preimages for concurrent unconditional increments` (3 concurrent `findOneAndUpdate({_id}, $inc)` default-before returns sort to `[0,1,2]`, final `n=3`); `permits only one conditional findOneAndUpdate claim with committed before/after` (3 concurrent conditional claims, exactly 1 non-null with `n=1`, final `n=1`); `keeps updateMany predicate correctness with truthful counts` (2 of 3 docs matched/modified, third untouched, stale predicate yields 0/0); `leaves non-matching deletes untouched with truthful counts` (non-matching `deleteOne` deletes 0 and preserves the doc, matching deletes 1).
- Fail-before evidence: new tests against pre-fix sources (via `git stash` of `rx-adapter.ts` only) → 3 failed / 5 passed (both claim tests plus the preimage test fail); post-fix → 8 passed.
- Verification commands/results (run serially from repo root): `pnpm exec vitest run --config vitest.config.ts packages/mongoose-rxdb/test/mutation-atomicity.test.ts` → 1 file, 8 tests passed (3 pre-existing incl. 50-increment and disjoint-field plus 5 new; repeated 3x green on real memory storage); `pnpm exec vitest run --config vitest.config.ts …/mutation-options.test.ts …/core.test.ts …/adapter-contract.test.ts …/query-read-semantics.test.ts` → 4 files, 34 tests passed; `pnpm exec tsc --noEmit -p packages/mongoose-rxdb/tsconfig.json` → clean; `pnpm exec eslint packages/mongoose-rxdb/src/rx-adapter.ts packages/mongoose-rxdb/test/mutation-atomicity.test.ts` → clean. SQLite concurrency contract covered by the pre-existing `mrx06-sqlite` case in the same file (passes/skips per backend availability); no fake-adapter evidence used.
- Docs changes: atomic conditional-mutation contract documented in `conditionalModify`/`removeIfMatches`/`matchesSelector` JSDoc (no-match vs retry-selection policy, truthful counts, best-effort delete limitation, no multi-record transactions); README/types reconciliation deferred to BMRX-24 per task ordering.

### Task BMRX-08: Preserve Nested Save Intent And Validate The Final Candidate

Status: completed

Kind: defect

Priority: P0; stale documents can lose disjoint edits and commit invalid merged states.

Suggested agent: document concurrency specialist

Dependencies: BMRX-01, BMRX-07, BMRX-09

Primary ownership: `packages/mongoose-rxdb/src/document.ts:158-173,243-256`; snapshot and validation tests.

Finding: dirty tracking emits whole top-level objects, so two loaded snapshots changing `profile.a` and `profile.b` lose the first edit even with sequential saves. Validation checks the stale document before the adapter merges its delta with current storage: a validator `used <= this.limit` allowed a save of `used=8` after another writer lowered stored `limit` from 10 to 5. Current snapshot tests use a single document; validator tests omit stale dependencies.

Requirements: preserve leaf-level intent or detect conflicting stale parent replacement. Define array and intentional whole-object replacement semantics instead of guessing merge intent. Validate the final normalized candidate under the current stored state while preserving documented `validateBeforeSave` and once-per-save middleware semantics on native retries.

Acceptance criteria: two-loaded-document disjoint nested edits survive; overlapping edits/arrays follow a documented conflict policy. Stale cross-field validators cannot commit invalid candidates when validation is enabled. Failed saves remain retryable with correct dirty state, and unchanged saves avoid mutation.

Verification: snapshot/validation suites plus real-memory stale-save and retry cases; supported SQLite concurrency coverage at integration.

Completion evidence:

- Changed paths: `packages/mongoose-rxdb/src/document.ts` (leaf-level `changedLeafValues`/`collectLeafOps` replacing whole-top-level `changedStorageValues`; arrays atomic whole-array `$set`, plain-object leaves merge by dotted path, `DIRTY` exact-path opts subtree into intentional whole-object replacement with documented last-writer-wins policy; `save()` validates merged candidate via `validateObjectAgainstSchema(candidate, schema, candidate)` inside `incrementalModify` retry boundary when `validateBeforeSave` enabled, `validate`/`save` middleware still runs once outside retries). No `converter.ts` immutable changes (BMRX-09 coordination: save still routes through `normalizeUpdatePlan` immutable checks). No CHANGELOG.md update; no starter changes.
- Regressions: `packages/mongoose-rxdb/test/document-nested-save.test.ts` (new, 7 tests: disjoint nested edits survive; overlapping leaf last-writer-wins + array whole-replacement; explicit whole-object assignment overwrites subtree; stale `used<=limit` cross-field candidate rejected with bytes unchanged + retryable dirty state + retry succeeds; middleware once-per-save counts + `validateBeforeSave:false` skips final check; unchanged save avoids mutation; real-memory disjoint nested saves).
- Verification commands/results (run serially from repo root): `pnpm exec vitest run --config vitest.config.ts packages/mongoose-rxdb/test/document-nested-save.test.ts` → 1 file, 7 tests passed; `.../document-snapshot-dirty.test.ts .../validation-middleware.test.ts .../document-boundary.test.ts .../write-normalization.test.ts .../schema-behavior.test.ts` → 5 files, 39 tests passed; `.../core.test.ts .../mutation-options.test.ts .../query-read-semantics.test.ts .../adapter-contract.test.ts .../mutation-atomicity.test.ts` → 5 files, 42 tests passed; `pnpm exec tsc --noEmit -p packages/mongoose-rxdb/tsconfig.json` → clean; `pnpm exec eslint packages/mongoose-rxdb/src/document.ts packages/mongoose-rxdb/test/document-nested-save.test.ts` → clean.
- Docs changes: conflict/validation contract documented in `Document.save` JSDoc (leaf merge, array atomicity, intentional replacement triggers, same-leaf last-writer-wins, final-candidate validation context, once-per-save middleware, `validateBeforeSave:false` skip).
- BMRX-09 coordination: no immutable enforcement added/removed; leaf `$set`/`$unset` still validated by `normalizeUpdatePlan` so BMRX-09 can tighten without conflict.

### Task BMRX-09: Enforce Immutable Descendants On Every Existing-Record Write

Status: completed

Kind: defect

Priority: P1; plain and parent-object writes bypass the documented immutable boundary.

Suggested agent: write normalization specialist

Dependencies: BMRX-12 (NOT completed at implementation time — no `schema.ts` changes made; immutable enforcement reads but never mutates schema state, so BMRX-12 remains untouched)

Primary ownership: `packages/mongoose-rxdb/src/converter.ts:344-347,372,420-453`; write-normalization regressions; document save integration coordinated with BMRX-08 (already completed — no `document.ts` changes; save flows through the shared enforcement point unchanged).

Finding: plain updates call insert-permissive `documentToStorage`; `$set`/`$unset` on a parent only checks the parent path. Both can alter/remove immutable children, including through loaded-document save. Existing tests exercise only explicit top-level `$set` on an immutable path.

Requirements: separate insertion permission from existing-record modification and compare affected immutable descendants against current storage. Apply one consistent enforcement point to plain updates, operators, parent removal/replacement, and save, including subdocument arrays. Preserve initialization of immutable fields on inserts/upserts.

Acceptance criteria: direct, parent, plain-update, and document-save attempts cannot alter immutable values; rejected operations leave bytes unchanged. Valid sibling changes and initial immutable values still work; tests fail on the reviewed implementation.

Verification: write-normalization and mutation-option suites, document integration cases, shared package/type checks.

Completion evidence:

- Changed paths: `packages/mongoose-rxdb/src/converter.ts` (new exported `assertImmutablePreserved` before/after storage comparison as the single enforcement point, called at the end of `applyNormalizedUpdate` for both replacement and operator branches; recursive descent into `subSchema` single-nested objects; subdocument arrays compared element-wise with overlapping-index equality, appended elements allowed as new-subdocument initialization, removed elements rejected when they carried a defined immutable value; `normalizeUpdatePlan` gained `{ allowImmutable }` so direct-path normalization still rejects before adapter contact for non-upsert writes while upsert writes defer to the storage-aware check; `normalizeReplacementUpdate` validates top-level keys against the same flag; `documentToStorage` left insert-permissive); `packages/mongoose-rxdb/src/query.ts` (passes `allowImmutable: upsert === true` in `runUpdate`/`runFindOneAndUpdate`; `insertUpsert` constructs the new record via `applyNormalizedUpdate(..., { skipImmutableCheck: true })` so upsert-insert initialization of immutable fields works while the update attempt on an existing record still enforces); `packages/mongoose-rxdb/test/immutable-descendants.test.ts` (new, 6 regressions). No `document.ts` changes (BMRX-08 coordination: save leaf `$set`/`$unset` and intentional whole-object replacement both route through `normalizeUpdatePlan` + `applyNormalizedUpdate`, so save is covered without edits). No `schema.ts` changes (BMRX-12 untouched). No CHANGELOG.md update; no starter changes.
- Regressions: `rejects direct top-level and nested immutable $set with bytes unchanged`; `rejects parent $set/$unset that alter or remove immutable children, but allows sibling changes`; `rejects plain (replacement-style) updates that change immutable values with bytes unchanged` (plus sibling plain-update success); `rejects loaded-document saves that change immutable values and keeps saves retryable for siblings` (direct/nested/parent-replacement save rejections, sibling save succeeds); `enforces immutable descendants inside subdocument arrays while allowing sibling edits and appends` (whole-array `$set` with changed code rejected, truncation removing immutable rejected, same-code sibling edit succeeds, `$push` of a new subdocument with fresh immutable succeeds); `preserves immutable initialization on inserts and upsert-inserts while rejecting upsert-updates` (Document insert, `findOneAndUpdate` upsert-insert with immutable, upsert-update on existing record rejected with bytes unchanged).
- Fail-before evidence: new test file against pre-fix sources (via `git stash` of `converter.ts`/`query.ts` only) → 5 failed / 1 passed; post-fix → 6 passed.
- Verification commands/results (run serially from repo root): `pnpm exec vitest run --config vitest.config.ts packages/mongoose-rxdb/test/immutable-descendants.test.ts …/write-normalization.test.ts …/mutation-options.test.ts …/document-snapshot-dirty.test.ts …/document-nested-save.test.ts …/validation-middleware.test.ts …/schema-behavior.test.ts` → 7 files, 49 tests passed; `…/core.test.ts …/adapter-contract.test.ts …/mutation-atomicity.test.ts …/query-read-semantics.test.ts …/document-boundary.test.ts` → 5 files, 45 tests passed; `pnpm exec tsc --noEmit -p packages/mongoose-rxdb/tsconfig.json` → clean; `pnpm exec eslint packages/mongoose-rxdb/src/converter.ts packages/mongoose-rxdb/src/query.ts packages/mongoose-rxdb/test/immutable-descendants.test.ts` → clean.
- Docs changes: enforcement contract documented in `assertImmutablePreserved` JSDoc (insertion vs modification separation, parent/plain/save coverage, subdocument-array append-vs-remove policy); README/types reconciliation deferred to BMRX-24 per task ordering.

### Task BMRX-10: Define Safe Array Update Paths And Value Equality

Status: completed

Kind: defect

Priority: P1; accepted dotted paths can replace an array with an object.

Suggested agent: structured update specialist

Dependencies: BMRX-09

Primary ownership: `packages/mongoose-rxdb/src/converter.ts:275-292,445-453,505-513`; array normalization tests.

Finding: a subdocument array permits `items.n`, then `setDottedValue` replaces the array with `{ n: 3 }`; numeric `items.0.n` is rejected. Separately, `$addToSet`/`$pull` use `Object.is`, so independently cloned equal objects duplicate or never remove. Existing operator tests use scalar arrays and dotted single objects.

Requirements: reject ambiguous array traversal unless explicit indexed semantics are implemented; never implicitly convert the container type. Define equality over supported normalized array elements, or reject unsupported object operands explicitly. Do not silently add positional/Mongoose predicate operators.

Acceptance criteria: set/unset/arithmetic cannot turn arrays into objects. Indexed and non-indexed paths have tested outcomes. Repeated object/subdocument `$addToSet` does not duplicate equal values, and supported `$pull` removes equal values; nested objects and Date elements follow the documented policy.

Verification: write-normalization suite with real adapter round trips, shared package/type checks.

Completion evidence:

- Changed paths: `packages/mongoose-rxdb/src/converter.ts` (array-aware `resolveArrayTraversal` requiring canonical indexes — ambiguous `items.n` rejected, indexed `items.0.n`/`tags.0` supported with element-type casting; container-preserving `setDottedValue`/`getDottedValue`/`unsetDottedValue` that throw on array/object conversion, non-object traversal, and out-of-bounds indexed `$set`; `$unset` on bare array indexes rejected with `$pull` guidance; `$addToSet`/`$pull` equality via `storageDeepEqual` over normalized elements — Dates by ISO string, nested objects structurally; `arrayItemToStorage` rejects object/array operands on primitive scalar arrays and array operands on subdocs; `assertNoArrayOperatorForm` rejects `$`-prefixed operator/predicate forms; no positional/`$elemMatch` operators added); `packages/mongoose-rxdb/test/array-update-boundary.test.ts` (new, 7 regressions). No CHANGELOG.md update; no starter changes.
- Regressions: `rejects ambiguous non-indexed traversal and never converts arrays to objects` (`items.n`/`tags.value` `$set`/`$unset`/`$inc` rejected, bytes unchanged, arrays stay arrays); `supports indexed set, unset of subfields, and arithmetic on elements` (`items.0.n` `$set`/`$inc`, `tags.0` `$set`, `items.0.nested.v` `$unset`); `handles whole-array unset, rejects bare-index unset, and rejects out-of-bounds indexed set`; `deduplicates equal objects on repeated $addToSet including nested objects and dates`; `removes equal values with $pull for objects, nested objects, and dates`; `rejects operator forms and object operands on scalar arrays` (`$each`, `{foo:1}`, array operand); `round-trips indexed updates and set-equality through real memory storage` (ambiguous rejected on real store, indexed set + repeated `$addToSet` dedup + `$pull` verified via `Connection`/`createMemoryDatabase`).
- Fail-before evidence: new test file against pre-fix sources (via `git stash` of `converter.ts` only) → 6 failed / 1 passed; post-fix → 7 passed.
- Verification commands/results (run serially from repo root): `pnpm exec vitest run --config vitest.config.ts packages/mongoose-rxdb/test/array-update-boundary.test.ts packages/mongoose-rxdb/test/write-normalization.test.ts packages/mongoose-rxdb/test/immutable-descendants.test.ts packages/mongoose-rxdb/test/document-snapshot-dirty.test.ts packages/mongoose-rxdb/test/document-nested-save.test.ts packages/mongoose-rxdb/test/validation-middleware.test.ts packages/mongoose-rxdb/test/schema-behavior.test.ts` → 7 files, 51 tests passed; `…/core.test.ts …/mutation-options.test.ts …/query-read-semantics.test.ts …/adapter-contract.test.ts …/mutation-atomicity.test.ts` → 5 files, 42 tests passed; `pnpm exec tsc --noEmit -p packages/mongoose-rxdb/tsconfig.json` → clean; `pnpm exec eslint packages/mongoose-rxdb/src/converter.ts packages/mongoose-rxdb/test/array-update-boundary.test.ts` → clean.
- Docs changes: array path/equality contract documented in `resolveArrayTraversal`/`arrayItemToStorage`/`setDottedValue` JSDoc (indexed semantics, bare-index `$unset` → `$pull`, equality policy, no positional/predicate operators); README/types reconciliation deferred to BMRX-24 per task ordering.

### Task BMRX-11: Reject Non-JSON Storage Values And Arithmetic Overflow

Status: completed

Kind: defect

Priority: P1; normalization accepts values storage cannot faithfully preserve.

Suggested agent: storage serialization specialist

Dependencies: BMRX-10

Primary ownership: `packages/mongoose-rxdb/src/converter.ts:209-215,254-258,297,535-540`; normalization tests.

Finding: finite arithmetic operands can produce `Infinity`; mixed-value cloning accepts functions, symbols, bigint, and non-finite numbers as scalar values. Probes confirmed overflow and unsupported mixed values passed normalization. Backend serialization may reject late or change/drop values. Existing invalid-operand tests do not cover normalized-result validity.

Requirements: validate arithmetic results and the recursive supported storage domain before commit. Specify undefined, Date-in-mixed, cyclic, and excessive-depth behavior; do not rely on JSON stringify to silently sanitize. Bound recursive validation without accidentally rejecting valid documented data.

Acceptance criteria: overflow and unsupported root/nested/array values fail with a package-owned error before stored data changes. Accepted values round-trip consistently through fake and real adapters. Tests distinguish schema casts from unsupported mixed values.

Verification: normalization/adapter-contract suites and shared package/type checks.

Completion evidence:

- Changed paths: `packages/mongoose-rxdb/src/converter.ts` (new exported `MAX_STORAGE_DEPTH` 50 / `MAX_STORAGE_NODES` 2000 with BMRX-11 storage-domain JSDoc; rewritten `cloneSafePlain` with ancestor-set cycle detection, depth/node bounds, and explicit primitive validation — `undefined`/function/symbol/bigint/non-finite rejected with `WriteNormalizationError`, `Date` normalized to ISO, non-plain objects rejected; `valueToStorage` now throws on `undefined` instead of passing it through, with top-level `undefined` treated as absent in `documentToStorage`/`existingStorageToWritableRecord`; `$inc`/`$mul` in `applyNormalizedUpdate` validate current-value finiteness and reject non-finite results as overflow; string/number casts wrapped so symbol/function inputs throw `WriteNormalizationError` instead of native `TypeError`); `packages/mongoose-rxdb/test/storage-value-boundary.test.ts` (new, 6 regressions). No CHANGELOG.md update; no starter changes.
- Regressions: `rejects $inc/$mul overflow before stored data changes` (MAX_VALUE seed, `$inc`/`$mul` MAX_VALUE → `WriteNormalizationError`, bytes unchanged; finite inc/mul still work); `rejects unsupported root, nested, and array mixed values` (function/symbol/bigint/Infinity/nested-undefined/deep-function/symbol-array/`$push` bigint/`$addToSet` function rejected, bytes unchanged, plain control accepted); `rejects cyclic and excessively deep mixed values without hanging` (query-builder cycles/depth surface as builder-budget errors, direct `normalizeUpdatePlan` proves converter-owned `WriteNormalizationError`, boundary depth accepted); `treats top-level undefined as absent but rejects nested undefined, and normalizes Date-in-mixed to ISO` (`documentToStorage` omits top-level `undefined`, nested `undefined` rejected, `Date` → ISO string); `distinguishes schema casts from unsupported mixed values` (number→string cast succeeds, mixed function rejected); `round-trips accepted values consistently through fake and real adapters` (nested plain/array/null/Date→ISO verified on fake snapshot and real `createMemoryDatabase`, plus real overflow and mixed-function rejections with data unchanged).
- Fail-before evidence: new test file against pre-fix sources (via `git stash` of `converter.ts` only) → 6 failed / 0 passed; post-fix → 6 passed.
- Verification commands/results (run serially from repo root): `pnpm exec vitest run --config vitest.config.ts packages/mongoose-rxdb/test/storage-value-boundary.test.ts …/write-normalization.test.ts …/immutable-descendants.test.ts …/array-update-boundary.test.ts …/document-snapshot-dirty.test.ts …/document-nested-save.test.ts …/validation-middleware.test.ts …/schema-behavior.test.ts` → 8 files, 57 tests passed; `…/core.test.ts …/mutation-options.test.ts …/query-read-semantics.test.ts …/adapter-contract.test.ts …/mutation-atomicity.test.ts` → 5 files, 42 tests passed; `pnpm exec tsc --noEmit -p packages/mongoose-rxdb/tsconfig.json` → clean; `pnpm exec eslint packages/mongoose-rxdb/src/converter.ts packages/mongoose-rxdb/test/storage-value-boundary.test.ts` → clean.
- Docs changes: storage-domain/undefined/Date/cyclic/depth contract documented in `MAX_STORAGE_DEPTH`/`MAX_STORAGE_NODES`/`cloneSafePlain` JSDoc (top-level `undefined` absent, nested rejected, `Date`-in-mixed → ISO, cyclic/depth rejection, no `JSON.stringify` silent sanitization); README/types reconciliation deferred to BMRX-24 per task ordering.

### Task BMRX-12: Make The Exposed Compiled Schema Genuinely Immutable

Status: completed

Kind: defect

Priority: P1; mutable model schema paths can bypass validation and diverge from storage schema.

Suggested agent: schema encapsulation specialist

Dependencies: none

Primary ownership: `packages/mongoose-rxdb/src/schema.ts:207-217,300-317,463-467`; `test/schema-behavior.test.ts`; coordinate exposed model typing only.

Finding: freezing a Map neither prevents `set/delete` nor freezes its entries. A compiled `path('n').type = 'string'` changed casting to string while generated RxDB schema still said number. `Model.schema` exposes this snapshot (`model.ts:373`). Historical isolation tests mutate the original schema, not the compiled exposed one.

Requirements: use one authoritative immutable structural representation, including path options and child schemas. Exposed maps/accessors must not permit structural mutation to affect runtime behavior; avoid a misleading `ReadonlyMap` type over a still-shared writable Map. Preserve intended nonstructural method/hook behavior explicitly.

Acceptance criteria: attempts through `Model.schema`, `path()`, map mutators, nested schemas, and options either reject or have no model effect. Casting, required/immutable validation, public JSON Schema, and RxDB schema stay consistent. Schema clones remain independently editable where supported.

Verification: schema-behavior suite and emitted declaration checks after build.

Completion evidence:

- Changed paths: `packages/mongoose-rxdb/src/schema.ts` (`compileForModel` now builds/caches compiled representations for source and snapshot then applies `freezeStructuralSchema` to both; new `freezeStructuralSchema`/`freezeCompiledPath`/`freezeMapMutators`/`lockSchemaProperty` helpers freeze path entries, path/array-item options and enum arrays, schema options, definition top level, child schemas/subSchemas recursively, virtual entries, and the cached compiled payload; `paths`/`virtuals` map `set`/`delete`/`clear` replaced with throwing `SchemaConfigurationError` stubs and structural instance properties made non-writable/non-configurable so `schema.paths = ...` reassignment also rejects; methods/statics/pre/post hooks/queryHelpers intentionally left mutable as documented nonstructural behavior; `deepFreeze` updated to skip live `Schema` instances and live path maps so it cannot make maps non-extensible before throwing mutators are installed nor freeze hook/method behavior, while still freezing plain compiled JSON payloads; `RegExp`/`Date` values never frozen); `packages/mongoose-rxdb/test/schema-behavior.test.ts` (updated snapshot test to expect `SchemaConfigurationError` on direct `paths.set` for source and `Model.schema`; two new BMRX-12 regressions). No CHANGELOG.md update; no `create-access-router-mongo-starter` changes.
- Regressions: `BMRX-12 rejects exposed compiled-schema structural mutation without model effect` (map `set`/`delete`/`clear` and `add()` reject; `path().type`/`path().options`/`schema.options`/property-reassignment throw; nested `subSchema` map/option mutations reject; `getCompiledSchema().paths.set`/`jsonSchema`/`required.push` reject; `toJSONSchema()` defensive copy verified; number casting, required `ValidationError`, immutable `$set` rejection, public JSON Schema and RxDB schema consistency verified); `BMRX-12 keeps compiled clones independently editable and preserves hooks` (`Model.schema.clone()` accepts `add()`/option edits without affecting the model; instance method and `pre('save')` hook still run on the compiled model).
- Fail-before evidence: new/updated tests against pre-fix sources (via `git stash` of `schema.ts` only) → 2 failed / 5 passed; post-fix → 7 passed.
- Verification commands/results (run serially from repo root): `pnpm --filter @web-ts-toolkit/mongoose-rxdb build` → success (CJS/ESM/DTS); `pnpm exec vitest run --config vitest.config.ts packages/mongoose-rxdb/test/schema-behavior.test.ts packages/mongoose-rxdb/test/write-normalization.test.ts packages/mongoose-rxdb/test/document-snapshot-dirty.test.ts packages/mongoose-rxdb/test/validation-middleware.test.ts packages/mongoose-rxdb/test/core.test.ts` → 5 files, 54 tests passed; `pnpm exec tsc --noEmit -p packages/mongoose-rxdb/tsconfig.json` → clean; `pnpm exec eslint packages/mongoose-rxdb/src/schema.ts packages/mongoose-rxdb/test/schema-behavior.test.ts` → clean; `pnpm exec tsc --noEmit -p packages/mongoose-rxdb/test-decl-consumer/tsconfig-nodenext.json` → clean; `pnpm exec tsc --noEmit -p packages/mongoose-rxdb/test-decl-consumer/tsconfig-bundler.json` → clean; emitted `dist/index.d.ts` check → `CompiledSchemaRepresentation.paths` remains `ReadonlyMap` (now truthful: underlying map mutators throw and entries are frozen) with no `Schema.paths` type change.
- Docs changes: structural vs nonstructural contract documented in `compileForModel`/`freezeStructuralSchema`/`deepFreeze` JSDoc (frozen structure list, throwing-map rationale, methods/hooks preserved); README/types reconciliation deferred to BMRX-24 per task ordering.

### Task BMRX-13: Preserve Default Values And Recursive Default Policy

Status: completed

Kind: defect

Priority: P1; schema compilation breaks Date defaults and nested hydration restores excluded/default-disabled data.

Suggested agent: schema/default normalization specialist

Dependencies: BMRX-12, BMRX-11

Primary ownership: `packages/mongoose-rxdb/src/schema.ts:440-458`; `src/converter.ts:136-148,320,337,372,382`; default/projection tests.

Finding: schema cloning turns literal Date defaults into `{}`, making compiled models fail normalization. `applyDefaults: false` is not propagated recursively through nested casts/conversion, so child defaults reappear in loaded/projected documents. Existing clone/default tests omit literal dates and nested default opt-outs.

Requirements: clone supported mutable defaults accurately and carry default policy through nested schemas and arrays. Preserve insertion defaults while respecting projection and explicit `setDefaultsOnInsert` behavior.

Acceptance criteria: literal dates survive clone/model compilation and round-trip. Default-disabled nested objects/subdocument arrays remain without absent fields through hydration, projections, and upsert normalization; enabled defaults still apply as documented.

Verification: schema, query-read, normalization, and mutation-option focused cases; shared package/type checks.

Completion evidence:

- Changed paths: `packages/mongoose-rxdb/src/schema.ts` (`cloneDefinition`/`clonePlain` now preserve `Date` via `new Date(getTime())` before generic object cloning, so literal Date defaults survive `Schema.clone()`/`compileForModel` independently); `packages/mongoose-rxdb/src/converter.ts` (`castDocumentToSchema`/`castValue` carry `{applyDefaults}` recursively into subSchema/array items and clone non-function defaults via `cloneValue`; `valueToStorage`/`arrayItemToStorage` carry the parent `applyDefaults` flag into nested `documentToStorage` instead of hardcoded `true`; operator normalization (`$set`/`$min`/`$max`/`$push`/`$addToSet`/`$pull`) uses `applyDefaults:false` so updates do not bake in nested defaults — upsert inserts re-apply them only via final `documentToStorage(..., {applyDefaults: setDefaultsOnInsert===true})`; `existingStorageToWritableRecord` now inherits the no-defaults read path); `packages/mongoose-rxdb/src/model.ts` (`findById` hydration now passes `applyDefaults:false` like `Query.hydrate`); `packages/mongoose-rxdb/test/default-recursion-boundary.test.ts` (new, 7 regressions). No CHANGELOG.md update; no starter changes.
- Regressions: `preserves literal Date defaults through clone and model compilation` (instance check, time equality, independence from source); `round-trips literal Date defaults through real memory storage` (create + findById); `does not reapply nested defaults when applyDefaults is false` (cast + storage); `still applies nested defaults when applyDefaults is enabled`; `keeps default-disabled subdocument arrays without absent fields through hydration`; `respects projection exclusion through hydration` (real-memory include-projection, no default resurrection); `respects setDefaultsOnInsert for nested defaults on upsert` (off omits top+nested, on fills both).
- Fail-before evidence: new test file against pre-fix sources (via `git stash` of `schema.ts`/`converter.ts`/`model.ts`) → 6 failed / 1 passed; post-fix → 7 passed.
- Verification commands/results (run serially from repo root): `pnpm exec vitest run --config vitest.config.ts packages/mongoose-rxdb/test/default-recursion-boundary.test.ts …/write-normalization.test.ts …/schema-behavior.test.ts …/document-snapshot-dirty.test.ts …/validation-middleware.test.ts` → 5 files, 40 tests passed; `…/core.test.ts …/mutation-options.test.ts …/query-read-semantics.test.ts …/adapter-contract.test.ts` → 4 files, 34 tests passed; `pnpm exec tsc --noEmit -p packages/mongoose-rxdb/tsconfig.json` → clean; `pnpm exec eslint packages/mongoose-rxdb/src/schema.ts packages/mongoose-rxdb/src/converter.ts packages/mongoose-rxdb/src/model.ts packages/mongoose-rxdb/test/default-recursion-boundary.test.ts` → clean.
- Docs changes: none (behavioral contract captured in code/JSDoc-adjacent comments and this evidence; README/types reconciliation deferred to BMRX-24 per task ordering).

### Task BMRX-14: Reconcile Accepted Nested Schema Forms And Required Metadata

Status: completed

Kind: defect

Priority: P2; accepted definitions have contradictory casting, validation, and generated-schema meanings.

Suggested agent: schema contract specialist

Dependencies: BMRX-13

Primary ownership: `packages/mongoose-rxdb/src/schema.ts:107-112,294-310,346-354,379-382`; `src/converter.ts:122-125,164-168`; focused schema tests.

Finding: inline nested definitions become unstructured objects, bypassing child casts/required checks; prefixed `schema.add(..., 'profile')` generates literal dotted fields while validation reads nested paths. Function-valued `required` is emitted as unconditional JSON Schema required despite document validation allowing absence when false. Tests use explicit child Schema instances, unprefixed add, and generated boolean requirements.

Requirements: support each retained syntax consistently or reject it early with `SchemaConfigurationError`; do not introduce full Mongoose nested syntax by accident. Do not encode dynamic required functions as unconditional storage requirements. Update types, docs, and release notes for any rejected formerly accepted form.

Acceptance criteria: retained forms agree across schema output, casting, validation, hydration, and updates; unsupported forms fail before collection creation. Conditional-required true/false cases at root and nested levels agree with both public and RxDB schema constraints.

Verification: schema/validation tests, strict consumer examples, shared package/type checks.

Completion evidence:

- Changed paths: `packages/mongoose-rxdb/src/schema.ts` (`Schema.add` rejects any non-empty prefix with `SchemaConfigurationError`; constructor and `add` reject dotted/empty path names via `assertValidPathName`; `compilePath` rejects inline nested plain objects and `detectType` rejects plain objects in `type` position via `isInlineNestedDefinition`, so `{ profile: { name: String } }`, `{ profile: { type: { name: String } } }`, `[{ name: String }]`, and `{'profile.name': String}` fail at schema construction before collection creation; `isPathRequired` no longer emits function-valued `required` (including `[fn, message]`) as static `required`; no full Mongoose nested syntax introduced — retained forms remain explicit child `Schema` (`{ profile: childSchema }`, `{ profile: { type: childSchema } }`, `[childSchema]`) and explicit mixed (`{ type: Object }`)); `packages/mongoose-rxdb/src/converter.ts` (mirrored static `isPathRequired` so RxDB `required` omits dynamic requirements); `packages/mongoose-rxdb/src/document.ts` (`requiredMissing` now evaluates `[fn, message]` dynamically instead of treating any function element as unconditionally required); `packages/mongoose-rxdb/src/types.ts` (`SchemaTypeOptions.required` tuple widened to `[boolean | ((this: any) => boolean), string]` with dynamic-required JSDoc; `SchemaDefinition` documented with the rejected nested/prefix contract); `packages/mongoose-rxdb/README.md` and `website/docs/packages/mongoose-rxdb.md` (rejected nested/prefix forms and dynamic-required static-schema omission documented). No CHANGELOG.md update; no `create-access-router-mongo-starter` changes.
- Regressions: `packages/mongoose-rxdb/test/nested-schema-required-boundary.test.ts` (new, 6 tests: inline-nested/`type`-position/array-nested/dotted-key rejection; prefixed-`add` rejection with unprefixed `add` still working; explicit child Schema agreement across public JSON Schema, RxDB schema, casting, validation, and storage conversion; real-memory hydration plus `child.label` dotted update with child-required enforcement; dynamic function-required omission from both static schemas with validation deciding true/false at root and nested levels plus `[fn, message]` and static boolean/tuple controls; real-memory conditional-required persistence).
- Fail-before evidence: new test file against pre-fix sources (via `git stash` of `schema.ts`/`converter.ts`/`document.ts`/`types.ts` only) → 3 failed / 3 passed; post-fix → 6 passed.
- Verification commands/results (run serially from repo root): `pnpm exec vitest run --config vitest.config.ts packages/mongoose-rxdb/test/nested-schema-required-boundary.test.ts …/schema-behavior.test.ts …/write-normalization.test.ts …/validation-middleware.test.ts` → 4 files, 34 tests passed; `…/core.test.ts …/mutation-options.test.ts …/query-read-semantics.test.ts …/adapter-contract.test.ts …/document-snapshot-dirty.test.ts …/document-nested-save.test.ts …/immutable-descendants.test.ts …/array-update-boundary.test.ts` → 8 files, 59 tests passed; `pnpm exec tsc --noEmit -p packages/mongoose-rxdb/tsconfig.json` → clean; `pnpm exec tsc --noEmit -p packages/mongoose-rxdb/test-decl-consumer/tsconfig-nodenext.json` → clean; `pnpm exec tsc --noEmit -p packages/mongoose-rxdb/test-decl-consumer/tsconfig-bundler.json` → clean; `pnpm exec eslint packages/mongoose-rxdb/src/schema.ts packages/mongoose-rxdb/src/converter.ts packages/mongoose-rxdb/src/document.ts packages/mongoose-rxdb/src/types.ts packages/mongoose-rxdb/test/nested-schema-required-boundary.test.ts` → clean.
- Docs changes: `README.md` Schema Contract section and website `Schema` section record the rejected formerly accepted forms (inline nested, dotted names, prefixed `add`) with the explicit-child-Schema migration and the dynamic-required static-schema omission; release-note impact recorded here (behavioral narrowing: previously accepted inline-nested/prefix definitions now throw `SchemaConfigurationError`; function-required paths no longer appear in static `required`); full consumer-contract reconciliation remains with BMRX-24 per task ordering.

### Task BMRX-15: Make Validation Repeatable And Promise-Safe

Status: completed

Kind: defect

Priority: P1; synchronous validation can emit unhandled rejections and terminate Node.

Suggested agent: validation runtime specialist

Dependencies: BMRX-08, BMRX-14

Primary ownership: `packages/mongoose-rxdb/src/document.ts:373-374,405-418`; `test/validation-middleware.test.ts`.

Finding: `validateSync()` invokes an async validator, detects its promise, and abandons a rejection; an async throw produced `unhandledRejection`. Existing test uses a fulfilled false promise. Shared `/g` or `/y` `match` regexes mutate `lastIndex`, so repeated validation of unchanged data alternates success/failure.

Requirements: keep validateSync synchronous and its documented async-validator error without abandoning returned promises. Make match checks independent of prior `lastIndex`, or reject stateful flags explicitly. Keep sync and async validation rules aligned without duplicating new semantic branches unnecessarily.

Acceptance criteria: rejecting async and promise-returning non-async validators cause a controlled synchronous error and normal subprocess exit without unhandled rejection. Repeated sync/async validation of multiple documents sharing global/sticky regex schemas is deterministic.

Verification: validation suite and isolated process rejection regression; shared package/type checks.

Completion evidence:

- Changed paths: `packages/mongoose-rxdb/src/document.ts` (new shared `testMatchPattern` cloning the schema regex per check so `/g`/`/y` evaluate from index 0 without mutating shared `lastIndex`, used by both `validateValue` and `validateValueSync`; `validateValueSync` keeps its synchronous documented async-validator `ValidationError` but now attaches a no-op rejection handler to any promise-like validator result so rejecting async and promise-returning sync validators are marked handled); `packages/mongoose-rxdb/test/validation-middleware.test.ts` (new `BMRX-15 repeatable promise-safe validation` block, 3 regressions). No CHANGELOG.md update; no starter changes.
- Regressions: `returns a controlled sync error for rejecting async validators without unhandled rejection` (async-throw plus non-async promise-reject validators yield `ValidationError` with async-validator message and zero `unhandledRejection` after 50ms); `exits normally in an isolated process for rejecting async validators` (child `node -e` against rebuilt `dist/index.js` with `unhandledRejection` → exit 3 guard exits 0 after 100ms settle); `repeats sync and async validation deterministically for shared global/sticky regexes` (10 alternating sync/async good/bad doc checks plus polluted `lastIndex = 2` still deterministic).
- Fail-before evidence: new tests against pre-fix sources (via `git stash` of `document.ts` only; dist still post-fix so subprocess passed) → 2 failed / 1 passed (unhandled array non-empty for rejection test; good-doc async validation rejected with match error on second iteration); post-fix → 3 passed.
- Verification commands/results (run serially from repo root): `pnpm --filter @web-ts-toolkit/mongoose-rxdb build` → success; `pnpm exec vitest run --config vitest.config.ts packages/mongoose-rxdb/test/validation-middleware.test.ts` → 1 file, 20 tests passed; `.../validation-middleware.test.ts .../document-snapshot-dirty.test.ts .../write-normalization.test.ts .../schema-behavior.test.ts .../document-nested-save.test.ts` → 5 files, 43 tests passed; `.../core.test.ts .../mutation-options.test.ts .../query-read-semantics.test.ts .../adapter-contract.test.ts .../mutation-atomicity.test.ts` → 5 files, 42 tests passed; `pnpm exec tsc --noEmit -p packages/mongoose-rxdb/tsconfig.json` → clean; `.../test-decl-consumer/tsconfig-nodenext.json` → clean; `.../test-decl-consumer/tsconfig-bundler.json` → clean; `pnpm exec eslint packages/mongoose-rxdb/src/document.ts packages/mongoose-rxdb/test/validation-middleware.test.ts` → clean.
- Docs changes: contract documented in `testMatchPattern` and `validateValueSync` comments (stateless match from index 0 preserving sticky anchoring, frozen-pattern safe; sync stays synchronous with handled-promise guarantee); README/types reconciliation deferred to BMRX-24 per task ordering.

### Task BMRX-16: Track Error Middleware Completion Per Operation

Status: completed

Kind: defect

Priority: P2; error hooks can run twice or accidentally replace original failures.

Suggested agent: middleware control-flow specialist

Dependencies: BMRX-15

Primary ownership: `packages/mongoose-rxdb/src/middleware.ts:65-70`; `src/document.ts:179-187`; middleware matrix tests.

Finding: error handling marks the caller's thrown value. A throwing error hook runs again in the outer save catch; frozen Errors and primitive throws can be replaced by marker-related TypeErrors; reusing one Error can suppress handling in a later operation. Existing tests use fresh extensible Errors and nonthrowing handlers.

Requirements: use operation-local completion control rather than mutation of external errors. Define propagation when error middleware itself fails and preserve original cause/context where appropriate. Apply consistent behavior to document and query routes without an unrelated middleware API redesign.

Acceptance criteria: frozen Errors, primitive throws, reused Errors, and throwing error hooks follow the documented propagation policy; hooks run at most once per operation. Existing callback/promise first-settlement behavior remains tested.

Verification: validation/middleware suite with cross-path error cases and shared package/type checks.

Completion evidence:

- Changed paths: `packages/mongoose-rxdb/src/middleware.ts` (removed `__mongooseRxdb<method>PostErrorHandled` mutation; `exec()` runs error hooks exactly once per invocation via a local try/catch with no thrown-value marking; `runPostError` accepts `unknown` and passes frozen/primitive values through untouched; new exported `preserveErrorCause` attaches the original as `cause` on extensible hook failures only, rethrowing frozen/sealed hook errors unchanged; policy documented in `runPostError` JSDoc; no `invokeSyncOrPromise` first-settlement change); `packages/mongoose-rxdb/src/document.ts` (`save()` uses a per-call `saveErrorHandled` local instead of error markers: inner `exec('save')` failures are already handled so the outer catch only runs `save` error hooks for pre-exec failures such as `validate()`; throwing outer hooks supersede via `preserveErrorCause`; `remove`/`deleteOne`/`validate` already single-`exec` and unchanged); `packages/mongoose-rxdb/test/middleware-error-completion.test.ts` (new, 8 regressions). No CHANGELOG.md update; no starter changes.
- Regressions: `runs save error hooks once for frozen errors without replacing the original` (frozen pre-save error propagates by identity, hook once, no marker); `runs query error hooks once for primitive throws without a second run`; `runs save error hooks once per operation for primitive throws (no outer rerun)`; `does not suppress handling when one Error instance is reused across operations` (shared Error triggers hooks on both saves, no marker); `runs throwing error hooks at most once and propagates the hook failure with cause` (document save: second hook skipped, outer catch not rerun, `cause` is original); `propagates throwing query error hooks once with the original as cause`; `runs save error hooks once for validate failures (pre-save never runs)`; `runs error middleware directly without mutating frozen errors` (direct `runPostError` + repeated `exec` each run hooks).
- Fail-before evidence: new test file against pre-fix sources (via `git stash` of `middleware.ts`/`document.ts` only) → 6 failed / 2 passed; post-fix → 8 passed.
- Verification commands/results (run serially from repo root): `pnpm exec vitest run --config vitest.config.ts packages/mongoose-rxdb/test/middleware-error-completion.test.ts packages/mongoose-rxdb/test/validation-middleware.test.ts packages/mongoose-rxdb/test/document-snapshot-dirty.test.ts packages/mongoose-rxdb/test/document-nested-save.test.ts packages/mongoose-rxdb/test/write-normalization.test.ts` → 5 files, 44 tests passed; `…/core.test.ts …/mutation-options.test.ts …/query-read-semantics.test.ts …/adapter-contract.test.ts …/mutation-atomicity.test.ts` → 5 files, 42 tests passed; `pnpm exec tsc --noEmit -p packages/mongoose-rxdb/tsconfig.json` → clean; `pnpm exec eslint packages/mongoose-rxdb/src/middleware.ts packages/mongoose-rxdb/src/document.ts packages/mongoose-rxdb/test/middleware-error-completion.test.ts` → clean. Existing callback/promise first-settlement test (`settles once when callback middleware also returns a promise` in `validation-middleware.test.ts`) remains green.
- Docs changes: propagation/completion contract documented in `runPostError`/`preserveErrorCause`/`Document.save` comments (at-most-once per operation, hook-failure supersede with best-effort `cause`, frozen/primitive/reuse safety); README/types reconciliation deferred to BMRX-24 per task ordering.

### Task BMRX-17: Close Connection State-Machine Race And Recovery Gaps

Status: completed

Kind: defect

Priority: P1; queued reconnects open multiple databases and failed close permanently wedges state.

Suggested agent: asynchronous lifecycle specialist

Dependencies: none

Primary ownership: `packages/mongoose-rxdb/src/model.ts:149-179,199-216`; lifecycle tests.

Finding: concurrent connects waiting behind `disconnectPromise` resume without rechecking ownership and invoke two factories; one attempt can clear another's promise. Rejected close clears `db`, leaves state `closing`, and retains a permanently rejected disconnect promise, preventing retry/reconnect. Existing single-flight tests do not queue connects behind close or fail close.

Requirements: reestablish single-flight ownership after awaits and let only the owning attempt clear bookkeeping. Define a recoverable/terminal failed-close policy retaining enough ownership to avoid abandoning a possibly open database. Do not label failure as successfully disconnected.

Acceptance criteria: gated close plus multiple queued connects yields one factory/outcome; reversed factory completion cannot corrupt state. Close failure preserves its cause and follows a tested subsequent disconnect/connect policy, with no permanently misleading closing state or silently leaked database.

Verification: deterministic lifecycle barriers, failure/recovery cases, shared package/type checks.

Completion evidence:

- Changed paths: `packages/mongoose-rxdb/src/model.ts` (`connect()` gates queued connects behind an in-progress close in a re-check loop, so concurrent waiters join one `connectPromise` instead of each invoking the factory; close failure propagates to queued connects without opening a second database; both `connectPromise` and `disconnectPromise` are cleared only by the owning attempt via identity check, so a stale/superseded factory completion cannot clear a newer attempt's bookkeeping; `disconnect()` captures the pending connect before bumping generation, retains the database reference across a failed `closeDatabase` instead of abandoning it with `db = null`, restores state to `connected` when a database remains — never labelling failure as `disconnected` — clears `disconnectPromise` on both success and failure so retries are possible while joiners keep their rejection with the original cause); `packages/mongoose-rxdb/test/connection-close-recovery.test.ts` (new, 4 regressions). No CHANGELOG.md update; no `create-access-router-mongo-starter` changes.
- Regressions: `gated close plus queued connects yields one factory and one outcome` (close gate holds `disconnect()` in `closing`, two queued `connect()` calls invoke the factory 0 times until the gate opens, then exactly once with both resolving to the new database); `reversed factory completion cannot corrupt state` (slow factory superseded by disconnect + queued fast connect: slow completes with `closed while opening`, its database is closed, final state is `connected` to the fast database); `close failure preserves cause and allows retry without leaking the database` (first `disconnect()` rejects with the exact close cause, state returns to `connected` with `db` retained and `disconnectPromise` cleared; `connect()` while still open throws `already connected`; retry `disconnect()` succeeds, closes the retained database a second time, then a fresh `connect()` works); `queued connects behind a failed close receive the close cause without opening a factory` (two queued connects reject with the close cause, factory never called, state `connected` with `db` retained).
- Fail-before evidence: new test file against pre-fix sources (via `git stash` of `model.ts` only) → 3 failed / 1 passed; post-fix → 4 passed.
- Verification commands/results (run serially from repo root): `pnpm exec vitest run …/connection-close-recovery.test.ts …/collection-init-harness.test.ts …/core.test.ts …/adapter-contract.test.ts` → 4 files, 37 tests passed; `pnpm exec tsc --noEmit -p packages/mongoose-rxdb/tsconfig.json` → clean; `pnpm exec eslint packages/mongoose-rxdb/src/model.ts packages/mongoose-rxdb/test/connection-close-recovery.test.ts` → clean.
- Docs changes: recoverable failed-close policy documented in `disconnect()` comments (retain database, restore `connected`, clear bookkeeping for retry, queued connects propagate cause); README/types reconciliation deferred to BMRX-24 per task ordering.

### Task BMRX-18: Drain Late Initialization And Keep Invalidated Models Invalid

Status: completed

Kind: defect

Priority: P1; shutdown can leave live storage resources behind a closed database.

Suggested agent: resource lifecycle specialist

Dependencies: BMRX-17

Primary ownership: `packages/mongoose-rxdb/src/model.ts:199-214,258-261,310-344,504-507,609-612`; collection-init tests.

Finding: disconnect rejects registry readiness but does not own/drain underlying `addCollections`. A gated real memory probe added a collection after `db.closed` became true with zero storage-instance close calls. Late success also unconditionally restores `Model.collection` after delete/overwrite, exposing an adapter on an invalid model. Existing pending-shutdown tests assert invalidation, not native resource cleanup.

Requirements: reject pending callers promptly while retaining resource ownership until initialization settles and all created resources close. Guard readiness publication with model registration/generation validity. Avoid arbitrary sleeps or new global registries.

Acceptance criteria: real gated initialization, failure, disconnect, delete, and overwrite leave no orphan storage instance or restored stale adapter. A valid replacement can initialize; shutdown settlement has an explicit, tested resource-completion meaning.

Verification: lifecycle suite plus gated real-memory storage close spies; repeat to detect unhandled rejections.

Completion evidence:

- Changed paths: `packages/mongoose-rxdb/src/model.ts` (registry entry now owns `db`/`initialize`/`settled`; `ensureCollection` tracks `didCreate`/`nativeCollection` with a `lateCleanup` drain that closes exactly the orphan it created when the entry is no longer current; `disconnect()` captures `settled` drains before invalidation, rejects callers promptly via abort, then `await Promise.allSettled(drains)` before `closeDatabase` so shutdown settles only after native resources close; per-model `__abortPromise`/`__abort` created in `buildModel`, rejected in `invalidateModel`, raced in `resolveModelCollection` and `readiness` with delivery-time registration/registry-current guards so delete/overwrite/disconnect never restore a stale `Model.collection` while a valid replacement still initializes from the shared entry; no sleeps or new global registries); `packages/mongoose-rxdb/test/collection-init-drain.test.ts` (new, 5 real-memory gated regressions with collection + storage-instance close spies); `packages/mongoose-rxdb/test/collection-init-harness.test.ts` (pending-disconnect test reordered to drain semantics: start disconnect, assert prompt readiness rejection, release gate, await disconnect). No CHANGELOG.md update; no starter changes.
- Regressions: `completes a real gated initialization without orphan closes`; `drains a real gated failure without orphan resources` (addCollections throws after gate, model removed, `db.collections` empty); `disconnect during pending real initialization rejects promptly and closes the late collection on settlement` (readiness rejects before gate, `disconnectSettled` false across ticks, after gate `db.closed` true, collection close once + storage close >=1, `db.collections` empty, `Model.collection` null); `delete during pending real initialization keeps the deleted model invalid without a stale adapter` (pending rejects promptly via abort, late success leaves `Old.collection` null, connection still owns collection with zero closes, replacement reuses entry and writes); `overwrite during pending real initialization keeps the old model invalid while the replacement initializes` (old rejects promptly, next resolves after gate, old stays null, replacement writes).
- Fail-before evidence: new drain file against pre-fix `model.ts` (via `git stash`) → 2 failed / 3 passed (delete/overwrite pending promises hang to timeout, no prompt rejection or stale-guard).
- Verification commands/results (run serially from repo root): `pnpm exec vitest run --config vitest.config.ts …/collection-init-drain.test.ts …/collection-init-harness.test.ts …/connection-close-recovery.test.ts …/core.test.ts …/adapter-contract.test.ts` → 5 files, 42 tests passed; `…/collection-init-drain.test.ts …/collection-init-harness.test.ts` → 2 files, 15 tests passed; drain file 3 consecutive runs → 5 passed each; `pnpm exec tsc --noEmit -p packages/mongoose-rxdb/tsconfig.json` → clean; `pnpm exec eslint packages/mongoose-rxdb/src/model.ts packages/mongoose-rxdb/test/collection-init-drain.test.ts packages/mongoose-rxdb/test/collection-init-harness.test.ts` → clean.
- Docs changes: drain/resource-completion and per-model publication-guard contract documented in `disconnect()`/`ensureCollection`/`resolveModelCollection`/`buildModel`/`invalidateModel` comments (prompt abort vs retained drain ownership, created-only close, shared-entry reuse); README/types reconciliation deferred to BMRX-24 per task ordering.

### Task BMRX-19: Verify Factory-Precreated Collection Schemas

Status: completed

Kind: defect

Priority: P1; the registry records an unverified requested schema as compatible.

Suggested agent: collection/schema integration specialist

Dependencies: BMRX-18, BMRX-14 (both completed — no `schema.ts`/`converter.ts` changes; verification reads but never mutates schema state, and nested/required test schemas use the explicit-child-Schema and static-required contracts from BMRX-14)

Primary ownership: `packages/mongoose-rxdb/src/model.ts:281-294,310-316`; `src/rx-types.ts` only as needed for actual schema access; lifecycle tests.

Finding: compatibility is checked only against the connection's own registry. A supplied database with numeric `users.age` accepted a model declaring string `age` because existing collection wrapping skips actual schema comparison. Current collision tests compile both models through the same registry.

Requirements: compare against the actual existing collection's canonical schema before publishing readiness. Account for RxDB-normalized metadata without equating incompatible domain shapes. Do not implement schema migration or rely on a cast asserting compatibility.

Acceptance criteria: factory-precreated equivalent schemas succeed, incompatible schemas reject before adapter publication and remove failed model registration. Test nested fields, required sets, primary keys, and retry behavior with real memory collections.

Verification: collection-init and schema integration tests; shared package/type checks.

Completion evidence:

- Changed paths: `packages/mongoose-rxdb/src/model.ts` (`ensureCollection` now verifies a factory-precreated native collection both synchronously before creating the registry entry and asynchronously inside `initialize` as a race guard, via new `readExistingCollectionJsonSchema`/`assertCompatibleWithExistingCollection` helpers; comparison is against `collection.schema.jsonSchema` with no cast asserting compatibility — primary key (stable-stringified, so composite keys are covered), top-level type, exact domain property set with per-property stable-stringified shapes including nested fields, and required sets are compared while RxDB-normalized metadata is ignored: internal `_rev`/`_meta`/`_attachments`/`_deleted` properties and requirements, implicit `_id` requirement, indexes, `title`/`version`/compression flags; mismatch throws before adapter publication with no migration, no registry entry is left behind, and the precreated native collection is never closed since `didCreate` stays false; no `rx-types.ts` changes — actual schema is read through `any`-typed access; `buildModel`'s existing readiness rejection already removes async-failed model registrations); `packages/mongoose-rxdb/test/factory-precreated-schema.test.ts` (new, 6 real-memory regressions). No CHANGELOG.md update; no starter changes.
- Regressions: `accepts a factory-precreated equivalent schema despite RxDB-normalized metadata` (precreate via `addCollections`, equivalent model resolves + writes + counts); `rejects an incompatible top-level type before adapter publication` (numeric-age DB vs string-age model throws `/incompatible.*schema/i`, failed name absent from `modelNames()`, precreated collection and its numeric shape intact); `rejects incompatible nested fields` (city String vs Number with explicit child Schemas); `rejects incompatible required sets` (required name vs optional name); `rejects an incompatible primary key` (precreated `userId` primary key vs requested `_id`); `allows retry with an equivalent schema after an incompatible rejection` (failed name gone, equivalent model initializes against the same precreated collection, writes, `modelNames()` holds only the good model).
- Fail-before evidence: new test file against pre-fix `model.ts` (via `git stash`) → 5 failed / 1 passed (only the equivalent-schema case passed); post-fix → 6 passed.
- Verification commands/results (run serially from repo root): `pnpm exec vitest run --config vitest.config.ts …/factory-precreated-schema.test.ts …/collection-init-drain.test.ts …/collection-init-harness.test.ts …/connection-close-recovery.test.ts …/core.test.ts …/adapter-contract.test.ts` → 6 files, 48 tests passed; `…/nested-schema-required-boundary.test.ts …/schema-behavior.test.ts …/mutation-atomicity.test.ts` → 3 files, 21 tests passed; `pnpm exec tsc --noEmit -p packages/mongoose-rxdb/tsconfig.json` → clean; `pnpm exec eslint packages/mongoose-rxdb/src/model.ts packages/mongoose-rxdb/test/factory-precreated-schema.test.ts` → clean.
- Docs changes: verification contract documented in `readExistingCollectionJsonSchema`/`assertCompatibleWithExistingCollection`/`ensureCollection` comments (canonical-schema source, ignored metadata list, no-migration policy, created-only close); README/types reconciliation deferred to BMRX-24 per task ordering.

### Task BMRX-20: Await Real SQLite Startup Before Selecting A Backend

Status: completed

Kind: defect

Priority: P1; deferred open failure escapes fail-closed backend selection.

Suggested agent: RxDB storage startup specialist

Dependencies: none

Primary ownership: `packages/mongoose-rxdb/src/storage/loader.ts:96-110`; storage-loader/startup tests; storage result contract as needed.

Finding: awaiting `createRxDatabase()` does not establish successful asynchronous startup. An intercepted native open throwing `PROBE_OPEN_FAILURE` still returned `trial-native` with `persistent: true`; RxDB recorded `startupErrors` and npm fallback was not attempted. Existing mock tests reject createRxDatabase immediately, missing real failure timing.

Requirements: use supported RxDB lifecycle evidence to establish backend startup before success annotation/logging. Feed deferred failures into fallback/cause aggregation and clean up failed resources, including when cleanup fails. Do not rely on private fields without bounding and documenting a supported-version integration test.

Acceptance criteria: real RxDB orchestration with an intercepted rejecting open either successfully selects a later tier or throws `SqliteStorageError` preserving the open cause; it never returns a falsely ready backend. Failed resources do not leak, and genuine startup succeeds on supported tiers.

Verification: deterministic loader tests plus real startup orchestration; actual persistent reopen verification at integration where backend prerequisites are available.

Completion evidence:

- Changed paths: `packages/mongoose-rxdb/src/storage/loader.ts` (both database open sites in `createSqliteDatabaseWithLoaders` now call new `assertSqliteStartup` after `createRxDatabase()` resolves and before success annotation/logging; deferred failures are pushed as `{ backend, phase: 'open' }` causes and fall through to the next tier or the terminal `SqliteStorageError`; failed databases are released via new `closeFailedDatabase`, whose own failure is aggregated as an `open`-phase entry without masking the original startup cause; no public storage-result contract change — cleanup failures reuse the existing `open` phase); `packages/mongoose-rxdb/test/storage-startup-boundary.test.ts` (new, 6 regressions). No CHANGELOG.md update; no `create-access-router-mongo-starter` changes.
- Lifecycle evidence and version bound: `assertSqliteStartup` settles the public `storageToken: Promise<string>` then rethrows `startupErrors[0]`, mirroring RxDB's own supported `ensureNoStartupErrors` (invoked on `addCollections`). Both members are public on `RxDatabaseBase` in the supported `rxdb >=17.4.0 <18` range — no private fields. A pre-fix probe against real RxDB 17.5.0 trial-native reproduced the finding exactly (`createRxDatabase` resolved with `closed=false`, `storageToken` resolved to `2`, `startupErrors` held `PROBE_OPEN_FAILURE` plus a derived token `TypeError`, zero files written, and even `close()` rethrew the probe error), confirming that awaiting `storageToken` alone is insufficient and the `startupErrors` check is load-bearing.
- Regressions: `falls through from a deferred native open failure instead of returning a falsely ready backend` (premium deferred-fail → trial-native selected with the probe cause in `fallbackCauses`, failed db closed once); `prefers the published startup cause when the token promise itself rejects` (original open cause aggregated, not the derived token rejection); `records a failed cleanup without masking the original startup cause` (open cause stays first so `SqliteStorageError.cause` preserves it); `treats databases without lifecycle evidence as started` (loader-seam fakes unaffected); `throws SqliteStorageError preserving the open cause when the real native open rejects` (real `createRxDatabase` + intercepted throwing `DatabaseSync`: throws, trial-native `open` cause is `PROBE_OPEN_FAILURE`, no memory cause, failed db `closed === true` with the probe error in its `startupErrors`); `selects a genuinely started trial-native backend when the open succeeds` (real startup: `startupErrors` empty, token resolves, files written, `persistent: true`).
- Fail-before evidence: the real intercepted-open test against the pre-fix loader would return `trial-native` with `persistent: true` (per the finding's probe); deterministic deferred-failure tests fail pre-fix because no `startupErrors` inspection existed.
- Verification commands/results (run serially from repo root): `pnpm exec vitest run --config vitest.config.ts packages/mongoose-rxdb/test/storage-startup-boundary.test.ts` → 1 file, 6 tests passed; `…/storage-loader.test.ts` → 1 file, 7 tests passed; `…/_sqlite-smoke.test.ts` → 1 file, 1 test passed (real persistent write + second-process reopen intact); `pnpm exec tsc --noEmit -p packages/mongoose-rxdb/tsconfig.json` → clean; `pnpm exec eslint packages/mongoose-rxdb/src/storage/loader.ts packages/mongoose-rxdb/test/storage-startup-boundary.test.ts` → clean.
- Docs changes: startup/evidence contract documented in `assertSqliteStartup`/`closeFailedDatabase` JSDoc (supported members, version bound, fake tolerance, cause-ordering guarantee); README/types reconciliation deferred to BMRX-24 per task ordering. Note for BMRX-21 (dependent, still pending): `persistent` metadata logic untouched.

### Task BMRX-21: Make Trial Memory Mode And Storage Metadata Truthful

Status: completed

Kind: defect

Priority: P1; purported volatile mode opens an ordinary disk filename.

Suggested agent: SQLite path/semantics specialist

Dependencies: BMRX-20 (completed — startup assertion/close-failure paths reused unchanged; `:memory:` memory-branch duplicates the same open/startup/close-failure handling)

Primary ownership: `packages/mongoose-rxdb/src/storage/loader.ts:90-106,183-186,198-201`; storage options/docs and loader tests.

Finding: default `:memory:` is passed as the trial prefix. RxDB appends a suffix, yielding a driver target like `:memory:_trial_probe_default`, not SQLite's special `:memory:` name. Metadata nevertheless reports `persistent: false`. The probe intercepted filenames rather than writing files; real SQLite interprets this as an ordinary relative filename.

Requirements: choose genuine volatile behavior or explicitly reject unsupported trial memory mode. Keep default and explicit memory semantics, backend selection, and `persistent` metadata aligned; obtain approval if defaults/backend selection change. Never call a prefixed disk filename in-memory.

Acceptance criteria: exact driver targets and close/reopen behavior are tested for native/npm trial tiers and Premium where available; no unexpected relative files are created in memory mode. Docs/declarations describe the actual default and backend-specific path contract.

Verification: intercepted-open tests plus isolated real-driver persistence tests; shared storage/package checks.

Completion evidence:

- Decision/approval status: maintainer approval is PENDING for the default/backend-selection change. Implemented the safe truthful default per the task brief: `':memory:'` (explicit or default) is volatile-only — it selects genuine RxDB memory storage (`backend: 'memory'`, `persistent: false`) when `allowMemoryFallback: true` is passed and is rejected with a guiding `SqliteStorageError` otherwise. It is never routed to a SQLite backend, so no prefixed disk filename is ever opened in-memory. The alternative (changing the default string to a persistent path) was rejected because it would silently create persistent files for callers expecting the volatile default; fail-closed with guidance is safer. No trial/premium explicit-path selection changed.
- Changed paths: `packages/mongoose-rxdb/src/storage/loader.ts` (new exported `MEMORY_FILE_PATH` constant; `CreateSqliteDatabaseOptions.filePath`/`allowMemoryFallback` JSDoc now states the backend-specific contract — Premium exact `sqliteDatabasePath`, trial `databaseNamePrefix` plus `_trial_<databaseName>` suffix, `':memory:'` volatile-only never routed to SQLite, `persistent:false` only for memory; `resolveSqliteStorage` and `createSqliteDatabaseWithLoaders` short-circuit `':memory:'` before any SQLite load/open — with opt-in they open genuine memory storage through the same `createRxDatabase`/`assertSqliteStartup`/`closeFailedDatabase` handling as BMRX-20, without opt-in they throw `memoryRequestMessage()` before any `createRxDatabase` call; new `memoryRequestMessage()` guidance); `packages/mongoose-rxdb/src/storage/index.ts` (header docs carry the same contract; re-exports `MEMORY_FILE_PATH`); `packages/mongoose-rxdb/README.md` and `website/docs/packages/mongoose-rxdb.md` (storage sections record the default, prefix-suffix derivation, `persistent` alignment, and volatile-only rejection); `packages/mongoose-rxdb/test/storage-memory-boundary.test.ts` (new, 15 regressions). No CHANGELOG.md update; no `create-access-router-mongo-starter` changes.
- Regressions: `passes the exact file path to Premium/trial-native/trial-npm` (seam asserts `sqliteDatabasePath` vs `databaseNamePrefix` driver targets plus `persistent:true`); `selects genuine memory with persistent:false when opt-in is passed` (seam asserts no sqlite/premium/node:sqlite/sqlite3 spec is ever loaded for `':memory:'`); `rejects explicit :memory:, the default, and resolveSqliteStorage :memory: without opt-in before any database is opened` (`SqliteStorageError` with `allowMemoryFallback` guidance, `createRxDatabase` never called); `opens trial-native with a prefixed target for explicit paths` (real `DatabaseSync` interception records `<prefix>_trial_<databaseName>` — neither the bare prefix nor `':memory:'`); `never touches the native driver for ':memory:' with opt-in` (real RxDB orchestration, zero driver loads, `backend: memory`); `trial-native persists across close/reopen in a second process` (2 docs written, prefixed files non-empty, child `node reopen.mjs` against rebuilt `dist` reopens 2 docs with `persistent:true`); `memory mode creates no relative files and does not persist into a second process` (isolated dir stays empty, no `:memory:*` files in cwd, child `node reopen-mem.mjs` with the same name reopens 0 docs with `persistent:false`); `premium uses the exact file path where available` (real exact-path check, skipped with a named warning when `rxdb-premium` is not installed); `trial-npm uses the prefixed target where available` (real write/read with native blocked, skipped with a named warning when sqlite3 bindings are missing).
- Fail-before evidence: new test file against pre-fix sources (via `git stash` of the two storage source files only) → 5 failed / 10 passed; post-fix → 15 passed. The pre-fix run created a real 12 KiB relative file `:memory:_trial_bmrx21volatile_*` in the repo root, confirming the finding against a real driver (not just intercepted filenames); the stray file was removed after the probe.
- Same-process same-name reopen limitations observed (not patched — out of scope, RxDB-owned): trial-native same-name reopen in one process is rejected by RxDB (`opened db with different creator method`) because each loader call builds a fresh native basics object, so durability is proven cross-process; RxDB memory storage intentionally retains collection state in a module-global `COLLECTION_STATES` map after close, so in-process same-name memory reopen can still see data — cross-process reopen is the volatility proof. Both are documented in the test comments.
- Verification commands/results (run serially from repo root): `pnpm --filter @web-ts-toolkit/mongoose-rxdb build` → success (CJS/ESM/DTS, `MEMORY_FILE_PATH` present in `dist/storage/index.mjs` + `.d.mts`); `pnpm exec vitest run --config vitest.config.ts packages/mongoose-rxdb/test/storage-memory-boundary.test.ts` → 1 file, 15 tests passed; `…/storage-loader.test.ts …/storage-startup-boundary.test.ts …/_sqlite-smoke.test.ts` → 3 files, 14 tests passed; `pnpm exec tsc --noEmit -p packages/mongoose-rxdb/tsconfig.json` → clean; `pnpm exec tsc --noEmit -p packages/mongoose-rxdb/test-decl-consumer/tsconfig-nodenext.json` → clean; `…/tsconfig-bundler.json` → clean; `pnpm exec eslint packages/mongoose-rxdb/src/storage/loader.ts packages/mongoose-rxdb/src/storage/index.ts packages/mongoose-rxdb/test/storage-memory-boundary.test.ts` → clean; repo root checked for stray `:memory:*` files after all runs → none.
- Docs changes: backend-specific path contract (`sqliteDatabasePath` vs `databaseNamePrefix` + `_trial_<databaseName>` suffix), volatile-only `':memory:'` default with opt-in/reject semantics, and `persistent`-flag alignment recorded in `loader.ts`/`index.ts` JSDoc, `README.md`, and website storage sections; release-note impact recorded here (behavioral narrowing: `createSqliteDatabase()` with default/explicit `':memory:'` and without `allowMemoryFallback` now throws instead of opening a misnamed disk file with `persistent:false`; full consumer-contract reconciliation remains with BMRX-24).

### Task BMRX-22: Preserve Unordered Bulk Outcomes For Duplicate Input IDs

Status: completed

Kind: defect

Priority: P1; one duplicate batch ID prevents unrelated records from being attempted.

Suggested agent: native bulk-write specialist

Dependencies: BMRX-07

Primary ownership: `packages/mongoose-rxdb/src/rx-adapter.ts:147-164`; real adapter contract/bulk tests.

Finding: native RxDB rejects an unordered batch containing two `dup` IDs plus one unrelated ID with raw `COL22`, inserting nothing. Mapping ID to one index also loses repeated occurrences. Existing fake tests conflict with already-stored IDs, and native contracts use unique batch IDs.

Requirements: handle repeated IDs with bounded partitioning or fallback, preserving input-index attribution and the documented unordered partial-success error. Define which duplicate occurrence is attempted first and preserve ordered mode behavior; do not add read-before-insert uniqueness claims.

Acceptance criteria: real-memory batches combining within-batch duplicates, existing-ID conflicts, and valid IDs persist valid successes and expose exact failed indexes/counts through `BulkWritePartialFailureError`. Test 1/100/1,000 records and record native call counts for the chosen strategy.

Verification: native adapter contract and bulk regression suites; supported SQLite contract at integration.

Completion evidence:

- Changed paths: `packages/mongoose-rxdb/src/rx-adapter.ts` (`insertMany` unordered branch now delegates to new `insertManyUnordered`, which partitions the batch into the minimum number of unique-`_id` passes in input order so the first occurrence of a repeated ID is always attempted first; each pass is one native `bulkInsert` call with a per-pass ID→input-index map and errors sorted by input index; a throwing pass falls back to per-document single inserts for that pass only; non-string-`_id` batches use sequential unordered inserts for exact attribution; ordered mode stays sequential unchanged; no read-before-insert check — all conflicts come from native write errors; contract documented in `insertManyUnordered` JSDoc); `packages/mongoose-rxdb/test/bulk-duplicate-boundary.test.ts` (new, 7 regressions). No CHANGELOG.md update; no starter changes.
- Regressions: `persists the first duplicate and unrelated IDs with exact failed indexes on real memory` ([dup, dup, unrelated] unordered → `BulkWritePartialFailureError` ordered:false, insertedCount 2, ids [dup, unrelated], errors [1], stored [dup, existing, unrelated], winner `first`, 2 native bulkInsert calls); `combines within-batch duplicates with existing-ID conflicts on real memory` ([dup, existing-conflict, valid, dup] → insertedCount 2, errors [1,3], stored [dup, existing, valid], first-occurrence winner, existing unchanged, 2 native calls); `preserves ordered stop-at-first-failure with duplicates on real memory` (ordered [valid, dup, dup, later] → insertedCount 2, errors [2], later unattempted); `keeps native bulkInsert calls bounded at size 1/100/1000 with one within-batch duplicate` (N unique + 1 trailing repeat → insertedCount N, errors [N], exactly 2 native calls; same-size all-unique batch → 1 native call); `preserves unordered duplicate outcomes under SQLite when available` (same mixed batch → insertedCount 2, errors [1,3], stored [dup, existing, valid]; skips with named warning when no SQLite backend).
- Fail-before evidence: new test file against pre-fix sources (via `git stash` of `rx-adapter.ts` only) → 6 failed / 1 passed (only the ordered-mode test passed; all unordered cases threw raw `COL22` with nothing inserted); post-fix → 7 passed.
- Verification commands/results (run serially from repo root): `pnpm exec vitest run --config vitest.config.ts packages/mongoose-rxdb/test/bulk-duplicate-boundary.test.ts packages/mongoose-rxdb/test/adapter-contract.test.ts packages/mongoose-rxdb/test/adapter-harness.test.ts packages/mongoose-rxdb/test/mutation-atomicity.test.ts packages/mongoose-rxdb/test/mutation-options.test.ts packages/mongoose-rxdb/test/core.test.ts` → 6 files, 51 tests passed; `pnpm exec tsc --noEmit -p packages/mongoose-rxdb/tsconfig.json` → clean; `pnpm exec eslint packages/mongoose-rxdb/src/rx-adapter.ts packages/mongoose-rxdb/test/bulk-duplicate-boundary.test.ts` → clean.
- Docs changes: unordered duplicate policy documented in `insertManyUnordered` JSDoc (first-occurrence-first, call-count bound = max ID frequency, ordered unchanged, no read-before-insert); README/types reconciliation deferred to BMRX-24 per task ordering.

### Task BMRX-23: Normalize Date Selectors To Their Stored Representation

Status: completed

Kind: defect

Priority: P1; valid typed Date queries do not match stored dates.

Suggested agent: schema-aware query compiler specialist

Dependencies: BMRX-06, BMRX-13

Primary ownership: `packages/mongoose-rxdb/src/query-compiler.ts:179-183,223-240`; `src/query.ts:248-250`; Date selector tests.

Finding: Date filter operands remain Dates while writes persist ISO strings. A real Date equality query returned no record; the equivalent ISO selector matched. Date storage tests read back by ID and therefore miss this mismatch. Public `FilterQuery` explicitly allows Date values.

Requirements: normalize Date operands at the schema/storage query boundary, including logical/membership/comparison paths; define low-level schema-free compiler behavior rather than making unsupported casting assumptions. Reject invalid dates with controlled errors.

Acceptance criteria: equality, ranges, in/nin, nested logical selectors, count, and update/delete predicates work over stored dates in real memory and supported SQLite. Raw and hydrated date representations remain unchanged outside selector compilation.

Verification: new Date selector regressions plus write-normalization/query suites and strict consumer tests.

Completion evidence:

- Changed paths: `packages/mongoose-rxdb/src/query-compiler.ts` (new schema-free `normalizeDateOperand` helper; `cloneLiteral` normalizes every `Date` operand to `toISOString` across equality/range/`$in`/`$nin`/nested logical/literal-object paths, invalid dates throw `QueryFilterError`; removed by-value `Date` clone that preserved the mismatch; `sanitizeFilter` JSDoc records the BMRX-23 contract); `packages/mongoose-rxdb/test/date-selector-boundary.test.ts` (new, 5 regressions). No `query.ts` behavior change (builder/descriptor `cloneBoundedInput` intentionally keeps raw `Date` instances; only the compiled selector is normalized — verified by `getFilter()` `instanceof Date` assertion, preserving BMRX-06). No CHANGELOG.md update; no starter changes.
- Regressions: `normalizes Date operands to ISO strings at the schema-free compiler boundary` (equality/range/in/logical, input Date untouched); `rejects invalid dates with QueryFilterError and leaves data unchanged` (sanitize/translate/exec rejection, zero adapter calls); `matches equality, ranges, in/nin, and nested logical selectors over stored dates` (real memory: Date and ISO equality agree, ranges, in/nin, `$or`, count); `applies date predicates to update/delete and keeps builder raw Dates with hydrated Dates` (raw `getFilter` Date snapshot, updateMany/deleteMany predicates, hydrated `Date` round-trip); `matches date selectors under SQLite when a backend is available` (real `createSqliteDatabase` equality/range/count, skips with named warning when no backend).
- Fail-before evidence: new test file against pre-fix sources (via `git stash` of `query-compiler.ts` only) → 5 failed / 0 passed; post-fix → 5 passed.
- Verification commands/results (run serially from repo root): `pnpm exec vitest run --config vitest.config.ts packages/mongoose-rxdb/test/date-selector-boundary.test.ts packages/mongoose-rxdb/test/write-normalization.test.ts packages/mongoose-rxdb/test/query-read-semantics.test.ts packages/mongoose-rxdb/test/query-chained-constraints.test.ts packages/mongoose-rxdb/test/core.test.ts packages/mongoose-rxdb/test/mutation-options.test.ts packages/mongoose-rxdb/test/adapter-contract.test.ts` → 7 files, 50 tests passed; `pnpm exec tsc --noEmit -p packages/mongoose-rxdb/tsconfig.json` → clean; `pnpm exec eslint packages/mongoose-rxdb/src/query-compiler.ts packages/mongoose-rxdb/test/date-selector-boundary.test.ts` → clean.
- Docs changes: date selector contract documented in `normalizeDateOperand`/`sanitizeFilter` JSDoc (stored ISO representation, schema-free all-Dates normalization rationale, invalid-date rejection, raw/hydrated unchanged); README/types reconciliation deferred to BMRX-24 per task ordering.

### Task BMRX-24: Align Lean Result Types And Public Error Discovery

Status: completed

Kind: defect

Priority: P2; emitted types misdescribe supported runtime outcomes and hide actionable package errors.

Suggested agent: installed TypeScript consumer specialist

Dependencies: BMRX-01 through BMRX-23 (all preceding runtime/contract work completed or explicitly dispositioned)

Primary ownership: `packages/mongoose-rxdb/src/types.ts`, `src/query.ts`, `src/model.ts` public signatures only, `src/index.ts`, `test-decl-consumer/`, packed consumer tests; final README/website reconciliation.

Finding and references: `LeanQueryResult` maps every object result, including mutation result objects, to document fields (`query.ts:49-56,180-185`); `lean(false)` after a typed lean query does not restore hydrated typing. `FindOneAndDeleteOptions.lean` is accepted (`types.ts:160-163`) but `model.ts:81-84` always returns hydrated typing; README lists findOneAndUpdate `lean` while `types.ts:151-158` omits it. Existing `dist/index.d.ts` retains these signatures. Root exports (`index.ts:18-34`) omit thrown `WriteNormalizationError` and `MutationPartialFailureError`, preventing package-root instanceof handling; existing low-level exports are otherwise already a shipped compatibility boundary. Metadata and tsup entrypoints structurally align; no new broken export-path claim is made.

Requirements: model lean transformations by document-producing operations, preserving update/delete/count result types and correct true/false transitions. Resolve option/type/doc disagreement using runtime evidence. Expose the intentionally public thrown error classes and useful result contracts through supported package imports, or provide an equally discoverable documented discriminator; do not require blocked deep imports. Keep projection partial-result typing an explicit documented limitation unless narrowly addressed.

Acceptance criteria: strict NodeNext/Bundler `.mts`/`.cts` consumers test lean read toggling, mutation counts, option-based lean results, nullability, and documented error narrowing. Runtime packed tests pair with types to rule out false hydrated methods. Generated declarations preserve useful JSDoc and README examples compile from the staged package. Record release notes for narrowed behavior; do not manually edit `dist`.

Verification: shared declaration and packed-consumer commands; root/storage imports from a fresh release-staged consumer. This task also reconciles task-local docs without expanding public low-level API removals.

Completion evidence:

- Changed paths: `packages/mongoose-rxdb/src/query.ts` (replaced object-mapping `LeanQueryResult` with document-only `LeanDocumentElement` — only `Document` instances map to `LeanResult<Doc>`, `UpdateResult`/`DeleteResult`/`number` pass through; added `HydratedType` generic so `.lean(false)` restores the pre-lean hydrated type; exported `LeanQueryResult`); `packages/mongoose-rxdb/src/types.ts` (added `lean?: boolean` to `FindOneAndUpdateOptions` matching runtime `supportedOptionsForOperation`/`resultDocument` and README; documented lean document-only scope, projection partial-result limitation on `LeanResult`, and `FindOneAndDeleteOptions.lean` contract); `packages/mongoose-rxdb/src/model.ts` (added `{ lean: true }` vs `{ lean?: false }` overloads for `findOneAndUpdate`/`findOneAndDelete` returning `LeanResult<T> | null` vs hydrated); `packages/mongoose-rxdb/src/index.ts` (root-exports `WriteNormalizationError` and `MutationPartialFailureError` with discovery JSDoc, added both to the default `api` object, re-exported `LeanQueryResult` type); `packages/mongoose-rxdb/test/lean-error-boundary.test.ts` (new, 4 runtime regressions); `packages/mongoose-rxdb/test-decl-consumer/` (all 6 fixtures extended with lean toggling, preserved counts, option-based lean, nullability, root error narrowing); `packages/mongoose-rxdb/test/packed-consumer.test.ts` (new packed `lean-error-contract.mjs` runtime pairing run in the clean-install test); `packages/mongoose-rxdb/README.md` and `website/docs/packages/mongoose-rxdb.md` (lean scope/toggling/option/nullability, projection limitation, root error discovery). No CHANGELOG.md update; no `create-access-router-mongo-starter` changes; no `dist` manual edits.
- Runtime evidence for option/type/doc disagreements (real memory storage, pre-fix dist): `findOneAndUpdate(..., { lean: true })` returns a plain record with no `save` while omission returns a hydrated `Document`; `findOneAndDelete(..., { lean: true })` returns plain or `null`; `.lean(true)` on `updateOne`/`countDocuments` rejects with `MutationOptionError` (lean unsupported for non-document ops), so the type fix preserves count shapes while the runtime rejection is retained and tested — no runtime behavior changed.
- Regressions: `toggles lean reads at runtime without false hydrated methods` (lean array/one have no `save`, `lean(true).lean(false)` restores `save`, missing lean one is `null`); `preserves mutation and count result shapes through lean mapping` (update/count/delete shapes intact plus documented `MutationOptionError` on mutation-lean); `resolves option-based lean results with nullability` (option-lean plain with `after` age, hydrated otherwise, delete-lean null/plain); `exposes intentionally public thrown errors from the package root` (root identity for both new exports, `WriteNormalizationError` overflow narrowing, partial-failure identities).
- Verification commands/results (run serially from repo root): `pnpm exec vitest run --config vitest.config.ts packages/mongoose-rxdb/test/lean-error-boundary.test.ts packages/mongoose-rxdb/test/query-read-semantics.test.ts packages/mongoose-rxdb/test/core.test.ts packages/mongoose-rxdb/test/mutation-options.test.ts packages/mongoose-rxdb/test/adapter-contract.test.ts` → 5 files, 38 tests passed; `pnpm exec tsc --noEmit -p packages/mongoose-rxdb/tsconfig.json` → clean; `pnpm exec eslint` over the 6 changed sources/tests + `test-decl-consumer/` → clean; `pnpm exec tsc --noEmit -p packages/mongoose-rxdb/test-decl-consumer/tsconfig-nodenext.json` → clean; `.../tsconfig-bundler.json` → clean; `pnpm exec vitest run --config vitest.config.ts packages/mongoose-rxdb/test/packed-consumer.test.ts` → 1 file, 5 tests passed (includes new packed lean/error contract, README quickstart compile+run, strict decl fixtures with `skipLibCheck: false`); `pnpm --filter mongoose-rxdb-example typecheck` → clean; `dist/index.d.mts` inspection → `WriteNormalizationError`, `MutationPartialFailureError`, `LeanQueryResult`, and BMRX-24 JSDoc present.
- Release notes (narrowed behavior, no runtime change): `LeanQueryResult` no longer maps mutation/count results to document fields at the type level (previously `updateOne().lean()` typed as `LeanResult`; now correctly `UpdateResult` — runtime always rejected lean there); `FindOneAndUpdateOptions` gains `lean` to match long-standing runtime/README behavior (widening, previously omitted); `WriteNormalizationError`/`MutationPartialFailureError` are now importable from the package root (additive discovery fix); projected lean records remain typed as full `LeanResult<T>` (explicit documented limitation).

### Task BMRX-25: Measure And Bound No-Op Native Write Amplification

Status: completed

Kind: investigation

Priority: P2; optional performance work needs native measurement and must not weaken concurrency safety.

Suggested agent: RxDB performance specialist

Dependencies: BMRX-07, BMRX-22

Primary ownership: `packages/mongoose-rxdb/src/rx-adapter.ts:270-277`; native mutation performance probes/tests.

Finding: returning `current` from incrementalModify does not cancel native persistence. A no-op set reported `modifiedCount: 0` but advanced the stored revision generation from 1 to 2. Counts are truthful; storage/replication work remains. Fake count tests do not measure this.

Requirements: measure revisions, native write calls, and change events for unchanged/changed/conflicted mutations at relevant batch sizes. Determine whether supported RxDB APIs allow a concurrency-safe no-write outcome. Recommend implement, defer, or no action; never substitute an unsafe stale pre-read to save a write.

Acceptance criteria: record reproducible baseline/results and an evidence-backed bounded recommendation. If feasible, add a uniquely numbered implementation task with measurable acceptance criteria; investigation completion does not require a speculative optimization.

Verification: source-backed real-memory measurements and supported SQLite comparison when available; package tests only if implementation follows.

Completion evidence:

- Changed paths: none. Measurement-only investigation: no source, test, README, website, CHANGELOG, or starter changes; no behavior change. Probes ran from `/tmp` (`bmrx25-probe.mts`, `revcheck.mts`, `throwcheck2/3.mts`) against package `src` via `tsx`, serially in one process; nothing committed.
- Method (reproducible baseline): `Connection` + real `createMemoryDatabase` (RxDB 17.5.0, within the supported `>=17.4.0 <18` range) and real `createSqliteDatabase` trial-native (`persistent: true`, isolated `mkdtemp` dir, cleaned after). Per case, instrumented the native collection's `storageInstance.bulkWrite` (call count, row count, contexts — all `incremental-write`) and subscribed to native `collection.$` for change events; read revision heights from raw `_data._rev` (`doc.toJSON()` strips `_rev`, so JSON reads cannot observe generations). Sizes: memory 1/10/100 docs, SQLite 1/10 docs. Cases: single `updateOne` no-op (`$set` same value) vs changed; batched N×`updateOne` no-op vs changed (per-doc loop, modelling batch amplification); non-matching conditional selector; 3 concurrent conditional claims (`{_id, n:0}` `$inc`, exactly 1 winner); unchanged `Document.save()`.
- Results, real memory storage (identical on real SQLite trial-native, sizes 1/10):
  - `updateOne` no-op: `matched 1 / modified 0`, rev +1, 1 bulkWrite call, 1 row, 1 change event — byte-identical native cost to a changed write.
  - `updateOne` changed: `matched 1 / modified 1`, rev +1, 1 call, 1 row, 1 event.
  - Batch N×`updateOne` no-op (N=1/10/100): `matched N / modified 0`, rev +1 per doc, N calls, N rows, N events — linear O(N) amplification, exactly matching the changed batch (N/N, N calls, N rows, N events). No retry multiplication: calls == docs in sequential batches.
  - `updateOne` non-matching selector: `matched 0 / modified 0`, 0 calls, 0 rows, 0 events at every size — query-time no-match never touches native storage.
  - 3 concurrent conditional claims: exactly 1 win, 3 bulkWrite calls, 3 rows, rev +2, 2 change events — losing (write-time non-matching) attempts still issue a full native no-op write each; bounded, no retry storm.
  - Unchanged `Document.save()`: rev +0, 0 calls, 0 rows, 0 events — the BMRX-08 short-circuit already avoids native writes entirely, as does any non-matching selector.
- Source evidence (rxdb 17.5.0 `dist/cjs`, no private fields): `incremental-write.js` `triggerRun` pushes one writeRow per docId and calls `storageInstance.bulkWrite` unconditionally — the modifier's return value always becomes the written document (`modifierFromPublicToInternal` reattaches `_meta`/`_rev` and returns it); there is no skip signal. `rx-storage-helper.js` assigns `_rev = createRevision(token, previous)` (height+1) unconditionally on the update path, and `categorizeBulkWriteRows` performs no content-equality check before emitting the UPDATE event. Throwing inside the modifier is NOT a skip: the caller's promise rejects early but the queued write still lands afterward (verified: rev 1→2 plus 1 change event after settle) — worse than useless as a no-write mechanism.
- Recommendation: NO ACTION (accept as known bounded cost). Bound: at most 1 native bulkWrite row + 1 revision generation + 1 change event per matched document per mutation — identical to a real write, linear in batch size, with truthful `modifiedCount: 0`. The only way to avoid the write is to not call `incrementalModify`, which requires deciding no-op-ness on a stale pre-read outside the retry boundary; that is explicitly rejected — a concurrent writer can change the record between the pre-read and the skipped write, silently dropping an intended mutation and violating the BMRX-07 atomicity contract. No uniquely numbered implementation task is created: no supported RxDB API in the `>=17.4.0 <18` range allows a concurrency-safe no-write outcome, so implementation is not safely feasible. Revisit only if upstream RxDB adds a supported conditional/skip-write signal; replication impact is the same single-revision-per-mutation bound (one extra revision advances the replication checkpoint, no multiplication).
- Verification commands/results (run serially from repo root; single-process sequential probes): `./node_modules/.bin/tsx /tmp/bmrx25-probe.mts` → exit 0, memory (1/10/100) and SQLite trial-native (1/10) tables above, all `incremental-write` contexts; `./node_modules/.bin/tsx /tmp/revcheck.mts` → no-op 1→2, changed 2→3; `./node_modules/.bin/tsx /tmp/throwcheck3.mts` → throw-modifier still writes (rev 1→2, 1 event after settle). `git status` confirms no repo files touched by this task (pre-existing unrelated worktree modifications left alone). No package tests follow (no implementation, per task brief).
- Docs changes: none (this evidence record only).

### Task BMRX-26: Independently Verify Cross-Path Boundaries And Published Contract

Status: completed

Kind: improvement

Priority: P1; multiple shared boundaries and native-only defects require an independent integration gate.

Suggested agent: reviewer who did not implement the preceding fixes

Dependencies: BMRX-01 through BMRX-25

Primary ownership: review evidence in this document, focused missing regressions, package consumer/integration checks; no broad refactor.

Finding and references: the prior completed plan's tests missed alternate setter/projection paths, native startup timing, conditional concurrency, and within-batch native errors. References are the concrete scenarios and test gaps in BMRX-01 through BMRX-25, plus historical MRX-15 evidence.

Requirements: verify acceptance against runtime behavior, not completion summaries. Trace public create/save/insertMany/query/builder/compiler/adapter paths and model invalidation. Compare runtime errors, types, docs, shipped artifacts, and selected-backend metadata. Verify security decisions and bounded-input guarantees, and retain explicit deferred-risk rationale.

Acceptance criteria: every defect has a regression failing before the fix and passing after where feasible; investigations have approved evidence-backed dispositions and tracked necessary follow-ups. Security/concurrency/resource regressions use real/native or isolated-process evidence where fake adapters are insufficient. Required checks pass, or this task remains blocked with exact prerequisites/owner and unverified criteria. No unexplained P0/P1 risk is silently signed off.

Verification: all shared verification levels below, serialized, with exact commands/results appended as completion evidence.

Completion evidence (independent reviewer, no re-implementation, no source/behavior changes by this task):

- Independent runtime probes (serial `/tmp` tsx scripts against package `src` + real `createMemoryDatabase`, unique `bmrx26_*` db/collection names, `disconnect()` cleanup; nothing committed): write-target isolation (`__idRaw` object-form `set` throws, doc unchanged); explicit-null filter rejection (`QueryFilterError`); chained range `gte+lte` returns only mid; request regex `^((a+))+$` rejected with `QueryFilterError`; compiled-schema `paths.set` throws; root `WriteNormalizationError`/`MutationPartialFailureError` exported; immutable `$set` rejected; unordered `insertMany` with within-batch duplicates → `BulkWritePartialFailureError` with `insertedCount 2` and 2 stored; 3 concurrent conditional claims → exactly 1 winner; Date equality matches stored ISO; lean via `.lean(true)` builder and `findOneAndUpdate { lean: true }` returns plain records. 14/14 pass. (One initial probe FAIL was the probe's own wrong 3-arg `findOne(filter, undefined, { lean: true })` call — `findOne` takes filter only; corrected builder/option forms both pass. Not a code gap.)
- Fail-before reliance: per-task stash-based fail-before evidence in BMRX-01/05-15/17-19/21-23 records was reviewed and accepted; this task did not re-run fail-before (reviewer-only scope). BMRX-02/03/04 fail-before rests on subprocess/probe descriptions in their evidence blocks.
- Security/concurrency/resource evidence accepted as native or isolated-process where required: BMRX-02 subprocess prototype-descriptor checks; BMRX-03 subprocess grouped-variant rejections; BMRX-04 10k-deep subprocess; BMRX-07 real-memory barrier claims (3x repeated); BMRX-15 isolated-process unhandled-rejection exit; BMRX-18/19/22/23 real-memory gated/precreated/bulk/date suites; BMRX-20 real intercepted-open startup; BMRX-21 cross-process persist/volatile reopen.
- Shipped-artifact comparison (fresh `pnpm build` output): `dist/index.mjs` + `dist/index.js` export `WriteNormalizationError`/`MutationPartialFailureError` from the package root (runtime `typeof === 'function'`); `dist/storage/index.mjs` exports `MEMORY_FILE_PATH === ':memory:'`; `dist/index.d.mts`/`index.d.ts` carry the new error/lean types; `npm pack --dry-run --json` from `packages/mongoose-rxdb` → 14 files, `dist/index.js/.mjs/.d.ts/.d.mts` + `dist/storage/index.js` present, ~108 KiB; README documents request-regex rejection (`QueryFilterError` before native construction) and volatile-only `:memory:`; repo root has no stray `:memory:*` files.
- Deferred-risk rationale retained (nothing silently signed off): BMRX-03 maintainer approval PENDING for the narrowed reject-default (no restricted grammar offered); BMRX-05 public-contract approval PENDING for explicit-null rejection (safe default implemented, release-note/type consequences carried by BMRX-24); BMRX-21 default/backend-selection approval PENDING (fail-closed volatile-only implemented); BMRX-07 native delete conditionality is best-effort with a tracked follow-up (natively conditional remove or BMRX-24 limitation note); BMRX-25 disposition NO ACTION (bounded single-revision cost, no safe skip-write API) with no implementation task; BMRX-24 projection partial-result typing remains an explicit documented limitation.
- Verification commands/results (run serially from repo root): focused boundary runs `pnpm exec vitest run --config vitest.config.ts` → (a) 6 files, 71 tests passed (document/projection/sanitize/budget/null/chained); (b) 8 files, 54 tests passed (atomicity/nested-save/immutable/array/storage-value/schema/default/nested-required); (c) 10 files, 80 tests passed (validation/middleware-errors/close-recovery/init-drain/precreated-schema/startup/memory/bulk-duplicates/date/lean) — 24 files, 205 tests total; `pnpm exec tsc --noEmit -p packages/mongoose-rxdb/tsconfig.json` → clean; `pnpm exec eslint "packages/mongoose-rxdb/src/**/*.ts" "packages/mongoose-rxdb/test/**/*.ts"` → clean; `pnpm --filter @web-ts-toolkit/mongoose-rxdb test` → 35 files, 279 tests passed; `pnpm exec tsc --noEmit -p packages/mongoose-rxdb/test-decl-consumer/tsconfig-nodenext.json` → clean; `.../tsconfig-bundler.json` → clean; `pnpm --filter mongoose-rxdb-example typecheck` → clean; `pnpm exec vitest run --config vitest.config.ts packages/mongoose-rxdb/test/packed-consumer.test.ts` → 1 file, 5 tests passed; `pnpm lint` → 0 errors (3 pre-existing unused `eslint-disable no-console` warnings); `pnpm build` → success; `pnpm test` → first run had 1 failure in `create-access-router-mongo-starter` (out-of-scope package with pre-existing unrelated worktree modifications documented in this plan's Coverage section; untouched per task rules), rerun exit 0 with all 26 packages passing and zero failed tests; `pnpm build-artifact -- --version 0.99.0-bmrx26` → success (`dist/web-ts-toolkit-0.99.0-bmrx26.tar.gz`); `pnpm verify-artifact -- --version 0.99.0-bmrx26` → verified successfully.
- Changed paths: this task document only (BMRX-26 Status → completed + this evidence). No source, test, README, website, CHANGELOG.md, starter, or `dist` changes. Probe scripts removed from `/tmp` after the run (pre-existing `/tmp/bmrx23-*`/`bmrx25-*` files left alone).

Kind: improvement

Priority: P1; multiple shared boundaries and native-only defects require an independent integration gate.

Suggested agent: reviewer who did not implement the preceding fixes

Dependencies: BMRX-01 through BMRX-25

Primary ownership: review evidence in this document, focused missing regressions, package consumer/integration checks; no broad refactor.

Finding and references: the prior completed plan's tests missed alternate setter/projection paths, native startup timing, conditional concurrency, and within-batch native errors. References are the concrete scenarios and test gaps in BMRX-01 through BMRX-25, plus historical MRX-15 evidence.

Requirements: verify acceptance against runtime behavior, not completion summaries. Trace public create/save/insertMany/query/builder/compiler/adapter paths and model invalidation. Compare runtime errors, types, docs, shipped artifacts, and selected-backend metadata. Verify security decisions and bounded-input guarantees, and retain explicit deferred-risk rationale.

Acceptance criteria: every defect has a regression failing before the fix and passing after where feasible; investigations have approved evidence-backed dispositions and tracked necessary follow-ups. Security/concurrency/resource regressions use real/native or isolated-process evidence where fake adapters are insufficient. Required checks pass, or this task remains blocked with exact prerequisites/owner and unverified criteria. No unexplained P0/P1 risk is silently signed off.

Verification: all shared verification levels below, serialized, with exact commands/results appended as completion evidence.

## Shared Verification

Prerequisites: repo dependencies installed with `pnpm install`, supported Node 22+ for this package, and optional SQLite drivers/license availability identified before claiming backend coverage. Use unique database/collection names and isolated temporary directories such as `/tmp`; clean up child processes, listeners, databases, and files after success and failure. Never run pathological regex or prototype deletion probes in the main runner.

Focused checks from repository root (replace the test placeholder with the task's actual test file):

```sh
pnpm exec vitest run --config vitest.config.ts packages/mongoose-rxdb/test/<focused-test>.test.ts
pnpm exec tsc --noEmit -p packages/mongoose-rxdb/tsconfig.json
pnpm exec eslint "packages/mongoose-rxdb/src/**/*.ts" "packages/mongoose-rxdb/test/**/*.ts"
```

After each coordinated implementation batch, from repository root, serially:

```sh
pnpm --filter @web-ts-toolkit/mongoose-rxdb test
pnpm exec tsc --noEmit -p packages/mongoose-rxdb/test-decl-consumer/tsconfig-nodenext.json
pnpm exec tsc --noEmit -p packages/mongoose-rxdb/test-decl-consumer/tsconfig-bundler.json
pnpm --filter mongoose-rxdb-example typecheck
```

The package test script rebuilds itself and transitive dependencies. Do not overlap it with other package/root build/test scripts. The existing packed-consumer suite builds release-like tarballs and clean npm/pnpm consumers; serialize it too. A source-only focused run does not refresh `dist`.

At final integration, from repository root, serially:

```sh
pnpm exec vitest run --config vitest.config.ts packages/mongoose-rxdb/test/packed-consumer.test.ts
pnpm lint
pnpm build
pnpm test
pnpm build-artifact -- --version 0.99.0-bmrx26
pnpm verify-artifact -- --version 0.99.0-bmrx26
```

Additional package-directory inspection: `npm pack --dry-run --json` from `packages/mongoose-rxdb`. The source manifest has intentional release placeholders; verify their rewrite through the packed/release harness, not by publishing the source manifest. Optional backend skips must name the unavailable prerequisite and unverified acceptance criteria; they are not evidence that persistence passed.

## Decisions And Deferrals

- BMRX-03 requires approval of the narrowed untrusted-regex contract. Recommended default: reject request-derived regex, not promise bounded execution from textual heuristics.
- BMRX-05 decides explicit null versus omitted filters. Recommended direct-boundary policy: reject explicit null while retaining intentional `{}` match-all; do not silently assume compatibility approval.
- BMRX-08 must document conflicts for arrays and intentional parent replacement before implementation; do not silently auto-merge ambiguous changes.
- BMRX-21 must choose genuine memory behavior or rejection for trial `:memory:`; default/backend changes need release notes.
- BMRX-25 is measurement-led; no write-avoidance optimization is approved yet.
- Full transactions, reactive/watch APIs, streaming cursors, backend-atomic uniqueness, and migration support remain deliberate feature deferrals. Correct current mutation/storage contracts take priority; existing README scope does not promise these features.
- Low-level export removal and mixed CJS/ESM identity redesign remain deferred under the prior documented compatibility contract. This review found no reason to repeat those completed packaging decisions.
- No general performance claim is made about lean/count/bulk improvements from the earlier phase. Only native no-op writes and duplicate-batch behavior received new probes here. Broad benchmarking and a complete dependency-version matrix remain outside this review's evidence.

## Definition Of Done And Maintenance

- Start a task only after dependencies and shared-file ownership are resolved; set `in_progress` and record the assigned agent/session. Use `blocked` with an exact decision/prerequisite owner when execution cannot proceed.
- Keep every task's original finding as history. Append changed paths, regression names, exact verification commands/results, release/doc changes, and follow-up IDs on completion.
- A saved plan or implemented patch is not task completion. Defects require observable correction and verification; investigations require a documented, approved disposition. Deferrals need maintainer approval, residual risk, and release impact; do not label them completed fixes.
- New independent findings must be deduplicated against this file and the prior phase, then receive a new BMRX ID, ownership, dependencies, classification, priority, acceptance criteria, and verification. Necessary acceptance work belongs in its existing task rather than a hidden scope expansion.
- BMRX-26 must independently verify all accepted P0/P1 remedies, public contract coherence, real resource cleanup, input bounds, and serial package/root/artifact evidence before the phase is complete.
