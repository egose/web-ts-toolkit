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

## Usage

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

## Behavior

- sessions are stored in `Map` instances in the current Node.js process
- authorization transactions and one-time exchange codes are consumed once
- expiry cleanup is opportunistic and happens during reads and writes

## API

`createMemoryOidcVaultStore(options?)`

Creates an in-memory implementation of the core `OidcVaultStoreProvider` contract.

`MemoryOidcVaultStoreOptions`

Supports a custom `now()` function for deterministic tests.
