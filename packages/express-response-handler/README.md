# `@web-ts-toolkit/express-response-handler`

FastAPI-style return-value responses for Express.

## Installation

```sh
pnpm add @web-ts-toolkit/express-response-handler
```

## Highlights

- return plain JSON values instead of calling `res.json(...)`
- return explicit `HttpResponse` wrappers for status control
- throw typed HTTP errors
- switch between simple, AIP-193, and RFC 9457-style error payloads
- if a wrapped handler returns `undefined`, the library assumes the handler will manage the response itself

## Quick Start

```ts
import express from 'express';
import apiHandler from '@web-ts-toolkit/express-response-handler';
import { NotFoundError } from '@web-ts-toolkit/http-errors';

const { handleResponse, HttpResponse } = apiHandler;
const app = express();

app.get(
  '/health',
  handleResponse(() => ({ ok: true })),
);

app.get(
  '/users/:id',
  handleResponse(async (req) => {
    const user = await getUser(req.params.id);
    if (!user) throw new NotFoundError('user not found');
    return user;
  }),
);

app.post(
  '/jobs',
  handleResponse(async () => {
    const job = await createJob();
    return HttpResponse.created(job);
  }),
);
```

## Main Exports

Root entrypoint (`@web-ts-toolkit/express-response-handler`):

- default handler instance
- `handleResponse(...)`
- `HttpResponse`
- `createHandler(...)`
- `ErrorFormats`

Subpath entrypoints:

- `@web-ts-toolkit/express-response-handler/types` — public type exports
- `@web-ts-toolkit/express-response-handler/responses` — response wrappers
- `@web-ts-toolkit/express-response-handler/responses/csv` — `CSVResponse`
- `@web-ts-toolkit/express-response-handler/responses/success` — `Created`, `Accepted`, `NoContent`, etc.

### Subpath import example

```ts
import { Created, NoContent } from '@web-ts-toolkit/express-response-handler/responses/success';

app.post(
  '/users',
  handleResponse(async () => Created(await createUser())),
);
app.delete(
  '/users/:id',
  handleResponse(async () => NoContent()),
);
```

### Import styles

The package ships both a default handler instance and named exports:

```ts
// default export
import apiHandler from '@web-ts-toolkit/express-response-handler';
const { handleResponse, HttpResponse } = apiHandler;

// named exports
import { handleResponse, HttpResponse } from '@web-ts-toolkit/express-response-handler';
```

## Documentation

Full package documentation lives in `website/docs/packages/express-response-handler.md`.

- live docs: https://web-ts-toolkit.pages.dev/docs/packages/express-response-handler
