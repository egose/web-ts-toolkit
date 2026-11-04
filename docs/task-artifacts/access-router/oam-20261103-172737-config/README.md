# OAM-02: four-option configuration handoff

## Outcome and scope

**OAM-02 configuration implementation and focused verification passed.**
IMPLEMENT-02, 2026-11-03, working tree based on `c68451e`. The coordinator alone
owns [the task file](../../../tasks/20261103-172737-access-router-output-authorization-modes.md);
it was not edited. The accepted [OAM-01 design](../oam-20261103-172737-design/README.md)
and its scratch work were left unchanged. No agents, commits, publication,
dependency changes, or overlapping build/test commands were used.

Exactly `readAuthorizationMode`, `listAuthorizationMode`,
`createAuthorizationMode`, and `updateAuthorizationMode` now share the optional
`AuthorizationMode = 'isolated' | 'trusted'` server model/default-model contract.
All default to isolated; model undefined restores live inheritance, and default
undefined restores built-in isolation. No alternate option spellings were added.

**CREATE/UPDATE trusted execution is intentionally not enabled in this delivery.**
Their primitives are captured for OAM-03, but the current query-only selector,
input executions, document stages, and write workers were not changed. New option
JSDoc describes the approved output-only contract, not evidence that OAM-03's
detachment/output-child work is implemented.

## Changed files

Runtime/types, relative to `packages/access-router/`:

- `src/interfaces/root.ts`: optional CREATE/UPDATE options and focused scope JSDoc.
- `src/acl/authorization-modes.ts`: four-key admission and explicit operation mapping.
- `src/acl/model-output-planning.ts`: capture all four primitives before catalog/native callbacks.
- `src/acl/service-authorization.ts`: captured configuration type only; no eligibility changes.
- `src/runtime.ts`: isolated defaults, shared restoration handling, four-operation warning metadata.

Maintained tests/types, relative to `packages/access-router/`:

- `test/owned-authorization-modes.unit.test.ts`
- `test/authorization-fast-path-options.unit.test.ts`
- `test/authorization-fast-path-options.integration.test.ts`
- `test/default-model-options.integration.test.ts`
- `test/service-authorization-mutations.integration.test.ts`
- `test/authorization-fast-path-consumer.types.fixture.ts`

Decorator changes, relative to `packages/access-router-deco/`:

- `src/authorization-modes.ts`
- `test/owned-authorization-modes.test.ts`
- `test/default-model-options.test.ts`
- `test/hydration-consumer.types.fixture.ts`

This README is the only additional handoff file. Generated `dist` was rebuilt,
inspected, and remains ignored.

## Verification actually run

All commands ran **serially from repository root**. Node `v26.12.1`, pnpm
`11.18.0`, Vitest `4.1.11`; installed dependencies and MongoDB memory-server
prerequisites were available. No install was run.

Fresh scratch: `_tmp-oam02-config-20261103-192841`, created with `mkdir` and
confirmed ignored with `git check-ignore`. Every build/test/type/lint/format command
used `TMPDIR` set to that directory's absolute checkout path, including consumers
and database tests that use `os.tmpdir()`.

The following command bodies were executed with that inline `TMPDIR` prefix:

```sh
pnpm --workspace-concurrency=1 --filter @web-ts-toolkit/access-router... build
pnpm --workspace-concurrency=1 --filter @web-ts-toolkit/access-router-deco... build
pnpm --filter @web-ts-toolkit/access-router exec tsc --noEmit -p tsconfig.typecheck.json
pnpm --filter @web-ts-toolkit/access-router-deco exec tsc --noEmit -p tsconfig.typecheck.json
```

Both transitive builds and both source typechecks passed. The builds were separate
steps, with focused runtime checks between them, not concurrent invocations.

### Runtime V1

```sh
pnpm --filter @web-ts-toolkit/access-router exec vitest run --config vitest.config.ts \
  test/owned-authorization-modes.unit.test.ts \
  test/owned-authorization-modes.integration.test.ts \
  test/authorization-fast-path-options.unit.test.ts \
  test/authorization-fast-path-options.integration.test.ts \
  test/default-model-options.unit.test.ts \
  test/default-model-options.integration.test.ts \
  test/query-snapshot-options.unit.test.ts \
  test/query-snapshot-options.integration.test.ts \
  test/read-snapshot-checks.integration.test.ts \
  test/list-snapshot-checks.integration.test.ts \
  test/service-authorization-mutations.integration.test.ts \
  test/document-permissions-dependencies.integration.test.ts
```

**Final result: 12 files / 441 tests passed.** The first run had 440 passes and
one failure: the default-model HTTP fixture looped over the expanded key list but
still configured only two modes. Added explicit CREATE/UPDATE setup and expected
eight operation-specific warnings; the entire same selection then passed again.
This was an observed intermediate failure, not an asserted baseline issue.

```sh
pnpm --filter @web-ts-toolkit/access-router-deco exec vitest run --config vitest.config.ts \
  --no-file-parallelism test/owned-authorization-modes.test.ts \
  test/default-model-options.test.ts test/bootstrap-transaction.test.ts test/property-contracts.test.ts
```

**Result: 4 files / 181 tests passed.** Covers four-key property/raw configuration,
default/model/router composition, complete preflight before globals/warnings,
getter/proxy rejection, namespace placement, business fields and permission strings.

Runtime coverage also retains real READ/LIST source/view/native mutation behavior,
READ-to-LIST retry, await capture, independent hook reentry, logger reentry/failure,
owning-runtime separation, atomic mixed bulk failures, undefined restoration, retired
switch rejection, and HTTP/root/include/populate/subquery/helper/default admission.
New CREATE/UPDATE/UPSERT capture tests inspect both stored primitives across awaits
and fresh calls while requiring input root executions to stay isolated. Generic
read-shaped write tuples remain isolated even with all four options trusted.
Existing create/update input-grant tests now also run with all four options trusted.

### Focused declarations/consumers

```sh
pnpm --filter @web-ts-toolkit/access-router exec vitest run --config vitest.config.ts \
  test/strict-consumer-types.test.ts -t 'checks installed modes'
pnpm --filter @web-ts-toolkit/access-router-deco exec vitest run --config vitest.config.ts \
  --no-file-parallelism test/strict-consumer-types.test.ts \
  -t 'compiles configuration and retired-option assertions'
```

- Runtime package: **5 passed, 44 skipped by the requested name filter**;
  Bundler, NodeNext ESM/CJS, and Node16 ESM/CJS staged declaration consumers.
- Decorator package: **2 passed, 3 skipped by the requested name filter**;
  NodeNext and Bundler staged consumers.
- Inspected fresh `dist/index.d.ts`, `index.d.mts`, `advanced.d.ts`,
  `advanced.d.mts`, and their matching shared declaration chunks. Both entrypoints
  expose `AuthorizationMode`, model/default/extended options, and all four optional
  properties with the exact shared union; new option JSDoc survives emission.
  Type fixtures exercise model/default/fluent setters and reject malformed values,
  global placement, method defaults and per-call write selectors.

Vitest invocations additionally used `--reporter=default --reporter=json` and
`--outputFile.json=../../_tmp-oam02-config-20261103-192841/<report>.json`.
Reports: `access-router-v1.json` (intermediate failure),
`access-router-v1-rerun.json`, `access-router-deco-v1.json`,
`access-router-focused-types.json`, and `access-router-deco-focused-types.json`.
These are historical disposable scratch outputs, not required continuation inputs.
The Vite CommonJS-config/ESM-syntax warning was non-fatal on these runs.

### Final hygiene

- `pnpm exec prettier --check` and `pnpm exec eslint` on the 15 changed TypeScript
  files passed. Prettier initially identified five test files; its suggested
  formatting was applied using patch, then the complete changed-file check passed.
- Reviewed the source diff and scratch inventory. Scratch contains only generated
  reports/formatter candidates and a Node compilation cache; none is durable input.
- Handoff formatting, relative links, ignore status, targeted local-path/private-ID
  review, and tracked/untracked whitespace checks passed.

## Remaining work and limitations

No unresolved OAM-02 blocker was observed. This is a configuration handoff, not
complete four-operation runtime feature acceptance or an independent security review.

- **OAM-03:** implement authenticated output-child derivation, captured UPSERT branch
  selection, mandatory bounded post-write detachment, conversion failure handling,
  embedded/target ownership and real trusted hook-view omission per the accepted design.
  Do not turn the original input execution trusted. Preserve the new capture tests
  and the generic-origin negative tests.
- **OAM-04:** broader README/MIGRATION/website/fixture/tooling alignment, packed
  consumers and full V2 package/benchmark checks. The focused staged-consumer runs
  here are not `npm pack` or full package-suite verification.
- **OAM-05:** final independent acceptance review and V2/V3 integration checks.

Full package suites, packed compatibility, benchmarks, repository-wide build/test/lint,
and performance timings were **not run**. Raw reports, generated declarations,
consumer/dependency trees and caches are intentionally omitted from this curated
summary; it is not a self-contained reproduction bundle.
