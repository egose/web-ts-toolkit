# OIDC vault DPoP Vue example (TypeScript)

Minimal Vue 3 + `<script setup lang="ts">` demo for `@web-ts-toolkit/oidc-vault-dpop-client`: sign in, callback code exchange, protected profile via `fetchWithDpop`, refresh, logout. Body transport only. Typechecked with `vue-tsc`, so the SFC template and script are both covered.

## Run it

Requirements: Node `>=22.12.0`, pnpm, and a secure-context browser with Web Crypto + IndexedDB.

```sh
# Terminal 1: shared backend + local IdP, pinned to this SPA origin.
pnpm --filter oidc-vault-dpop-vue-example dev:server

# Terminal 2: Vite SPA on http://127.0.0.1:4321/.
pnpm --filter oidc-vault-dpop-vue-example dev
```

Open **http://127.0.0.1:4321/**, click **Sign in via OIDC provider**, then **Continue as the fixture user**. The backend (`http://127.0.0.1:4340`) and IdP (`http://127.0.0.1:4341`) use dedicated ports so all three framework demos can run simultaneously. Override with `VITE_BACKEND_ORIGIN` (see `.env.example`); the backend origin must match `dev:server`.

## Notes

- One `createOidcVaultDpopSession` singleton per page lifetime (`src/auth.ts`, lazy — construction touches `sessionStorage`). Same persistent IndexedDB key backs login, exchange, refresh, logout, and API proofs.
- Access JWT stays in memory; the body handle lives in `sessionStorage`. Missing/changed keys require fresh login. An existing corrupt key needs explicit `await getSession().resetKey()` before login; it removes only this scope's key/metadata and does not revoke server sessions. No Bearer or implicit replacement-key fallback.
- No client router: the callback is the same page reading `?code=` once in `onMounted`.
- Cookie transport variant: use `basePath: '/auth/oidc/cookie'` with `sessionTransport: 'cookie'` (backend mounts both; see the shared server).
- Session lifecycle mutations use FIFO ordering and refresh coalescing. `clear` invalidates frontend auth while retaining the key; `dispose` closes the context while retaining reload state; `logout` calls the server. Use `requiresLogin`, not every 401, for terminal errors. The client defaults to 15,000 ms / 1 MiB per vault attempt; API cancellation is caller-owned. Full nonce, gateway `pathPrefix`, zero-lifetime, recovery and upgrade contracts: [shipped client guide](../../packages/oidc-vault-dpop-client/README.md).
