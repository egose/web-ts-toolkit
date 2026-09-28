---
sidebar_label: OIDC Vault MongoDB Store
sidebar_position: 9
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

const storeProvider = createMongoOidcVaultStore({
  db: mongo.db('app-auth'),
});

await storeProvider.ready();

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
    storeProvider,
  }),
);

const server = app.listen(3000);

process.once('SIGTERM', async () => {
  server.close();
  await mongo.close();
});
```

For a store-only snippet without Express wiring, see the `Quick Start` section in the package README.

### Custom collection names

If your deployment needs explicit collection naming, pass the collection names up front:

```ts
const storeProvider = createMongoOidcVaultStore({
  db: mongo.db('app-auth'),
  authorizationTransactionsCollectionName: 'auth_oidc_transactions',
  exchangeCodesCollectionName: 'auth_oidc_exchange_codes',
  sessionsCollectionName: 'auth_oidc_sessions',
  backchannelLogoutTokenJtisCollectionName: 'auth_oidc_backchannel_logout_jtis',
  rotatedSessionAliasesCollectionName: 'auth_oidc_rotated_session_aliases',
});
```

## Behavior

- uses separate collections for authorization transactions, exchange codes, sessions, backchannel logout token JTIs, and rotated-session aliases
- creates TTL indexes on expiring records
- checks expiration during relevant reads or consumes for authorization transactions, exchange codes, backchannel logout token JTIs, and rotated-session aliases so behavior does not depend only on MongoDB's background TTL monitor timing
- stores session records by `sessionId` and replaces them during rotation
- creates scoped compound indexes for `subject`, `providerSessionId`, session `logicalSessionId`, and rotated-alias `logicalSessionId` so logout and backchannel logout queries can efficiently remove matching sessions and aliases
- requires MongoDB transactions for session rotation and inactive-lineage alias cleanup; use a replica set or sharded deployment because standalone servers fail readiness
- readiness creates required indexes, validates collection names, and verifies transaction-capable topology before traffic is accepted
- stores rotated-session aliases with finite expiry; sessions without explicit expiry use a 5 minute alias-retention window by default, configurable with `rotatedSessionAliasRetentionMs`
- scoped/direct deletion preserves unexpired aliases while another live member survives, including another issuer/client scope; inactive-lineage cleanup follows committed deletion in a snapshot transaction, with rotation alias writes protected by conflicts/retries

Each alias keeps its immediate successor's deadline; later rotations do not extend it. With `A/L1 -> B/L1 -> C/L2`, B revokes L2 and retained A still targets L1. MongoDB can retain inactive old-lineage aliases after rotation/upsert until expiry or explicit cleanup; it also retains an alias under a reused create ID. Use fresh session IDs and distinct logical IDs for unrelated login families. Memory/Redis have no alias time limit without successor expiry; MongoDB uses the finite fallback above.

Portable JSON-compatible plain inputs are captured at invocation, and returned data is detached. Native BSON/opaque objects retain backend serialization semantics without a portable mutation-isolation guarantee. Subject/provider-session objects filter each supplied issuer/client; strings and logical IDs are unscoped. Bulk counts exclude aliases but can include expired rows awaiting TTL cleanup. Scoped deletion repeats until an empty query; continuous arrivals can prolong it and later arrivals can survive. Cleanup can reject after deletion committed. Queries materialize affected IDs/survivors and can form large `$in` sets; there is no global logout snapshot or fixed total-work bound.

The [shipped README](https://github.com/egose/web-ts-toolkit/blob/main/packages/express-oidc-vault-mongodb-store/README.md) contains the complete portable/lifecycle contract and compatibility notes.

## When To Use It

Use MongoDB when:

- your team already standardizes on MongoDB
- you want OIDC vault data in the same operational platform as the rest of the app
- Redis is not available or not preferred in your environment

This is a strong fit when your application already depends on MongoDB operationally and you prefer to keep auth-vault data alongside the rest of your infrastructure.

## API

`createMongoOidcVaultStore(options)`

Creates a MongoDB-backed implementation of the core `OidcVaultStoreProvider` contract with an additional `ready()` startup check.

`OidcVaultMongoStoreProvider`

- extends `OidcVaultStoreProvider`
- `ready()`: waits for collection-name validation, required index creation, and transaction-topology verification

`MongoOidcVaultStoreOptions`

- `db`: MongoDB database handle
- `authorizationTransactionsCollectionName?`
- `exchangeCodesCollectionName?`
- `sessionsCollectionName?`
- `backchannelLogoutTokenJtisCollectionName?`
- `rotatedSessionAliasesCollectionName?`
- `rotatedSessionAliasRetentionMs?`: finite positive alias retention for sessions without explicit expiry, defaulting to 5 minutes
- `now?`: override clock source for tests

## Operational Notes

- startup order should be: connect the MongoDB client, create the store, await `storeProvider.ready()`, then call `app.listen()` or otherwise accept traffic
- drain requests and other in-flight store operations before application-owned MongoDB client shutdown; this package never closes the client and ends its explicit transaction sessions on success/failure
- TTL index cleanup in MongoDB is asynchronous, so the package also validates expiration during reads
- rotated-session aliases are retained to bridge in-flight refresh/logout races after a session ID rotates; if a request uses a stale rotated ID after the alias expires, that stale ID no longer revokes the active logical session
- readiness verifies the deployment reports transaction support before any store operation can run
- standalone MongoDB servers without transactions cannot rotate sessions with this provider; migrate to a replica set or sharded deployment before enabling refresh flows

## Security Notes

Session records contain refresh tokens, ID tokens, access tokens, and related bearer-equivalent secrets. Require TLS, least-privilege MongoDB roles, encryption at rest and in backups, restricted logging/metrics/tracing/export paths, and explicit retention policies for all five store collections.

Arbitrary backend errors are not sanitized for application logs. Use fixed operation names and allowlisted categories instead of raw errors, connection URLs, whole records or credential-valued metric labels.

This package does not implement application-level field encryption or client-side field-level encryption. Configure those at the MongoDB/client layer if your deployment requires them.

## Scoped Deletion Indexes

The sessions collection creates these deletion indexes:

- `subject_scope_idx`: `{ subject: 1, 'provider.issuer': 1, 'provider.clientId': 1 }`
- `provider_session_scope_idx`: `{ providerSessionId: 1, 'provider.issuer': 1, 'provider.clientId': 1 }`
- `logical_session_idx`: `{ logicalSessionId: 1 }`

Representative `explain('executionStats')` evidence used a dataset with 2 repeated identities, 10 issuers, 10 clients, and 10 duplicate sessions per issuer/client scope. With only single-field identity indexes, scoped delete lookups examined all 1,000 matching identity documents. With the compound indexes above, `subject/providerSessionId + issuer`, `subject/providerSessionId + clientId`, and `subject/providerSessionId + issuer + clientId` examined 100, 100, and 10 documents respectively, matching the scoped result set size in that dataset.

The package creates one compound index per public scoped identity delete path rather than one index per optional-filter permutation. The leading identity key still supports identity-only deletes, while issuer/client scoped deletes avoid broad scans in multi-tenant collections. Very large deployments should still expect deletion cost to scale with the number of sessions being revoked inside the selected issuer/client scope.

## Related Packages

- [`@web-ts-toolkit/express-oidc-vault`](./express-oidc-vault)
- [`@web-ts-toolkit/express-oidc-vault-memory-store`](./express-oidc-vault-memory-store)
- [`@web-ts-toolkit/express-oidc-vault-redis-store`](./express-oidc-vault-redis-store)
