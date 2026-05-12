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

## Structured Error Formats

`JsonRouter` uses the shared default response handler out of the box. If you want a different error format such as RFC 9457, create a custom handler and pass it to the router constructor:

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

## Behavior

- Route handlers can return plain values, promises, `JsonRouter.HttpResponse.*` helpers, or throw `JsonRouter.clientErrors.*` errors.
- Router-level middleware can be passed as a single function or an array in the constructor.
- A custom response-handler instance can be passed as the third constructor argument when you need `aip193` or `rfc9457` error formatting.
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

`new JsonRouter(basePath?, middlewares?, responseHandler?)`

Creates a JSON-aware Express router. `basePath` accepts values like `'/api'`, `'api'`, or `'api/'` and is normalized for route registration. `responseHandler` defaults to the shared handler instance from `@web-ts-toolkit/express-response-handler`.

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

`JsonRouter.defaultHandler`

Exposes the shared default response-handler instance used by `JsonRouter` when no custom handler is provided.

`JsonRouter.ErrorFormats`

Exposes named error format constants such as `JsonRouter.ErrorFormats.rfc9457`.

`JsonRouter.createHandler`

Re-exports `createHandler(...)` from `@web-ts-toolkit/express-response-handler` so you can provide a custom handler instance to the router.

`JsonRouter.errorMessageProvider`

Overrides the error-to-payload mapping used for non-HTTP errors.

`JsonRouter.preJson`, `JsonRouter.postJson`, `JsonRouter.preError`, `JsonRouter.postError`

Expose the shared serialization and error hooks from `@web-ts-toolkit/express-response-handler`.
