> Historical document preserved from ignored task scratch storage.
> Scope and limitations: `docs/task-artifacts/access-router/README.md`. References to omitted
> artifacts are historical, not available execution prerequisites.

# F-V gate ledger — NOT MEASURED

All commands were foreground, serial and awaited, from the repository root.
No workspace-wide command or performance workload was run in this recovery.
Original integration logs remain read-only in
`_tmp-oar09f-integration-ut0vgb6y/logs/` (abbreviated **old logs** below).
`GATES.json` records exact original argv, exits, chronology and evidence hashes.

## Completed integration gates reused, not rerun

| Gate | Exact command / scope | Original evidence | Result |
| --- | --- | --- | --- |
| V1 | `pnpm --filter @web-ts-toolkit/access-router... --workspace-concurrency=1 build` | `16-v1-final` | pass |
| V2 | `pnpm --filter @web-ts-toolkit/access-router exec vitest run --config vitest.config.ts --no-file-parallelism --maxWorkers=1 <16 files> --reporter=verbose --reporter=json --outputFile=<old report>` | `17-v2-current-runtime`, `17-results.json`; all 16 actual paths in `GATES.json` | 827/827, 16 files |
| V3 | `pnpm --filter @web-ts-toolkit/access-router test --reporter=verbose --no-file-parallelism --maxWorkers=1 --reporter=json --outputFile=<old report>` | `18-v3-full-core-final`, `18-results.json` | 6,046/6,046, 187 files; zero failed/pending |
| V3 types | `pnpm --filter @web-ts-toolkit/access-router typecheck` | `19-v3-source-types` | pass |
| V4 | `pnpm --filter @web-ts-toolkit/access-router-deco test --no-file-parallelism --maxWorkers=1 --reporter=verbose --reporter=json --outputFile=<old report>` | `20-v4-full-deco`, `20-results.json` | 742/742, 23 files; zero failed/pending |
| V4 types | `pnpm --filter @web-ts-toolkit/access-router-deco typecheck` | `21-v4-downstream-types` | pass |
| V5 lint | `pnpm exec eslint --no-cache packages/access-router/src packages/access-router/test packages/access-router-deco/src packages/access-router-deco/test scripts/benchmarks` | `22-v5-eslint-final` | pass |
| V5 format | `python3 _tmp-oar09f-integration-ut0vgb6y/format-check.py` **historical invocation only; do not rerun there** | `23-v5-format-final`, `format-scope.json` | 63 checked paths; new CHANGELOG entry checked separately, no whole-history reformat |
| V5 diff | `git diff --check` | `24-v5-diff-final` | pass |
| V6 | `node --test --test-concurrency=1 scripts/benchmarks/access-router.test.mjs scripts/benchmarks/access-router.integration.test.mjs scripts/benchmarks/access-router-owned.test.mjs` | `25-v6-all-runner-tests` | 45 passed; no timing campaign |
| V7 | Full package V3 includes documentation/export/strict/packed suites | `18-results.json`, `consumers/18-v3-full-core-final/` | 80 documentation + 47 export + 49 strict + 13 packed test cases; four actual installed matrices |

The old full test's `numTotalTestSuites=682` counts nested suites, not files.
The actual `testResults` array has **187 files**. The final full suite contains
both new many-helper files: **52 + 24 = 76 cases**. The final focused scope is
**827/16**, not F-I's older 772/15 on different bytes.

## Reuse and chronology

- Final core command started **2026-11-02T18:51:36.758693Z**, after the field-catalog
  compatibility fix and passing build/focused checks. All **609** scoped current
  source/test/docs/config files have mtimes no later than that start.
- Every recovery-entry source hash remains unchanged. The old incoming-relative
  diff reproduces exactly. All six affected packages' source/test/root files are
  included; no missing file in that bounded source scope.
- This source snapshot is reconstructed **after** the completed gates, not an
  invented pre-run sealed manifest. Reuse is supported by chronology, preserved
  originals/diff/results and actual installed-byte equality, then deterministic rebuild.
- All **14 JS/declaration core outputs**, all **eight declarations**, shipped docs
  and each of the five dependency-closure tarballs match current dist/source bytes.
  The assembled installations match the nested dist layout too.

## New recovery commands

Each wrapped invocation is
`python3 _tmp-oar09f-final-hh7rwm51/run.py <label> <command>`.
Exact argv/private cache locations/exits are under this packet's `logs/`.

| Label | Command | Result |
| --- | --- | --- |
| 04-public-surface-environment | `node _tmp-oar09f-final-hh7rwm51/surface.mjs` | root/advanced/processors ESM=CJS, 46/48/6; both declaration forms and inherited hovers/signatures; no private issuer |
| 06-snapshot-gates | `python3 _tmp-oar09f-final-hh7rwm51/seal.py snapshot-gates` | 609 source files, 67 dist-tree files, real completed gates verified |
| 09-packed-consumer-audit | `python3 _tmp-oar09f-final-hh7rwm51/seal.py packed` | four real matrices, 19 files per installation in distinct layouts; 20 collection + 20 original-guide executions |
| 10-post-gate-six-package-build | `pnpm --filter @web-ts-toolkit/access-router-deco... --workspace-concurrency=1 build` | exactly six packages, pass |
| 11-post-gate-byte-reconciliation | `python3 _tmp-oar09f-final-hh7rwm51/seal.py reconcile` | all 67 files byte-equal; 609 source hashes unchanged |
| 12-preservation | `python3 _tmp-oar09f-final-hh7rwm51/seal.py preservation` | source, originals, task, lock, HEAD, benchmarks and focused old evidence preserved |

The final command `python3 _tmp-oar09f-final-hh7rwm51/finalize.py` performs only
read-only product/evidence verification, process inspection, snapshot permission
hardening and new private metadata hashing. It does not rerun tests/builds.

## Retained failures — not silently relabeled

- Old `03`: alias-expanded checker display versus declaration spelling, plus wrapped
  excess-property diagnostics; corrected observer assertions preserve their purpose.
- Old `04/05`: new runtime fixture type/setup errors; corrected supported virtual,
  base-filter and explicit conservative result annotations, not product casts.
- Old `06`: fixture used a `read` nested rule for LIST; corrected to `list` while
  retaining the later-row capture/mutation assertion.
- Old `07`: hydrated Mongoose Buffer-path output is BSON Binary, not a raw Buffer;
  fixture now checks canonical hydrated normalization without changing that behavior.
- Old `10`: declaration-example diagnostics setup failed; corrected before old `11`
  documentation pass and the final full run. All originals/results remain.
- Old `15`: **6,045/6,046**, one genuine F-I compatibility regression, not a baseline
  failure. Moving native `.split()` into a helper changed the non-string fallback's
  observed error message/call site. The narrow field-catalog fix restores the
  original two direct calls/order/errors while separately pre-admitting each split
  buffer. The existing regression/oracle is unchanged, then `16/17/18` pass.
- Old `26`: esbuild is package-local, not root-resolvable. Old `27`: release-artifact
  does not export `package.json`. The new auditor resolves exported code then walks
  to its owning manifest; these never required product changes.
- New `01/02/03`: auditor assumptions about root request exports, a nonexistent
  DataCore public getter and an inert retired-name rejection string were corrected.
  No public API or rejection grammar was changed; failed scripts are archived.
- New `05/07/08`: actual delta has 18 paths, dist also contains the copied guide,
  and assembled trees preserve source manifests rather than production rewrite.
  Auditor assumptions were corrected to verify actual layouts, not modify artifacts.
  The final assembled inventory is **19**, including `dist/MIGRATION.md`; the
  preliminary 18-file interpretation was incorrect. All attempts remain in this packet.

No performance gate, old campaign, workload, old failure, or independent acceptance
was closed by these checks.
