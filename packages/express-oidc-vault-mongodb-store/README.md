# `@web-ts-toolkit/express-oidc-vault-mongodb-store`

MongoDB-backed store provider for `@web-ts-toolkit/express-oidc-vault`.

## Installation

```sh
pnpm add @web-ts-toolkit/express-oidc-vault @web-ts-toolkit/express-oidc-vault-mongodb-store express mongodb
```

## Quick Start

```ts
import { MongoClient } from 'mongodb';
import { createMongoOidcVaultStore } from '@web-ts-toolkit/express-oidc-vault-mongodb-store';

const client = new MongoClient(process.env.MONGODB_URI!);
await client.connect();

const storeProvider = createMongoOidcVaultStore({
  db: client.db('app-auth'),
});
```

## Express Wiring Example

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

## Notes

- use MongoDB when your team already standardizes on Mongo and you want the auth vault data in the same operational platform
- the provider uses separate collections for authorization transactions, exchange codes, and sessions
- TTL indexes are created on `expiresAt`, and the provider also checks expiration on reads so behavior does not depend on Mongo's background TTL monitor timing

## Main Exports

- `createMongoOidcVaultStore(...)`
- `type MongoOidcVaultStoreOptions`
