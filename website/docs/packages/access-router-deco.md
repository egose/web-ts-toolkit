---
sidebar_label: Access Router Deco
sidebar_position: 2
---

# `@web-ts-toolkit/access-router-deco`

Decorator-based configuration for `@web-ts-toolkit/access-router`.

This package lets you describe `access-router` modules, model routers, router options, and hook methods with TypeScript decorators instead of wiring everything by hand.

## Installation

```bash npm2yarn
npm install @web-ts-toolkit/access-router-deco @web-ts-toolkit/access-router reflect-metadata express
```

Peer dependencies:

- `@web-ts-toolkit/access-router`
- `express >=5`
- `reflect-metadata`

Import `reflect-metadata` once before using the decorators.

## What It Exposes

- `Module(...)`
- `Router(...)`
- `RouterOptions(...)`
- hook decorators such as `GlobalPermissions`, `DocPermissions`, `Validate`, `Prepare`, `Transform`, `RouteGuard`
- parameter decorators `Request`, `Document`, `Permissions`, `Context`
- property decorator `Option(...)`
- `EgoseFactory.bootstrap(...)`
- exported types such as `Type` and `ModuleMetadata`

## Quick Start

```ts
import 'reflect-metadata';
import express from 'express';
import {
  Module,
  Router,
  RouterOptions,
  GlobalPermissions,
  DocPermissions,
  Validate,
  Document,
  Permissions,
  EgoseFactory,
} from '@web-ts-toolkit/access-router-deco';

@Router('User', {
  basePath: '/users',
})
class UserRouter {
  @DocPermissions('read')
  canRead(@Document() doc: any, @Permissions() permissions: string[]) {
    return doc.public ? ['_id', 'name'] : permissions.includes('isAdmin') ? true : ['_id'];
  }

  @Validate('create')
  validateCreate(@Document() doc: any) {
    if (!doc.email) {
      throw new Error('email is required');
    }

    return doc;
  }
}

@RouterOptions({
  operationAccess: {
    list: true,
    read: true,
  },
})
class DefaultOptions {}

@Module({
  routers: [UserRouter],
  routerOptions: [DefaultOptions],
  options: {
    basePath: '/api',
  },
})
class AppModule {
  @GlobalPermissions()
  permissions(req: express.Request) {
    return req.headers['x-role'] === 'admin' ? ['isAdmin'] : [];
  }
}

const app = express();
EgoseFactory.bootstrap(AppModule, app);
```

This package is a good fit when you like `access-router`'s hooks and configuration model but want to express them through decorators and classes instead of building option objects manually.

## Mental Model

- `Module(...)` declares the top-level composition unit
- `Router('User', ...)` declares one model router
- `Router({...})` declares a root batch router
- `RouterOptions({...})` sets default model options or per-model option overrides
- method decorators map class methods to `access-router` hooks
- `EgoseFactory.bootstrap(...)` reads the metadata and registers the actual Express routers

## Common Patterns

### Root router module

Use the object form of `@Router(...)` when you want a root batch router instead of a model router.

```ts
@Router({
  basePath: '/root',
  operationAccess: true,
})
class RootRouterModule {}
```

### Default model options and per-model overrides

```ts
@RouterOptions({
  operationAccess: {
    list: true,
    read: true,
  },
})
class DefaultRouterOptions {}

@RouterOptions('User', {
  basePath: '/members',
})
class UserRouterOptions {}
```

Use the one-argument form for shared defaults and the two-argument form when one model needs a specific override.

### Property-based options with `@Option(...)`

```ts
@RouterOptions('User')
class UserRouterOptions {
  @Option('basePath')
  usersPath = '/members';
}
```

That pattern is useful when option values come from instance properties instead of hard-coded decorator arguments.

## Class Decorators

### `Module({ routers, routerOptions, options })`

Defines the application module that `EgoseFactory` will bootstrap.

- `routers`: router classes decorated with `@Router(...)`
- `routerOptions`: classes decorated with `@RouterOptions(...)`
- `options`: global `access-router` options plus `basePath` and optional `handleErrors`

Example:

```ts
@Module({
  routers: [UserRouter, RootRouterModule],
  routerOptions: [DefaultRouterOptions, UserRouterOptions],
  options: {
    basePath: '/api',
  },
})
class AppModule {}
```

### `Router(modelName, options?)`

Declares a model router for one `access-router` model.

```ts
@Router('User', { basePath: '/users' })
class UserRouter {}
```

### `Router(rootOptions)`

Declares a root batch router instead of a model router.

```ts
@Router({ basePath: '/root' })
class RootRouterModule {}
```

### `RouterOptions(options)` and `RouterOptions(modelName, options)`

Use the one-argument form for default model options and the two-argument form for per-model overrides.

`RouterOptions(...)` is the decorator form of the same model-option layering you would normally express in plain `access-router` configuration objects.

## Hook Decorators

These decorators map directly to `access-router` option keys.

| Decorator              | Maps to             |
| ---------------------- | ------------------- |
| `@GlobalPermissions()` | `globalPermissions` |
| `@DocPermissions(...)` | `docPermissions.*`  |
| `@BaseFilter(...)`     | `baseFilter.*`      |
| `@OverrideFilter(...)` | `overrideFilter.*`  |
| `@Validate(...)`       | `validate.*`        |
| `@Prepare(...)`        | `prepare.*`         |
| `@Transform(...)`      | `transform.*`       |
| `@AfterPersist(...)`   | `afterPersist.*`    |
| `@Decorate(...)`       | `decorate.*`        |
| `@DecorateAll(...)`    | `decorateAll.*`     |
| `@RouteGuard(...)`     | `operationAccess.*` |
| `@Identifier()`        | `resolveIdFilter`   |
| `@BeforeDelete()`      | `beforeDelete`      |
| `@AfterDelete()`       | `afterDelete`       |

Most decorators take the same operation names you would use in plain `access-router` options, such as `create`, `read`, `update`, `list`, or `delete`.

## Parameter Decorators

Hook methods can declare only the inputs they need.

- `@Request()` injects the active request for global permission hooks
- `@Document()` injects the document payload or current document
- `@Permissions()` injects resolved permissions
- `@Context()` injects the hook context from `access-router`

Example:

```ts
@Prepare('create')
prepareCreate(@Document() doc: any, @Permissions() permissions: string[]) {
  if (permissions.includes('isAdmin')) {
    doc.internal = true;
  }

  return doc;
}
```

Parameter decorators let hook methods stay focused on the values they actually use instead of accepting long positional argument lists.

## Property Decorator

`@Option(...)` copies a class property value onto global, default-model, or model-specific options during bootstrap.

```ts
@RouterOptions('User')
class UserRouterOptions {
  @Option('basePath')
  usersPath = '/members';
}
```

## Bootstrapping

`EgoseFactory.bootstrap(...)` reads the decorator metadata and mounts the resulting routers onto an Express app.

```ts
const app = express();

EgoseFactory.bootstrap(AppModule, app);
```

If you already prefer explicit `access-router` option objects and direct router creation, that lower-level approach is still valid. This package is mainly about expressing the same configuration model through classes and decorators.

## Notes

- This package is a configuration layer over `access-router`, not a separate runtime.
- Decorators only describe metadata; `EgoseFactory.bootstrap(...)` performs the actual registration.
- If you already prefer explicit `acl.createRouter(...)` code, you do not need this package.

## Related Packages

- [`@web-ts-toolkit/access-router`](./access-router)
- [`@web-ts-toolkit/access-router-runtime`](./access-router-runtime)
