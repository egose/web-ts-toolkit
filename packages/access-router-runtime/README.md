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

For a fuller in-repo starter, see `examples/basic/access-router.config.ts`.

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

Build a serverless handler:

```sh
npx wtt-access-router-runtime build-serverless ./src/access-router.config.ts --out-dir netlify/functions
```

`start` and `start-serverless` are pass-through wrappers around `wtt-express-runtime`:

```sh
npx wtt-access-router-runtime start ./dist/app.js --port 3000
npx wtt-access-router-runtime start-serverless ./netlify/functions/handler.js --port 9000
```

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
- `createAccessRouterRuntimeApp(config)`
- `createAccessRouterRuntimeServerlessHandler(config, options?)`
- `loadAccessRouterRuntime(path, options?)`
- `loadAccessRouterRuntimeConfigSync(path)`

You can also load and instantiate the runtime directly from a config path:

```ts
import { loadAccessRouterRuntime } from '@web-ts-toolkit/access-router-runtime';

const runtime = loadAccessRouterRuntime('./src/access-router.config.ts');

export const app = runtime.app;
export const handler = runtime.createServerlessHandler();
```

## TypeScript Config Helper

The package also publishes `@web-ts-toolkit/access-router-runtime/tsconfig.json`.

```json
{
  "extends": "@web-ts-toolkit/access-router-runtime/tsconfig.json"
}
```

## Config Shape

```ts
interface AccessRouterRuntimeConfig {
  db?: {
    url?: string;
    options?: mongoose.ConnectOptions;
    disconnectOnShutdown?: boolean;
  };
  globalOptions?: GlobalOptions;
  defaultModelOptions?: DefaultModelRouterOptions;
  rootRouter?: RootRouterOptions | false;
  models?: Array<{
    name?: string;
    model?: mongoose.Model;
    schema?: mongoose.Schema;
    collection?: string;
    router: ModelRouterOptions;
    customRoutes?: Array<{
      method: 'all' | 'delete' | 'get' | 'head' | 'options' | 'patch' | 'post' | 'put';
      path: string;
      handler: (req, res, next) => unknown | Promise<unknown>;
    }>;
  }>;
  data?: Array<{
    name: string;
    router: DataRouterOptions;
  }>;
  openApi?: OpenApiRouterOptions | false;
  extraRoutes?: CombinedRouteInput[];
  express?: Omit<ExpressAppOptions, 'router' | 'routers'>;
  init?: (context) => Promise<void> | void;
  shutdown?: (context) => Promise<void> | void;
}
```

## Notes

- `dev`, `build`, and `build-serverless` read the config file and reuse the shared CLI helpers from `@web-ts-toolkit/express-runtime/cli`.
- Model definitions can use either `model` or `schema`. When `schema` is used, the package registers the Mongoose model for you.
- `models[].customRoutes[].path` is relative to the model router `basePath`, so `/:id/profile` mounts under `/api/users/:id/profile` when the model `basePath` is `/api/users`.
- `runtime.init()` memoizes the first successful DB/init call; `runtime.shutdown()` clears that memoized state.
- A copyable starter config lives at `examples/basic/access-router.config.ts` in this repo.

## License

Apache-2.0
