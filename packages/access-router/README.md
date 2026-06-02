# `@web-ts-toolkit/access-router`

ACL-aware Express routers and in-memory data services for Mongoose-backed APIs.

## Installation

```sh
pnpm add @web-ts-toolkit/access-router express mongoose
```

Peer dependencies:

- `express >= 5`
- `mongoose >= 8`

## Highlights

- generated model CRUD routers
- generated in-memory data routers
- access control, field permissions, and request-time hooks
- root batch router for grouped operations
- request validation adapters
- generated OpenAPI JSON and Swagger UI routes

## Quick Start

```ts
import acl from '@web-ts-toolkit/access-router';

acl.setGlobalOptions({
  globalPermissions(req) {
    return req.headers.user === 'admin' ? ['isAdmin'] : [];
  },
});

const fruitRouter = acl.createDataRouter('fruit', {
  basePath: '/fruit',
  idField: 'id',
  operationAccess: { list: true, read: true },
  data: [{ id: 'apple', name: 'Apple', public: true }],
  permissionSchema: {
    id: true,
    name: 'isAdmin',
    public: true,
  },
});

const userRouter = acl.createRouter('User', {
  basePath: '/users',
});

const docsRouter = acl.createOpenApiRouter({
  title: 'Example API',
  version: '1.0.0',
});
```

## Main Exports

- default export `acl`
- `createAccessRuntime()`
- `createOpenApiRouter(...)`
- `combineRoutes(...)`
- `guard(...)`
- `RootRouter`, `ModelRouter`, `DataRouter`
- validation adapters such as `fromZod(...)` and `defineRequestSchema(...)`

## Documentation

Full package documentation lives in `website/docs/packages/access-router/`.

- overview: `website/docs/packages/access-router/index.mdx`
- routing: `website/docs/packages/access-router/routing.mdx`
- configuration: `website/docs/packages/access-router/configuration.mdx`
- hooks: `website/docs/packages/access-router/hooks.mdx`
- validation: `website/docs/packages/access-router/validation.mdx`
- OpenAPI: `website/docs/packages/access-router/openapi.mdx`
