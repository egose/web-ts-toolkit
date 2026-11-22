# ATT-04 qualification target: SeaweedFS instead of MinIO

2026-11-21: The user selected a maintained S3-compatible target instead of the archived
[MinIO Community repository](https://github.com/minio/minio). The MinIO run in the
[original decision record](contract.md) is historical only. Do not exercise or advertise
MinIO in the required package suite. This update does not change the public attachment
reference, AWS support, retry contract, or the minimum delivery retention.

## Local SDK probe

Using AWS SDK `@aws-sdk/client-s3` 3.1167.0 on Node 26.12.1 with path-style addressing,
SeaweedFS 4.54 round-tripped an enabled `Expiration.Days = 32` rule for a literal
prefix, reported bucket versioning unset, and accepted a single `PutObject` with
`If-None-Match: *`, explicit length and SHA-256. Of three concurrent unequal conditional
creates, one returned 200, two returned 412, and the exact-key GET returned the winning
body, content type, custom metadata and `LastModified`. Neither GET nor HEAD returned
`x-amz-expiration`. This probe is not evidence of real wall-clock expiration or
multi-gateway consistency.

For Linux x64, use the [4.54 release asset](https://github.com/seaweedfs/seaweedfs/releases/download/4.54/linux_amd64.tar.gz)
with SHA-256 `e7424a82eee327809bfa449fda4924c9a0f42f6669a01288eebb1b79674c8196`;
extract only `weed` after matching the digest and check `weed version` (4.54,
`5ef99c1d8dbbeb4a035c055e3b464620506aefac`). Provision the test fixture as one `weed mini`
child with explicit loopback HTTP/gRPC ports, per-run credentials, empty state under
ignored repo-local scratch, telemetry off (`-master.telemetry=false`), unrelated
interfaces disabled where supported, and bounded readiness/shutdown. Use no Docker, live
cloud, or global shared service. The download/probe script, package cache, raw logs and
service state are not archived; the maintained tests must reproduce acceptance.

## Retention proof for the same S3 adapter

- Default `retention: 'expiration-header'` keeps the existing AWS design. A missing,
  wrong-rule or too-early expiration header fails closed; a custom endpoint by itself
  never relaxes this check. Keep separate no-live-network coverage of the AWS SDK path.
- Add the explicit `retention: 'bucket-policy'` option for qualified compatible servers
  without that header, initially SeaweedFS 4.54. Use a **dedicated private, never-versioned
  bucket**. On successful put or exact-key confirmation, verify the same body/metadata and
  `LastModified`, then re-read the current bucket lifecycle and versioning under the same
  elapsed operation budget before issuing a receipt. Require exactly the binding's enabled
  32-day prefix-only expiration rule and no other actions, and reject missing, ambiguous,
  incompatible, or unverifiable configuration with `attachment_retention`. If a header is
  present, enforce it too; never ignore a contradictory date. The minimum remains
  `LastModified + 32d - clockMargin`, or the earlier proven header date less the margin.
- In bucket-policy mode the **producer** additionally needs `GetBucketVersioning` and
  `GetBucketLifecycleConfiguration` (AWS IAM action `s3:GetLifecycleConfiguration`); no
  permission to modify policy, delete, or list objects is needed by normal package
  operations. Workers still only need exact-object GET. The provisioner must enforce and
  audit the immutable private prefix, no version history, clock bounds, and no earlier
  external deletions/overwrite. For SeaweedFS, run and monitor the
  [lifecycle scheduler](https://github.com/seaweedfs/seaweedfs/wiki/S3-Lifecycle); use the
  standard worker path, not the optional volume-TTL fast path. Neither a successful SDK
  round trip nor a configured rule substitutes for deploying and auditing cleanup.

ATT-04 must test equal and unequal races, exact replay after an uncertain write,
negative missing/wrong/earlier policy, and body bounds and cancellation on the real local
target with the AWS SDK. Capture what the local run verifies versus live AWS/production
lifecycle and consistency that is not qualified.
