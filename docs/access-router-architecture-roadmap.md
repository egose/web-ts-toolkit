# Access Router Architecture Roadmap

## Purpose

This document captures the current architectural review of `packages/access-router` and a recommended refactor sequence before implementation starts.

It is intended to answer three questions:

1. What is the package trying to do?
2. Where are the main readability, maintainability, and encapsulation risks?
3. What is the lowest-risk refactor order to improve the package without breaking its current behavior?

This document is the current planning reference for upcoming cleanup work.

## Scope

Reviewed areas:

- `packages/access-router/src`
- `packages/access-router/test`
- package docs and examples where relevant

## Package Purpose

`@web-ts-toolkit/access-router` is an ACL-aware Express router toolkit for two related use cases:

- Mongoose-backed model routers with permission-aware read/write behavior
- in-memory data routers with a similar permission and query model

It also provides:

- request-scoped ACL helpers attached to the Express request
- hook pipelines for validate, prepare, transform, decorate, and related lifecycle behavior
- a root batch router that can dispatch model and data operations from one endpoint
- shared request validation helpers and route-composition helpers

At a high level, the package is trying to make access control declarative and centralized while still exposing a familiar query API to callers.

## Current High-Level Structure

### Routers

HTTP boundary layer.

- `src/routers/model-router.ts`
- `src/routers/data-router.ts`
- `src/routers/root-router.ts`
- `src/routers/validation.ts`
- `src/routers/shared.ts`

Current responsibilities:

- define endpoints
- parse query params and request bodies
- perform route-level authorization checks
- call services
- shape HTTP responses

### ACL Core

Request-scoped ACL/runtime layer.

- `src/core.ts`
- `src/core-data.ts`
- `src/core-shared.ts`
- `src/middleware.ts`

Current responsibilities:

- resolve request permissions
- compute base and override filters
- compute allowed fields and select lists
- run hooks
- expose service access through `req.macl` and `req.dacl`

### Services

Operation workflow layer.

- `src/services/service.ts`
- `src/services/public-service.ts`
- `src/services/data-service.ts`
- `src/services/base.ts`

Current responsibilities:

- find/read/list/create/update/delete workflows
- include and populate orchestration
- output trimming and decoration
- subdocument operations
- defaults resolution

### Options and Metadata

Shared configuration and derived metadata layer.

- `src/options/global-options.ts`
- `src/options/model-options.ts`
- `src/options/data-options.ts`
- `src/options/default-model-options.ts`
- `src/options/manager.ts`
- `src/meta.ts`

Current responsibilities:

- global package settings
- per-model and per-data settings
- metadata lookup for refs and subdocuments

### Types

Public contract layer.

- `src/interfaces/base.ts`
- `src/interfaces/root.ts`
- `src/interfaces/service-*.ts`
- `src/interfaces/data.ts`

Current responsibilities:

- filter and projection typing
- hook and request typing
- router and service option typing
- root batch request and result typing

## Main Findings

### 1. High: too much workflow is concentrated into a few very large modules

Files:

- `packages/access-router/src/routers/model-router.ts`
- `packages/access-router/src/services/service.ts`
- `packages/access-router/src/routers/validation.ts`
- `packages/access-router/src/interfaces/base.ts`
- `packages/access-router/src/interfaces/root.ts`

Why it matters:

- navigation is slow because endpoint, policy, parsing, defaults, and output logic live together
- a small change has a large review surface
- future contributors have to understand too many concerns at once

Recommendation:

- split by workflow and operation family before making behavior changes

### 2. High: package behavior depends heavily on hidden module-level state

Files:

- `packages/access-router/src/options/global-options.ts`
- `packages/access-router/src/options/model-options.ts`
- `packages/access-router/src/options/data-options.ts`
- `packages/access-router/src/options/default-model-options.ts`
- `packages/access-router/src/meta.ts`
- `packages/access-router/src/routers/root-router.ts`

Why it matters:

- the package is hard to isolate across multiple app contexts in one process
- initialization order matters more than it should
- `RootRouter` discovers available targets indirectly through shared registries and `mongoose.models`

Recommendation:

- introduce an explicit runtime container or registry and have routers bind to that runtime

### 3. High: boundaries exist, but responsibility still leaks across layers

Files:

- `packages/access-router/src/core.ts`
- `packages/access-router/src/core-data.ts`
- `packages/access-router/src/routers/data-router.ts`
- `packages/access-router/src/routers/root-router.ts`
- `packages/access-router/src/services/public-service.ts`

Why it matters:

- routers still perform non-trivial orchestration
- `RootRouter` duplicates data decoration behavior that also exists in `DataRouter`
- `Core` and `DataCore` mirror each other closely but are maintained separately

Recommendation:

- consolidate shared orchestration and keep routers closer to transport-only concerns

### 4. Medium: router instances look more mutable than they really are

Files:

- `packages/access-router/src/routers/model-router.ts`
- `packages/access-router/src/routers/data-router.ts`
- `packages/access-router/src/options/manager.ts`

Why it matters:

- the API suggests routers can be reconfigured after construction
- some options are only meaningful at build time because routes are already registered
- this makes option semantics ambiguous

Recommendation:

- distinguish build-time options from runtime behavior options
- either restrict mutation or make supported live mutation explicit

### 5. Medium: the public surface is broad and not strongly curated

Files:

- `packages/access-router/src/index.ts`

Why it matters:

- consumers can couple themselves to low-level internals
- it is harder to know which exports are stable extension points
- the middleware-plus-namespace API is convenient but not very explicit

Recommendation:

- narrow the stable entry point and move lower-level exports behind an advanced surface if needed

### 6. Low: logging and error reporting still bypass package abstractions in a few places

Files:

- `packages/access-router/src/routers/index.ts`
- `packages/access-router/src/model.ts`

Why it matters:

- direct `console.error` use bypasses the configured logger behavior
- operational behavior is less consistent than the rest of the package design suggests

Recommendation:

- route all logging through the package logger abstraction

## Recommendations

### 1. Split the biggest files by feature and workflow

Do this before deeper behavior changes.

Priority files:

- `src/routers/model-router.ts`
- `src/services/service.ts`
- `src/routers/validation.ts`
- `src/interfaces/base.ts`
- `src/interfaces/root.ts`

Expected payoff:

- faster review cycles
- lower cognitive load
- simpler follow-up refactors

### 2. Introduce an explicit runtime container

Suggested concept:

- `createAccessRuntime()`

The runtime should own:

- global options
- model registry
- data registry
- metadata cache

Expected payoff:

- better encapsulation
- multi-app isolation
- more explicit ownership for `RootRouter`

### 3. Reduce duplicated orchestration across model/data paths

Best targets:

- `Core` and `DataCore`
- `DataRouter` and `RootRouter` decoration flows
- defaults resolution in `Service` and `PublicService`

Expected payoff:

- less behavioral drift
- easier bug fixes
- clearer reuse points

### 4. Make option semantics explicit

Split options into:

- build-time options
- request-time behavior options

Expected payoff:

- more predictable router behavior
- less confusion around `set()` and fluent option setters

### 5. Curate the public API boundary

Keep the main package entry focused on:

- router/runtime factories
- public router classes if needed
- stable public types
- permission helpers

Move power-user internals behind a more clearly named advanced surface if they still need to be exported.

## Proposed Refactor Phases

### Phase 1: split oversized modules with no intended behavior change

Goal:

- improve readability first

Status:

- in progress
- current Phase 1 structural slices are complete and verified with the package test suite

Completed so far:

1. split `src/routers/validation.ts` into focused modules under `src/validation/`
2. split `ModelRouter` route registration into focused modules:
   - `src/routers/model-router-collection.ts`
   - `src/routers/model-router-document.ts`
   - `src/routers/model-router-subdocument.ts`
   - `src/routers/model-router-context.ts`
3. split `Service` defaults and subdocument workflows into focused modules:
   - `src/services/service-defaults.ts`
   - `src/services/service-subdocuments.ts`
4. extracted foundational interface groups into focused modules:
   - `src/interfaces/request.ts`
   - `src/interfaces/access.ts`
   - `src/interfaces/query-types.ts`
   - `src/interfaces/router-hooks.ts`

Compatibility notes:

- `src/routers/validation.ts` remains as a compatibility re-export of `src/validation/`
- `src/services/service.ts` remains the stable public class boundary and delegates to extracted helpers
- `src/interfaces/base.ts` and `src/interfaces/root.ts` preserve existing export expectations by composing from the extracted modules

Suggested work:

1. split `src/routers/validation.ts`
2. split `src/routers/model-router.ts`
3. split `src/services/service.ts`
4. split type-heavy interface files

Suggested target layout:

- `src/validation/common.ts`
- `src/validation/model-router.ts`
- `src/validation/data-router.ts`
- `src/validation/root-router.ts`
- `src/validation/parsers.ts`
- `src/routers/model-router/index.ts`
- `src/routers/model-router/collection-routes.ts`
- `src/routers/model-router/document-routes.ts`
- `src/routers/model-router/subdocument-routes.ts`
- `src/services/model-service/read-service.ts`
- `src/services/model-service/write-service.ts`
- `src/services/model-service/delete-service.ts`
- `src/services/model-service/subdocument-service.ts`

Exit criteria:

- tests stay green
- no intended API change
- file ownership becomes easier to explain

Verification so far:

- `pnpm --filter @web-ts-toolkit/access-router test`
- latest result after the current Phase 1 slices: `9 passed`, `69 passed`

### Phase 2: introduce shared response and orchestration helpers

Goal:

- remove duplicated logic before bigger structural changes

Status:

- completed

Completed so far:

1. extracted shared data decoration helpers into:
   - `src/http/response-pipelines/data-response.ts`
2. wired both direct data-router endpoints and root batch data operations to the same shared data decoration helpers
3. extracted shared list-envelope and created/upsert response helpers into:
   - `src/http/response-pipelines/list-response.ts`
4. extracted shared model response helpers into:
   - `src/http/response-pipelines/model-response.ts`
5. kept router-level compatibility wrappers where useful so existing imports continue to work during the refactor

Suggested work:

1. extract shared list response helpers
2. extract shared model/data decoration pipelines
3. reduce overlap between direct routers and root batch handlers

Candidate modules:

- `src/http/response-pipelines/list-response.ts`
- `src/http/response-pipelines/data-response.ts`
- `src/http/response-pipelines/model-response.ts`

Exit criteria:

- root and direct routes use the same output shaping rules where applicable

Verification:

- `pnpm --filter @web-ts-toolkit/access-router test`
- latest result after Phase 2 extraction work: `9 passed`, `69 passed`

### Phase 3: introduce `createAccessRuntime()` behind the current API

Goal:

- make ownership explicit without forcing a breaking API change first

Status:

- completed

Completed so far:

1. introduced runtime storage and active-runtime context plumbing
2. added `createAccessRuntime()` and runtime-bound API objects
3. bound router factories to runtime instances so `ModelRouter`, `DataRouter`, and `RootRouter` are created against a specific runtime
4. switched default package exports to a default runtime-backed API so the existing public package surface still works
5. moved root batch target discovery off hidden process-global lookup and onto the runtime registries
6. made option/meta lookups runtime-aware so request execution can resolve against the active runtime
7. added runtime-isolation coverage proving:
   - separate runtime APIs keep separate global options
   - `RootRouter` target discovery is isolated per runtime

Suggested work:

1. create a runtime object that owns options and registries
2. bind router factories to that runtime
3. keep current top-level exports wired to a default runtime for compatibility

Candidate modules:

- `src/runtime/access-runtime.ts`
- `src/runtime/model-registry.ts`
- `src/runtime/data-registry.ts`
- `src/runtime/metadata-registry.ts`
- `src/runtime/global-options-store.ts`

Exit criteria:

- `RootRouter` no longer needs hidden global discovery for targets
- package can support isolated runtime instances

Verification:

- `pnpm --filter @web-ts-toolkit/access-router test`
- latest result after Phase 3 runtime work: `9 passed`, `71 passed`

### Phase 4: tighten ACL boundaries and remove duplication in request-scoped logic

Goal:

- make ACL resolution easier to follow and easier to reuse

Suggested work:

1. consolidate shared logic from `core.ts` and `core-data.ts`
2. keep storage-specific behavior separate only where required
3. move request permission setup and hook execution into more focused modules

Candidate modules:

- `src/acl/request-context.ts`
- `src/acl/filter-resolution.ts`
- `src/acl/select-resolution.ts`
- `src/acl/hook-runner.ts`
- `src/acl/model-acl.ts`
- `src/acl/data-acl.ts`

Exit criteria:

- model and data ACL flows share more infrastructure without forcing identical behavior

### Phase 5: clarify configuration and public API semantics

Goal:

- make the package easier to consume and safer to extend

Suggested work:

1. classify options as build-time or runtime-mutable
2. restrict or document post-construction mutation accordingly
3. trim the stable export surface in `src/index.ts`
4. optionally introduce an explicit namespace-style API while keeping compatibility aliases

Exit criteria:

- consumers can tell which APIs are stable and which are advanced
- router mutability behavior is explicit

## Recommended Implementation Order

1. Phase 1: file splits only
2. Phase 2: shared response/decorate helpers
3. Phase 3: runtime container behind current exports
4. Phase 4: ACL core consolidation
5. Phase 5: public API and configuration cleanup

This order keeps risk low by improving readability first, then removing duplication, then changing ownership boundaries.

Current next step:

- move into Phase 4 and consolidate ACL request-scoped logic further

## Recommended First Milestone

If the cleanup should start with the highest payoff and lowest risk, use this milestone:

1. split `src/routers/validation.ts`
2. split `src/routers/model-router.ts`
3. extract `Service` defaults and subdocument workflows into focused modules
4. split the foundational interface/type families while preserving current exports

Current status:

- completed
- the next recommended step is to move into Phase 2 shared response and orchestration helpers

Why this first:

- it improves readability immediately
- it reduces future merge conflicts in the most active areas
- it prepares the package for a better ownership model without forcing a breaking change yet

## Non-Goals For The First Pass

These changes should not be first:

- large rewrites of filter typing
- hook API redesign
- removal of the default export
- broad consumer-facing API changes without compatibility support

Those are higher-churn changes and should only happen after module boundaries and runtime ownership are clearer.

## Success Criteria

The refactor should be considered successful when:

- package behavior remains covered by existing tests
- the largest modules are split into focused files
- package runtime ownership is explicit instead of mostly global
- direct routers and root batch routes reuse more shared orchestration
- consumers have a clearer stable API boundary

## Notes

- The existing `docs/acl-architecture-review.md` is a historical review and should not be treated as the current source of truth for the upcoming refactor plan.
- This roadmap should be updated as each phase is completed.
- Phase 1 was intentionally implemented as compatibility-preserving structural extraction rather than a public API redesign.
