# ARRC-02 — separate model output metadata completion

**Implemented; scoped verification passed; no blocker.** Only ARRC-02 was changed.
The coordinator owns the shared task/status file; ARRC-03–06 and independent final
acceptance remain outside this handoff. No commits, resets, additional delegation
or background/queued jobs.

## Delivered boundary

- `packages/access-router/src/services/model-output-metadata.ts` now owns metadata
  completion through `createModelOutputMetadataCompletion`: private-association
  output removal, include restoration, metadata stripping/exposure, grant debits,
  field maps/placeholders and presentation aliases. This is the module extraction
  approved in the [move ledger](arrc-01-move-ledger.md).
- `Service.finalizeDirectOutput` retains its exact name/signature/member position,
  access/configuration capture, private association stage exclusion, finalizer
  inputs, `onFinalized` capture and `{ data, context }` return. Its implementation
  now presents orchestration separately from the metadata policy.
- The synchronous factory takes the **original args reference**, captured
  binding/configuration and two synchronous receiver-forwarding arrows. It only
  returns the original async completion body at the same property position: no
  eager row/flag/context/stage reads, copied lifecycle context, Service import,
  method binding, async trampoline or added await. Helper types are not barrel exports.
- The body preserves grants/source reads, include/strip/alias ordering, every
  budget debit, repeated `source._id` reads around the field-access await and
  sequential `_view`/`_edit` awaits. Stage validation/closure remains in the finalizer.
  A TypeScript token comparison matched all **508 callback tokens** after only the
  approved two forwarding substitutions and erased `binding!` assertions.

`test/model-output-metadata.unit.test.ts` adds seven narrow characterization tests
for previously unpinned extraction boundaries: factory capture without live reads;
deferred original args and post-await ID reread; stripped completion microtask
ordering without a trampoline; and replacement method lookup on the real receiver.
The latter three run in both source modes. **All 247 existing test/fixture files
are byte-identical**; no assertions, expected values or skips were changed.

## Fresh verification

Commands ran sequentially from repository root, foreground timeout 2,400,000 ms,
with `TMPDIR='<repo-root>/_tmp-arrc-02-0zejDJot'` (replace `<repo-root>` before use).
`git check-ignore -v` confirmed `.gitignore:8:_tmp*`.
Exact argv, environment, selected files/counts and identities are in
[arrc-02-verification.json](arrc-02-verification.json).

| Command/check | Result |
| --- | --- |
| `pnpm --filter @web-ts-toolkit/access-router typecheck` | Pass; fresh filtered/transitive build and source typecheck; 27.577 s |
| `pnpm --filter @web-ts-toolkit/access-router exec vitest run --config vitest.config.ts test/model-output-metadata.unit.test.ts` (plus JSON/default reporters) | 7 tests / 1 file passed |
| Same Vitest command with the 29-file selection in verification JSON | **1,143 tests / 29 files passed**, zero failures/skips/todos; 83.920 s |
| `pnpm exec eslint packages/access-router/src/services/service.ts packages/access-router/src/services/model-output-metadata.ts packages/access-router/test/model-output-metadata.unit.test.ts` | Pass |
| Declaration path/byte/hash comparison after checks | All **8 files / 782,693 bytes identical** to the [ARRC-01 manifest](arrc-01-declarations.json) and its read-only operational byte copies |
| Fresh deterministic work/trace comparison | **96 CRUD + 32 preparation records identical**, including raw JSON hashes; both publication-work observations also identical |

The 29-file selection is ARRC-01's focused set minus the three untouched logging
suites, plus the new characterization file. It includes metadata/output,
related/include/traversal, lifetime/scheduling, writes, fallback and work controls.
The unchanged CRUD harness passed all **434 tests** (432 catalog cases + two
guards), covering all 16 mode tuples, READ fallback and both UPSERT branches;
mixed parent/target modes and both write modes' source lifetime also passed.
The existing non-failing Vite native-config/ESM warning remains unchanged.

## Identity and evidence limits

Started from `28f7266fc010b7e3f14664fcc452d50bdcae0fde` with the accepted
[ARRC-01 identities](arrc-01-identity.json): source 151 files / `072039b4…`, tests
247 files / `22f30bb1…`. The only existing production change is `services/service.ts`;
one helper and one test file were added. All other 150 baseline source files,
14 public/config files and 151 read-only baseline source copies remain unchanged.
Exact candidate tree/file hashes are in the verification JSON.

The original [128 work observations](arrc-01-work-baseline.json) remain the durable
data: fresh candidate reports matched them exactly, so duplicate rows/log trees
were not archived. Source/declaration byte copies, command logs, full Vitest JSON,
generated builds and MongoDB files remain disposable operational scratch, not
portable evidence. Reproduction needs workspace dependencies, the recorded
ARRC-01 toolchain and MongoDB memory-server prerequisites. A scratch-only identity
probe initially treated tuple entries as objects; it was corrected before the
successful baseline match, with no source/test change or failed package check.

No performance claim, full package test, root/grouped/downstream suite, published
documentation change or later task implementation. ARRC-06 retains the one final
full package run and independent acceptance. The handoff audit checked JSON/link/
privacy/whitespace validity, preserved baseline hashes and nonignored destinations.
