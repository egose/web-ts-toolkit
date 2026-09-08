# Utils Health Review And Remediation

Created: 2026-09-07 20:52:04 local time.

## Objective

Make `@web-ts-toolkit/utils` accurate at object and collection boundaries, predictable for installed TypeScript consumers, and independently testable.

Scope: `packages/utils` source, tests, declarations, manifest/build configuration, shipped README, and the matching website page. Inspect dependent callers when deciding contract changes; do not redesign those packages. Non-goals: full Lodash compatibility, a general utility-library expansion, blanket input sanitization, new public subpaths, or implementing this plan during the review. Only this task document was manually created.

## Coverage And Baseline

- Inspected the root export surface, manifest, tsup/TypeScript configuration, emitted declarations, all three existing test files, README, website docs, `_internal.ts`, object/path/clone/equality helpers, dictionary builders, async helpers, set operations, flattening, sorting, and selected guards. Not every small helper or downstream call site was exhaustively reviewed.
- Inspected client `model.ts` references to `cloneDeep` and `isEqual`: snapshots, concurrent-save reconciliation, reset/serialization, and dirty tracking depend on these helpers (notably lines 128-129, 226-268, 426-467, 545 at review time). Utility fixes need downstream verification.
- Existing related work: `20260806-144945-access-router-client-review-remediation.md`, ARC-18, already corrected utils conditional declaration exports and packs utils as a dependency. `20260813-105538-http-errors-review-remediation.md` also covers utils as a packed dependency. Do not reopen these completed metadata fixes; UTILS-10 adds utils-owned API coverage.
- `20260906-225058-access-router-client-boundary-review.md`, BND-08, owns client dirty-root parsing and mirrors the utils grammar. UTILS-03 owns the underlying utility key-identity issue, not that client's completed bookkeeping fix. Coordinate any grammar change with that caller.
- Existing unrelated tracked/untracked work in access-router-client-related packages, express-runtime, and task files was present and must not be reverted. Ignored generated `.js` siblings exist in utils `src/`; `git ls-files packages/utils/src` lists only `.ts`, while `git check-ignore` confirms `_internal.js` and `index.js` are ignored. They are not established tracked-source duplication defects.
- Actually run from repository root: `pnpm --filter @web-ts-toolkit/utils test`. Result: CJS/ESM/declarations built, 3 test files and 13 tests passed. Vite warned about ESM syntax in the CommonJS-loaded root config.
- Actually run: `pnpm exec tsc --noEmit -p packages/utils/tsconfig.json --strict`. Failed with six diagnostics: indexing in `eachRight`/`forEach`, ES2018 library missing `Object.hasOwn`, callback variance in `orderBy`, and optional accumulator handling in `reduce` (two errors).
- Actually run: isolated Node ESM probes importing freshly rebuilt `packages/utils/dist/index.mjs`. Confirmed all runtime examples below, including prototype-key crashes, inherited mutation, numeric-key loss, equality false positives/cycle overflow, clone overflow, omit input mutation, synchronous async-wrapper throw, wide flatten overflow, and 10,100 iteratee calls for a 100-by-100 intersection.
- Full repository build/test/lint, packed installation, strict installed-consumer compilation, wall-clock benchmarks, Unicode behavior, hostile proxies/accessors, and cross-realm behavior were not verified in this review. No end-to-end remote exploit or global `Object.prototype` pollution is claimed. Subagent analysis attempts hit a usage limit; the review was completed directly.

## Execution Rules

Priorities: P1 = demonstrated corruption, unexpected mutation, crashes, or unsound public narrowing; P2 = contract, performance, testability, or discoverability improvements without demonstrated urgent external impact. No P0 incident is established.

All tasks start pending. Assign an agent and set `in_progress` only after dependencies finish. Record changed files, commands/results, failing-before evidence where feasible, and unresolved risks before marking completed. If required verification cannot run, mark blocked with the prerequisite and owner. Investigation tasks may finish with an evidence-backed no-change decision.

Paths below are repository-relative; abbreviated ownership under `src/` and `test/` means `packages/utils/`. Suggested agents describe roles, not required tool agent names.

Use one `_internal.ts` owner at a time, sequencing UTILS-02, UTILS-03, UTILS-04, UTILS-05, then UTILS-08. These tasks do not all have behavioral dependencies, but share a file. UTILS-01 can run independently using dedicated tests; do not extract a helper into `_internal.ts` concurrently. UTILS-06 and UTILS-07 can run independently. UTILS-09 follows behavior changes and owns public signatures/config; UTILS-10 establishes the harness first. UTILS-11 owns the final shared README/website pass, and UTILS-12 is an independent integration review. Keep each fix's regression tests with its owner; use separate focused test files rather than concurrent edits to the existing three files.

Builds/tests must run serially across agents and dependent packages because test scripts rebuild shared `dist/`. Source edits can run in parallel with disjoint ownership, but acquire exclusive build/test time. Never edit generated `dist` or remove pre-existing ignored `.js` files without confirming their origin and permission.

## Shared Verification

Prerequisites: workspace dependencies installed with `pnpm install`, Node satisfying utils `>=22`.

- V1: `pnpm --filter @web-ts-toolkit/utils test` after each implementation task. During development, from `packages/utils`, use `pnpm exec vitest run --config ../../vitest.config.ts test/<owned-file>.test.ts` after obtaining a fresh exclusive build where the test needs `dist`.
- V2: `pnpm exec eslint "packages/utils/**/*.{ts,js,mts}"` and `git diff --check`. Record pre-existing unrelated failures separately; do not fix unrelated work to make a gate green.
- V3: `pnpm exec tsc --noEmit -p packages/utils/tsconfig.json --strict`, required after UTILS-09. Use explicit no-emit checks; do not generate more source siblings.
- V4: utils-owned packed runtime/strict consumer checks added by UTILS-10/09, exercised through V1. Use the actual release manifest transformer rather than treating intentional source placeholders as publication defects. Packed checks must use package-name imports without workspace source aliases, ESM and CJS, NodeNext and Bundler, and `skipLibCheck: false`.
- V5: at integration, serial `pnpm build`, `pnpm test`, and `pnpm lint`. Full tests already serialize package scripts; do not launch another build/test alongside them. Record attributable versus pre-existing failures. A raw `npm pack --dry-run` from `packages/utils` can inspect the development allowlist, but does not substitute for release-transformed installed-consumer checks.

## Tasks

### Task UTILS-01: Preserve Prototype-Named Dictionary Keys

Status: completed

Completion evidence:

- Changed files (UTILS-01 only; no `_internal.ts`, CHANGELOG, or other tasks' files):
  - `packages/utils/src/dictionary.ts` (new, owned helper, not re-exported from `index.ts`): `defineOwnDataProperty` (single `Object.defineProperty` own-enumerable-data-property policy) + `hasOwnDataProperty` (`Object.prototype.hasOwnProperty` guard). Documents the result-prototype contract (default `Object.prototype`, never null-prototype; `__proto__` never replaces the prototype).
  - `packages/utils/src/groupBy.ts`: group-bucket lookup guarded by `hasOwnDataProperty`, bucket creation via `defineOwnDataProperty`; JSDoc contract note.
  - `packages/utils/src/arrayToRecord.ts`, `src/mapKeys.ts`, `src/mapValues.ts`, `src/pickBy.ts`, `src/omitBy.ts`, `src/toStringRecord.ts`: all result writes via `defineOwnDataProperty`; JSDoc contract notes (ordering, last-write-wins, non-mutation preserved).
  - `packages/utils/test/dictionary-prototype-keys.test.ts` (new, dedicated): 9 tests over explicit `../src/*.ts` imports asserting `Object.hasOwn` + `Object.getPrototypeOf` (not only deep equality), JSON-parsed `__proto__` inputs, input non-mutation, callback ordering, duplicate-key overwrite/accumulation.
- Commands/results (serial, exclusive build):
  - Failing-before: `pnpm exec vitest run --config ./vitest.config.ts test/dictionary-prototype-keys.test.ts` (pre-fix source) → 8 failed / 1 passed; `groupBy` threw `TypeError: result[key].push is not a function` (`groupBy.ts:18,29`); `mapKeys` object-valued `__proto__` replaced result prototype (`getPrototypeOf` mismatch); `arrayToRecord`/`mapValues`/`pickBy`/`omitBy`/`toStringRecord` dropped or relocated `__proto__`.
  - After fix, targeted: same command → 1 file / 9 tests passed.
  - V1 `pnpm --filter @web-ts-toolkit/utils test` (repo root) → build ok (CJS/ESM/DTS), 7 files / 30 tests passed (21 pre-existing incl. UTILS-10 harness + 9 new).
  - V2 `pnpm exec eslint "packages/utils/**/*.{ts,js,mts}"` + `git diff --check` → clean.
- Risks: `defineProperty` per key is marginally slower than plain assignment; semantics for normal keys are identical (writable/enumerable/configurable). Null-prototype inputs are not produced — results intentionally keep `Object.prototype`; consumers relying on dropped-`__proto__` behavior will now see an own `__proto__` key.

Kind: defect

Priority: P1, ordinary string keys currently crash grouping or silently corrupt output shape.

Suggested agent: object-boundary implementation agent.

Dependencies: UTILS-10.

Primary ownership: `src/groupBy.ts`, `src/arrayToRecord.ts`, `src/mapKeys.ts`, `src/mapValues.ts`, `src/pickBy.ts`, `src/omitBy.ts`, `src/toStringRecord.ts`; dedicated dictionary regression tests. Coordinate any shared helper with the `_internal.ts` owner; clone fallback is UTILS-04.

Finding and references: `groupBy.ts:12-29` reads inherited values before `.push`; `groupBy(['constructor'], x => x)` throws. `arrayToRecord.ts:2-5` drops `__proto__`. `mapKeys.ts:9-14` can replace its result's prototype when the mapped key is `__proto__` and the value is an object. Analogous plain-object indexed assignment exists in `mapValues.ts:9-14`, `pickBy.ts:9-16`, `omitBy.ts:9-16`, and `toStringRecord.ts:8-13`. Existing `collection-string-utils.test.ts:37-76` and `common-utils.test.ts:19-28` omit special keys. `mapValuesAsync.ts:10` already uses `Object.fromEntries` and is a safe cross-path reference.

Requirements:

1. Preserve arbitrary string keys as own data properties without inherited lookup collisions or prototype replacement. Prefer a consistent, minimal result-construction policy; document any result-prototype contract change.
2. Preserve callback ordering, nullish behavior, and duplicate-key overwrite/group accumulation semantics. Do not blacklist legitimate dictionary data just because path mutation reserves those names.

Acceptance criteria: array and record grouping accept `__proto__`, `constructor`, `prototype`, and `toString`; each affected transform preserves selected own keys from JSON-parsed input, has the intended unchanged result prototype, and does not mutate its input. Regressions assert `Object.hasOwn` and prototypes, not only deep equality.

Verification: V1, V2; regression must fail before the fix on at least grouping and object-valued mapped `__proto__`.

### Task UTILS-02: Stop Writes Through Inherited Containers

Status: completed

Completion evidence:

- Changed files (UTILS-02 only; no UTILS-01/03-11 files, no CHANGELOG):
  - `packages/utils/src/_internal.ts` (`setPath`/`deletePath` only, plus two private helpers mirroring the UTILS-01 own-key policy): traversal reuses only own object-valued properties (`hasOwnKey` guard); otherwise `setPath` creates a new own container (array when the next segment is numeric, plain object otherwise) via `defineOwnValue` (`Object.defineProperty`, writable/enumerable/configurable), and the final write uses `defineOwnValue` so inherited setters are bypassed when shadowing. `deletePath` returns early unless each intermediate segment is an own object-valued property; the final `delete` only removes own properties. Forbidden-segment pre-validation and `set` returning its target are preserved; `getPath`/`hasPath` read inheritance is unchanged.
  - `packages/utils/src/set.ts` (JSDoc only): documents the ownership/shadowing contract above.
  - `packages/utils/test/path-inherited-safety.test.ts` (new, dedicated): 10 tests over explicit `../src/*.ts` imports covering inherited object shadowing, function-valued inherited paths, inherited primitives, inherited-setter bypass (setter call count 0), `deletePath` no-op through inherited containers, `omit`/`pick` alternate paths, normal own/array paths + target identity, no mutation before rejected reserved paths, and preserved inherited reads (`hasPath`/`getPath`).
- Commands/results (serial, exclusive build):
  - Failing-before: `git stash` of `_internal.ts`+`set.ts` then `pnpm exec vitest run --config ./vitest.config.ts test/path-inherited-safety.test.ts` (from `packages/utils`) → 4 failed / 6 passed (ancestor mutation/deletion regressions reproduce).
  - After fix, targeted: same command → 1 file / 10 tests passed.
  - V1 `pnpm --filter @web-ts-toolkit/utils test` (repo root) → build ok (CJS/ESM/DTS), 8 files / 40 tests passed. Note: interim run failed DTS with `TS2322` on the untyped `[] | {}` container; fixed with an explicit `Record` cast, then rebuilt clean.
  - V2 `pnpm exec eslint "packages/utils/**/*.{ts,js,mts}"` + `git diff --check` → clean (one interim `_value` unused-var error in the new test fixed by removing the setter parameter).
  - Client integration `pnpm --filter @web-ts-toolkit/access-router-client test` → 30 files / 425 tests passed + 1 file / 10 tests passed (browser config), no failures.
- New mutation contract (for UTILS-11/release notes): `set`/`setPath` reject `__proto__`/`constructor`/`prototype` segments before any mutation; otherwise they shadow inherited members with new own containers and write own data properties (inherited setters bypassed). `deletePath` (via `omit`) never traverses inherited containers and never removes ancestor state. Own accessors/proxies may still invoke user code — not claimed inert. `get`/`has` inheritance semantics are unchanged.

Kind: defect

Priority: P1, setter ownership boundaries are bypassed without reserved path names.

Suggested agent: path-safety implementation agent.

Dependencies: UTILS-10.

Primary ownership: `_internal.ts` `setPath`/`deletePath`, `set.ts`, path safety tests. Do not alter read inheritance semantics incidentally.

Finding and references: `_internal.ts:108-121` traverses any object-valued `current[key]`, including inherited objects/functions. With `p = {shared:{n:1}}`, `t = Object.create(p)`, `set(t,'shared.n',2)` changes `p.shared.n` and creates no own `shared`. `deletePath` has the analogous traversal at lines 135-146. Existing `path-mutation.test.ts:12-45` covers reserved names only. This demonstrates shared-prototype mutation, not an unconditional global prototype-pollution exploit.

Requirements:

1. Enforce ownership at the shared mutation boundary so inherited containers are never traversed for writing/deleting. Specify whether setter traversal creates an own container or rejects; do not silently mutate the ancestor.
2. Preserve pre-validation of all forbidden segments, normal own-object/array paths, and `set` returning its target. Consider inherited setters when implementing shadowing; do not claim arbitrary accessor/proxy inputs are inert.

Acceptance criteria: custom-prototype object and function-valued inherited paths leave ancestor state unchanged; inherited deletion cannot remove ancestor state; nested and reserved-name cases stay safe. Tests include alternate `pick`/`omit` paths where reachable and no mutation before rejected-path handling.

Verification: V1, V2, plus client package tests at integration. Record the new mutation contract for UTILS-11/release notes.

### Task UTILS-03: Preserve Exact Path Key Identity

Status: completed

Completion evidence:

- Changed files (UTILS-03 only; no CHANGELOG, no other tasks' files):
  - `packages/utils/src/_internal.ts` (`normalizePathPart`/`toPath` + new private `isArrayIndexKey` + `setPath` container decision): string segments are never passed through `Number()` — `'01'` stays `'01'`, digit keys beyond `MAX_SAFE_INTEGER` stay exact strings, quoted digit keys keep literal identity. Explicit numeric segments keep numeric identity. Array-vs-object creation is decided separately by `isArrayIndexKey` (canonical non-negative integer below 2\*\*32 - 1, no leading zeros in string form), so ordinary `fresh[0].name` still creates arrays while `a[01]` creates an own `'01'` object property. Added `toPath` JSDoc specifying the supported dot/bare-bracket/quoted-bracket/segment-array grammar and marking empty quoted keys, escaped quotes, empty dot segments, and malformed brackets as deferred/unspecified.
  - `packages/utils/src/set.ts` (JSDoc only): key-identity note pointing at `toPath`.
  - `packages/utils/src/pick.ts`, `src/omit.ts` (JSDoc only): documents that a flat string array is a LIST of paths (`pick(o, ['a','b'])` picks two keys) and a nested array addresses one segmented path (`pick(o, [['a','b']])`); no behavior change.
  - `packages/utils/test/path-key-identity.test.ts` (new, dedicated): 8 tests over explicit `../src/*.ts` imports covering literal `'01'` vs `'1'`, huge key `'9007199254740993'` vs neighbor, quoted digit keys, equivalent-form round-trips, canonical-index array creation vs leading-zero object creation, pick/omit flat-vs-nested, quoted reserved-segment rejection before mutation, and empty-path read/no-op-mutation.
- Commands/results (serial, exclusive build):
  - Failing-before (pre-fix `dist` probe): `get({'01':'correct','1':'wrong'},['01'])` → `'wrong'`; `get({a:{'01':'q'}},'a["01"]')` → `undefined`.
  - Failing-before (new test vs stashed pre-fix `src/`): 6 failed / 2 passed.
  - After fix, targeted: `pnpm exec vitest run --config ./vitest.config.ts test/path-key-identity.test.ts` (from `packages/utils`) → 1 file / 8 tests passed.
  - V1 `pnpm --filter @web-ts-toolkit/utils test` (repo root) → build ok (CJS/ESM/DTS), 9 files / 48 tests passed.
  - V2 `pnpm exec eslint "packages/utils/**/*.{ts,js,mts}"` + `git diff --check` → clean.
- Changed client grammar assumption (BND-08 mirror, NOT edited — different owner): `packages/access-router-client/src/model.ts:40-51` `toModelPathParts` still converts every `/^\d+$/` token via `Number()`, so it still collides `'01'`→`1` and rounds huge keys; `modelPathRoot` returns `String(parts[0])`, so the dirty root for a leading-zero key (`'1'`) will not match the fixed utils first segment (`'01'`). Follow-up owner must apply the same separate-identity-from-array-decision fix there and add a downstream dirty-root test. Escaped/empty-quoted/malformed grammar investigation bounded to get/set/pick/omit + this mirror; deferred items recorded in the `toPath` JSDoc (no full Lodash grammar).
- Grammar changes recorded for UTILS-11: literal digit-string identity (`'01'` ≠ `'1'`, huge keys exact, quoted digits literal); canonical-index array-creation rule (`'01'` creates object property); pick/omit flat-list vs nested-single-path documentation; reserved segments (including quoted `'__proto__'`) still rejected before any mutation.

Kind: defect

Priority: P1, documented path input types can address the wrong property.

Suggested agent: path-grammar implementation agent.

Dependencies: UTILS-02.

Primary ownership: `_internal.ts` `normalizePathPart`/`toPath`, path accuracy tests; `get.ts`, `set.ts`, `pick.ts`, `omit.ts` only for necessary contracts.

Finding and references: `_internal.ts:21-46` converts every digit string into a Number, even explicit string array segments and quoted keys. Confirmed `get({'01':'correct','1':'wrong'}, ['01']) === 'wrong'`; large decimal keys also risk Number rounding. The grammar additionally does not clearly define empty/escaped quoted keys or malformed paths. `pick.ts:3,10` and `omit.ts:4,10` accept a union where a flat segment array is interpreted as a list of paths. Existing path tests cover neither grammar nor these overload distinctions.

Requirements:

1. Preserve literal property identity, including leading zeros and integers beyond safe precision, while preserving ordinary numeric array creation. Separate key identity from the decision to create an array.
2. Specify supported dot/bracket/segment-array syntax and test it across get/set/pick/omit. Document nested arrays for a single segmented path in pick/omit rather than silently reinterpreting shipped flat path-list behavior.
3. Bound investigation of malformed/escaped/empty keys to these functions and the client BND-08 parser mirror. Record implement/defer decisions; no full Lodash grammar requirement.

Acceptance criteria: literal `'01'`, a decimal beyond `MAX_SAFE_INTEGER`, quoted digit keys, numeric indices, and equivalent supported path forms round-trip without collisions. Reserved segments remain rejected before mutation. Any changed client grammar assumption is documented and tested downstream, not silently duplicated anew.

Verification: V1, V2; serial client tests at integration. Record externally observable grammar changes for UTILS-11.

### Task UTILS-04: Make Clone Fallback And Omit Non-Aliasing

Status: completed

Completion evidence:

- Changed files (UTILS-04 only; no CHANGELOG, no other tasks' files):
  - `packages/utils/src/_internal.ts` (`cloneValue` + new private `cloneInner`/`isExoticRoot`/`exoticTypeError`/`isInheritedPlainLike`/`ownEnumerableKeys`/`copyOwnEnumerableExtras`; `hasOwnKey`/`defineOwnValue` widened to `string | number | symbol`): removed the per-descendant `structuredClone` retry. One memoizing pass clones `Array`/plain/`Date`/`RegExp` (cycles + shared refs preserved via a `Map` set before recursing, so supported graphs never overflow); `Object.create` graphs over plain-object ancestors are cloned with the prototype preserved by reference (UTILS-02 inherited-read coordination; class instances rejected because their prototype `constructor` is not `Object`). Functions and nested exotics (e.g. BSON `ObjectId`, `Map`/`Set`) are opaque by-reference leaves, never traversed. A top-level exotic root throws `TypeError` instead of returning an alias. Own enumerable string/symbol keys are written via `Object.defineProperty` data descriptors (UTILS-01 own-key-safe policy: own `__proto__` never replaces the prototype); accessors are materialized once as data properties; sparse-array holes and extra own props preserved.
  - `packages/utils/src/cloneDeep.ts` (JSDoc only): documents the bounded domain above.
  - `packages/utils/src/omit.ts` (JSDoc + alias guard): documents non-mutation; throws `TypeError` if the clone ever aliases the input, before any `deletePath`, so input-owned state (incl. custom/prototype-bearing objects) is never deleted through an alias.
  - `packages/utils/test/clone-omit-safety.test.ts` (new, dedicated): 12 tests over explicit `../src/*.ts` imports.
- Commands/results (serial, exclusive build):
  - Failing-before (new tests vs pre-fix `src/`): 3 failed / 7 passed — class-instance omit returned the alias (no throw), function-bearing cyclic graph threw `RangeError: Maximum call stack size exceeded` (`_internal.ts:321/338`), top-level `Map`/`Set` did not throw.
  - Interim strict-throw revision broke the downstream consumer: `pnpm --filter @web-ts-toolkit/access-router-client test` → 25 failed with `cloneDeep: unsupported value of type ObjectId` (integration suite stores Mongoose `ObjectId`s in model data). Probed cause: `structuredClone` strips an `ObjectId` to a plain `{i0..i3}` object with a corrupted string form, so per-exotic native cloning is unsound; nested exotics are therefore opaque by-reference leaves. After the refinement: client suite green (see below).
  - After fix, targeted: `pnpm exec vitest run --config ./vitest.config.ts test/clone-omit-safety.test.ts` (from `packages/utils`) → 1 file / 12 tests passed.
  - V1 `pnpm --filter @web-ts-toolkit/utils test` (repo root) → build ok (CJS/ESM/DTS), 10 files / 60 tests passed (incl. pre-existing UTILS-02 inherited-omit test, which passes via the `Object.create` plain-like path).
  - V2 `pnpm exec eslint "packages/utils/**/*.{ts,js,mts}"` + `git diff --check` → clean.
  - V5 integration (recorded, not owned): `pnpm --filter @web-ts-toolkit/access-router-client test` → exit 0, 30 files / 425 tests passed + browser 1 file / 10 tests passed.
- Contract/release-notes info for UTILS-11: supported clone domain = primitives, plain objects (null/`Object.prototype`), `Object.create` graphs over plain ancestors (prototype shared by reference, own keys cloned), arrays, `Date`, `RegExp`; functions + nested exotics (`ObjectId`, `Map`/`Set`, etc.) shared by reference as opaque leaves (Map/Set contents NOT detached — convert explicitly if needed); top-level exotic root throws `TypeError`; `omit` throws before deleting when the input cannot be cloned without aliasing (class-instance omit now throws, original untouched); accessors materialized once, non-enumerables dropped, `__proto__` kept as an own key. Deliberate behavior changes vs pre-fix: (a) exotic roots throw instead of aliasing; (b) nested `ObjectId`s are shared by reference instead of being prototype-stripped by `structuredClone`; (c) `Map`/`Set` nested values are shared, top-level ones throw (previously native-cloned).
- Risks: nested exotic sharing means mutating a shared `ObjectId`/`Map` through the clone affects the input (opaque-leaf semantics); paths addressing _inside_ an exotic (e.g. `omit(doc, ['_id.foo'])`) traverse the shared reference and are unsupported. `cloneDeep(getValue(data, '_id'))`-style top-level exotic clones now throw — no workspace test covers that edge; downstream callers passing exotic roots directly must handle `TypeError`.

Kind: defect

Priority: P1, omit can delete from its input and clone fallback overflows on cyclic data.

Suggested agent: deep-object implementation agent.

Dependencies: UTILS-03.

Primary ownership: `_internal.ts` `cloneValue`, `cloneDeep.ts`, `omit.ts`, dedicated clone/omit tests.

Finding and references: `_internal.ts:240-272` retries `structuredClone` recursively, lacks fallback cycle memoization, and returns unsupported objects unchanged. A cyclic plain object containing a function overflows after structured cloning rejects it. A class instance with an own function property falls back to the original instance; `omit(instance,'keep')` then returns that same instance and deletes `keep` from the input (`omit.ts:9-12`). Plain fallback assignment at `_internal.ts:262-266` also needs own-key-safe handling. Existing path tests exercise only cloneable plain objects; there are no dedicated clone tests.

Requirements:

1. Guarantee omit never deletes from input-owned state, including unsupported/custom objects. Choose and document a bounded supported clone domain; reject unsupported destructive cases explicitly rather than returning an alias that omit mutates.
2. Preserve cycles and repeated references for supported graphs, or reject unsupported graphs deterministically without stack overflow. Avoid retrying failed native cloning for every descendant. Define functions, class instances, Map/Set, symbols, and accessors deliberately rather than promising universal cloning.
3. Preserve safe own keys and coordinate the dictionary policy with UTILS-01. Avoid a blanket replacement with structuredClone alone because function-bearing values currently reach fallback.

Acceptance criteria: regression for the class-instance omit example proves the original property remains; cyclic/function-bearing inputs have the documented outcome without RangeError; supported shared references remain shared within the clone but detached from originals; nested omitted values cannot mutate inputs; plain arrays, Date, and RegExp retain documented behavior.

Verification: V1, V2; client snapshot/reset/save tests via V5. Release notes must identify unsupported-type or cloning behavior changes.

### Task UTILS-05: Correct Deep Equality And Matching Boundaries

Status: completed

Completion evidence:

- Changed files (UTILS-05 only; no CHANGELOG, no other tasks' files):
  - `packages/utils/src/_internal.ts` (`deepEqual`/`partialMatch` only, plus new private `deepEqualInner`/`partialMatchInner`/`isComparableObject`/`isExtraArrayKey`/pair-stack helpers; reuses UTILS-04 `isPlainObject`/`isInheritedPlainLike`/`ownEnumerableKeys`/`hasOwnKey`): supported comparison domain aligned with the UTILS-04 clone domain. Primitives via `SameValueZero` (`NaN` equals itself); `Date` by `getTime()` (invalid dates equal; `Date` vs non-`Date` is false); `RegExp` by source+flags; arrays by length + per-index own-presence (holes distinguished from explicit `undefined`) + extra own string/symbol keys; plain-like objects (plain + `Object.create`-over-plain graphs) by own enumerable string/symbol keys only — inherited properties ignored via `hasOwnKey` (replaces the old `in` check), prototypes not compared. Functions and exotic objects (`Map`/`Set`, class instances, etc.) use conservative identity semantics: distinct references are never equal, so zero-key objects no longer compare equal. Cyclic/repeated-ref supported graphs terminate via pair-aware `Map<object, Set<unknown>>` bookkeeping (coinductive stack step; aliasing shape not required to match, only content). `partialMatch` preserves ordinary partial matching and prefix array semantics, but a source key (including `undefined`-valued or symbol keys) now requires an own key on `object`, so `isMatch({}, {a:undefined})` is false; `Date`/`RegExp`/primitive/function/exotic sources fall back to `deepEqual`.
  - `packages/utils/src/isEqual.ts`, `src/isMatch.ts` (JSDoc only): bounded-domain contract notes pointing at `_internal.ts`.
  - `packages/utils/test/equality-matching.test.ts` (new, dedicated): 18 tests over explicit `../src/*.ts` imports covering unequal/identical-content Maps, distinct/same functions, Date-vs-`{}` + Date/RegExp value cases, NaN (incl. nested), dirty-relevant nested diffs, self/cross cycles (equal + differing), repeated-ref content comparison, own-vs-inherited keys, symbol keys, holes vs `undefined`, extra array keys, array-vs-object, class-instance identity, `isMatch` absence-vs-`undefined`, ordinary/nested partial preservation, inherited-key rejection, array prefix + hole/`undefined` semantics, Date/opaque-source fallback, cyclic patterns.
- Commands/results (serial, exclusive build):
  - Failing-before (new tests vs stashed pre-fix `src/`): 14 failed / 4 passed.
  - After fix, targeted: `pnpm exec vitest run --config ./vitest.config.ts test/equality-matching.test.ts` (from `packages/utils`) → 1 file / 18 tests passed.
  - V1 `pnpm --filter @web-ts-toolkit/utils test` (repo root) → build ok (CJS/ESM/DTS), 11 files / 78 tests passed.
  - V2 `pnpm exec eslint "packages/utils/**/*.{ts,js,mts}"` + `git diff --check` → clean.
  - V5 `pnpm --filter @web-ts-toolkit/access-router-client test` → exit 0, 30 files / 425 tests passed + browser 1 file / 10 tests passed.
- Contract/release-notes info for UTILS-11: comparison domain = primitives, plain-like objects (own keys only; inherited ignored, prototypes not compared), arrays (length + holes + extras), `Date`, `RegExp`; functions + exotics identity-only (distinct `Map`s never equal even with identical contents; nested exotic reference swaps are always detected as differences, never suppressed). `isMatch` now requires own-key presence (absence ≠ `undefined`; inherited never satisfies); empty source still vacuously matches. Deliberate behavior changes vs pre-fix: (a) `isEqual(new Map(...), new Map(...))` false unless same reference; (b) distinct functions unequal; (c) cyclic comparisons terminate instead of `RangeError`; (d) `isMatch({}, {a:undefined})` false; (e) inherited values no longer satisfy own-key equality/matching; (f) symbols, holes, and extra array keys participate. Null-prototype vs `Object.prototype` objects with equal own keys compare equal (prototypes ignored).
- Risks: nested-exotic identity semantics mean two separately built but content-identical `Map`s always read dirty (fail-safe direction for change detection; may over-report vs a deep-content policy). Ignoring prototypes/inherited state means objects differing only in ancestry compare equal — consistent with the UTILS-04 clone (own keys only, prototype shared by reference).

Kind: defect

Priority: P1, false equality can suppress dirty-state changes and distinct cyclic values crash comparisons.

Suggested agent: equality implementation agent.

Dependencies: UTILS-04.

Primary ownership: `_internal.ts` `deepEqual`/`partialMatch`, `isEqual.ts`, `isMatch.ts`, dedicated comparison tests.

Finding and references: `_internal.ts:275-319` falls through to enumerable keys for arbitrary objects/functions, so unequal Maps and separate functions compare equal; two distinct cyclic plain objects recurse to RangeError. `_internal.ts:314` allows inherited matches against own left keys. `partialMatch` at lines 341-350 compares a missing property as undefined, so `isMatch({}, {a:undefined})` is true. No dedicated equality/matching tests exist. Client `model.ts:253,268,545` uses equality for concurrent change detection and dirty tracking.

Requirements:

1. Establish a supported comparison domain aligned with UTILS-04. Distinct functions and unsupported opaque instances must not accidentally compare equal because they have zero enumerable keys. Implement explicit supported built-in comparison or conservative identity semantics, with documentation.
2. Handle cyclic supported graphs with pair-aware bookkeeping. Specify own-key, symbol, prototype, missing-versus-undefined, and partial-array semantics; preserve existing ordinary partial matching unless intentionally changed.
3. Add meaningful incompatible-type cases (for example Date versus empty object), nested data, NaN, and repeated-reference graphs, without claiming a universal serialization equivalence relation.

Acceptance criteria: unequal Map contents are not equal under the chosen policy; distinct functions are unequal; cyclic comparisons terminate with documented results; own-key mismatch is not hidden by inherited properties; matching distinguishes absence where required by the new contract. Runtime and regression evidence demonstrates dirty-state-relevant differences are not discarded.

Verification: V1, V2; V5 must include dependent client tests. Record comparison contract/release changes.

### Task UTILS-06: Flatten Wide And Deep Arrays Without Argument Overflow

Status: completed

Completion evidence:

- Changed files (UTILS-06 only; no CHANGELOG, no other tasks' files):
  - `packages/utils/src/flattenDeep.ts` (only implementation file touched): replaced recursive `result.push(...flattenDeep(value))` with an explicit frame-stack loop (`{ values, index }` frames + one-at-a-time `push`), preserving the `flattenDeep<T>(array: unknown[]): T[]` signature for UTILS-09. Left-to-right order and leaf behavior preserved (non-array values appended as-is; holes read as `undefined`; non-array input returns `[]`; no size limits). Cycle policy: an array already on the current ancestor chain throws `TypeError: flattenDeep: cyclic array reference is not supported`; a shared subarray that is not an ancestor flattens once per occurrence. JSDoc documents the iterative guarantee, leaf/sparse semantics, and the cycle-vs-repeated-subarray distinction.
  - `packages/utils/test/flatten-wide-deep.test.ts` (new, dedicated): 9 tests over explicit `../src/flattenDeep.ts` imports covering non-array input, ordering, the 150,000-leaf case, a 100,000-deep nesting fixture, repeated shared subarrays, direct/indirect cycles, empty/sparse behavior, and input non-mutation.
- Commands/results (serial, exclusive build):
  - Failing-before (pre-fix `src/` via Node type-stripping import): `flattenDeep([Array(150000).fill(1)])` → `RangeError: Maximum call stack size exceeded`; 20,000-deep nesting → same `RangeError`.
  - After fix, targeted: `pnpm exec vitest run --config ./vitest.config.ts test/flatten-wide-deep.test.ts` (from `packages/utils`) → 1 file / 9 tests passed.
  - V1 `pnpm --filter @web-ts-toolkit/utils test` (repo root) → build ok (CJS/ESM/DTS), 12 files / 87 tests passed.
  - V2 `pnpm exec eslint "packages/utils/**/*.{ts,js,mts}"` + `git diff --check` → clean (one interim `no-sparse-arrays` error in the new test fixed by building holes via `delete` instead of a sparse literal).
- Bounded time/memory observations (acceptance fixtures, post-fix source, Node v26.7.0; not speedup claims): 150,000-leaf case → length 150000 in order, ~9ms, heap ~12.1 MiB; 100,000-deep single-leaf nesting → `[1]`, ~27ms, heap ~24.7 MiB; repeated subarrays `[sub, sub]` → repeated leaves; self-cycle and indirect (a→b→a) cycles → `TypeError`.
- Risks: cycle rejection is a deliberate new `TypeError` where the old code recursed until `RangeError`; callers relying on `RangeError` (or on accidental termination) must handle `TypeError`. Deep inputs hold one small frame per nesting level on the heap (~100k frames measured fine); adversarial depth in the millions would grow heap proportionally — no limit is imposed per the contract decision.

Kind: defect

Priority: P1, a valid modestly sized nested array throws instead of flattening.

Suggested agent: collection implementation agent.

Dependencies: UTILS-10.

Primary ownership: `src/flattenDeep.ts`, focused flatten tests.

Finding and references: `flattenDeep.ts:7-10` recursively spreads complete child results into `push`. Confirmed `flattenDeep([Array(150000).fill(1)])` throws RangeError on the review runtime despite only one nested level. Deep nesting and cycles are also unguarded; existing tests do not exercise flattenDeep.

Requirements: avoid unbounded argument spread and call-stack recursion; preserve left-to-right ordering and current leaf behavior. Define cyclic-array handling (controlled rejection is acceptable), distinguishing legitimate repeated subarrays from cycles. Do not add arbitrary size limits without a contract decision.

Acceptance criteria: the 150,000-leaf case and a deeply nested fixture finish in order without RangeError; repeated subarrays produce repeated leaves; cyclic arrays terminate predictably; empty and sparse-array behavior is documented/tested. Record bounded time/memory observations, not unsupported speedup claims.

Verification: V1, V2. UTILS-09 owns final inferred public return types.

### Task UTILS-07: Define A Reliable Async Adapter Contract

Status: completed

Completion evidence:

- Changed files (UTILS-07 only; no CHANGELOG, no public signature changes):
  - `packages/utils/src/toAsyncFn.ts` (JSDoc only): documents the locked current contract — sync throws escape synchronously, thenables returned unchanged with identity preserved, absent/null fn resolves `defaultValue`, `this` forwarded via `apply`; lossy declaration handed to UTILS-09.
  - `packages/utils/src/isPromise.ts` (JSDoc only): thenable check (callable `then`), cross-realm thenables accepted, throwing `then` accessor propagates.
  - `packages/utils/src/mapValuesAsync.ts` (JSDoc only): eager unbounded parallelism via `Promise.all`, single rejection rejects all, no cancellation/scheduler; concurrency option deferred.
  - `packages/utils/test/async-adapter-contract.test.ts` (new, dedicated): 11 tests over explicit `../src/*.ts` imports locking the behavior above.
- Caller inspection (repo-wide grep): no workspace TypeScript call sites for `toAsyncFn` or `mapValuesAsync`. `isPromise` callers: `packages/express-response-handler/src/create-handler.ts:408` (follows with `Promise.resolve(result).then`, safe under either contract) and `packages/access-router/src/helpers/document.ts:53` (`populateDoc` returns the thenable unchanged, relies on identity preservation).
- Dist evidence (fresh build): `dist/index.d.ts:250` shows `=> PromiseLike<unknown> | Promise<any>` (lossy, handed to UTILS-09).
- Runtime evidence (Node v26.7.0 vs fresh `dist/index.mjs`): sync success → native Promise; sync throw → synchronous throw; native rejection → rejection; custom thenable → same identity, not a Promise, awaits to value; throwing `then` accessor → sync throw; absent/null fn → `Promise.resolve(default)`; `this` forwarded; `mapValuesAsync` 4-key case → maxActive 4 (unbounded), sync throw → rejection, one-key rejection → rejection, `{}` → `{}` without callback.
- Decision matrix (investigator decision, coordinator review required):
  - `toAsyncFn` sync-throw→rejection + thenable→native-Promise normalization: DEFER as fully specified follow-up (`return Promise.resolve().then(() => fn.apply(this, args))` with declared return `Promise<Awaited<TResult>>`), compat impact = breaks thenable identity relied on by `populateDoc`-style pass-through + changes sync-throw callers; NO maintainer approval on file → docs-only now, no silent redesign.
  - `mapValuesAsync` opt-in concurrency limit: DEFER (no caller need; unbounded documented); no cancellation/schedulers per task bounds.
  - Disposition: docs + tests only (no-action on behavior); implement options recorded above as specified follow-ups.
- Commands/results (serial, exclusive build):
  - Targeted `pnpm exec vitest run --config ./vitest.config.ts test/async-adapter-contract.test.ts` (from `packages/utils`) → 1 file / 11 tests passed.
  - V1 `pnpm --filter @web-ts-toolkit/utils test` (repo root) → build ok (CJS/ESM/DTS), 13 files / 98 tests passed.
  - V2 `pnpm exec eslint "packages/utils/**/*.{ts,js,mts}"` + `git diff --check` → clean.
- Risks: sync throws still escape `toAsyncFn` callers expecting rejections; thenable identity means `instanceof Promise` is false on adapted thenables; `mapValuesAsync` can fan out unboundedly on large objects — callers with throttling needs must chunk or await the follow-up option.

Kind: investigation

Priority: P2, the name implies an async boundary but current error/return semantics differ from an async function.

Suggested agent: async-contract investigation agent.

Dependencies: UTILS-10.

Primary ownership: `src/toAsyncFn.ts`, `src/isPromise.ts`, `src/mapValuesAsync.ts`, focused async evidence/tests; task-file decision notes. Coordinate public signature edits with UTILS-09.

Finding and references: `toAsyncFn.ts:9-11` calls the wrapped function before promise creation, so throws escape synchronously; it returns arbitrary thenables unchanged. `dist/index.d.ts:112` exposes `PromiseLike<unknown> | Promise<any>` rather than the inferred result type. `mapValuesAsync.ts:5-8` eagerly starts every callback with Promise.all; no concurrency limit or cancellation contract exists. No inspected workspace TypeScript call sites for `toAsyncFn` were found; these are not established remote availability defects.

Requirements:

1. Inspect repository callers and document whether toAsyncFn promises a real Promise/rejection boundary or intentionally preserves thenable identity and synchronous throws. Recommend a minimal implementation change or documentation-only outcome; obtain maintainer approval if compatibility requirements make the decision ambiguous.
2. Define behavior for synchronous success/throw, native rejection, custom thenables, throwing `then` accessors, absent function/default, and `this` forwarding. Hand the chosen return type to UTILS-09.
3. Bound the mapValuesAsync concurrency investigation to current callers and one controlled active-callback-count experiment. Decide whether documented unbounded parallelism suffices or a separate opt-in concurrency feature is justified. Do not add cancellation/schedulers speculatively.

Acceptance criteria: evidence-backed decision matrix with compatibility impact and implement/defer/no-action disposition; tests for current or approved new behavior; any newly needed implementation is recorded as a fully specified follow-up before this investigation completes. No silent behavioral redesign is required to finish the investigation.

Verification: V1 for added tests, V2; explicit written decision reviewed by the coordinator. Missing maintainer decision means blocked, not guessed.

### Task UTILS-08: Remove Repeated Intersection Work With Measured Evidence

Status: completed

Completion evidence:

- Changed files (UTILS-08 only; no CHANGELOG, no other tasks' files):
  - `packages/utils/src/intersectionBy.ts` (JSDoc + rewrite): secondary projections precomputed once per invocation into `Set`s; `seen` dedup via `Set`; callback invoked once per element per input array. Documents the intentional callback-count change (no side-effect preservation) and the preserved nullish ignore-policy.
  - `packages/utils/src/_internal.ts` (`baseUniq` only): linear `arrayIncludes` scan replaced with `Set` membership (SameValueZero-compatible per UTILS-05: NaN equals NaN, +0/-0 equal, objects by reference). `arrayIncludes` kept exported for compatibility. No UTILS-02..05 behavior touched.
  - `packages/utils/src/uniqBy.ts` (JSDoc + `seen` Set): same SameValueZero preservation; iteratee still once per element.
  - `packages/utils/src/difference.ts` (JSDoc + exclusion `Set`): precomputed once; non-array values ignored (preserved).
  - `packages/utils/src/intersection.ts` (JSDoc + secondary `Set`s): precomputed once; non-array secondary empties result (preserved).
  - `packages/utils/test/intersection-performance.test.ts` (new, dedicated): 11 tests over explicit `../src/*.ts` imports covering callback-count proportionality (100x100, 3-array, duplicate-candidate), duplicates, object-key reference semantics, NaN/signed zero, empty/nullish, multiple arrays, property-path iteratee, non-mutation/fresh arrays. No timing-threshold assertions.
- Parity decision (explicit, not assumed): `intersectionBy`/`difference` ignore non-array values arguments (`intersectionBy([1,2], null, fn)` → `[1,2]`; `difference([1,2], null)` → `[1,2]`), while `intersection` treats any non-array secondary as empty (`intersection([1,2], null)` → `[]`). Preserved as-is and documented in JSDoc + tests; unification deferred to UTILS-11 (breaking-change risk, needs maintainer approval).
- Callback-count change recorded: 100-by-100 identical arrays invoked the iteratee 10,100 times before (100 first + 100×100 secondary re-maps) vs 200 times after (100 + 100); 1000-by-1000 was 1,001,000 calls before vs 2,000 after. Redundant side effects are not preserved by design.
- Before-after measurements (repeatable workloads, Node v26.7.0, fresh `dist/index.mjs`, ms per run, no threshold assertions):
  - BEFORE: `intersectionBy` 100x100 → 10,100 calls; 1k-identical → 1,001,000 calls, ~248/248/257ms (3 runs); 8k-identical → unmeasurable (timed out >120s, quadratic blowup). `uniq` 8k uniques → ~15.65/12.74/9.43/11.54/14.26ms; `uniqBy` 8k → ~34.64/28.67/26.77/146.61/133.94ms; `difference` 8k-4k → ~14.72/14.13/12.68/13.32/13.76ms; `intersection` 8k-disjoint → ~29.91/31.16/27.69/25.30/25.35ms; `intersection` 8k-identical → ~33.50/35.13/32.07/28.30/29.53ms.
  - AFTER: `intersectionBy` 100x100 → 200 calls; 1k-identical → 2,000 calls, ~1.01ms; 8k-identical → 16,000 calls, ~7.94ms. `uniq` 8k → ~1.47/4.70/0.85/0.40/0.75ms; `uniqBy` 8k → ~0.93/0.85/0.76/1.55/0.43ms; `difference` 8k-4k → ~0.81/0.71/0.52/1.34/0.56ms; `intersection` 8k-disjoint → ~1.73/1.28/1.34/0.92/0.73ms; `intersection` 8k-identical → ~0.67/0.72/1.34/0.81/1.51ms. Adjacent `baseUniq`/`uniqBy`/`difference`/`intersection` Set optimizations justified by these measurements; no other collection rewrites made.
- Commands/results (serial, exclusive build):
  - Targeted `pnpm exec vitest run --config ./vitest.config.ts test/intersection-performance.test.ts` (from `packages/utils`) → 1 file / 11 tests passed.
  - V1 `pnpm --filter @web-ts-toolkit/utils test` (repo root) → build ok (CJS/ESM/DTS), 14 files / 109 tests passed.
  - V2 `pnpm exec eslint "packages/utils/**/*.{ts,js,mts}"` + `git diff --check` → clean.
- Risks: `Set` membership is SameValueZero (matches `sameValueZero`), but callers relying on the old 10,100-call side-effect pattern will observe fewer calls. Nullish parity split preserved intentionally (see above). `orderBy`/`reduce` left untouched per deferred scope (unmeasured).
- Deferred: unifying `intersection` strict-empty vs `intersectionBy`/`difference` ignore-policy (UTILS-11); any further collection micro-optimizations without measurement.

Kind: improvement

Priority: P2, repeated mapping and quadratic deduplication impose avoidable cost on ordinary collections.

Suggested agent: collection-performance agent.

Dependencies: UTILS-05.

Primary ownership: `src/intersectionBy.ts`, `_internal.ts` `baseUniq`/membership helpers as justified, `src/uniqBy.ts`, `src/difference.ts`, `src/intersection.ts`, performance/semantic tests. Avoid unrelated collection rewrites.

Finding and references: `intersectionBy.ts:18-28` maps and deduplicates every secondary array for every candidate in the first array. A 100-element pair of unique identical arrays causes 10,100 callback invocations. `baseUniq` at `_internal.ts:153-172`, `uniqBy.ts:13-18`, and `difference.ts:8-9` use repeated linear membership scans. The intersection routine also drops non-array arguments while `intersection.ts:10` treats a null secondary array as empty; contract parity must be decided, not assumed.

Requirements: precompute secondary projection/membership data once per invocation and use SameValueZero-compatible sets where appropriate. Preserve first-occurrence ordering, object reference semantics, NaN/zero handling, input non-mutation, and chosen nullish semantics. Record that callback invocation count changes; do not promise preservation of side effects from redundant callback evaluation. Optimize adjacent helpers only when measurement justifies it.

Acceptance criteria: deterministic callback-count regression demonstrates work proportional to input elements for intersection projection; semantic tests cover duplicates, object keys, NaN, signed zero, empty/nullish inputs, and multiple arrays. Record repeatable small/large before-after measurements with workload/runtime and no timing-threshold assertions in ordinary CI. Defer unproven adjacent optimizations explicitly.

Verification: V1, V2 plus benchmark/count evidence. No wall-clock baseline was measured during review.

### Task UTILS-09: Make Public Narrowing And Generic Results Sound

Status: completed

Completion evidence:

- Changed files (UTILS-09 only; no CHANGELOG, no other tasks' files):
  - `packages/utils/src/isBoolean.ts`, `src/isNumber.ts`, `src/isString.ts` (implementation + JSDoc): primitive-only predicates via `typeof` (boxed `instanceof` acceptance removed). Decision: primitive-only, not boxed-inclusive — no workspace source/test constructs boxed primitives (repo-wide grep for `new Boolean|new Number|new String` is empty), all inspected downstream callers (`access-router` `service.ts`/`core.ts`/`middleware.ts`/`runtime.ts`/`query.ts`) consume narrowed values as primitives, and the UTILS-05 comparison domain already treats boxed values as opaque identity objects. Contract change for release notes/UTILS-11: `isBoolean(new Boolean(false))` etc. now return `false` (previously `true`); use explicit `instanceof` when boxed instances are intended.
  - `packages/utils/src/map.ts` (overloads only): new `map<T, K extends keyof T>(readonly T[] | null | undefined, K): Array<T[K]>` overload for known-key shorthand (`map(users, 'name')` → `string[]`); deeper paths fall through to the generic overload as honest `unknown[]` (no path-type machinery).
  - `packages/utils/src/intersectionBy.ts` (overloads + module-level `IntersectionByIteratee<T>` alias only, not added to the index surface; UTILS-08 implementation untouched): result element type inferred from the first array, iteratee excluded from inference via `NoInfer`, nullish secondaries accepted in the type per the documented ignore-policy.
  - `packages/utils/src/flattenDeep.ts` (signature + JSDoc only; UTILS-06 implementation untouched): `flattenDeep<T = unknown>(array: unknown): T[]` — input widened to `unknown` (non-array yields `[]` at runtime, previously a type error), `T` documented as an unchecked caller assertion with an explicit deferral rationale (recursive `FlatArray`-style inference deferred: arbitrary depth cap, unsound for non-array input).
  - `packages/utils/src/reduce.ts` (overloads + one local assertion; behavior untouched): separate with-initial (`(coll, fn, acc: TResult): TResult`) and without-initial (`(coll, fn): T`, first element seeds) overloads for arrays and records; impl uses a control-flow `as TResult` with comment (empty input without initial throws, so the accumulator is definitely assigned).
  - `packages/utils/src/toAsyncFn.ts` (overloads + JSDoc only; UTILS-07 docs-only decision preserved): present-`fn` overload returns `(this, ...args) => Promise<Awaited<TResult>> | PromiseLike<TResult>` (truthful thenable pass-through, never a bare value; sync throw stays documented, not typed); absent-`fn` overload returns `(...args) => Promise<TResult | undefined>`. The lossy `PromiseLike<unknown> | Promise<any>` declaration is gone (verified absent from emitted `dist/index.d.ts`).
  - `packages/utils/src/eachRight.ts`, `src/forEach.ts` (Record-view indexing), `src/orderBy.ts` (variance cast mirroring the `map`/`sumBy` precedent): strict-gate fixes, behavior identical. `src/hasOwn.ts` needed no code change (ES2022 lib).
  - `packages/utils/src/index.ts`: added `export type { PropertyPath } from './_internal'` (type-only; runtime 58-name surface unchanged, `root-api.test.ts` unaffected). `intersection`/`difference` already infer element types and were left alone.
  - `packages/utils/tsconfig.json`: `strict: true`, `target`/`lib` `ES2022` (runtime-appropriate for Node `>=22`; `Object.hasOwn` types), `skipLibCheck: false`. No global suppressions, no workspace alias changes.
  - `packages/utils/test/primitive-guard-narrowing.test.ts` (new, dedicated): 4 runtime tests over explicit `../src/*.ts` imports (primitives accepted, boxed rejected incl. the truthy-`new Boolean(false)` hazard, unrelated types rejected).
  - `packages/utils/test/types/strict-contracts.ts` (new, dedicated single-source fixture, never executed): strict positives + `@ts-expect-error` negatives for boxed guards (incl. `Boolean`/`Number`/`String` prototype probes proving wrapper ≠ primitive), callback/property/deep-path map, intersectionBy (first-array inference, `NoInfer` iteratee, nullish secondary), flattenDeep (explicit assertion vs `unknown` default, non-array input), reduce with/without initial (both mismatches rejected), approved async contract (bare-value return rejected, absent-fn default), and the `PropertyPath` export.
  - `packages/utils/test/strict-signatures.test.ts` (new, dedicated): V3 source gate + source fixture `tsc` checks, and V4 packed checks reusing the real release transformer — fixture rewritten to package-name imports and checked under strict NodeNext (`.mts` import condition + `.cts` require condition) and Bundler (`.ts`) with `skipLibCheck: false`, plus ESM/CJS runtime smokes (boxed rejection, shorthand inference paths, `reduce` empty-throw, thenable identity, default resolution, path helpers). Own `utils-ut09-*` temp dirs, cleaned in `afterAll`.
- Commands/results (serial, exclusive build):
  - Strict baseline before: 6 diagnostics (`eachRight`/`forEach` indexing, `Object.hasOwn` lib, `orderBy` variance, `reduce` accumulator x2). After: `pnpm exec tsc --noEmit -p packages/utils/tsconfig.json --strict` → 0 diagnostics.
  - Targeted: `primitive-guard-narrowing.test.ts` → 4 passed; `strict-signatures.test.ts` → 3 passed (V3 gate, V3 fixture, V4 packed).
  - V1 `pnpm --filter @web-ts-toolkit/utils test` (repo root) → build ok (CJS/ESM/DTS), 16 files / 116 tests passed (was 14 / 109).
  - V2 `pnpm exec eslint "packages/utils/**/*.{ts,js,mts}"` + `git diff --check` → clean (one interim unused-disable warning removed).
  - V4 (inside `strict-signatures.test.ts`): real-transformer pack → `/tmp` install (no source aliases) → ESM + CJS runtime pass, strict NodeNext + Bundler `tsc` pass with `skipLibCheck: false`; every `@ts-expect-error` in the installed fixture consumed (unused-directive rejection proves negatives real under both declaration conditions).
  - Downstream sanity (not owned, V5 belongs to UTILS-12): `access-router` and `access-router-client` `tsup` builds pass; `access-router` project-wide `tsc --noEmit` was already red before this task (pre-existing `http-errors` errors), unchanged in kind.
- Deferred with rationale (for UTILS-11 docs): fully inferred recursive flatten result (`FlatArray`-style) — needs an arbitrary depth cap and cannot stay sound for non-array inputs; fallback is the explicit `flattenDeep<T>(...)` assertion over an `unknown[]` default. Deep property-path value inference for `map`/`get` — speculative path-type machinery, out of scope; `unknown[]`/`unknown` fallbacks stay honest. `mapValuesAsync`/concurrency and `toAsyncFn` sync-throw normalization remain UTILS-07 deferred follow-ups; types describe current behavior only.
- Contract/release-notes info for UTILS-11: (a) guards reject boxed instances (breaking for anyone passing `new Boolean/Number/String`); (b) `flattenDeep` parameter widened `unknown[]` → `unknown` (accepts more; non-array yields `[]`); (c) `reduce` 2-arg calls now resolve to element-typed overloads (previously ambiguous `TResult`); callers relying on the unsound no-initial cross-type form must pass an initial value; (d) `toAsyncFn` return type changed from `PromiseLike<unknown> | Promise<any>` to the truthful overloads; (e) new named type export `PropertyPath` from the index (type-only); `IntersectionByIteratee` stays module-local to the emitted declarations; (f) `map` array key-shorthand now infers `T[K]`, deep paths yield `unknown[]`.
- Risks: downstream source typechecks (non-strict, already red for unrelated reasons) may surface new `reduce`/`flattenDeep` inference notes; `tsup` builds do not typecheck and are unaffected (verified). Boxed-acceptance removal is intentional and covered by runtime + type tests.

Kind: defect

Priority: P1, guards claim primitives for boxed objects and generated async types lose the result contract.

Suggested agent: TypeScript public-API agent.

Dependencies: UTILS-01, UTILS-03, UTILS-04, UTILS-05, UTILS-06, UTILS-07, UTILS-08.

Primary ownership: `src/isBoolean.ts`, `src/isNumber.ts`, `src/isString.ts`, public function signatures, `src/index.ts` type re-exports if justified, `tsconfig.json`, dedicated strict source/consumer fixtures. Coordinate behavior owners rather than rewriting their implementations.

Finding and references: all three primitive guards (lines 1-2) accept boxed instances but narrow to primitive types. For example `new Boolean(false)` passes `isBoolean` yet remains a truthy object, not primitive false. Emitted declarations at `dist/index.d.ts:24,39,73,99-100,112` show uninferred flatten/intersection results, map shorthand results without property-derived inference, reduce overload ambiguity, and lossy toAsyncFn results. `PropertyPath` is used publicly but not exported (`src/index.ts`); determine whether a named export is useful, not mandatory. `tsconfig.json:4-12` disables strictness and targets an older library than `Object.hasOwn` requires. The strict baseline failures are listed above.

Requirements:

1. Choose primitive-only predicates or honest boxed-inclusive predicates based on supported behavior; never narrow boxed objects to primitives. Treat changed boxed acceptance as an external contract change.
2. Add useful inference for the highest-value APIs without speculative complex path-type machinery. Keep unchecked generic assertions distinguishable from validated results, preserve undefined where it can occur, and give the approved async adapter an explicit truthful result type.
3. Establish a passing strict no-emit source gate with runtime-appropriate library settings and strict installed-declaration fixtures. Do not suppress diagnostics globally, turn on skipLibCheck to hide them, or rewrite root workspace aliases as a workaround.

Acceptance criteria: strict positive/negative consumer examples cover boxed guards, callback/property map, intersectionBy, flattenDeep, reduce with/without initial value, and the approved async contract; incorrect assignments fail using checked expectation directives. V3 passes, inferred results are useful, and both declaration conditions resolve in V4. If broader inference is deliberately deferred, explain the supported fallback explicitly.

Verification: V1-V4. Release notes and UTILS-11 describe changed guards/signatures.

### Task UTILS-10: Establish Source And Installed-Package Test Boundaries

Status: completed

Completion evidence:

- Changed files (UTILS-10 only; no behavior-helper `src/*` edits, no other tasks' files):
  - `packages/utils/vitest.config.ts` (new): scoped resolver config listing `.ts`/`.mts` before `.js` so extensionless `../src/*` imports in the three pre-existing test files resolve to TypeScript source, not ignored compiled `.js` siblings. No unrelated generated files deleted; source verification stays no-emit.
  - `packages/utils/package.json`: test script now uses `./vitest.config.ts` (scoped config) instead of `../../vitest.config.ts`. No other script/manifest changes.
  - `packages/utils/test/source-resolution.test.ts` (new, dedicated): proves TS execution — `import.meta.url` contains the `.ts` test path, and extensionless vs explicit-`.ts` specifiers (`../src/hasOwn`, `../src/omit`, `../src/index`) resolve to identical module instances (`toBe` identity would fail if one side hit a stale `.js` sibling).
  - `packages/utils/test/root-api.test.ts` (new, dedicated): source root-export smoke over explicit `../src/index.ts` — exact 58-name export surface, no default export, all functions, plus runtime spot checks (get/set/hasOwn/groupBy/cloneDeep/isEqual/flattenDeep/sum).
  - `packages/utils/test/utils.packed-consumer.test.ts` (new, dedicated): utils-owned release-transformed packed-consumer fixture reusing the proven `http-errors` approach (real `createPublishPackageJson` from `@repo-toolkit/publish-package` resolved via `@repo-toolkit/release-artifact`; no duplicated release infrastructure). Covers: staged-manifest round-trip with production-transformer-determined expectations (version/license/repository/files/main/module/types/exports/sideEffects, no `PLACEHOLDER`/`workspace:`), exact packed file allowlist (LICENSE, README.md, four dist outputs, package.json) with no `src/`/`test/`/`.map` leakage, shipped README containing `from '@web-ts-toolkit/utils'`, and a fresh `/tmp` consumer using named package imports only (no source aliases) across real ESM (`./index.mjs`) + CJS (`./index.js`) runtime and strict NodeNext (`.mts` import + `.cts` require conditions) + Bundler typechecks with `skipLibCheck: false`. Installed-tree assertions recheck version, emitted files, no `src/`/`test/`, and README. Broad inference assertions left to UTILS-09 (one `@ts-expect-error` bad-import proves declarations are really checked). Cleans only its own temp dirs (`afterAll` `rmSync` of locally created roots).
- Commands/results (serial, repo root unless noted):
  - `pnpm --filter @web-ts-toolkit/utils test` (V1+V4): build ok (CJS/ESM/DTS), 6 test files / 21 tests passed (13 pre-existing + 3 resolution + 2 root-api + 3 packed-consumer).
  - `pnpm exec eslint "packages/utils/**/*.{ts,js,mts}"` + `git diff --check` (V2): clean.
  - Targeted pre-check from `packages/utils`: 5 files / 18 tests passed under the new scoped config.
  - Post-run `/tmp/utils-ut10-*`: no leftover temp dirs (harness cleans only its own files).
- Failing-before / risk evidence:
  - `node -e require.resolve('.../packages/utils/src/hasOwn')` returns `src/hasOwn.js` (ignored stale sibling), confirming the extensionless-resolution risk was real and that the TS-first config + explicit-`.ts` imports are load-bearing.
  - Dev `packages/utils/package.json` reads `version/license/repository = 0.0.0-PLACEHOLDER/PLACEHOLDER/PLACEHOLDER`, confirming packed-manifest assertions depend on the real release transformation rather than dev-manifest values.
- Risks: scoped config changes resolution only for utils tests (root config untouched); packed consumer installs `typescript`/`@types/node` from the registry like the reference harnesses, so it needs network/store access; Vite prints a pre-existing ESM-in-CJS config-loader warning (also present with the root config) without failing.

Kind: improvement

Priority: P2, prerequisite testability work prevents fixing one implementation while testing another.

Suggested agent: test-infrastructure agent.

Dependencies: none.

Primary ownership: utils test imports/config, new utils packed-consumer harness, `package.json` scripts only as needed. Coordinate later signature/config changes with UTILS-09; do not edit behavior helpers.

Finding and references: all 13 current tests use extensionless `../src/...` imports (`test/common-utils.test.ts:1-4`, `path-mutation.test.ts:1-4`, `collection-string-utils.test.ts:1-10`). Ignored generated JS siblings exist beside TS, and package `tsconfig.json:9` enables emit with no outDir. Root `vitest.config.ts:3-7` does not explicitly settle source resolution. This is a resolution risk, not a proven stale-test execution finding. Tests do not directly exercise the built root API or strict packed utils signatures. Current `package.json:16-29` conditional exports agree with the four freshly built entry artifacts; no broken export map was found.

Requirements:

1. Establish and verify that source regressions execute TypeScript, independent of ignored sibling output, using explicit imports or scoped resolver configuration. Do not delete unrelated generated files. Keep source verification no-emit.
2. Add a root API/runtime check and a utils-owned release-transformed packed-consumer fixture reusing the proven approach in `packages/access-router-client/test/access-router-client.packed-consumer.test.ts` or `packages/http-errors/test/strict-consumer-types.test.ts` after inspecting it. Avoid duplicating those packages' entire release infrastructure.
3. Exercise named package imports in real ESM/CJS and strict NodeNext/Bundler consumers with no source aliases. Check actual export targets, shipped README, absence of source/test leakage, and declaration resolution. Leave broad inference assertions to UTILS-09.

Acceptance criteria: evidence identifies exactly which source implementation tests load; a root-export smoke case and release-like installed consumer pass; harness runs through the package test command and cleans only its own temporary files. Production manifest transformations, not hand-guessed placeholder replacement, determine artifact expectations.

Verification: V1, V2, V4. Run serially with any build/test touching utils. Complete this task before behavior agents rely on new regressions.

### Task UTILS-11: Publish Accurate Contracts And Resolve Boundary Ambiguities

Status: completed

Completion evidence:

- Changed files (UTILS-11 only; no behavior/signature edits, no CHANGELOG.md per constraint):
  - `packages/utils/README.md` (rewritten contracts): canonical named imports (no default export/subpaths), Node `>=22`, path grammar + forbidden mutation segments, own/inherited semantics, mutation-vs-copying, clone/comparison domains, async rejection/thenable/concurrency, stable collection semantics, boolean empty-string rule, URL pathname-only contract, guards/types notes. Repo-relative doc link removed; only the public live-docs URL remains.
  - `website/docs/packages/utils.md`: fixed the false boolean sentence (now documents `''` → `defaultValue`), added pathname-only URL contract, plus compact path/clone/async/collection sections.
  - Focused public JSDoc (additive comment blocks only): `src/parseBooleanString.ts` (exact-`'true'` match, `''` like missing input, `?flag=` query note), `src/normalizeUrlPath.ts` + `src/removeConsecutiveSlashesFromUrl.ts` (pathname-only, scheme/query mangling out-of-domain, not WHATWG/sanitizer), `src/addLeadingSlash.ts` (`''` → `'/'`), `src/get.ts` (grammar pointer, prototype-chain reads, `undefined`-leaf/default indistinguishability), `src/hasOwn.ts` (own-only, null-safe), `src/assign.ts` (native `Object.assign` semantics incl. setters, not a sanitizer), `src/uniq.ts` (first-occurrence, SameValueZero, non-mutating), `src/orderBy.ts` (stable, sorts a copy).
  - `packages/utils/test/docs-contracts.test.ts` (new, dedicated): 4 tests over explicit `../src/*.ts` imports — boolean true/false/other/empty/undefined × default combos, pathname URL cases, and full-URL scheme/query/fragment inputs asserting actual runtime labeled unsupported/out-of-domain.
- Decision notes:
  - Empty-string boolean: runtime PRESERVED (`''` is falsy → yields `defaultValue`, same as `undefined`). Website line 125 was the defect, not the code; docs/JSDoc/tests now state the fallback explicitly. No maintainer approval needed since behavior is unchanged.
  - URL helpers: PATHNAME-ONLY contract, no code change. Caller inspection: all workspace callers compose route-path fragments only — `access-router` `route-registration.ts:13` (`basePath + route.path`), `model-router.ts:50,146` (`parentPath + basePath`/`parentPath + path`), `data-router.ts:56`, `root-router.ts:188` (`basename`) — no full-URL, query, or fragment inputs. Documented limitation agrees with runtime (`'https://…'` → `'/https:/…'`); not WHATWG normalization, not a security sanitizer. A full-URL change would need maintainer approval and is recorded as a possible follow-up, not implemented.
- Commands/results (serial, exclusive build):
  - V1 `pnpm --filter @web-ts-toolkit/utils test` → build ok (CJS/ESM/DTS), 17 files / 120 tests passed (was 16 / 116; +4 new doc tests).
  - V2 `pnpm exec eslint "packages/utils/**/*.{ts,js,mts}"` + `git diff --check` → clean.
  - V3 `pnpm exec tsc --noEmit -p packages/utils/tsconfig.json --strict` → 0 diagnostics.
  - V4 (inside V1): `utils.packed-consumer.test.ts` + `strict-signatures.test.ts` packed checks pass (named package imports, ESM+CJS, strict NodeNext+Bundler, `skipLibCheck: false`). README Quick-Start snippet additionally verified manually: strict `tsc` against built declarations via package-name import → clean; same snippet run against `dist/index.mjs` → expected outputs.
  - Manual declaration inspection: new JSDoc present in both `dist/index.d.ts` and `dist/index.d.mts` (39 doc blocks each: boolean, pathname-only, get/hasOwn/assign/uniq/orderBy entries confirmed by grep). Packed README is `packages/utils/README.md` itself (package `files` allowlist; packed-consumer test asserts shipped README + `from '@web-ts-toolkit/utils'`); README grep confirms no repo-only links.
  - Docs-only proof: `git diff` on the 9 touched `src/` files shows additive `/** */` blocks only (the one removed line in the `orderBy.ts` hunk is UTILS-09's pre-existing working-tree strict-gate change, not this task).
- Release notes collected from prior evidences (NOT applied to CHANGELOG.md per user override; for the maintainer to file under the repo's Unreleased conventions):
  - UTILS-01: dictionary results keep `Object.prototype` (never null-prototype); own `__proto__` keys now preserved (previously dropped/relocated).
  - UTILS-02: `set`/`setPath` shadow inherited containers with new own containers and bypass inherited setters; `deletePath` never traverses/removes ancestor state; `get`/`has` read-inheritance unchanged.
  - UTILS-03: literal digit-string identity (`'01'` ≠ `'1'`, huge keys exact, quoted digits literal); arrays created only for canonical indices; `pick`/`omit` flat-list vs nested-single-path documented (no behavior change).
  - UTILS-04: bounded clone domain (primitives, plain + `Object.create`-over-plain graphs, arrays, `Date`, `RegExp`); nested functions/exotics (`ObjectId`, `Map`/`Set`) shared by reference (no longer prototype-stripped by `structuredClone`); top-level exotic roots throw `TypeError`; `omit` on uncloneable roots throws before deleting.
  - UTILS-05: functions/exotics compare by identity (distinct `Map`s never equal); cyclic comparisons terminate; `isMatch` requires own-key presence (`isMatch({}, {a:undefined})` is `false`); inherited state ignored; symbols/holes/extra array keys participate.
  - UTILS-06: `flattenDeep` iterative (no `RangeError` on wide/deep inputs); cyclic arrays throw `TypeError`.
  - UTILS-07: docs-only, no behavior change; deferred follow-ups specified (sync-throw→rejection normalization, opt-in concurrency limit) pending maintainer approval.
  - UTILS-08: `intersectionBy` iteratee now once per element per array (redundant-callback side effects not preserved); `Set`-based SameValueZero membership in `baseUniq`/`uniqBy`/`difference`/`intersection`; nullish parity split preserved (`intersectionBy`/`difference` ignore non-arrays, `intersection` treats non-array secondary as empty).
  - UTILS-09: `isBoolean`/`isNumber`/`isString` reject boxed instances; `flattenDeep` input widened to `unknown`; `reduce` 2-arg overloads resolve to element type; `toAsyncFn` truthful overloads (thenable pass-through typed); new type-only export `PropertyPath`; `map` key-shorthand infers `T[K]`, deep paths yield `unknown[]`.
  - UTILS-11: docs-only; `parseBooleanString('')` documented as `defaultValue` fallback (runtime unchanged); URL helpers documented pathname-only (full URLs unsupported, runtime unchanged).
- Risks: full-URL inputs remain mangled rather than rejected (documented limitation, no validator added per no-new-helper scope); nested-exotic clone sharing and identity-equality over-reporting (from UTILS-04/05) are now documented but unchanged; client BND-08 grammar mirror noted by UTILS-03 still needs its own owner.

Kind: improvement

Priority: P2, installed consumers cannot currently discover important behavior without reading implementations.

Suggested agent: API documentation/contract agent.

Dependencies: UTILS-01, UTILS-02, UTILS-03, UTILS-04, UTILS-05, UTILS-06, UTILS-07, UTILS-08, UTILS-09, UTILS-10.

Primary ownership: `packages/utils/README.md`, focused public JSDoc, `website/docs/packages/utils.md`, executable documentation examples and task-file decision notes. Sequence with signature owners.

Finding and references: README lines 65-77 lists exports but omits path grammar, mutation/aliasing, clone/equality domains, async errors/concurrency, and runtime assumptions; emitted declarations contain almost no JSDoc. `parseBooleanString.ts:1-2` treats the empty string like missing input, contradicting website docs line 125 (every defined non-'true' string returns false). `removeConsecutiveSlashesFromUrl.ts:1-2` collapses all slash runs, including `https://` and query values, while `normalizeUrlPath.ts:4-5` adds a leading slash; docs only demonstrate pathname inputs. Full-URL support is not an established promised feature.

Requirements:

1. Document canonical named imports, Node >=22, supported paths and forbidden mutation segments, own/inherited behavior, mutation versus copying, clone/comparison domains, async rejection/thenable/concurrency decisions, and stable collection semantics in shipped README/JSDoc. Verify high-value JSDoc survives declaration emission.
2. Resolve the empty-string boolean doc/code discrepancy explicitly, preserving existing runtime behavior unless approved otherwise; add an executable example for empty/undefined/true/false/default combinations.
3. Inspect URL helper callers and choose a clearly documented pathname-only contract or a separately approved full-URL change. Test schemes/query/fragment examples according to that decision. Do not silently turn route-path normalization into WHATWG URL normalization or claim it is a security sanitizer.
4. Collect public behavior/type changes from preceding tasks into the repository's appropriate release-note mechanism after checking its conventions. No compatibility alias or new helper without a concrete consumer need.

Acceptance criteria: installed README is sufficient for key workflows without repo-only links; snippets compile/run through V4; boolean text matches tests; URL input domain is explicit; documented limitations and changed contracts agree with runtime and declarations. Unresolved decisions have named owners and block affected changes only.

Verification: V1-V4; manually inspect emitted JSDoc and packed README. No llms.txt requirement.

### Task UTILS-12: Independently Verify Utility And Consumer Integration

Status: completed

Completion evidence:

- Scope: read-only review; NO source edits made by this reviewer. No blocking defect found requiring a follow-up edit. `git diff --name-only HEAD` touches only `packages/utils/**`, `website/docs/packages/utils.md`, and this task file — no cross-package source edits, no `CHANGELOG.md` update (per task constraint; release notes collected in UTILS-11 evidence only), no `dist/` edits (`git diff --name-only` shows no `dist/`; `git status` shows no `packages/utils/dist/` modifications).
- V1 `pnpm --filter @web-ts-toolkit/utils test` (repo root, serial) → build ok (CJS/ESM/DTS), 17 files / 120 tests passed.
- V2 `pnpm exec eslint "packages/utils/**/*.{ts,js,mts}"` → clean (exit 0); `git diff --check` → clean (exit 0).
- V3 `pnpm exec tsc --noEmit -p packages/utils/tsconfig.json --strict` → 0 diagnostics (exit 0).
- V4 (inside V1): `utils.packed-consumer.test.ts` + `strict-signatures.test.ts` packed checks pass (real release transformer, package-name imports, ESM+CJS runtime, strict NodeNext + Bundler with `skipLibCheck: false`). No separate V4 command required by Shared Verification.
- V5 (serial, no parallel builds): `pnpm build` → exit 0; `pnpm test` → exit 0 (full serialized suite); `pnpm lint` → exit 0 with 0 errors + 3 warnings, all pre-existing/unrelated in `packages/access-router-client/test/access-router-client.bnd12-benchmark.unit.test.ts` (unused eslint-disable directives, no-console) — NOT attributable to utils. No attributable failures at any gate.
- Independent runtime re-probes (fresh `dist/index.mjs`, reviewer-executed): `groupBy` preserves own `__proto__`/`constructor`/`toString` with `Object.prototype` result; `mapValuesAsync` preserves own `__proto__` (entries/fromEntries path, own-key safe); `get({'01':'correct','1':'wrong'},['01'])` → `'correct'`; `set(o,['01'],'q')` creates own `'01'` object property (not array); cyclic+function graph clones without `RangeError` (cycle preserved, fn by reference, detached root); `omit(classInstance,'keep')` throws `TypeError` before deleting; `isEqual(new Map, new Map)` → false; `isMatch({}, {a:undefined})` → false; `flattenDeep([Array(150000).fill(1)])` → 150000 in order; 100000-deep nesting → `[1]`; direct/indirect flatten cycles → `TypeError`; `toAsyncFn` sync-throw escapes synchronously, `this` forwarded, thenable identity preserved.
- Prototype-key audit: sync dict transforms (`groupBy`/`arrayToRecord`/`mapKeys`/`mapValues`/`pickBy`/`omitBy`/`toStringRecord`) via `dictionary.ts` own-key policy + dedicated failing-before evidence (8 failed/1 passed pre-fix); async `mapValuesAsync` uses `Object.entries` + `Object.fromEntries` (own-key safe, verified above); path mutations via `_internal.ts` `hasOwnKey`/`defineOwnValue` + `hasUnsafePathPart` pre-validation. No gaps found.
- Clone/omit/equality audit: `cloneValue` single memoizing pass (no per-descendant `structuredClone` retry), supported domain + exotic-root `TypeError` + nested-exotic opaque leaves as documented; `omit` alias-guard throws before `deletePath`; `deepEqual`/`partialMatch` aligned to clone domain with pair-aware cycle termination, own-keys-only, symbol/hole/extra-array-key semantics. Failing-before evidence present for UTILS-04 (3 failed/7 passed) and UTILS-05 (14 failed/4 passed). Client `access-router-client` suite green in UTILS-04/05 evidence; full `pnpm test` green here confirms no downstream regression.
- Exact-key vs client mirror: utils `toPath` preserves `'01'`/huge-key/quoted-digit identity with separate `isArrayIndexKey` container decision (failing-before: 6 failed/2 passed + dist probe). Client `model.ts:40-51` `toModelPathParts` still `Number()`s `/^\d+$/` tokens — confirmed NOT silently changed here; UTILS-03 evidence correctly hands the mirror fix to the client owner (BND-08) with dirty-root mismatch analysis. Residual risk accepted and owned elsewhere.
- Resource behavior: UTILS-06 iterative frame-stack (no spread/call-stack recursion), cycle-vs-shared-subarray distinction, failing-before `RangeError` on 150k-leaf + 20k-deep inputs; bounded observations recorded (~9ms/12.1MiB wide, ~27ms/24.7MiB 100k-deep, Node v26.7.0, no speedup claims, no timing assertions in CI). UTILS-08 callback-count regression (10,100→200 for 100x100; 1,001,000→2,000 for 1k) + repeatable before/after ms tables; adjacent `baseUniq`/`uniqBy`/`difference`/`intersection` Set changes measurement-justified; `orderBy`/`reduce` untouched per deferred scope.
- Declarations/exports/docs/release notes: runtime surface exactly 58 names, no default export, `PropertyPath` type-only (no runtime export); `IntersectionByIteratee` module-local; `dictionary.ts` not re-exported. Lossy `PromiseLike<unknown> | Promise<any>` gone from `dist/index.d.ts`. README has canonical named imports, Node >=22, no repo-only links (only public live-docs URL), `from '@web-ts-toolkit/utils'` snippets; website boolean sentence fixed (`''` → `defaultValue`) and pathname-only URL contract explicit. Release-impact notes collected under UTILS-11 evidence, not applied to CHANGELOG.md per constraint. Emitted JSDoc verified in prior evidence (39 doc blocks in both `.d.ts`/`.d.mts`); reviewer `grep` confirms `PropertyPath` + truthful `toAsyncFn` overloads in declarations.
- Deferred investigations all state rationale + residual risk: UTILS-07 (sync-throw→rejection normalization + thenable→Promise normalization deferred for `populateDoc` identity compat; concurrency option deferred for no caller need); UTILS-09 (`FlatArray` inference + deep path-type machinery deferred as unsound/speculative); UTILS-08 (nullish parity unification deferred as breaking-change risk); UTILS-11 (full-URL support deferred, needs maintainer approval); UTILS-03 (empty-quoted/escaped/malformed grammar deferred in `toPath` JSDoc); UTILS-06 (no size cap, heap-proportional frames noted). No silent redesigns.
- Helper-cohesion check: `_internal.ts` additions are small cohesive private helpers (`hasOwnKey`/`defineOwnValue`, `isArrayIndexKey`, `cloneInner`/`isExoticRoot`/`exoticTypeError`/`isInheritedPlainLike`/`ownEnumerableKeys`/`copyOwnEnumerableExtras`, `deepEqualInner`/`partialMatchInner` + pair-stack helpers); `dictionary.ts` is a justified cohesive boundary (shared dict-result policy, not re-exported). No blanket `_internal` split warranted; no further extraction recommended.
- No unrequested API expansion (only `PropertyPath` type export + documented overload/signature truthfulness), no unsafe compat exception (boxed-guard rejection, exotic-root throw, cycle `TypeError`, callback-count change all documented as deliberate contract changes with failing-before evidence), no unrelated modification (scope-clean diff above).
- Task dependency/status audit: UTILS-01..11 all `completed` with per-task Completion evidence (failing-before + V1/V2 where required, V3/V4 where owned, contract/release-notes handoffs); UTILS-12 was the sole `pending` gate and is now `completed`. No task marked completed with required verification blocked; no unavailable verification encountered (nothing marked blocked).
- Risks/residual: client BND-08 digit-key mirror still outstanding under its own owner; nested-exotic opaque sharing + identity-equality over-reporting + full-URL mangling remain documented limitations; `cloneDeep(exoticRoot)` direct callers must handle `TypeError`; `flattenDeep` adversarial million-depth heap growth uncapped per contract.

Kind: improvement

Priority: P1 integration gate, shared helper regressions propagate across packages.

Suggested agent: independent reviewer, not the main implementation agent.

Dependencies: UTILS-01, UTILS-02, UTILS-03, UTILS-04, UTILS-05, UTILS-06, UTILS-07, UTILS-08, UTILS-09, UTILS-10, UTILS-11.

Primary ownership: this task document's completion evidence and review notes; read-only changed source/tests/artifacts and affected consumer boundaries unless a separately assigned follow-up is necessary.

Finding and references: helper reuse in client snapshots and dirty tracking, shared mutation primitives in `_internal.ts`, and existing consumers' packed utils dependency coverage make isolated happy-path tests insufficient. This is the integration gate for all cited findings, not a new speculative defect.

Requirements: verify every acceptance criterion against runtime/types/evidence; recheck prototype-key handling across sync/async dictionary transforms and path mutations; inspect clone/omit isolation and equality on supported graphs; review exact-key paths against the client mirror; confirm resource behavior for cyclic/deep/wide inputs; check public declarations, docs, exports, and release notes together. Ensure deferred investigations state rationale and residual risk. Prefer small cohesive helpers over a blanket `_internal.ts` split; extract only boundaries made reusable/testable by the fixes.

Acceptance criteria: V1-V5 recorded with results; attributable failures resolved; unavailable required verification marked blocked rather than completed; independent reviewer confirms no unrequested API expansion, unsafe compatibility exception, or modification of unrelated work. Each defect has regression or documented equivalent failing-before evidence, and performance claims have measurements.

Verification: V1-V5, independent source/artifact review, `git diff --check`, and task dependency/status audit.

## Deferred Scope And Definition Of Done

- `assign` intentionally wraps `Object.assign` (`src/assign.ts:1-2`), which can invoke target setters. Do not silently rebrand it as an untrusted-input sanitizer; document native semantics and investigate a hardened alternative only with a real caller requirement.
- Unicode-aware word splitting, locale/collation sorting, general async cancellation, blanket request-size limits, browser support, cross-realm built-ins, and adversarial accessors/proxies need explicit use cases or bounded investigations before feature work. These were not certified safe or supported.
- `orderBy.ts:17-19` recomputes projections during sort and `reduce.ts:17-35` materializes entries. Neither was benchmarked; do not create separate optimization work until representative measurements justify it.
- Missing functionality is primarily safe graph handling, useful type inference, independent package tests, and explicit contracts, not a larger catalog of helpers. Avoid generic cleanup or splitting every utility into additional abstraction layers.
- Done means approved contracts implemented or investigations explicitly resolved, all task acceptance criteria backed by evidence, required verification passed, public runtime/types/docs aligned, release-impact notes recorded, and the independent integration review completed. Saving this plan does not complete any remediation task.
