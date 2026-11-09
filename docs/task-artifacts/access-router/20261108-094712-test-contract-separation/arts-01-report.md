# ARTS-01 outcome and handoff

**Accepted for ARTS-01's baseline/classification scope.** Fresh typecheck and the
single fresh full package baseline passed. Every original runnable/support file
has a preservation mapping and reviewed destination. Public gaps are explicit;
this does **not** accept the later separation or authorize ARTS-02 execution.

Related task: [access-router test-contract separation](../../../tasks/20261108-094712-access-router-test-contract-separation.md).
Coordinator owns its status/execution record; this session did not edit that file.

## Fresh baseline

Starting HEAD: `fe50475fd026d70aad52bc54b1c6d3d41dbc885b`.
Starting tracked patch: zero bytes. The only untracked file at start was the
shared task document. All **2,379 starting tracked files** were rehashed during
curation and remained unchanged; the manifest digest and **434 protected input
identities** are in [identities.json](identities.json), including **152 source**
and **248 test/support** files. New durable files are confined to this bundle.

Commands were run sequentially from repository root with absolute repo-local
`TMPDIR`; each command's exact argv/exit/elapsed is preserved in the manifest.

| Actually executed | Result | Elapsed |
| --- | --- | ---: |
| `pnpm --filter @web-ts-toolkit/access-router typecheck` | Pass; existing five-package filtered/transitive build then source typecheck | 30.395 s |
| `pnpm --filter @web-ts-toolkit/access-router test --reporter=default --reporter=json --outputFile.json='<repo-root>/_tmp-arts-01-20261108-095305/baseline-results.json' --includeTaskLocation` | **211 files / 7,565 cases passed**, 0 failures/skips/todos | 1,913.554 s command; 1,891.02 s Vitest |
| `pnpm --filter @web-ts-toolkit/access-router exec vitest list --config vitest.config.ts --filesOnly --json='<repo-root>/_tmp-arts-01-20261108-095305/discovery.json'` | Pass; exactly the same 211 file paths as runtime results | 1.345 s |

These are newly executed results, not the previous readability task's pass.
Vitest's JSON also reports 744 nested suites; that is not a runnable-file count.
Installed Vitest **4.1.11** help/discovery support was inspected before selecting
the reporter/list argv. Only the nonfatal future-native-config CommonJS/ESM warning
was observed for discovery; no config or warning suppression was changed.

Environment: Linux x64, Node **v26.12.1**, pnpm **11.18.0**, TypeScript **6.0.3**,
tsup **8.5.1**, Express **5.2.1**, Mongoose **9.11.4**, mongodb-memory-server
**11.2.0**. Remaining installed analysis/test-tool versions are recorded. Packed
fixtures exercised exact minimum peers **Express 5.0.0 / Mongoose 8.0.0** and
current peers **5.2.1 / 9.11.4**, actual transformed tarballs and a bounded scoped
artifact tree, both Node module systems and strict consumer modes. Existing
minimum-peer peer-library `skipLibCheck` policy was retained; current-peer and
dedicated strict checks retained full declaration checking.

Both filtered builds produced the same complete **eight-file `.d.ts`/`.d.mts`**
inventory, including both shared `parsers-fSBARZSn` declarations. Names/bytes/hashes
are in [declarations.json](declarations.json). They are a one-off migration seal,
not a permanent private-chunk contract.

The scoped artifact fixture selected the existing
`packages/access-router-runtime/dist/cli.js` read-only; all three prebuilt
candidates existed. No unrelated CLI, broad release build, root/grouped/downstream
suite or new benchmark campaign ran. Existing bounded benchmark-driver/harness
tests ran only as part of the authorized exhaustive package baseline.

## Exhaustive classification and preservation

| Planned layer | Original runnable files | Baseline runtime cases |
| --- | ---: | ---: |
| contracts | 97 | 3,065 |
| invariants | 64 | 3,078 |
| internal | 50 | 1,422 |
| **Total** | **211** | **7,565** |

All **37 support files** are mapped: 25 active public consumer inputs, four public
helpers, two stable public setup exceptions, four private helpers, one stable
private CRUD fixture and one dormant private legacy compiler fixture. Exact old/new
paths and import/public-equivalent repairs are in
[migration-ledger.json](migration-ledger.json); file-by-file reasons and relevant
mixed obligations are in [classification.md](classification.md).

**Keep every complete mixed original below contracts.** No original assertion,
expected value, table row, negative diagnostic/directive or relevant setup/cleanup
may be dropped, weakened or silently split. Additive public companions cover named
obligations without private authority construction or implementation spies.

Preserved static records cover **2,615 suite/case groups**, including **2,246
static case declarations**, **11,254 assertion-looking call sites**, **849
parameterization expressions** and **411 compiler-directive/diagnostic-marker
lines**. Full file bytes/AST and every top-level statement also protect tables,
closures, generated strings and setup/cleanup. Counts are not assertion-preservation
proof: [preservation-ledger.jsonl](preservation-ledger.jsonl) carries the actual
node/body/payload hashes and inherited destination rule.

[runtime-cases.jsonl](runtime-cases.jsonl) retains every expanded case, original
location and passed status. There are **7,556 unique file/full-title pairs**;
nine excess duplicate titles across seven files have explicit occurrence-qualified
identities (maximum multiplicity two). The JSONL schema/hash algorithm and limits
for arbitrary dynamic names are documented in the [bundle index](README.md).

## Caller audit and important decisions

- Keep `test/access-router-crud-fixture.ts` at its benchmark-sealed root path and
  byte identity; internal CRUD/work tests still use it. Contracts must not.
- Keep `test/setup.ts` stable: two `access-router-deco` integration files import it.
  Keep configured `test/global-setup.ts` stable for built public runtime cleanup.
  No downstream edits/builds/tests are required for these exceptions.
- Relocate other public/private support with **all** compiler file lists,
  filesystem reads, source-prefix replacements and generated imports. Root-sensitive
  strict/packed/docs/export/tree-shaking/type tooling and benchmark callers are
  enumerated in [support-callers.json](support-callers.json). Generated collection
  recipe modules resolve to three exact extracted MIGRATION blocks, not a broad
  computed-import exception.
- `service-authorization.types.fixture.ts` has no current maintained caller or
  config inclusion. Its stale header claims otherwise, and it contains successful
  examples of removed handles. Preserve it unchanged as **private-dormant**; do not
  count it as passing public evidence, activate it, delete it or repair its old
  expectations. Active consumer/boundary/migration/cutover fixtures protect current
  replacements. No fixture compile was added just to manufacture a failure.
- `default-model-options.integration` fixes warning array order; retain it in
  invariants and check only documented warning membership in a public companion.
  `service-authorization-subdocument-policies` spies on package
  `findRawParentDoc`; calling that public method is supported, spying on child
  dispatch through it is not a documented override seam. Retain the whole suite.
- Exact helper/copy/representation/work counts and incidental promise turns stay
  lower-layer. Consumer callback multiplicity and external query bounds retained
  as public observations have explicit narrow documentation justifications in
  [coverage-gaps.md](coverage-gaps.md#boundary-judgments-and-ambiguity-resolutions).
- Actual public callers were inspected read-only: `access-router-deco` factory/hook
  registration, `access-router-runtime` model/data/custom-route bootstrapping and
  the Node example's runtime/row-hook/router usage. They use supported facades,
  configuration/hooks and initialized requests; they do not legitimize arbitrary
  declaration-reachable private construction. Relevant identities are preserved.
- Static grouped-run review: `scripts/test-groups.mjs:25–35,73–88` already records
  the three CLI compiled-read candidates. This task adds no build/read target or
  scheduling change. Preserve serial test files/shared `dist`; no grouped run ran.

## Public gaps, not false passes

The [coverage matrix](coverage-gaps.md) covers root/advanced/processors,
runtime/router/request-service methods and public hooks, README/MIGRATION,
publication/types, model/data/root/child paths, policy/facts/metadata, related and
embedded output, validation/OpenAPI/processors, ownership/denial and resource limits.

The private CRUD fixture's complete **16 READ/LIST/CREATE/UPDATE tuples are not
public evidence**. Existing public four-pair query tests also do not prove every
write tuple, borrowed/disposable effects or both executed UPSERT branches. Required
bounded companions explicitly include:

- 16 tuple cases with six distinct primary operations each;
- independent target READ/LIST pairs under opposing source postures;
- default/in-flight and nested fresh captures, READ fallback, both UPSERT branches;
- both write modes' real native/payload/lifecycle/persistence detachment;
- representative admission/entry/control/facts/data/callback/metadata/DTO/export,
  collection-failure/drain, composite distinct and processor/parser gaps.

The documented ceiling is **94 additive cases**, not a target or demand for every
transport Cartesian product. All rows remain pending executable ARTS-04 evidence.
The public collection failure/drain recipe must reach genuine public overflow;
private-budget injection cannot close it. If that recipe cannot expose the claimed
effect, obtain a specific evidence-backed coordinator decision before revising the
row. No unresolved ambiguity blocks this classification handoff.

## Evidence verification and scope stop

Actually verified during curation:

- Read-only verifier against unchanged working-tree inputs **and** recorded Git
  baseline, both with complete current declaration comparison: passed.
- Every JSON/JSONL parsed; mapping/count/discovery/case-ID checks passed, including
  all support callers/stable exceptions and original static preservation hashes.
- Markdown file links, recorded paths, privacy/content scan, scratch/durable ignore
  status and `git diff --check` checked before handoff; see
  [verification.json](verification.json) for actual curation commands/results and
  the bundle manifest for the exact retained evidence inventory.
- The verifier's initial execution exposed an extra closing parenthesis in this
  newly authored artifact utility; it was fixed and both verification modes then
  passed. This was not a package-baseline failure or production/test change.

Raw logs/report, source/dependency copies, generated consumers/binaries/caches and
database data were deliberately omitted. Git revision plus the recorded empty
patch reconstructs tracked inputs; recorded dependencies and prebuilt runtime
prerequisites are still required for runtime reproduction. This is a curated
record, not a hermetic environment or independent final review.

**Handoff:** coordinator may mark ARTS-01 complete after review. ARTS-02 can use
the exact destinations and path-repair list when separately assigned; ARTS-03/04
must still deliver fail-closed boundaries and required public evidence. This
session made no test moves, package configuration/build-script/production changes,
commits, deletions, resets or shared-task edits. The new verifier is an artifact-only
evidence utility. No scheduled or background job remains active.
