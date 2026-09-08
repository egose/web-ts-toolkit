# Express OIDC Vault Boundary Review

Created: 2026-09-08 07:08:11 PDT

## Objective And Scope

Prepare independently executable follow-up work for `packages/express-oidc-vault`, covering authentication correctness, security, resource bounds, public contracts, readability, encapsulation, and testability. This document is a review deliverable, not authorization to implement all recommendations without resolving the explicitly identified design decisions.

Scope includes source, focused tests, installed-consumer fixtures, existing declarations, metadata, and shipped README. Store implementations enter scope only when a core protocol change requires coordinated provider support. Website documentation must track resulting public behavior changes.

Non-goals: a framework rewrite, new public subpaths, wholesale route extraction, complete OAuth feature parity, provider-specific integrations, and unrelated store optimizations. Do not add compatibility modes without a concrete shipped-consumer or persisted-data requirement.

## Coverage And Baseline

- Reviewed core route orchestration and failure ordering, config/provider/token validation, cookies/origins, bearer middleware/errors, public types, package metadata/build configuration, README examples, focused tests, and packed-consumer test coverage.
- Existing generated declarations and JavaScript were inspected by the consumer reviewer but not rebuilt. Their presence is not fresh-build evidence.
- Ran `git status --short` before analysis: clean worktree.
- Ran `pnpm exec vitest run --config ../../vitest.config.ts test/config.test.ts test/helpers.test.ts test/index.test.ts` from `packages/express-oidc-vault`: 3 files passed, 67 tests passed. Vitest emitted a Vite configuration-loader compatibility warning; tests passed.
- That focused run deliberately omitted rebuilding dependencies and the packed-consumer test. It uses available workspace dependencies/output and does not establish clean-install or minimum-Node compatibility.
- Full package tests, full repository checks, fresh build, packed installation, release artifact verification, browser tests, and live external identity-provider tests were not run for this review. They are proposed verification below, not claimed results.
- Findings classified as defects are supported by inspected control flow. Except where baseline tests already demonstrate behavior, new failure scenarios have not yet been reproduced. Investigations explicitly bound remaining uncertainty.
- Store-specific backlogs were checked for related revocation, replay, alias, conformance, and packaging work; this is not a fresh audit of every store implementation. No measured performance claim is made beyond identifying concrete unbounded waits and configuration-sharing behavior.

## Prior Work And Deduplication

The previous core plan is completed. This is a new post-remediation objective; preserve historical completion evidence rather than treating old findings as still wholly unfixed.

- `docs/tasks/20260813-125834-express-oidc-vault-review-remediation.md`: residuals of OIDC-02/06/07/08/10/11/13/16/17 are identified per task below.
- `docs/tasks/20260813-185552-express-oidc-vault-memory-store-review-remediation.md`: MEM-03/04 already cover atomic individual JTI consumption and provider conformance. BOV-01 concerns composing replay consumption with revocation, not repeating those fixes.
- `docs/tasks/20260813-185606-express-oidc-vault-mongodb-store-review-remediation.md`: MDB-02/04/05 cover atomic rotation, logical replay expiry, and bounded aliases. Do not reintroduce the superseded non-transactional rotation design.
- `docs/tasks/20260813-185747-express-oidc-vault-redis-store-review-remediation.md`: RVR-03/05/06/07 cover store-level revocation, retention, and batching. BOV-03 concerns provider HTTP calls and browser response ordering outside those atomic store operations.

## Priorities And Working Rules

- P1: authentication/revocation reliability, credential exposure risk, or production availability/compatibility failure. No confirmed P0 exploit was established in this review.
- P2: contained correctness, maintainability, observability, consumer verification, or optional security hardening.
- `defect` means demonstrated by inspected implementation; `improvement` means an optional stronger contract; `investigation` means a bounded experiment/decision, not a speculative mandatory fix.
- All tasks start `pending`. Set `in_progress` only after dependencies are completed and ownership is assigned. Record blockers and their decision owner. Completion requires acceptance and verification evidence, not just a patch.
- Use repository-relative paths in this document and follow-up notes. Do not include workstation-specific external directories. Generic temporary work may use `/tmp`.
- Keep regression tests with their fixes. New regression cases should fail on the reviewed implementation where feasible. Never manually edit `dist/`.
- Runtime, exported types/JSDoc, README, website docs, and `CHANGELOG.md` must agree when public contracts change. Test expectations that encode an incorrect old contract must change with the fix.
- Serialize package builds/tests. Package test scripts rebuild transitive dependencies and can race on shared `dist/` output. One coordinator owns build/test execution even when source work is parallel.

## Shared Verification

All commands below run from the repository root unless a working directory is stated.

- V1, focused: from `packages/express-oidc-vault`, use `pnpm exec vitest run --config ../../vitest.config.ts test/config.test.ts test/helpers.test.ts test/index.test.ts`. Add each new focused test file explicitly. This is a fast check, not a replacement for V2.
- V2, package: `pnpm --filter @web-ts-toolkit/express-oidc-vault test`. This performs transitive builds and includes packed-consumer verification. Clean consumer installation may require registry access.
- V3, provider contract: run `pnpm --filter @web-ts-toolkit/express-oidc-vault-memory-store test`, then `pnpm --filter @web-ts-toolkit/express-oidc-vault-redis-store test`, then `pnpm --filter @web-ts-toolkit/express-oidc-vault-mongodb-store test`. Follow each provider's existing harness prerequisites; record unavailable service/runtime prerequisites rather than silently skipping integration cases.
- V4, integration: run `pnpm lint`, `pnpm build`, and `pnpm test` serially. Preserve root test serialization. Record unrelated failures separately with evidence.
- V5, release surface when metadata/declarations change: run `pnpm build-artifact -- --version <ver>` followed by `pnpm verify-artifact -- --version <ver>` with an agreed test version. Run `npm pack --dry-run --json` from `packages/express-oidc-vault` as a file-list check, not proof of manifest transformation. Packed CJS/ESM and strict declaration consumers must pass.
- Prerequisites: repository-supported Node/pnpm and installed dependencies (`pnpm install` if needed). Minimum-runtime claims additionally require the selected minimum Node version, not just the current workstation runtime.

## Executable Tasks

### Task BOV-01: Make Backchannel Revocation Retry-Safe

Status: completed

Kind: defect

Priority: P1; a transient store failure can suppress a valid logout permanently until token expiry while leaving sessions active.

Suggested agent: distributed authentication-state specialist

Dependencies: none

Primary ownership: `packages/express-oidc-vault/src/index.ts` backchannel handler, `src/types.ts` replay contract, focused route/conformance tests; affected store methods only if the chosen design needs them.

Finding and references: `packages/express-oidc-vault/src/index.ts:747-770` consumes JTI before revocation. If scoped deletion throws, retry sees `false` and returns successful `revokedSessions: 0` without retrying deletion. `src/types.ts:111-115,146-152` supplies no operation-completion state. `test/index.test.ts:2040-2089` tests successful replay only. This is a composition gap after OIDC-07, not a failure of atomic JTI consumption itself.

Requirements:

1. Establish a retry-safe relationship between replay reservation, durable revocation, and notification. Do not merely move consumption after deletion and introduce overlapping duplicate side effects.
2. Define failure/crash/retry semantics, including partial deletion and concurrent retries. Prefer the smallest enforceable store boundary; document any unavoidable at-least-once notification behavior rather than promise exactly-once delivery without support.
3. Include issuer/client identity in replay isolation or explicitly establish separate-store namespace requirements. The current raw-JTI key can collide when middleware instances share a store. Test independent issuers using the same JTI.
4. If a contract changes, coordinate all providers and public migration/release notes; inspect existing persisted replay records before choosing migration behavior.

Acceptance criteria:

- Inject a one-time deletion failure after a successful replay claim; retry of the valid token eventually revokes the target sessions instead of returning a misleading completed no-op.
- Concurrent duplicates cannot leave the target lineage active after reported completion; hooks follow the documented delivery policy.
- Successful replay remains harmless; identity namespaces do not suppress unrelated revocations; invalid/expired tokens do not allocate durable work.

Verification: V1/V2; V3 for any store contract/behavior change, plus barrier and fault-injection tests.

Completion evidence:

- Changed files:
  - `packages/express-oidc-vault/src/index.ts`: backchannel handler now builds an issuer/client-namespaced replay key (`v2:base64url(issuer):base64url(clientId):base64url(jti)`), reserves it with the existing atomic single-key `consumeBackchannelLogoutTokenJti`, and makes duplicates perform idempotent catch-up deletion of the same `sid`/`sub` target. The owner always emits `onLogout`; a duplicate emits `onLogout` only when its catch-up actually removed sessions; a sequential replay returns `revokedSessions: 0` with no hook. No store provider code or persisted-record schema changed; replay keys are opaque to stores.
  - `packages/express-oidc-vault/src/types.ts`: `consumeBackchannelLogoutTokenJti` JSDoc now documents the opaque namespaced replay key, the atomic-reservation-plus-idempotent-catch-up retry model, and that pre-BOV-01 raw-`jti` records expire naturally without ever matching namespaced keys.
  - `packages/express-oidc-vault/test/bov-01-backchannel-retry.test.ts`: new focused regression file with 5 tests (one-time deletion-failure retry, barrier-forced concurrent duplicates, sequential-replay harmlessness with unrelated-session scoping, cross-issuer same-`jti` isolation on a shared store, invalid/expired tokens allocating no durable work).
  - `packages/express-oidc-vault/README.md` and `website/docs/packages/express-oidc-vault.md`: backchannel paragraphs updated with the retry-safe reservation/catch-up/hook policy (at-least-once under failure/concurrency, at-most-once across the crash-between-commit-and-notify window) plus the pre-upgrade raw-`jti` migration note. `CHANGELOG.md` untouched.
- Store inspection before choosing migration: memory store keeps replay JTIs in a `Map` keyed by raw string; Redis uses `SET key 1 PXAT exp NX` on `backchannelLogoutTokenJti(jti)`; MongoDB inserts `_id: jti` with an expiry date. All treat the key as opaque and all records expire with the logout-token `exp` (short-lived), so namespacing core-side with a `v2:` prefix is coexistence-safe: old raw keys linger until expiry but are never matched, costing at most one replay window per pre-upgrade `jti`. No provider coordination or persisted-record migration required.
- Commands and results (run serially):
  - V1 focused from `packages/express-oidc-vault`: `pnpm exec vitest run --config ../../vitest.config.ts test/config.test.ts test/helpers.test.ts test/index.test.ts test/bov-01-backchannel-retry.test.ts` → 4 files passed, 72 tests passed (67 existing + 5 new).
  - V2 package: `pnpm --filter @web-ts-toolkit/express-oidc-vault test` (rebuilds transitive deps, includes packed-consumer verification) → 5 files passed, 75 tests passed.
  - `pnpm lint` → 0 errors, 3 pre-existing warnings in unrelated `packages/access-router-client/test/access-router-client.bnd12-benchmark.unit.test.ts`.
- Acceptance checklist:
  - One-time deletion failure after a successful replay claim: first request returns 500 with the session intact; retry of the same token returns 200 with `revokedSessions: 1` and one `onLogout` delivery — no misleading completed no-op.
  - Concurrent duplicates (barrier-forced overlap): both return 200, per-request counts sum to the lineage size, the lineage is gone after both complete, and `onLogout` fires 1–2 times per the documented at-least-once policy.
  - Sequential replay returns `revokedSessions: 0` with no second hook; unrelated sessions untouched; cross-issuer same-`jti` tokens revoke only their own issuer scope; invalid (`typ: JWT`) and expired tokens return 4xx/5xx without calling `consumeBackchannelLogoutTokenJti` or deleting sessions.
- Follow-ups: V3 store-harness runs not executed (no store contract/behavior change); the crash-between-durable-deletion-and-hook-delivery window remains at-most-once by design and is documented rather than fixed, since closing it would require a completion-record store transaction.

### Task BOV-02: Establish Browser Binding Across Login And Exchange

Status: completed

Kind: investigation

Priority: P1; state/PKCE integrity alone does not establish which browser may complete a locally initiated flow.

Suggested agent: browser/OIDC security reviewer

Dependencies: none

Primary ownership: investigation fixtures around `packages/express-oidc-vault/src/index.ts` login/callback/exchange and browser integration guidance; avoid production changes until the result is recorded.

Finding and references: `src/index.ts:394-404` stores state/nonce/PKCE server-side without a browser-binding field; `:427-437` consumes the transaction using supplied state; `:536-574` exchanges a body code and can set a session cookie without a source-origin check. `src/types.ts:61-83` has no mandatory initiating-client proof. Existing flow tests at `test/index.test.ts:294-436,653-765` do not model two browsers. No browser-level exploit is claimed from this inspection alone.

Requirements:

1. Model attacker and victim browsers separately. Test transfer of an attacker-initiated callback URL and an unconsumed local exchange code under body and cookie transport.
2. Include cross-origin form submission accepted by the URL-encoded parser, credentialed fetch/CORS assumptions, and frontend callback behavior. Determine whether package guarantees or required application protections prevent login/session swapping.
3. Recommend a browser-bound transaction/exchange proof, explicit integration requirement, or no change based on evidence. Origin validation at exchange is not automatically a substitute for binding callback completion.

Acceptance criteria:

- Record a runnable two-client/browser experiment and a concrete conclusion for each transport; distinguish forced login from token theft.
- If exposure is reproduced, create a scoped implementation follow-up with API/store implications and acceptance tests before closing this investigation. Otherwise document the verified protection and residual application assumptions.

Verification: V1-compatible two-client fixture plus browser evidence where browser policy matters; V2 if tests are committed.

Completion evidence:

- Changed files (investigation only, no production `src` change, no `CHANGELOG.md` change):
  - `packages/express-oidc-vault/test/bov-02-browser-binding.test.ts`: new runnable two-client fixture with isolated attacker/victim cookie jars and a provider fixture whose upstream code encodes `authcode:<nonce>:<sub>` so each browser authenticates as a distinct subject (`attacker` vs `victim`). 6 tests.
- Commands and results (run serially):
  - V1 focused from `packages/express-oidc-vault`: `pnpm exec vitest run --config ../../vitest.config.ts test/config.test.ts test/helpers.test.ts test/index.test.ts test/bov-02-browser-binding.test.ts` → 4 files passed, 73 tests passed (67 existing + 6 new).
  - V2 package: `pnpm --filter @web-ts-toolkit/express-oidc-vault test` (rebuilds transitive deps, includes packed-consumer verification) → 6 files passed, 81 tests passed.
- Experiment and concrete conclusion per transport:
  - Body transport, attacker-initiated callback URL completed by victim: reproduced. Victim `GET /callback?state=<attacker-state>&code=authcode:<attacker-nonce>:attacker` returns 302 to the frontend with a fresh local exchange code, and victim `POST /exchange {code}` returns 200 with `user.sub === 'attacker'`. The attacker gains no victim credential from this direction. Conclusion: forced login / login CSRF (victim ends up acting as the attacker), NOT token theft. Consumed state correctly rejects replay (`OIDC_VAULT_INVALID_STATE`), which stops double-completion but not first-completion by the wrong browser.
  - Body transport, unconsumed victim exchange code redeemed by attacker: reproduced. Attacker `POST /exchange {code:<victim-code>}` returns 200 with `user.sub === 'victim'` plus a usable `sessionId`; the victim's later redemption fails (`OIDC_VAULT_INVALID_EXCHANGE_CODE`), and attacker `POST /refresh {sessionId}` succeeds. Conclusion: token theft — the local exchange code is a bearer credential with no browser binding.
  - Cookie transport, transferred callback URL: reproduced forced login. Victim redemption sets the attacker session cookie in the victim jar (`stored.subject === 'attacker'`, `sessionId` absent from JSON body as designed).
  - Cookie transport, stolen exchange code: reproduced token theft. Attacker redemption mints the victim session cookie in the attacker jar (`stored.subject === 'victim'`), and attacker credentialed `POST /refresh` with `Origin: https://frontend.example.com` plus that cookie succeeds.
  - Cross-origin form submission: `POST /exchange` with `Content-Type: application/x-www-form-urlencoded` and `Origin: https://evil.example` succeeds under both transports. The route is served behind `express.urlencoded`, so a simple attacker `<form>` needs no CORS preflight.
  - Credentialed fetch/CORS assumptions: the package emits no `Access-Control-*` headers (asserted absent on the exchange response) and performs no `Origin` check on `exchange` — `assertTrustedOrigin` covers only `refresh`/`logout` under cookie transport. Application CORS can block an evil origin from _reading_ a credentialed fetch response, but it cannot block opaque form posts or top-level navigations to `callback`/frontend-callback URLs. Verified: evil-`Origin` exchange returns 200 while evil-`Origin` refresh/logout return 403 `OIDC_VAULT_UNTRUSTED_ORIGIN`. Origin validation at exchange is therefore not a substitute for binding, as the task anticipated.
  - Frontend callback behavior: the standard SPA pattern (read `?code=` from the frontend redirect and `POST` it to `/exchange`) auto-completes the attack — visiting a transferred frontend URL (`https://frontend.example.com/callback?code=<attacker-code>`) in the victim browser force-logs the victim without the victim ever touching the backend callback. No package or required-application protection in the reviewed surface stops this; the residual application assumption would have to be "callback/exchange URLs never cross browsers," which is unenforceable for a login-CSRF attacker.
- Overall conclusion: exposure reproduced in both transports. `state`/PKCE integrity proves the flow was initiated and the upstream code matches, but nothing proves _which browser_ may complete it. No package guarantee and no required application protection (CORS, `trustedOrigins`, `SameSite`, frontend discipline) prevents login/session swapping once a callback URL or unconsumed exchange code crosses browsers. Recommend a browser-bound transaction/exchange proof (not a docs-only fix, not no-change).
- Scoped implementation follow-up (BOV-02-FU1, proposed; not implemented in this investigation per task rules):
  - Design: bind the login transaction to the initiating browser (e.g. HttpOnly binding cookie carrying a random browser key, or a `browserBindingHash` stored alongside the transaction) and propagate the binding to the exchange-code record. Verify the proof at `callback` (before the upstream token request/session creation) and at `exchange` (before code consumption); fail closed with a sanitized 4xx and no session/code creation on mismatch. Rotate/clear the binding when the flow completes or expires.
  - API/store implications: new optional binding fields on `AuthorizationTransactionInput` (`src/types.ts:61-73`) and `ExchangeCodeRecordInput` (`src/types.ts:75-83`); memory/Redis/MongoDB providers persist the new optional fields with backward compatibility for records written before the change; TTL and atomic-consume semantics unchanged; no new cross-instance coordination beyond the existing single-key consume. Public options surface the binding-cookie policy (name/`SameSite`/`Secure`/path, interaction with `sessionTransport: 'cookie'`); README + website integration guidance updated with the new required browser behavior at implementation time (deliberately untouched in this investigation to avoid concurrent doc edits).
  - Acceptance tests (to add with the fix): transferred attacker callback URL completed by the victim fails before session creation; stolen victim exchange code redeemed by a browser without the binding proof fails; honest same-browser login→callback→exchange passes under both transports; cross-origin urlencoded form post without the binding cookie fails; binding-cookie attributes (`HttpOnly`, `Secure`/`SameSite` policy) asserted; old records without binding fields follow the documented migration path.
  - Residual assumptions even after FU1: the binding cookie is still bearer within the bound browser (XSS or full cookie theft defeats it); frontend must still strip `?code=` from history/URLs; exchange codes remain single-use bearer credentials inside the bound browser.
- Docs: README/website untouched — integration-guidance change is deferred to the FU1 implementation, which will update them together with the contract change.

### Task BOV-03: Define End-To-End Concurrent Refresh Semantics

Status: completed

Kind: investigation

Priority: P1; local atomic rotation does not protect upstream rotating refresh tokens or order browser cookie responses.

Suggested agent: distributed OAuth lifecycle specialist

Dependencies: none

Primary ownership: refresh concurrency experiments and focused tests in `packages/express-oidc-vault`; coordinate BOV-01 before editing shared store contracts.

Finding and references: `src/index.ts:585-603` reads and submits the current refresh token before `:648-651` atomically rotates locally. Two callers can therefore use the same upstream token. `:653-658` clears a cookie on the losing local rotation, so a late loser response can erase a winner's cookie. `test/index.test.ts:1526-1603` only counts local token issuance using a permissive upstream fixture. The logout race test at `:1605-1680` deliberately permits a 200 refresh after revocation and checks only store absence. This is narrower than reopening the completed store-rotation tasks.

Requirements:

1. Use an upstream fixture with single-use refresh tokens and optional reuse-detection family revocation; count provider requests, not only local issued tokens.
2. Exercise cookie response arrival orders with a cookie jar/browser. Establish the stale-request cookie-clearing contract.
3. Evaluate the access-token consequence of logout while issuance is paused. Explicitly distinguish refresh-session revocation from stateless access-token invalidation; do not assume the generic validator checks session state.
4. Recommend the smallest cross-instance coordination/rejection policy needed. A process-local mutex alone is insufficient for a claimed multi-instance guarantee. Preserve provider request bounds and define crash/lease behavior if reservation is proposed.

Acceptance criteria:

- Evidence covers both overlapping requests, upstream family survival, local store outcome, cookie arrival orders, and access-token validity after logout.
- Produce a documented contract and implementation follow-up(s), or evidence-backed deferral with maintainer owner. Do not close by assuming all providers allow refresh-token reuse.

Verification: deterministic barriers/fake provider and cookie evidence; V1/V2 for fixtures; V3 only if implementation follow-ups change provider contracts.

Completion evidence:

- Changed files (investigation only, no production `src` change, no `CHANGELOG.md` change, no shared store contract change per BOV-01 coordination):
  - `packages/express-oidc-vault/test/bov-03-concurrent-refresh.test.ts`: new deterministic fixture with a single-use upstream refresh family (`upstream_refresh_1` → `upstream_refresh_next_N`), an upstream arrival barrier forcing overlap, a provider-request counter, a browser cookie jar, and a stateless access-token validator. 5 tests.
- Commands and results (run serially):
  - New file alone from `packages/express-oidc-vault`: `pnpm exec vitest run --config ../../vitest.config.ts test/bov-03-concurrent-refresh.test.ts` → 1 file passed, 5 tests passed.
  - V1 focused from `packages/express-oidc-vault`: `pnpm exec vitest run --config ../../vitest.config.ts test/config.test.ts test/helpers.test.ts test/index.test.ts test/bov-01-backchannel-retry.test.ts test/bov-02-browser-binding.test.ts test/bov-03-concurrent-refresh.test.ts` → 6 files passed, 83 tests passed.
  - V2 package: `pnpm --filter @web-ts-toolkit/express-oidc-vault test` (rebuilds transitive deps, includes packed-consumer verification) → 7 files passed, 86 tests passed.
  - `pnpm exec eslint packages/express-oidc-vault/test/bov-03-concurrent-refresh.test.ts` → clean. Full `pnpm lint` still reports pre-existing unrelated errors in `packages/asset-inliner` and `packages/express-response-handler` plus warnings in `packages/access-router-client`; none from this task.
- Evidence per acceptance item:
  - Overlapping requests: two barrier-overlapped `POST /refresh` with the same `sessionId` submit the same upstream token (`refreshRequestTokens === ['upstream_refresh_1', 'upstream_refresh_1']`). Local issuance stays bounded to 1 token in all runs.
  - Upstream family survival: with reuse detection on, statuses are `[200, 502]` (`OIDC_VAULT_TOKEN_REQUEST_FAILED` for the loser, which never reaches local rotation) and the winner's fresh upstream token is dead on next use (`families.get('fam1').revoked === true`, follow-up refresh → 502). With reuse detection off, statuses are still `[200, 502]` but the family survives and the winner refreshes again with 200. Provider variance is therefore established, not assumed: strict providers revoke the family, permissive providers do not.
  - Local store outcome: exactly one winner session remains live; the loser mints nothing locally. Three overlapping refreshes send 3 upstream requests for 1 local rotation — today's provider request bound equals the concurrency degree.
  - Cookie arrival orders: under a permissive upstream (both pass the provider so the loser reaches the `rotateSession` conflict at `src/index.ts:695-701`), statuses are `[200, 401]`; the winner sets `oidc_vault_session=<winner>`, the loser emits a clear (`Max-Age=0`), and the winner session is live in the store. Applying winner-then-loser to the jar leaves it empty (live session, no cookie); loser-then-winner leaves the winner cookie. A genuinely stale retry of the consumed session also returns 401 with a clear. Under strict single-use providers the loser instead returns 502 with no `Set-Cookie` at all, so no arrival order exists for that pair.
  - Access-token validity after logout: refresh paused in `tokenIssuer.issue` after rotation, logout revokes the logical lineage, issuance resumes → refresh returns 200 but `getSession(winner) === null` (reproduces the `:1605-1680` race). The issued `local:<sessionId>` token still returns 200 through `createOidcVaultAccessTokenMiddleware` with a generic stateless validator. Refresh-session revocation therefore does NOT invalidate outstanding stateless access tokens; only a store-backed validator (out of scope for the generic middleware) could reject them.
- Documented contract (current behavior, confirmed by the fixture):
  - At most one local rotation/issuance per overlapping set wins; losers fail without minting.
  - Provider calls are NOT deduplicated: N overlapping refreshes ⇒ N upstream token requests with the same refresh token. Against single-use providers the losers surface 502 `OIDC_VAULT_TOKEN_REQUEST_FAILED` and, with reuse detection, can destroy the winner's upstream family.
  - Cookie losers that reach the local conflict clear the session cookie (`401` + clear); upstream-failure losers set no cookie. No response ordering is enforced, so a late loser clear can erase a winner cookie in the browser while the winner session stays live server-side.
  - A 200 refresh response does not imply the session survived: logout racing issuance completion still yields 200 with the lineage deleted. Logout revokes the refresh session only; stateless access tokens issued before/around logout remain valid until they expire.
  - Frontend guidance already in the README ("deduplicate concurrent refresh calls so only one refresh is in-flight at a time") remains the only mitigation; no new README/website change is made here because the server contract itself is what the follow-up must change.
- Implementation follow-ups (BOV-03-FU1 single-flight refresh reservation, and BOV-03-FU2 stale-clear contract; proposed, not implemented per investigation rules, no store contract changed here):
  - FU1 design (smallest cross-instance policy): a per-logical-session refresh reservation held in the store provider (new optional method, coordinated with BOV-01 ownership before editing `src/types.ts`): the first overlapping request becomes the holder and performs the single upstream call; concurrent requests either wait bounded (e.g. ≤ provider timeout) and then read the rotated session, or fail fast with 409 `OIDC_VAULT_REFRESH_IN_PROGRESS` plus `Retry-After` and the current session pointer. A process-local mutex alone is explicitly insufficient for multi-instance deployments, so the reservation must be store-backed to hold across instances. Reservation holds a short TTL/lease (e.g. 10s, well under vault-session lifetime); on holder crash the lease expires and the next refresh retries normally — at most one extra upstream call per crash, never a stuck session. On upstream reuse/revocation errors the holder deletes the local lineage so losers observe a consistent revoked state instead of retrying a dead family. Provider request bound becomes at most 1 upstream call per reservation window regardless of concurrency degree.
  - FU1 acceptance tests (to add with the fix): N overlapping refreshes ⇒ exactly 1 upstream request and 1 local issuance; losers get 409 or the winner result, never 502 family-kill; lease expiry after simulated holder crash unblocks the next refresh within the TTL; reuse-error path revokes the lineage locally.
  - FU2 design (stale-request cookie clearing): only clear the session cookie when the request's session is definitively dead (missing with no live lineage, or post-revocation), and carry a rotation generation so a loser whose `sessionId` predates the winner's rotation never clears a newer cookie. Arrival-order tests must assert jar convergence (winner cookie survives regardless of response order) for both strict and permissive providers.
  - V3 store-harness runs not executed (no provider contract/behavior change in this investigation).

### Task BOV-04: Enforce Full Provider Deadlines And Policy Isolation

Status: completed

Kind: defect

Priority: P1; response headers can arrive within the timeout while the body holds requests open indefinitely.

Suggested agent: Node HTTP resource-boundary specialist

Dependencies: none

Primary ownership: `packages/express-oidc-vault/src/provider-client.ts`, dedicated provider-resource tests.

Finding and references: `src/provider-client.ts:119-143` clears its timer when fetch returns headers, before `:145-186` reads the body. `:199-214` caches JWKS resolvers only by URI, capturing the first caller's timeout; `:250-252,339-342` shares discovery's in-flight deadline. `test/helpers.test.ts:189-220,291-305` covers no headers and oversized productive bodies, not stalled bodies. Residual of OIDC-10.

Requirements:

1. Keep a deadline/cancellation policy active through complete success/error body consumption and cleanup. Cover stalled and slow bodies without introducing unhandled promise rejections or leaked readers.
2. Validate effective timeout options before cache lookup. Isolate differing instance policies, or define an explicit sharing policy that still honors each caller's documented deadline.
3. Inspect the resolved JOSE transport for body timeout, redirect, byte-size, and key-count bounds. Add package enforcement only where dependency evidence shows a missing bound; record conclusions rather than assume resolver-count limits bound each JWKS body.
4. Preserve bounded cache capacity, metadata reuse, and failure eviction. Measure request counts and elapsed bound behavior, not an assumed speedup from a cache rewrite.

Acceptance criteria:

- Discovery, token, and UserInfo success/error responses that stall after headers fail within the configured bound with sanitized endpoint-specific errors and cancel their body work.
- Two instances using one URI and different timeouts behave as documented in either creation order; cached lookups cannot bypass option validation.
- Real JWKS fetch evidence establishes its bounds; discovery recovers after failure, and successful cache reuse remains covered.

Verification: V1/V2 with bounded real-server or faithful stream tests; record JOSE findings in completion evidence.

Completion evidence:

- Changed files:
  - `packages/express-oidc-vault/src/provider-client.ts`: `fetchProvider` now returns `{ response, signal, done }` with the deadline timer armed through body consumption; `readBoundedResponseText`/`readJsonResponse` accept the live signal and race each `reader.read()` against abort (covering mocked streams that ignore the fetch signal as well as native undici abort), cancelling the reader and throwing sanitized endpoint-specific timeout errors (`OIDC_VAULT_DISCOVERY_FAILED`/`INVALID`, `OIDC_VAULT_TOKEN_REQUEST_FAILED`, `OIDC_VAULT_USERINFO_FAILED`) without unhandled rejections (permanent noop abort handler plus `removeEventListener`/`releaseLock` cleanup). Discovery, token, and UserInfo paths consume bodies under the signal and `done()` + best-effort `body.cancel()` in `finally`. Timeout options are validated before every cache lookup. Discovery fetches are isolated by `(issuer, providerRequestTimeoutMs)` with settled successes additionally shared under the bare issuer key; failures evict only the owning policy entry. JWKS resolvers are isolated by `(jwks_uri, providerRequestTimeoutMs)` via a package `customFetch` wrapper that preserves the JOSE timeout signal and manual redirect handling while adding the missing 1 MiB / 100-key bounds. Both maps stay capped at 32 entries with oldest-entry eviction.
  - `packages/express-oidc-vault/src/types.ts`: `providerRequestTimeoutMs` JSDoc now documents the overall header-plus-body deadline, pre-lookup validation, discovery sharing/isolation, and the package JWKS body/key bounds.
  - `packages/express-oidc-vault/test/bov-04-provider-resource.test.ts`: new focused file with 13 tests (stalled discovery/token/UserInfo success+error bodies, slow-trickle body, follow-up health proving no leaked timer/reader, pre-lookup validation for discovery+JWKS, JWKS isolation in both creation orders, discovery differing-deadline isolation in both creation orders with request counts, cross-timeout success sharing, failure eviction plus same-policy in-flight sharing, capacity bounds, real-server JWKS bounds).
  - `packages/express-oidc-vault/README.md` and `website/docs/packages/express-oidc-vault.md`: timeout/cache paragraphs and the `providerRequestTimeoutMs` table row updated for the overall body-inclusive deadline, pre-lookup validation, `(issuer, timeout)`/`(jwks_uri, timeout)` isolation with shared settled discovery reuse, and the 1 MiB/100-key JWKS bounds. `CHANGELOG.md` untouched.
- JOSE transport findings (jose 6.2.10, `dist/webapi/jwks/remote.js` + `remote.d.ts`, verified by reading the installed package and by real-server tests):
  - Body timeout: PRESENT. `createRemoteJWKSet` fetches with `AbortSignal.timeout(timeoutDuration)` and reads the body under the same signal, so a stalled JWKS body aborts at the deadline (real-server `/stalled` test: `reload()` rejects with `JWKSTimeout`, server observes response `close`).
  - Redirect: BOUNDED. The resolver sends `redirect: 'manual'` and rejects non-200 with `Expected 200 OK from the JSON Web Key Set HTTP response` (real-server `/redirect` test: rejects, follow-up location never fetched).
  - Byte-size: MISSING. The resolver reads the body with unbounded `response.json()`. Package enforcement added: `customFetch` wrapper reads under the JOSE signal with a 1 MiB limit and throws `502 OIDC_VAULT_JWKS_FAILED` (real-server `/oversized` 1.1 MB test rejects with that code).
  - Key-count: MISSING. `createLocalJWKSet` selects keys with no document-size limit. Package enforcement added: wrapper parses the bounded text and rejects documents with more than 100 keys with `502 OIDC_VAULT_JWKS_FAILED` (real-server `/many-keys` 101-key test rejects; honest 1-key JWKS `reload()` succeeds and `jwks()` returns 1 key). No enforcement added where JOSE already bounds (timeout/redirect); conclusions recorded here rather than assuming resolver-count limits bound bodies.
- Commands and results (run serially):
  - V1 focused from `packages/express-oidc-vault`: `pnpm exec vitest run --config ../../vitest.config.ts test/config.test.ts test/helpers.test.ts test/index.test.ts test/bov-01-backchannel-retry.test.ts test/bov-02-browser-binding.test.ts test/bov-03-concurrent-refresh.test.ts test/bov-04-provider-resource.test.ts` → 7 files passed, 96 tests passed (83 existing across the six prior files + 13 new).
  - V2 package: `pnpm --filter @web-ts-toolkit/express-oidc-vault test` (rebuilds transitive deps, includes packed-consumer verification) → 8 files passed, 99 tests passed.
  - `pnpm exec eslint packages/express-oidc-vault/src/provider-client.ts packages/express-oidc-vault/src/types.ts packages/express-oidc-vault/test/bov-04-provider-resource.test.ts` → clean.
- Acceptance checklist:
  - Discovery/token/UserInfo success/error responses stalling after headers fail within the configured bound (50–60 ms timeouts, elapsed asserted < 1_500 ms) with sanitized endpoint-specific errors and `reader.cancel()` observed on mocked streams (plus server-side `close` on the real stalled JWKS body); a process-level `unhandledRejection` tracker in the new file stays empty.
  - Two instances on one URI with different timeouts behave as documented in either creation order (JWKS resolvers are distinct per timeout with per-timeout reuse; concurrent discovery with 60 ms vs 2000 ms policies yields exactly 2 isolated fetches with the short caller timing out and the long caller succeeding, in both start orders); invalid timeouts (`0`) reject with `OIDC_VAULT_INVALID_CONFIG` even on cache hits.
  - Real JWKS fetch evidence establishes timeout/redirect/size/key bounds as above; discovery recovers after a 503 failure (2 requests for fail-then-succeed-then-reuse) and settled successes are reused across timeouts with no extra requests; cache capacities remain bounded (discovery ≤ 32, JWKS = 32 in the 40-issuer growth test).

### Task BOV-05: Preserve Exact Issuer Identity

Status: completed

Kind: defect

Priority: P1; valid manual providers can fail authentication and discovery accepts distinct issuer identifiers.

Suggested agent: OIDC configuration specialist

Dependencies: BOV-04, to serialize edits to `provider-client.ts`

Primary ownership: `packages/express-oidc-vault/src/config.ts`, issuer comparison in `src/provider-client.ts`, config and issuer-focused tests.

Finding and references: `src/config.ts:33-50,68` serializes issuer through `URL.toString()`, adding a slash to a root issuer. Manual metadata at `src/provider-client.ts:358-364` then binds JOSE to the changed identifier. The comparison at `src/provider-client.ts:50-62` strips trailing slashes, accepting distinct path issuers. `test/config.test.ts:22-44` expects slash addition; `test/index.test.ts:1158-1179` tests a different path, not trailing-slash distinctions. Residual of OIDC-06/18, not evidence of a standalone issuer takeover.

Requirements:

1. Separate issuer syntax validation from endpoint URL normalization. Preserve exact identifier semantics and require exact discovered issuer equality under the documented input-whitespace policy.
2. Validate issuer-specific forbidden URL components, including query/fragment/userinfo, without weakening intentional HTTP local-test support.
3. Correct the config resolver JSDoc at `src/config.ts:63-65`, which says discovery wins despite manual endpoint selection at `:72-80`.

Acceptance criteria:

- Manual ID-token and logout-token validation succeeds for a configured slashless root issuer whose token matches exactly.
- `/tenant`, `/tenant/`, and `/tenant//` are not treated as interchangeable discovery issuers; valid exact matches still pass.
- Updated types/docs/tests describe identifier preservation and discovery/manual precedence consistently.

Verification: V1/V2, including signed-token tests and config boundary cases.

Completion evidence:

- Changed files:
  - `packages/express-oidc-vault/src/config.ts`: added `normalizeIssuerIdentifier` which syntax-validates the issuer via `URL` (absolute http/https, no userinfo/query/fragment; `http` kept for local-test providers) but returns the trimmed input verbatim instead of `URL.toString()`, so slashless root issuers stay slashless and `/tenant`, `/tenant/`, `/tenant//` remain distinct. Endpoints keep `normalizeHttpUrl` (`URL.toString()`) normalization. `resolveOidcVaultConfig` JSDoc corrected: discovery mode only when issuer is configured without manual endpoints; any manual endpoint selects manual mode (no discovery) with `issuer` still required as the exact token issuer binding.
  - `packages/express-oidc-vault/src/provider-client.ts`: replaced trailing-slash-stripping comparison with exact `configuredIssuer === discoveredIssuer` equality (configured value already trimmed/preserved; discovered value compared with no normalization). Discovered issuer additionally rejected with `OIDC_VAULT_DISCOVERY_INVALID` when unparsable or carrying non-http(s) scheme, userinfo, query, or fragment. BOV-04 deadline/cache logic untouched (serialized edit).
  - `packages/express-oidc-vault/src/types.ts`: `OidcVaultConfig.issuer` JSDoc now documents exact preservation, forbidden components, `http` local-test acceptance, manual/discovery precedence, and exact discovery/token binding. `CHANGELOG.md` untouched.
  - `packages/express-oidc-vault/test/config.test.ts`: updated 3 expectations that encoded the old slash-adding contract (`https://issuer.example.com/` → `https://issuer.example.com`).
  - `packages/express-oidc-vault/test/bov-05-issuer-identity.test.ts`: new focused file with 19 tests (config preservation/distinctness/whitespace/forbidden-components/`http` support/endpoint-normalization/mode precedence; mocked-discovery exact-match accept/reject matrix including `/tenant` variants and slashless-vs-slash root; forbidden discovered issuers; real-server RS256 manual ID-token + logout-token success for a slashless `http://127.0.0.1:port` root issuer plus trailing-slash mismatch rejection).
  - `packages/express-oidc-vault/README.md` and `website/docs/packages/express-oidc-vault.md`: issuer/discovery/manual paragraphs updated for exact preservation, exact equality, whitespace policy, forbidden components, `http` local-test support, and manual-mode precedence. `CHANGELOG.md` untouched.
- Commands and results (run serially):
  - V1 focused from `packages/express-oidc-vault`: `pnpm exec vitest run --config ../../vitest.config.ts test/config.test.ts test/helpers.test.ts test/index.test.ts test/bov-01-backchannel-retry.test.ts test/bov-02-browser-binding.test.ts test/bov-03-concurrent-refresh.test.ts test/bov-04-provider-resource.test.ts test/bov-05-issuer-identity.test.ts` → 8 files passed, 115 tests passed.
  - V2 package: `pnpm --filter @web-ts-toolkit/express-oidc-vault test` (rebuilds transitive deps, includes packed-consumer verification) → 9 files passed, 118 tests passed.
  - `pnpm exec eslint packages/express-oidc-vault/src/config.ts packages/express-oidc-vault/src/provider-client.ts packages/express-oidc-vault/src/types.ts packages/express-oidc-vault/test/bov-05-issuer-identity.test.ts packages/express-oidc-vault/test/config.test.ts` → clean.
- Acceptance checklist:
  - Manual ID-token and logout-token validation succeeds for a configured slashless root issuer whose token matches exactly (real-server RS256 test with `http://127.0.0.1:<port>` issuer; `verifyIdToken` returns `sub: user_1`, `verifyBackchannelLogoutToken` returns `sid: provider_sid_1`); a trailing-slash `iss` against the slashless configured issuer is rejected.
  - `/tenant`, `/tenant/`, `/tenant//` not treated as interchangeable (5 cross-variant discovery pairs reject with `OIDC_VAULT_DISCOVERY_INVALID`); 5 exact matches (slashless root, slashed root, all three tenant variants) still pass.
  - Types/JSDoc/README/website describe identifier preservation and discovery/manual precedence consistently (config JSDoc, `OidcVaultConfig.issuer` JSDoc, README resolution + key-notes bullets, website issuer/manual-mode paragraphs).

### Task BOV-06: Validate Provider Objects And Normalize Failure Statuses

Status: completed

Kind: defect

Priority: P1; malformed successful provider data can bypass intended validation or become incidental internal failures.

Suggested agent: protocol response-validation specialist

Dependencies: BOV-05

Primary ownership: `packages/express-oidc-vault/src/provider-client.ts`, targeted response tests; coordinate any shared predicate change in `src/utils.ts` with token-validation tests.

Finding and references: `src/provider-client.ts:223-244` casts parsed JSON to an object without runtime shape validation and forwards upstream status for malformed error JSON. `:286-319,430-441,444-460` dereference or weakly validate it. `src/token-validation.ts:52-59` assumes a UserInfo object. `src/index.ts:624-626` skips validation for falsy UserInfo, so JSON `null` can bypass the matching-sub check entirely. Existing helper tests at `test/helpers.test.ts:100-108,282-305` do not cover valid non-object JSON. Residual of OIDC-06/08.

Requirements:

1. Require non-null, non-array objects at the shared provider JSON boundary. Validate types of present token fields rather than treating malformed optional credentials as omission; preserve intentionally supported refresh omissions.
2. Return stable upstream-failure status/code/message for non-success token/UserInfo responses regardless of JSON versus HTML body. Rejected upstream redirects must not become browser-facing 3xx errors.
3. Distinguish required fields for callback and refresh explicitly. Preserve subject checks and prohibit persistence/rotation on invalid responses.

Acceptance criteria:

- `null`, arrays, strings, booleans, and numbers are controlled provider errors across discovery, token, and UserInfo success/error paths.
- Wrong-type token fields are rejected; legitimate omitted refresh fields retain their documented behavior.
- Upstream 302/400/401/429/503 with JSON and non-JSON bodies follow one documented status policy without leaking bodies.

Verification: V1/V2; assert store mutation counts and error status as well as code/message.

Completion evidence:

- Changed files:
  - `packages/express-oidc-vault/src/provider-client.ts`: `readJsonResponse` now requires a non-null, non-array object (valid non-object JSON is a controlled 502) and always maps malformed bodies to 502 instead of forwarding the upstream status (BOV-04 deadline/cache and BOV-05 issuer logic untouched). `requestToken`/`fetchUserInfo` drain non-success bodies under the live deadline and throw stable `502 OIDC_VAULT_TOKEN_REQUEST_FAILED` / `502 OIDC_VAULT_USERINFO_FAILED` with sanitized messages for JSON and HTML bodies alike, so rejected 302s never become browser-facing 3xx and no body/upstream-status leaks. `validateTokenResponse` now type-checks present `access_token`/`id_token`/`refresh_token` (non-empty string) and `scope` (string); new `validateCallbackTokenResponse` requires `id_token` + `refresh_token` while `validateRefreshTokenResponse` preserves documented omissions (retained credentials/identity) with no rotation until checks pass.
  - `packages/express-oidc-vault/src/token-validation.ts`: `assertUserInfoSubject` accepts `unknown` and rejects `null`/arrays as `502 OIDC_VAULT_INVALID_USERINFO` instead of bypassing or throwing `TypeError`.
  - `packages/express-oidc-vault/src/index.ts`: callback uses `validateCallbackTokenResponse` (removed inline required-field checks that conflated types), refresh uses `validateRefreshTokenResponse`, and both check `userInfo !== undefined` so JSON `null` can never skip the subject check. No session/exchange-code/rotation is persisted before provider checks pass.
  - `packages/express-oidc-vault/test/bov-06-provider-boundary.test.ts`: new focused file with 46 tests (non-object JSON across discovery/token/UserInfo success/error paths; 302/400/401/429/503 JSON-vs-HTML stability without body leaks; wrong-type field rejections; callback-required vs refresh-omission behavior; `null`/array UserInfo subject enforcement; real-server callback/refresh guards asserting 502 status plus `createSession`/`createExchangeCode`/`rotateSession` counts and omission-retention success). `src/utils.ts` shared predicates unchanged.
  - `packages/express-oidc-vault/README.md` and `website/docs/packages/express-oidc-vault.md`: provider validation paragraphs updated for the object boundary, stable 502 failure policy, present-field typing, callback requirements, `null`-UserInfo enforcement, and refresh omission/retention. `CHANGELOG.md` untouched.
- Commands and results (run serially):
  - V1 focused from `packages/express-oidc-vault`: `pnpm exec vitest run --config ../../vitest.config.ts test/config.test.ts test/helpers.test.ts test/index.test.ts test/bov-01-backchannel-retry.test.ts test/bov-02-browser-binding.test.ts test/bov-03-concurrent-refresh.test.ts test/bov-04-provider-resource.test.ts test/bov-05-issuer-identity.test.ts test/bov-06-provider-boundary.test.ts` → 9 files passed, 161 tests passed (115 existing + 46 new).
  - V2 package: `pnpm --filter @web-ts-toolkit/express-oidc-vault test` (rebuilds transitive deps, includes packed-consumer verification) → 10 files passed, 164 tests passed.
  - `pnpm exec eslint packages/express-oidc-vault/src/provider-client.ts packages/express-oidc-vault/src/token-validation.ts packages/express-oidc-vault/src/index.ts packages/express-oidc-vault/test/bov-06-provider-boundary.test.ts` → clean.
- Acceptance checklist:
  - `null`, arrays, strings, booleans, numbers are controlled 502 provider errors across discovery, token, and UserInfo success/error paths (unit tests assert status/code, no `TypeError`/500).
  - Wrong-type `access_token`/`id_token`/`refresh_token`/`scope`/`expires_in`/`token_type` rejected with `OIDC_VAULT_INVALID_TOKEN_RESPONSE`; refresh with all credentials omitted still succeeds and rotates with retention.
  - Upstream 302/400/401/429/503 with JSON and HTML bodies all surface the same stable 502 code/message without body/status leakage; 302 never surfaces as 3xx. Callback/refresh guards assert 502 status plus zero store mutations on invalid responses.

### Task BOV-07: Stop Stale Profile Claims Overriding Fresh Identity

Status: completed

Kind: defect

Priority: P1; refreshed identity/authorization-related profile claims can remain stale despite a new verified ID token.

Suggested agent: identity lifecycle specialist

Dependencies: BOV-03 investigation conclusion and BOV-13 test repair

Primary ownership: refresh profile composition in `packages/express-oidc-vault/src/index.ts`, `src/token-validation.ts:62-70`, profile-focused tests.

Finding and references: `src/index.ts:606-642` obtains fresh claims but calls `mergeUserProfile(subject, claims, userInfo ?? currentSession.user)`. The helper spreads its third argument last. With UserInfo disabled/absent, stored profile fields override fresh claims, including changed email/name/roles where supplied. `test/index.test.ts:1424-1473` covers omission of a new ID token, not freshness when one is present. This residual was noted in the original baseline but is not fixed by subject continuity checks.

Requirements:

1. Define explicit precedence for retained profile data, fresh verified ID claims, and freshly fetched matching UserInfo. Never label retained values as fresh UserInfo.
2. Decide handling of removed claims versus application-added profile fields; document it rather than blindly preserving authorization claims forever.
3. Preserve subject continuity and refresh without a new ID token, including expired stored ID tokens used only as previously verified identity evidence.

Acceptance criteria:

- Fresh changed claims win over retained values when UserInfo is disabled or unavailable; matching fresh UserInfo follows the documented precedence.
- Tests cover new/omitted ID tokens, new/omitted UserInfo, removed claims, and subject mismatch, asserting both stored and returned profiles.

Verification: V1/V2 with before/after freshness regressions.

Completion evidence:

- Changed files:
  - `packages/express-oidc-vault/src/token-validation.ts`: `mergeUserProfile` JSDoc now states it composes freshly verified sources only (fresh UserInfo overlays fresh ID claims; retained data must never be passed as `userInfo`). New `composeRefreshedUserProfile(subject, currentUser, freshIdClaims, freshUserInfo)` implements the explicit precedence: fresh ID claims are the base when present with no retained merge-in (fresh wins, removed claims dropped); retained profile is kept verbatim only when no new `id_token` arrives; fresh matching UserInfo overlays whichever base applies. Application-added `user` keys are not carried forward across a fresh-identity refresh (custom attributes belong in `session.metadata`); the stored `idToken` is never revalidated.
  - `packages/express-oidc-vault/src/index.ts`: refresh handler verifies the new `id_token` into `freshClaims` (or `undefined` when omitted, keeping the stored token as previously verified identity evidence without revalidation), enforces subject continuity as before, fetches UserInfo only as a fresh source, and composes `user` via `composeRefreshedUserProfile` instead of `mergeUserProfile(subject, claims, userInfo ?? currentSession.user)`. `providerSessionId` updates from fresh claims when present, else retains. Callback composition unchanged.
  - `packages/express-oidc-vault/src/types.ts`: `OidcVaultSession.user` JSDoc documents the refresh precedence, removed-claim drop, and `metadata`-for-custom-attributes policy. `CHANGELOG.md` untouched.
  - `packages/express-oidc-vault/test/bov-07-refresh-profile.test.ts`: new focused file with 11 tests (10 route + 1 unit) asserting both returned and stored profiles: fresh-wins with UserInfo disabled, fresh-wins with UserInfo unavailable (omitted `access_token`), fresh-UserInfo overlay on fresh ID claims, verbatim retention on omitted ID token, fresh-UserInfo overlay on retained base, removed-claim drop, application-added key drop, ID-subject mismatch (502, lineage intact), expired-stored-ID-token refresh success, UserInfo-sub mismatch (502, lineage intact).
  - `packages/express-oidc-vault/README.md` and `website/docs/packages/express-oidc-vault.md`: refresh paragraphs updated with the precedence, the never-retained-over-fresh / never-labeled-as-UserInfo rules, removed-claim handling, and the `metadata` guidance. `CHANGELOG.md` untouched.
- Dependency respect: BOV-03 retention contract preserved (omitted-ID-token tests retain verbatim, including the expired-stored-token evidence case; concurrent-refresh behavior untouched) and BOV-13 subject/nonce checks untouched (mismatch tests assert 502 with lineage intact; no fixture weakening).
- Before/after freshness regression: route subset of the new file against the pre-fix sources → 4 failed / 6 passed (exactly the freshness tests fail: fresh-wins disabled, fresh-wins unavailable-UserInfo, removed-claim drop, app-key drop; retention/mismatch/UserInfo-overlay pass on both). With the fix → 11 passed.
- Commands and results (run serially):
  - V1 focused from `packages/express-oidc-vault` (all 14 focused files incl. the new one) → 14 files passed, 236 tests passed.
  - V2 package: `pnpm --filter @web-ts-toolkit/express-oidc-vault test` (rebuilds transitive deps, includes packed-consumer verification) → 15 files passed, 239 tests passed.
  - `pnpm exec eslint packages/express-oidc-vault/src/index.ts packages/express-oidc-vault/src/types.ts packages/express-oidc-vault/src/token-validation.ts packages/express-oidc-vault/test/bov-07-refresh-profile.test.ts` → clean.
- Acceptance checklist:
  - Fresh changed email/name/roles win over retained values with `fetchUserInfo: false` and with fetch enabled but no new `access_token` (stored and returned profiles equal the fresh claims, no `preferredUsername` leakage).
  - Matching fresh UserInfo overlays fresh ID claims (UI email/name win, ID-only keys survive); with no new ID token, fresh UserInfo overlays the retained base per key.
  - New/omitted ID tokens, new/omitted UserInfo, removed claims, and both subject mismatches covered, each asserting stored and returned profiles.

### Task BOV-08: Make HTTPS Cookies Secure And Browser-Valid By Default

Status: completed

Kind: defect

Priority: P1; the default HTTPS cookie can be sent over HTTP, and accepted configurations can fail during header emission or browser storage.

Suggested agent: browser cookie boundary specialist

Dependencies: none

Primary ownership: `packages/express-oidc-vault/src/cookies.ts`, cookie validation/default tests, relevant public option declarations.

Finding and references: `src/cookies.ts:53-65` defaults `secure` from deployment/SameSite only, ignoring HTTPS `backendOrigin`. `:73-107` permits non-header-safe Unicode paths and misses `__Host-`/`__Secure-` prefix invariants. Serialization at `:119-130` emits these attributes. `test/helpers.test.ts:48-70` covers cross-site defaults; `test/index.test.ts:557-597` lacks these invalid cases. Specific residuals adjacent to OIDC-13; no header injection is claimed.

Requirements:

1. Default HTTPS backend cookies to Secure while documenting an intentional HTTP development policy and explicit overrides. Keep SameSite=None effectively Secure.
2. Validate header-safe cookie attributes and prefix requirements against effective serialized values. Ensure `__Host-` is Secure, host-only, and Path=/; ensure `__Secure-` is Secure.
3. Keep setting and clearing attributes identical. Align public types/JSDoc with runtime rejection of `httpOnly: false` without adding an unsafe compatibility switch.

Acceptance criteria:

- Table-driven HTTP/HTTPS, same-origin/same-site/cross-site tests prove defaults and override behavior.
- Invalid prefixed cookies and unsafe path characters fail at creation, not after session work; valid prefixed cookies serialize and clear correctly.

Verification: V1/V2 and a browser cookie-storage check for prefix behavior where practical.

Completion evidence:

- Changed files:
  - `packages/express-oidc-vault/src/cookies.ts`: `resolveCookieOptions` now defaults `secure` to `true` for HTTPS `backendOrigin` (in addition to `sameSite: 'none'` / `deploymentMode: 'cross-site'`); HTTP backends keep the intentional non-Secure dev default. New `isEffectivelySecureCookie` helper (`secure || sameSite === 'none'`) models the wire behavior since `serializeCookie` always emits `Secure` for `SameSite=None`. Path header-safety now rejects any non-printable-ASCII (`<0x20`, `>0x7E` including DEL/Unicode) plus `;`. `validateCookieOptions` enforces `__Secure-` (effectively Secure) and `__Host-` (effectively Secure, no `domain`, `path === '/'`) against effective serialized values at middleware-creation time. Set/clear paths unchanged (both resolve once and serialize identically apart from `Max-Age`/`Expires`).
  - `packages/express-oidc-vault/src/types.ts`: `OidcVaultCookieOptions` JSDoc now documents the HTTPS default, HTTP dev policy, explicit `secure` overrides, `SameSite=None`-implies-`Secure` serialization, header-safe path rule, `__Secure-`/`__Host-` invariants, and that `httpOnly: false` is rejected with no compat switch.
  - `packages/express-oidc-vault/test/bov-08-cookie-secure.test.ts`: new focused file with 31 tests (12-row HTTP/HTTPS × same-origin/same-site/cross-site/sameSite table, explicit override tests, `SameSite=None`+`secure:false` effective-Secure test, `httpOnly:false` creation rejection, 6 unsafe-path creation rejections, 4 invalid-prefix creation rejections, valid-prefix serialize/clear tests, 4-case set/clear attribute-parity tests).
  - `packages/express-oidc-vault/README.md` and `website/docs/packages/express-oidc-vault.md`: cookie default sections updated for the HTTPS `Secure` default, HTTP dev policy, explicit overrides, `SameSite=None` effective `Secure`, and prefix rules; options-table rows note prefix-violation rejection. `CHANGELOG.md` untouched.
- Commands and results (run serially):
  - V1 focused from `packages/express-oidc-vault`: `pnpm exec vitest run --config ../../vitest.config.ts test/config.test.ts test/helpers.test.ts test/index.test.ts test/bov-01-backchannel-retry.test.ts test/bov-02-browser-binding.test.ts test/bov-03-concurrent-refresh.test.ts test/bov-04-provider-resource.test.ts test/bov-05-issuer-identity.test.ts test/bov-06-provider-boundary.test.ts test/bov-08-cookie-secure.test.ts` → 10 files passed, 192 tests passed (161 pre-existing across the nine prior files + 31 new).
  - V2 package: `pnpm --filter @web-ts-toolkit/express-oidc-vault test` (rebuilds transitive deps, includes packed-consumer verification) → 11 files passed, 195 tests passed.
  - `pnpm exec eslint packages/express-oidc-vault/src/cookies.ts packages/express-oidc-vault/src/types.ts packages/express-oidc-vault/test/bov-08-cookie-secure.test.ts` → clean.
  - Browser cookie-storage check: spec-based (RFC 6265bis §4.1.3) `wouldBrowserStorePrefixedCookie` assertion inside the new test file verifies serialized `__Host-` cookies carry `Secure`, `Path=/`, no `Domain`, and `__Secure-` cookies carry `Secure`; no headless-browser runtime available in this environment, so storage is proven against the prefix rules rather than a live browser jar.
- Acceptance checklist:
  - Table-driven HTTP/HTTPS × same-origin/same-site/cross-site defaults plus explicit `secure:true/false` overrides pass; `SameSite=None` with `secure:false` still serializes `Secure`.
  - Invalid `__Secure-`/`__Host-` cookies and unsafe paths (semicolon, CTL, DEL, Unicode/emoji, missing leading `/`) throw from both `validateCookieOptions` and `createOidcVaultMiddleware` at creation; valid prefixed cookies pass creation and their set/clear headers satisfy the browser prefix rules with identical `Path`/`Domain`/`SameSite`/`Secure`/`HttpOnly` attributes.

### Task BOV-09: Isolate Session Cookie Decoding

Status: completed

Kind: defect

Priority: P2; unrelated application cookies can prevent refresh/logout of a valid vault session.

Suggested agent: HTTP parser specialist

Dependencies: BOV-08, for cookie module ownership

Primary ownership: `packages/express-oidc-vault/src/cookies.ts:20-50,160-162`, focused cookie parser and route tests.

Finding and references: every cookie is URI-decoded before selecting the session name. A header containing a valid session cookie and unrelated `analytics=%` throws `OIDC_VAULT_MALFORMED_SESSION_COOKIE`, although unrelated cookie values need not use URI-component encoding. `test/helpers.test.ts:37-46` lacks selected-versus-unrelated malformed-value coverage. New consequence of OIDC-02's controlled-error fix.

Requirements:

1. Decode only the selected session value or tolerate malformed unrelated values without losing the selected credential's validation.
2. Preserve custom names, encoded session IDs, body-transport isolation, and controlled failure for the actual malformed session cookie. Explicitly test the chosen duplicate-name behavior.

Acceptance criteria:

- Valid session plus malformed unrelated cookie works; missing session plus malformed unrelated cookie reports missing session; malformed selected cookie returns the sanitized 4xx error.
- Both refresh and logout obey the same parser policy without raw values in errors.

Verification: V1/V2.

Completion evidence:

- Changed files:
  - `packages/express-oidc-vault/src/cookies.ts`: added `parseSelectedCookieValue(headerValue, selectedName)` which extracts the raw (still percent-encoded) value of the selected cookie without decoding any other cookie in the header. `getSessionIdFromCookie` now uses it and applies `decodeURIComponent` only to the selected value, throwing the existing sanitized `400 OIDC_VAULT_MALFORMED_SESSION_COOKIE` (static message, no raw value) when the selected value is malformed and returning `undefined` (→ `400 OIDC_VAULT_MISSING_SESSION_ID`) when the selected cookie is absent, regardless of malformed unrelated values. Duplicate-name policy explicitly chosen and documented: first exact-name (case-sensitive) occurrence wins; later duplicates are ignored even when malformed, so a trailing injected duplicate cannot override the primary value, while a malformed first occurrence still fails closed. Valueless segments and empty names are skipped; names/values are trimmed. `parseCookieHeader` keeps its generic decode-all contract (BOV-08 validation logic untouched); its JSDoc now points session routes at the isolated parser. All BOV-08 logic (`resolveCookieOptions` HTTPS default, `isEffectivelySecureCookie`, prefix/path validation, set/clear parity) preserved byte-for-byte. Both refresh and logout inherit the policy through the shared `getSessionIdFromRequest` → `getSessionIdFromCookie` path; body transport still ignores the `Cookie` header entirely.
  - `packages/express-oidc-vault/test/bov-09-session-cookie-isolation.test.ts`: new focused file with 17 tests (7 `parseSelectedCookieValue` unit tests including first-wins duplicates in both malformed orders, custom names, exact-name/valueless-segment handling; 5 `getSessionIdFromCookie` tests including sanitized-error assertions that stringify the error to prove no raw leakage; 5 route tests covering refresh+logout with present-session+malformed-unrelated, missing-session+malformed-unrelated → `MISSING_SESSION_ID`, malformed-selected → sanitized 4xx on both routes with no raw value in body/text plus `onError` counts, real-session manual-mode logout success with `analytics=%` present, and body-transport isolation with a malformed vault-name cookie).
  - Types/JSDoc/README/website: JSDoc only (`parseCookieHeader`, `parseSelectedCookieValue`); no public type, README, or website change needed (no contract beyond the route error behavior already documented, which is unchanged for genuinely malformed session cookies). `CHANGELOG.md` untouched.
- Regression proof: new file against the pre-fix `src/cookies.ts` (temporarily stashed) → 13 failed / 4 passed; with the fix → 17 passed.
- Commands and results (run serially):
  - V1 focused from `packages/express-oidc-vault`: `pnpm exec vitest run --config ../../vitest.config.ts test/config.test.ts test/helpers.test.ts test/index.test.ts test/bov-01-backchannel-retry.test.ts test/bov-02-browser-binding.test.ts test/bov-03-concurrent-refresh.test.ts test/bov-04-provider-resource.test.ts test/bov-05-issuer-identity.test.ts test/bov-06-provider-boundary.test.ts test/bov-08-cookie-secure.test.ts test/bov-09-session-cookie-isolation.test.ts` → 11 files passed, 209 tests passed (192 pre-existing + 17 new).
  - V2 package: `pnpm --filter @web-ts-toolkit/express-oidc-vault test` (rebuilds transitive deps, includes packed-consumer verification) → 12 files passed, 212 tests passed.
  - `pnpm exec eslint packages/express-oidc-vault/src/cookies.ts packages/express-oidc-vault/test/bov-09-session-cookie-isolation.test.ts` → clean.
- Acceptance checklist:
  - Valid session plus malformed unrelated cookie works (real-session manual-mode logout with `analytics=%` → 200 `{ loggedOut: true }`, session deleted, `onLogout` fired; refresh/logout with present-but-unknown sessionId + `analytics=%` never return `MALFORMED`).
  - Missing session plus malformed unrelated cookie reports missing session (refresh/logout with only `analytics=%` → 400 `OIDC_VAULT_MISSING_SESSION_ID` with the per-action message).
  - Malformed selected cookie returns the sanitized 4xx (refresh/logout with `oidc_vault_session=%E0%A4%A` → 400 `OIDC_VAULT_MALFORMED_SESSION_COOKIE`, static message, raw value absent from body/text/error objects).
  - Both refresh and logout obey the same parser policy without raw values in errors (all route cases loop over both routes; shared implementation path).
  - Custom names, encoded session IDs (`sess 1` round-trip), body-transport isolation (malformed vault-name cookie ignored under body transport → `MISSING_SESSION_ID` from body lookup), and duplicate-name behavior (first-wins, both malformed orders) explicitly tested.

### Task BOV-10: Validate Route Prerequisites Before Durable Changes

Status: completed

Kind: defect

Priority: P1; routes can leave inaccessible state or report provider failure after successful local logout.

Suggested agent: authentication workflow reliability specialist

Dependencies: BOV-01, BOV-02, BOV-07, to serialize route contract work

Primary ownership: callback/logout prerequisites in `packages/express-oidc-vault/src/index.ts`, focused fault-injection tests.

Finding and references: `src/index.ts:509-533` creates session/code before resolving a required frontend destination; `:265-274` can then throw. `:209-223` cannot supply a custom returnTo without that same configured frontend URI, yet `src/types.ts:285` makes it optional. Local logout deletes at `:717-719` then unconditionally resolves metadata at `:725`, even for `redirect: false`; discovery failure yields an error and skips `onLogout` despite committed revocation. Existing failure tests at `test/index.test.ts:1747-1790,1923-1973` cover code creation and hook failure, not these orderings. Residual of OIDC-17.

Requirements:

1. Validate callback destination before creating durable callback state, preferably at middleware creation if every supported flow needs it. Document any newly required option.
2. Make local-only logout independent of provider discovery. Define redirected logout failure behavior separately without undoing local revocation or omitting its notification.
3. Preserve existing compensation and sanitized errors; do not broaden this into a full route rewrite.

Acceptance criteria:

- Missing frontend configuration fails before session/code creation; a callback cannot strand credentials due solely to late destination resolution.
- With discovery failing and an existing session, local logout reports success, revokes the session, clears cookies where applicable, and delivers its documented notification.
- Redirected logout has tested explicit upstream-failure semantics and still reports local durable state accurately.

Verification: V1/V2 with injected metadata and destination failures.

Completion evidence:

- Changed files:
  - `packages/express-oidc-vault/src/index.ts`: callback handler resolves `resolveFrontendRedirectUri(transaction, options)` into `frontendDestination` immediately after consuming the authorization transaction, before any provider call or durable session/exchange-code creation; the redirect at the end reuses the pre-resolved value. The option stays optional at creation (no newly required option) because refresh/logout/backchannel routes do not need it; a destination-less callback now fails fast with `500 OIDC_VAULT_MISSING_FRONTEND_REDIRECT_URI`. Logout handler commits local revocation + cookie clearing before any upstream work; `redirect: false` returns `200 { loggedOut: true }` with `onLogout` and never calls discovery; `redirect: true` wraps discovery + `buildLogoutUrl` in try/catch, reports upstream failure via `onError` only, still delivers `onLogout`, and falls back to the local `200 { loggedOut: true }` (no redirect) so the response reports the local durable state accurately. Existing compensation (exchange-code failure deletes the created session) and sanitized errors untouched; BOV-01 backchannel and BOV-07 refresh composition untouched.
  - `packages/express-oidc-vault/src/types.ts`: JSDoc only (`OidcVaultLogoutResult` local-vs-redirected contract; `frontendRedirectUri` fail-fast prerequisite with no new required option; `postLogoutRedirectUri` redirected-only scope). `CHANGELOG.md` untouched.
  - `packages/express-oidc-vault/test/bov-10-route-prerequisites.test.ts`: new focused file with 5 tests (missing-destination callback asserts 500 code plus zero `createSession`/`createExchangeCode` calls plus zero token-endpoint hits against a reachable counting server; local logout with 503 discovery asserts 200 + revocation + `onLogout` + no `onError` + zero discovery requests; cookie-transport local logout asserts `Max-Age=0` clear; redirected logout with 503 discovery asserts 200 local success + revocation + `onLogout` + one `onError` with sanitized `OIDC_VAULT_DISCOVERY_FAILED`; manual-mode redirected logout asserts 302 with `id_token_hint` + `post_logout_redirect_uri` and revocation).
  - `packages/express-oidc-vault/README.md` and `website/docs/packages/express-oidc-vault.md`: callback-destination fail-fast, local-only discovery independence, and redirected best-effort fallback notes added to the options tables and behavior paragraphs. `CHANGELOG.md` untouched.
- Dependency respect: BOV-01 replay/catch-up/hook policy, BOV-02 browser-binding investigation (no binding proof added or weakened), and BOV-07 refresh precedence/retention contracts untouched; route edits are confined to callback destination ordering and logout prerequisite handling.
- Regression proof: new file against pre-fix `src/index.ts` (temporarily stashed) → 4 failed / 1 passed (only the manual-mode redirect success control passes on both); with the fix → 5 passed.
- Commands and results (run serially):
  - V1 focused from `packages/express-oidc-vault`: all 15 focused files → 15 files passed, 241 tests passed (236 pre-existing + 5 new).
  - V2 package: `pnpm --filter @web-ts-toolkit/express-oidc-vault test` (rebuilds transitive deps, includes packed-consumer verification) → 16 files passed, 244 tests passed.
  - `pnpm exec eslint packages/express-oidc-vault/src/index.ts packages/express-oidc-vault/src/types.ts packages/express-oidc-vault/test/bov-10-route-prerequisites.test.ts` → clean.
- Acceptance checklist:
  - Missing frontend config fails with 500 `OIDC_VAULT_MISSING_FRONTEND_REDIRECT_URI` before `createSession`/`createExchangeCode` and before the token request (counting server observes zero hits).
  - With 503 discovery and an existing session, local logout (body and cookie transports) returns 200, revokes the session, clears the cookie (`Max-Age=0`), delivers `onLogout`, and performs zero discovery requests.
  - Redirected logout with 503 discovery returns the local 200 success with no redirect target, the lineage revoked, `onLogout` delivered once, and the sanitized discovery failure visible only via `onError`; the manual-mode control still redirects with `id_token_hint` and `post_logout_redirect_uri`.

### Task BOV-11: Replace Unsafe Authentication And Logging Examples

Status: completed

Kind: defect

Priority: P1; copy-paste examples can enable known-key token forgery and disclose refresh-session credentials.

Suggested agent: secure integration documentation specialist

Dependencies: none; fix hazardous examples early, then reconcile later contract notes during BOV-99

Primary ownership: `packages/express-oidc-vault/README.md`, `website/docs/packages/express-oidc-vault.md`, a focused executable documentation fixture; no route implementation ownership.

Finding and references: README `:702,769,819` uses a public fallback signing secret when configuration is absent. The signer at `:718-726` omits issuer/audience required by the validator example at `:824-829`. The audit example at `:898-915` logs session IDs, full request URL, and arbitrary original errors. The same-site deployment example at `:548-562` sets `.example.com` Domain unnecessarily, exposing the API credential to sibling hosts. These are concrete example hazards, not evidence that the library hardcodes the example secret.

Requirements:

1. Fail startup when a suitably strong configured signing key is missing; remove production-capable public fallbacks. Make signer/validator identity settings consistent.
2. Use a purpose-specific correlation value or keyed fingerprint rather than raw session IDs. Log query-free routes and selected sanitized error fields rather than callback URLs or arbitrary error objects.
3. Use host-only cookies for the normal frontend-to-API example. Explain Domain as an advanced expansion, not a prerequisite for cross-origin.

Acceptance criteria:

- Executable signer/validator example accepts the intended token, rejects wrong issuer/audience, and fails missing-key setup.
- Captured example logs exclude sentinel session IDs, query credentials, and secret-bearing error messages.
- README and website examples agree; normal cross-origin API requests do not require sharing the cookie with sibling hosts.

Verification: V1/V2 for committed fixtures and explicit source review of both documentation surfaces.

Completion evidence:

- Changed files (docs + fixture only; no `src` change, no `CHANGELOG.md` change):
  - `packages/express-oidc-vault/README.md`: all three signing-key examples now use a `requireSigningKey` helper that throws at startup unless `APP_JWT_SECRET` encodes to at least 32 bytes (no `?? 'dev-secret-change-me'` fallback); `SignJWT` issuance sets `iss: https://api.example.com` / `aud: api-audience` matching both validator examples (raw `jwtVerify` now enforces `issuer`/`audience`, helper already did); hook example logs HMAC-SHA256 truncated fingerprints instead of raw session IDs, `queryFreeRoute(req)` (`method + path`, never `req.originalUrl`) instead of the full URL, and `sanitizeErrorForLog` selected `{ code, status }` fields instead of the arbitrary error object; cookie-transport example is host-only (no `domain`) with a note that `cookie.domain` is an advanced expansion for sharing with sibling hosts, not required for normal cross-origin API requests.
  - `website/docs/packages/express-oidc-vault.md`: same five surfaces mirrored (signing-key helper, signer iss/aud, raw-validator iss/aud, hook fingerprint/query-free/sanitized-error helpers, host-only cookie example plus Domain-expansion note).
  - `packages/express-oidc-vault/test/bov-11-doc-examples.test.ts`: new focused fixture with 7 tests mirroring the doc patterns (issue/validate round-trip, wrong-issuer rejection, wrong-audience rejection, missing/empty/short-key startup failure, sentinel log-redaction capture, query-free label assertion, README/website agreement assertion).
- Commands and results (run serially):
  - New file alone before doc fix: 6 passed / 1 failed (docs-agreement test failed on `dev-secret-change-me`, confirming the hazard).
  - New file alone after doc fix: 7 passed.
  - V1 focused from `packages/express-oidc-vault` (all 12 focused files incl. the new one): 12 files passed, 216 tests passed.
  - V2 package: `pnpm --filter @web-ts-toolkit/express-oidc-vault test` (rebuilds transitive deps, includes packed-consumer verification) → 13 files passed, 219 tests passed.
  - `pnpm exec eslint packages/express-oidc-vault/test/bov-11-doc-examples.test.ts` → clean.
- Acceptance checklist:
  - Intended token validates with matching subject/sessionId; wrong-issuer and wrong-audience tokens reject; missing/empty/short keys throw `APP_JWT_SECRET` startup errors with no public fallback in either doc.
  - Stringified example logs contain the query-free route and sanitized code but none of the sentinel session IDs, the `code=` query credential, or the `refresh_token=` secret message; fingerprints are stable 16-hex-char values.
  - Grep/source review of both surfaces: no `dev-secret-change-me`, no `APP_JWT_SECRET ??`, no executable `req.originalUrl` (only a "never log" prose warning), no `domain: '.example.com'` in either cookie-transport example; both docs carry the identical helper names, issuer/audience values, and Domain-expansion note.
- Follow-ups: none required by this task; BOV-99 reconciles any later contract notes.

### Task BOV-12: Verify The Actual Minimum Runtime And CJS Types

Status: completed

Kind: defect

Priority: P1; the advertised Node range includes CJS runtimes that cannot load the emitted ESM-only dependency.

Suggested agent: TypeScript packaging/consumer specialist

Dependencies: none

Primary ownership: `packages/express-oidc-vault/package.json`, `test/packed-consumer.test.ts`, `test-packed-consumer/consumer/`, build configuration only if required.

Finding and references: `package.json:39-46` declares Node >=22 and JOSE 6. The inspected `dist/index.js:451,788` synchronously requires JOSE; the installed dependency documents default require(esm) support on Node 22 starting at 22.12.0. `test/packed-consumer.test.ts:295-298` runs only current Node. Its module-mode consumer at `:185-187` and `.ts` fixtures exercise ESM declarations; the JavaScript `.cjs` smoke test does not compile the `.d.ts` require branch. Specific residuals of OIDC-11, not missing consumer tests generally.

Requirements:

1. Rebuild to confirm emitted dependency loading, then either correct the supported engine range or support the currently advertised minimum. Check other admitted major/minor versions, not just one Node 22 patch.
2. Add a strict NodeNext `.cts` consumer with `skipLibCheck: false`, normal Express handlers, root exports, and `req.auth`. Prove which declaration condition resolves.
3. Verify both ESM and CJS runtime consumers at the chosen minimum and a current supported runtime; assert transformed manifest metadata. Do not silently revise unrelated package engines.

Acceptance criteria:

- Every tested advertised minimum loads the packed CJS/ESM roots without experimental flags.
- ESM `.d.mts` and CJS `.d.ts` consumers typecheck independently with public Express augmentation.
- Metadata, README requirements, and release notes agree with verified compatibility.

Verification: V2/V5 plus recorded runtime-version matrix commands/results. If a runtime is unavailable, record that prerequisite and keep minimum-runtime acceptance blocked.

Completion evidence:

- Changed files:
  - `packages/express-oidc-vault/package.json`: `engines.node` corrected from `>=22` to `>=22.12.0`. No other package engines touched (verified via `git diff`; all other `packages/*/package.json` engines unchanged).
  - `packages/express-oidc-vault/test-packed-consumer/consumer/consumer-types.cts`: new strict NodeNext CJS consumer (mirrors `consumer-types.ts`: root exports, normal Express handlers, `req.auth` augmentation, `skipLibCheck: false` via its tsconfig).
  - `packages/express-oidc-vault/test-packed-consumer/consumer/tsconfig-nodenext-cts.json`: new `module/moduleResolution: NodeNext`, `strict: true`, `skipLibCheck: false`, `include: ["consumer-types.cts"]`.
  - `packages/express-oidc-vault/test/packed-consumer.test.ts`: copies the two new consumer files; asserts the transformed publish manifest carries `engines: { node: '>=22.12.0' }`; typechecks the `.cts` consumer; proves declaration conditions via `tsc --traceResolution` (ESM `.ts` resolves `Resolving in ESM mode with conditions 'import' … express-oidc-vault/index.d.mts`; CJS `.cts` resolves `Resolving in CJS mode with conditions 'require' … express-oidc-vault/index.d.ts`).
  - `packages/express-oidc-vault/README.md` and `website/docs/packages/express-oidc-vault.md`: new `Requirements` section only (Node `>=22.12.0` with `require(esm)` rationale, verified runtime list, ESM `.d.mts` vs CJS `.d.ts` condition table). `CHANGELOG.md` untouched. All other BOV fixes preserved.
- Rebuild evidence: fresh `pnpm --filter @web-ts-toolkit/express-oidc-vault... build` confirms the emitted CJS root synchronously requires the ESM-only dependency (`dist/index.js:503,1057` `require("jose")` where `jose@6.2.10` is `"type": "module"` with no CJS export; ESM root uses `import` at `dist/index.mjs:456,1010`). `jose` README documents CJS `require('jose')` only where `require(esm)` is enabled by default (`^20.19.0 || ^22.12.0 || >= 23.0.0`).
- Runtime-version matrix (packed `consumer.cjs` + `consumer.mjs`, no experimental flags; CJS consumer asserts the full root-export key set):
  - Node 22.12.0 (chosen minimum): CJS exit 0, ESM exit 0.
  - Node 22.18.0: CJS exit 0, ESM exit 0.
  - Node 22.20.0: CJS exit 0, ESM exit 0.
  - Node 24.13.1 (other admitted major): CJS exit 0, ESM exit 0.
  - Node 26.7.0 (current): CJS exit 0, ESM exit 0 (also covered inside V2 packed install).
  - Control Node 22.11.0 (inside the old `>=22` range, below the fix): CJS fails with `ERR_REQUIRE_ESM` from `dist/index.js`, ESM loads — proving the advertised `>=22` range was wrong and no runtime is left unverified at the boundary.
- Commands and results (run serially):
  - V2 package: `pnpm --filter @web-ts-toolkit/express-oidc-vault test` → 13 files passed, 219 tests passed (includes staged-tarball install plus CJS/ESM runtime and NodeNext/NodeNext-CJS/Bundler typecheck consumers with declaration-condition trace assertions).
  - V5 release surface: `pnpm build-artifact -- --version 0.99.0-bov12-test` → artifact created; `pnpm verify-artifact -- --version 0.99.0-bov12-test` → verified successfully. Extracted artifact manifest for `packages/express-oidc-vault` carries `engines: { node: '>=22.12.0' }` with unchanged dual `require`/`import` roots and conditional `require`/`import` types.
  - `npm pack --dry-run --json` from `packages/express-oidc-vault` (source-tree file-list check): 6 files, no bundled deps (`README.md`, `dist/index.d.mts`, `dist/index.d.ts`, `dist/index.js`, `dist/index.mjs`, `package.json`); the transformed publish-tree file list (flattened `index.js`/`index.mjs`/`index.d.ts`/`index.d.mts` + `LICENSE`/`README.md`/`package.json`) is asserted in the packed-consumer manifest test, which passed.
  - `pnpm exec eslint packages/express-oidc-vault/test/packed-consumer.test.ts packages/express-oidc-vault/test-packed-consumer/consumer/consumer-types.cts` → clean.
- Acceptance checklist:
  - Every tested advertised minimum loads the packed CJS/ESM roots without experimental flags (22.12.0 minimum plus 22.18.0/22.20.0/24.13.1/26.7.0; pre-minimum 22.11.0 control fails CJS as expected).
  - ESM `.d.mts` and CJS `.d.ts` consumers typecheck independently with `skipLibCheck: false`, normal Express handlers, root exports, and `req.auth`; trace output proves the `import` vs `require` declaration conditions.
  - Metadata (source `package.json`, staged publish manifest, installed manifest, release artifact manifest all `>=22.12.0`), README/website requirements, and this evidence agree; no unrelated package engines revised; `CHANGELOG.md` untouched.

### Task BOV-13: Make Claim Regressions Test Their Named Boundary

Status: completed

Kind: defect

Priority: P2; passing negative tests currently do not establish the required-claim checks they claim to protect.

Suggested agent: authentication test-quality specialist

Dependencies: none

Primary ownership: `packages/express-oidc-vault/test/index.test.ts:1316-1372`, focused verifier tests, invalid helper config fixtures.

Finding and references: tokens created at `test/index.test.ts:1338-1372` for missing exp/iat and invalid azp lack the actual transaction nonce. `src/token-validation.ts:96-120` rejects nonce first using the same asserted error code, masking the intended checks. Helper fixtures at `test/helpers.test.ts:135-138,159-165,182` use `mode: 'discovery'`, outside `OidcVaultConfigMode`. Residual verification gap in OIDC-06.

Requirements:

1. Generate each negative token with otherwise-valid issuer, audience, signature, time, subject, and actual login nonce. Add direct verifier tests where useful, without copying route logic into test helpers.
2. Pair rejection cases with valid controls, including multiple audiences with matching azp. Correct invalid fixture mode literals and type fixtures against the real contract.

Acceptance criteria:

- Each named validation test fails if its specific target check is temporarily removed; record this check-isolation evidence without committing weakened validation.
- Nonce itself has an independent negative case; successful controls prove the fixture reached the intended boundary.

Verification: V1/V2 and recorded targeted mutation/check-isolation evidence.

Completion evidence:

- Changed files (test-only; no production `src` change, no `CHANGELOG.md` change):
  - `packages/express-oidc-vault/test/index.test.ts` (`rejects invalid ID token and token response fields during callback`): negative ID tokens are now built per-case after login with the actual transaction nonce (`build(nonce)`), so missing-exp, missing-iat, wrong-azp, multi-audience-without-azp, and the new wrong-nonce case each carry otherwise-valid issuer/audience/signature/time/subject and reach their named check. Added two valid route controls in the same test: plain single-audience round-trip (302) and multi-audience with matching `azp: 'client_1'` (302).
  - `packages/express-oidc-vault/test/bov-13-claim-boundary.test.ts`: new focused `verifyIdToken` file with 9 tests (2 valid controls + 7 rejections). Every negative token is otherwise valid; each rejection asserts both `code: 'OIDC_VAULT_INVALID_ID_TOKEN'` and its boundary-specific message (`missing exp`, `missing iat`, `missing sub`, `azp validation failed`, `azp is required for multiple audiences`, `nonce validation failed` × 2). Config is built via `resolveOidcVaultConfig` (real `OidcVaultResolvedConfig`, manual mode) — no route logic copied into helpers.
  - `packages/express-oidc-vault/test/helpers.test.ts`: all six `mode: 'discovery'` literals replaced with `resolveOidcVaultConfig({ issuer, clientId: 'client_1' })`, typing fixtures against the real contract (`mode: 'issuer'`). Out-of-scope `mode: 'discovery'` literals in other BOV task files untouched.
- Commands and results (run serially):
  - V1 focused from `packages/express-oidc-vault`: `pnpm exec vitest run --config ../../vitest.config.ts test/config.test.ts test/helpers.test.ts test/index.test.ts test/bov-13-claim-boundary.test.ts` → 4 files passed, 76 tests passed.
  - V2 package: `pnpm --filter @web-ts-toolkit/express-oidc-vault test` (rebuilds transitive deps, includes packed-consumer verification) → 14 files passed, 228 tests passed.
  - `pnpm exec eslint packages/express-oidc-vault/test/bov-13-claim-boundary.test.ts packages/express-oidc-vault/test/helpers.test.ts packages/express-oidc-vault/test/index.test.ts` → clean.
- Check-isolation (targeted mutation) evidence, all mutations temporary (`if (false)` guard on one check), file restored and verified identical afterwards, no weakened validation committed:
  - Disable nonce check → exactly the 2 nonce tests fail (7 pass); valid controls still pass.
  - Disable exp check → exactly `missing exp` fails (1 failed / 8 passed).
  - Disable iat check → exactly `missing iat` fails (1 failed / 8 passed).
  - Disable sub check → exactly `missing sub` fails (1 failed / 8 passed).
  - Disable azp check → exactly `wrong azp` fails (1 failed / 8 passed; multi-audience case still rejected by the separate multi-audience check).
  - Disable multi-audience check → exactly `multiple audiences without azp` fails (1 failed / 8 passed).
  - Route level: disable exp check → repaired `rejects invalid ID token ...` route test fails with `expected 302 to be 502`, proving the missing-exp fixture now reaches the exp boundary (under the old nonce-less fixture it would still have passed via the nonce rejection, masking the check).
- Acceptance checklist:
  - Each named validation test fails when its target check is removed (see per-check evidence above).
  - Nonce has independent negative cases (wrong nonce + nonce-less-when-expected at verifier level, wrong-nonce at route level); valid controls (single-audience + multi-audience-with-matching-azp at both levels) prove fixtures reach the intended boundary.

### Task BOV-14: Separate Bearer Validation From Auth-Context Hook Failures

Status: completed

Kind: defect

Priority: P2; internal callback failures masquerade as invalid credentials and original diagnostics are lost.

Suggested agent: Express error-contract specialist

Dependencies: none

Primary ownership: `packages/express-oidc-vault/src/access-token-middleware.ts`, `src/types.ts:213-216`, dedicated bearer middleware tests; coordinate shared types with BOV-01.

Finding and references: `src/access-token-middleware.ts:35-62` catches validator and `onAuthContext` errors together and maps ordinary errors to 401. The public options offer no error observer. README `:936` broadly points to `onError` for validator details although this separate middleware has no such hook. `test/index.test.ts:2270-2365` does not cover context-hook rejection. Residual observability gap after OIDC-08 sanitization.

Requirements:

1. Define whether `onAuthContext` is a veto or notification and distinguish internal callback failure from credential invalidity. Preserve sanitized validator 401 responses.
2. Provide or clearly document original-error observation through an appropriate Express/library boundary; do not leak original messages to clients or add a broad logging framework.
3. Specify whether downstream middleware runs and whether auth context remains attached on failure.

Acceptance criteria:

- A valid token plus failing callback follows the documented non-misleading contract, rather than an unconditional invalid-token 401.
- Tests assert downstream behavior, original-error visibility, and response redaction for validator and callback errors separately.

Verification: V1/V2; public declarations and docs checked together.

Completion evidence:

- Changed files:
  - `packages/express-oidc-vault/src/access-token-middleware.ts`: bearer/extraction/validator failures keep their existing sanitized 401 behavior with the `Bearer` challenge. `onAuthContext` is now a pre-`next()` veto: its failure detaches `req.auth`, never runs downstream, and never surfaces as invalid-token 401 — an `OidcVaultHttpError` veto keeps its own status/code/client message (challenge header only on 401), any other hook error becomes sanitized `500 OIDC_VAULT_AUTH_CONTEXT_FAILED`. Every failure path notifies the new `onError` observer (failures swallowed) with `{ error, req, res, token?, auth? }`; `headersSent` cases delegate to `next(error)`.
  - `packages/express-oidc-vault/src/types.ts`: new `OidcVaultAccessTokenMiddlewareErrorContext` plus `onError` on `OidcVaultAccessTokenMiddlewareOptions`; `onAuthContext` JSDoc documents the veto contract (no downstream, auth detached, non-401 mapping, `onError` observation). Shared BOV-01 replay-key types/JSDoc untouched.
  - `packages/express-oidc-vault/test/bov-14-bearer-auth-context.test.ts`: new dedicated file with 4 tests (hook ordinary-error 500 without challenge plus downstream/auth-detach/`onError`-identity assertions; `OidcVaultHttpError` 403 veto preservation; validator ordinary-error 401 redaction with challenge and `onError` observation; success attaches auth, runs downstream, no `onError`).
  - `packages/express-oidc-vault/README.md` and `website/docs/packages/express-oidc-vault.md`: bearer sections document the veto contract and the bearer `onError` observer; the shared error-handling paragraph now distinguishes core `hooks.onError` from the bearer middleware's own `onError` option (previously it broadly pointed bearer readers at `onError`, which the bearer middleware did not have). `CHANGELOG.md` untouched.
- Commands and results (run serially):
  - V1 focused from `packages/express-oidc-vault`: all 16 focused files (config, helpers, index, bov-01/02/03/04/05/06/07/08/09/10/11/13/14) → 16 files passed, 245 tests passed (241 pre-existing + 4 new).
  - V2 package: `pnpm --filter @web-ts-toolkit/express-oidc-vault test` (rebuilds transitive deps, includes packed-consumer verification) → 17 files passed, 248 tests passed.
  - `pnpm exec eslint packages/express-oidc-vault/src/access-token-middleware.ts packages/express-oidc-vault/src/types.ts packages/express-oidc-vault/test/bov-14-bearer-auth-context.test.ts` → clean.
- Acceptance checklist:
  - Valid token plus failing callback follows the documented non-misleading contract: ordinary hook error → 500 `OIDC_VAULT_AUTH_CONTEXT_FAILED` with no `Bearer` challenge (not 401 `OIDC_VAULT_INVALID_ACCESS_TOKEN`); `OidcVaultHttpError` veto → its own status/code preserved.
  - Tests assert downstream never runs on any failure, `req.auth` is detached on hook failure (captured request reference), the original error object is observable via `onError` (identity assertion), and response bodies redact both validator secrets and hook secrets separately.

### Task BOV-15: Resolve Options Without Mutating Caller Configuration

Status: completed

Kind: improvement

Priority: P2; a stable construction boundary improves encapsulation, instance reuse, and deterministic tests without a large refactor.

Suggested agent: TypeScript API/encapsulation specialist

Dependencies: BOV-08, BOV-10, BOV-14

Primary ownership: option resolution/composition in `packages/express-oidc-vault/src/index.ts:96-117,803-821` and focused construction tests; avoid wholesale route/module extraction.

Finding and references: `validateOidcVaultOptions` assigns normalized `frontendRedirectUri` back into caller options at `:113-115`. Handlers retain the same mutable object while backend/config/trusted origins are separately resolved once. Reusing or mutating that object can produce mixed configuration snapshots; a frozen options object with a frontend URI can fail construction. Existing creation validation tests do not establish input ownership or instance isolation.

Requirements:

1. Produce an internal resolved snapshot without mutating caller data. Copy configuration containers needed for stable behavior, but retain callable/service identity such as store, hooks, token issuer, and clock; do not deep-clone services.
2. Define post-construction mutation behavior and centralize pure normalization/validation without introducing unnecessary public types or helpers.
3. Add succinct JSDoc on construction and hook lifecycle where it survives emitted declarations and removes ambiguity.

Acceptance criteria:

- Frozen inputs work; creating two middleware instances from reused input does not mutate it or cross-contaminate their resolved configuration.
- Mutation tests demonstrate the documented snapshot policy, and existing public root exports/route behavior remain intact.

Verification: V1/V2 and emitted-declaration inspection; no unmeasured performance claims.

Completion evidence:

- Changed files (BOV-15 deltas only; BOV-08/10/14 logic preserved, no route/module extraction, `CHANGELOG.md` untouched):
  - `packages/express-oidc-vault/src/index.ts`: `validateOidcVaultOptions` is now pure and returns an internal `resolvedOptions` snapshot alongside `backendOrigin`/`config`/`trustedOrigins`. The snapshot spreads the caller object with the normalized `frontendRedirectUri` plus shallow copies of `trustedOrigins`, `cookie`, and `config`; `storeProvider`/`hooks`/`tokenIssuer`/`now` are retained by reference, never deep-cloned. `resolveOidcVaultConfig` receives a copied `config` input. The caller object is never assigned to, so frozen inputs work. `createOidcVaultMiddleware` uses the snapshot for `basePath`, `requestBodyLimit`, and all route registration, and carries succinct construction/snapshot/hook-lifecycle JSDoc that survives emitted declarations. No new public types/helpers; the snapshot type is the existing `OidcVaultOptions` shape kept module-private.
  - `packages/express-oidc-vault/src/types.ts`: JSDoc only on `OidcVaultOptions.hooks` documenting the retained-live service reference, the post-construction replacement policy, and the pre-commit veto vs post-commit notification lifecycle. No runtime or contract change.
  - `packages/express-oidc-vault/test/bov-15-options-snapshot.test.ts`: new focused file with 8 tests (frozen data containers, normalized-URI non-mutation, two-instance reuse isolation, body-transport retention after caller flips to cookie, construction-time frontend destination for login `returnTo`, construction-time cookie name plus trusted-origin enforcement with evil-origin 403, service-identity retention via `now`/`tokenIssuer`/`onLogout`/shared store, public root exports plus login/logout route behavior).
  - `packages/express-oidc-vault/README.md` and `website/docs/packages/express-oidc-vault.md`: one construction-snapshot paragraph each under Public Options. `CHANGELOG.md` untouched.
- Dependency respect: BOV-08 cookie defaults/validation/prefix rules, BOV-10 callback-destination fail-fast plus local/redirected logout semantics, and BOV-14 bearer veto/`onError` contract untouched; edits confined to option resolution, construction JSDoc, and docs.
- Commands and results (run serially):
  - V1 focused from `packages/express-oidc-vault`: all 17 focused files (config, helpers, index, bov-01/02/03/04/05/06/07/08/09/10/11/13/14/15) → 17 files passed, 253 tests passed (245 pre-existing + 8 new).
  - V2 package: `pnpm --filter @web-ts-toolkit/express-oidc-vault test` (rebuilds transitive deps, includes packed-consumer verification) → 18 files passed, 256 tests passed.
  - `pnpm exec eslint packages/express-oidc-vault/src/index.ts packages/express-oidc-vault/src/types.ts packages/express-oidc-vault/test/bov-15-options-snapshot.test.ts` → clean.
  - Emitted-declaration inspection after `pnpm --filter @web-ts-toolkit/express-oidc-vault build`: `dist/index.d.ts` carries the construction snapshot JSDoc on `createOidcVaultMiddleware` and the `Lifecycle hooks shared by reference` JSDoc on `OidcVaultOptions.hooks`; no new public type/helper exported.
- Acceptance checklist:
  - Frozen caller data containers construct successfully with login 302 and the caller JSON unchanged; two instances from one reused input leave the input unchanged and both serve login 302 with independent stores.
  - Post-construction caller mutations (transport flip, cookie rename, trusted-origin push, frontend URI replacement, clientId change) have no effect on the created router per the documented snapshot policy; service references remain live (custom `now` observed at login, custom `tokenIssuer` used at exchange, `onLogout` delivered, shared store mutated).
  - Existing public root exports (`createOidcVaultMiddleware`, `createOidcVaultAccessTokenMiddleware`, `createOidcVaultJwtAccessTokenValidator`, `resolveOidcVaultConfig`) and login/logout route behavior intact.
- Follow-ups: none; no performance claim made.

### Task BOV-16: Prevent Caching Of Credential-Bearing Responses

Status: completed

Kind: improvement

Priority: P2; explicit response-cache policy reduces retention of session/access credentials and authorization redirects.

Suggested agent: HTTP response-boundary specialist

Dependencies: BOV-10

Primary ownership: response policy in `packages/express-oidc-vault/src/index.ts`, focused header tests and HTTP integration guidance.

Finding and references: login/callback redirects at `src/index.ts:413,533`, exchange JSON at `:572-574`, refresh JSON at `:688-690`, and upstream logout redirect at `:732-733` set no explicit cache policy. These carry state, exchange codes, local access/session credentials, or an ID-token hint. Express/application/proxy configuration may supply policies, so this is defense in depth, not a claim that all intermediaries currently cache POST responses.

Requirements:

1. Set a clear no-store policy at the smallest shared credential-response boundary, including relevant error/redirect paths. Decide whether legacy cache headers and redirect referrer policy are needed and document the decision.
2. Do not claim headers remove browser history, reverse-proxy logging, frontend URL cleanup responsibilities, or intentional provider redirect exposure.

Acceptance criteria:

- Success/error/redirect header tests establish no-store on credential-bearing route responses for both transports.
- No credential is added to JSON, URLs, or logs by the policy change; provider logout navigation still works.

Verification: V1/V2 and response-header review across alternate route paths.

Completion evidence:

- Changed files (BOV-16 deltas only; BOV-10 callback-destination fail-fast and local/redirected logout ordering untouched; `CHANGELOG.md` untouched):
  - `packages/express-oidc-vault/src/index.ts`: new `CREDENTIAL_RESPONSE_CACHE_CONTROL = 'no-store'` plus `applyCredentialResponseCachePolicy(res)` helper with JSDoc recording the legacy/referrer decisions and the non-claims (no browser-history clearing, no reverse-proxy log disabling, no frontend `?code=` cleanup, no hiding of intentional provider redirect exposure). Applied once at the vault `baseRouter` boundary (covers every success/redirect response) and re-applied defensively in `handleRouteError` and `createBodyParserErrorHandler` so error JSON shares the same contract. No JSON body, URL, or log content changed.
  - `packages/express-oidc-vault/test/bov-16-credential-cache.test.ts`: new focused file with 4 tests (full login→callback→exchange→refresh→redirected-logout flow plus callback/exchange/refresh/backchannel/malformed-body error paths under body transport; same under cookie transport; local-logout JSON plus backchannel success under both transports). Every response asserts `Cache-Control: no-store` and the absence of `Pragma`/`Expires`/`Referrer-Policy`; exchange/refresh bodies asserted free of upstream `refresh_token`/`access_token` leakage; logout redirect asserted to still navigate to the upstream end-session endpoint with `id_token_hint` and `post_logout_redirect_uri`.
  - `packages/express-oidc-vault/README.md` and `website/docs/packages/express-oidc-vault.md`: one `Cache-Control: no-store` integration bullet each (coverage, legacy/referrer decision, non-goals, `curl -i`/supertest verification guidance). `CHANGELOG.md` untouched.
- Decision record: legacy `Pragma: no-cache`/`Expires` not emitted (`no-store` is the authoritative RFC 9111 directive; legacy headers add no retention protection once `no-store` is present); `Referrer-Policy` not set (redirect `Location` targets intentionally expose protocol-required values to the navigation target and a referrer policy cannot hide that target; subsequent-navigation referrer behavior belongs to frontend/provider pages).
- Commands and results (run serially):
  - V1 focused from `packages/express-oidc-vault`: all 18 focused files (config, helpers, index, bov-01/02/03/04/05/06/07/08/09/10/11/13/14/15/16) → 18 files passed, 257 tests passed (253 pre-existing + 4 new).
  - V2 package: `pnpm --filter @web-ts-toolkit/express-oidc-vault test` (rebuilds transitive deps, includes packed-consumer verification) → 19 files passed, 260 tests passed.
  - `pnpm exec eslint packages/express-oidc-vault/src/index.ts packages/express-oidc-vault/test/bov-16-credential-cache.test.ts` → clean.
  - Response-header review across alternate paths: login/callback/logout redirects, exchange/refresh/logout/backchannel JSON, route error JSON, and body-parser error JSON all assert `no-store` under both transports; refresh-conflict cookie-clear and `headersSent` delegation paths reuse the same shared error emitter so they inherit the contract without route-logic changes.
- Acceptance checklist:
  - Success/error/redirect header tests establish `no-store` on credential-bearing route responses for both transports (4 new tests, all passing).
  - No credential added to JSON, URLs, or logs by the policy change (exchange/refresh bodies asserted free of upstream tokens; only `Cache-Control` header added); provider logout navigation still works (302 to upstream end-session endpoint with intact `id_token_hint` and `post_logout_redirect_uri` under both transports).

### Task BOV-99: Independently Verify Boundary Remediation

Status: completed

Kind: improvement

Priority: P1; individually passing fixes do not establish coherent authentication and published-consumer behavior.

Suggested agent: independent reviewer who did not implement the main fixes

Dependencies: BOV-01, BOV-02, BOV-03, BOV-04, BOV-05, BOV-06, BOV-07, BOV-08, BOV-09, BOV-10, BOV-11, BOV-12, BOV-13, BOV-14, BOV-15, BOV-16

Primary ownership: this task record, full core-package review, affected provider integration, README/website/changelog parity, and verification evidence; no unrelated rewrites.

Finding and references: this plan crosses shared route/provider/types/browser/store boundaries. The earlier completed review and current 67-test baseline did not detect the residuals cited above; do not infer completion from test totals alone.

Requirements:

1. Re-check each acceptance criterion against runtime or required investigation evidence. Review any new implementation follow-ups discovered by BOV-02/03 before accepting security closure.
2. Verify body/cookie transports, trusted/untrusted origins, subject/issuer continuity, refresh omissions, failure compensation, duplicate logout, browser ordering, and sanitized diagnostics across alternate paths.
3. Reconcile docs and declarations after all public changes, especially cookie defaults, issuer strings, failure/retry guarantees, logging, supported Node versions, and hook contracts.
4. Check sensitive data exposure, provider resource bounds, clean packed consumers, and provider parity. Correct new discrepancies rather than relying on historical completion summaries.

Acceptance criteria:

- V2/V3 as applicable, V4, and V5 when the release surface changes have recorded results. Unavailable required prerequisites leave the task blocked with delivered work and unverified criteria listed.
- Investigation outcomes and consequential deferrals name an owner, rationale, residual risk, and follow-up; unresolved reproduced authentication defects are not silently marked completed.
- An independent reviewer signs off on runtime/types/docs parity and each completed task includes changed files, commands, results, and follow-ups.

Verification: shared checks plus independent source/evidence review.

Completion evidence:

- Reviewer stance: independent review only. No `src`, test, README, website, or
  metadata change was made under BOV-99; all BOV-01..16 implementation and
  evidence was inspected as delivered. `CHANGELOG.md` untouched (verified via
  `git diff --stat -- packages/express-oidc-vault/CHANGELOG.md` → empty).
- Changed files under BOV-99: this task record only. No new discrepancies
  requiring minimal fixes were found, so no code/doc correction was needed.
- Verification matrix (all commands from the repository root unless stated,
  run serially, current runtime Node v26.7.0):
  - V2 package: `pnpm --filter @web-ts-toolkit/express-oidc-vault test`
    (rebuilds transitive deps, includes packed-consumer verification) →
    19 files passed, 260 tests passed. Matches the BOV-16 terminal count
    (19/260); no test file lost or silently skipped.
  - V3 provider contracts, serially:
    - `pnpm --filter @web-ts-toolkit/express-oidc-vault-memory-store test` →
      2 files passed, 30 tests passed.
    - `pnpm --filter @web-ts-toolkit/express-oidc-vault-redis-store test` →
      6 files passed, 67 tests passed (live harness available; no
      unavailable-service prerequisite to record).
    - `pnpm --filter @web-ts-toolkit/express-oidc-vault-mongodb-store test` →
      3 files passed, 38 tests passed (live harness available; no
      unavailable-service prerequisite to record).
  - V4 integration, serially:
    - `pnpm lint` → 0 errors, 3 pre-existing warnings in unrelated
      `packages/access-router-client/test/access-router-client.bnd12-benchmark.unit.test.ts`.
    - `pnpm build` → success (all packages including demo apps).
    - `pnpm test` (root, serial) → BLOCKED by an unrelated failure:
      `packages/access-router` `test/options-ownership.test.ts` ART-10
      (`recomputes model permission metadata for nested setter updates`,
      expected `[ 'name', 'secret' ]`, received `[ 'name' ]`).
      `git status --short packages/access-router/` is empty, so this failure
      is on pristine code with no BOV involvement; recorded here as an
      unrelated pre-existing failure, not a BOV regression. The
      express-oidc-vault package itself passes (see V2 above).
  - V5 release surface (metadata/declarations changed, so required):
    - `pnpm build-artifact -- --version 0.99.0-bov99-test` → artifact created.
    - `pnpm verify-artifact -- --version 0.99.0-bov99-test` → verified
      successfully. Extracted `packages/express-oidc-vault` manifest carries
      `engines: { node: '>=22.12.0' }` with unchanged dual
      `require`/`import` roots and conditional `require`/`import` types.
    - `npm pack --dry-run --json` from `packages/express-oidc-vault` →
      6 files, no bundled deps (`README.md`, `dist/index.d.mts`,
      `dist/index.d.ts`, `dist/index.js`, `dist/index.mjs`, `package.json`).
- Per-task acceptance re-check (source + test + docs inspected, not totals):
  - BOV-01: retry-safe backchannel confirmed in `src/index.ts:286-936`
    (namespaced `v2:` replay key, owner/catch-up/sequential hook policy) with
    `test/bov-01-backchannel-retry.test.ts` (5 tests, in V2 pass). Types JSDoc,
    README, and website state the same at-least-once/at-most-once policy and
    the raw-`jti` migration note. Store providers treat the key as opaque
    (spot-checked memory/Redis/Mongo semantics per BOV-01 evidence; V3 green).
  - BOV-02 (investigation): 6-test two-client fixture present and passing in
    V2. Conclusion accepted: forced login AND token theft reproduced under
    both transports; no package/application protection stops cross-browser
    completion. FU1 (browser-bound transaction/exchange proof) reviewed below.
  - BOV-03 (investigation): 5-test deterministic fixture present and passing
    in V2. Conclusions accepted: N overlapping refreshes ⇒ N upstream calls,
    strict providers family-kill the winner, cookie loser can clear the winner
    cookie, 200-after-logout race and stateless-token-after-logout both
    demonstrated. FU1/FU2 reviewed below.
  - BOV-04: body-inclusive deadline, pre-lookup validation, per-timeout
    isolation, 1 MiB/100-key JWKS wrapper confirmed in
    `src/provider-client.ts:177-412`; 13 tests in V2 pass. README/website
    paragraphs match the implementation.
  - BOV-05: verbatim issuer preservation (`src/config.ts:67-93`), exact
    discovery equality (`src/provider-client.ts:71-106`), corrected mode
    precedence confirmed; 19 tests in V2 pass; README/website agree.
  - BOV-06: object boundary, stable 502 policy, callback-vs-refresh field
    requirements, `null`-UserInfo enforcement confirmed in
    `src/provider-client.ts:746-824`, `src/token-validation.ts:52-66`,
    `src/index.ts:559/705/731`; 46 tests in V2 pass; README/website agree.
  - BOV-07: `composeRefreshedUserProfile` precedence confirmed in
    `src/token-validation.ts:101-112` and refresh wiring
    (`src/index.ts:707-750`); 11 tests in V2 pass; BOV-03 retention contract
    preserved (omitted-ID-token verbatim path intact).
  - BOV-08: HTTPS `Secure` default, `SameSite=None`-implies-`Secure`,
    header-safe path, prefix invariants confirmed in
    `src/cookies.ts:63-163`; 31 tests in V2 pass; README/website agree.
  - BOV-09: selected-cookie isolation with first-wins duplicates confirmed in
    `src/cookies.ts:216-274`; BOV-08 logic preserved; 17 tests in V2 pass.
  - BOV-10: fail-fast destination (`src/index.ts:543`), discovery-independent
    local logout with best-effort redirected fallback
    (`src/index.ts:833-876`) confirmed; 5 tests in V2 pass;
    README/website agree.
  - BOV-11: docs-only fixture confirmed — no `dev-secret-change-me` or
    executable `req.originalUrl`/`domain: '.example.com'` in either surface
    (grep-verified); 7 tests in V2 pass; no `src` change as scoped.
  - BOV-12: `engines.node` is `>=22.12.0` (source, staged, installed, and
    artifact manifests agree per V2/V5 checks); `.cts` NodeNext consumer and
    trace assertions present; multi-version matrix recorded in BOV-12
    evidence stands (22.12.0 minimum + 22.18.0/22.20.0/24.13.1/26.7.0 green,
    22.11.0 control fails CJS as expected); current-runtime CJS/ESM load
    re-proven inside this V2 run (packed-consumer stage on Node v26.7.0).
  - BOV-13: test-only repair confirmed (per-case nonce fixtures, valid
    controls, fixed `mode` literals); check-isolation evidence recorded in
    BOV-13; in V2 pass.
  - BOV-14: bearer veto contract (`500 OIDC_VAULT_AUTH_CONTEXT_FAILED` vs
    preserved `OidcVaultHttpError`, downstream/auth-detach, `onError`
    observation) confirmed in `src/access-token-middleware.ts:44-114` with
    matching `src/types.ts:229-258` JSDoc; 4 tests in V2 pass; README/website
    distinguish core vs bearer `onError`.
  - BOV-15: pure option resolution with snapshot semantics confirmed in
    `src/index.ts:133-171`; no route/module extraction; 8 tests in V2 pass;
    emitted `dist/index.d.ts` carries the snapshot JSDoc (rebuilt during V2).
  - BOV-16: `Cache-Control: no-store` at the baseRouter boundary plus both
    error emitters (`src/index.ts:118-122,441,470,979-982`) confirmed; only
    the `Cache-Control` header added, no JSON/URL/log change; 4 tests in
    V2 pass; README/website agree.
- Cross-cutting checks (alternate paths, per requirement 2):
  - Body/cookie transports: parser isolation (BOV-09), set/clear parity
    (BOV-08/09), `sessionId`-absent-in-cookie-body (BOV-02), and full-flow
    cache/error coverage under both transports (BOV-16) all hold.
  - Trusted/untrusted origins: fail-closed refresh/logout origin policy plus
    evil-origin exchange acceptance documented as non-substitute for binding
    (BOV-02/03) — consistent, not contradictory.
  - Subject/issuer continuity: exact issuer binding (BOV-05), UserInfo-sub
    enforcement incl. `null` (BOV-06), refresh sub-continuity (BOV-07), and
    claim-boundary isolation (BOV-13) compose without conflict.
  - Refresh omissions: callback-required vs refresh-omission split (BOV-06)
    plus verbatim-retention path (BOV-07) verified against each other.
  - Failure compensation: callback exchange-code cleanup, refresh
    issue-failure lineage deletion, logout post-commit hook policy, and
    backchannel catch-up deletion all present with sanitized diagnostics.
  - Duplicate logout: replay/catch-up/sequential policy (BOV-01) plus
    concurrent-duplicate evidence (BOV-03) agree on at-least-once delivery.
  - Browser ordering: late-loser cookie clear (BOV-03) remains the known open
    window, deferred to BOV-03-FU2 below — not silently closed.
  - Sanitized diagnostics: no `console.*` in `src`; client payloads go
    through `clientMessage` (`src/errors.ts:20-25`); upstream bodies/statuses
    never leak (BOV-06); validator/hook secrets redacted separately (BOV-14).
- Sensitive data / resource bounds / packed consumer / provider parity
  (per requirements 3–4):
  - Exchange/refresh responses carry only local `sessionId`/`user`/issued
    token (`createExchangeResponse`, `src/index.ts:201-209`); upstream
    `refresh_token`/`access_token` never serialized to the browser; session
    cookie is `HttpOnly` + `encodeURIComponent`-serialized.
  - Provider bounds: overall header-plus-body deadline on all paths,
    1 MiB/100-key JWKS wrapper, 32-entry capped caches with oldest-eviction
    and failure eviction — all present; no unbounded waits remain in the
    reviewed surface.
  - Packed consumers: dual CJS/ESM roots load, `.d.mts`/`.d.ts` conditions
    resolve per trace assertions, 6-file dry-run list with no bundled deps.
  - Provider parity: no store contract changed after BOV-01 (opaque replay
    key only); V3 green on all three providers with live harnesses.
- BOV-02/03 implementation follow-up review (security closure explicitly NOT
  claimed on these points):
  - BOV-02-FU1 (browser-bound transaction/exchange proof): design reviewed —
    binding cookie or `browserBindingHash` on transaction + exchange-code
    records, fail-closed 4xx verification at callback and exchange, provider
    persistence of new optional fields with backward compatibility. DEFERRED:
    owner = maintainer (requires public options/store-field contract change);
    rationale = bounded proposal scoped by the investigation, needs API
    approval before implementation; residual risk = cross-browser callback
    transfer still force-logs the victim and a stolen unconsumed exchange
    code still yields the victim session (token theft) until binding lands.
  - BOV-03-FU1 (store-backed single-flight refresh reservation) and FU2
    (stale-clear contract with rotation generation): designs reviewed —
    store-held lease with TTL/crash expiry and 409-or-winner loser policy
    (FU1); dead-lineage-only clearing with generation guard and
    jar-convergence tests (FU2). DEFERRED: owner = maintainer (requires new
    optional store method coordinated with BOV-01 ownership plus route
    contract change); rationale = cross-instance coordination cannot be a
    process-local mutex and needs store-provider design approval; residual
    risk = N overlapping refreshes still send N upstream requests (family-kill
    against strict single-use providers) and a late loser clear can still
    erase a winner cookie while the winner session stays live.
  - Neither reproduced exposure is marked completed: the investigations are
    complete (bounded evidence + scoped follow-ups), the exposures remain
    open under the FU items above with the documented frontend mitigation
    (deduplicate concurrent refresh; never let callback/exchange URLs cross
    browsers) as the only current protection.
- Parity checklist (runtime vs types/JSDoc vs README vs website vs dist):
  - Cookie defaults (HTTPS `Secure` default, HTTP dev policy, overrides,
    `SameSite=None` effective `Secure`, prefix/path rules, `httpOnly`
    rejection): agree across `src/cookies.ts`, `src/types.ts`, README,
    website — PASS.
  - Issuer strings (verbatim preservation, forbidden components, `http`
    local-test, exact discovery equality, manual precedence): agree across
    `src/config.ts`, `src/provider-client.ts`, `src/types.ts`, README,
    website — PASS.
  - Failure/retry guarantees (backchannel at-least-once/at-most-once,
    callback fail-fast code, local-vs-redirected logout, stable 502 policy,
    refresh conflict 401+clear): agree — PASS.
  - Logging (fingerprints, query-free routes, sanitized error fields,
    core-vs-bearer `onError`): agree — PASS.
  - Supported Node versions (`>=22.12.0` + `require(esm)` rationale +
    condition table): agree across `package.json`, staged/installed/artifact
    manifests, README, website — PASS.
  - Hook contracts (pre-commit veto vs post-commit notification, bearer veto,
    `onError` observation): agree across `src`, `src/types.ts`, README,
    website — PASS.
- Follow-ups: BOV-02-FU1, BOV-03-FU1, BOV-03-FU2 remain open under maintainer
  ownership (see above); root `pnpm test` unrelated ART-10 failure in
  pristine `packages/access-router` to be triaged outside this plan; no BOV
  follow-up required on docs, packaging, or provider parity.
- Sign-off: as independent reviewer I confirm runtime/types/docs parity for
  `packages/express-oidc-vault`, each completed task (BOV-01..16) carries its
  changed files, commands, results, and follow-ups in its Completion evidence
  above, and the only unresolved reproduced auth exposures are the explicitly
  deferred BOV-02-FU1 / BOV-03-FU1 / BOV-03-FU2 items named here.

## Agent Sequencing

- Initial read-only investigations BOV-02/03 may run alongside implementation research. BOV-01 owns route/store contract changes first; reserve `src/types.ts` edits between it and BOV-08/14.
- Provider module lane: BOV-04 -> BOV-05 -> BOV-06. Use separate focused test files where practical to reduce conflicts with the existing shared helper test file.
- Cookie lane: BOV-08 -> BOV-09. Claim-test repair BOV-13 can proceed separately if it owns only its selected test cases.
- Route lane: complete BOV-01/02/03/13 conclusions before BOV-07, then BOV-10, then BOV-15/16 in sequence if both touch composition. BOV-07 explicitly waits for BOV-03 and BOV-13; other shared-file reservations are scheduling constraints, not permission to bypass dependencies.
- Packaging BOV-12 and hazardous-example remediation BOV-11 are independent early work. One documentation owner merges later behavior notes into README/website/CHANGELOG; runtime agents supply exact contract deltas rather than concurrently editing the same prose.
- BOV-14 can use a dedicated test file but must reserve `src/types.ts` and documentation changes. BOV-99 runs last, after required follow-ups or explicit risk decisions.
- Do not parallelize builds/test scripts merely because source ownership is disjoint. The coordinator runs shared verification serially.

## Decisions And Deferrals

- BOV-01 needs a replay/revocation commit and failure policy before a provider API redesign. Its agent owns the proposal; maintainer approval is required for breaking store/persisted-record changes.
- BOV-02/03 must establish browser-binding and end-to-end concurrency evidence before prescribing new proof/lease APIs. Any reproduced exposure becomes an explicit scoped follow-up, not an untracked expansion.
- JWT access-token profile hardening is deferred to a separate bounded decision: `src/token-validation.ts:202-215` does not require exp or token-purpose discrimination, and `src/types.ts:222-227` makes issuer/audience/algorithms optional. The helper may be intentionally generic. Determine supported profiles/key separation before imposing `at+jwt`; residual risk is accepting signed tokens outside the intended application profile when callers underconfigure it.
- Opaque client credential handling is a lower-priority confirmed config limitation: `src/config.ts:28-30,69-70` trims client IDs/secrets before correct Basic form encoding. Existing config tests intentionally expect trimming. Defer pending maintainer choice of direct-input versus environment whitespace policy; leading/trailing-space credentials can currently fail. Do not silently fold this contract change into issuer normalization.
- Broader claim projection/minimization, maximum logout-token age, rate limiting, explicit session-lifetime presets, device flow/PAR/DPoP, and provider-specific authentication methods are not promoted without a concrete consumer requirement or bounded threat/performance study. Existing session expiry is deliberately application/store-owned.
- No new broad architecture rewrite is proposed: cohesive modules already exist. BOV-15 targets a concrete construction-boundary problem; BOV-04 targets concrete shared cache/deadline semantics.

## Definition Of Done

- Actionable defects have focused before/after regressions, passing required checks, and accurate public contract/release notes.
- Investigations have bounded evidence and an implement/defer/no-change conclusion; implementation follow-ups have ownership and acceptance criteria.
- P1 risks are resolved or explicitly deferred by a maintainer with residual risk visible; a blocked check is not a passing check.
- Store changes preserve conformance across memory, Redis, and MongoDB with real harness coverage where relevant.
- The independent review verifies authentication boundaries, resource limits, consumer packaging, and runtime/types/docs agreement; completion evidence is appended without rewriting historical findings.
