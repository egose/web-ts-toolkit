# EMAIL-ADOPT-10 — Independent re-review after 03 and 09

**Accept the corrected tree.** The prior blockers are resolved and the independent package verification
passed. No unresolved acceptance findings.

This report covers the corrected adoption tree over `39848121`. The
[first independent review](README.md) records the earlier rejection and is unchanged. This re-review compares
the actual package source, tests and documentation (including untracked files) against that baseline and the
[task's acceptance criteria](../../../tasks/20261121-022138-email-service-cross-project-adoption.md#email-adopt-10--verify-package-compatibility-and-close-the-adoption-review).
Only this artifact was added; the coordinator owns task status.

## Findings rechecked

- **03 — SMTP acceptance evidence and per-reason extraction.** In independent no-peer installs of both tarball
  shapes, the [two original invalid literals](README.md#findings-to-resolve-before-acceptance) produced exactly
  two type errors in `.mts` and two in `.cts` under strict NodeNext with exact optional properties: empty
  `smtp_accepted` and all-accepted `smtp_partial`. A valid nonempty literal and dynamically constructed
  evidence compile; the return value assigns across the ESM/CJS declarations in both directions. `Extract`
  independently returns the correct variant for `provider_timeout`, `provider_aborted`, and
  `transport_uncertain`. The [public union](../../../../packages/email-service/src/contracts/provider.ts#L80-L125)
  keeps the proof declaration-only. The [reopened 03 handoff](../20261121-email-adopt-03-reopened/README.md)
  records why the dynamic construction path is needed.
- **03 — Checked runtime path.** [`createSmtpAcceptanceResult`](../../../../packages/email-service/src/internal/attempt-codecs.ts#L113-L179)
  accepts at most 1,000 results, validates exact data fields and safe group/index/status values, prevents
  duplicate group/index pairs, and rejects malformed optional message IDs. It creates a detached frozen result,
  list, and entries in the supplied order without a runtime property or symbol. In both formats of both local
  installs I exercised a 1,000-entry mixed list in reverse order, deep freezing, mutation of the original,
  JSON round-trip, full acceptance, overflow, bad index/ID, duplicates, empty/all-rejected data, and rejection
  of accessors/proxies without calling them. Capacity-specific bounds, canonical order, exact envelope coverage,
  profile mode and attempt ID still belong to the runtime decoder.
- **03 — No delivery or persistence regression.** The [SMTP exchange](../../../../packages/email-service/src/providers/smtp/submit.ts#L95-L142)
  invokes the constructor only after the final DATA `250`. Compared with `39848121`, the wire command sequence,
  transport timing constants, shutdown/cancellation, handoff/finish and launch fence logic, evidence table,
  phase/context checks, and retry reducer are unchanged. The shared recipient reader still applies the same
  bounds and ordering during ledger and activity decoding; `AttemptResult`, BSON/catalog and hashes are unchanged.
  The [installed mixed-build runtime fixture](../../../../packages/email-service/test/packed-consumer/fixtures/provider-results-runtime.mjs)
  checks redacted projection and proves invalid raw evidence or a checked list in the wrong queue order
  commits `unknown / transport_uncertain`, without resending. The worker tests advance past the retry floor.
- **09 — SMTP greeting.** The [installed SMTP README](../../../../packages/email-service/README.md#configure-an-smtp-profile)
  now explains fixed `EHLO email.invalid` before and after required STARTTLS, or once inside implicit TLS,
  and that `servername` controls only remote TLS SNI and certificate verification. The wording is present
  on [`SmtpProviderOptions.servername`](../../../../packages/email-service/src/smtp.ts#L21-L25) in both installed
  declaration formats and agrees with the existing loopback assertions. There is no new option or wire change.
  See the [reopened 09 handoff](../20261121-email-adopt-09/README.md#reopened-resolution--fixed-smtp-client-greeting).
- **10 — Formatting and historical references.** The worker tests, task, adoption baseline and handoffs pass
  targeted Prettier. The previous drifting line links in the task and [baseline review](../20261120-cross-project-adoption-review/README.md)
  now use named symbols, current headings or pinned historical lines. Both pinned store-contract pages and
  rendered headings returned HTTP 200. The installed README has no unshipped relative links.

## Other boundaries rechecked

- **01, 02, 06:** Only a confirmed full expired window signals expiry maintenance. The Mongo fixture checks
  16 docs/17 keys in V1 or 4 docs/5 keys with capacity on the ordered scan plus one exact read per candidate,
  with no blocked-run writes at zero maintenance. Bounded positive maintenance reaches the due job once.
  Scope/profile matching and no substitution are preserved; empty workers fail before I/O in both modes.
- **04, 05:** Widened template maps accept either provider and literal maps keep per-key input/kind checking.
  The role-only producer and relay expose only admission methods and preserve same-key replay after a lost ACK
  across ESM/CJS and both bindings. The combined facade still runs the whole scope, not just the batch.
- **07, 08:** New composite SMTP refs are rejected without changing old staged/retained read and replay paths,
  leaf SMTP or SendGrid. The operator procedure uses authorized, exact `getJob` reads and does not claim that
  history, callbacks or reconciliation can give a complete inventory. Uncertain/partial acceptance does not
  authorize automatic resend.
- **09:** Both tarballs contain the four named entrypoints and both declaration formats. Ordinary lists 22
  files; flattened lists 23, adding LICENSE and flattening eight JS targets, eight public declaration targets
  and four private declaration chunks. Inspected installed `ProviderResult`, constructor, EHLO, claim and
  parser JSDoc in all four format/shape combinations. No shipped test files, no runtime proof marker, and no
  optional peer needed for the root constructor or the first synthetic README example. The unmodified
  quickstart also ran directly as `.mts` on Node 26.12.1 from both installed packs under the network guard.

## Verification and limits

Reproduction from the repository root, with installed dependencies, a warm pnpm store, and local executables
for MongoDB 8.2.6 and the optional Node 24.0.0 rerun:

```sh
cd '<repo-root>'
set -e
scratch="$(mktemp -d "$PWD/_tmpXXXXXX")"
git check-ignore -q -- "$scratch"
export TMPDIR="$scratch" EMAIL_SERVICE_CONSUMER_OFFLINE=1
export MONGOMS_SYSTEM_BINARY='<absolute path to local mongod 8.2.6>'
export MONGOMS_VERSION=8.2.6 MONGOMS_RUNTIME_DOWNLOAD=false
unset SMTP_CAPACITY_TIMING EMAIL_SERVICE_CONSUMER_NODE NODE_TLS_REJECT_UNAUTHORIZED
pnpm --filter @web-ts-toolkit/email-service test

# After the canonical run: reuse its build, with fresh scratch.
scratch="$(mktemp -d "$PWD/_tmpXXXXXX")"
git check-ignore -q -- "$scratch"
export TMPDIR="$scratch"
EMAIL_SERVICE_CONSUMER_NODE='<absolute path to local Node 24.0.0>' \
  pnpm --filter @web-ts-toolkit/email-service test:packed-consumer
```

Both invocations exited 0, run serially with separately verified ignored scratch directories, offline
installs and a combined outer timeout of 1,800 s. The canonical run on Node 26.12.1 completed in 11m34.863s,
including build and package typecheck. The packed floor command reused the same build and took 3m24.840s.
The harness used pnpm 11.24.0, npm 11.20.0, TypeScript 6.0.3 and Vitest 4.1.12.

| Lane                 | Passed | Skipped | Coverage                             |
| -------------------- | -----: | ------: | ------------------------------------ |
| Unit                 |    269 |       0 | 21 files                             |
| Memory lifecycle     |     34 |       0 | 3 files                              |
| SMTP                 |     65 |       2 | 2 files                              |
| SendGrid             |     91 |       0 | 3 files                              |
| MongoDB              |    103 |       0 | 9 files, 397.42 s, MongoDB 8.2.6     |
| Packed, Node 26.12.1 |     12 |       0 | 197.15 s, 2 shapes × 4 peer profiles |
| Packed, Node 24.0.0  |     12 |       0 | 203.53 s, 2 shapes × 4 peer profiles |

The canonical run passed 562 Vitest cases. The two SMTP skips were the optional 1,000-recipient implicit-TLS
timing cases with 25 ms and 50 ms replies (`SMTP_CAPACITY_TIMING` unset). Each packed count includes eight
installed consumers plus the scratch and enclosing tests. Both matrices verify named ESM/CJS exports,
strict NodeNext/Bundler types, peer isolation and all 18 TypeScript fences from the installed README.
Nodemailer 10.6.0 and Mongoose 9.12.2 were the exact peer floors; MongoDB driver 7.8.0 was resolved. The floor
override applies to installed consumers and their compiler; pnpm/npm and the harness still ran on Node 26.12.1.

Repository `pnpm lint`, targeted Prettier on all touched package files and adoption documents (including
untracked paths), tracked and untracked whitespace, link/fragment resolution, and report path/secret checks
passed. Checked 225 local links and eight pinned Git targets across 13 documents, plus both rendered
store-contract anchors on GitHub.

No changes to the Mongo catalog, package runner, shared test/CI or release wiring. No workspace build/test,
group/CI gates, hosted jobs, publication, live rollout, or external mail. The exact Node floor run covers
installed runtime and TypeScript, not the full suite or older Node versions. Open-hold inventory remains
deferred, as do new adapters, profile-filtered claims, separate quota budgets, configurable EHLO, supplying
`scheduleAt` in `PrepareContext`, and stricter readiness for legacy V1 memory. The verified behavior is
local/synthetic and is not a production performance or inbox-delivery qualification.

Raw logs, generated packages and consumers, dependencies, executables, disposable database files and ad hoc
probes are omitted. Use the linked maintained fixtures and commands to reproduce the checks.
