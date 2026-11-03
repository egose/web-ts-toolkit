> Historical document preserved from ignored task scratch storage.
> Scope and limitations: `docs/task-artifacts/access-router/README.md`. References to omitted
> artifacts are historical, not available execution prerequisites.

# OAR-09E architecture packet — ready for coordinator review

**Architecture delivered; implementation and performance acceptance remain pending.**
Read `DESIGN.md` for the exact implementation packet, G1–G5 guard refinement, ownership
argument, test matrix, installed-doc changes and candidate-only count-proof amendment.

All new files are exclusively in **`_tmp-oar09e-design-kTiLZtLh/`**, verified ignored.
No product/test/tool/task/status/lock edits, build, package gate, delegation, commit,
publication, dependency installation or timing campaign occurred. No owned jobs remain.

## Recommended architecture

1. **Fresh existing-value helper consumer.** Extract the canonical output-selection
   shape from query fetch expansion, so raw helpers retain the same field grammar,
   nested/dotted ordering/memo/scopes/explicit policy/metadata/ref/native/budget rules
   without building fetch/private-dependency/public-fetch/related plans. Keep fresh
   policy/catalog/actor lookup on every independent helper, isolated source admission,
   one evaluator and selected-value materializer. Add authenticated synchronous built-in
   EMPTY admission inside the existing stage engine; no unused source callback view,
   resolver promise or query-reference provenance. Real callbacks/async hooks are not
   skipped. No cross-call decisions, DTO certificates or public batch API.
2. **Private document-condition consumer.** Replace guard ALS/late DTO consumption
   with an exact-receiver private reader and execution purpose. Share normal public
   by-ID/default/retry/query/fetch/hook-source preparation, resolve the same root hook
   and facts, evaluate the same condition, then close/drain and return only a private
   boolean. Do not construct/publish DTOs or invoke root/child output filtering,
   virtuals, metadata, decoration/tasks or output-only include attachment queries.
   Actual queried hook-input targets retain their own operation/row/mode admission.

Public helper/service/guard signatures stay unchanged; planning helpers keep planning.
Every actual DTO route retains mandatory field checks. The guard refinement is not
claimed behavior-equivalent: output-only errors/effects and `_read` override interception
cease to be guard behavior. Source/fact errors remain sticky controlled 400, ordinary
missing/denied conditions remain 401, retry behavior and hook inputs are preserved.

**Important inspected contract distinction:** direct `_read`, including today's guard,
does not run the generated HTTP READ-route operation gate. Preserve current service/
route separation and captured LIST fallback gate; do not claim guard success implies
HTTP READ-route admission. The new probe confirms it. This packet does not silently
add/remove an initial operation check or grant row/target authority.

## Bounded evidence actually collected

All probes run foreground/serial/awaited against **copies of current OAR-09D emitted
ESM**, with only private instrumentation/diagnostic exports in this new directory.
There is **no implementation prototype** and no before/after timing claim.

| Command, repo root                                                                                   | Result                                                                                                 |
| ---------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------ |
| `git rev-parse HEAD`; `git status --short`; `git check-ignore docs/task-artifacts/access-router/oar09e-design-kTiLZtLh/DESIGN.md` | HEAD `a1996e10…`; only incoming coordinator task modification; new packet ignored                      |
| `python3 _tmp-oar09e-design-kTiLZtLh/audit.py entry`                                                 | Captures 3,231 path SHA256 identities and entry status                                                 |
| `node _tmp-oar09e-design-kTiLZtLh/probe-helper.mjs`                                                  | Pass; 1/10/100 helpers, checked DTOs and ordered fields; no queries/hooks/virtuals                     |
| `node _tmp-oar09e-design-kTiLZtLh/probe-guard.mjs`                                                   | Preserved fixture failure: scalar `baseFilter:false` is not a terminal row hook; not a product failure |
| `node _tmp-oar09e-design-kTiLZtLh/probe-guard-v2.mjs`                                                | Pass; five current guard observable cases using actual `baseFilter.read: () => false` for row denial   |

`HELPER-WORK.json` / `probe-helper.log`: 100 helpers perform **100 fresh captures,
100 stages, 100 general projection plans, 200 compactions, 200 whole-source view copies
and 2,400 field evaluations/memo calls**. The unused second source copy occurs before
a built-in EMPTY resolver which never receives application code. Query-only collections
and their actual lengths are saved. Proposed removal is justified by consumer needs,
not configuration-mode labels. Keep 100 captures and all 2,400 checks after implementation.

`GUARD-OBSERVABLES.json` / `probe-guard-v2.log`: ordinary guard makes **1 fake adapter
call, 1 hook, 24 field callbacks and 1 decoration**; row denial makes 0 adapter calls
and returns 401; invalid selected virtual output returns 400; throwing decoration
escapes. Initial `operationAccess.read:false` alone does not deny the direct guard.
These are **fake-adapter observations, not actual Mongo read or performance counters**.

OAR-09D's exact benchmark work/profile evidence is reused separately in `DESIGN.md`:
H3/100 retains 100 fresh helper captures + initial query, 5,351 snapshot-node visits,
5,000 memo calls, 56,550 binding assertions, 3,737 full catalog walks. H4 retains one
read/hook/24 callbacks. Do not pool those prior profiles with new helper-only probes.

## Explicit benchmark mechanism-proof amendment

New condition-only candidate H4 must show **1 query / 1 hook / 0 output callbacks**,
with the same route/body/row/selection/DB projection/hook input/hydration/condition and
`{allowed:true}` fingerprint. Ordinary DTO READ controls must still show 24 callbacks.
Original OAR-01 plan required one query/hook; 24 was the later implementation-specific
full-DTO proof. Changing it requires **new candidate tool/contract series and seal**,
not changing the old tools or pretending old evidence meant zero callbacks.

Use benchmark-only correctness metadata keyed to artifact hash plus actual outside-
timing preflight counts. Modes/declarations alone cannot distinguish old-owned/full-DTO
and new-owned/facts-only implementations. Keep worker workload definitions byte-identical.
All thresholds, sample counts, paired order, sign/repeat rules, fingerprints, historical
workloads and the three failed campaigns remain unchanged. Do not rerun the same artifact
for quieter signs. No performance acceptance or waiver is established.

## Next action / ownership

**Coordinator:** review and record the architecture and G1–G5 contract refinement in
the coordinator-owned task; then assign one fresh implementation owner, no concurrent
child. No further unresolved technical/public API choice is left in the proposal.
This is design acceptance, not OAR-09 or OAR-10 completion.

**Fresh implementation owner:** follow `DESIGN.md`'s eight-step packet in order: save
entry → characterize/extract shared selection → helper specialization → shared guard
fetch prefix/private consumer → installed migration/docs/tests → versioned count proofs
and smoke → full scoped V1–V7 + deterministic newly named seal → handoff. Never rewrite
the user's committed OAR-09D/predecessor work. Fresh measurement follows coordinator
acceptance, in a separate sequential packet against original baseline `33662fae…`.

Required test matrix explicitly covers grammar/dotted-first memo, async reentry/capture/
setters, receiver binding, proxies/accessors/native serializers, inclusive 20,000-slot/
depth-100 edges, related/private-populate inputs, selected poison/close/drain, default
selection/hydration/retry/operation/row distinctions, post-save poison and packed public
ESM/CJS/declaration/deco consumers. Guard output-effect migration is required, not optional.

## Identities and verification limits

- Current live/candidate ESM remains
  `7faeb957631bd5761e8b828835f4b600634db1afa740e229549bfc4ba6a74a4f`.
- The original 09D `final-01` protocol/metadata/artifact, original baseline payload,
  tracked source/docs/tools/lock and selected historic contracts/reports are included
  in the packet's 3,231-path entry/final hash audit. See `PRESERVATION.json`.
- Additional seal comparison found one **inherited user-committed line-wrap difference**
  in `packages/access-router/test/service-authorization-subdocuments.integration.test.ts`.
  It matches both entry and user HEAD, and the inspected diff changes only the layout
  of a chained helper call. `COMMITTED-ENTRY-VS-09D-TEST.diff` and the original failing
  `PRESERVATION-METADATA-DIAGNOSTIC.json` retain the discovery. All 622 candidate records
  and live runtime/declaration/tool outputs match; live source is not universally
  byte-identical to the old seal. Nothing was reverted, reformatted or retested there.
- No exhaustive historical-cache or external 134-package/293-tool dependency-tree
  rehash is claimed for this architecture packet. No command writes those trees, no
  old run wrapper/cache is used, and all new probe modules/logs reside here. Existing
  134/3,510 and 293/10,545 sealed closure identities remain historical input records.
- No V1–V8, full/core/deco tests or workspace-wide verification ran. Existing passing
  gates are inherited evidence only, not verification of this proposal. No candidate,
  public type change, speedup, universal equivalence or release acceptance is claimed.
- `VERIFICATION.md` records final documentation/preservation checks. All Node probes
  exited; no Mongo/server/worker/build/test process was launched or left running.
