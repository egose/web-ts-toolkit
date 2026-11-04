# Access-router CREATE/UPDATE authorization modes with output-only scope

Created: 2026-11-03 17:27:37 PST (`20261103-172737`, generated with `date`).

Status: blocked. OAM-01–04 and scoped independent code acceptance are complete;
OAM-05 full-root acceptance is blocked by the unchanged OIDC example application's
browser logout fallback assertion (B3). F1/F2 are resolved; affected V2, benchmarks,
root build/lint and independent adversarial checks pass.

## Objective and authorization

Keep `readAuthorizationMode` / `listAuthorizationMode`, add
`createAuthorizationMode` / `updateAuthorizationMode`, and allow CREATE/UPDATE
**post-write output** to opt into trusted source borrowing. The user requested this
task file first and subsequently chose to retain the broader `*AuthorizationMode`
naming so future designs can consider other processing steps. That naming decision
does not expand the relaxation authorized by this task.

The earlier proposal to rename all four settings to `*OutputAuthorizationMode` is
withdrawn. Keep the existing READ/LIST names intentionally, not as compatibility
aliases; do not introduce the proposed output-prefixed spellings, dual-key
resolution, translation, or a second engine. No project currently consumes this
version, and compatibility scaffolding is not required. This document does not
authorize implementation, delegation, commits, publication, dependency changes,
or release administration.

Execution authorization: the user subsequently requested implementation of task
items sequentially by subagents. Run OAM-01–05 one child session at a time, with a
separate final reviewer for OAM-05. The coordinator owns this document, reconciles
each handoff against delivered files/checks, and starts the next task only after
its dependencies pass. No commits, publication, dependency changes or release
administration were requested. Execution starts at `c68451e` with only this new
task file untracked; preserve subsequent unrelated work.

Scope: `packages/access-router`, its decorator configuration integration in
`packages/access-router-deco`, affected maintained fixtures and benchmark tooling,
and shipped/website documentation. No new endpoints or wire options are needed.

Non-goals: relaxing write-input authority, changing persistence/lifecycle semantics,
changing which fields or related rows are authorized, adding DELETE/COUNT/DISTINCT/
NEW/subdocument modes, adding public output capabilities, or a general performance
redesign. Do not rename unrelated APIs or the existing `AuthorizationMode` value
type merely for symmetry; its documentation must describe the new scope.

## Analysis, evidence and limitations

Initial worktree was clean at `c68451e`. Recheck before implementation and preserve
unrelated changes. All `src/` and `test/` references below are relative to
`packages/access-router/`; other paths are repository-relative.

Inspected configuration, public entrypoints/build metadata, execution capture,
document stages, pre-write grants, CREATE/UPDATE/public wrappers, populate target
derivation/finalization, selected mode/mutation/dependency tests, decorator preflight,
benchmark discovery/tests, and task conventions. Findings are API improvements and
design constraints, not newly demonstrated security defects:

- **Current selection:** only READ/LIST executions can select trusted source mode.
  See `src/acl/service-authorization.ts`: `queryOutputAccess`, `modeFor`,
  `resolveServiceAuthorization`, `deriveQueryAuthorization`, and
  `src/acl/service-execution.ts`: `createServiceExecution`. Additional option
  declarations alone cannot enable write-output borrowing.
- **Write responses:** CREATE/UPDATE process selected/populated output without a
  new READ service call. See `src/services/service.ts`: `createPrepared`,
  `updateOnePrepared`, and `src/services/public-service.ts`: `_create`, `_update`,
  `_upsert`. Add output-phase selection, not a synthetic READ or database re-fetch.
- **Shared state:** input and output stages reuse write execution state. See
  `src/acl/model-input-admission.ts`: `resolveInputDocumentGrants`, and
  `src/services/service.ts`: `updateOnePrepared`, `admitOutputRows`. Setting a write
  execution's general source mode to trusted would be insufficiently scoped.
- **Detachment is conditional:** `prepareDetachedOutputRows` returns original rows
  in its no-capture branch, optionally populating them first; hydrated preparation
  tries `toObject`, then falls back to `_doc` on error. See
  `src/services/service.ts:481-502` and `src/acl/document-stage.ts`:
  `prepareQueryOutputSource`. Do not rely on the method name or borrow live write
  storage after a failed conversion.
- **Input-hook caveat:** pre-write UPDATE grants invoke the hook with hydrated
  `args.doc`; the stage separately normalizes facts. See
  `src/acl/model-input-admission.ts:362-401`. Earlier conversational claims that
  every write hook receives detached data were too broad. Preserve this behavior;
  the new options must not claim a sandbox or silently change input-hook contracts.
- **Ownership:** genuine embedded scopes inherit owner preparation; related
  targets have their own captured configuration/policy/facts. Mutation-origin
  populate retains the initiating operation with a separate target access. See
  `src/acl/service-authorization.ts`: `deriveQueryAuthorization`,
  `src/services/service.ts`: `genExecutionPopulate`, `finalizeSinglePopulateTarget`,
  and `src/acl/related-execution.ts`. These distinctions must survive the extension.
- **Existing protection coverage:**
  `test/authorization-fast-path-options.integration.test.ts:365-387,437-462` requires
  write-derived stages to stay isolated under current READ/LIST settings.
  `test/document-permissions-dependencies.integration.test.ts` checks independent
  pre/post-update and create-output facts. Retain READ/LIST independence; add new
  CREATE/UPDATE expectations rather than deleting protection coverage.
- **Other operations:** DELETE returns `doc._id`; COUNT returns scalar output, not
  a document stream. See `src/services/service.ts`: `delete`, `count`, and
  `src/services/public-service.ts`: `_delete`, `_count`. Neither needs a new mode.

Related completed work, not implementation prerequisites to reopen:

- [Owned authorization redesign](20261031-153020-access-router-owned-authorization-redesign.md):
  retain its READ/LIST names. This task supersedes its restriction against trusted
  write-derived output, not its actor/policy/facts/publication guarantees.
- [Document-permission dependencies](20261103-003636-access-router-document-permission-dependencies.md):
  preserve captured hook/dependency pairing and independent pre/post-write facts.
- [Nested operation access](20261103-082614-access-router-nested-operation-access.md):
  preserve context-specific entry guards and context-free secondary target checks.

No existing task delivering this four-operation mode API was found in focused
backlog searches. Do not rewrite completed task files or sealed task artifacts.
The entire test graph and all native/adapter aliasing cases have not been audited.
No runtime tests, build, typecheck, packed-consumer check or timings were run to
create this plan; planned checks below are not baseline pass claims.

## Target contract

### Names, values and configuration

Exactly four independent server model/default-model settings:

```ts
readAuthorizationMode?: AuthorizationMode;
listAuthorizationMode?: AuthorizationMode;
createAuthorizationMode?: AuthorizationMode;
updateAuthorizationMode?: AuthorizationMode;
// AuthorizationMode = 'isolated' | 'trusted'
```

Use `*AuthorizationMode` consistently. This change relaxes CREATE/UPDATE output
source isolation only; future input/other-step relaxations require their own
explicit contract, safety review and tests, not an inference from these broader names.

All default to `'isolated'`. Accept only literal enum strings; `undefined` restores
live default inheritance. They are enum options, not boolean permission switches.
Preserve atomic bulk configuration, runtime separation, pre-await capture, and
non-fatal warnings once per effective owner/operation transition into trusted.

Only server model/default-model configuration may select a mode. Reject controls
in global/data options, per-call options/policies, method-default buckets, raw
helpers, HTTP/root envelopes, and include/populate/subquery control namespaces.
Admission is presence-based, including false/undefined/inherited/non-enumerable
or dotted controls where currently applicable; do not invoke getters/proxy traps
to validate controls. Same-spelled persisted fields and permission strings remain
business data, not configuration. Retired unsafe switches must stay retired;
existing READ/LIST mode names are not retired.

### Operation and phase selection

- **Root READ output** (`findOne`, `findById`, public read wrappers):
  `readAuthorizationMode`; retain current eligibility and READ-to-LIST retry semantics.
- **Root LIST output** (`find`, public list wrapper): `listAuthorizationMode`.
- **Root CREATE output**, including bulk creation: `createAuthorizationMode`, only
  after persistence/lifecycle processing. Each row has independent stages/facts.
- **Root UPDATE output** (`updateOne`, `updateById`, public update wrapper):
  `updateAuthorizationMode`, only after persistence/lifecycle processing.
- **UPSERT output:** choose CREATE or UPDATE mode according to the executed branch;
  retain initiating `operation: 'upsert'` and branch-specific accesses. No fifth option.
- **Write-input admission**, pre-write grants, validation, preparation, transform/
  save/lifecycle hooks: unaffected by these options; preserve existing authority.
- **DELETE/COUNT/DISTINCT/NEW**, raw field/output helpers, dedicated subdocument
  operations and unsupported custom origins: no newly enabled trusted stage;
  preserve existing behavior, including isolated helper/dedicated stages.
- **Separate READ/LIST service calls inside a hook:** fresh independent capture of
  mode, actor and policy, never inherited write-output authority.

Capture the effective settings before application hooks or awaits, even though
write-output borrowing starts later. Once an UPSERT branch is known, select from
those captured settings and retain that branch; do not re-read live configuration
after saving. Changing a mode affects new calls only. A response using read-field
permissions is not a READ origin. Changing an output mode must not change
`docPermissionsAccess`, hook/dependency resolution, row policy, or the initiating
operation to make selection convenient.

### What can and cannot be relaxed

- **Isolated:** preserve bounded owned source preparation and disposable document-
  permission hook views. Mutating the supplied document view does not edit the
  stage's owned source values.
- **Trusted:** may borrow an admitted ordinary output source/document-hook input;
  hook mutations can affect response values and facts calculated from that source.
  Getter views, return staging, private virtual argument-four data, immutable actor/
  policy/boolean facts, target admission, and selected/native traversal budgets remain
  protected. It is not permission bypass, arbitrary callback isolation, external
  freshness, or universal security/performance equivalence.
- **Write-output boundary:** create a safely detached ordinary post-write source
  before lending it to output callbacks. Trusted may omit subsequent source/view
  copies, but must not borrow the live hydrated write document, its `_doc`, mutation
  payload, lifecycle snapshots, or mutable native leaves shared with those inputs.
  Use the existing normalization/materialization engine; do not clone indiscriminately
  at every layer or invent a parallel engine. OAM-01 must establish actual alias and
  cost boundaries, including failed `toObject` and nonstandard adapter inputs.
- Output callbacks must not cause additional automatic saves or re-fetches. Output
  authorization failure after a successful write remains nontransactional: the
  stored write may already exist. This is not a promise to prevent trusted callback
  closures from independently using external state or explicitly writing again.

### Embedded and related output ownership

Accepted OAM-01 ownership decision (see the linked design and probe evidence below):

1. Genuine embedded response scopes inherit their owning output mode and facts;
   dedicated subdocument service origins remain outside this extension.
2. Actual populated/related targets resolve their **own model's** READ/LIST output
   mode at the effective target data access. Parent CREATE/UPDATE mode controls the
   parent's output stage, never overrides a target's isolated setting, and does not
   turn a related read into target CREATE/UPDATE authority.
3. Extending this rule to write-origin populate is an intentional new eligibility
   change: target READ/LIST settings may then affect those target stages, but never
   the owning write/input stage. Keep the parent's initiating operation diagnostic.
   Unsupported custom target accesses and count attachments have no trusted mode.
4. An isolated parent must retain its source boundary even when a related target is
   trusted. Preserve independent target policy/facts, snapshot timing, per-occurrence
   copies/budgets and shared-target cache behavior. No cross-model grant reuse.

The initial bounded design gate is resolved by OAM-01: use a private authenticated
output child execution; always materialize a detached write-output source, then
allow trusted to omit the separate disposable document-hook view. Apply mandatory
detachment to write-origin targets too, absorbing their redundant parent/target
pre-copy while leaving query-origin behavior unchanged. Reject conversion failure
at this boundary rather than lending `_doc`. These are accepted implementation
requirements, not claims that unimplemented runtime behavior already passes.

## Executable tasks

Priorities: P1 = required API/authorization boundary or release gate; P2 = dependent
consumer/tooling integration required before completion. Statuses are maintained below.
Sequence them: shared runtime/type/stage files and generated `dist` outputs overlap.
Sequential subagent execution is now authorized by the user's follow-up request.

### Task OAM-01: Establish output-phase selection and safe write-source ownership

Status: completed

Assigned: DESIGN-01 investigation subagent (separate session; coordinator owns task status).

Kind: investigation

Priority: P1 — prevents extending a source mode into input authorization or live write storage.

Dependencies: none

Primary ownership: the target-contract section above; focused inspection/probes of
`src/acl/service-authorization.ts`, `service-execution.ts`, `document-stage.ts`,
`model-input-admission.ts`, and `src/services/service.ts`/`public-service.ts`.

Finding: phase and operation currently share execution state, while detachment and
related-target eligibility depend on the actual path; see the inspected evidence above.

Requirements:

1. Trace and record a compact selection/ownership matrix for READ/LIST, CREATE,
   UPDATE, both public/internal UPSERT branches, embedded scopes, populate targets,
   helper/dedicated origins and independent nested calls. Finalize the target rule.
2. Specify the smallest private mechanism that authenticates an output phase while
   keeping pre-write state unchanged. Do not infer eligibility solely from
   `outputAccess: 'read'`, a public option, or a caller-constructed access tuple.
3. Identify where the first mandatory write/output detachment occurs and which
   redundant copy/view trusted can actually omit. Cover hydrated conversion,
   `_doc` fallback, populated target identity, native leaves and plain adapter rows.
4. Document the retained guarantees, aliasing probes/tests needed, and any blocked
   case. No general hook sandbox or unmeasured speedup claim. Do not approve an inert
   trusted setting that cannot safely borrow a meaningful output source/view.

Acceptance criteria:

- The matrix and implementation boundary are recorded in this file or a linked
  durable design note, with source/probe evidence and no unresolved ownership rule.
- There is a concrete route to output-only borrowing that cannot change write-input
  admission. If feasibility fails, mark downstream work blocked and request the
  maintainer decision rather than silently weakening the boundary.

Verification: evidence review against the named source paths; run only focused
probes needed to answer aliasing/phase questions, using V1 prerequisites. Record
executed versus unrun checks separately.

Completion evidence (DESIGN-01; coordinator reconciled):

- Preserved [the selected design, matrix and curated probe evidence](../task-artifacts/access-router/oam-20261103-172737-design/README.md).
  Source stayed at `c68451e`; no runtime changes or child-agent delegation occurred.
- The first handoff was interrupted by a usage limit. Resuming the same investigation
  session finalized the design and reran its actual scratch probes: **1 file / 8
  tests passed**, checked against fresh JSON/verbose results by the coordinator.
- Verified phase/input separation, safe materialization feasibility for native/plain/
  hydrated candidates, dangerous `_doc` conversion behavior, meaningful hook-view
  omission, and exact populated-reference identity across detached occurrences.
- Selected private output-child derivation, captured UPSERT branch selection, target-
  own READ/LIST modes and mandatory write-origin detachment. No unresolved design
  blocker remains; implementation must still verify all new behavior.
- Design formatting, 27 relative links, privacy/naming/ignore status and tracked/
  untracked whitespace checks passed. Full package/build/type/packed/performance
  checks were not run at this investigation stage.

### Task OAM-02: Extend strict configuration to CREATE/UPDATE modes

Status: completed

Assigned: IMPLEMENT-02 configuration subagent (new separate session; coordinator owns status).

Kind: improvement

Priority: P1 — establishes the requested four-operation public/runtime contract.

Dependencies: OAM-01

Primary ownership: `src/interfaces/root.ts`, interface/public exports as needed,
`src/acl/authorization-modes.ts`, captured configuration/model-output planning,
`src/runtime.ts`, model/fluent option surfaces, READ/LIST mode resolution, and
`packages/access-router-deco/src/authorization-modes.ts`; focused configuration tests.

Finding: current declarations, validators, default capture, warnings, decorator
preflight and exact-key readers enumerate only READ/LIST settings. The runtime warning
maps every non-READ key to LIST, so merely extending the key array is incorrect.

Requirements:

1. Retain the existing READ/LIST settings and expose CREATE/UPDATE settings through
   server configuration, setters/getters/defaults, fluent APIs and decorator model/
   default configuration. Capture primitive values before application/native
   configuration callbacks. Use exactly the four `*AuthorizationMode` names above.
2. Preserve existing READ/LIST names, defaults, eligibility, retry semantics and
   unrelated authorization behavior. Do not introduce `*OutputAuthorizationMode`
   aliases or restore unsafe switches. No renamed-key migration is needed.
3. Apply the shared control-admission contract to all four keys and retired names,
   including decorator bootstrap preflight before partial publication. Preserve
   business fields and reject malformed/dotted scalar updates atomically.
4. Correct per-operation trusted warnings, default restoration and fresh-call
   capture. Retain logger-failure containment and owning-runtime isolation.

Acceptance criteria:

- Focused configuration/decorator tests cover each key, independent inheritance,
  rejected coercions/accessors/proxies, atomic mixed bulk failure, control placement,
  warnings, retained unsafe-switch rejection and business-field collisions.
- Existing READ/LIST tests still demonstrate real source/view behavior, captured
  modes across awaits and independent reentry. New write options are not selected
  on pre-write stages as a side effect of configuration work.
- Source builds and focused V1 checks pass. No supported READ/LIST key is renamed;
  broader fixture/document coverage follows in OAM-04.

Verification: V1 with mode/admission, capture, READ/LIST retry and decorator tests;
inspect root and `/advanced` emitted declarations for the four options.

Completion evidence (IMPLEMENT-02; coordinator reconciled):

- Changed six runtime/type files and nine maintained test/type fixtures. See the
  [configuration handoff](../task-artifacts/access-router/oam-20261103-172737-config/README.md)
  for exact paths, serial commands and observed intermediate fixture failure/resolution.
- Added CREATE/UPDATE configuration/admission/default capture and operation-specific
  warning mapping in the runtime/decorator surfaces. The coordinator inspected these
  diffs: query-only source eligibility is unchanged; no write-output phase was added.
- Both transitive builds and source typechecks passed. Focused runtime V1 passed
  **12 files / 441 tests**; decorator V1 passed **4 files / 181 tests**. Coordinator
  checked fresh JSON reports: zero failures or pending tests in those selections.
- Focused staged-consumer checks passed **5 runtime + 2 decorator tests**; their
  remaining **44 + 3** cases were intentionally filtered, not full-suite verification.
  Fresh root and `/advanced` declaration conditions expose four optional shared unions.
- Changed-file ESLint/Prettier and handoff link/privacy/ignore/whitespace review passed.
  Full V2 packages/packed consumers/benchmarks and V3 remain for OAM-04–05.

### Task OAM-03: Implement CREATE/UPDATE output-only borrowing and branch propagation

Status: completed

Assigned: IMPLEMENT-03 runtime subagent (new separate session; coordinator owns status).

Reopened after independent REVIEW-05 findings F1/P1 and F2/P2. Resume the original
runtime owner for remediation; preserve pre-review completion evidence below as
historical, not final acceptance. The [independent review](../task-artifacts/access-router/oam-20261103-172737-review/README.md)
contains exact source references and reproductions.

- F1: an absent own `writeOutputBranch` slot in a generic call record can resolve
  through a contaminated process prototype, enabling real target borrowing for an
  ineligible origin. No request-only contamination mechanism or row/field bypass
  was demonstrated. Own all optional provenance/origin slots and do not read
  inherited marker values/accessors; add maintained negative regressions.
- F2: retaining a trusted write hook's detached argument keeps private root/raw-
  target WeakMap links after publication closure. This is deterministic lifetime
  retention, not a public recovery capability or measured heap claim. Release
  root and descendant reference mappings for ordinary write publications as well
  as collection owners; preserve active sibling owners and shared-target identity.
- Required follow-up checks: regression tests fail on reviewed code and pass on
  the fix; success/failure, retained arguments, inherited values/getters, negative
  generic/dedicated origins and overlapping publication ownership are covered.

Kind: improvement

Priority: P1 — implements the feature without weakening the write boundary.

Dependencies: OAM-02

Primary ownership: private authorization/execution/document-stage boundaries,
`src/services/service.ts`, `public-service.ts`, related/populate/embedded planning
and finalization, plus focused write-output regressions.

Finding: CREATE/UPDATE already share the output engine, but currently have no
trusted output eligibility. Input stages and hydrated mutation documents must not
become borrowable just because post-write output has a new setting.

Requirements:

1. Implement OAM-01's authenticated output-phase selection and mandatory post-write
   source boundary. Reuse the same evaluator/finalizer and owned facts. Keep the
   existing pre-write hook arguments, input fields/rows, validation, preparation,
   transform/save, lifecycle snapshots and persistence work unchanged.
2. Carry selection/populate/virtual private dependencies through CREATE (including
   arrays), UPDATE, public wrappers and both internal/public UPSERT branches.
   Retain initiating operation and branch-specific hook/access/dependency semantics.
3. Apply the agreed embedded/related target matrix and per-occurrence budgets.
   Changing parent mode cannot relax a target's captured isolation or authority;
   target borrowing cannot mutate an isolated parent or the live write graph.
4. Preserve new-call-only mode changes, error/publication cleanup, bounded hooks,
   cancellation behavior and separate pre/post-write grant resolution. Do not add
   automatic READ queries, saves or rollback claims to implement response processing.

Acceptance criteria:

- Under pure hooks, both modes retain expected DTOs, field/row/target enforcement,
  virtual/private-input behavior and persisted values on direct service, basic/
  advanced HTTP and root paths. Tests observe actual stage behavior, not just labels.
- Mutation probes distinguish trusted output borrowing from isolated disposable
  views, while supplied output-hook objects/native leaves cannot mutate live write
  documents, payloads or lifecycle snapshots. Test conversion failures and adapter
  fallbacks explicitly; fail/normalize safely rather than borrowing live `_doc`.
- Pre-write UPDATE facts and input admission are unchanged even with all four modes
  trusted; post-write facts are fresh, normalized/frozen and never reused for input.
  CREATE has no invented pre-write document-facts authority.
- Both UPSERT branches, bulk CREATE, selected virtuals, scalar/array/dotted populate,
  mixed parent/target modes, shared targets, await-time reconfiguration and failing
  output hooks have regression coverage. DELETE/COUNT/NEW/helpers/dedicated origins
  retain their contracts. A separate nested READ/LIST still captures independently.
- Deterministic copy/view or identity evidence identifies work safely omitted by
  trusted output. No speedup is asserted from its name, and no extra implicit query
  or persistence call appears. V1 checks pass.

Verification: V1 new output-mode tests plus affected mutation, input, dependency,
populate, ownership, native, budget/publication and alternate-origin regressions.

Completion evidence (IMPLEMENT-03; coordinator reconciled):

- Delivered private write-entry/output-child derivation, mandatory write-origin
  materialization and conversion-failure handling, canonical CREATE/UPDATE/UPSERT
  worker integration, embedded/target mode propagation and write-target pre-copy
  absorption. See [runtime handoff](../task-artifacts/access-router/oam-20261103-172737-runtime/README.md)
  for exact paths, commands, omission evidence and intermediate failure resolutions.
- Coordinator inspected runtime diffs: input execution/query tokens remain separate;
  output calls retain capture/provenance/family/publication and initiating access
  tuples; source admission detaches even successful live-storage conversion results.
- Added three maintained suites (**40 + 47 + 49 tests**) and shared worker fixture;
  extended real HTTP/root, private-dependency, grant-stage and excluded-origin cases.
  Both write modes own source; only trusted omits the extra document-hook view copy.
- Transitive build, source typecheck, scoped ESLint/Prettier and handoff hygiene passed.
  Fresh V1 reports checked by coordinator: **33 files / 2,166 tests**, followed by
  **3 files / 50 route tests**; **2,216 total**, zero failures/pending cases.
- Full package/decorator/packed/tooling and repository gates are not claimed here.
  OAM-04 must qualify READ/LIST JSDoc for target-local modes under write-origin populate
  and mandatory write-source bounds; OAM-05 provides independent final acceptance.

F1/F2 remediation evidence (IMPLEMENT-03 resumed; coordinator reconciled):

- [Remediation report and curated verification](../task-artifacts/access-router/oam-20261103-172737-runtime-remediation/README.md)
  preserve reviewed-input hashes, failing-before observations, delivered hashes and
  exact scoped commands. Original review/handoffs remain unchanged.
- Shared `storeCallRecord` now constructs null-prototype records with own absent
  provenance/origin/lazy-view slots across all stores. Root original associations
  are per source+call; descendant identities are publication-scoped and counted.
  Cleanup registers before capture for every publication, not only collection owners.
  Production reference lookups use exact publication context and reject ambiguity.
- Added **14 provenance + 25 lifetime regressions**. Coordinator checked raw results:
  initial **30 assertion failures / 0 passes** on reviewed production code; final
  **47 files / 2,521 passes**, zero failed/pending, including all **39** expanded
  regressions and previous V1 ownership/populate/native/budget coverage.
- Build, source typecheck, scoped lint/format and evidence hygiene passed. Coordinator
  inspected the three production changes and exact before/final report counts.
  No public/input/persistence contract changed. OAM-04 must rerun V2 and REVIEW-05
  independently recheck the fixes; no final acceptance is claimed by this remediation.

### Task OAM-04: Update installed guidance, consumers and tooling coverage

Status: completed

Assigned: INTEGRATE-04 consumer/guidance subagent (new separate session; coordinator owns status).

Delivery below passed on the pre-remediation inputs. Reopened for validation only:
OAM-03 fixes are delivered; rerun affected V2/consumer/tooling gates before final review.
No public naming/scope change is requested by F1/F2; preserve existing integration work.

Kind: improvement

Priority: P2 — keeps the installed API, examples and verification tools truthful.

Dependencies: OAM-03

Primary ownership: remaining maintained test/type/runtime fixtures,
`packages/access-router/README.md`, `MIGRATION.md`, `llms.txt`, public option JSDoc,
`packages/access-router-deco/README.md` and consumer fixtures,
`website/docs/packages/access-router/configuration.mdx`,
`website/docs/packages/access-router-deco.md`, and affected `scripts/benchmarks/`.

Finding: installed guidance, decorator examples and numerous fixtures describe two
READ/LIST settings and blanket isolated writes. Benchmark tooling also enumerates
READ/LIST modes; its existing workload scope must not imply coverage of new write modes.

Requirements:

1. Document all four `*AuthorizationMode` settings and the current output-only
   CREATE/UPDATE scope. Explain mandatory write detachment, UPSERT branch selection,
   target ownership, independent calls and already-persisted writes on output
   failure. Update current guidance in the shipped MIGRATION document where needed;
   do not invent a READ/LIST rename or compatibility workflow.
2. Verify discoverability in packed root and `/advanced` CJS/ESM declarations and
   installed README/JSDoc. Add positive four-option and negative malformed-mode/
   client-selector consumer cases; keep `/processors` and exports/package metadata intact.
3. Extend maintained mode fixtures and assertions without deleting the negative
   boundaries they protect. Align decorator behavior with the runtime, not a private
   deep import. Remove stale claims that every write hook receives isolated data.
4. Review benchmark option discovery, actual worker configuration, verification and
   labels for the expanded API. Keep existing READ/LIST keys and workload meaning;
   those workloads need not become a four-operation performance catalog. Update
   only affected assertions/labels and test that two measured modes are not presented
   as evidence for all four operations. Do not silently measure default isolation
   while labeling it trusted or treat comments/loose types as support.
5. Preserve historical task/artifact bytes and measured claims. Do not relabel old
   seals as new runs or rewrite prior evidence to imply write-output coverage.

Acceptance criteria:

- Shipped types, runtime configuration, README/MIGRATION and decorator guidance
  agree. Packed consumers accept all four model/default options and reject malformed
  values and request-level selectors. Existing READ/LIST names continue to work.
- Source/docs search has no `*OutputAuthorizationMode` supported spellings or stale
  blanket isolated-write-output statements outside labeled historical evidence.
- Benchmark tests retain actual READ/LIST configuration and fail-closed support
  detection under both declaration conditions. Claimed cost savings have new evidence;
  old performance reports are not evidence for the new write-output behavior.
- Full affected package/type/packed checks and benchmark checks in V2 pass.

Verification: V2 plus scoped documentation/type content review and reference checks.

Completion evidence (INTEGRATE-04; coordinator reconciled):

- Updated maintained README/MIGRATION/llms/JSDoc, decorator/website guidance,
  positive/negative declaration/documentation/packed consumers and benchmark scope/
  discovery coverage. [Integration handoff](../task-artifacts/access-router/oam-20261103-172737-integration/README.md)
  records exact file ownership, commands, checks and initial failures/resolutions.
- Access-router typecheck passed. Full unfiltered package scripts passed **199
  files / 6,925 access-router tests** and **23 files / 779 decorator tests**;
  **7,704 total**, zero failed/pending. Coordinator inspected the fresh JSON totals.
  These include complete strict/packed consumer and executable documentation checks.
- Fresh declaration/pack inspection confirms four optional exact-union settings in
  root and `/advanced` module conditions, retained public exports and no private
  write issuer exposure. Changed-file lint/format and links/privacy/ignore/whitespace passed.
- Initial benchmark selections had **1 + 2 missing-historical-fixture failures**.
  Existing original OAR-01 sealed baseline was found; INTEGRATE-04 verified complete
  recorded artifact/dependency inventories read-only, before and after both runs.
  No baseline build/install/restore/reseal or historical record change occurred.
- Full owned+batch rerun **29/29**, shared-runner/integration **29/29**, zero skipped/
  failed. Coordinator checked actual logs and equal before/after snapshots. The
  first handoff was usage-interrupted; same integration session resumed to confirm
  final evidence. No further product edits invalidated the package results.
- Historical fixture/dependencies are environment-dependent, not a vendored replay
  bundle. Curated provenance and exact reproduction prerequisites are in the handoff;
  no timing/performance claim or old-seal relabeling is made. V3 remains OAM-05's gate.

Post-remediation revalidation (original INTEGRATE-04 resumed):

- [Fresh V2 revalidation and curated inputs/results](../task-artifacts/access-router/oam-20261103-172737-integration-revalidation/README.md)
  confirm the five remediation files match delivered hashes and protected incoming
  inputs/HEAD stayed unchanged. No integration correction or public/docs change needed.
- Typecheck and unfiltered scripts passed: **201 files / 6,964 access-router tests**,
  **23 files / 779 decorator tests**; **7,743 total**, zero failed/pending. Both full
  benchmark selections passed **29/29**, zero skips/failures, with unchanged complete
  historical baseline snapshots before/after use.
- Fresh installed declarations/private export/guidance checks, scoped lint/format and
  evidence hygiene passed. Original REVIEW-05 must still independently recheck F1/F2
  and final V2/V3; the unrelated Docker prerequisite is not an OAM-04 blocker.

### Task OAM-05: Verify integration and reconcile the delivered contract

Status: blocked

Assigned: REVIEW-05 independent reviewer (new session; not a prior implementer;
coordinator owns task status).

F1/F2 and all scoped code criteria pass independent re-review. The later real-
Docker Redis lanes pass; short ignored repo-local TMPDIR resolves BroadcastChannel
socket failures. The Vault reset did not reproduce in three declared whole-file
runs or the subsequent full Vault run; its historical cause remains undetermined.

Remaining blocker B3: `apps/oidc-vault-dpop-example/test/browser/logout-navigation.browser.ts:207`,
case `navigates only to fixed fallback on unavailable (cookie)`, expected bare-
endpoint URL equality true but received false. The application/browser-test owner
must investigate the held response and discovery-cache expiration, establish the
complete app script passing, then rerun required serialized root `pnpm test` in
fresh short scratch. The actual URL was not logged; do not assert a redirect cause,
pre-existing failure or infrastructure-only attribution. No unrelated fix or test
weakening is authorized by this CRUD-mode task.

Kind: improvement

Priority: P1 — final gate for an externally visible authorization/API change.

Dependencies: OAM-04

Primary ownership: integration review and this task's acceptance/evidence record;
fixes stay with their owning task. Prefer a separate reviewer if later authorized;
do not claim independent review or spawn agents merely because this task exists.

Finding: cross-phase leaks, stale declarations/tooling and target-mode inheritance
cannot be excluded by configuration-only tests or a successful build.

Requirements:

1. Check every acceptance criterion against delivered source and runtime evidence,
   especially input/output separation, live write/native aliasing, captured target
   policy, alternate entry paths and mode changes during awaits.
2. Review bounds, hook argument isolation, immutable actor/policy/facts, publication
   cleanup and no hidden authority in DTOs/diagnostics. Confirm no unintended NEW/
   dedicated/helper eligibility and no alternate runtime option aliases.
3. Run V2 and V3 serially on final source. Reconcile actual results with reported
   evidence; reopen tasks invalidated by later edits. Record failures/blockers rather
   than dropping tests or calling an untested boundary complete.
4. Preserve useful design/review/cost evidence under
   `docs/task-artifacts/access-router/<task-or-run-id>/`; scrub private/machine-local
   data and resolve all durable references before handoff.

Acceptance criteria:

- OAM-01–04 are complete with required checks, and the four-option contract is
  consistent across runtime, direct/root/advanced paths, declarations and docs.
- Final verification is green, or this task remains blocked with the exact unmet
  prerequisite and residual risk. No blanket security or performance certification.

Verification: V2, V3, acceptance review and `git diff --check` after the last edit.

Initial independent review evidence (REVIEW-05; rejected, not completion):

- [Review and curated verification record](../task-artifacts/access-router/oam-20261103-172737-review/README.md)
  preserve the checked input hashes, source/criterion mapping and exact F1/F2 repros.
  Reviewer did not edit runtime, maintained tests or coordinator status.
- Fresh V2: typecheck, **6,925 + 779 package tests** and both benchmark selections
  **29/29 each** passed. Root build (**31 build entries**) and lint passed.
- Independent adversarial probes: **3 failed / 1 passed**. Three failures confirm
  inherited generic-origin trust and two post-publication raw-link lifetime cases;
  a suspected native/capture-order issue was disproved and is not a finding.
- Root `pnpm test` failed in unchanged attestation Docker/Redis setup: two setup
  failures, 62 automatically skipped bodies; recursive run stopped before remaining
  workspace scripts. This is an observed prerequisite failure, not a claimed clean-
  baseline result or proven OAM regression. No host Docker configuration was changed.
- Historical baseline inventories remained identical and report hygiene passed.
  Successful gates describe pre-remediation inputs; rerun after the runtime fixes.

Independent post-remediation re-review (REVIEW-05 resumed):

- [Re-review and curated verification](../task-artifacts/access-router/oam-20261103-172737-review-revalidation/README.md)
  accept all scoped code/contract criteria: F1/F2 fixed, no new substantive OAM
  finding. **15 independent adversarial probes** passed; full V2 **7,743 tests**,
  both benchmark selections **29/29**, root build and lint passed on fixed inputs.
- Required root test failed after passing all attestation real Redis/Mongo/browser
  lanes: mongoose-rxdb BroadcastChannel socket addresses were **123–124 bytes**.
  Bounded diagnostic confirmed **93 bytes succeeds; 123/124 fail EINVAL**. The
  review's long TMPDIR must be replaced with fresh short ignored repo-local scratch.
- Supplementary no-bail result (**19,521 passes / 22 failures / 1 todo**) also had
  one Vault logout-navigation ECONNRESET after that package passed all **2,449** in
  the mandatory run. Cause is not established; no source change or flaky-test
  dismissal is authorized. Full required root gate remains incomplete pending rerun.
- Review report, input hashes and historical inventories are preserved unchanged;
  no skipped/substituted tests or host/dependency modifications were used for a pass.

Final root-gate follow-up (same independent REVIEW-05; scoped ACCEPT, overall blocked):

- [Root-gate report and curated results](../task-artifacts/access-router/oam-20261103-172737-root-gates/README.md)
  preserve the new required run without overwriting earlier rejection/failure records.
  Fresh short ignored scratch produced a **95-byte** BroadcastChannel socket and
  passed an actual listen preflight. No old socket directories were reused/deleted.
- Three predeclared complete Vault-file runs passed **199/199 each**; the required
  root run then passed Vault **2,449/2,449**, mongoose-rxdb **632/632**, attestation
  real Redis **62/62** and Redis store **462/462**. Prior socket/Docker blockers are
  resolved; the reset was not reproduced, not labeled harmless or given an invented cause.
- Fresh exact `pnpm build` and `pnpm lint` passed. Exact default serialized root
  `pnpm test` failed at B3: **22 completed Vitest lanes / 9,222 passed / 1 failed /
  1 existing todo**, zero skipped or reported unhandled errors. Later root package
  scripts have no completed result in this invocation; standalone V2 remains separate.
- **2,238 protected nonignored files** and **19 router/decorator built files** stayed
  unchanged. Scoped acceptance, **15 probes / 7,743 V2 tests / 58 benchmark checks**
  remain valid for unchanged product inputs; they were not relabeled as fresh root passes.
- No source/test/dependency/Docker configuration changes or root retry-to-pass loop.
  Evidence formatting/privacy/link/hash/ignore/whitespace checks passed. No further
  in-scope implementation defect is known; full task completion awaits the external
  application test gate rather than treating a partially passing root run as green.

## Shared verification and execution rules

Prerequisites: dependencies installed with `pnpm install`, repository Node/pnpm
versions from package metadata, and MongoDB memory-server prerequisites for database
tests. Commands run from repository root. Replace every quoted placeholder before
execution. Choose a fresh `_tmp*` directory per run, create it and confirm it is
ignored with `git check-ignore`; set `TMPDIR` to its absolute checkout path at
runtime. Do not put durable evidence solely in scratch.

Do not overlap build/test/typecheck commands: package scripts rebuild shared
dependencies and can race on `dist/`. The examples below are separate serial steps.
Record exact focused test filenames as they are added; do not invent test counts.

### V1 — focused implementation checks

Build transitive dependencies first, then run relevant existing and newly added
Vitest files with the package's config. Starting examples:

```sh
pnpm --filter @web-ts-toolkit/access-router... build
TMPDIR='<repo-root>/_tmp-<run-id>' pnpm --filter @web-ts-toolkit/access-router exec vitest run --config vitest.config.ts test/owned-authorization-modes.unit.test.ts test/owned-authorization-modes.integration.test.ts test/authorization-fast-path-options.integration.test.ts test/service-authorization-mutations.integration.test.ts test/document-permissions-dependencies.integration.test.ts
pnpm --filter @web-ts-toolkit/access-router-deco... build
TMPDIR='<repo-root>/_tmp-<run-id>' pnpm --filter @web-ts-toolkit/access-router-deco exec vitest run --config vitest.config.ts test/owned-authorization-modes.test.ts
```

Add focused write-output, target, control-admission and stage/native/budget checks
for the actual changed paths. Existing paths above were inspected; they are not a
substitute for new feature tests or full package verification.

### V2 — affected packages and installed/tooling surface

Historical compatibility benchmark cases additionally require an intact built
historical root supplied through `WTT_BENCH_LEGACY_ROOT`; do not default that fixture
to the current owned-engine checkout or fabricate legacy support. The integration
handoff documents the original OAR-01 artifact and read-only inventory checks used
in this environment. Set that variable to the verified artifact's absolute runtime
path (and `WTT_BENCH_CANDIDATE_ROOT` to the current checkout where needed) for the
benchmark commands. This historical dependency is not bundled with the task evidence.

```sh
TMPDIR='<repo-root>/_tmp-<run-id>' pnpm --filter @web-ts-toolkit/access-router typecheck
TMPDIR='<repo-root>/_tmp-<run-id>' pnpm --filter @web-ts-toolkit/access-router test
TMPDIR='<repo-root>/_tmp-<run-id>' pnpm --filter @web-ts-toolkit/access-router-deco test
TMPDIR='<repo-root>/_tmp-<run-id>' WTT_BENCH_TMP='<repo-root>/_tmp-<run-id>' node --test --test-concurrency=1 scripts/benchmarks/access-router-owned.test.mjs scripts/benchmarks/access-router-owned-batch.test.mjs
```

The package suite includes `strict-consumer-types.test.ts` and
`packed-consumer-compatibility.test.ts`; extend those existing consumer mechanisms
instead of relying only on monorepo source compilation. Run additional benchmark
runner tests when their shared discovery/worker files change; historical prerequisites
are documented in `scripts/benchmarks/README.md`. Full historical timing protocols
are not required unless new numerical performance claims are proposed.

### V3 — final repository integration

Run `pnpm build`, `pnpm test` and `pnpm lint` serially from repository root, with
the same ignored repository-local `TMPDIR` for runtime work. Keep the root test
script's serialized workspace concurrency. Run `git diff --check`; review emitted
declarations, mode-key searches, changed documentation links and publish surface.
No release/version bump, publishing or full release-artifact build is needed solely
to add these options; packed-consumer checks remain required.

Use a fresh **short-named** root `_tmp*` directory for full-repository tests and
preflight actual derived BroadcastChannel Unix-socket paths (the verified 95-byte
path fit; 123–124-byte paths failed). Long run identifiers belong in log filenames,
not an unchecked TMPDIR basename. Do not disable socket/browser/Redis lanes or reuse
failed socket directories merely to produce a root pass.

## Definition of done and planning evidence

Done means all five tasks satisfy their acceptance criteria and required checks,
including a verified output-only boundary and real source/view borrowing, without
aliases or write-input/persistence changes. A saved plan or accepted option value is
not completion. Unresolved ownership decisions block implementation of borrowing.

Planning verification (historical task-creation evidence; documentation-only worktree then):

- Prettier check passed for this task file after correcting draft table formatting.
- All 3 related-task links and 24 explicit source/test/document path references
  resolved; 5 unique task IDs and their dependencies were checked.
- Privacy/naming review passed; the task file is not ignored. No scratch artifacts
  were created and no implementation files were changed.
- Whitespace review passed, including the new untracked file's contents.

At task creation, runtime/build/type/packed/performance baselines had not run and
the ownership design gate was unresolved. The execution records above supersede
those planning limits: design, implementation, focused/full affected consumers and
scoped independent code acceptance are delivered. No new numerical performance
study or release operation was requested/performed. OAM-05 remains blocked solely
on the final required application/browser root-test gate described above.
