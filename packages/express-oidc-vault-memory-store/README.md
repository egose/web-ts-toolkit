# `@web-ts-toolkit/express-oidc-vault-memory-store`

In-memory store provider for `@web-ts-toolkit/express-oidc-vault`.

## Installation

```sh
pnpm add @web-ts-toolkit/express-oidc-vault @web-ts-toolkit/express-oidc-vault-memory-store express
```

## Use Cases

- local development
- test environments
- examples and package integration smoke tests

## Production Note

This package stores authorization transactions, exchange codes, sessions, rotated-session aliases, and backchannel logout replay JTIs in process memory.

Do not use it for multi-instance or production deployments. Use Redis or MongoDB provider packages for durable or horizontally scaled deployments.

## Quick Start

```ts
import express from 'express';
import { createOidcVaultMiddleware } from '@web-ts-toolkit/express-oidc-vault';
import { createMemoryOidcVaultStore } from '@web-ts-toolkit/express-oidc-vault-memory-store';

const app = express();
const storeProvider = createMemoryOidcVaultStore();

app.use(
  createOidcVaultMiddleware({
    basePath: '/auth/oidc',
    backendOrigin: 'https://api.example.com',
    config: {
      issuer: process.env.OIDC_ISSUER,
      clientId: process.env.OIDC_CLIENT_ID,
      clientSecret: process.env.OIDC_CLIENT_SECRET,
    },
    frontendRedirectUri: 'https://frontend.example.com/callback',
    storeProvider,
  }),
);
```

For local development, this is the shortest setup because it has no Redis, MongoDB, or file-system dependency. Sessions are lost on process restart and are not visible to other Node.js instances.

### Test-Friendly Clock Override

`now()` returns epoch milliseconds and defaults to `Date.now`. Override it only as a deterministic test seam; the returned value must be monotonic enough for the expiry scenarios your test exercises.

```ts
const storeProvider = createMemoryOidcVaultStore({
  now: () => 1_700_000_000_000,
});
```

## Main Exports

- `createMemoryOidcVaultStore(...)`
- `type MemoryOidcVaultStoreOptions`

## Session Rotation Aliases

When a session is rotated, the previous public session ID remains a revocation alias for the current logical session while that logical session is still live. Aliases expire with the rotated target session and are removed when logical, subject, provider-session, direct, or expiry deletion leaves no live session in that logical lineage.

Rotation requires a distinct unused target session ID. Missing-source, same-ID, and existing-target rotation conflicts throw `OidcVaultStoreConflictError` without changing source or target records.

## Store Contract

The store keeps these record kinds in separate in-process maps:

- authorization transactions, consumed once by `state`
- exchange codes, consumed once by `code`
- sessions, read and deleted by session, logical session, subject, or provider session identifiers
- rotated-session aliases, used only so an old public session ID can revoke the current logical session
- backchannel logout token JTIs, consumed once until their expiry time

`createAuthorizationTransaction`, `createExchangeCode`, and `createSession` are upserts; creating the same key again replaces the old value. Metadata should be structured-clone compatible and JSON-compatible for portability across the memory, Redis, and MongoDB stores. The memory store clones inputs and returned records with `structuredClone`, so callers retain ownership of their objects and later mutations do not update persisted state.

Expiry checks use `expiresAt <= now()` as expired. Cleanup is opportunistic: reads and writes prune expired records in bounded batches or when a specific record is accessed, not on a background timer.

`deleteSession(...)`, `deleteSessionsByLogicalSessionId(...)`, `deleteSessionsBySubject(...)`, and `deleteSessionsByProviderSessionId(...)` logically revoke live sessions and remove stale rotation aliases when no live session remains in a logical lineage.

## Replay JTI Expiry

Backchannel logout token JTI records are consumed only when `expiresAt` is a finite timestamp greater than the store clock at consume time. Expired, equal-to-current-time, `NaN`, and infinite expiries return `false` and are not stored.
