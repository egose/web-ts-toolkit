# Access Router: server-owned hydration across server, client, and decorators

Created: 2026-10-15 16:29:27 local (`20261015-162927`, generated with `date +%Y%m%d-%H%M%S`).

Status: completed — HYD-01 through HYD-06 and the final definition of done are
verified. Initial environment/intermittent test failures and their final passing
reruns are preserved in HYD-06's evidence below.

## Objective and agreed direction

Retire caller-facing `lean` options across the Access Router API family. Select
Mongoose hydration through server-owned model configuration and package-internal
execution decisions. Deliver the server, client, decorator, declaration, and
migration changes together.

This includes `PublicListOptions`, `PublicReadOptions`, `FindOptions`,
`FindOneOptions`, and inherited `FindByIdOptions`; it is more than deleting two
root-router schema properties. Audit the exported `SubdocumentParentOptions` and
raw-parent helpers as well. Shared use of a type for defaults and call options
does not justify retaining the per-call switch.

Normal finalized model results remain plain output objects. Lifecycle operations
retain the live documents needed for setters, validation, saves, and deletion.
The first task specifies the server configuration contract and documents actual
hydration-sensitive behavior before implementation.

## Scope

- `packages/access-router`: model configuration, service options/defaults and
  execution, HTTP/nested-query boundaries, output compatibility, published types,
  tests, README and `llms.txt`.
- `packages/access-router-client`: existing option types/defaults, request and
  grouped/subquery/include construction, protocol/declaration tests, README and
  `llms.txt`.
- `packages/access-router-deco`: configuration decorators and factory integration,
  hook argument contracts, declaration/integration tests, and README.
- This task record in `docs/tasks/`.

Non-goals: removing Mongoose's `.lean()` implementation mechanism, forcing all
reads to lean without compatibility evidence, removing `skim`, redesigning
authorization or client `Model` wrappers, removing the Mongoose permissions
plugin, dependency upgrades, or unrelated package refactoring. Do not hand-edit
generated `dist` files. Record any necessary edits outside these packages before
expanding implementation scope.

## Analysis coverage and evidence

Planning baseline: HEAD `c938b84`; worktree clean before creating this document.
Inspected the relevant source, package scripts/configurations, and representative
tests in all three packages. No build, runtime tests, typecheck, performance probe,
or packed-consumer baseline was run: this deliverable is a task document.

| Finding                                                                                                                                                                               | Inspected evidence                                                                                                                                                                                                                                                                                                                 | Classification / consequence                                                                                                                                      |
| ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Root model list/read explicitly accept and forward `options.lean`; generated direct routes do not forward it.                                                                         | `packages/access-router/src/validation/root-router.ts` (`rootModelListOptionsSchema`, `rootModelReadOptionsSchema`); `src/routers/root-router.ts` (`optionKeys`); `src/routers/model-router-collection-routes.ts`; `src/routers/model-router-document-routes.ts` (remaining paths in this row are relative to the server package). | API simplification; remove the root-only caller control and verify alternate entries.                                                                             |
| Public list defaults to lean; public read and internal find/findOne/findById default to hydrated. Public wrappers resolve their defaults before internal calls.                       | `packages/access-router/src/services/public-service.ts` (`resolvePublicListOptions`, `resolvePublicReadOptions`); `packages/access-router/src/services/model-service-defaults.ts`; `packages/access-router/src/interfaces/root.ts` (`Defaults`).                                                                                   | Configuration migration must account for existing method-specific defaults and precedence.                                                                        |
| `lean` is also an exported raw-parent option; that helper returns the raw lookup, not a finalized DTO.                                                                                | `packages/access-router/src/interfaces/service.ts` (`SubdocumentParentOptions`); `packages/access-router/src/services/model-subdocument-service.ts` (`getParentDoc`); `packages/access-router/src/services/service.ts` (`findRawParentDoc`).                                                                                       | Audit separately from finalized list/read results; avoid changing a live-document helper's return contract accidentally.                                          |
| Public and internal forwarding share hydration-related allowlists; nested paths also supply internal `lean: true`.                                                                    | `packages/access-router/src/validation/public-admission.ts` (`forwardPublicOptions`, `requestOnlyServiceOptions`); `packages/access-router/src/services/base.ts` (include and subquery dispatch).                                                                                                                                  | A blind allowlist deletion can lose server-chosen behavior or leave a nested caller override.                                                                     |
| A plain output object does not prove identical values in both modes. Hydrated inputs call schema-aware `toObject({ virtuals: false, flattenMaps: true })`; bare lean skips hydration. | `packages/access-router/src/helpers/document.ts` (`isolateDocForOutput`); `packages/access-router/src/model.ts` (`find`, `findOne`).                                                                                                                                                                                               | Characterize defaults, schema conversion, and middleware/plugins; do not claim universal JSON parity or a measured speedup.                                       |
| Finalized service results currently restore a non-enumerable `permissions` alias only for hydrated documents with the matching virtual.                                               | `packages/access-router/src/services/service.ts` (`preservePermissionsVirtual`); `packages/access-router/src/plugins.ts`; `packages/access-router/test/include-source-provenance.integration.test.ts` (permission-alias case); `packages/access-router/test/model-router.integration.test.ts` (`/custom/permissions`).             | Select an explicit alias compatibility/deprecation contract instead of preserving a caller hydration knob solely for it.                                          |
| Client list/read option interfaces already omit `lean`; ordinary builders construct explicit option bags. Group metadata has broad record types and `group()` copies that metadata.   | `packages/access-router-client/src/interface.ts`; `packages/access-router-client/src/services/model-service.ts`; `packages/access-router-client/src/types.ts` (`RootModelQueryMeta`); `packages/access-router-client/src/adapter.ts` (`group`).                                                                                    | Client work is alignment and transport verification, not removal of a field that is already absent. Raw/modified metadata still requires server-side enforcement. |
| Decorators import server model option types and register their values through the runtime; there is no dedicated `lean` decorator.                                                    | `packages/access-router-deco/src/decorators/class.decorators.ts`; `packages/access-router-deco/src/decorators/property.decorators.ts`; `packages/access-router-deco/src/factory.ts` (`bootstrapModelRouter`, `setModelRouterOptions`, `registerPropertyOptions`).                                                                  | Expose the replacement server configuration through existing decorators and verify precedence/runtime ownership.                                                  |

Coverage is focused, not an exhaustive audit of application-supplied Mongoose
plugins, every peer version, or other workspace consumers. Test source was read;
historical passing reports are not verification of this change.

### Existing work and deduplication

This is a new API simplification phase following completed work, not a reopening
of its authorization, include-provenance, or decorator-policy fixes:

- [Server long-term health](20261012-165209-access-router-long-term-health.md):
  ARL-03 include isolation and the configuration/transport documentation work.
- [Package virtuals](20261005-122217-access-router-package-virtuals.md): isolated
  output/getter contracts and the historical permission-alias behavior.
- [Client business contracts](20260920-215404-access-router-client-business-contracts.md):
  grouped requests, defaults ownership, and protocol/installed-consumer checks.
- [Decorator policy preservation](20260920-215629-access-router-deco-policy-preservation.md):
  registration ordering, hook forwarding, and bootstrap transactions.

Focused searches of existing Access Router tasks found hydration/parity contracts,
but no existing task for this coordinated caller-option removal. Preserve the
historical evidence in those records; document the intentional contract change here.

## Contract requirements and decisions

Established direction:

1. No supported client or per-call service option selects hydration. Do not replace
   `lean` with a differently named per-call equivalent. Low-level adapter plumbing
   may retain a hydration flag when it is package-controlled.
2. Hydration configuration belongs to the model/runtime configuration layer, with
   types distinct from per-call options. Capture it with the existing owning-runtime
   call snapshot so fresh calls observe updates and in-flight work remains coherent.
3. Preserve current built-in fetch choices during this migration unless HYD-01
   records an evidence-backed intentional change. Removing an override is not
   authorization to standardize all reads on lean.
4. Compatibility preference for existing permissive wire slots: old `lean` keys
   become ignored and never reach hydration resolution. Existing correlated-include
   rejection of nonempty execution options remains intact. Define any different
   service/default migration behavior explicitly in HYD-01.
5. Configuration/control handling is contextual. A legitimate business field named
   `lean`, including filter values, selected fields, mutation data, and task payloads,
   is not removed or rejected by this work.
6. Authorization, package virtuals, output selection, decoration, metadata switches,
   and hook/context contracts continue to run under the selected server mode. Both
   modes producing plain objects does not imply byte-for-byte response equality.

Decisions to resolve in HYD-01 before implementation:

- Exact server setting name/type, method mapping, supported default/model scopes,
  precedence, and migration from `defaults.*Options.lean` and `service.defaults`.
- Handling of obsolete JavaScript per-call keys and legacy server default settings
  (with a documented migration rather than an unnoticed configuration change).
- Whether to make the finalized `permissions` compatibility alias independent of
  hydration or deprecate/remove that result alias. Keep this distinct from the
  optional getter on raw Mongoose documents.
- Which raw-parent/adapter controls are internal mechanisms, and the fixed or
  server-configured contract of documented raw-parent helpers.

Resolution: HYD-01's D1–D5 decision record below chooses all four contracts. Those
decisions are implementation requirements for HYD-02 onward, not claims that the
production migration has already shipped.

## Execution and verification rules

All tasks are P2: a coordinated API/maintainability improvement, with compatibility
questions to settle first. This document does not assert a confirmed vulnerability.
Execute HYD-01 through HYD-06 in order; shared server option types, forwarding,
README files, and transitive build outputs make this the simplest coordination.
No delegation or implementation has been performed by creating this plan.

Execution authorization: the user subsequently requested implementation of each
task one by one using sub-agents. HYD-01 through HYD-06 will each use a fresh,
sequential implementation session, with coordinator review between tasks. These
are planned assignments; completion evidence below records actual execution.
Use task IDs as session aliases and keep operational session identifiers private.

Set each task `in_progress` when its dependencies are satisfied. Record exact
decisions, changed files, commands/results, and remaining criteria before marking
it `completed`. Required checks blocked by prerequisites leave the affected task
`blocked`; do not treat unrun checks or historical results as passing evidence.

Commands below run from repository root unless stated. Prerequisites: Node >=22,
the repository pnpm version, installed workspace dependencies (`pnpm install` when
needed), and usable MongoDB binaries for existing mongodb-memory-server suites.
Use the existing test harnesses. Temporary consumer fixtures follow
`docs/tasks/README.md`; recorded paths must be repo-relative or use `<repo-root>`.

### Shared checks

- **V1 — focused builds/tests:** build the relevant closure with
  `pnpm --filter @web-ts-toolkit/access-router... build`,
  `pnpm --filter @web-ts-toolkit/access-router-client... build`, or
  `pnpm --filter @web-ts-toolkit/access-router-deco... build` before its focused
  tests. Record concrete test paths using the existing configurations, for example:

  ```sh
  pnpm --filter @web-ts-toolkit/access-router exec vitest run --config vitest.config.ts test/service-defaults.integration.test.ts test/include-source-provenance.integration.test.ts
  pnpm --filter @web-ts-toolkit/access-router-client exec vitest run --config ../../vitest.config.ts test/access-router-client.protocol-parity.integration.test.ts
  pnpm --filter @web-ts-toolkit/access-router-deco exec vitest run --config vitest.config.ts test/property-contracts.test.ts test/cross-path.integration.test.ts
  ```

- **V2 — types and package gates:** use these package scripts as appropriate to
  the task, with each command completing before the next:

  ```sh
  pnpm --filter @web-ts-toolkit/access-router typecheck
  pnpm --filter @web-ts-toolkit/access-router test
  pnpm --filter @web-ts-toolkit/access-router-client typecheck
  pnpm --filter @web-ts-toolkit/access-router-client test
  pnpm --filter @web-ts-toolkit/access-router-deco typecheck
  pnpm --filter @web-ts-toolkit/access-router-deco test
  ```

  Server/client typechecks rebuild dependencies; the decorator typecheck requires
  a prior server build. Client `test` includes strict NodeNext/Bundler consumers and
  the built-ESM jsdom smoke; decorator `test` includes its typecheck. Existing
  packed-consumer/docs/export tests are required. Reuse typecheck evidence from a
  passing same-revision package test that already runs the check.

- **V3 — final integration:** run `pnpm build`, `pnpm test`, and `pnpm lint`
  sequentially, plus `pnpm --filter @web-ts-toolkit/access-router typecheck`.
  Root `pnpm test` serializes workspace packages and includes the client/decorator
  gates above. Reuse valid same-revision evidence instead of rerunning identical
  package suites solely to duplicate the root test run.
- **V4 — publication/content:** inspect built declarations and run
  `npm pack --dry-run --json` from each of the three package directories. Use
  their existing packed-consumer harnesses for installed entrypoint verification;
  a dry-run alone does not verify consumer types. Run `git diff --check` and review
  migration prose/examples against the final contract.

Do not run independent package builds/tests concurrently: their scripts rebuild
shared `dist` outputs. No full peer-version compatibility matrix or release
publication is required for this change.

## Tasks

### Task HYD-01: Specify server hydration and characterize compatibility

Status: completed

Assigned: HYD-01 implementation session (sequential execution authorized above).

Kind: investigation

Priority: P2 — required to choose an executable contract without assuming hydration is inert.

Dependencies: none.

Primary ownership: this document's decision record; focused characterization
fixtures in `packages/access-router/test/`.

Finding: current method defaults differ; Mongoose hydration and schema conversion
can affect values, and the raw-parent helper exposes an unfinalized result.

References: `packages/access-router/src/model.ts`; `src/helpers/document.ts`;
`src/services/model-service-defaults.ts`; `src/services/public-service.ts`;
`src/services/model-subdocument-service.ts`; `src/services/service.ts`
(`preservePermissionsVirtual`, `findRawParentDoc`). Source paths after the first
are relative to `packages/access-router`.

Requirements:

1. Record a before/after fetch-mode matrix for public list/read, internal
   find/findOne/findById, read-to-list fallback, related include/populate/subquery
   work, raw-parent helpers, dedicated subdocument paths, and mutation/delete paths.
   Identify which decisions need configuration and which are fixed implementation
   requirements. Account for populate inheriting a parent query's lean choice.
2. Characterize a small representative Mongoose fixture: a stored row missing a
   schema-default field, schema `toObject` transforms/configured getters, and a
   hydration-sensitive init/query hook or plugin. Seed missing fields through the
   raw collection so create-time defaults do not hide fetch-time differences.
   Verify projected/private hook inputs as well as response values.
3. Resolve the four decision bullets above with exact names/types, precedence,
   scope, legacy-input behavior, and migration examples. Prefer a minimal
   model-owned configuration surface. Keep result-alias behavior explicit without
   requiring callers to select a hydration mode to access permissions metadata.
4. Identify meaningful existing assertions that must migrate from per-call flags
   to server configuration; retain both-mode output/isolation coverage. Distinguish
   deliberate changes from accidental regressions and from untested application plugins.

Acceptance criteria:

- The decision record contains one chosen contract, a method/default matrix,
  alias decision, and migration guidance; implementation tasks have no unresolved
  configuration-shape question.
- Focused probes record observed behavior rather than asserting universal JSON
  parity. No benchmark or application-wide compatibility claim is inferred.
- Any remaining maintainer decision is named with an owner and blocks dependent
  tasks until resolved.

Verification: V1 focused characterization and evidence review; record exact
commands/results and the final contract here before completing this task.

#### HYD-01 decision record (chosen contract)

Owner: HYD-01 implementation session. These decisions use the authorized design
discretion; no maintainer decision remains open. Preserve the built-in fetch modes
below. The observable changes are removal of caller/default controls and the
finalized alias contract, not standardization on one fetch mode.

**D1 — Configuration shape and scope.** Export these configuration-only types from
the server's supported root/advanced type surfaces:

```ts
export type HydrationMode = 'lean' | 'hydrated';
export interface ModelHydrationOptions {
  publicList?: HydrationMode;
  publicRead?: HydrationMode;
  find?: HydrationMode;
  findOne?: HydrationMode;
  findById?: HydrationMode;
}
// On DefaultModelRouterOptions, inherited by ModelRouterOptions:
// hydration?: ModelHydrationOptions;
```

One optional record, five entries matching the five existing independently
configurable buckets. No scalar shorthand, `default` member, access-specific tree,
include/populate/subdocument knob, callback, or per-service/per-call equivalent.
An omitted entry uses its built-in mode. `publicRead` covers identifier and filter
reads and both attempts of their list fallback. `findById` selects its own mode
before delegating; it does not inherit `findOne`.

- Supported writers: model router construction/setters, runtime
  `setModelOptions`/`setModelOption`, and runtime starting defaults via
  `setDefaultModelOptions`/`setDefaultModelOption`. Add the five exact
  `hydration.<entry>` keys to the corresponding extended option types.
  `GlobalOptions`, data/root router options, `Defaults`, client defaults, and
  `service.defaults` do not support hydration.
- Follow existing **shallow** model configuration semantics:
  `{ ...runtimeStartingDefaults, ...storedModelOptions, ...incomingModelOptions }`.
  A supplied hydration object replaces the whole previous hydration object; its
  omitted members use built-ins, not members from an older/default object. A dotted
  setter changes one member of the stored object. Starting-default changes are
  not broadcast into models that already stored their hydration object. Do not
  introduce a second per-member inheritance resolver via generic nested lookup.
- Whole-object `undefined` clears the setting; member `undefined` clears that
  override. Accept only a plain record with these five keys and mode strings (or
  undefined). Reject null, arrays, booleans, unknown keys and invalid modes with a
  path-bearing `TypeError` before publishing any part of the update. Validate both
  default and model setters, including dotted setters; rejected writes and failed
  decorator bootstrap preserve the previous snapshot.
- Use the existing owning-runtime model call snapshot
  (`src/acl/model-service-owner.ts`, `modelServiceOptions`) and related execution
  captures. Retained services observe fresh owner configuration on fresh calls;
  suspended work, fallback and already-captured related work retain their chosen
  version. Ambient replacement `req.macl` must not select a different runtime.
- Decorators inherit these types: default provider/scoped default property →
  per-model `@RouterOptions` → `@Router` → same-class property option precedence
  remains the existing bootstrap precedence, with the same shallow record
  replacement. Support `@ModelOption('hydration')` and dotted entries, plus the
  equivalent default-provider paths. No dedicated hydration decorator.

**D2 — Before/after fetch-mode matrix.** “After” means the built-in choice when no
new server override is set; H = hydrated, L = lean. Configurable methods use D1;
fixed stages bypass those settings. References in this table are relative to
`packages/access-router/src/`.

| Path/stage                                                                         | Before                                                                                       | After / authority                                                                | Evidence                                                                                                     |
| ---------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------ |
| Public `_list`, direct/root model list                                             | L                                                                                            | L; `hydration.publicList`                                                        | `services/public-service.ts`, `_list`/`resolvePublicListOptions`; characterization built-in/precedence probe |
| Public `_read` / `_readFilter`, direct/root model read                             | H                                                                                            | H; `hydration.publicRead`                                                        | `services/public-service.ts`; characterization built-in probe                                                |
| Read → list fallback                                                               | Both attempts use the resolved public **read** mode, despite changed ACL access              | Same; retain `publicRead` snapshot, never use `publicList`                       | Both fallback entrypoints tested in each mode                                                                |
| Internal `find` / `findOne` / `findById`                                           | H / H / H; separate named default buckets                                                    | H / H / H; `hydration.find` / `.findOne` / `.findById`                           | `services/model-service-defaults.ts`; precedence probe                                                       |
| Legacy include read/list target                                                    | Explicit L, overriding target defaults/caller include options                                | Fixed L through private execution plumbing                                       | `services/base.ts`, `includeDocsRead`/`includeDocsList`; both tested                                         |
| Correlated include identifier/filter read and list target                          | Explicit L; no read fallback                                                                 | Fixed L through private execution plumbing                                       | `includeCorrelatedRead`/`includeCorrelatedList`; filter-read/list tested, identifier branch inspected        |
| Include count / ordinary count / distinct / count-by-field aggregate               | Scalar/aggregate database operations; no document hydration                                  | Unchanged; no configuration                                                      | `services/base.ts`, count executors; `model.ts`                                                              |
| `$$sq` list/read target                                                            | Target's public list/read resolver; read fallback disabled                                   | Target's captured `publicList`/`publicRead`; old nested caller keys inert        | `services/base.ts`, `handleSubQuery`; target query modes tested                                              |
| Mongoose populate, including nested populated targets                              | Inherits originating Mongoose query's lean setting; target service defaults do not select it | Same; use parent query mode, not target hydration settings                       | `model.ts`, `find`/`findOne`; real parent/target document propagation tested in both modes                   |
| `getParentDoc` raw helper                                                          | H by default; exported `SubdocumentParentOptions.lean` can request L                         | Fixed H; D4                                                                      | `services/model-subdocument-service.ts`; raw returned documents/defaults tested                              |
| `findRawParentDoc` adapter-facing helper                                           | Forwards caller's required `lean` boolean                                                    | Public helper fixed H; package-only raw query path supplies fixed L where needed | `services/service.ts`; callers inspected, raw-parent probe covers delegation                                 |
| Dedicated `listSub` / `readSub` parent fetch, readSub populate                     | Explicit H                                                                                   | Fixed H, even under lean read configuration                                      | `services/model-subdocument-service.ts`; list/read parent modes tested                                       |
| Dedicated create/update/bulk-update/delete parent mutation                         | Explicit H for document-array setters/deletion and parent save                               | Fixed H                                                                          | Same module; update/save tested, other branches inspected                                                    |
| Dedicated mutation post-save visibility re-fetch                                   | Explicit L                                                                                   | Fixed L; do not route through the public hydrated raw-parent helper              | `visibleMutationRows`; update visibility probe observes H then L                                             |
| `new` / create, update lookup/save, internal upsert existence branch, delete hooks | New/live H documents; internal upsert uses H lookup then create/update                       | Fixed H; lifecycle requirements take precedence over read configuration          | `services/service.ts`; update/create/delete hooks tested, new/upsert inspected                               |
| Public upsert ID existence / ordinary exists                                       | `_id`-only L via `model.exists`                                                              | Fixed L, then live H mutation branch                                             | `model.ts`, `exists`; public upsert inspected                                                                |
| Field-permission row-membership queries                                            | `_id`-only explicit L                                                                        | Fixed L                                                                          | `services/service.ts`, `getAccessibleIds`; observed during initial metadata-enabled subquery probe           |

Before migration, each of the five read resolvers uses per-call non-nullish
`lean` → its named `service.defaults.*Options.lean` → built-in. The defaults getter
uses an explicit `service.defaults` assignment instead of the entire runtime
defaults bag; it does not merge them. Public wrappers resolve their own defaults
and built-ins first, so their forwarded mode wins over internal defaults even
when the public bucket omits `lean`. The new configuration preserves the five
distinct choices without preserving that forwarding channel. Package-selected
modes must travel on private execution state, not a property accepted by exported
per-call options. Keep `FindProps`/`FindOneProps.lean` in `model.ts` as low-level
adapter mechanisms, not a supported service/request override.

**D3 — Legacy inputs and migration.** Remove `lean` from all affected service,
public, inherited and raw-parent option declarations. Old JavaScript per-call
`lean` keys (true, false, undefined, inherited or non-enumerable) are ignored, not
read or forwarded; no service method converts them into configuration. An extra
per-call `hydration` key is likewise inert in permissive option slots. Keep strict
correlated-include rejection of nonempty execution options. Preserve business
properties named `lean` or `hydration` in filters, selection, mutation/task data.

Legacy **configuration** fails explicitly rather than being silently ignored or
automatically translated: reject presence of `lean` (including undefined) in
method `*Options` buckets under model `defaults` or an assigned `service.defaults`.
Reject attempts to put `hydration` in those option buckets too. Check only control
buckets, not arbitrary fields inside args/filter/task data. Cover whole/default
bucket/dotted setters, synchronous `service.defaults` assignment, and call-time
validation for later JavaScript mutation of an assigned defaults bag. Diagnostics
name the old path and replacement `hydration.<entry>` (or explain that the method
has a fixed mode). Validation failure must precede publication/query execution.
No deprecated default alias or dual precedence chain is retained.

Migration examples (the intended HYD-02 API; not a claim of currently compiling
replacement configuration):

```ts
// Before, supplied as model options:
const oldOptions = {
  defaults: {
    publicListOptions: { lean: false, includeCount: true },
    findOneOptions: { lean: true },
  },
};
// After:
const options = {
  hydration: { publicList: 'hydrated', findOne: 'lean' },
  defaults: { publicListOptions: { includeCount: true } },
} satisfies ModelRouterOptions;
api.createRouter(Thing, options);

// Before: service.defaults = { findOptions: { lean: true, includeCount: true } };
api.runtime.setModelOption('Thing', 'hydration.find', 'lean');
service.defaults = { findOptions: { includeCount: true } };
// Calls simply omit the retired option; no request-local replacement exists.
await service.find({});
```

Mechanical mapping: `publicListOptions.lean` → `publicList`,
`publicReadOptions.lean` → `publicRead`, `findOptions.lean` → `find`,
`findOneOptions.lean` → `findOne`, `findByIdOptions.lean` → `findById` under
`hydration`; true becomes `'lean'`, false becomes `'hydrated'`. A previous
service-instance override now changes model-wide behavior and must be deliberately
moved to the owning model configuration, not emulated per call. Default providers
use the same new record at their existing starting-default scope.

**D4 — Raw-parent contract.** `getParentDoc(id, sub, args?, { access? })` returns an
unfinalized hydrated parent document or null, preserving its identifier/row-policy
and projection/populate behavior. It is not a DTO and does not compute finalized
permission metadata. `findRawParentDoc({ filter, select, populate })` likewise
returns a hydrated raw document/null; it remains a low-level helper, not a new
authorization boundary. Strip stale JS `lean` keys before adapter dispatch instead
of spreading them. Neither helper is configurable by the D1 record. Internal
subdocument visibility reads need a separate package-private adapter/executor
path to keep their L mode; do not expose a new flag, overload or public method
that recreates per-call hydration control. The Mongoose permissions plugin's raw
document getter remains optional and distinct from D5.

**D5 — Finalized `permissions` alias.** Retain it as a consistent non-enumerable
compatibility alias independent of hydration **and** plugin installation. For a
package-finalized model object that already has serialized permission metadata,
attach `permissions` to the finalized metadata value at the captured
`documentPermissionField`, including dotted paths such as `meta.grants`. Use a
non-enumerable, writable, configurable own data property, matching the historical
descriptor. It is a convenience value alias, not an authorization source or a
live binding after application reassignment.

- Apply after metadata exposure/stripping and maintain it across package-owned
  output copies/related attachments. Includes and populated/dedicated outputs
  follow the same rule **when they already carry metadata**; do not invent
  metadata on outputs/scopes that currently omit it. Never copy a raw document's
  virtual or unfiltered grants. JSON/Object.keys/object spread continue omitting
  the generated alias. Arbitrary application copies/transform replacements and
  client `Model` wrappers are not promised to retain non-enumerable properties.
- `stripPermissionsField: true` suppresses the generated alias as well as the
  canonical metadata. `exposedDocPermissionKeys`, field-map disabling and metadata
  include switches apply to the canonical finalized value before aliasing; the
  existing empty/placeholder metadata behavior remains eligible for aliasing.
- Existing output property `permissions` wins: preserve selected business fields,
  package virtuals, include attachments and their descriptors. Do not reserve that
  name or change existing metadata/include collision validation. If the canonical
  metadata path is `permissions` or below it, that existing enumerable canonical
  property is retained; no separate alias is created. When it is `meta.grants`,
  resolve the path rather than testing a literal dotted own key.
- Deliberate compatibility expansion: lean and plugin-free finalized model rows
  can now access the same alias, and dotted metadata paths work. The optional
  Mongoose plugin keeps its existing raw-document getter/custom-name behavior;
  this task does not change that getter's dotted-path implementation. It remains
  irrelevant to hydration resolution and enforcement.

#### HYD-01 observations and migration targets

New fixture: `packages/access-router/test/hydration-characterization.integration.test.ts`.
Its raw `collection.insertOne` seed omits `missingDefault`, `initOnly` and
`conversion`; create-time defaults cannot mask the result. Observations on the
installed Mongoose version:

| Observed value/contract                                                  | Lean                                                             | Hydrated                                                                       |
| ------------------------------------------------------------------------ | ---------------------------------------------------------------- | ------------------------------------------------------------------------------ |
| Persisted `value: 'stored'`, schema `toObject.getters: true`             | `'stored'`                                                       | `'getter:stored'`                                                              |
| Missing schema-default field                                             | Absent                                                           | `'fetch-default'`                                                              |
| `post('init')` document hook                                             | Not run                                                          | Runs; `initOnly: 'post-init'` reaches output/hook input                        |
| Schema `toObject` transform                                              | Not run                                                          | `conversion: 'toObject-transform'` reaches output/hook input                   |
| Mongoose getter virtual, even with schema `virtuals: true`               | Absent                                                           | Suppressed by package conversion's `virtuals: false`                           |
| Final row, document-permission hook and package getter inputs            | Plain                                                            | Plain, with the above hydration-sensitive values                               |
| Hidden `secret` fetched through `alwaysSelectFields`/dependency planning | Present privately to hooks; absent from decoration/response      | Same isolation/visibility, with schema conversion still applied to hook inputs |
| Map output and mutation isolation                                        | Plain object; changing output leaves fetched/stored values alone | Same isolation; fetched value remains a Mongoose Map                           |
| Query middleware                                                         | Runs and observes lean option                                    | Runs and observes hydrated query/documents                                     |
| Populated target                                                         | Lean, with missing default absent                                | Hydrated, default/init/getter behavior propagated                              |

Current alias probes additionally establish: default-path hydrated plugin output
has a non-enumerable alias; lean/plugin-free/dotted-path output currently does
not; stripping removes metadata and alias; exposure pruning omits private grant
keys; a selected business `permissions` field survives. D5 intentionally changes
only the noted alias dependence/path behavior. No universal JSON-parity,
performance, or arbitrary application-plugin claim follows from this fixture.

Meaningful assertions to migrate, not delete:

- This new suite: use D1 server settings for both-mode value/populate/fallback
  probes; replace old precedence/per-call-default acceptance with D1/D3 precedence,
  rejection and inert-JS tests; update raw-parent lean override to the fixed-H
  assertion; update alias cases to D5. Keep the raw database queries and fixed-mode
  include/subdocument/lifecycle assertions.
- `packages/access-router/test/include-source-provenance.integration.test.ts`:
  `fixture(lean)` public defaults and service call flags become model settings;
  retain both-mode raw-input immutability, private hooks, target handles and
  correlated/ordinary attachment cases. Replace the hydrated-only alias assertion.
- `packages/access-router/test/service-authorization-boundary-admission.contract.test.ts`:
  old `lean` forwarding/default assertions become inert-key/configuration-boundary
  assertions; preserve business field and private execution admission coverage.
- `packages/access-router/test/retained-model-service-ownership.integration.test.ts`:
  move `quiet.lean` to owner config and add fresh/in-flight hydration captures with
  a different ambient runtime. Existing ownership assertions remain substantive.
- `packages/access-router/test/virtuals-finalizer.unit.test.ts`,
  `virtuals-direct-operations.integration.test.ts`,
  `virtuals-populate-include.integration.test.ts`, and
  `virtuals-embedded-subdocuments.integration.test.ts` (last three in the same test
  directory): retain raw hydrated/lean fixture normalization, lifecycle, population,
  and embedded isolation coverage; native Mongoose `.lean()` is not a retired API.
  The current defaults suite also remains a presentation-default regression gate.

#### HYD-01 verification evidence

Working directory: repository root. State: planning baseline `c938b84` plus the
task record and new characterization test only; production source unchanged.
Build completed before test execution; no overlapping package build/test commands.

- `node --version` → `v26.10.0`; `pnpm --version` → `11.18.0`.
- `pnpm --filter @web-ts-toolkit/access-router exec node -p "JSON.stringify({mongoose: require('mongoose').version, memoryServer: require('mongodb-memory-server/package.json').version, vitest: require('vitest/package.json').version})"`
  → Mongoose `9.9.2`, mongodb-memory-server `11.2.0`, Vitest `4.1.11`.
- `pnpm --filter @web-ts-toolkit/access-router... build` → passed, server and its
  four dependency packages built, including declarations.
- Initial `pnpm --filter @web-ts-toolkit/access-router exec vitest run --config vitest.config.ts test/hydration-characterization.integration.test.ts`
  → 17 passed / 2 failed. Fixture corrections: subquery defaults requested metadata
  and correctly triggered two extra lean `_id` membership queries; specify quiet
  metadata options when counting primary queries. The lifecycle spy initially
  returned undefined, violating the existing transform contract; return the live
  document. These were probe expectation/setup failures, not production defects.
- `pnpm --filter @web-ts-toolkit/access-router exec vitest run --config vitest.config.ts test/hydration-characterization.integration.test.ts test/service-defaults.integration.test.ts test/include-source-provenance.integration.test.ts`
  → **3 files / 102 tests passed**, including all 19 new characterization cases
  (24.63 s). Existing config-loader warning only. Subsequent test-file edits were
  formatting-only.
- `pnpm exec eslint packages/access-router/test/hydration-characterization.integration.test.ts`
  → passed.
- `pnpm exec prettier --check packages/access-router/test/hydration-characterization.integration.test.ts`
  → initially reported formatting differences; reapplied formatting with the patch
  tool and reran the same check → passed.
- `git diff --check` → passed (the two deliverable files are untracked at this
  stage; explicit added-file whitespace checking is recorded below).
- `python3 -c 'from pathlib import Path; files = [Path("packages/access-router/test/hydration-characterization.integration.test.ts"), Path("docs/tasks/20261015-162927-access-router-server-owned-hydration.md")]; bad = [(str(p), n) for p in files for n, line in enumerate(p.read_text().splitlines(), 1) if line != line.rstrip()]; assert not bad, bad; print("Both added files: no trailing whitespace")'`
  → passed; explicitly checks both untracked deliverables.

Completion: HYD-01's four requirements and three acceptance criteria are satisfied
by D1–D5, the before/after matrix, 19 characterization cases and passing V1 checks.
Changed only the new test file and this task record. No production/API migration
was included. HYD-02 is ready to implement this contract and migrate the probes;
the later tasks' statuses remain pending.

Limitations: V1 is the HYD-01 gate. Full package/workspace/type-consumer/publication
gates remain with their implementation tasks; the new configuration is a decision,
not a production implementation. Only the installed Mongoose version and bounded
fixture/plugin behavior above were tested. Matrix rows explicitly labeled
“inspected” are source evidence, not additional executed tests. No prerequisite or
maintainer decision blocks HYD-02; HYD-02 through HYD-06 remain pending.

### Task HYD-02: Replace per-call server options with model-owned hydration

Status: completed

Assigned: HYD-02 implementation session (sequential execution; HYD-01 coordinator-reviewed).

Kind: improvement

Priority: P2 — implement the agreed server API simplification and runtime ownership.

Dependencies: HYD-01.

Primary ownership: `packages/access-router/src/interfaces/`;
`src/runtime.ts`; `src/services/service.ts`; `src/services/public-service.ts`;
`src/services/model-service-defaults.ts`; `src/services/model-subdocument-service.ts`;
`src/services/base.ts`; `src/validation/public-admission.ts`; output helpers and
exports as necessary. Paths after the first are relative to the server package.

Finding: option interfaces are reused by per-call parameters, defaults, and root
entry types. Current resolvers consume `options.lean`, and internal forwarding
shares the same keys with request-originated options.

References: the server option/default/forwarding evidence above;
`packages/access-router/src/interfaces/service-find.ts`;
`packages/access-router/src/interfaces/service-list.ts`;
`packages/access-router/src/interfaces/service-read.ts`;
`packages/access-router/src/interfaces/root.ts` (`Defaults`, extended dotted setters).

Requirements:

1. Remove `lean` from the documented per-call types and runtime resolution,
   including inherited and raw-parent options identified in HYD-01. Add the chosen
   configuration-only type/settings and migrate old defaults according to HYD-01.
2. Resolve configuration from the captured owning runtime/model. Preserve
   configuration validation-before-publication, relevant dotted setters and
   bootstrap snapshots. Exercise retained service instances, fresh calls, and
   in-flight calls when configuration changes or another runtime owns the request.
3. Separate caller forwarding from package-controlled query settings. Move internal
   include/subquery and public-wrapper mode selection to the chosen server/private
   mechanism; do not keep accepting per-call `lean` through casts or spread objects.
4. Keep live-document requirements for lifecycle hooks and raw-parent helpers.
   Implement the selected result-alias contract, respecting configured permission
   metadata paths, metadata stripping, and JSON non-enumerability if retained.
5. Migrate fixtures and JSDoc alongside changes. Preserve meaningful lean/hydrated
   coverage by configuring server state; retain legitimate raw Mongoose `.lean()`
   test queries and internal adapter mechanisms.

Acceptance criteria:

- Strict consumer fixtures reject removed per-call options, accept configuration
  at the chosen server scope, and expose accurate declarations from supported exports.
- Adapter instrumentation proves server configuration determines fetch mode;
  obsolete JavaScript options cannot override it under HYD-01's migration contract.
- Built-in mode matrix, runtime ownership/snapshots, write hooks, output/grant
  isolation, include provenance, and selected alias semantics pass focused tests.

Verification: V1/V2 server checks, including service-defaults, strict consumers,
retained-model-service-ownership, include-source-provenance, virtuals-finalizer,
virtuals-direct-operations, and affected subdocument suites.

#### HYD-02 implementation record

- Implemented configuration-only hydration types/validation, shallow model/default
  setters, private execution capture, fixed hydrated raw-parent helpers and private
  lean post-save visibility reads. Migrated the HYD-01 characterization fixture,
  include provenance and service fixtures to model configuration; added configuration,
  strict installed-consumer and retained-owner/in-flight coverage.
- Implemented plugin/mode-independent serialized-metadata aliases, dotted-path
  resolution and package-owned output-copy preservation. `src/processors.ts` is a
  necessary output-copy integration: COPY/MOVE and immutable tasks clone related
  rows and must retain their aliases from copied metadata. No outside-package scope
  expansion is needed.
- Shared HYD-03 prerequisite: `forwardPublicOptions` and
  `requestOnlyServiceOptions` no longer forward `lean`; includes carry fixed lean
  through private execution state. Root schema/whitelist removal and focused wire
  coverage remain HYD-03. Public list/filter-read wrappers now use private prepared
  executors; boundary mocks observe that seam rather than a public method override.
- First full `pnpm --filter @web-ts-toolkit/access-router test` after continuation:
  **113 files passed / 3 failed; 2787 tests passed / 9 failed**. Failures identified
  an unintended change to assignment-time authorization-default validation. Fixed
  by limiting synchronous `service.defaults` validation to HYD-02 hydration controls;
  existing authorization controls keep their established call-time admission.
  This run is diagnostic evidence, not the final passing gate.
- Final checks (repository root, 2026-10-16; sequential build/test execution):
  `pnpm --filter @web-ts-toolkit/access-router typecheck` **passed** after the final
  defaults/processor adjustments, rebuilding the server and four dependencies.
  Final focused V1 command below **passed: 12 files / 357 tests** (80.91 s), including
  installed Bundler/NodeNext consumers.

  ```sh
  pnpm --filter @web-ts-toolkit/access-router exec vitest run --config vitest.config.ts test/hydration-characterization.integration.test.ts test/hydration-configuration.test.ts test/service-defaults.integration.test.ts test/include-source-provenance.integration.test.ts test/retained-model-service-ownership.integration.test.ts test/service-authorization-boundary-admission.contract.test.ts test/virtuals-finalizer.unit.test.ts test/virtuals-direct-operations.integration.test.ts test/virtuals-populate-include.integration.test.ts test/virtuals-embedded-subdocuments.integration.test.ts test/service-authorization-subdocuments.integration.test.ts test/strict-consumer-types.test.ts
  ```

- Final `pnpm --filter @web-ts-toolkit/access-router test` **passed: 116 files /
  2796 tests** (617.14 s), including packed-consumer, documentation examples,
  declaration/export, all subdocument and authorization regression suites. The
  package script rebuilt its dependency closure first. Existing Vite native-config
  loader warning only. No compiling-documentation prerequisite edits were needed.
- `pnpm exec eslint packages/access-router/src packages/access-router/test` **passed**.
- `pnpm exec prettier --check $(git diff --name-only -- '*.ts') packages/access-router/src/options/hydration.ts packages/access-router/src/output/permissions-alias.ts packages/access-router/test/hydration-characterization.integration.test.ts packages/access-router/test/hydration-configuration.test.ts packages/access-router/test/hydration-consumer.types.fixture.ts`
  **passed**; all changed TypeScript files match repository formatting.
- `git diff --check` **passed**. Built declaration inspection confirms root/advanced
  hydration type exports, the exact five dotted setters and fixed raw-parent args;
  strict/packed consumers verify both positive configuration and negative retired
  per-call options against installed declarations.
- Final comment-only fixture changes passed
  `pnpm exec prettier --check packages/access-router/test/service-authorization-boundary-admission.contract.test.ts packages/access-router/test/operation-access-boundaries.integration.test.ts`.
  A Python `Path.read_text().splitlines()` scan of
  `git ls-files --others --exclude-standard` checked all **six untracked
  deliverables**, including this record, with **no trailing whitespace**.

Completion: HYD-02 requirements and acceptance criteria are satisfied. Source
ownership is `src/interfaces/`, `src/index.ts`, `src/runtime.ts`, new
`src/options/hydration.ts`, private ACL configuration/execution/output metadata,
service defaults/public/internal/subdocument/related execution, positive public
forwarding, and output copies (`src/helpers/document.ts`, `src/processors.ts`, new
`src/output/permissions-alias.ts`). All paths in this paragraph are relative to
`packages/access-router`. Tests include the preserved/migrated HYD-01 fixture,
new `test/hydration-configuration.test.ts` and
`test/hydration-consumer.types.fixture.ts`, installed-consumer harness registration,
owner/provenance/admission tests and migrated authorization fixtures. Alias tests
cover both modes, plugin presence/absence, dotted/canonical paths, stripping,
exposure, business/virtual/include collisions, public mutation picks, task/related
copies and no metadata synthesis for ordinary populate/dedicated subdocument rows.
Subsequent edits after the final test run only label existing intentional stale-JS
fixtures and update this evidence; executable code is unchanged.

Handoff: **HYD-03 is ready**, with no external blocker. Remove the two root `lean`
schema properties and root list/read whitelist entries in
`src/validation/root-router.ts` and `src/routers/root-router.ts`, then add the planned
focused wire/query-mode coverage. Root wire keys currently reach a service that
ignores them; shared nested/public service forwarding already omits them. Keep the
private execution mechanism separate from request controls and preserve strict
correlated-include validation. HYD-04/HYD-05 own client/decorator integration;
HYD-06 owns the remaining README/llms migration prose (including old service/root
lean promises and the new alias contract), workspace gates and publication checks.
Only the installed peer versions and these package gates are verified here; no
universal response-parity or performance claim is made. HYD-03 through HYD-06 remain
pending.

### Task HYD-03: Remove hydration controls from HTTP and nested request paths

Status: completed

Assigned: HYD-03 implementation session (sequential execution; HYD-02 coordinator-reviewed).

Kind: improvement

Priority: P2 — make root, direct, and nested request behavior follow the same contract.

Dependencies: HYD-02.

Primary ownership: `packages/access-router/src/validation/`;
`src/routers/root-router.ts`; direct model route handlers and OpenAPI generation
as needed; nested request dispatch in `src/services/base.ts`; focused route tests.
Paths after the first are relative to the server package.

Finding: removing a Zod property alone is insufficient because root option
schemas are passthrough; root forwarding and nested `forwardPublicOptions` also
control reachability. Internal allowlists were disentangled in HYD-02.

References: `packages/access-router/src/validation/root-router.ts`;
`packages/access-router/src/routers/root-router.ts` (`optionKeys`);
`packages/access-router/src/validation/public-admission.ts`;
`packages/access-router/test/correlated-includes.validation.test.ts`.

Requirements:

1. Remove supported `lean` schema/OpenAPI entries and forwarding on root list/read;
   verify direct GET/advanced body routes and independent root dispatch as well.
2. Follow the specified legacy-wire behavior. Neither an old `lean` key nor the
   replacement server configuration can select hydration through request control
   slots, nested `$$sq`, legacy includes, or populate descriptors. Retain existing
   strict correlated-include option validation.
3. Test true/false/omission under both server modes using observed adapter/query
   mode, not only equal response JSON. Cover list, identifier read, filter read,
   fallback and a nested target. Confirm input/business fields named `lean` survive.

Acceptance criteria:

- Root/direct/nested requests cannot override server hydration, including raw JSON
  calls independent of the client library. Supported schemas/OpenAPI/types agree.
- Legacy tolerated keys are inert; strict nested controls retain their documented
  errors. Authorized business fields named `lean` remain valid data.
- Public query/context metadata does not gain private hydration configuration.

Verification: V1 server root-router, model-router route, boundary-admission,
correlated-include validation/execution, and virtuals route/OpenAPI suites; V2
server gate after the boundary changes.

#### HYD-03 implementation record

- Removed the two root `lean` schema properties and list/read forwarding entries
  in `packages/access-router/src/validation/root-router.ts` and
  `packages/access-router/src/routers/root-router.ts`. Root options remain
  passthrough, with unsupported values inert at positive forwarding. HYD-02's
  direct/related dispatch and private execution capture required no further changes.
- Added `packages/access-router/test/hydration-request-boundaries.integration.test.ts`
  using the existing MongoDB harness. Thirteen cases exercise both configured modes
  with omitted/true/false legacy keys, scalar/record `hydration` attempts and unknown
  values. Real query middleware records Mongoose lean options and pre-finalization
  document instances; raw seeds omit a schema default to also observe value effects.
  Coverage includes direct GET/advanced list and identifier/filter reads, raw root
  batches, both fallback attempts, target-owned `$$sq` list/identifier/filter reads,
  fixed-lean legacy/correlated includes and parent-mode populate descriptors.
- Strict correlated options still fail before source/target queries through direct,
  root-schema and independent root-dispatch execution. Business `lean`/`hydration`
  fields survive filters (with a decoy row), selections, create/update persistence,
  include predicates and nested task replacement data. Hook query/context control
  slots omit private hydration state; root DTOs omit query/context metadata.
- Extended `test/service-authorization-boundary-admission.contract.test.ts` with
  independent list/identifier/filter root forwarding checks, including inherited
  and non-enumerable getter controls. Extended `test/correlated-includes.validation.test.ts`
  for all correlated shapes/strict slots, `test/openapi.test.ts` for generated direct
  and root schemas, and `test/hydration-consumer.types.fixture.ts` for installed root,
  advanced-body and populate option declarations. These paths are relative to
  `packages/access-router`; earlier HYD-01/HYD-02 changes are preserved.

Verification (repository root; sequential build/test execution, 2026-10-16):

- `pnpm --filter @web-ts-toolkit/access-router... build` **passed**, rebuilding the
  server and four dependency packages, including declarations.
- Initial focused command:

  ```sh
  pnpm --filter @web-ts-toolkit/access-router exec vitest run --config vitest.config.ts test/hydration-request-boundaries.integration.test.ts test/service-authorization-boundary-admission.contract.test.ts test/correlated-includes.validation.test.ts test/openapi.test.ts test/strict-consumer-types.test.ts
  ```

  **4 files passed / 1 failed; 129 tests passed / 2 failed** (40.33 s). The new
  correlated-ID fixture used an ObjectId-valued parent reference; the existing
  `resolveCorrelatedIdTemplate` contract treats objects as unresolvable. Corrected
  the fixture to use its string identifier, retaining the identifier execution
  branch and correlated filter references. No production resolver change was needed.

- Final focused V1 command **passed: 12 files / 225 tests** (58.52 s), including
  installed Bundler/NodeNext hydration consumers:

  ```sh
  pnpm --filter @web-ts-toolkit/access-router exec vitest run --config vitest.config.ts test/hydration-request-boundaries.integration.test.ts test/hydration-characterization.integration.test.ts test/root-router.integration.test.ts test/root-router.variants.integration.test.ts test/model-router.routes.integration.test.ts test/model-router.integration.test.ts test/service-authorization-boundary-admission.contract.test.ts test/correlated-includes.validation.test.ts test/correlated-includes.execution.test.ts test/virtuals-validation-openapi.contract.test.ts test/openapi.test.ts test/strict-consumer-types.test.ts
  ```

- `pnpm --filter @web-ts-toolkit/access-router typecheck` **passed**, rebuilding the
  server dependency closure before source typechecking.
- `pnpm --filter @web-ts-toolkit/access-router test` **passed: 117 files / 2814
  tests** (631.35 s), rebuilding the dependency closure first. Includes packed and
  strict consumers, documentation examples, declaration/export and all server
  regression suites. Collected the original background command's final output
  after its completion notification; no duplicate or concurrent build/test run.
  Existing Vite native-config loader warning only.
- `pnpm exec eslint packages/access-router/src/routers/root-router.ts packages/access-router/src/validation/root-router.ts packages/access-router/test/hydration-request-boundaries.integration.test.ts packages/access-router/test/service-authorization-boundary-admission.contract.test.ts packages/access-router/test/correlated-includes.validation.test.ts packages/access-router/test/openapi.test.ts packages/access-router/test/hydration-consumer.types.fixture.ts`
  **passed**.
- `pnpm exec prettier --check packages/access-router/src/routers/root-router.ts packages/access-router/src/validation/root-router.ts packages/access-router/test/hydration-request-boundaries.integration.test.ts packages/access-router/test/service-authorization-boundary-admission.contract.test.ts packages/access-router/test/correlated-includes.validation.test.ts packages/access-router/test/openapi.test.ts packages/access-router/test/hydration-consumer.types.fixture.ts`
  **passed** after applying formatting patches to the three flagged test files.
- `git diff --check` **passed**.
- Explicit `Path.read_text().splitlines()` trailing-whitespace scan of this record,
  `packages/access-router/test/hydration-request-boundaries.integration.test.ts` and
  `packages/access-router/test/hydration-consumer.types.fixture.ts` **passed** (these
  deliverables are untracked and therefore absent from ordinary `git diff --check`).
- Source audit found no `lean`/`hydration` controls in `src/routers`; remaining
  validation mentions are HYD-02's legacy-default rejection diagnostics. Built root
  schemas also omit both controls. Runtime/strict-consumer/OpenAPI evidence above
  covers the supported request surface rather than treating passthrough keys as
  documented options.
- Coordinator review confirmed the HYD-03 production/schema diff and new boundary
  suite align with the contract. The subsequent V2 result above completes the
  required implementation gates.

Completion: all three HYD-03 requirements and acceptance criteria are satisfied
by the root schema/forwarding cleanup, both-mode Mongoose observations, strict
correlated rejection, business-data preservation, metadata isolation and passing
V1/V2 checks. Changes after the final executable test revision only clarify an
existing test comment and update this record. No blocker remains; **HYD-04 is
ready** for its fresh implementation session. HYD-04 through HYD-06 stay pending.

Limitations: verification uses the installed peers and bounded server fixtures;
no universal response-parity or performance claim is made. Client/decorator work
and final workspace/publication gates remain HYD-04 through HYD-06, all pending.

### Task HYD-04: Align client types, defaults, and transport contracts

Status: completed

Assigned: HYD-04 implementation session (sequential execution; HYD-03 coordinator-reviewed).

Kind: improvement

Priority: P2 — verify the client stays aligned with the revised server contract.

Dependencies: HYD-03.

Primary ownership: `packages/access-router-client/src/interface.ts`;
`src/types.ts`; `src/services/model-service.ts`; `src/adapter.ts`;
`src/correlated.ts`; client protocol/defaults/type fixtures and shipped docs.
Paths after the first are relative to the client package.

Finding: typed client options already omit `lean`; generic root metadata and
transport customization can still carry arbitrary keys. Server-side enforcement
is necessary regardless of what client builders emit.

References: client evidence above;
`packages/access-router-client/test/access-router-client.protocol-parity.integration.test.ts`;
`packages/access-router-client/test/access-router-client.bnd10-defaults.integration.test.ts`.

Requirements:

1. Keep supported list/read/basic/advanced/default option types free of hydration
   settings. Add focused negative consumer assertions; do not invent a replacement
   client setter or a server-only configuration dependency in browser code.
2. Verify direct requests, `group()`, and subquery/include conversions do not
   synthesize hydration controls from ordinary options or inherited defaults.
   Exercise stale JavaScript inputs and modified broad root metadata against the
   server contract. Keep protocol cleanup contextual rather than recursively
   deleting business properties named `lean`.
3. Update any stale diagnostic wording and documentation about server hydration.
   Preserve lazy request ownership, grouped result ordering, projected results,
   callbacks, and the client's independent save-capable `Model` wrapping behavior.
4. Production changes are needed only where inspection/tests establish a mismatch;
   a verified already-correct builder should not be rewritten for symmetry.

Acceptance criteria:

- Direct and grouped integration tests run against the updated sibling server,
  including list/read and a nested target, with server-selected hydration.
- Typed APIs/defaults expose no hydration knob; extra JavaScript metadata cannot
  regain control at the server. Valid business data is preserved.
- Strict NodeNext/Bundler declarations and the existing browser/packed-consumer
  checks pass without introducing server runtime imports into the client bundle.

Verification: V1 client protocol-parity, defaults, adapter/grouping, correlated
includes and focused negative type fixtures; V2 client typecheck/test gate.

#### HYD-04 implementation record

- Inspected the actual option interfaces, adapter/service defaults merge and
  normalization, all five basic/advanced list/read builders, `replaceSubQuery`,
  correlated capture/conversion and broad grouped root metadata. Their positive
  option bags already omit hydration controls. No option/type/builder rewrite or
  client hydration setter was necessary; existing defaults ownership, lazy claims,
  callbacks, ordering, projections and client `Model` wrapping remain unchanged.
- Added `packages/access-router-client/test/access-router-client.hydration.integration.test.ts`
  with **30 cases** against the built sibling server and real MongoDB. Query
  middleware observes both Mongoose lean options and fetched document instances;
  raw inserts omit a schema default to distinguish mode-sensitive values. Both
  server modes cover direct/grouped basic and advanced list, identifier/filter
  reads, stale adapter/service/per-call options (true/false/undefined/omission),
  target-owned list/id/filter `$$sq` with an opposite-mode parent, fixed-lean
  legacy/converted read/list includes, and modified root/subquery metadata.
  Nonempty raw correlated options still reject before any source/target query.
  Business `lean`/`hydration` filters (with a decoy row), selection, persisted
  create/update data and nested task replacement data survive. Assertions also
  retain zero preparation HTTP, one grouped round trip, callback/result order,
  reversed execution order, grouped ownership, projection and `Model` wrappers.
- Extended `test/access-router-client.correlated-includes.unit.test.ts` with
  **nine cases**: all eight supported execution-option rejections remain intact;
  stale hydration keys/defaults cannot enter basic/advanced `$include()` payloads,
  while business references/selections survive with zero HTTP. Updated the stale
  diagnostic in `src/correlated.ts` to describe server-controlled hydration,
  access and fallback. This wording-only change is the only production edit.
- Extended `test-decl-consumer/decl-consumer.strict.test.ts` and
  `test-packed-consumer/consumer/consumer-types.ts` with negative basic/advanced,
  descriptor, adapter/service default and server-type-export assertions plus
  positive business-data cases. Installed tests use real packed declarations,
  strict NodeNext/Bundler resolution and no source-path remapping. Added minimal
  server-ownership/migration wording in client `README.md` and `llms.txt`; no new
  executable documentation blocks or server runtime dependency. Paths in this
  and the preceding bullet after the first are relative to the client package.

Verification (repository root; foreground commands, serialized builds/tests;
2026-10-16; prior HYD-01–HYD-03 changes retained):

- `pnpm --filter @web-ts-toolkit/access-router-client... build` **passed**, rebuilding
  client/server and their four shared dependencies, including declarations.
- Final V1 command below **passed: 9 files / 276 tests** (9.54 s), after all
  executable edits. The initial focused run also passed the same totals; later
  fixture edits moved reset points before construction to strengthen zero-HTTP
  assertions and applied formatting, without production behavior changes.

  ```sh
  pnpm --filter @web-ts-toolkit/access-router-client exec vitest run --config ../../vitest.config.ts test/access-router-client.hydration.integration.test.ts test/access-router-client.protocol-parity.integration.test.ts test/access-router-client.bnd10-defaults.integration.test.ts test/access-router-client.adapter.integration.test.ts test/access-router-client.clc03-grouped-config.unit.test.ts test/access-router-client.correlated-includes.unit.test.ts test/access-router-client.correlated-includes.integration.test.ts test/access-router-client.packed-consumer.test.ts test-decl-consumer/decl-consumer.strict.test.ts
  ```

- `pnpm --filter @web-ts-toolkit/access-router-client typecheck` **passed**: dependency
  rebuild, source/test-fixture checks and strict NodeNext/Bundler declarations.
- `pnpm --filter @web-ts-toolkit/access-router-client test` **passed: 45 Node files /
  954 tests** (14.16 s), then **1 jsdom file / 10 tests** (1.55 s). The script first
  repeated the passing full typecheck. Includes packed CJS/ESM/strict consumers,
  staged pack dry-run/export checks, compiling documentation and the built-ESM
  browser smoke. Existing Vite native-config loader warnings only.
- Tests/typechecks used `TMPDIR=<repo-root>/_tmp-hyd04` (substitute the checkout
  root); `git check-ignore _tmp-hyd04` confirmed this repo-local temporary root is
  ignored. Packed fixture teardown removed consumer trees; remaining test cache
  was cleaned after verification.
- `pnpm exec eslint packages/access-router-client/src/correlated.ts packages/access-router-client/test/access-router-client.hydration.integration.test.ts packages/access-router-client/test/access-router-client.correlated-includes.unit.test.ts packages/access-router-client/test-decl-consumer/decl-consumer.strict.test.ts packages/access-router-client/test-packed-consumer/consumer/consumer-types.ts`
  **passed**. `pnpm exec prettier --check` with those same five paths **passed**
  after formatting patches. `git diff --check` and an explicit trailing-whitespace
  scan of the two untracked HYD-04 deliverables (new integration suite and this
  record) **passed**.
- Built `dist/index.d.mts` inspection confirms list/read/basic/advanced/default
  declarations expose no hydration control/type. Built `dist/index.mjs` contains
  no server-runtime, Mongoose or `node:` imports; the source production diff adds
  no import. No generated output was hand-edited.

Completion: all HYD-04 requirements and acceptance criteria are satisfied. Changed
only the seven client files identified above and this task record. **HYD-05 is
ready** for its fresh implementation session; HYD-05 and HYD-06 remain pending.
No blocker remains. Verification covers installed peers, bounded fixtures and
jsdom, not a real-browser/peer-version matrix, universal response parity or
performance. Decorator migration, expanded coordinated documentation and final
workspace/publication gates remain with HYD-05/HYD-06. No staging, commit or
publication was performed.

### Task HYD-05: Carry server hydration configuration through decorators

Status: completed

Assigned: HYD-05 implementation session (sequential execution; HYD-04 coordinator-reviewed).

Kind: improvement

Priority: P2 — decorator-based applications need the same configuration and migration path.

Dependencies: HYD-04.

Primary ownership: `packages/access-router-deco/src/decorators/class.decorators.ts`;
`src/decorators/property.decorators.ts`; `src/factory.ts`; `src/property-options.ts`
if needed; decorator consumer/bootstrap/hook tests and README. Paths after the
first are relative to the decorator package.

Finding: decorator options inherit server types and are passed through runtime
setters, but property decorators validate only selected scalar values. New
configuration must have the same behavior whether provided directly or via metadata.

References: decorator evidence above;
`packages/access-router-deco/test/property-contracts.test.ts`;
`packages/access-router-deco/test/cross-path.integration.test.ts`;
`packages/access-router-deco/test/hook-adapter.contract.test.ts`.

Requirements:

1. Support the chosen model configuration through existing `@Router`, per-model
   `@RouterOptions`, and `@ModelOption` paths. Exercise default-provider/scoped
   default decorators only if HYD-01 puts the setting in that supported scope.
2. Verify class/provider/property precedence, runtime isolation, and bootstrap
   rollback for invalid configuration. Reuse canonical server validation rather
   than implementing competing resolution logic in the factory.
3. Demonstrate that decorated output hooks receive plain views and lifecycle hooks
   retain their required document arguments. Hydration must not become a new hook
   parameter or a per-request decorator control.
4. Publish a compiling configuration/migration example, including the chosen fate
   of old `defaults.*Options.lean` values.

Acceptance criteria:

- Installed decorator consumers can configure the server setting with accurate
  inherited types and documented scope; obsolete per-call types are not resurrected.
- A bootstrapped route/service observes the configured query mode and resists old
  wire overrides. Invalid settings follow canonical validation/rollback behavior.
- Existing hook injection, ownership, registration ordering, and packed-consumer
  tests pass. No new dedicated hydration decorator is required.

Verification: V1 decorator strict-consumer, property-contracts, factory/bootstrap,
cross-path and hook-adapter tests; V2 decorator gate after rebuilding the server.

#### HYD-05 implementation record

- Inspected `src/decorators/class.decorators.ts`,
  `src/decorators/property.decorators.ts`, `src/property-options.ts` and
  `src/factory.ts` in `packages/access-router-deco`. Existing inherited server
  types and factory forwarding already carry D1 configuration to the canonical
  runtime setters. **No production change, dedicated decorator, duplicate
  validation/resolution, or server blocker was necessary.** Bounded scalar
  property validation, hook registration, ordering and scope behavior are intact.
- Added `test/hydration-configuration.test.ts` with **60 cases**: default-provider
  ordering in both permutations; class/provider/same-class-property precedence;
  shallow record replacement; all five dotted members; whole/member `undefined`;
  non-broadcast starting defaults; six configuration paths rejecting invalid
  records. Setter instrumentation checks the snapshot immediately on rejection,
  before factory rollback; package/runtime/OpenAPI/app state is then restored and
  corrected retries mount exactly once. Dotted invalid values/keys and obsolete
  whole/bucket/dotted `defaults.*Options.lean`/`hydration` writes retain canonical
  path-bearing migration errors.
- Added `test/hydration.integration.test.ts` with **19 real-MongoDB cases**, reusing
  the sibling server's database harness. Query middleware observes Mongoose lean
  options and fetched document instances, not just plain JSON. Both modes run
  through `@Router`, per-model `@RouterOptions`, scoped properties on both model
  roles, starting default providers and `@DefaultModelOption`. Direct advanced
  list/filter reads, GET identifier reads, raw root list/read batches and internal
  `find`/`findOne`/`findById` resist omitted/true/false stale wire/service controls.
  Raw seeds omit a schema default; a decoy preserves meaningful business-field
  filter coverage. Same-name factories retain independent configuration, and fresh
  calls on a retained service observe only its owning runtime's updates.
- The integration suite verifies plain `@Document()` output/allowed-payload views,
  private permissions-stage input versus trimmed decoration, unchanged request/
  permissions/context/class-instance injection, and live lifecycle documents for
  update/create/delete hooks with working setters and persisted mutation. Output
  contexts remain their existing pruned views, not the private permissions-stage
  object. Both modes with/without the optional plugin retain the non-enumerable
  finalized alias at a dotted metadata path; stripping suppresses it.
- Added `test/hydration-consumer.types.fixture.ts`, registered by
  `test/strict-consumer-types.test.ts` and
  `test/packed-consumer-compatibility.test.ts`. Real legacy decorators accept
  configuration and exact dotted keys; negative assertions reject wrong scopes,
  invalid records, retired per-call options and legacy model defaults. Existing
  property-value typing limitations are not misrepresented as decorator checking.
  Strict NodeNext/Bundler consumers use installed declarations, without source
  path remapping. Packed consumers also compile the exact README migration block.
- Updated shipped `README.md` with the five-method matrix, supported decorators,
  shallow precedence/default ownership, canonical validation/rollback, explicit
  `defaults.*Options.lean` mapping, inert wire controls, value caveat, alias and
  lifecycle contracts. `test/documentation-examples.test.ts` compiles that block
  in NodeNext/Bundler; the existing executable quickstart stays unchanged. All
  paths after the first bullet are relative to `packages/access-router-deco`.

Verification (repository root; 2026-10-17; foreground commands and serialized
build/test execution; prior HYD-01–HYD-04 changes preserved):

- `pnpm --filter @web-ts-toolkit/access-router-deco... build` **passed**, rebuilding
  decorator/server and the four shared dependency packages, including declarations.
- Initial diagnostic command
  `TMPDIR="$PWD/_tmp-hyd05" pnpm --filter @web-ts-toolkit/access-router-deco exec vitest run --config vitest.config.ts test/hydration-configuration.test.ts test/hydration.integration.test.ts test/strict-consumer-types.test.ts test/documentation-examples.test.ts`:
  **2 files passed / 2 failed; 83 tests passed / 7
  failed**. Corrected fixture assumptions: `ModelRequest` is an advanced export,
  default-provider declarations do not expose per-model `defaults`, decoration
  executes through the public wrapper, and field-metadata membership queries are
  independently fixed lean. Follow-up
  `TMPDIR="$PWD/_tmp-hyd05" pnpm --filter @web-ts-toolkit/access-router-deco exec vitest run --config vitest.config.ts test/hydration.integration.test.ts test/strict-consumer-types.test.ts`:
  **1 file passed / 1 failed; 20 tests passed / 4 failed**, identifying distinct
  private/output contexts. First broad V1 (same command as final V1 below):
  **10 files passed / 1 failed; 321 tests passed / 4
  failed**, identifying separately captured permissions objects across those
  phases. Corrected only the probes to preserve existing contracts; these are
  diagnostic failures, not production defects or the passing gate.
- Final V1 command below **passed: 11 files / 325 tests** (39.14 s), after all
  executable edits, including installed strict/packed consumers and migration docs:

  ```sh
  TMPDIR="$PWD/_tmp-hyd05" pnpm --filter @web-ts-toolkit/access-router-deco exec vitest run --config vitest.config.ts test/hydration-configuration.test.ts test/hydration.integration.test.ts test/strict-consumer-types.test.ts test/property-contracts.test.ts test/factory.test.ts test/bootstrap-transaction.test.ts test/bootstrap-routes.integration.test.ts test/cross-path.integration.test.ts test/hook-adapter.contract.test.ts test/documentation-examples.test.ts test/packed-consumer-compatibility.test.ts
  ```

- `TMPDIR="$PWD/_tmp-hyd05" pnpm --filter @web-ts-toolkit/access-router-deco test`
  **passed: 20 files / 646 tests** (Vitest 38.69 s). The script first rebuilt the
  full dependency closure and passed `tsc --noEmit -p tsconfig.typecheck.json`.
  This is also V2 decorator typecheck evidence. Existing role/scope, inheritance,
  symbol/wrapper/sparse-injection, registration-plan, ownership, transactional
  bootstrap, documentation and packed ESM/CJS regression gates all passed.
- `pnpm exec eslint packages/access-router-deco/src packages/access-router-deco/test`
  **passed**.
- `pnpm exec prettier --check packages/access-router-deco/test/hydration-configuration.test.ts packages/access-router-deco/test/hydration.integration.test.ts packages/access-router-deco/test/hydration-consumer.types.fixture.ts packages/access-router-deco/test/strict-consumer-types.test.ts packages/access-router-deco/test/documentation-examples.test.ts packages/access-router-deco/test/packed-consumer-compatibility.test.ts`
  **passed**, after formatting patches. `git diff --check` **passed**.
- Built `dist/index.d.ts` inspection confirms decorators retain their inherited
  server option types and exact scoped-key signatures; installed/packed fixtures
  verify the resulting configuration and retired-option boundaries. No generated
  output was hand-edited. Current peers: Node `26.10.0`, Mongoose `9.9.2`,
  mongodb-memory-server `11.3.0`, Vitest `4.1.11`, TypeScript `6.0.3`.
- Tests used `TMPDIR=<repo-root>/_tmp-hyd05`; substitute the checkout root for
  `<repo-root>` (`$PWD` in the commands is that checkout). `git check-ignore
_tmp-hyd05` confirmed the temporary root is ignored. Consumer fixture teardown
  removed installations; the remaining test-owned compile cache and temporary
  root were then removed after checking that they contained no other files.
- An explicit `Path.read_text().splitlines()` trailing-whitespace scan of all
  **four added deliverables** (the three `test/hydration*.ts` files and this task
  record) **passed**. A whole-record privacy scan also confirmed no machine-local
  paths or session identifiers. These untracked files are absent from ordinary
  `git diff --check`; both checks are recorded separately.

Completion: all HYD-05 requirements and acceptance criteria are satisfied. Changed
only decorator `README.md`, the three new hydration fixtures, the existing strict,
packed and documentation consumer tests, and this task record. Runtime/source and
declaration shapes already flowed correctly; no production/API change was needed.
Final V1/V2 evidence is at the same executable revision; subsequent changes only
record verification/handoff. **HYD-06 is ready for its fresh implementation session
after coordinator review; its status remains pending.** No external blocker, git
staging, commit or publication was performed.

Limitations/handoff: current installed peers and bounded fixtures are verified,
not a full peer-version matrix, universal value parity or performance. The broader
server/client README/llms migration, final cross-package review and V3/V4 workspace
and publication-content gates remain HYD-06; they were not run or claimed here.

### Task HYD-06: Finish coordinated migration docs and integration verification

Status: completed

Initial blocker (now resolved): V3 `pnpm test` stopped in the unrelated
`@web-ts-toolkit/express-request-attestation` live Redis suite because Docker was
unavailable in this WSL distro. A fresh diagnostic after the user's continuation
confirmed Docker Desktop client/server are now available; no infrastructure install
or unrelated-package edit was performed here. The final unmodified full workspace
test, subsequent lint/server typecheck, all scoped gates and V4 passed to completion.

Assigned: HYD-06 independent integration/review session (fresh sequential session;
HYD-01 through HYD-05 completed and coordinator-reviewed). This reviewer did not
implement the preceding production changes. No additional delegation is authorized
or needed.

Kind: improvement

Priority: P2 — complete the cross-package contract and release evidence together.

Dependencies: HYD-05.

Primary ownership: READMEs and existing `llms.txt` files in the three packages;
package declaration/docs/export/packed-consumer fixtures; this task record.

Finding: the server README currently advertises `lean` as a service/root option;
existing defaults and alias examples will otherwise describe the retired API.
Cross-package changes require verification against built, installed declarations.

References: `packages/access-router/README.md` (configuration layers, transport
table, names with different jobs, optional permissions plugin);
`packages/access-router/test/documentation-examples.test.ts`;
`packages/access-router-client/test/access-router-client.docs.compile.test.ts`;
`packages/access-router-deco/test/documentation-examples.test.ts`;
the three package manifests and packed-consumer tests.

Requirements:

1. Publish explicit migration/release notes in shipped package documentation:
   removed per-call options; server configuration and default matrix; old wire
   behavior; old defaults migration; permissions-alias decision; Mongoose
   hydration/value caveat. Include direct-server and decorated configuration examples.
2. Remove stale public-option promises from JSDoc, generated declarations and
   OpenAPI by changing their sources. Classify remaining `lean` references as
   low-level Mongoose behavior, compatibility tests, or migration history; do not
   mechanically remove raw database queries or historical task evidence.
3. Check the final matrix across ordinary server services, direct HTTP, raw root
   batches, client direct/grouped calls, and decorator-configured routes. Review
   both configured modes, nested targets, live-document writes, metadata and
   contexts using the earlier tasks' evidence.
4. Run V3/V4, record exact results at the final revision/worktree state, and audit
   every acceptance criterion. New code after a passing check invalidates the
   affected evidence. Report external/workspace failures accurately and resolve
   in-scope failures before marking completion.

Acceptance criteria:

- All three installed-package APIs, docs, schemas, and runtime behavior describe
  one hydration contract. Migration examples compile using shipped declarations.
- Final required checks pass with serial builds/tests and no unsupported claim
  that hydration never affects values or that a speedup was measured.
- All task statuses and completion evidence agree with delivered changes; unresolved
  prerequisites remain explicitly blocked rather than being counted as complete.

Verification: V3/V4; reuse valid targeted evidence from HYD-01 through HYD-05 and
rerun affected checks only when later changes invalidate it.

#### HYD-06 execution record

- Started by reading D1–D5, preceding implementation/verification records and the
  actual shared dirty worktree. Reviewed source, new runtime/type fixtures and
  shipped declarations independently before finalizing documentation. Existing
  work is retained; no staging, commits or publication. Scope remains the three
  packages and this record. Any necessary outside-scope fix will be recorded here
  before implementation.
- At session start, V3/V4 had not run; prior package results above were treated as
  historical evidence, not completion of HYD-06. Actual final results are below.
- Finished server README/llms migration/default and fixed-stage matrices, shallow
  ownership/validation/capture, defaults/service-instance translation, inert wire
  versus strict correlated controls, raw-parent/lifecycle modes, value caveat and
  expanded alias semantics. Corrected the runnable README's stale lean option to
  model configuration. Added high-value shipped JSDoc and exact README migration
  compilation to the real packed-consumer harness (Bundler and NodeNext ESM/CJS),
  plus private hydration/helper export checks. Client/decorator shipped additions
  already agree; no further production behavior or outside-scope changes needed.
- Independent acceptance review (actual sources, declarations and test assertions,
  not only preceding reports): `test/hydration-configuration.test.ts` and runtime
  setters enforce D1 atomic/plain-record/shallow/undefined behavior;
  `test/hydration-characterization.integration.test.ts` observes all five D2 modes,
  both fallbacks, parent populate, fixed includes/raw parents/subdocument visibility,
  live writes, schema values and D3 legacy defaults/inert getters. Retained-owner
  tests suspend each public/internal method and prove old capture/fresh-call modes
  with another ambient runtime. Request-boundary/OpenAPI tests cover direct GET/body,
  raw root dispatch, target-owned $$sq, strict correlated controls, business fields
  and no execution data in contexts/DTOs. D5 assertions cover descriptor/JSON/spread,
  mode/plugin independence, dotted/canonical paths, stripping/pruning, collisions,
  task/include copies and no related metadata synthesis. Paths in this bullet are
  relative to `packages/access-router`.
- Read the actual client hydration integration and installed negative-type fixtures:
  direct/grouped basic/advanced reads/list, nested targets, converted/legacy includes,
  modified metadata, zero-HTTP preparation, grouping order/callbacks/ownership,
  projections, wrappers and business writes remain covered. Read decorator
  configuration/integration/installed fixtures: six configuration paths, defaults
  ordering, precedence/rollback, both query modes, isolated factories, plain output
  versus live lifecycle injection and alias metadata are substantive assertions.
  Public root/advanced configuration exports and client/decorator declarations were
  inspected; final rebuilt declaration/content review and V3/V4 results follow.
- Final commands used ignored `TMPDIR=<repo-root>/_tmp-hyd06` (runtime `$PWD`
  denotes the checkout); `git check-ignore _tmp-hyd06` passed. Builds/tests were
  sequential and foreground with no command timeout.
- `TMPDIR="$PWD/_tmp-hyd06" pnpm build` **passed** to final workspace completion.
  Existing Vite native-config and application chunk-size warnings were non-fatal.
- `TMPDIR="$PWD/_tmp-hyd06" pnpm test` **failed (exit 1)** before the three scoped
  package suites. Preceding suites passed: asset-inliner **38 files / 772 passed,
  1 todo**; starter **18 / 339**; OIDC vault **36 / 2017**; attestation Node lane
  **18 / 618**. Attestation Redis then reported **1 failed file / 2 failed suites,
  62 skipped tests**: both `docker run` calls for `redis:6.2-alpine` and
  `redis:7.2-alpine` failed. The skipped cases are failed setup, not passing coverage.
  Diagnostic `docker version` **failed (exit 1)** with “The command 'docker' could
  not be found in this WSL 2 distro” and Docker Desktop WSL integration guidance.
  No existing unrelated failure is inferred from an unrun baseline: this is a
  demonstrated environment prerequisite failure, outside the hydration change.
  Foreground process completed. Scoped package suites then ran sequentially because
  root fail-fast never reached them; they do not substitute for a passing V3 root gate.
- `TMPDIR="$PWD/_tmp-hyd06" pnpm lint` **passed** over the whole repository.
- `TMPDIR="$PWD/_tmp-hyd06" pnpm --filter @web-ts-toolkit/access-router typecheck`
  **passed**, including its server/dependency rebuild and source `tsc --noEmit`.
- `TMPDIR="$PWD/_tmp-hyd06" pnpm --filter @web-ts-toolkit/access-router test`
  **passed: 117 files / 2815 tests** (551.95 s). Includes all hydration/owner/wire/
  alias/authorization regressions, strict installed declarations, docs, exports,
  actual transformed tarball and release-artifact consumers. The new README migration
  compiles exactly as shipped in Bundler and NodeNext `.mts`/`.cts`; the authorization
  example also executes after replacing its obsolete lean option with model config.
- Initial `TMPDIR="$PWD/_tmp-hyd06" pnpm --filter @web-ts-toolkit/access-router-client test`
  completed its full typecheck, then **44 files passed / 1 failed; 912 passed /
  42 skipped** (12.64 s). MongoDB setup for the existing correlated-includes suite
  failed with “Port already in use”; browser lane did not run. This is retained as
  diagnostic evidence, not a passing gate. **Unchanged retry of the identical command
  passed: 45 Node files / 954 tests** (11.68 s), then **1 jsdom file / 10 tests**
  (0.80 s). Source/test-fixture/strict NodeNext/Bundler typechecks, actual packed
  CJS/ESM consumers, documentation compile and built-ESM browser smoke all passed.
  No port workaround, test weakening or production fix was introduced.
- `TMPDIR="$PWD/_tmp-hyd06" pnpm --filter @web-ts-toolkit/access-router-deco test`
  **passed: 20 files / 646 tests** (36.57 s), after the dependency rebuild and
  decorator source typecheck. Includes actual packed CJS/ESM/strict consumers,
  compiling migration examples, canonical bootstrap/rollback and lifecycle contracts.
- After Docker became available, the unchanged full `pnpm test` rerun again
  **failed (exit 1)** before Access Router: attestation Node lane **17 files passed /
  1 failed; 617 tests passed / 1 failed** (5.03 s). Its native Fetch omitted-init
  authentication-retry case expected all captured requests' `signal.reason` to equal
  the caller's abort reason (`test/fetch-ownership.cases.ts`, assertion near line 189).
  The same 618-test Node lane passed during the earlier root invocation; this result
  is not attributed to hydration or declared a baseline defect. Live Redis was not
  reached. An unchanged diagnostic
  `TMPDIR="$PWD/_tmp-hyd06" pnpm --filter @web-ts-toolkit/express-request-attestation test:node`
  then **passed: 18 files / 618 tests** (5.11 s), followed by the final root retry
  below. No unrelated production/test fix or bypass was introduced.
- V4 `npm pack --dry-run --json` **passed** from each package directory in order:
  `packages/access-router` **17 entries / 501379 packed bytes**;
  `packages/access-router-client` **7 / 115721**;
  `packages/access-router-deco` **6 / 59420**. Each includes README and built CJS/ESM
  plus both declaration formats; server/client also include llms.txt. These are
  workspace-manifest dry runs, not publication; the actual packed suites above
  separately exercise the real release transformation/installed consumers.
- Final built `.d.ts`/`.d.mts` inspection and a read-only Node/TypeScript-AST check
  **passed**: all three manifests' JS/declaration paths exist; server root/advanced
  export the exact two configuration types and five dotted setter entries; public/
  internal/default/raw-parent/global/data/root/context interfaces expose no direct
  hydration control. New migration/alias JSDoc survives emission. Client declarations
  still omit server types/controls; decorator signatures inherit canonical server
  model/default types. Built CJS/ESM root/advanced runtime export checks keep execution,
  normalization and alias helpers private; client ESM has no server/Mongoose/Node
  runtime import. Strict consumers and runtime context tests above cover the same
  boundaries without source-path remapping. Generated output was never hand-edited.
- Remaining `lean` references were classified, not mechanically deleted: `src/model.ts`
  and fixed query stages are private Mongoose mechanisms; normalization/virtual/raw
  lifecycle comments describe input behavior; compatibility probes deliberately send
  retired keys; shipped prose uses them only for migration/value distinctions. Prior
  historical task evidence remains intact. No additional cross-scope fix was needed.

#### HYD-06 acceptance and aggregate disposition

Continuation update: a fresh `docker version` **passed**, reporting client/engine
`29.7.2` and Docker Desktop `4.87.0`. The environment prerequisite changed externally
after the failed run. HYD-06/aggregate were reopened as `in_progress` for full
verification without skipping live Redis. The temporary test-owned directory was
inspected and cleaned after the earlier scoped gates, then recreated for this rerun.

Final gates (2026-10-17; repository root unless a package directory is named;
HEAD `c938b84` plus all accumulated HYD-01–HYD-06 worktree edits, no executable edits
after verification began):

- `TMPDIR="$PWD/_tmp-hyd06" pnpm test` **passed (exit 0)** through the final app suite.
  Collected the foreground command's actual final completion, not a running-process
  report. Its **34 Vitest invocations total 542 passing file-runs / 13197 passing
  test-runs / 1 todo** (the asset-inliner todo); counts include repeated peer/runtime
  lanes, not unique files. No failing or skipped test lane is counted as passing.
  The formerly blocked attestation lanes all passed: Node **18 / 618**, live Redis
  **1 / 62**, live MongoDB **1 / 31**, browser **3 / 141**, packed **1 / 12**.
- Scoped results within that same final root run: server **117 files / 2815 tests**
  (786.50 s); client **45 Node files / 954 tests** (17.91 s) plus **1 jsdom file /
  10 tests** (1.45 s); decorator **20 files / 646 tests** (54.17 s). Includes actual
  installed/packed docs/exports/strict NodeNext/Bundler tests, not just dry-run packs.
  Client and decorator scripts also passed their source/consumer typechecks.
- After that full command finished, `TMPDIR="$PWD/_tmp-hyd06" pnpm lint` **passed**,
  then `TMPDIR="$PWD/_tmp-hyd06" pnpm --filter @web-ts-toolkit/access-router typecheck`
  **passed**, rebuilding the server closure and checking source against final types.
  The earlier passing full `pnpm build` is valid at this unchanged source revision.
- Repeated V4 `npm pack --dry-run --json` sequentially from each of the three package
  directories after the final typecheck: all **passed**, with the same entry counts,
  byte sizes and content hashes as the preceding V4 result (server 17, client 7,
  decorator 6). Thus final regenerated JS/declaration/docs contents match the reviewed
  and installed-consumer-tested publication surfaces. No generated output was edited.
- `git diff --check`, Prettier on all HYD-06-touched TypeScript files, and an explicit
  trailing-whitespace scan of all **11 untracked deliverables** **passed**. The whole
  task-record privacy scan found no machine-local paths or full session identifiers.
  Verified all seven current statuses are completed and all five DoD items checked.
  Final inspection found only test/cache entries in the HYD-06-owned temporary root
  and zero active builds/tests or processes using it; that root was then cleaned.
  Subsequent edits only finalize this shared evidence, not executable code.

- **Delivered/verified:** coordinated installed-package docs/API/schema agreement,
  compiling direct/decorated migration examples, independent combined contract review,
  all three package suites/types/packed consumers, workspace build/test/lint, server
  typecheck and V4. All executed commands finished in the foreground; no mandatory
  build/test is still running. No executable edits followed the final passing checks.
- **All acceptance/DoD met:** D1–D5 match the implemented runtime, HTTP/nested/client/
  decorator paths and shipped types/docs. HYD-01 through HYD-06 and aggregate status
  are now **completed** only after the successful final full gate. No unresolved
  prerequisite or in-scope fix remains. Earlier failures remain diagnostic evidence,
  not erased, bypassed or mislabeled as successful runs.
- **HYD-06 changes:** server `README.md`, `llms.txt`, JSDoc in `src/index.ts`,
  `src/interfaces/root.ts`, `src/interfaces/service-find.ts`, `src/interfaces/service-list.ts`,
  `src/interfaces/service-read.ts`, `src/plugins.ts`, `src/services/service.ts`, and
  `test/packed-consumer-compatibility.test.ts`, plus this record. Paths after the
  package name are relative to `packages/access-router`; prior client/decorator and
  server implementation changes remain intact. No further runtime behavior change.
- **Limitations:** installed peers and bounded schema/plugin fixtures only; packed
  suites exercise their existing representative peer pairs, not a full version
  matrix. No universal value parity, measured speedup, real-browser matrix, staging,
  commits or publication is claimed. No unrelated package was changed.

Coordinator final audit: reviewed the final HYD-06 evidence and changed-file scope;
`git diff --check` passed. A separate status/record scan verified all six task
statuses and the aggregate completed, all five DoD items checked, and all 61
changed/new files confined to the three packages and this record. All 11 new files
have final newlines and no trailing whitespace; the task record contains no
machine-local paths or full session identifiers. No executable changes followed
the final passing gates; this addition records the coordinator's acceptance.

## Definition of done

- [x] HYD-01's decisions are recorded and HYD-01 through HYD-06 are completed with evidence.
- [x] Supported callers cannot select hydration through per-call or wire options;
      server configuration and necessary internal choices determine fetch behavior.
- [x] Public types/defaults have a clear migration, raw-parent behavior is explicit,
      and result permissions metadata does not depend on an undocumented caller switch.
- [x] Client and decorator integrations, current model/hook/output contracts, and
      required package/workspace/installed-consumer checks are verified.
- [x] No implementation or verification completion is implied by this task file's creation.
