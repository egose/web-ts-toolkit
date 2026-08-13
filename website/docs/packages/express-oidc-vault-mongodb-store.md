---
sidebar_label: OIDC Vault MongoDB Store
sidebar_position: 6
---

# `@web-ts-toolkit/express-oidc-vault-mongodb-store`

MongoDB-backed store provider for `@web-ts-toolkit/express-oidc-vault`.

## Installation

```bash npm2yarn
npm install @web-ts-toolkit/express-oidc-vault @web-ts-toolkit/express-oidc-vault-mongodb-store express mongodb
```

## Quick Start

```ts
import express from 'express';
import { MongoClient } from 'mongodb';
import { createOidcVaultMiddleware } from '@web-ts-toolkit/express-oidc-vault';
import { createMongoOidcVaultStore } from '@web-ts-toolkit/express-oidc-vault-mongodb-store';

const app = express();
const mongo = new MongoClient(process.env.MONGODB_URI!);

await mongo.connect();

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
    storeProvider: createMongoOidcVaultStore({
      db: mongo.db('app-auth'),
    }),
  }),
);
```

### Custom collection names

If your deployment needs explicit collection naming, pass the collection names up front:

```ts
const storeProvider = createMongoOidcVaultStore({
  db: mongo.db('app-auth'),
  authorizationTransactionsCollectionName: 'auth_oidc_transactions',
  exchangeCodesCollectionName: 'auth_oidc_exchange_codes',
  sessionsCollectionName: 'auth_oidc_sessions',
});
```

## Behavior

- uses separate collections for authorization transactions, exchange codes, and sessions
- creates TTL indexes on `expiresAt`
- also checks expiry on reads so behavior does not depend on MongoDB's background TTL monitor timing
- stores session records by `sessionId` and replaces them during rotation
- creates indexes for `subject` and `providerSessionId` so logout and backchannel logout queries can efficiently remove matching sessions
- uses MongoDB transactions for session rotation when the deployment supports them, and falls back to conflict-safe non-transaction behavior on standalone servers

## When To Use It

Use MongoDB when:

- your team already standardizes on MongoDB
- you want OIDC vault data in the same operational platform as the rest of the app
- Redis is not available or not preferred in your environment

This is a strong fit when your application already depends on MongoDB operationally and you prefer to keep auth-vault data alongside the rest of your infrastructure.

## API

`createMongoOidcVaultStore(options)`

Creates a MongoDB-backed implementation of the core `OidcVaultStoreProvider` contract.

`MongoOidcVaultStoreOptions`

- `db`: MongoDB database handle
- `authorizationTransactionsCollectionName?`
- `exchangeCodesCollectionName?`
- `sessionsCollectionName?`
- `now?`: override clock source for tests

## Operational Notes

- TTL index cleanup in MongoDB is asynchronous, so the package also validates expiration during reads
- session rotation tries to use transactions when the MongoDB deployment reports transaction support
- on standalone MongoDB servers without transactions, rotation still avoids leaving the replacement session active when the original session has already disappeared

## Related Packages

- [`@web-ts-toolkit/express-oidc-vault`](./express-oidc-vault)
- [`@web-ts-toolkit/express-oidc-vault-memory-store`](./express-oidc-vault-memory-store)
- [`@web-ts-toolkit/express-oidc-vault-redis-store`](./express-oidc-vault-redis-store)
