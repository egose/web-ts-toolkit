---
sidebar_label: OIDC Vault Redis Store
sidebar_position: 8
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
redis.on('error', () => console.warn('OIDC vault Redis connection error.'));

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

For a store-only snippet without Express wiring, see the `Quick Start` section in the package README.

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
- uses cached guarded Lua for atomic one-time consumption, including legacy consumes that refuse guarded records
- updates subject and provider-session indexes so logout and backchannel logout can delete matching sessions efficiently
- uses Redis-side scripts for session writes, deletes, and rotation so concurrent refreshes do not fork multiple active sessions

## Supported Redis Topologies

- supported: standalone Redis with the official `redis` `createClient(...)` client (`RedisClientType`)
- supported: Redis Sentinel, by passing the underlying master client retrieved from a `redis.createSentinel(...)` sentinel (e.g. via `await sentinel.acquire()` or `await sentinel.use(c => c)`)
- unsupported: Redis Cluster with the official `redis` `createCluster(...)` client

The bare `createSentinel(...)` root client does NOT satisfy this package's structural contract directly: its `sendCommand(isReadonly, args, options?)` requires an `isReadonly` first argument, while this store calls `sendCommand(args)`. Pass the underlying master client returned by `sentinel.acquire()` / `sentinel.use(c => c)`, or wrap the Sentinel root with an adapter conforming to `OidcVaultRedisClient`.

Redis Cluster clients are rejected when the store is created. The store uses atomic scripts that touch multiple vault keys, and this package does not currently provide a Cluster routing/hash-slot adapter that colocates every key used by one script.

**Minimum Redis version: 6.2.** Standalone 6.2/7.2 are exercised. Cached Lua now handles guarded/legacy consumption; Sentinel adapter/failover durability remains deployment-owned and is not certified by those tests. Loss of unexpired replay state on failover weakens protection until the proof window expires.

## Client Lifecycle And Ownership

- **Connect the client yourself.** The store never calls `client.connect()`, `client.quit()`, or `client.disconnect()`. Pass an already-connected client and reuse it across requests.
- **Own `error` listeners, reconnects, and shutdown.** The store reads and writes commands but does not attach `error` listeners, suppress client errors, or close the client. Always register a client `error` listener on production connections; an unhandled client error can crash the process.
- **Graceful shutdown.** Drain `createSession`/`rotateSession`/`deleteSessionsBy*` in-flight calls, then `client.quit()`. The store holds no background timers, so no store-side teardown is required beyond verifying in-flight operations have settled.
- **Concurrency.** Scripts protect individual mutations. Indexed deletion traverses once and sums primary deletions, including matching rotation successors, excluding expired/missing records and alias/index repair. Later arrivals can survive; errors can follow earlier commits. This is not a global logout snapshot or a fixed total-work bound.

## Portable Lifetime And Maintenance Contract

Each alias keeps its immediate successor's `expiresAt`; later rotations never extend it. Without expiry, Redis/memory impose no alias time limit (MongoDB defaults to five minutes), so non-expiring alias growth has no fixed size bound. With `A/L1 -> B/L1 -> C/L2`, B revokes L2; retained A keeps L1 and its original deadline. Redis can retain old-lineage aliases after that transition until expiry or explicit cleanup. `getSession` never resolves aliases. Use fresh session IDs and distinct logical IDs for unrelated login families.

Subject/provider-session object deletes filter each supplied issuer/client; strings, logical IDs and aliases are unscoped. Scoped/direct deletion preserves unexpired aliases while another live member survives. Redis create is create-only (memory/MongoDB upsert); alias-only target reuse clears former ownership. JSON-compatible plain inputs are captured at invocation and detached on return. Opaque native values retain JSON/`toJSON` semantics without portable mutation isolation.

Preserve store-written TTLs/index scores on restore. Legacy consumes/getSession retain key-TTL authority; new transaction/code preflight getters check payload expiry with GET + TIME and guarded consumes check inside Lua. They do not repair external TTL/index inconsistency. Post-write SCAN COUNT 100 and revocation ZSCAN COUNT 250 are hints, not caps; whole responses/lineages/aliases can be materialized. Those costs are separate from hard-bounded replay admission.

Post-commit maintenance failure preserves successful create/rotation and emits only fixed operation text, with no adapter error details. Arbitrary client errors can still reject other operations; do not log raw errors, connection URLs, whole records or credential-valued labels. The [shipped README](https://github.com/egose/web-ts-toolkit/blob/main/packages/express-oidc-vault-redis-store/README.md) contains the full lifecycle/compatibility guidance.

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

Creates a stronger core OidcVaultDeviceBindingStoreProvider. Use named package-root imports; Node >=22.12.0 and @types/node/@types/express for TypeScript. Both ESM (`import`, `index.d.mts`) and CJS (`require`, `index.d.ts`) declaration conditions are shipped.

`RedisOidcVaultStoreOptions`

- `client`: connected Redis client or compatible adapter
- `keyPrefix?`: optional key namespace, defaults to `oidc-vault`
- `now?`: override clock source for tests or deterministic simulations
- `dpopReplayMaxEntries?`: positive safe integer, default 100000, identical on clients sharing keyPrefix

`OidcVaultRedisClient`

Minimal client shape: set/get/del and required sendCommand(args). Cached Lua (EVALSHA, SCRIPT LOAD/retry), TYPE/TIME/ZRANGE/ZSCAN/MGET transit that command interface. Official standalone and adapter-compliant acquired Sentinel master clients satisfy it; the bare Sentinel root does not. Cluster is excluded.

## Guarded records and bounded DPoP replay

The six stronger methods are live getAuthorizationTransaction/getExchangeCode, atomic consumeAuthorizationTransactionIfMatches/consumeExchangeCodeIfMatches, getSessionRevocationContext and reserveDpopProof. Import shared types and OidcVaultDpopReplayCapacityError from the core root. Either vault opt-in requires all six; fingerprint-only reserves no proofs. Getters are detached preflight, not locks. Match contains both key/hash; null requires absence, never wildcard/JSON null. Legacy neither field, cookie-only hash, bound hash+canonical jkt are valid; malformed/null/extra/key-without-hash rejects. Exchange also atomically matches expectedSessionId; mismatches preserve live records and matching clients have one winner. Old consumes refuse guarded records. Rotation inherits original binding and CAS-checks source identity/credential/key generation; changing/removing/enrolling binding rejects.

Revocation context resolves current live lineage authority through a live handle/unexpired alias within one Lua snapshot (whole-lineage work); returns only logical ID/provider issuer-client/key, no credentials/profile/metadata. Missing alias binding never downgrades the lineage. Malformed/mixed authority throws; empty/expired lineages return null and aliases never authenticate refresh.

Replay lives in **&lt;keyPrefix&gt;:dpop-proofs**, one sorted set for proof/expiry/capacity. Normally one cached EVALSHA/proof, server TIME, hard LIMIT 64 expired cleanup plus requested expired key, duplicate-first admission, no session scans/live eviction. NOSCRIPT load/retry adds two calls. Future safe-integer expiry with remaining TTL ≤360000ms is required; invalid/expired returns false without allocation. Duplicate false never renews; at capacity throw core capacity error → sanitized 503 replay-unavailable. Set expiry tracks latest score; expired members awaiting bounded cleanup can conservatively occupy capacity. ACLs must permit scripts and TIME/TYPE/GET/DEL/ZSCORE/ZRANGEBYSCORE/ZREM/ZCARD/ZADD/ZREVRANGE/PEXPIREAT. Share namespaces/windows/limits and synchronized clocks, never release after downstream failure, size for per-request proof writes × retained window (defaults max 70s). Atomic bounds are not throughput/durability guarantees.

## Operational Notes

- the package expects a connected client before use
- official standalone clients and standalone-shaped acquired/wrapped Sentinel master clients satisfy the required shape
- one-time authorization transactions and exchange codes are consumed atomically
- subject and provider-session indexes make bulk session deletion practical for logout flows

## Related Packages

- [`@web-ts-toolkit/express-oidc-vault`](./express-oidc-vault)
- [`@web-ts-toolkit/express-oidc-vault-memory-store`](./express-oidc-vault-memory-store)
- [`@web-ts-toolkit/express-oidc-vault-mongodb-store`](./express-oidc-vault-mongodb-store)
