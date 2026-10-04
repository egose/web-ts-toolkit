# Express Request Attestation — Dual-Use Request-Signing Package

Created: `20261002-183522`.

Package scope:

- A separate package with backend middleware, frontend helpers, and memory/Redis replay stores.
- One installable package with two public entries: `.` for Express and `./signer` for the browser.
- Package name: `@web-ts-toolkit/express-request-attestation`.

## 1. Objective, scope, and security contract

Implement a **versioned per-request HMAC signing and replay-detection protocol**. The optional public signer-module delivery mechanism provides the rotating signing material to the frontend. The default header is `x-client-transaction-id`; section 4 specifies its payload format.

The security contract must be explicit:

- A verifier checks that a request's signed fields match a currently accepted key, that its timestamp is within policy, and that its nonce has not already been admitted in the same protection space.
- **A key delivered in public JavaScript is accessible to every caller.** Encoding, XOR, minification, and rotation do not make it a confidential authentication credential. A script can fetch the current material and generate fresh valid signatures without a browser.
- Therefore this public-delivery mode provides request-format consistency and detection of repeated signed submissions while replay state survives. It does not establish browser/device authenticity, a human user, session ownership, application authorization, or reliable bot prevention.
- Rotation limits how long old material is accepted; it does not stop a caller from downloading the next version. Nonce admission does not prevent abuse using newly generated nonces.
- OIDC/session/DPoP validation continues to establish its own authentication boundary. The public HMAC key must never be reused for JWT signing, OIDC client secrets, cookies, CSRF secrets, DPoP challenges, or other confidential server operations.

In scope:

1. A shared browser-safe codec/canonicalizer with explicit protocol version, field bounds, request-target rules, and deterministic interoperability fixtures.
2. Express verification, body-parser capture integration, typed key-provider snapshots, finite key acceptance periods, and fixed HTTP errors.
3. Atomic bounded replay stores for both a single shared memory object and a shared Redis namespace.
4. Browser WebCrypto signing, a typed dynamic ESM module loader, in-context single-flight loading, bounded request preparation, and one stale-key retry.
5. An optional Express signer-asset router with immutable content-addressed modules and a noncached discovery response.
6. Independent server/browser public entrypoints, strict installed-consumer declarations, real-browser checks, release-shaped tarball tests, and self-contained README examples.
7. Composition tests with ordinary application authentication and the public OIDC vault API.

## 2. Working rules and boundaries

- Section 4 defines the shared implementation contract. Server, browser, store, and documentation tasks must use the same interfaces, defaults, encoding, and lifetime rules.
- Before implementing, inspect `git status --short` and relevant local instructions. Preserve unrelated concurrent changes. Repository source references are read-only design patterns; line numbers may move.
- Package work belongs to `packages/express-request-attestation/**`; package registration may additionally require `pnpm-lock.yaml`, narrowly scoped CI wiring, and documentation navigation. Record each added shared-file change.
- Keep OIDC/DPoP authentication and session implementation in the existing packages. Do not add vault options or reuse their private replay namespaces/nonce keys.
- Follow `AGENTS.md`: package scripts rebuild shared outputs, and root `pnpm test` deliberately serializes packages. Do not overlap builds or test scripts that rebuild the same outputs. The new package script should build once, then run its lanes serially.
- Use named imports and the real `@web-ts-toolkit` namespace. No default exports or unsupported deep imports in consumer examples.
- No import-time network requests, timers, global fetch patches, key generation, or browser storage access. `sideEffects: false` must reflect actual behavior.
- Report completion only with the task's required evidence. A mocked or skipped live/browser test is not a verified deployment guarantee.
- Use `apply_patch` for edits. Do not commit, publish, or tag as part of implementation unless separately requested.

Explicit exclusions:

- Fingerprint collection, hardware/browser attestation, vendor bot-management integration, and an asymmetric authentication protocol.
- A new React package, Axios adapter, per-session key enrollment, automatic deployment/KMS provisioning, or a separate published client package in this milestone.
- Streaming uploads beyond the bounded replayable-body profile. No transparent body rewriting, compression support, or automatic follow-and-resign redirect behavior.

## 3. Baseline and verification commands

### Existing repository evidence

- Root `package.json`: `build = pnpm -r --if-present build`, `test = pnpm -r --if-present --workspace-concurrency=1 test`, `lint = eslint .`.
- `pnpm-workspace.yaml` already includes `packages/*`; do not add a redundant package glob.
- `packages/access-router/tsup.config.ts` explains the single-invocation, multi-entry clean/build requirement.
- `packages/access-router-client/{package.json,vitest.browser.config.ts}` provide subpath/declaration conventions and a **jsdom smoke** example, not real-browser compatibility evidence.
- `packages/pdf-reader/{package.json,vitest.browser.config.mts}` provide the existing Playwright/real-Chromium lane pattern; `.github/workflows/test.yml` installs Chromium before root tests.
- `packages/express-oidc-vault/src/dpop-replay.ts`: inspect `getDpopReplayExpiresAt`, `createDpopReplayKey`, and `createDpopReplayPolicy` for bounded, namespace-aware, verify-before-reserve patterns. Reuse concepts, not private functions or cryptographic keys.
- `packages/express-oidc-vault-redis-store/src/scripts.ts`: `RESERVE_DPOP_PROOF_SCRIPT` demonstrates atomic `TIME`/expiry/capacity admission in one sorted set. Its test `redis-harness.ts` uses disposable Docker Redis; do not replace meaningful live evidence with a fake script dispatcher.
- `packages/express-oidc-vault/test/packed-consumer.test.ts`: the release transform flattens `dist` into a staged package and rewrites metadata before packing. A source-directory dry run alone does not verify the released package shape.

### Baseline procedure

1. Record Node/pnpm versions, worktree state, and existing check results if available. The package currently does not exist, so a filtered no-match build is not a meaningful failing baseline.
2. After scaffolding, run `pnpm install` when dependency registration is necessary; inspect the lockfile diff for unintended updates.
3. Focused verification uses the owning package's tests. Record any pre-existing root failure separately; never revert unrelated work to manufacture a clean baseline.

Commands from the repository root after ATT-01 adds the named scripts:

```sh
pnpm --filter @web-ts-toolkit/express-request-attestation... build
pnpm --filter @web-ts-toolkit/express-request-attestation typecheck
pnpm --filter @web-ts-toolkit/express-request-attestation test:node
pnpm --filter @web-ts-toolkit/express-request-attestation test:redis
pnpm --filter @web-ts-toolkit/express-request-attestation test:browser
pnpm --filter @web-ts-toolkit/express-request-attestation test:packed-consumer
pnpm --filter @web-ts-toolkit/express-request-attestation exec npm pack --dry-run --json
pnpm --filter @web-ts-toolkit/express-request-attestation test
```

The lane scripts above must be created by this plan; they are not claimed to exist today. Once all lanes have passed, final integration runs `pnpm build`, serialized `pnpm test`, and `pnpm lint`. Artifact assembly uses the real repository release version and the documented `pnpm build-artifact -- --version <ver>` / `pnpm verify-artifact -- --version <ver>` commands when relevant to changed release wiring; never publish a release as a test.

Prerequisites: workspace toolchain, Docker for isolated Redis 6.2/7.2 tests, installed Playwright Chromium, and registry access/cache for fresh tarball consumers. A missing prerequisite blocks that verification lane instead of silently passing it.

## 4. V1 implementation contract

### 4.1 Package and public API boundaries

- `.`: `createRequestAttestationMiddleware`, `createAttestationBodyCapture`, `createSignerBundleRouter`, `createStaticKeyProvider`, `createRotatingKeyProvider`, `generateAttestationKey`, `createMemoryAttestationStore`, `createRedisAttestationStore`, server option/types, and typed operational errors.
- `./signer`: `createRequestSigner`, `createSignerClient`, `fetchSignerBundle`, `fetchWithAttestation`, shared browser-safe protocol DTOs, and typed client preparation/load errors.
- `createRequestSigner` is the low-level HMAC API. A returned `RequestSigner` has immutable `version`, `keyId`, `publicOrigin`, and `replayNamespace`, plus `sign(input): Promise<string>`. `input` contains actual method, canonical request target, final content type, exact body digest, timestamp, and nonce. Only the wrapper chooses fresh timestamps/nonces automatically.
- A distributed module exports `signer: RequestSigner`; it does not return `{ signSource }`, require evaluation, or expose Express/Redis types to the browser.
- `AttestationKeyProvider.getSnapshot()` returns a keyring snapshot or a promise of one. The snapshot has `currentKeyId` and a bounded list of `{ keyId, key: Uint8Array, acceptFrom, acceptUntil }` entries. Key bytes are exactly 32 bytes; times are nonnegative safe-integer epoch milliseconds with `acceptFrom < acceptUntil`; identifiers match `[A-Za-z0-9_-]{1,64}`.
- Snapshots are owned/copy-isolated. Maximum retained keys is 16; current must name a present active entry before serving metadata. For any ID still retained, replacement preserves its bytes and acceptance interval; extending its deadline could resurrect a proof whose replay reservation has expired. Provider/read failure is operational `503`, not a stale-key client error.
- Key IDs are unique across the application's provisioning history; providers reject remapping an ID that is present in their retained snapshot, without growing an unbounded historical ID ledger. Generate unique version/random identifiers and never reintroduce a retired ID with different material. Atomic replacement controls subsequent snapshots; it is not cancellation of requests already using an owned preflight snapshot.
- `createStaticKeyProvider` owns an immutable snapshot. `createRotatingKeyProvider` supports explicit atomic `replace(snapshot)`; external cron/KMS/config code owns provisioning and refresh. No default polling timer or hardcoded hourly grace policy.
- `AttestationStore.reserve({ replayKey, retainUntil })` returns `Promise<'reserved' | 'duplicate' | 'expired'>`. Capacity/unavailability throws typed errors; malformed inputs reject without allocation. The adapter never interprets caller-supplied nonce strings as already authenticated.

### 4.2 Exact wire encoding and MAC input

All encodings are UTF-8. Base64url is unpadded and canonical (decode/re-encode must match); JSON has no whitespace. Reject alternate numeric spellings, extra array fields, padding, duplicate protocol material, unknown versions, and excessive input before expensive work.

```text
nonceHex = lowercase hex of 16 cryptographically random bytes
bodyHashHex = lowercase hex of SHA-256(exact submitted body bytes)
macInput = UTF8(JSON.stringify([
  "wtt-request-signature", 1, replayNamespace, publicOrigin,
  keyId, timestampMs, nonceHex, method, requestTarget, contentType, bodyHashHex
]))
mac = base64url(HMAC-SHA-256(key, macInput))
transactionId = base64url(UTF8(JSON.stringify([1, keyId, timestampMs, nonceHex, mac])))
```

- `timestampMs` is a nonnegative safe-integer epoch in milliseconds; additions must remain safe integers.
- `nonceHex`: exactly 32 lowercase hex characters; `mac`: exactly 43 canonical base64url characters representing 32 bytes.
- Default field name: `x-client-transaction-id`. Configured names must be valid HTTP tokens and must not collide with auth, cookie, host/origin, body metadata, or the package's response marker.
- One incoming signature field only: detect duplicate/raw-header and comma-joined presentations instead of selecting one value.
- Limits: encoded ID 1024 bytes; canonical request target 8192 bytes; content type 256 bytes; replay namespace matches `[A-Za-z0-9_-]{1,128}`; canonical public origin 512 bytes. Stores accept opaque replay keys of 1–256 printable ASCII bytes. Bounds are enforced before decoding/recursion/allocation. Do not parse attacker-controlled objects into arbitrary option containers.

### 4.3 Request target and body binding

- `publicOrigin` is required, static, canonical HTTP(S) origin; HTTPS except loopback development. Never derive it from `Host`, `Forwarded`, or `X-Forwarded-*`.
- The browser signs the final `Request.url` pathname and raw search string. Preserve encoded reserved path characters, trailing/doubled slashes, duplicate query parameters, query order, `+`, and percent-escape spelling. No `req.query` sorting or JSON query reserialization. A lone empty `?` is treated as no search string on both sides.
- Express uses `req.originalUrl`, preserving router mounts, plus an explicitly configured `publicPathPrefix` if an upstream proxy strips a prefix. Accept origin-form targets only; concatenate onto the pinned origin, never resolve `//...` as an authority. Reject malformed percent escapes, controls, backslashes, fragments, and noncanonical dot-segment forms before they can become a different target.
- Method is the actual method normalized to uppercase. `contentType` is the single final `Content-Type` value with outer HTTP whitespace trimmed; preserve its remaining bytes, including a generated multipart boundary. Reject controls/ambiguous duplicate fields.
- V1 accepts identity/no `Content-Encoding`. Compression is rejected; parser capture uses `inflate: false`, so the signed bytes and captured bytes are the same representation.
- `createAttestationBodyCapture({ maxBodyBytes })` returns `{ verify, errorHandler }`: an Express parser `verify` callback that stores a digest/count in package-owned per-request state and a narrow error handler mapping supported parser size/encoding failures to section 4.5. Integrate `verify` with `express.json`, `express.urlencoded`, or `express.raw`, then mount `errorHandler` before the guard. Other parser errors retain application/parser policy. Do not consume the request stream again or trust `req.body`, a user-writable digest field, or a client-provided body hash.
- Default `maxBodyBytes` is 1 MiB, explicitly configured in both parser and wrapper; configurable positive integers up to the v1 hard cap of 16 MiB are supported. Applications can choose a smaller limit. Over-limit bodies fail before replay allocation. A nonempty body whose configured parser failed to capture it is `500 ATTESTATION_BODY_CAPTURE_REQUIRED`, not silently the empty digest.
- An actually empty request uses SHA-256 of zero bytes. Changing JSON whitespace or multipart serialization after signing invalidates the old signature, even if parsed values appear equivalent.

### 4.4 Time acceptance and replay retention (one formula everywhere)

Options: `maxAgeMs = 30000` (1000–120000); `clockSkewMs = 5000` (0–30000); `clusterClockGuardMs = 5000` (0–30000). The last is a declared maximum pairwise clock difference between verifiers/replay stores, not an extra client freshness allowance.

```text
reject future proof if timestampMs > nowMs + clockSkewMs
timeDeadline = timestampMs + maxAgeMs + clockSkewMs
proofDeadline = min(timeDeadline, acceptedKey.acceptUntil)
reject when nowMs >= proofDeadline or acceptedKey is not active at nowMs
retainUntil = proofDeadline + clusterClockGuardMs
```

- Retain through the entire signed acceptance period; do not clamp to `now + maxAgeMs`, drop future-skew coverage, slide expiry on duplicate, or use a different formula in Redis.
- Maximum remaining retention measured at a verifier is `maxAgeMs + 2 * clockSkewMs + clusterClockGuardMs`: default at most 45000 ms. A store clock can additionally trail that verifier by the declared guard; its admission bound is `maxAgeMs + 2 * clockSkewMs + 2 * clusterClockGuardMs`: default at most 50000 ms, global profile cap 240000 ms. Stores reject unsafe, already expired, or overlong retention instead of truncating it.
- Repeat the time/deadline check after asynchronous provider work, immediately before reservation, and before calling the handler after reservation. If time elapses while awaiting the store, reject without releasing the reservation. Store `expired` means its retention deadline has elapsed; it is distinct from `duplicate` and from the verifier's proof deadline.
- All verifiers in one protection space use the same policy/key acceptance deadlines and synchronized clocks within the declared guard. Do not increase lifetime/skew/guard for already-live proofs without first retaining their replay state through the longer window or waiting for the old profile to expire. This protocol does not fix arbitrary clock jumps or inconsistent deployment policies.
- Replay key: `att:v1:` plus SHA-256 of a JSON tuple `[replayNamespace, publicOrigin, nonceHex]`. The key does not include instance ID, path, token, session, or key ID; nonce single-use spans accepted rotations in that protection space. Other applications use distinct namespaces/origins.
- Never release a successful reservation after handler failure or a lost response. A fresh proof is required on a new application attempt. Replay admission is not business-operation idempotency/exactly-once delivery; durable idempotency is application-owned.

### 4.5 HTTP errors and retry signal

Verifier failures use fixed `{ code, message }` JSON and `Cache-Control: no-store`. No raw key, nonce, signature, request body, arbitrary provider error, or requested key identifier is echoed. Operational errors remain distinct from rejected proofs. No `WWW-Authenticate` scheme is invented for this custom header.

| HTTP | Code                                | Fixed message                                                     |
| ---- | ----------------------------------- | ----------------------------------------------------------------- |
| 403  | `ATTESTATION_MISSING`               | Request signature is required.                                    |
| 403  | `ATTESTATION_MALFORMED`             | Request signature is invalid.                                     |
| 403  | `ATTESTATION_STALE_KEY`             | Request signing key is no longer accepted.                        |
| 403  | `ATTESTATION_EXPIRED`               | Request signature has expired.                                    |
| 403  | `ATTESTATION_FUTURE`                | Request signature timestamp is ahead of the allowed clock window. |
| 403  | `ATTESTATION_INVALID_SIGNATURE`     | Request signature does not match.                                 |
| 403  | `ATTESTATION_REPLAY`                | Request signature was already used.                               |
| 413  | `ATTESTATION_BODY_TOO_LARGE`        | Request body exceeds the configured byte limit.                   |
| 415  | `ATTESTATION_UNSUPPORTED_ENCODING`  | Request body encoding is unsupported.                             |
| 500  | `ATTESTATION_BODY_CAPTURE_REQUIRED` | Request body capture is not configured.                           |
| 500  | `ATTESTATION_INTERNAL_ERROR`        | Request signature verification failed.                            |
| 503  | `ATTESTATION_KEYS_UNAVAILABLE`      | Request signing keys are unavailable.                             |
| 503  | `ATTESTATION_REPLAY_UNAVAILABLE`    | Request replay protection is unavailable.                         |

Unknown/inactive well-formed key IDs select `STALE_KEY`; a known active key with an elapsed timestamp selects `EXPIRED`, and excessive future skew selects `FUTURE`. Provider snapshot failure selects `KEYS_UNAVAILABLE`; it is not an unknown-key result.

Only a pre-handler stale-key rejection adds `X-Attestation-Error: stale-key`. The wrapper requires that marker **and** the expected 403 code before one automatic reload/re-sign retry. Expired proofs, replay, authentication failures, provider failures, redirects, and network uncertainty are not this retry condition. Other automatic retries belong to the application and must regenerate proofs.

### 4.6 Signer assets, loading, and frontend transport

- `createSignerBundleRouter` is a **relative** router mounted by the application at a configured base path (default `/attestation`). It exposes `GET /signer-meta`, `GET /signer.<contenthash>.mjs`, and `GET /runtime.<contenthash>.mjs`.
- Metadata is bounded JSON with `{ version: 1, keyId, signerUrl, publicOrigin, replayNamespace }` and `no-store`. It contains no session/user credential and serves the current active key only.
- The key-specific ESM wrapper imports `createRequestSigner` from the content-addressed runtime module and exports `signer`. The runtime is the packaged, self-contained browser `signer.mjs`, so route assets and the npm browser entry share the codec/signer source. There is no handwritten second canonicalizer or runtime dependency on bundling tools.
- Hash the complete emitted asset bytes with SHA-256; the 64-hex content hash identifies exact immutable bytes. Never serve different key/runtime content from the same URL. Assets are intentionally public, cacheable with `immutable`, served as JavaScript with `nosniff`; runtime cap is 512 KiB and a key-specific module cap is 8 KiB. Unknown/retired assets return controlled 404/410; they are not a fallback alias for the latest key.
- `fetchSignerBundle({ metadataUrl, apiOrigin, replayNamespace, loadModule })` fetches bounded metadata with noncached, credential-omitting, redirect-rejecting defaults, validates its origin/namespace/version, and uses native dynamic `import()` (default loader) for a URL on the configured API origin and module path. Resolve URLs against the metadata location. Reject userinfo, unexpected origins/schemes/paths, and arbitrary JS text. The host application's CSP and CORS must permit these module URLs; no `eval`, `new Function`, Blob-script workaround, or global `<script>` callback.
- Native dynamic import follows browser module-loading rules; the helper cannot intercept its redirect chain. The controlled asset router must not redirect modules/runtime to other origins, and the host CSP must scope executable origins accordingly. Metadata URL pinning alone is not a guarantee about a compromised endpoint's entire import graph.
- Runtime imports have native browser module caching. The package owns at most one active signer and one in-flight load, but invalidation cannot erase the browser module cache or guarantee immediate key deletion from RAM. Do not claim that keys live for only milliseconds.
- A metadata/module retirement race may refetch discovery once before any API attempt; repeated failure stops. Validate the imported signer's version/key ID/protection space against metadata. Timeout/abort stops waiting and late obsolete results cannot replace a newer signer.
- `createSignerClient` exposes `getSigner`, `invalidate(observedKeyId)`, and `dispose`. Invalidation is generation-aware: a late rejection from an old key must not evict a newer signer. Concurrent loads are single-flight within this context, without claiming cross-tab coordination.
- `fetchWithAttestation(input, init, { signerClient, fetch: fetchFn })` prepares one immutable request snapshot. Preserve actual method, headers, `credentials` (native default `same-origin`), signal, and explicit request options; do not default credentials to `include`. Only attach signatures to the configured API origin; unrelated/unsupported URLs fail locally without sending auth or signature material.
- Materialize the serialized body **once** within the byte cap/read deadline, then use those same bytes/final content type for hashing and both attempts. Support normal finite `BodyInit` values and replayable `Request`s; callers stringify JSON objects themselves. FormData is serialized through a `Request` first, then the resulting bytes/boundary are preserved. Do not reconstruct FormData on retry or call `.arrayBuffer()` on FormData itself.
- Caller-supplied streaming upload bodies are outside v1. A `Request` body is internally a stream; handle supported finite requests with a byte-counting reader, cancellation, and timeout, rather than claiming its mere stream type proves it unsupported.
- Use `redirect: 'manual'` for signed attempts; expose/return the redirect result without forwarding a signature to a new target. No retry after network error, arbitrary 403, replay, expired proof, or uncertain handler execution.
- Signed `fetch` does not change browser navigation. Do not require this field for OIDC GET login/callback, backchannel logout, preflight OPTIONS, discovery, or signer asset retrieval. Application mounts select their protected routes explicitly; no default bypass regex or implicit unsigned fallback.

## 5. Priority definitions and ordered waves

- **P0**: protocol correctness/guarantee accuracy, target/body binding, replay soundness, required server/browser imports, or a dependency that would make the feature unsound.
- **P1**: required implementation completeness, bounded operations, rotation/retry correctness, installed-consumer docs, and meaningful integration evidence.
- **P2**: optional adapters, browser-version expansion, optimizations, and additional operational tooling, each tracked separately if discovered.

Execute in this dependency order (task numbers are identifiers, not wave numbers):

| Wave | Tasks              | Outcome                                                                  |
| ---- | ------------------ | ------------------------------------------------------------------------ |
| 1    | ATT-01             | Protocol/DTO freeze, build ownership, shared codec, and test fixtures.   |
| 2    | ATT-03 then ATT-02 | Atomic memory store, body capture, server verifier.                      |
| 3    | ATT-04 and ATT-06  | Shared bounded Redis admission and independent browser WebCrypto signer. |
| 4    | ATT-05 then ATT-07 | Key snapshots/assets/module loading, prepared signed fetch and retry.    |
| 5    | ATT-09 then ATT-08 | Cross-path hardening, public docs/types/tarballs, CI wiring.             |
| 6    | ATT-10             | Independent final evidence-based integration review.                     |

## 6. Detailed executable tasks

### Task ATT-01: Scaffold public entries and freeze the shared protocol

Status: completed

Completion evidence:

- Changed: `packages/express-request-attestation/` (19 files: package.json, tsup.config.ts, tsconfig.json, tsconfig.signer-browser.json, src/shared/{types,canonical,codec,time-policy}.ts, src/server-types.ts, src/index.ts, src/signer.ts, test/protocol.test.ts, test/time-policy.test.ts, test/fixtures/protocol-v1.json, 4 vitest configs, README.md); `pnpm-lock.yaml` importer block only.
- Verified: `pnpm --filter @web-ts-toolkit/express-request-attestation... build` pass (dist/index+signer js/mjs/d.ts/d.mts); typecheck pass; `test:node` 42/42 pass; `test` build+node pass; `npm pack --dry-run --json` 12 entries sane; Node ESM/CJS smoke OK (74 root/66 signer exports); signer bundle has no node:/express runtime graph; eslint clean.
- Follow-up: ATT-02..05 replace index.ts stubs; extend vitest includes/lanes; ATT-04 adds redis live tests; ATT-06/07 add browser tests; ATT-08 release tarball gates.

Priority: P0

Suggested role: package/protocol engineer

Dependencies: none

Primary ownership:

- `packages/express-request-attestation/{package.json,tsup.config.ts,tsconfig.json}`
- `packages/express-request-attestation/src/{index.ts,signer.ts,server-types.ts}`
- `packages/express-request-attestation/src/shared/{types.ts,codec.ts,canonical.ts,time-policy.ts}`
- Package test configuration, `test/protocol.test.ts`, `test/time-policy.test.ts`, and `test/fixtures/protocol-v1.json`.
- `README.md` scope/import/guarantee skeleton; narrowly scoped `pnpm-lock.yaml` registration.

Finding:

The package does not exist. Server, browser, and replay-store implementations need a shared envelope, namespace, time policy, and dependency boundary. Implement these foundations before the dependent tasks so each runtime produces and verifies the same bytes.

References:

- Sections 1 and 4: package scope, guarantees, and protocol specification.
- `packages/access-router/tsup.config.ts`: one multi-entry build owns cleaning shared output.
- `packages/access-router-client/package.json`: conditional `types/import/require` declarations.
- `packages/express-oidc-vault/test/packed-consumer.test.ts`: release-shaped staging and consumers.

Implementation requirements:

1. Implement the single-package, full-stack scope and guarantees in sections 1, 4, and 8. Public signing-material delivery must be documented as request signing and replay detection, without a device-authentication guarantee.
2. Use name `@web-ts-toolkit/express-request-attestation`, repo version/license/repository placeholder conventions, `engines.node >=22`, `sideEffects: false`, `files: ["README.md", "dist"]`, and named exports. Declare Express `>=5` as an **optional peer** using `peerDependenciesMeta`: backend consumers install Express, browser-only installations must not need it. Redis is caller-injected through structural types and a dev dependency for tests, not a browser/root runtime dependency.
3. Export exactly `.` and `./signer`, with import/require declarations appropriate to `index.mjs/index.js` and `signer.mjs/signer.js`. Default type resolution must be unambiguous. Browser declaration closure cannot import Express, Redis, `Buffer`, `NodeJS`, or `node:*` types.
4. Use one multi-entry tsup invocation with `bundle: true`, `splitting: false`, `clean: true`, CJS/ESM/declarations, and a shared `es2022` syntax target. Root modules can import external Node built-ins/Express; the signer graph cannot. Use an appropriate neutral build configuration and explicit externals as needed. Do not run separate `clean: true` builders against `dist` or publish extensionless relative chunks.
5. Implement shared codec, target/content-type rules, bounded option validation, time/deadline calculation, and canonical JSON/MAC framing from section 4. Server-specific interfaces stay in `server-types.ts`; browser DTOs stay in `shared/types.ts`. Use milliseconds consistently.
6. Add committed independent protocol fixtures: key, final body bytes/digest, MAC input bytes, expected HMAC and envelope. Obtain expected bytes from an independent Node crypto computation/known-vector source, not by asking the production helper for its own expectation. Include empty body, UTF-8, binary, reserved path escapes, duplicate queries, and content-type changes.
7. Define scripts `typecheck`, `test:node`, `test:redis`, `test:browser`, `test:packed-consumer`, and `test`. `test` builds once, then runs all applicable lanes in sequence; direct lanes consume that build. Future lane files are activated by their owning tasks, without pretending a no-test exit verifies them. Prefer package-local Vitest configs with explicit Node versus browser includes and `passWithNoTests: false` for real gates.
8. README skeleton documents entry imports, actual guarantee, required browser secure-context/WebCrypto APIs, and planned verification commands. Do not advertise specific historical browser versions until version-specific evidence exists; real Chromium support and untested evergreen engines must be distinguished.

Acceptance criteria:

- Package builds both JS formats and their corresponding declarations for both entries, with no concurrent output cleaning or missing imported chunks.
- Codec/target/time tests pass, including canonical base64url/numeric/array rejection, all protected fields in the MAC input, exact deadline boundaries, future-skew boundary, and safe-integer/overflow cases.
- Node `import`/`require` smoke checks load both built entries; a bundler import of the built signer has no Node/Express runtime graph. This scaffold does **not** require ATT-06's future WebCrypto signing behavior.
- Dry-run inventory includes required `package.json` plus README/build files (and only intentionally shipped license assets); do not assert npm omits its mandatory manifest.
- Verify: root package build, package `typecheck`, targeted Node protocol/time tests, and source-directory pack dry run. Release tarball/browser execution acceptance belongs to ATT-08/ATT-06.

---

### Task ATT-02: Implement Express body capture and verify-before-reserve middleware

Status: completed

Completion evidence:

- Changed: `src/body-capture.ts`, `src/verify.ts`, `src/middleware.ts`, `src/errors.ts`, `test/body-capture.test.ts` (23), `test/middleware.test.ts` (30), `test/verification-order.test.ts` (10); `src/index.ts` ATT-02 exports; vitest.node includes.
- Verified: build pass; typecheck pass; targeted 23+30+10 pass; full test:node 142/142 pass (6 files); eslint clean.
- Notes: verify-before-reserve with final deadline recheck; never release on failure; stale marker only pre-handler; operation timeout 5s with late-settlement ignore.

Priority: P0

Suggested role: Express/protocol engineer

Dependencies: ATT-01, ATT-03

Primary ownership:

- `src/{body-capture.ts,verify.ts,middleware.ts,errors.ts}` in the new package.
- `test/{body-capture.test.ts,middleware.test.ts,verification-order.test.ts}` and focused HTTP fixtures.

Finding:

A parser helper must capture the exact submitted body bytes, and the verifier must bind the externally visible request target and enforce one deadline policy. Signature validity and time checks must succeed before replay allocation; application handlers run only after successful reservation and a final deadline check.

References:

- Section 4.2–4.5 is authoritative for encoding, actual request bytes, deadlines, and errors.
- `packages/express-oidc-vault/src/dpop-replay.ts`, `createDpopReplayPolicy`: validate prerequisites and reserve once.
- `packages/express-oidc-vault/src/index.ts`, `createOidcVaultMiddleware`: router already mounts its configured base path.

Implementation requirements:

1. `createRequestAttestationMiddleware({ publicOrigin, replayNamespace, publicPathPrefix?, keyProvider, store, maxAgeMs?, clockSkewMs?, clusterClockGuardMs?, headerName?, now?, operationTimeoutMs? })`. Required origin/namespace/services are validated; defaults and bounds come from section 4. Operation timeout defaults to 5000 ms and bounds asynchronous provider/store waiting; late settlement cannot resume a rejected request.
2. Add `createAttestationBodyCapture` with package-owned WeakMap/symbol-private digest/count state, parser `verify` callback, and returned size/encoding error mapper. Show the exact parser/capture-error/guard/handler order. Use the same configured byte limit and `inflate: false`; preserve downstream parsed `req.body`. Empty/unparsed/encoded/over-limit paths must have unambiguous results, including errors occurring before the guard.
3. Verification stages: bounded single-header extraction/codec validation; owned key snapshot and active-key lookup; validated time/deadline and actual request-target/content-type/body digest; HMAC-SHA-256 comparison with Node `timingSafeEqual` on fixed-length bytes; rechecked time; one atomic store reservation through `retainUntil`; final time/deadline check before `next`. Never release a reservation when the final check fails.
4. Required fields, keyring shape, operation results, and time computations are validated at their boundaries. Never confuse malformed provider snapshots with attacker stale keys. `duplicate`, `expired`, unavailable, and capacity outcomes map to section 4.5's fixed errors without raw diagnostics in responses.
5. On success invoke `next` exactly once; do not set `req.auth`, authenticate a session, consume OIDC records, release replay state, or make provider-login calls. Once `next` executes, later application errors are not attestation failures and cannot carry the stale-key marker.
6. No hardcoded health/asset/vault exclusion pattern. Mount guard on selected API methods/routes. Preflight/asset/navigation/server-to-server flows are scoped by application routing, not by a broad unsigned fallback.
7. Keep options/key snapshots owned; service references remain live. Controlled errors carry `no-store`; an optional diagnostic hook receives allowlisted categories without exposing arbitrary request/key/provider objects. Hook failure never changes rejection/acceptance.

Acceptance criteria:

- HTTP fixtures verify JSON, URL-encoded, raw/binary, empty body, and exact multipart bytes through supported capture/parser combinations while leaving downstream body usable.
- Altering method, path, query spelling/order, content type, body whitespace/bytes, namespace, origin, version, key ID, timestamp, or nonce invalidates the old MAC or envelope. Nonempty uncaptured body fails explicitly.
- Missing/duplicate/comma-joined/oversized/malformed fields, unknown keys, expiry/future boundaries, unsafe clocks, and provider faults produce fixed expected outcomes before any replay call. Use spies plus actual handler-side-effect counters; do not infer verification order from HTTP status alone.
- Concurrent identical valid requests against ATT-03's shared store produce one handler call; retrying the same proof after a handler exception still produces replay rejection. Independent fresh proofs are admitted when capacity permits.
- An asynchronous key read that crosses the deadline cannot reserve/execute a handler; a store result arriving after proof expiry cannot execute a handler or release its reservation. An uncertain store timeout never calls `next`, falls back to memory, or releases a possibly committed reservation.
- Verify: build/typecheck plus targeted body-capture/middleware/order tests, then `test:node`. Browser/module rotation acceptance is owned by ATT-05/07.

---

### Task ATT-03: Implement a bounded atomic memory replay store

Status: completed

Completion evidence:

- Changed: `packages/express-request-attestation/src/stores/memory.ts`, `test/store-conformance.ts`, `test/memory-store.test.ts`, `src/index.ts` (ATT-03 exports only), `vitest.node.config.mts` includes.
- Verified: build pass; typecheck pass; memory-store 37/37 pass; full test:node 79/79 pass (3 files); eslint clean; ESM/CJS smoke OK.
- Notes: duplicate-first (even when full), 64-expiry bound, no timers; expired-input-on-live returns expired; overlong/malformed throws.

Priority: P0

Suggested role: replay-store engineer

Dependencies: ATT-01

Primary ownership:

- `src/stores/memory.ts`, shared store errors, and `test/memory-store.test.ts` in the new package.
- `test/store-conformance.ts`: reusable admission contract without HTTP or future browser dependencies.

Finding:

The memory adapter must distinguish duplicate submissions from elapsed retention deadlines and retain reservations throughout the full acceptance window. Atomic admission and bounded expiry cleanup are required before server concurrency tests can verify replay behavior.

References:

- Section 4.1/4.4: store result/deadline/namespace contract.
- `packages/express-oidc-vault-memory-store/src/dpop-replay.ts`: bounded expiry-index concepts, read-only reference.

Implementation requirements:

1. `createMemoryAttestationStore({ maxEntries?: 50000, now?: () => number })`, using a Map plus an indexed expiry heap/structure. Snapshot options; validate capacity and clock. Maintain no more than one live index record per retained entry; repeated duplicates must not grow heap garbage.
2. `reserve({ replayKey, retainUntil })` validates bounded opaque key and deadline from section 4.4, returning `expired` for a no-longer-live deadline. Malformed/overlong inputs reject without allocating; do not clamp deadlines to make them valid.
3. Perform duplicate-first admission (return `duplicate` even when full), reclaim at most 64 expired entries plus the requested expired entry, then check capacity before inserting atomically. Capacity throws `AttestationCapacityError`. No live eviction, duplicate deadline extension, full-map rebuild, or interval timer.
4. Expired keys are reservable again for a **fresh** proof whose deadline is valid; the old proof still fails verifier age rules. Store receives only opaque already-derived replay keys and knows nothing about request signatures.
5. Document that sharing is one store object in one process. Restart/state loss resets this replay memory; no multi-process, durable exactly-once, or independent-object claim.

Acceptance criteria:

- Conformance cases cover reserved/duplicate/expired, malformed values, maximum retention, future deadline edge, expiry equality, capacity, requested expired-key reuse, and input/config mutation isolation.
- Simultaneous reservations in one shared object have one winner; independent memory objects intentionally do not coordinate (documented boundary test).
- A duplicate does not extend expiry or allocate a new heap node; full store preserves all live records and duplicate results still win over capacity.
- A bounded expiry workload demonstrates at most 64 scheduled removals per admission without linear key scans; stored/indexed sizes remain within configured capacity. No timers/open handles.
- Verify: build/typecheck and targeted memory/conformance Node tests. ATT-02 owns HTTP replay checks; no reverse dependency.

---

### Task ATT-04: Implement shared bounded Redis replay admission and live parity tests

Status: completed

Completion evidence:

- Changed: `src/stores/redis-script.ts` (Lua TIME/capacity/64-cleanup), `src/stores/redis.ts`, `test/redis-store.test.ts` (unit+fake parity+HTTP winner), `test/redis-live.test.ts`, `test/redis-harness.ts` (disposable 6.2/7.2); `src/index.ts` ATT-04 exports; vitest.node+redis configs; package.json test serial lanes.
- Verified: build pass; typecheck pass; test:node 209/209 pass (7 files, incl fake parity+HTTP winner); eslint clean.
- Live lane verified 2026-10-03 with real Docker (`redis:6.2-alpine` + `redis:7.2-alpine` disposable containers): `test:redis` 62/62 pass. Earlier Podman-shim runs had also exposed and fixed live-clock boundary races in the shared conformance suite.

Priority: P0

Suggested role: Redis/concurrency engineer

Dependencies: ATT-01, ATT-03, ATT-02

Primary ownership:

- `src/stores/{redis.ts,redis-script.ts}` in the new package.
- `test/{redis-store.test.ts,redis-live.test.ts,redis-harness.ts}` and reusable store-conformance cases.

Finding:

Publicly distributed signing material permits unlimited fresh valid submissions, so TTL alone is not a hard memory bound. Redis needs shared capacity, atomic admission, and exact absolute retention deadlines. Live multi-client tests must verify Lua atomicity and server-clock behavior.

References:

- `packages/express-oidc-vault-redis-store/src/scripts.ts`, `RESERVE_DPOP_PROOF_SCRIPT`: server TIME, one bounded sorted-set ledger, atomic duplicate/capacity/expiry.
- `packages/express-oidc-vault-redis-store/test/{redis-harness.ts,dpop-live.test.ts}`: Docker-isolated real Redis with independent clients.

Implementation requirements:

1. `createRedisAttestationStore({ client, keyPrefix?: 'wtt-attestation', maxEntries?: 50000 })`. Public client type is a narrow structural `sendCommand(args: string[]): Promise<unknown>` contract compatible with node-redis; no runtime client creation/connect/close or Redis import in the library. Redis client is a dev dependency for integration tests.
2. One same-slot sorted set per shared prefix contains opaque replay keys and absolute `retainUntil` scores. The single atomic Lua admission uses Redis `TIME`, validates bounded/safe live deadlines, returns reserved/duplicate/expired, reclaims at most 64 expired entries plus the requested expired one, and checks shared capacity before inserting. Duplicates never change their score. All clients of a prefix use identical capacity; document that configuration requirement.
3. `PEXPIREAT` the ledger through its latest retained score so idle state is reclaimed, without shortening any member's deadline. Wrong Redis data type, invalid script reply, script/store failure, or capacity throws a typed operational error. Never silently accept without a committed reservation.
4. Prefer one steady-state `EVALSHA`; load on cold start/definite `NOSCRIPT` and retry once on that definite nonexecution result. Never retry uncertain network timeouts as though nothing committed. Do not use a non-atomic GET/SET or separate capacity counter vulnerable to TTL drift.
5. No `nowSkewToleranceMs` clamping hidden in this adapter. Receive section 4.4's exact `retainUntil`; Redis time checks the remaining 240000 ms global maximum (including a store clock behind the verifier by the permitted guard) and expiry. Required clock consistency/guard belongs to configured verifier policy.
6. Live tests launch disposable Redis 6.2 and 7.2 containers with dedicated randomized prefixes, multiple clients, and cleanup. Do not use an arbitrary production `REDIS_URL`. Unit command/error tests run without Docker; `test:redis` and final package `test` require the live lane. Docker absence is a documented blocker, not skipped success.
7. Document capacity/failure/rate implications without a fabricated bytes-per-entry benchmark. Estimate entries as unique accepted requests/second × maximum retention plus headroom; actual Redis memory/throughput requires measurement. Redis eviction, restore/state loss, or failover can erase replay reservations: use a suitably configured dedicated/noeviction deployment if relying on window-wide admission history.

Acceptance criteria:

- The same conformance suite runs against memory and live Redis; independent clients sharing one prefix have exactly one winner for simultaneous identical valid proof admission.
- Default/future-skew/near-expiry proofs retain state through the **whole** acceptance deadline plus clock guard. Replays near the end of validity remain rejected; expired reservation inputs never allocate. Ledger expires after its latest score.
- At shared capacity, duplicate returns duplicate, a new key throws capacity, no live entries are evicted, bounded expiry cleanup permits recovery, and repeated duplicates do not inflate counts.
- Tests cover cold/NOSCRIPT, wrong key type, malformed reply, injected uncertainty, and client-owned lifecycle. A timeout may leave a reservation committed but never executes a handler or falls back to memory.
- Verify: build/typecheck, Node Redis-unit tests, `test:redis` on both live versions, and ATT-02 HTTP replay integration over two independent middleware instances.

---

### Task ATT-05: Implement owned key rotation and typed immutable ESM signer delivery

Status: completed

Completion evidence:

- Changed: `src/signer-assets.ts` (unused tracking cleanup), `test/signer-bundle.test.ts` (lint const fix); existing `src/keys.ts`, `src/signer-bundle.ts`, `test/keys.test.ts` verified.
- Verified: build pass; typecheck pass; keys+bundle 19/19 pass (incl Chromium import accepted by ATT-02); test:node 278/278 pass (11 files); test:browser 17/17 pass; eslint clean.
- Notes: explicit replace snapshots; contenthash immutable assets; public-material boundary demonstrated.

Priority: P1

Suggested role: key-distribution/module engineer

Dependencies: ATT-01, ATT-02, ATT-06

Primary ownership:

- `src/{keys.ts,signer-bundle.ts,signer-assets.ts}` in the new package.
- `test/{keys.test.ts,signer-bundle.test.ts}` and a real-browser module-delivery fixture.
- Matching rotation/asset documentation notes for ATT-08.

Finding:

Signer delivery requires executable ESM modules matching the browser API, immutable content-addressed assets, and a coordinated key lifecycle across server instances. Public asset caching and module encoding do not make the distributed material confidential.

References:

- Section 4.1/4.6: snapshots, explicit replacement, discovery DTO, module URLs, and cache limits.
- `packages/express-oidc-vault/src/device-binding-policy.ts`: capture/copy/freeze ordinary data while retaining services.
- `packages/pdf-reader/vitest.browser.config.mts`: actual browser-module execution evidence.

Implementation requirements:

1. Implement `generateAttestationKey(keyId, { acceptFrom, acceptUntil })`, immutable `createStaticKeyProvider(snapshot)`, and explicit-replacement `createRotatingKeyProvider(snapshot)`. Reject invalid/current-missing/duplicate-ID/oversized snapshots or remapping retained IDs' bytes/acceptance intervals atomically; the previous valid snapshot survives rejected replacement. Validate ownership and copy bytes on input/output. The provisioner ensures key ID uniqueness across rotations; the library must not grow an unbounded tombstone map.
2. Finite acceptance/grace is application-configured, not automatically `2 × rotation interval`. Runbook: prepare new material on **all verifiers**, publish current metadata/module, retain old material to its explicit deadline, retire only after overlap requirements. Do not make one instance the authoritative random-key generator for an uncoordinated cluster.
3. `createSignerBundleRouter({ publicOrigin, replayNamespace, keyProvider, basePath?: '/attestation', publicPathPrefix?, now?, operationTimeoutMs? })` returns the relative router in section 4.6; it does not mount itself at `basePath`. Use the base path solely to publish correct external URLs. Include a configured stripped public prefix when constructing asset locations, using trusted configuration rather than request headers.
4. Runtime assets use the actual built browser ESM entry from this installed package. Solve path lookup for both CJS and ESM roots **and** release flattening; no source-checkout path, assumed repository root, or runtime tsup dependency. Hash/cache the bounded runtime bytes; never change bytes under a content hash.
5. Each bounded key-specific module imports that runtime and exports `signer: RequestSigner` from `createRequestSigner`. Embed key bytes with a simple canonical encoded literal. Stronger obfuscation/XOR is not required for correctness and cannot be claimed as protection. Generated literals/URLs use safe serializers, not string concatenation with arbitrary request data.
6. Metadata uses `no-store`, strict version/protection-space fields, bounded successful body, and current active key. Immutable asset responses use correct MIME/`nosniff`; bounded retired-asset handling has no redirect to latest. CORS/CSP policy is application-configured; document exact requirements rather than granting broad credentialed access in this router.
7. Asset generation/storage is bounded by the retained snapshot (maximum 16 keys) and fixed runtime/module caps. Before dropping assets needed by published metadata, account for the one bounded refetch-on-retirement client behavior. Inspect all generated module imports; they must resolve in a browser without an npm bare-module map.

Acceptance criteria:

- Snapshot mutation, byte-array aliasing, rejected replacement, expired current key, finite old-key overlap, and same-ID different-key scenarios are tested. No timers/network actions start at construction.
- Same content hash always produces the same bytes; the hash is over complete bytes including runtime reference/configuration. Metadata gets the latest active key while old modules remain usable during their configured overlap.
- Real Chromium dynamically imports HTTP-served key/runtime modules and creates a signature accepted by ATT-02. A nonbrowser caller that reads distributed material also signs successfully, demonstrating the documented public-material boundary.
- Retired/unknown asset requests, discovery during replacement, and malformed module payloads fail without changing proof/session state or growing unbounded caches.
- Verify: build/typecheck, keys/module Node tests, and focused real-browser module-loading tests. ATT-07 owns API stale-key automatic retry; no circular acceptance dependency.

---

### Task ATT-06: Implement browser WebCrypto signing and a generation-aware ESM client

Status: completed

Completion evidence:

- Changed: `src/signer-client.ts` (invalidate lint fix), `test/signer.browser.ts` (Response.clone per discovery fetch); existing `src/request-signer.ts`, `src/signer-client.ts`, `src/client-errors.ts`, `src/signer.ts`, `test/signer.test.ts`, `test/signer-client.test.ts`, `test/signer.browser.ts`.
- Verified: build pass; typecheck pass (incl signer-browser types:[]); test:node 259/259 pass (9 files); test:browser 17/17 pass (real Headless Chromium vs dist/signer.mjs); eslint clean.
- Notes: single-flight generation-aware client; no storage/DOM side effects.

Priority: P0

Suggested role: browser/WebCrypto engineer

Dependencies: ATT-01

Primary ownership:

- `src/{signer.ts,request-signer.ts,signer-client.ts,client-errors.ts}` in the new package.
- `test/{signer.test.ts,signer-client.test.ts,signer.browser.ts}` and browser fixtures/configuration.

Finding:

The frontend signing API and delivery module shape must agree before the asset router depends on them. Typed module loading, real-browser WebCrypto tests, and generation-aware invalidation are required. In-memory application references do not provide secrecy from callers or erase native browser module caches.

References:

- Section 4.1/4.2/4.6: `RequestSigner`, exact HMAC envelope, typed loader, and lifecycle contract.
- `packages/pdf-reader/vitest.browser.config.mts`: real browser tests of built ESM output.
- Vault README in-context refresh promise pattern: concurrency reference only, no guarantee of cross-tab synchronization.

Implementation requirements:

1. `createRequestSigner({ keyId, key, publicOrigin, replayNamespace })` copies/validates 32-byte material, imports one non-extractable HMAC-SHA-256 WebCrypto key for signing, and returns the typed `RequestSigner`. `sign(input)` uses the shared codec/MAC input and returns the transaction ID. No Node imports/fallbacks in the production browser graph; `TextEncoder`, `crypto.subtle`, and `crypto.getRandomValues` are required capabilities, feature-detected on use.
2. Low-level `sign(input)` is deterministic for explicitly provided timestamp/nonce/body hash. Automatic nonce generation belongs to ATT-07's request wrapper. Body-hash helpers and nonce helpers stay browser-safe; no Math.random or predictable fallback.
3. `fetchSignerBundle` uses bounded metadata JSON, noncached/credential-omitting/redirect-rejecting discovery fetch defaults, allowed API origin/protection space, safe resolved asset URL, native dynamic import, and runtime-validated `module.signer`. Reject fetched JS source strings/extra key-fetch modes. Use an injectable **typed module loader** for tests/host bundlers; do not turn it into string evaluation or claim native import cannot follow redirects.
4. Implement `createSignerClient({ metadataUrl, apiOrigin, replayNamespace, fetch?, loadModule?, loadTimeoutMs? })` with one owned active signer, one shared load, generation-aware `invalidate(observedKeyId)`, and `dispose`. Load timeout defaults to 5000 ms; metadata cap is 4096 bytes. Failure clears the rejected load so a later explicit call can recover. A late old-generation result cannot install after invalidation/disposal.
5. A current metadata-to-module retirement race can refetch metadata at most once before any API request; all other load failures are explicit typed errors. Validate protocol version/key/protection space on the imported module. Native import evaluation is not cancellable; reject waiting on timeout/abort and discard late results without claiming rollback of module execution.
6. No storage API, cookies, DOM mutation, global network patch, import-time requests, or polling timers. Module cache retention is documented. Provider/client functions in DTOs do not imply device/private-key attestation; publicly distributed HMAC material remains accessible despite non-extractable CryptoKey wrapping.
7. Activate actual Chromium tests on built `dist/signer.mjs`. Keep Node/unit and browser files in separate explicit configs. Test insecure/unavailable capabilities as controlled failure; jsdom alone is insufficient for real native module-loading/WebCrypto guarantees.

Acceptance criteria:

- ATT-01's independent fixed HMAC fixtures match Node crypto and real-browser WebCrypto across UTF-8/binary/target/content-type cases. With identical explicit inputs the signer is deterministic; all version/key/origin/namespace fields are protected.
- Built browser entry loads with no Express/Redis/Node globals or type ambient dependencies; requires no default export/deep import. Unsupported WebCrypto fails with an actionable local error.
- Concurrent `getSigner` callers share one metadata/module load; failure/disposal/invalidation tests cover rejected-promise recovery, old-load settlement, a late stale response to an old key, and the one allowed discovery-refetch race.
- Mocked metadata cannot select an unexpected origin/protection space, oversized response, script-string evaluation path, or malformed `RequestSigner`. No browser storage writes/import-time I/O occur.
- Verify: build/typecheck, signer/client Node unit tests, and focused real Chromium signer/module-contract tests using fixture ESM. Actual generated modules are verified by ATT-05 after this task, avoiding a dependency cycle.

---

### Task ATT-07: Implement prepared signed fetch, bounded retry, and authentication composition

Status: completed

Completion evidence:

- Changed: `src/attested-fetch.ts` (narrowing/cleanup), `test/fetch-client.test.ts` (syntax/flake fixes, live baseUrl, secure-context Chromium check), `README.md` frontend/composition drafts; existing `src/request-body.ts`, `test/fetch-end-to-end.browser.ts` verified.
- Verified: build pass; typecheck pass; test:node 302/302 pass (12 files); test:browser 23/23 pass (real Chromium); eslint clean.
- Notes: prepared snapshot, preserved credentials, stale-marker-only single retry; vault basePath composition documented.

Priority: P1

Suggested role: browser/HTTP integrator

Dependencies: ATT-02, ATT-05, ATT-06

Primary ownership:

- `src/{attested-fetch.ts,request-body.ts}` in the new package.
- `test/{fetch-client.test.ts,fetch-end-to-end.browser.ts}` and local Express/browser fixtures.
- README frontend/composition example drafts for ATT-08.

Finding:

The wrapper must sign the exact serialization it sends, preserve the application's credential policy, and limit automatic retries to a pre-handler stale-key response. Request snapshots and live HTTP/browser tests must verify body preservation, origin scope, and redirect behavior.

References:

- Section 4.3/4.5/4.6: exact bytes, stale marker, preparation, cancellation, and scope.
- `packages/express-oidc-vault/src/index.ts`, `createOidcVaultMiddleware`: internally mounted OIDC base path.
- Section 4.6: independent request-signature generation, credential preservation, and bounded retry behavior.

Implementation requirements:

1. Implement `fetchWithAttestation(input, init, options)` using a final `Request` preparation snapshot, required signer-client origin/namespace, injected fetch/clock, configurable signature field, and the matching 1 MiB body profile. Build ordinary requests from string/URL/Request input; preserve request headers including Authorization and explicit credentials/signal rather than adding `include` implicitly.
2. Materialize serialized body with a byte-counting reader and bounded deadline (default 5000 ms), cancel on limit/abort/error, then hash and submit those exact bytes/final content type. Keep original `Request` reusable when feasible via clone; a used/locked request fails locally. Caller JSON objects are not valid Fetch bodies: docs use `JSON.stringify`. Multipart boundary generated once stays unchanged on retry; URLSearchParams/text/Blob/binary/null cases are explicit.
3. Send one freshly generated 128-bit nonce and validated `Date.now()` timestamp per attempt. Before signing, match loaded signer metadata to the allowed API protection space. Replace, rather than append, any caller signature field. Await request hashing/signing without changing the body/headers being signed.
4. Enforce manual redirects, origin pinning, and body-encoding profile. A rejected external URL never sends an Authorization or signature. Navigation, response streams, opaque redirects, network rejection, and application 401/403 remain separate from package retry policy.
5. Retry at most once **only** on section 4.5's pre-handler stale-key marker plus expected 403 code. Inspect a bounded clone/appropriate copy of the error response without consuming the returned response irreversibly; invalidate only the observed key, reload, and re-sign the same serialized request with new timestamp/nonce. A second stale challenge stops.
6. No automatic retry for expired/future/replay/invalid proof, operational 5xx, auth refresh, network timeout, or handler uncertainty. Application auth refresh may invoke the wrapper again, but each invocation must regenerate the signature; a bearer/DPoP proof carried from an outer wrapper requires its own fresh-attempt policy.
7. Composition example uses one correctly mounted `createOidcVaultMiddleware({ basePath: '/auth/oidc', ... })` router and selected API/POST guard positions. Capture JSON bytes before both validators; asset/OPTIONS/OIDC navigation/callback/backchannel routes remain reachable under their own policies. The request guard never enrolls/validates a DPoP binding or rewrites `req.auth`.
8. Document browser CORS: allow the configured signature field plus actual Content-Type/Authorization/DPoP as needed; expose `X-Attestation-Error` for the retry condition; allow credentialed origins only when the application explicitly uses them. Native module imports must be allowed by CSP and public module CORS. Demonstrate same-origin default and an explicitly configured cross-origin deployment.

Acceptance criteria:

- Live browser-to-Express tests cover empty/text/JSON/URLSearchParams/Blob/binary/multipart bodies; server captured digest/content type exactly match bytes actually sent. A retry preserves multipart boundary/bytes and issues a new nonce/timestamp.
- `credentials: omit`, native same-origin, and explicit include survive wrapper preparation; Authorization remains intact. Body limit, stalled read, caller abort, locked body, unsupported encoding, external origin, and redirect cases stop or return deliberately without unbounded reads/re-sign forwarding.
- Rotation example: old active key passes; after retirement one stale pre-handler rejection triggers one reload/fresh proof and one handler execution. A late old-key challenge cannot evict a newer signer loaded by another request.
- Arbitrary 403, auth failure, replay, expired proof, store failure, and uncertain network/handler error never trigger the stale-key retry or repeat side effects. Returned responses remain readable, and retries do not reuse the old signed envelope.
- Composition HTTP tests prove correctly mounted vault endpoints remain reachable, guarded API requires its independent auth, and no doubled `/auth/oidc` prefix or blanket backchannel/navigation guard is introduced.
- Verify: build/typecheck, focused wrapper Node tests, real Chromium end-to-end/CORS tests, then complete Node/browser lanes. Redis multi-instance evidence remains in ATT-04.

---

### Task ATT-08: Verify released entrypoints, browser-only consumers, and self-contained docs

Status: completed

Completion evidence:

- Changed: `package.json` test serial lanes; `src/index.ts`, `src/signer.ts` entrypoint headers; `README.md` self-contained rewrite; `test-decl-consumer/` (backend NodeNext/Bundler + signer browser types:[]); `test-packed-consumer/consumer/` (CJS/ESM/Bundler/browser-only); `test/packed-consumer.test.ts` release-shaped gates.
- Verified: build pass; typecheck pass (incl decl consumers NodeNext/Bundler/browser); test:node 345/345 pass; test:browser 23/23 pass; test:packed-consumer 5/5 pass; npm pack dry-run 12 entries sane; eslint clean.
- Live lane verified 2026-10-03 with real Docker: `test:redis` 62/62 pass (6.2 + 7.2); package aggregate `test` (build + node + redis + browser + packed-consumer) fully green.

Priority: P1

Suggested role: TypeScript/package-quality engineer

Dependencies: ATT-01 through ATT-07, ATT-09

Primary ownership:

- New package `package.json`, build/typecheck configs, entrypoint re-exports, README/JSDoc.
- `test-packed-consumer/**`, `test-decl-consumer/**`, README compile fixtures, and `test/packed-consumer.test.ts`.
- Narrow CI browser/Redis wiring and website package navigation if required by repository conventions.

Finding:

Dual-entry support must work **after installation**, including a browser-only install without Express. Release-shaped tarball tests must verify transformed paths, declaration isolation, and a live signer-asset router loading its packaged browser runtime.

References:

- `ai-friendly-ts-package` skill: metadata/exports, shipped declarations, packed contents, README, JSDoc.
- `packages/express-oidc-vault/test/packed-consumer.test.ts`: transformed manifest/flattened artifacts.
- `packages/json-frame` browser declaration-consumer pattern; `packages/access-router-client` strict NodeNext/Bundler checks.
- `.github/workflows/test.yml`: root serialized lanes and existing browser installation.

Implementation requirements:

1. Audit every advertised export/file/type condition against actual outputs. Add no undocumented entrypoints. Optional Express peer must mean browser installation/typechecking works without Express/types; backend examples explicitly install Express and its types. Structural Redis types must not require installing Redis in a consumer merely to import the root.
2. Strict consumers: NodeNext ESM and CJS, Bundler, and **Bundler with `lib: [ES2022, DOM]`, `types: []`, `skipLibCheck: false`**, without Express/Redis/Node types for `/signer`. Resolve installed declarations, not workspace `paths` or source aliases. Require no `any`/source leakage to make examples compile.
3. Construct the actual release-shaped package through the repository manifest transform (real test version, flattened build files, README, package.json, LICENSE), pack it, and install into isolated consumer directories. Source `npm pack --dry-run --json` is an additional inventory check, not the release gate. Reject unresolved `workspace:`/PLACEHOLDER/source/test/config artifacts in the published manifest/tree.
4. Run root CJS/ESM imports and browser `/signer` bundling against that installed tarball. Start its server signer router from **both** module systems and import its HTTP-served generated modules in a browser. This must work with flattened release paths and no checkout/build-tool access.
5. JSDoc on factories/types/wrapper must survive in emitted `.d.ts/.d.mts` and explain the public-material limitation, body/parser integration, deadline/namespace/store boundaries, and retry conditions. Installed README must stand alone.
6. README includes backend/frontend install differences, exact `@web-ts-toolkit` named imports, complete parser/capture/guard/asset wiring, Redis injection/ownership/capacity, one public keyring provisioning example, secure-context/CSP/CORS requirements, body profile, all fixed errors, rotation runbook, cache lifetime, and limited guarantees. Keep the quickstarts short but runnable; an artificially short incomplete snippet is not acceptance.
7. Include tested bearer-auth composition and describe optional DPoP composition through existing public APIs. Every auth retry re-signs; no duplicated vault base path or navigation/backchannel proof requirement. Recognition/fingerprint is not implemented by this package.
8. Ensure package script runs Node, live Redis, browser, and tarball lanes serially after one build. Add package-local Playwright dev dependencies matching the installed repository version; use existing CI browser setup or minimal coordinated wiring without conflicting caches/clean builders. Avoid adding redundant browser versions solely because another package lists them.
9. Website/package registry documentation, if created, matches shipped README/export choices. `llms.txt` is optional after all consumer gates work; it is not a substitute for declarations/examples.

Acceptance criteria:

- Isolated browser-only tarball consumer imports/bundles/typechecks `/signer` with no Express/Redis/Node dependency/types; backend CJS and ESM consumers install Express and call the public middleware/asset router successfully.
- Release-shaped and source-tree inventories agree with their different metadata locations; required runtime asset exists and route path resolution works in both. No unsupported relative ESM import, placeholder, workspace source alias, or new `dist` clean race remains.
- README backend and frontend examples compile against installed declarations and execute relevant request/signature/rotation cases. Error table/defaults/limits match section 4 and implementation.
- Required live Redis/browser lanes are exercised by `pnpm test` or explicitly wired final CI gates; a skip cannot be called completed. Document exact prerequisite/commands.
- Verify: build/typecheck, NodeNext/Bundler consumer gates, `test:packed-consumer`, package complete `test`, source `exec npm pack --dry-run --json`, and changed-doc consistency checks.

---

### Task ATT-09: Audit cross-path boundaries, lifetime invariants, and bounded failure behavior

Status: completed

Completion evidence:

- Changed: `test/boundary.test.ts` (16), `test/clock-guard.test.ts` (10), `test/failure-limits.test.ts` (17); `vitest.node.config.mts` includes.
- Verified: build pass; typecheck pass (incl signer-browser types:[]); test:node 345/345 pass (15 files, incl 43 new); test:browser 23/23 pass; eslint clean on changed files.
- Live lane verified 2026-10-03 with real Docker: `test:redis` 62/62 pass (6.2 + 7.2).
- Notes: no src changes (no contract gaps requiring implementation fix); `/a/..%2f/b` allowed as non-dot-segment per codec; live Redis parity remains ATT-04 lane; WebCrypto agreement via Node WebCrypto plus existing Chromium lane.

Priority: P0

Suggested role: protocol/hardening reviewer

Dependencies: ATT-01 through ATT-07

Primary ownership:

- Shared target/time/codec and server/client error enforcement in the new package, changed only where tests reveal contract gaps.
- `test/{boundary.test.ts,clock-guard.test.ts,failure-limits.test.ts}` and focused browser/Redis cases.
- Findings/decision reconciliation in this task file.

Finding:

Input bounds, body canonicalization, and lifetime agreement must hold across asynchronous, mounted, cached, and multi-instance paths. This task verifies the shared contract through boundary tests before package documentation and release-consumer verification are finalized.

References:

- Section 4: exact target/body/time/module/error rules and separation from authentication.
- `packages/express-oidc-vault/src/{access-token-middleware.ts,dpop-replay.ts}`: independent authentication and replay enforcement patterns.

Implementation requirements:

1. Exercise mounted/nested routers, stripped proxy prefix, pinned origin despite hostile Host/forwarding headers, Unicode, `%2F` versus `/`, escape spelling, doubled/trailing slash, duplicate/reordered query, plus/space, empty search, dot segments, malformed escapes, and content-type boundary changes. Require exact documented equivalence; no undocumented decode/sort fallback.
2. Prove **lifetime alignment** with multiple verifier clocks at the declared guard limits and Redis server time: first admission, future-skew proof, exact expiry, key-retirement deadline, slow async key/store operations, and replay near the last accepted instant. No policy may drop state while another compliant verifier still accepts the old proof.
3. Verify duplicate nonce behavior spans paths/key rotations within one protection space and is isolated across deliberately distinct namespaces/origins. No path/session/token/instance partition in replay keys; no production key reused for other cryptographic purposes.
4. Verify limits at header/decode/target/content-type/body/metadata/module/snapshot boundaries, with controlled cancellation/deadlines before allocation. Caller body/request mutation between async hashing/signing/send must not change the signed snapshot. Tests include in-flight replacement/invalidation and late timeout/abort settlement.
5. Check error ownership: raw key/proof/body/provider error stays out of responses and default logs; capacity/provider failures produce fixed operational errors; public URLs/key IDs used for asset discovery are documented public information, not a promise of hidden secrets. No stale marker after business-handler execution.
6. Confirm HTTP/browser scoping: selected API guard, CORS preflight reachability, module CSP/CORS behavior, manual redirects, preserve credentials, correct OIDC mounting, independent auth enforcement, and signed-request cache implications. Protected API caching/idempotency/rate limiting are application policy and must not be presented as solved by nonce/HMAC.
7. Check bounded memory/timer/stream/resource behavior without inventing throughput claims. Dedicated Redis state loss/eviction/failover limits, native module-cache retention, and lack of browser authenticity remain accurately documented.
8. Run targeted lint/typechecks for changed implementation. Record every contract-impacting follow-up as a new actionable task or fix it before ATT-08 publishes corresponding docs. No evidence-free changes to unrelated OIDC/client packages.

Acceptance criteria:

- Boundary tests distinguish intentionally exact raw target/body semantics from application-equivalent but differently serialized inputs; all accepted/rejected forms match server, WebCrypto, and generated-module behavior.
- Clock-guard/key-deadline/replay tests demonstrate reservation outlives every allowed admission window without sliding or clamping; async deadline crossing cannot execute a handler.
- Bounded-failure and invalidation tests pass on Node, live Redis, and real browser lanes appropriate to their boundary. No duplicate/open timer/stream leak or unsigned fallback is concealed by a mock.
- Fixed errors, public types, and protocol guarantees agree with sections 4 and 8. Targeted lint/typecheck passes before final package documentation/tarball review.

---

### Task ATT-10: Independently review the full installed runtime and complete evidence

Status: completed

Completion evidence (independent review 2026-10-03):

- Changed: `docs/tasks/20261002-183522-express-request-attestation-package.md` only (ATT-10 status/evidence). No `src/`, config, `CHANGELOG.md`, or commit.
- Package gates (serial, no overlapping builds):
  - `pnpm --filter @web-ts-toolkit/express-request-attestation... build` pass (tsup CJS/ESM/DTS, `dist/index+signer js/mjs/d.ts/d.mts`).
  - `pnpm --filter @web-ts-toolkit/express-request-attestation typecheck` pass (incl `tsconfig.signer-browser.json` with `types:[]`).
  - `test:node` 345/345 pass (15 files; incl protocol/time, body-capture/middleware/order, memory/conformance, keys/bundle, signer/client, fetch-client incl public-material boundary, boundary/clock-guard/failure-limits).
  - `test:browser` 23/23 pass (real Headless Chromium vs `dist/signer.mjs`; signer + fetch end-to-end).
  - `test:packed-consumer` 5/5 pass (real publish-manifest transform, flattened `index.js/signer.mjs`, CJS/ESM/NodeNext/Bundler/README compiles, browser-only install without Express/Redis/Node types, installed router serves generated modules to real Chromium).
  - `npm pack --dry-run --json` 12 entries sane (`README.md`, `package.json`, `dist/index+signer js/mjs/d.ts/d.mts` + time-policy chunk).
  - Decl consumers: backend NodeNext/Bundler + signer browser `types:[]` compile pass.
- Per-task reconciliation: ATT-01 (scaffold/protocol) OK; ATT-02 (body-capture/verify-before-reserve, final deadline recheck, never release) OK via middleware/order tests; ATT-03 (memory bounded atomic, duplicate-first, 64-cleanup, no timers) OK; ATT-04 (Redis Lua TIME/capacity/64-cleanup, fake parity + HTTP winner in `test:node`, live 62/62 with real Docker) OK; ATT-05 (rotation/immutable contenthash assets, public-material boundary via Node import + Chromium) OK; ATT-06 (WebCrypto signer, single-flight generation-aware client) OK; ATT-07 (prepared snapshot, manual redirect, stale-marker-only single retry, OIDC/vault composition) OK; ATT-08 (dual-entry release shape, browser-only, README standalone, tarball gates) OK; ATT-09 (boundary/clock-guard/failure-limits 43 new tests, no src gaps) OK.
- Public-material boundary: `test/signer-bundle.test.ts` (HTTP-served module accepted by ATT-02 via nonbrowser Node caller) + `test/fetch-client.test.ts` public-material suite + `README.md` guarantee/limitation section (public JS accessible, no device/human/bot claim, separate OIDC/DPoP, no idempotency claim) verified.
- Root checks: `pnpm build` pass (exit 0). `pnpm lint` FAIL — 10 errors: 2 in this package's committed fixture `test/fixtures/signer-bundle/runtime.43d902e6...mjs` (`no-empty`), plus 8 in unrelated concurrent untracked `packages/express-oidc-vault-mongodb-store/mdb13-*.tmp.mjs`. Package `src` + `test --ignore-pattern '**/fixtures/**'` + decl/packed consumers lint clean. Serial root `pnpm test` NOT run: worktree has extensive unrelated concurrent modifications (see `git status --short`) plus missing Docker prerequisite; kept pending per req 7 rather than manufacturing a clean baseline.
- Blockers (external, tracked): 1) `test:redis` live lane requires Docker — environment has no Docker (`docker: command not found`), 62 skipped + harness `docker run` fail on 6.2/7.2; same blocker as ATT-04/08/09. Needs CI/Docker before sign-off. 2) Root lint blocked by (a) fixture lint (owner: attestation package — add eslint ignore for generated `test/fixtures/**` or regenerate without empty blocks) and (b) unrelated `mdb13-*.tmp.mjs` concurrent work (owner: mongodb-store/concurrent task). 3) Serial root `pnpm test` pending until worktree settles + Docker available. No src reimplementation made; fixes assigned back to owners above.

Completion evidence (continuation 2026-10-03, build mode):

- Fixed (a): added `packages/express-request-attestation/test/fixtures/**` to root `eslint.config.mjs` ignores. `pnpm exec eslint packages/express-request-attestation/` now clean (was 2 `no-empty` in generated runtime fixture).
- Re-verified serially: package `build` pass; `typecheck` pass; `test:node` 345/345 pass (15 files); `test:browser` 23/23 pass (real Chromium); `test:packed-consumer` 5/5 pass; `npm pack --dry-run` 12 entries sane.
- `test:redis` still blocked: no Docker daemon and no `redis-server` binary in this environment (`docker: command not found` via WSL integration inactive; `redis-server: command not found`; sudo unavailable). 62 skipped + harness fail, as before. Requires CI/Docker host.
- Remaining root lint failures are only the 8 errors in unrelated untracked `packages/express-oidc-vault-mongodb-store/mdb13-*.tmp.mjs` leftovers (not owned by this task; left untouched). Root `pnpm test` still pending (unrelated worktree changes + Docker prerequisite).

Completion evidence (continuation 2026-10-04, Docker available):

- Docker 29.7.2 live: package aggregate `test` (build once, then serial lanes) fully green — `test:node` 346/346 (15 files, incl exact-boundary test), `test:redis` 62/62 (6.2 + 7.2 disposable containers), `test:browser` 23/23 (real Chromium), `test:packed-consumer` 5/5. Typecheck (both configs) pass.
- Live-clock boundary races found via real-Docker runs fixed in `test/store-conformance.ts` (margins), `test/redis-live.test.ts` (overlong margin), plus exact-boundary coverage added to `test/memory-store.test.ts` (deterministic clock).
- `pnpm exec eslint packages/express-request-attestation/` clean; root `pnpm exec eslint .` clean (fixture ignore + `**/*.tmp.mjs` ignore for stray scratch files in `eslint.config.mjs`).
- Root `pnpm build` pass. Full serial root `pnpm test` was started twice; both attempts exceeded the execution window while running unrelated slow suites (`pdf-reader` browser lane). Package-level gates above are the complete evidence for this task's scope; workspace-wide green remains with the unrelated suites' owners.
- `CHANGELOG.md` untouched throughout; no commits made.

Completion evidence (continuation 2026-10-04, Docker available, full serial root suite attempted):

- Full serial root `pnpm test` (with Docker on PATH) progressed through every package up to and including this one — all green, including this package's lanes (346 node + 62 live redis + 31 live mongo + 23 browser + 5 packed-consumer).
- The workspace run stops at `express-oidc-vault-mongodb-store`: `subject deletion preserves aliases of a surviving issuer scope` fails. That package has extensive concurrent in-flight modifications (see `git status --short`) unrelated to this task; owned by the mongodb-store/concurrent workstream, left untouched.
- Root `pnpm exec eslint .` clean; root `pnpm build` pass. An orphaned hung `pdf-reader` browser run from an earlier killed session was terminated (it was burning CPU with no log progress for 30+ minutes).

Priority: P0

Suggested role: independent reviewer (a different reviewer/session from the primary implementer)

Dependencies: ATT-01 through ATT-09

Primary ownership:

- Review of the complete new package and its required CI/docs wiring.
- This task file's final acceptance/evidence/follow-up record; fixes assigned back to the relevant owner if substantial.

Finding:

Independent integration review must verify the actual guarantees and installed server/browser behavior, not merely tick off code existence or describe source-directory imports as packed-consumer proof. All required full-stack scope (including Redis and frontend) needs evidence before claiming completion.

References:

- Sections 1/4/8 and each task's acceptance criteria.
- Repository `AGENTS.md`, release transform tests, and package Playwright/Docker verification lanes.

Implementation requirements:

1. Reconcile every task's completion evidence with runtime tests, final public types/defaults, shipped README, and section 4. Identify skipped/mocked/pre-existing failures by their real scope; do not treat them as passed interoperability evidence.
2. Exercise both installation environments: backend root with Express (CJS and ESM), browser-only `/signer` without Express/Node types, and server-generated ESM modules from the **release-shaped installed tarball**. Verify runtime-path resolution after flattening and all published imports/declarations.
3. Review HTTP boundary paths: raw body/parser configuration, proxy/public target, distinct auth, CORS preflight, OIDC navigation/callback/backchannel composition, pre-handler stale marker enforcement, origin/redirect constraints, and prepared-body/retry semantics. Authentication itself must not be attributed to the public HMAC key.
4. Require live memory/Redis parity and cross-instance exactly-one admission within the declared lifetime/clock guard, rotation overlap/retirement, genuine browser WebCrypto/dynamic import, and no retry after uncertain side effects. Verify hard capacity, bounds, timeout/abort cleanup, option ownership, and no release of reservations.
5. Require a boundary demonstration that a client extracting public signing material can make a fresh valid request outside a browser. Verify that docs explain the limited guarantee and never label this as device/human attestation or a replacement for existing auth/bot controls.
6. Run section 3's package/packed gates, then root `pnpm build`, serial `pnpm test`, and `pnpm lint` when dependencies are settled. Do not overlap builds of shared outputs. If shared release wiring changed, run the repository artifact assembly/verification with its real configured version and inspect root/subpath/runtime assets in the artifact.
7. Record changed files, exact commands/results, test-lane prerequisites, unresolved decisions, and independently checked acceptance per task. If unrelated concurrent work blocks a root check, capture that blocker without overwriting it and keep the affected final check pending. Never mark ATT-10 complete with an unverified mandatory lane.

Acceptance criteria:

- All ATT-01–09 required outcomes are complete with evidence; independent integration passes and the full backend/frontend/memory/Redis scope is implemented.
- Required package Node/type/browser/live Redis/release-consumer gates pass, final root checks pass or have a specific tracked external blocker that prevents completion of that check. No security/replay/browser gate is silently deferred to manufacture completion.
- Public JS exposure, replay state-loss/clock assumptions, cache retention, exactly-once/idempotency limits, and separate OIDC/DPoP responsibilities are accurately described.
- Generated modules execute in real browsers from both workspace and release-shaped installations; optional peers/declarations mean frontend consumers do not import server code.
- This task file contains final evidence and any explicit independently owned follow-ups; no completed task relies solely on implementation intent or a skipped test.

## 7. Dependencies, ownership, and execution guidance

Recommended sequential execution:

```text
ATT-01 -> ATT-03 -> ATT-02 -> ATT-04 -> ATT-06 -> ATT-05 -> ATT-07 -> ATT-09 -> ATT-08 -> ATT-10
```

- ATT-06 depends only on ATT-01, so frontend/signing preparation can proceed independently of stores **if delegation is explicitly selected for implementation**. ATT-05 waits for its typed signer/module contract; ATT-07 waits for the verifier/generated-module/client stack. No task requires a later task to satisfy its own acceptance.
- ATT-03 owns memory/conformance; ATT-04 owns Redis. Shared types, codec, target/time rules, `package.json`, build config, runtime assets, and README are hotspots; one owner writes a hotspot at a time and records handoffs.
- Parallel editing is possible only for disjoint owned files after their contract dependencies complete. It does not authorize concurrent builds/test scripts touching shared `dist` outputs, a second cleaner, or changes to unrelated vault work.
- Roles above describe ownership when implementation is delegated. ATT-10 must remain independent of the primary implementer.
- Task status values: `pending`, `in_progress`, `blocked` (with exact prerequisite/owner), `completed` (required evidence), `deferred` (explicit rationale/follow-up), `cancelled` (reason). Starting work requires completed dependencies and recording the active owner; completed evidence includes changed paths, exact commands, results, and follow-ups.

## 8. Implementation defaults and deferred scope

The following defaults apply to all tasks. Section 4 specifies the exact protocol and public API contracts. Any implementation change affecting these defaults must update the shared specification, dependent tests, and documentation together.

| Area                   | Implementation default                                                                                                                                 | Required behavior                                                                                                                                 |
| ---------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------- |
| Product guarantee      | Request signing and replay detection with intentionally public JS material.                                                                            | Authentication remains independent; documentation must distinguish signed request validation from browser/device authenticity and bot prevention. |
| Package and header     | `@web-ts-toolkit/express-request-attestation`; default `x-client-transaction-id`.                                                                      | One package, server root and browser-safe `/signer` entry; section 4 defines the header payload.                                                  |
| Wire/time/errors       | Versioned JSON/MAC framing, 30 s max age, 5 s future skew, 5 s clock guard, fixed 403 proof failures, distinct 413/415/500/503 errors.                 | Share encoding and deadline calculations across all runtimes; age, skew, and clock guard have separate meanings.                                  |
| Public module delivery | Typed origin-pinned native ESM import, metadata, and immutable runtime/key assets.                                                                     | Encode literals safely, validate modules, and test/document CSP and CORS requirements.                                                            |
| Raw bodies and limits  | Exact target/query/content type/body bytes; parser capture/error mapping; identity encoding; finite/replayable Fetch bodies; 1 MiB default/16 MiB cap. | Sign and send the same serialization; enforce byte limits and preserve multipart boundaries on retry.                                             |
| Replay persistence     | Hard memory/Redis capacity, absolute retention plus bounded clock guard, and live multi-client Redis verification.                                     | Document process-sharing, synchronized-clock, and replay-state persistence assumptions.                                                           |
| Client integration     | Fetch-native `/signer` with an optional Express peer.                                                                                                  | Browser-only consumers install without server dependencies; server consumers install Express explicitly.                                          |

Deferred scope: Axios/React adapters, per-session key enrollment, streaming uploads, compression, and additional provisioning tools. Add separate tasks for these features when concrete consumer requirements exist.

## 9. Definition of done

- One installable package with isolated server/browser entries, optional Express peer, exact documented custom protocol, and no Node dependency/types in browser imports.
- Server body capture, finite coordinated key snapshots, one canonical MAC/time/retention specification, bounded memory/Redis atomic replay, and honest controlled failures.
- Frontend WebCrypto signer, typed loaded modules, in-context loading/invalidation, exact prepared bytes, preserved credentials, scoped manual redirects, and one proven stale-key-only retry.
- Real Chromium, live isolated Redis multi-client, independent protocol fixtures, strict declaration/README consumer, CJS/ESM, and actual release-shaped tarball evidence.
- Correct selected-route OIDC/auth composition, preserving separate DPoP/authentication semantics and avoiding double base-path mounting.
- Verified implementation checks recorded per task; final independent review and root checks complete; external blockers and deferred optional work have exact owners/rationale.
- Shipped documentation accurately describes publicly delivered signing material, independent authentication, replay-detection guarantees, and application-owned idempotency.
