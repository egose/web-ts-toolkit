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

This package stores authorization transactions, exchange codes, and sessions in process memory.

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
    storeProvider,
  }),
);
```

## Main Exports

- `createMemoryOidcVaultStore(...)`
- `type MemoryOidcVaultStoreOptions`
