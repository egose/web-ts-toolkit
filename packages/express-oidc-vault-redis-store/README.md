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
redis.on('error', () => console.warn('OIDC vault Redis connection error.'));
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

## Notes

- use Redis in production when you need shared session state across multiple app instances
- supported Redis topologies are standalone Redis through the official `redis` client, and Redis Sentinel through the underlying master client retrieved from a `createSentinel(...)` client (see _Redis Version And Topology_); Redis Cluster is not supported
- Redis Cluster clients are rejected when the store is created because the package does not currently route multi-key vault scripts through a hash-slot adapter
- the provider stores JSON payloads under prefixed keys for sessions, auth transactions, and one-time exchange codes
- one-time records are consumed atomically through Redis commands instead of `get` plus `del`
- session rotation and session indexes are updated atomically so concurrent refreshes do not fork multiple active sessions
- rotation requires a distinct unused target session ID; missing-source, same-ID, and existing-target rotation conflicts throw `OidcVaultStoreConflictError` without changing source or target records
- obsolete rotated session IDs are stored as aliases owned by the logical session; scoped/direct deletion preserves unexpired aliases while another live member survives, including another issuer/client scope. Deleting through an obsolete ID still revokes its logical lineage
- alias cleanup runs inside the delete script alongside the primary mutation. It checks keyed primary membership with Redis TTL authority before removing terminated-lineage aliases; empty logical logout uses the same liveness rule in an atomic cleanup script. Rotation cannot interleave between that check and alias removal. The overall indexed traversal is not a global logout snapshot, so later arrivals can survive
- **Alias-cleanup compatibility:** scoped/direct logout no longer discards surviving lineage handles. Successful delete scripts no longer repeat application-side alias cleanup. A fixed warmed workload of 12 rotated lineages deleted by subject used 52 client commands before and 16 after on both Redis 6.2 and 7.2 (36 fewer sequential round trips); this measures command count, not latency. Lua still materializes whole logical-member sets, probes primaries until finding a survivor, and materializes/deletes all aliases when inactive; large lineages/alias sets remain scale-dependent server work
- creating or rotating into a previously obsolete session ID removes that stale alias ownership first, so a reused ID cannot invoke an old logical-session meaning
- `createAuthorizationTransaction` and `createExchangeCode` are upserts; `createSession` is create-only and duplicate session IDs throw `OidcVaultStoreConflictError` without changing the existing record or indexes. Portable callers must create sessions with a fresh unused ID and handle `OidcVaultStoreConflictError`: reusing a live ID rejects here but replaces on memory/MongoDB, so only fresh-ID creation is portable
- portable data consists of strings, finite numbers, booleans, null, arrays, and plain objects; exclude cycles, custom prototypes/serializers, functions, symbols, and undefined properties. This applies to nested provider/user/metadata data, not only top-level metadata
- portable plain-object/array inputs are captured before asynchronous work, including rotation source reads and scoped deletion scans. Returned session containers are independent from caller input, including nested provider/user/metadata arrays; later caller mutation cannot change the committed portable value or eventual result
- compatibility: session ownership snapshots do not add a JSON round-trip. The existing JSON serializer still handles native values and `toJSON` hooks (and still rejects unsupported values such as BigInt/cycles). Opaque non-plain objects are not recursively copied and have no portable mutation-isolation guarantee; create/rotate results retain their native values while reads reflect persisted JSON
- backchannel logout token JTI records are consumed only when `expiresAt` is finite and greater than the store clock at consume time
- the optional `now` hook controls store-domain timestamps and testable JTI validation only; Redis server time is the authority for Redis key expiry and revocation-index cleanup
- the client must implement `sendCommand(args)`; official standalone `redis` clients already do, and a Sentinel-wrapped master client or any adapter implementing `OidcVaultRedisClient` does too

## Rotation Aliases And Lifetime

Rotation preserves the source logical ID when the next session omits it. Each old ID becomes a revocation alias for its immediate successor's logical ID and `expiresAt`. With `A -> B (expiresAt=T1) -> C (expiresAt=T2)`, A stops working at T1 even if T2 is later or absent; B uses C's deadline. Later rotations never extend earlier aliases. `getSession(A)` returns `null`: an alias is never a readable/authentication session.

With `A/L1 -> B/L1 -> C/L2`, the new B alias revokes L2; earlier A keeps L1 and its original deadline, never C. Redis does not eagerly retire L1 aliases merely because rotation moves its last member elsewhere (memory does); they can remain until expiry or explicit lineage cleanup. Use distinct logical IDs for unrelated login families rather than relying on retained handles disappearing on reuse.

Without successor `expiresAt`, Redis and memory impose no alias time limit; MongoDB uses a finite fallback (default five minutes). Non-expiring Redis sessions and their aliases can grow without a fixed retention or size bound. Use explicit session lifetimes for portable finite windows. After an alias expires, use the live ID or the appropriate logical/subject/provider-session deletion method; core refresh preserves session expiry.

## Deletion, Counts And Concurrent Arrivals

Deleting a live public ID removes that record; deleting an unexpired alias revokes its logical lineage. Logical deletion and aliases have no issuer/client filter. Subject/provider-session object inputs match each supplied `issuer` and `clientId`; string inputs omit both filters and match across providers. A retained member in another scope keeps its unexpired aliases.

Bulk deletion makes one cursor traversal, rechecks scope in each atomic delete script, and can follow a rotated-away source to matching same-lineage successors. Counts sum primary sessions actually deleted by those scripts, including such successors; expired/missing records, stale membership repair and alias cleanup do not contribute. Duplicate cursor visits or overlapping revocations do not double-count an already deleted primary. A concurrent arrival may survive, and `0` is not proof that the scope is empty. An error can follow earlier committed deletions; the complete traversal is not one transaction. MongoDB instead repeats scoped deletion until an empty query and can count expired documents awaiting TTL cleanup; memory counts live deletions during a synchronous map scan. Vault deletion does not revoke outstanding stateless access tokens or call upstream logout.

## Redis Version And Topology

- **Minimum Redis version: 6.2.** One-time authorization transactions and exchange codes are consumed with `GETDEL`, which is unavailable before Redis 6.2. Versions 6.2 and 7.2 are exercised in integration tests.
- **Standalone Redis**: supported through the official `redis` `createClient(...)` client (`RedisClientType`). This is the tested topological default.
- **Redis Sentinel**: supported by passing the underlying master client retrieved from a `redis.createSentinel(...)` sentinel — for example, the client returned by `await sentinel.acquire()`, or via `await sentinel.use(c => c)` patterns documented in the `redis` package. The bare `createSentinel(...)` root client does NOT satisfy this package's structural contract directly: its `sendCommand(isReadonly, args, options?)` requires an `isReadonly` first argument, while this store calls `sendCommand(args)`. Wrap the underlying master with an adapter conforming to `OidcVaultRedisClient` if you want to retain the Sentinel's connection management. Sentinel failover switches the underlying node, so vault state survives a failover subject to your Sentinel AOF/RDB durability settings.
- **Redis Cluster**: **not supported.** Cluster-shaped official clients are rejected when the store is created. The package's atomic vault scripts touch several keys without a hash-slot routing adapter, so Cluster routing could send parts of one logical operation to different nodes. Add a Cluster routing/hash-slot adapter before enabling it.

## Client Lifecycle And Ownership

- **Connect the client yourself.** The store never calls `client.connect()`, `client.quit()`, or `client.disconnect()`. Pass an already-connected client and reuse it across requests.
- **Own `error` listeners, reconnects, and shutdown.** The store reads and writes commands but does not attach `error` listeners, suppress client errors, or close the client. Always register a client `error` listener on production connections; an unhandled client error can crash the process.
- **Graceful shutdown.** Draining `createSession`/`rotateSession`/`deleteSessionsBy*` in-flight calls, then `client.quit()`, is the supported shutdown order. The store holds no background timers, so no store-side teardown is required beyond verifying in-flight operations have settled.
- **Startup and concurrency.** There is no store `ready()` handshake: connect before accepting traffic, and provision permission to execute the documented commands and cached Lua scripts. Server-side scripts protect individual mutations from interleaving; indexed traversal and post-commit maintenance span multiple commands. They do not have a fixed total-work or completion-time bound.

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
- authorization transactions and exchange codes also use `PXAT`. Redis key expiry is authoritative for reads/consumes; payload `expiresAt` is structurally validated but is not independently compared to a clock on each read. Valid single-record reads use one `GET` or `GETDEL`, without a separate `TIME` round trip, preserving the split-clock policy above
- **TTL integrity assumption:** preserve the store-written key TTLs and matching index scores when restoring or migrating data. Externally removing/extending a TTL can make a past-dated payload readable/consumable; changing only a session TTL can also leave it live after its index membership is pruned. Read validation does not audit or repair this external expiry inconsistency. Shortening a key TTL makes the record unavailable as soon as Redis expires it, even if its payload expiry is later
- stale revocation memberships are pruned with Redis `TIME`, not the application clock, so a skewed application clock cannot remove a still-live Redis session from subject, provider-session, or logical-session indexes
- indexed revocation also checks the primary session key before deleting or returning a session; expired primary values are not returned and missing primary values remove the stale membership encountered during traversal
- indexed revocation uses `ZSCAN COUNT 250` and one `MGET` for the IDs returned in each batch. `COUNT` is a hint, not a hard batch cap (compact sorted sets can return all members); the batch is not further chunked. Response memory and repair concurrency can grow with the returned batch, while deletion scripts run sequentially
- each successful session create or rotation attempts one `SCAN MATCH <prefix>:* COUNT 100` step, then `TYPE` and, for each recognized sorted-set index, `TIME`/`ZREMRANGEBYSCORE`. **COUNT 100 is a hint, not “up to 100 keys”**: Redis may return more or fewer keys, and the store processes the whole response. Cleanup includes subject, provider-session, logical-session and rotated-alias indexes. Redis removes empty sorted sets; continued successful writes advance the scan even without a logout for that logical session
- post-commit index maintenance is best-effort and never masquerades as a failed write: once the atomic create/rotate script commits, `createSession`/`rotateSession` resolve with the committed session even if the follow-up `SCAN`/`TYPE`/`TIME`/`ZREMRANGEBYSCORE` maintenance fails. The failure is reported once via a fixed-text `console.warn` identifying only `createSession` or `rotateSession`; adapter error names, messages, codes, causes, and arbitrary thrown values are never inspected or logged. The incremental scan retries on a later create/rotate. Mutation-script failures still reject, and a successful rotation is never retried merely because maintenance failed
- **Diagnostic compatibility note:** post-commit maintenance warnings no longer include a `Cause:` suffix or adapter error details, which may contain credentials. Log consumers should use the operation name and fixed maintenance-failure text
- aliases use their immediate successor's expiry score; malformed stale aliases are deleted when their session ID is reused. Alias/index cleanup can materialize a whole logical-member or alias set inside Lua; neither cursor COUNT value bounds that server work
- there is no fixed stale-index cleanup deadline or memory cap. Expired entries can remain while writes stop or maintenance fails; non-expiring entries and aliases remain until explicitly revoked/cleaned. The incremental scan is opportunistic, not a retention SLA

## Stored Data Validation And Corruption Handling

- stored records are JSON payloads validated structurally on read, with session `sessionId`, authorization transaction `state`, and exchange-code `code` required to match the requested key (including each indexed batch member); see _Stored Data Characteristics_ for the schema-migration and plaintext-storage posture
- malformed one-time authorization transaction and exchange-code records are consumed atomically and return `null`, preventing reuse while failing closed
- malformed session records are treated as unreadable, deleted when encountered through session reads or indexed revocation, and never returned as authenticated state
- corruption repair deletes only the observed malformed payload through an atomic server-side compare-and-delete: a fresh same-ID record created after the stale read (session ID reuse is supported) is never destroyed by the repair, and the missing-session logout path applies the same guard instead of an unconditional delete
- **Identity-validation compatibility note:** shape-valid records stored under the wrong identity now follow the malformed-record policy and return `null`. Session repair targets only the observed lookup key, never the embedded session ID; indexed membership repair retains the same generation guard. One-time mismatches are consumed by the original atomic `GETDEL`, with no follow-up delete that could remove a replacement
- a stale repair observing corruption therefore preserves a concurrent replacement, while genuine logout of a live session (direct delete or scoped logical/subject/provider-session revocation) still deletes it; indexed revocation removes stale corrupt members and continues processing later valid sessions
- Redis mutation scripts preflight expected key types before writing so wrong-type keys fail without deterministic partial mutation
- package-generated validation and deterministic script diagnostics use fixed text without stored records. Arbitrary client/adapter failures can still reject operations with sensitive original errors; they are not generally sanitized for application logs. Use fixed operation names and allowlisted categories, not raw errors, connection URLs, session IDs, state/PKCE values, exchange codes or token-valued metric labels. The secret-independent post-commit warning policy above applies specifically to that warning path

## Main Exports

Use named imports from the package root; there is no default export or public subpath API. Use Node.js `>=22.12.0` for the core dependency's CJS/ESM runtime support. TypeScript apps also need `@types/node` and `@types/express`.

- `createRedisOidcVaultStore(...)`
- `OidcVaultRedisStoreRecordError`
- `type RedisOidcVaultStoreOptions`
- `type OidcVaultRedisClient`
