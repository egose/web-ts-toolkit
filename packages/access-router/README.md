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

## Main Exports

Root entrypoint (`@web-ts-toolkit/access-router`):

- default export `acl` — the default-runtime API (functions bound to the shared `AccessRuntime`)
- `createAccessRuntime()` — create an isolated runtime with its own options and model registry
- `AccessRuntime`, `RootRouter`, `ModelRouter`, `DataRouter` — router/runtime classes
- `registerModelInstance(name, model)`, `hasModelInstance(name)`, `getModelInstance(name)` — explicit runtime-owned model registry helpers
- `guard(...)` and `GuardModelCondition`, `GuardModelConditionID` types
- `combineRoutes(...)` and `createOpenApiRouter(runtime, options)` (note: prefer `acl.createOpenApiRouter(options)` for the default runtime)
- validation adapters: `defineRequestSchema(...)`, `fromZod(...)`, `fromYup(...)`, `fromJoi(...)`, `fromAjv(...)`, `fromStandardSchema(...)`, `fromValibot(...)`, `fromArkType(...)`, `fromIoTs(...)`, `fromSuperstruct(...)`, `fromVine(...)`
- option helpers: `setGlobalOptions`, `setGlobalOption`, `getGlobalOptions`, `getGlobalOption`, `setModelOptions`, `setModelOption`, `getModelOptions`, `getModelOption`, `getModelNames`, `getModelJsonSchema`, `setDefaultModelOptions`, `setDefaultModelOption`, `getDefaultModelOptions`, `getDefaultModelOption`

Subpath entrypoints:

- `@web-ts-toolkit/access-router/advanced` — low-level runtime context, symbols (`MIDDLEWARE`, `PERMISSIONS`, ...), enums (`Codes`, `StatusCodes`), internals (`parseBody`, `parseQuery`, request schemas). Does NOT export `acl`, `defaultRuntime`, or router-creation helpers.
- `@web-ts-toolkit/access-router/processors` — `copyAndDepopulate` and its `ProcessCopy` / `CopyAndDepopulateOptions` / `CopyAndDepopulateOutput` types for transforming populated documents.

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
