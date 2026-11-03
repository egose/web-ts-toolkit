> Historical document preserved from ignored task scratch storage.
> Scope and limitations: `docs/task-artifacts/access-router/README.md`. References to omitted
> artifacts are historical, not available execution prerequisites.

# FUSE-01 seam disposition and implementation handoff

Investigation only at HEAD `46d85e87743b49f5891d5844233f5b7bdf6d31f0`.
No runtime/configuration, committed test, shared task, dependency or release edits.
The coordinator owns task status/evidence reconciliation.

## Disposition

There is a concrete private **root service publication tail**, not a general
finalizer or child-call bypass. Implement a small prototype there, then measure
before broadening it. The newly authorized loss of private normalization
observations removes the previous phase's contract blocker. It does not prove
that arbitrary finalizer output, child output, bindings or assembly are eligible.

Keep the mandatory contract unchanged: independent default-false
`unsafeFuseListOutputPublication` / `unsafeFuseReadOutputPublication`, literal
server `true` only, active only with all FOUR corresponding existing options
effective `true`. Capture at the initiating query; inherit only authenticated
related/embedded/retry edges. READ-to-list remains READ-origin. A descendant's
current document-check boolean alone is insufficient: it can reflect the nested
option while the initiating top-level document option is still strict.

Store only captured mode in private call/execution records; no public plan bit,
DTO marker, certificate, issuer, traversal-argument field or application callback
selects fusion. Applicability and concrete seam eligibility are different facts.

FUSE-02 should add a distinct fusion option/warning group, leaving historical six-
comparison and two-copy ON meanings unchanged. Coherent activation/dormancy warnings
must observe all four prerequisites and default inheritance after publication;
throwing loggers must not undo it. Public/defaults/service/policy/include/populate/
subquery controls reject the names by presence; business-data names remain inert.
Update public-admission's server-only diagnostic classification for `unsafeFuse`
as well as `unsafeSkip`. Ship only the two intended model option types later;
no internal wrapper/helper goes through `src/index.ts`, `src/advanced.ts`,
`src/processors.ts` or package.json exports.

## Current operations and no-escape boundary

References are package-relative below (`packages/access-router/`).

| Site | Current work | Proposed first-prototype disposition |
| --- | --- | --- |
| `src/services/service.ts:468-518` (`finalizeDirectOutput`) | Source isolation; populated child-copy transfers; private FK cleanup; one document stage/grant resolution; detached diagnostic grants; finalizer with package-owned `onFinalized` | Retain all of this source/stage/grant work. Replace only the package-owned final publication handoff. |
| `src/output/finalize-model-output.ts:433-487` (`finalizeSingleDoc`) | Separate output source normalization, child transfer, detached base/scope context, projected/stage resolution, metadata-source copy, detached grants | Retain, including the metadata-source copy in the smallest first prototype. Do not speculate about early graph eligibility across the later hooks/awaits. |
| `finalizeSingleDoc:489-658` | Independent embedded/related child calls and stages; owning grants for embedded, own grants for referenced models; associations before parent getters | Retain. No child-call cache, no borrowed application child DTO. |
| `finalizeSingleDoc:660-840` | Stable getter view before permission callbacks; independent getter/grant/context/private-input copies; candidate callback order/short-circuiting; staged return isolation; selected value/reference copying and trim | Retain every permission callback and detached input/return boundary. |
| `finalizeSingleDoc:841-868` | Metadata option copy and retention, root association, optional `onFinalized` context creation | Initially retain metadata retention/options. Omit only the eligible service root's intermediate association/context and package capture callback. Standalone publication remains original. |
| `service.ts:519-554` | Whole finalized-root `deepIsolateValue`, generated alias removal, produced include copies/origins, permission metadata reconstruction, full root/descendant transfer | Omit the eligible private whole-root copy and duplicate root transfer/publication. **Retain final descendant authorization validation**, rather than removing this transfer wholesale. Keep assembly/copy-origin behavior or conservatively fall back. |
| `service.ts:555-564` | Final output context on the final graph | Retain exact owner/access/stage checks, final bounded graph admission and final context. |

The intermediate **root** context is captured only by the service's package
closure; no application decorator/handle reader receives it before the service
finishes. Direct list decorators run at `service.ts:1890`, after final publication.
Public list/read decorators run in `public-service.ts:196-198,379-381,490-492`.

### Children: association work is necessary; an extra child context is not present

`finalizeSingleDoc` clears `onFinalized` in both `childBase` (line 528) and
`relatedBase` (line 611). Optional-call argument evaluation at lines 859-868 means
`createServiceOutputContext` is **not** called for those recursive children.
Their scope/hook/getter contexts and grant copies still exist and must remain.

Their associations at line 858 must also remain. They are needed by
`copyAuthorizedReference`, later graph-copy transfers, final root-context child
handle readers, and descendant helper decisions. Parent getters receive detached
views, not the actual associated child objects; the fixture confirms both facts.

Do not silently lose late child validation: the current final transfer authenticates
every retained associated descendant after earlier native/getter work. Reusing a
child object instead of copying it does not establish that its association is
still valid. Preserve those checks without refreshing a stale association.

## Smallest private architecture

1. **`Service.finalizeDirectOutput` and query callers:** accept/authenticate the
   existing private `ServiceExecutionContext`; check its receiver, call, binding,
   receiving model, root scope and exact pre-resolved document stage. Use the
   FUSE-02 captured origin mode, never reread live runtime options. Writes/templates
   may still pass execution but cannot obtain applicable query mode.
2. **New non-public finalizer wrapper in
   `src/output/finalize-model-output.ts`:** share the existing finalizer body, with
   a separate lexical/private service-completion argument to `finalizeSingleDoc`.
   Do **not** put it in `FinalizeModelOutputArgs`, `InternalFinalizeArgs`, a public
   plan or `parentArgs`; recursive child/related calls never receive it.
   The wrapper authenticates the real execution and uses only a package-owned
   completion closure. Application `onFinalized`/traversal callbacks keep the
   original after-association contract.
3. Start with a synchronous, no-escape root tail: captured
   `stripPermissionsField === true`, primitive top-level permission-field name
   (default `_permissions`), no produced include attachments, no traversal hooks,
   ordinary binding, fresh unassociated root, and a graph admitted by the existing
   bounded clone-free operation. This covers the three primary workloads, including
   embedded arrays. It does not require a generic graph cache/certificate.
4. **`src/acl/document-authorization.ts`:** factor a narrowly private
   try-publish/try-associate-and-context operation from existing association
   internals. Authenticate handle/call/stage/access/binding, verify retained child
   associations/provenance, and run current bounded structural admission plus
   exact final root/descendant identities immediately before storing the root's
   association. Unsupported graphs/bindings return fallback **before any root
   association/publication is changed**; invalid shape/cycle/limits remain controlled
   errors. Existing `outputs.has` protection must not be bypassed/refreshed.
   A straightforward conservative child-validation implementation can retain
   `transferDocumentAuthorizationGraph(child, child)` for root values; it validates
   existing child associations but creates no new copied child owner. A narrower
   validation-only factoring may be worthwhile only if it preserves those checks.
5. Never use an earlier graph walk as a validation certificate across child
   validation, binding/native work, metadata methods or awaits. Reauthenticate and
   re-admit at the actual final association. A preliminary eligibility walk can
   add work; deterministic context/copy reductions do not promise fewer total
   graph walks or a speedup.
6. On eligible success, return the now-associated root with its one final context
   through the package closure. Otherwise execute the original association/context,
   copy/metadata/include/transfer path. Do not return an unpublished DTO to a
   generic finalizer caller, callback or helper.

This first prototype intentionally leaves the early private metadata-source copy
and metadata retention untouched. Removing them later would need its own ordering/
eligibility reasoning; a proof made before child/getter work cannot survive that
work as a mutable certificate.

## Assembly and alternate paths

- **Direct/public/root LIST:** `findPrepared:1880` is the shared service tail;
  `RootRouter.modelOperations.list` delegates to `_list`. Final decoration/tasks
  stay after the final associated result. Root data-service operations are separate.
- **Direct/public/root READ:** `findOnePrepared:1541`, including `findById`, public
  `_read` / `_readFilter` and root read. `deriveServiceExecution` is the retry edge;
  capture/inherit READ mode despite effective list accesses.
- **Related service includes:** `Base.relatedExecution` / `createRelatedExecution`
  carry authenticated origin into target `findPrepared`/`findOnePrepared`. A target's
  own service root can be locally eligible, but its associated result still escapes
  into include assembly; it must be fully published before that escape.
- **Include-bearing parent:** first prototype falls back. `prepareIncludeOutput`
  preserves separate source/original/working views; `restoreIncludeOutput` copies
  produced values and supplies exact root origins. Dotted/root-replacing/repeated
  attachments cannot be recreated from paths, IDs or serialized permissions.
  Extending fusion requires copying any touched associated child/container **before**
  mutation and preserving each exact produced origin. Never refresh a mutated child.
- **Permission metadata:** first prototype falls back when metadata is emitted or
  its field is dotted/open. `unsetDocPath`, `set` and `retainOutputMetadata` can touch
  an already-associated embedded container; custom `exposedDocPermissionKeys.includes`
  can execute application methods. Keep detached method receivers, grant copies,
  `_view`/`_edit` decisions, subset filtering and generated/business alias distinction.
- **Populate:** `finalizeSinglePopulateTarget:996-1074` stays original, including its
  existing identity-bound cache, target finalizer, copied result and transfers.
  It is visible to parent finalization and has no private root-service completion
  handoff. A later parent service root may be eligible, but target copies and final
  child validity/provenance checks remain. Do not expand this existing cache.
- **Standalone finalizers/helpers/traversal callbacks:** original publication even
  if their captured call has an applicable inherited mode. A flag alone is not the
  private service handoff. Open/accessor/proxy bindings, unsupported native/container
  graphs, custom traversals and unproven descendants conservatively fall back.
- **Writes/templates/write-derived reads:** `createPrepared:2122`, `new:2210`,
  `updateOnePrepared:2424`, upsert branches and any write-derived reads stay original.
  Output access `read` alone does not make a write READ-origin.
- **Dedicated subdocuments:** `finalizeSubRowsWithVirtuals` and
  `src/acl/subdocument-output.ts:finalizeSubdocumentRows` keep their original stages,
  child/target finalization, association and ownership. Their initiating operations
  are not top-level LIST/READ query origins.

## Deterministic FUSE-03 regression/risk fixtures

`boundary-fixtures.test.ts` is ignored and uses real Service/PublicService with
stubbed persistence only. Its custom config isolates it from committed tests.

- Before: 1 row has **2 root contexts / 2 initial root admissions / 1 finalized-root
  copy / 1 permission hook / 1 adapter read**. Six-row direct/public LIST has
  **12 / 12 / 6 / 6 / 1**, respectively. Direct/public READ has the one-row counts.
- Required failing-before target: six-row eligible active LIST has **6 root contexts
  and 0 finalized-root copies**, keeping six hooks and one read. These are work-count
  assertions, not latency assertions. The two `it.fails` tests must be promoted to
  ordinary passing regressions when runtime fusion exists; do not amend defaults.
- Embedded boundary: **2 associated children before the parent getter**, one parent
  getter, two root contexts, **zero recursive child ServiceOutputContexts**. Getter
  input is detached; final child handles are visible from the final root context.
- Real-service native-risk fixture: first-row getter returns a canonical Date and
  arms a prototype `getTime` observer. Observation #1 is detached return staging,
  #2 selected virtual-value copying, #3 the service's finalized-root isolation.
  The third observation changes a closure read by the **second real document hook**,
  denying its name. Before: **3 observations, 2 document hooks, 1 getter, 2 name and
  2 virtual row-rule callbacks, second-row name denied**. Fusion should retain #1/#2
  and all actual callbacks but omit #3, allowing that later name. This is the explicit
  denial-to-allowance risk, not an equivalent ordinary fixture or a universal security
  claim. Both rows intentionally share the same ID; concurrency one makes it stable.

Baseline fixture result: **8 passed, 2 expected failing-before tests**. The current
build has no fusion declarations/implementation; unknown new option names in these
fixtures are inert requests, not evidence of activation.

## Verification limits

- V1 passed serially; 902 focused baseline tests in 16 files passed.
- Two 50-sample unchanged-worker jobs per primary scenario passed (see
  `coordinator-notes.md` / `timings/summary.json`). This is a fresh **before** only;
  no fusion benefit has been measured.
- The fixture's first two startup attempts could not resolve Mongoose because
  Vite created a local cache directory before the dependency symlink. Resolved
  only in this ignored fixture directory; final runs passed. No baseline package
  defect inferred. An initial preservation attempt hit Node's builtin `punycode`
  resolution during dependency hashing; `before/` is retained but incomplete.
  Use the completed `before-v1/` and `before-metadata.json`.
- Full package/types/downstream/lint/packed/runner/guard measurements were not run
  in FUSE-01; those are later-task gates. Existing read/list/root boundary tests here
  exercise the original mode, not future active fusion.
- No full security, application-hook equivalence or v0.51.0 parity claim.
