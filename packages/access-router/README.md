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

**Model service denial contract:** internal `findOne`/`find`/`updateOne`/`upsert`
`args.overrides.filter` and `findById`/`updateById` `args.overrides.idFilter` distinguish
`false` from omitted/`undefined`/`null`. False returns a `forbidden` ErrorResult without
fallback filter/identifier generation or persistence (including client subqueries).
Nullish overrides use normal generation. Trusted object filter overrides replace the
generated filter; object **idFilter** overrides replace identifier resolution but still
receive row policy. These service arguments are trusted application inputs.

`Service.exists(filter, { access: 'read', includeId: false })` returns a successful
boolean for allowed queries; `includeId: true` returns an `{ _id }` record or `null`.
Explicit/base/override terminal false now returns `forbidden` **before adapter dispatch**
in both modes, rather than a successful false/null. An allowed filter that matches no
visible row is still a successful miss. Check `result.success` before using `result.data`.

Public `_read` and `_readFilter` with `tryList: true` (the default) never retry Forbidden
or BadRequest. An authorized read miss can still fall back to list policy, subject to
list operation access. This deliberately removes list fallback for terminal read denial.
Public `_upsert` with an `_id` propagates denied update-policy existence as Forbidden
(previously Unauthorized); an allowed miss remains Unauthorized and neither case creates.
Generated direct routes map Forbidden to HTTP 403; root batches use per-entry 403 within
HTTP 200. **Custom Express routes own HTTP serialization:** returning an ErrorResult or
calling `res.json(result)` does not automatically set HTTP 403; map its code explicitly.

Advanced mutation validators drive dispatch: nested `data` validators run first, then the whole-body (`default`)
validator sees that transformed envelope, and the service persists only the final parsed `data`, `select`,
`populate`, `tasks`, and allowed `options`. Missing body options fall back to `returning_all`/`include_permissions`
query params; only `includePermissions`/`includeFieldPermissions`/`populateAccess` (plus `returningAll` for update/upsert) are forwarded.

## Basic model GET queries

`GET /users?select=name&sort=name%20-createdAt` projects `name` and sorts by
name ascending, then createdAt descending. GET list `sort` is a single
space-separated signed-field string; `-` means descending. Sorting runs before
pagination and can use permitted fields omitted from `select`. Malformed or
disallowed sort fields return HTTP 400 before the model query executes.

Model options `sortableFields` allow additional sorting fields without granting
output visibility, and `stripDisallowedSort: true` drops disallowed sort keys
instead of rejecting the request (malformed fields still fail). When no sort is
supplied, normal model service defaults apply; `?sort=` explicitly disables them.
GET-by-id reads also accept `select` as a query param.

Two router options lock down permission metadata regardless of client input or
per-operation `defaults`: `stripPermissionsField: true` removes the whole
permissions field from outputs (equivalent to `includePermissions: false` with
the field — including its placeholder — deleted; enforcement still runs), and
`disableFieldPermissions: true` never computes `_view`/`_edit` maps while still
honoring `includePermissions` for `docPermissions`-hook keys.

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

- `@web-ts-toolkit/access-router/advanced` — request/service/option interfaces and include wire types, symbols (`MIDDLEWARE`, `DATA_MIDDLEWARE`, `PERMISSIONS`, ...), enums (`Codes`, `StatusCodes`), and validation helpers (`parseBody`, `parseQuery`, `parseBodyWithSchema`, request schemas). Runtime-context functions are internal; use root exports such as `createAccessRuntime`, `AccessRuntime`, and `defaultRuntime` for runtime ownership. `/advanced` does not export runtime instances or router-creation helpers.
- `@web-ts-toolkit/access-router/processors` — `copyAndDepopulate`, `copyPaths`, `movePaths`, `sliceArrays`, `countPaths`, `maskPaths` and processor option types (`ProcessCopy`, `CopyAndDepopulateOptions`, `CopyAndDepopulateOutput`, `ProcessorOptions`, `SliceProcessorOptions`, `ProcessSlice`, `ProcessCount`, `ProcessMask`, `ProcessorOutput`) for transforming populated documents.

## AJV validation contract

Install `ajv` in your application when using `fromAjv`; it is not a mandatory
access-router runtime dependency. Import the helper and `AjvValidatorLike` type
from `@web-ts-toolkit/access-router`.

- Synchronous validators return boolean **verdicts**: true returns the input
  (including any in-place AJV mutations), false returns normalized issues. Mutable
  `validate.errors` are snapshotted before any suspension or next validation call.
- Validators tagged `$async: true` return promises/thenables of **validated data**.
  Every fulfillment succeeds, including `false`, `true`, `null`, scalars and objects;
  the fulfilled value is returned, not substituted with the input. Shared
  `validate.errors` is never read on this path. Real AJV `ValidationError` rejections
  (`ajv: true`, `validation: true`, an `errors` array) provide input-local diagnostics
  under concurrency. Other exceptions propagate unchanged as operational failures.
- Untagged promises/thenables now reject with a configuration `TypeError`; their
  rejections are observed to avoid unhandled rejection. Sync non-boolean results
  also reject with `TypeError`.

<!-- doc-example: complete-runtime -->

```ts
import { Ajv, type AsyncSchema } from 'ajv';
import { fromAjv } from '@web-ts-toolkit/access-router';

const ajv = new Ajv();
const sync = fromAjv<boolean>(ajv.compile<boolean>({ type: 'boolean' }));
const asyncSchema: AsyncSchema = { $async: true, type: 'boolean' };
const asyncData = fromAjv(ajv.compile<boolean>(asyncSchema));
const syncResult = await sync(false);
const asyncResult = await asyncData(false);
if (!syncResult.success || syncResult.data !== false || !asyncResult.success || asyncResult.data !== false) {
  throw new Error('Both AJV validators must preserve valid false data');
}
```

**Migration:** pass genuine compiled AJV sync/async validators directly, without
casts or wrappers that discard `$async`. `AjvValidatorLike<T>` now separates sync
boolean and tagged async data signatures; use a literal tag (`$async: true as const`)
for structural async adapters. An async boolean-verdict wrapper must instead return
the original validated data or reject with an AJV validation error; merely adding
the tag changes false/true into successful data. Alternatively implement a
`RequestSchemaValidator` returning `{ success, data }` / `{ success: false, issues }`.
Rejections with only an `errors` property are operational, not AJV validation errors.
AJV's overloaded `AsyncValidateFunction<T>` extends its sync `ValidateFunction<T>`;
TypeScript can erase the tag in that base type, so runtime checks remain necessary.
Genuine AJV sync/async output types are inferred via their type-guard overload;
structural async output is inferred from the promise. Use `fromAjv<T>(syncValidator)`
for a structural boolean validator without a type guard. An inline schema can select AJV's earlier
sync overload even with `$async: true`; an `AsyncSchema`-typed schema, as above,
selects its async overload without casts (also for `compileAsync`). Runtime
behavior follows the validator's actual tag in either case.

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

Legacy count joins use one grouped aggregate for all parents per include execution.
They count distinct target documents in the authorized count scope: duplicate local
keys, repeated foreign array entries, or one document matching multiple local keys
do not inflate a parent's count. No matches produce `0`.

The target Mongoose schema casts both the complete authorized filter (including
tenant filters) and foreign-key operands, including after array unwind. ObjectId/String
joins and query setters retain association to the original parent keys. Invalid
schema operands/filters produce controlled `BadRequest` (direct HTTP 400; root entry
`statusCode: 400`, `code: 'bad_request'`) rather than misleading zero counts. Count
operation denials still prevent target work; a terminal `false` count row policy
retains legacy omitted include output and a grouped-service Forbidden result.

This is query-schema/setter parity, not execution of `countDocuments` middleware or
plugins: casting is synchronous and performs no query. Aggregate middleware still
belongs to the aggregate operation. Express router count authorization through
`operationAccess` and row-filter hooks. Arbitrary pipelines passed to
`router.model.aggregate(...)` are not automatically cast.

### Safe include output paths

Treat `path` as output only: put an invoice's related count at `lineItemCount`, for
example, rather than inside permission metadata. Legacy and correlated read/list/count
paths must not equal, descend from, or be an ancestor of the receiving model's
`documentPermissionField` (default `_permissions`). With `auth.policy.permissions`,
`auth`, `auth.policy`, and `auth.policy.permissions.canReadSecret` all reject;
`auth.policy.permissionsExtra` is an ordinary sibling. Equivalent legacy bracket
paths follow the same rule.

The include tree is preflighted before target persistence, including every supported
nested level using that receiving target's configuration. Overlaps return BadRequest
(direct HTTP 400; affected root entry 400/`bad_request` within its HTTP 200 batch
envelope), even if the relationship would be empty. Malformed reads do not retry
through list access. Ordinary output-field replacement remains supported; generated
include data cannot grant source-field permission.

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
`{ "$escape": { "$parent": "x" } }`. In a bare field position,
`{ "note": { "$escape": { "$parent": "x" } } }` resolves to
`{ "note": { "$eq": { "$parent": "x" } } }`, just like bare substituted
parent objects. The explicit spelling
`{ "note": { "$eq": { "$escape": { "$parent": "x" } } } }` remains
equivalent. Operator operands and array elements receive the literal object
without another `$eq` wrapper. Escapes are resolved once and never read parent
data; missing, null or changed `parent.x` cannot change the literal. Malformed
escapes are rejected, and expanded operands still consume complexity budgets.
This bare-position correction requires an updated server; older servers with
the bare-escape defect still require the explicit `$eq` spelling.

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
  `maxLogicalClauses`. Total inner executions per request/runtime are bounded by
  `maxCorrelatedQueries` (default `100`) and nesting by
  `maxCorrelatedDepth` (default `5`); exceeding any bound fails the whole
  request/affected root entry. Fan-out shares request-and-runtime-owned
  persistence admission (see below). Target authorization denials fail the
  request/affected root entry with zero target persistence queries; target
  runtime errors also fail that request/entry.
  `path` must be a non-empty valid field path (not `_id`, not `$`-prefixed);
  duplicates in one include array are `BadRequest`; collisions with parent
  fields overwrite except for the permission-metadata overlaps described above.
- Referenced parent fields are added to the parent DB select like legacy
  `localField`s, then trimmed unless allowed by field policy and selected.
  A policy-forbidden reference still resolves — only its query effects are
  visible, never the value.
- Direct count parents carry no `include`; correlated _count_ includes
  attach to read/list parents only. Correlated entries are accepted in both
  direct (`model-router.ts`) and root (`root-router.ts`) validators with
  identical verdicts; malformed correlated input is a controlled
  `BadRequest`, never a silent drop. Legacy entries also enforce safe output paths, and
  legacy-shaped entries carrying `$parent` markers are rejected.

The TypeScript wire types (`ParentRef`, `CorrelatedInclude`, `Include`) are
reachable without deep imports via `@web-ts-toolkit/access-router/advanced`
(which re-exports `./interfaces`). See the website `services`,
`configuration`, `validation`, and `openapi` pages for the full contract.

## Nested updates and trusted hooks

Partial updates follow **authorized policy paths**, not a generic deep merge. For a
customer profile editor, grant only the editable leaf and send nested JSON:

<!-- doc-example: partial -->

```ts
import type { ModelRouterOptions } from '@web-ts-toolkit/access-router';

// Non-generic options accept dotted policy paths.
const options: ModelRouterOptions = {
  operationAccess: { update: true },
  permissionSchema: { 'profile.public': { update: true } },
};
const updateBody = { profile: { public: 'New display name' } };
// Pass options to acl.createRouter(CustomerModel, options); send updateBody to PATCH.
// Existing profile.secret and omitted siblings survive.
void [options, updateBody];
```

This applies to `updateOne`, `updateById`, existing-row upsert, and single/bulk
subdocument updates, including Mongoose nested and single-nested schemas. Authorized
leaves can initialize missing/null containers. Authorizing `profile` itself instead
allows whole replacement and removes omitted children; whole grants take priority
over overlapping leaf grants. An authorized object leaf replaces just that leaf.
Arrays replace as a whole when authorized as a whole; an explicit `items.0.public`
grant patches that indexed leaf. Omitted fields remain unchanged, admitted `null`
clears the selected field, and authorized empty objects/arrays replace it (Mongoose
`minimize` may omit empty objects in storage). A null/empty/malformed client container
does not supply descendant leaves and cannot clear a protected parent. Casting and
validation still apply. Literal dotted/bracket client keys are ignored by field
selection; they are not `$set`/`$unset` instructions.

Model `prepare` and `transform` hooks are trusted application code. Validation sees
selected client data before prepare. Prepare output is not re-filtered: it can add
protected/server-only fields, including dotted Mongoose paths. At strict ancestors of
admitted paths, supplied children of plain-object/array prepare output are applied
while omitted siblings survive. Other prepare paths remain whole assignments.
An empty partial container or omitted parent does not delete siblings; explicit
`{ profile: null }` / `{ profile: undefined }` can clear/unset it. An entirely
null/undefined prepare result supplies no assignments.

For deliberate parent replacement, trusted `transform.update` can call
`doc.set('profile', replacement)`. Do not blindly reintroduce unfiltered
`context.originalData`. The update order remains validation → prepare →
assigned-document transform → save → afterPersist → changes; snapshots/diffs reflect
persisted changes. Subdocument operations retain their own lifecycle and do not gain
model prepare/transform hooks.

## Subdocument writes with hidden responses

Appending an attachment or updating a line item can succeed without permission to
read it. After saving, mutation responses require the parent's read operation/row
access, checked against post-save state. Full-array **create** responses (including
POST `[]`) additionally require both `subs.<sub>.list` and `.read` operation guards
and row filters. **Single/bulk update** responses require subdocument read access
only and return readable mutation targets; they do not require list access.

All three use read-field projection plus `_id`. Counts reflect visible returned
rows, not stored/updated totals. Filtering preserves stored array order, including
service `addFirst` insertion order; bulk request order does not reorder the response.
`addFirst` remains a service option, not a new generated HTTP option.

When a response guard denies access, a row policy returns `false`, or no readable
parent/rows match, the committed write still succeeds:

| Operation     | Service/root result fields                                         | Direct HTTP body/status; root entry status |
| ------------- | ------------------------------------------------------------------ | ------------------------------------------ |
| Create        | `success: true, kind: 'list', code: 'created', data: [], count: 0` | `[]`, 201; 201                             |
| Bulk update   | `success: true, kind: 'list', code: 'success', data: [], count: 0` | `[]`, 200; 200                             |
| Single update | `success: true, kind: 'single', code: 'success', data: null`       | JSON `null`, 200; 200                      |

Root batches retain their HTTP 200 envelope. **Do not retry a successful write just
because its output is empty.** Actual write denials and validation/persistence failures
retain their errors. Response visibility needs at most one extra parent query and
resolves applicable row policies once per mutation, rather than once per returned row.

## Persistence concurrency and resource limits

`requestComplexity.maxBulkConcurrency` (default `10`) bounds simultaneous awaited
**adapter/document persistence operations** for access-router model services sharing
one request and runtime. Direct service calls, root entries, subqueries, legacy
includes and nested correlated includes share admission. Different requests and
different runtimes have independent pools and correlated-query totals. Services
capture their owning runtime at construction; later ambient runtime changes do not
move their persistence to another pool.

Admission covers lazy adapter query settlement, document save/delete, and
service-triggered post-write populate. Bulk create submits one admitted singleton-array
adapter call per item, preserves result order, and still submits every item if one
rejects. Internal custom adapters must preserve array-in/array-out create semantics.
Their optional synchronous `castFilter` must cast a copy and preserve `$in` operand
order/cardinality; without it they retain identity casting.

Recursive orchestration holds no persistence permit while waiting for descendants,
so limit `1` supports nested includes. Internal map/run loops remain bounded per
invocation. `RootRouter.maxConcurrentOperations` separately bounds whole root
operations within each order group, with results in input-index order. Permits
release on success or error and pass FIFO to waiting work; release neither cancels
submitted siblings nor refunds the cumulative `maxCorrelatedQueries` budget (default
`100`). `maxCorrelatedDepth` (default `5`) separately bounds template nesting.

The ceiling is **not a MongoDB driver-command count**: one admitted operation can
run Mongoose middleware/populate that issues multiple commands. Router ACL, prepare,
afterPersist, decorate and recursive include orchestration are outside the permit;
Mongoose's own middleware runs inside the awaited operation. Direct database/network
calls from trusted hooks are not governed. This is neither a process-wide connection
pool limit nor a throughput guarantee. Controlled nested-query instrumentation reduced
peak active collection calls from 9 to 3 at limit 3 for the tested paths; it is not a
production benchmark or a guarantee about middleware/populate fan-out.

### Compatibility notes

These boundary fixes preserve public entrypoints and require no new dependency or
option. Move computed include output away from permission metadata. Nested leaf edits
now preserve protected siblings; prepare hooks relying on omission to delete a parent
must replace it explicitly in transform. Handle successful null/empty subdocument
responses as completed writes. Legacy counts now cast schema values and report invalid
operands as BadRequest; they remain grouped and independent of list pagination.
Persistence admission is shared across nested work within each request/runtime, so
timing may change. It does not provide transactions, idempotency or optimistic
concurrency protection for competing edits.

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
