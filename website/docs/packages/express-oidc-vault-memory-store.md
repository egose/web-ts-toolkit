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

This package stores authorization transactions, exchange codes, and sessions in process memory.

Do not use it for production or multi-instance deployments. Use the Redis or MongoDB store provider instead.

## Quick Start

```ts
import express from 'express';
import { createOidcVaultMiddleware } from '@web-ts-toolkit/express-oidc-vault';
import { createMemoryOidcVaultStore } from '@web-ts-toolkit/express-oidc-vault-memory-store';

const app = express();

app.use(
  createOidcVaultMiddleware({
    basePath: '/auth/oidc',
    config: {
      issuer: process.env.OIDC_ISSUER,
      clientId: process.env.OIDC_CLIENT_ID,
      clientSecret: process.env.OIDC_CLIENT_SECRET,
    },
    frontendRedirectUri: 'https://frontend.example.com/callback',
    storeProvider: createMemoryOidcVaultStore(),
  }),
);
```

For local development, this is the simplest store because it has no external infrastructure requirements.

### Test-friendly clock override

The store accepts a custom `now()` function, which is useful in deterministic tests.

```ts
const storeProvider = createMemoryOidcVaultStore({
  now: () => 1_700_000_000_000,
});
```

That lets tests control expiry behavior without waiting for real time to pass.

## Behavior

- sessions are stored in `Map` instances in the current Node.js process
- authorization transactions and one-time exchange codes are consumed once
- expiry cleanup is opportunistic and happens during reads and writes
- session rotation fails with a conflict if the original session no longer exists
- `deleteSessionsBySubject(...)` and `deleteSessionsByProviderSessionId(...)` are supported for logout and backchannel logout flows

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
