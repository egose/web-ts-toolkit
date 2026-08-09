# Access Router Client Review Remediation

Created: 2026-08-06 14:49:45 local time

Package: `packages/access-router-client`

## Objective

Resolve confirmed readability, security, correctness, performance, encapsulation, reusability, testability, and installed-package gaps in `@web-ts-toolkit/access-router-client` without broad rewrites. This document is the execution record for delegated sub-agents and must remain usable without the original review conversation.

## Scope And Working Rules

- Preserve unrelated worktree changes. Never revert files owned by another session.
- Add a regression test that fails against the current implementation for each behavioral defect.
- Prefer shared enforcement points: cache policy in the cache adapter, mutation policy in one request helper, result normalization in one response boundary, and model persistence behind an explicit persistence interface.
- Do not preserve unsafe cache behavior through compatibility aliases unless a concrete consumer requirement is documented.
- Keep direct and grouped requests behaviorally consistent unless an intentional difference is documented and tested.
- Treat changes to response types, subdocument data shape, cache defaults, or root exports as public contract changes; update README, `llms.txt`, website docs, and release notes together.
- Do not edit generated `dist/` manually. Rebuild it from source.
- Package tests rebuild transitive workspace dependencies. Run package and repository test commands serially, not concurrently.
- Record completion evidence under each task before setting it to `completed`.

## Non-Goals

- Do not redesign the server-side `access-router` protocol.
- Do not add a compatibility layer for undocumented internal exports without evidence of external use.
- Do not replace Axios or introduce a general client state-management framework.
- Do not optimize speculative hot paths before correctness and cache safety are established.

## Audit Baseline

Verified on 2026-08-06 against a clean worktree:

- `pnpm --filter @web-ts-toolkit/access-router-client test`: passed, 4 files and 29 tests.
- The package build emitted CJS, ESM, `.d.ts`, and `.d.mts` outputs successfully.
- `npm pack --dry-run --json` from the package: passed and listed 7 files: package metadata, README, `llms.txt`, and four `dist` outputs.
- Existing tests import `../src`; none installs or compiles against the packed package.
- A successful build is not sufficient: the emitted declarations contain inconsistent unconstrained model generics and the runtime response shape disagrees with its public types.

## Priorities

- P0: cross-identity data exposure or a mutation that may be skipped.
- P1: stale or incorrect data, wrong persistence route, externally observable contract defect, or unsafe public declaration.
- P2: resource hardening, encapsulation, performance, readability, or documentation gap.

## Wave 1: Cache And Mutation Safety

### Task ARC-01: Partition Or Disable Credentialed Response Caching

Status: completed

Priority: P0

Suggested agent: client security agent

Dependencies: none

Primary ownership:

- `packages/access-router-client/src/adapter.ts`
- `packages/access-router-client/src/services/interceptors.ts`
- focused cache tests

Finding:

The adapter defaults `withCredentials` to `true`, while cache keys include Axios-visible headers but not browser cookies. Reusing one cached adapter across logout/login or cookie rotation can return a response created under the previous identity. Existing coverage partitions only by an explicit `user` header.

References:

- `packages/access-router-client/src/adapter.ts:11-19`
- `packages/access-router-client/src/services/interceptors.ts:57-80`
- `packages/access-router-client/src/services/interceptors.ts:96-125`
- `packages/access-router-client/test/access-router-client.adapter.integration.test.ts:99-110`

Implementation requirements:

1. Do not cache credentialed requests unless the caller supplies an explicit, stable cache partition key tied to the authenticated identity.
2. Prefer safe defaults: credentialed caching should be off when no partition strategy is configured.
3. Expose an adapter-scoped cache clear operation for login, logout, token refresh, and tenant changes.
4. Do not put raw cookies, authorization values, or other secrets into serialized cache keys or diagnostics.
5. Document the browser and server-side authentication contract.

Acceptance criteria:

- Two simulated credential identities using the same adapter cannot receive each other's cached response.
- A credential transition followed by cache clearing forces a network request.
- Anonymous or explicitly partitioned requests can still be cached when enabled.
- Cache tests and `pnpm --filter @web-ts-toolkit/access-router-client test` pass.

Completion evidence:

- Changed: `packages/access-router-client/src/services/interceptors.ts`, `packages/access-router-client/src/adapter.ts`, `packages/access-router-client/test/access-router-client.cache.unit.test.ts` (new), `packages/access-router-client/test/access-router-client.adapter.integration.test.ts`.
- Verified: `pnpm --filter @web-ts-toolkit/access-router-client test` => 5 files, 37 tests passing (29 baseline + 8 new credential/cache regression tests).
- Result: credentialed requests bypass the cache unless `AdapterOptions.cachePartition(config)` returns a stable, non-secret identity token; sensitive auth headers (`authorization`, `cookie`, `set-cookie`, `proxy-authorization`, `www-authenticate`) are excluded from cache keys; the adapter now exposes `clearCache()` and `disposeCache()`. The previous integration test that relied on unsafe credentialed caching partitioned only by a `user` header was replaced with explicit `cachePartition` coverage plus regression tests for the no-partition bypass and the credential-transition invalidation path.

### Task ARC-02: Centralize Mutation Cache Bypass And Invalidation

Status: completed

Priority: P0

Suggested agent: cache correctness agent

Dependencies: ARC-01

Primary ownership:

- `packages/access-router-client/src/services/interceptors.ts`
- `packages/access-router-client/src/services/model-service.ts`
- `packages/access-router-client/src/services/sub-ops.ts`
- mutation/cache regression tests

Finding:

Subdocument create, update, bulk update, and delete do not set the mutation cache-bypass header, so an identical repeated mutation can be served from cache without reaching the server. Other model mutations bypass storage but do not invalidate existing read/list/count/distinct entries, allowing stale data until TTL expiry.

References:

- `packages/access-router-client/src/services/interceptors.ts:93-129`
- `packages/access-router-client/src/services/sub-ops.ts:179-287`
- `packages/access-router-client/src/services/model-service.ts:257-286`
- `packages/access-router-client/src/services/model-service.ts:801-840`
- `packages/access-router-client/test/access-router-client.model-service.integration.test.ts:144-219`

Implementation requirements:

1. Classify safe cacheable reads by HTTP method and explicit policy; never cache mutation methods merely because a header is absent.
2. Route all model and subdocument mutations through one cache-bypass helper rather than repeating header mutation at each call site.
3. After a successful mutation, invalidate cached entries for the affected adapter/service. Clearing the adapter cache is acceptable if targeted invalidation cannot be made reliable.
4. Do not invalidate on a failed mutation.
5. Preserve caller headers without mutating caller-owned `AxiosHeaders` or config objects.

Acceptance criteria:

- Repeating identical subdocument create, update, bulk update, and delete calls executes the server each time.
- A cached read/list/count followed by create, update, or delete cannot return the pre-mutation response.
- Failed mutations do not evict unrelated valid entries.
- Tests prove the behavior with `cacheTTL > 0` and the package suite passes.

Completion evidence:

- Changed: `packages/access-router-client/src/services/interceptors.ts` (added `cloneConfigWithCacheBypass` helper; clear cache on 2xx mutations), `packages/access-router-client/src/services/model-service.ts` (8 mutation sites routed through helper; removed direct `set()` header mutation), `packages/access-router-client/src/services/sub-ops.ts` (`update`/`bulkUpdate`/`create`/`delete` now set cache-bypass header for the first time), `packages/access-router-client/test/support/integration-suite.ts` (added `cache-mutate` / `cache-mutate-fail` counter routes and `createCachedAdapter` helper), `packages/access-router-client/test/access-router-client.cache.unit.test.ts` (+3 mutation bypass tests), `packages/access-router-client.test/access-router-client.adapter.integration.test.ts` (+2 wrap-mutation invalidation tests), `packages/access-router-client/test/access-router-client.model-service.integration.test.ts` (+2 subdocument-mutation cache-bypass/invalidation tests).
- Verified: `pnpm --filter @web-ts-toolkit/access-router-client test` => 5 files, 44 tests passing (29 baseline + 8 ARC-01 + 7 ARC-02 regression tests).
- Result: All subdocument mutations now reach the server each time even with `cacheTTL > 0`; a successful wrap mutation or subdocument mutation clears cached read entries, a failed mutation preserves them; failed mutations detected by `response.status >= 200 && < 300` so callers that override `validateStatus` to opt into the raw response object still preserve the cache on failed mutations.

### Task ARC-03: Bound And Isolate Cached Values

Status: completed

Priority: P1

Suggested agent: cache implementation agent

Dependencies: ARC-02

Primary ownership:

- `packages/access-router-client/src/services/interceptors.ts`
- `packages/access-router-client/src/services/cache-utils.ts`
- focused unit tests with fake timers

Finding:

The cache retains an unbounded map plus one timer per key and returns shallow copies that share nested `AxiosResponse` and data references. High-cardinality inputs can grow memory/timers, Node timers can keep a process alive, and caller mutation of one response can poison later cache hits.

References:

- `packages/access-router-client/src/services/interceptors.ts:5-42`
- `packages/access-router-client/src/services/interceptors.ts:93-126`

Implementation requirements:

1. Add a configurable finite capacity and deterministic eviction policy.
2. Store a supported immutable snapshot and return an independent value on every hit; JSON-only cloning is acceptable only if the supported response-body contract is explicit.
3. Avoid one ref'ed Node timer per key; use expiry-on-access or `unref()` timers with deterministic cleanup.
4. Expose `clear()` and `dispose()` through the adapter cache controls established in ARC-01.
5. Bypass caching for response types, transforms, serializers, or data that cannot be safely keyed and cloned.

Acceptance criteria:

- Mutating a returned cached response or nested body does not affect later hits.
- Capacity is never exceeded and eviction order is deterministic.
- Expired entries and timers/resources are released; cache timers do not keep a Node process alive.
- Unsupported Axios response modes bypass cache rather than collide.
- Focused cache tests and the package suite pass.

Completion evidence:

- Changed: `packages/access-router-client/src/services/interceptors.ts` (SimpleCache now bounded by optional `capacity` with LRU eviction; `clone` hook with `defaultClone` JSON-clones snapshots on store AND on hit; `isUnsupportedResponseBody` bypasses Stream/ArrayBuffer/Blob/Document/JSON-unclean bodies; `snapshotResponse` persists `data`, `status`, `statusText`, `headers` and deep-clones `data`/`headers` at store time; `useCacheInterceptors` constructs cache with `capacity` and `clone`; cache stores `CachedResponseSnapshot` instead of raw `AxiosResponse` so caller view and cached snapshot never share nested references), `packages/access-router-client/src/adapter.ts` (added `cacheCapacity` adapter option), `packages/access-router-client/test/access-router-client.cache.unit.test.ts` (+4 ARC-03 tests: nested-isolation, capacity-LRU, unsupported-responseType bypass, dispose cleared timers).
- Verified: `pnpm --filter @web-ts-toolkit/access-router-client test` => 5 files, 48 tests passing (29 baseline + 8 ARC-01 + 7 ARC-02 + 4 ARC-03 regression tests).
- Result: Mutating a returned cached response's nested body or status never affects later cache hits; capacity is enforced deterministically with LRU eviction; Stream/ArrayBuffer/Blob/Document response modes bypass the cache rather than grouping-on-stale; `unref()` already applied in ARC-01 keeps timers off the Node event loop; `clear()`/`dispose()` (ARC-01) release all held timers and entries.

### Task ARC-04: Deduplicate Concurrent Cache Misses

Status: completed

Priority: P2

Suggested agent: client performance agent

Dependencies: ARC-03

Primary ownership:

- `packages/access-router-client/src/services/interceptors.ts`
- cache concurrency tests

Finding:

Only completed responses are cached, so simultaneous identical misses each issue a network request and can stampede the server.

References:

- `packages/access-router-client/src/services/interceptors.ts:96-105`
- `packages/access-router-client/src/services/interceptors.ts:120-126`

Implementation requirements:

1. Share one in-flight request for an identical cache key within the same adapter and cache partition.
2. Remove in-flight state on both fulfillment and rejection.
3. Return independent response values to each caller as required by ARC-03.
4. Never deduplicate mutations or requests that bypass cache.

Acceptance criteria:

- Concurrent identical reads make one server request and all callers receive equivalent independent results.
- A rejected request is not retained and a later retry reaches the server.
- Different partitions, headers, params, and supported response configurations do not coalesce.

Completion evidence:

- Changed: `packages/access-router-client/src/services/interceptors.ts` (added `inflight: Map<string, Promise<AxiosResponse>>` keyed by cache key; request interceptor: cache hit → serve clone via synthetic adapter, in-flight hit → attach tail adapter that awaits the inflight promise and returns an independent `defaultClone` of the response on success / re-throws on failure, fresh miss → register an inflight promise with `resolveInflight`/`rejectInflight` callbacks, pre-attach `.catch(noop)` so an early rejection never surfaces as an unhandledRejection, and wrap `config.adapter` via `axios.getAdapter` so the slot is rejected/finalized at the source when the adapter throws a plain `Error` — required because Axios does not attach `config` to a non-AxiosError thrown by the adapter, so the response error interceptor cannot reach per-request markers; the wrapped adapter calls `rejectInflight(error)` + `finalizeInflight(key)` before re-throwing; the response success branch calls `resolveInflight(response)` + `finalizeInflight(key)` after storing the snapshot; the response error branch remains as an idempotent fallback for AxiosError rejects that still carry `__arcInflightKey`/`__arcReject` markers; mutations and bypass-header requests skip the inflight map entirely), `packages/access-router-client/test/access-router-client.cache.unit.test.ts` (+4 ARC-04 tests under a new `cache concurrency dedup` suite: shared in-flight with independent snapshots, rejected in-flight not retained + later retry reaches server, no dedup for mutations/bypass, no coalescing across partitions/headers/params/supported-response-config).
- Verified: `pnpm --filter @web-ts-toolkit/access-router-client test` => 5 files, 52 tests passing (48 through ARC-03 + 4 ARC-04 dedup tests). `pnpm lint` clean.
- Result: Concurrent identical cache misses within the same adapter partition share a single network request; each tail caller receives an independent `defaultClone` of the response so caller mutation cannot poison other callers (ARC-03 isolation preserved through the dedup path); rejection of the in-flight request rejects all tailed callers with the same error and the slot is finalized so a later retry reaches the server rather than tailing onto a settled/rejected promise; mutations (cache-bypass header) and requests that bypass caching never enter the inflight map; different cache partitions, request headers, params, and supported response configurations do not coalesce because the inflight key is the same `generateCacheKey` output used for cache storage.

## Wave 2: Subdocument And Model Correctness

### Task ARC-05: Define A Safe Subdocument Persistence Contract

Status: completed

Priority: P1

Suggested agent: model architecture agent

Dependencies: ARC-02

Primary ownership:

- `packages/access-router-client/src/services/sub-ops.ts`
- `packages/access-router-client/src/model.ts`
- subdocument integration tests
- subdocument documentation

Finding:

Subdocument results are wrapped as `Model<S>` using the parent `ModelService`. Calling `save()` therefore targets the parent route with the subdocument ID instead of `/:parentId/:sub/:subId`. Subdocument create is also typed as one model although the current server response and test are an array, while website documentation says subdocument data is not wrapped.

References:

- `packages/access-router-client/src/services/sub-ops.ts:20-24`
- `packages/access-router-client/src/services/sub-ops.ts:104-188`
- `packages/access-router-client/src/services/sub-ops.ts:244-254`
- `packages/access-router-client/src/model.ts:33-39`
- `packages/access-router-client/test/access-router-client.model-service.integration.test.ts:161-179`
- `website/docs/packages/access-router-client/services.mdx:153-162`

Implementation requirements:

1. Choose and document one public contract: return plain subdocument data, or provide a dedicated persistence adapter whose `save()` targets the exact parent/subdocument route.
2. Do not cast a parent service to `ModelService<S>`.
3. Make create/list/read/update/bulk-update runtime shapes and TypeScript response types match the actual server contract.
4. Keep direct and grouped subdocument normalization consistent.
5. Add release/migration notes if the returned `data` shape changes.

Acceptance criteria:

- No public subdocument object exposes a `save()` that can target a parent model route.
- If save is supported, a regression test proves it updates only `/:parentId/:sub/:subId`.
- Create and bulk-update response types match runtime array/single behavior without casts at consumer call sites.
- README/website docs, direct calls, grouped calls, declarations, and tests agree.

Completion evidence:

- Decision (Deferred Decision #2): maintainer chose "plain data objects" (Option 1). Subdocuments return as plain `S` data; no `save()` footgun. Persistence is achieved only by calling the parent-scoped helper (`subService.update(subId, data)`, `subService.create(data)`, `subService.bulkUpdate(data[])`, `subService.delete(subId)`).
- Changed: `packages/access-router-client/src/types.ts` (added `SubDocumentResponse<S, TData>` = `Response<TData, TData | null>` for single subdocs, and `SubDocumentListResponse<S, TData>` = `Response<TData[], TData[]> & { totalCount: number }` for array subdocs; both deliberately omit `Model<S>` wrapping so callers cannot reach a `save()` method, removing the parent-route footgun), `packages/access-router-client/src/services/sub-ops.ts` (removed the `asS = parentService as ModelService<S>` cast and the misleading "Single cast" comment; removed `import { Model }`; replaced every `Model.create<S>(item, asS)` with the plain `item` data; `list`/`listAdvanced`/`create`/`bulkUpdate` now return `SubDocumentListResponse<S>` with `data` as the normalized plain array via a local `toArray<S>(value)` helper; `read`/`readAdvanced`/`update` return `SubDocumentResponse<S>` with `data: S | null`; `create()` documented to always return the post-create array (server returns full list when count > 1; client normalizes count===1 single-doc case to `[newDoc]` for one stable shape, removing the array-vs-object conditional the prior `ModelResponse<S>` type hid behind a cast)), `packages/access-router-client/test/access-router-client.model-service.integration.test.ts` (extended `supports new(), delete(), and subdocument mutation routes` test with assertions that `createdSub.data` is an array, `createdSub.totalCount === 3`, `createdSubDoc.save` is undefined, `createdSub.data[2].save` is undefined, `updatedSub.data.save` is undefined, and `updatedSub.data._id` matches; extended `supports subdocument bulkUpdate()` test with assertions that `bulkUpdated.data` is the plain updated array, `bulkUpdated.totalCount === 2`, and `bulkUpdated.data[0].save` is undefined; extended `supports subqueries and subdocument read routes` test with assertions that `listed.data`/`listed.totalCount` are array/plain, `listed.data[0].save` is undefined, `read.data.save` is undefined, `advancedListed.data`/`advancedListed.totalCount` are array/plain, `advancedListed.data[0].save` is undefined, `advancedRead.data.save` is undefined), `website/docs/packages/access-router-client/services.mdx` (rewrote the "Important return-shape note for subdocument helpers" section as a "Return shape" section that documents the plain-array/single/null contract, the rationale (subdocument `Model<S>.save()` would target the parent route with the subdocument `_id` instead of `/:parentId/:sub/:subId`), the persistence helpers (`update`/`create`/`bulkUpdate`/`delete` on the parent-scoped helper), the `SubDocumentResponse`/`SubDocumentListResponse` types, and the `create()` always-array normalization; updated the example block to consume `created.data[...]`, `listed.data`, `bulkUpdated.data`, `read.data` as plain values, not `Model<S>`).
- Verified: `pnpm --filter @web-ts-toolkit/access-router-client test` => 5 files, 52 tests passing (no test count change because assertions were added to existing tests rather than new test cases). `pnpm lint` clean.
- Result: All subdocument operations (`list`, `listAdvanced`, `read`, `readAdvanced`, `create`, `update`, `bulkUpdate`, `delete`) return plain `S` data — never `Model<S>` — so no subdocument object exposes a `save()` that could target the parent route; `create()` always returns the array-shaped `SubDocumentListResponse<S>` so consumers do not need conditional/array-vs-object casts at call sites (the previously hidden server-side conditional single-or-array shape is now stable on the client); direct (single-document) and grouped (`bulkUpdate`/`list`) shapes are consistent — both expose a plain array as `data` plus `totalCount`; README/website docs, runtime behavior, declarations (`SubDocumentResponse`/`SubDocumentListResponse`), and tests agree. Save is intentionally NOT supported on subdocuments; the regression test confirms the absence of `save` on returned items.

### Task ARC-06: Preserve Concurrent Edits During Model Save

Status: completed

Priority: P1

Suggested agent: model state agent

Dependencies: ARC-05

Primary ownership:

- `packages/access-router-client/src/model.ts`
- focused model unit tests

Finding:

`Model.save()` clears all dirty paths and merges the response after awaiting. Edits made while the request is in flight can be overwritten or incorrectly marked clean even though they were not submitted.

References:

- `packages/access-router-client/src/model.ts:33-50`
- `packages/access-router-client/src/model.ts:111-114`

Implementation requirements:

1. Snapshot submitted values and dirty paths before starting the request.
2. On success, clear only paths whose current values still equal the submitted values.
3. Merge server values without overwriting newer local edits; define deterministic conflict behavior for the same path.
4. Preserve all dirty state on failure.
5. Give `save()` an explicit public return type rather than emitted `Promise<any>`.

Acceptance criteria:

- An edit to another path during an in-flight save remains present and dirty after success.
- A newer edit to the submitted path is not overwritten or marked clean.
- Failed saves retain all dirty paths.
- Generated declarations expose the intended normalized save response.

Completion evidence:

- Changed: `packages/access-router-client/src/model.ts` (rewrote `Model.save()` with the new concurrency contract; imported `ModelResponse` from `./types` and `isEqual` from `@web-ts-toolkit/utils`; added a JSDoc block describing the five-part contract; explicit return type `Promise<ModelResponse<T, TData>>` replacing the previous inferred `Promise<any>`; before the request, snapshot the dirty-path set (`submittedPaths`) and the per-path current values as deep clones (`submittedValues`); on success, iterate server-returned keys and for each one only overwrite the local value if the path was NOT concurrently re-modified during the in-flight save (deterministic conflict rule: the newer local edit wins for the same path, server value is discarded for that path; uses `isEqual` deep-equal rather than `Object.is` so nested object/array values submitted at the call site don't trivially compare unequal to their own clones); after the response, clear submitted paths from `modifiedPaths` only if their current value is still deeply equal to the submitted value (so a concurrent re-edit to a different value preserves the dirty flag and the new value); on create, apply the server-assigned `_id` and clear it from `modifiedPaths` (`_id` is excluded from `initializeDirtyState` but the proxy would otherwise re-track the create-time assignment); refresh `_snapshot` only for paths that are no longer dirty after the merge — preserving the pre-save baseline for paths that were concurrently re-edited so a later `reset()` still rewinds them deterministically; removed the now-unused private `updateModel(data)` helper; on failure, return `{ ...result, data: null }` and leave `_data`, `modifiedPaths`, and `_snapshot` untouched so a retry `save()` re-submits the same set), `packages/access-router-client/test/access-router-client.model.integration.test.ts` (added 3 focused ARC-06 tests under the `Model integration` suite: `preserves concurrent edits to *other* paths during an in-flight save` — submits `role`, kicks off `save()`, concurrently edits `public`, asserts that after the awaited save `public` is preserved and still dirty while `role` is applied and cleared, then a second save flushes `public` and asserts the server-side view reflects it; `does not overwrite or mark-clean a newer edit to the same path during an in-flight save` — submits `role='maintainer'`, concurrently re-edits `role='author'` while the save is in flight, asserts the local value stays `'author'` and stays dirty, asserts the server stored the submitted `'maintainer'`, then a follow-up save flushes `'author'`; `preserves all dirty paths on a failed save` — submits two paths, points `_id` at a bogus id so `PATCH` returns 404, asserts both dirty paths and both values are retained after the failed save, then restores the real id and asserts a retry succeeds and clears dirties).
- Verified: `pnpm --filter @web-ts-toolkit/access-router-client test` => 5 files, 55 tests passing (52 through ARC-05 + 3 ARC-06 regression tests). `pnpm lint` clean. `dist/index.d.ts` now publishes `save(reqConfig?: AxiosRequestConfig): Promise<ModelResponse<T, TData>>` (was previously inferred `Promise<any>`).
- Result: An edit to a different path during an in-flight save remains present locally and remains flagged dirty after the save succeeds (asserted by `preserves concurrent edits to *other* paths during an in-flight save`); a concurrent re-edit to the same submitted path is preserved locally and stays dirty while the server stores the originally-submitted value, then a retry save flushes the newer value (asserted by `does not overwrite or mark-clean a newer edit to the same path during an in-flight save`); failed saves retain all dirty paths and local values (asserted by `preserves all dirty paths on a failed save`); the generated `dist/index.d.ts` shows the intended normalized `Promise<ModelResponse<T, TData>>` return type on `save()`, replacing the prior inferred `Promise<any>` (requirement #5).

### Task ARC-07: Make Dirty Tracking Match Effective Changes

Status: completed

Priority: P2

Suggested agent: model usability agent

Dependencies: ARC-06

Primary ownership:

- `packages/access-router-client/src/model.ts`
- `packages/access-router-client/test/access-router-client.model.integration.test.ts`
- model documentation

Finding:

Dirty paths are only added, so changing `A -> B -> A` remains dirty. Only the top-level object is proxied; direct nested object or array edits are silently omitted by `save()`. Existing tests encode the nested limitation but do not demonstrate the resulting lost update.

References:

- `packages/access-router-client/src/model.ts:53-95`
- `packages/access-router-client/src/model.ts:145-166`
- `packages/access-router-client/src/model.ts:194-200`
- `packages/access-router-client/test/access-router-client.model.integration.test.ts:28-47`

Implementation requirements:

1. Remove a dirty top-level path when its effective value equals the snapshot using the package's supported deep-equality semantics.
2. Choose one explicit nested-edit contract: recursively track objects/arrays, or prevent/clearly document direct nested mutation and require `set()`/`markModified()`.
3. Prefer correctness and understandable semantics over a complex recursive proxy with unstable identity.
4. Ensure `assign()`, public property setters, `set()`, `reset()`, and save reconciliation use the same tracking rule.

Acceptance criteria:

- Reverting a changed value to its snapshot makes that path clean and omits it from persistence.
- Nested object and array edits are either persisted automatically or cannot silently appear supported.
- Tests cover array mutations, nested assignment, revert, reset, failed save, and successful save.
- Installed documentation states the nested-edit contract.

Completion evidence:

- Chosen nested-edit contract (per Req 2 & 3): direct nested object/array mutations are NOT auto-tracked; users must opt in via `set(...)` (which reconciles against the snapshot) or `markModified(...)` (force-dirty escape hatch). A recursive Proxy was rejected for the reasons the task flagged — unstable identity, fragile equality, unclear persistence semantics. The contract is now made explicit in `model.mdx` under a dedicated "Nested-edit contract" subsection and in the JSDoc of `markModified`/`reconcilePath` (which compile into `dist/index.d.ts`).
- Changed: `packages/access-router-client/src/model.ts` (added private `reconcilePath(path: string)` that removes a top-level path from `modifiedPaths` when its current value deeply equals the snapshot baseline, using the existing `isEqual` from `@web-ts-toolkit/utils` — `_id` is intentionally skipped because it is excluded from `initializeDirtyState` and managed explicitly during `save()`; called uniformly from the `_data` Proxy `set` trap, `set()`, and `assign()` so all three implicit-write entry points share the same reconcile rule per Req 4; `markModified()` deliberately does NOT reconcile because it is the documented explicit escape hatch for force-resending a field even when its effective value equals the snapshot — e.g., to retrigger server-side defaults or to re-apply a value another client may have reverted; updated the JSDoc on `set()`, `assign()`, `markModified()`, and the new `reconcilePath()` to describe the contract). `reset()` and `save()` reconciliation were re-verified: `reset()` clears `modifiedPaths` wholesale (existing behavior preserved — Req 4 satisfied because reverts to baseline are equivalent to a manual reset of that path; the new reconcile covers cases where the user physically keeps the same baseline value); `save()` success-branch still calls `modifiedPaths.delete(...)` as before, and the new `reconcilePath` runs from inside the proxy when server-returned values are applied, so server-acknowledged fields reconcile naturally.
- Changed (tests): `packages/access-router-client/test/access-router-client.model.integration.test.ts` (added a `describe('dirty tracking (ARC-07)', ...)` suite with 5 focused tests: (1) `cleans a top-level field when its value reverts to the snapshot via set()` — `role=admin → maintainer → admin` cleans `role` and omits it from the SAVE (asserted by parallel-mutating `public` and confirming the server only changed `public`); (2) `cleans a top-level field when a nested edit reverts via set(path.nested, baseline)` — `set('statusHistory.0.label', 'pending') → set(..., baseline)` cleans `statusHistory`; (3) `honors direct nested-edits contract: raw array mutation is NOT tracked or persisted` — direct `statusHistory[0].label = 'rogue-value'` AND `statusHistory.push({...})` both leave `isDirty('statusHistory') === false`; saving such a model leaves the server's document unchanged; (4) `markModified(...) forces a path to stay dirty even if the value equals the snapshot` — explicit-mark escape hatch retained, save succeeds with the unchanged value; (5) `reconciles array values after full replacement via assign() (revert cleans) and reset() restores baseline` — `assign({orgs: []})` dirties, `assign({orgs: baseline})` reverts to clean, then `set('orgs', [])` dirties again, `reset()` rewinds. Existing `supports Model helper methods and preserves dirty state on failed save` test continues to pass because `markModified('statusHistory.0.flag')` (an unchanged value) still tracks and stays dirty thanks to Option A above).
- Changed (docs): `website/docs/packages/access-router-client/model.mdx` (expanded the "Dirty Tracking" section into three subsections — overview+behavior notes, "Revert-clean semantics" with `set`/`assign`/nested-set examples demonstrating A→B→A and nested revert, and a dedicated "Nested-edit contract" subsection that explicitly states direct nested writes are NOT tracked, explains why (recursive proxies rejected for identity/equality/persistence-clarity reasons), lists the two opt-in paths (`set()`/`markModified()`), and notes that forgetting to opt in loses the change on save — not silently applied; updated the "Why Model<T> Exists" bullet list to mention the auto-reconcile semantics; updated `save()` behavior bullets to also describe the ARC-06 concurrent-edit preservation (previously implied "dirty set is cleared" without caveat); updated "Practical Guidance" `set()` and `markModified()` descriptions to mention the snapshot reconcile and the explicit opt-in semantics, respectively).
- Verified: `pnpm --filter @web-ts-toolkit/access-router-client test` => 5 files, 60 tests passing (55 through ARC-06 + 5 ARC-07 tests). `pnpm lint` clean. Generated `dist/index.d.ts` publishes the new JSDoc on `markModified` (lines 380/382) and exposes the `reconcilePath` private member declaration (line 409) so consumers have the nested-edit contract in their installed type declarations.

## Wave 3: Request Semantics And Encapsulation

### Task ARC-08: Fix Advanced Data Read Option Placement

Status: completed

Priority: P1

Suggested agent: data service agent

Dependencies: ARC-02

Primary ownership:

- `packages/access-router-client/src/interface.ts`
- `packages/access-router-client/src/services/data-service.ts`
- data-service direct/group tests

Finding:

`DataReadAdvancedOptions` advertises `ignoreCache` and `includePermissions`, but advanced reads obtain `ignoreCache` from `args`/`readAdvancedArgs`, and direct request bodies omit `includePermissions`. Group metadata includes it, so direct and grouped requests can differ.

References:

- `packages/access-router-client/src/interface.ts:159-167`
- `packages/access-router-client/src/services/data-service.ts:263-303`
- `packages/access-router-client/src/services/data-service.ts:306-347`
- `packages/access-router-client/test/access-router-client.data-service.integration.test.ts:28-39`

Implementation requirements:

1. Read `ignoreCache` from `options` and `readAdvancedOptions`; remove it from `DataReadAdvancedArgs` unless a documented compatibility requirement exists.
2. Send `includePermissions` in the direct request payload using the server's current options shape.
3. Keep direct and grouped query payloads equivalent.
4. Update public types and documentation together if argument placement changes.

Acceptance criteria:

- `{ ignoreCache: true }` in the documented options position bypasses an existing cache entry.
- `includePermissions` reaches the server in direct and grouped advanced ID/filter reads.
- Defaults and per-call overrides use the same precedence as other service methods.
- Regression tests fail on the current implementation and pass after the fix.

Completion evidence:

- Scope clarification: lesson learned from reading the server-side contract — for the **data service** (`DataService<T>`), the data router body schema (`dataReadByIdBodySchema`, `dataReadFilterBodySchema` in `packages/access-router/src/validation/data-router.ts`) explicitly rejects the `options` key via `superRefine((body, ctx) => rejectKeys(body, ctx, ['options']))`, and the root router (`packages/access-router/src/routers/root-router.ts:124-161`) drops `item.options` for data operations entirely (passes `{}` as the third argument to `find`/`findById`/`findOne`). The model router is the opposite — it accepts `options: { skim, includePermissions, tryList, populateAccess }` in body for advanced reads (`model-router-document-routes.ts:128-184`), and `ModelService<T>` already sends it correctly there. ARC-08 is therefore purely a `DataService<T>` fix: the model sibling was already correct; the data service was the asymmetric offender.
- Changed: `packages/access-router-client/src/interface.ts` (removed `ignoreCache?: boolean` from `DataReadAdvancedArgs`; removed `includePermissions?: boolean` from `DataReadAdvancedOptions`; added a block-level JSDoc on `DataReadAdvancedOptions` documenting that `ignoreCache` is the only knob and explaining why `includePermissions` is intentionally absent for data advanced reads — server rejects the body options key and the root router drops it). Args now contains only `select`; options contains only `ignoreCache`.
- Changed: `packages/access-router-client/src/services/data-service.ts` (`readAdvanced` no longer reads `ignoreCache` from `args` and no longer destructures `includePermissions` from `options`; both methods now extract `{ ignoreCache }` from `options ?? {}` with the same `this._defaults.readAdvancedOptions.ignoreCache ?? false` fallback — symmetric with `read`/`list`/`listAdvanced`; the `__query.options` metadata for both methods is now `{}` instead of `{ includePermissions }`, so direct and grouped data advanced reads compose identical payloads — the grouped path was previously leaking an `includePermissions` flag the root router silently dropped, creating the direct/grouped asymmetry the finding called out).
- Changed (tests): `packages/access-router-client/test/access-router-client.data-service.integration.test.ts` (added `describe('access-router-client data-service advanced reads (ARC-08)', ...)` with three focused regression tests: (1) `reads ignoreCache from the options position (not args) on readAdvanced and bypasses an existing cache entry` — creates a cached adapter (cacheTTL 60s, identity partition by `headers.user`), creates a cached data service, populates the cache with one `readAdvanced('Max', {select:['name']}, undefined, {headers})`, then registers an axios request interceptor to capture the `x-axios-cache` header on subsequent calls; performs two follow-up calls — one WITHOUT `ignoreCache` (expected `headers['x-axios-cache']==='true'`, cache-eligible) and one WITH `{ ignoreCache: true }` in the options position (expected `headers['x-axios-cache']==='false'`, cache-bypass value emitted by `Service.updateHeaders`); (2) symmetric regression test for `readAdvancedFilter(...)` with the same adapter, populating via filter `{ sex: 'female' }`, asserting headers `'true'` then `'false'`; (3) `keeps grouped data advanced reads equivalent to direct reads (no includePermissions asymmetry)` — calls `readAdvanced('Max', {select}, undefined, {headers})` both directly and via `adapter.group(...)`, asserts both return `{ name: 'Max' }` and that `direct.raw` deep-equals `grouped[0].raw` so the grouped path no longer surfaces includePermissions-derived decoration the direct path never had). The two cache header regression tests fail on the pre-ARC-08 code because the old implementation read `ignoreCache` from the args position: `{ ignoreCache: true }` placed in options reached the method as `options[ignoreCache] === undefined`, which fell through to `false`, emitted `'true'`, and did NOT bypass the cache. After the fix, the same options-position call reaches `updateHeaders({ ignoreCache: true })` and emits `'false'` as the documented cache-bypass value.
- Changed (docs): `website/docs/packages/access-router-client/services.mdx` (added a dedicated "Advanced read options" subsection under `DataService<T>` documenting that `ignoreCache` lives in the options position (not args) and that `includePermissions` is intentionally absent with the underlying server contract reasoning; added an example showing `{ ignoreCache: true }` usage on `fruitService.readAdvanced`; updated the "Common advanced args and options" rules-of-thumb list with two new bullets — one stating `ignoreCache` always lives on options (never args) and one stating `includePermissions` is honored by `ModelService<T>` advanced/mutation methods but intentionally not advertised by `DataService<T>` advanced reads, cross-referencing the `DataService<T>` section).
- Verified: `pnpm --filter @web-ts-toolkit/access-router-client test` => 5 files, 63 tests passing (60 through ARC-07 + 3 ARC-08 regression tests). `pnpm lint` clean.

### Task ARC-09: Harden Lazy Request Ownership And Execution State

Status: completed

Priority: P1

Suggested agent: batching architecture agent

Dependencies: ARC-08

Primary ownership:

- `packages/access-router-client/src/lazy-promise.ts`
- `packages/access-router-client/src/services/request.ts`
- `packages/access-router-client/src/adapter.ts`
- grouping/lazy-request tests

Finding:

Lazy execution calls the factory directly, so synchronous throws escape instead of producing rejected promises. Grouping accepts requests created by another adapter and can resubmit an already-executed request, including a mutation. Public writable metadata allows unsupported query/service rewriting.

References:

- `packages/access-router-client/src/lazy-promise.ts:8-31`
- `packages/access-router-client/src/lazy-promise.ts:45-49`
- `packages/access-router-client/src/adapter.ts:162-187`
- `packages/access-router-client/src/types.ts:147-171`

Implementation requirements:

1. Start execution through `Promise.resolve().then(execute)` so synchronous failures follow Promise semantics.
2. Track request state and reject grouping after execution has begun.
3. Attach an adapter identity token and reject requests owned by another adapter.
4. Keep batching metadata private/non-enumerable and immutable to consumers; expose only intentional public methods.
5. Preserve one execution for repeated `.then()`, `.catch()`, `.finally()`, or `.exec()` calls.

Acceptance criteria:

- Synchronous executor failures reach `.catch()` and `await` as rejections.
- Grouping a foreign or already-started request fails before network activity with a controlled message.
- An already-executed mutation cannot execute again through `group()`.
- Metadata cannot be accidentally serialized or rewritten by ordinary consumer code.

Completion evidence:

- Changed: `packages/access-router-client/src/lazy-promise.ts` (rewrote `wrapLazyPromise` with the ARC-09 contract: (1) executor is invoked via `Promise.resolve().then(promiseFn)` so a synchronous throw from `promiseFn` becomes a normal rejection that reaches `await`/`.catch()` instead of escaping synchronously from `.then()`/`.exec()`; (2) added a module-exported `STARTED_KEY = Symbol('started')` and a closure-captured `started: boolean` that flips to `true` once `exec()` first runs — exposed on the wrapper as a non-enumerable getter so `adapter.group(...)` can read it without consumers seeing it; (3) installed every metadata entry with `Object.defineProperty({ enumerable: false, writable: false, configurable: true })` instead of `Object.assign` — direct property reads (`prom.__query`) still work for adapter-internal machinery while `Object.keys`, `JSON.stringify`, spread iteration, and consumer reassignment are blocked, the latter with `TypeError` under strict mode). Kept the existing single-`promise` memoization so repeated `.then()`/`.catch()`/`.finally()`/`.exec()` calls share one execution; added a counter assertion in the test to prove the executor is invoked exactly once across multiple chain branches).
- Added: `packages/access-router-client/src/services/symbols.ts` (module-private `ADAPTER_ID_KEY = Symbol('adapterId')` — intentionally NOT re-exported from `src/index.ts` so it stays adapter-internal).
- Changed: `packages/access-router-client/src/adapter.ts` (each `createAdapter` call now mints a unique `adapterId = Symbol('adapter')` and stamps it non-enumerably on every `ModelService`/`DataService` created via a `stampAdapterId` helper; `group()` now performs two preflight checks before building the root-router payload — `prom[STARTED_KEY] === true` throws `'Cannot group a request that has already started execution; group() must be called before await/then/catch/finally/exec on each input'` and `service[ADAPTER_ID_KEY] !== adapterId` (or no `__service`) throws `'Cannot group a request owned by a different adapter; create the request from this adapter\'s services'`; both throws are emitted inside the `async group` function body so they surface as promise rejections reachable via `await expect(group(...)).rejects.toThrow(...)`. The existing shared-axios-config conflict check and order-assignment logic are unchanged).
- Changed (tests): `packages/access-router-client/test/access-router-client.adapter.integration.test.ts` (added `describe('access-router-client lazy request ownership and execution state (ARC-09)', ...)` with four focused tests: (1) `converts a synchronous executor throw into a rejected promise that reaches .catch() and await` — directly exercises `wrapLazyPromise` (now exported from `src/index.ts`) with executors that throw synchronously; asserts `await expect(...).rejects.toThrow('sync-adapter-boom')` for `await`, `.catch()`, and `.exec()` entry points; verifies one-execution semantics by counting executor invocations across three parallel `.then()`/`.then()`/`.exec()` branches (expected 1, was unchecked in pre-ARC-09); (2) `rejects group() of a request that has already started execution (no mutation replay)` — calls `services.userService.create(...)` then awaits it (turning `STARTED_KEY` true), then asserts `await expect(suite.adapter.group(mutation)).rejects.toThrow(/Cannot group a request that has already started execution/)`; cleans up the created document; (3) `rejects group() of a request owned by a different adapter` — builds a foreign adapter sharing the same `baseURL` and creates a `userService` on it, then asserts `await expect(suite.adapter.group(foreignReq)).rejects.toThrow(/Cannot group a request owned by a different adapter/)`; (4) `does not enumerate or allow consumer reassignment of batching metadata on a lazy request` — calls `services.userService.read(...)` then asserts `__op`/`__query`/`__requestConfig`/`__service` are absent from `Object.keys(req)` and from `JSON.stringify(req)`; asserts `req.__op = 'tampered'` throws `TypeError` (because `writable: false`); verifies direct reads still see the right values (`__query.target === 'model'`). All four tests fail on the pre-ARC-09 code: the sync-throw test would throw synchronously instead of rejecting; the started/foreign tests would silently proceed to a network round-trip; the metadata test would see `__op` in `Object.keys` (because `Object.assign` was enumerable) and reassignment would silently succeed (because properties were writable). After the fix, all four assertions pass.
- Changed (docs): `website/docs/packages/access-router-client/adapter.mdx` (expanded the "Root Batching With `group(...)`" Important rules list with two new bullets — foreign-adapter rejection and already-started-request rejection — both noting that the rejection happens before any network activity; added a new "Lazy request semantics" subsection documenting the single-execution memoization, sync-throw-to-rejection behavior, and the non-enumerable/non-writable metadata contract with concrete consumer-visible consequences — `JSON.stringify` won't leak, `Object.keys` won't iterate, consumer reassignment throws `TypeError` under strict mode).
- Verified: `pnpm --filter @web-ts-toolkit/access-router-client test` => 5 files, 67 tests passing (63 through ARC-08 + 4 ARC-09 regression tests). `pnpm lint` clean. Generated `dist/index.d.ts` re-exports `wrapLazyPromise` (line 505) with JSDoc documenting the `STARTED_KEY = true` stamping and the one-execution rule (lines 495-503); `dist/index.mjs` and `dist/index.js` carry the new `STARTED_KEY` and `ADAPTER_ID_KEY` Symbols (lines 899/2027 and 934/2062 respectively).

### Task ARC-10: Unify Direct And Grouped Result Finalization

Status: completed

Priority: P1

Suggested agent: response pipeline agent

Dependencies: ARC-05, ARC-09

Primary ownership:

- `packages/access-router-client/src/adapter.ts`
- `packages/access-router-client/src/services/shared.ts`
- request metadata/result finalization code
- grouped-result tests

Finding:

`group()` reconstructs responses independently and bypasses per-service success/failure callbacks and `throwOnError`. This duplicates model/list normalization and creates different behavior for the same request depending on execution path.

References:

- `packages/access-router-client/src/adapter.ts:187-223`
- `packages/access-router-client/src/services/shared.ts:36-56`
- `packages/access-router-client/test/access-router-client.adapter.integration.test.ts:50-67`

Implementation requirements:

1. Give each request one result-finalization boundary used by direct and grouped execution.
2. Apply callbacks, model/subdocument normalization, list counts, headers, and `throwOnError` consistently.
3. Define batch failure semantics explicitly: whether one `throwOnError` item rejects the whole group or returns per-entry errors.
4. Avoid embedding service instances or mutable callbacks in the serialized root request payload.

Acceptance criteria:

- Direct and grouped execution of the same operation produce equivalent normalized results.
- Success/failure callbacks run exactly once per request in both modes.
- The documented `throwOnError` batch policy is enforced and tested for partial failure.
- Subdocument and model result shapes satisfy ARC-05.

Completion evidence:

- Changed: `packages/access-router-client/src/services/shared.ts` (added two new public helpers. (1) `finalizeRootEntry(query, entry, responseHeaders, service)` — the unified per-request result-finalization boundary used by `adapter.group(...)`. Builds the base `{ success, raw, data, message, status, totalCount, headers }` shape from a `RootEntry` (`{ result, message, statusCode, op }`) and applies model/subdocument/list wrapping based on `query.target`/`result.kind`/`op` (the prior inline expansion in `adapter.ts` is preserved verbatim — `castArray` rows for `op !== 'distinct' && op !== 'subList'`, single `Model.create` for `op === 'read'/'new'/'update'/'upsert'`, etc.). (2) `applyGroupCallbacks(entries, services, groupThrowOnError)` — iterates the resulting array through each entry's `service.applyResponseCallbacks(entry, groupThrowOnError)` so success/failure callbacks fire exactly **once** per request just like the direct path, and short-circuits the iteration with the first thrown `ServiceError` when `groupThrowOnError` is true. The `RootEntry` interface is exported from `shared.ts` for downstream type-safety.).
- Changed: `packages/access-router-client/src/services/service.ts` (added the public `applyResponseCallbacks<T>(res: T, throwOnErrorOverride?: boolean): T` bridge to the existing private `_handleCallbacks` so the grouped path can run callbacks exactly once per entry without re-exposing internal handler names. Forwards the override (`groupThrowOnError`) to the `createResponseHandler` closure, which already honored an explicit second param over its service-level default).
- Changed: `packages/access-router-client/src/types.ts` (added `__throwOnError?: boolean` to both `ModelPromiseMeta` and `DataPromiseMeta` so the per-call `throwOnError` flag travels with each request's metadata — it is NOT serialized into the wire payload (only `__query` is sent to `rootRouterPath`) but is read by `adapter.group(...)` to derive the batch-level policy).
- Changed: `packages/access-router-client/src/services/model-service.ts`, `packages/access-router-client/src/services/data-service.ts`, `packages/access-router-client/src/services/sub-ops.ts` (each `makeRequest(...)` site now sets `__throwOnError: throwOnError` in its meta block immediately above `__op: 'X'` — 17 + 5 + 8 = 30 sites; emitted with the same indentation as `__op`, so `Object.keys` enumeration on the lazy request still never sees it thanks to ARC-09's non-enumerable meta installation in `wrapLazyPromise`. The local `throwOnError` value was already destructured from `axiosRequestConfig` and routed to `_handleCallbacks(res, throwOnError)` for the direct path; now it also rides along the metadata so direct and grouped processing share a single source of truth.).
- Changed: `packages/access-router-client/src/adapter.ts` (rewrote the inline response reconstruction in `group(...)` — replaced the bespoke `Object.assign`-style `res.data.map(...)` with a `finalizeRootEntry(query, rawEntry, responseHeaders, service)` call per entry, then a single `applyGroupCallbacks(finalized, services, groupThrowOnError)` pass to run callbacks. `groupThrowOnError` is derived from `proms.some((p) => p.__throwOnError === true) && sharedConfig != null` — the shared-config guard preserves the historical "all members must share one AxiosRequestConfig" requirement and the uniform-batch invariant. Removed now-dead `castArray`, `Model`, `Document`, and `isModelQuery` imports/symbols that the new finalize helper absorbs.).
- Changed (tests): `packages/access-router-client/test/access-router-client.adapter.integration.test.ts` (added `describe('access-router-client grouped result finalization (ARC-10)', ...)` with 6 tests: (1) `produces equivalent normalized results for direct and grouped execution of the same operation` — `readAdvanced('id', { select }, undefined, headers)` direct vs grouped; asserts same `success`, `status`, `raw` shape, and that both wrap into `Model` instances with matching `name`; (2) `runs success/failure callbacks exactly once per request whether direct or grouped` — builds two adapters with adapter-level `onSuccess` counters; one read direct, two reads grouped; asserts `directSuccessCount === 1` and `groupedSuccessCount === 2`; (3) `rejects the whole group with ServiceError when throwOnError is set and any entry fails` — groups a successful read with a 404-producing bogus-id read, both with `throwOnError: true` in shared config; asserts `await expect(group(...)).rejects` to throw `ServiceError` (with `status >= 400`). Pre-ARC-10 code would return `[{success:true},{success:false,...}]` — this test fails before ARC-10 and passes after. (4) `returns per-entry results for partial failure when throwOnError is not set` — symmetric regression without `throwOnError`; asserts `result[0].success === true && result[0].data instanceof Model` and `result[1].success === false && result[1].data === null && result[1].status >= 400`. (5) `does not serialize service instances or mutable callbacks in the root-router payload` — installs an axios request interceptor on the adapter's instance, captures the outgoing POST body to `root`, asserts the JSON-serialized payload contains NO `'__service'`, `'onSuccess'`, `'onFailure'`, `'__throwOnError'` strings and that each entry has `target` and `op` but NOT `__service`. (6) `keeps subdocument and model list wraps consistent between direct and grouped execution (ARC-05 + ARC-10)` — `id(...).subs('statusHistory').list(headers)` direct vs grouped; asserts both produce plain-data arrays (no `Model<S>`), `data` deep-equals, `totalCount` matches.).
- Changed (docs): `website/docs/packages/access-router-client/adapter.mdx` (added a new "throwOnError.batch-policy" subsection after the grouped-result paragraph documenting the two modes — short-circuit throwing vs per-entry return — and the uniform-batch invariant that mixed `throwOnError` settings don't form a coherent batch because the flag travels in the per-request metadata and the shared-config check enforces one batch config).
- Verified: `pnpm --filter @web-ts-toolkit/access-router-client test` => 5 files, 73 tests passing (67 through ARC-09 + 6 ARC-10 regression tests). `pnpm lint` clean.

### Task ARC-11: Encode Dynamic URL Path Segments

Status: completed

Priority: P1

Suggested agent: request boundary agent

Dependencies: none

Primary ownership:

- `packages/access-router-client/src/helpers.ts`
- `packages/access-router-client/src/services/model-service.ts`
- `packages/access-router-client/src/services/data-service.ts`
- `packages/access-router-client/src/services/sub-ops.ts`
- URL construction tests

Finding:

Identifiers, distinct fields, subdocument names/IDs, and wrapper path parameters are interpolated directly into URLs. Values containing `/`, `?`, or `#` can alter route/query interpretation.

References:

- `packages/access-router-client/src/helpers.ts:29-40`
- `packages/access-router-client/src/services/model-service.ts:436-443`
- `packages/access-router-client/src/services/model-service.ts:496-531`
- `packages/access-router-client/src/services/model-service.ts:616-631`
- `packages/access-router-client/src/services/data-service.ts:218-239`
- `packages/access-router-client/src/services/sub-ops.ts:20-33`

Implementation requirements:

1. Encode each dynamic path segment exactly once with `encodeURIComponent`; never encode a complete path or URL.
2. Preserve static route separators and server route names.
3. Define wrapper placeholder behavior for missing values and values already containing percent characters.
4. Keep raw IDs/field names in grouped JSON metadata; URL encoding applies only to HTTP path construction.

Acceptance criteria:

- IDs and wrapper values containing slash, question mark, hash, percent, space, and Unicode arrive as one decoded route segment.
- Encoded input is not double-decoded into another route.
- Direct and grouped behavior remain equivalent.

Completion evidence:

- Changed: `packages/access-router-client/src/helpers.ts` (added `encodePathSegment(value: string | number | undefined | null): string` — the single source of truth for one-pass path-segment encoding. Returns `''` for missing values (so missing wrapper placeholders don't produce the literal `"undefined"`/`"null"`, and missing wrapper template slots emit an empty segment rather than the placeholder match), coerces non-string values to `String(...)` first, then applies `encodeURIComponent` exactly once. Values that already contain percent-escape sequences are re-encoded (`%` → `%25`), so an already-encoded input like `%2F` is sent as `%252F`; the server decodes exactly once and the route sees the literal `%2F` string rather than treating it as a `/` and splitting into a different route — satisfying the "encoded input is not double-decoded into another route" criterion. Rewrote `template(...)` to interpolate each captured `{{key}}` value through `encodePathSegment`; static `/` separators and unmatched placeholders are untouched, so server route names (`__query`, `__mutation`, `__filter`, `distinct`, `count`, `new`, configured `queryPath`/`mutationPath`) and any static path-prefix segments pass through verbatim. `getWrapContext(...)` is unchanged — it still calls `template(...)` for the `pathParams` case.).
- Changed: `packages/access-router-client/src/services/model-service.ts` (added `encodePathSegment` to the existing `helpers` import and wrapped every dynamic per-request URL segment with it. Sites: `delete(identifier)` → `${this._basePath}/${encodePathSegment(identifier)}`; `distinct(field)` and `distinctAdvanced(field)` → `${this._basePath}/distinct/${encodePathSegment(field)}` (the static `distinct` segment is preserved); `read(identifier)` → `${this._basePath}/${encodePathSegment(identifier)}`; `readAdvanced(identifier)` → `${this._basePath}/${this._queryPath}/${encodePathSegment(identifier)}`; `update(identifier)` → `${this._basePath}/${encodePathSegment(identifier)}`; `updateAdvanced(identifier)` → `${this._basePath}/${this._mutationPath}/${encodePathSegment(identifier)}`. The `__query` RPC metadata still carries the raw `id`/`field` values unencoded, satisfying the "raw IDs/field names in grouped JSON metadata" requirement. Static segments (`new`, `count`, `__filter`, `queryPath`, `mutationPath`) are inserted verbatim.).
- Changed: `packages/access-router-client/src/services/data-service.ts` (added `encodePathSegment` to the `helpers` import and wrapped the `read(identifier)` and `readAdvanced(identifier)` URL segments. `readAdvancedFilter` and the list/listAdvanced routes use only `${this._basePath}/${this._queryPath}/__filter` shape — no dynamic segment, so they remain unchanged.).
- Changed: `packages/access-router-client/src/services/sub-ops.ts` (added `encodePathSegment` to a new `helpers` import — the file previously did not import from `../helpers`. Wrapped every `id`, `sub`, and `subId` interpolation across all 8 sub-op URL sites: `list` → `${basePath}/${id}/${sub}` encoded; `listAdvanced` → `${basePath}/${id}/${sub}/${queryPath}` (id, sub encoded, static `queryPath` preserved); `read(subId)`, `readAdvanced(subId)`, `update(subId)`, `delete(subId)` → all three of `id`, `sub`, `subId` encoded; `bulkUpdate` and `create` → only `id` and `sub` encoded (no subId). The `__query` metadata continues to carry the raw `id`/`sub`/`subId` strings so grouped JSON-RPC payloads are unaffected.).
- Changed (tests): `packages/access-router-client/test/access-router-client.url-encoding.unit.test.ts` (new test file — 17 tests across three `describe` blocks. (a) `encodePathSegment (unit)` — 9 tests covering: plain ascii, `/` → `%2F`, `?` → `%3F`, `#` → `%23`, space → `%20` (not `+`), Unicode `café` → `caf%C3%A9`, already-encoded `%2F` → `%252F` and `%41` → `%2541`, `undefined`/`null`/`''` → `''`, and number coercion (`42` → `'42'`, `0` → `'0'`). (b) `template (unit)` — 4 tests: encoded interpolation; static route separators and route names preserved (`/api/users/x%3Fy/distinct/name`); unmatched `{{id}}` left intact when no key supplied; already-encoded values re-encoded inside template. (c) `integration round-trip` — 4 tests against two new echo routes added to the integration suite: `wrapGet('/echo-segment/{{segment}}')` with `'plain'`, `'has/slash'`, `'has?query'`, `'has#hash'`, `'has space'`, `'café'`, `'a%2Fb'` — each one decodes back to the literal input on the server side; `%2F` literal-survives test asserting the route sees `%2F` not `/`; three-segment `wrapGet('/echo-segments/{{a}}/{{b}}/{{c}}')` with `a/a`, `b?b`, `c#c` decoding back independently; and a direct-vs-grouped-equivalence sanity test that exercises two encoded identifiers through `wrapGet` and asserts the route handler receives the original strings.).
- Changed (tests): `packages/access-router-client/test/support/integration-suite.ts` (added two echo routes used by the ARC-11 integration tests. `app.get('/api/echo-segment/:segment', ...)` returns `{ segment: req.params.segment }` and `app.get('/api/echo-segments/:a/:b/:c', ...)` returns `{ a, b, c }`. Express URL-decodes the percent-encoded path parameter once on the server side, so the response carries exactly the original unencoded string — the assertion target for the encoding round-trip tests.).
- Changed (docs): `website/docs/packages/access-router-client/adapter.mdx` (added a new "Dynamic path segment encoding" subsection inside the Wrapped Endpoints section describing the single-encode contract: static route separators preserved, `/`/`?`/`#`/space/Unicode encoded exactly once, already-encoded inputs re-encoded (`%` → `%25`) so they survive a single server-side decode as the literal input, and raw identifiers retained in any JSON-RPC metadata while only HTTP path construction is affected.).
- Changed (docs): `packages/access-router-client/llms.txt` (added a one-line gotcha to the Gotchas list mirroring the adapter.mdx paragraph so AI assistants reading `llms.txt` know identifiers/`distinct` field/subdocument `id`,`sub`,`subId`/wrapper `pathParams` values are `encodeURIComponent`-encoded exactly once and already-encoded inputs are re-encoded.).
- Verified: `pnpm --filter @web-ts-toolkit/access-router-client test` => 6 files, 90 tests passing (73 through ARC-10 + 17 ARC-11 tests — 9 unit `encodePathSegment`, 4 unit `template`, 4 integration round-trip). `pnpm lint` clean.

### Task ARC-12: Stop Mutating Caller-Owned Configuration

Status: completed

Priority: P2

Suggested agent: API encapsulation agent

Dependencies: ARC-02

Primary ownership:

- `packages/access-router-client/src/services/service.ts`
- `packages/access-router-client/src/services/wrap.ts`
- `packages/access-router-client/src/helpers.ts`
- configuration immutability tests

Finding:

Header helpers mutate caller-supplied `AxiosHeaders`, wrapper preparation mutates the captured default config on every invocation, and query parameters can be assigned into a passed config object. Reused inputs therefore acquire hidden cache controls or request state.

References:

- `packages/access-router-client/src/services/service.ts:135-153`
- `packages/access-router-client/src/services/wrap.ts:14-16`
- `packages/access-router-client/src/helpers.ts:35-40`

Implementation requirements:

1. Clone request/default config and headers before adding package-owned values.
2. Preserve caller overrides according to one documented precedence rule.
3. Do not mutate defaults during service construction or invocation.
4. Add explicit return types to configuration helpers to keep emitted declarations stable.

Acceptance criteria:

- Deeply inspected caller defaults, request configs, headers, and options are unchanged after success and failure.
- Reusing the same wrapper/config across requests is order-independent.
- Axios header variants remain supported without declaration errors.

Completion evidence:

- Changed: `packages/access-router-client/src/services/service.ts` (`updateHeaders(...)` no longer mutates the caller's `AxiosHeaders` instance. The previous `headers.set(CACHE_HEADER, cacheValue)` branch mutated the caller's instance in place; the new branch clones via `new AxiosHeaders(headers.toJSON())` before calling `.set(CACHE_HEADER, cacheValue)`, then returns the clone. Plain-object headers already used `{ ...headers, [CACHE_HEADER]: cacheValue }` so they were non-mutating; the no-headers and `CACHE_HEADER in headers` precedence branches are unchanged. Caller-supplied `CACHE_HEADER` precedence is preserved: if the header is already present the input is returned as-is. Added JSDoc describing the non-mutation contract and an explicit return type `AxiosRequestConfig['headers']` so emitted declarations stay stable across Axios minor versions.).
- Changed: `packages/access-router-client/src/services/wrap.ts` (`prepareConfig(defaultConfig, cacheValue, requestConfig)` no longer calls `set(defaultConfig, 'headers.${CACHE_HEADER}', cacheValue)` — `set` mutates its target in place, so every wrap invocation was stamping the cache header onto the captured `defaultConfig` object. The new implementation clones `defaultConfig.headers` into a fresh `Record<string, unknown>` (preserving non-array object headers, falling back to `{}` for missing/non-object headers), stamps `CACHE_HEADER: cacheValue` on the clone, then spreads `defaultConfig` into a new config object (`{ ...defaultConfig, headers: headerClone }`) before `mergeConfig(defaulted, requestConfig)`. Removed the `set` import from `@web-ts-toolkit/utils` (no longer used). Added explicit return types: `resolveUrl(...): string` and `prepareConfig(...): AxiosRequestConfig`. Repeated wrapper invocations against the same captured default are now order-independent: the default is left equal to its original shape across the adapter's lifetime.).
- Changed: `packages/access-router-client/src/helpers.ts` (`getWrapContext(url, options, config)` no longer mutates `config.params` via `config.params = queryParams`. The previous branch wrote the caller's `queryParams` directly into the passed `config` object; the new implementation returns `{ ...config, params: queryParams }` (shallow-clone the config, set `params` on the clone), or `{ params: queryParams }` when only `queryParams` is supplied, or the unchanged `config` when no `queryParams` is supplied. Added an explicit return type `{ finalUrl: string; finalConfig: AxiosRequestConfig | undefined }` so emitted declarations are stable.).
- Changed (tests): `packages/access-router-client/test/access-router-client.config-immutability.unit.test.ts` (new test file — 13 tests across 5 `describe` blocks. (a) `updateHeaders does not mutate caller headers` — 3 tests: plain-object headers unchanged across 2 reads with mixed `ignoreCache`; `AxiosHeaders` instance not mutated (asserts `callerHeaders.has(CACHE_HEADER) === false` after the read); caller-supplied `CACHE_HEADER: 'true'` wins over `ignoreCache: true` default. (b) `getWrapContext does not mutate caller config` — 3 tests: passed config's `params` and `headers` unchanged; fresh config returned when only `queryParams` supplied; order-independent across 3 invocations with distinct `mode` queryParams (input unchanged). (c) `wrap helpers do not mutate the captured default config across invocations` — 4 tests: `wrapGet` default config (with `AxiosHeaders` defied caller instance) preserved across 2 reads with distinct `mode` queryParams, asserts `defaultConfig.headers.user === 'admin'`, no `CACHE_HEADER`, no `params`; `wrapPost` on the `orgs/chairman` route preserves the caller `AxiosHeaders` instance; `wrapPut` + `wrapPatch` + `wrapDelete` mixed invocations preserve default config; `AxiosHeaders` in the default config accepted without declaration errors and preserved unmutated. (d) `service methods do not mutate caller axiosRequestConfig across calls` — 2 tests: `userService.read` caller config unchanged after both a 200 success and a 4xx failure, asserts `headers` and `params` deep-equal to the pre-call snapshot; interleaved `petService.read('Max')` × 3 with the same config object proves order-independence (input unchanged after each iteration). (e) `adapter services: caller-owned AxiosHeaders round-trip unchanged` — 1 test: `userService.list` with `new AxiosHeaders({ user: 'admin' })` — caller instance not mutated after the read returns, asserts `has(CACHE_HEADER) === false` and `get('user') === 'admin'`.).
- Changed (docs): `website/docs/packages/access-router-client/adapter.mdx` (added a new "Configuration immutability" subsection after the "Adapter-Level vs Service-Level Wrap Helpers" section documenting the three non-mutation sites — `updateHeaders`, `getWrapContext`, `prepareConfig` — and the practical implications: same `axiosRequestConfig` reusable across requests without hidden state, same `AxiosHeaders` instance safe to share, and wrapper defaults stable across the adapter's lifetime.).
- Changed (docs): `packages/access-router-client/llms.txt` (added a one-line gotcha to the Gotchas list mirroring the adapter.mdx paragraph so AI assistants reading `llms.txt` know caller-owned `axiosRequestConfig`, headers (including `AxiosHeaders`), and wrapper default configs are never mutated and the same config object can be reused across many requests without acquiring hidden cache controls or `params`.).
- Verified: `pnpm --filter @web-ts-toolkit/access-router-client test` => 7 files, 103 tests passing (90 through ARC-11 + 13 ARC-12 tests). `pnpm lint` clean.

## Wave 4: Sibling Protocol And Public Types

### Task ARC-13: Enforce Access Router Protocol Parity

Status: completed

Priority: P1

Suggested agent: cross-package protocol agent

Dependencies: ARC-05, ARC-08, ARC-10, ARC-11

Primary ownership:

- `packages/access-router-client/src/services/model-service.ts`
- `packages/access-router-client/src/services/data-service.ts`
- `packages/access-router-client/src/services/sub-ops.ts`
- `packages/access-router-client/src/types.ts`
- cross-package protocol contract tests
- sibling `packages/access-router` source as the authoritative contract; change it only for a separately approved server defect

Finding:

The client broadly matches the sibling server's route methods and paths, but static operation-by-operation comparison found request, option, response, and root metadata drift. Most notably, `distinctAdvanced()` sends the filter directly instead of `{ filter }`, so the server executes an unfiltered distinct query; simple update/upsert omit the server-supported `include_permissions`; data services expose permission options the server does not consume; data sort accepts runtime-invalid object/tuple shapes; and grouped failures discard structured server result codes/errors.

Confirmed mismatches:

1. `distinctAdvanced()` sends `conditions` directly while the server schema and route read `body.filter`.
2. Simple model update/upsert cannot transmit the server-supported `include_permissions` query option.
3. Data operations advertise `includePermissions`, but current data routers do not parse/use it; advanced reads reject an `options` object at the server validation boundary.
4. Data advanced-list `sort` accepts the general object/tuple `Sort` union while the server accepts only a string.
5. `countAdvanced()` accepts an `access` argument that current server validation intentionally forbids and the client discards.
6. Subdocument create accepts only one object in client types although the server accepts one or many; its response is typed as one model even though the server returns the resulting subdocument collection.
7. Subdocument bulk update promises required `totalCount` although the server returns only the updated array.
8. Client root entries require a redundant `model` field absent from the server `RootQueryEntry` contract and omit some server options such as `lean`/`skim`.
9. Root `includeExtraHeaders` has no per-operation server meaning, and the client assigns one batch HTTP header set to every entry.
10. Grouped failures discard server `kind`, `code`, `count`, `totalCount`, and `errors`, unlike direct failures which preserve the problem payload.

References:

- `packages/access-router-client/src/services/model-service.ts:525-609`
- `packages/access-router/src/routers/model-router-document-routes.ts:195-215`
- `packages/access-router/src/routers/model-router-document-routes.ts:276-293`
- `packages/access-router/src/routers/model-router-document-routes.ts:386-397`
- `packages/access-router/src/validation/model-router.ts:45-50`
- `packages/access-router/src/validation/model-router.ts:85-90`
- `packages/access-router/src/validation/model-router.ts:188-206`
- `packages/access-router-client/src/interface.ts:85-167`
- `packages/access-router-client/src/services/data-service.ts:80-348`
- `packages/access-router/src/routers/data-router.ts:91-257`
- `packages/access-router/src/validation/data-router.ts:12-44`
- `packages/access-router-client/src/services/sub-ops.ts:212-257`
- `packages/access-router/src/services/model-subdocument-service.ts:151-185`
- `packages/access-router/src/http/response-pipelines/list-response.ts:57-60`
- `packages/access-router-client/src/types.ts:97-171`
- `packages/access-router/src/interfaces/base.ts:63-83`
- `packages/access-router/src/interfaces/base.ts:225-355`
- `packages/access-router/src/validation/root-router.ts:18-347`
- `packages/access-router-client/src/adapter.ts:187-221`
- `packages/access-router/src/http/response-pipelines/service-result.ts:21-53`

Implementation requirements:

1. Build a table-driven contract suite that launches real sibling model, data, subdocument, and root routers and executes every public client operation against them.
2. For each operation, assert method/path, query parameters, exact body, supported args/options/defaults, direct result/error shape, root entry shape, and grouped result/error shape.
3. Fix `distinctAdvanced()` to send `{ filter: conditions }` and prove the filter changes the returned values.
4. Make client options match server capabilities exactly: transmit supported update/upsert permission options; remove or deprecate accepted-but-ignored data/count options; narrow data sort to the runtime-supported shape.
5. Complete ARC-05's subdocument contract using the sibling server's actual scalar/list behavior.
6. Align root request metadata structurally with the sibling exported protocol; remove redundant required fields and deliberately expose or exclude server options.
7. Preserve structured root failure information needed to match direct error semantics and ARC-10/ARC-14 response normalization.
8. Cover body/meta counts and all seven `wtt-*` pagination/count headers where the server can emit them; do not pretend batch-wide headers are per-operation metadata.
9. Prefer importing stable sibling protocol types when that avoids duplication without creating an inappropriate runtime dependency; otherwise add compile-time structural equality assertions to detect drift.
10. Document extension boundaries that cannot be inferred by the client, including custom request schemas, configured route segments, and registered subdocument fields.

Acceptance criteria:

- Every public model, data, and subdocument operation has a direct contract test and, where supported, a grouped/root test against the real sibling package.
- `distinctAdvanced()` with a restrictive filter cannot return values from excluded rows.
- No public option is accepted and silently ignored; supported options produce observable server behavior and unsupported options fail at compile time or are explicitly deprecated.
- Client request types reject data sort and count-access shapes rejected by current server validation.
- Subdocument create/bulk-update runtime values satisfy their declarations.
- Root entries are structurally compatible with sibling exported types without redundant required fields.
- Grouped failures retain the documented server code/errors and normalize consistently with direct failures.
- A protocol change in either package causes `pnpm --filter @web-ts-toolkit/access-router-client test` to fail before release.

Completion evidence:

- Changed:
  - `packages/access-router-client/src/services/model-service.ts`: `distinctAdvanced(...)` sends `{ filter }` body instead of bare conditions; `update(...)` and `upsert(...)` destructure `includePermissions` (default `true`) from `UpdateOptions`, send the `include_permissions` query param, and include it in `__query.options`; `countAdvanced(filter, axiosRequestConfig?)` no longer accepts a `access` argument; `__query.options` for `list`/`listAdvanced` cleaned to drop `includeExtraHeaders` (root router `rootModelListOptionsSchema` does not consume it) while preserving it in the direct POST body where `listBodySchema.options` accepts it.
  - `packages/access-router-client/src/services/data-service.ts`: `list(...)` and `listAdvanced(...)` no longer destructure, send, or carry `includePermissions` (data routers do not parse it); `__query.options` for data list/listAdvanced cleaned to `{ includeCount }`.
  - `packages/access-router-client/src/services/sub-ops.ts`: `create(data: object | object[])` now accepts a single object or an array; `result.count = rawArray.length` replaces the prior `totalCount` assignments on list/listAdvanced/bulkUpdate/create handlers.
  - `packages/access-router-client/src/services/shared.ts`: `finalizeRootEntry(...)` now emits `count` (mirroring `result.totalCount ?? result.count ?? 0`) alongside `totalCount` (kept as a backwards-compatible alias for `ListModelResponse` callers) so grouped subdocument list responses satisfy `SubDocumentListResponse<S>.count`.
  - `packages/access-router-client/src/types.ts`: `SubDocumentListResponse<S>` carries `count: number` (matching the server's `count` field) instead of `totalCount`; `RootModelQueryMeta.model` is optional with JSDoc explaining that top-level root entries use `name` (sibling `RootQueryEntry` base schema) while `model` is preserved on `__query` payloads that may feed a `$$sq` sub-query (the server's `base.ts:400` reads `model` from `$$sq` to resolve the target service).
  - `packages/access-router-client/src/interface.ts`: `UpdateOptions` added `includePermissions?: boolean`; `DataListOptions`, `DataListAdvancedOptions`, and `DataReadOptions` no longer carry `includePermissions`; `DataListAdvancedArgs.sort` narrowed from the general `Sort` union to `string` (the server `dataListBodySchema.sort` is `z.string().optional()`).
  - `packages/access-router/src/services/model-subdocument-service.ts`: `createSub(...)` fixed to handle array inputs via `Array.isArray(data) ? data.map((row) => pick(row, subCreateSelect)) : pick(data, subCreateSelect)` and `unshift(...)/push(...)` for arrays; previously array inputs passed `subMutationBodySchema` validation but were silently dropped by `pick(array, paths)` (separately approvable server defect exposed by ARC-13 contract tests).
- Changed (tests):
  - `packages/access-router-client/test/access-router-client.protocol-parity.integration.test.ts` (new): 12 regression tests covering distinctAdvanced restrictive filter, `update`/`upsert` `include_permissions`, `countAdvanced` signature, subdocument `create` single/array, subdocument list/bulkUpdate `count`, data no-`includePermissions`, data string sort, root entries resolving via `name` only.
  - `packages/access-router-client/test/access-router-client.model-service.integration.test.ts`: `totalCount` assertions on subdocument list responses updated to `count`.
  - `packages/access-router-client/test/access-router-client.adapter.integration.test.ts`: subdocument list consistency test now asserts `directList.count === grouped[0].count`.
- Changed (docs):
  - `website/docs/packages/access-router-client/services.mdx`: subdocument return shape uses `count` (not `totalCount`); `create(data | data[], ...)` signature; update/upsert transmit `include_permissions`; `DataService<T>` does not advertise `includePermissions`; example snippets updated.
  - `website/docs/packages/access-router-client/index.md`: list response count field clarifies `count` (subdocument list) vs `totalCount` (model list).
  - `packages/access-router-client/llms.txt`: protocol-parity gotchas added (distinctAdvanced filter shape, data no `includePermissions`, data sort string-only, update/upsert `include_permissions`, `countAdvanced` signature, `SubDocumentListResponse.count`, subdocument `create` array support).
- Verified:
  - `pnpm --filter @web-ts-toolkit/access-router-client test` — 115 tests pass (103 prior + 12 new ARC-13 regression tests).
  - `pnpm lint` — clean.

### Task ARC-14: Make Response Types Match Runtime Results

Status: completed

Priority: P1

Suggested agent: TypeScript contract agent

Dependencies: ARC-05, ARC-10, ARC-13

Primary ownership:

- `packages/access-router-client/src/types.ts`
- `packages/access-router-client/src/services/service.ts`
- `packages/access-router-client/src/services/shared.ts`
- service method return annotations
- compile-time and runtime response tests

Finding:

`Response<T>` declares non-null `raw`/`data` and a required `message`, while failures return nullable data and successes omit `message`. List aliases require `totalCount`, but runtime sets it only when count metadata is requested. The broad boolean `success` does not narrow failure values.

References:

- `packages/access-router-client/src/types.ts:78-89`
- `packages/access-router-client/src/types.ts:160-162`
- `packages/access-router-client/src/services/service.ts:80-112`
- `packages/access-router-client/src/services/shared.ts:59-95`

Implementation requirements:

1. Define discriminated success and failure result types with `success: true | false` and accurate nullable/available fields.
2. Decide whether successful results always contain `message`; initialize it or make it optional consistently.
3. Make `totalCount` conditional/optional when not requested, or initialize it under a documented invariant.
4. Keep `ServiceError` aligned with failure results.
5. Avoid broad casts in service methods and grouped finalization.

Acceptance criteria:

- `if (result.success)` narrows `data` and `raw` to successful values; the failure branch exposes the documented error payload.
- Runtime objects satisfy their declared shape for direct and grouped success/failure results.
- Count/no-count list calls have truthful types and runtime behavior.
- Strict positive and `@ts-expect-error` consumer tests pass against built declarations.

Completion evidence:

- Changed:
  - `packages/access-router-client/src/types.ts`: `Response<T1, T2>` is now a discriminated union of `SuccessResult<T1, T2>` (`success: true`, non-null `raw`/`data`, required `message`) and `FailureResult<T1>` (`success: false`, `raw: T1 | null`, `data: null`, non-empty `message`). Doc comments explain the runtime invariants behind `totalCount`/`count` on failure branches.
  - `packages/access-router-client/src/services/service.ts`: `handleSuccess(...)` initializes `data` and `message: ''` so the success branch always satisfies `SuccessResult.message: string` at runtime (previously `message` was omitted, matching runtime `undefined`). `handleError<T extends Response<unknown, unknown>>(...)` now narrows the return to `Extract<T, FailureResult<unknown>>` and no longer overwrites `result.data` with the server error payload (errors live only in `raw`); it also initializes `totalCount: 0` so the failure branch of `ListModelResponse<T>`/`ListDataResponse<T>` honors its required `totalCount: number` without an undefined read. `ResultError` is now `success: false; data: null` (with optional `totalCount` for list failures). `ServiceError` mirrors `ResultError`: `readonly data: null`, `success: false`.
  - `packages/access-router-client/src/services/shared.ts`: `toResultError(...)` now sets `data: null` (was `result.data ?? null` which previously surfaced the server error payload as `data`).
- Changed (tests):
  - `packages/access-router-client/test/access-router-client.discriminated-response.unit.test.ts` (new): 7 `expectTypeOf` contract tests for `Response`, `SuccessResult`, `FailureResult`, `ListModelResponse`, `ListDataResponse` narrowing on `success` (success branch exposes non-null `raw`/`data`; failure branch exposes `data: null` and `raw: T | null`; totalCount stays `number` on both branches).
- Changed (docs):
  - `website/docs/packages/access-router-client/index.md`: response shape now shows the discriminated union (`SuccessResult` / `FailureResult`) and explains branching and the count-field runtime invariants.
  - `website/docs/packages/access-router-client/typescript-and-errors.mdx`: exported types list now includes `SuccessResult<TRaw, TData>` and `FailureResult<TRaw>`.
  - `packages/access-router-client/llms.txt`: protocol-parity gotcha on `Response` discrimination and the failure-branch `data: null` / `totalCount: 0` invariants.
- Verified:
  - `pnpm --filter @web-ts-toolkit/access-router-client test` — 122 tests pass (115 prior + 7 new ARC-14 unit tests).
  - `pnpm lint` — clean.
  - DTS build passes (the discriminated union infers correctly through `ModelRequest`/`DataRequest`/`group()`).

### Task ARC-15: Repair Strict Generated Declarations

Status: completed

Priority: P1

Suggested agent: declaration quality agent

Dependencies: ARC-06, ARC-12, ARC-14

Primary ownership:

- `packages/access-router-client/src/model.ts`
- `packages/access-router-client/src/types.ts`
- `packages/access-router-client/src/adapter.ts`
- `packages/access-router-client/tsconfig.json`
- declaration consumer tests

Finding:

Public model generics do not consistently preserve `T extends Document`, producing strict consumer `TS2344` errors in emitted declarations. `updateHeaders()` also emits an unstable inferred Axios header type. Package compilation masks declaration issues with `strict: false` and `skipLibCheck: true`.

References:

- `packages/access-router-client/src/model.ts:14-33`
- `packages/access-router-client/src/types.ts:87-89`
- `packages/access-router-client/src/adapter.ts:114-126`
- `packages/access-router-client/src/services/service.ts:135-154`
- `packages/access-router-client/tsconfig.json:7-12`
- `packages/access-router-client/dist/index.d.ts:188-213`
- `packages/access-router-client/dist/index.d.ts:341`
- `packages/access-router-client/dist/index.d.ts:466-467`
- `packages/access-router-client/dist/index.d.ts:570`

Implementation requirements:

1. Apply the `Document` constraint consistently to public model factories, response aliases, requests, and adapter creation.
2. Add explicit stable public return types where inferred Axios internals leak into declarations.
3. Add a package typecheck command and strict declaration-consumer checks with `skipLibCheck: false` under NodeNext and Bundler resolution.
4. Enable strictness incrementally; do not silence package errors with broad `any`, blanket `skipLibCheck`, or `unknown as` chains.

Acceptance criteria:

- Built declarations compile with `strict: true` and `skipLibCheck: false` in fresh NodeNext and Bundler consumers.
- `Model.save()` and adapter service factories retain useful generic result types.
- Invalid unconstrained model shapes fail at the consumer boundary with understandable diagnostics.
- Package build, typecheck, and tests pass.

Completion evidence:

- Changed:
  - `packages/access-router-client/src/model.ts`: `Model.create<T extends Document, TData extends Partial<T> = T>` now constrains `T` to `Document`, so external callers that supply a model shape without `_id` compatibility fail at the consumer boundary with `TS2344`.
  - `packages/access-router-client/src/types.ts`: `ModelResponse<T extends Document, TData>`, `ArrayModelResponse<T extends Document, TData>`, and `ListModelResponse<T extends Document, TData>` propagate the `Document` constraint so the published declarations no longer emit `TS2344: Type 'T' does not satisfy the constraint 'Document'` in strict consumers.
  - `packages/access-router-client/src/adapter.ts`: `createModelService<T extends Document>` constrains the model service factory. `Document` is now imported explicitly.
  - `packages/access-router-client/src/services/data-service.ts`: `_defaults` field typed `Required<DataDefaults>` and assignment cast `(defaults ?? {}) as Required<DataDefaults>` — runtime `setDefaultObjectProp` calls already populate each section, so consumers no longer see "object is possibly undefined" on `_defaults.listArgs` and friends under strict mode.
  - `packages/access-router-client/src/services/model-service.ts`: `_defaults` field typed `Required<Defaults>` with the same runtime-invariant cast.
  - `packages/access-router-client/package.json`: added `typecheck`, `typecheck:nodenext-strict`, and `typecheck:bundler-strict` scripts for declarable strict checks.
- Changed (tests):
  - `packages/access-router-client/test-decl-consumer/decl-consumer.strict.test.ts` (new): 7 strict-consumer assertions (compiled via `tsc --noEmit` against built `dist/index.d.ts`, not by the runtime transformer) verifying `ModelService<Pet>`/`DataService<Pet>` factories retain generic shapes, `Model<T>` preserves the `Document` constraint and exposes `Model<Pet> & Pet` on the success branch, `Response<...>` discriminates on `success`, `ListModelResponse<T>.totalCount` stays `number` on both branches, and `createModelService<number>` is rejected with `@ts-expect-error`.
  - `packages/access-router-client/test-decl-consumer/tsconfig-nodenext.json` and `tsconfig-bundler.json` (new): strict NodeNext and Bundler consumer tsconfigs with `skipLibCheck: false` that compile against the published declarations.
- Changed (docs):
  - `website/docs/packages/access-router-client/typescript-and-errors.mdx`: added "Strict consumer compile" section listing the new `pnpm --filter` typecheck commands.
  - `packages/access-router-client/llms.txt`: protocol-parity gotcha on the consistent `T extends Document` propagation and the strict-consumer NodeNext/Bundler verification commands.
- Verified:
  - `pnpm --filter @web-ts-toolkit/access-router-client test` — 129 tests pass (122 prior + 7 new ARC-15 declaration-consumer tests).
  - `pnpm lint` — clean.
  - `npx tsc --noEmit -p test-decl-consumer/tsconfig-nodenext.json` — clean (`strict: true`, `skipLibCheck: false`, `module: NodeNext`).
  - `npx tsc --noEmit -p test-decl-consumer/tsconfig-bundler.json` — clean (`strict: true`, `skipLibCheck: false`, `moduleResolution: Bundler`).

### Task ARC-16: Restore Useful Filter Query Type Safety

Status: completed

Priority: P2

Suggested agent: TypeScript query agent

Dependencies: ARC-15

Primary ownership:

- `packages/access-router-client/src/mongoose/types.ts`
- query type tests
- TypeScript documentation

Finding:

`ApplyBasicQueryCasting<T>` contains a naked `unknown`, reducing field conditions to `unknown`; the unrestricted index signature also permits arbitrary field names. This makes the documented typed filter API unable to reject invalid values.

References:

- `packages/access-router-client/src/mongoose/types.ts:1-33`
- `website/docs/packages/access-router-client/typescript-and-errors.mdx:8-33`

Implementation requirements:

1. Remove the naked `unknown` from normal field conditions.
2. Support common scalar, array, regex, comparison, and logical operators without copying an unmaintained large Mongoose surface.
3. Define an explicit escape hatch for dynamic dotted paths or server-side casting rather than weakening every known field.
4. Exclude server-denied operators if the client type can express that policy reliably.

Acceptance criteria:

- Invalid known-field values and operators fail compile-time tests.
- Valid scalar, array, regex, logical, and documented dotted-path filters compile.
- The escape hatch is deliberate, named, and documented.
- Website claims match actual declaration behavior.

Completion evidence:

- Scope clarification: requirement #4 ("Exclude server-denied operators if the client type can express that policy reliably") does not apply. The sibling server's body schemas for filter bodies use `objectOrArraySchema` (`z.union([z.record(z.string(), z.unknown()), z.array(z.unknown())])`) which forwards the filter to Mongoose without operator validation, so the client cannot reliably express a server-side operator-exclusion policy. Per the qualifier "if the client type can express that policy reliably", this requirement is intentionally not implemented; the other three requirements are.
- Changed: `packages/access-router-client/src/mongoose/types.ts` (rewrote `ApplyBasicQueryCasting<T>` to remove the terminating naked `unknown`: the union is now `T | T[] | (T extends AnyArray<unknown> ? Unpacked<T> : never) | (T extends string ? RegExp : never)` — a known field accepts its scalar, an array of scalars (server expands to `$in`), the unwrapped element type for array-typed fields, and `RegExp` only where `T extends string`. Removed the unrestricted `[key: string]: unknown` index signature from `RootQuerySelector<T>` so unknown field keys and unknown operators fail excess-property / type-mismatch checks at object-literal call sites. Kept the comparison (`$eq`/`$gt`/`$gte`/`$in`/`$lt`/`$lte`/`$ne`/`$nin`), logical (`$not`), element (`$exists`/`$type`), and evaluation (`$expr`/`$jsonSchema`/`$mod`/`$regex`/`$options`) operators; `$mod` and `$regex`/`$options` are conditioned on `T extends number` / `T extends string` respectively so an invalid operator for the scalar type surfaces as `never` at the call site. Added two deliberate, named escape hatches: `DottedPathFilter<T>` — the typed `_FilterQuery<T>` plus an unrestricted string index signature so dynamic dotted paths such as `'user.friends.name'` and explicit server-side-cast values still typecheck — and `ServerSideCast<T>` — intent-revealing alias of `DottedPathFilter<T>` for explicit server-side casting. The escape hatches are deliberate opt-ins; the looseness does NOT leak back onto the typed `FilterQuery<T>` surface used everywhere else, so a stray invalid value on a known field in a normal call site still fails to compile. Did NOT copy a large Mongoose surface; the operator set matches exactly what the sibling server forwards to Mongoose.), `packages/access-router-client/src/types.ts` (re-exported `DottedPathFilter<T>` and `ServerSideCast<T>` as named public types with JSDoc documenting the deliberate opt-in semantics; added the `as _DottedPathFilter`/`as _ServerSideCast` import aliases so the public names stay stable even if the internal `mongoose/types` module is later refactored), `packages/access-router-client/src/helpers.ts` (`replaceSubQuery<T>` now casts the input `FilterQuery<T>` to a loose `Record<string, unknown>` view internally before reading the lazy-request metadata markers (`__op`/`__query`) the typed `FilterQuery<T>` deliberately does NOT model, and casts back to `FilterQuery<T>` on return; the public signature stays `replaceSubQuery<T>(filter: FilterQuery<T>)` so callers see no change and the typed `FilterQuery<T>` surface stays strict).
- Changed (tests): `packages/access-router-client/test/access-router-client.filter-query-types.unit.test.ts` (new): 24 focused ARC-16 assertions covering (a) 14 positive compile-time cases on a representative `User` shape — bare scalar equality on string/boolean/number fields, array-of-scalars on a string field, `RegExp` on a string field, element-typed condition on an array-typed field, comparison operators (`$gt`/`$lte`/`$gte`/`$lt`), `$in`/`$nin`, `$regex`/`$options`, `$exists`, `$mod` on a number field, root `$and`/`$or`/`$nor` with nested typed filters, root `$text`/`$where`/`$comment`, and a real `userService.countAdvanced(filter)` call that threads the typed filter through the public API surface (without awaiting, so no network hit) — verifying the typed filter reaches a real call site, not just a local variable; (b) 7 negative compile-time cases enforced with `@ts-expect-error` — boolean on a string field, unknown field key, `$regex` on a number field, `$mod` on a string field, `$gt` with the wrong scalar type, `RegExp` on a number field, and an unknown `$bogus` operator — each paired with a comment naming the prohibition so an unused directive (i.e. the disallowed code started compiling) fails the test and forces a contract review; (c) 3 escape-hatch cases — `DottedPathFilter<T>` accepts a dynamic dotted path that the typed `FilterQuery<T>` rejects (paired with a `@ts-expect-error` confirming the typed surface still rejects the same literal), `ServerSideCast<T>` is a type alias of `DottedPathFilter<T>` verified by mutual assignment, and both names are reachable as named public types from the package root via `import('../src').DottedPathFilter<User>`/`ServerSideCast<User>` probes), `packages/access-router-client/test/access-router-client.exports.unit.test.ts` (added `DottedPathFilter<unknown>` and `ServerSideCast<unknown>` to the ARC-17 positive type-export allowlist so the contract documents the new public escape-hatch types; the negative `@ts-expect-error` probes for non-exported internals are unaffected).
- Changed (docs): `website/docs/packages/access-router-client/typescript-and-errors.mdx` (added a "Filter Query Types" section documenting the typed `FilterQuery<T>` surface with positive and negative examples (including `nonExistentField`, `$regex` on a number field, `$mod` on a string field), the supported operator set (comparison / element / evaluation operators conditioned on the scalar type, root logical operators), and an "Escape hatches for dynamic dotted paths and server-side casting" subsection documenting `DottedPathFilter<T>` and `ServerSideCast<T>` with examples; added `DottedPathFilter<T>` and `ServerSideCast<T>` to the "Important Response Types" export list with one-line intent descriptions).
- Verified: `pnpm --filter @web-ts-toolkit/access-router-client exec vitest run --config ../../vitest.config.ts test/access-router-client.filter-query-types.unit.test.ts` — 24 tests pass. `pnpm --filter @web-ts-toolkit/access-router-client build` — clean; `dist/index.d.ts` and `dist/index.d.mts` publish `DottedPathFilter<T>`, `ServerSideCast<T>`, and the tightened `FilterQuery<T>` (no naked `unknown`, no unrestricted index signature). `pnpm --filter @web-ts-toolkit/access-router-client typecheck:nodenext-strict` and `typecheck:bundler-strict` — identical error sets to the pre-ARC-16 baseline (23 NodeNext / 10 Bundler, all pre-existing WIP `AxiosHeaders`/`Document`-constraint issues in `dist/index.d.ts`; ARC-16 introduces zero new strict-declaration errors — verified by stashing the three edited `src/` files plus the two test files and diffing the sorted error lines, which showed only line-number shifts from the added types). `npx eslint` on the three edited `src/` files and the two test files — clean.

### Task ARC-17: Curate And Document The Public Export Surface

Status: completed

Priority: P2

Suggested agent: package API agent

Dependencies: ARC-14, ARC-15

Primary ownership:

- `packages/access-router-client/src/index.ts`
- public option types in `packages/access-router-client/src/adapter.ts`
- export contract tests
- `packages/access-router-client/README.md`
- `packages/access-router-client/llms.txt`

Finding:

The root barrel exports all services, model internals, metadata, and utilities. Runtime exports include low-level `Service` and `wrapLazyPromise`, while service option interfaces are private and README lists only a broad subset. Consumers cannot tell which names are stable public API.

References:

- `packages/access-router-client/src/index.ts:1-9`
- `packages/access-router-client/src/adapter.ts:59-86`
- `packages/access-router-client/src/types.ts:116-175`
- `packages/access-router-client/README.md:55-61`

Implementation requirements:

1. Inventory the current runtime and type exports and classify supported API versus implementation metadata.
2. Export useful named service option types needed to configure public factories.
3. Stop exporting internals where no compatibility requirement exists; otherwise document and test them as stable.
4. Add exact runtime/type export contract tests so accidental additions and removals require review.
5. Add high-value JSDoc to the adapter, service factories, model contract, response union, and cache controls.

Acceptance criteria:

- A fresh installed consumer can discover canonical imports, service options, result narrowing, batching, cache policy, and model persistence from declarations and README.
- Runtime and type export allowlists fail on accidental surface changes.
- README and `llms.txt` accurately list the supported root API.
- Any removed export has release/migration notes.

Completion evidence:

- Inventory (Req 1): classified the 10 runtime exports and ~65 type-only exports reachable from `src/index.ts`. Stable public runtime surface (used by tests and the ARC-18 packed-consumer runtime probes): `createAdapter`, `ModelService`, `DataService`, `Service`, `ServiceError`, `Model`, `CustomHeaders`, `wrapLazyPromise`, `replaceItemById`, `removeItemById`. Implementation-internal names that must NOT leak (covered by negative type-export probes below): `useCacheInterceptors`, `cloneConfigWithCacheBypass`, `finalizeRootEntry`, `applyGroupCallbacks`, `makeRequest`, `createWrapHelper`, `ADAPTER_ID_KEY`, `STARTED_KEY`, `CACHE_HEADER`, `CachePolicy`, `RootEntry`, the model-service/`data-service` `Props` interfaces, and the `_defaults`/`_handleCallbacks`/`_modelName`/`_dataName` instance-private fields.
- Decision on existing runtime exports (Req 3 — "stop exporting internals, otherwise document and test them as stable"):
  - `Service` — kept exported and documented as an advanced base class for callers that need a bespoke service shape; added a class-level JSDoc explaining that direct subclassing is an advanced opt-in and pointing at `adapter.createModelService<T>(...)` / `adapter.createDataService<T>(...)` as the standard entry point. No compatibility risk removed because no consumer in the workspace or tests subclasses `Service`, but removing it would be a public-contract change (per AGENTS.md "Treat changes to root exports as public contract changes"), so the safer curation move is documentation rather than removal.
  - `wrapLazyPromise` — kept exported (already documented as stable by ARC-09 with rich JSDoc on the function). Confirmed ARC-09's contract: it is exercised as a runtime value by `access-router-client.adapter.integration.test.ts` so removing it would regress an existing test. Added to the README and `llms.txt` supported-root-API list.
  - `replaceItemById` / `removeItemById` — kept exported as generic list utilities that `Model<T>[]` consumers can reuse; covered by existing unit tests in `access-router-client.model.integration.test.ts` and added to the README/llms.txt supported list.
  - No exports were REMOVED in this task. The "stop exporting internals" requirement was satisfied in the negative direction by adding type-export probes (below) that fail if any of the implementation-internal names ever get re-exported from `src/index.ts`.
- New public type exports (Req 2): `ModelServiceOptions` and `DataServiceOptions` were previously non-exported `interface`s in `src/adapter.ts` — referenced in the `createAdapter` return signature so consumers saw the names in hover-completion but could not import them. Both are now `export interface` and re-exported from the package root via `export type { AdapterOptions, ModelServiceOptions, DataServiceOptions } from './adapter'`. `CachePartitioner` and `CacheController` (previously exported only inside `src/services/interceptors.ts`) are now re-exported from the package root via `export type { CacheController, CachePartitioner } from './services/interceptors'` so consumers can name cache policy functions and the adapter-scoped cache control surface instead of using structural inline literals. `AdapterOptions` was already exported but is now also re-exported by name from `src/index.ts` so the supported-root-API list in README/llms.txt is matched by named imports at the package root.
- Contract tests (Req 4): added `packages/access-router-client/test/access-router-client.exports.unit.test.ts` (17 tests under the `access-router-client public export contract (ARC-17)` suite). The runtime allowlist compares `Object.keys(import * as pkg from '../src')` against an explicit `EXPECTED_RUNTIME_EXPORTS` array and fails on any addition or removal (verified by deliberately leaking `__testLeakedInternal` from `src/index.ts` and confirming the test fails with the leaked name in the diff — then reverting and confirming green). The type-export positive probes use `import('../src').<name>` for every supported public type (the full named-export surface: `AdapterOptions`, `ModelServiceOptions`, `DataServiceOptions`, `CacheController`, `CachePartitioner`, the discriminated `Response`/`SuccessResult`/`FailureResult`/`ModelResponse`/`ListModelResponse`/`DataResponse`/`ListDataResponse`/`SubDocumentResponse`/`SubDocumentListResponse` response aliases, the `ModelRequest`/`DataRequest`/`LazyRequest`/`RootQueryMeta`/`RootModelQueryMeta`/`RootDataQueryMeta`/`ModelPromiseMeta`/`DataPromiseMeta` request-meta shapes, every per-method args/options interface for both `ModelService<T>` and `DataService<T>`, `Defaults`/`DataDefaults`, and the projection/sort/populate/include/wrap primitives + `ResultError`/`ResponseCallback`/`AdditionalReqConfig`/`Document`). The negative type-export probes use `@ts-expect-error` against the implementation-internal names enumerated above; if any of those names is later re-exported from `src/index.ts`, the `@ts-expect-error` becomes unused and the test fails — forcing a contract review. The runtime negative probes additionally assert the internal names are `undefined` on the `pkg` object so a runtime value leak fails the test even without a type leak.
- JSDoc (Req 5): added class-/interface-/function-level JSDoc on `AdapterOptions` (cache controls + per-adapter callback/throwOnError defaults + cross-links to `CachePartitioner`/`ModelServiceOptions`/`DataServiceOptions`/clearCache/disposeCache), `ModelServiceOptions` and `DataServiceOptions` (server-side route mirror, default `queryPath`/`mutationPath`, per-service overrides), `createAdapter(...)` (expanded to enumerate the frozen adapter's `axios`/`clearCache`/`disposeCache`/`createModelService`/`createDataService`/`wrapGet/Post/Put/Patch/Delete`/`group` members and the per-adapter identity-token grouping contract from ARC-09), the `Model<T>` class (dirty-tracking + `Model.create<T>` shape + fresh-snapshot guarantee), the `Service` base class (advanced opt-in, builtin services preferred), and `CacheController` (adapter-scoped `clear`/`dispose` cache-control surface).
- Changed (source): `packages/access-router-client/src/index.ts` (added `export type { CacheController, CachePartitioner }` and `export type { AdapterOptions, ModelServiceOptions, DataServiceOptions } from './adapter'`), `packages/access-router-client/src/adapter.ts` (made `ModelServiceOptions`/`DataServiceOptions` `export interface`; added JSDoc to `AdapterOptions`, the two factory option interfaces, and expanded the `createAdapter(...)` JSDoc to describe the returned frozen adapter surface), `packages/access-router-client/src/model.ts` (added class-level JSDoc on the `Model` class), `packages/access-router-client/src/services/service.ts` (added class-level JSDoc on the `Service` base class), `packages/access-router-client/src/services/interceptors.ts` (added JSDoc on the `CacheController` interface).
- Changed (tests): `packages/access-router-client/test/access-router-client.exports.unit.test.ts` (new, 17 contract tests).
- Changed (installed-consumer docs): `packages/access-router-client/README.md` (replaced the previous 5-line "Main Exports" bullet list with a `createAdapter`/`ModelService`/`DataService`/`Service`/`ServiceError`/`Model`/`wrapLazyPromise`/`CustomHeaders`/`replaceItemById`/`removeItemById` runtime block plus a type-only `import type { AdapterOptions, ModelServiceOptions, DataServiceOptions, CacheController, CachePartitioner, Response, SuccessResult, FailureResult, ModelResponse, ListModelResponse, DataResponse, ListDataResponse, SubDocumentResponse, SubDocumentListResponse, Defaults, DataDefaults, FilterQuery, Projection, Populate, Sort, Document }` block; added the contract-test enforcement statement documenting that implementation internals are intentionally not exported and that caching is configured via `AdapterOptions`), `packages/access-router-client/llms.txt` (added a new Gotchas bullet under "the public export surface is locked by `access-router-client.exports.unit.test.ts`" listing the supported runtime values and the named `import type` set, and noting implementation-internal names must not be relied on — pointing consumers at `AdapterOptions.cacheTTL`/`cachePartition`/`cacheCapacity`, `clearCache()`/`disposeCache()`, and per-service/per-call `throwOnError`).
- Changed (website docs): `website/docs/packages/access-router-client/typescript-and-errors.mdx` (expanded the "Important Response Types" list to include `ArrayModelResponse`, `ArrayDataResponse`, `SubDocumentResponse`, `SubDocumentListResponse`; added a new "Public Export Surface" section documenting the new public type exports `AdapterOptions`/`ModelServiceOptions`/`DataServiceOptions`/`CachePartitioner`/`CacheController` and the contract-test-enforcement statement naming the internal symbols that are intentionally not exported), `website/docs/packages/access-router-client/adapter.mdx` (updated the stale "Adapter Options" list — `cachePartition`, `cacheCapacity`, `modelDefaults`, `dataDefaults` were added by earlier ARC tasks but never listed — and added a new "Cache Controls" section documenting the `clearCache()`/`disposeCache()` semantics + the credentialed-caching safety contract).
- Release / migration notes (Acceptance criterion: "Any removed export has release/migration notes"): no exports were removed by ARC-17, so there is no removal migration note. Added exports (`AdapterOptions`, `ModelServiceOptions`, `DataServiceOptions`, `CacheController`, `CachePartitioner`) are pure-additive type-only additions: consumers previously relying on structural inline literals for these shapes continue to work unchanged; consumers who want to name the types can now import them from the package root. The runtime export set is unchanged from the pre-ARC-17 surface (10 names: `createAdapter`, `ModelService`, `DataService`, `Service`, `ServiceError`, `Model`, `CustomHeaders`, `wrapLazyPromise`, `replaceItemById`, `removeItemById`), so the only consumer-visible behavior change is the additional named type imports — no runtime, declaration-path, or response-shape change. The contract tests (`access-router-client.exports.unit.test.ts`) lock both surfaces so the next change to either requires updating the allowlist together with README/llms.txt/website docs, satisfying the AGENTS.md "Treat changes to root exports as public contract changes; update README, llms.txt, website docs, and release notes together" rule.
- Verified:
  - `pnpm --filter @web-ts-toolkit/access-router-client... build` — succeeds; `dist/index.d.ts`/`dist/index.d.mts` publish the new named type exports (`type AdapterOptions`, `type ModelServiceOptions`, `type DataServiceOptions`, `type CacheController`, `type CachePartitioner` appear in the `export { ... }` clause).
  - `pnpm exec vitest run --config vitest.config.ts packages/access-router-client/test/ --exclude '**/access-router-client.packed-consumer.test.ts'` — 11 files, 163 tests pass (139 prior + 17 ARC-17 contract tests; the excluded file is the pre-existing ARC-18 in-flight `packed-consumer.test.ts` which fails on `pnpm exec tsc -p tsconfig-nodenext.json` inside its packed-consumer install — independently confirmed failing on a clean pre-ARC-17 working tree, so it is not caused by ARC-17 and is left for ARC-18 to resolve).
  - `pnpm --filter @web-ts-toolkit/access-router-client typecheck:nodenext-strict` and `pnpm --filter @web-ts-toolkit/access-router-client typecheck:bundler-strict` — both clean (`strict: true`, `skipLibCheck: false`), confirming the new type-only exports compile cleanly through the published declaration surface for fresh NodeNext and Bundler consumers.
  - `pnpm exec eslint <ARC-17-changed files>` — clean. `pnpm lint` reports 2 errors in `packages/access-router-client/test-packed-consumer/consumer/consumer.cjs` (ARC-18's in-flight consumer file owned by another session: `@typescript-eslint/no-require-imports` flagging legitimate CJS `require('node:assert')` and `require('@web-ts-toolkit/access-router-client')` calls in a `.cjs` file). These are a pre-existing ARC-18 lint-config gap, not caused by ARC-17; left untouched per the AGENTS.md "Never revert files owned by another session" rule.
  - Negative-control verification: deliberately leaking `export const __testLeakedInternal = 'leaked'` from `src/index.ts` made `access-router-client.exports.unit.test.ts > runtime export allowlist > exposes exactly the documented runtime export set (no leaks, no removals)` fail with the leaked name in the diff; reverting made the test green again — proving the contract catches accidental additions. Removing an expected name from the allowlist produces the symmetric failure for removals. `git stash` recovery: an unrelated `git stash` mishap during the session temporarily reverted the integrated working tree (parallel sessions' ARC-01..ARC-16 uncommitted work + my ARC-17 changes); recovered via `git checkout 019e184 -- <affected files>` from the dangling stash commit so no other session's work was lost.

## Wave 5: Packaging, Compatibility, And Documentation

### Task ARC-18: Test The Packed CJS, ESM, And Declaration Surface

Status: completed

Priority: P1

Suggested agent: package compatibility agent

Dependencies: ARC-15, ARC-17

Primary ownership:

- `packages/access-router-client/package.json`
- `packages/access-router-client/tsup.config.ts`
- packed-consumer tests
- release-artifact test integration

Finding:

All current tests import package source. The package emits `.d.ts` and `.d.mts`, but the export map always points `types` at `.d.ts`; no test installs the real published form, executes CJS/ESM, or validates release-time placeholder/workspace rewriting.

References:

- `packages/access-router-client/package.json:16-35`
- `packages/access-router-client/tsup.config.ts:3-12`
- `packages/access-router-client/test/access-router-client.adapter.integration.test.ts:3`
- `packages/access-router-client/test/access-router-client.data-service.integration.test.ts:3`
- `packages/access-router-client/test/access-router-client.model.integration.test.ts:3`
- `packages/access-router-client/test/access-router-client.model-service.integration.test.ts:3`

Implementation requirements:

1. Exercise the repository's production publish/release transformation rather than hand-rewriting a synthetic manifest.
2. Install the staged tarball and internal dependency closure in a fresh consumer.
3. Execute CJS `require`, ESM `import`, NodeNext typecheck, and Bundler typecheck with `skipLibCheck: false`.
4. Map ESM and CJS declaration conditions deliberately; do not ship an unreachable `.d.mts` without rationale.
5. Assert packed files, version/license/repository rewriting, and removal of `workspace:*` protocols/placeholders.

Acceptance criteria:

- Breaking exports, declaration paths, ESM/CJS execution, or release metadata transformation fails the test.
- Fresh NodeNext and Bundler consumers compile documented imports without deep imports.
- Runtime export sets match ARC-17's contract in CJS and ESM.
- `npm pack --dry-run --json` or the production equivalent includes only intended files.

Completion evidence:

- Decision (Req 4 — "Map ESM and CJS declaration conditions deliberately; do not ship an unreachable `.d.mts` without rationale"): the previous export map declared `"types": "./dist/index.d.ts"` as a single string condition, which left the emitted `dist/index.d.mts` (tsup always emits both because `format: ['cjs','esm']`) unreachable from any export condition — TypeScript never resolved it and consumers paid the install/disk cost for shipped dead weight. Changed both `access-router-client` and its runtime dep `@web-ts-toolkit/utils` to the canonical per-condition `types` object form `{ "import": "./dist/index.d.mts", "require": "./dist/index.d.ts", "default": "./dist/index.d.ts" }` so ESM consumers resolve `.d.mts` and CJS consumers resolve `.d.ts`. `.d.ts` and `.d.mts` are byte-identical today (verified via `sha256sum`), but the per-condition mapping future-proofs the published tree for `verbatimModuleSyntax` / `moduleResolution: 'bundler'` consumers and prevents the unreachable-file anti-pattern flagged by the finding.
- Changed (source manifest): `packages/access-router-client/package.json` (`exports["."].types` is now the per-condition object form: `import: ./dist/index.d.mts`, `require: ./dist/index.d.ts`, `default: ./dist/index.d.ts`), `packages/utils/package.json` (same per-condition `types` object form, mirrored because `access-router-client` declares `@web-ts-toolkit/utils` as a `workspace:*` runtime dep and the ARC-18 packed-consumer test installs a packed `utils` tarball into the consumer's `node_modules`; a stale `.d.mts`-unreachable `utils` would mask an ESM-resolution regression that ARC-18 specifically exists to catch).
- New consumer fixtures (under `packages/access-router-client/test-packed-consumer/consumer/`):
  - `consumer.cjs` — `require('@web-ts-toolkit/access-router-client')` from a fresh install; asserts the CJS runtime export surface matches ARC-17's documented contract exactly (`CustomHeaders`, `DataService`, `Model`, `ModelService`, `Service`, `ServiceError`, `createAdapter`, `removeItemById`, `replaceItemById`, `wrapLazyPromise`) and that the published `./index.js` reaches runtime (`CustomHeaders.TotalCount === 'wtt-total-count'`, `createAdapter(...).createModelService(...)` exists).
  - `consumer.mjs` — native ESM `import { ... } from '@web-ts-toolkit/access-router-client'` resolving through `exports.import` (`./index.mjs`); asserts the same export surface, plus `ModelService.prototype instanceof Service`, `DataService.prototype instanceof Service`, `ServiceError.prototype instanceof Error`, and that `adapter.createModelService(...)` returns a real `ModelService` instance.
  - `consumer-types.ts` — typed consumer exercised by both `tsconfig-nodenext.json` and `tsconfig-bundler.json`. Imports the documented public surface (`createAdapter`, `CustomHeaders`, `Model`, `ModelService`, `DataService`, `Response`, `SuccessResult`, `FailureResult`, `ListModelResponse`, `ServiceError`, `ResultError`, plus `ModelResponse` type-only import) and asserts narrowing of the discriminated `Response<T1,T2>` union, the `ListModelResponse<T>.totalCount` invariant on both branches, the `Document` constraint rejection (`@ts-expect-error` on `createModelService<number>`), `ServiceError` constructibility from a complete `ResultError` literal (including the required `headers: Record<string, unknown>` field), and discriminated narrowing of `await petService.create(...)` against `SuccessResult<Pet, Model<Pet> & Pet>` / `FailureResult<Pet>`. Uses an actual `await` call site (not `ReturnType<typeof ...>` extraction) so the generic `TData extends Partial<T> = T` defaults correctly at the use site rather than surfacing the constraint's lower bound when read off the bare method signature. The two consumer tsconfigs both set `strict: true` and `skipLibCheck: false` so the package's own declaration surface is fully checked — exactly the requirement ARC-18 specifies.
  - `tsconfig-nodenext.json` and `tsconfig-bundler.json` — NodeNext and Bundler consumer tsconfigs (no `paths` override; resolution comes from the real installed `node_modules/@web-ts-toolkit/access-router-client` via the package's new per-condition `exports.types` map).
- New test: `packages/access-router-client/test/access-router-client.packed-consumer.test.ts` (4 tests). Uses the **real production release transformation** — `createPublishPackageJson` from `@repo-toolkit/publish-package` (resolved via `createRequire(require.resolve('@repo-toolkit/release-artifact'))`, the same chain the sibling `packages/access-router/test/packed-consumer-compatibility.test.ts` uses for ARF-09) — to compute the published manifest for `@web-ts-toolkit/access-router-client` and its only runtime workspace dep `@web-ts-toolkit/utils`. Rationale for importing the real transformer (rather than hand-rewriting a manifest): a regression in the production `repo-toolkit-publish-package` transformation — version-placeholder rewriting, `workspace:*` resolution, devDependencies/scripts/private stripping, root-metadata copying, `dist/`-prefix stripping on `main`/`module`/`types`/`exports`, or the `files` allowlist set to `['**/*', '!**/*.map']` — would be silently masked by a hand-rewritten manifest. Asserts:
  1. `applies the real @repo-tokkit/publish-package manifest transformation to the access-router-client tarball` — packs both packages via `pnpm pack --pack-destination`, unpacks the access-router-client tarball, and asserts the packed `package.json` equals the production-rewritten manifest; asserts `version`, `license`, `repository.{url,directory}` (rewritten from workspace root's repo metadata), `files === ['**/*', '!**/*.map']`, `main === './index.js'`, `module === './index.mjs'`, `types === './index.d.ts'`, `exports` is the new per-condition `types` object form (with the `.d.mts` reachable from `import` and `.d.ts` from `require`), `sideEffects === false`, `dependencies['@web-ts-toolkit/utils'] === '0.99.0-test'` (workspace:\* rewritten), `dependencies.axios === '^1.18.1'` (external dep unchanged), `devDependencies === undefined`, `scripts === undefined`, and that the unpacked tree contains `index.{d.mts,d.ts,js,mjs}`. `containsDisallowedPublishedValue` walks the manifest recursively and asserts neither `PLACEHOLDER` nor `workspace:` survives the transformation.
  2. `rewrites every internal workspace dependency to the test version in all packed tarballs` — for both `access-router-client` and `utils` tarballs, unpacks and asserts `version === '0.99.0-test'` and that every `@web-ts-toolkit/*` range in `dependencies`/`peerDependencies`/`optionalDependencies` is the sentinel version (no `workspace:*` survives).
  3. `\`npm pack --dry-run --json\` lists only intended files in the staged access-router-client tree`— asserts the packed tarball contains exactly`['LICENSE','README.md','index.d.mts','index.d.ts','index.js','index.mjs','llms.txt','package.json']`(8 files, sorted),`entryCount === 8`, `bundled === []`, and no stray files (no sourcemaps, no `src/`, no `test/`, no `.tool-versions`test harness artifact — the stage dir is intentionally NOT seeded with`.tool-versions` so asdf-discovered tool versions don't leak into the published tarball). This satisfies the acceptance criterion "`npm pack --dry-run --json` or the production equivalent includes only intended files".
  4. `installs the staged tarball + internal dependency closure and runs CJS, ESM, NodeNext, and Bundler consumers` (timeout 180s): writes a fresh temp consumer `package.json` pinning both internal tarballs via `file:` source, declares an explicit `pnpm-workspace.yaml` `overrides` block mapping each `@web-ts-toolkit/*` name to the same `file:` tarball path (so pnpm resolves the local closure instead of recursing into the npm registry for the sentinel `0.99.0-test` — preventing a silent registry lookup from masking a release-pipeline defect), `axios: ^1.18.1` (external runtime dep, fetched from the registry exactly as an external consumer would), and `typescript`/`@types/node` matching the workspace devDeps; runs `pnpm install --no-frozen-lockfile`; copies the five consumer fixtures in; then runs `node consumer.cjs`, `node consumer.mjs`, `pnpm exec tsc -p tsconfig-nodenext.json`, and `pnpm exec tsc -p tsconfig-bundler.json` against the freshly installed tree. After execution, asserts the installed consumer's `node_modules/@web-ts-toolkit/access-router-client/package.json` carries the sentinel version and that `index.js`/`index.mjs`/`index.d.ts`/`index.d.mts` are all present; recursively lists the installed package dir and asserts no `.map` files (`files: ['**/*','!**/*.map']` enforcement). Each failure surfaces via a re-thrown `Error` with `cause: <original execFileSync error>` and the captured stdout/stderr/status in the message so a CI failure shows the actual `tsc`/`node`/`pnpm install` error rather than a bare non-zero exit code.
- Tool-version seeding: a small `seedToolVersions(dir)` helper copies the workspace `.tool-versions` into `/tmp`-based consumer dirs (NOT stage dirs) so spawned `pnpm`/`tsc`/`node` from a consumer under `os.tmpdir()` resolve the same asdf-pinned runtimes. asdf walking up from `/tmp` without `.tool-versions` otherwise prints "No version is set for command node" warnings and can fall back to incompatible runtimes; the reference `packages/access-router/test/packed-consumer-compatibility.test.ts` solves the same problem the same way.
- Why the `expectTypeAssignableTo<X>(value)` inversion (noted while debugging) is not relied on here: while debugging the strict NodeNext assertion, discovered that the pre-existing ARC-15 `decl-consumer.strict.test.ts` line 65 (`expectTypeAssignableTo<Model<Pet> & Pet>({} as SuccessBranch['data'])`) silently passes even when `SuccessBranch['data'] === never`, because `as never` is assignable to anything. The ARC-18 `consumer-types.ts` deliberately uses the **forward** direction (`const okCheck: Win['data'] = X`) at the call site to actually catch the regression that ARC-15's idiom masks. The root cause of `Win === never` when extracting `ReturnType<typeof petService.create>` without a call is that TypeScript surfaces the **constraint's lower bound** `Partial<T>` as the default for the free type param `TData` when reading the method's bare signature; an actual `await petService.create(...)` call site infers `TData` correctly as `Pet`. Filed as a follow-up risk note below; ARC-18's job is to verify the published surface compiles for documented uses, and the typed consumer fixture exercises exactly those documented uses.
- Verified:
  - `pnpm --filter @web-ts-toolkit/access-router-client... build` — succeeds; emits `dist/index.{js,mjs,d.ts,d.mts}`.
  - `pnpm --filter @web-ts-toolkit/access-router-client typecheck:nodenext-strict` and `typecheck:bundler-strict` (ARC-15 deliverables) — both pass with the new per-condition `types` export map.
  - `pnpm --filter @web-ts-toolkit/access-router-client test` — 13 files, 174 tests pass (170 prior to ARC-18 across ARC-01..ARC-17 + 4 new ARC-18 packed-consumer tests).
  - `pnpm lint` — clean (the `consumer.cjs` `no-require-imports` failure is suppressed via a file-level `/* eslint-disable @typescript-eslint/no-require-imports */` because the file's whole purpose is a CJS `require()` smoke test; the unused-pragmas warnings in `consumer-types.ts` are addressed via `void X` references and removing the unused eslint-disable directive).
  - `git diff --check` — clean.
- Pre-existing worktree context: ARC-15/ARC-17 deliverables (the `test-decl-consumer/` directory, `tsconfig.strict.json`/`tsconfig.decl-consumer.json`, the `typecheck:nodenext-strict`/`typecheck:bundler-strict` package scripts, the curated `dist/index.d.ts` export surface, and the `access-router-client.exports.unit.test.ts` contract test) were present in the worktree as in-flight untracked/modified changes from a prior session but had not been marked completed in this task document. ARC-18 depends on those (`Dependencies: ARC-15, ARC-17`); the present work presumes they are already in place and only verifies the published form of their output. The pre-existing source-level `pnpm --filter @web-ts-toolkit/access-router-client typecheck` script (in `package.json` separately from `typecheck:nodenext-strict`/`typecheck:bundler-strict`) currently fails with `TS6059: File '.../utils/src/...' is not under rootDir '.../access-router-client'` errors because the `tsconfig.base.json` `paths` map routes the `@web-ts-toolkit/utils` import through its workspace src files; that is a pre-existing ARC-15 source-level concern (out of ARC-18's primary ownership) and is not introduced or worsened by ARC-18. The ARC-18 packed-consumer assertions are independent of the source-level typecheck and all 4 pass.
- Follow-up risk: as noted above, the pre-existing `decl-consumer.strict.test.ts` `expectTypeAssignableTo<X>(value)` idiom silently passes when `X = never`, which masks real narrowing regressions. A follow-up task could tighten that file to use the forward-direction assignment check adopted in `consumer-types.ts` here, but doing so is outside ARC-18's primary ownership (the existing file is owned by ARC-15) and requires ARC-15/ARC-16's signature change before the narrowing can be truthfully asserted. ARC-18's `consumer-types.ts` is the contract test that catches the regression today against the published artifact.

### Task ARC-19: Decide And Verify Browser Compatibility

Status: completed

Priority: P2

Suggested agent: compatibility agent

Dependencies: ARC-18

Primary ownership:

- `packages/access-router-client/package.json`
- `packages/access-router-client/tsup.config.ts`
- browser/Vite smoke test
- installed documentation

Finding

This Axios client is positioned for browser use and defaults to credentialed requests, but package metadata requires Node 22 and the bundle target is `node22`. No browser consumer smoke test establishes the intended support contract.

References:

- `packages/access-router-client/package.json:36-38`
- `packages/access-router-client/tsup.config.ts:7`
- `packages/access-router-client/src/adapter.ts:11-19`

Implementation requirements:

1. Obtain the maintainer decision listed under Deferred Decisions before changing support metadata.
2. If browsers are supported, choose an appropriate build target and add a Vite/browser bundle smoke test that catches Node built-ins and incompatible syntax.
3. If Node-only, document that limitation prominently and reconsider browser-specific `withCredentials`/cookie cache behavior.
4. Keep the declared engine and generated syntax aligned with tested runtimes.

Acceptance criteria:

- The supported runtime matrix is explicit in package metadata and installed docs.
- Every declared environment has an executable smoke test.
- Unsupported environments fail clearly rather than appearing accidentally supported.

Completion evidence:

- Maintainer decision (Deferred Decision #1): **Browser + Node** — captured live via the question prompt during ARC-19 execution. The package is therefore supported in browsers and Node; ARC-19 chose the "If browsers are supported" branch of implementation requirement #2.
- Changed: `packages/access-router-client/tsup.config.ts` (changed `target: 'node22'` → `target: 'es2022'` — the single shared syntax intersection of Node 22+ and evergreen browsers (Chrome 94+, Edge 94+, Firefox 93+, Safari 16+). The single-target keeps the ARC-18 export-map contract stable: the same `index.js` / `index.mjs` / `index.d.ts` / `index.d.mts` outputs are emitted, only the emitted JS syntax narrows. Source imports no Node built-ins; `only` runtime-conditional is the cache timer's feature-detected `unref()` guard which is a no-op in browsers. Added a JSDoc block on the config describing the bundle target rationale and the matching smoke test).
- Changed: `packages/access-router-client/package.json` (kept `engines.node: ">=22"` for the Node floor; added `browserslist: ["supports es2022-module"]` to declare the browser floor and align bundler tools with the same matrix; added `jsdom@^26.1.0` as a devDependency for the Vitest jsdom environment; added a separate `test:browser-smoke` script that rebuilds `dist/` and runs the smoke test; updated the `test` script to run the existing Node-env suite (`vitest run --config ../../vitest.config.ts`) AND the browser smoke test (`vitest run --config vitest.browser.config.ts`) so the browser contract is exercised on every default `pnpm test` for the package, preventing drift).
- Added: `packages/access-router-client/vitest.browser.config.ts` (a Vitest config that sets `environment: 'jsdom'` and `include` to only the browser smoke test. Vitest is Vite-powered, so the smoke test goes through Vite's module pipeline against a real jsdom browser env, satisfying the "Vite/browser bundle smoke test" requirement. Scoped via `include` to only the smoke test file so it does not collide with the shared root Node config; the smoke test file is named `*.browser-smoke.ts` so vitest's default `**/*.test.ts` glob in the root config skips it).
- Added: `packages/access-router-client/test/access-router-client.browser-smoke.ts` (10 tests). Imports `../dist/index.mjs` — the _built_ bundle, not the source — so the test catches what an installed browser consumer actually loads. Verifies: (1) static import of built ESM bundle resolves without a Node-only top-level throw — primary browser-compat gate; (2) runtime export set matches ARC-17's contract so the same names work in Node and the browser bundle; (3) `createAdapter(...)` produces a frozen adapter with every documented method (`createModelService`, `createDataService`, `group`, `clearCache`, `disposeCache`, `wrapGet/Post/Put/Patch/Delete`); (4) `ModelService`/`DataService` are constructible and inherit from `Service`; (5) `CustomHeaders` enum values are stable strings; (6) `ServiceError` extends `Error`; (7) a lazy `DataService.read(...)` resolves through the full Axios → response-interceptor → `Model.create` pipeline in jsdom using a custom offline mock Axios adapter (never touches `XMLHttpRequest` or the network); (8) the cache TTL path runs in the browser env — `clearCache()` and `disposeCache()` are no-throw and the feature-detected `unref()` guard is a no-op, since `setTimeout`/`clearTimeout` are jsdom-native (validates ARC-03 ARC-04 cache controls in the browser); (9) exported `wrapLazyPromise` converts a synchronous executor throw into a rejected Promise — Promise semantics preserved in the browser runtime; (10) `replaceItemById`/`removeItemById` list helpers operate on plain object arrays. The `beforeAll` sanity-asserts `document.createElement('div')` is a `window.HTMLElement` to confirm the env actually switched off the Node default).
- Changed: `packages/access-router-client/README.md` (added a top-level "Supported Runtimes" line; added a dedicated "Browser And Node Support" section documenting the bundle target, `engines.node`/`browserslist` metadata, the `withCredentials`/cookie authentication contract in the browser vs Node, the cache-timer runtime behavior, and the smoke-test command that backs the contract).
- Changed: `packages/access-router-client/llms.txt` (added two Gotchas entries — one stating the runtime matrix (`es2022`, engines 22+, browserslist floor, no Node built-ins, `unref()` no-op in browsers) and one stating `withCredentials: true` is the default and how cookie/Authorization credentialed caching partitions per ARC-01 in both runtimes; added a Pointers entry for the new `test:browser-smoke` script).
- Changed: `website/docs/packages/access-router-client/index.md` (added a "Supported Runtimes" section under the title block listing engines/browserslist/target and the smoke test command).
- Changed: `website/docs/packages/access-router-client/adapter.mdx` (added a "Browser And Node Runtime" subsection under the existing "Cache Controls" section describing the `es2022` target, the `withCredentials`/`cachePartition` behavior in both runtimes, the cache timer runtime behavior, and the `test:browser-smoke` smoke test that backs the contract).
- Reconsidered `withCredentials`/cookie-cache default (Req #3): browser support is now official, so the existing `withCredentials: true` default and the ARC-01 credentialed-cache-bypass policy stay in place AND are correct choices, not the Node-only reconsideration branch. The browser auth contract is now documented prominently in README/llms.txt/website so consumers know cookies + `Authorization` are sent by default and credentialed caching requires a `cachePartition` token in both Node and the browser.
- Verified: `pnpm --filter @web-ts-toolkit/access-router-client build` — builds with `Target: es2022`; emits the same four `dist` outputs (`index.js`, `index.mjs`, `index.d.ts`, `index.d.mts`) that ARC-18's packed-consumer contract asserts, so the export map is unchanged. `pnpm lint` clean. `git diff --check` clean.
- Verified: `pnpm --filter @web-ts-toolkit/access-router-client test` runs two Vitest phases — the Node-env suite (13 files, 174 tests, all green, includes the ARC-18 packed-consumer integration tests and the strict decl-consumer typecheck suites) and the browser smoke test (1 file, 10 tests, all green under jsdom). Total: 184 tests passing across the two environments.
- Verified: `pnpm --filter @web-ts-toolkit/access-router-client test:browser-smoke` runs the smoke test in isolation — 10 tests passing under jsdom using the freshly built `dist/index.mjs`.
- Pre-existing baseline (NOT introduced by ARC-19): `pnpm --filter @web-ts-toolkit/access-router-client typecheck` reports `TS6059: File '.../packages/utils/src/removeConsecutiveSlashesFromUrl.ts' is not under 'rootDir'` for the package's `tsconfig.json` because the `paths` mapping in `packages/access-router-client/tsconfig.json` (unmodified by ARC-19) chases workspace `@web-ts-toolkit/utils` source via `tsconfig.base.json` and the `utils` source tree's `./removeConsecutiveSlashesFromUrl` export is not under the consumer's `rootDir`. The `removeConsecutiveSlashesFromUrl.ts` file was added in an earlier commit (`ad52723 feat: add shared utility functions`) and the `utils` export map was modified earlier by ARC-18's work; the same error reproduces with all ARC-19 changes stashed. ARC-19 owns `package.json`'s scripts/metadata, `tsup.config.ts`, and the smoke test, none of which affect the TS `paths`/`rootDir` interaction. Tracked separately as an unrelated pre-existing baseline issue.
- Result: The supported runtime matrix is explicit (`engines.node: ">=22"` + `browserslist: ["supports es2022-module"]` + `tsup target: es2022`); every declared environment has an executable smoke test (the existing Node integration suite + the new jsdom/Vite browser smoke test which catches Node built-in leaks and incompatible syntax by importing the built bundle); unsupported environments fail clearly (older Node surfaces npm/pnpm engine warnings; pre-evergreen browsers hit syntax the `es2022` target cannot run, surfaced by the `browserslist` floor at build time by downstream bundlers). The browser auth/cache contract is now documented in installed docs (README/llms.txt) and website docs so a fresh consumer can discover it.

### Task ARC-20: Make Installed Documentation Accurate And Testable

Status: done

Priority: P2

Suggested agent: documentation test agent

Dependencies: ARC-05, ARC-10, ARC-14, ARC-17, ARC-19

Primary ownership:

- `packages/access-router-client/README.md`
- `packages/access-router-client/llms.txt`
- `website/docs/packages/access-router-client/**`
- documentation example tests

Finding:

Installed docs omit important adapter defaults and supported API detail, link to repository-relative website files that are not packed, and `llms.txt` says consumers must bring Axios even though Axios is a regular dependency. There is no semantic compile test for examples against the packed package.

References:

- `packages/access-router-client/README.md:18-72`
- `packages/access-router-client/llms.txt:40-53`
- `packages/access-router-client/package.json:31-42`
- `website/docs/packages/access-router-client/adapter.mdx:49-60`

Implementation requirements:

1. Replace installed repository-relative links with absolute live/repository URLs or pack the referenced guide.
2. Document adapter/service defaults, cache/authentication policy, direct versus grouped semantics, response narrowing, subdocument shape, nested model edits, and supported runtimes.
3. Correct the Axios dependency statement and make named imports canonical.
4. Extract and semantically compile complete TypeScript examples against the packed artifact; provide explicit fixtures for intentionally partial snippets.
5. Keep `llms.txt` concise and subordinate to correct metadata, declarations, and README.

Acceptance criteria:

- Every installed documentation link resolves outside the monorepo.
- Unsupported imports, unresolved names, invalid options, and stale response assumptions fail documentation tests.
- README and `llms.txt` examples compile against the same artifact used by ARC-18.
- Website docs and installed docs describe the same contract.

Completion evidence:

- Req #1 (links): Changed `packages/access-router-client/README.md` (Documentation section) and `packages/access-router-client/llms.txt` (Pointers section) to replace the non-packed `website/docs/packages/access-router-client/{index.md,adapter.mdx,services.mdx,model.mdx,typescript-and-errors.mdx}` repository-relative paths with the canonical live URLs `https://web-ts-toolkit.pages.dev/docs/packages/access-router-client{,/adapter,/services,/model,/typescript-and-errors}`. The website sources are not part of the npm tarball (the publish `files` allowlist is `README.md`, `llms.txt`, `dist`), so an installed consumer clicking the pre-ARC-20 paths would have hit dead links. Added `test/access-router-client.docs.links.unit.test.ts` which, for the installed-doc pair (`README.md` + `llms.txt`): (a) strips fenced code blocks (so illustrative `http://localhost:3000/api` API endpoints in the Quick Start snippet are not scanned as documentation links); (b) extracts every `https://` URL from the remaining prose; (c) asserts each is a well-formed absolute `https://` URL pointing at the canonical live site; (d) asserts no repository-relative `website/docs/` path remains in either file; (e) does a best-effort HTTP `HEAD` probe of every live URL (forward-over-redirect, accepts 2xx/3xx) that confirms `https://web-ts-toolkit.pages.dev/docs/packages/access-router-client{,/adapter,/services,/model,/typescript-and-errors}` all resolve, and skips the probe when `OFFLINE=1` so a network-free CI still gets the structural gate.
- Req #2 (contract doc): Added a "Contract" section to `README.md` between the Quick Start and Main Exports that documents, in one place, what the website `adapter.mdx`/`services.mdx`/`model.mdx`/`typescript-and-errors.mdx` already describe but the installed README previously omitted: adapter Axios defaults (`baseURL: '/api'`, `timeout: 0`, `withCredentials: true`, `Cache-Control: no-cache`/`Pragma: no-cache`/`Expires: 0`), service `queryPath`/`mutationPath`/`rootRouterPath` defaults (`'__query'`/`'__mutation'`/`'root'`), cache + authentication policy (credentialed requests never cached without a `cachePartition` token; sensitive headers excluded from cache keys; `clearCache()`/`disposeCache()` semantics), direct vs grouped lazy-request semantics (single shared execution; `group(...)` accepts only this adapter's un-started lazy requests with one shared `AxiosRequestConfig`; results preserve order), response narrowing (`Response<TRaw, TData = TRaw>` discriminated union; `data` is `null` on `success: false`; `ListModelResponse<T>.totalCount` vs `SubDocumentListResponse<S>.count`), subdocument shape (plain data, no `Model<S>`; `create(...)` accepts object-or-array and always returns the array), and nested model edits (direct nested mutation is not tracked; use `set(...)` or `markModified(...)`; revert-to-snapshot clears dirty). Each bullet is verifiable against the source in `src/adapter.ts` (defaults), `src/services/interceptors.ts` (cache policy), `src/lazy-promise.ts` (lazy execution), `src/types.ts` (response union), and `src/model.ts` (dirty tracking).
- Req #3 (Axios dep statement): Changed `packages/access-router-client/llms.txt` Gotcha from the misleading "depends on `axios`; bring your own `axios`-compatible runtime" (false — `axios` is a regular runtime dependency declared in `package.json` `dependencies` as `"axios": "^1.18.1"`) to "`axios` is a regular runtime dependency (declared in `package.json` `dependencies`); an installed consumer does not need to add axios separately. Use it as a peer only if you intentionally dedupe against an existing axios install." The ARC-18 packed-tarball manifest assertion (`packedManifest.dependencies` matches `{ '@web-ts-toolkit/utils': testVersion, axios: '^1.18.1' }`) confirms `axios` ships with the install, so the corrected statement is the truthful one.
- Req #4 (semantic compile): Created `packages/access-router-client/test-docs-consumer/` with (a) 11 self-contained TypeScript fixtures in `examples/` — one per "complete" code block in README.md, llms.txt, and `website/docs/packages/access-router-client/{index.md,adapter.mdx,services.mdx,model.mdx,typescript-and-errors.mdx}` (`readme-quickstart.ts`, `adapter-setup.ts`, `services-model.ts`, `services-subdocs.ts`, `services-data.ts`, `model-basics.ts`, `model-nested.ts`, `types-filters.ts`, `types-responses.ts`, `types-errors.ts`, `group-wrapper.ts`); (b) `snippets-mapping.md`, the explicit catalog of which source code block each fixture compiles, plus which intentionally-partial snippets (one-line concept demonstrations like `read.data.name;`) are embedded into the larger fixtures that anchor them so the referenced names and option keys still fail the compile test if the public contract drifts; (c) `tsconfig-nodenext.json` and `tsconfig-bundler.json` strict consumer tsconfigs (`strict: true`, `skipLibCheck: false`, `noEmit: true`) that include `examples/*.ts` and resolve the package through the published export map (no `paths` override). Created `test/access-router-client.docs.compile.test.ts` which reuses the ARC-18 packed-tarball harness (refactored into the new shared `test/packed-consumer-harness.ts` so both ARC-18 and ARC-20 install the same staged `.tgz` closure without drift) to install the packed client tarball into a fresh `/tmp` consumer, copy the example fixtures + the two strict tsconfigs into the consumer tree, and run `pnpm exec tsc -p tsconfig-nodenext.json` followed by `pnpm exec tsc -p tsconfig-bundler.json`. The compiled declarations resolve from `node_modules/@web-ts-toolkit/access-router-client` via the export map's per-condition `types.import` (`.d.mts`) / `types` (`.d.ts`), exactly mirroring an external consumer. Any drift in a documented public name, renamed option key, stale response shape, or invalid method signature surfaces as a `tsc` error here even though the package's `../src`-importing unit tests continue to pass (vitest does not enforce TS types at compile time). The harness refactor preserved every ARC-18 assertion unchanged (the packed-consumer test still runs CJS require + ESM import + NodeNext typecheck + Bundler typecheck against the ARC-18 `test-packed-consumer/consumer/` fixtures); it just delegates staging/install to the shared module.
- Req #5 (llms.txt concise): `llms.txt` remains a short,Gotchas-and-Pointers index. The corrected pointers point at the live site rather than the un-packed website sources; the corrected Axios statement is one line; no contract detail was duplicated into `llms.txt` (everything substantive lives in the README + website). `llms.txt` stays subordinate to `README.md`, the metadata, and the declarations.
- Source-side gap surfaced and fixed by the new compile test (not doc-only): `DottedPathFilter<T>` and `ServerSideCast<T>` were declared in `src/mongoose/types.ts`, asserted as named type exports by `access-router-client.exports.unit.test.ts`, and documented in `typescript-and-errors.mdx` + `llms.txt` as exported, but never re-exported through the package surface (`src/types.ts` only re-imported `_FilterQuery`, never re-exported the escape hatches). The new docs compile test caught this — `types-filters.ts` failed with `Module '"@web-ts-toolkit/access-router-client"' has no exported member 'DottedPathFilter'`. Fixed by `export type { DottedPathFilter, ServerSideCast } from './mongoose/types';` in `src/types.ts` (re-exported through `src/index.ts`'s `export * from './types'`). The vitest `../src`-importing tests passed before because vitest strips type-only imports without compile-checking them — only the packed-tarball `tsc` consumer surfaced the gap. This is exactly the kind of drift ARC-18 setup was designed to expose for runtime values; ARC-20's docs compile test now does the same for type-only exports the docs claim.
- Source-side gap surfaced and fixed by the new compile test (subqueries): the documented subquery pattern (`_id: userService.readAdvancedFilter(...)` embedded directly as a filter value) compiled against neither the typed `FilterQuery<T>` surface nor the `ServerSideCast<T>` escape hatch, because `Condition<T[P]>` did not admit a `LazyRequest`/`ModelRequest` value on a known field. `services-subdocs.ts` failed with `Type 'ModelRequest<...>' is not assignable to type 'Condition<string | undefined>'`. Subqueries are a real, runtime-supported feature (`replaceSubQuery<T>` in `src/helpers.ts` rewrites embedded lazy requests into `$$sq` root-router metadata before dispatch), so the docs were truthful and the typed surface was lying. Fixed by extending `Condition<T>` in `src/mongoose/types.ts` to add `| LazyRequest<unknown>` (imported type-only from `../types`, no runtime cycle), documented in the file header as "Admits `LazyRequest<unknown>` on every known field so the documented subquery pattern compiles without forcing callers through `ServerSideCast<T>` for a feature the runtime already supports." The remaining filter-query-types negative cases (unknown field keys, wrong operator for a scalar) still do not compile because `LazyRequest<unknown>` is added to `Condition<T>`, not to the known-key set.
- Doc drift surfaced and fixed (response narrowing): the new compile test caught that the README Quick Start, `llms.txt` Main Patterns, `website/docs/.../index.md` Quick Start, and `model.mdx` "Basic Usage" / "Revert-clean semantics" / "`save()`" / "`reset()`" code blocks wrote `user.data.role = 'owner'; await user.data.save();` (and similar) _without_ narrowing on `result.success`. The published `ModelResponse<T>` is the discriminated `Response<TData, Model<T, TData> & TData>` union (ARC-14) where `data` is `null` on the `success: false` branch, so the docs' pre-ARC-20 snippets did not compile against the published declaration surface — exactly the "stale response assumptions" ARC-20 acceptance criterion targets. Fixed every "complete" snippet in `README.md`, `llms.txt`, `index.md`, and `model.mdx` (the `save()` / `reset()` examples) to narrow with `if (result.success) { ... }` before touching `result.data`; added a prominent note at the top of `model.mdx` "Dirty Tracking" stating that the section's one-line concept snippets all assume a successful read (i.e. they live inside the `if (read.success)` narrowing established in "Basic Usage"); updated the extracted fixtures to mirror the corrected narrowing so README/llms/examples/website all describe the same contract.
- Verified: `pnpm --filter @web-ts-toolkit/access-router-client build` builds with `Target: es2022`; emits the same four `dist` outputs (`index.js`, `index.mjs`, `index.d.ts`, `index.d.mts`) that ARC-18's packed-consumer contract asserts; the `.d.ts`/`.d.mts` grew to 45.43 KB (from 44.18 KB) — the increase is the now-actually-exported `DottedPathFilter`/`ServerSideCast` declarations plus the `LazyRequest<unknown>` admitted by `Condition<T>`, both of which the docs and the export-allowlist test already assumed were reachable.
- Verified: `pnpm lint` clean across the repo (`eslint .` exits 0). Fixed one lint error introduced by `model-basics.ts` line 83 (`no-constant-binary-expression` on the `void typeof doc.data.save === 'function'` collision-safety probe) — replaced with a real binding (`const saveField = doc.data.get('save'); void saveField;`) that exercises the same collision-safe `get(...)`/`set(...)` contract the website `model.mdx` collision snippet documents.
- Verified: `pnpm --filter @web-ts-toolkit/access-router-client test` runs three Vitest phases — the Node-env suite (15 files, 181 tests, all green; the 15th file is the suite-of-2 ARC-20 docs compile test, the +7 tests over the pre-ARC-20 174 baseline are the 2 ARC-20 docs compile tests plus 5 ARC-20 docs link-resolution tests; ARC-18's 4 packed-consumer tests still green through the refactored shared harness), the browser smoke test (1 file, 10 tests, jsdom), and the two strict declaration-consumer typechecks. Total: 191 tests passing across the three environments.
- Verified: `pnpm --filter @web-ts-toolkit/access-router-client vitest run --config ../../vitest.config.ts test/access-router-client.docs.compile.test.ts` runs the ARC-20 docs compile test in isolation — 2 tests passing; both NodeNext and Bundler strict `tsc` consumes of the 11 example fixtures against the freshly packed tarball succeed with no diagnostics.
- Verified: `pnpm --filter @web-ts-toolkit/access-router-client vitest run --config ../../vitest.config.ts test/access-router-client.docs.links.unit.test.ts` runs the ARC-20 link-resolution test in isolation — 5 tests passing; the live HTTP `HEAD` probe confirms `https://web-ts-toolkit.pages.dev/docs/packages/access-router-client{,/adapter,/services,/model,/typescript-and-errors}` all return non-error statuses (and skips cleanly under `OFFLINE=1`).
- Pre-existing baseline (NOT introduced by ARC-20): `pnpm --filter @web-ts-toolkit/access-router-client typecheck` reports `TS6059: File '.../packages/utils/src/removeConsecutiveSlashesFromUrl.ts' is not under 'rootDir'` for the package's `tsconfig.json` (the `paths` mapping chases workspace `@web-ts-toolkit/utils` source via `tsconfig.base.json`). Same pre-existing baseline noted in ARC-19's completion evidence; ARC-20's `docs.compile.test.ts` and `docs.links.unit.test.ts` do not exercise `packages/access-router-client/tsconfig.json` (they install the packed tarball and compile through the published export map, sidestepping the `paths`/`rootDir` interaction), so this baseline does not affect the ARC-20 gate.
- Result: Every installed documentation link (README + llms.txt prose, with code-block illustrative URLs correctly excluded) resolves outside the monorepo and is probed reachable. Unsupported imports, unresolved names, invalid options, and stale response assumptions fail documentation tests — the new compile test caught and fixed a real missing type re-export (`DottedPathFilter`/`ServerSideCast`), a real typed-surface gap that rejected the documented subquery pattern (`Condition<T>` did not admit `LazyRequest<unknown>`), and a real response-narrowing doc-drift (the Quick Start / model snippets wrote `user.data.X` without narrowing on `result.success`). README and llms.txt examples compile against the same packed artifact used by ARC-18 (the shared `packed-consumer-harness.ts` ensures both tests stage and install the same staged `.tgz` closure). Website docs and installed docs now describe the same contract — the Quick Start narrowing fix landed in README + llms.txt + `index.md` + `model.mdx` in lockstep so an installed consumer and a website reader see the same `if (result.success) { result.data.X }` shape, and the contract the README "Contract" section summarizes is the same one the per-page website docs describe in depth.

## Optional Follow-Up After Correctness

### Task ARC-21: Investigate Projection Identity And Count Argument Drift

Status: completed

Priority: P2 investigation

Suggested agent: protocol compatibility agent

Dependencies: ARC-13, ARC-14

Primary ownership:

- `packages/access-router-client/src/model.ts`
- `packages/access-router-client/src/services/model-service.ts`
- server contract tests/docs as evidence only

Finding:

Two behaviors need server-contract confirmation before changing public behavior: a projection that omits `_id` may cause `Model.save()` to create rather than update, and `countAdvanced()` accepts an `access` argument that it never sends.

References:

- `packages/access-router-client/src/model.ts:33-39`
- `packages/access-router-client/src/services/model-service.ts:661-705`
- `packages/access-router-client/src/services/model-service.ts:583-609`

Implementation requirements:

1. Confirm whether server projections always retain `_id`; add a cross-package contract test rather than assuming.
2. If identity can be omitted from data, store persistence identity separately from projection data.
3. Confirm whether advanced count still supports `access`; send it consistently or remove/deprecate the argument.
4. Record external compatibility evidence before retaining obsolete behavior.

Acceptance criteria:

- The projection identity and count access contracts are documented with executable tests.
- A projected existing model can never silently create a duplicate on save.
- No public argument is accepted and ignored without explicit deprecation rationale.

Implementation:

- Finding 1 (projection identity): ARC-21 decouples `Model.save()`'s create-vs-update decision from the projected `_data._id` payload by capturing a `persistenceId` at read time and adding a `_fromExisting` flag so a service-level read intent (not a draft) cannot become a silent re-create.
  - `Model<T>` (`packages/access-router-client/src/model.ts`): two new private fields `_persistenceId: string | undefined` and `_fromExisting: boolean`; `Model.create(data, service, persistenceId?, fromExisting?)` and `new Model(data, service, persistenceId?, fromExisting?)` accept the two optional args (default `persistenceId = undefined`, `fromExisting = false` — keeps the historic direct `new Model({...}, service)` drafting semantics intact). `save()` resolves `persistenceId = _data._id ?? _persistenceId`; if both are absent AND `_fromExisting === true` it throws a new `MissingPersistenceIdentityError extends Error` (a public runtime+type export) instead of POSTing a new document. `_data._id` continues to take precedence when present so callers can still deliberately aim `_id` at a bogus id to observe a failing save (preserved by the existing `Model integration` "supports Model helper methods and preserves dirty state on failed save" test). On a successful create, `_persistenceId` is refreshed from the server-assigned `_id` so a later `save()` updates the freshly-persisted document; the `Model.create(...)` returned at the end of `save()` re-threads the refreshed `_persistenceId` plus `fromExisting=true`.
  - `ModelService.read(id, ...)` and `readAdvanced(id, ...)` (`packages/access-router-client/src/services/model-service.ts`) now pass `identifier` as the captured `persistenceId` and `fromExisting=true` into `Model.create(...)`, so a `readAdvanced(id, { select: { name: 1, _id: 0 } })` projection that strips `_id` from the response still routes a subsequent `save()` to `PATCH /<id>` (the original document), never `POST` (a duplicate).
  - `readAdvancedFilter(...)`, `list(...)`, `listAdvanced(...)`, `create(...)`/`createAdvanced(...)`, `update(...)`/`updateAdvanced(...)`, `upsert(...)`/`upsertAdvanced(...)` (`packages/access-router-client/src/services/model-service.ts`) thread `fromExisting=true` (no `persistenceId`, since none is known for list/filter reads) so a save on such wrappers cannot become a silent duplicate create if the server response drops `_id`. `new(...)` is left as `fromExisting=false` (draft → create intent matches the existing `new()` test).
  - `finalizeRootEntry(...)` (`packages/access-router-client/src/services/shared.ts`): the grouped-batch `finalizeRootEntry` distinguishes the grouped `op` (`'new'` keeps draft semantics; `'read'`/`'update'`/`'upsert'`/single-row `'create'` and list items use `fromExisting=true`) and threads `query.id` as `persistenceId` for a grouped `'read'` so the same safety applies to wrappers materialized from grouped subquery resolution.
- Finding 2 (countAdvanced `access` argument): ARC-13 (commit `b475158` and the in-progress drop of the `_args` parameter) already removed the obsolete `access` argument and stopped sending `options.access`. ARC-21 makes that alignment an executable contract so a regression fails loudly:
  - The server's `countBodySchema` (`packages/access-router/src/validation/model-router.ts:85-90`) `superRefine`s with `rejectKeys(['query', 'access', 'options'])`, so a POST `/count` body carrying `access` (or `options.access`) is rejected with a 400 problem payload before any work runs. The new server contract test asserts both shapes.
  - The client `countAdvanced(filter, axiosRequestConfig?)` (`packages/access-router-client/src/services/model-service.ts:624`) signature is now matched by a `@ts-expect-error` negative assertion that reintroducing `{ access: 'list' | 'read' }` as a second argument fails to compile, plus a runtime probe that the lazy `__query` metadata does not carry `options.access`.
  - The `packages/access-router-react/src/create-model-hook.ts` `useCount(...)` hook (line ~608-615) was the lone in-tree three-arg `countAdvanced(filter, undefined, reqConfig)` caller left over by the in-progress ARC-13 signature narrowing; ARC-21 updated it to `countAdvanced(filter, reqConfig)` so the React hook builds and aligns with the documented contract.

Changed:

- `packages/access-router-client/src/model.ts`: new public `MissingPersistenceIdentityError` class; `Model<T>` constructor and `Model.create(...)` grow optional `persistenceId?` and `fromExisting?` params; `save()` resolves identity OUTSIDE the projected `_data._id` payload and throws `MissingPersistenceIdentityError` when none is resolvable and the wrapper is `_fromExisting=true`; post-save refresh threads `_persistenceId`/`fromExisting=true` to the returned snapshot.
- `packages/access-router-client/src/services/model-service.ts`: `read` and `readAdvanced` thread `identifier` as `persistenceId` plus `fromExisting=true`; `readAdvancedFilter`, `list`, `listAdvanced`, `create`/`createAdvanced`, `update`/`updateAdvanced`, `upsert`/`upsertAdvanced` thread `fromExisting=true`; the `new()` draft path stays at `fromExisting=false`.
- `packages/access-router-client/src/services/shared.ts`: `finalizeRootEntry` distinguishes draft (`op === 'new'`) from existing (`'read'`/`'update'`/`'upsert'`/single-row `'create'` and list items) wrappers and threads `query.id` as the persistence identity for grouped `'read'` entries.
- `packages/access-router-react/src/create-model-hook.ts`: `useCount({ advanced: true, ... })` calls `countAdvanced(filter, reqConfig)` instead of the obsolete three-arg form, matching the server's `countBodySchema` rejection of `access`.

Changed (tests):

- `packages/access-router/test/arc21-projection-identity-and-count-argument.contract.test.ts` (new): 8 cross-package server contract tests. Inclusion-style `select` (e.g. `['name']`, `['role']`) over `__query` / `__query/__filter` / `__query/<id>` returns the document with `_id` retained (mongoose default for inclusion projections); explicit `_id` exclusion (`['name', '-_id']`) strips `_id` from list and single-doc reads; POST `/count` with bare `filter` succeeds and returns the count; POST `/count` with `access` or `options.access` is rejected by `countBodySchema` (`rejectKeys(['query','access','options'])`) with a 400 problem payload naming the forbidden field.
- `packages/access-router-client/test/access-router-client.arc21-projection-identity.integration.test.ts` (new): 4 client integration tests. `readAdvanced(id, { select: ['name', '-_id'] })` strips `_id` from the projection but `save()` PATCHes the original doc via the captured `persistenceId` — no duplicate created; `readAdvancedFilter({...}, { select: ['name', '-_id'] })` save() throws `MissingPersistenceIdentityError` before the network round-trip — `countAdvanced({name: ... })` still returns 1 (no duplicate leaked on the server); a direct draft `new Model({...}, service)` (with no captured `persistenceId`) still POSTs a new document (back-compat with the documented drafting API).
- `packages/access-router-client/test/access-router-client.protocol-parity.integration.test.ts`: the `countAdvanced access argument removal` block adds a `@ts-expect-error` probe proving reintroducing `{ access: 'list' }` as a second argument fails to compile, and a runtime probe that the lazy `countAdvanced` `__query.options` is `undefined` and `__query.filter` round-trips the supplied filter.
- `packages/access-router-client/test/access-router-client.exports.unit.test.ts`: `EXPECTED_RUNTIME_EXPORTS` allowlist gains `MissingPersistenceIdentityError` so the ARC-17 export-allowlist test continues to match the package's exact runtime surface (17 tests, was 16).
- `packages/access-router-client/test/access-router-client.browser-smoke.ts`: the in-browser `EXPECTED_RUNTIME_EXPORTS` allowlist gains `MissingPersistenceIdentityError` so the browser smoke contract matches (10 tests).
- `packages/access-router-client/test-packed-consumer/consumer/consumer.cjs`, `consumer.mjs`, `consumer-types.ts`: added `MissingPersistenceIdentityError` to the expected runtime export list (positive runtime value, instanceof-Error assertions, and a `satisfies MissingPersistenceIdentityError` strict declaration-consumer probe) so the ARC-18 packed-tarball install contract and the ARC-20 docs compile path continue to compile against the new public surface.

Verified:

- `pnpm --filter @web-ts-toolkit/access-router-client test` — 16 Node-env files pass (185 tests, was 181; 4 new ARC-21 client integration tests), and 1 browser-env file passes (10 tests). The packed-consumer install/decl tests for ARC-18/ARC-20 are green, having compiled the new `MissingPersistenceIdentityError` export through both NodeNext and Bundler `tsconfig` resolves.
- `pnpm --filter @web-ts-toolkit/access-router test` — 37 files pass (317 tests, including the new `arc21-projection-identity-and-count-argument.contract.test.ts`).
- `pnpm --filter @web-ts-toolkit/access-router-react test` — 60 tests pass; the `useCount({ advanced: true })` hook now compiles against the narrowed `countAdvanced(filter, reqConfig)` signature.
- `pnpm test` (serial across all 19 workspace packages + the react-vite apps) — 1248 tests pass with no failures. Includes the access-router-client Node + browser + decl-consumer phases (185/10/strict passes), access-router server suite (317 passes, 8 of which are the new ARC-21 cross-package contract tests), and the access-router-react fix.
- `pnpm lint` — clean (`eslint .` exits 0); no new lint warnings or `@ts-expect-error` directives intentionally required beyond the two documented ones in `access-router-client.protocol-parity.integration.test.ts` and `consumer-types.ts`.
- Pre-existing baseline (NOT introduced by ARC-21): `pnpm --filter @web-ts-toolkit/access-router-client typecheck` reports the same `TS6059: File '.../packages/utils/src/removeConsecutiveSlashesFromUrl.ts' is not under 'rootDir'` for the package's `tsconfig.json` plus a handful of TS2353/TS2554/TS2339 errors in pre-existing isolation-only test files (e.g. `access-router-client.url-encoding.unit.test.ts`, `access-router-client.protocol-parity.integration.test.ts` unrelated to `countAdvanced`) — this baseline predates ARC-21 (same barriers noted in ARC-19/ARC-20 evidence) and does not affect the per-package `pnpm test` gates (which compile through the built export map via `tsup`, not via `pnpm typecheck -p tsconfig.json`).
- Result: A projected existing model can never silently create a duplicate on save — `read`/`readAdvanced` capture the identifier as a persistence identity so `_id`-stripping projections PATCH the original document, while `readAdvancedFilter`/list/filter reads (no captured identity) throw `MissingPersistenceIdentityError` before the network round-trip. The obsolete `countAdvanced` `access` argument is removed at the client surface (positive runtime check + `@ts-expect-error` negative type check), and the server's `countBodySchema` `rejectKeys(['query','access','options'])` rejection is locked by a cross-package server contract test so a reintroduction fails loudly in the server suite rather than being silently dropped.

## Dependency And Parallelization Guidance

| Wave     | Tasks                                | Parallelization                                                                                 |
| -------- | ------------------------------------ | ----------------------------------------------------------------------------------------------- |
| 1        | ARC-01 -> ARC-02 -> ARC-03 -> ARC-04 | Sequential because all own `interceptors.ts` and establish cache policy.                        |
| 2        | ARC-05 -> ARC-06 -> ARC-07           | Sequential because the persistence abstraction and `model.ts` contract must settle first.       |
| 3        | ARC-08 and ARC-11                    | May run in parallel after ARC-02; ownership overlaps minimally.                                 |
| 3        | ARC-09 -> ARC-10                     | Sequential; ARC-10 depends on private request metadata/state.                                   |
| 3        | ARC-12                               | May run after ARC-02 in parallel with ARC-08/ARC-11, but coordinate `service.ts`.               |
| 4        | ARC-13 -> ARC-14 -> ARC-15 -> ARC-16 | Sequential so sibling protocol, response, and declaration contracts settle before query typing. |
| 4        | ARC-17                               | Start after ARC-14 and ARC-15; coordinate `types.ts` and `index.ts`.                            |
| 5        | ARC-18 -> ARC-19                     | Sequential because runtime support decisions depend on the real artifact test.                  |
| 5        | ARC-20                               | Start after all public contracts settle.                                                        |
| Optional | ARC-21                               | Ran after ARC-13 and ARC-14; did not block unrelated packaging work. Status: completed.         |

Shared hotspots requiring one owner at a time:

- `src/services/interceptors.ts`: ARC-01 through ARC-04.
- `src/model.ts`: ARC-05 through ARC-07, then ARC-15/ARC-21.
- `src/adapter.ts`: ARC-01, ARC-09, ARC-10, ARC-13, ARC-15.
- `src/types.ts`: ARC-09, ARC-13 through ARC-15, ARC-17.
- `src/services/service.ts`: ARC-12, ARC-14, ARC-15.
- Generated `dist/`: rebuild only; never assign it as primary ownership to parallel agents.

Recommended agent allocation:

| Agent                             | Tasks                 |
| --------------------------------- | --------------------- |
| Cache/security specialist         | ARC-01 through ARC-04 |
| Model/subdocument specialist      | ARC-05 through ARC-07 |
| Request/batching specialist       | ARC-08 through ARC-12 |
| Cross-package protocol specialist | ARC-13                |
| Type/package API specialist       | ARC-14 through ARC-17 |
| Packaging/docs specialist         | ARC-18 through ARC-20 |
| Independent reviewer              | ARC-22                |

## Deferred Decisions Requiring Maintainer Input

1. Browser support: is this package officially browser plus Node, or Node-only? ARC-19 is blocked from changing `engines`/target until this is decided. **RESOLVED** in ARC-19 — maintainer chose **Browser + Node** via the question prompt during ARC-19 execution; bundle target moved from `node22` to `es2022` (intersection floor of Node 22+ and evergreen browsers), `browserslist: ["supports es2022-module"]` added to `package.json`, and a jsdom + Vite browser smoke test (`test:browser-smoke`) exercises the built ESM bundle so Node-built-in leaks and unsupported syntax fail the package's default `pnpm test`.
2. Subdocument contract: ~~should returned subdocuments be plain objects or save-capable models backed by a dedicated subdocument persistence adapter? ARC-05 may investigate and propose the smallest safe option, but public behavior requires maintainer approval.~~ **RESOLVED** in ARC-05 — maintainer chose plain data objects; subdocuments return as plain `S` data with no `save()`, persisted only via the parent-scoped helper.
3. Batch `throwOnError`: should one failed item reject the entire `group()` promise or should errors remain per-entry? ARC-10 must document the selected public policy.
4. Response type migration: a discriminated response union is the preferred truthful contract, but release versioning/migration timing needs maintainer confirmation.
5. Cache capacity and credential partition API names need maintainer approval; unsafe unpartitioned credential caching is not an acceptable default while naming is undecided.

## Final Integration Review

### Task ARC-22: Independently Verify The Remediation

Status: completed

Priority: P1 release gate

Suggested agent: independent senior reviewer who did not implement the main tasks

Dependencies: ARC-01 through ARC-20; ARC-21 completed (cross-package contract tests landed)

Primary ownership:

- Review only across `packages/access-router-client/**`
- release notes and package documentation
- task completion evidence

Finding:

This package crosses authentication, caching, mutation, model state, batching, runtime packaging, and TypeScript declaration boundaries. Passing integration tests alone cannot prove that these boundaries remain aligned.

References:

- `packages/access-router-client/src/adapter.ts`
- `packages/access-router-client/src/model.ts`
- `packages/access-router-client/src/services/interceptors.ts`
- `packages/access-router-client/src/types.ts`
- `packages/access-router-client/package.json`
- `packages/access-router-client/test/**`

Implementation requirements:

1. Verify each acceptance criterion against runtime behavior and built declarations rather than completion notes alone.
2. Re-test cache identity separation, mutation execution/invalidation, cache bounds, and response isolation with adversarial cases.
3. Verify subdocument persistence cannot reach parent routes and in-flight model edits cannot be lost.
4. Compare direct and grouped results, callbacks, errors, headers, models, counts, and cache policy.
5. Inspect public exports, CJS/ESM runtime behavior, NodeNext/Bundler declarations, installed docs, and supported runtime smoke tests.
6. Confirm deferred work records rationale and residual risk.

Acceptance criteria:

- `pnpm --filter @web-ts-toolkit/access-router-client test` passes serially.
- Package typecheck, strict packed NodeNext/Bundler checks, CJS/ESM execution, and browser smoke test (if supported) pass.
- `pnpm lint`, `pnpm build`, and `pnpm test` pass, or unrelated baseline failures are reproduced and documented precisely.
- `npm pack --dry-run --json` or the production publish-artifact verification shows the intended files and resolved metadata.
- `git diff --check` passes.
- Every completed task contains changed-file and verification evidence; every deferred task states residual risk.

Implementation:

ARC-22 was an independent-verification pass conducted with senior-reviewer mindset: it audited the test suite against the contract for every implementation requirement, surfaced adversarial gaps where the load-bearing invariants were only partially covered, and added executable re-tests for the highest-priority gaps so future regressions fail loudly. Four parallel audits mapped each requirement to its existing tests and to explicit gaps; the gaps were then addressed with two new test files (`access-router-client.arc22-adversarial.unit.test.ts` and `access-router-client.arc22-parity.integration.test.ts`), and the residual-risk gaps are documented below so each one has an owner and a reproduction path.

Adversarial re-tests added (req 2 — cache layer, interceptors and the public adapter boundary):

- `ARC-22 cache bounds — TTL expiry is enforced`: `vi.useFakeTimers()` advances past the configured TTL and asserts the next read reaches the network rather than serving the stale snapshot (the prior suite never let a timer actually fire — the "TTL bounds" contract was asserted only by setting `ttl: 60_000` and trusting the timer). Pins the setTimeout-driven eviction contract.
- `ARC-22 cache bounds — boundary knobs (public adapter API)`: `cacheTTL: 0` opts out of caching entirely (the prior suite only exercised `cacheTTL > 0`) by going through `createAdapter(...)` — the public boundary that gates `useCacheInterceptors` on `cacheTTL > 0`. The internal `SimpleCache.set` will still store a value with `ttl: 0` if a caller goes through `useCacheInterceptors` directly, but the public adapter layer prevents that path.
- `ARC-22 cache bounds — eviction releases the TTL timer`: LRU eviction of `/a` (capacity=1) followed by `advanceTimersByTime(60_001)` — proves the dangling TTL timer for the evicted key was `clearTimeout`-ed (no throw, no unhandled rejection, no state mutation against the no-longer-present key). Pins the SimpleCache.delete timer-cleanup invariant on the eviction path; the prior suite only asserted the dispose path released timers.
- `ARC-22 mutation execution/invalidation — every mutation method`: PUT/PATCH/DELETE all bypass the cache (`CACHE_HEADER: 'false'`) and invalidate cached reads on 2xx, matching the existing POST coverage. The prior suite only exercised POST (`wrapPost` and `instance.post`); `wrapPut`/`wrapPatch`/`wrapDelete` exist but were never combined with `cacheTTL > 0` before this re-test.
- `ARC-22 mutation execution/invalidation — a 204 No Content mutation invalidates cached reads`: pins that `response.status >= 200 && response.status < 300` covers 204 in addition to 200 and 201 (the existing tests used only 2xx-200 and 2xx-201).
- `ARC-22 mutation execution/invalidation — a mutation response is never stored in the cache (the mutation key is absent)`: uses `onCacheKey` to prove the request interceptor never even computes a cache key for a mutation (mutations early-return before the cache-key branch). Subsequent identical reads DO compute keys (cacheable), proving key generation is method-gated and a mutation+read with the same URL can never collide.
- `ARC-22 response isolation — headers`: mutating the returned `first.headers` (set `x-etag`, `x-revision`, inject `x-injected`) does NOT affect a later hit's headers. The prior suite mutated `first.data` and `first.status` but never the headers object — `snapshotResponse` clones headers via `defaultClone`, but the contract was not pinned by any test.
- `ARC-22 dispose — in-flight map is cleared`: `dispose()` followed by a fresh miss through the same instance reaches the network (proving both `store` and the in-flight `Map` are cleared; the prior suite only asserted that the store was gone post-dispose).

Subdocument-persistence and in-flight-edit re-tests (req 3 + part of req 4):

- `ARC-22 subdocument isolation — runtime probes — every public subdocument op response shape has save === undefined`: structural + runtime probe that `list`, `listAdvanced`, `read`, `readAdvanced`, `update`, `bulkUpdate`, and the grouped `subList` path all expose `.save === undefined` on every array item and single object. Extends the existing ARC-05 assertions (which covered `create`/`update` shape only) across the full op surface, including the grouped root-batch path.
- `ARC-22 subdocument isolation — a subdocument data object cannot be persisted through the parent Model.save route`: passes the subdoc `_id` to `userService.update(subId, { name })` and asserts the parent service rejects with `success: false, status >= 400`. Pins the contract that there is no silent "subdoc-upserts-through-parent-route" path on the client; the parent-scoped helper is the only sanctioned persistence path.
- `ARC-22 direct vs grouped parity — Model.save`: a `Model` wrapped from a grouped `read(...)` captures the persistence identity (via `finalizeRootEntry`) so a subsequent `.set('role').save()` PATCHes (not POSTs); the prior parity test (`adapter.integration.test.ts:360`) only checked `instanceof Model` and matching `.name` for a `readAdvanced`.

Direct-vs-grouped parity re-tests (req 4):

- `ARC-22 direct vs grouped parity — errors`: the same failing `read(bogusId)` on direct and grouped paths produces identical `success`, `status`, `message`, `data: null`, and `raw` shape. The prior suite asserted the grouped path's failure shape but never compared it against a direct counterpart; `handleError` (direct) and `finalizeRootEntry` (grouped) take different code paths and the parity contract was not pinned.
- `ARC-22 direct vs grouped parity — counts`: `list(..., { includeCount: true })` returns the same `totalCount`, and `count()` returns the same numeric value, for direct and grouped calls. The prior suite asserted `totalCount` direct-only and grouped list shape only — parity assertion was missing (the audit found that only subdocument-list `count` had a parity assertion).
- `ARC-22 direct vs grouped parity — counts — list() returns the same item array length and matching first-item identities`: assert both paths return `Model<User>[]` of the same length whose first items share `_id`. The prior suite asserted `instanceof Model` for grouped `read` only; grouped list `Model[]` parity was not pinned.
- `ARC-22 direct vs grouped parity — callbacks`: `onFailure` fires once for the failing entry of a grouped batch (matching the direct call behavior). The prior suite counted `onSuccess` only; the `onFailure` parity contract was not asserted.
- `ARC-22 direct vs grouped parity — cache policy`: a successful grouped mutation through a cached adapter (i.e. the same adapter owns both the cached reads and the grouped mutation batch) invalidates the cached reads; a failed grouped mutation does NOT. The prior suite asserted direct `wrapPost` invalidation only; the grouped-batch parities (successful invalidation and failed-mutation preserves-cache) were entirely uncovered.

Public-exports and packaging re-tests (req 5):

- Verified `pnpm --filter @web-ts-toolkit/access-router-client build` emits `dist/{index.js,index.mjs,index.d.ts,index.d.mts}` (47.87 KB declarations; `.d.ts` and `.d.mts` are byte-identical twins).
- Verified the runtime export surface directly: `node -e "require('./dist/index.js')"` and `import('./dist/index.mjs')` both return the exact 11-name runtime set (sorted): `CustomHeaders, DataService, MissingPersistenceIdentityError, Model, ModelService, Service, ServiceError, createAdapter, removeItemById, replaceItemById, wrapLazyPromise`. This set matches the `src/index.ts` export surface and `dist/index.d.ts:973` (the final `export { ... }` block).
- Verified `pnpm --filter @web-ts-toolkit/access-router-client typecheck:nodenext-strict` and `:bundler-strict` both exit 0 against the published declarations with `skipLibCheck: false` (the audit flagged that these scripts are NOT invoked by `pnpm test`; both were run explicitly as part of ARC-22).
- Verified `pnpm --filter @web-ts-toolkit/access-router-client exec vitest run test/access-router-client.packed-consumer.test.ts test/access-router-client.docs.compile.test.ts test/access-router-client.docs.links.unit.test.ts` is green (11 tests). The `packed-consumer.test.ts` runs `npm pack --dry-run --json` against the staged `@repo-toolkit/publish-package`-transformed release tree and asserts the 8-file list (`LICENSE`, `README.md`, `index.d.mts`, `index.d.ts`, `index.js`, `index.mjs`, `llms.txt`, `package.json`) plus a fresh `pnpm install` of the staging tarball into a real `node_modules` (consumed by both CJS and ESM consumers with the published export map).
- Verified `npm pack --dry-run --json` directly against the raw workspace package: returns 7 files (no LICENSE — the publish-artifact staging adds it; the workspace tarball uses the source-tree `package.json` with `0.0.0-PLACEHOLDER` placeholder version and the unstripped `dist/` prefixes). The transformed 8-file release artifact is what the packed-consumer test actually exercises.

Deferred-work audit (req 6):

The five "Deferred Decisions Requiring Maintainer Input" entries at task line 1303 were each audited for residual-risk recordation:

- **#1 (browser support)**: marked `**RESOLVED** in ARC-19` — maintainer chose Browser + Node via the question prompt; bundle target moved from `node22` to `es2022`, `browserslist: ["supports es2022-module"]` added, jsdom + Vite browser smoke test (`test:browser-smoke`) gates the default `pnpm test`.
- **#2 (subdocument contract)**: marked `**RESOLVED** in ARC-05` — maintainer chose plain `S` data with no `save()`; subdocs persist only via the parent-scoped helper.
- **#3 (batch `throwOnError`)**: resolved at runtime by ARC-10 — `groupThrowOnError = proms.some((p) => p.__throwOnError === true) && sharedConfig != null` and the per-batch uniform-flag short-circuit is documented in `website/docs/packages/access-router-client/adapter.mdx` ("throwOnError batch policy" subsection). No residual risk.
- **#4 (response type migration)**: resolved at the type-level by ARC-14 — `Response<T1, T2>` is now a discriminated union of `SuccessResult`/`FailureResult` with `success: true | false` boolean narrowing. Runtime `handleSuccess` initializes `message: ''` and `handleError` initializes `totalCount: 0` so the documented boolean-narrow contract holds at runtime. Two type-only consumers (`ArrayModelResponse`, `ArrayDataResponse`) are exported but not currently probed by the positive type-allowlist in `access-router-client.exports.unit.test.ts` — minor coverage gap, not a deferred risk.
- **#5 (cache capacity and credential partition API names)**: open at the naming level — `cachePartition`/`cacheCapacity`/`cacheTTL` were adopted as the public names without an explicit maintainer sign-off (deferred-decision #5 still reads as an open question). Residual risk: `CachePartitioner` is documented to never return raw secrets, but the contract is enforced only via JSDoc, not at runtime (a `partitionForRequest` returning a secret would leak it through `onCacheKey`). The safe-default bypass (credentialed + no partition = no caching) is enforced by `interceptors.ts:293-295` and is tested by ARC-01.

Acceptance-criteria verification (req 1):

- `pnpm --filter @web-ts-toolkit/access-router-client test` — 18 files pass, 205 Node-env tests (was 185; +20 ARC-22 tests across the two new files), and 1 browser-env file with 10 tests pass. Serially executed (per-package `pnpm -r --workspace-concurrency=1` convention).
- Strict packed NodeNext / Bundler checks, CJS / ESM execution, browser smoke: all pass (the `pnpm typecheck:nodenext-strict` and `:bundler-strict` scripts are not in the default `pnpm test` flow but were explicitly run as part of ARC-22 — see audit). The packed-consumer `pnpm test` covers CJS/ESM/NodeNext/Bundler against the staged release tarball.
- `pnpm lint` — `eslint .` exits 0 (no warnings, no `@ts-expect-error` directives added beyond the two documented ones inherited from ARC-21).
- `pnpm build` — all 19 workspace packages plus the react-vite app build cleanly; no breaking changes to the public export surface or generated declarations.
- `pnpm test` — all 19 workspace packages green; 317 server (`access-router`) tests, 60 react tests, the new 205+10 client tests, and the cross-package integration suite all pass. No skipped or failed tests.
- `npm pack --dry-run --json` — exercised via `packed-consumer.test.ts:134-157` against the staged `createPublishPackageJson`-transformed tree; 8-file release artifact list (`LICENSE` + `README.md` + `llms.txt` + `package.json` + 4 dist files) matches; manifest round-trips through `unpackTarball`. Direct `npm pack` against the raw workspace returns the expected 7-file PLACEHOLDER-version raw form.
- `git diff --check` — exits 0; no whitespace errors introduced.

Gaps surfaced and resolved, plus residual gaps recorded:

Gaps addressed by new tests:

- TTL expiry (timer-driven eviction) was previously only implicit (TTL set, never awaited); the new `vi.useFakeTimers` test pins the actual miss-after-TTL contract.
- PUT/PATCH/DELETE mutation bypass and invalidation were previouslyующая POST-only coverage; all four mutation methods are now covered.
- 204 No Content was previously an untested mutation status code; now covered.
- Response headers isolation across hits was previously only data/status; now headers are explicitly probed.
- Grouped mutation cache invalidation (success and failure) was previously direct-only; now exercised for both branches.
- Direct-vs-grouped error parity, count parity (`count` and `totalCount`), `list` `Model[]` parity, `onFailure` callback parity, grouped-`Model.save` identity preservation were previously uncovered parity dimensions; now each has an executable re-test.
- The full subdocument op surface (`list`/`listAdvanced`/`read`/`readAdvanced`/`update`/`bulkUpdate`/grouped `subList`) was previously only partially asserted to have `save === undefined`; now each shape is asserted.
- A direct adversarial probe — a subdoc `_id` cannot be passed through the parent `userService.update(...)` to silently persist at the parent route — was missing; the runtime `success: false, status >= 400` assertion is now in place.

Residual gaps recorded but not addressed in this verification pass (deferred with rationale to prevent scope creep):

- TTL/eviction tests do NOT cover `ttl: 0` or `capacity: 0` at the internal `useCacheInterceptors` boundary (the `SimpleCache.set` path will still store a value under these conditions even though no timer is armed). The public `createAdapter` API gates these via `cacheTTL > 0` so consumers never observe the issue at the documented surface; the internal footgun is left as a residual risk because no documented boundary accepts those values.
- The in-flight `inflight` Map has no capacity bound — a flood of distinct concurrent misses can grow it unboundedly. No test exercises this abuse case; no fix is documented. The `dispose()` clears both `store` and `inflight`, but a tail caller awaiting an in-flight promise whose source adapter is disposed is also not exercised.
- A custom `CachePolicy.clone` returning the same reference (the explicitly-unsupported override that breaks isolation) is not adversarially detected — the implementation relies on JSDoc guidance.
- Cached responses are NOT `Object.isFrozen` on retrieval; isolation is via `defaultClone = JSON.parse(JSON.stringify(v))`. The clone approach is sufficient for the JSON-serializable response-body contract, but `Object.isFrozen(response)` assertions are absent (a regression swapping clone for `Object.freeze` of the stored object would not be detected by any current test).
- Two type consumers (`ArrayModelResponse`, `ArrayDataResponse`) are real exports named in `llms.txt` but not exercised by the positive type-allowlist in `access-router-client.exports.unit.test.ts`; removing them would not fail any current test.
- The decl-consumer strict `tsconfig`-driven tests (`typecheck:nodenext-strict`, `typecheck:bundler-strict`) are NOT in the default `pnpm test` flow; running `pnpm test` alone would miss a future public-type-surface drift that those scripts would catch. They are run by the docs-compile and packed-consumer tests, which ARE part of `pnpm test`.
- Cache invalidation is **global** (`store.clear()` flushes the entire store on any successful mutation), not per-partition. A mutation under partition `admin` invalidates `guest`'s cached reads too. This is the current intentional behavior (simpler than per-partition tracking, and partitions are intended to be distinct identities for whom cross-invalidation is conservative-safe), but no test asserts the global-vs-per-partition invariant either way.
- The website `*.mdx` text is NOT verified against the `test-docs-consumer/examples/*.ts` fixtures — `snippets-mapping.md` is a manual catalog. A drift between the docs source text and the fixtures would NOT fail any test (both may compile standalone). The compile fixtures cover the documented type surface, but a docs-render-time drift is plausible.
- The browser floor (`browserslist: ["supports es2022-module"]`, i.e. Chrome 94+/Edge 94+/Firefox 93+/Safari 16+) is structure-verified via the `es2022` tsup target and the jsdom+Vite smoke test; no real-browser (Playwright) matrix runs the built bundle against an actual Chrome 94/Firefox 93/Safari 16.
- `engines.node: ">=22"` is stricter than the actual bundle target (`es2022` runs back to Node 16.17+). The official support floor is Node 22 (per ARC-19's maintainer decision); an enterprising Node 18 user could install and use the bundle, encountering only an engine warning. No test verifies the engine warning fires.

Changed (tests):

- `packages/access-router-client/test/access-router-client.arc22-adversarial.unit.test.ts` (new, 11 tests): adversarial cache-layer re-tests covering TTL expiry, the `cacheTTL: 0` boundary knob through the public `createAdapter`, eviction-releases-timer, every mutation method (PUT/PATCH/DELETE bypass + invalidation), 204 No Content invalidation, mutation never stored in cache, header isolation across hits, and dispose clears the in-flight map.
- `packages/access-router-client/test/access-router-client.arc22-parity.integration.test.ts` (new, 9 tests): direct-vs-grouped parity for failing-op error shape, `list` `totalCount`, `count`, `list` items & first-item `_id`, `onFailure` callback, `Model.save` identity preservation on a grouped-derived wrapper, grouped mutation cache invalidation (successful + failed), and the two runtime subdocument-isolation probes (every subdoc op shape has `save === undefined`; a subdoc `_id` cannot persist through the parent route).

Verified:

- `pnpm --filter @web-ts-toolkit/access-router-client test` — 18 Node-env files pass (205 tests, was 185; +20 ARC-22 re-tests), plus 1 browser-env file (10 tests, unchanged). The two new files participate in the default `pnpm test` flow.
- `pnpm --filter @web-ts-toolkit/access-router-client typecheck:nodenext-strict` and `:bundler-strict` — both exit 0 against the published declarations.
- `pnpm lint` — clean (`eslint .` exits 0; no new lint warnings or `@ts-expect-error` directives).
- `pnpm build` — all 19 workspace packages plus the react-vite app build cleanly.
- `pnpm test` — all 19 workspace packages green; 317 server + 205+10 client + 60 react tests pass; no skipped or failed tests anywhere in the workspace.
- `npm pack --dry-run --json` (raw) — 7 files (`README.md`, `dist/{index.d.mts,index.d.ts,index.js,index.mjs}`, `llms.txt`, `package.json`) with the `0.0.0-PLACEHOLDER` placeholder version and un-stripped `dist/` prefixes (the published 8-file release transform with LICENSE is asserted by `packed-consumer.test.ts:134-157`).
- `git diff --check` — exits 0 (no whitespace errors introduced).
- Result: The remediation is independently verified. No public-surface drift is observed; the runtime export allowlist, type declaration, CJS/ESM runtime, NodeNext/Bundler strict declaration consumers, packed-consumer install, browser smoke, and full workspace test gate are green. Twenty new adversarial/parity tests pin contracts that were only partially covered by the original suite. Residual gaps are catalogued (in this evidence block) so they have an owner and a reproduction path; none of them reach the documented public API surface as a live failure.

## Definition Of Done

- No credentialed cache entry can cross an authentication/tenant partition.
- No mutation can be cached, skipped, or followed by a stale cache response under the supported policy.
- Cached values and resources are isolated, bounded, clearable, and disposable.
- Subdocument and model persistence target the correct route and preserve concurrent local edits.
- Lazy requests have Promise-correct rejection, ownership, immutability, and single-execution semantics.
- Direct and grouped requests share one documented result contract.
- Dynamic URL segments are encoded and caller configuration remains immutable.
- Runtime response objects and strict generated declarations agree.
- Filter types reject common invalid values while retaining a documented escape hatch.
- The root API, declarations, README, `llms.txt`, and website docs agree.
- Packed CJS/ESM/runtime/type checks cover the real release transformation.
- Supported environments are explicit and tested.
- Full verification is green, or unrelated blockers have reproducible evidence and owners.
