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

## How It Works

`handleResponse(...)` wraps one or more Express handlers.

When a handler runs:

- a plain returned value becomes `res.json(value)`
- a returned `HttpResponse.*(...)` wrapper controls the status code
- a returned `HttpResponse.csv(...)` streams CSV
- a thrown error becomes an error response
- a returned promise is awaited automatically

Supported forms:

- `handleResponse(fn)`
- `handleResponse(fn1, fn2)`
- `handleResponse([fn1, fn2])`

## Examples

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

Hooks let you observe or modify response flow without repeating code in every route.

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

## Custom Error Messages

Non-HTTP errors default to status `422` with a message resolved from the thrown value.

You can customize that behavior:

```ts
apiHandler.errorMessageProvider = function (err) {
  return {
    message: 'request failed',
    detail: err instanceof Error ? err.message : String(err),
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
