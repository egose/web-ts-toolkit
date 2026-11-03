> Historical document preserved from ignored task scratch storage.
> Scope and limitations: `docs/task-artifacts/access-router/README.md`. References to omitted
> artifacts are historical, not available execution prerequisites.

# OAR-09F-I — collection helper implemented under approved scoped budgets

Implemented, with focused verification passing. Ready for coordinator reconciliation
and a fresh sequential **F-V** documentation/artifact integration owner. This is not
OAR-09 performance acceptance, release acceptance or OAR-10.

Task: `docs/tasks/20261031-153020-access-router-owned-authorization-redesign.md`,
C1–C6 / OAR-09F / F-I / F-V. Read the repository instructions, both requested skills,
the complete approved proposal and current authorization paragraphs. The historical
proposal's awaiting-approval wording and the first owner's blocker/probes remain
unchanged. The subsequent user approvals, including the scoped-budget revision,
govern this implementation. No delegation or task/status edit.

## Public API and implementation

Exactly one new method, with the approved existing options:

```ts
// Base<TModel, TVirtuals>; inherited by Service and PublicService
pickAllowedFieldsMany<T>(
  rows: readonly T[], access: SelectAccess,
  options?: OutputFieldOptions<TModel, TVirtuals>,
): Promise<readonly FilteredOutput<T>[]>;

// Core
pickAllowedFieldsMany<T, TModel = unknown,
  TVirtuals extends object = Record<never, never>>(
  modelName: string, rows: readonly T[], access: SelectAccess,
  options?: OutputFieldOptions<TModel, TVirtuals>,
): Promise<readonly FilteredOutput<T>[]>;
```

- `FilteredOutput` is exported from root and the interface barrel, hence `/advanced`.
  Deep optional readonly string properties, conservative nullish array elements,
  string Map-to-record normalization, canonical Date/RegExp/Buffer, unknown other
  BSON/hydrated/depth-eight branches. `Document<unknown>` deliberately covers hydrated
  models with string `_id`, which default `Document` would miss. No supported-input,
  exact-selection, cardinality, frozen-native or authority certificate is implied.
- Core and router `getService`/`getPublicService` discovery is covered by the strict
  API fixture. Direct PublicService helpers are not generated HTTP operations.
- Existing single-row signatures, independent freshness, aliases and error purposes
  remain. No new aliases, DataService member, route, client option, preparer, handle,
  token, DTO authority, cross-call rule cache or second evaluator/normalizer engine.
- One synchronous receiving-owner/control admission and initialized actor/model/
  catalog/config/scope/policy capture precedes awaits and field predicates. Actor
  primitives precede native configuration exposure. `req.user` alone is not refresh.
- Dense ordinary outer arrays only, 0–1,000 inclusive; frozen/readonly accepted.
  Proxy rejection precedes traps; no source iterator is read. Indices are detached
  with own data definitions, and every non-null source is isolated before the FIRST
  synchronous predicate. Repeated references/IDs have independent sources, stages,
  native leaves and decision maps. Nullish positions have no stages/callbacks.
- The existing selection/evaluator/materializer handles each row with authenticated
  literal frozen EMPTY facts. Genuine embedded stages use their row-owned subtree.
  No DB, document hook, virtual execution, operation/row/related admission, reference
  provenance recovery or restoration is added. Negative EMPTY is not current facts.
- Existing request/runtime worker and shared hook-gate scheduling is reused, bounded
  by the minimum row/scheduler/gate limits (zero row workers for an empty collection).
  FIFO/reentry/depth and per-row sync-until-async field ordering remain. No persistence
  permit is held and there is no unbounded per-row Promise.all.
- One sticky publication owner stops new row/field admission, drains admitted library
  work and clears sources/stages/decisions/policy memos/catalog indexes/preparation.
  Late work cannot publish. Structural/native/budget poison is whole controlled 400,
  even when caught by a callback; ordinary field-body throws/rejections omit fields.
  No partial result, side-effect rollback, automatic retry or detached-closure wait.

## Budget scope — the approved exclusion is intentional

One **200,000-unit** ledger and one **16 MiB cumulative payload** ledger cover the
entire explicit operation, including initial preparation and all rows/phases.
Separate existing **20,000/depth-100** source/selected/fact/view owners remain; no
row, normalization, embedded, metadata or wire transition replenishes them.

Router-owned source/output/native/wire copies and explicit catalog, path and rule
buffers reserve their work/payload before copying/allocation. This includes row
preparation Sets/arrays, field-path lists, memo strings and non-owned initialized
actor-copy buffers; already-owned immutable actor views do not repeat that copy.
Actual repeated visits count again. Branded catalog preloads retain their capture
allowance without billing the SAME omitted visit twice; recipients debit a shared
ledger once for that visit, not once per recipient. Stage/memo allocation and attempted
decisions also debit. Trusted actor callbacks remain outside router accounting.

**Excluded:** opaque canonical Mongoose/native normalization internals and their
dependency-owned allocations/traversals, arbitrary trusted callback/closure effects,
and engine enumeration costs. This is **not** a total-memory, RSS, whole-normalization,
CPU-operation or sandbox cap. No raw-storage prescan purports to predict normalization.
Native configuration APIs retain canonical coercion behavior; returned storage is
admitted before the subsequent explicit router copy through the shared materializer.
Explicit router buffers/materializer work are not hidden in the exclusion.

Actual regressions prove/disclose:

- Canonical Mongoose performs a real **17 MiB Buffer.from** before a transform
  discards it; a tiny admitted result passes. Five opaque **4 MiB** copies also pass
  together when their returned row sources are tiny. These are observed particular
  copies, not total allocation or RSS observations.
- A returned normalized Mongoose result containing **17 MiB** fails before the next
  explicit router byte copy. Native configuration valueOf normalization is preserved
  once: a tiny returned buffer passes, an oversized return fails before our copy.
  That configuration probe records API return sizes, not hidden allocation counts.
- Real Buffer.from spies distinguish admitted source/output copies from the next
  denied copy. Actual whole helper calls hit **exactly 200,000** and **exactly 16 MiB**;
  the next slot/native byte rejects the operation. UTF-8 is counted, not character count.
- Router rule/path split buffers reject before split allocation. Code.scope, DBRef
  fields, Map entries, holes, native replacements and wire preparation share the row
  remainder. No serialize-to-discover-size or replacement hydration engine.

## Exact changes versus incoming bytes (not versus HEAD)

Authoritative files/hashes: `changed-files.json`, `current-source-identity.json`,
`incremental-source.diff`. **24 paths: 18 existing files modified, six new files.**

Public forwarding/type/export/JSDoc:

- `packages/access-router/src/core.ts`
- `packages/access-router/src/services/base.ts`
- `packages/access-router/src/interfaces/filtered-output.ts` **new**
- `packages/access-router/src/interfaces/index.ts`
- `packages/access-router/src/index.ts`

Shared runtime/private admission/accounting/lifetime:

- `packages/access-router/src/acl/authorization-snapshot.ts`
- `packages/access-router/src/acl/document-grants.ts`
- `packages/access-router/src/acl/document-stage.ts`
- `packages/access-router/src/acl/field-authorization.ts`
- `packages/access-router/src/acl/field-catalog.ts`
- `packages/access-router/src/acl/model-service-owner.ts`
- `packages/access-router/src/acl/output-field-filter.ts`
- `packages/access-router/src/acl/output-field-policy.ts`
- `packages/access-router/src/acl/output-helper-many-admission.ts` **new/private**
- `packages/access-router/src/acl/output-publication.ts`
- `packages/access-router/src/acl/output-selection.ts` (inherited untracked H work retained)
- `packages/access-router/src/acl/output-work-ledger.ts` **new/private**
- `packages/access-router/src/acl/service-authorization.ts`
- `packages/access-router/src/acl/trusted-output-materialization.ts`
- `packages/access-router/src/helpers/index.ts` (canonical rule-buffer admission)
- `packages/access-router/src/validation/public-admission.ts` (control-work debits)

New source-owned regressions:

- `packages/access-router/test/owned-authorization-many.unit.test.ts` — **52 cases**
- `packages/access-router/test/owned-authorization-many-bounds.unit.test.ts` — **24 cases**
- `packages/access-router/test/owned-authorization-many.types.fixture.ts`

No existing regression was removed/retired. No installed documentation or existing
export/packed-consumer test was edited. A runtime export-shape assertion change was
not unavoidable: the new named export is type-only; the canonical method is inherited.

## Actual verification on current bytes

Foreground, serial, awaited, repository-root working directory. Every command,
private temp/cache environment, output and exit is retained under `logs/`.

| Check | Latest evidence/result |
| --- | --- |
| Necessary affected/transitive build | `07-affected-build` — five packages, workspace concurrency 1, pass |
| Final affected core build | `46-current-build` — pass; no product edits afterward |
| Complete focused runtime files | `47-final-tests` / `47-final-results.json` — **772/772, 15 files, zero failed/pending/unhandled errors** |
| Core configured source tsc | `48-final-source-tsc` — pass |
| Strict new API fixture | `49-final-strict-api-types` — pass, 14 type equalities and 15 intended negative diagnostics, plus positive getter/Core/readonly/nullish/native/Map calls |
| Changed-file ESLint | `50-final-eslint` — all 24 paths pass |
| Changed-file Prettier | `51-final-prettier` — all 24 paths pass |
| Scoped tracked diff check | `52-final-diff-check` — pass; auditor also checks whitespace/newlines for every changed/new file |
| Incoming preservation/artifact identity | `53-preservation-audit`, final refresh `55-final-preservation-audit`, `preservation.json`, `current-artifact-identity.json` — pass |
| Local declaration/export inspection | `54-public-surface-current`, `public-surface-inspection-current.json` — root/advanced/processors runtime counts **46/48/6**, new root/advanced type and both signatures in `.d.ts`/`.d.mts`, no new private issuer name leak |

`verified-test-scope.json` lists each actual file/count: the new **76 cases (52 + 24)**, old
helper/stage/publication/native/control/fact/work/mode/concurrency files (**696**).
The 1/10/100 probes observe one configuration/catalog capture versus N independent
singles, N distinct root sources/stages/memos, and **100 × 24 = 2,400** function calls.
Original-request this, immutable captured globals/EMPTY, schema/actor/options/closure
mutation, all-source-first mutation protection, bad later sources before predicates,
receiver/control matrices, nullish/dense/frozen/size/proxy/getter/symbol/cycle cases,
scoped grants/metadata forgery, ordering/FIFO/reentry, poison/drain and actual cleared
private source/memo/index/policy/publication records are covered. The final two added
regressions exercise pre-admission of non-owned initialized actor-copy buffers and
large custom-access memo strings before construction/predicates. No actor-map-copy,
Promise/binding-count or universal allocation reduction is inferred from these counts.

The implementation tsconfig remains its existing `strict:false`. The API fixture is
strict against the current local generated root/advanced declarations, with inherited
`skipLibCheck:true`; it is NOT an installed tarball/peer/module matrix. No any/cast
is used to hide omitted fields. Full current/minimum consumer verification is F-V.

### Retained failures/observer corrections

No baseline-pass claim is made for any failed attempt:

- `02`: source tsc found a symbol passed to byte preparation; corrected before copy.
- `03`: two new fixture failures (limits configured after request-state construction;
  a native source failed before a stage existed); fixtures corrected, purposes retained.
- `04`: enabling strict on ALL implementation sources produced many diagnostics.
  That attempted scope differs from the repository's configured source check; no
  strict-internal baseline was run or claimed. The final strict API fixture is separate.
- `05`: five tests attempted to spy on a non-configurable BSON namespace property.
  Changed to real ObjectId serializer witness spies; pre-serialization purposes retained.
- `11`: a receiver fixture tried to replace a model through the correctly protected
  runtime registry. Fault injection now observes a changed lookup identity privately.
- `28`: the native configuration observer incorrectly assumed Node's internal
  Buffer.from recursion re-entered the public spy. It now observes returned storage
  and subsequent explicit router-copy arguments, without claiming internal counts.
- `32`: **FAILED** worker OOM, 14 completed files/13 pending cases, not passing evidence.
  Generic deep equality on the large exact-payload Buffer was replaced by native
  Buffer.equals plus explicit keys/size/independent identity checks. Same boundary,
  overflow and pre-copy purposes, no heap-limit/product-budget change. `34`/`36`
  subsequently passed all 770 then-present cases; the final current-byte `47` run
  passes all 772 after two added regressions. See `32-observation-correction.md`.
- One patch-context verification failure is retained in
  `logs/patch-verification-failures.txt`; no file changed on that failed patch.

The private Vite config-loader compatibility warning remains in the logs; it was
not suppressed and is not a test failure. No timings/performance campaign was run.

## Preservation, identities and closure

- HEAD unchanged: `a1996e10f8339d89fc8a0aa2b10f7b531f5a07ca`.
- Lock unchanged: `ef86ef24726d09f81d1262656920d6215caeb0f26e345198db2d27b8ab7ab314`.
- Core package.json unchanged: `7c1b9b289aa465412cf5e64648ff82b436eef6caadc2389b9ddbeedbad5b5640`.
- Incoming root ESM: `8a5ded622337bddd1b9ce31a95dc3a3dfb0b10e734db52c4b371c5d55cf5267e`.
- **Current** root ESM: `a4534cf36ec1dad15adb68459aba285b1509118deed262accdfca53d76493e51`.
  All 14 current core outputs are identified separately. This is NOT a deterministic
  release seal and the old measured hash does not certify this API.
- Actual environment: Node **26.12.1**, pnpm **11.18.0**, TS **6.0.3**, Mongoose
  **9.11.4**, Express **5.2.1**, Vitest **4.1.11**, tsup **8.5.1**. Tool package
  identities are recorded. The old packed current-peer fixture used Mongoose 9.8.0;
  that matrix has NOT been rerun or relabeled for the installed 9.11.4.
- Before edits, protected originals/hashes covered all incoming files and focused
  source/tool/config inputs. Audit: **2,184 unique recorded hashes, 2,166 unchanged,
  exactly 18 authorized modified originals, six new paths, zero outside changes or
  missing originals**. All 38 incoming status paths remain: 32 untouched and six
  intentional runtime overlays on inherited H work. `incremental-source.diff` makes
  those overlays reviewable without mistaking H+G/coordinator work for this child.
- Task, installed docs, benchmark/tools/gates/workloads, guard/service G changes,
  existing packed/export consumers and the other three inherited untracked tests
  are unchanged. Proposal **17 files** and first implementation packet **1,782 files**
  retain their hashes/path sets. No historical entrypoint or cache was written.
  Initial protection also hashed historical files; redundant copies created only in
  THIS new packet were pruned, while their hashes remain. No historical tree clone
  is retained. No dependency/lock edit, install, revert, commit or publish.
- All commands completed foreground/serial. No background jobs or Mongo server was
  started. `process-check.txt` shows only the foreground audit checker/parent, no
  build/test/Mongo jobs. All deliberately deferred test closures were settled.

## Fresh F-V owner — required next work, not claimed here

1. Update installed README/MIGRATION/llms/CHANGELOG and corresponding site/deco
   guidance, retaining the accepted facts-only/no-DTO guard refinement. Correct the
   still-stale README **1422–1427**: it incorrectly says raw picks run document hooks
   and trimmed output can use a handle. Add the optional Many helper without changing
   single-row defaults/freshness or recommending it as an automatic H3 migration.
2. Ship executable public-import recipes: raw collection deliberate one-capture
   policy; presentation-only subsets normally need zero helpers; current document
   facts require a NEW normal READ/LIST. Use optional/narrowed results, no any/casts
   concealing omissions. Explain scope/grants, native normalization exclusion,
   cumulative router limits, trusted effects, no atomic snapshot/rollback and failure
   grouping. Opaque API returns must not be advertised as pre-bounded normalization.
3. Run the requested affected FULL core/deco integration/types/doc gates and actual
   packed root/advanced/processors ESM/CJS strict minimum/current peer/module consumers,
   including current `skipLibCheck:false` where required. Check published JSDoc/types,
   string-ID hydrated unknown, no private exports, package contents and all recipes.
   Existing packed/export tests were intentionally not edited in F-I.
4. Perform the new deterministic necessary rebuild/identity/final seal and job cleanup
   on the actual tested bytes. Old **5,957 core / 742 deco / 45 runner / 180 smoke**
   results belong to OLD bytes, not this API. No workspace-wide command is requested.

No independent acceptance is delivered. H4's accepted facts-only contract is not
reopened. OAR-09 remains blocked at **73/90**, with **two confirmed H3 comparisons plus
15 unstable-sign comparisons** unresolved. No benchmark/workload/gate change, timing,
speedup claim, old-gate substitution, further campaign or OAR-10 is authorized here.
