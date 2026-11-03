> Historical document preserved from ignored task scratch storage.
> Scope and limitations: `docs/task-artifacts/access-router/README.md`. References to omitted
> artifacts are historical, not available execution prerequisites.

# FP-08 selected BSON/container budget fix — implemented and verified; stop here

Only FP-08 / FP06-R2 was implemented. No delegation, commits, publication,
dependency/lock/history changes, reverts, authority changes, benchmark changes or
workspace-wide build/test/lint commands. Commands were foreground, serial and awaited.
The coordinator owns task documents. Its reported workspace-verification clarification
changed the shared task during the interruption; this agent did not edit task documents.

After the interruption, saved command results, current source, live dist and the new
packed artifact were inspected before continuing. Production source was already fixed
and tested; resumption added four read-only/mixed-fallback cases. Final contract review
then found an exotic native-as-document root mismatch, added three regression-first
cases and a narrow document-root guard, and reran all required scoped gates on new
bytes. Preservation/artifact audits passed. No owned jobs remain.

## Exact product scope

`handoff-fp08-only.diff` is the complete delta against incoming FP-07 work, **not HEAD**:

| File under `packages/access-router/` | Added / removed lines |
| --- | ---: |
| `src/acl/trusted-output-materialization.ts` | 302 / 22 |
| `test/authorization-fast-path-native.unit.test.ts` (new) | 548 / 0 |
| `test/authorization-fast-path-native.runtime.fixture.mjs` (new) | 115 / 0 |
| `test/packed-consumer-compatibility.test.ts` | 54 / 3 |
| `README.md` (precise active-native caveat only) | 11 / 0 |

The larger native helper is confined to the existing **selected BSON value fallback**.
It explicitly handles known families instead of giving the general BSON serializer
application containers/descriptors. An AST-backed comparison proves the ordinary
`materializeTrustedOutputValue` function body is unchanged outside its BSON branch.
Native preparation closures/sets are allocated only when that BSON branch is entered.
No new source eligibility scan, grant copy, snapshot or output-identity walk exists.
`src/acl/service-authorization.ts`, including FP-07's four-line guard, is byte-preserved.

## Normalization / budget semantics

- Before serialization, prepare all selected `Code.scope`, `DBRef.fields`/IDs,
  normalization results and recursively contained BSON/ordinary containers using the
  **same supplied remaining budget** and outer active-ancestor set. No fresh budget
  for scopes, children or hook expansions. A failed budget remains failed.
- Charge native admission once; scope/fields containers are real child levels.
  A different hook-result root also consumes admission work at the replacement's
  level. Aliases are copied/charged per emitted occurrence, not skipped by identity;
  ancestor cycles reject. Existing array-length/hole and Map-entry work charging stays
  conservative. Example: Code + `{ leaf: 'selected' }` costs three slots, so 19,997
  pre-used slots succeeds and 19,998 fails. Scope chain tests admit depth 100 and
  reject 101, including native children and an explicitly supplied starting depth.
- Descriptor-based reads reject accessors without invoking them; proxy values or
  proxy prototypes reject without traps. Protected keys are omitted before reading
  their value slots. Plain containers must be ordinary/null-prototype records,
  arrays or real Maps. No native-family inference from `_bsontype`/constructor names.
- Observe a supported data-method `toBSON` **once per encountered occurrence**, including
  self-return and inherited data methods. Do not chase a second hook on a different
  hook-result root. Prepare nested child hooks once as well. Arbitrary application
  hook computation/allocation is still not bounded; subsequent library-owned traversal
  is admitted and bounded. Controlled `ServiceAuthorizationError` is propagated;
  arbitrary native errors become controlled authorization errors.
- Safely reconstruct canonical known native state and data containers, suppressing
  a repeated wire hook. DBRef's ordered wire document is reconstructed safely rather
  than letting BSON's `Object.assign` read application fields or trigger setters.
  Prepared sparse arrays have own undefined slots, not inherited numeric reads.
  No-scope Code has an own scope slot, never a hook-installed inherited scope.
  A bounded flat output-key check rejects inherited Object-prototype accessors before
  the deserializer's ordinary assignments; it is not a recursive integrity pass.
- Perform **one** BSON serialize/deserialize on the prepared value. No post-normalization
  whole graph rewalk or second wire observation. Ordinary BSON wire types/shapes remain:
  ObjectId, Long/Timestamp, Decimal128, Binary/UUID, Double/Int32, BSONRegExp/Symbol,
  MinKey/MaxKey, Code with/without scope, DBRef and nested native containers. BSON's
  `promoteValues:false` numeric shape, undefined/array behavior and DBRef output type
  are retained for ordinary supported controls.

### Precise active-fallback caveats (shipped README)

Accessor state/hooks, custom serializer overrides, chained hook results, unsupported
prototypes and a native used *as the document root* of a scope/fields container fail
closed rather than delegating unsafe traversal. Nested natives *within* ordinary
scopes/fields remain supported. BSON-contained RegExp uses intrinsic state; supported
Date data-method normalization is observed once. Strings/binary storage are scalar,
not a per-byte structural budget. No strict/historical native-observation equivalence
is claimed. This does not broaden default/copy behavior or visit fetch-only sources.

Invalid native getter returns still omit fail-closed. **Structural budget exhaustion
poisons the shared result**, including exhaustion discovered in a virtual return:
the result is a controlled failure with no partial data, not a partial successful
response. Tests cover both omission and whole-result budget failure explicitly.

## Regression-first evidence / recovery details

- `v2-native-before`: **36 failed / 24 passed** on untouched incoming materializer.
  Nine failures were fixture instrumentation/setup issues (nonconfigurable BSON
  namespace exports cannot be spied upon; an expected DBRef used a fresh random ID).
- Corrected only the new fixture, then `v2-native-before-corrected`: **35 failed /
  25 passed**, still before any materializer edit. This includes the promoted first
  five reviewer cases: actual Service LIST/READ, remaining budget, depth, and all
  **21,000** wire accessor reads before later rejection. Failure logs are retained.
- First implementation: **60/60 passed**. Additional native safety/normalization
  controls: **71/71**, then 73; read-only/mixed-fallback suite: **77/77**.
- `v2-document-root-before`: **three additional failures before the last guard**.
  A DBRef used as an entire Code scope/DBRef fields root, directly or via a scope
  hook, was converted into an ordered document rather than rejected as documented.
  A document-root mode is now carried through normalization and rejects native
  document roots before native reconstruction. Ordinary nested DBRefs remain supported.
  Final native suite: **80/80**. All later `handoff-*` gates use these final bytes;
  earlier `final-*` / `resumed-*` artifacts/results remain preserved intermediate work.
- Initial source typecheck caught inferred Map-key types; annotation fixed it.
  Initial ESLint caught a deliberate sparse-array literal; equivalent explicit hole
  construction fixed the fixture without dropping sparse-array coverage.
- Supplemental BSON-6 diagnostic initially mocked the wrong Mongoose resolution
  identity (16 failed). An explicit isolated alias fixed only diagnostic setup;
  **19/19** then passed. This uses already-installed BSON **6.10.4**, **not** an actual
  Mongoose-8 installation or minimum-peer gate claim. Main runtime uses Mongoose
  **9.11.4**, MongoDB **7.7.0**, BSON **7.3.2**; both installed serializers were read.
- Extra packed consumer script's first run passed its three compiles but could not
  resolve root `esbuild`; resolving the existing package dependency fixed the script.
  No installation. A fresh extracted tree and fresh bundle then passed all executions.
- Resumed formatter check found the four newly added cases needed formatting; fixed
  only that new test, then final scoped ESLint/Prettier/diff and focused suite passed.

## Commands actually run / final passing evidence

Repo root, with installed dependencies. Each prefix has `.command.json`, `.result.json`
and `.log`; the JSON records the exact argv and times, including the 44-file list.

V2 prefix:

```sh
pnpm --filter @web-ts-toolkit/access-router exec vitest run --config vitest.config.ts --no-file-parallelism --maxWorkers=1
```

| Evidence prefix | Command / outcome |
| --- | --- |
| `handoff-v1-build` | `pnpm --filter @web-ts-toolkit/access-router... --workspace-concurrency=1 build` — passed; affected package + required transitive builds only |
| `handoff-v2-focused` | V2 + 44 files — **1,950 passed**, including all 80 native and 50 FP-07 owner cases; runtime/options/direct/public/helper/native-BSON/default/copy/strict-finalizer gates |
| `handoff-v2-consumer` | V2 + `test/export-contract.test.ts test/strict-consumer-types.test.ts test/documentation-examples.test.ts` — **154 passed / 3 files** |
| `handoff-v2-packed-public` | V2 + `test/packed-consumer-compatibility.test.ts --testNamePattern FP-08` — **1 passed**, other 11 explicitly excluded; `TMPDIR=<system-tmp-path>`, new `WTT_ACCESS_ROUTER_CONSUMER_EVIDENCE_DIR` |
| `handoff-v2-review-nine` | `pnpm exec vitest run --config _tmp-fp08-20261030-204719/vitest.review.config.ts --no-file-parallelism --maxWorkers=1 --reporter=verbose` — **9 passed**, all seven reviewer defect regressions + both work proofs |
| `handoff-bson6-diagnostic` | `pnpm exec vitest run --config _tmp-fp08-20261030-204719/vitest.bson6.config.ts --no-file-parallelism --maxWorkers=1` — **19 passed**, diagnostic only |
| `handoff-source-typecheck` | `pnpm --filter @web-ts-toolkit/access-router exec tsc --noEmit -p tsconfig.typecheck.json` — passed |
| `handoff-v5-eslint` | `pnpm exec eslint packages/access-router/src packages/access-router/test` — passed, no workspace-wide lint |
| `handoff-v5-prettier` | `pnpm exec prettier --check` over the five owned product files above — passed |
| `handoff-v5-diff-check` | `git diff --check` — passed; preservation audit additionally checks all five owned files with no-index whitespace checks |
| `handoff-packed-current-consumers` | `node _tmp-fp08-20261030-204719/packed-current-consumers.mjs _tmp-fp08-20261030-204719/handoff-packed-evidence/native-budget-PRKHO4/web-ts-toolkit-access-router-0.99.0-test.tgz handoff-packed-current-consumers` — passed, no dependency install |
| `handoff-artifact-audit` | `node _tmp-fp08-20261030-204719/audit-final-artifact.mjs handoff handoff-packed-current-consumers-result.json` — passed |
| `handoff-preservation-audit` | `python3 _tmp-fp08-20261030-204719/audit-preservation.py handoff` — passed, **no owned jobs** |

**Product V2 total: 2,105 tests / 48 files** (not a full-package run), plus nine
unmodified reviewer fixtures and 19 BSON-6 diagnostic checks. The new review config
keeps the original fixture root but uses **this directory's new cache**. All prior
review fixtures, failure logs **and incoming generated cache** are byte-preserved.

The original two independent work proofs retain zero active stage/grant/deep-context/
whole-source/transfer/identity/admission work, one resolution/configuration copy,
six contexts/hooks, **144 callbacks**, one adapter read; embedded derivation remains
one. These are instrumented proofs, **not new latency measurements**.

## Actual newly packed public/consumer results

Permanent regression reuses the existing production manifest transformer, packer,
owned real Mongo and asynchronous child-consumer runner. It also runs inside existing
full packed/artifact consumer smoke workflows when FP-05 later executes those gates.
The focused gate uses package self-reference to the newly extracted public exports;
existing links supply only peers/transitive deps, not access-router implementation.

`handoff-packed-evidence/native-budget-PRKHO4/result.json`:

| Real persisted value | Public LIST | Public filter READ |
| --- | ---: | ---: |
| Ordinary Code with nested DBRef | 200, shape checked | 200, shape checked |
| Code scope, 20,001 entries | 400, controlled/no partial data | 400, controlled/no partial data |
| DBRef fields, 20,001 entries | 400, controlled/no partial data | 400, controlled/no partial data |

**Six actual document hooks**, no published overbound entries. Unit/reviewer wire
accessor expansion performs **zero** getter reads and one application hook observation.

`handoff-packed-current-consumers-result.json` separately verifies **all 14 newly packed dist
files equal live bytes**, strict Bundler/Node16/NodeNext with `skipLibCheck:false`, then
actually executes newly emitted Node16 ESM/CJS, NodeNext ESM/CJS, a freshly bundled
packed README, and the permanent native public fixture (**six executions**). No old
tarball/extraction/bundle was reused. Native output type controls also pass in units.

## Final identities / preservation / next owner

- New root ESM: `a0fff8777b4185157578f8875ab043f7100537f0be035c616ad3facb5e2aef4f`.
- New root CJS: `c069cae63c91810d8e65c473677c21377f596b0db2cf12de28320fd57f15fa56`.
- Actual tarball: `a94ea725cbe74b217d947d298374f677c495fc351092d58f52dc16e756728c67`.
- Lock: `ef86ef24726d09f81d1262656920d6215caeb0f26e345198db2d27b8ab7ab314` unchanged.
- `handoff-current-artifact.json` hashes current owned source/test/docs and all 14 dist
  files; `handoff-fp08-current-dist/` preserves them. **Eight declarations byte-identical**
  to incoming. Exact CJS/ESM public runtime names unchanged **46 / 48 / 6**; no issuer,
  marker, public budget, new package or export introduced.
- `handoff-preservation-and-jobs.json`: **600 incoming identities**, only the three owned
  existing product files, two live root runtime outputs and coordinator-owned task
  update differ. All other incoming access-router tests/source, FP-07/reviewer evidence
  remain unchanged. **1,512 outside-access-router files** match FP-07's earlier manifest.
  Official-before **542**, old final-before **542**, old measured candidate **549**
  sealed files were independently rehashed successfully. HEAD/status are preserved
  except the two authorized new test/fixture files; no jobs remain.

Old measured ESM **`c26c217b9228be53cac54ed2a1bbde2920d04c61676569b7df32e3283e5dc401`**
and incoming FP-07 ESM **`55af08e37a072258fa20f9233b2aad6888b942231cf793bdf01112079584c3e3`**
remain historical artifacts, **not timings or acceptance of these new fixed bytes**.

Stop FP-08. Reopened FP-05 owns full **affected-package** V3/V4/V6 gates, minimum/current
packed/artifact workflows and final-artifact/performance revalidation; FP-06 independently
rechecks the fixes. No workspace-wide checks are authorized, even later. No full-package,
deco, fresh minimum-peer installation, final timing, READ-latency, security-equivalence
or real-application claim is made here. Application arbitrary hook/global mutation and
the already accepted borrowed-state risks remain; exotic native support is deliberately
bounded/fail-closed as documented, not an exhaustive BSON/native security audit.
