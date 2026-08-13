# HTTP Errors Review Remediation

Created: 2026-08-13 10:55:38 PDT

Package: `packages/http-errors`

## Objective

Remediate confirmed global-mutation, HTTP status-contract, type-safety, snapshot-ownership, installed-package, and documentation gaps in `@web-ts-toolkit/http-errors`. Preserve the package's small class-based API and interoperability with `@web-ts-toolkit/express-response-handler` while making invalid error states harder to construct, serializer claims trustworthy, and the ESM/CJS TypeScript consumer experience independently verifiable.

## Scope And Working Rules

- Add a focused regression that fails on the current implementation before each behavioral fix.
- Treat exported status registries and structured option values as caller-controlled mutable inputs.
- Keep HTTP response writing and untrusted thrown-value normalization in `@web-ts-toolkit/express-response-handler`; this package owns typed errors and pure payload conversion.
- Preserve the named root imports and the existing specific 4xx/5xx classes unless a task explicitly changes a contract.
- Do not edit generated `dist/` or ignored `src/**/*.js` files manually. Build from tracked TypeScript source.
- Update source types, emitted declarations, the shipped `README.md`, website docs, and consumer tests together when public behavior changes.
- Preserve unrelated worktree changes and never revert another agent's work.
- Run package tests serially. Package test scripts rebuild shared `dist/` outputs, so agents must not run `http-errors`, `utils`, `express-response-handler`, or dependent package build/test commands concurrently.

## Non-Goals

- Do not turn serializers into general sanitizers for arbitrary untrusted thrown values; the response-handler boundary already performs that normalization.
- Do not deep-clone arbitrary `details` or error objects without a documented ownership contract and tests for supported values.
- Do not generate dozens of classes dynamically merely to reduce source line count; explicit classes make declarations and stack names readable.
- Do not add a default export or new subpath exports without demonstrated consumer need.
- Do not add `llms.txt` before metadata, declarations, README, and packed-consumer verification are correct.
- Do not optimize status lookup or class construction without a reproducible benchmark showing material impact.

## Review Baseline

Confirmed on 2026-08-13 before this task file was created:

- `pnpm --filter @web-ts-toolkit/http-errors test`: passed, 1 file and 12 tests.
- `pnpm exec eslint "packages/http-errors/**/*.{ts,js}"`: passed with no findings.
- `git diff --check`: passed.
- `npm pack --dry-run --json`: passed and listed 6 intended files: `package.json`, `README.md`, and four `dist/index` runtime/declaration files.
- Tests import `../dist/index.mjs`; they exercise built ESM behavior but not CJS loading, package-name resolution, conditional declaration selection, transformed release metadata, or a fresh installed consumer.
- Tsup emits `dist/index.d.mts` and `dist/index.d.ts`, but the export map sends every consumer to `dist/index.d.ts`.
- The runtime output retains `@web-ts-toolkit/utils` as an external dependency; a release-like packed test is needed to prove the `workspace:*` dependency is transformed correctly.
- Writing `canonicalStatusByHttpStatus[400] = 'COMPROMISED'` changes the `status` of subsequently constructed `BadRequestError` instances.
- `new HttpError(200, 'ok')` succeeds even though this is an error package; non-integer, non-finite, and out-of-range values are likewise not rejected here. `express-response-handler` separately enforces integer 400-599 status codes at its response boundary.
- Mutating a source `details` array after construction mutates `error.details`; `errors` is also retained by reference.
- `toRfc9457ValidationErrorPayload` returns a validation-specific type for arbitrary array elements without runtime validation. A current call with `errors: [{ wrong: true }]` is typed as `Rfc9457ValidationError[]` and passes the invalid element through unchanged.
- No material performance defect was confirmed. Current lookup and serializer work is linear only in caller-supplied metadata/detail collections; add bounds only if this package is deliberately expected to process untrusted large values directly.

## Priorities

- P0: mutable shared state can alter process-wide error behavior or sensitive response data can cross a boundary unexpectedly.
- P1: invalid HTTP error states are constructible, a public helper makes an unsound type claim, or installed consumers cannot reliably load/type the package.
- P2: ownership, readability, documentation, testability, or maintainability gaps with contained impact.
- P3: optional API expansion or performance work requiring policy or benchmark evidence.

## Wave 1: Shared State And Error Invariants

### Task HTE-01: Make Canonical Status Lookup Immutable

Status: completed

Priority: P0

Suggested agent: TypeScript runtime encapsulation specialist

Dependencies: none

Primary ownership:

- `packages/http-errors/src/status.ts`
- focused tests in `packages/http-errors/test/http-errors.test.ts`
- emitted declaration assertions as needed

Finding:

`canonicalStatusByHttpStatus` is exported as a normal object. `as const` only affects TypeScript, so JavaScript consumers or casts can mutate it and globally change the `status` assigned to every later error in the process. The exported registry also exposes implementation state when callers primarily need `getCanonicalStatus`.

References:

- `packages/http-errors/src/status.ts:3-21`
- `packages/http-errors/src/base.ts:41-43`
- `packages/http-errors/src/index.ts:2`

Implementation requirements:

1. Make the internal lookup impossible to mutate through the public API at runtime.
2. Decide whether the map is intentionally public. Prefer a private map plus an explicit readonly public snapshot only if registry inspection has a documented consumer use.
3. Preserve all current mappings and the `UNKNOWN` fallback.
4. Add a JavaScript-representative mutation regression; a TypeScript readonly annotation alone is insufficient.
5. If the export is removed, document the breaking change and update package/website docs and declaration-consumer tests together.

Acceptance criteria:

- No package-root consumer can change the canonical status returned for later calls or newly constructed errors.
- `getCanonicalStatus(400)` remains `INVALID_ARGUMENT`, and unmapped statuses remain `UNKNOWN`, after attempted mutation.
- Emitted declarations expose only the selected intentional contract.
- `pnpm --filter @web-ts-toolkit/http-errors test` passes.

Completion evidence:

- Changed: `packages/http-errors/src/status.ts`, `packages/http-errors/test/http-errors.test.ts`
- Contract: kept `canonicalStatusByHttpStatus` as an exported frozen readonly snapshot while `getCanonicalStatus` reads from private frozen state.
- Verified: `pnpm --filter @web-ts-toolkit/http-errors test`
- Result: 13 tests passed.

### Task HTE-02: Enforce HTTP Error Status Ranges At Construction

Status: completed

Priority: P1

Suggested agent: HTTP contract and downstream compatibility specialist

Dependencies: HTE-01

Primary ownership:

- `packages/http-errors/src/base.ts`
- a small shared status validator location chosen during implementation
- `packages/http-errors/test/http-errors.test.ts`
- affected README and website examples
- focused `express-response-handler` compatibility tests

Finding:

`HttpError`, `ClientError`, and `ServerError` accept any number. This permits `new HttpError(200)`, `new ClientError(503)`, `new ServerError(404)`, `NaN`, fractions, and values outside the HTTP range. Invalid values survive until `express-response-handler` rejects some of them later, while direct users can serialize contradictory payloads such as RFC 9457 status 200. Category base-class names also promise 4xx/5xx invariants that are not enforced.

References:

- `packages/http-errors/src/base.ts:31-43`
- `packages/http-errors/src/base.ts:81-90`
- `packages/http-errors/src/serialize.ts:36-60`
- `packages/express-response-handler/src/error-format.ts:18-30`
- `website/docs/packages/http-errors.md:59-66`

Implementation requirements:

1. Establish one status validation contract: integer and finite; `HttpError` accepts 400-599, `ClientError` accepts 400-499, and `ServerError` accepts 500-599 unless maintainer evidence requires a broader neutral `HttpError` range.
2. Reuse or deliberately relocate equivalent validation logic rather than allowing this package and `express-response-handler` to drift. Avoid introducing a dependency cycle.
3. Fail synchronously with stable actionable errors before assigning contradictory instance state.
4. Cover lower/upper boundaries, category mismatch, `NaN`, infinities, fractions, and valid unmapped extension codes.
5. Preserve every specific error class and its fixed status.
6. Document the tightened constructor contract and flag it for release notes as a behavior change.

Acceptance criteria:

- Invalid and category-mismatched statuses cannot produce an `HttpError`, `ClientError`, or `ServerError` instance.
- Valid 4xx/5xx extension status codes remain constructible and serialize consistently.
- Specific error classes retain their current status, default message, name, inheritance, and stack behavior.
- `http-errors` and `express-response-handler` agree on accepted error status boundaries.
- Their targeted package tests pass serially.

Completion evidence:

- Changed: `packages/http-errors/src/status.ts`, `packages/http-errors/src/base.ts`, `packages/express-response-handler/src/error-format.ts`, `packages/http-errors/test/http-errors.test.ts`, `packages/http-errors/README.md`, `website/docs/packages/http-errors.md`, `CHANGELOG.md`
- Contract: `HttpError` now synchronously accepts only finite integer `400`-`599` statuses; `ClientError` narrows to `400`-`499`; `ServerError` narrows to `500`-`599`.
- Shared boundary: `express-response-handler` now reuses `validateHttpErrorStatusCode`/`isHttpErrorStatusCode` from `http-errors` for its error response validation.
- Verified: `pnpm --filter @web-ts-toolkit/http-errors test`; `pnpm --filter @web-ts-toolkit/express-response-handler test`
- Result: `http-errors` 24 tests passed; `express-response-handler` 121 tests passed.

## Wave 2: Type Safety And Ownership

### Task HTE-03: Replace The Unsound Validation Serializer Cast

Status: completed

Priority: P1

Suggested agent: TypeScript API and runtime-validation specialist

Dependencies: HTE-02

Primary ownership:

- `packages/http-errors/src/types.ts`
- `packages/http-errors/src/serialize.ts`
- runtime and declaration-consumer tests
- serializer sections in package and website docs

Finding:

`toRfc9457ErrorPayload<TError>` casts any array to `TError[]`, and `toRfc9457ValidationErrorPayload` specializes that cast to `Rfc9457ValidationError` without checking that entries have a string `detail` or valid optional fields. The helper therefore promises data that runtime output does not satisfy. `HttpErrorOptions.errors?: unknown` prevents the constructor from preserving a useful generic relationship between input and output.

References:

- `packages/http-errors/src/types.ts:9-17`
- `packages/http-errors/src/types.ts:19-28`
- `packages/http-errors/src/types.ts:46-60`
- `packages/http-errors/src/serialize.ts:22-23`
- `packages/http-errors/src/serialize.ts:50-64`
- `website/docs/packages/http-errors.md:211-234`

Implementation requirements:

1. Select and document one honest contract: typed input shapes that make output inference sound, or runtime validation/narrowing for the validation-specific helper.
2. Do not retain an unconstrained generic assertion that lets callers choose an unrelated output type.
3. If invalid validation entries are rejected or omitted, define deterministic behavior and cover mixed-validity arrays, non-arrays, inherited properties, and optional string fields.
4. Keep the general RFC 9457 serializer useful for custom extension error shapes without forcing validation-only fields.
5. Make required RFC 9457 members required in `Rfc9457ErrorPayload` when the serializer always emits them; keep extension members optional only when runtime can omit them.
6. Add strict consumer tests proving correct inference and `@ts-expect-error` coverage for unsupported claims.

Acceptance criteria:

- No exported serializer can type `[{ wrong: true }]` as `Rfc9457ValidationError[]` without validating or rejecting it.
- General custom error entries retain a precise caller-visible type through the supported API.
- Runtime handling of absent, non-array, empty, valid, and invalid `errors` values is explicit and tested.
- Built `.d.ts` and `.d.mts` describe the runtime payload shape accurately.
- Package tests and strict declaration-consumer tests pass.

Completion evidence:

- Changed: `packages/http-errors/src/types.ts`, `packages/http-errors/src/serialize.ts`, `packages/http-errors/test/http-errors.test.ts`, `packages/http-errors/test/strict-consumer-types.test.ts`, `packages/http-errors/README.md`, `website/docs/packages/http-errors.md`
- Contract: `toRfc9457ErrorPayload(...)` now preserves custom entry types only from a typed `HttpErrorShape<TError[]>` input and falls back to `unknown` for untyped `HttpError` instances; `toRfc9457ValidationErrorPayload(...)` runtime-filters entries to own string `detail` plus optional own string `pointer`/`parameter`/`header` before returning `Rfc9457ValidationError[]`.
- Runtime behavior: absent, non-array, empty, inherited-field, invalid optional-field, mixed-validity, and custom general-error arrays are covered.
- Declaration behavior: strict packed-consumer test covers positive inference plus `@ts-expect-error` assertions against unsupported validation/custom claims.
- Verified: `pnpm --filter @web-ts-toolkit/http-errors test`
- Result: `http-errors` 28 tests passed, including the strict packed-consumer declaration test.

### Task HTE-04: Define And Enforce Structured Value Ownership

Status: completed

Priority: P2

Suggested agent: immutable data-boundary specialist

Dependencies: HTE-03

Primary ownership:

- `packages/http-errors/src/base.ts`
- `packages/http-errors/src/serialize.ts`
- `packages/http-errors/src/types.ts`
- mutation-focused tests and ownership documentation

Finding:

Metadata is normalized into a new record, but `details` and `errors` are retained by reference and serializers return their arrays and nested values by reference. A caller can mutate an error after construction by changing its source arrays, and can mutate error-owned arrays through a returned payload. The `readonly` property declarations do not make referenced collections immutable.

References:

- `packages/http-errors/src/base.ts:24-26`
- `packages/http-errors/src/base.ts:53-65`
- `packages/http-errors/src/serialize.ts:12-19`
- `packages/http-errors/src/serialize.ts:22-23`
- `packages/http-errors/src/types.ts:14-16`

Implementation requirements:

1. Record the intended ownership contract for `metadata`, `details`, and `errors` at construction and serialization boundaries.
2. Snapshot supported top-level arrays/records so source-array mutation and payload-array mutation cannot add, remove, or reorder error-owned entries.
3. Prefer readonly input/output collection types where they improve compile-time intent without breaking ordinary array inputs.
4. Do not silently claim deep immutability for arbitrary nested objects. Either document shallow snapshot semantics or add a narrowly justified clone policy for supported JSON-like values.
5. Preserve `ErrorOptions.cause` identity and do not clone error causes.
6. Include mutation tests before and after construction/serialization, including empty arrays and metadata.

Acceptance criteria:

- Mutating caller-owned top-level collections after construction does not change the error's collection membership or order.
- Mutating a serializer-returned top-level collection does not change the source error or a later serialization.
- Types and docs accurately state whether nested entry objects remain shared.
- Cause identity and all scalar fields remain unchanged.
- Package tests pass.

Completion evidence:

- Changed: `packages/http-errors/src/base.ts`, `packages/http-errors/src/serialize.ts`, `packages/http-errors/src/types.ts`, `packages/http-errors/test/http-errors.test.ts`, `packages/http-errors/README.md`, `website/docs/packages/http-errors.md`
- Contract: `metadata` is normalized into a frozen error-owned string record; top-level `details` and array-valued `errors` are copied into frozen error-owned arrays at construction. Serializers return fresh top-level arrays and copied metadata records.
- Shallow semantics: nested detail and error entry objects remain shared by reference; `ErrorOptions.cause` identity is preserved.
- Runtime behavior: source collection mutation, empty collection freezing, serializer payload mutation, metadata copying, and nested entry sharing are covered.
- Verified: `pnpm --filter @web-ts-toolkit/http-errors test`
- Result: `http-errors` 31 tests passed, including strict packed-consumer declaration coverage.

### Task HTE-05: Centralize Status Definitions Without Obscuring Classes

Status: completed

Priority: P2

Suggested agent: maintainability and API-consistency specialist

Dependencies: HTE-02, HTE-04

Primary ownership:

- `packages/http-errors/src/messages.ts`
- `packages/http-errors/src/client-errors.ts`
- `packages/http-errors/src/server-errors.ts`
- status/class parity tests

Finding:

Status codes are repeated across the default-message map and 38 class constructors. Nothing checks that every exported specific class has exactly one matching message, expected category, canonical status behavior, and HTTP title. This is currently readable but makes additions and corrections drift-prone.

References:

- `packages/http-errors/src/messages.ts:1-46`
- `packages/http-errors/src/client-errors.ts:4-164`
- `packages/http-errors/src/server-errors.ts:4-68`
- `packages/http-errors/test/http-errors.test.ts:15-54`

Implementation requirements:

1. Add a single reviewable status definition or parity test that detects missing messages, duplicate status assignments, and client/server category mismatches.
2. Preserve explicit exported class declarations and constructor names unless generated declarations, stack names, and tree-shaking are proven equivalent.
3. Export only status metadata that consumers demonstrably need; keep construction registries internal.
4. Use table-driven tests across all classes rather than one test per repeated constructor.
5. Do not change default message text incidentally; message wording changes require explicit documentation review.

Acceptance criteria:

- Every specific exported error class is covered by one parity table asserting code, category inheritance, default message, name, and status/title behavior.
- Adding a class without required status metadata or a message causes a focused test or compile failure.
- Public class names and named imports remain unchanged.
- Package tests pass.

Completion evidence:

- Changed: `packages/http-errors/src/status-definitions.ts`, `packages/http-errors/src/messages.ts`, `packages/http-errors/test/http-errors.test.ts`
- Contract: specific error class metadata is centralized in an internal status definition table; `messages` is derived from that table without exporting construction registries publicly.
- Runtime behavior: one table-driven parity test covers every specific exported class for name, status code, inheritance category, default message, canonical status, and RFC 9457 title; a coverage test catches missing metadata and duplicate status assignments.
- Verified: `pnpm --filter @web-ts-toolkit/http-errors test`
- Result: `http-errors` 70 tests passed.

## Wave 3: Installed Consumer And Documentation Health

### Task HTE-06: Add Conditional Declarations And Packed-Consumer Verification

Status: completed

Priority: P1

Suggested agent: Node package-resolution and release-artifact specialist

Dependencies: HTE-03, HTE-04

Primary ownership:

- `packages/http-errors/package.json`
- package-local declaration and packed-consumer fixtures
- package test scripts only as needed

Finding:

Tsup emits ESM `.d.mts` and CJS `.d.ts` declarations, but `exports.types` always selects `.d.ts`. Current tests import a relative ESM build and do not test CJS, package-name resolution, strict NodeNext/Bundler declarations, or the production transformation of `@web-ts-toolkit/utils: workspace:*`. A raw dry-run confirms the intended file allowlist but not a publishable transformed manifest.

References:

- `packages/http-errors/package.json:16-40`
- `packages/http-errors/tsup.config.ts:3-9`
- `packages/http-errors/test/http-errors.test.ts:1-13`
- `packages/utils/package.json:16-29`

Implementation requirements:

1. Use conditional `types.import`/`types.require` entries so ESM selects `.d.mts` and CJS selects `.d.ts`, following the verified `utils` package pattern.
2. Add strict NodeNext ESM/CJS and Bundler declaration consumers using package-name imports with `skipLibCheck: false`.
3. Stage this package and its internal dependency closure through the repository's real production publish transformation; do not hand-write a release manifest approximation.
4. Install tarballs into a fresh consumer and run ESM and CJS runtime smoke checks plus strict type checks.
5. Assert transformed versions contain no `PLACEHOLDER` or `workspace:` values and that the packed allowlist remains intentional.
6. Compile at least the README quick-start and serializer examples against the installed artifact.

Acceptance criteria:

- ESM and CJS package-name imports load their intended runtime entrypoints.
- NodeNext ESM/CJS and Bundler consumers select compatible declarations and compile strictly.
- The release-like package declares a resolvable transformed `@web-ts-toolkit/utils` dependency.
- The tarball contains only `package.json`, `README.md`, and intended `dist/index` files unless an explicit addition is approved.
- A regression in exports, declarations, dependency rewriting, or documented imports fails package tests.

Completion evidence:

- Changed: `packages/http-errors/package.json`, `packages/http-errors/test/strict-consumer-types.test.ts`
- Contract: root export now uses conditional `types.import`/`types.require`/`types.default` so ESM consumers resolve `.d.mts` and CJS/default consumers resolve `.d.ts`.
- Consumer verification: package tests now production-transform `http-errors` and `utils` manifests with `repo-toolkit-publish-package`, pack tarballs, install them into a fresh consumer, run ESM and CJS package-name runtime smoke checks, compile strict NodeNext ESM/CJS and Bundler consumers with `skipLibCheck: false`, compile README quick-start plus serializer examples, assert transformed manifests contain no `PLACEHOLDER` or `workspace:` values, and assert the packed root allowlist.
- Verified: `pnpm --filter @web-ts-toolkit/http-errors test`
- Result: `http-errors` 72 tests passed.

### Task HTE-07: Make The Shipped README Self-Sufficient

Status: completed

Priority: P2

Suggested agent: installed TypeScript API documentation specialist

Dependencies: HTE-02, HTE-03, HTE-04, HTE-05

Primary ownership:

- `packages/http-errors/README.md`
- `website/docs/packages/http-errors.md`
- high-value public JSDoc in `src/base.ts`, `src/serialize.ts`, and `src/types.ts`
- generated declaration review through normal builds

Finding:

The shipped README names only a subset of the public surface and shows serializer names without payload examples, status validation rules, structured field ownership, generic/error-entry behavior, or the important rule that public error messages and details are emitted verbatim. Most exported helpers and types have no JSDoc in generated declarations. The larger website page currently describes the validation helper as typed without disclosing that runtime validation is absent; HTE-03 will change or clarify that contract.

References:

- `packages/http-errors/README.md:11-44`
- `packages/http-errors/dist/index.d.ts:1-73`
- `website/docs/packages/http-errors.md:114-125`
- `website/docs/packages/http-errors.md:170-234`

Implementation requirements:

1. Keep the README concise but include the canonical named import, constructor status ranges, one AIP-193 example, one RFC 9457 example, and the selected validation-errors contract.
2. Explicitly warn that `message`, `details`, `errors`, `metadata`, `type`, `title`, and `instance` can enter external payloads; applications must not include secrets or internal diagnostics intended only for logs.
3. Document the selected shallow/deep ownership semantics and fallback behavior for unmapped status names/titles.
4. List the main exported types consumers can import without reproducing the full website class table.
5. Add concise JSDoc that survives into declarations for the three error base classes and payload helpers, including parameter and output semantics.
6. Keep README, website docs, declarations, and runtime behavior consistent; compile examples in HTE-06.

Acceptance criteria:

- An installed consumer can determine valid constructors, canonical imports, payload behavior, mutation ownership, and disclosure risks from `README.md` and editor hovers alone.
- README examples compile against the packed artifact without repository path aliases.
- Generated `.d.ts` and `.d.mts` retain useful JSDoc on the primary classes and serializers.
- Website docs do not claim stronger validation or immutability than runtime provides.
- Package tests pass.

Completion evidence:

- Changed: `packages/http-errors/README.md`, `website/docs/packages/http-errors.md`, `packages/http-errors/src/base.ts`, `packages/http-errors/src/serialize.ts`, `packages/http-errors/src/types.ts`.
- README now includes canonical named imports, constructor status ranges, concrete AIP-193 and RFC 9457 examples, validation helper runtime filtering, public-payload disclosure warnings, shallow ownership semantics, serializer fallbacks, and main exported types.
- Website docs now match the README/runtime contract for disclosure risks, AIP-193 detail composition, RFC 9457 `type`/`title` fallback behavior, and shallow mutation ownership.
- Public JSDoc added for `HttpError`, `ClientError`, `ServerError`, serializers, and exported payload/input types; verified comments survive in both `dist/index.d.ts` and `dist/index.d.mts`.
- Verified: `pnpm --filter @web-ts-toolkit/http-errors build`; declaration grep found retained JSDoc in `.d.ts` and `.d.mts`.
- Verified: `pnpm --filter @web-ts-toolkit/http-errors test`.
- Result: `http-errors` 72 tests passed, including packed README example compilation from HTE-06 consumer tests.

## Wave 4: Performance Decision And Independent Review

### Task HTE-08: Benchmark Before Adding Resource Bounds Or Removing Utilities

Status: deferred

Priority: P3

Suggested agent: Node performance investigator

Dependencies: HTE-03, HTE-04, HTE-05

Primary ownership:

- benchmark/investigation notes in this task document
- benchmark fixture only if it is stable and maintainable
- no production edits without evidence

Finding:

No performance regression is currently demonstrated. Metadata normalization allocates a record and stringifies every entry; serializers shallow-copy detail arrays, and the package loads `@web-ts-toolkit/utils` for one helper. These costs are likely small for normal error paths, but very large caller-controlled metadata/details could increase CPU, memory, and response size if direct callers bypass an input-normalization boundary.

References:

- `packages/http-errors/src/base.ts:53-57`
- `packages/http-errors/src/serialize.ts:12-19`
- `packages/http-errors/package.json:38-40`
- `packages/utils/src/toStringRecord.ts:3-16`

Implementation requirements:

1. Measure representative construction and serialization for small normal payloads and large collections after ownership fixes.
2. Determine whether large values can be request-controlled in documented direct usage or only after `express-response-handler` normalization.
3. Do not add arbitrary limits to this low-level package without a maintainer-approved policy for rejection, truncation, and compatibility.
4. Do not inline `toStringRecord` solely to remove a workspace dependency unless packed size, startup, or maintenance evidence justifies divergence from the shared utility.
5. Record commands, Node version, datasets, results, and recommendation. Mark the task `deferred` with rationale if no actionable threshold is demonstrated.

Acceptance criteria:

- The task records reproducible evidence and a clear implement/defer recommendation.
- Any production optimization preserves payload bytes and public types, with regression tests and benchmark improvement.
- Any proposed resource bound has explicit semantics, security rationale, documentation, and maintainer approval.
- No speculative production refactor is merged.

Completion evidence:

- Investigated without production edits. Built release-like package output first with `pnpm --filter @web-ts-toolkit/http-errors build` so runtime measurements import `packages/http-errors/dist/index.mjs`.
- Benchmark script: `/tmp/opencode/http-errors-benchmark.mjs` using `node --expose-gc`. Node version reported by benchmark: `v26.5.0`.
- Datasets: small payload has `metadata=3`, `details=1`, `errors=1`; large payload has `metadata=10000`, `details=10000`, `errors=10000`. Large entries are representative caller-controlled string metadata, AIP-193 detail objects, and RFC 9457 validation entries.
- Benchmark results:

| Operation                                   | Iterations | Result                                                  |
| ------------------------------------------- | ---------: | ------------------------------------------------------- |
| construct `HttpError` minimal               |    500,000 | 2,770.06 ms total; 5.54 us/op; 16.02 MiB heap delta     |
| construct `BadRequestError` small payload   |    250,000 | 1,915.75 ms total; 7.66 us/op; 13.26 MiB heap delta     |
| construct `BadRequestError` large payload   |        200 | 442.58 ms total; 2,212.89 us/op; 48.21 MiB heap delta   |
| serialize AIP-193 small payload             |    500,000 | 56.03 ms total; 0.11 us/op; 31.18 MiB heap delta        |
| serialize AIP-193 large payload             |        500 | 1,088.04 ms total; 2,176.08 us/op; 36.90 MiB heap delta |
| serialize RFC 9457 small payload            |    500,000 | 35.86 ms total; 0.07 us/op; 7.12 MiB heap delta         |
| serialize RFC 9457 large payload            |        500 | 3.16 ms total; 6.32 us/op; 9.73 MiB heap delta          |
| serialize RFC 9457 validation small payload |    250,000 | 63.97 ms total; 0.26 us/op; 31.41 MiB heap delta        |
| serialize RFC 9457 validation large payload |        200 | 143.65 ms total; 718.23 us/op; 16.07 MiB heap delta     |

- Direct package usage can make `metadata`, `details`, and `errors` request-controlled if an application passes raw request values into `HttpErrorOptions` or compatible serializer shapes. `express-response-handler` normalizes thrown/plain object `metadata` with `toStringRecord` and wraps non-array `details`, but does not impose byte, entry-count, or depth limits before calling `http-errors` serializers.
- Packed artifact evidence for the utility dependency: `pnpm pack --pack-destination "/tmp/opencode"` produced `/tmp/opencode/web-ts-toolkit-http-errors-0.0.0-PLACEHOLDER.tgz` containing only `dist/index.*`, `LICENSE`, `package.json`, and `README.md`. Current `tsup` output bundles the helper implementation into `dist`, so `@web-ts-toolkit/utils` does not add extra files to this package tarball. Startup spot checks on the built output reported `6.960 ms require CJS` and `25.102 ms import ESM`; no dependency-removal threshold was demonstrated.
- Recommendation: defer production changes. Normal payload construction and serialization costs are small for error-path usage. Large collections have clear linear CPU/allocation cost and can enlarge response bodies, but no maintainer-approved rejection/truncation semantics or compatibility threshold exists. Do not add arbitrary resource bounds in `http-errors`; document and enforce limits at application or framework input boundaries if a product needs them. Do not inline `toStringRecord` solely to remove the workspace dependency without stronger packed-size, startup, or maintenance evidence.

### Task HTE-09: Perform Independent Final Integration Review

Status: completed

Priority: P1

Suggested agent: independent HTTP, security, and package-contract reviewer

Dependencies: HTE-01 through HTE-08, except explicitly deferred HTE-08

Primary ownership:

- review and verification only across all changed files
- this task document's completion evidence and deferred decisions

Finding:

`http-errors` is a runtime dependency of `express-response-handler` and `express-json-router`. A local green unit suite does not prove response integration, public disclosures, release metadata transformation, CJS/ESM loading, or strict installed declarations remain correct. Final review must be performed by an agent who was not the primary implementer.

References:

- `packages/express-response-handler/package.json:63-67`
- `packages/express-json-router/package.json:38-47`
- `packages/express-response-handler/src/error-format.ts:108-142`
- `packages/http-errors/package.json:16-40`

Implementation requirements:

1. Re-read every finding and verify each acceptance criterion against runtime behavior, declarations, docs, and packed output.
2. Confirm shared status state cannot be externally mutated and all constructor/category boundaries reject invalid values consistently.
3. Confirm validation serializers make no unchecked type claims and structured arrays cannot be mutated across their documented ownership boundary.
4. Review payload fields for accidental cause, stack, or unrelated internal-data disclosure; verify only explicitly selected fields serialize.
5. Verify README and website examples match the final contract and compile against the packed artifact.
6. Run targeted package tests serially, then root lint/build/test if the worktree permits. Do not overwrite or revert unrelated concurrent changes.
7. Record exact verification commands/results and residual risks in this document.

Acceptance criteria:

- All non-deferred tasks have completion evidence tied to observable criteria.
- `pnpm --filter @web-ts-toolkit/http-errors test` passes.
- `pnpm --filter @web-ts-toolkit/express-response-handler test` and `pnpm --filter @web-ts-toolkit/express-json-router test` pass serially.
- `pnpm lint`, `pnpm build`, and `pnpm test` pass, or exact unrelated/pre-existing blockers are recorded without being hidden.
- Release-like packed-consumer ESM, CJS, NodeNext, and Bundler checks pass.
- `git diff --check` passes and generated/ignored files were not manually edited.

Completion evidence:

- Independent review completed against HTE-01 through HTE-08 evidence and the final source/docs/tests/package configuration.
- Reviewed `packages/http-errors/src/status.ts`: `getCanonicalStatus(...)` reads from private frozen `canonicalStatusLookup`; exported `canonicalStatusByHttpStatus` is a separate frozen readonly snapshot, so public mutation cannot alter later lookups or constructed error statuses.
- Reviewed `packages/http-errors/src/base.ts`: `HttpError` validates finite integer `400`-`599`; `ClientError` narrows to `400`-`499`; `ServerError` narrows to `500`-`599`; `metadata`, top-level `details`, and array-valued `errors` are shallow snapshotted and frozen while `cause` identity is preserved.
- Reviewed `packages/http-errors/src/serialize.ts` and `packages/http-errors/src/types.ts`: AIP-193 and RFC 9457 serializers emit only selected public fields, not `cause`, `stack`, or unrelated internal error fields. General RFC 9457 custom entry typing is tied to typed `HttpErrorShape<readonly TError[]>` input; validation helper runtime-filters entries before returning `Rfc9457ValidationError[]`.
- Reviewed `packages/express-response-handler/src/error-format.ts`: downstream status validation delegates to `isHttpErrorStatusCode`/`validateHttpErrorStatusCode` from `@web-ts-toolkit/http-errors`; structured HTTP payload conversion passes only selected public fields into serializers.
- Reviewed `packages/http-errors/package.json` and `packages/http-errors/test/strict-consumer-types.test.ts`: root export has conditional `types.import`/`types.require`; packed-consumer tests production-transform manifests, pack `http-errors` plus `utils`, install tarballs, run ESM/CJS runtime smoke checks, and compile strict NodeNext/Bundler/README consumers with `skipLibCheck: false`.
- Reviewed `packages/http-errors/README.md` and `website/docs/packages/http-errors.md`: constructor ranges, disclosure warning, shallow ownership semantics, RFC 9457 validation filtering, serializer fallbacks, and main named imports match the implementation.
- Verified: `pnpm --filter @web-ts-toolkit/http-errors test` passed, 2 files and 72 tests. This includes release-like packed-consumer ESM, CJS, NodeNext, Bundler, README, manifest rewrite, dependency rewrite, and tarball allowlist checks.
- Verified: `pnpm --filter @web-ts-toolkit/express-response-handler test` passed, 5 files and 121 tests.
- Verified: `pnpm --filter @web-ts-toolkit/express-json-router test` passed, 2 files and 33 tests, including its declaration consumer typecheck step.
- Verified: `pnpm lint` passed.
- Verified: `pnpm build` passed. Observed non-failing Vite warning that `apps/react-vite` generated a chunk larger than 500 kB after minification.
- Verified: `git diff --check` passed.
- Full-suite blocker: `pnpm test` failed in `@web-ts-toolkit/access-router` after 37 test files ran, with 36 passed and 1 failed. Failure: `packages/access-router/test/model-router.test.ts:120`, test `model router > rejects create requests when validate.create is false`, expected RFC 9457 response body to include `errors: []`; actual body omitted `errors`. This matches the final `http-errors` RFC 9457 contract that empty/absent invalid validation entries omit `errors`, but the access-router expectation has not been updated in this review-only task.
- Residual risk: full repository tests are not green until the `@web-ts-toolkit/access-router` expectation is reconciled with the final RFC 9457 empty-errors contract or maintainers choose a different integration contract.

### Task HTE-10: Reconcile Access Router Empty Validation Errors

Status: completed

Priority: P1

Suggested agent: downstream integration maintainer

Dependencies: HTE-09

Primary ownership:

- `packages/access-router/test/model-router.test.ts`
- targeted downstream package tests

Finding:

HTE-09 found the remaining full-suite blocker in `@web-ts-toolkit/access-router`: the `model router > rejects create requests when validate.create is false` test expected an RFC 9457 response to include `errors: []`, while the finalized `http-errors` RFC 9457 serializer contract omits `errors` when no valid entries are present.

References:

- `packages/access-router/test/model-router.test.ts:120-125`
- `packages/http-errors/src/serialize.ts:25-27`
- `packages/http-errors/src/serialize.ts:138-148`

Implementation requirements:

1. Preserve the finalized `http-errors` RFC 9457 empty-errors contract: absent, empty, or fully invalid validation entries omit `errors`.
2. Update only the stale downstream expectation unless runtime behavior contradicts the final contract.
3. Verify the previously failing downstream package and adjacent HTTP error/response packages serially.

Acceptance criteria:

- `access-router` no longer expects `errors: []` for a validation failure with no entries.
- The response still includes the expected RFC 9457 `title`, `detail`, and `status` fields.
- `@web-ts-toolkit/access-router`, `@web-ts-toolkit/http-errors`, `@web-ts-toolkit/express-response-handler`, and `@web-ts-toolkit/express-json-router` targeted tests pass.

Completion evidence:

- Changed: `packages/access-router/test/model-router.test.ts`, `docs/tasks/20260813-105538-http-errors-review-remediation.md`
- Contract: the stale access-router test now asserts the empty validation response omits `errors`, matching `toRfc9457ErrorPayload(...)` behavior.
- Verified: `pnpm --filter @web-ts-toolkit/access-router test`
- Result: `access-router` 37 files and 317 tests passed.
- Verified: `pnpm --filter @web-ts-toolkit/http-errors test`; `pnpm --filter @web-ts-toolkit/express-response-handler test`; `pnpm --filter @web-ts-toolkit/express-json-router test`
- Result: `http-errors` 2 files and 72 tests passed; `express-response-handler` 5 files and 121 tests passed; `express-json-router` 2 files and 33 tests passed.

### Task HTE-11: Reconcile Access Router Client Empty Problem Errors

Status: completed

Priority: P1

Suggested agent: downstream client integration maintainer

Dependencies: HTE-10

Primary ownership:

- `packages/access-router-client/test/access-router-client.protocol-parity.integration.test.ts`
- targeted downstream package tests

Finding:

After HTE-10 reconciled the server-side `access-router` expectation, `access-router-client` protocol parity still expected direct RFC 9457 missing-resource payloads to include `errors: []`. The finalized `http-errors` RFC 9457 serializer contract omits `errors` when no valid entries are present.

References:

- `packages/access-router-client/test/access-router-client.protocol-parity.integration.test.ts:965-971`
- `packages/access-router-client/test/access-router-client.protocol-parity.integration.test.ts:1002-1008`
- `packages/http-errors/src/serialize.ts:25-27`

Implementation requirements:

1. Preserve the finalized `http-errors` RFC 9457 empty-errors contract: absent, empty, or fully invalid validation entries omit `errors`.
2. Update only stale downstream client protocol expectations unless runtime behavior contradicts the final contract.
3. Verify the affected client package and the previously failing server package.

Acceptance criteria:

- Direct missing-result and missing-document client protocol tests no longer expect `errors: []`.
- The normalized failures still assert expected RFC 9457 `type`, `title`, `detail`, and `status` fields.
- `@web-ts-toolkit/access-router-client` and `@web-ts-toolkit/access-router` tests pass.

Completion evidence:

- Changed: `packages/access-router-client/test/access-router-client.protocol-parity.integration.test.ts`, `docs/tasks/20260813-105538-http-errors-review-remediation.md`
- Contract: stale direct client protocol expectations now assert the RFC 9457 payload omits `errors`, matching `toRfc9457ErrorPayload(...)` behavior.
- Verified: `pnpm --filter @web-ts-toolkit/access-router-client test`
- Result: `access-router-client` typecheck passed; 19 Node test files and 310 tests passed; 1 browser-smoke file and 10 tests passed.
- Verified: `pnpm --filter @web-ts-toolkit/access-router test`
- Result: `access-router` 37 files and 317 tests passed.

### Task HTE-12: Close Full Repository Verification

Status: completed

Priority: P1

Suggested agent: final verification maintainer

Dependencies: HTE-11

Primary ownership:

- final verification evidence in this task document
- incidental stale docs-fixture metadata if it blocks the full suite

Finding:

After HTE-10 and HTE-11 resolved the HTTP error contract integration failures, the remaining Definition of Done gap was a final successful `pnpm test` run. The next full-suite run progressed past the previous `access-router` and `access-router-client` blockers, then failed in `@web-ts-toolkit/access-router-react` because `test-docs-consumer/snippets-mapping.md` contained stale SHA-256 inventory hashes for unchanged README/website TypeScript snippets.

References:

- `packages/access-router-react/test/access-router-react.docs.compile.test.ts:181-188`
- `packages/access-router-react/test-docs-consumer/snippets-mapping.md:15-43`

Implementation requirements:

1. Do not change `http-errors` runtime behavior or the finalized RFC 9457 empty-errors contract.
2. Update only stale documentation compile inventory metadata if the source documentation blocks and fixture classifications are still valid.
3. Re-run the affected package test and the full repository test.

Acceptance criteria:

- `@web-ts-toolkit/access-router-react` documentation compile inventory matches the current README and website TypeScript blocks.
- `pnpm --filter @web-ts-toolkit/access-router-react test` passes.
- `pnpm test` passes after the downstream expectation reconciliations.
- The task document records final full-suite completion evidence.

Completion evidence:

- Changed: `packages/access-router-react/test-docs-consumer/snippets-mapping.md`, `docs/tasks/20260813-105538-http-errors-review-remediation.md`
- Contract: no runtime or public API behavior changed; only stale docs-block SHA-256 inventory rows were reconciled with the current `access-router-react` README and website documentation snippets.
- Verified: `pnpm --filter @web-ts-toolkit/access-router-react test`
- Result: `access-router-react` NodeNext and Bundler declaration checks passed; 11 test files and 198 tests passed.
- Verified: `pnpm test`
- Result: full repository test suite passed, including the previously reconciled `access-router`, `access-router-client`, and `access-router-react` package tests plus `apps/react-vite` tests.

## Dependency And Parallelization Guidance

| Task   | Suggested owner               | Can start                   | Shared hotspots                                                |
| ------ | ----------------------------- | --------------------------- | -------------------------------------------------------------- |
| HTE-01 | Runtime encapsulation agent   | Immediately                 | `status.ts`, main test file                                    |
| HTE-02 | HTTP contract agent           | After HTE-01                | `base.ts`, response-handler validators, docs                   |
| HTE-03 | Type/runtime validation agent | After HTE-02                | `types.ts`, `serialize.ts`, docs                               |
| HTE-04 | Ownership agent               | After HTE-03                | `base.ts`, `types.ts`, `serialize.ts`, main test file          |
| HTE-05 | Maintainability agent         | After HTE-02 and HTE-04     | error class/message files, main test file                      |
| HTE-06 | Packaging agent               | After HTE-03 and HTE-04     | `package.json`, test script, consumer fixtures                 |
| HTE-07 | Documentation agent           | After HTE-02 through HTE-05 | README, website docs, public JSDoc                             |
| HTE-08 | Performance investigator      | After HTE-03 through HTE-05 | investigation first; no shared production ownership by default |
| HTE-09 | Independent reviewer          | Last                        | review-only except task evidence                               |

- HTE-06 and HTE-07 can run in parallel after their prerequisites if HTE-06 owns consumer harnesses and HTE-07 owns prose/JSDoc; coordinate any README compile fixture changes.
- HTE-05 and HTE-06 can run in parallel only after HTE-04, because they should not edit the same implementation files.
- Agents editing the single runtime test file must work sequentially or use separate focused test files to reduce conflicts.
- Never run package test scripts concurrently when their dependency closures rebuild shared `dist/` directories.

## Deferred Maintainer Decisions

No decision blocks HTE-01.

1. HTE-02: confirm whether neutral `HttpError` intentionally supports non-error 100-399 statuses. Recommended contract is 400-599 because the package, serializers, and downstream response handler consistently describe errors.
2. HTE-03: choose typed-input preservation versus runtime rejection/filtering for validation entries. Recommended contract is typed input plus runtime validation in the explicitly named validation helper, so JavaScript callers receive the same guarantee.
3. HTE-04: confirm shallow snapshot semantics for top-level collections. Recommended contract snapshots arrays/records but does not clone arbitrary nested entries.
4. HTE-01: confirm whether direct map inspection is a supported external contract. Recommended contract keeps the registry private and exports query helpers.
5. HTE-08: resource limits require maintainer policy; no limits should be guessed by an agent.

## Definition Of Done

- Every task is `completed`, `deferred` with rationale and residual risk, or `cancelled` with explanation.
- Confirmed global mutation and invalid-status defects have failing-before/passing-after regressions.
- Runtime serializers and exported TypeScript types make equivalent claims.
- Structured collection ownership is explicit, tested, and documented.
- Specific error classes, names, inheritance, default messages, and named imports remain stable unless a release-note-backed decision says otherwise.
- Installed ESM/CJS runtime and strict NodeNext/Bundler consumers pass against release-like tarballs.
- README, website docs, emitted declarations, and runtime behavior agree.
- No cause, stack, or unintended internal field enters AIP-193 or RFC 9457 payloads.
- Targeted downstream and full repository checks pass or exact unrelated blockers are recorded.
- An independent reviewer completes HTE-09 and records final evidence here.
