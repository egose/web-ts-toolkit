> Historical document preserved from ignored task scratch storage.
> Scope and limitations: `docs/task-artifacts/access-router/README.md`. References to omitted
> artifacts are historical, not available execution prerequisites.

# OAR-08 completion — fresh sequential recovery

**Outcome: OAR-08's installed-documentation/consumer scope is complete.** The shipped
M1–M5 guide, positive workflows, separate expected failures, export/JSDoc contract,
real packed matrices and affected deco documentation/type consumers pass. There are
**no known remaining OAR-08 consumer failures**. This is **not** full V3/V4, benchmark,
release-candidate or independent-review acceptance. **OAR-09 was not started.**

No delegation, task/status edit, commit, publication, dependency/lock edit, revert,
old-evidence/cache edit or workspace-wide build/test/lint occurred. All commands were
foreground, serial and awaited. The coordinator alone reconciles shared task status.
**No owned jobs remain.** `FINAL-SEAL.json` is the final identity/count summary.

## Exact combined packet versus recovery delta

Compare against `_tmp-oar08-7dpnxn5o/product-before.json`, not HEAD's much larger
OAR-01–07 redesign. `exact-deltas-FINAL.json`, `COMBINED-DELTA-FINAL.diff` and
`RECOVERY-DELTA-FINAL.diff` contain complete paths and hashes:

- **Combined OAR-08: 33 product files, four new.** Nine source files have JSDoc-only
  changes. Other changes are docs, three existing type-fixture families, six consumer
  test files, extraction/negative/runtime fixtures, two package manifests and tsup's
  documentation staging. No product file/test registration was deleted.
- **This recovery: 21 files, one new** (the deco documentation runtime runner).
  Incoming partial guide/README/JSDoc/type/test/website work is preserved, not credited
  as newly authored. Original packet and recovery-entry bytes are separately archived.
- The coordinator's task update between packet entry and recovery entry is recorded
  separately in the delta JSON. This child did not author or overwrite it.
- `STRUCTURAL-AUDIT.json` confirms all **nine changed source files**, all **six core
  built JS entries** and **eight core declarations** have identical ASTs to their
  appropriate original, ignoring JSDoc and only the generated shared declaration
  filename. The runtime engine/public type shapes are not redesigned again here.

### Delivered package boundary

- `packages/access-router/MIGRATION.md` ships via package `files`, plus tsup's
  `onSuccess` copy into dist because the actual npm publisher flattens dist and has a
  fixed documentation-copy list. No unrelated build/runtime behavior changed.
- Installed README/llms link the guide; useful unrelated README content and historical
  CHANGELOG entries remain. The new breaking note explicitly supersedes prior
  unreleased flag notes without inventing a release version/date/performance claim.
- Website configuration/hooks/services and affected deco README/website guidance agree.
  The first fact example uses fixed **server-owned** example identity, not a header
  grant. Production authentication/membership remains application-owned.
- Deco's `exports.types` now routes **import → .d.mts / require → .d.ts**. The exact
  typed field example exposed a real CJS-only declaration-routing conflict through
  the request's nominal private Core member. Matching conditions fix it without an
  any-cast, weaker hook, new API, dependency change or runtime export change.

## M1–M5 and preserved test purposes

`LEGACY-TEST-MIGRATION-LEDGER.md` is the detailed per-file/type-family and M1–M5 map.
`CASE-CATALOG.json` preserves original/current bodies and matrices;
`CASE-DISPOSITIONS.json` maps **83 original registration templates → 85 current**,
**zero missing mappings/removals** (`proof-audit.json`). Two new templates add the
five-form guide matrix and two-condition deco module. These are not fabricated
historical expanded counts. No skip or permanent discovery exclusion hides failures.

| Contract | Delivered guide / executable proof |
| --- | --- |
| M1 | Rich/mutable before → boolean DocumentGrants; typed two-argument function plus actual prefixed-string AND/OR rules. Bounded/plain/own/frozen/no rich/native/getter/proxy/symbol/protected/thenable facts; invalid fulfillment whole-operation 400. Missing hooks silently empty; thrown/rejected hooks empty + warning, matching actual code. Pre-write negative facts and separate post-write stages remain explicit. Eager unused fact and closure/external-freshness costs are not hidden. |
| M2 | Full exact ModelOutputContext allowlist, every removed member/filter/handle replacement, disposable isolated versus borrowed trusted input, getter return staging, normal explicit writes and preserved mutable genuine lifecycle hooks. Typed write example, output/removed-member declaration checks, core/deco frozen-context runtime assertions. |
| M3 | DTO/metadata/getDocPermissions are DATA, no handle/issuer/child lookup replacement. Presentation subset 0 reads/hooks; raw helper global + EMPTY + explicit scoped output policy 0 reads/hooks/virtuals/rows; negative EMPTY is not current-document proof. Exact checked normal refresh adds +1 read/+1 hook. Existing private guard controls retain one fresh query without DTO forgery. |
| M4 | Exactly two independent literal server modes, isolated defaults, undefined inheritance, atomic bulk, effective-transition warnings/logger behavior, owner/target/retry/embedded/write/new/dedicated rules, all ten retired names by presence, prohibited wire/per-call placement and matching-revision rollout/rollback. Executed JS block rejects 40 retired presence forms, six invalid values, atomic bulk and global placement. Deco related target stays isolated under both source modes. |
| M5 | New public types/module conditions, removed API/error inventory, mechanical search versus semantic traps, unchanged separate rows/input/output/related/selection/hydration/raw-parent APIs and post-save 400/no automatic retry/no rollback. Every actual guide target compiles; exact old guide source and comprehensive removed calls/members compile separately and must fail at every invalid statement. |

No @ts-ignore/any-cast or suppressed declaration error fixes a positive guide example.
Existing unrelated type-security negatives remain. The comprehensive separate source
also checks actual find/findOne/findById/readSub/helper/default call sites, not just
key-name absence. Field/operation guards retain their distinct two-/one-argument types.

## Final serial verification (repo root)

Every command's full argv/environment/log is retained under this directory. External
Vitest configs only relocate caches and retain newly created consumer scratch; no
assertion transform/test-name filter is used. Only complete named files run.

1. **Literal V1:**
   `pnpm --filter @web-ts-toolkit/access-router... --workspace-concurrency=1 build`
   — passes all five necessary packages (`v1-final-01.log`). The earlier six-package
   affected deco transitive build passes (`build-02.log`). Final literal V1 preserves
   **all 14 tested core outputs** and the staged guide exactly (`FINAL-SEAL.json`).
2. **Source/deco types:**
   `pnpm --filter @web-ts-toolkit/access-router exec tsc --noEmit -p tsconfig.typecheck.json`
   and `pnpm --filter @web-ts-toolkit/access-router-deco typecheck` — pass
   (`source-types-01.log`, `deco-types-01.log`); those source bytes did not change later.
3. **Full OAR-08 core consumer gate:**
   `pnpm --filter @web-ts-toolkit/access-router exec vitest run --config ../../_tmp-oar08-recovery-20261101-16yIdWZ5/vitest-core.mjs --no-file-parallelism --maxWorkers=1 --reporter=json --outputFile.json=../../_tmp-oar08-recovery-20261101-16yIdWZ5/consumers-final-05-results.json test/documentation-examples.test.ts test/export-contract.test.ts test/strict-consumer-types.test.ts test/packed-consumer-compatibility.test.ts`
   — **175 pass / four complete files / zero failed or pending**:
   documentation 71, export 47, strict 44, packed 13. Both previously failing strict
   families and all four packed guide matrices now pass; no collection error remains.
4. **Affected deco installed/docs/type gate:**
   `pnpm --filter @web-ts-toolkit/access-router-deco exec vitest run --config ../../_tmp-oar08-recovery-20261101-16yIdWZ5/vitest-deco.mjs --no-file-parallelism --maxWorkers=1 --reporter=json --outputFile.json=../../_tmp-oar08-recovery-20261101-16yIdWZ5/deco-docs-final-03-results.json test/documentation-examples.test.ts test/packed-consumer-compatibility.test.ts test/strict-consumer-types.test.ts`
   — **27 pass / three complete files / zero failed or pending**: 18 docs, four packed
   sentinel, five strict. Exact .mts/.cts owned module returns `[200,200,200,400]`,
   **three observed Employee reads/hooks/decorations per condition**; these counters
   are source-model reads, not a claimed total including related-target I/O. Related
   output/isolated target mode, changed current authority, original request injection
   and class-instance this are asserted. The model uses the actual Types.ObjectId
   value type, not the SchemaType constructor type.
5. **V5:**
   `pnpm exec eslint --no-cache packages/access-router/src packages/access-router/test packages/access-router-deco/src packages/access-router-deco/test scripts/benchmarks`
   — passes (`lint-final-01.log`). Changed-file Prettier checks all 32 non-CHANGELOG
   combined files (`prettier-final-03.log`); the new CHANGELOG entry is separately
   checked through stdin, historical bytes proven unchanged. `git diff --check` passes
   (`diff-check-final-03.log`). No root-wide lint/build/test.
6. `packed-audit-final-01.log`, `surface-final-01.log`, `catalog-03.log`,
   `ledger-01.log`, `audit-final-02.log`, `seal-final-01.log` pass packaging, public
   exports, original-purpose, structural, preservation and final-identity checks.

## Real installed matrix, HTTP counts and package bytes

`PACKED-FINAL-AUDIT.json` and `consumers-consumers-final-05/` preserve actual installed
packages, transformed tarballs, compiler configs/diagnostics, emitted guide code,
bundles and observed runtime results. No earlier fixture tree/cache was reused for
writes. Installs are forced **offline + ignore-scripts + explicit private store**.

- Actual core minimum peers **Express 5.0.0 / Mongoose 8.0.0**, current pinned majors
  **5.2.1 / 9.8.0**, TypeScript **6.0.3**, each in flattened npm tarball and actual
  release-artifact package-tree installations. Peer package versions are read back
  from node_modules, not inferred from requested ranges. Current peers keep
  skipLibCheck:false; minimum peers retain the existing true distinction.
- Every layout/peer checks strict Bundler, NodeNext .mts/.cts and Node16 .mts/.cts.
  Exact shipped workflow executes five ways: Node16 ESM/CJS, NodeNext ESM/CJS and
  bundled CJS. **20 guide executions / 60 HTTP requests / 80 reads / 80 doc hooks**.
  Each execution observes `[200,200,400]`: two modes each do initial + explicit current
  read; invalid wire mode does zero work. Presentation/raw helpers add zero reads/hooks.
- Two negative sources × five module forms × four peer/layout cells = **40 separate
  expected-failure compiles**, plus ten in strict consumers. Every removed statement
  is checked, with no node_modules diagnostic masking the intended errors. The exact
  JS example additionally rejects 40 false/undefined/inherited/non-enumerable retired
  slots in each matrix cell, not merely truthy flags.
- Retained focused OAR-04/OAR-05 packed gates still execute **60 HTTP requests**:
  main helper 40, installed ESM/CJS helper four, native 16. Workspace-linked focused
  peers observe Mongoose **9.11.4**, explicitly separate from the pinned 9.8.0 matrix.
  Main helper totals: 14 reads/12 hooks/eight virtuals; raw/presentation/retired-control
  work is zero, private guards one read/hook per success/denial, row denial one read/
  zero hooks. Native ordinary cases are 200; overbound Code/DBRef/denied-wire cases
  400 with ten doc/four wire hooks. Raw observations remain in packed result JSON.
- **14 core outputs / all eight declarations / README + MIGRATION + llms are
  byte-identical** in every installed cell. **104 installed relative links** resolve.
  Exact flattened core tarball: **19 files**, no test/src/private state/fixture/
  source-map/hidden tool pin. Actual artifact assembly uses only five affected
  packages plus one read-only prebuilt real CLI for discovery, no synthetic bin or
  unrelated build. Deco's actual tarball is exactly seven intended files; latest
  README and all four JS/declaration outputs match, with correct declaration routing.
- Runtime root/advanced/processors ESM/CJS exports remain exactly **46 / 48 / 6**.
  New fact/field/output diagnostic types are documented in installed declarations;
  no DocumentAuthorization, stage/capture/issuer or retired-control declaration leaks.

## Diagnoses, preservation and final identities

All incoming failures and new failed attempts are retained, not called passes. The
incoming truncated compiler run was reproduced in a fresh retained consumer; the
earlier fact return was already fixed. Remaining request narrowing/fetch inference,
offline store location, artifact input staging, unregistered JS model, deco declaration
condition and HTTP population syntax were diagnosed and corrected. The final checks
above use full files and exact shipped snippets, not filtered successful names.

- Core ESM: **`76c7019b1714d7ab312e86c51476b82006b35a2ddbb52872156dc44c0c90661d`**.
- Core CJS: `3eaa9782017697c44abb60f0a1f4dd7b977101f20d85653bcdc6360237e800dc`.
- Guide SHA256: `1e5998d51141b62ea39ec907f25f31b14d554d85c81cc2fb0ac66a05c26226ea`.
- Core transformed tarball: `432a715c724410f737deafcf8ce67ad8fc2487b4f889081396f971b31550cadd`.
- Deco transformed tarball: `c37a7d26c18209a4a2da02f3d083450808016cc3b540347202695bc28b982338`.
- The ESM already differed from OAR-07B at recovery entry because of incoming JSDoc.
  Final AST audits prove the old `cccf1870…` runtime and all public declaration shapes
  are unchanged apart from comments/shared filename; no new optimization was timed.
- **505,285 prior evidence/task/lock paths: zero changed.** **851 archived original
  byte streams** verify against their own entry manifests. Prior failures/caches and
  baseline artifacts remain untouched. No giant prior consumer tree was cloned.
- **134 external packages / 3,510 files: zero changed.** Package dependency/version
  fields also match original OAR-08 manifests. Lock remains
  `ef86ef24726d09f81d1262656920d6215caeb0f26e345198db2d27b8ab7ab314`.
- Baseline ESM remains
  `33662faede23acffc1a90973f51a7407df147afba76e4fbb23eeb99169df3822`.
- HEAD remains `58b22c0d6d3abd4ecce03533e3867d148ff21233`, all work uncommitted.

No OAR-08 blocker remains. Full core V3, full affected deco V4 on integrated final
bytes, optional full deco compiler matrix, V6/V8 benchmark work and independent
review are **not claimed here**. OAR-09/10 retain those gates. No candidate timings,
speedup, sandbox, external permission freshness, transaction/rollback, blanket
security equivalence or release acceptance follows from this packet.
