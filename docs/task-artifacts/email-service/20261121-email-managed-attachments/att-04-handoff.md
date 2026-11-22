# ATT-04 — S3 managed attachments

> Historical evidence from before independent review. The SDK-client requirement, transport
> and offline fixture below were superseded by [the ATT-04 remediation](att-04-remediation.md).

The [source factory](../../../../packages/email-service/src/attachments/s3.ts) implements the
[managed contract](contract.md) with the [SeaweedFS addendum](seaweedfs.md). One caller-owned `S3Client`,
one binding, two explicit retention modes. ATT-04 did not change the shared store, the queue/worker,
package exports, release artifacts, CI, or the main package test runner. It added the pinned SDK dev
dependency and the standalone `test:s3` lane. ATT-07 owns publication and main-test wiring.

## Behavior and deployment

- Configure a Node SDK client for the intended region and credentials (`maxAttempts: 1`,
  `followRegionRedirects: false`). For SeaweedFS set its endpoint and `forcePathStyle: true` **on that
  client** and select `retention: 'bucket-policy'` on the store. There is no endpoint autodetection,
  expiration-mode fallback, or client reconfiguration. The package does not provision, list, delete,
  close the client, or expose physical keys in refs.
- A producer attempts one `PutObject` with `If-None-Match: *`, exact length, SHA-256 and immutable
  metadata, then verifies the entire bounded body at that exact key, even after a clean ACK. A 409/412
  or potentially committed attempt can only trigger confirmation; no unconditional writes or version
  fallback. Retry `write_unconfirmed` with the original revision and `deliverBy`. Preserve the binding
  for queued and staged refs. The independent worker calls exact `GetObject` only.
- The default `expiration-header` proof requires a matching rule and expiry date on the confirmed
  GET. Missing or contradictory evidence fails closed regardless of endpoint. Only explicit
  `bucket-policy` mode permits a missing header: it requires both current readbacks within the
  upload's original budget. Require exactly one enabled, binding-prefix-only `Days: 32` rule and an
  empty `VersioningConfiguration` document (never versioned, not suspended). Present malformed,
  wrong-rule, duplicate, or early GET expiry evidence still fails closed. On either path the minimum
  is `LastModified + 32 days - 121 seconds`; the store compares it with `deliverBy + 24 hours`. The
  adapter does not spend UTC rounding or grant more time to an old object. Bad retention proof does
  not prevent exact reads for already-issued refs. A surfaced version or delete-marker token fails
  closed independently of the selected mode.
- Control-plane proof intentionally accepts a narrow S3 XML shape rather than trusting SDK
  deserialization to retain unknown/duplicate actions or predicates. Extra fields or rules,
  legacy top-level `Prefix`, and ambiguous/unreadable configuration do not certify a hold.
  [Cloud wire helpers](../../../../packages/email-service/src/attachments/cloud-records.ts) share
  only prefix, metadata and hold arithmetic with the future Azure adapter.
- AWS IAM: producer needs scoped `s3:GetObject` and conditional `s3:PutObject`; in bucket-policy
  mode also `s3:GetLifecycleConfiguration` and `s3:GetBucketVersioning`. Worker needs scoped
  `s3:GetObject` only. Do not grant list to distinguish denied/missing reads, or give app roles
  policy mutability/deletion. The operator prerequisites still apply: dedicated, private, never-versioned
  bucket; synchronized clocks; no earlier external expiry/deletes, new versions or overwrites;
  readback/audit and production lifecycle monitoring. The two policy reads are not atomic with one
  another or with the create. For SeaweedFS, deploy and monitor its standard lifecycle scheduler
  independently of this test fixture.

## Transport boundary

The [per-command middleware](../../../../packages/email-service/src/attachments/s3/transport.ts)
owns the raw Node response stream before SDK deserialization. It registers it with the existing
request/slot tracker even on a late response or on headers the SDK will reject. It blocks a second
transport invocation on the same command. It caps control/error bodies at 16 KiB before SDK parsing;
exact object reads use the common body bound, no collector, and SHA-256 of the actual bytes.
The GET command clears the SDK's optional `ChecksumMode` before serialization so that verification
uses the original response stream and the store's digest, not an SDK checksum wrapper. This does
not remove the explicit SHA-256 on PUT. Middleware is attached only to individual commands, not
the shared client. The tests exercise these middleware orderings against the pinned SDK.

The transport contract is the Node HTTP handler or an equivalent handler that returns a byte-mode
Node `Readable` with a real close notification and honors the abort signal; don't install middleware
that replays, intercepts, wraps, or replaces these commands/responses. The adapter awaits SDK
settlement and holds each exposed raw response through `close`, not merely through SDK rejection.
Before headers there is no exposed raw response; cancellation relies on the SDK/handler disposing
its request. There is no separate public `ClientRequest` close fence for a no-response failure or
connection-pool socket fence. Caller misconfiguration, a handler ignoring cancellation, proprietary
wrappers and other SDK releases are not teardown-qualified by this run.

## Verification

Linux x64, Node `26.12.1`, pnpm `11.24.0`, `@aws-sdk/client-s3` `3.1167.0`. The maintained runner
uses ignored checkout-local scratch (creates fresh scratch if needed); the real suite downloaded
the public pinned 4.54 archive, verified the [SHA-256 and binary version/commit](seaweedfs.md),
extracted only `weed`, and started one fresh `weed mini` with explicit loopback HTTP/gRPC ports,
private scratch sockets and fixture credentials. Telemetry and optional public interfaces are
disabled. Linux x64, Git, curl, tar, and HTTPS access to the pinned asset are required; missing
or failed setup is a failure, not a skip. No Docker, live AWS, env-injected S3 endpoint, external
mail, or previous probe files were used.

| Check                                                                                                 | Result                                                                                |
| ----------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------- |
| `pnpm --filter @web-ts-toolkit/email-service test:s3`                                                 | **68 passed** in two files, no skips: 32 SeaweedFS (12 common), 36 no-network AWS SDK |
| `pnpm --filter @web-ts-toolkit/email-service typecheck`                                               | Passed                                                                                |
| `pnpm --filter @web-ts-toolkit/email-service install --frozen-lockfile --offline --ignore-scripts`    | Passed with the already populated workspace pnpm store                                |
| Targeted ESLint (new attachment source, S3 tests/runner/config)                                       | Passed                                                                                |
| Targeted Prettier (source, tests/runner/config, package manifest and tsconfig) and `git diff --check` | Passed                                                                                |

The [real lane](../../../../packages/email-service/test/s3/seaweedfs.test.ts) observed path-style
signed requests, length/checksum/metadata and exact policy/worker request counts, equal and unequal
create races, rejected bad upload checksum, actual stored byte corruption, real missing and drifted
policy, enabled/suspended versioning, and a surfaced write version token. A loopback relay drops
acknowledgements only after an observed SeaweedFS commit, stalls or alters responses for stream faults,
and observes socket teardown during cancellation. Purge is simulated by the privileged fixture,
not the adapter. The [no-network lane](../../../../packages/email-service/test/s3/aws.test.ts)
used the real SDK with an in-process transport to exercise regional HTTPS addressing, default-header
proof, age/clock boundaries, ambiguous policy XML, one decreasing budget, no replay/redirect,
sanitized failures, and eight raw stream closes held across SDK deserialization rejection.

No live AWS behavior, wall-time lifecycle/cleanup, production IAM, multi-gateway consistency,
installed package exports or performance threshold is qualified here. Source and maintained tests
are the reproduction inputs; raw logs, fixture state, credentials, scratch probes, downloads and
generated files are omitted.
