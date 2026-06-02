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

- default handler instance
- `handleResponse(...)`
- `HttpResponse`
- `createHandler(...)`
- `ErrorFormats`

## Documentation

Full package documentation lives in `website/docs/packages/express-response-handler.md`.
