# @web-ts-toolkit/acl

ACL-driven Express routers and in-memory data services for Mongoose-backed APIs.

## Installation

```sh
pnpm add @web-ts-toolkit/acl express mongoose
```

## Usage

```ts
import acl from '@web-ts-toolkit/acl';

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
