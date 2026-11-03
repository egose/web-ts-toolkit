> Historical document preserved from ignored task scratch storage.
> Scope and limitations: `docs/task-artifacts/access-router/README.md`. References to omitted
> artifacts are historical, not available execution prerequisites.

# OAR-09A — completed recovery packet, no OAR-09B campaign

**OAR-09A tooling/integration is ready for coordinator acceptance.** The accepted
sealed candidate/config/runbook are under **`final-02/`**. Full final smoke:
**180/180 jobs, zero failures, eight preflight records**; final runner suite:
**44/44, zero skips/cancellations**. These are correctness/executability checks,
**not performance or retention acceptance**. OAR-09B and OAR-10 remain unstarted here.

No delegation, task/status edit, commit/publish, dependency/lock edit, revert,
unrelated overwrite, historical evidence/cache write or workspace-wide verification.
All executed builds/tests/benchmarks were foreground, serial and awaited. No product
runtime/source/type/consumer optimization was added; OAR-08's bytes remain intact.

## Exact scope and delta

- **Combined OAR-09A:** 12 benchmark files, six new owned driver/core/worker/probe/
  structure/test modules, six existing runner/worker/core/tests/README files modified.
- **This recovery:** six files: README plus owned core, worker, probes, driver and
  tests. Incoming work is preserved, not credited as newly written. The original
  historical fixture definitions/seeds/select/rules/hydration/body/expected rows
  remain byte-identical; old six/two/two flag meanings and eight-way tests are retained.
- `final-02/COMBINED-DELTA.{json,diff}`, `RECOVERY-DELTA.{json,diff}` and
  `HISTORICAL-WORKLOAD-AUDIT.json` provide exact before/after hashes and fixture proof.
  Coordinator task-note changes before recovery are recorded separately; the task
  document is unchanged from this recovery's entry.
- Fixed meaningful harness gaps: require every measured fingerprint and valid raw
  CPU/elapsed/retention work; validate complete native LIST cardinality/order and
  READ values; gate both held and released retained heap with bounded repeats; pin
  candidate source/tools/tool dependencies/Node/pnpm/Mongo identities. New untimed
  probes exercise actual independent READ/LIST modes, inherited embedded input
  mutation, independent related targets, captured READ retry and terminal 400/403,
  and explicitly demonstrate negative EMPTY facts are not current authority.

## Actual gates and commands (checkout root)

`final-02/REUSED-GATES.json` records exact argv and hashes of the original OAR-09A
logs/results. Product/package/test bytes are unchanged, so full core/deco gates were
audited and reused rather than needlessly rerun after benchmark-only changes:

| Gate | Actual result / evidence |
| --- | --- |
| V1 | Original literal `pnpm --filter @web-ts-toolkit/access-router... --workspace-concurrency=1 build`, five necessary packages, passes (`_tmp-oar09a-unpurw_z/v1-01.log`). |
| V3 | **5,837/5,837, 180 files, zero failed/pending**, original `v3-full-01-results.json`; full unfiltered package Vitest exec with external cache/evidence config, **not** a claimed literal package test command. Core `typecheck` passes (`v3-types-01.log`). |
| V4 | **742/742, 23 files, zero failed/pending**, original `v4-full-01-results.json`; full unfiltered deco exec with external cache/evidence config. Separate six-package transitive build and deco `typecheck` pass. |
| V7 within V3/V4 | Core docs/export/strict/packed **175** cases (71/47/44/13); deco installed/docs/type **27** (18/4/5), all included in full suites. Actual packed minimum/current peer/module/doc matrices remain covered; no fresh peer install was needed in this recovery. All 14 core outputs, guide and four deco outputs match OAR-08 exactly. |
| V5 final | `pnpm exec eslint --no-cache packages/access-router/src packages/access-router/test packages/access-router-deco/src packages/access-router-deco/test scripts/benchmarks` passes (`v5-lint-final-02.log`). All 12 combined changed benchmark files pass Prettier (`format-final-02.log`); `git diff --check` passes. |
| V6 final | `WTT_BENCH_LEGACY_ROOT='<repo-root>/_tmp-oar01-20261031-153820/baseline-artifact' node --test --test-concurrency=1 scripts/benchmarks/access-router.test.mjs scripts/benchmarks/access-router.integration.test.mjs scripts/benchmarks/access-router-owned.test.mjs`: **44/44**, zero failed/skipped/cancelled (`v6-final-03.log`). No name filters. Includes real old eight-way matrix × embedded/doc rules, both declaration conditions and real four-profile correctness/structure children. Original interrupted V6 was 41/41, not the final count. |
| Rebuild/seal | Final `pnpm --filter @web-ts-toolkit/access-router-deco... --workspace-concurrency=1 build` passes, **six necessary packages only** (`postgate-build-02.log`); all **67** output files identical before/after. |
| Final smoke | `node scripts/benchmarks/access-router-owned.mjs --smoke docs/task-artifacts/access-router/oar09a-recovery-ot_jqpby/final-02/FINAL-PROTOCOL.json _tmp-oar09a-recovery-ot_jqpby/smoke-sealed-all-02` passes. `--plan` also passes without Mongo/jobs. |

External Vitest configs only relocate caches and preserve newly created consumer
scratch instead of cleaning it. They do not remove assertions or discovery; no test
name/file filters were used for full V3/V4. Original logs/configs remain read-only.

## Correctness evidence, not timing acceptance

`final-02/SMOKE-CORRECTNESS-AUDIT.json` re-verifies every saved job and both matched
profile fingerprints/counts. Raw files are in `smoke-sealed-all-02/`:

- 45 cases × four profiles, one round, two samples/one warmup. Family jobs:
  primary **12**, guard **48**, READ **40**, helper **52**, native adapter **8**,
  facts **8**, retention **12**. All seals audited before AND after, actual Mongo 8.2.6.
- Actual generated HTTP ID/filter READ: one findOne/read; document rules one hook;
  virtual case two getters. Separate direct findById/findOne probes assert one read
  and correct hooks. Retry two adapter reads/one hook; terminal 400/403 zero reads.
- H1 zero reads/hooks/getters. H2 old one read/hook vs new two; H3 old one batched
  read/rows hooks vs new two batched reads/twice rows hooks, never per-row queries.
  H4 one read/hook. Matching query-only components execute; no synthetic p95.
- Native adapters: zero Mongo reads, one explicit adapter call; full bounded response
  checked including denied fields/cardinality/order. Overflow/wire cases are untimed
  controlled failures with fingerprints; historical differences remain observations.
- Fact fixture: 100 hooks and exactly 100 × 10,000 checksum iterations/request, not
  per-field computation. Compared separately with own owner-only fixture.
- Structure probes at 4/24/48 fields: six hooks/one adapter call, 24-field **144**
  callbacks; new raw fact normalizations exactly six. All 12 root/embedded stages
  closed/cleared, isolated root-view copies constant 12 across widths, trusted zero;
  no per-field whole-source/grant copy claim inferred from mode labels. Actual held/
  released GC observations and extra work counters execute; they are retained bytes,
  NOT allocation counts. No heap retention threshold is accepted from this smoke.
- Both old/new timing builds use `checked-each-response-v1`. Historical row-count-only
  timing data stays separate. Actual process CPU user+system, nearest-rank p95,
  paired medians, exact initial/repeat ordering and component allowance have tests.

All failures remain preserved. Original `probes-05.log` aggregator exit 0 did not make
its failed isolated/trusted child results pass. Recovery `v6-final-01` caught an
unregistered negative-predicate fixture field (fixed in the harness schema); its
43/44 result is not a pass. `smoke-sealed-all-01` recorded 16 parent-validator failures
because H0/H2 intentionally cycle rows; the native/fingerprint strengthening wrongly
assumed their outputs constant. Corrected with regression coverage; **new named
`final-02/` seal and smoke** replace acceptance, without overwriting that failure.

## Sealed identities and preservation

- Accepted candidate ESM:
  `76c7019b1714d7ab312e86c51476b82006b35a2ddbb52872156dc44c0c90661d`.
  CJS and all declarations/guide match OAR-08; no new product AST/runtime fix claimed.
- Baseline ESM:
  `33662faede23acffc1a90973f51a7407df147afba76e4fbb23eeb99169df3822`.
- Candidate metadata SHA256:
  `df57d724619b57fa1b95fb4c1badd9bf1da4fb896286a20c94639b4eebc31264`.
- Final config SHA256:
  `156e8632978fd24fdea63c38605b9a6569b9dab045bd02f884ebaa8b377d2876`.
- Lock unchanged:
  `ef86ef24726d09f81d1262656920d6215caeb0f26e345198db2d27b8ab7ab314`.
  HEAD unchanged: `58b22c0d6d3abd4ecce03533e3867d148ff21233`; all work uncommitted.
- `final-02/PRESERVATION.json`: **951,084** recovery-entry historical paths and
  **789,537** original-entry paths unchanged by size/mtime/ctime; **116** archived
  original byte streams verified. Original failed evidence/caches were not cloned
  or written. **134 dependency records/3,510 files**, plus **293 tool dependency
  records/10,545 files**, hash-audited; **619** copied candidate files verified.
- Candidate source/dist/tool/runtime identities and post-gate rebuild equality are
  fully enumerated in `final-02/candidate-metadata.json`; copied artifact is read-only.

## Handoff boundary

Use **`final-02/FINAL-PROTOCOL.json`** and **`final-02/FINAL-PROTOCOL.md`** only.
Runbook preserves original gates, 360 initial full-setting jobs/two reversed rounds,
exactly two affected repeat pairs, explicit H2/H3 read allowance and field-scaling
review. It requires fresh OAR-09B output/cache directories and makes no performance
claim. No OAR-09A blocker remains after the final identity/job audit; no owned jobs
remain. The coordinator alone updates shared task status. OAR-09B must still measure,
reconcile raw gates/artifacts and report explicit disposition; OAR-10 is independent.
