# Access Router Runtime Review Remediation

Created: 2026-08-23 12:39:59 PDT

Package: `packages/access-router-runtime`

## Objective

Remediate confirmed portability, startup ordering, database ownership, lifecycle, route composition, validation, packaging, and maintainability gaps in `@web-ts-toolkit/access-router-runtime`. The end state must produce self-contained build artifacts, evaluate trusted config only after CLI validation and environment preparation, isolate resources owned by each runtime, complete mandatory cleanup under failure and concurrency, preserve `express-runtime` middleware semantics, and keep runtime behavior, public types, documentation, and packed output aligned.

## Scope And Working Rules

- Add a focused regression that fails on the current implementation before each behavioral fix.
- Treat runtime config and preload modules as intentionally trusted executable code. The concern is execution timing, validation, portability, and resource ownership, not sandboxing trusted application code.
- Prefer the smallest shared enforcement point: one config-export normalizer, one config validator, one database/model ownership boundary, and one runtime lifecycle coordinator.
- Preserve Express 5, Mongoose 8 and 9 peer compatibility, Node 22 support, and the documented root API unless a task explicitly changes the contract.
- Coordinate changes to `@web-ts-toolkit/express-runtime/cli` with `docs/tasks/20260822-201308-express-runtime-review-remediation.md`; do not duplicate its parser, server, or build machinery in this package.
- Do not manually edit `packages/access-router-runtime/dist/`; regenerate it through the package build.
- Update `packages/access-router-runtime/README.md` and `website/docs/packages/access-router-runtime.md` together for public behavior.
- Preserve unrelated worktree changes. Never revert files outside the assigned task.
- Run package tests serially. The package test rebuilds transitive dependencies and shared `dist/` directories, so agents must not run build or test commands concurrently.
- Temporary fixtures must restore the current directory, environment, process listeners, child processes, servers, database connections, and files they create.

## Non-Goals

- Do not sandbox config files or preload modules.
- Do not rewrite `access-router` authorization, query, or response behavior; that package owns those contracts.
- Do not replace `express-runtime` argument parsing, server lifecycle, watcher, or bundler wholesale.
- Do not add compatibility aliases for invalid config shapes unless a shipped, documented consumer requires them.
- Do not split every concern into a new file merely for file size. Extract only boundaries that make validation, ownership, or lifecycle independently testable.
- Do not add speculative request-path caches or micro-optimizations without a benchmark demonstrating value.

## Review Baseline

Confirmed on 2026-08-23 before this task file was created:

- `pnpm --filter @web-ts-toolkit/access-router-runtime test`: passed, 3 files and 20 tests.
- `pnpm exec eslint "packages/access-router-runtime/**/*.{ts,js}"`: passed with no findings.
- The package test rebuilt this package and transitive dependencies successfully.
- Vitest warned that `vitest.config.ts` uses ESM syntax while loaded as CommonJS; this is a test-configuration warning, not a test failure.
- The worktree was clean before and after baseline verification.
- Existing tests import source files directly. They do not execute `dist/cli.js`, relocate a built artifact, exercise signals, validate packed ESM/CJS declarations, or test lifecycle failure/concurrency.
- Existing generated-entry tests assert source text that encodes the current defects, including runtime Jiti config loading and import-time signal registration.
- No obvious request-controlled unbounded loop or collection was found in this package. The material performance risks are repeated runtime config transpilation on cold start and leaked/global database resources.

## Priority Definitions

- P0: advertised build output is undeployable or mutable after build, or runtime isolation can select the wrong database across applications/tenants.
- P1: startup ordering, cleanup, signal handling, route ordering, or lifecycle races can produce incorrect or insecure runtime behavior.
- P2: invalid public states, weak encapsulation, packaging/type mismatches, or major testability and documentation gaps.
- P3: bounded maintainability, test hygiene, or measured performance improvements without an independent correctness impact.

## Confirmed Findings Summary

- Local and serverless build entries embed absolute config and tsconfig paths and execute Jiti at runtime instead of bundling the config (`src/cli-utils.ts:204-248`).
- `dev` executes the config before `--env` and `--require` are applied and before authoritative CLI validation (`src/cli.ts:19-45`; `express-runtime/src/cli-api.ts:63-75`).
- Watch supervision evaluates executable config in the parent and again in child processes (`src/cli.ts:19-45`).
- Runtime instances inspect, connect, register models on, and disconnect Mongoose global state (`src/index.ts:121-136`, `src/index.ts:222-249`).
- Init and shutdown can race; failing hooks skip mandatory cleanup; failed startup is not rolled back (`src/index.ts:219-279`).
- Generated local modules install unawaited signal handlers at import time, competing with `express-runtime` server lifecycle (`src/cli-utils.ts:211-230`).
- Generated routes are added in `finalize`, after `postMiddleware`, contrary to inherited `ExpressAppOptions` ordering (`src/index.ts:193-206`; `express-runtime/src/index.ts:131-157`).
- Config export and model definitions accept ambiguous or malformed objects, duplicate names, arrays, promises, and unrelated module namespaces (`src/config-loader.ts:10-31`; `src/index.ts:59-66`, `src/index.ts:153-179`).
- Public mutable context collections can diverge from the already-composed app, while `createAccessRouterRuntimeApp()` discards required lifecycle operations (`src/index.ts:73-82`, `src/index.ts:255-286`).
- The package emits `.d.mts` but exports only `.d.ts`, has no packed consumer test, excludes its package-relative README example from published files, and documents an incomplete config shape (`package.json:17-40`; `README.md:20-22`, `README.md:119-182`).

## Wave 1: Regression Harness And Config Boundary

### Task ARRT-01: Add Deterministic CLI, Artifact, And Lifecycle Harnesses

Status: completed

Priority: P2

Suggested agent: Node integration-test specialist

Dependencies: none

Primary ownership:

- `packages/access-router-runtime/test/`
- focused reusable fixtures under `packages/access-router-runtime/test/support/`
- `packages/access-router-runtime/vitest.config.ts` only where deterministic serialization is required

Finding:

The suite has 20 source-oriented tests and no subprocess coverage for the built CLI, no executable/relocated artifact test, and no deterministic deferred-promise coverage for lifecycle races. Loader tests create temporary directories without deleting them. The package therefore passes while its primary CLI build and deployment workflows are broken.

References:

- `packages/access-router-runtime/test/index.test.ts:1-175`
- `packages/access-router-runtime/test/config-loader.test.ts:8-70`
- `packages/access-router-runtime/test/cli-utils.test.ts:15-170`
- `packages/access-router-runtime/vitest.config.ts:1-8`
- `packages/access-router-runtime/src/cli.ts:71-107`

Implementation requirements:

1. Add deterministic helpers for temporary projects, subprocess exit/readiness, deferred promises, environment/current-directory restoration, and process-listener snapshots.
2. Execute the built `dist/cli.js` in subprocess tests; do not import `src/cli.ts`, whose module body calls `main()`.
3. Add an artifact harness that builds in one temporary source tree, moves or copies only deployable output to another location, removes the source config, and imports or starts the artifact there.
4. Add lifecycle fixtures that inject or spy on database operations without fixed sleeps and without requiring every test to start a real MongoDB server.
5. Remove every suite-owned temporary directory and only remove listeners or environment values installed by the test.
6. Preserve serial execution for tests that mutate `process.cwd()`, process environment, Mongoose state, or shared build outputs.

Acceptance criteria:

- A subprocess helper can assert exit code, stdout, stderr, timeout, and cleanup of child processes.
- An artifact helper can prove whether output reads the original source config after relocation.
- Deferred lifecycle tests can control connect, init, shutdown, and disconnect ordering without arbitrary delays.
- Pre-existing signal listeners survive all tests and listener counts return to baseline.
- Loader tests leave no suite-owned temporary directories behind.
- `pnpm --filter @web-ts-toolkit/access-router-runtime test` passes.

Completion evidence:

- Changed files: `packages/access-router-runtime/test/support/*`, `packages/access-router-runtime/test/subprocess-harness.test.ts`, `packages/access-router-runtime/test/artifact-harness.test.ts`, `packages/access-router-runtime/test/lifecycle-harness.test.ts`, `packages/access-router-runtime/test/config-loader.test.ts`, `packages/access-router-runtime/vitest.config.ts`.
- Added subprocess assertions for exit code, stdout, stderr, timeout, and child cleanup; artifact relocation probe for source-config coupling; deferred lifecycle fixtures for connect/init/shutdown/disconnect ordering; listener snapshot restoration; and temp-project cleanup for loader tests.
- Verified: `pnpm --filter @web-ts-toolkit/access-router-runtime test` passed (6 files, 28 tests).

### Task ARRT-02: Normalize And Validate Runtime Config At One Boundary

Status: completed

Resolution note: supported config export forms are default object, synchronous default factory returning a valid object, and named `config` object. Async factories, promises, and thenables are unsupported. Default object remains the documented primary form.

Priority: P2

Suggested agent: TypeScript API and validation specialist

Dependencies: ARRT-01

Primary ownership:

- `packages/access-router-runtime/src/config-loader.ts`
- a focused internal config contract/validation module if extraction improves reuse
- config validation tests
- config contract documentation

Finding:

`normalizeConfigExport()` accepts any truthy object after an unchecked cast. Arrays, promises returned by async factories, dates, and unrelated module namespace objects pass as configs. Model definitions permit neither or both of `model` and `schema`, conflicting names, ineffective `collection` fields, and duplicate model/data names. Failures then occur incidentally after Mongoose or router construction has begun.

References:

- `packages/access-router-runtime/src/config-loader.ts:10-31`
- `packages/access-router-runtime/src/index.ts:59-71`
- `packages/access-router-runtime/src/index.ts:117-179`
- `packages/access-router-runtime/test/config-loader.test.ts:14-70`
- `packages/access-router-runtime/README.md:149-182`

Implementation requirements:

1. Define one export-normalization function shared by Jiti loading and generated static-import entries.
2. Reject promises/thenables, arrays, non-plain top-level values, unsupported module namespace shapes, and factories that return invalid values with an error naming the config path.
3. Decide and document the supported export forms before implementation. Default object is required; sync default factory and named `config` export require the maintainer decision recorded below.
4. Validate model definitions before registering any model: require exactly one of existing `model` or generated `schema`, reject conflicting names/collections, and reject duplicate resolved model names.
5. Reject duplicate data names and invalid `dev.watch`, `dev.ext`, and `dev.delay` values before runtime assembly. Delay must follow the shared CLI's finite integer bounds.
6. Express the model variants as a discriminated union where TypeScript can prevent ambiguous combinations without weakening inference for supplied Mongoose models.
7. Keep validation focused on this package's structural invariants; do not duplicate all nested `access-router` validation.
8. Add migration documentation and release notes for any previously accepted export or model shape that becomes invalid.

Acceptance criteria:

- Async factories, arrays, promises, dates, unrelated exports, duplicate names, and ambiguous model definitions fail before any model/router/database side effect.
- Supported default object and approved factory/named-export forms load through both direct Jiti loading and generated build normalization.
- Error messages identify the config path and failing field or duplicate name.
- `dev.delay` rejects `Infinity`, fractions, negatives, and values outside the shared CLI bound.
- Public types prevent both/neither `model` and `schema` variants in strict consumer compilation.
- Focused config-loader/runtime tests and `pnpm --filter @web-ts-toolkit/access-router-runtime test` pass.

Completion evidence:

- Changed files: `packages/access-router-runtime/src/config-loader.ts`, `packages/access-router-runtime/src/index.ts`, `packages/access-router-runtime/src/cli-utils.ts`, `packages/access-router-runtime/test/config-loader.test.ts`, `packages/access-router-runtime/test/index.test.ts`, `packages/access-router-runtime/README.md`, `website/docs/packages/access-router-runtime.md`, `CHANGELOG.md`.
- Added shared `normalizeAccessRouterRuntimeConfigExport(...)` and `validateAccessRouterRuntimeConfig(...)` boundary; direct Jiti loading and direct runtime creation now reject unsupported export values, invalid `dev` defaults, ambiguous model definitions, duplicate model/data names, and detectable name/collection conflicts before runtime assembly.
- Updated public model config types to require exactly one of existing `model` or generated `schema` and documented the supported export forms/migration impact.
- Verified: `pnpm --filter @web-ts-toolkit/access-router-runtime test` passed (6 files, 39 tests).

## Wave 2: Deployable Builds And CLI Startup

### Task ARRT-03: Bundle Config Into Portable Local And Serverless Artifacts

Status: completed

Priority: P0

Suggested agent: Node ESM/CJS build-tooling specialist

Dependencies: ARRT-01, ARRT-02

Primary ownership:

- `packages/access-router-runtime/src/cli-utils.ts` generated build entries
- focused build relocation tests
- `packages/access-router-runtime/README.md`
- `website/docs/packages/access-router-runtime.md`

Finding:

Both generated entries resolve config and tsconfig paths against the build-time current directory, embed those absolute paths, and call the synchronous Jiti loader when deployed output is imported. The bundler cannot discover the config or its imports, the artifact depends on the original source tree, post-build source changes alter artifact behavior, local paths leak into output, and serverless cold starts pay synchronous config transpilation and filesystem I/O.

References:

- `packages/access-router-runtime/src/cli-utils.ts:204-248`
- `packages/access-router-runtime/src/config-loader.ts:15-19`
- `packages/access-router-runtime/test/cli-utils.test.ts:36-66`
- `packages/access-router-runtime/README.md:86-96`
- `website/docs/packages/access-router-runtime.md:116-126`
- `apps/runtime/dist/app.js:29`

Implementation requirements:

1. Generate a static import of the selected config module so tsup discovers and bundles its transitive imports.
2. Pass the statically imported namespace through ARRT-02's shared export normalizer; do not invoke Jiti in deployed output.
3. Preserve consumer-local tsconfig path alias resolution during the build without embedding the tsconfig path for runtime access.
4. Preserve local CJS/ESM format and serverless handler behavior supported by the shared build command.
5. Ensure generated source safely represents config paths containing spaces, quotes, backslashes, and non-ASCII characters.
6. Replace current string-presence tests with executable build and relocation tests.
7. Document that builds capture config at build time and require rebuilding after config changes.

Acceptance criteria:

- Local and serverless artifacts run after the original config and tsconfig files are removed and from a different working directory.
- Modifying the source config after build does not change existing artifact behavior.
- Emitted output contains neither the temporary source tree's absolute path nor runtime calls to Jiti/config loader.
- Config imports and tsconfig aliases are bundled and work after relocation.
- A serverless cold start performs no runtime config transpilation or source-config filesystem read.
- `pnpm --filter @web-ts-toolkit/access-router-runtime test` passes.

Completion evidence:

- Changed files: `packages/access-router-runtime/src/cli-utils.ts`, `packages/access-router-runtime/test/cli-utils.test.ts`, `packages/access-router-runtime/test/artifact-harness.test.ts`, `packages/access-router-runtime/test/support/artifact.ts`, `packages/access-router-runtime/README.md`, `website/docs/packages/access-router-runtime.md`, `docs/tasks/20260823-123959-access-router-runtime-review-remediation.md`.
- Generated local and serverless entries now statically import the selected config module, pass the imported namespace through `normalizeAccessRouterRuntimeConfigExport(...)`, and avoid embedding runtime tsconfig loader arguments in deployed code.
- Added executable relocation coverage that builds local and serverless artifacts with a tsconfig path alias, mutates then removes the source config/tsconfig/imported source file, runs artifacts from a relocated working directory, and asserts emitted output does not contain the temporary source root or runtime Jiti/config-loader calls.
- Documented that build outputs capture config/imports at build time and must be rebuilt after config, config import, or tsconfig alias changes.
- Verified: `pnpm --filter @web-ts-toolkit/access-router-runtime test` passed (6 files, 40 tests).

### Task ARRT-04: Parse And Prepare CLI Inputs Before Config Execution

Status: completed

Resolution note: watch supervision does not load access-router-runtime config or initialize the application runtime in the parent process. Bare `--watch` uses the CLI default watch path (`.`); config-derived watch defaults are intentionally not inspected by the supervisor.

Priority: P1

Suggested agent: CLI and process-lifecycle specialist

Dependencies: ARRT-01, ARRT-02, ARRT-03

Primary ownership:

- `packages/access-router-runtime/src/cli.ts`
- `packages/access-router-runtime/src/cli-utils.ts` invocation/default handling
- focused CLI subprocess and watch tests
- `packages/express-runtime/src/cli-api.ts` only for the smallest reusable preparation seam if required

Finding:

`dev` executes config before authoritative parsing, environment-file loading, and module preloading. The documented config reads `process.env.MONGODB_URI`, but the documented `--env .env` command populates it too late. Invalid options can execute config side effects before rejection. Explicit subcommands assume the target is immediately next, so options before the target and `--` semantics fail. Watch mode evaluates config in the supervisor and again in children, retaining parent-side effects.

References:

- `packages/access-router-runtime/src/cli.ts:19-45`
- `packages/access-router-runtime/src/cli-utils.ts:82-100`
- `packages/access-router-runtime/src/cli-utils.ts:134-195`
- `packages/access-router-runtime/README.md:36-39`
- `packages/access-router-runtime/README.md:80-84`
- `packages/express-runtime/src/cli-api.ts:63-75`

Implementation requirements:

1. Parse and validate the complete command before evaluating config or preload code.
2. Reuse the shared environment and preload operations so `--env` and `--require` complete before config evaluation.
3. Define target extraction through the authoritative parser rather than a second partial positional parser; preserve option terminator behavior and reject unknown subcommands deterministically.
4. Eliminate inconsistent duplicate `--tsconfig` parsing, including first-versus-last value behavior and empty inline values.
5. In watch mode, do not initialize the application runtime in the supervisor. If config-derived watch defaults require inspection there, isolate a side-effect-minimizing metadata contract or document and test the remaining trusted config evaluation explicitly.
6. Surface `LocalServer.ready` startup rejection to CLI outcome rather than discarding it in `start`; failed init/connect/listen must produce a nonzero exit without a hanging resource.
7. Remove `assertNoManualInit()` or make it the single policy used by the real CLI; do not retain dead production helpers tested in isolation.

Acceptance criteria:

- A config sees variables supplied only by `--env` and behavior installed only by `--require` during module evaluation.
- Unknown/malformed options, invalid numeric values, missing values, and repeated conflicting `--tsconfig` values fail before config evaluation.
- Supported options work before or after the target, and `--` permits an otherwise ambiguous target according to the shared parser contract.
- Watch tests prove application initialization occurs once per child and no application resource is retained in the supervisor.
- Config init, database connect, and listen failures produce a nonzero subprocess exit in bounded time with no listening socket.
- Help, version, implicit `dev`, explicit commands, and pass-through commands retain documented behavior.
- Both package suites pass serially if `express-runtime` changes: `pnpm --filter @web-ts-toolkit/express-runtime test`, then `pnpm --filter @web-ts-toolkit/access-router-runtime test`.

Completion evidence:

- Changed files: `packages/access-router-runtime/src/cli.ts`, `packages/access-router-runtime/src/cli-utils.ts`, `packages/access-router-runtime/test/cli-runtime.test.ts`, `packages/access-router-runtime/test/cli-utils.test.ts`, `packages/express-runtime/src/cli-api.ts`, `packages/express-runtime/src/cli-utils.ts`, `packages/express-runtime/test/watch-supervisor.test.ts`, `docs/tasks/20260823-123959-access-router-runtime-review-remediation.md`.
- Access-router CLI now normalizes bare `dev --watch` to a CLI/default watch path without evaluating config in the supervisor; config-aware non-watch commands use the shared parser, env loading, preload handling, and `LocalServer.ready` startup outcome before config/runtime side effects.
- Added subprocess coverage for env/preload-before-config ordering, pre-config validation failures, target parsing with options before/after and `--`, watch supervisor isolation, and bounded nonzero startup failures for config init, database connect, and listen errors.
- Added shared watch fallback coverage proving the supervisor can spawn children when recursive `fs.watch` is unavailable on the host platform.
- Verified: `pnpm --filter @web-ts-toolkit/express-runtime test` passed (9 files, 270 tests), then `pnpm --filter @web-ts-toolkit/access-router-runtime test` passed (7 files, 41 tests).

## Wave 3: Resource Ownership And Lifecycle

### Task ARRT-05: Give Each Runtime Explicit Database And Model Ownership

Status: completed

Resolution note: independent per-runtime Mongoose connections are the selected policy. A runtime may use supplied Mongoose models on their existing connection, but generated schema-backed models are registered on the runtime-owned connection or an explicitly supplied `db.connection`. Runtime lifecycle never silently uses or disconnects unrelated global Mongoose state.

Priority: P0

Suggested agent: Mongoose lifecycle and isolation specialist

Dependencies: ARRT-01, ARRT-02

Primary ownership:

- database/model resolution boundary extracted from `packages/access-router-runtime/src/index.ts`
- focused multi-runtime and ownership tests
- public config types and database lifecycle documentation

Finding:

The runtime skips its configured connection whenever Mongoose's global default connection is already ready, without checking its URL. It registers generated models in the global registry and disconnects the global connection. A second runtime can silently use the first runtime's database, and shutting down either runtime can disconnect the other runtime or an embedding application's pre-existing connection. Existing model names are silently reused even when schema or collection differs.

References:

- `packages/access-router-runtime/src/index.ts:117-136`
- `packages/access-router-runtime/src/index.ts:153-169`
- `packages/access-router-runtime/src/index.ts:222-249`
- `packages/access-router-runtime/test/index.test.ts:7-12`
- `packages/access-router-runtime/test/index.test.ts:71-93`

Implementation requirements:

1. Resolve the maintainer decision below: support independent runtime-owned connections, or explicitly enforce a singleton runtime. Independent connection ownership is recommended.
2. For independent ownership, accept or create an explicit `mongoose.Connection`, register generated models on that connection, and record whether the runtime opened it.
3. Close only connections owned by the runtime. Never disconnect a pre-existing application connection merely because config includes a URL.
4. Existing supplied models may retain their own connection, but the contract must reject or document incompatible mixtures with a separately configured runtime connection.
5. Reject schema/collection collisions rather than silently returning a globally cached model with different metadata.
6. Make database and model adapters injectable internally so most lifecycle tests do not depend on global Mongoose mocks.
7. Document multi-runtime behavior and any intentional singleton restriction as a public contract change.
8. Add migration documentation and release notes for changed connection/model ownership behavior.

Acceptance criteria:

- If independent runtimes are selected, two runtimes configured for different databases cannot read or write through each other's connection, and shutting down one leaves the other operational.
- If singleton enforcement is selected, constructing or initializing a second runtime fails before model/database side effects with a documented error.
- Under either policy, shutting down a runtime leaves a pre-existing externally owned connection operational.
- A configured URL is never silently ignored because unrelated global Mongoose state is connected.
- Same-name, different-schema/collection definitions either remain isolated by connection or fail with a clear pre-side-effect error.
- Connection ownership and model cleanup behavior are deterministic across repeated tests/runtime construction.
- `pnpm --filter @web-ts-toolkit/access-router-runtime test` passes.

Completion evidence:

- Changed files: `packages/access-router-runtime/src/database.ts`, `packages/access-router-runtime/src/index.ts`, `packages/access-router-runtime/src/config-loader.ts`, `packages/access-router-runtime/test/index.test.ts`, `packages/access-router-runtime/test/support/lifecycle.ts`, `packages/access-router-runtime/test/cli-runtime.test.ts`, `packages/access-router-runtime/README.md`, `website/docs/packages/access-router-runtime.md`, `docs/tasks/20260823-123959-access-router-runtime-review-remediation.md`.
- Added an internal database/model ownership boundary that creates independent runtime-owned Mongoose connections for `db.url`, supports explicit external `db.connection`, registers generated schema models only on the selected connection, rejects existing-model/`db.url` mixtures, rejects same-connection model/schema collisions before registration, closes only owned opened connections, and removes only runtime-generated model registrations on shutdown.
- Added focused runtime tests for two URL-backed runtimes using separate fake connections and stores, shutdown of one runtime leaving another operational, external connection preservation, no global Mongoose connect/disconnect usage for configured URLs, same-name model isolation across connections, same-connection collision rejection, and deterministic generated-model cleanup across repeated runtime construction.
- Updated package and website docs to document independent connection ownership, external connection behavior, incompatible mixtures, and generated-model cleanup.
- Verified: `pnpm --filter @web-ts-toolkit/access-router-runtime test` passed (7 files, 47 tests). The existing Vitest CJS/ESM config warning remains unchanged from the baseline.

### Task ARRT-06: Make Runtime Init And Shutdown A Deterministic State Machine

Status: completed

Resolution note: runtime lifecycle now uses deterministic private states. Multiple cleanup failures are surfaced as `AggregateError`; when startup fails and rollback also fails, the `AggregateError.errors` array contains the primary startup failure first, followed by rollback failures.

Priority: P1

Suggested agent: asynchronous lifecycle specialist

Dependencies: ARRT-05

Primary ownership:

- lifecycle coordinator extracted from `packages/access-router-runtime/src/index.ts`
- local/serverless lifecycle composition in `packages/access-router-runtime/src/index.ts`
- focused lifecycle concurrency and failure tests

Finding:

`shutdown()` does not coordinate with pending `init()`, so initialization can finish after shutdown. A failing config shutdown hook skips database disconnection. A caller `onShutdown` failure skips runtime cleanup. Connection success followed by config or caller init failure has no rollback. Promise state is reset in ways that permit unclear retries after partial failure.

References:

- `packages/access-router-runtime/src/index.ts:219-253`
- `packages/access-router-runtime/src/index.ts:259-279`
- `packages/access-router-runtime/test/index.test.ts:71-93`
- `packages/access-router-runtime/test/index.test.ts:145-174`

Implementation requirements:

1. Implement explicit states for idle, initializing, ready, stopping, stopped, and failed, with one observable transition policy.
2. Define and test calls to init during shutdown, shutdown during init, repeated init after failure, repeated shutdown after failure, and concurrent calls.
3. Roll back resources acquired by a failed connect/config init/caller init sequence.
4. Run caller shutdown, config shutdown, and mandatory database cleanup under independent error capture so optional hook failure cannot skip owned cleanup.
5. Define an error policy that preserves all relevant failures, using `AggregateError` where multiple cleanup steps fail, without hiding the primary startup error.
6. Preserve serverless single-flight initialization and coordinate local server readiness with runtime readiness.
7. Keep lifecycle state private; expose behavior through stable `init()`, `shutdown()`, `ready`, and handler contracts rather than mutable flags.

Acceptance criteria:

- Shutdown requested during pending connect/init cannot resolve before late-created resources are torn down, and init cannot complete after terminal shutdown.
- Connect, config init, or caller init failure rolls back every resource acquired by that attempt.
- Config or caller shutdown rejection does not prevent database cleanup, and multiple errors are observable under the documented policy.
- Concurrent init calls initialize once; concurrent shutdown calls clean up once; retry behavior after failure is deterministic and tested.
- Local server and serverless handler tests show no unhandled rejection, open port, retained listener, or owned connection after failure.
- `pnpm --filter @web-ts-toolkit/access-router-runtime test` passes.

Completion evidence:

- Changed files: `packages/access-router-runtime/src/index.ts`, `packages/access-router-runtime/src/database.ts`, `packages/access-router-runtime/test/lifecycle-harness.test.ts`, `packages/access-router-runtime/test/support/lifecycle.ts`, `packages/access-router-runtime/README.md`, `website/docs/packages/access-router-runtime.md`, `docs/tasks/20260823-123959-access-router-runtime-review-remediation.md`.
- Added a private runtime lifecycle state machine for idle, initializing, ready, stopping, stopped, and failed; shutdown during startup now prevents late startup success and waits for rollback, startup failures roll back acquired resources, and local/serverless caller-init failures trigger runtime cleanup.
- Documented and tested the selected cleanup error policy: single cleanup failures are thrown directly, multiple cleanup failures use `AggregateError`, and startup plus rollback failures use `AggregateError` with the primary startup error first.
- Added deterministic lifecycle tests for shutdown during pending connect, config-init rollback aggregation, partial connect rollback, independent shutdown error capture, concurrent init/shutdown single-flight behavior, retry after init/shutdown failure, and local/serverless caller-init rollback without retained connections/listeners/open ports.
- Verified: `pnpm --filter @web-ts-toolkit/access-router-runtime test` passed (7 files, 55 tests). The existing Vitest CJS/ESM config warning remains unchanged from the baseline.

### Task ARRT-07: Unify Built-App Signal And Shutdown Ownership

Status: completed

Resolution note: generated local artifacts export explicit `init()` and `shutdown()` hooks without registering process signal handlers on import. The shared local server owns signal registration for CLI `start`/`dev`; `--no-signals` disables that owner. Shutdown stops accepting, drains in-flight requests, awaits cleanup, logs cleanup rejection to stderr, and exits nonzero when the CLI owns process exit.

Priority: P1

Suggested agent: Node process and graceful-shutdown specialist

Dependencies: ARRT-03, ARRT-04, ARRT-06

Primary ownership:

- `packages/access-router-runtime/src/cli-utils.ts` local generated entry
- `packages/access-router-runtime/src/cli.ts` start integration if required
- minimal `packages/express-runtime` lifecycle contract extension if required
- signal and built-app subprocess tests

Finding:

Generated local modules register `SIGINT`/`SIGTERM` listeners as an import side effect and discard the runtime shutdown promise. Starting the module through `express-runtime` installs another lifecycle owner. HTTP draining and database cleanup can race, shutdown rejection can become unhandled, `--no-signals` does not disable generated listeners, and merely importing a built app mutates process-global state.

References:

- `packages/access-router-runtime/src/cli-utils.ts:211-230`
- `packages/access-router-runtime/src/cli.ts:95-100`
- `packages/express-runtime/src/index.ts:370-425`
- `packages/express-runtime/src/index.ts:621-688`
- `packages/access-router-runtime/test/cli-utils.test.ts:36-44`

Implementation requirements:

1. Remove process signal registration from generated module import.
2. Export explicit runtime lifecycle hooks in the built-app contract, including shutdown, without creating a second server/signal owner.
3. Integrate with the shared local-server lifecycle so order is: stop accepting, drain requests, run runtime cleanup, then optional process exit.
4. Respect `--no-signals`/shared signal configuration and ensure exactly one component owns each installed listener.
5. Await cleanup and define deterministic logging/exit behavior when cleanup rejects.
6. Preserve programmatic importing of the built app without process-global side effects.

Acceptance criteria:

- Importing one or multiple built app modules does not change signal-listener counts.
- `SIGTERM` drains an in-flight request before runtime cleanup and process exit.
- Slow shutdown completes before exit, rejection is reported without an unhandled rejection, and exit status follows the documented policy.
- `start --no-signals` installs no package-owned signal listener.
- Normal startup has exactly one coordinated lifecycle owner and runs each shutdown hook once.
- Both package suites pass serially if the shared contract changes.

Completion evidence:

- Changed files: `packages/access-router-runtime/src/cli-utils.ts`, `packages/access-router-runtime/test/cli-utils.test.ts`, `packages/access-router-runtime/test/cli-runtime.test.ts`, `packages/access-router-runtime/README.md`, `website/docs/packages/access-router-runtime.md`, `packages/express-runtime/src/index.ts`, `packages/express-runtime/src/cli-api.ts`, `packages/express-runtime/src/cli-utils.ts`, `packages/express-runtime/test/index.test.ts`, `packages/express-runtime/test/public-api-surface.test.ts`, `packages/express-runtime/README.md`, `website/docs/packages/express-runtime.md`, `docs/tasks/20260823-123959-access-router-runtime-review-remediation.md`.
- Removed generated local-entry signal registration and exported built-app `shutdown()` alongside `init()` so programmatic imports have no process-global signal side effects.
- Extended the shared built-app/start lifecycle to load optional `shutdown`, run it after HTTP drain, reject/log cleanup failures for programmatic shutdown, and exit `1` for CLI-owned cleanup failure.
- Added built-artifact subprocess coverage for importing one or multiple modules without listener-count changes, `start --no-signals`, SIGTERM drain-before-cleanup ordering, slow rejecting shutdown without unhandled rejection, and single coordinated signal owner/hook execution.
- Verified: `pnpm --filter @web-ts-toolkit/express-runtime test` passed (9 files, 271 tests), then `pnpm --filter @web-ts-toolkit/access-router-runtime test` passed (7 files, 60 tests). The existing access-router-runtime Vitest CJS/ESM config warning remains unchanged.

## Wave 4: Composition And Public Architecture

### Task ARRT-08: Preserve Express Router And Middleware Ordering

Status: completed

Priority: P1

Suggested agent: Express composition specialist

Dependencies: ARRT-01, ARRT-02, ARRT-06

Primary ownership:

- app/router assembly boundary in `packages/access-router-runtime/src/index.ts`
- route-order integration tests
- Express composition documentation

Finding:

The config omits `router`/`routers` from consumer options and mounts all generated routes inside `finalize`. `createExpressApp()` mounts `postMiddleware` before `finalize`, so this package's generated model, data, root, extra, and OpenAPI routes come after middleware documented as post-router. A 404 catch-all in `postMiddleware` can shadow every generated route.

References:

- `packages/access-router-runtime/src/index.ts:103-105`
- `packages/access-router-runtime/src/index.ts:181-206`
- `packages/express-runtime/src/index.ts:37-89`
- `packages/express-runtime/src/index.ts:131-157`
- `packages/access-router-runtime/test/index.test.ts:15-69`

Implementation requirements:

1. Mount generated and extra routers through the `router`/`routers` phase of `createExpressApp`, not through `finalize`.
2. Preserve explicit ordering among model, data, root, extra, and OpenAPI routes.
3. Keep user `finalize` after routers and `postMiddleware`, before the final error handler, matching the inherited contract.
4. Decide and document whether OpenAPI belongs with generated routers or in a distinct documented slot; test the selected order.
5. Cover error propagation from generated/custom routes to the final `errorHandler`.

Acceptance criteria:

- `preMiddleware`, parsers, `middleware`, generated routers, `postMiddleware`, user `finalize`, and `errorHandler` run in the documented order.
- A post-router 404 handles only unmatched requests and does not shadow generated routes.
- Generated/custom route errors reach the configured final error handler.
- Root/OpenAPI disabled and empty-runtime cases retain expected behavior.
- Focused supertest cases and `pnpm --filter @web-ts-toolkit/access-router-runtime test` pass.

Completion evidence:

- Changed files: `packages/access-router-runtime/src/index.ts`, `packages/access-router-runtime/test/route-order.test.ts`, `packages/access-router-runtime/README.md`, `website/docs/packages/access-router-runtime.md`, `docs/tasks/20260823-123959-access-router-runtime-review-remediation.md`.
- Generated model, data, root, extra, and OpenAPI routes now mount through the `createExpressApp()` routers phase as one ordered router set; user `finalize` remains after `postMiddleware` and before the final error handler.
- Documented and tested the selected OpenAPI position: after model, data, root, and `extraRoutes` in the generated-router phase.
- Added focused Supertest coverage for parser/middleware/router/post/finalize ordering, post-router 404 behavior, generated/custom route error propagation to `errorHandler`, generated/extra/OpenAPI ordering, and root/OpenAPI disabled empty-runtime behavior.
- Verified: `pnpm --filter @web-ts-toolkit/access-router-runtime test` passed (8 files, 65 tests). The existing Vitest CJS/ESM config warning remains unchanged.

### Task ARRT-09: Encapsulate Runtime State And Remove Lifecycle Footguns

Status: completed

Resolution note: `createAccessRouterRuntimeApp()` is retained but restricted to lifecycle-free configs. It rejects configs with `db`, `init`, or `shutdown`; callers that need database or lifecycle behavior must use `createAccessRouterRuntime(config).app` and run the runtime lifecycle.

Priority: P2

Suggested agent: TypeScript library API specialist

Dependencies: ARRT-02, ARRT-05, ARRT-06, ARRT-08

Primary ownership:

- public contracts and runtime assembly in `packages/access-router-runtime/src/index.ts`
- strict consumer type tests
- module API documentation

Finding:

The returned context exposes mutable model/router collections that share construction references even though the app is already composed. It also exposes the caller's mutable config object while lifecycle closures continue reading that object, so post-construction mutation can change DB and hook behavior without rebuilding routes. `createAccessRouterRuntimeApp()` discards init/shutdown while accepting configs that require DB and hooks. Aggregate config/context types erase model-map generics, and serverless convenience methods erase provider event/context generics. `src/index.ts` also combines contracts, model registration, route assembly, Express composition, and lifecycle, making isolated testing difficult.

References:

- `packages/access-router-runtime/src/index.ts:29-115`
- `packages/access-router-runtime/src/index.ts:143-217`
- `packages/access-router-runtime/src/index.ts:255-293`
- `packages/access-router-runtime/README.md:105-137`
- `website/docs/packages/access-router-runtime.md:26-35`

Implementation requirements:

1. Expose model/router collections as readonly snapshots or readonly accessors so callers cannot create state inconsistent with mounted routes.
2. Snapshot/freeze lifecycle-relevant config or expose a deeply readonly contract; do not let mutation after construction silently replace DB options or lifecycle hooks. If live config mutation is intentional, document its synchronization semantics and test it explicitly.
3. Resolve the maintainer decision for `createAccessRouterRuntimeApp()`: deprecate/remove it, restrict it to lifecycle-free config, or return/attach lifecycle capability. Do not silently accept DB/hooks while discarding them.
4. Preserve model and data registry typing where practical through config/context generics or typed registration helpers; avoid replacing useful inference with broad casts.
5. Make serverless creation generic over event/context in parity with `express-runtime`.
6. Extract only stable, independently testable boundaries such as contracts, validation, database/model registry, route assembly, and lifecycle. Keep thin orchestration together.
7. Add export-surface and strict consumer compilation tests for intended public values and types.
8. Add migration documentation and release notes for any app-helper or public context/type contract change.

Acceptance criteria:

- Consumers cannot mutate runtime-owned registries through the public context.
- Mutating the caller-owned config after runtime construction cannot silently change lifecycle or database behavior.
- The app-only helper cannot silently produce an app missing required configured lifecycle behavior.
- Typed model/data registries and serverless event/context types survive declaration emit and strict consumer compilation.
- Public export snapshots contain only intentional API symbols; internal adapters/state are not exported accidentally.
- Existing supported creation workflows remain concise and documented.
- `pnpm --filter @web-ts-toolkit/access-router-runtime test` passes.

Completion evidence:

- Changed files: `packages/access-router-runtime/src/index.ts`, `packages/access-router-runtime/test/index.test.ts`, `packages/access-router-runtime/test/public-api-surface.test.ts`, `packages/access-router-runtime/test/strict-consumer-types.test.ts`, `packages/access-router-runtime/README.md`, `website/docs/packages/access-router-runtime.md`, `docs/tasks/20260823-123959-access-router-runtime-review-remediation.md`.
- Public runtime context now exposes readonly registry snapshots and a readonly config snapshot; DB options and init/shutdown hooks are copied at construction so caller-side config mutation cannot replace lifecycle behavior.
- `createAccessRouterRuntimeApp()` now has a lifecycle-free config type and runtime guard that rejects `db`, `init`, or `shutdown` before runtime/database assembly.
- Added public export-surface snapshots and an installed-consumer strict type test covering readonly registries, typed model/data router inference, lifecycle-free app-helper typing, and generic serverless event/context propagation through emitted declarations.
- Verified: `pnpm --filter @web-ts-toolkit/access-router-runtime test` passed (10 files, 71 tests). The existing Vitest CJS/ESM config warning remains unchanged.

## Wave 5: Packaging, Documentation, And Hygiene

### Task ARRT-10: Verify Packed ESM, CJS, Types, CLI, And Published Examples

Status: completed

Priority: P2

Suggested agent: npm packaging and TypeScript compatibility specialist

Dependencies: ARRT-03, ARRT-04, ARRT-07, ARRT-09

Primary ownership:

- `packages/access-router-runtime/package.json`
- `packages/access-router-runtime/tsup.config.ts`
- `packages/access-router-runtime/tsconfig.json`
- `packages/access-router-runtime/tsconfig.package.json`
- packed-consumer and declaration tests
- package and website documentation

Finding:

The build emits `index.d.ts` and `index.d.mts`, but package exports always select `index.d.ts`. No test installs the transformed package into ESM, CJS, NodeNext, and Bundler consumers or executes the published CLI. Source type-checking, built output, and the published reusable config express different targets/resolution modes; this may be intentional but is not documented or verified against the actual bundled-config execution model. The shipped README points to `examples/basic`, but package `files` excludes it. README and website omit `dev` and loader options and can drift.

References:

- `packages/access-router-runtime/package.json:17-40`
- `packages/access-router-runtime/tsup.config.ts:3-24`
- `packages/access-router-runtime/tsconfig.json:3-16`
- `packages/access-router-runtime/tsconfig.package.json:3-12`
- `packages/access-router-runtime/README.md:20-22`
- `packages/access-router-runtime/README.md:119-182`
- `website/docs/packages/access-router-runtime.md:186-233`
- `packages/express-runtime/package.json:23-42`

Implementation requirements:

1. Use conditional declaration exports for import/require consumers, matching established workspace packages, or emit only the one declaration format intentionally supported.
2. Add packed/transformed consumer tests for ESM runtime import, CJS runtime require, NodeNext and Bundler compilation with `skipLibCheck: false`, the tsconfig subpath, peer dependencies, and the executable CLI.
3. Test the actual publish transformation rather than a hand-written manifest rewrite so workspace dependency/version handling is covered.
4. Investigate the source, build, and published tsconfig target/resolution differences against the actual Node 22 and ARRT-03 bundled-config model. Align them only where consumer compilation or runtime evidence shows a mismatch; otherwise document the intentional distinction.
5. Either publish `examples/basic` or replace package-relative README references with stable repository/website links.
6. Document `dev`, load options, config export forms, database ownership, lifecycle ordering, middleware ordering, and build-time config capture consistently in package and website docs.
7. Verify the `sideEffects` declaration remains truthful after generated modules no longer register signals at import.
8. Add a consumer/test matrix that installs the package with Mongoose 8 and Mongoose 9 and runs the same ownership and lifecycle contract against both.
9. Cap the peer range to majors covered by that matrix, or document and test the repository policy by which future Mongoose majors become supported.

Acceptance criteria:

- Packed ESM/CJS consumers execute and strict NodeNext/Bundler consumers compile against the correct declaration format.
- Mongoose 8 and Mongoose 9 consumers pass the same database ownership and lifecycle contract; the declared peer range matches the tested support policy.
- The packed binary runs `--help`, `--version`, and a minimal config-aware command with rewritten package metadata.
- The exported tsconfig resolves from an installed package and matches the documented config build/runtime model.
- Every example link in the published README resolves from the package or to a stable external URL.
- README, website, declarations, package exports, and runtime behavior agree.
- `pnpm --filter @web-ts-toolkit/access-router-runtime test` and `pnpm build` pass serially.

Completion evidence:

- Changed files: `packages/access-router-runtime/package.json`, `packages/access-router-runtime/tsup.config.ts`, `packages/access-router-runtime/src/cli-utils.ts`, `packages/access-router-runtime/src/cli.ts`, `packages/access-router-runtime/test/cli-utils.test.ts`, `packages/access-router-runtime/test/packed-consumer.test.ts`, `packages/access-router-runtime/README.md`, `website/docs/packages/access-router-runtime.md`, `docs/tasks/20260823-123959-access-router-runtime-review-remediation.md`.
- Added conditional declaration exports for import/require consumers, staged the exported config into `dist/tsconfig.json` and `dist/tsconfig.package.json`, capped the published Mongoose peer range to the tested `>=8 <10` policy, and made the CLI version read transformed installed package metadata.
- Added packed-consumer coverage using the real `@repo-toolkit/publish-package` manifest transformation and `pnpm pack`: transformed manifest assertions, packed ESM import, CJS require, strict NodeNext and Bundler declaration compilation with `skipLibCheck: false`, installed tsconfig extension, Mongoose 8 and 9 database ownership/lifecycle checks, and packed CLI `--help`, `--version`, and config-aware `build` execution.
- Updated package and website docs for stable external example links, dev/load options, exported tsconfig purpose, build-time config capture, and Mongoose 8/9 support policy.
- Verified: `pnpm --filter @web-ts-toolkit/access-router-runtime test` passed (11 files, 75 tests). `pnpm build` passed. Existing Vite/Vitest config warnings remain unrelated to ARRT-10 behavior.

### Task ARRT-11: Finish Test Hygiene And Measure Remaining Startup Cost

Status: completed

Priority: P3

Suggested agent: test reliability and performance specialist

Dependencies: ARRT-03, ARRT-04, ARRT-06, ARRT-10

Primary ownership:

- `packages/access-router-runtime/test/`
- `packages/access-router-runtime/vitest.config.ts`
- focused performance fixtures or benchmarks
- no production changes without measured evidence

Finding:

Current loader tests leak temporary directories, Jiti cache files accumulate under package `node_modules/.cache/jiti`, lifecycle branches have little coverage, and Vitest emits a module-loading warning. There are no coverage thresholds or measurements proving that deployed artifacts avoid Jiti/file-loading cold-start work. These are hygiene and regression-detection gaps, not evidence of a request-path performance defect.

References:

- `packages/access-router-runtime/test/config-loader.test.ts:8-70`
- `packages/access-router-runtime/vitest.config.ts:1-8`
- `packages/access-router-runtime/src/config-loader.ts:15-19`
- `packages/access-router-runtime/package.json:32-35`

Implementation requirements:

1. Remove the Vitest CJS/ESM config warning using the repository's established convention.
2. Ensure temporary files, Jiti cache artifacts created by tests, processes, listeners, and Mongoose models/connections are cleaned without deleting unrelated resources.
3. Add meaningful branch coverage around config normalization, route assembly, and lifecycle transitions; set thresholds only after measuring a stable baseline.
4. Add a repeatable comparison or smoke budget showing deployed artifacts do not synchronously transpile/read source config on each isolated cold start.
5. Measure before adding caches or changing Jiti options. If no material remaining issue is demonstrated, record that result and make no production optimization.

Acceptance criteria:

- Tests finish with no Vite config warning, leaked temporary directories, open handles, or listener/model cleanup that affects unrelated code.
- Critical config/lifecycle branches are represented by behavior-focused tests; any coverage threshold is stable and documented.
- A repeatable artifact cold-start check confirms no runtime Jiti/source-config work.
- No speculative production optimization is merged without before/after evidence.
- Three consecutive serialized runs of `pnpm --filter @web-ts-toolkit/access-router-runtime test` pass with no leaked handles, listeners, temporary directories, or Mongoose state.

Completion evidence:

- Changed files: `packages/access-router-runtime/vitest.config.mts`, `packages/access-router-runtime/test/setup-hygiene.ts`, `packages/access-router-runtime/test/support/tmp.ts`, `packages/access-router-runtime/test/support/subprocess.ts`, `packages/access-router-runtime/test/config-loader.test.ts`, `packages/access-router-runtime/test/lifecycle-harness.test.ts`, `packages/access-router-runtime/test/artifact-harness.test.ts`, `packages/access-router-runtime/test/cli-runtime.test.ts`, `docs/tasks/20260823-123959-access-router-runtime-review-remediation.md`.
- Added package-level hygiene setup for suite-owned subprocess, temp-project, Jiti cache, and Mongoose cleanup; Jiti cleanup now covers both package-local cache and Jiti's `/tmp/jiti` cache without deleting unrelated cache entries.
- Added behavior-focused config branch coverage for thenables across direct/default-factory/named export paths, invalid DB ownership fields, and collection/model definition failures; added lifecycle branch coverage for shutdown requested during pending config init.
- Strengthened the relocated artifact cold-start probe to run repeated isolated local/serverless starts with a 5s smoke budget while asserting `jitiLoads: 0` and `sourceFsSyncCalls: 0`; no production cache or Jiti-option optimization was added because the deployed artifact check shows no runtime Jiti/source-config work.
- No numeric coverage threshold was added for ARRT-11; the added branch coverage is behavior-gated directly, and the stability gate is the serialized package suite plus explicit cleanup/cold-start assertions.
- Verified: three consecutive serialized runs of `pnpm --filter @web-ts-toolkit/access-router-runtime test` passed with no Vite/Vitest config warning in output: run 1 passed (11 files, 81 tests, 100.78s), run 2 passed (11 files, 81 tests, 103.14s), run 3 passed (11 files, 81 tests, 129.43s). Post-run scans found no suite-owned Jiti cache entries under `packages/access-router-runtime/node_modules/.cache/jiti` or `/tmp/jiti`, and no suite-owned temporary project directories under `/tmp`.

## Dependency And Parallelization Guidance

| Wave | Task    | Can run in parallel with                 | Shared hotspots / sequencing                                                    |
| ---- | ------- | ---------------------------------------- | ------------------------------------------------------------------------------- |
| 1    | ARRT-01 | none initially                           | Establish harness first; do not run build-writing tests concurrently.           |
| 1    | ARRT-02 | none after ARRT-01                       | Owns config normalization and model shape decisions used by later tasks.        |
| 2    | ARRT-03 | ARRT-05 after ARRT-02                    | Shares `cli-utils.ts` with ARRT-04/07; finish before those edits.               |
| 2    | ARRT-04 | ARRT-05                                  | Shares CLI tests and possibly `express-runtime/cli`; run after ARRT-03.         |
| 3    | ARRT-05 | ARRT-03/04                               | Owns DB/model boundary; avoid simultaneous edits to `index.ts` with ARRT-06/08. |
| 3    | ARRT-06 | none                                     | Run after ARRT-05 so lifecycle owns the final database abstraction.             |
| 3    | ARRT-07 | ARRT-08 if file ownership is coordinated | Run after build, CLI, and runtime lifecycle contracts stabilize.                |
| 4    | ARRT-08 | ARRT-07                                  | Sequence any overlapping `index.ts` edits after ARRT-06.                        |
| 4    | ARRT-09 | none                                     | Consolidates final public API after behavioral work.                            |
| 5    | ARRT-10 | none                                     | Packaging/docs follow final exports and lifecycle.                              |
| 5    | ARRT-11 | none                                     | Final hygiene/measurement after tests and artifacts stabilize.                  |
| 6    | ARRT-12 | none                                     | Independent reviewer; last task only.                                           |

Recommended allocation:

| Agent                     | Tasks                 |
| ------------------------- | --------------------- |
| Integration harness agent | ARRT-01               |
| Config/type agent         | ARRT-02               |
| Build/CLI agent           | ARRT-03, then ARRT-04 |
| Mongoose/lifecycle agent  | ARRT-05, then ARRT-06 |
| Process lifecycle agent   | ARRT-07               |
| Express composition agent | ARRT-08               |
| Public API/package agent  | ARRT-09, then ARRT-10 |
| Reliability agent         | ARRT-11               |
| Independent reviewer      | ARRT-12               |

## Resolved Decisions

1. Config exports: supported forms are default object, synchronous default factory returning a valid object, and named `config` object. Async factories, promises, and thenables remain unsupported because the loader API is synchronous.
2. Database ownership: independent per-runtime connections are the supported policy. Runtime-created connections are owned and closed by that runtime; explicitly supplied `db.connection` values are externally owned and are not closed by the runtime.
3. App-only helper: `createAccessRouterRuntimeApp()` is retained but restricted to lifecycle-free configs. It rejects configs with `db`, `init`, or `shutdown`; callers needing those capabilities must use `createAccessRouterRuntime(config).app` and manage the runtime lifecycle.
4. Startup/cleanup errors: mandatory cleanup always runs. A single cleanup failure is thrown directly; multiple cleanup failures use `AggregateError`; startup failure plus rollback failure uses `AggregateError` with the primary startup failure first.
5. Config-derived watch defaults: the watch supervisor does not load access-router-runtime config or initialize application runtime. Bare `--watch` uses the CLI default watch path (`.`), and config-derived watch defaults are intentionally not inspected in the supervisor.

All formerly blocked tasks were completed using the decisions above. Residual risk is limited to intentionally trusted, unsandboxed config/preload execution in non-watch dev/build paths and request-route/query behavior delegated to lower-level packages per the non-goals.

## Wave 6: Independent Integration Review

### Task ARRT-12: Independently Verify Runtime Remediation

Status: completed

Review note: the first full-repository `pnpm test` run failed outside `packages/access-router-runtime` when `@web-ts-toolkit/express-oidc-vault-redis-store` timed out in `test/index.test.ts` case `keeps bounded revocation command behavior for a 10,000-session index` after 20000 ms. The same package passed in isolation, and a second full serial `pnpm test` run passed. No narrow `access-router-runtime` fix was indicated.

Priority: P1

Suggested agent: independent senior reviewer who did not implement ARRT-02 through ARRT-10

Dependencies: ARRT-01, ARRT-02, ARRT-03, ARRT-04, ARRT-05, ARRT-06, ARRT-07, ARRT-08, ARRT-09, ARRT-10, ARRT-11

Primary ownership:

- review and verification only
- focused fixes only when a failed acceptance criterion has a narrow, unambiguous correction
- this task file for completion evidence and deferred-risk notes

Finding:

The remediation crosses config execution, build output, CLI startup, Mongoose ownership, Express ordering, process signals, public types, and package distribution. A final review by an implementer would risk validating individual patches without proving the end-to-end lifecycle and deployed artifact contracts.

References:

- all findings and tasks in this document
- `docs/tasks/20260822-201308-express-runtime-review-remediation.md`
- `packages/access-router-runtime/src/`
- `packages/access-router-runtime/test/`

Implementation requirements:

1. Verify every acceptance criterion against behavior, not implementation shape or generated-source string matching alone.
2. Build and relocate local and serverless artifacts, remove source config, and execute them from a clean directory.
3. Verify CLI validation/env/preload ordering across normal and watch paths and confirm config does not execute for invalid commands.
4. Verify the selected database policy: either two-runtime isolation or pre-side-effect singleton rejection, plus external connection preservation, collision behavior, init/shutdown races, rollback, and multi-error cleanup.
5. Verify router/middleware/error-handler ordering and that no mutable internal registry crosses the public boundary.
6. Verify public exports, declarations, README, website docs, examples, packed artifacts, and executable CLI agree.
7. Review request-controlled recursive/collection inputs in this package and explicitly record whether limits are inherited from lower-level packages or need a new bounded task.
8. Record every deferred decision with rationale and residual risk; do not mark blocked acceptance criteria complete.

Acceptance criteria:

- No P0 or P1 finding in this document remains reproducible.
- Every completed task contains changed-file and command/result evidence.
- `pnpm --filter @web-ts-toolkit/access-router-runtime test` passes.
- `pnpm exec eslint "packages/access-router-runtime/**/*.{ts,js,mts}"` passes.
- `pnpm build` and `pnpm test` pass serially.
- Packed ESM/CJS runtime and strict NodeNext/Bundler consumer checks pass.
- If the release artifact includes this package/CLI, `pnpm build-artifact -- --version <test-version>` and `pnpm verify-artifact -- --version <test-version>` pass and the resolved artifact is inspected.
- `git diff --check` passes and no generated cache/temp files or unintended `dist/` changes remain.

Completion evidence:

- Independent review found no reproducible remaining P0/P1 finding in `@web-ts-toolkit/access-router-runtime`: config validation rejects invalid export/model/dev/database shapes before runtime assembly; CLI parsing/env/preload ordering and watch supervisor isolation are behavior-tested; local/serverless builds are relocated, source-removed, and cold-start probed; runtime database ownership uses independent/external connection boundaries; lifecycle startup/shutdown/rollback/multi-error behavior is covered by deterministic tests; generated local artifacts do not register signal handlers on import and shared `start` owns signals; router/post-middleware/finalize/error-handler order is covered; public registries/config are readonly snapshots; app-only helper rejects lifecycle-bearing configs; public exports and docs are aligned.
- Packed ESM/CJS and strict NodeNext/Bundler consumer checks are covered by `packages/access-router-runtime/test/packed-consumer.test.ts`, which uses the real `@repo-toolkit/publish-package` manifest transformation plus `pnpm pack`, runs ESM import and CJS require, compiles strict NodeNext and Bundler consumers with `skipLibCheck: false`, verifies the exported tsconfig subpath, runs the packed CLI, and exercises Mongoose 8 and 9 ownership/lifecycle behavior.
- Release artifact applicability: applicable. `pnpm build-artifact -- --version 0.0.0-arrt12` reported commands including `wtt-access-router-runtime`; inspected `dist/web-ts-toolkit-0.0.0-arrt12.tar.gz` and confirmed `bin/wtt-access-router-runtime`, `artifact-manifest.json`, `packages/access-router-runtime/package.json`, and `packages/access-router-runtime/dist/{cli.js,index.js,index.mjs,index.d.ts,index.d.mts}` are present.
- Request-input boundedness review: this package's request-path work is Express composition and delegation to `access-router` / `express-runtime`; no package-local request-controlled recursive traversal or unbounded collection growth was found. Request body-size enforcement for `start-serverless` is inherited from `express-runtime`; access-control, query, and response-shape bounds are owned by lower-level `access-router` per the task non-goals. No new boundedness task is required for `access-router-runtime` based on this review.
- Deferred decision resolutions reviewed: config exports support default object, synchronous default factory, and named `config` object while rejecting async/thenables; database ownership uses independent per-runtime connections with explicit external connection support; app-only helper is lifecycle-free only; startup/cleanup errors use the documented direct-error/`AggregateError` policy; config-derived watch defaults are not inspected by the supervisor and bare `--watch` uses the CLI default watch path. Residual risk is limited to documented trusted config execution in non-watch dev/build paths and inherited lower-level route/query behavior.
- Verified passing: `pnpm --filter @web-ts-toolkit/access-router-runtime test` passed (11 files, 81 tests); `pnpm exec eslint "packages/access-router-runtime/**/*.{ts,js,mts}"` passed; `pnpm build` passed; `pnpm --filter @web-ts-toolkit/express-oidc-vault-redis-store test` passed after the first full-suite timeout; rerun `pnpm test` passed serially; `pnpm build-artifact -- --version 0.0.0-arrt12` passed with non-fatal pnpm bin-link warnings; `pnpm verify-artifact -- --version 0.0.0-arrt12` passed; `git diff --check` passed.
- Residual test risk: one initial full-suite run timed out in an unrelated Redis-store boundedness test before passing in isolation and on full-suite rerun. This is recorded as a repository-suite stability signal, not an `access-router-runtime` acceptance failure.

## Definition Of Done

- Every non-deferred task is `completed` with concise completion evidence naming changed files, commands, and results.
- Local and serverless build outputs are self-contained, portable, immutable with respect to source config changes, and free of build-machine absolute paths.
- CLI inputs are fully validated and environment/preload setup completes before trusted config execution.
- Watch mode and built-app startup have one clear application/signal lifecycle owner.
- Each runtime uses only its intended database/model resources and closes only resources it owns.
- Init, startup, shutdown, and rollback are deterministic under concurrency and multiple failures.
- Express middleware, generated routers, finalization, and error handling follow the documented shared ordering.
- Invalid and ambiguous config is rejected before side effects, with public types excluding invalid model-definition states.
- Runtime-owned registries are encapsulated and convenience APIs cannot discard required lifecycle behavior.
- Packed ESM, CJS, NodeNext, Bundler, tsconfig-subpath, peer, and CLI consumers are verified.
- Package README, website docs, examples, declarations, and runtime behavior agree.
- Full package, repository, and applicable release-artifact verification passes serially, or any blocker is documented with owner and residual risk.
