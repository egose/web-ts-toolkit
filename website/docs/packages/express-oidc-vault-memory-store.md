---
sidebar_label: OIDC Vault Memory Store
sidebar_position: 4
---

# `@web-ts-toolkit/express-oidc-vault-memory-store`

In-memory store provider for `@web-ts-toolkit/express-oidc-vault`.

## Installation

```bash npm2yarn
npm install @web-ts-toolkit/express-oidc-vault @web-ts-toolkit/express-oidc-vault-memory-store express
```

## Use Cases

- local development
- tests
- examples and smoke checks

## Production Note

This package stores authorization transactions, exchange codes, sessions, rotated-session aliases, and backchannel logout replay JTIs in process memory.

Do not use it for production or multi-instance deployments. Use the Redis or MongoDB store provider instead.

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

### Test-friendly clock override

The store accepts a custom `now()` function. It returns epoch milliseconds and defaults to `Date.now`. Override it only as a deterministic test seam; the returned value must be monotonic enough for the expiry scenarios your test exercises.

```ts
const storeProvider = createMemoryOidcVaultStore({
  now: () => 1_700_000_000_000,
});
```

That lets tests control expiry behavior without waiting for real time to pass.

## Behavior

- authorization transactions, exchange codes, sessions, rotated-session aliases, and backchannel logout replay JTIs are stored in `Map` instances in the current Node.js process
- authorization transactions and exchange codes are consumed once
- `createAuthorizationTransaction`, `createExchangeCode`, and `createSession` are upserts; creating the same key again replaces the old value
- metadata should be structured-clone compatible and JSON-compatible for portability across the memory, Redis, and MongoDB stores
- inputs and returned records are cloned with `structuredClone`, so callers retain ownership of their objects
- expiry uses `expiresAt <= now()` as expired, and cleanup is opportunistic during reads and writes rather than a background timer
- rotation requires a distinct unused target session ID; missing-source, same-ID, and existing-target conflicts throw `OidcVaultStoreConflictError` without changing source or target records
- rotated public session IDs remain revocation aliases for the current logical session while that logical session is still live
- `deleteSession(...)`, `deleteSessionsByLogicalSessionId(...)`, `deleteSessionsBySubject(...)`, and `deleteSessionsByProviderSessionId(...)` logically revoke live sessions and remove stale rotation aliases when no live session remains in a logical lineage
- backchannel logout token JTI records are consumed only when `expiresAt` is a finite timestamp greater than the store clock at consume time

## When To Use It

Choose the memory store when you want:

- the shortest local-development setup
- integration tests without Redis or MongoDB
- predictable in-process behavior for smoke tests and examples

Do not choose it when sessions must survive process restarts or be shared across multiple Node.js instances.

## API

`createMemoryOidcVaultStore(options?)`

Creates an in-memory implementation of the core `OidcVaultStoreProvider` contract.

`MemoryOidcVaultStoreOptions`

Supports a custom `now()` function for deterministic tests.

## Related Packages

- [`@web-ts-toolkit/express-oidc-vault`](./express-oidc-vault)
- [`@web-ts-toolkit/express-oidc-vault-redis-store`](./express-oidc-vault-redis-store)
- [`@web-ts-toolkit/express-oidc-vault-mongodb-store`](./express-oidc-vault-mongodb-store)
