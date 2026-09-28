# `@web-ts-toolkit/express-oidc-vault-memory-store`

In-memory store provider for `@web-ts-toolkit/express-oidc-vault`.

## Installation

```sh
pnpm add @web-ts-toolkit/express-oidc-vault @web-ts-toolkit/express-oidc-vault-memory-store express
```

## Use Cases

- local development
- test environments
- examples and package integration smoke tests

## Production Note

This package stores authorization transactions, exchange codes, sessions, rotated-session aliases, and backchannel logout replay JTIs in process memory.

Do not use it for multi-instance or production deployments. Use Redis or MongoDB provider packages for durable or horizontally scaled deployments.

## Quick Start

```ts
import express from 'express';
import { createOidcVaultMiddleware } from '@web-ts-toolkit/express-oidc-vault';
import { createMemoryOidcVaultStore } from '@web-ts-toolkit/express-oidc-vault-memory-store';

const app = express();
const storeProvider = createMemoryOidcVaultStore();

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
    storeProvider,
  }),
);
```

For local development, this is the shortest setup because it has no Redis, MongoDB, or file-system dependency. Sessions are lost on process restart and are not visible to other Node.js instances.

### Test-Friendly Clock Override

`now()` returns epoch milliseconds and defaults to `Date.now`. Override it only as a deterministic test seam; the returned value must be monotonic enough for the expiry scenarios your test exercises.

```ts
const storeProvider = createMemoryOidcVaultStore({
  now: () => 1_700_000_000_000,
});
```

## Main Exports

Use named imports from the package root; there is no default export or public subpath API. Use Node.js `>=22.12.0` for the core dependency's CJS/ESM runtime support. TypeScript apps also need `@types/node` and `@types/express`.

- `createMemoryOidcVaultStore(...)`
- `type MemoryOidcVaultStoreOptions`

## Lifecycle And Diagnostics

The factory is immediately usable: no connection, `ready()` call, background timer, or store teardown is required. Reuse one instance across requests in the same process. Operations perform their map mutations synchronously before yielding; this does not share state with other processes. Discarding the instance or restarting loses all records.

The store does not log records or errors. Session tokens, authorization state/PKCE data, exchange codes, public session IDs, and arbitrary backend/hook errors may be sensitive. Application diagnostics should use fixed operation names and allowlisted categories, not whole records, raw error messages, connection URLs, or credential-valued metric labels.

## Session Rotation Aliases

When a session is rotated, the previous public session ID becomes a revocation alias for the target's logical session. Each alias keeps the immediate target's `expiresAt`, if present; later rotations do not extend that deadline. An unexpired alias remains usable while its logical lineage has a live member. Aliases without an expiry can remain for the lifetime of that lineage.

For example, `A -> B (expiresAt=T1) -> C (expiresAt=T2)` leaves A usable only before T1, even if T2 is later or absent; B uses C's deadline. `getSession(A)` returns `null`: an alias is only a logout handle, never a readable session. With `A/L1 -> B/L1 -> C/L2`, B revokes L2 and any retained A alias revokes L1, not C. Omitting the next logical ID preserves the source lineage. Logical IDs are unscoped: use distinct IDs for unrelated login families.

Without successor `expiresAt`, memory and Redis impose no alias time limit; MongoDB instead uses a finite fallback (default five minutes). Long-lived non-expiring lineages can accumulate arbitrarily many memory/Redis aliases. Set explicit session lifetimes for portable finite windows; after an alias expires, revoke using the live ID or the appropriate logical/subject/provider-session deletion method. Core refresh preserves the session expiry.

Aliases are removed when logical, subject, provider-session, direct, or expiry deletion leaves no live session in that lineage. A lineage-changing create-upsert or rotation also retires the old lineage's aliases when no live member remains; expired records awaiting cleanup do not count as survivors. If another live member survives, including in another issuer/client scope, the earlier aliases retain their original lineage and expiry. They are never retargeted to the new lineage.

Rotation requires a different target session ID with no live session record. An alias-only ID or an expired target is accepted. Successful rotation takes ownership of the target ID and clears any former alias under that ID, just as `createSession` does. Missing-source, same-ID, and live-target rotation conflicts throw `OidcVaultStoreConflictError`; conflicts and input-clone failures preserve live source/target records and their aliases.

Compatibility note: ownership transitions now retire aliases for terminated lineages, so reusing an old logical session ID cannot resurrect those handles. Reusing an alias-only rotation target also prevents that ID from reverting to its former lineage after replacement deletion or expiry.

## Store Contract

The store keeps these record kinds in separate in-process maps:

- authorization transactions, consumed once by `state`
- exchange codes, consumed once by `code`
- sessions, read and deleted by session, logical session, subject, or provider session identifiers
- rotated-session aliases, used only so an old public session ID can revoke the current logical session
- backchannel logout token JTIs, consumed once until their expiry time

`createAuthorizationTransaction`, `createExchangeCode`, and `createSession` are upserts; creating the same key again replaces the old value. A `createSession` replacement takes over the session ID with its own subject/logical/provider-session scope, and clears any stale rotation alias held under that ID so the reused ID cannot invoke an old logical-session meaning. Portable callers must still create sessions with a fresh unused ID and handle `OidcVaultStoreConflictError`: reusing a live ID replaces on memory/MongoDB but rejects on Redis. MongoDB also retains an alias row under a reused ID until expiry or lineage cleanup; only fresh-ID creation is portable.

Portable data consists of strings, finite numbers, booleans, null, arrays, and plain objects (no cycles, custom prototypes/serializers, functions, symbols, or undefined properties). Inputs are captured at invocation, including nested provider/user/metadata data, and returned values are detached from caller and stored data. Mutation immediately after calling a method cannot change its target, scope, or portable value. Memory uses `structuredClone`; unsupported inputs reject. Outside the portable subset, memory structured-clone, MongoDB BSON, and Redis JSON semantics differ; do not assume native types or object identity survive across providers. MongoDB/Redis snapshot plain containers but do not recursively isolate opaque native objects.

Expiry checks use `expiresAt <= now()` as expired. Cleanup is opportunistic: reads and writes prune expired records in bounded batches or when a specific record is accessed, not on a background timer.

Each same-map sweep inspects at most 64 snapshot slots per operation from a positional cursor, so a late cursor never rescans the map prefix. A key snapshot is rebuilt once per full pass (amortized over that pass's sweeps); keys added mid-pass are picked up on the next pass. Nested rotated-alias/lineage cleanup after session expiry, deletion, or a lineage-changing ownership transition is not batch-bounded: for each affected lineage it can scan the retained session map for liveness and the alias map for removal. These full-map scans grow with store populations; the 64-slot sweep bound does not bound total operation work.

`deleteSession(...)`, `deleteSessionsByLogicalSessionId(...)`, `deleteSessionsBySubject(...)`, and `deleteSessionsByProviderSessionId(...)` logically revoke live sessions and remove stale rotation aliases when no live session remains in a logical lineage.

Deleting a live public ID removes that record; deleting an unexpired alias revokes its logical lineage. Subject/provider-session object inputs filter by each supplied `issuer` and `clientId`; string inputs omit those filters and match across providers. A surviving member in another scope retains its lineage's unexpired aliases. Logical deletion has no issuer/client filter, and aliases do not carry one.

Bulk methods return the number of live sessions removed, excluding expired records and alias cleanup. They scan the session map synchronously, but sessions created after that work can survive. Across providers, a count is deletion accounting, not proof that no matching sessions remain: MongoDB may count expired documents awaiting TTL cleanup; Redis counts primary deletions during cursor traversal. Vault deletion does not revoke already-issued stateless access tokens or perform upstream provider logout.

## Replay JTI Expiry

Backchannel logout token JTI records are consumed only when `expiresAt` is a finite timestamp greater than the store clock at consume time. Expired, equal-to-current-time, `NaN`, and infinite expiries return `false` and are not stored.
