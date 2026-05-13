# express-response-handler

FastAPI-style return-value responses for Express.

Instead of calling `res.json(...)` in every route, return a value. This package turns that return value into a `200 OK` JSON response, while still letting you return explicit response wrappers or throw errors when needed.

## Installation

```sh
npm install @web-ts-toolkit/express-response-handler
```

## Documentation

- Full package documentation lives in `website/docs/packages/express-response-handler.md`.
- Use the Docusaurus site in `website` for examples, hooks, and structured error format details.

## Minimal Example

```ts
import express from 'express';

import apiHandler from '@web-ts-toolkit/express-response-handler';
import { NotFoundError } from '@web-ts-toolkit/http-errors';

const { handleResponse, HttpResponse } = apiHandler;

const app = express();

app.get(
  '/health',
  handleResponse(() => {
    return { ok: true };
  }),
);

app.get(
  '/users/:id',
  handleResponse(async (req) => {
    const user = await getUser(req.params.id);

    if (!user) {
      throw new NotFoundError('user not found');
    }

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
