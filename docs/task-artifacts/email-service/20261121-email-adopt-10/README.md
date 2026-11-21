# EMAIL-ADOPT-10 — Independent acceptance review

**Do not accept the current tree.** The remaining findings are about the installed contract and formatting, not
a demonstrated duplicate submission or unsafe recovery path.

I reviewed the tracked diff against `39848121` and the untracked source, tests and documents for
[EMAIL-ADOPT-01–10](../../../tasks/20261121-022138-email-service-cross-project-adoption.md), against the original
[V1 contract](../20261118-223259-email-service-package/v1-contract.md) and
[SMTP-capacity implementation contract](../20261120-214514-email-service-smtp-capacity/implementation-contract.md).
This report is the only durable change from the review; task status stays with the coordinator.

## Findings to resolve before acceptance

1. **03 — The installed type still permits deterministically invalid SMTP acceptance evidence.**
   [`SmtpAcceptance` and `ProviderResult`](../../../../packages/email-service/src/contracts/provider.ts#L84-L117)
   distinguish tuples correctly but allow `smtp_accepted` with `recipients: []` and `smtp_partial` with only one
   status. These are invalid without knowing the envelope, as the
   [decoder explicitly checks](../../../../packages/email-service/src/internal/attempt-codecs.ts#L149-L181).
   An independent packed probe compiled the two examples below under strict NodeNext with exact optional
   properties. Even with both envelope indexes present in the partial case, the worker committed an open
   `unknown / transport_uncertain` and did not retry or call `submit` again. The fail-safe is correct, but the
   type can still lead a compiling adapter into an unnecessary hold.

   ```ts
   import type { ProviderResult } from '@web-ts-toolkit/email-service';

   const empty = {
     outcome: 'accepted',
     retry: 'never',
     stage: 'data',
     reason: 'smtp_accepted',
     recipients: [],
   } satisfies ProviderResult;
   const notPartial = {
     outcome: 'partially_accepted',
     retry: 'never',
     stage: 'data',
     reason: 'smtp_partial',
     recipients: [
       { group: 'to', index: 0, status: 'accepted' },
       { group: 'to', index: 1, status: 'accepted' },
     ],
   } satisfies ProviderResult;
   ```

   **Fix:** Encode nonempty full acceptance and the partial-evidence invariant, e.g. with a checked constructor
   for dynamic recipient lists that proves both statuses without changing their order. Add installed negative
   cases while keeping dynamically built valid evidence usable. Keep exact envelope coverage, mode, bounds and
   late evidence checks at runtime. If the coordinator explicitly scopes the type contract to fields rather than
   evidence cardinality/status composition, document that boundary in the installed type and migration note.

2. **09 — The installed SMTP limitations omit the fixed EHLO name.** The task defers configuring a client name
   but calls for documenting applicable limits. The installed [SMTP profile guidance](../../../../packages/email-service/README.md#L386-L396)
   explains the remote TLS identity but not that the adapter sends `EHLO email.invalid`
   [before and after STARTTLS](../../../../packages/email-service/src/providers/smtp/submit.ts#L67-L84).
   **Fix:** Document the fixed client greeting and that `servername` only changes the peer identity checked by
   TLS. No SMTP option or wire change is needed.
3. **10 — Targeted Prettier is not clean.** Format
   [`worker-fences.test.ts`](../../../../packages/email-service/test/unit/worker-fences.test.ts#L313-L332) and the
   [task record's ownership paragraph](../../../tasks/20261121-022138-email-service-cross-project-adoption.md#L68).
   The broad touched-file check also flagged the [baseline review](../20261120-cross-project-adoption-review/README.md)
   and [03 handoff](../20261121-email-adopt-03/README.md); those artifact paths are excluded by the repository
   hook. Keep historical facts intact if formatting them.

Two smaller follow-ups: three transport [reasons share a union-valued discriminator](../../../../packages/email-service/src/contracts/provider.ts#L115-L117),
so a packed `Extract<ProviderResult, { reason: 'provider_timeout' }>` is `never`; split or distribute those
branches if consumers need per-reason type extraction. Relative targets exist, but some historical line links
now land on different code (e.g. the [baseline service findings](../20261120-cross-project-adoption-review/README.md#L49)
and [task 03 ownership](../../../tasks/20261121-022138-email-service-cross-project-adoption.md#L54)).
Pin baseline references to the reviewed commit or update explicitly current source links, rather than rewriting
historical evidence.

## Boundary checks

- **01 — Expired prefix:** The [claim window](../../../../packages/email-service/src/internal/job-transitions.ts#L199-L217)
  signals only when each candidate slot yields a due, still-queued, expired decision; a missing/moved row,
  short scan or unretried CAS miss is not counted as expired. Memory keeps its 16-slot scan (the bound opt-in
  fixture fits below it). Mongo uses its existing ordered scoped index and sampled primary time, then exact
  linearizable reads; it does not filter expiry across an unbounded range. The
  [Mongo test](../../../../packages/email-service/test/mongodb/lifecycle.test.ts#L66-L148) checks at most 16 docs/17
  keys in V1 or 4 docs/5 keys in opt-in **for the range scan**, plus one exact read per candidate and no queue
  writes or extra scans from a blocked zero-maintenance run. The shared scenario preserves both foreign jobs
  and reaches the live job once. A separate installed memory probe distinguished 15 from 16 expired rows,
  without any queued-state change. The new claim/report case, legacy port compatibility, zero-maintenance
  limitation and safe old-worker/new-store in-process error are documented. No catalog or stored-format change.
- **02 and 06 — Worker rollout:** Worker preflight still matches exact kind/key/mode before the resolver,
  limiter or provider. The README installs both profiles/resolvers on both workers before changing producer
  routing, retains the old route through drain, and describes isolating incompatible fleets. An installed
  two-worker probe confirmed a mismatched worker failed without substitution and a repaired worker could not
  reopen that failure via same-key replay. Empty workers throw `invalid_config` in both modes before store
  calls, timers or provider work; a valid worker can subsequently submit the untouched job exactly once.
- **03 and 04 — Types:** Packed fixtures cover the original missing SMTP evidence, reason/outcome/retry/stage
  mismatch, complete SMTP and SendGrid results, and strict mode/input checks. The runtime still verifies actual
  envelope coverage, profile mode, invalid JavaScript and late results; malformed evidence after handoff is
  never a resend permission. `AttemptResult` and persisted outcomes are unchanged. A widened `TemplateMap`
  accepts both provider kinds; `satisfies TemplateMap` preserves key-to-provider and business-input inference.
  `parseInput` validates the declared command shape; the installed example normalizes values in `prepare`.
- **05 — Admission:** The new named factories expose only `enqueueBatch` or `enqueuePrepared` and share the
  former admission/deadline code. Both ESM/CJS directions and bindings exercise committed-but-unacknowledged
  writes with same-key replay, without a duplicate insert. Scope/binding mismatch fails closed. The existing
  combined facade still runs scope-wide, including unrelated jobs; the README wires it to one backing store
  and does not infer backing identity from scope/binding equality.
- **07 — Attachments:** Both queue modes reject new composite SMTP refs before rendering or insert, including
  from staged commands on a scoped miss. Direct SMTP preflight still rejects them. Hashes, shared historical
  codecs and read/replay precedence are unchanged. Mongo seeds the old row shape without a migration: exact
  reads and both prepared routes replay the original ID; an isolated staged miss has one exact read and no
  insert. Memory checks raw insert guards and retained-key replay; valid leaf parts and SendGrid's exact
  attachment mapping remain covered.
- **08 — Operator procedure:** The [installed procedure](../../../../packages/email-service/README.md#recover-unresolved-submissions)
  uses host-recorded scoped IDs, exact current `getJob` reads and authorized exact-attempt decisions. It
  distinguishes projection/history and best-effort callbacks from present state and admits a missing-ID gap.
  Expired-lease recovery can send unrelated mail; no use just to inspect. Dismissal never sends; redrive
  requires duplicate-risk acknowledgement and adds one claim on the frozen snapshot. The
  [admin conformance trace](../../../../packages/email-service/test/conformance/admin-suite.ts#L415) exercises
  projection, redrive, second unknown and dismissal. No inventory query or catalog extension.
- **09 — Installed package:** Inspected 22 ordinary pack paths and 23 flattened-release paths (all 16 mapped
  runtime/declaration targets, four declaration chunks, README, manifest, and release-only LICENSE), with no
  tests or sources shipped. Inspected both declaration formats: new named exports, expiry stop, retry/deferral,
  parser, provider, readiness, and current-vs-historical hold documentation survive. Eight selected public
  comments also passed an independent syntax-tree check in each format and pack shape.
  An offline no-peer ordinary install ran the unmodified README `.mts` quickstart on Nodes 26.12.1 and 24.0.0
  under the network guard: one synthetic acceptance and a redacted summary. The README also documents explicit
  readiness, the seven-day schedule with frozen later expiry, claim-counted deferrals, optional peers and
  stable cross-entrypoint error codes. Both pinned GitHub blobs and rendered headings resolved without authentication.

## Verification and limits

From `<repo-root>`, use installed dependencies, a warm pnpm store, Node 26.12.1, pnpm 11.24.0 and a local
MongoDB 8.2.6 executable. The serial runner uses TypeScript 6.0.3 and Vitest 4.1.12. The canonical invocation
had a 1,260-second outer timeout. An initial invocation was stopped by the reviewer during typecheck to set
explicit offline controls; it is not counted as a passing run.

```sh
cd '<repo-root>'
set -e
scratch="$(mktemp -d "$PWD/_tmpXXXXXX")"
git check-ignore -q -- "$scratch"
export TMPDIR="$scratch" EMAIL_SERVICE_CONSUMER_OFFLINE=1
export MONGOMS_SYSTEM_BINARY='<absolute path to local mongod 8.2.6>'
export MONGOMS_VERSION=8.2.6 MONGOMS_RUNTIME_DOWNLOAD=false
unset SMTP_CAPACITY_TIMING
pnpm --filter @web-ts-toolkit/email-service test

# Optional floor check after the full run, reusing dist read-only.
scratch="$(mktemp -d "$PWD/_tmpXXXXXX")"
git check-ignore -q -- "$scratch"
export TMPDIR="$scratch"
EMAIL_SERVICE_CONSUMER_NODE='<absolute path to local Node 24.0.0>' \
  pnpm --filter @web-ts-toolkit/email-service test:packed-consumer
```

The full serial package run exited 0 in 11m36.578s, including build and package typecheck. The optional packed
floor rerun exited 0 in 3m20.167s.

| Lane                 | Passed | Skipped | Details                              |
| -------------------- | -----: | ------: | ------------------------------------ |
| Unit                 |    267 |       0 | 21 files                             |
| Memory lifecycle     |     34 |       0 | 3 files                              |
| SMTP                 |     65 |       2 | 2 files                              |
| SendGrid             |     91 |       0 | 3 files                              |
| MongoDB              |    103 |       0 | 9 files, 397.88 s                    |
| Packed, Node 26.12.1 |     12 |       0 | 195.84 s, 2 shapes × 4 peer profiles |
| Packed, Node 24.0.0  |     12 |       0 | 199.18 s, 2 shapes × 4 peer profiles |

The two skips were optional 1,000-recipient implicit-TLS timings with 25 ms and 50 ms replies, not passes.
The canonical run passed 560 Vitest cases. Each packed count includes eight installed consumers plus the
scratch and enclosing tests. Both matrices checked strict NodeNext ESM/CJS and Bundler declarations, the installed
README examples (18 TypeScript fences), and disposable loopback Mongo. Peer floors were Nodemailer 10.6.0 and
Mongoose 9.12.2 (MongoDB driver 7.8.0). In the floor run the installed runtime and TypeScript invocations used
Node 24.0.0; the harness, pnpm and npm still used Node 26.12.1. The full package suite was not rerun on the floor.

`pnpm lint` and tracked plus untracked `git diff --check` passed. Targeted Prettier did not pass; see the
four specific warnings above. The report's own Prettier and secret scan passed and it is not ignored.
The local link/path audit checked 200 targets or anchors across 11 documents; the two GitHub contract links
were checked separately. That resolves paths, not the semantically stale historical line numbers noted above.

No Mongo catalog, historical contract, manifest/build config, package runner, shared test wiring, CI or release
files changed. No workspace build/test/group/CI gates, hosted jobs, live rollout, publication, or external SMTP
or SendGrid traffic. Open-hold inventory, new providers/backends, profile-filtered claims, separate quota
budgets, configurable EHLO, `PrepareContext.scheduleAt`, and stronger V1 memory readiness remain deferred.

Raw logs, tarballs, dependencies, database files, binaries and disposable probes are omitted. Reproduce the
maintained cases in the serial package runner and the additional type check from the snippet above against a
fresh local pack. No production throughput or inbox-delivery guarantee was tested.
