# @web-ts-toolkit/access-router

Access-policy Express routers and in-memory data services for Mongoose-backed APIs.

## Installation

```sh
pnpm add @web-ts-toolkit/access-router express mongoose
```

## Usage

```ts
import acl from '@web-ts-toolkit/access-router';

acl.set('globalPermissions', (req) => {
  return req.headers.user === 'admin' ? ['isAdmin'] : [];
});

const router = acl.createDataRouter('fruit', {
  basePath: '/fruit',
  data: [{ id: 'apple', name: 'Apple', public: true }],
  identifier: 'id',
  routeGuard: {
    list: true,
    read: true,
  },
  permissionSchema: {
    id: true,
    name: 'isAdmin',
    public: true,
  },
});
```

## List Responses

List endpoints now return a stable envelope:

```json
{
  "data": [],
  "meta": {
    "returnedCount": 0,
    "skip": 0,
    "limit": 25,
    "page": 1,
    "pageSize": 25,
    "hasPreviousPage": false
  }
}
```

When `include_count=true` is enabled, `meta` also includes total pagination information:

```json
{
  "data": [],
  "meta": {
    "returnedCount": 0,
    "totalCount": 100,
    "skip": 25,
    "limit": 25,
    "page": 2,
    "pageSize": 25,
    "totalPages": 4,
    "hasNextPage": true,
    "hasPreviousPage": true
  }
}
```

Notes:

- `returnedCount` is the number of rows in this response.
- `totalCount` is only included when `include_count=true`.
- `include_extra_headers=true` can still add the total count header, but it does not change the response body shape.

When `include_extra_headers=true` is enabled, the response can also include these headers:

- `wtt-returned-count`
- `wtt-page`
- `wtt-page-size`
- `wtt-has-previous-page`

And when `include_count=true` is also enabled:

- `wtt-total-count`
- `wtt-total-pages`
- `wtt-has-next-page`

## Hook Signatures

The most common model hooks are called with `this` bound to the current Express request.

### `baseFilter`

```ts
(this: express.Request, permissions: Permissions) =>
  | Filter
  | true
  | null
  | undefined
  | Promise<Filter | true | null | undefined>
```

- Return a `Filter` to restrict access.
- Return `true`, `null`, or `undefined` for no extra base filter.
- Return `false` to deny access.

### `decorate`

```ts
(this: express.Request, value: unknown, permissions: Permissions, context: MiddlewareContext) =>
  unknown | Promise<unknown>;
```

- Runs after a document has been loaded and trimmed.
- Can also be an array of middleware functions.

### `overrideFilter`

```ts
(this: express.Request, filter: Filter, permissions: Permissions) => Filter | Promise<Filter>;
```

- Runs before the base filter is applied.
- Use it to rewrite or augment the caller-provided filter.

### `validate`

```ts
(this: express.Request, allowedData: unknown, permissions: Permissions, context: MiddlewareContext) => boolean | unknown[] | Promise<boolean | unknown[]>
```

- Return `true` to allow the write.
- Return `false` to reject it.
- Return an array to provide validation errors.

### `prepare`

```ts
(this: express.Request, value: unknown, permissions: Permissions, context: MiddlewareContext) =>
  unknown | Promise<unknown>;
```

- Runs before create/update data is assigned to the document.
- Can also be an array of middleware functions.

### `transform`

```ts
(this: express.Request, value: unknown, permissions: Permissions, context: MiddlewareContext) =>
  unknown | Promise<unknown>;
```

- Runs during update flows before the document is saved.
- Can also be an array of middleware functions.

### `finalize`

```ts
(this: express.Request, value: unknown, permissions: Permissions, context: MiddlewareContext) =>
  unknown | Promise<unknown>;
```

- Runs after create/update persistence work and before response decoration.
- Can also be an array of middleware functions.

### `docPermissions`

```ts
(this: express.Request, doc: unknown, permissions: Permissions, context: MiddlewareContext) =>
  Record<string, unknown> | Promise<Record<string, unknown>>;
```

- Returns the document-level permission object written to the configured permission field.

### Example

```ts
acl.createModelRouter('Post', {
  baseFilter: {
    read(this, permissions) {
      if (permissions.has('isAdmin')) return true;
      return { published: true };
    },
  },
  validate: {
    create(this, data) {
      if (!data || typeof data !== 'object' || !('title' in data)) {
        return ['title is required'];
      }

      return true;
    },
  },
  prepare: {
    create(this, data) {
      if (typeof data === 'object' && data) {
        return { ...data, createdAt: new Date() };
      }

      return data;
    },
  },
  transform: {
    update(this, doc) {
      return doc;
    },
  },
  finalize: {
    update(this, doc) {
      return doc;
    },
  },
  decorate: {
    read(this, doc) {
      const record = typeof doc === 'object' && doc ? doc : {};
      return { ...record, summary: '...' };
    },
  },
  overrideFilter: {
    read(this, filter) {
      return filter ?? {};
    },
  },
  docPermissions: {
    read(this, doc, permissions) {
      return {
        canArchive: permissions.has('isAdmin'),
      };
    },
  },
});
```
