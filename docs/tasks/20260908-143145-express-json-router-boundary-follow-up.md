# Express JSON Router Boundary Follow-Up

Created: 2026-09-08 14:31:45 (local time)

## Objective

Close residual routing-contract, security-test, installed-consumer, and documentation gaps in `packages/express-json-router`. This is a new review phase after the completed [original remediation](20260812-221158-express-json-router-review-remediation.md), not a repetition of its implementation backlog. This document authorizes future task execution; this review changed no package code.

Scope: router registration and middleware boundaries, runtime tests, exported types and emitted declarations, package metadata/build configuration, installed-consumer tests, README/AI guidance, and matching website documentation.

Non-goals: redesigning response serialization, adding authentication or validation frameworks, replacing Express, widening the deliberately string-only path contract, changing dependency ownership, or optimizing without measurements. Preserve `original`, default-only class export, named public types, constructor snapshots, and endpoint metadata unless an approved task explicitly changes a contract.

## Coverage And Evidence

- Inspected `src/index.ts`, runtime tests, package metadata/build configuration, existing emitted declaration files, strict declaration fixtures, packed-consumer harness, README, `llms.txt`, and website documentation. Consulted response-handler error delegation/redaction and related Express task documents to avoid duplicating ownership.
- The original EJR-01 through EJR-10 are marked completed. Residual verification gaps below reference those tasks; their historical completion evidence is not a current baseline.
- Worktree inspection found unrelated task and OIDC-store changes. Preserve them. Only this plan and a backlink in the original plan are intended review edits.
- Ran an inline Node ESM/Supertest differential probe from `packages/express-json-router` against existing `dist/index.mjs` and installed Express. For `.route('/x').get(...).head(...)`, native Express selected the explicit HEAD handler; JsonRouter selected GET. For `.route('/x').all(nextRoute).get(...)`, native Express reached the 404 fallback; JsonRouter ran the later GET handler and returned 200. Probe handlers that manually sent responses returned `undefined`.
- The same fresh-process probe threw `Error('secret-internal-value')` through an uncustomized router: status 500, body `{ "message": "Internal Server Error" }`. This supports the test-gap finding, not a claim of current production disclosure.
- An initial probe returned Express response objects from manually sending callbacks and produced terminal-error logs. It was corrected to use void-returning callbacks; the routing outcomes above were reproduced without those logs. No response-handler defect is inferred from that first probe.
- Existing build freshness was not established; source inspection agrees with the observed builder implementation. Rebuild before recording regression evidence during implementation.
- Full/package tests, compiler checks, lint, fresh builds, tarball installation, and performance benchmarks were not run during analysis. They are future verification requirements, not claimed passes. No comprehensive downstream application or dependency vulnerability audit was performed.
- No request-time performance defect was established. Handler flattening and wrapper construction happen at registration; defensive metadata copies happen on inspection. Do not infer throughput gains from fewer source lines.

## Priorities And Coordination

Use the original plan's impact scale: P0 is a confirmed authorization/required-middleware bypass; P1 is broken advertised routing or package usability; P2 is encapsulation, type, documentation, and testability work; P3 is optional work requiring policy or measurement. The route-group issue is P1 investigation because behavior is confirmed but the intended compatibility contract is not. No P0 vulnerability is claimed.

- Runtime test ownership: EJB-02 investigation first, then EJB-01, then EJB-03. EJB-02 should record evidence in this document without editing shared tests until its investigation establishes whether implementation is authorized.
- EJB-04 and EJB-05 may edit their separate harness/fixture files in parallel with runtime work. EJB-06 follows EJB-03 to avoid competing documentation edits. EJB-07 is independent final review.
- `src/index.ts`, the main runtime test file, README, and this document are shared hotspots. One agent owns each at a time; the coordinator merges task-status/evidence updates.
- Never run workspace package builds/tests concurrently. Their scripts rebuild shared transitive `dist/` outputs; serialize verification even when edits are parallel.
- Do not manually edit generated `dist/` or ignored `src/index.js`. Keep serialization, error redaction, hook lifecycle, and streaming in `express-response-handler` rather than duplicating its pipeline.
- Statuses: `pending`, `in_progress`, `blocked`, `completed`, `deferred`, `cancelled`. Start only after dependencies complete; record exact blockers and owners. Append changed files, commands/results, and follow-ups on completion.

## Verification

Commands below run from the repository root unless stated otherwise. Prerequisites: repository dependencies installed with `pnpm install`, supported Node version (package requires Node >=22), and tar/package-manager availability for the existing packed-consumer harness. Fresh consumer installation may require registry access/cache.

- V1: `pnpm --filter @web-ts-toolkit/express-json-router test`. This rebuilds the dependency closure, runs strict NodeNext/Bundler checks, then runtime and production-transformed packed-consumer tests.
- V2: `pnpm --filter @web-ts-toolkit/express-json-router typecheck`, only after a fresh build. Use for focused declaration iteration; it does not replace V1's installed-consumer checks.
- V3: `pnpm exec eslint "packages/express-json-router/**/*.{ts,mts,cts,js}"` and `git diff --check`.
- V4: Run `pnpm --filter @web-ts-toolkit/access-router test` and `pnpm --filter @web-ts-toolkit/message-service test` serially if runtime or public contracts change. Also run `pnpm --filter @web-ts-toolkit/express-response-handler test` if response-handler integration changes.
- V5: Final integration runs `pnpm lint`, `pnpm build`, and `pnpm test` serially. Record exact failures and whether independently reproduced as pre-existing; do not inherit old blocker claims from the August plan.
- Behavioral fixes require a regression failing before the fix and passing after it where practical. Test-only improvements must demonstrate that the assertion distinguishes the missing behavior, not just add another green case. Performance changes require a representative measured baseline and after-result.

## Executable Tasks

### Task EJB-01: Restore Trustworthy Runtime Regression Fixtures

Status: completed

Kind: improvement

Priority: P2; security-default and mutation tests currently overstate what they verify.

Suggested agent: runtime/security test specialist

Dependencies: EJB-02

Primary ownership: `packages/express-json-router/test/express-json-router.test.ts`. Avoid production changes unless a newly reproduced defect receives its own task.

Finding and references:

- `test/express-json-router.test.ts:34-50` under the package defines a raw-message provider as the default and installs it after every test. Generic-error expectations at lines 459-509 therefore exercise custom disclosure, not the real default. `src/index.ts:250-255` captures dependency defaults, and `packages/express-response-handler/src/error-format.ts:122-125` redacts generic errors. A current fresh-process probe confirmed redaction.
- `packages/express-json-router/test/express-json-router.test.ts:634-660` passes an inline middleware array to the constructor but mutates a different array. Existing tests at lines 579-632 do cover actual mutation, so the production snapshot is not shown broken.
- Follow-up to completed EJR-01 and response-handler ERH-04 in `docs/tasks/20260809-100934-express-response-handler-review-remediation.md`; do not duplicate their production fixes.

Requirements:

1. Capture and restore actual initial static defaults, including hooks; configure raw-message behavior explicitly only in tests that need it. Keep isolation deterministic when a single test or reordered tests run.
2. Add a default-router generic-error regression with a secret-bearing message, a redacted response, and original-error availability to the server-side error hook. Cover direct and builder registrations.
3. Pass the named source array to the constructor before mutating it in the ordering test. Include nested source-array mutation, preserving middleware identity and order on routes registered before and after mutation.

Acceptance criteria:

- Default error tests fail if raw internal messages are exposed; intentional provider customization still works without contaminating other tests.
- Mutation tests exercise the actual captured input and demonstrate unchanged order/behavior across source and public-copy mutation.
- No production error-provider policy is weakened to accommodate old expectations.

Verification: V1 and V3; record focused default-test execution and meaningful negative/mutation evidence.

#### EJB-01 Completion evidence (added 2026-09-09)

EJB-02 disposition respected: retained independent-registration builder sugar per the EJB-02 record (no-action on runtime, docs correction to EJB-06, boundary pins to EJB-03). No builder semantics changed; new builder test asserts only the retained contract (builder GET returns redacted default 500 like a direct registration).

Changed files: `packages/express-json-router/test/express-json-router.test.ts` only. No production changes; no CHANGELOG update.

Test changes:

- Captured actual initial static defaults at module load (`initialStaticDefaults`: `errorMessageProvider`, `preJson`, `postJson`, `preError`, `postError` from `JsonRouter`) and `resetJsonRouter()` now restores those instead of installing a raw-message provider. Added `beforeEach(reset)` alongside `afterEach(reset)` so isolation is deterministic for single-test and reordered runs. Raw-message provider renamed to `rawErrorMessageProvider` and set explicitly only in the two tests that need custom disclosure (`keeps existing routers isolated...` sets raw before the first router, then custom for the second; `applies post-json and error hooks...` sets raw plus hooks).
- Added two default-router generic-error regressions (direct `router.get('/boom')` and builder `router.route('/builder-boom').get(...)`): each throws `Error('failure bearing <secret>')` through an otherwise uncustomized router with only a `preError` observer set, expects 500 `{ message: 'Internal Server Error' }`, asserts the serialized body does not contain the secret, and asserts the captured `preError` error message contains the secret.
- Fixed `preserves router-level middleware order...` to pass the named `source` array (containing `middlewareA` plus nested `nestedSource = [middlewareB, [middlewareC]]`) to the constructor before mutating it. After registering `/first`, the test mutates top-level `source`, nested `nestedSource`, and the public `router.middlewares` copy, then registers `/second`. It asserts `router.middlewares` identity (`toBe` on each of A/B/C, length 3) and behavior (`calls` equals `['a','b','c','a','b','c']` across both routes).

Commands/results (from repo root unless noted, serialized, no concurrent builds):

- V1: `pnpm --filter @web-ts-toolkit/express-json-router test` — pass: 2 test files, 35 tests (was 33; +2 new redaction regressions), includes rebuild + NodeNext/Bundler typechecks + packed-consumer tests.
- Focused: `vitest run test/express-json-router.test.ts -t "redacts generic errors"` — 2 passed, 30 skipped; `-t "preserves router-level middleware order"` — 1 passed, 31 skipped; `-t "isolated from later static"` — 1 passed, 31 skipped.
- V3: `pnpm exec eslint "packages/express-json-router/**/*.{ts,mts,cts,js}"` — clean; `git diff --check` — clean.
- Negative evidence (from `packages/express-json-router` against fresh `dist/index.mjs`): default router throwing secret-bearing error returned `500 {"message":"Internal Server Error"}` (`leaks=false`); same route with a raw per-instance `errorMessageProvider = (e) => e.message` returned `500 {"message":"failure bearing secret-..."}` (`leaks=true`). The new `toEqual({ message: 'Internal Server Error' })` + `not.toContain(secret)` assertions therefore fail under raw disclosure and pass under the real default. Intentional customization still works: the isolation test (explicit raw then custom) and `applies static handler defaults` (explicit custom) pass, and `afterEach`/`beforeEach` restore real defaults so no contamination leaks into the redaction tests regardless of order.
- Mutation evidence (inline probe against fresh `dist/index.mjs`): `router.middlewares` identity held (`[0]===mwA`, `[1]===mwB`, `[2]===mwC`) before and after mutating the actual `source` top level (`length=0` + push) and nested array, while `source`/`nested` confirmed mutated — proving the test exercises the captured input, not an unrelated array. The passing ordering test then demonstrates unchanged order/behavior (`a,b,c` on both `/first` and `/second`) across source, nested-source, and public-copy mutation.
- No production error-provider policy weakened: `src/index.ts` untouched; `error-format.ts:122-125` redaction untouched.

### Task EJB-02: Resolve Fluent Builder Route-Grouping Semantics

Status: completed

Kind: investigation

Priority: P1; the Express-shaped builder changes observable HEAD dispatch and route-skip control flow.

Suggested agent: Express routing compatibility investigator

Dependencies: none

Primary ownership: analysis of `packages/express-json-router/src/index.ts:348-356,389-399`, focused temporary differential probes, and this task's decision record. No speculative runtime rewrite.

Finding:

Every builder method delegates to a top-level router registrar, creating a separate native route. The differential results in Coverage confirm that this is not native `express.Router().route(path)` grouping. An `.all()` guard using `next('route')` does not skip the later builder GET registration. Security impact depends on application assumptions; this is not proof that a real authorization boundary is compromised. Current builder tests at `packages/express-json-router/test/express-json-router.test.ts:160-182,218-236` cover availability and ordinary responses rather than this grouping contract. This extends completed EJR-03/EJR-09 rather than repeating method-parity work.

Requirements:

1. Rebuild and compare native and JSON builders for GET-before-HEAD, ALL plus `next('route')`, repeated GET registrations, `next('router')`, normal `next()`, and interleaved direct registrations. Use handlers that do not return manually sent Express responses.
2. Inspect repository builder callers to establish whether native grouping is relied on. Bound the search to JsonRouter consumers and report inspected paths and examples.
3. Recommend either documented independent-registration sugar or shared native Route semantics. Explain constructor-middleware frequency, response-handler ownership, registration order, and endpoint metadata implications before choosing a design.
4. Obtain maintainer approval before changing externally observable semantics. If implementation is needed, create a linked, fully specified follow-up task with tests/docs/release-note requirements; make EJB-07 depend on it. If retained, hand the approved contract and examples to EJB-03/EJB-06.

Acceptance criteria:

- A reproducible differential matrix and evidence-backed recommendation are appended here, including compatibility risks and an implement/defer/no-action disposition.
- Any unresolved policy choice names the maintainer as decision owner; implementation is blocked, not guessed. Investigation can complete without production changes.

Verification: fresh build through V1, then recorded differential probes and caller evidence review. V1 passing alone does not resolve the contract question.

#### EJB-02 Investigation Record (added 2026-09-09)

Repro method: fresh `pnpm --filter @web-ts-toolkit/express-json-router... build` from repo root, then V1, then differential probes from `packages/express-json-router` against fresh `dist/index.mjs` plus installed Express/Supertest. All probe handlers are void-returning: native handlers use `void res.json(...)` / `void next(...)`, JSON handlers return plain values (`() => ({...})`) or `void next(...)`. No probe handler returns a manually sent Express response. Each scenario builds two apps (native `express.Router()` vs `new JsonRouter()` + `app.use(r.original ?? r)`), each with a trailing 404 fallback.

Differential matrix:

| #   | Scenario                                                               | Native result                                 | JsonRouter result                                      | Match |
| --- | ---------------------------------------------------------------------- | --------------------------------------------- | ------------------------------------------------------ | ----- |
| A   | `.route('/x').get(...).head(...)`, HEAD `/x`                           | 200, explicit HEAD handler runs (`x-h: head`) | 200, GET handler runs (`x-h: get`), body HEAD-stripped | DIFF  |
| B   | `.route('/x').all(next('route')).get(...)`, GET `/x`                   | 404 fallback (guard skips route)              | 200, later GET runs                                    | DIFF  |
| C   | `.route('/x').get(h1).get(h2)`, GET `/x`                               | 200 first handler                             | 200 first handler                                      | SAME  |
| D   | `.route('/x').get(next('router')).get(...)`, GET `/x`                  | 404 fallback                                  | 404 fallback                                           | SAME  |
| E   | `.get(nextFn, final)` + `.get(...)` chained, GET `/x`                  | 200 same-call final                           | 200 same-call final                                    | SAME  |
| E2  | `.get(nextOnly).get(final)`, GET `/x`                                  | 200 second registration                       | 200 second registration                                | SAME  |
| F   | Direct `router.get('/x')` then `router.route('/x').get(...)`, GET `/x` | 200 direct handler                            | 200 direct handler                                     | SAME  |
| G   | Constructor middleware + chained `.get(nextOnly).get(final)`, GET `/x` | 200, middleware runs 1x                       | 200, middleware runs 2x                                | DIFF  |

Mechanism: each builder method call delegates to the top-level registrar (`src/index.ts:396-398` -> `348-356`), creating a separate native route per call with its own `responseHandler.handleResponse([...middlewares, ...callbacks])` wrapper. A/B/G follow structurally: (A) Express falls back to the first-registered GET route for HEAD requests, so the separately registered HEAD route never matches; (B) `next('route')` only skips layers within one native Route, so it cannot skip the later separately registered GET route; (G) constructor middleware is copied into every registration wrapper, so `next()`-chaining across builder registrations re-runs it. D/E2 coincide because plain `next()` and `next('router')` operate across routes/routers regardless of grouping. Refined HEAD-marker probe additionally confirmed `getEndpoints()` records `[{"method":"GET","path":"/x"},{"method":"HEAD","path":"/x"}]` (one entry per builder call, call order).

Caller inspection (bound to JsonRouter consumers; `apps/` has no JsonRouter usage):

- `.route(` occurrences: only `packages/express-json-router/test/express-json-router.test.ts:162,219,392,732`, decl fixtures (`test-decl-consumer/decl-consumer.strict.mts:58,95,135,157,170`, `.cts:20`), `README.md:64,74`, `llms.txt:33,57-58`. No `.route(` builder usage in `access-router/src`, `message-service/src`, or `apps/*`.
- `access-router/src/routers/model-router-collection-routes.ts:43,185`, `model-router-document-routes.ts:61,101,384`, `model-router-subdocument-routes.ts:28,99`, `data-router.ts:91,176`, `root-router.ts:179` (plus `model-router.ts:52`, `data-router.ts:58` constructors): all direct `router.get(...)` registrations; no builder chaining, no `next('route')`. `openapi/router.ts:55,67,72` uses a plain `express.Router()`, not JsonRouter.
- `message-service/src/route-factory.ts:232,234,265`: `new JsonRouter('', authMiddleware)` plus direct `router.post(...)` / `router.get(...)`; no builder chaining, no `next('route')`.
- `next('route')` / `next('router')`: zero occurrences in JsonRouter consumer code; only `express-response-handler` own tests (`middleware.test.ts:1235,1254`, `lifecycle-safety.test.ts:683,727`) proving the wrapper forwards those signals.
- Doc conflict: `website/docs/packages/express-json-router.md:81` claims `router.route(path)` gives "grouped handlers for the same path", which the matrix disproves for A/B/G.

Recommendation (evidence-backed): retain current behavior and document the builder as independent-registration sugar, i.e. each builder call is exactly equivalent to a direct `router.METHOD(path, ...)` call (separate native route, own response-handler wrapper including constructor-middleware copies, own `getEndpoints()` entry). Design implications considered:

- Constructor-middleware frequency: per-registration copies (G: 2x when chained across builder calls) vs 1x under a shared native Route. Switching would change auth/counting middleware behavior observably.
- Response-handler ownership: one wrapper per registration today; a shared Route would need a single wrapper or per-method wrappers with different error scoping.
- Registration order: call order already holds; but A/B show ordering alone does not reproduce native Route dispatch.
- Endpoint metadata: one entry per builder call today (duplicates possible, e.g. F records two `GET /x`); a shared Route would need a dedup/merge policy.
- Compatibility risks of switching to native Route semantics: B flips 200->404 for ALL-guard chains, A flips GET-served->HEAD-served, G halves middleware executions. All are externally observable breaking changes requiring a major release and migration notes.
- Compatibility risks of retaining: users copying the Express `.all(guard-with-next('route'))` guard pattern get no skip protection (B); users expecting HEAD specialization silently serve GET (A). Mitigation is documentation, not runtime: show guard-per-registration or constructor middleware instead of `next('route')` guards, and note HEAD falls back to GET.

Disposition: no-action on runtime (defer native-Route redesign indefinitely); docs correction handed to EJB-06 (fix "grouped handlers" claim at website line 81 and propagate the sugar contract); boundary-test additions handed to EJB-03 (A/B/G regression pins for the retained contract; EJB-03 must not silently assert native grouping). No linked implementation task file created because no runtime change is recommended. Unresolved policy choice (whether to ever adopt shared native Route semantics) names the project maintainer as decision owner; implementation is blocked pending maintainer approval, and any future native-Route task becomes an EJB-07 dependency at creation time.

Completion evidence:

- Changed files: `docs/tasks/20260908-143145-express-json-router-boundary-follow-up.md` only (EJB-02 Status + this record). No production code, test, or config changes.
- Fresh build: `pnpm --filter @web-ts-toolkit/express-json-router... build` from repo root — success (tsup CJS+ESM+DTS, `dist/index.mjs` 7.85 KB).
- V1: `pnpm --filter @web-ts-toolkit/express-json-router test` from repo root, serialized — 2 test files, 33 tests, all passed (includes rebuild + NodeNext/Bundler typechecks + packed-consumer tests).
- Probes: `/tmp/ejb02-probe.mjs` (8-scenario native-vs-JSON matrix, copied into package dir for module resolution then removed) — 5 SAME (C/D/E/E2/F), 3 DIFF (A/B/G); plus inline HEAD-marker probe (`HEAD x-h=get`, `GET x-h=get`, endpoints list) confirming A mechanism. No terminal-error logs; all handlers void-returning.
- Caller inspection: greps for `.route(`, `JsonRouter|express-json-router`, `next(['"]rou` across `packages/`, `apps/` (no JsonRouter use), `website/docs`; inspected paths/examples listed above.
- `git diff --check` — clean.

### Task EJB-03: Pin Native Middleware And Error Boundaries

Status: completed

Kind: improvement

Priority: P2; clarify where JSON wrapping stops and application error handling begins.

Suggested agent: Express integration specialist

Dependencies: EJB-01, EJB-02

Primary ownership: `packages/express-json-router/test/express-json-router.test.ts`, boundary JSDoc in `packages/express-json-router/src/index.ts`, and boundary examples in `packages/express-json-router/README.md`.

Finding and references:

- `packages/express-json-router/src/index.ts:377-383` delegates `use` and `param` and returns the underlying native router. Consequently `.use(...).get(...)` is native registration, not JSON-aware chaining, and does not record JSON endpoint metadata.
- `packages/express-response-handler/src/create-handler.ts:643-655` delegates explicit `next(error)` rather than formatting it. Router tests at `packages/express-json-router/test/express-json-router.test.ts:419-430,514-539` cover registration and successful middleware, not a complete failure boundary.
- Native error middleware was deliberately selected in completed EJR-04; response-handler ERH-03 owns explicit-next semantics. This task adds router-level evidence and guidance, not another error pipeline.

Requirements:

1. Test thrown/rejected JSON callbacks versus explicit `next(error)`, synchronous/asynchronous failures in native `use`/`param`, and malformed `express.json()` input mounted before the router.
2. Assert final error-handler invocation, response ownership, and that guarded endpoint handlers do not run after native failures. Use a deliberately controlled application final handler; do not imply JsonRouter sanitizes all upstream failures.
3. Pin `use`/`param` return identity and demonstrate separate JSON registration statements. Document native chaining, middleware ordering, base-path scope, and the fact that native registrations are outside `getEndpoints()`.
4. Add builder contract assertions only for the approved EJB-02 disposition. Preserve native delegation and return types unless a separate approved contract-change task says otherwise.

Acceptance criteria:

- The tested boundary explains which failures are JSON-formatted and which reach native error middleware, without double writes or silently skipped error handlers.
- Installed README and emitted JSDoc enable consumers to avoid accidental native chaining and misplaced final middleware.
- No new serializer, global error registry, or authentication abstraction is introduced.

Verification: V1, V3, and V4 when integration behavior changes. Review JSDoc in both emitted declaration flavors.

#### EJB-03 Completion evidence (added 2026-09-09)

EJB-01/EJB-02 records respected: no builder semantic change (tests pin the retained independent-registration sugar only); new tests use real defaults (no raw-message provider installed; thrown-error tests assert the redacted default 500). No new serializer, global error registry, or auth abstraction; response pipeline untouched in `express-response-handler`.

Changed files (only): `packages/express-json-router/test/express-json-router.test.ts` (+7 tests), `packages/express-json-router/src/index.ts` (boundary JSDoc on `use`/`param`/`route`/`getEndpoints`, comments only, zero logic change), `packages/express-json-router/README.md` (+`Native Middleware And Error Boundaries` and `Route Builder Contract` sections). No CHANGELOG update; packed-consumer test and decl-consumer fixtures untouched.

Boundary matrix (all tests use deliberately controlled app final error handlers; JsonRouter is not claimed to sanitize upstream failures):

| #   | Failure source                                     | Result                                                                                                                                                        | Final handler                  | Guarded JSON handler                                                                                                                                   |
| --- | -------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------ |
| 1   | sync throw in JSON callback                        | 500 `{ message: 'Internal Server Error' }`, secret redacted                                                                                                   | not invoked                    | n/a                                                                                                                                                    |
| 2   | async reject in JSON callback                      | 500 redacted, same as sync                                                                                                                                    | not invoked                    | n/a                                                                                                                                                    |
| 3   | explicit `next(error)` sync/async in JSON callback | 599 `{ final }` owned by app handler                                                                                                                          | invoked once per call          | second registration callback skipped                                                                                                                   |
| 4   | native `use` sync throw / async reject             | 598 `{ final }` owned by app handler                                                                                                                          | invoked                        | skipped                                                                                                                                                |
| 5   | native `param` sync throw / async reject           | 597 `{ final }` owned by app handler                                                                                                                          | invoked                        | skipped                                                                                                                                                |
| 6   | malformed `express.json()` mounted before router   | 400 `{ final: 'body-parser', type: 'entity.parse.failed' }`                                                                                                   | invoked with body-parser error | skipped                                                                                                                                                |
| 7   | `use`/`param` return identity                      | `=== router.original`, `!== router`                                                                                                                           | n/a                            | n/a; native regs excluded from `getEndpoints()`; `basePath` not prepended to native args; broadly mounted `use` runs before JSON routes in mount order |
| 8   | builder A/B/G pins (EJB-02 disposition)            | HEAD served by GET handler; `all(next('route'))` does not skip later GET (200, not 404); constructor middleware runs 2x across chained `next()` registrations | n/a                            | n/a                                                                                                                                                    |

Distinguishing evidence (fresh `dist/index.mjs` probes before writing tests): throw -> `500 redacted + final[]`; `next(error)` -> `599 + final[1]`; use-sync/async -> `598 + guarded=false`; param-sync/async -> `597 + guarded=false`; malformed -> `400 entity.parse.failed + guarded=false`; `useRet===original true`; HEAD `x-handler=get`; guard-target `200`; chained constructor middleware `count=2`. Each new assertion fails if the boundary is crossed the other way (e.g. explicit-next test expects 599/final-calls and would fail under JSON formatting; thrown tests expect `finalCalls` empty and would fail under delegation).

Commands/results (from repo root, serialized):

- V1: `pnpm --filter @web-ts-toolkit/express-json-router test` — pass: 2 test files, 42 tests (was 35; +7 new), includes rebuild + NodeNext/Bundler typechecks + packed-consumer tests (README snippet compile passes).
- V3: `pnpm exec eslint "packages/express-json-router/**/*.{ts,mts,cts,js}"` — clean; `git diff --check` — clean.
- V4: skipped with rationale — no integration behavior change (`src/index.ts` diff is comments-only: one JSDoc line replaced, rest added; zero logic change). No downstream package affected.
- JSDoc review: `dist/index.d.mts` and `dist/index.d.ts` both contain the new `use`/`param`/builder boundary JSDoc after the V1 rebuild.

Follow-up (no change made; for EJB-07/maintainer): `use`/`param` types are `Parameters<ExpressRouter[...]>`, which resolves to the last Express overload, so strict `tsc` only accepts `router.use(path, subApplication)` while runtime single-arg/handler forms work (all runtime probes pass). Preserved per the no-contract-change constraint; a dedicated task is needed if the public types should expose the full native overloads. README examples were written to strictly compile within this constraint (constructor middleware + `router.param` + separate JSON statements).

### Task EJB-04: Verify A Minimal Packed Installation

Status: completed

Kind: improvement

Priority: P2; current consumer provisioning can conceal missing transitive dependencies.

Suggested agent: package artifact test specialist

Dependencies: none

Primary ownership: `packages/express-json-router/test/packed-consumer-compatibility.test.ts` and focused consumer fixtures. Preserve package dependency policy.

Finding:

`packages/express-json-router/test/packed-consumer-compatibility.test.ts:201-228` installs all closure packages, Express, and `@types/express` directly despite already providing closure tarball overrides. This proves a fully provisioned consumer works, not that installing the router supplies its declaration/runtime dependency closure. The current manifest correctly declares Express/types at `packages/express-json-router/package.json:44-49`; metadata assertions mitigate but do not eliminate this test weakness. Residual of completed EJR-07/EJR-08.

Requirements:

1. Add or adapt a minimal consumer with only JsonRouter as its application dependency plus necessary compiler tooling. Retain production-transformed closure tarballs through overrides; do not explicitly install closure members or `@types/express` to make it pass.
2. Use package-root imports, ESM/CJS loading, strict NodeNext/Bundler declaration resolution, and `skipLibCheck: false`. Avoid examples importing sibling packages directly in the minimal case; keep the richer documentation/integration consumer where needed.
3. Preserve manifest transformation, allowlist, cleanup, and existing installed README/AI snippet checks. Do not edit the publish tool to bypass missing dependency edges.

Acceptance criteria:

- The fresh minimal consumer succeeds using the package's declared dependency graph.
- A controlled staged-manifest omission of a required dependency is detected by the minimal-consumer check, with negative evidence recorded without committing intentionally broken metadata.
- The existing richer consumer coverage remains intact without unnecessary duplicated tarball preparation.

Verification: V1 and V3; record install/tool prerequisites or exact registry blockers.

#### EJB-04 Completion evidence (added 2026-09-09)

EJB-02/EJB-01/EJB-03 records respected: no runtime, builder-semantics, or error-policy changes; packed-consumer test file and focused consumer fixtures only. No CHANGELOG update; publish tool untouched (no missing-edge bypass); `package.json:44-49` dependency declarations untouched.

Changed files: `packages/express-json-router/test/packed-consumer-compatibility.test.ts` only.

Test changes:

- Added `installMinimalPackedConsumerWithRouterTarball()` / `installMinimalPackedConsumer()`: minimal consumer declares only `@web-ts-toolkit/express-json-router` (`file:` tarball) plus compiler tooling (`typescript`, `@types/node`). Closure tarballs are retained through `pnpm-workspace.yaml` overrides only; no closure member and no `@types/express` is explicitly installed. `express` and `@types/express` resolve transitively via the declared dependency graph (regular dependencies in `package.json:44-49`).
- Added `writeMinimalConsumerFiles()` / `runMinimalConsumerSmokeTests()`: package-root imports only, ESM (`minimal-esm.mjs`, entry must end `/index.mjs`) + CJS (`minimal-cjs.cjs`, entry must end `/index.js`) loading, strict NodeNext (`.mts`/`.cts`) + Bundler (`.ts`) declaration checks with `skipLibCheck: false`. No sibling-package imports in the minimal case (unlike the richer `consumer.nodenext.mts`, which keeps its `@web-ts-toolkit/http-errors` import).
- Added `prepareBrokenRouterTarball()`: stages a temp-only router manifest with `dependencies['@web-ts-toolkit/express-response-handler']` deleted, packs it to a separate `broken-tarballs/` dir (never overwrites the cached good tarballs, no duplicated closure prep). Committed metadata is never broken: the test first asserts the cached staged manifest still declares the dep.
- New tests: `runs a minimal consumer using only the declared dependency graph` (positive) and `detects a staged-manifest omission of a required dependency in the minimal consumer` (negative: same minimal check against the broken tarball must throw mentioning `@web-ts-toolkit/express-response-handler`).
- Preserved: manifest-transformation/allowlist test, closure-rewrite test, richer consumer test (`installPackedConsumer` / `runConsumerSmokeTests` / README+`llms.txt` snippet checks) all untouched.

Commands/results (from repo root unless noted, serialized):

- V1: `pnpm --filter @web-ts-toolkit/express-json-router test` — pass: 2 test files, 44 tests (was 42; +2 new), includes rebuild + NodeNext/Bundler typechecks + packed-consumer tests.
- Focused: `vitest run test/packed-consumer-compatibility.test.ts -t "minimal" --reporter=verbose` (from `packages/express-json-router`) — 2 passed, 3 skipped: minimal success 7994 ms, omission detection 1842 ms (fails fast at the `node minimal-esm.mjs` step with `Cannot find package '@web-ts-toolkit/express-response-handler'`).
- V3: `pnpm exec eslint "packages/express-json-router/**/*.{ts,mts,cts,js}"` — clean; `git diff --check` — clean.
- Negative evidence: the omission test asserts `.toThrow('@web-ts-toolkit/express-response-handler')` and passes, i.e. the minimal-consumer check fails on the broken staged manifest while the intact-manifest assertion (`toBeDefined()`) in the same test proves committed metadata still declares the edge. Broken manifest/tarball exist only under the test temp root (cleaned by `afterAll`); no broken metadata committed.
- Prerequisites: repo deps via `pnpm install`, Node >= 22, `pnpm`/`tar` availability; fresh consumer `pnpm install` fetches `express`/`typescript` from the registry (no blockers hit — installs succeeded).

### Task EJB-05: Make Thenable Type Coverage Discriminating

Status: completed

Kind: improvement

Priority: P2; the current positive fixture cannot detect narrowing the asynchronous contract.

Suggested agent: TypeScript declaration specialist

Dependencies: none

Primary ownership: `packages/express-json-router/test-decl-consumer/decl-consumer.strict.mts` and the matching CJS fixture where applicable. Avoid widening production types to accommodate an invalid test object.

Finding:

`packages/express-json-router/test-decl-consumer/decl-consumer.strict.mts:88-95` omits the callback's sixth return generic. `MaybePromise<unknown>` collapses to `unknown`, so the alleged thenable is accepted without proving PromiseLike compatibility. The constrained negative case at lines 99-102 does not repair the positive gap. Public source at `packages/express-json-router/src/index.ts:78-89` currently uses the correct `MaybePromise<Return>` shape. Residual of completed EJR-06, not a confirmed public-type defect.

Requirements:

1. Supply an explicit return generic and a structurally valid non-native `PromiseLike<T>` positive fixture, through callback assignment and direct/builder registration.
2. Keep negative checks for incompatible resolved values and malformed thenables, and preserve request/body/query/locals inference checks.

Acceptance criteria:

- NodeNext ESM/CJS and Bundler fixtures compile against fresh emitted declarations.
- Evidence shows that narrowing the asynchronous contract to native Promise would fail the positive check; malformed thenables still fail for the intended reason.

Verification: V2 after build, then V1 and V3. Do not manually modify committed generated declarations.

#### EJB-05 Completion evidence (added 2026-09-09)

No production changes (`src/index.ts` untouched; `MaybePromise<Return>` shape preserved, not widened). No CHANGELOG update. Packed-consumer test and runtime tests untouched (EJB-04/EJB-01/03 ownership respected).

Changed files (only): `packages/express-json-router/test-decl-consumer/decl-consumer.strict.mts`, `packages/express-json-router/test-decl-consumer/decl-consumer.strict.cts`.

Fixture changes:

- ESM (`.mts`) `assertTypedRegistrarGenerics`: `callback` now carries the explicit sixth return generic (`JsonRouterCallback<Params, ResBody, ReqBody, ReqQuery, Locals, ResBody>`) while keeping the request/body/query/locals inference body (`req.params.id`, `req.body.name`, `req.query.verbose`, `res.locals.requestId`). New `manualThenable<T>()` factory returns a structurally valid non-native `PromiseLike<T>` (local `ManualThenable<U> implements PromiseLike<U>` class, not a native `Promise` instance). Positive `promiseLikeCallback: JsonRouterCallback<..., ResBody>` returns `manualThenable<ResBody>({ ok: true })` via callback assignment, then registers through both direct (`router.get<..., ResBody>('/users/:id', callback, promiseLikeCallback)`) and builder (`router.route('/users/:id').post<..., ResBody>(promiseLikeCallback)`) paths.
- Kept negatives: `@ts-expect-error` on request-params shape (`req.params.missing`); new incompatible-resolved-value check (`() => Promise.resolve({ wrong: true })` assigned to `JsonRouterCallback<..., ResBody>` with `@ts-expect-error` directly above the rejected expression); preserved malformed-thenable check (`then: 'not-a-function'` with inner `@ts-expect-error`).
- CJS (`.cts`): added `ManualThenable<T> implements PromiseLike<T>` class plus explicit-six-generic `promiseLikeCallback`, registered via direct `router.get<...>(promiseLikeCallback)` and `builder.post<...>(promiseLikeCallback)`; added malformed-thenable negative (inner `@ts-expect-error` on the `then` line). Bundler config only includes `*.mts`, so the Bundler pass covers the ESM fixture while NodeNext covers both.
- Incidental fix required by explicit generics: the old `.mts` arrow `manualThenable = <T>(...)` is reserved syntax in `.mts`; written as `<T,>`.

Commands/results (from repo root unless noted, serialized):

- Fresh build: `pnpm --filter @web-ts-toolkit/express-json-router... build` — success (tsup CJS+ESM+DTS).
- V2: `pnpm --filter @web-ts-toolkit/express-json-router typecheck` after fresh build — pass (NodeNext ESM+CJS + Bundler, `skipLibCheck: false`, against fresh emitted declarations). An intermediate run caught and fixed three real fixture errors: `.mts` reserved `<T>` syntax (TS7060), mixing a `Return=unknown` callback into an explicit-`ResBody` registration (TS2345), and a misplaced `@ts-expect-error` (TS2578 unused directive) — confirming the directives are load-bearing.
- V1: `pnpm --filter @web-ts-toolkit/express-json-router test` — pass: 2 test files, 44 tests (unchanged count; includes rebuild + NodeNext/Bundler typechecks + packed-consumer tests).
- V3: `pnpm exec eslint "packages/express-json-router/**/*.{ts,mts,cts,js}"` — clean; `git diff --check` — clean.

Discriminating evidence (temp probes, removed afterwards, run from `packages/express-json-router` with `--ignoreConfig` NodeNext `tsc`):

- Narrowing probe (`/tmp/ejb05-probe-narrow.mts`): `ManualThenable<{ok:boolean}>` assigns to `PromiseLike<{ok:boolean}>` (control passes) while `const asNativePromise: Promise<{ok:boolean}> = thenable` requires `@ts-expect-error` to compile (exit 0 with the directive consumed). A narrowed contract `T | Promise<T>` would therefore reject the positive fixture.
- Old-weak-shape probe (`ejb05-probe-weak.mts` in package dir): `const weak: JsonRouterCallback<{id:string},{ok:boolean}> = () => ({ then: 'not-a-function' })` compiles clean (exit 0), proving the pre-fix fixture (omitted sixth generic, `MaybePromise<unknown>` = `unknown`) accepted garbage without proving `PromiseLike` compatibility.
- Malformed probe (`ejb05-probe-malformed.mts` in package dir, directive removed): fails with `TS2322: Type 'string' is not assignable to type '<TResult1 = ResBody, ...>(onfulfilled?: ...) => PromiseLike<...>'` at the `then` property (exit 2) — the intended reason, not an unrelated inference failure. The earlier intermediate V2 run likewise showed the incompatible-value negative failing as `Type 'Promise<{ wrong: boolean }>' is not assignable to type 'MaybePromise<ResBody>'` with the `then`-signature incompatibility chain.
- Generated declarations untouched: `dist/` rebuilt by the normal build only; no committed declaration was hand-edited.

### Task EJB-06: Reconcile Default And Routing Documentation

Status: completed

Kind: defect

Priority: P2; conflicting documentation misrepresents handler isolation.

Suggested agent: package documentation specialist

Dependencies: EJB-03

Primary ownership: `website/docs/packages/express-json-router.md`; consistency edits to `packages/express-json-router/README.md` and `packages/express-json-router/llms.txt` only as required.

Finding:

`website/docs/packages/express-json-router.md:147` says static properties proxy a shared default handler, while lines 151-161 correctly describe future-instance snapshots and a fresh `defaultHandler` result. README lines 87-92 and AI guidance lines 61-62 agree with the latter. This is an unresolved documentation residual explicitly covered by completed EJR-08; this follow-up owns only the remaining contradiction, not the original artifact implementation.

Requirements:

1. Replace the shared-instance claim with the actual static-default snapshot contract. State that mutating a newly retrieved handler is not how to reconfigure existing routers or future defaults.
2. Propagate approved EJB-02/EJB-03 routing and native-boundary guidance consistently across installed and website docs without duplicating large examples.
3. Review prose semantically, not only TypeScript fences; existing snippet compilation cannot detect this contradiction. Require release notes only if an approved follow-up changes runtime contracts.

Acceptance criteria:

- All three documentation surfaces agree on default timing, custom-handler ownership, builder semantics, and native delegation.
- Installed snippets still compile; the corrected prose contains no shared-mutable-default-handler claim.

Verification: V1 for installed snippets, V3, and explicit prose comparison against source/getter declaration JSDoc.

#### EJB-06 Completion evidence (added 2026-09-09)

EJB-02/EJB-03 dispositions propagated, no runtime semantics changed (docs only, no `src/`, test, fixture, or CHANGELOG changes). EJB-03 README boundary sections (`Native Middleware And Error Boundaries`, `Route Builder Contract`) preserved and extended only by one clarifying bullet.

Changed files (only):

- `website/docs/packages/express-json-router.md` (primary): fixed `route(path)` "grouped handlers" claim (~line 81) to independent-registration sugar; replaced shared-instance proxy claim (line 147) with static-default snapshot contract incl. mutating a retrieved handler reconfigures nothing; extended Behavior/API/`use`/`param`/`getEndpoints`/`defaultHandler`/hooks prose with approved EJB-02/EJB-03 builder + native-boundary guidance, pointing to the installed README for the full table instead of duplicating large examples.
- `packages/express-json-router/llms.txt`: extended static-default bullets with mutate-retrieved-handler negation plus concise builder-sugar, thrown-vs-`next(error)`, and `use`/`param` native-delegation bullets.
- `packages/express-json-router/README.md`: one added bullet — mutating a `defaultHandler`-retrieved handler does not reconfigure existing routers or future defaults.

Prose comparison vs source/JSDoc (`src/index.ts:276-282` getter, `324-327` constructor; confirmed present in fresh `dist/index.d.mts`/`dist/index.d.ts` after V1 rebuild): source contract is "fresh handler from current static defaults; existing routers keep constructed handler; constructor takes snapshot of static defaults". Corrected prose states exactly this plus the explicit negation (mutating a retrieved handler reconfigures neither existing routers nor future defaults). Remaining "shared mutable" strings in the website doc are both negations ("not a proxy to a shared mutable handler instance", "it is not a shared mutable instance"), not claims. No shared-instance claim remains on any of the three surfaces.

Release notes: none required — no approved follow-up changed runtime contracts; docs-only change.

Commands/results (from repo root, serialized):

- V1: `pnpm --filter @web-ts-toolkit/express-json-router test` — pass: 2 test files, 44 tests (installed README/llms snippet checks included).
- V3: `pnpm exec eslint "packages/express-json-router/**/*.{ts,mts,cts,js}"` — clean; `git diff --check` — clean.
- Prose checks: `grep` confirms `independent-registration sugar` + `does not reconfigure` present on all three surfaces; old positive claims (`proxy.*shared default handler`, `grouped handlers for the same path`) return zero matches.

### Task EJB-07: Independently Review Follow-Up Integration

Status: completed

Kind: improvement

Priority: P2; independently verify behavior and evidence rather than relying on completion claims.

Suggested agent: reviewer who did not implement the preceding tasks

Dependencies: EJB-01, EJB-02, EJB-03, EJB-04, EJB-05, EJB-06; add any approved builder implementation task before starting.

Primary ownership: review across changed files and completion evidence in this document.

Finding and references: the residuals in EJB-01 through EJB-06 survived the original completed plan; green nominal tests and snippet compilation did not establish all stated contracts. Review their cited source/test boundaries, not historical pass counts alone.

Requirements:

1. Independently verify each acceptance criterion, including redaction defaults, actual source-array mutation, native route control, meaningful thenable checks, and minimal dependency installation.
2. Compare runtime behavior, public declarations, README/AI guidance, website prose, and packed exports. Verify that native bypass paths are intentional and documented, not represented as JSON-protected endpoints.
3. Run V1, V3, applicable V4, and V5 serially. Record exact counts/failures and prerequisites. Preserve unrelated work.
4. Verify all scope extensions and decisions have owners, acceptance criteria, and dependencies. An investigation conclusion is not an implemented behavior change.

Acceptance criteria:

- Every task has independent evidence or an explicit approved deferral with residual risk; unresolved required checks leave the affected task blocked.
- No unmeasured performance claim, speculative security vulnerability, duplicate error pipeline, or undocumented breaking contract is introduced.
- Follow-up and original-plan links remain valid and all project references remain repository-relative.

Verification: V1, V3, applicable V4, V5, and evidence review above.

#### EJB-07 Completion evidence (added 2026-09-09, independent reviewer)

No implementation files edited; no CHANGELOG update. This record is review-only.

Independent verification table (acceptance criteria per task):

| Task   | Criterion                                                                                                                | Independent result                                                                                                                                                                                                                                                                                                                                                                                                                      |
| ------ | ------------------------------------------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| EJB-01 | Default error tests fail if raw messages exposed; customization still isolated                                           | PASS — verified `initialStaticDefaults` capture + `beforeEach`/`afterEach(reset)` at `test/express-json-router.test.ts:40-62`; raw provider set explicitly only in the two tests that need it (lines 474, 550); two redaction regressions (lines 496-544) assert `500 { message: 'Internal Server Error' }` + `not.toContain(secret)` + `preError` sees secret, for direct and builder paths                                            |
| EJB-01 | Mutation tests exercise actual captured input incl. nested arrays                                                        | PASS — verified test passes named `source` (with nested `nestedSource`) to constructor (lines 713-716), mutates top-level, nested, and public-copy, asserts identity (`toBe`, lines 729-732) and behavior `a,b,c` on both routes (line 740)                                                                                                                                                                                             |
| EJB-01 | No production error-policy weakened                                                                                      | PASS — `src/index.ts` runtime logic untouched (diff is JSDoc-only, confirmed via `git diff HEAD -- packages/express-json-router/src/index.ts`); redaction still owned by `express-response-handler`                                                                                                                                                                                                                                     |
| EJB-02 | Differential matrix + evidence-backed recommendation; no guessed implementation                                          | PASS — record present with 8-scenario matrix (5 SAME / 3 DIFF: A, B, G), caller inspection (no `.route(`/`next('route')` in JsonRouter consumer code), no-action disposition with maintainer named as decision owner for any future native-Route redesign; no runtime change made (investigation conclusion, not behavior change)                                                                                                       |
| EJB-03 | Thrown/rejected vs `next(error)` boundary; native `use`/`param`/body-parser failures reach app handler; no double writes | PASS — verified boundary tests (lines 804-1051): thrown sync/async → 500 redacted + final handler not reached; explicit `next(error)` → app handler owns response + second callback skipped; native `use`/`param` sync/async → app handler + guarded JSON skipped; malformed `express.json()` → body-parser error to app handler; `use`/`param` return `=== router.original`, native regs excluded from `getEndpoints()`                |
| EJB-03 | Builder pins assert only the approved (retained) contract                                                                | PASS — verified `pins the retained builder contract...` test (lines 1053-1105) asserts HEAD-served-by-GET, guard-target 200 (not 404), constructor-middleware 2x — i.e. pins sugar, not native grouping                                                                                                                                                                                                                                 |
| EJB-03 | No new serializer/registry/auth abstraction                                                                              | PASS — no new pipeline; tests use deliberately controlled app final handlers; `src/index.ts` logic unchanged                                                                                                                                                                                                                                                                                                                            |
| EJB-04 | Minimal consumer succeeds on declared graph only                                                                         | PASS — verified `installMinimalPackedConsumer*` declares only the router tarball + compiler tooling, no closure members, no `@types/express`; ESM+CJS loading, package-root imports, strict NodeNext/Bundler with `skipLibCheck: false`                                                                                                                                                                                                 |
| EJB-04 | Staged-manifest omission detected; committed metadata never broken                                                       | PASS — verified `prepareBrokenRouterTarball()` stages temp-only manifest with the response-handler dep deleted (good tarballs never overwritten); negative test asserts throw mentioning `@web-ts-toolkit/express-response-handler` while asserting the intact staged manifest still declares it; temp root cleaned by `afterAll`                                                                                                       |
| EJB-04 | Richer consumer coverage intact, no duplicated closure prep                                                              | PASS — richer consumer test and manifest-transformation/allowlist tests untouched; broken tarball isolated under test temp root                                                                                                                                                                                                                                                                                                         |
| EJB-05 | Explicit return generic + valid non-native `PromiseLike` positive via assignment, direct, and builder                    | PASS — verified `.mts` `promiseLikeCallback` carries all six generics incl. `Return=ResBody`, returns `manualThenable<ResBody>` (local `ManualThenable implements PromiseLike`, not native `Promise`), registered direct + builder (lines 109-113); `.cts` mirrors with direct + builder registration                                                                                                                                   |
| EJB-05 | Negatives for incompatible values + malformed thenables; inference preserved                                             | PASS — verified `@ts-expect-error` on params shape, incompatible resolved value (directly above rejected expression), malformed `then: 'not-a-function'` in both fixtures; request/body/query/locals inference body kept                                                                                                                                                                                                                |
| EJB-05 | Narrowing to native Promise would fail the positive; no widened production types                                         | PASS — `src/index.ts` untouched (`MaybePromise<Return>` preserved); EJB-05 narrowing/weak-shape/malformed probe evidence reviewed and structurally sound (control-assigns-to-`PromiseLike` + `@ts-expect-error`-consumed native-`Promise` assignment; weak-shape probe compiles clean proving the old gap)                                                                                                                              |
| EJB-06 | All three surfaces agree; no shared-mutable-default-handler claim                                                        | PASS — `grep` confirms old positive claims (`grouped handlers for the same path`, `proxy.*shared default handler`) return zero matches on all three surfaces; `independent-registration sugar` + `does not reconfigure` negations present on README, `llms.txt`, and website doc; prose matches source contract (`src/index.ts:276-282,324-327`: fresh handler from current static defaults, existing routers keep constructed handler) |
| EJB-06 | Installed snippets compile; release notes only if contracts changed                                                      | PASS — V1 includes README/`llms.txt` snippet checks (green); no runtime contract changed → no release notes required (correct)                                                                                                                                                                                                                                                                                                          |

Cross-cutting checks:

- Runtime vs declarations vs docs vs packed exports: new `use`/`param`/builder boundary JSDoc confirmed present in both fresh emitted flavors (`dist/index.d.mts`, `dist/index.d.ts`, 1 match each for sugar + delegation prose); packed-consumer tests (richer + minimal) green inside V1; packed file allowlist/manifest assertions untouched and passing.
- Native bypass intentional/documented: `use`/`param` return native router identity, are documented as native (non-JSON, `basePath` not prepended, excluded from `getEndpoints()`), and never represented as JSON-protected endpoints in README, `llms.txt`, or website doc.
- Scope extensions owned/specified: EJB-02 no-action disposition executed exactly as specified (docs correction in EJB-06 website line 81 verified; boundary pins in EJB-03 verified; no silent native-grouping assertions). EJB-03 `use`/`param` overload-narrowing follow-up recorded as a deferred dedicated-task candidate for the maintainer (no contract change made). No other scope extensions found.
- No unmeasured performance claim: `grep -rni "throughput|perf gain|faster|benchmark"` over README/`llms.txt`/website/`src/index.ts` returns zero matches.
- No speculative vulnerability: EJB-02 matrix findings are stated as compatibility diffs with explicit "not proof of authorization-boundary compromise" framing; fresh-probe redaction evidence is framed as test-gap support, not production disclosure.
- No duplicate error pipeline: router-level tests delegate to controlled app final handlers; `express-response-handler` untouched.
- No undocumented breaking contract: `src/index.ts` diff is comments/JSDoc-only (one JSDoc line replaced, rest added; zero logic change); all behavior pins assert the retained contract.
- Links/refs: website related-package links (`./express-response-handler`, `./http-errors`) resolve to existing docs; live-docs URL matches `package.json` homepage; no absolute filesystem refs in changed docs; task backlink target (original remediation doc) exists and was given only a backlink edit per plan.
- Unrelated work preserved: reviewer made zero implementation edits; working tree still contains the unrelated access-router-runtime and OIDC-store changes untouched.

Commands/results (repo root, strictly serial, prereqs: `pnpm install` done, Node >= 22, registry reachable):

- V1 `pnpm --filter @web-ts-toolkit/express-json-router test` — PASS: 2 test files, 44 tests, all passed (rebuild + NodeNext/Bundler typechecks + richer + minimal packed-consumer tests included).
- V3 `pnpm exec eslint "packages/express-json-router/**/*.{ts,mts,cts,js}"` — clean (exit 0); `git diff --check` — clean.
- V4 — NOT APPLICABLE with rationale: runtime/contract changes are zero (`src/index.ts` diff is JSDoc-only; all other diffs are tests, decl fixtures, README/`llms.txt`, website doc). No response-handler integration change; no downstream package affected. Downstream suites not run.
- V5 serial: `pnpm lint` — PASS with 0 errors (3 pre-existing warnings: unused eslint-disable directives in unrelated `packages/access-router-client/test/access-router-client.bnd12-benchmark.unit.test.ts:100,102,105`). `pnpm build` — PASS (full workspace incl. apps). `pnpm test` — DID NOT COMPLETE GREEN: serial run stopped at `packages/express-runtime` where `test/watch-supervisor.test.ts > ERT-B07` timed out at 5000 ms (1 failed, 340 passed in that package). Independence established: `packages/express-runtime` is untouched by this work (`git status` clean for that path), has no dependency on `express-json-router` (`grep` confirms `NO_DEP_ON_EJR`), and the failure is timing-flaky — focused rerun `vitest run test/watch-supervisor.test.ts -t "ERT-B07"` passes (4 passed, 12 skipped, 571 ms). EJB-scope suites (V1) are independently green; no EJB-attributable failure.

Deferrals/blockers: none attributable to EJB-01..06. Standing deferrals inherited from the plan (unchanged): native-Route redesign blocked on maintainer approval (EJB-02 owner: maintainer); `use`/`param` full native overload types need a dedicated task (EJB-03 follow-up, owner: maintainer); recursive-flattening guards and router-options API remain deferred per Deferred Work section. V5 full-repo green remains subject to the unrelated flaky timing test above, owned outside this plan.

## Deferred Work And Decisions

- Builder grouping is the only newly identified public-contract decision. EJB-02 can start immediately; a runtime change requires maintainer approval. Other tasks must not silently select native grouping while improving tests/docs.
- Recursive handler-array flattening at `packages/express-json-router/src/index.ts:190-203` has no cycle/depth guard and allocates intermediate arrays. These are registration-time developer inputs, not established request-controlled inputs. Defer limits/iterative flattening until a concrete dynamic-registration use case or benchmark demonstrates need; residual risk is poor startup diagnostics for cyclic/extreme configurations.
- Router options such as `mergeParams`, case sensitivity, and strict matching are not exposed by the constructor (`src/index.ts:328-336` under the package). Defer a new options API until concrete consumers need it; applications can currently obtain parent context through ordinary Express middleware, but that is not equivalent to enabling `mergeParams`. Do not label this deliberate narrow surface a confirmed defect.
- Keep the original string-only path, dependency ownership, default export, and native error-middleware decisions. No new `llms.txt`, generalized refactor, caching layer, or broad feature framework is needed.

## Definition Of Done

- Required tasks satisfy their observable acceptance criteria with appended verification evidence; tasks blocked on policy or environment are not marked completed.
- Confirmed behavior differences have an approved, documented disposition and regression coverage when retained or fixed.
- Published types/docs and runtime behavior agree, and tests verify real defaults and minimal installation rather than supplying missing guarantees themselves.
- Independent integration review records serial package/downstream/repository results and any approved deferrals or exact blockers.
