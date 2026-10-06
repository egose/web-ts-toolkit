# Express OIDC Vault Residual Business And Boundary Health

Created: 2026-09-19 21:44:40 (local)

## Objective and product requirements

Review and implement actionable residual improvements in `packages/express-oidc-vault`. This product is an Express OIDC gateway for browser applications: upstream refresh/ID tokens remain in server-side stores, short-lived exchange codes bootstrap a browser session, refresh rotates its public handle, application token issuers enable API authentication, and local/provider logout revokes refresh-session lineages. Business requirements include predictable login configuration, bounded upstream failures, enforceable session lifetime, separation of provider/client identities, and a deliberately small browser credential response.

Scope: core source, focused regressions, shipped types/README, and matching website documentation. No root `CHANGELOG.md` edits, commits, generated-output edits, storage-engine redesign, or unrelated worktree changes. Each task runs in a fresh sub-agent session, strictly sequentially (including builds). The final reviewer is independent of implementers.

## Analysis coverage and baseline

- Inspected route orchestration (`src/index.ts`), public types, config/provider HTTP and cache boundaries, token validation, bearer middleware, cookies/origins, package metadata/build configuration, README, and relevant existing tests. A read-only analysis agent checked remaining modules and reproduced cleanup/endpoint cases with in-memory streams.
- Reviewed prior core plans `20260813-125834-express-oidc-vault-review-remediation.md`, `20260908-070811-express-oidc-vault-boundary-review.md`, and relevant entries of `20260908-130120-oidc-vault-stores-health-follow-up.md` for deduplication.
- Initial worktree has extensive unrelated modified/untracked files; core vault source was clean. Preserve all existing work, including changes in store-package tests.
- No fresh package/full-repository baseline suite was run during planning. Existing historical passes are not current verification. Current generated declarations require rebuilding before consumer conclusions.
- Coverage is a targeted residual review, not a real-browser/live-IdP interoperability audit. Performance work here concerns demonstrable completion bounds, not speculative throughput gains.

## Existing work and consequential exclusions

- BOV-02-FU1 (browser-bound login/callback/exchange) and BOV-03-FU1/FU2 (cross-instance upstream refresh reservation and stale cookie response ordering) remain proposed under the prior boundary-review document. Their experiments reproduced login/session swapping and refresh-family loss. These require coordinated browser/store protocol design; this core-only residual plan does not claim to resolve them. Keep them visible in consumer operational guidance and the final report.
- JWT purpose/mandatory-expiry policy and opaque credential whitespace remain decisions in the prior plan; do not silently change them here.
- OIDC-15 already separated upstream token expiry from session expiry. OVH-03 adds an opt-in application policy at the existing boundary, promoting the previously deferred lifetime usability improvement without changing the unset default or store contract.
- SVH-05 already established finite rotation-alias retention. OVH-06 corrects the remaining core README overstatement by referencing that outcome, without reopening store behavior.
- No speculative OAuth feature expansion (device flow/PAR/DPoP), rate-limit service, or broad module rewrite is required.

## Priorities, verification, and completion rules

P1: credential/identity integrity. P2: contained reliability, usability, or maintainability. Tasks must be `pending`, `in_progress`, `blocked`, or `completed`; completion requires acceptance evidence, not just edits. Record new independent findings before expanding scope.

Commands run from repo root unless stated:

- V1 focused: from `packages/express-oidc-vault`, `pnpm exec vitest run --config ../../vitest.config.ts <focused-test-files>`. Use existing fixture patterns and meaningful negative/boundary tests.
- V2 package: `pnpm --filter @web-ts-toolkit/express-oidc-vault test` (build + all core tests + packed CJS/ESM/strict TypeScript consumers).
- V3 scoped quality: `pnpm exec eslint "packages/express-oidc-vault/**/*.{ts,js,mts,cts}"` and `git diff --check` for owned files.
- V4 final integration: run `pnpm lint`, `pnpm build`, `pnpm test` serially; record unrelated failures precisely rather than editing unrelated work. These are repository health evidence; task acceptance requires V1–V3 for the changed package. A reproducible unrelated root failure does not establish core failure, and must remain explicit in final evidence.
- V5 consumer surface: `npm pack --dry-run --json` from the package; inspect freshly emitted public declarations. V2's actual packed consumer checks are authoritative over file-list checks. No release-artifact assembly required because the asdf tool artifact is outside this package change.
- Store suites are required only if shared store behavior/contracts change. Existing portable fields remain unchanged by this plan.

## Sequential tasks

### Task OVH-01: Bound provider cleanup and classify transport failures

Status: completed

Kind: defect

Priority: P2; provider cancellation can outlive the advertised deadline, and network failures are misclassified as internal failures.

Suggested agent: Node HTTP resource-boundary implementer

Dependencies: none

Primary ownership: `packages/express-oidc-vault/src/provider-client.ts`, `src/errors.ts` only if needed, provider resource/boundary regressions.

Finding: `readBoundedResponseText` awaits `reader.cancel()` in timeout/overflow paths; provider/JWKS finalization also awaits cancellation. A stream whose cancel promise never settles defeats request completion. Non-abort fetch/read rejections escape as generic internal 500s. Existing BOV-04 fixtures use promptly resolving cancellation; BOV-06 covers HTTP/JSON failures, not transport resets.

References: `src/provider-client.ts` `fetchProvider` (177–205), `readBoundedResponseText` (218–309), `createBoundedJwksFetch` (327–379), discovery/token/UserInfo `finally` blocks; `test/bov-04-provider-resource.test.ts`, `test/bov-06-provider-boundary.test.ts`.

Requirements:

1. Centralize best-effort cancellation that is attempted promptly but never gates deadline/overflow/error delivery indefinitely. Handle synchronous throws and rejected cancellation without unhandled rejection; release listeners/read locks/timers where possible.
2. Normalize pre-header and mid-body transport failures to sanitized endpoint-specific 502s; preserve original diagnostics through internal cause/error context. Preserve JOSE timeout semantics and existing cache isolation/limits.
3. Record the custom-stream limitation honestly: no native-undici remote exploit is established.

Acceptance criteria:

- Pending/rejecting cancellation cannot hang timeout, overflow, or non-200 JWKS paths; bounded tests observe prompt failure and attempted cleanup.
- Discovery/token/UserInfo network rejection and body-reset cases carry appropriate sanitized codes; private diagnostic causes remain available.
- Existing provider cache/request-count and successful JWKS regressions pass; no unhandled rejections.

Verification: V1 provider suites, V2, scoped eslint. Supply contract notes for OVH-06.

Completion evidence:

- Changed: `packages/express-oidc-vault/src/provider-client.ts`; added `packages/express-oidc-vault/test/ovh-01-provider-transport.test.ts`; updated only OVH-01 in this task file. No `src/errors.ts` change was needed.
- Implementation: all reader/response cancellation uses one promptly invoked, non-blocking best-effort helper that observes rejected promises and catches synchronous throws. Body-read finalization releases locks/listeners, and provider finalizers clear their deadline timers. Non-abort fetch/body failures become sanitized endpoint-specific 502 errors with the exact original diagnostic stored in a non-enumerable `cause`.
- V1 (package directory): `pnpm exec vitest run --config ../../vitest.config.ts test/ovh-01-provider-transport.test.ts test/bov-04-provider-resource.test.ts test/bov-06-provider-boundary.test.ts` — final run **3 files / 132 tests passed**, including **73 new regressions**. An earlier run before adding already-aborted-header coverage passed 121 tests. Coverage includes pending/rejecting/throwing cancellation, timeout/overflow/truncation/non-200 JWKS paths, released read locks, cleared success timers, pre-header and partial-body transport failures, private cause identity/non-enumerability, actual middleware `onError` versus HTTP serialization, and discovery retry/cache request counts. No unhandled rejections observed; existing real-JWKS success/limits and cache isolation tests pass.
- V2 (root): `pnpm --filter @web-ts-toolkit/express-oidc-vault test` — build/declaration emission succeeded; **20 files / 333 tests passed**, including packed CJS/ESM and strict TypeScript consumers.
- V3 (root): `pnpm exec eslint "packages/express-oidc-vault/**/*.{ts,js,mts,cts}"` — passed. `git diff --check -- packages/express-oidc-vault/src/provider-client.ts packages/express-oidc-vault/test/ovh-01-provider-transport.test.ts docs/tasks/20260926-214440-express-oidc-vault-residual-health.md` — passed; untracked owned-file whitespace also checked with `git diff --no-index --check /dev/null <file>`. Vite emitted its existing root-config CommonJS/native-loader advisory; no test failures.
- OVH-06 docs handoff: document that pre-header network rejection and mid-body transport reset return HTTP 502 with `OIDC_VAULT_DISCOVERY_FAILED`, `OIDC_VAULT_TOKEN_REQUEST_FAILED`, or `OIDC_VAULT_USERINFO_FAILED`, and public message `OIDC provider request failed.` Original diagnostics are available privately at `hooks.onError` context `error.cause` (narrow the context's unknown error before reading it), not in the browser payload. JWKS transport failures use `OIDC_VAULT_JWKS_FAILED`; JOSE timeouts still use `ERR_JWKS_TIMEOUT`. Existing discovery success-body timeout/size/JSON classification remains `OIDC_VAULT_DISCOVERY_INVALID`; this change distinguishes transport resets from malformed metadata. Provider deadlines continue through body reads, and byte/key/cache limits and timeout-policy isolation are retained.
- OVH-06 limitation wording: cancellation is attempted promptly but its promise is not awaited; request completion does not guarantee that an uncooperative custom stream finishes resource cleanup. Hanging-cancellation evidence uses custom streams; **no native-undici remote exploit is established**. README/website edits belong to OVH-06.
- Scope/result: no blockers or new independent findings. Root integration checks remain for OVH-07; no root CHANGELOG edits or commits, and existing unrelated worktree changes were preserved.

### Task OVH-02: Honor all configured endpoints and reject malformed discovery capabilities

Status: completed

Session: fresh isolated sequential OVH-02 implementation; OVH-01 completion evidence reviewed and dependency confirmed completed. No spawned agents.

Kind: defect

Priority: P2; explicit configuration is silently ignored and corrupted metadata silently disables UserInfo/logout capabilities.

Suggested agent: OIDC metadata/configuration implementer

Dependencies: OVH-01

Primary ownership: `src/config.ts`, `src/provider-client.ts` metadata validation, `test/config.test.ts`, focused provider-boundary tests.

Finding: `resolveOidcVaultConfig` detects manual mode using only required endpoint fields, so an optional `userInfoEndpoint` or `endSessionEndpoint` alone is dropped. `discoverIssuerMetadata` treats present non-string optional endpoints as missing and caches success. This contradicts the public any-manual-endpoint rule and bypasses malformed-value validation.

References: `src/config.ts` `MANUAL_CONFIG_REQUIREMENTS`, `resolveOidcVaultConfig` (125–143); `src/provider-client.ts` `discoverIssuerMetadata` (596–603); `src/types.ts` `OidcVaultConfig.issuer`.

Requirements:

1. Separate manual-mode selectors from required fields; any nonempty manual endpoint selects manual mode, requiring the complete manual set. Preserve blank optional environment values as absent.
2. A present optional discovery endpoint must be a nonempty valid HTTP(S) string; reject malformed values with controlled discovery-invalid errors rather than cache absent capabilities.

Acceptance criteria:

- Direct/env optional-only configuration is rejected for incomplete manual mode; complete manual config preserves optional endpoints; issuer-only discovery still works.
- Null/array/object/number/empty/invalid URL optional discovered endpoints fail; omission succeeds; failed metadata is evicted so corrected response can recover.

Verification: V1 config/provider regressions, V2, scoped eslint. Supply notes for OVH-06.

Completion evidence:

- Changed: `packages/express-oidc-vault/src/config.ts`, only optional discovery validation in `packages/express-oidc-vault/src/provider-client.ts`, `packages/express-oidc-vault/test/config.test.ts`; added `packages/express-oidc-vault/test/ovh-02-provider-metadata.test.ts`. Updated only OVH-02 in this task file. All OVH-01 transport/cleanup changes and predecessor tests were preserved.
- Implementation: separated all five endpoint selectors from the required manual fields. Nonempty optional endpoints now select manual mode and undergo the existing URL validation; blank/undefined direct and env values stay absent. Optional discovery fields now pass a shared presence/type/URL validator before metadata can be cached. Existing failure eviction and successful cross-timeout cache sharing remain intact. Resolver JSDoc explicitly describes optional selectors, the complete required set, and blank-string handling; confirmed that it survives fresh emission into both `dist/index.d.ts` and `dist/index.d.mts`.
- Regression proof (package directory, before source changes): `pnpm exec vitest run --config ../../vitest.config.ts test/config.test.ts test/ovh-02-provider-metadata.test.ts` — **18 failed / 39 passed**: 8 config regressions reproduced ignored optional selectors, and 10 discovery regressions reproduced non-string optionals incorrectly accepted as omission. Added **51 tests** total (21 config and 30 metadata), covering both optional fields, direct/env optional-only rejection, each missing required manual field, complete config preservation, absent/blank values in both modes, malformed optional-only URLs, null/array/object/number/boolean/empty/whitespace/invalid/relative/protocol-relative/non-HTTP discovery values, single/both omissions, valid HTTP(S) normalization, concurrent failure sharing, cache eviction, corrected-response recovery, cross-policy success reuse, and manual-mode no-fetch behavior.
- V1 (package directory): `pnpm exec vitest run --config ../../vitest.config.ts test/config.test.ts test/ovh-02-provider-metadata.test.ts test/helpers.test.ts test/bov-05-issuer-identity.test.ts test/bov-04-provider-resource.test.ts test/bov-06-provider-boundary.test.ts test/ovh-01-provider-transport.test.ts` — **7 files / 225 tests passed**. Existing issuer identity, provider limits, request counts, cache isolation, and OVH-01 regressions passed.
- V2 (root): `pnpm --filter @web-ts-toolkit/express-oidc-vault test` — build/declaration emission succeeded; **21 files / 384 tests passed**, including packed CJS/ESM and strict TypeScript consumers. Commands ran sequentially. Vite emitted the existing root-config CommonJS/native-loader advisory; no test failures or unhandled rejections observed.
- V3 (root): `pnpm exec eslint "packages/express-oidc-vault/**/*.{ts,js,mts,cts}"` — passed. `git diff --check -- packages/express-oidc-vault/src/config.ts packages/express-oidc-vault/src/provider-client.ts packages/express-oidc-vault/test/config.test.ts` — passed. Untracked owned files checked with `git diff --no-index --check /dev/null packages/express-oidc-vault/test/ovh-02-provider-metadata.test.ts` and `git diff --no-index --check /dev/null docs/tasks/20260926-214440-express-oidc-vault-residual-health.md` — passed.
- OVH-06 exact config documentation handoff: “Any nonempty configured endpoint (`authorizationEndpoint`, `tokenEndpoint`, `jwksUri`, `userInfoEndpoint`, or `endSessionEndpoint`) selects manual mode. Manual mode performs no discovery and requires `issuer`, `authorizationEndpoint`, `tokenEndpoint`, and `jwksUri`, plus the always-required `clientId`. Optional endpoints are not partial discovery overrides. This also applies to `OIDC_USERINFO_ENDPOINT` and `OIDC_END_SESSION_ENDPOINT`: setting either alone alongside `OIDC_ISSUER` and `OIDC_CLIENT_ID` now fails configuration resolution instead of being silently ignored. Supply the complete manual set, or omit endpoint settings to use discovery. Undefined, empty, and whitespace-only config/env strings are treated as absent after trimming; complete manual configuration preserves valid optional endpoints.” Add this behavior-change note to shipped README and matching website configuration guidance.
- OVH-06 exact discovery documentation handoff: “Discovery may omit `userinfo_endpoint` and `end_session_endpoint`. If present, each must be a nonempty absolute HTTP(S) URL string. Null, arrays, objects, numbers, booleans, blank strings, malformed URLs, and non-HTTP(S) URLs invalidate the metadata with HTTP 502 / `OIDC_VAULT_DISCOVERY_INVALID`; they are not treated as missing capabilities. Errors identify the field without echoing its value. Failed metadata is evicted so a later request can fetch corrected metadata; only validated successes are shared across timeout policies.” Preserve the existing redirected-logout exception in adjacent guidance: provider discovery errors there are reported through `onError` while local revocation still succeeds, and local-only logout does not discover metadata.
- Scope/result: no blockers or new independent findings. README/website work belongs to OVH-06 and root integration checks to OVH-07. No root CHANGELOG edits or commits; unrelated extensive worktree changes were preserved.

### Task OVH-03: Add an explicit absolute session lifetime policy and validate TTLs

Status: completed

Session: isolated sequential OVH-03 implementation; shared criteria and OVH-02 completion evidence reviewed, dependency confirmed completed. No spawned agents.

Kind: improvement

Priority: P2; applications currently need mutable hooks/store policy for a basic maximum login lifetime, while invalid transaction/code TTLs are accepted.

Suggested agent: session policy/public TypeScript API implementer

Dependencies: OVH-02

Primary ownership: `src/index.ts` options/callback expiry boundaries, a small internal policy helper if useful, `src/types.ts`, lifetime tests and packed type fixtures.

Finding: callback session construction omits `expiresAt`; refresh preserves it. `authorizationTransactionTtlMs` and `exchangeCodeTtlMs` are added without finite positive integer checks. NaN/infinite/negative values make behavior store-dependent. Existing expiry field is correctly distinct from OAuth `expires_in`.

References: `src/index.ts` `validateOidcVaultOptions`, `createLoginHandler` transaction expiry, callback session/code creation (578–612), refresh (739); `src/types.ts` `OidcVaultSession.expiresAt`, `OidcVaultOptions`.

Requirements:

1. Add optional `sessionTtlMs`: a positive safe integer millisecond absolute lifetime assigned at callback session creation; unset retains existing application/store-owned policy. It is never inferred from upstream `expires_in`, and refresh never extends it.
2. Validate configured transaction/code/session TTLs at construction. Reject invalid/unsafe values before provider/store work; ensure computed expiries cannot silently overflow usable epoch-millisecond timestamps.
3. Preserve hook usefulness: hooks may shorten a configured maximum, not remove/extend it. Enforce the configured cap after `onBeforeSessionCreate`; document this explicit opt-in contract.
4. Expose useful JSDoc and strict installed-consumer typing without a store API change.

Acceptance criteria:

- Fake-clock integration covers default-unset behavior, configured callback expiry, exact-boundary expiry through existing store, refresh preservation, upstream short `expires_in`, hook shortening/attempted extension, and invalid configured TTLs.
- No mutation of caller options; existing option snapshot and hook tests pass; packed consumers can configure the new property.

Verification: V1 lifetime/snapshot tests, V2, scoped eslint. Supply notes for OVH-06.

Completion evidence:

- Changed: `packages/express-oidc-vault/src/index.ts`, `src/types.ts`; added internal `src/lifetime-policy.ts` and `test/ovh-03-session-lifetime.test.ts`; extended `test/bov-15-options-snapshot.test.ts` and both `test-packed-consumer/consumer/consumer-types.ts` / `consumer-types.cts`. Updated only OVH-03 in this task file. Predecessor implementation and unrelated worktree changes were preserved.
- Implementation: optional `sessionTtlMs` assigns a callback-creation absolute expiry before the precreate hook and reapplies the original maximum after it. Valid earlier hook expiries survive; removed, extended, or unusable timestamps restore the cap. The cap is independent of hook timing and mutations to `createdAt`. Unset leaves the expiry property absent and retains hook/store-owned policy. Existing refresh carries the stored expiry forward unchanged. A shared internal helper rejects non-positive/non-safe-integer TTLs and unusable clock/computed epoch values at construction, then rechecks computed expiries at transaction/callback creation before persisting new records. Usable epochs are safe integers within JavaScript Date's inclusive ±8,640,000,000,000,000 ms range; computed expiry must exceed the sampled clock. No store API change.
- Acceptance coverage: **29 new focused regressions** use a shared injected middleware/memory-store clock and a real HTTP provider/JWKS fixture. They cover callback-versus-login anchoring, all three TTL snapshots, frozen caller options, unset absence through refresh, unset hook/store policies, one-second upstream `expires_in`, configured and hook-shortened expiry preservation, last-live-millisecond refresh and exact-boundary rejection, live-code/expired-session exchange, hook extension/removal/invalid timestamp attempts, invalid TTL domains distributed across the three options, construction overflow, minimum 1 ms TTLs, exact Date upper bound, and runtime overflow before new persistence. Existing snapshot and lifecycle-hook tests pass. No excessive cross-product validation matrix was added.
- V1 (package directory): `pnpm exec vitest run --config ../../vitest.config.ts test/ovh-03-session-lifetime.test.ts test/bov-15-options-snapshot.test.ts test/index.test.ts` — final run **3 files / 81 tests passed**. Initial run was **12 failed / 69 passed** because the new provider fixture omitted mandatory ID-token `iat`; adding `setIssuedAt()` fixed the fixture. No production contract change was needed for that failure.
- V2 (root, package-scoped): `pnpm --filter @web-ts-toolkit/express-oidc-vault test` — build and fresh declaration emission succeeded; **22 files / 413 tests passed**, including packed CJS/ESM runtime consumers, strict NodeNext ESM/CJS and Bundler consumers, declaration-resolution traces, and staged `npm pack --dry-run --json` contents checks. Consumer fixtures configure numeric `sessionTtlMs`, shorten expiry through the typed hook, and reject a duration string with `@ts-expect-error`. Fresh `dist/index.d.ts` and `dist/index.d.mts` both retain the new property and lifetime/hook JSDoc. Build/test commands were sequential. Vite emitted the existing CommonJS/native-loader configuration advisory; no final failures.
- V3 (root, scoped): `pnpm exec eslint "packages/express-oidc-vault/**/*.{ts,js,mts,cts}"` — passed. `git diff --check -- packages/express-oidc-vault/src/index.ts packages/express-oidc-vault/src/types.ts packages/express-oidc-vault/test/bov-15-options-snapshot.test.ts packages/express-oidc-vault/test-packed-consumer/consumer/consumer-types.ts packages/express-oidc-vault/test-packed-consumer/consumer/consumer-types.cts` — passed. Each untracked owned file (`src/lifetime-policy.ts`, `test/ovh-03-session-lifetime.test.ts`, and this task document) was also checked using `git diff --no-index --check /dev/null <file>`.
- OVH-06 exact lifetime documentation handoff: “Set `sessionTtlMs: 8 * 60 * 60 * 1000` in `createOidcVaultMiddleware` options to give new server-side sessions an eight-hour absolute maximum lifetime. The lifetime starts at callback session creation, not login start. The middleware assigns `expiresAt = now + sessionTtlMs` before `onBeforeSessionCreate` and reapplies that original cap after the hook: a valid earlier integer epoch timestamp is retained, while extension, removal, or an invalid timestamp restores the cap. Hook delay or mutation of `createdAt` does not move the maximum. Refresh preserves the stored expiry and never renews it. This policy is independent of upstream OAuth `expires_in`; it does not derive session lifetime from the upstream access token. When `sessionTtlMs` is omitted, no default session expiry is assigned and application/hook/store-owned lifetime behavior is retained. Expiry is enforced through the existing store: at `now >= expiresAt`, exchange/refresh can no longer use the expired session.” Add the option, example, and hook behavior to shipped README and matching website session-lifetime guidance.
- OVH-06 exact validation/migration documentation handoff: “`authorizationTransactionTtlMs` (default 10 minutes), `exchangeCodeTtlMs` (default 30 seconds), and optional `sessionTtlMs` must be positive safe-integer numbers of milliseconds. Zero, negative, fractional, nonnumeric, null, NaN, infinite, and unsafe-integer values are rejected at middleware construction. The clock and `now + TTL` must be integer epoch milliseconds within JavaScript Date's inclusive ±8,640,000,000,000,000 ms range, and computed expiry must be after `now`. Construction now samples the configured `now` clock (default `Date.now`) to validate effective lifetimes. Computed expiries are checked again when records are created; an unusable later clock/expiry fails with sanitized HTTP 500 / `OIDC_VAULT_INTERNAL_ERROR` before new transaction/session/code persistence, with the original error available through `hooks.onError`. Previously invalid transaction/code TTLs were accepted with store-dependent behavior; update invalid values rather than relying on that behavior. Options are snapshotted without mutating the caller.”
- Scope/result: no blockers or new independent findings. README/website handoff belongs to OVH-06. No root checks, root CHANGELOG edits, or commits were performed.

### Task OVH-04: Reject known foreign-provider sessions before credential use

Status: completed

Session: fresh isolated sequential OVH-04 implementation; shared rules/criteria and OVH-01–03 completion evidence reviewed, predecessors confirmed completed. No spawned agents.

Kind: defect

Priority: P1; middleware instances sharing storage can send a foreign session's refresh token to the wrong provider or issue a local token from its exchange code.

Suggested agent: authentication identity-boundary implementer

Dependencies: OVH-03

Primary ownership: `src/index.ts` exchange/refresh/logout session boundaries, small internal identity helper, focused two-instance tests.

Finding: sessions created by callback store issuer/client identity, but exchange and refresh do not compare it with the current router configuration before token issuance/provider use. Logout likewise consumes a live foreign session. Opaque identifiers alone do not enforce router/provider separation on a shared store.

References: `src/index.ts` callback `session.provider` (585–588), `createExchangeHandler`, `createRefreshHandler`, `createLogoutHandler`; `src/types.ts` optional `OidcVaultProviderMetadata`.

Requirements:

1. At the shared session-use boundary, compare every present stored issuer/clientId with the resolved configuration, using exact issuer identity; reject mismatch as sanitized invalid-session before upstream I/O, token issuance, hooks, or session mutation.
2. Preserve legacy sessions with absent identity fields because the store interface intentionally permits them. Explicitly describe this compatibility limitation; applications needing complete isolation must use separate store namespaces. Do not claim stale alias/code namespaces are fully isolated.
3. Reject foreign sessions without clearing browser cookies or deleting the foreign lineage. Keep local logout independent of provider discovery.

Acceptance criteria:

- Two routers sharing one store reject foreign issuer and same-issuer/different-client sessions through exchange/refresh/live-session logout; no provider/tokenIssuer invocation or foreign-session deletion.
- Matching sessions and documented legacy identity omissions work; exact issuer slash variants are distinct; both transports are covered.

Verification: V1 identity tests plus existing refresh/logout tests, V2, scoped eslint. Supply notes for OVH-06.

Completion evidence:

- Changed: `packages/express-oidc-vault/src/index.ts`; added `packages/express-oidc-vault/test/ovh-04-session-identity.test.ts`; updated only OVH-04 in this task document. The shared internal `assertSessionIdentity` checks each non-undefined stored issuer/client ID against the resolved configuration using strict equality. Exchange now receives that configuration. Guards run immediately after successful live-session lookup, outside issuance rollback/cookie-clearing paths, before provider metadata resolution, token use/issuance, refresh rotation, and logout lifecycle hooks/deletion. No new helper module, public API/store contract change, or existing fixture update was necessary. OVH-03 lifetime changes in the shared source file were preserved.
- Regression proof (package directory, before source changes): `pnpm exec vitest run --config ../../vitest.config.ts test/ovh-04-session-identity.test.ts` — **18 failed / 12 passed**, reproducing foreign exchanges returning 200 instead of 401. The initial new fixture run failed all 30 tests because its token responses omitted mandatory `token_type`; correcting the fixture to return `Bearer` established the meaningful baseline above. Two further reverse-slash regressions brought the final new suite to **32 tests**.
- Acceptance coverage: two real middleware routers share one memory store, with callback-created sessions verified against signed ID tokens/JWKS through a counted fetch fixture. Both body and cookie transports cover foreign issuer, same-issuer/different-client, slashless-root versus trailing slash, tenant slash addition/removal/double slash, one known mismatch with the other identity field absent, and present empty identity fields. Every negative scenario exercises exchange, refresh, local logout, and redirected live-session logout. Assertions verify exact sanitized error JSON, zero upstream/issuer/lifecycle-hook calls, no Set-Cookie/Location, zero session mutation/deletion calls, and the unchanged foreign record. The owner can subsequently refresh and revoke its valid lineage. Error observation remains available through `onError` without a foreign session in its context. Positive cases cover exact matching and absent provider, empty provider, individual missing fields, and undefined fields; missing-field compatibility is explicitly exercised across different router issuers/clients. A cold discovery cache before successful local logout proves no discovery is fetched.
- V1 (package directory): `pnpm exec vitest run --config ../../vitest.config.ts test/ovh-04-session-identity.test.ts test/bov-05-issuer-identity.test.ts test/bov-03-concurrent-refresh.test.ts test/bov-07-refresh-profile.test.ts test/bov-09-session-cookie-isolation.test.ts test/bov-10-route-prerequisites.test.ts test/index.test.ts` — final **7 files / 133 tests passed**. An earlier run before the reverse-slash/expanded legacy assertions passed 131 tests. Existing refresh concurrency, profile, cookie isolation, exact issuer, local/provider logout, lifecycle-hook, and rollback regressions pass.
- V2 (root, package-scoped): `pnpm --filter @web-ts-toolkit/express-oidc-vault test` — build and declaration emission succeeded; **23 files / 445 tests passed**, including packed CJS/ESM runtime and strict TypeScript consumers. Test/build commands ran sequentially. Vite emitted its existing CommonJS/native-loader configuration advisory; no final test failures.
- V3 (root, scoped): `pnpm exec eslint "packages/express-oidc-vault/**/*.{ts,js,mts,cts}"` — passed. `git diff --check -- packages/express-oidc-vault/src/index.ts` — passed; untracked owned test/task files checked with `git diff --no-index --check /dev/null <file>`.
- OVH-06 exact identity/migration documentation handoff: “Exchange, refresh, and logout of a live session now compare each stored `provider.issuer` and `provider.clientId` that is not undefined against the middleware's resolved configuration. Every known field must match independently, even if the other is absent. Stored values are compared verbatim: there is no stored-value trimming or URL canonicalization, and issuer identifiers with different trailing slashes are distinct. Config strings still undergo the existing construction-time trimming. A known mismatch returns HTTP 401 with `{"code":"OIDC_VAULT_INVALID_SESSION","message":"Session is missing or expired."}` before discovery, upstream token requests, application token issuance, lifecycle hooks, rotation, or lineage deletion. It neither sets nor clears a session cookie and does not produce a provider logout redirect. The normal `onError` observer still runs, without the foreign session in its context. Local-only logout does not fetch discovery. Applications that previously shared sessions across different issuer/client configurations must route each session to its owning configuration; correct inaccurate stored identity using trusted provenance or require a new login. Do not remove identity fields to bypass the guard.”
- OVH-06 exact compatibility/isolation limitation handoff: “Legacy sessions with absent `provider`, an empty provider object, or undefined/omitted issuer/client fields remain supported. Only known fields are checked; an omitted issuer can still be used across issuers, an omitted client ID across clients, and entirely absent identity across both. Refresh does not backfill those identity fields. This is rejection of known foreign live sessions, not complete shared-store isolation. Exchange consumes its one-time code before retrieving/checking the linked session: a rejected foreign exchange still spends that code, and the owning router cannot redeem it afterward (regression covered). If logout's `getSession` returns no live session, the existing `deleteSession` stale-alias path still runs without an identity check and can revoke a shared foreign lineage. Stale alias and exchange-code namespaces are not fully isolated. Applications requiring complete identity isolation must use separate store namespaces, including session/alias, exchange-code, and transaction records.” These are existing contract limits, not new protocol fixes; browser-binding and cross-instance refresh exclusions remain as recorded above.
- Scope/result: no blockers or new independent findings. README/website updates remain owned by OVH-06; no root checks, root CHANGELOG edits, commits, or spawned agents. Unrelated dirty work and all predecessor changes were preserved.

### Task OVH-05: Enforce the public local-token response boundary

Status: completed

Session: fresh isolated sequential OVH-05 implementation; shared instructions/criteria and OVH-01–04 completion evidence reviewed, dependency confirmed completed. No spawned agents.

Kind: improvement

Priority: P1; a structurally compatible token issuer can accidentally return extra upstream secrets or override the response session/user fields.

Suggested agent: credential serialization-boundary implementer

Dependencies: OVH-04

Primary ownership: `src/index.ts` `withIssuedToken` / `createExchangeResponse`, internal response helper if useful, public issuer JSDoc, focused tests.

Finding: `createExchangeResponse` spreads `...issuedToken` after sessionId/user. TypeScript structural typing does not remove runtime extra properties; accidentally returning a session or an extended token result can expose credentials or override cookie-transport omissions. Current declared `OidcVaultTokenIssueResult` has only accessToken/expiresIn/tokenType.

References: `src/index.ts` `createExchangeResponse` (201–209), `withIssuedToken` (343–354), exchange/refresh issuer rollback paths; `src/types.ts` `OidcVaultTokenIssueResult`.

Requirements:

1. Validate issuer output at runtime and project only declared credential fields into a fresh owned result. Require nonempty accessToken, finite nonnegative safe integer expiresIn, and optional Bearer tokenType. Never spread unknown fields into the client response.
2. Keep no-issuer responses valid. Invalid issuer output must fail inside existing issuance/rollback handling with sanitized internal error; no session cookie is minted from malformed output.
3. Describe this as accidental-extension containment, not a sandbox for trusted hooks/issuers.

Acceptance criteria:

- Extra refreshToken/idToken/sessionId/user/metadata fields never reach either exchange or refresh JSON in either transport; legitimate fields survive.
- Null/nonobject/wrong-type/invalid-lifetime issuer output fails sanitized and exercises rollback; original diagnostic is observable privately.
- No-issuer and normal issuer flows retain existing behavior; cookie transport never exposes sessionId through issuer output.

Verification: V1 response-boundary tests, V2, scoped eslint. Supply notes for OVH-06.

Completion evidence:

- Changed: `packages/express-oidc-vault/src/index.ts` (`withIssuedToken` validation/projection and explicit `createExchangeResponse` fields), issuer/result/option JSDoc in `src/types.ts`; added `test/ovh-05-token-response.test.ts`. Updated only OVH-05 in this task document. Predecessor lifetime/identity changes in shared files and extensive unrelated worktree changes were preserved.
- Implementation: await the issuer inside the existing issuance try/catch, require a non-null/non-array object, read only `accessToken`, `expiresIn`, and `tokenType` once, validate their primitive values, then return a fresh owned result. `Number.isSafeInteger` excludes NaN/infinity/fractions/unsafe values; a separate nonnegative check permits zero. The response explicitly assigns these three fields instead of spreading issuer properties. Omitted issuer still returns no local credential fields. Invalid outputs throw field-specific `TypeError`s without embedding supplied values; the existing error handler exposes the original diagnostic privately to `hooks.onError` and serializes only the sanitized internal error. Allowed-property getter failures now also occur inside issuance rollback.
- Regression proof (package directory, before source changes): `pnpm exec vitest run --config ../../vitest.config.ts test/ovh-05-token-response.test.ts` — **26 failed / 4 passed**. Failures reproduced accepted malformed results, extra `toJSON` replacing the browser payload, late getter reads observing post-issuance mutation, and a throwing getter failing after rotation without lineage rollback. These are manifestations of the scoped response-boundary finding, not independent follow-ups.
- Acceptance coverage: **30 new regressions**. Both body/cookie transports exercise exchange and refresh with frozen structurally compatible extended results containing `refreshToken`, `idToken`, `sessionId`, `user`, `metadata`, an extra getter, and `toJSON`; exact response assertions preserve only valid local credentials and the authoritative session/user, and extra getters/serializers are never invoked. Both transports also exercise no-issuer exchange/refresh and null-result rollback on all four route/transport paths. Eighteen malformed result domains are distributed across those paths rather than cross-multiplied: undefined/primitive/array/function, missing/empty/wrong-type token, missing/string/null/NaN/infinite/negative/fractional/unsafe lifetime, and null/lowercase/numeric token type. Rollback assertions verify whole-lineage deletion (including a sibling and the rotated handle), preservation of an unrelated lineage, consumed exchange code, upstream/rotation counts, no refresh notification, private error observation, sanitized no-store JSON, and cookie clearing without a newly minted session cookie. Additional cases prove one-time getter snapshots survive later source mutation, exact throwing-getter diagnostic identity, zero/maximum-safe lifetimes, omitted/undefined token type, and verbatim opaque-token preservation.
- V1 (package directory): `pnpm exec vitest run --config ../../vitest.config.ts test/ovh-05-token-response.test.ts test/index.test.ts test/ovh-04-session-identity.test.ts test/bov-03-concurrent-refresh.test.ts test/bov-09-session-cookie-isolation.test.ts` — **5 files / 128 tests passed**. Existing normal issuance, issuer-failure rollback, lifecycle, shared-provider identity, concurrency, and cookie isolation regressions pass.
- V2 (root, package-scoped): `pnpm --filter @web-ts-toolkit/express-oidc-vault test` — build and declaration emission succeeded; **24 files / 475 tests passed**, including packed CJS/ESM runtime and strict TypeScript consumers. Confirmed new issuer/result/option JSDoc in freshly emitted `dist/index.d.ts` and `dist/index.d.mts`. Test/build commands ran sequentially. Vite emitted its existing root-config CommonJS/native-loader advisory; no final test failures.
- V3 (root, scoped): `pnpm exec eslint "packages/express-oidc-vault/**/*.{ts,js,mts,cts}"` — passed. `git diff --check -- packages/express-oidc-vault/src/index.ts packages/express-oidc-vault/src/types.ts` — passed. Untracked owned test/task files checked with `git diff --no-index --check /dev/null <file>` — passed.
- OVH-06 exact issuer contract/migration handoff: “An optional `tokenIssuer.issue` supplies local application credentials to both exchange and refresh. Return a non-null, non-array object with `accessToken` as a nonempty string, `expiresIn` as a finite nonnegative safe-integer number of seconds (0 through `Number.MAX_SAFE_INTEGER` inclusive), and optional `tokenType` equal to the exact literal `'Bearer'`. Omitted/undefined `tokenType` is omitted from JSON; null, lowercase `'bearer'`, and other values are invalid. The token is opaque and returned verbatim, without trimming or a new whitespace policy. Only these three fields are copied into a fresh internal result. Extra fields—including upstream refresh/ID tokens, metadata, response session/user overrides, and `toJSON`—are ignored and their getters are not evaluated. Body transport takes `sessionId` from the vault session; cookie transport omits it from JSON. `user` remains the session profile. Omitting `tokenIssuer` remains supported and yields no local token fields. Previously accepted malformed results now fail; update issuers to return this shape and do not rely on extra response properties.” Apply to shipped README and matching website token-issuer/response examples and migration notes; public TypeScript signatures remain unchanged.
- OVH-06 exact failure/trust handoff: “Malformed local issuer results fail with HTTP 500 and `{"code":"OIDC_VAULT_INTERNAL_ERROR","message":"Unexpected OIDC vault error."}`. Validation happens within existing issuance rollback: exchange has already consumed its one-time code, and refresh has already contacted the provider and rotated the stored handle. The affected logical session lineage is revoked; cookie transport clears the session cookie rather than minting a new one. Refresh's success notification does not run. Treat this as failed authentication requiring a new login after correcting the issuer. Field-specific validation diagnostics are privately observable as the original `hooks.onError` context `error` (narrow the unknown value before reading it); supplied invalid values are not embedded in those messages. Exceptions raised while reading allowed fields also pass through the existing issuance rollback/error handling. This projection contains accidental issuer-result extensions; it is not a sandbox for trusted issuers/hooks, which still receive mutable session/request/response access. It does not redact application-supplied session profiles or prevent an issuer from deliberately placing secrets in allowed fields.” This task does not change the existing handling of errors deliberately thrown by trusted issuer code.
- Scope/result: no blockers or new independent findings. README/website edits belong to OVH-06. No root checks, root CHANGELOG edits, commits, or spawned agents.

### Task OVH-06: Document the delivered business contracts for installed consumers

Status: completed

Session: fresh isolated sequential OVH-06 documentation/API review; shared instructions and all OVH-01–05 completion/doc handoffs reviewed, predecessors confirmed completed. No spawned agents.

Kind: improvement

Priority: P2; consumers need actionable lifetime/identity/error integration guidance and accurate remaining limitations.

Suggested agent: package consumer documentation/API reviewer

Dependencies: OVH-01, OVH-02, OVH-03, OVH-04, OVH-05

Primary ownership: `packages/express-oidc-vault/README.md`, `website/docs/packages/express-oidc-vault.md`, highest-value public JSDoc and consumer fixtures as necessary.

Finding: prior lifetime guidance requires hook/store customization; manual selection and finite alias-retention prose disagree with implementation/contracts; known browser/refresh concurrency limitations are only thoroughly recorded in task documents. New behavior needs shipped consumer guidance.

References: README Public Options, Store Provider Contract (old whole-lineage alias claim), Key Integration Notes, frontend/token issuer examples; `src/types.ts`; prior BOV-02/03 and SVH-05 decisions.

Requirements:

1. Update README/website for all delivered changes, a copy-pasteable sessionTtlMs example, local-token result validation, exact identity checks and legacy namespace limitation, and provider error/deadline behavior.
2. Add concise migration/behavior-change notes in README instead of root CHANGELOG. Correct finite alias wording based on the existing type contract.
3. Explain known browser-binding and cross-instance refresh limitations with existing task references; frontend refresh deduplication is not a distributed guarantee. Explain that logout does not invalidate outstanding stateless access tokens.
4. Verify canonical named exports, fresh declaration discoverability, and packed contents. Do not invent new APIs or imply unresolved proposals are implemented.

Acceptance criteria:

- Runtime, shipped declarations, README, and website agree on delivered behavior; practical example matches strict consumer types.
- Existing task risks are visible without requiring repository source; package/consumer checks pass.

Verification: V2, V3, V5; manual source/docs cross-check.

Completion evidence:

- Changed: `packages/express-oidc-vault/README.md`, `website/docs/packages/express-oidc-vault.md`, highest-value JSDoc in `packages/express-oidc-vault/src/types.ts`, and both `test-packed-consumer/consumer/consumer-types.ts` / `consumer-types.cts`; updated only OVH-06 in this task file. Existing OVH-03/05 additions in shared types/fixtures and all unrelated dirty work were preserved. No runtime implementation or package metadata change was needed.
- Delivered README/website parity: the quick starts opt in to an eight-hour `sessionTtlMs`; lifetime guidance covers callback anchoring, hook shortening/cap restoration, exact-boundary expiry, refresh preservation, existing-session behavior, TTL/clock validation, and separate upstream/local-token lifetimes. Configuration explains all five manual selectors, complete requirements, blank inputs, strict optional discovery capabilities, and retry/cache behavior. Identity guidance specifies verbatim independent known-field checks, the 401 response and no cookie/lineage mutation, legacy omissions/no backfill, code consumption before rejection, stale-alias logout, and separate complete store namespaces. Local issuer guidance covers exact runtime shape/units, projection, no-issuer behavior, both transports, rollback, private diagnostics, and the trusted-code boundary. Provider guidance covers sanitized transport 502s, retained error classifications, best-effort cancellation, custom-stream evidence limits, cache policy isolation, and local/redirected logout behavior. Concise migration sections describe all delivered behavior changes.
- Existing limitations are consumer-visible in both docs: BOV-02-FU1 browser binding and BOV-03-FU1/FU2 refresh-family/cookie-ordering proposals remain unimplemented; frontend deduplication has only per-context scope; logout and session expiry do not invalidate outstanding stateless tokens, including issuance racing logout. Alias retention now matches existing SVH-05 JSDoc, including immediate-successor expiry, no later extension, changed-lineage scope, and memory/Redis versus MongoDB non-expiring retention. This completes the core README/website portion only, not other store-doc/conformance follow-ups under FU-SVH-05a/b.
- Installed-consumer review (applicable `ai-friendly-ts-package` skill): checked `package.json`, `tsup.config.ts`, root re-exports, packed harness, and fresh `dist/index.d.ts` / `dist/index.d.mts`. The single bundled CJS/ESM root and conditional declarations agree; named imports are canonical, no public subpaths/default export exist, Express >=5 and Node >=22.12.0 requirements are documented, and declaration type dependencies are named for consumers. Explained workspace `dist/` versus flattened release entrypaths rather than suggesting deep imports. Both emitted declarations retain lifetime/issuer predecessor JSDoc and the new identity, config, private-error, timeout/cache, response, and logout JSDoc. Extended strict ESM/CJS fixtures exercise the documented issuer result, optional identity, error-cause narrowing, and reject lowercase token type/string expiry; the existing eight-hour/shortening fixture matches the docs.
- V2 (root, package-scoped, **1 invocation**): `pnpm --filter @web-ts-toolkit/express-oidc-vault test` — **24 files / 475 tests passed** after successful CJS/ESM/declaration build. Includes the actual release-transformed packed installation, CJS/ESM runtime consumers, strict NodeNext ESM/CJS and Bundler typechecks, declaration-resolution traces, and staged pack metadata/file-list assertions. The staged release contains seven intended files (README, LICENSE, manifest, two runtime roots, two declarations), with no source/tests/maps/placeholders. Existing Vite CommonJS/native-loader advisory only; no failures.
- V3 (root, scoped): `pnpm exec eslint "packages/express-oidc-vault/**/*.{ts,js,mts,cts}"` — **1 invocation, passed**. `git diff --check -- packages/express-oidc-vault/README.md website/docs/packages/express-oidc-vault.md packages/express-oidc-vault/src/types.ts packages/express-oidc-vault/test-packed-consumer/consumer/consumer-types.ts packages/express-oidc-vault/test-packed-consumer/consumer/consumer-types.cts docs/tasks/20260926-214440-express-oidc-vault-residual-health.md` — **1 invocation, passed**. The untracked task document was additionally checked with `git diff --no-index --check /dev/null docs/tasks/20260926-214440-express-oidc-vault-residual-health.md` before completion and after this evidence update (**2 invocations, passed**). Owned diff/source/docs reviewed manually.
- V5 (package directory, **1 invocation**): `npm pack --dry-run --json` — passed; **6 intended workspace files**, 267,855 unpacked bytes: README, package manifest, and four `dist/index.*` runtime/declaration files; no bundled dependencies or test/source files. Its raw workspace placeholder metadata is expected; V2 separately verifies the real publish transformation removes placeholders and relocates entrypoints. Fresh emitted declarations were inspected through both conditional paths.
- Command counts: **6 direct verification invocations** (V2 ×1, scoped eslint ×1, tracked owned diff check ×1, untracked task checks ×2, package V5 ×1), all passing; builds and package checks ran sequentially. No root lint/build/test, root CHANGELOG edits, commits, or spawned agents. OVH-07 remains pending for independent integration review.
- Scope/result: no blockers or new independent findings. Corrected adjacent documentation overstatements about implicit env configuration, installed declaration paths, and missing-session/logout notification semantics as part of the owned contract review; no unresolved protocol proposal is claimed fixed.

### Task OVH-07: Independently verify integration and every task outcome

Status: completed

Session: fresh independent final reviewer, not a prior implementer; OVH-01–06 requirements and completion evidence read and dependencies confirmed completed. No subagents. Review limited to OVH-07 and concrete scoped acceptance corrections.

Kind: investigation

Priority: P1; independent evidence is required for authentication-boundary changes.

Suggested agent: independent final reviewer (fresh session; not an implementer)

Dependencies: OVH-01, OVH-02, OVH-03, OVH-04, OVH-05, OVH-06

Primary ownership: this task document's review evidence; focused corrections only when a concrete acceptance failure is found.

Finding: the complete chain must be reviewed together after sequential changes, including rollback, public responses, identity checks, and policy caps.

References: all task requirements above and their changed code/test evidence.

Requirements:

1. Independently inspect each acceptance criterion against code/regressions; verify alternate exchange/refresh/logout paths and no secret leakage through new serialization/error paths.
2. Run V2–V5 as applicable, with root commands serialized. Record actual commands/counts and distinguish unrelated worktree/root failures from core failures. Fix scoped regressions and retest affected checks before signoff.
3. Audit task statuses and Completion evidence; ensure no unresolved planned task is mislabeled completed. Record known excluded risks explicitly and confirm root CHANGELOG remains untouched.

Acceptance criteria:

- Every planned implementation task is completed with reproducible passing package evidence and accurate docs; independent reviewer records criterion-level signoff.
- Root verification results and limitations are explicit; no unrelated work is overwritten; this document has final review evidence.

Verification: V2, V3, V4, V5 and evidence audit.

Completion evidence (independent final review, 2026-09-26):

- Review ownership: fresh reviewer, not an OVH-01–06 implementer. Read shared rules, every requirement/acceptance criterion and all predecessor evidence; independently inspected the tracked source/test/docs diffs, all six new source/test files, surrounding route/error/provider code, package/build metadata, packed harness/fixtures, and fresh declarations. Only this OVH-07 section was edited. No scoped defect was found, so no implementation correction or duplicate regression was warranted. OVH-01–06 completed statuses are supported by the current independent V2 pass, not merely their historical runs.
- **OVH-01 criterion signoff — PASS:** `src/provider-client.ts:185–200,211–399,541–651,691–869` centralizes prompt non-awaited cancellation, catches synchronous cleanup throws and asynchronous rejections, releases reader locks/listeners, and clears provider deadline timers. `test/ovh-01-provider-transport.test.ts` independently inspected: watchdog-bound pending/rejecting/throwing cleanup covers already-aborted headers, timeout, overflow, non-success JWKS, discovery truncation, and success finalization. Discovery/token/UserInfo/JWKS pre-header and mid-body resets retain exact non-enumerable private causes while returning sanitized endpoint-specific 502s; actual middleware error observation/JSON separation is asserted. JOSE timeout behavior remains `ERR_JWKS_TIMEOUT`; discovery success-body timeout/size/JSON classification remains discovery-invalid. Existing BOV-04/06 cache-policy/request-count/real-JWKS success regressions and unhandled-rejection checks pass in V2.
- **OVH-02 criterion signoff — PASS:** `src/config.ts` uses all five endpoint selectors independently of the required manual set; optional-only direct/env input rejects, complete manual input preserves optionals, and blank input remains absent. `validateOptionalDiscoveredHttpUrl` rejects present malformed optional capabilities before cache publication. Inspected `test/config.test.ts` and `test/ovh-02-provider-metadata.test.ts`: both fields cover null/array/object/number/boolean/blank/invalid/non-HTTP values, omission, valid URL normalization, concurrent failure sharing, eviction/corrected recovery, and cross-timeout success reuse. Manual mode performs no discovery. All pass in V2.
- **OVH-03 criterion signoff — PASS:** `src/lifetime-policy.ts` checks positive safe-integer TTLs and usable Date-range clocks/computed epochs both at construction and record creation. `src/index.ts:617–668` captures callback-time expiry before the hook and reapplies that original cap after `onBeforeSessionCreate`; valid earlier expiry survives, removal/extension/invalid expiry restores it, and hook delay/`createdAt` changes cannot move it. Refresh carries stored expiry at `src/index.ts:788–802`. Inspected all 29 lifetime regressions plus snapshot tests: unset hook/store-owned behavior, callback anchoring, short upstream `expires_in`, last-live/exact-expiry exchange/refresh, frozen caller/options snapshots, shortening, invalid domains and overflow before persistence all pass. Installed ESM/CJS type fixtures accept numeric `sessionTtlMs` and the documented hook, and reject string durations. No store interface/runtime change is required.
- **OVH-04 criterion signoff — PASS:** enumerated every core `getSession` caller: exchange, refresh, and live local/redirected logout each call `assertSessionIdentity` immediately after successful lookup (`src/index.ts:695–701,736–746,862–875`), before provider metadata/token I/O, issuer/lifecycle calls, rotation/revocation, or cookie mutation. The 32 two-router regressions exercise both transports, foreign issuer/same-issuer foreign client, exact slash variants, independent known-field mismatches, matching identity and legacy omissions; they assert unchanged foreign records, no upstream/issuer/lifecycle invocation and no cookie/redirect. Backchannel logout independently retains verified issuer/audience and issuer/client-scoped SID/subject deletion (`src/index.ts:931–957`); callback records verified provider identity. Exchange code consumption precedes the guard and missing-session logout retains its unguarded stale-alias path: these documented limits are not presented as complete namespace isolation. Local-only logout remains discovery-independent. All relevant existing identity/refresh/logout regressions pass in V2.
- **OVH-05 criterion signoff — PASS:** `withIssuedToken` reads only the three allowed primitive fields once into an owned result; `createExchangeResponse` explicitly projects them. Both run inside the established exchange/refresh issuance flow, with validation/getter failures caught before cookie minting or refresh notification. Inspected all 30 response tests: extended/frozen issuer objects, extra secret/session/user/metadata fields and `toJSON` never alter either route/transport's exact JSON; allowed getter snapshots resist later issuer-object mutation; malformed/null/nonobject/wrong-type/lifetime/token-type results revoke the affected entire lineage (including rotated/sibling records), preserve unrelated lineage, consume the exchange code, clear rather than mint cookies, and retain private diagnostics with sanitized no-store errors. No-issuer, ordinary issuer, zero/max-safe expiry, omitted token type and verbatim opaque tokens pass. `src/errors.ts:20–34` and the route error path do not serialize original private errors. Trusted issuers/hooks and application profiles remain outside the accidental-extension containment guarantee.
- **OVH-06 criterion signoff — PASS:** manually cross-checked README and website changes against implementation, including the eight-hour quick start/shortening hook, TTL units/validation/new-session scope, all manual selectors, optional discovery validation, transport errors/cancellation limitation, exact identity and legacy/code/alias exceptions, issuer shape/projection/rollback, migration notes, finite alias retention, and stateless-token/logout limitations. The shipped README itself explains the open browser/refresh risks and links their existing proposals. Package root named exports, no default/subpaths, Express >=5, Node >=22.12.0, type dependencies and workspace-versus-release paths agree with manifest/build/harness. Fresh `dist/index.d.ts` and `.d.mts` retain the lifetime, identity, issuer, error, config, timeout/cache and logout JSDoc and public exports; an explicit `git diff --no-index -- packages/express-oidc-vault/dist/index.d.ts packages/express-oidc-vault/dist/index.d.mts` found them identical. V2 installs the real transformed tarball, executes CJS/ESM roots, strict NodeNext ESM/CJS and Bundler consumers (`skipLibCheck: false`), and checks declaration resolution plus the seven-file release tree with LICENSE and no placeholders/source/tests/maps.

Independent commands and counts (all suite/build commands issued serially; environment Node v26.7.0, pnpm 11.18.0, npm 11.19.0):

| Check                           | Exact command / invocations                                                                                                                                                                 | Result and retained log                                                                                                                                                                                                                                                                           |
| ------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| V2 core                         | `pnpm --filter @web-ts-toolkit/express-oidc-vault test` ×1                                                                                                                                  | PASS: CJS/ESM/declarations built; **24 files / 475 tests**, including actual packed consumers. `<repo-root>/_tmp/ovh07-v2.log`.                                                                                                                                                                   |
| V3 scope lint                   | `pnpm exec eslint "packages/express-oidc-vault/**/*.{ts,js,mts,cts}"` ×1                                                                                                                    | PASS, no diagnostics. `<repo-root>/_tmp/ovh07-v3-eslint.log` (empty).                                                                                                                                                                                                                             |
| V3 tracked diff                 | `git diff --check -- packages/express-oidc-vault website/docs/packages/express-oidc-vault.md docs/tasks/20260926-214440-express-oidc-vault-residual-health.md` ×2, including final evidence | PASS.                                                                                                                                                                                                                                                                                             |
| V3 untracked diff               | `git diff --no-index --check /dev/null <file>` ×8                                                                                                                                           | PASS: `src/lifetime-policy.ts`, all five `test/ovh-0[1-5]-*.test.ts` files, and this task file (task checked before and after final evidence).                                                                                                                                                    |
| V4 root lint                    | `pnpm lint` ×1                                                                                                                                                                              | FAIL, exit 1: **22 errors / 0 warnings**, all in the pre-existing unrelated `packages/json-frame/test-decl-consumer/inference-contract.mts`. Exact details below; `<repo-root>/_tmp/ovh07-v4-lint.log`.                                                                                           |
| V4 root build                   | `pnpm build` ×1                                                                                                                                                                             | PASS, exit 0: **25 workspace build scripts completed**, including core/stores/apps. `<repo-root>/_tmp/ovh07-v4-build.log`.                                                                                                                                                                        |
| V4 root test                    | `pnpm test` ×1                                                                                                                                                                              | FAIL, exit 1: unrelated access-router MongoMemoryServer port collision; **261 passed files / 1 failed suite; 4,711 passed tests / 10 skipped / 1 todo** across 17 reported Vitest runs (16 packages). This is partial repository coverage, not a full pass. `<repo-root>/_tmp/ovh07-v4-test.log`. |
| Root failure reproduction check | From `packages/access-router`: `pnpm exec vitest run --config vitest.config.ts test/service-exists.integration.test.ts` ×1                                                                  | PASS: **1 file / 10 tests** without edits; original port collision did not reproduce in isolation. `<repo-root>/_tmp/ovh07-root-failure-recheck.log`. This does not replace the failed root result.                                                                                               |
| V5 workspace pack               | From `packages/express-oidc-vault`: `npm pack --dry-run --json` ×1                                                                                                                          | PASS: **6 files / 267,855 unpacked bytes**, README + manifest + four `dist/index.*` roots; no bundled dependencies or source/tests/maps. Workspace placeholders are expected here; V2 validates transformed release metadata. `<repo-root>/_tmp/ovh07-v5-pack.log`.                               |
| V5 declarations                 | Declaration equality command above ×1, plus manual inspection                                                                                                                               | PASS for both fresh conditional declaration roots.                                                                                                                                                                                                                                                |
| CHANGELOG protection            | `git diff --exit-code HEAD -- CHANGELOG.md` ×2, including final check                                                                                                                       | PASS: empty git diff, including staged and unstaged changes against HEAD.                                                                                                                                                                                                                         |

- Verification totals: **7 top-level suite/lint/build/pack invocations** (V2, scoped eslint, three root commands, isolated root-failure recheck, V5 pack), plus **13 auxiliary git verification invocations** (tracked diff ×2, untracked diff ×8, declaration equality ×1, CHANGELOG ×2). No separate V1 run was necessary: V2 executes every focused regression and all existing core tests. Root test also reran core successfully: **24/475**. Root invocation retained `--workspace-concurrency=1`; root build used its prescribed existing recursive script.
- Exact root lint failures: `@typescript-eslint/no-empty-object-type` at **140:86, 195:70, 195:87, 195:100**; `@typescript-eslint/no-unused-vars` at **189:11 (dense), 191:11 (widened), 194:11 (objectCells), 197:11 (numeric), 199:11 (string), 212:11 (reversed), 216:11 (widenedNumeric), 224:11 (common), 226:11 (optional), 232:11 (otherSpellings), 247:9 (dictionary), 250:9 (broadString), 253:9 (asserted), 351:11 (optionalFrame), 361:11 (memberFrame), 364:11 (booleanFrame), 366:11 (asserted), 369:9 (omitted)**. The file was already untracked at review entry; it was not edited here.
- Exact root test failure: `packages/access-router/test/service-exists.integration.test.ts` failed suite setup with **`StdoutInstanceError: Port "39266" already in use`**, originating in `MongoInstance.checkErrorInLine` / `stdoutHandler`. Access-router reported **58 passed files / 1 failed suite; 802 passed tests / 10 skipped** and pnpm reported `ERR_PNPM_RECURSIVE_RUN_FIRST_FAIL`, exit 1. Root log lines 941–975 preserve the failure. The isolated recheck passed all ten tests, so this is an observed unrelated environment/setup collision, not evidence of a reproducible core defect or a confirmed persistent access-router logic failure. The log subsequently contains message-service dependency/build output but no message-service Vitest summary; remaining workspace tests were not completed by this root invocation.
- Other root test summaries (files/tests passed): asset-inliner **33/583** (+1 todo), create-access-router-mongo-starter **18/335**, core vault **24/475**, express-runtime **11/341**, json-frame **9/531**, mongoose-rxdb **45/632**, pdf-reader Node **4/205** and browser **2/32**, utils **17/120**, vault memory **2/37**, vault MongoDB **3/44**, vault Redis **8/90**, http-errors **2/72**, moo **15/153**, express-response-handler **8/215**, express-json-router **2/44**. Store suites were exercised by V4 even though this plan changes no shared store behavior. Existing Vite native-loader/CommonJS advisories, npm env-config advisory, and the root app's large-chunk advisory were non-failing.
- Limitations/excluded proposals, independently audited against prior task records and consumer docs: **BOV-02-FU1** browser-bound transaction/exchange proofs and **BOV-03-FU1/FU2** distributed refresh reservation/stale-cookie ordering remain open under maintainer ownership because they require coordinated browser/store/route protocol design. Transferred callback/code session swapping, upstream refresh-family loss, and late loser cookie clearing remain possible; frontend per-context deduplication is not distributed coordination. Legacy identity omissions, spent foreign exchange codes and unguarded stale-alias logout require separate complete store namespaces for full isolation. Logout/session expiry do not revoke outstanding stateless access tokens, including issuance racing logout. JWT purpose/mandatory-expiry and opaque whitespace policy remain prior decisions. **FU-SVH-05a/b** store-doc/conformance and non-expiring alias/reused-ID policy work is not closed by these core docs. Custom-stream cleanup need not finish when an operation returns; no native-undici remote exploit was established. No live-IdP/real-browser OIDC audit or fresh multi-Node-version matrix was performed; current consumer execution used Node 26.7.0. Release-artifact assembly is outside this package scope.
- **Final OVH-07 signoff — PASS for core acceptance, root health exceptions explicit:** all planned implementation criteria and installed-consumer contracts pass independent review and current package verification. Root lint remains red; root test remains a failed partial run despite the passing isolated collision recheck. The extensive unrelated worktree was preserved; final status additionally showed concurrent unrelated changes in access-router-client/access-router-deco/asset-inliner, so root results are time-of-command evidence rather than a frozen repository snapshot. No unrelated file was edited to make checks green, no root CHANGELOG edit, no commit, no subagent, and no manual generated-output edit occurred. No unresolved scoped defect or blocking OVH task remains. Coordinator reread is the next independent audit step.

## Definition of done

All seven tasks have completed status and Completion evidence after their required checks pass. Independent final review confirms implementation/consumer consistency and honestly reports root health and known out-of-scope protocol risks. Coordinator then rereads the task file and validates that all items are accounted for. No root CHANGELOG edits.

## Coordinator completion audit

- Reread the entire task document after OVH-07, inspected the combined runtime/public-type diff and the new lifetime-policy helper, and confirmed **7 of 7 task statuses are completed**, each with Completion evidence and acceptance signoff.
- Execution used a distinct fresh sub-agent for each OVH task, sequentially; OVH-07 was an independent reviewer. The earlier read-only analysis agent did not implement tasks.
- Final package evidence is **24 files / 475 tests passed**, including packed runtime and strict declaration consumers; scoped lint and root build passed. Root lint errors in the unrelated json-frame fixture and the failed partial root test run caused by an access-router MongoDB port collision remain explicitly reported, despite that suite passing in isolation.
- Existing browser-binding and distributed-refresh proposals remain outside this completed plan, with residual risks documented above and in shipped consumer guidance. Completion does not represent closure of those earlier proposals or a fully green repository.
- Confirmed no root `CHANGELOG.md` diff. No further scoped implementation finding arose from the coordinator audit.
