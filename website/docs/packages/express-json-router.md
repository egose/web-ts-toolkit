---
sidebar_label: Express JSON Router
sidebar_position: 2
---

# `@web-ts-toolkit/express-json-router`

Express router wrapper that wires route handlers through `@web-ts-toolkit/express-response-handler` and keeps track of registered endpoints.

## Installation

```bash npm2yarn
npm install @web-ts-toolkit/express-json-router express
npm install --save-dev @types/express
```

## Quick Start

```ts
import express from 'express';
import JsonRouter from '@web-ts-toolkit/express-json-router';

const app = express();
JsonRouter.errorMessageProvider = (error) => {
  if (error instanceof Error) {
    return { message: error.message };
  }

  return { message: String(error) };
};

const router = new JsonRouter('/api');

router.get('/health', () => ({ ok: true }));

router.get('/users/:id', () => {
  throw new JsonRouter.clientErrors.NotFoundError('User not found');
});

app.use(router.original);
```

`JsonRouter` is a good fit when you want Express routes to behave more like small return-value handlers than manual `res.json(...)` controllers.

## What It Exposes

Main exports:

- default-only `JsonRouter` class export
- `JsonRouter.HttpResponse`
- `JsonRouter.clientErrors`
- `JsonRouter.success`
- `JsonRouter.createHandler(...)`
- `JsonRouter.ErrorFormats`
- type imports: `JsonRouterCallback`, `JsonRouterEndpoint`, `JsonRouterHandlerInput`, `JsonRouterMethod`, `JsonRouterMiddlewares`, `JsonRouterRouteRegistrar`, `JsonRouteBuilder`

There are no documented subpaths for this package. The public surface is the root package export.

## Common Patterns

### Route-level middleware

Pass middleware in the constructor when every route on the router should share the same request preconditions.

```ts
import type { RequestHandler } from 'express';

const requireAuth: RequestHandler = (_req, _res, next) => next();
const requireProjectScope: RequestHandler = (_req, _res, next) => next();

const router = new JsonRouter('/api', [requireAuth, requireProjectScope]);

router.get('/me', (req) => ({ userId: req.get('x-user-id') ?? 'anonymous' }));
router.get('/projects', async () => []);
```

Those middleware functions run before the final JSON-aware handler on each registered route.

### Chained route registration

Use `router.route(path)` when you want grouped handlers for the same path.

```ts
async function getUser(id: string) {
  return { id };
}

async function updateUser(id: string, body: unknown) {
  return { id, body };
}

router
  .route('/users/:id')
  .get(async (req) => getUser(req.params.id))
  .patch(async (req) => updateUser(req.params.id, req.body))
  .delete(async (req) => JsonRouter.HttpResponse.noContent());
```

### Endpoint introspection

`getEndpoints()` is useful for debugging, tests, or building lightweight route documentation.

```ts
async function createJob() {
  return { id: 'job_1' };
}

router.get('/health', () => ({ ok: true }));
router.post('/jobs', async () => JsonRouter.HttpResponse.created(await createJob()));

router.getEndpoints();
// [
//   { method: 'GET', path: '/api/health' },
//   { method: 'POST', path: '/api/jobs' },
// ]
```

## Structured Error Formats

`JsonRouter` creates a response handler from the current static defaults when each router is constructed. If you want a different error format such as RFC 9457, create a custom handler and pass it to the router constructor:

```ts
import JsonRouter from '@web-ts-toolkit/express-json-router';
import { BadRequestError } from '@web-ts-toolkit/http-errors';

const responseHandler = JsonRouter.createHandler({
  errorFormat: JsonRouter.ErrorFormats.rfc9457,
  errorDomain: 'api.example.com',
});

const router = new JsonRouter('/api', undefined, responseHandler);

router.get('/users', () => {
  throw new BadRequestError('invalid email', {
    type: 'https://api.example.com/problems/invalid-email',
    title: 'Invalid email address',
    errors: [
      {
        detail: 'must be a valid email address',
        pointer: '#/email',
      },
    ],
  });
});
```

The static hook properties such as `JsonRouter.preJson` and `JsonRouter.errorMessageProvider` still proxy the shared default handler. When you pass a custom handler instance, configure that handler directly before giving it to the router.

### Handler defaults vs isolated handlers

Static properties configure defaults for routers created after the change:

```ts
JsonRouter.preError = async (error) => {
  console.error('shared router error', error);
};

const firstRouter = new JsonRouter('/api');
```

Routers created before a static default changes keep the handler they captured during construction. `JsonRouter.defaultHandler` also returns a newly configured handler each time it is read; it is not a shared mutable instance.

If you want isolated behavior per router, create and pass an explicit handler:

```ts
const handler = JsonRouter.createHandler({
  errorFormat: JsonRouter.ErrorFormats.aip193,
  errorDomain: 'api.example.com',
});

handler.preError = async (error) => {
  console.error('admin router error', error);
};

const adminRouter = new JsonRouter('/admin', undefined, handler);
```

## Behavior

- Route handlers can return plain values, promises, `JsonRouter.HttpResponse.*` helpers, or throw `JsonRouter.clientErrors.*` errors.
- Router-level middleware can be passed as a single function or an array in the constructor.
- A custom response-handler instance can be passed as the third constructor argument when you need `aip193` or `rfc9457` error formatting.
- `router.route(path)` supports the same JSON-aware handler behavior as `router.get(path, ...)`, `router.post(path, ...)`, and the other Express router methods exposed by the instance.
- `basePath`, route method paths, and `router.route(path)` intentionally accept string paths only. Express `RegExp` paths and path pattern arrays are rejected with a package-level `TypeError` before registration because `getEndpoints()` returns string metadata.
- `router.getEndpoints()` returns a snapshot of the registered endpoints in registration order.
- `router.use(...)` and `router.param(...)` are still available on the instance when you need normal Express router behavior.

## Hooks

The package forwards hook defaults from `@web-ts-toolkit/express-response-handler` through static properties on `JsonRouter`.

```ts
JsonRouter.preJson = (value) => {
  console.log('about to serialize', value);
};

JsonRouter.postJson = (value) => {
  console.log('serialized', value);
};

JsonRouter.preError = (error) => {
  console.error('request failed', error);
};
```

These static hooks are process-wide defaults for newly created routers and newly read `JsonRouter.defaultHandler` instances. Pass a custom response-handler instance to the constructor when you need isolated hook or error-provider state.

Hooks are observational side effects. They may return `void` or `Promise<void>`, but returned values never transform response payloads. `preJson` and `preError` run before serialization. `postJson` and `postError` run only after a successful HTTP `finish`; they do not run after client `close` or failed serialization. Pre-hook failures use the normal error response path, while post-hook failures are passed to Express with `next(err)` after the response has finished.

## API

`new JsonRouter(basePath?, middlewares?, responseHandler?)`

Creates a JSON-aware Express router. `basePath` accepts string values like `'/api'`, `'api'`, or `'api/'` and is normalized for route registration. Non-string values are rejected with `TypeError: JsonRouter basePath must be a string path`. `responseHandler` defaults to a fresh handler created from the current static defaults.

`router.original`

Returns the underlying Express router so it can be mounted with `app.use(...)`.

`router.route(path)`

Builds chained route registrations such as `router.route('/users').get(...).post(...)`. Paths must be strings; Express `RegExp` paths and path pattern arrays are intentionally not supported because endpoint introspection returns `{ method, path: string }` metadata. Non-string route paths fail synchronously with `TypeError: JsonRouter route path must be a string path` before Express registration or endpoint recording.

`router.use(...)` and `router.param(...)`

Forward directly to the underlying Express router for compatibility with normal Express middleware and param handling.

`router.getEndpoints()`

Returns `{ method, path }[]` for the routes registered through `JsonRouter`.

`JsonRouter.clientErrors`

Re-exports the HTTP error classes from `@web-ts-toolkit/http-errors`.

`JsonRouter.success`

Re-exports success response classes such as `JsonRouter.success.Created`.

`JsonRouter.HttpResponse`

Exposes helper constructors such as `JsonRouter.HttpResponse.ok(...)` and `JsonRouter.HttpResponse.created(...)`.

`JsonRouter.defaultHandler`

Returns a newly configured response-handler instance using the current static defaults. Existing routers keep the handler instance captured during construction.

`JsonRouter.ErrorFormats`

Exposes named error format constants such as `JsonRouter.ErrorFormats.rfc9457`.

`JsonRouter.createHandler`

Re-exports `createHandler(...)` from `@web-ts-toolkit/express-response-handler` so you can provide a custom handler instance to the router.

`JsonRouter.errorMessageProvider`

Overrides the error-to-payload mapping used for non-HTTP errors.

`JsonRouter.preJson`, `JsonRouter.postJson`, `JsonRouter.preError`, `JsonRouter.postError`

Expose the shared serialization and error hooks from `@web-ts-toolkit/express-response-handler`.

## Related Packages

- [`@web-ts-toolkit/express-response-handler`](./express-response-handler)
- [`@web-ts-toolkit/http-errors`](./http-errors)
