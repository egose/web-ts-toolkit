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
- `JsonRouter.createHandler(...)`
- `JsonRouter.ErrorFormats`

## Documentation

Full package documentation lives in `website/docs/packages/express-json-router.md`.

- live docs: https://web-ts-toolkit.pages.dev/docs/packages/express-json-router
