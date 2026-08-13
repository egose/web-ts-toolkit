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

## Quick Start

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
    backendOrigin: 'https://api.example.com',
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

### Namespaced Redis keys

Use `keyPrefix` when the same Redis instance stores data for multiple apps or environments.

```ts
const storeProvider = createRedisOidcVaultStore({
  client: redis,
  keyPrefix: 'my-app:oidc-vault',
});
```

This prevents the OIDC vault records from colliding with other apps using the same Redis deployment.

## Behavior

- uses prefixed Redis keys for sessions, authorization transactions, and exchange codes
- stores JSON payloads directly in Redis values
- uses `PXAT` for expiry timestamps
- uses `GETDEL` for one-time record consumption when the client adapter supports it
- falls back to `get` plus `del` for compatible client adapters that do not expose `sendCommand`
- updates subject and provider-session indexes so logout and backchannel logout can delete matching sessions efficiently
- uses Redis-side scripts for session writes, deletes, and rotation so concurrent refreshes do not fork multiple active sessions

## When To Use It

Use Redis when you need:

- shared session state across multiple app instances
- fast short-lived exchange code handling
- production-grade server-side session storage without coupling auth data to your primary database

This is usually the best production default when you already operate Redis and want auth/session state decoupled from your primary app database.

## API

`createRedisOidcVaultStore(options)`

Creates a Redis-backed implementation of the core `OidcVaultStoreProvider` contract.

`RedisOidcVaultStoreOptions`

- `client`: connected Redis client or compatible adapter
- `keyPrefix?`: optional key namespace, defaults to `oidc-vault`
- `now?`: override clock source for tests or deterministic simulations

`OidcVaultRedisClient`

Minimal client shape used by the package: `set`, `get`, `del`, and optional `sendCommand`.

## Operational Notes

- the package expects a connected client before use
- the official `redis` client already satisfies the required API shape
- one-time authorization transactions and exchange codes are consumed atomically
- subject and provider-session indexes make bulk session deletion practical for logout flows

## Related Packages

- [`@web-ts-toolkit/express-oidc-vault`](./express-oidc-vault)
- [`@web-ts-toolkit/express-oidc-vault-memory-store`](./express-oidc-vault-memory-store)
- [`@web-ts-toolkit/express-oidc-vault-mongodb-store`](./express-oidc-vault-mongodb-store)
