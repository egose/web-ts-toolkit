# `@web-ts-toolkit/express-json-router`

Express router wrapper that routes handler return values through `@web-ts-toolkit/express-response-handler`.

## Installation

```sh
pnpm add @web-ts-toolkit/express-json-router express
pnpm add -D @types/express
```

## Highlights

- return plain values from route handlers
- throw typed HTTP errors
- use custom response-handler instances when you need isolated behavior
- inspect registered endpoints with `getEndpoints()`
- review supported Express route methods with `JsonRouter.supportedMethods`

## Quick Start

```ts
import express from 'express';
import JsonRouter from '@web-ts-toolkit/express-json-router';

const app = express();
const router = new JsonRouter('/api');

router.get('/health', () => ({ ok: true }));

router.get('/users/:id', () => {
  throw new JsonRouter.clientErrors.NotFoundError('User not found');
});

app.use(router.original);
```

## Main Exports

- default-only `JsonRouter` class export
- `JsonRouter.HttpResponse`
- `JsonRouter.clientErrors`
- `JsonRouter.success`
- `JsonRouter.createHandler(...)`
- `JsonRouter.ErrorFormats`
- type imports: `JsonRouterCallback`, `JsonRouterEndpoint`, `JsonRouterHandlerInput`, `JsonRouterMethod`, `JsonRouterMiddlewares`, `JsonRouterRouteRegistrar`, `JsonRouteBuilder`

```ts
import JsonRouter, { type JsonRouterCallback } from '@web-ts-toolkit/express-json-router';

type UserParams = { id: string };

const getUser: JsonRouterCallback<UserParams> = (req) => ({
  id: req.params.id,
});

new JsonRouter('/api').get('/users/:id', getUser);
```

## Supported Route Methods

`JsonRouter.supportedMethods` is the reviewed method contract used for runtime registration, route builder types, endpoint metadata, and emitted declarations. The list tracks the stable route methods exposed by the supported Express 5 runtime.

Route paths intentionally use a narrower contract than Express: `basePath`, route method paths, and `router.route(path)` must be strings. Express also accepts `RegExp` and path pattern arrays, but `JsonRouter` keeps string-only paths so `getEndpoints()` can continue returning unambiguous `{ method, path }` metadata. JavaScript callers that pass a non-string path receive `TypeError: JsonRouter route path must be a string path` or `TypeError: JsonRouter basePath must be a string path` before any endpoint is recorded.

Every listed method is available on both the router and route builders:

```ts
import JsonRouter from '@web-ts-toolkit/express-json-router';

const router = new JsonRouter('/api');

router.propfind('/documents/:id', () => ({ ok: true }));
router.route('/documents/:id').proppatch(() => ({ ok: true }));
```

## Handler Defaults

`JsonRouter` still exposes static customization points such as:

- `JsonRouter.errorMessageProvider`
- `JsonRouter.preJson`
- `JsonRouter.postJson`
- `JsonRouter.preError`
- `JsonRouter.postError`

These behave as defaults for future `new JsonRouter(...)` instances.

- Updating a static property affects routers created after that change.
- Existing routers keep the response-handler instance they were constructed with.
- `JsonRouter.defaultHandler` returns a newly configured handler each time it is read.
- For fully isolated behavior, pass an explicit handler instance as the third constructor argument.

```ts
import JsonRouter from '@web-ts-toolkit/express-json-router';

JsonRouter.errorMessageProvider = () => 'default-error';

const routerUsingDefaults = new JsonRouter('/api');

const handler = JsonRouter.createHandler({
  errorFormat: JsonRouter.ErrorFormats.rfc9457,
});

handler.errorMessageProvider = () => 'custom-error';

const routerUsingCustomHandler = new JsonRouter('/admin', undefined, handler);
```

## Documentation

Full package documentation lives in `website/docs/packages/express-json-router.md`.

- live docs: https://web-ts-toolkit.pages.dev/docs/packages/express-json-router
