---
sidebar_label: OIDC Vault Redis Store
sidebar_position: 5
---

# `@web-ts-toolkit/express-oidc-vault-redis-store`

Redis-backed store provider for `@web-ts-toolkit/express-oidc-vault`.

## Installation

```bash npm2yarn
npm install @web-ts-toolkit/express-oidc-vault @web-ts-toolkit/express-oidc-vault-redis-store express redis
```

## Usage

```ts
import express from 'express';
import { createClient } from 'redis';
import { createOidcVaultMiddleware } from '@web-ts-toolkit/express-oidc-vault';
import { createRedisOidcVaultStore } from '@web-ts-toolkit/express-oidc-vault-redis-store';

const app = express();
const redis = createClient({ url: process.env.REDIS_URL });

await redis.connect();

app.use(
  createOidcVaultMiddleware({
    basePath: '/auth/oidc',
    config: {
      issuer: process.env.OIDC_ISSUER,
      clientId: process.env.OIDC_CLIENT_ID,
      clientSecret: process.env.OIDC_CLIENT_SECRET,
    },
    frontendRedirectUri: 'https://frontend.example.com/callback',
    postLogoutRedirectUri: 'https://frontend.example.com/logged-out',
    storeProvider: createRedisOidcVaultStore({
      client: redis,
      keyPrefix: 'oidc-vault',
    }),
  }),
);
```

## Behavior

- uses prefixed Redis keys for sessions, authorization transactions, and exchange codes
- stores JSON payloads directly in Redis values
- uses `PXAT` for expiry timestamps
- uses `GETDEL` for one-time record consumption when the client adapter supports it
- falls back to `get` plus `del` for compatible client adapters that do not expose `sendCommand`

## When To Use It

Use Redis when you need:

- shared session state across multiple app instances
- fast short-lived exchange code handling
- production-grade server-side session storage without coupling auth data to your primary database

## API

`createRedisOidcVaultStore(options)`

Creates a Redis-backed implementation of the core `OidcVaultStoreProvider` contract.

`RedisOidcVaultStoreOptions`

- `client`: connected Redis client or compatible adapter
- `keyPrefix?`: optional key namespace, defaults to `oidc-vault`

`OidcVaultRedisClient`

Minimal client shape used by the package: `set`, `get`, `del`, and optional `sendCommand`.
