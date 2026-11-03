> Historical document preserved from ignored task scratch storage.
> Scope and limitations: `docs/task-artifacts/access-router/README.md`. References to omitted
> artifacts are historical, not available execution prerequisites.

# OAR-09E H+G sealed candidate — fresh measurement runbook

Use **only `docs/task-artifacts/access-router/oar09e-guard-final-ncHxXYjL/final-01/FINAL-PROTOCOL.json`** for this
candidate. Coordinator reconciliation and a **fresh sequential measurement owner**
are required before `--run`. This packet ran correctness smoke, **not OAR-09B timing**.
The three earlier failed campaigns remain separate, unchanged and truthful.

## Sealed inputs

- Read-only `candidate-artifact/`: **626 copied files / 579 source records / 67
  deterministic rebuilt outputs**, with all 14 core outputs/eight declarations.
- Candidate root ESM:
  `8a5ded622337bddd1b9ce31a95dc3a3dfb0b10e734db52c4b371c5d55cf5267e`.
- Candidate metadata SHA256:
  `7cdfae3120228645865dffad8894a15d8cbc3a67a7a4c77db358ae3b6be45f43`.
- Protocol JSON SHA256:
  `052386cd6a0f1e8ab5461e64dc7302daefc7b86dc4f24cf1088d6af4f21a4ad8`.
- New **13-tool seal**, 293 tool dependencies/10,545 files; product external closure
  134 packages/3,510 files. Node **26.12.1**, pnpm **11.18.0**, actual Mongo **8.2.6**;
  binary identities and lock `ef86ef24…` are pinned in metadata and rehashed.
- Comparator remains the **original**
  `_tmp-oar01-20261031-153820/baseline-artifact/`, root ESM
  `33662faede23acffc1a90973f51a7407df147afba76e4fbb23eeb99169df3822`.
  Original baseline/dependency seals and `PERFORMANCE-GATES.md` /
  `MEASUREMENT-PLAN.md` remain authoritative. No previous remediation is substituted.
- Current committed entry is `a1996e10f8339d89fc8a0aa2b10f7b531f5a07ca`; the older
  seals' pre-user-commit HEAD is historical, not a reason to revert user work.

## Candidate-only counted mechanism amendment

New series: **`checked-each-response-v2`**. Candidate `countContract` is exactly
`{revision: 'facts-only-v1', artifactSha256: <the actual candidate root ESM hash>}`.
Historical targets have **no** such claim. Never infer this revision from modes or
declarations: old owned candidates expose those same modes and actually ran 24 guard
callbacks. Their old v1 tools/reports must not be rerun or relabeled with v2.

Accepted DESIGN G1–G5 makes model guards no-DTO consumers. H4's same public route,
body/index, seeds, row, selection/projection, hook input, condition and `{allowed:true}`
response retain **one read/one hook**, now with **zero output-field callbacks**.
Normal DTO controls still perform all **24** callbacks and one decoration. Untimed
preflights compare actual query/hook input in lean and hydrated modes and observe
true/401/invalid-fact 400; instrumentation separately proves no output begin and actual
closed/cleared stages. An authentic old 24-callback artifact is rejected despite a
deliberately hash-matched false claim. This changes guard effects/error semantics,
**not** timing acceptance criteria. Installed migration docs explain the change.

All other helper callback formulas and actual outputs remain unchanged. Raw helpers
have fresh capture, isolated admitted source, EMPTY facts, explicit output policy,
zero DB/hook work and all selected-value checks. H2/H3 current-authority refresh still
adds one explicit normal read/batched read plus matching hooks. No DTO authority,
cached decision, batching substitution or hidden refresh is introduced.

## Fresh execution from checkout root

Replace the fresh output placeholder. Use new exclusive TMPDIR/XDG/cache/store paths,
disable downloads and set `MONGOMS_SYSTEM_BINARY` to the pinned metadata binary path.
Do **not** run this packet's `run.py` or `seal.py`: they write here. No source/tool/
dependency/install/build changes during timing. All commands foreground, serial and
awaited; one owned Mongo/worker with cleanup on every exit.

```sh
PACKET='_tmp-oar09e-guard-final-ncHxXYjL/final-01'
NEXT='_tmp-oar09b-REPLACE-WITH-NEW-EXCLUSIVE-PACKET'
node scripts/benchmarks/access-router-owned.mjs --plan "$PACKET/FINAL-PROTOCOL.json" "$NEXT/plan"
# Fresh measurement owner ONLY after coordinator acceptance:
node scripts/benchmarks/access-router-owned.mjs --run "$PACKET/FINAL-PROTOCOL.json" "$NEXT/final-batch-01"
```

**45 cases × four profiles × two reversed rounds = 360 initial jobs**. Preserve
interleaved current-default/isolated and current-active/trusted order, actual mode
getter/declaration proofs and every full response fingerprint. Compiler inspection
stays outside measured heaps. Primary LIST stays three scenarios, 100 rows/24 fields/
32 bytes/one client/hook concurrency 10/five warmups/100 samples. Six guard workloads
at 10/100 rows still use 50 samples. These are LIST workload families, distinct from
the H4 model-condition consumer. READ/helper/native/fact/retention families retain
their fixed bodies/seeds/settings; worker audit confirms exact definitions.

On fixed miss/adverse/sign triggers, run **exactly two additional reversed pairs**
at original settings for that comparison. Four-pair three-of-four sign/confirmation
rules remain fixed. No discarded jobs, increased samples, extra unchanged-artifact
campaign, pooled cross-time pairs or threshold waiver.

Benefit: isolated/default primary must improve median and CPU in both initial pairs;
paired median savings ≥10% **and** 1 ms latency, ≥10% **and** 0.5 ms CPU. Adverse:
>10% **and** 1 ms median, >15% **and** 2 ms p95, >10% **and** 0.5 ms CPU. H2/H3 refresh
allowance uses old flow **plus its matching old query**, with no synthetic p95.
Retained held/released GC growth remains >15% **and** 1 MiB; heap observations are
not allocation counts. Actual Mongo CPU/true allocations remain unavailable.

Independently audit raw order/counts/hydration/expected full responses, paired deltas
and fixed gates. Rehash source/dist/artifact/tools/dependencies/lock/binaries before
and after; the necessary post-gate six-package rebuild must preserve all 67 outputs.
Keep OAR-09 open if any fixed gate fails. OAR-10/release acceptance remains later.
