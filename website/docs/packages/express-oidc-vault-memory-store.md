---
sidebar_label: OIDC Vault Memory Store
sidebar_position: 7
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
- aliases expire with their immediate successor's `expiresAt`; later rotations do not extend them. Without expiry, memory/Redis impose no time limit, unlike MongoDB's default five-minute fallback. Non-expiring alias growth has no fixed size bound
- with `A/L1 -> B/L1 -> C/L2`, B revokes L2; retained A still revokes L1, not C. Memory retires inactive old-lineage aliases on rotation/upsert and clears alias-only target ownership on reuse. `getSession` never resolves aliases
- `deleteSession(...)`, `deleteSessionsByLogicalSessionId(...)`, `deleteSessionsBySubject(...)`, and `deleteSessionsByProviderSessionId(...)` logically revoke live sessions and remove stale rotation aliases when no live session remains in a logical lineage
- backchannel logout token JTI records are consumed only when `expiresAt` is a finite timestamp greater than the store clock at consume time

Portable callers use fresh session IDs (memory/MongoDB upsert live duplicates, Redis rejects) and JSON-compatible plain data. Inputs are captured at invocation and returned portable data is detached. Memory uses `structuredClone`; MongoDB BSON and Redis JSON/native-object semantics differ outside that subset.

Bulk deletes count live sessions, not expired records or aliases. Subject/provider-session objects filter each supplied issuer/client; string inputs and logical IDs are unscoped. A survivor in another scope preserves its unexpired aliases. Mutations run synchronously in this process, but later arrivals can survive. The 64-slot expiry sweep does not cap full key-snapshot rebuilds, full-map bulk deletion, or nested lineage/alias scans. No connection, readiness, or teardown is needed. Use fixed diagnostic categories instead of records, credentials or raw errors.

The [shipped README](https://github.com/egose/web-ts-toolkit/blob/main/packages/express-oidc-vault-memory-store/README.md) contains the complete portable/lifecycle contract and compatibility notes.

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
