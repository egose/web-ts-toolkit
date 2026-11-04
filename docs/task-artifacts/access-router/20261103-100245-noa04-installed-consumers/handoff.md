# NOA-04 installed consumers and breaking documentation

Related contract: [NOA-04](../../../tasks/20261103-082614-access-router-nested-operation-access.md).
Dependencies: accepted [NOA-01](../20261103-noa01-nested-rules/handoff.md),
[NOA-02](../20261103-092402-noa02-entry-contexts/handoff.md) and
[NOA-03](../20261103-095702-noa03-captured-base-checks/handoff.md).

This is the fourth sequential implementer's scoped handoff, not an independent
review or release approval. It uses the existing shared worktree, preserving prior
implementation/tests, the planned migration section while finalizing it, and all
historical evidence. No additional agents, commits, pushes or task-status edits.

## Outcome and bundle index

NOA-04's required scoped gates pass: fresh transitive build, required access-router
typecheck, full **unfiltered 196-file / 6,712-test package suite**, and serialized
focused decorator/runtime checks. There are **zero failed, skipped or todo tests**
in the final runs. No scoped blocker remains. Repository V3 and independent NOA-05
review remain unrun, not waived or claimed complete.

- [files.json](files.json): all **23** maintained files edited by NOA-04. Shared
  source files also contain earlier accepted work; this manifest does not claim
  ownership of their entire combined diff.
- [verification-summary.json](verification-summary.json): reconciled final counts,
  selected suite counts, module conditions and the initial failure history.
- [doc-acceptance.json](doc-acceptance.json): all **10** original classified migration
  sources remain byte-for-byte identical to HEAD; **3** classified target blocks
  were added. The digest concatenates each original block's classification, newline
  and exact source, joining blocks with a newline. It is a source-preservation
  observation, not an independent test rerun or a seal over omitted raw output.

## Delivered scope and coverage

Paths below start at the repository root.

- `packages/access-router/{README.md,MIGRATION.md,llms.txt}`: implemented nested
  rules, all seven mapping pairs, old base to operation.default, independent
  basic/advanced/root selection, unpaired mappings, same-owner exact context
  defaults versus shallow fallback, explicit whole-model undefined exception,
  closed/absent/scalar subdocument fields, deny-by-default, scalar shorthand,
  setters, separate root outer guard, context-free secondary policy and unchanged
  trusted services/flags. Generic option getters remain raw fallback readers,
  not final entry resolution. The README is sufficient without website/source.
- `packages/access-router/src/interfaces/{access,root}.ts`,
  `src/routers/{model-router,data-router}.ts`, and `src/runtime.ts`: public
  option/rule/context/setter/endpoint JSDoc, including emitted editor guidance.
  No access-router runtime behavior or type alias was added by this task.
- `packages/access-router/test/strict-consumer-types.test.ts`: all seven former
  positive pairs migrated, extended to default/basic/advanced/root typed leaves;
  existing model/default/data/router/named/facade/generic/subdocument/scalar/field/
  wire/invalid-value checks retained. Removed type imports have explicit negative
  checks, not positive aliases. Actual public context/rule types replace them.
- `packages/access-router/test/packed-consumer-compatibility.test.ts`: migrated
  installed runtime and declaration fixtures, retaining original GET/HEAD/both
  advanced reads, permission grants, live setters, shallow replacements, snapshots,
  model-default isolation and endpoint/OpenAPI assertions. Added root/direct
  independence in both directions and atomic removed-key diagnostics. Root and
  advanced context/rule types compile in import/require consumers; removed keys and
  the removed type are negative checks only.
- `packages/access-router/test/migration-guide-fixture.ts` and
  `test/export-contract.test.ts`: extraction requires implemented guidance and
  three classified nested-rule targets. All ten prior guide purposes remain,
  including historical negative source and the single complete owned workflow;
  there are thirteen classified TypeScript blocks. Declaration hover checks retain
  all fourteen endpoint mappings on operation properties and inspect context/rule
  members. Optional-never exclusion constraints are tested as diagnostics, not
  mistaken for usable old aliases or removed source identifiers.
- `packages/access-router/test/owned-authorization-hooks.types.fixture.ts`: migrated
  `read` to `{ default: guard, basic: guard }`, preserving guard/facts coverage and
  fixing both legacy installed `.mts`/`.cts` consumers exposed by NOA-03.
- `packages/access-router/test/basic-data-list.integration.test.ts` and
  `test/service-authorization-public-boundaries.integration.test.ts`: migrated the
  remaining computed list guard and two flat positive policies. Assertions remain
  intact; requestSchemas, permission fields and negative retired selectors stay as-is.
- `packages/access-router/test/service-authorization-boundary-admission.contract.test.ts`:
  migrated one stale mock to `isAllowedRoute`, preserving all hydration-control
  forwarding/assertions and adding exact root-context assertions for list, read and
  readFilter. The test still has 68 cases; no production fallback was added for the mock.
- `website/docs/packages/access-router/{configuration,routing,services}.mdx`:
  secondary guidance and marked compiler-checked examples agree with shipped docs.

### Direct dependent audit and narrow source adjustment

- `packages/access-router-deco/src/decorators/method.decorators.ts` derived
  `RouteGuardOperationKey` from every extended operation option path. The nested
  API therefore admitted `RouteGuard('read.root')` at compile time although the
  existing runtime scalar allowlist rejects it with `Invalid @routeGuard operation`.
  Derive that type from `HOOK_DEFINITIONS.routeGuard.operations` instead. No new
  decorator operation, runtime admission rule or bootstrap behavior was introduced.
  New negative strict/runtime checks cover nested/retired hook names; positive
  typed class/property options cover nested configuration. The decorator README
  and method JSDoc explain that distinction. These are the only behavior-adjacent
  source changes outside access-router's primary documentation scope.
- `packages/access-router-runtime/src/index.ts` delegates `ModelRouterOptions` and
  `DataRouterOptions`; its config loader/examples/tests contain no live flat rules.
  No runtime package edit was needed.
- `packages/create-access-router-mongo-starter/template/api/src/routers.ts` uses
  scalar base `OPEN_ACCESS`, also deliberately used by field policy. Its separate
  middleware blocks advanced mutation paths and its configuration disables root.
  No starter edit was needed; those contracts were not broadened.
- Workspace-wide spelling audit also inspected apps and client integration usage.
  Remaining spellings are request-schema APIs/validation exports, client methods
  or result-variable names, business fields, permission strings, historical
  documentation/removal diagnostics or negative selectors/tests. None is a live
  supported flat operation configuration. Historical tasks/artifacts were not edited.

## Verification

Working directory: repository root. Node **26.12.1**, pnpm **11.18.0**.
Fresh `_tmp-noa04-I2bo1b99` was created with
`mktemp -d -p "$PWD" _tmp-noa04-XXXXXXXX` and confirmed ignored with
`git check-ignore _tmp-noa04-I2bo1b99`. Build/test invocations are serialized.
Replace the quoted `<repo-root>` placeholder before running commands.

```sh
TMPDIR='<repo-root>/_tmp-noa04-I2bo1b99' pnpm --filter @web-ts-toolkit/access-router... build
TMPDIR='<repo-root>/_tmp-noa04-I2bo1b99' pnpm --filter @web-ts-toolkit/access-router typecheck
TMPDIR='<repo-root>/_tmp-noa04-I2bo1b99' pnpm --filter @web-ts-toolkit/access-router test --reporter=default --reporter=json --outputFile.json='<repo-root>/_tmp-noa04-I2bo1b99/package-results.json'
TMPDIR='<repo-root>/_tmp-noa04-I2bo1b99' pnpm --filter @web-ts-toolkit/access-router exec vitest run --config vitest.config.ts test/service-authorization-boundary-admission.contract.test.ts --reporter=default --reporter=json --outputFile.json='<repo-root>/_tmp-noa04-I2bo1b99/root-fixture-results.json'
TMPDIR='<repo-root>/_tmp-noa04-I2bo1b99' pnpm --filter @web-ts-toolkit/access-router-deco... build
TMPDIR='<repo-root>/_tmp-noa04-I2bo1b99' pnpm --filter @web-ts-toolkit/access-router-deco typecheck
TMPDIR='<repo-root>/_tmp-noa04-I2bo1b99' pnpm --filter @web-ts-toolkit/access-router-deco exec vitest run --config vitest.config.ts test/route-guard.runtime.test.ts test/strict-consumer-types.test.ts --fileParallelism=false --reporter=default --reporter=json --outputFile.json='<repo-root>/_tmp-noa04-I2bo1b99/deco-results.json'
TMPDIR='<repo-root>/_tmp-noa04-I2bo1b99' pnpm --filter @web-ts-toolkit/access-router-runtime... build
TMPDIR='<repo-root>/_tmp-noa04-I2bo1b99' pnpm --filter @web-ts-toolkit/access-router-runtime exec vitest run --config vitest.config.mts test/strict-consumer-types.test.ts test/route-order.test.ts --fileParallelism=false --reporter=default --reporter=json --outputFile.json='<repo-root>/_tmp-noa04-I2bo1b99/runtime-results.json'
TMPDIR='<repo-root>/_tmp-noa04-I2bo1b99' pnpm --filter @web-ts-toolkit/access-router test --reporter=default --reporter=json --outputFile.json='<repo-root>/_tmp-noa04-I2bo1b99/package-final-results.json'
```

- Fresh transitive CJS/ESM/declaration build: passed.
- Required package typecheck (includes another transitive build): passed.
- Initial full suite: **195 files passed / 1 failed; 6,709 passed / 3 failed**.
  No excluded/skipped/todo tests. Failure resolution is below, not a claimed baseline.
- Focused mock migration: **1 file / 68 passed**.
- Decorator transitive build and source typecheck: passed. Focused suites: **2 files /
  13 passed** (route guard 8, installed strict consumers 5).
- Runtime transitive build: passed. Focused suites: **2 files / 6 passed** (route
  order 5, strict consumer 1). Unchanged starter source was audited, not retested here.
- Final full package command above rebuilt transitively, then passed **196 files /
  6,712 tests**, **0 failed / skipped / todo**, with **no exclusions**. Vitest duration:
  **1,278.22 seconds**. All source/test edits preceded this final invocation.
- Within that final suite: operation/capture matrix **863**, strict consumer **49**,
  owned-authorization types **2**, packed compatibility **13**, documentation examples
  **84**, and declaration/export contract **49** all pass. Those are subsets, not
  extra tests added to the 6,712 total.
- Targeted ESLint and Prettier, relative document file links (**87**), new migration
  heading/index links, and `git diff --check`: passed. Exact scoped formatting/lint
  commands are below. Vitest's config-loader future-compatibility warning is non-fatal.

### Failures resolved, not excluded

The initial full command reproduced three failures in
`test/service-authorization-boundary-admission.contract.test.ts`, test family
`independent root %s dispatch omits hydration controls` for **list/read/readFilter**:
`TypeError: req.macl.isAllowedRoute is not a function` at
`src/routers/root-router.ts:RootRouter.isAllowed`. That unit fixture supplied only
`req.macl.isAllowed`, the pre-NOA-02 root admission seam. Replace the mock member
with `isAllowedRoute` and assert `(modelName, list-or-read, 'root')`. All previous
status/service-argument assertions stay intact. The focused 68-case rerun and the
final full suite both pass. This was an unmigrated test consumer, not a demonstrated
earlier runtime implementation bug. No access-router production source fix was needed.

- A source-template parse probe caught a newly wrapped `as const`/`satisfies`
  newline before strict consumers ran. Fixed the template; parse probe now has zero
  diagnostics. This was a fixture authoring error, not an earlier runtime bug.

### Exact final scoped lint/format commands

The commands use the preserved file manifest, not scratch-only lists. Run from
repository root; replace `<repo-root>`. `llms.txt` is an index with no Prettier parser.

```sh
TMPDIR='<repo-root>/_tmp-noa04-I2bo1b99' node <<'NODE'
const fs = require('node:fs');
const cp = require('node:child_process');
const directory = 'docs/task-artifacts/access-router/20261103-100245-noa04-installed-consumers';
const files = JSON.parse(fs.readFileSync(directory + '/files.json', 'utf8'));
for (const args of [
  ['exec', 'eslint', ...files.filter(file => file.endsWith('.ts'))],
  ['exec', 'prettier', '--check', ...files.filter(file => !file.endsWith('llms.txt')),
    directory + '/handoff.md', directory + '/files.json', directory + '/doc-acceptance.json',
    directory + '/verification-summary.json'],
]) {
  const result = cp.spawnSync('pnpm', args, { stdio: 'inherit', env: process.env });
  if (result.status !== 0) process.exit(result.status || 1);
}
NODE
git diff --check
```

### Installed-consumer conditions

Strict legacy consumers cover ESNext/Bundler `.ts` plus NodeNext `.mts` and `.cts`.
All migration targets compile separately under Bundler, NodeNext import/require and
Node16 import/require; original historical/negative checks remain separate.
Packed tests install production-transformed flattened tarballs and the actual
build-artifact package tree, each with Express/Mongoose minimum peers **5.0.0/8.0.0**
and current tested peers **5.2.1/9.11.4**. They run ESM/CJS JavaScript and emitted
NodeNext consumers, check root/advanced/processors declarations (current peers with
`skipLibCheck: false`; minimum peers retain the existing true setting), and compile
the exact shipped migration targets. No source aliases/deep imports/casts substitute
for the new operation contract. Existing unrelated processor casts are unchanged.

All **13** guide blocks classify explicitly: **11 partial**, **1 complete-runtime**,
**1 expected-error**. Each positive target compiles through public installed types;
the historical negative source still receives its required diagnostics. The single
owned complete workflow executes in both ESM/CJS NodeNext and Node16 conditions in
packed consumers. README complete data split and marked website examples are covered
by the 84-case documentation suite. The production publish tree contains the matching
guide; packed tests compare current README/MIGRATION/llms bytes, declarations and JS.

## Remaining gates and preservation limits

Full repository V3 (`pnpm build`, `pnpm test`, `pnpm lint`) and independent NOA-05
review are intentionally not started here. This handoff does not mark tasks complete.

Reviewed scratch build/type/lint/format logs, both full Vitest JSON summaries, focused
result JSON, generated consumer/diagnostic evidence and the document-preservation
probe. Reconciled the final JSON with Vitest's **196 / 6,712** log summary. This bundle
preserves curated counts, failure resolution and the migration ledger, not raw logs
with local paths, generated
consumer trees, dependencies, caches, databases, build output or tarballs. Scratch
paths in commands are disposable historical output locations, not continuation
prerequisites. Maintained tests and shipped docs are the reproducible inputs; this
summary is not a self-contained reproduction bundle. Other tasks' scratch and
evidence remain untouched.

Final artifact review passed: local links/manifest paths, JSON validity, non-ignored
destinations, formatting, whitespace and machine-local-path/private-identifier hygiene.
All 23 maintained manifest files predate the final package invocation. No required
NOA-04 verification is pending; full repository V3, broader dependent-package suites
and independent review remain the explicitly unrun NOA-05 integration work.
