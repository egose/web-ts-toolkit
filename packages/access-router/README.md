# `@web-ts-toolkit/access-router`

ACL-aware Express routers and in-memory data services for Mongoose-backed APIs.

**Start here:** [Quick Start](#quick-start) · [Imports](#import-styles) ·
[Configuration layers](#configuration-layers) · [Public exports](#main-exports)

**Guide:** [Operation guards](#basic-and-advanced-operation-access) ·
[Data routers](#data-routers) · [Root batches](#root-batch-bounds) ·
[Runtime isolation](#default-runtime-vs-isolated-runtime) ·
[Validation and OpenAPI](#request-validation-and-openapi)

**Business contracts:** [Service authorization](#trusted-service-authorization) ·
[Mutation input](#independent-mutation-input-authority) ·
[Subdocuments](#dedicated-subdocument-authorization) ·
[Includes and counts](#include-cardinality) · [Correlated includes](#correlated-includes) ·
[Virtuals](#virtuals-computed-fields) · [Hook admission](#hook-admission-and-reentrant-service-calls) ·
[Persistence limits](#persistence-concurrency-and-resource-limits)

**Private virtual inputs:** [Populated dependencies and runnable example](#private-populated-dependencies)

**Migration:** [Removed overrides](#breaking-release-service-overrides-migration) ·
[Server-owned hydration](#breaking-release-server-owned-hydration) ·
[Named helpers](#breaking-release-named-helpers-and-default-behavior) ·
[Distinct values](#distinct-whole-value-request-authorization) ·
[Numeric grouped counts](#numeric-grouped-count-service-api-breaking-migration) ·
[`skim`](#skim-compatibility-no-op)

## Installation

```sh
pnpm add @web-ts-toolkit/access-router express mongoose
```

Peer dependencies:

- `express >= 5`
- `mongoose >= 8`

Use Node.js 22 or newer. The package ships bundled CommonJS/ESM entrypoints and
matching declarations; prefer default `acl` for the shared runtime or named
`createAccessRuntime` for isolation.

TypeScript applications also need `typescript`, `@types/node`, and `@types/express`
as development dependencies. MongoDB must be reachable for model operations;
in-memory data routers need no database connection. Install an external validator
such as AJV only when using its adapter.

## Quick Start

A public-read catalog needs a model, route guards, and field rules. Save this as
`server.mts` and compile with TypeScript/NodeNext, or run it directly with Node 22.18+.

<!-- doc-example: partial -->

```ts
import express from 'express';
import mongoose from 'mongoose';
import { createAccessRuntime } from '@web-ts-toolkit/access-router';

const api = createAccessRuntime();
const Product = mongoose.model('Product', new mongoose.Schema({ name: String, internalCost: Number }));
const products = api.createRouter(Product, {
  basePath: '/products',
  operationAccess: { list: true, read: true },
  permissionSchema: { name: true },
});

const app = express();
app.use(express.json());
app.use(products.routes); // includes this runtime's request middleware

try {
  await mongoose.connect(process.env.MONGODB_URL ?? 'mongodb://127.0.0.1:27017/example');
} catch (error) {
  console.error(error);
  process.exit(1);
}
app.listen(3000);
```

`GET /products?select=name&limit=20` returns `{ data, meta }`; `GET /products/:id`
returns one readable product. `_id` is retained by default, and `internalCost`
requires its own field permission. Unconfigured write operations are denied.
Passing the model instance registers it in this runtime and preserves its Mongoose
connection. [String-name factories](#createrouter-overloads) need a registered model.

For actor-specific rules, resolve grants from your application's authenticated
server-side actor in `globalPermissions`, then use those permission names in the
rules. The public-read example needs neither authentication nor a schema plugin.

## Import styles

<!-- doc-example: partial -->

```ts
import acl from '@web-ts-toolkit/access-router'; // preferred shared-runtime API
import { createAccessRuntime, fromZod } from '@web-ts-toolkit/access-router'; // isolated API / helpers
import { parseBody, Codes, MIDDLEWARE } from '@web-ts-toolkit/access-router/advanced';
import { copyAndDepopulate } from '@web-ts-toolkit/access-router/processors';
```

`import { acl }` is the same value as the default export. In CommonJS use
`const { acl, createAccessRuntime } = require('@web-ts-toolkit/access-router')`;
`require(...)` itself is the export object, not the callable `acl` value.

| Entrypoint                                 | Use it for                                                                                                                                                                                           |
| ------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `@web-ts-toolkit/access-router`            | Runtime/router factories, guards, validation adapters, public configuration and authorization types.                                                                                                 |
| `@web-ts-toolkit/access-router/advanced`   | Additional request/service/wire types (`ModelRequest`, `RootQueryEntry`, `FindOptions`, `Defaults`, `Include`), enums, symbols and parsers. No runtime factory or standalone `Service` class export. |
| `@web-ts-toolkit/access-router/processors` | Named document processors and their option/output types; [typed example](#subpath-import-example).                                                                                                   |

Use package-name imports, not `src/*` or `dist/*` paths. The three entrypoints have
ESM/CJS JavaScript and matching `.d.mts`/`.d.ts` declarations selected by `exports`.
See [Main Exports](#main-exports) for the inventory. Acquire services from
`router.getService(req)` or `req.macl.getService(name)` after the owning middleware
initializes the request.

## Configuration layers

`const api = createAccessRuntime()` returns a callable **runtime-bound API**;
`api.runtime` is its owning `AccessRuntime`. Default `acl` has the same API over
`defaultRuntime`. Prefer methods on that API or `router.runtime` when configuring
a particular runtime. Standalone named option helpers use the active runtime in
package-managed execution, falling back to `defaultRuntime` outside it.

| Layer / public type                                                             | Where to put it                                                                                         | Scope and examples                                                                                                                                                                                          |
| ------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Runtime/global — `GlobalOptions`                                                | `api.setGlobalOptions({...})`, `api.setGlobalOption(key, value)`; `api.set` is an alias for these forms | That runtime's request grants (`globalPermissions`, `requestPermissionField`), logger, registered-populate policy and `requestComplexity`.                                                                  |
| Model defaults — `DefaultModelRouterOptions`                                    | `api.setDefaultModelOptions({...})`, `api.setDefaultModelOption(path, value)`                           | Shared model starting values such as `listHardLimit`, IDs, route segments, `operationAccess`, `hydration` and metadata posture. Data/root routers do not inherit them.                                      |
| Model router — `ModelRouterOptions<Model, Virtuals>`                            | `api.createRouter(Model, {...})`, then `router.setOptions`, `router.setOption` / `router.set`           | One registered model's guards, `permissionSchema`, hooks, virtuals, request schemas, `hydration` and method defaults. Routers for the same model/runtime share its stored options.                          |
| Data router — `DataRouterOptions<Data>`                                         | `api.createDataRouter(name, {...})`, its setters, or `api.runtime.setDataOptions` / `setDataOption`     | Owned in-memory `data`, list/read guards, request-only fields/filters and decorators. No model `defaults` or model authorization policy. Set `idParam` and `idField` explicitly for data identifier routes. |
| Root router — `RootRouterOptions`                                               | Single-argument `api.createRouter({ basePath, operationAccess, ... })`                                  | The batch endpoint's scalar guard and batch/order/whole-operation limits; each target keeps its own policy.                                                                                                 |
| Per-method defaults — `Defaults<Model>` from `/advanced`                        | `ModelRouterOptions.defaults`, e.g. `defaults.publicListArgs` or `defaults.findOptions`                 | Query/presentation defaults for the **named method**, not hydration, global settings or trusted authority. Public wrappers and internal methods have separate buckets.                                      |
| Wire query / `args` / `options`                                                 | GET query, advanced body, or root entry                                                                 | Request-controlled selection, sorting, pagination and allowed presentation options; placement and spelling depend on transport (below).                                                                     |
| Trusted per-call policy — `ServiceAuthorization`, `MutationAuthorization`, etc. | The internal service's final `options.authorization`                                                    | Server-owned, method-specific row/input/output/related authority. Absent dimensions use request authority. Never a router default, HTTP option or reusable permission mutation.                             |

### Assignment, precedence and capture

1. **Assignment is shallow.** Object setters replace each supplied top-level value
   and keep other top-level keys. `setOptions({ operationAccess: { read: true } })`
   replaces the whole stored guard object; it does not merge its old siblings.
   Model option assignment is `{ ...runtimeModelDefaults, ...storedModelOptions,
...suppliedOptions }`. Changing runtime defaults does not broadcast over values
   already stored on a model. Data assignment has no model-default layer.
2. **Dotted setters update one path copy-on-write.** Use
   `router.setOption('operationAccess.basicRead', false)` to keep sibling rules,
   or pass `undefined` to restore lookup fallback. Property helpers such as
   `router.operationAccess('basicRead', false)` are for defined values; use
   `set`/`setOption` for undefined. Updating a path beneath a scalar starts an
   object; use a `default` entry to retain a broad fallback. Dotted keys belong in
   setter arguments, not flat constructor-object properties.
3. **Lookup is not a deep merge.** Generic nested option/hook lookup uses the
   stored exact path → its parent's `.default` → the parent value (bare hook or
   shorthand). Only `undefined` falls through, not false/null. The generic model
   getter uses the exact runtime-model-default path as its final fallback if the
   stored parent is also absent. `getExactModelOption` instead checks just the
   exact stored path, then the same runtime-default path; `getExactDataOption`
   checks only the stored path. `getDefaultModelOption` is exact. **Route guards
   have their own resolver:** exact variant (including exact model-default
   fallback) → base exact/`.default`/shorthand. A default variant can therefore
   outrank a model's base rule. See the [full precedence](#variant-and-base-fallback),
   including closed [subdocument rules](#subdocument-field-precedence).
4. **Method values resolve with `??`.** At each service resolver a non-nullish
   supplied property wins over that method's `defaults` bucket, then its built-in
   fallback. False, zero, `''` and `[]` are supplied values; their normal validation
   and selection meanings still apply. Public `_list`/`_read`/`_create`/`_update`
   resolve `public*Args`/`public*Options` first, then forward resolved values to
   internal methods. A still-undefined query setting can reach the internal bucket;
   an already resolved built-in (such as public list `includeCount: false`) takes
   precedence over that internal default. By-ID delegations similarly forward
   resolved values. Hydration is separate model configuration, not a method value.
   Public `_upsert` uses the public create or update bucket for its branch; trusted
   `upsert` has `upsertArgs`/`upsertOptions`. There is no `publicUpsertOptions` bucket.
5. **Metadata posture is absolute.** Model `stripPermissionsField: true` removes
   the entire output metadata field; `disableFieldPermissions: true` suppresses
   `_view`/`_edit` computation. They win over per-call flags and method defaults.
   Internal authorization and full document grants still run.

The supported `Defaults` buckets are `findArgs`/`findOptions`,
`findOneArgs`/`findOneOptions`, `findByIdArgs`/`findByIdOptions`,
`createArgs`/`createOptions`, `updateOneArgs`/`updateOneOptions`,
`updateByIdArgs`/`updateByIdOptions`, `upsertArgs`/`upsertOptions`, `existsOptions`,
and the four `publicList`, `publicRead`, `publicCreate`, `publicUpdate` Args/Options
pairs. There is no general `defaults.options`, count, or data-method bucket.
An explicit `service.defaults` assignment replaces the entire runtime defaults bag
for that service; it does not merge buckets. Neither form selects hydration.

<!-- doc-example: partial -->

```ts
import type { ModelRouterOptions } from '@web-ts-toolkit/access-router';

const options = {
  operationAccess: { list: true, read: true },
  permissionSchema: { name: true },
  defaults: {
    publicListArgs: { select: ['name'], limit: 20 },
    publicListOptions: { includePermissions: false },
    findOptions: { includeCount: true }, // internal find; public list resolves its own flag
  },
} satisfies ModelRouterOptions;
```

`router.options` is a frozen **construction-time snapshot**. Runtime option getters
return frozen stored snapshots; read them again for current values. Ordinary plain
option containers are copied/frozen; hook functions, Mongoose models and other
non-plain handles keep their identities, and the logger is retained by reference.
Data has the stronger
[data-specific ownership contract](#in-memory-data-ownership), including detached
native-valued getter copies.

Route guards and request-schema lookups read live policy. A retained model service
reads its originating runtime's current presentation options/defaults on each call;
model authorization calls capture
their current policy/configuration before awaiting hooks and keep it coherent for
that call. Each document/scope/access stage has separate grants. A data service
captures its data version at construction. Acquire a new service for replacement
data. Request permission initialization is reused within its owning request/runtime.
Base-filter results are reused for the same model/access and policy function;
replacing that function starts a fresh cache entry. Hook/persistence
limits are captured together on first work-state use and retained by that owner.

Model services and public services retain their originating core, actor, row cache,
model connection and registry even if another runtime later initializes the same
Express request. This includes scalar counts/distinct, ID lookups, mutations, includes,
populate, subdocuments and field helpers. Services acquired later from a retained core
also belong to that core. The request's current `macl` slot still belongs to the new
runtime; acquiring a service there uses the new runtime's independent authority.
Output handles remain bound to their original request/runtime/model/scope and cannot
be reused by the replacement runtime.

Route-shape keys (`modelName`/`dataName`, `basePath`, `parentPath`, `idParam`,
`queryRouteSegment`, and model `mutationRouteSegment`) are fixed at construction;
router setters reject them. Runtime storage edits do not rebuild already-mounted
Express routes. `parentPath` supplies the external prefix for route metadata/logging;
mount that prefix in Express yourself. Live `idField`/`resolveIdFilter` change lookup
behavior rather than route shape.

### Wire placement and option names

| Intent                   | Basic GET query                                    | Advanced body                                                   | Root entry                          |
| ------------------------ | -------------------------------------------------- | --------------------------------------------------------------- | ----------------------------------- |
| Selection / sort         | `select=name`, `sort=name%20-createdAt`            | `select`, `sort` at body top level                              | `args.select`, `args.sort`          |
| Pagination               | `skip`, `limit`, `page`, `page_size`               | `skip`, `limit`, `page`, `pageSize`                             | Same camelCase keys under `args`    |
| List totals              | `include_count=true`                               | `options.includeCount: true`                                    | `options.includeCount: true`        |
| Extra pagination headers | `include_extra_headers=true`                       | `options.includeExtraHeaders: true`                             | No per-entry HTTP-header option     |
| Model metadata           | `include_permissions`, `include_field_permissions` | `options.includePermissions`, `options.includeFieldPermissions` | Same camelCase keys under `options` |
| Read-miss fallback       | `try_list` on model identifier GET                 | `options.tryList` on model read                                 | `options.tryList` on model read     |

GET flag values are strings `true`/`false`; body/root flags are booleans. The table
describes list/read fields on routes that support them, not arbitrary forwarding.
GET lists start with `{}` as their client filter; use an advanced body for `filter`,
`populate` or `include`. Model GET-by-ID also accepts `select`; basic data GET-by-ID
does not project query selection (use its advanced read). Neither `lean` nor
`hydration` is a supported service/wire option; use server model configuration.
Mutation bodies use
top-level `data`/`select`/`populate`/`tasks` and their own allowed `options`; see
[advanced mutation validation](#advanced-mutation-validation).

List responses are `{ data, meta }`. Request `includeCount` explicitly on the wire
to expose `meta.totalCount`; a service default alone is not an HTTP metadata switch.
Internal list `count` is returned-row count; `totalCount` is the authorized match
total when computed. Direct service `find(query, args, options)` keeps the predicate
separate from both objects. Root entries keep `target`, `name`, base `op`, `filter`/
`id`/`data` at entry top level; `args` and `options` are separate siblings.

### Names with different jobs

| Names                                                                   | Deliberate distinction                                                                                                                                                                 |
| ----------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `operationAccess` / `permissionSchema` / `authorization`                | Route entry / request field rules / explicit server-only per-call authority. An entry grant does not grant fields or related targets.                                                  |
| `select` / `alwaysSelectFields` / virtual `dependsOn`                   | Desired output / private persisted hook inputs / scoped getter dependencies. Fetching a value grants no output authority.                                                              |
| `baseFilter` / `overrideFilter`                                         | Request row scope / ordinary-query transform. Trusted rows replace only the former; the transform still runs once and false stays terminal.                                            |
| `idParam` / `idField` / `resolveIdFilter`                               | Express parameter name / lookup field / custom identifier-to-filter hook. A callable resolver takes precedence over `idField`; otherwise lookup uses that field (model default `_id`). |
| `requestPermissionField` / `documentPermissionField` / `docPermissions` | Request grant storage / serialized document metadata path / hook producing full internal document grants. Metadata flags affect exposure, not authority.                               |
| `requestSchemas` / `validate` / `prepare` / `transform`                 | HTTP parsing / admitted model-input validation / trusted data preparation / live-document mutation before save.                                                                        |
| `populate` / `include` / `related`                                      | Declared Mongoose references / output-only related query attachments / independent trusted target policy for an exact requested path.                                                  |
| `access` / `populateAccess`                                             | Method-specific effective row/field access / target populate access (`list` or `read` on the wire). Neither chooses a basic/advanced route variant.                                    |
| Model `hydration` / `skim` / metadata flags                             | Server-owned Mongoose fetch choice / deprecated per-call no-op / serialization and field-map choices. All preserve authorization.                                                      |
| `maxConcurrentOperations` / `maxHookConcurrency` / `maxBulkConcurrency` | Whole root operations per order group / request-runtime hook chains / request-runtime leaf persistence operations. Separate counted units and pools.                                   |
| `count` / `includeCount` / `countByFieldValues`                         | One exact numeric query result / list match-total option / bounded numeric counts per original key alias. Returned-row counts and overlapping per-key counts are not union totals.     |

### `skim`: compatibility no-op

`skim` remains accepted in existing service/default and supported wire option slots
for compatibility, but is **deprecated and has no behavioral effect** in canonical
model operations. True, false and omission all keep field/row authorization, document
grants, virtuals and decoration. Remove it from new code. Use model `hydration`
configuration for fetch mode, `includePermissions`/`includeFieldPermissions` for metadata, or the
router's absolute metadata postures; none skips authorization. Existing examples
that retain `skim` below demonstrate this compatibility contract.

### Breaking release: server-owned hydration

**Removed:** per-call `lean` from `PublicListOptions`, `PublicReadOptions`,
`FindOptions`, `FindOneOptions`, inherited `FindByIdOptions`, and
`SubdocumentParentOptions`. There is no renamed per-call, client, GET/body/root,
include or populate hydration switch. Raw Mongoose `.lean()` remains supported.

Configure the optional **model-level** `hydration: ModelHydrationOptions` record.
Both it and `HydrationMode = 'lean' | 'hydrated'` are exported from the package root
and `/advanced`. Exactly these five independent entries are supported:

| Entry        | Built-in mode | Applies to                                                                                        |
| ------------ | ------------- | ------------------------------------------------------------------------------------------------- |
| `publicList` | `'lean'`      | Public `_list`, direct/root model lists                                                           |
| `publicRead` | `'hydrated'`  | Public `_read`/`_readFilter`, identifier/filter routes and both attempts of read-to-list fallback |
| `find`       | `'hydrated'`  | Internal service `find`                                                                           |
| `findOne`    | `'hydrated'`  | Internal service `findOne`                                                                        |
| `findById`   | `'hydrated'`  | Internal service `findById`, independently of `findOne`                                           |

<!-- doc-example: partial -->

```ts
import mongoose from 'mongoose';
import { createAccessRuntime, type ModelRouterOptions } from '@web-ts-toolkit/access-router';
import type { ModelRequest } from '@web-ts-toolkit/access-router/advanced';

const api = createAccessRuntime();
const Thing = mongoose.model('Thing', new mongoose.Schema({ name: String }));
// Server-owned hydration migration: configure once, not around each request.
const options = {
  operationAccess: { list: true, read: true },
  permissionSchema: { name: true },
  // Before: defaults.publicListOptions.lean = false; findOneOptions.lean = true.
  hydration: { publicList: 'hydrated', findOne: 'lean', find: 'lean' },
  defaults: { publicListOptions: { includeCount: true } },
} satisfies ModelRouterOptions;
const router = api.createRouter(Thing, options);
router.setOption('hydration.publicRead', 'lean'); // Keeps the other stored entries.

export async function findThings(req: ModelRequest) {
  // req must be initialized by this runtime's middleware (for example router.routes).
  const service = router.getService(req);
  // Before: service.defaults = { findOptions: { lean: true, includeCount: true } }.
  // Fetch mode is now model-wide hydration.find above, not service-instance state.
  service.defaults = { findOptions: { includeCount: true } };
  return service.find({}); // No fetch-mode option.
}
```

Supported writers are model construction/router setters,
`api.runtime.setModelOptions` / `setModelOption`, and starting defaults through
`api.setDefaultModelOptions` / `setDefaultModelOption` (also on `api.runtime`).
`GlobalOptions`, data/root router options, method `defaults`, `service.defaults`
and client defaults are not hydration scopes. Decorator applications use the same
record through `@Router`, per-model/default `@RouterOptions`, `@ModelOption` and
`@DefaultModelOption`; see `@web-ts-toolkit/access-router-deco`'s installed README
for its compiling configuration example.
No dedicated hydration decorator is needed.

Assignment follows `{ ...runtimeStartingDefaults, ...storedModelOptions,
...incomingModelOptions }`: a supplied hydration record **replaces** the previous
record, not individual members. Omitted/undefined entries use the matrix's
built-ins, never an older record's members or generic nested `.default` lookup.
For example, replacing `{ publicList: 'hydrated' }` with `{ find: 'lean' }`
restores public lists to their built-in lean mode. The five exact
`hydration.<entry>` setters change one stored member; member `undefined` clears
that override and whole-record `undefined` clears the setting. Starting-default
changes do not broadcast over an existing stored record. Default providers obey
the same shallow semantics and existing decorator precedence.

Only plain records with those five keys and mode strings (or `undefined`) are
valid; scalars, null, arrays, unknown keys and invalid modes throw a path-bearing
`TypeError` **before publication**. Failed updates preserve the prior snapshot;
failed decorator bootstrap rolls back package-controlled state. Fresh service
calls capture their owning runtime/model's current configuration; suspended calls,
read fallback and already-captured related work retain their capture, even if
another runtime later replaces `req.macl`.

**Defaults migration:** move each old `defaults.<bucket>.lean` entry as follows;
convert `true` to `'lean'` and `false` to `'hydrated'`:

| Old bucket          | New model setting      |
| ------------------- | ---------------------- |
| `publicListOptions` | `hydration.publicList` |
| `publicReadOptions` | `hydration.publicRead` |
| `findOptions`       | `hydration.find`       |
| `findOneOptions`    | `hydration.findOne`    |
| `findByIdOptions`   | `hydration.findById`   |

Keep unrelated presentation defaults in their existing buckets. Old `lean` keys,
even `undefined`, and `hydration` keys in method-option buckets throw migration
diagnostics instead of being translated or silently ignored. This covers model
setters, synchronous `service.defaults` assignment, and later mutation of an
assigned defaults bag detected before querying. Other methods explain their fixed
mode rather than offer a replacement knob. Moving a former `service.defaults`
override changes **all services for that model in its runtime**, not just one
service instance; make that choice deliberately, never emulate request-local mode
by changing shared configuration around a call.

**Old JavaScript/wire inputs:** stale `lean` or `hydration` controls in permissive
service/direct/root/`$$sq`/legacy-include/populate slots are inert and never select
fetch mode. Strict correlated includes still reject nonempty execution options,
including these keys. Ordinary business fields named `lean` or `hydration` remain
valid in filters, selections, mutations and task data. Private execution choices
are not added to public query/context metadata or response DTOs.

| Fixed/related stage                                                                           | Fetch contract (not a new setting)                                                                                                                                                              |
| --------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Legacy/correlated include list/read targets                                                   | Fixed lean; read fallback disabled for correlated reads                                                                                                                                         |
| `$$sq` list/read target                                                                       | Target's captured `publicList`/`publicRead`; no read fallback                                                                                                                                   |
| Mongoose populate, including nested targets                                                   | Inherits the originating parent query's mode, not target hydration configuration                                                                                                                |
| `getParentDoc(id, sub, args?, { access? })`, `findRawParentDoc({ filter, select, populate })` | Raw hydrated parent/null; not finalized DTOs or permission metadata. `getParentDoc` keeps its row/projection/populate checks; the low-level raw adapter helper is not an authorization boundary |
| Dedicated subdocument read/mutation parent; `readSub` populate                                | Fixed hydrated parent/live document; post-save visibility re-fetch alone stays fixed lean                                                                                                       |
| Create/new, update/upsert mutation lookup/save, delete hooks                                  | Live hydrated documents for setters, validation, saves and deletion, regardless of read configuration                                                                                           |
| Exists/public-upsert existence, field-membership queries                                      | Fixed lean `_id` lookups; count/distinct/aggregates do not hydrate document results                                                                                                             |

**Value caveat:** finalized model results and output-stage hook views are
plain objects in both modes; this is not a promise of identical values. Hydration
can apply missing schema defaults, init hooks and schema getters/`toObject`
transforms that bare lean skips. Package virtuals, authorization, selection,
decoration and metadata rules still run in both modes. Test your application's
schema/plugins before switching; no universal JSON parity or measured speedup is
claimed. Client save-capable `Model` wrappers are a separate client feature.

### Finalized permissions alias

**Compatibility expansion:** when a package-finalized model row already carries
serialized permission metadata, `row.permissions` aliases that finalized value at
`documentPermissionField` (default `_permissions`, also dotted paths such as
`meta.grants`), independently of hydration and plugin installation. It is a
non-enumerable, writable, configurable own data property: JSON, `Object.keys` and
object spread omit the generated alias. It is a convenience value, **not authority
or a live binding** after application reassignment.

Exposure pruning, metadata flags, field-map disabling and empty/placeholder
metadata apply before aliasing; private/unfiltered grants are never copied from
raw documents. `stripPermissionsField: true` suppresses both canonical metadata
and its generated alias. Existing `permissions` output wins, including selected
business fields, package virtuals and include attachments/descriptors. A canonical
path of `permissions` or `permissions.grants` keeps its existing enumerable
property; no separate alias is created.

Package-owned copies/related attachments preserve the alias **where metadata is
already present**; ordinary populated/dedicated subdocument outputs do not gain
metadata just to create one. Arbitrary application copies/transform replacements
and client `Model` wrappers need not retain non-enumerable properties. The optional
[Mongoose plugin](#optional-permissions-plugin) is a separate raw-document getter,
not a prerequisite for this finalized alias.

### Root batch bounds

Create the batch endpoint with the **single-options** overload,
`api.createRouter({ basePath: '/batch', operationAccess: true })`, and mount its
`.routes`. Use the same runtime that registered its model/data targets. POST an array:

```json
[
  {
    "target": "model",
    "name": "Product",
    "op": "list",
    "order": 0,
    "args": { "select": ["name"], "limit": 20 },
    "options": { "includeCount": true }
  }
]
```

`maxBatchEntries` defaults to **100**. `maxOrderGroups` defaults to **25** and applies
**two** bounds: at most 25 distinct order groups, and every `order` is an integer
in **0..25 inclusive** (omission is 0). Thus a lone `order: 26` rejects, and using
all 26 values from 0 through 25 also rejects. `maxConcurrentOperations` defaults
to **10** whole operations within each group. Constructor limit values must be
positive safe integers; invalid values fall back to these defaults. Excess batch/
order input returns BadRequest before entry dispatch.

Groups run in ascending order; within a group operations may run concurrently.
Results retain input indices/order, with each entry's `statusCode` and public
`result` inside the HTTP 200 batch response. Root entries use base operation guards,
not basic/advanced variant names. Batches are non-transactional: an unexpected
rejection can leave already-committed writes. Hook and persistence work also obey
their separate [request/runtime limits](#persistence-concurrency-and-resource-limits).

Runtime `requestComplexity` additionally defaults to `maxDepth: 8`, `maxNodes: 500`,
`maxLogicalClauses: 50`, `maxInValues: 100`, `maxBulkItems: 100`,
`maxIncludeCount: 10`, `maxSubQueryCount: 10`, `maxCorrelatedQueries: 100`, and
`maxCorrelatedDepth: 5`. Both concurrency defaults are 10. These configurable budgets
normalize invalid/non-positive/unsafe integers to their built-in defaults; zero does
not disable enforcement. The fixed grouped-count input bounds and 64-scope hook
reentry bound are separate contracts, documented in their sections.

## Trusted service authorization

Use these contracts for tenant-scoped business services, protected input/output,
related targets and same-execution document decisions. For a complete executable
example, see [Runnable authorization and handle reuse](#runnable-authorization-and-handle-reuse).

### Public request admission and backend options

All authorization input described below is **trusted server-only**. Acquire a
service through `router.getService(req)` or `req.macl.getService(modelName)` after
the owning runtime's middleware initializes the request. Keep policy in server
code; never copy it from a request body/query, OpenAPI option, client or React call.

Generated routes, root batches, public service wrappers (`_list`, `_read`,
`_readFilter`, mutations and `_new`), include/subquery options and populate
descriptors are request-only. Supplying `authorization`, `overrides`,
`documentAuthorization`, or private prepared/execution controls in their control
slots returns BadRequest, including after a custom request validator transforms an
envelope. Legacy include overrides that were silently ignored now fail admission.
Unknown options are not forwarded to internal target services.

Router `defaults` (including dotted setters) support query/presentation settings,
not per-call authorization or legacy overrides. Move backend authority out of
defaults and public/nested request options into explicit internal service calls.
Direct service row/output/related policies, named output helpers and internal result
contexts are available. The complete service `overrides` container is removed in
this breaking release; see the migration table below.

These restrictions apply to control slots, not business fields: payloads and
filters may still contain persisted fields named `authorization` or `overrides`,
and selections may request those names under ordinary field permissions. The
configured model `overrideFilter` hook/setter remains supported.

For populate and legacy/correlated includes, `authorization.related` is keyed by
the exact requested relationship/attachment path. Each entry must name the exact
registered target `model`; unused, ambiguous and mismatched entries reject before
target persistence. Child `operation`, `rows` and `outputFields` policies are
independent and default to request authority. A parent relationship-field grant
permits the source field but does not authorize target fields or operations.
Nested policies belong under the immediate target's `related` entry. Count targets
accept only `model`, `operation` and `rows`.

Target output grants remain selection-limited, including schema-hidden fields and
virtuals. Populate match, include filter, ref IDs and join/correlation constraints
remain ANDed with the target scope after query transformation in every row mode.
Populate policies also apply after create/update/upsert. Neither parent nor related
grants flow into request-controlled `$$sq` queries. For a same-execution target pick,
use `result.context.getDocumentAuthorization(child)` (or the corresponding list-row
context) with **that target model's** helper. Private dependencies and join keys do
not become output grants; related copies retain their own document results.

The existing `requireRegisteredPopulateModels: false` configuration remains an
explicit compatibility opt-out for requested unregistered populate targets. Those
values retain the descriptor's projection, have no target authorization handle,
and cannot receive `related` policies. It does not make an unassociated object
passed to a raw-policy helper into authorized target output.

### Selection, grants and document results

For business fields, output is **selected AND (request-authorized OR explicitly
granted)**. `outputFields.mode` is `request` (the default), additive `grant`, or
`unrestricted` over selected eligible catalog fields. An empty grant adds nothing.
With omitted select, normal defined request fields plus explicit grant paths are
candidates; unrestricted uses the captured persisted/registered-virtual catalog.
Explicit selections/exclusions and `requireExplicitSelect` still apply. Grants
cannot fabricate missing values or guarantee a required result field exists.

Backend model `genSelect(access, select, options)` and its `genQuerySelect` alias
accept only named output-planning options, for example
`{ authorization: { outputFields: { mode: 'grant', paths: ['internalNote'] } } }`.
They return a persisted **fetch projection**, including private identity and
dependency inputs; this is not an output allowlist. Grants are additive to
request rules, never add to an explicit selection, and never override an
exclusion. A container grant covers its selected eligible subtree; a descendant
grant admits only the minimal ancestor structure, not sibling fields. Optional
`scopePath: ['contacts']` uses response segments; grant paths remain relative to
the owning model. The catalog includes declared `select: false` fields, embedded
schemas and registered virtuals; safe explicitly named Mixed/Map branches are
supported. Virtual names themselves never enter the database projection.

An opaque Mixed/Map root grant covers its existing safe subtree, subject to
descendant exclusions such as `-payload.secret`. A descendant-only selection or
grant does not authorize a scalar ancestor value: that value is omitted (or a
`null` placeholder in an array). A grant to the root itself can authorize its
scalar value when that root is selected.

Planning defers document-dependent rules and never runs permission functions or
virtual getters. Document hooks receive projected input: configure additional
persisted hook dependencies with `alwaysSelectFields`. Internal dependency fetches
do not grant output, even when the same path is also a private include join key.
Captured row/document hooks retain exact-access → `.default` → bare-hook resolution;
only an undefined entry falls through. Omitted/undefined helper options now use the
same canonical request-mode output planner as `{}`; positional helpers are removed.
Backend model output helpers also accept named options:
`pickAllowedFields(doc, access, { authorization })`, its `trimOutputFields` alias,
and `genAllowedFields(doc, access, { authorization, purpose: 'output' })`. Core
provides the same signatures with `modelName` first. They filter existing values,
including nested/array paths; they do not apply a selection, compute virtuals,
restore absent fields, check rows, or authorize writes. Omitted/undefined options
start fresh request-mode output evaluation. `genAllowedFields` defaults to
`{ purpose: 'output' }`; an explicitly supplied options object still requires that
purpose. It reports **existing output paths**, not a schema/input allowlist. Null or
undefined documents yield `[]` (pick/trim preserve the nullish value) without hooks.

The shared finalizer now consumes retained authorization plans and privately
memoizes full document grants and field decisions. For a subsequent same-execution
pick, use `{ documentAuthorization }` with the package-issued output context's
handle, rather than resupplying the raw policy. Handles validate the unchanged
output identity, request/runtime/model, scope, access and document stage; caller
spreads, matching IDs and `_permissions` are not provenance. Raw policy on a known
trimmed output retains unconditional request fields and explicit grants, but does
not rerun the document hook or recover document-dependent decisions. Metadata
stripping/exposure switches are independent of internal grants. Target models
require their own authorization; parent grants cover the relationship only.

Internal `findOne`/`findById`/`find`, `create`, `updateOne`/`updateById`, `upsert`
and `new` now consume the captured call policy throughout output finalization.
Single results expose `context.documentAuthorization`; list/create results expose
one `contexts[index]` per row. These opaque handles are non-enumerable context
properties, never attached to `data`. `context.getDocumentAuthorization(value)`
looks up an unchanged registered output in that result's graph.

<!-- doc-example: partial -->

```ts
import type { ModelRequest } from '@web-ts-toolkit/access-router/advanced';
declare const req: ModelRequest;
const service = req.macl.getService<{ status?: string; internalNote?: string }>('Order');
declare const orderId: string;
const result = await service.findOne(
  { _id: orderId },
  { select: ['status', 'internalNote'] },
  { authorization: { outputFields: { mode: 'grant', paths: ['internalNote'] } } },
);
if (result.success) {
  const picked = await service.pickAllowedFields(result.data, 'read', {
    documentAuthorization: result.context.documentAuthorization,
  });
  console.log(picked);
}
```

The selected stored note survives false/missing request rules; `status` still
requires normal request authorization. Ordinary document grants now apply even
under `skim` and metadata-disabled/stripped postures. Declare private hook inputs
with `alwaysSelectFields`; later handle picks reuse the original results after
those inputs are removed. Metadata describes request permissions, not backend grants.

Mutations use ordinary `args.select`. Output grants never admit protected writes;
validation, prepare/transform/afterPersist/change hooks and save semantics remain.
Update admission and post-write output have separate document stages. Upsert keeps
its initiating operation with create/update branch accesses. `new()` continues to
ignore `select`, including empty/exclusion projections. Trusted presentation hooks
run after finalization and may intentionally remove/construct output. There is no
automatic second authorization pass; arbitrary mutations/replacements do not acquire
provenance. For an unchanged output, use its handle at the **output access**: `read`
for ordinary reads/create/update/upsert output, `list` for lists or reads using list
access, and `create` for `new()`.

The immutable **call policy** captures authority once for planning and execution.
Each document/scope/access stage separately owns its hook grants and field decisions;
two list rows never share those results. Reusing the same raw policy is fresh
evaluation, not a substitute for a document handle. A fresh unassociated input must
contain the projected hook dependencies; a recognized trimmed output cannot rerun
the hook to reconstruct lost decisions. Use either `authorization` or
`documentAuthorization` in a named helper, never both. When extracting policy from a
full call, construct `{ outputFields: policy.outputFields }` for output-only helpers;
`create` accepts input/output/related, and `new` accepts output only.

### Independent mutation input authority

Trusted server code can use **`authorization.inputFields`** on model `create`,
`updateOne`, `updateById`, and both `upsert` branches. `MutationAuthorization<TModel,
TVirtuals>` adds this dimension to the read policy; `CreateAuthorization` also
accepts it but rejects `rows`. `ServiceAuthorization` remains the read policy.
Reads (even with a mutation access name), `new`, output helpers, related read/count
targets and public options reject input authority, including reusable typed policies.

<!-- doc-example: partial -->

```ts
import type { MutationAuthorization } from '@web-ts-toolkit/access-router';
import type { ModelRequest } from '@web-ts-toolkit/access-router/advanced';
type Order = { status: string; internalNote?: string; contacts: { email: string; ssn: string }[] };
declare const req: ModelRequest;
declare const orderId: string;
const service = req.macl.getService<Order>('Order');
const authorization = {
  inputFields: { mode: 'grant', paths: ['internalNote', 'contacts.email'] },
} as const satisfies MutationAuthorization<Order>;
const result = await service.updateById(
  orderId,
  {
    status: 'reviewed', // ordinary request permission still applies
    internalNote: 'server-owned decision', // explicit input grant
    contacts: [{ email: 'corrected@example.test' }], // patches existing element 0
  },
  { select: ['status', 'internalNote'] },
  { authorization },
);
// The note is persisted, but still omitted from output if the actor cannot read it.
// Add a separate outputFields grant if this call also needs to return the note.
```

Input modes are `request` (also omitted/undefined), additive `grant` with readonly
`paths`, and `unrestricted`. An empty grant adds nothing; ordinary request-authorized
fields still write. `unrestricted` admits eligible persisted roots, not arbitrary
keys on a `strict: false` document. It grants no rows, output, query/sort fields,
route guards, related operations or `$$sq` targets, and never stamps an upsert scope
into inserted data. `args.select` affects output only.

`InputFieldPath<TModel>` and `InputFieldAuthorization<TModel>` use bounded persisted
model paths without the virtual generic. Runtime validation also checks JS/dynamic
policies against the actual schema, embedded schemas and virtual registry. Use
`contacts.email`, not indices, brackets, `sub`, signed tokens or wildcards. Safe
Mixed/Map descendants are supported; reference interiors belong to another model.
Unknown paths, virtuals (including Mongoose aliases), `_id`, version keys,
permission metadata (including configured dotted paths), prototype/Mongoose keys
and execution/prepared-policy metadata cannot be elevated. Business fields named
`authorization` and `overrides` remain payload data.

Request-input compatibility also excludes a scope's registered virtual names through
Mixed/plain nesting: a root `receipt` virtual excludes submitted `bag.receipt`, while
entering a registered child scope uses that child's virtual names. This applies to
request/granted/unrestricted input and prepared JS/Map containers. Explicit grants
to these aliases reject; descendant patches leave unrelated existing siblings intact.

| Input boundary                                          | Persistence behavior                                                                                                                                                                                                                                          |
| ------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Leaf (`profile.email`)                                  | Replaces only the supplied leaf, including null/undefined. Omission does nothing; denied siblings survive. Necessary object ancestors may be initialized, but an existing scalar ancestor is not replaced.                                                    |
| Object container (`profile`)                            | Replaces its eligible subtree; omitted descendants are removed. Empty/null replacement is allowed.                                                                                                                                                            |
| Array container (`contacts`, or an authorized ancestor) | Replaces the array, including order, length, null/empty values and omitted child fields. Elevated replacements omit supplied embedded IDs; Mongoose generates IDs unless ordinary request authority already admits them.                                      |
| Array descendant (`contacts.email`)                     | Patches existing object elements **by index**, never by supplied ID. Short inputs preserve trailing elements; excess elements, holes, null/scalar slots and scalar/invalid ancestors make no structural change. The same rule applies to nested/Mixed arrays. |

A descendant grant cannot create an absent array, **including on create or the
upsert-create branch**. Grant the array/ancestor container, or use existing request
container permission, to create/resize it. A narrower grant never narrows ordinary
request authority: an already request-authorized container retains replacement
semantics. Nested client JSON is required; literal dotted update keys are not updates.

Validation sees admitted data; prepare, transform, Mongoose casting/validation/save,
afterPersist and change hooks remain active. Trusted prepare additions and explicit
transform setters keep their business-write contract. Input/prepare values are
isolated; virtuals and control metadata are excluded even in permissive whole
containers and prepared JS values. Trusted prepare additions are business writes,
not a second input-policy grant.
JS class/hydrated containers are normalized to their data before admission; native
Date/Buffer/BSON leaves retain their types. Functions/symbols are not persisted input.
Mutation payloads, including class/Map contents and sparse arrays, obey
`requestComplexity` before parsing and input hooks; cycles return BadRequest. Input
admission and prepared-container sanitization also have hard structural ceilings of
100 levels and 20,000 nodes. Grants do not bypass these limits. Unmodified persisted
virtual values outside the write boundary are preserved; they remain excluded from
ordinary output.
Pre-write update grants resolve once from the full hydrated persisted document, with input
structure (including schema-hidden roots and embedded fields) fetched privately. They are passed through
`context.docPermissions`, not stored on the document or reconstructed from input
`_permissions`. Create keeps request-only pre-document rules and resolves its document
hook after persistence. Post-write output gets fresh document grants; input authority
does not become an output handle or forge `_view`/`_edit` permissions.

**Migration:** a write formerly requiring trusted preparation can instead grant the
specific input path explicitly. An output grant alone still cannot write. Keep read
policies typed as `ServiceAuthorization`; use `MutationAuthorization` for updates/
upserts and `CreateAuthorization` for creates. Derive `{ outputFields }` for output
helpers rather than forwarding a mutation policy. Dedicated subdocument authorization
uses the scoped API below; model-root input policies are not forwarded into it.

### Dedicated subdocument authorization

Internal `listSub`, `readSub`, `createSub`, `updateSub`, `bulkUpdateSub` and `deleteSub`
accept a final options object with **`authorization: { parent, child, visibility }`**.
Use `router.getService(req)` / `req.macl.getService<Model>(name)`. The public service,
root batches, generated basic/advanced routes, nested descriptors, custom-validator
envelopes and defaults reject these capabilities. Business payload properties named
`authorization` or `overrides` keep their ordinary meaning.

The named subdocument must be a **top-level embedded document array**, validated
against Mongoose (not a reference array, object, dotted path or virtual). Known-model
literal names infer the child and virtual shapes; unknown models keep runtime checks.
`SubdocumentModel<Parent, 'contacts'>` extracts the child type. Child field/row paths
are **relative to that child** (`email`, `preferences.theme`), while parent row paths
use the owning model (`tenantId`). Policies have no recursive `subdocuments` tree.

<!-- doc-example: partial -->

```ts
import type { SubdocumentMutationAuthorization } from '@web-ts-toolkit/access-router';
import type { ModelRequest } from '@web-ts-toolkit/access-router/advanced';
type Order = { tenantId: string; contacts: { email: string; ssn: string }[] };
declare const req: ModelRequest;
declare const orderId: string;
declare const contactId: string;
declare const tenantId: string; // trusted server value
const parent = {
  operation: { mode: 'grant' },
  rows: { mode: 'scope', filter: { tenantId } },
} as const;
const authorization = {
  parent, // only the owning parent's update gate/rows
  child: {
    operation: { mode: 'grant' }, // only contacts.update
    inputFields: { mode: 'grant', paths: ['email'] },
    // child update rows still use the actor's request policy
  },
  visibility: {
    parent, // explicitly authorize the separate parent READ stage
    child: {
      operation: { mode: 'grant' }, // separate contacts.read gate
      outputFields: { mode: 'grant', paths: ['email'] },
    },
  },
} as const satisfies SubdocumentMutationAuthorization<Order, Order['contacts'][number]>;
const result = await req.macl
  .getService<Order>('Order')
  .updateSub(orderId, 'contacts', contactId, { email: 'corrected@example.test' }, { authorization });
// Omit visibility to retain request-only post-write read gates/rows/fields.
// A successful hidden write returns data: null; do not retry merely for null output.
```

| Internal method                                                   | Parent gate/rows | Child gate/rows and fields               | Response                                                      |
| ----------------------------------------------------------------- | ---------------- | ---------------------------------------- | ------------------------------------------------------------- |
| `listSub(id, sub, { filter?, select?, authorization? })`          | read             | list; `outputFields`                     | Filtered list, visible count                                  |
| `readSub(id, sub, subId, { select?, populate?, authorization? })` | read             | read; `outputFields`                     | One selected child                                            |
| `createSub(id, sub, data, { addFirst?, authorization? })`         | update           | create; `inputFields`; **no child rows** | Visible full stored array, including existing rows            |
| `updateSub(id, sub, subId, data, { authorization? })`             | update           | update; `inputFields`                    | Visible updated child or successful `null`                    |
| `bulkUpdateSub(id, sub, data, { authorization? })`                | update           | update; `inputFields`                    | Visible targeted children in stored order, or successful `[]` |
| `deleteSub(id, sub, subId, { authorization? })`                   | update           | delete; no fields                        | Removed ID; no visibility policy                              |

Supplying `authorization` (even `{}`) opts a trusted internal call into the two
listed **base-operation** gates. An omitted dimension uses request authority;
`operation: { mode: 'grant' }` permits exactly its gate. Calls with no supplied
policy retain their historical route-owned initiating guards. The generated
basic/advanced guards continue to choose their own request-only route entry.
Parent and child operation grants imply neither each other nor row/input/output
grants. Parent fields are inapplicable; they reject even in request mode.

Each rows dimension supports request/scope/unrestricted. `overrideFilter` still
runs once at its access stage; the resolved parent identifier, selected child
ID(s), owner scope and owning-array membership cannot be erased by rewriting,
including in-place mutation. False query/identifier/scope/transform is terminal.
Scope predicates are inert (no `$$sq`/`$$date` expansion), validate against their
own schema, and obey request complexity depth/node/logical-clause/`$in` budgets.
Grant arrays obey those budgets too. Invalid paths, unsupported dimensions and
malformed visibility policies reject **before any write**.

Mutation visibility is separate: `visibility.parent` supplies parent **read**
operation/rows; `visibility.child` supplies child **read** operation/rows and
`outputFields`. **Create also requires child list** operation/rows, independently
configured with `visibility.list`. Update/bulk do not require list and reject that
dimension. Visibility inherits no mutation authority; absent dimensions use request
policy. Successful hidden create/bulk responses are `data: [], count: 0`, and
successful hidden single updates are `data: null`. Counts measure returned rows.

Child input uses the input rules above: descendant grants preserve denied siblings
and patch existing nested array objects by index; explicit nested-container grants
replace their eligible subtree. Only create/delete change the **outer** array's
membership. Virtuals/control metadata/identity cannot be elevated. Dedicated input
also retains the virtual-name scrub within Mixed/plain nesting; grants matching
those aliases reject before effects. Update document grants resolve once from the
original hydrated **owning parent**, including hidden
persisted inputs; create retains request-only pre-document admission. Output
resolves a fresh raw-parent read-stage result, independently of serialized metadata.
Virtual access is list/read/create/update respectively; output fields use list for
list and read otherwise, with document grants using read. Shared finalization
remains active. Dedicated operations retain Mongoose casting/validation/save hooks;
they do not invoke model-root validate/prepare/transform/afterPersist chains on a child.

`readSub` populate targets always use their **own request authority**. Child output
grants admit the relationship only; they never elevate target fields, rows or gates.
Dedicated parent/child/visibility policies reject `related`. For embedded output
inside a model-root read, use its existing `related` target policy contract.

**Types/migration:** root and `/advanced` export `SubdocumentReadAuthorization`,
`SubdocumentMutationAuthorization`, `SubdocumentCreateAuthorization`,
`SubdocumentDeleteAuthorization`, `SubdocumentVisibilityAuthorization` and
`SubdocumentCreateVisibilityAuthorization`. Their generics are `<Parent, Child,
ChildVirtuals>` (delete has no virtual generic). `Subdocument*Options` are now
internal; use `PublicSubdocumentListOptions`, `PublicSubdocumentReadOptions`,
`PublicSubdocumentCreateOptions` and the empty `PublicSubdocumentMutationOptions`
for public adapters. Keep policies as server constants, not spreads of request
options. Positional helper overloads are removed; see the named-helper migration
and request-only data compatibility contract below.

### Runnable authorization and handle reuse

This complete example uses an installed package, Express and MongoDB. Save it as
`authorization-example.mts` and run `node authorization-example.mts` on Node 22.18+
(or compile it with TypeScript/NodeNext first). `MONGODB_URL` defaults to local
MongoDB. It creates and removes its own uniquely named example database, serves one
loopback test request, and exits after its assertions pass. The route's policy and
example actor (`alice`) are server-owned constants, never HTTP inputs.

<!-- doc-example: complete-runtime -->

```ts
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { once } from 'node:events';
import type { Server } from 'node:http';
import express from 'express';
import mongoose from 'mongoose';
import {
  createAccessRuntime,
  type OutputAuthorization,
  type ServiceAuthorization,
  type MutationAuthorization,
  type SubdocumentMutationAuthorization,
} from '@web-ts-toolkit/access-router';
import type { ModelRequest } from '@web-ts-toolkit/access-router/advanced';

type Order = {
  status?: string;
  internalNote?: string;
  ownerId?: string;
  tenantId: string;
  contacts?: { email?: string; ssn?: string }[];
  customer?: mongoose.Types.ObjectId;
};
type Virtuals = { summary: string };

async function runServiceAuthorizationExample() {
  const connection = await mongoose
    .createConnection(process.env.MONGODB_URL ?? 'mongodb://127.0.0.1:27017', {
      dbName: `authorization_example_${randomUUID().replaceAll('-', '')}`,
    })
    .asPromise();
  let server: Server | undefined;
  try {
    const api = createAccessRuntime();
    api.setGlobalOptions({ globalPermissions: () => [] }); // no user grant for the note
    const Customer = connection.model(
      'ExampleCustomer',
      new mongoose.Schema({
        name: String,
        billingEmail: String,
        tenantId: String,
      }),
    );
    const OrderModel = connection.model<Order>(
      'ExampleOrder',
      new mongoose.Schema<Order>({
        status: String,
        internalNote: { type: String, select: false },
        ownerId: String,
        tenantId: String,
        contacts: [{ email: String, ssn: String }],
        customer: { type: mongoose.Schema.Types.ObjectId, ref: Customer.modelName },
      }),
    );
    const customerRouter = api.createRouter(Customer, {
      operationAccess: { read: false },
      baseFilter: { read: () => false },
      permissionSchema: { name: true, billingEmail: false },
      stripPermissionsField: true,
    });
    let documentHookCalls = 0;
    let queryTransforms = 0;
    const router = api.createRouter<Order, Virtuals>(OrderModel, {
      basePath: '/orders',
      operationAccess: { read: true },
      hydration: { findOne: 'lean' },
      stripPermissionsField: true,
      baseFilter: { read: () => ({ tenantId: 'request-tenant' }) },
      overrideFilter: {
        read: (filter) => {
          queryTransforms++;
          return filter;
        },
      },
      alwaysSelectFields: { read: ['ownerId'] }, // private projected document-hook input
      docPermissions: {
        read: (doc) => {
          documentHookCalls++;
          return { owner: doc !== null && typeof doc === 'object' && 'ownerId' in doc && doc.ownerId === 'alice' };
        },
      },
      permissionSchema: { status: { read: 'owner' }, internalNote: false, summary: false },
      virtuals: {
        summary: {
          dependsOn: ['status'],
          read: (doc) => (doc.status === undefined ? undefined : `Status: ${doc.status}`),
        },
      },
    });
    const customer = await Customer.create({ name: 'Ada', billingEmail: 'billing@example.test', tenantId: 'backend' });
    const rows = await OrderModel.insertMany([
      {
        status: 'ready',
        internalNote: 'server note',
        ownerId: 'alice',
        tenantId: 'backend',
        customer: customer._id,
        contacts: [{ email: 'alice@example.test', ssn: 'hidden' }],
      },
      { status: 'closed', internalNote: 'other note', ownerId: 'bob', tenantId: 'backend' },
      { status: 'draft', ownerId: 'alice', tenantId: 'backend' }, // note is absent
    ]);
    const output = {
      outputFields: { mode: 'grant', paths: ['internalNote'] },
    } as const satisfies OutputAuthorization<Order>;
    const authorization = {
      ...output,
      rows: { mode: 'scope', filter: { tenantId: 'backend' } },
    } as const satisfies ServiceAuthorization<Order, Virtuals>;
    const quiet = { skim: true, includePermissions: false, includeFieldPermissions: false };
    const selected = { select: ['status', 'internalNote', '-_id'] };

    async function verifyServiceAuthorization(req: ModelRequest) {
      const service = router.getService(req); // alternatively req.macl.getService<Order, Virtuals>(OrderModel.modelName)
      const result = await service.findOne({ _id: rows[0]._id }, selected, { ...quiet, authorization });
      assert.ok(result.success);
      assert.deepEqual(result.data, { status: 'ready', internalNote: 'server note' });
      // ownerId and _permissions are absent, yet this handle retains both decisions.
      const reuse = { documentAuthorization: result.context.documentAuthorization };
      const picked = await service.pickAllowedFields(result.data, 'read', reuse);
      assert.deepEqual(await service.trimOutputFields(picked, 'read', reuse), result.data);
      assert.equal(documentHookCalls, 1);
      const fresh = await service.pickAllowedFields(result.data, 'read', { authorization: output });
      assert.deepEqual(fresh, { internalNote: 'server note' }); // no original owner decision
      assert.equal(documentHookCalls, 1); // never rerun the hook against this trimmed DTO

      const deniedStatus = await service.findOne({ _id: rows[1]._id }, selected, { ...quiet, authorization });
      assert.ok(deniedStatus.success);
      assert.deepEqual(deniedStatus.data, { internalNote: 'other note' });
      const unselected = await service.findOne(
        { _id: rows[0]._id },
        { select: ['status', '-_id'] },
        { ...quiet, authorization },
      );
      assert.ok(unselected.success);
      assert.deepEqual(unselected.data, { status: 'ready' }); // grant does not select the note
      const absent = await service.findOne({ _id: rows[2]._id }, selected, { ...quiet, authorization });
      assert.ok(absent.success);
      assert.deepEqual(absent.data, { status: 'draft' }); // grant does not create a value
      const requestRows = await service.findOne({ _id: rows[0]._id }, selected, { ...quiet, authorization: output });
      assert.equal(requestRows.success, false); // output grant cannot replace request row scope
      if (!requestRows.success) assert.equal(requestRows.code, 'not_found');

      router.setOption('permissionSchema', { status: { read: 'owner' } }); // note rule now missing
      const missingRule = await service.findOne({ _id: rows[0]._id }, selected, { ...quiet, authorization });
      assert.ok(missingRule.success);
      assert.equal(missingRule.data.internalNote, 'server note');
      const before = queryTransforms;
      await service.findOne({ _id: rows[0]._id }, selected, {
        ...quiet,
        authorization: { ...output, rows: { mode: 'unrestricted' } },
      });
      assert.equal(queryTransforms, before + 1); // unrestricted still runs overrideFilter

      const related = await service.findOne(
        { _id: rows[0]._id },
        {
          select: ['summary', 'contacts.email', 'customer', '-_id'],
          populate: [{ path: 'customer', select: ['name', 'billingEmail'] }],
        },
        {
          ...quiet,
          authorization: {
            rows: authorization.rows,
            outputFields: { mode: 'grant', paths: ['internalNote', 'summary', 'contacts.email', 'customer'] },
            related: {
              customer: {
                model: Customer.modelName,
                operation: { mode: 'grant' },
                rows: { mode: 'scope', filter: { tenantId: 'backend' } },
                outputFields: { mode: 'grant', paths: ['billingEmail'] },
              },
            },
          },
        },
      );
      assert.ok(related.success);
      assert.equal(Reflect.get(related.data, 'summary'), 'Status: ready');
      assert.equal(related.data.internalNote, undefined); // granted, still unselected
      assert.equal(related.data.contacts?.[0].email, 'alice@example.test');
      assert.equal(related.data.contacts?.[0].ssn, undefined);
      const child: unknown = Reflect.get(related.data, 'customer');
      assert.ok(child && typeof child === 'object');
      const childHandle = related.context.getDocumentAuthorization(child);
      assert.ok(childHandle);
      const childPick = await customerRouter
        .getService(req)
        .pickAllowedFields(child, 'read', { documentAuthorization: childHandle });
      assert.equal(Reflect.get(childPick, 'billingEmail'), 'billing@example.test');
      assert.equal(Reflect.get(childPick, 'tenantId'), undefined);

      // Input authority is independent: patch the existing first contact, preserve ssn,
      // persist the denied note, and grant neither field in the mutation response.
      const input = {
        inputFields: { mode: 'grant', paths: ['internalNote', 'contacts.email'] },
      } as const satisfies MutationAuthorization<Order, Virtuals>;
      const updated = await service.updateOne(
        { _id: rows[0]._id },
        {
          internalNote: 'backend write',
          contacts: [{ email: 'corrected@example.test' }],
        },
        { select: ['internalNote', 'contacts.email', '-_id'] },
        { ...quiet, authorization: input },
      );
      assert.ok(updated.success);
      assert.equal(updated.data.internalNote, undefined);
      const persisted = await OrderModel.collection.findOne({ _id: rows[0]._id });
      assert.equal(persisted?.internalNote, 'backend write');
      assert.equal(persisted?.contacts?.[0].email, 'corrected@example.test');
      assert.equal(persisted?.contacts?.[0].ssn, 'hidden');

      // A dedicated child write has independent parent/child gates and read visibility.
      const persistedContact = persisted?.contacts?.[0];
      assert.ok(persistedContact);
      const contactId = String(Reflect.get(persistedContact, '_id'));
      const childPolicy = {
        parent: { operation: { mode: 'grant' } }, // parent update gate only
        child: { operation: { mode: 'grant' }, inputFields: { mode: 'grant', paths: ['email'] } },
      } as const satisfies SubdocumentMutationAuthorization<Order, NonNullable<Order['contacts']>[number]>;
      const hiddenChild = await service.updateSub(
        String(rows[0]._id),
        'contacts',
        contactId,
        { email: 'dedicated@example.test' },
        { authorization: childPolicy },
      );
      assert.ok(hiddenChild.success);
      assert.equal(hiddenChild.data, null); // ordinary parent read rows still deny this tenant
      const visibleChild = await service.readSub(String(rows[0]._id), 'contacts', contactId, {
        select: ['email'],
        authorization: {
          parent: { rows: { mode: 'scope', filter: { tenantId: 'backend' } } },
          child: { operation: { mode: 'grant' }, outputFields: { mode: 'grant', paths: ['email'] } },
        },
      });
      assert.ok(visibleChild.success);
      assert.ok(visibleChild.data && typeof visibleChild.data === 'object');
      assert.equal(Reflect.get(visibleChild.data, 'email'), 'dedicated@example.test');
      const childStored = await OrderModel.collection.findOne({ _id: rows[0]._id });
      assert.equal(childStored?.contacts?.[0].email, 'dedicated@example.test');
      assert.equal(childStored?.contacts?.[0].ssn, 'hidden');
    }

    router.router.post('/verify', async (req, res) => {
      await verifyServiceAuthorization(req as ModelRequest); // router middleware has initialized req.macl
      res.json({ ok: true });
    });
    const app = express();
    app.use(express.json());
    app.use(router.routes);
    server = app.listen(0, '127.0.0.1');
    await once(server, 'listening');
    const address = server.address();
    assert.ok(address && typeof address !== 'string');
    const response = await fetch(`http://127.0.0.1:${address.port}/orders/verify`, { method: 'POST' });
    assert.equal(response.status, 200, await response.text());
  } finally {
    if (server) await new Promise<void>((resolve, reject) => server!.close((err) => (err ? reject(err) : resolve())));
    await connection.dropDatabase(); // only the unique example database created above
    await connection.close();
  }
}

void runServiceAuthorizationExample().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
```

The target policy explicitly supplies **operation, row and output** authority. A
parent `customer` grant only admits that relationship; ref IDs and requested match/
join predicates still constrain target rows. A virtual grant permits selected getter
evaluation with its private dependencies, not database filtering/sorting or writes.
Getter failure/undefined and missing dependencies can still omit its output.

### Backend row authorization and filter migration

Internal `find`, `findOne`, `findById`, `updateOne`, `updateById` and `upsert`
accept a per-call `options.authorization.rows` policy:

<!-- doc-example: partial -->

```ts
import type { ModelRequest } from '@web-ts-toolkit/access-router/advanced';
declare const req: ModelRequest;
const service = req.macl.getService<{ status: string; tenantId: string }>('Order');
declare const tenantId: string;
const result = await service.find(
  { status: 'open' },
  { select: ['status'], limit: 20 },
  {
    includeCount: true,
    authorization: { rows: { mode: 'scope', filter: { tenantId } } },
  },
);
```

| Row mode            | Effective predicate                                                     |
| ------------------- | ----------------------------------------------------------------------- |
| `request` (default) | Configured query transform AND request `baseFilter`                     |
| `scope`             | Same query transform AND supplied trusted scope, replacing `baseFilter` |
| `unrestricted`      | Same query transform, without request `baseFilter`                      |

`overrideFilter.<access>` always transforms the ordinary predicate **once**. It
can intentionally rewrite query input, and its restrictions/false denial remain
effective in every row mode. Mandatory reference/join constraints and trusted
scope are ANDed afterward. A trusted scope is an inert database predicate:
`$$sq`/`$$date` values in it are never expanded. `{}` explicitly allows all rows
within the transformed query; null/undefined/malformed scope filters reject.

False query, identifier, or trusted scope is terminal before parser/identifier
work as applicable. Transform/base-filter false is terminal before primary
persistence or subsequent populate/include dispatch, but a read/list transform
receives the parsed query: necessary template subqueries may already have run.
Mutation lookup predicates retain their existing inert, non-client-parsing
behavior; mutation **data** still follows normal parsing and write admission.
An allowed upsert miss may create; lookup scope does not stamp values into input.

Private prepared execution reuses the authorized predicate for upsert's update
branch, include reads/lists/counts and `find.totalCount`. Correlated read/list
templates parse before parent substitution; substituted marker-shaped parent data
stays inert. Correlated count templates retain their non-parsing behavior. These
tokens are identity-bound internal objects, never arguments, JSON options or DTO
properties. Standalone `exists`, `count`, `delete` and `distinct` retain their
request-policy signatures; sort/distinct permission checks remain independent
of output grants. Original request/user permissions remain intact across calls.

**Breaking-release migration:** old object `overrides.filter` bypassed both
filter hooks. Replace it with an ordinary predicate plus explicit row policy.
Move replaceable user row restrictions from `overrideFilter` into `baseFilter`;
there is no query-transform bypass option. Use `findOne`/`updateOne` for custom
lookup predicates instead of `overrides.idFilter`. Release guidance is maintained
here and in the task record.

### Distinct: whole-value request authorization

`GET /distinct/:field`, `POST /distinct/:field`, root `op: 'distinct'`, and trusted
`service.distinct(field, { filter })` share the same pre-query field admission.
Distinct returns Mongo's **raw complete values**; it does not trim nested fields or
re-deduplicate modified objects. This preserves distinct equivalence and the returned
`count`. An unsafe field returns `forbidden` (HTTP/root-entry **403**) before any
distinct database call, even when the supplied filter would currently match no rows.

- The requested persisted path needs an explicit request `read` rule, either a flat
  dotted key or a nested `.sub` entry. A child grant does not authorize its parent.
  Nested entries use ordinary ancestor gates and exact dotted-rule precedence.
  Scalar `_id` retains its implicit identity access.
- Declared scalar values (including native BSON scalar types), scalar reference IDs,
  and scalar arrays are eligible. Closed nested objects, single-nested documents and
  embedded document arrays require request-proven access to **every** declared returned
  descendant. Missing or denied child rules reject the entire distinct operation.
- Mixed values/descendants, arrays containing Mixed, whole Maps, unknown types,
  recursive object schemas, discriminator-dependent composites and non-strict composites
  cannot prove a complete safe value and reject, including when nested inside an otherwise
  allowed container. A shared discriminator scalar path must have a scalar type in every
  registered variant. An explicitly granted named Map key may qualify when its schema value
  is a scalar or a fully allowed closed object. Admission never infers a type from the
  current stored values.
- Named nested policy restrictions are checked even when that path is absent from the
  current Mongoose schema: stale/unknown policy branches do not authorize raw stored keys.
- Permission metadata paths and their containers, protected stored descendants, and
  registered virtual paths and their containers reject. Distinct never runs getters.
- Boolean grants and permission expressions already satisfied by the original request
  can authorize disclosure. Document-dependent grants and **all field-rule callbacks**
  reject: executing a callback with fabricated empty document grants cannot prove that
  the returned values are readable. Neither `docPermissions`, backend `outputFields`
  grants nor a prior document handle supplies distinct authority. Evaluation failures
  also deny; they do not retry through a more permissive field allowlist.

For example, this `permissionSchema` permits `distinct('profile.public')` but rejects
`distinct('profile')` and `distinct('profile.secret')`:

```json
{ "profile": { "read": true, "sub": { "public": true, "secret": false } } }
```

**Breaking-release migration:** request-only field callbacks previously ran with empty
document grants. Move those decisions into `globalPermissions` and use a declarative
permission key in `permissionSchema`. Query a permitted scalar child when a composite
contains private fields. The generated operation guards, request `read` row filters,
filter validation/casting and virtual-predicate exclusion still apply; distinct accepts
no backend authorization option.

### Breaking release: service overrides migration

Explicit authorization and complete service-container removal ship together.
`overrides` is absent from internal service argument/default types and is rejected
at service entry with an actionable `bad_request` ErrorResult **before parsing,
identifier generation, child dispatch or persistence**. This includes `{}`, `null`,
`undefined`, inherited/non-enumerable JS slots, and mixtures with valid new
authorization. Delete the old property entirely; setting it to `undefined` is not
a migration. Moving it from args to options also rejects. There is no deprecated
adapter or alternate legacy authority path.

| Removed usage (before)                                                                               | Replacement (after)                                                                                                                                                                                                                                                       |
| ---------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `overrides.select: ['internalNote']`                                                                 | `findOne(query, { select: ['status', 'internalNote'] }, { authorization: { outputFields: { mode: 'grant', paths: ['internalNote'] } } })`. Selection describes output; the grant supplies additive authority.                                                             |
| `overrides.filter: trustedPredicate` for row authority                                               | Pass the desired ordinary query, then `authorization: { rows: { mode: 'scope', filter: trustedScope } }` or `rows: { mode: 'unrestricted' }`. The configured query transform still runs once.                                                                             |
| `overrides.filter: preparedPredicate` for package query reuse                                        | Package-owned upsert/includes/counts now use authenticated private prepared-query execution. Backend consumers pass ordinary predicates to service methods; no prepared/skip flag is exposed.                                                                             |
| `overrides.populate: [{ path: 'customer', select: ['name', 'internalNote'] }]`                       | Ordinary `populate` plus a parent `outputFields` grant for `customer` when needed and `related.customer: { model: 'Customer', operation: { mode: 'grant' }, outputFields: { mode: 'grant', paths: ['internalNote'] } }` for the independently needed target capabilities. |
| `overrides.idFilter: { slug }`                                                                       | `findOne({ slug }, args, options)` / `updateOne({ slug }, data, args, options)` with explicit row policy when needed. By-ID calls always use normal identifier resolution.                                                                                                |
| `overrides.effectiveSelect: ['status']`                                                              | `create(data, { select: ['status'] }, options)` / `updateOne(query, data, { select: ['status'] }, options)` / `upsert(query, data, { select: ['status'] }, options)`. Public `returningAll: false` computes this ordinary selection once.                                 |
| `overrides.operation: 'upsert'`                                                                      | Call `upsert(query, data, args, options)`. Private execution retains initiating `upsert` while create/update branch accesses govern getters, output and document grants.                                                                                                  |
| `pickAllowedFields(doc, 'read', ['internalNote'])` using helper `baseFields` as visibility authority | `pickAllowedFields(doc, 'read', { authorization: { outputFields: { mode: 'grant', paths: ['internalNote'] } } })`, or reuse the original `documentAuthorization` handle for same-execution document decisions.                                                            |
| `genSelect('read', select, true)` using helper `skipChecks` for provisional fetching                 | `genSelect('read', select, { authorization: { outputFields: { mode: 'request' } } })` / `genQuerySelect(...)`. Named planning defers document-dependent rules; use an explicit output grant when backend visibility is required.                                          |

The helper overloads in the last two rows are also **removed in this next breaking
release**, with the named replacements available now. JavaScript booleans, arrays,
retired named bypass keys, and extra positional arguments reject with actionable
BadRequest errors, including `undefined` followed by an extra argument. TypeScript
rejects the removed signatures. There is no adapter or deprecation interval.

Old nullish filter/ID overrides meant normal generation: omit the container and
omit `authorization.rows` (or use `{ mode: 'request' }`). Old terminal
`overrides.filter: false` becomes an ordinary `false` query or
`authorization.rows: { mode: 'scope', filter: false }`; the latter also prevents
by-ID resolution and persistence-bearing client subqueries. A normal identifier
hook returning false remains terminal in every row mode. `{ mode: 'scope', filter: {} }`
is an explicit all-row scope within the transformed query; a supplied null/undefined
scope filter is BadRequest, not request fallback. Output grants never revive row denial.

For example, migrate population through explicit source and target policies:

<!-- doc-example: partial -->

```ts
import type { ModelRequest } from '@web-ts-toolkit/access-router/advanced';
declare const req: ModelRequest;
declare const orderId: string;
const service = req.macl.getService<{ status: string; customer: string }>('Order');
const result = await service.findOne(
  { _id: orderId },
  { select: ['status', 'customer'], populate: [{ path: 'customer', select: ['name', 'internalNote'] }] },
  {
    authorization: {
      outputFields: { mode: 'grant', paths: ['customer'] },
      related: {
        customer: {
          model: 'Customer',
          operation: { mode: 'grant' },
          outputFields: { mode: 'grant', paths: ['internalNote'] },
        },
      },
    },
  },
);
```

Target rows still use request scope here; explicitly scope them if needed. Parent
authority never grants target fields/operations implicitly. Ordinary populate now
uses the same target-policy contract for reads and post-create/update/upsert output;
the old create behavior that ignored `overrides.populate` has been removed.

**Ordinary document-grant behavior also changes in this release:** previously a
skim read with metadata disabled and no virtual candidates could skip the document
hook, losing otherwise allowed persisted fields. Full internal document grants
are now resolved once per projected document/access stage regardless of `skim`,
`includePermissions`, `includeFieldPermissions`, stripping or exposed-key limits.
Only serialized metadata changes with those settings. Configure required private
hook inputs with `alwaysSelectFields`; same-execution handle picks retain the
original decisions after those inputs and `_permissions` are removed. Temporary
backend grants do not forge request-user `_view`/`_edit` or document-hook metadata.

Output grants cannot write protected fields. Explicit model mutation `inputFields`
and dedicated parent/child/visibility policies are independent opt-in capabilities;
validation and persistence hooks remain active. `new()` retains its ignored-select
template behavior; standalone row-only methods retain request-policy signatures.
Business payload/filter properties called `overrides` or `authorization` remain
valid under ordinary rules.

### Breaking release: named helpers and default behavior

Model `Base`/`Service`/`PublicService` expose these finite signatures; Core prepends
`modelName`. The option types are exported from both the root and `/advanced`:

| Helper                                                              | Supported final argument / default                                                                                        |
| ------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------- |
| `genSelect(access, select?, options?)`, `genQuerySelect(...)`       | `OutputPlanningOptions<TModel, TVirtuals>`, defaults to `{}`                                                              |
| `pickAllowedFields(doc, access, options?)`, `trimOutputFields(...)` | `OutputFieldOptions<TModel, TVirtuals>`, defaults to `{}`                                                                 |
| `genAllowedFields(doc, access, options?)`                           | `AllowedOutputFieldOptions<TModel, TVirtuals>`, defaults to `{ purpose: 'output' }`; supplied objects require the purpose |
| `genPopulate(access?, populate?, options?)`                         | Request-only `PopulatePlanningOptions`, defaults to `{}`; only `scopePath` is supported                                   |

**Default model calls changed.** There is no hidden no-option legacy path:

- Planning defers document-dependent rules without running permission functions,
  excludes definitely denied fields, strips virtual names from DB projections and
  retains canonical private identity/dependency inputs. Omitted select uses ordinary
  request candidates, or only identity output when `requireExplicitSelect` is true.
  For compatibility, explicit null/empty select considers all candidates even with
  that setting, still subject to request rules or explicit policy. It is no grant.
  A fetch projection never proves response or population permission.
- Pick/trim isolate hydrated or plain inputs rather than mutating persistence
  documents. Fresh raw input runs the document-permissions hook; serialized
  `_permissions` cannot grant fields. Nested/array output rules, private `_id`
  retention and configured metadata posture match named output behavior. On known
  trimmed output, use its handle to retain document-dependent decisions. Unsupported
  scalar/array documents reject. `genAllowedFields` only reports existing paths.
- Request/input and query-field checks remain separate. Migrate writes to service
  mutations with independent `authorization.inputFields`; output picks never admit
  writes. Distinct/sort and request-user `_view`/`_edit` do not inherit output grants.

Scope migration uses **ordinary response segments**: replace
`genSelect('read', select, false, ['contacts', 'sub'])` with
`genSelect('read', select, { scopePath: ['contacts'] })` **for output planning**.
Model output grants remain relative to the owning model (`contacts.email`).
Replace `genPopulate('read', descriptors, ['contacts', 'sub'])` with
`genPopulate('read', descriptors, { scopePath: ['contacts'] })`. This helper keeps
source/target request checks; a privately fetched denied source still cannot populate.
Use normal service `populate` plus scoped `authorization.related` for explicit
backend target authority. The obsolete raw `buildVirtualPlan`/`buildSubVirtualPlan`
service builders are removed; use named fetch helpers. Retained plans, private
identity/metadata/join retention and document-result issuance belong to package execution.

#### Request-only data helpers

`DataCore` keeps `genSelect`, `genAllowedFields`, and `pickAllowedFields` with a
leading `dataName`; `DataService` also provides the `genQuerySelect` and
`trimOutputFields` aliases. Each accepts optional **`DataFieldOptions`** as its last
argument, defaulting to `{}`. Its only supported setting is readonly
`scopePath: ['contacts']`, selecting the `contacts.sub` permission-schema branch.
Selection, input document and resulting field paths are relative to that scope.
`DataFieldOptions` is exported from root and `/advanced`.

These helpers retain the **request-only data evaluator**: no Mongoose registration
or catalog, model document hooks, virtual computation, or DataService authorization.
Permission functions receive the original request as `this` and only its permissions
argument. Allowed-fields returns a schema allowlist even with a null/empty document;
pick/trim select existing values from it. An allowed container remains a whole value;
use a scoped helper to filter a child. `_id` and metadata require ordinary data-field
rules, with no automatic retention.

Data `genSelect` returns the intersection of normalized requested tokens and
request-authorized schema fields. **Compatibility:** omitted/null/empty,
exclusion-only, unknown-only and denied-only selections can produce `[]`.
Data `find`/`findOne` interpret an empty intersection as **no additional projection
after request trimming**, returning all request-authorized fields. A non-empty
intersection restricts output to those admitted requested fields. Row filtering,
sort checks, counts, page-only shaping and hook concurrency retain their existing rules.

Data positional `skipChecks` never elevated data fields; remove that argument.
Old arbitrary `baseFields` elevation is **removed and unsupported**, with no new
bypass switch or data-grant capability. Model output policies/handles, positional
arrays/booleans, unknown options and extra arguments reject on data helpers too.

<!-- doc-example: partial -->

```ts
import type { DataFieldOptions } from '@web-ts-toolkit/access-router';
import type { DataRequest } from '@web-ts-toolkit/access-router/advanced';
declare const req: DataRequest;
const service = req.dacl.getService('Directory');
const options = { scopePath: ['contacts'] } as const satisfies DataFieldOptions;
const select = await service.genQuerySelect('read', ['email'], options);
const fields = await service.genAllowedFields(null, 'read', options);
const contact = await service.pickAllowedFields({ email: 'a@example.test', private: 'hidden' }, 'read', options);
// Results follow Directory.permissionSchema.contacts.sub request rules.
console.log(select, fields, contact);
```

## Data routers

For small reference datasets, create an in-memory list/read router. Its field
policy is request-only; the [runnable data-router split](#runnable-data-router-split)
also exercises basic/advanced guards and live setters without MongoDB.

<!-- doc-example: partial -->

```ts
import { createAccessRuntime } from '@web-ts-toolkit/access-router';

const api = createAccessRuntime();
const fruitRouter = api.createDataRouter('fruit', {
  basePath: '/fruit',
  idParam: 'id',
  idField: 'id',
  operationAccess: { list: true, read: true },
  data: [{ id: 'apple', name: 'Apple', public: true }],
  permissionSchema: { id: true, name: true, public: true },
});
// Mount fruitRouter.routes on an Express app after express.json().
```

In-memory data routers default `listHardLimit` to `1000`, matching model routers. A list request without
`limit`/`pageSize`, or with a malformed limit passed through a trusted service call, is capped at that finite
default unless the router sets `listHardLimit` explicitly. `meta.totalCount` still reflects the full authorized
match set when counts are requested; only returned rows are trimmed and decorated. Data request-field
selection/trimming and `decorate`/`decorateAll` share request/runtime hook admission with model output
work, controlled by `requestComplexity.maxHookConcurrency` (default `10`). See
[Hook admission and reentrant service calls](#hook-admission-and-reentrant-service-calls) for the counted
chain and nested-call contract. Data has no model document-grant or virtual hook family.

**Basic data-list queries.** `GET /fruit?select=id&sort=-id&limit=10&include_count=true` returns the same
selected rows and pagination metadata as `POST /fruit/__query` with this body:

```json
{ "select": ["id"], "sort": "-id", "limit": 10, "options": { "includeCount": true } }
```

GET `select` accepts comma/whitespace-separated fields or repeated parameters. GET `sort` is one
space-separated field string, with `-` for descending order. Sorting uses list field permissions,
including permitted fields omitted from `select`; malformed or denied sort fields return HTTP 400.
Filtering and sorting precede pagination, and `totalCount` counts the entire filtered set. Without
selection or sorting, lists retain their list-allowed fields and configuration order. Data's existing
empty-selection/intersection behavior still applies: no additional projection after request field trimming.

### In-memory data ownership

Configuration owns a copy of `data`, including nested values in pre-frozen
caller containers. Later changes to the original records cannot change served data. Replace data through
`router.data(next)` or `runtime.setDataOption(name, 'data', next)`; `undefined` clears it. Nested setters such as
`router.data('0.profile', nextProfile)` replace data copy-on-write and retain other rows. A service captures one
data version at construction: replacing data leaves existing services/snapshots on their original version,
while newly constructed services use the replacement.

Supported data is an **acyclic ordinary array** containing these values:

- Plain objects (including null-prototype objects), ordinary/sparse arrays, strings, booleans, numbers,
  bigint, null and undefined. Own enumerable string-keyed properties are copied; accessors are evaluated
  once during admission and stored as values. Non-enumerable plain properties are ignored.
- Exact built-in `Date`, `Buffer`, `Map`, `Set`, `RegExp`, fixed non-shared `ArrayBuffer`, `DataView`, and
  typed arrays: `Int8Array`/`Int16Array`/`Int32Array`, `Uint8Array`/`Uint16Array`/`Uint32Array`,
  `Uint8ClampedArray`, `Float32Array`/`Float64Array`, `BigInt64Array`/`BigUint64Array`.
  Map keys/values and Set entries are recursively owned; Date timestamps and RegExp source/flags/numeric
  `lastIndex` survive. Binary views and Buffers copy their visible bytes into independent, exact-sized
  backing storage with offset zero. Sharing between distinct views/backing buffers is not retained.

Functions, symbol values/keys, cycles, proxies, arbitrary classes (including Mongoose documents/ObjectIds),
native subclasses/custom native properties, foreign object/native prototypes, WeakMap/WeakSet/Promise and
other unlisted instances are rejected inside `data`. Shared, resizable and detached binary storage also rejects.
Admission throws a path-bearing `TypeError` before publishing any keys of that data-options update;
an accessor that throws propagates its error and likewise leaves the update unapplied. Convert unsupported
application objects into supported data first. This data-specific contract preserves the identities of
hook functions, Mongoose models, validators and runtime handles in ordinary options.

Option getter results and `router.options` remain frozen snapshots. **Data snapshot plain containers are
frozen; native-valued properties return fresh, detached mutable copies on each access.** This includes
`runtime.getDataOptions(name).data`, `getDataSnapshot`, `getDataOption`/`getExactDataOption`, and bootstrap
snapshots. Mutating a native copy or its Map/Set contents cannot alter that snapshot or later readers;
native identity across property reads is not stable. Repeated ordinary option/snapshot reads reuse the
safe frozen data view without traversing the whole dataset.

`DataService.find`, `findOne` and `findById` return independently mutable selected data, including nested
objects/arrays and supported natives. Detachment happens **after field trimming, selection and pagination**,
so only returned values are copied; different returned rows also remain independent when their configured
inputs shared references. Direct/root response `decorate` and `decorateAll` hooks may mutate those nested
outputs in place. DataService's request-only field rules and empty-selection semantics still apply.
Native preservation is an in-process contract; HTTP uses normal Express JSON serialization. Use trusted
decoration to choose wire representations for values such as Map, Set or bigint.

## Denial and request validation

ACL filter hooks may return `false` to deny a query. That denial is terminal through identifier, override, and
base-filter composition. `overrideFilter` is a trusted hook that may replace an ordinary client or identifier
filter before the base filter is applied, but it is not called for an existing `false` filter and cannot revive
that denial. Returning `false` from `overrideFilter` also denies the query. Empty or absent filters retain their
normal unrestricted meaning unless a base filter restricts them.

**Model service denial contract:** internal `findOne`/`find`/`updateOne`/`upsert`
ordinary false queries, false identifier results and explicit false row scopes are
terminal. Early known false returns a `forbidden` ErrorResult without fallback
generation or persistence-bearing parsing. Omitted row authority uses request policy;
scope/unrestricted replace only its base scope. The removed service `overrides`
control instead returns `bad_request`, including when its old filter value is false.

`Service.exists(filter, { access: 'read', includeId: false })` returns a successful
boolean for allowed queries; `includeId: true` returns an `{ _id }` record or `null`.
Explicit/base/override terminal false now returns `forbidden` **before adapter dispatch**
in both modes, rather than a successful false/null. An allowed filter that matches no
visible row is still a successful miss. Check `result.success` before using `result.data`.

Public `_read` and `_readFilter` with `tryList: true` (the default) never retry Forbidden
or BadRequest. An authorized read miss can still fall back to list policy, subject to
list operation access. This deliberately removes list fallback for terminal read denial.
Public `_upsert` with an `_id` propagates denied update-policy existence as Forbidden
(previously Unauthorized); an allowed miss remains Unauthorized and neither case creates.
Generated direct routes map Forbidden to HTTP 403; root batches use per-entry 403 within
HTTP 200. **Custom Express routes own HTTP serialization:** returning an ErrorResult or
calling `res.json(result)` does not automatically set HTTP 403; map its code explicitly.

### Advanced mutation validation

Advanced mutation validators drive dispatch: nested `data` validators run first, then the whole-body (`default`)
validator sees that transformed envelope, and the service persists only the final parsed `data`, `select`,
`populate`, `tasks`, and allowed `options`. Missing body options fall back to `returning_all`/`include_permissions`
query params; only `includePermissions`/`includeFieldPermissions`/`populateAccess` (plus `returningAll` for update/upsert) are forwarded.

## Basic and advanced operation access

Configure generated endpoint guards in `operationAccess`. A base rule such as `read`
covers both variants unless an exact `basicRead` or `advancedRead` rule overrides it.
Variants authorize **route entry**; field grants remain in `permissionSchema` under
base names such as `read` and `list`.

<!-- doc-example: partial -->

```ts
import type { ModelRouterOptions } from '@web-ts-toolkit/access-router';

// Both list and both read variants inherit their base guards.
const baseOnly = {
  operationAccess: { list: true, read: true },
  permissionSchema: { name: true },
} satisfies ModelRouterOptions;

// Among top-level routes, deny GET /users/:id only; both advanced read POSTs inherit read: true.
const advancedReadsOnly = {
  basePath: '/users',
  operationAccess: { list: true, read: true, basicRead: false },
  permissionSchema: { name: true },
} satisfies ModelRouterOptions;

// Keep GET /users, deny POST /users/__query.
const basicListsOnly = {
  basePath: '/users',
  operationAccess: { list: true, read: true, advancedList: false },
  permissionSchema: { name: true },
} satisfies ModelRouterOptions;
// Pass one of these objects to acl.createRouter(UserModel, options).
```

`basicRead: false` does not affect list, new, count, distinct, or mutation routes;
their own guards still apply. Subdocument reads follow the field precedence below.
Denied operations return **HTTP 401 Unauthorized**
before validation/service dispatch. Every route stays registered in
`router.router.getEndpoints()` and OpenAPI. Express HEAD fallback uses the
corresponding GET's basic guard, so HEAD-by-id is denied with basic read.

### Complete operation matrix

Paths are relative to `basePath`, with model defaults `idParam: 'id'`,
`queryRouteSegment: '__query'`, and `mutationRouteSegment: '__mutation'`.
Changing those route-shape options changes paths, not guard names. For data routers,
set `idParam: 'id'` explicitly to use the illustrated identifier paths.

| Base guard        | Basic endpoint → override                        | Advanced endpoint → override                                   |
| ----------------- | ------------------------------------------------ | -------------------------------------------------------------- |
| `list`            | `GET /` → `basicList`                            | `POST /__query` → `advancedList`                               |
| `read`            | `GET /:id` → `basicRead`                         | `POST /__query/:id`, `POST /__query/__filter` → `advancedRead` |
| `create`          | `POST /` → `basicCreate`                         | `POST /__mutation` → `advancedCreate`                          |
| `update`          | `PATCH /:id` → `basicUpdate`                     | `PATCH /__mutation/:id` → `advancedUpdate`                     |
| `upsert`          | `PUT /` → `basicUpsert`                          | `PUT /__mutation` → `advancedUpsert`                           |
| `count`           | `GET /count` → `basicCount`                      | `POST /count` → `advancedCount`                                |
| `distinct`        | `GET /distinct/:field` → `basicDistinct`         | `POST /distinct/:field` → `advancedDistinct`                   |
| `subs.<sub>.list` | `GET /:id/<sub>` → `subs.<sub>.basicList`        | `POST /:id/<sub>/__query` → `subs.<sub>.advancedList`          |
| `subs.<sub>.read` | `GET /:id/<sub>/:subId` → `subs.<sub>.basicRead` | `POST /:id/<sub>/:subId/__query` → `subs.<sub>.advancedRead`   |

Model routers support all fourteen top-level keys. Data routers implement only
list/read: `basicList`, `advancedList`, `basicRead`, and `advancedRead`, including
both advanced read paths. Each model subdocument field supports four nested
list/read keys. Filtered count/distinct POSTs are advanced even without `__query`.

Unpaired routes retain their base guards:

| Endpoint                                      | Guard               |
| --------------------------------------------- | ------------------- |
| `GET /new`                                    | `new`               |
| `DELETE /:id`                                 | `delete`            |
| `POST /:id/<sub>`                             | `subs.<sub>.create` |
| `PATCH /:id/<sub>`, `PATCH /:id/<sub>/:subId` | `subs.<sub>.update` |
| `DELETE /:id/<sub>/:subId`                    | `subs.<sub>.delete` |

### Variant and base fallback

1. Read the exact variant from the owning runtime (model lookup includes the
   runtime's exact model-default path).
2. Only if that value is `undefined`, use the existing base operation resolution:
   exact base rule → `operationAccess.default` → scalar `operationAccess` shorthand.
   If no valid guard resolves, deny.

The selected variant **replaces** the base guard; the two are not combined or both
evaluated. Explicit false, an empty array, or a guard returning false is terminal.
Omitted and explicit undefined variants inherit. With no runtime-default variants
or other fallback configured:

| Rules                              | Basic list | Advanced list | Root list entry |
| ---------------------------------- | ---------- | ------------- | --------------- |
| `list: true`                       | allowed    | allowed       | allowed         |
| `list: false`                      | denied     | denied        | denied          |
| `list: true, basicList: false`     | denied     | allowed       | allowed         |
| `list: true, advancedList: false`  | allowed    | denied        | allowed         |
| `list: false, basicList: true`     | allowed    | denied        | denied          |
| only `basicList: true`             | allowed    | denied        | denied          |
| `list: true, basicList: undefined` | allowed    | allowed       | allowed         |

All rule values use `Validation`: `boolean | string | string[] | GuardHook`.
Space-separated permission strings AND their names; arrays OR their entries.
Hooks receive `AccessRouterPermissions`, run with `this` bound to the request,
and may return a promise. Thrown/rejected operational errors retain normal error
handling rather than permission fallback.

<!-- doc-example: partial -->

```ts
import acl, { type ModelRouterOptions } from '@web-ts-toolkit/access-router';

declare module '@web-ts-toolkit/access-router' {
  interface AccessRouterRequestExtensions {
    actor?: { permissions: string[] }; // populated by application authentication middleware
  }
}

acl.setGlobalOptions({
  globalPermissions(req) {
    return req.actor?.permissions ?? [];
  },
});
const permissionBased = {
  operationAccess: {
    list: true,
    read: true,
    advancedList: 'isAdmin',
    advancedRead: ['canReadDetails', 'isAdmin'],
    advancedUpdate: async function (permissions) {
      return permissions.has('isAdmin') && this.headers['x-write-mode'] === 'advanced';
    },
  },
  permissionSchema: { name: { list: true, read: true } },
} satisfies ModelRouterOptions;
```

### Shorthand and model defaults

`operationAccess: true` (or another scalar `Validation`) supplies the ordinary
base fallback. In a rule object, use `default` for that fallback:

<!-- doc-example: partial -->

```ts
import acl, { type ModelRouterOptions } from '@web-ts-toolkit/access-router';

const shorthand = { operationAccess: 'canUseApi' } satisfies ModelRouterOptions;
const withDefault = {
  operationAccess: { default: 'canUseApi', list: true, basicRead: false },
} satisfies ModelRouterOptions;

acl.setDefaultModelOptions({ operationAccess: { list: true, read: true } });
acl.setDefaultModelOption('operationAccess.advancedRead', 'isAdmin');
const defaultRead = acl.getDefaultModelOption('operationAccess.advancedRead');
const defaultsSnapshot = acl.getDefaultModelOptions();
```

Model options use shallow assignment. Supplying an `operationAccess` object
replaces that stored object rather than recursively merging default siblings.
Exact variant lookup separately falls back to the runtime's **same exact path**:
a runtime-default `advancedRead` can therefore outrank a model's `read`, `default`,
or scalar shorthand unless the model defines its own `advancedRead`.

Defaults copied into a model's stored options stay there until updated. Changing
runtime defaults does not broadcast replacements to existing model values;
setting a stored variant to undefined can expose a live runtime-default variant
before base fallback. `getDefaultModelOption` reads the requested path exactly;
it does not resolve variant/base aliases or `operationAccess.default`.
`getDefaultModelOptions()` returns a frozen snapshot. Data routers use only their
own options and never inherit model defaults.

### Subdocument field precedence

For a basic list of `comments`, resolve:

1. Exact `subs.comments.basicList`.
2. Exact `subs.comments.list`.
3. Defined `subs.comments`: evaluate a scalar guard; an object without the
   applicable key **denies**, even if top-level list/variants allow.
4. Only for an absent field rule, top-level exact `basicList`.
5. Existing top-level base `list` fallback.

The same ordering applies to advanced list and both read variants. No nested
`.default` fallback is introduced. Exact field lookups retain model-default
specificity; an inherited defined field also stays closed. The legacy scalar `subs` umbrella is still
accepted, but **does not guard absent fields**; their fallback bypasses it and
uses top-level rules. Use explicit per-field rules to guard a field.

<!-- doc-example: partial -->

```ts
import type { ModelRouterOptions } from '@web-ts-toolkit/access-router';

const subdocumentRules = {
  operationAccess: {
    list: true,
    read: true,
    subs: {
      comments: { list: true, read: true, basicList: false, advancedRead: 'isAdmin' },
      // Closed object: both items list routes are denied despite top-level list: true.
      items: { read: true },
      attachments: 'isAdmin',
    },
  },
} satisfies ModelRouterOptions;
```

### Live updates and option snapshots

Use setters to change request-time policy without reconstructing the router:

<!-- doc-example: partial -->

```ts
import acl from '@web-ts-toolkit/access-router';

// User must already be registered with this runtime.
const router = acl.createRouter('User', {
  basePath: '/users',
  operationAccess: { list: true, read: true },
  permissionSchema: { name: true },
});

router.operationAccess('basicRead', false); // Update one key, keep list/read rules.
router.operationAccess('subs.comments.basicRead', false);
router.set('operationAccess.advancedList', 'isAdmin');
router.setOption('operationAccess.basicRead', undefined); // Restore inheritance.
acl.setModelOption('User', 'operationAccess.basicRead', false);

// All object forms replace the whole operationAccess object, not a deep merge.
router.operationAccess({ list: true, read: true, basicRead: false });
router.setOptions({ operationAccess: { list: true, read: true, advancedList: false } });

const current = router.runtime.getModelOptions('User');
const exactVariant = router.runtime.getExactModelOption('User', 'operationAccess.basicRead');
```

`set({ operationAccess: ... })` and `setOption('operationAccess', ...)` have the
same shallow replacement semantics. Dotted paths are setter arguments, not flat
properties in constructor options. Updating a nested path under a scalar shorthand
starts an object; retain a `default` rule if you want the prior broad fallback.
Use `set`/`setOption` with undefined to clear a variant; the two-argument property
helper is intended for defined values.

`router.options` is the frozen **construction-time** snapshot. Options getter
results are also frozen snapshots; data native-valued properties return detached copies
on access as described above. Fetch again for current stored values. Ordinary
`getModelOption`/`getDataOption` use generic nested-option fallback, not the
route-specific variant-to-base resolver. Exact getters inspect the variant path
(including exact model-default fallback). Request guards read live runtime values.
Data router setters use the same forms; its owning runtime provides
`setDataOption`, `getDataOptions`, and `getExactDataOption`.

### Route guards and secondary policy

- Field grants, row filters, validation/prepare/decorate hooks, and related target
  checks retain base accesses. A variant grant does not grant fields or bypass
  target authorization.
- Model `_read`/`_readFilter` misses with `tryList: true` still require **base
  `list`** to retry. `list: false, advancedList: true` cannot grant retry;
  `list: true, basicList: false` cannot block it. Forbidden/BadRequest never retry.
- Upsert keeps its create/update branch policy; authorizing `advancedUpsert` does
  not also require `advancedCreate` or `advancedUpdate`.
- Subdocument mutation-response visibility uses base parent/subdocument read/list
  checks. Disabling basic reads does not hide otherwise readable output. Base
  response denial can still yield a successful null/empty response after a write
  (see [Subdocument writes with hidden responses](#subdocument-writes-with-hidden-responses)).
- Root batches use existing operation names and target base entry checks, with
  entry 401 inside the HTTP 200 batch envelope. Variants are not new root `op`
  values. Direct service calls remain trusted application calls with their
  existing checks; they do not infer basic/advanced access from `req.method`.

**Populate selectors:** wire `options.populateAccess` and descriptor `access`
accept only `'list' | 'read'` (`PopulateAccess` from `/advanced`). The shared Core
populate boundary also rejects all fourteen reserved variant names in effective
option/descriptor access, including generic options forwarded by legacy includes
and subqueries, before target persistence. Other trusted, non-reserved custom
access strings keep their existing runtime behavior. Invalid selectors return
controlled BadRequest (direct HTTP 400; affected root entry 400/`bad_request`).
Legacy read/list includes now propagate target BadRequest instead of silently
omitting it, so nested invalid selectors cannot disappear from the result.

### Runnable data-router split

This database-free example exercises the same four data keys after installation:

<!-- doc-example: complete-runtime -->

```ts
import { once } from 'node:events';
import express from 'express';
import { createAccessRuntime } from '@web-ts-toolkit/access-router';

const runtime = createAccessRuntime();
const router = runtime.createDataRouter('VariantFruit', {
  basePath: '/fruit',
  idParam: 'id',
  idField: 'id',
  data: [{ id: 'apple', name: 'Apple' }],
  operationAccess: { list: true, read: true, basicRead: false },
  permissionSchema: { id: true, name: true },
});
const app = express();
app.use(express.json());
app.use(router.routes);
const server = app.listen(0, '127.0.0.1');
try {
  await once(server, 'listening');
  const address = server.address();
  if (!address || typeof address === 'string') throw new Error('Expected a TCP address');
  const url = `http://127.0.0.1:${address.port}/fruit`;
  const basic = await fetch(`${url}/apple`);
  const advanced = await fetch(`${url}/__query/apple`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: '{}',
  });
  if (basic.status !== 401 || advanced.status !== 200) throw new Error('Read split failed');
  const fruit = await advanced.json();
  if (fruit.name !== 'Apple') throw new Error('Expected the authorized fruit');
  router.operationAccess('basicRead', true);
  if ((await fetch(`${url}/apple`)).status !== 200) throw new Error('Live update failed');
} finally {
  await new Promise<void>((resolve, reject) => {
    server.close((err) => (err ? reject(err) : resolve()));
  });
}
```

## Basic model GET queries

`GET /users?select=name&sort=name%20-createdAt` projects `name` and sorts by
name ascending, then createdAt descending. GET list `sort` is a single
space-separated signed-field string; `-` means descending. Sorting runs before
pagination and can use permitted fields omitted from `select`. Malformed or
disallowed sort fields return HTTP 400 before the model query executes.

Model options `sortableFields` allow additional sorting fields without granting
output visibility, and `stripDisallowedSort: true` drops disallowed sort keys
instead of rejecting the request (malformed fields still fail). When no sort is
supplied, normal model service defaults apply; `?sort=` explicitly disables them.
GET-by-id reads also accept `select` as a query param.

Two router options lock down permission metadata regardless of client input or
per-operation `defaults`: `stripPermissionsField: true` removes the whole
permissions field from outputs (equivalent to `includePermissions: false` with
the field — including its placeholder — deleted; enforcement still runs), and
`disableFieldPermissions: true` never computes `_view`/`_edit` maps while still
honoring `includePermissions` for `docPermissions`-hook keys.

## Main Exports

Root entrypoint (`@web-ts-toolkit/access-router`):

- default export `acl` — the default-runtime API (functions bound to the shared `AccessRuntime`)
- `createAccessRuntime()` — create an isolated runtime with its own options and model registry
- `AccessRuntime`, `RootRouter`, `ModelRouter`, `DataRouter` — router/runtime classes
- `registerModelInstance(name, model)`, `hasModelInstance(name)`, `getModelInstance(name)` — explicit runtime-owned model registry helpers
- `guard(...)` and `GuardModelCondition`, `GuardModelConditionID` types
- `combineRoutes(...)` and `createOpenApiRouter(runtime, options)` (note: prefer `acl.createOpenApiRouter(options)` for the default runtime)
- validation adapters: `defineRequestSchema(...)`, `fromZod(...)`, `fromYup(...)`, `fromJoi(...)`, `fromAjv(...)`, `fromStandardSchema(...)`, `fromValibot(...)`, `fromArkType(...)`, `fromIoTs(...)`, `fromSuperstruct(...)`, `fromVine(...)`
- `permissionsPlugin` — optional Mongoose metadata alias; [role and usage](#optional-permissions-plugin)
- logger helpers: `redactFilter`, `redactPayload`, `safeStringify`, `isLevelEnabled` + `OpLogContext` type
- option helpers: `setGlobalOptions`, `setGlobalOption`, `getGlobalOptions`, `getGlobalOption`, `setModelOptions`, `setModelOption`, `getModelOptions`, `getModelOption`, `getModelNames`, `getModelJsonSchema`, `setDefaultModelOptions`, `setDefaultModelOption`, `getDefaultModelOptions`, `getDefaultModelOption`
- route-policy types: `OperationAccess`, `SubOperationAccess`, `Validation`, `GuardHook`, `RouteVariantAccess`, `ModelRouterOptions`, `DefaultModelRouterOptions`, `DataRouterOptions`, `ExtendedModelRouterOptions`, `ExtendedDefaultModelRouterOptions`, and `ExtendedDataRouterOptions` for typed setters; `PermissionSchema` / `FieldOperationAccess` are separate base-operation field grants. These types are also available from `/advanced`.
- fetch configuration types (also `/advanced`): `HydrationMode`, `ModelHydrationOptions` — server-owned model/default configuration, never per-call/wire options.
- virtual types (also `/advanced`): `ModelVirtualGetter`, `ModelVirtualDescriptor`, `ModelVirtualAccessRecord`, `ModelVirtualLeaf`, `ModelVirtuals`, `ModelVirtualDoc`, `ModelVirtualContext`, `ModelVirtualPopulateDependency`, `ModelVirtualPopulateInputs`. Explicit private target maps type only the fourth getter argument; see [Private populated dependencies](#private-populated-dependencies).
- trusted service policy types (also `/advanced`): `ServiceAuthorization` (reads), `MutationAuthorization` (update/upsert), `CreateAuthorization`, `InputFieldAuthorization`, `InputFieldPath`, `OutputAuthorization`, `FieldAuthorization`, `RowAuthorization`, `OperationAuthorization`, `RelatedAuthorization`, `OutputFieldPath`. Input paths use persisted types only; output paths also include virtuals. Unknown models have an explicit runtime-validated string fallback; grant arrays may be readonly.
- named helper/result types (also `/advanced`): `OutputPlanningOptions`, `OutputFieldOptions`, `AllowedOutputFieldOptions`, opaque `DocumentAuthorization`, `ServiceOutputContext`, `ServiceOutputDecorator`, `AuthorizedSingleResult`, `AuthorizedListResult`, `NewArgs`, `NewOptions`. Acquire the service from a router/request; there is no standalone `Service` export or public issuer/execution/prepared API.

Subpath entrypoints:

- `@web-ts-toolkit/access-router/advanced` — request/service/option interfaces and include wire types, symbols (`MIDDLEWARE`, `DATA_MIDDLEWARE`, `PERMISSIONS`, ...), enums (`Codes`, `StatusCodes`), and validation helpers (`parseBody`, `parseQuery`, `parseBodyWithSchema`, request schemas). Runtime-context functions are internal; use root exports such as `createAccessRuntime`, `AccessRuntime`, and `defaultRuntime` for runtime ownership. `/advanced` does not export runtime instances or router-creation helpers.
- `@web-ts-toolkit/access-router/processors` — `copyAndDepopulate`, `copyPaths`, `movePaths`, `sliceArrays`, `countPaths`, `maskPaths` and processor option types (`ProcessCopy`, `CopyAndDepopulateOptions`, `CopyAndDepopulateOutput`, `ProcessorOptions`, `SliceProcessorOptions`, `ProcessSlice`, `ProcessCount`, `ProcessMask`, `ProcessorOutput`) for transforming populated documents.

## Request validation and OpenAPI

Generated routes already validate their supported envelopes. Supply `requestSchemas`
for application parsing; `validate` is a separate admitted-write hook. The root
exports adapters for Zod, Yup, Joi, AJV, Standard Schema, Valibot, ArkType, io-ts,
Superstruct and Vine. For example, with Zod installed:

<!-- doc-example: complete-runtime -->

```ts
import { z } from 'zod';
import { fromZod, defineRequestSchema } from '@web-ts-toolkit/access-router';
const validator = fromZod(z.object({ name: z.string() }));
const schema = defineRequestSchema(validator);
```

Pass such a schema to the relevant `requestSchemas` key (for example `create` or
`advancedCreateData`). [Advanced mutation parsing](#advanced-mutation-validation)
describes the nested-data/whole-envelope order and allowed options.

After registering routers, mount `api.createOpenApiRouter({ title: 'Example API',
version: '1.0.0' })` directly with `app.use(...)` — it returns an Express router,
not an object with `.routes`. Defaults expose `/openapi.json` and `/docs`;
`jsonPath`/`docsPath` customize them and `docsPath: false` disables Swagger UI.
The standalone named function is `createOpenApiRouter(api.runtime, options)`;
the runtime-bound method takes only `options`. Route guards and server-only
authorization policies are not client input fields in the generated schema.

## AJV validation contract

Install `ajv` in your application when using `fromAjv`; it is not a mandatory
access-router runtime dependency. Import the helper and `AjvValidatorLike` type
from `@web-ts-toolkit/access-router`.

- Synchronous validators return boolean **verdicts**: true returns the input
  (including any in-place AJV mutations), false returns normalized issues. Mutable
  `validate.errors` are snapshotted before any suspension or next validation call.
- Validators tagged `$async: true` return promises/thenables of **validated data**.
  Every fulfillment succeeds, including `false`, `true`, `null`, scalars and objects;
  the fulfilled value is returned, not substituted with the input. Shared
  `validate.errors` is never read on this path. Real AJV `ValidationError` rejections
  (`ajv: true`, `validation: true`, an `errors` array) provide input-local diagnostics
  under concurrency. Other exceptions propagate unchanged as operational failures.
- Untagged promises/thenables now reject with a configuration `TypeError`; their
  rejections are observed to avoid unhandled rejection. Sync non-boolean results
  also reject with `TypeError`.

<!-- doc-example: complete-runtime -->

```ts
import { Ajv, type AsyncSchema } from 'ajv';
import { fromAjv } from '@web-ts-toolkit/access-router';

const ajv = new Ajv();
const sync = fromAjv<boolean>(ajv.compile<boolean>({ type: 'boolean' }));
const asyncSchema: AsyncSchema = { $async: true, type: 'boolean' };
const asyncData = fromAjv(ajv.compile<boolean>(asyncSchema));
const syncResult = await sync(false);
const asyncResult = await asyncData(false);
if (!syncResult.success || syncResult.data !== false || !asyncResult.success || asyncResult.data !== false) {
  throw new Error('Both AJV validators must preserve valid false data');
}
```

**Migration:** pass genuine compiled AJV sync/async validators directly, without
casts or wrappers that discard `$async`. `AjvValidatorLike<T>` now separates sync
boolean and tagged async data signatures; use a literal tag (`$async: true as const`)
for structural async adapters. An async boolean-verdict wrapper must instead return
the original validated data or reject with an AJV validation error; merely adding
the tag changes false/true into successful data. Alternatively implement a
`RequestSchemaValidator` returning `{ success, data }` / `{ success: false, issues }`.
Rejections with only an `errors` property are operational, not AJV validation errors.
AJV's overloaded `AsyncValidateFunction<T>` extends its sync `ValidateFunction<T>`;
TypeScript can erase the tag in that base type, so runtime checks remain necessary.
Genuine AJV sync/async output types are inferred via their type-guard overload;
structural async output is inferred from the promise. Use `fromAjv<T>(syncValidator)`
for a structural boolean validator without a type guard. An inline schema can select AJV's earlier
sync overload even with `$async: true`; an `AsyncSchema`-typed schema, as above,
selects its async overload without casts (also for `compileAsync`). Runtime
behavior follows the validator's actual tag in either case.

## Default runtime vs. isolated runtime

The default export `acl` is bound to a single shared `AccessRuntime`, which is fine for most services.
For tests, multi-tenant services, or libraries that must avoid global state, create an isolated runtime:

<!-- doc-example: complete-runtime -->

```ts
import mongoose, { type Model } from 'mongoose';
import { createAccessRuntime } from '@web-ts-toolkit/access-router';

type User = { name?: string };

const runtime = createAccessRuntime();
runtime.setGlobalOptions({ globalPermissions: () => [] });
const userSchema = new mongoose.Schema<User>({ name: String });
const UserModel: Model<User> = mongoose.model<User>('ReadmeRuntimeUser', userSchema);
const userRouter = runtime.createRouter(UserModel, { basePath: '/users' });

// `runtime.createDataRouter(...)`, `runtime.createOpenApiRouter(...)`,
// `runtime.registerModelInstance(...)`, ...
void userRouter;
```

Two isolated runtimes with the same model name resolve against their own model registry and options without interference.
An isolated runtime does not look up process-global `mongoose.models` by string name; pass a `mongoose.Model` instance
to `runtime.createRouter(model, options)` or call `runtime.registerModelInstance(name, model)` before constructing a
string-name router. The default `acl` runtime retains string-name compatibility with `mongoose.model(name, schema)` and
adopts that exact global model instance into its registry on first lookup.

Cross-runtime composition on a shared request keeps independent runtime-owned state. When one request passes through
middleware from runtime A and then runtime B, B initializes its own core, resolves its own `globalPermissions`, and
uses its own base-filter cache; it never reuses A's permissions or cached filters, even when both runtimes use the
same `requestPermissionField` name. A sync/async `globalPermissions` result of `null` or `undefined` establishes an empty
permission map, replacing any prior runtime-owned grants. Missing or non-callable resolvers follow the same empty-grants
rule. Middleware awaits asynchronous resolution before publishing the new core and continuing. Repeating the same
runtime's middleware on one request reuses that runtime's state without rerunning its resolver. Permission maps (including
`{}`) supplied in `requestPermissionField` before any runtime middleware runs are treated as application-owned and
preserved. Migration: if you relied on B silently inheriting A's resolved
permissions on a shared request, set those permissions explicitly before the chain or configure B's `globalPermissions`
to resolve them.

## createRouter overloads

`createRouter(modelName, options)` — on the default `acl` runtime, accept the Mongoose model name registered with `mongoose.model(name, schema)`. On isolated runtimes, the name must already be registered with that runtime.

`createRouter(model, options)` — accept a `mongoose.Model` instance directly. The instance is registered with the active runtime's registry, so a model attached to a non-default `mongoose.createConnection()` works without polluting the global registry.

<!-- doc-example: partial -->

```ts
import mongoose from 'mongoose';
import { createAccessRuntime } from '@web-ts-toolkit/access-router';

// `uri` is the MongoDB connection string for the non-default connection.
const uri = process.env.MONGODB_URL_TENANT ?? 'mongodb://localhost:27017/tenant';
const conn = await mongoose.createConnection(uri).asPromise();
const schema = new mongoose.Schema({ name: String });
const TenantUser = conn.model('TenantUser', schema);

const api = createAccessRuntime();
const tenantRouter = api.createRouter(TenantUser, {
  basePath: '/tenant-users',
  operationAccess: { list: true, read: true },
  permissionSchema: { name: true },
});
```

`createRouter(options)` — the single-options overload creates a root batch router;
see [Root batch bounds](#root-batch-bounds). Model/data/root factories return an
object whose `.routes` is mounted in Express.

### Optional permissions plugin

`permissionsPlugin` only adds a Mongoose getter alias (default `permissions`) for
the model's configured document metadata slot (default `_permissions`). It reads
the existing `_doc[documentPermissionField]` value using active-runtime option
lookup, falling back to the default runtime outside package-managed execution.
It does not compute grants, authenticate an actor, or enable field enforcement;
generated routers and services already enforce their configured policies.

<!-- doc-example: partial -->

```ts
import mongoose from 'mongoose';
import { permissionsPlugin } from '@web-ts-toolkit/access-router';

const schema = new mongoose.Schema({ name: String });
schema.plugin(permissionsPlugin, { modelName: 'User', virtualPermissionField: 'permissions' });
```

Use it only when application code needs that hydrated-document alias. Package output
finalization supplies its own [non-enumerable alias](#finalized-permissions-alias)
from exposed metadata in both modes, without the plugin. The raw getter retains
literal `_doc[documentPermissionField]` lookup (not dotted-path traversal).
`virtualPermissionField` names only that raw getter, not the finalized alias or the
package's computed `virtuals` API.

## Include Cardinality

Advanced read/list requests can attach related model data with `include` entries.
`op: 'count'` returns exact authorized counts and ignores include pagination fields such as `args.limit`.
`op: 'list'` materializes authorized related rows through the target model's normal list path, so target `limit`, `page`, `pageSize`, and `listHardLimit` bounds still apply to included rows.

Legacy count joins use one grouped aggregate for all parents per include execution.
They count distinct target documents in the authorized count scope: duplicate local
keys, repeated foreign array entries, or one document matching multiple local keys
do not inflate a parent's count. The same target may count once for each of several
parents. No matches produce `0`. Mongo computes the numbers per requested parent-key
group and returns only bounded group ordinals and counts; target IDs are never
accumulated or returned. Result size depends on the requested groups, even when the
matching targets' IDs would exceed Mongo's BSON document limit.

Group membership uses Mongo's native query `$in` semantics after schema casting:
scalar membership, whole-array and literal-object equality, null/missing fields,
and dotted traversal through embedded arrays. Repeated nested matches still count
one target once per parent. For example, `countByFieldValues('direct', [['a', 'b']],
{}, 'count')` counts a stored `direct: ['a', 'b']` under alias `'a,b'`; a count include
joining scalar `'a'` to `contacts.keys` matches `contacts: [{ keys: ['a', 'b'] },
{ keys: ['a'] }]` once. Legacy include local arrays retain their one-level flattening
into group keys; the public helper treats each input value as a single operand.
One authorized candidate stream feeds at most 1,000 native match/count facets.
Predicate work scales with candidate documents × requested groups; each facet emits
at most one numeric row and never collects target documents or IDs.

The target Mongoose schema casts both the complete authorized filter (including
tenant filters) and foreign-key operands used in every group. ObjectId/String
joins and query setters retain association to the original parent keys. Invalid
schema operands/filters produce controlled `BadRequest` (direct HTTP 400; root entry
`statusCode: 400`, `code: 'bad_request'`) rather than misleading zero counts. Count
operation denials still prevent target work; a terminal `false` count row policy
retains legacy omitted include output and a grouped-service Forbidden result.

This is query-schema/setter parity, not execution of `countDocuments` middleware or
plugins: casting is synchronous and performs no query. Aggregate middleware still
belongs to the aggregate operation. Express router count authorization through
`operationAccess` and row-filter hooks. Arbitrary pipelines passed to
`router.model.aggregate(...)` are not automatically cast.

### Numeric grouped-count service API (breaking migration)

`service.countByFieldValues(foreignField, values, filter = {}, access = 'list')`
now returns `Promise<SingleResult<Map<string, number>> | ErrorResult>`. Its `values` parameter
accepts readonly arrays. Each distinct original `String(value)` alias has a numeric
count, including `0` for misses, in first-occurrence order. Equal original aliases
use their first operand; different aliases normalized to the same schema value (for
example `'001'` and `'1'` on a Number field) receive equal counts. A target with a
repeated foreign array value counts once for that alias. Inputs are snapshotted
before awaited row hooks.

**Migration:** replace `result.data.get(key)?.size` with `result.data.get(key) ?? 0`
and change `Map<string, Set<string>>` consumers to `Map<string, number>`. There is no
ID-set compatibility path. Per-key counts can overlap and must not be summed to
obtain a multi-key union: a legacy `op: 'count'` include on an array-valued local field
counts that entire parent's union in Mongo. Its grouped executor and prepared-query
capabilities remain package-private. For a standalone single union, the existing
`service.count({ foreignField: { $in: keys } }, 'count')` expresses one numeric count
(use the real field name in the filter).

<!-- doc-example: partial -->

```ts
import type { ModelRequest } from '@web-ts-toolkit/access-router/advanced';

export async function countInvoiceLines(req: ModelRequest) {
  const service = req.macl.getService<{ invoiceIds: string[] }>('InvoiceLine');
  const result = await service.countByFieldValues('invoiceIds', ['invoice-a', 'invoice-b'], {}, 'count');
  if (!result.success) return result;
  const invoiceACount: number = result.data.get('invoice-a') ?? 0;
  return { invoiceACount, counts: Object.fromEntries(result.data) };
}
```

This service helper resolves the requested **row access**, defaulting to `list`;
pass `count` to use the count row policy. Custom entrypoints still establish their
operation guard. The helper accepts no authorization-options or prepared-token
argument. Legacy includes retain the target count operation guard, independent
related authority, mandatory join/descriptor predicates and terminal-false behavior.

`service.count(filter, access = 'list')` likewise returns one numeric `SingleResult`
under the requested row policy. In contrast, legacy `countTrusted(authorizedFilter)`
expects a complete, already-authorized server predicate: it does not run client
parsing or `baseFilter`/`overrideFilter`. It accepts no policy/options argument and
still treats false as terminal. It is not the executor used by package includes;
those use private, authenticated prepared queries.

Both entry paths enforce fixed per-execution limits before aggregation: **1,000
groups** (parents, or input values for the public helper), **10,000 key occurrences
before deduplication**, **64 KiB per BSON-encoded key or original alias**, **1 MiB
cumulative BSON-key plus alias bytes**, **depth 8 / 20,000 visited key nodes**, and
**1,024 UTF-8 bytes for `foreignField`**. Both original inputs and schema-cast operands
expanded into parent groups must fit. Scalar/native BSON equality keys and bounded
literal values retain owning-schema casting; regex/executable values are not equality
join operands. A plain object operand whose first field begins with `$` also rejects
before persistence, as Mongo's query `$in` does not accept expression documents; an
object containing both `$ref` and `$id` retains Mongo's literal DBRef exception. Dollar
fields inside nested literal objects/arrays, or after an ordinary first field, remain
data. These checks apply to raw and schema-cast operands. Exceeding a bound returns
controlled `BadRequest`/HTTP 400 without target persistence: counts are never truncated
or split into per-parent queries.
These limits are independent of list pagination; a parent query above 1,000 rows
must be narrowed before requesting a legacy count include.

### Safe include output paths

Treat `path` as output only: put an invoice's related count at `lineItemCount`, for
example, rather than inside permission metadata. Legacy and correlated read/list/count
paths must not equal, descend from, or be an ancestor of the receiving model's
`documentPermissionField` (default `_permissions`). With `auth.policy.permissions`,
`auth`, `auth.policy`, and `auth.policy.permissions.canReadSecret` all reject;
`auth.policy.permissionsExtra` is an ordinary sibling. Equivalent legacy bracket
paths follow the same rule.

The include tree is preflighted before target persistence, including every supported
nested level using that receiving target's configuration. Overlaps return BadRequest
(direct HTTP 400; affected root entry 400/`bad_request` within its HTTP 200 batch
envelope), even if the relationship would be empty. Malformed reads do not retry
through list access. Ordinary output-field replacement remains supported; generated
include data cannot grant source-field permission.

Include output is tracked separately from the original projected source. Document
permission hooks and virtual dependencies see the source values even when a successful
attachment replaces the same business field (for example, `restricted`). Only results
actually produced by include execution are attached after source selection and field
filtering, with the target's own authorization and document handle. A legacy read miss
or omitted result never turns an existing source value into an attachment: that field
still requires source selection and permission. Correlated empty results remain explicit
`null`/`[]`/`0` attachments. This separation also applies to nested targets and each list
row; include output does not mutate fetched persistence documents.

## Correlated Includes

Besides the legacy `localField`/`foreignField` joins, `include` entries accept
a correlated variant (`mode: 'correlated'`) that runs a target query **per
parent document** using values from that parent. References are explicit
structural markers — `{ "$parent": "<field>" }`, dotted paths allowed —
recognized only in filter _value_ positions (bare values, field operators
such as `$eq`/`$in`, `$in` array elements, `$and`/`$or`/`$nor` clauses,
`$elemMatch` subtrees) and as the whole `id` of identifier reads. Plain
strings are never references: `'$special'` keeps its literal query meaning.
Match a literal `{ "$parent": "x" }` object with
`{ "$escape": { "$parent": "x" } }`. In a bare field position,
`{ "note": { "$escape": { "$parent": "x" } } }` resolves to
`{ "note": { "$eq": { "$parent": "x" } } }`, just like bare substituted
parent objects. The explicit spelling
`{ "note": { "$eq": { "$escape": { "$parent": "x" } } } }` remains
equivalent. Operator operands and array elements receive the literal object
without another `$eq` wrapper. Escapes are resolved once and never read parent
data; missing, null or changed `parent.x` cannot change the literal. Malformed
escapes are rejected, and expanded operands still consume complexity budgets.
This bare-position correction requires an updated server; older servers with
the bare-escape defect still require the explicit `$eq` spelling.

Wire shapes (the originating method fixes `op`; there is no override):

```json
{ "mode": "correlated", "model": "Org", "op": "read", "path": "org", "id": { "$parent": "orgId" } }
{ "mode": "correlated", "model": "Org", "op": "read", "path": "org",
  "filter": { "_id": { "$parent": "orgId" }, "active": true }, "args": { "select": ["name"] } }
{ "mode": "correlated", "model": "Post", "op": "list", "path": "posts",
  "filter": { "authorId": { "$parent": "_id" }, "title": "$special" },
  "args": { "select": ["title"], "sort": { "createdAt": -1 }, "limit": 5 } }
{ "mode": "correlated", "model": "Post", "op": "count", "path": "postCount",
  "filter": { "authorId": { "$parent": "_id" } } }
```

Semantics:

- References resolve against the **immediate parent** document as fetched
  from persistence (including internally loaded reference fields), before
  include attachment, `decorate` hooks, and task mutation. Nested
  `args.include` entries bind to the target doc of the enclosing include.
  Sibling include output never feeds references.
- A missing (`undefined`) or `null` reference short-circuits that parent's
  execution to the no-match shape with no target query: `read` attaches
  `null`, `list` attaches `[]`, `count` attaches `0`. Target misses produce
  the same shapes. The output path is always set.
- Identifier reads use the target's configured identifier behavior
  (`resolveIdentifierFilter`/`genIDFilter`, custom `resolveIdFilter`
  honored) with no read-to-list fallback. Counts use explicit count access
  with count semantics, independent of any list limit. List pagination
  (`skip`/`limit`/`page`/`pageSize`) applies **per parent** — contrast with
  legacy batched list includes, whose pagination applies across the parent
  set. Substituted parent values are data: objects match literally (never
  become operators) and arrays are never flattened.
- Each correlated entry counts toward `maxIncludeCount`; expanded filters
  are revalidated against `maxNodes`/`maxDepth`/`maxInValues`/
  `maxLogicalClauses`. Total inner executions per request/runtime are bounded by
  `maxCorrelatedQueries` (default `100`) and nesting by
  `maxCorrelatedDepth` (default `5`); exceeding any bound fails the whole
  request/affected root entry. Fan-out shares request-and-runtime-owned
  persistence admission (see below). Target authorization denials fail the
  request/affected root entry with zero target persistence queries; target
  runtime errors also fail that request/entry.
  `path` must be a non-empty valid field path (not `_id`, not `$`-prefixed);
  duplicates in one include array are `BadRequest`; collisions with parent
  fields overwrite except for the permission-metadata overlaps described above.
- Referenced parent fields are added to the parent DB select like legacy
  `localField`s, then trimmed unless allowed by field policy and selected.
  A policy-forbidden reference still resolves — only its query effects are
  visible, never the value.
- Direct count parents carry no `include`; correlated _count_ includes
  attach to read/list parents only. Correlated entries are accepted in both
  direct (`model-router.ts`) and root (`root-router.ts`) validators with
  identical verdicts; malformed correlated input is a controlled
  `BadRequest`, never a silent drop. Legacy entries also enforce safe output paths, and
  legacy-shaped entries carrying `$parent` markers are rejected.

The TypeScript wire types (`ParentRef`, `CorrelatedInclude`, `Include`) are
reachable without deep imports via `@web-ts-toolkit/access-router/advanced`
(which re-exports the public interfaces). The shipped guide above defines the
contract; the website has additional service/configuration/validation examples.

## Nested updates and trusted hooks

Partial updates follow **authorized policy paths**, not a generic deep merge. For a
customer profile editor, grant only the editable leaf and send nested JSON:

<!-- doc-example: partial -->

```ts
import type { ModelRouterOptions } from '@web-ts-toolkit/access-router';

// Non-generic options accept dotted policy paths.
const options: ModelRouterOptions = {
  operationAccess: { update: true },
  permissionSchema: { 'profile.public': { update: true } },
};
const updateBody = { profile: { public: 'New display name' } };
// Pass options to acl.createRouter(CustomerModel, options); send updateBody to PATCH.
// Existing profile.secret and omitted siblings survive.
void [options, updateBody];
```

This applies to `updateOne`, `updateById`, existing-row upsert, and single/bulk
subdocument updates, including Mongoose nested and single-nested schemas. Authorized
leaves can initialize missing/null containers. Authorizing `profile` itself instead
allows whole replacement and removes omitted children; whole grants take priority
over overlapping leaf grants. An authorized object leaf replaces just that leaf.
Arrays replace as a whole when authorized as a whole; an explicit `items.0.public`
grant patches that indexed leaf. Omitted fields remain unchanged, admitted `null`
clears the selected field, and authorized empty objects/arrays replace it (Mongoose
`minimize` may omit empty objects in storage). A null/empty/malformed client container
does not supply descendant leaves and cannot clear a protected parent. Casting and
validation still apply. Literal dotted/bracket client keys are ignored by field
selection; they are not `$set`/`$unset` instructions.

Model `prepare` and `transform` hooks are trusted application code. Validation sees
selected client data before prepare. Prepare output is not re-filtered: it can add
protected/server-only fields, including dotted Mongoose paths. At strict ancestors of
admitted paths, supplied children of plain-object/array prepare output are applied
while omitted siblings survive. Other prepare paths remain whole assignments.
An empty partial container or omitted parent does not delete siblings; explicit
`{ profile: null }` / `{ profile: undefined }` can clear/unset it. An entirely
null/undefined prepare result supplies no assignments.

For deliberate parent replacement, trusted `transform.update` can call
`doc.set('profile', replacement)`. Do not blindly reintroduce unfiltered
`context.originalData`. The update order remains validation → prepare →
assigned-document transform → save → afterPersist → changes; snapshots/diffs reflect
persisted changes. Subdocument operations retain their own lifecycle and do not gain
model prepare/transform hooks.

## Subdocument writes with hidden responses

Appending an attachment or updating a line item can succeed without permission to
read it. After saving, mutation responses require the parent's read operation/row
access, checked against post-save state. Full-array **create** responses (including
POST `[]`) additionally require both `subs.<sub>.list` and `.read` operation guards
and row filters. **Single/bulk update** responses require subdocument read access
only and return readable mutation targets; they do not require list access.

All three use read-field projection plus `_id`. Counts reflect visible returned
rows, not stored/updated totals. Filtering preserves stored array order, including
service `addFirst` insertion order; bulk request order does not reorder the response.
`addFirst` remains a service option, not a new generated HTTP option.

When a response guard denies access, a row policy returns `false`, or no readable
parent/rows match, the committed write still succeeds:

| Operation     | Service/root result fields                                         | Direct HTTP body/status; root entry status |
| ------------- | ------------------------------------------------------------------ | ------------------------------------------ |
| Create        | `success: true, kind: 'list', code: 'created', data: [], count: 0` | `[]`, 201; 201                             |
| Bulk update   | `success: true, kind: 'list', code: 'success', data: [], count: 0` | `[]`, 200; 200                             |
| Single update | `success: true, kind: 'single', code: 'success', data: null`       | JSON `null`, 200; 200                      |

Root batches retain their HTTP 200 envelope. **Do not retry a successful write just
because its output is empty.** Actual write denials and validation/persistence failures
retain their errors. Response visibility needs at most one extra parent query and
resolves applicable row policies once per mutation, rather than once per returned row.

## Virtuals (computed fields)

Package-level computed output fields ("virtuals") are async, request-aware
derived fields that behave like first-class response fields. The persisted
model below has **no** `fullAddress` field; the virtual defines it, the
permission schema authorizes it, `select` requests it, and the selected output
keeps it optional (authorization, absent dependencies, `undefined`, and
fail-closed errors can all omit it).

Canonical import shape: default `acl` for the runtime API (named
`createAccessRuntime` for an isolated runtime); virtual output types live on
the existing `./advanced` barrel — no new subpaths.

<!-- doc-example: partial -->

```ts
import acl, { type ModelRouterOptions } from '@web-ts-toolkit/access-router';
import type { SelectedPublicOutput } from '@web-ts-toolkit/access-router/advanced';

interface User {
  name: string;
  address: string;
}
interface UserVirtuals {
  fullAddress: string;
}

// The persisted model lacks fullAddress; the virtual computes it.
const options: ModelRouterOptions<User, UserVirtuals> = {
  basePath: '/users',
  permissionSchema: {
    name: { read: true },
    address: { read: 'canViewAddress' },
    fullAddress: { read: 'canViewAddress' },
  },
  virtuals: {
    fullAddress: {
      dependsOn: ['address'],
      read: async function (doc) {
        if (doc.address === undefined) return undefined;
        return `addr:${doc.address}`;
      },
    },
  },
};

// Selected output keeps the virtual optional: present when authorized and
// computed, omitted otherwise.
type Selected = SelectedPublicOutput<User, ['name', 'fullAddress'], UserVirtuals>;
const present: Selected = { name: 'Ada', fullAddress: 'addr:a1' };
const omitted: Selected = { name: 'Ada' };
// Pass options to acl.createRouter(UserModel, options); request with
// select: ['name', 'fullAddress']. Live updates use router.virtuals({...})
// or router.set('virtuals.fullAddress.read', { get, dependsOn }).
void [options, present, omitted];
```

There is one public `select` for persisted and virtual fields; the package
derives internal fetch vs output plans. `dependsOn` names are top-level
persisted fields relative to the definition's scope (dotted paths and
virtual-to-virtual dependencies are rejected). Dependencies are fetched
internally even when the caller may not receive them, then stripped unless
independently in the original authorized/requested output. Unknown persisted
getter fields are type errors (and configuration rejections at runtime).
Virtual names are never added to persisted `Filter`, sort/distinct inputs, or
client write types.

Lean/hydrated normalization: getters always receive an isolated, stable plain-object
view (`toObject({ virtuals: false })` for documents, recursively isolated
copies for lean results, with `Date`/`Buffer`/`ObjectId` cloned by their own
constructors), so package virtuals compute for both lean and hydrated results.
Schema defaults/getters/transforms/init hooks can still change their input values;
see the [hydration value caveat](#breaking-release-server-owned-hydration).
Only returned field values are committed via document-aware helpers;
`undefined` omits the field; a throw omits it fail-closed with a structural
log (no raw values or secret-bearing text). Sibling virtual values are never
visible regardless of completion order, and mutating getter input cannot change
response data or lifecycle snapshots implicitly. Public related documents finalize
before parent getters run, and embedded children finalize before their parent getter.
The first getter argument retains that ordinary persisted/local/public-related
view. An opted-in getter receives its declaration-scoped **private populated inputs
separately in argument four**; see below. A trusted getter may deliberately return
a value derived from private inputs, subject to the virtual's output authorization.

Coverage: every document-bearing public model output uses its own model's
definitions, permissions, selection, and effective access — direct
list/read/create/update/upsert/`new`-template outputs, Mongoose `populate`
targets, legacy + correlated `include` targets (including nested includes),
and embedded-subdocument outputs. Embedded scopes mirror
`permissionSchema.<field>.sub` (for example `contacts.sub.displayName` with
`virtuals.contacts.sub.displayName`), support nested arrays/single-nested
objects, and reuse the owning parent's internally computed grants; dedicated
`listSub`/`readSub`/`createSub`/`updateSub`/`bulkUpdateSub` routes finalize
visible rows only (hidden rows never run getters; denied post-save mutation
rows stay `[]`/`null`). Populate and include targets are trimmed with the
target model's policy — including registered targets without virtual
definitions. `select` keeps its arbitrary-string grammar (`?select=name,
fullAddress`, space/repeated query forms, body arrays/objects, and
`['-fullAddress']` exclusions all work); `select` on `populate` entries and
embedded fields follows the same rule.

Access matrix (`context.operation` always carries the initiating public
operation; the three accesses carry effective visibility):

| Output path                                                                     | `virtualAccess`                       | `outputAccess`                      | grants source                        |
| ------------------------------------------------------------------------------- | ------------------------------------- | ----------------------------------- | ------------------------------------ |
| list                                                                            | `list`                                | `list`                              | `list`                               |
| read / readFilter (incl. `read` using `list` fallback: all three become `list`) | `read` (or fallback `list`)           | same                                | same                                 |
| create / create branch of upsert                                                | `create`                              | `read`                              | `create`                             |
| update / update branch of upsert                                                | `update`                              | `read`                              | `update`                             |
| new template                                                                    | `create`                              | `create`                            | `create`                             |
| populated target                                                                | target's effective `read`/`list`      | same target access                  | same target access                   |
| included target (legacy + correlated, incl. nested)                             | include `op` (`read`/`list`)          | same target access                  | same target access                   |
| embedded values inside a model output                                           | owning output's getter access         | owning output's field-policy access | owning document's internal grants    |
| listSub / readSub                                                               | `list`/`read`                         | `list`/`read`                       | owning-parent internal `read` grants |
| createSub / updateSub / bulkUpdateSub response (existing rows post-save)        | initiating `create`/`update`/`update` | `read`                              | owning-parent internal `read` grants |

A create-only getter runs only on create/upsert-create responses; an
update-only getter only on update/upsert-update responses. On other responses
the name stays a registered virtual: omitted from output and never entering
persisted projections, write admission, or sort/filter/distinct handling. A
known-denied virtual adds no dependency-only fetch and never runs its getter;
a document-dependent rule may fetch inputs before real grants deny the getter.

Output-only database/write restrictions: registered virtual names for any
access (including bare `permissionSchema: true` rules and inapplicable
descriptors) are excluded from persisted projections, client create/update
admission (including whole-object/array grants and permissive/Mixed schemas),
and database sort/filter/distinct field authorization at the model-aware
service boundary. `delete` (identity only), `exists`, `distinct`, `count`, and
`countTrusted` never run getters. No submitted or computed virtual value is
persisted.

Filter cleanup distinguishes field predicates from literal data. Empty-object
equality (`{ reconciliation: {} }`), literal arrays, and `$eq`/`$in` operands
retain their meaning, including data keys with the same spelling as virtuals.
Root/dotted virtual predicates and embedded `$elemMatch` query fields are still
excluded. The nested-field shorthand under a registered embedded container also
excludes its virtual fields; use `$eq` for literal whole-container equality there.
Only clauses emptied by an actual virtual removal are pruned. An originally empty
object or logical branch is retained; a wholly virtual ordinary filter becomes `{}`.

Trusted `decorate`/`decorateAll`/tasks boundary: virtuals evaluate before
`decorate`/`decorateAll`/tasks; internal-only dependency fields are stripped
before those hooks see the object. Private fourth-argument maps are never implicitly
transported there; an authorized getter's deliberate returned value is output.
Trusted hooks may deliberately construct new
output from trusted context; no second authorization pass after those hooks is
promised.

Performance (measured, VIRT-11): prefer authorized finalized populate/include
data over per-row database calls. On a 24-row list with 2 getters at
`maxHookConcurrency: 4`, a virtual doing `Address.findById` per document issued
25 driver reads (1 list + 24 per-row) with peak active getter work 4; the same
label via `populate: [{ path: 'addrId', select: ['label'] }]` and a getter
reading the finalized `doc.addrId` object issued 2 driver reads (batched `$in`)
with identical output and the same peak bound. Bounds do not collapse N+1
into 1. Argument one contains finalized public related/embedded outputs; it cannot
recover stripped related fields. Use an explicit `dependsOnPopulate` declaration
and the separate fourth argument when an authorized virtual needs private inputs.

### Private populated dependencies

`dependsOnPopulate: [{ path: 'account', select: ['balance', 'creditLimit'] }]`
is trusted **server virtual configuration**, available from the existing root and
`/advanced` types. It grants the declaring getter private persisted **input fields**,
even when source `account` or target `balance`/`creditLimit` output is denied.
The source ref is retained automatically; repeating it in local `dependsOn` is unnecessary.

- `dependsOn` supplies persisted fields in the current scope through argument one.
- Ordinary query `populate` requests public related output under source and target
  authorization, selection and match rules.
- `dependsOnPopulate` supplies one-hop persisted target values **only to that
  resolved getter's fourth argument**. It neither requests public population nor
  grants output. HTTP, root, service query and client options cannot declare it.

#### Runnable private dependency example

Save as `private-populate-example.mts` and run with Node 22.18+ or compile with
TypeScript/NodeNext. Install the package, Express and Mongoose as above. This
self-contained example creates/removes a uniquely named database, registers the
target **before** the source, and checks all three response shapes. The example
tenant is server-owned; real applications derive it from their authenticated actor.

<!-- doc-example: complete-runtime -->

```ts
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { once } from 'node:events';
import type { Server } from 'node:http';
import express from 'express';
import mongoose from 'mongoose';
import { createAccessRuntime, type ModelVirtualDescriptor } from '@web-ts-toolkit/access-router';

interface Account {
  name: string;
  balance: number;
  creditLimit: number;
  tenantId: string;
}
interface Order {
  total: number;
  account: mongoose.Types.ObjectId | null; // stays a persisted ref, not an Account
}
interface OrderVirtuals {
  canPlaceOrder: boolean;
}

async function runPrivatePopulateExample() {
  const connection = await mongoose
    .createConnection(process.env.MONGODB_URL ?? 'mongodb://127.0.0.1:27017', {
      dbName: `private_populate_example_${randomUUID().replaceAll('-', '')}`,
    })
    .asPromise();
  let server: Server | undefined;
  try {
    const api = createAccessRuntime();
    api.setGlobalOptions({ globalPermissions: () => [] });
    const AccountModel = connection.model<Account>(
      'PrivateExampleAccount',
      new mongoose.Schema<Account>({
        name: String,
        balance: { type: Number, select: false },
        creditLimit: Number,
        tenantId: String,
      }),
    );
    // Both the actual model instance and its options must exist in this runtime first.
    const accounts = api.createRouter(AccountModel, {
      operationAccess: { read: true },
      baseFilter: { read: () => ({ tenantId: 'shop-a' }) },
      permissionSchema: { name: true, balance: false, creditLimit: false },
      stripPermissionsField: true,
    });
    const OrderModel = connection.model<Order>(
      'PrivateExampleOrder',
      new mongoose.Schema<Order>({
        total: Number,
        account: { type: mongoose.Schema.Types.ObjectId, ref: AccountModel.modelName },
      }),
    );
    // Explicit target map: an ObjectId alone cannot infer its related model.
    const canPlaceOrder: ModelVirtualDescriptor<Order, boolean, { account: Account }> = {
      dependsOn: ['total'],
      dependsOnPopulate: [{ path: 'account', select: ['balance', 'creditLimit'] }],
      get(doc, _permissions, _context, populated = {}) {
        const account = populated.account;
        if (doc.total === undefined || account?.balance === undefined || account.creditLimit === undefined)
          return undefined;
        return doc.total <= account.balance + account.creditLimit;
      },
    };
    const orders = api.createRouter<Order, OrderVirtuals>(OrderModel, {
      basePath: '/orders',
      operationAccess: { read: true },
      permissionSchema: { total: false, account: true, canPlaceOrder: true },
      virtuals: { canPlaceOrder }, // assign the separately typed descriptor normally
      stripPermissionsField: true,
    });
    const account = await AccountModel.create({ name: 'Main', balance: 80, creditLimit: 20, tenantId: 'shop-a' });
    const order = await OrderModel.create({ total: 90, account: account._id });
    const app = express();
    app.use(express.json());
    app.use(orders.routes);
    server = app.listen(0, '127.0.0.1');
    await once(server, 'listening');
    const address = server.address();
    assert.ok(address && typeof address !== 'string');
    const url = `http://127.0.0.1:${address.port}/orders/__query/${order._id}`;
    async function read(args: object) {
      const response = await fetch(url, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(args),
      });
      assert.equal(response.status, 200);
      return response.json();
    }
    const select = ['account', 'canPlaceOrder', '-_id'];
    // 1. Public population: fetch name + private inputs, return only the public mask.
    assert.deepEqual(await read({ select, populate: [{ path: 'account', select: 'name -_id' }] }), {
      account: { name: 'Main' },
      canPlaceOrder: true,
    });
    // 2. No ordinary population: restore the exact selected/permitted original ID.
    assert.deepEqual(await read({ select }), { account: String(account._id), canPlaceOrder: true });
    // 3. Unselected reference: compute privately, omit account entirely.
    assert.deepEqual(await read({ select: ['canPlaceOrder', '-_id'] }), { canPlaceOrder: true });
    // Readable-but-unrequested private fields still do not join public output.
    accounts.setOption('permissionSchema', { name: true, balance: true, creditLimit: true });
    assert.deepEqual(await read({ select, populate: [{ path: 'account', select: 'name -_id' }] }), {
      account: { name: 'Main' },
      canPlaceOrder: true,
    });
    // Denying the source field also leaves only the authorized virtual result.
    orders.permissionSchema('account', false);
    assert.deepEqual(await read({ select }), { canPlaceOrder: true });
    // Input-field authority does not bypass the target's base read operation.
    accounts.setOption('operationAccess.read', false);
    assert.deepEqual(await read({ select: ['canPlaceOrder', '-_id'] }), {});
  } finally {
    if (server)
      await new Promise<void>((resolve, reject) => server!.close((error) => (error ? reject(error) : resolve())));
    await connection.dropDatabase();
    await connection.close();
  }
}
runPrivatePopulateExample().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
```

#### Typing and isolated getter inputs

`ModelVirtualGetter`, `ModelVirtualDescriptor`, `ModelVirtualAccessRecord` and
`ModelVirtualLeaf` accept a third generic `TPopulated`, defaulting to an empty
shape. `ModelVirtualPopulateInputs<Source, { account: Account }>` is the fourth
argument's type. Known source keys are checked, scalar/array cardinality follows
the persisted source field, and unknown cardinality allows both. No target shape
is guessed without an annotation; the annotation grants no runtime authority.
Neither persisted/write models nor public selected-output models are widened.

Each mapped key is optional. A scalar is a deeply partial/readonly target or null;
an array is a readonly array of partial targets/null slots, or null. Guard missing
fields. Native Date/Buffer/BSON scalar types remain native; mutable methods still
exist, but every getter, row and repeated array slot receives an isolated copy.
The runtime always supplies argument four (`{}` without a declaration). Its type
is optional to preserve existing three-argument callbacks **and direct calls**;
use `populated = {}` or guard undefined in typed getters.

Argument one remains the ordinary persisted/local-dependency/finalized-public-related
view for every getter. Automatically fetched private-only refs are not added there;
an existing local `dependsOn` on that ref keeps its ordinary behavior. Each getter
sees only its own resolved declarations and target selections in argument four.
Private maps/raw targets are not implicitly attached to response DTOs, contexts,
lifecycle snapshots, public permission hooks/metadata, document handles, or ordinary
decorate/decorateAll/task inputs. **Only an authorized getter's deliberate return
becomes computed output**; this is not a prohibition on returning derived values.

#### Target authority, selection and reconstruction

Private targets always use captured base **`read`** admission, including array refs,
source lists, writes and templates. The original actor's `operationAccess.read`,
`overrideFilter.read` (starting with `{}`) and `baseFilter.read` run under request row
authority with their normal exact → default → bare fallback/cache rules. Mandatory
source IDs are ANDed afterward, preserving tenant scope. There is no private read-to-list
fallback or route-variant gate. `authorization.related` governs only an ordinary
requested populate/include; its grants/replacement rows, public `match`, `access`
and `select` cannot redefine private inputs. A related policy naming only a
dependency-only path is unused/invalid.

Only selected, applicable, not-definitely-denied virtuals add dependency work;
document-dependent authorization may defer until after fetching. Compatible public
and private reads share a positive persisted **fetch union**, including internal
identity/hook/join requirements. Their original authorization/output masks stay
separate and immutable. Even a readable private field is omitted unless originally
selected and permitted. Public exclusions and `-_id` remain effective. Different
public match/access/row scopes require independent queries.

The original query includes resolved server defaults. A default populate is ordinary
population; explicit `populate: []` suppresses it. Admitted ordinary population keeps
its original target projection, match/missing/null/array behavior. Denied ordinary
population keeps its existing fallback shape. Without ordinary population, selected
and permitted refs restore their exact pre-populate IDs/arrays, including missing
target IDs, order, duplicates, nulls, empty arrays and own absence. Unselected,
excluded or denied source refs are omitted, including their IDs. Reconstruction
runs even when the getter is omitted or fails, before presentation hooks/tasks.

#### Supported declarations and validation

- Entries accept **only `{ path, select? }`**: no shorthand string, model, match,
  access, populate or arbitrary Mongoose options. Duplicate paths within a resolved
  declaration reject. Different virtuals may declare the same path.
- `path` is a top-level, scope-local ObjectId scalar or one-dimensional ObjectId
  ref array with a static string ref to an actual same-connection, same-runtime,
  registered ObjectId-identity model. Embedded object/nested/document-array virtuals
  use their `.sub` scope (declare `account`, not `contacts.account`). Dotted source
  paths, Map/Mixed/dynamic refs, refPath, function/model-valued refs, virtual populate,
  discriminator-varying source scopes or discriminator targets, cross-connection
  targets, non-ObjectId IDs and multidimensional ref arrays reject explicitly.
- Target `select` accepts comma/space strings, string arrays, or **1/-1** objects
  (not Mongo's 1/0). Omitted/undefined/effectively empty (`''`, `[]`, `{}`) means all
  eligible static persisted fields. Exclusion-only subtracts from that universe;
  positive paths select eligible descendants, with explicit negatives winning.
  `_id` is included unless `-_id` (or `{ _id: -1 }`) is declared; association identity
  is still privately fetched. For example `{ balance: 1, _id: -1 }` supplies only balance.
- Static embedded/dotted target fields work. Containers expand to eligible stored
  leaves; stored target refs remain IDs only. Explicit target virtuals/aliases,
  unknown/unsafe/control/metadata/version paths, dynamic Map/Mixed paths, ref
  traversal, `+` tokens, non-string array entries and invalid object values reject,
  including invalid exclusions. No recursive target virtual computation/private
  population occurs. Target `requireExplicitSelect` and service defaults do not
  replace the declaration's selection.
- Shared per-access `dependsOnPopulate` inherits independently of `dependsOn`:
  exact access getter → default getter; a bare getter inherits its shared lists.
  A leaf's defined list replaces the shared list wholesale, `[]` clears it,
  undefined inherits, and null rejects. Descriptor arrays/masks and target policies
  are captured with the getter before asynchronous work; later calls see updates.
- Validation is eager and atomic for constructors, bulk and dotted setters. Target
  model instances **and options must be registered first**, even with
  `requireRegisteredPopulateModels: false`. For mutually referencing models, register
  both options before assigning virtuals; self-refs use the proposed source options.
  Operation capture rechecks schema/target/metadata binding before hooks or writes.

#### Absence, errors, lifecycle and measured work

Absent/undefined source refs omit the virtual without invoking it. Present null and
empty arrays invoke the getter with null/[] without a target query when read is
admitted. Deleted/out-of-scope target rows become scalar null or null array slots;
private arrays preserve original order, duplicates and null/missing slots. Missing
target fields remain partial inputs; null/false/zero/empty-string stay present and
the getter decides what to return.

Target read denial or terminal false transform/base scope makes dependencies
unavailable and omits affected virtuals (even for null/empty source refs). A
dependency-only query/hook/cast failure also omits them with structural-only logging.
There is no raw fallback, retry or new retryable write error: a successful write
stays successful. A failed query that also serves ordinary public population keeps
that ordinary error path. Getter undefined/throw omits fail-closed; invalid server
configuration is a preflight error, not an unavailable input.

Support covers direct/root/trusted reads, create/update/both upsert branches, `new`,
ordinary populated and legacy/correlated included targets, embedded scopes, and
visible dedicated subdocument list/read/create/update/bulkUpdate outputs. Count,
distinct, exists, delete identities, include-count and field helpers add no private
dependency I/O/getters. `SubPopulate` remains path/select-only. Writes capture
post-save/post-afterPersist refs on detached output copies after lifecycle work;
hidden mutation rows do not run getters. `new` still ignores `args.select`, uses
create access, and loads present default refs under target read authority without saving.

Private fetches use the receiving output's captured hydration: source read mode for
direct reads/populate, fixed lean for include targets, hydrated for dedicated child
read/list and ordinary writes/templates, fixed lean for child mutation visibility.
Restoration is exact relative to that pre-populate materialized value, not raw BSON
parity across modes. Defaults/getters/transforms/init hooks and dotted projection's
omitted null containers can differ; see the [hydration caveat](#breaking-release-server-owned-hydration).

Measured batching: with two compatible target groups, **1 and 24 source rows both
issued 1 parent find + 2 target finds**, in lean and hydrated modes. Getter counts
were 4 and 96; observed persistence/getter peaks were 1/1 or 2/2 at matching limits.
Compatible rows/virtuals/scopes batch and deduplicate fetched IDs, not reconstructed
slots or public authorization. Covered raw work can be reused only within its
captured request/runtime/family/mode and ID/projection coverage. Different scopes
still query separately; ordinary per-parent correlated public queries remain
per-parent. This is not a constant-query-count promise for independent includes.

**Compatibility:** existing bare/descriptor/per-access getters and local `dependsOn`
keep their first-argument and three-argument direct-call contract. Opt in by adding
the declaration and a separately typed descriptor/default fourth argument; no new
router-wide generic, entrypoint, client API or persisted-field migration is required.
The deliberate opt-in constraints are eager target registration and strict static
reference/target-selection validation; ordinary public populate grammar is unchanged.

### Hook admission and reentrant service calls

`requestComplexity.maxHookConcurrency` (default `10`) limits **independently
admitted hook chains per request/runtime**. Independent services, root-batch
entries, legacy/correlated includes, populate and embedded/subdocument outputs
share one private pool. It covers:

- Model `docPermissions`, including pre-write, output-helper and owning-parent stages;
- Virtual getters;
- Model/data `decorate` and `decorateAll` chains and service output decorator callbacks;
- Data request-field selection/trimming stages (their field rules run sequentially).

Other guards, row/identifier filters, model field-rule callbacks and write
lifecycle hooks are outside this hook pool. Row/traversal maps have finite
**per-call** worker bounds, with stable output/context indices; their waiting
orchestration frames are not globally counted as hook permits.

**Awaiting another service from a hook is supported, including at limit `1`.**
Its descendant hooks reuse the admitted chain through private async context.
Every live callback scope admits **one immediate child branch at a time**, FIFO,
including that child's descendant drain. Thus `Promise.all` of nested service
calls cannot bypass the limit: sibling hook stages serialize in that chain.
At most `maxHookConcurrency` independent leaf branches are admitted; recursively
waiting ancestor callbacks still exist and do **not** consume extra permits.
The setting does not promise that all unsettled callback frames fit within it.

Reentrant depth is capped at **64 admission scopes per chain**, including internal
hook-stage wrappers, independently of client template/structure depth limits.
Overflow rejects through the existing hook failure policy (getters omit their
field, document-grant hooks fail closed, decorator errors propagate). Settlement
closes a scope to new reentry and drains already-queued child hooks before releasing
its branch, even on error. Detached continuations of closed scopes reacquire normal
root admission. Await work started by hooks and avoid cross-branch dependency cycles;
sibling hooks must not wait for each other to start. Root and per-frame child queues
each transfer permits FIFO; descendants progress within their existing chain before
unrelated queued roots.

Hook and persistence limits are normalized and captured together when the private
request/runtime work state is first used. Configuration changes affect new requests;
existing owners retain their captured limits regardless of ambient runtime changes.
Separate requests and runtimes have independent pools. Service hook delegates retain
their originating core when another runtime reinitializes the same request's core slots.
`maxBulkConcurrency` remains the separate leaf adapter/document persistence ceiling:
no persistence permit is held
over hooks or recursive orchestration. Trusted hooks' own direct DB/network fan-out,
total queued work and query counts are not bounded by these settings. Neither is a
process-wide connection limit or an automatic batching mechanism.

### Virtuals compatibility notes

These notes describe approved external output/validation behavior; they are
not silent backward compatibility:

- Target-model populate trimming now applies to populated documents,
  including registered targets without virtual definitions (previously only
  query-level `select`/`match` restricted populate output, while includes
  trimmed via target `Service.find`/`findOne`). Populated responses may now
  omit fields that previously leaked (for example `alwaysSelect`-forced
  internal fields). This is an intended behavior change.
- Selection grammar is unchanged: arbitrary select strings remain accepted
  (no stricter signed-field/path grammar was adopted), so there is no
  malformed-path rejection guarantee and no grammar compatibility break.
  Registered-but-inapplicable virtual names remain virtual.
- Embedded recursion applies the scope's `permissionSchema.<field>.sub` rules
  with children finalized before parents; database fetches retain only the
  needed containers/dependencies (never `.sub` definition paths, and never
  both a container and its child path in one projection, avoiding path
  collisions). An omitted parent container is never exposed just because a
  child virtual uses it internally.
- Mutation/new selection behavior is unchanged: effective virtual selection is
  computed before evaluation and carried into the shared finalizer; public
  `_create` picks by explicit `select` after decorate/tasks and `_update`
  picks by explicit `select` (else the implicit `returningAll: false` pick);
  `new()` continues to ignore `args.select` (all applicable `create` virtuals
  are considered, subject to field authorization, not `args.select` exclusions). Any future honoring of
  `new.args.select` is an explicit contract change, not applied here.
- This README is the shipped compatibility and migration record for these contracts.

## Persistence concurrency and resource limits

`requestComplexity.maxBulkConcurrency` (default `10`) bounds simultaneous awaited
**adapter/document persistence operations** for access-router model services sharing
one request and runtime. Direct service calls, root entries, subqueries, legacy
includes and nested correlated includes share admission. Different requests and
different runtimes have independent pools and correlated-query totals. Services
capture their owning runtime at construction; later ambient runtime changes do not
move their persistence to another pool.

Admission covers lazy adapter query settlement, document save/delete, and
service-triggered post-write populate. Bulk create submits one admitted singleton-array
adapter call per item, preserves result order, and still submits every item if one
rejects. Internal custom adapters must preserve array-in/array-out create semantics.
Their optional synchronous `castFilter` must cast a copy and preserve `$in` operand
order/cardinality; without it they retain identity casting.

Recursive orchestration holds no persistence permit while waiting for descendants,
so limit `1` supports nested includes. Internal map/run loops remain bounded per
invocation. `RootRouter.maxConcurrentOperations` separately bounds whole root
operations within each order group, with results in input-index order. Permits
release on success or error and pass FIFO to waiting work; release neither cancels
submitted siblings nor refunds the cumulative `maxCorrelatedQueries` budget (default
`100`). `maxCorrelatedDepth` (default `5`) separately bounds template nesting.

The ceiling is **not a MongoDB driver-command count**: one admitted operation can
run Mongoose middleware/populate that issues multiple commands. Router ACL, prepare,
afterPersist, decorate and recursive include orchestration are outside the permit;
Mongoose's own middleware runs inside the awaited operation. Direct database/network
calls from trusted hooks are not governed. This is neither a process-wide connection
pool limit nor a throughput guarantee. Controlled nested-query instrumentation reduced
peak active collection calls from 9 to 3 at limit 3 for the tested paths; it is not a
production benchmark or a guarantee about middleware/populate fan-out.

### Compatibility notes

These boundary fixes preserve public entrypoints and require no new dependency or
option. Move computed include output away from permission metadata. Nested leaf edits
now preserve protected siblings; prepare hooks relying on omission to delete a parent
must replace it explicitly in transform. Handle successful null/empty subdocument
responses as completed writes. Legacy counts now cast schema values and report invalid
operands as BadRequest; they remain grouped and independent of list pagination.
Persistence admission is shared across nested work within each request/runtime, so
timing may change. It does not provide transactions, idempotency or optimistic
concurrency protection for competing edits.

## Subpath import example

<!-- doc-example: complete-runtime -->

```ts
import { copyAndDepopulate, type CopyAndDepopulateOutput } from '@web-ts-toolkit/access-router/processors';

type DepopulatedItems = {
  items: string[];
  itemsSnapshot: Array<{ _id: string; name: string }>;
};

const { items, itemsSnapshot } = copyAndDepopulate<DepopulatedItems>(
  { items: [{ _id: 'a1', name: 'Apple' }] },
  [{ src: 'items', dest: 'itemsSnapshot' }],
  { mutable: false },
);
// `items` is now `['a1']`; `itemsSnapshot` holds the original objects.
const conservative: CopyAndDepopulateOutput = copyAndDepopulate({ items: [{ _id: 'a1' }] }, [
  { src: 'items', dest: 'itemsSnapshot' },
]);
```

Without an explicit output type, `copyAndDepopulate(...)` returns the conservative `CopyAndDepopulateOutput`
record because runtime `src` and `dest` path strings can replace populated objects with ids and add new fields.
Unsafe paths or records missing the configured id field throw plain `Error` instances with descriptive messages.

## Documentation

- live docs: https://web-ts-toolkit.pages.dev/docs/packages/access-router
- source docs live in the website/docs package of this repository; paths may move as the docs site evolves.
