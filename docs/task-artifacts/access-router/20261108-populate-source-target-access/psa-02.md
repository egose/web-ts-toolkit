# PSA-02 regression handoff and coverage ledger

TEST-02, 2026-11-09. Related task:
`docs/tasks/20261108-211920-access-router-populate-source-target-access.md`, PSA-02.
Starting revision: `647a217`, with PSA-01 already delivered. Coordinator owns task
status and full-package acceptance.

## Delivered scope

- Added **19 cases** in the PSA-02 describe in
  `packages/access-router/test/contracts/populate-operation-policy.queries.test.ts`.
- Reused its existing runtime/database fixture; existing tests/assertions,
  including PSA-01's additions, were not changed.
- No implementation, public types, helper signatures, scripts, consumer inventory,
  task status, or private populated-dependency behavior was edited. The sibling
  GATE-04 inventory correction was present during the successful standard runs.
- This new handoff is the only non-test file written by TEST-02. No commits.

## Coverage ledger

Paths below are relative to `packages/access-router/test/`:

- **Q**: `contracts/populate-operation-policy.queries.test.ts`
- **H**: `contracts/populate-operation-policy.helper-isolation.test.ts`
- **S**: `contracts/subdocument-populate-authorization.integration.test.ts`
- **D**: `contracts/populate-operation-policy.dependencies.test.ts`
- **P**: `contracts/private-populate-read-policy.review.test.ts`
- **W**: `invariants/write-output-populate.unit.test.ts`
- **U**: `invariants/document-permissions-dependencies.unit.test.ts`
- **B**: `internal/field-helper-request-boundaries.integration.test.ts`

Parameterized titles below retain their test-source placeholders. All listed
existing controls were rerun, not inferred solely from source inspection.

### Required source matrix

- **Read allowed/list false → target list populates:** existing Q/PSA-01
  `populates a read-only source reference with list-only target fields through %s`
  (service/HTTP); new document-fact, embedded, defaults and write cases also use it.
- **Read false/list allowed under read → omit:** existing Q/PSA-01
  `does not let permissive target list access admit denied or excluded source output`;
  new embedded cases reverse nested source rules and assert omission.
- **List false/read allowed under list → omit:** new Q
  `uses source list visibility, not target read visibility (allowed=%s)`, false
  case; asserts no target query.
- **List allowed/read false → target read populates:** same new Q title, true
  case; exact target output has only `readOnly`, no identity or list-only field.
- **Source read document facts, allow/deny, not target facts:** new Q
  `evaluates read facts on the source parent, never the target (allowed=%s)`
  (four cases: isolated/lean and trusted/hydrated, each allow/deny). Asserts source
  parent ID/group and context; target has the opposite `doc:owner` fact. The source
  private dependency is not returned.

### References, entry paths and effective access

- **Same-model/self:** new Q
  `uses independent source and target access for same-document self references`;
  parent read/target list and parent list/target read return exact, different field
  sets. Other new cases use cross-model refs.
- **Descriptor/options/default precedence, simultaneous selectors:** new Q
  `keeps descriptor overrides independent from the %s option default within one query`
  (read/list defaults). Scalar target read and array target list run together;
  exact outputs prove different target rows/fields. Existing Q
  `uses effective %s operation/row/field policy independently of parent list`
  also covers the ordinary target default.
- **Root embedded arrays:** new Q
  `separates embedded-array source read rules from target list policy through %s`
  (direct/root parent reads). `children[].ref` uses source read, not target list;
  tenant-a target misses to null, permitted tenant-b populates, source denial
  omits refs. Top-level service/HTTP refs are covered by PSA-01 above.
- **Scoped request-only helpers:** existing H/PSA-01 describes
  `PSA-01 request-only %s populate access` (Core/scoped-Service): positional source
  read/descriptor target list, source denial, absent document facts, target denials.
  Existing B retains
  `named scoped populate preserves target request fields, private fetch inputs and row scope in retained getParentDoc`
  and `private source fetch never grants request-only population`.
- **Dedicated children/owning-parent facts:** new Q
  `keeps dedicated %s child population path/select-only with owning-parent facts and separate route gates`
  (direct/root). Parent container output is denied but dedicated child entry is
  admitted; parent group facts allow/deny the child ref. Only existing path/select
  inputs are used, never new SubPopulate selectors. Existing S covers target read
  denial, target rows/fields, unknown paths and unconfigured targets.
- **Read-to-list fallback:** new Q
  `uses effective list source access during read-to-list fallback by %s, not initiating read or target read`
  (ID/filter). Asserts initiating `operation: read` with effective
  `outputAccess`/`docPermissionsAccess: list`, population and reversed source omission.
- **Write response read-field access:** new Q
  `uses read source field access for %s responses, not mutation input or target list access`
  (create/update, isolated/trusted). Source allow/deny are both checked. Denied
  client ref input cannot seed the assertion: create gets a schema default, update
  retains an existing ref; raw persisted IDs are asserted after every write.
  Output contexts assert read field access, independent of operation/target access.

### Reused controls (not duplicated into a Cartesian matrix)

- **Target operation/terminal rows:** existing Q/PSA-01
  `keeps target list %s denial independent of readable source output`, Q
  `keeps terminal row denial and row errors enforced through %s`, and H/PSA-01.
  Permitted source IDs remain unchanged when planning is denied.
- **Match/base rows/referenced IDs:** existing Q
  `retains requested match, base rows and mandatory reference IDs through %s with query rewriting`
  (canonical/helper/scoped-helper) and
  `does not restore IDs after admitted %s population` (match/deletion/array misses).
- **Source exclusion, target selection/identity:** Q/PSA-01 denied/excluded-source
  test and existing Q
  `honors target selection exclusions and identity independently (required=%s)`;
  new defaults/self/list/embedded cases also assert exact fields and `-_id`.
- **Null/missing/absent/empty refs:** new default cases assert `missing: null`,
  `nullable: null`, omitted `absent`, `empty: []`; existing Q
  `retains original authorized IDs only on operation denial (required=%s)`
  distinguishes ID retention from admitted misses.
- **Authority/hydration:** new document-fact cases pair isolated/lean and
  trusted/hydrated; new writes run both modes. Existing W describe
  `write-origin target ownership, occurrence plans and deterministic copies`
  retains scalar/array/dotted, source/target-mode and target-access combinations.
- **Private `dependsOnPopulate`:** entire existing D/P files pass unmodified.
  In particular D retains
  `adding private virtuals preserves ordinary response shape (populate=%s)`,
  `keeps %s parent-field authorization independent from private input`, and
  `uses the original public mask even when private fetch unions select public-authorized fields`.
  U/B retain request-only dependency/helper boundaries.

Positive list-target fixtures deliberately use the tenant-b row permitted by the
existing target list filter. The original scalar tenant-a ref is used only for
target read, or as an intentional embedded target-list miss.

## Verification actually run

All commands ran sequentially from repository root, using the existing installed
workspace dependencies and the PSA-01 implementation. Scratch ignore status was
confirmed with `git check-ignore _tmp-populate-source-target-20261109-DCsFHQ`.
Replace the quoted `<repo-root>` placeholder before reproducing these commands;
execution used `$PWD` for that checkout root.

```sh
TMPDIR='<repo-root>/_tmp-populate-source-target-20261109-DCsFHQ' pnpm --filter @web-ts-toolkit/access-router test:contracts test/contracts/populate-operation-policy.queries.test.ts test/contracts/populate-operation-policy.helper-isolation.test.ts test/contracts/subdocument-populate-authorization.integration.test.ts test/contracts/populate-operation-policy.dependencies.test.ts test/contracts/private-populate-read-policy.review.test.ts
TMPDIR='<repo-root>/_tmp-populate-source-target-20261109-DCsFHQ' pnpm --filter @web-ts-toolkit/access-router test:invariants test/invariants/write-output-populate.unit.test.ts test/invariants/document-permissions-dependencies.unit.test.ts
TMPDIR='<repo-root>/_tmp-populate-source-target-20261109-DCsFHQ' pnpm --filter @web-ts-toolkit/access-router test:internal test/internal/field-helper-request-boundaries.integration.test.ts
TMPDIR='<repo-root>/_tmp-populate-source-target-20261109-DCsFHQ' pnpm --filter @web-ts-toolkit/access-router test:contracts test/contracts/populate-operation-policy.queries.test.ts -t PSA-02
```

Results, in order:

1. **480 passed**, five contract files.
2. **81 passed**, two invariant files.
3. **7 passed**, one internal helper-boundary file.
4. **19 passed, 89 skipped**, final focused new-case run after formatting.

Each standard script successfully rebuilt the five-package dependency closure and
passed the unmodified exhaustive layer preflight: contracts 103, invariants 64,
internal 51; exact default union; public graph 137 files / 237 modules. No direct
Vitest fallback, preflight exemptions or skipped gate were used.

The initial focused command (same as command 4) produced 17 passes, two failures
and 89 skips. Both failures were in new create-result assertions incorrectly
expecting singular `context` instead of `contexts[0]`; the assertions were corrected
to the existing result contract. These are test-authoring failures, not product
defect or pre-fix red/green evidence. PSA-01 retains the actual pre-fix reproductions.

Additional checks: ESLint and Prettier for the changed test, Prettier for this
handoff, and `git diff --check`. The handoff destination is not ignored, and listed
repository paths and privacy-sensitive content were reviewed.

## Limits and continuation

- No new implementation defect or remaining focused-test blocker was found.
- Full package tests, source typecheck and downstream/decorator/packed-consumer
  acceptance were deliberately not run; coordinator owns those later gates.
- The new cases were not rerun against reverted implementation. Existing PSA-01
  red/green evidence establishes the original regression without replacing shared
  source or disturbing concurrent work.
- This curated ledger and maintained tests are the durable evidence. Scratch logs,
  Mongo data, formatted scratch copies, generated builds, dependencies and caches
  are disposable and omitted; reproducing runtime checks requires the repository,
  installed dependencies and its normal Mongo test environment.
