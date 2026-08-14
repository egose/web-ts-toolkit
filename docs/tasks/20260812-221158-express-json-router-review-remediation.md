# Express JSON Router Review Remediation

Created: 2026-08-12 22:11:58 PDT

Package: `packages/express-json-router`

## Objective

Remediate confirmed mutation-safety, Express compatibility, encapsulation, public-type, packaging, and documentation gaps in `@web-ts-toolkit/express-json-router`. The end state must preserve the package's return-value routing behavior while making route registration deterministic, endpoint metadata trustworthy, supported Express behavior explicit, and the installed ESM/CJS TypeScript experience independently verifiable.

## Scope And Working Rules

- Add a focused regression that fails on the current implementation before each behavioral fix.
- Keep response serialization, error redaction, hook lifecycle, and streaming ownership in `@web-ts-toolkit/express-response-handler`; do not duplicate that package's pipeline.
- Preserve the currently used `get`, `post`, `put`, `patch`, `delete`, `route`, `original`, constructor middleware, custom response-handler, and static helper contracts unless a task explicitly changes them.
- Treat constructor arrays and returned metadata as caller-controlled mutable values; snapshot or copy them at the package boundary.
- Do not edit generated `dist/` or ignored `src/**/*.js` files manually. Build from TypeScript source.
- Update the shipped `README.md`, declarations, website docs, and consumer tests together when public behavior changes.
- Preserve unrelated worktree changes and never revert another agent's work.
- Run package tests serially. Package test scripts rebuild shared `dist/` outputs, so agents must not run `express-json-router`, `express-response-handler`, `access-router`, or `message-service` build/test commands concurrently.

## Non-Goals

- Do not redesign `@web-ts-toolkit/express-response-handler` request lifecycle behavior.
- Do not remove `router.original`; downstream packages use it as their Express mounting contract.
- Do not add compatibility aliases for members that have no demonstrated external use.
- Do not optimize route-registration allocations without a reproducible benchmark showing material impact.
- Do not add `llms.txt` before metadata, declarations, README, and packed-consumer verification are correct.

## Review Baseline

Confirmed on 2026-08-12 against a clean tracked worktree before this task file was created:

- `pnpm --filter @web-ts-toolkit/express-json-router test`: passed, 1 file and 13 tests.
- `pnpm exec eslint "packages/express-json-router/**/*.{ts,js}"`: passed with no findings.
- `git diff --check`: passed.
- `npm pack --dry-run --json`: passed and listed 6 intended files: `package.json`, `README.md`, and four `dist/index` runtime/declaration files.
- `pnpm exec tsc --noEmit -p tsconfig.json` from the package failed in path-mapped sibling `http-errors` and `utils` source files. There is no package-local consumer typecheck that isolates this package's emitted declarations.
- `src/index.ts` is the only tracked implementation source. The local ignored `src/index.js` is not a source of truth.
- Tests import `../dist/index.mjs`, so they exercise built ESM runtime behavior but not package-name resolution, CJS loading, conditional declarations, or a clean installed consumer.
- Express 5.2.1 exposes methods absent from the package's hard-coded list, including `acl`, `bind`, `connect`, `link`, `propfind`, `proppatch`, `rebind`, `source`, `unbind`, and `unlink`.
- No request-time performance defect was confirmed. Wrapper allocation occurs during route registration, not per request; optimize only after measurement.

## Priorities

- P0: an authorization or required middleware boundary can be silently bypassed.
- P1: route metadata can lie, valid advertised routing behavior fails, or installed consumers cannot reliably load/type the package.
- P2: encapsulation, type discoverability, documentation, testability, or measured maintainability gaps.
- P3: optional compatibility or performance work whose value depends on maintainer policy or benchmark evidence.

## Wave 1: Mutation Safety And Trusted Metadata

### Task EJR-01: Snapshot Constructor Middleware Configuration

Status: complete

Priority: P0

Suggested agent: Express security regression specialist

Dependencies: none

Primary ownership:

- `packages/express-json-router/src/index.ts`
- focused mutation tests in `packages/express-json-router/test/express-json-router.test.ts`

Finding:

`toMiddlewareList` returns a caller-provided array unchanged, and `JsonRouter.middlewares` publicly exposes that same mutable array. Mutating it after construction changes the middleware wrapped into routes registered later. A caller can therefore replace a required authentication middleware before later routes are registered, creating registration-order-dependent security behavior.

References:

- `packages/express-json-router/src/index.ts:89-95`
- `packages/express-json-router/src/index.ts:121-122`
- `packages/express-json-router/src/index.ts:218-225`
- `packages/express-json-router/src/index.ts:238-242`
- `packages/message-service/src/route-factory.ts:114-124`

Implementation requirements:

1. Copy constructor middleware input at the boundary; never retain a caller-owned array.
2. Prevent mutation through the public instance from changing middleware used by future route registrations. Prefer a private immutable snapshot and expose a readonly copy only if public inspection is intentionally retained.
3. Preserve middleware order, single-function input, empty/omitted input, and the current behavior that router-level middleware is included in every JSON-aware route.
4. Cover replacement, push, splice, and source-array mutation after construction.

Acceptance criteria:

- Mutating the original middleware array after construction cannot replace, remove, or append middleware for a subsequently registered route.
- Mutating any publicly returned middleware collection cannot affect route behavior.
- Required middleware runs in its original order on routes registered before and after attempted mutation.
- `pnpm --filter @web-ts-toolkit/express-json-router test` passes.

Completion evidence (2026-08-12):

- `packages/express-json-router/src/index.ts`: renamed the public `readonly middlewares` field to private `_middlewares`; `toMiddlewareList` now returns `middlewares.slice()` instead of the caller's array reference; the per-route handler reads `this._middlewares` (no longer the public field); added a public `get middlewares()` accessor that returns `this._middlewares.slice()` so each public read returns a fresh detached copy.
- Regression tests added in `packages/express-json-router/test/express-json-router.test.ts` covering: (a) source-array replacement via `length = 0` + `push(replacement)` after construction plus mutation of `router.middlewares`, with both pre- and post-mutation routes still receiving the original middleware; (b) `pop()` + `splice()` on the exposed `router.middlewares` collection not affecting the next registered route; (c) middleware order preserved for routes registered before and after source-array mutation (verified by recording per-request call order).
- Verified TDD red phase: the two attached mutation tests fail against the pre-fix implementation (`expected { middleware: 'replacement' } to deeply equal { middleware: 'original' }` and `{ middleware: 'replaced' }` vs `{ middleware: 'first-second' }`).
- `pnpm --filter @web-ts-toolkit/express-json-router test` passes: 16/16 (13 pre-existing + 3 new).
- `pnpm exec eslint "packages/express-json-router/**/*.{ts,js}"`: no findings.
- `pnpm --filter @web-ts-toolkit/express-json-router exec tsc --noEmit -p tsconfig.json`: no errors in `express-json-router/src` (pre-existing path-mapped sibling `http-errors`/`utils` errors remain, as noted in the review baseline).
- Downstream regression check: `pnpm --filter @web-ts-toolkit/access-router test` 317/317 passed; `pnpm --filter @web-ts-toolkit/message-service test` 77/77 passed.
- `git diff --check`: clean; changes limited to `src/index.ts` and the test file.

### Task EJR-02: Encapsulate Method And Endpoint Registries

Status: complete

Priority: P1

Suggested agent: API encapsulation and downstream migration specialist

Dependencies: EJR-01

Primary ownership:

- `packages/express-json-router/src/index.ts`
- `packages/express-json-router/test/express-json-router.test.ts`
- `packages/access-router/src/routers/model-router.ts`
- focused access-router endpoint logging tests

Finding:

`readonly methods` and `readonly endpoints` are mutable arrays at runtime. Clearing `methods` removes methods from later `route()` builders; mutating `endpoints` makes `getEndpoints()` report routes that were never registered or omit live routes. Public `addEndpoint` and `normalizePath` also expose registration internals. `access-router` currently reads `router.endpoints` directly, so encapsulation requires a sequenced migration to `getEndpoints()`.

References:

- `packages/express-json-router/src/index.ts:119-121`
- `packages/express-json-router/src/index.ts:235-243`
- `packages/express-json-router/src/index.ts:266-297`
- `packages/access-router/src/routers/model-router.ts:140-144`
- `packages/access-router/test/model-router.test.ts:311-336`

Implementation requirements:

1. Make method capability and endpoint storage private implementation state.
2. Make `addEndpoint` and `normalizePath` private or replace them with private helpers unless a released external use is documented during implementation.
3. Keep `getEndpoints()` as the public snapshot boundary and ensure callers cannot mutate nested records or internal order.
4. Migrate access-router logging to `getEndpoints()` without changing its output.
5. Preserve registration order and the existing uppercase method/string path shape.

Acceptance criteria:

- External mutation cannot remove route-builder methods or falsify endpoint introspection.
- Type-level negative tests show internal registries/mutators are not public.
- `getEndpoints()` returns a detached snapshot in registration order.
- Access-router endpoint logging behavior remains unchanged.
- `pnpm --filter @web-ts-toolkit/express-json-router test` and `pnpm --filter @web-ts-toolkit/access-router test` pass serially.

Completion evidence (2026-08-13):

- `packages/express-json-router/src/index.ts`: replaced public `readonly methods` and `readonly endpoints` arrays with private `_methods` and `_endpoints` registries; `route()` now iterates the private method registry; `getEndpoints()` remains the public detached snapshot boundary and preserves registration order; `addEndpoint` and `normalizePath` are now private implementation details.
- `packages/access-router/src/routers/model-router.ts`: endpoint logging now reads `this.router.getEndpoints()` instead of the removed public `endpoints` array, preserving the logged uppercase method/path shape.
- `packages/express-json-router/test/express-json-router.test.ts`: added regression coverage that mutating the `getEndpoints()` snapshot cannot falsify endpoint introspection and that `route()` builders remain available and ordered after attempted snapshot mutation.
- `packages/express-json-router/test-decl-consumer/`: added isolated NodeNext and Bundler declaration-consumer typechecks with `@ts-expect-error` negative assertions proving `endpoints`, `methods`, `addEndpoint`, and `normalizePath` are not public on emitted declarations.
- `packages/express-json-router/package.json`: wired `pnpm typecheck` into `pnpm test` before Vitest, running both declaration-consumer configs against built declarations.
- Verified: `pnpm --filter @web-ts-toolkit/express-json-router test` passes: declaration typecheck clean, 18/18 runtime tests passed.
- Verified: `pnpm --filter @web-ts-toolkit/access-router test` passes: 317/317 tests passed.
- Verified: `pnpm exec eslint "packages/express-json-router/**/*.{ts,mts,js}" "packages/access-router/src/routers/model-router.ts"` passed with no findings.

## Wave 2: Express Compatibility And Registration Architecture

### Task EJR-03: Centralize The Supported HTTP Method Contract

Status: completed

Priority: P1

Suggested agent: Express routing compatibility specialist

Dependencies: EJR-02

Primary ownership:

- `packages/express-json-router/src/index.ts`
- route-method runtime and declaration tests
- routing API documentation

Finding:

The package manually repeats a 24-method list in both a constant and class fields, while Express 5 installs a broader method set. Valid Express methods such as `acl`, `connect`, `propfind`, and `proppatch` are unavailable through the JSON-aware wrapper. The repeated declarations also allow runtime capability and emitted types to drift.

References:

- `packages/express-json-router/src/index.ts:25-55`
- `packages/express-json-router/src/index.ts:124-147`
- `packages/express-json-router/src/index.ts:228-251`
- `packages/express-json-router/dist/index.d.ts:8-18`

Implementation requirements:

1. Define one explicit supported-method source used by runtime registration, route builders, endpoint types, and public declarations.
2. Cover every stable method exposed by the supported Express 5 range, or document and test a deliberately narrower list with a concrete rationale.
3. Do not derive the public type contract from ambient runtime enumeration alone; upgrades must create reviewable method changes.
4. Preserve non-enumerable, non-writable route registrar properties and chaining behavior.
5. Add parity tests comparing the approved method contract with Express 5 at runtime.

Acceptance criteria:

- Every approved Express method is available on both `router.<method>(path, ...)` and `router.route(path).<method>(...)`.
- Each newly supported method registers a JSON-aware handler and records uppercase endpoint metadata.
- Runtime methods and TypeScript declarations come from one reviewed contract and cannot silently diverge.
- Existing common method behavior remains unchanged.
- Package tests pass.

Completion evidence (2026-08-13):

- `packages/express-json-router/src/index.ts`: replaced the old partial method tuple plus repeated class field declarations with one reviewed `SUPPORTED_ROUTE_METHODS` tuple covering the Express 5 / Node HTTP method surface, including `acl`, `bind`, `connect`, `link`, `mkcalendar`, `propfind`, `proppatch`, `query`, `rebind`, `source`, `unbind`, and `unlink`; runtime registration, route builder types, endpoint metadata, emitted declarations, and `JsonRouter.supportedMethods` now come from that tuple.
- `packages/express-json-router/src/index.ts`: registration now fails fast if the supported Express runtime does not expose an approved method, preserving reviewable public method changes instead of silently narrowing capability.
- `packages/express-json-router/test/express-json-router.test.ts`: added parity coverage comparing `JsonRouter.supportedMethods` to Express 5 runtime router methods, descriptor/chaining coverage for every router and `route()` registrar, and JSON-aware registration/uppercase endpoint coverage for newly supported methods.
- `packages/express-json-router/test-decl-consumer/decl-consumer.strict.mts`: added emitted declaration checks for new router and route-builder methods plus negative assertions for unknown methods.
- `packages/express-json-router/README.md`: documented `JsonRouter.supportedMethods` as the reviewed method contract and showed direct/router-builder examples.
- Verified: `pnpm --filter @web-ts-toolkit/express-json-router test` passes: declaration typecheck clean, 22/22 runtime tests passed.
- Verified: `pnpm exec eslint "packages/express-json-router/src/index.ts" "packages/express-json-router/test/express-json-router.test.ts" "packages/express-json-router/test-decl-consumer/decl-consumer.strict.mts"` passed with no findings.

### Task EJR-04: Support Express Handler Array Composition

Status: completed

Priority: P1

Suggested agent: Express middleware type and runtime specialist

Dependencies: EJR-03

Primary ownership:

- `packages/express-json-router/src/index.ts`
- middleware composition tests
- public callback/registrar types

Finding:

Express route methods accept handler arrays and flatten nested arrays, but `RouteRegistrar` accepts only individual callbacks. At runtime, a callback array mixed with another callback reaches `handleResponse` as a non-function and throws `middleware handler must be a function`. This prevents reuse of standard Express middleware stacks.

References:

- `packages/express-json-router/src/index.ts:53-55`
- `packages/express-json-router/src/index.ts:238-242`
- `packages/express-response-handler/src/create-handler.ts:101-119`
- `packages/express-json-router/test/express-json-router.test.ts:108-128`

Implementation requirements:

1. Accept Express-compatible arrays, including nested arrays if the supported Express type permits them.
2. Flatten and validate once at registration before passing a flat sequence to the response handler.
3. Preserve callback order, `next()` semantics, empty-handler rejection, and one endpoint record per route-method registration.
4. Keep error-handling middleware ownership explicit: investigate four-argument route error handlers and either support them without wrapping away Express semantics or document that they must be mounted with `use()`.
5. Do not broaden to arbitrary non-function values.

Acceptance criteria:

- Single callbacks, flat arrays, mixed callback/array arguments, and supported nested arrays execute in Express order.
- Empty or invalid handler collections fail synchronously with actionable errors before a partial registration is recorded.
- A test pins the selected route-local error-middleware contract.
- Runtime and strict TypeScript tests agree on accepted handler shapes.
- Package tests pass.

Completion evidence (2026-08-13):

- `packages/express-json-router/src/index.ts`: introduced recursive `JsonRouterHandlerInput` support for route registrars, `route()` builders, and constructor middleware; registration now recursively flattens arrays and validates handler functions before wrapping with `responseHandler.handleResponse`.
- `packages/express-json-router/src/index.ts`: route registrations now reject an empty flattened handler list synchronously before Express registration or endpoint metadata changes, and reject route-local four-argument error middleware with `route-local error middleware must be mounted with use()` while leaving `use()` delegated to Express.
- `packages/express-json-router/test/express-json-router.test.ts`: added runtime coverage for router-level nested middleware arrays, flat/mixed/nested route handler arrays, `route()` builder arrays, empty/invalid collection rejection before endpoint recording, and the explicit route-local error middleware contract.
- `packages/express-json-router/test-decl-consumer/decl-consumer.strict.mts`: added emitted declaration checks for flat, mixed, mutable nested, readonly nested, and constructor handler arrays, plus negative checks for non-functions and route-local error middleware.
- Verified: `pnpm --filter @web-ts-toolkit/express-json-router test` passed: declaration typecheck clean, 26/26 runtime tests passed.
- Verified: `pnpm exec eslint "packages/express-json-router/src/index.ts" "packages/express-json-router/test/express-json-router.test.ts" "packages/express-json-router/test-decl-consumer/decl-consumer.strict.mts"` passed with no findings.

### Task EJR-05: Decide And Enforce Non-String Route Path Support

Status: completed

Priority: P2

Suggested agent: Express API contract investigator

Dependencies: EJR-03

Primary ownership:

- `packages/express-json-router/src/index.ts`
- path normalization and endpoint metadata tests
- `packages/express-json-router/README.md`
- `website/docs/packages/express-json-router.md`

Finding:

Express route methods accept `string`, `RegExp`, and arrays of path patterns, while `JsonRouter` accepts only `string` and calls `addLeadingSlash`. JavaScript callers passing a valid Express `RegExp` or array currently fail with `value.startsWith is not a function`. Supporting these paths requires an explicit endpoint-introspection representation; silently stringifying patterns would make metadata ambiguous.

References:

- `packages/express-json-router/src/index.ts:54-59`
- `packages/express-json-router/src/index.ts:79-87`
- `packages/express-json-router/src/index.ts:238-244`
- `packages/express-json-router/src/index.ts:284-297`
- `website/docs/packages/express-json-router.md:207-225`

Implementation requirements:

1. First record a compatibility decision: support Express `PathParams`, or intentionally retain string-only paths.
2. If supported, define a lossless, immutable endpoint metadata representation for regexp and array paths and state the external contract change.
3. If string-only is retained, validate synchronously with a stable actionable error and document the narrower contract instead of leaking a utility `TypeError`.
4. Preserve base-path normalization for strings and do not invent regex concatenation semantics without tests and documentation.
5. Update README, website docs, public types, and release notes if endpoint metadata changes.

Acceptance criteria:

- RegExp and array paths either work end-to-end with truthful metadata or fail immediately with the documented package-level error.
- No accepted path form produces misleading endpoint metadata.
- String base paths and route paths retain current normalized output.
- JavaScript runtime and TypeScript acceptance match.
- Package tests pass.

Compatibility decision (2026-08-13):

- Retain the existing string-only route path contract instead of expanding to Express `PathParams`.
- Rationale: endpoint introspection currently exposes `{ method, path: string }`; accepting `RegExp` or arrays would require a public metadata shape change to avoid ambiguous stringification.

Completion evidence (2026-08-13):

- `packages/express-json-router/src/index.ts`: added synchronous package-level validation for constructor `basePath`, direct route method paths, and `router.route(path)` so non-string paths fail before Express registration or endpoint recording.
- `packages/express-json-router/test/express-json-router.test.ts`: added runtime coverage for rejecting `RegExp` and array route paths and preserving empty endpoint metadata after invalid registrations.
- `packages/express-json-router/test-decl-consumer/decl-consumer.strict.mts`: added emitted declaration checks that TypeScript accepts string paths and rejects `RegExp` and array paths.
- `packages/express-json-router/README.md` and `website/docs/packages/express-json-router.md`: documented the string-only path contract, rationale, and stable error messages.

## Wave 3: Public Types, Packaging, And Installed Documentation

### Task EJR-06: Curate Public Router Types And Declaration JSDoc

Status: completed

Priority: P2

Suggested agent: TypeScript library API specialist

Dependencies: EJR-02, EJR-04, EJR-05

Primary ownership:

- `packages/express-json-router/src/index.ts`
- declaration consumer fixtures/tests
- generated declaration review through normal builds

Finding:

Public methods expose package-private names such as `Endpoint`, `JsonRouterCallback`, `JsonRouteBuilder`, and `JsonRouterMiddlewares`, but consumers cannot import those types. Callback types also erase Express request/body/query/locals generics and accept only native `Promise` rather than the response handler's `PromiseLike` contract. Generated declarations retain only class-level JSDoc, leaving key default-snapshot and endpoint semantics undiscoverable in editor hovers.

References:

- `packages/express-json-router/src/index.ts:52-64`
- `packages/express-json-router/src/index.ts:109-118`
- `packages/express-json-router/dist/index.d.ts:9-20`
- `packages/express-json-router/dist/index.d.ts:30-145`
- `packages/express-response-handler/src/types.ts:15-20`
- `packages/express-response-handler/src/types.ts:42-61`

Implementation requirements:

1. Export intentionally public endpoint, handler, middleware, route-builder, and method types from the package root; keep implementation-only helper types private.
2. Preserve useful Express generics where feasible without making ordinary inference cumbersome.
3. Align asynchronous returns with the supported response-handler contract.
4. Add concise JSDoc that survives into declarations for construction/default snapshots, `original`, `route`, and `getEndpoints()`.
5. Add positive and `@ts-expect-error` declaration-consumer tests for public versus internal names.

Acceptance criteria:

- A consumer can name the endpoint and callback contracts via package-root type imports.
- Typed request params/body/query/locals flow through at least one registrar consumer test.
- Internal registry and mutation helpers are not importable or publicly visible.
- Built `.d.ts` and `.d.mts` contain the intended JSDoc and equivalent API shapes.
- Package build and strict declaration-consumer tests pass.

### Task EJR-07: Fix Conditional Types And Express Dependency Ownership

Status: completed

Priority: P1

Suggested agent: Node package-resolution specialist

Dependencies: EJR-06

Primary ownership:

- `packages/express-json-router/package.json`
- package-local NodeNext/Bundler consumer fixtures
- package metadata assertions

Finding:

Tsup emits both `index.d.mts` and `index.d.ts`, but the export map sends all consumers to `index.d.ts`; ESM consumers never select the ESM declaration. Public declarations import `express`, while `@types/express` is only a dev dependency, so a clean TypeScript consumer following the README is not guaranteed to receive declarations for that module. Express-oriented sibling packages generally treat Express as an application-owned peer, but this package directly calls `express.Router()` and currently installs Express as a runtime dependency; that ownership choice needs an explicit compatibility decision.

References:

- `packages/express-json-router/package.json:16-25`
- `packages/express-json-router/package.json:38-47`
- `packages/express-json-router/tsup.config.ts:3-9`
- `packages/express-json-router/dist/index.d.ts:5`
- `packages/express-response-handler/package.json:63-78`
- `packages/access-router/package.json:59-76`

Implementation requirements:

1. Use conditional `types.import`/`types.require` entries so ESM selects `.d.mts` and CJS selects `.d.ts`, following verified workspace conventions.
2. Ensure a clean strict TypeScript install has all declarations required by the public surface. Do not rely on undeclared transitive dev dependencies.
3. Decide whether Express remains a direct dependency or becomes a `>=5.0.0` peer plus dev dependency. Record the reason, singleton/version implications, and migration impact.
4. Test the minimum supported Express 5 version and the current workspace version if a broad peer range is declared.
5. Keep `main`, `module`, `types`, `exports`, build outputs, and packed files aligned.

Acceptance criteria:

- Strict NodeNext ESM and CJS consumers resolve the correct declaration flavor through the package name.
- A Bundler-resolution consumer also compiles with `skipLibCheck: false`.
- The documented installation produces no missing `express` declaration diagnostic.
- ESM and CJS runtime consumers load the intended entrypoints.
- Package metadata tests pin the chosen Express ownership and supported range.

Completion notes:

- Implemented conditional `types.import`/`types.require` export-map entries for `@web-ts-toolkit/express-json-router`.
- Kept Express as a direct runtime dependency because `JsonRouter` constructs its own `express.Router()` instances; moved `@types/express` into direct dependencies so clean strict consumers receive public declaration dependencies.
- Added package-name NodeNext ESM/CJS and Bundler declaration-consumer coverage, plus runtime package-name ESM/CJS entrypoint and metadata ownership tests.
- Verified with `pnpm --filter @web-ts-toolkit/express-json-router test`: passed, 30/30 tests.

### Task EJR-08: Add Direct Packed-Consumer And Documentation Contracts

Status: completed

Priority: P1

Suggested agent: package artifact and documentation test specialist

Dependencies: EJR-07

Primary ownership:

- package-local packed-consumer harness and fixtures
- `packages/express-json-router/README.md`
- `website/docs/packages/express-json-router.md`
- `packages/express-json-router/package.json` test scripts only as needed

Finding:

Package tests import a relative built ESM file and do not verify CJS, package-name resolution, published metadata transformation, or installed declarations. Access-router packs this package only as a transitive closure member. Documentation also drifts: the website sets `JsonRouter.errorMessageProvider` after constructing the example router even though defaults are snapshotted at construction, and calls `defaultHandler` a shared instance even though its getter creates a new handler. The README's “Main Exports” wording does not clearly say `JsonRouter` is default-only.

References:

- `packages/express-json-router/test/express-json-router.test.ts:1-7`
- `packages/express-json-router/README.md:18-59`
- `website/docs/packages/express-json-router.md:18-40`
- `website/docs/packages/express-json-router.md:145-172`
- `website/docs/packages/express-json-router.md:201-209`
- `website/docs/packages/express-json-router.md:239-249`
- `packages/access-router/test/packed-consumer-compatibility.test.ts:105-113`

Implementation requirements:

1. Stage this package and its internal workspace dependency closure through the repository's production publish transformation, not a hand-written manifest approximation.
2. Install the tarballs into a fresh consumer and run ESM, CJS, strict NodeNext ESM/CJS, and Bundler smoke checks using package-name imports.
3. Assert the transformed manifest, conditional exports, resolved internal dependency versions, intended file allowlist, and absence of `PLACEHOLDER`/`workspace:` values.
4. Correct defaults examples so static defaults are assigned before construction, or use an explicit handler instance.
5. State that `defaultHandler` returns a newly configured handler, existing routers retain their constructed handler, and `JsonRouter` is the default class export unless EJR-06 deliberately adds a named export.
6. Compile complete README examples against the installed artifact.

Acceptance criteria:

- Installed ESM/CJS runtime and NodeNext/Bundler type consumers pass against the release-like tarball.
- `npm pack --dry-run --json` or the production equivalent contains only intended files.
- A regression in export conditions, dependency rewriting, required Express types, or documented import form fails package tests.
- README examples compile without repo `paths` aliases and accurately demonstrate default snapshot timing.
- README and website docs agree with runtime behavior.

Completion notes:

- Added package-local packed-consumer compatibility coverage that stages `express-json-router` and its internal workspace dependency closure through the real `@repo-toolkit/publish-package` production manifest transformer, packs tarballs, installs them into a fresh consumer, and runs ESM, CJS, strict NodeNext ESM/CJS, Bundler, and README-example compile checks through package-name imports.
- Asserted the transformed manifest, conditional `types.import`/`types.require` exports, dependency rewriting to the sentinel package version, intended packed file allowlist, and absence of `PLACEHOLDER`/`workspace:` values across the packed closure.
- Updated package README and website docs to document the default-only `JsonRouter` class export, install shape, static-default snapshot timing, custom handler isolation, and `JsonRouter.defaultHandler` returning a newly configured handler rather than a shared instance.
- Verified with `pnpm --filter @web-ts-toolkit/express-json-router test`: passed, 33/33 tests.

## Wave 4: Independent Integration Review

### Task EJR-09: Perform Independent Final Integration Review

Status: completed

Priority: P1

Suggested agent: independent Express and package-contract reviewer

Dependencies: EJR-01 through EJR-08

Primary ownership:

- review and verification only across all changed files
- this task document's completion evidence and deferred decisions

Finding:

The package is a runtime and type dependency of access-router and message-service. A local green router suite cannot prove endpoint logging, route mounting, response-handler integration, package artifacts, or downstream compilation remain correct. Final review must be performed by an agent who was not the primary implementer.

References:

- `packages/access-router/package.json:59-70`
- `packages/access-router/src/routers/model-router.ts:140-144`
- `packages/message-service/package.json:38-45`
- `packages/message-service/src/route-factory.ts:105-124`
- `apps/nodejs/src/messages.ts:431-462`

Implementation requirements:

1. Re-check every task acceptance criterion against runtime behavior and emitted declarations, not completion notes alone.
2. Verify constructor middleware cannot be altered across source/public mutation paths and metadata cannot diverge from live registrations.
3. Verify direct registration and `route()` have the same method, path, callback-array, error-control, and endpoint-recording semantics.
4. Verify README, website docs, runtime exports, CJS/ESM declarations, and packed metadata agree.
5. Run targeted/package checks first, then full repository checks serially. Record exact pass counts or blockers.
6. Confirm deferred decisions include rationale and residual risk; do not silently guess unresolved public contracts.

Acceptance criteria:

- All prior task acceptance criteria have independently recorded evidence.
- `pnpm --filter @web-ts-toolkit/express-json-router test` passes.
- `pnpm --filter @web-ts-toolkit/express-response-handler test` passes if handler integration changed.
- `pnpm --filter @web-ts-toolkit/access-router test` passes.
- `pnpm --filter @web-ts-toolkit/message-service test` passes.
- `pnpm --filter org-access-nodejs-example build` passes.
- `pnpm lint`, `pnpm build`, `pnpm test`, and `git diff --check` pass serially, or exact pre-existing blockers are documented with reproduction evidence.
- Packed-consumer checks pass against the production-transformed artifact.

Completion evidence (2026-08-13):

- Independent review performed by a separate review agent against EJR-01 through EJR-08 acceptance criteria. It found three integration gaps: mutable `JsonRouter.supportedMethods`, delayed `router.route(path)` non-string validation, and website docs omitting public type exports.
- Fixed `packages/express-json-router/src/index.ts`: `SUPPORTED_ROUTE_METHODS` is now frozen before exposure through `JsonRouter.supportedMethods`; `router.route(path)` validates the path immediately; constructor middleware input was widened to accept Express `RequestHandler`-compatible middleware while preserving recursive array flattening and runtime validation. The middleware type correction was required after downstream access-router declaration build exposed that specialized Express middleware could no longer be passed to the constructor.
- Fixed `packages/express-json-router/test/express-json-router.test.ts`: added runtime assertions that `JsonRouter.supportedMethods` is frozen and cannot be pushed to, and that `router.route(nonStringPath)` throws the package-level string-path error before any endpoint is recorded.
- Fixed declaration/lint fixtures in `packages/express-json-router/test-decl-consumer/decl-consumer.strict.cts`, `packages/express-json-router/test-decl-consumer/decl-consumer.strict.mts`, and `packages/express-json-router/test/packed-consumer-compatibility.test.ts` so full-repo lint covers the package-local CJS/type-negative fixtures without weakening their checks.
- Fixed `website/docs/packages/express-json-router.md`: website main export list now includes the same public type imports documented by the README and emitted declarations.
- Verified by inspection: constructor middleware is snapshotted into private state and exposed only through detached `middlewares` copies; endpoint metadata is private and returned through detached `getEndpoints()` snapshots; access-router endpoint logging uses `getEndpoints()`; direct registration and `route()` now share method, callback-array, error-control, endpoint-recording, and immediate path-validation semantics; README, website docs, package metadata, runtime exports, and emitted CJS/ESM declarations agree on default-only class export, conditional declarations, supported method contract, string-only paths, direct Express dependency ownership, and public type exports.
- Deferred decisions resolved and residual risks recorded: EJR-05 retained string-only paths to preserve unambiguous `{ method, path: string }` endpoint metadata; EJR-06 retained default-only `JsonRouter` class export while adding named type exports; EJR-07 kept Express as a direct runtime dependency because this package constructs `express.Router()` instances and moved `@types/express` into direct dependencies; EJR-04 rejects route-local four-argument error middleware and requires mounting it through `use()`.
- Verified: `pnpm --filter @web-ts-toolkit/express-json-router test` passed, including declaration consumer checks and packed-consumer compatibility checks: 2 test files, 33 tests passed.
- Verified: `pnpm --filter @web-ts-toolkit/express-response-handler test` passed: 5 test files, 121 tests passed.
- Verified: `pnpm --filter @web-ts-toolkit/access-router test` passed after the middleware type correction: 37 test files, 317 tests passed.
- Verified: `pnpm --filter @web-ts-toolkit/message-service test` passed: 4 test files, 77 tests passed.
- Verified: `pnpm --filter org-access-nodejs-example build` passed.
- Verified: `pnpm lint` passed.
- Verified: `pnpm build` passed.
- Verified: `git diff --check` passed.
- Full-suite blocker: `pnpm test` ran serially and failed in unrelated `@web-ts-toolkit/access-router-react` documentation hash coverage, not in express-json-router or its downstream runtime packages. Reproduction: `pnpm test` reaches `packages/access-router-react/test/access-router-react.docs.compile.test.ts` and fails `maps every actual TypeScript documentation block in the README and website docs to a fixture or an explicit partial/negative classification` because expected hashes for `packages/access-router-react/README.md#1`, `#3`, `#5`, `#14`, `#15` and matching website blocks differ from actual hashes; package result at failure point was 10 passed files, 1 failed file, 197 passed tests, 1 failed test.

### Task EJR-10: Add Installed AI Package Guidance

Status: completed

Priority: P2

Suggested agent: TypeScript package discoverability specialist

Dependencies: EJR-08, EJR-09

Primary ownership:

- `packages/express-json-router/llms.txt`
- `packages/express-json-router/package.json`
- packed-consumer documentation compile checks

Finding:

`llms.txt` was intentionally deferred until package metadata, declarations, README, and packed-consumer verification were correct. After EJR-09, the installed package surface was stable, but installed consumers still only received the README and declarations; AI coding assistants did not have the short package-boundary summary used by sibling packages.

Implementation requirements:

1. Keep `llms.txt` concise and subordinate to package metadata, declarations, and README content.
2. Document canonical default import, root type imports, string-only path policy, middleware/error-middleware contracts, static-default snapshot behavior, and Express dependency ownership.
3. Include only copy-pasteable TypeScript examples that compile against the installed package name.
4. Ship `llms.txt` in the published package and assert the release-transformed tarball contains it.
5. Extend the existing packed-consumer documentation compile gate so future `llms.txt` example drift fails package tests.

Acceptance criteria:

- Installed package tarballs include `llms.txt` beside README and built entrypoints.
- Every TypeScript block in `llms.txt` compiles in the fresh packed consumer without repo `paths` aliases.
- The packed artifact allowlist and documentation smoke checks fail if `llms.txt` is omitted or its import examples drift.
- `pnpm --filter @web-ts-toolkit/express-json-router test` passes.

Completion evidence (2026-08-13):

- Added `packages/express-json-router/llms.txt`: short installed-package guidance covering default `JsonRouter` import, public type imports, return-value/error patterns, `supportedMethods`, string-only paths, immutable middleware/endpoint snapshots, route-local error middleware policy, static-default snapshot semantics, `defaultHandler` freshness, and direct Express dependency ownership.
- Updated `packages/express-json-router/package.json`: added `llms.txt` to the raw package `files` list so the standard publish-file copier includes it before the release transform flattens `dist/`.
- Updated `packages/express-json-router/test/packed-consumer-compatibility.test.ts`: renamed the README-only extractor to a documentation extractor, compiles every ```ts block from both installed `README.md`and installed`llms.txt`under strict Bundler resolution in the fresh packed consumer, asserts the packed`llms.txt`contains the canonical package import, and extends the transformed tarball allowlist to include`llms.txt`.
- Verified: `pnpm --filter @web-ts-toolkit/express-json-router test` passed: 2 test files, 33 tests passed, including declaration consumer checks and packed-consumer ESM/CJS/NodeNext/Bundler/docs checks.

## Dependencies And Parallelization

| Task   | Recommended owner            | May run in parallel with | Shared hotspots                       |
| ------ | ---------------------------- | ------------------------ | ------------------------------------- |
| EJR-01 | security regression agent    | none initially           | `src/index.ts`, main test file        |
| EJR-02 | encapsulation agent          | none after EJR-01        | `src/index.ts`, access-router logging |
| EJR-03 | Express method agent         | none after EJR-02        | route fields/types in `src/index.ts`  |
| EJR-04 | middleware composition agent | EJR-05 research only     | registrars and callback types         |
| EJR-05 | path contract agent          | EJR-04 after EJR-03      | endpoint/path types and docs          |
| EJR-06 | public type agent            | none after EJR-04/EJR-05 | declarations and `src/index.ts`       |
| EJR-07 | package resolution agent     | none after EJR-06        | `package.json`, type fixtures         |
| EJR-08 | artifact/docs agent          | none after EJR-07        | package scripts, README, fixtures     |
| EJR-09 | independent reviewer         | none                     | all outputs                           |

- `src/index.ts` is the principal merge-conflict hotspot; behavioral agents should be sequenced EJR-01 through EJR-06.
- EJR-04 and EJR-05 may investigate in parallel after EJR-03, but their final type edits must be serialized.
- Do not run package test/build commands concurrently because transitive `tsup` builds share generated `dist/` directories.
- Preserve `original`, static helpers, and response-handler construction while unrelated tasks change encapsulation.

## Deferred Decisions Requiring Maintainer Input

These decisions do not block EJR-01 through EJR-04. Record the selected policy before completing the owning task:

1. EJR-05: support full Express `PathParams` with a richer endpoint representation, or intentionally enforce/document string-only paths.
2. EJR-06: retain a default-only class export, or add a named `JsonRouter` export as an additive discoverability improvement.
3. EJR-07: keep Express as a direct runtime dependency because the package constructs routers, or align with sibling packages by making Express an application-owned peer.
4. EJR-04: support route-local four-argument error middleware, or explicitly require error middleware through `use()`.

If maintainer input is unavailable, the assigned agent must mark the affected task `blocked`; it must not infer a breaking public contract.

## Definition Of Done

- Every confirmed finding is fixed with a regression test or explicitly deferred with maintainer-approved rationale and residual risk.
- Constructor middleware and endpoint/method registries cannot be mutated across public boundaries.
- Supported Express methods, callback arrays, error middleware, and route path forms have one explicit runtime/type/documentation contract.
- Downstream access-router endpoint logging uses the supported snapshot API.
- Public types are importable, useful in strict consumers, and documented in emitted declarations.
- ESM/CJS runtime entries and declaration conditions work from an installed production-like tarball.
- Express runtime/type dependency ownership is explicit and verified.
- README and website examples match default snapshot timing and canonical import style.
- Targeted, downstream, full repository, lint, build, and packed-artifact checks pass serially or have reproducible documented blockers.
- EJR-09 is completed by an independent reviewer with evidence appended to this file.
