# PSA-03 documentation and affected-validation handoff

DOCS-03, 2026-11-09. Related task:
[PSA-03](../../../tasks/20261108-211920-access-router-populate-source-target-access.md#task-psa-03-document-and-validate-the-correction).
Starting revision: `647a217`, with PSA-01/02/04 delivered. The coordinator owns
the task record, bundle index and independent final-review scheduling.

## Delivered documentation

- `packages/access-router/README.md`: clarified request-only helper semantics and
  added one typed mixed-access example under **Populate source and target access**.
- `packages/access-router/MIGRATION.md`: recorded the externally visible correction
  and the helper compatibility/no-new-shape decision, without adding another
  TypeScript example or changing the existing migration-example inventory.
- `website/docs/packages/access-router/services.mdx`: aligned helper and selector
  guidance, linking to the README example rather than duplicating its code block.
- Public JSDoc only in `packages/access-router/src/interfaces/query-types.ts`,
  `packages/access-router/src/interfaces/service.ts`,
  `packages/access-router/src/services/base.ts` and `packages/access-router/src/core.ts`.
  The Core implementation correction already belonged to PSA-01; DOCS-03 changed
  only its public helper comment.
- This new report is the only task artifact written by DOCS-03. No task status,
  index, implementation behavior, API/type shape, tests or policy inventory changed.
  No commits, reverts or unrelated-work cleanup.

## Contract review and decisions

Reviewed the actual implementation/regression diff and the
[PSA-01](psa-01.md), [PSA-02](psa-02.md) and [PSA-04](psa-04.md) handoffs.

- Canonical service population uses the owning source's captured effective
  `outputAccess`, selection, authority and owning-document facts; source decisions
  may remain deferred until the parent document stage. Target facts never substitute
  for source facts.
- Descriptor `access` > query `options.populateAccess` > existing method/operation
  default selects target policy only: operation admission where required by existing
  target policy, rows, fields, virtuals and document permissions.
- The documented fixture has Source `related.read: true` / `related.list: false`
  and Target `label.list: true` / `label.read: false`. An admitted advanced read asks
  for target `list` access and can return `related.label` without broadening source
  permissions. Source/target operation and row preconditions are explicit.
- Neither a permissive target exposes a denied/excluded source nor a readable source
  grants target operation, row or field access. Denied source output is omitted;
  permitted references keep IDs when population is not admitted; admitted target
  misses remain scalar `null` or filtered reference arrays, never restored IDs.
- Effective source output is not simply the initiating operation: read-to-list
  fallback uses `list` fields; create/update/upsert-branch responses use `read`
  fields without replacing their separate create/update virtual or document-fact
  accesses. Existing source document-fact ownership is preserved.
- Request-only Core/Service `genPopulate` retains its signature and options.
  Positional access (default `read`) admits source request fields and defaults the
  target; a descriptor overrides only the target. There are no document hooks,
  current document facts or captured parent output execution, and only the existing
  `scopePath` option: no new `sourceAccess`. Dedicated `SubPopulate`/`genSubPopulate`
  remain path/select-only. The helper is not a substitute for the parent's
  document-stage output checks. Private `dependsOnPopulate` behavior is unchanged.

## Verification

Commands run serially from repository root with installed workspace dependencies.
Runtime `TMPDIR` is the absolute ignored checkout-local directory below; replace
the quoted `<repo-root>` placeholder before reproducing commands. Ignore status was
reconfirmed with `git check-ignore _tmp-populate-source-target-20261109-DCsFHQ`.

```sh
TMPDIR='<repo-root>/_tmp-populate-source-target-20261109-DCsFHQ' pnpm --filter @web-ts-toolkit/access-router test:contracts test/contracts/documentation-examples.test.ts test/contracts/strict-consumer-types.test.ts -t 'documentation examples|SVA-F03 checks finite named helper migrations'
TMPDIR='<repo-root>/_tmp-populate-source-target-20261109-DCsFHQ' pnpm --filter @web-ts-toolkit/access-router typecheck
TMPDIR='<repo-root>/_tmp-populate-source-target-20261109-DCsFHQ' pnpm --filter @web-ts-toolkit/access-router test:internal test/internal/documentation-authorization-guidance.test.ts
TMPDIR='<repo-root>/_tmp-populate-source-target-20261109-DCsFHQ' pnpm --filter @web-ts-toolkit/access-router-deco test
TMPDIR='<repo-root>/_tmp-populate-source-target-20261109-DCsFHQ' pnpm --filter @web-ts-toolkit/access-router test:contracts test/contracts/packed-consumer-compatibility.test.ts -t 'packs the current JavaScript, declaration graph and shipped docs'
```

Results, in command order:

1. **98 passed, 44 skipped**, two files: the entire 93-case documentation suite,
   including the new README example (`README.md-block-21-of-33`), plus five installed
   named-helper compile checks (Bundler, NodeNext ESM/CJS, Node16 ESM/CJS). The 44
   unrelated strict-consumer cases were intentionally excluded by the name filter,
   not failures or replaced negative assertions. Documentation snippets compile with
   full strict semantic checks; complete workflows also execute.
2. **Passed**, including dependency rebuild and source `tsc --noEmit` after the
   final JSDoc-only wording clarification. No signatures or example code changed
   after the documentation run.
3. **24 passed**, one installed-authorization-guidance/internal-helper file.
4. **23 files / 779 tests passed**, with the six-package dependency rebuild and
   decorator source typecheck. This is the standard decorator command, not its
   separate opt-in full compatibility-matrix command.
5. **1 passed, 12 skipped**, fresh packed-publication byte integrity: current
   JavaScript, the full declaration graph and shipped README/MIGRATION/llms docs
   match the real release-artifact-pipeline tarball. This focused selection is not
   a rerun of the full installed peer matrix.

All three access-router test scripts rebuilt the five-package dependency closure and
passed exhaustive preflight: contracts 103, invariants 64, internal 51; exact default
union; public graph 137 files / 238 modules. No direct-Vitest fallback, modified
inventory or gate exemption. Vite emitted configuration-native-loader warnings;
none were suppressed or addressed with unrelated configuration edits.

### Source/API, shipped JSDoc and link inspection

Read-only inline checks used this launcher (no probe files or build outputs written):

```sh
TMPDIR='<repo-root>/_tmp-populate-source-target-20261109-DCsFHQ' node --input-type=module
```

- **Four source AST comparisons passed** against HEAD. In Core alone, the expected
  comparison first applies the exact already-delivered PSA-01 replacement at
  `requestPopulateSelect`: `populateAccess as SelectAccess` → `access as SelectAccess`.
  Parsing and recursive AST-kind/leaf comparisons then ignore comments only. The
  interfaces and Base match HEAD structurally; no API/type or additional runtime
  code change is hidden by this documentation phase.
- **18 JSDoc surfaces passed** through TypeScript's checker, starting at root and
  advanced `.d.ts`/`.d.mts` entries and following aliases/inherited methods: options,
  acquired-Service helper, Core helper, and advanced Populate/access/SubPopulate.
  The shipped comments contain target-only overrides, current-fact limitations,
  source effective access and path/select-only child guidance.
- **Seven link targets passed**: the two newly introduced README-example links and
  all five report links, including heading fragments. The GitHub README URL was
  mapped to its current local target; remote publication availability was not tested.
- Artifact privacy-pattern inspection passed; scratch is ignored and this report's
  destination is not ignored. The disposable scratch inputs need not be preserved.

**Probe-authoring failure, corrected:** the first invocation of the same Node
launcher used `ts.createScanner(..., skipTrivia: true)` without parser-directed
template rescanning. It incorrectly consumed later comments as part of a template
token and failed the first query-types source comparison. No JSDoc/link success is
claimed from that invocation. Replacing that comparator with `ts.createSourceFile`
and recursive `ts.forEachChild` structure comparisons passed all checks above;
no product file was changed to make the probe pass. This is neither a product
regression nor an asserted baseline failure. Inline probe bodies/logs are omitted;
the methods, comparison scope and observations are curated here.

### Formatter correction

The following check passed before editing, then failed once after the initial
documentation patch because Prettier required wrapping the new README service-call
chain. The chain was corrected with `patch`; no baseline failure is claimed.

```sh
TMPDIR='<repo-root>/_tmp-populate-source-target-20261109-DCsFHQ' pnpm exec prettier --check packages/access-router/README.md packages/access-router/MIGRATION.md website/docs/packages/access-router/services.mdx packages/access-router/src/interfaces/query-types.ts packages/access-router/src/interfaces/service.ts packages/access-router/src/services/base.ts packages/access-router/src/core.ts
```

### Final static checks

```sh
TMPDIR='<repo-root>/_tmp-populate-source-target-20261109-DCsFHQ' pnpm exec eslint packages/access-router/src/interfaces/query-types.ts packages/access-router/src/interfaces/service.ts packages/access-router/src/services/base.ts packages/access-router/src/core.ts
TMPDIR='<repo-root>/_tmp-populate-source-target-20261109-DCsFHQ' pnpm exec prettier --check packages/access-router/README.md packages/access-router/MIGRATION.md website/docs/packages/access-router/services.mdx packages/access-router/src/interfaces/query-types.ts packages/access-router/src/interfaces/service.ts packages/access-router/src/services/base.ts packages/access-router/src/core.ts docs/task-artifacts/access-router/20261108-populate-source-target-access/psa-03.md
git diff --check
```

Scoped source ESLint, Prettier for all eight DOCS-03 files, `git diff --check`
and final owned-diff review passed. No outstanding verification failure remains.

## Verification limits and preservation

- The coordinator's [shared-gate record](verification.md) establishes the delivered
  runtime correction and tests: **218 files / 7,762 tests passed**, including strict
  and packed consumers, plus source typecheck and repository lint before DOCS-03.
  This documentation/JSDoc-only delta does not invalidate that runtime evidence;
  affected documentation, consumer, type and downstream checks cover this phase.
  The full 218-file suite is not redundantly rerun.
- Full-workspace tests/builds and a website production build are outside this
  affected-doc check; website formatting and new link targets are reviewed locally.
  Review is scoped to the affected populate/helper guidance, not an audit of all
  website authorization prose. Independent final review remains the coordinator's
  next step.
- Curated observations are preserved here, not logs, caches, Mongo data, generated
  declarations/builds, tarballs, staged consumers or dependencies. Reproduction
  requires the repository, installed dependencies and normal Mongo test environment;
  this summary is not a standalone executable or raw-log archive.
- Reviewed the shared scratch directory entries. DOCS-03 created no handwritten
  scratch inputs; test staging/cache does not contain unique design or handoff
  material requiring preservation. Earlier agents' scratch/logs were left untouched.
  This report preserves the useful decisions and observed verification results.

No build/runtime test job remains running. Task/index edits and independent final
acceptance remain with the coordinator.
