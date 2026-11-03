> Historical document preserved from ignored task scratch storage.
> Scope and limitations: `docs/task-artifacts/access-router/README.md`. References to omitted
> artifacts are historical, not available execution prerequisites.

# OAR-07B completion — fresh sequential recovery

**Outcome: OAR-07B is complete within its product-integration scope.** All
non-documentation runtime gates and the complete affected deco gate pass on the
delivered bytes. The unfiltered core diagnostic has only precisely inventoried
OAR-08 documentation/consumer failures. This is **not** full V3/V7, performance,
release or independent-review acceptance. OAR-08/09/10 were not started.

The coordinator alone owns shared task/status reconciliation. No task document,
dependency/lock, previous evidence/cache, commit or publication was changed.
No delegation occurred; every command and child process was foreground, serial
and awaited. **No owned jobs remain.**

## Exact combined packet versus recovery delta

Comparison is against `_tmp-oar07b-20261101-1n6yv551/product-before.json`, not
HEAD's much larger OAR-01–07A redesign. `exact-deltas.json`, `COMBINED-DELTA.diff`
and `RECOVERY-DELTA.diff` contain the complete paths and before/after hashes.

- **Combined OAR-07B: 43 files — five source and 38 test/fixture files.** Two
  test/fixture files are new. No file or original test registration was deleted.
- **This recovery: 33 files — three source and 30 test/fixture files.** One new
  test file. Incoming partial changes and their original evidence are retained.
- No deco source, public types/exports, package metadata/dependencies, permanent Vitest
  configuration, docs or benchmark source was changed by OAR-07B.
- `src/services/base.ts` and `src/acl/output-field-filter.ts` have **no OAR-07B
  delta** against the original packet; their earlier redesign is preserved.

### Five source files, exact purpose

Paths below are relative to `packages/access-router/`.

| File | Combined change and provenance |
| --- | --- |
| `src/acl/virtual-populate-execution.ts` | Retain incoming partial fix: capture every ordinary public target's full hook-input projection, including targets with no private virtuals and hydrated post-write population. A public-only mask is not its hook source. |
| `src/services/service.ts` | Retain incoming partial fix: look up exact private target-row provenance through `getQueryReferenceOriginal` before finalization. No DTO-derived authority or target-policy inheritance. |
| `src/acl/trusted-output-materialization.ts` | Retain incoming bounded dot/bare/quoted-bracket attachment-path grammar. Recovery additionally retains generated metadata aliases inside the existing bounded copy traversal, without an extra authority-transfer graph pass. |
| `src/output/permissions-alias.ts` | Recovery fix: transfer presentation aliases only from serialized admitted DATA using own descriptors; denied source getters remain unread, omitted metadata does not acquire an alias, and business `permissions` fields are untouched. This private map stores a metadata field name, never facts, stages or reusable authorization. |
| `src/acl/document-guard.ts` | Recovery fix: initialize the private `decision` own slot before callbacks and require a bound read execution. An inherited truthy decision cannot authorize a forged DTO-only read; a prototype setter cannot intercept a genuine stage decision. |

Incoming target/provenance/path fixes are supported by the original packet's saved
full-core failures and later related-path evidence, now rerun in full. This recovery
does not pretend it newly authored or cleanly re-ran their pre-fix build.

The two recovery runtime fixes have explicit new failing-before evidence:

- `aliases-before.log`: **one failed / two passed**, then all three pass. The
  unchanged hydration alias integration's two original failures also now pass.
- `guard-before.log`: **two failed / ten passed**, demonstrating actual inherited
  authorization and setter interception before the own-slot fix; all twelve guard
  tests pass in final runtime/full-core runs.

## Semantic migration and retained security purposes

`LEGACY-TEST-MIGRATION-LEDGER.md` is the complete per-file/per-registration ledger.
`CASE-CATALOG.json` preserves original/current bodies, lines and enclosing matrices;
`CASE-DISPOSITIONS.json` links **457 original registration templates** to **1,841
concrete final proof references**, including four explicitly deferred packed-guide
failures from two unchanged matrix templates. `proof-audit.json`: **zero missing
mappings**. These are not fabricated historical expanded-case counts.

- `packet-originals/` preserves **41 original changed-file byte streams** with
  original packet identities. `originals/` separately preserves **45 recovery-entry
  byte streams**, including partial incoming work and inspected unchanged originals.
- No OAR-07A mapped retirement is undone. **No registration was removed or skipped.**
  Existing `virtuals-finalizer.unit.test.ts` retains all fifteen distinct purposes
  using authentic owned calls/stages. Its removed unbound supplied-map premise is
  replaced explicitly by once-per-stage captured-hook/fresh-call proof, not an adapter.
- Retained alternate-path proof covers READ/LIST/count/distinct, create/update/upsert/
  new/dedicated children, separate operation/rows/input/output/target policies,
  negative pre-write predicates, fresh post-write facts, original actor, mutable
  lifecycle contexts, save/afterPersist counts and controlled post-save errors
  without rollback. The stage/publication/native/budget controls remain green.
- Output diagnostics replace raw model/snapshot/lifecycle aliases and all handles.
  Tests observe actual explicit hook inputs, stored documents, adapter connections,
  private inputs and already-filtered presentation instead of removed context state.
  Deco retains class-instance `this`, original `@Request`, hydration and lifecycle
  roles; doc/output/decorate contexts are frozen diagnostics only.
- Raw helpers/data predicates use global actor plus frozen empty facts and exactly
  two field arguments; helpers add no document hook, DB query, virtual or hidden
  authority refresh. `!grants.suspended` on empty facts is not current-document proof.
- The inclusive grouped-count key test now distinguishes 10,000 grouped operands
  from a 20,000-slot isolated source/output projection: the oversized default
  projection rejects, then a trusted private join with denied/unselected output
  succeeds at the unchanged grouped bound. The hidden scalar is never published.
- Captured configuration is reused privately, not repeatedly copied or exposed as
  application state. Native original-input mutation and actual exposure isolation
  remain tested. Invalid default assignments reject synchronously and atomically.

## Actual final serial verification

All commands ran from repo root through this directory's `run.py`, which records
expanded argv, fresh TMPDIR, read-only existing Mongo binary and private cache paths.
Configs only relocate caches/preserve new consumer evidence; no assertion transform,
test-name filter, skip or permanent discovery exclusion is used.

1. **V1** — `pnpm --filter @web-ts-toolkit/access-router... --workspace-concurrency=1 build`
   passes all five necessary packages (`build-final-01.log`). No source edits followed.
2. **Core source TypeScript** — `pnpm --filter @web-ts-toolkit/access-router exec tsc --noEmit -p tsconfig.typecheck.json`
   passes (`source-types-final-01.log`).
3. **Passing full non-documentation V2** — `pnpm --filter @web-ts-toolkit/access-router exec vitest run --config ../../_tmp-oar07b-recovery-20261101-drdazhbz/vitest-runtime-final-01.mjs --no-file-parallelism --maxWorkers=1 --reporter=json --outputFile.json=../../_tmp-oar07b-recovery-20261101-drdazhbz/runtime-final-01-results.json`
   passes **5,662 / 176 complete files**, **zero failures/pending/skips**.
   `runtime-gate-files.json` is the exact explicit file list, including current
   installed hook positive/separate negative type gates and every runtime file.
4. **Full affected deco V4-equivalent stages** — the scoped six-package transitive
   build and `pnpm typecheck` pass in `deco-v4-01.log`; final downstream
   `pnpm --filter @web-ts-toolkit/access-router-deco typecheck` passes again in
   `deco-types-final-01.log`. Then
   `pnpm --filter @web-ts-toolkit/access-router-deco exec vitest run --config ../../_tmp-oar07b-recovery-20261101-drdazhbz/vitest-deco-final.mjs --no-file-parallelism --maxWorkers=1 --reporter=json --outputFile.json=../../_tmp-oar07b-recovery-20261101-drdazhbz/deco-final-01-results.json`
   passes **740 / all 23 files**, **zero failed/pending/skipped**, including packed
   installed consumers, strict consumers, docs examples and actual hydration.
   The first literal script attempt built/typechecked but rejected duplicate CLI
   `--config` flags; the preserved failure is not called a passing script. The
   corrected split executes every V4 stage with a fresh external cache.
5. **Final unfiltered full-core diagnostic** — same Vitest argv as V2 but
   `vitest-full-core-final.mjs` / `full-core-final-01-results.json`, no file/name
   selection: **5,761 registered / 5,740 passed / 21 failed / zero pending**, across
   **180 files**. One docs suite fails during collection. Overall exit is **1**, not
   a claimed V3 pass. All remaining failures are enumerated below.
6. **V5** — exact scoped command
   `pnpm exec eslint --no-cache packages/access-router/src packages/access-router/test packages/access-router-deco/src packages/access-router-deco/test scripts/benchmarks`
   passes (`lint-final-01.log`). Changed-file Prettier checks all **43** combined
   files (`prettier-final-01.log`), and `git diff --check` passes. No root lint/build/test.
7. **Current packed OAR-04/OAR-05** — both gates pass inside the final unfiltered
   packed file: fresh production transform/pack/unpack, ESM/CJS runtime helpers,
   strict NodeNext `.mts`/`.cts` positive hooks and separate removed-API negatives.
   **60 actual HTTP requests**: main helpers 40, installed ESM/CJS helpers four,
   native READ/LIST sixteen. `PACKED-CURRENT-AUDIT.json` independently verifies all
   **14 packed/live outputs** byte-equal in both fresh evidence packets.
8. `surface-final-01.log`: root/advanced/processors ESM/CJS exports agree at
   **46 / 48 / 6**; no private stage/capture/issuer/capability/retired control export.
   All **eight declarations are byte-identical to original OAR-07B entry**.
9. `imports-final-01.log`: **234 test/fixture files**, **zero active deleted-engine
   imports or removed comparator imports**. Negative strings remain intentional.
10. `preservation-final-01.log` / `preservation-final-02.log`, `proof-audit.json` and `FINAL-SEAL.json` pass the
    preservation, exact-delta, original-byte, dependency, surface and no-owned-job checks.

## Precisely bounded remaining OAR-08 work

Full names, compiler file inventories and raw messages are in
`OAR08-REMAINING-FAILURES.md` / `.json` and final full-core results:

| File | Final outstanding result |
| --- | --- |
| `documentation-examples.test.ts` | Collection error: old declaration/JSDoc lookup dereferences a missing symbol (`getJsDocTags`); no cases registered there. |
| `export-contract.test.ts` | **43 pass / four fail**: old optional fast-path/handle hover in `.d.ts`/`.d.mts`, plus old DocumentAuthorization type/hover in both declarations. |
| `strict-consumer-types.test.ts` | **26 pass / thirteen fail**: five old flag/handle/readme resolutions, five old eight-option publication fixtures, three old service-authorization consumer fixtures. |
| `packed-consumer-compatibility.test.ts` | **nine pass / four fail**: actual minimum/current peers × fresh tarball/artifact-tree guide/consumer compiles, now failing solely in four obsolete fixture/README recipe families across `.mts`/`.cts` (146 diagnostics per matrix case), **no peer/node_modules diagnostics**. |

Infrastructure is solved, not relabeled as a product pass: fresh offline registry
metadata is in the actual XDG pnpm path; isolated store/index writes are private;
both numeric API minimum/current peer Bundler/NodeNext/Node16 matrices pass with
the existing minimum-peer skipLibCheck distinction. Artifact assembly uses the
actual tool on five affected packages plus one read-only prebuilt real CLI for
discovery; no synthetic bin, unrelated build or old artifact overwrite. The four
guide matrices still genuinely fail and require OAR-08 migration.

## Fresh artifact, preservation and limits

- Current root ESM: **`cccf18704c7b0415704970044f55a87c3bd3b940161d563f1dc42bd6606077ab`**.
- Current root CJS: `5fb43507b3414cd48c59a15d9864a39c5d02cb6b01ff2ec424a017f59af1b661`.
- Fresh helper/native tarball: `a600319e18b582c5f59532ce6b69fd41dabec4e03a4e2c369518c83cb773ce52`.
- Six runtime entry outputs changed versus packet entry (processors change only
  because their bounded alias copier is shared). **Eight declaration bytes unchanged**.
- HEAD unchanged: `58b22c0d6d3abd4ecce03533e3867d148ff21233`; all work uncommitted.
- **187,546 captured previous evidence/task/lock paths: zero changed.** All original
  packet and recovery archives verify. Earlier failure logs/caches are untouched.
- **134 external packages / 3,510 files: zero changed.** Lock remains
  `ef86ef24726d09f81d1262656920d6215caeb0f26e345198db2d27b8ab7ab314`.
- Sealed baseline ESM remains
  `33662faede23acffc1a90973f51a7407df147afba76e4fbb23eeb99169df3822`.
- Existing pnpm 11.18.0 and Mongo binary are used read-only; all new installs are
  isolated consumer fixtures with forced offline/ignore-scripts, not workspace
  dependency changes. No previous giant fixture tree was cloned.
- **No owned jobs remain.** Tests/servers/Mongo/compiler/build work are finished.

No known OAR-07B product blocker remains. OAR-08 must migrate the installed guide,
JSDoc/export/consumer recipes; OAR-09 must rerun full V3/V7 on documented final bytes
and perform its own benchmarks; OAR-10 independently reviews. No candidate timing,
speedup, transactional rollback, callback sandbox, external permission freshness or
blanket security-equivalence claim follows from this packet.
