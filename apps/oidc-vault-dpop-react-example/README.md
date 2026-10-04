# OIDC vault DPoP React example (TypeScript)

Minimal React 19 + TypeScript demo for `@web-ts-toolkit/oidc-vault-dpop-client`: sign in, callback code exchange, protected profile via `fetchWithDpop`, refresh, logout. Body transport only.

## Run it

Requirements: Node `>=22.12.0`, pnpm, and a secure-context browser with Web Crypto + IndexedDB.

```sh
# Terminal 1: shared backend + local IdP, pinned to this SPA origin.
pnpm --filter oidc-vault-dpop-react-example dev:server

# Terminal 2: Vite SPA on http://127.0.0.1:4320/.
pnpm --filter oidc-vault-dpop-react-example dev
```

Open **http://127.0.0.1:4320/**, click **Sign in via OIDC provider**, then **Continue as the fixture user**. The backend (`http://127.0.0.1:4330`) and IdP (`http://127.0.0.1:4331`) use dedicated ports so all three framework demos can run simultaneously. Override with `VITE_BACKEND_ORIGIN` (see `.env.example`); the backend origin must match `dev:server`.

## Notes

- One `createOidcVaultDpopSession` singleton per page lifetime (`src/auth.ts`, lazy — construction touches `sessionStorage`). Same persistent IndexedDB key backs login, exchange, refresh, logout, and API proofs.
- Access JWT stays in memory; the body handle lives in `sessionStorage`. Key loss requires fresh login — no Bearer fallback.
- No `StrictMode` in `src/main.tsx`: the one-time callback `?code=` exchange must run exactly once.
- No client router: the callback is the same page reading `?code=` on boot.
- Cookie transport variant: use `basePath: '/auth/oidc/cookie'` with `sessionTransport: 'cookie'` (backend mounts both; see the shared server).
