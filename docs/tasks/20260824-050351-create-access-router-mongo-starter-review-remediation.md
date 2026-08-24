# Create Access Router Mongo Starter Review Remediation

Created: 2026-08-24 05:03:51 PDT

Package: `packages/create-access-router-mongo-starter`

## Objective

Remediate confirmed local-data-loss, credential-handling, packed-template, generated-project, deployment-ordering, API-validation, data-integrity, frontend-reliability, and testability gaps in `create-access-router-mongo-starter`. Preserve the package's role as a small MongoDB CRUD starter while making scaffolding and deployment safe to automate, generated projects reproducible and usable from the installed npm artifact, and the intentionally public demo boundary explicit and bounded.

## Scope And Working Rules

- Add a focused regression that fails on the current implementation before each behavioral fix.
- Treat scaffold destinations, sandbox paths, names, titles, database names, deploy options, environment variables, API request bodies, filters, IDs, and root operations as untrusted input.
- Validate paths before any delete, copy, build, site creation, environment mutation, or deploy operation.
- Keep prompts and planning side-effect free. Remote and destructive work belongs in an explicit execution phase after preflight.
- Never place `MONGODB_URI` or `NETLIFY_AUTH_TOKEN` in logs, frontend build environments, or child-process arguments.
- Do not edit `dist/` manually. Rebuild it from source and verify the packed artifact.
- Preserve the runtime's existing request-complexity defaults, 1 MiB parser default, list hard limit, isolated Mongoose connection, local shutdown, and warm serverless connection reuse unless a failing test demonstrates a reason to change them.
- Keep generated-user documentation separate from template-maintainer guidance where placeholder substitution would make the latter misleading.
- Update source template, staged template, generated-project tests, README, website docs, and `.agents` guidance together when their contract changes.
- Preserve unrelated worktree changes and never revert another agent's work. At review time, `packages/json-frame/test/parse/parse.test.ts` was already modified and is outside this plan.
- Run package tests and builds serially. Importing the current staging module rewrites `dist/template`, and repository guidance prohibits overlapping builds that share generated outputs.

## Non-Goals

- Do not turn the starter into a complete authentication, authorization, tenancy, rate-limiting, or production operations framework.
- Do not claim the public demo is production-safe merely because input bounds are added.
- Do not add compatibility aliases for unsafe path, secret, or validation behavior without a concrete shipped-consumer requirement.
- Do not replace the existing access-router/runtime abstractions with custom Express or MongoDB infrastructure.
- Do not add frontend memoization or cache complexity without a measured need; the current 100-item ceiling makes category-map allocation negligible.
- Do not promise atomic coordination between Netlify API mutations and deployment. Make side effects ordered, minimized, and observable instead.
- Do not introduce a lockfile policy without deciding whether generated projects are intended to be release-reproducible.

## Review Baseline

Confirmed on 2026-08-24 before this task file was created:

- `pnpm --filter create-access-router-mongo-starter test`: passed, 6 files and 72 tests.
- `pnpm --filter create-access-router-mongo-starter typecheck`: passed.
- `pnpm exec eslint "packages/create-access-router-mongo-starter/**/*.{ts,tsx,js}"`: passed.
- `pnpm --dir packages/create-access-router-mongo-starter/template exec vitest run`: passed, 1 file and 2 tests.
- `pnpm --dir packages/create-access-router-mongo-starter/template typecheck`: could not start because pnpm attempted dependency reconciliation and rejected `@web-ts-toolkit/access-router@^{{VERSION}}`. Direct TypeScript execution then reported that `@web-ts-toolkit/access-router-runtime` was missing from the installed template dependencies. This is consistent with the stale lockfile importer.
- `npm pack --dry-run --json` from the package directory succeeded with 44 entries, 105,232 packed bytes, and 397,885 unpacked bytes.
- The dry-run tarball did not contain `dist/template/.gitignore`, even though the source template contains it. npm excludes or transforms nested `.gitignore` files during packing.
- The tarball contained `dist/template/pnpm-lock.yaml` at 273,127 bytes, but the scaffold CLI excludes that lockfile from generated projects.
- The template lockfile pins only three access-router packages, omits declared `@web-ts-toolkit/access-router-runtime`, and contains undeclared `@web-ts-toolkit/express-runtime`; the manifest uses `^{{VERSION}}` placeholders.
- The current tests cover runtime path lookup, helper-level deploy behavior, redaction formatting, Netlify API helpers, API base-path normalization, and staging predicates. They do not execute a packed-installed CLI, destructive scaffold paths, full deployment ordering, generated backend routes, or failed frontend mutations.
- `git diff --check`: passed.

## Priorities

- P0: plausible local data loss, sandbox escape, credential disclosure/misclassification, published scaffolds that omit secret-protection files, or public validation bypasses.
- P1: broken documented deployments, unexpected remote mutations, generated-project corruption, backend error disclosure, missing required configuration, or persistent data-integrity defects.
- P2: portability, reproducibility, accessibility, type ownership, test isolation, maintainability, or bounded performance gaps.
- P3: optional optimization or policy expansion requiring maintainer input or measurements.

## Wave 0: Safety And Artifact Test Seams

### Task CARMS-01: Add Isolated CLI, Deployment, And Packed-Consumer Harnesses

Status: pending

Priority: P1

Suggested agent: CLI integration and npm artifact test specialist

Dependencies: none

Primary ownership:

- new helpers under `packages/create-access-router-mongo-starter/tests/support/`
- new package tests under `packages/create-access-router-mongo-starter/tests/`
- `packages/create-access-router-mongo-starter/vitest.config.ts` only as required
- package test scripts only as required

Finding:

The existing 72 package tests exercise useful pure helpers but do not run a complete scaffold, inspect mutations after failures, execute all three bins from a release-like tarball, or assert deployment call ordering. Importing `scripts/stage-template.ts` also rewrites `dist/template`, so tests are not currently isolated from shared build output.

References:

- `packages/create-access-router-mongo-starter/tests/stage-template.test.ts:1-60`
- `packages/create-access-router-mongo-starter/tests/deploy-shared.test.ts:18-110`
- `packages/create-access-router-mongo-starter/tests/deploy-netlify.test.ts:13-118`
- `packages/create-access-router-mongo-starter/vitest.config.ts:3-7`
- `packages/create-access-router-mongo-starter/package.json:23-36`

Implementation requirements:

1. Provide per-test temporary source, target, sandbox, fake executable, and consumer directories with deterministic cleanup.
2. Add a process-level CLI harness that captures exit status, stdout, stderr, child arguments, child environments, and filesystem changes without invoking live Netlify APIs.
3. Add injectable filesystem, runner, prompt, logger, and Netlify API seams at orchestration boundaries rather than exporting every internal helper.
4. Add a release-like pack/install harness using the repository's real publication transformation rather than treating raw placeholder metadata as final.
5. Execute installed package-name bins from the consumer directory and assert executable modes/shebang behavior.
6. Keep live network and external MongoDB access out of the default package suite.
7. Do not run tests that rewrite shared `dist/template` concurrently.

Acceptance criteria:

- Tests can prove that a failed scaffold or deploy made no forbidden filesystem or remote mutation.
- Tests can inspect secret absence from child `argv` and unrelated child environments.
- A release-like tarball is installed into a fresh consumer and all three bins can be invoked.
- Temporary files and fake executables are removed after success and failure.
- Existing package tests remain deterministic when run repeatedly.
- `pnpm --filter create-access-router-mongo-starter test` passes.

## Wave 1: Local Data And Credential Safety

### Task CARMS-02: Prevent Destructive Scaffold Targets And Make Replacement Transactional

Status: pending

Priority: P0

Suggested agent: filesystem safety and transactional scaffolding specialist

Dependencies: CARMS-01

Primary ownership:

- `packages/create-access-router-mongo-starter/src/cli.ts`
- focused scaffold filesystem tests

Finding:

The resolved target is recursively removed when `--force` is present, without rejecting filesystem roots, the current directory, home, the template itself, or source/target ancestor relationships. A target below the template can recursively copy itself, while a target equal to or above the template can remove the source. Existing content is deleted before copy and rewrite have succeeded.

References:

- `packages/create-access-router-mongo-starter/src/cli.ts:160-186`
- `packages/create-access-router-mongo-starter/src/cli.ts:298`
- `packages/create-access-router-mongo-starter/src/cli.ts:313-323`

Implementation requirements:

1. Canonicalize existing ancestors and compare source/target relationships before mutation, including symlinked paths.
2. Reject filesystem roots, the current working directory, the template directory, and either source/target ancestor relationship.
3. Define and test whether home-directory replacement is always prohibited or requires a stronger explicit safeguard.
4. Build the scaffold in a sibling temporary directory and complete validation there.
5. Replace the destination only after copy, rewrite, placeholder, and critical-file validation pass; restore or preserve the old target on failure.
6. Use `lstat` semantics and an explicit symlink policy so cycles and links outside the template cannot escape traversal.
7. Quote the displayed `cd` command safely for paths containing spaces or shell metacharacters.

Acceptance criteria:

- `/`, the current directory, template source, template ancestors/descendants, and symlink aliases are rejected before deletion or copy.
- A simulated copy or rewrite failure leaves an existing target byte-for-byte unchanged.
- A valid `--force` replacement completes without leaving temporary or backup directories.
- A generated target containing spaces receives a safe, usable next-step command.
- Regressions fail against the pre-fix implementation and package tests pass.

### Task CARMS-03: Contain Sandbox Outputs And Use Portable Temporary Directories

Status: pending

Priority: P0

Suggested agent: path traversal and cross-platform Node specialist

Dependencies: CARMS-01

Primary ownership:

- `packages/create-access-router-mongo-starter/scripts/deploy-shared.ts`
- path resolution and sandbox cleanup tests
- deploy help text describing ephemeral paths

Finding:

`distDir` and `functionsDir` are resolved against the deploy directory without rejecting absolute paths or `..`. The frontend path is passed to Vite with `--emptyOutDir`, so a sandboxed build can empty an unrelated location. Ephemeral mode is hard-coded to `/tmp/opencode`, whose existence and portability are not guaranteed.

References:

- `packages/create-access-router-mongo-starter/scripts/deploy-shared.ts:26-27`
- `packages/create-access-router-mongo-starter/scripts/deploy-shared.ts:92-127`
- `packages/create-access-router-mongo-starter/scripts/deploy-shared.ts:244-265`
- `packages/create-access-router-mongo-starter/tests/deploy-shared.test.ts:29-55`

Implementation requirements:

1. Require output options to be non-empty relative paths in sandbox modes.
2. Canonicalize the nearest existing ancestors and ensure final outputs remain strict descendants of `deployDir`; account for symlink escapes.
3. Reject output paths equal to the project or sandbox root.
4. Use `node:os.tmpdir()` with a package-specific `mkdtemp` prefix.
5. Ensure cleanup only removes directories created by this invocation and never follows a replaced symlink.
6. Apply the same containment contract to frontend and serverless output.

Acceptance criteria:

- Absolute, traversal, root-equivalent, and symlink-escape output paths fail before Vite or runtime builders run.
- Valid nested relative paths remain supported.
- Tests prove no outside sentinel file is changed by rejected input or cleanup.
- Ephemeral mode works without a pre-existing `/tmp/opencode` and uses the platform temp root.
- Package tests pass on supported platforms.

### Task CARMS-04: Minimize And Correctly Classify Deployment Secrets

Status: pending

Priority: P0

Suggested agent: credential-boundary and Netlify API specialist

Dependencies: CARMS-01

Primary ownership:

- `packages/create-access-router-mongo-starter/scripts/deploy-shared.ts`
- `packages/create-access-router-mongo-starter/scripts/deploy-netlify.ts`
- `packages/create-access-router-mongo-starter/scripts/netlify-api.ts`
- focused command/environment and Netlify payload tests
- secret-handling deployment documentation

Finding:

New environment variables are created with `is_secret: false`, including `MONGODB_URI`. Existing paid-tier variables have their value changed but their broad scope is not reconciled. The Netlify token is appended to child `argv`, and one inherited build environment gives the Mongo URI and all parent secrets to Vite, the backend builder, and the deploy CLI.

References:

- `packages/create-access-router-mongo-starter/scripts/netlify-api.ts:331-349`
- `packages/create-access-router-mongo-starter/scripts/deploy-netlify.ts:720-780`
- `packages/create-access-router-mongo-starter/scripts/deploy-shared.ts:202-220`
- `packages/create-access-router-mongo-starter/scripts/deploy-shared.ts:231-265`
- `packages/create-access-router-mongo-starter/template/README.md:95-123`

Implementation requirements:

1. Add sensitivity to the environment-variable plan: `MONGODB_URI` is secret and `API_BASE_URL` is not.
2. Reconcile existing variable scope and secret metadata when the Netlify API supports it; otherwise fail or emit an explicit residual-risk migration instruction.
3. Supply auth to the Netlify CLI through `NETLIFY_AUTH_TOKEN`, not `--auth`.
4. Construct separate least-privilege environments for frontend build, backend build, and deploy. The frontend and deploy processes must not receive `MONGODB_URI`.
5. Decide which parent variables must be inherited; prefer a documented allowlist plus platform essentials over spreading all of `process.env`.
6. Keep log redaction as defense in depth and ensure thrown command errors use redacted command displays.
7. Stop recommending Mongo credentials as ordinary CLI arguments where environment or secure prompt input is supported.

Acceptance criteria:

- New Mongo variables are created as secret; API path variables remain non-secret.
- Existing paid-tier Mongo variables are narrowed to functions scope or produce a precise unsupported-migration result.
- Auth tokens and Mongo URIs never appear in logs or child-process argument arrays.
- Vite and Netlify deploy child environments contain no Mongo URI.
- Exact Netlify request bodies and child environments are asserted in regression tests.
- Package tests pass.

## Wave 2: Published And Generated Project Integrity

### Task CARMS-05: Preserve Git Ignore Protection In Packed Scaffolds

Status: pending

Priority: P0

Suggested agent: npm packaging and scaffold artifact specialist

Dependencies: CARMS-01

Primary ownership:

- `packages/create-access-router-mongo-starter/scripts/stage-template.ts`
- `packages/create-access-router-mongo-starter/src/cli.ts`
- package file lists and packed-consumer tests

Finding:

The source template's `.gitignore` protects `.env`, dependencies, build output, generated functions, and Netlify state. The staging copy contains it, but `npm pack --dry-run --json` omits `dist/template/.gitignore`. Consumers running the installed CLI can therefore generate a project without secret and build-output ignore rules.

References:

- `packages/create-access-router-mongo-starter/template/.gitignore:10-21`
- `packages/create-access-router-mongo-starter/template/.gitignore:35`
- `packages/create-access-router-mongo-starter/scripts/stage-template.ts:26-33`
- `packages/create-access-router-mongo-starter/package.json:33-36`

Implementation requirements:

1. Stage `.gitignore` under an npm-safe name such as `_gitignore` and rename it only while scaffolding.
2. Ensure the safe staging name cannot overwrite an unrelated template file.
3. Verify the installed tarball, not only the source and local `dist`, contains the staged ignore content.
4. Assert the generated project contains `.gitignore` with `.env`, `node_modules`, `dist`, serverless output, and `.netlify` protections.
5. Document the staging rename in maintainer guidance, not generated-user instructions.

Acceptance criteria:

- A release-like packed install generates a `.gitignore` with all source protections.
- No staging alias remains in the generated project.
- A file allowlist test catches future npm omission or renaming.
- Package tests and packed-consumer tests pass.

### Task CARMS-06: Establish A Reproducible Dependency And Publication Contract

Status: pending

Priority: P1

Suggested agent: pnpm lockfile and release-pipeline specialist

Dependencies: CARMS-01, maintainer decision D-01

Primary ownership:

- `packages/create-access-router-mongo-starter/template/package.json`
- `packages/create-access-router-mongo-starter/template/pnpm-lock.yaml`
- staging/release scripts as required
- `packages/create-access-router-mongo-starter/package.json`
- packed generated-project smoke tests
- package and website release documentation

Finding:

The source/staged lockfile disagrees with the template manifest, occupies 273,127 unpacked tarball bytes, and is then excluded by the scaffold CLI. Generated projects use broad caret ranges without a lockfile, so the same generator release can install dependency versions that were never tested together. Direct template typecheck currently cannot reconcile the placeholder manifest and stale lockfile.

References:

- `packages/create-access-router-mongo-starter/src/cli.ts:48-57`
- `packages/create-access-router-mongo-starter/template/package.json:20-60`
- `packages/create-access-router-mongo-starter/template/pnpm-lock.yaml:23-31`
- `packages/create-access-router-mongo-starter/template/pnpm-lock.yaml:90-92`
- `packages/create-access-router-mongo-starter/package.json:28-36`

Implementation requirements:

1. If D-01 selects reproducible scaffolds, generate a release-version-specific manifest and synchronized lockfile during staging, then include both in generated projects.
2. If D-01 selects intentionally unlocked scaffolds, remove the stale source/staged lockfile and document that dependency resolution varies over time; still smoke-test fresh install against the release.
3. Add `engines.node` and `packageManager` metadata matching tested generated-project requirements.
4. Make package-local packing use the repository's publication transformation or fail clearly when placeholder metadata/stale `dist` would be published directly.
5. Verify final metadata, LICENSE, README, bins, staged template, and absence of unintended files from the release-like artifact.
6. Run frozen installation when a lockfile is shipped.
7. Build, typecheck, lint, and run tests in the generated project after install.

Acceptance criteria:

- Template manifest and lockfile importers agree, or no lockfile is shipped anywhere.
- `@web-ts-toolkit/access-router-runtime` is installed and no undeclared direct dependency remains in the importer.
- A fresh generated app installs and passes documented checks using the declared Node/pnpm contract.
- Direct stale/placeholder publication cannot silently succeed.
- Packed artifact size/file assertions reflect the selected lockfile policy.
- Package and packed-consumer tests pass.

### Task CARMS-07: Validate And Serialize Scaffold Values By Output Context

Status: pending

Priority: P1

Suggested agent: secure code-generation and input-validation specialist

Dependencies: CARMS-02

Primary ownership:

- `packages/create-access-router-mongo-starter/src/cli.ts`
- placeholder-bearing files under `packages/create-access-router-mongo-starter/template/`
- scaffold generation tests
- placeholder documentation

Finding:

The CLI accepts arbitrary non-empty strings and globally replaces the same raw values in JSON, TypeScript, JSX, HTML, Markdown, and `.env` contexts. Quotes, newlines, markup, URI delimiters, or invalid npm/database-name characters can corrupt generated files or inject unintended generated code. Every copied file is also decoded as UTF-8, which is unsafe for future binary assets. Literal placeholder examples in generated docs are rewritten into misleading text.

References:

- `packages/create-access-router-mongo-starter/src/cli.ts:98-145`
- `packages/create-access-router-mongo-starter/src/cli.ts:189-207`
- `packages/create-access-router-mongo-starter/src/cli.ts:218-273`
- `packages/create-access-router-mongo-starter/src/cli.ts:325-332`
- `packages/create-access-router-mongo-starter/template/package.json:2`
- `packages/create-access-router-mongo-starter/template/index.html:7`
- `packages/create-access-router-mongo-starter/template/api/src/config.ts:3`

Implementation requirements:

1. Validate package names against the supported npm naming contract and database names against documented MongoDB constraints.
2. Treat display title as free-form but serialize it separately for every output syntax.
3. Parse and write JSON structurally; generate TypeScript/JSX string literals with a real serializer; HTML-escape title text; encode URI components where needed.
4. Replace only an explicit manifest of placeholder-bearing text files, not every copied file.
5. Fail before destination replacement when package-version metadata cannot be resolved; remove sentinel fallback versions.
6. Assert no unresolved operational placeholder remains while preserving intentionally literal maintainer documentation or removing it from generated output.
7. Keep Unicode behavior explicit and tested rather than rejecting it accidentally.

Acceptance criteria:

- Quotes, backslashes, newlines, HTML metacharacters, scoped names, Unicode titles, and URI delimiters either generate valid intended content or receive a precise validation error.
- Generated JSON parses and generated TypeScript/JSX typechecks.
- Binary fixtures are copied byte-for-byte and never decoded for replacement.
- No `not_found_*` dependency version or unresolved operational token can reach a generated project.
- Package tests pass.

## Wave 3: Predictable Deployment Lifecycle

### Task CARMS-08: Separate Deploy Collection, Validation, Planning, And Execution

Status: pending

Priority: P1

Suggested agent: deployment orchestration and side-effect lifecycle specialist

Dependencies: CARMS-03, CARMS-04

Primary ownership:

- `packages/create-access-router-mongo-starter/scripts/deploy-netlify.ts`
- `packages/create-access-router-mongo-starter/scripts/deploy-shared.ts`
- orchestration and failure-path tests

Finding:

Interactive site-name collection can create a remote site before later prompts complete. Noninteractive site creation occurs before required production Mongo configuration is rejected, and builds occur before Netlify CLI availability is checked. Cancellation or preflight failure can therefore leave orphan sites or waste builds. Core helpers also call `process.exit`, limiting cleanup and testability.

References:

- `packages/create-access-router-mongo-starter/scripts/deploy-netlify.ts:489-607`
- `packages/create-access-router-mongo-starter/scripts/deploy-netlify.ts:614-710`
- `packages/create-access-router-mongo-starter/scripts/deploy-netlify.ts:821-835`
- `packages/create-access-router-mongo-starter/scripts/deploy-shared.ts:384-398`

Implementation requirements:

1. Collect prompts without filesystem or network mutation and return discriminated help/cancel/options results.
2. Centralize validation after CLI and interactive collection so both paths enforce site names, contexts, aliases, function names, API paths, Mongo requirements, and path containment identically.
3. Define phases: parse/collect, validate, resolve/check tools, inspect inputs/artifacts, build, resolve/create site, mutate environment, deploy, report/cleanup.
4. Ensure missing configuration, invalid paths, cancellation, and missing tools occur before site creation or environment mutation.
5. Make `--no-build` verify required frontend and function artifacts instead of reporting unconditional success.
6. Return exit codes from testable core functions; keep `process.exitCode` in thin entrypoints.
7. Record which remote mutations completed and report residual state accurately after failures. Do not promise rollback that Netlify cannot guarantee.
8. Bound site pagination and avoid caching one API client across different auth tokens.

Acceptance criteria:

- Cancellation at every prompt performs no remote mutation.
- Missing Mongo configuration, invalid paths/site names, or missing CLI creates no site and changes no environment variable.
- Tool checks occur before expensive builds; remote creation occurs only after local preflight/build success.
- `--no-build` rejects missing or empty required artifacts.
- Two tokens in one process cannot reuse the first token's client.
- Full orchestration order and cleanup behavior are asserted with injected fakes.
- Package tests pass.

### Task CARMS-09: Generate And Verify Safe Netlify Configuration

Status: pending

Priority: P2

Suggested agent: Netlify configuration and TOML specialist

Dependencies: CARMS-03, CARMS-08

Primary ownership:

- Netlify state/TOML helpers in `packages/create-access-router-mongo-starter/scripts/deploy-netlify.ts`
- focused configuration parser tests

Finding:

User-controlled path values are interpolated into quoted TOML without escaping, so quotes, newlines, and Windows backslashes can produce invalid configuration. Environment verification checks only key presence, while success output implies the requested context/scope/value is present. State and TOML helpers are private and lack focused behavior tests.

References:

- `packages/create-access-router-mongo-starter/scripts/deploy-netlify.ts:193-213`
- `packages/create-access-router-mongo-starter/scripts/netlify-api.ts:371-390`
- `packages/create-access-router-mongo-starter/tests/netlify-api.test.ts:280-420`

Implementation requirements:

1. Serialize TOML values with a maintained writer or a fully tested basic-string serializer after path validation.
2. Parse generated TOML in tests and assert publish, functions, redirect, and SPA fallback values.
3. Handle malformed existing `.netlify/state.json` and `netlify.toml` with controlled errors; do not silently destroy unrelated configuration.
4. Verify environment context, scope, and sensitivity where the API exposes them; otherwise weaken the success message to the evidence actually available.
5. Preserve user-owned configuration unless an explicit generated section can be updated safely.

Acceptance criteria:

- Quotes, backslashes, spaces, and rejected newline/path values cannot alter TOML structure.
- Generated TOML parses and routes the configured function/API path correctly.
- Verification cannot report functions-only secret configuration based solely on key presence.
- Existing unrelated Netlify configuration remains intact or the operation stops with a precise conflict.
- Package tests pass.

## Wave 4: Generated Backend Correctness And Security

### Task CARMS-10: Enforce One Validation Contract Across Exposed API Paths

Status: pending

Priority: P0

Suggested agent: access-router API security and Zod contract specialist

Dependencies: CARMS-01, maintainer decision D-02

Primary ownership:

- `packages/create-access-router-mongo-starter/template/api/src/routers.ts`
- shared transport schemas introduced for the template
- backend route contract tests
- public route documentation

Finding:

Normal create/update routes have Zod schemas, but public advanced mutation routes use separate unset schemas, and the public root router dispatches to services outside the model router schema layer. Callers authorized by `OPEN_ACCESS` can therefore reach equivalent writes with different validation, coercion, and bulk behavior. The `as unknown as` option casts suppress type feedback that could expose drift.

References:

- `packages/create-access-router-mongo-starter/template/api/src/routers.ts:6-57`
- `packages/access-router/src/routers/model-router-collection-routes.ts:140-168`
- `packages/access-router/src/routers/model-router-document-routes.ts:230-260`
- `packages/access-router/src/routers/root-router.ts:79-120`
- `packages/access-router/src/routers/root-router.ts:233-254`

Implementation requirements:

1. If D-02 keeps root/advanced mutation routes, apply equivalent shared entity validation and explicit bulk bounds to every write path.
2. Otherwise disable those routes in the basic starter and document how an advanced user opts in safely.
3. Normalize whitespace before minimum-length checks and set explicit maximum lengths and color-format rules.
4. Add one reusable ObjectId validator for path IDs and `categoryId` inputs.
5. Replace double assertions with `satisfies`, a typed factory, or corrected upstream-compatible types.
6. Keep server validation authoritative and infer browser-safe request DTO types from shared schemas where practical.
7. Make malformed ID, validation, missing-record, and conflict status semantics explicit.

Acceptance criteria:

- The same invalid payload cannot succeed through normal, advanced, or root routes.
- Whitespace-only and oversized title/name values, malformed colors, malformed ObjectIds, and oversized batches receive stable client errors before Mongoose operations.
- TypeScript checks router options without `as unknown as`.
- Public route surface and limits are accurately documented.
- Backend route and generated-project tests pass.

### Task CARMS-11: Fail Fast On Mongo Configuration And Sanitize API Errors

Status: pending

Priority: P1

Suggested agent: backend runtime and error-boundary specialist

Dependencies: CARMS-10

Primary ownership:

- `packages/create-access-router-mongo-starter/template/api/access-router.config.ts`
- `packages/create-access-router-mongo-starter/template/api/src/config.ts`
- `packages/create-access-router-mongo-starter/template/api/src/errors.ts`
- runtime/serverless integration tests
- deployment Mongo requirement documentation

Finding:

`MONGODB_URI` is documented as required but absent values allow runtime startup with a disconnected Mongoose connection. Preview deployment also permits omission. Route-level access-router response handling can format raw Mongoose errors before the template's final Express error handler sees them, so `CastError`, validation, or duplicate-key details can reach callers. `AppError` is otherwise unused infrastructure.

References:

- `packages/create-access-router-mongo-starter/template/api/access-router.config.ts:7-11`
- `packages/create-access-router-mongo-starter/template/api/access-router.config.ts:31-38`
- `packages/create-access-router-mongo-starter/template/api/src/errors.ts:1-9`
- `packages/create-access-router-mongo-starter/scripts/deploy-netlify.ts:584-596`
- `packages/create-access-router-mongo-starter/scripts/deploy-netlify.ts:677-685`
- `packages/access-router/src/routers/index.ts:34-43`

Implementation requirements:

1. Reject missing, blank, or malformed Mongo configuration before the local server listens or the serverless handler accepts a request.
2. Require Mongo configuration for every deployment containing the backend unless an explicit frontend-only mode is designed and tested.
3. Configure the response boundary actually used by access-router routes to map expected validation, cast, and duplicate-key failures to stable public codes/messages.
4. Log structured internal details server-side without credentials, full rejected bodies, or duplicated stack logging.
5. Ensure unknown responses contain no raw Mongo/Mongoose messages, URI fragments, collection names, stack traces, or rejected secret values.
6. Remove `AppError` if it remains unused, or integrate it at the real response boundary.
7. Add local and serverless parity tests, including recovery/behavior after transient initialization failure.

Acceptance criteria:

- Missing/blank Mongo URI prevents startup with one actionable configuration error.
- Malformed IDs and validation failures return the selected stable 4xx contract; unexpected errors return a generic 500.
- Error response tests prove internal persistence details are absent.
- Local and serverless entry paths expose the same routes and error semantics.
- Backend integration and generated-project tests pass.

### Task CARMS-12: Define Public Demo And Referential Integrity Policies

Status: pending

Priority: P1

Suggested agent: application security and MongoDB data-integrity specialist

Dependencies: CARMS-10, maintainer decisions D-03 and D-04

Primary ownership:

- `packages/create-access-router-mongo-starter/template/api/src/models.ts`
- `packages/create-access-router-mongo-starter/template/api/src/routers.ts`
- deployment prompts/documentation
- MongoDB integration tests

Finding:

All Todo and Category CRUD operations are intentionally anonymous, and deployment instructions make the application Internet-accessible before clearly warning that anyone can mutate or delete all data. `Todo.categoryId` is only a Mongoose reference: writes accept nonexistent IDs and category deletion leaves dangling references. There is no documented uniqueness policy, rate limiting, or production-mode boundary.

References:

- `packages/create-access-router-mongo-starter/template/api/src/models.ts:3-15`
- `packages/create-access-router-mongo-starter/template/api/src/routers.ts:6-57`
- `packages/create-access-router-mongo-starter/template/README.md:85-123`
- `packages/create-access-router-mongo-starter/template/README.md:155-160`
- `packages/create-access-router-mongo-starter/template/src/pages/home-page.tsx:165-176`

Implementation requirements:

1. Implement D-03 as an explicit starter mode or contract; do not silently imply authentication exists.
2. If public write remains the default, place a prominent warning before deployment, require explicit production acknowledgement, and document host-level rate limiting/abuse controls.
3. Implement D-04 consistently for category creation/reference/deletion, using a transaction where multi-document mutation is selected.
4. Validate category existence on Todo writes when dangling references are disallowed.
5. Decide and enforce whether category names are unique.
6. Add deterministic sort/index behavior for documented list order and allowed filters only after query expectations are defined.
7. Keep demo list/root limits explicit in user documentation.

Acceptance criteria:

- A user cannot reach production deployment without seeing or explicitly acknowledging the selected anonymous-write contract.
- Category reference creation and deletion follow one documented policy under normal and racing requests.
- No UI refresh can hide a server-side dangling-reference failure as success.
- Public API limits and production responsibilities are visible before deployment commands.
- MongoDB integration tests and generated-project tests pass.

### Task CARMS-13: Align API Base Path, Port, And Deployment Configuration

Status: pending

Priority: P1

Suggested agent: Vite/runtime configuration integration specialist

Dependencies: CARMS-08, maintainer decision D-05

Primary ownership:

- `packages/create-access-router-mongo-starter/template/vite.config.ts`
- `packages/create-access-router-mongo-starter/template/src/api.ts`
- `packages/create-access-router-mongo-starter/template/src/shared/normalize-api-base-url.ts`
- `packages/create-access-router-mongo-starter/template/api/src/config.ts`
- template scripts, deploy helpers, env example, and docs
- configuration/build integration tests

Finding:

Documentation describes `VITE_API_BASE_URL` as a frontend override, but Vite and the client prefer `API_BASE_URL`. A documented `.env` containing `/api` can therefore override the Netlify helper's injected `/.netlify/functions/main`, producing a frontend pointed at the wrong route. The normalizer turns an absolute URL into a malformed path. `PORT` and `HOST` are exported but unused while scripts hard-code port 8000.

References:

- `packages/create-access-router-mongo-starter/template/vite.config.ts:8-15`
- `packages/create-access-router-mongo-starter/template/src/api.ts:5-11`
- `packages/create-access-router-mongo-starter/template/src/shared/normalize-api-base-url.ts:1-4`
- `packages/create-access-router-mongo-starter/template/api/src/config.ts:3-7`
- `packages/create-access-router-mongo-starter/template/package.json:15-18`
- `packages/create-access-router-mongo-starter/template/README.md:65-70`

Implementation requirements:

1. Implement D-05 consistently across frontend, backend, Vite proxy, deploy build, runtime environment, `.env.example`, docs, and agent guidance.
2. If the contract is path-only, reject schemes, authorities, queries, fragments, backslashes, and dot segments. If absolute origins are supported, use URL-aware joining rather than path prefixing.
3. Ensure deploy builds override or clear conflicting ambient/env-file values deterministically.
4. Either wire `PORT`/`HOST` into startup without conflicting fixed flags or remove the dead options and correct docs.
5. Test conflicting environment values through a real Vite build and local/serverless route request.

Acceptance criteria:

- A Netlify build with `.env` set to `/api` still targets the selected deployed function path.
- Supported base values normalize predictably; unsupported forms fail before build/startup.
- Frontend requests and backend mounts agree in local, preview, production, and serverless tests.
- Documented `PORT` behavior matches actual process binding.
- Generated-project build and tests pass.

## Wave 5: Frontend Reliability, Accessibility, And Ownership

### Task CARMS-14: Preserve UI State Across Failed And Pending Mutations

Status: pending

Priority: P2

Suggested agent: React async-state and interaction-test specialist

Dependencies: CARMS-10, CARMS-12

Primary ownership:

- `packages/create-access-router-mongo-starter/template/src/pages/home-page.tsx`
- `packages/create-access-router-mongo-starter/template/src/pages/todo-form.tsx`
- focused component/integration tests

Finding:

The UI does not render query or mutation errors. Edit state closes immediately after mutation invocation, category input clears before success, and most controls remain active while mutations are pending. Failures can look successful, user input is lost, and repeated actions can issue duplicates or conflicts.

References:

- `packages/create-access-router-mongo-starter/template/src/pages/home-page.tsx:35-89`
- `packages/create-access-router-mongo-starter/template/src/pages/home-page.tsx:111-196`
- `packages/create-access-router-mongo-starter/template/tests/todo-form.test.tsx:6-35`

Implementation requirements:

1. Keep edit/create input and dialog state until server success.
2. Render actionable query and mutation errors without exposing raw server internals.
3. Disable or serialize conflicting controls while their mutation is pending.
4. Ensure refetch/cache update failure cannot silently report mutation success.
5. Define and display the 100-record demo truncation or add pagination; do not silently imply a complete list.
6. Use the access-router React package's recommended cache strategy; avoid speculative custom caching.

Acceptance criteria:

- Rejected create/update/delete operations retain recoverable user state and show an accessible error.
- Repeated clicks while pending do not submit duplicate mutations.
- Successful operations close/reset UI only after confirmation and refresh the required related data.
- The list cap is visible or navigation exposes all records.
- Frontend tests cover loading, empty, success, rejection, pending, and retry states.

### Task CARMS-15: Add Accessible Names, Validation Relationships, And Status Semantics

Status: pending

Priority: P2

Suggested agent: frontend accessibility and Testing Library specialist

Dependencies: CARMS-14

Primary ownership:

- `packages/create-access-router-mongo-starter/template/src/pages/home-page.tsx`
- `packages/create-access-router-mongo-starter/template/src/pages/todo-form.tsx`
- accessibility-focused tests

Finding:

Todo completion checkboxes have no associated accessible names, repeated delete buttons do not identify their item, validation text is not linked with `aria-describedby`/`aria-invalid`, and loading/error updates lack status/live-region semantics.

References:

- `packages/create-access-router-mongo-starter/template/src/pages/home-page.tsx:116-180`
- `packages/create-access-router-mongo-starter/template/src/pages/todo-form.tsx:34-61`

Implementation requirements:

1. Give each checkbox and destructive action an item-specific accessible name.
2. Associate validation descriptions with inputs and expose invalid state.
3. Use appropriate status/alert semantics for loading, saved, and failed transitions without excessive announcements.
4. Restore or move focus predictably after edit, cancel, delete, and error outcomes.
5. Prefer semantic controls and labels over test-only ARIA additions.

Acceptance criteria:

- Testing Library can locate every action by a unique user-facing accessible name.
- Validation errors are programmatically associated with their fields.
- Async state changes are announced and keyboard focus remains usable.
- Automated accessibility-focused tests cover the primary CRUD flow.
- Template tests pass.

### Task CARMS-16: Consolidate Shared DTOs And Injectable Frontend Boundaries

Status: pending

Priority: P2

Suggested agent: TypeScript contract and React testability specialist

Dependencies: CARMS-10, CARMS-14

Primary ownership:

- browser-safe shared schema/type module under the template
- `packages/create-access-router-mongo-starter/template/src/types.ts`
- `packages/create-access-router-mongo-starter/template/src/api.ts`
- `packages/create-access-router-mongo-starter/template/src/pages/home-page.tsx`
- strict type and component tests

Finding:

Mongoose records, backend request schemas, frontend form schemas, and client interfaces independently describe the same entities. Persisted `_id` is optional in frontend types and repeatedly asserted as `string`. `HomePage` combines singleton service creation, network state, cache refresh, form state, and rendering, making failure-path tests difficult.

References:

- `packages/create-access-router-mongo-starter/template/api/src/models.ts:3-18`
- `packages/create-access-router-mongo-starter/template/api/src/routers.ts:8-35`
- `packages/create-access-router-mongo-starter/template/src/types.ts:1-16`
- `packages/create-access-router-mongo-starter/template/src/api.ts:9-23`
- `packages/create-access-router-mongo-starter/template/src/pages/home-page.tsx:14-89`

Implementation requirements:

1. Introduce browser-safe shared transport schemas and infer create/update/response DTOs from them.
2. Keep Mongoose persistence details separate; distinguish persisted records with required IDs from create inputs.
3. Remove routine `as string` and double assertions by fixing type ownership.
4. Provide a small page-level data/controller seam or service/provider injection point suitable for tests.
5. Extract UI units only where they gain independent behavior or tests; do not fragment trivial markup.
6. Keep module-scope hook/service creation only if it remains safely replaceable in tests.

Acceptance criteria:

- Frontend and backend compile against one transport contract for shared fields and bounds.
- Persisted entities require IDs without casts, while create inputs do not pretend to have them.
- Page behavior can be tested with injected deterministic services/errors.
- No broad `any` or `unknown` assertion replaces the removed casts.
- Generated-project typecheck and tests pass.

## Wave 6: Staging, Documentation, And Maintenance

### Task CARMS-17: Make Template Staging Import-Safe And Policies Explicit

Status: pending

Priority: P2

Suggested agent: build tooling and filesystem testability specialist

Dependencies: CARMS-05, CARMS-06

Primary ownership:

- `packages/create-access-router-mongo-starter/scripts/stage-template.ts`
- a thin staging entrypoint
- shared staging/scaffolding policy modules
- staging integration tests

Finding:

Importing `stage-template.ts` immediately deletes and recreates `dist/template`; its unit test triggers that side effect merely to import predicates. Staging and scaffolding maintain separate exclusion sets that can drift, and no temporary-directory test verifies the complete staged result.

References:

- `packages/create-access-router-mongo-starter/scripts/stage-template.ts:9-35`
- `packages/create-access-router-mongo-starter/tests/stage-template.test.ts:1-60`
- `packages/create-access-router-mongo-starter/src/cli.ts:48-57`

Implementation requirements:

1. Move work into `stageTemplate(options)` and call it only from a thin executable entrypoint.
2. Keep normalization and exclusion policy imports side-effect free.
3. Define named publish and scaffold policies, documenting intentional differences such as safe `.gitignore` staging and the selected lockfile behavior.
4. Test staging against temporary source/output trees, including hidden files, nested paths, symlinks, excluded artifacts, and failure cleanup.
5. Add a stale-output check that compares source policy output with staged package content without repairing it first.

Acceptance criteria:

- Importing staging helpers performs no filesystem writes or logging.
- Unit tests never modify repository `dist/`.
- A full staging test proves exact inclusion/exclusion behavior.
- Source/staged drift fails verification instead of being silently repaired by test import.
- Package tests and build pass serially.

### Task CARMS-18: Reconcile Commands, Placeholder Docs, And Generated Guidance

Status: pending

Priority: P2

Suggested agent: developer-experience and technical documentation specialist

Dependencies: CARMS-06, CARMS-07, CARMS-08, CARMS-11, CARMS-13, CARMS-17

Primary ownership:

- `packages/create-access-router-mongo-starter/README.md`
- `packages/create-access-router-mongo-starter/template/README.md`
- `packages/create-access-router-mongo-starter/template/AGENTS.md`
- template `.agents/skills/`
- `website/docs/packages/create-access-router-mongo-starter.md`
- template script names

Finding:

Documentation omits the `{{VERSION}}` replacement, generated docs have literal token examples corrupted by global substitution, the printed deploy command assumes a locally installed binary that the generated app does not declare, and `pnpm test` starts Vitest watch mode despite being presented as the standard test command. API override, port, Mongo requirement, public-write, and lockfile behavior also disagree with implementation.

References:

- `packages/create-access-router-mongo-starter/README.md:37-43`
- `packages/create-access-router-mongo-starter/src/cli.ts:337-344`
- `packages/create-access-router-mongo-starter/template/package.json:7-18`
- `packages/create-access-router-mongo-starter/template/README.md:54-82`
- `packages/create-access-router-mongo-starter/template/README.md:95-174`
- `website/docs/packages/create-access-router-mongo-starter.md:71-80`

Implementation requirements:

1. Make `test` use `vitest run` and provide `test:watch` explicitly.
2. Print a deploy command that works after an `npx`/`pnpm dlx` scaffold or print the exact required pinned install first.
3. Document all operational placeholders exactly once in maintainer guidance and avoid rewriting literal examples into nonsense in generated docs.
4. Reconcile environment precedence, Mongo requirement, public access, list limits, lockfile policy, supported Node/pnpm, and deployment side effects with completed implementation tasks.
5. Put security warnings before public deployment commands and avoid credentials in command examples.
6. Keep package, generated template, website, and agent skill instructions consistent.

Acceptance criteria:

- Every documented command works in a freshly packed-generated project.
- Standard tests terminate in CI; watch mode remains available under a distinct command.
- No generated documentation contains a misleading substituted placeholder explanation.
- Environment and deployment tables match tested behavior.
- Documentation checks and generated-project smoke tests pass.

## Wave 7: Independent Integration Review

### Task CARMS-19: Perform Independent Security, Artifact, And Generated-App Review

Status: pending

Priority: P1

Suggested agent: independent reviewer who did not implement CARMS-02 through CARMS-18

Dependencies: CARMS-02, CARMS-03, CARMS-04, CARMS-05, CARMS-06, CARMS-07, CARMS-08, CARMS-09, CARMS-10, CARMS-11, CARMS-12, CARMS-13, CARMS-14, CARMS-15, CARMS-16, CARMS-17, CARMS-18

Primary ownership:

- review-only across `packages/create-access-router-mongo-starter/`
- release-like artifact and generated consumer verification
- this task file for completion evidence and newly discovered follow-ups

Finding:

The package spans destructive local filesystem work, secret-bearing provider automation, npm staging behavior, generated backend security, and frontend UX. Unit success alone cannot establish that alternate entry paths enforce the same contracts or that npm transforms preserve required files.

References:

- all findings and acceptance criteria in CARMS-01 through CARMS-18
- `AGENTS.md` repository test serialization guidance

Implementation requirements:

1. Review each acceptance criterion against runtime behavior, not only diffs and mocked happy paths.
2. Re-test root/current/template/symlink/traversal paths and prove rejected input causes no deletion or outside write.
3. Inspect child `argv`, environments, logs, thrown errors, Netlify payloads, and packed files for credential leakage.
4. Build a release-like tarball, install it in a fresh consumer, run every bin, scaffold an app, and run the generated app's documented install/build/typecheck/lint/test/serverless checks.
5. Exercise normal, advanced, and root API paths; malformed IDs; validation bounds; error sanitization; category integrity; local/serverless parity; and public-access acknowledgement.
6. Verify frontend/browser and backend/runtime API paths agree after a Netlify-style build with conflicting ambient `.env` values.
7. Verify source, staged template, packed template, generated output, public docs, types, and implementation agree.
8. Run targeted checks after each task, package checks after each wave, then full repository checks serially.
9. Record deferred work with rationale and residual risk; add uniquely numbered tasks rather than hiding scope growth.

Acceptance criteria:

- No P0 or P1 finding in this plan remains unresolved without an explicit maintainer-approved deferral and residual-risk note.
- No internal secret or raw persistence error crosses a process, log, package, or HTTP boundary unexpectedly.
- Request-controlled recursive, collection, batch, and path inputs have tested bounds/containment.
- Packed-installed and generated-project behavior matches source tests and documentation.
- Targeted, package, template, full-repository, and artifact checks pass serially.
- `git diff --check` passes and unrelated worktree changes remain untouched.

## Dependency And Parallelization Guidance

| Agent lane                | Tasks                                                      | Sequencing notes                                                                                                                                                                                                                                     |
| ------------------------- | ---------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Test infrastructure       | CARMS-01                                                   | Complete first; coordinate shared test support with all lanes.                                                                                                                                                                                       |
| Filesystem/package safety | CARMS-02, CARMS-03, CARMS-05, CARMS-06, CARMS-07, CARMS-17 | CARMS-02 and CARMS-03 may run in parallel after CARMS-01. Sequence CARMS-05 before CARMS-17; sequence CARMS-06 before final staging policy. `src/cli.ts` is shared by CARMS-02, CARMS-05, and CARMS-07, so assign them sequentially or to one agent. |
| Deployment security       | CARMS-04, CARMS-08, CARMS-09                               | Sequence in task order. `deploy-netlify.ts` is a shared hotspot; do not assign overlapping edits.                                                                                                                                                    |
| Backend contracts         | CARMS-10, CARMS-11, CARMS-12, CARMS-13                     | CARMS-10 establishes route contracts. CARMS-11 and CARMS-12 may then run in parallel if config/router ownership is coordinated. CARMS-13 also overlaps deploy code and must follow CARMS-08.                                                         |
| Frontend                  | CARMS-14, CARMS-15, CARMS-16                               | Sequence CARMS-14 before accessibility behavior; CARMS-16 can start after shared DTOs from CARMS-10 settle. `home-page.tsx` is shared, so avoid concurrent edits.                                                                                    |
| Documentation             | CARMS-18                                                   | Start only after behavioral decisions settle; it may inventory drift earlier but should not finalize speculative contracts.                                                                                                                          |
| Final review              | CARMS-19                                                   | Independent agent after all implementation tasks and decisions.                                                                                                                                                                                      |

Shared hotspots requiring explicit coordination:

- `src/cli.ts`: CARMS-02, CARMS-05, CARMS-07.
- `scripts/deploy-shared.ts`: CARMS-03, CARMS-04, CARMS-08, CARMS-13.
- `scripts/deploy-netlify.ts`: CARMS-04, CARMS-08, CARMS-09, CARMS-11, CARMS-13.
- `template/api/src/routers.ts`: CARMS-10, CARMS-12, CARMS-16.
- `template/src/pages/home-page.tsx`: CARMS-12, CARMS-14, CARMS-15, CARMS-16.
- `template/package.json` and lockfile: CARMS-06, CARMS-13, CARMS-18.
- `dist/template`: generated shared output; never edit manually or rebuild concurrently.

## Deferred Decisions Requiring Maintainer Input

### D-01: Generated Dependency Reproducibility

Choose one:

- Recommended: ship a release-synchronized lockfile and require frozen installation in the smoke test.
- Alternative: omit lockfiles from source, package, and generated output, explicitly accepting time-varying dependency resolution.

This decision blocks CARMS-06 and the final staging policy in CARMS-17, but does not block safety/security work.

### D-02: Basic Starter Route Surface

Choose whether root batch and advanced mutation endpoints remain enabled in the basic starter. If retained, they must use equivalent validation and explicit bounds; if removed, document secure opt-in examples.

This decision blocks the final implementation shape of CARMS-10.

### D-03: Public Write Access

Choose one generated default:

- Explicit public-demo mode with production acknowledgement and prominent warnings.
- Read-only anonymous default with write access requiring host configuration.
- Deny-by-default skeleton with an authentication integration placeholder.

This decision blocks CARMS-12. It does not justify leaving current validation bypasses or missing resource bounds unresolved.

### D-04: Category Referential Integrity

Choose one policy for referenced category deletion: reject with conflict, transactionally null references, cascade-delete Todos, or explicitly allow dangling references. Rejecting deletion while referenced is the least destructive default.

This decision blocks CARMS-12.

### D-05: API Base Value Shape

Choose whether configuration supports route prefixes only or full absolute API origins. A path-only contract is simpler for the current same-origin local and Netlify architecture; absolute origins require CORS and URL-aware joining.

This decision blocks CARMS-13.

### D-06: Home Directory Force Protection

Choose whether `--force` must always reject the user's home directory or may permit it behind a stronger exact-path confirmation. Always rejecting it is recommended for a scaffolder.

This decision affects one CARMS-02 edge case but does not block the other destructive-path guards.

## Verification Commands

Run focused test files during implementation, then run package-level commands serially:

```sh
pnpm --filter create-access-router-mongo-starter test
pnpm --filter create-access-router-mongo-starter typecheck
pnpm exec eslint "packages/create-access-router-mongo-starter/**/*.{ts,tsx,js}"
pnpm --filter create-access-router-mongo-starter build
```

Run generated-template checks from a fresh packed-installed scaffold, not directly against unresolved source placeholders:

```sh
pnpm install --frozen-lockfile
pnpm typecheck
pnpm lint
pnpm test
pnpm build
pnpm serverless
```

Use `pnpm install --no-frozen-lockfile` only if D-01 explicitly selects the no-lockfile contract. For final repository and artifact verification, keep commands serialized:

```sh
pnpm lint
pnpm build
pnpm test
pnpm build-artifact -- --version <ver>
pnpm verify-artifact -- --version <ver>
git diff --check
```

Do not run package tests, package builds, or artifact assembly concurrently because staging and workspace builds write shared `dist/` trees.

## Definition Of Done

- Every task is `completed`, or explicitly `deferred` with maintainer, rationale, and residual risk.
- Scaffold path validation happens before mutation and transactional replacement preserves existing data on failure.
- Sandbox mode cannot write or delete outside its owned directory.
- Mongo credentials are secret-scoped, auth is absent from child arguments, and subprocesses receive only needed secrets.
- Packed-installed scaffolds contain `.gitignore`, valid metadata, usable bins, and the selected reproducible dependency contract.
- Scaffold input is context-valid and generated JSON/TypeScript/HTML/env content remains syntactically and semantically correct.
- Cancellation and preflight failures create no remote site or environment mutation; completed mutations are reported accurately on later failure.
- Every exposed API write path applies one validation/bounds contract, Mongo configuration fails fast, and persistence errors are sanitized.
- Public-write and category-integrity behavior are explicit, tested, and documented.
- Frontend failed/pending operations preserve state and expose accessible controls/status.
- Staging helper imports are side-effect free and tests do not rewrite shared outputs implicitly.
- Package, generated-template, packed-consumer, full-repository, and release-artifact verification pass serially.
- Documentation, `.agents` guidance, public types, source template, staged template, packed artifact, and generated behavior agree.
