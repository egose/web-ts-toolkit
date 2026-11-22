# ATT-05 — Azure Blob managed attachments

The [Azure source entry](../../../../packages/email-service/src/attachments/azure.ts) uses the
[managed contract](contract.md), with one additional client-construction requirement to prove response
teardown. This handoff qualifies the pinned SDK against disposable Azurite, not live Azure. The root,
queue formats, shared store, providers, exports, package README, CI and main test runner are unchanged.

## API for ATT-06 and ATT-07

- `createAzureAttachmentContainerClient(url, credential?, options?)` returns a dedicated, caller-owned Node
  `ContainerClient` with the required transport. Use the **primary** private container HTTPS URL, not an account
  or blob URL. Supply a Blob SDK credential (including a caller-supplied `TokenCredential`) or omit the
  credential for a SAS URL. The helper accepts the SDK's `audience`, `proxyOptions` and `userAgentOptions`;
  don't replace its HTTP client, add policies or change retries. Plain HTTP is only for
  `127.0.0.1:<port>/<account>/<container>`. Version/snapshot selectors, operation parameters such as `comp`
  or `restype`, SAS response overrides, URL userinfo and fragments are rejected.
- `createAzureAttachmentStore(container, { resolverKey, namespace, prefix })` returns `ManagedAttachmentStore`;
  the named options type is `AzureAttachmentStoreOptions`. Obtain the client and store factories from the
  **same Azure entry instance** (both ESM or both CJS). A regular `ContainerClient`, including one made by
  `BlobServiceClient.getContainerClient`, cannot prove raw transport ownership and is rejected with
  `invalid_config`. Use a separate SDK client for provisioning and unrelated operations. The helper makes
  a fresh SDK pipeline before construction; neither factory makes a request or discovers credentials.
- **ATT-06:** import both factories from the source entry. The [Azurite fixture](../../../../packages/email-service/test/azure/azurite.ts)
  offers `startAzurite()`, `fixtureContainerName()` and `fixtureCall()`. Start it under an ignored checkout-local
  `TMPDIR`; create a fresh private container with `emulator.control(name)`. Use independent clients from
  `emulator.delegated(name, emulator.endpoint, 'rw')` for the writer and `'r'` for the worker, or pass the
  [loopback relay](../../../../packages/email-service/test/azure/relay.ts) endpoint for request counts and
  faults. Close relay and emulator in `finally`. Use `receipt.ref` in `prepare`, check actual frozen expiry
  with `checkManagedAttachmentRetention`, and wire `{ [worker.resolverKey]: worker.resolve }`. Do not persist
  the receipt, SAS, account URL, provider version token or SDK objects. Use the same namespace, prefix and
  backing in both processes, and keep that resolver binding until old work drains.
- **ATT-07:** expose both named factories and the named option type at `/attachments/azure` in CJS, ESM and
  declarations; keep `@azure/storage-blob` external and an optional peer (`>=12.34.0 <13` per the contract;
  only `12.34.0` was tested). `azurite` remains dev-only. No Azure or identity SDK is needed for root or other
  attachment modes. Document the required helper and add `test:azure` to the serial package runner; do not
  skip an absent fixture. The source-only bundle check below is not installed-consumer or tarball evidence.

## Exact writes, reads and retention

- One `Put Blob` uploads the bounded bytes as a block blob at
  `<prefix>ma1/<namespace>/<scope>/<id>/<version>`, with `If-None-Match: *`, transactional Content-MD5,
  exact length, content type and the shared immutable metadata. Even a clean ACK requires one exact full
  `GET`; so do 412, 409 `BlobAlreadyExists`, or an ambiguous create while time remains. Confirmation checks
  actual length and SHA-256 against stored metadata before comparing the candidate. Equal writes converge,
  unequal ones conflict, and definitive auth or protocol failure issues no receipt. No overwrite, list,
  delete, range retry, secondary or version fallback. On `write_unconfirmed`, repeat the original input,
  including revision and `deliverBy`, rather than creating a new identity or removing the blob.
- Exact blob absence and transient/interrupted reads return `unavailable`. Missing container, forbidden
  reads and surfaced version/snapshot indicators fail closed as `store_incompatible`. Corrupt metadata or
  bytes fail as `invalid_snapshot` on resolution and `store_incompatible` on confirmation. An ETag or MD5
  does not substitute for SHA-256. Already-issued refs may still resolve during grace; the queue decides
  send eligibility. SDK errors/response data do not become job or application error details.
- A receipt needs the original service creation time (`x-ms-creation-time`, SDK `createdOn`), not writer
  time, last modification or last access. The lower bound is `createdOn + 32 days - 121 seconds`; it must
  cover `deliverBy + 24 hours`. Missing, malformed, implausibly future, or too-old creation evidence, or
  a surfaced non-Hot tier, fails the producer hold check but does not stop existing verified reads.
  Without the operator prerequisites below this calculation is **not** proof of a retention policy.

## Transport and closed slots

The [transport](../../../../packages/email-service/src/attachments/azure/transport.ts) uses the SDK's public
request policy and HTTP client hooks; it does not inspect private SDK fields or use the default collector.
It tracks each request by native abort signal, exact URL and method. The one-dispatch guard is at the Node
HTTP(S) boundary, below SDK retry, redirect and auth policies, with SDK `maxTries: 1` and download
`maxRetryRequests: 0`. PUT and any confirming GET spend one operation budget; the remaining time and abort
signal reach the actual request. No range, structured download, or SDK checksum wrapper is requested.

On headers, the adapter registers the raw `IncomingMessage` **before** checking the budget or handing it to
the SDK. It separately registers `ClientRequest` close before sending; this covers termination before
headers. A successful Blob SDK download wrapper is tracked too, before any validation. An early caller
result does not free one of the eight store slots until SDK work and all registered closes settle. That
holds when the SDK rejects missing length/ETag without exposing a wrapper, or the underlying socket has
closed but the wrapper is still closing. The transport caps headers at 16 KiB without truncating the header
list; it discards non-GET or non-200 bodies without collecting them, using the raw status and error-code
header. A GET must be an unencoded, non-range block-blob response with known bounded `Content-Length`;
the shared reader only allocates the validated size and stops/destroys on mismatches, overflow or abort.
Unsolicited structured framing is rejected before the SDK can introduce another stream.

The guarantee is local request/stream close, not closing a healthy pooled socket, cancelling independent
token-provider/network work after it has returned to the SDK, or undoing a request already accepted by
storage. Use bounded credential acquisition and trusted transport infrastructure that does not rewrite,
retry or redirect these writes. Live TLS/proxy deployments and real identity credentials were not
qualified in this lane.

## Operator gate and service-only qualification

- Before enabling producers, read back the effective Azure settings and audit a private flat-namespace
  GPv2/Hot backing. Require no HNS, versioning or blob/container soft delete. No snapshots, replication,
  external overwrites, deletes, tiering, holds or retained copies are part of the supported backing.
  Keep writer/worker/storage clocks within the contract's ±60 seconds.
- Require exactly the enabled `Lifecycle` rule named `emailattachmentsv1` plus the namespace UUID without
  hyphens. Its `blobTypes` is `["blockBlob"]`; its sole `prefixMatch` entry is the case-sensitive
  `"<container>/<prefix>ma1/<namespace>/"` (the configured `prefix` includes its final `/`). Its only action
  is `baseBlob.delete.daysAfterCreationGreaterThan = 32`. Reject any other intersecting or global enabled
  rule. Record the sanitized effective settings/policy digest and audit changes. Stop new stages when
  settings cannot be verified or drift; do not shorten a live hold. The adapter has no ARM credentials
  or account-policy readback. Orphans become eligible for asynchronous lifecycle cleanup, not necessarily
  erased on day 32; monitor overdue cleanup.
- Worker needs exact-blob read. Producer needs read plus permission for the conditional create and its
  duplicate-create path; do not grant application roles delete or lifecycle mutation. In Azurite the
  fixture's read/create-only SAS (`rc`) made the first put but returned 403 on the existing key **before**
  evaluating `If-None-Match`; the adapter correctly did not treat that as a collision. The fixture uses
  `rw` for a replay-capable writer, `r` for the worker, and neither grants list or delete. This is not
  production IAM evidence. Container SAS is not prefix authorization and `w` can allow overwrites outside
  the adapter. Use a dedicated private container or verified finer-scoped credentials, and validate that
  the deployment grant still permits same-key replay.
- In a separately authorized disposable Azure account, verify the actual primary service headers, TLS and
  credentials, conflict/ACK-loss behavior, the ARM rule and versioning/soft-delete settings above, the
  least-privilege producer/worker grants, and retained reads followed by lifecycle cleanup. Azurite does not
  prove lifecycle scheduling, ARM drift, production authorization, or previous-version/snapshot/soft-delete
  behavior. Simulated headers and a privileged fixture purge are not live Azure evidence.

## Verification

Linux x64; pnpm `11.24.0`, Azurite Blob `3.38.0`, `@azure/storage-blob` `12.34.0`, REST `2026-10-06`.
The [standalone runner](../../../../packages/email-service/test/azure/run.mjs) requires the locked local
dev dependency and uses fresh ignored scratch, an isolated loopback port and randomized fixture-only
credentials. There is no Docker, external service, inherited endpoint override or `--skipApiVersionCheck`.

| Check                                                                                              | Result                                                                                                                 |
| -------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------- |
| `pnpm --filter @web-ts-toolkit/email-service test:azure`                                           | **62 passed**, one file, no skips; 12 common and 50 Azure cases, separately on Node `24.0.0` and `26.12.1`             |
| `pnpm --filter @web-ts-toolkit/email-service typecheck`                                            | Passed on Node `26.12.1`                                                                                               |
| `pnpm --filter @web-ts-toolkit/email-service install --frozen-lockfile --offline --ignore-scripts` | Passed with the populated workspace pnpm store                                                                         |
| Targeted ESLint and Prettier                                                                       | Passed on Azure source, fixtures, runner and config; formatter also checked the manifest and tsconfig                  |
| Source-only scratch `tsup` with external `@azure/storage-blob`                                     | Both formats loaded and bound locally; `.d.mts` and `.d.ts` contained the factories and option type; `dist/` untouched |
| `git diff --check`                                                                                 | Passed                                                                                                                 |

The [maintained lane](../../../../packages/email-service/test/azure/azurite.test.ts) observed the real conditional
201/409 responses, transactional MD5 rejection, unchanged age across replay, exact GET counts, scoped keys,
wrong stored bytes, and a real committed PUT whose reply was dropped, aborted or timed out. Fault injection
covers 412, retention and version/tier negatives, partial and malformed responses, and attempted SDK replay.
The slot tests separately delay real socket teardown before headers and on a GET rejected by the SDK, then
delay the SDK wrapper's close after the raw response closes. All eight slots remain occupied in each case
until teardown is released. These are loopback experiments, not wall-time cloud lifecycle or mail tests.

The maintained source and tests are the reproduction inputs. Raw logs, local fixture data, credentials,
toolchains, node caches and generated bundles are omitted. No real cloud or mail was used.
