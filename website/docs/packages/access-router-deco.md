---
sidebar_label: Access Router Deco
sidebar_position: 13
---

# `@web-ts-toolkit/access-router-deco`

Decorator-based configuration for `@web-ts-toolkit/access-router`.

This package lets you describe `access-router` modules, model routers, router options, and hook methods with TypeScript decorators instead of wiring everything by hand.

## Property and OpenAPI migration

Scoped property decorators enforce their class role at bootstrap: `GlobalOption`
on modules, `DefaultModelOption` on default providers, and `ModelOption` on model
routers/providers. Misplaced declarations throw `TypeError`, including inherited
and inferred-key declarations. Root routers reject all instance option properties;
use `@Router(options)`. A child remapping replaces inherited entries for either
the same property (including symbols) or the same option key.

All property decorators, including legacy `Option`, validate known scalar values:
`requestPermissionField`, `documentPermissionField`, `idParam`, `idField`,
`parentPath`, `queryRouteSegment`, `mutationRouteSegment`, `modelPermissionPrefix`,
`modelName`, and `basePath` require strings; `listHardLimit` requires a finite
number; `requireRegisteredPopulateModels` requires a boolean. Optional `undefined`
remains allowed. Invalid values throw and package-controlled writes roll back.
Unknown extension/typo keys remain allowed; this is not exhaustive validation of
structured policies or hooks, and decorators cannot type-check property values.

Module `options.basePath` now prefixes generated OpenAPI paths before collision
checks as well as mounting Express. Module `/api` plus model `/users` produces
`/api/users`; root `/batch` produces `/api/batch`. Shared-runtime prior entries
are preserved. Model OpenAPI composition is module base + `parentPath` + model
base; `parentPath` does not affect Express matching. Remove old `parentPath`
workarounds that equal or descend from the module mount: bootstrap rejects them
to avoid doubled paths (segment-aware: `/apiary` is not beneath `/api`).

For a reverse-proxy prefix `/ext`, leave `parentPath` at its default and pass
`servers: [{ url: '/ext' }]` when generating the OpenAPI router/spec. This describes
`/ext/api/users`; `parentPath: '/ext'` would describe `/api/ext/users` instead.
Express URLs are unchanged by this migration.

## Installation

```bash npm2yarn
npm install @web-ts-toolkit/access-router-deco @web-ts-toolkit/access-router reflect-metadata express mongoose
```

Peer dependencies:

- `@web-ts-toolkit/access-router`
- `express >=5`
- `mongoose >=8` (direct peer)
- `reflect-metadata ^0.1.13 || ^0.2.0` (both `0.1` and `0.2` lines satisfy the documented init policy)

Declaration types: `@types/express` is a runtime dependency of this package. A clean consumer installing only the package and the peers above resolves all emitted `.d.ts` imports with `skipLibCheck: false` — no extra `@types/express` install needed. Removing unrelated workspace packages or their transitive `@types/express` does not break compilation.

TypeScript: `>=5.5 <7.0` (maintained `5.x`/`6.x` lines, verified `5.5`/`5.9`/`6.0`). Requires `experimentalDecorators: true` (legacy decorators); `emitDecoratorMetadata: true` is supported but not required. `skipLibCheck: false` with `moduleResolution: NodeNext` or `Bundler` is verified via the packed-consumer suite (see Compatibility Matrix in the package README — sentinel in `pnpm test`, full matrix via `pnpm --filter @web-ts-toolkit/access-router-deco test:compat`).

The package root transitively pulls `reflect-metadata` via decorators, but an explicit `import 'reflect-metadata'` in the app entry remains the safe canonical pattern.

## What It Exposes

- `Module(...)`
- `Router(...)`
- `RouterOptions(...)`
- hook decorators `GlobalPermissions`, `DocPermissions`, `BaseFilter`, `OverrideFilter`, `Validate`, `Prepare`, `Transform`, `AfterPersist`, `Decorate`, `DecorateAll`, `RouteGuard`, `Identifier`, `BeforeDelete`, `AfterDelete`
- parameter decorators `Request`, `Document`, `Permissions`, `Context`, `Filter`, and `Id`
- scoped property decorators `GlobalOption(...)`, `ModelOption(...)`, and `DefaultModelOption(...)`
- legacy unscoped property decorator `Option(...)`
- `EgoseFactory.bootstrap(...)`
- `EgoseFactoryStatic.create(...)`
- exported types such as `BootstrapResult`, `ModuleMetadata`, `RouterModel`, and `Type`

## Quick Start

This public article endpoint lets anyone read a published article by slug. It grants no list or write access and exposes only the allowed read fields (plus Access Router's `_id` and `_permissions` metadata). Authentication is unnecessary for this public policy; request headers do not grant privileges.

```ts
import 'reflect-metadata';
import express from 'express';
import mongoose from 'mongoose';
import { Module, Router, BaseFilter, Identifier, Id, EgoseFactoryStatic } from '@web-ts-toolkit/access-router-deco';

// Call once per host-owned connection; pass the model instance, not a global name.
export function createArticleApp(connection: mongoose.Connection) {
  const Article = connection.model(
    'Article',
    new mongoose.Schema({
      slug: { type: String, required: true, unique: true },
      title: { type: String, required: true },
      body: String,
      published: { type: Boolean, default: false },
      internalNotes: String,
    }),
  );

  @Router(Article, {
    basePath: '/articles',
    // No list fallback or computed field-permission metadata (only its empty placeholder).
    defaults: { publicReadOptions: { includePermissions: false, tryList: false } },
    operationAccess: {
      read: true,
      list: false,
      new: false,
      create: false,
      update: false,
      upsert: false,
      delete: false,
      distinct: false,
      count: false,
      subs: false,
    },
    permissionSchema: {
      slug: { read: true },
      title: { read: true },
      body: { read: true },
      published: false,
      internalNotes: false,
    },
  })
  class ArticleRouter {
    @BaseFilter('read')
    publishedOnly() {
      return { published: true };
    }

    @Identifier()
    bySlug(@Id() slug: string) {
      return { slug };
    }
  }

  @Module({
    routers: [ArticleRouter],
    options: { basePath: '/api', handleErrors: true },
  })
  class ArticleModule {}

  const app = express();
  app.use(express.json());
  const factory = EgoseFactoryStatic.create(); // New isolated Access Router runtime.
  const { runtime } = factory.bootstrap(ArticleModule, app);
  return { app, runtime, Article };
}
```

Save this as `articles.ts`. Prerequisites: Node >=22, the dependencies and legacy TypeScript settings above, and a reachable MongoDB database. In an async host startup, open a dedicated connection before listening (compile TypeScript before running Node):

```ts
import mongoose from 'mongoose';
import { createArticleApp } from './articles.js';

async function main() {
  const uri = process.env.MONGODB_URI;
  if (!uri) throw new Error('Set MONGODB_URI');
  const connection = await mongoose.createConnection(uri).asPromise();
  const { app, Article } = createArticleApp(connection);
  await Article.init(); // Ensure the unique slug index exists before serving.
  // Provision articles through a trusted seed/admin process, e.g.:
  // await Article.create({ slug: 'welcome', title: 'Welcome', body: 'Hello', published: true });
  const server = app.listen(3000);
  // The host owns shutdown: close server, then await connection.close().
  return { server, connection };
}
void main().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
```

After provisioning `welcome`, `GET /api/articles/welcome` returns its public fields. A draft slug returns `404`; `GET /api/articles` and `POST /api/articles` return `401` under Access Router's denial contract. Sending `x-role: admin` changes none of these decisions. JSON parsing is installed before routes, but parsed bodies do not authorize writes.

`operationAccess` authorizes operations; `permissionSchema` authorizes fields. A document-permission map alone does not configure either policy. Migration note (PDEC-05): the former quickstart trusted `x-role` as an administrator grant; replace that pattern with this public policy or a host-verified principal boundary. For private/tenant workflows, authenticate in host middleware before bootstrap's mounted router, deny missing principals with a route guard, and derive tenant filters from that verified principal via `@Request()`. Use `@Context()` for model-hook context where supported by the hook table below. Filters restrict data; they are not authentication. Request/principal state belongs in the injected request/context, never shared class fields. Each tenant-owned connection/model should use its own factory runtime; isolation alone does not authenticate tenant selection.

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

## Transactional Bootstrap

`EgoseFactoryStatic.bootstrap(...)` snapshots package-controlled runtime state before mutation and delays publication until setup succeeds. Class roles are validated before construction; effective hook declarations are checked during configuration planning. After planning, the factory requires callable `createBootstrapSnapshot()` and `restoreBootstrapSnapshot()` methods, resolving each directly on the runtime API or on its underlying `.runtime` (direct methods take precedence). Missing capability, thrown acquisition errors, or an absent snapshot stop bootstrap before package preflight, setters, model registration, or mounting. The real runtime snapshot covers global/default/model options, model registrations, model refs/subs/atts, and OpenAPI registrations.

Request runtime initialization (`factory.runtime()`), decorated option registration, routes, and opt-in error handlers are composed on an unmounted `express.Router()` first (init before routes and error handlers). Only after setup succeeds is that single module router mounted with `app.use(basePath, router)`. On setup failure, including a final `app.use` that throws after mounting, the factory independently attempts runtime restoration and truncation of the app's mount stack to its pre-bootstrap length.

Request runtime initialization is scoped to the module router mounted at `basePath` and does not run on unrelated host routes. Two isolated modules on one app each use only their owning runtime on their own paths. Applications needing request runtime initialization outside module routes must explicitly own that middleware (for example, `app.use(factory.runtime())`).

Malformed hook chains (`Invalid hook chain for <aclKey>`) and duplicate validator/static-array conflicts are checked in preflight before setters, inside the snapshot boundary because runtime lookups can mutate state. When rollback succeeds, bootstrap rethrows the exact original value, including non-`Error` throws. A corrected retry then behaves like a clean first attempt, with one mount and one copy of initialization, routes, hooks, and OpenAPI registrations.

**Recovery failure:** if runtime restoration or app-stack cleanup throws, bootstrap reports an `AggregateError`. Its `cause` and first `errors` entry are the original thrown value; subsequent entries are the runtime-restore failure and/or app-cleanup failure in that order. Both recovery steps are attempted even if one fails. Failed runtime restoration leaves runtime state uncertain; failed app cleanup can leave routes mounted. The host must repair or replace the affected runtime/app before retrying. Every attempt releases the in-progress reservation, and a failed attempt is not marked bootstrapped; this permits recovery but does not prove rollback succeeded.

**Migration note:** bootstrap previously ignored snapshot acquisition/restoration failures. Runtime adapters and test doubles must now provide working synchronous snapshot/restore capability; missing methods no longer permit unprotected setup. Ordinary successful rollback preserves error identity, while failed recovery now surfaces the original and recovery failures together.

**Non-rollback boundary:** arbitrary user constructors and field initializers (`new Type()`) executed while building the module plan are outside the transaction and are not undone. Express internals outside the mount stack (e.g., `app.set(...)`, already-sent responses) are also not rolled back. The guarantee covers only the factory's runtime state and the Express mount stack (`app._router.stack` / `app.router.stack` truncation).

## TypeScript Decorator Configuration

This package uses TypeScript legacy decorators, including parameter decorators. Compile consumers with `experimentalDecorators: true` and use a compiler/transpiler that preserves legacy class, method, property, and parameter decorators. `emitDecoratorMetadata: true` is supported but not required — the package root transitively pulls `reflect-metadata` via decorators, but an explicit `import 'reflect-metadata'` in the app entry remains the safe canonical pattern. Consumers own installing the peer (`^0.1.13 || ^0.2.0`). Supported range is `typescript >=5.5 <7.0` (each maintained `5.x`/`6.x` line; minimum verified `5.5`).

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

Typed models compose through the exported `RouterModel<TModel>` alias without casts, and decorator overloads keep model-specific option inference (`ModelRouterOptions<TModel>`):

```ts
import type { Model } from 'mongoose';
import type { RouterModel } from '@web-ts-toolkit/access-router-deco';

type User = { name: string };
declare const UserModel: Model<User>;

const modelRef: RouterModel = UserModel;
const typedRef: RouterModel<User> = UserModel;

function registerModel(value: RouterModel<User>) {
  Router(value, { basePath: '/users' })(UserRouter);
  RouterOptions(value, { idParam: 'userId' })(UserOptions);
}
```

A `string | Model<TModel>` union held in a variable or function parameter is accepted wherever a model name or instance is. Option objects still infer from the model type (e.g. `permissionSchema` keys), and model-like objects or non-model values are still rejected.

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

Migration note (BDECO-05 — fail-fast decorator targets): hook, parameter, and property decorators are instance-only and reject unsupported targets at decoration time before writing metadata. Static methods/properties/parameters, constructor parameters, and missing/invalid operations (including zero-argument JavaScript calls like `BaseFilter()`) now throw instead of being silently skipped. Previously such declarations compiled but never registered, so a deny guard or filter could silently disappear. If you relied on static decorators, move the hook to an instance method.

Migration note (PDEC-02 — accessor hooks): method-hook decorators also reject getters, setters, missing descriptors, and non-callable or malformed method descriptors before writing hook metadata, without invoking getters. Legacy TypeScript descriptor typing can accept a callable getter such as `@RouteGuard('read') get guard() { return () => false; }`, but this now throws at decoration time instead of silently losing the policy. Use an instance method: `@RouteGuard('read') guard() { return false; }`. Ordinary, inherited, symbol-keyed, and wrapped instance methods remain supported.

| Decorator              | Maps to             | Scope / Valid Class Role                                           | Operations                                                                                    | Result Shape (`MaybePromise<…>`)                                                                                                       |
| ---------------------- | ------------------- | ------------------------------------------------------------------ | --------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------- |
| `@GlobalPermissions()` | `globalPermissions` | `@Module` only                                                     | —                                                                                             | `GlobalPermissionValue` (`string \| string[] \| Record<string,boolean> \| null \| undefined`)                                          |
| `@DocPermissions(op)`  | `docPermissions.*`  | `@Router(Model)` / `@RouterOptions(Model)`                         | `default`, `create`, `update`, `list`, `read`                                                 | `Record<string,unknown>` — per-document map, OR-combined with global grants; empty map grants nothing and never revokes a global grant |
| `@BaseFilter(op)`      | `baseFilter.*`      | `@Router(Model)` / `@RouterOptions(Model)`                         | `default`, `update`, `list`, `read`, `delete`                                                 | `Filter \| true \| null \| undefined` — filter restricts; only `false` denies; `null`/`undefined`/`true`/`{}` add no base restriction  |
| `@OverrideFilter(op)`  | `overrideFilter.*`  | `@Router(Model)` / `@RouterOptions(Model)`                         | `default`, `update`, `list`, `read`, `delete`                                                 | `Filter`                                                                                                                               |
| `@Validate(op)`        | `validate.*`        | `@Router(Model)` / `@RouterOptions(Model)`                         | `default`, `create`, `update`                                                                 | `boolean \| unknown[]` — `true` passes, `false` / non-empty array → `400` controlled failure; returning the document is a type error   |
| `@Prepare(op)`         | `prepare.*`         | `@Router(Model)` / `@RouterOptions(Model)`                         | `default`, `create`, `update`                                                                 | `TValue` (prepared document)                                                                                                           |
| `@Transform(op)`       | `transform.*`       | `@Router(Model)` / `@RouterOptions(Model)`                         | `default`, `update`                                                                           | `ModelDocument<TValue>`                                                                                                                |
| `@AfterPersist(op)`    | `afterPersist.*`    | `@Router(Model)` / `@RouterOptions(Model)`                         | `default`, `create`, `update`                                                                 | `ModelDocument<TValue>`                                                                                                                |
| `@Decorate(op)`        | `decorate.*`        | `@Router(Model)` / `@RouterOptions(Model)`                         | `default`, `create`, `update`, `list`, `read`                                                 | `TValue`                                                                                                                               |
| `@DecorateAll(op)`     | `decorateAll.*`     | `@Router(Model)` / `@RouterOptions(Model)`                         | `default`, `list`                                                                             | `TValue[]`                                                                                                                             |
| `@RouteGuard(op)`      | `operationAccess.*` | `@Router(Model)` / `@RouterOptions(Model)` / default model options | `default`, `new`, `list`, `create`, `read`, `update`, `upsert`, `delete`, `distinct`, `count` | `boolean`                                                                                                                              |
| `@Identifier()`        | `resolveIdFilter`   | `@Router(Model)` / `@RouterOptions(Model)` / default               | —                                                                                             | `Filter`                                                                                                                               |
| `@BeforeDelete()`      | `beforeDelete`      | `@Router(Model)` / `@RouterOptions(Model)`                         | —                                                                                             | `void`                                                                                                                                 |
| `@AfterDelete()`       | `afterDelete`       | `@Router(Model)` / `@RouterOptions(Model)`                         | —                                                                                             | `void`                                                                                                                                 |

Most decorators take the same operation names you would use in plain `access-router` options, such as `create`, `read`, `update`, `list`, or `delete`. Scalar hooks (`globalPermissions`, `docPermissions`, `baseFilter`, `overrideFilter`, `validate`, `routeGuard`, `identifier`, `beforeDelete`, `afterDelete`) reject duplicate keys on the same class; array hooks (`prepare`, `transform`, `afterPersist`, `decorate`, `decorateAll`) compose base→derived.

**Hook class roles are enforced at bootstrap.** Every known effective hook declaration is checked before runtime setters or Express publication, including inherited, symbol-keyed, wrapped, and mixed allowed/disallowed declarations. `@GlobalPermissions()` belongs only on `@Module`; model hooks belong on `@Router(Model)` or `@RouterOptions(Model)`. Default `@RouterOptions(options)` accepts only `@RouteGuard` and `@Identifier`. Root `@Router(options)` accepts no hook methods; its prototype is validated without constructing the root class.

**Migration note:** wrong-role hooks that were previously silently ignored now stop bootstrap with the class, member, hook, and valid placements in the diagnostic. Move the declaration to a provider with the intended supported scope; bootstrap does not reassign it automatically. Only effective declarations are checked: an override suppresses ancestor hook metadata, and a decorated override is checked in its own class role. Constructors of other providers still run during configuration planning and remain outside rollback.

**Method-wrapper composition**

Legacy TypeScript decorators that mutate `descriptor.value` or return a replacement method descriptor retain hook declarations in either decorator order. Bootstrap invokes the effective wrapped method with the class instance as `this` and explicit parameter injection, including sparse positions. Inherited and symbol-keyed methods are supported. An override replaces the ancestor's hook and parameter declarations; redecorate the override to register it.

Wrappers remain responsible for the behavior they return: forward `this`, arguments, return values/promises, and errors when preserving the original hook. Composition support does not restore behavior discarded by a wrapper or transfer declarations to a different member. **Migration note:** instrumentation that previously replaced a decorated function could silently drop its guard or validator; that declared policy now remains active regardless of decorator order.

`@Validate`: return `true` on success, `false` or an issue array such as `['email is required']` on invalid input — do not `throw` for expected invalid input nor return the document, and the typed hook now fails to compile if you return a document.

Security / migration note (BDECO-07 — previously misleading guidance, runtime semantics unchanged): earlier docs said a `@BaseFilter` returning `null` denies and a `@DocPermissions` returning `{}` denies. The runtime never behaved that way — only a `false` filter denies (`null`/`undefined`/`true`/empty `{}` normalize to no restriction and pass the incoming filter through), and document permissions combine with global grants via OR (`permissions.has(key) || docPermissions[key]`), so an empty document map cannot revoke a global grant. If you relied on `null` filters or `{}` document maps to deny, return `false` from the filter hook or gate the route with `@RouteGuard(op)` returning `false` instead. `@Identifier()` hooks run with `this` bound to the decorated class instance like every other hook (never the request object); use `@Request()`/`@Id()` for request values.

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
