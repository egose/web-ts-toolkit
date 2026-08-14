# `@web-ts-toolkit/access-router-deco`

Decorator-based configuration for `@web-ts-toolkit/access-router`.

## Installation

```sh
pnpm add @web-ts-toolkit/access-router-deco @web-ts-toolkit/access-router reflect-metadata express mongoose
```

Peer dependencies:

- `@web-ts-toolkit/access-router`
- `express >= 5`
- `mongoose >= 8` through `@web-ts-toolkit/access-router`
- `reflect-metadata`

Install `reflect-metadata` as a peer dependency. Importing `@web-ts-toolkit/access-router-deco` initializes it once before the package decorators run.

## Highlights

- module-level composition with `@Module(...)`
- model and root router declaration with `@Router(...)`
- option classes with `@RouterOptions(...)`
- hook decorators that map to `access-router` option callbacks
- parameter decorators for request, document, permissions, context, filter, and identifier injection

## Quick Start

```ts
import 'reflect-metadata';
import express from 'express';
import mongoose from 'mongoose';
import {
  Module,
  Router,
  GlobalPermissions,
  DocPermissions,
  OverrideFilter,
  Identifier,
  Request,
  Document,
  Permissions,
  Filter,
  Id,
  EgoseFactory,
} from '@web-ts-toolkit/access-router-deco';

mongoose.model('User', new mongoose.Schema({ name: String, public: Boolean }));

@Router('User', { basePath: '/users' })
class UserRouter {
  @DocPermissions('read')
  canRead(@Document() doc: any, @Permissions() permissions: { has(permission: string): boolean }) {
    return { read: doc.public || permissions.has('isAdmin') };
  }

  @OverrideFilter('read')
  constrainRead(@Filter() filter: any, @Permissions() permissions: { has(permission: string): boolean }) {
    return permissions.has('isAdmin') ? filter : { ...filter, public: true };
  }

  @Identifier()
  bySlug(@Id() id: string) {
    return { slug: id };
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
- scoped option decorators `GlobalOption(...)`, `ModelOption(...)`, and `DefaultModelOption(...)`
- legacy unscoped property decorator `Option(...)`
- hook decorators such as `Validate`, `Prepare`, `Transform`, `RouteGuard`, `OverrideFilter`, `Identifier`
- parameter decorators `Request`, `Document`, `Permissions`, `Context`, `Filter`, `Id`
- exported types such as `BootstrapResult`, `ModuleMetadata`, `RouterModel`, and `Type`
- `EgoseFactory`
- `EgoseFactoryStatic.create(...)`

## Option Precedence

`EgoseFactory.bootstrap(...)` applies model route-construction options before creating Express routes. Precedence is default `@RouterOptions(...)`, model-specific `@RouterOptions('Model', ...)`, `@Router('Model', ...)` options, then `@Option(...)` properties and decorated hooks on the same class. Later layers override earlier layers for the same key.

Use `DefaultModelOption(...)` for default model options, `ModelOption(...)` for model-specific route options, and `GlobalOption(...)` for module-level global options. Avoid setting build-time route options after bootstrap; options such as `basePath`, `parentPath`, `idParam`, `queryRouteSegment`, and `mutationRouteSegment` must be available before routes are created.

## TypeScript Decorator Configuration

This package uses TypeScript legacy decorators, including parameter decorators. Compile consumers with `experimentalDecorators: true` and use a compiler/transpiler that preserves legacy class, method, property, and parameter decorators. `emitDecoratorMetadata` is supported but not required for injection. The package imports `reflect-metadata` from its root entrypoint, so consumers own installing the peer dependency but do not need a separate `import 'reflect-metadata'` before importing this package.

Parameter injection is explicit: undecorated hook parameters receive no values. Use decorators such as `@Request()`, `@Document()`, `@Permissions()`, `@Context()`, `@Filter()`, and `@Id()` for every runtime value a hook needs.

Decorated methods run with `this` bound to the decorated class instance, not the Express request. Use `@Request()` when a hook needs request data.

## Runtime Ownership

`EgoseFactory` is a compatibility singleton bound to the default `access-router` runtime. Use it when your app intentionally shares the default runtime.

`EgoseFactoryStatic.create()` creates a factory bound to a new isolated `access-router` runtime. Pass an explicit runtime from `createAccessRuntime()` when the host owns runtime lifecycle. `bootstrap(...)` returns `{ runtime, router }` so applications and tests can inspect the runtime that owns the mounted router.

Calling `bootstrap(...)` twice with the same factory, module class, and Express app throws instead of silently mounting duplicate middleware and routes.

## Error Handling

By default, `EgoseFactory.bootstrap(...)` does not install error handlers. The host Express app owns not-found and error policy.

`@Module({ options: { handleErrors: true } })` is an opt-in compatibility boundary for the package router only. It returns `{ message: 'Not Found' }` for unmatched package routes and sanitized `{ message }` JSON for package route errors. It does not intercept unrelated application routes before or after the package mount, does not serialize raw error objects, validates error status codes before using them, and delegates with `next(err)` when `res.headersSent` is already true.

Migration note: older versions installed application-wide catch-all middleware after bootstrap. Applications that relied on `handleErrors` for unrelated routes should add their own Express 404 and error middleware after all app routes instead.

## Runtime-Owned Mongoose Models

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

## Documentation

Full package documentation lives in `website/docs/packages/access-router-deco.md`.

- live docs: https://web-ts-toolkit.pages.dev/docs/packages/access-router-deco
