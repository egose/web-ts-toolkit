# ATT-07 independent re-review

**Accept ATT-07 for the reviewed package revision.** Both S3 P1 findings are closed. I found no new
release blocker in the remediation. This is not approval to enable production cloud writers or publish.

## Findings and disposition

1. **Closed — S3 response header completeness.** The
   [native request](../../../../packages/email-service/src/attachments/s3/transport.ts#L120-L160)
   sets an explicit 16 KiB parser cap and disables the count limit before submission. The
   [raw response view](../../../../packages/email-service/src/attachments/s3/transport.ts#L22-L89)
   preserves duplicates as ambiguous before giving the SDK a filtered view. The
   [store](../../../../packages/email-service/src/attachments/s3.ts#L167-L237)
   rejects version and delete-marker tokens on PUT and GET; duplicate or extra immutable metadata
   fails exact validation. A contradictory expiry cannot certify a receipt in either retention mode
   but does not stop an otherwise verified reader. The
   [loopback regression cases](../../../../packages/email-service/test/s3/aws.test.ts#L529-L635)
   verified those outcomes after more than 1,000 header pairs, accepted a valid late expiry, and
   rejected parser overflow even with the process-wide cap raised to 32 KiB. Overflow on a PUT
   may leave an object; it cannot be interpreted as proof that nothing committed.
2. **Closed — S3 releases capacity only after request and response teardown.** The same native
   transport registers `ClientRequest` close before `end()` and owns the `IncomingMessage` before
   header handling or SDK deserialization. Both holds are independent of the SDK promise and use
   the [shared slot and abort signal](../../../../packages/email-service/src/attachments/operations.ts#L26-L98).
   The [pre-header tests](../../../../packages/email-service/test/s3/aws.test.ts#L637-L711)
   observed eight SDK rejections but zero native closes for both cancellation and deadline. A ninth
   write remained `busy` and a read remained unavailable without wire work until close notifications
   were released. The [response-side test](../../../../packages/email-service/test/s3/aws.test.ts#L754-L816)
   independently held the eight `IncomingMessage` closes after native request close. Real SeaweedFS
   cases also cancelled partial downloads and stopped a lengthless overflow before EOF. The fence
   covers the request and response, not idle pooled sockets or separate credential-provider work.

## Compatibility and correctness

- The [dedicated S3 client](../../../../packages/email-service/src/attachments/s3.ts#L26-L154) is
  an intentional amendment to the unreleased managed entry. Only a client from the same ESM or
  CommonJS entry instance binds; ordinary clients and a swapped handler fail closed. Provisioning
  uses a separate SDK client. The checked [README recipes](../../../../packages/email-service/README.md#L1167-L1241)
  and both emitted declarations agree on the branded client, named factories/config types and
  caller-owned `destroy()`. The change adds no entry, peer, queue data, or requirement for legacy
  project-owned refs. Custom SDK handlers/middleware are outside the supported surface.
- The SDK still signs the target; the native handler preserves the path, serializes the SDK query
  with the matching encoding, and passes the signed headers. Local TLS checked the real regional
  Host/SNI using a disposable CA; a prefixed loopback endpoint exercised the policy query targets,
  and the real SeaweedFS fixture accepted the signed requests. The handler matches the operation
  signal and guards repeat dispatch below SDK retry/redirect logic. In a separate disposable
  loopback check of both emitted formats I forced re-entry with the same tracked PUT: the native
  guard refused it, and the fixture observed only one conditional PUT and one exact confirming GET.
- The path still uses bounded byte streams, one conditional create with exact length and SHA-256,
  and one exact byte-and-metadata confirmation on clean ACK, collision or recoverable ambiguity.
  The default mode requires matching expiry evidence; only explicit `bucket-policy` permits its
  absence with exact lifecycle and never-versioned readbacks. The worker still uses only exact GET.
  Neither staged refs nor normalized errors carry SDK config, credentials, signed URLs or native
  response details. Mixed staging, replay/redrive, cleanup separation, and the Azure operator-only
  gate remain as reviewed; the mixed suite passed with the new client.
- The [serial runner](../../../../packages/email-service/test/run.mjs#L8-L27) still requires S3,
  Azure, mixed delivery, and packed verification. The optional peers and ESM/CJS export targets
  agree with the [package manifest](../../../../packages/email-service/package.json#L60-L99).
  The output-contract check includes each target; the unchanged `unit-test` aggregate still fails
  closed on failed, cancelled, missing, and skipped prerequisite results.

## Verification

The two production source hashes match [the remediation handoff](att-04-remediation.md#reproduction-and-limits)
on the uncommitted worktree based on `13ca5acf`. Independently ran:

| Check | Observed result |
| --- | --- |
| Package `typecheck`; `git diff --check` | Passed |
| `test:s3`, Node 26.12.1, AWS SDK 3.1167.0 | 89 passed: 57 native AWS wire cases and 32 real SeaweedFS 4.54 cases |
| AWS wire file with process header cap raised to 32 KiB | 57 passed on Node 26.12.1 and 57 passed on verified Node 24.0.0 |
| `test:managed-delivery` with digest-checked MongoDB 8.2.6, SeaweedFS 4.54 and Azurite 3.38.0 | 5 passed; SMTP and SendGrid stayed on loopback |
| Emitted ESM and CommonJS S3 native repeat guard, separate loopback exercise | Both refused a second dispatch; one conditional PUT and one same-key GET per format |
| Published output-contract assertion, result helper and workflow agreement | 1 output-contract and 37 result-helper tests passed; workflow agrees with 26 workspaces |

Reviewed the remediation logs rather than repeating full builds and packing. The canonical invocation
passed build, typecheck and all 807 default Vitest cases (two opt-in SMTP timing cases ran and passed
separately); its packed phase hit the numeric-bind test guard described in the handoff. The final
standalone packed reruns after that harness-only correction passed 16/16 at each of Node 26.12.1 and
24.0.0 for both tarball shapes and the six peer profiles. Full local CI/group counts were 615/18;
lint is recorded in the handoff. None of these broader runs is an independent rerun.

## Remaining qualification

No live cloud or external mail was used. The
[original production qualifications](independent-review.md#remaining-production-qualifications)
still apply: audit live IAM and policy, verify actual AWS/Azure headers, conditional replay,
retained reads and asynchronous cleanup; qualify SeaweedFS's deployment topology, filer/path TTL
and standard lifecycle scheduler; verify Azure ARM settings and same-key replay grants separately.
The evidence does not establish Mongo cross-member failover during an attachment write, purge
latency guarantees, network/proxy combinations not tested here, or live GitHub rollout/branch
protection. Requalify SDK/transport changes. Only review documentation was added; raw logs,
temporary fixtures and generated outputs are not archived.
