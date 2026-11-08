# One-off access-router version benchmark

The separate maintained [CRUD v1 driver](access-router-crud.md) measures real
direct/public READ/LIST/CREATE/UPDATE/UPSERT workers in all four mode settings.
It uses deterministic adapters (not DB latency); neither historical catalog below
is repurposed or described as covering writes.

**Current owned-authorization builds use `isolated` / `trusted`, not the ten retired
flags below.** The interactive table still measures only the unchanged historical
LIST fixtures. The separate fixed-protocol driver below explicitly selects READ,
helpers, native adapters, facts and retained heap. No timing acceptance is implied by
its implementation or small smoke runs.

The package now has four authorization settings, but benchmark discovery/configuration
deliberately requires and applies **only `readAuthorizationMode` / `listAuthorizationMode`**.
Both declaration conditions and exact/bulk getters on both actual models must agree.
`createAuthorizationMode` / `updateAuthorizationMode` do not substitute for missing or
malformed READ/LIST declarations. Neither catalog times CREATE/UPDATE/UPSERT output;
seeding is outside timing. Raw helpers remain isolated regardless of these query
settings. Historical seals/reports are unchanged and provide no write-output timing
evidence. No new timing or copy-saving claim is made here.

From the repository root, after `pnpm install`:

```sh
pnpm bench:access-router
```

Requires Node **22+**, Git, `tar`, pnpm, network access for tag/dependency fetching,
and a runnable MongoDB binary (`mongodb-memory-server` downloads one if necessary).
Run in an interactive terminal. No existing MongoDB or application is used.
Do not run other builds in this checkout during measurement. Each worker checks
the prepared entrypoint hash before importing it.

## Prompts and execution

1. Fetch tags with `git fetch --tags <remote>` before listing them. No forced tag
   replacement, checkout, reset, or changes to the current source tree.
   Fetch inherits the terminal so SSH key passphrases and Git credentials can be
   prompted normally (without a spinner); authentication output is not logged.
2. Select tags to prepare (none is allowed for a current-only run). The current
   checkout, **including uncommitted changes**, is built with its workspace deps.
   Each tag is resolved to a commit, exported with `git archive`, installed using
   its own frozen lockfile, and built in a separate temporary directory. Install
   lifecycle scripts are disabled; explicitly selected tag build scripts still
   execute repository code, so select only trusted tags.
3. Multiselect ready builds (**at least one**). A new build must declare both optional
   literal source modes through exported model/default options in **both** declaration
   conditions. Choose isolated (default), trusted, or both; verify READ/LIST through
   exact **and** bulk getters on both source and related target. These are not old
   flag aliases and cannot silently fall back to historical profiles.
   For each historical build declaring all six
   unsafe snapshot flags, choose **OFF** (default), **ON**, or **BOTH**. BOTH
   measures the same build twice as separate candidates. Older/partial builds do
   not offer ON: any supported flags are set to false, and the report identifies
   how many are supported. For example, select BOTH for an older flag-bearing build
   and include v0.51.0 to compare that build OFF, ON, and v0.51.0.
   Separately select **OFF/ON/BOTH initial output copy skips** for builds declaring
   both copy options. BOTH creates the cross-product with comparison candidates.
   Old/partial copy support is labeled N/A or supported-OFF; ON is unavailable.
   The original snapshot group still sets exactly its six comparison flags.
   Independently select **OFF/ON/BOTH authorization fast paths** for builds declaring
   both new options. All three defaults are OFF; selecting BOTH in each group makes
   **eight distinct candidates** for one build, each selectable as its own baseline.
   Old/partial third-group support is OFF/N/A only; ON is not offered.
4. Select a candidate as the baseline and choose scenarios (**at least one**).
   Failed preparations retain logs and are not offered as runnable builds. Old
   incompatible tags fail explicitly instead of silently using a different workload.
5. Choose row counts, schema width, field payload size, measured requests, warmup,
   concurrent client counts, and request hook concurrency. Comma-separated size/
   client inputs produce a matrix. Start small: 10/100 rows, 24 fields, 25 requests.
6. Jobs run **sequentially**, interleaving candidates within each scenario/size.
   Concurrent clients exist only inside the current job. Each job starts a fresh
   Node process importing that version's built `dist/index.mjs` and its own peers,
   with an independently seeded database on one disposable MongoDB server.

ON explicitly sets all six `unsafeSkip{List,Read}{Document,Output,NestedDocument}SnapshotChecks`
model options to `true` on both benchmark models; OFF sets supported options to
`false`. The worker checks both effective model-option getters before measuring;
missing, changed or unapplied flags fail rather than yielding misleading timings.
Preparation requires exported root model-option types with actual optional-boolean
declarations, including shared
chunks and both `.d.ts`/`.d.mts` conditions. Mixed/required/malformed/duplicate/comment-only
declarations are not support. Every worker rechecks the aggregate hash and per-file
manifest, then reparses in a short-lived **separate compiler process**, which exits
before peers/runtime/MongoDB load. The compiler is never loaded into the measured
worker heap. Invented support arrays or unapplied getter values fail before timing.
The current scenarios are LIST requests, so the three READ flags are configured
but do not affect these measurements. No flags are passed as request options.

The independent copy group sets `unsafeSkipListInitialOutputSnapshotCopy` and
`unsafeSkipReadInitialOutputSnapshotCopy` on the same models. Active omission
requires the matching output-comparison skip; comparison OFF + copy ON is reported
as **ON (dormant; effective OFF)**, never implicitly enables comparisons and still
copies snapshots. The worker verifies both configured getter paths and reports the
effective LIST copy mode derived from that verified pair; runtime/operation-count
tests separately verify the actual omission. Unsupported historical flags stay N/A.
Eligibility fallback can still copy particular graphs even with the mode active.

With the matching new authorization fast-path flag **OFF (or dormant)**, copy ON
adds risk: it omits initial output native normalization/wire-validation
observations, which can change permission outcomes. Bounded shape/graph checks and
source/callback/response copies remain. Matching fixtures do not prove security
equivalence or imply that all cloning was removed.

The new independent group sets `unsafeUseListAuthorizationFastPath` and
`unsafeUseReadAuthorizationFastPath` on both models. Requested false is **off**;
requested true needs **all four matching** document/output/nested comparison skips
and initial-output-copy skip to be **active**, otherwise **dormant**. It never
enables prerequisites or changes six/two ON meanings. Requested/configured candidate
labels are explicitly **unverified**; result tables show verified LIST/READ effective
configuration only after both actual models and both getter paths agree. Missing or
inconsistent verification stays **unknown (unverified)**, never pretends active.

These effective modes describe **configuration**, not actual per-row borrowing or
omission counts. Timing workers do not instrument runtime omissions
(`runtimeOmissionCounts: null`); deterministic library work/risk tests measure those separately. Active
ordinary rows borrow source/hook input, share grants/context leaves and captured
scope/config views, and omit descendant graph/snapshot/native-wire/equality passes.
Exact root/tuple checks, issued-document membership and actual rules/hooks/target
admission remain. Removed original children can stay discoverable and root helpers
accept descendant replacement with stale memo/shared grants. Copied rows/grants and
selected value/native fallbacks, hydration, getter views/return staging, private
argument-four isolation and JSON normalization remain; not every row is zero-copy.
New selected materialization has 20,000-slot/issued-root/depth-100 budgets, not full
unvisited source/grant/context bounds. Mutations, stale authority and changed native
observations can turn denial into allowance. No full ACL bypass, security equivalence,
universal gain or v0.51.0 equivalence/performance parity is promised; benchmark your workload.

The unshipped publication-fusion experiment remains withdrawn. The third selection
is the explicitly weaker authorization fast path, **not a fusion option**.

**ON is unsafe:** source/output mutations can leave stale authorization decisions
and expose data. Matching benchmark outputs do not make ON security-equivalent to
OFF. A historical build marked N/A may lack the newer safeguards entirely; N/A
does not mean those checks were enforced.

Scenarios include narrow/wide plain lists, hydrated lists, global string rules,
document-dependent grants/callbacks, large unused read configuration, embedded
arrays, public population, and two synchronous virtual getters. No private-populate
feature is required, so v0.51.0 can exercise the same public workload.

Hydration uses modern `hydration.publicList` when the built declarations expose
`ModelHydrationOptions`, otherwise historical `defaults.publicListOptions.lean`.
The actual Mongoose query mode is checked. Response data is fully checked before
and after timing, including denied fields, selection, row ordering and children.
The document-grant scenario uses non-skim mode in every build so older versions
actually resolve those grants; its rule callbacks tolerate the historical
request-only planning invocation. Embedded arrays declare an empty traversal
scope (no getter) so both generations apply the nested field rules.
`embedded` and `document-rules` are separate scenarios; the runner does not combine
embedded documents with document-dependent hooks in one scenario.

## Results and interpretation

The terminal table and `.wip/benchmarks/access-router-*/report.md` show median/p95
HTTP latency, requests/second, worker CPU milliseconds/request, Mongoose read ops/
request, and median latency relative to the selected baseline. **Below 1.00x is
faster.** Ratios are suppressed for failures, missing baselines or different
validated output fingerprints. Each row identifies comparison/copy and requested
fast-path settings separately from verified LIST/READ effective configuration;
`report.json` records the candidate's supported and applied flags alongside raw samples, settings,
commits, dirty-worktree status, build/lock hashes, actual dependency and MongoDB
versions, and failures. Each build/job also has a persistent log.
Current workloads measure **LIST only**; READ flags/effective configuration are
verified but **READ is not timed**. Matching fingerprints demonstrate only the
unchanged ordinary fixture contract, never security or historical equivalence.

- Build/install/startup, connection, seeding, indexes and warmup are outside timing.
- HTTP timing includes loopback I/O, JSON serialization and client parsing. CPU
  includes both the Node HTTP server and client; it excludes the MongoDB process.
- Measured DB reads exclude seeding, preflight, warmup and final validation.
- Tags use their **historical dependencies**, not just different access-router
  sources. Peer/dependency differences, GC/JIT, fixed ordering, host load and small
  sample sizes can affect results. This is a diagnostic harness, not a CI speed gate.
- Request-entry work and required per-document authorization remain; do not
  assume a faster result proves equivalent authorization without checking outputs.

Ctrl+C stops active child work and cleans only the runner-owned temporary tag
trees/server. Partial reports and logs survive. Run failures do not stop later
jobs; a failed preparation/job makes the final exit code nonzero. Scratch files
prefer `/tmp/opencode`, otherwise the OS temporary directory; override with
`WTT_BENCH_TMP` pointing at an existing directory. Nothing is published/committed.

If fetching still reports `Permission denied (publickey)`, verify
`git fetch --tags origin` works in the same terminal. Load the appropriate GitHub
SSH key into your running agent (`ssh-add /path/to/key`) or configure GitHub access
normally. The runner does not alter remotes, SSH configuration, keys or permissions.
Installing `ssh-askpass` is not required for terminal passphrase entry.

Historical runner unit checks (no MongoDB; the sealed historical source fixture is
read only to retain the old group-export assertions):

```sh
WTT_BENCH_LEGACY_ROOT='<sealed-old-root>' node --test scripts/benchmarks/access-router.test.mjs
pnpm exec eslint scripts/benchmarks
```

For a real worker smoke test of all eight comparison/copy/fast-path candidates on separate
embedded and document-hook scenarios,
select a sealed historical build (all ten declarations, including its original
source fixture), then run the integration test. This starts
disposable MongoDB and may download its binary:

```sh
WTT_BENCH_LEGACY_ROOT='<sealed-old-root>' node --test --test-concurrency=1 scripts/benchmarks/access-router.test.mjs scripts/benchmarks/access-router.integration.test.mjs scripts/benchmarks/access-router-owned.test.mjs
```

## Fixed owned-authorization protocol (separate driver)

Replace placeholders and run from the checkout root. Use **new ignored directories**
for every output/cache/batch. Neither command builds or installs anything. Sealed
baseline/candidate trees must resolve the same immutable external dependency bytes.

```json
{
  "baselineRoot": "<sealed-old-root>",
  "candidateRoot": "<sealed-candidate-root>",
  "baselineSeal": "<baseline-metadata.json>",
  "candidateSeal": "<candidate-metadata.json>",
  "dependencySeal": "<dependency-identities.json>"
}
```

```sh
node scripts/benchmarks/access-router-owned.mjs --plan config.json '<new-plan-dir>'
node scripts/benchmarks/access-router-owned.mjs --smoke config.json '<new-smoke-dir>'
# OAR-09B ONLY, after implementation/full gates/artifacts are accepted:
node scripts/benchmarks/access-router-owned.mjs --run config.json '<new-final-batch-dir>'
```

`--plan` starts no processes/databases. `--smoke` has two samples, one warmup and one
paired round; an optional `cases` array selects exact catalog IDs. It is **NOT
retention/performance acceptance**. `--run` rejects subsets/settings overrides and
requires seals: `allFilesSha256` paths relative to each artifact; dependency records
have checkout-relative `directory` plus `filesSha256`. Seals are verified before and
after. The candidate seal also fixes source/tool hashes, tool-dependency files,
Node version/runtime/binary, lock, baseline/dependency-seal identities, pnpm binary,
and MongoDB binary/version. Set `MONGOMS_SYSTEM_BINARY` to that sealed executable;
Mongo-backed workers report the actual server version. A different tool/runtime
requires a newly named accepted packet, not reuse of an existing candidate seal.
Partial raw reports/jobs/logs survive failures.
The runner awaits one child at a time and stops its one disposable Mongo in finally.

The fixed catalog (`--plan` writes every ID) is:

| Family                | Actual API/work                                                                                                                                  | Reads and document hooks per operation                                                                                                                                           |
| --------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| primary               | Original plain-wide, document-rules, embedded HTTP LIST; 100 rows/24 fields/32 bytes                                                             | 1 read; document-rules 100 hooks, others 0                                                                                                                                       |
| guard                 | All six original guards at 10/100 rows                                                                                                           | 1 read (populate 2); virtuals 2 getters/row; no doc hooks                                                                                                                        |
| read                  | Generated POST `/bench/__query/<id>` and `/bench/__query/__filter`; cycle 100 persisted IDs; wide/document/embedded plus hydrated/virtual guards | 1 `findOne`, 1 returned row; document case 1 hook, virtual case 2 getters; no counts                                                                                             |
| H0                    | Packed direct `findById` then ordinary presentation subset, in an HTTP workflow wrapper                                                          | 1 initial read, subset +0 reads/hooks                                                                                                                                            |
| H1 / H1-scoped        | `pickAllowedFields`, `trimOutputFields`, `genAllowedFields(...,{purpose:'output'})`; global functions and explicit scoped output policy          | 0 DB operations/hooks/virtuals; new hooks observe frozen EMPTY facts                                                                                                             |
| H2 / H2-query         | Old initial `findById` + actual context handle pick versus new initial + fresh `findById`; matching normal query alone is separate               | old 1 read/hook; new 2 reads/hooks; query component 1/1                                                                                                                          |
| H3 / H3-query         | Same migration via `find` at 10/100 rows and actual old per-row `contexts[i]` handles                                                            | old 1 batched read/rows hooks; new 2 batched reads/2×rows hooks, **not per-row queries**                                                                                         |
| H2-global / H3-global | Old handle reuse versus new fresh raw helper on global-only rules                                                                                | 1 initial read; helper +0 reads/hooks                                                                                                                                            |
| H4                    | Actual exported `guard({modelName,id,condition})`                                                                                                | 1 root read/hook; new candidate facts-only consumer has 0 output callbacks. Metadata configuration remains enabled on BOTH artifacts for the unchanged historical guard workload |
| native-adapter        | Packed direct `findById` / `find` with bounded Date/Buffer/ObjectId/Code.scope/DBRef.fields and nested Map/array                                 | **0 Mongo reads**; explicit Query adapter 1 call; 1 or 100 hooks. This is NOT Mongo timing                                                                                       |
| facts                 | Own owner-only baseline versus identical used owner + unused boolean checksum fact, 100 rows/24 fields                                           | 1 read, 100 hooks, exactly 100 × 10,000 checksum iterations in expensive case, independent of selected fields                                                                    |
| retention             | `--expose-gc`, fixed 100 rows at 4/24/48 fields, five warmups; four cycles of five operations, held/released result and three GCs/observation    | retained bytes, **NOT allocation counts**; true allocation counters unavailable                                                                                                  |

All ordinary families have 100 samples, guards 50, one client, hook concurrency 10,
five warmups. `current-default` (ten OFF) and `current-active` (ten ON) are **the SAME
sealed old build**, not versions/new source modes. Paired comparisons are
isolated/default and trusted/active. Round two reverses both case and profile order.

Every measured response is fully checked on BOTH artifacts, plus before/after checks.
This is `checked-each-response-v2`, **not** the old row-count-only timing series or
the sealed `checked-each-response-v1` full-DTO guard mechanism. New candidate metadata
must explicitly bind `countContract: { revision: 'facts-only-v1', artifactSha256 }`
to its exact root ESM hash. Modes/declarations do not prove this revision. The new
runner rejects absent/mismatched contracts and an actual 24-callback H4 candidate;
there is no 0-or-24 fallback. Historical metadata guards still actually perform zero
callbacks; prior owned candidates and their tools/reports still truthfully mean 24.

The H4 route/body/seed/selection/fetch/hook/condition/response and one root read/hook
are unchanged, but the accepted facts-only consumer constructs no DTO and performs
**zero output callbacks**. Outside timing, new counted guard controls compare actual
root query/projection and hook inputs against ordinary DTO reads (still 24 callbacks),
in lean/hydrated modes, with true/false/invalid facts and actual closed/cleared stage
observations. Helper probes instrument the real shared selection/reference-origin
seams, retain 100 fresh captures and 2,400 field evaluations, and fail if seams vanish.
No workload, gate, sample count, paired sign rule or exactly-two-repeat rule changes.
Original LIST request latency excludes the post-response deep check; its process CPU
includes it. New workflow latencies include their checks. Never pool these APIs/series.
Raw samples, each fingerprint, actual Node user/system CPU totals and elapsed time are
saved. DB server CPU and allocation counts are unavailable. HTTP helper wrappers also
include transport/serialization/parsing; they are not isolated helper microbenchmarks.

Separate preflight children verify actual packed direct APIs, admitted READ retry
(2 adapter calls/1 hook, initiating READ capture/list field rules), terminal 400/403
(no retry), source/target mode input mutations, current ownership/global actor changes,
DTO/metadata replay non-authority, helper hydration/denied accessors and native/wire
bounds. Historical native/accessor/raw-helper differences are recorded, not rewritten
as new-contract promises. Overflow cases are correctness only, never timed. Real Mongo
native persistence/bounds and exact/depleted/depth/cycle controls also remain in the
full packed/package gates; adapter counts never stand in for those Mongo reads.

Another **instrumented correctness-only** child copies the root bundle into exclusive
scratch, refuses missing/ambiguous real function seams and observes 6 rows × 24
callbacks = 144, 6 hooks, one adapter call, raw facts normalized once/root, closed stage
source/fact/promise/memo clearing, and 4/24/48-field copy scaling. It adds no public
package API. Never use that instrumented entry/heap for timing or retained-heap data.

### Immutable gates and reporting

These encode the pre-candidate OAR-01 protocol, not tuned thresholds:

- Primary isolated/default: each initial pair must improve median and CPU; median
  paired savings **≥10% AND ≥1.0 ms median**, **≥10% AND ≥0.5 ms CPU/request**.
- Adverse: **>10% AND >1 ms median**, **>15% AND >2 ms p95**, or **>10% AND >0.5 ms CPU**.
  Trusted/active, guards, READ, comparable raw/native/fact work use the adverse gates.
- H2/H3 migration allowance compares the observed new workflow with old workflow
  **plus its matching normal query component**, with the same median/CPU allowances.
  Component medians/CPU are explicit sums; **no synthetic p95 distribution**. The
  extra fresh read is a disclosed migration cost, not a speedup. The fact report also
  compares expensive work with each profile's OWN no-unused-fact baseline.
- Miss/sign disagreement/material adverse triggers **exactly two** more reversed
  pairs, at original settings. No discards/sample increases/substitutions. Four-pair
  benefit needs three aligned median+CPU pairs and median paired size thresholds;
  adverse confirmation needs the same metric in three pairs and the median delta.
  Unresolved instability/failing counts/fingerprints remains blocking.
- Repeated retained growth **>15% AND >1 MiB** above each process's own forced-GC
  starting heap is blocking in **either held or released observations**. Both initial
  rounds trigger the fixed repeat; confirmation needs three of four rounds (and
  three of four GC cycles per round). Inspect all 4/24/48-field held/released data
  alongside the structural copy/closed-state proof: superlinear retained per-field
  graphs remain blocking even below the absolute heap threshold. No allocation count
  or graph-growth conclusion follows from a noisy heap delta alone.

`report.json` aggregates **median of paired deltas**, never pools requests. p95 is
nearest-rank per job. Two rounds are a reproducibility screen: no CI/significance or
universal speed/security-equivalence claim. Product timings are not established by
unit tests, correctness runs or OAR-09A smokes.

### Additive B1 collection-helper supplement (report only)

`access-router-owned-batch.mjs` is a **separate** driver. It never adds B1 to the
45-case catalog or its 90 retention comparisons. In particular, old
`helper/H3-global/100` still queries and then performs **100 independent fresh raw
helper calls**, not one `pickAllowedFieldsMany`. Historical failures remain visible.

The B1 config has exactly the original five artifact/seal paths; no case, setting,
strategy, sample, gate or repeat overrides are accepted. From the repo root:

```sh
node scripts/benchmarks/access-router-owned-batch.mjs --plan B1-PROTOCOL.json NEW-plan-directory
node scripts/benchmarks/access-router-owned-batch.mjs --smoke B1-PROTOCOL.json NEW-correctness-directory
```

Replace those paths with the accepted preparation packet's repo-relative paths.
The separate fresh measurement owner may use `--run` **only after coordinator
reconciliation**. Preparation owners must not start either final campaign.

The full predeclared B1 matrix has **16 comparisons**: 10/100 rows × raw-only /
query-plus-helper × isolated/default or trusted/active pairing × two comparators:

| Candidate                  | Current-build comparator                      | Historical matching-profile comparator                          |
| -------------------------- | --------------------------------------------- | --------------------------------------------------------------- |
| Raw-only Many              | N independent raw picks, no query             | N actual old raw picks, no document hook configured, zero reads |
| Actual initial LIST + Many | Actual initial LIST + N independent raw picks | Actual initial LIST + N actual issued row-handle picks          |

All variants use H3's deterministic ordinal plus 24 business fields, 32-byte payload
suffix, string/global rules, zero function callbacks, one client, hook concurrency
10, five warmups and 100 samples. Raw-only prepares its rows outside the operation
and performs no query inside it. Query variants time their **whole actual workflow**;
no query subtraction, component latency synthesis or sum of component p95s.
Each HTTP operation has a fresh original request/Core. Equal constant global values
do **not** equate one entry capture with N independent freshness boundaries or
historical issued authority. This is not a migration/default recommendation.

Each comparison starts with two reversed paired rounds; round two also reverses
comparison order. Any initial metric sign disagreement (including tiny/zero effects)
or absolute material delta (>10% AND >1 ms median, >15% AND >2 ms p95, >10% AND

> 0.5 ms CPU) triggers **exactly** rounds 3 and 4 for that entire comparison, with
> reversed pair order. These flags govern **descriptive stability only**, not any new
> acceptance rule. No selective extra sampling or discards: 64 initial jobs, at most
> 64 additional, **128 maximum**. Smoke is one pair/two samples/one warmup: 32 jobs,
> not performance, retention, sign or gate evidence. The original sign/noise/gates
> remain unchanged and apply only through the original driver.

Every B1 response is fully checked (all values, row order, private-field absence)
and fingerprinted. Reports retain all latency samples, actual process CPU user/system
and elapsed totals, directly observed nearest-rank p95, actual DB/hook/virtual and
API-call counts. Allocation totals and DB CPU remain unavailable. A separate compiler
child verifies publicly reachable Core/Base methods and root/advanced result types
in both declaration conditions. Both models' exact/bulk runtime getters must agree.

Untimed copied-artifact probes prove one versus N helper configuration/catalog
captures, distinct N source/stage/memo owners, 24×N string-rule business checks,
and a separate 24×N **all-function** control with original-request `this`, captured
globals and frozen EMPTY facts. Repeated references, all-source-first admission,
scope/policy validation, actual hydrated normalization, sticky caught poison/drain,
late-closed access, and actual private record clearing are checked. Explicit Promise
constructors, binding object seams and Permission map constructors are observed,
not inferred from helper counts; they are not total engine allocation counters.
The approved 200,000 work / 16 MiB caps cover **router-controlled** work/copies only;
opaque Mongoose/native normalization internals, dependency allocations, engine
enumeration and arbitrary trusted callbacks are excluded. Per-row 20,000/depth-100
limits remain. Never time an instrumented entry or an overflowing fixture.
