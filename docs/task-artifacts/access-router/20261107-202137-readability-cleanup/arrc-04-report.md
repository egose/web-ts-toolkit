# ARRC-04 — local eager-operation logging vocabulary

**Implemented; scoped verification passed; no blocker.** Only ARRC-04 was changed.
The coordinator's shared task file and all preceding evidence remain untouched.
No commits, resets, further delegation or background/queued jobs.

## Delivered scope

`packages/access-router/src/services/service.ts`: **11 added / 2 removed lines**
against the accepted post-ARRC-03 source:

- Added module-local, unexported `ServiceOperationStartExtras` and
  `ServiceOperationCompletionExtras`, preserving the two existing inline `Omit`
  definitions exactly, and substituted only their two private parameter annotations.
- Added three concise section/body comments distinguishing eager payload construction
  from caller-owned query orchestration and documenting start/end evaluation order.
- Retained `beginOp`/`completeOp` names, positions, parameter roles and return types,
  every executable expression and the **exact object literals and `as OpLogContext`
  casts**. No clock, summary, model-name or extra-property read moved; no lazy context,
  cached level, new event or logger-helper/`OpLogContext` edit.

This is the [approved smaller implementation](arrc-01-move-ledger.md): an additional
module would add accessor/forwarding indirection to two already-cohesive methods.
The metadata callback factory and approved populate names/comments are preserved.
No tests were added or changed; existing coverage showed no concrete gap.

## Runtime, API and work equivalence

- TypeScript **6.0.3** parsed the complete before/after service. Removing only the
  two new aliases and expanding their two parameter uses restores the same AST
  (**20,244 nontrivia tokens**). Both method-body ASTs match directly. Six exact text
  substitutions account for the entire diff; all other class-member text is unchanged.
- Full-file TypeScript ESNext and CommonJS JavaScript emission with comments removed
  is **byte-identical** before/after (106,934 and 114,108 bytes respectively). This
  is an emission-equivalence check, not a bundle-size or performance claim.
- Freshly built **8 declarations / 782,693 bytes**, including shared parser chunks,
  match the [durable declaration manifest](arrc-01-declarations.json) and read-only
  `_tmp-arrc-01-2nfaqj2y/baseline/declarations` byte copies. Public manifest/exports
  and all 14 baseline public/config files are unchanged.
- Fresh **96 CRUD + 32 preparation records** match the [work baseline](arrc-01-work-baseline.json)
  deeply, including ordered traces, and by raw JSON hashes. No work-count change.
- All **248 starting test/fixture files**, other 151 starting source files, shared
  task and 11 earlier artifacts remain byte-identical. All 247 ARRC-01 tests and
  151 operational baseline source copies still match their durable hashes.

## Fresh verification

Commands ran sequentially from repository root, in the foreground, with
`TMPDIR='<repo-root>/_tmp-arrc-04-wIsNhZYV'` (replace `<repo-root>` before use).
`git check-ignore -v` confirmed `.gitignore:8:_tmp*`. Exact argv, report environment,
per-file counts, hashes and comparison protocol are in
[arrc-04-verification.json](arrc-04-verification.json).

| Command/check | Result |
| --- | --- |
| `pnpm --filter @web-ts-toolkit/access-router typecheck` | Pass; necessary filtered/transitive build then source typecheck; 27.402 s |
| Recorded eight-file filtered Vitest command | **516 tests / 8 files passed**, no failures/skips/todos; 13.854 s |
| `pnpm exec eslint packages/access-router/src/services/service.ts` | Pass; 2.502 s |
| Complete-source AST/emission, declaration, identity and work comparisons | All pass |
| JSON/link/privacy/nonignored-destination audit and `git diff --check` | Pass |

The selection is exactly the three logging suites, all-16-mode CRUD harness and
four deterministic-work suites. The unchanged harness passed **434 tests**, including
READ fallback and both UPSERT branches. Logging contracts cover native/complex
filters, redaction, disabled/enabled/toggled levels, replacement/missing/throwing
loggers and related-model modes. The existing Vite native-config/ESM warning remains
non-failing. No full-package, root/grouped/downstream suite or benchmark ran;
ARRC-05/06 and independent final acceptance remain outside this handoff.

Only this report and its verification manifest were added to the durable bundle.
Scratch was reviewed; snapshots, check/runner scripts, full logs, assertion JSON,
duplicate work rows, generated builds, MongoDB files and dependencies were omitted.
This is not a self-contained reproduction bundle. Reproduction requires the recorded
revision plus retained ARRC-02/03 changes, workspace toolchain/dependencies and
MongoDB memory-server prerequisites; see [ARRC-01](arrc-01-report.md) for baseline
reconstruction. No earlier evidence or operational baseline was overwritten.
