# ATT-07 independent review

## Release-blocking findings

1. **P1 — S3 can validate an incomplete response header block.** The default Smithy Node HTTP handler
   uses Node's header-count limit without checking whether it truncated the list.
   [`responseHeaders`](../../../../packages/email-service/src/attachments/s3/transport.ts#L19-L28)
   reads `IncomingMessage.headersDistinct`, which distinguishes duplicates only among the headers
   Node retained. [`create` and `read`](../../../../packages/email-service/src/attachments/s3.ts#L72-L128)
   then treat missing version/delete-marker headers as evidence that none was returned. The same
   issue can hide extra metadata or a second expiration header, allowing a response that should be
   rejected to produce a receipt or pass worker resolution. A local Node 26.12.1 probe showed a
   later benign header dropped at 1,000 parsed pairs even though the block was below the byte limit.
   This is separate from whether AWS or SeaweedFS normally emits such a response. Require complete
   headers under an explicit byte cap (as the
   [Azure transport](../../../../packages/email-service/src/attachments/azure/transport.ts#L90-L118)
   does), or fail closed when completeness cannot be established. Add real Node HTTP coverage for
   late version indicators and conflicting metadata/expiration headers.

2. **P1 — S3 can free a capacity slot before a request that never exposed a response has closed.**
   [`observeS3Response`](../../../../packages/email-service/src/attachments/s3/transport.ts#L47-L79)
   registers an `IncomingMessage` only after the handler returns one. Until then,
   [the shared slot](../../../../packages/email-service/src/attachments/operations.ts#L107-L133)
   holds the SDK operation but has no `ClientRequest` close to await. With Smithy Node HTTP handler
   `4.14.2`, an independent loopback cancellation probe delayed native teardown before headers.
   The handler rejected with `AbortError` while `ClientRequest` was still open; native close followed
   only when teardown was released. The adapter can therefore start new work while prior requests
   are still closing. The existing S3 delayed-close test covers a raw response exposed before SDK
   rejection, not this path; the [handoff](att-04-handoff.md#transport-boundary) explicitly notes
   the missing fence. Require an observable, abortable Node transport that registers request close
   before submission and keeps the slot through both request and response teardown. Test early
   cancellation and deadline with all eight slots occupied, then confirm capacity returns on close.

**Recommendation: do not accept ATT-07 yet.** Close both S3 gaps, then rerun the affected S3,
mixed-delivery, and installed-consumer checks. The findings concern the reviewed transport, not a
claim of a live-provider incident.

## Other review results

- **Staging, replay and redrive.** The [producer checker](../../../../packages/email-service/src/attachments/check-retention.ts#L21-L73)
  revalidates the frozen DTO, matches all seven ref fields and checks the actual expiry against proof
  from the issuing writer and scope. The exhaustive binding list and authorization belong to the
  host. Only the ordinary ref is serialized; a relay does not need receipts or storage clients.
  Direct checked admission and outbox relay use the same
  [`enqueuePrepared` implementation](../../../../packages/email-service/src/service.ts#L313-L327).
  Raw `enqueue` remains the legacy path, not a first-admission hold check. The mixed tests exercised
  retained replay through both the relay and ordinary `enqueue`, without storage or template work.
  Eligible redrive keeps the same expiry and refs; grace permits draining reads, not late admission
  or extended send eligibility. Queue pruning, admission uncertainty and shared-use cleanup do
  not invoke an attachment delete.
- **Bytes, identity and redaction.** The [shared store](../../../../packages/email-service/src/attachments/store.ts)
  copies genuine bounded views before yielding and validates case-sensitive scoped keys and exact
  immutable metadata. A replay after possible commit verifies the stored body's own length and
  SHA-256 before comparing it to the candidate. The
  [body reader](../../../../packages/email-service/src/attachments/read-body.ts#L10-L53) bounds
  allocation and stops on overflow. The worker independently verifies bytes before provider
  preparation; its legacy failure classification, SMTP leaf-part checks, and SendGrid mapping
  are unchanged. The baseline product diff outside the new subpaths is limited to the shared
  byte-view validation refactor and two sanitized error codes. No queue or history schema change.
- **Retention and backend boundaries.** Mongo writes subtype-0 BSON Binary with journaled majority
  acknowledgement, bounds Binary in the server projection, and uses exact primary linearizable
  reads. Readiness checks the attachment-only catalog and zero-second TTL on BSON Date
  `purgeAt = deliverBy + 24 h + 121 s`; it fences stale collection/connection bindings. AWS mode
  requires the matching expiration header; only explicit SeaweedFS `bucket-policy` mode allows
  its absence and requires both current policy and versioning reads within the upload budget.
  Neither performs deletion. Azure uses one conditional block PUT and a tracked exact GET, with
  the service creation timestamp for its age calculation. It does **not** claim to verify the
  Azure account policy. The installed README makes the separate operator gate mandatory.
- **Installed package and CI.** The eight named runtime/type entries match the build and ordinary
  and flattened tarballs. Root, SendGrid and the common attachment entry need no optional peer;
  adapter types reference only their own peer. The emitted declarations retain useful JSDoc and
  the README distinguishes cloud modes, Azure's dedicated client, reconnect readiness, scoped
  permissions, and the migration-free project-ref path. The
  [serial runner](../../../../packages/email-service/test/run.mjs#L8-L27) includes all three new
  required lanes. The unchanged
  [workspace job](../../../../.github/workflows/test.yml#L228-L248) calls the full script and
  [`unit-test`](../../../../.github/workflows/test.yml#L645-L695) evaluates all prerequisite
  results; a missing or failed package lane cannot be counted as success by the result helper.

## Verification

Reviewed the [contract](contract.md), [SeaweedFS addendum](seaweedfs.md), ATT-02–07 handoffs,
maintained tests and generated declarations against the uncommitted task worktree based on
`13ca5acf`. Read the completed integration logs summarized in the [ATT-07 handoff](att-07-handoff.md):
786 canonical Vitest cases passed with two opt-in SMTP timing cases skipped, all 16 packed checks
passed at Node 26.12.1 and at Node 24.0.0, and the full local CI/group checks reported 615/18 passes.
Lint and frozen install are handoff evidence, not independent reruns. The separately exercised
SMTP timing and end-to-end trace are recorded in [ATT-06](att-06-handoff.md).

Independently ran on Node 26.12.1 / pnpm 11.24.0, without rebuilding:

| Check | Observed result |
| --- | --- |
| Package `typecheck` and `git diff --check` | Passed |
| Managed attachment and legacy worker-preflight unit files | 61 passed |
| Managed attachment lifecycle file | 7 passed |
| Offline AWS SDK wire file (`3.1167.0`) | 36 passed |
| `test:azure` (`12.34.0`, Azurite Blob `3.38.0`) | 62 passed |
| Focused MongoDB attachment lane (`8.2.6`, Mongoose `9.12.2`, driver `7.8.0`) | 6 passed: maximum BSON size, real TTL, reconnect, UUID replacement fence, queue catalogs, and restricted roles. The filter omitted 34 other cases. |
| `test:managed-delivery` with a missing configured `mongod` and downloads disabled | Expected failure, exit 1 at setup; not a green skip |
| CI-helper output-contract and email-job aggregate checks, plus workflow agreement | Two tests passed; 26-workspace workflow agreement passed |
| Focused Node/Smithy loopback observations | Header truncation and early SDK settlement observed as described above |

No canonical/packed rerun or live cloud/mail was performed for this review. Raw logs, toolchains,
test credentials and fixture state are not archived; the maintained suites and linked handoffs are
the reproduction inputs.

## Remaining production qualifications

- Audit the live private backing, effective lifecycle and clock bounds, least-privilege roles,
  conditional conflict/uncertain ACK behavior, reads through the promised window and asynchronous
  purge before enabling producers. The AWS SDK wire fixture is not live AWS. The SeaweedFS `4.54`
  result is single-gateway: qualify the actual topology and standard scheduler, including checking
  for filer/path TTL outside the S3 policy which the adapter does not inspect. Do not infer support
  for other S3-compatible services or for the historical MinIO target.
- Azurite does not validate ARM policy, production TLS/identity, or soft-delete/version/snapshot
  behavior. Verify real Azure settings and a producer grant that permits same-key replay without
  giving the runtime role delete or lifecycle powers. Keep old bindings and live holds when
  rotating, and stop new stages on unreadable or drifted policy. Do not count expiry as proof of
  erasure of independent retained copies.
- The Mongo attachment evidence does not exercise cross-member failover during an attachment
  write, SLA-level TTL latency, or native TCP close independent of driver command settlement.
  Qualify the deployed replica topology and monitor cleanup. Requalify SDK upgrades that change
  the S3 middleware or Azure pipeline behavior.
- Local CI checks do not prove live workflow rollout or branch protection. Follow the maintainer
  authorization and required-check verification in [AGENTS.md](../../../../AGENTS.md#testing-notes).
