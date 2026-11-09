# PSA-01 implementation handoff

IMPL-01, 2026-11-09. Scope: PSA-01 only in
`docs/tasks/20261108-211920-access-router-populate-source-target-access.md`.
Starting revision: `647a217`; the coordinator's task-record edits were left alone.
No commits, unrelated edits, or generated outputs are included in this handoff.

## Correction and maintained regressions

- `packages/access-router/src/services/service.ts`: source relationship rules in
  `genExecutionPopulate` now use captured `access.outputAccess`. Target admission,
  rows, projection, virtuals, document permissions, and fetch metadata still use
  resolved `targetAccess`.
- `packages/access-router/src/core.ts`: source `requestPopulateSelect` now uses
  positional `access`, not the descriptor's target override. No signatures/options
  changed; positional access remains the target default. Request-only empty
  document facts and finite-arity/scope validation are unchanged.
- `packages/access-router/test/contracts/populate-operation-policy.queries.test.ts`:
  five cases cover acquired public-service advanced reads, HTTP advanced reads,
  unchanged source list denial, denied/excluded source output, and independent
  target operation/terminal-row denial. Existing fixture names `ref`/`listOnly`
  stand for the task's `related`/`label`. Positive cases deliberately reference
  the tenant-b target permitted by target list rows, not the original tenant-a ref.
- `packages/access-router/test/contracts/populate-operation-policy.helper-isolation.test.ts`:
  four cases cover Core and scoped acquired-Service helpers: read-only source /
  list-only target, source field denial, absent document-fact authority, and target
  operation/row denial. A top-level `refs` fixture field lets Core's unscoped
  request boundary be tested without changing its existing parent-path behavior.

## Red/green evidence

All commands ran sequentially from repository root. Commands below use a quoted
placeholder for the absolute checkout root; execution used `$PWD` for that root.
Dependencies were already installed. Scratch ignore status was confirmed with
`git check-ignore _tmp-populate-source-target-20261109-DCsFHQ`.

First, before source edits:

```sh
TMPDIR='<repo-root>/_tmp-populate-source-target-20261109-DCsFHQ' pnpm --filter @web-ts-toolkit/access-router test:contracts test/contracts/populate-operation-policy.queries.test.ts test/contracts/populate-operation-policy.helper-isolation.test.ts -t PSA-01
```

The five-package dependency closure built successfully, but the exhaustive layer
preflight failed with 94 violations before Vitest. These report stale/unmatched
consumer inventories and resulting unreviewed generated/read/import edges in
untouched `packed-consumer-compatibility.test.ts` and `strict-consumer-types.test.ts`.
Examples: generated sources at packed-consumer lines 576/580/584 versus inventory
reviews at 570/574/578; strict-consumer reviews at 180/275/306 are unmatched.
No layer-check inventory or consumer-suite edits were made by IMPL-01.

To observe runtime red against those freshly built entries, before source edits:

```sh
TMPDIR='<repo-root>/_tmp-populate-source-target-20261109-DCsFHQ' pnpm --filter @web-ts-toolkit/access-router exec vitest run --config vitest.contracts.config.ts test/contracts/populate-operation-policy.queries.test.ts test/contracts/populate-operation-policy.helper-isolation.test.ts -t PSA-01
```

Result: **6 failed, 3 passed, 96 skipped** across two files. Failures:

- `populates a read-only source reference with list-only target fields through service`
  and `... through http`: expected `{ _id, listOnly: 'list-field' }`, received ID.
- `uses positional source read access and descriptor target list access`, under
  both Core/scoped-Service describes: expected one plan, received zero.
- `retains source request-only denials and independent target operation and row denials`,
  under both helper describes: expected `[]` for source read denial, received one
  descriptor admitted using target list access. This is helper admission evidence,
  not a claim of a canonical output authorization bypass.

After the two source corrections:

```sh
TMPDIR='<repo-root>/_tmp-populate-source-target-20261109-DCsFHQ' pnpm --filter @web-ts-toolkit/access-router test:contracts test/contracts/populate-operation-policy.queries.test.ts test/contracts/populate-operation-policy.helper-isolation.test.ts
```

Build again passed; the same 94-violation preflight failure still prevented Vitest.
The direct runtime checks then passed against this rebuilt output:

```sh
TMPDIR='<repo-root>/_tmp-populate-source-target-20261109-DCsFHQ' pnpm --filter @web-ts-toolkit/access-router exec vitest run --config vitest.contracts.config.ts test/contracts/populate-operation-policy.queries.test.ts test/contracts/populate-operation-policy.helper-isolation.test.ts
TMPDIR='<repo-root>/_tmp-populate-source-target-20261109-DCsFHQ' pnpm --filter @web-ts-toolkit/access-router exec vitest run --config vitest.internal.config.ts test/internal/field-helper-request-boundaries.integration.test.ts test/internal/field-helper-removal.contract.test.ts
TMPDIR='<repo-root>/_tmp-populate-source-target-20261109-DCsFHQ' pnpm --filter @web-ts-toolkit/access-router exec vitest run --config vitest.contracts.config.ts test/contracts/populate-operation-policy.queries.test.ts test/contracts/populate-operation-policy.helper-isolation.test.ts -t PSA-01
```

Results, respectively: **105 passed** (two contract files); **67 passed** (two
internal helper-boundary files); **9 passed, 96 skipped** (focused final green).
These are focused runtime passes, not an exhaustive layer/package acceptance pass.
ESLint and Prettier passed for all four changed TypeScript files; Prettier also
passed this handoff. `git diff --check` passed. The handoff destination is not
ignored; repository path references and privacy-sensitive content were reviewed.

## Inspected forwarding; no extra plumbing required

- `Base.genPopulate` forwards source positional access and named scope
  unchanged to Core, with its own strict argument-count check.
- `Service.#fetchOnePrepared`, `findPrepared`, `createPrepared`, and
  `updateOnePrepared` already pass the retained execution into the shared planner.
  `PublicService.#readById` / `_readFilter` derive list output access on fallback;
  write execution/output derivation retains read field output access separately
  from create/update virtual/document-permission access. The correction does not
  infer source access from either the initiating operation or the target default.
- Embedded output plans retain the owning document stage in
  `finalizeModelOutput`; `prepareOutputDocumentStage` reuses owning facts.
  Source classification remains deferred where necessary and final field filtering
  still handles selection and document-stage authorization.
- `prepareSubdocumentCall` / `prepareSubdocumentOutput` already retain child output
  access and owning-parent facts. `prepareSubdocumentPopulate` forwards that
  execution through the constructor-registered canonical planner. Dedicated
  finalization resolves parent facts before child outputs. No forwarding changes.
- `genSubPopulate` and `SubPopulate` intentionally accept path/select only.
  Legacy `getParentDoc` intentionally calls `genPopulate('read', ..., { scopePath })`
  independently of its parent row-filter access. Neither was widened to accept
  new target selectors. Private `dependsOnPopulate` code was not changed.

## Remaining verification and PSA-02 suggestions

- Standard scripted test acceptance remains blocked by the unrelated preflight
  inventory failures. The coordinator should resolve/assign them before final gates.
- Full package tests, source typecheck, downstream/decorator checks, and packed
  consumer verification were not run; these remain for coordinated acceptance.
- PSA-02 should extend the matrix for effective read-to-list fallback, write-output
  accesses, mixed descriptor/query-default precedence, document-dependent source
  permissions, embedded/dedicated owning facts, and lean/hydrated/authority modes.
  Keep target rows explicitly authorized in positive fixtures.
- Raw logs, Mongo data, generated builds, caches, and dependencies remain disposable
  and are omitted. This is a curated observation summary, not a raw-log archive;
  maintained tests plus the repository/dependencies reproduce the runtime checks.
