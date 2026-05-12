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

## TypeScript

Typed routers now carry the model or data shape through filters, selects, defaults, and service accessors.

### Typed Model Routers

Pass a typed `mongoose.Model<T>` to `acl.createRouter()` to get model-aware service and hook types.

```ts
import mongoose from 'mongoose';
import acl from '@web-ts-toolkit/access-router';

type User = {
  name: string;
  role: string;
  profile: {
    city: string;
  };
  public: boolean;
};

const UserModel = mongoose.model<User>(
  'User',
  new mongoose.Schema({
    name: String,
    role: String,
    profile: {
      city: String,
    },
    public: Boolean,
  }),
);

const userRouter = acl.createRouter(UserModel, {
  basePath: '/users',
  baseFilter: {
    list(permissions) {
      return permissions.isAdmin ? {} : { public: true };
    },
  },
  defaults: {
    findOptions: {
      sort: { name: 1 },
      select: ['name', 'profile.city'],
    },
  },
});

const service = userRouter.getService(req);

await service.find({
  filter: { 'profile.city': 'Berlin' },
  select: ['name', 'profile.city'],
});
```

### Typed Data Routers

`acl.createDataRouter()` now carries the in-memory data shape through filters and select-aware results.

```ts
import acl from '@web-ts-toolkit/access-router';

type Fruit = {
  id: string;
  name: string;
  stock: number;
  public: boolean;
};

const fruitRouter = acl.createDataRouter<Fruit>('fruit', {
  basePath: '/fruit',
  identifier: 'id',
  data: [{ id: 'apple', name: 'Apple', stock: 12, public: true }],
});

const service = fruitRouter.getService(req);

const result = await service.findById({
  id: 'apple',
  select: ['id', 'name'],
});

result.name;
```

### Typed Filters

`Filter<T>` and `DataFilter<T>` support dotted paths for nested fields.

```ts
const service = userRouter.getService(req);

await service.find({
  filter: {
    role: { $in: ['admin', 'editor'] },
    'profile.city': 'Berlin',
  },
});
```

When no model or data type is known, filters still fall back to a loose `Record<string, unknown>` shape.

### Typed Select And Populate

Public read and list methods narrow their return types when `select` is positive and simple enough to model.

```ts
const service = userRouter.getPublicService(req);

const users = await service.find({
  select: ['name', 'profile.city'],
  populate: [{ path: 'manager', select: ['name'] }],
});
```

The typing is intentionally conservative:

- positive `select` narrows returned fields
- exclusion-only or complex select shapes fall back to the broader public output type
- populate merges selected nested paths, but does not infer foreign model types from runtime refs

### Typed Defaults

`defaults` now use the router model type, so common options remain checked.

```ts
const router = acl.createRouter(UserModel, {
  defaults: {
    findOptions: {
      sort: { name: 1 },
      filter: { public: true },
    },
    findByIdOptions: {
      select: ['name', 'role'],
    },
  },
});
```

### Request And Permission Augmentation

The package exposes augmentable interfaces so hooks can use custom request fields and permission names without manual annotations.

```ts
import '@web-ts-toolkit/access-router';

declare module '@web-ts-toolkit/access-router' {
  interface AccessRouterPermissionMap {
    isAdmin?: boolean;
  }

  interface AccessRouterRequestExtensions {
    requestId?: string;
  }
}
```

After augmentation, hooks and global permission handlers see those fields automatically:

```ts
acl.setGlobalOptions({
  globalPermissions(req) {
    req.requestId = String(req.headers['x-request-id'] ?? 'request');
    return req.headers.user === 'admin' ? ['isAdmin'] : [];
  },
});

acl.createDataRouter('fruit', {
  decorate(item, permissions) {
    if (permissions.isAdmin && this.requestId) {
      return { ...item, requestId: this.requestId };
    }

    return item;
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

## Request Validation

Public router endpoints now validate request path params, known query params, and top-level request body shapes before calling the service layer.

Examples:

- `GET /users/:id?try_list=false` validates `id` and `try_list`
- `GET /pets?include_count=true&limit=10` validates boolean and pagination query params
- `POST /users/__mutation` requires a top-level `data` field
- `POST /users/__query/:id` validates advanced `select`, `populate`, `include`, and `tasks` shapes

Invalid requests return `400 application/problem+json` with structured `errors` entries using `parameter` or `pointer`:

```json
{
  "title": "Bad Request",
  "detail": "Bad Request",
  "status": 400,
  "errors": [
    {
      "parameter": "include_count",
      "detail": "Invalid option: expected one of \"true\"|\"false\""
    }
  ]
}
```

## User-Defined Request Schemas

Model and data routers can add route-specific Zod validation through the `requestSchemas` option.

Use this when you want stricter application-level request validation on top of the built-in router boundary validation.

Recommended shape:

- whole-body schemas: `requestSchemas.<route>` or `requestSchemas.<route>.default`
- nested advanced mutation payloads: `requestSchemas.<route>.data`

Model router examples:

- `requestSchemas.create`
- `requestSchemas.update`
- `requestSchemas.upsert`
- `requestSchemas.count`
- `requestSchemas.distinct`
- `requestSchemas.advancedList`
- `requestSchemas.advancedReadFilter`
- `requestSchemas.advancedRead`
- `requestSchemas.advancedCreate.default`
- `requestSchemas.advancedCreate.data`
- `requestSchemas.advancedUpdate.default`
- `requestSchemas.advancedUpdate.data`
- `requestSchemas.advancedUpsert.default`
- `requestSchemas.advancedUpsert.data`
- `requestSchemas.subList`
- `requestSchemas.subRead`
- `requestSchemas.subCreate`
- `requestSchemas.subUpdate`
- `requestSchemas.subBulkUpdate`

Data router examples:

- `requestSchemas.advancedList`
- `requestSchemas.advancedReadFilter`
- `requestSchemas.advancedRead`

Example:

```ts
import { z } from 'zod';
import acl from '@web-ts-toolkit/access-router';

const router = acl.createRouter('User', {
  basePath: '/users',
  identifier: 'name',
  requestSchemas: {
    create: z.object({
      name: z.string().min(3),
      role: z.string(),
    }),
    advancedCreate: {
      data: z.object({
        name: z.string().min(3),
        role: z.literal('user'),
      }),
    },
    advancedUpdate: {
      data: z.object({
        role: z.enum(['manager', 'staff']),
      }),
    },
  },
});
```

Validation order:

- built-in route/query/body-shape validation runs first
- user-defined `requestSchemas` validation runs second
- write-operation model `validate` hooks still run afterward in the service layer

## Custom Route Validation

The package also exports the same validation helpers used by the built-in public routers:

- `parsePathParam`
- `parseQuery`
- `parseBody`
- `requestSchemas`
- advanced body schemas such as `listBodySchema`, `readByIdBodySchema`, `advancedCreateBodySchema`, and `advancedUpdateBodySchema`

Example:

```ts
import acl, {
  parseBody,
  parsePathParam,
  parseQuery,
  requestSchemas,
  readByIdBodySchema,
} from '@web-ts-toolkit/access-router';

const router = acl.createRouter('User', {
  basePath: '/users',
});

router.router.post('/custom/:id', async (req) => {
  const id = parsePathParam(req.params.id, 'id');
  const { include_permissions } = parseQuery(requestSchemas.readQuery, req.query);
  const body = parseBody(readByIdBodySchema, req.body);

  return {
    id,
    includePermissions: include_permissions === 'true',
    body,
  };
});
```

These helpers throw the same `BadRequestError` shape as the built-in router endpoints, so custom routes can stay consistent with the package defaults.

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
