# `@web-ts-toolkit/access-router-runtime`

Config-driven wrapper around `@web-ts-toolkit/access-router` and `@web-ts-toolkit/express-runtime`.

Use one TypeScript config file to define:

- MongoDB connection settings
- global `access-router` options
- model routers from Mongoose schemas
- in-memory data routers
- optional root and OpenAPI routers
- Express middleware and error handling

## Installation

```sh
pnpm add @web-ts-toolkit/access-router-runtime @web-ts-toolkit/access-router @web-ts-toolkit/express-runtime express mongoose
```

## Quick Start

For a fuller starter, see the stable repository example:
https://github.com/egose/web-ts-toolkit/blob/main/packages/access-router-runtime/examples/basic/access-router.config.ts

```ts
// src/access-router.config.ts
import mongoose from 'mongoose';
import { defineRuntimeConfig } from '@web-ts-toolkit/access-router-runtime';

const UserSchema = new mongoose.Schema({
  name: { type: String, required: true },
  role: { type: String, default: 'user' },
});

const OPEN_ACCESS = { list: true, read: true, create: true, update: true, delete: true } as const;

export default defineRuntimeConfig({
  db: {
    url: process.env.MONGODB_URI,
  },
  globalOptions: {
    globalPermissions() {
      return [];
    },
  },
  rootRouter: {
    basePath: '/api/root',
    operationAccess: true,
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
  openApi: {
    title: 'Example API',
    version: '1.0.0',
    jsonPath: '/api/openapi.json',
  },
});
```

### CLI

Local dev:

```sh
npx wtt-access-router-runtime dev ./src/access-router.config.ts --env .env --port 3000
```

Build a local runtime bundle:

```sh
npx wtt-access-router-runtime build ./src/access-router.config.ts --out-dir dist
```

`build` statically imports the selected config module and bundles the config import graph into the output. If the config file or any file it imports changes, rebuild before deploying the existing output.

Build a serverless handler:

```sh
npx wtt-access-router-runtime build-serverless ./src/access-router.config.ts --out-dir netlify/functions
```

`build-serverless` uses the same build-time config capture. The deployed handler does not load or transpile the original config file on cold start, so config and tsconfig path aliases must be available during the build, not at runtime.

`start` and `start-serverless` are pass-through wrappers around `wtt-express-runtime`:

```sh
npx wtt-access-router-runtime start ./dist/app.js --port 3000
npx wtt-access-router-runtime start-serverless ./netlify/functions/handler.js --port 9000
```

Built local app modules export the Express `app` plus explicit `init()` and `shutdown()` hooks. Importing one of these modules does not register process signal handlers; `start` owns the local server lifecycle and is the only component that installs `SIGINT`/`SIGTERM` handlers unless you pass `--no-signals`. On `SIGINT`/`SIGTERM`, the server stops accepting new requests, drains in-flight requests, awaits runtime cleanup, and then exits. If cleanup rejects, the CLI logs the failure to stderr and exits nonzero.

## Module API

Create the runtime directly in code:

```ts
import config from './access-router.config';
import { createAccessRouterRuntime } from '@web-ts-toolkit/access-router-runtime';

const runtime = createAccessRouterRuntime(config);

export const app = runtime.app;
export const handler = runtime.createServerlessHandler();
```

Main exports:

- `defineRuntimeConfig(...)`
- `createAccessRouterRuntime(config)`
- `createAccessRouterRuntimeApp(config)` for lifecycle-free configs only
- `createAccessRouterRuntimeServerlessHandler(config, options?)`
- `loadAccessRouterRuntime(path, options?)`
- `loadAccessRouterRuntimeConfigSync(path)`
- `normalizeAccessRouterRuntimeConfigExport(value, path)`

`createAccessRouterRuntime(...)` returns the Express app plus explicit `init()` and `shutdown()` lifecycle methods. Its public context exposes runtime-owned registries as readonly snapshots: `runtime.models`, `runtime.modelRouters`, and `runtime.dataRouters` can be inspected, but callers cannot mutate those collections after route assembly. `runtime.config` is also a readonly snapshot for inspection; mutating the original caller-owned config object after construction does not replace the DB URL/options or lifecycle hooks used by `runtime.init()` / `runtime.shutdown()`.

`createAccessRouterRuntimeApp(config)` is intentionally limited to lifecycle-free configs. It rejects configs that define `db`, `init`, or `shutdown` because it returns only an Express app and cannot run the required database or lifecycle behavior. Use `createAccessRouterRuntime(config).app` when the config needs runtime lifecycle management.

Serverless creation preserves provider event/context generics:

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

You can also load and instantiate the runtime directly from a config path:

```ts
import { loadAccessRouterRuntime } from '@web-ts-toolkit/access-router-runtime';

const runtime = loadAccessRouterRuntime('./src/access-router.config.ts');

export const app = runtime.app;
export const handler = runtime.createServerlessHandler();
```

Pass `{ tsconfigPath: './tsconfig.json' }` as the second argument when the config file uses TypeScript path aliases or compiler options that differ from the package default loader setup.

## TypeScript Config Helper

The package also publishes `@web-ts-toolkit/access-router-runtime/tsconfig.json`.

```json
{
  "extends": "@web-ts-toolkit/access-router-runtime/tsconfig.json"
}
```

This exported config is for authoring runtime config modules in consumer projects. It uses `target: "ES2022"`, `module: "ESNext"`, `moduleResolution: "Bundler"`, `strict: true`, `verbatimModuleSyntax: true`, and `types: ["node"]`. The package source still type-checks against the workspace base config, while published runtime bundles are emitted for Node 22 by `tsup`. `dev` loads the config through the trusted config loader at startup; `build` and `build-serverless` compile the config import graph into the generated artifact so the deployed output no longer resolves this tsconfig or the original config file at runtime.

## Config Shape

Config modules should normally export a default object. The loader also accepts a synchronous default factory returning the object and a named `config` object export:

```ts
export default defineRuntimeConfig({
  /* ... */
});

export default function configFactory() {
  return defineRuntimeConfig({
    /* ... */
  });
}

export const config = defineRuntimeConfig({
  /* ... */
});
```

Async factories, promises, thenables, arrays, dates, unrelated-only exports, and modules that mix multiple config export forms are rejected before the runtime is assembled.

```ts
interface AccessRouterRuntimeConfig {
  db?: {
    url?: string;
    options?: mongoose.ConnectOptions;
    disconnectOnShutdown?: boolean;
    connection?: mongoose.Connection;
  };
  globalOptions?: GlobalOptions;
  defaultModelOptions?: DefaultModelRouterOptions;
  rootRouter?: RootRouterOptions | false;
  models?: ReadonlyArray<
    | {
        name?: string;
        model: mongoose.Model;
        schema?: never;
        collection?: never;
        router: ModelRouterOptions;
        customRoutes?: Array<{
          method: 'all' | 'delete' | 'get' | 'head' | 'options' | 'patch' | 'post' | 'put';
          path: string;
          handler: (req, res, next) => unknown | Promise<unknown>;
        }>;
      }
    | {
        name: string;
        model?: never;
        schema: mongoose.Schema;
        collection?: string;
        router: ModelRouterOptions;
        customRoutes?: Array<{
          method: 'all' | 'delete' | 'get' | 'head' | 'options' | 'patch' | 'post' | 'put';
          path: string;
          handler: (req, res, next) => unknown | Promise<unknown>;
        }>;
      }
  >;
  data?: ReadonlyArray<{
    name: string;
    router: DataRouterOptions;
  }>;
  openApi?: OpenApiRouterOptions | false;
  extraRoutes?: ReadonlyArray<CombinedRouteInput>;
  dev?: {
    watch?: ReadonlyArray<string>;
    ext?: ReadonlyArray<string>;
    delay?: number;
  };
  express?: Omit<ExpressAppOptions, 'router' | 'routers' | 'finalize'> & {
    finalize?: ExpressAppOptions['finalize'];
  };
  init?: (context) => Promise<void> | void;
  shutdown?: (context) => Promise<void> | void;
}
```

## Express Composition Order

`access-router-runtime` reserves the `router` / `routers` phase of `createExpressApp()` for routes generated from the runtime config, so `express.router` and `express.routers` are not part of the public config surface. Add extra application routes through `extraRoutes` when they should be mounted with generated routes, or use `express.finalize` for routes that intentionally run after `postMiddleware`.

The assembled Express app is registered in this order:

1. `express.preMiddleware`
2. Built-in JSON and URL-encoded parsers unless disabled with `json: false` / `urlencoded: false`
3. `express.middleware`
4. Generated runtime routes in this order: model routers, data routers, root router, `extraRoutes`, OpenAPI router
5. `express.postMiddleware`
6. `express.finalize(app)`
7. `express.errorHandler`

OpenAPI is intentionally mounted with the generated router set after model, data, root, and extra routes. That keeps a post-router 404 in `postMiddleware` from shadowing generated endpoints while preserving a stable slot for application-owned `extraRoutes` to override or reserve paths before OpenAPI.

Runtime config validation fails before model registration, router creation, or database connection when it can detect invalid package-level structure:

- `db.url` and `db.connection` are mutually exclusive.
- Model definitions must provide exactly one of `model` or `schema`.
- Schema-backed model definitions require `name`; existing-model definitions resolve their name from `model.modelName`.
- `models[].name` and `models[].router.modelName`, when provided, must match the resolved model name.
- `models[].collection` is only valid with `schema`, and duplicate explicit/resolved collection names are rejected.
- Duplicate resolved model names, duplicate `data[].name` values, and duplicate resolved `data[].router.dataName` values are rejected.
- `dev.watch` and `dev.ext` must be arrays of strings.
- `dev.delay` must be a finite integer in `0..Number.MAX_SAFE_INTEGER`; `Infinity`, fractions, negatives, and larger values are rejected.

Migration note: configs that previously relied on promises/async factories, array/date exports, unrelated-only named exports, ambiguous model definitions, duplicate names, existing-model `collection`, non-integer/out-of-range `dev.delay` values, or global Mongoose connection/model reuse must be changed to the validated forms above.

```ts
// Before: ambiguous and now rejected
export default defineRuntimeConfig({
  models: [
    {
      name: 'User',
      model: UserModel,
      schema: UserSchema,
      router: {},
    },
  ],
});

// After: existing model
export default defineRuntimeConfig({
  models: [{ model: UserModel, router: {} }],
});

// After: generated model from schema
export default defineRuntimeConfig({
  models: [{ name: 'User', schema: UserSchema, router: {} }],
});
```

## Notes

- `dev`, `build`, and `build-serverless` read the config file and reuse the shared CLI helpers from `@web-ts-toolkit/express-runtime/cli`.
- `dev` accepts the shared runtime loading flags such as `--env`, `--require`, `--tsconfig`, `--watch`, `--ext`, and `--delay`; environment files and preload modules are applied before trusted config evaluation.
- `build` and `build-serverless` bundle the config module and its imports at build time. Rebuild after changing the config, files imported by the config, or tsconfig path-alias mappings.
- Built local app modules are safe to import programmatically without process-global signal side effects. Call their exported `init()` / `shutdown()` hooks yourself when you are not using `wtt-access-router-runtime start`.
- Programmatic runtime context collections are readonly snapshots. Mutate the original config only before calling `createAccessRouterRuntime(...)`; DB options and lifecycle hooks are captured at construction time.
- `createAccessRouterRuntimeApp(...)` is only for configs without `db`, `init`, or `shutdown`. Configs with those fields must use `createAccessRouterRuntime(...)` so callers can run `init()` and `shutdown()`.
- Each runtime owns an independent Mongoose connection when `db.url` is configured. It creates that connection with `mongoose.createConnection()`, opens it during `runtime.init()`, and closes only that owned connection during `runtime.shutdown()` unless `disconnectOnShutdown: false` is set.
- `db.connection` supplies an externally owned Mongoose connection. Schema-backed models are registered on that connection, but the runtime does not open or close it.
- If neither `db.url` nor `db.connection` is configured, schema-backed models are registered on a new runtime-local disconnected connection. Existing supplied `model` values keep using the connection they were created on.
- The runtime never uses `mongoose.connect()`, `mongoose.model()`, `mongoose.models`, or `mongoose.disconnect()` for generated models or lifecycle, so unrelated global Mongoose state is not silently reused or disconnected.
- The peer range is `mongoose >=8 <10`; packed consumer coverage runs the same database ownership and lifecycle contract against Mongoose 8 and 9. Future Mongoose majors are not declared supported until they are added to that packed-consumer matrix.
- Model definitions must use exactly one of `model` or `schema`. When `schema` is used, include `name` and the package registers the Mongoose model for you on the runtime-selected connection.
- Existing supplied models cannot be combined with `db.url`, because that would make the configured URL unrelated to model I/O. With `db.connection`, existing supplied models must belong to that same connection.
- Runtime-generated model registrations are removed from their connection during `runtime.shutdown()`. Existing supplied models are never deleted by the runtime.
- `models[].customRoutes[].path` is relative to the model router `basePath`, so `/:id/profile` mounts under `/api/users/:id/profile` when the model `basePath` is `/api/users`.
- `runtime.init()` and `runtime.shutdown()` use a private state machine. Concurrent `init()` calls share one startup, concurrent `shutdown()` calls share one cleanup, and shutdown requested while startup is pending waits for late-created resources to be disconnected before it resolves. After shutdown completes, later `init()` calls reject; after a failed startup or failed shutdown, a later call may retry deterministically.
- Startup failure rolls back resources acquired by that attempt. If startup and rollback both fail, the rejection is an `AggregateError` whose `errors` array contains the primary startup failure first, followed by rollback failures. Shutdown always attempts configured shutdown hooks and mandatory database cleanup independently; one cleanup failure is thrown directly, and multiple cleanup failures are surfaced as an `AggregateError`.
- A copyable starter config lives at https://github.com/egose/web-ts-toolkit/blob/main/packages/access-router-runtime/examples/basic/access-router.config.ts.

## License

Apache-2.0
