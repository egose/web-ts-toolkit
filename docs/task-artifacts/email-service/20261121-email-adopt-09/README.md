# EMAIL-ADOPT-09 implementation handoff

[EMAIL-ADOPT-09](../../../tasks/20261121-022138-email-service-cross-project-adoption.md#email-adopt-09--make-the-installed-readme-sufficient-for-a-first-integration)
updates installed docs and tests on top of `39848121` and EMAIL-ADOPT-01–08. No runtime feature, catalog change,
or task status edit.

- The [first example](../../../../packages/email-service/README.md#quickstart-enqueue-and-inspect-a-synthetic-submission)
  is a standalone, root-only TypeScript module: define the receipt template, ready the memory store, enqueue one
  stable event, run the matching synthetic SMTP profile, read a redacted job, and shut down. The packed runner
  extracts it without setup or injected imports, compiles it, and asserts one synthetic acceptance and no
  addresses or content, under the network guard.
- [Support and limits](../../../../packages/email-service/README.md#support-and-limits) distinguishes delivery
  protocols, optional peers, storage and adapter duties. Both pinned GitHub blobs and their rendered anchors
  were checked, along with README anchors and the absence of links to unshipped relative files. The installed
  README identifies the current claim and admission rules that supersede the historical baselines.
- The [cookbook fixtures](../../../../packages/email-service/test/packed-consumer/fixtures/readme-core.mjs)
  exercise the scheduled reminder's due time, frozen expiry, retained replay and conflict on a changed schedule.
  An advanced store clock proves that three deferrals use all default claims with zero provider calls.
  The error example checks a known code on `unknown`; the runtime matrix observes the different class identities
  under both all-ESM and all-CommonJS imports. The capacity example shares one binding across producer, relay,
  worker, combined batch and admin; the packed integration tests admission and replay without sending.
- [Recovery](../../../../packages/email-service/README.md#recover-unresolved-submissions) follows
  [EMAIL-ADOPT-08](../20261121-email-adopt-08/README.md#recover-unresolved-submissions): capture scoped IDs,
  verify the exact open attempt via `getJob`, and use bounded reconciliation and historical paging only to
  find candidates if the IDs are missing. The redrive, dismissal, uncertain-write and retention guards are
  unchanged. There is no authoritative worklist query.

## Verification

From the checkout root, with dependencies installed, a warm offline pnpm store and a disposable local MongoDB
8.2.6 binary (replace both placeholders):

```sh
cd '<repo-root>'
set -e
scratch="$(mktemp -d "$PWD/_tmpXXXXXX")"
git check-ignore -q -- "$scratch"
export TMPDIR="$scratch" EMAIL_SERVICE_CONSUMER_OFFLINE=1
export MONGOMS_SYSTEM_BINARY='<local-mongod-8.2.6>'
export MONGOMS_VERSION=8.2.6 MONGOMS_RUNTIME_DOWNLOAD=false
pnpm --filter @web-ts-toolkit/email-service typecheck
pnpm --filter @web-ts-toolkit/email-service build
pnpm --filter @web-ts-toolkit/email-service test:packed-consumer
```

- Typecheck, build and packed tests passed serially on Node 26.12.1, pnpm 11.24.0 and TypeScript 6.0.3.
  All eight built CJS/ESM runtime files were byte-identical before and after the JSDoc changes.
- Packed consumer: **12 passed, none skipped**. Both the ordinary and flattened release tarballs were checked
  with neither peer, each peer alone, and both peers (Nodemailer 10.6.0 and Mongoose 9.12.2). The installed
  matrix checks ESM/CJS declarations and runtime. The no-peer and both-peer profiles compile the README using
  strict Bundler and NodeNext resolution; all 18 fences are mapped. Declaration checks cover the new readiness,
  scheduling, retry, error and operator JSDoc in both formats.
- `pnpm lint`, targeted `pnpm exec prettier --check` and `git diff --check` passed.

The lane uses two disposable one-member Mongo replica sets (one per tarball shape). It is not a live-provider
or production topology test, and does not replace the full serial package run in EMAIL-ADOPT-10.
Raw logs, generated consumers, tarballs, databases, binaries and dependencies are omitted; reproduce from
the maintained fixtures, not this summary alone.

## Reopened resolution — fixed SMTP client greeting

[Finding 2](../20261121-email-adopt-10/README.md#L52-L57) is addressed in the
[installed SMTP profile guidance](../../../../packages/email-service/README.md#configure-an-smtp-profile)
and [`SmtpProviderOptions.servername` JSDoc](../../../../packages/email-service/src/smtp.ts#L21-L25).
The adapter sends `EHLO email.invalid` before and after required STARTTLS, or once over implicit TLS.
`servername` is the remote TLS name for SNI and certificate verification, not the SMTP client name.
Relays requiring a different EHLO name are not supported; there is no option or wire change.

The [STARTTLS loopback test](../../../../packages/email-service/test/smtp/smtp.test.ts#L344-L364) checks
both greetings and the separate SNI value. The [implicit TLS test](../../../../packages/email-service/test/smtp/smtp.test.ts#L276-L286)
checks the encrypted greeting and no plaintext commands. The README and both SMTP declaration formats carry
the new guidance in ordinary and release-shaped installs. All 18 README TypeScript blocks are unchanged,
including the [reopened 03 provider example](../../../../packages/email-service/README.md#implement-a-custom-provider).

The rerun used the serial commands above with a fresh verified `_tmp*` directory, a warm offline pnpm store
and disposable MongoDB 8.2.6, followed by `pnpm --filter @web-ts-toolkit/email-service test:smtp` with
`SMTP_CAPACITY_TIMING` unset. Typecheck and build passed; all eight runtime bundles were byte-identical.
Packed consumer: 12 passed, none skipped. Loopback SMTP: 65 passed, two optional timing cases skipped.
Link checks (including the pinned Store anchors), targeted formatting, lint and `git diff --check` passed.
No live mail or EMAIL-ADOPT-10 rerun.
