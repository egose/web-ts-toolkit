# EMAIL-12 independent acceptance and handoff

**Accepted for package scope on 2026-11-20.** As the single independent reviewer, I did not implement any
prior stage. I reviewed the [task](../../../tasks/20261118-223259-email-service-package.md#email-12--final-acceptance-and-handoff),
the [frozen V1 contract and failure matrix](v1-contract.md#verification-matrix), the EMAIL-01 through EMAIL-11
handoffs (including 07A/B/C), and the current source, maintained tests, README, emitted boundaries and diffs.
No open P0/P1 package blocker or mandatory package lane without evidence was found. This is not approval to deploy.

## Source-delivery finding — resolved in the working tree

The parent's file inventory caught a material omission: the root generated-declaration rule ignored the
[handwritten Handlebars shim](../../../../packages/email-service/src/templates/handlebars.d.ts). The local checkout
had its bytes, but a source change assembled from the previous nonignored file list would omit it. In the parent's
read-only TypeScript 6.0.3 compiler-API probe, excluding only that shim from the package tsconfig's in-memory
`rootNames` yielded exactly two `TS7016` diagnostics for `handlebars/dist/cjs/handlebars.js`:
`src/templates/local-renderer.ts` and `test/unit/local-renderer.test.ts` in the package. The probe did not edit files.

The parent added a single exact negation after the generated `.d.ts` rule in [`.gitignore`](../../../../.gitignore).
I independently verified that `git ls-files --others --exclude-standard -- packages/email-service/src/templates/handlebars.d.ts`
now lists the shim, and that `git check-ignore -v` still reports the `dist` rule for built JS and both declaration
formats and the original rule for unrelated source `.d.ts` paths. A normal package typecheck passes;
`typecheck --listFiles` on the corrected tree also passed and listed this shim. Neither shim bytes nor runtime,
test or pack contents changed in the correction. The EMAIL-11 local runs included the identical shim; they are not
evidence that a clean checkout without it would have built. Include **both** the ignore exception and the shim in
any later authorized source delivery. No clean-checkout build was performed in EMAIL-12.

## The five requirements

<!-- prettier-ignore -->
| Requirement | Source and evidence reviewed |
| --- | --- |
| Local templates | The [registry](../../../../packages/email-service/src/templates/registry.ts), [renderer](../../../../packages/email-service/src/templates/local-renderer.ts) and [source loaders](../../../../packages/email-service/src/templates/local-sources.ts) pair keys with typed parsers and sync/async preparation, handle inline, explicit file and async content, isolate helpers, and bound the cache with revision and invalidation fencing. HTML escapes by default; subject/text are plain, unsafe header fields fail validation. [Type/codec, rendering and loader evidence](email-02-templates.md#verification) is maintained. The renderer is not a sanitizer or a sandbox. |
| SendGrid templates | That same registry freezes a validated template ID, dynamic data, envelope and metadata without a credential, and the [profile](../../../../packages/email-service/src/providers/sendgrid/profile.ts) maps them to the fixed Mail Send endpoint as one personalization. [`202`, sandbox `200`, `429`, and ambiguous replies](email-06-sendgrid.md#verification) are tested at a controlled real HTTPS boundary, with no invented recipient results. No template administration or remote active-version pinning. |
| Durable jobs/queue | [Admission](../../../../packages/email-service/src/service.ts) looks up the exact scoped intent fingerprint before preparation and uses one exact confirmation read after uncertainty, never a second insert in that call. Staged relay validates the V1 DTO/hashes without rerendering or refreshing expiry. [Worker and store transitions](v1-contract.md#job-state-machine) implement scheduling, bounded claims, leased ownership and cancellation, acknowledged handoff and retry/recovery. I traced these in the [worker](../../../../packages/email-service/src/internal/worker-attempt.ts), [finish path](../../../../packages/email-service/src/internal/worker-finish.ts), [shared reducer](../../../../packages/email-service/src/internal/job-transitions.ts) and [Mongo CAS](../../../../packages/email-service/src/stores/mongoose/operations.ts), and checked the [both-store lifecycle coverage](email-07c-lifecycle.md#maintained-scenarios). Memory is non-durable, never a fallback. |
| Batch service | The [root batch factory](../../../../packages/email-service/src/batch.ts) prevalidates all command envelopes and stable tagged item identities before writes, then reuses admission in order with independent item results. Reordering and partial progress can be resumed with the same scoped IDs and intents while the guard is retained. `run` delegates the bounded whole-scope worker and is neither a batch filter nor a SendGrid `batch_id`; no batch transaction or second delivery path. [Lifecycle evidence](email-08-batch.md#verification) covers both providers and stores, including unrelated same-scope work. Only a host-supplied shared limiter enforces a shared quota. |
| Persistent submission history | Finalization atomically stores one authoritative attempt with the job transition. [Admin](../../../../packages/email-service/src/admin.ts) independently reconciles committed history, exposes a safe summary before projection, and pages complete redacted activities using validated scoped cursors. [Mongo storage](email-04-mongoose.md#verification-and-limits) and the [admin/retention evidence](email-09-admin.md#verification) cover immutable digest-keyed projection, uncertain ACKs, competing projectors and activity-before-identity deletion. Neither admin nor cleanup can submit. |

## Critical guarantees and operating limits

- A claim, renewal or marker that is late or not positively confirmed cannot authorize I/O. No read of a
  possibly committed marker authorizes a send. A timely exact marker ACK still requires an open launch window.
  Recovered pre-handoff work is unsubmitted; recovered post-handoff work is terminal `unknown`. Finish uncertainty
  can be resolved by exact attempt confirmation or bounded retry of the **same fenced finish** only. Reported
  `unconfirmed` is not a stored `unknown` and neither is proof of rejection.
- Retry is for bounded, proven safe transient rejection or non-transmission only: e.g. definitive SMTP nonacceptance
  and a complete SendGrid `429` that preserves valid retry floors. An SMTP reset after DATA or a truncated/malformed
  HTTPS response is not permission to retry. Accepted, partially accepted, validated and unknown attempts never
  automatically resend, and there is no failover. SMTP RCPT alone is not acceptance; To/Cc and envelope-only Bcc
  stay as prepared. Cancellation cannot recall after handoff. Explicit unknown redrive allows one additional,
  non-auto-retrying claim and can duplicate; the host must quiesce suspected old workers first. Submission acceptance
  is not inbox delivery, and neither the queue nor preparation guarantees exactly-once effects.
- Private queue and outbox payloads can contain addresses, bodies, links/tokens and dynamic data; treat them and
  their backups accordingly. Attachment references require exact length and hash on copied bytes, not an implicit
  file/URL fetch; a mutable source can lose eligibility. Activities and public summaries omit payloads, recipient
  addresses, attachment data, ownership tokens and raw provider or callback errors. Results can expose fixed codes,
  safe bounded IDs and reliably known recipient indexes. Scope/cursors are not auth; hosts must authorize access,
  keep PII and secrets out of IDs/correlation, and disable raw driver or provider tracing. Provider message-ID filtering
  is not general secret detection. Direct adapter calls and custom ports do not inherit built-in queue/I/O assurances.
- Retention windows are minima from settled terminal time, not deletion deadlines. Unresolved unknowns and
  unacknowledged projections protect the payload and guard. Following eligible prune, purge waits for the latest
  payload/history/idempotency deadline and the projection permit drain, then deletes scoped activities before the
  identity guard. Only expired projection stubs use TTL. Reconcile/cleanup and cursor scans are bounded; page reads
  are not snapshots. Use the same admission key within retention, not a replacement key after an uncertain reply.
- The Mongoose adapter requires a caller-open, explicitly readied MongoDB 8.x WiredTiger replica set with journaled
  majority writes, primary linearizable point reads, majority indexed scans, dedicated compatible collections/indexes,
  supported driver settings and the documented one-second clock assumption. It does not register or close caller
  models/connections. [EMAIL-10](email-10-robustness.md#evidence-strength-and-operating-limits) distinguishes genuine
  TCP/TLS and peer-observed close, Mongo command interruption and real three-member election from simulated
  pre-/post-write reply loss and aged fixtures. This does not establish power-loss durability, all network partitions,
  a committed TCP-ACK drop during election, production skew/load, remote recall, or live mail. Uncooperative custom
  I/O and synchronous host callbacks cannot be forcibly preempted.

## Package and installed consumer boundary

I checked the [manifest](../../../../packages/email-service/package.json), [bundled build](../../../../packages/email-service/tsup.config.ts),
all four source entrypoints, the [shipped README](../../../../packages/email-service/README.md) and the pre-existing
`dist` (read-only). The 16 mapped ESM/CJS JS and declaration targets and four private declaration chunks are present.
The type chunks resolve within their matching formats; I inspected emitted JSDoc in both formats. No JS has local
relative runtime imports. The root is named exports for templates, service, worker, batch, admin, memory store,
`EmailError` and plain contracts; it only lazily loads Handlebars at render time in addition to Node built-ins.
`./smtp` needs the optional Nodemailer runtime peer, not its declarations. `./sendgrid` is built-in HTTPS without an
SDK or peer. `./mongoose` loads without a runtime Mongoose import, but its declarations and usable caller connection
need that optional peer. No default export, public deep imports or import-time network, timers or model registration
are part of the advertised boundary. The Nodemailer 10 range is the recorded [EMAIL-01 decision](email-01-packaging.md#smtp-dependency-decision),
not an unrecorded deviation from the original V1 proposal.

I reviewed the [packed test](../../../../packages/email-service/test/packed-consumer/packaging.test.mjs), not a new
install run. [EMAIL-11](email-11-installed-consumers.md#final-serial-pass-2026-11-20) records the successful ordinary
and flattened release tarballs (real 0.41.2 release helper on copies; `VERSION` 0.71.0), both module formats and
strict NodeNext/Bundler declaration conditions, and no peers, each peer alone and both together. Exact peer floors
were Nodemailer 10.6.0 and Mongoose 9.12.2, with Handlebars 4.7.10. The installed README's 13 TypeScript examples
were checked with both peers (nine with neither); the storage example used isolated loopback Mongo, the outbox
commit was a serialization fixture, and examples did not deliver mail. Actual peer wire/lifecycle behavior is
evidence from the package lanes, not from a README smoke. The separate floor run used Node 24.0.0 for **installed
runtime and TypeScript consumers**, not the harness or the full canonical suite. No other installer, every later
peer/runtime version, or registry publication is established.

## Verification and next steps

- **Reproduced here:** package `typecheck`, `typecheck --listFiles` for the shim, and `test:unit`, all with fresh
  verified gitignored repository-local `TMPDIR` directories. Node 26.12.1, pnpm 11.24.0, TypeScript 6.0.3,
  Vitest 4.1.12: **228 tests in 19 files passed**. From `<repo-root>`, set `TMPDIR` to a fresh ignored `_tmp*`
  directory and run `pnpm --filter @web-ts-toolkit/email-service typecheck` and
  `pnpm --filter @web-ts-toolkit/email-service test:unit`.
- **Relied on, not rerun:** EMAIL-11's canonical build/typecheck plus unit (228), memory lifecycle (27), SMTP
  loopback (51), SendGrid loopback (91), MongoDB (95), and packed lane (12 Node test-runner results), plus the
  separate 12-result packed floor run. The canonical run used Node 26.12.1, pnpm 11.24.0, npm 11.20.0,
  TypeScript 6.0.3, tsup 8.5.1 and Vitest 4.1.12. Mongo evidence is for MongoDB 8.2.6 WiredTiger,
  Mongoose 9.12.2, driver 7.8.0 and `mongodb-memory-server`/core 11.3.0. This cites the final successful runs,
  not the earlier aborted/timed-out preflights.
- **Static CI/group review only:** I compared the active YAML to `HEAD`: the new `test-email-service` job matches
  the existing single-prerequisite job shape, depends only on `ci-prepare`, and removal of that job and its one
  aggregate edge reproduces the prior YAML. The only email build writer is `build:package`; group 2 contains
  email-service exactly once with no workspace output dependency or test-access override. The model uses the full
  package `test` command (one build, typecheck, then six serial lanes). The selected-SHA action path does a frozen
  installation, verifies the same-run/attempt/checkout archive and prepares Mongo only for this package (8.2.6 by
  default, via the prepared binary). Email adds one of 32 output roots, 16 manifest-required files, and one of
  nine Mongo jobs. The 26 package jobs give 28 unique direct `unit-test` needs, 29 generated main jobs and 32 total
  jobs. I checked the aggregate and updated fixture expectations by inspection: `always()`, exact required results,
  all-success only, and no package dependents on the email job. Independent lint/minimum-Node/React lanes remain.
- **Hygiene:** checked relative links and Markdown anchors, changed-path inventory and whitespace (including
  untracked files), and nonignored durable evidence. Reviewed artifact text for credentials, private identifiers,
  non-synthetic addresses and machine-local paths. The two fresh scratch directories held only disposable Node
  compile cache; no evidence depends on them. No raw logs, timings outside those cited, database contents, binaries,
  tarballs, generated builds/consumers or dependencies are archived here.

Root `test:ci:check` and `test:groups:check` and their contract tests remain unrun under package-only authorization;
this static review does not substitute for them. They are not missing package lanes. Hosted healthy/failure/
preparation-failure/cancellation/missing or skipped result evidence and confirmation that the required check still
targets `unit-test` remain separately maintainer-gated. No workspace build/lint/test, hosted workflow, branch-protection
change, live mail, broad release, publication, or commit was performed. The implementation, wiring, source-delivery
correction and evidence remain uncommitted.

## Coordinator confirmation

After the review was saved, the coordinator copied the 132 package files listed by
`git ls-files --cached --others --exclude-standard -- packages/email-service` into fresh ignored repository-local
scratch. The copy included the handwritten shim but no `dist` or installed dependencies. TypeScript 6.0.3
`tsc --noEmit -p <copied-package>/tsconfig.json` passed against that copy with the existing dependency installation
linked for resolution. This checks the Git-visible source inventory, not a fresh dependency install or full build.
The coordinator also reran `pnpm --filter @web-ts-toolkit/email-service test:unit` on Node 26.12.1 with the same
verified scratch base: all 228 tests passed in 19 files. No scratch files or new external evidence are required.
