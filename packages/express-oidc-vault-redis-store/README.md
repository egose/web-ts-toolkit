# `@web-ts-toolkit/express-oidc-vault-redis-store`

Redis-backed store provider for `@web-ts-toolkit/express-oidc-vault`.

## Installation

The `redis` package is referenced by the quick start below, but this package
treats it as a development-only dependency: the package does not import `redis`
at runtime and accepts any client that implements the `OidcVaultRedisClient`
contract. Install `redis` (or your adapter of choice) in your app.

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
- supported Redis topologies are standalone Redis through the official `redis` client, and Redis Sentinel through the underlying master client retrieved from a `createSentinel(...)` client (see _Redis Version And Topology_); Redis Cluster is not supported
- Redis Cluster clients are rejected when the store is created because the package does not currently route multi-key vault scripts through a hash-slot adapter
- the provider stores JSON payloads under prefixed keys for sessions, auth transactions, and one-time exchange codes
- one-time records are consumed atomically through Redis commands instead of `get` plus `del`
- session rotation and session indexes are updated atomically so concurrent refreshes do not fork multiple active sessions
- rotation requires a distinct unused target session ID; missing-source, same-ID, and existing-target rotation conflicts throw `OidcVaultStoreConflictError` without changing source or target records
- obsolete rotated session IDs are stored as aliases owned by the logical session; revoking the active logical session, or deleting through any obsolete ID, removes all aliases and the reverse alias index
- creating or rotating into a previously obsolete session ID removes that stale alias ownership first, so a reused ID cannot invoke an old logical-session meaning
- `createAuthorizationTransaction` and `createExchangeCode` are upserts; `createSession` is create-only and duplicate session IDs throw `OidcVaultStoreConflictError` without changing the existing record or indexes
- session metadata should be JSON-compatible for portability across store providers
- backchannel logout token JTI records are consumed only when `expiresAt` is finite and greater than the store clock at consume time
- the optional `now` hook controls store-domain timestamps and testable JTI validation only; Redis server time is the authority for Redis key expiry and revocation-index cleanup
- the client must implement `sendCommand(args)`; official standalone `redis` clients already do, and a Sentinel-wrapped master client or any adapter implementing `OidcVaultRedisClient` does too

## Redis Version And Topology

- **Minimum Redis version: 6.2.** One-time authorization transactions and exchange codes are consumed with `GETDEL`, which is unavailable before Redis 6.2. Versions 6.2 and 7.2 are exercised in integration tests.
- **Standalone Redis**: supported through the official `redis` `createClient(...)` client (`RedisClientType`). This is the tested topological default.
- **Redis Sentinel**: supported by passing the underlying master client retrieved from a `redis.createSentinel(...)` sentinel — for example, the client returned by `await sentinel.acquire()`, or via `await sentinel.use(c => c)` patterns documented in the `redis` package. The bare `createSentinel(...)` root client does NOT satisfy this package's structural contract directly: its `sendCommand(isReadonly, args, options?)` requires an `isReadonly` first argument, while this store calls `sendCommand(args)`. Wrap the underlying master with an adapter conforming to `OidcVaultRedisClient` if you want to retain the Sentinel's connection management. Sentinel failover switches the underlying node, so vault state survives a failover subject to your Sentinel AOF/RDB durability settings.
- **Redis Cluster**: **not supported.** Cluster-shaped official clients are rejected when the store is created. The package's atomic vault scripts touch several keys without a hash-slot routing adapter, so Cluster routing could send parts of one logical operation to different nodes. Add a Cluster routing/hash-slot adapter before enabling it.

## Client Lifecycle And Ownership

- **Connect the client yourself.** The store never calls `client.connect()`, `client.quit()`, or `client.disconnect()`. Pass an already-connected client and reuse it across requests.
- **Own `error` listeners, reconnects, and shutdown.** The store reads and writes commands but does not attach `error` listeners, suppress client errors, or close the client. Always register a client `error` listener on production connections; an unhandled client error can crash the process.
- **Graceful shutdown.** Draining `createSession`/`rotateSession`/`deleteSessionsBy*` in-flight calls, then `client.quit()`, is the supported shutdown order. The store holds no background timers, so no store-side teardown is required beyond verifying in-flight operations have settled.
- **Concurrency.** `OidcVaultStoreProvider` methods are safe to call concurrently from one or more processes. Atomic operations are protected by Redis server-side scripts; concurrent duplicate ID creation, concurrent indexed revocation of overlapping indexes, concurrent rotation into the same target ID, and concurrent same-ID rotation conflicting with indexed revocation are all bounded.

## Key Namespace And Migration

- All vault keys are written as `<keyPrefix>:<kind>:<id>` and default to the `oidc-vault` prefix. Use `keyPrefix` when the same Redis instance stores data for multiple apps, environments, or tenants.
- **Changing the prefix is not a migration.** Switching `keyPrefix` starts an independent empty namespace: existing sessions, indexes, aliases, exchange codes, and authorization transactions remain under the previous prefix and are neither revoked nor cleaned up by the new store. Rotate the prefix only when you are prepared to lose access to, or coordinate decommissioning of, the previous namespace.
- New sessions created under the new prefix will not collide with the old namespace, even when ranges of session IDs overlap — keys are fully namespaced and the cleanup scan only walks the configured prefix.

## Stored Data Characteristics

- This package stores refresh tokens, ID tokens, access tokens (when present), and session metadata as **plaintext JSON** in Redis values. It does not encrypt the values, redact them on read, or strip token fields before returning them.
- Audit-trail and long-term persistence safety depends entirely on your Redis deployment: AOF/RDB snapshots, replicas, backups, and slow-query logs may all retain these plaintext values. Treat the Redis instance, its backups, and any persistence or replication as trusted infrastructure with the same access control you apply to your application database.
- ACLs, TLS, network isolation, and Redis instance boundaries are the responsibility of the operator. Run the Redis instance on a private network, enable TLS for any cross-network hop, and apply the principle of least privilege with ACL rules that limit clients to the keyspace consumed by `keyPrefix`.
- The package holds no cross-version schema migration guarantee. Treat the package version as the schema owner unless a future release documents a migration path.

## Expiry And Index Cleanup

- expiring session records are stored with Redis `PXAT`, and revocation index scores use the same absolute expiration timestamp
- stale revocation memberships are pruned with Redis `TIME`, not the application clock, so a skewed application clock cannot remove a still-live Redis session from subject, provider-session, or logical-session indexes
- indexed revocation also checks the primary session key before deleting or returning a session; expired primary values are not returned and missing primary values remove the stale membership encountered during traversal
- indexed revocation traverses Redis sorted sets with bounded cursor batches and batched record reads; it revokes sessions present in the cursor scan's view, while sessions added to the same index after the scan starts may be revoked by a later indexed revocation call
- each successful session create or rotation scans up to 100 prefixed keys and removes Redis-expired members from subject, provider-session, and logical-session indexes; Redis deletes empty sorted sets, so unique expired logical-session index keys are eventually removed even without a logout for that logical session
- rotated session aliases use the same expiry score as their successor session; non-expiring alias churn is bounded by cleanup on logical-session termination, and malformed stale aliases are deleted when their session ID is reused
- stale index storage is therefore bounded by active session index entries plus expired entries waiting for Redis expiry and the incremental cleanup scan window; non-expiring sessions use a non-expiring index score and remain until revoked

## Stored Data Validation And Corruption Handling

- stored records are JSON payloads validated structurally on read; see _Stored Data Characteristics_ for the schema-migration and plaintext-storage posture
- malformed one-time authorization transaction and exchange-code records are consumed atomically and return `null`, preventing reuse while failing closed
- malformed session records are treated as unreadable, deleted when encountered through session reads or indexed revocation, and never returned as authenticated state
- indexed revocation removes stale corrupt members and continues processing later valid sessions
- Redis mutation scripts preflight expected key types before writing so wrong-type keys fail without deterministic partial mutation
- validation errors and script errors are sanitized and do not include stored refresh tokens, ID tokens, authorization transactions, or exchange codes

## Main Exports

- `createRedisOidcVaultStore(...)`
- `OidcVaultRedisStoreRecordError`
- `type RedisOidcVaultStoreOptions`
- `type OidcVaultRedisClient`
