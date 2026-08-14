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

await storeProvider.ready();

// Later, during application shutdown:
await client.close();
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

## Collection Names

The provider uses five separate MongoDB collections by default:

- `oidc_vault_authorization_transactions`: authorization transaction state, nonce, PKCE verifier, and metadata
- `oidc_vault_exchange_codes`: short-lived frontend exchange codes
- `oidc_vault_sessions`: sessions, user data, and bearer-equivalent token material
- `oidc_vault_backchannel_logout_token_jtis`: consumed backchannel logout token JTIs
- `oidc_vault_rotated_session_aliases`: stale rotated session IDs mapped to active logical sessions

Override collection names when your deployment needs explicit naming:

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

## Notes

- use MongoDB when your team already standardizes on Mongo and you want the auth vault data in the same operational platform
- the provider uses separate collections for authorization transactions, exchange codes, sessions, backchannel logout token JTIs, and rotated-session aliases
- TTL indexes are created on expiring records; authorization transactions, exchange codes, backchannel logout token JTIs, and rotated-session aliases are also checked for expiration during relevant reads or consumes so behavior does not depend only on Mongo's background TTL monitor timing
- session rotation requires MongoDB transactions; use a replica set or sharded deployment because standalone servers fail closed instead of using non-atomic multi-write rotation
- startup readiness creates required indexes and verifies transaction-capable topology; connect the MongoDB client, create the store, await `storeProvider.ready()`, then accept traffic
- session deletion by subject or provider session ID uses compound scoped indexes on the identity field plus `provider.issuer` and `provider.clientId`; these replace single-field identity indexes because the leading key still supports identity-only deletes while scoped logout deletes avoid scanning every repeated identity across tenants
- the application owns MongoDB client shutdown; this package does not close the client
- rotation requires a distinct unused target session ID; missing-source, same-ID, and existing-target rotation conflicts throw `OidcVaultStoreConflictError` without changing source or target records
- rotated-session aliases are retained only long enough to bridge in-flight refresh/logout requests; sessions without explicit expiry use a finite 5 minute alias retention window by default, configurable with `rotatedSessionAliasRetentionMs`
- deleting by current session ID, stale rotated ID, logical session ID, subject, or provider session ID removes aliases for the affected logical sessions
- `createAuthorizationTransaction`, `createExchangeCode`, and `createSession` are upserts; metadata should be JSON-compatible for portability across store providers
- backchannel logout token JTI records are consumed only when `expiresAt` is finite and greater than the store clock at consume time

## Security And Operations

Session records contain refresh tokens, ID tokens, access tokens, and related bearer-equivalent secrets. Treat the MongoDB database and every backup, log, trace, metric label, and export path that can expose these records as sensitive auth infrastructure.

Recommended controls:

- require TLS for MongoDB connections and for any network path carrying session data
- grant the application least-privilege roles scoped to the configured database and collections
- enable encryption at rest for the database and backups
- restrict observability tooling so token fields and whole session documents are not logged, indexed, sampled, or exported
- define an explicit data-retention policy for sessions, aliases, authorization transactions, exchange codes, and consumed logout JTIs
- close the caller-owned `MongoClient` from application shutdown code; this package never closes it

This package does not implement application-level field encryption or client-side field-level encryption. Add those controls at your MongoDB/client configuration layer if your deployment requires them.

## Scoped Deletion Indexes

The sessions collection creates these deletion indexes:

- `subject_scope_idx`: `{ subject: 1, 'provider.issuer': 1, 'provider.clientId': 1 }`
- `provider_session_scope_idx`: `{ providerSessionId: 1, 'provider.issuer': 1, 'provider.clientId': 1 }`
- `logical_session_idx`: `{ logicalSessionId: 1 }`

Representative query-plan evidence used a dataset with 2 repeated identities, 10 issuers, 10 clients, and 10 duplicate sessions per issuer/client scope. With only single-field `subject` or `providerSessionId` indexes, scoped delete lookups examined all 1,000 matching identity documents. With the compound indexes above, `subject/providerSessionId + issuer`, `subject/providerSessionId + clientId`, and `subject/providerSessionId + issuer + clientId` examined 100, 100, and 10 documents respectively, matching the scoped result set size in that dataset.

The package intentionally creates one compound index per public scoped identity delete path rather than one index per optional-filter permutation. The leading identity key still supports identity-only deletes with the same result-set-sized scan as the previous single-field indexes, while issuer/client scoped deletes avoid broad scans in multi-tenant collections. The residual assumption is that very large deployments should keep subject/provider-session identifiers reasonably distributed within each issuer/client scope; otherwise the scoped result set itself is large and deletion cost is expected to scale with the number of sessions being revoked.

## Main Exports

- `createMongoOidcVaultStore(...)`
- `type OidcVaultMongoStoreProvider`
- `type MongoOidcVaultStoreOptions`
- `DEFAULT_ROTATED_SESSION_ALIAS_RETENTION_MS`
