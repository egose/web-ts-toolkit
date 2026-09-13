# Access Router Correlated Includes

Created: 2026-09-12 18:18:41 PDT

Packages: `packages/access-router` and `packages/access-router-client`.

## Objective

Add correlated includes to `access-router` and a matching service-based composition API to `access-router-client`. A correlated include executes a target query using values from its immediate parent document.

Consumers should reuse familiar service methods and explicitly reference parent fields:

```ts
import { parentField } from '@web-ts-toolkit/access-router-client';

await userService.readAdvanced(userId, {
  include: [
    orgService
      .readAdvanced(parentField('orgId'), {
        select: ['name', 'description'],
      })
      .$include('org'),

    postService
      .listAdvanced(
        {
          authorId: parentField('_id'),
          reviewerId: parentField('managerId'),
          title: '$special',
        },
        {
          select: ['title'],
          sort: { createdAt: -1 },
          limit: 5,
        },
      )
      .$include('posts'),

    postService.countAdvanced({ authorId: parentField('_id') }).$include('postCount'),
  ],
});
```

These are proposed APIs, not existing functionality. The string `'$special'` must retain its existing literal query meaning in this field-value position.

## Scope And Agreed Contract

Update both packages, their published documentation, relevant website documentation, and release notes. This document is the requested deliverable; implementation tasks remain pending.

Support these seven client methods:

| Method               | Reference/filter location        | Include operation |
| -------------------- | -------------------------------- | ----------------- |
| `read`               | Identifier argument              | `read`            |
| `readAdvanced`       | Identifier argument              | `read`            |
| `readAdvancedFilter` | Existing filter argument         | `read`            |
| `list`               | Supplemental `$include()` filter | `list`            |
| `listAdvanced`       | Existing filter argument         | `list`            |
| `count`              | Supplemental `$include()` filter | `count`           |
| `countAdvanced`      | Existing filter argument         | `count`           |

Basic-method examples:

```ts
postService.list({ limit: 5 }).$include('posts', {
  filter: { authorId: parentField('_id') },
});

postService.count().$include('postCount', {
  filter: { authorId: parentField('_id') },
});
```

Additional read examples:

```ts
orgService.read(parentField('orgId')).$include('org');

orgService.readAdvancedFilter({ _id: parentField('orgId'), active: true }, { select: ['name'] }).$include('org');
```

Requirements common to all methods:

- `$include(path)` requires an explicit output path.
- The originating method determines the operation; do not add an operation override or derive counts from list requests.
- Conversion is synchronous and performs no inner HTTP request.
- Parent references use explicit structural markers, not magic `$field` strings.
- References resolve against the immediate parent document.
- Multiple references and supported logical operators preserve their meaning.
- Identifier reads preserve the target's configured identifier behavior rather than always translating identifiers to `_id` filters.
- Correlated list pagination applies per parent.
- Count uses count semantics rather than counting a paginated list.
- Legacy `localField`/`foreignField` includes retain their existing behavior.
- Advanced methods use their existing filter argument; the supplemental filter is for basic `list()` and `count()` only.

### Non-goals

- A general aggregation-expression language.
- Data-service or mutation includes.
- Automatic relationship inference from model names.
- Replacing existing lazy-request execution or grouping architecture.
- Optimizing every correlated query into a batched database operation.

## Analysis Coverage And Baseline

Inspected server include types, validation, execution, identifier resolution, authorization tests, and request-complexity helpers. Inspected client method signatures, request metadata, lazy execution, filter types, defaults, grouping integration fixtures, exports, and package scripts. Inspected relevant existing tasks for overlapping objectives.

Evidence anchors, relative to the repository root:

- `packages/access-router/src/interfaces/query-types.ts` — existing `Include`.
- `packages/access-router/src/validation/common.ts` — `includeItemSchema` and `includeSchema`.
- `packages/access-router/src/validation/root-router.ts` — shared include schema in root model arguments.
- `packages/access-router/src/services/base.ts` — `processInclude`, `includeDocsRead`, `includeDocsList`, `includeDocsCount`, and target authorization.
- `packages/access-router/src/services/service.ts` — `find`, `findOne`, `count`, and `countByFieldValues`.
- `packages/access-router/src/core-shared.ts` — `resolveIdentifierFilter` and denial-preserving `resolveAccessFilter`.
- `packages/access-router/src/request-complexity.ts` — structural budgets.
- `packages/access-router/src/helpers/concurrency.ts` — existing scheduler helpers.
- `packages/access-router/test/cross-resource-authorization.integration.test.ts` — operation-specific include guards, projections, counts, and override rejection.
- `packages/access-router-client/src/services/model-service.ts` — seven method implementations and metadata.
- `packages/access-router-client/src/services/request.ts` — `makeRequest`.
- `packages/access-router-client/src/lazy-promise.ts` — execution claims.
- `packages/access-router-client/src/mongoose/types.ts` — typed filter operands.
- `packages/access-router-client/src/types.ts` — `Include`, `ModelRequest`, and query metadata.
- `packages/access-router-client/src/helpers.ts` — `replaceSubQuery`.
- `packages/access-router-client/test/access-router-client.protocol-parity.integration.test.ts` — real-server direct/grouped protocol matrix.

Related task documents:

- [Access Router Post-Remediation Review](20260820-164011-access-router-post-remediation-review.md): legacy include authorization, cardinality, and override handling.
- [Access Router Health Follow-Up](20260905-105547-access-router-health-follow-up.md): denial preservation and runtime isolation.
- [Access Router Client Boundary Review](20260906-225058-access-router-client-boundary-review.md): client metadata, grouping, defaults, and type boundaries.

No existing task matching `parentField`, `$include()`, or correlated includes was found in the searched backlog. This is a new feature objective; retain historical remediation evidence and existing regression coverage.

Baseline at task creation:

- `git status --short`: clean before adding this document.
- Builds, tests, lint, and packed-consumer checks: **not run** during task preparation; source evidence was sufficient to define the work.
- This is focused feature planning, not a comprehensive package review or a measured performance baseline.

## Priorities And Execution Rules

- P1: required feature behavior or a prerequisite for correct implementation.
- P2: documentation and release-readiness work; still required before completion.

All tasks start `pending`. Complete dependencies before beginning dependent work. Keep tests with their implementation tasks.

After ACI-01, server ACI-02/ACI-03 and client ACI-04 have separate primary ownership. Sequence ACI-02 before ACI-03, then integrate both packages in ACI-05. ACI-06 owns coordinated public documentation and release notes after behavior is verified. Do not race on shared exports, fixtures, or this document.

Run builds and tests serially. Package test scripts rebuild shared transitive dependencies; concurrent package invocations can race on `dist/`. Do not hand-edit generated output. Preserve unrelated worktree changes found when implementation begins.

## Shared Verification

Prerequisites: repository-supported Node and pnpm versions (both target packages declare Node >=22), workspace dependencies installed with `pnpm install`, and MongoDB memory-server prerequisites required by existing integration tests. Record environment blockers rather than silently omitting coverage.

### V1 — Focused Checks

Build the affected package and transitive dependencies, then run actual changed test files:

```sh
pnpm --filter @web-ts-toolkit/access-router... build
pnpm --filter @web-ts-toolkit/access-router exec vitest run --config vitest.config.ts test/<actual-file>.test.ts
```

```sh
pnpm --filter @web-ts-toolkit/access-router-client... build
pnpm --filter @web-ts-toolkit/access-router-client exec vitest run --config ../../vitest.config.ts test/<actual-file>.test.ts
```

Replace placeholder filenames with real tests. Run commands serially. For cross-package integration, build the current server and client outputs before invoking focused tests that consume their package entrypoints.

### V2 — Package Checks

```sh
pnpm --filter @web-ts-toolkit/access-router typecheck
pnpm --filter @web-ts-toolkit/access-router test
pnpm --filter @web-ts-toolkit/access-router-client test
```

The client test script includes its typechecks and browser smoke configuration. The browser smoke uses built ESM through Vite/jsdom; it is not a real-browser engine matrix.

### V3 — Published Consumer Checks

Extend and run the existing export, documentation, strict-consumer, and packed-consumer tests through V1/V2, including:

- Server: `test/export-contract.test.ts`, `test/documentation-examples.test.ts`, `test/strict-consumer-types.test.ts`, and `test/packed-consumer-compatibility.test.ts`.
- Client: `test/access-router-client.exports.unit.test.ts`, `test/access-router-client.docs.compile.test.ts`, `test/access-router-client.packed-consumer.test.ts`, and its declaration-consumer typecheck fixtures.

Inspect emitted declarations and actual packed contents. Use the existing publication transformation rather than a substitute manifest. Verify NodeNext, Bundler, CJS/ESM, and the client's existing browser smoke coverage. Follow the workspace `ai-friendly-ts-package` skill when changing the published surface.

### V4 — Final Integration

```sh
pnpm build
pnpm test
pnpm lint
git diff --check
```

Run serially. Record unrelated baseline failures separately from regressions. Do not claim completion when required verification is blocked.

## Executable Tasks

### Task ACI-01: Finalize The Correlated Include Protocol

Status: completed

Kind: investigation

Priority: P1 — both packages require one unambiguous contract.

Dependencies: none

Primary ownership: this task document and focused contract/type prototypes.

Finding: existing server `Include` requires one `localField`/`foreignField` relationship. Client methods already record operation, identifier/filter, args, and options. The richer protocol and several boundary policies remain unspecified.

References: server `src/interfaces/query-types.ts` (`Include`), `src/core-shared.ts` (`resolveIdentifierFilter`); client `src/types.ts` (`Include`, `RootModelQueryMeta`) and `src/services/model-service.ts` (query metadata).

Requirements:

1. Specify a discriminated correlated-include variant alongside legacy includes. A `mode: 'correlated'` discriminator is a candidate, not an already implemented contract. Include an explicit identifier-read versus filter-read representation.
2. Specify the serialized `parentField()` marker and a literal-object escape. `{ "$parent": "field" }` is a candidate marker; define exact recognition and escape behavior before implementation.
3. Resolve missing versus null references, array operands, supported operator positions, nested scope, no-match shapes, output-path collisions, and target-error behavior. Inspect current query normalization before promising MongoDB-style array equality or implicit membership.
4. Define source-field authorization and internal projection behavior, including a referenced field omitted from output selection versus a field forbidden by policy. Define whether references can observe prior include/decorate output or only a stable parent snapshot.
5. Specify reference-bearing descriptor behavior versus ordinary executable requests. A non-thenable object can still be passed to JavaScript `await`; promise only the execution restrictions actually enforceable by types and runtime checks.
6. Define supported args/options and handling of unsupported features such as `tasks`, transport configuration, callbacks, `tryList`, and `sq`. Distinguish explicitly supplied incompatible options from inherited service defaults. Define cross-adapter service composition: inner descriptors execute on the outer server and cannot silently honor a foreign transport.
7. Decide the initial output-typing contract and document any explicit result generic needed. Do not infer full target documents from partial projections or claim automatic parent-path validation without a parent type.
8. Specify request-wide work/concurrency bounds, expanded-value limits, and client/server compatibility behavior. Keep general aggregation expressions and speculative batching outside the initial feature.

Acceptance criteria:

- This document contains a complete wire schema and examples for all seven methods, including direct HTTP payloads.
- Scalar, array, literal-marker, missing-reference, identifier, and nested cases have explicit expected outcomes.
- Client descriptor lifetime and option-forwarding rules are stated precisely.
- No unresolved contract question blocks ACI-02 through ACI-04. If a maintainer decision is required, record the exact decision and owner and mark this task blocked.

Verification: evidence review against both packages' current signatures, identifier behavior, filter normalization, validation paths, and bounded strict-type prototypes where necessary. No production implementation is required to complete this investigation.

#### ACI-01 Contract Decision (normative for ACI-02 through ACI-04)

All numbered decisions below are resolved. No maintainer input is outstanding;
ACI-02, ACI-03, and ACI-04 may proceed. Decisions are owned by the ACI-01
investigator. Follow-up IDs (FU-\*) are deferred enhancements, not blockers.

Evidence basis (verified by reading, not by execution): server
`src/interfaces/query-types.ts` (`Include`), `src/validation/common.ts`
(`includeItemSchema`), `src/validation/model-router.ts`
(`listBodySchema`/`readByIdBodySchema`/`readFilterBodySchema`/`countBodySchema`),
`src/validation/root-router.ts` (root entries), `src/services/base.ts`
(`processInclude`, `includeDocsRead`/`includeDocsList`/`includeDocsCount`,
`getAuthorizedTargetService`, `sanitizeIncludeArgs`, `parseClientData`),
`src/services/service.ts` (`find`/`findOne`/`count`/`countByFieldValues`,
`genIDFilter`, forced `tryList: false` for read subqueries per ARF-01),
`src/core-shared.ts` (`resolveIdentifierFilter`, `normalizeFilter` `$and`-only
merging, no array normalization), `src/request-complexity.ts` (budgets:
`maxDepth` 8, `maxNodes` 500, `maxLogicalClauses` 50, `maxInValues` 100,
`maxBulkItems` 100, `maxIncludeCount` 10, `maxSubQueryCount` 10,
`maxBulkConcurrency` 10, `maxHookConcurrency` 10), `src/helpers/index.ts`
(`iterateQuery` single-pass `$$sq`/`$$date` handling),
`src/helpers/document.ts` (`setDocValue` overwrite semantics); client
`src/types.ts` (`Include`, `RootModelQueryMeta`, `ModelRequest`),
`src/services/model-service.ts` (seven method signatures, `__query` metadata,
direct paths `POST {basePath}/{queryPath}`, `POST
{basePath}/{queryPath}/__filter`, `POST {basePath}/count`),
`src/interface.ts` (args/options shapes), `src/lazy-promise.ts` (lazy,
single-execution, non-enumerable metadata claims), `src/mongoose/types.ts`
(documented server array-to-`$in` expansion, `LazyRequest` subquery values,
`$$sq` transport), `src/helpers.ts` (`replaceSubQuery`).

##### D1 — Discriminated wire variant (requirements 1, 2)

D1.1. The wire `Include` becomes a discriminated union. The correlated variant
requires the literal discriminator `mode: 'correlated'`. Legacy entries are
unchanged: `mode` absent (or equivalently `mode: 'legacy'`).

```ts
interface ParentRef {
  $parent: string; // dotted parent field path, e.g. '_id', 'orgId', 'a.b.c'
}

interface CorrelatedIncludeBase {
  mode: 'correlated';
  model: string; // target model name, resolved on the OUTER server
  op: 'list' | 'read' | 'count'; // fixed by the originating method; no override
  path: string; // explicit output path; always required
  args?: CorrelatedIncludeArgs; // allowlisted per D10; absent or `{}` otherwise
  options?: Record<string, never>; // reserved; absent or `{}`; non-empty is BadRequest
}

// Identifier read: exactly one of `id` / `filter` must be present.
interface CorrelatedReadByIdInclude extends CorrelatedIncludeBase {
  op: 'read';
  id: string | ParentRef; // raw id value; server applies target identifier behavior
  filter?: never;
}

interface CorrelatedReadByFilterInclude extends CorrelatedIncludeBase {
  op: 'read';
  filter: CorrelatedFilter; // at least one ParentRef expected; literals allowed
  id?: never;
}

interface CorrelatedListInclude extends CorrelatedIncludeBase {
  op: 'list';
  filter: CorrelatedFilter;
  id?: never;
}

interface CorrelatedCountInclude extends CorrelatedIncludeBase {
  op: 'count';
  filter: CorrelatedFilter;
  id?: never;
}
```

D1.2. `localField`/`foreignField` MUST be absent on correlated entries. An
entry carrying `mode: 'correlated'` together with `localField`/`foreignField`,
or a legacy-shaped entry carrying `$parent` markers, is `BadRequest` — never
silently reinterpreted as the other variant (closes the current
`processInclude` silent-drop behavior for the new variant; see D13.4).

D1.3. Seven-method wire mapping (originating method fixes `op`; no
operation override, no count-from-list derivation):

| Client method                             | Wire shape                                                                                          |
| ----------------------------------------- | --------------------------------------------------------------------------------------------------- |
| `read(id)`                                | `CorrelatedReadByIdInclude`, `id` = literal or marker, no `args`                                    |
| `readAdvanced(id, args)`                  | `CorrelatedReadByIdInclude`, `args` = `{select?, sort?, include?}`                                  |
| `readAdvancedFilter(filter, args)`        | `CorrelatedReadByFilterInclude`, `args` = `{select?, sort?, include?}`                              |
| `list(args)` + `$include(path, {filter})` | `CorrelatedListInclude`, `args` = pagination `{skip?, limit?, page?, pageSize?}` applied per parent |
| `listAdvanced(filter, args)`              | `CorrelatedListInclude`, `args` = `{select?, sort?, skip?, limit?, page?, pageSize?, include?}`     |
| `count()` + `$include(path, {filter})`    | `CorrelatedCountInclude`, no `args`                                                                 |
| `countAdvanced(filter)`                   | `CorrelatedCountInclude`, no `args`                                                                 |

D1.4. Basic-method call args describe the INNER query: `postService.list({ limit:
5 }).$include('posts', …)` means limit 5 per parent, not 5 outer rows.

##### D2 — Marker and literal escape (requirements 2, 3)

D2.1. Recognition is structural and value-position-only. A marker is a plain
object whose own enumerable keys are exactly `['$parent']` and whose value is a
non-empty string. `parentField(path)` validates `typeof path === 'string' &&
path.length > 0` and returns a frozen `{ $parent: path }`. Magic `$field`
strings are never markers: `'$special'`, `'$parent'`, or any other string in a
field-value position keeps its existing literal query meaning.

D2.2. Literal escape. `{ "$escape": { "$parent": "<field>" } }` — a plain
object whose own keys are exactly `['$escape']` and whose value is itself a
marker-shaped object — resolves to the literal object `{ "$parent": "<field>"
}` (matched literally against target data, never re-scanned). Recognition
order: test the `$escape` wrapper before the marker shape.

D2.3. Anything else containing a `$parent` key is `BadRequest`: extra keys
alongside `$parent`, non-string `$parent` values, empty-string paths, and
marker-shaped objects in forbidden positions (D3.2). `$parent` as an object
_key_ is never a marker.

D2.4. Reference paths allow dotted segments (`a.b.c`). Segments
`__proto__`, `prototype`, `constructor` are rejected (parity with the existing
request-complexity dangerous-key rule). Lookup uses own-property semantics;
inherited/prototype properties are never traversed.

##### D3 — Supported positions, substitution, and traversal boundaries (requirement 3)

D3.1. Markers are recognized in any filter _value_ position: bare field values
(`{ authorId: { $parent: '_id' } }`); inside field-operator objects (`$eq`,
`$ne`, `$gt`, `$gte`, `$lt`, `$lte`, `$in`, `$nin`, `$all`, `$regex`,
`$options`, and any other `$`-operator value); as elements of `$in`/`$nin`
arrays; recursively inside `$and`/`$or`/`$nor` clauses and `$elemMatch`
subtrees; and as the whole `id` argument of identifier reads. Multiple
references in one include are all resolved; logical structure is preserved
(post-substitution `$and`-merging per `normalizeFilter` keeps semantics).

D3.2. Boundaries (markers here are `BadRequest`, never silently ignored):
inside `$$sq` / `$$date` payload subtrees; as object keys; in root `$text` /
`$where` / `$comment` values (already blocked operators stay blocked); in
`populate.match`; in `sort`/`select` keys or values.

D3.3. Substitution is single-pass pure value replacement. Substituted parent
values are data: an object value carrying `$`-keys or a marker shape is NOT
re-scanned for operators or nested markers, and never becomes executable
filter syntax. No array splicing or flattening: a marker resolving to an array
occupies exactly one value position.

D3.4. Nested-include boundary: when resolving one include's template, the
resolver does NOT descend into nested `args.include` arrays. Nested correlated
includes resolve later, per parent execution, against the immediate parent
document (the target doc of the enclosing include). Markers therefore always
bind to the immediate parent (see nested example in D6.5).

##### D4 — Missing vs null, no-match shapes, arrays (requirement 3)

D4.1. A reference is _unresolvable_ when the parent lookup yields `undefined`
(missing path) or `null`. Missing and null are equivalent: no target query is
issued for that parent for that include. Rationale: avoids `{ field: undefined
}` cast hazards and surprising `{ field: null }` matches against missing
target fields; deterministic and safe under denied/omitted source fields.

D4.2. Short-circuit rule: ANY unresolvable marker in an include's `id` or
`filter` short-circuits the whole per-parent execution to the no-match shape —
remaining markers are not resolved and no target query is issued.

D4.3. No-match shapes (correlated only; deterministic, unlike legacy read
which leaves the path unset): `read` attaches `null` at `path`; `list`
attaches `[]`; `count` attaches `0`. The output path is always set on success
_and_ on no-match. Target miss (query ran, zero rows) produces the same shapes.

D4.4. Array operands. The substituted array is passed through unchanged and
existing Mongoose casting applies — no new normalization is promised
(`normalizeFilter` does no array rewriting today):
`{ tag: <marker resolving to ['a','b']> }` behaves exactly like the literal
`{ tag: ['a','b'] }` (documented `$in`-equivalent on scalar paths; exact
semantics otherwise). Explicit membership uses `{ field: { $in: marker } }`.
Nested arrays produced by substitution (e.g. `$in: [marker-resolving-to-array]`)
match literally; the server never flattens. Expanded `$in` lengths are
revalidated against `maxInValues` (D12.2).

D4.5. Identifier coercion: a resolved `id` that is a string is used as-is;
numbers/booleans are coerced via `String()`; objects, arrays, `null`, and
`undefined` are unresolvable (D4.1 → no-match shape, no lookup).

##### D5 — Output paths and target errors (requirement 3)

D5.1. `path` must be a non-empty valid field path (`isValidFieldPath`
parity), must not equal `_id`, and must not start with `$`. Duplicate output
paths within one include array are `BadRequest`. Collision with an existing
parent document field is allowed: the include overwrites it (legacy
`setDocValue` parity, documented). Evaluation order is array order, but every
include resolves against the same stable snapshot (D8), so results are
order-independent.

D5.2. All-or-nothing target errors. Target authorization denial (`isAllowed`
false for the include's `op`) fails the whole parent request with the denial
error and issues zero target persistence queries (denials are request-scoped,
hence uniform across parents). Target runtime errors fail the whole request.
Per-parent partial error shapes are never attached. Read includes force
`tryList: false` (ARF-01 parity: no read→list fallback). Count includes use
explicit `count` access (never the `Service.count` `list` default).

##### D6 — Complete wire examples and expected outcomes (acceptance criteria)

Parent collection `User`, target collections `Org` (`{ _id, name, description,
active }`, custom identifier field `slug` on a second target) and `Post` (`{
_id, authorId, reviewerId, title, createdAt }`).

D6.1. Identifier read. `orgService.read(parentField('orgId')).$include('org')`
→ `{ "mode": "correlated", "model": "Org", "op": "read", "path": "org", "id": {
"$parent": "orgId" } }`. Parent `{ _id: 'u1', orgId: 'o9' }` → target read by
id `'o9'` via the target's configured identifier behavior
(`resolveIdentifierFilter`/`genIDFilter`, custom `resolveIdFilter` honored) →
attach doc, or `null` on miss. Parent `{}` (missing) or `{ orgId: null }` → no
query, attach `null`.

D6.2. Advanced identifier read.
`orgService.readAdvanced(parentField('orgId'), { select: ['name',
'description'] }).$include('org')` → D6.1 shape plus `"args": { "select":
["name", "description"] }`.

D6.3. Filter read. `orgService.readAdvancedFilter({ _id: parentField('orgId'),
active: true }, { select: ['name'] }).$include('org')` → `{ "mode":
"correlated", "model": "Org", "op": "read", "path": "org", "filter": { "_id": {
"$parent": "orgId" }, "active": true }, "args": { "select": ["name"] } }`.

D6.4. Correlated list with literal. `postService.listAdvanced({ authorId:
parentField('_id'), reviewerId: parentField('managerId'), title: '$special' },
{ select: ['title'], sort: { createdAt: -1 }, limit: 5 }).$include('posts')` →
`{ "mode": "correlated", "model": "Post", "op": "list", "path": "posts",
"filter": { "authorId": { "$parent": "_id" }, "reviewerId": { "$parent":
"managerId" }, "title": "$special" }, "args": { "select": ["title"], "sort": {
"createdAt": -1 }, "limit": 5 } }`. `'$special'` stays a literal string.
Parent `{ _id: 'u1', managerId: 'm1' }` → per-parent `{ authorId: 'u1',
reviewerId: 'm1', title: '$special' }`, sorted, max 5 rows, attach array
(possibly `[]`).

D6.5. Nested scope. Outer user `{ _id: 'u1', managerId: 'm1' }`; posts include
carries nested `args.include: [{ mode: 'correlated', model: 'User', op: 'read',
path: 'reviewer', id: { $parent: 'reviewerId' } }]`; post doc `{ _id: 'p1',
reviewerId: 'm9' }` → nested `id` resolves to `'m9'` (the post's field), NOT
`'m1'`.

D6.6. Counts. `postService.countAdvanced({ authorId: parentField('_id')
}).$include('postCount')` → `{ "mode": "correlated", "model": "Post", "op":
"count", "path": "postCount", "filter": { "authorId": { "$parent": "_id" } } }`
(no `args`). Count uses count semantics with explicit `count` access,
independent of any list limit. Missing ref → attach `0` with no query.

D6.7. Array and escape cases. Parent `{ memberIds: ['x','y'] }`, filter `{
authorId: { $in: parentField('memberIds') } }` → `{ authorId: { $in: ['x','y']
} }`. Parent `{ tags: ['a','b'] }`, filter `{ tag: parentField('tags') }` →
`{ tag: ['a','b'] }` with standard Mongoose casting (D4.4). Filter `{ note: {
$escape: { $parent: 'x' } } }` → literal `{ note: { $parent: 'x' } }`
regardless of parent content.

D6.8. Enclosing payloads. Direct parent list: `POST {basePath}/{queryPath}`
body `{ filter, select, sort, populate, include: [<correlated>], skip, limit,
page, pageSize, tasks, options }` (`listBodySchema`). Direct parent id-read:
id stays in the URL path; body `{ select, populate, include: [<correlated>],
tasks, options }` (`readByIdBodySchema`). Direct parent filter-read: `POST
{basePath}/{queryPath}/__filter` body `{ filter, select, sort, populate,
include: [<correlated>], tasks, options }` (`readFilterBodySchema`). Grouped
root entries: `{ target: 'model', op: 'list'|'read', name, filter?/id?,
args: { …, include: [<correlated>] }, … }` (`root-router.ts`). A direct
_count_ parent (`countBodySchema`: filter only, rejects `options`) carries no
`include` — correlated _count_ includes attach to read/list parents only.

##### D7 — Source-field authorization and snapshot (requirement 4)

D7.1. The server collects every `$parent` path referenced by an include
(transitively, excluding nested `args.include` subtrees which belong to the
next level) and adds them to the parent DB select, exactly like
`processInclude` adds `includeLocalFields`. They are trimmed from output unless
allowed by field policy AND selected (or override-selected).

D7.2. Omitted-from-selection vs forbidden-by-policy: both resolve internally
and neither is exposed unless policy-allowed and selected. A policy-forbidden
reference still resolves (legacy `localField` parity: join keys are fetched
without a policy check, then trimmed). The resolved _values_ never appear in
output, error details, or sibling includes — only their query effects do.

D7.3. Stable snapshot rule: references resolve against the parent document as
fetched from persistence (including internal-only reference fields), BEFORE
include attachment, `decorate` hooks, and task mutation. Sibling include
output and decorate/task output are NOT visible to references. Rationale:
order-independent, deterministic resolution; sibling-output visibility would
make results depend on include array order.

##### D8 — Descriptor vs executable request (requirement 5)

D8.1. Each of the seven methods synchronously scans its reference positions
(`id`, `filter`, and — for advanced methods — `select`/`sort` values are NOT
scanned; only `id`/`filter` carry markers) at call time. Markers present → the
method returns a frozen, non-thenable `CorrelatedIncludeDescriptor` (no
`then`/`catch`/`finally`/`exec`, no executor, zero HTTP possible). Markers
absent → an ordinary executable `LazyRequest` with unchanged behavior.
Overloads express this at compile time; the runtime scan enforces it for
unchecked JavaScript callers (malformed markers throw controlled errors).

D8.2. `$include` lives ONLY on (a) descriptors returned by the seven methods
and (b) the executable returns of the seven methods (literal/constant inner
queries and basic-method supplemental filters). It is NOT added to
`LazyRequest` generally, nor to data-service, mutation, `distinct`, or
subdocument operations (ACI-04 acceptance: unsupported operations do not
advertise `$include()`).

D8.3. `await` on a descriptor yields the descriptor unchanged (JavaScript
semantics for non-thenables) — this cannot be intercepted and is documented as
a programming error, not a runtime guard. Only the restrictions actually
enforceable are promised: no executor exists; `adapter.group()` brand-checks
entries and throws on descriptors; filter conversion (`replaceSubQuery`
successor) brand-checks embedded values and throws on descriptors; `$include`
validates its inputs.

D8.4. Descriptor lifetime and purity. Conversion is synchronous, pure, and
repeatable: `$include` deep-clones a frozen metadata snapshot captured at call
time, so results are independently owned and repeated conversion never shares
mutable payloads. Descriptors hold no server resources and never expire; they
may be converted before, after, or without executing any outer request, and an
outer executable request carrying a converted wire payload executes/group
normally (inner descriptors travel as data, never dispatch).

##### D9 — Supported args/options, explicit-vs-inherited, cross-adapter (requirement 6)

D9.1. Forwarding allowlist (effective per-call args merged over cloned service
defaults with existing precedence, then filtered). Allowed per wire shape:
identifier/filter reads `{ select?, sort?, include? (nested) }`; lists add
`{ skip?, limit?, page?, pageSize? }`; basic `read`/`count` carry no `args`;
basic `$include(path, { filter })` supplemental filter is the inner filter.
Nested include entries recurse under the same rules. Everything else is
dropped or rejected:

- `populate`: NOT forwarded in v1 (explicit per-call `populate` → controlled
  error at `$include()`; inherited default `populate` → silently dropped).
  Rationale: target populate authorization (`populateAccess`) needs its own
  contract; deferred to FU-1.
- `tasks`: never forwarded (explicit per-call → throw; inherited → ignore).
- Execution-only options (`skim`, `includePermissions`, `includeCount`,
  `tryList`, `populateAccess`, `ignoreCache`, `includeExtraHeaders`, `sq`):
  explicit per-call values → throw at `$include()`; inherited defaults →
  ignore. The server forces `lean: true`, `includePermissions: false`,
  per-op `access`, `tryList: false` on reads, `includeCount: false` on lists
  (legacy `trustedOptions` parity).
- Wire `options` on correlated entries: absent or `{}`; non-empty → BadRequest.
- Transport (`axiosRequestConfig`) on a reference-bearing call: any supplied
  config → synchronous controlled error (descriptors have no transport;
  service-level callbacks never fire for them).

D9.2. Explicit-vs-inherited is implementable because the descriptor retains
per-call inputs separate from service defaults; checks inspect per-call own
properties only. Rationale: defaults describe direct execution, so inheriting
them into inner queries would silently change meaning; explicit values signal
intent and fail loudly.

D9.3. Basic-vs-advanced filter exclusivity: the supplemental `{ filter }`
option exists ONLY on basic `list()`/`count()` `$include`; advanced-method
`$include(path)` takes no filter option (explicit → throw). Basic methods have
no filter of their own, so the two sources can never conflict by construction.

D9.4. Cross-adapter composition: conversion captures model name + query data
only — never adapter, base path, headers, or transport. Inner descriptors
always execute on the OUTER server under the outer request/runtime context. No
client-side same-adapter check (model resolution is server-side); an unknown
model fails server-side with a controlled error. Mixing adapters in one
include tree is allowed at build time and is transport-inert by construction.

##### D10 — Output typing (requirement 7)

`$include<TOut = unknown>(path)` carries an explicit result generic defaulting
to `unknown`. The outer awaited type gains the output path with `TOut`; inner
values are plain (never `Model`-wrapped, matching legacy `lean: true`
payloads). No inference from partial projections is promised, no guaranteed
read match is typed, and parent-path validation without a parent type is not
claimed. Consumers wanting typed include output supply the generic explicitly
(e.g. `.$include<Org>('org')`); the exact mapped-type merge is ACI-04 design
within this contract.

##### D11 — Bounds, limits, compatibility (requirement 8)

D11.1. Template budgets: existing `requestComplexity` validation applies to
the wire template — each correlated entry counts toward `maxIncludeCount`,
markers count as nodes, template `$in` lengths count toward `maxInValues`,
`$$sq`-style traversal rules apply to nested `args.include`.

D11.2. Post-expansion revalidation (per parent, before target execution):
expanded filter nodes ≤ `maxNodes`, depth ≤ `maxDepth`, expanded `$in` arrays
≤ `maxInValues`, logical clauses ≤ `maxLogicalClauses`. Violation fails the
whole parent request with `BadRequest` (a short template may expand to a large
parent array; no partial results).

D11.3. New complexity knobs (ACI-02/03 implement; defaults chosen to match
existing budget scale): `maxCorrelatedQueries` default 100 — total inner
target executions per parent request (each per-parent read/list/count counts
1; nested levels multiply); `maxCorrelatedDepth` default 5 — nesting depth of
correlated includes. Exceeding either fails the whole request with a controlled
error. Fan-out concurrency shares the request-scoped scheduler bounded by the
existing `maxBulkConcurrency` (no new concurrency knob; no per-parent
scheduler reset, avoiding deadlocks and budget resets).

D11.4. Compatibility: `mode: 'correlated'` requires a server implementing this
contract. Pre-feature servers silently drop such entries in `processInclude`
(documented hazard, no version negotiation in v1); the minimum server version
is stated in release notes (ACI-06). New servers accept legacy and correlated
variants in BOTH direct (`model-router.ts`) and root (`root-router.ts`)
validators with identical verdicts, and return controlled errors — never silent
drops — for malformed correlated input. General aggregation expressions and
batched cross-parent database optimization stay out of scope (non-goals).

#### ACI-01 Completion

- Status: completed.
- Changed files: `docs/tasks/20260912-181841-access-router-correlated-includes.md`
  only (ACI-01 section status flip plus the normative `ACI-01 Contract Decision`
  and this completion record). No production code, no CHANGELOG, no `dist/`
  changes.
- Verification performed: full read of the task file; read of server
  `src/interfaces/query-types.ts`, `src/core-shared.ts`,
  `src/validation/common.ts`, `src/validation/root-router.ts`,
  `src/validation/model-router.ts`, `src/request-complexity.ts`,
  `src/services/base.ts`, `src/services/service.ts`, `src/enums.ts`,
  `src/helpers/index.ts`, `src/helpers/document.ts`; read of client
  `src/types.ts`, `src/services/model-service.ts`, `src/services/request.ts`,
  `src/interface.ts`, `src/lazy-promise.ts`, `src/mongoose/types.ts`,
  `src/helpers.ts`. Evidence review only, as permitted by the task
  (`git status --short` confirms only the task file is modified;
  `git diff --check` clean).
- Acceptance evidence: (1) D1 + D6 give the complete wire schema and per-method
  examples including direct HTTP enclosing payloads for all seven methods
  (D6.8; direct-count parents excluded by schema, stated). (2) D6.1–D6.7 give
  explicit expected outcomes for scalar, array, literal-marker (`$special` and
  `$escape`), missing-reference, null-reference, custom-identifier, denial, and
  nested cases. (3) D8.4 + D9 state descriptor lifetime, purity, and
  explicit-vs-inherited option-forwarding rules. (4) Every requirement 1–8 maps
  to a decision (D1–D5, D7, D8, D9, D10, D11); no open question remains for
  ACI-02..04. Task is NOT blocked; no maintainer decision outstanding.
- Follow-ups (deferred, non-blocking): FU-1 — target `populate` forwarding
  contract inside correlated includes (D9.1 rejects it in v1); owner ACI-04
  proposer / future task. FU-2 — old-server silent-drop hardening (client
  minimum-version guard or fail-closed marker); owner ACI-06. FU-3 — measured
  tuning of `maxCorrelatedQueries`/`maxCorrelatedDepth` defaults once
  ACI-03/05 integration data exists; owner ACI-03/07.

### Task ACI-02: Add Server Protocol Validation And Reference Resolution

Status: completed

Kind: improvement

Priority: P1 — the new protocol requires consistent server interpretation.

Dependencies: ACI-01

Primary ownership:

- `packages/access-router/src/interfaces/query-types.ts`.
- `packages/access-router/src/validation/common.ts`, `model-router.ts`, `root-router.ts`, and associated types.
- A focused server reference-resolution module and its tests.

Finding: `includeItemSchema` currently requires legacy join fields. Direct and root validation reuse `includeSchema`; a new protocol needs a shared validation boundary.

References: server `src/validation/common.ts` (`includeItemSchema`), `src/validation/root-router.ts` (root model args), `src/request-complexity.ts` (`validateRequestComplexity`).

Requirements:

1. Accept legacy and correlated variants without silently treating malformed correlated input as a legacy include or dropping it in `processInclude`.
2. Resolve markers only in the supported positions and preserve logical structure and literal strings.
3. Treat substituted values as data, not newly executable filter operators or recursively interpreted reference markers. Apply the ACI-01 literal-object escape precisely.
4. Validate reference/output paths and object ownership boundaries; do not traverse inherited/prototype properties.
5. Revalidate expanded operands against relevant complexity limits. A short template may expand to a large parent array or object.
6. Preserve nested include scope rather than resolving nested references against the outer parent. Define resolver traversal boundaries around existing subquery payloads according to ACI-01.

Acceptance criteria:

- Direct/root validators agree on valid and invalid payloads and return controlled errors.
- Tests cover multiple references, `$and`/`$or`, explicit `$in`, dotted paths, literal-marker escaping, and missing/null behavior.
- Operator-shaped parent values cannot become unintended query operators; ordinary strings beginning with `$` remain unchanged.
- Existing legacy include validation remains compatible.

Verification: V1 resolver/schema regressions; server checks in V2.

#### ACI-02 Completion

- Status: completed. ACI-01 contract honored strictly; no ACI-03 execution
  work started (no authorized service dispatch; `includeDocs` fails closed
  on correlated entries for ACI-03 to implement).
- Changed files (production, all under `packages/access-router/src/`):
  - `interfaces/query-types.ts` — `Include` is now a discriminated union of
    `LegacyInclude` (unchanged shape, plus optional `mode: 'legacy'`) and
    `CorrelatedInclude` (four variants per D1.1/D1.3 with `mode:
'correlated'`, `ParentRef`, `CorrelatedFilter`, `CorrelatedIncludeArgs`).
  - `correlated-includes.ts` (new) — focused pure reference-resolution
    module: marker/escape recognition (escape tested before marker per
    D2.2), path validation (dotted segments, dangerous-segment rejection,
    own-property semantics), shared filter/id template walkers, pure
    single-pass resolvers (`resolveCorrelatedFilterTemplate`,
    `resolveCorrelatedIdTemplate` with D4.5 coercion), reference-path
    collection excluding nested `args.include` (D3.4/D7.1),
    `validateCorrelatedIncludeShape` for service-direct paths,
    `validateExpandedCorrelatedOperands` (D11.2 revalidation via existing
    `validateRequestComplexity` budgets), `isCorrelatedInclude` guard.
  - `validation/common.ts` — shared `includeItemSchema` is now a
    legacy/correlated union; correlated variants enforce D1.2 (strict
    objects reject `localField`/`foreignField`), D2/D3 positions, D5.1
    output paths, D9 arg allowlists (reads `{select,sort,include}`, lists
    add pagination, counts accept no args; non-empty wire `options`
    rejected), id/filter exclusivity; legacy entries carrying `$parent`
    markers are `BadRequest` (D1.2); duplicate correlated output paths
    rejected at the array level. Direct (`model-router.ts`) and root
    (`root-router.ts`) validators share this schema, so verdicts agree.
  - `validation/model-router.ts` — `countBodySchema` now rejects `include`
    (D6.8: direct count parents carry no include).
  - `request-complexity.ts` — new `maxCorrelatedQueries` (default 100) and
    `maxCorrelatedDepth` (default 5) knobs per D11.3 (definitions and
    resolution only; execution enforcement is ACI-03).
  - `services/base.ts` — `processInclude` partitions legacy vs correlated
    (correlated entries never silently dropped; malformed correlated input
    and marker-carrying legacy entries throw controlled `BadRequest`;
    legacy silent-drop preserved only for entries with no correlated
    signals; duplicate correlated paths rejected; returns
    `correlatedIncludes` + `correlatedReferenceFields` alongside the
    unchanged legacy fields). `includeDocs` fails closed on correlated
    entries pending ACI-03; legacy executor signatures narrowed to
    `LegacyInclude`.
- Changed files (tests, under `packages/access-router/test/`):
  - `correlated-includes.validation.test.ts` (13 tests) — direct/root
    agreement on all four wire shapes, legacy compatibility, join-field
    mixing, legacy-with-markers, malformed markers/escapes, escape + dotted
    paths, forbidden positions (`$$sq`, `$text`/`$where`, sort/select,
    bare `$and` clauses, `$elemMatch`, `$parent` keys), supported logical /
    `$in` positions, id/filter exclusivity, op-specific args, output paths +
    duplicates, malformed-input rejection, count-parent `include`
    rejection, nested includes.
  - `correlated-includes.resolver.test.ts` (18 tests) — multi-ref/literal
    preservation, `$and`/`$or`/`$in`, dotted paths, arrays without
    flattening, precise `$escape`, missing/null short-circuit, D4.5 id
    coercion, `$eq`-wrapping of operator-shaped parent values, no recursive
    marker interpretation, unchanged `$` strings, own-property semantics,
    traversal boundaries, nested-scope collection, expanded-operand
    revalidation, and `processInclude`/executor boundaries.
- ACI-02 implementation decisions (within ACI-01 latitude):
  - A bare-field marker resolving to a plain object expands to
    `{ $eq: <cloned object> }` so substituted objects match literally and
    never become executable filter syntax (acceptance: operator-shaped
    parent values cannot become unintended operators). Arrays, Dates,
    ObjectIds, and scalars substitute as-is per D4.4; `$escape` produces a
    fresh own-key-safe literal.
  - Bare markers/escapes as direct `$and`/`$or`/`$nor` clauses or direct
    `$elemMatch` values are `BadRequest` (not supported positions per D3.1).
  - `$text`/`$where`/`$comment` marker checks apply at any filter depth
    (superset of D3.2, still blocked operators).
  - Escape inners must be marker-shaped with a non-empty string; path
    segment rules are not applied to escape inners (never traversed).
- Verification performed (working directory
  serial per AGENTS.md):
  - `pnpm --filter @web-ts-toolkit/access-router... build` — pass.
  - `pnpm --filter @web-ts-toolkit/access-router exec vitest run
--config vitest.config.ts
test/correlated-includes.validation.test.ts` — 13/13 pass.
  - Same for `test/correlated-includes.resolver.test.ts` — 18/18 pass
    (one initial test-authoring failure: asserted on the thrown error
    message instead of `result.errors[0].detail`; fixed the test, no
    production change).
  - `pnpm --filter @web-ts-toolkit/access-router typecheck`
    (`tsc --noEmit -p tsconfig.typecheck.json`) — pass (`TYPECHECK_OK`).
  - `pnpm --filter @web-ts-toolkit/access-router test` — 49 files,
    461 tests, all pass (includes legacy include, authorization,
    request-complexity, export/documentation/packed suites).
  - `git status --short` shows only the intended source/test/task-file
    modifications; no CHANGELOG, no `dist/` hand-edits.
- Acceptance evidence: (1) direct/root agreement asserted per payload in
  `expectAgreement` across `listBodySchema`, `readFilterBodySchema`,
  `readByIdBodySchema`, and three root entry shapes; all rejections are
  zod/`BadRequest` controlled errors. (2) Multiple refs, `$and`/`$or`,
  explicit `$in` (value and element positions), dotted paths, `$escape`,
  and missing/null short-circuit covered. (3) `$eq`-wrap tests prove
  operator-shaped values stay data; `'$special'`/`'$parent'` strings round
  trip unchanged. (4) Full suite green proves legacy validation/execution
  compatibility.
- Follow-ups (deferred, non-blocking): FU-ACI02-1 — wire the collected
  `correlatedReferenceFields` into parent select enrichment and enforce
  `maxCorrelatedQueries`/`maxCorrelatedDepth` at execution (owner ACI-03).
  FU-ACI02-2 — substituted `$$sq`-shaped parent values are wrapped in
  `$eq` at bare positions but ACI-03 must confirm the expanded filter never
  re-enters subquery execution as live operators (owner ACI-03).

### Task ACI-03: Execute Correlated Includes Through Authorized Services

Status: completed

Kind: improvement

Priority: P1 — delivers server behavior and preserves access boundaries.

Dependencies: ACI-02

Primary ownership:

- `packages/access-router/src/services/base.ts`, `service.ts`, and relevant public-service paths.
- Server request-complexity/concurrency integration.
- Server authorization and correlated-include integration tests.

Finding: legacy list includes reconstruct ownership using returned foreign fields, read includes execute per parent, and grouped count includes use their own primitive. Correlated queries require a distinct execution path. The existing `count` service defaults to list access unless supplied explicitly. Existing scheduler helpers bound individual maps; a request-wide nested execution bound requires deliberate design.

References: server `src/services/base.ts` (`includeDocsRead/List/Count`, target authorization), `src/services/service.ts` (`find`, `findOne`, `count`, `countByFieldValues`), `src/core-shared.ts` (`resolveIdentifierFilter`), `src/helpers/concurrency.ts` (`RequestConcurrencyScheduler`); `test/cross-resource-authorization.integration.test.ts`.

Requirements:

1. Dispatch correlated read/list/count through appropriate authorized target-service paths and the active request/runtime context.
2. Preserve custom identifier handling and terminal denials; avoid implicit read-to-list fallback. Explicitly use count access for count includes.
3. Apply per-parent list pagination, sort authorization, and target projection. Do not require target relationship fields in the returned projection to associate a result with its parent.
4. Count matching records independently of list limits.
5. Load authorized parent dependencies needed for references according to ACI-01 without exposing internal-only fields or making sibling output mutations change reference resolution unexpectedly.
6. Bound total correlated work and nested concurrency across one request; avoid recursive scheduler deadlocks and budget resets for every parent/child call.
7. Preserve deterministic result attachment and documented failure/no-match behavior. Invalid client overrides cannot bypass target policy.
8. Preserve legacy include semantics, including their existing batched list pagination and exact grouped counts.

Acceptance criteria:

- Two parents receive independently correct sorted/limited lists; target projections may omit relationship fields without losing association.
- Custom identifiers work when distinct from `_id`; identifier denial causes no persistence lookup.
- Target operation denial causes no target persistence query. Tests distinguish read, list, and count guards, row filters, and field policies.
- Source reference dependencies obey the agreed allowed/omitted/forbidden-field policy without leaking internal fields.
- Nested fan-out and post-substitution operand limits are enforced; measured active query counts stay within the configured execution bound.
- Direct HTTP, root HTTP, and supported service entry paths agree; legacy regressions remain passing.

Verification: V1 with existing `cross-resource-authorization.integration.test.ts`, request-complexity tests, and new correlated execution tests; server V2.

#### ACI-03 Completion

- Status: completed. ACI-01 contract and ACI-02 validation/resolver honored strictly; no ACI-04..07 work started.
- Changed files (production, all under `packages/access-router/src/`):
  - `services/base.ts` — request-scoped correlated execution: shared `RequestConcurrencyScheduler` + `totalQueries` budget per `ModelRequest` (WeakMap, no per-parent reset); static template-depth check against `maxCorrelatedDepth`; `includeCorrelatedDocs` with stable pre-include snapshots (`cloneDeep(toObject(doc))`); per-op dispatch through authorized target services (`getAuthorizedTargetService` pre-check per include, zero queries on denial); id reads via target `genIDFilter` (custom `idField`/`resolveIdFilter` honored) + explicit `genFilter('read', …)` with no read→list fallback; filter reads/lists via template `validateClientFilter` + single `parseClientData` (template `$$sq` executes) + pure substitution + `validateExpandedCorrelatedOperands` revalidation + explicit `genFilter(op, …)` + `findOne`/`find` with `overrides.filter` (substituted `$$sq`/`$where`-shaped data stays inert, client `overrides` stripped); counts via explicit `genFilter('count', …)` + new `countTrusted` (count semantics, no list limits); `lean:true`, `includePermissions:false`, `access` per op, `tryList:false` (by construction), `includeCount:false`; NotFound→`null`/`[]`/`0`, other target errors fail whole request; per-parent fan-out via shared scheduler; deterministic `setDocValue` attachment in array order against the same snapshot.
  - `services/service.ts` — `findOne`/`find` now consume `correlatedIncludes` + `correlatedReferenceFields` from `processInclude`: enrich parent DB select with ref fields, snapshot before legacy includes, execute legacy then correlated, keep correlated output paths in `trimOutputFields`, then strip unselected internal ref fields (allowed+selected or output-path preserved; omitted/forbidden removed) via `unsetDocPath`; added `countTrusted(authorizedFilter)` for ACI-03 counts and `unsetDocPath`/`shouldKeepCorrelatedRef` helpers. Legacy batch list pagination and grouped counts untouched.
- Changed files (tests):
  - `test/correlated-includes.execution.test.ts` (new, 12 tests) — per-parent sorted/limited lists with projection omitting relationship fields; custom `slug` identifier reads; missing/null → `null`/`[]`/`0` with zero queries; count independent of list limit; literal `$special` + `$in` marker positions; invalid `overrides` rejected; read/list/count guard distinction + row filters + field policies + identifier denial with zero persistence queries; no read→list fallback + sort authorization; allowed/omitted/forbidden source refs without leaking; sibling-output snapshot isolation; nested immediate-parent scope + post-substitution `$in` bound + `maxCorrelatedQueries` bound + measured query counts; direct/root/service-entry agreement.
- Verification performed (serial per AGENTS.md):
  - `pnpm --filter @web-ts-toolkit/access-router... build` — pass.
  - `pnpm --filter @web-ts-toolkit/access-router exec vitest run --config vitest.config.ts test/correlated-includes.execution.test.ts` — 12/12 pass.
  - Same for `test/cross-resource-authorization.integration.test.ts` + `test/correlated-includes.validation.test.ts` + `test/correlated-includes.resolver.test.ts` — 46/46 pass.
  - Same for `test/request-complexity.integration.test.ts` — 7/7 pass.
  - `pnpm --filter @web-ts-toolkit/access-router exec tsc --noEmit -p tsconfig.typecheck.json` — pass (exit 0).
  - `pnpm --filter @web-ts-toolkit/access-router test` — 50 files, 473 tests, all pass (legacy regressions green).
  - `git status --short` shows only intended source/test/task-file modifications; no CHANGELOG, no `dist/` hand-edits.
- Acceptance evidence: (1) two parents get independently correct sorted/limited lists with `authorId` omitted from projection; (2) `slug` custom-id reads attach correct orgs; identifier denial 401 with `findOne`/`find` at 0; (3) read/list/count denials each 401 with zero target queries; row-filter (`tenant`) and field-policy (`secret` stripped) asserted; (4) allowed ref visible, omitted/forbidden resolve but absent from output; (5) nested `reviewerId` binds to post not outer user; 120-element `$in` expansion → 400; 2-parent/1-query over `maxCorrelatedQueries:1` → 400; measured `find` counts within bound; (6) direct `__query`, root batch, and internal `_list` service route all return `postCount:3`; full suite green.
- Follow-ups (deferred, non-blocking): FU-ACI03-1 — template `$$sq` executes pre-substitution while substituted `$$sq`-shaped data stays inert via `overrides.filter`; if future templates need post-substitution subquery semantics, add explicit contract (owner ACI-05/07). FU-ACI03-2 — `maxCorrelatedQueries` check+increment is sync-atomic per event-loop turn; under extreme concurrent fan-out a few slots may overshoot by one scheduling quantum — acceptable within budget scale, retune per FU-1/ACI-01 FU-3 with integration data (owner ACI-07).

### Task ACI-04: Implement Client Parent References And Include Composition

Status: completed

Kind: improvement

Priority: P1 — delivers the agreed consumer API.

Dependencies: ACI-01

Primary ownership:

- `packages/access-router-client/src/services/model-service.ts`, `services/request.ts`.
- Client `src/types.ts`, `interface.ts`, `mongoose/types.ts`, and public exports.
- Focused conversion, type, and immutability tests.

Finding: service calls retain resolved query metadata, but no reference helper or include-conversion method exists. `LazyRequest` also serves unrelated data and mutation workflows, so attaching the feature there indiscriminately would advertise unsupported composition.

References: client `src/services/model-service.ts`, `src/services/request.ts` (`makeRequest`), `src/lazy-promise.ts` (execution claims), `src/mongoose/types.ts` (`Condition`, `QuerySelector`), `src/services/shared.ts` (default cloning), `src/helpers.ts` (`replaceSubQuery`).

Requirements:

1. Export `parentField()` and necessary public types. Support all seven methods using the agreed argument positions.
2. Add a pure metadata-to-include converter producing detached serializable payloads; preserve supported service/adapter/per-call defaults.
3. Keep `$include()` specific to eligible model queries rather than adding it indiscriminately to `LazyRequest`. Preserve ordinary method signatures, lazy execution, and grouping.
4. Represent reference-bearing calls so they cannot dispatch unresolved references through supported direct-execution APIs. Follow ACI-01 for compile-time and runtime rejection, including nested references and unchecked JavaScript callers.
5. Preserve supported nested includes without mutating caller inputs. Repeated conversion must not share mutable payload ownership unexpectedly.
6. Keep ordinary filter typing strict while admitting references in supported scalar/operator positions. Preserve existing `$$sq` and typed-filter escape hatches.
7. Implement the agreed output-typing contract without promising unselected fields, guaranteed read matches, or nested `Model` wrappers.
8. Keep browser compatibility without adding server runtime dependencies. Respect the ACI-01 foreign-adapter and unsupported-option rules.

Acceptance criteria:

- All seven examples compile and convert to the agreed payload; scalar/date/numeric/array filter reference positions have meaningful positive and negative type tests.
- Conversion performs zero HTTP calls and does not claim execution ownership of ordinary requests.
- Unsupported operations do not advertise `$include()`; unchecked invalid calls fail with controlled errors.
- Basic supplemental filters and advanced filter arguments cannot conflict.
- Tests cover defaults, nested markers, repeated conversion, literal strings, independent payload ownership, and reference-only execution restrictions.
- Reference payloads are not confused with existing `$$sq` metadata; normal requests retain their execution/grouping behavior.

Verification: V1 client conversion/type tests; client V2 and relevant V3 checks.

#### ACI-04 Completion

- Status: completed. ACI-01 contract honored strictly (D1–D11 as applicable
  to the client); ACI-02/ACI-03 server evidence honored (wire shapes match
  D6.1–D6.7; no server code touched). No ACI-05..07 work started: no
  cross-package integration matrix, no README/`llms.txt`/website/CHANGELOG
  edits, no OpenAPI changes.
- Changed files (production, all under `packages/access-router-client/src/`):
  - `correlated-brand.ts` (new, dependency-free) — descriptor `Symbol`
    brand, `isCorrelatedIncludeDescriptor`, `CorrelatedIncludeError`; shared
    by conversion, filter rewriting, and grouping without import cycles.
  - `correlated.ts` (new) — `parentField()` (D2.1 validation, frozen
    marker), call-time `id`/`filter` scanners with D3.2 forbidden contexts
    (`$text`/`$where`/`$comment` sticky at any depth, bare `$and`/`$or`/`$nor`
    clauses, direct `$elemMatch`; `$escape` opaque per D2.2; embedded lazy
    requests opaque; embedded descriptors throw), frozen per-call snapshots
    separate from service defaults (D9.2), pure
    metadata-to-include converter (D8.4/D9: path validation, basic-vs-advanced
    supplemental exclusivity D9.3, explicit populate/tasks/execution-option
    rejection with inherited defaults dropped, per-op arg allowlists,
    nested-include preservation with descriptor/live-request rejection,
    transport-inert output — model name + query data only, D9.4), frozen
    non-thenable descriptor factory (D8.1, no `then`/`catch`/`finally`/`exec`),
    non-enumerable `$include` attachment for executables (execution/grouping
    preserved).
  - `types.ts` — `ParentRef`, `CorrelatedInclude` (discriminated
    `mode: 'correlated'`, type-only `Out` carrier), `CorrelatedIncludeArgs`,
    `CorrelatedIncludeInput`, `SupplementalIncludeOptions`,
    `WithCorrelatedOutputs` (read `Out | null`, list `Out[]`, count
    `number`; legacy/wide inputs map to nothing so untouched outer types are
    textually identical), `Includable*` mixins (basic forms require
    `{ filter }`, advanced forms take path only — D9.3 at compile time),
    `CorrelatedRead/List/CountDescriptor`; re-exports the correlated filter
    types from the package root.
  - `mongoose/types.ts` — `$parent?: never` guards on strict and root
    selectors (markers cannot satisfy the all-optional shapes, so overloads
    discriminate), `EscapeLiteral` admitted in strict and correlated
    conditions (escapes are data: escape-only filters stay executable),
    `CorrelatedQuerySelector`/`CorrelatedFilterQuery` admitting refs in bare
    and D3.1 operator positions (`$eq/$ne`/`$gt/$gte/$lt/$lte`,
    `$in`/`$nin` elements and whole-value, `$regex`/`$options` inside the
    string-conditional branches, nested `$not`); `$exists`/`$type`/`$mod`
    and bare array elements stay strict.
  - `interface.ts` — `ListAdvancedArgs`/`ReadAdvancedArgs` `include`
    widened to `CorrelatedIncludeInput` (backward compatible).
  - `services/model-service.ts` — all seven methods: strict-first /
    correlated-second overloads (descriptor vs executable at compile time),
    runtime scan + transport guard + snapshot + descriptor-or-executable
    return; executables keep byte-identical execution/grouping behavior plus
    a non-enumerable pure `$include`.
  - `helpers.ts` — `replaceSubQuery` brand-checks descriptors (throws)
    while passing `ParentRef`/escape markers through untouched (never
    `$$sq`); `adapter.ts` — `group()` brand-checks descriptors before any
    claim/dispatch; `index.ts` — root exports `parentField`,
    `CorrelatedIncludeError` only.
- Changed files (tests): `test/access-router-client.correlated-includes.unit.test.ts`
  (new, 35 tests), `test/access-router-client.correlated-filter-types.unit.test.ts`
  (new, 14 tests), `test-typecheck/correlated-includes.ts` (new,
  compile-enforced positive/negative fixtures — `@ts-expect-error` directives
  there fail `typecheck:test` if unused), `test/access-router-client.exports.unit.test.ts`
  (runtime + type allowlists extended), `test-packed-consumer/consumer/`
  (`consumer.cjs`/`consumer.mjs` surface + assertions,
  `consumer-types.ts` packed-declaration probes),
  `test/access-router-client.browser-smoke.ts` (runtime surface).
- ACI-04 implementation decisions (within ACI-01 latitude):
  - Generic order is path-first (`$include<'org', Org>('org')`), not the
    D10 `e.g.` spelling `$include<Org>('org')`. TypeScript has no partial
    type-argument inference: with `<TOut, TPath>` order an explicit `<Org>`
    widens `TPath` to `string` (verified by minimal `tsc` probes, with and
    without `const`), silently dropping the outer merge; path-first keeps
    the literal in both the untyped (`$include('org')`) and explicitly typed
    forms, while a lone `$include<Org>` fails loudly on the `string`
    constraint instead of silently unmerging. Owner ACI-06 must document the
    working spelling; all seven acceptance examples (no explicit generics)
    compile unchanged under either order.
  - Snapshot cloning preserves embedded live subquery requests by reference
    (their `__query` is non-enumerable — a naive structural clone would
    strip it and silently break `$$sq` conversion); the converter rewrites
    subqueries against the snapshot and detaches the rewritten payload, and
    freezing never touches caller-visible request objects.
  - A bare marker as the whole filter throws client-side (fail-fast; a
    filter must be field conditions). An explicitly passed empty transport
    config object carries no config and is allowed; any own keys throw.
- Verification performed (working directory
  serial per AGENTS.md):
  - `pnpm --filter @web-ts-toolkit/access-router-client... build` — pass
    (CJS/ESM/DTS, browser-safe `es2022` bundle, no new runtime deps).
  - Focused V1: `correlated-includes.unit` 35/35,
    `correlated-filter-types.unit` 14/14, `exports.unit` 18/18,
    `filter-query-types.unit` 24/24 (legacy strict surface intact).
  - `pnpm --filter @web-ts-toolkit/access-router-client test` — full V2+V3:
    typecheck (source, test-typecheck, NodeNext-strict, Bundler-strict) pass;
    vitest 32 files / 475 tests pass (incl. real-server protocol-parity
    matrix, packed-consumer CJS/ESM/decl, docs.compile); browser smoke
    10/10 pass.
  - `eslint` over changed `src/`, touched tests, and the new fixture —
    clean; `git diff --check` — clean. No CHANGELOG, no `dist/` hand-edits
    (`dist/` ignored; rebuilt by the suite).
- Acceptance evidence: (1) all seven builders compile and convert to the
  D6 payloads asserted by deep-equal (identifier/filter reads, both lists,
  both counts, literal `'$special'`, `$in`-value/bare/escape cases D6.7);
  scalar/date/numeric/array ref positions have compile-enforced positive and
  negative tests (strict rejects every ref form; correlated rejects bare
  array elements, `$exists`/`$mod`/`$regex`-on-number refs, bare `$and`
  clauses). (2) Stub-transport invocation counters prove conversion performs
  zero HTTP and never claims execution (executables still await/group after
  `$include`). (3) `$include` is present on all seven builders and absent on
  create/update/delete/distinct/data-service (runtime + type probes);
  unchecked misuse (malformed markers, forbidden positions, embedded
  descriptors/requests, transport on ref-bearing calls, bad paths,
  supplemental/advanced conflicts) throws `CorrelatedIncludeError`. (4)
  Tests cover service/adapter/per-call defaults with per-call precedence,
  inherited populate/tasks/option dropping vs explicit rejection, nested
  immediate-parent markers, repeated-conversion and caller-mutation
  independence, literal strings, and `$$sq` coexistence (subquery values
  rewrite while markers pass through; descriptors rejected). (5) Output
  typing: explicit generic carried, read nullable, list array, count number,
  plain values, no projection inference; legacy/wide inputs leave outer
  types identical; outer `readAdvanced`/`listAdvanced`/`readAdvancedFilter`
  responses gain element-level paths. Normal direct/grouped execution is
  unchanged (protocol-parity suite green).
- Follow-ups (deferred, non-blocking): FU-ACI04-1 — document the
  `$include<'path', Out>` spelling in README/`llms.txt`/website + release
  notes (owner ACI-06). FU-ACI04-2 — client typed operators omit
  `$all`/`$elemMatch` (server-supported); `ServerSideCast` covers them, add
  typed support if demand appears. FU-ACI04-3 — bare-array marker elements
  are type-rejected but runtime-forwarded (server verdict authoritative);
  revisit if the server ever accepts them.

### Task ACI-05: Prove Cross-Package And Transport Parity

Status: completed

Kind: improvement

Priority: P1 — verifies that both implementations honor the shared contract.

Dependencies: ACI-03, ACI-04

Primary ownership: client integration fixtures and protocol-parity tests; focused server/client correlated-include integration tests.

Finding: the client already has a real-server direct/grouped protocol matrix, but it does not cover this new composition protocol. Testing conversion alone cannot establish backend semantics.

References: `packages/access-router-client/test/access-router-client.protocol-parity.integration.test.ts` and its `test/support/integration-suite` fixture; server `test/cross-resource-authorization.integration.test.ts`.

Requirements:

1. Extend the real-server matrix for all seven builders. Compare client-built descriptors with equivalent raw protocol payloads.
2. Exercise nested scopes, custom identifiers, per-parent pagination, literals, projection dependencies, and authorization failures.
3. Preserve outer response wrapping and plain nested include data according to ACI-01.
4. Verify grouping carries include descriptors as data without dispatching inner client calls.
5. Verify reference-bearing descriptors are rejected from unsupported execution/grouping positions and foreign-adapter behavior follows the agreed contract.
6. Keep integration fixtures focused; do not duplicate unit cases that do not cross a package or transport boundary.

Acceptance criteria:

- Direct and grouped parent queries produce equivalent data and controlled errors for all seven builders.
- Recorded network traffic contains no standalone inner query.
- Literal `$` strings and escaped marker-shaped objects round-trip correctly.
- Nested references bind to the immediate parent, including when the outer and inner parents have different values for the same field name.
- Legacy includes and ordinary service calls continue to pass existing parity tests.

Verification: V1 integration matrix; both package suites in V2.

#### ACI-05 Completion

- Status: completed. ACI-01 contract and ACI-02/ACI-03/ACI-04 evidence
  honored strictly; no ACI-06/ACI-07 work started (no README/`llms.txt`/
  website/CHANGELOG/OpenAPI edits).
- Changed files:
  - `packages/access-router-client/test/access-router-client.correlated-includes.integration.test.ts`
    (new, 42 tests) — the only production-adjacent change. Self-contained
    real-server fixture (own MongoMemoryServer, express app with recording
    middleware, `createAccessRuntime` with User/Org/Team/Post/GuardTarget
    models, client adapter): User parents carry `orgId`/`teamSlug`/
    `managerId`/`region`/`targetKey`; Org is the default-`_id` read target;
    Team uses custom `idField: 'slug'`; Post is the list/count target (with
    `region` colliding with User.region and a Mixed `note` holding the
    literal `{ $parent: 'x' }`); GuardTarget requires per-op permissions
    (`canReadT`/`canListT`/`canCountT`) with per-op tenant row filters.
    Conversion-only, option-forwarding, and type-position coverage stays in
    the ACI-04 unit files; server execution semantics stay in the ACI-03
    server file — nothing that does not cross the package/transport
    boundary is duplicated here.
  - This task file (ACI-05 section status flip plus this completion
    record). No CHANGELOG, no `dist/` hand-edits.
- ACI-05 implementation decisions (within ACI-01 latitude):
  - Grouped root envelope adds depth levels around the same include
    template, so multi-include and nested templates exceed the default
    `maxDepth` 8 over `/api/root` while passing direct; the fixture sets
    `requestComplexity: { maxDepth: 12 }` (recorded as FU-ACI05-1). The
    default bound itself stays covered by the server suites.
  - A bare-position `$escape` literal with `$`-keys resolves to a literal
    Mongo operator object and the driver fails it with
    `unknown operator: $parent` (500); the `$eq`-wrapped form
    (`{ note: { $eq: { $escape: { $parent: 'x' } } } }`) matches literally
    end-to-end (recorded as FU-ACI05-2).
- Verification performed (working directory
  serial per AGENTS.md):
  - `pnpm --filter @web-ts-toolkit/access-router... build` — pass.
  - `pnpm --filter @web-ts-toolkit/access-router-client... build` — pass.
  - `pnpm --filter @web-ts-toolkit/access-router-client exec vitest run
--config ../../vitest.config.ts
test/access-router-client.correlated-includes.integration.test.ts` —
    42/42 pass.
  - `pnpm --filter @web-ts-toolkit/access-router test` — 50 files,
    473 tests, all pass (legacy regressions green).
  - `pnpm --filter @web-ts-toolkit/access-router-client test` — full V2+V3:
    typechecks (source, test-typecheck, NodeNext-strict, Bundler-strict)
    pass; vitest 33 files / 517 tests pass (incl. the new 42 and the
    pre-existing real-server protocol-parity matrix); browser smoke 10/10
    pass.
  - `pnpm eslint` over the new test file — clean;
    `git diff --check` — clean.
- Acceptance evidence: (1) all seven builders convert to the D6 wire
  payloads (deep-equal vs hand-written raw equivalents, zero HTTP at
  conversion) and descriptor-built vs raw direct executions return equal
  `raw`, as do grouped executions, with direct-vs-grouped `raw` equality
  per builder; read/list/count guard denials, count-with-list-perm denial,
  and unknown-model payloads are `success: false` with status 401/401/400
  in both executions. (2) Every execution asserts exactly one recorded
  request (`POST /api/aci5-users/__query` direct, `POST /api/root`
  grouped) whose grouped `args.include` deep-equals the wire payload —
  no standalone inner query exists. (3) `title: '$special'` matches the
  seeded literal post; `$eq`-wrapped `$escape` matches the seeded
  `note: { $parent: 'x' }` post with the escape shape verbatim in the
  recorded body and the stored marker-shaped object returned literally.
  (4) Nested owner read on colliding field `region` resolves to the
  post's `inner-rx` (user u3), not the outer user's `outer-r1`, direct
  and grouped. (5) The pre-existing protocol-parity matrix passes
  unchanged inside the green 33-file client run; the new file adds one
  ordinary no-include call smoke. Outer wrapping preserved
  (`success/status/message`, outer docs Model-wrapped with `save`,
  nested docs plain and equal to `raw`); reference-bearing descriptors
  are rejected from `adapter.group()` with zero HTTP; foreign-adapter
  descriptors execute on the outer server (transport-inert); `$include`
  is absent on create/update/delete/distinct/data-service probes.
- Follow-ups (deferred, non-blocking): FU-ACI05-1 — direct/grouped depth
  accounting differs by the root envelope (nested/multi-include templates
  valid direct can exceed default `maxDepth` 8 grouped); decide whether
  to normalize accounting server-side or document the headroom (owner
  ACI-07, docs ACI-06). FU-ACI05-2 — bare-position `$escape` literals
  with `$`-keys fail at the Mongo driver (`unknown operator`); document
  the `$eq`-wrapped spelling in ACI-06 and consider server-side
  auto-wrapping of escape literals like ACI-02 substituted objects
  (owner ACI-06/ACI-07).

### Task ACI-06: Publish Discoverable Types And Documentation

Status: completed

Kind: improvement

Priority: P2 — installed consumers need an accurate, self-contained public contract.

Dependencies: ACI-05

Primary ownership:

- Both packages' public exports, README, and `llms.txt`.
- Public API JSDoc and declaration-consumer fixtures.
- Relevant pages under `website/docs/packages/access-router` and `access-router-client`.
- OpenAPI descriptions and `CHANGELOG.md`.

Finding: installed consumers rely on shipped declarations and README files. Website-only examples would not explain the new API after installation. Both package manifests publish README, llms guidance, and built declarations/runtime output.

References: both `package.json` files and `src/index.ts` entrypoints; existing export/documentation/packed tests listed in V3; client `vitest.browser.config.ts`.

Requirements:

1. Document all seven methods, canonical imports, reference scope, literals, identifier behavior, and result shapes.
2. Explain legacy batch pagination versus correlated per-parent pagination; document query costs and execution limits without claiming unmeasured performance.
3. Document supported options, source-field policy, missing/no-match behavior, descriptor lifetime, and client/server version requirements.
4. Ensure public helpers and types are reachable without deep imports. Verify useful JSDoc survives declaration generation.
5. Document actual output inference and its limitations, including partial projections and plain nested values.
6. Update release notes and API schema descriptions alongside implementation. Keep public-surface/export inventories synchronized without adding unnecessary entrypoints.

#### ACI-06 Completion

- Status: completed. ACI-01 contract and ACI-02..ACI-05 evidence honored
  strictly; no behavior code touched (docs, fixtures, and mapping only).
  CHANGELOG.md / release-notes file edits skipped per explicit user
  constraint (recorded as FU-ACI06-1); requirement 6 is otherwise met via
  API schema-description prose (website `openapi` page + shared validation
  schema section) and synchronized export inventories.
- Changed files:
  - `packages/access-router-client/README.md` — new "Correlated Includes"
    section (all seven builders, scope, literals/`$escape`, identifier
    behavior, result shapes, per-parent pagination, zero-HTTP conversion,
    descriptor lifetime, transport-inertness, path-first generic
    `$include<'org', Org>('org')`, server-version requirement); Primary
    Exports block now documents `parentField`, `CorrelatedIncludeError`,
    and the correlated types (`ParentRef`, `CorrelatedInclude`,
    `CorrelatedIncludeOp`, `CorrelatedIncludeArgs`,
    `CorrelatedFilterQuery`, `SupplementalIncludeOptions`,
    `WithCorrelatedOutputs`).
  - `packages/access-router-client/llms.txt` — correlated-includes pattern
    - notes; locked export list extended with the two runtime values and
      the correlated types (incl. `Includable*` mixins and descriptor types
      already covered by the exports test).
  - `packages/access-router-client/test-docs-consumer/examples/correlated-includes.ts`
    (new) — compilable fixture covering every executable line of the new
    README/llms.txt/website blocks, incl. the path-first generic spelling.
  - `packages/access-router-client/test-docs-consumer/examples/readme-exports.ts`
    — synced byte-identical to the updated README exports block (exact
    classification).
  - `packages/access-router-client/test-docs-consumer/snippets-mapping.md`
    — 5 new `derived` rows (README #2, llms #4, services.mdx #3/#4) plus
    ordinal/hash updates for the shifted README-exports (`exact`) and
    services.mdx rows; fixtures table documents `correlated-includes.ts`.
  - `website/docs/packages/access-router-client/services.mdx` — "Correlated
    Includes" section (seven-method table, two compilable examples, scope,
    options allowlist, source-field policy, bounds, typing, version note).
  - `website/docs/packages/access-router-client/typescript-and-errors.mdx`
    — "Correlated Include Output Typing" (path-first rationale, promised vs
    not-promised inference, `CorrelatedFilterQuery` positions, strict-shape
    rejection, `$$sq`/escape-hatch coexistence). Prose-only, no new
    compile-gated blocks.
  - `website/docs/packages/access-router-client/index.md` — exposes list +
    guide pointers mention correlated includes.
  - `packages/access-router/README.md` — "Correlated Includes" section
    (wire shapes as JSON, scope, missing/no-match, identifier/count
    semantics, per-parent pagination vs legacy batch, bounds, denials,
    select enrichment/trimming, validator agreement, canonical
    `advanced`-entrypoint imports). No new ```ts blocks (doc-example gate
    unaffected).
  - `packages/access-router/llms.txt` — correlated-includes prose (no new
    TS blocks).
  - `website/docs/packages/access-router/services.mdx` — "Correlated
    Includes" execution notes; `configuration.mdx` — "Request Complexity
    And Correlated Limits" (`maxCorrelatedQueries`/`maxCorrelatedDepth`
    defaults, revalidation, scheduler sharing, cost guidance without
    measured claims); `validation.mdx` — "Include Validation (Legacy And
    Correlated)"; `openapi.mdx` — include schema-description prose
    (legacy + correlated shapes share `includeItemSchema`, so documented
    shape and runtime verdicts agree); `routing.mdx` — root-entry include
    parity note; `index.mdx` — advanced-entrypoint wire-type pointer.
  - No new entrypoints; no production-code changes. Server wire types
    (`ParentRef`, `CorrelatedInclude`, `Include`) verified reachable via
    `@web-ts-toolkit/access-router/advanced` in emitted
    `dist/advanced.d.mts`; client `parentField` + 31 correlated declaration
    lines verified in client `dist/index.d.mts`; packed tarball contains
    updated README.md + llms.txt.
- Verification performed (working directory
  serial per AGENTS.md):
  - `pnpm --filter @web-ts-toolkit/access-router... build` — pass.
  - `pnpm --filter @web-ts-toolkit/access-router-client... build` — pass.
  - Client docs compile gate
    (`test/access-router-client.docs.compile.test.ts`) — 2/2 pass
    (block-map agreement incl. 5 new rows; packed-tarball strict NodeNext
    - Bundler compile of all fixtures incl. new `correlated-includes.ts`).
  - Server `test/documentation-examples.test.ts` — 16/16 pass.
  - `pnpm --filter @web-ts-toolkit/access-router test` — 50 files,
    473 tests, all pass (export-contract, strict-consumer-types,
    packed-consumer suites green).
  - `pnpm --filter @web-ts-toolkit/access-router-client exec vitest run
--config ../../vitest.config.ts` — 33 files, 517 tests, all pass
    (exports, packed-consumer, declaration-consumer, protocol-parity
    suites green). One earlier combined `pnpm test` invocation showed a
    transient single-file failure with 42 skips (the ACI-05 integration
    file's count); the immediate focused rerun (42/42) and full rerun
    (33/33, 517/517) are green, so it is recorded as a flake, not a
    regression.
  - Browser smoke (`vitest.browser.config.ts`) — 10/10 pass.
  - `pnpm eslint` over both new/changed fixtures — clean;
    `git diff --check` — clean.
- Acceptance evidence: (1) new README/website examples compile against the
  packed tarball under strict NodeNext + Bundler (docs.compile gate); the
  installed README alone teaches the happy path (imports, seven builders,
  scope, literals, result shapes). (2) NodeNext/Bundler consumers discover
  `parentField`/`CorrelatedIncludeError`/correlated types from the root
  (exports test + packed declaration probes green); CJS/ESM packed-consumer
  and browser smoke pass. (3) README, declarations (`dist/*.d.mts`
  inspected), shared validation schema prose, and runtime behavior agree;
  no new entrypoints were added and both export inventories are unchanged
  in code (docs mirror them).
- Follow-ups (deferred, non-blocking): FU-ACI06-1 — CHANGELOG.md / release
  notes update skipped per user instruction; a release-notes edit stating
  the minimum correlated-capable server version (ACI-01 D11.4) is still
  owed at release time (owner: release manager). FU-ACI06-2 — bare-position
  `$escape` literals with `$`-keys fail at the Mongo driver (FU-ACI05-2);
  docs prescribe the `$eq`-wrapped spelling; consider server-side
  auto-wrapping (owner ACI-07).

Acceptance criteria:

- Examples compile against packed packages; consumers can learn the happy path from the installed README and declarations alone.
- NodeNext and Bundler consumers discover the intended API; CJS/ESM imports and existing browser smoke checks pass.
- README, declarations, schemas, release notes, and runtime behavior agree.

Verification: V3 plus package checks in V2.

### Task ACI-07: Complete Independent Integration Review

Status: completed

Kind: investigation

Priority: P1 — final correctness and release gate.

Dependencies: ACI-01, ACI-02, ACI-03, ACI-04, ACI-05, ACI-06

Primary ownership: acceptance review, task evidence, and final integration checks.

Finding: this feature spans query syntax, runtime authorization, recursion, lazy client composition, and published types. Correct individual conversions do not establish end-to-end compatibility.

References: ACI-01 contract, ACI-02 through ACI-06 completion evidence, legacy regression tests, and V1 through V4.

Requirements:

1. Use a reviewer/session distinct from the main implementer where practical.
2. Verify every acceptance criterion against runtime or consumer-test evidence.
3. Review alternate entry paths, authorization, literal/reference separation, nested limits, option forwarding, and legacy compatibility.
4. Confirm no public type promises unsupported execution, reference scopes, output inference, or nested model behavior.
5. Record newly discovered independent work as explicit follow-up tasks with priority, ownership, dependencies, acceptance criteria, and verification.
6. Run V4 after package and packed-consumer checks; reuse current passing evidence unless intervening changes require reruns.

Acceptance criteria:

- All required checks pass, or this task remains blocked with exact prerequisites and unverified criteria recorded.
- Each completed task records changed files, commands, results, and follow-ups.
- No unresolved contract or cross-package compatibility issue remains hidden; deferrals state their rationale and residual impact.

Verification: V2, V3, V4, and evidence review.

#### ACI-07 Completion

- Status: completed. Reviewer/session note: ACI-05 was executed in an
  isolated sub-agent session as requested. The `general` sub-agent channel
  then failed repeatedly with a provider-side error
  (`invalid_request_error: reasoning encrypted_content was not issued to
this caller`, 3 attempts for ACI-06), so ACI-06 and this ACI-07 review
  were performed in the main session with an `explore` sub-agent used for
  the ACI-06 docs-scope survey. This deviation is recorded here rather
  than hidden; follow-up FU-ACI07-1 tracks re-confirmation if an isolated
  re-review is later possible.
- Acceptance-criterion verification (against runtime or consumer-test
  evidence, not conversion alone):
  - ACI-02: direct/root validator agreement asserted per payload
    (`expectAgreement` across `listBodySchema`, `readFilterBodySchema`,
    `readByIdBodySchema`, three root entry shapes); multi-ref,
    `$and`/`$or`, explicit `$in`, dotted paths, `$escape`, missing/null
    short-circuit covered (13 validation + 18 resolver tests); `$eq`-wrap
    keeps operator-shaped parent values data; `'$special'`/`'$parent'`
    round-trip unchanged; full server suite green proves legacy
    compatibility.
  - ACI-03: two parents get independently correct sorted/limited lists
    with relationship fields omitted from projection; `slug` custom-id
    reads; identifier denial with zero persistence lookups; read/list/count
    guard distinction (each 401 with zero target queries), row filters,
    field policies; allowed/omitted/forbidden source refs resolve without
    leaking; sibling-output snapshot isolation; nested immediate-parent
    binding; post-substitution `$in` and `maxCorrelatedQueries` bounds with
    measured query counts; direct `__query` / root batch / internal
    `_list` agreement (12 execution tests + 46 related + 7 complexity
    tests, full 50-file/473-test suite green).
  - ACI-04: all seven builders compile and deep-equal the D6 payloads;
    scalar/date/numeric/array positions have compile-enforced
    positive/negative tests; zero-HTTP conversion proven by
    stub-transport counters; `$include` present only on the seven builders
    (runtime + type probes); basic/advanced filter exclusivity at compile
    time and runtime; defaults/nesting/repeat-conversion/ownership/`$$sq`
    coexistence covered (35 + 14 tests); protocol-parity suite unchanged.
  - ACI-05: 7x4 direct/grouped equivalence matrix (descriptor vs raw,
    direct vs grouped) incl. controlled read/list/count denials and
    unknown-model errors; exactly-one-recorded-request per execution (no
    standalone inner query); `'$special'` + `$eq`-wrapped `$escape`
    round-trips; colliding-`region` nested binding; legacy parity matrix
    green (42 integration tests; 33-file/517-test client run green).
  - ACI-06: packed-tarball strict NodeNext + Bundler compile of all new
    examples (docs.compile 2/2); server documentation-examples 16/16;
    export/packed/decl/browser-smoke suites green in the package runs;
    emitted `dist/advanced.d.mts` verified to re-export
    `ParentRef`/`CorrelatedInclude*`/`Include`/`LegacyInclude`; client
    `dist/index.d.mts` carries `parentField` + correlated types; packed
    tarball contains updated README/llms. CHANGELOG/release-notes file
    edits skipped per explicit user constraint (FU-ACI06-1).
- Alternate-path / boundary review: direct HTTP, root HTTP, and internal
  service entries agree (ACI-03/05); per-op authorization (read/list/count
  guards, row filters, field policies, identifier denial) denies without
  persistence lookups; literal/reference separation holds end-to-end
  (`$special`, `$escape`, `$eq`-wrap; bare-position `$escape` with `$`-keys
  is a known driver-level failure, documented, FU-ACI05-2); nested limits
  (`maxCorrelatedDepth`, immediate-parent binding incl. same-field-name
  collision) enforced; option forwarding follows explicit-throw vs
  inherited-drop with per-op allowlists; legacy includes unchanged
  (validation + execution + parity suites green).
- Type-promise review: `$include<'path', Out>` path-first order documented
  with rationale; reads typed nullable, lists array, counts number; plain
  (never `Model`-wrapped) values; no projection inference, no guaranteed
  read match, no parent-path validation without a parent type; descriptors
  promise only enforceable restrictions (brand-checks, no executor);
  unsupported operations do not advertise `$include()`. No over-promising
  found.
- V4 (serial): `pnpm build` — pass (through `apps/react-vite`). `pnpm
test` — all packages pass EXCEPT an unrelated baseline flake:
  `packages/express-runtime test/watch-supervisor.test.ts ERT-B07` (POSIX
  subprocess signal-timing, 5s timeout) failed once in the full serial run
  and passes in isolation (16/16); changed files are confined to
  `docs/tasks`, `packages/access-router{,-client}`, `website/docs`
  (verified via `git status`), so it cannot be a regression from this
  feature. Affected-package evidence reused per the task's rerun rule (no
  production changes since the green runs; only this task file edited):
  server 50 files/473 tests pass; client 33 files/517 tests + browser
  smoke 10/10 pass. `pnpm lint` — pass (exit 0). `git diff --check` —
  clean. No CHANGELOG edits; no `dist/` hand-edits.
- Follow-ups (all deferred, non-blocking): FU-ACI01-1..3 (populate
  contract, old-server hardening, bound tuning), FU-ACI02-1/2 (select
  enrichment wiring already done in ACI-03; substituted `$$sq` inertness
  confirmed in ACI-03), FU-ACI03-1/2 (template `$$sq` semantics,
  budget-overshoot quantum), FU-ACI04-1..3 (docs spelling — done in ACI-06;
  `$all`/`$elemMatch` typed operators; bare-array runtime forwarding),
  FU-ACI05-1 (direct/grouped depth accounting), FU-ACI05-2/`FU-ACI06-2`
  (bare `$escape` driver failure → documented `$eq` spelling; consider
  server auto-wrap), FU-ACI06-1 (CHANGELOG/release-notes + minimum server
  version owed at release time), FU-ACI07-1 (isolated-session re-review of
  ACI-06/07 if sub-agent channel recovers; residual risk: reviewer and
  implementer shared one session for docs — mitigated by gate-enforced
  compile checks and declaration inspection recorded above).

## Definition Of Done

- All seven builders work against the updated backend.
- Explicit references and literal values remain distinguishable.
- Identifier behavior, operation-specific authorization, nested scope, and per-parent pagination match the documented contract.
- Correlated execution is bounded and legacy behavior remains covered.
- Published exports, declarations, documentation, and runtime behavior agree.
- All tasks have completion evidence and required checks pass.

## Maintaining This Document

Follow the task-as-you-go skill. When starting work, mark a task `in_progress` only after dependencies are complete. When blocked, record the exact prerequisite or decision, its owner, delivered work, and unverified criteria.

When completing a task, append changed files, verification commands/results, acceptance evidence, and follow-up task IDs. Do not mark implementation complete solely because code or this document was written. Keep historical findings intact and add resolution evidence rather than rewriting the baseline.

Current unresolved design decisions are bounded by ACI-01; all implementation tasks (ACI-01 through ACI-07) are completed with evidence recorded above. Open deferrals are tracked as FU-\* follow-ups in the per-task completion records.
