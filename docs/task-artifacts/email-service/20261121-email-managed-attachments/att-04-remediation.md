# ATT-04 re-review handoff — native S3 transport

This is the implementation response to the [two P1 findings](independent-review.md). The earlier
[ATT-04](att-04-handoff.md) and [ATT-07](att-07-handoff.md) handoffs describe the pre-review
implementation; they are historical verification, not acceptance of this revision. The
[independent re-review](re-review.md) subsequently closed both findings.

## Changes for re-review

- **Complete response headers.** The [dedicated handler](../../../../packages/email-service/src/attachments/s3/transport.ts)
  calls Node `http.request` or `https.request` with `maxHeaderSize: 16_384`, sets
  `ClientRequest.maxHeadersCount = 0` before socket assignment and submission, and gets
  `IncomingMessage.headersDistinct` before SDK deserialization. It retains repeated fields as
  ambiguous in the raw view; the SDK only receives unambiguous values. The native parser failure
  flag (including `HPE_HEADER_OVERFLOW`) prevents confirmation even on a possibly committed PUT
  with unreadable headers. Version/delete-marker fields fail closed on PUT or GET. Conflicting
  expiration evidence cannot certify a producer hold but does not block an otherwise exact worker
  read. Late duplicate or extra immutable metadata is rejected on both paths.
- **Request and response lifetime.** The handler matches the exact shared stage signal and calls
  `request.begin()` at actual dispatch, after SDK endpoint resolution and signing. It records
  the native request's `close` synchronously before `end()` and owns any raw response as soon
  as Node exposes it. DNS/connect/headers and body share the elapsed operation budget and signal;
  native request and raw stream closes are independent slot holds. Cancellation/deadline can
  settle the caller and SDK first, without freeing those holds or allowing late dispatch, proof or
  retries. This is a `ClientRequest`/`IncomingMessage` fence, not a claim that idle pooled sockets or
  caller-supplied credential providers are themselves closed/cancelled. Use bounded providers;
  `client.destroy()` is caller-owned after use.
- **Intentional S3 API amendment.** [`createS3AttachmentClient(config)`](../../../../packages/email-service/src/attachments/s3.ts)
  produces a branded `S3AttachmentClient` (an SDK `S3Client`) for
  `createS3AttachmentStore(client, options)` from the *same* ESM or CommonJS `/attachments/s3`
  entry instance. An ordinary/cross-entry client is rejected; a swapped handler is not used.
  The helper takes explicit region and SDK credentials or provider, with optional endpoint,
  addressing style, FIPS/dualstack flags and PEM CA material. It forces one attempt, standard retry
  mode, no region redirects and no `Expect` wait; it ignores SDK-configured endpoint URLs unless the
  host explicitly passes an endpoint. Native TLS verifies the peer and hostname. The SDK still
  resolves the endpoint, serializes the method/path/query/headers and signs them; the handler
  passes the signed host/path/headers to Node and uses Smithy-compatible RFC 3986 query encoding.
  Do not install alternate handlers or modify client middleware/configuration.
- **Protocol and install boundaries unchanged.** Still one `If-None-Match: *` PUT with explicit
  length and SHA-256 followed, on clean ACK/collision/ambiguous loss, by one exact bounded body
  proof. No unconditional write, retry, redirect, listing, versions, delete, or “latest” fallback.
  Only explicit `bucket-policy` mode (qualified here on SeaweedFS) permits absence of the expiry
  header and requires lifecycle and versioning readbacks. Workers use independently configured
  clients and only exact-object GET with read-only credentials. The AWS SDK remains an optional
  peer at the same subpath; no new package entry, dependency, queue format or legacy API change.
  Existing project-managed refs need no migration. Only the unreleased managed S3 client setup
  changes; an outstanding ref does not identify or depend on a particular client instance.

## Regression observations

- [`test/s3/aws.test.ts`](../../../../packages/email-service/test/s3/aws.test.ts) replaced the old
  fake handler with actual native HTTP/1.1. It verifies the default regional AWS virtual-host path
  and SigV4 region/service/host on a local TLS server with a disposable CA and the original TLS
  server name. The test routes only that known dial to loopback below the signed request. It also
  asserts the direct prefixed endpoint target, policy subresource queries, one decreasing native
  timeout, one attempt/no redirect, untracked-client rejection, and no dispatch after late
  credentials. The production adapter has no test-only transport or bypass.
- The real Node header tests send more than 1,000 pairs within the byte cap. A late valid expiry is
  accepted; late version and delete-marker fields on PUT/GET, a second expiry after a valid one,
  and duplicate or extra immutable metadata cannot be truncated away. The overflow case verifies
  the native parser error and rejects a write without issuing its proof GET. A separate run sets
  the process-wide header cap to 32 KiB: the adapter still rejects at its explicit 16 KiB cap.
- The pre-header tests use eight real loopback PUTs for each of cancellation and deadline. They
  let actual native socket errors reach the `ClientRequest` and SDK but gate native socket close
  notification. Before releasing it, all eight SDK requests have rejected, zero `ClientRequest`
  `close` events have fired, the ninth write is `busy`, and the read is `unavailable` without
  new wire work. Release produces eight native closes, then one normal exact GET resumes service:
  no late PUT, proof GET, or policy RPC escaped. A separate SDK-deserializer failure test gates
  all eight native `IncomingMessage` destruction callbacks after the requests have closed and
  confirms the stream holds still block capacity.
- Negative controls ran only in ignored scratch copies on Node `26.12.1`. Removing the
  `maxHeadersCount = 0` assignment made all seven late-header tests fail: correct late expiry was
  lost, and invalid version, expiry and metadata responses were accepted. Removing the request
  close *hold*, while keeping the close listener, made both pre-header tests fail at the ninth
  PUT (`write_unconfirmed`, not `busy`): a new write had reached the stalled fixture too early.
  Neither mutation changed checkout source or generated package outputs.
- [`test/s3/seaweedfs.test.ts`](../../../../packages/email-service/test/s3/seaweedfs.test.ts) and
  [`test/managed-delivery/`](../../../../packages/email-service/test/managed-delivery/) use
  the dedicated client on real SeaweedFS, not just a wire stub. Their provisioner remains an
  ordinary SDK client; the independent worker is restricted to SeaweedFS `Read`. The
  [installed recipes](../../../../packages/email-service/test/packed-consumer/fixtures/readme-managed.mjs)
  use a strictly guarded local HTTP capture with separate read credentials for the fresh worker
  process, and keep synthetic object state separate from the staged DTO. The runtime guard allows
  only ports allocated to those in-process IPv4 loopback captures and the disposable Mongo server;
  the numeric S3 bind is resolved locally without DNS. The installed checks cover the new named
  exports, `.d.mts`/`.d.ts` surface, SDK isolation, and cross-format rejection.

## Reproduction and limits

Uncommitted implementation over `13ca5acf` on Linux x64, workspace Node `26.12.1` and pnpm
`11.24.0`; SDK `@aws-sdk/client-s3` `3.1167.0`.
The local TLS test uses `openssl` and the existing disposable TLS fixture. Real SeaweedFS
uses the unchanged [verified 4.54 release archive](seaweedfs.md#local-sdk-probe) and empty
loopback state. Mixed delivery and the canonical run also use Azurite Blob `3.38.0`.

Production source SHA-256, relative to `packages/email-service/`:

| File | SHA-256 |
| --- | --- |
| `src/attachments/s3.ts` | `682a22c8e5a177126c531ca69234b6baefba4948a9a5cf7487f157c78c37b891` |
| `src/attachments/s3/transport.ts` | `ce280d01641c686067d6933d1033ae738e2b87b9f2dc4c3d3211233c2c272fb5` |

Use `umask 022`, a fresh short, Git-ignored absolute `TMPDIR` under `'<repo-root>'`, and
`MONGOMS_VERSION=8.2.6 MONGOMS_RUNTIME_DOWNLOAD=false`. Point `MONGOMS_SYSTEM_BINARY` at the
exact preflight executable (Ubuntu 24.04 x86_64, MongoDB `8.2.6`, build commit
`5d25c835745d06f712320b6cdae9d50b7b43663e`), SHA-256
`08b192e3fcfe01ef1046c379e83e21ccdd20694fd49c816ef642dec6d9cf1882`.
The run reused the [ATT-03 binary](att-03-handoff.md#proof-and-reproducibility); its historical
scratch path was `_tmp-att01-evidence/mongo-binary/mongodb-linux-x86_64-ubuntu2404-8.2.6`.
For the packed floor check, set `EMAIL_SERVICE_CONSUMER_NODE` to verified Node `24.0.0`; the
Linux x64 binary used here was SHA-256
`5677177955d00aa75909df3490120a2e2a2bba80ebcc66a505e8f9d7a5f0b463`.
`EMAIL_SERVICE_CONSUMER_OFFLINE=1` assumes the pnpm store already has every package needed by
an independent tarball consumer, including SDK transitive versions not selected by the workspace
lockfile. Otherwise use the runner's default prefer-offline install mode. These installs are
separate from the examples, whose network guard allows only their declared loopback fixtures.
Do not run competing builds from this checkout.

## Verification

Package commands below use `pnpm --filter @web-ts-toolkit/email-service`. The canonical runner
rebuilt all eight runtime/type entries and ran `typecheck` before the service lanes.
For standalone installed verification, run `test:packed-consumer` after that build, first with
the workspace Node, then with `EMAIL_SERVICE_CONSUMER_NODE` set to the exact floor executable.

| Check | Observed result |
| --- | --- |
| `build` and `typecheck` | Passed in the canonical run. Inspected both emitted S3 declarations: branded client and named exports with JSDoc; no new runtime/type entry or peer. |
| `test:s3` | 89 passed in two files: 57 offline native AWS SDK cases, 32 pinned SeaweedFS cases including 12 shared conformance cases. |
| AWS file with `NODE_OPTIONS=--max-http-header-size=32768` | 57 passed on Node `26.12.1` and exact `24.0.0`. Both runtimes still rejected the explicit 16 KiB overflow. |
| `test:managed-delivery` | 5 passed with disposable MongoDB, SeaweedFS and Azurite; only loopback SMTP/SendGrid. |
| Canonical Vitest lanes | 807 passed: unit 311, lifecycle 41, SMTP 65, SendGrid 91, MongoDB 143, S3 89, Azure 62, mixed delivery 5. Two opt-in SMTP timing tests skipped as designed. |
| Targeted SMTP timing rerun (`SMTP_CAPACITY_TIMING=1`, `-t 'measures the full'`) | Both deferred timing cases passed on loopback with 1,000 commands and replies and no early commands; 809 distinct Vitest cases including these two. |
| Final standalone `test:packed-consumer`, Node `26.12.1` | 16 passed, no skips (347 s); ordinary and flattened release tarballs, six peer profiles each and four harness/test groups. |
| Final standalone `test:packed-consumer`, exact Node `24.0.0` consumers | 16 passed, no skips (300 s); the same two tarball shapes and six peer profiles. |
| Repo `pnpm lint`, targeted Prettier and `git diff --check` | Passed. |
| `pnpm test:ci:check` and `pnpm test:groups:check` | 615 and 18 passed respectively; the workflow and 12 test groups cover the 26 modeled workspaces. Local validation only. |

The canonical command's first ordinary all-peer packed example encountered a test-harness
block: Node calls `dns.lookup` even for numeric `Server.listen` addresses. The installed guard
now answers only its own authorized numeric bind locally, not through DNS. The standalone
ordinary/all-peer smoke passed after that correction. An earlier scratch pack also found a
missing newer AWS SDK transitive tarball in the offline pnpm store; normal package installation
filled the cache. Neither issue changed the product build; focused service lanes and full packed
consumer reruns use that same build.

No live AWS/Azure, external mail, production credentials, production TLS/multi-gateway topology,
or real lifecycle purge was exercised. The review's [production qualifications](independent-review.md#remaining-production-qualifications)
still apply. Raw logs, disposable keys/credentials, generated builds/consumers, scratch toolchains
and service state are omitted; the maintained code and tests are the reproduction inputs.
