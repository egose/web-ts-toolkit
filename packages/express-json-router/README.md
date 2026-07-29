# `@web-ts-toolkit/express-json-router`

Express router wrapper that routes handler return values through `@web-ts-toolkit/express-response-handler`.

## Installation

```sh
pnpm add @web-ts-toolkit/express-json-router express
```

## Highlights

- return plain values from route handlers
- throw typed HTTP errors
- use custom response-handler instances when needed
- inspect registered endpoints with `getEndpoints()`

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

- `JsonRouter`
- `JsonRouter.HttpResponse`
- `JsonRouter.clientErrors`
- `JsonRouter.success`
- `JsonRouter.createHandler(...)`
- `JsonRouter.ErrorFormats`

## Handler Defaults

`JsonRouter` still exposes static customization points such as:

- `JsonRouter.errorMessageProvider`
- `JsonRouter.preJson`
- `JsonRouter.postJson`
- `JsonRouter.preError`
- `JsonRouter.postError`

These now behave as defaults for future `new JsonRouter(...)` instances.

- Updating a static property affects routers created after that change.
- Existing routers keep the response-handler instance they were constructed with.
- For fully isolated behavior, pass an explicit handler instance as the third constructor argument.

```ts
const handler = JsonRouter.createHandler({
  errorFormat: JsonRouter.ErrorFormats.rfc9457,
});

handler.errorMessageProvider = () => 'custom-error';

const router = new JsonRouter('/api', undefined, handler);
```

## Documentation

Full package documentation lives in `website/docs/packages/express-json-router.md`.

- live docs: https://web-ts-toolkit.pages.dev/docs/packages/express-json-router
