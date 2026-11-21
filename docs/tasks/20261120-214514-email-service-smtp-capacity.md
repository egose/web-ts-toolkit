# Email Service: Bounded large SMTP envelopes

Created: 2026-11-20 21:45:14 UTC.

Status: **complete — SMTP-CAP-01 through SMTP-CAP-04 implemented and verified**. No release or downstream rollout
was performed.

## Objective and scope

Let independent hosts opt in to larger **single-message SMTP envelopes** in `@web-ts-toolkit/email-service`. A host
supplies the complete To/Cc/Bcc envelope and retains control of its own audience, authorization, content, and audit
records. The package keeps the same prepare, admit, submit, and inspect lifecycle. Do not split one submission into
multiple messages, truncate the envelope, or change recipient visibility to fit a limit.

- Keep the current default of **50 total recipients**. Leave SendGrid behavior, schemas used by existing V1 stores,
  and default SMTP behavior unchanged when the new capability is not enabled.
- Design for a first supported opt-in ceiling of **1,000 recipients**. This is an acceptance target, not a guarantee
  that any given SMTP relay accepts that many. Document how to choose a lower limit and how recipient count interacts
  with total message size. Defer higher ceilings until there is separate capacity evidence.
- Configuration must be bounded, explicit, and supplied by trusted host code. Two consumers in the same process must
  be able to use different settings without changing one another's behavior. No application-specific models, environment
  variables, address formats, mail relays, or business workflows belong in the package contract.
- Non-goals: plaintext SMTP, campaigns or list management, automatic batching or relay failover, inbox tracking,
  admin UI, and downstream application migration. Account for the current 512 KiB HTML and 256 KiB text caps in the
  combined snapshot budget. Widening either rendered body cap would be a separate decision.

## Baseline and risks

Reviewed source at `bc086cc6` with a clean checkout; the published baseline is `0.72.0`. This follow-up does not replace
the [original package task](20261118-223259-email-service-package.md) or the
[V1 contract](../task-artifacts/email-service/20261118-223259-email-service-package/v1-contract.md).
These findings are from source inspection, not new test or performance results.

- **Prepared messages:** [`constants.ts`](../../packages/email-service/src/constants.ts) and
  [`message-codecs.ts`](../../packages/email-service/src/internal/message-codecs.ts) cap the whole envelope at 50.
  Canonical snapshot hashing also has a 1 MiB byte cap and a JSON value cap; each mailbox consumes multiple values.
- **Attempt evidence:** [`attempt-codecs.ts`](../../packages/email-service/src/internal/attempt-codecs.ts) bounds
  recipient arrays and indexes. [`activity-codecs.ts`](../../packages/email-service/src/internal/activity-codecs.ts),
  [`job-transitions.ts`](../../packages/email-service/src/internal/job-transitions.ts), and
  [`worker-evidence.ts`](../../packages/email-service/src/internal/worker-evidence.ts) size and compare evidence with
  8 KiB budgets. A successful SMTP submission must not become unrecordable because its result is too large.
- **Stored records:** [`records.ts`](../../packages/email-service/src/stores/mongoose/records.ts) embeds the recipient
  limits in MongoDB validators for jobs and activities. [`schema.ts`](../../packages/email-service/src/stores/mongoose/schema.ts)
  requires exact validator matches on readiness. A blind increase would reject existing stores.
- **SMTP time budget:** [`submit.ts`](../../packages/email-service/src/providers/smtp/submit.ts) waits for each recipient
  reply before issuing the next `RCPT TO`. The existing 15-second default and 60-second maximum provider deadlines
  include connection, TLS, envelope, and content transfer. Loopback success alone does not establish feasibility on a
  relay with network latency.

## Work items

Execute in order after authorization. Keep `SMTP-CAP-02` onward pending until `SMTP-CAP-01` has an approved design.

### SMTP-CAP-01 — Freeze the capacity and compatibility contract

Status: `complete` · [approved implementation contract](../task-artifacts/email-service/20261120-214514-email-service-smtp-capacity/implementation-contract.md)
and [verified-TLS V1 timing](../task-artifacts/email-service/20261120-214514-email-service-smtp-capacity/v1-timing.md).
The design keeps serial SMTP and the existing timeout ranges. The 1,000-recipient target is conditional
on measured relay headroom and must still be demonstrated at that count in `SMTP-CAP-03`.

- Specify where the trusted opt-in and effective limit are set and how preparation, queued snapshots, stores, workers,
  and admin readers recognize them. Reject incompatible capabilities/configurations before submission. Do not rely
  on a worker option alone to widen a limit enforced during admission and storage.
- Quantify maximum supported snapshot, attempt, job, activity, and page bytes and value counts; include mixed/bounded
  To/Cc/Bcc names, existing body parts, the maximum attempt ledger, and complete recipient outcomes. Bound concurrent
  work and storage reads as well as the size of an individual document. If a combined byte ceiling is reached before
  the recipient count, document and reject that message before any provider call.
- Select an explicit compatibility strategy: for example, a separate versioned storage format and namespace,
  or a reviewed transition that keeps existing V1 data usable. Cover old and new runtimes, outstanding work,
  retention, rollback, and third-party stores. Do not change existing validators automatically, drop records, or let
  a worker without the new capability claim a larger job.
- Measure the existing serial SMTP path at supported V1 sizes with a TLS loopback peer and documented reply delays.
  Model whether 1,000 recipients can fit within the time budget; confirm that estimate at the new limit in
  `SMTP-CAP-03`. If the evidence does not support the target, record the limitation and get a decision before changing
  the target, deadline limits, or SMTP protocol behavior.

### SMTP-CAP-02 — Implement opt-in preparation, persistence, and reads

Status: `complete` · [persistence verification and legacy-runtime audit](../task-artifacts/email-service/20261120-214514-email-service-smtp-capacity/cap-02-verification.md).

- Reuse the queue and worker state machine. Enforce the approved limits across template preparation, prepared
  admission, batch admission, provider validation, authoritative job reads, and history projection. Store enough
  immutable identity to handle restarts and detect conflicting admission replays; retries use the original envelope
  and content.
- Prove that all valid outcomes at the admitted ceiling can be persisted and read, including a complete mixed
  recipient result and a retry ledger at its cap. Retain redacted group/index evidence, deterministic integrity checks,
  and bounded history pagination. Do not return recipient addresses, private content, credentials, or raw SMTP replies.
- Keep existing V1 snapshots and records readable with their current identity and history. Prove the selected upgrade
  and rollback paths against real MongoDB using disposable fixtures; unsupported store combinations fail closed.

### SMTP-CAP-03 — Verify SMTP submission and recovery at scale

Status: `complete` · [wire and recovery verification](../task-artifacts/email-service/20261120-214514-email-service-smtp-capacity/cap-03-verification.md)
and [measured timing](../task-artifacts/email-service/20261120-214514-email-service-smtp-capacity/cap-03-timing.md).
The real worker submitted a single 1,000-recipient transaction in each successful loopback test. No SMTP
protocol or deadline changes were needed.

- Retain verified TLS, cancellation of actual network I/O, lease and expiry checks, and an acknowledged handoff before
  transmission. Measure supported relay round-trip budgets at the enabled ceiling. Any change to serial submission
  requires a separately reviewed protocol design and reply-to-recipient ordering tests.
- Preserve To/Cc header visibility and Bcc envelope-only behavior. Verify one SMTP transaction per attempt, exact
  group/index outcome mapping, and no auto-resend after partial or uncertain acceptance. Retry only on definitive,
  safe transient nonacceptance. Test delayed and lost replies, recovery before and after handoff, and unconfirmed
  finalization after SMTP acceptance.

### SMTP-CAP-04 — Prove portability and document the installed contract

Status: `complete` · [installed-consumer acceptance](../task-artifacts/email-service/20261120-214514-email-service-smtp-capacity/cap-04-acceptance.md).
The package suite passed 515 tests and 12 packed checks on Node 26.12.1, and all 12 packed checks passed
again on Node 24.0.0. The two extended timing tests skipped by the default runner passed separately
in `SMTP-CAP-03`.

- Test the current default boundary (50 passes, 51 rejected), the supported opt-in boundary (51 and 1,000 pass,
  1,001 rejected at the target ceiling), aggregate byte limits, and invalid option combinations. Verify the existing
  SendGrid live/sandbox behavior and the current SMTP path without opt-in. Use synthetic recipients and no external
  SMTP submissions.
- Verify two independent consumers using different policies in one process. Exercise separate scopes and any required
  store namespaces, and prove enabling capacity on one consumer does not relax the other. Cover packed ESM/CJS and
  strict TypeScript consumers, the supported Node floor, optional peers, and existing imports.
- Document the typed opt-in in shipped declarations and the [package README](../../packages/email-service/README.md).
  Include defaults, effective count/size limits, verified TLS setup for local tests, relay/deadline prerequisites,
  compatible store versions, failure behavior, and upgrade/rollback. Use standalone examples with synthetic data;
  no private integrations or knowledge of repository internals should be needed.

## Verification and handoff

When authorized, run focused checks using `test:unit`, `test:lifecycle`, `test:smtp`, `test:mongodb`, and
`test:sendgrid` as applicable. Run the complete suite serially from `<repo-root>`:

```sh
pnpm --filter @web-ts-toolkit/email-service test
git diff --check
```

The package test runner builds the package, typechecks, exercises the adapters, and checks packed consumers.
The [evidence index](../task-artifacts/email-service/20261120-214514-email-service-smtp-capacity/README.md) links
the approved design, measurements, compatibility checks, and final acceptance. All runtime evidence uses
synthetic TLS loopback or disposable MongoDB fixtures. Qualify any real relay separately before enabling capacity;
the configured recipient ceiling does not guarantee the relay's limits or latency.
