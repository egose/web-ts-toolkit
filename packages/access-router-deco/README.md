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
- `reflect-metadata ^0.1.13 || ^0.2.0` (both `0.1.x` and `0.2.x` lines satisfy the documented init policy; importing `@web-ts-toolkit/access-router-deco` initializes it once before the package decorators run)

Declaration types:

- `@types/express` is a runtime dependency of this package (not a peer). A clean consumer installing only this package and the peers above resolves all emitted `.d.ts` imports with `skipLibCheck: false` — no separate `pnpm add -D @types/express` is required. Removing unrelated workspace packages or their transitive `@types/express` does not break compilation because the types are provided directly by `@web-ts-toolkit/access-router-deco`.

TypeScript:

- Supported compiler range: `>=5.5 <7.0` (maintained `5.x` and `6.x` lines; minimum verified `5.5`, verified `5.9` and `6.0`). Narrow the range if a line is no longer maintained.
- Required compiler options: `experimentalDecorators: true` (legacy decorators). `emitDecoratorMetadata: true` is supported but not required — the package imports `reflect-metadata` from its root entrypoint.
- Strict consumers must compile with `skipLibCheck: false` and either `moduleResolution: "NodeNext"` or `"Bundler"`; both are verified in the packed-consumer suite.

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
  Validate,
  OverrideFilter,
  Identifier,
  Request,
  Document,
  Permissions,
  Filter,
  Id,
  EgoseFactoryStatic,
} from '@web-ts-toolkit/access-router-deco';

mongoose.model('User', new mongoose.Schema({ name: String, email: String, public: Boolean }));

@Router('User', { basePath: '/users' })
class UserRouter {
  @DocPermissions('read')
  canRead(@Document() doc: any, @Permissions() permissions: { has(permission: string): boolean }) {
    return { read: doc.public || permissions.has('isAdmin') };
  }

  @Validate('create')
  validateCreate(@Document() doc: { name?: string; email?: string }) {
    if (!doc.email) return ['email is required'];
    if (!doc.name) return false;
    return true;
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
const factory = EgoseFactoryStatic.create();
const { runtime } = factory.bootstrap(AppModule, app);
// Isolated runtime per factory — preferred for apps, tests, and multi-tenant bootstraps.
// `EgoseFactory` remains available as a compatibility singleton bound to the default `access-router` runtime for shared-runtime apps.
```

## Main Exports

- `Module(...)`
- `Router(...)`
- `RouterOptions(...)`
- scoped option decorators `GlobalOption(...)`, `ModelOption(...)`, and `DefaultModelOption(...)`
- legacy unscoped property decorator `Option(...)`
- hook decorators such as `Validate`, `Prepare`, `Transform`, `RouteGuard`, `OverrideFilter`, `Identifier`
- parameter decorators `Request`, `Document`, `Permissions`, `Context`, `Filter`, `Id`
- exported types such as `BootstrapResult`, `ModuleMetadata`, `RouterModel`, `RouteGuardOperationKey`, and `Type`
- `EgoseFactory`
- `EgoseFactoryStatic.create(...)`

`@RouteGuard(operation)` decorates a method typed as `GuardHook` — it must return `boolean` or `Promise<boolean>`. Valid operations are `default`, `new`, `list`, `create`, `read`, `update`, `upsert`, `delete`, `distinct`, and `count` (`subs` remains a nested option, not a scalar guard). An unsupported operation throws at decoration time before bootstrap.

`@Validate(operation)` decorates a method typed as `ModelValidateHook` — it must return `boolean | unknown[]` (`true` passes, `false` or non-empty array fails with a controlled `400`). Returning the document is a type error; use `true`/`false` or an issue array such as `['email is required']`.

## Decorator Reference

### Class Decorators

| Decorator                                                         | Valid Class Role / Module Array                                        | Operations | Effect                                                                                                                             |
| ----------------------------------------------------------------- | ---------------------------------------------------------------------- | ---------- | ---------------------------------------------------------------------------------------------------------------------------------- |
| `@Module({ routers, routerOptions, options })`                    | top-level module class passed to `bootstrap`                           | —          | composes `routers` (`@Router` only) + `routerOptions` (`@RouterOptions` only) + global `options`; validated before any constructor |
| `@Router('Model', opts?)` / `@Router(Model, opts?)`               | `routers` entry — model router                                         | —          | registers model instance + `setModelOptions(model, opts)` before route creation                                                    |
| `@Router({ basePath, ... })`                                      | `routers` entry — root batch router                                    | —          | `createRouter(rootOpts)` mounted at `basePath`                                                                                     |
| `@RouterOptions({ ... })`                                         | `routerOptions` entry — default model options (at most one per module) | —          | `setDefaultModelOptions(opts)`                                                                                                     |
| `@RouterOptions('Model', opts?)` / `@RouterOptions(Model, opts?)` | `routerOptions` entry — per-model options (at most one per model)      | —          | `setModelOptions(model, opts)`                                                                                                     |

### Hook (Method) Decorators

Every hook method uses **explicit parameter injection** — undecorated parameters receive no value. `this` inside every hook is the decorated class instance (not the request — use `@Request()` for request data).

| Decorator              | Scope / Valid Class Role                                                                     | Operations                                                                                    | Result Shape (`MaybePromise<…>`)                                                                                                                   | Valid Parameter Decorators                                          |
| ---------------------- | -------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------- |
| `@GlobalPermissions()` | `@Module` only (scalar)                                                                      | —                                                                                             | `GlobalPermissionValue` (`string \| string[] \| Record<string,boolean> \| null \| undefined`)                                                      | `@Request()`                                                        |
| `@DocPermissions(op)`  | `@Router(Model)` / `@RouterOptions(Model)` (scalar)                                          | `default`, `create`, `update`, `list`, `read`                                                 | `Record<string, unknown>` (permission map)                                                                                                         | `@Document()`, `@Permissions()`, `@Context()`, `@Request()`         |
| `@BaseFilter(op)`      | `@Router(Model)` / `@RouterOptions(Model)` (scalar)                                          | `default`, `update`, `list`, `read`, `delete`                                                 | `Filter \| true \| null \| undefined`                                                                                                              | `@Permissions()`, `@Request()`                                      |
| `@OverrideFilter(op)`  | `@Router(Model)` / `@RouterOptions(Model)` (scalar)                                          | `default`, `update`, `list`, `read`, `delete`                                                 | `Filter`                                                                                                                                           | `@Filter()`, `@Permissions()`, `@Request()`                         |
| `@Validate(op)`        | `@Router(Model)` / `@RouterOptions(Model)` (scalar-like; duplicate `validate.<op>` rejected) | `default`, `create`, `update`                                                                 | `boolean \| unknown[]` — `true` passes, `false` / non-empty array → controlled `400`; do not return document or `throw` for expected invalid input | `@Document()`, `@Permissions()`, `@Context()`, `@Request()`         |
| `@Prepare(op)`         | `@Router(Model)` / `@RouterOptions(Model)` (array — composes)                                | `default`, `create`, `update`                                                                 | `TValue` (prepared document)                                                                                                                       | `@Document()`, `@Permissions()`, `@Context()`, `@Request()`         |
| `@Transform(op)`       | `@Router(Model)` / `@RouterOptions(Model)` (array)                                           | `default`, `update`                                                                           | `ModelDocument<TValue>`                                                                                                                            | `@Document()`, `@Permissions()`, `@Context()`, `@Request()`         |
| `@AfterPersist(op)`    | `@Router(Model)` / `@RouterOptions(Model)` (array)                                           | `default`, `create`, `update`                                                                 | `ModelDocument<TValue>`                                                                                                                            | `@Document()`, `@Permissions()`, `@Context()`, `@Request()`         |
| `@Decorate(op)`        | `@Router(Model)` / `@RouterOptions(Model)` (array)                                           | `default`, `create`, `update`, `list`, `read`                                                 | `TValue` (decorated document)                                                                                                                      | `@Document()`, `@Permissions()`, `@Context()`, `@Request()`         |
| `@DecorateAll(op)`     | `@Router(Model)` / `@RouterOptions(Model)` (array)                                           | `default`, `list`                                                                             | `TValue[]`                                                                                                                                         | `@Document()` (array), `@Permissions()`, `@Context()`, `@Request()` |
| `@RouteGuard(op)`      | `@Router(Model)` / `@RouterOptions(Model)` / default model options (scalar)                  | `default`, `new`, `list`, `create`, `read`, `update`, `upsert`, `delete`, `distinct`, `count` | `boolean` (`true` allow, `false` deny)                                                                                                             | `@Permissions()`, `@Request()`                                      |
| `@Identifier()`        | `@Router(Model)` / `@RouterOptions(Model)` / default model options (scalar)                  | —                                                                                             | `Filter` (`{ slug: id }` etc.)                                                                                                                     | `@Id()` (plus optional `@Request()`)                                |
| `@BeforeDelete()`      | `@Router(Model)` / `@RouterOptions(Model)` (scalar)                                          | —                                                                                             | `void`                                                                                                                                             | `@Document()`, `@Permissions()`, `@Context()`, `@Request()`         |
| `@AfterDelete()`       | `@Router(Model)` / `@RouterOptions(Model)` (scalar)                                          | —                                                                                             | `void`                                                                                                                                             | `@Document()`, `@Permissions()`, `@Context()`, `@Request()`         |

Scalar hooks reject duplicate `<hook>.<operation>` (or `<hook>`) on the same class before any runtime setter; array hooks (`prepare`, `transform`, `afterPersist`, `decorate`, `decorateAll`) compose base→derived.

### Property Decorators (Option Injection)

| Decorator                   | Scope / Valid Class Role                                          | Option Key Type                           | Effect                                                              |
| --------------------------- | ----------------------------------------------------------------- | ----------------------------------------- | ------------------------------------------------------------------- |
| `@GlobalOption(key?)`       | `@Module` (global)                                                | `keyof GlobalOptions`                     | `runtime.setGlobalOption(key, propertyValue)`                       |
| `@ModelOption(key?)`        | `@Router(Model)` / `@RouterOptions(Model)` (per-model)            | `keyof ExtendedModelRouterOptions`        | `runtime.setModelOption(model, key, value)`                         |
| `@DefaultModelOption(key?)` | `@RouterOptions` default (one-arg)                                | `keyof ExtendedDefaultModelRouterOptions` | `runtime.setDefaultModelOption(key, value)`                         |
| `@Option(key?)`             | legacy unscoped — any hook-hosting class (role determines target) | `string`                                  | same as above via role-appropriate setter; prefer scoped decorators |

Build-time keys (`basePath`, `parentPath`, `idParam`, `queryRouteSegment`, `mutationRouteSegment`) must be set before route construction (property injection happens in the pre-construction option phase).

### Parameter Decorators

| Decorator        | Injects                                              | Valid Hooks                                                                                                | Notes                                                            |
| ---------------- | ---------------------------------------------------- | ---------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------- |
| `@Request()`     | active `AccessRouterRequest` (`express.Request`)     | any hook                                                                                                   | `this` is class instance; use this for request data              |
| `@Document()`    | document / allowed data (`ModelDocument` or payload) | model hooks (`docPermissions`, `validate`, `prepare`, `transform`, `decorate`, `before/afterDelete`, etc.) | array form for `decorateAll`                                     |
| `@Permissions()` | `AccessRouterPermissions` (`{ has(perm): boolean }`) | filters, guards, doc permissions, validate, etc.                                                           | not valid alone on `@GlobalPermissions` (it returns permissions) |
| `@Context()`     | `ModelHookContext`                                   | model hooks                                                                                                | hook context object                                              |
| `@Filter()`      | incoming `Filter`                                    | `@OverrideFilter` only                                                                                     |                                                                  |
| `@Id()`          | route identifier `string`                            | `@Identifier` only                                                                                         | hook returns `Filter`                                            |

## Option Precedence

`EgoseFactory.bootstrap(...)` applies model route-construction options before creating Express routes. Precedence is default `@RouterOptions(...)`, model-specific `@RouterOptions('Model', ...)`, `@Router('Model', ...)` options, then `@Option(...)` properties and decorated hooks on the same class. Later layers override earlier layers for the same key.

Use `DefaultModelOption(...)` for default model options, `ModelOption(...)` for model-specific route options, and `GlobalOption(...)` for module-level global options. Avoid setting build-time route options after bootstrap; options such as `basePath`, `parentPath`, `idParam`, `queryRouteSegment`, and `mutationRouteSegment` must be available before routes are created.

## TypeScript Decorator Configuration

This package uses TypeScript legacy decorators, including parameter decorators. Compile consumers with `experimentalDecorators: true` and use a compiler/transpiler that preserves legacy class, method, property, and parameter decorators. `emitDecoratorMetadata: true` is supported but not required — the package imports `reflect-metadata` from its root entrypoint, so consumers own installing the peer (`^0.1.13 || ^0.2.0`) but do not need a separate `import 'reflect-metadata'` before importing this package.

Supported range is `typescript >=5.5 <7.0` (each maintained `5.x`/`6.x` line). `@types/node` should match the Node target (`>=22`).

Parameter injection is explicit: undecorated hook parameters receive no values. Use decorators such as `@Request()`, `@Document()`, `@Permissions()`, `@Context()`, `@Filter()`, and `@Id()` for every runtime value a hook needs.

Decorated methods run with `this` bound to the decorated class instance, not the Express request. Use `@Request()` when a hook needs request data.

### Compatibility Matrix & Verification

The package claims `express >=5.0.0`, `mongoose >=8.0.0`, `reflect-metadata ^0.1.13 || ^0.2.0`, and `typescript >=5.5 <7.0`. To avoid multiplying full builds, the bounded matrix reuses one packed artifact (built once via `tsup`) and exercises it from multiple clean packed consumers with pinned peer versions:

| Peer               | Versions exercised                                                                                                        |
| ------------------ | ------------------------------------------------------------------------------------------------------------------------- |
| `express`          | `5.1.0` (minimum) and current `5.2.x`                                                                                     |
| `mongoose`         | `8.10.0` (minimum) and current `9.8.x`                                                                                    |
| `reflect-metadata` | `0.1.14` (`0.1` line) and `0.2.2` (`0.2` line)                                                                            |
| `typescript`       | `5.5.x`, `5.9.x`, `6.0.x` with `skipLibCheck:false` and `moduleResolution` / `module` variants (`NodeNext` and `Bundler`) |

Fast sentinel (runs in `pnpm test`): current `express`/`mongoose`/`reflect-metadata`/`typescript` with strict `NodeNext` + `Bundler` compilation and ESM/CJS loading plus production-manifest/tarball assertions. This single build + single consumer install keeps `pnpm test` fast and avoids flaky network pins.

Full matrix (runs via `pnpm --filter @web-ts-toolkit/access-router-deco test:compat` or `pnpm --filter @web-ts-toolkit/access-router-deco exec vitest run --config vitest.compat.config.ts`): same packed artifact against each minimum and each maintained `typescript` line and both `reflect-metadata` lines; minimum peers plus every documented `typescript` line must pass packed runtime + type fixtures, or the documented range must be narrowed explicitly. Reuse the packed tarballs from the sentinel; differing consumers pin peer versions via overrides without rebuilding the package.

## Runtime Ownership

`EgoseFactory` is a compatibility singleton bound to the default `access-router` runtime. Use it when your app intentionally shares the default runtime.

`EgoseFactoryStatic.create()` creates a factory bound to a new isolated `access-router` runtime. Pass an explicit runtime from `createAccessRuntime()` when the host owns runtime lifecycle. `bootstrap(...)` returns `{ runtime, router }` so applications and tests can inspect the runtime that owns the mounted router.

Calling `bootstrap(...)` twice with the same factory, module class, and Express app throws instead of silently mounting duplicate middleware and routes.

## Transactional Bootstrap

`EgoseFactoryStatic.bootstrap(...)` is atomic for package-controlled state. Module, router, and option classes are validated before any constructor runs. The factory snapshots `globalOptions`, `defaultModelOptions`, `modelOptions`, model registrations, model refs/subs/atts, and OpenAPI registrations via `createBootstrapSnapshot()` before mutating the runtime, then restores them via `restoreBootstrapSnapshot()` on any failure. All decorated option registration and Express router construction happen on an unmounted `express.Router()` first; only after every step succeeds are the runtime middleware and `basePath` router mounted on the host app with `app.use(...)`. If the final `app.use` itself throws, the runtime snapshot is still restored and the app's internal stack is truncated to its pre-bootstrap length.

Deterministic checks such as malformed hook chains (`Invalid hook chain for <aclKey>`) and duplicate validator/static-array conflicts are validated in preflight before any setter, so a failure never leaves partial runtime state. A failed `bootstrap` does not mark the module/app tuple as bootstrapped, so retrying with a corrected module behaves like a clean first attempt and mounts exactly one copy of the runtime middleware and every route/hook (no duplication of global/default/model options, hook chains, or OpenAPI routes).

**Non-rollback boundary:** arbitrary user constructors and field initializers (`new Type()`) executed while building the module plan are outside the transaction and are not undone. Express internals outside the mount stack (e.g., `app.set(...)`, already-sent responses) are also not rolled back. The guarantee covers only the factory's runtime state and the Express mount stack (`app._router.stack` / `app.router.stack` truncation).

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

## Hook Inheritance & Symbol Methods

**Symbol methods are supported** — decorated methods may use string or symbol keys (`[Symbol.for('myHook')]()`). Discovery uses `Reflect.ownKeys` and registration/diagnostics are symbol-safe; a decorated symbol method is always discovered and executed through the runtime, never silently ignored. Duplicate scalar detection (e.g., two `@RouteGuard('read')` targeting the same operation) includes symbol identities deterministically via `String(key)` / `Symbol(description)` in diagnostics.

**Array-hook inheritance order is base-to-derived.** For hooks where `array === true` that compose into chains (`prepare`, `transform`, `afterPersist`, `decorate`, `decorateAll`; `validate` is treated as scalar and rejects duplicates), the effective method list for a class is enumerated by `getAllMethodNames` in base-to-derived order: the prototype chain is collected base→derived, the most-derived owner for each key is determined, then keys are yielded base→derived where the owner equals the current prototype. Distinct methods from Base → Child → GrandChild therefore execute in that order so base normalization runs before child specialization. Overridden methods replace the ancestor entry and are positioned at the derived level where their effective hook and parameter metadata live, avoiding stale base metadata. `validate` duplicates across inheritance are rejected deterministically rather than composed.

**Property inheritance remains base-to-derived with child replacement** via `getOwnMetadataListFromPrototypeChain` (independent of method order). `getAllMethodNames` and property merging are separately documented and independently tested, including a three-level hierarchy (Base/Child/GrandChild) with distinct methods targeting one operation, an overridden method, parameter metadata, and a symbol hook.

## Documentation

Full package documentation lives in `website/docs/packages/access-router-deco.md`.

- live docs: https://web-ts-toolkit.pages.dev/docs/packages/access-router-deco
