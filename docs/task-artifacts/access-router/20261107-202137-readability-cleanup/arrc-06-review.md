# ARRC-06 — independent final acceptance

**Accepted; no blocker.** The final reviewer was not an implementer. Actual source,
callers, fixtures, new tests and the approved [move ledger](arrc-01-move-ledger.md)
were inspected independently; prior reports were not substituted for acceptance.
No production/test changes were needed. The coordinator owns the unchanged
[shared task](../../../tasks/20261107-202137-access-router-internal-readability-cleanup.md).

## Retained source and contract assessment

- **Metadata:** `packages/access-router/src/services/model-output-metadata.ts`
  is an 85-line, synchronous callback factory with one return statement. It captures
  the original args object, binding/configuration references and synchronous
  forwarders, not early row/flag/context reads. `Service.finalizeDirectOutput`
  constructs it at the original `completeOutput` property position and passes its
  async callback directly: no async factory, trampoline, extra promise or await.
  Independent parser-token comparison matched the original completion body after
  only the two approved forwarding substitutions and erased non-null assertions.
  Grants/stage read, include source, private-association removal, include restoration,
  old metadata/alias removal, strip return, root/path admission, every grant debit,
  field-access fallback, `_view` then `_edit` awaits and final alias attach retain
  their sequence. `source._id` is still read for the query and reread after its await.
  Current context access and query method replacement resolve on the real receiver
  at completion, not factory creation; the query forwarder is not async. Finalizer
  stage/budget/publication revalidation and stage closure remain after completion.
- **Populate:** all three methods retain their names, positions, positional
  types/defaults and receiver dispatch. Independent binding/token checks verified
  **34 approved bindings / 180 identifier substitutions**, with corresponding local
  declaration resolution unchanged. Defaults still refer to the renamed original
  parameters; record keys such as `budget`/`depth` were not renamed. Array traversal
  retains the path segment index while extending output address/depth. Original
  provenance, target-local policy and per-occurrence receiver budgets remain separate.
  All four WeakMaps, preregistration, pending-promise insertion before its await,
  shared target construction, per-receiver copies and publication cleanup are intact.
- **Logging:** the two local aliases expand to the original `Omit` types. Both
  executable method bodies have identical parser tokens: start clock, model/summary
  reads, extra spreads, completion clock and debug dispatch stay eager and ordered.
  Unchanged `logger-helpers.ts` still performs live level/logger resolution, fallback,
  redaction/cardinality messaging and receiver-safe application. No lazy logging or
  new logging module/event was introduced.
- **Finalizer:** independent checks verified exactly five approved lexical bindings,
  **17 identifier substitutions / 3,601 tokens / 1,171 identifier sites**, without
  changed local declaration resolution. Preparation callsites/sharing, stage facts,
  field decisions, copies, private handoffs, errors, awaits and publication settlement
  are unchanged; only the existing batch shares preparation. No withdrawn cache or
  preparation optimization returned.
- **Dispatch and API:** all **91 source Service members** retain their ordered names;
  unaffected members/module statements compare token-identically. Base/PublicService
  and owner binding are byte-unchanged. `Base` still registers and binds the actual
  subclass instance during `super`; `bindModelOwnerMethods` remains subclass-first,
  preserving protected overrides, nested dispatch and fresh query entries. The new
  helper has no Service runtime import, initialization call or public-barrel export.
  All **8 declaration paths / 782,693 bytes** match both the durable
  [ARRC-01 inventory](arrc-01-declarations.json) and operational baseline copies after
  final tests. The emitted keep inventories remain Service 89, PublicService 29,
  Base 62; all 14 public/manifest/config files also match ARRC-01.

The approved outcomes are delivered: coherent metadata completion, explicit populate
roles, local eager-log vocabulary and clearer finalizer phases. Keeping positional
signatures and declining an indirection-only logging module are approved boundaries,
not unfinished tasks. No consumer migration, alias or unsupported behavior improvement
is required; no performance or bundle-saving claim is made.

## Unchanged tests and actual mode coverage

All **247 original test/fixture files** match ARRC-01 byte hashes. The only addition,
`test/model-output-metadata.unit.test.ts`, contributes seven meaningful cases:
one proxy-based no-eager-read check, plus original-args/post-await-ID, stripped-promise
microtask order and real-receiver replacement checks in both source modes. Existing
assertions, expectations, negative checks and skips were not edited.

The full package run includes the unchanged **434-test CRUD harness** (432 catalog
cases plus two guards). Its fixtures verify actual admitted stage modes, not labels,
across all 16 READ/LIST/CREATE/UPDATE tuples, both direct/public entries where
supported, READ fallback and both UPSERT branches, persistence and repeated traces.
Inspected complementary fixtures include:

- `authorization-fast-path-options.integration.test.ts`: actual source/target and
  embedded captures, target-local READ/LIST settings, retry and in-flight capture;
- `write-output-populate.unit.test.ts`: independent parent/target modes and target
  READ/LIST/custom access, scalar/array/dotted occurrences, shared identity/copy
  accounting and capture before populate awaits;
- `write-output-modes.unit.test.ts`: both write modes detach live documents/native
  storage across CREATE/UPDATE/direct/public UPSERT, plus independent captured branch
  modes changed while a lifecycle hook is suspended;
- unchanged related/include, metadata trace, source lifetime, publication/bounds,
  logging, retained-owner and fallback suites; consumer/export/packed/strict types
  and tree-shaking checks remain included in the package suite.

## Fresh final verification

Sequential foreground commands from repository root; Node `v26.12.1`, pnpm `11.18.0`,
Vitest `4.1.11`, TypeScript `6.0.3`, tsup `8.5.1`. Exact argv, environment overrides,
timestamps, hashes and comparisons are in [verification JSON](arrc-06-verification.json);
the [curated log](arrc-06-verification.log) is not a full raw log.

| Command/check | Actual result |
| --- | --- |
| `pnpm --filter @web-ts-toolkit/access-router typecheck` | Exit 0; fresh filtered/transitive build and source typecheck; 30.848 s |
| `pnpm --filter @web-ts-toolkit/access-router test` | Exit 0; **7,565 tests / 211 files passed**, zero failures/skips/todos; 1,800.363 s command, 1,776.28 s Vitest |
| `pnpm exec eslint packages/access-router/src packages/access-router/test` | Exit 0; 7.937 s |
| Two publication work cases, exact name-filtered argv in JSON | Exit 0; **2 passed / 1 file**, 48 other cases filtered out; 2.659 s |
| Declaration, protected-file and work comparisons | Pass; no differences |

Exactly one full package run used a **3,000,000 ms foreground tool timeout**. Its
default reporter retained only the suite summary, not the two `OAR04_WORK` lines;
only those two cases were recaptured afterwards with explicit reporters. The 48
filtered cases are not source skips and had already passed in the full 50-case file.
No duplicate focused batch preceded the full run: current identity matched final
ARRC-05, and the fresh full suite supersedes its interrupted tool handoff for final
runtime acceptance. The unchanged Vite native-config/ESM warning was non-failing.

Fresh **96 CRUD + 32 preparation records** match
[ARRC-01 work data](arrc-01-work-baseline.json) deeply, including ordered traces and
raw JSON hashes. Both freshly recaptured publication observations also match exactly
(`a8ea6aa6…`). These are deterministic work diagnostics, not timing/allocation results.

## Identity, preservation and limits

Baseline HEAD: `28f7266fc010b7e3f14664fcc452d50bdcae0fde`; the tested candidate is
that revision **plus the retained uncommitted changes**, not bare HEAD. Source:
152 files / `e63cf3cc91fb0236e354ea741678892a2800c09dac7dd0c2ddfdbda4bd160814`;
tests/fixtures: 248 files /
`ae59a43f873cb9859472ac632fdff42ec8692b08645522d881e8e21a591bee90`.
These match final ARRC-05, pre-test and post-verification trees. All 2,357 starting
tracked files, the shared task, all 15 prior artifacts and 151 operational baseline
source copies remain unchanged by this reviewer. Old hash evidence and the separate
performance packet were not rewritten. No commits, resets, deletions or delegation.

Scratch `_tmp-arrc-06-ACEtYj` was confirmed ignored (`.gitignore:8:_tmp*`) and supplied
absolute `TMPDIR` at runtime; shared paths are scrubbed. Only this report, concise
JSON/log and [bundle index](README.md) are preserved. Full logs/assertion JSON,
scratch scripts, duplicate work arrays, source/declaration copies, dependencies,
databases and generated consumer/build/tarball trees are omitted. A scratch-only
scanner diagnostic was corrected to parser tokens; no package check failed.

This is a summary evidence bundle, not a self-contained installation/replay archive.
Reproduction needs the retained candidate change set, workspace dependencies,
recorded toolchain and MongoDB memory-server prerequisites. Baseline source can be
reconstructed from the recorded revision; declaration reconstruction also requires
its build, as described in [ARRC-01](arrc-01-report.md). No required continuation
depends on scratch. JSON/privacy/links/whitespace/nonignored destinations and final
protected identities were audited. No root/grouped/downstream sweep, benchmark or
second full run occurred. **No remaining blockers or queued/background jobs.**
