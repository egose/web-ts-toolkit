---
sidebar_label: Express Response Handler
sidebar_position: 3
---

# `@web-ts-toolkit/express-response-handler`

FastAPI-style return-value responses for Express.

Instead of calling `res.json(...)` in every route, return a value. This package turns that return value into a `200 OK` JSON response, while still letting you return explicit response wrappers or throw errors when needed.

## Installation

```bash npm2yarn
npm install @web-ts-toolkit/express-response-handler
```

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

## What It Exposes

Root entrypoint:

- default handler instance
- `handleResponse(...)`
- `HttpResponse`
- `createHandler(...)`
- `ErrorFormats`

Published subpaths:

- `@web-ts-toolkit/express-response-handler/types` for public handler and middleware types such as `ExpressResponseHandlerOptions` and `HandleResponse`
- `@web-ts-toolkit/express-response-handler/responses` for response-wrapper exports
- `@web-ts-toolkit/express-response-handler/responses/csv` for `CSVResponse`
- `@web-ts-toolkit/express-response-handler/responses/success` for concrete success wrappers such as `Created`, `Accepted`, and `NoContent`

Example subpath import:

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

The package supports both a default export and named exports:

```ts
import apiHandler from '@web-ts-toolkit/express-response-handler';

const { handleResponse, HttpResponse } = apiHandler;
```

```ts
import { handleResponse, HttpResponse } from '@web-ts-toolkit/express-response-handler';
```

Use one style consistently within a module so route code stays easy to scan.

## How It Works

`handleResponse(...)` wraps one or more Express handlers.

When a handler runs:

- a plain returned value becomes `res.json(value)`
- a returned `HttpResponse.*(...)` wrapper controls the status code
- a returned `HttpResponse.csv(...)` streams CSV
- a returned `undefined` means the handler is managing the response directly
- a thrown error becomes an error response
- a returned promise is awaited automatically

Supported forms:

- `handleResponse(fn)`
- `handleResponse(fn1, fn2)`
- `handleResponse([fn1, fn2])`

## Examples

In the focused snippets below, helpers such as `createSession(...)`, `getProject(...)`, `getUserReportRows(...)`, and `requireAuth` are application-specific placeholders.

### Return JSON with `200 OK`

```ts
app.get(
  '/profile',
  handleResponse(async (req) => {
    return {
      id: req.user.id,
      email: req.user.email,
    };
  }),
);
```

### Return a custom success status

```ts
app.post(
  '/sessions',
  handleResponse(async (req) => {
    const session = await createSession(req.body);
    return HttpResponse.created(session);
  }),
);
```

### Throw HTTP errors

```ts
import { BadRequestError, NotFoundError } from '@web-ts-toolkit/http-errors';

app.get(
  '/projects/:id',
  handleResponse(async (req) => {
    if (!req.params.id) {
      throw new BadRequestError('project id is required');
    }

    const project = await getProject(req.params.id);

    if (!project) {
      throw new NotFoundError('project not found');
    }

    return project;
  }),
);
```

### Return CSV

```ts
app.get(
  '/reports/users.csv',
  handleResponse(async () => {
    const rows = await getUserReportRows();

    return HttpResponse.csv(rows, {
      filename: 'users.csv',
    });
  }),
);
```

CSV download filenames are emitted as standards-compliant attachment headers with an ASCII fallback and `filename*` for Unicode names. Filenames containing control characters such as CR, LF, or NUL are rejected before CSV headers are written.

CSV sources can be arrays, synchronous iterables, or async iterables. Arrays keep automatic header inference from the first row. Lazy iterable sources are consumed once during response streaming and must pass an explicit `headers` option because the handler will not peek and buffer a row just to infer headers. If the client disconnects or CSV formatting fails, the active iterator's `return()` method is called so generators can release database cursors, files, or other resources.

`CSVResponse` writes cell values exactly as supplied. It does not automatically neutralize spreadsheet formulas such as values beginning with `=`, `+`, `-`, or `@` because some exports intentionally include formulas. If user-controlled cells may be opened in spreadsheet software, neutralize them with the `processor` option:

```ts
const safeCell = (value: unknown) => {
  if (typeof value === 'string' && /^[=+\-@]/.test(value)) {
    return `'${value}`;
  }

  return value;
};

const safeRow = (row: Record<string, unknown>) => {
  return Object.fromEntries(Object.entries(row).map(([key, value]) => [key, safeCell(value)]));
};

return HttpResponse.csv(rows, {
  filename: 'users.csv',
  processor: safeRow,
});
```

### Use more than one Express handler

```ts
app.get(
  '/me',
  handleResponse(requireAuth, async (req) => {
    return req.user;
  }),
);
```

If you call `next()` with no arguments, Express middleware flow continues normally.

Do not use `next(value)` for successful responses. Return the value instead.

## Hooks

Hooks let you observe response flow without repeating code in every route. They are observational side effects only: a hook may return `void` or `Promise<void>`, but returned values never replace or transform the response payload.

Available setters:

- `apiHandler.preJson = fn`
- `apiHandler.postJson = fn`
- `apiHandler.preError = fn`
- `apiHandler.postError = fn`

Example:

```ts
apiHandler.preJson = async function (data) {
  console.log('about to send json response', data);
};

apiHandler.preError = async function (err) {
  console.error('request failed', err);
};
```

`preJson` runs before a non-`undefined` success value is serialized. This includes plain JSON values, `HttpResponse` wrappers, and CSV responses. If the wrapped handler returns `undefined`, the library assumes the handler owns the response and does not run `postJson`.

`postJson` runs after the HTTP response emits `finish` for a successful response. It does not run on client `close`, CSV/JSON serialization failure, or any path that never successfully finishes a response.

`preError` runs before an error response is serialized. `postError` runs after the HTTP response emits `finish` for an error response, and it receives the original error value observed by `preError`.

If a pre-hook throws or rejects before headers are sent, the failure is routed through the normal error response path. If a post-hook throws or rejects, the response has already completed, so the failure is passed to Express with `next(err)` for logging/observability and no second response is sent.

The default export is a mutable process-wide singleton. Assigning `apiHandler.preJson`, `apiHandler.postJson`, `apiHandler.preError`, `apiHandler.postError`, or `apiHandler.errorMessageProvider` affects every route using that singleton after assignment. Use `createHandler()` for isolated hook and error-provider state.

## Custom Error Messages

Unexpected non-HTTP errors default to status `500` with the generic message `Internal Server Error`. Raw thrown messages are not sent to clients, which prevents database, filesystem, assertion, or upstream details from leaking in production responses.

The original thrown value is still passed to `preError` and `postError`, and to Express error middleware if response serialization fails. Use those server-side paths for logging.

Only finite integer `4xx` and `5xx` status codes are serialized as HTTP errors. Invalid status values from thrown objects, typed wrappers, or custom providers are rejected before response headers are written.

Breaking change: older versions returned generic thrown `Error` messages as `422` responses. Use typed errors from `@web-ts-toolkit/http-errors` for intentional client-facing `4xx` payloads.

You can customize generic error payloads, but provider-derived status values must still be valid HTTP error statuses:

```ts
apiHandler.errorMessageProvider = function (err) {
  console.error('request failed', err);

  return {
    message: 'request failed',
  };
};
```

## Structured Error Format

The default error payload is intentionally small:

```json
{ "message": "project not found" }
```

If you want an AIP-193-inspired error envelope, create a handler instance with `errorFormat: 'aip193'`:

```ts
import apiHandler from '@web-ts-toolkit/express-response-handler';
import { ErrorFormats } from '@web-ts-toolkit/express-response-handler';

const structuredHandler = apiHandler.createHandler({
  errorFormat: ErrorFormats.aip193,
  errorDomain: 'api.example.com',
});
```

That mode returns errors in this shape:

```json
{
  "error": {
    "code": 404,
    "status": "NOT_FOUND",
    "message": "project not found",
    "details": [
      {
        "type": "error_info",
        "reason": "NOT_FOUND",
        "domain": "api.example.com"
      }
    ]
  }
}
```

You can enrich HTTP errors with machine-readable fields:

```ts
import { BadRequestError } from '@web-ts-toolkit/http-errors';

app.get(
  '/projects/:id',
  structuredHandler.handleResponse(async () => {
    throw new BadRequestError('invalid project id', {
      reason: 'INVALID_PROJECT_ID',
      metadata: { field: 'id' },
      details: [
        {
          type: 'help',
          links: [
            {
              description: 'Project ID format guide',
              url: 'https://api.example.com/docs/errors/invalid-project-id',
            },
          ],
        },
      ],
    });
  }),
);
```

If you want RFC 9457 problem details instead, create a handler instance with `errorFormat: 'rfc9457'`:

```ts
import apiHandler from '@web-ts-toolkit/express-response-handler';
import { ErrorFormats } from '@web-ts-toolkit/express-response-handler';

const problemHandler = apiHandler.createHandler({
  errorFormat: ErrorFormats.rfc9457,
  errorDomain: 'api.example.com',
});
```

That mode returns `application/problem+json` payloads in this shape:

```json
{
  "type": "https://api.example.com/problems/invalid-project-id",
  "title": "Invalid project id",
  "status": 400,
  "detail": "invalid project id",
  "instance": "/problems/invalid-project-id/123",
  "errors": [
    {
      "detail": "must be a valid project id",
      "pointer": "#/id"
    }
  ]
}
```

You can enrich HTTP errors with problem detail fields:

```ts
import { BadRequestError } from '@web-ts-toolkit/http-errors';

app.get(
  '/projects/:id',
  problemHandler.handleResponse(async () => {
    throw new BadRequestError('invalid project id', {
      type: 'https://api.example.com/problems/invalid-project-id',
      title: 'Invalid project id',
      instance: '/problems/invalid-project-id/123',
      errors: [
        {
          detail: 'must be a valid project id',
          pointer: '#/id',
        },
      ],
    });
  }),
);
```

## Isolated Instances

The default export is a ready-to-use singleton. If you want separate hook configuration per router or module, create an isolated instance:

```ts
import apiHandler from '@web-ts-toolkit/express-response-handler';

const adminHandler = apiHandler.createHandler();
const publicHandler = apiHandler.createHandler();

adminHandler.preError = async function (err) {
  console.error('admin route failed', err);
};
```

## When To Use It

This package is a good fit when you want:

- Express routes that return values instead of calling `res.json(...)`
- a small abstraction rather than a full framework
- consistent JSON, error, and CSV response behavior

It is less useful if you want fully explicit low-level Express response control in every route.

## Related Packages

- [`@web-ts-toolkit/express-json-router`](./express-json-router)
- [`@web-ts-toolkit/http-errors`](./http-errors)
