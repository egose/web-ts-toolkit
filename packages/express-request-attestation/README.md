# `@web-ts-toolkit/express-request-attestation`

Versioned per-request HMAC signing and replay detection for Express APIs,
with a browser-safe signer entry. One installable package, two public
entries: `.` for Express, `./signer` for the browser.

## Guarantee and limitation

A verifier checks that a request's signed fields match a currently accepted
key, that its timestamp is within policy, and that its nonce has not already
been admitted in the same protection space.

**A key delivered in public JavaScript is accessible to every caller.**
Encoding, minification, and rotation do not make it a confidential
authentication credential: any script can fetch the current material and
generate fresh valid signatures without a browser. This package therefore
provides request-format consistency and detection of repeated signed
submissions while replay state survives. It does **not** establish
browser/device authenticity, a human user, session ownership, application
authorization, or reliable bot prevention. OIDC/session/DPoP validation
continues to establish its own authentication boundary, and the public HMAC
key must never be reused for JWT signing, OIDC client secrets, cookies,
CSRF secrets, DPoP challenges, or other confidential server operations.

Rotation limits how long old material is accepted; it does not stop a caller
from downloading the next version. Nonce admission does not prevent abuse
using newly generated nonces. Replay admission is not business-operation
idempotency or exactly-once delivery; durable idempotency is
application-owned. Never release a successful reservation after handler
failure or a lost response; a fresh proof is required on a new attempt.

## Install

Backend consumers install Express explicitly (optional peer `>=5`); the
signer entry never needs it. Redis and MongoDB are caller-injected through
structural types; installing each driver is only needed when using that
store.

```sh
# Backend (Express >= 5 required at runtime)
pnpm add @web-ts-toolkit/express-request-attestation express
# Browser-only (no Express needed)
pnpm add @web-ts-toolkit/express-request-attestation
# With shared Redis replay state (backend only)
pnpm add redis
# With shared MongoDB replay state (backend only, replica set required)
pnpm add mongodb
```

## Entry imports

```ts
// Server: middleware, body capture, key providers, stores, asset router.
import {
  createAttestationBodyCapture,
  createMemoryAttestationStore,
  createMongoAttestationStore,
  createRedisAttestationStore,
  createRequestAttestationMiddleware,
  createSignerBundleRouter,
  createStaticKeyProvider,
  generateAttestationKey,
} from '@web-ts-toolkit/express-request-attestation';
```

```ts
// Browser: WebCrypto signer, module client, prepared fetch. Never imports
// Express, Redis, MongoDB, Buffer, or node:*.
import {
  createRequestSigner,
  createSignerClient,
  fetchWithAttestation,
} from '@web-ts-toolkit/express-request-attestation/signer';
```

Only `.` and `./signer` are public. No default exports and no deep
`src/*` or `dist/*` imports.

### Backend quickstart (guard + capture + assets)

Complete parser/capture/guard/asset wiring. Mount the guard on selected API
routes only; asset, preflight, OIDC navigation, callback, and backchannel
routes stay reachable under their own policies.

```ts
import express from 'express';
import {
  createAttestationBodyCapture,
  createMemoryAttestationStore,
  createRequestAttestationMiddleware,
  createSignerBundleRouter,
  createStaticKeyProvider,
  generateAttestationKey,
} from '@web-ts-toolkit/express-request-attestation';

const publicOrigin = 'https://api.example.com';
const replayNamespace = 'my-app-prod';
const maxBodyBytes = 1024 * 1024;
const now = Date.now();
const entry = generateAttestationKey('v1-20261002-01', {
  acceptFrom: now - 60_000,
  acceptUntil: now + 3_600_000,
});
const keyProvider = createStaticKeyProvider({ currentKeyId: entry.keyId, keys: [entry] });
const store = createMemoryAttestationStore();
const capture = createAttestationBodyCapture({ maxBodyBytes });
const guard = createRequestAttestationMiddleware({
  publicOrigin,
  replayNamespace,
  keyProvider,
  store,
});

const app = express();
app.use('/attestation', createSignerBundleRouter({ publicOrigin, replayNamespace, keyProvider }));
app.use(express.json({ limit: maxBodyBytes, verify: capture.verify as never, inflate: false }));
app.use(capture.errorHandler as never);
app.post('/api/submit', guard as never, (_req, res) => {
  res.json({ ok: true });
});

export { app };
```

Parser and wrapper limits must match (`maxBodyBytes`, default 1 MiB, hard
cap 16 MiB). Always use `inflate: false` so signed bytes and captured bytes
are the same representation. V1 accepts identity or absent
`Content-Encoding` only; compression is rejected. An actually empty request
uses SHA-256 of zero bytes. A nonempty body whose parser failed to capture
it is `500 ATTESTATION_BODY_CAPTURE_REQUIRED`, not the empty digest.

### Public keyring provisioning

One public keyring example. Provisioning is application-owned (cron, KMS, or
config); the library performs explicit atomic replacement with no polling
timer and no hardcoded grace policy.

```ts
import { createRotatingKeyProvider, generateAttestationKey } from '@web-ts-toolkit/express-request-attestation';

const now = Date.now();
const oldEntry = generateAttestationKey('v1-20261002-01', {
  acceptFrom: now - 60_000,
  acceptUntil: now + 3_600_000,
});
const provider = createRotatingKeyProvider({ currentKeyId: oldEntry.keyId, keys: [oldEntry] });

const nextEntry = generateAttestationKey('v1-20261003-01', {
  acceptFrom: now,
  acceptUntil: now + 3_600_000,
});
provider.replace({ currentKeyId: nextEntry.keyId, keys: [oldEntry, nextEntry] });

export { provider };
```

Snapshots are owned and copy-isolated (max 16 keys). `currentKeyId` must
name a present entry. Key IDs are unique across provisioning history:
providers reject remapping a retained ID to different bytes or a different
acceptance interval. Generate unique version/random IDs and never reintroduce
a retired ID with different material. Rejected replacements leave the previous
valid snapshot intact.

### Redis store wiring

Structural injection only. The library never creates, connects, or closes
clients and never imports a Redis driver.

```ts
import { createClient } from 'redis';
import {
  createRedisAttestationStore,
  createStaticKeyProvider,
  generateAttestationKey,
} from '@web-ts-toolkit/express-request-attestation';

const now = Date.now();
const entry = generateAttestationKey('v1-redis-01', {
  acceptFrom: now - 60_000,
  acceptUntil: now + 3_600_000,
});
const keyProvider = createStaticKeyProvider({ currentKeyId: entry.keyId, keys: [entry] });
const client = createClient({ url: 'redis://127.0.0.1:6379' });
await client.connect();
const store = createRedisAttestationStore({ client, keyPrefix: 'wtt-attestation', maxEntries: 50000 });

export { client, keyProvider, store };
```

One same-slot sorted set per shared prefix holds opaque replay keys with
absolute `retainUntil` scores. All clients sharing a prefix must configure
identical `maxEntries`. Size the ledger as unique accepted requests per second
times maximum retention plus headroom; actual Redis memory and throughput
require measurement. Use a dedicated `noeviction` deployment when relying on
window-wide admission history: eviction, restore, state loss, or failover can
erase replay reservations. Client lifecycle stays caller-owned.

### Mongo store wiring

Structural injection only. The library never creates, connects, or closes
clients and never imports a MongoDB driver. Production deployments require
a replica set (transactions).

```ts
import { MongoClient } from 'mongodb';
import {
  createMongoAttestationStore,
  createStaticKeyProvider,
  generateAttestationKey,
} from '@web-ts-toolkit/express-request-attestation';

const now = Date.now();
const entry = generateAttestationKey('v1-mongo-01', {
  acceptFrom: now - 60_000,
  acceptUntil: now + 3_600_000,
});
const keyProvider = createStaticKeyProvider({ currentKeyId: entry.keyId, keys: [entry] });
const client = new MongoClient('mongodb://127.0.0.1:27017/?replicaSet=rs0');
await client.connect();
const store = createMongoAttestationStore({
  db: client.db('app-attestation'),
  proofsCollectionName: 'attestation_proofs',
  capacityCollectionName: 'attestation_replay_capacity',
  maxEntries: 50000,
});

export { client, keyProvider, store };
```

One proof collection with unique `_id`s plus a separate non-TTL
capacity/accounting collection with one shared capacity row holds opaque
replay keys with absolute `retainUntilMs` deadlines. Each admission runs one
snapshot transaction: duplicate check, bounded expiry reclaim (the requested
expired entry plus at most 64 expired entries), capacity check, then insert.
Duplicates return `'duplicate'` even when full and never extend expiry; no
live entry is ever evicted. Do not rely on a TTL index for correctness;
create a non-TTL index on `retainUntilMs` (for example
`{ kind: 1, retainUntilMs: 1 }` on the capacity collection) and never add a
TTL index to the accounting collection.

All clients sharing one database/collections must configure identical
`maxEntries` (default 50000, positive safe integer) and synchronized clocks
within the configured `clusterClockGuardMs`; an invalid clock fails closed
without touching the database. Global retention is capped at 240000 ms
without truncation. Size the ledger as unique accepted requests per second
times maximum retention plus headroom; each admission costs one snapshot
transaction and actual MongoDB memory and throughput require measurement on
your deployment. Capacity throws the shared `AttestationCapacityError`;
transport, topology, transaction, and malformed-row failures throw the narrow
`AttestationMongoStoreError` mapped to `ATTESTATION_REPLAY_UNAVAILABLE`;
malformed inputs throw `AttestationProtocolError` without touching the
database. Client lifecycle stays caller-owned (connect/close the
`MongoClient` in application code).

When to choose a store: memory for a single instance with no shared state;
Redis for high-throughput shared replay with server `TIME`; MongoDB when
deployments already run a replica set and prefer shared replay without
operating Redis, accepting one transaction per admission.

### Bearer-auth composition

Tested composition. The guard never sets `req.auth`, never enrolls or
validates a DPoP binding, and never rewrites authentication. Every auth retry
re-signs via a fresh wrapper call.

```ts
import express from 'express';
import {
  createAttestationBodyCapture,
  createMemoryAttestationStore,
  createRequestAttestationMiddleware,
  createStaticKeyProvider,
  generateAttestationKey,
} from '@web-ts-toolkit/express-request-attestation';

const publicOrigin = 'https://api.example.com';
const replayNamespace = 'my-app-prod';
const maxBodyBytes = 1024 * 1024;
const now = Date.now();
const entry = generateAttestationKey('v1-bearer-01', {
  acceptFrom: now - 60_000,
  acceptUntil: now + 3_600_000,
});
const keyProvider = createStaticKeyProvider({ currentKeyId: entry.keyId, keys: [entry] });
const store = createMemoryAttestationStore();
const capture = createAttestationBodyCapture({ maxBodyBytes });
const guard = createRequestAttestationMiddleware({ publicOrigin, replayNamespace, keyProvider, store });

function requireBearerAuth(req: express.Request, res: express.Response, next: express.NextFunction): void {
  if (req.headers.authorization !== 'Bearer good-token') {
    res.status(401).json({ code: 'UNAUTHORIZED' });
    return;
  }
  next();
}

const app = express();
app.use(express.json({ limit: maxBodyBytes, verify: capture.verify as never, inflate: false }));
app.use(capture.errorHandler as never);
app.post('/api/submit', guard as never, requireBearerAuth, (_req, res) => {
  res.json({ ok: true });
});

export { app, requireBearerAuth };
```

Mount an OIDC vault router once at its own base path (for example
`basePath: '/auth/oidc'`); never double-prefix. The guard applies only to
selected API routes. DPoP composition uses existing public vault APIs through
the same selected-route pattern. Fingerprint or recognition collection is not
implemented by this package.

### Frontend quickstart (signer client + prepared fetch)

Same-origin default. Caller JSON objects are not valid Fetch bodies: callers
stringify first. The wrapper materializes those exact bytes once, signs them,
and reuses them verbatim for the single stale-key retry (multipart
boundaries preserved).

```ts
import { createSignerClient, fetchWithAttestation } from '@web-ts-toolkit/express-request-attestation/signer';

const apiOrigin = 'https://api.example.com';
const replayNamespace = 'my-app-prod';
const signerClient = createSignerClient({
  metadataUrl: `${apiOrigin}/attestation/signer-meta`,
  apiOrigin,
  replayNamespace,
});

const response = await fetchWithAttestation(
  `${apiOrigin}/api/submit`,
  {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ hello: 'world' }),
  },
  { signerClient, apiOrigin, replayNamespace },
);

export { response, signerClient };
```

Only the configured `apiOrigin` is signed; external URLs fail locally without
sending `Authorization` or a signature. Explicit `credentials` are preserved
(native default `same-origin`, never defaulted to `include`). Signed attempts
use `redirect: 'manual'` and never forward a signature. Exactly one automatic
retry, only on `403` plus `X-Attestation-Error: stale-key`; expired, future,
replay, invalid proofs, `5xx`, auth failures, redirects, and network
uncertainty never retry. A second stale challenge stops. Returned responses
remain readable and retries never reuse the old envelope.

Body profile: finite `BodyInit` plus replayable `Request`s within
`maxBodyBytes` (default 1 MiB, hard cap 16 MiB) and a bounded read deadline
(default 5000 ms). `FormData` is serialized through a `Request` once;
streaming uploads and non-identity `Content-Encoding` are rejected locally.

## Signer assets and caching

`createSignerBundleRouter` returns a relative router mounted by the
application at a configured base path (default `/attestation`). Routes:
`GET /signer-meta`, `GET /signer.<contenthash>.mjs`, and
`GET /runtime.<contenthash>.mjs`. Metadata is bounded JSON
(`{ version: 1, keyId, signerUrl, publicOrigin, replayNamespace }`) with
`no-store`; it serves the current active key only and contains no
session or user credential.

The key-specific ESM wrapper imports `createRequestSigner` from the
content-addressed runtime module and exports `signer`. The runtime is the
packaged browser `signer.mjs`, so route assets and the npm browser entry
share the codec and signer source. The 64-hex content hash identifies exact
immutable bytes; never serve different content from the same URL. Assets are
public, served as JavaScript with `nosniff`, cacheable with `immutable`
(runtime cap 512 KiB, key module cap 8 KiB). Unknown hashes return `404`;
syntactically valid but not retained hashes return `410`; neither redirects
to latest. CORS and CSP stay application-configured.

`fetchSignerBundle` uses bounded metadata (4096-byte cap) with noncached,
credential-omitting, redirect-rejecting defaults, validates origin, namespace,
and version, and loads via native dynamic `import()` (default loader) for a
URL on the configured API origin. `createSignerClient` owns at most one
active signer and one in-flight load (single-flight, no cross-tab claim) with
generation-aware `invalidate(observedKeyId)` and terminal `dispose()`. A
metadata-to-module retirement race may refetch discovery once; repeated
failure stops. Native import caching cannot be erased by invalidation; do not
claim keys live for only milliseconds.

## Time policy

```text
reject future proof if timestampMs > nowMs + clockSkewMs
timeDeadline = timestampMs + maxAgeMs + clockSkewMs
proofDeadline = min(timeDeadline, acceptedKey.acceptUntil)
reject when nowMs >= proofDeadline or acceptedKey is not active at nowMs
retainUntil = proofDeadline + clusterClockGuardMs
```

Defaults: `maxAgeMs 30000` (1000–120000), `clockSkewMs 5000` (0–30000),
`clusterClockGuardMs 5000` (0–30000). The last is the declared maximum
pairwise clock difference between verifiers and replay stores, not an extra
freshness allowance. Maximum remaining retention at a verifier is
`maxAgeMs + 2 * clockSkewMs + clusterClockGuardMs` (default at most 45000 ms);
the store admission bound adds one more guard (default at most 50000 ms,
global cap 240000 ms). Retain through the whole acceptance period; do not
clamp, slide on duplicate, or use a different Redis formula. Repeat the
time and deadline check after async provider work, immediately before
reservation, and before calling the handler after reservation.

Replay key: `att:v1:` plus SHA-256 of `[replayNamespace, publicOrigin,
nonceHex]`. It carries no instance ID, path, token, session, or key ID, so
nonce single-use spans accepted rotations in one protection space. Distinct
applications use distinct namespaces or origins.

Default header: `x-client-transaction-id` (valid HTTP token, no auth, cookie,
host, origin, body-metadata, or response-marker collision). One incoming
signature field only; duplicates and comma-joined presentations are rejected.
Limits: encoded ID 1024 bytes, canonical request target 8192 bytes, content
type 256 bytes, namespace `[A-Za-z0-9_-]{1,128}`, canonical public origin 512
bytes, opaque replay keys 1–256 printable ASCII bytes. `publicOrigin` is
required, static, canonical HTTP(S) (HTTPS except loopback); never derive it
from `Host`, `Forwarded`, or `X-Forwarded-*`.

## Errors

All verifier failures use fixed `{ code, message }` JSON with
`Cache-Control: no-store`. No raw key, nonce, signature, body, provider
error, or requested key ID is echoed. Only a pre-handler stale-key rejection
adds `X-Attestation-Error: stale-key`.

| HTTP | Code                                | Fixed message                                                     |
| ---- | ----------------------------------- | ----------------------------------------------------------------- |
| 403  | `ATTESTATION_MISSING`               | Request signature is required.                                    |
| 403  | `ATTESTATION_MALFORMED`             | Request signature is invalid.                                     |
| 403  | `ATTESTATION_STALE_KEY`             | Request signing key is no longer accepted.                        |
| 403  | `ATTESTATION_EXPIRED`               | Request signature has expired.                                    |
| 403  | `ATTESTATION_FUTURE`                | Request signature timestamp is ahead of the allowed clock window. |
| 403  | `ATTESTATION_INVALID_SIGNATURE`     | Request signature does not match.                                 |
| 403  | `ATTESTATION_REPLAY`                | Request signature was already used.                               |
| 413  | `ATTESTATION_BODY_TOO_LARGE`        | Request body exceeds the configured byte limit.                   |
| 415  | `ATTESTATION_UNSUPPORTED_ENCODING`  | Request body encoding is unsupported.                             |
| 500  | `ATTESTATION_BODY_CAPTURE_REQUIRED` | Request body capture is not configured.                           |
| 500  | `ATTESTATION_INTERNAL_ERROR`        | Request signature verification failed.                            |
| 503  | `ATTESTATION_KEYS_UNAVAILABLE`      | Request signing keys are unavailable.                             |
| 503  | `ATTESTATION_REPLAY_UNAVAILABLE`    | Request replay protection is unavailable.                         |

Unknown or inactive well-formed key IDs select `STALE_KEY`; a known active
key with an elapsed timestamp selects `EXPIRED`. Provider snapshot failure
selects `KEYS_UNAVAILABLE`, never an unknown-key result.

## Rotation runbook

Finite acceptance is application-configured, never automatically
`2 × rotation interval`:

1. Prepare new material on **all** verifiers.
2. Publish current metadata and module.
3. Retain old material to its explicit deadline for overlap.
4. Retire only after overlap requirements are met.

Do not make one instance the authoritative random-key generator for an
uncoordinated cluster. Before dropping assets needed by published metadata,
account for the one bounded refetch-on-retirement client behavior. Do not
increase lifetime, skew, or guard for already-live proofs without first
retaining their replay state through the longer window or waiting for the old
profile to expire.

## Runtime requirements

- **Node** `>= 22` (see `engines`).
- **Browser**: a secure context with `TextEncoder`/`TextDecoder`,
  `crypto.subtle` (HMAC-SHA-256, non-extractable keys), and
  `crypto.getRandomValues`, feature-detected on use. Real Chromium is
  exercised in `test:browser`; jsdom alone is not evidence. No specific
  historical browser versions are claimed.
- **CORS/CSP** (application-configured): allow the configured signature field
  plus actual `Content-Type`, `Authorization`, or DPoP headers as needed;
  expose `X-Attestation-Error` so the wrapper can see the retry marker; allow
  credentialed origins only when explicitly using `credentials: 'include'`.
  Native module imports require `script-src` plus CORS for the public module
  URLs. Same-origin uses the native default; cross-origin deployments
  explicitly configure CORS for metadata and module fetches (which use
  `cache: no-store`, `credentials: omit`, `redirect: error`).

## Verification commands

From the repository root:

```sh
pnpm --filter @web-ts-toolkit/express-request-attestation... build
pnpm --filter @web-ts-toolkit/express-request-attestation typecheck
pnpm --filter @web-ts-toolkit/express-request-attestation test:node
pnpm --filter @web-ts-toolkit/express-request-attestation test:redis
pnpm --filter @web-ts-toolkit/express-request-attestation test:mongo
pnpm --filter @web-ts-toolkit/express-request-attestation test:browser
pnpm --filter @web-ts-toolkit/express-request-attestation test:packed-consumer
pnpm --filter @web-ts-toolkit/express-request-attestation exec npm pack --dry-run --json
pnpm --filter @web-ts-toolkit/express-request-attestation test
```

`pnpm test` builds once, then runs Node, live Redis, live MongoDB, browser,
and tarball lanes serially (AGENTS.md serial-build rule). Prerequisites:
Docker for isolated Redis 6.2/7.2 tests, a MongoDB replica-set binary
download (registry/network) for the live `test:mongo` lane, installed
Playwright Chromium, and registry access for fresh tarball consumers. A
missing prerequisite blocks that lane instead of silently passing it.
