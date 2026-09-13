# `@web-ts-toolkit/access-router`

ACL-aware Express routers and in-memory data services for Mongoose-backed APIs.

## Installation

```sh
pnpm add @web-ts-toolkit/access-router express mongoose
```

Peer dependencies:

- `express >= 5`
- `mongoose >= 8`

## Highlights

- generated model CRUD routers
- generated in-memory data routers
- access control, field permissions, and request-time hooks
- root batch router for grouped operations
- request validation adapters
- generated OpenAPI JSON and Swagger UI routes

## Quick Start

<!-- doc-example: partial -->

```ts
import express from 'express';
import mongoose from 'mongoose';
import acl, { permissionsPlugin } from '@web-ts-toolkit/access-router';

// 1. Configure how request permissions are resolved globally.
acl.setGlobalOptions({
  requestPermissionField: '_permissions',
  // Set to false only when legacy clients populate models without createRouter().
  requireRegisteredPopulateModels: true,
  globalPermissions(req) {
    return req.headers.user === 'admin' ? ['isAdmin'] : [];
  },
});

// 2. Register a Mongoose model and schema. The schema opts in to the
//    permissions plugin so generated routers can enforce field access.
const userSchema = new mongoose.Schema({ name: String, role: String, public: Boolean });
userSchema.plugin(permissionsPlugin, { modelName: 'User' });
const UserModel = mongoose.model('User', userSchema);

// 3. Create routers. Pass either the model name or the mongoose.Model
//    instance. Passing the instance preserves an explicit connection
//    (useful for multi-connection setups) and registers it with the
//    active runtime.
const userRouter = acl.createRouter('User', {
  basePath: '/users',
  operationAccess: { list: true, create: true, read: true, update: true, delete: true },
  permissionSchema: { name: true, role: 'isAdmin', public: true },
});

const fruitRouter = acl.createDataRouter('fruit', {
  basePath: '/fruit',
  idField: 'id',
  operationAccess: { list: true, read: true },
  data: [{ id: 'apple', name: 'Apple', public: true }],
  permissionSchema: { id: true, name: 'isAdmin', public: true },
});

const docsRouter = acl.createOpenApiRouter({
  title: 'Example API',
  version: '1.0.0',
});

// 4. Mount routers under an Express app.
const app = express();
app.use(express.json());
app.use(userRouter.routes);
app.use(fruitRouter.routes);
app.use(docsRouter);

// 5. Connect to MongoDB before accepting traffic. A failed connection throws
//    and exits before the server calls `app.listen`, so the service never
//    publishes routes it cannot serve.
const port = Number(process.env.PORT ?? 3000);
const mongoUrl = process.env.MONGODB_URL ?? 'mongodb://localhost:27017/example';
try {
  await mongoose.connect(mongoUrl);
} catch (err) {
  console.error(`Failed to connect to MongoDB at ${mongoUrl}:`, err);
  process.exit(1);
}

app.listen(port, () => {
  console.log(`API listening on http://localhost:${port}`);
});
```

In-memory data routers default `listHardLimit` to `1000`, matching model routers. A list request without
`limit`/`pageSize`, or with a malformed limit passed through a trusted service call, is capped at that finite
default unless the router sets `listHardLimit` explicitly. `meta.totalCount` still reflects the full authorized
match set when counts are requested; only returned rows are trimmed and decorated. Per-row data trim/decorate
hooks run with bounded concurrency controlled by `requestComplexity.maxHookConcurrency` (default `10`).
Runtime options and data-router records are copied when configured, and option getter results are frozen
snapshots. Mutating the original options object, a fetched options snapshot, or the original `data` array does
not change live runtime policy or served in-memory records. Replace configured data through `router.data(next)`
or `setDataOption(name, 'data', next)`.

ACL filter hooks may return `false` to deny a query. That denial is terminal through identifier, override, and
base-filter composition. `overrideFilter` is a trusted hook that may replace an ordinary client or identifier
filter before the base filter is applied, but it is not called for an existing `false` filter and cannot revive
that denial. Returning `false` from `overrideFilter` also denies the query. Empty or absent filters retain their
normal unrestricted meaning unless a base filter restricts them.

Advanced mutation validators drive dispatch: nested `data` validators run first, then the whole-body (`default`)
validator sees that transformed envelope, and the service persists only the final parsed `data`, `select`,
`populate`, `tasks`, and allowed `options`. Missing body options fall back to `returning_all`/`include_permissions`
query params; only `includePermissions`/`populateAccess` (plus `returningAll` for update/upsert) are forwarded.

## Main Exports

Root entrypoint (`@web-ts-toolkit/access-router`):

- default export `acl` — the default-runtime API (functions bound to the shared `AccessRuntime`)
- `createAccessRuntime()` — create an isolated runtime with its own options and model registry
- `AccessRuntime`, `RootRouter`, `ModelRouter`, `DataRouter` — router/runtime classes
- `registerModelInstance(name, model)`, `hasModelInstance(name)`, `getModelInstance(name)` — explicit runtime-owned model registry helpers
- `guard(...)` and `GuardModelCondition`, `GuardModelConditionID` types
- `combineRoutes(...)` and `createOpenApiRouter(runtime, options)` (note: prefer `acl.createOpenApiRouter(options)` for the default runtime)
- validation adapters: `defineRequestSchema(...)`, `fromZod(...)`, `fromYup(...)`, `fromJoi(...)`, `fromAjv(...)`, `fromStandardSchema(...)`, `fromValibot(...)`, `fromArkType(...)`, `fromIoTs(...)`, `fromSuperstruct(...)`, `fromVine(...)`
- `permissionsPlugin` (src/plugins.ts) — Mongoose schema plugin used as `schema.plugin(permissionsPlugin, { modelName })`
- logger helpers: `redactFilter`, `redactPayload`, `safeStringify`, `isLevelEnabled` + `OpLogContext` type
- option helpers: `setGlobalOptions`, `setGlobalOption`, `getGlobalOptions`, `getGlobalOption`, `setModelOptions`, `setModelOption`, `getModelOptions`, `getModelOption`, `getModelNames`, `getModelJsonSchema`, `setDefaultModelOptions`, `setDefaultModelOption`, `getDefaultModelOptions`, `getDefaultModelOption`

Subpath entrypoints:

- `@web-ts-toolkit/access-router/advanced` — low-level runtime context, symbols (`MIDDLEWARE`, `DATA_MIDDLEWARE`, `PERMISSIONS`, ...), enums (`Codes`, `StatusCodes`), internals (`parseBody`, `parseQuery`, `parseBodyWithSchema`, request schemas). Does NOT export `acl`, `defaultRuntime`, or router-creation helpers.
- `@web-ts-toolkit/access-router/processors` — `copyAndDepopulate`, `copyPaths`, `movePaths`, `sliceArrays`, `countPaths`, `maskPaths` and processor option types (`ProcessCopy`, `CopyAndDepopulateOptions`, `CopyAndDepopulateOutput`, `ProcessorOptions`, `SliceProcessorOptions`, `ProcessSlice`, `ProcessCount`, `ProcessMask`, `ProcessorOutput`) for transforming populated documents.

## Default runtime vs. isolated runtime

The default export `acl` is bound to a single shared `AccessRuntime`, which is fine for most services.
For tests, multi-tenant services, or libraries that must avoid global state, create an isolated runtime:

<!-- doc-example: complete-runtime -->

```ts
import mongoose, { type Model } from 'mongoose';
import { createAccessRuntime } from '@web-ts-toolkit/access-router';

type User = { name?: string };

const runtime = createAccessRuntime();
runtime.setGlobalOptions({ globalPermissions: () => [] });
const userSchema = new mongoose.Schema<User>({ name: String });
const UserModel: Model<User> = mongoose.model<User>('ReadmeRuntimeUser', userSchema);
const userRouter = runtime.createRouter(UserModel, { basePath: '/users' });

// `runtime.createDataRouter(...)`, `runtime.createOpenApiRouter(...)`,
// `runtime.registerModelInstance(...)`, ...
void userRouter;
```

Two isolated runtimes with the same model name resolve against their own model registry and options without interference.
An isolated runtime does not look up process-global `mongoose.models` by string name; pass a `mongoose.Model` instance
to `runtime.createRouter(model, options)` or call `runtime.registerModelInstance(name, model)` before constructing a
string-name router. The default `acl` runtime retains string-name compatibility with `mongoose.model(name, schema)` and
adopts that exact global model instance into its registry on first lookup.

Cross-runtime composition on a shared request keeps independent runtime-owned state. When one request passes through
middleware from runtime A and then runtime B, B initializes its own core, resolves its own `globalPermissions`, and
uses its own base-filter cache; it never reuses A's permissions or cached filters, even when both runtimes use the
same `requestPermissionField` name. Repeating the same runtime's middleware on one request reuses that runtime's state
without rerunning its resolver. Values already present in `requestPermissionField` before any runtime middleware runs
are treated as application-supplied and preserved. Migration: if you relied on B silently inheriting A's resolved
permissions on a shared request, set those permissions explicitly before the chain or configure B's `globalPermissions`
to resolve them.

## createRouter overloads

`createRouter(modelName, options)` — on the default `acl` runtime, accept the Mongoose model name registered with `mongoose.model(name, schema)`. On isolated runtimes, the name must already be registered with that runtime.

`createRouter(model, options)` — accept a `mongoose.Model` instance directly. The instance is registered with the active runtime's registry, so a model attached to a non-default `mongoose.createConnection()` works without polluting the global registry.

<!-- doc-example: partial -->

```ts
import mongoose from 'mongoose';
import acl, { permissionsPlugin } from '@web-ts-toolkit/access-router';

// `uri` is the MongoDB connection string for the non-default connection.
const uri = process.env.MONGODB_URL_TENANT ?? 'mongodb://localhost:27017/tenant';
const conn = await mongoose.createConnection(uri).asPromise();
const schema = new mongoose.Schema({ name: String });
schema.plugin(permissionsPlugin, { modelName: 'TenantUser' });
const TenantUser = conn.model('TenantUser', schema);

const tenantRouter = acl.createRouter(TenantUser, { basePath: '/tenant-users' });
```

## Include Cardinality

Advanced read/list requests can attach related model data with `include` entries.
`op: 'count'` returns exact authorized counts and ignores include pagination fields such as `args.limit`.
`op: 'list'` materializes authorized related rows through the target model's normal list path, so target `limit`, `page`, `pageSize`, and `listHardLimit` bounds still apply to included rows.

## Correlated Includes

Besides the legacy `localField`/`foreignField` joins, `include` entries accept
a correlated variant (`mode: 'correlated'`) that runs a target query **per
parent document** using values from that parent. References are explicit
structural markers — `{ "$parent": "<field>" }`, dotted paths allowed —
recognized only in filter _value_ positions (bare values, field operators
such as `$eq`/`$in`, `$in` array elements, `$and`/`$or`/`$nor` clauses,
`$elemMatch` subtrees) and as the whole `id` of identifier reads. Plain
strings are never references: `'$special'` keeps its literal query meaning.
Match a literal `{ "$parent": "x" }` object with
`{ "$escape": { "$parent": "x" } }` (use the `$eq`-wrapped form when the
literal sits in a bare field position).

Wire shapes (the originating method fixes `op`; there is no override):

```json
{ "mode": "correlated", "model": "Org", "op": "read", "path": "org", "id": { "$parent": "orgId" } }
{ "mode": "correlated", "model": "Org", "op": "read", "path": "org",
  "filter": { "_id": { "$parent": "orgId" }, "active": true }, "args": { "select": ["name"] } }
{ "mode": "correlated", "model": "Post", "op": "list", "path": "posts",
  "filter": { "authorId": { "$parent": "_id" }, "title": "$special" },
  "args": { "select": ["title"], "sort": { "createdAt": -1 }, "limit": 5 } }
{ "mode": "correlated", "model": "Post", "op": "count", "path": "postCount",
  "filter": { "authorId": { "$parent": "_id" } } }
```

Semantics:

- References resolve against the **immediate parent** document as fetched
  from persistence (including internally loaded reference fields), before
  include attachment, `decorate` hooks, and task mutation. Nested
  `args.include` entries bind to the target doc of the enclosing include.
  Sibling include output never feeds references.
- A missing (`undefined`) or `null` reference short-circuits that parent's
  execution to the no-match shape with no target query: `read` attaches
  `null`, `list` attaches `[]`, `count` attaches `0`. Target misses produce
  the same shapes. The output path is always set.
- Identifier reads use the target's configured identifier behavior
  (`resolveIdentifierFilter`/`genIDFilter`, custom `resolveIdFilter`
  honored) with no read-to-list fallback. Counts use explicit count access
  with count semantics, independent of any list limit. List pagination
  (`skip`/`limit`/`page`/`pageSize`) applies **per parent** — contrast with
  legacy batched list includes, whose pagination applies across the parent
  set. Substituted parent values are data: objects match literally (never
  become operators) and arrays are never flattened.
- Each correlated entry counts toward `maxIncludeCount`; expanded filters
  are revalidated against `maxNodes`/`maxDepth`/`maxInValues`/
  `maxLogicalClauses`. Total inner executions per request are bounded by
  `maxCorrelatedQueries` (default `100`) and nesting by
  `maxCorrelatedDepth` (default `5`); exceeding any bound fails the whole
  request. Fan-out shares the request-scoped scheduler (no per-parent
  reset). Target authorization denials fail the whole request with zero
  target persistence queries; target runtime errors fail the whole request.
  `path` must be a non-empty valid field path (not `_id`, not `$`-prefixed);
  duplicates in one include array are `BadRequest`; collisions with parent
  fields overwrite (legacy `setDocValue` parity).
- Referenced parent fields are added to the parent DB select like legacy
  `localField`s, then trimmed unless allowed by field policy and selected.
  A policy-forbidden reference still resolves — only its query effects are
  visible, never the value.
- Direct count parents carry no `include`; correlated _count_ includes
  attach to read/list parents only. Correlated entries are accepted in both
  direct (`model-router.ts`) and root (`root-router.ts`) validators with
  identical verdicts; malformed correlated input is a controlled
  `BadRequest`, never a silent drop. Legacy entries are unchanged, and
  legacy-shaped entries carrying `$parent` markers are rejected.

The TypeScript wire types (`ParentRef`, `CorrelatedInclude`, `Include`) are
reachable without deep imports via `@web-ts-toolkit/access-router/advanced`
(which re-exports `./interfaces`). See the website `services`,
`configuration`, `validation`, and `openapi` pages for the full contract.

## Import styles

The package ships both a default export and named exports:

<!-- doc-example: partial -->

```ts
// default export (preferred for the runtime API)
import acl from '@web-ts-toolkit/access-router';

// named exports (useful when you only need specific helpers)
import { createAccessRuntime, fromZod } from '@web-ts-toolkit/access-router';
```

### Subpath import example

<!-- doc-example: complete-runtime -->

```ts
import { copyAndDepopulate } from '@web-ts-toolkit/access-router/processors';

type DepopulatedItems = {
  items: string[];
  itemsSnapshot: Array<{ _id: string; name: string }>;
};

const { items, itemsSnapshot } = copyAndDepopulate<DepopulatedItems>(
  { items: [{ _id: 'a1', name: 'Apple' }] },
  [{ src: 'items', dest: 'itemsSnapshot' }],
  { mutable: false },
);
// `items` is now `['a1']`; `itemsSnapshot` holds the original objects.
```

Without an explicit output type, `copyAndDepopulate(...)` returns the conservative `CopyAndDepopulateOutput`
record because runtime `src` and `dest` path strings can replace populated objects with ids and add new fields.
Unsafe paths or records missing the configured id field throw plain `Error` instances with descriptive messages.

## Documentation

- live docs: https://web-ts-toolkit.pages.dev/docs/packages/access-router
- source docs live in the website/docs package of this repository; paths may move as the docs site evolves.
