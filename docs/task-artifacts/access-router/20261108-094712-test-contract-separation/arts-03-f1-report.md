# ARTS06-F1 repair — implementation handoff, independent acceptance pending

**The exact-public-name alias bypass is repaired in the focused implementation
scope. F1 is not independently accepted.** The original
[ARTS-06 finding](arts-06-review.md#blocking-finding-arts06-f1-exact-public-names-bypass-typescript-aliases)
and [FINAL index](FINAL.md) remain sealed historical records. The coordinator owns
the [task/status](../../../tasks/20261108-094712-access-router-test-contract-separation.md).
This session edited neither that task nor any historical artifact/index.

## Exact change and compiler contexts

Only three maintained files changed; see the reviewable
[exact patch](arts-03-f1-changes.patch) and
[before/after identities](arts-03-f1-manifest.json):

1. `packages/access-router/scripts/check-test-layers.mjs`
2. `packages/access-router/scripts/test-layer-consumers.mjs`
3. `packages/access-router/test/internal/test-layer-boundaries.unit.test.ts`

The checker now carries two explicit compiler contexts:

- **`repo`:** contract roots, configured setup, ordinary imports/type imports/
  re-exports and their transitive support. For exact root, advanced and processors
  package names, effective TypeScript resolution now runs **before** the public
  boundary return. Parsed inherited `paths`/`baseUrl` settings and existing Vite
  aliases cannot hide a private target. Actual built public-entry aliases remain
  valid; unresolved matching TS aliases fail closed.
- **`installed`:** the finite filesystem consumer-input inventory, explicit
  document/JSDoc extraction roots, and exact staged source producers. Their
  existing own consumer configurations do not inherit repository TS/Vite aliases.
  Ordinary local imports and generated sibling/recipe edges propagate the incoming
  context; no role is inferred from a `#` in a synthetic filename or from residing
  in public support.

Physical-file and parsed-module traversal caches are context-qualified. The same
declared installed fixture reached by an ordinary repo import is audited again in
repo context, including when its installed traversal happened first. Boundary
checks on private files/chunks/deep names still apply in **both** contexts; an
installed role is not a private-input exemption.

The minimal policy additions explicitly identify the three unchanged ARTS-04
installed EXPORT modules alongside the original 25 filesystem-fed consumers, and
13 literal/constant/joined source sinks by exact file, line and write target with
reasons. These are the packed/strict/tree-shaking consumers already emitted into
installed trees. Existing finite document extraction/reviews and failure-only
exceptions remain narrow. Stale literal-producer entries fail. No whole-file,
support-directory or all-generated-module exemption was introduced.

Both maintained guides are byte-identical, including ARTS-05's test guide. This
supplement and checker/policy comments record the compiler-context clarification;
no broader documentation rewrite was needed. Manual review of actual generator
configurations, novel loader/filesystem APIs and arbitrary reflection/dataflow
remains necessary; this guard is not a sandbox or semantic-independence proof.

## Red/green proof and executed commands

All shell gates ran foreground, awaited and sequentially with **600,000 ms** tool
timeouts, using fresh Git-confirmed ignored scratch
`_tmp-arts-03-f1-20261109045446/`. Runtime `TMPDIR` was its absolute repo-local path;
the unchanged per-case fixture setup also creates and checks its own ignored root.
Shared commands use `<repo-root>` placeholders, which must be replaced.

Exact argv, exits/timestamps, reporter observations, old/new case joins, actual
discovery sets/digests and checkpoint results are in
[arts-03-f1-verification.json](arts-03-f1-verification.json).
Node **v26.12.1**, pnpm **11.18.0**, TypeScript **6.0.3**, Vitest **4.1.11**.

| Actual command (reporting arguments retained in verification JSON) | Result |
| --- | --- |
| `pnpm --filter @web-ts-toolkit/access-router exec vitest run --config vitest.internal.config.ts test/internal/test-layer-boundaries.unit.test.ts --testNamePattern="reproduces ARTS06-F1 exact public root alias resolving to private source"` | **Expected red: 1 failed.** Actual TS resolution to `src/secret.ts` passed; the unchanged old guard returned an empty diagnostic string. The 75 other cases were selector-skipped, not source skips. |
| `pnpm --filter @web-ts-toolkit/access-router test:internal test/internal/test-layer-boundaries.unit.test.ts` | **76 passed / 1 file**, zero failures/skips/todos, through the real build/preflight/layer entrypoint. Final run repeated after the appended helper import's lint correction. |
| `pnpm --filter @web-ts-toolkit/access-router typecheck` | Pass, including the normal five-package filtered/transitive build. |
| `pnpm exec eslint packages/access-router/scripts/check-test-layers.mjs packages/access-router/scripts/test-layer-consumers.mjs packages/access-router/test/internal/test-layer-boundaries.unit.test.ts` | Final pass. Initial lint rejected only the new appended `require`-style TS helper import; replaced it with an appended ESM import, with no old line edits or lint suppression. |
| `pnpm --filter @web-ts-toolkit/access-router test:layers:check` | Pass: **218 = 103 contracts + 64 invariants + 51 internal**, exact disjoint default/physical/layer union; **137 physical public files / 237 modules**, no graph errors. |
| `node docs/task-artifacts/access-router/20261108-094712-test-contract-separation/arts-03-f1-verify-checkpoint.mjs` | Pass: exact three-file patch preimages, original/companion/guide/source/declaration/export/evidence preservation. |

The root reproducer was added before changing the checker. Its positive resolver
assertion and failed guard assertion distinguish the demonstrated bypass from a
fixture-resolution failure. The final file run includes that same rejection
obligation. The 17 appended cases cover all three public names with runtime/type
edges, exact and wildcard inherited settings, baseUrl-only resolution, actual
built/no-alias positives, staged-vs-ordinary reuse and cache isolation, unlisted
filesystem reads, finite literal producers, generated recipe propagation, setup
and transitive typed re-exports. Existing failure-only exception tests still pass.

Normal Vite future-native-config warnings remained visible; no warning or empty-test
suppression was added. No full default/layer, root/group/downstream run or benchmark
campaign ran in this repair. **7,717/218** remains the sealed pre-repair independent
result. **7,734 = 7,717 + 17** is prospective, not a new full-run pass. ARTS-06's
independent reviewer owns post-repair acceptance and complete gates.

## Preservation and new seal boundaries

The new [read-only checkpoint](arts-03-f1-verify-checkpoint.mjs) reconstructs the
three pre-repair tooling files **in memory** by reversing the exact new patch,
then compares them to the sealed ARTS-03 identities. It never applies a reverse
patch, changes checkout files, or modifies an old manifest/verifier.

- All **248 migrated originals** retain exact ARTS-02 destination bytes, hence their
  sealed AST/assertions/expected values/tables/directives/setup remain unchanged.
- The complete old guard file remains an unchanged **16,006-byte prefix**, SHA-256
  `598a101c59855c35c910622150991b457a2830e8c357f8c0e0045df8047cd6d7`.
  All 18 original top-level statements retain exact body fingerprints and locations.
  All **59 old runtime cases** match the sealed ARTS-06 title/occurrence/line/column
  records and pass. The 17 new cases are appended; no old assertion was rewritten.
- All **93 public companions and their 10 test/support files** retain their current
  approved bytes, respecting the historical exporter-cleanup supersession only.
  They were not rerun wholesale here.
- All **152 source files**, the complete **eight-file declaration inventory** after
  fresh filtered builds, and actual ESM/CJS runtime export-name sets (**46/48/6**)
  remain unchanged. Dependencies/public export maps and all script/config semantics
  stay byte-identical to their accepted tooling identity.
- All **41 pre-repair bundle files**, including every ARTS-01–06 artifact and
  `FINAL.md`, remain unchanged. The 307 unaffected captured delivered inputs are
  revalidated; only the three exact maintained tooling files have new F1 hashes.
- The baseline's two old non-test exceptions (`package.json` scripts and shared
  `vitest.config.ts`) remain historical ARTS-03 exceptions, **not new F1 edits**.
  The other 184 baseline non-test inputs and seven unaffected ARTS-03 tooling files
  still match. Both maintained guides remain unchanged.

The old ARTS-03 checkpoint/manifest deliberately expect the old three hashes and
are **historical, not a valid positive gate on this repair**. They were not patched
or labelled passing on the new identity. Use the new F1 checkpoint and supplement
manifest; independent acceptance must reference their actual delivered hashes.

New records/patch links, JSON, privacy, whitespace and scratch/durable ignore status
were reviewed. Raw logs/full reporter JSON, dependencies/builds, disposable fixture
graphs and capture utilities are omitted. Existing sealed records plus the current
three files and reversible patch reproduce preservation checks; normal installed
dependencies/build prerequisites are still needed. This is not a hermetic bundle.

**Handoff:** no implementation blocker or queued/background work remains. No shared
task edit, production/dependency change, commit/reset, original assertion change or
subagent occurred. F1/final acceptance remains pending the independent reviewer's
confirmation and appropriate post-repair verification.
