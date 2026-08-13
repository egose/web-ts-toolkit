# `@web-ts-toolkit/express-oidc-vault-redis-store`

Redis-backed store provider for `@web-ts-toolkit/express-oidc-vault`.

## Installation

```sh
pnpm add @web-ts-toolkit/express-oidc-vault @web-ts-toolkit/express-oidc-vault-redis-store express redis
```

## Quick Start

```ts
import { createClient } from 'redis';
import { createRedisOidcVaultStore } from '@web-ts-toolkit/express-oidc-vault-redis-store';

const redis = createClient({ url: process.env.REDIS_URL });
await redis.connect();

const storeProvider = createRedisOidcVaultStore({
  client: redis,
  keyPrefix: 'oidc-vault',
});
```

## Express Wiring Example

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

## Notes

- use Redis in production when you need shared session state across multiple app instances
- the provider stores JSON payloads under prefixed keys for sessions, auth transactions, and one-time exchange codes
- one-time records are consumed atomically through Redis commands instead of `get` plus `del`
- session rotation and session indexes are updated atomically so concurrent refreshes do not fork multiple active sessions
- the client must support `sendCommand(...)`; the official `redis` package already does

## Main Exports

- `createRedisOidcVaultStore(...)`
- `type RedisOidcVaultStoreOptions`
- `type OidcVaultRedisClient`
