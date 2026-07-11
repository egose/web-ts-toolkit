# `@web-ts-toolkit/express-runtime`

Express app factory plus serverless handler and local dev server helpers. Build
one Express app, run it as a serverless function **or** a local dev server with
minimal wiring changes. A CLI binary runs any Express app locally from a module
path.

## Installation

```sh
pnpm add @web-ts-toolkit/express-runtime express
```

## Highlights

- `createExpressApp()` — Express factory with pluggable lifecycle slots
  (`preMiddleware`, `middleware`, `routers`, `postMiddleware`, `finalize`,
  `errorHandler`), hardening defaults, and per-logger injection.
- `createServerlessHandler()` — wraps an Express app as a platform-agnostic
  serverless handler (Netlify, Vercel, AWS Lambda) with a Buffer-body
  workaround for serverless-http issue #305, a memoized `init` hook for cold
  starts, and a `reset()` escape hatch for failed cold starts.
- `startLocalServer()` — `http.createServer` + `listen` with friendly
  `EADDRINUSE` / `EACCES` errors, optional graceful `SIGINT` / `SIGTERM`
  shutdown that drains in-flight requests, and a configurable timeout.
- CLI binary with three subcommands:
  - `dev` — run an Express app as a local dev server
  - `build` — bundle the app as a serverless handler using `tsup`
  - `start` — smoke-test the bundled handler locally by translating HTTP ↔ serverless events

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

The `web-ts-toolkit-express-runtime dev` command runs any module that
default-exports an Express app (or an async function returning one) as a local
dev server:

```sh
npx web-ts-toolkit-express-runtime dev ./dist/app.js --port 3000 --host localhost
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
npx tsx ./node_modules/@web-ts-toolkit/express-runtime/dist/cli.js dev ./src/app.ts
```

> The `dev` command evaluates arbitrary code from `<app-module>` in the current
> process and inherits its privileges. Init logic (e.g. DB connections) should
> be placed at the top level of your app module since `dev` does not expose an
> `init` hook.

### CLI — build (serverless bundle)

The `build` command generates a temporary serverless entry that wraps the app
with `createServerlessHandler`, then bundles it with `tsup` into a
deployment-ready file:

```sh
npx web-ts-toolkit-express-runtime build ./src/app.ts --out-dir netlify/functions
```

With an optional init hook (DB connections, cache warmup, etc.):

```sh
npx web-ts-toolkit-express-runtime build ./src/app.ts --init ./src/init.ts --out-dir netlify/functions
```

```ts
// src/init.ts
export default async () => {
  await mongoose.connect(process.env.MONGODB_URI);
};
```

This produces `netlify/functions/handler.js` (configurable via `--out-name`)
that exports a `handler` function compatible with Netlify, Vercel, AWS Lambda,
and any platform that calls `(event, context)`.

> `tsup` is required for `build`: `pnpm add -D tsup`. `express` is always
> external; additional externals can be added via `--external`.

### CLI — start (run a bundled handler locally)

The `start` command runs a bundled serverless handler locally by translating
HTTP requests into serverless events and the handler's results back into HTTP
responses — letting you smoke-test the exact `build` output without a
serverless platform:

```sh
npx web-ts-toolkit-express-runtime build ./src/app.ts --out-dir dist
npx web-ts-toolkit-express-runtime start ./dist/handler.js --port 9000
```

The handler module must export a `handler` function (named or default) that
accepts `(event, context)` and returns a result with `statusCode`, `headers`,
and `body` — the same shape produced by `createServerlessHandler` via
`serverless-http`.

> The adapter passes the raw request body as a Buffer (no body parsing) so the
> handler's request hook, including the serverless-http #305 workaround, runs
> identically to production.

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

| Option             | Type                                      | Default                             | Description                                      |
| ------------------ | ----------------------------------------- | ----------------------------------- | ------------------------------------------------ |
| `preMiddleware`    | `RequestHandler[]`                        | `[]`                                | Registered before body parsers                   |
| `middleware`       | `RequestHandler[]`                        | `[]`                                | Registered after body parsers, before routers    |
| `postMiddleware`   | `RequestHandler[]`                        | `[]`                                | Registered after all routers                     |
| `json`             | `JsonOptions \| false`                    | `{ limit: '1mb' }`                  | `express.json()` options; `false` disables       |
| `urlencoded`       | `UrlEncodedOptions \| false`              | `{ extended: false, limit: '1mb' }` | `express.urlencoded()` options; `false` disables |
| `router`           | `RouterMount`                             | —                                   | Single router convenience                        |
| `routers`          | `RouterMount[]`                           | —                                   | Multiple routers mounted in order                |
| `trustProxy`       | `boolean \| number \| string \| string[]` | `false`                             | Express `trust proxy` setting                    |
| `disablePoweredBy` | `boolean`                                 | `true`                              | Disable `x-powered-by` header                    |
| `etag`             | `boolean \| string`                       | `false`                             | Express `etag` setting                           |
| `finalize`         | `(app) => void`                           | —                                   | Hook to add routes that `errorHandler` catches   |
| `errorHandler`     | `ErrorRequestHandler`                     | —                                   | Error handler registered last                    |
| `logger`           | `Logger`                                  | `console`                           | Logger used internally                           |

#### `RouterMount`

| Field     | Type                     | Description                                                                        |
| --------- | ------------------------ | ---------------------------------------------------------------------------------- |
| `path`    | `string \| () => string` | Mount path or function returning one (lets the mount path derive from runtime env) |
| `handler` | `RequestHandler`         | Router or middleware mounted at `path`                                             |

### `createServerlessHandler(app, options?): ServerlessHandler`

Wraps an Express app into a platform-agnostic serverless handler. Works with
Netlify, Vercel, AWS Lambda, and any platform that calls `(event, context)`.

Returns a handler function with an attached `reset()` method to retry a failed
cold-start (`init()` rejections are memoized alongside successes).

| Option              | Type                                                    | Default                | Description                                                                             |
| ------------------- | ------------------------------------------------------- | ---------------------- | --------------------------------------------------------------------------------------- |
| `init`              | `() => Promise<void>`                                   | —                      | Called once per cold start; memoized (call `reset()` to retry)                          |
| `request`           | `(req) => void`                                         | Buffer-body workaround | Hook called for each request before Express processes it                                |
| `response`          | `(res) => void`                                         | —                      | Hook called after Express finishes processing                                           |
| `serverlessOptions` | `Omit<ServerlessHttp.Options, 'request' \| 'response'>` | —                      | Additional options forwarded to `serverless-http` (`provider`, `binary`, `basePath`, …) |
| `maxBodyBytes`      | `number`                                                | `1048576`              | Skip parsing bodies larger than this in the default `request` hook                      |
| `logger`            | `Logger`                                                | `console`              | Logger used internally                                                                  |

The default `request` hook works around [serverless-http issue #305](https://github.com/dougmoscrop/serverless-http/issues/305)
by parsing `Buffer` bodies into JSON (when `content-type` starts with
`application/json`, including charset variations) or UTF-8 strings.

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
with friendly error handling and graceful shutdown. Returns `{ server, shutdown }`.

| Option              | Type                          | Default                       | Description                                                 |
| ------------------- | ----------------------------- | ----------------------------- | ----------------------------------------------------------- |
| `port`              | `number \| string`            | `process.env.PORT ?? 8080`    | Port number or named-pipe path                              |
| `host`              | `string`                      | `process.env.HOST ?? 0.0.0.0` | Hostname (ignored for named pipes)                          |
| `init`              | `() => Promise<void>`         | —                             | Called once before listening                                |
| `onShutdown`        | `() => Promise<void> \| void` | —                             | Called on graceful shutdown                                 |
| `onListening`       | `() => void`                  | —                             | Called when listening                                       |
| `onError`           | `(error) => void`             | logs + exits                  | Called on server errors                                     |
| `signals`           | `boolean \| NodeJS.Signals[]` | `true` (`SIGINT`, `SIGTERM`)  | Signal handlers to register                                 |
| `shutdownTimeout`   | `number`                      | `5000`                        | Max ms to wait for in-flight requests before force-closing  |
| `exitAfterShutdown` | `boolean`                     | `false`                       | Call `process.exit(0)` after shutdown (the CLI sets `true`) |
| `logger`            | `Logger`                      | `console`                     | Logger used internally                                      |

#### `LocalServer`

| Field      | Type                  | Description                                           |
| ---------- | --------------------- | ----------------------------------------------------- |
| `server`   | `http.Server`         | Underlying HTTP server                                |
| `shutdown` | `() => Promise<void>` | Trigger graceful shutdown (drains in-flight requests) |

### `Logger`

```ts
interface Logger {
  log: (...args: unknown[]) => void;
  error: (...args: unknown[]) => void;
  debug?: (...args: unknown[]) => void;
}
```

## CLI

### `web-ts-toolkit-express-runtime <command> <app-module> [options]`

Omitting `<command>` defaults to `dev` for backward compatibility.

| Command | Description                                                                         |
| ------- | ----------------------------------------------------------------------------------- |
| `dev`   | Run the Express app as a local dev server (`http.createServer` + graceful shutdown) |
| `build` | Bundle the Express app as a serverless handler using `tsup`                         |
| `start` | Run a bundled serverless handler locally (HTTP ↔ serverless event adapter)          |

#### dev options

| Option                    | Description                                                                               |
| ------------------------- | ----------------------------------------------------------------------------------------- |
| `<app-module>`            | Module path whose **default export** is an Express app or an async function returning one |
| `--port <number>`         | Port or named pipe (default: `process.env.PORT` or `8080`)                                |
| `--host <hostname>`       | Hostname to bind (default: `process.env.HOST` or `0.0.0.0`)                               |
| `--no-signals`            | Disable `SIGINT` / `SIGTERM` handler registration                                         |
| `--shutdown-timeout <ms>` | Max ms to wait for in-flight requests (default: `5000`)                                   |

#### build options

| Option                | Description                                                                      |
| --------------------- | -------------------------------------------------------------------------------- |
| `<app-module>`        | Module path whose **default export** is an Express app (sync, not async factory) |
| `--init <path>`       | Init hook module (default export, async function) called once per cold start     |
| `--out-dir <path>`    | Output directory (default: `dist`)                                               |
| `--out-name <name>`   | Output filename without extension (default: `handler`)                           |
| `--format <cjs\|esm>` | Output format (default: `cjs`)                                                   |
| `--target <target>`   | Compilation target (default: `node20`)                                           |
| `--external <pkg>`    | Mark package as external (repeatable; `express` is always external)              |
| `--no-clean`          | Don't clean the output directory before building                                 |

#### start options

| Option                    | Description                                                                       |
| ------------------------- | --------------------------------------------------------------------------------- |
| `<handler-module>`        | JS/CJS module path exporting `handler` (named or default) — the output of `build` |
| `--port <number>`         | Port or named pipe (default: `process.env.PORT` or `8080`)                        |
| `--host <hostname>`       | Hostname to bind (default: `process.env.HOST` or `0.0.0.0`)                       |
| `--no-signals`            | Disable `SIGINT` / `SIGTERM` handler registration                                 |
| `--shutdown-timeout <ms>` | Max ms to wait for in-flight requests (default: `5000`)                           |

#### global options

| Option          | Description           |
| --------------- | --------------------- |
| `-V, --version` | Print the CLI version |
| `-h, --help`    | Show help             |

The `dev` command sets `exitAfterShutdown: true` so `SIGINT` / `SIGTERM` cleanly
exit the process after the server drains. TypeScript app modules require a TS
loader (see the Quick Start CLI section for a `tsx` invocation).

The `build` command generates a temporary entry file that imports the app
module and wraps it with `createServerlessHandler`, then invokes `tsup` to
produce a self-contained bundle. `express` is always external; all other
dependencies (including `@web-ts-toolkit/express-runtime` and `serverless-http`)
are bundled into the output unless marked external via `--external`.

## License

Apache-2.0
