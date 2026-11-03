> Historical document preserved from ignored task scratch storage.
> Scope and limitations: `docs/task-artifacts/access-router/README.md`. References to omitted
> artifacts are historical, not available execution prerequisites.

# OAR-02 intentional breaking behavior and verification ledger

No legacy tests were excluded, deleted, marked skipped, or weakened to preserve rich
grants. The two legacy files below are unchanged from incoming work. This is not a
claim that they pass, or that OAR-03/full-package migration is complete.

## Runtime differences delivered by OAR-02

| Previous behavior | Foundation now enforced | Later migration owner |
| --- | --- | --- |
| Rich/native/nested/undefined/proxy grants were copied, borrowed, or changed into empty maps. | Every actual document-hook/utility/supplied-grant boundary rejects an invalid fulfilled map with controlled whole-map 400. | OAR-03/07 tests; OAR-08 consumer guide |
| Strict/default callbacks received repeated whole-grant copies; active callbacks could borrow an application map. | One frozen null-prototype boolean fact map, detached from the application, reused by all stage field callbacks/embedded scopes. | OAR-03 engine cutover; OAR-09 final measurements |
| External returned-map mutations affected later active decisions/embedded replacement evaluation. | Mutations do not alter owning facts in either old engine mode. | OAR-03 handle/memo tests |
| Diagnostic `docPermissions` could be mutable, recopied, or overwritten from `_permissions` during decoration. | Diagnostic facts remain the owning immutable boolean map; document hooks start with singleton empty facts; decoration cannot replace them with serialized metadata. Other legacy context members remain until OAR-03. | OAR-03 exact diagnostic shells; OAR-08 guide |
| Raw output-policy helpers invoked document hooks on arbitrary untrimmed objects. | The raw-policy branch uses frozen empty facts, current captured globals, and explicit output policy; zero document-hook work. The explicit old handle branch remains for atomic removal in OAR-03. | OAR-03/05 complete fresh-helper/capability migration |
| Function-attached `.read`/`.default`/`.sub` slots could become live options. | Captured functions are callable leaves. Own-data lookup and existing fallback grammar are captured before awaits; no function-property traversal. | OAR-06 full option/admission matrix; OAR-08 guide |
| Document/field callbacks shared one one-argument guard type; hook returns were unknown-valued records. | `DocumentGrants`, two-argument `FieldPermissionHook`/`FieldValidation`, separate one-argument `GuardHook`/`Validation` and operation/field interfaces. | OAR-07 downstream integration; OAR-08 docs |

Existing-document update/upsert-update and dedicated existing-parent input retain
their **separate normalized pre-write facts**. Emptying those facts is not the fix:
it could allow `!grants.suspended`. Positive string AND and negative function
predicates pass. Create/raw-input/data/standalone request evaluations get empty facts.
Hydrated input and persistence/lifecycle mutation contexts were not frozen/redesigned.

## Actual old-test run (not a passing gate)

Command, repo root:

```sh
pnpm --filter @web-ts-toolkit/access-router exec vitest run \
  --config ../../_tmp-oar02-recovery-20261031-171950/vitest-legacy-ledger.mjs \
  --no-file-parallelism --maxWorkers=1 \
  test/authorization-fast-path-runtime.unit.test.ts \
  test/service-authorization-finalizer.unit.test.ts
```

Actual result: **71 passed / 18 failed / 89 tests**, two files. Exact cases and
failure output are preserved in `legacy-results.json` and `legacy-ledger.log`.
These are introduced intentional contract differences, not mislabeled baseline failures.

| File / failing cases | Count | Concrete cause / required new expectation |
| --- | ---: | --- |
| fast-path runtime: six dynamic rows, embedded=false/true | 2 | Hooks return `mutable: Date`; expect invalid facts 400 or migrate positive work fixtures to booleans. |
| fast-path runtime: matching active list/read copy counters | 2 | Old default/opposite/dormant assertions require `grantCopies > 0`; owned boolean facts now have zero repeated graph-copy calls in those modes. Keep source/owner/denial assertions. |
| fast-path runtime: ordered async rules, off/dormant/active | 3 | `grants.when: Date` is unsupported; retain callback order tests with computed boolean facts. |
| fast-path runtime: borrowed source/grant mutation, active=false/true | 2 | Rich `mutable: Date` grants reject before fields. Separate source borrowing tests from immutable fact mutation controls. |
| fast-path runtime: stale allow/deny and moved child | 1 | External `grants[0].owner = false` no longer changes the owning stage's facts; moved child sees captured `owner: true`. Old handles will be removed in OAR-03. |
| fast-path runtime: exotic proxy grant fallback | 1 | Proxy fact maps now reject before traps; no rich compatibility fallback. |
| fast-path runtime: trusted/copy-fallback mixed rows | 1 | Hook returns rich Date grants; source fallback positives need boolean grant fixtures. |
| fast-path runtime: metadata=true/false/dotted | 3 | Nested/native grant leaves now reject regardless of serialization posture. Keep metadata DATA/native tests independent of grant facts. |
| fast-path runtime: per-getter views/staged returns | 1 | Rich/nested grant leaf rejected; preserve getter isolation positives using immutable boolean facts. |
| service finalizer: owner grants/stateful decisions after trim | 1 | Assignment to frozen `context.docPermissions.owner` throws; test immutable diagnostic facts and later remove old handle reuse. |
| service finalizer: fresh raw-policy calls | 1 | Raw helper no longer resolves the doc hook; empty facts omit document-dependent `status`, explicit backend `internalNote` remains. |

### One focused old test deliberately migrated now

`packages/access-router/test/document-authorization-validation.unit.test.ts`:
the old “checks binding after grant-native copying” test depended on accepting
`{ when: Date }` and observing `Date.getTime`. Replaced with an explicit invalid-
fulfillment test proving controlled 400, **zero native method calls**, one hook,
retained rejected resolution, and no application-map freeze. Added a boolean-fact
identity test which still rejects a wrong receiving model. All **29** tests in that
file pass. Its original SHA is retained in `incoming-product-identities.json`.

## Preserved failures in this recovery's own verification

- `prewrite-reproduce.log`: the unchanged incoming pre-write test already passed.
  `source-typecheck-incoming.log` also passed. The interruption's earlier failure
  logs were behind the delivered source; no assertion was loosened to “fix” them.
- `regression-before-recovery.log`: 72 pass / 16 fail across initial expanded cases.
  Thirteen failures were new fixture/assertion errors (wrong error matcher, unbound
  DataCore runtime, nonexistent helper name); those were corrected without product
  changes. The corrected new suite established **53 pass / 10 real fail** before
  the recovery implementation (`regression-before-recovery-corrected.log`).
- `regression-after-01.log`: **98/98 runtime cases pass** after the four boundary
  fixes. `regression-final-02.log`: **188/188 pass**, including installed declaration
  positive/negative checks and existing actor/config/owner controls.
- `regression-final-01.log`: one rich old fixture rejected as designed, plus two
  consumer-fixture failures from assuming existing `ModelRequest` was root-exported.
  The valid example now imports that existing type from public `advanced`, without
  adding an unrelated root export, casts, or suppressed diagnostics.
- `prettier-before.log`, `prettier-final-01.log`: formatting failures preserved;
  final changed-file Prettier passes. The first CLI-stdout formatter diff was
  truncated/unsafe and was **never applied** (`format-01.patch`). API formatting
  produced a complete patch; source edits used the patch tool. No old source was
  deleted based on the truncated diff. The recovery's new boundary test's raw
  pre-format copy is retained in this scratch directory.
- `fixture-ast.log`/`fixture-ast-audit.json`: the first AST comparator included
  lexical trailing-comma tokens and reported false. Correct semantic-child audit
  (`fixture-ast-02.log`) proves the incoming **35-case fixture is AST-equivalent**
  after formatting. Reconstruction exactly matches captured incoming SHA
  `d59344b3dc9fb1de16b2f3daa52c4f8e94c774b04b38b97a566c1f31f0008f29`.

No full V3/V4/V7 run or candidate timing was performed. Native/source/stage engine
removal, sticky publication poison/drain/close, exact readonly diagnostic shells,
old handle/flag rejection, broad alternate-write/deco integration, installed migration
documentation, and final performance/peer gates remain with their later task owners.
