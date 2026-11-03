# Access-router owned authorization: breaking redesign and migration

Created: 2026-10-31 15:30:20 PDT
Status: completed

Evidence preservation: [curated archive](../task-artifacts/access-router/README.md).
Selected documents now use tracked paths. References to raw logs, builds, seals,
original source snapshots and other omitted files still describe the original
ignored packets, not files beside the archived documents. Historical commands,
findings and statuses are unchanged; archived protocols are not runnable bundles.

Execution paused at the user's request after OAR-03 completed, then resumed on the
user's request to continue the remaining items. OAR-01–08 and the broader helper/guard
redesign are complete; OAR-09 performance verification is delivered. The user explicitly
accepted the documented residual costs/inconclusive results; OAR-10 is complete after
independent review, separate documentation corrections and independent re-review.
The optional collection helper and its approved router-controlled budget scope are
implemented, documented and scoped-verified. The new tested artifact has now been
measured separately; its earlier integration-only NOT_MEASURED seal remains historical.
Affected full-package verification passes; numerical performance gates remain 70/90,
with the remaining outcomes accepted by explicit user disposition, not relabeled. Work
through OAR-09D was subsequently committed by the user; new work remains uncommitted.
Scoped final review found no remaining blockers. No commit, publication, release or
blanket security certification is authorized by this completion.

## Objective and authorization

Replace repeated defensive verification of mutable authorization state with a
small number of explicit ownership boundaries, one document-stage engine and a
smaller public READ/LIST protection model. Improve protective-default performance
without treating permission checks as optional work.

The user requested **this task document**, including recommended public behavior
changes and thorough breaking-change guidance. Backward compatibility is not a
requirement: consuming project teams will migrate. This document does not authorize
starting implementation, committing, publishing, dependency changes or release
administration. A designated breaking release is required; its version/date are not
selected here.

Execution authorization: the user subsequently requested implementation sequentially
by subagents. OAR-01–10 now run one child at a time, with a separate final independent
reviewer. The coordinator owns task reconciliation; children return evidence without
editing this document. No commits, publication, dependency changes or workspace-wide
verification are authorized. Starting execution retained the two task-document changes
from creation at `58b22c0d6d3abd4ecce03533e3867d148ff21233`. Before OAR-09E the user
committed the preceding work; recovery entry is clean at
`a1996e10f8339d89fc8a0aa2b10f7b531f5a07ca`. Preserve those commits without rewriting them.

Do not build compatibility adapters, retain deprecated flag aliases, accept legacy
capabilities through a hidden path, or keep the old authorization engine merely to
avoid migrations. Keep genuinely useful unchanged APIs; removing compatibility does
not justify unrelated renaming. The recommendations below are the implementation
target, subject to OAR-01's bounded feasibility/contract gate, not APIs already shipped.

## Scope, prior work and evidence

Starting HEAD: `58b22c0d6d3abd4ecce03533e3867d148ff21233`; worktree clean at analysis.
Recheck status before execution and preserve subsequent unrelated user work.

Primary scope: `packages/access-router` authorization configuration, model query
execution, document grants, field evaluation, finalization, output helpers, public
types, installed documentation and tests; affected `packages/access-router-deco`
consumers; `scripts/benchmarks` and matching website documentation.

READ/LIST is the optimization target. Shared grant normalization, capability removal
and field-hook typing must also be consistent in write-derived output, new templates,
dedicated subdocuments and data helpers. This is **not** authorization to relax or
redesign write admission, persistence/save hooks, row policy, related-target elevation,
route variants, query language, or DataService's request-only security model.

Related completed work, not tasks to reopen or undo:

- [Unsafe fast path](20261030-142406-access-router-unsafe-authorization-fast-path.md):
  accepted current feature and last independent fixes. This new phase intentionally
  replaces parts of that public contract; preserve its historical evidence.
- [Query pipeline overhead](20261029-211734-access-router-query-pipeline-overhead.md):
  shared preparation and evidence-backed rejected optimizations. The new ownership
  contract differs; do not mislabel this redesign a behavior-preserving continuation.
- [Explicit service authority](20261007-143507-access-router-explicit-service-authorization.md)
  and [follow-ups](20261012-090227-access-router-authorization-follow-ups.md): preserve
  separate operation/row/input/output/target authority and original-actor semantics.
- [Long-term health](20261012-165209-access-router-long-term-health.md): completed
  business-boundary fixes. This is an ownership/performance redesign, not a duplicate
  general hardening backlog. Historical root verification instructions there do not
  override the scoped-only requirement below.

Inspected source and confirmed observations:

- `src/acl/authorization-snapshot.ts` (`copyAuthorizationValue`,
  `matchesAuthorizationSnapshot`, `outputIdentities`): whole-value normalization,
  copying/comparison and graph identities; copying can execute native methods.
- `src/acl/document-authorization.ts` (`StageRecord`, `DocumentRecord`, `OutputRecord`,
  `resolveDocumentAuthorization`, `memoizeTrustedFieldDecision`,
  `createServiceOutputContext`): copied/trusted/omitted states, repeated owner reads,
  shared or copied grants, graph association/transfer and exported result capabilities.
- `src/acl/service-authorization.ts`, `service-execution.ts`, `model-output-planning.ts`:
  captured call policy, receiving ownership, option/catalog captures and ten flags.
- `src/acl/output-field-filter.ts`, `field-authorization.ts`,
  `trusted-output-materialization.ts`: actual grant resolver/evaluator, output work
  budgets, native preparation and denied-key accounting that must survive replacement.
- `src/interfaces/access.ts`, `router-hooks.ts`, `service-authorization.ts`, `root.ts`,
  `core-data.ts`: one-argument public GuardHook versus two-argument model-output
  invocation; arbitrary grant records; retained helper overloads; request-only data rules.
- Tests `authorization-fast-path-runtime.unit.test.ts:292-369,545-583` demonstrate
  mutation-dependent permission differences and retained stale decisions. These are
  documented current-mode behaviors, **not newly discovered vulnerabilities**.
- Public package exports, publish allowlists, tsup entries and affected package scripts
  were inspected. No new runtime baseline, build, test or timing was run to write this
  plan. Only documentation verification is required at task-file creation.

Paths beginning `src/` or `test/` in this document are relative to
`packages/access-router/`. These inspected paths/symbols, not drifting line numbers,
are the primary implementation references.

Prior accepted evidence is a reference, not verification of future code: final fast
path ESM `33662fae…`, 6,449 access-router / 691 deco / 29 runner tests; primary LIST
median reductions about 27% wide, 28–29% document rules, 54–55% embedded versus that
same build's new flags OFF. Active already omits much copying; those savings cannot
be counted twice. Strict/dormant overhead and adverse tails remain disclosed.
The v0.51.0 source/current-dependencies diagnostic was still 2.09–2.85× faster than
active; it was not a frozen historical installation or security comparison.

## Recommended target contract

### C1. Retained security boundary and explicit non-promises

Always enforce original actor, server-only authority, exact request/runtime/model/
scope/access ownership, operation/row/field rules, target admission, explicit selection,
safe property construction, query/request limits, finite concurrency and bounded
selected/native traversal. No source-isolation profile is an ACL bypass.

Prevent mutation of **library-owned authority** rather than repeatedly comparing it
with application objects. Readonly TypeScript types and Object.freeze are insufficient
for arbitrary Date/Buffer/BSON/Map leaves. Do not replace proven isolation with a
comment asking hooks to be pure, or issue a validation certificate across application
work on still-mutable inputs.

Callbacks are trusted server code, not a JavaScript sandbox. Function closures,
external caches/database state, native hooks and application presentation code are
not made immutable by capturing a function reference. A stage is not a database
transaction or a guarantee that external permissions remain current after an await.
No formal certification, exhaustive security equivalence, v0.51.0 parity, universal
speedup or zero-default-overhead claim is authorized.

### C2. Exactly three ownership boundaries

1. **Operation entry:** authenticate the receiving service; capture effective actor,
   explicit server policy, primitive access tuple, configuration/catalog and source
   isolation mode before hooks/awaits. Retain cheap opaque call identity. Reuse private
   owned preparation within that call; no cross-request decisions or schema-identity
   caches. Native configuration/filter values must be detached at their actual exposure
   boundary; function-attached option slots are not a mutable live configuration API.
2. **Document stage:** create private stage state, resolve its document hook once,
   normalize its immutable facts once and memoize field decisions only in that
   stage. Different rows, same-ID objects, calls, related targets and pre/post-write
   stages cannot share decisions. Reuse owning facts for genuine embedded scopes only.
3. **Output publication:** construct/filter selected output, finish admitted children,
   virtuals, includes and permission metadata, then publish an ordinary DTO. Do not
   copy it again just to transfer authorization associations. A returned DTO has no
   capability, certificate, hidden authority symbol or WeakMap-based reusable authority.

Close stages on successful publication and every error/cancellation exit. Outstanding
work must settle/cancel according to the existing scheduler; a late callback cannot
publish or revive a closed stage. An internal child may share immutable preparation,
not impersonate the parent binding. Retain FP-07's receiving request/runtime guard.

### C3. Immutable boolean document facts and correctly typed callbacks

Recommend exported `DocumentGrants = Readonly<Record<string, boolean>>` and a separate
`FieldPermissionHook` type for permissionSchema functions. Model docPermissions hooks
return DocumentGrants/Promise<DocumentGrants>; remove arbitrary unknown-valued grant
records from their public contract. Do not add a generic escape hatch for rich grants.

- Accept only bounded own enumerable string-keyed plain records of literal booleans.
  Reject accessor/proxy/symbol/protected-key/rich/native/nested values without invoking
  getters or coercing truthiness. Copy once into a package-owned frozen record; never
  freeze or retain the application's returned map. Admission failure is a controlled
  authorization BadRequest before publication, not a partially accepted grant map.
- A missing hook or a thrown/rejected hook retains the current empty-grants fail-closed
  behavior and fixed-category warning. Keep validation of a fulfilled hook result
  outside the application-error catch; structural overflow must not become success.
- Every permissionSchema callback receives `(permissions, grants)` and original-request
  `this`. In document-output stages, grants are that stage's facts. Request-only data,
  create/raw-input schema helpers and standalone-helper evaluation receive frozen empty
  facts. Existing-document update/upsert-update and existing-parent subdocument input
  admission retain their own normalized pre-write document facts; emptying them can
  allow negative predicates such as `!grants.suspended`. Pre/post-write stages remain
  independent; no DTO/output grant supplies input authority. No write admission is
  relaxed. Pre-fetch document classification
  still defers functions rather than invoking them with imaginary document facts.
- Keep operationAccess GuardHook request-only; fix its accidental reuse as the field
  hook type. Preserve existing boolean/string/array grammar, short-circuit and effective
  operation rules. Keep callback error-denial semantics; do not invent another policy DSL.
- Capture the actor's permission map once and expose immutable query methods/keys,
  without replacing or elevating the original request actor. Callback reads must not
  reconstruct the entire permission map repeatedly or expose mutable backing storage.
- Exposed permission metadata remains request-user boolean facts, never backend
  grants; strip/expose/include switches do not suppress internal resolution.

This deliberately changes rich grants, identity comparisons between grant arguments,
mutations and reliance on native normalization side effects. An external mutation of
the hook's returned map cannot alter the captured facts in either mode.

### C4. One engine, two source-isolation modes, no legacy compatibility

Recommend exactly these independent server model/default-model options:

```ts
readAuthorizationMode?: 'isolated' | 'trusted';
listAuthorizationMode?: 'isolated' | 'trusted';
```

Both default to `isolated`. Only the literal enum strings are accepted; there is no
coercion, prerequisite combination, dormant mode or extra per-call/client selector.

- **isolated:** own a bounded detached projected source before application callbacks;
  document-permission hooks receive a disposable isolated view. Preserve separate
  getter views/return staging so argument mutations are not implicit output writes.
  Do not leak owned mutable native leaves through diagnostics. At a callback boundary,
  make a necessary isolation copy, not a new whole-graph validation on every owner read.
- **trusted:** may borrow an admitted ordinary projected source and its document-hook
  input. Source/context mutations can affect values and facts calculated by the hook;
  hidden unvisited source graphs do not receive whole-document shape/bound validation.
  **It still owns the captured actor, policy and normalized boolean facts, and never
  exports reusable output authority.** It is not a renamed guarantee of today's all-ten
  mode or permission to retain mutable grants/stale handles.

Both modes use the same stage/evaluator/finalizer/materializer. Branch at source/view
admission, not throughout two parallel authority lifecycles. Supported hydrated/native
input may normalize at the necessary boundary; unproven shapes may reject or normalize
once, never silently enter the old engine or rerun a document hook after fallback.

Capture an owning model's mode once; embedded scopes inherit it. READ-to-LIST retries
retain their initiating READ mode. **Related targets select their own captured model
mode** at the effective target access, as well as their own policy/facts; a trusted
parent cannot lower a target's isolated default. This intentionally replaces current
origin-wide unsafe-mode inheritance. Independent callback service calls are new calls.
Writes/new/dedicated subdocument origins do not acquire trusted behavior by having a
read-shaped response. Capture/rollback applies to new operations, not in-flight ones.

Remove all ten flags from live configuration/types/defaults/warnings/engine selection:

- `unsafeSkipListDocumentSnapshotChecks`, `unsafeSkipReadDocumentSnapshotChecks`
- `unsafeSkipListOutputSnapshotChecks`, `unsafeSkipReadOutputSnapshotChecks`
- `unsafeSkipListNestedDocumentSnapshotChecks`, `unsafeSkipReadNestedDocumentSnapshotChecks`
- `unsafeSkipListInitialOutputSnapshotCopy`, `unsafeSkipReadInitialOutputSnapshotCopy`
- `unsafeUseListAuthorizationFastPath`, `unsafeUseReadAuthorizationFastPath`

Retired names remain recognized **only to reject legacy control slots**, including
undefined/false, with a migration-directed error. New/retired controls in HTTP/root/
per-call/include/populate/subquery authority namespaces reject before work; same-named
persisted business fields remain inert. Bulk setters must reject atomically. Mode
inheritance, explicit restoration and warning/logger-failure behavior need tests.

### C5. Retire public output capabilities instead of exporting expiring tokens

Remove the public DocumentAuthorization type/export, the documentAuthorization helper
option, and ServiceOutputContext.documentAuthorization/getDocumentAuthorization.
Do not replace them with a public callback that merely exports the same capability
under another name. Result context, if retained, is diagnostics only; result data is
already filtered, not an object whose future contents are certified.

Keep named raw output-policy helpers as **fresh output-only evaluation** of current
values, captured global permissions, empty document facts and explicit server-only
outputFields policy. They never invoke a document hook on an arbitrary raw object or
trimmed DTO, recover omitted fields, run virtuals, check rows or perform hidden DB I/O.
Use the shared evaluator, not a second helper-specific permission language. Input/data
helpers retain their own request-only purposes; no metadata-based authority recovery.

For document-dependent authorization after a query, callers must use a fresh normal
service operation with suitable private hook inputs/selection. Filtering a DTO with a
new raw helper is **not** equivalent to that operation. This can add reads; measure it.
Explicit backend output grants remain supported but are never an automatic replacement
for a retired document handle. Child handles/lookup/issued-member registries disappear.

Internal decorators/virtuals can consume their live stage while it remains private.
Presentation callbacks remain trusted post-filter application output construction,
not an automatic second authorization pass. Changes there must not revive stage memo.

### C6. Diagnostic separation, native values and bounded work

Separate read/output diagnostic contexts from mutation lifecycle contexts. Remove
read-output full-source/final-snapshot aliases and raw backing state; expose only the
specified diagnostic fields and immutable boolean facts. OAR-01 must inventory every
old context member and record keep/remove/replacement guidance. Do not blindly freeze
prepare/transform/change contexts or alter legitimate persistence hooks.

Retain private-populate argument-four isolation, selected-field/dependency distinction,
target-local facts, child-before-parent virtual ordering, hook concurrency and once-per-
stage errors. Unconditional field true is not route/row/target bypass.

Retain selected 20,000-slot/depth-100 limits with explicit budget-owner scopes, safe
definitions, cycle handling and poisoned whole-result failure. Every encountered
selected key, including denied/protected keys, charges before policy/value observation;
unvisited denied values stay unread. Code.scope, DBRef fields, nested native containers
and wire expansion must be admitted **before** library serialization, using the same
remaining budget. No child/native/helper transition resets it. Preserve supported
native controls, bounded exact/depleted/depth cases and no partial publication.

Do not delete bounded normalizers needed by input/write/policy paths just because
output graph certificates disappear. Drop obsolete graph-transfer/identity/membership
machinery only after caller migration. No always-true validation stubs or fake snapshots.

### Resolved OAR-01 execution details

These refinements are part of C1–C6, resolved from actual callers before OAR-02:

- One private state machine: created → resolving → ready → building → closed; a
  failure may close any earlier state. Reuse one resolution promise and per-key
  pending/fulfilled/rejected decisions. Check open/generation after actual async work
  and immediately before commit. Close before application decorate/decorateAll/tasks;
  those receive filtered data/immutable diagnostics, not a live stage. Clear sources/
  builders/memo after tracked work drains; minimal closed tombstones cannot revive.
- Each operation owns a publication/failure group. On error, close/poison first,
  stop new admissions, drain already-admitted library work before returning, and
  reject late publication. LIST buffers until all rows/count succeed; root-batch entries
  are independent operations. Preserve hook-gate FIFO/reentry/depth and persistence
  permit rules. Do not wait for untracked application closure work or treat a normal
  completed HTTP message close as an abort. No new public cancellation/token API.
- Facts reserve one root plus one slot per key (19,999 keys maximum). Reject proxies
  before prototype/descriptors; reject symbols, non-enumerables, accessors, undefined/
  rich values and protected keys `__proto__`, `constructor`, `prototype`, `_doc`, `$__`,
  `__v`, `_permissions`, `_view`, `_edit`, plus the configured metadata field name.
  Other string names, including dotted/prefixed keys, remain valid. Own/freeze a
  null-prototype copy, not the returned object. Invalid fulfillment is whole-map 400.
- Do not accidentally assimilate a sync fact map's accessor `then` in an async wrapper:
  box hook results through the scheduler, brand-check genuine Promise results and
  normalize outside the application-error catch. Arbitrary thenables are unsupported;
  application/native Promise assimilation before delivery is not sandboxed. Field
  callback return truthiness/error-denial remains unchanged; strict boolean checks
  apply to grant values, not a new field language. Export separate FieldValidation.
- Add readonly ModelOutputContext for doc-permission hooks (including pre-write),
  virtuals, model decorators and result contexts. Its exact allowlist is modelName,
  initiating operation, receivingModelName, definition scopePath, virtualAccess,
  outputAccess, docPermissionsAccess, docPermissions and optional resolvedQuery with
  select/populate/sort canonical string arrays plus numeric skip/limit. All members
  are frozen primitives/arrays/facts; doc-hook and decorateAll facts are empty.
  Later per-row contexts use normalized facts, never mutate an exposed shell.
- Remove output-context mongooseModel, originalDocumentSnapshot, finalDocumentSnapshot,
  currentDocument, originalData, allowedData, preparedData, allowedFields, modifiedPaths,
  changes and resolvedQuery.filter; no renamed backing aliases. Preserve legitimate
  ModelHookContext lifecycle data/mutability for prepare/transform/change/delete/save.
  Keep diff and fieldPermissionAccess bookkeeping private. Add distinct output hook/
  list-hook types rather than using lifecycle types for decorations. Existing service
  result query/input diagnostics remain detached application data, never policy aliases.
- Preserve document guard middleware via a PRIVATE fresh read-stage condition consumer,
  not response permission metadata, public callbacks or tokens. Strip/exposure and
  presentation cannot forge it. Ordinary missing/denied guards retain Unauthorized;
  controlled invalid facts/structure return 400. No second hidden query for the guard.
- Keep useful explicit genDocPermissions/metadata/non-authority/raw hydrated-parent
  utilities, with the one fact normalizer at every actual hook invocation. Remove the
  obsolete unbound supplied-grant finalizer and raw-plan sub-row chain, not necessary
  raw parent business APIs. getDocPermissions reads metadata DATA, not authority.
- A selected budget belongs to one externally returned root ROW, not the entire LIST.
  Embedded/attachment/related/native/metadata construction debits that same remaining
  budget/depth. Shared related-target construction registers all receiving owners,
  multiplicities and depth offsets before work and charges each before policy/value/
  serializer traversal. Per-parent isolation copies also charge without rerunning
  getters. A private construction ledger is not result-keyed authority. Source,
  fact-map and explicit callback-view admissions have their own bounded owners;
  none replenishes selected output. Depth 100 and 20,000 slots are inclusive.
- Poison is sticky for selected structural/native admission and invalid facts, even
  when application code catches an inner exception. A getter body throw still omits
  its field; invalid returned selected materialization is whole-operation 400, not
  omission. Keep prepaid ordinary/native key slots, conservative arrays/Maps and exact
  Code/DBRef accounting. Dedicated post-save visibility must rethrow controlled
  admission errors rather than silently returning empty data: writes may already have
  persisted, there is no rollback and callers must not automatically retry.
- New mode setters accept literal enums or undefined restoration only. Presence of
  old controls rejects even inherited/non-enumerable/false/undefined slots. Warn on
  effective transitions into trusted per owner/access only; no repeat or isolated
  warning, and logger failures cannot affect committed configuration.

Sequencing clarification: OAR-03 must atomically cut over all live consumers, minimal
new mode capture/legacy rejection, capability removal and diagnostic shells with the
stage engine. OAR-04–07 deepen publication, helper, configuration and alternate-path
coverage; they must not depend on temporary legacy-engine aliases. A necessary isolation
copy may remain until OAR-04, but no fake closed-stage validation or ignored old flags.

Performance gates fixed before candidate timing: default primary isolated must improve
median and CPU in both initial rounds; median paired savings must reach 10% plus
1.0 ms latency and 10% plus 0.5 ms CPU in each primary workload. Material adverse is
more than 10% plus 1.0 ms median, 15% plus 2.0 ms p95, or 10% plus 0.5 ms CPU.
Apply matching adverse gates to trusted/old-active, guards, READ and comparable raw
helper/native/fact cases. Helpers perform zero reads/hooks; a current-authority migration
may add one explicit normal read, not hidden work. Total query/helper cost is compared
with the old flow plus that matching read and the same 10%/absolute allowance. Repeated
retained heap growth over 15% plus 1 MiB after GC or superlinear per-field graph growth
is blocking; unsupported allocation counters stay unavailable. On a miss/sign disagreement/
material adverse result, run exactly two more reversed paired rounds at original settings;
after four, require three aligned pairs and median paired thresholds. No discards,
sample increases or moving gates. The protocol is archived in
`docs/task-artifacts/access-router/oar01-20261031-153820/PERFORMANCE-GATES.md` and
`MEASUREMENT-PLAN.md`; baseline raw evidence remains in the original ignored packet.

## Breaking-change documentation required for consumers

OAR-08 must ship `packages/access-router/MIGRATION.md`, add it to package.json.files,
and link it from the installed README. Website/task-only notes are insufficient.
The guide must include the following examples, errors, replacements and caveats.

### M1. Rich grants and mutation-dependent rules

Before, a docPermissions hook could return `{ membership, expiresAt: new Date() }`,
and a field predicate could inspect or mutate those values. After, compute facts in
the hook and return a fresh record such as `{ owner: true, canReadSalary: false }`.
Demonstrate both typed function rules and prefixed string rules, without confusing
global permissions with document facts or introducing an unconditional grant.

Illustrative target config; types/API must be implemented and tested before shipping:

```ts
api.setModelOptions('Employee', {
  modelPermissionPrefix: 'doc:',
  docPermissions: {
    async read(doc) {
      const membership = await loadMembership(this, doc);
      return { canReadSalary: membership.canReadSalary === true };
    },
  },
  permissionSchema: {
    salary: {
      read: (permissions, grants) => permissions.has('isHR') || grants.canReadSalary === true,
    },
  },
});
```

`loadMembership` is an application function, not a proposed library export. The
executable guide fixture must supply it and the model/runtime/request setup.
Explain evaluation timing: a fact is calculated once for the stage; expensive unused
facts and external freshness require application design, not additional hidden hooks.
Mutating the original returned record, attempting to mutate supplied grants, depending
on distinct grant-object identity or storing mutable context data is no longer valid.

### M2. Hook input and context migration

Show before/after code that relied on docPermissions mutating an original document,
or reading/writing originalDocumentSnapshot/finalDocumentSnapshot/context authority.
Use explicit application variables and normal writes for intended business changes.
Explain isolated disposable views versus trusted borrowed views, including native
leaves and closure/external-cache limitations. Do not claim all hooks become pure:
normal prepare/transform/save and trusted presentation callbacks retain their roles.
Document every context member removed or moved, including decoration and virtual use.

### M3. Handles, helper freshness and extra reads

Before: `pickAllowedFields(row, 'list', { documentAuthorization: context.documentAuthorization })`.
After: use already-authorized result data without re-certifying it; for current
document-dependent authority, issue a new service read/list with intended selection
and normal row scope. Demonstrate actual checked-success result handling and errors.
For a simple presentation subset, do not add a DB query when no new authorization is
needed; do not describe that subset operation as checking current permissions.

Show new standalone-helper behavior with global-only predicates, empty document
facts and explicit scoped backend output grants. Warn that an old handle must not be
replaced with unrestricted policy or client-supplied grants. Document loss of child
lookup, metadata non-authority, replay/serialization rejection, and helper read counts.

### M4. Modes, target inheritance, removed names and rollout

```ts
// Proposed breaking-release replacement, not current shipped configuration.
api.setModelOptions('Employee', {
  readAuthorizationMode: 'isolated',
  listAuthorizationMode: 'trusted',
});
```

List all ten retired keys and explain their presence now errors, even if undefined.
There is no one-to-one mapping for every old mixed configuration. Recommend isolated
by default, explain exactly what trusted loses/retains, and show independent related
target configuration plus READ retry behavior. Include setters, default inheritance,
deco usage, JS/untyped rejection, per-call/wire prohibition, safe rollout and switching
back to isolated for **new** calls. No rolling mixed-version compatibility is promised.
Deployment rollback means deploying a tested matching library/application revision,
not restoring removed flags in the new version.

### M5. Types, unchanged APIs and error reference

Show the new two-argument FieldPermissionHook and boolean DocumentGrants types;
operation guards remain one-argument and request-only evaluations get empty facts.
Document removed exports/context properties/helper options and invalid-grant handling,
with TypeScript and JavaScript examples. Explain preserved authorization.rows,
inputFields/outputFields/related dimensions, field grammar, selection versus authority,
hydration/native support and permission-metadata behavior. Include a mechanical search
checklist plus semantic changes that search alone cannot migrate. Samples must not
use source/dist deep imports, any-casts or suppressed declaration errors as migration.

## Execution and shared verification

Implementation is now authorized. Execute in dependency order with one fresh owner
per task, no nested/concurrent agents, and a separate final independent reviewer.
The coordinator alone reconciles this shared task document.
Do not put full session IDs or host paths in shared records.

**No workspace-wide lint/build/tests, including final integration.** Only access-router,
affected access-router-deco, necessary transitive builds and benchmark scripts.
No root pnpm build/test/lint or equivalent unfiltered recursive verification. Test
scripts rebuild shared dist; all builds/tests/benchmarks must run serially. Preserve
old task records, failures, artifacts and caches; new ignored repo-local evidence only.

Commands below run from the repo root with installed dependencies. Replace
`<repo-root>` with the actual checkout before execution; placeholders are not literal
shell paths. Use an approved ignored checkout-local scratch directory when required.

- **V1:** `pnpm --filter @web-ts-toolkit/access-router... --workspace-concurrency=1 build`.
- **V2:** after V1, `pnpm --filter @web-ts-toolkit/access-router exec vitest run --config vitest.config.ts --no-file-parallelism --maxWorkers=1 <files>`;
  replace `<files>` with actual package-relative paths and record them.
- **V3:** `pnpm --filter @web-ts-toolkit/access-router test --reporter=verbose --no-file-parallelism --maxWorkers=1`,
  then `pnpm --filter @web-ts-toolkit/access-router typecheck`; full package, no filters.
- **V4:** `pnpm --filter @web-ts-toolkit/access-router-deco test --no-file-parallelism --maxWorkers=1`;
  includes its downstream typecheck and required transitive build only.
- **V5:** `pnpm exec eslint packages/access-router/src packages/access-router/test packages/access-router-deco/src packages/access-router-deco/test scripts/benchmarks`,
  changed-file Prettier and `git diff --check`. Historical whole-CHANGELOG formatting
  is not a reason to reformat unrelated entries; check only any new entry if changed.
- **V6:** `node --test --test-concurrency=1 scripts/benchmarks/access-router.test.mjs scripts/benchmarks/access-router.integration.test.mjs`.
- **V7 installed consumers:** full existing packed/export/strict-consumer/doc-example
  tests through V3, plus migration-guide fixtures. Verify root/advanced/processors
  ESM/CJS and both declarations, new/removed symbols, packed MIGRATION.md/links,
  strict Bundler/Node16/NodeNext and actual minimum/current peer workflows. Preserve
  the minimum-peer skipLibCheck distinction; no private state/test artifacts shipped.
- **V8 performance:** preserve fresh built current-default/current-active baselines,
  candidate isolated/trusted with identical dependency/lock/tooling identities, and
  post-gate rebuild byte identities. Reuse unchanged primary LIST scenarios, 100 rows,
  24 fields, 32 bytes, one client, hook concurrency 10, five warmups, 100 samples/job,
  two reversed paired rounds. All six guards at 10/100 rows, 50 samples, and bounded
  adverse repeats. Add separately labeled READ and helper-reuse/fresh-read cases;
  do not pretend the existing worker already measures them. Keep native-heavy and
  expensive-fact cases separate from ordinary baseline workloads.

Historical-version detection in benchmark tooling is permitted; runtime legacy
compatibility is not. New candidate profiles must be detected from actual shipped
declarations and verified through both model getter paths before measuring. Keep
compiler inspection outside the measured heap. Never reinterpret old six/two/fast
groups as new profiles on historical artifacts or replace old tables.

V8 checks median/p95/CPU, allocations/retained state where measurable, actual reads,
hooks/getters, hydration, denials, ordering and full response fingerprints. Keep
instrumented work counts separate from timing. The target is structural work
proportional to entry-boundary data, rows/facts and selected output, not field-count
times whole-document/grant copying. Some field evaluation work naturally scales with
selected fields. Do not infer omitted work from mode labels or invent CPU raw counters.

OAR-01 must set material-regression thresholds and the bounded repeat protocol before
candidate measurements. Require repeatable protective-default primary median/CPU
benefit versus current default, with p95/guard adverse results reviewed. Trusted must
be compared honestly with current active, not credited with already-removed work.
Fresh-helper extra reads and unused-fact computation are explicit end-to-end costs.
If gains or retained protections cannot be established, keep the relevant task open
with evidence and disposition; do not silently reinstate the old engine or declare
the migration a performance success solely because there are fewer source lines.

## Executable tasks

Priority: P1 means a release-blocking contract/ownership/performance requirement;
P2 means required integration/documentation delivery after those foundations.
Task statuses below record actual execution, not the proposed allocation alone.

### Task OAR-01: Freeze the ownership contract and fresh baseline

Status: completed
Assigned: OAR-01 architecture/baseline session (first sequential child).
Kind: investigation
Priority: P1 — removing checks is safe only after identifying their replacement boundary.
Suggested agent: architecture/baseline investigator, not final reviewer.
Dependencies: none.
Primary ownership: read-only source/caller/context inventory, new baseline evidence,
this document's resolved contract section; no runtime feature work.
Finding: current state has repeated structural checks and two authority lifecycles;
the proposed contract changes the public premises rather than proving checks redundant.
References: inspected source list above; prior FP-01/FP-05/FP-06 and PIPE evidence.
Requirements: map each authority owner/copy/native callback/context field/handle escape
to C1–C6; fix exact budget-owner and close/error/async semantics; inventory runtime,
advanced/root/data/helper/write/subdocument/deco callers. Build/preserve fresh current
default and active artifacts, declaration/export/dependency hashes, work counts and
initial paired baselines. Set V8 retention thresholds before candidate timing. Resolve
technical ambiguity explicitly; a required departure from C1–C6 needs a recorded
contract amendment, not an unannounced implementation shortcut.
Acceptance criteria: concrete before/after boundary map, complete public migration
inventory, bounded first vertical slice, baseline evidence, no unresolved design
blocker before OAR-02. Do not label the current accepted design a new vulnerability.
Verification: V1/relevant V2/V8 baseline; source/caller review and task contract audit.

Completion evidence:

- Resolved contract/context/caller/budget/lifetime inventories incorporated above;
  pre-write negative predicates and document-guard metadata dependencies explicitly
  preserved. Atomic OAR-03 cutover is a scope refinement, not a compatibility adapter.
- Scoped V1 and **206 focused tests / 5 files** pass. Fresh default/active baseline:
  **12 jobs / 1,200 requests**, unchanged three LIST scenarios/two reversed rounds.
  Six-row boolean probe preserves six hooks/144 callbacks/one read; grant copies
  **342 → 0** in existing default versus active, not a new candidate gain.
- Fresh sealed 14-output/8-declaration baseline remains ESM `33662fae…`; external
  dependency bytes/lock unchanged. Fresh closure 134 packages/3,510 files, with the
  previous 134/3,500 manifest also verified and its generated/workspace-file difference
  enumerated. All 38,924 captured incoming product/evidence identities preserved.
- Handoff `docs/task-artifacts/access-router/oar01-20261031-153820/HANDOFF.md`, `ARCHITECTURE.md`,
  `CONTRACT-AMENDMENTS.md`, `IMPLEMENTATION-HANDOFF.md`, `BASELINE.md` and sealed raw
  data. Initial evidence-fixture/audit-assumption failures preserved and corrected;
  no product feature edits, workspace-wide verification, candidate timing or owned jobs.
  No user-decision blocker; later implementation/final acceptance remain pending.

### Task OAR-02: Own actor/configuration and normalize immutable boolean facts

Status: completed
Assigned: OAR-02 authority-data implementation session (second sequential child).
Kind: improvement
Priority: P1 — establishes the replacement for repeated grant and permission copies.
Suggested agent: authority-data implementer.
Dependencies: OAR-01.
Primary ownership: `src/acl/service-authorization.ts`, configuration capture,
document grant resolution, `src/permission.ts`, hook/access public types and tests.
Finding: grants currently permit mutable rich leaves and actor/config reads can recopy
state; output field callback typing does not express its second runtime argument.
References: `resolveDocumentAuthorization`, `getAuthorizationPermissions`,
`prepareOutputDocumentAuthorization`, `GuardHook`, `DocPermissionsHook`.
Requirements: implement C2/C3 and grant/actor mutation isolation; separate field and
operation hook types; consistently pass empty facts in request-only evaluation. Share
only truly owned immutable state; no schema-identity cross-request caching. Missing/
throwing hook and invalid fulfilled return paths must remain distinct and fail closed.
Acceptance criteria: post-resolution external map mutation cannot change decisions;
all field callbacks see the same immutable stage facts without per-field full-map
copying; rich/proxy/accessor/protected/over-budget facts fail as specified; both sync/
async and embedded/target/actor controls pass. Public two-argument typing works without
casts; input/data/global behavior gains no authority.
Verification: V1/V2 grant/actor/type/boundary regressions, source typecheck, V5.

Execution handoff: the first OAR-02 child reached its usage limit with partial fact,
actor, hook/type and capture changes. New regression suite has 34 passing cases and
one pre-write fixture failure; latest source typecheck still has one service utility
return mismatch. Those are not completion evidence. A fresh sequential recovery
owner must inspect and finish the delivered changes, preserve initial logs/caches,
and rerun scoped gates before OAR-03 starts. No build/test/Mongo jobs remain.

Recovery completion evidence:

- Fresh sequential recovery completed the foundation without replacing the source/
  output engine yet. One boolean fact normalizer now covers output, pre-write and
  explicit utility lanes; immutable actual-private actor capture is shared per call.
  Added public DocumentGrants/FieldPermissionHook/FieldValidation and fixed field/
  operation typing. Raw helpers receive empty facts with zero document-hook work.
- **188 focused tests / 7 files pass**, including 100 foundation runtime/type cases
  and existing permission/capture/receiving-owner controls. ESM/CJS staged installed
  NodeNext consumers compile strict/skipLibCheck:false with separate negative fixtures.
  Scoped V1, source TypeScript, deco compilation, changed-file lint/format/diff pass.
- Tests observe one descriptor traversal of raw facts and none on owned facts across
  field reads; immutable shared fact/actor identities, negative pre-write predicates,
  related-own/embedded-shared facts and native policy exposure isolation hold.
- **18 intentional legacy-contract failures** from two unchanged suites are preserved
  with migration causes/owners, not excluded or declared passing. Later engine/test/
  documentation owners must migrate them before full integration. No final benchmark,
  full V3/V4 or release-candidate claim. Earlier interruption logs remain unchanged.
- Handoff `docs/task-artifacts/access-router/oar02-recovery-20261031-171950/HANDOFF.md` and
  `BROKEN-BEHAVIOR-LEDGER.md`; current ESM
  `51d126af84d64188a175b1db8a58f737fd9deec8b6c64964ed96510dac549005`.
  Baseline artifact/external dependency bytes/lock/task documents/old evidence
  preserved; no owned jobs. OAR-03 atomic cutover is next.

### Task OAR-03: Implement the private owned-stage READ/LIST engine

Status: completed
Assigned: OAR-03 atomic stage-engine cutover session (next sequential child).
Kind: improvement
Priority: P1 — eliminates repeated structural proof without losing receiving ownership.
Suggested agent: query-stage implementer.
Dependencies: OAR-02.
Primary ownership: `src/acl/document-authorization.ts`, `service-execution.ts`,
`output-field-filter.ts`, `output-field-policy.ts`, direct/public query execution.
Finding: copied/trusted stage and output records interleave authority validation,
snapshot equality, memo scheduling and DTO association reads.
References: StageRecord/OutputRecord, validateStageOwner, field memo, related derivation.
Requirements: atomic cutover as resolved above, including minimal live consumer/mode/
capability/context migration rather than retaining old-engine adapters until OAR-05/06;
one private stage machine and shared evaluator using C2's owned state;
cheap binding assertions at actual receiving/re-entry boundaries; per-stage decisions,
pending failures and deterministic errors; fresh stages for every independent call/
row/target/pre-post-write state. Close on success/error/late work. Keep actual rules,
short-circuit, original actor, target operation/rows and READ-origin retry behavior.
Acceptance criteria: wrong request/runtime/model/scope/access and forged/closed stages
reject; positive direct/public/root/related/embedded/retry cases pass. No full source/
grant/DTO graph traversal on each field or owner read; no cross-row or cross-request
memo, including same IDs. Work counts are actual observations, not renamed counters.
Verification: V1/V2 owner/rule/scheduling/retry/work regressions, typecheck, V5.

Completion evidence:

- Atomic live cutover delivered one private document-stage engine plus operation
  publication/poison/drain owners. Both source modes use it; new mode capture,
  immutable allowlisted diagnostics and private document-guard evaluation are live.
  Public DocumentAuthorization, child lookup/helper capability, graph certificates,
  result-keyed authority and ten live unsafe flags are removed, not kept as adapters.
- **214 focused tests / 5 files pass**, including **111 new cutover cases** and the
  retained foundation/installed ESM/CJS type controls. Direct/public/root/retry/related/
  embedded, binding/close/late-drain/no-partial-row/count, fresh-helper zero work,
  guard metadata forgery, basic modes and write/new/dedicated output controls pass.
  Scoped V1, source TypeScript, deco compilation, changed-file lint/format/diff pass.
- Root-row budget edges and before-serializer native admission are live. Getter body
  errors omit; invalid selected return/controlled admission poisons the operation.
  Necessary input/policy native normalizers remain bounded. Broader native/batching/
  isolation matrices and unnecessary-copy removal belong to OAR-04, not claimed here.
- Handoff `docs/task-artifacts/access-router/oar03-20261031-181311/HANDOFF.md` and
  `LEGACY-TEST-MIGRATION-LEDGER.md`; current root ESM
  `3c2e3232bc0be83613e80c5dd59fb520aaf0b98b71f6820692fd4398b4cdcc41`,
  CJS `e3e158677a04a255b01f2d7ca1092715fad94c1fa31aa21d32fe22f1a2f46c8a`.
  Eight declarations build without old capability/private-stage/flag declarations.
- Earlier foundation assertions are ported with their security purposes retained;
  remaining legacy deep-import/flag/context/handle suites require semantic migration
  in OAR-04–08. No full V3/V4/V7 or performance claim. Old failure logs/evidence,
  task documents, baseline/external dependency bytes and lock preserved. No owned jobs.
- User requested a pause after this task. Coordinator recorded completion and stopped;
  **OAR-04 has not started**. Remaining tasks are not cancelled or accepted prematurely.

### Task OAR-04: Publish selected output once with isolated callback boundaries

Status: completed
Assigned: OAR-04 publication/native materialization session (fresh sequential child).
Kind: improvement
Priority: P1 — output/native handling must not reintroduce budget or mutation defects.
Suggested agent: finalizer/materialization implementer.
Dependencies: OAR-03.
Primary ownership: `src/output/finalize-model-output.ts`, include/metadata/alias output,
`src/acl/trusted-output-materialization.ts`, source/view admission and output tests.
Finding: finalizer/service reconstruction and association transfers repeatedly traverse
output; native serialization can expand containers before naive size checks.
References: finalizeSingleDoc, finalizeDirectOutput, prepareWire, visitTrustedOutput;
last FP-08 permanent native fixture and denied-metadata tests.
Requirements: C4/C6 isolated/borrowed source admission feeding one engine; necessary
disposable document/getter views, selected safe construction, child-before-parent
ordering, private inputs, metadata/include publication and no post-filter authority
transfer copy. Isolate authority from diagnostics. Preserve bounded native preparation
before serializers, denied-key/value accounting, fallback single hook and poison behavior.
Acceptance criteria: no denied-data exposure through ordinary/virtual/include/populate
paths; input mutations cannot change isolated owned state; trusted source differences
are explicit; supported Date/BSON/Map/array/readonly controls pass. Oversized/deep/
depleted Code/DBRef/wire/metadata graphs fail before demonstrated unbounded value work,
without partial results or duplicate hooks. No DTO graph-transfer pass remains here.
Verification: V1/V2 finalizer/native/metadata/private-input tests and real packed native
LIST/READ probe, typecheck, V5; separate work-count comparison.

Completion evidence:

- Completed exact related/include receiver/multiplicity/depth accounting, same-root
  budget propagation, sticky poison and safe selected/native construction. Removed
  redundant hook/source/attachment/publication passes; necessary getter/private-input/
  per-parent isolation remains. No DTO certificate or construction-ledger authority.
- **524 tests / 12 full files pass**, including all 102 migrated native cases,
  50 new publication cases, 88 private-populate cases and foundation/stage controls.
  Scoped build/source TypeScript/deco compilation/changed-file lint/format/diff pass.
- Fresh packed public fixture: **16 READ/LIST HTTP cases each on current and actual
  minimum peers**, both modes, ordinary 200 and oversized Code/DBRef/denied-wire 400,
  no partial output. Exact hooks: ten document/four wire per peer run; isolated source
  failures reject before the hook. No dependency installation/change or old cache edit.
- Instrumented six-row comparisons retain 144 callbacks/read counts; isolated
  no-hook Date normalizations 18→12, shared-include 33→20; trusted include 19→13.
  These are structural observations, not candidate latency/CPU/allocation claims.
- Handoff `docs/task-artifacts/access-router/oar04-20261031-200901/HANDOFF.md` and migration ledger; ESM
  `2a307e6684f8976fcd4bcaba8661d77adb363b75fe777a6956ed206366ed0159`,
  packed tarball `d0feea01836d72fddf0ce9b28722517ae432fcded86d8731b99eb338ee7264e1`.
  Earlier evidence/task documents/baseline/134 dependencies/3,510 files/lock preserved;
  no owned jobs. Full package/peer-type matrices and performance remain later tasks.

### Task OAR-05: Remove exported output authority and define fresh helper behavior

Status: completed
Assigned: OAR-05 helper/escape migration session (fresh sequential child).
Kind: improvement
Priority: P1 — shorter authority lifetime must not be replaced by a replayable workaround.
Suggested agent: helper/result-contract implementer.
Dependencies: OAR-04.
Primary ownership: `src/interfaces/service-authorization.ts`, output contexts,
Core/Base helpers, exports, helper argument validation and callers/tests.
Finding: public results export handles whose semantics require graph identity or accept
stale trusted decisions; DTO re-entry perpetuates ownership machinery.
References: DocumentAuthorization, ServiceOutputContext, OutputFieldOptions,
normalizeOutputAuthorizationOptions, getDocumentAuthorization, graph transfer/lookup.
Requirements: C5 capability removal, C6 diagnostics separation and fresh helper contract;
no exported expiring handle replacement. Keep explicit backend output policy separate
from user facts, selection, rows and mutation authority. Remove obsolete DTO association/
membership/transfer storage after migrating every caller; retain still-needed bounded
input/policy normalizers. Reject retired controls before callbacks/persistence.
Acceptance criteria: old imports/options/context members fail type/runtime contract
tests; JSON/spreads/equal IDs/metadata cannot carry authority. Raw helpers use empty
document facts, never invoke document hooks or hidden reads, and retain explicit
scoped server output grants. Fresh normal reads resolve current document facts. Late
internal stage access rejects; necessary prepare/change/presentation work still succeeds.
Verification: V1/V2 helper/result/default/write/subdocument/forgery tests, installed
consumer negative types, typecheck, V5; observe helper versus fresh-query read counts.

Interrupted execution: the first OAR-05 child reached its usage limit after delivering
helper/control tests, scoped fixes and semantic legacy helper migrations. Its latest
focused run has **543 passing cases / 12 files**, but the new packed public helper
workflow still fails on an HTML/non-JSON response and final lint/audit/handoff gates
are unfinished. Preserve those failure logs; a fresh sequential recovery owner must
diagnose the packed failure and complete final verification. No owned jobs remain.

Recovery completion evidence:

- Helper/utility control admission fixes, exact empty-fact helper semantics and legacy
  helper-test migrations are delivered. Raw helpers have no capability/metadata-based
  authority and perform zero document-hook/DB work; negative empty-fact predicates
  are explicitly not current-document proof. Existing guard evaluates private facts.
- **543 cases / 12 full files pass**; scoped build, source TypeScript, deco compilation,
  changed-file lint/format/diff pass. Fresh packed helper/native gates execute **60 HTTP
  requests**, including emitted ESM/CJS helpers and strict positive/separate removed-
  API negative compiles. Explicit current-authority refresh adds exactly one normal
  read/hook; helpers/presentation subsets add none. All 14 packed/live outputs match.
- Packed HTML failure was expected guard 401 reaching Express's default handler;
  the fixture now passes that original error through the existing public response
  handler. No synthetic response/product workaround/new factory. Earlier failure and
  transport/fixture correction logs remain preserved.
- Handoff `docs/task-artifacts/access-router/oar05-recovery-20261031-211235-c96711/NEWHANDOFF.md` and migration
  ledger; current ESM `84ba8393a1e0c24edb19130049329fae7fa3d1553817db98aa3da3691d5499e3`.
  47,746 captured prior paths/134 dependencies/3,510 files/baseline/lock unchanged,
  no owned jobs. Full legacy/config/write/deco/docs/peer/performance gates remain later.

### Task OAR-06: Replace ten flags with two captured source-isolation modes

Status: completed
Assigned: OAR-06 complete mode/configuration/admission session (fresh sequential child).
Kind: improvement
Priority: P1 — the smaller public model must describe actual runtime behavior.
Suggested agent: configuration/admission implementer.
Dependencies: OAR-05.
Primary ownership: model/default options, runtime setters/warnings, service mode capture,
`src/validation/public-admission.ts`, option/public/wire/related tests.
Finding: ten flags and dormant prerequisites expose engine internals and multiply
lifecycles; simple renaming would not remove the complexity.
References: unsafe-snapshot-options, root model options, runtime transition warnings,
captureModelAuthorizationConfiguration and response-origin capture.
Requirements: exact C4 two-mode contract and legacy rejection; no prerequisite auto-
enabling, coercion or dormant state. Related targets retain independent model settings;
READ retries/embedded/independent calls follow the stated capture rules. Data/writes/
templates/dedicated origins do not become trusted. Remove old live option machinery,
not merely its exported names; keep retired names only in rejection/migration evidence.
Acceptance criteria: defaults/setters/default inheritance/undefined restoration and
in-flight rollback work; invalid bulk updates are atomic; logging failures cannot alter
publication. Wire/per-call/advanced/root/subquery attempts fail before work; business
fields stay inert. Mixed related modes and wrong-binding derivation controls pass.
Verification: V1/V2 complete configuration/admission/origin matrices, strict consumers,
typecheck, V5; actual both-getter mode checks.

Completion evidence:

- Complete live mode/admission/default/atomic bulk/rollback/owner-warning matrices
  delivered. Capture precedes native option work; target mode independence, READ
  retry, write-shaped isolation and both getter paths are observed through actual
  services. New/retired/inherited/non-enumerable/dotted/proxy controls reject before
  work; same-named business data remains inert. Deco preflight is private and atomic.
- **1,016 core cases / 23 full files**, **147 deco cases / 4 full files** and fresh
  packed helper/native **60 HTTP requests** pass. Scoped builds/source TypeScript,
  current ESM/CJS consumer checks and changed-file lint/format/diff pass. Six core
  option suites and one deco suite are semantically migrated with preserved originals.
- Handoff `docs/task-artifacts/access-router/oar06-20261031-xqjTWI/NEWHANDOFF.md`, migration ledger and
  `remaining-deleted-module-imports.json`; current ESM
  `a022d0435303400f8edc72914fee6aab8da954fcdf86ed3c7b4336991ea2f77c`.
  51,699 prior paths/baseline/134 dependencies/3,510 files/lock preserved, no owned
  jobs. Eighteen deleted-module mechanism suites and mixed read/list integration
  migrations remain OAR-07; no full-suite or performance acceptance claimed.

### Task OAR-07: Integrate shared contracts across all public entry paths

Status: completed
Assigned: OAR-07 sequential integration packets, mechanism migration then alternate APIs.
Kind: improvement
Priority: P2 — a query-only migration must not leave legacy authority in alternate paths.
Suggested agent: downstream/public-surface integrator.
Dependencies: OAR-06.
Primary ownership: write/new/subdocument/shared helper integration, request-only data
field callbacks, `packages/access-router-deco`, public root/advanced/processors exports.
Finding: shared field/hook/result types span operations not targeted for query speed;
deco hooks directly consume ModelDocPermissionsHook and GuardHook.
References: core-data request functionArgs; service-execution executor result types;
deco method decorators and existing service-authorization public-boundary tests.
Requirements: consistently normalize document facts and remove handle transport across
all affected callers without changing write admission/save semantics or elevating data
helpers. Preserve input/output/rows/operation/related authority distinctions, target
private policies, normal hydration and presentation. Avoid a legacy third engine.
Acceptance criteria: alternate APIs cannot restore retired flags/handles/rich grants;
old write/default/data/target security positives and negatives remain valid except
explicitly documented contract changes. All three entrypoints and both declarations
agree; changed export sets are intentional, no private stage/capture/issuer leaks.
Verification: V1/V2 affected shared/deco/public tests, V4/V5, export/strict consumers;
full V3/V7 in OAR-09 after docs and benchmark integration.

Completion evidence: both sequential packets below passed their bounded gates.
The recovery's full unfiltered diagnostic leaves only the four explicitly named
OAR-08 documentation/consumer files, not unresolved runtime failures. Full V3/V7,
performance and independent acceptance remain later gates.

Execution decomposition: OAR-06's inventory establishes that this task contains both
eighteen obsolete private-engine import suites and the broader write/data/deco matrix.
Execute the following two packets with separate fresh subagents **sequentially**;
OAR-07 completes only when both pass. OAR-08 still depends on completed OAR-07.
No 1:1 legacy case-count requirement: mechanism-only equality/flag-mask/certificate
tests may be consolidated or retired only after original cases are inventoried and
each retained security purpose is linked to concrete current tests. Save original
bytes and an explicit removal ledger. Do not remove unrelated tests, skip failures,
restore deleted adapters or substitute profile labels for behavior evidence.

#### Packet OAR-07A: Migrate retired private-engine test seams

Status: completed
Kind: improvement
Priority: P2 — enables meaningful current-engine verification without legacy adapters.
Assigned: fresh mechanism-test integration session.
Dependencies: OAR-06.
Primary ownership: the eighteen files in OAR-06's deleted-module inventory, mixed
read/list snapshot integration suites, shared test fixtures and narrow required fixes.
Finding: those suites cannot load or still assert deliberately removed authority.
References: OAR-06 migration ledger; OAR-03 stage/finalizer and OAR-04 native tests.
Requirements: inventory old cases, port distinct ownership/memo/concurrency/source/
native/selection/target assertions to the real engine, map deliberate retirements,
and remove all active test imports of deleted runtime modules without compatibility.
Acceptance criteria: migrated/consolidated mechanism coverage passes scoped V2,
source types/build/lint; every removal has a purpose/contract rationale and concrete
retained-proof reference. No full-package or alternate-API acceptance inferred.
Verification: V1/V2/V5, deleted-import and original-byte/coverage-ledger audit.

Completion evidence:

- Fourteen test files migrated; eleven pure retired mechanism files consolidated
  only after saving originals and mapping all **295 original registration templates**
  to retained named current tests or deliberate contract retirements. Coverage audit
  verifies 594 concrete proof references; no missing mappings or discovery exclusions.
- Fixed nine private own-slot initializations across four runtime files after real
  inherited-setter failures: facts/promises/memo values, poison, receivers and private
  view cannot be intercepted. No legacy adapter or new public API introduced.
- **1,545 core cases / 39 full files**, 147 retained deco cases, scoped build/source
  types/deco types/lint/format/diff pass. Zero active deleted-module/comparator imports;
  eight declarations unchanged. No full V3/V4/V7/performance claim.
- Handoff `docs/task-artifacts/access-router/oar07a-20261031-Sn6zV3/NEWHANDOFF.md`, complete catalog/migration
  ledger/proof audits; ESM `4d1fedf96f945b88ce5c64a39d842359053ec9c85fcb0882574d03a1c9b78922`.
  Original bytes/54,584 prior paths/baseline/dependencies/lock preserved, no owned jobs.
  OAR-07B alternate integration remains; OAR-07 is not yet complete.

#### Packet OAR-07B: Verify all write, data, deco and alternate entry paths

Status: completed
Assigned: fresh OAR-07B recovery owner (following interrupted alternate-API integration).
Kind: improvement
Priority: P2 — catches shared-contract regressions beyond ordinary READ/LIST.
Suggested agent: alternate-API integration owner, not final reviewer.
Dependencies: OAR-07A.
Primary ownership: OAR-07 write/new/subdocument/data/deco/public surface scope and
remaining non-documentation product-test migrations.
Finding: shared grants/contexts/types cross paths not targeted for query optimization.
References: OAR-01 caller inventory, OAR-02 pre-write exception, OAR-06/07A ledgers.
Requirements: preserve all separate authority dimensions, lifecycle/save/negative
pre-write facts, dedicated visibility errors, request-only data and deco binding;
resolve genuine regressions and migrate only intentional breaking expectations.
Acceptance criteria: scoped alternate/mutation/data/guard/deco tests and full affected
deco V4 pass; remaining full V3 failures are precisely bounded documentation/consumer
work for OAR-08, not hidden product failures. Public surfaces have no private authority.
Verification: V1/V2/V4/V5 and product-scope diagnostic full V3 as needed; final V3/V7
still reruns in OAR-09 on documented/measured bytes.

Interrupted execution: the first OAR-07B owner stopped on a usage-quota tool error.
Preserve `_tmp-oar07b-20261101-1n6yv551/` and its partial source/test migrations.
The initial full-core diagnostic registered 5,755 cases: 5,383 passed, 341 failed,
31 pending after setup failure. A subsequent related-path run passed 777 cases
across eight complete files, but write/data/guard/deco and final audits remain
unfinished. No full-runtime acceptance follows from that partial run. On the user's
renewed continuation, a fresh sequential recovery owner resumes from those concrete
diagnostics; no owned test/build/Mongo jobs remain at recovery entry.

Recovery completion evidence:

- Combined packet changes five runtime and 38 test/fixture files; no registration
  deleted or skipped. Original bytes and **457 registration templates / 1,841 concrete
  proof references** are saved with zero missing mappings. No OAR-07A retirement undone.
- Retains actual target hook-input/provenance and bounded attachment-path fixes;
  fixes presentation alias copies without denied getter reads and private guard
  decision own-slot/bound-execution checks, with saved failing-before regressions.
  No public capability, compatibility engine or deco source/type change.
- **5,662 runtime cases / 176 complete files**, **740 deco cases / all 23 files**,
  scoped builds/core+deco types/lint/format/diff and **60 fresh packed HTTP requests**
  pass. All 14 packed/live outputs match; eight core declarations remain unchanged.
- Unfiltered core diagnostic: **5,761 registered / 5,740 passed / 21 failed / zero
  pending**, plus one collection error. Remaining failures are precisely inventoried
  in `documentation-examples`, `export-contract`, `strict-consumer-types` and the
  four packed guide matrices; not a V3 pass. Offline install/artifact plumbing is
  corrected and minimum/current numeric consumer matrices pass.
- Handoff `docs/task-artifacts/access-router/oar07b-recovery-20261101-drdazhbz/NEWHANDOFF.md`, migration ledger,
  `OAR08-REMAINING-FAILURES.md` and `FINAL-SEAL.json`; current ESM
  `cccf18704c7b0415704970044f55a87c3bd3b940161d563f1dc42bd6606077ab`.
  187,546 prior paths/baseline/134 dependencies/3,510 files/lock preserved; no owned
  jobs, commits or publication. Documentation/performance/review acceptance is pending.

### Task OAR-08: Ship a complete breaking migration guide and executable examples

Status: completed
Assigned: fresh OAR-08 recovery owner after interrupted documentation/type integration.
Kind: improvement
Priority: P2 — project teams must migrate without repository-source knowledge.
Suggested agent: installed-consumer documentation/type integrator.
Dependencies: OAR-07.
Primary ownership: package MIGRATION.md/README/llms/package.json.files, public JSDoc,
website/deco guidance, export/type/doc/packed migration fixtures, new release note.
Finding: retiring flags, rich grants and handles breaks both configuration and
authorization assumptions; replacing syntax alone can broaden access or add reads.
References: C1–C6, M1–M5, ai-friendly-ts-package workflow, current publish allowlist.
Requirements: all M1–M5 before/after examples, complete removed-symbol/control inventory,
explicit security differences/native/identity/closure/non-certification limits and
rollback guidance. Typecheck/run target examples using only packed public imports;
compile expected old failures separately instead of weakening consumer assertions.
Acceptance criteria: installed consumer can configure either mode, implement hooks,
understand helper freshness, migrate a related/deco workflow and troubleshoot each
retired/invalid input without opening source. MIGRATION.md actually ships and links
resolve; CJS/ESM/type conditions match; error examples and hook/read counts are checked.
Verification: V1/V2 documentation/export/type/packed consumer suites, V5/V7; inspect
real tarball and declaration JSDoc. Do not mark done on website prose alone.

Interrupted execution: the first OAR-08 owner stopped on a usage-limit tool error.
Preserve `_tmp-oar08-7dpnxn5o/` and its partial guide, README/JSDoc, publish-staging,
consumer-test and website changes. Its initial two-file consumer run registered
91 cases: 81 passed, ten failed in the exact guide/workflow positive compiles.
Packed guide execution, deco guidance, final scoped checks and preservation/handoff
are not accepted. On the user's renewed continuation a fresh sequential recovery
owner resumes these gates; no owned jobs remain at recovery entry.

Recovery completion evidence:

- Shipped M1–M5 `MIGRATION.md`, README/llms links, full removed-control/API/error
  inventory, JSDoc, deco/website guidance and breaking release note. Nine source
  changes are JSDoc only; AST audits preserve runtime and public declaration shapes.
  Deco declaration conditions now correctly separate import/require to avoid nominal
  request-type conflicts without casts or weaker hooks.
- **175 core cases / four complete consumer/doc/export files** and **27 affected
  deco cases / three files** pass. Scoped builds/types/lint/format/diff pass. No
  known OAR-08 failure remains; full V3/V4 and V6/V8 remain OAR-09.
- Actual minimum/current peers in flattened tarball and artifact-tree layouts pass
  five strict module forms. **20 exact guide executions / 60 HTTP requests / 80 reads
  and hooks**, with presentation/raw helpers adding zero and refresh +1 read/+1 hook;
  40 separate expected-failure compiles plus strict negatives. Retained helper/native
  gates add 60 HTTP checks. Deco runs both module conditions with related isolation.
- All 14 core outputs/eight declarations/docs match installed bytes; 104 relative
  links resolve. Core tarball has 19 intended files, deco seven, no private/test leaks.
  83 original registration templates map to 85 current with no removal/skip.
- Handoff `docs/task-artifacts/access-router/oar08-recovery-20261101-16yIdWZ5/NEWHANDOFF.md`, ledger and
  `FINAL-SEAL.json`; current ESM
  `76c7019b1714d7ab312e86c51476b82006b35a2ddbb52872156dc44c0c90661d`.
  505,285 prior paths/851 archived originals/baseline/134 dependencies/3,510 files/
  lock preserved; no owned jobs, commits or publication. No performance claim.

### Task OAR-09: Measure final architecture and run scoped integration gates

Status: completed
Assigned: sequential benchmark-tooling/integration, then final measurement owners.
Kind: investigation
Priority: P1 — simplification is not proof of speed or retained protections.
Suggested agent: integration/performance verifier, not final reviewer.
Dependencies: OAR-08.
Primary ownership: benchmark declaration/profile detection and reports/tests,
new sealed before/candidate artifacts, full affected-package evidence; narrow fixes only.
Finding: the current active path already omits many copies; fresh authorization and
eager facts can offset engine improvements at application level.
References: V1–V8, OAR-01 thresholds, existing worker workloads and accepted FP evidence.
Requirements: update runner to detect actual new profiles without altering old workload
or historical-mode meanings. Run serial full scoped V1–V7 and V8 primary/guard/READ/
helper/native/fact-cost cases; verify actual callbacks, peers, declarations, fingerprints,
rows, denied fields and read counts. Seal new final artifacts and prove post-gate rebuild
identity. Preserve all failures/adverse batches and report limits, not historical parity.
Acceptance criteria: all affected gates pass on final source; repeatable default benefit
and honest trusted comparison meet preselected retention criteria. Re-entry costs are
quantified, stale public authority is absent, and the library has one live stage engine
and two modes rather than legacy aliases. A failed retention gate requires explicit
disposition before completion; do not run root workspace verification to compensate.
Verification: V1–V8, product/evidence preservation, final export/packed/rebuild audit.

Current blocker: the fixed campaign and bounded repeats completed, but **15 trusted/
old-active comparisons fail** (nine confirmed adverse, seven unstable-sign, one
overlap). All 45 isolated comparisons and all three default primary benefit gates
pass. No threshold waiver, extra sampling or optimization is inferred from those
gains. The user must choose remediation of the trusted regressions or explicit
acceptance of the documented tradeoffs/revised acceptance criteria before parent
completion and independent review. The coordinator retains the original failed gates.

Disposition update: after the coordinator recommended investigating/fixing the trusted
regressions, the user replied “yes please.” Resume that recommended remediation, not
a waiver of the failed gates. OAR-09C below owns bounded root-cause fixes and new scoped
verification; a fresh measurement owner then reruns OAR-09B against a newly named
sealed candidate. Preserve the entire original failed campaign and all fixed rules.

Current disposition required: both OAR-09C and OAR-09D bounded remediations and their
separate full fixed campaigns are delivered. The latest build still has three
confirmed adverse helper comparisons and ten unresolved-sign comparisons (one overlap,
12 failed final gates). Stop here for an explicit choice of broader helper/guard
redesign or acceptance of the documented residual costs/uncertainty before independent
review. The earlier “yes please” authorized fixes, not silent performance exceptions.

Broader-redesign authorization: the user selected option **1**, explicitly authorizing
broader helper/guard redesign rather than accepting the residual costs. OAR-09E starts
with a concrete architecture/contract review, then sequential implementation and full
scoped verification, followed by fresh measurement. Original failed gates and campaigns
remain intact; no performance waiver, workspace-wide checks or publication is implied.

Latest disposition required after OAR-09E: the broader redesign, full integration and
its fresh fixed campaign are delivered. The H4 guard adverse gate now passes under
the explicitly accepted no-DTO contract. Two H3-global batch-helper comparisons remain
confirmed adverse, and fifteen other comparisons have unresolved signs. Preserve these
17 failures and pause for explicit performance exceptions or further helper-contract/
architecture authorization. No release or independent acceptance follows automatically.

Proposal authorization: the user selected **1 — propose helper API/contract changes**.
OAR-09F below is design-only. This does not authorize implementing a new API, weakening
freshness, replacing an existing workload, accepting residual costs or changing gates.
The proposal is delivered; implementation awaits explicit user approval. OAR-09 remains
blocked and OAR-10 pending, independently of that API decision.

Implementation authorization: after presentation of OAR-09F, the user requested
**please continue**, approving the proposed API contract and bounded implementation,
tests and documentation. OAR-09F-I then OAR-09F-V run sequentially. This approval does
not change migration policy, old workloads or performance criteria, authorize timing
runs, dispose of the seventeen failed comparisons, or start OAR-10/release acceptance.
The earlier proposal-only authorization and evidence remain historical records.
The first implementation owner stopped before product changes at the demonstrated
hydrated pre-copy accounting conflict below; a contract decision is now required.

Budget-scope revision authorization: the user selected **1**, accepting the recommended
explicit revision and continuation. The **200,000 work-unit / 16 MiB payload** limits
cover router-controlled admission, staging, traversal and copies, not opaque hydrated/
native normalization internals or their dependency-owned allocations. Normalized
results must still pass router admission and debit subsequent router-controlled work
before copying. This preserves hydrated support and is **not** a total-memory,
whole-normalization work or callback-sandbox guarantee. All other approved API, row
limits, freshness, isolation, publication and verification requirements remain intact;
no dependency patch, replacement hydration engine, timing or gate change is authorized.

Performance-verification authorization: the user subsequently requested **go with the
performance-verification scope**. OAR-09G-A then OAR-09G-B below are authorized to
prepare, correctness-check and measure the current tested build. Retain every original
45-case workload / 90 comparison gate, threshold, setting, pairing, repeat and sign
rule. Measure the new batch API as a separately labeled **report-only** supplement,
not a replacement workload or a new acceptance rule. No migration-policy change,
performance exception, additional optimization, product/dependency change, publication
or OAR-10 acceptance is implied; historical failures remain visible.

Latest disposition after OAR-09G: authorized measurements and raw audits are complete.
The new e131 build passes **70/90** original gates (isolated **44/45**, trusted
**26/45**). Three comparisons have confirmed adverse metrics and eighteen have
unresolved signs, overlapping once: **20 failed gates**. All isolated primary benefits,
heap gates and fresh-read allowances pass. The report-only batch API is not generally
lower-latency than current independent helpers in this workload. Stop for explicit
targeted investigation/optimization or acceptance of documented costs/uncertainties;
no extra unchanged-artifact campaign, gate exception or OAR-10 is authorized by these
results. See completed OAR-09G-B evidence below.

Explicit user disposition and review authorization: after reviewing the reported
results and the primary LIST gains, the user requested **“explicitly accept the
documented performance costs and inconclusive results” and then move on**. OAR-09 is
complete by that disposition; OAR-10 may start in a fresh independent session.

- Scope: current tested/measured ESM
  `e131659e5cdd9f5052cd15060b498669f5e044c559b35f3abbe0780f18753f4e`,
  OAR-09G-B's 70/90 numerical result, all three confirmed trusted adverse comparisons,
  eighteen sign-unstable comparisons (one overlap), and documented report-only B1
  costs/freshness differences. No universal speedup or statistical certainty is implied.
- The twenty accepted failed comparison IDs are:
  `trusted guard/plain-narrow/10`, `trusted guard/hydrated/10`,
  `trusted guard/large-config/10`, `trusted guard/populate/10`,
  `trusted guard/virtuals/10`, `trusted guard/hydrated/100`,
  `trusted guard/large-config/100`, `trusted guard/virtuals/100`,
  `trusted read/http-id/plain-wide/100`, `trusted read/http-id/document-rules/100`,
  `trusted read/http-id/hydrated/100`, `trusted read/http-filter/document-rules/100`,
  `trusted read/http-filter/embedded/100`, `trusted read/http-filter/virtuals/100`,
  `trusted helper/H2-query/100`, `trusted helper/H2-global/100`,
  `isolated helper/H4/100`, `trusted helper/H4/100`,
  `trusted helper/H3-global/10`, `trusted helper/H3-global/100`.
  Exact metrics/signs/deltas remain in the immutable G-B reports/raw audits.
- B1 remains report-only, including its approximately 5–6% higher 100-row median latency
  than current independent helpers and higher trusted query-plus-handle comparator
  costs. This acceptance does not make the workflows authority/freshness-equivalent,
  replace H3, recommend automatic migration or create a new B1 passing gate.
- Preserve all five campaigns, original thresholds/settings/sign/repeat rules and
  failed/inconclusive raw evidence unchanged. This is an explicit acceptance exception,
  not a benchmark rewrite or permission for extra sampling/optimization.
- No correctness, security, source isolation, public capability, bound, declaration,
  documentation, identity, dependency or failed-test requirement is waived. Any newly
  discovered review defect remains blocking. No commit, publication or release is
  authorized; final review must independently verify the current bytes and evidence.

Execution decomposition: run two fresh owners sequentially to keep benchmark
implementation and long measurement runs independently auditable. OAR-09 completes
only after both packets satisfy the unchanged precommitted gates. No threshold,
workload or repeat allowance changes are authorized by this decomposition.

#### Packet OAR-09A: Integrate truthful benchmark profiles and scoped final gates

Status: completed
Kind: improvement
Priority: P1 — unsupported profiles or mislabeled workloads invalidate measurement.
Assigned: fresh OAR-09A recovery owner after interrupted tooling/integration.
Dependencies: OAR-08.
Primary ownership: benchmark runner/declaration/worker/tests/README, complete affected
package verification and a sealed candidate; no candidate timing campaign yet.
Finding: the existing runner knows only historical controls and HTTP LIST workloads.
References: OAR-01 measurement plan/gates, V1–V8, OAR-08 final seal.
Requirements: detect actual shipped modes, preserve all historical workload/control
meanings, add separately labeled READ/helper/native/fact/retention drivers and tested
work/fingerprint probes. Run full scoped V1–V7; preserve final built byte identities.
Acceptance criteria: all affected gates pass, new benchmark drivers have meaningful
tests and correctness/count probes, historical cases are unchanged, and measured
workloads/paired ordering/repeats can be executed without changing the fixed protocol.
Verification: V1–V7, benchmark smoke/correctness checks, sealed candidate manifest.

Interrupted execution: the first OAR-09A owner stopped on a usage-limit tool error.
Preserve `_tmp-oar09a-unpurw_z/` and its benchmark-tooling additions. Its full core
gate passes **5,837 cases**, full deco **742**, source/deco types and scoped lint pass;
the combined runner gate passes **41 tests**. The latest smoke runs all **180 jobs**
with zero recorded failures, but is explicitly not performance evidence. Earlier
probe failures remain saved. Final tooling audit/format/preservation, deterministic
post-gate rebuild, sealed candidate and handoff are unfinished and must be reconciled
before OAR-09B. No owned jobs remain at recovery entry.

Recovery completion evidence:

- Twelve benchmark files changed, six new. Historical fixture definitions/seeds/
  selection/rules/hydration remain byte-identical; historical ten-control meanings
  remain intact. New modes are verified through actual declarations and both model
  getter paths. Separate checked-response READ/helper/native/fact/retention families
  include actual work/fingerprint/closed-stage probes, not profile-label inference.
- Audited unchanged-product full gates: **5,837 core / 180 files**, **742 deco / 23
  files**, source/deco types and actual installed matrices pass. Final **44 runner
  tests**, scoped lint/format/diff and **180 smoke jobs / zero failures** pass. Smoke
  is explicitly not performance/retention evidence; all earlier failures preserved.
- Post-gate six-package rebuild preserves **67 outputs**; all OAR-08 product bytes
  remain unchanged. Accepted candidate/config/runbook are **only**
  `docs/task-artifacts/access-router/oar09a-recovery-ot_jqpby/final-02/FINAL-PROTOCOL.{json,md}` and adjacent
  candidate artifact/metadata. Earlier root seals/smokes are not accepted inputs.
- Handoff `docs/task-artifacts/access-router/oar09a-recovery-ot_jqpby/NEWHANDOFF.md`, final seal; candidate ESM
  `76c7019b1714d7ab312e86c51476b82006b35a2ddbb52872156dc44c0c90661d`.
  951,084 prior paths/116 archived originals, 134 dependency records/3,510 files,
  293 tool dependency records/10,545 files and baseline/lock preserved; no owned jobs.
  OAR-09B still must execute and reconcile the fixed performance protocol.

#### Packet OAR-09B: Execute fixed performance protocol and artifact reconciliation

Status: completed
Kind: investigation
Priority: P1 — default benefit and adverse costs remain unmeasured.
Assigned: fresh measurement owner using accepted OAR-09E H+G finalization inputs.
Dependencies: OAR-09A.
Primary ownership: new ignored raw timing/work/retention evidence, report and final
identity audit; narrow demonstrated fixes require a newly named artifact/batch.
Finding: passing tests and fewer traversals do not establish end-to-end savings.
References: unchanged OAR-01 PERFORMANCE-GATES.md and MEASUREMENT-PLAN.md; V8.
Requirements: run every prescribed family interleaved with sealed old baselines,
two reversed pairs and exactly two more pairs only where triggered. Preserve all
failures/adverse results, verify counts/fingerprints, quantify explicit refresh and
unused-fact costs, audit rebuild/dependency/tool identities and no owned jobs.
Acceptance criteria: fixed benefit/adverse/retention gates pass with honest limits;
otherwise OAR-09 stays open for explicit disposition, without silently moving gates.
Verification: V8 raw paired recomputation and final tested/measured artifact audit.

Delivered measurement evidence; acceptance blocked:

- The single fixed campaign completes **464 jobs / 39,800 measured responses** with
  zero job/count/fingerprint failures. Two initial reversed rounds produce 360 jobs;
  exactly two additional pairs for 26 triggered comparisons add 104. Independent
  Python recomputation verifies all raw statistics, expected hashes, order and gates;
  **75/90 comparisons pass, 15/90 fail**. Campaign exit 1 is a real performance failure.
- Isolated/default primary median latency deltas are **−54.01% / −17.5673 ms** wide,
  **−91.40% / −161.6874 ms** document rules and **−95.09% / −483.5958 ms** embedded.
  CPU deltas are −53.30%, −90.28% and −94.45%; both initial pairs improve both metrics.
  All 45 isolated comparisons pass, including preserved adverse initial observations
  resolved only through the prescribed bounded repeat protocol.
- Trusted/old-active has nine confirmed adverse comparisons: primary wide; guards
  virtuals/10, hydrated/100, populate/100, virtuals/100; H2-global, H4 and H3-global
  at 10/100 rows. H3-global/100 is **+62.12% / +17.4852 ms median**, +63.34% p95,
  +66.76% CPU, adverse in all four pairs. Seven unstable-sign comparisons remain,
  with one overlap; every initial/repeat/final metric is retained in the report.
- Raw helpers/presentation add zero reads/hooks; current-authority refresh adds one
  read/hook or one batched read/rows hooks. All six explicit refresh cost allowances
  pass. Native adapter timing is clearly zero Mongo reads/one adapter call. Unused
  facts perform exactly 100 × 10,000 iterations/request and are reported separately.
- All six held/released heap gates pass, with no demonstrated superlinear retained
  per-field graph. Actual six fact normalizations/144 callbacks at 24 fields and all
  12 closed/cleared root/embedded stages are observed; allocation counters and Mongo
  CPU remain unavailable. These passing checks do not waive trusted latency/CPU gates.
- Handoff `docs/task-artifacts/access-router/oar09b-g28ar1zl/NEWHANDOFF.md`; quantitative `REPORT.md`,
  `ALL-GATES.md`, `PAIR-DETAILS.md`, `REPEAT-ONLY-SUMMARY.md`, independent raw audits,
  `FINAL-SEAL.json` and `FINAL-CLOSURE.json` preserve the complete evidence.
- Post-campaign six-package rebuild preserves all **67 outputs** and candidate ESM
  `76c7019b1714d7ab312e86c51476b82006b35a2ddbb52872156dc44c0c90661d`.
  Unchanged-source full gates remain 5,837 core / 742 deco / 44 runner tests passing.
  1,044,052 prior paths, sealed artifacts/dependencies/tools/lock are preserved; no
  owned jobs, commits or publication. OAR-10 was not started; disposition is required.
- Coordinator reconciliation: scoped task-file Prettier check and `git diff --check`
  pass. No product, benchmark, dependency or sealed-evidence bytes changed.

Remediated measurement interruption: the first new measurement child stopped on a
usage-limit tool error during setup. Preserve `_tmp-oar09b-remediated-taoqwoom/`.
Only its cache/tool/temp directories are present at recovery inspection; no campaign
report or handoff exists, and no owned worker/Mongo/build/test jobs remain. A fresh
sequential owner must confirm no campaign already ran before launching the single
new OAR-09C-artifact campaign. Do not repeat the completed original failed campaign.

Remediated campaign delivered; fixed gates still not accepted:

- Recovery `docs/task-artifacts/access-router/oar09b-remediated-recovery-k7n4e2/NEWHANDOFF.md` and full reports
  preserve one **444-job / 38,200-response** campaign, zero job/count/fingerprint
  failures. Independent audit verifies all settings/order/initial and repeated pairs;
  360 initial jobs plus exactly 84 jobs for 21 triggered trusted comparisons.
- **81/90 gates pass**: isolated 45/45, trusted 36/45. All six previously confirmed
  ordinary query/virtual/hydration/populate/H2-global regressions now pass. Trusted
  primary LIST comparisons all pass; isolated primary latency savings are 64.23%,
  92.25% and 96.29%, with both initial pairs improving latency and CPU.
- Three confirmed adverse comparisons remain: H4 CPU **+26.69% / +0.6207 ms**;
  H3-global/10 median **+20.67% / +1.1487 ms**, CPU +23.86% / +1.6388 ms;
  H3-global/100 median **+24.98% / +7.2173 ms**, p95 +24.14% / +7.4754 ms,
  CPU +25.09% / +8.7260 ms. Six other comparisons remain sign-unstable. No waiver.
- All six heap gates and current-authority refresh allowances pass. All 67 output
  hashes match after the necessary post-gate rebuild; 1,246,615 historical paths,
  source/tools/dependencies/lock preserved, no owned jobs. Reports compare artifacts
  separately without pooling cross-time results or discarding failed campaigns.
- The user's remediation authorization continues through the bounded OAR-09D packet
  below. OAR-09B stays blocked until a newly tested/sealed remediation can be measured
  or an explicit contract/gate disposition is obtained; no unchanged-artifact rerun.

OAR-09D candidate campaign delivered; residual acceptance blocker:

- `docs/task-artifacts/access-router/oar09b-final-remediation-RJZ1phN3/NEWHANDOFF.md`, `REPORT.md`, all-gate/pair/
  initial-repeat-final tables and independent raw audits preserve one **444-job /
  38,800-response** campaign. Zero job/count/fingerprint failures; 360 initial jobs
  and exactly 84 repeat jobs for 21 triggered comparisons. No campaign discarded.
- **78/90 gates pass**: isolated **45/45**, trusted **33/45**. All three isolated
  primary benefit gates and all trusted primary LIST comparisons pass. Isolated median
  latency deltas are −63.75%, −92.41%, −96.21%; trusted primary deltas −11.20%,
  −23.02%, −24.48%, each compared with its own interleaved matching old profile.
- Three confirmed trusted adverse cases remain: H4 CPU **+27.09% / +0.6161 ms**;
  H3-global/10 CPU **+19.04% / +1.2963 ms**; H3-global/100 median **+12.85% /
  +3.6926 ms**, CPU **+15.54% / +5.5210 ms**. H3/10 median and H3/100 p95 do not
  satisfy both adverse thresholds and are not mislabeled. Ten comparisons have
  unresolved signs, including H3/10 p95; one overlap yields **12 final failures**.
- All heap gates and explicit fresh-authority read allowances pass. H4 still performs
  one read/hook and 24 callbacks; helpers add no hidden work or DTO authority. These
  correctness/retention passes do not waive adverse or sign-alignment criteria.
- All 67 outputs match after the necessary post-campaign rebuild; latest **5,869 core /
  742 deco / 44 runner** gates remain hash-verified on unchanged source. Current ESM
  `7faeb957631bd5761e8b828835f4b600634db1afa740e229549bfc4ba6a74a4f`;
  1,420,736 historical paths/artifacts/dependencies/tools/lock unchanged, no owned jobs.
  `FINAL-SEAL.json` / `FINAL-CLOSURE.json` close the packet. All three campaigns remain
  separate descriptive evidence, never pooled cross-time candidate pairs.
- OAR-09 remains blocked on explicit user disposition. No third optimization attempt,
  unchanged-artifact resampling, threshold waiver or OAR-10 has started.

Broader H+G redesign campaign delivered; current residual blocker:

- Handoff `docs/task-artifacts/access-router/oar09b-redesigned-d9T17kFx/NEWHANDOFF.md`, complete reports/raw audits
  and closure preserve **one 440-job / 37,800-response** campaign. Zero job/count/
  fingerprint failures; 360 initial jobs plus exactly 80 jobs for 20 triggered
  comparisons. Every initial/repeat sample remains, with independently recomputed gates.
- **73/90 fixed comparisons pass**: isolated **45/45**, trusted **28/45**. All primary
  LIST comparisons and all six heap gates pass. Isolated primary latency savings are
  63.67%, 92.35%, 96.20%; trusted primary savings 8.81%, 20.12%, 23.38%, against their
  own interleaved matching old profiles. No cross-time sample pooling or causal claim.
- H4 now passes: trusted CPU **+6.21% / +0.1409 ms**, median +2.98% / +0.0645 ms.
  This uses the documented hash-bound `facts-only-v1` no-DTO guard contract; normal
  reads still perform 24 callbacks. All earlier 24-callback candidate evidence remains
  truthful. It is not a claim of identical guard output effects/errors.
- Two confirmed trusted adverse cases remain: H3-global/10 CPU **+18.01% /
  +1.2266 ms**; H3-global/100 median **+14.25% / +3.9816 ms**, CPU **+15.82% /
  +5.3927 ms**, each confirmed metric adverse in all four pairs. H3/10 median and
  H3/100 p95 do not meet both adverse thresholds and are not mislabeled. Fifteen
  distinct comparisons remain sign-unstable; no tiny-effect exception was applied.
- Raw/presentation helpers add zero reads/hooks; all six explicit fresh-authority
  read allowances pass. Helper work probes retain 100 independent captures/catalogs/
  stages and 2,400 checks with no query expansion or unused callback view. These
  reductions do not silently waive the remaining batch-helper end-to-end cost.
- Rebuilt all 67 outputs match ESM
  `8a5ded622337bddd1b9ce31a95dc3a3dfb0b10e734db52c4b371c5d55cf5267e`.
  Full **5,957 core / 742 deco / 45 runner** evidence remains valid/hash-verified;
  1,627,782 earlier paths/source/artifacts/tools/dependencies/lock/user commits preserved,
  no owned jobs. Four separate artifact campaigns remain 75/90, 81/90, 78/90, 73/90;
  neither old v1 nor new v2 results are relabeled or pooled. OAR-10 was not started.

#### Packet OAR-09C: Remove demonstrated trusted-path overhead without weakening ownership

Status: completed
Kind: defect
Priority: P1 — confirmed trusted regressions prevent performance acceptance.
Assigned: fresh trusted-performance remediation owner; not the final reviewer.
Dependencies: OAR-09A. The delivered OAR-09B failed campaign supplies the finding;
its performance acceptance is not a prerequisite for remediation.
Primary ownership: narrow access-router query/helper/guard/publication hot paths and
regression/work-count tests; necessary affected-package verification and a new seal.
Finding: original OAR-09B confirms nine trusted/old-active adverse comparisons,
including 100-row global helper reuse at +62.12% median and virtual guards at +32.40%.
References: `docs/task-artifacts/access-router/oar09b-g28ar1zl/REPORT.md`, raw pairs and structural probes; C1–C6.
Requirements: profile actual redundant work, fix demonstrated causes without legacy
handles, DTO authority, cross-call decisions, extra reads/hooks or weaker immutable
actor/policy/fact/source/native/budget boundaries. Keep all benchmark workloads,
precommitted thresholds and bounded repeats unchanged. Diagnostic profiling is not a
new acceptance campaign. Save before/after work/regression proof and original bytes.
Acceptance criteria: narrow fixes have concrete work-reduction evidence and retained
security/ownership tests; full scoped V1–V7 pass on a newly sealed deterministic build.
Then rerun OAR-09B sequentially with a fresh owner/new batch; OAR-09 remains open until
that campaign passes or another explicit disposition is recorded. No gate waiver.
Verification: instrumented focused root-cause probes, V1–V7, new candidate/source/
dependency/tool manifest and post-gate rebuild identity; subsequent fixed V8 campaign.

Completion evidence:

- Eight runtime files and a new **16-case** work/ownership regression suite change;
  no existing tests, public declarations, guide, benchmark tools/workloads or gates
  change. Stage-local immutable projections and synchronous memo records remove
  redundant reads/promises; static first-key/aggregate semantics remain after a saved
  failed intermediate variant exposed overaggressive memo removal.
- H3-global/100 performs one full query capture plus **100 fresh output-only helper
  captures**, rather than 101 full captures; snapshot-node visits drop 19,848→5,351.
  No cross-call cache or DTO authority. Primitive selected construction retains exact
  budgets without graph closures; plain-wide memo entries halve. Virtual sibling views
  drop 300→200 at 100 rows with native isolation and two getters/row retained.
- Full scoped verification passes **5,853 core / 181 files**, **742 deco / 23 files**,
  **44 runner tests**, source/deco types, lint/format/diff and fresh installed V7.
  **180 correctness smoke jobs / 360 expected fingerprints** pass, not a performance
  gate. Post-gate six-package rebuild preserves all **67 outputs**.
- Handoff `docs/task-artifacts/access-router/oar09c-ckrmwpy3/NEWHANDOFF.md`, `WORK-REPORT.md`, regression/profile
  evidence and final seal. New accepted candidate/config/runbook are **only**
  `docs/task-artifacts/access-router/oar09c-ckrmwpy3/final-01/FINAL-PROTOCOL.{json,md}` and adjacent artifact/seal;
  ESM `1d3b509cbe2f34cfba076bbc10779091aef1592001914b37a700165987eea54e`.
  1,044,719 historical paths/421 originals, dependencies/tools/lock and the entire
  original failed campaign remain preserved; no owned jobs or publication.
- Residual fresh-helper and full guard evaluation costs are explicit. H4 still uses
  one read/hook and 24 callbacks; no narrowed selection or benchmark-count change.
  A fresh OAR-09B owner must now measure the fixed protocol. No original failed gate
  is waived, and no sign stability or performance acceptance follows from diagnostics.

#### Packet OAR-09D: Remove remaining fresh-helper and guard overhead

Status: completed
Kind: defect
Priority: P1 — three confirmed adverse comparisons still block acceptance.
Assigned: fresh focused helper/guard remediation owner, sequential after remeasurement.
Dependencies: OAR-09C. The delivered failed remeasurement supplies the finding;
its performance acceptance is not a prerequisite for remediation.
Primary ownership: remaining raw-helper/configuration/capture/field-evaluation and
guard costs, narrow ownership/work-count tests, full affected gates and a new seal.
Finding: H3-global per-row fresh raw checks remain +20.67%/+24.98% median at 10/100
rows and H4 remains +0.6207 ms CPU; six neutral-small comparisons have unstable signs.
References: remediated OAR-09B reports above and OAR-09C WORK-REPORT.md; C1–C6.
Requirements: identify and remove actual redundant work in these remaining paths.
Do not recover DTO authority, cache decisions across calls, weaken fresh capture,
drop field callbacks/guard selection or rewrite workloads/counts/gates. Preserve the
entire failed campaigns and OAR-09C improvements. Explain any irreducible cost with
concrete evidence rather than guessing or silently changing the contract.
Acceptance criteria: bounded demonstrated improvements with retained correctness and
ownership tests, full scoped V1–V7 passing, deterministic newly named sealed build.
Remeasure the unchanged V8 protocol only after fresh coordinator acceptance; fixed
gate failures remain blocking, with no sample fishing or independent acceptance yet.
Verification: before/after profiles/work regressions, V1–V7, new artifact identity;
subsequent fresh sequential OAR-09B campaign and raw audit.

Completion evidence:

- Five runtime paths and a new **16-case** suite remove repeated fresh-owned catalog
  indexing/density checks, quadratic projection compaction and redundant immutable
  actor-map copying in raw helpers only. Catalogs/options remain freshly captured
  per helper; no DTO authority, cross-call decisions or schema-identity cache. A broader
  actor-reuse variant failed two unchanged tests and was narrowed rather than waived.
- H3/100 full catalog walks drop **11,819→3,737**, actor-map reconstructions **101→1**;
  H3/10 walks **1,289→407**, actor copies **11→1**. H4 full walks **72→37**, while one
  read/hook and **24 callbacks** remain. Compaction work drops 57,600→240 prefix checks
  at 240 fields. Diagnostics do not establish end-to-end performance acceptance.
- Full scoped V1–V7 pass: **5,869 core / 182 files**, **742 deco / 23 files**,
  **44 runner tests**, types/lint/format/diff and actual packed module/peer/guide
  matrices. **180 smoke jobs / 360 expected fingerprints** and all eight preflights
  pass; post-gate necessary six-package rebuild preserves **67 outputs**.
- Handoff `docs/task-artifacts/access-router/oar09d-hVF7iALN/NEWHANDOFF.md`, `WORK-REPORT.md` and final seal.
  Accepted next-campaign inputs are **only**
  `docs/task-artifacts/access-router/oar09d-hVF7iALN/final-01/FINAL-PROTOCOL.{json,md}` and adjacent artifact/metadata;
  ESM `7faeb957631bd5761e8b828835f4b600634db1afa740e229549bfc4ba6a74a4f`.
  All public declarations, export sets and 13 benchmark tools remain unchanged.
- 1,247,280 historical paths/422 archived streams, both previous failed campaigns,
  dependencies/tools/lock preserved; no owned jobs or publication. H4 diagnostic
  timings still show no proven gain. A fresh fixed campaign must test the new build;
  no adverse/sign gate is silently resolved by work-count improvements.

#### Packet OAR-09E: Redesign fresh-helper and document-guard execution boundaries

Status: completed
Kind: improvement
Priority: P1 — local reductions leave persistent helper/guard overhead.
Assigned: sequential architecture owner, implementation owner and measurement owner;
none is the final independent reviewer.
Dependencies: OAR-09D. The completed failed campaign supplies the finding; performance
acceptance is not a prerequisite for this explicitly authorized redesign.
Primary ownership: private helper preparation/filtering and fresh document-condition
execution, shared stage/publication integration, affected tests/docs and new artifacts.
Finding: all three fixed campaigns retain confirmed H4 and H3-global overhead despite
local improvements. Raw helpers still traverse general query/output planning machinery;
the guard publishes a complete DTO only to consume a private fact decision.
References: latest OAR-09B report, `acl/output-field-filter.ts:filterModelOutputForHelper`,
`acl/model-output-planning.ts:captureOutputHelperConfiguration`, `acl/document-guard.ts`.
Requirements: first document a concrete design and observable contract effects. Reuse
the one private authorization engine and keep fresh call capture, immutable facts/actor,
row/operation/target separation, bounded isolated helper input and exact scope/policy.
No DTO authority, public capability, legacy engine/control, cross-call decision cache,
hidden reads/hooks or replacement benchmark workload. Preserve all published DTO field
checks. Any proposal to remove guard-only DTO construction must prove that no DTO is
published and explicitly account for hook/error/callback semantics before implementation;
do not silently drop the previously verified 24 callbacks or alter their counter.
Acceptance criteria: architecture review identifies the required work versus redundant
boundary work and a testable ownership proof; subsequent implementation has regression
and work-reduction evidence, full scoped V1–V7 and a deterministic new seal. Required
consumer/documentation changes ship. A fresh fixed V8 campaign follows, without changing
thresholds, sample counts, pair/repeat rules or historical workloads. No gate waiver.
Verification: design/caller/test review, focused adversarial/work tests, V1–V7 and new
artifact identity, followed by independent raw recomputation of fresh V8 measurements.

Architecture accepted for implementation:

- `docs/task-artifacts/access-router/oar09e-design-kTiLZtLh/DESIGN.md` and `NEWHANDOFF.md` specify two private
  consumers of the same stage/evaluator/materializer: helpers select existing admitted
  values without query-fetch expansion or a disposable view for a built-in EMPTY
  resolver; guards resolve a fresh document condition without publishing a DTO.
- This is an explicit guard contract refinement: guards retain identifier/query/row
  admission, captured actor/modes, unchanged fetch/hook-input preparation, one root
  hook, condition grammar, retry and source/fact errors. Guards do **not** run output
  field/virtual/embedded/target DTO finalization, output-only includes, metadata,
  decoration/tasks or `_read` overrides. Errors/effects solely in that omitted output
  work are no longer guard vetoes. Normal DTO reads retain every output check.
- Preserve the inspected distinction between direct request-only `_read` admission
  and the generated HTTP READ-route operation gate; do not silently add/remove an
  operation check. LIST retry and actual queried-target admission remain mandatory.
- The same H4 route/body/seed/selection/fetch/hook/condition/response and one read/hook
  remain the workload. Candidate field-callback proof explicitly becomes **0 rather
  than 24**, because no DTO is constructed. Record a new counted mechanism series,
  hash-bound artifact proof and actual untimed preflight; normal DTO controls must
  still observe 24. No thresholds, samples, paired/sign/repeat rules change, and all
  prior tools/24-callback evidence remain sealed and truthful.
- Ship the guard effect/error/override/include changes in installed migration guidance
  and public hook/guard documentation, with positive/negative/query-equivalence tests.
  No new public selector/capability or hidden refresh. Helper policy/capture, EMPTY
  semantics, isolation and every selected-value check remain unchanged.
- Design-only probes confirm 100 helpers currently perform 100 unused query expansions,
  200 compactions and 200 source views for 2,400 evaluations. The second view has no
  application consumer. Current guard output/effect probes are saved as before evidence.
  No implementation or timing acceptance follows from these observations.
- Entry matches user commit `a1996e10…`; one formatting-only committed test line-wrap
  differs from the older 09D source seal and is preserved, not reverted. Runtime,
  declarations and tool bytes still match that seal. No owned jobs remain.

Execute the following implementation packets sequentially to bound shared-file work;
OAR-09E completes only after both and full integration. No extra independent engine.

##### Packet OAR-09E-H: Implement the existing-value helper consumer

Status: completed
Kind: improvement
Priority: P1 — eliminates fetch planning and unused hook views from raw helpers.
Assigned: fresh helper-consumer implementation owner.
Dependencies: OAR-09D and accepted OAR-09E architecture above.
Primary ownership: shared output-selection extraction, private helper fact origin/
synchronous EMPTY admission, existing-value sync/async filter and focused tests.
Requirements: implement DESIGN H1–H3 with identical query plans/helper shapes and
field semantics; retain fresh capture, isolated source/native/selected budgets and
authenticated stage lifecycle. No guard/tool changes in this packet.
Acceptance criteria: retained planner/field-memo/native/helper/ownership suites pass;
actual 100-helper probe retains 100 captures/2,400 checks with no query expansion or
unused callback view. Save exact before/after evidence and originals. Full V1–V7/seal
follow in OAR-09E-G after its dependent implementation, not claimed here.
Verification: scoped build/source types, full focused planner/helper/stage/native files,
changed lint/format/diff and work/security probes; no timing campaign.

Completion evidence:

- Shared selection kernel extracted; query fetch expansion consumes the same shape.
  Authenticated helper-origin EMPTY resolution and sync-until-async existing-value
  filtering use the same stage/evaluator/materializer. Source admission remains
  isolated; selected denied/protected root charging and already-admitted async drain
  receive new regression proof, with saved failures/unhandled-rejection diagnostics.
- **27 new tests**, no existing test changes; **1,062 cases / 31 complete files**,
  scoped build/core+deco source types and changed lint/format/diff pass. **60 query
  plans** and ordered helper results match before/after; eight declarations and exact
  public ESM/CJS export sets remain unchanged. Guard implementation is untouched.
- At 100 independent helpers: 100 fresh captures/catalogs/stages and 2,400 checks
  remain; query expansions **100→0**, compactions **200→0**, source/view copies
  **200→100**, query provenance and built-in resolver promises **100→0**. All actual
  stage pointers clear. This is work evidence, not latency/CPU acceptance.
- Handoff `docs/task-artifacts/access-router/oar09e-helper-zZn7qh3h/NEWHANDOFF.md`; current intermediate ESM
  `c668ed6c179af90750691a8803b55d1ae4a72bd9db0d1280458a930a057c17e5`.
  1,421,442 historical paths, old candidate/baseline/dependencies/tools/lock and user
  committed test formatting remain preserved; no owned jobs. Full V1–V7, guard/docs/
  tool integration and the new seal remain OAR-09E-G; no full/performance acceptance.

##### Packet OAR-09E-G: Implement private condition reads and integrate the redesign

Status: completed
Kind: improvement
Priority: P1 — guard authorization should not publish and discard a full DTO.
Assigned: fresh OAR-09E-G finalization owner after interrupted recovery.
Dependencies: OAR-09E-H.
Primary ownership: shared by-ID/query/fetch prefix, exact private reader/purpose,
condition stage lifecycle, guard semantic tests/docs and versioned benchmark proofs.
Requirements: implement accepted DESIGN G1–G5 without ambient suppression escaping
to nested reads; preserve query/hook-source/target/retry admission and close/drain.
Migrate old mechanism assertions only with concrete retained-security mappings;
ship explicit semantic changes and hash-bound actual 0-callback guard proof.
Acceptance criteria: focused guard faults/async/target/budget tests and full scoped
V1–V7 pass on both implementation packets; deterministic newly named candidate and
tool seals, full correctness smoke, installed guidance and public surfaces agree.
Verification: V1–V7, query/hook before/after equality, normal DTO controls, post-gate
rebuild identity and new protocol/runbook. Fresh OAR-09B measurement follows acceptance.

Interrupted execution: preserve `_tmp-oar09e-guard-DmgmtvWS/` and its partial private
reader/execution/fetch-prefix implementation and guard tests. The first owner stopped
on a usage-limit tool error. Latest focused run is **216 passed / five failed** across
five files; failures include a malformed new sort fixture and controlled-error message
expectations. Earlier type diagnostics may predate partial corrections and need rerun.
New actual-Mongo guard integration tests have not run; docs, hash-bound mechanism
tooling, full V1–V7 and sealing are unfinished. No owned jobs remain at recovery entry.

Recovery progress (not final acceptance): preserve
`_tmp-oar09e-guard-recovery-sw7YfO16/`. It passes **5,957 core cases / 185 files**,
**742 deco / 23 files**, **45 runner tests**, source/deco types, scoped lint/format/
diff and actual packed consumers after retained initial failures. Accepted guard
semantics/docs and hash-bound `facts-only-v1` / checked-response-v2 tools are present.
Final snapshot fails declaration reconciliation for `index.d.mts`; deterministic
rebuild, complete seal, 180-job correctness smoke, preservation/migration ledger and
handoff remain unfinished. No candidate timing campaign or owned jobs remain.

Finalization completion evidence:

- The accepted exact-receiver condition reader and purpose share ordinary by-ID/
  query/fetch/hook-input preparation, then resolve a private boolean without publishing
  a DTO. Nested normal reads remain fresh DTO calls. Installed migration/README/llms,
  guard JSDoc, deco/website and CHANGELOG ship the explicit output-effect/error/override/
  include changes and direct-service versus HTTP route admission distinction.
- Full scoped gates pass **5,957 core / 185 files**, **742 deco / 23 files**, **45
  runner tests**, types/lint/format/diff and actual V7. Fresh **180 smoke jobs / eight
  preflights / 360 independently reconstructed expected fingerprints** pass; no timing
  acceptance. Post-gate necessary six-package rebuild preserves all **67 outputs**.
- New guard tests prove one query/hook, zero output callbacks/decorations, normal DTO
  controls still 24/one, query/hook-input equality in lean/hydrated modes, source/fact
  errors and actual stage close/clear. Original test purposes are mapped in a ledger;
  new suites are 27 helper, 46 guard unit and 14 actual-Mongo cases. H runtime files
  remain unchanged from first G entry, retaining helper work reductions/query plans.
- Candidate-only `facts-only-v1` is bound to the actual artifact SHA256 and untimed
  counted proof under `checked-each-response-v2`; a falsely claimed authentic old
  24-callback artifact rejects. Worker workloads/settings/gates/pair/sign/repeat code
  are audited unchanged. All three old campaigns/tools keep their v1 meaning.
- Declaration reconciliation requires no product fix: TS AST/token evidence permits
  only JSDoc/trivia, shared chunk names, private brand markers and an explicit constructor
  equal to the inherited signature; no private reader/purpose/shape/fact issuer leaks.
  Real packed outputs/docs/eight declarations match, exact public exports remain 46/48/6.
- Accepted inputs are **only**
  `docs/task-artifacts/access-router/oar09e-guard-final-ncHxXYjL/final-01/FINAL-PROTOCOL.{json,md}` and adjacent
  candidate artifact/metadata. Handoff `docs/task-artifacts/access-router/oar09e-guard-final-ncHxXYjL/NEWHANDOFF.md`,
  seals/closure; current ESM
  `8a5ded622337bddd1b9ce31a95dc3a3dfb0b10e734db52c4b371c5d55cf5267e`.
  626 copied files/579 source records/13 tools pinned; 1,625,642 historical paths and
  dependencies/tools/lock/user commits preserved, no owned jobs. OAR-09B must measure
  this new candidate; OAR-09/10 acceptance is not established by integration or smoke.

#### Packet OAR-09F: Propose an explicit collection-helper API and freshness contract

Status: completed
Kind: investigation
Priority: P1 — remaining per-row fresh-helper cost requires a consumer-level decision.
Assigned: fresh helper-API contract proposal owner, sequential; no implementation.
Dependencies: OAR-09E; its delivered measurement supplies the remaining finding.
Primary ownership: read-only public helper/caller/type/bounds review and a new ignored
proposal/handoff; coordinator records the recommendation and user decision here.
Finding: H3-global reauthorizes every already-returned row through a separate fresh
helper call. The new contract intentionally cannot reuse old document handles; all
100 captures and checks remain even after internal boundary simplification.
References: latest `docs/task-artifacts/access-router/oar09b-redesigned-d9T17kFx/REPORT.md`, public output-helper
interfaces, `Core`/`Base` helper methods, C2/C3/C5 and installed migration M3.
Requirements: compare a distinct batch output-only API, existing single-row helpers
and presentation-only reuse. Propose concrete TypeScript signatures, capture timing,
per-row decisions/isolation, collection/native/output bounds, all-or-nothing errors,
async drain and migration. No reusable public preparation/capability, DTO authority,
hidden DB/document hooks or unacknowledged loss of per-call freshness. A batch is one
explicit operation, not secretly 100 fresh independent calls. Do not conflate existing
array-valued documents with an array of root rows. Keep global/EMPTY facts separate
from document-dependent authorization requiring a normal read/list.
Acceptance criteria: a concrete recommended API and alternatives, compatibility/
semantic costs, implementation/test outline and honest benchmark disposition are
documented for user approval. New labeled batch measurements cannot erase old H3
failures, and the fifteen sign-unstable comparisons need separate explicit disposition.
Verification: focused source/caller/type review and optional bounded scratch-only
probes; no product edits, full gates, timing campaign, threshold changes or publication.

Completion evidence and recommendation (design only):

- Delivered `docs/task-artifacts/access-router/oar09f-proposal-jjv0s8q7/PROPOSAL.md`,
  `MEASUREMENT-APPROVAL-CHECKLIST.md` and `NEWHANDOFF.md`. The coordinator reviewed the
  proposal, focused source references and scoped closure before recording completion.
- Recommend one additive `pickAllowedFieldsMany<T>(rows, access, options?)` returning
  `Promise<readonly FilteredOutput<T>[]>`. Core prepends `modelName`; Base supplies the
  inherited Service/PublicService member. Reuse `OutputFieldOptions`, export the new
  conservative result type from root and `/advanced`, and add no aliases, transport
  route, public preparation/session/token or cross-call cache. Existing helpers retain
  their independently fresh semantics and existing declarations.
- One batch captures the effective actor/model/catalog/config/scope/output policy once
  before awaits or field callbacks, and owns every row source before the first field
  callback. Every occurrence retains a separate isolated source/stage/memo/EMPTY facts
  and all field evaluations; duplicate references share no decisions. Later actor-view,
  schema or option changes apply to the next call, not later rows. Capture does not
  freeze callback closures, live external state or native normalization effects.
- Proposed fixed limits: **1,000 outer positions / 200,000 aggregate structural-work
  units / 16 MiB cumulative copied/prepared payload**, in addition to the existing
  per-row **20,000-slot / depth-100** owners. Dense ordinary arrays only, bounded shared
  scheduling, stable output order and one close/drain publication group. Structural,
  native or budget poison rejects the whole batch with controlled 400 and no partial
  result; callback-body failures still omit their fields. No side-effect rollback.
- `FilteredOutput<T>` makes fields recursively optional, handles arrays/Map-to-record
  normalization conservatively, retains canonical Date/RegExp/Buffer types, and falls
  back to `unknown` for other BSON/hydrated/deep shapes. It supplies neither authority
  nor a supported-input validator. Presentation subsets usually need no helper;
  current document-dependent authority still requires a normal fresh READ/LIST.
- Scratch checks passed **three recipes / 18 type assertions against proposed
  declaration stubs only**; no shipped API, runtime or installed-consumer verification
  is claimed. Focused incoming hashes/status and evidence identities remained unchanged;
  no product edits, timing, full gates or owned jobs. Future authorized docs work must
  correct stale hook/handle prose at `packages/access-router/README.md:1422–1427`.
- No speedup is measured or promised. New `helper/B1-global-many/{10,100}` recipes
  would be separately labeled one-capture workflows, not replacements for existing H3.
  Both confirmed adverse H3 comparisons and all fifteen unstable-sign comparisons
  remain blocking. API implementation, migration recommendation, old-gate disposition
  and new measurements require their own explicit approvals; no such approval is
  recorded. Next action: user API/contract and bounded implementation decision.
- Coordinator task-only verification (repo root):
  `pnpm exec prettier --check docs/tasks/20261031-153020-access-router-owned-authorization-redesign.md` and
  `git diff --check -- docs/tasks/20261031-153020-access-router-owned-authorization-redesign.md`
  passed. No product tests or timing were rerun for this design reconciliation.

##### Packet OAR-09F-I: Implement the approved collection helper and regression coverage

Status: completed
Kind: improvement
Priority: P1 — the approved collection contract needs one bounded runtime owner.
Assigned: fresh sequential collection-helper implementation owner.
Dependencies: OAR-09F and subsequent explicit implementation authorization above.
Primary ownership: Core/Base forwarding, public result type/exports, private helper/
stage/publication/materialization admission and targeted runtime/source-type tests.
Finding: the proposed collection operation is not implemented; independent single-row
calls cannot share preparation without changing their existing freshness contract.
References: `docs/task-artifacts/access-router/oar09f-proposal-jjv0s8q7/PROPOSAL.md`, C1–C6, OAR-09F evidence.
Requirements: implement the approved one-capture, all-source-first, separate-row/EMPTY
operation through the existing evaluator/materializer. Enforce dense outer admission,
fixed collection/aggregate/payload limits in addition to existing row owners, bounded
shared scheduling, sticky all-or-nothing publication and drain/clear. Export only the
new conservative `FilteredOutput<T>` type and canonical method; preserve all existing
single-row APIs, facts-only guards, mandatory dimensions and user work. No benchmark,
dependency/lock, task-status, old-evidence, commit or publication changes by the owner.
Acceptance criteria: actual runtime tests cover captures/field counts, independent
calls, mutation/preflight, repeated references, EMPTY/scoped policy, receiver/control
admission, nullish/empty/dense/limit cases, native/aggregate/row budgets, ordering,
caught poison, drain/late work and clear. Source types exercise optional results and
both service getters/Core. No public issuer or second evaluator is added.
Verification: serialized necessary affected builds, targeted helper/stage/publication/
native/control tests, source types and changed-file lint/format/diff; retain failed
attempts and exact passing scope in a new ignored evidence packet. Full scoped gates,
installed documentation and actual packed consumers belong to OAR-09F-V.

Blocked evidence and required decision:

- `docs/task-artifacts/access-router/oar09f-implementation-ppphro5o/{NEWHANDOFF,BLOCKER}.md` records the first
  implementation attempt. The coordinator reviewed its probes and actual source
  boundary. No product/type/test/docs/benchmark change or new API was delivered.
- `prepareQueryOutputSource` in `packages/access-router/src/acl/document-stage.ts`
  calls hydrated `toObject` before `copyDocumentView` admits the normalized source.
  Canonical Mongoose normalization can copy native storage before an application
  transform discards it; the router's later ledger cannot observe or pre-debit that
  copy. Initial raw-state prescanning is insufficient because an earlier normalization
  effect can replace a later value before Mongoose performs its canonical copy.
- Three untimed investigation tests pass: one actual **17 MiB** native copy before
  a tiny admitted result; five independent existing calls observe **20 MiB** total
  native copies; and initially **1 byte** of stored payload is replaced with a
  preexisting native before a canonical **17 MiB** copy. These are specific observed
  copies, not total allocations/RSS, a batch implementation or a timing comparison.
  Command (repo root):
  `pnpm exec vitest run --config _tmp-oar09f-implementation-ppphro5o/vitest.config.ts`.
  Result: **one investigation file / three passed tests**; warnings and both probe
  runs are retained. No product builds/full gates/source types/pack checks ran.
- All **383 saved originals** and entry git status are unchanged; HEAD, lock and
  current root ESM retain their incoming identities. No owned jobs remain. F-V is
  not unblocked by these probes, and old full-gate results are not new API evidence.
- User decision needed: either explicitly scope aggregate work/payload guarantees
  to router-controlled admission/copying, excluding opaque hydrated normalization
  and its internal copies, or authorize a different supported-input/normalization
  contract capable of admission before those copies. The former preserves current
  hydrated behavior but is **not** a whole-normalization memory/work cap. Neither
  weakening the approved guarantee, silently rejecting supported hydrated inputs,
  post-copy accounting, dependency patching nor a replacement hydration engine is
  authorized by the implementation request. No such change has been made.

Blocker disposition: the subsequent user choice **1** approves the scoped-budget
revision above. A fresh sequential implementation owner resumes F-I under that
contract. Keep the original proposal, blocker and three probes unchanged as historical
evidence. Account explicit router-owned work/copies without hiding them inside the
normalization exclusion; validate/admit normalization results before subsequent owned
copying. Tests and shipped guidance must prove/disclose the exclusion rather than
claiming a cap on Mongoose/native normalization internals or arbitrary callbacks.

Completion evidence under the approved revision:

- Handoff `docs/task-artifacts/access-router/oar09f-implementation-scoped-dk9f56lo/NEWHANDOFF.md`, incoming-relative
  diff and identities record **24 paths / 18 modified originals / six new files**.
  Core/Base implement the one canonical inherited method, and root/advanced expose
  the conservative type. No public issuer, alias, route, second evaluator/normalizer
  or DataService helper is added; inherited H+G and single-row purposes remain.
- One configuration/catalog capture serves 1/10/100-row calls; the 100-row all-function
  fixture retains **100 independent sources/stages/memos / 2,400 callbacks**. All
  sources precede the first field predicate. Tests cover duplicate native isolation,
  next-call freshness, scoped/EMPTY rules, strict receiver/control/array admission,
  scheduler reentry/order, caught poison, drain/late work and actual cleared state.
- Actual helper calls reach **exactly 200,000 router work units** and **exactly
  16 MiB router payload**; the next unit/native byte rejects. UTF-8/native/source/
  output/config/rule/path/memo preparation is admitted before explicit router copies.
  Existing row 20,000/depth-100 owners persist. Hydration regressions expressly permit
  opaque 17 MiB copies discarded before tiny normalized input, but reject oversized
  normalized returns before the next explicit router copy. This is not an RSS cap.
- Necessary affected builds, source types, changed-file lint/format/diff pass. Final
  targeted run passes **772/772 tests / 15 files**, including **76 new cases**. Strict
  local declaration fixtures pass 14 type equalities and 15 intended negative checks;
  these use the existing skipLibCheck setting, not the future strict installed matrix.
  Runtime export sets remain **46/48/6** with new root/advanced types in both DTS forms.
- Failed source/fixture/observer/strict-internal attempts and a failed worker-OOM run
  remain in the packet; corrected large-Buffer observation retains boundary purposes
  without changing heap/product limits. Final passing checks are on delivered bytes.
  Focused preservation verifies 2,184 unique records with exactly 18 authorized
  overlays, no outside changes/missing originals, unchanged lock/user HEAD/old packets
  and no owned jobs. No installed docs or benchmark files changed in F-I.
- Current core ESM is `a4534cf36ec1dad15adb68459aba285b1509118deed262accdfca53d76493e51`,
  not a deterministic final seal. Actual installed Mongoose is **9.11.4**; old current
  peer evidence at 9.8.0 is not relabeled. F-V must run full current affected gates,
  actual installed matrices/docs and a new tested seal. No timing or acceptance claim.

##### Packet OAR-09F-V: Ship collection-helper guidance and verify the affected artifact

Status: completed
Kind: improvement
Priority: P1 — installed declarations, examples and runtime must agree after approval.
Assigned: fresh sequential docs/packed-consumer integration owner, not OAR-10.
Dependencies: OAR-09F-I.
Primary ownership: installed README/MIGRATION/llms/JSDoc/CHANGELOG, corresponding website/
deco guidance where needed, executable public examples, actual pack/type/consumer
assertions and affected integration gates. Narrow implementation fixes only if needed.
Finding: proposal stubs are not installed-consumer evidence; current README also retains
obsolete raw-hook/handle claims at its helper-default paragraph.
References: OAR-09F proposal sections 6–8, public package exports, shared V1–V7.
Requirements: document the optional API's one-operation freshness, bounds, conservative
types, scheduling/failure grouping and no-document-authority limits. Preserve ordinary
presentation projection and fresh normal READ/LIST alternatives; do not recommend this
as a default migration or substitute it for H3. Correct stale prose, retain guard
refinement and all old performance evidence. Verify real root/advanced/processors
ESM/CJS declarations/exports and strict minimum/current peer/module consumers. Seal
new tested bytes separately without claiming the old measured seal covers the API.
Document the subsequently approved router-controlled budget scope and explicit opaque
normalization exclusions; the original unqualified pre-copy proposal is superseded.
Acceptance criteria: affected core/deco checks, types, changed-file lint/format/diff
and actual installed consumer/migration recipes pass; deterministic necessary rebuild
and isolated evidence identify exact tested bytes and no private export/job leakage.
OAR-09 stays blocked and OAR-10 pending; no new timing/workload/gate changes occur.
Verification: serialized scoped V1–V7 and untimed operation-count/lifecycle evidence;
no workspace-wide verification or performance campaign. Coordinator reconciles results.

Completion evidence:

- `_tmp-oar09f-integration-ut0vgb6y/` preserves the interrupted integration's work and
  all failed/passing attempts. Recovery handoff
  `docs/task-artifacts/access-router/oar09f-final-hh7rwm51/NEWHANDOFF.md`, `GATES.{json,md}`, `DOCS-COVERAGE.md`,
  `FINAL-SEAL.json`, `PACKET-SEAL.json` and `CLOSURE.json` complete finalization.
  Actual F-V delta versus F-I entry is **18 paths / 15 modified originals / three new
  consumer fixtures**; recovery made no product edits or redundant full-suite repeats.
- Installed README/MIGRATION/llms, CHANGELOG, Core/Base/type JSDoc, deco/site guidance
  teach the optional one-capture method and conservative type. Obsolete raw-hook/
  retained-handle prose is corrected. All seven previous exact migration TS blocks
  remain, with three new executable raw-batch/presentation/fresh-LIST alternatives.
  The approved opaque-normalization exclusion is explicit, not a total-memory cap;
  no automatic migration, current-document proof, H3 replacement or speedup is claimed.
- A genuine F-I field-catalog regression exposed by the first full run was fixed:
  direct native split call sites/order/errors are preserved while buffers remain
  pre-admitted. The original regression/oracle was unchanged. Final current-byte
  checks pass **827 targeted / 16 files**, **6,046 core / 187 files**, **742 deco /
  23 files**, **45 runner tests**, source/downstream types and scoped lint/format/diff.
  Full core includes all 76 many-helper cases. Earlier failures remain historical,
  including initial 6,045/6,046 and corrected consumer/auditor observer assumptions.
- Actual installed V7 passes **four peer/layout matrices × five compiler conditions**:
  tarball and real assembled tree, minimum Express 5.0.0/Mongoose 8.0.0 with documented
  skipLibCheck=true, current Express 5.2.1/Mongoose 9.11.4 with false. Both ESM/CJS
  forms, Bundler/Node16/NodeNext, all 14 core JS/declaration outputs/eight declarations
  and shipped docs match actual tested bytes. The distinct tarball/assembled layouts
  each contain 19 intended files; no private/test/source surface leaks. Runtime export
  sets remain **46/48/6**, and new result/type/member JSDoc is present in both DTS forms.
- Saved consumer records prove **20 original-guide + 20 collection executions**,
  **80 HTTP outcomes / 160 reads / 240 document hooks** from explicit normal queries;
  raw helpers add zero reads/hooks. Named collection workflows observe 80 independent
  raw calls versus 40 Many calls, with no presentation helper work; these are call-site
  counts, not allocation/capture instrumentation. Unit tests supply actual capture/
  isolation proof. Sixty negative compiles retain 1,440 source-only diagnostics and
  reject all 16 new invalid statements in all 20 matrix/condition combinations.
- Finalization audits a post-gate **609-file source snapshot**, with chronology/diff/
  installed-byte support rather than inventing a pre-run seal. A fresh serial necessary
  six-package rebuild reproduces **all 67 dist-tree files byte-for-byte**. Current core
  ESM is `e131659e5cdd9f5052cd15060b498669f5e044c559b35f3abbe0780f18753f4e`;
  the seal is explicitly **NOT_MEASURED**, not a release/benchmark protocol. Coordinator
  independently rehashed all 609 source and 67 dist records plus 16 seal bindings before
  this task-only status reconciliation; sealed snapshots/evidence remain unchanged.
- Focused preservation covers 606 earlier originals, all 609 recovery-entry files,
  545 protected evidence records and 13 unchanged benchmark files, with explicit scope
  rather than a universal historical/cache/dependency audit. User HEAD/lock/inherited
  work and every failed attempt are preserved; no owned jobs remain. Coordinator task
  notes after sealing are not product edits or new passing test evidence.
- OAR-09 remains blocked: the latest **measured old build** still has two confirmed H3
  adverse comparisons and fifteen sign-unstable comparisons. The new build was not
  measured, no old workload/gate was replaced or waived, and no B1/180-job/timing run,
  migration-policy change, OAR-10 independent acceptance, commit or publication occurred.

#### Packet OAR-09G-A: Prepare truthful performance verification for the batch build

Status: completed
Kind: investigation
Priority: P1 — the tested build has no valid measurement protocol or batch comparator.
Assigned: fresh sequential benchmark preparation/correctness owner, not timing owner.
Dependencies: OAR-09F-V.
Primary ownership: additive benchmark tooling/tests/guidance, untimed correctness/work
proofs, new isolated runnable candidate/dependency/tool seals and predeclared runbook.
Finding: the current tested core ESM is
`e131659e5cdd9f5052cd15060b498669f5e044c559b35f3abbe0780f18753f4e`;
the F-V integration seal is explicitly NOT_MEASURED and cannot reuse the old 8a5
candidate protocol. Existing H3 still means N independent fresh helpers, not Many.
References: F-V handoff/seals, original OAR-01 PERFORMANCE-GATES/MEASUREMENT-PLAN,
OAR-09F approval checklist, current 45-case checked-response-v2 runner and H4 contract.
Requirements: preserve all old workload/gate/worker meanings. Add separately named
`helper/B1-global-many/{10,100}` report-only raw-only and query-plus-helper workflows,
comparing actual current independent raw calls, actual old raw global-only calls with
no hook, and old query-plus-handle flow as distinct labeled comparators. There is no
historical Many API to invent. Predeclare matrix, seed/output/count checks and bounded
pair/repeat settings before timing; keep initial query costs and freshness differences
visible. Any numerical threshold flags on B1 are descriptive, not new pass/fail gates.
Prove one versus N captures without skipping N row checks; retain an untimed all-function
control separately from timed string/global-only rules. Validate full output fingerprints,
DB/hook/virtual counts, ordering, actor binding, EMPTY facts and actual stage clear before
timing. Keep approved router-budget scope and accepted H4 no-DTO semantics unchanged.
Acceptance criteria: new candidate bytes match the tested F-V product/docs/tests and
all 67 outputs; original baseline/dependencies/binaries are reverified, fresh metadata
binds H4 count contract to the actual current ESM, supplemental tools/tests/correctness
and original runner tests pass, and an exclusive runbook accurately distinguishes all
old gates from report-only B1. No product edits or final timing campaign by this owner.
Verification: affected benchmark tests/lint/format, bounded correctness smoke and actual
untimed capture/count/lifecycle probes; reuse unchanged current product V1–V7 evidence
only with hash/identity proof. No workspace-wide checks or old evidence/cache writes.

Completion evidence and accepted measurement inputs:

- `docs/task-artifacts/access-router/oar09g-prepare-sb2406vf/NEWHANDOFF.md`, `EXACTREADYPROTOCOLS.md`,
  `DESIGN/PERFORMANCE-SCOPE.md`, plans, audits and seals deliver preparation only.
  Source delta is six additive batch benchmark files and benchmark README additions;
  all 12 incoming benchmark code/test files and the entire old README prefix remain
  byte-identical. Product/package/docs/tests, user work, lock and old evidence are intact.
- **54/54 runner tests** pass (45 original + nine new), along with scoped lint/format/
  diff, **180 original correctness jobs / eight preflights**, **32 B1 correctness
  jobs** and independent calculation of full expected responses/counts/order/hydration/
  raw summaries. Fifty untimed copied-artifact observations directly inspect capture,
  stage/source/memo independence, actual clear, poison/drain and normalization scope.
  These smoke/probe results are not performance or retention acceptance.
- Many versus independent 100-row calls observes **one versus 100 catalog/config
  captures**, with 100 source/stage/memo owners and 2,400 business checks in both.
  Separate all-function async controls retain 2,400 callbacks; observed explicit
  Promise constructors are 4,800 versus 4,800 and Permission-map constructions one
  versus one. Binding/receiver literals are two versus 200. These are seam counts,
  not total allocations or assumed implicit Promise/actor-map speedups.
- B1's immutable report-only plan has **16 comparisons / 64 initial jobs / 128 max**:
  10/100 rows, raw-only versus full initial-query workflows, both current modes,
  matching current-independent and actual historical raw/query-handle comparators.
  Same 24 fields/32 bytes/one client/hook concurrency 10/five warmups/100 samples,
  two reversed pairs and exactly two further pairs on predeclared descriptive
  sign/absolute-material flags. It has **zero acceptance gates** and cannot replace H3.
  Original 45 cases / 90 gates / 360 initial jobs and all fixed rules are unchanged.
- Accepted current ESM remains
  `e131659e5cdd9f5052cd15060b498669f5e044c559b35f3abbe0780f18753f4e`.
  `candidate-metadata.json` binds actual `facts-only-v1` under checked-response-v2,
  681 copied files/48 links, **614 source / 19 tool pins**, all 67 F-V outputs and
  full original 134-package/3,510-file plus 293-package/10,545-file tool identities.
  Only the shared coordinator task is excluded from measured source pins and is
  separately protected. Actual original benchmark Mongoose is already 9.11.4.
- The coordinator read the plan/runbook and reran read-only `verify-ready.py`: all
  614 source/19 tool/681 artifact/48 link/67 dist/39 seal bindings and 5,055 packet
  entries validate, with 191 focused protected old evidence records unchanged.
  Current F-V 6,046 core/742 deco and installed matrices retain their byte linkage,
  not invented reruns. No final campaign or owned jobs remain; all failed authoring/
  capability/observer/binary-shim attempts are retained with corrected final evidence.
- Use **only** this packet's `ORIGINAL-PROTOCOL.json` and `B1-PROTOCOL.json` with
  `EXACTREADYPROTOCOLS.md` for fresh G-B execution. Metadata SHA256 is
  `3d08714129ed5e0996628648a2cdf000681ac62805bb2675e131503b8cd8fb5c`;
  both config files have SHA256
  `b7f12a2af8e409a9be5e65e1784fffd2bd9021859b7f54426cdd6f330adbef83`
  but invoke different fixed original/report-only CLIs. No new final timing,
  migration/gate disposition, optimization, OAR-10 or release acceptance is delivered.

#### Packet OAR-09G-B: Measure and independently audit the new sealed build

Status: completed
Kind: investigation
Priority: P1 — measurements, not API naming or test counts, determine performance status.
Assigned: fresh sequential measurement/raw-audit owner after G-A reconciliation.
Dependencies: OAR-09G-A.
Primary ownership: one fixed original campaign, separately predeclared report-only B1
measurements, independent raw reconstruction, preservation/rebuild evidence and reports.
Finding: the latest historical measured build passed 73/90 with two confirmed H3 adverse
comparisons and fifteen sign-unstable comparisons; the new build has not been measured.
References: accepted G-A runbook, original fixed gates and all four preserved campaigns.
Requirements: run the original full 45 cases/four profiles/two reversed rounds once,
with exactly the permitted additional pairs at unchanged settings on triggers. Run B1
separately under its predeclared descriptive protocol. Retain all samples/failures,
actual counters, fingerprints and paired CPU/median/p95 deltas; do not pool across
campaigns, subtract query p95, discard adverse runs or increase samples after seeing
results. Audit raw data independently of benchmark-module calculations. No source/tool/
dependency/build changes during timing, no automatic optimization or additional campaign.
Acceptance criteria: all planned jobs/correctness/identity/rebuild evidence is reconciled,
original 90 gate results and each B1 comparator are reported separately, actual residual
failures/sign uncertainty remain blocking without explicit disposition, and no owned jobs
remain. B1 cannot erase old-H3 failures or grant document authority. OAR-10 stays pending
until the original requirements or explicitly approved dispositions are actually satisfied.
Verification: predeclared foreground serial protocol, independent raw audit, exact source/
dist/artifact/dependency/tool/runtime preservation and necessary six-package deterministic
post-gate rebuild only; no workspace-wide checks, commit, publication or gate changes.

Completion evidence — measurement delivered, performance acceptance failed:

- `docs/task-artifacts/access-router/oar09g-measure-x_sev0qz/NEWHANDOFF.md`, `REPORT.md`, `ALL-GATES.md`, both
  paired-detail/raw-audit sets, historical/former-fifteen tables and final seals
  preserve exactly **one original campaign / 456 jobs / 39,200 responses** and
  **one B1 supplement / 124 jobs / 12,400 responses**. Original repeats are 96 jobs
  for 24 triggers; B1 repeats are 60 jobs for 15 descriptive triggers. All original/
  repeated samples remain. Zero job, missing-job, count/fingerprint/hydration/getter
  or identity failures; original exit 1 correctly means failed performance gates.
- Independent Python calculations, importing no benchmark calculation module,
  reconstruct all expected full response hashes, raw CPU/median/nearest-rank p95,
  settings/order/repeat triggers and all **90 unchanged original gates**. This is
  independent calculation by the measurement owner, not OAR-10 independent review.
  **70 pass / 20 fail**: isolated 44/45, trusted 26/45. Three confirmed-adverse and
  eighteen sign-unstable comparisons overlap once. All primary isolated benefit,
  six heap and six explicit fresh-authority read allowances pass.
- Confirmed trusted adverse results: `guard/virtuals/100` median **+15.87% /
  +2.7914 ms**, p95 **+17.51% / +3.6618 ms**; `helper/H3-global/10` CPU **+19.48% /
  +1.7608 ms**; `helper/H3-global/100` median **+25.12% / +8.5167 ms**, p95 **+27.41% /
  +10.6866 ms**, CPU **+26.32% / +10.9531 ms**. H4's accepted facts-only semantics
  remain; both modes now fail only sign stability, not confirmed material regression.
  Former fifteen IDs are reconciled individually without relabeling old samples.
- B1 retains **zero acceptance gates**. At 100 rows, Many versus current independent
  helpers is **+6.20% isolated / +5.20% trusted raw median latency** and **+5.52% /
  +5.39% query-plus-helper latency**. CPU is lower by **5.23% / 6.46% raw** and
  **2.20% / 2.82% query**; ten-row results are mixed and CPU is not uniformly lower.
  Versus actual historical raw helpers, Many median is 76–84% lower; versus old
  query-plus-handles it is lower in isolated mode but **+19.31% / +41.59% trusted
  latency** at 10/100 rows. These distinct freshness/authority workflows are not
  equivalence, a universal speedup or a default migration recommendation.
- Fresh actual preflight/counter proofs retain one versus N captures with independent
  row checks/clear; all-function controls retain 2,400 callbacks and observed explicit
  Promise/map counts, not inferred total allocation reductions. Raw helpers add zero
  reads/hooks; explicit current-authority READ/LIST costs are disclosed. No component
  p95 arithmetic, cross-campaign pooling, sample discard or noise exception occurred.
- Current measured ESM remains
  `e131659e5cdd9f5052cd15060b498669f5e044c559b35f3abbe0780f18753f4e`.
  A necessary serial six-package rebuild after both campaigns reproduces **all 67
  outputs exactly**. Source/tool/artifact/link/baseline/dependency/runtime/lock and
  protected old evidence match all four identity boundaries. Current F-V 6,046 core/
  742 deco/installed matrix proof remains unchanged-byte evidence, not fresh reruns.
  No product/tool/dependency edits, optimization, task edit, commit or publication by
  the measurement owner. Failed audit-authoring evidence is retained; no owned jobs.
- Coordinator reconciliation reverified **2,518 packet files / seven links / 67 seal
  bindings / 67 current outputs**, plus the accepted read-only full G-A verifier.
  Only subsequent coordinator task notes differ from protected measurement-entry
  prose, excluded explicitly from measured product pins. Five separate original
  campaigns remain **75/90, 81/90, 78/90, 73/90, 70/90**, not pooled causal pairs.
  OAR-09 remains blocked on explicit disposition; OAR-10 is still pending.

### Task OAR-10: Independently accept ownership, public changes and migration evidence

Status: completed
Kind: investigation
Priority: P1 — deliberate breaking contracts still require independent security review.
Assigned: fresh independent reviewer, not any runtime implementer, integrator or measurer.
Dependencies: OAR-09.
Primary ownership: read-only source/diff/public/packed/migration/measurement review,
new focused adversarial fixtures; implementers fix findings sequentially.
Finding: fewer traversals can either remove redundant work or remove a protection;
the distinction must be established against the new contract and honest migration.
References: C1–C6/M1–M5, all task acceptance, actual baseline/candidate code and raw data.
Requirements: verify ownership replacement, exact receiving/root/target boundaries,
immutable facts and actor, callback/native/budget/error/late-stage behavior, raw-helper
limitations, absence of public capabilities/aliases/extra engines and installed migration
instructions. Audit actual full gates and independently recompute timing evidence;
run proportionate focused/packed adversarial checks, not redundant workspace suites.
Acceptance criteria: findings resolved or explicitly blocking, all intentional changes
documented without claiming blanket security equivalence, final bytes match reviewed/
tested/measured artifacts, no private/test surface shipping or owned jobs. Reconcile
statuses only after required verification; no implementation claim from this plan alone.
Verification: independent source/diff/evidence/consumer review, relevant V2/V5/V6/V7,
raw V8 audit; report retained risks and unmeasured application behavior.

Review-entry disposition: OAR-09 is complete under the explicit user acceptance above,
not a claim that the twenty numerical misses disappeared. Review correctness/security,
public/installed contract agreement, measurement honesty and identity as mandatory;
report performance exceptions as retained limitations rather than reopening them as an
unapproved optimization or timing campaign. Reviewer edits only new ignored fixtures/
evidence, not product/task/old packets; implementation owners resolve any findings
sequentially, with independent re-review before completion.

Independent review delivered — documentation blockers, not performance:

- Interrupted reviewer evidence `_tmp-oar10-review-DulhqHnt/` is preserved. Fresh
  independent finalization `docs/task-artifacts/access-router/oar10-final-x4mMa3Th/{REVIEW,NEWHANDOFF}.md` reports
  **F1/F2, P2 required-documentation blockers**; no product fix or task edit was made.
- F1: live `packages/access-router/README.md:251–252,1390–1391,2384` promises output
  handles/same-execution retained decisions, with related terminology at line 3202.
  These statements ship byte-identically in actual package layouts and contradict
  removed public capabilities plus raw-helper EMPTY/fresh-query semantics (C5/M3).
- F2: `packages/access-router/README.md:1545–1546` says request-only data field
  callbacks receive only permissions. Actual callbacks receive permissions plus
  frozen EMPTY facts; operation GuardHook remains separately one-argument (C3/M5).
  Neither finding is a demonstrated runtime bypass or an accepted performance issue.
- Fresh reviewer checks pass **26 packed public-API/real-Mongo tests**, **405 focused
  source cases / four complete files**, and five strict installed compiler conditions
  with 13 equalities/18 negative statements each. Fresh independent raw calculation
  reproduces 456 original jobs/39,200 responses, 70/90 and exactly the twenty accepted
  IDs, plus 124 B1 jobs/12,400 responses with zero acceptance gates. All numerical
  failures remain preserved and accepted at the disposition layer only.
- Current reviewed/tested/measured ESM remains
  `e131659e5cdd9f5052cd15060b498669f5e044c559b35f3abbe0780f18753f4e`.
  Entry/exit preserve 1,999 source files, 67 dist outputs, 69 status paths and focused
  earlier/reviewer evidence. No owned jobs or product edits. Full prior gates/matrices
  are audited reuse, not new full-suite/registry runs or security certification.
- OAR-10 remains in progress while a separate owner corrects the mandatory guidance
  and adds focused regressions/actual packed-doc verification. The independent reviewer
  must then re-review those changes; accepting performance does not waive F1/F2.

#### Packet OAR-10-D: Correct shipped handle and data-callback guidance

Status: completed
Kind: defect
Priority: P2 — installed consumers receive contradictory authorization instructions.
Assigned: fresh sequential documentation-remediation owner, not the reviewer.
Dependencies: delivered OAR-10 findings F1/F2; parent review completion is not required.
Primary ownership: `packages/access-router/README.md`, focused documentation/data-field
callback regression tests and new isolated packed-document/evidence identities.
Finding: the exact live prose and impact are recorded above and in the independent
`docs/task-artifacts/access-router/oar10-final-x4mMa3Th/REVIEW.md`; public implementation/types already disagree.
Requirements: replace live retained-handle promises with private stage/ordinary DTO/
fresh-query guidance, preserving labeled historical examples and unrelated semantics.
State original-request `this` and `(permissions, EMPTY facts)` for request-only data
field callbacks, retaining the separate one-argument operation guard. Audit remaining
live README references and add focused positive/negative prose/runtime/type coverage.
No runtime/declaration, performance, contract, dependency/lock, old evidence, task-status,
commit or publication changes by the owner. Preserve all incoming user work.
Acceptance criteria: exact F1/F2 statements and equivalent live contradictions are
corrected; actual newly packed README and public callback behavior/types agree. All
67 runtime/declaration/guide dist files and e131 ESM stay unchanged. New docs/test-only
identities are recorded separately without rewriting old tested/measured artifacts or
claiming that old README hashes certify the corrected prose.
Verification: focused complete affected documentation/data callback tests, new packed
docs/type/runtime checks, scoped lint/format/diff and explicit unchanged-runtime/source
delta audit. No full 6,046/742 rerun, timing or workspace-wide checks without a material
reason; mandatory independent re-review belongs to OAR-10-R.

Implementation evidence (not finding closure):

- `docs/task-artifacts/access-router/oar10-docfix-oig00aqf/NEWHANDOFF.md`, incoming-relative diff and doc-only
  seal record exactly **one modified README + one new focused test file**. Six live
  prose locations now describe private ownership/ordinary DTOs, raw EMPTY/fresh-query
  semantics, target-private construction, publication and the two-argument data field
  contract versus one-argument operation guards. A 37-match inventory retains valid
  historical/rejection/configuration/private-reuse references without blanket deletion.
- **24/24 focused tests** pass: five positive/negative prose regressions, 18 actual
  data helper/alias paths and one operation guard. Before-fix evidence retains five
  prose failures. Fresh actual packed verification passes **7/7 tests**, including
  both ESM/CJS callback paths and real-Mongo isolated/trusted replay/fresh-query controls.
  Five strict installed compiler conditions pass eight equalities and five intended
  unsuppressed negative statements each. Scoped lint/format/diff pass.
- A newly production-transformed actual 19-member tarball differs from the previous
  e131 package **only in README**; the other 18 members, all 14 JS/DTS/eight declarations,
  MIGRATION/llms/license/manifest remain byte-identical. Current source/tar/extracted
  README SHA256 is `aff3e416addae22e65a80150f8279fe38ed15436062d50f581979d40902c1c46`.
  Old and intermediate document/package hashes remain preserved, not certifications
  of corrected prose. No runtime/declaration/build/timing change occurred.
- Exact source-delta/new 615-pin doc-only evidence records one intentional README
  difference against the old 614 measured pins plus the additive regression test.
  The old verifier is not falsely claimed current after that documentation correction.
  All 67 dist outputs, e131 runtime, lock, task and 1,998 other incoming records remain
  unchanged; 10,786 protected prior evidence records are intact. Failed setup/fixture/
  inventory/audit attempts and canonical-normalization versus callback-test distinctions
  remain explicit. No owned jobs. Independent review must still close F1/F2.

#### Packet OAR-10-R: Independently re-review corrected installed documentation

Status: completed
Kind: investigation
Priority: P1 — blocking findings cannot be closed by their implementer.
Assigned: independent reviewer, never the OAR-10-D implementation owner.
Dependencies: OAR-10-D and the delivered OAR-10 review/evidence above.
Primary ownership: read-only correction diff/prose/public types/runtime/packed-doc
evidence review, new proportionate probes and final review/identity/closure report.
Finding: F1/F2 block final acceptance despite passing runtime checks; correcting prose
must not restore removed capabilities or conflate data field callbacks with guards.
Requirements: independently verify each resolution and remaining live README guidance,
actual newly packed docs, regressions and exact approved docs/test-only deltas. Reuse
the previous independent source/raw/type/runtime review with explicit byte/evidence
linkage; no relabeling numerical misses, old docs or recorded checks as new passes.
Acceptance criteria: no unresolved blocking finding within the reviewed scope; exact
reviewed code matches e131 tested/measured bytes and corrected installed documentation.
Report accepted performance limitations, normalization/trusted-code non-promises and
review coverage limits; no security certification or commit/release authorization.
Verification: proportionate focused/packed checks plus hashes/actual recorded results,
preserved old evidence and no owned jobs. Coordinator alone reconciles OAR-10 status.

Independent completion evidence:

- `docs/task-artifacts/access-router/oar10-rereview-TqXpu08b/{REREVIEW,NEWHANDOFF}.md` reports **no blocking
  findings in scoped final review** and independently resolves F1/F2. The reviewer
  is separate from the documentation implementer and reuses its own earlier deep
  source/public/raw review, not an implementation-owner acceptance claim. The blocked
  original review, failed attempts and old package identities remain unchanged.
- Independent contextual review covers the owner's 37 references, 44 reviewer lexical
  matches (45 union lines), plus thirteen additional semantic contexts: **58 distinct
  matched lines**. No equivalent live handle/DTO-certificate or one-argument data-field
  promise remains in that examined guidance. Valid historical/rejected/configuration/
  private-reuse language is retained; this is semantic review, not a word-ban proof.
- Fresh re-review runs pass the complete **24-case guidance file**, **seven actual
  packed-runtime tests** and **five strict public compiler conditions**. Each condition
  checks eight equalities and five unsuppressed negatives, skipLibCheck=false, without
  positive/negative fixture casts, any or suppressions. Real-Mongo tests cover both
  modes, zero raw-helper reads/hooks and the explicit fresh read/hook alternative.
  Copied final implementation fixtures were inspected and independently executed,
  not mislabeled newly authored cases. No nonzero re-review command or owned job.
- Prior independent **26 packed runtime / 405 cross-path source / five broader strict
  conditions** and full original/B1 raw recalculations remain reused through unchanged
  byte/evidence linkage. The earlier **6,046 core / 742 deco**, peer/layout matrices,
  runner/correctness/counter proofs are not claimed as new re-review runs. Their
  post-gate source-snapshot chronology and missing transient-peer-tree limitations
  remain explicit. No workspace-wide/full-suite rerun, rebuild or timing occurred.
- Final source/tar/installed README is
  `aff3e416addae22e65a80150f8279fe38ed15436062d50f581979d40902c1c46`;
  actual final core tarball is
  `39cf36e02155e6c0d000d1958306375bcef03726a79e15fb0ac07faacb1fe1a9`.
  Its nineteen members differ from the previous package only in README; all other
  eighteen, including fourteen JS/DTS/eight declarations, remain byte-identical.
  Five final tarballs were independently extracted, not repacked/released.
- Current reviewed/tested/measured runtime remains
  `e131659e5cdd9f5052cd15060b498669f5e044c559b35f3abbe0780f18753f4e`,
  with **all 67 dist outputs unchanged**. New doc-only evidence binds 615 source pins;
  the old 614 pins retain exactly one intentional README difference plus the additive
  test outside them. Old seals are preserved, not falsely made current for new prose.
- Entry/exit protect 2,000 source records, 70 status paths, 813 focused old records,
  runtime/dependency/tool/binary/lock identities and five predecessor manifests. The
  coordinator independently reverified **161 re-review files / 37 links / 37 seal
  bindings / 615 current source pins / 67 outputs**, including the final tarball and
  README. Initial coordinator cross-packet-path/patch-context lookups were corrected;
  they caused no source/evidence change. Subsequent task-only reconciliation is
  separate from product/review snapshots. User commits/uncommitted work are preserved.
- **70/90 remains the numerical result**, with exactly the twenty explicitly accepted
  failed/inconclusive IDs; B1 remains report-only and freshness-distinct. No failed
  metric was relabeled, no extra timing/optimization was authorized and no promise of
  universal speedup, exact allocation/RSS bounds, application/database freshness,
  automatic presentation re-filtering or exhaustive security certification is made.
  OAR-01–10 are complete within that explicit disposition and reviewed scope; new work
  remains local/uncommitted, with no commit, publication or release authorization.

## Definition of done and present verification status

Done means one owned-stage authorization engine, immutable boolean facts and captured
actor/policy, two explicit source modes, no public output capabilities or legacy flag
adapters, bounded output/native algorithms, preserved mandatory security dimensions,
complete installed breaking documentation, scoped passing gates, demonstrated benefit
under the preselected criteria and independent acceptance. Reduced line count, renamed
checks, TypeScript readonly or a large test count alone do not establish this outcome.

Current performance completion uses the explicit user disposition recorded under
OAR-09; all numerical measurements and their failures remain unchanged. Mandatory
correctness/security/public-contract verification and independent acceptance still
apply, and this task does not authorize a commit or release.

At task creation no new implementation, build, product tests or performance measurement
had run for this proposal. Prior results above belong to the completed fast-path task. At creation,
verify this document's formatting, local links, dependency/status consistency, absence
of host paths/session IDs and whitespace only; record actual results after checking.

Task-file creation verification (repo root):

- `pnpm exec prettier --check docs/tasks/20261031-153020-access-router-owned-authorization-redesign.md` — passed.
- `git diff --check` — passed. A read-only content check also verified the new
  untracked file's trailing whitespace/newline, all five local links, ten required
  task field sets, ordered/acyclic dependencies and pending statuses, portable paths,
  and the related completed task's backlink/status.
- Git status contains only this new task and that task-document backlink. No product
  files changed; no agents, runtime checks, builds, product tests or benchmarks ran.
  No user decision is currently required; OAR-01 is the technical contract/baseline gate.
