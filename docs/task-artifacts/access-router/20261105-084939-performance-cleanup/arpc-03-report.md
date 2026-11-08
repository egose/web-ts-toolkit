# ARPC-03 — bounded sort-preparation investigation

## Decision and delivery status

**No production change for either candidate.** Narrower capture is not equivalent
under the current observation/override contract. Call-local membership reuse is a
distinct, potentially viable smaller candidate, but arbitrary snapshot results are
not proven immutable/pure and there is no targeted measurement supporting retention.

This delivers the source investigation, **not completed ARPC-03 acceptance**.
ARPC-01 remains the numeric dependency: its package baseline is delivered, but
useful timing calibration and sort-specific workload coverage remain unresolved.
The coordinator owns task status/dependency changes; this report does not silently
satisfy them. No performance, allocation, or non-regression claim is made.

Scope: sort eligibility in model `Service` READ/LIST, its snapshot copier and
virtual-path helpers, relevant existing tests, and the historical pitfalls below.
No builds, tests, probes, benchmarks, lint, production edits, new test files,
subagents, commits, or scratch files were produced. Runtime examples below are
**source-derived characterizations, not executed observations**. Possible concurrent
v2 calibration was deliberately left undisturbed.

## Provenance and existing evidence

- Task: [ARPC-03 requirements](../../../tasks/20261105-084939-access-router-performance-cleanup.md).
- Reviewed HEAD: `6c3ceee4433daf203d4625d70b0ef5c4b7009529`, with existing uncommitted
  ARPC-02 production edits and ARPC-01 harness/evidence work. These were not changed.
  The inspected `service.ts` diff changes finalizer wiring, not the sort/capture
  methods reviewed here. Line references describe that working tree; symbols are
  the durable anchors.
- Observed SHA-256 for the three primary source files:

  | File under `packages/access-router/src/` | SHA-256 |
  | --- | --- |
  | `services/service.ts` | `31c195f9c7e1409d5bb7b67f5411f3e2e697e6fa2e7bd451b600ca84e2e5b1ef` |
  | `services/base.ts` | `690e39eaa567e11eb8cc25e73031f8c0663cb1567fb60abc0237abfb9ea51983` |
  | `helpers/sort-policy.ts` | `42f3b4f24483f1c1903c27ac86ba96dbf455b461376e3e50585c0f7142b1edb2` |

- [ARPC-01 report](arpc-01-report.md) records passing package checks, not checks run
  by this investigation. Its v1 timing packet is mostly noise-blocked.
- [ARPC-01 work findings, item 5](arpc-01-work-findings.md) records one
  `captureVirtualSnapshot` call for READ and LIST, zero for CREATE/UPDATE, in both
  modes. It explicitly lacks nested/virtual/denied-sort and wide-unused-policy
  timing. `test/access-router-crud-work.unit.test.ts:28–43` spies on the already-bound
  receiver; a prototype spy installed after construction would miss that method.
  These counts do not measure membership-set allocations or the capture's CPU share.
- `scripts/benchmarks/access-router-crud-v2.md:72–77` also leaves explicit sort-heavy
  timing outside its current panels. A successful generic calibration alone would
  not close this gap. This report does not inspect or certify an active run's result.

## Current observable path

All source paths below are relative to `packages/access-router/src/`.

1. `services/service.ts`, `requestSortFields:512–529`, derives `_id` plus statically
   granted top-level permission-schema keys using the authenticated captured
   configuration and effective output access. Client selection is not a sort grant.
2. READ `#fetchOnePrepared:1531–1579` and LIST `findPrepared:1919–1981` already hold
   captured configuration. Each first removes top-level virtual leaves with
   `filterAllowedFieldsForVirtuals`, then calls `getEffectiveAllowedSortFields`.
   Sort preparation occurs after asynchronous query preparation, before adapter
   dispatch, and even for an omitted sort on paths reaching this point.
3. `getEffectiveAllowedSortFields:664–684` reads `this.options.sortableFields` and
   appends explicit grants **before its try/catch**. It preserves duplicates/order;
   it does not intersect extras with output visibility or the persisted catalog.
   Thus a denied-but-sortable persisted field remains eligible without being exposed.
4. Inside the try, it calls the receiver's `captureVirtualSnapshot()` once, filters
   every merged field through `isVirtualDbPath`, and then separately excludes root
   virtual leaves. Virtual registration, not getter applicability, controls exclusion.
5. Strict handling calls `validateSortFields`; strip handling calls
   `sanitizeSortFields`. Disallowed strict keys yield `bad_request` with
   `Sort field is not allowed: <field>` and pointer `#/sort`, before adapter use.
   Strip mode omits disallowed keys, but malformed syntax still errors. Nothing
   stripped preserves the helper's input reference; all stripped yields `undefined`,
   not a substituted default ordering. `id`/`_id` are independently allowed by these
   helpers. Do not redefine that existing special case in a virtual-set optimization.

### Capture, getters, natives, and Service overrides

`captureVirtualSnapshot:700–716` reads one options bag, evaluates these properties
in order, then calls `copyAuthorizationValue(..., true)`:

`permissionSchema`, `virtuals`, `docPermissions` (immediately passed through
`captureDocumentPermissionsDefinition`), `modelPermissionPrefix`,
`requireExplicitSelect`, `documentPermissionField`, `exposedDocPermissionKeys`,
`stripPermissionsField`, `disableFieldPermissions`.

Its defaults remain null/null, undefined hook, empty prefix, false explicit-select,
`_permissions`, undefined exposed keys, false strip, and true disable-fields,
respectively. A throwing earlier read/hook-definition capture prevents later reads
and the subsequent deep copy. Ordinary property getters on a custom options bag
can run here; **nested accessor properties encountered by the copier are rejected
without invoking their getter**. The normal options manager can materialize getters
earlier on storage, so setter input getters must not be mistaken for per-sort reads.

`acl/authorization-snapshot.ts:59–171` copies the entire constructed record, not
just its virtual registry. It preserves function identities without traversing
attached properties, freezes ordinary copied containers, detaches mutable natives,
and enforces structural/payload limits. Its native branches call Date `getTime`,
Buffer copying/coercion, RegExp source/flags and BSON materialization; Map/Set entries
are also recursively copied. These are potentially application-observable native
operations. Omitting an otherwise sort-unused branch can remove native execution,
validation failure, or an exception. Freezing the enclosing option object does not
make those observations irrelevant or native leaves immutable.

The default `options` getter uses `modelServiceOptions` to hold one options wrapper
per dispatch (`service.ts:322–365`; `acl/model-service-owner.ts:162–168`). This is
**not** a fresh runtime-options fetch at every sort. Nevertheless the late snapshot
is a new copy, distinct from the earlier authorization capture; native state and
custom option property reads can differ. Reusing the earlier call configuration
would remove that later boundary, even when registry values happen to compare equal.

`getModelRouterOptions` and `captureVirtualSnapshot` remain receiver-dispatched
methods. `Base` binds inherited/overridden methods to the actual instance
(`services/base.ts:551–558`; `acl/model-service-owner.ts:134–159`);
`test/service.internal.test.ts:37–46` already uses the protected options/adapter
override seam. A snapshot override may supply a different registry or throw, and
may return getter-bearing/mutable data rather than the default frozen copy. Calling
a base method directly, comparing a bound method to its prototype, or substituting
the call catalog would not preserve these observations. The public snapshot must
also remain detached, bounded inspection, not an authorization certificate.

### Two different fallback boundaries

- `helpers/sort-policy.ts:46–58` catches an `isVirtualDbPath` exception **per field**
  and keeps that field, while continuing the remaining predicates.
- `getEffectiveAllowedSortFields` catches a snapshot failure **or** a failure of the
  later root-leaf pass and returns the original `merged` array. This discards any
  partial filtering done inside the try; it does not reject the request or produce
  an empty allowlist. Initial captured-root filtering happened earlier, so this
  fallback is not necessarily the original permission-schema allowlist. Explicit
  extras were appended afterward and are still present in `merged`.
- Errors reading/spreading `sortableFields` occur outside that catch. Errors during
  initial authorization capture or the earlier root pass are not converted by this
  fallback either. A regression probe must reach the late boundary (e.g. a snapshot
  override or a late-changing native), rather than be rejected at entry first.

These existing fallback semantics are characterization requirements, not a proposal
to broaden them. Moving preparation outside a try, caching a failed classification,
or replacing per-field failure with whole-pass fallback would change behavior.

## Candidate A — narrower/call-captured virtual view: reject substitution

The private authorization configuration already has virtuals/catalog data, but its
reader does not perform the late public snapshot's option reads, hook-definition
capture, native copies or receiver dispatch. Copying only `{ virtuals }` also removes
the other observed branches and their failures. Retaining a call to the old method
and then ignoring its result would preserve neither an overriding registry nor the
intended avoided work. No equivalence proof was found: **keep the present capture**.

Nor is `catalog.virtualPaths` alone a drop-in predicate. Catalog construction
(`acl/field-catalog.ts:318–339`) checks safe paths, suppresses virtual container
traversal across references, and recognizes object `sub` containers differently
from the plain-object guard. The DB predicate also keeps the current scope while
walking ordinary persisted/numeric segments. A prefix set/trie would need to preserve
that behavior, not enforce a more intuitive but different path model.

## Candidate B — reusable scope membership: defer, independently of capture

`services/base.ts:82–173` resolves a scope and builds its leaf set for every visited
path segment; unless a leaf matched, it resolves/enumerates again for a container
set. Repeated fields/scopes repeat this construction, including empty sets when no
virtual registry exists. The final root pass constructs another leaf set. This is
source-visible repeated work, **not measured cost or a demonstrated speedup**.

Exact existing classification must survive any reuse:

- A leaf is an entry whose value is not `undefined` and is not a plain object with
  `'sub' in value`; the container test uses that plain-object/inherited-membership
  check. Leaf/container scans are separate `Object.entries` observations. A getter
  in an override registry can run twice and return different values. Scope lookup
  also reads `snapshot.virtuals`, container properties and `.sub` on each traversal.
- Containers change scope by appending `[name, 'sub']`. Non-container segments leave
  it unchanged; numeric segments are not normalized, skipped by schema lookup, or
  converted into scope names. Thus with root leaf `fullAddress` and container
  `contacts.sub.nick`, the predicate returns true for `fullAddress.city`,
  `profile.fullAddress`, `contacts.nick`, `contacts.0.nick`, and
  `contacts.other.nick`; `contacts` and `contacts.rank` are false absent other rules.
  These results follow the implementation, not just its explanatory comments.
- Any string containing `.sub.` is immediately virtual, even without a registry.
  Empty/non-string paths return false. Numeric-segment paths can classify here,
  but the sort syntax regex in `sort-policy.ts:16,23–24` rejects them later; do not
  turn classification handling into newly accepted public sort syntax.

A bounded future design could retain the exact existing snapshot invocation and
catch boundaries, then lazily reuse leaf/container membership **only for a privately
proved stable own-data scope graph from that returned snapshot**. Keep the original
predicate and repeated observations for mutable/accessor/proxy/exotic or otherwise
unproven override results. Proof must not invoke a getter/native hook speculatively
and then rerun it on fallback, mistake `Object.freeze` for deep/native purity, or
replace the inherited `sub` membership behavior. Keep the cache within that one
sort preparation; no service/request-global cache, row decisions, IDs, grants, or
source values. Preserve the final root pass unless its observations are also proved
redundant. Bound entries using the existing capture limits and avoid eager recursive
indexing of unvisited scopes.

This is a design boundary, not a proved/implemented algorithm. It may save too
little to repay admission/map setup on no-virtual, narrow, or singleton calls.
Consequently the retained choice is **no set-construction change now**, rather
than an unmeasured cache with an assumed equivalence/performance result.

## Focused characterization and measurement handoff

No new test was necessary for this documentation-only no-change decision. Proposed
new package test: `packages/access-router/test/sort-preparation-observations.unit.test.ts`
(not created, not run). Use real direct/public READ and LIST with a deterministic
adapter, both active modes, and instance-bound spies outside any timing loop:

| Proposed case | Required assertion |
| --- | --- |
| Late snapshot override | Receiver/arguments/count and adapter sort/errors use the returned registry, not the entry catalog; include public READ fallback. |
| Custom options getters | Record late property-read order separately from initial capture; throwing `docPermissions`/metadata getter stops later evaluation and uses merged fallback. |
| Native configuration leaf | Record late Date/Buffer/BSON observations separately from entry; a late throw or changed state must remain observable. Do not require invalid configuration to pass entry validation. |
| Per-field vs final-pass throw | One predicate failure keeps that field and continues; final root-pass failure restores the whole merged list. Throwing snapshot also uses merged; extra-option read errors do not. |
| Repeated mutable/accessor scope | Repeated paths/segments preserve getter multiplicity/order and changing leaf/container results; no result/failure cache on the legacy path. |
| Stable nested scope table | Pin the source-derived examples above, undefined leaves, empty containers, recursive containers, array/numeric forms, `.sub.` and persisted same-prefix siblings. |
| Persisted explicit grants | Denied-but-sortable persists as adapter order only; registered virtuals remain excluded even when explicitly sortable or inapplicable to this access. |
| Shape/default/error controls | String/object/tuple/Map, duplicate order, strict/strip/malformed, no sort vs explicit empty/default sort, identity aliases, and adapter-not-called on rejection. |

Existing inspected coverage: `sort-policy.unit.test.ts`,
`basic-list-sort.integration.test.ts`, `sort-options.integration.test.ts`,
`sort-field-authorization.integration.test.ts`, and
`virtuals-direct-operations.integration.test.ts` protect core sort/virtual behavior;
`query-snapshot-options.unit.test.ts` and `service-execution-capture.unit.test.ts`
protect captured-mode/ownership boundaries. They do not establish the late override,
getter/fallback trace matrix above. Proposed cases remain unverified.

If reconsidering B, first add real-service cases varying permission width, allowed
field count/path depth, repeated scopes and zero/few/many virtuals. Include absent
sort, empty/single/many LIST, READ hit/miss/fallback, strict/strip and explicit denied
persisted grants, with isolated/trusted direct/public paths. Count preparation
separately from timing; compare adapter sorts, errors, output and callback traces.
Extend the maintained harness with new matching fixture seals and preregistered
baseline-only calibration; current core/scale panels are not sort measurements.
Use task protocol P (seven paired rounds, two independent runs, usable fixed noise
gates, CPU/wall plus separate allocation/retention evidence and small controls).
Do not run any such work until the coordinator grants the serialized runtime slot.

Historical guardrails: QCPU-03 in
`docs/tasks/20261029-105358-access-router-query-cpu-follow-up.md:270–305` rejected
unproved full preparation hoisting; PIPE-03 in
`docs/tasks/20261029-211734-access-router-query-pipeline-overhead.md:276–319` records
eager/lazy indexing regressions and a narrower amortized alternative. These are
reasons to preserve observations and measure small scopes, not current timing.
The current owned architecture has changed: private readers wrap captured slices,
and `finalizer-preparation.unit.test.ts:131–159` explicitly rejects function-attached
hook slots as live configuration API. Do not import an obsolete historical lookup
contract into the proposed tests.

## Verification commands and limits

**Not run.** After all active calibration/build activity settles, from repository
root with installed Node >=24, pnpm and MongoDB test prerequisites, the coordinator
can run these sequential access-router-only checks. The first command creates a
fresh repository-local directory and sets an absolute TMPDIR:

```sh
export TMPDIR="$(mktemp -d "$PWD/_tmp-arpc-03-XXXXXX")"
git check-ignore "$TMPDIR"
pnpm --filter @web-ts-toolkit/access-router... build
pnpm --filter @web-ts-toolkit/access-router exec vitest run --config vitest.config.ts test/sort-policy.unit.test.ts test/basic-list-sort.integration.test.ts test/sort-options.integration.test.ts test/sort-field-authorization.integration.test.ts test/virtuals-direct-operations.integration.test.ts test/query-snapshot-options.unit.test.ts test/service-execution-capture.unit.test.ts
```

Add the proposed characterization file to that Vitest command only after creating
it. If production/test code is subsequently retained, task V2 remains:

```sh
pnpm --filter @web-ts-toolkit/access-router typecheck
pnpm --filter @web-ts-toolkit/access-router test
pnpm exec eslint packages/access-router/src packages/access-router/test
```

No root/grouped/downstream tests are needed or authorized. No numeric command for
the missing sort panel exists yet; do not present generic CRUD timing as that gate.
The no-change report does not invalidate the delivered package baseline or require
its redundant rerun, nor certify the other agent's later candidate changes.

Actual verification here is source/test/document review and read-only Git/source
identity checks, followed by report-reference/privacy/whitespace review. There are
no new raw runtime data, dependencies, executable snapshots, or scratch artifacts to
archive; this is a source-design report, not a self-contained measured reproduction
packet. Coordinator action: link this report and record investigation delivered,
with measured/dependency gates still pending unless the task scope is explicitly
revised to accept source-only no-change evidence.
