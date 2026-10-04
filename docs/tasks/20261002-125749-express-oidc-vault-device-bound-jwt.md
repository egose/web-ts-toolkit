# Express OIDC Vault — Optional Device-Bound JWT (DPoP PoP + Fingerprint Recognition)

Created: 2026-10-02 12:57:49 UTC (`20261002-125749`)

Related: `docs/tasks/20260908-070811-express-oidc-vault-boundary-review.md` (esp. BOV-02 browser binding, BOV-02-FU1 deferred browser-bound transaction/exchange proof)

## 1. Objective and scope

Design and implement **optional** device-bound JWT support for `@web-ts-toolkit/express-oidc-vault`, plus frontend integration guidance/implementation support.

Terminology agreed in discussion:

- **Device-bound JWT (cryptographic)** = **key-bound / sender-constrained JWT** using **proof of possession (PoP)**.
- **DPoP (RFC 9449)** is the standard protocol for implementing PoP over HTTP for this use case.
- **FingerprintJS `visitorId` / `deviceId`** is **device recognition**, not PoP. It is copyable/spoofable and must not be presented as equivalent security.
- A browser-held DPoP key binds to a **browser profile**, not necessarily a physical device. Hardware-backed keys + attestation are out of scope.

Approved first scope (DBJWT-D1–D8):

1. End-to-end DPoP binding for **app-local JWTs** (`tokenIssuer`) and **vault refresh sessions**.
2. Explicit `optional` / `required` modes; default preserves current bearer behavior.
3. Browser binding of login transaction → callback → exchange so the bound key cannot be claimed by another browser.
4. Request-aware API proof verification everywhere the JWT is accepted.
5. Store persistence + atomic consume/match + replay protection across memory/Redis/MongoDB providers.
6. Frontend SPA client: persistent key, proof generation, login/exchange/refresh/fetch updates.
7. Docs, README, website parity, packed-consumer verification.

Out-of-scope follow-up (track separately unless maintainer expands scope):

- Upstream IdP DPoP (provider token endpoint DPoP proofs, `token_type: DPoP` from IdP, DPoP UserInfo).
- Hardware-backed keys (TPM/Secure Enclave), device attestation/enrollment protocol.
- FingerprintJS as a hard security boundary (only as optional recognition/risk signal; see DBJWT-09).

## 2. Working rules and non-goals

Working rules:

- Default behavior is unchanged: existing bearer sessions, JWTs, and API middleware keep working with no config change.
- Bound sessions must never downgrade to bearer by omitting a proof.
- Binding is selected at login and persisted; refresh preserves it; rotation preserves it.
- Every API entry that accepts a bound JWT must enforce the binding; `mapClaims` must not be able to strip it.
- Follow existing sanitized-error contract: stable `{ code, message }` to browser, original diagnostics via `hooks.onError` only.
- Follow existing `Cache-Control: no-store` credential-response policy.
- Keep `OidcVaultStoreProvider` portable-contract discipline: document provider-specific behavior, update all three built-in stores, update conformance tests.
- Do not revert unrelated worktree changes (e.g. current `access-router*` modifications visible in `git status`).
- Preserve required serialization for `pnpm test` (`--workspace-concurrency=1`; per-package pre-build).

Non-goals:

- No breaking change to default bearer auth.
- No new hard dependency on FingerprintJS in the backend package; accept a generic fingerprint signal if implemented.
- No hardware attestation, no device enrollment UX, no device-management API.
- No upstream provider DPoP in the first milestone (approved deferral DBJWT-D2).
- No `llms.txt` until metadata/exports/declarations/README are correct (per `ai-friendly-ts-package` skill).

## 3. Baseline verification

Before starting implementation, the owning agent must record the baseline:

```sh
pnpm --filter @web-ts-toolkit/express-oidc-vault... build
pnpm --filter @web-ts-toolkit/express-oidc-vault test
```

Also note:

- `packages/express-oidc-vault/src/index.ts` — core middleware, login/callback/exchange/refresh/logout, `tokenIssuer` projection at `withIssuedToken`.
- `packages/express-oidc-vault/src/types.ts` — `OidcVaultTokenIssueResult.tokenType?: 'Bearer'`, `OidcVaultSession`, `AuthorizationTransactionInput`, `ExchangeCodeRecordInput`, `OidcVaultAccessTokenValidator`, `OidcVaultJwtAccessTokenValidatorOptions`.
- `packages/express-oidc-vault/src/access-token-middleware.ts` — bearer-only extraction (`extractBearerToken`), `WWW-Authenticate: Bearer`, `onAuthContext` veto semantics.
- `packages/express-oidc-vault/src/token-validation.ts` — `createOidcVaultJwtAccessTokenValidator`, `defaultJwtClaimsMapper`, no request context.
- `packages/express-oidc-vault/src/provider-client.ts:694-800` — `requestToken`, bearer-only `token_type` validation.
- `packages/express-oidc-vault/src/cookies.ts`, `src/origins.ts` — cookie transport + `trustedOrigins` CSRF policy (not a substitute for browser binding).
- `packages/express-oidc-vault/test/bov-02-browser-binding.test.ts` — current cross-browser exposure evidence (forced login + stolen exchange code).
- `packages/express-oidc-vault/README.md:672-677` — documented browser-binding gap + BOV-02-FU1 pointer.
- Stores: `packages/express-oidc-vault-memory-store/src/index.ts`, `packages/express-oidc-vault-redis-store/src/{index.ts,records.ts,scripts.ts}`, `packages/express-oidc-vault-mongodb-store/src/{store.ts,documents.ts}`.
- FingerprintJS security note: open-source fingerprint is browser-computed and vulnerable to spoofing/reverse engineering; do not treat `visitorId` as unforgeable.

## 4. Priority / severity definitions

- **P0**: Security correctness or contract break without which device binding is unsound (binding bypass, downgrade, replay, wrong-browser claim).
- **P1**: Required for complete optional feature (stores, frontend, docs, compatibility).
- **P2**: Hardening/observability/follow-ups (nonces, metrics, upstream IdP DPoP, hardware keys).

## 5. Waves / milestones

- Wave 0 — Baseline + failing regression scaffolding (DBJWT-01).
- Wave 1 — Maintainer contract decisions (DBJWT-02; explicit D1–D8 bundle approval obtained; contract freeze recorded below).
- Wave 2 — Backend core policy + issuance/types contract (DBJWT-03).
- Wave 3 — Store contracts, atomic match/consume + replay methods in all three providers (DBJWT-08).
- Wave 4 — Shared replay/nonce foundation (DBJWT-07), then shared proof verifier + API enforcement (DBJWT-06).
- Wave 5 — Login/transaction/callback binding (DBJWT-04), then exchange/refresh/logout enforcement (DBJWT-05). Store atomicity and the shared verifier must already exist; sequence shared handlers.
- Wave 6 — Fingerprint-recognition alternative, explicitly non-PoP (DBJWT-09).
- Wave 7 — Frontend SPA client (DBJWT-10).
- Wave 8 — Docs/packaging/compatibility (DBJWT-11).
- Wave 9 — Final independent integration review (DBJWT-12).

## 6. Detailed executable tasks

Execution contract: section 8's **approved D1–D8 bundle** is authoritative for exact public names, policy, bounds, errors, and frontend placement. Earlier illustrative alternatives retained in historical findings/decision requirements do not reopen those choices. Execute separate isolated agents sequentially: **DBJWT-03 → DBJWT-08 → DBJWT-07 → DBJWT-06 → DBJWT-04 → DBJWT-05 → DBJWT-09 → DBJWT-10 → DBJWT-11 → DBJWT-12**.

### Task DBJWT-01: Baseline + threat-model regression scaffolding

Status: completed

Assigned: isolated DBJWT-01 sub-agent (sequential execution).

Priority: P0

Suggested agent: test/auth engineer

Dependencies: none

Primary ownership:

- `packages/express-oidc-vault/test/dpop-device-bound.*.test.ts` (new)
- `packages/express-oidc-vault/test/bov-02-browser-binding.test.ts` (read-only reference)

Finding:

No device-bound JWT support exists. Current exchange/refresh/API paths are bearer-only. `test/bov-02-browser-binding.test.ts` already proves a transferred callback URL force-logs the victim and a stolen unconsumed exchange code yields the victim session. Any device-binding design must close (for bound sessions) the “first presenter claims the key” hole.

References:

- `packages/express-oidc-vault/src/index.ts:518-548,556-683,685-726,728-850`
- `packages/express-oidc-vault/src/access-token-middleware.ts:11-27,44-114`
- `packages/express-oidc-vault/src/types.ts:292-315,317-330,367-373`
- `packages/express-oidc-vault/test/bov-02-browser-binding.test.ts:241-415`
- `packages/express-oidc-vault/README.md:670-677`

Implementation requirements:

1. Add failing/skipped regression scaffolding (not full implementation) for:
   - wrong-key exchange/refresh rejected before session/code mutation;
   - stale/missing-proof downgrade rejected for bound sessions;
   - replayed proof rejected across instances;
   - transferred callback + stolen exchange code cannot claim a bound session;
   - honest same-browser login → callback → exchange → refresh → API passes in both `body` and `cookie` transports;
   - legacy unbound sessions still pass when mode is `optional`.
2. Keep new tests isolated from existing BOV suites; do not change existing passing assertions.
3. Record baseline `pnpm --filter @web-ts-toolkit/express-oidc-vault... build` and package test results in completion evidence.

Acceptance criteria:

- New test file(s) exist and document the intended bound vs unbound matrix.
- Tests fail (or are explicitly skipped with TODO + task ID) on current code for bound cases and pass for legacy bearer cases.
- Baseline build/test output recorded; no existing tests broken.

Completion evidence:

- Changed paths (DBJWT-01 only):
  - `packages/express-oidc-vault/test/dpop-device-bound.regression.test.ts` (new): **6 passing legacy cases + 41 explicit task-ID `it.todo` scenarios**. Isolated HTTP/cookie-jar fixture uses separate upstream/local JWT signing keys, actual local JWT verification at an API route, provider request tracking, single-use upstream refresh tokens, and store mutation spies.
  - `docs/tasks/20261002-125749-express-oidc-vault-device-bound-jwt.md`: DBJWT-01 status and completion evidence.
- Passing legacy cases: same-browser login → callback → exchange → refresh → Bearer API for both transports; seeded pre-binding session/code records for both transports; cookie Origin rejection preserves the session/upstream token for an honest retry; a custom bearer validator still receives exactly `validate(token)`. Assertions cover PKCE, single-use state/code, token projection, no upstream credential leakage, `no-store`, cookie attributes, rotation, lineage, and absolute expiry preservation.
- Commands/results (build and test invocations run serially):
  - Baseline before scaffolding, repository root: `pnpm --filter @web-ts-toolkit/express-oidc-vault... build` → exit 0; CJS, ESM, and both declaration builds passed.
  - Baseline before scaffolding, repository root: `pnpm --filter @web-ts-toolkit/express-oidc-vault test` → exit 0; **24 files passed, 475 tests passed** (18.00s), including existing BOV suites and packed-consumer checks.
  - First focused run, `packages/express-oidc-vault`: `pnpm exec vitest run --config ../../vitest.config.ts test/dpop-device-bound.regression.test.ts` → 5 passed, 1 failed, 41 TODO. The scaffold expected the wrong existing Origin-error message; corrected the expectation to `Refresh request origin is not trusted.` First focused ESLint run also found an unused mock argument; corrected the mock to use its token in claims. No production changes were needed.
  - Corrected focused run, `packages/express-oidc-vault`: `pnpm exec vitest run --config ../../vitest.config.ts test/dpop-device-bound.regression.test.ts test/bov-02-browser-binding.test.ts` → exit 0; **2 files passed, 12 tests passed, 41 TODO** (1.97s): 6 new legacy passes and all 6 unchanged BOV-02 passes.
  - Focused lint, repository root: `pnpm exec eslint packages/express-oidc-vault/test/dpop-device-bound.regression.test.ts` → exit 0 after correction; no errors/warnings.
  - Final required build, repository root: `pnpm --filter @web-ts-toolkit/express-oidc-vault... build` → exit 0; CJS, ESM, and both declaration builds passed.
  - Final package verification, repository root: `pnpm --filter @web-ts-toolkit/express-oidc-vault test` → exit 0; **25 files passed, 481 tests passed, 41 TODO (522 collected)** (20.46s), including packed-consumer checks and all 475 pre-existing tests.
  - `git diff --check` → exit 0. Source/store/BOV-02/CHANGELOG diff inspection was empty; pre-existing `access-router`/`access-router-client` and related website changes remain intact.
- Scaffolding follow-through (activate using approved contracts, keep the passing no-config baseline):
  - **30 session/browser TODOs** = 15 per transport: explicit optional legacy compatibility; required-mode legacy rejection; wrong-key exchange/refresh; missing/stale proof downgrade rejection; transferred callback, stolen code, and cross-origin urlencoded exchange rejection; honest bound lifecycle in optional and required modes; cross-instance exchange/refresh proof replay.
  - **11 API TODOs**: missing proof/Bearer fallback, wrong key, invalid signature, invalid `typ`/algorithm/private JWK, wrong method, wrong public URL/Host, wrong `ath`, stale proof, `mapClaims` binding-strip attempt, sequential/concurrent cross-instance replay, and fresh-proof recovery.
  - Every TODO title names DBJWT-01 and activation owners: DBJWT-02/03 modes/issuance, DBJWT-04 browser-bound login/callback, DBJWT-05 exchange/refresh, DBJWT-06 API verification, DBJWT-07 replay, DBJWT-08 store atomicity. Nearby comments specify no-mutation/provider-call assertions, honest retry, and full lifecycle expectations. Shared replay tests must use different live codes/sessions so single-use code/token or rotation failures cannot masquerade as proof replay protection.
- Blockers/integration concerns at DBJWT-01 completion (historical): none for DBJWT-01. Explicit `optional`/`required` configuration does not exist yet; runnable legacy cases therefore use the current no-binding-config default, with explicit-mode coverage recorded as TODO rather than passing an ignored/invented option. DBJWT-02 decisions remain pending. Some wave labels/cross-references disagree with detailed task IDs (API/replay/store); scaffold activation IDs follow the detailed headings. The HTTP fixture does not verify real browser cookie/CORS behavior or frontend key persistence. The pre-existing Vite config-loader warning remains non-fatal.
- Subsequent resolution: DBJWT-02's D1–D8 bundle has now been explicitly approved; wave IDs/dependencies were corrected and the frozen contract is in section 8. The production feature and TODO activation still belong to the implementation tasks below.

---

### Task DBJWT-02: Maintainer contract decisions (approved contract freeze)

Status: completed

Assigned: isolated DBJWT-02 sub-agent (sequential execution).

Resolution: explicit maintainer/user approval of the complete D1–D8 section 8 bundle was obtained through the parent's question tool and supplied in the resume instruction. The unchanged approved contract is frozen and document verification passed; approval is no longer a blocker. Implementation starts with DBJWT-03.

Priority: P0

Suggested agent: maintainer / architect

Dependencies: DBJWT-01

Primary ownership:

- `packages/express-oidc-vault/src/types.ts` (public contract specified in section 8; production implementation belongs to DBJWT-03/08/06)
- This task file (record decisions)

Finding:

Multiple designs are viable, but implementation cannot proceed soundly without choosing the public contract: modes, login initiation, proof transport, replay storage interface, and fingerprint posture.

References:

- `packages/express-oidc-vault/src/types.ts:435-565` (`OidcVaultOptions`)
- `packages/express-oidc-vault/src/index.ts:134-173,512-548`
- `docs/tasks/20260908-070811-express-oidc-vault-boundary-review.md:1016-1024` (BOV-02-FU1 proposal)

Original decision requirements (retained for provenance; resolved by section 8):

The original task required deciding and recording the following choices in this task file rather than guessing in code:

1. **Modes**: confirm `deviceBinding.mode: 'optional' | 'required'` (or alternative naming, e.g. `proofOfPossession`). Confirm default = current bearer behavior.
2. **Login initiation**: confirm proof-aware initiation contract. Browser navigation (`GET /login`) cannot carry a `DPoP` header, so choose one:
   - (a) new `POST /login` (or `/login/initiate`) accepting a DPoP proof / public JWK and returning `{ authorizationUrl }`; or
   - (b) transaction-binding cookie + key thumbprint carried through callback; or
   - (c) both, with explicit precedence.
3. **Proof transport**: confirm `DPoP` header name, `Authorization: DPoP <token>` scheme for APIs, and proof requirements for exchange/refresh/logout.
4. **Replay interface**: confirm whether replay reservation is a new optional store method, an opaque injected `replayStore`, or core-only memory fallback with documented multi-instance limitation.
5. **Fingerprint posture**: confirm DBJWT-09 is recognition/risk-signal only, never a substitute for PoP.
6. **Upstream scope**: confirm upstream IdP DPoP is deferred.
7. **Nonces**: confirm issuance scope, expiry, shared verification, and bounded retry policy.
8. **Frontend placement**: confirm the minimal browser-helper/example workspace and dependency choice.

Acceptance criteria:

- Each of DBJWT-D1…D8 below has an explicit maintainer decision recorded.
- Waves 2+ do not start implementation on undecided contracts.

Decision-proposal evidence (historical, before explicit approval):

- Read this entire plan, root `AGENTS.md`, core types/handlers/validator/errors/cookie/origin policies, all three store implementations and conformance suite, BOV-02-FU1/BOV-03 follow-ups, and browser/workspace conventions. Only the root `AGENTS.md` applies to these paths.
- At proposal delivery, section 8 recorded one recommended approval bundle with exact option/interface names, legacy matching, replay/nonce bounds, errors, and browser placement; no D1–D8 approval had yet been received. The subsequent explicit approval is recorded in section 8.
- Corrected factual task-ID references and dependency scheduling: stores precede guarded consumes; replay precedes API enforcement; the shared proof verifier precedes vault proof-aware handlers. Existing DBJWT-01 evidence is retained as historical evidence.
- Verification for the documentation-only proposal was recorded at the end of section 8; DBJWT-01 already records the implementation baseline.

Completion evidence (2026-10-02, approved contract/document verification):

- Changed only `docs/tasks/20261002-125749-express-oidc-vault-device-bound-jwt.md`: froze all D1–D8 as approved without changing their chosen interfaces, behavior, defaults/bounds, errors, or example placement; recorded the parent's exact question-tool approval provenance in section 8.
- Preserved historical findings and pre-approval evidence with explicit historical labels/resolution notes. Replaced current pending-approval/blocking alternatives in executor requirements with references to the approved contract. DBJWT-03…12 remain pending implementation.
- Contract audit: all eight approved decision summaries, detailed D1–D8 notes, public signatures/options, sanitized-error table, and sequence agree. Every declared dependency (including `through` ranges for DBJWT-11/12) precedes its task in **01 → 02 → 03 → 08 → 07 → 06 → 04 → 05 → 09 → 10 → 11 → 12**; no circular dependency remains.
- Acceptance scheduling audit: primitive policy/store/replay tasks verify their own contracts; integrated handler checks activate later. DBJWT-05 owns DBJWT-04's exchange integration checks, and DBJWT-10 owns DBJWT-09's final browser integration, preserving coverage without implicit reverse dependencies.
- Verified at repository root: `git diff --check` → exit 0; `git diff --no-index --check /dev/null docs/tasks/20261002-125749-express-oidc-vault-device-bound-jwt.md` → exit 0 (explicitly covers this untracked task document). Tool reads/searches confirmed approval/status/cross-reference consistency; `git status --short` confirmed unrelated access-router work and the DBJWT-01 scaffold remain present.
- Scope: documentation/contract freeze only; no production source, test scaffold, CHANGELOG, or commit changes. Build/runtime tests were not rerun because this step changes no implementation; DBJWT-01's baseline remains the implementation evidence.
- Result: DBJWT-02 acceptance criteria satisfied; next executable task is **DBJWT-03**, followed by the frozen sequential order above.

---

### Task DBJWT-03: Opt-in policy + issuance contract (`cnf/jkt`, `tokenType`)

Status: completed

Assigned: isolated DBJWT-03 sub-agent (sequential execution).

Priority: P0

Suggested agent: backend auth engineer

Dependencies: DBJWT-02

Primary ownership:

- `packages/express-oidc-vault/src/types.ts`
- `packages/express-oidc-vault/src/index.ts` (`withIssuedToken`, `createExchangeResponse`)
- `packages/express-oidc-vault/test/` issuance contract tests

Finding:

`OidcVaultTokenIssueResult.tokenType` only allows `'Bearer'`, and `withIssuedToken` rejects anything else (`src/index.ts:386-387`). `IssueTokenInput` exposes `session/req/res` but no verified key confirmation, so a custom issuer cannot soundly emit a key-bound JWT today.

References:

- `packages/express-oidc-vault/src/types.ts:281-315`
- `packages/express-oidc-vault/src/index.ts:218-228,362-391,685-726,728-850`

Implementation requirements:

1. Implement `deviceBinding?: OidcVaultDeviceBindingOptions` and the approved D1 public option/types/defaults/bounds in section 8; use its exact algorithm/nonce contracts.
2. Add optional `deviceBinding?: OidcVaultDpopBinding` to session/transaction/exchange records and optional `browserBindingHash` to transactions/codes. Persist the thumbprint only; no stored JWK, algorithm, or historical enforcement mode. Keep legacy omissions supported under D1/D5.
3. Extend `IssueTokenInput` with `deviceBinding?: Readonly<OidcVaultVerifiedDpopBinding>` per D1.
4. Allow `tokenType: 'DPoP'` (union with `'Bearer'`); require exact DPoP and matching JWT `cnf.jkt` for bound issuance. Unbound issuance preserves exact-literal and “omitted stays absent” JSON behavior.
5. Ensure `createExchangeResponse` preserves session/user + issued token fields for both transports.
6. Validate options at construction (fail fast on unknown alg, non-positive age, etc.) following existing `validateOidcVaultOptions` style.
7. Take an internal resolved snapshot without mutating caller options (follow BOV-15 pattern).

Acceptance criteria:

- Omitted binding config preserves default bearer behavior (all existing tests pass); policy-unit coverage verifies enabled `optional` permits unbound context and `required` rejects it with the approved sanitized error before mutation.
- Bound issuance emits JWT with `cnf.jkt` matching the bound key; `tokenType` is `'DPoP'`.
- New contract tests fail before and pass after; existing issuance rollback semantics preserved (revoke lineage + clear cookie on invalid issuer result).

Integration activation: actual required/optional login/callback/exchange/refresh/API behavior is verified by DBJWT-04/05/06 using these policy/issuance primitives. DBJWT-03 does not depend on those later handlers being implemented.

Completion evidence (2026-10-02, isolated sequential DBJWT-03 agent):

- Changed paths (DBJWT-03 only):
  - `packages/express-oidc-vault/src/types.ts`: exact D1 vault policy/proof/nonce types; thumbprint-only session/transaction/code binding and transaction/code `browserBindingHash`; readonly verified issuer context; exact `'Bearer' | 'DPoP'` result union and shipped JSDoc. Added only the D5 shared store **signatures** needed for opt-in construction (listed below).
  - `packages/express-oidc-vault/src/device-binding-policy.ts` (new, internal): validated detached/frozen defaults, current-algorithm/key matching, disabled/optional/required preflight, canonical SHA-256 thumbprint snapshots, binding restoration after mutable hooks, HTTPS/static-origin checks with loopback HTTP development, and six-capability construction guard. Nonce containers are frozen and bytes copied (including Buffer/subarray inputs); private typed-array bytes are never supplied to hooks/issuer.
  - `packages/express-oidc-vault/src/token-issuance.ts` (new, internal): extracted `createExchangeResponse` and shared `withIssuedToken` with issuer-result allowlisting and original-lineage rollback. Bound issuance requires explicit already-verified context, exact DPoP, and compact signed-JWT payload `cnf.jkt` equality; local signing remains independent of the proof algorithm (verified HS256 local signing with ES256 proof context). Policy/key preflight failures do not invoke issuer/revoke/clear cookies. Issuer input binding is frozen/detached, session/plain profile/provider/metadata containers are detached, and rollback authority is captured before issuer mutation. Invalid output/issuer errors revoke the original lineage and clear cookie transport; unbound Bearer/omitted/opaque-token behavior and omitted issuer are preserved.
  - `packages/express-oidc-vault/src/index.ts`: construction snapshots/validation, shared issuance/response helper integration, and precreate binding restoration (unbound hooks cannot enroll an unproved key). Credential-response/error handling retains no-store and private diagnostic/sanitized JSON separation.
  - `packages/express-oidc-vault/test/dpop-device-binding-policy.test.ts` (new): **82 passing** construction/policy/snapshot regressions, including each missing capability, exact age/skew/nonce bounds, static origins, canonical/malformed/null binding, required preflight, current allowlists, original-key matching, mutation isolation, and no legacy enrollment.
  - `packages/express-oidc-vault/test/dpop-token-issuance.test.ts` (new): **44 passing** issuance/rollback regressions across body/cookie and exchange/already-rotated contexts, real local JWT signing/verification, malformed compact JWT/confirmation/token type, omitted issuer, getter capture, issuer/context mutation, original-lineage cleanup, and no-revocation policy failures. This fixture supplies verified context directly; it does not simulate proof-aware handlers, atomic consumes, replay, or nonce verification.
  - `packages/express-oidc-vault/test/dpop-device-bound.regression.test.ts`: **2 added passing** real no-config precreate-hook anti-enrollment cases (one per transport), retained the original **6 passing** legacy cases and **41 TODOs**; updated approved-contract/activation comments and a focused strict-check cookie-header narrowing.
  - `packages/express-oidc-vault/test/ovh-05-token-response.test.ts`: **1 added passing** real-route unbound-DPoP-result rejection/rollback case; all original issuer projection/rollback cases remain passing (**31 total**).
  - `packages/express-oidc-vault/test-packed-consumer/consumer/consumer-types.ts`, `packages/express-oidc-vault/test-packed-consumer/consumer/consumer-types.cts`: root-only positive/negative policy/binding/issuer/store declaration consumers, including readonly verified context, asymmetric proof algorithms, required stronger capabilities, mandatory exact/null matches, and exact token literals.
  - `packages/express-oidc-vault/README.md`: staged policy/record/issuance contract and defaults, authoritative verified context, output validation/rollback, and explicit upcoming HTTP/store integration stages. Full example/website parity remains DBJWT-11.
  - This original task file: DBJWT-03 completion and handoff evidence; section 8's frozen choices are unchanged.
- Commands/results (all build/package-test invocations issued **sequentially**, repository root unless stated):
  - Baseline: `pnpm --filter @web-ts-toolkit/express-oidc-vault... build` → exit 0, CJS/ESM + both declaration outputs; `pnpm --filter @web-ts-toolkit/express-oidc-vault test` → exit 0, **25 files / 481 passed / 41 TODO (522 collected)**, 23.41s.
  - Before production implementation, package directory: `pnpm exec vitest run --config ../../vitest.config.ts test/dpop-device-binding-policy.test.ts` → **45 failed / 7 passed (52)**, demonstrating ignored invalid policy/origins and missing-capability checks on the old code.
  - Final focused run, package directory: `pnpm exec vitest run --config ../../vitest.config.ts test/dpop-device-binding-policy.test.ts test/dpop-token-issuance.test.ts test/dpop-device-bound.regression.test.ts test/ovh-05-token-response.test.ts test/bov-15-options-snapshot.test.ts` → exit 0, **5 files / 173 passed / 41 TODO (214 collected)**, 3.76s.
  - Final required build: `pnpm --filter @web-ts-toolkit/express-oidc-vault... build` → exit 0, CJS/ESM + `index.d.ts`/`index.d.mts` (38.04 KB each). Declaration reads confirmed root exports/JSDoc, exact literals, optional base capabilities, and no public policy/issuance-helper export or new subpath.
  - Final full package tests: `pnpm --filter @web-ts-toolkit/express-oidc-vault test` → exit 0, **27 files / 610 passed / 41 TODO (651 collected)**, 18.02s; **129 additional passes** above baseline. Includes all legacy/BOV suites and all **3 packed-consumer tests**: real publish transform, `npm pack --dry-run --json` exact **7-file** staged artifact, CJS/ESM runtime, and strict `skipLibCheck: false` NodeNext ESM/NodeNext CJS/Bundler consumers with both declaration-condition traces.
  - Focused lint: `pnpm exec eslint packages/express-oidc-vault/src/types.ts packages/express-oidc-vault/src/index.ts packages/express-oidc-vault/src/device-binding-policy.ts packages/express-oidc-vault/src/token-issuance.ts packages/express-oidc-vault/test/dpop-device-binding-policy.test.ts packages/express-oidc-vault/test/dpop-token-issuance.test.ts packages/express-oidc-vault/test/dpop-device-bound.regression.test.ts packages/express-oidc-vault/test/ovh-05-token-response.test.ts packages/express-oidc-vault/test-packed-consumer/consumer/consumer-types.ts packages/express-oidc-vault/test-packed-consumer/consumer/consumer-types.cts` → exit 0, **10 files, no errors/warnings**.
  - Focused strict source/policy: `pnpm exec tsc --ignoreConfig --noEmit --module ESNext --moduleResolution Bundler --target ES2022 --strict --skipLibCheck false --types node packages/express-oidc-vault/src/index.ts packages/express-oidc-vault/test/dpop-device-binding-policy.test.ts` → exit 0.
  - Focused strict changed-source/test graph: `pnpm exec tsc -p <repo-root>/_tmp/dbjwt-03-typecheck/tsconfig.json` → exit 0, **5 entry files** (source root and all four changed runtime test files) plus transitive sources. External temporary config uses ES2022/Bundler/strict/`skipLibCheck: false` and actual `@types/supertest@6.0.3` installed outside the workspace; no workspace dependency/lockfile changes. An initial run exposed the scaffold's pre-existing `Set-Cookie` cast mismatch; replaced it with real runtime narrowing and reran cleanly.
  - `git diff --check` → exit 0; `git diff --no-index --check /dev/null <path>` → exit 0 separately for all **6 untracked DBJWT paths** (this task file, two internal sources, two new focused tests, and the original scaffold). No CHANGELOG, store implementation, API verifier/middleware, unrelated access-router/website work, or commit changes.
- Baseline check limitation (not a DBJWT-03 implementation blocker): before these changes, `pnpm exec tsc -p packages/express-oidc-vault/tsconfig.json --noEmit --module ESNext --moduleResolution Bundler` already failed on absent `@types/supertest`, invalid old `mode: 'discovery'` fixtures, optional-callback/strict diagnostics, and ES2018 test-library assumptions. The focused strict source/changed-test checks and installed declarations above are clean; this is not recorded as a passing all-existing-tests typecheck. The existing Vite native-config-loader warning remains non-fatal.
- **DBJWT-08 shared-declaration handoff (signatures only, provider behavior remains pending):** root-exported `OidcVaultRecordBindingMatch`, `ConsumeAuthorizationTransactionIfMatchesInput`, `ConsumeExchangeCodeIfMatchesInput`, `ReserveDpopProofInput`, `OidcVaultDpopReplayStore`, `OidcVaultSessionRevocationContext`, and `OidcVaultDeviceBindingStoreProvider`. Base `OidcVaultStoreProvider` has optional `getAuthorizationTransaction`, `consumeAuthorizationTransactionIfMatches`, `getExchangeCode`, `consumeExchangeCodeIfMatches`, `getSessionRevocationContext`, and `reserveDpopProof`; the stronger interface requires all six. Construction checks callable presence without invoking them or installing fallback state. Existing built-ins therefore need DBJWT-08's real methods/stronger return types before opt-in construction succeeds. DBJWT-08 also owns persisted validation/mapping, immutable rotation, guarded legacy consume refusal, exact/null atomic matching, replay expiry/capacity/error class, and conformance/live harnesses; no such operations were implemented here.
- **Internal contracts for subsequent backend agents:** `resolveDeviceBindingOptions` → `ResolvedOidcVaultDeviceBindingOptions | undefined`; `assertDeviceBindingStoreCapabilities`; `resolveDeviceBindingOrigin`; `isCanonicalDpopJkt`; `snapshotDpopBinding`; `assertDeviceBindingPolicy`; `resolveVerifiedDeviceBinding(policy, originalBinding, alreadyVerifiedProof)`; `withSessionDeviceBinding(session, originalSnapshot)`; `ResolvedOidcVaultOptions`; `withIssuedToken(req, res, resolvedOptions, session, verifiedBinding?)`; `createExchangeResponse`. They are source-internal, not package-root/public subpaths. Matching primitives do **not** verify JWT proofs, targets, nonces, or replay reservations. Bound issuer input is `{ type: 'dpop', jkt, alg }`; persisted session binding remains `{ type: 'dpop', jkt }`.
- **Remaining integration activation:** DBJWT-07/06 implement nonce/replay/proof checks and request-aware API types/enforcement; DBJWT-04 snapshots transaction binding/browser-cookie authority before hooks and propagates it through guarded callback/session/code creation; DBJWT-05 preflights mode/key/identity before any consume/upstream/rotation/hook/revocation work, rechecks atomically returned records/session agreement, and passes the verified original-key context to `withIssuedToken` (including no-local-issuer flows). Recognition metadata protection is activated with DBJWT-09. All **41 DBJWT-01 lifecycle/API TODOs** still require those full HTTP paths, so none was marked covered by policy/issuance primitives alone. No blocker remains for DBJWT-03; next task is **DBJWT-08**.

---

### Task DBJWT-04: Login transaction binding (prove initiating browser)

Status: completed

Assigned: isolated sequential DBJWT-04 agent (no nested agents).

Priority: P0

Suggested agent: backend auth engineer

Dependencies: DBJWT-02, DBJWT-03, DBJWT-08, DBJWT-07, DBJWT-06

Primary ownership:

- `packages/express-oidc-vault/src/index.ts` (`createLoginHandler`, `createCallbackHandler`)
- `packages/express-oidc-vault/src/types.ts` (`AuthorizationTransactionInput`, `ExchangeCodeRecordInput`)
- `packages/express-oidc-vault/src/cookies.ts` (approved transaction-cookie contract)

Finding:

`AuthorizationTransaction` stores `state/nonce/pkceVerifier/codeChallenge` with no browser-binding field. Callback consumes by `state` from query and immediately proceeds to provider token exchange + session creation. Exchange consumes a bearer code. This is the BOV-02 hole: whoever presents the callback URL/code first wins.

References:

- `packages/express-oidc-vault/src/index.ts:512-548,556-683`
- `packages/express-oidc-vault/src/types.ts:82-104`
- `packages/express-oidc-vault/test/bov-02-browser-binding.test.ts:241-380`

Implementation requirements:

1. Implement the DBJWT-02 login-initiation contract:
   - Associate the verified client-key thumbprint with the authorization transaction at POST initiation.
   - Propagate the binding to the exchange-code record at callback.
   - Verify the transaction-cookie hash and atomically consume its matching record **before** upstream token request/session creation. Headerless callback supplies no DPoP proof (D3).
   - Rotate, shorten, and clear the transaction cookie at the approved D3 lifecycle boundaries.
2. Implement `transactionCookie` and random HttpOnly browser-binding hash on transactions/codes exactly as D3; POST initiation and guarded exchange retain the approved Origin policy in both session transports.
3. Implement D1/D5 legacy matching: reject unbound transactions/codes in `required`, explicitly match absent fields in `optional`, and never enroll/rebind a legacy record from a later proof.
4. Preserve PKCE/state/nonce semantics; do not weaken them.
5. Add transaction-cookie attributes/expiry/duplicate-cookie assertions for the approved D3 policy.

Acceptance criteria:

- Transferred attacker callback URL completed by victim fails before session creation for bound flows.
- Honest same-browser POST login → callback creates an exchange code carrying the initiating binding/hash and correct cookie deadline in both transports.
- Regression tests mirror BOV-02 callback-transfer scenarios and cover D3 initiation/cookie/pre-provider matching.

Integration activation: DBJWT-05 owns stolen-code/guarded form exchange rejection, honest login → callback → exchange, and no-spend retry assertions using the records/cookies produced here and DBJWT-08 atomicity. This preserves the original end-to-end criteria without an implicit DBJWT-04↔05 completion dependency.

Completion evidence (2026-10-02, isolated sequential DBJWT-04 agent; no nested agents):

- Read the full approved plan, including unchanged D1–D8 section 8 and DBJWT-03/08/07/06 completion handoffs; root `AGENTS.md` (only applicable instructions), core handlers/policy/proof/replay/nonce/cookie/origin/issuance/errors/lifetime/config, relevant memory/Redis/Mongo record/read/consume mappings, legacy/BOV/scaffold/packed tests, package metadata/build settings, emitted declarations and shipped README. Loaded `task-as-you-go` and `ai-friendly-ts-package`. All dependencies were completed before this task; no nested/delegated agent was created.
- **Changed paths (DBJWT-04 only; 16 workspace files):**
  - `packages/express-oidc-vault/src/index.ts`: opt-in JSON POST initiation, required GET pre-provider rejection, cookie-authenticated headerless callback, identity/policy/deadline and atomic-return preflight, immutable original session/code authority, authenticated terminal cookie cleanup and retained/shortened successful cookie. Source/error observers keep sanitized response authority and no-store. Existing exchange/refresh/logout behavior is still the DBJWT-05 integration boundary.
  - `packages/express-oidc-vault/src/types.ts`: root-exported `OidcVaultTransactionCookieOptions`, `OidcVaultLoginInitiationInput`, `OidcVaultLoginInitiationResult`, `OidcVaultOptions.transactionCookie`, and shipped cookie/DTO/hook/transaction-provider JSDoc. Existing thumbprint/hash record signatures and stronger store methods are reused.
  - New internal `packages/express-oidc-vault/src/transaction-cookie.ts`, `src/vault-route-proof.ts`, `src/authorization-transaction.ts`: immutable resolved cookie settings, bounded selected-cookie authentication/exact-null record matches and deadlines; captured route proofs composed with the existing shared verifier/target/nonce/replay policies; invocation-owned transaction identity/security snapshots and atomic-return checks. No new public helper/subpath or duplicate proof algorithm/normalization was introduced.
  - `packages/express-oidc-vault/src/cookies.ts`: shared exact header-safe cookie-name predicate; existing session-cookie first-wins parsing remains separate. `src/origins.ts`: login/guarded-exchange source guard for both transports, raw Origin/Referer ambiguity rejection, existing refresh/logout policy retained. `src/device-binding-policy.ts`: resolved transaction-cookie type and original binding restoration that skips hook-replaced security getters.
  - New `packages/express-oidc-vault/test/dpop-login-callback.test.ts`: **202 passing** real HTTP/provider/memory-store tests across body/cookie, optional/required, legacy/guarded/bound and fail-closed disabled modes; full initiation/callback scope only.
  - `packages/express-oidc-vault/test/dpop-device-bound.regression.test.ts`: original **8 legacy/anti-enrollment passes retained**. Replaced the two transferred-callback TODO executions with exact active named-test links in the new suite; required legacy transaction and both honest initiation/callback halves are also linked as active HTTP regressions. Narrowed remaining composite required-mode TODOs to codes/sessions and assigned lifecycle/stolen-code/form/replay TODOs to DBJWT-05. **28 lifecycle TODOs remain**; no full bound lifecycle is claimed complete.
  - `packages/express-oidc-vault/test-packed-consumer/consumer/{consumer-types.ts,consumer-types.cts,consumer.mjs,consumer.cjs}`: root-only positive/negative cookie/DTO declarations and validated JSON fetch snippets; real installed ESM POST proof/admission/cookie/error-callback/replay checks and CJS cookie validation. Original runtime root-export checks retained.
  - `packages/express-oidc-vault/README.md`: accurate as-built POST/callback config/DTO/Origin/cookie/nonce/record/hook/error contracts and packed-checked snippets; explicitly states that guarded exchange/refresh/logout and the complete credential lifecycle remain DBJWT-05. Final browser/website parity remains DBJWT-10/11.
  - This task file: DBJWT-04 completion/evidence/handoff and execution footer; section 8's approved contract unchanged.
- **Acceptance/runtime evidence:**
  - Exact `POST <basePath>/login` accepts `application/json` and body-only `returnTo`, returns only `200 { authorizationUrl }`, and never selects a key from body/query fields. Origin/valid Referer fallback is enforced in both transports before proof/state work; missing/null/untrusted/duplicate source headers and non-JSON (including many-parameter urlencoded) bodies reject before reservation/discovery/hooks/allocation. Required GET rejects before all provider/transaction work; optional GET stays the unbound redirect and ignores invalid proof/key shortcuts.
  - Real ES256 signature, pinned method/public URL, normal signed iat, nonce and shared replay admission precede provider discovery/transaction allocation. Barrier-held reservation proves no early provider/hook/write work. Four concurrent requests across two independently constructed instances sharing one real memory provider produce **1 success / 3 invalid-proof failures**; replay leaves the winner's transaction/cookie unchanged and a fresh proof succeeds. Reservations survive downstream discovery failure. Existing shared nonce instances challenge before allocation and accept older live parallel challenges; wrong target cannot cause a nonce, expired/wrong-key nonce challenges allocate no transaction. Actual capacity/provider admission errors return fixed 503 with private original `cause`.
  - Every successful POST generates one fresh 32-byte random canonical base64url cookie secret, stores only SHA-256(secret) and the original verified `{ type: 'dpop', jkt }`, and sets the cookie after successful persistence/hooks. HTTPS/default `__Host-`, HTTP development, explicit HTTPS None/custom names, host-only/Path=/HttpOnly/Secure, prefix/collision/security-optout rejection, getter/frozen/reused snapshots and floor-rounded deadlines pass. Selected parser scans linearly with constant extra space and allocates only a bounded selected value; duplicate selected names across one/two raw Cookie fields, valueless/malformed/percent/quoted/noncanonical values fail. Unrelated malformed cookies never block an honest callback; session-cookie policy is separate. Reinitiation rotates the sole cookie, leaves earlier mismatch records available, and allocates no per-state cookie collection.
  - Transferred attacker callback URLs (victim has its own distinct cookie/key), missing/wrong/duplicate cookies, required legacy transactions and disabled-mode bound records fail without consume, upstream calls, session/code/rotation/revocation or cookie clear; honest original-browser retries succeed. Callback preflights exact resolved issuer/client evidence in `transaction.metadata.oidcVaultTransactionProvider`, cookie and mode, then uses the existing atomic exact/null match-and-consume and rechecks returned nonce/PKCE/state/destination/deadline/provider/binding before upstream work. Concurrent callbacks have one winner; replacement races yield no upstream/session/code credentials. No callback proof/nonce/reservation is invented.
  - Authenticated provider-error callbacks consume matching state and clear only the transaction cookie, emit fixed `400 OIDC_VAULT_CALLBACK_ERROR` / `OIDC callback failed.`, and privately report the original provider error. Unauthenticated error callbacks do not spend/clear. Wrong upstream nonce, precreate veto and code-persistence failure are authenticated terminal failures; PKCE/OIDC nonce/provider/UserInfo validation remains intact. Code-write failure revokes the captured original fresh lineage.
  - Successful callback persists initiating jkt in the session and original key/hash in the code, retains the same cookie and shortens its deadline to the exchange record, including hook delays. Precreate removal/rebind/nested/getter/ID/provider mutations and postcommit request/session/deadline mutations cannot change this original authority. Application metadata mutation is retained; postcommit notification errors do not undo committed binding/code/cookie. No session cookie is minted at callback in either transport.
- **Commands/results** (all core package prebuilds/builds/tests strictly serialized; repository root unless stated):
  - Baseline: `pnpm --filter @web-ts-toolkit/express-oidc-vault... build` → exit 0; CJS/ESM and both declarations. `pnpm --filter @web-ts-toolkit/express-oidc-vault test` → exit 0, **32 files / 1102 passed / 30 TODO (1132 collected)**, 20.44s.
  - Before production implementation, package directory: `pnpm exec vitest run --config ../../vitest.config.ts test/dpop-login-callback.test.ts` → **64 intended failures / 2 optional legacy controls passed (66)**. Existing code had no POST login and accepted required GET/unbound callback before policy checks.
  - Final focused, package directory: `pnpm exec vitest run --config ../../vitest.config.ts test/dpop-login-callback.test.ts test/dpop-device-bound.regression.test.ts test/dpop-device-binding-policy.test.ts test/dpop-token-issuance.test.ts test/dpop-api.test.ts test/dpop-proof.test.ts test/dpop-replay.test.ts test/dpop-nonce.test.ts test/bov-02-browser-binding.test.ts test/bov-08-cookie-secure.test.ts test/bov-09-session-cookie-isolation.test.ts test/bov-10-route-prerequisites.test.ts test/bov-15-options-snapshot.test.ts test/ovh-03-session-lifetime.test.ts test/bov-11-doc-examples.test.ts` → exit 0, **15 files / 905 passed / 28 TODO (933 collected)**, 17.25s. Historical BOV assertions remain unchanged.
  - Final required build: `pnpm --filter @web-ts-toolkit/express-oidc-vault... build` → exit 0; CJS **129.83 KB**, ESM **126.90 KB**, `index.d.ts` / `index.d.mts` **48.85 KB each**. Both declaration reads confirmed new root types and surviving JSDoc; runtime exports/root-only metadata unchanged.
  - Final focused packed, package directory: `pnpm exec vitest run --config ../../vitest.config.ts test/packed-consumer.test.ts` → exit 0, **1 file / 3 passed**, 12.33s. Real publish transform, exact staged **7-file** `npm pack --dry-run --json`, actual installed CJS/ESM runtime and strict `skipLibCheck: false` NodeNext ESM/NodeNext CJS/Bundler consumers plus declaration-resolution traces passed.
  - Final full core: `pnpm --filter @web-ts-toolkit/express-oidc-vault test` → exit 0, **33 files / 1304 passed / 28 TODO (1332 collected)**, 28.37s; **202 new passing tests** above baseline, all existing BOV/legacy and three packed checks pass. Its prebuild again produced both JS/declaration conditions serially.
  - Focused lint over the **14 changed source/test/packed-consumer paths** listed above → `pnpm exec eslint <paths>` exit 0, no errors/warnings. Focused strict source/helpers: `pnpm exec tsc --ignoreConfig --noEmit --module ESNext --moduleResolution Bundler --target ES2022 --strict --skipLibCheck false --types node <source root/three internal helper paths>` → exit 0. Final strict changed graph: `pnpm exec tsc -p <repo-root>/_tmp/dbjwt-04-typecheck/tsconfig.json` → exit 0, **7 entry files** (root/three new internal helpers/new HTTP test/scaffold/packed harness), transitive source/memory graph, ES2022/Bundler/strict/`skipLibCheck: false`. External config reuses DBJWT-03's already installed real `@types/supertest`; no dependency/lock changes. This is not a claim of a clean whole pre-existing legacy test typecheck (earlier baseline limitations remain).
  - `git diff --check` and individual `git diff --no-index --check /dev/null <path>` for **three new helpers, new HTTP test, original scaffold and this task file** → exit 0. `git diff --exit-code HEAD -- CHANGELOG.md packages/express-oidc-vault/src/provider-client.ts packages/express-oidc-vault/package.json packages/express-oidc-vault/tsup.config.ts pnpm-lock.yaml` → exit 0. No store implementation/conformance, API verifier/algorithm/replay implementation, unrelated access-router/task/website, CHANGELOG or commit edits were made in DBJWT-04.
- Verification corrections: initial focused lint found unused imports/destructure fields (corrected). Expanded race fixtures initially captured Vitest's absent `getMockImplementation()` instead of the actual provider method and got 503/500; capturing the real bound methods before spying fixed the fixture and the unchanged security assertions pass. Express 5's read-only query getter interrupted a postcommit mutation fixture before its clock delay; replaced it with an explicit own-property mutation. First packed run was **2 passed / 1 failed** because current strict NodeNext `response.json()` returns `unknown`; both packed snippets and README now validate the DTO shape. Final review bounded selected-cookie allocations, captured session-cookie getters once for collision/serialization parity, rejected trailing CR/LF cookie names and preserved disabled no-transaction historical session names; final focused/build/packed/full/lint/strict checks above passed after those changes. No failing acceptance test was skipped or relaxed.
- **Exact internal DBJWT-05 handoff (source imports only):**
  - `src/vault-route-proof.ts`: `captureVaultRouteProof(req)` → frozen `{ header: DpopRawHeader, method, originalUrl }`; `createVaultRouteProofVerifier(resolvedOptions, config, backendOrigin, basePath)` → one frozen verifier or undefined; `initiate(captured)` is new-login selection only; **`verify(captured, originalStoredBinding)`** composes the existing shared signature/target/time/nonce/replay policies and `resolveVerifiedDeviceBinding` (optional legacy stays unbound). Capture proof/method/path before store/preflight async work; authenticate original identity/cookie/session/code/recognition agreement before invoking verify. No access-token/ath requirement on vault POSTs. All vault routes use the same `['vault', normalized origin/basePath, exact issuer/clientId]` replay space; no code/session/route/instance partition or reservation release. Instantiate once in `registerRoutes` and pass this existing verifier to DBJWT-05 handlers. `toVaultRouteErrorResponse` / `sendVaultRoutePolicyResponse` preserve original private errors, fixed 400 nonce/401 proof/503 unavailable responses and no-store; nonce class internally carries the already-sanitized bounded server-issued header.
  - `src/transaction-cookie.ts`: `ResolvedOidcVaultTransactionCookieOptions`, `resolveTransactionCookieOptions`, `parseTransactionCookie`, `createTransactionBrowserBinding`, `snapshotRecordBindingMatch`, `recordBindingMatches`, **`authenticateTransactionCookie(capturedCookieHeader, resolvedCookie, originalMatch)`** → original secret only for guarded records (null/null legacy returns undefined), `setTransactionCookie`, **`clearTransactionCookie`**. Resolved options always contain the private frozen transaction-cookie config. Snapshot both binding fields into mandatory exact/null match before any mutable work; use original secret/match/deadline only. Wrong/missing cookie throws fixed invalid-browser-binding with no spending/clearing. DBJWT-05 owns successful exchange clearing and authenticated terminal exchange cleanup.
  - `src/authorization-transaction.ts`: `createTransactionProviderMetadata` stores portable private `{ oidcVaultTransactionProvider: { issuer, clientId } }`; snapshot/identity/atomic-return helpers preserve original state/nonce/PKCE/destination/deadline/match. Every new POST callback creates session binding `{ type: 'dpop', jkt }` and code `{ deviceBinding?, browserBindingHash, sessionId, expiresAt }` with no stored proof JWK/algorithm/mode/secret. Legacy GET code has neither binding field; optional POST without proof has only hash. Successful callback retains the original selected cookie to the exchange-code deadline; it does not issue a local token or session cookie.
- **Remaining integration activation / concerns:** DBJWT-05 is next and must implement actual guarded exchange (Origin in both transports, cookie + original-key proof, exact/null atomic consume with expectedSessionId, original returned session/code agreement, verified issuer context, cookie clearing), refresh pre-upstream proof, logout live/alias proof and immutable rotations. Current exchange still calls the legacy consume and built-ins refuse guarded records without spending; refresh/logout have not been converted to guarded proof paths. The **28 remaining DBJWT-01 TODOs** still require DBJWT-05's full HTTP lifecycle/no-mutation/stolen-code/form/cross-instance checks; initiation/callback half coverage does not satisfy them. Fingerprint-only registration/capture remains DBJWT-09; actual browser redirect/cookie/CORS/key persistence and final website/package parity remain DBJWT-10/11/12. Runtime replay sharing here is one real memory-store object; unchanged live Redis/Mongo provider evidence remains DBJWT-08, not a new live-provider claim. Existing Vite native-config-loader warning is non-fatal; no DBJWT-04 blocker remains. Continue **DBJWT-05 → DBJWT-09 → DBJWT-10 → DBJWT-11 → DBJWT-12**.

---

### Task DBJWT-05: Exchange + refresh key enforcement (no first-presenter claim)

Status: completed

Assigned: isolated sequential DBJWT-05 agent (no nested agents).

Priority: P0

Suggested agent: backend auth engineer

Dependencies: DBJWT-02, DBJWT-03, DBJWT-08, DBJWT-07, DBJWT-06, DBJWT-04

Primary ownership:

- `packages/express-oidc-vault/src/index.ts` (`createExchangeHandler`, `createRefreshHandler`, `createLogoutHandler`)
- `packages/express-oidc-vault/src/token-validation.ts` (reuse the shared proof verification helper from DBJWT-06; replay/nonce policy from DBJWT-07)

Finding:

Exchange looks up the session by code then checks provider identity, but has no key check. Refresh rotates the session after upstream token use, with no key check before contacting the provider. Accepting “whichever key arrives first” at exchange would let the attacker claim the session.

References:

- `packages/express-oidc-vault/src/index.ts:685-850`
- `packages/express-oidc-vault/src/types.ts:33-80` (`OidcVaultSession`)

Implementation requirements:

1. Require a valid DPoP proof on exchange/refresh for bound sessions, using the **same key bound at login** (no silent re-binding to a new key).
2. Verify exchange proof **before code consumption semantics allow theft**: implement atomic match-binding-and-consume (see DBJWT-08). At minimum, mismatched-key attempts must not yield a usable session and must not leave the code redeemable by the attacker.
3. Verify refresh proof **before** upstream `requestToken` (avoid burning single-use upstream refresh tokens on unauthenticated calls; cf. BOV-03 family-kill risk).
4. Preserve `expiresAt`, `logicalSessionId`, subject continuity, and refresh profile precedence (BOV-07) across bound rotations.
5. Keep `assertSessionIdentity` (issuer/client) checks; key binding is additive, not a replacement.
6. Implement the approved D4 logout proof policy for live handles and unexpired aliases using D5's `getSessionRevocationContext`; preserve unbound compatibility and reject bound-alias downgrade when binding is disabled.

Acceptance criteria:

- Wrong-key exchange/refresh → sanitized 4xx/401, no rotation, no upstream refresh burn (assert via provider fixture call counts where feasible).
- Missing proof on bound session → rejected; missing proof on unbound session in `optional` mode → allowed.
- Refresh preserves binding; rotated session still requires the original key.
- Both transports covered; cookie-transport CSRF (`Origin`/`Referer`) checks preserved.
- Activate DBJWT-04's exchange integration criteria: stolen victim code and cross-origin urlencoded exchange without cookie/key proof fail without spending live records; honest same-browser login → callback → exchange passes in both transports.

Execution baseline (2026-10-02): dependencies DBJWT-03/08/07/06/04 are completed; read their handoffs and the full frozen D1–D8 contract. Serial root build `pnpm --filter @web-ts-toolkit/express-oidc-vault... build` passed; serial core test `pnpm --filter @web-ts-toolkit/express-oidc-vault test` passed **33 files / 1304 tests / 28 TODO (1332 collected)**, 30.54s. DBJWT-05 owns activating those 28 lifecycle scenarios. Fingerprint recognition/precommit integration remains DBJWT-09.

Completion evidence (2026-10-02, isolated sequential DBJWT-05 agent; no nested agents):

- Read the full plan/frozen approved section 8 D1–D8, DBJWT-03/08/07/06/04 handoffs, root `AGENTS.md` (only applicable instructions), handlers/policy/issuance/cookie/transaction/proof/target/nonce/replay/lifetime/config/provider helpers, provider fixtures and relevant memory/store/BOV/scaffold/packed tests. Loaded `task-as-you-go` and `ai-friendly-ts-package`. Implementation is limited to DBJWT-05; fingerprint recognition remains DBJWT-09.
- **Changed paths (DBJWT-05 only; 12 workspace files):**
  - `packages/express-oidc-vault/src/index.ts`: one existing captured shared vault verifier wired to exchange/refresh/logout; immutable code/session/provider/cookie/source preflight, guarded exact/null consume and returned-record/session checks, original-key issuer context, proof-before-upstream refresh, immutable rotation/result authority, live/alias context-authenticated logout and original-lineage deletion, no-target idempotency, successful/authenticated-terminal exchange cookie cleanup, defensive no-store. Fingerprint precommit insertion points are named in exchange/refresh; no fingerprint implementation added.
  - New internal `packages/express-oidc-vault/src/vault-session.ts`: invocation-owned validated session/code/revocation snapshots, exact identity/generation/returned-authority comparisons and iterative portable plain-data copying. Original profile/metadata containers remain private across issuer/hook/store inputs; opaque native metadata retains existing provider-specific semantics. No new public runtime export/subpath.
  - `packages/express-oidc-vault/src/origins.ts`: captured source guard for async guarded exchange preflight, using DBJWT-04's existing raw Origin/Referer policy in both transports; existing cookie refresh/logout guard preserved.
  - `packages/express-oidc-vault/src/token-issuance.ts`: reuse owned plain session copying so nested issuer/profile/metadata mutations cannot change original response or rollback authority; existing exact output validation/rollback retained.
  - `packages/express-oidc-vault/src/types.ts`: shipped JSDoc for implemented original-key vault policy, issuer/hook ownership, guarded exchange/cookie/Origin and live/alias logout/no-target semantics; frozen public signatures unchanged.
  - New `packages/express-oidc-vault/test/dpop-vault-session.test.ts`: **402 passing** real HTTP/crypto/provider/memory-store regressions; isolated cookie jars, separate upstream RSA and local HS256 keys, actual ES256 proofs and request-aware JWT API, single-use upstream refresh-token tracking, counted provider requests and real guarded consumption/replay/rotation methods.
  - `packages/express-oidc-vault/test/dpop-device-bound.regression.test.ts`: retained all original **8** active no-config legacy/anti-enrollment controls; converted the remaining **28** lifecycle scaffold scenarios to exact active named HTTP regression references above, following DBJWT-04/06's reference pattern. All intended matrix coverage is retained; **zero core TODO/skip/only registrations** remain.
  - `packages/express-oidc-vault/test-packed-consumer/consumer/{consumer-types.ts,consumer-types.cts,consumer.mjs}`: strict root-only exchange wire/result snippets and actual installed ESM body/cookie guarded exchange → refresh → alias logout, missing/wrong proof/cookie, no-upstream-burn call counts, verified original context and immutable lineage/expiry. Existing root-export/API/initiation/CJS checks remain.
  - `packages/express-oidc-vault/README.md`: implemented backend sender-constraint/DTO/temporary-cookie/Origin/nonce/replay/issuer/hook/alias/legacy contract and packed-checked exchange snippet; removed obsolete DBJWT-05 pending claims. Fingerprint, persistent-browser example and final website parity remain their later owners.
  - This task file: completion/evidence/precise next-owner handoff; unchanged approved D1–D8.
- **Acceptance/runtime evidence:**
  - Optional/required honest browser login → callback → exchange → refresh → request-aware API and logout pass in **both** transports. Local issuer receives frozen `{ type: 'dpop', jkt: originalKey, alg: 'ES256' }`, local HS256 JWT emits matching `cnf.jkt`/exact `DPoP`; mapClaims deliberately omits cnf yet API rejects copied/no-proof/wrong-key/Bearer presentations. No-local-issuer exchange/refresh still require proof and emit no token fields.
  - Guarded **JSON and URL-encoded** exchange preflights captured Origin/Referer in both transports, original temporary cookie, exact code/session agreement, immutable provider identity and original stored key before shared proof/nonce/replay. Missing/wrong/malformed/duplicate cookie, wrong/missing/stale/invalid/duplicate proof, source/identity/downgrade mismatch preserve live honest code/session/cookie with no upstream/hooks/issuance/rotation/revocation; honest fresh retries succeed. Wrong-browser callback followed by stolen-code attempts cannot force-login/claim/rebind. Optional cookie-only POST stays cookie guarded; legacy unbound optional proof validates/reserves without enrollment. Required legacy/cookie-only use rejects before state/upstream; disabled bound code/session/live/alias logout rejects.
  - Atomic exchange calls use **`{ code, expectedSessionId, match: { deviceBinding, browserBindingHash } }`**, never a guarded get/unconditional-delete fallback. Session-ID/key/hash replacement returns no credentials and retains the replacement; returned destination/deadline/provider/session-generation changes fail before issuance. Two different honest proofs for one code have one atomic consumer/issuer; loser sets no cookie. Two independently constructed instances sharing one real memory provider use **different live codes/sessions** for sequential/concurrent duplicate proofs: one winner, loser preserves target and upstream refresh token, fresh proof recovers. Re-signed same key/JTI across exchange/refresh/logout is shared replay, not route/target partitioned.
  - Nonce challenge follows identity/cookie/signature/target/key/time validation and precedes reservation/consume/upstream/hooks/rotation/revocation on exchange/refresh/logout/live aliases and optional unbound supplied-proof requests. Older live parallel challenges work across instances; expired nonces rechallenge before mutation. Wrong cookie/key/target/identity cannot trigger a nonce. Barrier-held admission proves no premature work; provider/capacity failures are fixed **503**, private original cause and no-store. Reservations survive discovery failure and hook veto; same-proof retry rejects. Browser proofs are never forwarded upstream; vault POSTs accept no-Authorization/no-ath proofs, including refresh after local JWT/retained ID expiry.
  - Refresh snapshots the original handle/credentials/lineage/provider/subject/key/deadline before async work, rechecks its generation immediately after discovery and before upstream credential use, rotates the original binding and rechecks returned authority before issuance. Fresh-ID/UserInfo/retained-profile/removed-claim precedence remains BOV-07 compatible. Issuer, precreate/postcreate, refresh/logout hook, adapter-owned record and return/input mutations cannot change original security/response/profile/rollback authority; invalid issuer output rolls back the captured original lineage and clears cookie transport plus the authenticated exchange temporary cookie. Source/returned-authority mismatches produce sanitized failure with no issuance. Existing BOV suites/default behavior are intact.
  - Built-ins always use **`getSessionRevocationContext`** for live handles and unexpired aliases, including binding-disabled mode. Wrong/stale/missing/replayed proof or foreign provider context leaves live lineage/cookie unchanged; authenticated original key deletes only the captured target lineage. Mixed lineage/provider authority fails privately/sanitized without deletion. Expired alias/missing target is idempotent success without deletion/reservation/hooks. Aliases never authenticate refresh or yield upstream logout credentials. Live precommit veto retains state/cookie and replay reservation; redirect uses captured original ID token and remains local-before-upstream. Signed backchannel logout revokes bound required-mode sessions without a browser proof.
- **Commands/results** (every build/package-test prebuild issued strictly serially; repository root unless stated):
  - Baseline build/core results above. Before implementation, package directory `pnpm exec vitest run --config ../../vitest.config.ts test/dpop-vault-session.test.ts` → **40 intended failures / 4 optional legacy controls passed (44)**, 3.42s: old exchange refused guarded codes and refresh used upstream/rotated before required/proof enforcement; logout accepted without proof.
  - Final focused, package directory: `pnpm exec vitest run --config ../../vitest.config.ts test/dpop-vault-session.test.ts test/dpop-device-bound.regression.test.ts test/dpop-login-callback.test.ts test/dpop-device-binding-policy.test.ts test/dpop-token-issuance.test.ts test/dpop-api.test.ts test/dpop-proof.test.ts test/dpop-jwt-confirmation.test.ts test/dpop-replay.test.ts test/dpop-nonce.test.ts test/bov-02-browser-binding.test.ts test/bov-03-concurrent-refresh.test.ts test/bov-07-refresh-profile.test.ts test/bov-08-cookie-secure.test.ts test/bov-09-session-cookie-isolation.test.ts test/bov-10-route-prerequisites.test.ts test/bov-11-doc-examples.test.ts test/bov-15-options-snapshot.test.ts test/ovh-03-session-lifetime.test.ts test/ovh-04-session-identity.test.ts test/ovh-05-token-response.test.ts` → exit 0, **21 files / 1412 passed / zero TODO/skip**, 43.79s.
  - Final build `pnpm --filter @web-ts-toolkit/express-oidc-vault... build` → exit 0; CJS **141.97 KB**, ESM **139.04 KB**, `index.d.ts`/`index.d.mts` **50.26 KB each**. Reads verified surviving root JSDoc and no internal helper/subpath exports. Rebuilt once after the final JSDoc whitespace-only correction; runtime output/behavior is unchanged.
  - Final focused packed, package directory `pnpm exec vitest run --config ../../vitest.config.ts test/packed-consumer.test.ts` → exit 0, **1 file / 3 passed**, 12.45s (12.78s before the final JSDoc-only rebuild): real publish manifest transformation, exact staged **7-file** `npm pack --dry-run --json`, installed CJS/ESM and strict `skipLibCheck: false` NodeNext ESM/NodeNext CJS/Bundler with both declaration traces; installed ESM new guarded lifecycle runs for both transports.
  - Final full core `pnpm --filter @web-ts-toolkit/express-oidc-vault test` → exit 0, **34 files / 1706 passed / zero TODO/skip**, 47.28s; **402 new passing tests** above the 1304 baseline, all existing BOV/legacy and three packed checks pass. Its serialized prebuild again produced both JS/declaration conditions. Original 28 pending registrations are active named references rather than inflating passing test counts.
  - Final lint `pnpm exec eslint <the 10 changed source/runtime-test/packed-consumer paths listed above>` → exit 0, no errors/warnings. Strict changed graph `pnpm exec tsc -p <repo-root>/_tmp/dbjwt-05-typecheck/tsconfig.json` → exit 0, **7 entries** (root/new helper/origins/issuance/new HTTP suite/scaffold/packed harness) and transitive core/memory graph, ES2022/Bundler/strict/`skipLibCheck: false`, using DBJWT-03's already installed external real `@types/supertest`; no dependency/lockfile edits. Both checks reran serially after the final declaration rebuild/packed run and passed; earlier direct strict four-source graph also passed.
  - `git diff --check` and individual `git diff --no-index --check /dev/null <path>` for new helper/new HTTP suite/untracked issuance/scaffold/task paths → exit 0. `git diff --exit-code HEAD -- CHANGELOG.md packages/express-oidc-vault/src/provider-client.ts packages/express-oidc-vault/package.json packages/express-oidc-vault/tsup.config.ts pnpm-lock.yaml` → exit 0. No CHANGELOG, provider implementation, BOV assertions, unrelated user access-router/task/website or commit edits.
- Verification corrections: initial focused lint found one unused fixture type (removed); strict type inference found a heterogeneous missing-proof closure (explicit `undefined` return added). Final review moved refresh generation recheck after awaited discovery, made privately composed profile/metadata authoritative after verifying rotation's returned security, checked source timestamps, and added real form/JSON live/alias logout and one-code/two-proof atomic winner coverage; full final focused/build/packed/core/lint/strict sequence above passed after these runtime corrections. No failing test was skipped or relaxed.
- **DBJWT-09 fingerprint precommit handoff (no fingerprint code implemented):**
  - Capture its configured single raw header alongside `captureVaultRouteProof`/selected cookie/body handle at the **start** of POST login/exchange/refresh, before async store/provider/hook work. Reuse source-internal `src/vault-session.ts` helpers: `snapshotVaultSession`, `snapshotVaultExchangeCode` (+ mandatory `.match`), `snapshotVaultRevocationContext`, `assertVaultSessionIdentity`, `assertVaultExchangeSessionBinding`, `assertVaultSessionMatches`, `assertVaultExchangeCodeMatches`, `assertVaultRevocationContextMatches`, `copyVaultSession`.
  - Named insertion in `createExchangeHandler`: after original session/code/provider/mode/cookie authentication, **before** `proofVerifier.verify` and `consumeExchangeCodeIfMatches`; compare against **original snapshot** metadata, never returned/mutable/mapper fields. In refresh: after original identity/policy snapshot, **before** proof/replay/discovery/upstream request. Preserve reserved recognition metadata through guarded callback precreate restoration and subsequent copies/rotation/issuer/hook boundaries; generic application metadata remains portable/mutable. Recheck recognition agreement if DBJWT-09's session-generation semantics need it; do not enroll at exchange/refresh or reuse postcommit `onSessionRefreshed` for enforcement.
  - Existing `createVaultRouteProofVerifier(...).verify(capturedRequest, originalStoredBinding)` remains the sole proof/nonce/shared replay composition, instantiated once per mount and shared across vault routes. Fingerprint-only POST registration/capability checks/DPoP-header rejection remain DBJWT-09, following D3/D6; do not weaken original-key or required-mode checks.
- **DBJWT-10 frontend/wire handoff:** login/exchange always use credentials for the single temporary transaction cookie; callback is headerless; exchange `{ code }` with fresh original-key proof + trusted browser source; refresh/logout body `{ sessionId }` or cookie `{}` with fresh original-key proofs and no access-token/ath. JWT API uses `Authorization: DPoP <token>` plus fresh proof/ath. Token result is exact `DPoP` + matching cnf when a local issuer exists; otherwise no token fields. Vault nonce is fixed 400/header, API 401/header; cache by protection space/key and retry once with new JTI/iat/signature. Wrong proof/cookie never consumes honest state; admitted downstream failures retain proof reservation. Preserve single-flight/cross-tab/cookie response coordination as D8 requires.
- **Residual limits / independent follow-ups:** DBJWT-09 recognition, DBJWT-10 real-browser persistent-key/redirect/CORS/third-party-cookie checks, DBJWT-11 website/full-repository/artifact parity and DBJWT-12 independent review remain pending. Existing BOV-03-FU1 refresh lease/FU2 cookie-ordering risks remain: different honest fresh proofs can race a single-use upstream family and late stale cookie clears, and stateless JWTs survive logout until expiry. Default unbound GET browser/code exposure and legacy custom-store/no-config identity-ordering limits remain documented. Store preflight reads are not leases or upstream transactions; application ID upserts are outside core fresh-ID guarantees. This task's replay sharing is one real memory object; unchanged Redis/Mongo live evidence belongs to DBJWT-08, not a new live-provider claim. Provider performance/topology/native-metadata limitations, old whole-legacy-test-graph typecheck limitations and non-fatal Vite native-config warning remain their existing handoffs. **No new independent finding/blocker** was confirmed in DBJWT-05. Next task: **DBJWT-09**, then 10/11/12 in frozen order.

---

### Task DBJWT-06: API proof verification (`Authorization: DPoP` + `DPoP` header)

Status: completed

Assigned: isolated sequential DBJWT-06 agent (no nested agents).

Priority: P0

Suggested agent: backend auth engineer

Dependencies: DBJWT-02, DBJWT-03, DBJWT-08, DBJWT-07

Primary ownership:

- `packages/express-oidc-vault/src/access-token-middleware.ts`
- `packages/express-oidc-vault/src/token-validation.ts`
- `packages/express-oidc-vault/test/bov-14-*.test.ts` (existing bearer-context coverage; extend, do not weaken)

Finding:

`extractBearerToken` only accepts `Bearer`; validator receives only the token string, so request-bound checks (`htm/htu/ath/nonce`) are impossible. `WWW-Authenticate` is hardcoded to `Bearer`.

References:

- `packages/express-oidc-vault/src/access-token-middleware.ts:11-32,44-114`
- `packages/express-oidc-vault/src/token-validation.ts:36-50,244-259`
- `packages/express-oidc-vault/src/types.ts:317-373`

Implementation requirements:

1. Accept `Authorization: DPoP <token>` alongside `Bearer` (per mode/policy). Keep `Bearer` for unbound tokens.
2. Require and verify a single well-formed `DPoP` proof JWT per RFC 9449 §4.3:
   - `typ: dpop+jwt`, allowed asymmetric alg, public-only JWK, valid signature;
   - `htm` matches request method;
   - `htu` matches normalized public request URL without query/fragment using D1's configured `publicOrigin`/`publicPathPrefix`, never request Host/forwarded origin;
   - `iat` within `proofMaxAgeSeconds` + `clockSkewSeconds`;
   - `ath` = base64url(SHA-256(access token));
   - `cnf.jkt` (access token) == thumbprint(public JWK in proof);
   - optional server nonce (`DPoP-Nonce`) challenge/response with bounded retry guidance;
   - replay rejection via DBJWT-08 reservation.
3. Implement D1's exact `validateWithRequest`/mandatory request-aware `confirmation` interfaces; preserve legacy `validate(token)` invocation when binding is disabled.
4. Ensure `mapClaims` cannot strip the binding requirement: verified `cnf`/binding context must survive independently of custom claim mapping.
5. Emit `WWW-Authenticate: DPoP` challenges appropriately (including `invalid_dpop_proof` / `use_dpop_nonce` semantics); preserve sanitized 401 shape and `onError` observability.
6. Document that **every** API accepting these JWTs must use this middleware; a signature-only JWT verifier remains bearer-equivalent.

Acceptance criteria:

- Copied JWT without private key is unusable: wrong key/signature/method/URL/token-hash/expired proof → 401.
- Fresh proof required per request; replayed proof → 401 even with valid JWT.
- Custom `mapClaims` cannot bypass binding.
- Existing bearer tests still pass; new DPoP matrix passes.

Completion evidence (2026-10-02, isolated sequential DBJWT-06 agent; no nested agents):

- Read this entire approved task file (including D1–D8 and DBJWT-03/08/07 evidence/handoff), root `AGENTS.md` (the only applicable instructions), public types/exports, middleware/JWT/policy/replay/nonce helpers, relevant legacy/BOV/scaffold/packed tests, package metadata/build config and shipped README. Loaded `task-as-you-go` and `ai-friendly-ts-package`. Dependencies were completed before this task; the approved section 8 contract is unchanged.
- **Changed paths (DBJWT-06 only, 17 workspace files):**
  - `packages/express-oidc-vault/src/types.ts`: exact D1 API options/request/confirmation/stronger-validator interfaces, optional base extensions, readonly authenticated proof context and shipped JSDoc.
  - `packages/express-oidc-vault/src/access-token-middleware.ts`: opt-in request-aware construction, raw single Bearer/DPoP credential/proof extraction, original-confirmation/scheme/mode enforcement, pinned targets, shared verifier + existing replay/nonce integration, exact section 8 challenges, original private errors, no-store and protected auth/veto authority.
  - `packages/express-oidc-vault/src/token-validation.ts`: both validator methods; verified `cnf` snapshot before mapping, malformed/unsupported confirmation rejection, mapping-owned field projection and option/key/secret/allowlist/audience capture.
  - New internal `packages/express-oidc-vault/src/access-token-confirmation.ts`, `src/dpop-proof.ts`, `src/dpop-target.ts`: detached canonical confirmation, bounded signature-first RFC 9449 proof verification and pinned consistent URL/path normalization. No public helper/subpath exports.
  - New `packages/express-oidc-vault/test/dpop-api.test.ts`: **164 passing** API/HTTP policy, attacks, exact challenges, nonces/replay/capacity/expiry, custom adapters, snapshots/getters/mutation and hook/error authority tests.
  - New `packages/express-oidc-vault/test/dpop-proof.test.ts`: **92 passing** shared-verifier tests, real ES256 and explicit PS256/RS256 2048/4096-bit HTTP acceptance/replay, same-size wrong RSA signatures, algorithm confusion, pre-import bounds (spies wrap actual JOSE crypto), malformed/duplicate/UTF-8/deep JSON and exact 2048/8192-byte edges. A read-only vault-POST helper fixture proves no-`ath` reuse through the existing replay policy; it does not implement login/exchange/refresh routes.
  - New `packages/express-oidc-vault/test/dpop-jwt-confirmation.test.ts`: **26 passing** both-method cnf/mapper/secret/JWK/config regressions, including strip/rebind/forge attempts and malformed cnf before mapping.
  - `packages/express-oidc-vault/test/dpop-device-bound.regression.test.ts`: original **8 passing** lifecycle/legacy cases retained; replaced all **11 API TODOs** with exact active named-test links above, and assigned the remaining **30 lifecycle TODOs** to their actual DBJWT-04/05 owners (15 per transport). No already-covered API TODO remains dangling.
  - `packages/express-oidc-vault/test/packed-consumer.test.ts`: disposable consumer explicitly installs `jose` for its new direct signing imports (package/workspace manifests and lock remain unchanged).
  - `packages/express-oidc-vault/test-packed-consumer/consumer/consumer-types.ts`, `consumer-types.cts`: root-only positive/negative request-aware/mandatory-confirmation/policy/replay/readonly-context consumers.
  - `packages/express-oidc-vault/test-packed-consumer/consumer/consumer.mjs`, `consumer.cjs`: actual installed ESM HTTP proof/replay/downgrade checks and CJS both-method confirmation/configuration checks; original exact root-export checks retained.
  - `packages/express-oidc-vault/README.md`: accurate shipped API imports/config/target/policy/custom-adapter/challenge/nonce/replay contracts, defaults/bounds and as-built staging; final website/end-to-end parity remains DBJWT-11.
  - This task file: status, exact evidence and shared-verifier/runtime handoff.
- **Security/runtime behavior verified:**
  - Binding-disabled adapters still receive exactly one argument in `validate(token)`; `validateWithRequest` is not invoked or even read through a getter. Unbound JWT legacy output omits confirmation; a known bound JWT or custom legacy confirmation fails closed with DPoP-required even when mapping removes cnf. Enabled middleware requires the stronger callable at construction and uses it for both schemes, with mandatory supported object/null confirmation from verified data. Bound Bearer fails even with a valid proof; unbound DPoP fails as an invalid access token, never enrollment. Optional unbound/no-proof requests stay compatible; supplied proofs validate/reserve (including nonces) without producing a device binding.
  - Original raw credential/proof multiplicity/value, method/path and token are captured before mutable asynchronous adapters. Duplicate fields hidden by Node/Express, comma joins, private/symmetric/remote/critical keys and algorithms outside the current allowlist fail. 8192-byte compact/2048-byte decoded header/JWK/canonical key-integer/signature bounds run before import; payload JSON/claims are examined only after an actual verified signature. Public EC is P-256; explicitly enabled RSA modulus is 2048–4096 bits with bounded minimal public integers. Iterative duplicate-name parsing is byte-bounded, including escaped aliases/nested data. JTI is strict 1–128 printable ASCII bytes; signed iat/window and nonce/replay are enforced by the existing shared policy.
  - API ath and independently verified original jkt must match. URL comparison strips query/fragment, normalizes case/default port/dot segments/unreserved escapes and remaining escape case, preserves reserved escapes and handles Unicode consistently; only origin-form request paths are concatenated onto configured origin/prefix. Host/Forwarded/X-Forwarded-\* and trust-proxy cannot select proof origin. A `//host` path remains a path on the pinned origin.
  - Two independently constructed API instances sharing one real memory provider barrier-force **4 simultaneous authenticated requests → exactly 1 success / 3 proof failures**; sequential replay and re-signed same-key/JTI against a different real JWT/route also fail. Fresh proofs recover. Shared nonce instances accept older live parallel challenges, write one bounded header only after other checks and before reservation, and challenge expired/foreign/wrong-key nonces. Actual shared capacity returns sanitized 503, duplicate precedence stays 401, expiry recovers. Provider diagnostics remain private `error.cause`; no retry/fallback/release/provider reimplementation was added.
  - req.auth is cleared before validation and after validator/getter injection; it is not attached on proof/nonce/replay failure. Hook veto detaches auth, preserves original HTTP veto or sanitized hook-500 semantics, notifies exactly once privately and retains replay reservations. Successful mutable hooks cannot replace token/confirmation/proof binding or req.auth authority; replacement security getters are not evaluated. Error status/body/challenge is detached before observers mutate originals/headers; non-401 responses remove challenges/nonces, all middleware response paths retain no-store. Headers-sent errors forward the original error; downstream failure still cannot release a proof.
- **Commands/results** (all core build/package-test prebuilds serialized; final focused → build → packed → full core → lint → strict verification issued serially, repository root unless stated):
  - Baseline: `pnpm --filter @web-ts-toolkit/express-oidc-vault... build` → exit 0, CJS/ESM + both declarations; `pnpm --filter @web-ts-toolkit/express-oidc-vault test` → exit 0, **29 files / 820 passed / 41 TODO (861 collected)**, 16.47s.
  - Before production implementation, package directory: `pnpm exec vitest run --config ../../vitest.config.ts test/dpop-api.test.ts` → **23 intended protocol failures / 1 legacy pass**, plus **4 raw-client fixture timeouts/unhandled JSON errors** because raw header arrays omitted Host and Node returned an empty non-JSON 400. Added explicit loopback Host/connection cleanup and controlled JSON rejection; those raw HTTP tests subsequently executed and passed. The old implementation accepted bound Bearer downgrade and rejected all honest DPoP presentation.
  - Final focused, package directory: `pnpm exec vitest run --config ../../vitest.config.ts test/dpop-api.test.ts test/dpop-proof.test.ts test/dpop-jwt-confirmation.test.ts test/dpop-device-bound.regression.test.ts test/bov-14-bearer-auth-context.test.ts test/dpop-replay.test.ts test/dpop-nonce.test.ts test/bov-11-doc-examples.test.ts` → exit 0, **8 files / 511 passed / 30 TODO (541 collected)**, 5.62s. All original BOV-14 assertions remain unchanged.
  - Final required build: `pnpm --filter @web-ts-toolkit/express-oidc-vault... build` → exit 0; CJS **111.36 KB**, ESM **108.44 KB**, `index.d.ts` / `index.d.mts` **46.19 KB each**. Reads confirmed exact root interfaces, mandatory stronger confirmation/method, surviving JSDoc and unchanged runtime exports; internal helpers are bundled, not public exports.
  - Final focused packed, package directory: `pnpm exec vitest run --config ../../vitest.config.ts test/packed-consumer.test.ts` → exit 0, **1 file / 3 passed**, 12.64s. Real publish transform, staged `npm pack --dry-run --json` exact **7 files**, installed CJS/ESM runtime and strict `skipLibCheck: false` **NodeNext ESM + NodeNext CJS + Bundler** consumers with both declaration-condition traces passed.
  - Final full core: `pnpm --filter @web-ts-toolkit/express-oidc-vault test` → exit 0, **32 files / 1102 passed / 30 TODO (1132 collected)**, 22.00s; **282 new passing tests** above baseline, all existing legacy/BOV and all three packed checks passed. Includes a fresh serialized package prebuild of both JS/declaration conditions.
  - Final focused lint: `pnpm exec eslint packages/express-oidc-vault/src/types.ts packages/express-oidc-vault/src/access-token-confirmation.ts packages/express-oidc-vault/src/token-validation.ts packages/express-oidc-vault/src/dpop-proof.ts packages/express-oidc-vault/src/dpop-target.ts packages/express-oidc-vault/src/access-token-middleware.ts packages/express-oidc-vault/test/dpop-api.test.ts packages/express-oidc-vault/test/dpop-proof.test.ts packages/express-oidc-vault/test/dpop-jwt-confirmation.test.ts packages/express-oidc-vault/test/dpop-device-bound.regression.test.ts packages/express-oidc-vault/test/packed-consumer.test.ts packages/express-oidc-vault/test-packed-consumer/consumer/consumer-types.ts packages/express-oidc-vault/test-packed-consumer/consumer/consumer-types.cts packages/express-oidc-vault/test-packed-consumer/consumer/consumer.mjs packages/express-oidc-vault/test-packed-consumer/consumer/consumer.cjs` → exit 0, **15 files / no errors or warnings**.
  - Final strict changed-source/test graph: `pnpm exec tsc -p <repo-root>/_tmp/dbjwt-06-typecheck/tsconfig.json` → exit 0, **8 entry files** (source root/proof/target, three new tests, scaffold and packed harness) plus transitive core/memory graph, ES2022/Bundler/strict/`skipLibCheck: false`. External temporary config reuses the already installed real `@types/supertest` from DBJWT-03; no new workspace or external dependency installation/lock changes. Earlier direct strict source-only check also passed. This is not a claim of a clean whole pre-existing legacy test typecheck; DBJWT-03's baseline limitations remain historical.
  - Inventory without rerunning: `pnpm exec vitest list --config ../../vitest.config.ts test/dpop-api.test.ts test/dpop-proof.test.ts test/dpop-jwt-confirmation.test.ts --json` + exact-file `rg --count` over its captured output initially counted **162 + 92 + 26 = 280**. Final mapped-hook-getter review added **2** active API regressions; final suite totals **164 + 92 + 26 = 282**.
  - `git diff --check` and individual `git diff --no-index --check /dev/null <path>` for **6 new source/test files, original untracked scaffold and this task document** → exit 0. `git diff --exit-code HEAD -- CHANGELOG.md packages/express-oidc-vault/src/provider-client.ts packages/express-oidc-vault/package.json packages/express-oidc-vault/tsup.config.ts pnpm-lock.yaml` → exit 0. Existing user access-router changes and completed policy/issuance/store/replay changes remain intact; no vault-handler/index/provider/replay source implementation, user access-router edit/revert, CHANGELOG or commit work was performed in DBJWT-06.
- Corrections during verification (no skipped/relaxed failing contract assertions): early strict/lint caught an optional token closure/type annotation and control-regex/unused fixture arguments; corrected and reran. A custom-adapter negative fixture incorrectly classified explicit null as malformed (null is approved verified unbound), and a mutation fixture called an unbound spied provider method, producing a false 503; fixed both. First packed runtime run was **2 passed / 1 failed** because the new ESM consumer directly imported `jose` without declaring it in its disposable application's dependencies; added that dependency to the test-created manifest and subsequent packed/full runs passed. Final review placed auth restoration inside the hook error boundary and added original-result observer fallback for throwing mapped-field getters, preserving explicit veto/original hook-500 errors instead of reporting invalid-token semantics; the complete focused/build/packed/full/lint/strict sequence was rerun after this correction and passed above.
- Runtime scope: actual API routes, installed package consumers and shared memory-object replay/nonce were exercised here. DBJWT-08's unchanged Redis 6.2/7.2 independent-client Lua and live Mongo replica-set/TTL/capacity conformance evidence is the provider handoff; those provider suites were not rerun or reimplemented. Independent memory objects are not distributed protection. Current Vite native-config-loader warning remains non-fatal. Final repository-wide/website/browser parity and independent review remain DBJWT-11/12.
- **Exact new internal DBJWT-04/05 handoff (source imports only):**

  ```ts
  // src/dpop-proof.ts
  interface DpopRawHeader { readonly count: number; readonly value?: string }
  readDpopRawHeader(req: Pick<Request, 'rawHeaders'>, name: string): DpopRawHeader;
  extractDpopProof(header: DpopRawHeader): string | undefined;
  verifyDpopProof(input: {
    readonly proof: string;
    readonly method: string;
    readonly targetUrl: string;
    readonly proofOptions: ResolvedOidcVaultDeviceBindingOptions;
    readonly expectedJkt?: string;
    readonly accessToken?: string;
  }): Promise<DpopProofVerificationResult>;
  // src/dpop-target.ts
  createDpopRequestTargetResolver(options: {
    readonly publicOrigin: string;
    readonly publicPathPrefix?: string;
  }): (originalUrl: unknown) => string;
  normalizeDpopProofTarget(value: unknown): string;
  // src/access-token-confirmation.ts (API verified-data boundary)
  snapshotVerifiedJwtConfirmation(claims: Record<string, unknown>): Readonly<OidcVaultAccessTokenConfirmation> | null;
  snapshotAccessTokenConfirmation(value: unknown): Readonly<OidcVaultAccessTokenConfirmation> | null;
  ```

  - Raw-header count is capped at two (already duplicate), detached and case-insensitive; no request-controlled value array is allocated. `extractDpopProof` returns undefined only when absent; callers own required-mode/original-binding missing-proof policy. The verifier returns frozen original proof binding + signed iat/JTI/optional nonce only after signature/target/key/API-hash checks. It is read-only and **does not perform age-window admission, challenge/reservation or mutate/enroll records**; always compose it inside DBJWT-07's existing `replayPolicy.verifyAndReserve`.
  - For vault POSTs create one pinned resolver with `{ publicOrigin: resolvedBackendOrigin }`, no API prefix, and use the full externally visible `req.originalUrl` path. Create one existing replay policy for `['vault', normalizedBackendOrigin, normalizedBasePath, exactResolvedIssuer, exactResolvedClientId]` using the configured stronger store. Capture raw proof/method/path and original record binding/cookie/provider/recognition authority before mutable work. Verify with **no accessToken/ath requirement**; use `expectedJkt: originalStoredBinding?.jkt` for bound exchange/refresh/logout, and omit it only for new login selection or genuinely unbound optional proof use.
  - DBJWT-04/05 authenticate mode/identity/cookie/recognition and original record agreement before the trusted verification callback returns; no code consume/upstream/rotation/hooks/issuance/revocation precedes nonce + atomic admission. A nonce result writes `toDpopNonceChallengeResponse(result, 'vault-post', policy.algorithms)` and stops before mutation. Accepted proof binding still goes through DBJWT-03 `resolveVerifiedDeviceBinding(policy, originalStoredBinding, accepted.binding)` so optional legacy records never enroll; preserve original binding through guarded consumes and immutable issuer/rotation authority. Do not include target/code/session/token in replay keys or release reservations after downstream failure. Headerless callback authenticates the transaction cookie and guarded stored match; it invokes no proof/nonce policy.

- **Remaining owners / next execution:** DBJWT-04 owns POST login/transaction-cookie/headerless callback and its browser-transfer regressions; DBJWT-05 owns exchange/refresh/logout original-key/alias/atomic-match/no-upstream-burn/lifecycle integration and the **30 remaining DBJWT-01 TODOs**, including DBJWT-04's exchange integration. DBJWT-09 recognition, DBJWT-10 real browser persistent keys/CORS/nonce retries, DBJWT-11 final shipped README/website/declaration parity and repository packaging, DBJWT-12 independent full integration review remain pending. No DBJWT-06 blocker remains. Continue **DBJWT-04 → DBJWT-05 → DBJWT-09 → DBJWT-10 → DBJWT-11 → DBJWT-12**.

---

### Task DBJWT-07: Replay protection + nonce strategy (shared, multi-instance-safe)

Status: completed

Assigned: isolated sequential DBJWT-07 agent (no nested agents).

Priority: P0

Suggested agent: backend/store engineer

Dependencies: DBJWT-02 (replay/nonce decisions), DBJWT-03, DBJWT-08

Primary ownership:

- New: `packages/express-oidc-vault/src/dpop-replay.ts` (or equivalent; avoid colliding with `src/token-validation.ts` ownership in DBJWT-06 — sequence or split by file)
- `packages/express-oidc-vault/src/types.ts` (replay-store interface)
- Store adapters (memory/Redis/MongoDB) — consume the methods implemented by DBJWT-08; provider implementation/conformance belongs to DBJWT-08

Finding:

DPoP `jti` replay detection requires shared state with TTL. The existing backchannel `consumeBackchannelLogoutTokenJti` is a single-key atomic reservation precedent, but its traffic is low; DPoP replay traffic is per-request and needs bounded cost.

References:

- `packages/express-oidc-vault/src/index.ts:273-309,931-989` (replay-key namespacing + reservation pattern)
- `packages/express-oidc-vault-memory-store/src/index.ts:335-351`
- `packages/express-oidc-vault-redis-store/src/index.ts:317-330`
- `packages/express-oidc-vault-mongodb-store/src/store.ts:255-292`

Implementation requirements:

1. Orchestrate D5's `reserveDpopProof({ replayKey, expiresAt })` using DBJWT-08's atomic provider implementation; apply its duplicate/expiry/bounds/capacity behavior.
2. Namespace replay keys by verification context + client-key thumbprint + `jti` (avoid cross-context suppression).
3. Bound TTL to proof age + skew; cap storage; document high-traffic cost (contrast with backchannel JTI usage).
4. Implement the approved D7 stateless nonce policy for DPoP-bearing vault POSTs and configured APIs, including lifetime/challenge/retry bounds.
5. Fail closed with `OIDC_VAULT_DPOP_REPLAY_UNAVAILABLE` on replay-store errors/capacity per D5; expose original diagnostics through private observers only.

Acceptance criteria:

- Shared replay/nonce orchestration using separate backend contexts gives simultaneous duplicate reservations exactly one winner and the approved invalid-proof error for losers; later DBJWT-06/05 verify its HTTP 401 mapping on API/vault routes.
- Expired reservation windows do not permanently block fresh proofs.
- Unit + multi-instance (or multi-client-emulated) tests prove atomicity; Redis/Mongo live-harness coverage where available.

Completion evidence (2026-10-02, isolated sequential DBJWT-07 agent):

- Changed paths (DBJWT-07 only):
  - `packages/express-oidc-vault/src/dpop-replay.ts` (new, internal): static detached/frozen protection-space tuples; exact opaque `dpop:v1:` + base64url(SHA-256(JSON([effectiveNamespace, jkt, jti]))); strict signed-iat/epoch/TTL validation; trusted verification-callback boundary; nonce preflight then exactly one atomic provider reservation; duplicate/expired admission → approved invalid-proof error; every provider/capacity/non-boolean-result failure → fail-closed sanitized 503 with original non-enumerable `cause`. No reservation release, duplicate renewal, retry/fail-open, or fallback store. Sanitized response-data mapping supplies fixed code/message, `no-store`, appropriate 401 proof/nonce challenges, and exactly one bounded nonce header; actual HTTP writers/observers remain later integration.
  - `packages/express-oidc-vault/src/dpop-nonce.ts` (new, internal): copied private >=32-byte secret; default 60 / integer 1–300-second lifetime; random 128-bit, versioned, domain-separated HMAC-SHA-256 challenges with safe issue/expiry epochs, namespace SHA-256 digest and key thumbprint. Canonical bounded base64url/JSON/UTF-8, exact five-field payload, lifetime/key/context/MAC/expiry checks; maximum 512-byte wire value independent of configuration URL length. Any authentic live issued nonce is accepted, including older concurrent challenges; no single-use/latest-nonce/previous-secret/per-client store. Issuance is called only on otherwise-valid challenges; normal proof iat/JTI policy still runs.
  - `packages/express-oidc-vault/test/dpop-replay.test.ts` (new): **138 passing** namespacing/window/precondition/reservation/error/nonce orchestration regressions. Real shared memory provider with independent policy/client closures: **12 real signed/verified ES256 proofs**, different real verified local JWTs and route targets, same authenticated key/JTI → **1 winner / 11 approved invalid-proof losers**. A real invalid signature never reaches reservation. Separate live code/session targets retain records during the replay race. Tests cover exact max TTL, millisecond/high-safe-epoch boundaries, no allocation on bad windows/claims/nonces, snapshot/getter isolation, pending verifier ordering, capacity duplicate precedence, actual expiry/recovery, uncertain post-commit store error and retained reservation after downstream failure. Pure policy fixtures explicitly make no signature-authentication claim.
  - `packages/express-oidc-vault/test/dpop-nonce.test.ts` (new): **72 passing** real-HMAC tests for shared instances, random/version/domain/context/key binding, any live older nonce/parallel reuse, secret snapshot/rotation, default/min/max/exact expiry and maximum safe epochs, long-context fixed size, malformed/tampered/noncanonical/invalid-UTF-8/type/byte-bound inputs, and issuer-authentic malformed payload/lifetime rejection.
  - `packages/express-oidc-vault/src/types.ts`: public nonce/replay/observer JSDoc only (no public signature changes), clarifying prerequisite order, normal iat/JTI policy, parallel nonces, one fresh-proof retry, shared clocks/windows, private replay failure cause and no release.
  - `packages/express-oidc-vault/README.md`: accurate staged internal replay/nonce availability, zero per-client nonce storage and challenge/retry contract; explicitly retains upcoming proof-aware HTTP integration. Existing provider high-traffic cost/capacity/Mongo contention/memory-object limits retained. No claim that installed current routes already enforce proofs/nonces.
  - This task file: DBJWT-07 completion/evidence/handoff and next execution update. Section 8's approved/frozen D1–D8 is unchanged.
- Commands/results (all build/package-test invocations issued **sequentially**, repository root unless stated):
  - Baseline: `pnpm --filter @web-ts-toolkit/express-oidc-vault... build` → exit 0, CJS/ESM + both declarations; `pnpm --filter @web-ts-toolkit/express-oidc-vault test` → exit 0, **27 files / 610 passed / 41 TODO (651 collected)**, 17.71s.
  - Initial focused new-test run, package directory: `pnpm exec vitest run --config ../../vitest.config.ts test/dpop-replay.test.ts test/dpop-nonce.test.ts` → **198 passed / 1 failed (199)**. The expiry/uncertain-commit fixture captured the provider method after spying and counted its delegated call twice; captured the original method before the spy. Corrected run → exit 0, **2 files / 199 passed**, 0.76s. No failing assertion was skipped or weakened.
  - Final focused run after boundary/response/ordering coverage, package directory: `pnpm exec vitest run --config ../../vitest.config.ts test/dpop-replay.test.ts test/dpop-nonce.test.ts test/dpop-device-binding-policy.test.ts test/dpop-token-issuance.test.ts` → exit 0, **4 files / 336 passed**, 1.73s (**210 new + 126 existing policy/issuance**). `pnpm exec vitest list --config ../../vitest.config.ts test/dpop-replay.test.ts test/dpop-nonce.test.ts --json` output counted **138 replay + 72 nonce = 210**, without rerunning tests.
  - Final required build: `pnpm --filter @web-ts-toolkit/express-oidc-vault... build` → exit 0, CJS/ESM + `index.d.ts`/`index.d.mts` (**40.79 KB each**). Reads/searches confirmed public JSDoc survives both declarations, existing root exports remain, and new helpers/interfaces have no root/subpath export. The source-internal foundation is intentionally integrated into runtime entrypoints by the subsequent verifier/handler tasks.
  - Final full core: `pnpm --filter @web-ts-toolkit/express-oidc-vault test` → exit 0, **29 files / 820 passed / 41 TODO (861 collected)**, 17.81s; **210 additional passes** above baseline, all existing BOV/legacy tests and all **3 packed-consumer checks** (publish transform/file list, real CJS/ESM runtime, strict NodeNext ESM/CJS + Bundler declarations) pass.
  - Final focused lint: `pnpm exec eslint packages/express-oidc-vault/src/dpop-replay.ts packages/express-oidc-vault/src/dpop-nonce.ts packages/express-oidc-vault/src/types.ts packages/express-oidc-vault/test/dpop-replay.test.ts packages/express-oidc-vault/test/dpop-nonce.test.ts` → exit 0, **5 files / no errors or warnings**.
  - Final focused strict source/new-test graph: `pnpm exec tsc --ignoreConfig --noEmit --module ESNext --moduleResolution Bundler --target ES2022 --strict --skipLibCheck false --types node packages/express-oidc-vault/src/index.ts packages/express-oidc-vault/src/dpop-replay.ts packages/express-oidc-vault/src/dpop-nonce.ts packages/express-oidc-vault/test/dpop-replay.test.ts packages/express-oidc-vault/test/dpop-nonce.test.ts` → exit 0, **5 entries plus transitive source/provider graph**, no temporary dependency/config or workspace lock changes. This is not a claim of a passing whole legacy test-graph typecheck (earlier baseline limitations remain recorded under DBJWT-03/08).
  - `git diff --check` and individual `git diff --no-index --check /dev/null <path>` for all **4 new source/test paths + this task file** → exit 0. `git diff --exit-code HEAD -- CHANGELOG.md packages/express-oidc-vault/src/access-token-middleware.ts packages/express-oidc-vault/src/token-validation.ts packages/express-oidc-vault/src/provider-client.ts packages/express-oidc-vault/package.json packages/express-oidc-vault/tsup.config.ts pnpm-lock.yaml` → exit 0. No provider implementation/conformance, HTTP handler, unrelated access-router work, CHANGELOG or commit edits were made.
- Live-provider scope/limits: DBJWT-08 already exercised Redis 6.2/7.2 independent clients and Mongo replica-set/TTL/transaction capacity admission; those unchanged providers were not rerun. Here sharing is explicitly one real memory-store object; independent objects demonstrably accept independently and are not distributed replay protection. Redis server-time admission and Mongo shared serialization/ledger costs, conservative bounded cleanup and capacity limits remain the DBJWT-08 handoff. Matching shared policy windows/namespaces/secrets and synchronized clocks are deployment requirements. No DBJWT-07 blocker remains; the existing Vite config-loader warning is non-fatal.
- **Exact internal DBJWT-06 → DBJWT-04/05 handoff** (source imports only, no new public package API):
  - `resolveDpopEffectiveNamespace(space: DpopProtectionSpace): DpopEffectiveNamespace` → frozen **`['vault', normalizedBackendOrigin, normalizedBasePath, exactResolvedIssuer, exactResolvedClientId]`** or **`['api', normalizedPublicOrigin, exactReplayNamespace]`**. API path prefix belongs to later request-target verification, never this tuple. Pass resolved issuer/client IDs verbatim; do not add instance ID, code, session, target URL/path or token.
  - `createDpopReplayPolicy({ protectionSpace, proofOptions: ResolvedOidcVaultDeviceBindingOptions, replayStore: OidcVaultDpopReplayStore, now?: () => number }): DpopReplayPolicy`; build one private policy per protection space from the existing resolved options and shared provider (API uses its explicit `replayStore`). Defaults/windows/secret are snapshotted; store service remains shared. `effectiveNamespace` is readonly; **`verifyAndReserve(verifyBeforeReplay: () => DpopProofVerificationResult | Promise<DpopProofVerificationResult>): Promise<DpopReplayResult>`** is the operation.
  - `DpopProofVerificationResult = { binding: Readonly<OidcVaultVerifiedDpopBinding>, jti: unknown, iat: unknown, nonce?: unknown }` is an explicit **trusted callback output**, not a raw-jkt/JTI authentication API. DBJWT-06 must verify the signature, public-only bounded JWK/header/algorithm profile, method/pinned public URL, expected key and API token/confirmation/ath; vault handlers also preflight original record/issuer-client/cookie/recognition authority before callback return. The callback is read-only; no consume/upstream/hook/mutation belongs before acceptance. This layer cannot authenticate those prerequisites by checking string shapes. Verifier/target failures propagate unchanged for private observers; they cannot issue nonce/replay state.
  - `DpopReplayResult` → **`{ type: 'accepted', binding: Readonly<OidcVaultVerifiedDpopBinding>, expiresAt: number } | { type: 'nonce-challenge', nonce: string }`**, detached/frozen. Acceptance means normal iat + nonce + one shared reservation passed, not enrollment of the target record. DBJWT-04/05 must use DBJWT-03's `resolveVerifiedDeviceBinding` with the original stored binding; supplied valid proofs in optional unbound flows still reserve but never enroll. Nonce challenge means stop before allocation/consume/provider work; normal no-proof unbound requests and headerless callback do not invoke this proof policy.
  - `getDpopReplayExpiresAt({ iat, now, proofMaxAgeSeconds, clockSkewSeconds }): number | null` and `createDpopReplayKey(effectiveNamespace, jkt, jti): string` are pure calculation/shape helpers, **not proof verification**. Expiry is exactly `(iat + age + skew) * 1000`, strict `nowSeconds - age - skew < iat <= nowSeconds + skew` (`nowSeconds = now / 1000`, implemented with exact integer-millisecond comparisons), future safe integer and remaining TTL <=360000 ms. Invalid windows fail before store invocation; duplicate/invalid provider `false` throws `401 OIDC_VAULT_INVALID_DPOP_PROOF`. Provider errors/capacity/non-boolean results throw `503 OIDC_VAULT_DPOP_REPLAY_UNAVAILABLE`, original diagnostic in non-enumerable `error.cause`; private route/API observers own notification. There is no release method; retain reservations after every downstream failure.
  - `toDpopNonceChallengeResponse(result, 'vault-post' | 'api', resolvedAlgorithms): DpopPolicyResponse` supplies **400 / 401**, fixed `OIDC_VAULT_USE_DPOP_NONCE` JSON, one header and no-store; API alone adds `DPoP error="use_dpop_nonce", algs="…"`. `toDpopReplayErrorResponse(error, resolvedAlgorithms): DpopPolicyResponse` supplies sanitized `{ status, body: { code, message }, headers }`; proof/required 401s get `invalid_dpop_proof`, non-401s (including replay 503) get no auth challenge. Handlers write these values and call existing private observers; do not pass raw nonce claims or diagnostics to mapping. Broader API extraction/token/required-mode challenge selection remains DBJWT-06.
  - `createDpopNoncePolicy({ secret, lifetimeSeconds?, namespace: JSON.stringify(effectiveNamespace) }): DpopNoncePolicy` is the lower-level internal signer/verifier, already composed by replay policy; normal handlers need not invoke it directly. Exact wire/domain/validation contract is in its JSDoc. Secret rotation produces a fresh challenge; browser caches per space/key and retries once with new jti/iat/signature, stopping on repeated challenge.
- **Remaining TODO activation:** all **41 DBJWT-01 HTTP lifecycle/API TODOs** remain (30 session/browser + 11 API). DBJWT-06 next owns actual signature/request verifier, mandatory request-aware token confirmation, API middleware/401/challenge/observer wiring and its HTTP replay/nonce checks; DBJWT-04 then owns POST initiation/transaction cookie/headerless callback and DBJWT-05 exchange/refresh/logout guarded preflight/consume/issuance integration. DBJWT-10 activates actual browser nonce cache/retry. Primitive tests here do not satisfy those integrated HTTP scenarios. Continue **DBJWT-06 → DBJWT-04 → DBJWT-05 → DBJWT-09 → DBJWT-10 → DBJWT-11 → DBJWT-12**.

---

### Task DBJWT-08: Store contracts — persist binding + atomic consume/match

Status: completed

Assigned: isolated DBJWT-08 sub-agent (sequential execution).

Priority: P0

Suggested agent: store/backend engineer

Dependencies: DBJWT-02, DBJWT-03

Primary ownership:

- `packages/express-oidc-vault/src/types.ts` (`OidcVaultStoreProvider`, record inputs)
- `packages/express-oidc-vault-memory-store/src/index.ts`
- `packages/express-oidc-vault-redis-store/src/{index.ts,records.ts,scripts.ts}`
- `packages/express-oidc-vault-mongodb-store/src/{store.ts,documents.ts}`
- `packages/express-oidc-vault/test/store-provider-conformance.ts`

Finding:

Binding fields (`jkt`/public JWK/alg/mode) must survive memory clone, Redis JSON validation, and MongoDB document mapping. Current `consumeExchangeCode(code)` cannot atomically enforce “consume only if binding matches”; current `consumeAuthorizationTransaction(state)` has the same shape. Redis Lua scripts and MongoDB transactions are the natural enforcement points.

Contract resolution: the original candidate fields above are superseded by approved D1's thumbprint-only `deviceBinding` and transaction/code `browserBindingHash`; do not persist a public JWK, algorithm, or historical mode.

References:

- `packages/express-oidc-vault/src/types.ts:82-136,160-242`
- `packages/express-oidc-vault-redis-store/src/records.ts:42-82`
- `packages/express-oidc-vault-redis-store/src/scripts.ts:623-647`
- `packages/express-oidc-vault-mongodb-store/src/documents.ts:9-94`
- `packages/express-oidc-vault/test/store-provider-conformance.ts`

Implementation requirements:

1. Persist D1's optional binding/hash fields across all three stores (memory `structuredClone`, Redis `validate*`, Mongo `*ToDocument`/`documentTo*`), including immutable binding across rotation.
2. Implement D5's exact portable capabilities and stronger `OidcVaultDeviceBindingStoreProvider` contract:
   - `getAuthorizationTransaction` / `consumeAuthorizationTransactionIfMatches`;
   - `getExchangeCode` / `consumeExchangeCodeIfMatches` (including `expectedSessionId`);
   - `getSessionRevocationContext` for live handles/aliases;
   - `reserveDpopProof` with shared expiry/capacity admission.
3. Preserve existing duplicate-ID, alias-retention (SVH-05), expiry (`expiresAt <= now`), serialization, and deletion-accounting contracts; update conformance suite, not just per-provider tests.
4. Handle legacy records without binding fields per migration policy (reject in `required`, explicit policy in `optional`).
5. Never log token/key material; keep fixed-text maintenance warnings (follow Redis SVH-02 precedent).

Acceptance criteria:

- Round-trip tests for binding fields on all three providers.
- Mismatched-key consume → fails without yielding the session and without leaving the code claimable by the mismatched presenter (per DBJWT-05 semantics).
- Full store conformance + live harnesses (where configured) pass.
- No portable-contract regression (alias/expiry/count semantics unchanged except as explicitly documented).

Completion evidence (2026-10-02, isolated sequential DBJWT-08 agent):

- Changed paths (DBJWT-08 only; earlier DBJWT-01/03 and unrelated worktree changes remain intact):
  - Core: `packages/express-oidc-vault/src/types.ts`; `packages/express-oidc-vault/README.md`; `packages/express-oidc-vault/test/store-provider-conformance.ts`; `packages/express-oidc-vault/test-packed-consumer/consumer/{consumer-types.ts,consumer-types.cts,consumer.cjs,consumer.mjs}`.
  - Memory: `packages/express-oidc-vault-memory-store/src/index.ts`; new `src/{binding,dpop-replay}.ts`; `README.md`; `test/index.test.ts`; new `test/dpop.test.ts`; `test-packed-consumer/consumer/{consumer-types.ts,consumer.cjs,consumer.mjs}`.
  - Redis: `packages/express-oidc-vault-redis-store/src/{index,keys,records,scripts}.ts`; `README.md`; `test/{index,index-corruption-race,scripts}.test.ts`; new `test/{dpop-live.test,fake-device-binding-scripts}.ts`; `test-packed-consumer/consumer/{consumer-types.ts,consumer.cjs,consumer.mjs}`.
  - MongoDB: `packages/express-oidc-vault-mongodb-store/src/{index,store,documents,options,topology}.ts`; new `src/{binding,dpop-replay}.ts`; `README.md`; `test/{index,packed-consumer}.test.ts`; `test/mongo-memory.ts`; new `test/dpop.test.ts`.
  - This task file: DBJWT-08 status/evidence and next execution handoff. Section 8's approved D1–D8 contracts are unchanged.
- Public contract implemented: all built-ins return `OidcVaultDeviceBindingStoreProvider` (Mongo retains `OidcVaultMongoStoreProvider.ready()`) and implement all six DBJWT-03 declarations. Root-exported `OidcVaultDpopReplayCapacityError` follows the existing core store-error import pattern. Every provider exposes `dpopReplayMaxEntries?: number` (default **100000**, positive safe integer, null rejected); Mongo adds distinct `dpopProofsCollectionName` / `dpopReplayCapacityCollectionName` with the approved defaults. Base custom bearer stores retain optional capabilities and compile in packed consumers.
- Binding/consume semantics verified:
  - Canonical 43-character SHA-256 base64url thumbprints/browser hashes, exact two-field plain `{ type: 'dpop', jkt }`, invocation-owned inputs and detached results. No JWK/algorithm/mode persists. Invalid security writes reject; null/malformed stored fields never return legacy credentials.
  - Live non-consuming getters; full mandatory exact/null matches; exchange additionally matches `expectedSessionId`; mismatches leave live records available for honest retry. Original consume methods refuse valid cookie-only/key-bound records without spending them. Concurrent matching consumers have exactly one winner. No read followed by unconditional-delete fallback exists on these paths.
  - Rotation omission/undefined inherits the source binding, same-key input is accepted, changed/add/null/malformed binding is rejected before source/target/alias mutation. Redis's Lua source-authority CAS and Mongo's source-generation comparison include binding, preserving it through replacement/retry races.
  - Live/alias revocation contexts resolve a currently live lineage rather than the alias's missing binding. They allowlist logical ID/provider issuer-client/binding, return no tokens/profile/metadata/extra provider fields, and throw fixed private diagnostics on malformed/mixed/inconsistent authority. Expired handles/aliases and empty lineages produce no context. Existing alias deadlines/transitions, duplicate-create modes and deletion counts still pass the complete original conformance suite.
- Precise internal implementation/handoff:
  - Memory `src/binding.ts`: `isBinding`, `hasValidRecordBinding`, `assertRecordBinding`, `assertSessionBinding`, `isBindingMatch`, `matchesRecordBinding`, `inheritSessionBinding`, `sessionRevocationContext`, `assertSameLineageAuthority`, `hasValidSessionRecord`. `MemoryOidcVaultStore.readOneTimeRecord` / `consumeExchangeRecord` perform synchronous compare/delete. `DpopReplayReservations` is a Map + indexed min-heap (one node per retained key, no lazy-tombstone accumulation or full snapshot rebuild); admission removes at most **64** expired nodes plus the requested expired key, O(log N) heap work, no session/alias traversal. Sharing is one memory object only.
  - Redis `records.ts` validates binding/hash/match and existing keyed shapes. `BINDING_VALIDATION_HELPER` distinguishes `cjson.null` from absence, canonical hashes and exact bindings; `optionalObjectField` also distinguishes empty JSON provider arrays from objects (including escaped/duplicate keys/nested lookalikes). New `CONSUME_GUARDED_RECORD_SCRIPT` / `buildConsumeGuardedRecordCommand` atomically validate, match and consume; `SESSION_REVOCATION_CONTEXT_SCRIPT` / `buildSessionRevocationContextCommand` resolve coherent current lineage authority (a directly observed live handle always participates, even if its reverse-index membership is missing); `RESERVE_DPOP_PROOF_SCRIPT` / `buildReserveDpopProofCommand` use server `TIME`, duplicate-first admission and hard `LIMIT 64` cleanup in **`<prefix>:dpop-proofs`**. That one sorted set is replay/expiry/capacity state; its latest score sets key expiry. Steady state is one cached `EVALSHA`, NOSCRIPT load/retry adds two calls. Guarded getters normally use `GET` + `TIME`, guarded consumes check payload expiry inside Lua; legacy consumes/`getSession` retain historical key-TTL authority. Rotation Lua also CAS-checks source provider/credential/identity generation before index mutation.
  - Mongo `bindingMatchFilter` uses `$exists: false` for null/absence and exact field-order-independent two-field binding, with expiry/session filters on `findOneAndDelete`; returned records are rechecked for expiry after the command. Binding survives all document mappings and source-generation checks. `toRevocationContext` / `assertSameLineageAuthority` consume credential-free projections in a snapshot transaction. `MongoDpopReplayReservations` writes a shared capacity revision to serialize independent-client admission, maintains unique proof IDs and separate indexed **non-TTL** reservation-accounting rows, and commits cleanup/proof/ledger/counter together. At most 64 expired ledger rows plus the requested expired key are reclaimed; physical TTL deletion cannot strand an inflated counter because expiry evidence survives. Readiness checks shared max/pairing and rejects any TTL index on the capacity ledger. Missing physical live proof with live ledger remains duplicate. Normal new admission uses seven data commands + commit; contention/cleanup/retries add work.
  - Mongo legacy serialization resolution: the pre-binding mapper emitted BSON null for omitted **provider/expiry**. Only these two non-binding fields on genuinely unbound old session rows normalize to absence, preserving legacy read/rotation/revocation. Null `deviceBinding`/`browserBindingHash` never normalizes. New omitted security/provider/expiry fields are omitted before BSON; native provider `toBSON` behavior remains intact and tested.
- Meaningful coverage added: **25 portable stronger-provider scenarios per adapter**, covering legacy/cookie-only/bound matching, wrong keys/hashes/session ID, stale upsert preflight, invalid/null/extra/newline hashes, invocation/result mutation, concurrent consumes/replay/capacity, exact expiry, immutable rotation and lineage/alias authority. Memory adds **14** corruption/bounded-work/churn tests, including 1000 deterministic randomized heap operations. Redis adds **52 real-Lua tests (26 per version)** with independent connected clients. Mongo adds **28 live replica-set tests**, including independent-client races, actual TTL-monitor deletion/recovery, bounded expiry accounting, write rollback/retry, response-time expiry, legacy BSON migration and native provider serialization.
- Commands/results (all package build/test invocations issued **strictly serially**, repository root unless stated):
  - Baseline core: `pnpm --filter @web-ts-toolkit/express-oidc-vault... build` and `pnpm --filter @web-ts-toolkit/express-oidc-vault test` → exit 0; **27 files / 610 passed / 41 TODO (651 collected)**, 19.76s.
  - Baseline providers, one at a time: `pnpm --filter @web-ts-toolkit/express-oidc-vault-memory-store test` → **2 files / 84 passed**, 7.46s; Redis equivalent → **10 files / 259 passed**, 20.13s; Mongo equivalent → **5 files / 88 passed**, 37.85s. All prebuild CJS/ESM/declarations passed; configured live Redis/Mongo harnesses ran.
  - Before production implementation, memory package `pnpm exec vitest run --config ../../vitest.config.ts test/index.test.ts` → **23 new failures / 81 original passes**, proving absent capabilities and binding-changing rotation. Final portable suite expanded to 25 scenarios as migration/lineage coverage was added.
  - Final memory: `pnpm --filter @web-ts-toolkit/express-oidc-vault-memory-store test` → exit 0; **3 files / 123 passed**, 7.34s; CJS/ESM + both declaration outputs and all three packed-consumer checks passed.
  - Final Redis: `pnpm --filter @web-ts-toolkit/express-oidc-vault-redis-store test` → exit 0; **11 files / 336 passed**, 18.65s; CJS/ESM + both declarations, original conformance, all existing live suites, 52 new live DPoP tests and all three packed-consumer checks passed.
  - Final Mongo: `pnpm --filter @web-ts-toolkit/express-oidc-vault-mongodb-store test` → exit 0; **6 files / 141 passed**, 58.18s; CJS/ESM + both declarations, original/stronger live conformance, 28 new live tests and all three packed-consumer checks passed.
  - Final core after error/export/docs changes: `pnpm --filter @web-ts-toolkit/express-oidc-vault test` → exit 0; **27 files / 610 passed / 41 TODO (651 collected)**, 17.53s. No HTTP TODO was activated using only provider primitives. Includes packed CJS/ESM runtime and strict NodeNext ESM/CJS + Bundler consumers and the staged `npm pack --dry-run --json` checks.
  - Focused strict source/conformance/new-memory/Redis test graph: `pnpm exec tsc --ignoreConfig --noEmit --module ESNext --moduleResolution Bundler --target ES2022 --strict --skipLibCheck false --types node <entry paths>` → exit 0. Final **11-entry** source/conformance/changed Redis/new provider-test graph: `pnpm exec tsc -p <repo-root>/_tmp/dbjwt-08-typecheck/tsconfig.json` → exit 0; only external `@types/semver@7.8.0` was installed to satisfy the repo harness dependency's missing declaration, with no workspace dependency/lock changes.
  - Focused ESLint over all changed core/provider source, runtime tests and packed consumers → exit 0, no errors/warnings. `git diff --check` and `git diff --no-index --check /dev/null <path>` for all **9 new DBJWT-08/task paths** → exit 0. Final declaration reads confirm stronger factories, inherited JSDoc, root capacity error and no new public internal helpers/subpaths. `git diff --exit-code HEAD -- CHANGELOG.md <API verifier/provider-client/package manifests/pnpm-lock paths>` → exit 0. Disposable-container inventory confirmed only pre-existing user containers remain; no commits were made.
- Accurate failures corrected during verification: an initial lint found two unused binding-destructure variables (removed); strict checking caught new type narrowing/replacement issues plus existing Mongo index-collection variance (restricted internal index helper to its actual `createIndex` capability). Tightening the old Mongo harness command type briefly shadowed its failure-injection options, causing **2 readiness-fixture failures** on the first full Mongo run; renamed the argument and subsequent full runs passed. One later real Redis 7.2 expiry test assumed a host 850ms sleep meant server expiry and failed once; it now waits boundedly for actual Redis `TIME`, and the complete Redis package rerun passed. These were verified corrections, not skipped failing assertions.
- Live verification/resources: used the existing approved disposable Docker harness for **`redis:6.2-alpine` / `redis:7.2-alpine`**, bound to dynamically allocated loopback ports, with UUID key prefixes and independent clients; all owned containers/connections were stopped. Mongo ran real `mongodb-memory-server` standalone (expected topology rejection) and replica-set harnesses, random disposable databases, independent `MongoClient`s and transaction/failpoint checks; the new TTL test changed `ttlMonitorSleepSecs` only on its own disposable server and observed actual proof-row deletion before capacity recovery. No user Redis/Mongo/IdP services were used. There is no unconfigured-live limitation for these harnesses.
- Limits/remaining integration: independent memory stores are not shared replay protection. Redis Cluster remains unsupported; Sentinel failover and Mongo sharded/distributed-failure durability are not certified by these standalone/replica-set tests. Replay-admission bounds do not bound revocation lineage scans or backend latency; Mongo's serialization row is an explicit contention point, and bounded expired ledger rows can remain until later traffic. An exploratory strict check including the entire old memory `test/index.test.ts` still finds pre-existing fixtures omitting required rotation timestamps; that is not claimed as a passing all-existing-test typecheck. All new source/test graphs and installed declarations are strict-clean. The existing Vite config-loader warning remains non-fatal. Full repository final parity/load/integration review remains DBJWT-11/12.
- **Next handoff: DBJWT-07.** Use these real `reserveDpopProof` capabilities to derive the frozen `dpop:v1:` protection-space/key/JTI key and `(iat + age + skew) * 1000` expiry, verify preconditions before reservation, never release after downstream failure, and map every provider error/capacity to the approved private-observer/sanitized replay-unavailable contract. Implement shared nonce orchestration there. Later DBJWT-06/04/05 still own actual API/login/callback/exchange/refresh/logout enforcement, including consuming both match fields, expected session ID, rechecking returned session agreement and authenticating live/alias revocation context. All **41** DBJWT-01 HTTP lifecycle/API TODOs remain for those tasks. No DBJWT-07+ behavior, CHANGELOG, commit or unrelated access-router work was modified.

---

### Task DBJWT-09: Fingerprint recognition alternative (explicitly NOT PoP)

Status: completed

Assigned: isolated sequential DBJWT-09 agent (no nested agents).

Priority: P1

Suggested agent: full-stack engineer

Dependencies: DBJWT-02 (fingerprint posture), DBJWT-05 (refresh enforcement point)

Primary ownership:

- `packages/express-oidc-vault/src/index.ts` (refresh/exchange validation step — coordinate with DBJWT-05 owner)
- Backend wire-level recognition fixture for POST login/exchange/refresh; final browser example integration belongs to DBJWT-10 and is not a prerequisite for DBJWT-09 completion
- `packages/express-oidc-vault/README.md` + website docs
- `apps/oidc-vault-dpop-example/src/auth/device-fingerprint.ts` and deterministic adapter tests only; DBJWT-10 owns the app scaffolding and final real-browser integration

Finding:

Discussion proposed sending FingerprintJS `visitorId`/`deviceId` as a fingerprint. This is useful for recognizing browsers, device history, change detection, and risk signals, but it is **not** proof of possession: the identifier is observable/copyable and the open-source library itself warns about spoofing/reverse engineering.

References:

- `https://github.com/fingerprintjs/fingerprintjs/` (README Limitations/Security)
- `packages/express-oidc-vault/src/types.ts:70-80` (`session.metadata` portable domain)
- `packages/express-oidc-vault/src/index.ts:728-850` (refresh handler; hook `onSessionRefreshed` runs post-commit and is too late for enforcement)

Implementation requirements:

1. Keep FingerprintJS in the frontend; backend accepts a **generic** fingerprint signal (do not hard-depend on one vendor library). Example:
   ```ts
   // Frontend (illustrative)
   const agent = await FingerprintJS.load();
   const { visitorId } = await agent.get();
   // send X-Device-Fingerprint on POST login/exchange/refresh (D6)
   ```
2. Capture/hash the signal at POST login and persist D6's reserved recognition metadata at callback session creation (JSON-compatible portable domain); no enrollment at exchange/refresh.
3. Enforce comparison **before** upstream refresh-token use and before rotation (pre-commit, not in post-commit `onSessionRefreshed`).
4. Implement D6's fixed missing/mismatch re-login error, no automatic rotation/tolerance, and legacy unenrolled compatibility. API recognition/risk policy remains application-owned.
5. Document clearly: “fingerprint matching is recognition/change-detection, not theft prevention against deliberate copying.”

Acceptance criteria:

- Opt-in fingerprint capture/comparison works through the backend wire-level login/callback/exchange/refresh lifecycle; DBJWT-10 integrates that contract into the browser example.
- Missing-fingerprint on a fingerprinted session cannot bypass by omission.
- Docs explicitly disclaim PoP equivalence; no “device-bound” security claims for this path.
- Existing bearer/DPoP behavior unaffected when fingerprint check is off.

Execution baseline (2026-10-02): read the full plan/approved D1–D8, root `AGENTS.md`, DBJWT-04/05 handoffs and core metadata/hook/issuance code; loaded `task-as-you-go` and `ai-friendly-ts-package`. Dependencies are completed. Serial root `pnpm --filter @web-ts-toolkit/express-oidc-vault... build` passed; serial `pnpm --filter @web-ts-toolkit/express-oidc-vault test` passed **34 files / 1706 tests**, 47.56s. Scope is D6 backend recognition, its public options/shipped docs, and the standalone frontend adapter; DBJWT-10 retains final browser integration ownership.

Completion evidence (2026-10-02, isolated sequential DBJWT-09 agent; no nested agents):

- **Changed paths (DBJWT-09 only; 18 workspace files):**
  - New internal `packages/express-oidc-vault/src/fingerprint-recognition.ts`: frozen generic header policy, HTTP token/collision validation, bounded single-raw-field capture/hash, private exact version/hash snapshots, fixed errors, reserved metadata restoration that skips replacement getters. No backend vendor dependency or public runtime helper/subpath.
  - `packages/express-oidc-vault/src/{index,types,device-binding-policy,transaction-cookie,authorization-transaction,vault-session,token-issuance}.ts`: independent root-exported `OidcVaultFingerprintRecognitionOptions`/`OidcVaultOptions.fingerprintRecognition`, detached construction snapshots and six-capability fingerprint-only guard, POST registration/media/source/temporary-cookie reuse with DPoP disabled, frozen transaction metadata, callback propagation/precreate restoration, original-session exchange/refresh precommit matching and generation rechecks, private evidence excluded from issuer inputs/public profiles/responses. Existing DPoP verifier/replay/nonce implementation is reused unchanged.
  - New `packages/express-oidc-vault/test/fingerprint-recognition.test.ts`: **236 passing** real HTTP/provider/memory-store/crypto regressions in body/cookie and fingerprint-only/optional/required DPoP, counted single-use upstream refresh tokens, raw duplicate-header transport, construction/mutation/compatibility/privacy and live/alias/backchannel/API-policy checks.
  - `packages/express-oidc-vault/test-packed-consumer/consumer/{consumer-types.ts,consumer-types.cts,consumer.mjs,consumer.cjs}`: installed root-only positive/negative public declarations, strict generic frontend snippet, CJS construction and installed ESM fingerprint-only POST capture/absence/duplicates/proof rejection plus fingerprint-only and DPoP guarded exchange/refresh/alias logout in both transports, fixed missing/mismatch and upstream-call counts, metadata preservation and issuer evidence omission. Existing root-export/DPoP checks retained.
  - New `apps/oidc-vault-dpop-example/src/auth/device-fingerprint.ts` and `test/device-fingerprint.test.ts`: generic injected signal source plus optional structurally typed FingerprintJS load/get adapter; **38 deterministic tests**. No frontend app scaffolding, manifests, dependencies, or browser/backend runtime imports added.
  - `packages/express-oidc-vault/README.md`, `website/docs/packages/express-oidc-vault.md`: accurate D6 option/import/header/errors/POST-cookie/wire/issuer/hook/logout/API/privacy/retention/re-login contracts, generic frontend snippet and optional injected-vendor example. Final overall parity remains DBJWT-11.
  - This original task file: completion/status and precise next-owner handoff; section 8's frozen approved D1–D8 remains unchanged.
- **Acceptance behavior verified:**
  - A supplied POST-login signal alone enrolls `{ version: 1, hash: base64url(SHA-256(ASCII(signal))) }` in reserved transaction metadata, then the original callback session. Raw signals are not persisted. Transaction metadata/evidence is frozen before store handoff; headerless callback still requires the temporary cookie. Fingerprint-only HTTPS and HTTP-development cookie lifecycles pass without proof reservations. Absent POST, legacy GET and seeded pre-feature sessions stay unenrolled; later proof/signal/body/profile/hook fields cannot enroll them. Optional DPoP can enroll recognition without selecting a key; required DPoP cannot be satisfied by recognition.
  - Enrolled missing/mismatch gives fixed **403 `OIDC_VAULT_FINGERPRINT_REAUTH_REQUIRED`** before proof/nonce/reservation/guarded consume/upstream/rotation/hooks/issuer. Rejected code/session/cookie/provider token remains available; even the same otherwise-valid rejected proof can succeed on a matching-signal retry. Raw duplicates, empty/257-byte/non-ASCII/control inputs give fixed **400 `OIDC_VAULT_INVALID_FINGERPRINT`** without value/cause leakage. One valid 256-byte/raw printable signal, case-sensitive exact matching and custom-header selection pass. Core does not interpret commas inside one opaque raw value as a second field.
  - Original transaction/session snapshots survive changed raw-header getters/async request mutation, precreate removal/rebind/null/getter/metadata replacement, issuer and postcommit mutations, fresh ID/UserInfo claim injection, returned-store stripping/rebinding and refresh generation changes. Application metadata remains mutable; original lineage/subject/expiry/key survive rotation. Reserved recognition evidence is removed from issuer sessions (including nested portable data), public user profiles and wire responses. Issuer-extra result fields cannot leak it; recognition errors/log output contain no signal/hash. Malformed persisted evidence fails closed rather than becoming unenrolled. No `createSession` enrollment/upsert occurs at exchange/refresh.
  - Feature-off legacy bearer/DPoP paths, bound required-proof enforcement, no-local-issuer flows, nonce ordering and all earlier BOV tests pass. Recognition applies only to exchange/refresh: live/alias logout ignores recognition even when malformed, bound logout still requires the original key, signed backchannel logout remains proof-independent, API policy gains no fingerprint restriction. New POST login establishes a new value/session without rewriting or rotating the earlier session.
- **Commands/results** (every final focused/build/packed/full/lint/strict invocation issued serially, repository root unless stated):
  - Baseline build/core above. Before implementation, package-directory `pnpm exec vitest run --config ../../vitest.config.ts test/fingerprint-recognition.test.ts` → **40 intended failures / 2 legacy GET controls passed (42)**: no fingerprint-only POST, absent enrollment and unguarded missing/mismatch acceptance.
  - Broad focused runtime, package directory, fingerprint suite plus 16 relevant login/session/policy/issuance/API/BOV suites → exit 0, **17 files / 1286 passed**, 52.98s (before the final two frozen-transaction regressions). Final focused backend/frontend `pnpm exec vitest run --config vitest.config.ts packages/express-oidc-vault/test/fingerprint-recognition.test.ts apps/oidc-vault-dpop-example/test/device-fingerprint.test.ts` → exit 0, **2 files / 274 passed = 236 backend + 38 frontend**, 16.24s; no TODO/skip.
  - Final `pnpm --filter @web-ts-toolkit/express-oidc-vault... build` → exit 0; CJS **149.77 KB**, ESM **146.82 KB**, `index.d.ts`/`index.d.mts` **53.24 KB each**. Both declaration reads confirm the new root option/type, surviving JSDoc, and no internal helper/browser subpath exports.
  - Final focused packed, package-directory `pnpm exec vitest run --config ../../vitest.config.ts test/packed-consumer.test.ts` → exit 0, **1 file / 3 passed**, 17.08s: real publish transform, staged exact **7-file** `npm pack --dry-run --json`, installed CJS/ESM runtime, strict `skipLibCheck: false` NodeNext ESM/NodeNext CJS/Bundler consumers and both declaration-resolution traces.
  - Final `pnpm --filter @web-ts-toolkit/express-oidc-vault test` → exit 0, **35 files / 1942 passed**, 64.44s; **236 new passes** above the 1706 baseline, all existing BOV/legacy and packed checks pass, zero TODO/skip. Its prebuild also passed serially.
  - Final `pnpm exec eslint <15 changed source/runtime-test/packed/frontend paths listed above>` → exit 0, no errors/warnings. `pnpm exec tsc -p <repo-root>/_tmp/dbjwt-09-typecheck/tsconfig.json` → exit 0, **11 entries** plus transitive core/memory sources, ES2022/Bundler/strict/`skipLibCheck: false`; reuses the previously installed external DBJWT-03 `@types/supertest`, no new dependency/lock changes. Separate `tsconfig-browser.json` → exit 0 for frontend utility with only ES2022/DOM libraries and `types: []`, verifying no backend/Node ambient dependency. This is not a claim that the entire pre-existing legacy test typecheck is clean.
  - `git diff --check`, plus individual `git diff --no-index --check /dev/null <path>` for new/inherited untracked helper/test/frontend/task paths → exit 0. `git diff --exit-code HEAD -- CHANGELOG.md packages/express-oidc-vault/src/provider-client.ts packages/express-oidc-vault/package.json packages/express-oidc-vault/tsup.config.ts pnpm-lock.yaml` → exit 0. No CHANGELOG, user access-router, store implementation, provider/proof/algorithm/replay/API middleware, dependency/lock, commit, or nested-agent changes.
- Verification corrections: initial lint identified an unused fixture import; it became used by expanded mutation tests. Explicit `undefined` hit a fixture's default enrolled signal; changed its absent-login sentinel to `null`. GET remained correctly Bearer under optional DPoP, so the fixture now asserts original boundness rather than configured mode. Strict checking required an intentional invalid cookie fixture to cast through `unknown`. These fixture corrections were rerun cleanly; no failing acceptance assertion was skipped or relaxed.
- **DBJWT-10 frontend/precommit handoff:** reuse `src/auth/device-fingerprint.ts` as-is when constructing the approved private app and package test scripts. `createDeviceFingerprint(source, { headerName? })` returns frozen current-signal headers; `undefined` is an intentional unenrolled choice, collection errors are fixed failures. Optional `fingerprintJsSignalSource(() => FingerprintJS.load())` accepts structural `{ get(): Promise<{ visitorId: string }> }`, lazily shares load, runs `get()` for each operation and persists/caches no identifier. Add its header only to configured-vault POST login/exchange/refresh, alongside independent fresh DPoP proofs; never use it as an API sender constraint or required-proof fallback. Handle recognition 403 by clearing frontend auth and fresh login, not auto-rotation/retry. Login/exchange require credentials for the temporary cookie even in body transport; callback is headerless; cookie refresh retains source checks. **DBJWT-10 owns final real-browser redirect/reload/cookie/CORS/optional-recognition integration** and its frozen `jose`/`idb` dependencies; this task does not claim those checks.
- **Residual scope:** no DBJWT-09 blocker or new independent finding. Recognition remains copyable and deterministic hashing is not anonymization; retention follows transaction/session/store cleanup/backups (explicit session lifetime recommended). Original BOV-03 refresh-lease/cookie-ordering limits remain; preflight reads are not leases and direct application upserts are outside core's fresh-ID flow. DBJWT-08's live Redis/Mongo evidence is unchanged and was not rerun here; new wire checks use a real memory provider. Browser integration is DBJWT-10, final repository/website/artifact parity DBJWT-11 and independent review DBJWT-12. The existing Vite native-config-loader warning remains non-fatal.

---

### Task DBJWT-10: Frontend SPA client (key lifecycle + proofs + fetch wrapper)

Status: completed

Assigned: isolated sequential DBJWT-10 agent (no nested agents).

Priority: P1

Suggested agent: frontend engineer

Dependencies: DBJWT-02, DBJWT-04, DBJWT-05, DBJWT-06, DBJWT-07, DBJWT-08, DBJWT-09 (final end-to-end acceptance; current execution is sequential after DBJWT-09)

Primary ownership:

- Approved private example workspace `apps/oidc-vault-dpop-example`:
  - `src/auth/dpop-key-store.ts`
  - `src/auth/dpop-proof.ts`
  - `src/auth/auth-session.ts`
  - `src/auth/auth-fetch.ts`
  - local Express fixture under `server/`; no browser runtime code/imports in the backend package

Finding:

No frontend DPoP client exists. The current README frontend examples (`README.md:214-422`) are bearer-only (`Authorization: Bearer`, `sessionId` in body/cookie). A bound flow needs persistent keys, per-request proofs, and proof-aware login/refresh.

References:

- `packages/express-oidc-vault/README.md:34-117,214-430`
- RFC 9449 §4 (proof syntax), §7 (protected resource access)

Implementation requirements:

1. **Key lifecycle**:
   - Generate ES256/P-256 via Web Crypto, private key non-extractable.
   - Persist private `CryptoKey` + public JWK in IndexedDB (structured clone); survive redirects/reloads.
   - Create key **before** login initiation; reuse same key for callback/exchange/refresh/API.
   - Key loss → require fresh login; coordinate first creation across tabs (avoid competing keys).
   - Keep access token in memory; session handle in `sessionStorage` (body) or backend cookie (cookie mode).
2. **Proof generator**: fresh `jti`/`iat` per request; `htm`, `htu` (absolute URL w/o query/fragment), `ath` for API calls, `nonce` when challenged; `typ: dpop+jwt`, `alg`, public `jwk` header.
3. **Login/exchange/refresh updates**:
   - Call proof-aware login initiation, navigate to returned `authorizationUrl`.
   - Exchange local code with fresh proof from same key.
   - Refresh with fresh proof even when access token expired (no `ath` when no token presented, per DPoP semantics for token-endpoint usage).
4. **Fetch wrapper**:
   - `Authorization: DPoP <token>` + `DPoP: <proof>`; fresh proof on every attempt including retries.
   - Bounded `DPoP-Nonce` retry; refresh-then-regenerate-proof flow; refresh deduplication (per-context promise minimum; cross-tab if sessions shared).
   - Replayable bodies on retry; scope credentials/headers to configured API origins.
   - Honor `tokenType: 'DPoP'`; never silently fall back to bearer for bound sessions.
   - Cookie mode: `credentials: 'include'` where needed.
5. **CORS**: backend must allow `Authorization` + `DPoP`, expose `DPoP-Nonce` / `WWW-Authenticate` if client reads challenges.
6. Use the approved D8 `jose` + `idb` dependencies and private example APIs; implement Web Locks/BroadcastChannel coordination for shared cookie-session refresh as specified there.

Acceptance criteria:

- Key survives OIDC redirect + reload; loss forces re-login (tested).
- Every API retry uses a fresh proof; stale-proof retry does not reuse `jti`.
- Refresh with expired access token succeeds using persisted key.
- Cross-tab behavior documented/tested where sessions shared.
- Example is copy-pasteable and matches the final backend contract (no drift with README website docs).

Execution baseline (2026-10-02, isolated sequential DBJWT-10 agent; no nested agents): read the entire task/frozen approved D1–D8 and all prior completion handoffs, root `AGENTS.md` (only applicable instructions), app/Vite/test conventions, final backend routes/DTOs/target normalization/issuance/errors and the existing DBJWT-09 frontend adapter/tests. Loaded `task-as-you-go` and `ai-friendly-ts-package`. Serial root `pnpm --filter @web-ts-toolkit/express-oidc-vault... build && pnpm --filter @web-ts-toolkit/express-oidc-vault test` passed **35 files / 1942 tests**, 64.39s. The private app initially contains only the preserved fingerprint helper and its 38 deterministic tests. The existing PDF-reader browser harness uses Playwright; DBJWT-10 adds a navigation-capable programmatic Playwright/Vitest harness for the real SPA, IndexedDB, OIDC redirect and cookie/CORS flows. DBJWT-11/12 retain final parity/independent integration ownership.

Completion evidence (2026-10-02, isolated sequential DBJWT-10 agent; no nested agents):

- **Changed paths (DBJWT-10 only; 47 workspace paths = 44 app additions + 3 integration/documentation updates):**
  - `apps/oidc-vault-dpop-example/{package.json,.gitignore,.env.example,index.html,README.md,tsconfig.app.json,tsconfig.node.json,tsup.config.mjs,vite.config.ts,vitest.config.ts,vitest.browser.config.ts}`: exact private name **`oidc-vault-dpop-example`**, Vite/TypeScript SPA, strict browser/server/test configs, bundled plain-Node ESM server, serialized scripts and executable local/external-IdP instructions.
  - `apps/oidc-vault-dpop-example/src/{main.ts,style.css,recognition.ts}`: full sign-in/IdP navigation/callback/bootstrap/API/expired-token refresh/logout UI, body/cookie transport selection and unchecked optional disclosed generic language/platform recognition.
  - `apps/oidc-vault-dpop-example/src/auth/{dpop-key-store.ts,dpop-proof.ts,auth-session.ts,auth-fetch.ts,index.ts,key-database.ts,scope.ts,credentials.ts,nonce-cache.ts,errors.ts,wire.ts}`: four intended copyable exports, real key/proof/session/fetch implementation, original-key and exact DPoP response contract, nonce/target/scope/error primitives and copied wire DTOs. Browser runtime depends only on local modules, **`jose` + `idb`**; no Express/backend browser import/subpath/public frontend package.
  - `apps/oidc-vault-dpop-example/server/{app.ts,index.ts,local-idp.ts,cors.ts,http.ts}`: named package-root backend imports, required DPoP vault + request-aware API with the real memory store, exact credentialed CORS, environment-configured IdP and deterministic owned local provider with real RSA ID tokens/PKCE/state/nonce/UserInfo/single-use refresh tokens. Test-only credentials/request evidence remains in owned fixture memory, never normal dev logging.
  - `apps/oidc-vault-dpop-example/test/{auth-fetch.test.ts,credentials.test.ts,docs-consumer.test.ts,dpop-proof.test.ts,runtime-server.test.ts,server.test.ts,wire-contract.test.ts}`: **72 new** Node/WebCrypto/integration/type/doc/runtime passes. Existing `src/auth/device-fingerprint.ts` and `test/device-fingerprint.test.ts` are preserved byte-for-byte and used; their **38** passes bring the app unit total to **110**.
  - `apps/oidc-vault-dpop-example/test/browser/{harness.ts,page-bridge.ts,lifecycle.browser.ts,retries.browser.ts,tabs.browser.ts,features.browser.ts,built.browser.ts}`: programmatic Playwright/Vitest controller and test-only in-page bridge, actual SPA/IdP/backend listeners with disposable browser contexts, **21 scenarios per browser**. No fake-IDB/jsdom-only browser evidence.
  - `pnpm-lock.yaml`: new workspace importer/`idb@8.0.3` plus pnpm's required Vitest peer-graph snapshots (**80 added / 4 removed** lines); no existing package version upgrades. `apps/*` already covers the app, so workspace configuration needs no edit.
  - `packages/express-oidc-vault/README.md`: as-built private-app link, runnable local commands and bound helper snippet, clarified separate default bearer section and accurate completed-browser/remaining distributed-refresh limits. This task file: status, evidence and precise DBJWT-11/12 handoff. Core production/provider/store source and previous user access-router/website/task work were not edited by DBJWT-10.
- **Key/security/runtime acceptance:**
  - Web Crypto creates ES256/P-256 **non-extractable private CryptoKey**, exports only the public four-field JWK, structured-clones private key + public JWK/jkt into IndexedDB under `[frontendOrigin, backendOrigin, normalizedBasePath]`, and validates persisted key/pair before credential use. Four browser tabs barrier-hold four real candidates after each observed absence, then release into one IndexedDB readwrite read/add: exactly one jkt wins; all private-key exports fail and all tabs/reloads retain it. Different mounts select distinct keys.
  - Fresh `login()` alone may create a missing key, before POST/navigation. Actual top-level local IdP document → backend callback redirect → frontend exchange, reload/refresh, API and logout all use the initiating jkt. Selected-row deletion, whole database deletion and replacement with a different valid persisted key stop before refresh/API credentials and require fresh login; no Bearer/ephemeral-key/rebinding fallback.
  - Access JWTs remain memory-only. Body handle `{ sessionId, jkt }` and pending-login jkt marker use scoped sessionStorage; cookie handle remains backend HttpOnly. The local issuer excludes the opaque vault handle from browser-readable JWT claims (no vault sid); browser assertions check that handle is absent from token claims as well as transport JSON. IndexedDB cookie coordination rows are only `{ jkt, generation, active }`, with no token/handle/recognition identifier. Browser storage dumps check actual winner JWT and HttpOnly cookie value are absent. Callback code is removed with `history.replaceState` before asynchronous exchange.
  - Every proof carries fresh **128-bit Web Crypto base64url JTI**, integer current iat, exact htm/canonical htu, `typ: dpop+jwt`, ES256 and public JWK; only API includes exact ASCII SHA-256 ath. Canonicalizer parity tests use the actual backend target implementation, including case/default ports/dot/unreserved/reserved escapes/Unicode/query-fragment removal. Real signed proofs are independently verified in unit/browser evidence.
  - API fetch owns Authorization/DPoP, honors exact DPoP plus matching server JWT cnf, rejects outside origins/header overrides, pins credentials to configured APIs and uses `redirect: 'error'`. One nonce retry **total**, at most one refresh/retry, fresh proof each attempt; only its own `DPoP error="invalid_token"` challenge triggers refresh. Generic proof errors/403/503/unrelated Bearer challenge/network/redirect failure do not. Strings/URLSearchParams/Blob/FormData/buffers/views replay from snapshots; retry-enabled streams reject before credential requests. Mutating requests default to one attempt; real authorized idempotent PUT proves original body × three attempts (invalid-token → nonce → success), one refresh and one resource assignment. Unsafe POST gets no implicit retry.
  - Cookie refresh is per-context single-flight plus same-origin scope Web Lock/BroadcastChannel coordination. Two real tabs with expired JWTs and delayed single-use upstream refresh race **12 calls → one upstream refresh/winner JWT**, then regenerate four distinct API proof JTIs across their two nonce retries. New same-key tab obtains a live token from peer memory without upstream refresh. Current key/generation/expiry/recognition are checked on delivery; delayed clears cannot erase another context's new pending login, and logout clears peer memory. This is browser coordination, not a backend distributed lease.
  - The preserved current fingerprint adapter enrolls at POST login and sends current headers only on login/exchange/refresh. Both transports reject enrolled omission without upstream refresh; new login enrolls a changed signal. Cookie tabs with missing/changed current signal cannot bypass recognition by borrowing a winner JWT: real backend 403, no upstream use, no automatic re-enrollment/retry. UI/README disclose copyable recognition, collection/8-hour session retention/store-backup limits and hashing not anonymization; no fingerprint API sender constraint.
  - Real CORS preflight/challenge reads cover explicit Origin/credentials and **Content-Type, Authorization, DPoP, X-Device-Fingerprint**; **DPoP-Nonce / WWW-Authenticate** are exposed. Missing Web Crypto/IndexedDB/Web Locks/BroadcastChannel gives fixed explicit failure before credentials. Production Vite bundle graph includes jose/idb and rejects backend/Node/server modules; actual built SPA runs cookie OIDC→reload/refresh→API with real key export failure. Plain Node runs `dist/server/index.mjs` in fixture and external-env modes without extensionless-import failure.
- **Exact as-built wire / docs handoff:**
  - Example mounts **`/auth/oidc/body`** and **`/auth/oidc/cookie`** (configurable common prefix). `POST <mount>/login` JSON `{ returnTo? }`, original-key proof, optional current recognition and **credentials include in both transports** → `200 { authorizationUrl }`, then navigate. Headerless `GET <mount>/callback` authenticates the temporary cookie and redirects to frontend `/callback?transport=…&code=…`.
  - `POST <mount>/exchange` JSON `{ code }`, temporary cookie/**include** in both transports, same key and current recognition → `{ accessToken, tokenType: 'DPoP', expiresIn, user, sessionId? }`, clears temporary cookie; cookie JSON always omits sessionId. `POST <mount>/refresh` and `/logout`: body `{ sessionId }`/omit credentials or cookie `{}`/**include**; original-key proof, **no Authorization/ath**. Refresh rereads recognition and rotates; logout needs no fingerprint and returns `{ loggedOut: true }`. API **`GET /api/profile`** uses `Authorization: DPoP <JWT>` + fresh proof/ath and returns `{ subject, scope, binding }`.
  - Core default mount stays `/auth/oidc`; frontend `basePath` must match its exact public mount. Example API replayNamespace is **`oidc-vault-dpop-example-api`**, publicPathPrefix omitted because Express req.originalUrl already includes `/api`; a truly stripped proxy prefix is application configuration. Nonce off by core default, enabled by demo: fixed vault **400** / API **401** `OIDC_VAULT_USE_DPOP_NONCE`, one exposed header, once-only new-proof retry.
  - Local commands are documented in `apps/oidc-vault-dpop-example/README.md`; SPA **127.0.0.1:4317**, backend **4318**, fixture IdP **4319**. `.env.example` and server `IDP_MODE=external` reuse `resolveOidcVaultConfigFromEnv` (issuer discovery or complete manual endpoints), pinned callbacks for both mounts, matched VITE/server origins/basePath and optional canonical >=32-byte base64url JWT/nonce secrets. The app deliberately expects a configured local issuer; backend no-issuer flows remain supported separately.
- **Commands/results** (repository root unless stated; all builds/package prebuilds strictly serialized):
  - Baseline core build/test above → **35 files / 1942 passed**, 64.39s. `pnpm install --filter oidc-vault-dpop-example --prefer-offline` → exit 0; needed once for app workspace links/new idb, existing dependency/peer warnings are not build/test failures. `pnpm --filter oidc-vault-dpop-example exec playwright install firefox webkit` installed pinned browser revisions; Chromium was already cached.
  - Standalone **`pnpm --filter oidc-vault-dpop-example... build`** and final test prebuild → exit 0, ordered core/memory/app. Core JS/declarations **149.77 / 146.82 / 53.24 KB**, memory **26.57 / 25.47 / 1.08 KB**; final app Vite **74 modules**, `dist/client/index.html` **0.41 kB**, CSS **0.65 kB**, JS **40.54 kB / gzip 14.67 kB**, bundled **`dist/server/index.mjs` 15.81 KB**. Browser/server/test `strict` + `skipLibCheck: false` typechecks pass; browser config has no Node ambient types.
  - Final **`DPOP_TEST_BROWSERS=chromium,firefox pnpm --filter oidc-vault-dpop-example test`** → exit 0; full app/dependency build/typechecks passed, then **8 unit files / 110 passed**, 4.11s, followed by **5 browser files / 42 passed (21 per engine)**, 74.98s; zero TODO/skip in passing runs. This final run followed the JWT-handle exclusion and startup-button correction. Unit inventory: **27 auth-fetch + 25 proof/target + 12 credentials + 3 server + 2 built-server + 2 wire DTO + 1 actual README extraction/typecheck + 38 preserved fingerprint = 110**. Browser inventory: **12 lifecycle + 16 retry/expiry/recognition + 4 tab + 8 feature + 2 built-SPA = 42**. Earlier pre-final app run also passed 110/42 (4.30s/75.14s).
  - Verified runtime engines via Playwright **1.62.1**: **Chromium 151.0.7922.34** (revision 1234), **Firefox 153.0** (revision 1538); controller Node **26.7.0**, pnpm **11.18.0**, Vitest **4.1.11**, Vite **8.2.1**, jose **6.2.10**, idb **8.0.3**, TypeScript **6.0.3**.
  - Final **`pnpm --filter @web-ts-toolkit/express-oidc-vault test`** → exit 0, **35 files / 1942 passed**, 63.68s; includes all legacy/BOV/scaffold and **3 packed consumer checks** (staged file list, real CJS/ESM and strict declaration consumers). No core source change or regression. Existing native-config-loader warning remains non-fatal.
  - **`pnpm --filter oidc-vault-dpop-example lint`** → exit 0, no errors/warnings; **root `pnpm lint`** → exit 0, no errors/warnings. Final test-only correction replaced accidental raw NUL in new non-ASCII fixtures with actual escaped `\u00e9`; focused `pnpm --filter oidc-vault-dpop-example typecheck && pnpm --filter oidc-vault-dpop-example exec vitest run --config vitest.config.ts test/dpop-proof.test.ts && pnpm --filter oidc-vault-dpop-example lint` → exit 0, **1 file / 25 passed**, 0.291s. It changes no runtime bundle/browser behavior.
  - `git diff --check` and `git ls-files --others --exclude-standard -z -- apps/oidc-vault-dpop-example | xargs -0 -I '{}' git diff --no-index --check /dev/null '{}'` → exit 0; the latter covers all **46 final app paths**, including preserved files. `git diff --exit-code HEAD -- CHANGELOG.md packages/express-oidc-vault/package.json packages/express-oidc-vault/tsup.config.ts` → exit 0. No CHANGELOG/commit/revert/nested-agent work. Test-owned browser contexts/processes/listeners and temporary built/docs outputs close/remove in teardown; installed standard browser caches remain available.
- Verification corrections (no weakened/skipped acceptance assertions): initial strict checks identified missing tsup config declaration dependencies (config moved to untyped build-only `.mjs`, strict app/server source checks retained), page callback dynamic-import SSR rewriting (test-only native in-page module bridge), heterogeneous fixture inference and an unused argument. HTTP redirect chains do not commit callback documents, so assertions use real navigation requests while the IdP now commits an actual provider document. Browser tests exposed a delayed cross-context clear erasing a new pending login; clearing is now lock/generation guarded and preserves other pending markers. Final review added transient current-recognition peer matching, challenge-scheme association, full 128-bit JTI generation, barrier-enforced key-creation races and actual production/Node entry checks. A final review also removed the opaque vault handle from local JWT claims to preserve cookie HttpOnly authority. Its first full rerun passed all unit checks but **41/42 browser tests**, with one Chromium initial-login navigation timeout; the focused lifecycle then passed **6/6**. The UI now disables the login button until startup settles (and while initiating), and the harness includes current-status diagnostics; the complete final build/unit/browser rerun above passed **110/42**, followed by clean root lint/diff checks. No retry/skip was added to mask a browser failure.
- **Limitations / remaining owners:** no DBJWT-10 implementation blocker. Optional **WebKit 26.5 revision 2336 could not launch**: `DPOP_TEST_BROWSERS=webkit pnpm --filter oidc-vault-dpop-example exec vitest run --config vitest.browser.config.ts test/browser/lifecycle.browser.ts` → failed before execution with missing host **libgtk-4-1, libgstreamer-plugins-bad1.0-0, libflite1, libavif16, gstreamer1.0-libav**; Vitest consequently reported 4 unexecuted/skipped cases, not passing evidence. No WebKit/Safari certification is claimed. Chromium/Firefox cover real cross-origin **same-site loopback** cookie behavior; arbitrary HTTPS cross-site/third-party-cookie deployment and external provider availability are not certified by that fixture.
  - Memory-store restart loses sessions; body handles are tab-local and must not be copied/opener-cloned as shared refresh authority. Browser coordination is limited to the same frontend origin/storage partition/scope; a missing token peer or uncertain network outcome can require another serialized refresh. DPoP/client locks still do not solve BOV-03-FU1/FU2 backend lease/cookie ordering across independent frontends/instances; stateless JWT logout lifetime and same-browser XSS limitations remain documented. Redis/Mongo live evidence remains DBJWT-08's unchanged handoff.
  - **Next: DBJWT-11**, synchronize `website/docs/packages/express-oidc-vault.md` (its previous DBJWT-10-ownership sentence remains historical/stale), final shipped README/JSDoc/declaration/packed artifact parity and whole-repository checks. Use the actual app README/snippet extraction test, exact mounts/namespace/exports/commands above and absolute GitHub links in the shipped README; the helpers remain private app APIs. **DBJWT-12** then performs independent full-surface integration review. Full root build/test/artifact certification belongs to those next tasks, not this scoped app evidence. Frozen D1–D8 are unchanged.

---

### Task DBJWT-11: Docs, packaging, and consumer compatibility

Status: completed

Assigned: isolated sequential DBJWT-11 agent (no nested agents).

Priority: P1

Suggested agent: docs/package engineer

Dependencies: DBJWT-03 through DBJWT-10 (docs reflect as-built contracts)

Primary ownership:

- `packages/express-oidc-vault/README.md`
- `packages/express-oidc-vault/package.json`, `tsup.config.ts`, `dist/` declarations
- `packages/express-oidc-vault/test-packed-consumer/`
- `website/docs/packages/express-oidc-vault.md` (parity only; shipped README is primary per `ai-friendly-ts-package` skill)

Finding:

Per `ai-friendly-ts-package` skill, installed consumers see `package.json` + `dist` declarations + `README.md`. New option/validator/store-method types, `tokenType: 'DPoP'`, and request-aware validator interfaces must be discoverable via declarations and README; website docs are secondary consistency checks.

References:

- `packages/express-oidc-vault/README.md` (full; esp. 119-192 options table, 776-864 issuer contract, 874-1030 API middleware, 1148-1168 checklist)
- `packages/express-oidc-vault/dist/index.d.ts`
- Skill: `ai-friendly-ts-package` (metadata → declarations → README → JSDoc order)

Implementation requirements:

1. Update shipped README:
   - Opt-in configuration + `optional` vs `required` semantics + legacy migration.
   - End-to-end frontend snippet (key → login → exchange → API → refresh) matching DBJWT-10.
   - Fingerprint section with explicit non-PoP disclaimer (DBJWT-09).
   - Security checklist deltas (short-lived tokens still required; XSS can invoke same-browser keys; logout/revocation semantics for bound sessions).
   - Error-code additions (`invalid_dpop_proof`, `use_dpop_nonce` handling, mismatched binding codes).
2. Add JSDoc on new public options/validator/store interfaces so it survives into emitted `.d.ts`.
3. Verify `package.json`/`tsup` exports unchanged or explicitly updated; no new deep-import paths unless exported/documented.
4. Run `npm pack --dry-run` file-list check; run packed CJS/ESM + strict declaration consumers (`test-packed-consumer/`) green.
5. Sync website docs to avoid drift; do not rely on website as primary consumer doc.

Acceptance criteria:

- Installed consumer can answer: how to import, which options enable binding, canonical `DPoP` import/fetch shape, shortest happy-path example, peer/runtime assumptions — from `node_modules` alone.
- `npm pack --dry-run` list sane; packed consumers pass under NodeNext/Bundler strict settings.
- README/website/dist-types agree on new contracts.

Execution audit (2026-10-02): read the entire plan, unchanged frozen D1–D8 and all completion evidence; root `AGENTS.md` is the only applicable instruction file. Loaded `ai-friendly-ts-package` and `task-as-you-go`; inspected package metadata/exports/tsup, source/public declarations, all shipped core/store READMEs, website pages, and the app helpers/server/README. Dependencies 03/08/07/06/04/05/09/10 are completed. Confirmed DBJWT-11 gaps: no self-contained bound issuer/API quickstart or installed-only persistent-browser recipe; stale website alias/issuer/GETDEL/stronger-store guidance; Mongo's ESM declaration condition and all provider engine minimums need metadata parity. Work is sequential; verification evidence below will record fresh runs, separately from prior task counts.

Completion evidence (2026-10-03, isolated sequential DBJWT-11 agent; no nested agents):

- Read the full task file including frozen approved D1–D8 (section 8) and all prior completion evidence, plus root `AGENTS.md`. Loaded/applied the `ai-friendly-ts-package` skill in metadata → exports → declarations → README → JSDoc order and the `task-as-you-go` skill for this record. Did not modify any `CHANGELOG.md`; did not commit; preserved unrelated worktree changes (pre-existing `access-router*` modifications intact). All package builds/tests were run strictly serially (never concurrent per-package pre-builds).
- Changed paths (DBJWT-11 only; 6 files):
  - `packages/express-oidc-vault-memory-store/README.md`: Main Exports now states both ESM (`import`, `index.d.mts`) and CJS (`require`, `index.d.ts`) declaration conditions are shipped.
  - `packages/express-oidc-vault-redis-store/README.md`: same declaration-conditions sentence added.
  - `packages/express-oidc-vault-mongodb-store/README.md`: same declaration-conditions sentence added (fixes the Mongo ESM-declaration parity gap vs its website page, which already carried it).
  - `website/docs/packages/express-oidc-vault-memory-store.md`: API section carries the same shipped declaration-conditions sentence (parity, shipped README stays primary).
  - `website/docs/packages/express-oidc-vault-redis-store.md`: same parity sentence.
  - This task file: DBJWT-11 status/completion evidence; frozen D1–D8 unchanged.
- Coverage audit (requirements 1–5): the shipped core README and website core page already satisfied opt-in `optional`/`required` + legacy-migration tables, the complete bound issuer/API quickstart, the installed-only persistent-browser recipe (standalone body-transport client + `createOidcVaultDpopSession`/`fetchWithDpop` copyable-helper snippet matching the app's four exports in `apps/oidc-vault-dpop-example/src/auth/index.ts`), the explicit fingerprint non-PoP disclaimer, security-checklist deltas, and the full fixed error-code tables — verified by heading/snippet inventory and the packed README-compilation consumer below. No further core README/website-core edits were needed; prior-task prose was verified, not rewritten. Stale website guidance from the audit (alias/issuer/GET/stronger-store) was verified fixed: no `stale-alias` deletion text remains, live/alias revocation-context logout is documented, issuer/client verbatim matching is documented, legacy GET vs proof-aware POST login is documented, and all six stronger-store capabilities are documented. Provider engine minimums verified in metadata and docs: `engines.node >=22.12.0` in core + all three store `package.json` files, Redis minimum 6.2 + Sentinel/Cluster topology in shipped + website Redis docs, MongoDB replica-set/sharded transaction topology + `ready()` in shipped + website Mongo docs.
- JSDoc/declarations (skill order): fresh core build emits `dist/index.d.ts` + `dist/index.d.mts` with **131 `/**`blocks**;`OidcVaultDeviceBindingOptions`, `OidcVaultApiDeviceBindingOptions`, `OidcVaultDpopBinding`, `OidcVaultVerifiedDpopBinding`, `OidcVaultFingerprintRecognitionOptions`, `OidcVaultDeviceBindingStoreProvider`, `OidcVaultRequestAwareAccessTokenValidator`, `OidcVaultAccessTokenConfirmation`, `OidcVaultTransactionCookieOptions`, `OidcVaultLoginInitiationInput/Result`, and `tokenType: 'DPoP'` all present with surviving JSDoc in both declaration conditions.
- Packaging (skill order): `package.json`/`tsup` exports verified unchanged — single root entry `src/index.ts`, CJS+ESM, `exports` contains only `"."`, no new deep-import paths; `grep` over shipped/app/website docs finds no `@web-ts-toolkit/express-oidc-vault/` deep imports. `npm pack --dry-run --json` in `packages/express-oidc-vault` lists a sane **6-file** source artifact (`README.md`, `dist/index.d.mts`, `dist/index.d.ts`, `dist/index.js`, `dist/index.mjs`, `package.json`); the packed-consumer harness stages the real publish transform (moves `dist/` to root, adds `LICENSE`) and asserts the exact staged **7-file** list. Memory-store source pack likewise lists a sane 6 files.
- Fresh verification (all serial; repository root unless stated; counts are this agent's own runs, not copied):
  - `pnpm --filter @web-ts-toolkit/express-oidc-vault... build` → exit 0; CJS **149.77 KB**, ESM **146.82 KB**, `index.d.ts`/`index.d.mts` **55.05 KB each**.
  - `pnpm --filter @web-ts-toolkit/express-oidc-vault test` → exit 0; **35 files / 1942 passed**, 64.57s (includes all legacy/BOV/scaffold suites and the 3 packed-consumer checks).
  - Focused packed consumer, `packages/express-oidc-vault`: `pnpm exec vitest run --config ../../vitest.config.ts test/packed-consumer.test.ts` → exit 0; **1 file / 3 passed**, 33.90s (real publish-manifest transform incl. `index.d.mts`/`index.d.ts` conditions and contract strings, staged `npm pack --dry-run --json` exact 7-file list, installed CJS/ESM runtime + strict NodeNext ESM/NodeNext CJS/Bundler declaration consumers incl. both declaration-resolution traces, installed-README snippet typechecks under NodeNext/Bundler/browser configs, and installed `docs-runtime.mjs` ESM+CJS proof/auth checks that compile the shipped README browser snippet against installed core + memory packages).
  - `pnpm --filter @web-ts-toolkit/express-oidc-vault-memory-store test` → exit 0; **3 files / 123 passed**, 9.74s (store touched only by a README sentence; runtime suites re-verified serially). Redis/Mongo live suites were not rerun: no store runtime code was changed in DBJWT-11 (README/website prose only); DBJWT-08's live Redis 6.2/7.2 + Mongo replica-set evidence stands.
  - `npm pack --dry-run --json` (core source + memory source) file-list sanity as above; no unintended files.
  - Focused lint over the 5 changed README/website paths: `pnpm exec eslint <paths>` → exit 0 (markdown paths report ignore-pattern warnings only, no errors). `git diff --check` → exit 0. `git diff --exit-code HEAD -- CHANGELOG.md` paths untouched; no `CHANGELOG.md` modified. Website `docusaurus build` not run: the two website edits are single prose sentences with no frontmatter/MDX/import changes, so no build-config impact; recorded as not-run with rationale rather than claimed.
- Parity notes: shipped core README remains primary; website core page mirrors the DPoP server, modes/migration, POST/callback/exchange/refresh/logout, fingerprint (non-PoP), API policy, error tables, checklist, and store contracts without drift found. All three shipped store READMEs and website store pages agree on guarded-record exact/null matching, revocation context, replay/capacity bounds, alias/issuer/identity guidance, Redis 6.2/Sentinel/Cluster posture, Mongo transactions/replica-set/`ready()` posture, and now the ESM/CJS declaration conditions. Frontend parity: shipped README standalone client compiles against browser libs only (packed consumer asserts no `@web-ts-toolkit/express` import in browser snippets); the copyable-helper snippet uses the app's actual `createOidcVaultDpopSession`/`fetchWithDpop` endpoints, mounts, transports, and `replayNamespace` (`oidc-vault-dpop-example-api`).
- Residual risks / handoff to DBJWT-12: no new P0 found in DBJWT-11. Known carryovers for the independent reviewer: (a) WebKit/Safari remains uncertified (missing Linux host libraries, per DBJWT-10); (b) BOV-03-FU1/FU2 refresh-lease/cookie-ordering, stateless-JWT logout lifetime, third-party-cookie/cross-site HTTPS deployment specifics, and Redis Sentinel-failover / Mongo sharded durability remain deployment-specific and are documented as such; (c) full-repo `pnpm test`/`pnpm lint`/`pnpm build` certification and any Redis/Mongo live re-verification the reviewer wants belong to DBJWT-12 — this task ran the scoped serial core + memory + packed checks above, not the whole-repo matrix. Next: **DBJWT-12** independent integration review.

---

### Task DBJWT-12: Final independent integration review

Status: completed (independent reviewer session 2026-10-03; Waves 2-7 implementer evidence taken as input, re-verified at runtime below; no nested agents spawned)

Priority: P0

Suggested agent: independent reviewer (not the implementer of Waves 2–7)

Dependencies: DBJWT-01 through DBJWT-11

Primary ownership:

- Full `express-oidc-vault*` surface + docs + stores + frontend example

Finding:

Device binding touches auth-critical paths (login/callback/exchange/refresh/logout/API/middleware/stores). A single-path review is insufficient; cross-path bypass (bearer fallback, `mapClaims` strip, legacy-record downgrade, form-post exchange, cookie-transport interplay) must be explicitly probed.

Implementation requirements:

Reviewer must verify:

1. Each acceptance criterion in DBJWT-01…DBJWT-11 against runtime behavior (not code reading alone).
2. Security boundaries across alternate entry paths:
   - body vs cookie transports;
   - JSON vs urlencoded exchange posts;
   - missing vs wrong vs replayed proofs;
   - legacy unbound records in both modes;
   - `mapClaims` / custom issuer / custom validator permutations.
3. Public types, JSDoc, emitted declarations, README, and website agree.
4. No internal data (refresh tokens, private keys, full JWKs beyond protocol-required public `jwk` header, store internals) crosses external boundaries or logs.
5. Request-controlled recursion/collection inputs remain bounded (proof size, JWK size, header count).
6. Targeted, package, full-repo (`pnpm test` serialized; `pnpm lint`; `pnpm build`), and packed-artifact checks pass as applicable.
7. Deferred work (upstream IdP DPoP, hardware attestation, advanced nonce/rotation policies) lists rationale + residual risk.

Acceptance criteria:

- Reviewer sign-off with commands, results, and residual risks recorded in this file.
- No P0 open; any new finding becomes a new `DBJWT-13+` task with priority/owner/acceptance criteria (do not silently expand scope).
- Definition of done (below) satisfied.

Reviewer sign-off (2026-10-03, independent DBJWT-12 session; no nested agents; no source/CHANGELOG/commit changes by reviewer; unrelated `access-router*` worktree changes preserved):

- Per-criterion verdicts (each re-verified at runtime in this session, not by code reading alone):
  - DBJWT-01 (scaffolding/matrix): PASS. `test/dpop-device-bound.regression.test.ts` retains its 8 active no-config legacy/anti-enrollment controls and exact named references for all 41 original scenarios; zero TODO/skip registrations remain in the core suite (full core run: 35 files / 1942 passed).
  - DBJWT-02 (contract freeze): PASS. Section 8 D1–D8 unchanged by every later task; public names/bounds/errors in `src/types.ts` and `dist/index.d.ts`/`index.d.mts` match the frozen contract verbatim (verified by declaration grep: all D1/D5/D6 interfaces, `'Bearer' | 'DPoP'`, six stronger-store capabilities present).
  - DBJWT-03 (policy/issuance): PASS. Focused suites `dpop-device-binding-policy` + `dpop-token-issuance` pass inside the green core run; `tokenType: 'DPoP'` + `cnf.jkt` issuance and required-preflight-before-mutation behavior covered by the 402-test vault-session matrix (green).
  - DBJWT-08 (stores): PASS with one environmental exception (see DBJWT-13). Memory 3 files / 123 passed; Redis 11 / 336 passed (standalone re-run this session); Mongo 5/6 files, 140/141 — every substantive live test passes including `test/dpop.test.ts` 28/28 (guarded matching, independent-client races, TTL, capacity, BSON migration). The single failure is the packed-consumer _subprocess handshake_ (`MongoPoolClearedError`/`MongoNetworkTimeoutError beforeHandshake`, 4 identical occurrences), never an assertion failure.
  - DBJWT-07 (replay/nonce): PASS. `dpop-replay` + `dpop-nonce` green in core run; independent probe this session: `-t "replay"` 160 passed, `-t "nonce"` 113 passed across API/replay/nonce suites.
  - DBJWT-06 (API enforcement): PASS. `dpop-api` (164) + `dpop-proof` (92) + `dpop-jwt-confirmation` (26) green; probes: Bearer-downgrade 10 passed, mapClaims-strip 2 passed (+19 `custom`-adapter tests passed), 8192/2048 bound edges 2 passed, duplicate-header rejection covered in the passing proof suite.
  - DBJWT-04 (login/callback binding): PASS. `dpop-login-callback` green; probes: legacy-record matrix 40 passed (login+session suites), transferred-callback/stolen-code named tests pass (see DBJWT-05 probes).
  - DBJWT-05 (exchange/refresh/logout): PASS. `dpop-vault-session` 402/402 green; probes this session: `form` 48 passed (JSON + urlencoded guarded exchange in both transports), `urlencoded` 2 passed, `stolen` 4 passed, `wrong-key` 9 passed — mismatched-key attempts preserve live records/upstream tokens and honest retry succeeds per the passing assertions.
  - DBJWT-09 (fingerprint recognition): PASS. 236/236 green in core run; fixed 403 re-login / 400 malformed-signal / no-enrollment-at-exchange semantics asserted by the passing suite; docs in README + website carry the explicit non-PoP disclaimer (verified by grep in both).
  - DBJWT-10 (frontend SPA): PASS. Example unit 8 files / 110 passed; full example `pnpm test` 8/110 + 5 browser/21 passed; independent Chromium lifecycle spot-check this session 6/6 (real redirect, IndexedDB key persistence, cookie, reload). Firefox not re-run this session (DBJWT-10 Chromium 151 + Firefox 153 evidence stands); WebKit remains uncertified by host-library limitation (pre-existing, documented).
  - DBJWT-11 (docs/packaging): PASS. `npm pack --dry-run --json` lists the sane 6-file source artifact; both declaration conditions carry 131 `/**` JSDoc blocks each; `exports` root-only, no deep imports; shipped README (primary) and website agree on DPoP server/modes/migration, POST/callback/exchange/refresh/logout, fingerprint non-PoP, API policy, error tables, checklist, store contracts (spot-verified: error codes, `fetchWithDpop`/`createOidcVaultDpopSession`, `tokenType: 'DPoP'` present in both).
- Security-boundary verification (requirements 2/4/5):
  - Transports: honest bound lifecycle passes in body AND cookie; Origin/Referer enforced for POST login + guarded exchange in both (48 form-probe passes across `TRANSPORTS × MODES × ENCODINGS`).
  - Encodings: JSON and urlencoded exchange posts guarded identically (cookie + fresh original-key proof required for bound codes).
  - Proofs: missing proof on bound credentials → `OIDC_VAULT_DPOP_REQUIRED`; wrong key/signature/method/URL/ath/stale → `OIDC_VAULT_INVALID_DPOP_PROOF`; replayed proof → same 401 with no key oracle; replay reservations retained after downstream failure (all asserted by passing suites).
  - Legacy records: `optional` permits unbound use without enrollment (supplied proofs still validate/reserve); `required` rejects before mutation; disabled mode rejects bound records closed (40 legacy-probe passes).
  - `mapClaims`/custom issuer/custom validator: verified `cnf` snapshotted before mapping; mapper-supplied confirmation ignored; bound Bearer fails even with valid proof; DPoP use of unbound token fails as invalid access token, never enrollment (mapClaims 2 + custom 19 probes pass).
  - Leakage: regression suite asserts `response.body.refreshToken` undefined and no `upstream_refresh:` in wire text (passing); code grep finds no `console.*log` of secrets in `src/` (only token-field _names_ in provider-client validation); error path keeps raw claims/keys/URLs/upstream/store diagnostics in private `onError` `cause` only; `Cache-Control: no-store` on all vault/middleware responses; proof `jwk` header is the protocol-required public key only (private fields rejected by bounds).
  - Bounds: proof ≤8192 wire bytes, protected-header/JWK ≤2048 decoded bytes, JTI 1–128 printable ASCII, nonce ≤512, fingerprint signal ≤256 printable ASCII, replay namespace 1–128 ASCII, capacity default 100000 with bounded 64-node expiry cleanup, duplicate DPoP headers rejected via raw-header count (implementation greps + 92 proof tests incl. exact 2048/8192 edges all green).
- Commands with results (all builds/tests strictly serialized; never concurrent per-package pre-builds):
  - `pnpm --filter @web-ts-toolkit/express-oidc-vault... build` → exit 0 (CJS 149.77 KB, ESM 146.82 KB, declarations 55.05 KB each).
  - `pnpm --filter @web-ts-toolkit/express-oidc-vault test` → exit 0, **35 files / 1942 passed** (twice this session: standalone + inside full-repo run).
  - `pnpm --filter @web-ts-toolkit/express-oidc-vault-memory-store test` → exit 0, **3 / 123**.
  - `pnpm --filter @web-ts-toolkit/express-oidc-vault-redis-store test` → exit 0, **11 / 336** (standalone; live Redis 6.2/7.2 harnesses green).
  - `pnpm --filter @web-ts-toolkit/express-oidc-vault-mongodb-store test` → **5/6 files, 140/141**; sole failure = packed-consumer live-subprocess Mongo handshake timeout (environmental; see DBJWT-13). Live `test/dpop.test.ts` alone → **28/28 passed**.
  - `pnpm --filter oidc-vault-dpop-example test` → exit 0, **8 unit files / 110 + 5 browser files / 21**; plus Chromium-only lifecycle spot-check **6/6**.
  - Focused cross-path probes (this session, all exit 0): urlencoded 2, form 48, stolen 4, mapClaims 2, Bearer 10, 8192-edge 2, legacy 40, replay 160, wrong-key 9, nonce 113, custom-adapter 19.
  - `pnpm lint` (repo root) → exit 0, no errors/warnings.
  - `pnpm build` (repo root) → exit 0, 163 build-success markers, no failures.
  - Full-repo `pnpm test` (serialized, `--workspace-concurrency=1`) → EXIT 1 with the **sole** failure being the mongo packed-consumer handshake above; every executed group passed (**182 files / 5033 tests**, incl. core 1942 + memory 123 + mongo-partial 140). Serial bail meant post-mongo packages did not execute in that run, so each was run individually serially afterwards, all exit 0: http-errors 72, moo 153, express-response-handler 215, express-json-router 44, message-service 336, access-router 856, access-router-client 909, access-router-runtime 135, access-router-deco 563, access-router-react 263, react-vite 3, oidc-vault-dpop-example 110+21, redis-store 336. Session total ≈ 9049 passing tests; zero product-assertion failures.
  - `npm pack --dry-run --json` (core + memory) → sane 6-file lists; `git diff --check` → exit 0; no `CHANGELOG.md` modified; no commits made.
- Deferred work with rationale + residual risk (requirement 7 — confirmed documented, not just in this task file):
  - Upstream IdP DPoP (approved D2): app-local only; IdP tokens/UserInfo remain Bearer/server-held, browser proofs never forwarded (README + website). Residual: a compromised upstream refresh token is still bearer — contained server-side, never exposed to browsers.
  - Hardware attestation: out of scope; DPoP binds a browser profile/key, not a physical device (README security checklist + website). Residual: same-browser XSS can invoke the key; key export is non-extractable but usage-oracle remains.
  - Advanced nonce/rotation policies: nonce off by default, secret rotation issues fresh challenges, no previous-secret lists (documented); BOV-03-FU1 refresh lease / FU2 cookie ordering remain proposed follow-ups — different honest fresh proofs can still race a single-use upstream family; browser single-flight is not a distributed lease (README + boundary-review link).
  - Stateless JWT logout lifetime, WebKit/Safari uncertified, third-party-cookie/cross-site deployment specifics, Redis Sentinel-failover / Mongo sharded durability: all documented as deployment-specific residual risks.
- Residual risks / blocked items (no P0; no scope expansion; no source fixes needed):
  - BLOCKED (owner: maintainer/CI re-run): mongo-store packed-consumer live-subprocess handshake (`MongoNetworkTimeoutError beforeHandshake` → `PoolClearedError`) fails deterministically **in this session only** (passed at DBJWT-08; no source changes since; substantive live coverage green). Tracked as DBJWT-13 (P2).
  - Firefox browser run and website `docusaurus build` not re-run this session (DBJWT-10/11 evidence stands; website edits were prose-only with no frontmatter/MDX changes).
  - `git status` shows only intended DBJWT workspace changes plus pre-existing unrelated `access-router*`/website/task modifications, all preserved; reviewer made zero source edits.
- Definition-of-done check: default bearer unchanged (all pre-existing suites green) ✓; optional/required semantics enforced ✓; wrong-browser/stolen-code/downgrade/replay fail closed in both transports ✓; three stores persist + atomically match + pass conformance/live harnesses (modulo the environmental packed-subprocess item above) ✓; frontend example demonstrates persistence/fresh-proofs/refresh-after-expiry/nonce-retry/CORS ✓; README + declarations + packed consumers + website agree, pack sane ✓; build/lint/package/serialized-repo/packed checks pass except the one recorded blocked item ✓; sign-off recorded here with residual risks ✓. **No P0 open → DBJWT-12 completed.**

### Task DBJWT-13: Re-verify mongo packed-consumer live subprocess on CI / unloaded host (environmental follow-up, NOT a product defect)

Status: completed (harness-only fix verified green by isolated sequential DBJWT-13 agent; no nested agents)

Priority: P2

Suggested agent: maintainer / infra

Dependencies: DBJWT-12 (sign-off recorded; this is verification hygiene, not a sign-off blocker)

Primary ownership:

- `packages/express-oidc-vault-mongodb-store/test/packed-consumer.test.ts` (harness only; no product-code change expected)
- Disposable `mongodb-memory-server` replica-set + temp-dir packed consumer (`consumer.mjs` plain-`node` subprocess with default driver timeouts)

Finding:

In the DBJWT-12 session (2026-10-03), `MDB-09 packed MongoDB store contract > loads packed CJS/ESM roots and exercises live guarded replay/capacity across independent Mongo clients` failed 4/4 attempts with `MongoNetworkTimeoutError: connection 9 … timed out (beforeHandshake: true)` → `PoolClearedError` inside the spawned `node consumer.mjs <ephemeral-uri>` subprocess, while in-process tests against the same `mongodb-memory-server` mechanism pass (`test/dpop.test.ts` 28/28, full store suite 140/141). The same test passed at DBJWT-08 completion and no store/core source changed afterwards (DBJWT-11 touched README/website prose only; reviewer touched nothing). Signature matches resource/timing flake on a loaded host (39 node/mongo processes, ~1.7 GB free) rather than a binding-semantics regression: zero assertion failures, failure at driver handshake before any guarded-replay assertion executes.

References:

- `packages/express-oidc-vault-mongodb-store/test/packed-consumer.test.ts:270-293` (subprocess spawn, 180s test timeout, default `MongoClient` timeouts)
- DBJWT-12 sign-off above for the four occurrence logs

Implementation requirements:

1. Re-run `pnpm --filter @web-ts-toolkit/express-oidc-vault-mongodb-store test` on CI or an unloaded host; confirm the packed-consumer file passes unmodified.
2. If it flakes again under load, consider harness-only hardening (e.g. explicit `serverSelectionTimeoutMS`/`connectTimeoutMS` in the temp consumer, subprocess retry, or staged-install reuse) — without changing guarded-match/replay/capacity product semantics or packed artifact contents.
3. Do not weaken any guarded-replay/capacity assertion to make the harness pass.

Acceptance criteria:

- The mongo store suite passes unmodified (6 files / 141 tests) in a clean CI run, or a harness-only fix lands with the suite green and product assertions intact.
- This task file records the outcome; DBJWT-12 sign-off is not reopened unless a product-assertion failure appears.

Re-verification evidence (2026-10-03, isolated sequential DBJWT-13 sub-agent; no nested agents; no source/CHANGELOG/commit changes; unrelated worktree changes preserved):

- Command (repository root, serial, no concurrent per-package pre-builds): `pnpm --filter @web-ts-toolkit/express-oidc-vault-mongodb-store test` → exit 1; **Test Files 5 passed / 1 failed (6); Tests 140 passed / 1 failed (141)**; Duration 62.23s (tests 159.26s). Pre-builds serial: `express-oidc-vault` CJS 149.77 KB / ESM 146.82 KB / declarations 55.05 KB each, mongodb-store CJS 37.82 KB / ESM 36.45 KB / declarations 3.69 KB each — all green.
- Exact error signature (same as DBJWT-12, zero assertion failures): `MDB-09 packed MongoDB store contract > loads packed CJS/ESM roots and exercises live guarded replay/capacity across independent Mongo clients` failed at `test/packed-consumer.test.ts:290` (`run test/packed-consumer.test.ts:62`) after 33959ms: spawned `node consumer.mjs mongodb://127.0.0.1:43487/?replicaSet=testset packed-esm-7d0587a4` crashed with `PoolClearedError [MongoPoolClearedError]: Connection pool for 127.0.0.1:43487 was cleared because another operation failed with: "connection 9 to 127.0.0.1:43487 timed out"`, `[cause]: MongoNetworkTimeoutError: connection 9 to 127.0.0.1:43487 timed out` (`beforeHandshake: true`, labels `HandshakeError`/`ResetPool`), mongodb driver 6.21.0, Node.js v26.7.0. Failure is at driver handshake inside the temp-dir packed-consumer subprocess before any guarded-replay/capacity assertion executes; no product assertion was weakened or changed.
- Product assertions intact: focused live in-process run in `packages/express-oidc-vault-mongodb-store` — `pnpm exec vitest run --config ../../vitest.config.ts test/dpop.test.ts` → exit 0, **1 file / 28 passed (28)**, 19.02s. Full-suite 140 passes include all other live guarded-match/replay/capacity/conformance coverage.
- Host load context at re-verification: `free -h` Mem 31Gi total / 15Gi used / 2.4Gi free / 14Gi buff-cache; `uptime` load average 3.92/3.77/3.68, up 16:24; 32 CPUs; `/` 70% used. Loaded dev host (VSCode server, opencode, language servers resident), consistent with timing-sensitive ephemeral `mongodb-memory-server` replica-set handshake flake, not a binding-semantics regression.
- Action taken: recorded outcome only. Per task rules, no harness edit was made (harness-only hardening remains optional for maintainer/CI and must not change product semantics or packed artifact contents); no assertion weakened; no product file touched (`git diff --check` scope limited to this task file; no CHANGELOG/commit).
- DBJWT-12 sign-off stays closed: no product-assertion failure appeared, so no reopen is needed. DBJWT-13 remains blocked pending a clean CI/unloaded-host re-run.

Harness-fix verification evidence (2026-10-03, isolated sequential DBJWT-13 agent; no nested agents; all builds/tests strictly serial, never concurrent per-package pre-builds):

- Unmodified retry reproduced the flake first (no pass-on-retry): `pnpm --filter @web-ts-toolkit/express-oidc-vault-mongodb-store test` → exit 1, **5/6 files, 140/141**, same `MongoNetworkTimeoutError beforeHandshake → PoolClearedError` at `test/packed-consumer.test.ts:290` in spawned `node consumer.mjs <ephemeral-uri>`; zero assertion failures; `test/dpop.test.ts` 28/28 green. No product-code change was made at any point in this session.
- Root-cause diagnosis (plain-`node` repro scripts outside vitest, removed afterwards): the failure is NOT host-load-dependent (reproduced on an idle host, load ~0.2–1.0). Minimal dual-`MongoClient` probes against a fresh `mongodb-memory-server` replica set connect in ~170ms, but the exact packed consumer spawned via blocking `execFileSync` fails deterministically (8/8, exactly ~30.3s each) while the disposable mongod wedges globally: fresh and `directConnection` connects also time out, in-process pings get 0 responses, CLOSE-WAITs pile up on mongod. Spawning the identical consumer via async `execFile`/`spawn` (parent event loop alive) passes in ~1s (4/4). Cause: the blocking spawn stalls the parent loop while the disposable mongod is live, so `mongodb-memory-server`'s piped mongod stdout/stderr stops draining, the OS pipe buffer fills, mongod blocks on write, and every handshake wedges. A client-side timeout/retry alone cannot fix this — the retry runs while the loop is still blocked and fails identically (verified: 60s budget + retry still failed twice).
- Harness-only fix, single file `packages/express-oidc-vault-mongodb-store/test/packed-consumer.test.ts` (all new code marked `DBJWT-13`; no `src/`, packed-artifact, assertion, or `CHANGELOG.md` change; no commit; unrelated `access-router*`/website worktree changes preserved):
  - new `runAsync` (`execFile`-based) used ONLY for the two live consumer spawns; sync `run()` retained for pack/install/tsc steps that have no live mongod. The parent loop now keeps draining mongod's pipes during the subprocess run.
  - explicit bounded handshake budget in the temp `consumer.mjs`/`consumer.cjs` clients: `serverSelectionTimeoutMS: 60000, connectTimeoutMS: 30000` (both finite and documented inline; `socketTimeoutMS` untouched so operation semantics are unchanged).
  - at most ONE retry per consumer subprocess, only on the handshake/pool-cleared signature (`MongoNetworkTimeoutError|MongoPoolClearedError|PoolClearedError|beforeHandshake|HandshakeError`); product assertion failures never match and are never retried.
  - Scope note: async spawn goes one step beyond the three anticipated mechanisms in the requirements above, but stays inside the governing harness-only constraints (no product-semantics, artifact-content, or assertion change); recorded here for maintainer review.
- Exact green results (repository root unless stated):
  - `pnpm exec vitest run --config ../../vitest.config.ts test/packed-consumer.test.ts` (package dir) → exit 0, **1 file / 3 passed**, 18.98s (was 103s failing).
  - `pnpm --filter @web-ts-toolkit/express-oidc-vault-mongodb-store test` → exit 0, **6 files / 141 passed**, 58.13s; immediate rerun → exit 0, **6 files / 141 passed**, 54.92s (two consecutive greens; logs contain zero `MongoServerSelectionError|PoolClearedError|beforeHandshake` occurrences).
  - `pnpm exec vitest run --config ../../vitest.config.ts test/dpop.test.ts` (package dir) → exit 0, **28/28 passed**, 17.72s (guarded-match/replay/capacity product assertions intact and unweakened).
  - `pnpm exec eslint packages/express-oidc-vault-mongodb-store/test/packed-consumer.test.ts` → exit 0; `git diff --check` (repo-wide) → exit 0; no `CHANGELOG.md` in the diff; no commit.
- One observed transient (recorded, not hidden): a full-suite run started immediately back-to-back with the isolated packed run reported 105 passed / 36 skipped / 1 error (exit 1); the identical code went fully green on the immediate rerun and stayed green on the confirmation rerun. Attributed to back-to-back run contention (prior run teardown vs next run startup), not to the harness change; no product-assertion failure in any run of this session.
- DBJWT-12 sign-off stays closed (no product-assertion failure appeared in any run), so no reopen is needed. DBJWT-13 acceptance criteria satisfied → completed.

## 7. Dependency and sequential execution guidance

- DBJWT-02's approval gate is resolved: D1–D8 are frozen in section 8. Current execution uses separate isolated agents sequentially: **03 → 08 → 07 → 06 → 04 → 05 → 09 → 10 → 11 → 12**.
- DBJWT-03 precedes DBJWT-08 (public types), which precedes DBJWT-07/06/04/05 (portable store primitives before enforcement).
- DBJWT-04 and DBJWT-05 share `src/index.ts` hotspots (`createCallbackHandler`, `createExchangeHandler`, `createRefreshHandler`); execute sequentially.
- DBJWT-07 precedes DBJWT-06; DBJWT-06 supplies the shared proof verifier consumed by DBJWT-04/05. This avoids completing proof acceptance without replay protection or a circular API/replay dependency.
- Primitive tasks verify their owned policy/store/orchestration contracts; integrated HTTP matrices activate in the later handler tasks. In particular, DBJWT-03 does not wait for DBJWT-04/05/06, DBJWT-07 does not wait for DBJWT-06, and DBJWT-04 does not wait for DBJWT-05's exchange route.
- DBJWT-08 touches three store packages + conformance suite; do not run concurrently with other store-contract edits. It owns atomic consume, replay reservation, and revocation-context provider methods; DBJWT-07 owns their core orchestration.
- DBJWT-09 follows DBJWT-05’s final exchange/refresh handler shape and verifies backend wire behavior; browser example integration follows in DBJWT-10, avoiding an implicit 09↔10 acceptance dependency.
- DBJWT-10 follows DBJWT-09 in this run; the approved contract permits independent frontend preparation in a future allocation, but backend/recognition completion remains its final acceptance prerequisite.
- DBJWT-11 waits for as-built behavior; DBJWT-12 is strictly last.
- `pnpm test` must stay serialized (`--workspace-concurrency=1`); do not run multiple per-package pre-builds concurrently (shared `dist/` race noted in `AGENTS.md`).

Suggested roles (separate sequential agents for this execution):

| Agent                | Owns                         | Notes                                                             |
| -------------------- | ---------------------------- | ----------------------------------------------------------------- |
| Architect/maintainer | DBJWT-01, DBJWT-02           | Baseline + approved contract freeze                               |
| Independent reviewer | DBJWT-12                     | Separate reviewer, strictly after DBJWT-11                        |
| Backend auth         | DBJWT-03, DBJWT-04, DBJWT-05 | Sequential; owns `src/index.ts` hotspot                           |
| API/security         | DBJWT-07, DBJWT-06           | Replay foundation, then shared proof verification/API enforcement |
| Store                | DBJWT-08                     | All three providers + conformance                                 |
| Full-stack           | DBJWT-09                     | Fingerprint recognition only                                      |
| Frontend             | DBJWT-10                     | SPA client + examples                                             |
| Docs/package         | DBJWT-11                     | After as-built freeze                                             |

## 8. Approved maintainer decisions and deferred scope

All DBJWT-D1–D8 were explicitly approved as one bundle. The detailed contract below is frozen; implementation follows it rather than selecting from the original alternatives.

- **DBJWT-D1 — Approved**: `deviceBinding` optional/required policy, immutable thumbprint binding, DPoP issuance/request-aware API interfaces, proof profile/bounds/defaults, configured public origins, and fixed errors below.
- **DBJWT-D2 — Approved deferral**: upstream IdP DPoP remains out of this milestone. A separately approved follow-up would need discovery (`dpop_signing_alg_values_supported`), provider proof generation/nonce handling, token types, and DPoP UserInfo; current upstream Bearer behavior is retained.
- **DBJWT-D3 — Approved**: JSON POST login plus random HttpOnly transaction cookie; cookie-authenticated headerless callback and cookie/key-authenticated exchange, with fixed Origin and lifecycle policies.
- **DBJWT-D4 — Approved**: sender-constrained exchange/refresh/logout including live handles and rotation aliases; signed backchannel logout unchanged.
- **DBJWT-D5 — Approved**: portable optional base-store capabilities/required stronger interface in all built-ins, atomic exact/null matching, shared bounded replay, fail-closed errors/capacity, and revocation context; no implicit core replay fallback.
- **DBJWT-D6 — Approved**: opt-in generic `fingerprintRecognition`, POST capture and pre-mutation matching, re-login on enrolled mismatch, legacy unenrolled compatibility; recognition never substitutes for PoP.
- **DBJWT-D7 — Approved**: optional stateless bounded HMAC nonces for DPoP-bearing vault POSTs/APIs, fixed challenge/retry/expiry behavior, nonce off by default.
- **DBJWT-D8 — Approved**: private `apps/oidc-vault-dpop-example`, browser helpers outside backend, `jose` + `idb`, and browser/cross-tab integration checks.

### Decision notes — DBJWT-02 approved contract bundle (2026-10-02)

**Approved and frozen without design changes.** This is the exact D1–D8 bundle originally proposed by this agent, including its interfaces, defaults/bounds, sanitized errors, and corrected sequence. It supersedes earlier illustrative alternatives in task requirements/findings. Explicit approval provenance is recorded at the end of this section; a fresh maintainer decision is required to change the public contract.

#### D1 — Opt-in policy, proof profile, issuance, and API contract

Approved public configuration/types (root exports; declarations/JSDoc required):

```ts
type OidcVaultDeviceBindingMode = 'optional' | 'required';
type OidcVaultDpopAlgorithm = 'ES256' | 'PS256' | 'RS256';
interface OidcVaultDpopBinding {
  type: 'dpop';
  jkt: string;
}
interface OidcVaultVerifiedDpopBinding extends OidcVaultDpopBinding {
  alg: OidcVaultDpopAlgorithm;
}
interface OidcVaultDpopNonceOptions {
  secret: Uint8Array;
  lifetimeSeconds?: number;
}
interface OidcVaultDpopProofOptions {
  algorithms?: readonly OidcVaultDpopAlgorithm[];
  proofMaxAgeSeconds?: number;
  clockSkewSeconds?: number;
  nonce?: false | OidcVaultDpopNonceOptions;
}
interface OidcVaultDeviceBindingOptions extends OidcVaultDpopProofOptions {
  mode?: OidcVaultDeviceBindingMode;
}
interface OidcVaultApiDeviceBindingOptions extends OidcVaultDeviceBindingOptions {
  publicOrigin: string;
  publicPathPrefix?: string;
  replayNamespace: string;
  replayStore: OidcVaultDpopReplayStore;
  now?: () => number;
}
// New options:
// OidcVaultOptions.deviceBinding?: OidcVaultDeviceBindingOptions
// OidcVaultAccessTokenMiddlewareOptions.deviceBinding?: OidcVaultApiDeviceBindingOptions
```

- Omitted `deviceBinding` disables initiation/acceptance of new DPoP flows and preserves existing unbound behavior. With the object present, omitted `mode` means `optional`: unbound records remain usable; a supplied login proof selects binding. `required` rejects unbound login/transaction/code/session/JWT use before mutation/provider calls. Neither enabling optional mode nor presenting a proof later upgrades a legacy record. Boundness is persisted by `deviceBinding` presence, not by the current mode; encountering a bound record/JWT with the feature disabled fails closed. No `legacyPolicy` downgrade switch.
- Persist `deviceBinding?: OidcVaultDpopBinding` on transactions, exchange codes, and sessions; persist `browserBindingHash?: string` on transactions/codes. Store only the canonical RFC 7638 SHA-256 `jkt` (43 base64url characters), not a JWK/private key or a historical enforcement mode. Check the proof algorithm against current policy on every request. Binding is immutable across callback/refresh/rotation; core retains a private snapshot across mutable hooks/issuer calls. Security-owned binding and recognition fields cannot be removed/rebound by a profile mapper or precreate hook.
- Defaults: proof algorithms `['ES256']`, age **60 seconds**, skew **5 seconds**, nonce **off**. Supported proofs: ES256/P-256; explicitly enabled PS256/RS256 with RSA modulus **2048–4096 bits**. Reject `none`, MAC/`oct` keys, other algorithms/curves, private JWK fields, remote-key headers, and unsupported critical headers. Local access-token signing algorithms remain separately configured and may still use HS256; they are not DPoP proof algorithms.
- Construction validates a nonempty allowlist, age integer **1–300**, skew integer **0–30**, and immutable plain-option snapshots. Proof JWT limit **8192 bytes**, decoded protected header/JWK limit **2048 bytes**, `jti` **1–128 printable ASCII bytes** (browser generates at least 128 random bits), `nonce` at most **512 bytes**. Reject duplicate/comma-joined DPoP headers using raw-header multiplicity; do not let Express header joining hide duplicates. Require `typ: dpop+jwt`, a verified signature, exact method, normalized public URL, and finite nonnegative integer `iat`. Accept `nowSeconds - age - skew < iat <= nowSeconds + skew`.
- `IssueTokenInput.deviceBinding?: Readonly<OidcVaultVerifiedDpopBinding>` is the authoritative verified context. Extend `tokenType?: 'Bearer' | 'DPoP'`: unbound issuance keeps Bearer/omitted semantics; bound issuance requires exact `'DPoP'` and a compact signed JWT carrying matching `cnf.jkt`. Core checks this payload contract by decoding the **trusted issuer's result**, not by treating unverified decoding as authentication; APIs independently verify the signature/issuer/audience/expiry. Invalid bound results use existing 500/issuance rollback. An omitted `tokenIssuer` remains supported and emits no local token fields.

API validator extension:

```ts
interface OidcVaultAccessTokenConfirmation {
  jkt: string;
}
interface OidcVaultAccessTokenRequestInput {
  token: string;
  scheme: 'Bearer' | 'DPoP';
  req: Request;
}
interface OidcVaultRequestAwareAccessTokenValidationResult extends OidcVaultAccessTokenValidationResult {
  confirmation: OidcVaultAccessTokenConfirmation | null;
}
interface OidcVaultRequestAwareAccessTokenValidator extends OidcVaultAccessTokenValidator {
  validateWithRequest(
    input: OidcVaultAccessTokenRequestInput,
  ): Promise<OidcVaultRequestAwareAccessTokenValidationResult>;
}
// Base validator gains optional validateWithRequest; base result gains optional
// confirmation. Auth context gains deviceBinding?: Readonly<OidcVaultVerifiedDpopBinding>.
```

- No binding config: continue calling legacy custom `validate(token)` with exactly one argument. Binding-enabled API middleware requires `validateWithRequest` at construction and calls it for both schemes. A request-aware validator must derive mandatory `confirmation` from verified token/introspection data: `null` means genuinely unbound; malformed/unsupported `cnf` is invalid, never legacy. The JWT helper implements both methods and snapshots raw verified `cnf` **before** `mapClaims`; it discards mapper-supplied confirmation and uses that snapshot. Its legacy result leaves confirmation absent for unbound JWTs but includes it for a bound JWT, so ordinary vault middleware also refuses Bearer downgrade.
- The API middleware performs the shared proof/nonce/replay checks after token validation, before `req.auth`/`onAuthContext`/`next`. Bound JWTs require both `Authorization: DPoP <token>` and one `DPoP` header, including `ath = base64url(SHA-256(ASCII(token)))`. Bearer use of a bound JWT fails even with a proof; DPoP use of an unbound JWT fails. Existing bearer hook-veto semantics remain. Validators are trusted adapters and must faithfully report binding; signature-only third-party middleware does not enforce this contract.
- Vault proof URLs use pinned **`backendOrigin`** plus the externally visible request path; API proof URLs use required **`publicOrigin`** plus `publicPathPrefix` (default empty) and `req.originalUrl` pathname. Origins must be static HTTP(S) origins; enabled binding requires HTTPS except loopback HTTP development. `publicPathPrefix` is empty or a normalized absolute path prefix without query/fragment; `replayNamespace` is a nonempty static printable ASCII string, max 128 bytes. Strip query/fragment, normalize scheme/host/default port/dot segments/unreserved escapes consistently, uppercase remaining percent escapes, and preserve reserved path escapes. Accept origin-form request paths only; concatenate onto the pinned origin, never resolve a `//host` path as an authority. Never derive origin from `Host`, `Forwarded`, or `X-Forwarded-*`. Vault proxies must preserve the configured public mount path; API stripped prefixes are configured explicitly.

#### D2 — Upstream scope

Approved: **app-local JWT + vault-session sender constraint only**. Upstream provider tokens/UserInfo remain Bearer and server-held; browser proofs are never forwarded to IdP endpoints. Upstream DPoP discovery, proof keys/nonces, token types, and UserInfo belong to a separately approved follow-up.

#### D3 — POST initiation AND random transaction cookie

- Add **`POST <basePath>/login`**, registered when `deviceBinding` or `fingerprintRecognition` is configured. Require `application/json` with body `{ returnTo?: string }` (other media types: 415 `OIDC_VAULT_UNSUPPORTED_REQUEST_BODY_TYPE`), response **`200 { authorizationUrl: string }`** (`OidcVaultLoginInitiationResult`); `returnTo` comes only from the body and uses the existing same-frontend-origin validation. The key comes only from a **verified DPoP header**, never an unproved JWK/jkt/body field. Required mode requires the proof; optional mode permits an unbound POST when absent but rejects an invalid supplied proof. Fingerprint-only initiation is unbound and rejects a supplied DPoP header. Existing `GET /login` remains the unchanged unbound redirect in disabled/optional mode; required mode rejects it before discovery/transaction creation. GET never binds a key by query parameter/header shortcut.
- All new POST flows create a **fresh 32-byte random HttpOnly transaction cookie**, storing only its SHA-256 `browserBindingHash` beside the selected key binding. Validate Origin (or valid Referer fallback) against `backendOrigin + trustedOrigins` for POST login and guarded exchange in **both** session transports, before proof/state work. No source origin, `null`, or an untrusted origin fails closed. Validate proof/nonce/reserve replay before discovery/transaction allocation; set the cookie only after successful transaction persistence. Keep PKCE/state/OIDC nonce unchanged.
- Exact option: `OidcVaultOptions.transactionCookie?: OidcVaultTransactionCookieOptions`, with `name?: string` and `sameSite?: 'lax' | 'none'`. Defaults: HTTPS name **`__Host-oidc_vault_transaction`**, HTTP name **`oidc_vault_transaction`**, `SameSite=Lax`, host-only, `Path=/`, HttpOnly, Secure for HTTPS. No Domain, Strict, path, or HttpOnly/Secure opt-out. `None` requires HTTPS and is an explicit cross-site SPA choice; validate cookie-prefix rules and distinct session/transaction names. Multiple vault mounts need distinct configured transaction names. Parse only the selected cookie; duplicate selected names, malformed values, or a value other than the canonical 32-byte base64url secret fail as invalid browser binding. Existing session-cookie parsing remains separate.
- Headerless `GET /callback` reads state and selected cookie, preflights the record, then **atomically consumes only the matching cookie hash + stored binding** before upstream token exchange/session creation. It does not pretend the navigation supplies a DPoP proof. Missing/wrong cookie or required-mode legacy record does not spend the transaction or create a session/code. A provider-error callback also authenticates state/cookie before spending/clearing a guarded transaction and returns a fixed sanitized callback-error message.
- Successful callback copies binding/hash into the exchange code and keeps the cookie, shortening its deadline to the exchange-code expiry. **Exchange requires both that cookie and a fresh proof from the initiating key** for bound codes, atomically matching before consumption. Cookie Max-Age/Expires track transaction TTL (existing 10-minute default), then code TTL (30-second default), rounded down without extending the record deadline. Clear on successful exchange or an authenticated terminal failure; mismatches neither spend records nor clear cookies. Abandoned cookies/records expire. A single cookie supports one pending flow per browser/vault mount: a new initiation replaces it, earlier flows can fail and require restart; no unbounded per-state cookies. Body transport still uses this temporary cookie for login/exchange.

#### D4 — Sender-constrained refresh/logout, including aliases

- Bound exchange/refresh/logout require the same `jkt`, fresh request proof, nonce if configured, and successful shared replay reservation before issuance, upstream refresh-token use, hooks, rotation, or revocation. Vault endpoints authenticate the existing code/session-handle body or cookie authority and **do not use an Authorization access token or require `ath`**, so refresh/logout work after local JWT expiry. A supplied proof in an enabled optional unbound flow must still validate/reserve replay but cannot enroll/rebind that record. Cookie refresh/logout retain their existing Origin/Referer checks. Backchannel remains signed-logout-token authenticated.
- Logout must enforce binding on **live handles and unexpired rotation aliases**. Use the D5 revocation-context method to resolve the surviving lineage's immutable provider/binding, then check identity/proof and revoke that logical lineage. Built-ins also inspect this context when binding is disabled, rejecting a bound alias rather than downgrading it; fully unbound no-config logout retains its existing live/alias behavior. `getSession` still never authenticates an alias. No target means idempotent `200 { loggedOut: true }` without lineage deletion; a mismatch leaves session/cookie unchanged. Do not use the current unconditional stale-alias `deleteSession` fallback for a possibly bound lineage. Local-before-upstream logout ordering remains; stateless local JWTs are not revoked by vault logout.

#### D5 — Portable guarded consumes and shared replay; no implicit fallback

```ts
interface OidcVaultRecordBindingMatch {
  deviceBinding: OidcVaultDpopBinding | null;
  browserBindingHash: string | null;
}
interface ConsumeAuthorizationTransactionIfMatchesInput {
  state: string;
  match: OidcVaultRecordBindingMatch;
}
interface ConsumeExchangeCodeIfMatchesInput {
  code: string;
  expectedSessionId: string;
  match: OidcVaultRecordBindingMatch;
}
interface ReserveDpopProofInput {
  replayKey: string;
  expiresAt: number;
}
interface OidcVaultDpopReplayStore {
  reserveDpopProof(input: ReserveDpopProofInput): Promise<boolean>;
}
interface OidcVaultSessionRevocationContext {
  logicalSessionId: string;
  provider?: OidcVaultProviderMetadata;
  deviceBinding?: OidcVaultDpopBinding;
}
// OidcVaultDeviceBindingStoreProvider extends OidcVaultStoreProvider and requires:
// getAuthorizationTransaction(state): Promise<AuthorizationTransaction | null>
// consumeAuthorizationTransactionIfMatches(input): Promise<AuthorizationTransaction | null>
// getExchangeCode(code): Promise<ExchangeCodeRecord | null>
// consumeExchangeCodeIfMatches(input): Promise<ExchangeCodeRecord | null>
// getSessionRevocationContext(sessionId): Promise<OidcVaultSessionRevocationContext | null>
// reserveDpopProof(input): Promise<boolean>
```

- Add these methods as **optional capabilities on the base store interface**, required on `OidcVaultDeviceBindingStoreProvider`. All three built-ins implement them and return the stronger provider type (Mongo also retains `ready()`). New opt-in vault configuration fails at construction if capabilities are absent; old custom bearer stores still compile/run. Core uses its configured provider's replay method; API uses explicit `replayStore` (normally that same provider or a compatible shared service). No core-only Map fallback and no multi-instance security claim for independent memory stores.
- Read methods return detached, live snapshots without consuming. They permit identity/cookie/key/recognition/nonce preflight; **they are not locks**. `consume…IfMatches` performs the expiry + complete match + deletion in one atomic operation (exchange also matches `expectedSessionId` from preflight). A non-null key/hash must match exactly; explicit **`null` means the stored field must be absent/undefined**, not “ignore this field” or “any record”. Both fields are mandatory in the match input. Valid transaction/code shapes are legacy (both absent), guarded unbound POST (hash only), and bound POST (hash + key); key without hash is invalid. Stored null/malformed fields are invalid, never legacy. A non-null key cannot match an unbound record; null/null cannot match a guarded record. Required mode rejects unbound snapshots before consume; optional explicitly matches legacy absence or a cookie-only POST. Session and code binding must agree before spending/issuance; recheck the atomically returned record/session before issuance, never reconstruct missing binding from a later proof. Core creates fresh IDs and never rewrites these records; this is not a transaction with upstream token use or arbitrary application upserts.
- Mismatch returns `null`, leaves a live record unchanged, and allows the honest presenter to retry; expiry/missing/malformed data yields no credentials. Concurrent matching consumers have exactly one winner. Legacy `consumeAuthorizationTransaction(state)` / `consumeExchangeCode(code)` retain legacy behavior but refuse new guarded records without consuming them, preventing accidental bypass through old calls. Use memory's synchronous compare/delete, Redis Lua compare/consume, and Mongo filtered atomic deletion (transaction where multiple records are involved); never application-side get followed by unconditional delete. Preserve upserts, alias expiry, identity filtering, ownership and deletion-count contracts.
- `getSessionRevocationContext` resolves a live handle or unexpired alias to a **currently live** logical lineage and its provider/binding; no upstream credentials leave the store boundary through this result. It must not interpret an old alias's missing binding as proof that its surviving session is unbound. Legacy unbound lineages remain unbound; mixed bound/unbound or inconsistent bound-lineage identity/binding fails closed with a private diagnostic. It grants revocation context only, not alias exchange/refresh/API authentication. New store rotation inherits the source binding if the next record omits it and rejects changing a bound key or adding binding to an unbound lineage; core always supplies the original immutable binding.
- Replay key is opaque **`dpop:v1:` + base64url(SHA-256(JSON([effectiveNamespace, jkt, jti])))**. Core namespace is a deterministic tuple of `vault`, normalized backend origin/basePath, exact configured issuer/client ID; API namespace is a tuple of `api`, normalized public origin, required static `replayNamespace`. All instances/routes in one protection space share it. Do not add instance ID, target code/session, or token to the key: replay tests must work with distinct live codes/sessions. Validate proof/key/target/nonce before reserving; never release a reservation after later route failure, and retries need a new proof.
- Expiry is **`(iat + proofMaxAgeSeconds + clockSkewSeconds) * 1000`**; `expiresAt <= now`, nonfinite/unsafe/fractional epochs, or a remaining TTL above **360000 ms** returns `false` without allocation. The upper TTL includes possible future `iat` skew (maximum age 300 + twice maximum skew 30). Duplicate returns `false` without extending expiry; valid expired keys can be admitted again. Defaults give at most 70 seconds of retained validity. Shared instances must use identical proof windows/namespaces and synchronized clocks, so a short reservation cannot expire while another instance still accepts the old proof.
- Each provider adds **`dpopReplayMaxEntries?: number`**, default **100000**, positive safe integer; capacity is shared per memory-store object/Redis key prefix/Mongo collection namespace, not per backend client. Prune expired data with bounded work; at capacity reject new reservations with root-exported **`OidcVaultDpopReplayCapacityError`**, never evict live reservations or accept without replay state. Expired rows awaiting bounded cleanup may conservatively consume capacity until reclaimed. Duplicate checks win over capacity checks. Redis uses server time and atomic admission; Mongo needs unique replay IDs, indexed expiry/TTL plus transaction-serialized capacity admission and expiry accounting (TTL deletion must not leave a permanently inflated admission counter); memory needs a bounded expiry structure, not a full session/lineage scan per API request. Mongo adds distinct `dpopProofsCollectionName`/`dpopReplayCapacityCollectionName` options (defaults `oidc_vault_dpop_proofs` / `oidc_vault_dpop_replay_capacity`). Shared clients must configure the same capacity. Provider errors/capacity map to the same sanitized 503; no fail-open policy. Conformance covers exact legacy/guarded matches, mutation isolation, simultaneous winners, cross-client replay, expiry, and capacity recovery.

#### D6 — Generic fingerprint recognition, opt-in only

- Exact option **`OidcVaultOptions.fingerprintRecognition?: OidcVaultFingerprintRecognitionOptions`**, containing `headerName?: string` (default **`X-Device-Fingerprint`**, validated as an HTTP field name without collisions with auth/cookie/origin/content headers). Omitted means no capture/check. Enabled means capture a supplied **single nonempty printable ASCII signal, max 256 bytes**, at POST login only; absent means intentionally unenrolled. Hash with SHA-256, carry through transaction metadata, and persist **`session.metadata.oidcVaultFingerprintRecognition = { version: 1, hash }`** at callback. Reserve that metadata key; do not echo raw signals/hashes into tokens/user/errors/logs. Backend has no FingerprintJS dependency.
- Before guarded code consumption and before upstream refresh/rotation, enrolled sessions require the same signal: missing/mismatch returns 403 **`OIDC_VAULT_FINGERPRINT_REAUTH_REQUIRED`**, with no credential mutation. No automatic rotation/tolerance or enrollment at exchange/refresh; fresh POST login establishes a new value. Legacy/GET-created sessions without recognition metadata remain unenrolled and allowed. This avoids an unsafe/non-portable duplicate `createSession` just to attach metadata at exchange (Redis is create-only).
- Recognition works with unbound or DPoP flows and **never satisfies required DPoP mode**. It is copyable change detection, not theft prevention or API sender constraint; API recognition/risk policy is application-owned. Disclose collection/retention with session lifetime and require fresh login on change. FingerprintJS, if demonstrated, is an optional frontend adapter only.

#### D7 — Optional bounded nonces without another per-client store

- `nonce` off/omitted is the default. An enabled `OidcVaultDpopNonceOptions` requires a shared random **at least 32-byte secret**, copied at construction; `lifetimeSeconds` default **60**, integer **1–300**. Enable for every DPoP-bearing vault POST (login/exchange/refresh/logout, including an optional unbound flow that supplies a proof) and each configured API protection space; headerless callback and no-proof unbound requests are excluded.
- Use a versioned opaque nonce containing **128 random bits**, issue/expiry times, a SHA-256 namespace digest, and `jkt`, authenticated with domain-separated **HMAC-SHA-256**. It is stateless, key/context-bound, unpredictable, and at most 512 bytes regardless of configured URL length. Reject malformed payloads, excessive declared lifetime, or `now >= expiry`; normal `iat` checks still apply. Accept any authentic unexpired issued nonce, not a single-use nonce or only the latest value. This permits parallel fresh proofs; replay protection still consumes each `jti`. Shared instances use the same secret; rotation causes a new challenge, with no unbounded previous-secret/nonce lists. Server per-client nonce storage capacity is zero.
- After otherwise valid target/key/token checks, missing/expired/wrong nonce challenges **before** replay reservation/consume/provider calls: one `DPoP-Nonce` header, JSON **`OIDC_VAULT_USE_DPOP_NONCE`**, HTTP **400 on vault POSTs / 401 on APIs**. API challenge is `DPoP error="use_dpop_nonce", algs="…"`. Issue on challenge only; no every-response rotation. Browser caches one nonce per protection space/key and retries **once** with fresh `jti`/`iat`/signature; repeated challenge stops. API responses carrying a nonce are `no-store`.

#### D8 — Minimal browser helper/example outside backend

- Approved: one new **private** workspace **`apps/oidc-vault-dpop-example`** (`name: oidc-vault-dpop-example`), already covered by `apps/*` in `pnpm-workspace.yaml`, with a small Vite/TypeScript SPA and local Express fixture server. Browser helper files: **`src/auth/{dpop-key-store,dpop-proof,auth-session,auth-fetch}.ts`**; server files under **`server/`** use the vault + memory store and an environment-configured IdP. Follow existing `apps/react-vite` build/dev conventions and package-level Vitest patterns; provide `dev`, `dev:server`, `build`, `test` scripts and documented commands. Existing React/Vite and Node apps implement a separate email/`x-session-token` organization demo, so a small isolated example is the grounded approach. No new published client API/package or backend browser subpath in this milestone.
- Dependencies: **`jose` + `idb`** for browser signing/IndexedDB, Vite/TypeScript/Vitest for the example; Express/vault/memory-store dependencies belong to its server lane. No runtime import of the Express package from browser code (use copied wire DTOs, verified by strict consumer checks). Example exports/functions are **`getOrCreateDpopKey`**, **`createDpopProof`**, **`createOidcVaultDpopSession`** (`login`, `exchange`, `refresh`, `logout`), **`fetchWithDpop`**. Keep these copyable example APIs, not promised backend exports.
- Generate non-extractable ES256/P-256 private `CryptoKey`, persist it + public JWK in IndexedDB under a key scoped to frontend/backend origin/basePath, and use atomic first-key creation across tabs. Key loss forces fresh login, never bearer fallback. Access token stays in memory; body session handle in sessionStorage, cookie handle backend-only. Login/exchange always use `credentials: 'include'` for the temporary cookie; cookie refresh/logout do too. Implement Web Locks/BroadcastChannel coordination for shared cookie-session refresh, including winner-token delivery and fresh-proof regeneration; feature-detect required browser capabilities and fail explicitly if unavailable. This is client coordination, not a backend refresh lease.
- Fresh proofs on every attempt; API-only `ath`; one nonce retry and at most one refresh/retry cycle with regenerated proof. Retry only replayable bodies and authorized/idempotent operations; scope credentials/proofs to configured origins and reject auth-bearing redirects. Add real-browser redirect/reload/key-clone/cookie/CORS checks alongside deterministic proof tests. CORS must allow `Content-Type`, `Authorization`, `DPoP` (and opted-in fingerprint header), allow explicit trusted origins/credentials, and expose `DPoP-Nonce`/`WWW-Authenticate`.

#### Approved shared sanitized errors

Retain existing parser/state/code/session/access-token/issuer errors and no-store/observer separation. Add these fixed JSON codes/messages; raw claims, fingerprints, keys, URLs, upstream messages, and store errors go only to the existing private error observers.

| HTTP      | Code                                       | Fixed client message / usage                                                                                                                       |
| --------- | ------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------- |
| 401       | `OIDC_VAULT_MISSING_ACCESS_TOKEN`          | `Missing access token.` Binding-enabled API extraction only; default legacy bearer errors stay unchanged.                                          |
| 401       | `OIDC_VAULT_DEVICE_BINDING_REQUIRED`       | `A device-bound login is required.` Unbound use in required mode.                                                                                  |
| 401       | `OIDC_VAULT_DPOP_REQUIRED`                 | `DPoP authentication is required.` Missing proof on bound credentials, wrong scheme, or disabled acceptance of bound credentials.                  |
| 401       | `OIDC_VAULT_INVALID_DPOP_PROOF`            | `DPoP proof validation failed.` Invalid/duplicate/oversized/stale/wrong-key/method/URL/ath/replayed proof; no separate detailed replay/key oracle. |
| 400       | `OIDC_VAULT_INVALID_BROWSER_BINDING`       | `Login browser binding validation failed.` Missing/malformed/wrong transaction cookie.                                                             |
| 415       | `OIDC_VAULT_UNSUPPORTED_REQUEST_BODY_TYPE` | `Login initiation requires a JSON request body.` New POST login media-type check.                                                                  |
| 400 / 401 | `OIDC_VAULT_USE_DPOP_NONCE`                | `A fresh DPoP nonce is required.` Vault POST / API challenge respectively.                                                                         |
| 503       | `OIDC_VAULT_DPOP_REPLAY_UNAVAILABLE`       | `DPoP replay protection is unavailable.` Store failure/capacity; fail closed.                                                                      |
| 400       | `OIDC_VAULT_INVALID_FINGERPRINT`           | `Fingerprint signal is invalid.` Malformed/duplicate/oversized opted-in signal.                                                                    |
| 403       | `OIDC_VAULT_FINGERPRINT_REAUTH_REQUIRED`   | `Browser recognition changed; sign in again.` Missing/mismatched enrolled signal.                                                                  |

Binding-enabled APIs reject duplicate Authorization fields and accept only one unambiguous Bearer/DPoP credential. DPoP presentation of an unbound token uses existing `OIDC_VAULT_INVALID_ACCESS_TOKEN`, not enrollment. For API 401s, use the attempted scheme's challenge; bound downgrade/proof failures use `DPoP error="invalid_dpop_proof", algs="ES256"` (configured allowlist in `algs`), invalid tokens/unbound-in-required use `invalid_token`, nonce uses `use_dpop_nonce`. No credentials: optional mode advertises `Bearer, DPoP algs="…"` without an error, required mode only DPoP. No diagnostic `error_description`; non-401 failures carry no auth challenge. Vault proof-required/invalid-proof 401s can use the same DPoP challenge. Existing untrusted-origin code/messages remain, with fixed `Login request origin is not trusted.` / `Exchange request origin is not trusted.` messages added for those routes.

#### Approved sequence, pitfalls, and approval/verification record

- **Approved execution:** DBJWT-02 contract freeze → **03 → 08 → 07 → 06 → 04 → 05 → 09 → 10 → 11 → 12**, using separate isolated sequential agents in this run. The contract permits independent frontend preparation in a future allocation, but acceptance waits for backend/recognition completion. Store conformance is a prerequisite to consuming codes, and every proof acceptance path must call the same replay/nonce policy.
- **Integration pitfalls to retain:** DPoP is key/profile binding, not hardware attestation or XSS protection; method/URI proofs do not sign request bodies/query strings. Temporary cookies are needed even in body transport; third-party cookie blocking can require same-site deployment. A single pending transaction cookie and logout aliases need explicit handling, not bare jkt parameters or unconditional stale deletion. Shared replay is per request and costs Redis/Mongo writes; replay/nonce policy must agree across instances. DPoP does **not** implement BOV-03-FU1's refresh lease or FU2's cookie-ordering guarantee: different honest fresh proofs can still race a single-use upstream refresh family. Keep those follow-ups distinct and use browser single-flight without claiming distributed backend coordination.
- **Approval provenance (2026-10-02):** parent supplied the explicit question-tool result in this agent's resume instruction. Question: `Approve the D1–D8 contract bundle recorded in section 8 of docs/tasks/20261002-125749-express-oidc-vault-device-bound-jwt.md so I can continue all tasks with separate sequential agents?` Answer: **`Approve bundle (Recommended)`**. Selected description: freeze the recorded contracts and continue implementation, including stores before guarded auth flows. This is user/maintainer approval reported by the parent, not an assumption or an approval invented by this agent. All D1–D8 and the associated bounds/errors/sequence are approved unchanged; upstream deferral D2 is an approved scope decision.
- **Historical proposal verification:** documentation-only review; `git diff --check` and `git diff --no-index --check /dev/null docs/tasks/20261002-125749-express-oidc-vault-device-bound-jwt.md` passed at proposal delivery (the latter explicitly checked the still-untracked task file). Current freeze verification is recorded in DBJWT-02 Completion evidence. Implementation build/tests were not rerun; DBJWT-01 baseline remains the recorded evidence.

## 9. Definition of done

- Default bearer behavior unchanged; all pre-existing tests pass.
- `optional` mode: unbound flows unaffected; bound flows enforce key possession on exchange, refresh, and every API acceptance point.
- `required` mode: unbound flows rejected with sanitized errors and no state mutation.
- Wrong-browser callback/exchange, stolen-code, missing-proof downgrade, and replay attacks fail closed for bound sessions in both transports.
- All three stores persist binding, enforce atomic consume/match, and pass conformance + live harnesses (where configured).
- Frontend example demonstrates key persistence, fresh proofs, refresh-after-expiry, and nonce retry; CORS documented.
- Shipped README + declarations + packed consumers + website agree; `npm pack --dry-run` sane.
- `pnpm build`, `pnpm lint`, package tests, serialized `pnpm test`, and packed-consumer checks pass (or blockers recorded as `blocked` with owner).
- Final review (DBJWT-12) signed off with evidence; residual risks and deferred items recorded.

## 10. Conversation history (for the next agent)

This plan synthesizes a multi-turn discussion:

- Initial ask: cost to add optional `device-bound JWT` to `packages/express-oidc-vault`.
- Clarified: cryptographic binding = PoP; DPoP (RFC 9449) is the standard; app-local JWT scope first, upstream IdP DPoP separate.
- User proposed FingerprintJS `fpid/deviceId`; response: useful for recognition/risk, not PoP (copyable/spoofable; vendor README warns); keep backend vendor-agnostic.
- User asked “device-bound uses PoP?”; response: yes for the cryptographic variant; PoP is the mechanism, DPoP the protocol; browser key ≈ browser-profile binding without hardware attestation.
- User asked frontend work; response: IndexedDB key lifecycle, proof generator, proof-aware login/exchange/refresh, auth-fetch wrapper, CORS, suggested `src/auth/` layout.
- User requested this detailed task file.
- Parent then reported explicit question-tool approval of the complete section 8 D1–D8 bundle and separate sequential execution; this agent resumed DBJWT-02 to freeze that unchanged contract (approval provenance above).

No production implementation has started in DBJWT-02; DBJWT-01 test scaffolding is recorded above. Current-source findings remain historical/pre-implementation references; section 8 is the approved execution contract. Continue implementation with DBJWT-03 and the frozen sequence.

Execution update: DBJWT-03/08/07/06/04/05/09/**10** are completed with verified policy/types/issuance, real provider/conformance/live evidence, shared replay/nonce, request-aware API/shared proof verification, POST-login/cookie-authenticated callback, original-key guarded exchange/refresh/live-and-alias logout, generic fingerprint recognition, and the full private Vite/Express/local-IdP persistent-key SPA. All 41 original DBJWT-01 API/browser/lifecycle scenarios are active named HTTP regressions; the core scaffold has zero TODO/skip. **35 core files / 1942 tests**, **8 app unit files / 110 tests (including 38 preserved adapter tests)**, **5 real-browser files / 42 tests across Chromium 151.0.7922.34 and Firefox 153.0**, strict types, app/dependency builds, root lint and packed consumers pass; optional WebKit host-library limitation is recorded above. Continue **DBJWT-11 → DBJWT-12**: final repository/website/artifact parity, then independent integration review.

Execution update (DBJWT-12 independent review, 2026-10-03): DBJWT-11 completed (shipped README/website/store-declaration parity, sane 6-file packs). DBJWT-12 re-verified DBJWT-01…11 at runtime and is **completed**: core 35/1942 (twice), memory 3/123, redis 11/336, mongo 140/141 (sole failure = environmental packed-subprocess handshake, tracked as P2 DBJWT-13), example 110 unit + 21 browser (+6 Chromium lifecycle spot-check), focused cross-path probes (urlencoded/form/stolen/mapClaims/Bearer/bounds/legacy/replay/wrong-key/nonce/custom) all green, root `pnpm lint` exit 0, root `pnpm build` exit 0, serialized full-repo `pnpm test` green everywhere except the DBJWT-13 item (≈9049 passing tests session-wide, zero product-assertion failures). No P0 open; no source/CHANGELOG/commit changes by reviewer; unrelated access-router worktree changes preserved. Residual risks and deferred rationale recorded in the DBJWT-12 sign-off above.
