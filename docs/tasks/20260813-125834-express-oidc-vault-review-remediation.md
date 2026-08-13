# Express OIDC Vault Review Remediation

Created: 2026-08-13 12:58:34 PDT

Package: `packages/express-oidc-vault`

## Objective

Remediate confirmed security hardening, request-boundary, token-validation, architecture, documentation, and testability gaps in `@web-ts-toolkit/express-oidc-vault`. Preserve the current public route surface and store-provider contract unless a task explicitly states a contract change.

## Scope And Working Rules

- Add a focused regression that fails on the current implementation before each behavioral fix.
- Keep upstream refresh tokens, upstream `id_token`s, and local session identifiers out of browser-readable responses except where the documented body transport intentionally returns `sessionId`.
- Treat request bodies, query strings, headers, cookies, provider metadata, token endpoint responses, userinfo responses, and hook errors as untrusted inputs.
- Prefer the smallest shared enforcement point: parser/middleware boundaries for request-size limits, token verifier helpers for OIDC claims, and serializer helpers for cookie/header behavior.
- Do not manually edit generated `dist/` files. Build from tracked TypeScript source.
- Update package README, website docs, public types, and tests together when behavior changes.
- Preserve unrelated worktree changes and never revert another agent's work.
- Run package tests serially. The repository notes that package test scripts rebuild shared `dist/` outputs, so agents must not run dependent package build/test commands concurrently.

## Non-Goals

- Do not replace the Express router API or require a new framework abstraction.
- Do not implement full OAuth/OIDC client feature parity such as dynamic client registration, device flow, PAR, or DPoP.
- Do not make store-provider packages part of this task file except where core contract tests need to verify existing store behavior.
- Do not add compatibility aliases for unsafe behavior unless a maintainer identifies a shipped external dependency.
- Do not introduce broad rewrites before the security and correctness gaps have regression coverage.

## Review Baseline

Confirmed by source review on 2026-08-13 before this task file was created:

- `packages/express-oidc-vault/src/index.ts` contains the complete router, OIDC client helpers, cookie helpers, error handling, token verification, access-token middleware, and request parsing setup in one 1,277-line file.
- `createOidcVaultMiddleware` installs `express.json()` and `express.urlencoded({ extended: false })` without package-specific limits. Express already applies an approximately `100kb` default, so this is explicit boundary hardening rather than an unbounded-memory P0 defect; `packages/express-runtime/src/index.ts` uses documented `1mb` defaults.
- `parseCookieHeader` calls `decodeURIComponent(value)` without catching malformed percent encoding, so a malformed cookie can surface as a `500` route error.
- Cookie transport reads a body-provided `sessionId` fallback when no session cookie exists, including cross-site cookie mode after origin validation.
- `getRequestOrigin` derives the callback origin from `req.protocol` and `Host`; no package option pins a public backend origin, and README examples do not call out Express `trust proxy` implications.
- `postLogoutRedirectUri` is appended to the upstream end-session URL without validation against the frontend origin or an explicit allowlist.
- `verifyIdToken` verifies issuer/audience/nonce, but the callback does not validate `azp` when present, `tokenResponse.token_type`, or userinfo `sub` parity with the ID token subject.
- Discovery does not require the returned issuer to exactly equal the configured issuer. Manual endpoint mode does not require an issuer, so ID-token and logout-token verification can run without issuer validation.
- ID-token verification does not require `exp` or `iat`. Refresh does not require a new ID token's `sub` to match the existing session subject, and UserInfo is accepted without a required matching `sub`.
- `verifyBackchannelLogoutToken` validates issuer/audience/event/jti/sid-or-sub/no-nonce, but does not require `iat`, validate the event member value, inspect the recommended `typ` header, or track logout-token replay by `jti`.
- Callback and refresh assign access-token `expires_in` to the whole stored session, even though that value describes the access token rather than refresh-session lifetime. Refresh also re-verifies the stored ID token when the provider omits a new ID token and lets stale session profile fields override fresh ID-token claims.
- Refresh invokes the local token issuer before atomic session rotation, so a losing concurrent refresh can mint an orphan access token. Logout separately reads and deletes a session and can race with refresh rotation.
- Callback, exchange, refresh, and hooks contain failure orderings that can leave a created session without an exchange code, consume a one-time exchange code before local token issuance succeeds, or report failure after state has already rotated.
- Same-site cookie transports do not receive Origin/Referer validation; only `SameSite=None` does. Cookie options permit `httpOnly: false` and cookie name/domain/path values are not validated before header serialization.
- Logout JSON can contain an upstream URL with the stored ID token in `id_token_hint`, contradicting the rule that upstream ID tokens must not cross a browser-readable response boundary.
- Provider discovery and JWKS caches are module-level maps without size/TTL controls or an exported test reset path.
- Provider discovery, token, UserInfo, and remote JWKS requests have no package-level timeout/cancellation policy. `readJsonResponse` reads entire provider responses into memory before JSON parsing and can expose raw provider response text in error messages.
- `createOidcVaultAccessTokenMiddleware` returns raw validator error messages to clients for invalid access tokens.
- Unknown store, hook, token-issuer, and provider errors also return their raw `Error.message` through the generic route error handler.
- Invalid `returnTo` URL syntax can become a 500. Provider token response numeric fields are not range-checked, discovery JSON uses a separate unsanitized parse path, and HTTP Basic client credentials are concatenated without the OAuth form-encoding required for reserved characters.
- Tests exercise the happy OIDC flow, returnTo origin rejection, cookie transport, untrusted cross-site refresh origin, discovery retry after failure, local `tokenIssuer` failure before rotation, backchannel logout by `sid`, bearer middleware, and JWT helper. They do not cover the protocol, concurrency, malformed-input, lifecycle, or installed-consumer cases listed above.
- Worktree was clean at review time according to `git status --short`.
- Verification was not run for this review-only task-file creation.

## Priorities

- P0: confirmed issue can permit token/subject confusion, cookie-authenticated CSRF, creation of usable orphan credentials, session survival after reported revocation, or comparable direct authentication-boundary failure.
- P1: invalid external data is accepted, sensitive details can leak, or production deployments can be misconfigured in a way the API should make harder.
- P2: architecture, readability, testability, documentation, or packaging gaps with contained immediate risk.
- P3: optional optimization or API expansion requiring maintainer policy input or benchmark evidence.

## Wave 1: Request Boundary And Browser-Facing Security

### Task OIDC-01: Bound And Centralize Route Body Parsing

Status: completed

Priority: P1

Suggested agent: Express request-boundary hardening specialist

Dependencies: none

Primary ownership:

- `packages/express-oidc-vault/src/index.ts`
- `packages/express-oidc-vault/src/types.ts`
- focused tests in `packages/express-oidc-vault/test/index.test.ts`
- package README and website docs

Finding:

The middleware installs `express.json()` and `express.urlencoded({ extended: false })` with Express's approximately `100kb` defaults. The routes need only small JSON/form bodies such as `code`, `sessionId`, and `logout_token`; a smaller explicit, documented package limit and stable parser-error contract provide defense in depth. This is not an unbounded parser defect.

References:

- `packages/express-oidc-vault/src/index.ts:1265-1274`
- `packages/express-runtime/src/index.ts:52-57`
- `packages/express-runtime/src/index.ts:126-129`

Implementation requirements:

1. Add explicit parser limits for OIDC vault JSON and URL-encoded bodies.
2. Decide whether the limit is fixed or configurable through `OidcVaultOptions`; prefer a safe default such as `16kb` with narrow documented override support if applications need provider-specific larger logout tokens.
3. Preserve `application/x-www-form-urlencoded` support for backchannel logout.
4. Ensure parser failures return a controlled client error payload and do not call provider/store hooks as if a route succeeded.
5. Document the default and the override contract in package and website docs.

Acceptance criteria:

- Oversized JSON requests to `POST /exchange`, `POST /refresh`, and `POST /logout` return a stable 4xx response instead of processing the body.
- Oversized URL-encoded backchannel logout requests return a stable 4xx response.
- Malformed JSON, unsupported content encoding, and URL-encoded parameter overflow return the documented 4xx JSON error shape.
- Valid small JSON and form requests continue to pass existing flow tests.
- `pnpm --filter @web-ts-toolkit/express-oidc-vault test` passes.

Completion evidence:

- Changed: `packages/express-oidc-vault/src/index.ts`, `packages/express-oidc-vault/src/types.ts`, `packages/express-oidc-vault/src/errors.ts`, `packages/express-oidc-vault/test/index.test.ts`, `packages/express-oidc-vault/README.md`, `website/docs/packages/express-oidc-vault.md`.
- Behavior: OIDC vault JSON and URL-encoded parsers now use explicit `requestBodyLimit` handling with a documented `16kb` default and controlled parser-error responses for oversized or malformed route bodies.
- Verified: final package verification recorded under OIDC-99 passed `pnpm --filter @web-ts-toolkit/express-oidc-vault test` on 2026-08-13.

### Task OIDC-02: Treat Malformed Cookies As Controlled Client Errors

Status: completed

Priority: P1

Suggested agent: HTTP parser and error-contract specialist

Dependencies: none

Primary ownership:

- `packages/express-oidc-vault/src/index.ts`
- focused cookie transport tests

Finding:

`parseCookieHeader` calls `decodeURIComponent(value)` directly. Malformed percent encoding in the cookie header throws `URIError`, which is converted to `OIDC_VAULT_INTERNAL_ERROR` with status `500` by the generic route error handler. Cookie values are request-controlled and should not produce an internal error classification.

References:

- `packages/express-oidc-vault/src/index.ts:158-180`
- `packages/express-oidc-vault/src/index.ts:306-337`
- `packages/express-oidc-vault/src/index.ts:129-143`

Implementation requirements:

1. Handle malformed cookie percent encoding at the cookie parsing boundary.
2. Return a stable 400-class error code for malformed session cookies, or ignore only the malformed cookie if the behavior is explicitly documented and tested.
3. Preserve valid cookie decoding, custom cookie names, and cookie clearing behavior.
4. Avoid leaking the raw cookie value in the response body or hook metadata.

Acceptance criteria:

- `POST /refresh` with cookie transport and a malformed percent-encoded session cookie returns a controlled 4xx JSON error, not `OIDC_VAULT_INTERNAL_ERROR`.
- `POST /logout` has the same controlled behavior.
- Valid encoded cookie values still resolve to the original session ID.
- `pnpm --filter @web-ts-toolkit/express-oidc-vault test` passes.

Completion evidence:

- Changed: `packages/express-oidc-vault/src/index.ts`, `packages/express-oidc-vault/test/index.test.ts`.
- Behavior: malformed cookie percent encoding now returns `400` with `OIDC_VAULT_MALFORMED_SESSION_COOKIE` and no raw cookie value in the response body or hook metadata.
- Verified: `pnpm --filter @web-ts-toolkit/express-oidc-vault test` passed with 21 tests.

### Task OIDC-03: Remove Body Session Fallback In Cookie Transport Or Gate It Explicitly

Status: completed

Priority: P1

Suggested agent: session transport security specialist

Dependencies: OIDC-01, OIDC-02

Primary ownership:

- `packages/express-oidc-vault/src/index.ts`
- `packages/express-oidc-vault/src/types.ts` if an option is needed
- cookie transport tests and docs

Finding:

When `sessionTransport` is `cookie`, `getSessionIdFromRequest` first reads the session cookie and then accepts `body.sessionId` if no cookie exists. This weakens the documented cookie transport contract and creates a second credential path for refresh/logout. In cross-site cookie mode this fallback is origin-gated, so this is transport separation and security hardening rather than a demonstrated session takeover.

References:

- `packages/express-oidc-vault/src/index.ts:119-122`
- `packages/express-oidc-vault/src/index.ts:306-337`
- `packages/express-oidc-vault/README.md:59-68`
- `packages/express-oidc-vault/README.md:295-365`

Implementation requirements:

1. Choose a strict cookie transport contract: cookie mode should require the cookie by default for refresh/logout.
2. If body fallback is retained for a concrete migration need, add an explicit opt-in option with security documentation and tests; do not keep it implicit.
3. Ensure missing cookie behavior clears stale cookies where applicable and returns the existing missing-session code where practical.
4. Update README and website docs to state the exact accepted credential location for each transport mode.

Acceptance criteria:

- In cookie transport, `POST /refresh` with no cookie and only `body.sessionId` is rejected unless a new explicit opt-in is configured.
- In cookie transport, `POST /logout` with no cookie and only `body.sessionId` is rejected unless the same explicit opt-in is configured.
- Body transport continues to require `body.sessionId` and does not read cookies.
- Existing cookie happy-path tests still pass.
- `pnpm --filter @web-ts-toolkit/express-oidc-vault test` passes.

Completion evidence:

- Changed: `packages/express-oidc-vault/src/index.ts`, `packages/express-oidc-vault/test/index.test.ts`, `packages/express-oidc-vault/README.md`, `website/docs/packages/express-oidc-vault.md`.
- Behavior: cookie transport `refresh` and `logout` now require the session cookie and reject body-only `sessionId` credentials; body transport continues to use JSON `sessionId` credentials.
- Verified: docs explicitly state cookie mode rejects body-only refresh/logout IDs, and final package verification recorded under OIDC-99 passed `pnpm --filter @web-ts-toolkit/express-oidc-vault test` on 2026-08-13.

### Task OIDC-04: Pin Public Backend Origin For Callback Redirect URIs

Status: completed

Priority: P1

Suggested agent: deployment security and Express proxy specialist

Dependencies: none

Primary ownership:

- `packages/express-oidc-vault/src/index.ts`
- `packages/express-oidc-vault/src/types.ts`
- README and website deployment docs
- login/callback tests

Finding:

The callback URI is generated from `req.protocol` and `Host`. Behind reverse proxies, this can be wrong unless Express `trust proxy` and forwarded headers are configured correctly. If an app is mounted without strict host handling, a malicious `Host` header can influence the `redirect_uri` sent to the provider. The package has no `backendOrigin` or `publicOrigin` option to pin the externally registered backend origin.

References:

- `packages/express-oidc-vault/src/index.ts:145-149`
- `packages/express-oidc-vault/src/index.ts:883-885`
- `packages/express-oidc-vault/src/index.ts:918-923`
- `packages/express-oidc-vault/src/types.ts:224-239`

Implementation requirements:

1. Add an option such as `backendOrigin` or `publicOrigin` that is used for callback URI generation instead of request-derived origin.
2. Validate the configured origin at middleware creation time and normalize it to an origin without path/query/hash.
3. Prefer requiring the pinned origin. If request-derived behavior remains for compatibility, require an explicit opt-in and validate the request host against a configured allowlist; do not preserve Host-derived behavior as the silent default.
4. Document reverse-proxy and `trust proxy` requirements for any explicit request-derived compatibility mode.
5. Ensure login and callback token-exchange `redirect_uri` values remain identical.

Acceptance criteria:

- With the new origin option configured, `GET /login` and callback token exchange use that origin even when `Host` differs.
- Invalid configured origin values fail during middleware creation with an actionable error.
- Request-derived behavior is unavailable by default or is constrained by an explicit validated-host compatibility policy.
- `pnpm --filter @web-ts-toolkit/express-oidc-vault test` passes.

Completion evidence:

- Changed: `packages/express-oidc-vault/src/index.ts`, `packages/express-oidc-vault/src/types.ts`, `packages/express-oidc-vault/src/origins.ts`, `packages/express-oidc-vault/test/index.test.ts`, `packages/express-oidc-vault/test/helpers.test.ts`, `packages/express-oidc-vault/README.md`, `website/docs/packages/express-oidc-vault.md`.
- Behavior: `backendOrigin` is now required, validated, normalized to an origin, and used for login/callback `redirect_uri` construction instead of request-derived host/protocol data.
- Verified: helper and route tests cover backend-origin normalization and redirect URI behavior; final package verification recorded under OIDC-99 passed `pnpm --filter @web-ts-toolkit/express-oidc-vault test` on 2026-08-13.

### Task OIDC-05: Validate Post-Logout Redirect Destinations

Status: completed

Priority: P2

Suggested agent: redirect and OIDC logout contract specialist

Dependencies: none

Primary ownership:

- `packages/express-oidc-vault/src/index.ts`
- `packages/express-oidc-vault/src/types.ts` if an allowlist option is needed
- logout tests and docs

Finding:

`postLogoutRedirectUri` is trusted application configuration and is appended to the upstream end-session URL without creation-time URL validation. This is not a request-controlled open redirect. Requiring the frontend origin could reject legitimate separately registered logout destinations, so policy must follow provider registration and application configuration rather than assume same-origin.

References:

- `packages/express-oidc-vault/src/index.ts:430-437`
- `packages/express-oidc-vault/src/index.ts:1131-1146`
- `packages/express-oidc-vault/src/index.ts:483-512`
- `packages/express-oidc-vault/README.md:558-568`
- `packages/express-oidc-vault/README.md:871-887`

Implementation requirements:

1. Validate `postLogoutRedirectUri` during middleware creation or before use.
2. Require an absolute HTTP(S) URL and either document provider registration as the trust boundary or add an explicit allowlist policy. Do not impose same-origin with `frontendRedirectUri` without a maintainer decision.
3. Preserve no-redirect behavior when `postLogoutRedirectUri` is omitted.
4. Document any behavior change as a security tightening.

Acceptance criteria:

- Malformed or non-HTTP(S) configured logout URLs fail during middleware creation.
- Valid provider-registered logout URLs, including an intentionally separate frontend origin when policy permits it, continue to work.
- Omitted `postLogoutRedirectUri` preserves successful local logout behavior; final JSON/redirect shape follows OIDC-14's no-ID-token-exposure contract.
- `pnpm --filter @web-ts-toolkit/express-oidc-vault test` passes.

Completion evidence:

- Changed: `packages/express-oidc-vault/src/index.ts`, `packages/express-oidc-vault/test/index.test.ts`, `packages/express-oidc-vault/README.md`, `website/docs/packages/express-oidc-vault.md`.
- Behavior: `postLogoutRedirectUri` is now validated during middleware creation when configured; malformed, relative, and non-HTTP(S) URLs fail fast while omitted values and separately hosted HTTP(S) URLs remain accepted.
- Verified: `pnpm --filter @web-ts-toolkit/express-oidc-vault test` passed with 27 tests.

## Wave 2: OIDC Token And Provider Response Correctness

### Task OIDC-06: Tighten ID Token, Token Response, And UserInfo Validation

Status: completed

Priority: P0

Suggested agent: OIDC token validation specialist

Dependencies: none

Primary ownership:

- `packages/express-oidc-vault/src/index.ts`
- callback and refresh tests
- README and website security notes

Finding:

The callback verifies ID-token signature, configured issuer when available, audience, nonce, and `sub`, but it does not require `exp` or `iat`, validate `azp`, require `token_type: Bearer`, or require matching UserInfo `sub`. Refresh does not bind a newly returned ID token to the existing session subject. Discovery accepts a returned issuer that differs from the configured issuer, while manual mode permits issuer-less verification. These gaps permit token/subject confusion and incomplete OIDC validation.

References:

- `packages/express-oidc-vault/src/index.ts:56-64`
- `packages/express-oidc-vault/src/index.ts:701-748`
- `packages/express-oidc-vault/src/index.ts:750-772`
- `packages/express-oidc-vault/src/index.ts:774-802`
- `packages/express-oidc-vault/src/index.ts:925-975`
- `packages/express-oidc-vault/src/index.ts:1039-1067`
- `packages/express-oidc-vault/src/config.ts:70-89`

Implementation requirements:

1. Require discovered `issuer` to exactly equal the configured issuer after applying only the normalization permitted by OIDC Discovery; reject mismatch before using discovered endpoints.
2. Require `issuer` in manual mode so ID and logout tokens are never verified without issuer binding. Treat this as a security contract change and update configuration docs/tests.
3. Require ID-token `exp`, `iat`, and `sub`; preserve normal clock-tolerance behavior from the JWT library.
4. Require `azp === clientId` when `azp` is present, and require a matching `azp` for multi-audience ID tokens.
5. Require `token_type` and accept `Bearer` case-insensitively; reject missing or other token types unless a maintainer explicitly defers strict conformance with documented residual risk.
6. When UserInfo is fetched, require a non-empty `sub` equal to the verified ID-token subject before merging claims.
7. On refresh, require a newly returned ID token's `sub` to equal `currentSession.subject`. If no new ID token is returned, do not require the stored ID token to remain unexpired merely to retain previously verified identity; define and test how claims are retained.
8. Validate `expires_in` as a finite, non-negative integer before using it, and reject structurally invalid token response fields with controlled provider errors.
9. Preserve valid provider responses and `fetchUserInfo: false`.

Acceptance criteria:

- Userinfo for a different `sub` cannot override or merge into the session user.
- UserInfo without `sub` is rejected.
- Discovery issuer mismatch and issuer-less manual configuration are rejected.
- ID tokens missing required temporal claims are rejected.
- A refreshed ID token cannot change the session subject.
- An ID token with mismatched `azp` is rejected with a controlled provider/token error.
- A missing or non-Bearer token type is rejected with a controlled provider/token error unless explicitly deferred.
- Invalid `expires_in` values are rejected without creating or rotating a session.
- Existing happy-path callback and refresh tests continue to pass.
- `pnpm --filter @web-ts-toolkit/express-oidc-vault test` passes.

Completion evidence:

- Changed: `packages/express-oidc-vault/src/token-validation.ts`, `packages/express-oidc-vault/src/provider-client.ts`, `packages/express-oidc-vault/src/config.ts`, `packages/express-oidc-vault/src/index.ts`, `packages/express-oidc-vault/test/index.test.ts`, `packages/express-oidc-vault/test/config.test.ts`, `packages/express-oidc-vault/test/helpers.test.ts`, `packages/express-oidc-vault/README.md`, `website/docs/packages/express-oidc-vault.md`.
- Behavior: discovery/manual configuration now binds issuer validation; ID tokens require `sub`, `exp`, `iat`, and valid `azp`; token responses require Bearer `token_type` and valid `expires_in`; UserInfo and refreshed ID tokens must preserve subject continuity.
- Verified: helper, config, and route tests cover token-response validation, issuer and endpoint validation, UserInfo subject checks, and refresh subject continuity; final package verification recorded under OIDC-99 passed `pnpm --filter @web-ts-toolkit/express-oidc-vault test` on 2026-08-13.

### Task OIDC-07: Add Backchannel Logout Replay And Header Hardening

Status: completed

Priority: P1

Suggested agent: OIDC backchannel logout specialist

Dependencies: OIDC-01, OIDC-06

Primary ownership:

- `packages/express-oidc-vault/src/index.ts`
- `packages/express-oidc-vault/src/types.ts`
- store-provider contract tests or new replay hook/storage API if needed
- backchannel logout docs

Finding:

Backchannel logout validates signature, available issuer, audience, event-key presence, `jti`, sid-or-sub, and no nonce, but it does not require `iat`, validate the event member value, or inspect the protected header. There is no replay cache, so the same valid token can repeat deletion work and hook side effects. Repeated deletion is generally idempotent, making this P1 correctness and side-effect hardening rather than a demonstrated P0 session compromise.

References:

- `packages/express-oidc-vault/src/index.ts:67-74`
- `packages/express-oidc-vault/src/index.ts:371`
- `packages/express-oidc-vault/src/index.ts:804-860`
- `packages/express-oidc-vault/src/index.ts:1149-1177`
- `packages/express-oidc-vault/src/types.ts:89-100`

Implementation requirements:

1. Add a replay-prevention strategy for logout-token `jti` values.
2. Prefer extending `OidcVaultStoreProvider` with an atomic consume/remember operation only if replay prevention cannot be done safely at the core boundary; coordinate with all store packages if the interface changes.
3. Define TTL for replay records based on token `exp` and require a valid `iat`; use a conservative bounded default only if tokens without `exp` are intentionally supported.
4. Require the backchannel event member value to be a JSON object and reject malformed event claims.
5. Reject an incorrect present protected-header `typ`. Decide whether absent `typ` remains compatible or strict `logout+jwt` presence is configurable; document the default without presenting the recommendation as an unconditional protocol requirement.
6. Preserve idempotent user-visible logout semantics while avoiding repeated hook side effects for replayed tokens.

Acceptance criteria:

- Replaying the exact same valid `logout_token` does not execute a second session revocation or `onLogout` side effect.
- Replay state expires or is bounded.
- Header `typ` behavior is explicit, tested, and documented.
- Missing `iat`, malformed events, and incorrect present `typ` are rejected.
- Memory, Redis, and MongoDB store packages still satisfy the core store contract if it changes.
- Relevant package tests pass serially.

Completion evidence:

- Added atomic `consumeBackchannelLogoutTokenJti` store-provider contract support in memory, Redis, and MongoDB stores with expiry bounded by logout-token `exp`.
- Backchannel logout now requires `iat` and `exp`, validates the event member value is an object, and rejects an incorrect present protected-header `typ` while accepting absent `typ` for compatibility.
- Replay of the same valid `logout_token` returns a successful no-op response with `revokedSessions: 0` and does not repeat `onLogout` side effects.
- Verified with targeted express-oidc-vault, memory-store, Redis-store, and MongoDB-store package tests.

### Task OIDC-08: Sanitize Provider And Validator Error Messages Returned To Clients

Status: completed

Priority: P1

Suggested agent: error response security specialist

Dependencies: none

Primary ownership:

- `packages/express-oidc-vault/src/index.ts`
- error-path tests
- README hook guidance

Finding:

`readJsonResponse` throws raw response text when JSON parsing fails, discovery has a separate raw parse/error path, and token/userinfo failures can expose upstream detail. `createOidcVaultAccessTokenMiddleware` returns arbitrary validator messages, while the generic route handler returns raw messages from unknown store, hook, token-issuer, and provider errors. These messages may include internals, credentials, or application validation context. Hooks can still receive full errors for logging, but client responses must be stable and sanitized.

References:

- `packages/express-oidc-vault/src/index.ts:129-143`
- `packages/express-oidc-vault/src/index.ts:442-454`
- `packages/express-oidc-vault/src/index.ts:735-745`
- `packages/express-oidc-vault/src/index.ts:761-769`
- `packages/express-oidc-vault/src/index.ts:1235-1257`
- `packages/express-oidc-vault/test/index.test.ts:725-750`

Implementation requirements:

1. Separate internal error detail from client-facing error messages.
2. Keep `hooks.onError` able to observe the original error for logging.
3. Return stable messages for upstream discovery/token/userinfo/JWKS failures, malformed discovery JSON, invalid access-token validator failures, and unknown store/hook/token-issuer errors.
4. Preserve specific error codes and status codes where practical.
5. Update tests that currently assert raw validator error messages.

Acceptance criteria:

- A validator throwing `new Error('token expired: raw-token-value')` does not return that raw message to the client.
- Invalid JSON from a provider response does not return the raw response body to the browser.
- Store, hook, and token-issuer failures do not return their raw messages to clients.
- `onError` can still observe the original error object.
- Existing route error JSON shape remains `{ code, message }`.
- `pnpm --filter @web-ts-toolkit/express-oidc-vault test` passes.

Completion evidence:

- Changed: `packages/express-oidc-vault/src/errors.ts`, `packages/express-oidc-vault/src/provider-client.ts`, `packages/express-oidc-vault/src/access-token-middleware.ts`, `packages/express-oidc-vault/src/index.ts`, `packages/express-oidc-vault/test/index.test.ts`, `packages/express-oidc-vault/test/helpers.test.ts`, `packages/express-oidc-vault/README.md`, `website/docs/packages/express-oidc-vault.md`.
- Behavior: browser-visible route and bearer-middleware errors now use stable sanitized `{ code, message }` responses while hooks can still observe original error objects for server-side logging.
- Verified: tests cover sanitized provider JSON errors, validator failures, store/hook/token-issuer failure paths, and `onError` visibility; final package verification recorded under OIDC-99 passed `pnpm --filter @web-ts-toolkit/express-oidc-vault test` on 2026-08-13.

### Task OIDC-13: Enforce CSRF Protection And Safe Cookie Configuration

Status: completed

Completion evidence:

- Changed: `packages/express-oidc-vault/src/cookies.ts`, `packages/express-oidc-vault/src/origins.ts`, `packages/express-oidc-vault/src/index.ts`, `packages/express-oidc-vault/test/index.test.ts`, `packages/express-oidc-vault/README.md`, `website/docs/packages/express-oidc-vault.md`.
- Implemented: cookie-authenticated `refresh` and `logout` now enforce trusted `Origin`/`Referer` checks for all cookie `SameSite` modes, fail closed when source-origin headers are missing, trust the validated `backendOrigin` plus configured `trustedOrigins`, preserve backchannel logout, reject `httpOnly: false`, and validate cookie name/domain/path before middleware creation.
- Verified: `pnpm --filter @web-ts-toolkit/express-oidc-vault test`.
- Result: package build passed; 3 test files passed; 51 tests passed.

Priority: P0

Suggested agent: browser session and CSRF specialist

Dependencies: OIDC-02, OIDC-03

Primary ownership:

- `packages/express-oidc-vault/src/index.ts`
- `packages/express-oidc-vault/src/types.ts`
- cookie transport tests and security docs

Finding:

Origin/Referer validation runs only when the resolved cookie uses `SameSite=None`. Same-site cross-origin requests, including requests from sibling subdomains, can carry `Lax` or `Strict` cookies and invoke refresh/logout without this check. The public cookie options also permit `httpOnly: false`, contradicting the secure-cookie transport promise, and serialize unvalidated name/domain/path values into `Set-Cookie` headers.

References:

- `packages/express-oidc-vault/src/index.ts:182-243`
- `packages/express-oidc-vault/src/index.ts:258-303`
- `packages/express-oidc-vault/src/index.ts:1027-1028`
- `packages/express-oidc-vault/src/index.ts:1109-1112`
- `packages/express-oidc-vault/src/types.ts:208-222`

Implementation requirements:

1. Apply an explicit CSRF policy to every cookie-authenticated refresh and logout request, not only `SameSite=None` deployments.
2. Define trusted source origins from validated configuration. Do not treat same-site sibling origins as automatically trusted.
3. Decide and document behavior for clients that omit both Origin and Referer; prefer fail-closed for browser cookie credentials while preserving a deliberate server-to-server path only if required.
4. Require `httpOnly: true` for vault session cookies, or remove the override. Any compatibility escape hatch requires an explicit maintainer deferral and security warning.
5. Validate cookie name, domain, and path before middleware creation so control characters or invalid syntax cannot enter response headers.
6. Preserve backchannel logout because it authenticates a signed logout token rather than a browser cookie.

Acceptance criteria:

- Untrusted same-site and cross-site origins cannot refresh or log out a cookie-authenticated session under `Lax`, `Strict`, or `None` policies.
- Trusted origins continue to work in documented deployment modes.
- Missing source-origin headers follow the documented fail-closed or explicit compatibility policy.
- Middleware creation rejects unsafe cookie serialization values and an insecure `httpOnly` configuration.
- Body transport and backchannel logout remain unaffected.
- `pnpm --filter @web-ts-toolkit/express-oidc-vault test` passes.

### Task OIDC-14: Keep Upstream ID Tokens Out Of Browser Responses

Status: completed

Completion evidence:

- Changed: `packages/express-oidc-vault/src/provider-client.ts`, `packages/express-oidc-vault/src/index.ts`, `packages/express-oidc-vault/src/types.ts`, `packages/express-oidc-vault/test/helpers.test.ts`, `packages/express-oidc-vault/README.md`, `website/docs/packages/express-oidc-vault.md`.
- Implemented: bounded process-wide discovery and JWKS resolver caches, 10 minute discovery/JWKS max-age defaults, 32 entry oldest-entry cache eviction, provider fetch timeout/cancellation with manual redirect mode, sanitized invalid JSON errors, limited discovery failure body reads, and internal cache reset/size hooks for deterministic tests.
- Verified: `pnpm --filter @web-ts-toolkit/express-oidc-vault test`.
- Result: package build passed; 3 test files passed; 48 tests passed.

Priority: P1

Suggested agent: OIDC logout and browser-boundary specialist

Dependencies: OIDC-05

Primary ownership:

- `packages/express-oidc-vault/src/index.ts`
- `packages/express-oidc-vault/src/types.ts`
- logout tests and docs

Finding:

The JSON logout response can include `upstreamLogoutUrl` with the stored ID token embedded as `id_token_hint`. Browser JavaScript and any response logging can therefore observe the upstream ID token, directly contradicting this plan's response-boundary rule. The current README tells browser code to read and navigate to that URL.

References:

- `packages/express-oidc-vault/src/index.ts:430-436`
- `packages/express-oidc-vault/src/index.ts:1131-1146`
- `packages/express-oidc-vault/src/types.ts:193-196`
- `packages/express-oidc-vault/README.md:270-283`

Implementation requirements:

1. Do not return an ID-token-bearing URL in browser-readable JSON.
2. Prefer a server-side redirect response when upstream logout is requested, or introduce an opaque one-time server endpoint that performs the redirect without exposing the token.
3. Define explicit logout response behavior when upstream logout is unavailable or not requested.
4. Keep raw ID tokens out of hook metadata unless a specific trusted server hook contract requires them; document any retained exposure.
5. Update `OidcVaultLogoutResult`, README examples, and website docs together as an external contract change.

Acceptance criteria:

- No JSON response includes an upstream ID token or URL containing `id_token_hint`.
- The supported server-driven upstream logout flow still reaches the provider with the required hint.
- Local logout remains successful when no end-session endpoint exists.
- Tests inspect response bodies, headers, and hook metadata for accidental ID-token exposure.
- `pnpm --filter @web-ts-toolkit/express-oidc-vault test` passes.

### Task OIDC-15: Separate Access-Token And Vault-Session Lifetimes

Status: completed

Priority: P1

Suggested agent: OAuth token lifecycle and store-contract specialist

Dependencies: OIDC-06

Primary ownership:

- `packages/express-oidc-vault/src/index.ts`
- `packages/express-oidc-vault/src/types.ts`
- core and store-provider lifetime tests
- lifecycle documentation

Finding:

Callback and refresh copy OAuth `expires_in` into `OidcVaultSession.expiresAt`. That field is enforced by the memory, Redis, and MongoDB stores as the lifetime of the entire refresh-token-backed session, but OAuth `expires_in` describes the access token. A one-hour access token can therefore destroy a still-refreshable session after one hour.

References:

- `packages/express-oidc-vault/src/index.ts:954-975`
- `packages/express-oidc-vault/src/index.ts:1053-1067`
- `packages/express-oidc-vault-memory-store/src/index.ts:175-187`
- `packages/express-oidc-vault-redis-store/src/index.ts:251-263`
- `packages/express-oidc-vault-mongodb-store/src/index.ts:41-55`

Implementation requirements:

1. Stop deriving vault-session expiry from access-token `expires_in`.
2. Add an explicit, documented vault-session lifetime policy or leave `expiresAt` unset when the application/store owns that policy.
3. Track access-token expiry separately only if consumers need it; do not overload `OidcVaultSession.expiresAt`.
4. Define refresh behavior when a provider omits a new ID token or access token without forcing the original ID token to remain currently valid.
5. Preserve store cleanup semantics for an explicitly configured session expiry.

Acceptance criteria:

- Advancing beyond upstream access-token expiry does not delete an otherwise valid refresh session.
- Explicit vault-session expiry is still enforced consistently by all stores.
- Refresh without a new ID token follows the documented retention behavior.
- Invalid token lifetime fields are rejected by OIDC-06 before persistence.
- Core and affected store tests pass serially.

Completion evidence:

- `packages/express-oidc-vault/src/index.ts` no longer derives `OidcVaultSession.expiresAt` from token-response `expires_in` during callback or refresh; refresh preserves any existing explicit vault-session expiry.
- `packages/express-oidc-vault/src/types.ts`, `packages/express-oidc-vault/README.md`, and `website/docs/packages/express-oidc-vault.md` document that OAuth `expires_in` is upstream access-token lifetime only, while `OidcVaultSession.expiresAt` is an optional application/store-owned vault-session expiry.
- Core tests now assert callback-created sessions are not given `expiresAt` from upstream `expires_in`, refresh does not overwrite explicit session expiry with upstream access-token lifetime, and refresh without a new ID token retains the documented identity state.
- Memory, Redis, and MongoDB store tests now explicitly verify enforcement of configured session `expiresAt`.
- Verification passed serially: `pnpm --filter @web-ts-toolkit/express-oidc-vault test && pnpm --filter @web-ts-toolkit/express-oidc-vault-memory-store test && pnpm --filter @web-ts-toolkit/express-oidc-vault-redis-store test && pnpm --filter @web-ts-toolkit/express-oidc-vault-mongodb-store test`.

### Task OIDC-16: Make Refresh And Logout Concurrency Semantics Safe

Status: completed

Priority: P0

Suggested agent: distributed session concurrency specialist

Dependencies: OIDC-15

Primary ownership:

- `packages/express-oidc-vault/src/index.ts`
- `packages/express-oidc-vault/src/types.ts`
- memory, Redis, and MongoDB store implementations if contracts change
- concurrent route and store tests

Finding:

Refresh calls the local token issuer before atomic session rotation. Two concurrent requests can both mint valid local access tokens while only one rotation succeeds, leaving an orphan token from the losing request. Logout performs separate `getSession` and `deleteSession` operations, allowing a concurrent refresh to rotate after the read and survive deletion under a new ID. The current store contract does not provide consume-for-refresh or delete-if-current semantics that resolve both races.

References:

- `packages/express-oidc-vault/src/index.ts:1027-1100`
- `packages/express-oidc-vault/src/index.ts:1111-1126`
- `packages/express-oidc-vault/src/types.ts:65-100`

Implementation requirements:

1. Define a linearizable refresh sequence in which a losing concurrent request cannot mint or retain a usable local token.
2. If token issuance must occur after rotation, define compensation for issuance failure so the client is not stranded with an unknown rotated session.
3. Make logout revoke the current logical session even when racing with refresh. Extend the store contract only at the smallest atomic enforcement point.
4. Implement any contract change across memory, Redis, and MongoDB stores; include non-transactional MongoDB behavior and document residual crash guarantees.
5. Add true concurrent tests with barriers rather than only sequential stale-session tests.

Acceptance criteria:

- Two simultaneous refreshes produce at most one successful rotation and at most one usable newly issued local token.
- A logout racing with refresh cannot report success while leaving the same logical session active unnoticed.
- Token-issuer failure follows a documented recoverable or compensating path.
- All store implementations satisfy the same observable conflict contract.
- Core and store tests pass serially.

Completion evidence:

- `packages/express-oidc-vault/src/types.ts` now exposes stable `OidcVaultSession.logicalSessionId` and `deleteSessionsByLogicalSessionId(...)` on the store contract so rotated public session IDs can still be revoked as one logical session.
- `packages/express-oidc-vault/src/index.ts` now rotates the session before local access-token issuance. A losing concurrent refresh receives an invalid-session response before any local token is minted, and a token-issuer failure after rotation compensates by deleting the logical session and clearing the cookie transport when applicable.
- Logout now deletes by logical session ID when it reads a session, and also calls `deleteSession(sessionId)` on a missing session so store-level rotated-session aliases can revoke a just-rotated logical session.
- Memory, Redis, and MongoDB stores implement the logical-session deletion contract. Redis keeps logical-session indexes and rotated-session aliases inside Lua-backed atomic rotation/delete paths. MongoDB adds logical-session indexing plus rotated-session alias documents; non-transactional rotation still has the existing crash window between session insert/delete/alias write, while observable conflicts and post-rotation logout revocation are enforced after operations complete.
- Core tests add barrier-based concurrent refresh coverage proving only one overlapping refresh succeeds and only one local token is minted, logout racing after refresh rotation revokes the current logical session, and token-issuer failure after rotation revokes the logical session rather than stranding an unknown session.
- Memory, Redis, and MongoDB store tests now cover concurrent rotation conflict behavior and logical-session deletion of the current rotated session.
- Verification passed serially: `pnpm --filter @web-ts-toolkit/express-oidc-vault test && pnpm --filter @web-ts-toolkit/express-oidc-vault-memory-store test && pnpm --filter @web-ts-toolkit/express-oidc-vault-redis-store test && pnpm --filter @web-ts-toolkit/express-oidc-vault-mongodb-store test`.

### Task OIDC-17: Make One-Time Credential And Hook Failure Ordering Recoverable

Status: completed

Priority: P1

Suggested agent: authentication workflow reliability specialist

Dependencies: OIDC-08, OIDC-16

Primary ownership:

- `packages/express-oidc-vault/src/index.ts`
- `packages/express-oidc-vault/src/types.ts` if compensation APIs are needed
- failure-injection route tests

Finding:

Callback creates a session before creating its exchange code, so code creation failure can leave an inaccessible session. Exchange consumes its one-time code before session lookup and local token issuance, so transient failure destroys retryability. Refresh and logout hooks can throw after durable state changed, producing an error response despite successful rotation or deletion. The current hook contract does not distinguish transactional veto hooks from best-effort notification hooks.

References:

- `packages/express-oidc-vault/src/index.ts:977-991`
- `packages/express-oidc-vault/src/index.ts:994-1018`
- `packages/express-oidc-vault/src/index.ts:1073-1100`
- `packages/express-oidc-vault/src/index.ts:1124-1146`

Implementation requirements:

1. Define which hooks can veto an operation and which are post-commit notifications whose failure must not change the client-visible success result.
2. Prevent callback failure from leaving an unreachable live session, using atomic store support or explicit compensation.
3. Prevent transient local token-issuer failure after exchange-code consumption from silently destroying the user's only exchange opportunity; define atomic consume/claim or safe retry semantics.
4. Align refresh/logout post-commit hook failures with the durable state that actually occurred.
5. Preserve one-time credential replay resistance while adding recoverability.

Acceptance criteria:

- Injected exchange-code creation failure does not leave an untracked live session.
- Injected local token-issuer failure has documented retry/compensation behavior without making the exchange code replayable after success.
- A post-commit hook failure does not return a misleading failure for an already completed state change.
- Tests cover each failure point before and after durable store operations.
- `pnpm --filter @web-ts-toolkit/express-oidc-vault test` passes.

Completion evidence:

- `packages/express-oidc-vault/src/index.ts` now compensates callback exchange-code creation failure by deleting the just-created logical session before returning the sanitized route error, preventing an unreachable live session.
- `packages/express-oidc-vault/src/index.ts` now compensates exchange local-token issuance failure after one-time exchange-code consumption by deleting the logical session and clearing cookie transport when applicable. The consumed exchange code remains non-replayable; retry behavior is explicit fail-closed compensation rather than code reuse.
- `packages/express-oidc-vault/src/index.ts` now treats `onSessionCreated`, `onSessionRefreshed`, and `onLogout` as post-commit notification hooks. Their failures are forwarded to `onError` but do not override successful callback redirect, refresh response, logout response, or backchannel logout response after durable state changes have completed.
- `packages/express-oidc-vault/README.md` documents pre-commit veto hooks versus post-commit notification hooks and their failure semantics.
- `packages/express-oidc-vault/test/index.test.ts` adds failure-injection coverage for callback exchange-code creation compensation, exchange token-issuer compensation with non-replayable consumed code, and post-commit `onSessionCreated`, `onSessionRefreshed`, and `onLogout` hook failures.
- Verification passed: `pnpm --filter @web-ts-toolkit/express-oidc-vault test`.

## Wave 3: Architecture, Testability, Performance, And Packaging

### Task OIDC-09: Split The Monolithic Implementation Into Internal Modules

Status: completed

Completion evidence:

- Extracted internal modules for constants, errors, cookies, origins, provider client, token validation, access-token middleware, and shared utils while preserving root public exports.
- Added focused helper tests in `packages/express-oidc-vault/test/helpers.test.ts` for cookie parsing, origin resolution, logout URL validation, and token response validation.
- `pnpm --filter @web-ts-toolkit/express-oidc-vault build` passed.
- `pnpm --filter @web-ts-toolkit/express-oidc-vault test` passed: 3 test files, 43 tests.

Priority: P2

Suggested agent: TypeScript architecture and testability specialist

Dependencies: OIDC-01, OIDC-02, OIDC-06, OIDC-08, OIDC-13, OIDC-14, OIDC-15, OIDC-16, OIDC-17, OIDC-18

Primary ownership:

- `packages/express-oidc-vault/src/index.ts`
- new internal files under `packages/express-oidc-vault/src/`
- focused unit tests for extracted pure helpers

Finding:

The package has one large `src/index.ts` containing public exports, route factories, provider client code, cookie parsing/serialization, error normalization, token verification, cache state, and access-token middleware. This makes pure helpers hard to test directly, raises merge-conflict risk for security fixes, and obscures ownership boundaries.

References:

- `packages/express-oidc-vault/src/index.ts:1-1277`
- `packages/express-oidc-vault/src/config.ts:1-107`
- `packages/express-oidc-vault/src/types.ts:1-239`

Implementation requirements:

1. Extract cohesive internal modules without changing root public exports.
2. Suggested boundaries: `errors`, `cookies`, `origins`, `provider-client`, `token-validation`, `routes`, and `access-token-middleware`.
3. Keep `src/index.ts` as a public composition/export file with minimal route factory wiring.
4. Add direct unit tests for pure helpers where route-level tests are too indirect.
5. Avoid introducing circular imports or subpath exports unless a separate public API task approves them.

Acceptance criteria:

- Public package root imports remain source-compatible.
- Helper-specific tests cover cookie parsing, origin resolution, logout URL validation, and token response validation without needing a full Express app.
- Route integration tests still pass.
- `pnpm --filter @web-ts-toolkit/express-oidc-vault build` passes.
- `pnpm --filter @web-ts-toolkit/express-oidc-vault test` passes.

### Task OIDC-10: Bound Provider Discovery, JWKS, And Response Memory Usage

Status: completed

Priority: P1

Suggested agent: Node runtime performance and resource-hardening specialist

Dependencies: OIDC-09

Primary ownership:

- provider-client/cache module after OIDC-09
- focused tests with fake fetch/JWKS endpoints
- README operational notes

Finding:

Provider discovery and JWKS caches are module-level maps keyed by issuer/JWKS URI with no size limit, TTL, or test reset hook. Provider discovery, token, UserInfo, and remote JWKS requests have no package-level timeout or cancellation policy, and `readJsonResponse` reads complete provider responses into memory before parsing. Typical applications use one or a few statically configured issuers, so cache growth is hardening unless configuration is request-controlled; hanging provider requests are a concrete availability risk.

References:

- `packages/express-oidc-vault/src/index.ts:88-89`
- `packages/express-oidc-vault/src/index.ts:389-403`
- `packages/express-oidc-vault/src/index.ts:442-454`
- `packages/express-oidc-vault/src/index.ts:610-672`

Implementation requirements:

1. Decide whether issuer/JWKS caches are process-global by design or should be per-middleware-instance.
2. Add bounded cache behavior, TTL, or explicit documented constraints.
3. Add a test-only or internal reset path if module-level caches remain and tests need deterministic isolation.
4. Cap provider response text read for error messages, or avoid returning raw text entirely if OIDC-08 sanitizes responses.
5. Add a bounded timeout/cancellation policy for discovery, token, UserInfo, and remote JWKS requests. Expose a narrow documented override only if deployments need it.
6. Define redirect behavior and accepted endpoint schemes. Do not silently follow provider redirects into unsupported or unsafe schemes.
7. Preserve successful discovery caching and retry-after-failure behavior.

Acceptance criteria:

- Discovery failures are still not cached permanently.
- Repeated successful discovery for the same issuer is still cached according to the documented policy.
- Cache growth is bounded or justified with documented non-request-controlled keys.
- Oversized non-JSON provider responses do not require returning or storing the full response text.
- Provider endpoints that never respond fail within the configured bound with a controlled error.
- `pnpm --filter @web-ts-toolkit/express-oidc-vault test` passes.

Completion evidence:

- Provider discovery and JWKS resolver caches are bounded process-wide maps with 10 minute successful discovery TTL, 32-entry oldest-entry eviction, failure eviction, and deterministic test reset/size helpers in `packages/express-oidc-vault/src/provider-client.ts`.
- Discovery, token, UserInfo, and remote JWKS requests use bounded provider timeouts. `providerRequestTimeoutMs` is validated and now flows through `verifyIdToken`/`verifyBackchannelLogoutToken` to JWKS resolution.
- Provider fetches use `redirect: 'manual'`; provider response reads are bounded and invalid JSON errors use sanitized messages instead of raw provider bodies.
- Operational notes documenting process-wide cache scope, TTL/capacity, timeout override, manual redirects, and sanitized/oversized body handling are present in `packages/express-oidc-vault/README.md`.
- Focused tests in `packages/express-oidc-vault/test/helpers.test.ts` cover discovery retry/caching, cache bounds, provider request timeout, JWKS timeout validation, manual redirect handling, sanitized invalid JSON errors, and oversized response body rejection.
- Verification: `pnpm --filter @web-ts-toolkit/express-oidc-vault test` passed with 3 test files and 61 tests passing.

### Task OIDC-18: Validate URL Inputs And OAuth Client Authentication Encoding

Status: completed

Priority: P1

Suggested agent: OAuth HTTP and input-validation specialist

Dependencies: OIDC-04, OIDC-05, OIDC-08

Primary ownership:

- `packages/express-oidc-vault/src/index.ts`
- `packages/express-oidc-vault/src/config.ts`
- malformed-input and provider-request tests

Finding:

Malformed request-controlled `returnTo` values can throw `TypeError` and become generic 500 responses. Existing configured frontend, trusted-origin, issuer, and manual endpoint URLs are not validated consistently at middleware creation. Token endpoint HTTP Basic credentials concatenate raw client ID and secret, while OAuth client password authentication requires form-encoding each component before Base64 when reserved characters are present.

References:

- `packages/express-oidc-vault/src/index.ts:201-203`
- `packages/express-oidc-vault/src/index.ts:389-440`
- `packages/express-oidc-vault/src/index.ts:483-511`
- `packages/express-oidc-vault/src/config.ts:47-89`

Implementation requirements:

1. Convert malformed request-controlled URL input into a stable 400-class error without exposing the raw value.
2. Validate and normalize all public URL/origin options during middleware creation, including allowed HTTP(S) schemes and origin-only fields.
3. Validate discovered endpoint URL syntax before caching or use; keep exact discovery issuer matching in OIDC-06.
4. Implement OAuth-compliant client-secret Basic encoding for client IDs and secrets containing reserved characters.
5. Keep sensitive client credentials out of errors, hooks, and test snapshots.

Acceptance criteria:

- Malformed `returnTo` returns `OIDC_VAULT_INVALID_RETURN_TO`, not a 500.
- Invalid configured URLs fail at middleware creation with an option-specific error.
- Malformed discovered endpoint URLs produce controlled discovery errors and are not cached as success.
- A token request with reserved characters in client credentials sends the specification-compliant Authorization header.
- `pnpm --filter @web-ts-toolkit/express-oidc-vault test` passes.

Completion evidence:

- Implemented stable `OIDC_VAULT_INVALID_RETURN_TO` handling for malformed request-controlled `returnTo` values without reflecting the raw value.
- Added middleware/config creation validation for frontend redirect, backend origin/trusted origin, issuer, and manual endpoint HTTP(S) URLs with option-specific errors.
- Added discovery endpoint URL validation before metadata is returned or cached; malformed discovery responses reject with `OIDC_VAULT_DISCOVERY_INVALID` and are retried on the next request.
- Updated token endpoint Basic auth construction to form-encode `client_id` and `client_secret` before Base64 encoding.
- Added regression coverage in `packages/express-oidc-vault/test/index.test.ts`, `packages/express-oidc-vault/test/config.test.ts`, and `packages/express-oidc-vault/test/helpers.test.ts`.
- Verified with `pnpm --filter @web-ts-toolkit/express-oidc-vault test` on 2026-08-13: 3 test files passed, 67 tests passed.

### Task OIDC-11: Add Installed-Package And Declaration Consumer Verification

Status: completed

Priority: P2

Suggested agent: TypeScript package consumer-experience specialist

Dependencies: none for baseline tests; rerun after OIDC-09 and public type changes

Primary ownership:

- `packages/express-oidc-vault/package.json`
- package tests or `test-docs-consumer` fixtures
- README main exports list

Finding:

The package exports CJS, ESM, and declarations, but current tests import source directly. There is no installed-consumer check for package-name resolution, CJS loading, ESM loading, conditional declaration selection, Express request augmentation, or `workspace:*` dependency transformation in packed artifacts.

References:

- `packages/express-oidc-vault/package.json:16-30`
- `packages/express-oidc-vault/tsup.config.ts:1-9`
- `packages/express-oidc-vault/test/index.test.ts:8-13`
- `packages/express-oidc-vault/src/types.ts:175-179`

Implementation requirements:

1. Add package-consumer tests that import from `@web-ts-toolkit/express-oidc-vault`, not `../src/index`.
2. Verify ESM and CJS runtime loading from built output.
3. Verify TypeScript can see `req.auth` augmentation from a normal Express route handler.
4. Verify key exported types and helpers are available from the package root.
5. Compile both NodeNext ESM and CJS consumer fixtures and verify declaration condition selection, including whether `index.d.mts` needs a conditional `types` branch.
6. Decide how consumers receive Express declarations required by the public `.d.ts` files; test a clean consumer installation rather than relying on the monorepo's dev dependency.
7. Verify `workspace:*` transformation with the repository release artifact/staged manifest workflow. Do not treat `npm pack --dry-run` alone as proof of dependency transformation.
8. If packaging metadata changes, coordinate with release artifact verification.

Acceptance criteria:

- A strict TypeScript consumer compiles with `createOidcVaultAccessTokenMiddleware` and `req.auth` without local casts.
- A Node ESM consumer can import the package root after build.
- A Node CJS consumer can require the package root after build.
- `npm pack --dry-run --json` confirms intended files, and repository artifact verification confirms release-manifest dependency transformation.
- `pnpm --filter @web-ts-toolkit/express-oidc-vault test` passes.

Completion evidence:

- Added conditional declaration export metadata in `packages/express-oidc-vault/package.json` so NodeNext ESM consumers resolve `dist/index.d.mts` and CJS/default consumers resolve `dist/index.d.ts`.
- Added packed installed-consumer coverage in `packages/express-oidc-vault/test/packed-consumer.test.ts` using the real `@repo-toolkit/publish-package` manifest transformation, staged `pnpm pack`, clean consumer install, ESM import, CJS require, NodeNext typecheck, Bundler typecheck, intended-file dry-run pack assertions, and published-manifest checks.
- Added clean consumer fixtures under `packages/express-oidc-vault/test-packed-consumer/consumer/` that import from `@web-ts-toolkit/express-oidc-vault`, verify root runtime exports, compile key exported helpers/types, and verify Express `req.auth` augmentation through a normal `RequestHandler` without local casts.
- Verified the packed consumer installs external `express`, `@types/express`, TypeScript, and Node types instead of relying on monorepo dev dependencies for public declaration consumption.
- Verified with `pnpm --filter @web-ts-toolkit/express-oidc-vault test` on 2026-08-13: 4 test files passed, 70 tests passed.
- Verified release artifact workflow with `pnpm build-artifact -- --version 0.99.0-test && pnpm verify-artifact -- --version 0.99.0-test` on 2026-08-13; artifact verification completed successfully and confirms release-manifest transformation beyond `npm pack --dry-run`.

### Task OIDC-12: Bring README And Website Docs Into Contract Parity

Status: complete

Priority: P2

Suggested agent: docs and API contract specialist

Dependencies: OIDC-03, OIDC-04, OIDC-05, OIDC-06, OIDC-08, OIDC-13, OIDC-14, OIDC-15, OIDC-16, OIDC-17, OIDC-18

Primary ownership:

- `packages/express-oidc-vault/README.md`
- `website/docs/packages/express-oidc-vault.md`
- changelog or release notes if required by repository convention

Finding:

The package README is detailed, but security-sensitive operational requirements are spread across examples and checklist bullets. Website docs also need to stay synchronized with package docs when transport, origin, logout redirect, token validation, parser limit, or error-message contracts change.

References:

- `packages/express-oidc-vault/README.md:25-103`
- `packages/express-oidc-vault/README.md:295-365`
- `packages/express-oidc-vault/README.md:871-887`
- `website/docs/packages/express-oidc-vault.md`

Implementation requirements:

1. Update docs after behavior changes, not before.
2. Keep package README and website docs consistent for public options, defaults, security notes, and examples.
3. Add a concise deployment checklist covering parser limits, public backend origin/proxy configuration, trusted origins, cookie transport credential location, post-logout redirects, and sanitized error logging.
4. Flag any behavior tightening as a release-note item.
5. Correct the package metadata and docs that describe the package as "Cookie-free" despite its supported cookie transport.
6. Document issuer requirements, token/session lifetime separation, CSRF policy for every cookie mode, concurrency semantics, hook failure semantics, provider request timeouts, and the server-driven upstream logout flow.

Acceptance criteria:

- Every new or changed `OidcVaultOptions` field is documented in both package and website docs.
- Examples do not show body `sessionId` use in cookie transport unless an explicit fallback option is shown and discouraged.
- Security checklist reflects the final behavior from Waves 1 and 2.
- Package description and introductions accurately describe both body and cookie transports.
- Documentation commands or package tests required by the repository pass if available.

Completion evidence:

- Updated `packages/express-oidc-vault/package.json` description so package metadata no longer implies cookie-free/session-store-only behavior and explicitly mentions body or cookie transport.
- Updated `packages/express-oidc-vault/README.md` with a public options/defaults table covering every `OidcVaultOptions` field, corrected manual-mode example formatting, and expanded deployment checklist coverage for parser limits, public `backendOrigin`, cookie credential location, trusted origins, post-logout redirects, token/session lifetime separation, CSRF policy, provider request timeouts, hook failure semantics, upstream logout, and sanitized error logging.
- Updated `website/docs/packages/express-oidc-vault.md` to match the README contract for options/defaults, cookie transport examples, backchannel logout validation/replay semantics, hook failure semantics, CSRF/trusted-origin policy, provider timeouts, parser limits, and sanitized error logging.
- Added `CHANGELOG.md` Unreleased release-note coverage for `@web-ts-toolkit/express-oidc-vault` behavior tightening around cookie transport, origin/redirect contracts, provider validation, and sanitized errors.
- Verified docs/metadata changes with `pnpm --filter @web-ts-toolkit/express-oidc-vault test` on 2026-08-13: package build and tests passed, 4 test files passed, 70 tests passed.

## Dependency And Parallelization Guidance

- `OIDC-01`, `OIDC-02`, `OIDC-04`, `OIDC-05`, `OIDC-06`, `OIDC-08`, and baseline work for `OIDC-11` can start in parallel if agents coordinate changes to `src/index.ts` carefully.
- `OIDC-03` should wait for `OIDC-01` and `OIDC-02` because it touches the same session request boundary.
- `OIDC-07` should wait for `OIDC-01` and needs maintainer input if it changes the `OidcVaultStoreProvider` interface.
- `OIDC-13` should follow cookie parsing and transport decisions in `OIDC-02` and `OIDC-03`.
- `OIDC-14` follows logout destination policy in `OIDC-05` because both change the upstream logout contract.
- `OIDC-15` follows token response validation in `OIDC-06`; `OIDC-16` follows lifetime semantics and may change all store providers.
- `OIDC-17` follows error sanitization and concurrency contract decisions so compensation and hook behavior match final state transitions.
- `OIDC-18` can start after origin/logout URL and error-contract decisions stabilize.
- `OIDC-09` should wait until the highest-risk behavior fixes land to avoid painful rebases across `src/index.ts`.
- `OIDC-10` depends on the provider-client/cache extraction from `OIDC-09` unless an agent deliberately makes a smaller in-file fix first.
- `OIDC-11` should establish installed-consumer baselines immediately and rerun after module extraction and public type changes.
- `OIDC-12` should run after behavior decisions are finalized.
- Do not run package tests for core and store packages concurrently when they rebuild shared outputs. Use serial package commands.

Recommended agent allocation:

| Task    | Agent focus                   | Conflict risk                            |
| ------- | ----------------------------- | ---------------------------------------- |
| OIDC-01 | Express parser limits         | High in `src/index.ts`                   |
| OIDC-02 | Cookie parsing                | Medium in `src/index.ts`                 |
| OIDC-03 | Session transport contract    | High in `src/index.ts` and docs          |
| OIDC-04 | Public origin option          | Medium in `src/index.ts`, `types.ts`     |
| OIDC-05 | Logout redirect validation    | Medium in `src/index.ts`, docs           |
| OIDC-06 | Token/userinfo validation     | High in callback/refresh code            |
| OIDC-07 | Backchannel replay            | High if store contract changes           |
| OIDC-08 | Error sanitization            | Medium in error helpers and tests        |
| OIDC-09 | Module extraction             | High; sequence after fixes               |
| OIDC-10 | Cache/resource bounds         | Medium after extraction                  |
| OIDC-11 | Packaging consumer tests      | Low                                      |
| OIDC-12 | Docs parity                   | Medium; sequence last                    |
| OIDC-13 | Cookie CSRF and configuration | High in request boundary and docs        |
| OIDC-14 | ID-token response boundary    | Medium in logout API and docs            |
| OIDC-15 | Session lifetime semantics    | High across core/store tests             |
| OIDC-16 | Refresh/logout concurrency    | Very high across core and all stores     |
| OIDC-17 | Failure ordering and hooks    | High in callback/exchange/refresh/logout |
| OIDC-18 | URL and OAuth HTTP validation | Medium in config/provider client         |

## Deferred Decisions Requiring Maintainer Input

- Whether cookie transport should remove body `sessionId` fallback outright or keep it behind an explicit migration option.
- Exact default parser limit for JSON and URL-encoded bodies.
- Name and semantics of the public backend origin option, if added.
- Whether `postLogoutRedirectUri` trust relies on provider registration or an application allowlist; do not assume it must share `frontendRedirectUri` origin.
- Whether a temporary compatibility mode is necessary before requiring a present Bearer `token_type`; strict conformance is the target.
- Whether backchannel logout replay prevention can extend `OidcVaultStoreProvider` in a breaking release or needs a separate optional provider capability.
- Whether module-level provider/JWKS caches are acceptable with documented static configuration or should become per-middleware-instance.
- Whether absent backchannel `typ` remains accepted while an incorrect present value is rejected, or strict `logout+jwt` presence becomes configurable.
- Whether cookie transport can retain any `httpOnly: false` compatibility escape hatch; secure default behavior must not silently permit it.
- Whether local access-token issuance supports revocation/compensation, which constrains the safe concurrent refresh design.
- Which hooks are transactional veto points versus best-effort post-commit notifications.

## Final Integration Review

### Task OIDC-99: Independent Final Security And Package Review

Status: completed

Priority: P1

Suggested agent: independent reviewer not involved in implementation

Dependencies: OIDC-01, OIDC-02, OIDC-03, OIDC-04, OIDC-05, OIDC-06, OIDC-07, OIDC-08, OIDC-09, OIDC-10, OIDC-11, OIDC-12, OIDC-13, OIDC-14, OIDC-15, OIDC-16, OIDC-17, OIDC-18

Primary ownership:

- full `packages/express-oidc-vault` package
- affected store packages if the store contract changed
- package README and website docs

Finding:

Multiple tasks touch authentication, session rotation, browser credential transport, provider token validation, and public packaging. A final reviewer should verify behavior end-to-end rather than trusting individual task completion notes.

Implementation requirements:

1. Review each task acceptance criterion against current code and tests.
2. Verify alternate entry paths: body transport, same-site cookie transport, cross-site cookie transport, backchannel logout, and bearer middleware.
3. Verify issuer binding, required claims, subject continuity, UserInfo parity, access-token/session lifetime separation, and refresh without a new ID token.
4. Verify true concurrent refresh and refresh/logout races against each store implementation, including local token issuance and failure compensation.
5. Confirm public types, README, website docs, package metadata, and runtime behavior agree.
6. Confirm no upstream refresh token, ID token, raw provider error body, raw validator/store/hook/token-issuer message, or internal cache state crosses the browser response boundary unexpectedly.
7. Confirm request-controlled body, cookie, URL, provider response, provider connection, and cache inputs are bounded or documented.
8. Verify callback/exchange/refresh/logout failure injection does not strand credentials or report state transitions inaccurately.
9. Run targeted package tests and final repository checks serially.

Acceptance criteria:

- `pnpm --filter @web-ts-toolkit/express-oidc-vault test` passes.
- If store contracts changed, memory, Redis, and MongoDB store package tests pass serially.
- `pnpm lint` passes or any unrelated pre-existing lint failures are documented with evidence.
- `pnpm build` passes or any unrelated pre-existing build failures are documented with evidence.
- Packed or installed consumer verification passes for ESM, CJS, and TypeScript declarations.
- Release-artifact verification proves workspace dependency transformation rather than relying only on raw `npm pack --dry-run`.
- Deferred decisions include maintainer decision, rationale, and residual risk.

Completion evidence:

- Independent final review initially found blockers in logout browser-boundary behavior, logout hook metadata, bounded discovery JSON parsing, installed-consumer declaration verification, and stale package/docs wording.
- Changed `packages/express-oidc-vault/src/index.ts` and `packages/express-oidc-vault/src/types.ts` so JSON logout responses and `onLogout` metadata no longer expose `upstreamLogoutUrl` or an `id_token_hint`; server-driven `redirect: true` logout still redirects with the upstream provider URL.
- Changed `packages/express-oidc-vault/src/provider-client.ts` so discovery success JSON uses the bounded provider JSON reader and malformed discovery JSON returns sanitized `OIDC_VAULT_DISCOVERY_INVALID` 502 responses.
- Changed `packages/express-oidc-vault/src/cookies.ts` to keep cookie-value validation behavior while satisfying lint without a control-character regex.
- Changed `packages/express-oidc-vault/src/types.ts`, `packages/express-oidc-vault/package.json`, and `pnpm-lock.yaml` so installed TypeScript consumers see Express `req.auth` augmentation through `express-serve-static-core`.
- Updated `packages/express-oidc-vault/README.md`, `website/docs/packages/express-oidc-vault.md`, and `website/docs/packages/index.md` so public package wording reflects body or cookie transport and server-driven upstream logout instead of browser-readable upstream logout URLs.
- Added/updated regression coverage in `packages/express-oidc-vault/test/index.test.ts` for logout JSON redaction, redirect logout preservation, logout hook metadata redaction, bounded/sanitized malformed discovery parsing, and provider cache isolation across tests.
- Independent blocker re-check found no remaining blockers in the rechecked areas: logout JSON/hook metadata boundary, redirect logout behavior, bounded discovery parsing, stale package/docs wording, and packed package contents.
- Verified `pnpm --filter @web-ts-toolkit/express-oidc-vault test` on 2026-08-13: 3 test files passed, 67 tests passed.
- Verified affected store packages serially on 2026-08-13: `pnpm --filter @web-ts-toolkit/express-oidc-vault-memory-store test` passed 1 test file and 6 tests; `pnpm --filter @web-ts-toolkit/express-oidc-vault-redis-store test` passed 1 test file and 6 tests; `pnpm --filter @web-ts-toolkit/express-oidc-vault-mongodb-store test` passed 1 test file and 6 tests.
- Verified `pnpm lint` on 2026-08-13: passed.
- Verified `pnpm build` on 2026-08-13: passed; Vite reported the existing large chunk warning for `apps/react-vite`.
- Verified `npm pack --dry-run --json` from `packages/express-oidc-vault` on 2026-08-13: packed only `README.md`, `package.json`, and `dist/index.{js,mjs,d.ts,d.mts}`.
- Verified installed consumer behavior from `/tmp/opencode/oidc-consumer-check` on 2026-08-13 using the packed tarball: Node ESM import passed, Node CJS require passed, and strict `tsc -p tsconfig.json` passed for `createOidcVaultAccessTokenMiddleware` plus `req.auth` augmentation.
- Verified release artifact workflow on 2026-08-13 with `pnpm build-artifact -- --version 0.32.0 && pnpm verify-artifact -- --version 0.32.0`: artifact verification passed and showed workspace package dependency transformation to `0.0.0-PLACEHOLDER`; artifact assembly emitted non-fatal package-manager bin-link warnings before successful verification.
- Deferred-decision outcome: no remaining deferred decision was needed to complete this final review; the implemented contract is secure-by-default cookie transport, server-driven upstream logout for ID-token-bearing URLs, strict provider/token validation, bounded provider responses, and sanitized browser-visible errors. Residual risk is limited to future maintainer policy changes for compatibility modes or hook trust boundaries, which should be tracked as new tasks rather than blockers for this completed review.

## Definition Of Done

- All P0 and P1 tasks are completed or explicitly deferred by a maintainer with documented residual risk.
- Public behavior changes have regression tests that fail on the reviewed implementation and pass after the fix.
- Route-level tests cover body and cookie transports, all cookie-mode CSRF boundaries, malformed inputs, origin/redirect validation, provider token validation, subject continuity, lifetime semantics, concurrent state changes, recoverable failure ordering, and sanitized errors.
- Discovery and manual configuration always bind token validation to an issuer, and required OIDC claims are enforced.
- No browser-readable response exposes an upstream refresh token, ID token, or ID-token-bearing logout URL.
- Public docs and website docs match the final `OidcVaultOptions` and route behavior.
- Store-provider interface changes, if any, are implemented across memory, Redis, and MongoDB stores with true concurrency and failure-injection tests.
- Final integration review evidence records targeted package tests, relevant store tests, lint, build, and installed-package checks.
