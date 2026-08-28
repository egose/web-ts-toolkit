---
sidebar_label: Access Router Deco
sidebar_position: 13
---

# `@web-ts-toolkit/access-router-deco`

Decorator-based configuration for `@web-ts-toolkit/access-router`.

This package lets you describe `access-router` modules, model routers, router options, and hook methods with TypeScript decorators instead of wiring everything by hand.

## Installation

```bash npm2yarn
npm install @web-ts-toolkit/access-router-deco @web-ts-toolkit/access-router reflect-metadata express mongoose
```

Peer dependencies:

- `@web-ts-toolkit/access-router`
- `express >=5`
- `mongoose >=8` through `@web-ts-toolkit/access-router`
- `reflect-metadata ^0.1.13 || ^0.2.0` (both `0.1` and `0.2` lines satisfy the documented init policy)

Declaration types: `@types/express` is a runtime dependency of this package. A clean consumer installing only the package and the peers above resolves all emitted `.d.ts` imports with `skipLibCheck: false` — no extra `@types/express` install needed. Removing unrelated workspace packages or their transitive `@types/express` does not break compilation.

TypeScript: `>=5.5 <7.0` (maintained `5.x`/`6.x` lines, verified `5.5`/`5.9`/`6.0`). Requires `experimentalDecorators: true` (legacy decorators); `emitDecoratorMetadata: true` is supported but not required. `skipLibCheck: false` with `moduleResolution: NodeNext` or `Bundler` is verified via the packed-consumer suite (see Compatibility Matrix in the package README — sentinel in `pnpm test`, full matrix via `pnpm --filter @web-ts-toolkit/access-router-deco test:compat`).

Importing `@web-ts-toolkit/access-router-deco` initializes `reflect-metadata` once before the package decorators run.

## What It Exposes

- `Module(...)`
- `Router(...)`
- `RouterOptions(...)`
- hook decorators such as `GlobalPermissions`, `DocPermissions`, `Validate`, `Prepare`, `Transform`, `RouteGuard`
- parameter decorators `Request`, `Document`, `Permissions`, `Context`, `Filter`, and `Id`
- scoped property decorators `GlobalOption(...)`, `ModelOption(...)`, and `DefaultModelOption(...)`
- legacy unscoped property decorator `Option(...)`
- `EgoseFactory.bootstrap(...)`
- `EgoseFactoryStatic.create(...)`
- exported types such as `BootstrapResult`, `ModuleMetadata`, `RouterModel`, and `Type`

## Quick Start

```ts
import 'reflect-metadata';
import express from 'express';
import mongoose from 'mongoose';
import {
  Module,
  Router,
  RouterOptions,
  GlobalPermissions,
  DocPermissions,
  Validate,
  Request,
  Document,
  Permissions,
  EgoseFactoryStatic,
} from '@web-ts-toolkit/access-router-deco';

mongoose.model('User', new mongoose.Schema({ email: String, name: String, public: Boolean }));

@Router('User', {
  basePath: '/users',
})
class UserRouter {
  @DocPermissions('read')
  canRead(@Document() doc: any, @Permissions() permissions: { has(permission: string): boolean }) {
    return { read: doc.public || permissions.has('isAdmin') };
  }

  @Validate('create')
  validateCreate(@Document() doc: { email?: string; name?: string }) {
    if (!doc.email) return ['email is required'];
    if (!doc.name) return false;
    return true;
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
  permissions(@Request() req: express.Request) {
    return req.headers['x-role'] === 'admin' ? ['isAdmin'] : [];
  }
}

const app = express();
const factory = EgoseFactoryStatic.create();
const { runtime } = factory.bootstrap(AppModule, app);
// Isolated runtime per factory — preferred for apps and tests. `EgoseFactory` is still available as a compatibility singleton for shared-runtime apps.

// Invalid input uses controlled validation failure (false / issue array → 400), not throw or document return:
// - validateCreate({ name: 'Ada' }) → ['email is required']
// - validateCreate({ email: 'a@b.co' }) → false
// - validateCreate({ email: 'a@b.co', name: 'Ada' }) → true
```

This package is a good fit when you like `access-router`'s hooks and configuration model but want to express them through decorators and classes instead of building option objects manually.

## Runtime Ownership

`EgoseFactory` is a compatibility singleton bound to the default `access-router` runtime. Use it only when your application intentionally shares that default runtime.

For isolated applications, tests, or multiple bootstraps with the same model names, use `EgoseFactoryStatic.create()`. It creates a factory bound to a fresh `access-router` runtime by default:

```ts
const factory = EgoseFactoryStatic.create();
const { runtime, router } = factory.bootstrap(AppModule, app);
```

If your host already owns a runtime, pass it explicitly:

```ts
import { createAccessRuntime } from '@web-ts-toolkit/access-router';

const runtime = createAccessRuntime();
const factory = EgoseFactoryStatic.create(runtime);
factory.bootstrap(AppModule, app);
```

The bootstrap result exposes the bound `runtime` and mounted Express `router` for lifecycle inspection. Calling `bootstrap(...)` twice with the same factory, module class, and Express app throws to avoid duplicate middleware and routes.

## TypeScript Decorator Configuration

This package uses TypeScript legacy decorators, including parameter decorators. Compile consumers with `experimentalDecorators: true` and use a compiler/transpiler that preserves legacy class, method, property, and parameter decorators. `emitDecoratorMetadata: true` is supported but not required — the package imports `reflect-metadata` from its root entrypoint, so consumers own installing the peer (`^0.1.13 || ^0.2.0`) but do not need a separate `import 'reflect-metadata'` before importing this package. Supported range is `typescript >=5.5 <7.0` (each maintained `5.x`/`6.x` line; minimum verified `5.5`).

Parameter injection is explicit: undecorated hook parameters receive no values. Use decorators such as `@Request()`, `@Document()`, `@Permissions()`, `@Context()`, `@Filter()`, and `@Id()` for every runtime value a hook needs.

Decorated methods run with `this` bound to the decorated class instance, not the Express request. Use `@Request()` when a hook needs request data.

### Error handling

By default, `EgoseFactory.bootstrap(...)` does not install Express error handlers. Your host app remains responsible for its own 404 and error policy.

Set `@Module({ options: { handleErrors: true } })` only when you want the package router to add a local compatibility error boundary. With that flag enabled, unmatched package routes return `404` with `{ message: 'Not Found' }`, and package route errors return sanitized `{ message }` JSON. The boundary does not intercept unrelated application routes mounted before or after the package router, never serializes raw error objects, validates error status codes before using them, and delegates with `next(err)` if response headers were already sent.

Migration note: older versions installed application-wide catch-all middleware after bootstrap. If your app relied on `handleErrors` for routes outside the decorated package router, add explicit Express 404 and error middleware after all host routes instead.

### Runtime-owned Mongoose models

Use `@Router('ModelName')` and `@RouterOptions('ModelName', ...)` when the model is registered on Mongoose's default connection.

When your app owns the Mongoose model instance, pass that exact model to the decorators:

```ts
const User = tenantConnection.model('User', userSchema);

@Router(User, { basePath: '/users' })
class UserRouter {}

@RouterOptions(User, { idParam: 'userId' })
class UserOptions {}
```

`EgoseFactory.bootstrap(...)` registers the supplied model instance with the factory's bound runtime before route creation. This keeps same-name models from separate Mongoose connections isolated when each module uses its own `EgoseFactoryStatic.create()` runtime.

## Mental Model

- `Module(...)` declares the top-level composition unit
- `Router('User', ...)` declares one model router
- `Router(UserModel, ...)` declares one model router using that exact Mongoose model instance
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

During bootstrap, model route-construction options are applied before routes are created. Precedence is deterministic: default `@RouterOptions(...)`, then model-specific `@RouterOptions('Model', ...)`, then `@Router('Model', ...)` options, then `@Option(...)` properties and decorated hooks on the same class. Later layers override earlier layers for the same option key.

Avoid setting build-time route options after bootstrap. Options such as `basePath`, `parentPath`, `idParam`, `queryRouteSegment`, and `mutationRouteSegment` must be present before Express routes are created.

### Property-based options with `@Option(...)`

```ts
@RouterOptions('User')
class UserRouterOptions {
  @Option('basePath')
  usersPath = '/members';
}
```

That pattern is useful when option values come from instance properties instead of hard-coded decorator arguments.

Property values on `@RouterOptions(...)` classes participate in the same pre-construction option phase, so build-time options such as `basePath`, `parentPath`, `idParam`, `queryRouteSegment`, and `mutationRouteSegment` affect the mounted Express routes.

## Class Decorators

### `Module({ routers, routerOptions, options })`

Defines the application module that `EgoseFactory` will bootstrap.

- `routers`: router classes decorated with `@Router(...)`
- `routerOptions`: classes decorated with `@RouterOptions(...)`
- `options`: global `access-router` options plus `basePath` and optional package-router `handleErrors`

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

These decorators map directly to `access-router` option keys. Every hook method runs with `this` bound to the decorated class instance (not the request — use `@Request()` for request data) and uses **explicit parameter injection** — undecorated parameters receive no value.

| Decorator              | Maps to             | Scope / Valid Class Role                                           | Operations                                                                                    | Result Shape (`MaybePromise<…>`)                                                                                                     |
| ---------------------- | ------------------- | ------------------------------------------------------------------ | --------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------ |
| `@GlobalPermissions()` | `globalPermissions` | `@Module` only                                                     | —                                                                                             | `GlobalPermissionValue` (`string \| string[] \| Record<string,boolean> \| null \| undefined`)                                        |
| `@DocPermissions(op)`  | `docPermissions.*`  | `@Router(Model)` / `@RouterOptions(Model)`                         | `default`, `create`, `update`, `list`, `read`                                                 | `Record<string,unknown>`                                                                                                             |
| `@BaseFilter(op)`      | `baseFilter.*`      | `@Router(Model)` / `@RouterOptions(Model)`                         | `default`, `update`, `list`, `read`, `delete`                                                 | `Filter \| true \| null \| undefined`                                                                                                |
| `@OverrideFilter(op)`  | `overrideFilter.*`  | `@Router(Model)` / `@RouterOptions(Model)`                         | `default`, `update`, `list`, `read`, `delete`                                                 | `Filter`                                                                                                                             |
| `@Validate(op)`        | `validate.*`        | `@Router(Model)` / `@RouterOptions(Model)`                         | `default`, `create`, `update`                                                                 | `boolean \| unknown[]` — `true` passes, `false` / non-empty array → `400` controlled failure; returning the document is a type error |
| `@Prepare(op)`         | `prepare.*`         | `@Router(Model)` / `@RouterOptions(Model)`                         | `default`, `create`, `update`                                                                 | `TValue` (prepared document)                                                                                                         |
| `@Transform(op)`       | `transform.*`       | `@Router(Model)` / `@RouterOptions(Model)`                         | `default`, `update`                                                                           | `ModelDocument<TValue>`                                                                                                              |
| `@AfterPersist(op)`    | `afterPersist.*`    | `@Router(Model)` / `@RouterOptions(Model)`                         | `default`, `create`, `update`                                                                 | `ModelDocument<TValue>`                                                                                                              |
| `@Decorate(op)`        | `decorate.*`        | `@Router(Model)` / `@RouterOptions(Model)`                         | `default`, `create`, `update`, `list`, `read`                                                 | `TValue`                                                                                                                             |
| `@DecorateAll(op)`     | `decorateAll.*`     | `@Router(Model)` / `@RouterOptions(Model)`                         | `default`, `list`                                                                             | `TValue[]`                                                                                                                           |
| `@RouteGuard(op)`      | `operationAccess.*` | `@Router(Model)` / `@RouterOptions(Model)` / default model options | `default`, `new`, `list`, `create`, `read`, `update`, `upsert`, `delete`, `distinct`, `count` | `boolean`                                                                                                                            |
| `@Identifier()`        | `resolveIdFilter`   | `@Router(Model)` / `@RouterOptions(Model)` / default               | —                                                                                             | `Filter`                                                                                                                             |
| `@BeforeDelete()`      | `beforeDelete`      | `@Router(Model)` / `@RouterOptions(Model)`                         | —                                                                                             | `void`                                                                                                                               |
| `@AfterDelete()`       | `afterDelete`       | `@Router(Model)` / `@RouterOptions(Model)`                         | —                                                                                             | `void`                                                                                                                               |

Most decorators take the same operation names you would use in plain `access-router` options, such as `create`, `read`, `update`, `list`, or `delete`. Scalar hooks (`globalPermissions`, `docPermissions`, `baseFilter`, `overrideFilter`, `validate`, `routeGuard`, `identifier`, `beforeDelete`, `afterDelete`) reject duplicate keys on the same class; array hooks (`prepare`, `transform`, `afterPersist`, `decorate`, `decorateAll`) compose base→derived.

`@Validate`: return `true` on success, `false` or an issue array such as `['email is required']` on invalid input — do not `throw` for expected invalid input nor return the document, and the typed hook now fails to compile if you return a document.

## Parameter Decorators

Hook methods can declare only the inputs they need. Injection is **explicit**: undecorated parameters receive no value — every runtime value must be requested with a decorator, and `this` is always the class instance.

- `@Request()` injects the active request (`AccessRouterRequest`) — valid on any hook
- `@Document()` injects the document / allowed data — valid on model hooks (`docPermissions`, `validate`, `prepare`, `transform`, `decorate`, `before/afterDelete`, etc.)
- `@Permissions()` injects resolved permissions — valid on `@RouteGuard`, `@BaseFilter`, `@DocPermissions`, `@Validate`, etc.
- `@Context()` injects the `ModelHookContext` from `access-router` — valid on model hooks
- `@Filter()` injects the current filter — valid only on `@OverrideFilter(...)` hooks
- `@Id()` injects the route identifier string — valid only on `@Identifier()` hooks

Example:

```ts
@Prepare('create')
prepareCreate(@Document() doc: any, @Permissions() permissions: { has(permission: string): boolean }) {
  if (permissions.has('isAdmin')) {
    doc.internal = true;
  }

  return doc;
}
```

Parameter decorators let hook methods stay focused on the values they actually use instead of accepting long positional argument lists.

Override filters receive the runtime filter and permissions explicitly:

```ts
@OverrideFilter('read')
constrainRead(@Filter() filter: any, @Permissions() permissions: { has(permission: string): boolean }) {
  return permissions.has('isAdmin') ? filter : { ...filter, public: true };
}
```

Identifier hooks can derive a filter from the route ID:

```ts
@Identifier()
bySlug(@Id() id: string) {
  return { slug: id };
}
```

## Property Decorators

`@Option(...)` and its scoped variants copy a class property value onto runtime options during bootstrap (explicit — undecorated properties are not copied; build-time keys like `basePath`, `idParam` must be set before route construction).

| Decorator                   | Scope / Valid Class Role                                          | Typed Key                                 | Effect                              |
| --------------------------- | ----------------------------------------------------------------- | ----------------------------------------- | ----------------------------------- |
| `@GlobalOption(key?)`       | `@Module` (global)                                                | `keyof GlobalOptions`                     | `setGlobalOption(key, value)`       |
| `@ModelOption(key?)`        | `@Router(Model)` / `@RouterOptions(Model)`                        | `keyof ExtendedModelRouterOptions`        | `setModelOption(model, key, value)` |
| `@DefaultModelOption(key?)` | `@RouterOptions` default                                          | `keyof ExtendedDefaultModelRouterOptions` | `setDefaultModelOption(key, value)` |
| `@Option(key?)`             | legacy unscoped — any hook-hosting class (role determines target) | `string`                                  | same via role-appropriate setter    |

Example:

```ts
@RouterOptions('User')
class UserRouterOptions {
  @Option('basePath')
  usersPath = '/members';
}
```

## Bootstrapping

`EgoseFactoryStatic.create().bootstrap(...)` reads the decorator metadata and mounts the resulting routers onto an isolated runtime and Express app. `EgoseFactory` remains as a compatibility singleton bound to the default `access-router` runtime.

```ts
import { EgoseFactoryStatic } from '@web-ts-toolkit/access-router-deco';

const app = express();
const factory = EgoseFactoryStatic.create();
const { runtime, router } = factory.bootstrap(AppModule, app);
// or with an explicit runtime: EgoseFactoryStatic.create(createAccessRuntime())
```

Legacy singleton form (shared default runtime) is still supported:

```ts
import { EgoseFactory } from '@web-ts-toolkit/access-router-deco';
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
