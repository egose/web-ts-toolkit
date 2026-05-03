# @web-ts-toolkit/express-json-router

Express router wrapper that wires route handlers through `@web-ts-toolkit/express-response-handler` and keeps track of registered endpoints.

## Installation

```sh
pnpm add @web-ts-toolkit/express-json-router express
```

## Usage

```ts
import express from 'express';
import JsonRouter from '@web-ts-toolkit/express-json-router';

const app = express();
const router = new JsonRouter('/api');

router.get('/health', () => ({ ok: true }));

router.get('/users/:id', () => {
  throw new JsonRouter.clientErrors.NotFoundError('User not found');
});

JsonRouter.errorMessageProvider = (error) => {
  if (error instanceof Error) {
    return { message: error.message };
  }

  return { message: String(error) };
};

app.use(router.original);
```

## Behavior

- Route handlers can return plain values, promises, `JsonRouter.HttpResponse.*` helpers, or throw `JsonRouter.clientErrors.*` errors.
- Router-level middleware can be passed as a single function or an array in the constructor.
- `router.route(path)` supports the same JSON-aware handler behavior as `router.get(path, ...)`, `router.post(path, ...)`, and the other Express router methods exposed by the instance.
- `router.getEndpoints()` returns a snapshot of the registered endpoints in registration order.

## Hooks

The package forwards the shared hooks from `@web-ts-toolkit/express-response-handler` through static properties on `JsonRouter`.

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

These hooks are shared process-wide because they proxy the default response-handler instance.

## API

`new JsonRouter(basePath?, middlewares?)`

Creates a JSON-aware Express router. `basePath` accepts values like `'/api'`, `'api'`, or `'api/'` and is normalized for route registration.

`router.original`

Returns the underlying Express router so it can be mounted with `app.use(...)`.

`router.route(path)`

Builds chained route registrations such as `router.route('/users').get(...).post(...)`.

`router.getEndpoints()`

Returns `{ method, path }[]` for the routes registered through `JsonRouter`.

`JsonRouter.clientErrors`

Re-exports the HTTP error classes from `@web-ts-toolkit/http-errors`.

`JsonRouter.success`

Re-exports success response classes such as `JsonRouter.success.Created`.

`JsonRouter.HttpResponse`

Exposes helper constructors such as `JsonRouter.HttpResponse.ok(...)` and `JsonRouter.HttpResponse.created(...)`.

`JsonRouter.errorMessageProvider`

Overrides the error-to-payload mapping used for non-HTTP errors.

`JsonRouter.preJson`, `JsonRouter.postJson`, `JsonRouter.preError`, `JsonRouter.postError`

Expose the shared serialization and error hooks from `@web-ts-toolkit/express-response-handler`.
