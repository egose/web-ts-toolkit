# Generic Email Service: `@web-ts-toolkit/email-service`

Created: 2026-11-18 22:32:59 UTC.

Overall status: **completed — EMAIL-00 contract frozen; EMAIL-01 through EMAIL-12 complete for package scope**.

Implementation authority: this task and the [frozen V1 contract](../task-artifacts/email-service/20261118-223259-email-service-package/v1-contract.md).
The contract fixes the API, defaults, persistence transitions, and failure matrix before implementation.

## Objective and confirmed requirements

Create a generic, robust TypeScript email-delivery package covering:

1. Registration of static and dynamic local templates, with Handlebars rendering
   of subject, HTML, and text using prepared values.
2. Registration of SendGrid template definitions together with preparation
   functions that produce their required values and sending metadata.
3. Durable email jobs and queues, including scheduling, idempotency, bounded
   retries, cancellation, and recovery.
4. An exported email batch service for enqueueing multiple messages and processing
   bounded delivery batches.
5. Persistent, queryable SMTP and SendGrid submission results and attempt history.

The two required delivery paths are:

- **SMTP:** prepare values, render a local Handlebars template, and submit the
  rendered message through an SMTP transport.
- **SendGrid API:** prepare values and submit the resolved SendGrid template ID
  with `dynamic_template_data`; SendGrid performs the rendering.

SendGrid template management means application-side template registration and
preparation logic. It does **not** mean creating, updating, deleting, or activating
templates through SendGrid's template-administration API.

Design the package as a standalone, generic email-delivery system. Define its
public contracts, schemas, and collection names according to reliability,
security, and consumer usability rather than any existing application's design.
All implementation requirements and acceptance criteria are specified here;
continuation must not depend on source or task references outside this repository.

## Baseline and repository context

Baseline reviewed at task creation:

- Repository revision: `420b101`; `git status --short` was clean.
- `packages/email-service/` does not exist.
- `pnpm-workspace.yaml` already discovers `packages/*`.
- Root `package.json` declares Node.js `>=24`.
- `packages/message-service/src/providers/email.ts` exposes an application email
  callback, but that package owns in-application messages and actions rather than
  this email-delivery lifecycle.
- Root package tests are intentionally serialized. `scripts/test-groups.mjs`
  validates dependency build/read conflicts for local grouped pre-flight; the
  active gated `Test` workflow is a separate static CI dependency graph.
- No package implementation, builds, runtime tests, or actual email submissions
  were performed to create this task.

### Repository references

- `AGENTS.md`
- `docs/tasks/README.md`
- `docs/task-artifacts/README.md`
- `.opencode/skills/ai-friendly-ts-package/SKILL.md`
- `package.json`, `pnpm-workspace.yaml`, and `tsconfig.base.json`
- `scripts/test-groups.mjs` and `scripts/test-groups.test.mjs`
- `scripts/ci-test-plan.mjs`, `scripts/ci-test-artifacts.mjs`,
  `scripts/ci-test-workspace.mjs`, `scripts/ci-test-results.mjs`, and
  `.github/workflows/test.yml`
- `packages/message-service/src/providers/email.ts`
- `packages/message-service/test/message-service.packed-consumer.test.ts`
- `packages/express-oidc-vault-mongodb-store/src/index.ts` for caller-owned
  connection and explicit readiness patterns

The repository references above establish workspace conventions and integration
patterns, not a pre-existing email-service contract. Tests and examples must use
synthetic maintained fixtures, not private addresses, template IDs, tokens,
credentials, or application data. Record provenance and license obligations for
incorporated code or fixtures.

## Scope, package boundary, and non-goals

### Intended package shape

- Package directory: `packages/email-service/`.
- Package name: `@web-ts-toolkit/email-service`.
- Runtime: Node.js `>=24`.
- Canonical usage: named imports, with ESM and CommonJS outputs and matching
  declaration conditions.
- Core APIs use plain TypeScript contracts and opaque string identifiers, not
  Express requests, Mongoose documents, ObjectIds, or application-specific domain
  types.
- One main package with entries `.`, `./smtp`, `./sendgrid`, and `./mongoose`.
- Handlebars is the required local rendering engine. SMTP uses Nodemailer or a
  compatible injected transport behind an explicit adapter.
- Mongoose/MongoDB is the first durable storage adapter, not a core requirement.
  Root declarations and runtime imports must work without installing optional
  integration peers.
- Publish self-sufficient `README.md`, JavaScript, and declarations through a
  correct `package.json` export map. Build internal source with bundling or another
  proven plain-Node-safe layout; do not publish unresolved relative specifiers.
- No import-time connections, timers, network requests, model registration, or
  mutable global registry/provider configuration.

### Non-goals for V1

- Application-specific integration or database migration work.
- SendGrid template/version administration or local emulation of SendGrid rendering.
- A composer UI, marketing campaign platform, contact directory, or mailing-list
  management system.
- Application JWT generation, recipient-directory lookup, notification business
  rules, payment bookkeeping, preference management, or domain-specific attachment
  generation.
- Automatic provider failover or an exactly-once email-delivery guarantee.
- Redis/BullMQ, another durable backend, a bundled cron/Bree scheduler, or a CLI.
- Inbox-delivery tracking, signed SendGrid webhook ingestion, or SMTP DSN
  processing. Submission results must leave room for these later, without
  claiming they exist in V1.
- HTTP CRUD routes exposing private jobs or raw persistence models.
- Browser runtime support, committing, publishing, tagging, or sending real
  external emails as part of implementation verification.

## V1 design requirements

These requirements are authoritative. The linked V1 contract specifies exact API
spelling, states, numeric defaults, serialization, and index definitions.

### 1. Typed templates and preparation

- Distinguish local Handlebars definitions from SendGrid definitions through
  discriminated types. A template key determines its input and prepared-data
  types; do not reduce the entire surface to unrestricted dictionaries or `any`.
- A synchronous or asynchronous `prepare(input, context)` can produce recipients,
  template values, sender/reply-to overrides, expiry, priority, attachment
  references, and bounded correlation metadata.
- Preparation functions are trusted application code. Keep business-specific
  behavior in host-supplied definitions or dependencies.
- Provide runtime validation boundaries for inputs, prepared values, addresses,
  template metadata, and serialized messages. Invalid provider/template
  combinations must fail before network submission.
- Expose preparation separately so a host can stage prepared intent with its own
  business transaction/source write and relay it idempotently afterward.
- Raw business inputs, functions, request objects, hydrated documents, and
  credentials must not become persisted queue payloads implicitly.
- Snapshot prepared data and local rendered content before a job becomes eligible
  for submission. Delivery retries reuse that snapshot; they do not regenerate
  tokens, extend expiry, change recipients, or rerun template loaders.
- An enqueue crash before snapshot persistence may rerun preparation. Document
  that arbitrary callback side effects are not exactly once; use idempotent
  callbacks or host-owned durable outbox staging.
- Support inline strings, explicit file sources, and asynchronous sources for
  local templates. Define source revision, invalidation, and bounded caching
  semantics; no unbounded per-request compilation cache.
- Isolate Handlebars environments/helpers per registry. HTML values escape by
  default; subject/text are plain text and headers reject injection. Handlebars
  escaping is not general HTML sanitization or a sandbox for untrusted templates.
- Missing engines, templates, invalid values, or failed source loads produce typed
  errors, never placeholder emails or silently unrendered templates.

### 2. Prepared messages and providers

- Prepared SMTP messages contain an explicit envelope and frozen subject/HTML/text.
  Prepared SendGrid messages contain an explicit envelope, resolved template ID,
  and validated dynamic data. Provider keys select caller-configured profiles.
- Preserve To/Cc/Bcc semantics; do not convert a visible multi-recipient envelope
  into private per-recipient sends implicitly. Personalized batches default to
  separate logical messages rather than one shared To list.
- Support generic bounded attachments through explicit resolvers. Queued records
  must not contain streams, functions, arbitrary filesystem paths, or transport
  credentials. Freeze reference/version semantics and disclose when a backing
  attachment source is mutable rather than claiming byte-for-byte replay.
- Disable implicit Nodemailer file/URL access. Transport TLS, authentication,
  deadlines, and shutdown behavior are explicit, validated configuration.
- Providers return normalized submission outcomes and safe diagnostic codes.
  Keep retry classification and failure stage separate from the primary outcome.
- Recipient-level acceptance/rejection is recorded only when supplied reliably.
  SendGrid `202` is request acceptance, not invented synchronous recipient results.
- Sandbox/validation-only requests must be distinguishable from actual email
  submission and must not be reported as delivered or as an ordinary sent email.
- Bind SendGrid credentials/client configuration to an instance, not global SDK
  mutation. Bound requests and responses and honor documented throttling signals.
- A SendGrid template ID/data snapshot cannot pin its active remote version.
  Document the limitation; immutable published templates are a host policy when
  exact content consistency is required.

### 3. Queue, idempotency, and worker lifecycle

Conceptual pipeline:

```text
template key + business command
  -> scoped admission / preparation
  -> validated prepared snapshot
  -> durable job
  -> atomic worker claim
  -> durable provider-handoff marker
  -> provider submission
  -> fenced attempt finalization
  -> idempotent result projection
```

- Use an explicit application/tenant namespace for storage operations and
  idempotency. Every claim, lookup, mutation, result query, and cleanup must remain
  within its bound scope; scope separation is not host authentication.
- Freeze a stable command-identity/fingerprint contract separately from generated
  snapshot hashes. Duplicates return existing persisted jobs without re-preparing;
  conflicting reuse of a key is rejected. Nonserializable host inputs need an
  explicit canonical-intent or prepared-message boundary, not arbitrary
  `toJSON()` execution.
- Public store operations express atomic lifecycle transitions, not generic CRUD.
  Specify required durability/consistency capabilities and test every adapter
  against one conformance suite. Never fall back to memory when persistence fails.
- Claims use a distinct attempt ID and private ownership token with a finite lease.
  Stale workers cannot mark handoff, finalize, cancel, or overwrite another owner.
- Renew leases during bounded worker pre-handoff work and recheck
  ownership, cancellation, and expiry immediately before handoff.
- Persist and acknowledge the handoff marker before contacting the provider.
  Missing or uncertain persistence acknowledgement must prevent that send.
- Recover expired pre-handoff claims conservatively as unsubmitted. Recover
  expired post-handoff claims as unknown, not automatically retryable.
- Retry only demonstrably safe transient failures, using finite attempt budgets,
  capped backoff/jitter, scheduling, and expiry checks.
- Never automatically resend an unknown outcome, fail over after ambiguous
  handoff, or resend accepted recipients following partial acceptance.
- Keep job processing state, submission outcome, and future inbox-delivery state
  separate. A `sent` label or success boolean must not conflate submission
  acceptance with inbox delivery.
- Cancellation is effective only before irreversible handoff; do not claim remote
  cancellation or recall of an accepted message.
- Explicit operator resolution/redrive must preserve the original history and
  disclose duplicate risk. Accepted terminal messages cannot be silently reopened.
- Worker polling/scheduling is host-controlled. Export bounded run methods with
  an injectable clock and `AbortSignal`; shutdown stops new claims and bounds or
  aborts actual in-flight I/O rather than only abandoning a waiting promise.
- If an immediate service-send method is exposed, it uses the same durable
  lifecycle. A low-level unmanaged transport call cannot silently inherit queue
  guarantees.

### 4. Batch service

- Export a dedicated batch-service boundary that composes the same job lifecycle;
  do not create a second delivery implementation.
- Provide batch enqueueing and bounded delivery runs with configurable limits,
  concurrency, provider-rate policy, and structured per-item/run results.
- Use stable item identities and scoped idempotency, not array positions alone.
  Reordered or partially persisted batches can be resumed without resending
  completed items.
- Validate command envelopes before writes where feasible. Specify per-item
  preparation/write failure behavior and partial progress; do not imply
  all-or-nothing batch persistence unless an explicitly supported atomic operation
  provides it.
- Distinguish local `batchId` grouping from SendGrid's scheduled-send `batch_id`.
  A separate campaign/batch lifecycle is not required in V1.
- Coordinate rate policy across workers when a configured quota is shared.
  Document the actual scope of a local limiter instead of claiming cluster-wide
  enforcement.
- Bound claiming, recovery, projection, cleanup, and scanning as well as sending.
  No unbounded `Promise.all`, whole-queue materialization, or cleanup sweep.

### 5. Persistence, results, and privacy

Default MongoDB collections:

- **`email_jobs`:** versioned prepared snapshot, scheduling/state, scoped command
  identity, current lease, and a bounded authoritative attempt ledger.
- **`email_activities`:** versioned, redacted, queryable result projection, with
  one idempotent record per finalized attempt.

Use explicit configurable collection/model names. Declare defaults as part of
the package contract rather than relying on automatic model-name pluralization.

- Atomically persist attempt outcomes with job transitions before projection.
  An activity-write failure cannot undo acceptance or trigger another submission.
- Reconcile missing activities from authoritative attempts. Use a scoped unique
  job/attempt identity and persist/recover projection progress without duplicate
  history or an unbounded retry ledger.
- Result DTOs expose typed outcome, provider/profile, template identity, correlation
  IDs, timestamps, bounded diagnostic codes, message IDs, and recipient outcomes
  where known. Do not use raw `response`/`error` dumps or a boolean as authority.
- Credentials, reset/verification links, dynamic data, rendered bodies, attachment
  contents, and private ownership tokens stay out of activity records, ordinary
  logs, metrics labels, and public result DTOs.
- Queue snapshots can legitimately contain sensitive sending data. Document
  restricted access, encryption/backup controls, and separate payload/history/
  idempotency retention. TTL is cleanup, not the scheduling/expiry authority.
- Do not delete live jobs, unknown outcomes awaiting resolution, unprojected
  results, or idempotency guards within their promised retention window.
- Result queries have validated filters, stable ordering/cursors, finite page
  limits, and no arbitrary MongoDB query injection.
- Caller-owned connections/models remain caller-owned. Readiness validates
  collections, indexes, serialization/schema versions, and required backend
  capabilities. Never silently drop incompatible indexes or register global models.
- Initial templates and batches do not require separate collections. Template
  loaders may use an application-owned source collection. Delivery-event or
  independent batch collections need a later explicit requirement.

## Implementation tasks and dependency order

Implement in dependency order, with one active implementation subagent at a
time and no further delegation. Code tasks add focused tests alongside code.
The paths below are ownership targets, not claims of existing implementations.

### EMAIL-00 — Freeze the generic V1 contract

Status: completed (design only, 2026-11-19). Priority: P0. Dependencies: none.

Requirements:

- Finalize public APIs/types, provider capabilities, scope rules, enqueue
  fingerprint semantics, batch failure policy, and state-transition table.
- Specify snapshot/attachment serialization, versioning, numeric bounds,
  clock/lease assumptions, retention, cancellation, and operator resolution.
- Finalize integration entrypoints, peer/runtime support, MongoDB topology and
  durability requirements, and required test lanes.
- Keep all five confirmed requirements; justify design choices through reliability,
  security, genericity, consumer usability, and supported backend capabilities.

Acceptance: one unambiguous contract and failure matrix covers both providers;
unresolved choices are recorded as blockers rather than deferred implicitly into
implementation. No exactly-once, inbox-delivery, or arbitrary callback guarantee.

Completion evidence: [V1 contract and failure matrix](../task-artifacts/email-service/20261118-223259-email-service-package/v1-contract.md).
This checkpoint specifies the package boundaries and typed staged/direct
admission, single-job lease/fence/ledger with conservative write recovery,
provider-specific retry evidence, and redacted idempotent projection/retention.
Documentation formatting, whitespace, links/privacy, and nonignored destination
were checked (Prettier, `git diff --check` / untracked artifact whitespace,
local link/anchor review, and `git check-ignore`). No package files,
CI/manifests, builds, tests, provider calls, or live evidence; all runtime
lanes remain pending. No design blocker identified.

### EMAIL-01 — Scaffold package and public boundaries

Status: completed (scaffold, 2026-11-19). Priority: P0. Dependencies: EMAIL-00.

Ownership: package manifest, TypeScript/build/test configuration, entrypoints,
core types/errors, README skeleton, and necessary workspace registration.

Requirements:

- Use workspace metadata/release placeholders, named exports, Node `>=24`,
  correct ESM/CJS/type conditions, and a single owner for cleaning/building `dist`.
- Keep optional provider/store imports out of the root dependency/declaration
  closure. Add only approved dependencies through pnpm.
- Add `build:package`, `typecheck`, and the first real package test lane. Add
  future lane commands with their maintained tests, never as empty success gates.
  Leave the workspace-discovered `build` and `test` scripts absent until the
  coordinated activation in EMAIL-11; use the package-specific scripts meanwhile.

Acceptance: build/typecheck and installed-root import smoke pass; no import-time
side effects, unresolved output imports, accidental optional peers, or default
exports. Manifest and emitted entrypoints agree.

Completion evidence: [EMAIL-01 packaging decision and handoff](../task-artifacts/email-service/20261118-223259-email-service-package/email-01-packaging.md).
Added only the `packages/email-service/` scaffold and its dependency resolutions.
The opt-in SMTP peer is now Nodemailer `>=10.6.0 <11` rather than the vulnerable
7.x proposal; see the decision note. Mongoose is `>=9.12.2 <10`; both peers are
optional and absent from the installed root's runtime/declaration closure.

Verified from `<repo-root>` on Node 26.12.1 with pnpm 11.24.0, npm 11.20.0,
TypeScript 6.0.3 and tsup 8.5.1. The install commands added Handlebars 4.7.10
and exact dev peer floors (Mongoose 9.12.2 and Nodemailer 10.6.0), without
changing unrelated lockfile resolutions:

```sh
pnpm --filter @web-ts-toolkit/email-service add --ignore-scripts --save-prod 'handlebars@~4.7.10'
pnpm --filter @web-ts-toolkit/email-service add --ignore-scripts --save-dev --save-exact mongoose@9.12.2 nodemailer@10.6.0
pnpm --filter @web-ts-toolkit/email-service build:package
pnpm --filter @web-ts-toolkit/email-service typecheck
pnpm --filter @web-ts-toolkit/email-service test:unit
pnpm --filter @web-ts-toolkit/email-service exec npm pack --dry-run --json
pnpm --filter @web-ts-toolkit/email-service test:packed-consumer
EMAIL_SERVICE_CONSUMER_NODE='<absolute path to Node 24.0.0>' pnpm --filter @web-ts-toolkit/email-service test:packed-consumer
```

Ran using verified ignored repo-local `TMPDIR` directories. All checks passed:
five unit tests; packing contained the manifest, README and the 16 expected
outputs; pnpm installed the ordinary tarball into isolated consumers with
automatic peer installation enabled. Neither optional peer resolved from the app
or the installed package. On Node 26.12.1 and 24.0.0 the fixture exercised plain
ESM/CJS imports of all four entrypoints with network/timer guards, and strict
NodeNext ESM/CJS and bundler declarations without workspace ambient types.
Package formatting and change whitespace were checked.

No blocker for EMAIL-02. The root has shared contracts and `EmailError`; the
adapter entries have option types but no runtime factories yet (EMAIL-04/05/06).
No mail, adapter/real-MongoDB execution, release-shaped pack verification, or
root suite/build/lint. Workspace `build`/`test` scripts and CI are deferred to
EMAIL-11.

### EMAIL-02 — Implement typed templates, preparation, and rendering

Status: completed (2026-11-19). Priority: P0. Dependencies: EMAIL-00, EMAIL-01.

Ownership: template definitions/registry, preparation, validation, local sources,
Handlebars renderer/cache, and focused tests.

Requirements:

- Implement typed key/input/data inference, both template kinds, explicit defaults,
  runtime validation, immutable outputs, and separately usable preparation.
- Implement inline/file/async local sources, bounded revision-aware caching,
  registry/helper isolation, subject/text handling, and escaped HTML rendering.
- Model generic attachments/correlation without application-specific dependencies.
- Surface deterministic typed errors; no silent missing-value/source fallback.

Acceptance: sync/async preparation, invalid inputs, loader replacement, cache
invalidation/bounds, mutation isolation, escaping, missing templates, and
provider/template mismatches are tested. Type tests reject wrong template inputs.

Completion evidence and EMAIL-03 reuse points: [EMAIL-02 templates and codecs handoff](../task-artifacts/email-service/20261118-223259-email-service-package/email-02-templates.md).
Package `typecheck`, `test:unit` (42 tests across six files), and `build:package`
passed serially on Node 26.12.1 using ignored repo-local `TMPDIR`. Changed package
paths passed formatting/lint; plain Node ESM/CJS preparation through the emitted
root passed. The staged DTO is revalidated without a registry; durable replay,
store-time guards, and actual delivery remain future phases. No workspace suites,
installed-tarball verification, CI, provider/database tests, or live mail ran.

### EMAIL-03 — Implement atomic store contract and memory conformance adapter

Status: completed (2026-11-19). Priority: P0. Dependencies: EMAIL-00, EMAIL-01, EMAIL-02.

Ownership: lifecycle store interfaces, memory adapter, clock/failure harness, and
shared adapter-conformance tests.

Requirements:

- Implement scoped admission/deduplication, atomic claims, ownership checks,
  handoff, finalization, expiry/cancellation, and result-projection primitives.
- Validate supported serialized data and bounded history/capacity.
- Provide a deterministic single-process memory adapter for tests/development;
  document restart loss and lack of multi-process durability.

Acceptance: conformance covers duplicate/conflicting commands, concurrent claims,
stale owners, finite leases, projection replay, scope isolation, expiry boundaries,
and failure injection. Persistence failure never invokes a memory fallback.

Completion evidence: [EMAIL-03 store port, conformance and handoff](../task-artifacts/email-service/20261118-223259-email-service-package/email-03-store.md).
The root exports the non-durable memory store and implements the V1 store
primitives, including projection, cursor paging and three-step retention. The
logical codecs and bounded transition plans are shared source for the durable
adapter. Package `typecheck`, `test:unit` (78 tests across eight files), and
`build:package` passed serially on Node 26.12.1. Changed paths passed formatting
and TypeScript lint. Conformance ran against memory only; ACK loss was simulated
at the store seam. Separate Mongo clients, server-time/retirement races, failover,
provider I/O, worker behavior, and workspace integration remain unverified.

### EMAIL-04 — Implement Mongoose persistence and schema factories

Status: completed (2026-11-19). Priority: P0. Dependencies: EMAIL-00, EMAIL-01, EMAIL-03.

Ownership: optional Mongoose entrypoint, schema factories, adapter/readiness,
indexes/serialization, and real-MongoDB conformance tests.

Requirements:

- Implement the generic job ledger/activity projection using explicit configurable
  collections, caller-owned connections, scoped queries, and atomic transitions.
- Implement required indexes, schema/version checks, durable write policy,
  bounded query paths, and retention/projection coordination.
- Translate opaque IDs/timestamps without leaking hydrated models into core DTOs.
- Test the required replica-set and read/write guarantees explicitly, including
  projection/cleanup races without cross-collection transactions. Unsupported
  deployments fail readiness rather than using weaker undocumented fallbacks.

Acceptance: shared conformance passes against real isolated MongoDB with separate
clients/services; topology, index conflicts, acknowledgement loss, scope isolation,
and caller lifecycle are covered. Acceptance uses fresh maintained fixtures; no
existing application or database is a prerequisite.

Completion evidence: [EMAIL-04 Mongoose design, verification and handoff](../task-artifacts/email-service/20261118-223259-email-service-package/email-04-mongoose.md).
The optional `./mongoose` factory uses only an explicit caller connection and the
shared lifecycle. The package `test:mongodb` lane passed 48 tests on isolated
MongoDB 8.2.6 WiredTiger replica sets, including a real three-member stepdown,
server interruption, immutable projection and resumable cleanup. The handoff
separates committed-response injection from observed wire/server behavior and
records the driver timeout and topology restrictions. Package typecheck,
78 unit tests, build and ordinary packed-consumer checks passed; no provider,
mail, migration, lockfile changes or workspace test registration in this phase.

### EMAIL-05 — Implement SMTP provider

Status: completed (2026-11-19). Priority: P0. Dependencies: EMAIL-00, EMAIL-01, EMAIL-02.

Ownership: SMTP configuration/adapter, normalized classification, local SMTP test
server/fixtures, and focused MIME/deadline tests.

Requirements:

- Submit exact frozen envelopes and multipart content, including Bcc-only
  scenarios and generic attachments.
- Enforce TLS policy, bounded I/O/absolute deadlines, actual socket shutdown, and
  disabled implicit file/URL access.
- Distinguish full/partial acceptance, definite rejection/unsubmitted failures,
  and ambiguous post-DATA failures. A `CONN` label alone proves no safe retry.

Acceptance: real loopback SMTP tests cover MIME/headers, rejected recipients,
4xx/5xx responses, STARTTLS/auth failures, disconnects/timeouts, partial results,
shutdown, and redacted diagnostics without sending external email.

Completion evidence: [EMAIL-05 SMTP design, verification and handoff](../task-artifacts/email-service/20261118-223259-email-service-package/email-05-smtp.md).
`./smtp` exports `createSmtpProvider` using Nodemailer 10.6.0 for MIME and an owned
one-shot wire connection. Package typecheck, 78 unit tests, 50 SMTP tests, build
and changed-path formatting/lint passed. The SMTP lane uses actual loopback
TCP/TLS, a synthetic CA and isolated loopback DNS; the handoff distinguishes
simulated late-resolution races from observed socket closure. The packed-consumer
fixture was extended but not run. No live mail, workspace suites/build or CI wiring.

### EMAIL-06 — Implement SendGrid template provider

Status: completed (2026-11-19). Priority: P0. Dependencies: EMAIL-00, EMAIL-01, EMAIL-02.

Ownership: SendGrid configuration/adapter, payload mapping/classification, and
private transport and isolated loopback HTTPS tests.

Requirements:

- Submit resolved template IDs with prepared dynamic data, exact recipient
  semantics, explicit provider profiles, and bounded attachments.
- Avoid global API-key mutation and hidden transport retries.
- Handle documented rejection/throttling semantics, retry hints, validation-only
  mode, message correlation, malformed responses, and ambiguous timeouts.
- Do not implement template/version CRUD or invent per-recipient delivery results.

Acceptance: isolated concurrent provider instances use their own configuration;
payloads and normalized outcomes are verified at the HTTP/client boundary.
No live SendGrid account or real delivery is required by the default test suite.

Completion evidence: [EMAIL-06 SendGrid verification and handoff](../task-artifacts/email-service/20261118-223259-email-service-package/email-06-sendgrid.md).
`./sendgrid` exports `createSendGridProvider` with a fixed, verified HTTPS
endpoint and one-shot I/O. The package passed typecheck, 90 SendGrid tests,
50 SMTP tests, 78 unit tests, build, ordinary packed-consumer checks and
package lint. The maintained SendGrid lane uses synthetic DNS and a real
loopback HTTPS endpoint; certificate verification, exact payloads, conservative
response classification and peer-observed shutdown are covered. No live provider,
workspace suite, MongoDB runtime or CI wiring in this phase.

### EMAIL-07 — Implement job service and worker lifecycle

Status: completed (2026-11-20). Priority: P0.
Dependencies: EMAIL-02, EMAIL-03, EMAIL-04, EMAIL-05, EMAIL-06.

Ownership: service admission, worker/claims, scheduling/backoff, lease recovery,
cancellation/redrive, and lifecycle integration tests.

Requirements:

- Compose preparation, immutable persistence, claims, handoff, providers, and
  fenced attempt finalization through one delivery path.
- Implement bounded budgets/deadlines, renewal, safe shutdown, expiry rechecks,
  and conservative recovery after ambiguous writes or sends.
- Keep retries from re-preparing snapshots or resending accepted recipients.
- Apply explicit operator-resolution rules; distinguish submission from delivery.

Acceptance: both providers run through memory and real-MongoDB lifecycle tests.
Competing workers and injected crashes before/after every durable handoff boundary
cannot produce automatic duplicate submission or stale-owner state corruption.

Admission checkpoint: [EMAIL-07A admission verification and handoff](../task-artifacts/email-service/20261118-223259-email-service-package/email-07a-admission.md).
`createEmailService` now admits typed commands or relays staged V1 snapshots,
without delivery. Scoped committed replay precedes preparation; unconfirmed
inserts are resolved only by a bounded exact-key read. Package typecheck,
105 unit tests, build and changed-path lint passed. The checkpoint uses memory
and injected failure seams; it does not establish durable worker or MongoDB
lifecycle behavior and does not complete EMAIL-07.

Worker core checkpoint: [EMAIL-07B worker verification and 07C handoff](../task-artifacts/email-service/20261118-223259-email-service-package/email-07b-worker.md).
`createEmailWorker` runs bounded maintenance and scoped claims, gates one-shot
submission on the timely exact handoff ACK, and confirms outcomes only from
the fenced attempt ledger. Synthetic memory and injected-port checks cover
callback capacity, deadlines, ownership/finish ambiguity, and shutdown. Package
typecheck, 178 unit tests, build and changed-path lint passed. No real provider
or MongoDB worker was run in 07B.

Integrated checkpoint: [EMAIL-07C loopback lifecycle and Mongo duplicate confirmation](../task-artifacts/email-service/20261118-223259-email-service-package/email-07c-lifecycle.md).
Both real loopback adapters ran through the public service and worker on memory
and MongoDB 8.2.6 with separate clients. Peer reads verified lease recovery,
terminal replay, and a stale finish that could not overwrite the winner.
Store-response injections are distinguished from real socket closure, Mongo
`killOp`, and the separate store failover case. The confirmed duplicate-read
edge now permits one exact admission recheck without retrying the insert.
Package typecheck, 178 unit tests, 25 memory lifecycle tests, 50 SMTP tests,
90 SendGrid tests, 82 MongoDB tests, build, and changed-path checks passed.
No live mail, workspace checks, CI or EMAIL-08 implementation.

### EMAIL-08 — Export batch service

Status: completed (2026-11-20). Priority: P1. Dependencies: EMAIL-07.

Ownership: batch enqueue/run APIs, rate policy, per-item/run result types, and tests.

Requirements:

- Compose the shared job service with stable item IDs, partial progress/resume,
  bounded concurrency/scan budgets, scheduling, and explicit limiter scope.
- Preserve intended recipient grouping and distinguish queued, submitted,
  rejected, unknown, expired, cancelled, and persistence-failure counts.
- Do not add a second worker implementation or assume array-index idempotency.

Acceptance: reordered/replayed/partially persisted batches resume safely;
completed items are not resent, configured limits hold, and shutdown/failure
results remain accurate across multiple workers.

Completion evidence: [EMAIL-08 batch verification and EMAIL-09 handoff](../task-artifacts/email-service/20261118-223259-email-service-package/email-08-batch.md).
`createEmailBatchService` validates all item envelopes up front and reuses
scoped admission with stable batch/item IDs; `run` delegates the bound worker's
scope-wide run. Fresh package checks passed: typecheck, 202 unit tests, 26
memory lifecycle tests, 83 MongoDB 8.2.6 tests, build, changed-path hygiene,
and ordinary installed tarballs on Node 26.12.1 and 24.0.0. The lifecycle
fixture uses real loopback SMTP/HTTPS, two independent Mongo clients in the
durable lane, and a simulated admission write failure. No live mail, workspace
or CI checks, or EMAIL-09 implementation.

### EMAIL-09 — Implement result history and reconciliation

Status: completed (2026-11-20). Priority: P0. Dependencies: EMAIL-04, EMAIL-07, EMAIL-08.

Ownership: activity projection/reconciliation, result queries/DTOs, diagnostics,
retention coordination, and focused tests.

Requirements:

- Persist/reconcile idempotent attempt activities from the authoritative ledger.
- Export safe bounded result queries and observers without queue payloads,
  ownership credentials, provider dumps, or application receipt logic.
- Ensure projection/observer failure does not change submission or retry state.
- Define result availability while projection is pending and protect history/
  idempotency windows during cleanup.

Acceptance: repeated/crashed projectors produce one result per attempt; missing
activities recover without another send. Privacy, pagination, scope isolation,
unknown outcomes, partial recipients, and retention are verified.

Completion evidence: [EMAIL-09 admin and retention verification](../task-artifacts/email-service/20261118-223259-email-service-package/email-09-admin.md).
The root exports `createEmailAdmin` for scoped authoritative summaries, bounded
activity pages, cancellation, explicit unknown resolution, reconciliation, and
cleanup. Projection and best-effort observation are independent of delivery;
redrive requeues but does not submit. Package typecheck, 222 unit tests, 26 memory
lifecycle tests, 89 MongoDB 8.2.6 tests, build, and ordinary offline installed
tarballs on Node 26.12.1 and 24.0.0 passed. No live mail, workspace checks, CI or
EMAIL-10 implementation.

### EMAIL-10 — Complete robustness and failure-boundary coverage

Status: completed (2026-11-20). Priority: P0. Dependencies: EMAIL-02 through EMAIL-09.

Ownership: cross-provider/store failure matrix, adversarial limits/privacy tests,
and operational documentation.

Requirements:

- Exercise mutation, malformed metadata, resource ceilings, clocks/lease edges,
  stalled callbacks/resolvers, abort races, database uncertainty, and provider
  uncertainty.
- Test independent services/scopes and shared-store workers.
- Demonstrate that required bounds include history/projection/query work, and
  distinguish simulated failures from verified backend/network behavior.

Acceptance: every contract failure boundary has maintained evidence or a precise
unsupported-case statement; no mandatory safety criterion is a skipped/todo test.

Completion evidence: [EMAIL-10 failure-boundary audit and operational evidence](../task-artifacts/email-service/20261118-223259-email-service-package/email-10-robustness.md).
Added overlapping scoped workers on memory and MongoDB, bounded Mongo projection,
cursor and eleven-attempt cleanup checks, and focused acknowledgement, callback
and provider-limit cases. Fixed raw thenable fulfillment validation and SendGrid
message IDs containing a reflected credential. Package typecheck and build passed;
228 unit, 27 memory lifecycle, 51 SMTP, 91 SendGrid and 95 MongoDB 8.2.6 tests passed
without skips, along with changed-path hygiene. The audit distinguishes loopback
TCP/TLS and real MongoDB interruption/election from injected reply loss and
unsupported scenarios. No EMAIL-11 wiring, installed/release consumer run, root
checks, live mail, CI, publication or commit.

### EMAIL-11 — Verify installed package, docs, and workspace integration

Status: completed (2026-11-20). Priority: P1. Dependencies: EMAIL-01 through EMAIL-10.

Ownership: shipped README/JSDoc, packed-consumer tests, optional peer matrix,
website/navigation if appropriate, and narrow CI/test-group/release wiring.

Requirements:

- Document canonical imports and minimal SMTP/SendGrid preparation, queue, batch,
  storage, result-query, and host-outbox examples using only public APIs.
- Verify metadata, JS outputs, declaration closures, optional peers, plain Node
  ESM/CJS execution, and strict TypeScript consumers after installation.
- Test ordinary tarballs and the repository's actual release-shaped packaging
  where its transformation differs; a source-only dry run is insufficient.
- Activate canonical `build` (delegating to `build:package`) and `test` (one
  package build/typecheck plus the full serial lane set) together with the narrow
  workspace wiring below. Document exact runtime and peer versions exercised
  and any unverified combinations. Do not run unrelated package suites.

Workspace activation (EMAIL-11 only):

- **Local pre-flight:** add the package once to a safe group in
  `scripts/test-groups.mjs`; review test-only read/write overrides if it reads or
  builds another workspace's outputs. No shared output dependency is planned.
- **Gated CI:** add the reviewed workspace to `scripts/ci-test-plan.mjs` and
  keep its generated static main jobs in agreement with `.github/workflows/test.yml`.
  Add `test-email-service` with `ci-prepare` and only true reviewed test-success
  prerequisites (none beyond `ci-prepare` as designed). Preserve the full
  package `test`, verified checkout/attempt-scoped artifact restore, resource
  preparation and existing independent lint/minimum-Node/React lanes.
  Review the output root `packages/email-service/dist` in
  `scripts/ci-test-artifacts.mjs` and package Mongo resource registration in
  `scripts/ci-test-workspace.mjs` with their contract fixtures.
- Extend the fail-closed `always()` `unit-test` aggregate and its model/test
  expectations coherently: 26 package jobs plus `ci-validate` and `ci-prepare`
  (28 direct results at this baseline). Keep the stable check name and update
  affected guidance/counts. No matrix barrier, fail-fast, closure filter,
  unrelated CI redesign, live workflow trigger or required-check change.
  Live rollout evidence and required-check confirmation remain maintainer-gated
  under `AGENTS.md` and are not part of this package-scoped verification.

Acceptance: installed consumers can discover and use all advertised entrypoints
without repository source or deep imports. README examples compile/run; optional
peers stay optional, declarations retain useful JSDoc, and grouped-test coverage
and release metadata are correct.

Completion evidence: [EMAIL-11 installed consumers and workspace activation](../task-artifacts/email-service/20261118-223259-email-service-package/email-11-installed-consumers.md).
The canonical serial package command passed on Node 26.12.1: one build, typecheck,
492 Vitest cases (95 on MongoDB 8.2.6), and 12 packed-consumer results. The complete
packed matrix passed again on Node 24.0.0: both tarball layouts, Mongoose 9.12.2
and Nodemailer 10.6.0 independently and together, and neither peer. Tests executed
the shipped README and inspected both declaration formats; the release stage used
the actual 0.41.2 helper on copies. Group 2 and the static CI job are registered,
with 26 tested workspaces and 28 aggregate needs. Changed-path checks and narrow
static wiring review passed. No root CI/group validators, root suites/build/lint,
hosted workflow, publication, real mail, commit or EMAIL-12 work.

### EMAIL-12 — Final acceptance and handoff

Status: completed (independent package acceptance, 2026-11-20). Priority: P1. Dependencies: EMAIL-10, EMAIL-11.

Requirements:

- Review the public contract against all five requirements, the package boundaries,
  and the failure matrix.
- Verify evidence, unresolved blockers, docs/exports consistency, and guarantee
  limits; do not infer production durability from mocks alone.
- Preserve useful task artifacts and record exact checks, runtime/backend/peer
  versions, limitations, and any approved follow-ups.

Acceptance: all required tasks have evidence-backed completion; no P0/P1 safety
gap or mandatory unverified lane remains. Any review claimed as independent must
actually be independent; task-file creation assigns no agent or reviewer.

Completion evidence: [EMAIL-12 independent acceptance and handoff](../task-artifacts/email-service/20261118-223259-email-service-package/email-12-acceptance.md).
The independent reviewer assessed all five requirements, public boundaries,
failure handling, evidence, and static workspace wiring. The parent corrected a
material source-delivery omission by unignoring the handwritten Handlebars
declaration with one exact rule. The reviewer confirmed the shim is visible to
Git and loaded by TypeScript while generated declarations remain ignored.
Package-only typecheck and 228 unit tests passed on Node 26.12.1. Canonical
package and Node 24.0.0 packed-consumer passes are EMAIL-11 evidence, not new
passes or clean-checkout proof before that correction. No open P0/P1 package
blocker or mandatory unverified package lane. Root validators, hosted rollout
and required-check confirmation are outside this acceptance and remain unverified.
Changes remain uncommitted.

## Verification and working rules

- Change only the current task's authorized scope. EMAIL-00 is docs only;
  dependent tasks use this contract in order and record their own evidence.
- Before edits inspect git status/local instructions and preserve unrelated work.
- Follow repository naming/style and edit tracked source, never generated `dist`.
- Use the patch tool for file edits. Update lockfiles only through pnpm.
- Do not modify unrelated applications, migrate application databases, commit,
  publish, or send real provider messages without separate authorization.
- Maintain statuses `pending`, `in_progress`, `blocked`, and `completed`. Dependencies
  must be complete before dependent implementation; record evidence before
  completion and exact decision/prerequisite blockers when blocked.
- Record contract changes or blockers explicitly before dependent work; do not
  infer a guarantee from the design or a mock.
- Keep package scripts/builds serial across shared output writers. Do not run
  separate numbered test groups concurrently in one checkout.
- Current authorization is **package-scoped verification only**. No repo-wide
  package suite, workspace build or root lint, broad release build, actual mail,
  or live CI/branch-protection exercise.

### Planned verification commands

Planned commands from `<repo-root>`, after dependencies and each owning task's
scripts/tests exist. The fixture and installed-consumer lanes use a fresh ignored
repo-local `TMPDIR` per run (see below).

```sh
pnpm --filter @web-ts-toolkit/email-service build:package
pnpm --filter @web-ts-toolkit/email-service typecheck
pnpm --filter @web-ts-toolkit/email-service test:unit
pnpm --filter @web-ts-toolkit/email-service test:lifecycle
pnpm --filter @web-ts-toolkit/email-service test:smtp
pnpm --filter @web-ts-toolkit/email-service test:sendgrid
pnpm --filter @web-ts-toolkit/email-service test:mongodb
pnpm --filter @web-ts-toolkit/email-service test:packed-consumer
pnpm --filter @web-ts-toolkit/email-service exec npm pack --dry-run --json
pnpm --filter @web-ts-toolkit/email-service test
```

Individual lanes consume the package build when they need emitted files. The final
`test` script (EMAIL-11) builds once and runs typecheck and required lanes serially;
use it instead of rerunning all individual lanes. For floor checks run the maintained
packed lane with `EMAIL_SERVICE_CONSUMER_NODE` set to the Node 24.0.0 executable
and record the toolchain and peer versions. Test release-shaped staging inside the
package fixture, not by running a workspace release build or publishing.

`pnpm test:grouped` is **local pre-flight** after a workspace build; active CI
uses its static dependency-gated `Test` workflow, not the grouped runner.
`pnpm test:groups:check` and `pnpm test:ci:check` validate those separate
integration contracts and run in `ci-validate`; they are not package test lanes.
Do not run the root validators locally under this package-only authorization;
record that verification as outstanding unless separately authorized.

EMAIL-00 only: check Markdown formatting, whitespace (also the untracked
artifact via `git diff --no-index --check /dev/null <artifact-file>`), and
links/privacy/nonignored paths. Do not run package or workspace commands.

Missing MongoDB binaries/topology, optional-peer consumer dependencies, registry
access, or other required tooling blocks its lane instead of yielding skipped
success. Real SMTP tests use an isolated loopback server; SendGrid tests use a
controlled HTTP/client boundary. Distinguish these from live provider delivery.

### Temporary work and durable evidence

- Use a fresh ignored repository-local `_tmp*` directory per run; confirm it with
  `git check-ignore` and set runtime `TMPDIR` to that directory when tools use
  `os.tmpdir()`. Record paths using `<repo-root>` placeholders, never host paths.
- Keep maintained tests, fixtures, and benchmark scripts in normal code locations.
- Preserve useful designs/reviews/failure reports under
  `docs/task-artifacts/email-service/20261118-223259-email-service-package/` or a
  clearly identified subsequent run directory. The EMAIL-00 contract is in this
  durable directory; it has no scratch prerequisites.
- Curate rather than copy whole scratch trees. Scrub private data, record provenance
  and reproducibility limits, verify preserved references, and never overwrite old
  evidence or delete another task's scratch work.
