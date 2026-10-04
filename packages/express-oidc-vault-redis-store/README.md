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

- **Supported minimum Redis version: 6.2.** Versions 6.2 and 7.2 are exercised in integration tests. One-time consumption now uses guarded cached Lua, including legacy consumes, so old calls cannot spend guarded records.
- **Standalone Redis**: supported through the official `redis` `createClient(...)` client (`RedisClientType`). This is the tested topological default.
- **Redis Sentinel**: use an underlying master client retrieved from `redis.createSentinel(...)` (e.g. acquire/use patterns documented by that driver) or an adapter conforming to `OidcVaultRedisClient`. The bare Sentinel root has `sendCommand(isReadonly, args, options?)`, not this store's `sendCommand(args)`. Caller/adapter owns master acquisition, reconnect/failover and release. Automated provider tests exercise standalone 6.2/7.2, not Sentinel failover; replication/persistence guarantees are deployment-owned, and losing unexpired replay reservations during failover weakens replay protection until their window expires.
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
- authorization transactions and exchange codes also use `PXAT`. Legacy consumes and `getSession` preserve the key-TTL policy (no application-clock expiry check); legacy consumption uses one cached Lua call. The new transaction/code preflight getters compare payload expiry with Redis `TIME` (normally `GET` + `TIME`); guarded consumes compare payload expiry inside Lua with server time. They reject expired payloads even after externally altered TTLs
- **TTL integrity assumption:** preserve the store-written key TTLs and matching index scores when restoring or migrating data. Externally removing/extending a TTL can still expose past-dated payloads through legacy consumes or `getSession`; changing only a session TTL can leave it live after index pruning. New guarded operations additionally enforce payload expiry, but do not repair external index/TTL inconsistencies. Shortening a key TTL makes a record unavailable immediately even when payload expiry is later
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
- **Identity-validation compatibility note:** shape-valid records stored under the wrong identity follow the malformed-record policy and return `null`. Session repair targets only the observed lookup key, never the embedded session ID; indexed membership repair retains the same generation guard. One-time corruption is removed inside the same atomic consume script, with no follow-up delete that could remove a replacement
- a stale repair observing corruption therefore preserves a concurrent replacement, while genuine logout of a live session (direct delete or scoped logical/subject/provider-session revocation) still deletes it; indexed revocation removes stale corrupt members and continues processing later valid sessions
- Redis mutation scripts preflight expected key types before writing so wrong-type keys fail without deterministic partial mutation
- package-generated validation and deterministic script diagnostics use fixed text without stored records. Arbitrary client/adapter failures can still reject operations with sensitive original errors; they are not generally sanitized for application logs. Use fixed operation names and allowlisted categories, not raw errors, connection URLs, session IDs, state/PKCE values, exchange codes or token-valued metric labels. The secret-independent post-commit warning policy above applies specifically to that warning path

## Main Exports

Use named imports from the package root; there is no default export or public subpath API. Use Node.js `>=22.12.0` for the core dependency's CJS/ESM runtime support. TypeScript apps also need `@types/node` and `@types/express`. Both ESM (`import`, `index.d.mts`) and CJS (`require`, `index.d.ts`) declaration conditions are shipped; consumer imports always use the package name.

- `createRedisOidcVaultStore(...)`
- `OidcVaultRedisStoreRecordError`
- `type RedisOidcVaultStoreOptions`
- `type OidcVaultRedisClient`

## Device-Binding Store Capabilities

The factory returns core `OidcVaultDeviceBindingStoreProvider`, with detached live `getAuthorizationTransaction(state)` and `getExchangeCode(code)`, atomic `consumeAuthorizationTransactionIfMatches({ state, match })` and `consumeExchangeCodeIfMatches({ code, expectedSessionId, match })`, token-free `getSessionRevocationContext(sessionId)`, and `reserveDpopProof({ replayKey, expiresAt })`.

Import the stronger provider, match/consume/replay/revocation types and `OidcVaultDpopReplayCapacityError` from the **core package root**; the Redis package exports its factory/options/client and record error only. Either vault opt-in feature requires all six capabilities, while fingerprint-only flows do not reserve proofs. Use the same shared provider as API replayStore; the core shipped README includes complete DPoP issuer/API/browser usage.

`match` requires both `deviceBinding` and `browserBindingHash`. Non-null values match exactly; **null requires stored absence**, never BSON/JSON null or “ignore”. Legacy records omit both; guarded unbound records have a cookie hash; bound records have that hash plus `{ type: 'dpop', jkt }`. Hashes are canonical 43-character SHA-256 base64url. Null/malformed/extra binding fields and key-without-hash records are invalid; writes reject and corrupted data returns no credentials. No JWK, proof algorithm, or historical mode is stored.

Preflight getters are not locks. The consume script performs shape/identity/expiry, both matches, exchange-session match and deletion atomically; mismatch returns `null` without spending a live record. Matching races have one winner across independent Redis clients. **Legacy consumes now also use this script** and refuse guarded records, including cookie-only records, without spending them. There is no application-side get/unconditional-delete bypass. Malformed read cleanup retains the existing compare-and-delete generation guard.

Rotation inherits omitted binding, accepts the same key, and rejects null/malformed, changed, or newly added binding before mutation. Lua also rechecks source identity, credential generation and binding against the preflight source so same-ID replacement cannot make a new lineage inherit an old key or lose index ownership. Target-ID, alias, deletion and post-commit maintenance policies remain as documented above.

`getSessionRevocationContext` resolves a live handle or unexpired alias and all live members of its current lineage inside one Lua snapshot. A directly observed live handle always participates even if its reverse-index membership is missing, so peers cannot make that bound handle appear unbound. It returns only `logicalSessionId`, allowlisted `provider.issuer/clientId`, and optional original `deviceBinding`; no tokens/profile/metadata/arbitrary provider fields leave Redis. Alias payloads still contain only their logical ID: absence of an alias binding never means an unbound lineage. Malformed/inconsistent binding/provider authority throws a fixed diagnostic. Expired aliases/empty lineages return `null`, and `getSession(alias)` remains `null`. This call materializes the whole logical-member set and reads member primaries inside Lua; large lineages remain scale-dependent server work.

## Per-Request DPoP Replay And Capacity

| Redis option           | Default      | Contract                                                                |
| ---------------------- | ------------ | ----------------------------------------------------------------------- |
| `client`               | required     | Connected standalone-shaped client/adapter; caller owns lifecycle       |
| `keyPrefix`            | `oidc-vault` | Shared vault/replay namespace; changing it is not migration             |
| `dpopReplayMaxEntries` | `100000`     | Positive safe integer, identical on clients sharing the prefix          |
| `now`                  | `Date.now`   | Store timestamps/backchannel preflight only; replay/TTL use server TIME |

```ts
const storeProvider = createRedisOidcVaultStore({
  client: redis,
  keyPrefix: 'oidc-vault',
  dpopReplayMaxEntries: 100_000,
});
```

`dpopReplayMaxEntries` is a positive safe integer (default **100000**), shared per key prefix across clients. Every client sharing that prefix must configure the same limit. The opaque proof keys are members of **`<keyPrefix>:dpop-proofs`**, a sorted set whose scores are absolute expiry milliseconds. This set is both replay state and capacity/expiry accounting; there is no separate counter that can leak after individual key TTLs.

`reserveDpopProof` is normally **one cached `EVALSHA` round trip per proof**. Server `TIME` inside Lua owns the validity window; the optional application `now` hook cannot admit a stale proof or prune live reservations. A safe-integer future expiry is required, with remaining TTL **<=360000 ms**. Invalid/nonfinite/unsafe/fractional/expired (`<= server now`) or overlong input returns `false` without allocation. Duplicate-first `ZSCORE` rejects without extending expiry, even at capacity. Lua reclaims at most **64** expired members with `ZRANGEBYSCORE ... LIMIT 0 64`, plus the requested expired key, then atomically checks `ZCARD` and admits with `ZADD`. No session/alias scan, unbounded `ZREMRANGEBYSCORE`, or live-entry eviction occurs on replay admission.

The replay set expires at its latest retained score (`PEXPIREAT`), reclaiming it if traffic stops; this deadline never extends a member's replay window. Expired members awaiting bounded cleanup may conservatively occupy capacity. New keys at capacity throw root `OidcVaultDpopReplayCapacityError` from `@web-ts-toolkit/express-oidc-vault`, with no live eviction or acceptance without replay state. Wrong-type/client failures reject. `NOSCRIPT` recovery loads and retries once, adding two round trips to the normal call; the existing runner never retries an arbitrary committed mutation on transport failure.

Provision ACLs for cached scripts and their internal commands, including `TIME`, `TYPE`, `GET`, `DEL`, `ZSCORE`, `ZRANGEBYSCORE`, `ZREM`, `ZCARD`, `ZADD`, `ZREVRANGE` and `PEXPIREAT`. DPoP is a **per-request write**, unlike lower-volume backchannel JTIs (`SET NX PXAT`). Size capacity for unique proofs/second × validity window plus headroom (approved defaults: at most 70 seconds). Share identical namespaces/windows and synchronized clocks across instances; never release reservations after downstream failure, and retries need a fresh proof. Capacity/provider errors must map through orchestration to sanitized replay-unavailable and fail closed. Redis failover durability remains deployment-owned; these command/work bounds are not throughput/latency guarantees.
