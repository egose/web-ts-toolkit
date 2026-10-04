# OIDC Vault DPoP Framework Examples (React / Vue / Angular, TS)

Created: 2026-10-04 08:53:08 UTC (`20261004-085308`)
Decisions: modern Angular (not 1.x) / minimal runnable demos / new `apps/*` dirs reusing the shared backend fixture.

## Objective

Add three minimal TypeScript demos for `@web-ts-toolkit/oidc-vault-dpop-client`, one per framework. Each demo covers the same flow against the shared example backend + local IdP fixture: sign in (POST login + IdP navigation), callback code exchange, protected profile via `fetchWithDpop`, refresh after JWT expiry, logout. Body transport only; cookie transport is a documented one-line change.

## Backend reuse (no server changes)

`apps/oidc-vault-dpop-example/server` pins a single `FRONTEND_ORIGIN` for CORS, `trustedOrigins`, and `frontendRedirectUri`. Each demo runs its own backend instance via env overrides through the existing entrypoint:

| Demo    | SPA port | `PORT`/`BACKEND_ORIGIN` | `IDP_PORT` | `FRONTEND_ORIGIN`       | `VITE_BACKEND_ORIGIN`   |
| ------- | -------- | ----------------------- | ---------- | ----------------------- | ----------------------- |
| React   | 4320     | 4330                    | 4331       | `http://127.0.0.1:4320` | `http://127.0.0.1:4330` |
| Vue     | 4321     | 4340                    | 4341       | `http://127.0.0.1:4321` | `http://127.0.0.1:4340` |
| Angular | 4322     | 4350                    | 4351       | `http://127.0.0.1:4322` | `http://127.0.0.1:4350` |

`dev:server` = env overrides + `pnpm --filter oidc-vault-dpop-example dev:server` (explicit env wins over `--env-file`). All three stacks can run simultaneously.

## Conventions per demo

- Vite + TS + `tsconfig.app.json`/`tsconfig.node.json` mirroring `apps/oidc-vault-dpop-example` (strict, `skipLibCheck:false`); `build` = typecheck + `vite build`; no `test` script (behavior gate stays on the vanilla Playwright suite); `lint` via root config.
- No client-side router dependency: single page reads `?code=` on boot (avoids double-exchange pitfalls; React demo omits `StrictMode` for the same reason).
- Lazy session singleton (no module-eval browser side effects); `apis = [{ origin: backendOrigin, replayNamespace: 'oidc-vault-dpop-example-api' }]` matching `server/app.ts:19`.
- Versions: React 19 + `@vitejs/plugin-react` 6, Vue 3.5 + `@vitejs/plugin-vue` 6 + `vue-tsc`, Angular 22 + `@analogjs/vite-plugin-angular` 2.8 + `zone.js` (default zone bootstrap).

## Tasks

### Task FW-01: React demo — Status: completed

Completion evidence:

- Added `apps/oidc-vault-dpop-react-example/` (`package.json`, `vite.config.ts`, `tsconfig.app/node.json`, `index.html`, `src/main.tsx|App.tsx|auth.ts|vite-env.d.ts`, `README.md`, `.env.example`). React 19, no `StrictMode` (one-time `?code=` exchange), no router, lazy session singleton.
- Verified (direct binaries; `pnpm --filter … <script>` is blocked repo-wide by pre-existing `ERR_PNPM_IGNORED_BUILDS` — see note below): `tsc` app+node clean, `vite build` OK (257KB), root `eslint` exit 0, dev serves HTML on 4320.
- Live wiring: shared backend booted with React env (`FRONTEND_ORIGIN` 4320 / backend 4330 / IdP 4331) — `/health` OK and CORS preflight echoes `http://127.0.0.1:4320` with credentials.
  Ownership: `apps/oidc-vault-dpop-react-example/`. Files: `package.json`, `vite.config.ts`, `tsconfig.app.json`, `tsconfig.node.json`, `index.html`, `src/main.tsx`, `src/App.tsx`, `src/auth.ts`, `src/vite-env.d.ts`, `README.md`, `.env.example`.
  Acceptance: `build`, `typecheck`, root `eslint` on dir all clean; dev server serves HTML.

### Task FW-02: Vue demo — Status: completed

Completion evidence:

- Added `apps/oidc-vault-dpop-vue-example/` (same skeleton; `src/App.vue` `<script setup lang="ts">`, `vue-tsc` typecheck covering template+script). Vue 3.5.
- Verified: `vue-tsc` + `tsc` node clean, `vite build` OK (99KB), root `eslint` exit 0, dev serves on 4321.
  Ownership: `apps/oidc-vault-dpop-vue-example/`. Same skeleton with `src/main.ts`, `src/App.vue` (`<script setup lang="ts">`), `src/auth.ts`; typecheck via `vue-tsc`.
  Acceptance: same as FW-01.

### Task FW-03: Angular demo — Status: completed

Completion evidence:

- Added `apps/oidc-vault-dpop-angular-example/` (standalone `AppComponent` + signals, `bootstrapApplication` + `zone.js`, `@analogjs/vite-plugin-angular` 2.8, `ngc` typecheck incl. templates, `experimentalDecorators`). Angular 22.
- Two plugin findings recorded in `vite.config.ts`: `include: ['/src/main.ts']` is required (default `[]` compiles nothing) and `experimental.useAngularCompilationAPI: true` is required (otherwise the entry never reaches the module graph — 0.67KB empty bundle).
- Verified: `ngc` + `tsc` node clean, `vite build` OK (307KB, contains `app-root`/DPoP), root `eslint` exit 0, dev serves on 4322.
  Ownership: `apps/oidc-vault-dpop-angular-example/`. Standalone `AppComponent` (signals), `bootstrapApplication` + `zone.js` in `src/main.ts`, `experimentalDecorators:true`.
  Acceptance: same as FW-01.

### Task FW-04: Cross-links — Status: completed

Completion evidence:

- `packages/oidc-vault-dpop-client/README.md`: new “Framework examples (TypeScript)” section (port table + `dev:server`/`dev` commands + backend-reuse note). Docs-compile test still passes (1 pass/1 dormant skip).

Note (pre-existing, now fixed): `pnpm --filter <pkg> <script>` failed repo-wide via `runDepsStatusCheck` → spawned `pnpm install` → `ERR_PNPM_IGNORED_BUILDS` (`lmdb`, `msgpackr-extract`). Root cause: `pnpm-workspace.yaml` had placeholder entries `lmdb: set this to true or false` / `msgpackr-extract: set this to true or false` in `allowBuilds` (every other vendor package was explicitly `true`/`false`). Fixed by approving both (`lmdb: true`, `msgpackr-extract: true`); `pnpm install` now exits 0. Re-verified through normal pnpm scripts: all three demos `typecheck`/`lint`/`build` pass, plus untouched `oidc-vault-dpop-example typecheck` passes (fix is global, not scoped to new work).
Add a “Framework examples” section to `packages/oidc-vault-dpop-client/README.md` pointing at the three apps (ports, backend-reuse table).

## Verification (per demo, serial builds)

```sh
pnpm install
pnpm --filter oidc-vault-dpop-{react,vue,angular}-example build
pnpm --filter oidc-vault-dpop-{react,vue,angular}-example typecheck
pnpm --filter oidc-vault-dpop-{react,vue,angular}-example exec eslint src
```

Plus: boot shared backend with demo env + `vite dev --port`, `curl` SPA HTML and CORS preflight (`Origin` → `Access-Control-Allow-Origin` echo) as wiring proof.
