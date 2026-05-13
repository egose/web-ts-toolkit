# http-errors

HTTP error classes for backend APIs, including 4xx client errors and 5xx server errors.

## Installation

```sh
npm install @web-ts-toolkit/http-errors
```

## Documentation

- Full package documentation lives in `website/docs/packages/http-errors.md`.
- Use the Docusaurus site in `website` for the complete hierarchy, payload helpers, and Express examples.

## Minimal Example

```ts
import { HttpError, UnauthorizedError, ServiceUnavailableError } from '@web-ts-toolkit/http-errors';

throw new UnauthorizedError();
throw new UnauthorizedError('missing bearer token');

throw new HttpError(503);
throw new HttpError(503, 'please try again later');

throw new ServiceUnavailableError();
```
