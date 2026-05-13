# @web-ts-toolkit/access-router

Access-policy Express routers and in-memory data services for Mongoose-backed APIs.

## Installation

```sh
pnpm add @web-ts-toolkit/access-router express mongoose
```

## Documentation

- Full package documentation lives in `website/docs/packages/access-router.mdx`.
- Browse the docs site from `website` to read the full guide alongside the rest of the workspace packages.

## Minimal Example

```ts
import acl from '@web-ts-toolkit/access-router';

const router = acl.createDataRouter('fruit', {
  basePath: '/fruit',
  idField: 'id',
  data: [{ id: 'apple', name: 'Apple', public: true }],
});
```
