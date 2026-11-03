> Historical document preserved from ignored task scratch storage.
> Scope and limitations: `docs/task-artifacts/access-router/README.md`. References to omitted
> artifacts are historical, not available execution prerequisites.

# OAR-09F-I handoff — blocked before product changes

## Outcome and packet

- Packet: `_tmp-oar09f-implementation-ppphro5o` (verified ignored).
- No product source, public types, committed tests, documentation, benchmark,
  task, dependency or lock changes.
- No `pickAllowedFieldsMany` method or `FilteredOutput` export has been shipped.
- **Blocker:** the approved pre-copy cumulative payload accounting cannot be
  enforced solely through the reused stage/materializer admission: existing
  hydrated normalization delegates copying to Mongoose before those owners see
  the normalized result. See `BLOCKER.md` and the three passing boundary probes.
- Stopped rather than silently excluding supported native copies, applying the
  limit after allocation, narrowing hydrated support, guessing accounting, or
  introducing a replacement hydration engine. This is not a proof that a larger
  accounting-aware normalization redesign is impossible.

## Approved contract coverage and outstanding work

The approved proposal was read in full, as were AGENTS.md, the applicable
ai-friendly-ts-package/task-as-you-go skills, task C1–C6 and F/F-I/F-V. Approval of
the API/implementation was treated as current; historical awaiting-approval prose
and the unchecked measurement checklist were not edited or reinterpreted.

There is **no new runtime contract implementation or acceptance evidence** in this
packet. All collection entry/receiver/control capture, all-source preflight,
independent row stages/memos/EMPTY, collection/aggregate/payload enforcement,
scheduling/poison/drain/clear, public declarations and their requested regression
proofs remain undelivered. In particular, there are no new 1/10/100 capture counts,
2,400-callback results, exact aggregate-boundary tests, or closed/cleared batch
state assertions to report. Existing single-row signatures and behavior were not
changed. The guard was neither reopened nor modified.

## What was actually verified

Foreground, serial, awaited; repo-root working directory:

```sh
pnpm exec vitest run --config _tmp-oar09f-implementation-ppphro5o/vitest.config.ts
```

- **1 private investigation file / 3 tests passed**, exit 0 (latest complete run).
- Uses actual current source Core/helper admission, no Mongo server or adapter I/O.
- Observed one real Mongoose `Buffer.from` copying **17,825,792 bytes** before an
  application transform discarded the value and our materializer saw only
  `{ name: 'kept' }`.
- Observed five copies of **4,194,304 bytes**, totaling **20,971,520 observed bytes**,
  for five independent calls with the same hydrated input. This is not a batch
  test, performance measurement, or assertion that old helpers share a limit.
- An additional proof starts with **1 byte** in raw stored native state. An
  allocation-free earlier normalization callback swaps in a preexisting large
  native; canonical Mongoose normalization then copies **17,825,792 bytes** before
  returning to our materializer. Thus an initial raw-state prescan is also
  insufficient. The callback itself makes no payload allocation.
- These are counts of particular observed copies, not total allocation counts,
  exact RSS, timings, or a passing 16 MiB implementation.
- `logs/02-boundary-probe.command.json` records argv and fresh packet-local
  temp/cache/pnpm/XDG/Mongo environment settings. Its `.log` and `.exit.txt` retain
  the latest result. The initial two-test pass is retained as
  `logs/01-boundary-probe.*`; after adding the third proof the entire file was
  rerun. Vite's config-loader warning is preserved. No failed test attempts.
  Two failed packet-prose patch verifications are preserved in
  `logs/03-packet-prose-patch-failures.txt`; the corrected patch succeeded.
- No product builds, regression suites, source tsc, product ESLint/Prettier,
  full core/deco gates, packed consumers or workspace-wide checks were run:
  there is no new product code, and implementation stopped at the blocker.
- `preservation.json` and the post-probe `final-preservation.json` compare all
  **383** saved originals with current bytes:
  **0 changed originals**, and entry/exit git porcelain status is byte-identical.

## Changes versus incoming, not versus HEAD

Only exclusively owned ignored packet files were added:

- `originals/`, `original-hashes.json`, entry/exit status and HEAD snapshots.
- `hydration-accounting-boundary.test.ts`, `vitest.config.ts` and probe logs.
- `BLOCKER.md`, this handoff, preservation reports and process-check snapshots.
- `dependency-source-evidence/` snapshots and hashes of the installed Mongoose
  source referenced by the blocker.
- Fresh private temp/cache/pnpm/XDG/Mongo directories; no Mongo was started.

Every core source/test file and every incoming modified/untracked file was copied
and hashed before any potential edit. Existing H+G changes, the four untracked
H+G files and coordinator task edits are preserved exactly. No commit, publish,
dependency operation, reset/revert, delegation or old packet script execution.

## Preservation identities

HEAD remains `a1996e10f8339d89fc8a0aa2b10f7b531f5a07ca`.

| File | SHA-256 |
| --- | --- |
| `pnpm-lock.yaml` | `ef86ef24726d09f81d1262656920d6215caeb0f26e345198db2d27b8ab7ab314` |
| `packages/access-router/package.json` | `7c1b9b289aa465412cf5e64648ff82b436eef6caadc2389b9ddbeedbad5b5640` |
| `packages/access-router/dist/index.mjs` | `8a5ded622337bddd1b9ce31a95dc3a3dfb0b10e734db52c4b371c5d55cf5267e` |
| Proposal `PROPOSAL.md` | `dc844189e81fe624f5fc3bca1461be62b58a07648d4580860bd830343dc2e7c3` |
| Proposal `MEASUREMENT-APPROVAL-CHECKLIST.md` | `1eef1781982d3daff75bf5e52b6718a8614076d743e29e65871c688a0bb83a1d` |
| Guard-final `NEWHANDOFF.md` | `bd82aa3d7e9a1a3eef8914fae41894eb8bb98b3eaad71a7d5de8da23ced75faf` |

`preservation.json` also records unchanged hashes of the latest redesigned
measurement REPORT/NEWHANDOFF. Old campaigns/tools were not executed or modified.
The old 5,957/742/45/180 checks and 73/90 measurement result are not new evidence
for this investigation or an unimplemented API. The two adverse H3 comparisons
and fifteen unstable-sign comparisons remain blocked as supplied by the coordinator.

## Next owner / F-V boundary

Coordinator owns task/status. Resolve the hydrated pre-copy accounting boundary
before resuming F-I; no task was edited by this owner. F-V is not unblocked by
these three investigation tests.

After an actual coherent F-I implementation, F-V still owns installed
README/MIGRATION/llms/CHANGELOG/site/deco guidance, actual packed public consumer
and module/peer matrices, affected full core/deco gates and a new deterministic
artifact seal. No export-shape or packed test was edited here, and there is no
new public/declaration behavior for F-V to validate yet.

All invoked commands and both test subprocesses completed in the foreground. No
background jobs were launched, no Mongo server was started, and no owned
build/test/server jobs remain. `final-process-check.txt` records the final packet-name
process check (only the foreground checker itself).
