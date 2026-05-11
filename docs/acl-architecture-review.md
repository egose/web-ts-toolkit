# ACL Architecture Review

## Purpose

This document summarizes the main philosophy of the ACL package and identifies the strongest opportunities for encapsulation, optimization, and cleanup, with emphasis on readability and maintainability.

Scope reviewed:

- `docusaurus/docs/egose-acl`
- `packages/acl/src`
- selected tests under `packages/acl/test`

## Main Philosophy

The package is built around a clear idea: ACL is the backend security boundary for model-backed and data-backed resources.

The intended flow is:

1. `routeGuard` controls whether a requester can access a route at all.
2. `baseFilter` constrains which documents or rows are visible.
3. `permissionSchema` and `docPermissions` constrain which fields are visible or editable.
4. lifecycle hooks such as `validate`, `prepare`, `transform`, `finalize`, and `decorate` let business rules stay close to the resource definition.
5. the frontend can send Mongoose-like query shapes, but the backend should decorate and restrict those queries before they reach the data source.

This philosophy is visible in:

- `docusaurus/docs/egose-acl/philosophy.mdx`
- `docusaurus/docs/egose-acl/quick-start.mdx`

In short, the package is trying to make access control declarative, centralized, and reusable while still exposing a familiar query surface.

## Findings

### 1. High: `baseFilter` caching mixes reusable ACL state with request-specific filters

Files:

- `packages/acl/src/core.ts:101-123`
- `packages/acl/src/core-data.ts:77-99`

Why it matters:

`genFilter()` caches the merged result of `baseFilter` and the caller-provided `_filter`, but the cache key only includes `model/access` or `data/access`.

That means a later call in the same request can accidentally reuse a previously merged filter that belonged to a different query. This is both a correctness problem and an encapsulation issue: the cache is no longer caching the base ACL boundary, it is caching a fully composed query.

Recommended direction:

- cache only the raw `baseFilter` result
- merge the caller filter on each invocation without caching the merged result

### 2. High: query-time field protection is weaker than the stated philosophy

Files:

- `packages/acl/src/core.ts:178-236`
- `packages/acl/src/core-data.ts:142-188`
- `docusaurus/docs/egose-acl/philosophy.mdx:32-56`

Why it matters:

The docs frame ACL as decorating the query boundary, but `genSelect()` allows unknown permission keys through when `skipChecks` is enabled. In practice, some protected fields may still be selected or populated from the data source and only removed later from the returned object.

This creates a split responsibility:

- query building is only partially enforcing ACL
- response shaping finishes the job later

That makes the implementation harder to reason about and undermines the main architectural promise.

Recommended direction:

- separate query-safe field computation from response-safe field trimming
- default toward deny at query construction time unless a permission rule explicitly allows a field

### 3. High: model metadata discovery is timing-dependent and globally fragile

Files:

- `packages/acl/src/meta.ts:7-36`
- `packages/acl/src/routers/model-router.ts:55-64`
- `packages/acl/src/routers/model-router.ts:508-620`
- `packages/acl/src/core.ts:238-266`

Why it matters:

Model metadata is populated via a polling loop that stops as soon as any model exists. Models registered later may not be reflected in reference metadata or subdocument metadata.

This makes route generation and populate ACL behavior depend on application boot timing rather than explicit model state.

Recommended direction:

- replace global polling with explicit lazy registration per model
- compute metadata when a model router is created, or memoize per model on demand

### 4. Medium-High: field-permission expansion is an N+1 performance trap

Files:

- `packages/acl/src/core.ts:348-390`
- `packages/acl/src/services/service.ts:133-145`
- `packages/acl/src/services/service.ts:255-270`
- `packages/acl/src/services/service.ts:338-347`
- `packages/acl/src/services/service.ts:449-459`

Why it matters:

`addFieldPermissions()` may perform additional `exists()` checks for `read` and `update` per returned document, then compute allowed fields again. In list-heavy flows this turns permission decoration into repeated database work.

This is a strong optimization target because it affects the common read path and also makes the ACL pipeline harder to follow.

Recommended direction:

- avoid existence checks per document when the current route access already implies the operation is valid
- compute field permission maps from the current document and current access context where possible
- consider making full field-permission expansion opt-in for expensive routes

### 5. Medium-High: model-backed and data-backed ACL engines are duplicated and drifting

Files:

- `packages/acl/src/core.ts`
- `packages/acl/src/core-data.ts`
- `packages/acl/src/routers/model-router.ts`
- `packages/acl/src/routers/data-router.ts`
- `packages/acl/src/services/service.ts`
- `packages/acl/src/services/data-service.ts`

Why it matters:

The package maintains parallel implementations of the same ideas for Mongoose data and in-memory data.

This already caused behavioral drift. One visible example:

- `Service.find()` returns a filtered `totalCount`
- `DataService.find()` returns `this.data.length` even when a filter is active

Duplication here makes bug fixes expensive and increases the chance that one path improves while the other silently diverges.

Recommended direction:

- extract a shared ACL evaluation layer for permissions, filters, selects, and middleware invocation
- keep only the storage adapter distinct

### 6. Medium: route guard semantics are broader than the docs communicate

Files:

- `docusaurus/docs/egose-acl/options/model-options.mdx:252-279`
- `packages/acl/src/interfaces/root.ts:94-105`
- `packages/acl/src/interfaces/root.ts:207-217`
- `packages/acl/src/routers/model-router.ts:212-219`
- `packages/acl/src/routers/model-router.ts:229-253`
- `packages/acl/src/routers/model-router.ts:381-503`
- `packages/acl/src/routers/model-router.ts:508-620`

Why it matters:

The docs present `routeGuard` mainly as CRUDL. The implementation also covers `new`, `count`, `distinct`, `upsert`, and subdocument routes. That is not necessarily wrong, but it means the public mental model is smaller than the actual API surface.

This increases cognitive load and makes the package harder to learn.

Recommended direction:

- either narrow the guard surface to the documented concepts
- or update the docs and naming so the full access surface is first-class

### 7. Medium: `permissionField` is overloaded across request scope and document scope

Files:

- `packages/acl/src/options/global-options.ts:4-7`
- `packages/acl/src/options/default-model-options.ts:7-17`
- `packages/acl/src/core.ts:334-345`
- `packages/acl/src/core.ts:428-443`

Why it matters:

The same term, `permissionField`, is used for:

- the request field holding global permissions
- the document field holding document permissions

Those are related ideas, but they are not the same abstraction. Reusing the same name adds avoidable ambiguity to both docs and code.

Recommended direction:

- split this into distinct names such as `requestPermissionField` and `documentPermissionField`

### 8. Medium: `docPermissions` hook failures are silently swallowed

Files:

- `packages/acl/src/core.ts:318-331`

Why it matters:

If a `docPermissions` hook throws, the code falls back to empty permissions with no visibility into the failure. That may be fail-closed in some cases, but it is poor for maintainability because permission bugs become silent behavior changes.

Recommended direction:

- at minimum, log the failure
- ideally provide a configurable error policy: fail closed with logging, or fail hard in strict mode

## Refactor Plan

## Current Status

Completed so far:

- Phase 1 correctness work
- Phase 2 shared ACL core extraction
- router response helper extraction from `ModelRouter` and `DataRouter`
- service-layer boundary cleanup that makes query-time selection and response-time trimming explicit

Implemented files of note:

- `packages/acl/src/core-shared.ts`
- `packages/acl/src/routers/shared.ts`
- `packages/acl/src/core.ts`
- `packages/acl/src/core-data.ts`
- `packages/acl/src/services/base.ts`
- `packages/acl/src/services/service.ts`
- `packages/acl/src/services/data-service.ts`
- `packages/acl/test/model-router.integration.test.ts`
- `packages/acl/test/data-router.test.ts`

Verified status:

- full `packages/acl` test suite passing after each refactor step

## Refactor Progress

### Phase 1: correctness and safety

Goal: fix the highest-risk issues without changing the public package shape more than necessary.

Tasks:

1. Fix `genFilter()` caching in both `Core` and `DataCore`
2. Add focused tests for repeated `genFilter()` calls with different caller filters in one request
3. Add logging or strict-mode handling for `docPermissions` hook failures
4. Audit route access names and add tests for `upsert`, `count`, `distinct`, and subdocument guards

Expected payoff:

- prevents wrong ACL decisions
- improves trust in the current implementation
- gives a safer base for further cleanup

Status:

- completed
- `genFilter()` cache semantics were fixed in both cores
- regression tests were added for model and data flows
- `docPermissions` failures now emit warnings instead of failing silently
- route-surface coverage was added for `count`, `distinct`, and `upsert`

### Phase 2: extract a shared ACL evaluator

Goal: reduce duplication between model-backed and data-backed flows.

Tasks:

1. Extract shared logic for:
   - global permission loading
   - route guard evaluation
   - base filter resolution
   - allowed field generation
   - select normalization and validation
   - middleware calling
2. Keep source-specific behavior in small adapters:
   - Mongoose adapter
   - in-memory data adapter
3. Move duplicated helper methods out of `Core` and `DataCore` into a common module or base class

Expected payoff:

- one place to reason about ACL rules
- lower chance of semantic drift
- easier testing and maintenance

Status:

- partially completed
- shared request permission loading, route-guard evaluation, identifier filter resolution, base-filter resolution, middleware chaining, and schema-field collection were extracted into `packages/acl/src/core-shared.ts`
- `Core` and `DataCore` now depend on the shared helper module for those concerns
- source-specific behavior still remains appropriately separate in service and router layers

### Phase 3: separate query enforcement from response shaping

Goal: make the security boundary easier to understand and closer to the documented philosophy.

Tasks:

1. Define a clear distinction between:
   - fields allowed to be queried/selected
   - fields allowed to be returned
   - fields allowed to be edited
2. Rework `genSelect()` so it explicitly produces query-safe field sets
3. Keep response trimming as a separate step with explicit naming
4. Revisit `populate` handling to ensure protected relations are denied before query execution where possible

Expected payoff:

- clearer mental model
- less hidden coupling between query and output stages
- behavior more aligned with the docs

Status:

- partially completed
- service code now uses explicit internal names for query-time selection and response-time trimming:
  - `genQuerySelect(...)`
  - `trimOutputFields(...)`
- this is currently a readability and maintainability cleanup, not yet a semantic rewrite of `genSelect()` itself
- the deeper security-boundary change around deny-by-default query selection is still pending

### Phase 4: metadata and router cleanup

Goal: remove timing-sensitive global state and simplify route construction.

Tasks:

1. Replace polling-based metadata collection in `meta.ts` with on-demand model introspection
2. Make subdocument route generation depend on explicit metadata retrieval rather than global readiness listeners
3. Extract common route-building patterns from `ModelRouter` and `DataRouter`
4. Normalize boolean-query parsing and repeated response formatting helpers

Expected payoff:

- less boot-order fragility
- smaller router classes
- easier to add new route types without copy/paste

Status:

- partially completed
- shared router response helpers were extracted into `packages/acl/src/routers/shared.ts`
- repeated boolean parsing, route param extraction, list response formatting, and create/upsert payload formatting were removed from both routers
- metadata polling and readiness coupling are still pending

### Phase 5: naming and documentation alignment

Goal: reduce cognitive overhead for maintainers and users.

Tasks:

1. Rename ambiguous concepts such as `permissionField`
2. Decide whether the public access model is truly CRUDL or a broader route matrix
3. Update `docusaurus/docs/egose-acl` to match the actual route and lifecycle surface
4. Document expensive features such as field-permission expansion and when to avoid them on large lists

Expected payoff:

- better readability
- fewer surprises for integrators
- docs that match the package users actually run

Status:

- partially completed
- the package now uses `requestPermissionField` for request-scoped permissions and `documentPermissionField` for document-scoped permissions
- ACL docs under `docusaurus/docs/egose-acl` were updated to reflect the new names
- broader API naming cleanup and docs alignment are still pending outside this specific rename

## Suggested Order of Work

If this package is going to be actively improved, the highest-value sequence is:

1. fix `baseFilter` caching
2. add tests around filter correctness and route access behavior
3. extract shared ACL evaluation primitives
4. untangle query enforcement from response shaping
5. clean up metadata loading and router duplication
6. update docs and naming

## Actionable Checklist

### P0: correctness blockers

- [x] Fix `Core.genFilter()` cache behavior in `packages/acl/src/core.ts`
- [x] Fix `DataCore.genFilter()` cache behavior in `packages/acl/src/core-data.ts`
- [x] Add regression tests that call `genFilter()` multiple times with different caller filters in one request lifecycle
- [x] Verify the same regression coverage for data routers and model routers
- [x] Add visibility for `docPermissions` hook failures through logging or strict-mode behavior

### P1: contract clarity

- [ ] Document the full `routeGuard` surface: `new`, `list`, `read`, `update`, `delete`, `create`, `distinct`, `count`, `upsert`, and `subs.*`
- [ ] Decide whether `upsert` is a supported public access type and reflect that consistently in types, docs, and router behavior
- [~] Define whether ACL guarantees query-time protection, response-time protection, or both
- [x] Split the overloaded meaning of `permissionField` into distinct request/document concepts

### P2: performance and duplication

- [ ] Measure list-read overhead when `includePermissions` is enabled
- [ ] Remove per-document permission work that can be derived from current route context
- [x] Extract common permission evaluation from `Core` and `DataCore`
- [x] Extract shared route response formatting helpers from `ModelRouter` and `DataRouter`
- [ ] Align `totalCount` semantics between `Service.find()` and `DataService.find()`

### P3: architecture cleanup

- [ ] Replace global metadata polling in `packages/acl/src/meta.ts`
- [ ] Move model metadata loading to explicit lazy initialization
- [x] Separate query-safe field selection from response-safe field trimming
- [ ] Review `populate` ACL handling so denied relations are blocked earlier
- [ ] Reconcile docs under `docusaurus/docs/egose-acl` with actual package behavior

Legend:

- `[x]` done
- `[~]` partially done
- `[ ]` not started

## Phase 1 Roadmap

### Objective

Deliver the highest-value correctness improvements first, with minimal public API churn.

### Scope

Included:

- `baseFilter` cache correctness
- regression coverage for repeated filter generation
- `docPermissions` failure visibility
- route-access audit coverage for the current router surface

Excluded from this phase:

- large architectural extraction between model/data stacks
- metadata redesign
- naming changes that would affect public API
- query/response separation redesign

### Work Items

#### 1. Fix `genFilter()` cache semantics

Target files:

- `packages/acl/src/core.ts`
- `packages/acl/src/core-data.ts`

Implementation intent:

- keep request-local caching
- cache only the resolved `baseFilter` result per resource and access
- do not cache merged `{ $and: [...] }` results that include caller-specific filters
- keep current public behavior for `false`, `true`, empty, and explicit caller filters

Acceptance criteria:

- repeated calls with different `_filter` inputs return independently merged results
- repeated calls with no `_filter` still benefit from cached base-filter resolution
- behavior matches between model-backed and data-backed flows

#### 2. Add regression tests for filter correctness

Target files:

- `packages/acl/test/model-router.integration.test.ts`
- `packages/acl/test/data-router.test.ts`
- or a focused new test file if cleaner

Test cases:

- one request path that triggers two ACL checks with different filters and confirms they do not reuse each other
- one test that proves cached `baseFilter` still applies consistently when no extra filter is passed
- one data-router equivalent to avoid future drift

Acceptance criteria:

- tests fail against the buggy implementation
- tests pass after the fix

#### 3. Make `docPermissions` failures visible

Target files:

- `packages/acl/src/core.ts`
- optionally `packages/acl/src/logger.ts` if a structured log helper already exists

Implementation intent:

- preserve fail-closed behavior for now
- add a warning log with model name, access type, and enough context to diagnose the broken hook
- avoid introducing a breaking behavior change in this phase

Acceptance criteria:

- thrown `docPermissions` hooks do not fail silently
- existing successful flows remain unchanged

#### 4. Audit and lock current route access behavior with tests

Target files:

- `packages/acl/src/routers/model-router.ts`
- relevant test files under `packages/acl/test`

Implementation intent:

- confirm which access names are actually supported today
- add tests for `count`, `distinct`, and `upsert`
- add at least one subdocument guard test if subdocument fixtures are already easy to create
- document any intentional mismatch between docs and current implementation in code comments or follow-up notes

Acceptance criteria:

- current supported route-guard surface is test-backed
- future cleanup can change behavior deliberately instead of accidentally

### Suggested Delivery Sequence

1. Add failing regression tests for `genFilter()`
2. Implement the cache fix in both `Core` and `DataCore`
3. Re-run the targeted ACL tests
4. Add `docPermissions` warning behavior
5. Add route-surface regression tests
6. Update the review doc with any discoveries from implementation

### Risk Notes

- Cache fixes may expose previously hidden behavior in tests that accidentally depended on the bug
- Logging changes can affect snapshot tests if logs are captured anywhere
- Route-surface tests may reveal undocumented but relied-on behavior, especially around `upsert`

### Definition of Done for Phase 1

- filter-caching bug is fixed in both ACL cores
- regression tests exist for the bug and pass
- `docPermissions` failures are observable
- route access behavior is better specified through tests
- no intentional public API break is introduced

## Closing Note

The package philosophy is strong. The main issue is not the design intent, but the amount of duplicated and distributed implementation needed to realize it. The best refactor path is to preserve the declarative API while reducing the number of places where ACL decisions are made.
