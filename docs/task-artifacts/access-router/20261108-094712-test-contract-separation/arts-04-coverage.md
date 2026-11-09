# ARTS-04 public coverage supplement

**All bounded companion rows have executable public evidence: 93 passed cases / six files.**
This supplements [the frozen gap matrix](coverage-gaps.md); it does not rewrite that
historical finding, the 01–03 records, the coordinator task or the ARTS-05 index.
No full-layer/default acceptance is claimed.

## Reading the mapping

- [Machine-readable mapping](arts-04-coverage.json) records all **34 gap rows**
  (16 individual MODE tuples + 18 other groups), **23 surface inventory rows**,
  exact file/full-title/location/occurrence/SHA-256 identities and passed status
  for all 93 new cases, and all **97 retained original public files**.
- The short test tokens below are the literal prefixes of the recorded Vitest
  titles. The JSON supplies the complete exact title and case ID; no count-only
  mapping is substituted. All new runtime paths are under
  `packages/access-router/test/contracts/`. I/T order is READ, LIST, CREATE, UPDATE.
- Retained file IDs resolve through `retainedOriginalPublicContracts` to exact
  current paths/hashes and the original [runtime cases](runtime-cases.jsonl).
  Original public coverage is preserved byte-for-byte, **not rerun in ARTS-04**.
  Runtime passes remain the honest ARTS-01 baseline / mapped ARTS-02 focused results.
  A fresh ARTS-03 checkpoint verifies those bytes and the boundary tooling.
- Every MODE row runs six actual primary service operations, for **96 primary
  operations**. The additional mode families are 8 TARGET + 7 CAPTURE + 4 FALLBACK
  + 8 DETACH: **43 mode-orthogonal cases**, plus **50 other cases**.
  The 94-case ceiling is a limit, not a quota. No original matrix was duplicated.

## Every required gap row

All rows below passed through the delivered `test:contracts` command and its
unchanged preflight. See [verification](arts-04-verification.json) for exact argv.

| Gap row (tuple where applicable) | New passed / ceiling | Exact file and test token(s) | Retained public file IDs |
| --- | ---: | --- | --- |
| MODE-00 (IIII) | 1/1 | `arts04-modes.integration.test.ts` — `'MODE-00'` | F152, F016, F155, F074 |
| MODE-01 (TIII) | 1/1 | `arts04-modes.integration.test.ts` — `'MODE-01'` | F152, F016, F155, F074 |
| MODE-02 (ITII) | 1/1 | `arts04-modes.integration.test.ts` — `'MODE-02'` | F152, F016, F155, F074 |
| MODE-03 (TTII) | 1/1 | `arts04-modes.integration.test.ts` — `'MODE-03'` | F152, F016, F155, F074 |
| MODE-04 (IITI) | 1/1 | `arts04-modes.integration.test.ts` — `'MODE-04'` | F152, F016, F155, F074 |
| MODE-05 (TITI) | 1/1 | `arts04-modes.integration.test.ts` — `'MODE-05'` | F152, F016, F155, F074 |
| MODE-06 (ITTI) | 1/1 | `arts04-modes.integration.test.ts` — `'MODE-06'` | F152, F016, F155, F074 |
| MODE-07 (TTTI) | 1/1 | `arts04-modes.integration.test.ts` — `'MODE-07'` | F152, F016, F155, F074 |
| MODE-08 (IIIT) | 1/1 | `arts04-modes.integration.test.ts` — `'MODE-08'` | F152, F016, F155, F074 |
| MODE-09 (TIIT) | 1/1 | `arts04-modes.integration.test.ts` — `'MODE-09'` | F152, F016, F155, F074 |
| MODE-10 (ITIT) | 1/1 | `arts04-modes.integration.test.ts` — `'MODE-10'` | F152, F016, F155, F074 |
| MODE-11 (TTIT) | 1/1 | `arts04-modes.integration.test.ts` — `'MODE-11'` | F152, F016, F155, F074 |
| MODE-12 (IITT) | 1/1 | `arts04-modes.integration.test.ts` — `'MODE-12'` | F152, F016, F155, F074 |
| MODE-13 (TITT) | 1/1 | `arts04-modes.integration.test.ts` — `'MODE-13'` | F152, F016, F155, F074 |
| MODE-14 (ITTT) | 1/1 | `arts04-modes.integration.test.ts` — `'MODE-14'` | F152, F016, F155, F074 |
| MODE-15 (TTTT) | 1/1 | `arts04-modes.integration.test.ts` — `'MODE-15'` | F152, F016, F155, F074 |
| TARGET | 8/8 | `arts04-modes.integration.test.ts` — `TARGET-+0-+0`, `TARGET-+0-1`, `TARGET-1-+0`, `TARGET-1-1`, `TARGET-2-+0`, `TARGET-2-1`, `TARGET-3-+0`, `TARGET-3-1` | F142, F143, F138, F073, F186 |
| CAPTURE | 7/8 | `arts04-modes.integration.test.ts` — `CAPTURE-read`, `CAPTURE-list`, `CAPTURE-create`, `CAPTURE-update`, `CAPTURE-upsert-create`, `CAPTURE-upsert-update`, `CAPTURE-defaults` | F099, F069, F231, F225 |
| FALLBACK | 4/4 | `arts04-modes.integration.test.ts` — `FALLBACK-0`, `FALLBACK-1`, `FALLBACK-2`, `FALLBACK-3` | F154, F155, F194, F229 |
| DETACH | 8/8 | `arts04-modes.integration.test.ts` — `DETACH-'isolated'-'create'`, `DETACH-'isolated'-'update'`, `DETACH-'isolated'-'upsert-create'`, `DETACH-'isolated'-'upsert-update'`, `DETACH-'trusted'-'create'`, `DETACH-'trusted'-'update'`, `DETACH-'trusted'-'upsert-create'`, `DETACH-'trusted'-'upsert-update'` | F178, F044, F068, F219 |
| ENTRY | 6/6 | `arts04-boundaries.integration.test.ts` — `ENTRY-model`, `ENTRY-data`, `ENTRY-child`, `ENTRY-live`, `ENTRY-custom`, `ENTRY-excluded` | F094, F080, F032, F082, F164, F085 |
| GUARD | 2/2 | `arts04-boundaries.integration.test.ts` — `GUARD-model`, `GUARD-permissions` | F108, F132 |
| CONTROL | 4/4 | `arts04-boundaries.integration.test.ts` — `CONTROL-backend`, `CONTROL-http`, `CONTROL-root`, `CONTROL-business` | F121, F178, F189, F094 |
| ADMISSION | 3/3 | `arts04-boundaries.integration.test.ts` — `ADMISSION-retired`, `ADMISSION-invalid`, `ADMISSION-restoration` | F099, F069, F218, F048, F132 |
| FACTS | 3/3 | `arts04-boundaries.integration.test.ts` — `FACTS-normalized`, `FACTS-rich`, `FACTS-thrown/rejected` | F016, F174, F178, F044, F167 |
| DISTINCT | 3/3 | `arts04-boundaries.integration.test.ts` — `DISTINCT-restricted`, `DISTINCT-complete`, `DISTINCT-dynamic/metadata/Mixed` | F039, F009, F219 |
| COLLECTION | 3/3 | `arts04-data-helpers.integration.test.ts` — `COLLECTION-outer`, `COLLECTION-cumulative`, `COLLECTION-drain` | F132, F205, F128, F048 |
| DATA | 4/4 | `arts04-data-helpers.integration.test.ts` — `DATA-configured`, `DATA-returned`, `DATA-retained`, `DATA-direct/root` | F032, F021, F033, F099 |
| CALLBACK | 5/5 | `arts04-data-helpers.integration.test.ts` — `CALLBACK-core`, `CALLBACK-service`, `CALLBACK-public-aliases`, `CALLBACK-operation`, `CALLBACK-permissions` | F032, F132, F048, F094, F167 |
| METADATA | 2/2 | `arts04-metadata-wire.integration.test.ts` — `METADATA-isolated`, `METADATA-trusted` | F040, F056, F057, F135, F073, F016 |
| DTO | 2/2 | `arts04-metadata-wire.integration.test.ts` — `DTO-model`, `DTO-root` | F164, F079, F174, F135 |
| EXPORT | 2/2 | `arts04-installed-exports.test.ts` — `EXPORT-ESM`, `EXPORT-CJS` | F132, F205, F128, F085, F048, F210 |
| PROCESSORS | 5/5 | `arts04-parsers-processors.integration.test.ts` — `PROCESSORS-copyPaths`, `PROCESSORS-movePaths`, `PROCESSORS-sliceArrays`, `PROCESSORS-countPaths`, `PROCESSORS-maskPaths` | F151, F150, F132 |
| VALIDATION | 6/6 | `arts04-parsers-processors.integration.test.ts` — `VALIDATION-parsers`, `VALIDATION-correlated`, `VALIDATION-selection`, `VALIDATION-model/root`, `VALIDATION-data/root`, `VALIDATION-openapi` | F006, F157, F027, F028, F241, F218, F093, F092, F211, F212, F213, F214 |

## Bounded recipe details and retained obligations

- **COLLECTION:** one individually valid 4 MiB row succeeds; two fail cumulatively.
  The drain sample uses those same two payload rows plus one small held `name`
  row at gate 2, so all three predicates really enter, the other two finish while
  the first remains held, and failed settlement follows its release/completion.
  No partial or late value is published; a subsequent fresh call succeeds.
  A scheduling opportunity is used, not a promised private turn count.
- **ADMISSION:** non-`false` defined populate values deliberately normalize to
  strict (`src/options/populate-policy.ts`, read-only grounding). Therefore
  `'yes'` is not a valid rejection recipe. The companion instead checks the
  documented invalid **global placement** of the target-model setting, preserving
  global/model options and registry. This is an input clarification, not a new
  boolean-enum constraint or a change to the historical matrix.
- **DETACH:** a 16 MiB cumulative payload ledger is not a blanket single-write
  byte cap. The real post-save failure sample uses a BSON Code selected scope
  with 20,001 slots introduced by consumer `afterPersist`; source admission
  fails in both modes while the small submitted row remains committed.
  Grounding: README 308–336 and the retained packed native selected-scope test.
- **EXPORT:** the two new tests install only real built package files and load
  root/advanced/processors by package name in separate Node ESM/CJS processes.
  They check semantic names, default/callable identity, parser/processor behavior
  and private runtime-name absence. **Blocked private subpaths are not inferred
  from name absence:** the retained packed `private-exports.cjs` failure-only
  resolves remain that evidence. Exact passing parent case IDs are in the JSON.
  Existing strict/packed positive and negative Bundler/NodeNext/Node16 compiles
  remain the type/removed-name evidence; no duplicate compiler/pack campaign ran.
- Existing public helper zero-I/O, alias collision/child/related, hydration,
  validation-adapter, sorting/count/pagination, virtual and docs/publication tests
  retain their original assertions. The JSON's 23-row surface mapping names
  those retained files. Private work counts, stage layout, singleton identity and
  all original mixed matrices stay in their lower layers, unchanged.

## Boundary and status

Services come only from real runtime/router middleware and initialized requests.
All runtime imports stop at the three built entries (or installed package names);
types use built public root/advanced declarations. Application model spies and
consumer hooks are the only observed boundaries. No private constructor, token,
prepared stage, budget injection, package method spy, source alias, package mock,
new generated-source policy exception or broad allowlist was introduced.

All 34 required gap rows are complete for this bounded scope; no blocker or
private-evidence substitution remains. Fresh full-layer/default and independent
review are still ARTS-06 responsibilities. Static checking and these bounded
cases are compatibility evidence, not a universal proof.
