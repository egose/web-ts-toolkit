# NOA-01 F1 admission-order correction

Scope: independent [NOA-05 finding F1](../20261103-142416-noa05-independent-review/review.md#f1--preserve-safe-admission-before-new-operation-access-inspection)
in the [nested-operation-access task](../../../tasks/20261103-082614-access-router-nested-operation-access.md).

F1 is corrected and the scoped post-fix checks pass. This is the original admission
owner's remediation handoff, not independent acceptance or a full package/repository
gate. No additional agents, commits, pushes, task-status edits, client edits, or
historical-evidence rewrites were made.

## Exact changes

- `packages/access-router/src/routers/model-router.ts`: in `ModelRouter.fromModel`,
  call existing `assertAuthorizationModeOptions(initialOptions, true)` before
  `assertOperationAccessOptions`. A rejected options Proxy cannot run `ownKeys`
  before proxy-safe admission, and rejection still precedes model registration.
- `packages/access-router/src/runtime.ts`: in `setModelOption`, validate the key
  with existing `assertAuthorizationModeKey` before the operation-access check;
  reuse the admitted `keyStr` rather than calling `String(key)`. In `setDataOption`,
  likewise validate first and pass the admitted string key directly. Non-string
  keys cannot invoke `Symbol.toPrimitive`, `toString`, or `valueOf` through these
  newly inserted checks.
- `packages/access-router/test/nested-operation-access-admission.contract.test.ts`:
  append five maintained F1 cases and import the built `ModelRouter` value and test
  spies. Existing 54 cases and their assertions remain. Three new cases cover the
  regression sites; facade construction and the default-model exact setter are
  the two already-safe controls. Tests assert controlled TypeError/message, zero
  callbacks, unchanged complete bootstrap snapshots/effective policy, no candidate
  model registration, and no publication for unconfigured model/data names.
- This new handoff is the only added durable file in this remediation.

No resolver, public type/helper signature, entry mapping, captured authorization,
field policy, documentation, or client behavior was changed. Retired-key diagnostics
and atomicity remain covered by the complete existing admission suite.

## Narrow analogous-order audit

All `assertOperationAccessOptions` / `assertOperationAccessUpdate` call sites in
access-router source were inspected:

- Model/default/data bulk setters and bootstrap restore entries already put safe
  shape/prototype validation first. Their existing malformed-mode/proxy tests were
  retained and rerun.
- The default-model exact setter already validates key type before inspection;
  the corrected model/data exact setters now use that ordering.
- `api.createRouter` already admits options safely before model dispatch; the
  corrected direct static path now follows the same admission order.
- Private model validation/default-publication helpers receive admitted effective
  options or internally built drafts; recursive operation-access checks are not
  separate public admission paths.

No other analogous ordering correction was needed. This was not a broad proxy,
configuration, or callback-sandbox hardening exercise.

## Red-before / green-after evidence

The five maintained correction tests were added **before** production changes. A
fresh transitive build of the still-buggy source passed. Running the entire
admission file then exited 1: **59 tests, 56 passed, 3 failed, no skips/todos**.

The failing cases were direct static construction and the model/data exact
setters. Each observed one forbidden trap/coercion invocation. Their snapshot and
effective-policy assertions ran before the failure and passed; facade/default
controls passed. After the three-site ordering fix, the identical correction
expectations pass; only test formatting changed between red and green runs.

The historical NOA-05 observer intentionally asserts the bug. It was left
byte-for-byte unchanged and was not repurposed or run as a post-fix acceptance test.

| Post-fix check                                                              | Result                                               |
| --------------------------------------------------------------------------- | ---------------------------------------------------- |
| Fresh transitive package build                                              | Passed, CJS/ESM/declarations                         |
| Direct source typecheck                                                     | Passed                                               |
| Package `typecheck` script, including another serialized transitive rebuild | Passed                                               |
| Complete focused nested matrices                                            | 10 files / **868 passed**                            |
| Affected mode/admission/atomicity subset                                    | 4 files / **249 passed**                             |
| Total post-fix test subset                                                  | 14 files / **1,117 passed**, no failures/skips/todos |
| Targeted ESLint and Prettier                                                | Passed                                               |

Nested matrix breakdown: baseline 28, variants 68, model routes 68,
data/subdocument routes 75, boundaries 269, resolution 180, admission **59**, nested
declaration consumers 3, entries 100, capture 18. The five additional admission
cases account for 868 versus the review's historical 863.

Additional subset breakdown: `owned-authorization-modes.unit.test.ts` **142**,
`hydration-configuration.test.ts` **12**,
`service-authorization-boundary-admission.contract.test.ts` **68**, and
`populate-operation-policy.target-options.test.ts` **27**. These retain malformed
mode/proxy controls, whole/dotted setter atomicity, snapshot restoration, and
target-owned default/override behavior.

Vitest printed its nonfatal config-loader future-compatibility warning. No failed
gate was waived or excluded. The initial test-file formatting warning was corrected
before the passing post-fix formatting check.

## Exact verification commands

Working directory: repository root. Every external build/test/typecheck/formatter
received absolute checkout-local TMPDIR. `_tmp-noa01-f1-6UiIL6Cp` was freshly created
and confirmed ignored with `git check-ignore` before running them. Commands ran
separately and serially, never concurrently.

Replace `<repo-root>` below with the checkout path before execution. Reporter/log
destinations are disposable historical scratch outputs, not archive prerequisites.

```sh
git check-ignore _tmp-noa01-f1-6UiIL6Cp
TMPDIR='<repo-root>/_tmp-noa01-f1-6UiIL6Cp' pnpm --filter @web-ts-toolkit/access-router... build
TMPDIR='<repo-root>/_tmp-noa01-f1-6UiIL6Cp' pnpm --filter @web-ts-toolkit/access-router exec vitest run --config vitest.config.ts test/nested-operation-access-admission.contract.test.ts --reporter=default --reporter=json --outputFile.json='<repo-root>/_tmp-noa01-f1-6UiIL6Cp/admission-before.json'
```

The preceding build passed and the preceding test command is the intentional
pre-fix red result. After the fix:

```sh
TMPDIR='<repo-root>/_tmp-noa01-f1-6UiIL6Cp' pnpm --filter @web-ts-toolkit/access-router... build
TMPDIR='<repo-root>/_tmp-noa01-f1-6UiIL6Cp' pnpm --filter @web-ts-toolkit/access-router exec tsc --noEmit -p tsconfig.typecheck.json
TMPDIR='<repo-root>/_tmp-noa01-f1-6UiIL6Cp' pnpm --filter @web-ts-toolkit/access-router typecheck
TMPDIR='<repo-root>/_tmp-noa01-f1-6UiIL6Cp' pnpm --filter @web-ts-toolkit/access-router exec vitest run --config vitest.config.ts test/operation-access-baseline.contract.test.ts test/operation-access-variants.contract.test.ts test/operation-access-model-routes.integration.test.ts test/operation-access-data-subdocument-routes.integration.test.ts test/operation-access-boundaries.integration.test.ts test/nested-operation-access-resolution.contract.test.ts test/nested-operation-access-admission.contract.test.ts test/nested-operation-access-consumer-types.test.ts test/nested-operation-access-entries.integration.test.ts test/nested-operation-access-capture.contract.test.ts --reporter=default --reporter=json --outputFile.json='<repo-root>/_tmp-noa01-f1-6UiIL6Cp/nested-after.json'
TMPDIR='<repo-root>/_tmp-noa01-f1-6UiIL6Cp' pnpm --filter @web-ts-toolkit/access-router exec vitest run --config vitest.config.ts test/owned-authorization-modes.unit.test.ts test/hydration-configuration.test.ts test/service-authorization-boundary-admission.contract.test.ts test/populate-operation-policy.target-options.test.ts --reporter=default --reporter=json --outputFile.json='<repo-root>/_tmp-noa01-f1-6UiIL6Cp/admission-atomicity-after.json'
TMPDIR='<repo-root>/_tmp-noa01-f1-6UiIL6Cp' pnpm exec eslint packages/access-router/src/runtime.ts packages/access-router/src/routers/model-router.ts packages/access-router/test/nested-operation-access-admission.contract.test.ts
TMPDIR='<repo-root>/_tmp-noa01-f1-6UiIL6Cp' pnpm exec prettier --check packages/access-router/src/runtime.ts packages/access-router/src/routers/model-router.ts packages/access-router/test/nested-operation-access-admission.contract.test.ts
```

## Worktree preservation and evidence limits

A pre-edit SHA-256 manifest covered all 2,205 tracked/non-ignored worktree files,
including the already-uncommitted NOA-02/03/04 work and old evidence. After source
and test checks, only the two source files and one maintained test listed above
differed; the other **2,202 files were unchanged**. Adding this new handoff does not
rewrite those original files. In particular, the task, all historical artifacts,
README/MIGRATION/website, and client files remain untouched by this correction.

Final preservation checks reconciled that three-file delta plus this one new
handoff, with no deleted files. The handoff and maintained admission test are not
ignored; artifact references resolve, the local-path/private-identifier scan is
clean, and whitespace checks pass. Prettier passed for the handoff and the three
changed code/test files; `git diff --check` passed for the shared worktree.

Reviewed scratch contents: before/after build and typecheck logs, three reporter
JSON files, formatter/linter logs, file-hash manifests, and disposable Node compile
cache. Generated consumers and database temporary directories were cleaned by the
tests. This summary preserves the useful observations, counts, scope and commands;
raw logs/JSON, full manifests, dependency trees, databases, consumers and ignored
dist/cache output are omitted. This is not a self-contained raw reproduction
archive. The maintained regressions are the executable correction evidence.

## Outstanding review gates

No F1-specific blocker or scoped test failure remains. Full unfiltered package and
root final gates were deliberately not rerun by this owner; NOA-05 must independently
rerun invalidated final gates after all remediation. F2's client metadata mismatch
is separately assigned and was not investigated or modified here. The prior
6712-test package/root build/lint passes remain historical, not a fresh claim for
this corrected source. Coordinator retains task-status ownership.
