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

Status: pending

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

Status: pending

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

Status: pending

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

Status: pending

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

Status: pending

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

Status: pending

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

Status: pending

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

Status: pending

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

Status: pending

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

Status: pending

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

Status: pending

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

Status: pending

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
