# Test-layer boundary gate

`pnpm --filter @web-ts-toolkit/access-router test:layers:check` checks file selection
and the public dependency graph. Build the package first when running it alone:
declaration JSDoc examples and actual public entry files are build inputs. Default
`test`, `test:contracts`, `test:invariants`, and `test:internal` each build the existing
dependency closure **once**, check boundaries, then make **one** `vitest run` call.
An optional test-file argument filters that run, not the exhaustive preflight.

The checker uses installed Vitest's `createVitest` / `globTestSpecifications` API,
sequentially, closing every context. Discovery does not execute tests or setup.
It compares the default discovery against every `*.test.ts` in the package and
against the disjoint, nonempty layer union. Configuration shares settings without
merging include arrays. Node, serial files, the original 30-second timeout, and
`test/global-setup.ts` are enforced; missing selections fail.

## Public graph

TypeScript parses imports (including type imports/import types), re-exports,
`import = require`, literal dynamic imports, common require aliases and configured
setup closures. Traversal stops at the three actual `dist/{index,advanced,processors}`
runtime/declaration entries or their exact public package names. Source aliases,
private chunks/deep paths, private fixtures, lower-layer tests and unresolvable
local edges fail with a file/line or a transitive dependency chain. Configured Vite
aliases and TypeScript path aliases cannot disguise a source import. Third-party
dependencies, including the package's other workspace dependencies, are outside
this access-router boundary.

Only `test/setup.ts` and `test/global-setup.ts` are stable public root fixtures.
`test/access-router-crud-fixture.ts` and the dormant legacy compiler fixture in
private support are **not** exceptions.

## Consumer modules and reviews

`test-layer-consumers.mjs` lists the 25 active filesystem-fed consumer inputs and
document sources. Ordinary imported public helpers are traversed automatically.
Literal source at `writeFileSync` sinks, source variables and joined source arrays
are parsed as **modules**; arbitrary expected-message/prose strings are not treated
as imports. Public fixture file lists and finite `for…of` input paths are followed.
Unresolved module expressions, source producers and filesystem reads fail closed.
Compiler `files`/`include` literals cannot name private inputs.

Complex pre-existing document generators have entry-scoped reviews keyed by exact
file, line and expression, with a reason. The document inventory audits actual
TS/JS fences (only marked website fences) and declaration JSDoc examples. Three
collection recipe filenames resolve only to the uniquely marked, exact MIGRATION
partial bodies; those bodies are parsed too. This is not a computed-import waiver.
The packed consumer's other literal emitted modules share an audited virtual graph.
Publication hash/byte/declaration **inspection** is distinct from executable source:
an inspection-only review cannot be reused as a source producer. Stale review
locations fail; update inventories and regression cases when changing a generator.

Only three negative-encapsulation sites bypass ordinary import rejection:

- The single unused `PrivateDeepImport` type alias in the public service consumer
  fixture, immediately paired with its exact `@ts-expect-error` directive. An import
  binding or use of the alias is forbidden. The existing consumer compiles verify
  the expected error really occurs.
- Two sites inside the emitted `private-exports.cjs`: exact finite subpath tables,
  with `assert.throws(() => require.resolve(prefix + subpath),
{ code: 'ERR_PACKAGE_PATH_NOT_EXPORTED' })`. Changing to `require`, changing the
  table, capturing an export, or changing the failure assertion is rejected.

Missing names imported from an otherwise public entry remain normal negative
consumer type contracts, not private-module exceptions.

## Limits and mandatory review

This is a maintainable guard, **not proof of semantic independence or a sandbox**.
Common `vi.mock`/`doMock`/`importMock`, imported namespace/prototype patches, acquired
service patches, and known internal-method spies are rejected. Consumer Mongoose
models/native types, application hooks/spies, supported service defaults and output
data mutation remain legitimate. A method's callable public status does **not**
authorize spying on its use as an implementation override seam.

The checker does not execute generators or attempt general interprocedural/taint
analysis. Manual review remains necessary for reflection, destructured/custom
loader/mock aliases, methods reached through arbitrary object/closure dataflow,
novel filesystem/process/compiler APIs, runtime-computed paths, and transformations
inside reviewed document-generator pipelines. Review the producing bindings and
compiler/runtime file lists when editing those pipelines; do not merely add an
expression exemption. No whole-contract hash allowlist freezes test implementations.

`test/internal/test-layer-boundaries.unit.test.ts` exercises the guard using fresh,
Git-confirmed ignored fixture roots with repo-local `TMPDIR`. All layers remain
required for final compatibility acceptance; this check cannot replace actual
installed positive/negative compiles or full test runs.
