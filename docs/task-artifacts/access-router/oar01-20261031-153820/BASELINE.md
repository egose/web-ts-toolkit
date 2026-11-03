> Historical document preserved from ignored task scratch storage.
> Scope and limitations: `docs/task-artifacts/access-router/README.md`. References to omitted
> artifacts are historical, not available execution prerequisites.

# Fresh current baseline — OAR-01 only

No candidate exists/was timed. No new performance gain or final security-equivalence
claim. Current default and all-ten active are configurations of the SAME new build.

## Captured identities

- HEAD: `58b22c0d6d3abd4ecce03533e3867d148ff21233`.
- Incoming tracked/untracked status: only the two coordinator task-document changes.
  No product changes; full incoming identity manifest captures 38,924 existing files,
  including old scratch evidence/artifacts/caches (excluding dependency symlink trees).
- Fresh sealed artifact: `baseline-artifact/`, descriptor `baseline-metadata.json`.
  All 14 access-router dist files copied: six JS/ESM runtime files, eight declarations.
  Source and all dist bytes match accepted final FP artifact; not assumed from name.
- Root ESM SHA256: `33662faede23acffc1a90973f51a7407df147afba76e4fbb23eeb99169df3822`.
- Root CJS SHA256: `4ad8ab48b44d91d4051c56e056bf3c2302e0f75c9fbd96b509a15b36f1003bea`.
- Eight-declaration manifest SHA256:
  `5d7ce47c3ea6117c01e5a375f8a58a7637dcb976eaac9b50ea92fa01a0173468`.
- Lock SHA256: `ef86ef24726d09f81d1262656920d6215caeb0f26e345198db2d27b8ab7ab314`.
- Worker SHA256: `9b16d2dbddb87299f1740d48fb5e26fb92c0b30e8de35183a4d330dcf59c264c`.
- Core SHA256: `751d026aa9da51c938c476b30f23467e290bc9fac45ab7cdaeda5127ed7adff2`.
- Declaration inspector SHA256:
  `52f7f8ffc7f29a7263089355acc37738971dd6e030f6c28dd7f77b9b31c1ecf8`.
- Public export sets captured and compared to prior accepted build at all subpaths,
  ESM+CJS and both declarations: root 46 runtime/186 types; advanced 48/322;
  processors 6/17. `public-exports.json` stores exact names and exports map.
- New dependency closure: 134 packages / 3,510 hashed files. Also READ-ONLY reverified
  the previous 134-package / 3,500-file preserved manifest. Difference is current
  accepted access-router source/tests plus generated declaration rename (12 added,
  two old generated filenames absent in CURRENT build); previous artifact unchanged.
  External dependency bytes identical. Full diff in `evidence-audit.json`; do not
  misstate the fresh file count as 3,500. Workspace deps copied, external deps linked
  and hash-pinned: not a hermetic vendored installation.
- Node v26.12.1, pnpm 11.18.0, linux/x64; Mongo 8.2.6; actual resolved Mongoose 9.11.4,
  Express 5.2.1, zod 4.4.3. Version ranges in package.json are not resolved identities.

## Commands actually run (repo root; foreground, serial)

The local `run-gate.mjs` stores exact argv, scrubbed stdout/stderr and exit/duration
under `<name>.command.json`, `.log`, `.result.json`. Repro paths are relative to repo.
All old driver files were READ only; only new adapted drivers were executed.

1. `node _tmp-oar01-20261031-153820/run-gate.mjs incoming node _tmp-oar01-20261031-153820/identities.mjs`
   — passed; captured source/lock/status/old evidence hashes before build.
2. `node _tmp-oar01-20261031-153820/run-gate.mjs v1-build pnpm --filter @web-ts-toolkit/access-router... --workspace-concurrency=1 build`
   — passed, 5 workspace packages only (access-router + utils/http-errors/
   express-response-handler/express-json-router); no workspace-wide build.
3. `node _tmp-oar01-20261031-153820/run-gate.mjs baseline-seal node _tmp-oar01-20261031-153820/seal-baseline.mjs`
   — passed; fresh copied artifact, all declarations/exports/dependencies rehashed.
4. Relevant V2: `pnpm --filter @web-ts-toolkit/access-router exec vitest run --config ../../_tmp-oar01-20261031-153820/vitest.config.ts --no-file-parallelism --maxWorkers=1 --reporter=verbose test/authorization-fast-path-owner.unit.test.ts test/authorization-fast-path-native.unit.test.ts test/static-output-field-batch.unit.test.ts test/related-execution.binding.unit.test.ts ../../_tmp-oar01-20261031-153820/boolean-work.test.ts`
   — final run **206 passed, 5 files**; log `v2-baseline-corrected-fixture.log`.
   Custom config extends the actual package config/setup but uses a NEW exclusive cache.
   Counts: owner 50, native 102, strict/static/pure-bool controls 49, related binding 3,
   new literal-boolean work probes 2. No complete V3/V4 claimed or needed here.
   First run `v2-baseline.log`: four product files 204 passed; TWO new evidence tests
   failed because the fixture populated only the PERMISSIONS symbol, while the captured
   Core actor reads requestPermissionField. Fixed evidence fixture by declaring
   requestPermissionField/oarPermissions, not by relaxing assertions/product code.
   First failure remains preserved; it is NOT a product baseline regression.
5. `node _tmp-oar01-20261031-153820/run-gate.mjs baseline-primary node _tmp-oar01-20261031-153820/measure-primary.mjs`
   — passed; 12 jobs, 1,200 measured requests/DB reads; 60 warmups + 24 pre/post
   validation requests outside counters/timing. 40,000 measured document hooks,
   zero virtual getters. Single serial owned Mongo, stopped in driver finally.
6. `node _tmp-oar01-20261031-153820/run-gate.mjs evidence-audit-corrected node _tmp-oar01-20261031-153820/audit-evidence.mjs`
   — passed; rehashed artifact/deps, checked raw results, both model getter modes,
   declarations, fingerprints, counts and stats. First audit script attempt assumed
   old generated declaration basename persisted; failed on renamed file; corrected
   to report additions/removals (both audit logs preserved, no artifact changes).

Final preservation/diff/privacy/job checks are recorded separately by `final-check`
and `preservation-check` gate files; see HANDOFF.md for completion disposition.

## Primary LIST timing raw results

Settings: 100 rows, 24 fields, 32-byte payload, one client, hook concurrency 10,
5 warmups + 100 samples/job, two reversed paired rounds. Default: ALL TEN flags OFF;
active: ALL TEN ON. Old worker supports actual 6/2/2 groups; both exact/bulk getters
checked on both source/target, same declarations and artifact. Row order/denied fields/
full fixture output checked before/after; fingerprint matched across modes/rounds.
During measured requests the unchanged worker checks row count, NOT full deep data.

| Scenario | Profile | Round 1 median / p95 / CPU ms/request | Round 2 median / p95 / CPU ms/request |
| --- | --- | --- | --- |
| plain-wide | current-default | 36.755 / 40.599 / 40.577 | 37.543 / 41.267 / 40.758 |
| plain-wide | current-active | 14.246 / 19.760 / 17.588 | 13.060 / 15.730 / 15.965 |
| document-rules | current-default | 199.725 / 219.923 / 206.800 | 195.251 / 221.962 / 203.491 |
| document-rules | current-active | 15.847 / 19.875 / 18.432 | 15.814 / 19.513 / 18.511 |
| embedded | current-default | 584.183 / 596.258 / 591.943 | 574.114 / 591.767 / 582.265 |
| embedded | current-active | 25.860 / 31.100 / 29.832 | 26.279 / 29.568 / 29.719 |

Raw paths: `primary/001-...-job.json` through `012-...-result.json`, per-job worker
logs and `primary/summary.json`; exact filename inventory is in that summary.
This is a fresh CURRENT default/active baseline, not new isolated/trusted timing.
Old-active already omits substantial work: no prospective gains may count it twice.

## Separate instrumented boolean work evidence

`boolean-work.test.ts`, `boolean-work.json`, V2 log. Six rows, 24 ALL-function
fields/row, one embedded child/row; hook returns only two literal boolean facts.
Real observed calls, not flags or renamed counters:

| Observation | current-default | current-active |
| --- | --- | --- |
| document hooks | 6 | 6 |
| field function callbacks | 144 | 144 |
| adapter find calls | 1 | 1 |
| marked source copies | 12 | 0 |
| marked grant copies | 342 | 0 |
| marked context isolation copies | 12 | 0 |
| source normalizations | 18 | 0 |
| graph transfer calls | 366 | 0 |
| output identity walks | 48 | 0 |
| clone-free identity admission calls | 0 | 0 |

Counts instrument imported source functions via spies, not packed-runtime allocation
or DB counters. Output/denials/embedded filtering are asserted; callback actor/permission
arguments asserted; actual adapter read counted. No native-rich grant fixture was
altered/reused as a future-compatible grant contract. Existing tests/evidence unchanged.

## Fixed gates and limitations

PERFORMANCE-GATES.md existed before measurements, its SHA is sealed in descriptor
and primary summary and checked by audit. It fixes meaningful percentage+absolute
default-benefit, guard/p95/CPU, trusted/old-active, helper/fresh-read and retention gates
with exactly two additional reversed pairs on adverse/unstable cases (max four pairs),
no selective discards or statistical-significance claim. No candidate measured, hence
no candidate retention gate passed/failed yet.

READ/helper/native/fact/heap work plans are explicitly unrun in MEASUREMENT-PLAN.md.
Original worker exposes LIST latency and combined worker CPU/request only: no READ,
allocation, retained-state, actual omission counts, Mongo CPU, or raw separate CPU
user/system counters. No full package/deco/benchmark integration/export consumer gates
were substituted for OAR-09; no root workspace commands run. No historic v0.51.0 run
was needed. Final implementation, packaging/migration fixtures and independent review
remain OAR-02–10; this evidence is not verification of future code.
