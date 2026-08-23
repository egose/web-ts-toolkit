# `@web-ts-toolkit/express-runtime`

Express app factory plus serverless handler and local dev server helpers. Build
one Express app, run it as a serverless function **or** a local dev server with
minimal wiring changes. A CLI binary runs any Express app locally from a module
path.

## Installation

```sh
pnpm add @web-ts-toolkit/express-runtime express
pnpm add -D @types/express @types/node
```

`express` and `@types/express` are peer dependencies because the public
declarations expose Express request, response, router, and app types. TypeScript
Node projects should also have Node types available.

The installed `wtt-express-runtime --version` command reports the version from
the installed package manifest, so release-staged packages print the published
package version.

## Highlights

- `createExpressApp()` — Express factory with pluggable lifecycle slots
  (`preMiddleware`, `middleware`, `routers`, `postMiddleware`, `finalize`,
  `errorHandler`), hardening defaults, and per-logger injection.
- `createServerlessHandler()` — wraps an Express app as a serverless handler
  backed by serverless-http 4, with provider options for supported deployments, body
  stream handling, a memoized `init` hook for cold starts, and a `reset()`
  escape hatch for settled failed cold starts.
- `startLocalServer()` — `http.createServer` + `listen` with friendly
  `EADDRINUSE` / `EACCES` errors, optional graceful `SIGINT` / `SIGTERM`
  shutdown that drains in-flight requests, and a configurable timeout.
- CLI binary with five subcommands:
  - `dev` — run an Express app as a local dev server
  - `build` — bundle the app as a local runtime module
  - `start` — start the bundled local app module
  - `build-serverless` — bundle the app as a serverless handler
  - `start-serverless` — smoke-test the bundled handler locally by translating HTTP ↔ serverless events

## Quick Start

Choose **one** of the two runmodes per app instance. Calling both
`createServerlessHandler(app, …)` and `startLocalServer(app, …)` against the
same app instance mutates shared state (port setting, serverless-http wrapper)
— keep them separate.

### Module API — serverless

```ts
import { createExpressApp, createServerlessHandler } from '@web-ts-toolkit/express-runtime';
import { myRouter } from './routes';

// Derive the mount path from the environment so the same app serves both
// serverless (/.netlify/functions/main) and local (/api) URLs.
const baseUrl = () => (process.env.NODE_ENV === 'production' ? '/.netlify/functions/main' : '/api');

const app = createExpressApp({
  routers: [{ path: baseUrl, handler: myRouter }],
  errorHandler: (err, _req, res, _next) => {
    res.status(500).json({ success: false, message: (err as Error).message });
  },
});

export const handler = createServerlessHandler(app, {
  init: async () => {
    // cold-start hook: DB connections, cache warmup, etc.
  },
});
```

### Module API — local dev server

```ts
import { createExpressApp, startLocalServer } from '@web-ts-toolkit/express-runtime';
import { myRouter } from './routes';

const app = createExpressApp({
  routers: [{ path: () => '/api', handler: myRouter }],
});

startLocalServer(app, {
  port: 8080,
  host: '0.0.0.0',
  onShutdown: async () => {
    // graceful cleanup (close DB, flush buffers, ...)
  },
});
```

### CLI — dev (local server)

The `wtt-express-runtime dev` command runs any module that
default-exports an Express app (or an async function returning one) as a local
dev server:

```sh
npx wtt-express-runtime dev ./dist/app.js --port 3000 --host localhost
```

```ts
// src/app.ts (precompile to dist/app.js, or run via tsx — see below)
import { createExpressApp } from '@web-ts-toolkit/express-runtime';

export default createExpressApp({
  routers: [{ path: () => '/api', handler: myRouter }],
});
```

For TypeScript app modules, run the CLI through `tsx`:

```sh
npx tsx ./node_modules/@web-ts-toolkit/express-runtime/cli.js dev ./src/app.ts
```

#### CLI — dev with env, require, and watch

`--env` loads `.env` files into `process.env` (existing vars are not
overridden). `--require` preloads modules (e.g. `tsconfig-paths/register` for
TS path aliases) before the app module is loaded. `--watch` forks a child
process running the server and restarts it on file changes:

```sh
npx tsx ./node_modules/@web-ts-toolkit/express-runtime/cli.js dev ./src/app.ts \
  --env .env \
  --require tsconfig-paths/register \
  --watch ./src,./shared \
  --ext ts,json
```

> `--env` parses `KEY=VALUE` lines (supports `export` prefix, quoted values,
> `#` comments). For advanced dotenv features (multiline, variable expansion),
> use `--require dotenv/config` instead.
>
> `--watch` uses Node 20+'s `fs.watch` with `{ recursive: true }` and forks one
> child running the same CLI without watch flags. File changes are serialized
> into one restart at a time: the child receives `SIGTERM`, is escalated to
> `SIGKILL` after 5 seconds if it does not exit, and is respawned after the
> debounce delay (`--delay`). Shutdown closes owned watchers and signal handlers
> and cannot respawn after shutdown begins.

> The `dev` command evaluates arbitrary code from `<app-module>` in the current
> process and inherits its privileges. Init logic (e.g. DB connections) should
> be placed at the top level of your app module since `dev` does not expose an
> `init` hook.

### CLI — build (local runtime bundle)

The `build` command generates a temporary runtime entry that re-exports the app
and optional `init` hook, then bundles it into a local runtime file:

```sh
npx wtt-express-runtime build ./src/app.ts --out-dir dist
```

With an optional init hook (DB connections, cache warmup, etc.):

```sh
npx wtt-express-runtime build ./src/app.ts --init ./src/init.ts --out-dir dist
```

```ts
// src/init.ts
export default async () => {
  await mongoose.connect(process.env.MONGODB_URI);
};
```

This produces `dist/app.js` (configurable via `--out-name`) that default-exports
the Express app and, when `--init` is used, also exports `init` for the `start`
command to run before listening.

> `express` is always external; additional externals can be added via
> `--external`.

### CLI — start (run a bundled app locally)

The `start` command runs the `build` output locally with `startLocalServer()`:

```sh
npx wtt-express-runtime build ./src/app.ts --out-dir dist
npx wtt-express-runtime start ./dist/app.js --port 9000 --env .env
```

The bundled app module must default-export an Express app (or export it as
`app`). If it exports `init`, that hook runs once before the server starts
listening.

### CLI — build-serverless (serverless bundle)

The `build-serverless` command preserves the previous serverless bundling flow:

```sh
npx wtt-express-runtime build-serverless ./src/app.ts --out-dir netlify/functions
```

With an optional init hook:

```sh
npx wtt-express-runtime build-serverless ./src/app.ts --init ./src/init.ts --out-dir netlify/functions
```

This produces `netlify/functions/handler.js` (configurable via `--out-name`)
that exports a `handler` function using `serverless-http`. Choose provider
options in `createServerlessHandler()` for the deployment platform you run on.

### CLI — start-serverless (run a bundled handler locally)

The `start-serverless` command runs a bundled serverless handler locally by
translating HTTP requests into serverless events and the handler's results back
into HTTP responses:

```sh
npx wtt-express-runtime build-serverless ./src/app.ts --out-dir dist
npx wtt-express-runtime start-serverless ./dist/handler.js --port 9000 --env .env
```

> The adapter does not parse the HTTP request body. Non-empty bodies are encoded
> into the AWS v1 event as base64 strings, and the generated handler uses
> serverless-http 4 to replay the decoded bytes through the Express request
> stream so Express body parsers can parse JSON once and enforce their own parser
> limits.
>
> The local adapter intentionally emulates one provider shape: **AWS API Gateway
> REST API v1 / Lambda proxy integration**. It emits `httpMethod`, pathname-only
> `path`, single-value `headers`, `multiValueHeaders`, `queryStringParameters`,
> `multiValueQueryStringParameters`, string `body`, `isBase64Encoded`, and the
> minimal `requestContext.identity.sourceIp` field required by `serverless-http`.
> It does not emulate Netlify, Vercel, HTTP API v2, ALB, API Gateway cookies,
> authorizers, stage variables, full request-context metadata, or a trusted source
> IP.
>
> The incoming URL query is split from the path before the handler is invoked.
> Query keys and values are decoded once from percent-encoding, duplicate keys are
> preserved in `multiValueQueryStringParameters`, empty values are preserved as
> `''`, literal `+` signs remain `+`, and encoded delimiters such as `%26` and
> `%3D` are decoded into the field value rather than being treated as separators.
> Single-value query/header maps use the last query value and comma-joined header
> values respectively; multi-value maps are the canonical source for duplicates.
>
> Non-empty request bodies are base64-encoded in the AWS v1 event so the local
> adapter preserves arbitrary bytes. Handler results must be valid AWS v1 Lambda
> proxy results before any response data is written: `statusCode` must be an
> integer in `100..599`, headers must be strings, `multiValueHeaders` must be
> arrays of strings, `body` must be a string, and `isBase64Encoded: true` requires
> valid standard base64. If `headers` and `multiValueHeaders` contain the same
> header name, `multiValueHeaders` wins; this preserves repeated `Set-Cookie`
> values.
>
> The adapter bounds request memory: default limit is **1 MiB** (`1048576` bytes).
> A declared `Content-Length` exceeding the limit is rejected before buffering;
> chunked bodies are checked incrementally and stop retaining chunks after the
> limit — the request is drained and a `413 Payload Too Large` is returned without
> invoking the handler. Client aborts and stream errors release listeners and do
> not produce an unhandled rejection. Memory retained is at most the limit plus
> one incoming chunk.
>
> Override the limit intentionally:
>
> ```sh
> npx wtt-express-runtime start-serverless ./dist/handler.js --max-body-bytes 2097152
> ```
>
> Programmatic use:
>
> ```ts
> import { createServerlessAdapterApp } from '@web-ts-toolkit/express-runtime/cli';
> const app = createServerlessAdapterApp(handler, { maxBodyBytes: 2 * 1024 * 1024 });
> ```
>
> `maxBodyBytes` must be a finite non-negative integer. `0` means only empty bodies are allowed
> (any non-empty body receives `413`). There is no unbounded default — omit the option to use the
> 1 MiB limit.

## Module API

### `createExpressApp(options?): Express`

Creates and returns a configured Express application. Middleware is applied in
the following lifecycle order:

1. `preMiddleware` _(logging, helmet, request-id)_
2. body parsers (`express.json`, `express.urlencoded`)
3. `middleware` _(cookies, sessions, auth, CORS)_
4. `routers` and `router`
5. `postMiddleware` _(404 catch-all)_
6. `finalize` _(routes that should be wrapped by `errorHandler`)_
7. `errorHandler`

Built-in hardening: `x-powered-by` is disabled, `etag` is off. `trust proxy`
defaults to **`false`** — opt in explicitly when behind a trusted upstream
proxy (otherwise `X-Forwarded-*` headers can be spoofed).

| Option             | Type                                        | Default                             | Description                                      |
| ------------------ | ------------------------------------------- | ----------------------------------- | ------------------------------------------------ |
| `preMiddleware`    | `(RequestHandler \| ErrorRequestHandler)[]` | `[]`                                | Registered before body parsers                   |
| `middleware`       | `(RequestHandler \| ErrorRequestHandler)[]` | `[]`                                | Registered after body parsers, before routers    |
| `postMiddleware`   | `(RequestHandler \| ErrorRequestHandler)[]` | `[]`                                | Registered after all routers                     |
| `json`             | `JsonOptions \| false`                      | `{ limit: '1mb' }`                  | `express.json()` options; `false` disables       |
| `urlencoded`       | `UrlEncodedOptions \| false`                | `{ extended: false, limit: '1mb' }` | `express.urlencoded()` options; `false` disables |
| `router`           | `RouterMount`                               | —                                   | Single router convenience                        |
| `routers`          | `RouterMount[]`                             | —                                   | Multiple routers mounted in order                |
| `trustProxy`       | `boolean \| number \| string \| string[]`   | `false`                             | Express `trust proxy` setting                    |
| `disablePoweredBy` | `boolean`                                   | `true`                              | Disable `x-powered-by` header                    |
| `etag`             | `boolean \| string`                         | `false`                             | Express `etag` setting                           |
| `finalize`         | `(app) => void`                             | —                                   | Hook to add routes that `errorHandler` catches   |
| `errorHandler`     | `ErrorRequestHandler`                       | —                                   | Error handler registered last                    |
| `logger`           | `Logger`                                    | `console`                           | Logger used internally                           |

`preMiddleware`, `middleware`, and `postMiddleware` also accept Express
`ErrorRequestHandler` functions for compatibility with Express' `app.use()`
semantics, but error handlers are slot-dependent: they only catch errors from
middleware and routes registered before their slot. Use `errorHandler` for the
final app-wide error handler, or register routes in `finalize()` so the built-in
default error logger and `errorHandler` can observe them. When `errorHandler` is
omitted, `createExpressApp()` logs unhandled errors that reach the factory-owned
pipeline through `logger.error('Unhandled Express error:', err)` and delegates to
Express' default final handler.

#### `RouterMount`

| Field     | Type                     | Description                                                                        |
| --------- | ------------------------ | ---------------------------------------------------------------------------------- |
| `path`    | `string \| () => string` | Mount path or function returning one (lets the mount path derive from runtime env) |
| `handler` | `RequestHandler`         | Router or middleware mounted at `path`                                             |

### `createServerlessHandler(app, options?): ServerlessHandler`

Wraps an Express app into a `serverless-http` handler. The generated function
accepts the provider event shapes supported by `serverless-http` and configured
through `serverlessOptions`; the local `start-serverless` adapter specifically
emulates AWS API Gateway REST API v1 / Lambda proxy events and results.

Returns a handler function with an attached `reset()` method to retry a settled
failed cold-start. `init()` successes, asynchronous rejections, and synchronous
throws are memoized. Calling `reset()` while initialization is still pending is a
no-op, so concurrent invocations cannot start multiple initializations.

| Option              | Type                                                    | Default                | Description                                                                             |
| ------------------- | ------------------------------------------------------- | ---------------------- | --------------------------------------------------------------------------------------- |
| `init`              | `() => Promise<void>`                                   | —                      | Called once per cold start; memoized (call `reset()` to retry)                          |
| `request`           | `(req, event, context) => void`                         | Buffer-body workaround | Hook called for each request before Express processes it                                |
| `response`          | `(res, event, context) => void`                         | —                      | Hook called after Express finishes processing                                           |
| `serverlessOptions` | `Omit<ServerlessHttp.Options, 'request' \| 'response'>` | —                      | Additional options forwarded to `serverless-http` (`provider`, `binary`, `basePath`, …) |
| `maxBodyBytes`      | `number`                                                | `1048576`              | Conversion threshold for the default `request` hook; larger bodies are left unchanged   |
| `logger`            | `Logger`                                                | `console`              | Logger used internally                                                                  |

The default `request` hook is intentionally conservative with serverless-http 4.
For AWS-style event shapes, serverless-http converts string, Buffer, and object
event bodies into a readable request stream before Express runs. JSON Buffer
bodies are therefore left for `express.json()` to parse once and for its `limit`
option to reject when oversized. For plain hook-unit inputs that are not readable
request streams, JSON is parsed only when the media type is exactly
`application/json` or a structured `application/*+json` type such as
`application/vnd.api+json`; parameters such as `charset=utf-8` are ignored for
matching. Prefix lookalikes such as `application/jsonp` and
`application/json-evil` are not JSON and are converted to UTF-8 strings like
other non-JSON Buffer bodies. Malformed JSON is treated as malformed client input:
the hook leaves the Buffer unchanged and does not log an internal server error.

`maxBodyBytes` on `createServerlessHandler()` is only the default hook's
conversion threshold. It is not an end-to-end request rejection limit and does
not replace Express parser limits or platform limits. In the local
`start-serverless` adapter, `--max-body-bytes` / `createServerlessAdapterApp({
maxBodyBytes })` is the enforced HTTP buffering limit that returns `413 Payload
Too Large` before invoking the handler.

The hook type aliases are generic over provider event and context:
`ServerlessRequestHook<TEvent, TContext>` and
`ServerlessResponseHook<TEvent, TContext>`. They mirror serverless-http 4's
runtime calls, which pass `(request, event, context)` before Express and
`(response, event, context)` after Express. The default generic is
`Record<string, unknown>` for both arguments; provide provider-specific event and
context types when you need typed access in hooks.

#### Netlify example

```ts
import { createExpressApp, createServerlessHandler } from '@web-ts-toolkit/express-runtime';
import { Handler } from '@netlify/functions';

const app = createExpressApp({
  routers: [{ path: () => '/.netlify/functions/main', handler: myRouter }],
});

export const handler: Handler = createServerlessHandler(app, { init: startDB });
```

### `startLocalServer(app, options?): LocalServer`

Binds an Express app to a TCP port (or named pipe) via `http.createServer`,
with friendly error handling and graceful shutdown. Returns `{ server, shutdown, ready }`.

Lifecycle state machine: `initializing` → `listening` → `stopping` → `stopped`, or `initializing` → `failed` on init/listen failure. Shutdown is single-flight and memoized: concurrent `shutdown()` calls and signals share one operation (logs, force-close, `onShutdown`, optional exit run at most once). Signal handlers owned by the instance are removed after shutdown or terminal failure; unrelated listeners are never removed.

Shutdown order and timeout policy: on `shutdown()`, the server first stops accepting new connections (`server.close`), drains in-flight requests up to `shutdownTimeout` (then `closeAllConnections`), and only then runs `onShutdown`. `shutdownTimeout` covers **only** request draining — `onShutdown` runs after draining and its errors are logged (`logger.error`) without rejecting `shutdown()`. If shutdown is requested before the server is listening (e.g. during a pending `init`), the pending `listen` is suppressed, `server.listening` remains `false`, and `ready` rejects. If the server was never started or was closed externally, `shutdown()` resolves deterministically without error.

Port `0` logs the actual bound port (e.g. `Server running at http://127.0.0.1:54321/ (port 54321)`).

| Option              | Type                          | Default                       | Description                                                                               |
| ------------------- | ----------------------------- | ----------------------------- | ----------------------------------------------------------------------------------------- |
| `port`              | `number \| string`            | `process.env.PORT ?? 8080`    | Port number or named-pipe path (use `0` for an ephemeral port; actual port is logged)     |
| `host`              | `string`                      | `process.env.HOST ?? 0.0.0.0` | Hostname (ignored for named pipes)                                                        |
| `init`              | `() => Promise<void>`         | —                             | Called once before listening; rejection rejects `ready` and skips listening               |
| `onShutdown`        | `() => Promise<void> \| void` | —                             | Called **after** draining (see shutdown order above)                                      |
| `onListening`       | `() => void`                  | —                             | Called when listening (after actual-port log)                                             |
| `onError`           | `(error) => void`             | logs + exits                  | Called on listen errors and init failures (init failures are not `listen` syscall errors) |
| `signals`           | `boolean \| NodeJS.Signals[]` | `true` (`SIGINT`, `SIGTERM`)  | Signal handlers to register (owned handlers removed on shutdown/terminal failure)         |
| `shutdownTimeout`   | `number`                      | `5000`                        | Max ms to wait for in-flight requests before force-closing (covers draining only)         |
| `exitAfterShutdown` | `boolean`                     | `false`                       | Call `process.exit(0)` after shutdown (the CLI sets `true`)                               |
| `logger`            | `Logger`                      | `console`                     | Logger used internally                                                                    |

#### `LocalServer`

| Field      | Type                  | Description                                                                          |
| ---------- | --------------------- | ------------------------------------------------------------------------------------ |
| `server`   | `http.Server`         | Underlying HTTP server                                                               |
| `shutdown` | `() => Promise<void>` | Trigger graceful shutdown (single-flight; see shutdown order above)                  |
| `ready`    | `Promise<void>`       | Resolves when listening, rejects on init/listen failure or shutdown before listening |

Callers can `await local.ready` to observe listening or catch init/listen failures without `unhandledRejection`. Example:

```ts
const local = startLocalServer(app, { port: 0, host: '127.0.0.1' });
try {
  await local.ready;
  console.log('listening on', (local.server.address() as { port: number }).port);
} catch (err) {
  console.error('failed to start', err);
}
```

### `Logger`

```ts
interface Logger {
  log: (...args: unknown[]) => void;
  error: (...args: unknown[]) => void;
  debug?: (...args: unknown[]) => void;
}
```

## Public API Ownership

The root package is the supported runtime API. Supported consumer API exports are
`createExpressApp`, `createServerlessHandler`, `startLocalServer`,
`ExpressAppOptions`, `RouterMount`, `Logger`, `ServerlessHandler`,
`ServerlessHandlerOptions`, `ServerlessHttpOptions`, `ServerlessRequest`,
`ServerlessRequestHook`, `ServerlessResponse`, `ServerlessResponseHook`,
`LocalServer`, `LocalServerOptions`, and `LocalServerState`.

Root extension seams kept public for wrappers and advanced integrations are
`defaultRequestHook`, `normalizePort`, `parsePortValue`, `validateFiniteInteger`,
`Express`, `RequestHandler`, `ErrorRequestHandler`, and
`RawServerlessHttpOptions`. No root export is classified as an internal
test-only detail.

The `@web-ts-toolkit/express-runtime/cli` subpath is a supported programmatic CLI
facade used by packages such as `@web-ts-toolkit/access-router-runtime`.
Supported consumer API exports are `parseArgs`, `runCliCommand`, `runDevCommand`,
`runExpressDevCommand`, `runBuildEntryCommand`, `RuntimeCliCommand`,
`DevCommandRunner`, `BuildEntryCommandOptions`, `DevArgs`, `BuildArgs`,
`StartArgs`, `StartServerlessArgs`, `ParsedArgs`, `Subcommand`,
`RuntimeModuleInit`, `GenericHandler`, `ApiGatewayRestEvent`,
`ServerlessResult`, `ServerlessAdapterOptions`, `CLI_VERSION`,
`DEFAULT_ADAPTER_MAX_BODY_BYTES`, `TEMP_BUILD_ENTRY_FILENAME`, and
`TEMP_SERVERLESS_ENTRY_FILENAME`.

Intentional `/cli` extension seams for custom wrappers are `readValue`,
`printHelp`, `isExpressApp`, `extractExport`, `resolveExport`, `loadApp`,
`loadBuiltApp`, `loadHandler`, `parseEnvFile`, `loadEnvFiles`,
`preloadModules`, `buildChildArgs`, `runWithWatch`, `generateRuntimeEntry`,
`generateServerlessEntry`, `validateOutDirForClean`,
`buildBundleFromEntryContent`, `buildRuntime`, `buildServerless`,
`validateMaxBodyBytes`, `collectBody`, `toServerlessEvent`,
`applyServerlessResult`, and `createServerlessAdapterApp`. No `/cli` export is
classified as an internal test-only detail; low-level names remain documented and
export-locked for compatibility rather than being justified by source tests.

Build tooling is intentionally not split into a second package yet. The current
package packs to about 68 KiB compressed / 313 KiB unpacked, and a measured root
CommonJS import loads the runtime surface without loading `tsup` or `esbuild`.
Splitting the build CLI can be reconsidered if install-size policy changes, but
it is not required for ordinary `createExpressApp`, `createServerlessHandler`, or
`startLocalServer` imports.

## CLI

Programmatic CLI helpers are also available from the public subpath `@web-ts-toolkit/express-runtime/cli` when another package wants to reuse the same parsing, build, watch, env-loading, or start logic without shelling out to the `wtt-express-runtime` binary.

### `wtt-express-runtime <command> <app-module> [options]`

Omitting `<command>` defaults to `dev` for backward compatibility.

| Command            | Description                                                                         |
| ------------------ | ----------------------------------------------------------------------------------- |
| `dev`              | Run the Express app as a local dev server (`http.createServer` + graceful shutdown) |
| `build`            | Bundle the Express app as a local runtime module                                    |
| `start`            | Run a bundled local app module with `startLocalServer()`                            |
| `build-serverless` | Bundle the Express app as a serverless handler                                      |
| `start-serverless` | Run a bundled serverless handler locally (HTTP ↔ serverless event adapter)          |

#### dev options

| Option                    | Description                                                                               |
| ------------------------- | ----------------------------------------------------------------------------------------- |
| `<app-module>`            | Module path whose **default export** is an Express app or an async function returning one |
| `--port <number>`         | Port or named pipe (default: `process.env.PORT` or `8080`)                                |
| `--host <hostname>`       | Hostname to bind (default: `process.env.HOST` or `0.0.0.0`)                               |
| `--no-signals`            | Disable `SIGINT` / `SIGTERM` handler registration                                         |
| `--shutdown-timeout <ms>` | Max ms to wait for in-flight requests (default: `5000`)                                   |
| `--require <module>`      | Module(s) to preload before app load (repeatable; comma-separated values supported)       |
| `--env <path>`            | Env file(s) to load before app load (repeatable; existing env vars are not overridden)    |
| `--watch <paths>`         | Comma-separated paths to watch for restart (repeatable; forks a child process)            |
| `--ext <extensions>`      | Comma-separated extensions to watch (default: `ts,js,mjs,cjs,json`)                       |
| `--delay <ms>`            | Debounce ms before restarting on change (default: `500`)                                  |

#### build options

| Option                | Description                                                                      |
| --------------------- | -------------------------------------------------------------------------------- |
| `<app-module>`        | Module path whose **default export** is an Express app (sync, not async factory) |
| `--init <path>`       | Init hook module (default export, async function) called once per cold start     |
| `--out-dir <path>`    | Output directory (default: `dist`)                                               |
| `--out-name <name>`   | Output filename without extension (default: `app`)                               |
| `--format <cjs\|esm>` | Output format (default: `cjs`)                                                   |
| `--target <target>`   | Compilation target (default: `node22`)                                           |
| `--external <pkg>`    | Mark package as external (repeatable; `express` is always external)              |
| `--no-clean`          | Don't clean the output directory before building                                 |

#### start options

| Option                    | Description                                                                                      |
| ------------------------- | ------------------------------------------------------------------------------------------------ |
| `<app-module>`            | JS/CJS module path default-exporting an Express app (or exporting `app`) — the output of `build` |
| `--port <number>`         | Port or named pipe (default: `process.env.PORT` or `8080`)                                       |
| `--host <hostname>`       | Hostname to bind (default: `process.env.HOST` or `0.0.0.0`)                                      |
| `--no-signals`            | Disable `SIGINT` / `SIGTERM` handler registration                                                |
| `--shutdown-timeout <ms>` | Max ms to wait for in-flight requests (default: `5000`)                                          |
| `--require <module>`      | Module(s) to preload before app load (repeatable; comma-separated values supported)              |
| `--env <path>`            | Env file(s) to load before app load (repeatable; existing env vars are not overridden)           |

#### build-serverless options

| Option                | Description                                                                      |
| --------------------- | -------------------------------------------------------------------------------- |
| `<app-module>`        | Module path whose **default export** is an Express app (sync, not async factory) |
| `--init <path>`       | Init hook module (default export, async function) called once per cold start     |
| `--out-dir <path>`    | Output directory (default: `dist`)                                               |
| `--out-name <name>`   | Output filename without extension (default: `handler`)                           |
| `--format <cjs\|esm>` | Output format (default: `cjs`)                                                   |
| `--target <target>`   | Compilation target (default: `node22`)                                           |
| `--external <pkg>`    | Mark package as external (repeatable; `express` is always external)              |
| `--no-clean`          | Don't clean the output directory before building                                 |

#### start-serverless options

| Option                     | Description                                                                                  |
| -------------------------- | -------------------------------------------------------------------------------------------- |
| `<handler-module>`         | JS/CJS module path exporting `handler` (named or default) — the output of `build-serverless` |
| `--port <number>`          | Port or named pipe (default: `process.env.PORT` or `8080`)                                   |
| `--host <hostname>`        | Hostname to bind (default: `process.env.HOST` or `0.0.0.0`)                                  |
| `--no-signals`             | Disable `SIGINT` / `SIGTERM` handler registration                                            |
| `--shutdown-timeout <ms>`  | Max ms to wait for in-flight requests (default: `5000`)                                      |
| `--max-body-bytes <bytes>` | Max request body bytes for adapter (default: `1048576`; `0` allows empty bodies only)        |
| `--require <module>`       | Module(s) to preload before handler load (repeatable; comma-separated values supported)      |
| `--env <path>`             | Env file(s) to load before handler load (repeatable; existing env vars are not overridden)   |

#### global options

| Option          | Description           |
| --------------- | --------------------- |
| `-V, --version` | Print the CLI version |
| `-h, --help`    | Show help             |

Use `--` to stop option parsing when a positional module path starts with a
dash, for example `wtt-express-runtime dev -- --app.js`. Numeric CLI values are
validated before env files, preload modules, app modules, watchers, or servers
are opened. Ports must be canonical decimal integers in `0..65535` or explicit
nonnumeric named-pipe paths; timeout, delay, and adapter body-limit values must
be finite integers in `0..9007199254740991`.

The `dev` command sets `exitAfterShutdown: true` so `SIGINT` / `SIGTERM` cleanly
exit the process after the server drains. TypeScript app modules require a TS
loader (see the Quick Start CLI section for a `tsx` invocation).

Watch mode validates all watch paths before opening watchers. Runtime watcher
errors, child spawn errors, unexpected child exits, and failed child termination
produce one diagnostic and exit nonzero. Repeated `SIGINT` / `SIGTERM` signals
share the same shutdown, and file-change timers are canceled once shutdown
starts.

The `build` command generates a temporary entry file that re-exports the app
module and optional `init` hook, then produces a local runtime bundle. The
`build-serverless` command instead wraps the app with `createServerlessHandler`
and bundles the serverless runtime. `express` is always external; all other
dependencies are bundled into the output unless marked external via
`--external`.

## License

Apache-2.0
