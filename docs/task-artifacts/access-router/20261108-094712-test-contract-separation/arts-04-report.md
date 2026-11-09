# ARTS-04 bounded public companions

**Complete for ARTS-04:** **93 new cases / six runnable files passed**, within
the 94-case ceiling. All required gap rows now have executable public evidence;
the 97 original public files remain preserved. This is not ARTS-06/full-suite
acceptance. The coordinator-owned [task](../../../tasks/20261108-094712-access-router-test-contract-separation.md)
and all historical evidence/index files were left untouched.

## Delivered and mapped

All paths below are under `packages/access-router/test/`.

| New contract file | Passed | Obligations |
| --- | ---: | --- |
| `contracts/arts04-modes.integration.test.ts` | 43 | MODE-00–15, TARGET 8, CAPTURE 7, FALLBACK 4, DETACH 8 |
| `contracts/arts04-boundaries.integration.test.ts` | 21 | ENTRY 6, GUARD 2, CONTROL 4, ADMISSION 3, FACTS 3, DISTINCT 3 |
| `contracts/arts04-data-helpers.integration.test.ts` | 12 | DATA 4, CALLBACK 5, COLLECTION 3 |
| `contracts/arts04-metadata-wire.integration.test.ts` | 4 | METADATA 2, DTO 2 |
| `contracts/arts04-parsers-processors.integration.test.ts` | 11 | PROCESSORS 5, VALIDATION 6 |
| `contracts/arts04-installed-exports.test.ts` | 2 | Installed ESM/CJS semantic exports |

Four new public support files: `support/public/arts04-fixture.ts`,
`arts04-exports.mjs`, `arts04-exports.cjs`, `arts04-export-assertions.cjs`.
Total: **10 additive maintained files**, no original edits or splits.

- [Coverage supplement](arts-04-coverage.md): every gap row, exact test token/file,
  retained original public evidence and bounded recipe clarifications.
- [Coverage JSON](arts-04-coverage.json): **34 required gap rows**, 23 surface
  inventory rows, all 93 exact expanded file/title/location/occurrence/case hashes,
  and the 97 original public files' identities/runtime-evidence references.
- [Verification manifest](arts-04-verification.json): actual argv, environment,
  exits/times, new file hashes, case counts, development failures/resolutions and
  the fresh checkpoint result.
- [Supplement seals](arts-04-manifest.json): only this task's additions plus
  unchanged prior evidence identities; no historical manifest was rewritten.

The 16 MODE cases each run six real operations (**96 primary operations**), with
mode-distinguishing literal hook mutations, denied-field/input checks, frozen
facts, initiating/effective branch contexts and Mongo persistence checks. All
43 mode-orthogonal cases and 50 other cases have passed; the spare ceiling slot
is not filled artificially.

## Public boundary and difficult cases

- Model/data services come from real runtime/router middleware and initialized
  request APIs. Runtime functions use only built root/advanced/processors entries
  or real installed package-name resolution; types use public built declarations.
  Real Mongo is retained. Only application models/hooks/loggers are observed.
- No Core/Permission/Service construction, private capability/stage/budget,
  `_doc` access, package method spy/mock, source alias, private fixture/chunk import,
  production export, dependency change, broad exemption or consumer-policy edit.
  All ARTS-03 tooling remains exact. Five line-local lint annotations mark actual
  CommonJS `require` syntax in the two CJS support modules; no lint config changed.
- TARGET independently varies all four target READ/LIST pairs under opposite
  source postures, including real create/update populated output. Native output
  mutations cannot change siblings, storage or actual populated target documents
  retained by application `afterPersist`.
- COLLECTION admits real callbacks at gate 2. Two 4 MiB payload rows plus one
  small held row expose draining: other callbacks finish while it remains held,
  settlement waits for its completion, cumulative failure publishes no partial or
  late value, and a fresh helper succeeds. No private budget or turn-count test.
- DETACH covers both modes and all four write branches. The controlled post-save
  failure uses a genuine over-bound native selected scope; the submitted row is
  still committed. A collection payload cap was not misrepresented as a blanket
  single-write byte cap.
- ADMISSION uses documented invalid global placement for populate configuration:
  non-`false` defined flag values intentionally normalize to strict, so `'yes'`
  is not an invalid enum value. This clarifies the proposed input, not production
  policy or the original matrix.
- EXPORT's new installed probes are bounded built-file consumer trees, not a
  second tarball/compiler campaign. Existing packed failure-only private-path
  resolves and strict/packed Bundler/NodeNext/Node16 positive/negative consumers
  remain the type/encapsulation evidence. Their exact original public sources and
  earlier passing case IDs are mapped, not represented as fresh ARTS-04 compiles.
  DTO checks use genuine HTTP/root responses, never private serializers.

## Actually executed final verification

All commands were foreground/awaited and sequential from repository root with
Git-confirmed ignored absolute
`TMPDIR='<repo-root>/_tmp-arts-04-20261109-public-companions'` (replace the root
placeholder before execution). Exact six-file/reporting argv is in the manifest.

| Command | Result |
| --- | --- |
| `pnpm --filter @web-ts-toolkit/access-router typecheck` | Pass; normal filtered/transitive build and source typecheck |
| `pnpm exec eslint` with the exact 10 new files | Pass |
| `pnpm --filter @web-ts-toolkit/access-router test:contracts` with all six exact new paths, default + JSON reporters and task locations | **93 passed / six files**, zero failures/skips/todos; unchanged guard preflight passed |
| `pnpm --filter @web-ts-toolkit/access-router test:layers:check` | Pass; **218 = 103 contracts + 64 invariants + 51 internal**, disjoint/exhaustive; public graph **137 files / 237 modules** |
| `node …/arts-03-verify-checkpoint.mjs` | All original/source/declaration/tooling/API seals passed |
| `git diff --check` and supplement curation checks | Pass |

Existing nonfatal Vite future-native-config warnings remain unsuppressed.
Development attempts and concrete corrections are recorded in the verification
JSON: four early focused selections failed due to new-fixture assumptions,
incorrect argument/schema/route/error expectations and native representation.
The final tests use existing documented behavior and literal retained expectations;
no old assertion was changed to make them pass. No production failure is claimed
from those invalid probes. Redundant green rehearsals are not added to the count.

## Exact preservation and handoff

The fresh **unchanged ARTS-03 checkpoint** verified:

- **248 original migrated test/support files** against exact ARTS-02 hashes;
  therefore their sealed full bodies, assertions, expected values, parameter rows,
  directives and setup/cleanup remain unchanged—not merely matching counts.
- **152 source files**, complete **eight-declaration inventory**, all non-script
  package metadata/dependencies/export maps and ESM/CJS export-name sets
  (**46 root / 48 advanced / six processors**).
- All **10 ARTS-03 maintained tooling files** and its earlier evidence seals.
  The only old non-test exceptions are still ARTS-03's exact test-script/shared-
  config edits. No new exception or modified seal was introduced in ARTS-04.

Supplement identities, JSON structure, gap/case bijection, retained file references,
Markdown links, privacy, whitespace and durable/scratch ignore status were checked.
Raw logs/full reporter JSON, dependency/installed consumer trees, Mongo data,
binaries, build output and temporary generators are deliberately omitted. The
curated case identities/statuses and source hashes are retained; omitted logs
cannot be reconstructed from this archive alone. Runtime reproduction still needs
the normal installed dependencies and Mongo prerequisite. This is not a hermetic
bundle or independent review.

No ARTS-04 blocker remains. The prospective default total is **7,717**
(7,565 originals + 59 guard cases + 93 companions), **not an executed full run**.
No full layer/default, root/grouped/downstream suite, broad release build or
performance campaign ran. ARTS-05 owns final guide/index reconciliation;
ARTS-06 owns independent review and fresh full gates. No further subagent,
commit, reset, unrelated deletion or queued/background job occurred.
