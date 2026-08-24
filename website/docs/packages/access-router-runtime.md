---
sidebar_label: Access Router Runtime
sidebar_position: 14
---

# `@web-ts-toolkit/access-router-runtime`

Config-driven wrapper around [`@web-ts-toolkit/access-router`](./access-router/) and `@web-ts-toolkit/express-runtime`.

This package is for the case where you want the generated resource REST API from `access-router`, but you do not want to hand-wire:

- Mongoose model registration
- global `access-router` options
- root and OpenAPI routers
- Express app setup
- local dev vs. serverless runtime entry modules

Instead, you describe the API in one TypeScript config file and let the package assemble the app and CLI entrypoints.

## Installation

```bash npm2yarn
npm install @web-ts-toolkit/access-router-runtime @web-ts-toolkit/access-router @web-ts-toolkit/express-runtime express mongoose
```

## What It Exposes

Main entrypoint:

- `defineRuntimeConfig(...)`
- `createAccessRouterRuntime(config)`
- `createAccessRouterRuntimeApp(config)` for lifecycle-free configs only
- `createAccessRouterRuntimeServerlessHandler(config, options?)`
- `loadAccessRouterRuntime(path, options?)`
- `loadAccessRouterRuntimeConfigSync(path)`
- `normalizeAccessRouterRuntimeConfigExport(value, path)`

Published extras:

- `@web-ts-toolkit/access-router-runtime/tsconfig.json` for a reusable strict TypeScript config base when authoring runtime config modules

CLI binary:

- `wtt-access-router-runtime dev`
- `wtt-access-router-runtime build`
- `wtt-access-router-runtime start`
- `wtt-access-router-runtime build-serverless`
- `wtt-access-router-runtime start-serverless`

## Quick Start

```ts
import mongoose from 'mongoose';
import { defineRuntimeConfig } from '@web-ts-toolkit/access-router-runtime';

const OPEN_ACCESS = { list: true, read: true, create: true, update: true, delete: true } as const;

const UserSchema = new mongoose.Schema({
  name: { type: String, required: true },
  role: { type: String, default: 'user' },
});

export default defineRuntimeConfig({
  db: {
    url: process.env.MONGODB_URI,
  },
  globalOptions: {
    globalPermissions() {
      return [];
    },
  },
  models: [
    {
      name: 'User',
      schema: UserSchema,
      router: {
        basePath: '/api/users',
        operationAccess: OPEN_ACCESS,
        permissionSchema: {
          name: OPEN_ACCESS,
          role: OPEN_ACCESS,
        },
      },
      customRoutes: [
        {
          method: 'get',
          path: '/:id/profile',
          handler: async (req) => ({ id: req.params.id, profile: true }),
        },
      ],
    },
  ],
  rootRouter: {
    basePath: '/api/root',
    operationAccess: true,
  },
  openApi: {
    title: 'Example API',
    version: '1.0.0',
    jsonPath: '/api/openapi.json',
  },
});
```

For a fuller starter, see the stable repository example: https://github.com/egose/web-ts-toolkit/blob/main/packages/access-router-runtime/examples/basic/access-router.config.ts.

## CLI

The runtime CLI mirrors the `express-runtime` commands, but starts from a config file instead of a hand-wired app module.

### Local dev

```bash
wtt-access-router-runtime dev ./src/access-router.config.ts --env .env --port 3000
```

### Build a local runtime bundle

```bash
wtt-access-router-runtime build ./src/access-router.config.ts --out-dir dist
```

The build statically imports the selected config module and bundles the config import graph into the output. Rebuild after changing the config or anything imported by it.

### Build a serverless bundle

```bash
wtt-access-router-runtime build-serverless ./src/access-router.config.ts --out-dir netlify/functions
```

Serverless builds use the same build-time config capture. A deployed cold start does not load or transpile the original config file, so config files and tsconfig path aliases only need to exist during the build.

### Start built artifacts

These are pass-through wrappers to `wtt-express-runtime`:

```bash
wtt-access-router-runtime start ./dist/app.js --port 3000
wtt-access-router-runtime start-serverless ./netlify/functions/handler.js --port 9000
```

Built local app modules export the Express `app` plus explicit `init()` and `shutdown()` hooks. Importing one or more built modules does not register process signal handlers. `start` owns the local server lifecycle and is the only component that installs `SIGINT`/`SIGTERM` handlers unless you pass `--no-signals`. On `SIGINT`/`SIGTERM`, the server stops accepting new requests, drains in-flight requests, awaits runtime cleanup, and then exits. If cleanup rejects, the CLI logs the failure to stderr and exits nonzero.

## Relationship To The Lower-Level Packages

`access-router-runtime` does not replace the two core packages. It composes them.

- `@web-ts-toolkit/access-router` still owns router generation, permissions, hooks, validation, and OpenAPI metadata.
- `@web-ts-toolkit/express-runtime` still owns the Express app factory, local server lifecycle, serverless wrapper, and bundling CLI behavior.
- `@web-ts-toolkit/access-router-runtime` adds a config layer so those two packages can be used with less application boilerplate.

The generated local and serverless artifacts capture the config module at build time. They are portable with respect to the original config and tsconfig files, but they do not automatically pick up source-config edits; rebuild after config, config-import, or tsconfig alias changes.

Local artifacts are import-side-effect free for process signal handling. Programmatic consumers should call the exported lifecycle hooks themselves, while the CLI `start` command coordinates HTTP draining and runtime cleanup through the shared `express-runtime` local server.

If you want full low-level control over app wiring, use the two core packages directly. If your API is mostly generated model/data/root routes, this package is the shorter path.

## Loading A Runtime Instance

If you want a fully constructed runtime from a config file path, use `loadAccessRouterRuntime(...)` instead of loading the config and wiring the runtime separately.

```ts
import { loadAccessRouterRuntime } from '@web-ts-toolkit/access-router-runtime';

const runtime = loadAccessRouterRuntime('./src/access-router.config.ts');

export const app = runtime.app;
export const handler = runtime.createServerlessHandler();
```

Pass `{ tsconfigPath: './tsconfig.json' }` as the second argument when your config relies on TypeScript path aliases or compiler options that are not covered by the loader defaults.

## Programmatic Runtime Creation

If your app already owns the config object in code, create the runtime directly:

```ts
import config from './access-router.config';
import { createAccessRouterRuntime } from '@web-ts-toolkit/access-router-runtime';

const runtime = createAccessRouterRuntime(config);

export const app = runtime.app;
export const handler = runtime.createServerlessHandler();
```

`runtime.models`, `runtime.modelRouters`, and `runtime.dataRouters` are readonly snapshots of the registries used during app assembly. Inspect them when you need access to generated models or routers, but do not treat them as extension points after construction. `runtime.config` is also a readonly inspection snapshot; DB URL/options and lifecycle hooks are captured at construction time, so later mutation of the caller-owned config object does not change `runtime.init()` or `runtime.shutdown()` behavior.

`createAccessRouterRuntimeApp(config)` exists for simple lifecycle-free configs only. It rejects configs that define `db`, `init`, or `shutdown` because it returns only the Express app and has no way to execute database connection or cleanup hooks. If the config has any of those fields, use `createAccessRouterRuntime(config).app` and call the runtime lifecycle methods through your server or serverless integration.

Serverless creation is generic over provider event/context types:

```ts
type ProviderEvent = { rawPath: string };
type ProviderContext = { requestId: string };

const handler = runtime.createServerlessHandler<ProviderEvent, ProviderContext>({
  request(_req, event, context) {
    event.rawPath;
    context.requestId;
  },
});
```

## TypeScript Config Helper

The package also publishes `@web-ts-toolkit/access-router-runtime/tsconfig.json`.

Use it when you want a small shared baseline for runtime-config files:

```json
{
  "extends": "@web-ts-toolkit/access-router-runtime/tsconfig.json"
}
```

The exported config is intentionally a consumer config baseline: `target: "ES2022"`, `module: "ESNext"`, `moduleResolution: "Bundler"`, `strict: true`, `verbatimModuleSyntax: true`, and Node types. The package source type-checks against the workspace base config, while the published local/serverless artifacts are emitted for Node 22. `dev` resolves the config through the trusted loader at startup; `build` and `build-serverless` use the selected tsconfig only during bundling and then capture the config import graph into the output.

## Config Shape

Config modules should normally export a default config object:

```ts
export default defineRuntimeConfig({
  /* ... */
});
```

The loader also accepts a synchronous default factory returning a valid object and a named `config` object export:

```ts
export default function configFactory() {
  return defineRuntimeConfig({
    /* ... */
  });
}

export const config = defineRuntimeConfig({
  /* ... */
});
```

Async factories, promises, thenables, arrays, dates, unrelated-only exports, and modules that mix multiple config export forms are rejected before model registration, router creation, or database connection.

The config object can describe:

- `db`: a MongoDB connection URL for a runtime-owned connection, or an explicit externally owned `mongoose.Connection`
- `globalOptions`: global `access-router` options
- `defaultModelOptions`: shared model-router defaults
- `models`: model-backed resource routers from `schema` or existing `model`
- `models[].customRoutes`: extra model-scoped routes mounted through the model router's `JsonRouter`
- `data`: in-memory data routers
- `rootRouter`: grouped root batch route
- `openApi`: generated JSON and Swagger UI routes
- `extraRoutes`: extra Express/access-router routes to mount alongside generated routers
- `express`: Express middleware, parser, and error-handler options
- `init` / `shutdown`: runtime lifecycle hooks

## Express Composition Order

`access-router-runtime` uses the `router` / `routers` phase of `createExpressApp()` for routes generated from the config. The public `express` config therefore excludes `router` and `routers`; use `extraRoutes` for additional routes that should sit with generated routes, or `express.finalize` for routes that intentionally run after `postMiddleware`.

The final Express app is assembled in this order:

1. `express.preMiddleware`
2. Built-in JSON and URL-encoded parsers unless disabled
3. `express.middleware`
4. Generated runtime routes in this order: model routers, data routers, root router, `extraRoutes`, OpenAPI router
5. `express.postMiddleware`
6. `express.finalize(app)`
7. `express.errorHandler`

OpenAPI is mounted in the generated-router phase after model, data, root, and extra routes. This keeps `postMiddleware` useful for 404 catch-alls without shadowing generated endpoints, while allowing `extraRoutes` to claim paths before OpenAPI when needed.

Model definitions can use either:

- `model`: an already-created Mongoose model
- `schema`: a schema plus `name`, so the runtime registers the model for you

Each model definition must use exactly one form. Existing-model definitions resolve their name from `model.modelName`; if `name` or `router.modelName` is also provided it must match that resolved name. Schema-backed definitions require `name`, may set `collection`, and must not duplicate another model's resolved name or explicit/resolved collection name.

`db.url` and `db.connection` are mutually exclusive. When `db.url` is configured, the runtime creates an independent Mongoose connection, opens it during `runtime.init()`, and closes only that owned connection during `runtime.shutdown()` unless `disconnectOnShutdown: false` is set. When `db.connection` is supplied, schema-backed models are registered on that connection, but the runtime does not open or close the externally owned connection.

If neither `db.url` nor `db.connection` is configured, schema-backed models are registered on a runtime-local disconnected connection. Existing supplied `model` values keep using the connection they were created on. Existing supplied models cannot be combined with `db.url`; with `db.connection`, they must belong to that same connection. Runtime-generated model registrations are removed during `runtime.shutdown()`, while existing supplied models are never deleted by the runtime.

The runtime never uses `mongoose.connect()`, `mongoose.model()`, `mongoose.models`, or `mongoose.disconnect()` for generated models or lifecycle, so unrelated global Mongoose state is not silently reused or disconnected.

The published peer range is `mongoose >=8 <10`. Packed consumer coverage runs the same database ownership and lifecycle contract against Mongoose 8 and 9; future Mongoose majors are intentionally outside the declared range until the matrix covers them.

Runtime lifecycle uses deterministic private states. Concurrent `runtime.init()` calls share one startup, concurrent `runtime.shutdown()` calls share one cleanup, and shutdown requested during pending startup waits for late-created resources to be disconnected before shutdown resolves. After shutdown completes, later `init()` calls reject; after a failed startup or failed shutdown, later lifecycle calls retry from the failed state deterministically.

Startup failure rolls back resources acquired by that attempt. If startup and rollback both fail, the rejection is an `AggregateError` with the primary startup failure first in `errors`, followed by rollback failures. Shutdown runs caller shutdown, config shutdown, and mandatory database cleanup independently where applicable; one cleanup failure is thrown directly, and multiple cleanup failures are surfaced as an `AggregateError`.

Programmatic context collections are readonly snapshots, and lifecycle-sensitive config is captured during runtime construction. Mutate config before calling `createAccessRouterRuntime(...)`; do not rely on post-construction config mutation to change database or lifecycle behavior.

`createAccessRouterRuntimeApp(...)` rejects configs with `db`, `init`, or `shutdown`. Use the full runtime when lifecycle work is required.

Data definitions must not duplicate `data[].name` or the resolved `data[].router.dataName`. Dev defaults are validated at load time: `dev.watch` and `dev.ext` must be arrays of strings, and `dev.delay` must be a finite integer in `0..Number.MAX_SAFE_INTEGER`.

Migration note: configs that previously relied on promises/async factories, array/date exports, unrelated-only named exports, ambiguous model definitions, duplicate names, existing-model `collection`, non-integer/out-of-range `dev.delay` values, or global Mongoose connection/model reuse must be changed to the validated forms above.

Model definitions can also include `customRoutes` when you need model-specific endpoints alongside the generated CRUD routes.

- `customRoutes[].path` is relative to the model router `basePath`
- `customRoutes[].method` supports `all`, `get`, `post`, `put`, `patch`, `delete`, `head`, and `options`
- `customRoutes[].handler` uses `@web-ts-toolkit/express-json-router` semantics, so returning plain data works

Example:

```ts
customRoutes: [
  {
    method: 'get',
    path: '/:id/profile',
    handler: async (req) => ({ id: req.params.id, profile: true }),
  },
];
```

With `basePath: '/api/users'`, that route mounts at `/api/users/:id/profile`.

## In-Repo Example

A copyable starter config lives in the repository:

- https://github.com/egose/web-ts-toolkit/blob/main/packages/access-router-runtime/examples/basic/access-router.config.ts

That example shows one model router, one data router, a root router, OpenAPI setup, a model-level custom route, global permissions, and Express finalize/error handling.

## When To Use It

Use `access-router-runtime` when you want:

- generated resource REST endpoints with minimal application wiring
- one config file as the source of truth for DB, routers, and runtime behavior
- both local and serverless execution without maintaining separate app entry files
- to keep using `access-router` options for global, root, model, and data routes

If your app has highly custom Express composition or only uses a small part of `access-router`, the lower-level packages may still be a better fit.
