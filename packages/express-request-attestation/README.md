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

Backend consumers need Node `>=22` and install Express explicitly (optional
peer `>=5`). TypeScript backend consumers also install `@types/express` v5
and `@types/node`: the root declarations expose Express's router type. Redis
and MongoDB are caller-injected through structural types; install a driver
only when using that store.

```sh
# Backend (Express >= 5 required at runtime)
pnpm add @web-ts-toolkit/express-request-attestation express
# Backend TypeScript declarations
pnpm add -D typescript @types/express@^5 @types/node
# Browser-only (no Express, Redis, MongoDB, or Node types needed)
pnpm add @web-ts-toolkit/express-request-attestation
# With shared Redis replay state (backend only)
pnpm add redis
# With shared MongoDB replay state (backend only, replica set required)
pnpm add mongodb
```

The backend examples compile with `strict: true`, `skipLibCheck: false`, and
`esModuleInterop: true`. Browser consumers use ES2022 + DOM/DOM.Iterable
libraries; the `/signer` declarations also compile with `types: []`.

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
const guard: express.RequestHandler = createRequestAttestationMiddleware({
  publicOrigin,
  replayNamespace,
  keyProvider,
  store,
});
const parser: express.RequestHandler = express.json({
  limit: maxBodyBytes,
  verify: capture.verify,
  inflate: false,
});
const captureErrorHandler: express.ErrorRequestHandler = capture.errorHandler;

const app = express();
app.use('/attestation', createSignerBundleRouter({ publicOrigin, replayNamespace, keyProvider }));
app.use(parser);
app.use(captureErrorHandler);
app.post('/api/submit', guard, (_req, res) => {
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

Use the same `capture.verify` with `express.urlencoded`, `express.text`, or
`express.raw` for the body types your routes accept. For exact multipart
bytes, capture with `express.raw({ type: 'multipart/*', ... })` before your
application's multipart interpretation. Do not reconstruct a digest from
parsed JSON or trust a client-provided digest. The capture error handler
maps parser size/encoding failures to fixed 413/415 responses and forwards
other parser errors to the application's error handling.

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
absolute `retainUntilMs` scores. All clients sharing a prefix must configure
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
const db = client.db('app-attestation');
const proofsCollectionName = 'attestation_proofs';
const capacityCollectionName = 'attestation_replay_capacity';
// Provision before accepting traffic. No expireAfterSeconds: this is NOT a TTL index.
await db
  .collection(capacityCollectionName)
  .createIndex({ kind: 1, retainUntilMs: 1 }, { name: 'attestation_reservation_expiry' });
const store = createMongoAttestationStore({
  db,
  proofsCollectionName,
  capacityCollectionName,
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
live entry is ever evicted. MongoDB supplies the unique `_id` indexes; the
compound non-TTL index above supports bounded expiry lookup and sorting.
The application owns index provisioning/readiness: the store constructor
performs no database I/O and does not create indexes. `retainUntilMs` is
numeric epoch milliseconds. Do not rely on TTL cleanup for correctness and
never add a TTL index to the capacity/accounting collection or independently
delete its live rows.

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
Redis for shared replay with atomic Lua admission and server `TIME`; MongoDB when
deployments already run a replica set and prefer shared replay without
operating Redis, accepting one transaction per admission.

### Dependency deadlines and ownership

The guard and asset router bound each asynchronous dependency wait with
`operationTimeoutMs` (default 5000 ms, integer range 1–60000). This is a
**waiting bound**, not cancellation of provider work, Redis commands, MongoDB
transactions/retries, or session cleanup. A late reservation may commit;
the timed-out request never resumes its handler or releases that reservation.
No store failure falls back to process-local memory.

Configure connection/server-selection, socket/command, pool-wait, and
transaction/commit deadlines at the injected driver/provider boundary, with
bounded retry and concurrency policies appropriate to the deployment.
Direct `store.reserve()` calls have no package-level wait timeout. The caller
owns client connection, error listeners, readiness, and shutdown; the Mongo
adapter owns its per-admission session but does not bound driver cleanup.
Database persistence, failover, and restore settings must meet the application's
replay-history requirements; losing live replay state can admit an old proof
again while it is still valid.

### Bearer-auth composition

The guard never sets `req.auth`, never enrolls or validates a DPoP binding,
and never rewrites authentication. Public HMAC material authenticates neither
a caller nor a session. The small bearer check below illustrates middleware
ordering; replace it with your application's actual token/session validation.

Putting **auth before the guard** avoids replay allocation for requests auth
rejects. Putting the guard first can reject bad proofs before expensive auth
work, but a valid public-HMAC proof reserves replay capacity even if auth later
rejects. Choose the ordering deliberately; captured body bytes must be
available before the guard in either case. This example runs auth first.

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
const guard: express.RequestHandler = createRequestAttestationMiddleware({
  publicOrigin,
  replayNamespace,
  keyProvider,
  store,
});
const parser: express.RequestHandler = express.json({
  limit: maxBodyBytes,
  verify: capture.verify,
  inflate: false,
});
const captureErrorHandler: express.ErrorRequestHandler = capture.errorHandler;

function requireBearerAuth(req: express.Request, res: express.Response, next: express.NextFunction): void {
  if (req.headers.authorization !== 'Bearer good-token') {
    res.status(401).json({ code: 'UNAUTHORIZED' });
    return;
  }
  next();
}

const app = express();
app.use(parser);
app.use(captureErrorHandler);
app.post('/api/submit', requireBearerAuth, guard, (_req, res) => {
  res.json({ ok: true });
});

export { app, requireBearerAuth };
```

Mount an OIDC vault router once at its own base path (for example
`basePath: '/auth/oidc'`); never double-prefix. The guard applies only to
selected API routes. DPoP composition uses existing public vault APIs through
the same selected-route pattern. Fingerprint or recognition collection is not
implemented by this package.

Every application auth retry makes a **fresh `fetchWithAttestation` call**
and obtains a fresh proof; a finite caller-owned `Request` can be reused as
described below. The wrapper does not automatically retry 401/DPoP challenges.
For business retries after a lost response or handler failure, persist an
application idempotency key bound to the authenticated actor and operation,
atomically with the business effect. A new nonce alone can execute the same
operation again. Auth, authorization, CSRF policy, and durable business
idempotency remain application responsibilities.

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

### Request reuse, abort, and response ownership

With a standard same-realm `Request`, an omitted, `undefined`, or `null`
`init.body` **inherits** its body (`null` does not remove it). The wrapper
clones that body synchronously before reading, so finite POST requests support
repeated and concurrent calls and the original Request remains readable.
Start inherited-body calls before the caller uses, locks, or cancels its body;
already-used/locked inherited bodies fail with `SIGNER_PREPARATION_FAILED`.
Native cloning can replace the Request's internal stream: reuse applies to
the original Request's current body, not a previously retained raw stream
reference. Native tees may buffer an unread caller branch outside this
library's reader-owned byte limit.

A non-null `init.body`, including `''` or zero bytes, **replaces** the body.
An independent replacement leaves the original body alone even if the
original is used/locked. An explicitly supplied `ReadableStream` transfers
reading/cancellation ownership after native Request construction succeeds;
this includes an explicit alias of the original's body and is consumptive.
Construction failure leaves an unaccepted explicit stream caller-owned.
`init.mode` is sampled once before `init.body`, which is also sampled once.
Other options follow native Fetch precedence: `init.headers` replaces rather
than merges inherited headers, and a nonempty init resets inherited
`referrerPolicy` unless supplied explicitly. Body overrides inherit Content-Type
unless you replace the headers. When overriding with `FormData`, supply headers
without the old/manual Content-Type so Fetch generates the new multipart boundary.

The first stale Response stays unconsumed and unlocked until a valid retry
Request is built. Reload, signing, retry-construction/proof-retention failure,
or a repeated envelope returns that **same readable first Response**.
Only after choosing the retry is the abandoned first body cancelled, without
awaiting producer cleanup. Cancellation rejection is observed; cancellation
does not guarantee producer, native tee, or connection cleanup has finished.
Once dispatched, a retry transport failure propagates and there is no third
attempt or fallback to the abandoned response.

During body reading or initial/replacement signer waiting, caller abort
rejects with the caller's exact reason and abandons only this invocation's
owned bodies. The shared signer client remains caller-owned and usable;
the wrapper never disposes it or cancels native module/crypto execution.
Native Fetch (or the injected `fetch`) owns dispatched request readers and
must honor the forwarded signal. There is no new API transport deadline;
use the request signal and an application retry policy for that boundary.
`materializeRequestBodyBytes` is a lower-level **consuming** helper: clone its
input yourself if you need reuse.

### Browser transport and body bounds

Effective `mode: 'no-cors'` is unsupported because it cannot carry the proof.
Omitted/undefined mode inherits the Request's mode or native default;
explicit `cors` or `same-origin` can override it. Choose a browser-writable
proof header such as `x-client-transaction-id` or `x-request-proof`.
The wrapper applies these browser constraints even with an injected transport
or under Node. Statically incompatible modes/names fail before body ownership,
signer loading, or API calls. Every constructed signed Request is also checked
for the exact proof; a stripped, normalized, replaced, or appended proof never
reaches transport on that attempt.

In addition to shared HTTP token/length/reserved-name rules, the wrapper rejects
case-insensitive `sec-*`/`proxy-*`, `Accept-Charset`, `Accept-Encoding`,
`Access-Control-Request-Headers`, `Access-Control-Request-Method`, `Connection`,
`Cookie2`, `Date`, `DNT`, `Expect`, `Keep-Alive`, `Referer`, `TE`, `Trailer`,
`Upgrade`, `Via`, and `User-Agent`. These browser-only failures and `no-cors`
use `SignerClientError` / `SIGNER_PREPARATION_FAILED`; malformed/reserved names
already rejected by shared validation use `AttestationProtocolError`.
Server HTTP header validation remains separate. Ordinary custom names and
the three method-override fields (`X-HTTP-Method`, `X-HTTP-Method-Override`,
`X-Method-Override`) accept real envelopes, subject to the final Request check.

Body profile: finite `BodyInit` plus replayable `Request`s within
`maxBodyBytes` (default 1 MiB, hard cap 16 MiB) and a bounded read deadline
(wrapper option `bodyReadTimeoutMs`, default 5000 ms, integer range 1–60000).
`materializeRequestBodyBytes` calls the same deadline option `timeoutMs`.
`FormData` is serialized through a `Request` once. Finite byte streams must
finish within both bounds; unbounded/stalled uploads and non-identity
`Content-Encoding` are rejected locally.

Body and discovery readers check the cap before copying an overflowing chunk,
discard empty chunks, and coalesce tiny chunks into geometrically grown byte
storage. Configured read deadlines are checked between reads, and all readers
yield periodically to allow caller-abort/deadline tasks to run. Limit/deadline
failures are local `SignerClientError`s
(`SIGNER_PREPARATION_FAILED` for bodies); body caller-abort preserves the abort
reason. Failure signals cancellation, observes its rejection without awaiting
producer cleanup, and releases the reader lock, timers, and abort listener.
The storage bound applies to reader-owned bytes, not producer/browser queues.

## Signer assets and caching

`createSignerBundleRouter` returns a relative router mounted by the
application at a configured base path (default `/attestation`). Routes:
`GET /signer-meta`, `GET /signer.<contenthash>.mjs`, and
`GET /runtime.<contenthash>.mjs`. Metadata is bounded JSON
(`{ version: 1, keyId, signerUrl, publicOrigin, replayNamespace }`) with
`no-store`; it serves the current active key only and contains no
session or user credential.

The application must mount the router at its configured `basePath`:

| `basePath`               | `publicPathPrefix` | Application mount                 | External metadata path       |
| ------------------------ | ------------------ | --------------------------------- | ---------------------------- |
| `/attestation` (default) | omitted            | `app.use('/attestation', router)` | `/attestation/signer-meta`   |
| `/`                      | omitted            | `app.use('/', router)`            | `/signer-meta`               |
| `/`                      | `/prefix`          | `app.use('/', router)`            | `/prefix/signer-meta`        |
| `/custom`                | omitted            | `app.use('/custom', router)`      | `/custom/signer-meta`        |
| `/custom`                | `/prefix`          | `app.use('/custom', router)`      | `/prefix/custom/signer-meta` |

At the root mount, the sibling assets are `/signer.<hash>.mjs` and
`/runtime.<hash>.mjs`, or `/prefix/signer.<hash>.mjs` and
`/prefix/runtime.<hash>.mjs` behind that stripped prefix. The key module's
`./runtime.<hash>.mjs` import resolves beside it. `publicPathPrefix` describes
a prefix already stripped by the upstream proxy; the caller configures that
proxy and mounts only the internal base path. Published URLs come from trusted
configuration, never request headers. This asset URL join does not normalize
signed request paths: duplicate slashes, percent-escape spelling, and query
order remain significant.

Discovery validates `now()` before provider work and again after copying its
returned snapshot. Each value must be nonnegative safe-integer epoch
milliseconds. The current key must satisfy `acceptFrom <= nowMs < acceptUntil`
at the post-read clock; a retained alternate key is not substituted. Inactive
or missing current keys, provider errors, malformed snapshots, and provider
timeouts return fixed `503 ATTESTATION_KEYS_UNAVAILABLE`; invalid/throwing
clocks return `500 ATTESTATION_INTERNAL_ERROR`. Both use `no-store` and no
stale-key retry marker.

The key-specific ESM wrapper imports `createRequestSigner` from the
content-addressed runtime module and exports `signer`. The runtime is the
packaged browser `signer.mjs`, so route assets and the npm browser entry
share the codec and signer source. The 64-hex content hash identifies exact
immutable bytes; never serve different content from the same URL. Assets are
public, served as JavaScript with `nosniff`, cacheable with `immutable`
(runtime cap 512 KiB, key module cap 8 KiB). Malformed asset paths/hashes return `404`;
syntactically valid but not retained hashes return `410`; neither redirects
to latest. CORS and CSP stay application-configured.

`fetchSignerBundle` reads metadata incrementally (4096-byte cap) with noncached,
credential-omitting, redirect-rejecting defaults, validates origin, namespace,
and version, and loads via native dynamic `import()` (default loader) for a
URL on the configured API origin. Injected fetch implementations must return
a standard `Response` with a readable byte body; `arrayBuffer()`/`text()`-only
substitutes are rejected because they cannot enforce the incremental cap.

Standalone `fetchSignerBundle` has a fixed **5000 ms response-body read
deadline**, starting when the accepted metadata response arrives and reading
begins. It excludes waiting for response headers and importing/evaluating the
module. Its `signal` propagates to native discovery fetch and body reading;
metadata read/limit/abort failures reject with `SIGNER_LOAD_FAILED`.

`createSignerClient` owns at most one active signer and one in-flight load
(single-flight, no cross-tab claim) with
generation-aware `invalidate(observedKeyId)` and terminal `dispose()`. Its
`loadTimeoutMs` (default 5000 ms, integer range 1–60000) bounds the **whole load**:
waiting for discovery headers, body reading, module import, and the one
retirement refetch. Client metadata has no additional fixed 5000 ms read limit.
Whole-load expiry rejects with `SIGNER_LOAD_TIMEOUT` and signals metadata
cancellation. Pending replacements, including explicit recovery after a failed
replacement, share challenges from **any older issued key**, even multiple
rotations behind: a late K1 challenge cannot evict the pending K3 replacement
for K2. An installed newer key survives old-key challenges; a newly installed
signer can be invalidated again even with the same key ID. Initial-load
invalidation is supported and malformed observed key IDs are ignored.

A metadata-to-module retirement race may refetch discovery once. Recovery
compares validated `(keyId, absolute module URL)` identity: a changed URL can
recover under the same key, while equivalent URLs count as unchanged. Unchanged
identity or a second module failure ends that load; a later explicit
`getSigner()` can recover. This does not add API transport retries.
Timeout stops waiting; terminal `dispose()` signals the current metadata fetch
and prevents late installation. Obsolete loads cannot alter a replacement.
Neither operation cancels native module evaluation or erases its cache.
`createRequestSigner` also shares lazy WebCrypto key import: concurrent failure
rejects with `SignerClientError`, clears that failed import, and permits a later
explicit sign to retry. Public material may remain in the native module cache.

## Time policy

```text
reject future proof if timestampMs > nowMs + clockSkewMs
timeDeadlineMs = timestampMs + maxAgeMs + clockSkewMs
proofDeadlineMs = min(timeDeadlineMs, acceptedKey.acceptUntil)
reject when nowMs >= proofDeadlineMs or acceptedKey is not active at nowMs
retainUntilMs = proofDeadlineMs + clusterClockGuardMs
```

Defaults: `maxAgeMs 30000` (1000–120000), `clockSkewMs 5000` (0–30000),
`clusterClockGuardMs 5000` (0–30000). The last is the declared maximum
pairwise clock difference between verifiers and replay stores, not an extra
freshness allowance. Maximum remaining retention at a verifier is
`maxAgeMs + 2 * clockSkewMs + clusterClockGuardMs` (default at most 45000 ms).
A store clock trailing that verifier by one guard can observe at most
`maxAgeMs + 2 * clockSkewMs + 2 * clusterClockGuardMs` (default 50000 ms).
Built-in stores enforce the global 240000 ms ceiling; they receive absolute
deadlines, not a policy registry. Verifiers must derive the exact policy
deadline. Retain through the whole acceptance period; do not clamp, slide on
duplicate, or use a different Redis formula. Repeat the time/deadline check
after async provider work, immediately before reservation, and before calling
the handler after reservation.

**One protection space requires one time policy.** All verifiers for the same
`(publicOrigin, replayNamespace)`, including guards on different routes, must
share replay state and identical `maxAgeMs`, `clockSkewMs`, and
`clusterClockGuardMs`. Every accepted key ID must have identical bytes,
`acceptFrom`, and `acceptUntil` across those verifiers. Keep verifier/store
clocks within the declared pairwise guard (Redis uses server `TIME`; memory
and Mongo use their configured app clock). Shared capacity settings must also
match. A short-policy verifier can otherwise discard a nonce while a
long-policy verifier still accepts its proof; shared storage alone cannot
repair heterogeneous policies. Custom stores receive the absolute
`reserve({ replayKey, retainUntilMs })` deadline, not a relative TTL.

For a live policy migration, provision a **new `replayNamespace` and fresh key
IDs**, deploy matching signer/client and guard configuration together, and
keep any draining old namespace uniformly on its old policy and shared replay
ledger. Retain old replay state through the last possible old `retainUntilMs`
(including future-skew and clock-guard allowances), then retire that protection
space. Namespace changes require new client configuration; stale-key reload
alone does not change the client's pinned namespace. Do not rolling-mix policy
values in one space, extend the acceptance interval of a live key ID, or
reinterpret existing reservations under a longer window. Duplicate admission
never extends retention, and the built-in stores offer no migration API to
retroactively recover expired replay history.

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

The guard rejects missing/empty proofs as `403 ATTESTATION_MISSING` and
duplicate, comma-joined, oversized, or noncanonical proofs as
`403 ATTESTATION_MALFORMED` before provider/replay/handler work, even if the
provider is unavailable. The 1024-byte envelope cap is checked before UTF-8
allocation. Canonical envelopes cannot start with a UTF-8 BOM. Raw duplicate
`Content-Type` fields are malformed even when identical; commas inside a
single field are preserved.

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
selects `KEYS_UNAVAILABLE`, never an unknown-key result. This includes provider
throws/rejections (even typed stale/expired errors), timeouts, malformed
snapshots, and throwing snapshot accessors: all use the fixed 503 message and
never carry the stale marker. Clock, body, and replay-store failures keep their
separate codes above.

## Rotation runbook

Finite acceptance is application-configured, never automatically
`2 × rotation interval`:

1. Prepare new material on **all** verifiers.
2. Publish current metadata and module.
3. Retain old material to its explicit deadline for overlap.
4. Retire only after overlap requirements are met.

Do not make one instance the authoritative random-key generator for an
uncoordinated cluster. Before dropping assets needed by published metadata,
account for the one bounded refetch-on-retirement client behavior. For policy
changes follow the protection-space migration above; extending old key
deadlines or mixing lifetime/skew/guard values is not a rotation strategy.

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
  URLs, and `connect-src` must allow metadata/API fetches. Configure actual
  origins/methods and let OPTIONS preflight reach the CORS handler before the
  attestation guard. Missing marker exposure leaves the first 403 visible but
  prevents stale-key retry. Discovery fetch uses `cache: no-store`,
  `credentials: omit`, `redirect: error`; native dynamic imports follow browser
  module-fetch/cache rules, not those injected fetch options. Serve both key
  and runtime modules with suitable CORS, permit their origins in CSP, and do
  not redirect modules to other origins.

## Compatibility notes

The v1 MAC tuple, named exports, two entrypoints, and absolute `retainUntilMs`
reservation API are unchanged. Consumers of earlier, more permissive inputs
should account for these tightened contracts:

- Proof framing is checked before providers; BOM envelopes and duplicate raw
  `Content-Type` fields reject. Provider failures always produce sanitized
  503 responses rather than stale-key challenges.
- Metadata fetch substitutes must expose a readable byte stream. Standalone
  discovery's 5-second body-read deadline differs from the configurable
  whole-client-load deadline described above.
- Inherited Request bodies remain reusable; explicit non-null bodies override,
  `null` inherits, and mode/body getters are sampled once in that order. Failed
  retry preparation returns readable first-response data; caller abort rejects.
- `no-cors` and browser-forbidden proof fields fail locally, including under
  injected/Node transports. The final Request must retain the exact proof.
- Replacement loads coalesce challenges across older key generations. A changed
  validated module URL permits the single same-key retirement refetch.
- Root asset mounts publish single-slash paths. Discovery rechecks the current
  key after provider waits instead of publishing a key that became inactive.

## Verification commands

Contributor checks, from the repository root after dependency installation.
Build first: declaration checks and runtime/consumer lanes read the built
output and do not rebuild it implicitly.

```sh
pnpm --filter @web-ts-toolkit/express-request-attestation... build
pnpm --filter @web-ts-toolkit/express-request-attestation typecheck
# Included in typecheck; this runs only the built-declaration fixtures:
pnpm --filter @web-ts-toolkit/express-request-attestation typecheck:declarations
pnpm --filter @web-ts-toolkit/express-request-attestation test:node
pnpm --filter @web-ts-toolkit/express-request-attestation test:redis
pnpm --filter @web-ts-toolkit/express-request-attestation test:mongo
pnpm --filter @web-ts-toolkit/express-request-attestation test:browser
pnpm --filter @web-ts-toolkit/express-request-attestation test:packed-consumer
pnpm --filter @web-ts-toolkit/express-request-attestation exec npm pack --dry-run --json
pnpm --filter @web-ts-toolkit/express-request-attestation test
```

`typecheck` runs source and browser-only source checks, then
`typecheck:declarations` runs all three configs in `test-decl-consumer/`:
`tsconfig-nodenext.json` (both entries under `.mts` import and `.cts` require),
`tsconfig-bundler.json`, and `tsconfig-browser.json` (`types: []`). All use
public package imports against built declarations with `strict: true` and
`skipLibCheck: false`; no source path mapping stands in for the package.
`test:packed-consumer` installs the release-shaped tarball in isolated backend
and browser projects, compiles actual Express handler assignments and the
installed README examples, and checks CJS/ESM and package inventories.

The filtered package `test` command builds once, then runs Node, live Redis,
live MongoDB, browser, and tarball lanes serially; never overlap builds writing
the same output directory. Prerequisites:
Docker for isolated Redis 6.2/7.2 tests, a MongoDB replica-set binary
download (registry/network) for the live `test:mongo` lane, installed
Playwright Chromium, and registry access for fresh tarball consumers. A
missing prerequisite blocks that lane instead of silently passing it.
