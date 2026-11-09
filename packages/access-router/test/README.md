# Testing access-router

Public contracts are an early compatibility gate for internal refactors, not a
guarantee about every possible consumer. Invariants and internal tests remain
required for final acceptance. Unit versus integration describes test style;
**layer describes the obligation and its dependencies**, not the filename suffix.

## Choose a layer

Every runnable `*.test.ts` belongs in exactly one directory:

| Directory     | What belongs here                                                                                                                                                    | Examples                                                                                                                                                                                                                    |
| ------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `contracts/`  | Stable supported consumer behavior: exports/types, configuration, acquired services, hooks, responses/errors, authorization denial, ownership and documented bounds. | [Direct service authorization](contracts/service-authorization-direct.integration.test.ts), [processors](contracts/processors-path-hardening.test.ts), [installed consumer types](contracts/strict-consumer-types.test.ts). |
| `invariants/` | Internal safety: authority/receiver isolation, publication lifetime, draining, resource accounting and concurrency safeguards. Private imports are allowed.          | [Document authorization validation](invariants/document-authorization-validation.unit.test.ts), [write modes](invariants/write-output-modes.unit.test.ts).                                                                  |
| `internal/`   | Helper algorithms, cache/representation/preparation shape, exact work counts, implementation scheduling and test/benchmark tooling. Private imports are allowed.     | [Metadata completion](internal/model-output-metadata.unit.test.ts), [layer guard regressions](internal/test-layer-boundaries.unit.test.ts).                                                                                 |

Classify assertions and the entire fixture closure, not just imports or labels:

- [Field-helper removal](internal/field-helper-removal.contract.test.ts) retains
  its historical `.contract` suffix **below contracts**: it spies on package
  `genAllowedFields`/registry lookup dispatch. [Boundary admission](invariants/service-authorization-boundary-admission.contract.test.ts)
  constructs private authority despite its suffix. Neither becomes public by
  importing built output.
- [Child policy integration](invariants/service-authorization-subdocument-policies.integration.test.ts)
  stays in invariants because it spies on package `findRawParentDoc`. Calling a
  supported method is different from promising that another method dispatches
  through it. A callable method is not automatically a supported override seam.
- A **private helper can implement a public contract**. Public metadata values,
  aliases and wire omissions are checked through acquired services/HTTP in
  [metadata/wire contracts](contracts/arts04-metadata-wire.integration.test.ts);
  its completion helper's promise identity and reread choreography stay internal.
  Likewise public `pickAllowedFields` behavior is a contract; private stage or
  singleton identity is not.
- Keep mixed originals whole below contracts when setup/observations are coupled;
  add a focused public companion for a demonstrated gap. Split only with a
  reviewable assertion/setup mapping. Do not lose parameter rows, expected values,
  negative cases or cleanup. Safety assertions remain mandatory in every layer.

At the test-separation checkpoint there are **103 contract files** (97 migrated
originals plus six files with 93 new public cases), **64 invariant files** and
**51 internal files** (including the new guard file). These are inventory facts,
not full-run results or preservation proof; use discovery and actual results as
the suite evolves. The [migration reconciliation](../../../docs/task-artifacts/access-router/20261108-094712-test-contract-separation/arts-05-reconciliation.md)
records evidence and the pending final acceptance separately.

## Public fixtures and the boundary

- Put reusable contract fixtures/consumer inputs in `support/public/`. The only
  root support exceptions are [setup.ts](setup.ts) (real Mongo lifecycle) and
  [global-setup.ts](global-setup.ts) (configured default-runtime OpenAPI cleanup).
  Both are part of the audited graph, not a private-import exemption.
- Import access-router only through its three published entries:
  `@web-ts-toolkit/access-router`, `@web-ts-toolkit/access-router/advanced`, and
  `@web-ts-toolkit/access-router/processors`. In-repo execution may use the actual
  corresponding `dist/index`, `dist/advanced`, or `dist/processors` entry files
  (`.js`, `.mjs`, `.d.ts`, `.d.mts`); see the [export map](../package.json).
  Stop traversal at those entries: their legitimate implementation dependencies
  are not test-boundary violations. Installed-consumer tests must still resolve
  real package names, not source aliases.
- Acquire real services through supported runtimes/routers and initialized
  requests: `req.macl.getService(...)`, `req.macl.getPublicService(...)`, or
  `req.dacl.getService(...)`. See the migrated
  [authorization fixture](support/public/service-authorization-fixture.ts) and
  [public model/data probe fixture](support/public/arts04-fixture.ts). Their custom
  routes run after real middleware; failures are rethrown outside Express so
  assertions are not swallowed. Never fabricate Core/Permission/service ownership,
  stages, capabilities or private budgets to build a contract fixture.
- Express, Mongoose, Supertest, consumer-owned models/schema/validators, application
  hooks/loggers and spies on those external boundaries are legitimate. Retain real
  Mongo coverage; do not mock the package's service result to replace integration.
  No private source/deep/chunk imports, private fixtures, lower-layer tests,
  source aliases, package mocks or package-method/prototype patches in contracts.
- [The stable CRUD benchmark fixture](access-router-crud-fixture.ts) is **private**,
  despite its root path. [The dormant legacy type fixture](support/private/service-authorization.types.fixture.ts)
  is also private, uncompiled and not passing consumer evidence; its stale header
  does not authorize using or repairing it. Neither may enter public support.
- Generated modules, filesystem-loaded sources, compiler file lists and extracted
  docs/JSDoc examples count as dependencies too. Review producers and runtime/
  compiler inputs, not only top-level imports. Keep the finite inventories in
  [test-layer-consumers.mjs](../scripts/test-layer-consumers.mjs) and their
  regression cases synchronized when changing generators.
- Encapsulation exceptions are **exact, failure-only checks**, never usable private
  imports: one unused `PrivateDeepImport` type alias with its exact expected-error
  directive, and two emitted `private-exports.cjs` sites with finite tables and
  `assert.throws(() => require.resolve(...), { code: 'ERR_PACKAGE_PATH_NOT_EXPORTED' })`.
  Do not broaden them. Keep actual installed positive **and negative** compiles;
  source typecheck or static boundary checking cannot replace them.

The [maintained checker guide](../scripts/README.md#public-graph) explains import,
setup, generated-source and mock enforcement. Its [limits and mandatory review](../scripts/README.md#limits-and-mandatory-review)
include reflection, custom loaders/filesystem/compiler APIs and arbitrary
object/closure dataflow. A passing static guard is not a sandbox or semantic proof.

## Prerequisites and safe execution

Run commands from repository root, with Node **>=24**, the repository's pnpm/tool
versions ([pins](../../../.tool-versions)), and installed workspace dependencies.
Create a fresh ignored repo-local scratch directory for each run; `$PWD` below is
the checkout root and supplies the absolute `TMPDIR` used by `os.tmpdir()`:

```sh
scratch=$(mktemp -d "$PWD/_tmp-access-router-tests-XXXXXXXX")
git check-ignore "$scratch"
export TMPDIR="$scratch"
pnpm install
```

Confirm ignore status before proceeding. Ignored does not mean excluded from
lint/build tools; scope commands explicitly. Keep useful evidence according to
[artifact conventions](../../../docs/task-artifacts/README.md), not whole consumer
trees. Shared reports use repo-relative paths or quoted `'<repo-root>'`
placeholders, replaced before execution; never copy local paths or private session IDs.

Runtime prerequisites are substantive, not reasons to skip tests:

- Mongo integration needs a runnable MongoDB binary for `mongodb-memory-server`
  and its platform runtime libraries, available through its normal cache/download
  setup. The shared Mongo helper owns connection/database cleanup.
- [Packed consumers](contracts/packed-consumer-compatibility.test.ts) run real
  `pnpm install` in temporary trees, requiring registry access or a complete local
  cache, tooling and peers. They exercise exact minimum Express **5.0.0**/Mongoose
  **8.0.0** and current peers, transformed tarballs and a bounded artifact tree.
- The same fixture requires an **already built, read-only CLI fixture**: the first
  available package with all declared bin files among `access-router-runtime`,
  `create-access-router-mongo-starter`, and `express-runtime` (under `packages/`).
  This is not a test/build of those CLIs. If none exists, report the prerequisite
  blocker and seek authorization; do not launch an unrelated CLI or release build.
- Strict/packed consumers retain real Bundler/NodeNext/Node16 positive and negative
  checks. Minimum-peer library-check policy is deliberately distinct from the
  current-peer/dedicated strict `skipLibCheck: false` checks; do not relax either
  to make a refactor pass.

**Serialize builds and test commands in one checkout.** They replace shared
transitive `dist/` outputs; never run different layer commands concurrently or
alongside another workspace build/test. Shared settings retain Node,
`fileParallelism: false`, the 30-second test timeout and global cleanup; do not
increase timeouts or suppress failures to hide regressions. Existing grouped CI
read/build overrides remain relevant, but root/grouped/downstream tests and new
performance campaigns are not part of this package workflow.

## Commands

These scripts are defined in [package.json](../package.json):

| Repo-root command                                               | Behavior                                                                                                       |
| --------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------- |
| `pnpm --filter @web-ts-toolkit/access-router test:contracts`    | Build the filtered dependency closure once, exhaustive layer/dependency preflight, one contracts Vitest run.   |
| `pnpm --filter @web-ts-toolkit/access-router test:invariants`   | Same build/preflight, one invariants run.                                                                      |
| `pnpm --filter @web-ts-toolkit/access-router test:internal`     | Same build/preflight, one internal run.                                                                        |
| `pnpm --filter @web-ts-toolkit/access-router test`              | Build once, preflight, **one exhaustive Vitest run of all layers once**; not three chained layer runs.         |
| `pnpm --filter @web-ts-toolkit/access-router test:layers:check` | Discovery/dependency check only; no tests or setup execute. Requires built entries/declaration examples first. |
| `pnpm --filter @web-ts-toolkit/access-router typecheck`         | Filtered closure build, then source-only TypeScript check; not installed-consumer verification.                |

Standalone checker preparation (no root-wide build):

```sh
pnpm --filter @web-ts-toolkit/access-router... build
pnpm --filter @web-ts-toolkit/access-router test:layers:check
```

For a focused run, pass package-relative file paths, for example:

```sh
pnpm --filter @web-ts-toolkit/access-router test:contracts test/contracts/service-authorization-direct.integration.test.ts
```

File selectors filter **only that runtime run**, not the exhaustive preflight.
Default discovery must equal the disjoint nonempty layer union; orphan/support
tests, overlaps and missing suites fail closed. A focused pass is not a layer pass.

## Refactoring workflow

1. Establish the affected supported behavior and run relevant public contracts as
   an early gate. Keep those public tests **unchanged** during a private refactor;
   do not rewrite expectations or move a failing contract lower for convenience.
2. Investigate invariant failures as potential safety/security regressions, even
   when contracts pass. Adapt lower-layer tests only with an explicit rationale
   mapping old assertions to preserved obligations. Security/authorization changes
   need appropriate review; never automatically accept, weaken or delete a failure.
   Internal helper names/counters/scheduling may change, but important safety checks
   in internal files must survive too.
3. An intentional supported-contract change needs explicit approval and coordinated
   tests, docs and release communication. It is a separate decision, not an incidental
   contract-test rewrite disguised as internal cleanup.
4. Review public fixture closure, generated inputs and negative consumer diagnostics.
   Keep semantic public type checks. Generated private declaration chunk names/bytes
   are **not permanent public promises**: same-build publication integrity and the
   test-separation migration's one-off complete declaration byte comparison serve
   different purposes.
5. For final package acceptance, run these **sequentially**, after the prerequisites
   above (record actual selections/results, failures and unrun checks):

   ```sh
   pnpm --filter @web-ts-toolkit/access-router typecheck
   pnpm --filter @web-ts-toolkit/access-router test:contracts
   pnpm --filter @web-ts-toolkit/access-router test:invariants
   pnpm --filter @web-ts-toolkit/access-router test:internal
   pnpm --filter @web-ts-toolkit/access-router test
   pnpm exec eslint packages/access-router/src packages/access-router/test packages/access-router/scripts packages/access-router/vitest*.ts
   ```

All layers are final gates; counts alone cannot show assertion preservation.
Bounded contracts cannot prove universal compatibility, and this separation makes
no runtime-speed claim. The migration's independent V3 review remains tracked in
[ARTS-06](../../../docs/tasks/20261108-094712-access-router-test-contract-separation.md#task-arts-06-independently-accept-the-separation-and-full-compatibility-gate).
