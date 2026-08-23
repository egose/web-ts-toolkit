---
sidebar_label: Express Runtime
sidebar_position: 3
---

# `@web-ts-toolkit/express-runtime`

Express app factory plus serverless handler and local dev server helpers.

Use this package when you want one Express app definition that can:

- run locally with `http.createServer(...)`
- be wrapped as a `serverless-http` serverless handler
- be built and started through a shared CLI instead of hand-written runtime glue

## Installation

```bash npm2yarn
npm install @web-ts-toolkit/express-runtime express
npm install --save-dev @types/express @types/node
```

Peer dependencies: `express >= 5` and `@types/express`. The type peer is declared
because the public declarations expose Express request, response, router, and app
types. TypeScript Node projects should also have Node types available.

The installed `wtt-express-runtime --version` command reports the version from
the installed package manifest, so release-staged packages print the published
package version.

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
npx tsx ./node_modules/@web-ts-toolkit/express-runtime/cli.js dev ./src/app.ts --env .env
```

### Dev with env, preload, and watch

```bash
npx tsx ./node_modules/@web-ts-toolkit/express-runtime/cli.js dev ./src/app.ts \
  --env .env \
  --require tsconfig-paths/register \
  --watch ./src,./shared \
  --ext ts,json
```

Use this when your app module is TypeScript, depends on path aliases, or should restart on source changes. Watch mode validates all watch paths before opening watchers, forks one child running the same CLI without watch flags, and serializes file changes into one restart at a time. The child receives `SIGTERM`, is escalated to `SIGKILL` after 5 seconds if it does not exit, and is respawned after the debounce delay. Watcher errors, child spawn errors, unexpected child exits, and failed child termination produce one diagnostic and exit nonzero; shutdown closes owned watchers and signal handlers and cannot respawn after shutdown begins.

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

The local `start-serverless` adapter emulates exactly one provider shape: **AWS API Gateway REST API v1 / Lambda proxy integration**. It emits pathname-only `path`, single-value and multi-value header maps, single-value and multi-value query maps, string `body`, `isBase64Encoded`, and only the minimal `requestContext.identity.sourceIp` field required by `serverless-http`. It does not emulate Netlify, Vercel, HTTP API v2, ALB, cookies arrays, authorizers, stage variables, full request context, or a trusted source IP.

Query keys and values are decoded once from percent-encoding. Duplicate keys are preserved in `multiValueQueryStringParameters`, empty values remain `''`, literal `+` signs remain `+`, and encoded delimiters such as `%26` and `%3D` become part of the value rather than splitting the query. Non-empty request bodies are base64-encoded to preserve arbitrary bytes. Handler results are validated before any response data is written; `multiValueHeaders` wins over `headers` on collisions, preserving repeated `Set-Cookie` values.

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
- `--watch <paths>` restarts the `dev` command on file changes with one supervised child process
- `--out-dir <path>` and `--out-name <name>` control build output paths
- `--external <pkg>` keeps dependencies external during bundling
- `--max-body-bytes <bytes>` bounds adapter request bodies for `start-serverless` (default `1048576`, `0` allows empty bodies only)

Use `--` to stop option parsing when a module path starts with a dash, for
example `wtt-express-runtime dev -- --app.js`. Numeric values are validated
before env files, preload modules, app modules, watchers, or servers are opened:
ports must be canonical decimal integers in `0..65535` or nonnumeric named-pipe
paths, and timeout, delay, and body-limit values must be finite integers in
`0..9007199254740991`.

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

`preMiddleware`, `middleware`, and `postMiddleware` accept both
`RequestHandler` and `ErrorRequestHandler` entries, matching Express `app.use()`
semantics. Error handlers in those arrays are slot-dependent and only catch
errors from middleware/routes registered before that slot. Use `errorHandler` for
the final app-wide error handler, or add routes in `finalize(app)` so the
factory-owned final error handling can observe them. When `errorHandler` is
omitted, unhandled errors that reach the factory-owned pipeline are logged
through `logger.error('Unhandled Express error:', err)` before delegating to
Express' default final handler.

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

Wraps an Express app into a `serverless-http` handler. Configure provider-specific deployment behavior through `serverlessOptions`; the local `start-serverless` adapter emulates AWS API Gateway REST API v1 / Lambda proxy only.

Notable behavior:

- `init()` runs once per cold start and is memoized
- synchronous `init()` throws and rejected `init()` results are also memoized until you call `handler.reset()` after settlement
- `handler.reset()` is ignored while initialization is pending, so concurrent invocations cannot start multiple initializations
- serverless-http 4 replays supported event bodies through the Express request stream, so the default request hook leaves JSON Buffers for Express to parse once
- the default request hook parses JSON only for exact `application/json` and structured `application/*+json` media types on non-stream hook inputs; `application/jsonp` and `application/json-evil` are not JSON
- `maxBodyBytes` on `createServerlessHandler()` is only the default hook's conversion threshold, not an end-to-end request rejection limit

Important options:

- `init`
- `request(req, event, context)`
- `response(res, event, context)`
- `serverlessOptions`
- `maxBodyBytes`
- `logger`

The default request hook handles `Content-Type` parameters separately from the
media type and matches media types case-insensitively. `application/json;
charset=utf-8` and `application/vnd.api+json` use JSON behavior;
`application/jsonp` and `application/json-evil` do not. Malformed JSON is left
for Express/parser error handling and is not logged as an internal serverless
hook failure.

Use Express parser limits (`json.limit`, `urlencoded.limit`) or platform limits
for request rejection. The local `start-serverless` adapter has its own enforced
`--max-body-bytes` limit that returns `413` before invoking the handler.

Hook types are generic over provider event and context:
`ServerlessRequestHook<TEvent, TContext>` and
`ServerlessResponseHook<TEvent, TContext>`. They match serverless-http 4's
runtime calls: `(request, event, context)` before Express and
`(response, event, context)` after Express.

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

- TCP port or named-pipe binding (port `0` logs the actual bound port)
- awaitable `ready` promise that resolves on listening and rejects on init/listen failure
- explicit lifecycle state machine: `initializing` → `listening` → `stopping` → `stopped`, or `initializing` → `failed`
- graceful `SIGINT` and `SIGTERM` shutdown by default (single-flight, owned handlers only)
- deterministic shutdown order: stop accepting → drain (up to `shutdownTimeout`) → `onShutdown` (covers draining only; `onShutdown` errors are logged)
- optional `init`, `onShutdown`, `onListening`, and `onError` hooks

Example with readiness and shutdown hooks:

```ts
async function connectDatabase(): Promise<void> {}
async function disconnectDatabase(): Promise<void> {}

const local = startLocalServer(app, {
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

try {
  await local.ready;
  console.log('listening on', (local.server.address() as { port: number }).port);
} catch (err) {
  console.error('failed to start', err);
}

await local.shutdown();
```

`shutdown()` is memoized — concurrent calls and signals share one operation — and a shutdown requested during a pending `init` prevents the later `listen` (leaving `server.listening === false` and rejecting `ready`). If the server was never started or was closed externally, `shutdown()` resolves deterministically.

## `@web-ts-toolkit/express-runtime/cli`

Use the public `./cli` subpath when another package wants the same runtime CLI behavior without shelling out to `wtt-express-runtime`.

It re-exports the parser and helpers used by the binary, including:

- argument types such as `DevArgs`, `BuildArgs`, and `StartArgs`
- `parseArgs(...)`
- `runDevCommand(...)`
- `runCliCommand(...)`
- env-loading, module preloading, and build helpers

This is the same public subpath `@web-ts-toolkit/access-router-runtime` builds on for its own config-driven CLI.

## Public API Ownership

The root package's supported consumer API is `createExpressApp`,
`createServerlessHandler`, `startLocalServer`, and their option/result types.
Root extension seams kept public for wrappers and advanced integrations are
`defaultRequestHook`, `normalizePort`, `parsePortValue`, `validateFiniteInteger`,
and the re-exported Express/serverless-http types.

The `/cli` subpath is a supported programmatic facade. Stable consumer APIs are
the command parsers/runners and command argument types. The lower-level env,
preload, module-loading, build-entry, watch, build, and local serverless adapter
helpers are intentional extension seams for CLI wrappers such as
`@web-ts-toolkit/access-router-runtime`; their exact names are locked by tests so
accidental additions or removals are reviewed explicitly.

Build tooling remains in this package for now. The measured package payload is
about 68 KiB compressed / 313 KiB unpacked, and a root CommonJS import does not
load `tsup` or `esbuild`. A separate build-CLI package can be considered later if
install-size policy changes, but it is not necessary for runtime imports today.

## When To Use It

Use `@web-ts-toolkit/express-runtime` when you want:

- a small runtime layer over normal Express apps
- one app definition that can run locally and in serverless environments
- shared CLI build/start/dev behavior across packages

If you already have a custom runtime with your own entrypoints, bundling, and local server bootstrap, this package may be more abstraction than you need.
