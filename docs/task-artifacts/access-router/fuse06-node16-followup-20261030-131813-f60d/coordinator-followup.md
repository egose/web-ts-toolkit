> Historical document preserved from ignored task scratch storage.
> Scope and limitations: `docs/task-artifacts/access-router/README.md`. References to omitted
> artifacts are historical, not available execution prerequisites.

# FUSE-06 Node16 coverage follow-up

Applied **exactly two added lines** in
`packages/access-router/test/packed-consumer-compatibility.test.ts`, the fixed
`tsconfig.node16.json.files` list:

```text
output-publication-fusion-withdrawal.types.fixture.mts
output-publication-fusion-withdrawal.types.fixture.cts
```

No runtime/API/docs/workload/other test changes, task/status edits, agents, commits,
workspace dependency/lock changes or restoration of user work. The original four
Node16 files and all other contents of the changed test remain untouched.

## Verification (repo root; foreground and serial)

```sh
pnpm --filter @web-ts-toolkit/access-router exec vitest run --config vitest.config.ts --no-file-parallelism --maxWorkers=1 --reporter=default --reporter=json --outputFile.json=../../_tmp-fuse06-node16-followup-20261030-131813-f60d/packed-node16-results.json test/packed-consumer-compatibility.test.ts -t 'supports current majors from release-artifact tarballs|supports minimum peers from release-artifact tarballs'
pnpm exec eslint packages/access-router/test/packed-consumer-compatibility.test.ts
pnpm exec prettier --check packages/access-router/test/packed-consumer-compatibility.test.ts
git diff --check
```

- **2 tests passed / 1 file; 8 deliberately unselected**. Exact selected names:
  - `supports minimum peers from release-artifact tarballs across ESM, CJS, NodeNext, and Bundler consumers`
  - `supports current majors from release-artifact tarballs across ESM, CJS, NodeNext, and Bundler consumers`
- Scoped ESLint, Prettier and diff checks passed.
- Both actual `pnpm exec tsc -p tsconfig.node16.json` invocations exited **0**.
  Evidence-only Node preload observed configs/exit codes without changing child
  arguments, outputs, returns or errors. Both actual generated configs have six
  files, including the two added fixture files, with `module` and
  `moduleResolution` both `Node16`. Minimum peers use `skipLibCheck: true`;
  current majors use **false**.
- Both generated `.mts`/`.cts` copies in both consumers exactly match the original
  withdrawal fixture SHA-256:
  `464cf4473faec09239d0893a75db89c5ca02596cd111a1a74e8917bd68cb6f74`.
- No build needed: all **137 runtime source files and 14 dist files** match official
  before both before and after the tests, preserving the original eight flags.
  ESM remains `ae83ba6dd6a6fd50a338096bea46cac0fab610256ffa5745b40596b430e472ca`;
  lock remains `ef86ef24726d09f81d1262656920d6215caeb0f26e345198db2d27b8ab7ab314`.
- **6,979 earlier evidence files** hash-verified unchanged; every unrelated
  starting changed/untracked file remains unchanged. All jobs finished; final
  active relevant process list is empty.

New ignored evidence only: `packed-node16.log`, command/result JSON, scoped check
logs/JSON, `node16-captures/*.json`, `start-test.ts`, `start.json`, `finish.json`.
No older output was overwritten. Coordinator/reviewer owns independent
reverification and task completion; this is only the requested follow-up patch.
