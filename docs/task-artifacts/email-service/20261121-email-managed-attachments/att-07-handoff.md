# ATT-07 — Managed attachment package delivery

> Pre-review integration evidence. See [the ATT-04 remediation](att-04-remediation.md) for the
> subsequent S3 client contract and rerun; do not use this record as final acceptance.

Implementation handoff for independent review, following [the contract](contract.md) and the
actual [Mongo](att-03-handoff.md), [S3/SeaweedFS](att-04-handoff.md), [Azure](att-05-handoff.md)
and [mixed delivery](att-06-handoff.md) results. The [SeaweedFS addendum](seaweedfs.md) supersedes
the historical MinIO target. No publication or production qualification is implied.

## What ships

- [`package.json`](../../../../packages/email-service/package.json) and
  [`tsup.config.ts`](../../../../packages/email-service/tsup.config.ts) pair eight public runtime/type
  entries. Managed staging is `/attachments`; the adapters are `/attachments/mongoose`,
  `/attachments/s3` and `/attachments/azure`. The last exports both Azure factories from the
  same entry. Runtime JS independently bundles internal code; SDKs stay external. Normal
  tarballs point at `dist/`; the actual repo release helper strips it consistently from
  the flattened manifest. Neither tarball ships tests or fixtures.
- The cloud peers are optional (`@aws-sdk/client-s3 >=3.1167.0 <4`, `@azure/storage-blob >=12.34.0 <13`)
  with dev pins at those floors. `mongoose 9.12.2` and `nodemailer 10.6.0` remain the tested
  legacy peer floors. The cloud entries report native missing-module diagnostics on import
  or require without their SDK; both Mongoose entries load without Mongoose but their declarations
  reference the peer and their factories require the caller's connection. No new runtime/declaration
  dependency for root, `/sendgrid`, or common `/attachments`; SMTP retains its existing runtime peer.
- The [installed README](../../../../packages/email-service/README.md#manage-delivery-attachments)
  walks through actual frozen expiry plus grace, a mixed staged command, independently bound readers,
  provisioning and per-role grants, checked versus raw refs, replay, rotation and asynchronous cleanup.
  It distinguishes the default AWS header proof, SeaweedFS's explicit `bucket-policy` mode, the
  required Azure client helper and Azure's operator-only policy gate. No migration for existing consumers.
- The [serial test runner](../../../../packages/email-service/test/run.mjs) requires S3, Azure and
  managed delivery before packed tests. The [output contract assertion](../../../../scripts/ci-test-artifacts.test.mjs)
  now includes the 16 additional public targets; output roots, resource setup, CI graph and workflow are unchanged.

## Installed checks and reproduction

The [packed consumer suite](../../../../packages/email-service/test/packed-consumer/packaging.test.mjs)
installs each tarball in six isolated pnpm profiles: no peers, each of the four peers alone, and all
four. It tests the actual manifest, dependency closure, namespace keys, runtime loader isolation,
matching type conditions and reachability of every packed declaration. It extracts the installed README
fences for strict NodeNext ESM and Bundler, and adapts only the managed snippets' imports/exports for strict
NodeNext CommonJS. The network guard permits only the existing disposable Mongo loopback fixture for the
integration recipe. A small in-process AWS SDK transport exercises header and bucket-policy paths without
HTTP; Azure verifies the dedicated client boundary without cloud requests.

The [installed recipe trace](../../../../packages/email-service/test/packed-consumer/fixtures/readme-managed.mjs)
is CommonJS staging into a Mongo queue and BSON attachment collection, then a fresh ESM worker process
using its own Mongo connection and S3 client. The actual README producer rejects expiry one millisecond
beyond `deliverBy` without committing, then commits only a checked frozen DTO with Mongo, S3 and project
refs. An AWS-mode probe rejects an exact-object confirmation whose age fails the 24-hour grace. The
SeaweedFS-shaped wire has no expiration header: each of two explicit producer PUTs is followed by the exact
GET and both policy reads. The reader makes one exact GET, and the synthetic provider sees the ordered
filenames and original bytes once, including after relay replay. The wire fixture serializes synthetic
object state separately from the DTO; the real SeaweedFS and Azure data-plane evidence is in ATT-04–06.

Use Linux x64, workspace Node 26.12.1 and pnpm 11.24.0, `umask 022`, a fresh short ignored absolute
`TMPDIR` inside `'<repo-root>'`, and the [pinned Mongo preflight binary](att-03-handoff.md#proof-and-reproducibility).
Set `MONGOMS_SYSTEM_BINARY` to that verified executable, `MONGOMS_VERSION=8.2.6` and
`MONGOMS_RUNTIME_DOWNLOAD=false`. From the root run `pnpm install --frozen-lockfile --ignore-scripts`,
then `pnpm --filter @web-ts-toolkit/email-service test`. For a standalone packed run build first;
`EMAIL_SERVICE_CONSUMER_OFFLINE=1` needs a populated pnpm store. `EMAIL_SERVICE_CONSUMER_NODE`
can select an independently verified Node 24.0.0 executable for the installed consumers and their TypeScript
invocations (the surrounding workspace toolchain stays pinned).

The canonical service fixtures are disposable MongoDB 8.2.6, pinned SeaweedFS 4.54, and Azurite Blob
3.38.0 (REST `2026-10-06`). See the respective handoffs for runtime prerequisites and qualification limits.

## Observed initial integration checks

The coordinator recovered the completed runs from ignored scratch after the packaging agent's turn
ended. The full run built all eight entrypoints, typechecked the package, then ran the canonical lanes
serially on Node 26.12.1 / pnpm 11.24.0:

| Check | Result |
| --- | --- |
| Canonical `pnpm --filter @web-ts-toolkit/email-service test` | 786 Vitest cases passed; two optional SMTP timing cases skipped by default. All 16 packed-consumer checks passed on Node 26.12.1. |
| `test:packed-consumer` with `EMAIL_SERVICE_CONSUMER_NODE` selecting Node 24.0.0 | All 16 checks passed in 250 s (both tarball shapes, six peer profiles each, plus harness tests). |
| `pnpm test:ci:check` with `umask 022` | 615 passed; workflow agrees with the 26-workspace model. |
| `pnpm test:groups:check` | 18 passed; 12 groups covering 26 workspaces. |
| `pnpm lint`, frozen workspace install, `git diff --check` | Passed. |

The two timing cases passed in the [separate opt-in ATT-06 run](att-06-handoff.md#verification).
The CI and group checks are local validation, not live GitHub workflow evidence.
The [independent review](independent-review.md) found two S3 transport blockers after these checks.
This section is evidence for the pre-remediation implementation, not final acceptance.

No live AWS/Azure, external mail, production cloud IAM, multi-gateway consistency, real cloud lifecycle
purge or workflow rollout was tested. The maintained code/tests and linked recipes are the reproduction inputs; raw logs,
downloads, credentials, emulator data, toolchains, tarballs and generated consumers are omitted.
