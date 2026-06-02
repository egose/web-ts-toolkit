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

## Quick Start

```ts
import { HttpError, UnauthorizedError, ServiceUnavailableError } from '@web-ts-toolkit/http-errors';

throw new UnauthorizedError();
throw new UnauthorizedError('missing bearer token');

throw new HttpError(503);
throw new HttpError(503, 'please try again later');

throw new ServiceUnavailableError();
```

## Main Exports

- `HttpError`
- specific error classes such as `BadRequestError`, `ForbiddenError`, `NotFoundError`
- `toAip193ErrorPayload(...)`
- `toRfc9457ErrorPayload(...)`
- `toRfc9457ValidationErrorPayload(...)`

## Documentation

Full package documentation lives in `website/docs/packages/http-errors.md`.

- live docs: https://web-ts-toolkit.pages.dev/docs/packages/http-errors
