# Access-router: explicit service authorization and retirement of `overrides`

Created: 2026-10-07 14:35:07 PDT (`20261007-143507`, generated with `date`).

Revised: 2026-10-07 15:01:39 PDT. Review revision: fixed the breaking-release removal target, moved public-input enforcement ahead of runtime authorization, narrowed this release to override replacement, and separated call policy from document permission results.

Status: completed, including all activated authorization follow-ups — all 13 original required tasks (SVA-00 through SVA-11 including SVA-01A) and all seven original independent-review fixes (SVA-11-F01 through SVA-11-F07) have passing completion evidence. The original feature/task record was independently reviewed on 2026-10-11. The maintainer activated SVA-F01 through SVA-F03 on 2026-10-12; each was implemented and verified in its separate session. Fresh independent SVA-F04 review, its four corrective follow-ups and full serial workspace/artifact integration are completed. Exact contracts, findings and final evidence are in `docs/tasks/20261012-090227-access-router-authorization-follow-ups.md`. Release version/date remain release administration. Earlier deferral and handoff statements below describe historical scope/states.

Reviewed baseline: `0629a53`; motivating behavior introduced by `9ba3712` (`feat: harden access router virtuals and route access planning`). Worktree was clean before this task file was added.

## Objective and scope

Replace model-service `args.overrides` with an explicit, typed, per-call authorization policy. Query arguments describe the requested data; authorization options describe the effective authority of that service call. Fetch planning and output filtering must consume the same resolved policy.

The central acceptance scenario is:

```ts
// Implemented trusted-backend API; covered by direct and installed-consumer tests.
const result = await service.findOne(
  { _id: orderId },
  { select: ['status', 'internalNote'] },
  {
    authorization: {
      outputFields: { mode: 'grant', paths: ['internalNote'] },
    },
  },
);
```

If the row is accessible and the stored field exists, `internalNote` must be fetched and survive both `finalizeModelOutput` and an authorization-aware subsequent `pickAllowedFields`, even if the request user cannot read it. `status` survives only when normal request-user field permissions allow it. Other business fields are outside this selection. Identity and permission metadata follow their separately documented output contracts.

Maintainer direction captured from the design discussion:

1. Prefer the clean long-term API over preserving existing override call sites.
2. Retire the complete service `overrides` container: `select`, `filter`, `populate`, `idFilter`, `effectiveSelect`, and `operation`. Ship the replacement and removal together in one designated breaking release after verification; no transitional override adapter is planned.
3. Have one ordinary `select` input. Selection is never an implicit permission grant.
4. Make row authority and output-field authority independent. Existing input/write rules remain separate; adding write-elevation policy is deferred to SVA-F01.
5. Resolve policy once per operation, preserve the original request actor, and propagate that immutable call policy plus the appropriate per-document permission results through finalization and allowed-field helpers.
6. Give populate/include targets explicit, scoped policies. Parent elevation does not automatically elevate related models.
7. Keep the finalizer active for every authorization mode, including `unrestricted`.

Required implementation scope:

- Internal Mongoose-backed `Service` and `Core` helper APIs.
- Direct find/read, create/update/upsert/new output, embedded values within those outputs, populate targets, legacy/correlated include targets, and internal row-only operations used by those paths.
- Shared projection/field-policy evaluation, private per-document permission results, immutable call policy, and private prepared-query transport.
- Existing dedicated subdocument operations continue to use request authorization through the shared helpers; new parent/child row/operation policy APIs are deferred to SVA-F02.
- Public/wire boundary protection completed before runtime authorization is enabled, emitted declarations, packed-consumer evidence, README/website documentation, and breaking-release migration notes.

Release scope excludes new `inputFields` grants, a `subdocuments` authorization tree, broad standalone count/delete/distinct API redesign, and mandatory retirement of all positional helper overloads. SVA-F01 through SVA-F03 track the relevant follow-ups. Required policy-aware helper overloads and internal transport migration remain in this release.

## Working rules and design boundaries

- Follow `AGENTS.md`, `docs/tasks/README.md`, the task-as-you-go workflow, and the ai-friendly-ts-package workflow. Record repo-relative paths and scrub machine-local output from evidence.
- Execution direction: run one fresh sub-agent per required task, sequentially in dependency order. Update each task's status as work progresses and append Completion evidence only after its required checks pass. Finish with independent SVA-11 review and coordinator review of the entire task record.
- Maintainer constraint: do not edit `CHANGELOG.md`, including via release tooling or formatting. Put migration/release guidance in package documentation and this task record instead. Pre-execution Git blob hash: `c0561a1048c2341b14dd7f9d3e7c1fc055ae1880`.
- Keep the source actor and `req.macl` permission map intact. Per-call grants must not become request-global or service-instance-global mutable state.
- Use shared policy/planning boundaries rather than permission exceptions in every route or restoring fields after trimming.
- Keep persisted fetch selection distinct from output selection. Virtual dependencies, joins, identity retention, and document-permission hook inputs have private lifetimes.
- Preserve the separate `virtualAccess`, `outputAccess`, `docPermissionsAccess`, and initiating `operation` matrix unless a change is explicitly recorded in SVA-00.
- Continue existing validation, prepare/transform/afterPersist/change/delete hooks and Mongoose save semantics. Authorization modes never mean raw adapter access or skipped validation.
- Preserve bounded persistence admission and bounded hook/row orchestration. A leaf persistence permit must never be held while awaiting descendant planning/finalization or application hooks.
- Public presentation hooks (`decorate`, `decorateAll`, tasks) remain trusted application output stages after finalization. Record that they can intentionally construct or remove output; do not promise an automatic second authorization pass after them.
- Authorization is an internal service capability. Do not add it to client/React transport types or generated HTTP request options.
- The configured router/model `overrideFilter` hook is a separate query-transform hook. It runs once in every row mode under the explicit C5 contract; its name and public setter remain.
- Complete SVA-01A before any service/helper starts honoring supplied backend authority. SVA-08 later verifies the boundaries against the fully integrated implementation.
- `DataCore`/`DataService` share some selection helpers but have no service `overrides` container. Preserve their current behavior through the shared-helper refactor; adding explicit data-service authorization is a separate follow-up.
- No new package entrypoint, general policy language, wildcard grant syntax, audit service, permission prompts, client-side authority, database virtual sorting/filtering, writable virtuals, or raw-Mongoose escape hatch is required.

## Confirmed baseline findings

Line references are for `0629a53` and will move. Use the named symbols when implementing.

### B1 — Persisted override fields lost their old output-grant behavior

Before `9ba3712`, `Service.findOne` and `Service.find` supplied `normalizeSelect(overrideSelect)` as unconditional base fields to `trimOutputFields`. `collectSchemaFields` starts with `baseFields` and skips their rule checks. After the change, `overrides.select` still affects fetching but enters the planner only as `internalFetch.trustedOverrideSelect`; output eligibility comes from the ordinary effective selection, and finalization evaluates request-user field rules.

References:

- Historical: `git show 9ba3712^:packages/access-router/src/services/service.ts`, `findOne` around lines 389–393 and `find` around lines 589–593.
- Current: `packages/access-router/src/services/service.ts:1042-1095,1246-1288,1363-1413,1594-1618`.
- `packages/access-router/src/acl/virtual-projection.ts:329-355,527-568`.
- `packages/access-router/src/output/finalize-model-output.ts:451-473,521-565`.
- `packages/access-router/src/core-shared.ts:274-313`.

The current comment at `service.ts:1285-1288` claims persisted override output forcing is already represented; denied/unselected persisted fields contradict that claim. Fix the contract and its documentation together.

### B2 — `pickAllowedFields` has no per-call authorization input

`Base.pickAllowedFields` delegates to `Core.pickAllowedFields`, which evaluates the current model permission schema against request-global and serialized document grants. The shared helper itself was not changed into an explicit grant transport by `9ba3712`. Adding a grant only to the finalizer would still leave later allowed-field filtering capable of stripping it.

References:

- `packages/access-router/src/services/base.ts:661-708,727-733`.
- `packages/access-router/src/core.ts:237-315`.
- `packages/access-router/src/acl/select-resolution.ts:6-57,59-124`.

### B3 — Filter overrides mix predicate replacement, row bypass, and prepared-query transport

- `args.overrides.filter` skips `genFilter`; it replaces both the query predicate and generated row policy.
- `args.overrides.idFilter` skips identifier resolution, then still receives ordinary row policy through `findOne`/`updateOne`.
- Explicit false is terminal; existing tests distinguish omitted/nullish overrides from false and forbid persistence-bearing subqueries on terminal denial.
- Internal upsert, legacy list includes, and correlated read/list includes also use `overrides.filter` to reuse a query already parsed/authorized. That use must be replaced with a private prepared-query path, not a new public bypass flag.

References:

- `packages/access-router/src/services/service.ts:1049-1059,1319-1335,1370-1380,2028-2034,2211-2232,2251-2303`.
- `packages/access-router/src/services/base.ts:1135-1156,1330-1357,1420-1436,1508-1527,1586-1595`.
- `packages/access-router/src/core-shared.ts:139-184`.
- `packages/access-router/test/service-denial-contract.test.ts:88-149,183-227`.

### B4 — Populate override admission and target output authorization are inconsistent

`overrides.populate` can skip `genPopulate`, whose normal path checks the source field, target base operation, target selection and row filter. Registered targets are subsequently finalized with their own request-user policy, including an on-demand plan for override descriptors without retained metadata. Thus bypassing populate admission does not consistently authorize target output.

`CreateArgs` exposes `overrides.populate`, but the reviewed `create` implementation generates population from ordinary `populate`; characterize this actual behavior instead of assuming all mutation overrides are used identically.

References:

- `packages/access-router/src/core.ts:318-478`.
- `packages/access-router/src/services/service.ts:746-789,808-864,1059,1380,1721-1728,2032-2039`.
- `packages/access-router/src/acl/populate-target.ts:42-68`.
- `packages/access-router/src/interfaces/service-create.ts:9-27`.

### B5 — Current pre-fetch checks and final rule evaluation are separate implementations

`genSelect` uses a `skipChecks` boolean, global-key checks, and `collectSchemaFields`; the virtual planner separately classifies granted/deferred/denied rules, and the finalizer uses `evaluateScopedAccessRule`. Rules needing actual document grants cannot always be finalized before fetching. `collectSchemaFields` also uses a truthy access fallback while `extractScopedOutputRule` uses access-key presence.

A single source of field-rule extraction/effective authorization is needed. Do not run document-dependent permission functions without their documented arguments during planning or drop potentially authorized fields solely because document grants are not available yet.

References:

- `packages/access-router/src/core.ts:107-170,277-315`.
- `packages/access-router/src/core-shared.ts:299-310`.
- `packages/access-router/src/acl/select-resolution.ts:93-105`.
- `packages/access-router/src/acl/virtual-projection.ts:371-459,474-506`.

### B6 — Grant serialization and nested early returns need explicit treatment

- Direct services sometimes skip document-grant computation under `skim` and metadata flags unless virtual candidates exist, then supply `{}` to the finalizer to prevent another hook call. The new policy must distinguish internal grant computation from metadata serialization for ordinary persisted fields too.
- Subdocument code has `hasSubVirtuals` early-return/fallback branches using `genQuerySelect` and `pick`; authorization must work on these outputs whether virtuals are configured or not.
- A hydrated `pickDocFields` mutates `_doc`. Never use trimmed output in place of the raw document needed for persistence.

References:

- `packages/access-router/src/services/service.ts:1186-1200,1258-1263,1556-1566,1830-1840,1960-1983`.
- `packages/access-router/src/services/model-subdocument-service.ts:91-145,178-288,311-381,395-497`.
- `packages/access-router/src/helpers/document.ts:220-226`.

### B7 — Types alone do not establish the public boundary

- Internal and public mutation option types currently inherit from each other. Adding `authorization` to the wrong base interface would put it in root/public wire types.
- Legacy include `options` is generic and is spread into target internal calls. `sanitizeIncludeArgs` removes only `overrides`, not every future internal option.
- Populate/body/root schemas often use `.passthrough()`. Public wrappers currently reconstruct known options, but the new field must be blocked at actual dispatch boundaries too.
- Correlated includes deliberately keep substituted marker-shaped data inert; preserving that behavior requires more than copying a new policy into the old call.

References:

- `packages/access-router/src/interfaces/service-find.ts`, `service-create.ts`, `service-update.ts`, `service-list.ts`, `service-read.ts`.
- `packages/access-router/src/interfaces/root.ts:127-151`.
- `packages/access-router/src/services/base.ts:1048-1052,1107-1114,1148-1156,1236-1251,1634-1656`.
- `packages/access-router/src/validation/common.ts:62-120`, `validation/model-router.ts:78-211`, `validation/root-router.ts:32-169`.
- `packages/access-router/test/correlated-includes.execution.test.ts:288-305` and `cross-resource-authorization.integration.test.ts:442-475`.

### B8 — Installed consumers depend on the packed surface

The package publishes root, `/advanced`, and `/processors` entrypoints, bundled CJS/ESM and declarations. The root exports selected interfaces; `/advanced` exports all interfaces. Consumer type tests stage installed-package imports, not just source aliases.

References:

- `packages/access-router/package.json:23-82`, `tsup.config.ts:1-18`.
- `packages/access-router/src/index.ts:139-235`, `advanced.ts:1-4`.
- `packages/access-router/test/strict-consumer-types.test.ts`, `packed-consumer-compatibility.test.ts`, `export-contract.test.ts`, `documentation-examples.test.ts`.

## Revised implementation contracts

The behavior and release scope below are the execution target for this revision. SVA-00 records exact exported signatures and baseline evidence; it does not reopen the removal strategy or add deferred capabilities. Any discovered conflict with current behavior must be recorded with concrete evidence before changing this contract.

### C1 — Input policy and resolved context

```ts
// Proposed public, internal-service policy inputs.
type FieldAuthorization<TPath extends string = string> =
  | { mode: 'request' }
  | { mode: 'grant'; paths: readonly TPath[] }
  | { mode: 'unrestricted' };

type RowAuthorization<TModel = unknown> =
  | { mode: 'request' }
  | { mode: 'scope'; filter: Filter<TModel> }
  | { mode: 'unrestricted' };

type OperationAuthorization = { mode: 'request' } | { mode: 'grant' };

interface ServiceAuthorization<TModel = unknown, TVirtuals extends object = Record<never, never>> {
  rows?: RowAuthorization<TModel>;
  outputFields?: FieldAuthorization<OutputFieldPath<TModel, TVirtuals>>;
  related?: Readonly<Record<string, RelatedAuthorization>>;
}

interface RelatedAuthorization {
  model: string; // Exact expected target; validate against the resolved descriptor/ref.
  operation?: OperationAuthorization;
  rows?: RowAuthorization;
  outputFields?: FieldAuthorization;
  related?: Readonly<Record<string, RelatedAuthorization>>;
}
```

`OutputFieldPath` is a proposed name, not an existing export. Reuse bounded `DeepFieldPath`, `VirtualSubModel`, and existing output generic conventions where correct. Known models should get typed persisted/virtual output paths; unknown-model use keeps an explicit string fallback. Runtime path validation remains necessary for JS and dynamically constructed policies. `inputFields` and `subdocuments` are unsupported policy keys in this release and must fail validation rather than be silently ignored.

Keep two separate kinds of state:

1. **Resolved call policy:** an immutable snapshot of the input authority, owning request/runtime/model/scope, configuration/field catalog, initiating/effective accesses, normalized modes/path rules, and related policies. Planning can use this before any document exists.
2. **Resolved document authorization:** package-owned per-document/per-scope/per-access-stage results containing the full document-hook grants and memoized output-rule decisions. Bind this state to the call policy and the document snapshot/stage from which it was computed. List rows never share document-grant results, even when their call policy is the same.

Resolve the document-permissions hook at most once for the relevant document/access stage from its untrimmed projected input. A later helper in that execution reuses the results and already-evaluated field decisions. It must not rerun permission hooks against trimmed data, reconstruct authority from exposed `_permissions`, or treat a matching `_id` as proof that another call/snapshot can reuse the state.

No shared mutable `Set`/`Map` should be exposed as “readonly” authority. Copy inputs and expose read-only views or frozen arrays; privately owned lookup indexes/memoization remain implementation details. If backend callers need the document state for a subsequent pick, supply a read-only opaque handle through an internal service context or callback, separately from `data`; finalize its exact signature in SVA-00. Handles are not wire input or general authority tokens.

Authority comes from explicit per-call internal options. Exclude `authorization` and private execution context from router `Defaults`; query/presentation defaults remain supported. Missing policy dimensions default to request authority. This avoids inherited elevation and ambiguous merging of unrelated call policies.

### C2 — Selection and field grants

For ordinary business fields:

```text
effective field authorization = request-user authorization OR explicit field grant
returned fields              = selected fields AND effective field authorization
```

- `request`: ordinary schema/global/document rules.
- `grant`: additive grants for named paths; an empty list adds nothing. Grant paths are not an allowlist limiting other normally authorized fields.
- `unrestricted`: authorize eligible output fields covered by the operation's selection. It does not mean return all fetched keys.
- Explicit grants may authorize valid persisted fields absent from `permissionSchema` and fields whose request rule is false/missing. Otherwise the replacement cannot express the old backend capability.
- A grant does not add a path to an explicit selection. A granted-but-unselected field is not fetched solely because it was granted and is not returned; required private dependencies are independent.
- An ordinary inclusion/exclusion/omitted projection retains its existing normalization semantics. `requireExplicitSelect` still applies. Empty select is not reinterpreted as an implicit backend bypass.
- With omitted selection, `request` uses normal defined output fields; `grant` also makes explicitly named valid paths eligible; `unrestricted` uses the captured eligible persisted field catalog plus applicable registered virtuals.
- `_id` retains current identity rules, including explicit `-_id` output exclusion and private fetch retention. Document-permission field output follows metadata posture, not business-field grants.
- Grant paths cannot target the document-permission field (including configured dotted equivalents), policy/control metadata, prototype-control segments, or Mongoose implementation keys. `unrestricted` does not expose these internals.
- Explicit grants do not fabricate missing persisted values. A virtual grant authorizes evaluation/output only when its getter applies, it is selected, and dependencies are available; `undefined` and getter failure still omit it.

Path semantics:

- Use ordinary response paths (`contacts.email`), not permission-definition markers (`contacts.sub.email`), signed select tokens, wildcards, or bracket/index expressions in grants.
- A grant to a scalar/opaque value authorizes that value. A grant naming an object/embedded container authorizes that subtree within the selected output; document the subtree meaning in JSDoc.
- A descendant grant authorizes the minimal ancestor structure required to return that descendant, not ancestor siblings. `contacts.email` preserves array shape and authorized ordinary child fields while adding email; it does not grant `contacts.ssn`.
- An embedded path remains in the receiving model's scope. A populated referenced model is a separate target: granting `customer` on the parent permits the relationship field, but cannot grant the target's fields. Target paths belong under `related.customer.outputFields`.
- Use the actual runtime Mongoose schema/child schemas and virtual registry for the field catalog; `getModelAtt()` only contains top-level `schema.obj` keys. Registered Mixed/Map roots may permit explicitly selected safe descendants; unrestricted omitted selection includes declared roots and does not enumerate arbitrary unseen response keys.

### C3 — Pre-fetch planning and `genSelect`

Planning must produce granted/deferred/denied outcomes using the effective policy:

```text
persisted fetch = selected persisted fields that are granted or deferred
                  + dependencies of selected granted/deferred virtuals
                  + required private policy/join/identity inputs
```

- Explicitly granted paths are known granted before fetching.
- A request rule depending on document grants is deferred, not denied because no document was fetched yet.
- Permission functions retain their documented arguments and are deferred until actual grants exist; do not evaluate getters during planning.
- Definitely denied unrelated fields are not fetched unless needed privately for an authorized/deferred virtual, document-permission hook, join, or existing explicit internal fetch option.
- Use the existing `alwaysSelectFields` mechanism for persisted inputs that document-permission hooks need beyond selected output. Do not infer dependencies from hook source code or load every stored field just because a hook exists. Pin document-dependent authorization fixtures with explicitly declared hook inputs and document the projected-hook-input contract.
- Fetch-only provenance never becomes an output grant. Unknown ungranted requested names follow ordinary persisted-field policy.
- Resolve a policy-aware plan once. `genSelect`/`genQuerySelect` return its persisted fetch selection; the service retains the plan for the finalizer rather than constructing a second inconsistent plan.
- Use named policy/planning options in the canonical model pipeline. Output planning uses the shared planner; input/write admission continues to use its existing persisted request-field rules. Legacy positional helper overloads are isolated compatibility entrypoints tracked for later retirement in SVA-F03.

Recommended helper signatures, to finalize in SVA-00:

```ts
service.genSelect(access, select, { authorization, scopePath });
service.genQuerySelect(access, select, { authorization, scopePath });
service.genAllowedFields(doc, access, { authorization, purpose: 'output' });
service.pickAllowedFields(doc, access, { authorization });
service.trimOutputFields(doc, access, { authorization });

// Same execution: use the package-issued per-document result, including its call policy.
service.pickAllowedFields(finalizedDoc, access, { documentAuthorization });
```

Within service execution, use the resolved call policy for planning and the issued document result for subsequent filtering. `{ authorization }` and `{ documentAuthorization }` are mutually exclusive helper overloads. A fresh raw-policy call independently authorizes its input document; it is not equivalent to reusing an earlier document result. Explicit grants remain effective in that fresh call, but ordinary document-dependent permissions require suitable untrimmed input or the original valid document handle. A fresh call with neither uses request mode. Never silently rerun a hook on an output known to have lost required hook inputs.

Keep system identity/metadata/association retention in package-owned planning options. New policy-aware overloads do not accept arbitrary `baseFields` as an additional authority channel. Retain existing positional `skipChecks`/`baseFields` helper behavior in an isolated legacy overload where required for this release; internal canonical execution must not call it to authorize output. SVA-F03 handles removal of those separate helper APIs.

### C4 — Finalizer and allowed-field helpers

- `finalizeModelOutput`, `finalizeModelOutputs`, and policy-aware `genAllowedFields`/`pickAllowedFields` share the same rule extractor and effective authorization evaluator. Legacy helper overloads cannot be used as a later request-only trim in this pipeline.
- The finalizer remains `isolate -> resolve internal document grants -> finalize authorized child output -> evaluate selected authorized virtuals -> project/trim` for every policy mode.
- An explicit selected grant survives even when the request-global map and document hook deny that field. Remaining fields still need request authorization.
- `pickAllowedFields` filters existing values; it does not compute virtuals, apply a requested select, perform row access checks, or restore data absent from its input. Selection remains a separate responsibility.
- No snapshot/doc mutation, stale persisted fallback for a virtual, second getter invocation, or post-trim raw-field restoration is used to implement grants.
- Authorization remains effective even after `_permissions` serialization is disabled/stripped/limited. Document grants used to authorize ordinary fields and virtuals are kept separately from exposed metadata.
- Planning uses call policy and deferred document-dependent decisions. After fetch, document-grant results and field decisions are associated with that document/scope/access stage and reused through finalization and later same-execution picks. Exposed metadata presence never identifies cache validity.
- Separate stages invalidate/recompute document results when the raw snapshot or effective access changes, such as pre-write admission versus post-write output; ordinary request input admission remains separate. Explicitly transferred output copies retain the same stage handle without treating arbitrary DTOs as carriers of authority.

### C5 — Row policies, predicate transformation, and terminal denial

Fixed behavior for this release: row authority selects the base-row scope; the configured `overrideFilter.<access>` remains a query transformation in every mode.

| Mode           | Query-transform hook                            | Row authority                                      | Final predicate                          |
| -------------- | ----------------------------------------------- | -------------------------------------------------- | ---------------------------------------- |
| `request`      | Apply configured `overrideFilter.<access>` once | Existing `baseFilter.<access>`                     | Transformed query AND request base scope |
| `scope`        | Apply configured `overrideFilter.<access>` once | Supplied trusted scope replaces request base scope | Transformed query AND trusted scope      |
| `unrestricted` | Apply configured `overrideFilter.<access>` once | No request base scope                              | Transformed query                        |

Scope is combined after transformation. Neither the hook nor a policy may overwrite the caller's required relationship/join constraint. Internal identifier predicates are resolved by the normal identifier hook; custom lookup users call `findOne`/`updateOne` with an explicit predicate instead of overriding ID resolution.

- An explicit false query, false identifier result, false trusted scope, or false query-transform result is terminal in every mode.
- `unrestricted` deliberately skips request base-row evaluation only. Restrictions or denial produced by `overrideFilter` still apply. A base policy that is not selected by this mode is not an already-computed denial being revived. Request mode retains terminal false from its base policy.
- Reject a null/undefined/malformed `scope.filter`; `{}` is an explicit all-row scope, not fallback to request mode. Omitted authorization/dimensions default to request mode.
- Validate the query/policy before persistence. An early known false prevents identifier/filter generators, `$$sq`, populate/include work, and persistence as applicable.
- Distinguish early known denial from a transform hook that needs the parsed query: a later hook denial is terminal before primary persistence and subsequent child dispatch, but cannot undo subqueries necessarily executed to parse that query. Pin the actual ordering with tests rather than claiming every hook denial precedes parsing.
- A supplied trusted scope is an inert database predicate; it does not undergo client `$$sq`/`$$date` expansion. Scope and mandatory relationship constraints are ANDed after query transformation.
- Apply query transformation once and carry a privately prepared query for internal reuse. Row mode itself never discards the caller predicate; the configured transformation can intentionally rewrite ordinary query input. Preserve mandatory relationship constraints and the trusted scope separately and AND them afterward, so hook rewriting cannot remove them.
- `find.totalCount`, `exists`, `count`, and grouped/correlated counts use the same effective row policy as the corresponding query. No response count reveals rows outside the selected scope.

Migration documentation must call out that old object `overrides.filter` bypassed both filter hooks, whereas the new row policy bypasses/replaces only the base-row scope. Applications whose configured `overrideFilter` implements user row restrictions should move that restriction into `baseFilter` when they want the explicit row modes to replace it. This release adds no query-transform bypass option; SVA-00 records tests for both query rewriting and user-dependent denial under every mode.

### C6 — Preserve write/operation boundaries and limit the first-release surface

- This release adds output-field/row/related-target authority. `inputFields` write-elevation modes are deferred to SVA-F01; create/update/upsert input field admission continues to use existing request-user rules.
- Output grants never authorize a write. Virtual keys remain output-only in every mode, including whole-container/array writes and permissive Mongoose schemas.
- Existing validation, required hooks, Mongoose schema checks, and save semantics continue to run.
- A typed output grant does not imply read/update/delete row authority, sorting/distinct permission, target operation authorization, or permitted `$$sq` target access.
- Keep initiating route/basic/advanced guards at their existing server-owned boundaries. Do not introduce new blanket top-level service entry guards as part of this redesign.
- Related operation grants explicitly authorize the target operation gate for that scoped execution; omitted operation policy evaluates the existing request/base guard. Such grants do not alter route-variant selection or the request permission object. Dedicated subdocument operation/row grants are deferred to SVA-F02.
- Default query-field/sort/distinct authorization remains independent of output-field grants in this phase. Document this explicitly and retain `sortableFields` and existing virtual DB exclusion. A broader query-field capability is a separate design follow-up.

Recommended method applicability (finalize exact option signatures in SVA-00):

| Internal method family                                | First-release policy integration                                                   | Stage notes                                                                   |
| ----------------------------------------------------- | ---------------------------------------------------------------------------------- | ----------------------------------------------------------------------------- |
| `find` / `findOne` / `findById`                       | Rows, output fields, related targets; embedded output inherits field paths         | Request predicates remain separate from row scope                             |
| `create`                                              | Output fields and related targets                                                  | Existing input admission; no existing-row lookup                              |
| `updateOne` / `updateById`                            | Rows, output fields, related targets                                               | Existing input admission and persistence hooks                                |
| `upsert`                                              | Rows for update-policy lookup; branch output/related policies                      | An allowed miss takes the create branch; scope does not synthesize input      |
| `new`                                                 | Create-policy template output                                                      | Keep its historically ignored select behavior in this release and document it |
| Internal exists/count/grouped-count execution         | Receive resolved row context/prepared query when called by an integrated operation | Keep total counts and include counts scoped consistently                      |
| Standalone `exists` / `count` / `delete` / `distinct` | Retain existing public helper signatures and request-policy behavior               | Broader per-call row API extensions are outside this release                  |
| Dedicated subdocument operations                      | Request-mode call/document state through shared helpers                            | Existing parent/child row, operation, input, and post-write visibility gates  |

For create/upsert, ordinary validation/preparation governs field values. A row lookup scope restricts existing rows; it does not automatically stamp tenant values into new documents. Reject unsupported authority dimensions at each method boundary. The internal upsert create branch explicitly derives an output/related policy from its operation context instead of forwarding an inapplicable row option into public `create` arguments.

### C7 — Related and embedded scope

Proposed backend example:

```ts
await service.findOne(
  { _id: orderId },
  {
    select: ['status', 'customer'],
    populate: [{ path: 'customer', select: ['name', 'billingEmail'] }],
  },
  {
    authorization: {
      outputFields: { mode: 'grant', paths: ['customer'] },
      related: {
        customer: {
          model: 'Customer',
          operation: { mode: 'grant' },
          rows: { mode: 'scope', filter: { tenantId } },
          outputFields: { mode: 'grant', paths: ['billingEmail'] },
        },
      },
    },
  },
);
```

- Keys identify the exact related output/ref path relative to the current model. Each entry names the expected target model; a mismatch or unsupported path fails before target persistence.
- Child policies default to request authority. A parent's output `unrestricted` does not authorize the referenced model's data or operation.
- Populate checks source relationship-field eligibility using the parent effective policy, then target operation/row/output authority using the child's context. Requested `match` is an ordinary target predicate intersected with target row scope, not a replacement of it.
- Includes are explicitly requested output attachments under their established contract, not necessarily permission-schema fields on the parent. Apply child authority to their target output; preserve metadata/virtual output-path collision preflight.
- Related rows remain constrained by the ref ID, legacy foreign/local join, or expanded correlated predicate in every target row mode. An unrestricted target row policy never means unrelated rows can be attached.
- Populate and include targets retain their own captured plans/options/grants. Finalize them before parent getters; keep null/scalar-ID/list miss shapes and established denial/error propagation.
- Embedded values within integrated parent/target output inherit that model's output-field policy and owning document results, translated by ordinary response path. A grant to `contacts.email` applies consistently with/without embedded virtuals, without a new `subdocuments` policy tree.
- Dedicated subdocument methods retain their request-only authorization API in this release. Their use of shared helpers/finalizers receives explicit request-mode policy and the correct owning-parent document results. Existing parent/child row and operation checks remain; new scoped elevation APIs are deferred to SVA-F02.
- Successful dedicated subdocument writes with denied post-persist visibility still produce the existing successful `null`/`[]` result rather than a retryable failure. An output grant elsewhere cannot change those gates or become an input/write grant.
- `$$sq` remains a separate request-controlled target query. Neither parent grants nor a related output policy is inherited by subqueries.

### C8 — Private execution context and prepared queries

Replace internal transport uses of `overrides` with non-wire execution objects:

- Effective mutation selection is an ordinary internal `select`. The public wrapper computes any `returningAll: false` selection once and passes it normally.
- Initiating `operation` and the branch-specific access matrix live in an internal execution context. Upsert remains `operation: 'upsert'` while getters/output/doc-grant accesses follow its create/update branch.
- Prepared-query state records parsing status, effective row predicate, receiving runtime/model/access, and resolved authorization. It is created by package-owned functions after validation/authorization and cannot be supplied through plain JSON options.
- Internal calls receiving prepared state do not parse substituted `$$sq`/`$$date`-shaped values, regenerate ID policy, or re-run query-transform hooks. Validate expanded correlated operands before preparing them.
- Do not replace `overrides.filter` with a public `preparedFilter`, `skipAuthorization`, `skipParsing`, or `alreadyAuthorized` boolean.
- Private association values and child plans remain outside enumerable DTOs and Mongoose descriptor keys. Use a package-owned class/token/private module or validated identity-bound object, not a type-only brand accepted by structural shape alone.

### C9 — Public boundary and metadata

- Split internal option interfaces from `Public*Options` and `RootQueryEntry` wire types before adding authority fields.
- Complete the type/allowlist/control-slot enforcement in SVA-01/SVA-01A before runtime service/helper authorization is enabled. After integration, SVA-08 proves the same boundaries using actual successful backend grants as positive controls.
- Public `_list`/`_read`/mutation wrappers create a request-mode operation context and explicitly forward only supported presentation/query options. They cannot inherit elevation from internal defaults or a prior call on the same instance.
- Generated request schemas, public wrappers, and generic nested option dispatch reject control-slot `authorization`, retired `overrides`, and internal prepared/execution keys with controlled BadRequest. Internal service removal errors become mandatory at SVA-09; early public enforcement need not remove still-internal transport before its replacement is wired.
- Legacy include/subquery options require positive allowlisting before target service dispatch. Populate passthrough descriptors must never forward policy options to Mongoose or target services.
- Validate control slots, not every business property named `authorization` or `overrides`; legitimate persisted fields with those names remain ordinary payload data.
- Tests must cover JS/mistyped direct calls to public wrappers, root entries, nested legacy/correlated includes, populate/sub-populate descriptors, `$$sq`, and custom validators returning transformed envelopes.
- Keep all existing permission metadata switches independent of effective internal grants. `_view`/`_edit` and document-hook keys continue to describe request-user permissions by default; temporary backend grants do not forge user privileges in response metadata.
- Policy context, prepared tokens, internal grant caches, and child plans are not attached to `data` or emitted by public serializers. Internal diagnostic context remains explicitly internal.

### C10 — Breaking-release removal and migration

Release decision: ship explicit authorization and service `overrides` removal together in one designated breaking release, after the complete replacement passes its gates. The maintainer has accepted migration in favor of the clean API. Exact version/date is release administration; it does not block implementation or create a compatibility-adapter alternative.

1. Introduce explicit authority, migrate all package-owned callers, and remove the complete service `overrides` argument from runtime resolution and exported argument/default types.
2. Do not ship a deprecated service-override adapter, hidden fallback, or duplicate grant path. Intermediate internal uses may remain during implementation but must be gone before the breaking-release gate.
3. Reject a supplied legacy `overrides` control slot after removal with BadRequest before parsing/persistence, including empty or mixed new/old inputs. TypeScript callers get a removed-property error and JavaScript callers get an actionable migration error instead of silent fallback.
4. Add policy-aware named helper overloads in this release, with an isolated legacy overload for existing positional `skipChecks`/`baseFields` callers. Their independent retirement is SVA-F03; canonical internal execution never uses them as an authority transport.
5. Keep the model/router configured `overrideFilter` hook/setter and historical task records. Service-container removal does not rename query-transform hooks or unrelated test helper variables.

Migration mapping:

| Old service entry                                        | Canonical replacement                                                                            |
| -------------------------------------------------------- | ------------------------------------------------------------------------------------------------ |
| `overrides.select`                                       | Ordinary `select` plus explicit `authorization.outputFields`                                     |
| `overrides.filter` used for backend row authority        | Ordinary query predicate plus `authorization.rows.scope`/`unrestricted`                          |
| `overrides.filter` used for an internally prepared query | Private prepared-query execution context                                                         |
| `overrides.populate`                                     | Ordinary populate descriptor plus explicit source/target authorization                           |
| `overrides.idFilter`                                     | `findOne`/`updateOne` with the desired predicate and explicit row policy                         |
| `overrides.effectiveSelect`                              | Ordinary internal mutation `select`                                                              |
| `overrides.operation`                                    | Internal initiating-operation context                                                            |
| Helper `baseFields` used for backend visibility          | Named policy-aware overload with an explicit output grant; legacy overload retirement is SVA-F03 |
| Helper `skipChecks` used for provisional fetching        | Named projection-planning overload; legacy overload retirement is SVA-F03                        |

## Verification strategy and baseline gates

No runtime build, tests, or lint were run to create the original plan. SVA-00 baseline results and frozen decisions are recorded below; they characterize the old implementation, not an implemented authorization feature.

Repository commands from `AGENTS.md`:

- `pnpm install` if dependencies are missing.
- `pnpm build`.
- `pnpm test` — serial workspace package scripts.
- `pnpm lint`.
- `pnpm build-artifact -- --version <ver>` and `pnpm verify-artifact -- --version <ver>` when the approved release artifact is assembled; no version has been selected by this plan.

Package commands:

- `pnpm --filter @web-ts-toolkit/access-router... build`.
- `pnpm --filter @web-ts-toolkit/access-router typecheck`.
- `pnpm --filter @web-ts-toolkit/access-router test`.
- After a build, focused Vitest invocation: `pnpm --filter @web-ts-toolkit/access-router exec vitest run --config vitest.config.ts test/<actual-file>.test.ts`. Record real file arguments in evidence; do not rely on `test -- <filter>` forwarding through the compound test script.
- `npm pack --dry-run` with working directory `packages/access-router` checks file inventory, while existing packed-consumer tests check transformed publication metadata and actual package-name imports.

Run one dependency build, then focused tests for the relevant task. Avoid simultaneous package scripts: each test/typecheck script rebuilds shared transitive `dist/` outputs. Full package tests/typecheck belong at wave boundaries; full workspace checks belong at final integration.

Baseline focused regression set after the package build:

```sh
pnpm --filter @web-ts-toolkit/access-router exec vitest run --config vitest.config.ts test/service-denial-contract.test.ts test/filter-denial.integration.test.ts test/read-list-fallback-authorization.integration.test.ts test/cross-resource-authorization.integration.test.ts test/correlated-includes.execution.test.ts test/grouped-count-casting.integration.test.ts test/virtuals-projection-planner.unit.test.ts test/virtuals-finalizer.unit.test.ts test/virtuals-direct-operations.integration.test.ts test/virtuals-populate-include.integration.test.ts test/virtuals-embedded-subdocuments.integration.test.ts
```

Broaden/repeat checks only for the next integration wave, a new change, or unresolved failures. For installed-consumer fixtures that need a temp directory, follow `docs/tasks/README.md`: verify/create an ignored repo-local `_tmp*` parent and use its runtime absolute path as `TMPDIR`; record it as `<repo-root>/_tmp-sva` in evidence.

## Priority definitions

- P0: defines or implements the shared authority contract; inconsistent planning/trimming, leaked authority, or lost terminal denial blocks the feature.
- P1: required operation/scope coverage, wire boundary, migration, consumer compatibility, and final verification.
- P2: optional additions after the canonical design works. No agreed field-grant/row/related/virtual guarantee is deferred as P2.

## Ordered waves and dependencies

| Wave | Tasks                                                                            | Exit requirement                                                                    |
| ---- | -------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------- |
| 0    | SVA-00 baseline and exact signatures                                             | Revised contracts recorded; baseline characterized                                  |
| 1    | SVA-01 types/context; SVA-01A public-input enforcement                           | Public/internal split and allowlists pass before any runtime authority is enabled   |
| 2    | SVA-02 projection; SVA-03 document/output authority; SVA-04 row/prepared queries | Shared policy and separate per-document results verified                            |
| 3    | SVA-05 direct service integration                                                | Central example works through real services; write boundaries remain request-scoped |
| 4    | SVA-06 populate/includes; SVA-07 embedded output and subdocument parity          | Explicit target/embedded output grants and preserved dedicated subdocument behavior |
| 5    | SVA-08 integrated public-boundary verification; SVA-09 override removal          | End-to-end isolation and complete service-container removal                         |
| 6    | SVA-10 declarations/docs/packed consumers                                        | Installed API and breaking-release migration guide agree with runtime               |
| 7    | SVA-11 independent integration review                                            | Required serial integration gates pass; deferred extensions are excluded            |

Shared hotspots: `core.ts`, `services/base.ts`, `services/service.ts`, `services/public-service.ts`, `interfaces/root.ts`, `acl/virtual-projection.ts`, and `output/finalize-model-output.ts`. Sequence their owners; parallel work is appropriate only for independent test/docs drafting after the corresponding contracts are fixed. Do not run rebuilding test scripts in parallel.

SVA-01A is a hard prerequisite, not an optional final hardening pass. SVA-02 onward must not begin runtime authority handling before its type/allowlist/rejection tests pass. SVA-F01 through SVA-F03 are deferred extensions and are not dependencies of this release.

## Detailed executable tasks

### Task SVA-00: Characterize the baseline and record exact first-release signatures

Status: completed

Priority: P0

Suggested role: implementation coordinator / TypeScript API designer.

Dependencies: none.

Primary ownership:

- This task document and a baseline decision/evidence section.
- `packages/access-router/test/service-authorization-baseline.contract.test.ts` (new).
- Source/types/README referenced above for read-only baseline characterization.

Finding: B1–B8 demonstrate that override removal is a pipeline/API change, including undocumented internal transport uses. Output-only option plumbing is insufficient.

References: B1–B8 source/test/history references; C1–C10 proposed contracts; `packages/access-router/test/service-denial-contract.test.ts` and existing virtual planner/finalizer suites.

Implementation requirements:

1. Run baseline focused tests and package typecheck; record any environment or pre-existing failures and the reviewed commit/worktree.
2. Characterize actual `overrides.select/filter/idFilter/populate`, helper `skipChecks/baseFields`, create-populate asymmetry, internal prepared-filter uses, and public/default option behavior with semantic fixtures.
3. Record C1–C10 exact signatures for the first-release method matrix: integrated top-level operations, related targets, internal exists/count execution, policy-aware Core helpers, and request-only dedicated subdocument/public wrappers. Keep standalone row-only API expansion out of this task.
4. Record the fixed breaking-release removal target and migration examples. Version/date can remain a release placeholder; no service-override adapter or write/subdocument elevation feature is introduced.
5. Encode C2/C5 semantics in examples: additive leaf/subtree grants, unrestricted field universe, false/missing request rules, identity/metadata, target operation gates, and `overrideFilter` running once in all row modes.
6. Record the existing access matrix and prepared-query provenance rules, including identifier reuse, branch-specific upsert policy, and preservation of dedicated subdocument row/input/visibility gates.
7. Finalize mutually exclusive raw-policy and package-issued document-state helper overloads. Specify how a backend caller obtains and reuses the per-document handle through an internal context/callback; document its request/runtime/model/document-snapshot/scope/access-stage binding and exclusion from DTO serialization.
8. Add target behavior tests when implementation begins; historical baseline assertions must be updated rather than kept as requirements for the removed API.

Acceptance criteria:

- A decision table covers every control-slot replacement and all C1–C10 items.
- The central `internalNote` scenario has concrete expected fetch and output assertions for allowed/denied/deferred `status`, absent note, unselected grant, inaccessible row, and metadata-disabled cases.
- A document-dependent control has a permission hook that reads a private `ownerId`; after output removes that dependency and `_permissions`, a same-execution pick reuses the original document results without another hook call.
- A fixed release/scope record distinguishes required removal and output/row/related policies from the three deferred follow-ups. An exact release version is not an implementation blocker.
- Baseline tests pass on the reviewed code or have a specific recorded blocker; their evidence does not claim the new API exists.
- SVA-01 onward has no unresolved behavioral/API prerequisite.

#### SVA-00 frozen decisions and baseline evidence

These decisions complete C1–C10 for the first breaking release. The signatures below are implementation targets, **not APIs available at the SVA-00 baseline**. SVA-01 adds types/context primitives; SVA-01A admission must pass before SVA-02 or any service/helper honors supplied authority. Subsequent owners must update historical baseline assertions as each replacement lands.

##### D00.1 — Reviewed behavior and control-slot replacement ledger

Reviewed HEAD: `0629a5355945c0e84e987d6cf476ef4dce3a3f86`. Starting worktree: only this untracked task document. SVA-00 owns this document and `test/service-authorization-baseline.contract.test.ts` under `packages/access-router`; runtime source is unchanged.

| Control / behavior                    | Observed baseline                                                                                                                                                                                                 | Frozen replacement / owner                                                                                                                                                                     |
| ------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `overrides.select`                    | Real Mongo projection includes denied or permission-schema-absent `internalNote`; final output excludes it with either selected or unselected note.                                                               | Ordinary `select` AND additive output authority; SVA-02/03/05. Never restore trimmed raw values.                                                                                               |
| Object `overrides.filter`             | Replaces caller predicate and bypasses both configured transform and base filter. A user-dependent transform denial is bypassed too.                                                                              | C5: parsed ordinary query transformed once, then AND selected row scope and mandatory joins; SVA-04. No transform-bypass option.                                                               |
| False `overrides.filter` / `idFilter` | Terminal Forbidden; focused denial suite proves no persistence-bearing subquery/ID fallback.                                                                                                                      | False query/ID/trusted scope/transform is terminal in every mode. Early known denial short-circuits before parsing; SVA-04.                                                                    |
| Object `overrides.idFilter`           | Skips identifier hook but still evaluates transform/base policy. Base scopes are request-cached; hook call count alone does not prove bypass.                                                                     | Normal identifier resolution once; custom predicates use `findOne`/`updateOne`; private identifier reuse for public fallback; SVA-04/05.                                                       |
| `overrides.populate`                  | Read can populate despite a denied target operation, but target finalization still removes denied `internalNote`. Create ignores override-populate and uses ordinary `populate`. Update honors override-populate. | Ordinary descriptors plus independent source-field and target operation/row/output policy, consistently across mutations/reads; SVA-06.                                                        |
| `overrides.effectiveSelect`           | Restricts mutation finalization before presentation; mutation defaults merge it.                                                                                                                                  | Ordinary internal mutation `select`, computed once by public wrapper; SVA-05.                                                                                                                  |
| `overrides.operation`                 | Upsert getters see `operation: 'upsert'`, with create/update branch accesses.                                                                                                                                     | Private execution context; never a caller-supplied initiating-operation option; SVA-05.                                                                                                        |
| Helper `skipChecks`                   | `true` provisionally admits a permission-key field despite missing global grant; it does not admit a literal-false field. Functions still use the legacy argument list.                                           | Named retained-plan overload; document-dependent functions deferred with correct arguments; preserve positional compatibility only in isolated overloads; SVA-02, retirement deferred SVA-F03. |
| Helper `baseFields`                   | Arbitrarily keeps denied and schema-absent existing values; a later ordinary pick removes them.                                                                                                                   | Named output grant or issued document handle; no `baseFields` in named options; SVA-03. Legacy overload retirement deferred SVA-F03.                                                           |
| Prepared-filter transport             | Upsert update and legacy/correlated list includes reuse authorized predicates with one transform via `overrides.filter`; correlated reads use `{}` as dummy caller filter; correlated counts use `countTrusted`.  | Package-owned prepared token and executor, not JSON options; SVA-04/06. Preserve inert substituted markers and count semantics.                                                                |
| Public/default behavior               | Reads ignore defaults' overrides; mutations shallow-merge them. `_readFilter` reconstructs args, currently silently ignoring a mistyped `overrides` slot.                                                         | Reject public control slots before dispatch; authority cannot be defaulted/merged; SVA-01/01A/08/09. Query/presentation defaults remain.                                                       |
| Grant persistence                     | Non-skim read can authorize `status` from privately fetched `ownerId`, strip owner/metadata, then lose `status` on a later pick. Skim + metadata off + no virtual candidates currently skips the hook.            | Private full document results independent of metadata/skim; SVA-03/05.                                                                                                                         |
| `select: false`                       | Mongoose's default projection hides the path; an explicit positive service projection already fetches it when its request rule allows.                                                                            | Projection default is not an authorization veto; catalog includes it under D00.3.                                                                                                              |
| `new()`                               | Ignores `args.select` and returns allowed create-template defaults.                                                                                                                                               | Retain ignored-select behavior; output authority only; SVA-05.                                                                                                                                 |
| Initiating operation guard            | Direct service read succeeds under a false model read-operation gate; generated routes own that gate.                                                                                                             | Preserve the boundary; do not add blanket service-entry guards.                                                                                                                                |

Additional ordering established by a real subquery fixture: ordinary read parses `$$sq` before a configured transform returns false; target query executes, primary query does not. An explicit false override avoids that target work. Do not claim a late transform can prevent parsing that has already occurred. Current `updateOne`/`upsert` do not parse their lookup filter as read/list do (`service.ts`, lookup before `parseClientData(data)`); replacement preparation must record the method's actual parsing stage, not blindly reparse every filter.

##### D00.2 — Exported policy and method signatures (C1/C6/C9)

Export these input/helper/result types from root and `/advanced` (type-only exports); there is no new entrypoint or runtime token constructor. All input properties below are `readonly`. Reuse `Filter`, `DeepFieldPath`'s default bounded depth, `WithVirtuals`, and `VirtualSubModel` for array/embedded traversal. Do not derive grant paths from `PublicOutput`'s loose string index signature.

```ts
type OutputFieldPath<TModel = unknown, TVirtuals extends object = Record<never, never>> = unknown extends TModel
  ? string
  : Extract<DeepFieldPath<WithVirtuals<TModel, TVirtuals>>, string>;

type FieldAuthorization<TPath extends string = string> =
  | { readonly mode: 'request' }
  | { readonly mode: 'grant'; readonly paths: readonly TPath[] }
  | { readonly mode: 'unrestricted' };
type RowAuthorization<TModel = unknown> =
  | { readonly mode: 'request' }
  | { readonly mode: 'scope'; readonly filter: Filter<TModel> }
  | { readonly mode: 'unrestricted' };
type OperationAuthorization = { readonly mode: 'request' } | { readonly mode: 'grant' };
interface ServiceAuthorization<TModel = unknown, TVirtuals extends object = Record<never, never>> {
  readonly rows?: RowAuthorization<TModel>;
  readonly outputFields?: FieldAuthorization<OutputFieldPath<TModel, TVirtuals>>;
  readonly related?: Readonly<Record<string, RelatedAuthorization>>;
}
interface RelatedAuthorization {
  readonly model: string;
  readonly operation?: OperationAuthorization;
  readonly rows?: RowAuthorization;
  readonly outputFields?: FieldAuthorization;
  readonly related?: Readonly<Record<string, RelatedAuthorization>>;
}
type CreateAuthorization<TModel = unknown, TVirtuals extends object = Record<never, never>> = Omit<
  ServiceAuthorization<TModel, TVirtuals>,
  'rows'
>;
type OutputAuthorization<TModel = unknown, TVirtuals extends object = Record<never, never>> = Pick<
  ServiceAuthorization<TModel, TVirtuals>,
  'outputFields'
>;
```

`unknown`/`any` models deliberately have string fallback; known model/virtual shapes do not. A string index signature in a known model is deliberately dynamic, subject to runtime validation. Ref target interiors are validated at runtime even if an application types a ref as a populated object. Related targets are dynamically named, hence their string paths; their receiving schema validates them before dispatch. `inputFields`, `subdocuments`, top-level `operation`, arbitrary extra policy keys, and keys on the wrong union variant reject. No string/boolean shorthand for a policy. Undefined optional dimensions mean request; explicitly null policies/dimensions and null/undefined `scope.filter` are BadRequest. Empty `{}` scope is valid, false is terminal. Copy/cycle-check policy before awaiting any hook.

Keep existing query/presentation members of internal option interfaces, add generic parameters `<TModel = unknown, TVirtuals extends object = Record<never, never>>`, and add exactly one authority property:

- `FindOptions`, `FindOneOptions`, `FindByIdOptions`, `UpdateOneOptions`, `UpdateByIdOptions`, `UpsertOptions`: `readonly authorization?: ServiceAuthorization<TModel, TVirtuals>`.
- `CreateOptions`: `readonly authorization?: CreateAuthorization<TModel, TVirtuals>`; supplied `rows` rejects even when its mode is request.
- New named `NewArgs { select?: string[] }` and `NewOptions<TModel, TVirtuals>`: existing skim/permission flags plus `readonly authorization?: OutputAuthorization<TModel, TVirtuals>`. Both `rows` and `related` reject; new has no populate/include dispatch. `select` stays ignored, including `[]` and exclusions.
- `CreateArgs` gains `select?: Projection`; update/upsert args retain their existing generics and gain the same ordinary `select`. Remove all `overrides` members at SVA-09. Keep find/by-ID args' ordinary current members.
- All `Public*Options`, `Public*Args`, advanced/root wire envelopes and dedicated subdocument options remain request-only. `Defaults` uses authority-free option views (`Omit<InternalOptions, 'authorization'>`), and authority-free args after removal. Do not extend public types from newly authorized internal types. A mistyped authority default rejects at configuration/admission rather than silently granting.

Use existing internal data return generics; do not couple this release to a separate service-result inference redesign. Refine successful integrated results to guarantee their internal context:

```ts
// Opaque type; unique-symbol brand is private and has no exported constructor.
// Runtime acceptance additionally requires package WeakMap membership (D00.4).
declare const documentAuthorizationBrand: unique symbol;
interface DocumentAuthorization { readonly [documentAuthorizationBrand]: true }
interface ServiceOutputContext extends ModelHookContext {
  readonly documentAuthorization: DocumentAuthorization;
  getDocumentAuthorization(output: object): DocumentAuthorization | undefined;
}
type AuthorizedSingleResult<T = unknown> = Omit<SingleResult<T>, 'context'> & {
  readonly context: ServiceOutputContext;
};
type AuthorizedListResult<T = unknown> = Omit<ListResult<T>, 'contexts'> & {
  readonly contexts: readonly ServiceOutputContext[];
};
type ServiceOutputDecorator = (doc: unknown, context: ServiceOutputContext) => unknown;

// Within Service<TModel, TVirtuals>; method argument positions do not change.
find(filter: Filter<TModel>, args?: FindArgs<TModel>, options?: FindOptions<TModel, TVirtuals>,
  decorate?: ServiceOutputDecorator): Promise<AuthorizedListResult<TModel> | ErrorResult>;
findOne(filter: Filter<TModel>, args?: FindOneArgs<TModel>, options?: FindOneOptions<TModel, TVirtuals>):
  Promise<AuthorizedSingleResult<TModel> | ErrorResult>;
findById(id: string, args?: FindByIdArgs<TModel>, options?: FindByIdOptions<TModel, TVirtuals>):
  Promise<AuthorizedSingleResult<TModel> | ErrorResult>;
create(data: Record<string, unknown> | Record<string, unknown>[], args?: CreateArgs,
  options?: CreateOptions<TModel, TVirtuals>, decorate?: ServiceOutputDecorator):
  Promise<AuthorizedListResult<TModel> | ErrorResult>;
updateOne(filter: Filter<TModel>, data: Record<string, unknown>, args?: UpdateOneArgs<TModel>,
  options?: UpdateOneOptions<TModel, TVirtuals>, decorate?: ServiceOutputDecorator):
  Promise<AuthorizedSingleResult<TModel> | ErrorResult>;
updateById(id: string, data: Record<string, unknown>, args?: UpdateByIdArgs<TModel>,
  options?: UpdateByIdOptions<TModel, TVirtuals>, decorate?: ServiceOutputDecorator):
  Promise<AuthorizedSingleResult<TModel> | ErrorResult>;
upsert(filter: Filter<TModel>, data: Record<string, unknown>, args?: UpsertArgs<TModel>,
  options?: UpsertOptions<TModel, TVirtuals>, decorate?: ServiceOutputDecorator):
  Promise<AuthorizedSingleResult<TModel> | AuthorizedListResult<TModel> | ErrorResult>;
new(args?: NewArgs, options?: NewOptions<TModel, TVirtuals>):
  Promise<AuthorizedSingleResult<TModel> | ErrorResult>;
```

`new`/public `_new` must now include `ErrorResult` in their return union to express invalid-policy/control-slot admission; successful new output/cardinality stays the same. Scalar create still returns one list item. Upsert update returns single, create returns list. Public wrappers retain their existing selected/populated output inference and existing success shapes; they do not expose the refined context as a wire DTO.

In `interfaces/base.ts`, make the existing optional `ListResult.contexts` a `readonly ModelHookContext[]` so the refined readonly contexts remain assignable to existing `ServiceResult` consumers. Locally constructed hook-context arrays can still be mutable during execution; their returned view is readonly. This does not make legacy diagnostic hook properties into immutable authority.

Standalone `exists(filter, options?: ExistsOptions)`, `count(filter, access?)`, `delete(id)`, and `distinct(field, args?)` gain no authorization option or initiating guard. Package-owned scoped count/exists use D00.7's private executors. Existing `countTrusted` is not the new transport: migrate its package callers; expansion/retirement of that separate legacy helper is outside service-container removal.

##### D00.3 — Field catalog, selection and examples (C2/C3)

Capture the actual runtime Mongoose model's `schema.paths`, child schemas, nested containers and configured virtual registry at operation entry, together with permission rules, always-select inputs, identity/metadata posture and applicable getters. Do not use `schema.obj`/`getModelAtt()` alone. Freeze an owned catalog; do not enumerate output-object keys to discover new fields.

| Kind                                              | Catalog / authorization behavior                                                                                                                                                                                                                                                                                                                                                          |
| ------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Declared persisted scalar, object, embedded array | Eligible whether or not permissionSchema mentions it. Recurse declared child schemas; include container paths so explicit subtree grants are meaningful. Schema timestamps are ordinary persisted fields.                                                                                                                                                                                 |
| Mongoose `select: false`                          | Eligible. A selected grant (including named grant under omitted selection) or unrestricted policy may positively fetch it. It is a database default, not a stronger denial than server authority. Omitted unrestricted selection includes these declared business paths too.                                                                                                              |
| Registered computed virtual                       | Eligible output only; dependency fetching and applicable getter checks still apply. Registered inactive virtuals never fall back to a stored same-name value. Mongoose's automatic `id` virtual, aliases and arbitrary unregistered virtuals are not added to unrestricted output.                                                                                                        |
| Mixed root / Map root                             | Eligible declared opaque roots. Selecting/granting the root authorizes its existing safe value/subtree. Omitted unrestricted includes roots; it does not discover unrelated undeclared fields on strict:false documents.                                                                                                                                                                  |
| Mixed / Map descendants                           | Safe explicit response paths are valid beneath the declared root (Map-of-subdocument descendants also validate declared child paths). A grant naming a descendant under omitted selection counts as an explicit eligible path. Fetch/project only requested branches; do not implicitly grant siblings. Map wildcard `$*` is not a policy path.                                           |
| Ref path                                          | Parent catalog stops at the stored ref/array path. Parent `customer` grant authorizes relationship visibility, never `customer.billingEmail`. Populated contents require target `related.customer` policy and target selection.                                                                                                                                                           |
| Implementation / metadata                         | Exclude version key (`__v` or configured equivalent), `_doc`, `$__`, Mongoose implementation properties and unsafe prototype segments. Permission metadata uses its own configured path/posture and cannot be granted; reject equal/ancestor/descendant metadata grant paths. `_id` remains system identity, with explicit `-_id` winning output and private identity retained for fetch. |

Grant grammar: nonempty, unsigned dot-separated safe response segments; reject `.sub` permission-definition markers, whitespace, brackets, indices/numeric segments, empty segments, wildcards, `$`-prefixed segments, `__proto__`, `prototype`, `constructor`. Check known schema paths and dynamic-root descendants. Do not reserve every persisted business property called `authorization` or `overrides`: declared fields with those names remain data; control-slot rejection is separate. Root/subtree unrestricted projection must still exclude protected metadata/implementation keys.

`request OR explicit grant` is the only effective field rule. Global false, document false, rule false, or absent rule cannot veto a valid server grant. A grant adds eligibility under omitted selection but never adds to an explicit inclusion or overrides an explicit exclusion. Empty grants add nothing. Preserve current projection grammar, empty-select normalization, and `requireExplicitSelect`; with require-explicit and no effective select, authority does not conjure a selection. Do not fetch a granted-but-unselected value solely because it was granted.

Concrete examples for SVA-02/03/05/07:

- `select: ['contacts.email']`, grant `contacts.email`: retain minimal contacts array/object structure plus email, not ssn/name siblings. With `select: ['contacts']`, the email grant additionally preserves normally request-authorized children, but still not denied ssn. Container denial cannot suppress a descendant grant's minimal ancestor structure.
- `select: ['contacts.email']`, grant `contacts`: subtree authority still returns only email. `select: ['contacts']`, grant `contacts`: authorize all selected eligible descendants, including embedded virtuals if their getters apply. No referenced model inherits it.
- Omitted select with grant `internalNote`: normal defined request fields plus note become candidates. Omitted unrestricted: catalog business fields and applicable registered virtuals, including declared select:false fields; never arbitrary undeclared keys, implementation state or policy state.
- `_id` identity and permission metadata are independently retained/removed by identity/metadata options. Grants do not forge `_view`, `_edit` or document-hook keys. `pickAllowedFields` is not a selection pass: it can only filter values already present.

Central scenario's required oracle (`select: ['status', 'internalNote']`, grant note; `alwaysSelectFields.read: ['ownerId']` only in the document-dependent fixture):

| Variant                                                                | Required persistence projection                                               | Required finalized data / handle-aware pick                                                  |
| ---------------------------------------------------------------------- | ----------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------- |
| `status.read: true`, note false or absent from rules                   | status, note, private identity                                                | status + stored note                                                                         |
| `status.read: false` with no dependency use                            | note + private identity; no status                                            | stored note only                                                                             |
| `status.read: 'owner'` or function using actual document grants        | status, note, ownerId + private identity; function not called during planning | status iff full hook grants allow, stored note regardless of note's request denial           |
| note absent in stored row                                              | Same authorized projection                                                    | No fabricated note                                                                           |
| select only status, still grant note                                   | No note unless independently needed privately                                 | No note                                                                                      |
| inaccessible request row / false scope                                 | No primary/child persistence for early false; predicate miss yields NotFound  | No document handle/data; output grant cannot admit a row                                     |
| skim, permissions/maps disabled, strip enabled or exposed keys limited | Same needed policy inputs                                                     | Same business output and valid handle; metadata posture only changes metadata                |
| two owner-different list rows                                          | Same call plan, independently projected row inputs                            | Different per-row grants; no cross-row handle reuse, even with a matching ID in another call |

Hook inputs are the untrimmed **projected** document. Applications explicitly declare additional persisted hook inputs through `alwaysSelectFields`; a hook is not permission to fetch the entire collection document. Finalizer resolves full document-hook results once per owning snapshot/access stage independent of skim/metadata, and output-rule functions once per field/scope/stage as needed. Mutation pre-write and post-write stages are distinct even when both use the `update` hook.

##### D00.4 — Viable immutable call/document state and internal result handles (C1/C4/C9)

Resolve input authority once into a package-owned `ResolvedServiceAuthorization` in `acl/service-authorization.ts` (private source-module type, not a consumer-supplied option). It owns request identity, runtime identity, receiving model identity, call identity, model scope, configuration/catalog snapshot, a privately copied request-permission view, copied modes/paths/filters/related policies, initiating operation and effective access tuple. Preserve the original actor and `req.macl` map. Copy before awaiting; never expose a mutable Set/Map, caller-owned filter, or hook-grant object as authority. Functions stay references in the configuration snapshot; mutable arrays/records/BSON predicate values are independently owned. Derived upsert/related scopes retain provenance but have distinct applicable contexts.

`DocumentAuthorization` is an opaque, frozen package-issued object backed by a **module-private WeakMap**, not an object accepted because its brand/properties look correct. No enumerable fields, raw grants, rules, DTO marker, or usable JSON representation. Its private record binds:

1. resolved call identity, original request and runtime, receiving model;
2. owning untrimmed projected document snapshot and unique stage identity (not `_id`);
3. response scope (root or embedded path/element), virtual/output/doc-permission accesses;
4. full independently owned hook grants and privately memoized field decisions;
5. exact authorized output identities/copies associated by package code, with an isolated value snapshot for stale/mutated-output validation.

Results expose it through **internal result context**, never through `data`:

- Every successful integrated single result has `result.context.documentAuthorization`; every integrated list/create result has one context/handle per row at the same index, including an empty contexts array for empty data. Create/update/new must now return these contexts (baseline does not).
- Add `documentAuthorization` and `getDocumentAuthorization` as non-enumerable, non-writable context properties. Keep legacy diagnostic hook properties distinct; editing `context.docPermissions` cannot alter the handle. Never serialize authority by spreading a context into data.
- `context.getDocumentAuthorization(output)` performs exact identity/snapshot lookup in that result's finalized output graph, returning the root, embedded or related target handle, or `undefined` for an unknown/stale value. It cannot issue a handle for arbitrary data. This supports a subsequent target-service helper on `result.data.customer` and per-parent include copies after joins/metadata cleanup. Scalar IDs/null/counts have no child handle.
- Public serializers continue to omit context(s); no handle, policy or token is attached to data by symbol or otherwise. Public wrappers start request-only contexts. Output diagnostic context is internal even when the service is used by backend code.
- Package-private output association records explicitly transfer a handle to isolated finalizer/metadata-trim/include-pairing/helper-return copies **within the same stage**. `pickAllowedFields` registers its own returned subset as a derivative. Do not accept arbitrary caller spreads, matching IDs, `_permissions`, or merely equal JSON as proof of provenance. A private helper can associate an internally made copy only from an already-associated source.
- Mutated/replaced output, changed access, wrong receiver/runtime/request, another row, another call, or pre-write handle used post-write rejects with controlled BadRequest; it does not rerun hooks on the stale/trimmed value. Compare associated output to its private value snapshot when consuming a handle, including Date/Buffer/BSON values. No raw persistence doc is mutated by a named output helper.
- Trusted decorate/decorateAll/tasks remain post-finalization application stages and may remove or construct output. They receive the handle before changing the finalized input, but an arbitrary mutation/replacement does not automatically gain a valid associated-output handle. No automatic second authorization pass is promised. Backend same-execution picks should use the finalized output before presentation changes, or an unchanged returned output.

Concrete backend use (same pattern works for a create row or a list row/context pair):

```ts
const result = await service.findOne(
  { _id: orderId },
  { select: ['status', 'internalNote'] },
  { authorization: { outputFields: { mode: 'grant', paths: ['internalNote'] } } },
);
if (result.success) {
  const picked = await service.pickAllowedFields(result.data, 'read', {
    documentAuthorization: result.context.documentAuthorization,
  });
  // ownerId and _permissions may both be absent. status keeps its original
  // owner-dependent decision, note keeps its server grant; hook count is 1.
  await service.trimOutputFields(picked, 'read', {
    documentAuthorization: result.context.documentAuthorization,
  });
}
```

For a related child, obtain `const childHandle = result.context.getDocumentAuthorization(child)` and pass it to **that target model's** service/helper. Embedded handles belong to the owning model with translated scope. Child and parent results may share owning grants for embedded data, never another model's document grants.

##### D00.5 — Exact named helper overloads (C3/C4)

```ts
interface OutputPlanningOptions<TModel = unknown, TVirtuals extends object = Record<never, never>> {
  readonly authorization?: OutputAuthorization<TModel, TVirtuals>;
  readonly scopePath?: readonly string[]; // Response segments, e.g. ['contacts']; not ['contacts', 'sub'].
}
type OutputFieldOptions<TModel = unknown, TVirtuals extends object = Record<never, never>> =
  | (OutputPlanningOptions<TModel, TVirtuals> & { readonly documentAuthorization?: never })
  | { readonly documentAuthorization: DocumentAuthorization; readonly authorization?: never; readonly scopePath?: never };
type AllowedOutputFieldOptions<TModel = unknown, TVirtuals extends object = Record<never, never>> =
  OutputFieldOptions<TModel, TVirtuals> & { readonly purpose: 'output' };

// Base/Service canonical overloads; options is required to disambiguate legacy calls.
genSelect(access: SelectAccess, select: Projection | undefined, options: OutputPlanningOptions<TModel, TVirtuals>): Promise<string[]>;
genQuerySelect(access: SelectAccess, select: Projection | undefined, options: OutputPlanningOptions<TModel, TVirtuals>): Promise<string[]>;
genAllowedFields(doc: unknown, access: SelectAccess, options: AllowedOutputFieldOptions<TModel, TVirtuals>): Promise<string[]>;
pickAllowedFields<T>(doc: T, access: SelectAccess, options: OutputFieldOptions<TModel, TVirtuals>): Promise<T>;
trimOutputFields<T>(doc: T, access: SelectAccess, options: OutputFieldOptions<TModel, TVirtuals>): Promise<T>;
```

`Core` exposes matching overloads with `modelName: string` prepended, explicit `<TModel = unknown, TVirtuals extends object = Record<never, never>>` on planning/allowed-field methods and `<T, TModel = unknown, TVirtuals extends object = Record<never, never>>` on pick/trim methods. Add Core `genQuerySelect`/`trimOutputFields` aliases to the same implementation rather than another evaluator. Base supplies its model generics. Scope-local field output uses ordinary relative response paths; grant paths always refer to the owning receiving model.

Named options accept **output authority only**. Rows, related operation admission, arbitrary base fields, and skip flags are not helper capabilities and reject if supplied. The document-handle variant derives policy/scope from its private record and cannot be mixed with raw authority/scope. `genAllowedFields` requires `purpose: 'output'` in this overload so it cannot accidentally replace write admission. Shared planner/evaluator handles deferred/granted/denied fields; output functions receive `(requestPermissions, fullDocumentGrants)` with `this` set to original request. Planning never invokes document-dependent functions.

Canonical service execution uses private planner/finalizer entrypoints accepting the resolved call context, retaining the **same plan**, not repeated calls to raw-policy overloads. Public named genSelect/genQuerySelect each independently create a planning context and return its persisted fetch selection. Finalizers receive that retained plan and resolve/issue document results; later filtering uses the issued result. No private context is accepted as a structurally shaped public helper option.

Raw-policy pick/allowed-fields calls on an unassociated input independently resolve its document grants; `{}` means fresh request authorization. They filter existing values, do not compute getters, select, restore missing data, check rows or grant writes. Raw explicit grants still work even if hook inputs are absent; document-dependent rules require the documented untrimmed hook input. If the package recognizes its own finalized/trimmed output, a fresh no-handle call may apply unconditional request rules and explicit grants but must treat unresolved document-dependent rules as denied, without rerunning a hook on the trimmed DTO. Only the original handle reuses original decisions.

Keep the existing positional overloads and omitted-options behavior for external compatibility: genSelect/genQuerySelect `(access, select?, skipChecks?, subPaths?)`, genAllowedFields/pick/trim `(doc, access, baseFields?)`, plus Core's modelName prefix. They remain explicitly legacy, with their current behavior. Input admission and DataCore/DataService keep their existing request evaluator; integrated model output never invokes a legacy overload as authority transport. SVA-F03 alone retires positional APIs.

##### D00.6 — Frozen access/operation matrix (C6/C7/C8)

There is no new blanket initiating Service operation guard. Existing route/basic/advanced guards and public fallback checks stay at their current server-owned boundaries. Related target operation admission remains explicit and independently grantable; query-field/sort/distinct/`$$sq` admission does not inherit field grants.

| Execution                                          | Initiating operation          | Row / input access                                                                                  | virtualAccess        | outputAccess     | docPermissionsAccess                     |
| -------------------------------------------------- | ----------------------------- | --------------------------------------------------------------------------------------------------- | -------------------- | ---------------- | ---------------------------------------- |
| find/list                                          | list                          | list / none                                                                                         | list                 | list             | list                                     |
| findOne/findById                                   | read                          | requested read or list / none                                                                       | effective access     | effective access | effective access                         |
| public read-to-list fallback                       | read                          | read attempt, then list if allowed miss and list guard permits                                      | list on fallback     | list             | list                                     |
| create                                             | create                        | no existing-row lookup / create                                                                     | create               | read             | create                                   |
| updateOne/updateById                               | update                        | update / update                                                                                     | update               | read             | update (fresh post-write stage)          |
| internal upsert update                             | upsert                        | update lookup + same prepared update predicate / update                                             | update               | read             | update                                   |
| internal upsert create                             | upsert                        | allowed update-policy miss / create                                                                 | create               | read             | create                                   |
| public upsert with ID                              | upsert                        | update-policy exists; denied is Forbidden, allowed miss remains Unauthorized, never create / update | update               | read             | update                                   |
| public upsert without ID                           | upsert                        | no existing-row lookup / create                                                                     | create               | read             | create                                   |
| new                                                | new                           | none; create-template output, ignored select                                                        | create               | create           | create                                   |
| populate                                           | parent's initiating operation | target populateAccess / none                                                                        | target access        | target access    | target access                            |
| include read/list                                  | target read/list              | target read/list / none                                                                             | target access        | target access    | target access                            |
| include count                                      | count                         | target count / none                                                                                 | none                 | none             | none                                     |
| embedded in integrated output                      | parent's initiating operation | owning model's policy; no new child row scope                                                       | inherit owning tuple | inherit          | owning grants, translated scope          |
| dedicated subList                                  | subList                       | parent read + `subs.<sub>.list` / none                                                              | list                 | list             | owning parent read                       |
| dedicated subRead                                  | subRead                       | parent read + `subs.<sub>.read` / none                                                              | read                 | read             | owning parent read                       |
| dedicated subCreate                                | subCreate                     | parent update + existing child gates / create; post-save parent read + child list/read visibility   | create               | read             | owning parent read                       |
| dedicated subUpdate/subBulkUpdate                  | subUpdate/subBulkUpdate       | parent update + child update / update; post-save parent read + child read visibility                | update               | read             | owning parent read                       |
| delete/subDelete, standalone exists/count/distinct | existing operation            | existing request-only accesses                                                                      | none                 | none             | existing delete/input hook behavior only |

Default population access remains read for list/create/update, effective read/list for findOne unless configured/supplied populateAccess. Allowed non-reserved custom target accesses retain their exact access strings; policy operation grant cannot select a reserved route variant. Read fallback resolves the identifier once but prepares separate read/list row contexts (a read prepared token cannot be reused at list access). Invalid/terminal-denied read never retries.

Upsert's allowed miss does not copy scope/query values into inserted input. Derive an output/related-only create authorization from the immutable upsert context; do not forward rows to create. Preserve validation/prepare/transform/afterPersist/changes/save, bounded hooks and existing successful null/empty post-write subdocument visibility. Dedicated subdocument signatures gain no new authority options; use explicit request-mode shared-helper contexts and owning-parent grants with/without virtuals.

##### D00.7 — Row composition, related admission and private transport (C5/C7/C8)

Row formula: `AND(transformedOrdinaryQuery, selectedRowScope, mandatoryRelationshipPredicate)`. Omit only dimensions that are explicitly inapplicable. Request scope is the existing baseFilter, scope mode supplies a copied inert predicate instead, unrestricted supplies no base scope. Configured `overrideFilter.<access>` runs once per logical preparation in **all three modes**. Request mode caches baseFilter as before; scope/unrestricted never call it or seed its cache. A transform that returns false denies every mode; a transform adding a user restriction retains that restriction in every mode. No transform or trusted scope can remove separately retained relationship constraints.

Concrete row oracle for SVA-04: caller `{status:'open'}`, non-idempotent transform returns `{status:'review', transformPass: ++passes}` (reset passes to zero per call), base scope `{tenant:'request'}` and trusted scope `{tenant:'backend'}`. Request yields transformed AND request tenant; scope yields transformed AND backend tenant; unrestricted yields transformed only. `transformPass` stays 1 through internal reuse/count. With mandatory `{customerId: parentId}`, every mode also ANDs that join. Hook call count is one. Repeat all modes with a permission-dependent transform returning false: all Forbidden, primary/child persistence count zero after the transform. An early known false input/scope/ID prevents the transform and any earlier parsing work too.

Private implementation seam (source-module exports only, no package/advanced re-export, no string/symbol option accepted from callers):

```ts
// acl/prepared-query.ts owns opaque PreparedModelQuery and ResolvedIdentifier
// tokens, both frozen shells authenticated by private WeakMaps.
type QueryInput<T = unknown> =
  | { readonly kind: 'client-read'; readonly filter: Filter<T> } // parse client markers once
  | { readonly kind: 'mutation-lookup'; readonly filter: Filter<T> } // preserve current inert lookup inputs
  | { readonly kind: 'expanded'; readonly filter: Filter<T> }; // package substitution already validated
prepareModelQuery(receiver: Service, execution: ServiceExecutionContext, input: QueryInput,
  mandatoryFilter?: Filter): Promise<PreparedModelQuery>;
resolveModelIdentifier(receiver: Service, execution: ServiceExecutionContext, id: string): Promise<ResolvedIdentifier>;
// Internal executor registry registered by Service; methods are not Service options/public methods.
executePreparedFindOne(receiver: Service, execution: ServiceExecutionContext, query: PreparedModelQuery,
  args: FindOneArgs, options: FindOneOptions): Promise<AuthorizedSingleResult | ErrorResult>;
executePreparedFind(receiver: Service, execution: ServiceExecutionContext, query: PreparedModelQuery,
  args: FindArgs, options: FindOptions, decorate?: ServiceOutputDecorator): Promise<AuthorizedListResult | ErrorResult>;
executePreparedUpdateOne(receiver: Service, execution: ServiceExecutionContext, query: PreparedModelQuery,
  data: Record<string, unknown>, args: UpdateOneArgs, options: UpdateOneOptions,
  decorate?: ServiceOutputDecorator): Promise<AuthorizedSingleResult | ErrorResult>;
executeCreate(receiver: Service, execution: ServiceExecutionContext,
  data: Record<string, unknown> | Record<string, unknown>[], args: CreateArgs, options: CreateOptions,
  decorate?: ServiceOutputDecorator): Promise<AuthorizedListResult | ErrorResult>;
executePreparedExists(receiver: Service, execution: ServiceExecutionContext, query: PreparedModelQuery,
  includeId: boolean): Promise<SingleResult<boolean | { _id: unknown } | null> | ErrorResult>;
executePreparedCount(receiver: Service, execution: ServiceExecutionContext, query: PreparedModelQuery):
  Promise<SingleResult<number> | ErrorResult>;
executePreparedGroupedCount(receiver: Service, execution: ServiceExecutionContext, query: PreparedModelQuery,
  foreignField: string, values: readonly unknown[]): Promise<SingleResult<ForeignKeyCountIndex> | ErrorResult>;
```

Keep generics in the real private implementations; the private signatures above elide them only for readability. `ServiceExecutionContext` is package-owned and not accepted in service args/options. Its private executor registry is a WeakMap keyed by Service instances, with callbacks installed by the implementation; external JSON cannot call a structurally supplied executor. Options passed into these executors are already normalized presentation options; their raw authorization slot must not be re-resolved/merged over the execution context.

Prepared records retain request/runtime/receiver-model/call-scope/effective row-access identity, resolved authorization, parsing provenance, original ordinary predicate, transformed predicate, selected row scope, mandatory constraints, and composed final predicate/terminal denial. All are owned snapshots. The executor verifies every binding; same ID/filter/structural brand is insufficient. A token may be reused only by explicitly derived stages in its logical execution (upsert lookup/update, matching total-count); it cannot be replayed against an unrelated call, access, model or runtime. A terminal token performs no persistence.

Identifier tokens are separately bound to request/runtime/model/call, reusable to prepare read and list fallback once each; they are not authorization and cannot bypass row preparation. Ordinary direct identifier predicates retain configured query-transform semantics. Related ref/ID predicates are additionally mandatory relationship constraints. No public `preparedFilter`, `preparedQuery`, `execution`, `documentAuthorization`, `skipParsing`, `skipAuthorization`, or `alreadyAuthorized` control slot is added.

Migration seams:

- Upsert prepares once under update rows, performs lookup, then consumes the same authorized predicate on its update branch. Create derives only applicable policy; no fake null caller query.
- Legacy list/read includes put foreign/local equality in mandatory constraints, parse the ordinary target predicate once as applicable, authorize once, then execute with private association values and target plan. Counts share target row preparation and schema casting/grouped distinct-ID semantics; limits never narrow count totals.
- Correlated list/read parse the template before substitution as today, substitute, validate expanded operand budgets, then use `expanded` preparation; never parse substituted `$$sq`/`$$date` values. Correlated count keeps its existing non-parsing template behavior; this release does not add executable template operators there. Correlated ID resolves once, attaches mandatory identity constraint and prepares once. Read/list miss/error shapes remain unchanged.
- `find.totalCount` uses the same prepared row predicate. Internal metadata exists/readability checks retain the request-user metadata contract: backend grants must not forge request `_view`/`_edit`. They use explicit request-mode derived contexts where the purpose is describing request permission, not the elevated query's total count.

Related policy entries must match a requested populate/include path in that receiving scope and exact registered target model. Reject unused/misspelled entries, duplicate ambiguous descriptor paths, model mismatch, metadata/virtual output collisions, or unsupported dimensions before persistence. Count targets accept only model/operation/rows, rejecting supplied outputFields/related. Parent relationship field must be eligible; target operation grant bypasses only its established base operation gate, not row/output policy or route variants. Child modes default request, never inherit parent unrestricted. Include attachment paths remain the existing explicitly requested attachment contract. Scope filters are inert; `$$sq` remains request-only and gets no related authority.

##### D00.8 — Release and downstream handoff (C9/C10)

The designated **breaking release** ships the replacement and removal of all six service override controls together, after all required tasks pass. Version/date remain release-administration placeholders. No adapter, hidden fallback, input elevation, subdocument policy tree or blanket service guard is part of this release. SVA-F01/F02/F03 remain deferred by explicit choice.

Migration examples: `overrides.select: ['internalNote']` becomes ordinary selected fields plus `authorization.outputFields: { mode: 'grant', paths: ['internalNote'] }`; trusted object filter replacement becomes an explicit ordinary predicate plus `rows: { mode: 'scope', filter: tenantScope }` or `rows: { mode: 'unrestricted' }`. Neither row mode bypasses configured overrideFilter: move replaceable user row restrictions from that hook into baseFilter. Populate replacement becomes ordinary populate plus separate parent relationship and target grants. Custom identifier replacement becomes findOne/updateOne. Package prepared/effectiveSelect/operation transports follow D00.7/D00.2/D00.6. Named helpers replace visibility baseFields in canonical examples; positional retirement stays deferred.

SVA-01 must implement this API/context surface without activating grants; SVA-01A must reject authority/prepared/retired control slots at public/root/nested/populate/subquery dispatch and after custom-validator transformations. Validation targets actual control slots, preserving payload data properties with the same English names. Later removal rejects any supplied service `overrides` slot (including empty/mixed policies) before parsing with actionable BadRequest. Helpers throw the established controlled client error; service methods map it to ErrorResult. README/packed declarations must explain immutable handle reuse, projected hook inputs, select:false eligibility, ignored new select, target gates and transform migration. Record all migration/release notes here or in README; **never modify root CHANGELOG.md**.

Completion evidence:

- Changed: `docs/tasks/20261007-143507-access-router-explicit-service-authorization.md` and `packages/access-router/test/service-authorization-baseline.contract.test.ts` only. Added 16 Mongo-backed semantic characterization cases; no runtime authorization implementation. D00.1–D00.8 freeze the API, catalog, helper/handle lifecycle, access matrix, transport, target behavior oracles, release/removal and deferred scope.
- Passed, serially (all commands executed from `<repo-root>`):

  ```sh
  pnpm --filter @web-ts-toolkit/access-router... build
  pnpm --filter @web-ts-toolkit/access-router exec vitest run --config vitest.config.ts test/service-denial-contract.test.ts test/filter-denial.integration.test.ts test/read-list-fallback-authorization.integration.test.ts test/cross-resource-authorization.integration.test.ts test/correlated-includes.execution.test.ts test/grouped-count-casting.integration.test.ts test/virtuals-projection-planner.unit.test.ts test/virtuals-finalizer.unit.test.ts test/virtuals-direct-operations.integration.test.ts test/virtuals-populate-include.integration.test.ts test/virtuals-embedded-subdocuments.integration.test.ts
  pnpm --filter @web-ts-toolkit/access-router typecheck
  pnpm --filter @web-ts-toolkit/access-router exec vitest run --config vitest.config.ts test/service-authorization-baseline.contract.test.ts
  pnpm exec eslint packages/access-router/test/service-authorization-baseline.contract.test.ts
  ```

- Results: dependency/package build passed; required focused baseline **11 files / 208 tests passed**; source typecheck passed (its script performed its own subsequent dependency rebuild); final new suite **1 file / 16 tests passed**; focused ESLint passed. Earlier new-suite iterations also passed (13, then 15 cases); the final 16-case run is the completion gate. No concurrent build/test scripts were launched. No environment or pre-existing test failures were observed; Vitest emitted only its existing Vite native-config compatibility warning.
- The ownerId/metadata fixture deliberately asserts the **current grant-loss/skim defect**. The same-execution handle-preservation oracle and signatures in D00.3–D00.5 are required downstream behavior, not a claim that the new capability passed on old code. SVA-03/05 replace that historical assertion with hook-count-one and retained status/note assertions after SVA-01A admission.
- Handoff: SVA-01 is ready with no unresolved API/behavior blocker. SVA-01A remains the hard prerequisite for runtime authority. All other required tasks remain pending; SVA-F01/F02/F03 remain deferred. Full package/workspace/packed-release gates belong to the later specified waves.
- Root `CHANGELOG.md` was not edited. `git hash-object CHANGELOG.md` matched the initial hash `c0561a1048c2341b14dd7f9d3e7c1fc055ae1880` before and after the SVA-00 work. No staging, commits, resets or unrelated changes.

### Task SVA-01: Add typed policy inputs and an immutable operation authorization context

Status: completed

Priority: P0

Suggested role: TypeScript API / context engineer.

Dependencies: SVA-00.

Primary ownership:

- `packages/access-router/src/interfaces/service-authorization.ts` (proposed new file).
- `packages/access-router/src/acl/service-authorization.ts` (proposed new file).
- `packages/access-router/src/interfaces/index.ts`, `root.ts`, `router-hooks.ts`, `service-find.ts`, `service-create.ts`, `service-update.ts`, `service-exists.ts`, `service.ts`.
- `packages/access-router/test/service-authorization-context.unit.test.ts` (new).

Finding: B2/B7; there is no immutable, per-call grant context, and internal/public type inheritance can unintentionally expose it.

References: C1, C6–C9; `interfaces/root.ts:127-151`, `interfaces/base.ts:27-49`, `interfaces/query-types.ts:134-193`.

Implementation requirements:

1. Implement the first-release discriminated unions and related-target policies with read-only typed output paths and unknown-model fallback. Reject deferred `inputFields`/`subdocuments` keys; no types imply they are implemented.
2. Split internal service options from public/root wire types. Keep authorization out of every `Public*Options`, advanced-body wire interface, client transport, and `RootQueryEntry`.
3. Add ordinary `select` to internal mutation arguments; put initiating operation/prepared state in a private execution context rather than argument `overrides`.
4. Normalize/copy policy input once, validate modes/path grammar/target models/control metadata, and reject malformed/cyclic policy input before persistence with the agreed errors.
5. Implement separate immutable call-policy and per-document result owners as C1 requires. Copy inputs before awaiting; bind document results to the call and original document/access stage, including cached output-rule decisions.
6. Exclude authority from router/default query and presentation option types. Resolve a supplied per-call authorization object as one policy; omitted dimensions are request-mode and do not merge authority from other calls or defaults.
7. Bind private resolved contexts to runtime/model/scope; reject use against a different receiver. Keep original request identity and permission maps untouched.
8. Add normalization/types and context primitives only at this step. Runtime services and policy-aware helpers start honoring authority after SVA-01A completes.

Acceptance criteria:

- Unknown mode, malformed scope, mismatched target, protected metadata path, and unsafe path fail before adapter/hook/subquery work.
- Known-model output grant paths type-check correctly; unknown paths, unsupported policy dimensions, and raw-policy/document-handle mixtures fail strict fixtures/runtime validation.
- Input mutation, same-request overlapping calls, reusing a Service instance, and two runtimes do not transfer/widen grants.
- Call policy can be shared across list rows while their per-document permission results remain distinct. Same `_id` in another operation/runtime or a later document stage cannot reuse a prior handle.
- Public types cannot express authorization, prepared-query state, or an internal initiating operation.
- Focused context tests and the package source typecheck pass.

Completion evidence:

- Changed paths (SVA-01 ownership):
  - `packages/access-router/src/interfaces/service-authorization.ts` — readonly policy unions, bounded `OutputFieldPath` with unknown/any fallback, output-only/create policies, opaque document handle, output context/result/decorator types, and mutually exclusive named helper option types.
  - `packages/access-router/src/interfaces/service-find.ts`, `packages/access-router/src/interfaces/service-create.ts`, `packages/access-router/src/interfaces/service-update.ts`, `packages/access-router/src/interfaces/service.ts` — generic internal authority options, ordinary internal mutation `select`, and named `NewArgs`/`NewOptions`. Existing public mutation option bases remain authority-free.
  - `packages/access-router/src/interfaces/base.ts` — readonly legacy result-context array compatibility; root data-list options narrowed to the supported `includeCount` member instead of an arbitrary control-slot index signature.
  - `packages/access-router/src/interfaces/root.ts` — authority-free default option views.
  - `packages/access-router/src/interfaces/index.ts`, `packages/access-router/src/index.ts` — agreed type-only exports through root and `/advanced`; no new entrypoint or runtime issuer export.
  - `packages/access-router/src/services/service.ts` — **type annotations/imports only**, retaining model/virtual generics on the new internal options.
  - `packages/access-router/src/acl/service-authorization.ts` — authenticated immutable call owner, synchronous policy normalization/capture, receiving catalog/target validation, captured permission view and binding/provenance checks.
  - `packages/access-router/src/acl/authorization-snapshot.ts` — controlled BadRequest error, bounded/cycle-checked owned snapshots, Date/Buffer/RegExp/BSON isolation, and value/identity snapshot comparison support.
  - `packages/access-router/src/acl/document-authorization.ts` — separate authenticated document/stage owners, full grant capture, once-per-stage grant/field-decision promises, output association/transfer/staleness checks, opaque output-context creation, and callable private named-option normalization.
  - `packages/access-router/src/acl/service-execution.ts` — private execution/prepared/identifier/query-input **type definitions only** for SVA-04/05.
  - `packages/access-router/test/service-authorization-context.unit.test.ts`, `packages/access-router/test/service-authorization.types.fixture.ts` — 76 focused tests, including a strict emitted-declaration fixture with positive/negative policy, service, public/root/default, bounded-path and opaque-handle cases.
  - `docs/tasks/20261007-143507-access-router-explicit-service-authorization.md` — status and this evidence/handoff. The existing SVA-00 baseline test file was preserved without edits.

- Final verification from `<repo-root>` (build/typecheck/test scripts run serially):

  ```sh
  pnpm --filter @web-ts-toolkit/access-router typecheck
  pnpm --filter @web-ts-toolkit/access-router exec vitest run --config vitest.config.ts test/service-authorization-context.unit.test.ts test/service-authorization-baseline.contract.test.ts
  pnpm exec eslint packages/access-router/src/acl/authorization-snapshot.ts packages/access-router/src/acl/service-authorization.ts packages/access-router/src/acl/document-authorization.ts packages/access-router/src/acl/service-execution.ts packages/access-router/src/interfaces/service-authorization.ts packages/access-router/src/interfaces/base.ts packages/access-router/src/interfaces/index.ts packages/access-router/src/interfaces/root.ts packages/access-router/src/interfaces/service-create.ts packages/access-router/src/interfaces/service-find.ts packages/access-router/src/interfaces/service-update.ts packages/access-router/src/interfaces/service.ts packages/access-router/src/services/service.ts packages/access-router/src/index.ts packages/access-router/test/service-authorization-context.unit.test.ts packages/access-router/test/service-authorization.types.fixture.ts
  git diff --check
  git hash-object CHANGELOG.md
  ```

- Results: package source typecheck **passed**, including its serialized transitive dependency/package CJS/ESM/declaration build; focused suites **2 files / 92 tests passed** (**76** SVA-01 context/type tests plus the unchanged **16** SVA-00 baseline cases); focused ESLint and whitespace checks **passed**. The context suite compiles its declaration fixture using the resolved TypeScript CLI with `--ignoreConfig --noEmit --strict --skipLibCheck --target ES2022 --module NodeNext --moduleResolution NodeNext test/service-authorization.types.fixture.ts` in `packages/access-router`; no consumer temp directory is needed. No rebuilding scripts ran concurrently. Vitest emitted its existing Vite native-config compatibility warning only.
- Earlier iterations found and fixed a `Readonly<Permission>` nominal return-type issue and an unnecessary regex escape. Two initial BSON mutation assertions were ineffective because the installed ObjectId implementation returns a copy from `.id`; the tests now mutate through its setter and verify actual stale-value rejection. Final gates above passed after those fixes and the added embedded/stage tests.

Private API handoff (source-module exports only):

1. **Call capture:** `resolveServiceAuthorization(input)` takes `binding` (`request`, `runtime`, actual `model` identity, `modelName`, ordinary response `scopePath`), an `AuthorizationAccess` tuple, captured `AuthorizationConfiguration`, `requestPermissions`, optional raw `authorization`, applicability (`service`/`create`/`output`), and resolved `relatedTargets`. It validates/copies synchronously before any hook/await and issues a frozen empty shell authenticated by a private WeakMap. Omitted dimensions resolve to request authority; unsupported dimensions/union keys, null/malformed scopes, unsafe/protected/unknown/ref-interior grant paths, cycles, unused/ambiguous related paths, model mismatches and count-target output policies throw `ServiceAuthorizationError`. That error extends the established BadRequest class and carries a `Codes.BadRequest` `.result` for later service mapping.
2. **Captured views:** `readServiceAuthorization(call, binding)` returns detached snapshots of normalized policy, access, configuration and related-target configurations. `getAuthorizationPermissions(call, binding)` returns an independently owned frozen permission view; it never changes the request actor or `req.macl`. `assertAuthorizationBinding` verifies request/runtime/model/name/scope. An optional authenticated `parent` carries logical provenance only (same request/runtime); it does **not** inherit parent authority. `getAuthorizationProvenance` supports registered child-output lookup. SVA-02 supplies the real `schema.paths`/embedded/virtual catalog through `AuthorizationFieldCatalog` (`paths`, `opaquePaths`, `referencePaths`, `protectedPaths`) and owns schema-specific catalog refinements such as Map-of-subdocument descendants. These primitives do not discover a schema or execute a row/field policy.
3. **Document owner:** `createDocumentAuthorizationStage(call, binding, projectedSnapshot)` captures an untrimmed projected **plain** snapshot. Keep that snapshot distinct from the working finalized output and hydrated persistence document. Each row/access stage gets its own token, including equal IDs and pre-/post-write snapshots. `resolveDocumentAuthorization(stage, resolver)` deduplicates concurrent work and failures; the resolver receives an isolated snapshot and captured request permissions with `this` bound to the original request. Full hook grants are independently copied. `memoizeDocumentFieldDecision(handle, binding, field, evaluator)` caches one boolean decision promise per field in that document/scope/stage; the evaluator receives captured request permissions/full grants with the same original actor. SVA-03 supplies the real hook/effective-rule wrappers. `readDocumentAuthorization` exposes detached private grant/access views, not wire metadata.
4. **Output association:** package finalizers use `associateDocumentAuthorization(handle, binding, output)` after finalization. `assertDocumentAuthorization(handle, use)` checks the exact associated identity/value graph plus binding/output access and optional expected call/stage; canonical internal execution should supply both expected tokens. `transferDocumentAuthorization(handle, use, copy)` validates an already-associated source before registering a package-created same-stage copy/subset. Equal JSON, `_id`, serialized `_permissions`, caller spreads and mutated/replaced Date/Buffer/BSON/nested values cannot establish validity. `isKnownAuthorizationOutput` recognizes even stale trimmed outputs so later fresh raw-policy helpers can avoid rerunning document hooks on them.
5. **Named options/context:** `normalizeOutputAuthorizationOptions(input, options, purpose?)` is a private callable admission seam for output helpers. It rejects raw-policy/handle mixtures, legacy bypass fields, wrong-purpose options and structurally forged handles. Its document variant derives the embedded scope from the authenticated handle and returns the scoped `binding`, still checking request/runtime/model/output-access ownership; consumers then validate the actual output through `assertDocumentAuthorization`. `createServiceOutputContext(diagnostic, handle, use)` adds non-enumerable/non-writable `documentAuthorization` and `getDocumentAuthorization` properties. Graph lookup returns only unchanged registered root/embedded/related output identities with matching logical provenance; editing diagnostic grants cannot alter authority.
6. **Execution types:** `ServiceExecutionContext`, `ServiceExecutionState`, `PreparedModelQuery`, `ResolvedIdentifier`, and `QueryInput<T>` currently live in `acl/service-execution.ts`. SVA-04 must implement the D00.7 prepared-query/identifier WeakMap issuers and executor registry; these declarations are not runtime authentication and no current method accepts them. SVA-05 will refine service return/decorator signatures to `Authorized*Result`/`ServiceOutputDecorator` when it actually issues contexts. The result types are available now without falsely claiming existing runtime results already carry handles.

- Runtime gate and follow-ups: **SVA-01A remains the next hard prerequisite.** It owns public/default/control-slot runtime rejection, nested positive allowlisting and transformed-envelope checks. No service, planner, finalizer, Core/Base helper or public wrapper imports/executes the new authority primitives; real authority forwarding/evaluation and result-context integration remain with SVA-02 onward. Dedicated subdocument/input admission and positional helper behavior are preserved. SVA-F01/F02/F03 remain deferred. No new blocking contract conflict or scope extension was found.
- Root `CHANGELOG.md` was not edited; its initial and final `git hash-object` value is **`c0561a1048c2341b14dd7f9d3e7c1fc055ae1880`**. No staging, commits, resets, reversions, subagents or unrelated-file cleanup occurred.

### Task SVA-01A: Establish public-input enforcement before runtime authority is enabled

Status: completed

Owner: fresh isolated SVA-01A implementer. SVA-00/01 evidence and D00.1–D00.8 reviewed; public admission prerequisite verified. Runtime grant evaluation belongs to the subsequent tasks.

Priority: P0

Suggested role: request-boundary / TypeScript engineer.

Dependencies: SVA-01.

Primary ownership:

- `packages/access-router/src/validation/common.ts`, `model-router.ts`, `root-router.ts`, `types.ts`.
- `packages/access-router/src/services/public-service.ts` and include/subquery option forwarding in `services/base.ts`.
- Internal/public option interfaces and Defaults in `packages/access-router/src/interfaces/`.
- Route/root dispatch allowlists where they currently forward generic options.
- `packages/access-router/test/service-authorization-boundary-admission.contract.test.ts` (new).

Finding: B7; legacy include options are already spread into target internal calls. Enabling new internal authorization before allowlisting those options would make request input a backend-authority transport.

References: C9; `base.ts:1048-1052,1107-1114,1148-1156,1634-1656`; public/root schema and interface references in B7.

Implementation requirements:

1. Complete the public/internal type split, including public wrappers, wire/root/advanced-body types and Defaults. Their options cannot contain backend policy or document/prepared state.
2. Reject control-slot `authorization`, client `overrides`, and internal document/prepared/execution keys before target dispatch, including nested legacy/correlated includes, populate/sub-populate, $$sq, root options, and post-validator transformed envelopes.
3. Replace generic target option spreads with positive supported-key forwarding. Internal package-owned context travels separately, never through a client-supplied descriptor/options object.
4. Preserve legitimate persisted data properties with those names. Apply validation at actual control slots rather than recursively reserving every business key.
5. Make public wrapper dispatch explicitly request-mode so later internal service integration cannot inherit elevation through Defaults or reused instances.
6. Test option forwarding with instrumented target service seams before runtime grants exist. Assert unsupported control keys cannot reach the target and required query/presentation options still do.
7. Leave SVA-08 responsible for end-to-end proof with real backend grants after integration; it must not be the first implementation of boundary enforcement.

Acceptance criteria:

- Rejected public/nested authority never reaches adapter/target dispatch; control-slot failure returns the established BadRequest shape.
- Target calls receive only supported keys while legitimate business payload names remain usable.
- Strict public/root/default types cannot express backend authority; mistyped JS public calls are also controlled.
- Admission tests and relevant existing validator/root/nested-option tests pass before SVA-02 begins.

Completion evidence:

- Changed paths (SVA-01A ownership; paths below are relative to `packages/access-router/` except the task record):
  - `src/validation/public-admission.ts` (new) — shared synchronous control-slot preflight, controlled BadRequest/ErrorResult mapping, authority-free defaults checks, positive public forwarding and package-created request-only service options.
  - `src/validation/public-admission-schema.ts` (new), `src/validation/common.ts`, `src/validation/model-router.ts`, `src/validation/root-router.ts`, `src/validation/parsers.ts` — generated-schema admission, raw-input checks and schema-identity-bound rechecking after whole-envelope or nested-data validator transformations. Business payloads retain their separate boundary kind.
  - `src/services/public-service.ts` — admission before identifier/exists/internal dispatch, explicit request-only options on integrated public wrappers and read fallback, positive `_new`/distinct forwarding, and `_new`'s required ErrorResult union.
  - `src/services/base.ts` — whole include/subquery-tree preflight before sibling target dispatch, positive legacy read/list argument and option forwarding, positive `$$sq` public forwarding with read fallback disabled, and controlled error mapping. Existing package-created filter overrides and private association symbols remain separate from client options.
  - `src/core.ts`, `src/helpers/document.ts`, `src/services/model-subdocument-service.ts` — populate/sub-populate descriptor preflight before normalization/target work and request-only subdocument list/read/create option admission.
  - `src/routers/root-router.ts` — independent dispatch-time admission and per-operation positive argument/option allowlists, including data targets; generated root validation preflights the entire batch before any entry runs.
  - `src/interfaces/base.ts`, `src/interfaces/query-types.ts`, `src/interfaces/root.ts` — typed authority-free subquery and legacy include options/args, matching nested/dotted Defaults views, and exclusion of legacy override controls from default args.
  - `src/runtime.ts` — nested and dotted default configuration rejects authority/override/private controls before assignment, preserving the previous valid configuration. Configured `overrideFilter` remains supported.
  - `test/service-authorization-boundary-admission.contract.test.ts` (new, **64 tests**), `test/service-authorization-boundary.types.fixture.ts` (new) — instrumented actual wrapper/Base/Core/root seams, JS/mistyped/inherited/non-enumerable controls, nested include/populate/sub-populate/`$$sq`, transformed validators, business-data names, supported forwarding/defaults, request-only successful dispatch, and strict emitted-declaration checks.
  - `test/service-authorization-baseline.contract.test.ts`, `test/cross-resource-authorization.integration.test.ts` — only intentional admission expectations changed: public/include overrides now reject instead of being silently ignored, and mutation effectiveSelect characterization uses a still-supported per-call internal override rather than an authority default.
  - `README.md` and `docs/tasks/20261007-143507-access-router-explicit-service-authorization.md` — admission/migration guidance, status and this evidence/handoff.

- Intentional migration timing: default-argument `overrides` exclusion/rejection lands with this prerequisite because a mutation default could otherwise be inherited by a public wrapper. Query/presentation defaults remain supported. Per-call internal service `overrides` and package-owned effectiveSelect/identifier/operation/prepared-filter transport remain accepted for SVA-05/06 migration and SVA-09 removal. No service/helper evaluates supplied grants in this task.

- Final checks from `<repo-root>`, with build/typecheck/test invocations serialized (the last typecheck/build completed before the resumed final test run; it was not needlessly rebuilt after resumption):

  ```sh
  pnpm --filter @web-ts-toolkit/access-router typecheck
  pnpm --filter @web-ts-toolkit/access-router exec vitest run --config vitest.config.ts test/service-authorization-boundary-admission.contract.test.ts test/service-authorization-context.unit.test.ts test/service-authorization-baseline.contract.test.ts test/validation-arh07.test.ts test/validation-arh06.test.ts test/validation-arc02.test.ts test/validation-error-boundary.test.ts test/correlated-includes.validation.test.ts test/correlated-includes.execution.test.ts test/cross-resource-authorization.integration.test.ts test/root-router.integration.test.ts test/root-router.variants.integration.test.ts test/virtuals-validation-openapi.contract.test.ts test/read-list-fallback-authorization.integration.test.ts
  pnpm --filter @web-ts-toolkit/access-router exec vitest run --config vitest.config.ts test/model-subdocument-routes.integration.test.ts test/subdocument-populate-authorization.integration.test.ts test/virtuals-populate-include.integration.test.ts
  pnpm exec eslint packages/access-router/src/validation/public-admission.ts packages/access-router/src/validation/public-admission-schema.ts packages/access-router/src/validation/common.ts packages/access-router/src/validation/model-router.ts packages/access-router/src/validation/root-router.ts packages/access-router/src/validation/parsers.ts packages/access-router/src/core.ts packages/access-router/src/helpers/document.ts packages/access-router/src/interfaces/base.ts packages/access-router/src/interfaces/query-types.ts packages/access-router/src/interfaces/root.ts packages/access-router/src/runtime.ts packages/access-router/src/routers/root-router.ts packages/access-router/src/services/base.ts packages/access-router/src/services/model-subdocument-service.ts packages/access-router/src/services/public-service.ts packages/access-router/test/service-authorization-boundary-admission.contract.test.ts packages/access-router/test/service-authorization-boundary.types.fixture.ts packages/access-router/test/service-authorization-baseline.contract.test.ts packages/access-router/test/cross-resource-authorization.integration.test.ts
  git diff --check
  git hash-object CHANGELOG.md
  ```

- Results: source typecheck and its serialized transitive CJS/ESM/declaration build **passed**; final admission/context/baseline/validator/root/nested gate **14 files / 287 tests passed**; additional existing populate/subdocument regression gate **3 files / 43 tests passed** (**17 files / 330 tests total**). Focused ESLint and whitespace checks **passed**. The admission suite compiles `test/service-authorization-boundary.types.fixture.ts` against emitted declarations with the resolved TypeScript CLI and `--ignoreConfig --noEmit --strict --skipLibCheck --target ES2022 --module NodeNext --moduleResolution NodeNext`; the included SVA-01 suite also passed its original declaration fixture. No consumer temporary directory was needed.
- Earlier admission iteration: three fixture issues (missing runTasks mock, public root error serialization omitting internal `kind`, and BadRequest's top-level message versus its detail) were corrected. The intermediate 14-file gate passed 278 tests; after the final positive-forwarding refinements and nine additional cases, the final gate above passed 287. Vitest emitted its existing Vite native-config compatibility warning. Full package/workspace/packed-artifact gates were not run for this task; later integration tasks own them.

Private forwarding/helper handoff (source-module exports only):

1. **SVA-02:** `assertPublicAdmission(value, kind = 'envelope')` in `validation/public-admission.ts` checks control-slot presence (including undefined/inherited/non-enumerable JS keys) and follows args/options/sqOptions, include, populate and executable `$$sq` envelopes. `kind: 'data'` preserves business `authorization`/`overrides` properties. It does not authorize, parse predicates, or inspect a supplied internal service policy. Keep internal named-helper authority admission in the SVA-01 normalization primitives; do not apply this public-only rejection to legitimate backend service/helper options. Retain the admission contract suite when activating policy-aware helpers.
2. **SVA-05:** `requestOnlyServiceOptions(options)` positively copies supported presentation fields plus package-selected read `access`, then adds a frozen `{ outputFields: { mode: 'request' } }` policy. Missing rows/related dimensions are request authority under C1. Public wrappers use it on initial/fallback and mutation branches; normalization must resolve this as a fresh complete per-call request policy without merging Defaults or prior instance state. Replace wrapper-created effectiveSelect/idFilter/operation overrides with the frozen D00.7 execution API when integrating services. `PublicAdmissionError.result` carries the established internal BadRequest result; public serializers retain their existing shape.
3. **SVA-06:** `forwardPublicArgs(input, 'list' | 'read')`, `forwardPublicOptions(input, 'list' | 'read')`, and `pickPublicKeys(input, keys)` are positive forwarding helpers. The first two also reject controls. Legacy internal includes use narrower find/read argument keys and package-reconstructed options; subqueries use public args/options and force `tryList: false`. Package-owned association symbols are attached separately after allowlisting. Related authority must come from a separately derived execution context, never descriptor options; replace request-only include execution with that private scoped path as specified in D00.7, while `$$sq` stays request-only. Preflight original correlated templates before expansion; do not re-admit/reparse substituted marker-shaped business data.
4. **Validator boundary:** `publicBoundarySchema(schema, kind)` in `validation/public-admission-schema.ts` records boundary kind by schema identity and adds generated-schema rejection. `assertTransformedPublicAdmission` checks raw and transformed values through the parsers without interpreting basic mutation data as an advanced control envelope. Preserve this check after custom validators; do not forward generic transformed options.

- Blockers: none. **SVA-01A is completed; SVA-02 is ready.** SVA-08 still owns successful-real-grant end-to-end isolation verification. SVA-F01/F02/F03 remain deferred. No subagents, concurrent rebuilding scripts, staging, commits, resets, reversions or later-task implementation occurred.
- Root `CHANGELOG.md` was not edited. Initial and final `git hash-object CHANGELOG.md` both equal **`c0561a1048c2341b14dd7f9d3e7c1fc055ae1880`**.

### Task SVA-02: Centralize effective field policy and make projection planning authorization-aware

Status: completed

Owner: fresh isolated SVA-02 implementer. SVA-00/01/01A completion evidence, C1–C10 and frozen D00.1–D00.8 reviewed; runtime admission prerequisite satisfied. Verification commands run serially.

Priority: P0

Suggested role: ACL projection/policy engineer.

Dependencies: SVA-01A (includes SVA-01; public-input enforcement must already pass).

Primary ownership:

- `packages/access-router/src/acl/field-authorization.ts` (proposed shared evaluator).
- `packages/access-router/src/acl/select-resolution.ts`, `acl/virtual-projection.ts`.
- `packages/access-router/src/core.ts` (`genSelect`, field-rule extraction).
- `packages/access-router/src/core-shared.ts` (`collectSchemaFields` integration).
- `packages/access-router/src/services/base.ts` (select/allowed-field helper signatures).
- `packages/access-router/src/runtime.ts`/`meta.ts` only for required catalog integration.
- `packages/access-router/test/service-authorization-projection.unit.test.ts` (new); existing virtual planner tests.

Finding: B1/B5; planner output keys and request-field rules currently exclude explicit backend output authority.

References: C2/C3; `acl/virtual-projection.ts:333-355,371-459,474-568`, `core-shared.ts:299-310`, `core.ts:277-315`.

Implementation requirements:

1. Use one rule extractor and effective policy evaluator for persisted/virtual output with granted/deferred/denied pre-fetch classification.
2. Incorporate valid explicit grants into output eligibility before fetch construction, including persisted fields absent from the permission schema and request-rule false.
3. Build a captured field catalog from actual Mongoose/embedded schema and the virtual registry; preserve dotted/Mixed rules agreed in SVA-00 and keep unregistered internals out of unrestricted output.
4. Implement additive path/subtree grants with minimal ancestors and independent sibling decisions. Ordinary arbitrary select grammar remains unchanged; grant grammar is separately validated.
5. Make `genSelect`/`genQuerySelect` wrappers over the retained projection plan; remove the duplicate legacy-plus-virtual projection union that can widen fetches or collide ancestor/descendant Mongo paths.
6. Use named planning options in canonical model execution. Add policy-aware helper overloads while isolating existing positional overloads; SVA-F03 owns their later retirement. Dedicated subdocument input admission keeps its current request-field evaluator rather than consuming an output virtual projection.
7. Preserve fetch-only always-select/join/policy/identity dependencies and provenance. Virtual names never enter DB projections even when granted or inactive.
8. Preserve DataCore/DataService request-mode behavior when changing shared helpers; do not accidentally apply model deferred-grant rules to data records.
9. Require the prior admission tests to pass with newly callable policy-aware helpers, and add no authority forwarding through a public wrapper or generic descriptor.

Acceptance criteria:

- Selected explicit `internalNote` is fetched even for false/missing request rules; unselected explicit grant is not fetched solely due to the grant.
- Denied/deferred/allowed `status` fixtures show correct provisional fetch behavior with no permission getter invocation during planning.
- A selected granted virtual becomes a candidate, fetches its dependencies, and never becomes a DB path; inactive getter remains omitted.
- Dotted leaf grants do not fetch/authorize sibling leaves except documented internal dependency needs; projections have no Mongo parent/child collisions.
- Inclusion/exclusion/object/string projections, `-_id`, require-explicit-select, omitted/unrestricted selection, and unknown requested names have concrete tests.
- Existing relevant virtual planner, projection identity, and data-service tests pass alongside focused projection tests.

Completion evidence:

- Changed paths (SVA-02 ownership; package paths below are relative to `packages/access-router/`):
  - `src/acl/field-authorization.ts` (new) — shared access-presence rule extraction, response-path ancestor rules, additive exact/subtree grant checks, granted/deferred/denied pre-fetch classification, and final effective-rule evaluation with the original request and full document grants. Planning never invokes permission functions or virtual getters. The existing Core source exports delegate to this implementation.
  - `src/acl/field-catalog.ts` (new) — owned frozen catalog from Mongoose `schema.paths`, embedded schemas, nested containers and registered virtuals, including schema-added paths/timestamps/select:false. Captures separate container/opaque/ref/virtual/protected paths and internal Map schema patterns. Safe named Map-of-subdocument keys expand only declared child paths; Mixed descendants require explicit paths. Ref interiors and unsafe/protected grants reject. Nested version-key exclusion does not veto a valid business-container grant; configured permission-metadata ancestors/equal/descendants still reject.
  - `src/acl/output-projection.ts` (new), `src/acl/model-output-planning.ts` (new) — authenticated retained-plan entry, synchronous receiving-model configuration capture, private named-option normalization, hierarchical catalog planning, minimal ancestor structure, independent selection/exclusion, per-field provisional states, virtual candidates/dependency provenance, private hook/join/identity inputs, and collision-free positive Mongo projections. Child identity fetches agree with their parent plan; dynamic Mixed/Map eligibility does not invent `_id` identities. A selected zero-dependency embedded virtual without declared identity retains its stored container privately for presence/array shape, recorded in dependency provenance and internal-only fields.
  - `src/acl/service-authorization.ts` — catalog-aware validation for safe dynamic paths and Map/ref/protected patterns, reusing the response-path grammar; preceding immutable owner/admission behavior retained.
  - `src/acl/virtual-projection.ts` — delegates catalog-backed planning to the canonical planner; snapshot-only compatibility planning uses the shared rule classifier/extractor, removes duplicated persisted/virtual rule checks, compacts Mongo path collisions, and strips nested/inactive virtual projection paths.
  - `src/core.ts`, `src/core-shared.ts`, `src/services/base.ts` — typed named `genSelect`/`genQuerySelect` overloads; Core alias and isolated `genLegacySelect`; shared extraction for request/input/data helpers without applying model deferred/server authority to data records. Named helpers use private normalization, never public-wire rejection. Positional skipChecks/subPaths/baseFields APIs remain available.
  - `src/services/service.ts` — limited planner seams: find/findOne retain one projection plan instead of unioning a separately evaluated legacy selection, and association projections compact parent/child collisions. Corrected the old comment claiming persisted override output grants were delivered. Service authorization/finalizer activation remains SVA-03/05 work.
  - `test/service-authorization-projection.unit.test.ts` (new, **69 tests**), `test/virtuals-projection-planner.unit.test.ts` (**15 tests**, one new regression), `test/service-authorization.types.fixture.ts` — projection/catalog/evaluator/helper coverage, nested identity/shape/private provenance, legacy planner safety, and strict emitted-declaration positive/negative named-helper calls.
  - `README.md` and this task record — current helper contract, projected hook-input requirement and explicit integration-stage handoff. Preceding task changes were preserved.

- Verification from `<repo-root>`, serially:

  ```sh
  # Initial dependency/package build and source check; passed.
  pnpm --filter @web-ts-toolkit/access-router typecheck

  # Broader targeted gate, after a package-only rebuild and source check; passed.
  pnpm --filter @web-ts-toolkit/access-router build
  pnpm --filter @web-ts-toolkit/access-router exec tsc --noEmit -p tsconfig.typecheck.json
  pnpm --filter @web-ts-toolkit/access-router exec vitest run --config vitest.config.ts test/service-authorization-projection.unit.test.ts test/service-authorization-context.unit.test.ts test/service-authorization-boundary-admission.contract.test.ts test/service-authorization-baseline.contract.test.ts test/virtuals-projection-planner.unit.test.ts test/virtuals-finalizer.unit.test.ts test/virtuals-direct-operations.integration.test.ts test/virtuals-populate-include.integration.test.ts test/virtuals-embedded-subdocuments.integration.test.ts test/correlated-includes.execution.test.ts test/arc21-projection-identity-and-count-argument.contract.test.ts test/data-service-hot-path.test.ts test/data-service-scaling.test.ts

  # Final gate after the planner-only embedded identity/shape refinements; passed.
  pnpm --filter @web-ts-toolkit/access-router build
  pnpm --filter @web-ts-toolkit/access-router exec tsc --noEmit -p tsconfig.typecheck.json
  pnpm --filter @web-ts-toolkit/access-router exec vitest run --config vitest.config.ts test/service-authorization-projection.unit.test.ts test/virtuals-projection-planner.unit.test.ts test/arc21-projection-identity-and-count-argument.contract.test.ts test/data-service-hot-path.test.ts test/data-service-scaling.test.ts
  pnpm exec eslint packages/access-router/src/acl/field-authorization.ts packages/access-router/src/acl/field-catalog.ts packages/access-router/src/acl/output-projection.ts packages/access-router/src/acl/model-output-planning.ts packages/access-router/src/acl/service-authorization.ts packages/access-router/src/acl/virtual-projection.ts packages/access-router/src/core.ts packages/access-router/src/core-shared.ts packages/access-router/src/services/base.ts packages/access-router/src/services/service.ts packages/access-router/test/service-authorization-projection.unit.test.ts packages/access-router/test/service-authorization.types.fixture.ts packages/access-router/test/virtuals-projection-planner.unit.test.ts
  git diff --check
  git hash-object CHANGELOG.md
  ```

- Results: initial transitive build/typecheck and final package CJS/ESM/declaration build/source typecheck **passed**. The broader gate passed **13 files / 334 tests**, including **76** context/type tests, **64** public-admission/type tests, the **16** historical baseline cases, and finalizer/direct/related/embedded/correlated regressions. That evidence remains valid for unchanged boundaries and service seams. The final changed-planner/required projection/data gate passed **5 files / 102 tests** (**69** new projection tests, **15** legacy planner tests, **18** projection-identity/data tests); these overlap the earlier gate and are not additive distinct-test totals. Focused ESLint and whitespace checks passed. The emitted-declaration fixture proves the named overloads and rejects wrong paths, row authority, baseFields and document handles in planning options. No full-package/workspace/packed-artifact gate or concurrent rebuilding command was run.
- Iteration notes: corrected a Mongoose fixture that reused a select:false child schema inside a Map (Mongoose forbids that combination), an invalid strict-fixture null select, TypeScript overload narrowing and lint-only regex issues. Final nested-identity checks also pin that safe dynamic `_id` eligibility is not a declared system identity. All required final checks pass; the only test-run warning was the existing Vite native-config compatibility warning.

Private API/integration handoff:

1. **Catalog/capture:** `captureAuthorizationFieldCatalog(schema, virtuals, documentPermissionField)` returns frozen owned arrays; `captureModelAuthorizationConfiguration(runtime, modelName)` collects that catalog plus permissionSchema, virtual descriptors, always-select inputs, hook configuration and metadata posture for synchronous `resolveServiceAuthorization` capture. `AuthorizationFieldCatalog.dynamicPaths` uses internal `$*` schema placeholders only; caller paths never accept wildcard syntax. `isCatalogOutputPath` and `matchesCatalogPattern` support validated explicit dynamic branches without enumerating returned object keys.
2. **Evaluator (SVA-03):** `extractScopedOutputRule`, `extractOutputFieldRules`, `classifyRequestFieldRule`, `classifyEffectiveFieldAuthorization`, `hasExplicitFieldGrant`, `hasDescendantFieldGrant`, `evaluateScopedAccessRule` and `evaluateEffectiveFieldAuthorization` are source-module APIs. The effective evaluator gives explicit server authority priority over false/missing/global/document request denial. Selection/catalog admission is a separate prerequisite. SVA-03 must memoize final field decisions in the existing per-document owner and use full captured document-hook grants; planning does not invoke those functions or issue document handles.
3. **Retained planner (SVA-03/05):** call `planAuthorizedModelProjection({ authorization, binding, requestedSelect, effectiveSelect?, internalFetch? })` once with an authenticated resolved call. It reads captured configuration/accesses/permissions, retains `authorization` and `authorizationBinding`, and returns the existing `VirtualProjectionPlan` shape plus readonly `fieldStates`, `minimalAncestorPaths` and ordinary `responseScopePath`. Existing `scopePath` remains the definition-path form for old finalizer compatibility. Child plans express minimal structure with their own relative selection/states/candidates; a parent container's request denial is not authority to drop an explicitly granted descendant. SVA-03 supplies document-stage/scoped ownership and output filtering; SVA-05 resolves the operation context and retains this same plan through service fetch/finalization rather than resolving raw policy twice.
4. **Fetch/output separation:** `persistedFetchSelection` is a positive Mongo projection; `compactPersistedProjection` removes parent/child collisions, including private association inputs. `outputSelection`, `outputPersistedFields`, `outputVirtualNames`, field states and child plans describe output eligibility, not a bypass around finalization. Internal-only/dependency/identity paths never grant output. `-_id` flags and private identity retention are independent at root and declared embedded scopes. `alwaysSelectFields` captures the configured output-access and document-hook-access dependencies; no hook source inspection or blanket document loading occurs.
5. **Named helpers:** Core's `genSelect<TModel, TVirtuals>(modelName, access, select, options)` and `genQuerySelect` plus Base/Service's model-generic equivalents accept `OutputPlanningOptions` only (`authorization.outputFields`, optional ordinary response `scopePath`). Each call independently normalizes/captures via `planModelOutputForHelper` and returns the persisted projection. Canonical execution should use the private retained-plan entry instead. No public boundary accepts authority; positional request/input helpers remain isolated. Named allowed-field/pick/trim overloads and actual grant-preserving output are **not delivered by SVA-02** and remain SVA-03/05 integration responsibilities.

- Blockers: none. SVA-02 is completed; SVA-03 is ready. All later required tasks retain their existing status. SVA-F01/F02/F03 remain deferred; no write/subdocument grants or positional-helper removal were added. No subagents, staging, commits, resets or reversions occurred.
- Root `CHANGELOG.md` was not modified. Initial and final `git hash-object CHANGELOG.md` both equal **`c0561a1048c2341b14dd7f9d3e7c1fc055ae1880`**.

### Task SVA-03: Apply effective authority consistently in finalization and allowed-field filtering

Status: completed

Owner: fresh isolated SVA-03 implementer. Repository/task conventions, C1–C10, frozen D00.1–D00.8 and SVA-01/01A/02 evidence reviewed; all predecessors complete. Focused verification ran serially.

Priority: P0

Suggested role: output/finalization engineer.

Dependencies: SVA-02.

Primary ownership:

- `packages/access-router/src/output/finalize-model-output.ts`.
- `packages/access-router/src/core.ts` (`genAllowedFields`, `pickAllowedFields`, grant resolution).
- `packages/access-router/src/acl/select-resolution.ts` and shared field evaluator.
- `packages/access-router/src/helpers/document.ts` only for required projection/isolation behavior.
- `packages/access-router/src/services/base.ts` (output helper policy transport).
- `packages/access-router/test/service-authorization-finalizer.unit.test.ts` (new); existing finalizer tests.

Finding: B2/B6; finalization lacks per-call grants, later pick calls fall back to user policy, and internal grants can be mistaken for exposed permission metadata.

References: C2/C4/C9; `finalize-model-output.ts:217-293,451-570`, `core.ts:237-275,564-592,618-690`.

Implementation requirements:

1. Pass immutable call policy into planning and per-document authorization results into output evaluation/picks; use the shared evaluator and memoized same-stage decisions.
2. Return selected explicitly granted fields despite request-user denial while independently filtering other selected fields.
3. Resolve full document-hook grants from the original projected input once per document/scope/access stage. Preserve these results independently of serialized `_permissions`, skim, and output copies. Never compute a fresh grant map from a trimmed DTO in a same-execution pick.
4. Preserve isolation, virtual dependency requirements, staged-only commit, child-before-parent ordering, and bounded shared gates in every mode.
5. Perform nested minimal-path projection/trimming, including arrays and granted unknown-to-permission-schema persisted paths. Do not keep whole ancestors merely to retain a descendant grant.
6. Keep new overloads and canonical execution free of arbitrary business-field baseFields authority. System metadata/identity retention remains explicit/private; legacy overload compatibility stays isolated for SVA-F03.
7. Keep `pickAllowedFields` an existing-value authorization filter with mutually exclusive raw-policy or issued-document-state options. It does not invent values, compute virtuals, perform selection, or do row lookup. Document the fresh-call semantics separately from state reuse.
8. Bind document results and memoized decisions to their originating request/call/runtime/model/snapshot/scope/access stage. Output copies can be explicitly associated within that execution; arbitrary matching IDs or serialized `_permissions` cannot establish validity.

Acceptance criteria:

- A direct finalizer + explicit-policy pick chain retains `internalNote` under global/document denial; a separate fresh request-policy pick legitimately removes it.
- A same-execution pick with the issued document state agrees with finalizer decisions for existing values. Reusing only the raw policy is a fresh authorization evaluation, not proof that document-grant results are available.
- A permission hook reads privately fetched `ownerId`; the finalizer removes it and strips `_permissions`; a later pick with issued document state keeps normally doc-authorized `status` and explicitly granted `internalNote` without rerunning the hook. A second row with different grants cannot reuse those results.
- Changing access or document stage invalidates the old result; a hook with a counted/stateful decision is not evaluated twice for the same field/stage.
- Metadata disabled/stripped/exposed-key restricted cases still authorize ordinary document-granted fields and backend grants without forging `_view`/`_edit`.
- Granted virtuals obey selection/getter applicability/dependency/failure behavior; denied/unselected virtual getters do not run.
- Dependency-only fields, private associations, unrelated siblings, metadata/control objects, and stale virtual values remain absent.
- Date/Buffer/BSON/input/snapshot isolation and limit-1 finalization tests pass.

Completion evidence:

- Changed paths (SVA-03 ownership; package paths below are relative to `packages/access-router/`):
  - `src/acl/output-field-filter.ts` (new) — shared captured-hook resolution, effective output decisions, existing-value filtering and output metadata/reference copying. Uses SVA-01 stage/handle authentication and SVA-02 catalog/planner/evaluator. Embedded elements inherit owning grants with separate scoped decision owners; ancestor request predicates are memoized in their owning stage. Fresh policy on a known trimmed output never reruns its document hook or reconstructs document-dependent authority.
  - `src/output/finalize-model-output.ts` — retained authorization plans now drive the existing isolate → document grants → child output → selected virtuals → trim pipeline. Captured call configuration/permissions/accesses govern canonical evaluation; explicit grants survive false/missing request rules. Added private output-context callback and optional authenticated single/per-row stages, nested minimal-path trimming, metadata-independent grants, and registered related-child provenance. Snapshot-only legacy callers continue through request authorization.
  - `src/acl/document-authorization.ts` — exact input-identity/value/call validation for retained projected stages; private unchanged-output lookup and explicit same-stage graph-copy transfer. List finalization rejects shared stage tokens, even for equal IDs/values.
  - `src/acl/field-authorization.ts` — shared extractor now also supplies rule-path identities, with an optional memoized request-rule callback in the effective evaluator. This prevents a stateful ancestor predicate from being rerun for each selected descendant or later pick.
  - `src/core.ts`, `src/services/base.ts` — typed named `genAllowedFields(..., { purpose: 'output', ... })`, `pickAllowedFields` and `trimOutputFields` overloads; Core trim alias; isolated legacy positional implementations. Named helpers validate options/scope before hooks, preserve nullish inputs and reject top-level arrays/scalars instead of returning unfiltered values. Input/write admission retains its request-only positional path.
  - `src/helpers/document.ts` — native BSON isolation (including Binary without `clone()`), independently copied Maps and Map flattening at the plain-output boundary. Named output helpers never mutate hydrated `_doc`; safe own-property copying preserves snapshot validation of unsafe keys.
  - `test/service-authorization-finalizer.unit.test.ts` (new, **44 tests**) — central grant/ownerId oracle, original-actor/function arguments and counts, fresh-policy distinction, metadata configurations, scope/call/request/runtime/model/stage/output mutation rejection, per-row independence, nested/array/Mixed/Map paths, child/target contexts, virtual selection/applicability/dependency/failure, shared bounded gates, BSON/hydrated isolation, admission and request-only write controls.
  - `test/virtuals-finalizer.unit.test.ts` (**15 tests**, one new native BSON Binary mutation/isolation regression); `test/service-authorization.types.fixture.ts` — positive and negative Core/Base/Service named-helper calls against emitted declarations, including path typing, purpose, row/baseFields exclusion and raw-policy/handle exclusivity.
  - `README.md` and this task record — callable helper semantics, current integration boundary, status and this evidence/handoff. Predecessor task changes were preserved.

- Verification from `<repo-root>`, with all build/typecheck/test scripts serialized:

  ```sh
  # Initial transitive dependency/package build and source typecheck; passed.
  pnpm --filter @web-ts-toolkit/access-router typecheck

  # Broader focused gate, after the implementation and isolation fixes; passed.
  pnpm --filter @web-ts-toolkit/access-router build
  pnpm --filter @web-ts-toolkit/access-router exec tsc --noEmit -p tsconfig.typecheck.json
  pnpm --filter @web-ts-toolkit/access-router exec vitest run --config vitest.config.ts test/service-authorization-finalizer.unit.test.ts test/service-authorization-context.unit.test.ts test/service-authorization-boundary-admission.contract.test.ts test/service-authorization-projection.unit.test.ts test/service-authorization-baseline.contract.test.ts test/virtuals-projection-planner.unit.test.ts test/virtuals-finalizer.unit.test.ts test/virtuals-direct-operations.integration.test.ts test/virtuals-populate-include.integration.test.ts test/virtuals-embedded-subdocuments.integration.test.ts test/data-service-hot-path.test.ts test/data-service-scaling.test.ts test/arc21-projection-identity-and-count-argument.contract.test.ts test/permissions-posture.integration.test.ts test/doc-permissions-exposure.integration.test.ts test/field-permissions-opt-out.integration.test.ts

  # Final gate after the named-helper input/scope guards and their regressions; passed.
  pnpm --filter @web-ts-toolkit/access-router build
  pnpm --filter @web-ts-toolkit/access-router exec tsc --noEmit -p tsconfig.typecheck.json
  pnpm --filter @web-ts-toolkit/access-router exec vitest run --config vitest.config.ts test/service-authorization-finalizer.unit.test.ts test/service-authorization-context.unit.test.ts test/service-authorization-boundary-admission.contract.test.ts test/virtuals-finalizer.unit.test.ts
  pnpm exec eslint packages/access-router/src/acl/document-authorization.ts packages/access-router/src/acl/field-authorization.ts packages/access-router/src/acl/output-field-filter.ts packages/access-router/src/output/finalize-model-output.ts packages/access-router/src/core.ts packages/access-router/src/services/base.ts packages/access-router/src/helpers/document.ts packages/access-router/test/service-authorization-finalizer.unit.test.ts packages/access-router/test/virtuals-finalizer.unit.test.ts packages/access-router/test/service-authorization.types.fixture.ts
  git diff --check
  git hash-object CHANGELOG.md
  ```

- Results: initial transitive build/typecheck and final CJS/ESM/declaration build/source typecheck **passed**. Broader gate: **16 files / 386 tests passed**. Final changed-helper/finalizer/context/admission gate: **4 files / 199 tests passed** (**44** new finalizer cases, **76** context/type cases, **64** admission/type cases and **15** existing-finalizer cases). These gates overlap and are not additive distinct-test totals. Focused ESLint and whitespace checks passed. Both strict emitted-declaration fixtures pass through the included context/admission suites; emitted Core/Base overloads and their JSDoc were also inspected. No consumer temporary directory was needed. Full package/workspace/packed-release gates remain with the later integration tasks.
- Critical oracle: the hook reads privately fetched `ownerId`; finalized output contains `status` and explicitly granted `internalNote` with neither `ownerId` nor `_permissions`. Handle-aware pick → trim → allowed-fields reuse retains both, even after the diagnostic grants and stateful permission function are changed. Hook count and the status decision count remain **one**. Resupplying raw policy retains only the grant; fresh request policy removes both document-dependent status and denied note, without another hook/function invocation. A second row receives independent results, including when IDs are equal.
- Iteration findings: fixed missing required diagnostic `mongooseModel` values, three fixture mistakes (runtime registry reuse and two omitted-selection calls accidentally triggering a test helper's default selection), and a real native BSON Binary alias discovered by the new isolation test. Added exact retained-stage identity, distinct list-stage, dotted-metadata copy, and nullish/non-document helper regressions during verification. All final checks above pass. Vitest emitted its existing Vite native-config compatibility warning only; no unresolved environment/test failure remains.

Private output API handoff (source-module exports only):

1. **SVA-04/05 retained call/plan:** continue using `planAuthorizedModelProjection({ authorization, binding, requestedSelect, effectiveSelect?, internalFetch? })`. Supply that exact retained plan to the finalizer. Its authenticated call supplies configuration, request permissions, initiating operation and the three effective accesses. The finalizer verifies receiving request/model/scope/accesses. Canonical output never uses positional baseFields/skipChecks or exposed `_permissions` as authority; row preparation remains a separate capability.
2. **SVA-05 document stage/metadata:** with no supplied stage, finalization resolves the captured `docPermissions.<docPermissionsAccess>` hook once from an isolated untrimmed projected snapshot, including when no virtuals or metadata exist. Canonical plans do not treat a legacy `docPermissions: {}` argument as proof that grants were computed. To resolve grants before finalization, use `resolveOutputDocumentAuthorization({ authorization, binding, snapshot, context, stage?, hookGate? })` in `acl/output-field-filter.ts`; obtain its stage via `readDocumentAuthorization(handle, binding).stage`. Supply it as `documentAuthorizationStage` and use the **exact unchanged projected plain snapshot object** as finalizer `input`. Equal copies, changed snapshots, another call or access are rejected. Pre-write and post-write stages stay distinct. `skim`/permission metadata options must control serialization, not whether this internal stage is resolved.
3. **SVA-05 output contexts:** `finalizeModelOutput` keeps its plain-output return shape and adds private `onFinalized(output, context)`; `finalizeModelOutputs` calls `onFinalized(output, context, index)` with stable row indices. Capture those `ServiceOutputContext` values for later `Authorized*Result` integration. Optional `documentAuthorizationStages` on the list finalizer must contain one distinct stage for every input row. The callback runs after association and before presentation; it is not a wire/service option or token constructor.
4. **Same-execution helper transport:** Core model-prefixed and Base/Service overloads accept either raw `authorization`/ordinary response `scopePath` or `documentAuthorization`, never both. `genAllowedFields` additionally requires `purpose: 'output'`. Handle picks validate the existing associated output, reuse full grants/decisions and register their returned subset. They do not apply selection, run virtual getters, restore values, authorize rows or grant writes. Raw policy is a fresh call; recognized trimmed/stale outputs cannot cause another document hook. Unconditional request fields and explicit grants remain usable in that fresh call.
5. **SVA-05/06 output copies:** `getAssociatedDocumentAuthorization(output, call?)` looks up an unchanged registered output, optionally requiring logical-call provenance. `transferDocumentAuthorizationGraph(source, copy)` is the package-only copy/subset handoff for metadata cleanup, finalized related copies and include pairing. Perform changes on the isolated copy, transfer from the still-valid source, then construct a context for the returned graph with `createServiceOutputContext`. Mutating an already-associated output invalidates its handle; arbitrary application copies/replacements are not implicitly accepted. Handles and contexts stay outside DTOs and public serializers.
6. **SVA-06/07 children:** default embedded finalization uses scoped captured calls and owning-parent grants without another document hook, with per-element decisions/handles. Related targets must provide independently resolved plans with the same logical provenance; their hooks/accesses/policies are their own. Parent unrestricted never supplies target field authority. An unassociated populated DTO contributes only its existing reference ID, not its object contents. Finalized root contexts discover unchanged registered embedded/target handles; pass a target handle to that target model's helper. Custom embedded traversal receives the authenticated scoped child plan and owning-document information in its private parent args. Related dispatch/operation/row policies and dedicated-subdocument integration remain with their assigned tasks.

- Integration boundary: **SVA-03 is complete; SVA-04 is ready.** Successful real service option grants and guaranteed service result contexts are still SVA-05 work, with related dispatch in SVA-06. The unchanged **16-case** historical service baseline passes; its service-level grant-loss/skim expectations were not rewritten prematurely. SVA-01A admission remains verified with the now-callable named output helpers. SVA-F01/F02/F03 remain deferred. Blockers: **none**.
- Root `CHANGELOG.md` was not edited. Initial and final `git hash-object CHANGELOG.md` both equal **`c0561a1048c2341b14dd7f9d3e7c1fc055ae1880`**. No subagents, concurrent rebuilding scripts, staging, commits, resets or reversions occurred.

### Task SVA-04: Separate row authority and add private prepared-query execution

Status: completed

Owner: fresh isolated SVA-04 implementer. C1–C10, frozen D00.1–D00.8 and predecessor completion evidence reviewed; SVA-00/01/01A/02/03 complete. Verification runs serially.

Priority: P0

Suggested role: row-policy / internal execution engineer.

Dependencies: SVA-03 (includes SVA-01 transitively; sequence shared `core.ts`/`base.ts` ownership).

Primary ownership:

- `packages/access-router/src/acl/filter-resolution.ts`, `core-shared.ts`.
- `packages/access-router/src/acl/prepared-query.ts` (proposed private module).
- `packages/access-router/src/core.ts`, `services/base.ts`, `services/service.ts` for preparation/execution seams.
- `packages/access-router/test/service-authorization-rows.integration.test.ts` and `service-authorization-prepared-query.unit.test.ts` (new).
- Existing service/filter denial and correlated-includes tests.

Finding: B3; `overrides.filter` conflates row bypass with carrying already-processed work.

References: C5/C8; `core-shared.ts:139-184`, `base.ts:1330-1357,1420-1436,1508-1527,1586-1595`, `service.ts:2251-2303`.

Implementation requirements:

1. Implement request/scope/unrestricted row modes with the frozen transform-hook placement and AND composition.
2. Resolve terminal false early and retain the required caller/identifier/join predicate under every scope mode.
3. Create private identity-bound prepared-query state after query parsing, expanded-operand validation, transform, and row-policy evaluation; make internal execution consume it without regenerating those stages.
4. Migrate internal upsert/include read/list/count reuse to prepared-query state. No publicly accepted bypass/prepared boolean or raw structurally branded filter.
5. Preserve correlated substitution inertness: template subqueries may run before substitution; marker-shaped parent values must not be parsed as new executable operators.
6. Carry resolved row context into internal exists/count/grouped-count execution used by integrated operations. Keep standalone exists/count/delete/distinct signatures and request-policy behavior; output-field grants do not change sort/distinct field policy.
7. Separate row authority/default caches by effective policy where needed; request base scopes can remain cached, but custom scope/call context cannot contaminate another call.

Acceptance criteria:

- Request mode combines the transformed query with request scope; trusted scope replaces only request row scope; unrestricted preserves the transformed query without request base restriction.
- Non-idempotent transform hook runs exactly once per intended execution and cannot overwrite a required trusted scope or relationship predicate.
- In all three row modes, a user-dependent restriction or false returned by configured `overrideFilter` remains effective. Scope/unrestricted skip only the base-row policy specified by C5; no generic filter-hook bypass is introduced.
- Early known false query/identifier/scope prevents persistence-bearing parsing and target work; a later transform/base denial is terminal before primary persistence and subsequent child dispatch. Required earlier parsing is explicitly characterized.
- A cross-runtime/model/access prepared token, JSON-shaped forgery, or unrelated call reuse is rejected.
- Correlated parent `$$sq`/`$$date`-shaped data stays inert; template parsing/expanded budgets and exact count semantics are preserved.
- Existing denial, fallback, correlated execution, and grouped-count regressions pass with updated canonical internal calls.

Completion evidence:

- Changed paths (SVA-04 ownership; package paths below are relative to `packages/access-router/`):
  - `src/core-shared.ts`, `src/acl/filter-resolution.ts`, `src/core.ts` — shared transform/scope decomposition and AND composition; private Core-owned request base-filter cache registration. Request mode uses the captured transform once plus request base scope; scope/unrestricted use the same transform and skip only request base evaluation/cache insertion. Fixed constraints are combined after rewriting. Existing standalone request-only helpers retain their signatures/cache behavior.
  - `src/acl/service-execution.ts` — frozen authenticated execution owners, receiving-instance executor registry, synchronous call capture using the SVA-01 owner, explicit branch/fallback derivation and optional authenticated parent-call provenance. No execution/prepared option or package export was added.
  - `src/acl/prepared-query.ts` (new) — WeakMap-authenticated prepared-query and identifier shells, binding checks, owned input/parsed/transformed/scope/mandatory/final snapshots, parsing provenance, expanded-operand validation, terminal tokens, and private find/read/update/create/exists/count/grouped-count dispatch. Executor reuse never parses markers or reruns identifier/transform/base generation. Configuration-based virtual exclusion uses the captured call configuration.
  - `src/acl/model-output-planning.ts` — existing configuration capture additionally snapshots row/identifier hooks. SVA-02 planning and SVA-03 finalizer/field APIs were reused rather than reimplemented.
  - `src/services/service.ts` — row options wired for find/findOne/by-ID/update/upsert; private prepared bodies/executor callbacks; row denial before population/child dispatch; totalCount consumes the matching token; upsert reuses its update predicate and derives a row-free create context with operation `upsert`. Grouped counts preserve schema casting, original-key aliases and distinct document-ID sets. Primary adapter work continues through the existing shared scheduler. Raw mutation lookup filters retain their existing non-parsing behavior; mutation data retains normal parsing/validation/write hooks.
  - `src/services/base.ts` — legacy and correlated read/list/count dispatch migrated off `overrides.filter`/`countTrusted` to private preparation/execution, with mandatory foreign/ref/expanded constraints. Template read/list parsing still precedes substitution; count templates remain non-parsing. Existing target operation gates, miss/error shapes, admission/positive allowlists, association transport, correlated budgets and shared scheduling remain exercised.
  - `test/service-authorization-rows.integration.test.ts` (new, **29 tests**), `test/service-authorization-prepared-query.unit.test.ts` (new, **8 tests**) — real Mongo row/count/upsert/include oracles plus authenticated-token rejection, identifier fallback reuse, scope/call/cache isolation, original actor/permission arguments, non-idempotent transform counts, false modes/order, inert markers, template parsing, expanded budgets and async snapshot mutation.
  - `test/service-denial-contract.test.ts` — upsert create instrumentation now observes the private branch executor. `test/grouped-count-casting.integration.test.ts` — removed a stale override-bearing positive fixture rejected by the completed SVA-01A boundary; ordinary pagination remains present and irrelevant to counts. `test/service-authorization-boundary-admission.contract.test.ts` — the two positive legacy forwarding cases now instrument authenticated executor registration and assert absent argument overrides/prepared options; all negative admission and positive allowlist assertions remain.
  - `README.md` and this task record — row applicability/order, trusted inert scope, query-transform migration, staged integration guidance, status and actual evidence. Predecessor changes were preserved.

- Final verification from `<repo-root>`, with build/typecheck/test scripts serialized:

  ```sh
  pnpm --filter @web-ts-toolkit/access-router build
  pnpm --filter @web-ts-toolkit/access-router exec tsc --noEmit -p tsconfig.typecheck.json
  pnpm --filter @web-ts-toolkit/access-router exec vitest run --config vitest.config.ts test/service-authorization-rows.integration.test.ts test/service-authorization-prepared-query.unit.test.ts test/service-denial-contract.test.ts test/filter-denial.integration.test.ts test/read-list-fallback-authorization.integration.test.ts test/correlated-includes.execution.test.ts test/grouped-count-casting.integration.test.ts test/cross-resource-authorization.integration.test.ts test/service-authorization-boundary-admission.contract.test.ts test/service-authorization-baseline.contract.test.ts
  pnpm exec eslint packages/access-router/src/acl/filter-resolution.ts packages/access-router/src/acl/prepared-query.ts packages/access-router/src/acl/service-execution.ts packages/access-router/src/acl/model-output-planning.ts packages/access-router/src/core-shared.ts packages/access-router/src/core.ts packages/access-router/src/services/base.ts packages/access-router/src/services/service.ts packages/access-router/test/service-authorization-rows.integration.test.ts packages/access-router/test/service-authorization-prepared-query.unit.test.ts packages/access-router/test/service-denial-contract.test.ts packages/access-router/test/grouped-count-casting.integration.test.ts packages/access-router/test/service-authorization-boundary-admission.contract.test.ts
  git diff --check
  git hash-object CHANGELOG.md
  ```

- Results: final CJS/ESM/declaration build and source typecheck **passed**; focused gate **10 files / 245 tests passed**, including **37 new row/prepared tests**, **41 grouped-count casting tests**, **64 admission/type tests**, and all **16 historical baseline cases**. Focused ESLint and whitespace checks passed. Admission's strict emitted-declaration fixture also passed. No full package/workspace/packed-artifact suite was run. The existing Vite native-config compatibility warning was the only final test-run warning.
- Iterations: the initial `pnpm --filter @web-ts-toolkit/access-router typecheck` rebuilt transitive dependencies successfully, then exposed declaration union narrowing/private getter/request-type errors; these were fixed before the passing build/source checks. Earlier test runs exposed the stale grouped-count/admission fixtures described above, private create mock migration, and an incorrect exact-shape expectation for an AND-composed grouped join. Final review also moved virtual-filter stripping to the captured configuration and added an async snapshot test. The preceding broader gate passed 244 tests; the final gate above passed 245 after that refinement (overlapping runs, not additive totals).

Private execution API and migration handoff (source-module exports only):

1. **Context (`acl/service-execution.ts`):** `createServiceExecution(receiver, access, authorization?, applicability = 'service', relatedTargets = [], parentAuthorization?)` captures a complete immutable call synchronously. `readServiceExecution(receiver, execution)` authenticates the receiving instance/request/runtime/model/scope and exposes the frozen `{ authorization, binding, access, family }` record. Use its `authorization`/`binding` with the existing `planAuthorizedModelProjection` and SVA-03 finalizer APIs; do not resolve raw options again. `deriveServiceExecution(receiver, parentExecution, access, applicability = 'service')` retains logical provenance/captured configuration/permissions, shares the private identifier family, and creates a distinct call. `create` derivation copies only outputFields/related; `output` copies only outputFields. The executor registry is installed by Service and authenticated by receiver identity. Optional `parentAuthorization` supplies provenance only, never inherited target authority.
2. **Preparation (`acl/prepared-query.ts`):** `prepareModelQuery(receiver, execution, { kind: 'client-read' | 'mutation-lookup' | 'expanded', filter }, mandatoryFilter?)`. Client reads parse once and revalidate expanded operand budgets; mutation lookup and already-expanded inputs never execute client markers. Query kind and all predicate components are privately retained. `readPreparedModelQuery(receiver, execution, token)` returns a detached diagnostic snapshot; changing it cannot change authority. `isExecutionRowDenied(receiver, execution)` identifies false trusted scope before identifier/template work. Tokens require the exact originating execution; another call/access/model/runtime/receiver or a structural/JSON forgery rejects with controlled BadRequest.
3. **Identifiers:** `resolveModelIdentifier(receiver, execution, id)` issues an opaque once-resolved token, short-circuiting a false trusted scope. `readModelIdentifier(receiver, execution, identifier)` accepts only the same receiver and explicitly derived family. For public read/list fallback in SVA-05, resolve one identifier, derive the list execution with initiating operation `read`, and prepare a separate query at each access. Never reuse the read query token as list authorization. Existing public fallback still passes its established denial/no-retry and hook-count tests; its remaining `idFilter` construction is SVA-05 migration work.
4. **Executors:** `executePreparedFindOne(receiver, execution, query, args?, options?)`, `executePreparedFind(..., decorate?)`, `executePreparedUpdateOne(receiver, execution, query, data, args?, options?, decorate?)`, and `executeCreate(receiver, derivedCreateExecution, data, args?, options?, decorate?)`. Presentation options are not an authority source and are not re-resolved over the authenticated execution. The callbacks enter private `findOnePrepared`/`findPrepared`/`updateOnePrepared`/`createPrepared` bodies. SVA-04 intentionally retains existing `SingleResult`/`ListResult` and decorator types; SVA-05 must use the retained call plan, SVA-03 `onFinalized` callbacks and graph-copy APIs to deliver `Authorized*Result`/`ServiceOutputContext`, ordinary mutation select and final output grants.
5. **Counts:** `executePreparedExists(receiver, execution, query, includeId = false)` returns boolean or the adapter's ID record/null; `executePreparedCount(receiver, execution, query)` returns a numeric SingleResult; `executePreparedGroupedCount(receiver, execution, query, foreignField, values)` returns `SingleResult<Map<string, Set<string>>>` (original foreign-key aliases to distinct document IDs). All may return terminal Forbidden and share the token's exact row scope. Count totals are independent of pagination. Grouped execution additionally ANDs its FK constraint and preserves schema casting/BadRequest handling. Standalone exists/count/delete/distinct and request-permission metadata checks retain their request-only behavior. `countTrusted` remains a separate legacy helper, with no package include caller.
6. **SVA-06 target handoff:** Base now has concrete request-mode private include preparation/dispatch at every legacy/correlated read/list/count path. Resolve explicit related entries and operation admission there using the receiving target's call/configuration; provide the parent authenticated call only as provenance, not inherited authority. Derive/check false target scope **before** parsing a correlated read/list template, then preserve template-before-substitution parsing, expanded validation and mandatory constraints. Legacy joins and correlated ref IDs/expanded predicates are separately ANDed after transforms. Existing target plans/association copies remain for SVA-06's policy-aware target output/context integration.

- Integration boundary: **SVA-04 is complete; SVA-05 is ready.** No remaining row/prepared verification blocker. Complete direct output-option/result-context integration, remaining public effectiveSelect/operation/idFilter transports and field/metadata stages remain SVA-05; per-path related grant admission/output integration remains SVA-06. Temporary external legacy object-filter entry remains for SVA-09 removal, rejects mixing with explicit authorization, and cannot revive false query/scope/override. No new compatibility adapter or public parsing/authorization bypass flag was added. SVA-F01/F02/F03 remain deferred.
- Root `CHANGELOG.md` was not edited. Initial and final `git hash-object CHANGELOG.md` both equal **`c0561a1048c2341b14dd7f9d3e7c1fc055ae1880`**. No subagents, concurrent build/test scripts, staging, commits, resets or reversions occurred.

### Task SVA-05: Integrate authorization into direct service operations and eliminate internal override transports

Status: completed

Owner: fresh isolated SVA-05 implementer. Repository/task conventions, C1–C10, frozen D00.1–D00.8 and SVA-01/01A/02/03/04 evidence reviewed; predecessors complete. Verification runs serially; earlier edits are preserved.

Priority: P0

Suggested role: model-service integration engineer.

Dependencies: SVA-03, SVA-04.

Primary ownership:

- `packages/access-router/src/services/service.ts`, `public-service.ts`, `model-service-defaults.ts`.
- Internal operation option/argument interfaces and `Defaults` in `interfaces/root.ts`.
- `packages/access-router/test/service-authorization-direct.integration.test.ts` and `service-authorization-mutations.integration.test.ts` (new).
- Existing direct virtual, denial, nested-update, permission-option, and upsert tests.

Finding: B1/B3/B6; service calls currently build separate query/output plans and transport mutation select/operation through overrides.

References: C1–C6/C8; `service.ts:1027-1657,1659-1889,1924-1991,2008-2307,2310-2506`, `public-service.ts:76-110,120-240,243-375`.

Implementation requirements:

1. Resolve one immutable policy/context and plan per operation. After fetching, associate per-document grant/field-decision results with the appropriate stage and pass those results through finalization and later picks.
2. Wire ordinary internal mutation select and private initiating operation; remove package-owned `overrides.effectiveSelect/operation/idFilter` construction.
3. Preserve read/list fallback effective accesses and identifier hook invocation counts; public fallback still cannot retry terminal Forbidden/BadRequest.
4. Preserve existing create/update input admission, validation and virtual write exclusion. Selected output grants do not authorize protected client input; `inputFields` policy keys reject as unsupported in this release.
5. Preserve upsert branch semantics, internal count/exists scopes, new-template operation matrix and historically ignored select, delete hooks, permissions virtual alias, list hard limits, and mutation result cardinality. Derive only applicable authority dimensions when dispatching an upsert create branch.
6. Public wrappers build request-only authority, do not inherit a prior internal context, and retain post-finalization trusted presentation behavior. Authorization is excluded from Defaults.
7. Fix stale override commentary and ensure `query` diagnostic projections reflect actual fetches separately from public output selection.
8. Choose request-mode default document-grant computation independently from metadata switches and capture grant-resolution call-count evidence.

Acceptance criteria:

- The central example passes through a real Mongo-backed Service with allowed/denied/deferred status and false/missing internalNote request rules; adapter projection and returned data are both asserted.
- The same example passes with skim, permissions disabled, field maps disabled, permissions stripped, and exposed keys limited.
- A subsequent pick with the same document-stage handle retains backend and ordinary document grants after private inputs/metadata are removed; another call on the same request/service without authorization does not inherit either result.
- Create/update/upsert output grants work while existing input rules protect stored values and all validation/hooks still run. Deferred input policy options fail before persistence.
- Upsert create/update branches preserve initiating operation and taken-branch accesses without duplicate identifier/query-transform/document-grant invocation.
- Internal count/exists and totalCount use the operation's resolved row policy; standalone row-only helpers retain their existing request-policy contracts. Output grants leave query-field checks unchanged.
- Focused direct/mutation tests and package tests/typecheck at the wave exit pass.

Completion evidence:

- Changed paths (SVA-05 ownership; package paths below are relative to `packages/access-router/`):
  - `src/services/service.ts`, `src/services/public-service.ts`, `src/services/model-service-defaults.ts` — direct reads/lists/by-ID/create/update/upsert/new consume the authenticated execution owner and retained catalog-backed output plan. Successful single/list/create/new results issue the agreed contexts. Ordinary mutation select replaces package effectiveSelect transport; public ID fallback and upsert use private identifier/prepared execution, with initiating operation retained. Defaults never merge authority or argument overrides. Update keeps its hydrated write document and positively includes selected schema-hidden output inputs without projecting away write/hook inputs.
  - `src/acl/service-execution.ts`, `src/acl/prepared-query.ts` — executor/decorator signatures now return `AuthorizedSingleResult`/`AuthorizedListResult` and accept `ServiceOutputDecorator`; private tokens and row binding checks are retained.
  - `src/acl/output-field-filter.ts` — request-only metadata evaluation reuses memoized request decisions, keyed by access/path, separately from effective backend field grants. Captured function-valued and per-access document hooks both work; hook-failure logging is preserved. Authorized opaque Mixed roots retain inert escaped marker-shaped business values while excluding prototype/implementation keys.
  - `src/acl/document-authorization.ts`, `src/acl/authorization-snapshot.ts` — graph-copy transfer follows hydrated embedded `_doc` values and own data descriptors without invoking presentation accessors again. Document snapshots support the package's non-enumerable permissions alias while policy/control admission remains strict.
  - `src/acl/field-catalog.ts` — Mongoose 9 `embeddedSchemaType` detection preserves reference-array classification. `src/services/base.ts` — package include copies transfer provenance; optional private parent-call provenance flows through request-only legacy/correlated read/list execution. This does not derive or grant target policies.
  - `test/service-authorization-fixture.ts`, `test/service-authorization-direct.integration.test.ts` (**15 tests**), `test/service-authorization-mutations.integration.test.ts` (**8 tests**) — real Mongo-backed adapter projection/output/handle tests, false/missing/denied/deferred rules, unselected/absent values, metadata postures, same-stage picks, row/call/request separation, snapshot mutation, embedded/include graph copies, count scope, write/validation/virtual exclusion, pre-/post-write stages, upsert branches, public request isolation, identifier fallback, and ignored new select.
  - `test/service-authorization-baseline.contract.test.ts`, `test/permissions-posture.integration.test.ts`, `test/include-permission-metadata.integration.test.ts`, `test/model-router.integration.test.ts`, `test/service-denial-contract.test.ts`, `test/service.internal.test.ts`, `test/service-authorization-boundary-admission.contract.test.ts` — intentionally replaced grant-loss/skim/effectiveSelect assertions; persisted-metadata fixture now explicitly interprets its stored value in a configured document hook; private-dispatch mocks use authenticated executor registration; prepared-query error/mandatory-constraint assertions match the integrated contract.
  - `README.md` — callable direct API, same-execution handles, projected hook inputs, ordinary mutation select, metadata-independent grants, ignored new select, request-only writes, and compilable installed-package examples. This task record contains status/evidence. Earlier worktree edits were preserved, including an unrelated setup-tools action edit observed during final status review.

- Final verification, serially from `<repo-root>`:

  ```sh
  git check-ignore _tmp
  TMPDIR=<repo-root>/_tmp pnpm --filter @web-ts-toolkit/access-router test
  pnpm --filter @web-ts-toolkit/access-router typecheck
  TMPDIR=<repo-root>/_tmp pnpm --filter @web-ts-toolkit/access-router exec vitest run --config vitest.config.ts test/service-authorization-direct.integration.test.ts test/service-authorization-mutations.integration.test.ts test/service-authorization-baseline.contract.test.ts test/service-authorization-context.unit.test.ts test/service-authorization-finalizer.unit.test.ts test/service-authorization-rows.integration.test.ts test/service-authorization-prepared-query.unit.test.ts test/service-authorization-boundary-admission.contract.test.ts test/service-denial-contract.test.ts test/read-list-fallback-authorization.integration.test.ts
  pnpm exec eslint packages/access-router/src/acl/authorization-snapshot.ts packages/access-router/src/acl/document-authorization.ts packages/access-router/src/acl/field-catalog.ts packages/access-router/src/acl/output-field-filter.ts packages/access-router/src/acl/service-execution.ts packages/access-router/src/acl/prepared-query.ts packages/access-router/src/services/service.ts packages/access-router/src/services/public-service.ts packages/access-router/src/services/base.ts packages/access-router/src/services/model-service-defaults.ts packages/access-router/test/service-authorization-fixture.ts packages/access-router/test/service-authorization-direct.integration.test.ts packages/access-router/test/service-authorization-mutations.integration.test.ts packages/access-router/test/service-authorization-baseline.contract.test.ts packages/access-router/test/permissions-posture.integration.test.ts packages/access-router/test/service-denial-contract.test.ts packages/access-router/test/service.internal.test.ts packages/access-router/test/service-authorization-boundary-admission.contract.test.ts packages/access-router/test/model-router.integration.test.ts packages/access-router/test/include-permission-metadata.integration.test.ts
  # Final test-only historical-oracle refresh; runtime unchanged after full gate.
  pnpm --filter @web-ts-toolkit/access-router exec vitest run --config vitest.config.ts test/service-authorization-baseline.contract.test.ts
  pnpm exec eslint packages/access-router/test/service-authorization-baseline.contract.test.ts
  git diff --check
  git hash-object CHANGELOG.md
  ```

- Results: **full package 92 files / 1,758 tests passed**, including packed-consumer, strict declarations, **35 documentation cases**, related/embedded/regression suites and both new Mongo suites. Required package typecheck and its transitive CJS/ESM/declaration build passed. Final focused gate **10 files / 310 tests passed**; the final historical-oracle-only refresh passed **1 file / 16 tests**. These overlap the full gate and are not additive totals. Focused ESLint/whitespace checks passed. `_tmp` was verified ignored and used for the final installed-consumer gate. No rebuilding scripts ran concurrently.
- Iteration evidence: first full invocation hit the harness's 120-second timeout; rerun with a longer timeout exposed 33 failed tests plus an unmarked README block, all resolved. Fixes included function-valued hooks, metadata alias capture, Mongoose 9 reference arrays, dotted-populate projection admission, inert Mixed values, registered private mock dispatch and compiled README imports. Final package run took approximately 471 seconds. Fixture insertion was made deterministic and hook observations captured at invocation rather than reading a subsequently mutated hydrated mock argument. Existing Vite native-config compatibility warning remained; no unresolved test/environment blocker.
- Central oracle: selected `internalNote` is in the real Mongo projection and survives false/missing request rules. Private `ownerId` is fetched for the hook and absent in data. Hook and stateful status decision each run **once** for the read stage, including metadata enabled/disabled/limited/stripped and skim postures; handle pick → trim keeps ordinary status plus backend note. Fresh request picks do not recover the doc-dependent result. Update hooks run **twice total**, once pre-write and once on the post-write snapshot; subsequent output picks do not add calls. Public upsert uses one identifier and one update transform; read fallback resolves one identifier with distinct read/list preparation. Full predecessor binding suites continue to reject wrong runtimes/models/stages/forged handles.

Private API / next-owner handoff:

1. **Operation/planning:** `createServiceExecution` / `readServiceExecution` / `deriveServiceExecution` remain the authenticated owners. Service's private `executionOutputPlan(execution, requestedSelect, internalFetch?, ignoreSelect?)` calls `planAuthorizedModelProjection` and retains its exact owner/binding/field states through finalization. Raw options are not re-resolved inside prepared executors. Public `_read` uses `resolveModelIdentifier` once, derives list access after an allowed miss, then separately prepares the list query. Public `_upsert` uses matching `executePreparedExists`/`executePreparedUpdateOne`; no-ID create derives only applicable output/related dimensions.
2. **Document/finalizer:** private `finalizeDirectOutput({ doc, plan, context, includePermissions?, includeFieldPermissions?, lean?, includePaths?, sharedGate? })` returns `{ data, context }`. It isolates projected input, resolves `resolveOutputDocumentAuthorization`, retains the exact stage/input for `finalizeModelOutput({ documentAuthorizationStage, onFinalized })`, performs metadata/include changes on a fresh copy, transfers the graph, and creates the context for that returned graph. Input/write admission continues through request-only helpers; it never consumes output grants.
3. **Returned context:** guaranteed `context.documentAuthorization` or aligned readonly `contexts` plus `getDocumentAuthorization(output)`. Authority properties remain non-enumerable/non-writable and outside `data`. Named `pickAllowedFields`/`trimOutputFields` and `genAllowedFields(..., { purpose: 'output' })` consume the issued handle. Decorators receive `ServiceOutputContext` before application presentation; arbitrary replacement/mutation does not acquire a valid output association.
4. **SVA-06:** `finalizePopulateForSingleDoc(..., parentPlan?)` has a request-only target-plan/provenance bridge; replace/extend it with the target plan retained during explicit related admission. Base `includeDocs(..., parentAuthorization?)` and `includeCorrelatedDocs(..., depth, parentAuthorization?)` carry provenance only to request-mode target execution. Package include pairing preserves handles through `transferDocumentAuthorizationGraph`. Exact target policy derivation, operation grants, descriptor validation and target fetch-plan integration remain SVA-06; this task does not claim them complete.
5. **SVA-07:** integrated embedded plans/handles now survive direct output/meta copies, including Mongoose 9 ref arrays and dotted population. Dedicated subdocument policy/visibility work remains with SVA-07 and request-only APIs. Existing embedded/subdocument package suites pass.
6. **SVA-09:** package `effectiveSelect`/`operation`/public `idFilter` construction is gone. Remaining externally accepted legacy select/filter/populate/idFilter branches and exported override members still require final removal/rejection. Mutation effectiveSelect/operation no longer drive canonical output; historical fixtures use ordinary select/private operation. No new legacy adapter was added. Standalone exists/count/delete/distinct and positional helpers retain their separate scope.

- Blockers: **none**. SVA-05 completed; SVA-06 is ready. SVA-F01/F02/F03 remain deferred. No subagents, staging, commits, resets or reversions occurred.
- Root `CHANGELOG.md` was not modified. Final `git hash-object CHANGELOG.md` equals the required baseline **`c0561a1048c2341b14dd7f9d3e7c1fc055ae1880`**.

### Task SVA-06: Apply explicit target policies to populate and all include execution paths

Status: completed

Owner: fresh isolated SVA-06 implementer. Repository/task conventions, C1–C10, frozen D00.1–D00.8 and predecessor completion evidence reviewed; SVA-00 through SVA-05 including SVA-01A complete. Verification runs serially.

Priority: P0

Suggested role: related-model integration engineer.

Dependencies: SVA-05.

Primary ownership:

- `packages/access-router/src/core.ts` (`genPopulate`).
- `packages/access-router/src/acl/populate-target.ts`, `populate-access.ts`.
- `packages/access-router/src/services/service.ts` (populate target finalization).
- `packages/access-router/src/services/base.ts` (legacy/correlated target execution).
- Related policy types and query descriptors only where required.
- `packages/access-router/test/service-authorization-related.integration.test.ts` (new).
- Existing cross-resource, populate/include, correlated, metadata, and grouped-count tests.

Finding: B4/B7; target admission and output trim currently cannot share explicit authority, and legacy generic options can become an unintended transport.

References: C7–C9; `core.ts:318-478`, `populate-target.ts:42-68`, `base.ts:1098-1217,1296-1607`, `service.ts:746-981`.

Implementation requirements:

1. Validate exact output/ref path and expected target model; resolve separate target operation/row/output contexts.
2. Use parent effective source-field authorization and target effective policy during admission/fetch/finalization; retain each target's call policy and per-document grant results privately, not in enumerable Mongoose arguments or parent grant maps.
3. Treat requested populate match/filter and include join/correlation predicates as query constraints ANDed with target scope.
4. Migrate legacy/correlated read/list/count dispatch to private prepared execution and explicit child policy; preserve preflight error semantics, target registration, and scalar/null/list behavior.
5. Scope nested child policies to their immediate receiving target. Parent or sibling elevation never implicitly applies to target data, target operation, or subqueries.
6. Maintain private association FK pairing, one logical target getter pass, copies per parent, correct counts, and existing bounded orchestration.
7. Apply population consistently across read/list/create/update/upsert; do not keep create override-asymmetry in the canonical new API.

Acceptance criteria:

- Parent field grant alone cannot bypass denied target operation/rows/fields; explicit child grants affect only that target/path.
- Explicit target output grant survives both target planning and trim for virtual/non-virtual models and fields absent from target permission schema.
- An unrestricted target cannot attach unrelated records; restrictive target scope cannot be overridden by descriptor match or local/foreign fields.
- Target-model mismatch, unsupported scope, nested control-slot authority, and metadata/virtual attachment collisions reject before target persistence.
- Read/list/count, legacy/correlated/nested includes, scalar IDs/nulls/arrays, custom non-reserved accesses, and post-mutation population have semantic coverage.
- Hidden FK/reference inputs are available privately for matching but absent from target/parent outputs unless independently selected and authorized.
- Two targets sharing the same call policy keep different document results; a second trim of one target reuses its own stage results after dependency/metadata cleanup.
- Focused related tests and established virtual/related/count regression suites pass.

Completion evidence:

- Changed paths (SVA-06 ownership; package paths relative to `packages/access-router/`):
  - `src/acl/related-execution.ts` (new) — synchronous registered descriptor/configuration capture, duplicate/path/model/count-policy validation through the existing policy owner, scoped nested-policy reconstruction and authenticated child execution. Child configuration and request-permission snapshots are captured independently of subsequent application mutation; missing child dimensions remain request mode.
  - `src/acl/service-execution.ts` — private optional captured target configuration/permission inputs on `createServiceExecution`; existing receiving-instance authentication and executor signatures preserved.
  - `src/acl/prepared-query.ts` — private related preparation can retain the parsed descriptor predicate as an additional required constraint after transformation. The new switch is a source-module preparation parameter, never a service/public option. Ordinary direct query rewriting remains unchanged.
  - `src/services/service.ts` — capture requested/defaulted target descriptors before hooks; canonical `genExecutionPopulate` uses parent effective source eligibility, independent target operation/row/output policies, prepared match constraints and retained target plans. Registered targets finalize with their own document state even without virtuals. Target Mongoose hook context is corrected; shared raw populate targets finalize once per retained target plan and transfer authenticated isolated copies per parent. Read/find/by-ID/create/update/upsert population uses this seam. The legacy Core/dedicated-subdocument compatibility bridge remains request-only.
  - `src/services/base.ts` — all legacy/correlated read/list/count paths derive explicit target execution; operation grants apply only at the existing target gate. Correlated false scopes reject before template parsing, private FK pairing/count/miss/error behavior and positive option allowlisting are retained. `$$sq` calls still use request-only target admission.
  - `test/service-authorization-related.integration.test.ts` (new, **26 tests**) — real Mongo false/missing target output rules, virtual/no-virtual targets, selection/absent values, independent operation/row/field denial controls, all related row modes, legacy/correlated read/list/count, correlated ID/nesting, sibling/call/document isolation, handle-aware picks, hidden FK/dependency exclusion, per-parent copies/getter counts, scalar/missing/array refs, post-create/update/upsert populate, false-scope-before-template and `$$sq` separation, wire controls, malformed target policies, exact custom access, async captured-policy/configuration mutation, metadata postures and limit-one orchestration.
  - `test/virtuals-populate-include.integration.test.ts` — added public request-mode match regression proving excluded referenced rows never run target getters and private dependencies stay absent.
  - `README.md` — callable related API, independent dimensions, count applicability, required query constraints and target-handle use. This task record carries status/evidence. Predecessor/unrelated worktree edits were preserved.

- Final verification from `<repo-root>`, with build/typecheck/test invocations serialized:

  ```sh
  pnpm --filter @web-ts-toolkit/access-router typecheck
  pnpm --filter @web-ts-toolkit/access-router exec vitest run --config vitest.config.ts test/service-authorization-related.integration.test.ts test/service-authorization-boundary-admission.contract.test.ts test/service-authorization-rows.integration.test.ts test/service-authorization-prepared-query.unit.test.ts test/cross-resource-authorization.integration.test.ts test/correlated-includes.execution.test.ts test/correlated-includes.escape.integration.test.ts test/grouped-count-casting.integration.test.ts test/include-permission-metadata.integration.test.ts test/virtuals-populate-include.integration.test.ts test/subdocument-populate-authorization.integration.test.ts test/virtuals-embedded-subdocuments.integration.test.ts test/service-authorization-direct.integration.test.ts test/service-authorization-mutations.integration.test.ts test/service-authorization-baseline.contract.test.ts test/service-denial-contract.test.ts test/operation-access-variants.contract.test.ts test/read-list-fallback-authorization.integration.test.ts test/permissions-posture.integration.test.ts
  pnpm exec eslint packages/access-router/src/acl/related-execution.ts packages/access-router/src/acl/service-execution.ts packages/access-router/src/acl/prepared-query.ts packages/access-router/src/services/service.ts packages/access-router/src/services/base.ts packages/access-router/test/service-authorization-related.integration.test.ts packages/access-router/test/virtuals-populate-include.integration.test.ts
  git diff --check
  git hash-object CHANGELOG.md
  ```

- Results: package source typecheck and its transitive CJS/ESM/declaration build **passed**. Final focused gate **19 files / 455 tests passed**, including **26 new related cases**, the new existing-suite populate-match regression, **64 admission/type cases**, **41 grouped-count cases**, metadata/virtual/custom-access/subdocument/fallback and predecessor direct/mutation/prepared suites. Focused ESLint and whitespace checks passed. No consumer temp directory was needed. The full package/workspace/packed-release gates remain assigned to later integration tasks.
- Iterations: initial regression gate passed 163 cases and exposed two request-only admission mocks with no parent runtime; the helper now avoids unnecessary parent binding on that fallback. New fixtures were corrected to use the established `$parent` marker, string correlated-ID inputs, supported default virtual getter for custom access, function-valued baseFilter hooks and established empty permission-map serialization. The actual match/filter rewrite omission and shared populated-getter repetition were fixed and pinned by semantic tests. Final tests emit only the existing Vite native-config compatibility warning. Earlier overlapping runs are not additive test totals.

Private target/child API handoff:

1. **SVA-07:** `captureRelatedTargets(runtime, modelName, { populate, include })` and `createRelatedExecution(receiver, accessTuple, parentAuthorization, parentBinding, path)` in `acl/related-execution.ts` are source-module-only. The latter authenticates the parent, selects only that exact child policy and captured target configuration, preserves logical provenance, and returns the existing `ServiceExecutionContext`. Read its `authorization`/`binding` with `readServiceExecution`; plan with `planAuthorizedModelProjection` and retain that plan. Count entries are reconstructed without their internal default output/related dimensions when validating nested policies. No raw child policy is forwarded through descriptor/options spreads.
2. **Populate:** private Service `genExecutionPopulate` retains the target's canonical plan in existing non-enumerable populate metadata. Mongoose only receives path/select/match; its ref constraint intersects the prepared target match. `finalizePopulateForSingleDoc` consumes that plan without replacing it with request authority, and `finalizeSinglePopulateTarget` deduplicates a shared raw target by retained-meta/raw-object identity. Copies transfer document graph associations. Dedicated subdocument/Core `genPopulate` callers still use the existing request-only bridge; SVA-07 owns their dedicated request-mode seams.
3. **Result graph:** SVA-05 `finalizeDirectOutput` and `context.documentAuthorization` / `getDocumentAuthorization(output)` contracts are unchanged. Related targets now carry their independently authorized plans/documents through metadata cleanup, parent finalization and FK pairing; child handles go to the target service's named helper at the target access. Null/scalar/count attachments have no child handle. Per-parent copies are distinct objects; no FK/dependency values are restored after trim.
4. **SVA-08:** successful trusted related grants are positive controls in the new suite. Whole-tree control-slot rejection and positive option allowlisting remain active; `$$sq` receives neither parent nor related grants. Run the integrated public/root/transformed-validator matrix as assigned. The admission declaration fixture passed in the final gate.
5. **SVA-09:** canonical populate and include paths use explicit execution/retained plans. External legacy override branches and `resolvePopulateMeta`'s bypass fallback still await assigned removal; Core's request-only positional helper surface and dedicated subdocument behavior remain separate. No service override adapter or public prepared/skip option was introduced.

- Blockers: **none**. SVA-06 completed; SVA-07 is ready. SVA-F01/F02/F03 remain deferred. No subdelegation, concurrent rebuilding scripts, staging, commits, resets or reversions occurred.
- Root `CHANGELOG.md` was never edited. Initial and final `git hash-object CHANGELOG.md` match **`c0561a1048c2341b14dd7f9d3e7c1fc055ae1880`**.

### Task SVA-07: Propagate embedded output grants and preserve dedicated subdocument behavior

Status: completed

Owner: fresh isolated SVA-07 implementer. Repository/task conventions, C1–C10, frozen D00.1–D00.8 and predecessor evidence/handoffs reviewed; SVA-00 through SVA-06 (including SVA-01A) complete. Verification runs serially.

Priority: P1

Suggested role: embedded/subdocument engineer.

Dependencies: SVA-05, SVA-06.

Primary ownership:

- `packages/access-router/src/services/model-subdocument-service.ts`.
- Subdocument helper seams in `services/service.ts` and interfaces in `interfaces/service.ts`.
- `packages/access-router/src/acl/virtual-projection.ts`/finalizer only for required child-scope integration.
- `packages/access-router/test/service-authorization-subdocuments.integration.test.ts` (new).
- Existing subdocument visibility/populate, embedded virtual, and nested-update tests.

Finding: B6; integrated parent output must propagate grants through embedded values with/without virtuals. Dedicated subdocument early-return/write-visibility paths also use shared helpers, so the refactor needs request-mode parity there without expanding their authorization API.

References: C2/C4/C6/C7; `model-subdocument-service.ts:91-145,178-288,311-539`, `service.ts:380-600`.

Implementation requirements:

1. Translate ordinary embedded output paths from integrated parent/target policies into scope-local grants; descendant grants preserve minimal container structure and independent siblings.
2. Apply inherited output policies with and without virtual configuration. Do not let a no-virtual `pick` shortcut or fallback strip an otherwise valid inherited grant.
3. Reuse the owning document's resolved grants with scoped field decisions; do not recalculate parent permissions from the trimmed embedded value or share a sibling target's results.
4. Adapt dedicated subdocument internals to explicit request-mode contexts and the new helper interfaces while keeping existing service signatures and parent/child row/operation/input checks.
5. Keep dedicated create/list/read/update/bulk-update/deletion and post-persist visibility gates intact. New `subdocuments` policy trees, custom child row scopes, and write elevation are SVA-F02/SVA-F01.
6. Use retained request-mode target plans for dedicated sub-populate; policy-bearing populated targets inside integrated parent output use their own related context. Neither path repeats getters or discards document results in a later pick.
7. Preserve raw persistence docs/snapshots, virtual output-only write guards, bounded work, array shape, and nested path/update semantics. Same-stage document results remain valid only for explicitly associated output copies.

Acceptance criteria:

- Granted `contacts.email` survives integrated parent/related-model output with/without child virtuals while ungranted sibling data is filtered.
- A child field grant cannot grant the parent row or referenced target data. Dedicated subdocument APIs continue to enforce their existing row/operation checks.
- Dedicated subdocument write tests show existing request-field admission, nested leaf integrity, and virtual-key removal; unsupported write/subdocument policy options cannot create new authority.
- Denied dedicated read/list/parent visibility after successful persistence still returns successful null/empty results and never executes hidden-row getters.
- Getter/grant resolution call counts, scalar/null/array/dotted sub-populate cases, and nested leaf patch preservation have tests.
- Relevant embedded/subdocument regression suites pass at the wave exit.

Completion evidence:

- Changed paths (SVA-07 ownership; package paths relative to `packages/access-router/`):
  - `src/acl/subdocument-output.ts` (new) — private request-only output preparation, scoped retained catalog plan, raw owning-parent document authorization and shared bounded finalization. The dedicated route's existing scoped field semantics are explicit: its own parent/child operation and row gates govern admission; the parent relationship output rule is not an additional dedicated-route gate. Owning grants are resolved once, with separate element decisions. Private receiver-registered population dispatch calls the existing canonical target planner; no public option or Service method was added.
  - `src/services/model-subdocument-service.ts` — list/read/post-write output all use the shared request-mode path, including models without virtuals. Removed no-virtual output picks and raw/legacy output fallbacks. Read/list retrieve the raw readable parent for the owning hook, eliminating the old virtual-only second parent lookup; post-save readability retrieves the raw readable parent once. Write lookups retain their original sub-only hydrated persistence document. Named `subdocumentInputFields` explicitly isolates existing positional persisted request-input admission; nested leaf application, virtual sanitation, payload limits, parent/child filters, deletion/save behavior and successful hidden `null`/`[]` responses remain. ReadSub retains its original population plans and finalizes only the visible row's targets on an output copy.
  - `src/services/service.ts` — registers the private dedicated-population callback to existing `genExecutionPopulate`; canonical related target planning/finalization is reused. `src/output/finalize-model-output.ts` — exposes the existing owning-document/binding fields on its source-module argument type for dedicated finalization; the owning raw stage supplies grants without rerunning the hook on a child. Integrated embedded translation/minimal ancestors already supplied by SVA-02/03/05/06 were reused and verified through real services.
  - `test/service-authorization-subdocuments.integration.test.ts` (new, **26 tests**) — with/without virtuals, denied containers/siblings, explicit leaf selection/minimal arrays, null values, parent row denial, populated and included embedded target grants, dotted refs, independent target owner results, copied handle reuse, dedicated list/read grant counts, subpopulate arrays/nulls/target row policy, request-only writes, nested leaf preservation, virtual exclusion, create/update/bulk/delete persistence, successful hidden output, terminal child/parent denial, limit-one execution and control-slot rejection.
  - `test/operation-access-data-subdocument-routes.integration.test.ts` — replaced a legacy Core.genSelect call-count/access assertion with the retained-plan contract; existing exact route response and row/operation assertions remain. `test/operation-access-boundaries.integration.test.ts` — wave-exit discovery: four assertions still expected source/target work before SVA-06 recursive reserved-descriptor preflight. They now require earlier no-work rejection; options-access dispatch behavior and controlled BadRequest assertions remain. Fixed two existing multiline computed-member lint errors in that touched fixture. This task document records status and evidence; earlier worktree changes were preserved.

- Verification from `<repo-root>`, serially (the actual temp path was the checkout's ignored `_tmp`):

  ```sh
  pnpm --filter @web-ts-toolkit/access-router... build
  pnpm --filter @web-ts-toolkit/access-router build
  pnpm --filter @web-ts-toolkit/access-router exec tsc --noEmit -p tsconfig.typecheck.json
  pnpm --filter @web-ts-toolkit/access-router exec vitest run --config vitest.config.ts test/service-authorization-subdocuments.integration.test.ts test/virtuals-embedded-subdocuments.integration.test.ts test/subdocument-mutation-visibility.integration.test.ts test/subdocument-populate-authorization.integration.test.ts test/model-subdocument-routes.integration.test.ts test/operation-access-data-subdocument-routes.integration.test.ts test/nested-update-integrity.integration.test.ts test/service-authorization-finalizer.unit.test.ts test/service-authorization-direct.integration.test.ts test/service-authorization-related.integration.test.ts test/service-authorization-boundary-admission.contract.test.ts test/virtuals-populate-include.integration.test.ts
  git check-ignore _tmp
  TMPDIR=<repo-root>/_tmp pnpm --filter @web-ts-toolkit/access-router test
  pnpm --filter @web-ts-toolkit/access-router exec vitest run --config vitest.config.ts test/operation-access-boundaries.integration.test.ts
  pnpm --filter @web-ts-toolkit/access-router typecheck
  # Final full-package rerun after the historical ordering assertions were corrected:
  TMPDIR=<repo-root>/_tmp pnpm --filter @web-ts-toolkit/access-router test
  pnpm exec eslint packages/access-router/src/acl/subdocument-output.ts packages/access-router/src/services/model-subdocument-service.ts packages/access-router/src/services/service.ts packages/access-router/src/output/finalize-model-output.ts packages/access-router/test/service-authorization-subdocuments.integration.test.ts packages/access-router/test/operation-access-data-subdocument-routes.integration.test.ts packages/access-router/test/operation-access-boundaries.integration.test.ts
  git diff --check
  git hash-object CHANGELOG.md
  ```

- Results: final focused gate **12 files / 434 tests passed**; corrected boundary suite **1 file / 142 tests passed**; final full package **94 files / 1,811 tests passed**, including packed-consumer, strict declarations, documentation and all embedded/visibility/populate/nested-update suites. Package typecheck and transitive CJS/ESM/declaration builds passed. Focused ESLint and whitespace checks passed. Runs overlap and are not additive totals. Final full test duration approximately 393 seconds. No concurrent rebuilding scripts. Existing Vite native-config compatibility warning only.
- Iterations: initial declaration generation exposed an inferred private return type, resolved with an explicit local plan interface. New fixture corrections included actual error-code values, the existing dotted-leaf write policy grammar, independent target container rules, and obtaining a handle from the original result graph before using it on a package-created helper copy. Context lookup remains graph-bound; arbitrary caller copies gain no handle. The first full gate reported **1,807 passed / 4 failed** due solely to the obsolete descriptor-order assertions described above; the final full gate passes. No outstanding test/environment blocker.

Handoff:

1. **SVA-08:** new suite supplies successful integrated parent, populate and include embedded grant controls plus denied dedicated control-slot cases. Use the original result's `context.getDocumentAuthorization(originalChild)` to obtain its handle; that handle also authenticates explicitly associated helper-return copies. Whole-tree public/root/transformed-validator verification remains SVA-08. Full package now pins early reserved nested descriptor preflight without source/target persistence.
2. **SVA-09:** dedicated canonical output uses `prepareSubdocumentOutput` → `finalizeSubdocumentRows`, and subpopulate uses `prepareSubdocumentPopulate` with retained request-mode target plans. Dedicated write admission is intentionally the persisted request evaluator wrapped by `subdocumentInputFields`; do not replace it with output projection or remove positional compatibility under this task. Existing externally accepted override branches/removal remain SVA-09. Old public sub-virtual helper signatures remain compatible but are no longer the dedicated canonical output path.
3. Owning-parent hook inputs are raw readable documents, never finalized child DTOs. Successful denied post-write visibility returns before hooks/getters. Related target grants/decisions remain independent; no target authority is reconstructed from parent grants. Integrated output reuses predecessor scoped plans and copy transport; no raw restoration or getter rerun was introduced.

- Blockers: **none**. **SVA-07 completed; SVA-08 is ready.** SVA-F01/F02/F03 remain deferred. No subdelegation, staging, commits, resets or reversions occurred.
- Root `CHANGELOG.md` was never edited. Initial and final Git blob hash: **`c0561a1048c2341b14dd7f9d3e7c1fc055ae1880`**.

### Task SVA-08: Verify public boundaries end-to-end after authorization integration

Status: completed

Owner: fresh isolated SVA-08 implementer/reviewer. Repository/task conventions, C1–C10, frozen D00.1–D00.8 and predecessor completion evidence reviewed; all dependencies complete. Verification runs serially using valid prior builds until source changes require rebuilding.

Priority: P0

Suggested role: request/dispatch boundary engineer.

Dependencies: SVA-01A, SVA-05, SVA-06, SVA-07.

Primary ownership:

- `packages/access-router/test/service-authorization-public-boundaries.integration.test.ts` (new).
- Admission tests from SVA-01A and existing root/operation-variant/custom-validator tests.
- SVA-01A source/type/dispatch ownership only for concrete failures exposed by integrated tests; record corrective changes and rerun the early gate.
- The concrete positive-control failures recorded below additionally require narrow corrections in `src/acl/service-authorization.ts`, `related-execution.ts`, `service-execution.ts`, `output-field-filter.ts` and `src/services/service.ts` under `packages/access-router/`.

Finding: B7; early boundary enforcement must still hold after all internal services, related paths, and document handles are wired. This task verifies that invariant with actual working backend grants rather than introducing protection late.

References: C9; `base.ts:1048-1052,1107-1114,1148-1156,1634-1656`; public/root schemas cited in B7.

Implementation requirements:

1. Exercise SVA-01A control-slot rejection through real direct/root/nested/public-wrapper execution, including transformed custom-validator output.
2. For each negative authority-injection scenario, include a trusted internal positive control proving the same field/row/target grant actually works when supplied by backend code.
3. Exercise same-request/service reuse: an internal granted call followed by a public call cannot transfer its policy, document results, or prepared state.
4. Verify positive option allowlists retain supported query/presentation settings and legitimate business properties named `authorization`/`overrides`.
5. Preserve generated route/base/variant guard semantics and reserved populate access rejection.
6. Verify public serializers exclude call policy, per-document results, prepared tokens, and related plans; temporary backend grants do not change the user permission metadata contract.
7. If integration exposes a forwarding gap, fix it at the shared dispatch boundary, update SVA-01A regression coverage, and rerun that prerequisite rather than documenting a known gap for release.

Integrated findings (SVA-08, required to make the positive controls pass):

- A valid related count grant succeeds without embedded output, but selecting an embedded value makes `authorizeEmbeddedOutputPlan` resubmit normalized count defaults (`outputFields`/`related`) as caller-supplied policy. Raw count-policy validation correctly rejects those unsupported supplied dimensions, so an otherwise valid granted read fails during finalization. Reconstruct only applicable input dimensions at package-owned policy derivation boundaries; preserve strict raw-policy admission and test count grants with embedded output.
- Legacy list-include association cleanup removes the private foreign field before nested legacy/correlated includes consume it as their own join/reference input. A nested include using that same unselected field silently loses its result despite a valid target grant. Retain the private value through nested dispatch, then remove it before output hooks/finalization; pin successful nested attachments and absence of the private field in output.
- The legacy include marker preflight scans `args.include` as part of the outer descriptor and rejects a valid nested correlated include's `$parent` marker as if it belonged to the legacy parent. Check the legacy descriptor's own slots while retaining recursive control-slot admission for child includes. Add an SVA-01A regression proving mixed nested descriptors are forwarded and poisoned child options still reject before dispatch.

Acceptance criteria:

- Attempts to supply output/row/target/operation authority, unsupported input/subdocument policy, or issued-document-state lookalikes via direct HTTP/root/include/populate/$$sq control slots fail with the agreed errors. Legitimate internal grants are verified as positive controls.
- No persistence occurs before an early denied/invalid control-slot request.
- Public `_read/_list/_create/_update/_upsert` JS calls cannot inherit internal authority from prior calls or defaults.
- Legitimate persisted properties with reserved English names remain data, and permitted unrelated passthrough behavior is not broadly removed.
- Response JSON has no policy context, prepared token, internal grants, or extra child plan metadata; existing public/internal DTO-brand checks pass.
- Both SVA-01A admission tests and focused integrated boundary, operation-variant, custom-validator, and root parity tests pass.

Completion evidence:

- Changed paths (SVA-08 ownership; package paths relative to `packages/access-router/`):
  - `test/service-authorization-public-boundaries.integration.test.ts` (new, **37 tests**) — installed-bundle, Mongo-backed controls for direct HTTP/root batches, JS `_list`/`_read`/`_create`/`_update`/both `_upsert` branches, scope/unrestricted rows, legacy/correlated read/list/count and nested includes, populate/subpopulate passthrough, `$$sq`, eight whole-envelope/data-validator variants, unsupported input/subdocument policy, issued-handle/JSON-copy/prepared lookalikes, defaults and same-request/service reuse. Every negative scenario has a successful trusted field/row/target grant control. All adapter spies call through to real Mongoose; assertions observe source/target find/findOne/count/aggregate/create/save and collection insert/update plus the actual target-service admission method across JS and new HTTP/root requests.
  - `test/service-authorization-boundary-admission.contract.test.ts` — **65 tests** (previously 64). Added mixed legacy/correlated descriptor admission with poisoned child-control rejection before dispatch; positive private read/list forwarding now explicitly retains nested include selection. The early suite continues to compile its strict emitted public/wire/default declaration fixture.
  - `src/acl/service-authorization.ts`, `src/acl/related-execution.ts`, `src/acl/service-execution.ts`, `src/acl/output-field-filter.ts` — shared package-only `serviceAuthorizationInput` reconstruction preserves count applicability when deriving embedded, related and branch policies. Count entries retain model/operation/rows without treating normalized output/related defaults as supplied dimensions. Raw policy admission, authenticated owners and public exports retain their existing contract.
  - `src/services/base.ts` — legacy marker checks inspect the descriptor's own slots, allowing `args.include` to own a correlated child scope. Recursive public-control preflight still precedes descriptor processing/target dispatch, and a marker in the legacy filter still rejects.
  - `src/services/service.ts` — private association inputs survive nested dispatch and original correlated snapshots. Diagnostic snapshots are cleaned afterward; the private finalizer removes the association-only input after detaching requested include outputs and before document hooks/getters. This also preserves a legitimate include attachment deliberately reusing the foreign-field path. No raw field is restored after output trimming, and the existing private association index still handles parent pairing.
  - `docs/tasks/20261007-143507-access-router-explicit-service-authorization.md` — status, concrete discoveries, corrective scope, verification and handoff. Total SVA-08 ownership: **6 runtime files, 2 test files, this task record**.

- Final verification from `<repo-root>`, serially. The last package build and direct source-typecheck step passed after the final runtime changes; subsequent fixture-only corrections reused that build. Transitive dependency outputs from the SVA-07 gate remained valid. The actual `TMPDIR` was the verified ignored checkout-local `_tmp`:

  ```sh
  pnpm --filter @web-ts-toolkit/access-router build
  pnpm --filter @web-ts-toolkit/access-router exec tsc --noEmit -p tsconfig.typecheck.json
  git check-ignore _tmp
  TMPDIR=<repo-root>/_tmp pnpm --filter @web-ts-toolkit/access-router exec vitest run --config vitest.config.ts test/service-authorization-public-boundaries.integration.test.ts test/service-authorization-boundary-admission.contract.test.ts test/root-router.integration.test.ts test/root-router.variants.integration.test.ts test/operation-access-variants.contract.test.ts test/operation-access-model-routes.integration.test.ts test/operation-access-data-subdocument-routes.integration.test.ts test/operation-access-boundaries.integration.test.ts test/read-list-fallback-authorization.integration.test.ts test/validation-arh06.test.ts test/validation-arh07.test.ts test/validation-arc02.test.ts test/validation-error-boundary.test.ts test/virtuals-route-parity.integration.test.ts test/response-pipeline.internal.test.ts test/export-contract.test.ts test/correlated-includes.validation.test.ts test/virtuals-validation-openapi.contract.test.ts
  TMPDIR=<repo-root>/_tmp pnpm --filter @web-ts-toolkit/access-router exec vitest run --config vitest.config.ts test/service-authorization-related.integration.test.ts test/service-authorization-subdocuments.integration.test.ts test/service-authorization-direct.integration.test.ts test/service-authorization-mutations.integration.test.ts test/service-authorization-finalizer.unit.test.ts test/service-authorization-context.unit.test.ts test/service-authorization-prepared-query.unit.test.ts test/service-authorization-rows.integration.test.ts test/correlated-includes.execution.test.ts test/correlated-includes.escape.integration.test.ts test/cross-resource-authorization.integration.test.ts test/grouped-count-casting.integration.test.ts test/virtuals-hardening.boundary.test.ts test/virtuals-populate-include.integration.test.ts test/virtuals-embedded-subdocuments.integration.test.ts test/service-denial-contract.test.ts test/include-permission-metadata.integration.test.ts test/permissions-posture.integration.test.ts
  pnpm exec eslint packages/access-router/src/acl/service-authorization.ts packages/access-router/src/acl/related-execution.ts packages/access-router/src/acl/output-field-filter.ts packages/access-router/src/acl/service-execution.ts packages/access-router/src/services/base.ts packages/access-router/src/services/service.ts packages/access-router/test/service-authorization-public-boundaries.integration.test.ts packages/access-router/test/service-authorization-boundary-admission.contract.test.ts
  git diff --check
  git hash-object CHANGELOG.md
  ```

- Results: package CJS/ESM/declaration build and source typecheck **passed**. Admission/public/root/operation/custom-validator/DTO gate **18 files / 618 tests passed** (approximately 118 seconds). Shared authorization/related/count/embedded/virtual/denial/metadata gate **18 files / 465 tests passed** (approximately 85 seconds). These two final gates are disjoint: **36 files / 1,083 tests passed**, including **37 SVA-08**, **65 SVA-01A**, both strict authorization declaration fixtures and the public/internal DTO-brand checks. Focused ESLint and whitespace checks passed. Earlier overlapping development runs are not additional test totals. The latest full-package evidence remains SVA-07's **94 files / 1,811 tests**; the commands above are SVA-08's focused verification. Existing Vite native-config compatibility warning only; no outstanding test/environment failure.

- Regression evidence and final review:
  1. The successful-backend controls initially exposed all three recorded defects: count-with-embedded failed with `unsupported related.items key: outputFields`; nested includes lost their result when sharing the private foreign field; a legacy parent rejected its valid correlated child's marker. The repaired controls now succeed, including both legacy/correlated children and output attachments reusing the foreign-field path. Target getters see no private association value and run once per output row; target-handle picks preserve the granted result. SVA-01A's new marker-scope regression also fails against the old whole-descriptor check.
  2. Invalid control slots return controlled BadRequest/HTTP 400 before observed source/target persistence or target-service dispatch, including a valid first root entry followed by an invalid entry. Explicit false query/scope and request-row denial remain terminal. A `$$sq` target denied by its operation gate remains denied even when the same target has a successful related grant elsewhere in the call.
  3. Same-instance public calls remove the prior backend note grant in every public operation family. An owning-document hook runs once for the initial read and is not rerun by a valid handle pick; after changing the stored owner on the same `_id`, the next public read computes a fresh second hook result and loses the owner-only field. The prior handle rejects the new output. A backend-unrestricted row cannot be read publicly afterward, and the subsequent public read performs a fresh query transform rather than reusing the prepared predicate. Authority defaults reject atomically; replacement JS defaults are rejected at admission while supported selection/presentation defaults remain usable.
  4. Ordinary payload/filter fields `authorization`/`overrides`, selection, sort, pagination/counts, include presentation, populate/subpopulate selection and `$$sq` path/compact options work. Output grants do not write the protected field; attempted input elevation leaves the server default intact. Permission metadata retains the request-user `mayReadNote: false` and never grants `_view`/`_edit` for the backend-only note. Stripped metadata preserves business output. Recursive own-property/symbol checks pass for service data, actual granted-result public serialization and direct/root DTOs; opaque handles stay non-enumerable/non-writable on internal context only. Basic/advanced guards and reserved target-access rejection pass both new controls and established operation suites.
  5. Test-only iteration fixes used the actual underscore error-code values, Created response status, `requestSchemas.create` key, permission-schema container grammar and permission-map booleans; the early marker test isolates its unrelated model-catalog seam. These were fixture corrections, not relaxed runtime expectations. No client-authority bypass was observed; the runtime corrections are the concrete derivation/forwarding failures required to make legitimate controls work.

Handoff:

1. **SVA-09 is ready.** Remove the remaining external service `overrides` container and run its migration gates. Public/wire overrides already reject; currently supported internal legacy calls remain the separate SVA-09 migration surface. Preserve the new integrated and early-admission suites while removing those branches.
2. **SVA-10:** retain the existing exported API and strict public/internal distinction in declarations/docs/packed consumers. The new reconstruction helper and `privateAssociationField` finalizer input are source-module/private implementation details, not exported capabilities or wire options. Nested includes keep their own target policies, marker scopes and document handles; metadata continues to describe request permissions.
3. **SVA-11/coordinator:** independently review the three concrete fixes and run the assigned full integration gates. SVA-F01/F02/F03 remain deferred. Blockers: **none**. **SVA-08 completed.**

- Root `CHANGELOG.md` was never edited; initial and final Git blob hash **`c0561a1048c2341b14dd7f9d3e7c1fc055ae1880`**. The unrelated `.github/actions/setup-tools/action.yml` edit and all predecessor work were preserved. No subagents, concurrent build scripts, staging, commits, resets or reversions occurred.

### Task SVA-09: Remove service overrides and finalize the breaking-release migration

Status: completed

Owner: fresh isolated SVA-09 implementer. Repository/task conventions, C1–C10, frozen D00.1–D00.8 and predecessor completion evidence reviewed; all required tasks through SVA-08 including SVA-01A complete. Verification runs serially.

Priority: P1

Suggested role: API migration/release engineer.

Dependencies: SVA-05, SVA-06, SVA-07, SVA-08.

Primary ownership:

- Service argument/default interfaces, remaining override resolver branches, and package-owned call sites.
- `packages/access-router/src/interfaces/root.ts` defaults; policy-aware helper overloads only for migration documentation and isolation checks.
- `packages/access-router/test/service-authorization-migration.contract.test.ts` (new).
- Breaking-release/migration notes in `packages/access-router/README.md` and this task record. `CHANGELOG.md` is excluded by explicit maintainer instruction.

Finding: B1/B3/B4; an implicit partial migration leaves inconsistent authority channels in place.

References: C10; current `service-find.ts`, `service-create.ts`, `service-update.ts`, `model-service-defaults.ts`, existing denial-contract tests.

Implementation requirements:

1. Implement C10 removal for the designated breaking release. No deprecated override adapter, hidden fallback, or dual service-container behavior ships.
2. Remove all package-owned runtime use and exported argument/default properties of `overrides`, including prepared filters, ID reuse, mutation selection, and initiating operation.
3. Reject JS/mistyped legacy control slots before parsing/persistence, including `{ overrides: {} }`, mixed new/old options, and supplied null/undefined legacy keys. Error details name the migration path without serializing sensitive values.
4. Provide strict consumer negative cases for removed service properties and runtime migration tests; documentation describes actual removal rather than a still-supported `@deprecated` service argument.
5. Verify canonical execution only uses new policy-aware helpers/private system retention. Keep isolated legacy positional helper overloads until SVA-F03; this does not retain the removed service container.
6. Update live tests that require historical override behavior to the new contract and retain historical evidence in task notes.
7. Document predicate/scope/transform differences, ordinary select and explicit related policies, unchanged input authorization, and the model/router `overrideFilter` hook's separate C5 contract.
8. Add release notes for ordinary document grants becoming independent of skim/metadata flags. Record the exact behavior change alongside the removed service arguments.

Acceptance criteria:

- A repo search finds no active service `args.overrides` transport or accepted exported service property. Remaining mentions are migration/rejection tests, documentation, or unrelated hooks/test helpers.
- Published declarations and runtime errors agree that the complete service container was removed. New/old mixtures cannot trigger an alternative authority path.
- Old filter false/nullish semantics have a concrete new-policy equivalent; source/destination examples cover every migration-table row.
- The configured overrideFilter hook/setter remains functional with frozen row-mode placement.
- Migration tests, package typecheck, and the current live denial-contract suite pass.

Completion evidence:

- Changed paths (SVA-09 ownership; package paths below are relative to `packages/access-router/`):
  - `src/interfaces/service-find.ts`, `service-create.ts`, `service-update.ts`, `root.ts` — removed every service `overrides` property, including all six entries and nested/dotted default views. Existing argument generics remain usable; mutation selection is ordinary `select`, and authority remains per-call options only.
  - `src/services/model-service-defaults.ts` — removed legacy container resolution and obsolete casts. `src/services/service.ts` — shared presence-based entry rejection for args/options before resolution/parsing/ID/child/persistence work, plus existing authority-free defaults admission. Reads/by-ID/create/update/upsert/new and existing standalone option slots reject supplied controls, including null/undefined, non-enumerable/inherited/accessor/array/function shapes. Details identify the removed slot and README/ordinary-argument/authorization migration without reading or echoing the supplied value. All legacy filter/select/populate/ID branches, on-demand populate-plan fallback, and optional unprepared execution/count fallbacks are removed; prepared bodies require the authenticated execution context. Population consumes the target plan retained at admission.
  - `src/acl/virtual-projection.ts`, `src/acl/output-projection.ts` — removed the obsolete `trustedOverrideSelect` transport and its fetch/output-provenance branches. Existing private join/identity/extra-persisted inputs remain fetch-only. `src/acl/select-resolution.ts`, `src/core.ts`, `src/services/base.ts` — updated stale service-override commentary; the configured query-transform hook and isolated positional helper behavior remain functional.
  - `test/service-authorization-migration.contract.test.ts` (new, **52 tests**) — real bundled/Mongo-backed per-entry replacement controls, **624** legacy-value/args-or-options/new-policy combinations across eight methods, **104** inherited/non-enumerable/accessor/null-prototype/array/function/getter-order attempts, default and standalone-slot rejection, no parsing/dispatch/persistence or sensitive-value echo, false-scope equivalents, nullish/empty scope distinction, configured transform/count scope, custom lookup migration, private upsert operation, private include preparation, ordinary mutation select, request-only writes, business `overrides`/`authorization`, named helper replacements, and explicit grants surviving finalizer → handle pick → trim.
  - `test/service-authorization-migration.types.fixture.ts` (new), `test/strict-consumer-types.test.ts` — shared strict source-surface and installed-package fixture with **23** expected-error sites plus key-of absence assertions. Checks all argument families/defaults, mixed calls, all six removed controls, no renamed prepared/operation escape hatch, valid business fields and canonical replacements. Source symbols are checked under strict compiler options within the migration suite; the package's separate source typecheck covers all implementation files. Installed package-name imports run in **Bundler `.ts`, NodeNext ESM `.mts`, and NodeNext CJS `.cts`** consumers.
  - `test/service-denial-contract.test.ts` (**73 tests**) — replaced old false/nullish/object override assertions with false query/ID/scope, omitted/request/empty policy, invalid scope and explicit scope/unrestricted semantics; corrected the private create-executor mock signature and result contexts. `test/service-authorization-baseline.contract.test.ts` (**16 tests**) — replaced the remaining old filter-hook/ID/populate/create-asymmetry requirements with C5, normal identifier/custom-predicate, independent target-policy and removed-container rejection assertions. D00.1 and predecessor Completion evidence retain the original behavior and migration history. `test/virtuals-projection-planner.unit.test.ts`, `test/service-authorization-projection.unit.test.ts` use private fetch inputs rather than a fake retired selection transport.
  - `README.md` — complete C10 before/after table (all nine rows), fixed breaking-release removal, actionable presence rejection, false/nullish mapping, transform-versus-base-scope difference, ordinary select/populate/related policies, private transport/initiating-operation explanation, independent skim/metadata document grants, request-only writes, retained positional helper scope and annotated package-import example. This task record contains status/evidence. **Total SVA-09 ownership: 11 source/type files, 7 test/fixture files, README and this task record (20 files; two new test files).**

- Final verification from `<repo-root>`, with all build/typecheck/test commands serialized. `_tmp` was verified to exist and be ignored; consumer suites used its actual checkout-local absolute path and cleaned their own fixtures:

  ```sh
  git check-ignore _tmp
  pnpm --filter @web-ts-toolkit/access-router typecheck
  TMPDIR=<repo-root>/_tmp pnpm --filter @web-ts-toolkit/access-router exec vitest run --config vitest.config.ts test/service-authorization-migration.contract.test.ts test/service-denial-contract.test.ts test/service-authorization-baseline.contract.test.ts test/service-authorization-boundary-admission.contract.test.ts test/service-authorization-direct.integration.test.ts test/service-authorization-mutations.integration.test.ts test/service-authorization-related.integration.test.ts test/service-authorization-rows.integration.test.ts test/service-authorization-projection.unit.test.ts test/virtuals-projection-planner.unit.test.ts
  TMPDIR=<repo-root>/_tmp pnpm --filter @web-ts-toolkit/access-router exec vitest run --config vitest.config.ts test/strict-consumer-types.test.ts test/documentation-examples.test.ts test/export-contract.test.ts test/service-authorization-context.unit.test.ts test/service-authorization-prepared-query.unit.test.ts test/service-authorization-finalizer.unit.test.ts test/service-authorization-public-boundaries.integration.test.ts test/service-authorization-subdocuments.integration.test.ts test/filter-denial.integration.test.ts test/read-list-fallback-authorization.integration.test.ts test/correlated-includes.execution.test.ts test/grouped-count-casting.integration.test.ts test/virtuals-populate-include.integration.test.ts test/subdocument-populate-authorization.integration.test.ts test/virtuals-embedded-subdocuments.integration.test.ts test/service.internal.test.ts test/arc21-projection-identity-and-count-argument.contract.test.ts test/data-service-hot-path.test.ts test/data-service-scaling.test.ts
  pnpm exec eslint packages/access-router/src/interfaces/service-find.ts packages/access-router/src/interfaces/service-create.ts packages/access-router/src/interfaces/service-update.ts packages/access-router/src/interfaces/root.ts packages/access-router/src/services/model-service-defaults.ts packages/access-router/src/services/service.ts packages/access-router/src/services/base.ts packages/access-router/src/acl/virtual-projection.ts packages/access-router/src/acl/output-projection.ts packages/access-router/src/acl/select-resolution.ts packages/access-router/src/core.ts packages/access-router/test/virtuals-projection-planner.unit.test.ts packages/access-router/test/service-authorization-projection.unit.test.ts packages/access-router/test/service-denial-contract.test.ts packages/access-router/test/service-authorization-baseline.contract.test.ts packages/access-router/test/service-authorization-migration.contract.test.ts packages/access-router/test/service-authorization-migration.types.fixture.ts packages/access-router/test/strict-consumer-types.test.ts
  git diff --check
  rg --no-ignore --count-matches --include-zero '\boverrides\b|trustedOverrideSelect|overrideIdFilter|overridePopulate|overrideSelect' packages/access-router/dist -g '*.d.ts' -g '*.d.mts'
  git hash-object CHANGELOG.md
  ```

- Results: required package typecheck and its transitive CJS/ESM/declaration build **passed**. Migration/live-denial/baseline/admission/new-authority gate **10 files / 368 tests passed** (approximately 29 seconds). Consumer/docs/export/context/related/embedded/denial/data regression gate **19 files / 414 tests passed** (approximately 140 seconds). These final gates are disjoint: **29 files / 782 tests passed**, including **52 migration**, **73 live denial**, **16 baseline**, **65 early admission**, **37 integrated public-boundary**, and **36 documentation** cases. Focused ESLint and whitespace checks passed. All three installed strict migration consumers and both preceding strict authorization fixtures passed. Comprehensive packed-publication checks remain assigned to SVA-10; full integration/workspace gates remain assigned to SVA-11.
- Iteration evidence: an initial direct `tsc --noEmit -p tsconfig.typecheck.json` exposed three dotted default entries still referring to removed `DefaultFind*Args` aliases. They now use `Defaults<TModel>[...]`, matching the other dotted views. The subsequent required package typecheck/build and both final test gates passed. Existing Vite native-config compatibility warning only; no unresolved test/environment failure.

Final search and isolation findings:

1. A source search for `overrides`, `trustedOverrideSelect`, `overrideIdFilter`, `overridePopulate`, and `overrideSelect` under `packages/access-router/src` finds **four lines only**: the two removal-guard/message lines in `src/services/service.ts`, the existing rejection-control list in `src/validation/public-admission.ts`, and the unrelated custom/test adapter-method comment in `src/model.ts`. **No accepted service container/property, resolver, caller transport or old-authority branch remains.** The exact declaration count command above returned **zero matches in each of all eight `.d.ts`/`.d.mts` files**. Emitted `Find*Args`, `CreateArgs`, `Update*Args`, `UpsertArgs` and `Defaults` were also inspected directly.
2. A package-source search for `args.overrides`, an `overrides` property/parameter declaration, or `trustedOverrideSelect` found only unrelated `packages/express-oidc-vault/src/cookies.ts` cookie-option overrides and `packages/create-access-router-mongo-starter/src/cli.ts` scaffold dependency injection. No access-router runtime source match. Historical container mentions intentionally remain in this task's B/D00/predecessor evidence and older task records, README migration text, the new rejection/type tests, baseline rejection/legacy-helper characterization, `service-authorization-boundary-admission.contract.test.ts`, `service-authorization-boundary.types.fixture.ts`, `service-authorization-public-boundaries.integration.test.ts`, `cross-resource-authorization.integration.test.ts`, and `correlated-includes.execution.test.ts`. Business-data fixtures and unrelated helper variables keep their ordinary names.
3. The configured `overrideFilter` hook/setter remains in `src/core-shared.ts`, `src/interfaces/root.ts`, `src/routers/model-router.ts` (and the separate data-router setter), captured by `src/acl/model-output-planning.ts`. New migration tests exercise the setter, one transform in every row mode and matching totalCount; the refreshed baseline also proves user-dependent transform false remains terminal in every mode.
4. Canonical service output retains `executionOutputPlan` → `finalizeDirectOutput`/target finalization and same-stage handles; it does not call positional select/pick/trim for authority. Remaining `genAllowedFields` calls in `src/services/service.ts` are create/update **input admission** and standalone distinct-field authorization. `src/services/model-subdocument-service.ts` uses the explicitly named `subdocumentInputFields` request-input wrapper. Core/Base positional `skipChecks`/`baseFields`, older sub-virtual planning helpers and DataCore/DataService remain isolated under frozen D00/F03 scope. Remaining `effectiveSelect` names describe ordinary/private projection planning and public mutation selection, not a service override control.

Handoff:

- **SVA-09 completed; SVA-10 is ready. Blockers: none.** SVA-10 must finish publication/JSDoc/website/llms consistency and comprehensive packed consumers. Final search pinpoints still-stale SVA-10-owned prose in `packages/access-router/llms.txt:305` and `website/docs/packages/access-router/services.mdx:59` describing the old accepted filter/ID controls; replace that prose with the verified README/C10 contract. The emitted container removal and strict staged-consumer evidence are ready to reuse.
- **SVA-11/coordinator:** independently review complete removal, private execution/count/target-plan use, updated historical oracles, all required Completion evidence and final serial integration gates. SVA-F01/F02/F03 remain deferred; no new input/subdocument policy or standalone row-authority API was introduced.
- Root `CHANGELOG.md` and tooling that updates it were never edited. Initial and final Git blob hash: **`c0561a1048c2341b14dd7f9d3e7c1fc055ae1880`**. All predecessor/untracked modules/tests and the unrelated `.github/actions/setup-tools/action.yml` work were preserved. No subagents, concurrent rebuilding scripts, staging, commits, resets or reversions occurred.

### Task SVA-10: Publish discoverable types, runnable documentation, and installed-consumer evidence

Status: completed

Owner: fresh isolated SVA-10 implementer. Repository/task conventions, applicable skills, C1–C10, frozen D00.1–D00.8 and all predecessor Completion evidence/handoffs reviewed. All required predecessors through SVA-09/01A complete. Publication/declaration/documentation work and verification owned by this session; build/typecheck/test commands ran serially.

Priority: P1

Suggested role: package API/documentation engineer.

Dependencies: SVA-09.

Primary ownership:

- `packages/access-router/src/index.ts`, `advanced.ts`, interface JSDoc.
- `packages/access-router/README.md`, `llms.txt`.
- `website/docs/packages/access-router/services.mdx`, `configuration.mdx`, `hooks.mdx`, `routing.mdx`, `openapi.mdx` where affected.
- `packages/access-router/test/export-contract.test.ts`, `documentation-examples.test.ts`, `strict-consumer-types.test.ts`, `packed-consumer-compatibility.test.ts`.
- Dependent packed boundary tests in access-router-deco/client/react/runtime only when existing imports or fixtures are affected.

Finding: B8; repository prose alone cannot teach installed consumers the internal-service authority API.

References: C1–C10; `package.json:23-82`, `src/index.ts:139-235`, `src/advanced.ts`.

Implementation requirements:

1. Export approved policy input types from canonical root and /advanced paths; resolved execution/prepared internals are not new public escape hatches.
2. Ensure emitted .d.ts/.d.mts JSDoc explains additive grant vs selected shape, row/output/target scope, unchanged write admission, subtree rules, default request mode, and the fixed breaking-release removal. Document immutable call policy versus per-document result reuse in helper overloads.
3. README examples demonstrate the central internalNote case, request-denied status, granted-but-unselected omission, row scope, target policy, virtual grants, metadata-disabled output, and helper pick reuse.
4. Provide real package-name imports and service acquisition (`router.getService(req)`/`req.macl.getService(...)`) instead of source deep imports or assumed standalone Service exports.
5. Keep backend authorization out of HTTP/OpenAPI/client request schemas; document that route entry and user metadata describe separate authority.
6. Update the migration table and helper examples. Clarify that grants do not authorize DB virtual filters/sorts, writes, or target operations implicitly; configured `overrideFilter` still applies in unrestricted row mode.
7. Verify packed export inventories and actual strict NodeNext/Bundler CJS/ESM consumers using existing fixture conventions, including known/unknown models, virtual and nested grant paths, readonly arrays, policy mode errors, and public-wire negative tests.
8. Avoid changing runtime output typing to promise persisted/virtual field existence just because it is granted; nullable/missing/error omission remains possible.

Publication findings (SVA-10, within the declaration/consumer acceptance criteria):

- `CreateAuthorization`/`OutputAuthorization` currently use only `Omit`/`Pick`, so a reusable `ServiceAuthorization` value with rows/related can type-check in a narrower method/helper while runtime applicability validation rejects it. The preceding declaration fixture even passes a row-bearing `policy` to named `genAllowedFields`. Likewise, a reusable request/unrestricted field or row variant can carry `paths`/`filter` despite runtime variant-key rejection. Add strict installed-consumer regressions and type-only exclusions for these inapplicable known keys; preserve the frozen capabilities, method positions and runtime validation. Update that erroneous fixture call to an output-only policy.
- The existing public type exports are present, but emitted consumer hover and installed runnable documentation need the complete selection/metadata/handle lifecycle contract. Live llms/services/hooks prose still describes accepted service overrides. The existing packed suite invokes its sentinel artifact assembly internally; inspect that path and retain its real publication/consumer checks with serialized prerequisites, without running release/changelog commands or full workspace gates.
- The installed README strict compile exposed a second real declaration mismatch: `ModelRouterOptions.alwaysSelectFields` accepts only `string[]`, although the planner, existing dotted setters and runtime accept a per-access record with `default` fallback. Extend that property to the already-supported `string[] | Record<string, string[]>` shape, document its private projected-input semantics, and verify constructor/setter use from installed declarations and the runnable ownerId example. No new fetch/authority behavior is introduced.

Acceptance criteria:

- README examples type-check and exercise the documented runtime behavior from installed-package imports.
- Editors see policy and helper-state JSDoc in emitted declarations; removed `overrides`, unsupported write/subdocument dimensions, invalid combinations/modes/paths, and raw-policy/document-state mixtures fail strict type tests.
- Public/root/client options reject internal authorization at the type level and runtime.
- Root, /advanced, and /processors exports and bundles remain resolvable; npm pack inventory and existing packed-consumer contracts pass.
- Package/website/llms/release descriptions agree on selection, additive grants, row scope, metadata, and override retirement.

Completion evidence:

- Changed paths (SVA-10 ownership; paths in the first three bullets are relative to `packages/access-router/`):
  - `src/index.ts`, `src/advanced.ts`, `src/interfaces/index.ts`, `src/interfaces/service-authorization.ts` — explicit type-only authorization export lists; complete editor JSDoc for additive/selected/subtree grants, request defaults, row/target independence, unchanged write/query admission, breaking removal, captured call policy and separate document-result lifetimes. Closed known wrong-variant `paths`/`filter` keys and inapplicable rows/related on reusable create/output policies using type-only exclusions. No issuer/execution/prepared entrypoint was added.
  - `src/interfaces/service-find.ts`, `service-create.ts`, `service-update.ts`, `service.ts`, `root.ts`, `router-hooks.ts`, `src/routers/model-router.ts`, `src/core.ts`, `src/services/base.ts` — per-call/helper/acquisition/metadata JSDoc that survives declaration emission; `alwaysSelectFields` now types the existing array/per-access-record runtime contract. Successful result generics were not strengthened by grants. **13 source/type files total.**
  - `test/service-authorization-consumer.types.fixture.ts` (new), `test/service-authorization.types.fixture.ts`, `test/strict-consumer-types.test.ts`, `test/export-contract.test.ts`, `test/documentation-examples.test.ts`, `test/packed-consumer-compatibility.test.ts` — new strict installed fixture (**58 expected-error sites**) and corrected preceding output-only call; existing boundary (**10**) and migration (**23**) fixtures also compile from package names. Checks cover known/unknown/any/indexed models, bounded virtual/dotted/readonly array paths, invalid modes/scopes, reusable wrong variants, method applicability, raw-policy/handle exclusivity, no grant-based requiredness, wire/default/removed controls, private export/deep-import absence and retained positional helpers. Export tests resolve real declaration aliases and inspect hover for all **18** approved authorization/new input/result/helper types plus acquisition/Core/Base methods in both declaration conditions. Documentation tests now include marked service website examples and execute the Mongo-backed README workflow. Packed tests consume those exact fixtures and the **installed README**, execute both emitted module forms and a real bundled Node consumer, preserve the three existing subpaths, and serialize/bound subprocess work.
  - `packages/access-router-client/test-packed-consumer/consumer/consumer-types.ts` — **9 new** strict negatives and a key-of absence assertion for client options/methods/exports (11 total expected-error sites including earlier cases). No backend policy was added to client or React transport.
  - `packages/access-router/README.md`, `packages/access-router/llms.txt`, `website/docs/packages/access-router/services.mdx`, `configuration.mdx`, `hooks.mdx`, `routing.mdx`, `openapi.mdx`, and this task record — installed entrypoint acquisition, full runnable service/handle/target example, consistent policy/metadata/wire guidance and removal migration. The README retains all nine before/after migration rows and full release notes; historical task records remain historical. **Total SVA-10 ownership: 28 files (13 source/type, 7 test/fixture including client, 8 documentation/task); one new consumer fixture.**

- Final verification from `<repo-root>`, except the explicitly noted pack working directory. `_tmp` existed and was confirmed ignored; every consumer/Mongo temporary fixture used `TMPDIR=<repo-root>/_tmp`. Actual commands used the checkout's absolute path. All package build/typecheck/test commands were serialized; `npm_config_workspace_concurrency=1` also serialized nested dependency/prerequisite builds:

  ```sh
  git check-ignore _tmp
  npm_config_workspace_concurrency=1 pnpm --filter @web-ts-toolkit/access-router typecheck
  # workdir: packages/access-router
  npm pack --dry-run
  # workdir: <repo-root>
  TMPDIR=<repo-root>/_tmp pnpm --filter @web-ts-toolkit/access-router exec vitest run --config vitest.config.ts test/export-contract.test.ts test/documentation-examples.test.ts test/strict-consumer-types.test.ts test/service-authorization-context.unit.test.ts test/service-authorization-boundary-admission.contract.test.ts test/service-authorization-public-boundaries.integration.test.ts test/service-authorization-migration.contract.test.ts test/service-authorization-direct.integration.test.ts test/service-authorization-related.integration.test.ts test/service-authorization-finalizer.unit.test.ts
  TMPDIR=<repo-root>/_tmp npm_config_workspace_concurrency=1 pnpm --filter @web-ts-toolkit/access-router exec vitest run --config vitest.config.ts test/packed-consumer-compatibility.test.ts
  pnpm --filter @web-ts-toolkit/access-router-client build
  TMPDIR=<repo-root>/_tmp pnpm --filter @web-ts-toolkit/access-router-client exec vitest run --config ../../vitest.config.ts test/access-router-client.packed-consumer.test.ts
  pnpm --filter @web-ts-toolkit/access-router-deco build
  pnpm --filter @web-ts-toolkit/access-router-deco typecheck
  TMPDIR=<repo-root>/_tmp pnpm --filter @web-ts-toolkit/access-router-deco exec vitest run --config vitest.config.ts --no-file-parallelism test/strict-consumer-types.test.ts test/packed-consumer-compatibility.test.ts
  pnpm exec eslint packages/access-router/src/index.ts packages/access-router/src/advanced.ts packages/access-router/src/interfaces/index.ts packages/access-router/src/interfaces/service-authorization.ts packages/access-router/src/interfaces/service-find.ts packages/access-router/src/interfaces/service-create.ts packages/access-router/src/interfaces/service-update.ts packages/access-router/src/interfaces/service.ts packages/access-router/src/interfaces/root.ts packages/access-router/src/interfaces/router-hooks.ts packages/access-router/src/routers/model-router.ts packages/access-router/src/core.ts packages/access-router/src/services/base.ts packages/access-router/test/export-contract.test.ts packages/access-router/test/documentation-examples.test.ts packages/access-router/test/strict-consumer-types.test.ts packages/access-router/test/packed-consumer-compatibility.test.ts packages/access-router/test/service-authorization-consumer.types.fixture.ts packages/access-router/test/service-authorization.types.fixture.ts packages/access-router-client/test-packed-consumer/consumer/consumer-types.ts
  git diff --check
  git hash-object CHANGELOG.md
  ```

- Results: required access-router typecheck and its transitive CJS/ESM/declaration build **passed**. Final declaration/docs/authority gate **10 files / 412 tests passed** (136.90 seconds), including **43 export-contract**, **41 documentation**, **13 strict-consumer**, **76 context**, **65 early admission**, **37 integrated public-boundary**, **52 migration**, **15 direct**, **26 related**, and **44 finalizer** cases. Separate packed gate **1 file / 7 tests passed** (103.73 seconds). These are **11 access-router files / 419 tests**, with all four required publication suites passing (**104 tests**). Dependent client packed gate **1 file / 5 tests passed**; decorator strict/packed gate **2 files / 7 tests passed**, with its build/source typecheck passing. **Final disjoint total: 14 files / 431 tests passed.** Focused ESLint and whitespace checks passed. Node `v26.10.0`, pnpm `11.18.0`, npm `11.19.1`; existing Vite native-config compatibility warning only in successful gates.

- Packed/metadata evidence: `package.json` and the single bundled `tsup` build agree on root, `/advanced`, `/processors`, CJS/ESM and separate import/require declaration conditions. `main`/`module`/`types`, all export targets, side-effect entries, Node >=22 and peer metadata were verified against emitted/installed files. `npm pack --dry-run` in `packages/access-router` reports **17 files**, **411.4 kB packed / 2.2 MB unpacked**, shasum **`2618017ea24c05d89c99b6f9da988aeb826870bb`**: README, llms, manifest, six JS entries and eight declarations, with no source/tests. Source placeholders are intentional inputs to the real publisher; the packed suite verifies transformed `0.99.0-test` metadata without placeholder/workspace ranges, flattened exports and byte-identical current JS/declaration graph/docs in both tarball and artifact layouts. The inspected sentinel artifact assembler copies/builds only generated artifact state; it invokes no changelog/release workflow.
- Installed matrix: both publication layouts × **Express 5.0.0/Mongoose 8.0.0** and **Express 5.2.1/Mongoose 9.8.0** pass native ESM/CJS calls, emitted NodeNext `.mts`/`.cts`, strict Bundler, private runtime/export-map rejection, and the installed README's Mongo assertions in ESM, CJS and an esbuild Node bundle (**12 authorization runtime workflows** across four installs). All **91** authorization/boundary/migration expected-error sites are checked in each of the three module-resolution forms. Current-major consumers use **`skipLibCheck: false`**; minimum peers retain the existing peer-internals exception. Client packed negatives also pass with full library checking. Decorator checks cover affected router/option imports through its existing installed boundary harness. No additional React/runtime fixture imports changed.
- Runnable oracle: selected schema-hidden `internalNote` survives literal-false and missing request rules; owner-denied status, unselected grants and absent stored values are omitted. Trusted row scope replaces request base scope; output-only policy still cannot access that row. Full document grants run once under skim/metadata-disabled/stripped output, and handle pick → trim retains status/note after both ownerId and metadata are gone. A raw-policy pick is fresh, retains only the explicit note grant and adds no hook call. Explicit target operation/row/output policy produces a separately handled customer; virtual and dotted embedded grants survive with private dependency/tenant/sibling omission. Unrestricted row mode still invokes the configured transform once. The unchanged runtime boundary/migration suites separately verify controlled injection/removal errors, request-only writes and metadata semantics.

Iteration/cleanup evidence:

1. The initial installed SVA-10 fixture failed in all three module forms with the same **nine unused expected-error directives**, proving the reusable wrong-variant/applicability mismatch. Type-only exclusions fixed all nine; the updated preceding fixture now passes an actual output-only policy. The new README initially failed strict compilation because per-access alwaysSelectFields was absent from declarations; the recorded type correction fixes both compile and actual projected-hook execution.
2. The first expanded packed run reached its first minimum-peer installed consumer and then hit the harness's **600-second timeout** in the added bundled Mongo workflow. Synchronous child commands blocked the parent event loop that drains MongoMemoryServer output. The new DB workflows now use awaited subprocesses with a **60-second bound**; existing synchronous setup commands have a **180-second bound**. A focused minimum-peer rerun passed in 25.76 seconds, followed by the full seven-test packed gate above. No runtime workaround or omitted peer/layout/bundle check was used.
3. Successful suites cleaned their own consumer/Mongo directories. The interrupted run's ten generated directories were individually identified by their new README/fixture content, tarball references and run timestamps, then removed; older unrelated `_tmp` contents were preserved. No leftover test/build/Mongo process from this session remained. Earlier development runs overlap final counts and are not additional passing-test totals.

Final review handoff:

1. **SVA-10 completed; SVA-11 is ready. Blockers: none.** The independent reviewer/coordinator owns the complete package/workspace integration gates and release decision. No full workspace gates were run here. Review the two recorded declaration corrections, emitted hover, private-export checks, installed README behavior and async packed fixture lifecycle against C1–C10/D00.
2. Root and `/advanced` expose only the agreed new input/helper/result/opaque-handle types; private issuers, execution/prepared APIs and standalone Service imports reject. Implementation-only types may appear inside the declaration dependency graph, but are not public exports or constructible capabilities. Emitted JSDoc now intentionally mentions removed `overrides`; SVA-09's earlier zero-text-match observation is historical. Strict property/key-of/export-map tests establish continued removal rather than a zero-word grep.
3. The full breaking migration guidance remains in README and this task; live website/llms searches now find only removal/migration or the retained configured hook, with no accepted service-override instructions. **SVA-F01/F02/F03 remain deferred**; no input/subdocument elevation or positional-helper retirement was introduced.
4. Root `CHANGELOG.md` was never edited. Initial and final Git blob hash: **`c0561a1048c2341b14dd7f9d3e7c1fc055ae1880`**. The unrelated `.github/actions/setup-tools/action.yml` change and all predecessor work were preserved. No subdelegation, parallel package builds, staging, commits, resets or reversions occurred.

### Task SVA-11: Independently review integration and record final verification

Status: completed

Owner: fresh independent final reviewer/implementer, separate from every predecessor session. AGENTS.md, task conventions, C1–C10, frozen D00.1–D00.8, all required acceptance criteria and predecessor Completion evidence reviewed. Dependencies are complete; required findings will be recorded and resolved in this session. Verification runs serially. Starting CHANGELOG blob hash matches `c0561a1048c2341b14dd7f9d3e7c1fc055ae1880`; the unrelated setup-tools action change and all predecessor work are preserved.

Priority: P1

Suggested role: reviewer independent of the main implementer.

Dependencies: SVA-00 through SVA-10 including SVA-01A, plus every required discovered follow-up. Deferred SVA-F01 through SVA-F03 are excluded.

Primary ownership:

- This task document's completion evidence and follow-up status.
- Cross-path semantic tests required to resolve review findings.
- Source/docs/types are read-only unless a concrete finding is recorded and assigned.

Finding: authority consistency is a cross-cutting guarantee; a unit evaluator test alone cannot prove services, prepared queries, children, wire boundaries, and installed types agree.

References: C1–C10, SVA-00 through SVA-10 including SVA-01A, all required regression suites listed in the verification strategy, and existing runtime/packed-consumer contracts.

Implementation requirements:

1. Verify every required acceptance criterion, including the central grant/pick chain, independent document-result reuse after trimming, and positive/negative row/target scope cases. Do not require deferred capabilities for release completion.
2. Inspect all alternate execution paths for unforwarded policy/defaults/early returns, especially create/populate, skim ordinary fields, no-virtual subdocuments, count/exists, root batches, and prepared correlated data.
3. Exercise same-request overlapping operations, same service reuse, different runtimes/model names, immutable option/config replacement, and limit-1 nested work to prove no authority bleed/deadlock.
4. Verify output/row/query/target-operation separation, unchanged write and dedicated subdocument admission, target model/path binding, selection/exclusion semantics, per-document grant/decision lifetimes, metadata independence, and original actor/hook arguments.
5. Inspect emitted declarations and packed CJS/ESM imports, removal/migration agreement, metadata, and evidence that public enforcement preceded runtime authority. Confirm no legacy override adapter or deferred feature entered the release accidentally.
6. Run serial integration gates: `pnpm --filter @web-ts-toolkit/access-router test`, `pnpm --filter @web-ts-toolkit/access-router typecheck`, then `pnpm build`, `pnpm test`, `pnpm lint`, and `git diff --check`. Reuse successful final gates unless subsequent changes/failures require another run.
7. Run npm pack inventory/consumer checks; use release artifact commands only when the maintainer selects the version/release lifecycle.
8. Record actual commands/results/changed paths and distinguish pre-existing failures/environment blockers from unresolved feature criteria. Add numbered follow-ups with ownership, priority, dependencies, and observable criteria immediately.

Acceptance criteria:

- All required feature tasks and review follow-ups have passing runtime/type/package evidence, not intent-only completion.
- An explicitly selected valid backend grant survives every effective-authority filtering stage without bypassing row/input/target policy or exposing internal-only fields.
- No source path reintroduces generic service overrides or accepts backend authority from public wire options.
- Required serial package/full workspace/packed checks pass, or the exact blocker remains tracked as blocked with maintainer disposition.
- Final review is attributable to a separate reviewer/session, and release/deferred decisions are explicit.

Review progress (before the required full integration gates):

- Independently inspected the catalog/planner/evaluator, call/document ownership and copy validation, direct/mutation/prepared/related/subdocument implementations, public/root/custom-validator admission, configured option resolver, legacy helper isolation, export/type surface, README and packed harness. The seven concrete findings below were recorded before their corrective implementation; none belongs to deferred SVA-F01/F02/F03.
- Red evidence: the first new Mongo-backed review suite reported **17 failed / 2 passed (19)** for F01–F03. After those fixes, the expanded suite reported **5 failed / 21 passed (26)** for F04/F05, then **4 failed / 26 passed (30)** for F06, then **2 failed / 30 passed (32)** for the actual unregistered-populate F07 entry paths. Assertions demonstrated skipped terminal hooks, widened regex rows/counts, lost document grants, mutable prepared state, leaked scalar/excluded values, truncated subtree grants and lost configured population respectively.
- Green focused evidence: package CJS/ESM/declaration build and direct source `tsc --noEmit -p tsconfig.typecheck.json` passed. Affected real-service/row/related/subdocument/admission/mutation/denial/count/model/data gate passed **15 files / 420 tests**. Shared planner/finalizer/context/prepared gate passed **5 files / 227 tests** at its earlier revision. Final test-only additions (RegExp getter isolation and both public upsert compatibility branches) passed **2 files / 78 tests**: **33** independent final-review cases plus **45** finalizer cases. These runs overlap and are not additive totals.
- Iteration corrections: generalized option-manager typing initially changed generic inference; the existing signature is now preserved and delegates to the shared resolver. The new source fixture initially populated only the middleware permission symbol; it now supplies the configured request permission map as well. Both corrections passed source checks and the final focused assertions. Focused ESLint passed before the final test/docs-only additions; root lint remains required below.
- Full package/typecheck/workspace/lint/publication gates are still pending at this point. Final statuses remain in_progress until the completion record below establishes those results. Existing packed sentinel artifact assembly was inspected: it writes generated artifact state and does not invoke changelog/release versioning workflows.

Completion evidence (2026-10-11, independent final-review session):

- **Changed: 15 files in this session**, preserving all predecessor changes:
  - `packages/access-router/src/options/manager.ts`
  - `packages/access-router/src/acl/model-output-planning.ts`
  - `packages/access-router/src/acl/filter-resolution.ts`
  - `packages/access-router/src/acl/output-field-filter.ts`
  - `packages/access-router/src/acl/service-authorization.ts`
  - `packages/access-router/src/acl/related-execution.ts`
  - `packages/access-router/src/core-shared.ts`
  - `packages/access-router/src/helpers/document.ts`
  - `packages/access-router/src/output/finalize-model-output.ts`
  - `packages/access-router/src/services/service.ts`
  - `packages/access-router/src/services/public-service.ts`
  - `packages/access-router/test/service-authorization-final-review.integration.test.ts` (new, **33 tests**)
  - `packages/access-router/test/service-authorization-finalizer.unit.test.ts` (**45 tests**, one new RegExp getter-isolation regression)
  - `packages/access-router/README.md`
  - `docs/tasks/20261007-143507-access-router-explicit-service-authorization.md`

- **Required gates actually executed**, from `<repo-root>` unless noted. Commands below preserve their actual environment spellings; runtime TMPDIR used the checkout's absolute `_tmp` path, verified to exist and be ignored. All top-level gate commands were awaited in sequence.

  ```sh
  git check-ignore _tmp
  TMPDIR=<repo-root>/_tmp npm_config_workspace_concurrency=1 pnpm --filter @web-ts-toolkit/access-router test
  npm_config_workspace_concurrency=1 pnpm --filter @web-ts-toolkit/access-router typecheck
  # Initial workspace build passed, but its log exposed ignored serialization config:
  npm_config_workspace_concurrency=1 pnpm build
  npm_config_workspace_concurrency=1 pnpm config get workspace-concurrency
  pnpm_config_workspace_concurrency=1 pnpm config get workspace-concurrency
  # Corrected, verified serial workspace build and full workspace test gate:
  pnpm_config_workspace_concurrency=1 pnpm build
  TMPDIR=<repo-root>/_tmp pnpm_config_workspace_concurrency=1 pnpm test
  pnpm lint
  git diff --check
  git diff --no-index --check -- /dev/null docs/tasks/20261007-143507-access-router-explicit-service-authorization.md
  # workdir: packages/access-router
  npm pack --dry-run
  # workdir: <repo-root>
  git hash-object CHANGELOG.md
  ```

- **Gate results:** access-router package **97 files / 1,979 tests passed** (497.18 seconds); required package source typecheck and its dependency CJS/ESM/declaration build passed. Corrected serial `pnpm build` passed across **31 non-root workspace projects**. Full serialized `pnpm test` passed across **25 projects with test scripts / 34 Vitest invocations**, totaling **506 passing file executions / 11,145 passing test executions**, plus **one pre-existing TODO and one conditional skip**; no failed test or unhandled-test-error summary. Counts include each configured peer/runtime lane, not distinct test-source identities. Its access-router lane independently repeated **97 files / 1,979 tests** (487.31 seconds). Root `pnpm lint` and `git diff --check` passed; the untracked task's no-index check emitted no whitespace diagnostics (its expected difference exit is 1). No source/type/test/README change followed these final gates; subsequent edits only complete this task record.

- **Serialization correction:** pnpm 11.18.0 returns `undefined` for `npm_config_workspace_concurrency=1 pnpm config get workspace-concurrency`, but `1` for the `pnpm_config_workspace_concurrency` spelling. Thus the first root build, although successful, used the root script's default parallel package scheduling. It is not claimed as serial evidence. The corrected root build was rerun successfully with verified effective configuration; root tests retained the root script's explicit `--workspace-concurrency=1` and inherited the effective setting for nested dependency builds. No separate top-level rebuilding commands overlapped. This execution correction did not modify project configuration or unrelated files.

Full workspace results (separate lanes summed within each row):

| Project                            | Passing file executions | Passing test executions | Other                                             |
| ---------------------------------- | ----------------------: | ----------------------: | ------------------------------------------------- |
| asset-inliner                      |                      38 |                     772 | 1 existing TODO                                   |
| create-access-router-mongo-starter |                      18 |                     339 |                                                   |
| express-oidc-vault                 |                      36 |                   1,982 |                                                   |
| express-request-attestation        |                      20 |                     467 | Five configured lanes                             |
| express-runtime                    |                      11 |                     341 |                                                   |
| json-frame                         |                       9 |                     531 |                                                   |
| mongoose-rxdb                      |                      45 |                     632 |                                                   |
| pdf-reader                         |                       6 |                     237 | Two configured lanes                              |
| utils                              |                      17 |                     120 |                                                   |
| express-oidc-vault-memory-store    |                       3 |                     129 |                                                   |
| express-oidc-vault-mongodb-store   |                       6 |                     147 |                                                   |
| express-oidc-vault-redis-store     |                      11 |                     342 |                                                   |
| http-errors                        |                       2 |                      72 |                                                   |
| moo                                |                      15 |                     153 |                                                   |
| oidc-vault-dpop-client             |                      10 |                      63 | 1 conditional skip                                |
| apps/oidc-vault-dpop-example       |                       9 |                      65 | Two configured lanes                              |
| express-response-handler           |                       8 |                     215 |                                                   |
| express-json-router                |                       2 |                      44 |                                                   |
| access-router                      |                      97 |                   1,979 | Includes all publication suites                   |
| message-service                    |                      23 |                     336 |                                                   |
| access-router-client               |                      45 |                     924 | Includes typechecks and packed consumers          |
| access-router-deco                 |                      18 |                     563 | Includes strict/packed consumers                  |
| access-router-runtime              |                      12 |                     135 | Includes CLI/packed contracts                     |
| access-router-react                |                      43 |                     554 | React 19, React 18, non-runtime publication lanes |
| apps/react-vite                    |                       2 |                       3 |                                                   |
| **Total**                          |                 **506** |              **11,145** | **1 TODO / 1 skip / 0 failures**                  |

- **Precisely classified non-failures:** asset-inliner's existing `test/legacy-contract.test.ts:453` TODO records the historical image-replacement contract. The DPoP client's skipped `it.runIf(!hasExamples)` at `test/oidc-vault-dpop-client.docs.compile.test.ts:121` is its obsolete skeleton-README branch; the actual README compile branch ran and passed. React 18's jsdom stderr is produced by existing deliberate cycle/depth `toThrow` regressions in `test/dependency-policy.test.tsx`, whose lane passed all 268 tests. Existing Vite native-config warnings, Angular example plugin diagnostics, starter-template peer/deprecation notices, npm's inherited config notice and the React demo chunk-size warning did not fail their commands. No environment/unrelated failure needed a source workaround or a waived gate.

- **Publication/installed evidence:** both final package invocations ran `test/export-contract.test.ts` (**43**), `test/documentation-examples.test.ts` (**41**), `test/strict-consumer-types.test.ts` (**13**) and `test/packed-consumer-compatibility.test.ts` (**7**): **4 files / 104 tests**, included in each package total. These suites were not replaced with source aliases or waived after review edits. The packed suite reassembled current sentinel `0.99.0-test` publication/artifact layouts and checked current JS/declaration/docs bytes, transformed manifests, all three entrypoints, native CJS/ESM, strict NodeNext `.mts`/`.cts` and Bundler consumers, minimum Express 5.0.0/Mongoose 8.0.0 and current Express 5.2.1/Mongoose 9.8.0 peers, and the installed README runtime workflows (including the bundled Node consumer). Its **91** authorization/boundary/migration expected-error sites run in each module-resolution form; current-peer consumers use full library checking. Dependent client/decorator/React/runtime packed/type lanes also passed in the workspace gate. The established sentinel assembler was inspected and only writes generated artifact state; no release-version/changelog workflow was run.
- **Pack inventory:** `npm pack --dry-run` reports **17 files**, **413.3 kB packed / 2.2 MB unpacked**, shasum **`580153287174738aa5ca5308433f7549d13cc5f4`**. Inventory contains README, llms, manifest, six JS entries and eight declaration files, with no source/test files. Source-manifest placeholders are intentional; the real publication transformer is separately verified by the passing packed suite. Root, `/advanced` and `/processors` mappings agree with bundled output and import/require declarations. The new capture/helper internals remain non-exported; no runtime issuer, constructor, private prepared flag or new package entrypoint exists.

Independent acceptance-criteria audit:

| Required task/contract              | Reviewed implementation and actual evidence                                                                                                                                                                                                                                                                                                                                                                                     |
| ----------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| SVA-00 / frozen D00, C1–C10         | All method/signature/access/selection/removal decisions remain coherent. Historical baseline assertions were deliberately migrated; their earlier evidence remains historical. Release version is administrative, not an unresolved API choice.                                                                                                                                                                                 |
| SVA-01 and SVA-01A / C1,C9          | Policy grammar/applicability, captured ownership, readonly paths, opaque authenticated handles and public/default/wire separation verified against context/type and early-admission suites. Task ordering/evidence establishes admission completion before SVA-02 runtime activation.                                                                                                                                           |
| SVA-02 / C2,C3                      | Actual schema/child/Map/ref/select:false catalogs, inclusion/exclusion/omitted/require-explicit behavior, false/missing request rules, grant-only eligibility, deferred functions, private dependencies and collision-free projections inspected. F05/F06 close non-object and opaque-root selection paths.                                                                                                                     |
| SVA-03 / C1,C4                      | One shared effective evaluator plus memoized request/effective decisions; metadata-disabled owner hook inputs, same-stage helper copies, per-row/call/access/runtime/model/snapshot rejection, Date/Buffer/BSON/RegExp isolation and virtual failure/undefined omission pass. F04 fixes native diagnostic/getter aliasing. No metadata-based authority reconstruction or raw restoration.                                       |
| SVA-04 / C5,C8                      | Configured transforms run once in every row mode; early false precedes applicable ID/parsing/child work; later transform denial preserves necessary earlier parsing. F01 covers default/bare hooks; F02 prevents native predicate loss. Prepared tokens remain receiver/call/access authenticated; all count scopes, grouped casting and inert correlated substitution/budgets pass.                                            |
| SVA-05 / C6,C8                      | Direct reads, both by-ID methods, create/update/upsert/new, branch-specific accesses, guaranteed result contexts, ignored new selection, metadata independence and private snapshot-before-output ordering pass. Input admission stays request-only; validation/prepare/transform/afterPersist/changes/save and virtual write exclusion remain active.                                                                          |
| SVA-06 / C7                         | Exact related path/model/count applicability, operation/row/output independence, ref/join/match constraints, nested legacy/correlated read/list/count, hidden FK pairing, per-target handles and post-mutation populate pass. F03 preserves dual-purpose hook/join inputs. F07 preserves the existing explicit unregistered-target opt-out through captured requested paths without accepting related policy for those targets. |
| SVA-07 / C7                         | Embedded grants with/without virtuals, leaf/minimal shape and sibling isolation, request-only dedicated subdocument gates, post-save denied visibility returning successful null/empty output, nested writes and subpopulate remain verified. Exception fallbacks do not return raw output or rerun hidden-row getters.                                                                                                         |
| SVA-08 / C9                         | Actual backend positive controls and direct/root/public/nested/populate/subquery/custom-transform negative admission pass before persistence; request-only wrappers do not inherit prior grants/default authority. Contexts/plans/tokens remain outside data and user metadata remains request-derived.                                                                                                                         |
| SVA-09 / C10                        | Source inspection/search finds only legacy-slot rejection/migration documentation or unrelated “overrides” terminology, with no accepted service container/transport. Runtime JS presence errors and strict removed-property tests pass for all six controls and mixed values. The configured overrideFilter setter works; canonical output does not use positional helper authority.                                           |
| SVA-10 / publication                | Emitted API/JSDoc, typed/unknown/virtual/nested paths, strict applicability, README/website/llms migration guidance, installed examples and all required consumer/module forms agree. Output grants imply neither field existence nor write/query/target authority.                                                                                                                                                             |
| SVA-11 / bounds and complete review | Inspected snapshot structural caps, request/correlated budgets, list/bulk bounds, descriptor depth and shared leaf/hook gates. Same-request overlap/config replacement, receiver/snapshot misuse and limit-one nested execution have real regressions and passed in the full suite. All seven recorded findings are fixed, not waived.                                                                                          |

- **Task-record/dependency review:** 13 original required tasks plus seven SVA-11 findings are completed with evidence (**20 required tasks**). Dependencies are acyclic: SVA-01A precedes activation, SVA-08 follows integration, SVA-09/10 follow removal/publication, and SVA-11 depends on its seven fixes, which depend only on completed predecessors. Deferred SVA-F01/F02/F03 depend on SVA-11 and explicit activation, not the reverse. Their statuses/rationales remain unchanged: no write elevation, no new dedicated subdocument row/operation authority, and positional helper retirement remains separate. Standalone row-only/data-service/query-field API expansion also remains outside scope.
- **Final record check:** `rg --count-matches` reports **23 task headers, 20 completed statuses, 3 deferred statuses and 20 Completion evidence sections**. Final header/status/dependency inspection agrees with the acyclic graph above; repository-relative path checks found no machine-specific paths in this task record.
- **Preservation/cleanup:** `git diff` confirms the unrelated `.github/actions/setup-tools/action.yml` remains the same four added lines present at session start. No staging, commits, resets, subdelegation or unrelated reverts occurred. Successful consumer suites clean their managed fixtures; an inspected surviving `_tmp/access-router-arf09-*` tree contains pre-SVA-05 README content and was preserved as prior work, along with existing caches. Process inspection found no remaining test/build/Mongo process from this session. Root `CHANGELOG.md` was never edited, and repeated final `git hash-object CHANGELOG.md` equals **`c0561a1048c2341b14dd7f9d3e7c1fc055ae1880`**.
- **Disposition:** SVA-11 and the entire required task file are completed. No residual required feature defect, verification blocker or maintainer decision remains. The three explicitly deferred follow-ups remain deferred; release version/date/publishing are still separate administration.

### Task SVA-11-F01: Preserve captured hook resolver fallback semantics

Status: completed

Priority: P0

Owner: SVA-11 independent reviewer/implementer (same isolated final-review session).

Dependencies: SVA-09, SVA-10. Required for SVA-11 completion.

Primary ownership:

- `packages/access-router/src/acl/filter-resolution.ts`, `output-field-filter.ts` and the shared option-resolution seam if needed.
- Focused independent final-review regression tests.

Finding: `resolveAuthorizedAccessFilter` selects only `configuration[kind][access]`, silently skipping supported bare and `.default` configured `baseFilter`/`overrideFilter` functions. `resolveOutputDocumentAuthorization` handles bare document hooks but omits `.default`. The established `getNestedOption` resolver in `src/options/manager.ts` uses exact access → `.default` → bare fallback. Canonical captured execution therefore changes ordinary request semantics and can remove a configured row restriction; existing authorization suites mostly configure exact-access records.

Acceptance criteria:

- Real service queries preserve bare/default row restrictions and terminal transform denial in request/scope/unrestricted modes; transforms run once and request base scopes alone are replaceable.
- Default document hooks authorize ordinary selected fields once, including after private hook inputs/metadata are trimmed and a handle-aware pick runs.
- Exact defined entries (including null/false), undefined fallback and captured configuration replacement agree with the existing resolver.
- Focused regressions fail on the reviewed implementation, pass after the correction, and affected package/type/packed/workspace gates pass.

Completion evidence:

- Shared `resolveNestedOption` now serves live options and captured authorization without changing the existing generic API. `getCapturedAuthorizationOption` is used by row and document-hook execution, retaining exact/default/bare semantics and defined null/false behavior.
- The first review run reproduced **13 failing hook cases**; fallback, denial, stage-handle, exact-entry and overlapping configuration-replacement cases now pass. All final SVA-11 package/type/packed/workspace/lint gates above passed after this fix.

### Task SVA-11-F02: Keep distinct native predicates in mandatory row intersections

Status: completed

Priority: P0

Owner: SVA-11 independent reviewer/implementer.

Dependencies: SVA-04, SVA-06, SVA-09. Required for SVA-11 completion.

Primary ownership:

- `packages/access-router/src/core-shared.ts` predicate intersection and focused real-query regressions.

Finding: `optimizeAndFilter` deduplicates clauses using a custom JSON key. Native RegExp values serialize as `{}`, so distinct same-field regex query/scope/join clauses have identical keys and one required constraint is discarded. The new explicit scope and mandatory related predicates rely on this shared intersection. Predicate equality must preserve supported native values rather than using lossy JSON serialization.

Acceptance criteria:

- A broad caller regex AND a narrower trusted scope returns/counts only scoped rows; distinct source/flags remain distinct constraints.
- Related descriptor/correlation predicates survive a rewriting transform and independent scope, including native values, and cannot attach unrelated rows.
- Equivalent clauses can still compact without mutation; conflicting BSON/native values are not conflated or rejected merely by JSON conversion.
- Red/green regression evidence plus affected row/count/related and required integration checks pass.

Completion evidence:

- `core-shared.ts` uses typed lossless keys for ordinary/Date/RegExp predicates; exotic/BSON clauses are retained rather than JSON-conflated, with native equality for safe merging. No new quadratic all-clause comparison or predicate mutation was added.
- **Three initial failing real-query cases** proved regex-source/flags loss and widened related list/count results; they now pass, along with an ObjectId-versus-string Mixed predicate case and all existing grouped/native-casting tests. Final SVA-11 gates passed.

### Task SVA-11-F03: Retain declared document-hook inputs that also serve as include join keys

Status: completed

Priority: P0

Owner: SVA-11 independent reviewer/implementer.

Dependencies: SVA-05, SVA-06, SVA-08. Required for SVA-11 completion.

Primary ownership:

- `packages/access-router/src/services/service.ts` private association cleanup and focused include/document-handle regressions.

Finding: list-include target cleanup treats an unselected/non-virtual-dependency foreign field as association-only even when `alwaysSelectFields` explicitly declares that same path for the document-permissions hook. It deletes the value before resolving the hook, so a valid ordinary document grant is lost. Join-only inputs should remain hidden from hooks/getters, while independently declared policy/dependency inputs must retain their documented lifetime and still be excluded from output.

Acceptance criteria:

- A legacy list include joining on a private owner input returns both its document-authorized selected field and explicit backend grant with metadata disabled, then preserves both through a target-handle pick.
- The owning hook observes its declared input exactly once; returned data excludes that input and denied siblings.
- Join-only fields remain hidden from target getters; nested include association regressions remain passing.
- Focused red/green tests and affected package/type/packed/workspace checks pass.

Completion evidence:

- `Service.findPrepared` now distinguishes association-only fields from overlapping captured output/doc-hook always-select inputs and virtual dependencies before cleanup.
- The failing include-owner regression now returns both document-authorized status and backend note, hides the owner/FK/sibling/metadata and reuses its target handle with **one hook call**. Existing nested-include and join-only getter isolation tests passed in the 420-test affected gate and both full package invocations.

### Task SVA-11-F04: Detach mutable RegExp leaves from prepared-query diagnostic copies

Status: completed

Priority: P0

Owner: SVA-11 independent reviewer/implementer.

Dependencies: SVA-04, SVA-09. Required for SVA-11 completion.

Primary ownership:

- `packages/access-router/src/helpers/document.ts` native isolation and focused prepared-query tests.

Finding: private prepared records correctly snapshot RegExp values, but `readPreparedModelQuery` returns them through `deepIsolateValue`, which passes RegExp instances through by reference. A diagnostic filter or hook context can therefore mutate a private prepared predicate via `RegExp.compile`, changing a later same-execution count. The same isolation helper supplies virtual getter copies. Mutable native predicates require independent leaves on every copy, as Date/Buffer/BSON already receive.

Acceptance criteria:

- Mutating a returned prepared diagnostic regex cannot change the token's later query/count or mandatory scope.
- RegExp source/flags/lastIndex are retained while identities are detached; virtual/caller copies cannot change another stage's native value.
- Focused red/green regressions and prepared/isolation/required integration gates pass.

Completion evidence:

- Native output/query isolation now clones RegExp source, flags and lastIndex. A prepared diagnostic's `compile()` mutation no longer widens its later count (**reviewed result 3, required/fixed result 2**).
- The added real finalizer regression mutates one getter's regex view while another getter, original input and associated output retain the original regex/lastIndex; later handle picks do not rerun getters. The finalizer suite now has **45 passing cases**. Final SVA-11 gates passed.

### Task SVA-11-F05: Do not authorize scalar container values through descendant-only grants

Status: completed

Priority: P0

Owner: SVA-11 independent reviewer/implementer.

Dependencies: SVA-02, SVA-03, SVA-07. Required for SVA-11 completion.

Primary ownership:

- `packages/access-router/src/output/finalize-model-output.ts`, `src/acl/output-field-filter.ts` and focused Mixed/embedded shape tests.

Finding: a child plan is sufficient to retain its ancestor container, but both finalizer and named pick copy a non-object child value unchanged. A selected/granted safe descendant of a declared Mixed root can thus expose an existing scalar root when that root was fetched privately (or passed directly to a helper), although the root value was never granted. Minimal ancestor retention must not become authority for an unrelated scalar value.

Acceptance criteria:

- A descendant-only grant plus private root fetch cannot return an unauthorized string/number/boolean ancestor value through finalization or named pick.
- Valid object/array descendant output and null/missing shape remain consistent; invalid array elements retain safe positional shape without exposing their scalar value.
- Explicit root grants continue to authorize scalar opaque roots; narrow selections still constrain their output shape.
- Concrete red/green regressions and embedded/helper/direct/required integration gates pass.

Completion evidence:

- Canonical child finalization and named filtering omit non-object scalar ancestors from descendant-only output and retain safe null array positions, including nested arrays. Existing null containers remain null; explicit selected opaque root grants still authorize scalar values.
- **Four red cases** (string/number/boolean private ancestor fetches plus mixed array positions) now pass through real reads and named helpers. Existing embedded/minimal-path/virtual/subdocument suites and final SVA-11 gates passed.

### Task SVA-11-F06: Preserve opaque subtree grants while honoring descendant exclusions

Status: completed

Priority: P0

Owner: SVA-11 independent reviewer/implementer.

Dependencies: SVA-02, SVA-03. Required for SVA-11 completion.

Primary ownership:

- `packages/access-router/src/acl/output-field-filter.ts`, `src/output/finalize-model-output.ts` and focused opaque selection tests.

Finding: copying an authorized Mixed/Map root does not apply descendant exclusion tokens, so `select: ['marker', '-marker.secret']` can return `secret`. Conversely, when permission rules also name a safe dynamic descendant, the retained child plan can reduce an explicitly granted opaque root to only enumerated descendants, losing other granted subtree values. Ordinary selected shape and explicit root-subtree authority must both apply without enumerating undeclared top-level fields or treating a descendant grant as root authority.

Acceptance criteria:

- Explicit/omitted-selection opaque root grants retain existing safe subtree values even when a child request rule denies a named descendant.
- Descendant exclusions (including nested exclusions and array elements) are respected under grant/unrestricted output, while descendant-only inclusion remains narrow.
- Named picks preserve already-finalized values without restoring excluded keys or rerunning hooks; request-only child rules remain restrictive.
- Concrete red/green tests and projection/finalizer/required integration gates pass.

Completion evidence:

- Safe value copying applies captured descendant exclusions through objects/arrays. A shared selected-value-root grant check preserves explicit whole opaque subtrees when a minimal child plan also exists; descendant-only selection never qualifies. Request-only behavior remains on its field evaluator, and package helper copies retain existing child associations.
- **Four red grant/unrestricted cases** now preserve the granted subtree and remove excluded nested/array keys; later handle picks restore nothing and request-only negative controls remain restrictive. README documents these existing C2 semantics. Final SVA-11 gates passed.

### Task SVA-11-F07: Preserve the existing explicit unregistered-populate opt-out

Status: completed

Priority: P1

Owner: SVA-11 independent reviewer/implementer.

Dependencies: SVA-06, SVA-09, SVA-10. Required for SVA-11 completion.

Primary ownership:

- Captured related descriptors, canonical reference copying, public prepared-entry capture and actual populate compatibility tests under `packages/access-router/`.

Finding: `genExecutionPopulate` retains the established `requireRegisteredPopulateModels: false` raw-target opt-out, but the new final reference copier collapses every unassociated target to its ID. The existing test named “can return raw populate targets” only inspects `Core.genPopulate` descriptors, so it misses this integrated regression. Preserve the explicit configured opt-out at its requested/captured path; it must not become a parent field grant, a policy for unregistered models, or a raw-policy helper bypass.

Acceptance criteria:

- Actual internal/public reads return the requested projection of an unregistered target only with the existing opt-out enabled; the default keeps its scalar ID.
- Registered targets continue through their independent policy/finalizer; supplied related policy for an unregistered target rejects before persistence.
- Plain unassociated DTOs and raw-policy picks cannot acquire raw target authority; any compatibility provenance is private and path/call-bound.
- Real-output red/green regressions and existing populate/public/packed/integration checks pass.

Completion evidence:

- Requested opt-out paths are captured privately as passthrough descriptors. They cannot receive a caller related policy; only that captured path permits the existing raw projected target copy. Public prepared read/upsert entrypoints capture effective related descriptors too. Raw-policy helpers have no such descriptor authority; registered targets retain their normal authenticated finalization.
- **Two red internal/public actual-output cases** now pass, plus a new both-upsert-branches case preserving request-only writes. Default scalar-ID behavior, projected private-field omission, forged raw-helper input and before-persistence rejection of unregistered related policy all pass. README clarifies the compatibility boundary. Final SVA-11 gates passed.

## Previously deferred follow-up tasks

These tasks record work deliberately removed from the original first-release scope after review. The maintainer supplied the separate implementation request on 2026-10-12. All three features and their independent final integration are now completed in `docs/tasks/20261012-090227-access-router-authorization-follow-ups.md`, including subdocument write elevation and next-breaking-release helper removal. The original deferral rationales and earlier handoff states below are retained as history; the new execution record defines the delivered contracts, ownership, verification, and independent review.

Final follow-up integration (2026-10-12): SVA-F04 independently audited runtime/types/
docs/tests and corrected composite input bounds, untouched stored-virtual sibling
deletion, a shifted private-boundary test call, and two lint-only formatting issues.
All four findings are completed. Full workspace build/test/lint, final package typecheck,
dry-run packaging and sentinel artifact verification pass: **11,349 passing workspace
test executions**, including **101 access-router files / 2,183 tests** and all **8
packed/artifact cases** (including the three previously reserved artifact-tree cases).
CHANGELOG retains blob `c0561a1048c2341b14dd7f9d3e7c1fc055ae1880`. See **F04 final
integration and completion evidence** in the linked execution record for exact commands,
test accounting, the two unrelated historical TODO/conditional entries and final status.

Coordinator follow-up review (2026-10-12 16:12:46 PDT): all three implementations,
four independent-review fixes, task statuses, installed-consumer evidence and final
workspace checks are complete. The final diff/CHANGELOG/release-metadata checks pass;
see **Coordinator final review** in the linked execution record.

### Task SVA-F01: Design explicit write-field elevation as an independent capability

Status: completed

Activation: 2026-10-12; implementation task SVA-F01 in `docs/tasks/20261012-090227-access-router-authorization-follow-ups.md`.

Completion evidence: see **F01 completion evidence — 2026-10-12** and **F01 handoff
to F02 and F03** in that execution record. Delivered mutation-only
`authorization.inputFields` request/grant/unrestricted, persisted path types/runtime
admission, separate pre-write grants, safe nested/array/JS-container semantics,
public-boundary coverage and installed documentation/types. Dependency build,
package typecheck and **18 files / 569 focused tests** passed. The interrupted work
was preserved and its remaining findings fixed in the resumed dedicated session.
CHANGELOG retains blob `c0561a1048c2341b14dd7f9d3e7c1fc055ae1880`.

Priority: P2

Suggested role: API/persistence designer.

Dependencies: SVA-11 and explicit follow-up activation.

Primary ownership:

- Future input-policy interfaces; `services/service.ts` mutation admission; `helpers/apply-update.ts`; mutation tests.

Finding: The initial plan introduced `inputFields` although existing overrides do not grant input fields. This is a separate capability with validation, whole-container, array, and persistence semantics.

References: C6; existing mutation field admission in `service.ts:1748-1756,2085-2092` and nested-update regressions.

Implementation requirements when activated:

1. Specify request/grant/unrestricted write authority independently of row/output/target authority and scope its allowed persisted paths.
2. Define leaf versus container replacement and virtual-key handling before implementing write elevation.
3. Keep validation/preparation/save hooks and output-only virtual behavior, with no implied response grant.

Acceptance criteria:

- A dedicated design/release record defines the new capability; granting output alone still cannot write a protected field.
- Meaningful Mongo-backed create/update/upsert tests cover admitted persisted writes, denied siblings, nested integrity, virtual exclusion, and hook invocation; package typecheck and relevant tests pass.

Deferral rationale: trusted backend output/row access is fully replaceable without a new input-grant API. Residual limitation: explicit write elevation remains unavailable through the new authorization options.

### Task SVA-F02: Design dedicated subdocument parent/child authorization APIs

Status: completed

Execution: fresh dedicated F02 implementation session; contract and evidence are
recorded under SVA-F02 in the activated execution record. F01 is complete;
write elevation and independent post-write visibility are required.

Completion evidence: see **F02 completion evidence — 2026-10-12** and **F02 handoff
to F03 — caller inventory and private replacements** in
`docs/tasks/20261012-090227-access-router-authorization-follow-ups.md`. Delivered
method-specific internal `{ parent, child, visibility }` policy on dedicated
list/read/create/update/bulk-update/delete, scoped child input/output, independently
gated post-write read/create-list visibility, captured raw-parent grants, immutable
identifier/selection constraints, public option splitting/dispatch enforcement and
installed docs/types. Build, package typecheck, targeted lint and **23 files / 749
unique tests** passed, including **59 new Mongo policy tests** with stored-state
assertions. All discovered F02 regressions are fixed. F01 is preserved; F03/F04
remain pending in the execution record. CHANGELOG retains blob
`c0561a1048c2341b14dd7f9d3e7c1fc055ae1880`.

Activation: 2026-10-12; implementation task SVA-F02 in `docs/tasks/20261012-090227-access-router-authorization-follow-ups.md`. Write elevation is included, so SVA-F01 is a prerequisite.

Priority: P2

Suggested role: embedded/subdocument API designer.

Dependencies: SVA-11; SVA-F01 only if write elevation is included; explicit follow-up activation.

Primary ownership:

- Future dedicated subdocument option types; `services/model-subdocument-service.ts`; subdocument row/operation/visibility tests.

Finding: A new `subdocuments` policy tree and parent-versus-child row/operation grants go beyond removing the existing service override container. They require an explicit post-write visibility and scope composition contract.

References: C7; `model-subdocument-service.ts:178-288,311-539`; existing subdocument mutation-visibility tests.

Implementation requirements when activated:

1. Define exact parent/child operation, row, output, and optional write policy surfaces without implicit cross-scope elevation.
2. Specify array-row selection, owning-parent lookup, grants derived from raw parent state, and read-side visibility following a successful write.
3. Preserve successful null/empty hidden mutation outputs and related-target isolation.

Acceptance criteria:

- A separate contract distinguishes embedded output field grants already delivered by SVA-07 from new dedicated-method elevation.
- Tests cover parent-denied/child-granted and parent-granted/child-denied cases, post-persist visibility, array/cardinality semantics, and cross-target isolation; package/subdocument checks pass.

Deferral rationale: ordinary embedded output grants ship now, while dedicated subdocument methods retain their existing request-only APIs. Residual limitation: their row/operation gates cannot be overridden through a new scoped policy in this release.

### Task SVA-F03: Retire legacy positional helper overloads after consumer characterization

Status: completed

Execution: fresh dedicated F03 implementation session, no subdelegation. F01 and
F02 are complete. Current caller inventory, exact removal/default/data contract,
and verification evidence are maintained under SVA-F03 in
`docs/tasks/20261012-090227-access-router-authorization-follow-ups.md`.
The activated phase supersedes the historical retained-helper scope below.

Completion evidence: see **F03 completion evidence — 2026-10-12**, its exact
verification ledger and **F03 independent-review handoff** in
`docs/tasks/20261012-090227-access-router-authorization-follow-ups.md`. Removed all
positional skipChecks/subPaths/arbitrary baseFields helper overloads across model
Core/Base and DataCore/DataService, including alias/wrapper count enforcement and
undefined-plus-extra TS/JS rejection. Model defaults now use canonical named output;
data/populate have typed named request-only scopes. Request input, metadata and
distinct use private collectors; target/source gates and F01/F02 behavior remain.
Shipped docs, emitted root/advanced declarations and actual installed CJS/ESM,
Node16/NodeNext/Bundler consumers agree. Broad verification additionally restored
Mixed virtual-name input alias exclusion with stored-state regressions and migrated
an obsolete F02 public-boundary fixture without weakening its assertions.

Dependency build, package typecheck, targeted lint and **102 files / 2,192 unique
tests** passed: **100 access-router files / 2,162 tests**, **5 actual packed-tarball
compatibility cases**, and **25 decorator consumer tests**. Three artifact-only cases
and full workspace gates remain with pending F04's fresh independent reviewer.
No F03 blocker, adapter, new entrypoint or transport capability remains. CHANGELOG
retains blob `c0561a1048c2341b14dd7f9d3e7c1fc055ae1880`.

Activation: 2026-10-12; implementation task SVA-F03 in `docs/tasks/20261012-090227-access-router-authorization-follow-ups.md`. Removal and migration are targeted together at the next breaking release.

Priority: P2

Suggested role: helper API/compatibility engineer.

Dependencies: SVA-11 and explicit follow-up activation.

Primary ownership:

- `Core`/`Base` genSelect/genAllowedFields/pickAllowedFields overloads, shared select helpers, and relevant installed-consumer fixtures.

Finding: Removing positional `skipChecks` and arbitrary `baseFields` helpers is a distinct public helper migration. Canonical service execution already uses named policy options and private system retention after this plan.

References: C3/C10; `core.ts:237-315`, `services/base.ts:661-733`, `core-data.ts:82-141`.

Implementation requirements when activated:

1. Inventory actual model/data helper callers and record compatibility/deprecation/removal timing for those signatures separately from removed service overrides.
2. Express provisional fetch behavior and backend output grants through the named overloads; keep identity/metadata retention private to execution.
3. Handle DataCore/DataService compatibility explicitly rather than accidentally applying model-specific output rules.

Acceptance criteria:

- Consumer fixtures demonstrate every supported migration and controlled removed-overload behavior.
- Canonical grant/planning/filtering behavior remains unchanged, and package/data/packed-consumer verification passes.

Deferral rationale: helper overload retirement is not required to remove service `overrides`. Residual limitation: trusted backend consumers may still call the isolated legacy helper overloads until their separately scheduled migration.

## Execution and reviewer allocation guidance

Execution is authorized for the 13 required tasks only. Use a fresh sub-agent for each task and run them sequentially in the dependency order above. SVA-F01 through SVA-F03 remain deferred. SVA-11 is an independent reviewer, followed by a coordinator check of the entire task record and the unchanged `CHANGELOG.md` hash.

| Role                         | Primary tasks          | Coordination                                                                 |
| ---------------------------- | ---------------------- | ---------------------------------------------------------------------------- |
| Coordinator/API designer     | SVA-00, SVA-01         | Record exact signatures and separate call/document state before runtime work |
| Boundary engineer            | SVA-01A, SVA-08        | Enforce allowlists first; verify with real grants after integration          |
| Shared ACL engineer          | SVA-02, SVA-03, SVA-04 | Start after SVA-01A; sequence core/base/planner ownership                    |
| Service integration engineer | SVA-05, SVA-06         | Wire resolved policy/document state and migrate private prepared queries     |
| Embedded engineer            | SVA-07                 | Cover inherited output grants and dedicated subdocument request-mode parity  |
| Migration engineer           | SVA-09                 | Remove every service override property/transport for the breaking release    |
| Package/docs engineer        | SVA-10                 | Document canonical APIs and migration after runtime/types stabilize          |
| Independent reviewer         | SVA-11                 | Review required behavior/evidence; deferred follow-ups do not gate release   |

Status maintenance:

- Set a task to in_progress only when dependencies are met and work starts.
- Mark completed only after its required verification passes and append completion evidence.
- If blocked, name the exact blocker and owner. Do not keep a completed status with unverified acceptance criteria.
- Use unique follow-up IDs such as SVA-06-F01; attach priority/ownership/dependencies/criteria before beginning them.
- Existing related task records remain historical. This plan intentionally supersedes their service-override/unchanged-genSelect constraints for the approved canonical API, while retaining their virtual isolation, association, terminal denial, and route-variant invariants.

Related records:

- `docs/tasks/20261005-122217-access-router-package-virtuals.md`.
- `docs/tasks/20261005-131819-access-router-operation-access-variants.md`.
- `docs/tasks/20260912-181841-access-router-correlated-includes.md`.
- `docs/tasks/20260919-184406-access-router-residual-contracts.md`.
- `docs/acl-architecture-review.md`.

## Settled decisions and recorded implementation details

Settled for this revision:

1. **Removal:** one breaking release delivers the replacement and removes the complete service container, with no transitional override adapter.
2. **Ordering:** SVA-01A public-input enforcement must pass before any runtime entrypoint honors supplied backend authority. SVA-08 is later integrated verification.
3. **Scope:** output fields, row policy, related targets, embedded output, and private internal transports ship first. Write-field elevation, new dedicated subdocument scopes, and positional helper retirement are deferred.
4. **Row transformation:** configured `overrideFilter` runs once in request/scope/unrestricted mode; the mode replaces or bypasses only the base-row scope. Mandatory relationship constraints remain separately enforced.
5. **Document results:** call policy is immutable and reusable within an operation; document-hook grants/field decisions are separately bound to each document/scope/access stage and reused by later same-execution picks.
6. **Metadata:** internal output authorization is independent from serialized permission switches, including ordinary persisted document grants. Release notes explicitly describe any changed skim output.
7. **Existing boundaries:** write admission and dedicated subdocument row/operation/post-write visibility remain request-scoped. `new` retains its historically ignored selection behavior for this release.

Implementation details recorded in SVA-00's D00.1–D00.8 and verified by the subsequent task evidence:

- Exact exported policy/helper overload names and the internal context/callback used to expose an opaque document-result handle to backend callers.
- How snapshots/explicit output copies are associated with document results, and how a changed access/stage invalidates them without merging grants from other rows or calls.
- Catalog edge cases (Mixed/Map roots, dynamic refs, unknown paths, and Mongoose schema-hidden fields) and supported projection behavior under the C2 grant/selection contract. Add characterization and explicit acceptance cases; record any conflict rather than guessing.
- Precise private prepared-query/count/exists entrypoints needed by integrated callers, retaining existing standalone row-only and dedicated subdocument APIs.

The exact release version/date remains a release-administration choice. It does not block the implementation plan or permit a compatibility adapter.

Other excluded extensions:

- DataService authorization parity: maintain present data APIs/tests now; add a separately scoped plan if requested.
- Query-field/sort/distinct capability: output grants do not broaden it in this phase. Define a distinct capability if backend callers later require it.
- Broader standalone row-only service API options, system-wide/default elevation, external policy engines, cross-call authority tokens, policy auditing infrastructure, raw adapter access, or recursive populate API.

## Definition of done

- One designated breaking release replaces and removes service `overrides`, with ordinary query arguments, explicit scoped backend authority, and private execution transport.
- Canonical `genSelect`/planner, `finalizeModelOutput`, and policy-aware allowed-field helpers agree on the effective policy and preserve grant/deferred/deny semantics. Positional legacy helper overloads are isolated and not part of canonical execution.
- The selected internalNote grant survives user denial; unselected grants and unrelated siblings remain outside output.
- Same-execution filtering reuses per-document grant/field-decision results after output has removed hook inputs or metadata, without recomputing permissions from a trimmed DTO or mixing rows.
- Output/row/related-operation/query authority is separate; existing write admission and dedicated subdocument gates are preserved.
- Integrated direct/related/embedded output grants work with and without virtuals and independently of metadata serialization; dedicated subdocument request-mode paths retain parity.
- Internal prepared queries replace filter overrides without duplicate transforms, parsing, policy evaluation, or correlated marker execution.
- Public-input rejection/allowlisting was in place before runtime authority was enabled and passes integrated verification; original request identity is preserved; calls/runtimes do not share temporary grants.
- Shipped declarations, README, website, breaking-release migration notes, and packed consumer behavior agree on complete service-container removal and the retained configured filter hook.
- Required focused/package/full workspace/packed verification and independent review are recorded, with blockers/deferred work explicit.
- SVA-F01 through SVA-F03 remain separate follow-ups rather than hidden release prerequisites or partially implemented policy dimensions.

## Plan preparation and revision evidence

Initial preparation (2026-10-07 14:35:07 PDT):

- Reviewed task conventions, relevant source/types/tests/metadata, current worktree, and the historical finalizer/override diff at `9ba3712`.
- Created this plan with 12 uniquely numbered tasks across 7 waves; all implementation statuses remain pending.
- Runtime/source/test/package files have not been edited while preparing this task document.
- Verified referenced baseline regression-test paths exist, reviewed all task IDs/dependencies for an acyclic ordered execution, and checked the task for machine-specific paths and stale source references.
- Document-only checks: `git diff --no-index --check -- /dev/null docs/tasks/20261007-143507-access-router-explicit-service-authorization.md` and `pnpm exec prettier --check docs/tasks/20261007-143507-access-router-explicit-service-authorization.md`. Runtime build/test/lint are left to SVA-00 and the implementation gates; no feature implementation or baseline runtime passing claim is made here.

Review revision (2026-10-07 15:01:39 PDT):

- Incorporated the subsequent maintainer direction to revise the plan and remove service `overrides` once the replacement is ready for a breaking release.
- Added early SVA-01A enforcement and made it a dependency of runtime work; SVA-08 now verifies integrated behavior.
- Split immutable call policy from per-document grants/decisions and added an ownerId-dependent regression for a later pick after private data/metadata cleanup.
- Fixed configured overrideFilter semantics across all row modes and made breaking-release removal the sole planned service-container disposition.
- Moved write elevation, expanded dedicated subdocument policies, and positional helper retirement to SVA-F01 through SVA-F03. Current plan: 13 required pending tasks across 8 waves, plus 3 deferred follow-ups.
- Verified the dependency graph: SVA-01A precedes every runtime-authorization task, SVA-08 follows integration, and the three deferred follow-ups depend on SVA-11 without becoming release prerequisites. Checked for stale adapter alternatives, first-release write/subdocument policy declarations, and machine-specific paths.
- Verification passed: `pnpm exec prettier --check docs/tasks/20261007-143507-access-router-explicit-service-authorization.md` and `git diff --no-index --check -- /dev/null docs/tasks/20261007-143507-access-router-explicit-service-authorization.md`. Git status lists only this task file. This revision is documentation-only; implementation/runtime gates remain pending.

Execution direction (2026-10-07):

- Maintainer requested sequential implementation with a separate fresh sub-agent per task, status/Completion evidence updates, and final review of the full task record.
- Scope clarified through the question tool: required tasks only; SVA-F01 through SVA-F03 remain deferred.
- `CHANGELOG.md` must remain unchanged. Its initial Git blob hash is `c0561a1048c2341b14dd7f9d3e7c1fc055ae1880`; release guidance will be recorded in README/task documentation.

## Coordinator final review (2026-10-11)

- Reviewed every required task status and Completion evidence section, the independent SVA-11 acceptance audit, all seven required review fixes, and the three explicitly deferred follow-ups. All 13 original required tasks and seven required fixes are completed; only SVA-F01/F02/F03 remain deferred as requested. No required task is pending, in_progress, or blocked.
- Confirmed the original required tasks ran sequentially in separate isolated sub-agent sessions. Quota-interrupted sessions resumed their assigned task before the next task started. SVA-11 was a separate independent reviewer and recorded regression evidence for each issue it found and corrected.
- Reviewed the final gate results: access-router 97 files / 1,979 passing tests, package typecheck, full workspace build, 11,145 passing workspace test executions, root lint, and packed/installed CJS/ESM/type/documentation checks. The existing TODO/conditional skip are classified in SVA-11; no required gate was waived. These successful runtime gates were reused because no source/type/test/README change followed them.
- Checked the shipped README's trusted-server-only policy, selected internalNote grant, document-handle reuse, removal errors, and configured overrideFilter distinction against the completed task record. Updated the task's introductory example from proposed to implemented and marked its design details as recorded.
- Confirmed `git diff --check` and the untracked task's no-index whitespace check pass. The remaining worktree includes the intended implementation plus the pre-existing four-line setup-tools action edit; that unrelated edit is preserved.
- Recomputed `git hash-object CHANGELOG.md`: `c0561a1048c2341b14dd7f9d3e7c1fc055ae1880`, exactly matching the pre-execution hash. `CHANGELOG.md` has no diff. No commits, staging, resets, or publishing were performed.
- Final disposition: required implementation and full-task review are complete. Release version/date/publishing and the three deferred extensions remain outside this execution.
