---
sidebar_label: Express Runtime
sidebar_position: 3
---

# `@web-ts-toolkit/express-runtime`

Express app factory plus serverless handler and local dev server helpers.

Use this package when you want one Express app definition that can:

- run locally with `http.createServer(...)`
- be wrapped as a platform-agnostic serverless handler
- be built and started through a shared CLI instead of hand-written runtime glue

## Installation

```bash npm2yarn
npm install @web-ts-toolkit/express-runtime express
```

Peer dependency: `express >= 5`

## What It Exposes

Root entrypoint:

- `createExpressApp(options?)`
- `createServerlessHandler(app, options?)`
- `startLocalServer(app, options?)`
- `defaultRequestHook(...)`
- types such as `ExpressAppOptions`, `RouterMount`, `ServerlessHandlerOptions`, and `Logger`

CLI binary:

- `wtt-express-runtime dev`
- `wtt-express-runtime build`
- `wtt-express-runtime start`
- `wtt-express-runtime build-serverless`
- `wtt-express-runtime start-serverless`

Published subpath:

- `@web-ts-toolkit/express-runtime/cli` for reusable CLI parsing, env loading, build, watch, and runtime helpers

## Quick Start

Choose one runtime mode per app instance. If you want both a local server and a serverless export, create them from separate app instances instead of mutating one shared app in two directions.

### Module API: local server

```ts
import express from 'express';
import { createExpressApp, startLocalServer } from '@web-ts-toolkit/express-runtime';

const myRouter = express.Router();

const app = createExpressApp({
  routers: [
    {
      path: () => '/api',
      handler: myRouter,
    },
  ],
});

startLocalServer(app, {
  port: 8080,
  host: '0.0.0.0',
});
```

### Module API: serverless handler

```ts
import express from 'express';
import { createExpressApp, createServerlessHandler } from '@web-ts-toolkit/express-runtime';

const myRouter = express.Router();

async function connectDatabase(): Promise<void> {}

const app = createExpressApp({
  routers: [
    {
      path: () => (process.env.NODE_ENV === 'production' ? '/.netlify/functions/main' : '/api'),
      handler: myRouter,
    },
  ],
});

export const handler = createServerlessHandler(app, {
  init: async () => {
    await connectDatabase();
  },
});
```

### Error handling and finalize hook

```ts
import express from 'express';
import { createExpressApp } from '@web-ts-toolkit/express-runtime';

const requestLogger: express.RequestHandler = (_req, _res, next) => next();
const authMiddleware: express.RequestHandler = (_req, _res, next) => next();
const notFoundMiddleware: express.RequestHandler = (_req, _res, next) => next();
const apiRouter = express.Router();

const app = createExpressApp({
  middleware: [requestLogger, authMiddleware],
  routers: [{ path: '/api', handler: apiRouter }],
  postMiddleware: [notFoundMiddleware],
  finalize(app) {
    app.get('/health', (_req, res) => {
      res.json({ ok: true });
    });
  },
  errorHandler(err, _req, res, _next) {
    res.status(500).json({
      message: err instanceof Error ? err.message : 'unexpected server error',
    });
  },
});
```

## CLI

The CLI runs any module that exports an Express app or a built serverless handler.

### Local dev

```bash
npx wtt-express-runtime dev ./dist/app.js --port 3000 --host localhost
```

For TypeScript app modules, run the CLI through `tsx`:

```bash
npx tsx ./node_modules/@web-ts-toolkit/express-runtime/dist/cli.js dev ./src/app.ts --env .env
```

### Dev with env, preload, and watch

```bash
npx tsx ./node_modules/@web-ts-toolkit/express-runtime/dist/cli.js dev ./src/app.ts \
  --env .env \
  --require tsconfig-paths/register \
  --watch ./src,./shared \
  --ext ts,json
```

Use this when your app module is TypeScript, depends on path aliases, or should restart on source changes.

### Build a local runtime bundle

```bash
npx wtt-express-runtime build ./src/app.ts --out-dir dist
```

With an optional init hook:

```bash
npx wtt-express-runtime build ./src/app.ts --init ./src/init.ts --out-dir dist
```

### Start a built local bundle

```bash
npx wtt-express-runtime start ./dist/app.js --port 9000 --env .env
```

### Build a serverless bundle

```bash
npx wtt-express-runtime build-serverless ./src/app.ts --out-dir netlify/functions
```

### Start a built serverless bundle locally

```bash
npx wtt-express-runtime start-serverless ./netlify/functions/handler.js --port 9000 --env .env
```

Override the adapter body limit (default 1 MiB, `0` = empty bodies only):

```bash
npx wtt-express-runtime start-serverless ./netlify/functions/handler.js --max-body-bytes 2097152
```

The adapter bounds memory per request to the configured limit plus at most one chunk; declared `Content-Length` exceeding the limit is rejected with `413` before buffering, and oversized chunked bodies are drained after the limit without invoking the handler.

### Command summary

| Command            | Purpose                                                   |
| ------------------ | --------------------------------------------------------- |
| `dev`              | Run an app module directly as a local dev server          |
| `build`            | Bundle an app module into a local runtime file            |
| `start`            | Start the built local runtime bundle                      |
| `build-serverless` | Bundle an app module into a serverless handler            |
| `start-serverless` | Run a built serverless handler locally through an adapter |

Common options worth knowing:

- `--env <path>` loads one or more env files without overwriting already-set variables
- `--require <module>` preloads modules before loading the app
- `--watch <paths>` restarts the `dev` command on file changes
- `--out-dir <path>` and `--out-name <name>` control build output paths
- `--external <pkg>` keeps dependencies external during bundling
- `--max-body-bytes <bytes>` bounds adapter request bodies for `start-serverless` (default `1048576`, `0` allows empty bodies only)

## `createExpressApp(options?)`

This is the package's central app-construction primitive.

Middleware order:

1. `preMiddleware`
2. built-in body parsers
3. `middleware`
4. `router` and `routers`
5. `postMiddleware`
6. `finalize(app)`
7. `errorHandler`

Built-in defaults:

- `x-powered-by` is disabled unless `disablePoweredBy: false`
- `etag` defaults to `false`
- `trust proxy` defaults to `false`
- `express.json()` defaults to `{ limit: '1mb' }`
- `express.urlencoded()` defaults to `{ extended: false, limit: '1mb' }`

Important options:

- `preMiddleware`, `middleware`, `postMiddleware`
- `json`, `urlencoded`
- `router`, `routers`
- `trustProxy`
- `finalize`
- `errorHandler`
- `logger`

`RouterMount` accepts:

- `path: string | () => string`
- `handler: RequestHandler`

That function form is useful when the same app should mount under `/api` locally and a serverless path in production.

Example `RouterMount` usage:

```ts
import express from 'express';

const apiRouter = express.Router();

const app = createExpressApp({
  routers: [
    {
      path: () => (process.env.NODE_ENV === 'production' ? '/.netlify/functions/main' : '/api'),
      handler: apiRouter,
    },
  ],
});
```

## `createServerlessHandler(app, options?)`

Wraps an Express app into a platform-agnostic serverless handler.

Notable behavior:

- `init()` runs once per cold start and is memoized
- rejected `init()` results are also memoized until you call `handler.reset()`
- the default request hook decodes buffered JSON and text bodies before Express sees them

Important options:

- `init`
- `request`
- `response`
- `serverlessOptions`
- `maxBodyBytes`
- `logger`

Netlify-style example:

```ts
import type { Handler } from '@netlify/functions';
import express from 'express';
import { createExpressApp, createServerlessHandler } from '@web-ts-toolkit/express-runtime';

const myRouter = express.Router();

async function connectDatabase(): Promise<void> {}

const app = createExpressApp({
  routers: [{ path: () => '/.netlify/functions/main', handler: myRouter }],
});

export const handler: Handler = createServerlessHandler(app, {
  init: async () => {
    await connectDatabase();
  },
});
```

## `startLocalServer(app, options?)`

Starts the app with friendly local-server behavior:

- TCP port or named-pipe binding
- graceful `SIGINT` and `SIGTERM` shutdown by default
- configurable shutdown timeout for draining in-flight requests
- optional `init`, `onShutdown`, `onListening`, and `onError` hooks

Example with shutdown hooks:

```ts
async function connectDatabase(): Promise<void> {}
async function disconnectDatabase(): Promise<void> {}

const server = startLocalServer(app, {
  port: 8080,
  init: async () => {
    await connectDatabase();
  },
  onShutdown: async () => {
    await disconnectDatabase();
  },
  onListening: () => {
    console.log('server is ready');
  },
});

await server.shutdown();
```

## `@web-ts-toolkit/express-runtime/cli`

Use the public `./cli` subpath when another package wants the same runtime CLI behavior without shelling out to `wtt-express-runtime`.

It re-exports the parser and helpers used by the binary, including:

- argument types such as `DevArgs`, `BuildArgs`, and `StartArgs`
- `parseArgs(...)`
- `runDevCommand(...)`
- `runCliCommand(...)`
- env-loading, module preloading, and build helpers

This is the same public subpath `@web-ts-toolkit/access-router-runtime` builds on for its own config-driven CLI.

## When To Use It

Use `@web-ts-toolkit/express-runtime` when you want:

- a small runtime layer over normal Express apps
- one app definition that can run locally and in serverless environments
- shared CLI build/start/dev behavior across packages

If you already have a custom runtime with your own entrypoints, bundling, and local server bootstrap, this package may be more abstraction than you need.
