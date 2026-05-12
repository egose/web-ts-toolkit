# @web-ts-toolkit/express-json-router

Express router wrapper that wires route handlers through `@web-ts-toolkit/express-response-handler` and keeps track of registered endpoints.

## Installation

```sh
pnpm add @web-ts-toolkit/express-json-router express
```

## Documentation

- Full package documentation lives in `website/docs/packages/express-json-router.md`.
- Use the Docusaurus site in `website` for the complete guide and API notes.

## Minimal Example

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
