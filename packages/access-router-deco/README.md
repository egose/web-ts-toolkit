# `@web-ts-toolkit/access-router-deco`

Decorator-based configuration for `@web-ts-toolkit/access-router`.

## Installation

```sh
pnpm add @web-ts-toolkit/access-router-deco @web-ts-toolkit/access-router reflect-metadata express mongoose
```

Peer dependencies:

- `@web-ts-toolkit/access-router`
- `express >= 5`
- `mongoose >= 8` (direct peer)
- `reflect-metadata ^0.1.13 || ^0.2.0` (both `0.1.x` and `0.2.x` lines satisfy the documented init policy; importing `@web-ts-toolkit/access-router-deco` initializes it once before the package decorators run)

Declaration types:

- `@types/express` is a runtime dependency of this package (not a peer). A clean consumer installing only this package and the peers above resolves all emitted `.d.ts` imports with `skipLibCheck: false` — no separate `pnpm add -D @types/express` is required. Removing unrelated workspace packages or their transitive `@types/express` does not break compilation because the types are provided directly by `@web-ts-toolkit/access-router-deco`.

TypeScript:

- Supported compiler range: `>=5.5 <7.0` (maintained `5.x` and `6.x` lines; minimum verified `5.5`, verified `5.9` and `6.0`). Narrow the range if a line is no longer maintained.
- Required compiler options: `experimentalDecorators: true` (legacy decorators). `emitDecoratorMetadata: true` is supported but not required — the package root transitively pulls `reflect-metadata` via decorators, but an explicit `import 'reflect-metadata'` in the app entry remains the safe canonical pattern.
- Strict consumers must compile with `skipLibCheck: false` and either `moduleResolution: "NodeNext"` or `"Bundler"`; both are verified in the packed-consumer suite.

## Highlights

- module-level composition with `@Module(...)`
- model and root router declaration with `@Router(...)`
- option classes with `@RouterOptions(...)`
- hook decorators that map to `access-router` option callbacks
- parameter decorators for request, document, permissions, context, filter, and identifier injection

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

## Main Exports

- `Module(...)`
- `Router(...)`
- `RouterOptions(...)`
- scoped option decorators `GlobalOption(...)`, `ModelOption(...)`, and `DefaultModelOption(...)`
- legacy unscoped property decorator `Option(...)`
- hook decorators `GlobalPermissions`, `DocPermissions`, `BaseFilter`, `OverrideFilter`, `Validate`, `Prepare`, `Transform`, `AfterPersist`, `Decorate`, `DecorateAll`, `RouteGuard`, `Identifier`, `BeforeDelete`, `AfterDelete`
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

Migration note (BDECO-05 — fail-fast decorator targets): hook, parameter, and property decorators are instance-only and reject unsupported targets at decoration time before writing metadata. Static methods/properties/parameters, constructor parameters, and missing/invalid operations (including zero-argument JavaScript calls like `BaseFilter()`) now throw instead of being silently skipped. Previously such declarations compiled but never registered, so a deny guard or filter could silently disappear. If you relied on static decorators, move the hook to an instance method.

Migration note (PDEC-02 — accessor hooks): method-hook decorators also reject getters, setters, missing descriptors, and non-callable or malformed method descriptors before writing hook metadata, without invoking getters. Legacy TypeScript descriptor typing can accept a callable getter such as `@RouteGuard('read') get guard() { return () => false; }`, but this now throws at decoration time instead of silently losing the policy. Use an instance method: `@RouteGuard('read') guard() { return false; }`. Ordinary, inherited, symbol-keyed, and wrapped instance methods remain supported.

| Decorator              | Scope / Valid Class Role                                                                     | Operations                                                                                    | Result Shape (`MaybePromise<…>`)                                                                                                                   | Valid Parameter Decorators                                          |
| ---------------------- | -------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------- |
| `@GlobalPermissions()` | `@Module` only (scalar)                                                                      | —                                                                                             | `GlobalPermissionValue` (`string \| string[] \| Record<string,boolean> \| null \| undefined`)                                                      | `@Request()`                                                        |
| `@DocPermissions(op)`  | `@Router(Model)` / `@RouterOptions(Model)` (scalar)                                          | `default`, `create`, `update`, `list`, `read`                                                 | `Record<string, unknown>` — per-document map, OR-combined with global grants; empty map grants nothing and never revokes a global grant            | `@Document()`, `@Permissions()`, `@Context()`, `@Request()`         |
| `@BaseFilter(op)`      | `@Router(Model)` / `@RouterOptions(Model)` (scalar)                                          | `default`, `update`, `list`, `read`, `delete`                                                 | `Filter \| true \| null \| undefined` — filter restricts; only `false` denies; `null`/`undefined`/`true`/`{}` add no base restriction              | `@Permissions()`, `@Request()`                                      |
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

Security / migration note (BDECO-07 — previously misleading guidance, runtime semantics unchanged): earlier docs said `@BaseFilter` `null` denies and `@DocPermissions` `{}` denies. The runtime never behaved that way — only a `false` base/override filter denies (`null`/`undefined`/`true`/empty `{}` normalize to no restriction and pass the incoming filter through), and document permissions combine with global grants via OR (`permissions.has(key) || docPermissions[key]`), so an empty document map cannot revoke a global grant. If you relied on `null` filters or `{}` document maps to deny, return `false` from the filter hook or gate the route with `@RouteGuard(op)` returning `false` instead. `@Identifier()` hooks run with `this` bound to the decorated class instance like every other hook (never the request object); use `@Request()`/`@Id()` for request values.

Root-shorthand contract (exact-slot registration): decorated hooks occupy exactly one operation slot (`validate.<op>`, `prepare.<op>`, …). Sibling operations (`create` + `update`) and `default` + operation combinations are supported in either declaration order with isolated chains; callback order within one slot is preserved and malformed exact chains still throw. A stored root shorthand (`validate: false | unknown[] | hook`, `prepare: fn | fn[]`, etc.) conflicts with any decorated operation on the same scope — bootstrap rejects with `Duplicate decorated validator for validate.<op>` (validate) or `Conflicting root hook chain for <hook>.<op>` (array hooks) before any setter, so unrelated operations are never silently weakened. Use either root shorthands or decorated operation slots for the same hook scope, not both.

### Property Decorators (Option Injection)

| Decorator                   | Scope / Valid Class Role                                          | Option Key Type                           | Effect                                                              |
| --------------------------- | ----------------------------------------------------------------- | ----------------------------------------- | ------------------------------------------------------------------- |
| `@GlobalOption(key?)`       | `@Module` (global)                                                | `keyof GlobalOptions`                     | `runtime.setGlobalOption(key, propertyValue)`                       |
| `@ModelOption(key?)`        | `@Router(Model)` / `@RouterOptions(Model)` (per-model)            | `keyof ExtendedModelRouterOptions`        | `runtime.setModelOption(model, key, value)`                         |
| `@DefaultModelOption(key?)` | `@RouterOptions` default (one-arg)                                | `keyof ExtendedDefaultModelRouterOptions` | `runtime.setDefaultModelOption(key, value)`                         |
| `@Option(key?)`             | legacy unscoped — any hook-hosting class (role determines target) | `string`                                  | same as above via role-appropriate setter; prefer scoped decorators |

Build-time keys (`basePath`, `parentPath`, `idParam`, `queryRouteSegment`, `mutationRouteSegment`) must be set before route construction (property injection happens in the pre-construction option phase).

**Property contract migration (BDECO-09-F01):** scoped decorators now enforce the
class roles in the table at bootstrap, including inferred-key and inherited
declarations. Wrong-role placement throws `TypeError` before runtime mutation.
Root routers accept no instance option properties (including legacy `Option`);
put root configuration in `@Router(options)`. A child mapping replaces a base
mapping for either the same option key **or the same property**, including symbol
properties. Move misplaced decorators to the intended provider and remove any
reliance on a remapped property writing both old and new keys.

All four property decorators validate these known values before their setters:

- Strings: `requestPermissionField`, `documentPermissionField`, `idParam`,
  `idField`, `parentPath`, `queryRouteSegment`, `mutationRouteSegment`,
  `modelPermissionPrefix`, `modelName`, `basePath`.
- Finite number: `listHardLimit` (including zero; this is a type check, not a new
  limit policy).
- Boolean: `requireRegisteredPopulateModels`.

Optional `undefined` is allowed. Invalid known values throw `TypeError` naming
the key/property, and bootstrap rolls back package-controlled writes. This is
not complete option-schema validation: arbitrary extension/typo keys remain
accepted by legacy `Option`, and structured policies, functions and objects are
governed by their existing runtime contracts. TypeScript property decorators do
not type-check property values; the runtime checks above also apply when an
inferred key or legacy `Option` bypasses explicit-key typing.

### Module mounts and OpenAPI migration

Module `options.basePath` now prefixes both root and model OpenAPI paths, before
collision checks. With module `/api` and model base `/users`, the reachable URL
and generated path are `/api/users`; root `/batch` similarly becomes
`/api/batch`. Empty or `/` module mounts add no prefix. Pre-existing routes in a
shared runtime are preserved; newly registered routes use their own mount.

Model OpenAPI composition is **module base + parentPath + model base**.
`parentPath` remains metadata only and does not change Express matching. Remove
an old `parentPath: '/api'` workaround when the module already mounts at `/api`:
bootstrap rejects parent paths equal to or beneath that mount to prevent a
silent double prefix (`/apiary` is not beneath `/api`). For a proxy prefix `/ext`
that precedes `/api`, leave `parentPath` at its default and pass
`servers: [{ url: '/ext' }]` to `runtime.createOpenApiRouter(...)` or the spec
builder. That yields external `/ext/api/users`; `parentPath: '/ext'` would instead
describe `/api/ext/users`. Live Express URLs are unchanged by this migration.

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

This package uses TypeScript legacy decorators, including parameter decorators. Compile consumers with `experimentalDecorators: true` and use a compiler/transpiler that preserves legacy class, method, property, and parameter decorators. `emitDecoratorMetadata: true` is supported but not required — the package root transitively pulls `reflect-metadata` via decorators, but an explicit `import 'reflect-metadata'` in the app entry remains the safe canonical pattern. Consumers own installing the peer (`^0.1.13 || ^0.2.0`).

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

`EgoseFactoryStatic.bootstrap(...)` snapshots package-controlled runtime state before mutation and delays publication until setup succeeds. Class roles are validated before construction; effective hook declarations are checked during configuration planning. After planning, the factory requires callable `createBootstrapSnapshot()` and `restoreBootstrapSnapshot()` methods, resolving each directly on the runtime API or on its underlying `.runtime` (direct methods take precedence). Missing capability, thrown acquisition errors, or an absent snapshot stop bootstrap before package preflight, setters, model registration, or mounting. The real runtime snapshot covers global/default/model options, model registrations, model refs/subs/atts, and OpenAPI registrations.

Request runtime initialization (`factory.runtime()`), decorated option registration, routes, and opt-in error handlers are composed on an unmounted `express.Router()` first (init before routes and error handlers). Only after setup succeeds is that single module router mounted with `app.use(basePath, router)`. On setup failure, including a final `app.use` that throws after mounting, the factory independently attempts runtime restoration and truncation of the app's mount stack to its pre-bootstrap length.

Request runtime initialization is scoped to the module router mounted at `basePath` and does not run on unrelated host routes. Two isolated modules on one app each use only their owning runtime on their own paths. Applications needing request runtime initialization outside module routes must explicitly own that middleware (for example, `app.use(factory.runtime())`).

Malformed hook chains (`Invalid hook chain for <aclKey>`) and duplicate validator/static-array conflicts are checked in preflight before setters, inside the snapshot boundary because runtime lookups can mutate state. When rollback succeeds, bootstrap rethrows the exact original value, including non-`Error` throws. A corrected retry then behaves like a clean first attempt, with one mount and one copy of initialization, routes, hooks, and OpenAPI registrations.

**Recovery failure:** if runtime restoration or app-stack cleanup throws, bootstrap reports an `AggregateError`. Its `cause` and first `errors` entry are the original thrown value; subsequent entries are the runtime-restore failure and/or app-cleanup failure in that order. Both recovery steps are attempted even if one fails. Failed runtime restoration leaves runtime state uncertain; failed app cleanup can leave routes mounted. The host must repair or replace the affected runtime/app before retrying. Every attempt releases the in-progress reservation, and a failed attempt is not marked bootstrapped; this permits recovery but does not prove rollback succeeded.

**Migration note:** bootstrap previously ignored snapshot acquisition/restoration failures. Runtime adapters and test doubles must now provide working synchronous snapshot/restore capability; missing methods no longer permit unprotected setup. Ordinary successful rollback preserves error identity, while failed recovery now surfaces the original and recovery failures together.

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

## Hook Inheritance & Symbol Methods

**Hook class roles are enforced at bootstrap.** Every known effective hook declaration is checked before runtime setters or Express publication, including inherited, symbol-keyed, wrapped, and mixed allowed/disallowed declarations. `@GlobalPermissions()` belongs only on `@Module`; model hooks belong on `@Router(Model)` or `@RouterOptions(Model)`. Default `@RouterOptions(options)` accepts only `@RouteGuard` and `@Identifier`. Root `@Router(options)` accepts no hook methods; its prototype is validated without constructing the root class.

**Migration note:** wrong-role hooks that were previously silently ignored now stop bootstrap with the class, member, hook, and valid placements in the diagnostic. Move the declaration to a provider with the intended supported scope; bootstrap does not reassign it automatically. Only effective declarations are checked: an override suppresses ancestor hook metadata, and a decorated override is checked in its own class role. Constructors of other providers still run during configuration planning and remain outside rollback.

**Method-wrapper composition is supported in either decorator order.** Legacy TypeScript decorators that mutate `descriptor.value` or return a replacement method descriptor retain the hook declaration on that declaring member. Bootstrap invokes the effective wrapped method with the class instance as `this` and the existing explicit parameter injection (including sparse positions). This also applies to inherited and symbol-keyed methods. An override still replaces the ancestor's hook and parameter declarations; redecorate the override to register it.

Wrappers remain responsible for the behavior they return: forward `this`, arguments, return values/promises, and errors when preserving the original hook. Composition support does not restore behavior discarded by a wrapper or transfer declarations to a different member. **Migration note:** instrumentation that previously replaced a decorated function could silently drop its guard or validator; that declared policy now remains active regardless of decorator order.

**Symbol methods are supported** — decorated methods may use string or symbol keys (`[Symbol.for('myHook')]()`). Discovery uses `Reflect.ownKeys` and registration/diagnostics are symbol-safe; a decorated symbol method is always discovered and executed through the runtime, never silently ignored. Duplicate scalar detection (e.g., two `@RouteGuard('read')` targeting the same operation) includes symbol identities deterministically via `String(key)` / `Symbol(description)` in diagnostics.

**Array-hook inheritance order is base-to-derived.** For hooks where `array === true` that compose into chains (`prepare`, `transform`, `afterPersist`, `decorate`, `decorateAll`; `validate` is treated as scalar and rejects duplicates), the effective method list for a class is enumerated by `getAllMethodNames` in base-to-derived order: the prototype chain is collected base→derived, the most-derived owner for each key is determined, then keys are yielded base→derived where the owner equals the current prototype. Distinct methods from Base → Child → GrandChild therefore execute in that order so base normalization runs before child specialization. Overridden methods replace the ancestor entry and are positioned at the derived level where their effective hook and parameter metadata live, avoiding stale base metadata. `validate` duplicates across inheritance are rejected deterministically rather than composed.

**Property inheritance remains base-to-derived with child replacement** via `getOwnMetadataListFromPrototypeChain` (independent of method order). `getAllMethodNames` and property merging are separately documented and independently tested, including a three-level hierarchy (Base/Child/GrandChild) with distinct methods targeting one operation, an overridden method, parameter metadata, and a symbol hook.

## Documentation

Full package documentation lives in `website/docs/packages/access-router-deco.md`.

- live docs: https://web-ts-toolkit.pages.dev/docs/packages/access-router-deco
