> Historical document preserved from ignored task scratch storage.
> Scope and limitations: `docs/task-artifacts/access-router/README.md`. References to omitted
> artifacts are historical, not available execution prerequisites.

# OAR-09D candidate / fresh OAR-09B measurement runbook

Use **only `docs/task-artifacts/access-router/oar09d-hVF7iALN/final-01/FINAL-PROTOCOL.json`** for this new
candidate. Coordinator reconciliation and a **fresh sequential measurement owner**
are required before `--run`. OAR-09D ran correctness smoke, NOT a V8 campaign.
Both failed OAR-09B campaigns and all fixed gates remain intact and blocking.

## Sealed inputs

- New read-only `candidate-artifact/` and adjacent `candidate-metadata.json`:
  **622 copied files / 575 source records / 67 deterministic rebuilt outputs**.
- New root ESM SHA256:
  `7faeb957631bd5761e8b828835f4b600634db1afa740e229549bfc4ba6a74a4f`.
- Metadata SHA256:
  `63c5ed2dbf4bdc2d47d06c0fb4216347d8bbd3f3eadc9bfb4b2de87cf08bc197`.
- Protocol JSON SHA256:
  `c7a523f9cb79d8574a56d688794d8d1508c7ecf05e05e0e29cb45c9f97efd28f`.
- All **13 benchmark tools**, 293 tool packages / 10,545 files, Node **26.12.1**,
  pnpm **11.18.0**, Mongo **8.2.6**, binary hashes and lock remain pinned.
- Baseline is the ORIGINAL `_tmp-oar01-20261031-153820/baseline-artifact/`, ESM
  `33662faede23acffc1a90973f51a7407df147afba76e4fbb23eeb99169df3822`;
  552 files / 134 dependency records / 3,510 files, using the original seals.
- Original `PERFORMANCE-GATES.md` and `MEASUREMENT-PLAN.md` in that packet govern
  without amendment. OAR-09C is a remediation parent, NOT the V8 comparator.

## Fresh execution from checkout root

Replace the unique output placeholder. All caches/TMPDIR/XDG/pnpm indexes/stores
must belong to the fresh owner's packet. Disable downloads and use the pinned
metadata.systemBinary.path. Do not use this packet's `run.py`: it writes here.
No source/tool/dependency/install/build work during timing. All work foreground,
serial and awaited, at most one owned Mongo and one worker, cleanup in finally.

```sh
PACKET='_tmp-oar09d-hVF7iALN/final-01'
NEXT='_tmp-oar09b-REPLACE-WITH-NEW-UNIQUE-NAME'
node scripts/benchmarks/access-router-owned.mjs --plan "$PACKET/FINAL-PROTOCOL.json" "$NEXT/plan"
# Fresh measurement owner ONLY, after coordinator acceptance:
node scripts/benchmarks/access-router-owned.mjs --run "$PACKET/FINAL-PROTOCOL.json" "$NEXT/final-batch-01"
```

All **45 cases × four profiles × two reversed rounds = 360 initial jobs** remain
fixed. Interleave old current-default/active and new isolated/trusted, using actual
declarations and both model getter paths. Do not compare separate cross-time means.
Compiler inspection remains outside the measured heap.

Primary LIST: three unchanged scenarios, 100 rows / 24 fields / 32 bytes / one
client / hook concurrency 10 / five warmups / 100 samples. Six guards at 10/100
rows use 50 samples. READ/helper/native/fact/4–24–48-field retention families keep
their separate APIs, counts and settings. All 13 tools and fixture bodies are unchanged.

On a miss/adverse/sign trigger run exactly **two further reversed pairs** at the
original settings for that comparison. Preserve every initial/repeat observation.
No larger samples, discards, substitutes or additional unchanged-artifact campaigns.
Four-pair three-of-four alignment/confirmation rules are unchanged.

Benefit: isolated/default primary must improve median and CPU in both initial pairs;
median paired savings >=10% AND 1 ms latency, >=10% AND 0.5 ms CPU. Adverse: >10%
AND 1 ms median, >15% AND 2 ms p95, >10% AND 0.5 ms CPU. Sign instability is not
waived because a case is small. Raw helpers remain zero-read/hook, isolated source,
EMPTY facts and explicit scoped output policy. H2/H3 refresh adds exactly one normal
read/batched read, compared with old flow PLUS its matching OLD query and the fixed
allowance. No synthetic p95. H4 retains one read/hook and **24 output callbacks**.

Audit every raw fingerprint, actual hydration/getter/read/hook count, paired median,
nearest-rank p95 and user+system CPU on BOTH artifacts. Retention remains >15% AND

> 1 MiB held/released GC growth; heap noise is not an allocation count. True allocation
> counters and Mongo CPU remain unavailable. Rehash all artifacts/source/dist/tools/
> dependencies/lock/binaries before and after; a necessary post-gate rebuild must match
> all 67 outputs. No owned jobs may remain. A failed gate keeps OAR-09 open; this seal
> does not waive tradeoffs or start OAR-10.
