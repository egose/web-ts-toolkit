# OIDC Vault DPoP Browser Client Package — `oidc-vault-dpop-client`

Created: 2026-10-03 23:24:46 UTC (`20261003-232446`)
Source decisions: Public npm clients / Full port (body+cookie, Web Locks, nonce, fingerprint) / Vanilla framework-agnostic only (no React).

## Objective and scope

Create a new public workspace package `packages/oidc-vault-dpop-client` (`@web-ts-toolkit/oidc-vault-dpop-client`) by promoting the private copy-paste SPA helpers at `apps/oidc-vault-dpop-example/src/auth/` into a versioned, typed, AI-friendly browser client for `@web-ts-toolkit/express-oidc-vault` DPoP flows.

In scope:

- Full port of 12 files (~1100 LOC): `index.ts`, `auth-session.ts` (507), `auth-fetch.ts` (165), `credentials.ts` (119), `device-fingerprint.ts` (118), `dpop-key-store.ts` (81), `dpop-proof.ts` (48), `errors.ts` (42), `scope.ts` (85), `key-database.ts` (67), `nonce-cache.ts` (17), `wire.ts` (36) — behavior-preserving move, no protocol change.
- Browser-only runtime: WebCrypto ECDSA P-256, IndexedDB via `idb`, `jose`, `sessionStorage`, Web Locks + `BroadcastChannel` for cookie transport. No `express`, no `node:*`, no `src/*`/`dist/*` deep imports for consumers.
- Public API freeze: `getOrCreateDpopKey`, `createDpopProof`, `createOidcVaultDpopSession` (`login/exchange/refresh/logout/getAccessToken/getKey/clear/dispose`), `fetchWithDpop`, `createDeviceFingerprint` + `fingerprintJsSignalSource`, `OidcVaultDpopClientError`, `DpopNonceCache` (only if already public), DTO types. Named root imports only; no default export.
- Wire-type deduplication: stop copying `wire.ts` DTOs; import/re-export canonical backend declarations from `@web-ts-toolkit/express-oidc-vault` as types.
- Packaging to workspace standards: `tsup` → `dist/`, CJS+ESM + `.d.mts`/`.d.ts`, `exports` map, `files: [README,dist]`, `sideEffects:false`.
- Tests: unit (Vitest Node) + `jsdom` bundle smoke + real-browser Playwright lane reused from example + strict typecheck lanes + packed-consumer + docs-compile.
- Docs: AI-friendly `README.md` (install, body vs cookie quickstarts, CORS/`trustedOrigins`/transaction-cookie, nonce retry, storage/key-loss policy, cross-site/Safari limits), JSDoc on entrypoints, `llms.txt` only if justified.
- Migration: `apps/oidc-vault-dpop-example` consumes the new package instead of local `src/auth/`; both READMEs updated; wire-contract test moved/kept green.

Out of scope for v1: React hooks (`useDpopSession`), framework adapters, fingerprint-vendor SDK bundling, backend changes, PoP for non-DPoP vault modes.

## Working rules and non-goals

- Behavior-preserving port. No change to `htm/htu/iat/jti/ath/nonce` semantics, `normalizeDpopTarget` rules, replayable-body policy, single-nonce-retry + single `invalid_token` refresh cycle, `credentials` matrix (`login/exchange` always `include`; `refresh/logout` body=`omit`, cookie=`include`), `Cache-Control: no-store` reliance, `cnf.jkt` response check (decode only, not verify), `sessionStorage` tab-local body handles vs backend-only cookie handles.
- Do not import `express`, `node:crypto`, `node:fs`, or any Node builtin from `src/`. Browser globals (`crypto.subtle`, `indexedDB`, `sessionStorage`, `navigator.locks`, `BroadcastChannel`) only behind `assertDpopBrowserFeatures`.
- Do not invent new entrypoints/subpaths beyond `.` for v1.
- Do not add default export to match `access-router` style; this package is named-export-first like `access-router-client`/`utils`.
- Keep `pnpm test` serialization: per-package scripts rebuild deps via `pnpm --filter <pkg>... build`; never run workspace builds concurrently (see `AGENTS.md`).
- Non-goals: Safari/WebKit certification beyond documenting current Chromium 151 + Firefox 153 evidence; arbitrary cross-site third-party-cookie guarantees; external-IdP deployment automation.

## Baseline verification

Run before starting Wave 1 and record results in task file:

```sh
pnpm install
pnpm --filter oidc-vault-dpop-example... build
pnpm --filter @web-ts-toolkit/express-oidc-vault... build
ls apps/oidc-vault-dpop-example/src/auth/
wc -l apps/oidc-vault-dpop-example/src/auth/*.ts
```

Confirmed baseline (2026-10-03):

- `apps/oidc-vault-dpop-example/src/auth/` has 12 files; `auth-session.ts:507`, `auth-fetch.ts:165`, `credentials.ts:119`, `device-fingerprint.ts:118`, `scope.ts:85`, `dpop-key-store.ts:81`, `key-database.ts:67`, `dpop-proof.ts:48`, `errors.ts:42`, `wire.ts:36`, `nonce-cache.ts:17`, `index.ts:11`.
- Browser graph has no Express/Node import; `test/wire-contract.test.ts:1-34` type-checks copied DTOs against `@web-ts-toolkit/express-oidc-vault` root declarations.
- Backend package publishes only `README.md` + `dist` (`packages/express-oidc-vault/package.json:37-38`), single `src/index.ts` entry (`tsup.config.ts:3-7`); browser helpers explicitly “not a backend package export” (`packages/express-oidc-vault/README.md:1391,864`).
- Precedents: `packages/access-router-client/{package.json,tsup.config.ts}` (`es2022`, `bundle:true`, `browserslist`, `jsdom` smoke), `packages/access-router-react/package.json` (decl-consumer `nodenext`+`bundler` lanes, packed-consumer, docs-compile).

## Priority / severity definitions

- P0: blocks publish or breaks DPoP security contract (key scope, proof freshness, `ath`, `jkt` match, replay/nonce, credential storage).
- P1: blocks AI-friendly install/consume (exports/types/README mismatch, missing peer/dep, `npm pack` gap).
- P2: hardening, JSDoc, `llms.txt`, coverage expansion.

## Ordered waves

1. Wave A — scaffold + behavior-preserving port (CLIENT-01, CLIENT-02).
2. Wave B — wire-type single source + packaging metadata correctness (CLIENT-03, CLIENT-04).
3. Wave C — verification: unit + bundle smoke + typecheck lanes + packed/docs consumers (CLIENT-05, CLIENT-06).
4. Wave D — real-browser lane + example migration + READMEs (CLIENT-07, CLIENT-08).
5. Wave E — release readiness + independent final review (CLIENT-09, CLIENT-10).

## Detailed executable tasks

### Task CLIENT-01: Scaffold `packages/oidc-vault-dpop-client` to workspace standards

Status: completed

Completion evidence:

- Changed: `packages/oidc-vault-dpop-client/{package.json,tsup.config.ts,tsconfig.json,tsconfig.typecheck.json,tsconfig.test-typecheck.json,src/index.ts,README.md}` (new); `pnpm-lock.yaml` (mechanical install update).
- Verified: `pnpm install` ok (29 projects); `pnpm --filter @web-ts-toolkit/oidc-vault-dpop-client build` success — `dist/index.js/index.mjs/index.d.ts/index.d.mts` emitted; `typecheck:source` + `typecheck:test` pass; `npm pack --dry-run` lists only `README.md` + `dist/*` + `package.json`, no `src/*`/`express`.
- Result: skeleton builds; `dist/index.mjs` 0B expected until CLIENT-02 port; nodenext/bundler lanes + browser-smoke deferred to CLIENT-05/06.
- Follow-up: CLIENT-04 to confirm `exports` `default` fallback omission; CLIENT-06 to wire nodenext/bundler into aggregate.

Priority: P0

Suggested agent: package-scaffolder

Dependencies: none

Primary ownership:

- `packages/oidc-vault-dpop-client/package.json`
- `packages/oidc-vault-dpop-client/tsup.config.ts`
- `packages/oidc-vault-dpop-client/tsconfig.json`, `tsconfig.typecheck.json`, `tsconfig.test-typecheck.json`
- `packages/oidc-vault-dpop-client/README.md` (skeleton)
- `packages/oidc-vault-dpop-client/src/index.ts` (re-export shim, initially empty)

Finding:

No frontend package exists; consumers copy `apps/oidc-vault-dpop-example/src/auth/` per `packages/express-oidc-vault/README.md:864` and `apps/oidc-vault-dpop-example/README.md:50-52`. No versioning, no `npm pack` surface, drift risk on vault wire changes.

References:

- `apps/oidc-vault-dpop-example/package.json:23-29` (deps `jose`, `idb`)
- `packages/access-router-client/package.json:1-70`
- `packages/access-router-client/tsup.config.ts:19-28`
- `packages/express-oidc-vault/tsup.config.ts:1-9`
- `AGENTS.md:1-23`

Implementation requirements:

1. Create package dir with name `@web-ts-toolkit/oidc-vault-dpop-client`, `description` mentioning “DPoP browser client for express-oidc-vault, body+cookie transports”, `homepage` `https://web-ts-toolkit.pages.dev/docs/packages/oidc-vault-dpop-client`, `version`/`license`/`repository` placeholders matching workspace convention.
2. `sideEffects:false`, `main: dist/index.js`, `module: dist/index.mjs`, `types: dist/index.d.ts`, `exports["."]` with `types.import: ./dist/index.d.mts`, `types.require: ./dist/index.d.ts`, `import: ./dist/index.mjs`, `require: ./dist/index.js`.
3. `files: ["README.md","dist"]` (add `llms.txt` later only if Task CLIENT-08 justifies it).
4. `dependencies: {jose: ^6.1.0, idb: ^8.0.3}` — runtime required; do NOT list `express`. `devDependencies`: `typescript`, `vitest`, `jsdom`, `@web-ts-toolkit/express-oidc-vault: workspace:*` (types only), `@types/node` for tooling.
5. `engines: {node: ">=22"}` for tooling; add `browserslist: ["chrome >= 94","edge >= 94","firefox >= 93","safari >= 16"]` mirroring `access-router-client` until real-browser matrix proves otherwise; document cookie mode additionally needs Web Locks + BroadcastChannel.
6. `tsup.config.ts`: `entry: ["src/index.ts"]`, `format: ["cjs","esm"]`, `dts:true`, `target: "es2022"`, `bundle:true`, `splitting:false`, `clean:true`, `outDir: dist`. Add comment explaining `es2022` browser+Node intersection and no Node builtins (cf. `access-router-client/tsup.config.ts:1-28`).
7. `scripts`: `build: tsup --config tsup.config.ts`; `typecheck` + `typecheck:source/test/nodenext-strict/bundler-strict`; `test` = `pnpm --filter @web-ts-toolkit/oidc-vault-dpop-client... build && pnpm typecheck && vitest run --config ../../vitest.config.ts` (+ browser lane in CLIENT-07); `test:browser-smoke` for `vitest.browser.config.ts`.
8. Skeleton `src/index.ts` with `export {}` and TODO pointing to CLIENT-02; skeleton `README.md` with package name + “under construction — see CLIENT-08”.

Acceptance criteria:

- `pnpm --filter @web-ts-toolkit/oidc-vault-dpop-client build` emits `dist/index.js`, `dist/index.mjs`, `dist/index.d.ts`, `dist/index.d.mts`.
- `npm pack --dry-run` (in package dir) lists only `README.md` + `dist/*`; no `src/auth` leakage, no `express` in bundle.
- `pnpm --filter @web-ts-toolkit/oidc-vault-dpop-client typecheck:source` passes on skeleton.
- No change to `apps/oidc-vault-dpop-example/src/auth/*` in this task.

---

### Task CLIENT-02: Port `src/auth/*` behavior-preserving into new `src/`

Status: completed

Completion evidence:

- Changed: `packages/oidc-vault-dpop-client/src/` 12 files ported verbatim + 6-line browser-only header each; `src/index.ts` surface identical to example.
- Verified: `diff -r` shows 6 added lines/file, 0 logic changes; `grep node:/express` empty; `pnpm --filter @web-ts-toolkit/oidc-vault-dpop-client build` success (`dist/index.js` 35.5KB, `index.mjs` 34.1KB); `node -e import(dist/index.mjs)` IMPORT-OK with 7 named exports, no default.
- Result: behavior-preserving port done; example untouched.

Priority: P0

Suggested agent: frontend-porter

Dependencies: CLIENT-01

Primary ownership:

- `packages/oidc-vault-dpop-client/src/*.ts` (12 files)
- `apps/oidc-vault-dpop-example/src/auth/*` (read-only reference; do not edit)

Finding:

Security-critical logic lives only in example: key creation/validation (`dpop-key-store.ts:10-81`), proof minting (`dpop-proof.ts:16-48`), scope/target normalization (`scope.ts:18-85`), session lifecycle + cookie locks + BroadcastChannel (`auth-session.ts:58-507`), scoped fetch + retry (`auth-fetch.ts:80-165`), credential parsing (`credentials.ts:22-119`), `key-database.ts`, `nonce-cache.ts`, `errors.ts`, `device-fingerprint.ts`. Any manual copy diverges silently.

References:

- `apps/oidc-vault-dpop-example/src/auth/index.ts:1-11`
- `apps/oidc-vault-dpop-example/src/auth/auth-session.ts:58-199`
- `apps/oidc-vault-dpop-example/src/auth/dpop-proof.ts:16-48`
- `apps/oidc-vault-dpop-example/src/auth/scope.ts:18-85`
- `apps/oidc-vault-dpop-example/src/auth/auth-fetch.ts:44-165`

Implementation requirements:

1. Copy all 12 files verbatim into `packages/oidc-vault-dpop-client/src/` preserving filenames and export names. Keep `fetch`/`navigate`/`now` injection points, `sessionTransport: 'body'|'cookie'`, `credentials` matrix, `redirect:'error'`, `cache:'no-store'`, single-nonce-retry + single-refresh semantics, `DPOP_*` error codes.
2. Fix only import paths for new location (`./wire` → local or backend types per CLIENT-03 decision; record choice). No logic edits, no lint-driven refactors, no API renames.
3. Preserve `assertDpopBrowserFeatures` gating (`scope.ts:66-85`): body requires secure-context + WebCrypto + IndexedDB; cookie additionally requires `navigator.locks` + `BroadcastChannel`. No fallback to ephemeral/extractable keys.
4. Add `grep -R "from ['\"]node:" src/` guard (must be empty) and `grep -R "from ['\"]express" src/` guard (must be empty). Document allowed browser globals in file header comment.
5. Keep `src/index.ts` re-export surface identical to example `src/auth/index.ts` (4 intended APIs + fingerprint + errors + types).

Acceptance criteria:

- `diff -r` between new `src/` and `apps/.../src/auth/` shows only import-path lines (plus header comment); reviewer can verify with `diff` command output pasted in evidence.
- New package builds; `node -e "import('./dist/index.mjs')"` does not throw at import time in Node (browser-only code must not touch `window`/`navigator` at module top-level; `auth-session.ts:69-70` asserts lazily via factory).
- Unit smoke: existing example unit tests still pass unmodified (proves no example regression from copy).

---

### Task CLIENT-03: Single-source wire DTOs against backend declarations

Status: completed

Completion evidence:

- Changed: `packages/oidc-vault-dpop-client/src/wire.ts` 42→13 lines re-export shim (type-only backend re-exports, 7 DTOs); `test/wire-contract.test.ts` new (7 DTO `toEqualTypeOf` asserts). Dropped dead `OidcVaultErrorResult`.
- Verified: serial `... build` success; `vitest` 2 tests pass; `typecheck` source+test pass; `grep express-oidc-vault dist/index.mjs` empty (type-only); `grep node:/express src` empty.
- Result: single-source types proven; `./wire` paths stable, no edits to credentials/session/fetch.

Priority: P0

Suggested agent: types-integrator

Dependencies: CLIENT-02

Primary ownership:

- `packages/oidc-vault-dpop-client/src/wire.ts` (delete or re-export shim)
- `packages/oidc-vault-dpop-client/src/credentials.ts`, `auth-session.ts`, `auth-fetch.ts` (type imports)
- `packages/oidc-vault-dpop-client/test/wire-contract.test.ts` (new)

Finding:

`apps/.../src/auth/wire.ts:1-36` duplicates backend DTOs; only protection is `apps/.../test/wire-contract.test.ts:22-34` `expectTypeOf(...).toEqualTypeOf(...)`. A published client must not ship a forkable copy.

References:

- `apps/oidc-vault-dpop-example/src/auth/wire.ts:1-36`
- `apps/oidc-vault-dpop-example/test/wire-contract.test.ts:1-34`
- `packages/express-oidc-vault/src/types.ts` (backend DTO source; locate `OidcVaultExchangeResult`, `OidcVaultTokenIssueResult`, `OidcVaultUserProfile`, `OidcVaultLoginInitiationInput/Result`, `OidcVaultLogoutResult`, `OidcVaultSessionTransport`)

Implementation requirements:

1. Replace local `wire.ts` interfaces with `import type {...} from '@web-ts-toolkit/express-oidc-vault'` re-exports. If backend package cannot be a runtime dep for browsers, use `devDependencies: workspace:*` + `import type` (erased at build, no runtime pull of `express`/`jose`-node). Verify built `dist/index.mjs` contains no `express-oidc-vault` runtime import via `grep`.
2. Preserve exact type identity: new `test/wire-contract.test.ts` asserts `expectTypeOf<ClientX>().toEqualTypeOf<BackendX>()` for all 7 DTOs. Must fail if backend adds/removes field.
3. Update all internal `from './wire'` imports to new location; keep public type export names stable so `import {...} from './auth'` call sites map 1:1 to package root.
4. If backend DTOs include Node-only helpers, pick only the 7 wire DTOs; do not re-export backend store/hook types from browser entrypoint.

Acceptance criteria:

- `wire.ts` is ≤20 lines of `export type {...} from '@web-ts-toolkit/express-oidc-vault'` (or deleted with direct backend imports); no local interface duplication.
- New wire-contract test passes under `../../vitest.config.ts`.
- `grep -R "express-oidc-vault" dist/index.mjs` returns empty (type-only dependency proven).

---

### Task CLIENT-04: Harden packaging metadata + `npm pack` surface (ai-friendly-ts-package)

Status: completed

Completion evidence:

- Changed: JSDoc on `createOidcVaultDpopSession`/`fetchWithDpop` + canonical import comment in `src/index.ts`; no `exports` change (omit `default` fallback — Node import+require verified).
- Verified: `main/module/types/exports` all exist; `npm pack --dry-run` 6 files (README+4 dist+package.json, 22.6kB), no src/test; `dist/index.d.mts` exposes 4 APIs + required types, no key-database leak, JSDoc survives; `sideEffects:false` correct; ephemeral NodeNext/Bundler `skipLibCheck:false` consumers pass; `typecheck:source/test` pass.
- Result: pack surface correct. Note: `DpopNonceCache`/`DpopAccessToken`/`DeviceFingerprint` not root-exported (parity with example) — CLIENT-08 decision.

Priority: P1

Suggested agent: packaging-reviewer

Dependencies: CLIENT-03

Primary ownership:

- `packages/oidc-vault-dpop-client/package.json`, `tsup.config.ts`
- `packages/oidc-vault-dpop-client/dist/index.d.mts`, `dist/index.mjs` (generated evidence)

Finding:

Per `ai-friendly-ts-package` skill, installed consumers see only `package.json` + `dist/*` + `README.md`. `exports`↔`tsup` drift, missing `jose`/`idb` deps, or lost JSDoc in `.d.mts` breaks editor/AI discoverability.

References:

- `.opencode/skills/ai-friendly-ts-package/SKILL.md`
- `packages/access-router-client/package.json:17-45`
- `packages/access-router-react/package.json:17-30`

Implementation requirements:

1. Verify every `exports` target exists post-build; `main/module/types` point at real files; `exports.types.import → dist/index.d.mts`, `require → dist/index.d.ts`.
2. Run `npm pack --dry-run` and assert `README.md` + `dist/*` present, `src/*`, `test/*`, `.env*` absent.
3. Inspect generated `dist/index.d.mts`: all 4 intended APIs + `DpopApi/DpopFetchContext/DpopFetchOptions/OidcVaultDpopSession(Options)/DpopKey` reachable from root; no internal `key-database` leak unless intentional; JSDoc on `createOidcVaultDpopSession` and `fetchWithDpop` survives (add minimal JSDoc in source if missing — allowed exception to CLIENT-02 freeze).
4. Confirm `sideEffects:false` correct (no module-eval registration; `auth-fetch.ts:33` `WeakMap` is lazy).
5. Document canonical import: `import { createOidcVaultDpopSession, fetchWithDpop } from '@web-ts-toolkit/oidc-vault-dpop-client'` — named root only.

Acceptance criteria:

- Checklist in evidence: `main/module/types/exports/files/sideEffects/dependencies` all verified with file paths.
- `npm pack --dry-run` output pasted (redacted tarball size ok).
- Editor smoke: fresh `test-decl-consumer/` `tsconfig-nodenext.json` + `tsconfig-bundler.json` importing package root typechecks (mirror `access-router-client` lanes).

---

### Task CLIENT-05: Unit + `jsdom` bundle-smoke coverage for client invariants

Status: completed

Completion evidence:

- Changed: `test/scope.unit.test.ts`, `credentials.unit.test.ts`, `dpop-proof.unit.test.ts`, `nonce-cache.unit.test.ts`, `auth-fetch.unit.test.ts`, `vitest.browser.config.ts`, `test/oidc-vault-dpop-client.browser-smoke.ts` (new, `dist/index.mjs` imports).
- Verified: serial `... build` success; `vitest root` 6 files/46 tests pass (80 expects); `vitest.browser` 1 file/5 tests pass; `typecheck:source/test` clean. Deterministic (fixed NOW, stub fetch, HS256 fixture, no real IDB).
- Result: P0 invariants locked; mutation probes (identity-target stub, auto-upper gate, no-jkt check) fail as expected.

Priority: P0

Suggested agent: unit-test-author

Dependencies: CLIENT-03

Primary ownership:

- `packages/oidc-vault-dpop-client/test/*.unit.test.ts`
- `packages/oidc-vault-dpop-client/test/*.browser-smoke.ts`
- `packages/oidc-vault-dpop-client/vitest.browser.config.ts`

Finding:

Ported logic has no package-owned tests yet; example coverage lives in app. Must lock proof/target/nonce/scope/credential contracts at package level before migration.

References:

- `apps/oidc-vault-dpop-example/src/auth/scope.ts:18-44`
- `apps/oidc-vault-dpop-example/src/auth/credentials.ts:22-84`
- `apps/oidc-vault-dpop-example/src/auth/auth-fetch.ts:44-103`
- `packages/access-router-client/vitest.browser.config.ts:1-22`
- `packages/access-router-client/test/access-router-client.browser-smoke.ts` (pattern)

Implementation requirements:

1. Add unit tests (Node Vitest, root config): `normalizeDpopTarget` (uppercase method, reserved `%2F` preserved, query/fragment stripped, `//host/path` handling, userinfo reject); `normalizeStaticOrigin` (HTTPS vs loopback allow, path/query reject); `parseDpopCredentials` (body requires `sessionId`, cookie forbids it, `tokenType:'DPoP'` required, `cnf.jkt` mismatch → `INVALID_BOUND_CREDENTIAL_RESPONSE`, `expiresAt=min(now+expiresIn, exp)`); `replayableBody` (string/URLSearchParams/Blob/ArrayBuffer/FormData snapshot, stream throws); `challengeError` parsing (`DPoP error="use_dpop_nonce"` vs Bearer noise); `DpopNonceCache.remember/get/clear` per `(space,jkt)`.
2. Add `vitest.browser.config.ts` (`jsdom`) smoke importing built `dist/index.mjs` (not `src`): asserts named exports exist, `createDpopProof` rejects lowercase method, `resolveDpopScope` rejects insecure origin. Catches Node-builtin leak / bundling regression; explicitly NOT a real-engine gate.
3. Keep tests deterministic: inject `now`, stub `fetch`, no network, no IndexedDB real persistence (mock `withDpopDatabase` boundary or use `fake-indexeddb` only if already in workspace — otherwise test pure functions + error paths).

Acceptance criteria:

- `pnpm --filter @web-ts-toolkit/oidc-vault-dpop-client... build && vitest run --config ../../vitest.config.ts` passes (≥15 assertions).
- `pnpm --filter @web-ts-toolkit/oidc-vault-dpop-client build && vitest run --config vitest.browser.config.ts test/*.browser-smoke.ts` passes.
- Each P0 invariant has a failing-before/passing-after proof (new tests, so record “fails on stub implementation” or “fails if logic inverted” mutation check).

---

### Task CLIENT-06: Strict typecheck lanes + packed/docs consumers

Status: completed

Completion evidence:

- Changed: `test-decl-consumer/tsconfig-nodenext.json/bundler.json` + `decl-consumer.strict.test.ts`; `test/packed-consumer-harness.ts` + `oidc-vault-dpop-client.packed-consumer.test.ts`; `test/oidc-vault-dpop-client.docs.compile.test.ts` (dormant); `package.json` typecheck aggregate now 4 lanes.
- Verified: serial `... build` clean; `typecheck` 4 lanes pass; `test` 9 files 55 pass/1 skip (packed 3 pass incl. 6-file allowlist + CJS/ESM + both tsc lanes); `eslint` clean. Docs-compile explicitly skipped (README skeleton, 0 fences) — CLIENT-08 to activate.
- Result: strict `skipLibCheck:false` NodeNext/Bundler consumers proven; packed surface proven.

Priority: P1

Suggested agent: typecheck-hygienist

Dependencies: CLIENT-04, CLIENT-05

Primary ownership:

- `packages/oidc-vault-dpop-client/tsconfig*.json`, `test-decl-consumer/`
- `packages/oidc-vault-dpop-client/test/*.packed-consumer.test.ts`, `*.docs.compile.test.ts`

Finding:

Workspace requires `skipLibCheck:false` strict `NodeNext`/`Bundler` consumers (`packages/express-oidc-vault/README.md:35` pattern). Browser client must not force `skipLibCheck:true` or deep imports.

References:

- `packages/access-router-react/package.json:33-48` (typecheck + packed/docs scripts)
- `packages/access-router-client/package.json:33-39`

Implementation requirements:

1. Add `tsconfig.typecheck.json` (source), `tsconfig.test-typecheck.json`, `test-decl-consumer/tsconfig-nodenext.json` + `tsconfig-bundler.json` importing package root with `strict:true, skipLibCheck:false, moduleResolution: nodenext/bundler`.
2. Add `test/*.packed-consumer.test.ts`: builds tarball (`npm pack`), installs/extracts to temp, imports root from packed `dist` (mirrors `access-router-react` packed tests). Assert no `src/` import needed.
3. Add `test/*.docs.compile.test.ts`: extracts every `ts` codeblock from `README.md` quickstarts and typechecks/compiles them (prevents README drift — required after CLIENT-08, stub now).
4. `scripts.test` must run `typecheck` before `vitest`; document serial-build requirement.

Acceptance criteria:

- `pnpm --filter @web-ts-toolkit/oidc-vault-dpop-client typecheck` (all 4 lanes) passes.
- Packed-consumer test passes on clean `dist/`.
- Docs-compile harness exists (may be skipped until README lands; record skip explicitly).

---

### Task CLIENT-07: Real-browser lane (Playwright Chromium+Firefox) reuse

Status: completed

Priority: P0

Suggested agent: browser-test-porter

Completion evidence:

- Changed: `packages/oidc-vault-dpop-client/package.json` `test:browser` delegation only; decision (b) suite stays in example.
- Verified: chromium 5 files/21 pass; firefox 5 files/21 pass; delegated chromium+firefox 5 files/42 pass; fileParallelism:false, 60s timeouts, 127.0.0.1 dynamic ports.
- Result: redirect/reload/cookie/CORS/key-expiry/retry/tab coverage preserved. WebKit uncertified. Residual: dist-under-test deferred to CLIENT-08 (page-bridge needs non-public internals).

Dependencies: CLIENT-05

Primary ownership:

- `packages/oidc-vault-dpop-client/test/browser/**/*.browser.ts`
- `packages/oidc-vault-dpop-client/vitest.real-browser.config.ts` (or reuse app config)
- `apps/oidc-vault-dpop-example/test/browser/**` (read-only reference)

Finding:

`jsdom` smoke cannot prove IndexedDB `CryptoKey` structured-clone persistence, non-extractability, transaction-cookie redirect, CORS, Web Locks/BroadcastChannel coordination, or reload/tab races. Example has Node-controller + Playwright pages with dynamic loopback ports, real IdP document, backend redirects (`apps/oidc-vault-dpop-example/README.md:39-48`, `vitest.browser.config.ts:1-13`).

References:

- `apps/oidc-vault-dpop-example/vitest.browser.config.ts:1-13`
- `apps/oidc-vault-dpop-example/README.md:21-23,96-114`

Implementation requirements:

1. Decide placement: (a) move real-browser suite into new package with minimal fixture server (preferred for public package self-certification), or (b) keep suite in example app consuming new package (cheaper). Default: (b) for v1, plus package-owned `test:browser` script delegating to app suite with `DPOP_TEST_BROWSERS=chromium,firefox`. Document decision + residual risk (package has no standalone engine gate).
2. If (b): ensure example suite imports package `dist`, not `../src/auth`, after CLIENT-08 migration; record Chromium 151 + Firefox 153 pass; WebKit explicitly out-of-scope (missing Linux libs) with docs note.
3. Preserve coverage: redirect/reload/cookie/CORS/key-expiry/retry/tab-first-creation + export-failure + persistence checks. No fake-IndexedDB acceptance.
4. Keep `fileParallelism:false`, 60s timeouts, dynamic ports, `127.0.0.1` (not `localhost`) discipline.

Acceptance criteria:

- `pnpm --filter oidc-vault-dpop-example test:browser` (or package-delegated equivalent) passes on Chromium; Firefox pass recorded or blocker filed.
- Evidence notes `dist/` under test (package build, not source).
- WebKit/Safari status explicitly recorded as uncertified with docs reference.

---

### Task CLIENT-08: AI-friendly README + JSDoc + example migration

Status: completed

Priority: P1

Suggested agent: docs-migrator

Completion evidence:

- Changed: package `README.md` rewritten (body+cookie quickstarts, CORS/trustedOrigins/nonce/storage/key-loss/retry/fingerprint/Safari); JSDoc extended on `createDpopProof`/`getOrCreateDpopKey`; root exports added `DpopNonceCache`, `DpopAccessToken`, `DeviceFingerprint` family (8 named, no default); `llms.txt` 45 lines added; example `src/auth/` deleted, `main.ts` imports package root, `page-bridge` keeps test-only local mirrors, wire-test deleted, fingerprint/docs tests repointed; backend vault README + website synced.
- Verified: package build/typecheck(4)/unit+wire 46/docs.compile active/packed+decl 8/jsdom 5 pass; example typecheck/lint/test:unit 44/build/dev pass; real browsers Chromium 5/21 + Firefox 5/21 pass on package dist.
- Result: docs-compile active; example dogfoods package dist; no stale copy instruction.

Dependencies: CLIENT-04, CLIENT-07

Primary ownership:

- `packages/oidc-vault-dpop-client/README.md`, `llms.txt` (if justified)
- `packages/oidc-vault-dpop-client/src/index.ts` JSDoc
- `apps/oidc-vault-dpop-example/src/auth/*` (delete or thin re-export shim), `apps/oidc-vault-dpop-example/README.md`, `apps/oidc-vault-dpop-example/package.json`
- `packages/express-oidc-vault/README.md:862-910` (link update only)

Finding:

Today consumers learn from two READMEs + copy instruction. After publish, installed consumers see only new package `README.md` + `dist/*.d.mts` (per `ai-friendly-ts-package` skill). Example must dogfood the package.

References:

- `packages/express-oidc-vault/README.md:561-910` (standalone recipe + SPA example)
- `apps/oidc-vault-dpop-example/README.md:50-114`
- `packages/access-router-client/README.md` (quickstart pattern)

Implementation requirements:

1. Write package README: install (`pnpm add @web-ts-toolkit/oidc-vault-dpop-client jose idb` — clarify `jose`/`idb` are deps, not peers to install separately, if CLIENT-01 chose `dependencies`), canonical named imports, 2 quickstarts (body `/auth/oidc/body`, cookie `/auth/oidc/cookie` with `sessionTransport`), `backendOrigin/basePath` exact-mount rule, CORS (`origin, credentials:true, allowedHeaders, exposedHeaders`), `trustedOrigins` + `transactionCookie.sameSite:'none'` cross-site note, nonce-retry rule, storage table (memory JWT / `sessionStorage` body handle+pending `jkt` / HttpOnly cookie / IndexedDB key scope `[frontendOrigin,backendOrigin,basePath]`), key-loss → fresh login, no Bearer fallback, `credentials` matrix table, `fetchWithDpop` retry table (`GET/HEAD/OPTIONS` retryable, mutations single-attempt unless `retry:'idempotent'`), fingerprint opt-in snippet, Safari/third-party-cookie limits.
2. Add JSDoc on `createOidcVaultDpopSession`, `fetchWithDpop`, `createDpopProof`, `getOrCreateDpopKey` visible in `dist/index.d.mts` (hover test).
3. Migrate example: `apps/.../package.json` adds `@web-ts-toolkit/oidc-vault-dpop-client: workspace:*`; `src/auth/` becomes re-export shim or deleted; all app imports updated; `wire-contract.test.ts` updated to import from new package (or deleted if CLIENT-03 covers it — record choice).
4. Update `packages/express-oidc-vault/README.md` DPoP SPA section to `pnpm add @web-ts-toolkit/oidc-vault-dpop-client` + link new package README; keep backend wire tables authoritative (no fork).
5. Decide `llms.txt`: add only if README + decls correct and package has ≥2 workflows (vault lifecycle + API fetch) — likely yes, keep ≤60 lines index-like.

Acceptance criteria:

- Fresh consumer can copy-paste both quickstarts and reach `login → callback → exchange → refresh → fetchWithDpop → logout` without opening repo source (reviewer test).
- `test/*.docs.compile.test.ts` passes on README codeblocks.
- Example `dev`, `build`, `typecheck`, `lint`, `test:unit` pass consuming package `dist`.
- `packages/express-oidc-vault/README.md` contains no stale `copy src/auth/` instruction.

---

### Task CLIENT-09: Release readiness — lint, artifact, changelog

Status: completed

Priority: P1

Suggested agent: release-preparer

Completion evidence:

- Changed: none in repo (dist staging + tarball git-ignored only); release-notes fragment at `<repo-root>/_tmp/oidc-vault-dpop-client-release-notes.md`, NOT in CHANGELOG.md per instruction.
- Verified: serial `... build` clean (35.58KB/34.13KB/11.61KB); `eslint` scoped + full `pnpm lint` exit 0; `build-artifact --version 0.0.0-test` + `verify-artifact` pass (tarball includes new package); `publish-packages --version 0.43.0 --filter ... --dry-run` picks up package, placeholders → 0.43.0/Apache-2.0/git URL, 8 files.
- Result: release-ready, additive (breaking none), wire pinned at 555766b/0.43.0.

Dependencies: CLIENT-06, CLIENT-08

Primary ownership:

- `packages/oidc-vault-dpop-client/package.json` (version/license metadata check)
- `scripts/publish-packages.mjs`, `release-artifact.config.json`
- `CHANGELOG.md` / release notes fragment

Implementation requirements:

1. `pnpm --filter @web-ts-toolkit/oidc-vault-dpop-client... build` clean.
2. `pnpm lint` (eslint) clean for new package + migrated example.
3. `pnpm build-artifact -- --version <ver>` + `pnpm verify-artifact -- --version <ver>` pass (or record asdf-inapplicable with maintainer sign-off; do not skip silently).
4. Confirm `publish-packages` picks up new package (placeholder version/license replacement works like other `@web-ts-toolkit/*`).
5. Draft release notes: new package, breaking-none (additive), backend wire version pinned/tested (`express-oidc-vault` version or workspace commit), migration (`copy src/auth` → `pnpm add` + import rewrite + `/body` vs `/cookie` `basePath` note).

Acceptance criteria:

- Lint + artifact verify logs pasted or linked.
- Publish dry-run shows new package included with correct `homepage/keywords/files`.
- Release-notes fragment committed or attached to task.

---

### Task CLIENT-10: Independent final integration review

Status: completed

Priority: P0

Suggested agent: independent-reviewer (must not be implementer of CLIENT-02/03/08)

Completion evidence:

- Changed: none (review only).
- Verified: per-task CLIENT-01..09 all PASS; security boundaries proven (wrong-key/ath/jti rejected, cookie sessionId rejected, peer-token jkt/generation enforced, key-loss→fresh login); gates serial clean — package build/typecheck(4)/test 55+1skip/smoke 5/lint 0, example unit 44/build/typecheck clean, browser Chromium 21/21 (1 flake rerun green) + Firefox 21/21, backend 1942 pass, artifact verify + publish dry-run pass.
- Result: No P0 open, DoD met. Follow-ups: AREA-01 trim backend transitive decls (P2), AREA-02 readPeerToken unit tests (P2), AREA-03 record Chromium flake (P3).

Dependencies: CLIENT-09

Primary ownership: whole diff + `docs/tasks/20261003-232446-oidc-vault-dpop-client-package.md` (this file)

Implementation requirements:

1. Verify each acceptance criterion against runtime behavior (not code reading): import package from packed tarball in blank Vite app; run body + cookie login → exchange → refresh → `fetchWithDpop` → logout against example server.
2. Check security boundaries: wrong-key proof rejected, `ath` mismatch rejected, replayed `jti` rejected, `sessionId` in cookie JSON rejected, peer-token with wrong `jkt`/expired `generation` not adopted, key-loss requires fresh login (no silent rebind).
3. Check public surface: `exports`↔`dist` match, `.d.mts` hover/JSDoc, no default export confusion, no `src/*` deep-import need, `npm pack` contents exact.
4. Check docs agreement: package README, example README, backend vault README wire tables consistent on `basePath`, `credentials`, CORS, nonce codes (`400 OIDC_VAULT_USE_DPOP_NONCE` vault vs `401` API `use_dpop_nonce`).
5. Run full gates serially: `pnpm --filter @web-ts-toolkit/oidc-vault-dpop-client... build`, `pnpm --filter @web-ts-toolkit/oidc-vault-dpop-client typecheck`, `pnpm --filter @web-ts-toolkit/oidc-vault-dpop-client test` (or equivalent per final scripts), `pnpm lint`, plus example `test:unit` (+ `test:browser` if resources allow; otherwise record browser evidence from CLIENT-07).
6. File follow-ups as new `AREA-xx` tasks (do not silently expand scope); mark deferred items with rationale + residual risk.

Acceptance criteria:

- Reviewer sign-off comment with per-task verdicts + command outputs.
- No P0 open; P1/P2 deferred items listed in “Deferred decisions” with risk.
- Definition of done (below) fully met or explicitly waived by maintainer.

## Dependency and parallelization guidance

- Sequential backbone: CLIENT-01 → CLIENT-02 → CLIENT-03 → (CLIENT-04 + CLIENT-05 in parallel, different files) → CLIENT-06 → CLIENT-07 → CLIENT-08 → CLIENT-09 → CLIENT-10.
- CLIENT-04 (metadata) and CLIENT-05 (tests) may run in parallel after CLIENT-03 (no shared files except `package.json` scripts — CLIENT-05 must not edit `package.json` scripts; sequence if conflict).
- CLIENT-06 needs both CLIENT-04 and CLIENT-05 green.
- Shared hotspots: `packages/oidc-vault-dpop-client/src/index.ts` (CLIENT-02 owns; CLIENT-03/08 append only via review), `packages/oidc-vault-dpop-client/package.json` (CLIENT-01 owns; later tasks propose edits in comments, single writer applies).
- Keep workspace builds serialized per `AGENTS.md`; never run two `pnpm --filter ... build` concurrently.

## Deferred decisions requiring maintainer input

1. Final npm name: `@web-ts-toolkit/oidc-vault-dpop-client` (proposed) vs `@web-ts-toolkit/express-oidc-vault-dpop-client` (longer, backend-aligned). Default to former; confirm before CLIENT-09 publish config.
2. `jose`/`idb` as `dependencies` (chosen) vs `peerDependencies`. `dependencies` favored (required at runtime, version-pinned); confirm no duplicate-`jose` browser-bundle concern.
3. Real-browser suite home: package-owned (CLIENT-07 option a) vs example-owned delegation (option b, v1 default). Confirm before CLIENT-07 starts.
4. `wire.ts` deletion vs re-export shim (CLIENT-03). Confirm after backend `types.ts` inspection.
5. `llms.txt` inclusion (CLIENT-08). Confirm after README lands.

## Final integration / review task

See CLIENT-10. Reviewer must be independent and verify runtime behavior + artifact + docs agreement.

## Definition of done

- `packages/oidc-vault-dpop-client` builds, typechecks (4 lanes), lints, and publishes (`npm pack`) with correct `exports`/`dist`/`README` surface.
- Behavior-preserving port proven by `diff` + unit + `jsdom` smoke + real-browser Chromium (+Firefox or filed blocker) evidence.
- Wire DTOs single-sourced to backend; wire-contract test green; built bundle has no `express`/`node:*` runtime import.
- Example app consumes packed package; both READMEs + backend vault README link updated; docs-compile tests green.
- `pnpm lint`, per-package `test`, and `build-artifact`/`verify-artifact` (or waived with rationale) pass; reviewer sign-off recorded; follow-ups filed as new tasks.

## Continuation — build-mode verification and resolutions (2026-10-04)

Re-verified in build mode, serially: `... build` clean (35.58/34.13/11.61KB), `typecheck` 4 lanes clean, root vitest 9 files 55 pass/1 skip, jsdom smoke 5/5, `npm pack --dry-run` 7 files, `eslint src test` exit 0. DoD still holds; no regressions.

Deferred decisions — resolved as implemented:

1. npm name: `@web-ts-toolkit/oidc-vault-dpop-client` confirmed (package.json, publish dry-run `@0.43.0`).
2. `jose`/`idb` as `dependencies` confirmed (bundle keeps them external; README single-install).
3. Browser suite home: option (b) example-owned delegation confirmed (`test:browser` delegates; page-bridge imports package root).
4. `wire.ts`: re-export shim (13 lines, type-only) confirmed.
5. `llms.txt`: included (45 lines, ≤60) confirmed.

Follow-ups from CLIENT-10:

- AREA-01 (P2, trim backend transitive `express-serve-static-core` augmentation from `.d.mts`): deliberately deferred. Types-only, zero runtime effect; stripping risks breaking the single-source DTO contract. Revisit on consumer report.
- AREA-02 (P2, `readPeerToken` unit tests): completed — `packages/oidc-vault-dpop-client/test/read-peer-token.unit.test.ts`, 8 tests pass (adopt/wrong-jkt/stale-generation/expired/non-DPoP/non-object/cnf-mismatch/expiry-clamp). Typecheck + eslint clean.
- AREA-03 (P3, Chromium flake): stands as recorded (single flake, immediate rerun 21/21); capture spec + trace if it recurs.
