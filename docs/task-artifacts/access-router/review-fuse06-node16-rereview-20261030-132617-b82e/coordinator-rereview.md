> Historical document preserved from ignored task scratch storage.
> Scope and limitations: `docs/task-artifacts/access-router/README.md`. References to omitted
> artifacts are historical, not available execution prerequisites.

# FUSE-06 narrow Node16 re-review

**P3 resolved; no blockers. Recommend independent FUSE-06 completion with withdrawal.**
This supersedes only the packed Node16 coverage finding from the earlier independent
review. The coordinator owns all task/status edits.

## Independent findings

- Removed exactly the two new Node16 list lines in memory and obtained the exact
  earlier review's test-file hash. No other test/product/runtime/API change is present.
- Ran the single current-major actual packed consumer test. Its actual generated
  `tsconfig.node16.json` includes both
  `output-publication-fusion-withdrawal.types.fixture.mts` and `.cts`, alongside
  the original four files. `module`/`moduleResolution` are `Node16`, `strict: true`,
  **`skipLibCheck: false`**, `noEmit: true`.
- The real `pnpm exec tsc -p tsconfig.node16.json` exited **0**. Both generated
  fixture copies match the original SHA-256
  `464cf4473faec09239d0893a75db89c5ca02596cd111a1a74e8917bd68cb6f74`.
  Their absent root/advanced/default/model/extended controls and original eight
  optional-boolean checks therefore compile through both Node16 declaration forms.
  Actual packed peers: Express **5.2.1**, Mongoose **9.8.0**.
- Evidence-only preload observes the real generated config after the compiler
  command finishes; it does not change argv, return values, output or errors.
- All **137 source files, 14 dist files and 8 declarations** still equal official
  FUSE-01 before and measured withdrawn-final, checked before and after the gate.
  ESM remains `ae83ba6dd6a6fd50a338096bea46cac0fab610256ffa5745b40596b430e472ca`;
  lock `ef86ef24726d09f81d1262656920d6215caeb0f26e345198db2d27b8ab7ab314`.
  Original six/two/eight option groups and CJS/ESM exports **46/48/6** are exact;
  former API/selectors and live third benchmark group remain absent.
- Task wording now correctly reports repeated observed slowdowns and insufficient
  acceptable benefit, explicitly not proven causal regressions or a universal
  no-gain claim. No causal/statistical significance was added or newly established.

## Checks actually run

Repo root, foreground, awaited and serial. Exact argv is also in each command JSON.

```sh
pnpm --filter @web-ts-toolkit/access-router exec vitest run --config vitest.config.ts --no-file-parallelism --maxWorkers=1 --reporter=default --reporter=json --outputFile.json=../../_tmp-review-fuse06-node16-rereview-20261030-132617-b82e/packed-current-peer-results.json test/packed-consumer-compatibility.test.ts -t 'supports current majors from release-artifact tarballs'
pnpm exec eslint packages/access-router/test/packed-consumer-compatibility.test.ts
pnpm exec prettier --check packages/access-router/test/packed-consumer-compatibility.test.ts
git diff --check
```

Results: **1 packed test passed / 1 file; 9 deliberately unselected**. Scoped lint,
format and diff checks all passed. One actual captured Node16 compiler invocation,
exit **0**. No build needed because all published runtime bytes already match.

Prior full access-router/typecheck/downstream/runner evidence remains applicable to
the unchanged runtime; the affected test-list gate has now been independently
reverified. No full suite, whole-workspace or performance rerun was needed or claimed.
The original application/v0.51.0 performance concern remains unresolved.

Only this new ignored review directory was written. No product/task edits, agents,
commits/publishing, workspace dependency/lock changes or user-work restoration.
All starting product/unrelated-source hashes and **2,431** earlier review/follow-up
evidence files remain unchanged. Final audit records **zero active relevant jobs**;
no owned background jobs were started.

Evidence: `final-audit.json`, `node16-captures/*.json`, `packed-current-peer-results.json`
and all exact command JSON/logs in this directory. Coordinator can close FUSE-06
and the investigation, retaining the cancelled prototype dispositions and withdrawal.
