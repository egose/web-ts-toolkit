# `@web-ts-toolkit/access-router-deco`

Decorator-based configuration for `@web-ts-toolkit/access-router`.

## Installation

```sh
pnpm add @web-ts-toolkit/access-router-deco @web-ts-toolkit/access-router reflect-metadata express
```

Peer dependencies:

- `@web-ts-toolkit/access-router`
- `express >= 5`
- `reflect-metadata`

Import `reflect-metadata` once before using the decorators.

## Highlights

- module-level composition with `@Module(...)`
- model and root router declaration with `@Router(...)`
- option classes with `@RouterOptions(...)`
- hook decorators that map to `access-router` option callbacks
- parameter decorators for request, document, permissions, and context injection

## Quick Start

```ts
import 'reflect-metadata';
import express from 'express';
import {
  Module,
  Router,
  GlobalPermissions,
  DocPermissions,
  Request,
  Document,
  Permissions,
  EgoseFactory,
} from '@web-ts-toolkit/access-router-deco';

@Router('User', { basePath: '/users' })
class UserRouter {
  @DocPermissions('read')
  canRead(@Document() doc: any, @Permissions() permissions: string[]) {
    return doc.public ? ['_id', 'name'] : permissions.includes('isAdmin') ? true : ['_id'];
  }
}

@Module({
  routers: [UserRouter],
  options: { basePath: '/api' },
})
class AppModule {
  @GlobalPermissions()
  permissions(@Request() req: express.Request) {
    return req.headers['x-role'] === 'admin' ? ['isAdmin'] : [];
  }
}

const app = express();
EgoseFactory.bootstrap(AppModule, app);
```

## Main Exports

- `Module(...)`
- `Router(...)`
- `RouterOptions(...)`
- `Option(...)`
- hook decorators such as `Validate`, `Prepare`, `Transform`, `RouteGuard`
- parameter decorators `Request`, `Document`, `Permissions`, `Context`
- `EgoseFactory`

## Documentation

Full package documentation lives in `website/docs/packages/access-router-deco.md`.
