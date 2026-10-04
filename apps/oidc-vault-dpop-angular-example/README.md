# OIDC vault DPoP Angular example (TypeScript)

Minimal modern Angular (standalone component, signals) + TypeScript demo for `@web-ts-toolkit/oidc-vault-dpop-client`: sign in, callback code exchange, protected profile via `fetchWithDpop`, refresh, logout. Body transport only. Built with Vite via `@analogjs/vite-plugin-angular`; typechecked with `ngc`, so component templates are covered too.

## Run it

Requirements: Node `>=22.12.0`, pnpm, and a secure-context browser with Web Crypto + IndexedDB.

```sh
# Terminal 1: shared backend + local IdP, pinned to this SPA origin.
pnpm --filter oidc-vault-dpop-angular-example dev:server

# Terminal 2: Vite SPA on http://127.0.0.1:4322/.
pnpm --filter oidc-vault-dpop-angular-example dev
```

Open **http://127.0.0.1:4322/**, click **Sign in via OIDC provider**, then **Continue as the fixture user**. The backend (`http://127.0.0.1:4350`) and IdP (`http://127.0.0.1:4351`) use dedicated ports so all three framework demos can run simultaneously. Override with `VITE_BACKEND_ORIGIN` (see `.env.example`); the backend origin must match `dev:server`.

## Notes

- One `createOidcVaultDpopSession` singleton per page lifetime (`src/auth.ts`, lazy — construction touches `sessionStorage`). Same persistent IndexedDB key backs login, exchange, refresh, logout, and API proofs.
- Access JWT stays in memory; the body handle lives in `sessionStorage`. Key loss requires fresh login — no Bearer fallback.
- No client router: the callback is the same page reading `?code=` once in `ngOnInit`.
- Cookie transport variant: use `basePath: '/auth/oidc/cookie'` with `sessionTransport: 'cookie'` (backend mounts both; see the shared server).
