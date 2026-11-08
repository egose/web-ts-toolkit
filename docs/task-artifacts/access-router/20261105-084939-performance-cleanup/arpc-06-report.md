# ARPC-06 — bulk-CREATE field-metadata query investigation

## Decision and verification status

**No production change.** No existing, provably equivalent path was found that
coalesces the remaining bulk-CREATE visibility queries while preserving application
processing. This is the bounded investigation's decision, not a proposal to implement
batching later as a prerequisite to deciding. No purity option, function-identity
purity inference, or new feature is proposed.

Delivered: this report and
[`bulk-create-metadata-filter-trace.integration.test.ts`](../../../../packages/access-router/test/bulk-create-metadata-filter-trace.integration.test.ts).
The new real-MongoDB characterization is **unexecuted, pending the coordinator's
exclusive runner**. Its assertions below are expected traces derived from source,
not newly observed runtime results. No build, test, benchmark, typecheck, or lint was
run, to avoid disturbing possible calibration. No speedup, DB latency, allocation,
or non-regression claim is made.

The coordinator owns the shared task's status/dependency reconciliation. This
delivery does not mark its pending integration verification passed. ARPC-02's
existing candidate remains untouched; no production, shared task, harness, or
other evidence file was edited. No subagents, commits, or scratch files were made.

## Scope and provenance

- Task: [ARPC-06](../../../tasks/20261105-084939-access-router-performance-cleanup.md),
  bounded investigation only; both CREATE authorization modes.
- Reviewed HEAD: `6c3ceee`, with the existing ARPC-02 finalizer/copy candidate and
  concurrent ARPC-01 harness/evidence work. The inspected `service.ts` diff only
  adds finalizer preparation/wiring; it does not change the metadata helpers.
- Reviewed the metadata fallback, LIST comparison, CREATE/UPDATE lifecycle,
  ordinary request-filter resolver/cache, publication draining, write detachment,
  and relevant package fixtures/tests. This is not an exhaustive adapter, database,
  middleware, or application-policy audit.
- Primary source SHA-256 at inspection; paths are under `packages/access-router/src/`:

  | File | SHA-256 |
  | --- | --- |
  | `services/service.ts` | `31c195f9c7e1409d5bb7b67f5411f3e2e697e6fa2e7bd451b600ca84e2e5b1ef` |
  | `services/base.ts` | `690e39eaa567e11eb8cc25e73031f8c0663cb1567fb60abc0237abfb9ea51983` |
  | `core.ts` | `950df5179f9d9f2f9dda6176c08423e7ef60f6c87cccdf9f2f94247752d0644a` |
  | `core-shared.ts` | `21c412f4ae956099b9e9ff5f3b626dd03b6b9ed5393d4db14288c1d4292007b0` |
  | `acl/filter-resolution.ts` | `cc7c8dba9ad792cfef193d5ea18b5068b6432fbcaec1608dd99cbbd446c7bab5` |

Line references below describe this working tree; symbols are the durable anchors.
No source snapshot, generated bundle, database files/binaries, dependencies, or
raw runtime log is included in this report. Reproduction requires the checkout,
installed package prerequisites, and the coordinator's later execution.

## Existing measured work — queries are not callbacks

Read-only inspection of the preserved
[ARPC-01 work observations](arpc-01-work-observations.json), consistent with
[work findings item 4](arpc-01-work-findings.md), gives the following for **both**
`iiii` and `tttt` tuples and **both** direct/public entries. The 16-row metadata
fixture uses `maxBulkConcurrency: 2`; it installs base filters, not override filters.

| Operation / shape | Metadata visibility adapter reads | Total `baseFilter.read` callbacks | Total `baseFilter.update` callbacks |
| --- | ---: | ---: | ---: |
| LIST, 16 rows, metadata enabled | 2 | 1 | 1 |
| bulk CREATE, 16 rows, metadata enabled | 32 | 2 | 2 |
| READ hit, metadata enabled | 2 | 1 | 1 |
| UPDATE by ID, metadata enabled | 2 | 1 | 1 |
| Stripped + disabled controls | 0 | Operation-dependent | Operation-dependent |

READ's ordinary lookup already uses the read scope; UPDATE's lookup already uses
the update scope. Those callback totals are not metadata-only increments. The
bare/hook baseline controls set strip and disable together; independent postures
are covered by the new, unexecuted test rather than claimed as separate historical
measurements. Bulk CREATE also records 16 scheduled adapter-create submissions.

These are **deterministic-adapter work observations**, not measured MongoDB network
round trips or a wall-time cost partition. Do not describe 32 metadata reads as 32
base-filter callbacks. Conversely, cached base filters do not mean the per-row
queries, transformations, or their timing can be removed. This investigation did
not rerun or recertify the preserved baseline.

## Current observable path

All source references in this section are under `packages/access-router/src/`.

1. **Private entry and metadata inputs.**
   `services/service.ts`, `finalizeDirectOutput:555–645`, completes each row after
   its document/virtual/selected-field processing. With requested field maps,
   enabled field permissions, and unstripped metadata, it uses the private
   `ServiceHookContext.fieldPermissionAccess` if supplied, otherwise calls
   `getFieldPermissionAccess([source._id], publication)`. The ID comes from the
   private row source, not the returned DTO/selection, even if output excludes `_id`.
   These are internal inputs, not a new public `genFilter` overload or reusable
   authorization option.
2. **Singleton query shape.** `getFieldPermissionAccess:3347–3365` stringifies and
   deduplicates IDs only within that invocation, then starts read/update checks with
   `Promise.all`. `getAccessibleIdSet:3368–3375` supplies exactly
   `{ _id: { $in: ids } }` to `this.genFilter(access, idFilter)`. CREATE normally
   supplies one ID per call. A false resolved filter yields an empty set and no
   adapter read; otherwise the adapter receives `{ filter, select: '_id', lean: true }`.
   Deduplication inside one call does not deduplicate separate output occurrences.
3. **Live ordinary request policy.** `services/base.ts:593–595` forwards to the
   request core. `core.ts:175–191` resolves options through live `getModelOption`,
   then `acl/filter-resolution.ts:61–87` uses the ordinary request resolver. This
   is not the captured private-query path at `filter-resolution.ts:21–45` and is
   not replaced by the write's input/output authorization policy. New metadata
   calls can observe live filter-function replacements during the CREATE call.
4. **Per-call capture, per-request fulfilled cache.**
   `core-shared.ts`, `resolveAccessFilterParts:182–211`, captures the override and
   base functions before awaiting the override. The override receives the incoming
   singleton filter, permissions, and original request receiver **on every
   invocation**. Returning false skips that invocation's base lookup/query. The
   base callback receives permissions and the original request receiver, not IDs.
   Its core-owned cache is keyed by model/access and checked against resolver
   identity **after** the override completes. A miss awaits the base result before
   storing it: no in-flight promise or rejection is memoized. Thus concurrent
   initial misses can execute the same callback more than once; later calls reuse
   a fulfilled scope, not an earlier ID-merged filter. Replacing the resolver
   invalidates reuse. Function identity is a cache-version check, not a purity
   guarantee. Counts depend on suspension/interleaving, not a universal 1 or N.
5. **Different existing LIST boundary.** `findPrepared:2105–2168` calls the helper
   once with all LIST IDs before root row finalization, then assigns the shared
   private access sets to each row's lifecycle context. `createPrepared:2370–2424`
   supplies no such batch access sets. LIST's established callback/DB observation
   boundary is not evidence that moving CREATE to the same boundary is equivalent.

### Lifecycle, row facts, errors, and modes

- CREATE waits for **all** scheduled Mongoose creates/saves, then **all**
  `afterPersist.create` hooks/snapshots before detached output admission. Each
  bounded output worker then runs its own document stage and selected/virtual
  work before its metadata check. There is **no CREATE `onChange` phase**.
  `service-execution.ts:200–227,283–305` preserves
  `virtualAccess: create`, `outputAccess: read`, `docPermissionsAccess: create`.
  Metadata's read/update row queries do not invoke separate read/update document
  hooks; their field maps use that row's already-resolved CREATE stage facts.
- UPDATE control order is save → `afterPersist.update` → diff/`changes` → detached
  output/document/field work → metadata (`service.ts:2682–2737`;
  `core.ts:574–595`). Moving metadata before change hooks would also move its
  observations. This order is source-inspected, not newly exercised by this file.
- A denied metadata visibility check does not retroactively deny or undo a created
  row. Its corresponding map is the nonempty `{ $: '_' }` placeholder, even when
  document facts grant that field. Row stages, facts, and maps are separate for
  repeated IDs/objects. No ID-keyed cache may replace these occurrences.
- Read/update metadata work is publication-tracked. Failure poisons publication,
  stops later worker admission, and drains already-started peer work; successful
  earlier writes are not rolled back. Unexpected filter exceptions propagate;
  recognized authorization errors follow the existing controlled-result path.
  See `acl/output-publication.ts:104–166`, CREATE's mapper error callback, and
  `acl/prepared-query.ts:151–188,263–278`. Decoration follows successful output
  publication, not partially completed metadata.
- Both CREATE modes detach from live post-write documents; trusted skips only the
  later disposable document-hook view (`acl/document-stage.ts:543–615`). Neither
  mode removes callbacks, policy observations, query middleware, or failure/drain
  requirements. Existing ARPC-02 reuse leaves the per-row completion boundary intact.

## Equivalence assessment

| Candidate | Disposition / reason |
| --- | --- |
| Use LIST's one shared metadata lookup for CREATE | **Reject.** Changes singleton incoming filters to a union, callback multiplicity, live option lookups, and timing relative to each output hook/field rule. An override need not distribute over an ID union. |
| Keep per-row callbacks but batch their DB reads | **Reject.** Equal callback totals alone do not preserve their interleaving with DB reads/results, middleware, subsequent row hooks, failures, or live persistence. The current serialized-worker path can observe a changed DB between rows. |
| Reuse by repeated ID or same function | **Reject.** Duplicate output occurrences have independent stages and can see different external state. Fulfilled base-scope reuse is already present; identity does not certify pure callbacks or stable database visibility. |
| Batch when no custom filters are installed | **Not proven equivalent.** Output hooks/field rules, Mongoose query middleware, custom adapters, and external DB activity can still be stateful. The pending test deletes the second stored row from its output hook without any base/override filters: earlier eager visibility would produce different maps. |
| Existing empty/disabled/stripped/false-filter paths | **Keep.** They already avoid the corresponding work. A singleton has no cross-row coalescing benefit. No additional equivalent optimization was established. |

The residual cost is up to two `_id`-only visibility reads per emitted CREATE row
when field maps are requested and enabled. Denied filters avoid their read; omitted,
disabled, or stripped maps avoid these checks. This can be a real I/O concern, but
the preserved baseline does not quantify DB latency, and it does not justify
changing application processing. No batching implementation or timing candidate is
needed to conclude **no change** under the current contracts.

## Delivered characterization — not executed

The new file uses `useMongoTestDatabase`, source runtime/service workers, the real
Mongoose adapter, save/query middleware, and public `_create` dispatch. It does not
mock persistence or call private metadata helpers. Its `genFilter` spy calls through
the already-bound receiver and is work instrumentation only, never a timing loop.

Each group runs under isolated/trusted CREATE modes:

- Single/three-row controls: exact incoming singleton filters, real `_id`-only lean
  queries, one fulfilled base callback per access with serialized row workers,
  per-row overrides, request receivers/actor observations, save/afterPersist/output/
  field-rule/metadata/decoration ordering, no CREATE change hooks, per-row grants,
  and post-publication live-document detachment.
- Independently disabled, stripped, facts-only, and unrequested metadata postures:
  zero visibility/filter work without skipping persistence/output hooks.
- Stateful custom transforms and a denied second-row update check: each transform
  observes the row hook/field-rule side effects; only the denied DB read is skipped.
- Live base-policy replacement from the second output hook: the second metadata
  call uses the replacement rather than a CREATE-start snapshot/cached old scope.
- Repeated output identity via supported `afterPersist` document return: separate
  hook/query occurrences and different grant maps, without duplicate DB `_id` inserts.
- Four-row, concurrency-2, explicitly gated base callbacks: two initial read and two
  update callback misses, then fulfilled reuse; eight per-row `genFilter`, override,
  and real query occurrences. This avoids assuming all schedules produce this count.
- No-filter DB mutation: a row output hook removes its stored row before visibility
  checks, so successful CREATE output retains placeholder maps for that row.
- A read-transform exception with a blocked already-started update peer: settlement
  waits for the peer, later rows do not finalize, decorators do not run, and all
  already-created rows remain persisted. Gates are released and requests awaited
  in `finally` even if an intermediate assertion fails.

These are characterization assertions, **not passing DB integration evidence yet**.
The file does not newly cover UPDATE, LIST, all 16 mode tuples, or every application
interleaving; existing baseline and focused package suites remain separate evidence.

## Coordinator-only verification handoff

**Do not run concurrently with calibration, builds, tests, or benchmarks in this
checkout.** Working directory: repository root. Prerequisites: installed workspace
dependencies, supported Node (`>=24`), pnpm, and MongoDB memory-server prerequisites.
The setup imports built package output, so rebuild the current retained candidate
and transitive dependencies first, only when the coordinator grants an exclusive slot.

Proposed commands, **not run here** (`$PWD` supplies the checkout's absolute TMPDIR):

```sh
ARPC06_TMP="$(mktemp -d "$PWD/_tmp-arpc-06-verify.XXXXXX")"
git check-ignore "$ARPC06_TMP"
TMPDIR="$ARPC06_TMP" pnpm --filter @web-ts-toolkit/access-router... build
TMPDIR="$ARPC06_TMP" pnpm --filter @web-ts-toolkit/access-router exec vitest run --config vitest.config.ts test/bulk-create-metadata-filter-trace.integration.test.ts
```

Stop if the scratch directory is not ignored; do not start the next command on a
failed prerequisite. The final line is the exact focused test command. Keep further
acceptance package-only. No whole-workspace/downstream checks or new batching
benchmark are requested for this no-production-change decision.

Static handoff checks are limited to source/evidence review, artifact reference and
ignore/privacy checks, and whitespace-diff checks. They do not establish TypeScript,
lint, MongoDB, runtime, or timing success; the coordinator should append actual
focused results before recording verification as passed.

Checks actually performed:

- Both new files: `git diff --no-index --check /dev/null <file>` emitted no
  whitespace diagnostics (exit 1 identifies the added-file difference).
- `git check-ignore -v -- <test> <report>` returned no matches (exit 1): both
  destinations are not ignored.
- Read-only reference scan: all four Markdown links resolve. Manual content review
  and a machine-path/private-session-pattern scan found no credentials, local
  absolute paths, or private session identifiers in the delivered files.
- `git status --short` and the existing `service.ts` diff were reviewed; unrelated
  changes were left intact. No execution evidence was fabricated from static checks.
