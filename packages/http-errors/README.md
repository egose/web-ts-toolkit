# `@web-ts-toolkit/http-errors`

Typed HTTP error classes and structured error payload helpers for backend APIs.

## Installation

```sh
pnpm add @web-ts-toolkit/http-errors
```

## Highlights

- typed 4xx and 5xx error classes
- `HttpError`, `ClientError`, and `ServerError` base classes
- machine-readable error metadata
- helpers for AIP-193 and RFC 9457 payloads

## Constructor Status Contract

`HttpError` accepts only finite integer HTTP error status codes from `400` through `599`.
`ClientError` narrows that to `400` through `499`, and `ServerError` narrows it to `500` through `599`.
Invalid or category-mismatched statuses throw synchronously before an error instance is created.

## Quick Start

```ts
import {
  HttpError,
  ServiceUnavailableError,
  UnauthorizedError,
  toAip193ErrorPayload,
  toRfc9457ErrorPayload,
  toRfc9457ValidationErrorPayload,
} from '@web-ts-toolkit/http-errors';

throw new UnauthorizedError();
throw new UnauthorizedError('missing bearer token');

throw new HttpError(503);
throw new HttpError(503, 'please try again later');

throw new ServiceUnavailableError();

const error = new HttpError(400, 'Email must be a valid address.', {
  reason: 'INVALID_EMAIL',
  domain: 'api.example.com',
  type: 'https://api.example.com/problems/invalid-email',
  title: 'Invalid email address',
  instance: '/problems/invalid-email/123',
  metadata: { field: 'email' },
  errors: [{ detail: 'must be a valid email address', pointer: '#/email' }],
});

const aip193 = toAip193ErrorPayload(error);
const rfc9457 = toRfc9457ErrorPayload(error);
const validation = toRfc9457ValidationErrorPayload(error);
void [aip193, rfc9457, validation];
```

## Main Exports

- `HttpError`
- `ClientError` and `ServerError`
- specific error classes such as `BadRequestError`, `ForbiddenError`, `NotFoundError`
- `toAip193ErrorPayload(...)`
- `toRfc9457ErrorPayload(...)`
- `toRfc9457ValidationErrorPayload(...)`
- types including `HttpErrorOptions`, `HttpErrorShape`, `HttpErrorProblemFields`, `HttpErrorMetadataValue`, `Aip193ErrorInfoDetail`, `Aip193ErrorPayload`, `Rfc9457ErrorPayload`, and `Rfc9457ValidationError`

## AIP-193 Serializer Contract

`toAip193ErrorPayload(...)` returns a Google-style `{ error }` envelope. It emits `code`, `status`, `message`, and `details` on every payload. The first detail is always an `error_info` entry whose `reason` defaults to the error `reason` or canonical status, whose `domain` defaults to the error `domain` or the serializer fallback domain, and whose `metadata` is copied when present.

```ts
import { BadRequestError, toAip193ErrorPayload } from '@web-ts-toolkit/http-errors';

const payload = toAip193ErrorPayload(
  new BadRequestError('Email must be a valid address.', {
    reason: 'INVALID_EMAIL',
    domain: 'api.example.com',
    metadata: { field: 'email' },
  }),
);

// payload.error.details[0] is:
// { type: 'error_info', reason: 'INVALID_EMAIL', domain: 'api.example.com', metadata: { field: 'email' } }
void payload;
```

## RFC 9457 Serializer Contract

`toRfc9457ErrorPayload(...)` emits required RFC 9457 problem members (`type`, `title`, `status`, and `detail`) on every payload. If the input shape has `errors` typed as an array, the returned payload preserves that entry type for custom extension errors.

When `type` is missing it falls back to `about:blank`. When `title` is missing it falls back to the canonical HTTP status title, or `Unknown` for unmapped status codes. `instance` is emitted only when present.

```ts
import { BadRequestError, toRfc9457ErrorPayload } from '@web-ts-toolkit/http-errors';

const payload = toRfc9457ErrorPayload(
  new BadRequestError('Email must be a valid address.', {
    type: 'https://api.example.com/problems/invalid-email',
    title: 'Invalid email address',
    instance: '/problems/invalid-email/123',
    errors: [{ detail: 'must be a valid email address', pointer: '#/email' }],
  }),
);

// payload is:
// { type, title, status: 400, detail: 'Email must be a valid address.', instance, errors }
void payload;
```

`toRfc9457ValidationErrorPayload(...)` is the validation-specific helper. It accepts JavaScript input defensively and only emits `errors` entries that have an own string `detail` plus optional own string `pointer`, `parameter`, and `header` fields. Non-arrays, empty arrays, inherited validation fields, and invalid entries are omitted from the returned `errors` array; if no valid entries remain, `errors` is omitted.

```ts
import { BadRequestError, toRfc9457ValidationErrorPayload } from '@web-ts-toolkit/http-errors';

const payload = toRfc9457ValidationErrorPayload(
  new BadRequestError('Email must be a valid address.', {
    errors: [{ detail: 'must be a valid email address', pointer: '#/email', debug: 'omitted' }, { pointer: '#/name' }],
  }),
);

// payload.errors is [{ detail: 'must be a valid email address', pointer: '#/email' }]
void payload;
```

## External Payload Disclosure

Serializers emit public payload fields verbatim. Treat `message`, `details`, `errors`, `metadata`, `type`, `title`, and `instance` as externally visible API response data. Do not put secrets, stack traces, raw upstream errors, tokens, credentials, or internal diagnostics in these fields unless you intentionally want clients to receive them.

## Structured Value Ownership

`HttpError` snapshots supported top-level collections at construction. `metadata` is normalized into an error-owned frozen string record, and array-valued `details` and `errors` are copied into error-owned frozen arrays. Mutating the source objects after construction cannot add, remove, reorder, or rename error-owned top-level entries.

Serializers also return fresh top-level arrays and metadata records, so mutating one payload does not change the source error or later payloads. This is a shallow boundary: nested detail and error entry objects remain shared, and `ErrorOptions.cause` identity is preserved.

## Documentation

Full package documentation lives in `website/docs/packages/http-errors.md`.

- live docs: https://web-ts-toolkit.pages.dev/docs/packages/http-errors
