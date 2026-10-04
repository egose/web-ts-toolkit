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
  await new Promise<void>((resolve, reject) => {
    server.close((error) => (error ? reject(error) : resolve()));
  });
  // Also settle any store work started outside HTTP requests before closing.
  await mongo.close();
});
```

## Collection Names

The provider uses seven separate MongoDB collections by default:

- `oidc_vault_authorization_transactions`: authorization transaction state, nonce, PKCE verifier, and metadata
- `oidc_vault_exchange_codes`: short-lived frontend exchange codes
- `oidc_vault_sessions`: sessions, user data, and bearer-equivalent token material
- `oidc_vault_backchannel_logout_token_jtis`: consumed backchannel logout token JTIs
- `oidc_vault_rotated_session_aliases`: stale rotated session IDs mapped to active logical sessions
- `oidc_vault_dpop_proofs`: unique DPoP proof IDs with a TTL expiry index
- `oidc_vault_dpop_replay_capacity`: shared capacity/serialization row and indexed, non-TTL expiry-accounting rows

Override collection names when your deployment needs explicit naming:

```ts
const storeProvider = createMongoOidcVaultStore({
  db: mongo.db('app-auth'),
  authorizationTransactionsCollectionName: 'auth_oidc_transactions',
  exchangeCodesCollectionName: 'auth_oidc_exchange_codes',
  sessionsCollectionName: 'auth_oidc_sessions',
  backchannelLogoutTokenJtisCollectionName: 'auth_oidc_backchannel_logout_jtis',
  rotatedSessionAliasesCollectionName: 'auth_oidc_rotated_session_aliases',
  dpopProofsCollectionName: 'auth_dpop_proofs',
  dpopReplayCapacityCollectionName: 'auth_dpop_capacity',
});
```

## Startup And Client Ownership

- use MongoDB when your team already standardizes on Mongo and you want the auth vault data in the same operational platform
- the provider uses seven separate collections: transactions, exchange codes, sessions, backchannel JTIs, aliases, DPoP proofs and replay capacity/accounting
- TTL indexes are created on expiring records; sessions, authorization transactions, exchange codes, backchannel logout token JTIs, and rotated-session aliases are also checked for expiration during relevant reads or consumes (`expiresAt <= now()` is expired), so behavior does not depend only on Mongo's background TTL monitor timing
- session rotation, coherent revocation-context reads, replay-capacity admission and inactive-lineage alias cleanup require MongoDB transactions; use a replica set or sharded deployment because standalone servers fail readiness instead of using non-atomic fallbacks
- startup readiness creates required indexes and verifies transaction-capable topology; connect the MongoDB client, create the store, await `storeProvider.ready()`, then accept traffic
- session deletion by subject or provider session ID uses compound scoped indexes on the identity field plus `provider.issuer` and `provider.clientId`; these replace single-field identity indexes because the leading key still supports identity-only deletes while scoped logout deletes avoid scanning every repeated identity across tenants
- the application owns MongoDB client shutdown; this package does not close the client

Drain HTTP requests and any other in-flight store operations before closing the caller-owned `MongoClient`. The store has no shutdown method or background cleanup timer. Its explicit transaction sessions are ended in `finally` on success and failure; MongoDB's TTL monitor belongs to the server. Shared state and durability depend on your deployment, replication and backup configuration.

## Rotation Aliases And Lifetime

- rotation requires a distinct unused target session ID; missing-source, same-ID, existing-target, changed-source, and expired-source rotation conflicts throw `OidcVaultStoreConflictError` without changing source or target records (the source document is re-read inside the transaction and must still match the generation seen before the transaction, including liveness, so a same-ID replacement committed after the rotation's source read aborts instead of being consumed)
- an expired target document still present before TTL cleanup can conflict; use fresh target IDs for portable rotation
- each alias takes its immediate successor's `expiresAt`, not the source's; later rotations never extend it. With `A -> B (expiresAt=T1) -> C (expiresAt=T2)`, A stops revoking at T1 even if T2 is later or absent. B uses C's deadline. `getSession(A)` returns `null`: aliases are only revocation handles
- without successor `expiresAt`, MongoDB uses `now() + rotatedSessionAliasRetentionMs` (default five minutes, finite positive duration). Memory/Redis instead have no alias time limit and can accumulate aliases for a long-lived lineage. Finite session expiry is the portable policy; core refresh preserves it
- omitting the next logical ID preserves the source lineage. With `A/L1 -> B/L1 -> C/L2`, the new B alias revokes L2; earlier A keeps L1 and its original deadline, never C. MongoDB does not eagerly retire L1 aliases merely because rotation/upsert moves its last member elsewhere (memory does); they can remain until expiry or explicit lineage cleanup. Use distinct logical IDs for unrelated login families rather than relying on retained handles disappearing on reuse
- after an alias expires, use the live ID or logical/subject/provider-session deletion, not that stale handle

## Deletion, Counts And Concurrency

- deleting a live public ID removes that record; deleting an unexpired alias revokes its logical lineage. Logical deletion and aliases have no issuer/client filter. Subject/provider-session object inputs match each supplied `issuer` and `clientId`; string inputs omit both filters and match across providers
- deleting by current session ID, subject, or provider session ID preserves unexpired aliases while any live member of the logical session survives, including another issuer/client scope; a stale rotated ID still revokes its logical lineage
- after session deletion commits, alias cleanup checks live membership and removes inactive-lineage aliases in a snapshot transaction. Concurrently inserted rotation aliases are outside that snapshot; updating an existing alias conflicts and retries cleanup, including identical lineage/expiry reuse (an internal alias revision makes every rotation a write). Cleanup sessions are closed on success and failure. This is not a global logout snapshot: later arrivals can survive, and cleanup failure can reject after sessions were already deleted
- compatibility: scoped/direct deletion no longer discards the surviving lineage's revocation handles. Alias deadlines and the create-ID-reuse variation below are unchanged. Cleanup still materializes affected logical IDs and surviving members; very large `$in` batches remain a scale-dependent limit

Subject/provider-session deletion repeats find/delete/cleanup passes until a find observes no matches. It can catch a rotation or matching arrival on a later pass, but arrivals after the final query can survive; continuously arriving matches can prolong the call without a fixed pass bound. Logical deletion uses one `deleteMany` followed by alias cleanup. Counts sum MongoDB `deletedCount` for primary session documents, possibly including expired documents awaiting TTL cleanup; alias removal is never counted. Memory excludes expired sessions, and Redis counts primary deletions from its cursor traversal. Counts are not a global remaining-session census or a cross-provider live-user metric. An error can follow partial/committed deletion. Vault deletion does not revoke outstanding stateless access tokens or call upstream logout.

## Creation And Data Ownership

- `createAuthorizationTransaction`, `createExchangeCode`, and `createSession` are upserts; a `createSession` replacement takes over the session ID with its own subject/logical/provider-session scope
- unlike memory/Redis, a `createSession` replacement does not clear a stale rotation alias row held under the reused ID; that row can remain until expiry or lineage cleanup. After removing the replacement, another delete of that ID can invoke its former lineage. Portable callers must create sessions with a fresh unused ID and handle `OidcVaultStoreConflictError` (reusing a live ID replaces here but rejects on Redis; concurrent reuse also races rotation source checks)
- portable data consists of strings, finite numbers, booleans, null, arrays, and plain objects; exclude cycles, custom prototypes/serializers, functions, symbols, and undefined properties. This applies to nested provider/user/metadata fields, not just top-level metadata
- portable plain-object/array inputs are snapshotted at invocation, before readiness or other asynchronous work; later caller mutation cannot change session/transaction data, rotation retries, JTI identity, or deletion scope. Returned session containers are independent from caller input, including nested provider/user/metadata arrays
- compatibility: ownership snapshots do not JSON-round-trip values or flatten BSON wrappers. MongoDB's native serialization still applies outside the portable subset (including Dates, BSON values, undefined properties and custom `toBSON` hooks); opaque non-plain objects are not recursively copied and have no portable mutation-isolation guarantee
- backchannel logout token JTI records are consumed only when `expiresAt` is finite and greater than the store clock at consume time

Authorization transactions and exchange codes are atomically consumed once by state/code, returning `null` when absent or expired. JTI reservations return `false` for duplicate, past, exact-boundary, NaN, or infinite expiries. Core passes an opaque issuer/client/JTI-namespaced key; the store uses it verbatim. Session creation defaults omitted logical ID to session ID and omitted timestamps to the store clock.

## Security And Operations

Session records contain refresh tokens, ID tokens, access tokens, and related bearer-equivalent secrets. Treat the MongoDB database and every backup, log, trace, metric label, and export path that can expose these records as sensitive auth infrastructure.

Recommended controls:

- require TLS for MongoDB connections and for any network path carrying session data
- grant the application least-privilege roles scoped to the configured database and collections
- enable encryption at rest for the database and backups
- restrict observability tooling so token fields and whole session documents are not logged, indexed, sampled, or exported
- define an explicit data-retention policy for sessions, aliases, authorization transactions, exchange codes, and consumed logout JTIs
- close the caller-owned `MongoClient` from application shutdown code; this package never closes it

The store does not emit record/error logs or sanitize arbitrary MongoDB/client exceptions for application logging. Use fixed operation names and allowlisted diagnostic categories; do not log whole errors, connection URLs, session IDs, state/PKCE values, exchange codes or token-valued labels. A private error observer is not an automatic redaction boundary.

This package does not implement application-level field encryption or client-side field-level encryption. Add those controls at your MongoDB/client configuration layer if your deployment requires them.

## Scoped Deletion Indexes

The sessions collection creates these deletion indexes:

- `subject_scope_idx`: `{ subject: 1, 'provider.issuer': 1, 'provider.clientId': 1 }`
- `provider_session_scope_idx`: `{ providerSessionId: 1, 'provider.issuer': 1, 'provider.clientId': 1 }`
- `logical_session_idx`: `{ logicalSessionId: 1 }`

Representative query-plan evidence used a dataset with 2 repeated identities, 10 issuers, 10 clients, and 10 duplicate sessions per issuer/client scope. With only single-field `subject` or `providerSessionId` indexes, scoped delete lookups examined all 1,000 matching identity documents. With the compound indexes above, `subject/providerSessionId + issuer`, `subject/providerSessionId + clientId`, and `subject/providerSessionId + issuer + clientId` examined 100, 100, and 10 documents respectively, matching the scoped result set size in that dataset.

The package intentionally creates one compound index per public scoped identity delete path rather than one index per optional-filter permutation. The leading identity key still supports identity-only deletes with the same result-set-sized scan as the previous single-field indexes, while issuer/client scoped deletes avoid broad scans in multi-tenant collections. The residual assumption is that very large deployments should keep subject/provider-session identifiers reasonably distributed within each issuer/client scope; otherwise the scoped result set itself is large and deletion cost is expected to scale with the number of sessions being revoked.

## Main Exports

Use named imports from the package root; there is no default export or public subpath API. Use Node.js `>=22.12.0` for the core dependency's CJS/ESM runtime support. TypeScript apps also need `@types/node` and `@types/express`. Both ESM (`import`, `index.d.mts`) and CJS (`require`, `index.d.ts`) declaration conditions are shipped; consumer imports always use the package name.

- `createMongoOidcVaultStore(...)`
- `type OidcVaultMongoStoreProvider`
- `type MongoOidcVaultStoreOptions`
- `DEFAULT_ROTATED_SESSION_ALIAS_RETENTION_MS`

## Device-Binding Store Capabilities

`OidcVaultMongoStoreProvider` extends the core `OidcVaultDeviceBindingStoreProvider`, retaining `ready()`. `getAuthorizationTransaction(state)` / `getExchangeCode(code)` return detached live snapshots without consumption. They are preflight, not locks. `consumeAuthorizationTransactionIfMatches({ state, match })` and `consumeExchangeCodeIfMatches({ code, expectedSessionId, match })` use **filtered atomic `findOneAndDelete`**, comparing expiry, both security fields and (for exchange) the observed session ID in the delete predicate. No get followed by unconditional deletion is used. Matching concurrent clients have one winner; mismatch returns `null` and leaves the live record available for an honest retry.

Import shared stronger-provider/match/consume/replay/revocation types and `OidcVaultDpopReplayCapacityError` from the **core package root**. This package's root exports its factory, Mongo options/provider and alias-retention constant. Either vault opt-in feature checks all six stronger capabilities; fingerprint-only does not reserve proofs. Core's shipped README contains the complete bound issuer/request-aware API/browser recipe, using the provider as API replayStore.

`match` includes both `deviceBinding` and `browserBindingHash`. Non-null values match exactly; **null matches field absence only (`$exists: false`)**, never BSON null or an ignored field. Legacy records have neither field, cookie-only POST records have a browser hash, and bound POST records have that hash plus `{ type: 'dpop', jkt }`. Both hashes are canonical 43-character SHA-256 base64url. Key-without-hash, stored null, malformed/noncanonical hashes or extra binding fields are invalid. Security-field writes reject invalid input; explicit undefined fields are omitted before BSON serialization so they cannot turn into null. Binding comparison is independent of BSON field order. Original legacy consumes refuse guarded records without consumption. Corrupt records return no credentials and may remain until TTL cleanup/replacement.

Session documents persist only the thumbprint binding, never a JWK, proof algorithm or historical mode. Rotation inherits omitted/undefined binding, accepts the same key and rejects null/malformed binding, changing a key or enrolling an unbound source before mutation. Binding is also included in the transaction's source-generation comparison, so replacement/retry cannot consume a new source under the old key. Existing ID upsert, target conflict, alias-retention and deletion-count variations above are preserved.

Migration detail: the pre-binding Mongo mapper wrote BSON null for omitted **provider metadata and session expiry**. Those two non-binding fields are normalized to absence on genuinely unbound legacy rows, preserving their read/rotation/revocation behavior. This does not normalize `deviceBinding` or `browserBindingHash`: their stored null values are always invalid. Bound records with malformed provider/expiry still fail closed.

`getSessionRevocationContext(sessionId)` resolves a live handle or unexpired alias to a currently live lineage using one snapshot transaction. It projects only logical ID/subject/provider/binding/expiry (no refresh/ID/access tokens fetched) and returns only `logicalSessionId`, allowlisted `provider.issuer/clientId`, and optional original `deviceBinding`. No profile/metadata/arbitrary provider fields are returned. Aliases remain token/binding-free; they resolve surviving session authority rather than treating missing alias binding as unbound. Malformed/inconsistent lineage binding/provider authority throws a fixed private diagnostic. Expired aliases/empty lineages return `null`; `getSession(alias)` remains `null`. Lineage queries materialize their surviving candidates; this is not bounded replay-admission work.

## Per-Request DPoP Replay, Capacity And TTL Accounting

| Mongo replay option                | Default                           | Contract                                                                        |
| ---------------------------------- | --------------------------------- | ------------------------------------------------------------------------------- |
| `dpopReplayMaxEntries`             | `100000`                          | Positive safe integer, same on all clients sharing the collection pair          |
| `dpopProofsCollectionName`         | `oidc_vault_dpop_proofs`          | Unique proof IDs and TTL expiry; distinct from all other collections            |
| `dpopReplayCapacityCollectionName` | `oidc_vault_dpop_replay_capacity` | Capacity/revision + indexed non-TTL expiry ledger; TTL indexes reject readiness |

```ts
const storeProvider = createMongoOidcVaultStore({
  db: mongo.db('app-auth'),
  dpopReplayMaxEntries: 100_000,
  dpopProofsCollectionName: 'oidc_vault_dpop_proofs',
  dpopReplayCapacityCollectionName: 'oidc_vault_dpop_replay_capacity',
});
await storeProvider.ready();
```

`dpopReplayMaxEntries` is a positive safe integer, default **100000**, shared across independent clients using the paired replay collections. All seven collection names must be distinct and valid. Every shared client must use the same capacity and proof/accounting collection pairing; readiness fails if the persisted capacity configuration disagrees. Changing names starts an independent namespace, not a migration. No instance-local admission counter or replay fallback is used.

`reserveDpopProof({ replayKey, expiresAt })` reserves an opaque key verbatim after proof verification. Expiry must be a safe-integer future millisecond epoch with remaining TTL **<=360000 ms**. Nonfinite/unsafe/fractional/expired (`<= now()`) or overlong windows return `false` without allocation. A duplicate returns `false` without extending expiry, before capacity checks. Valid expired IDs may be admitted again.

Admission is a **snapshot transaction serialized by an actual revision write** to the shared capacity row. It checks the unique proof ID and its accounting entry, removes at most **64** indexed expired accounting entries plus the requested expired key, then commits the proof write, accounting insertion and capacity update together. No full proof-collection count/scan is required per request. New reservations at capacity throw core `OidcVaultDpopReplayCapacityError` (import from `@web-ts-toolkit/express-oidc-vault`); live reservations are never evicted. Write failures roll back all admission changes; driver transaction retries repeat against the same invocation-owned input and a fresh snapshot. Every allocated transaction session is ended in `finally`.

**TTL deletion cannot leak capacity:** only `dpopProofs` has a TTL index. Each admitted key also has an indexed expiry-accounting row in `dpopReplayCapacity`, which deliberately has **no TTL index**; readiness rejects any pre-existing TTL index on that collection. Even if MongoDB's monitor already deleted a proof row, the next bounded cleanup still knows when/how much to decrement. A missing physical proof with an unexpired accounting entry remains a duplicate, not an acceptance bypass. Corrupt accounting fails closed. At most the configured number of proof rows and accounting rows, plus one capacity row, are retained by normal operation. Expired accounting rows awaiting traffic-driven cleanup can conservatively occupy capacity; when traffic stops they remain bounded and are reclaimed on later admissions.

DPoP replay is a **write per accepted proof/API request**, much higher-volume than backchannel logout JTIs. The common no-cleanup admission uses seven sequential data commands plus transaction commit; a live duplicate uses a capacity write, proof lookup and commit. Expired-row cleanup adds bounded queries/deletes, and contention/retries add work. The single shared capacity row serializes admissions and can become a throughput bottleneck. Size for unique proofs/second × validity window plus headroom (approved defaults: at most 70 seconds), share identical namespaces/windows and synchronized clocks, and load-test the intended rate. This provides atomic capacity, not a latency/throughput SLA.

Never release a reservation after downstream failure, extend duplicate expiry, or accept a proof when replay storage fails. Retries require a fresh proof. Core API/vault middleware maps capacity/provider failure to sanitized **503 OIDC_VAULT_DPOP_REPLAY_UNAVAILABLE**; private diagnostics are not automatically safe to log. The store supplies atomic state, not HTTP proof authentication. Replica-set tests verify these operations; sharded topology/distributed failure durability and throughput remain deployment-specific checks. Losing live replay data on restore/failover weakens replay protection until its acceptance window expires.
