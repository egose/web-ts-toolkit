---
sidebar_label: OIDC Vault Redis Store
sidebar_position: 5
---

# `@web-ts-toolkit/express-oidc-vault-redis-store`

Redis-backed store provider for `@web-ts-toolkit/express-oidc-vault`.

## Installation

The `redis` package is referenced by the quick start below, but this package
treats it as a development-only dependency: the package does not import `redis`
at runtime and accepts any client that implements the `OidcVaultRedisClient`
contract. Install `redis` (or your adapter of choice) in your app.

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
- uses `GETDEL` for atomic one-time record consumption through `sendCommand(...)`
- updates subject and provider-session indexes so logout and backchannel logout can delete matching sessions efficiently
- uses Redis-side scripts for session writes, deletes, and rotation so concurrent refreshes do not fork multiple active sessions

## Supported Redis Topologies

- supported: standalone Redis with the official `redis` `createClient(...)` client (`RedisClientType`)
- supported: Redis Sentinel, by passing the underlying master client retrieved from a `redis.createSentinel(...)` sentinel (e.g. via `await sentinel.acquire()` or `await sentinel.use(c => c)`)
- unsupported: Redis Cluster with the official `redis` `createCluster(...)` client

The bare `createSentinel(...)` root client does NOT satisfy this package's structural contract directly: its `sendCommand(isReadonly, args, options?)` requires an `isReadonly` first argument, while this store calls `sendCommand(args)`. Pass the underlying master client returned by `sentinel.acquire()` / `sentinel.use(c => c)`, or wrap the Sentinel root with an adapter conforming to `OidcVaultRedisClient`.

Redis Cluster clients are rejected when the store is created. The store uses atomic scripts that touch multiple vault keys, and this package does not currently provide a Cluster routing/hash-slot adapter that colocates every key used by one script.

**Minimum Redis version: 6.2.** One-time authorization transactions and exchange codes are consumed with `GETDEL`, which is unavailable before Redis 6.2. Versions 6.2 and 7.2 are exercised in integration tests.

## Client Lifecycle And Ownership

- **Connect the client yourself.** The store never calls `client.connect()`, `client.quit()`, or `client.disconnect()`. Pass an already-connected client and reuse it across requests.
- **Own `error` listeners, reconnects, and shutdown.** The store reads and writes commands but does not attach `error` listeners, suppress client errors, or close the client. Always register a client `error` listener on production connections; an unhandled client error can crash the process.
- **Graceful shutdown.** Drain `createSession`/`rotateSession`/`deleteSessionsBy*` in-flight calls, then `client.quit()`. The store holds no background timers, so no store-side teardown is required beyond verifying in-flight operations have settled.
- **Concurrency.** Store methods are safe to call concurrently from one or more processes. Atomic operations are protected by Redis server-side scripts; concurrent duplicate ID creation, concurrent indexed revocation of overlapping indexes, concurrent rotation into the same target ID, and concurrent same-ID rotation conflicting with indexed revocation are all bounded.

## Key Namespace And Migration

- All vault keys are written as `<keyPrefix>:<kind>:<id>` and default to the `oidc-vault` prefix. Use `keyPrefix` when the same Redis instance stores data for multiple apps, environments, or tenants.
- **Changing the prefix is not a migration.** Switching `keyPrefix` starts an independent empty namespace: existing sessions, indexes, aliases, exchange codes, and authorization transactions remain under the previous prefix and are neither revoked nor cleaned up by the new store. Rotate the prefix only when you are prepared to lose access to, or coordinate decommissioning of, the previous namespace.

## Stored Data Characteristics

- This package stores refresh tokens, ID tokens, access tokens (when present), and session metadata as **plaintext JSON** in Redis values. It does not encrypt the values, redact them on read, or strip token fields before returning them.
- Audit-trail and long-term persistence safety depends entirely on your Redis deployment: AOF/RDB snapshots, replicas, backups, and slow-query logs may all retain these plaintext values. Treat the Redis instance, its backups, and any persistence or replication as trusted infrastructure with the same access control you apply to your application database.
- ACLs, TLS, network isolation, and Redis instance boundaries are the responsibility of the operator. Run the Redis instance on a private network, enable TLS for any cross-network hop, and apply ACL rules that limit clients to the `keyPrefix` keyspace.
- The package holds no cross-version schema migration guarantee. Treat the package version as the schema owner unless a future release documents a migration path.

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

Minimal client shape used by the package: `set`, `get`, `del`, and the required `sendCommand(args)`. `sendCommand` carries `EVAL`, `GETDEL`, `TYPE`, `TIME`, `ZRANGE`, `ZSCAN`, and `MGET` for atomic vault operations; official standalone `redis` clients (`RedisClientType`) satisfy it directly, and Sentinel-wrapped master clients or adapter-compliant clients do too. Cluster-shaped clients are intentionally excluded.

## Operational Notes

- the package expects a connected client before use
- official standalone and Sentinel clients from `redis` satisfy the required API shape
- one-time authorization transactions and exchange codes are consumed atomically
- subject and provider-session indexes make bulk session deletion practical for logout flows

## Related Packages

- [`@web-ts-toolkit/express-oidc-vault`](./express-oidc-vault)
- [`@web-ts-toolkit/express-oidc-vault-memory-store`](./express-oidc-vault-memory-store)
- [`@web-ts-toolkit/express-oidc-vault-mongodb-store`](./express-oidc-vault-mongodb-store)
