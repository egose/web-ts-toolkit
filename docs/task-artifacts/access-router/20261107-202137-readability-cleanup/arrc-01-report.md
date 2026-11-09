# ARRC-01 — compatibility baseline and approved boundaries

**Complete; no blocker.** Investigation only: no production code, tests, package
manifest or shared task edits. The coordinator owns status updates in the
[task file](../../../tasks/20261107-202137-access-router-internal-readability-cleanup.md).
ARRC-02 may start; ARRC-03–06 retain their sequential dependencies and are not
completed by this report.

## Packet index and outcome

| Evidence | Purpose |
| --- | --- |
| [Move/name ledger](arrc-01-move-ledger.md) | Exact ARRC-02–05 scope, smaller alternatives, declaration/dispatch keeps and caller map |
| [Source/test/public identity](arrc-01-identity.json) | Per-file hashes, ordered tree digests, full package manifest, public/config hash list and historical comparison |
| [Declaration inventory](arrc-01-declarations.json) | All fresh `.d.ts`/`.d.mts` paths, byte lengths, SHA-256 and operational byte-copy locations |
| [Keep/caller inventory](arrc-01-callers-and-keep.json) | Exhaustive ordered Service/Base/PublicService declaration members; private callers/arguments and finalizer imports, including tests |
| [Verification](arrc-01-verification.json) | Exact command argv/environment, exits, per-file results, unchanged-file proof and gates |
| [Work baseline](arrc-01-work-baseline.json) | Fresh 96 CRUD + 32 preparation count/trace records and two publication-work observations |

Approved outcomes: metadata completion only at the existing callback boundary;
populate role names/comments without a new traversal owner; eager logging organized
with local types/comments rather than an indirection-only module; the three lexical
finalizer renames. See the ledger before implementing; class member names/order,
receiver dispatch, expression/await boundaries and ownership remain frozen.

## Fresh verification

All commands ran sequentially from repository root with ignored repo-local `TMPDIR`;
foreground tool timeout 2,400,000 ms, no background/queued jobs.

| Check | Actual result |
| --- | --- |
| `pnpm --filter @web-ts-toolkit/access-router typecheck` | Exit 0; 27.574 s; script freshly built access-router and required transitive packages, then ran source typecheck |
| `pnpm --filter @web-ts-toolkit/access-router exec vitest run --config vitest.config.ts …` | Exit 0; **31 files / 1,171 tests passed**, no failures/skips/todos; 88.623 s command duration |
| `pnpm exec eslint packages/access-router/src/services/service.ts packages/access-router/src/acl/model-service-owner.ts packages/access-router/src/output/finalize-model-output.ts packages/access-router/src/logger-helpers.ts` | Exit 0; 2.747 s; four-file baseline only, not package-wide lint |

The ellipsis is a display abbreviation only: the verification JSON records every
selected path and both reporter arguments exactly. Selection includes all task V1
table families plus `service-authorization-finalizer.unit.test.ts`. The all-16-mode
CRUD harness passed 434 cases/tests (432 catalog cases plus two harness guards),
including READ fallback and both UPSERT branches; metadata trace 24, no-work
scheduling 26, logging 16 unit + 8 integration, related modes 26, subdocuments 26,
write source lifetime 25 and retained service ownership 52 also passed.

Typecheck's fresh build produced **8 declaration files / 782,693 bytes**, including
both shared parser chunks. All match the previous declaration hashes and were
compared byte-for-byte with the new frozen copies again after focused checks.
Deterministic work's raw JSON hashes also match the earlier recorded hashes; these
observations were nevertheless **rerun fresh**, not substituted with history.
Counters/traces are work diagnostics, not timing or allocation measurements.

Toolchain: Node `v26.12.1`, pnpm `11.18.0`, Vitest `4.1.11`, tsup `8.5.1`.
Existing Vite configLoader/ESM warning was non-failing; configuration was not changed.
A scratch inventory probe initially assumed nonexistent root `tsconfig.json`;
correcting it to `tsconfig.base.json` preceded the successful freeze/checks. This
was not a build/test failure.

## Identity and historical-use decision

Baseline HEAD: `28f7266fc010b7e3f14664fcc452d50bdcae0fde`; only the coordinator's
task file was untracked at delegation. Tracked diff is still zero bytes.

| Protected identity | Files | SHA-256 ordered-tree digest |
| --- | --- | --- |
| Access-router source | 151 | `072039b46ed3603f995bd04a9b0e09817dce13cef58679774b45da5efa02caef` |
| Access-router tests/fixtures | 247 | `22f30bb1725f17ea9e48bc2528d6d8593ac648d3c5f53e1c2745ccf40198a0c0` |

All **2,357 initially tracked files**, all 151 frozen source copies and all eight
declarations were checked after verification: no protected byte changes. No
assertions, expectations or skips were edited; no new tests were necessary.

The prior [ARPC-08 manifest](../20261105-084939-performance-cleanup/arpc-08-verification.json)
has matching production/lock/declaration identities, **but not the current test
tree** (`16cdad67…` there versus `22f30bb1…` here). Nine individually recorded
test/fixture hashes differ, plus one guide; exact expected/actual values are in the
identity manifest. Therefore the historical 7,558 tests / 210 files are **not reused
as an identity-matched baseline**. The cause/relevance of those byte differences
was not assumed away. This does not block ARRC-01: its required fresh V1/typecheck
passed; no full baseline rerun was requested. ARRC-06 still needs its final full run.

## Operational copies and reproducibility limits

Fresh scratch: `_tmp-arrc-01-2nfaqj2y`; `git check-ignore -v` confirmed
`.gitignore:8:_tmp*`. `TMPDIR` was its absolute path at runtime. Later sequential
agents in this checkout can use these **read-only operational copies**:

- Source: `_tmp-arrc-01-2nfaqj2y/baseline/packages/access-router/src/`.
- Exact declaration bytes: `_tmp-arrc-01-2nfaqj2y/baseline/declarations/` (all eight;
  names and hashes in the durable declaration inventory).
- Raw logs/reporter output and original work reports remain in that scratch only.

These trees are deliberately not committed evidence or portable installations. If
scratch is unavailable, reconstruct source from the recorded HEAD and freshly build
that revision with the recorded lock/toolchain before comparing the durable file
inventory and hashes. Do not overwrite these copies with a candidate build.

Only the report/ledger, identities and necessary deterministic work data were
curated. Full logs/assertion JSON, duplicate source/declaration trees, generated
builds/consumers, dependencies, database files and any raw consumer installs were
omitted. Reproduction requires workspace dependencies and MongoDB memory-server
prerequisites. No benchmark campaign, full package baseline, root/grouped/downstream
suite or root lint/build sweep ran. No speedup claim or historical recertification.

Required ARRC-01 gates passed: compatibility/move approval, repository-wide caller
review, fresh declarations, V1 focused baseline and V2 typecheck. Packet JSON/link/
privacy/whitespace and preservation checks are recorded in the handoff audit.
