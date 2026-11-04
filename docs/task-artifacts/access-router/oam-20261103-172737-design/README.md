# OAM-01: write-output authorization design gate

## Provenance and recommendation

**Proceed with OAM-02, then OAM-03 using the contract below.** No unresolved
ownership decision blocks implementation. This is a bounded design and handoff,
not implementation, feature acceptance, or a full security/performance review.

- Related task: [output authorization modes, OAM-01–05](../../../tasks/20261103-172737-access-router-output-authorization-modes.md).
- Investigator: task-local alias **DESIGN-01**, 2026-11-03; source revision
  `c68451e`. Initial status contained only the untracked coordinator-owned task.
  No subagents, commits, publishing, dependency changes, or runtime edits.
- Instructions reviewed: [root AGENTS.md](../../../../AGENTS.md), the whole task,
  [artifact preservation](../../README.md), and
  [task conventions](../../../tasks/README.md). The coordinator alone edits task status.
- Bundle contents: this self-contained design, source index, curated probe
  observations, verification record, and next-agent handoff. Disposable probe code,
  tool logs, dependency trees, and generated artifacts are not archived. This is
  **not an executable probe-reproduction bundle**; observations do not certify
  unimplemented behavior.

## Selected contract

Keep exactly `readAuthorizationMode` / `listAuthorizationMode`; add exactly
`createAuthorizationMode` / `updateAuthorizationMode`. All use `AuthorizationMode`
(`'isolated' | 'trusted'`), default to isolated, and remain server model/default-model
configuration. Do not add alternate spellings or compatibility aliases.

CREATE/UPDATE relaxation applies **only to post-persistence, post-lifecycle output**.
Both modes first acquire a bounded, ordinary source with independent mutable
storage. Trusted lends that source directly to the document-permission output
hook; isolated supplies a further disposable view. Trusted-hook mutations may
change response values and newly calculated output facts, never input authority.
Preserve the existing hydrated pre-write UPDATE hook argument, `args.doc`: this
feature does not isolate that hook, arbitrary closures, or application callbacks.

**Finalize the target rule:** genuine embedded scopes inherit their owner's output
mode/source preparation and owning facts. Actual related targets use **their own
captured READ/LIST mode at effective target data access**, including targets reached
from genuine CREATE/UPDATE/UPSERT output. Parent mode never selects target mode.
Target policy, hook definition/dependencies, and facts remain target-owned. Custom
target accesses and count attachments gain no trusted eligibility. Dedicated
subdocument origins remain excluded, even when their diagnostic access resembles
READ or UPDATE.

### Selection and ownership matrix

Access tuples below are `row / virtual / output / docPermissions`; `—` is absent.
Mode selection must not rewrite those tuples or the initiating operation.

| Canonical origin/path                                                                                      | Operation; access tuple                                                                   | Output mode owner                               | Source/facts boundary                                                                                                     |
| ---------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------- | ----------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------- |
| Root READ: `findOne`, `findById`, `_read`, `_readFilter`                                                   | `read`; `read/read/read/read`                                                             | Root captured `readAuthorizationMode`           | Existing query admission; independent stage facts                                                                         |
| READ-to-LIST retry                                                                                         | `read`; `list/list/list/list`                                                             | Retain root READ capture, not a fresh LIST mode | Existing retry derivation and stage/publication behavior                                                                  |
| Root LIST: `find`, `_list`                                                                                 | `list`; `list/list/list/list`                                                             | Root captured `listAuthorizationMode`           | Existing query admission; independent facts per row                                                                       |
| `create`, `_create`, bulk CREATE                                                                           | `create`; `—/create/read/create`                                                          | Root captured `createAuthorizationMode`         | Mandatory output detachment after `afterPersist` and snapshots; new stage/facts per row; no invented input document facts |
| `updateOne`, `updateById`, `_update`                                                                       | `update`; `update/update/read/update`                                                     | Root captured `updateAuthorizationMode`         | Mandatory output detachment after save, `afterPersist`, snapshots/diff and `changes`; pre-write stage unchanged           |
| Internal `upsert`: allowed lookup finds row                                                                | `upsert`; `update/update/read/update`                                                     | Captured UPDATE setting                         | Existing update worker; retain update row/input/hook/dependency semantics                                                 |
| Internal `upsert`: allowed lookup misses                                                                   | `upsert`; `—/create/read/create`                                                          | Captured CREATE setting                         | Existing create branch derivation/worker; no update facts reused                                                          |
| Public `_upsert`: string `_id` supplied                                                                    | `upsert`; `update/update/read/update`                                                     | Captured UPDATE setting                         | Existing existence gate then update; allowed miss remains Unauthorized, denial remains terminal; **no create fallback**   |
| Public `_upsert`: no string `_id`                                                                          | `upsert`; `—/create/read/create`                                                          | Captured CREATE setting                         | Existing create derivation; keep create selection/tasks/decoration                                                        |
| Genuine embedded output                                                                                    | Owner operation and tuple unchanged                                                       | Owning output mode                              | Actual selected subtree handoff; owning facts, not another hook invocation or cross-row grants                            |
| Genuine populate target                                                                                    | Keep parent's initiating operation; target `read/read/read/read` or `list/list/list/list` | Target's own captured READ or LIST setting      | Independent target stage/policy/facts; write-origin detachment required; isolated parent remains protected                |
| Genuine include target                                                                                     | Preserve existing include operation/tuple (`read` or `list`)                              | Target's own captured READ or LIST setting      | Existing include fetch/finalization/attachment ownership; no mutation endpoint/include support is added                   |
| Separate READ/LIST inside any hook                                                                         | New independent root operation/capture                                                    | Its own model and current configuration         | Never inherit write-output authority, actor capture, facts, or provenance                                                 |
| Input admission, pre-write UPDATE, validation/prepare/transform/save/lifecycle                             | Existing write tuple                                                                      | No new trusted selection                        | Original execution stays isolated; hydrated input-hook contract remains                                                   |
| NEW, DELETE, COUNT, DISTINCT, raw output/field helpers, dedicated subdocuments, unsupported custom origins | Existing operation/tuple                                                                  | No new trusted selection                        | Preserve existing behavior; a read-like tuple or shared provenance is not eligibility                                     |

Internal UPSERT captures both settings and both existing branch intents/target sets
before its lookup await. Public UPSERT also captures both mode primitives before
identifier/existence hooks, even though its branch is already known from input.
Select the branch once from the canonical worker, not from `outputAccess: 'read'`
or live settings after saving. Do not add a fifth mode or change the pre-existing
UPSERT query count, result shape, denial, or race semantics.

## Smallest private phase/origin mechanism

Use an **output child execution/call**, not a mutable mode switch on the input
execution and not a second evaluator. Private issuers and origin records never
become package exports, request options, diagnostics, or DTO keys.

1. Add a private write-entry origin discriminator (`create | update | upsert`) to
   the existing WeakMap-owned execution preparation. Issue it only through a
   dedicated private write-entry constructor used by `create`, `updateOne`,
   `updateById`, internal `upsert`, and public `_upsert`. The generic execution
   constructor/resolver must not synthesize it from an access tuple,
   `applicability`, or user data. Retain it through the existing UPSERT-create
   derivation. This is one origin field, not a public capability system.
2. In the lexical canonical `createPrepared` / `updateOnePrepared` workers, derive
   an output child from the authenticated receiver/execution and fixed executed
   branch. Check root binding, DTO purpose, genuine write origin, allowed branch,
   and unchanged branch access tuple. Generic helpers, dedicated origins, and
   caller-constructed access tuples cannot issue this phase. Wrong receiver,
   scope, branch, or publication must reject.
3. The child's private authorization record carries an authenticated write-output
   origin/branch and selects from **already captured** configuration. Share owned
   configuration/catalog, normalized policy and captured actor, but no input facts
   or document stages. Preserve initiating operation, access tuple, provenance,
   execution family, query intent, and the existing publication. Do not rerun
   arbitrary capture callbacks or create a second publication owner.
4. Derive the output child before output plan/populate preparation in those
   workers: `createPlan` / `updatePlan` and `genExecutionPopulate` must retain the
   output authorization, not an isolated input authorization later relabeled in
   place. Preparing the plan early is not lending storage: admit output stages
   only after lifecycle processing. Input lookups, `resolveInputDocumentGrants`,
   `requestInputFields`, admission and persistence continue using the original
   execution/state. Prepared query tokens remain bound to that exact execution;
   **do not dispatch an existing query token with the output child**.
5. Extend authenticated embedded/related derivation, not general tuple matching.
   Embedded children retain phase/mode. A bound related edge under a query-output
   or write-output owner may select target READ/LIST mode when all four effective
   target accesses agree. For write-origin populate, ignore initiating operation
   **only for this edge's mode selection**, never for hooks/guards/diagnostics.
   Preserve a private write-output provenance bit/branch on descendants even when
   their mode selector becomes READ/LIST; it triggers mandatory detachment.
   Parent-without-output-origin, count, and custom accesses remain ineligible.

Retain existing READ/LIST origin/retry rules separately from the write origin.
`deriveServiceExecution`'s retry path is not a write-output issuer. Merely extending
`queryOutputAccess` to accept `operation: 'upsert'` would remove this distinction.
Do not shallow-rebind an already branded output plan's authorization; plan against
the real output child so stage/static-field/embedded-plan owners still agree.

## Mandatory source boundary and actual omitted work

The **first guaranteed** write-output ownership boundary belongs in
`document-stage.ts: prepareQueryOutputSource`, reached by `admitOutputRows` and
related finalization, authenticated by the private output origin above. Keep it
after existing populate/private-dependency orchestration and before output hooks.
`prepareDetachedOutputRows` may detach earlier, but its name/result is not proof.

| Input to a write-origin output stage                                              | Required preparation before callbacks                                                                                                                                                                                                                                                                                                            |
| --------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Real hydrated `Document`, successful conversion                                   | Keep canonical `toObject({ virtuals: false, flattenMaps: true })`, outside router work accounting as today. Always pass its result through bounded `copyDocumentView` / `materializeTrustedOutputValue`, even when conversion returned an ordinary object. A transform may return `_doc`, shared payload/native storage, or another live object. |
| Hydrated conversion at this mandatory boundary throws                             | **Fail closed with a controlled authorization/output error. No `_doc` fallback at this boundary.** Do not retry conversion, switch to general trusted query behavior, silently continue, save, or re-fetch. Existing lifecycle snapshot conversion may fail even earlier; preserve its ordering.                                                 |
| Plain adapter row or result of dependency/populate orchestration                  | Always use the same bounded materializer. Do not treat `isolateDocForOutput`, `deepIsolateValue`, `requiresCapture`, an ordinary prototype, or adapter promises as a detachment certificate.                                                                                                                                                     |
| Supported Date, Buffer, RegExp, Map and BSON values                               | Use the existing native-aware materializer; native methods/normalization returns are admitted and mutable storage is copied. Map normalization to ordinary data retains existing materializer semantics. No JSON/structuredClone/unchecked leaf passthrough.                                                                                     |
| Proxy, accessor, exotic/custom object, cycle or unsupported nested hydrated value | Reject through existing bounded admission without lending it; no compatibility fallback returning the original. Do not invent broader adapter/persistence support in this task.                                                                                                                                                                  |
| Exact source already prepared under the same authenticated call/publication       | Reuse the existing private source registry; no duplicate boundary on `prepareIncludeOutput` reentry. This is not a certificate attached to raw input or a cross-call/source-identity validation cache.                                                                                                                                           |
| Genuine embedded occurrence                                                       | Use existing owning-stage handoff; do not repeat the whole-source detachment at every embedded scope.                                                                                                                                                                                                                                            |

If an earlier existing dependency helper used its own conversion fallback, its
plain result is still an untrusted candidate: mandatory materialization, not that
fallback, establishes ownership. This does not authorize changing earlier helper
or lifecycle contracts. Plain-row admission also does not waive existing
`assertModelDocument` requirements for write lifecycle adapters.

After normalization, require an ordinary admitted root, as for current isolated
output. Keep this **one mandatory source materialization in both write modes**:
for isolated it replaces/retains the engine's existing owned-source preparation;
do not add an extra blanket clone before it. For trusted, the stage can mark its
ordinary detached source borrowable for hook exposure (`borrowed` currently
controls that exposure). In `resolveDocumentStage`, omit the subsequent
`copyDocumentView(record.source)` and pass the owned source itself. The existing
source registry prevents a second copy on include preparation.

Thus, for an ordinary dependency-free row with a real document-permission hook,
the intended deterministic distinction is **one source copy plus one hook-view
copy in isolated; one mandatory source copy and no hook-view copy in trusted**.
There is no promise of a source-copy saving on this simplest write path. Without
an exposed document hook there may be no copy saving. Do not remove the mandatory
copy to manufacture a faster label, or add redundant isolated copies merely to
produce a larger delta. Private-dependency preparation can have other existing
copies; optimizing those is not a prerequisite or an unmeasured performance claim.

This boundary must also apply to write-origin related stage inputs, regardless of
their READ/LIST mode selector. A trusted related hook cannot borrow a live write
target or an isolated parent's subtree. For authenticated **write-output targets**,
absorb the existing isolated-parent / trusted-target pre-copy in
`finalizeSinglePopulateTarget` into this mandatory target admission: pass the target
candidate to the finalizer, which acquires its own source before the hook. Do not
perform both copies. Keep the existing pre-copy unchanged for query-origin targets.
Test equivalent parent isolation and private identity/cache behavior before
removing that redundant write-path pre-copy. Output mutation of already-detached
sources is permitted; callbacks must not receive live documents, `_doc`, payloads,
or lifecycle snapshots through this lending boundary.

## Target identity, private inputs, budgets and lifetime

- Keep raw ref capture **before normalization** in the existing virtual-populate
  path. Do not move the new boundary ahead of `captureVirtualPopulateRows`: a
  `toObject` transform is not relationship/ref authority. Preserve hidden declared
  dependencies and the existing public hook-input mask versus argument-four inputs.
- Register normalized source/original mappings in the existing stage preparation:
  `originals` supports root/private-row lookup; `captureReferenceOrigins` and
  `referenceOriginals` retain exact fetched target identity across copies, including
  scalar/array/dotted refs. Preserve virtual-populate public identity composition.
  Never finalize, expose, or infer grants from those original objects or IDs.
- Keep `populateOutputCache` keyed by captured target meta and actual private
  identity, with one logical target finalization/hook per plan. Copies may break
  object sharing in the source graph while retaining this data-free cache key.
  Different models/policies/stages and equal IDs cannot share facts. Shared
  completed target output still gets an independent copy for every attachment.
- Retain `registerPopulateRecipients` **before target callbacks and selected target
  construction**. Receiving budgets include repeated occurrences, array depth and
  depleted parent budgets; never grant a fresh selected-output allowance to a
  related target or cache hit. Mandatory source/native detachment is bounded source
  preparation under the existing publication-aware preparation budget, not a claim
  to eliminate native work before selected construction. Keep output construction
  debiting and returned/native/getter staging unchanged. Writes need full owned
  source preparation even when a READ/LIST trusted stage would skip an unselected
  source graph; do not promise universal cost/acceptance equivalence.
- Reuse current publication failure, drain, tombstone and resource cleanup. New
  output calls/stages/mappings must share the write publication, fail atomically as
  output, and release references. The stored write is **not transactional with
  output authorization**: an output error may occur after persistence succeeded.
- Immutable captured actors, normalized policy and normalized/frozen Boolean facts
  remain owned. Getter sibling views, getter returns, finalized DTO construction,
  private virtual inputs and metadata are not relaxed. No implicit READ, automatic
  save, retry-write, rollback, external freshness, or callback sandbox is added.

## Inspected source index

All line ranges describe `c68451e`; symbols are the durable lookup keys.

| Source                                                                                                            | Inspected symbols / design evidence                                                                                                                                                                                                                                                                                                               |
| ----------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| [service-authorization.ts](../../../../packages/access-router/src/acl/service-authorization.ts)                   | `CallRecord` 157–175; `queryOutputAccess`, `deriveQueryAuthorization`, `modeFor`, `resolveServiceAuthorization` 486–639: only query origins select modes; related edges bind model/scope/policy; embedded inherits; source mode alone is not phase.                                                                                               |
| [service-execution.ts](../../../../packages/access-router/src/acl/service-execution.ts)                           | `createServiceExecution` 166–215, `readServiceExecution` 259–267, `deriveServiceExecution` 295–355: WeakMap receiver ownership, pre-await capture, publication/family and retry derivation.                                                                                                                                                       |
| [prepared-query.ts](../../../../packages/access-router/src/acl/prepared-query.ts)                                 | `readPreparedModelQuery` 131–140; `executePreparedUpdateOne` / `executeCreate` 244–278: exact execution query binding, canonical dispatch and output publication.                                                                                                                                                                                 |
| [service.ts](../../../../packages/access-router/src/services/service.ts)                                          | `prepareDetachedOutputRows` 481–503 returns originals without capture; `admitOutputRows` 524–545; `genExecutionPopulate` 876–971 retains initiating operation; `populateTargetIdentity`, `finalizeSinglePopulateTarget`, recipient registration 996–1156; `createPrepared` 2207–2420; `updateOnePrepared` 2558–2738; internal `upsert` 2790–2889. |
| [public-service.ts](../../../../packages/access-router/src/services/public-service.ts)                            | `_create` 250–287, `_update` 549–596, `_upsert` 598–726: public wrappers and distinct UPSERT branch/gate behavior.                                                                                                                                                                                                                                |
| [document-stage.ts](../../../../packages/access-router/src/acl/document-stage.ts)                                 | `admitDocumentStage` 123–191; embedded handoff 193–204; `resolveDocumentStage` 269–317 omits view only for borrowed source; source/original maps and `prepareQueryOutputSource` 449–562 show unchecked trusted conversion/`_doc` fallback unsuitable for write output.                                                                            |
| [model-input-admission.ts](../../../../packages/access-router/src/acl/model-input-admission.ts)                   | `requestInputFields` 334–360, `resolveInputDocumentGrants` 362–402: separate facts stage but hook explicitly receives hydrated `args.doc`.                                                                                                                                                                                                        |
| [model-output-planning.ts](../../../../packages/access-router/src/acl/model-output-planning.ts)                   | `captureModelAuthorizationConfiguration` 68–128: mode primitives captured before schema/native callbacks; extend to four primitives without changing input hook/dependency lookup.                                                                                                                                                                |
| [related-execution.ts](../../../../packages/access-router/src/acl/related-execution.ts)                           | `captureRelatedTargets` 50–132, `createRelatedExecution` 143–174: pre-await target configuration, model identity and target policy ownership.                                                                                                                                                                                                     |
| [base.ts](../../../../packages/access-router/src/services/base.ts)                                                | `getAuthorizedTargetService`, `relatedExecution` 802–880: include uses its existing own operation tuple, unlike mutation-origin populate diagnostics.                                                                                                                                                                                             |
| [virtual-populate-execution.ts](../../../../packages/access-router/src/acl/virtual-populate-execution.ts)         | `captureVirtualPopulateRows` 263–357 captures exact refs then uses legacy isolation; public-row/identity APIs 562–625; `loadVirtualPopulateOutputRows` 659–716 masks public/private lanes and adapter targets.                                                                                                                                    |
| [trusted-output-materialization.ts](../../../../packages/access-router/src/acl/trusted-output-materialization.ts) | Root-only `isBorrowableAuthorizationRecord` 19–32 is not deep ownership; receiving budgets 68–143; `materializeTrustedOutputValue` 688–817 normalizes/copies supported natives and rejects unsupported graphs.                                                                                                                                    |
| [helpers/document.ts](../../../../packages/access-router/src/helpers/document.ts)                                 | `deepIsolateValue` 148–212 passes non-plain unsupported objects through; `isolateDocForOutput` 222–236 also falls back to `_doc`. Neither issues the required ownership certificate.                                                                                                                                                              |
| [include-output.ts](../../../../packages/access-router/src/output/include-output.ts)                              | `prepareIncludeOutput` 25–49 reuses stage source preparation; attachment/restore 57–87 preserve per-parent copies.                                                                                                                                                                                                                                |
| [output-field-filter.ts](../../../../packages/access-router/src/acl/output-field-filter.ts)                       | `prepareOutputDocumentStage` 105–149 resolves owning facts or the captured hook; `authorizeEmbeddedOutputPlan` 253–291 authenticates actual embedded planning.                                                                                                                                                                                    |
| [finalize-model-output.ts](../../../../packages/access-router/src/output/finalize-model-output.ts)                | `finalizeSingleDoc` 176–466: stage/plan agreement, embedded ownership, independent getter views and selected return/DTO staging remain shared by both modes.                                                                                                                                                                                      |
| [output-publication.ts](../../../../packages/access-router/src/acl/output-publication.ts)                         | `bindOutputPublication`, row budgets, failure/drain/cleanup 62–166: no new lifetime or fresh receiving budget.                                                                                                                                                                                                                                    |

## Executed bounded probes and verification

Working tree source stayed at `c68451e`. Node `v26.12.1`, pnpm `11.18.0`;
installed Vitest reported `4.1.11`. Existing installed dependencies/build artifacts
were used; no install/build was performed. Commands below were actually run from
repository root unless a working directory is specified. Shell `&&` only joined
dependent checks, not concurrent builds.

1. `git status --short && git rev-parse --short HEAD`: only the task untracked;
   HEAD `c68451e`.
2. `node --version && pnpm --version`: versions above.
3. `mkdir packages/access-router/_tmp-oam01-design-20261103-172737 && git check-ignore packages/access-router/_tmp-oam01-design-20261103-172737`:
   fresh scratch directory confirmed ignored.
4. In `packages/access-router`:
   `TMPDIR="$PWD/_tmp-oam01-design-20261103-172737" pnpm exec vitest run --config _tmp-oam01-design-20261103-172737/vitest.config.ts`:
   **1 file, 8 tests passed**. Scratch config used Node, no global setup or database,
   serial file execution, and only its probe file. A non-fatal Vite warning concerned
   ESM syntax in a CommonJS-loaded scratch config; it did not affect execution.
5. Continuation verification created a second fresh ignored directory with
   `mkdir packages/access-router/_tmp-oam01-verification-20261103-172737 && git check-ignore packages/access-router/_tmp-oam01-verification-20261103-172737`.
   Read the actual probe/config files; strengthened ObjectId storage-mutation
   assertions, then reran from `packages/access-router`:

   ```sh
   TMPDIR="$PWD/_tmp-oam01-verification-20261103-172737" pnpm exec vitest run --config _tmp-oam01-design-20261103-172737/vitest.config.ts --reporter=verbose --reporter=json --outputFile.json=_tmp-oam01-verification-20261103-172737/probe-results.json > _tmp-oam01-verification-20261103-172737/probe-run.log 2>&1
   ```

   Result: **1 file, 8 tests passed again**, zero failures. Inspected fresh verbose
   log and JSON assertions, not just this note. Same non-fatal scratch-config warning.
   Both scratch trees are disposable historical work, not continuation prerequisites;
   raw reports contain local paths and are deliberately not copied into this bundle.

Curated observations (existing engine behavior, **not new write-mode tests**):

| Probe                                                                                                         | Observed result                                                                                                                                                           |
| ------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Hydrated query input with throwing `toObject`, existing trusted READ call                                     | `prepared.source === doc._doc`, `borrowed === true`; mutating its Date changed live storage. Demonstrates why the general query path cannot simply become write-eligible. |
| Successful custom `toObject` returning `_doc`, trusted READ                                                   | Still borrows `_doc`; mutating Buffer storage changed the document. Success/ordinary shape is not proof of detachment.                                                    |
| Materialize ordinary candidate with nested Date/Buffer/RegExp/ObjectId/Binary/Decimal128/Code/DBRef/Map/array | Copies had distinct identities; exercised native/container mutations left originals unchanged; ObjectId equality and Decimal128 value were retained.                      |
| BSON `toBSON` returns an external ordinary object with nested storage                                         | Materialized result and nested object were distinct; mutating returned storage left the external object unchanged. This does not sandbox the method's own body.           |
| Legacy isolation of a custom class; accessor/proxy inputs                                                     | Legacy isolation retained the class instance; bounded materialization rejected it, rejected proxy/accessor graphs, and did not invoke the accessor.                       |
| Isolated source with two occurrences of the same populated target                                             | Occurrence copies differed from raw target and each other; both `getQueryReferenceOriginal` values identified the same original; root original mapping remained intact.   |
| Isolated hook view on a separately detached candidate                                                         | Hook view differed from stage source; Date mutation did not affect stage source or original live input.                                                                   |
| Trusted hook view on a separately detached candidate                                                          | Hook view equaled stage source; mutation changed that source, not the original live input. Confirms a meaningful existing view-copy omission can be reused.               |

These observations resolve the conversion/aliasing feasibility question without
changing runtime code. Failure of new write-phase conversion is a selected
fail-closed design, not a behavior claimed to be implemented or probed here.

Document verification from repository root:

- `node packages/access-router/_tmp-oam01-verification-20261103-172737/verify-design.mjs`:
  passed; **27 relative links** resolve; four approved names; targeted local-path,
  private-session-ID and credential-pattern scan; LF/final newline/no trailing
  whitespace; artifact not ignored; both scratch directories ignored. Also checked
  the actual JSON/verbose evidence and source assertions, unchanged HEAD/tracked
  files, and only the coordinator task plus this design untracked. Manual content
  review found no private identifiers or local paths; this is not a general secret
  scanner certification. Disposable validator code is not archived.
- `pnpm exec prettier --check docs/task-artifacts/access-router/oam-20261103-172737-design/README.md`:
  initial check failed on Markdown table layout; formatter output was generated to
  scratch and applied using patch. Final check passed.
- `git diff --check`: passed for tracked files.
  `git diff --no-index --check -- /dev/null docs/task-artifacts/access-router/oam-20261103-172737-design/README.md`:
  no whitespace diagnostics; exit 1 denotes the untracked file's added content.
  Independent validator also checks the complete untracked file's whitespace.

No package test suite, MongoDB integration, typecheck, packed-consumer check, full
build/lint/test, or timing run was performed; those remain OAM-02–05 gates.

## Next-agent handoff and targeted regressions

**OAM-02:** extend strict configuration, capture, defaults/inheritance, exact-key
readers, four-operation warnings and decorator preflight as assigned. Keep all
write/input modes isolated until OAM-03 implements the private phase; adding a
configuration primitive must not activate a general write source mode. Preserve
the original READ/LIST API and business-field/control namespace distinction.

**OAM-03:** implement output-child origin selection plus mandatory admission in the
existing stage engine. Keep tests with the runtime change in normal test locations;
do not ship the scratch probe. Required evidence should include:

1. **Actual omission and aliasing:** on ordinary CREATE/UPDATE rows, spy/count only
   whole-source/hook-view materializations and observe identities/mutation. Require
   mandatory detachment in both modes, isolated disposable view versus trusted
   exact stage source, and no live document/`_doc`/payload/prepared-input/snapshot
   or native alias. Include custom successful conversion returning live storage,
   conversion failure at output only, plain-adapter admission, exotic/accessor/proxy
   rejection, native normalization returns, and per-row bulk facts.
2. **Input and branch invariance:** all four settings trusted must leave hydrated
   pre-write UPDATE hook input, request fields, input grants and write outcome
   unchanged. Resolve fresh post-write facts on the same captured update descriptor;
   CREATE has its own output descriptor only. Exercise internal UPSERT found/miss,
   public UPSERT with/without ID, denied lookup and allowed ID miss; assert initiating
   `upsert`, branch tuple, selections/dependencies, operation guards and query/save
   counts. Reconfigure modes/hooks/target settings during awaits and require old-call
   capture plus independent fresh nested READ/LIST capture.
3. **Ownership matrix:** scalar/array/dotted populate, genuine embedded inheritance,
   private populated dependencies, selected virtuals and getters, every parent/target
   isolated/trusted combination, target READ versus LIST versus custom access, shared
   target across roots/repeated array occurrences, and equal IDs/different policies.
   Assert isolated-parent source/native values cannot be changed by a trusted target;
   target denial/trimming, one logical cached target resolution, occurrence copies,
   private argument-four isolation and target-before-parent-getter ordering persist.
4. **Negative and failure boundaries:** raw helpers, NEW, dedicated child reads/writes,
   DELETE/COUNT/DISTINCT/custom origins remain excluded. Generic tuple construction
   cannot issue a write-output origin; mismatched receiver/scope/branch/stage rejects.
   Failures poison/drain the shared publication without exposing partial data or
   automatic saves/re-fetches. Verify stored write may remain after output failure.
5. **Budgets/cost:** keep depth/slot/native and depleted receiving-budget tests,
   preregistered occurrence plans, cancellation/await failures, and no hidden DTO
   authority. Identify omitted view work deterministically; no throughput claim is
   justified by these probes.

Starting maintained suites to retain/extend (not executed in this investigation):

- [authorization-fast-path-options.integration.test.ts](../../../../packages/access-router/test/authorization-fast-path-options.integration.test.ts),
  especially 365–387 and 437–462: retain READ/LIST independence and isolated input
  assertions; split out the intentional new related/write-output eligibility rather
  than deleting protection coverage.
- [document-permissions-dependencies.integration.test.ts](../../../../packages/access-router/test/document-permissions-dependencies.integration.test.ts),
  especially 257–329: captured pre/post-update and create-output definitions/facts.
- [owned-authorization-stage.unit.test.ts](../../../../packages/access-router/test/owned-authorization-stage.unit.test.ts),
  [owned-authorization-publication.unit.test.ts](../../../../packages/access-router/test/owned-authorization-publication.unit.test.ts),
  [owned-authorization-runtime-profiles.unit.test.ts](../../../../packages/access-router/test/owned-authorization-runtime-profiles.unit.test.ts),
  and [authorization-fast-path-native.unit.test.ts](../../../../packages/access-router/test/authorization-fast-path-native.unit.test.ts):
  stage identity, hook-view/copy evidence, mixed target ownership, shared occurrences,
  getter/native isolation and receiving budgets.

Follow task V1 prerequisites and serialize all builds/tests. OAM-04 owns installed
guidance/consumers/tooling; OAM-05 must reconcile delivered implementation against
this design and all acceptance criteria. If an adapter cannot cross the selected
boundary, reject safely; broader normalization support needs a concrete follow-up,
not live-storage borrowing or silent relaxation.
