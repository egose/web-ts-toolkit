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

Status: pending

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

### Task ARC-02: Centralize Mutation Cache Bypass And Invalidation

Status: pending

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

### Task ARC-03: Bound And Isolate Cached Values

Status: pending

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

### Task ARC-04: Deduplicate Concurrent Cache Misses

Status: pending

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

## Wave 2: Subdocument And Model Correctness

### Task ARC-05: Define A Safe Subdocument Persistence Contract

Status: pending

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

### Task ARC-06: Preserve Concurrent Edits During Model Save

Status: pending

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

### Task ARC-07: Make Dirty Tracking Match Effective Changes

Status: pending

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

## Wave 3: Request Semantics And Encapsulation

### Task ARC-08: Fix Advanced Data Read Option Placement

Status: pending

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

### Task ARC-09: Harden Lazy Request Ownership And Execution State

Status: pending

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

### Task ARC-10: Unify Direct And Grouped Result Finalization

Status: pending

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

### Task ARC-11: Encode Dynamic URL Path Segments

Status: pending

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

### Task ARC-12: Stop Mutating Caller-Owned Configuration

Status: pending

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

## Wave 4: Sibling Protocol And Public Types

### Task ARC-13: Enforce Access Router Protocol Parity

Status: pending

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

### Task ARC-14: Make Response Types Match Runtime Results

Status: pending

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

### Task ARC-15: Repair Strict Generated Declarations

Status: pending

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

### Task ARC-16: Restore Useful Filter Query Type Safety

Status: pending

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

### Task ARC-17: Curate And Document The Public Export Surface

Status: pending

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

## Wave 5: Packaging, Compatibility, And Documentation

### Task ARC-18: Test The Packed CJS, ESM, And Declaration Surface

Status: pending

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

### Task ARC-19: Decide And Verify Browser Compatibility

Status: pending

Priority: P2

Suggested agent: compatibility agent

Dependencies: ARC-18

Primary ownership:

- `packages/access-router-client/package.json`
- `packages/access-router-client/tsup.config.ts`
- browser/Vite smoke test
- installed documentation

Finding:

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

### Task ARC-20: Make Installed Documentation Accurate And Testable

Status: pending

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

## Optional Follow-Up After Correctness

### Task ARC-21: Investigate Projection Identity And Count Argument Drift

Status: pending

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
| Optional | ARC-21                               | May run after ARC-13 and ARC-14 and should not block unrelated packaging work.                  |

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

1. Browser support: is this package officially browser plus Node, or Node-only? ARC-19 is blocked from changing `engines`/target until this is decided.
2. Subdocument contract: should returned subdocuments be plain objects or save-capable models backed by a dedicated subdocument persistence adapter? ARC-05 may investigate and propose the smallest safe option, but public behavior requires maintainer approval.
3. Batch `throwOnError`: should one failed item reject the entire `group()` promise or should errors remain per-entry? ARC-10 must document the selected public policy.
4. Response type migration: a discriminated response union is the preferred truthful contract, but release versioning/migration timing needs maintainer confirmation.
5. Cache capacity and credential partition API names need maintainer approval; unsafe unpartitioned credential caching is not an acceptable default while naming is undecided.

## Final Integration Review

### Task ARC-22: Independently Verify The Remediation

Status: pending

Priority: P1 release gate

Suggested agent: independent senior reviewer who did not implement the main tasks

Dependencies: ARC-01 through ARC-20; ARC-21 may be completed or explicitly deferred with evidence

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
