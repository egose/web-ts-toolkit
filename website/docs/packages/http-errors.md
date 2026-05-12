---
sidebar_label: HTTP Errors
sidebar_position: 4
---

# `@web-ts-toolkit/http-errors`

HTTP error classes for backend APIs, including 4xx client errors and 5xx server errors.

## Installation

```bash npm2yarn
npm install @web-ts-toolkit/http-errors
```

## Usage

### Basic TypeScript usage

```ts
import { HttpError, UnauthorizedError, ServiceUnavailableError } from '@web-ts-toolkit/http-errors';

throw new UnauthorizedError();
throw new UnauthorizedError('missing bearer token');

throw new HttpError(503);
throw new HttpError(503, 'please try again later');

throw new ServiceUnavailableError();
```

### Use a specific 4xx error

```ts
import { BadRequestError } from '@web-ts-toolkit/http-errors';

function parseLimit(value: string | undefined): number {
  const limit = Number(value);

  if (!Number.isInteger(limit) || limit <= 0) {
    throw new BadRequestError('limit must be a positive integer');
  }

  return limit;
}
```

### Use the category base classes

```ts
import { ClientError, ServerError } from '@web-ts-toolkit/http-errors';

throw new ClientError(403, 'forbidden project access');
throw new ServerError(503, 'search index is rebuilding');
```

### Attach a cause

```ts
import { ServiceUnavailableError } from '@web-ts-toolkit/http-errors';

try {
  await fetch('https://api.example.com/health');
} catch (cause) {
  throw new ServiceUnavailableError('upstream API is unavailable', { cause });
}
```

### Add machine-readable error metadata

```ts
import { BadRequestError } from '@web-ts-toolkit/http-errors';

throw new BadRequestError('invalid email', {
  reason: 'INVALID_EMAIL',
  domain: 'api.example.com',
  type: 'https://api.example.com/problems/invalid-email',
  title: 'Invalid email address',
  instance: '/problems/invalid-email/123',
  metadata: {
    field: 'email',
  },
  details: [
    {
      type: 'help',
      links: [
        {
          description: 'Validation guide',
          url: 'https://api.example.com/docs/errors/invalid-email',
        },
      ],
    },
  ],
  errors: [
    {
      field: 'email',
      description: 'Email must be a valid address.',
    },
  ],
});
```

The base `HttpError` carries optional structured fields that are useful when building AIP-193 and RFC 9457 error payloads:

- `statusCode`: HTTP status code
- `status`: canonical status string for common HTTP codes, otherwise `UNKNOWN`
- `reason`: application-specific machine-readable identifier
- `domain`: logical error domain such as `api.example.com`
- `type`: RFC 9457 problem type URI
- `title`: RFC 9457 problem title
- `instance`: RFC 9457 problem instance URI
- `metadata`: stringified key-value metadata
- `details`: structured detail entries
- `errors`: validation or field-level error payloads

### Convert an error to an AIP-193-style payload

```ts
import { BadRequestError, toAip193ErrorPayload } from '@web-ts-toolkit/http-errors';

const error = new BadRequestError('invalid email', {
  reason: 'INVALID_EMAIL',
  domain: 'api.example.com',
  metadata: {
    field: 'email',
  },
});

const payload = toAip193ErrorPayload(error);
```

### Convert an error to an RFC 9457 payload

```ts
import { BadRequestError, toRfc9457ErrorPayload } from '@web-ts-toolkit/http-errors';

const error = new BadRequestError('Email must be a valid address.', {
  type: 'https://api.example.com/problems/invalid-email',
  title: 'Invalid email address',
  instance: '/problems/invalid-email/123',
  errors: [
    {
      detail: 'must be a valid email address',
      pointer: '#/email',
      parameter: 'email',
    },
    {
      detail: 'x-request-id header is required',
      header: 'x-request-id',
    },
  ],
});

const payload = toRfc9457ErrorPayload(error);
```

### Use the typed RFC 9457 validation helper

```ts
import { BadRequestError, toRfc9457ValidationErrorPayload } from '@web-ts-toolkit/http-errors';

const error = new BadRequestError('Email must be a valid address.', {
  type: 'https://api.example.com/problems/invalid-email',
  title: 'Invalid email address',
  errors: [
    {
      detail: 'must be a valid email address',
      pointer: '#/email',
    },
  ],
});

const payload = toRfc9457ValidationErrorPayload(error);
```

### Express route example

```ts
import express from 'express';
import { BadRequestError, ForbiddenError, NotFoundError } from '@web-ts-toolkit/http-errors';

type User = {
  id: string;
  role: 'admin' | 'member';
};

type Project = {
  id: string;
  ownerId: string;
  name: string;
};

const app = express();

const projects = new Map<string, Project>([['project-1', { id: 'project-1', ownerId: 'user-1', name: 'Toolkit' }]]);

app.use(express.json());

app.put('/projects/:id', (req, res) => {
  const user = req.user as User | undefined;
  const project = projects.get(req.params.id);

  if (!user) {
    throw new ForbiddenError('authentication required');
  }

  if (!project) {
    throw new NotFoundError('project was not found');
  }

  if (project.ownerId !== user.id && user.role !== 'admin') {
    throw new ForbiddenError('you cannot update this project');
  }

  if (typeof req.body.name !== 'string' || req.body.name.trim() === '') {
    throw new BadRequestError('name is required');
  }

  project.name = req.body.name.trim();
  res.json(project);
});
```

### Express error middleware example

```ts
import type { NextFunction, Request, Response } from 'express';
import express from 'express';
import { HttpError, InternalServerError } from '@web-ts-toolkit/http-errors';

const app = express();

app.use((err: unknown, _req: Request, res: Response, _next: NextFunction) => {
  if (err instanceof HttpError) {
    return res.status(err.statusCode).json({
      error: {
        name: err.name,
        message: err.message,
        statusCode: err.statusCode,
      },
    });
  }

  const fallback = new InternalServerError('unexpected server error');

  return res.status(fallback.statusCode).json({
    error: {
      name: fallback.name,
      message: fallback.message,
      statusCode: fallback.statusCode,
    },
  });
});
```

## Error Hierarchy

`HttpError` is the neutral base class for HTTP responses.

`ClientError` is the base class for 4xx responses.

`ServerError` is the base class for 5xx responses.

## Client Errors

| Code | Description                     | Class Name                        | Default Message                                                                                            |
| ---- | ------------------------------- | --------------------------------- | ---------------------------------------------------------------------------------------------------------- |
| 400  | Bad Request                     | BadRequestError                   | The server cannot process the request due to a client error                                                |
| 401  | Unauthorized                    | UnauthorizedError                 | The user is not authorized                                                                                 |
| 403  | Forbidden                       | ForbiddenError                    | The server refused to authorize the request                                                                |
| 404  | Not Found                       | NotFoundError                     | The server did not find a current representation for the target resource                                   |
| 405  | Method Not Allowed              | MethodNotAllowedError             | The method received is not allowed                                                                         |
| 406  | Not Acceptable                  | NotAcceptableError                | The request is not acceptable to the user agent                                                            |
| 407  | Proxy Authentication Required   | ProxyAuthRequiredError            | The client needs to authenticate itself in order to use a proxy                                            |
| 408  | Request Timeout                 | RequestTimeoutError               | The request was not completed in the expected time                                                         |
| 409  | Conflict                        | ConflictError                     | The request was not completed due to a conflict with the target resource                                   |
| 410  | Gone                            | GoneError                         | The target resource is no longer available at the origin server                                            |
| 411  | Length Required                 | LengthRequiredError               | The server refuses to accept the request without a defined Content-Length                                  |
| 412  | Precondition Failed             | PreconditionFailedError           | One or more conditions given in the request header fields evaluated to false                               |
| 413  | Payload Too Large               | PayloadTooLargeError              | The request payload is too large                                                                           |
| 414  | URI Too Long                    | UriTooLongError                   | The request target is too long                                                                             |
| 415  | Unsupported Media Type          | UnsupportedMediaTypeError         | The payload is in a format not supported                                                                   |
| 416  | Requested Range Not Satisfiable | RequestedRangeNotSatisfiableError | None of the ranges in the request's Range header field overlap the current extent of the selected resource |
| 417  | Expectation Failed              | ExpectationFailedError            | The expectation given in the request's Expect header field could not be met                                |
| 418  | I'm a teapot                    | TeapotError                       | I'm a teapot                                                                                               |
| 421  | Misdirected Request             | MisdirectedRequestError           | The request was directed at a server that is not able to produce a response                                |
| 422  | Unprocessable Entity            | UnprocessableEntityError          | The server is unable to process the request                                                                |
| 423  | Locked                          | LockedError                       | The source or destination resource of a method is locked                                                   |
| 424  | Failed Dependency               | FailedDependencyError             | The requested action depended on another action                                                            |
| 426  | Upgrade Required                | UpgradeRequiredError              | This service requires use of a different protocol                                                          |
| 428  | Precondition Required           | PreconditionRequiredError         | This request is required to be conditional                                                                 |
| 429  | Too Many Requests               | TooManyRequestsError              | The user has sent too many requests in a given amount of time                                              |
| 431  | Request Header Fields Too Large | RequestHeaderFieldsTooLargeError  | Request header fields too large                                                                            |
| 451  | Unavailable For Legal Reasons   | UnavailableForLegalReasonsError   | Denied access due to a consequence of a legal demand                                                       |

## Server Errors

| Code | Description                     | Class Name                         | Default Message                                                                 |
| ---- | ------------------------------- | ---------------------------------- | ------------------------------------------------------------------------------- |
| 500  | Internal Server Error           | InternalServerError                | The server encountered an unexpected condition                                  |
| 501  | Not Implemented                 | NotImplementedError                | The server does not support the functionality required to fulfill the request   |
| 502  | Bad Gateway                     | BadGatewayError                    | The server received an invalid response from an upstream server                 |
| 503  | Service Unavailable             | ServiceUnavailableError            | The server is temporarily unable to handle the request                          |
| 504  | Gateway Timeout                 | GatewayTimeoutError                | The server did not receive a timely response from an upstream server            |
| 505  | HTTP Version Not Supported      | HttpVersionNotSupportedError       | The server does not support the HTTP protocol version used in the request       |
| 506  | Variant Also Negotiates         | VariantAlsoNegotiatesError         | The server has an internal configuration error                                  |
| 507  | Insufficient Storage            | InsufficientStorageError           | The server is unable to store the representation needed to complete the request |
| 508  | Loop Detected                   | LoopDetectedError                  | The server detected an infinite loop while processing the request               |
| 510  | Not Extended                    | NotExtendedError                   | Further extensions to the request are required for the server to fulfill it     |
| 511  | Network Authentication Required | NetworkAuthenticationRequiredError | The client needs to authenticate to gain network access                         |
