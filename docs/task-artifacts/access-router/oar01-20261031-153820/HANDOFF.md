> Historical document preserved from ignored task scratch storage.
> Scope and limitations: `docs/task-artifacts/access-router/README.md`. References to omitted
> artifacts are historical, not available execution prerequisites.

# OAR-01 coordinator handoff

Investigation + fresh current baseline delivered. No product runtime/type/test feature
edits, shared task edits, commits, publication, dependency/lock changes or delegation.
All created material is under this NEW ignored directory. OAR-02 was not started.

## Recommendation

Recommend OAR-01 completed after coordinator records the explicit resolved amendments
below. No unresolved technical/user-decision blocker remains for OAR-02. This is an
architecture/baseline gate only: final runtime correctness/performance gates and
independent review remain open for their later owners, no speedup promised.

- [ARCHITECTURE.md](ARCHITECTURE.md): current/new three-boundary ownership map,
  native/copy/escape owners, exact new diagnostics and EVERY old member's disposition,
  all read/public/root/helper/write/new/subdocument/data/deco/advanced entry inventories.
- [CONTRACT-AMENDMENTS.md](CONTRACT-AMENDMENTS.md): precise C2–C6 resolutions for
  stage lifecycle/draining/late callbacks, facts, modes, source-only trust, budget
  owners/shared-target accounting, guard/metadata and post-save errors. Coordinator
  applies changes to shared contract; this child did not edit docs/tasks.
- [IMPLEMENTATION-HANDOFF.md](IMPLEMENTATION-HANDOFF.md): minimal first boolean/actor
  vertical slice and sequential OAR-02–07 ownership. OAR-03 must perform atomic live
  engine/capability/mode plumbing cutover, not preserve aliases until OAR-05/06.
- [BASELINE.md](BASELINE.md): exact commands, results/failures and hash/export/dependency
  identities, all 12 timing jobs and boolean work counts, explicit limitations.
- [PERFORMANCE-GATES.md](PERFORMANCE-GATES.md): fixed before ANY candidate timing;
  percentage+absolute thresholds and bounded repeat/disposition protocol.
- [MEASUREMENT-PLAN.md](MEASUREMENT-PLAN.md): new READ/helper/native/fact/retention
  harness recipes with actual API/read counts for OAR-09; NOT measurements done here.

## Important contract reconciliations from actual callers

1. **Write input facts:** existing-document update/upsert-update/subdocument update
   already evaluate rules with document grants. Emptying them can ALLOW negative
   predicates, not merely deny. Clarify C3: those are separate pre-write document
   stages using normalized boolean facts; request-only create/data/raw helpers empty.
2. **Document guard is a real metadata consumer:** middleware currently `_read`s,
   then interprets returned permission metadata. Preserve feature via PRIVATE live
   fresh-read condition evaluation, not a public callback/token/metadata recovery.
3. **Async/error lifetime:** current row maps don't drain on first rejection. New
   publication owner closes/poisons before drains, stops new admissions, and rejects
   late continuation commit. Existing hook gate FIFO/depth/reentry draining remains.
4. **Diagnostic split:** keep mutable ModelHookContext for actual mutation lifecycle;
   output/doc hooks/virtuals/decorators get allowlisted ModelOutputContext. No source,
   model, native query or lifecycle alias; ServiceOutputContext has no capability.
5. **Controlled post-save failure:** dedicated visibility currently swallows all errors.
   C3/C6 require invalid fulfilled facts/structural poison 400 even after persistence;
   disclose no rollback/no automatic retry, don't silently turn poison into empty output.
6. **Source-only trust and child budgets:** old-active already shares more than the
   proposed trusted mode and omits copies. No grant/context/certificate borrowing in
   new trusted; related targets own mode. Root-row remaining selected budget follows
   embedded/related/native/helper transitions, not a fresh allowance per child.

## Verification actually delivered

- V1 scoped access-router + four necessary transitive packages passed; sealed bytes
  match accepted current ESM `33662fae…`, all 14 dist files/eight declarations/exports.
- Relevant V2 final 206 tests across 5 files passed (204 permanent + 2 new evidence
  work probes). Initial own-fixture actor setup failure retained/explained; no product
  fix or old evidence rewrite. Separate audit-script assumption failure also retained.
- V8 baseline: unchanged LIST worker, default ALL TEN OFF and active ALL TEN ON,
  100 rows/24 fields/32 bytes/1 client/hook10/warmup5/samples100, two reversed paired
  rounds = 12 jobs/1,200 measured requests/reads. Actual modes/getter paths/declarations,
  hydration, hook counts and before/after output fingerprints checked. No candidate.
- Literal-boolean work probe: 6 hooks/144 field callbacks/1 adapter read in BOTH old
  profiles; default grant-copy calls 342, active 0. Not allocation counters or timings.
- Previous dependency 134 packages/3,500 files verified read-only; fresh current
  closure 134/3,510, all external bytes identical. Difference explicitly enumerated,
  not hidden drift. Lock/source unchanged. External dependencies linked, hash-pinned.

Final preservation/portable-path/job/diff audit outputs are `preservation-verification.json`
and `final-check.json` once final gate commands complete. All foreground jobs and
owned benchmark Mongo must be finished before returning this handoff. Old evidence,
task documents, source, dependencies, caches and artifact identities are retained;
no workspace-wide lint/build/test was run. Only scoped V1/relevant V2/V8 baseline.
