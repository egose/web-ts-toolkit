> Historical document preserved from ignored task scratch storage.
> Scope and limitations: `docs/task-artifacts/access-router/README.md`. References to omitted
> artifacts are historical, not available execution prerequisites.

# Sequential OAR-02–07 implementation boundaries

No OAR-02 work started here. Coordinator owns shared plan amendments/status and sends
one child at a time. All product edits/gates below are FUTURE work, not OAR-01 output.
Adopt CONTRACT-AMENDMENTS.md and ARCHITECTURE.md's exact context inventory first.

## Smallest first vertical slice: OAR-02

Own `permission.ts`, grant normalization/resolution sites, private capture preparation,
field/guard public types, and focused actor/grant/request-only callback regressions.

1. Implement descriptor-only boolean normalizer, safe protected keys, bounded map,
   immutable empty facts, application-exception versus fulfilled-invalid distinction.
   Box sync hook results through scheduler so normalizer doesn't assimilate a `then`
   accessor/proxy. Reuse the ONE normalizer at `resolveDocumentAuthorization`,
   `resolveInputDocumentGrants`, explicit Core generator and currently reachable
   supplied-grant boundaries; no default/active rich-map exemption.
2. Capture actor once with actual private immutable backing and stable keys/methods.
   Capture option lookup slots/config grammar before awaits; native filters stay
   private and copied only at actual exposure. Never freeze a Date to claim ownership.
3. Add DocumentGrants and FieldPermissionHook/FieldValidation exports root+advanced,
   decouple guard/field access types. Keep GuardHook one arg. All data/create-input/
   raw-request-only field callbacks get frozen empty facts. Existing-document input
   uses its own normalized boolean facts, preserving positive AND negative predicates.
4. Keep pre-write hydrated lifecycle/persistence semantics. Both pre/post stages
   normalize independently; no decisions merged. Update changed rich-grant tests
   to explicit breaking tests, never cast rich return to the new public type.
5. Baseline assertions: real source/returned-map mutation after resolution cannot
   change facts; invalid result rejects whole map; no callback map copy per field;
   frozen empty facts on request-only paths; input deny predicate not relaxed;
   hook throw versus invalid fulfill and `then` accessor controls.

This is bounded without exposing a new profile selector or a half-working private
stage alias. It may still run the OLD source/output machinery until the atomic
cutover; that is existing code being replaced, not a new compatibility adapter.
No intermediate revision is a release candidate/performance success.

## OAR-03 atomic engine cutover (necessary ownership expansion)

The original later OAR-05/06 deletion steps overlap the engine's type/runtime boundary.
Move their **minimal cutover plumbing** here rather than retaining replayable public
handles or silently ignored controls during a new-engine phase. OAR-04–07 retain
their detailed hardening/migration/matrix ownership below.

- Replace StageRecord/DocumentRecord/OutputRecord copied/trusted/omitted authority
  lifecycles with private open/closed stage+memo and publication failure/drain owners.
  Keep exact receiver/call/model/scope/access checks and genuine embedded/target/
  retry derivations; no broad validation certificate, source equality or graph-walk hits.
- Switch ALL live finalizer/field/helper consumers in the same change: direct/public
  queries, root forwarding, shared write/new/dedicated output. No old engine is used
  as a temporary native/hydrated/helper fallback. Failures are memoized, resumed work
  checks close/poison, pending workers drained before the operation returns.
- Add actual source-mode capture/admission and basic literal option setters at this
  cutover. Both modes use same evaluator/materializer; target-local setting, READ retry,
  strict write/new/dedicated behavior are real, not labels. Remove ten live controls;
  retain names ONLY in preflight migration rejection. No no-op flag aliases.
- Remove public DocumentAuthorization/member/option and context lookup now; migrate
  named helpers to fresh empty-fact evaluator, no hidden reads/doc hooks. Update root/
  advanced barrels and declaration-facing types together. Do not export an expiring
  replacement or let DTO identity/facts stand in for a live stage.
- Introduce allowlisted ModelOutputContext/ServiceOutputContext shells, independent
  of mutation contexts, at all output crossings. Preserve lifecycle mutation context.
  Use new diagnostic type in explicit doc-hook invocations. Core.decorate must not
  overwrite captured facts from `_permissions`. Adapt document guard to private fresh
  read-stage condition evaluation. No metadata certificate recovery.
- Thread common selected/native budgets through publication/children. Reuse the real
  bounded materializer in both modes, not always-true stubs. Basic poison/close tests
  are required now; OAR-04 broadens native/adversarial coverage and removes unnecessary
  finalization copies. A temporarily retained copy for isolation is acceptable; a
  temporarily retained old authority engine/handle/unsafe flag is not.

Focused completion: positive direct/read/list/root/retry/embedded/related, equal-ID
distinct stages, wrong receiving request/runtime/model/access/scope, forged/closed
stage, one invalid row/no partial list, late async rejection/drain, boolean input/
write/new/subdocument smoke, helper zero-hook/zero-read and document-guard positive/
strip-exposure negative tests. Compile every shipped declaration, no alias placeholders.
If this cutover is too large for one child budget, return a coherent incomplete
milestone to coordinator; do NOT silently finish a task using the old fallback engine.

## OAR-04 publication/isolation/native completion

- Own `finalize-model-output.ts`, selected source/view/native materializer, metadata/
  includes/public-child builder integration. Finish once-only selected publication,
  remove copies/DTO traversals whose only purpose was graph authority transfer.
- Keep necessary per-getter/stable-base/arg-four isolation, per-parent related-output
  isolation and native return staging in BOTH source modes. Child-first virtual order,
  source-ID/private-public masks and no inherited setter writes remain mandatory.
- Complete exact budget owner propagation for batched includes/shared raw queries,
  depth offsets, selected denied/protected keys, native wire expansion and sticky
  poisoned 400; no reset after native or child entry. No swallowed overflow in getter,
  metadata, path-write or post-save visibility catch. Preserve tested scalar/native
  accounting and supported Date/Buffer/BSON/Map/read-only/hydrated behavior.
- Run focused native/private-populate/metadata/finalizer matrices, actual separate
  work-count comparison, and packed runtime LIST+READ native probes. Keep real calls,
  callbacks and budget edge cases, not semantic equivalence inferred from line count.

## OAR-05 helper/escape migration audit

- Audit every table row in ARCHITECTURE.md. Fully remove unused DTO graph-transfer/
  membership/known-output/unbound supplied-grant machinery and obsolete declarations
  left after live cutover; no capability metadata callback substitute.
- Finish raw/helper argument forgery/JS inherited/nonenumerable-retired-option tests,
  data versus input versus output separation and explicit server output grants.
- Preserve useful explicit metadata/hook utilities with boolean normalization and
  non-authority documentation; keep raw hydrated parent business APIs. Delete obsolete
  unbound sub-row raw-plan chain, not necessary write/policy native normalizers.
- Verify returned DTO serialization/spreads/same IDs/child replacement/metadata cannot
  acquire authority. Late internal consumers reject; ordinary prepare/change and
  trusted presentation continue. Observe actual helper versus fresh query read counts
  with packed API, following MEASUREMENT-PLAN.md.

## OAR-06 full configuration/admission matrix

- Finish atomic model/default/global/deco setters, undefined inheritance/restoration,
  exact enum values, default isolation, target-mode independence, in-flight rollback
  and warning/logger-failure tests. No dormant combinations/warnings remain.
- Exhaustive new/retired control presence rejection at direct helpers/services,
  HTTP/root/default buckets/include/populate/subquery/policy namespaces BEFORE work;
  inert same-named business fields. Cover all ten retired keys including undefined,
  false, inherited/nonenumerable descriptor cases and new modes' invalid namespaces.
- Reconcile exact-key and bulk getters, declarations and supported two-mode inventory;
  model target own mode not initiating root's, embedded inheritance and READ retry
  effective LIST under READ profile. Independent callback service is a fresh call.

## OAR-07 all alternate APIs and downstream integration

- Complete write/create/upsert/new/dedicated subdocument matrices, separate pre/post
  facts and no authorization relaxation (including negative input predicates).
  Preserve persistence/save hooks, row/input/output/operation/related dimensions,
  ordinary hydration, private target policy and post-save error disclosure.
- DataService/DataCore remains request-only, second arg frozen empty, no model hooks
  or backend elevation. Root and custom/advanced entrypoint consumers cannot resurrect
  retired authority through loose JS/type extension slots.
- `access-router-deco`: DocPermissions boolean return; new decoration contexts;
  operation guard one arg; class-instance `this` plus original request injection;
  mode property validation/global rejection/atomic bootstrap and rollback. Make
  compile-required changes in earlier owners if needed; no temporary rich type alias.
- Root/advanced/processors ESM/CJS and declarations intentional export delta; no
  private stage/capture/budget issuer shipping. Scoped V4 and focused V1/V2/V5;
  final full access-router V3/V7 after migration docs in OAR-09, never root workspace.

## Required coordinator reconciliation

Amend C3 existing-document input exception; C2 precise stage/drain lifetime; C5
document-guard and obsolete utility disposition; C6 diagnostic table, budget owners
and post-persist controlled errors. Move atomic public/mode cutover plumbing into
OAR-03 explicitly, with OAR-05/06 as completion/audit rather than late alias removal.
No task ID/dependency renumbering needed. OAR-08 M1–M5 must reflect every intentional
change above; OAR-09 uses fixed PERFORMANCE-GATES.md and all scope restrictions.
