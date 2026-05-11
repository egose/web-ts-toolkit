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
