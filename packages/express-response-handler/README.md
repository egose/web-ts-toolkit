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

async function getUser(id: string) {
  return id === 'missing' ? null : { id, name: 'Ada' };
}

async function createJob() {
  return { id: 'job_1' };
}

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

async function createUser() {
  return { id: 'user_1' };
}

app.post(
  '/users',
  handleResponse(async () => new Created(await createUser())),
);
app.delete(
  '/users/:id',
  handleResponse(async () => new NoContent()),
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

## Hooks

Hooks are observational side effects. They receive the value or error being handled, may return `void` or `Promise<void>`, and returned values never transform the response payload.

- `preJson` runs before a non-`undefined` success value is serialized.
- `postJson` runs after the HTTP response emits `finish` for a successful JSON, `HttpResponse`, or CSV response.
- `preError` runs before an error response is serialized.
- `postError` runs after the HTTP response emits `finish` for an error response.

If a handler returns `undefined`, the library assumes the handler owns the response and does not run `postJson`. `postJson` and `postError` do not run on client `close` or failed serialization paths that never emit `finish`.

Pre-hook failures are routed through the normal error response path. Post-hook failures happen after the response has completed, so they are passed to Express with `next(err)` for server-side logging/observability without creating a second client response.

The default export is a mutable process-wide singleton. Use `createHandler()` when you need isolated hook or error-provider state.

## Error Security

Unexpected non-HTTP failures are treated as server errors and return status `500` with the generic client message `Internal Server Error`. The original thrown value is still passed to `preError`, `postError`, and Express error middleware if serialization itself fails, so log there instead of exposing raw exception text to clients.

Only finite integer `4xx` and `5xx` status codes are serialized as HTTP errors. Invalid status values are rejected before response headers are written.

Breaking change: older versions returned generic thrown `Error` messages as `422` responses. Use typed errors from `@web-ts-toolkit/http-errors` for intentional client-facing `4xx` payloads, or set `errorMessageProvider` when you deliberately want a sanitized custom generic payload.

## CSV Security

`CSVResponse` writes cell values exactly as supplied. It does not automatically neutralize spreadsheet formulas such as values beginning with `=`, `+`, `-`, or `@` because some exports intentionally include formulas.

If user-controlled cells may be opened in spreadsheet software, neutralize them with the `processor` option before streaming:

```ts
const safeCell = (value: unknown) => (typeof value === 'string' && /^[=+\-@]/.test(value) ? `'${value}` : value);

const safeRow = (row: unknown) => {
  if (!row || typeof row !== 'object' || Array.isArray(row)) {
    return safeCell(row);
  }

  return Object.fromEntries(Object.entries(row).map(([key, value]) => [key, safeCell(value)]));
};

return new CSVResponse(rows, {
  filename: 'users.csv',
  processor: safeRow,
});
```

See `ERH-12.md` for the root import measurement and CSV formula-injection policy rationale.
