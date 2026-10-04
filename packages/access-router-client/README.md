# `@web-ts-toolkit/access-router-client`

Typed client utilities for `@web-ts-toolkit/access-router` APIs.

## Supported Runtimes

The package ships at an `es2022` bundle target and is officially supported in
**Node 22+** (declared via `engines.node`) and **modern evergreen browsers**
(Chrome 94+, Edge 94+, Firefox 93+, Safari 16+, declared via `browserslist`).
See [Browser And Node Support](#browser-and-node-support) below for the
authentication contract, what Node-only and browser-only paths can and
cannot do, and the smoke-test coverage that catches Node built-in leaks.

## Installation

```sh
pnpm add @web-ts-toolkit/access-router-client
```

## Highlights

- typed model and data services
- lazy requests that can be grouped into one batch call
- `Model<T>` wrappers with dirty tracking and `save()`
- normalized response and error handling around Axios

## Unreleased Migration

This remediation release tightens several public runtime and TypeScript
contracts. When upgrading from the previous client contract:

| Area                                 | Before                                                                                                                         | After / required migration                                                                                                                                                                                                                                                                                                                                                                                                               |
| ------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Subdocuments                         | Results could expose parent-backed `Model<S>` values and `save()`.                                                             | Results are plain objects/arrays. Persist with the parent-scoped `subs(...)` helper's `update`, `create`, `bulkUpdate`, or `delete` methods.                                                                                                                                                                                                                                                                                             |
| Create and list counts               | Subdocument create looked scalar and subdocument lists used `totalCount`; model create was scalar-only.                        | Subdocument create accepts one or many and always returns the post-create array with `count`. Model create preserves input cardinality: object -> `ModelResponse`, array -> `ArrayModelResponse`. Model/data lists retain `totalCount`.                                                                                                                                                                                                  |
| Responses                            | Failure `data` and success fields could not be narrowed reliably.                                                              | Branch on `result.success`. Success has non-null `raw`/`data`; failure has `data: null` and the problem payload in `raw`. Model/data `totalCount` defaults to `0` when metadata is unavailable; read subdocument `count` after success.                                                                                                                                                                                                  |
| Cache                                | An enabled cache could be unbounded and credentialed requests did not require an explicit identity partition.                  | Cache is still off by default (`cacheTTL: 0`). Enabled caches admit supported GETs only, default to a 100-entry LRU, and require `cachePartition` for credentialed requests. Clear on identity changes and dispose on teardown.                                                                                                                                                                                                          |
| Grouping                             | A lazy request could be replayed or moved between direct and grouped execution; batch error policy could drift by entry.       | Each lazy request can be claimed once. Create a new request to execute again. All group members must share one effective `throwOnError` policy. Non-throwing batches return all entries; throwing batches run all callbacks and then reject with the first failure.                                                                                                                                                                      |
| Protocol types                       | Data permission options, object/tuple data sorts, and a count access argument were accepted. Filters were broadly permissive.  | Remove `includePermissions` from data calls, use string data sorts, call `countAdvanced(filter, config?)`, and fix invalid `FilterQuery<T>` values. Use `DottedPathFilter<T>` or `ServerSideCast<T>` only as explicit escape hatches.                                                                                                                                                                                                    |
| Paths, config, and model persistence | Dynamic path values were interpolated directly, inputs could be mutated, and projected models could lose persistence identity. | Pass raw path values for one-pass encoding; caller configs stay immutable. ID-based projected reads retain identity, while an existing model with no recoverable identity throws `MissingPersistenceIdentityError`. Use `set()`/`markModified()` for nested edits (dot, bracket-index, and quoted-key forms share one dirty root).                                                                                                       |
| Service defaults and subqueries      | Nested `Date` defaults could serialize as `{}` and accepted `sq` defaults were ignored without per-call `sq`.                  | Service defaults accept null, string, boolean, finite numbers, valid `Date` values (detached per request), plain objects, and arrays; functions, symbols, bigints, non-finite numbers, invalid `Date` values, non-plain instances, and cycles throw `UnsupportedServiceDefaultValueError`. Adapter/service/per-call `sq` precedence applies on `list`, `listAdvanced`, `read`, `readAdvanced`, and `readAdvancedFilter` (per-call wins). |
| Distinct result types                | `distinct`/`distinctAdvanced` were typed `Response<string[]>`, so string methods compiled on numeric/boolean server values.    | Both variants return `Response<unknown[]>` with no server-value stringification. Narrow elements (for example `typeof v === 'string'`) before calling string methods.                                                                                                                                                                                                                                                                    |

Grouped entry `headers` are now `{}` because the root protocol has no
per-operation headers. Structured grouped failure fields remain in `raw`.

Additional business-contract corrections in this release:

- **Optional/projected fields:** direct assignment to an absent nonreserved
  top-level field now tracks and saves it, instead of creating an untracked
  wrapper shadow. Use helpers for reserved names and nested paths; remove code
  that redefines, deletes, freezes, or replaces the model wrapper's structure.
  See [Model writes and reset](#model-writes-and-reset) for key restrictions.
- **Cache parity:** partition/body boundaries and body types no longer collide.
  Deduplicated HTTP errors share the transformed JSON/text body regardless of
  caller order; each caller still applies its own `validateStatus`.
- **Query params and grouping:** basic service calls now retain ordered
  `URLSearchParams` alongside generated options. Reversing repeated values or
  substituting a tag-shaped plain object for a `Date`/`URLSearchParams` value
  no longer counts as equal grouped config; align configs or execute separately.
- **Preparation limits:** cyclic, over-deep, or excessive expanded inputs now
  throw controlled errors synchronously. Reduce oversized query/default bags
  according to [Input preparation limits](#input-preparation-limits).

## Quick Start

```ts
import { createAdapter } from '@web-ts-toolkit/access-router-client';

type User = {
  _id?: string;
  name: string;
  role: string;
};

const adapter = createAdapter({
  baseURL: 'http://localhost:3000/api',
});

const userService = adapter.createModelService<User>({
  modelName: 'User',
  basePath: 'users',
});

const listResponse = await userService.listAdvanced(
  { role: 'admin' },
  { select: ['name', 'role'], limit: 10 },
  { includeCount: true },
);

const user = await userService.read('user-id-1');

if (user.success) {
  user.data.role = 'owner';
  await user.data.save();
}

const grouped = await adapter.group(
  userService.readAdvanced('user-id-1', { select: ['name'] }),
  userService.countAdvanced({ role: 'admin' }),
);
```

## Correlated Includes

A correlated include runs a target query per parent document using values
from that parent. Build the inner query with the familiar service methods,
reference parent fields explicitly with `parentField()`, and attach the
result with `$include(path)`:

```ts
import { createAdapter, parentField } from '@web-ts-toolkit/access-router-client';

type User = { _id?: string; orgId?: string; managerId?: string; name: string };
type Org = { _id?: string; name: string; description?: string; active?: boolean };
type Post = { _id?: string; authorId?: string; reviewerId?: string; title: string };

const adapter = createAdapter({ baseURL: 'http://localhost:3000/api' });
const userService = adapter.createModelService<User>({ modelName: 'User', basePath: 'users' });
const orgService = adapter.createModelService<Org>({ modelName: 'Org', basePath: 'orgs' });
const postService = adapter.createModelService<Post>({ modelName: 'Post', basePath: 'posts' });

const userWithIncludes = await userService.readAdvanced('user-id-1', {
  include: [
    orgService.readAdvanced(parentField('orgId'), { select: ['name', 'description'] }).$include('org'),
    postService
      .listAdvanced(
        { authorId: parentField('_id'), reviewerId: parentField('managerId'), title: '$special' },
        { select: ['title'], sort: { createdAt: -1 }, limit: 5 },
      )
      .$include('posts'),
    postService.countAdvanced({ authorId: parentField('_id') }).$include('postCount'),
  ],
});
void userWithIncludes;

const basicPosts = postService.list({ limit: 5 }).$include('posts', {
  filter: { authorId: parentField('_id') },
});
void basicPosts;

const basicCount = postService.count().$include('postCount', {
  filter: { authorId: parentField('_id') },
});
void basicCount;

const filteredOrg = orgService
  .readAdvancedFilter({ _id: parentField('orgId'), active: true }, { select: ['name'] })
  .$include('org');
void filteredOrg;
```

All seven builders compose this way: `read`, `readAdvanced`,
`readAdvancedFilter`, `list` (+ supplemental `{ filter }`), `listAdvanced`,
`count` (+ supplemental `{ filter }`), and `countAdvanced`. Reference scope
and result-shape notes:

- References resolve against the **immediate parent** document on the outer
  server. Nested includes inside `args.include` bind to the target doc of
  the enclosing include, never to the outer parent.
- Plain strings are never references: `title: '$special'` keeps its literal
  query meaning. Match a literal `{ $parent: 'x' }` object with
  `{ $escape: { $parent: 'x' } }` (use the `$eq`-wrapped form when the
  literal sits in a bare field position).
- Reads attach the doc or `null`, lists attach arrays, counts attach
  numbers. A missing or `null` reference skips the target query and
  attaches the same no-match shape (`null` / `[]` / `0`).
- Identifier reads (`read` / `readAdvanced`) preserve the target's
  configured identifier behavior (custom id fields included). Lists apply
  `limit`/`page` per parent; counts use count semantics (never a capped
  list count).
- Conversion is synchronous and performs zero HTTP calls. A call carrying
  references returns a frozen, non-thenable descriptor — it cannot be
  awaited into data or grouped; convert it with `$include()` first.
  Reference-free calls keep their ordinary lazy/grouped behavior.
- Descriptors are transport-inert: the inner query always executes on the
  **outer** server. Mixing adapters in one include tree is allowed at build
  time and never dispatches to the inner service's transport.
- Typed output needs an explicit result generic with the path first:
  `.$include<'org', Org>('org')`. Without it the path is still attached but
  typed `unknown`; nothing is inferred from partial projections, reads admit
  `null`, and nested values stay plain (never `Model`-wrapped).
- Requires a server with correlated-include support (see the
  `@web-ts-toolkit/access-router` README "Correlated Includes" section).
  Older servers silently drop the new entries instead of executing them.

### Input preparation limits

Client query preparation allows **64 edges from each input root** (root depth 0) and **10,000 expanded value visits per preparation boundary**. Containers,
primitive leaves, array slots (including holes), and every repeated occurrence
of a shared acyclic object count. Shared references are allowed; cycles reject.

- The bounds apply before plain-object/array filter scanning, correlated
  capture, snapshot copying, and subquery rewriting, including reference-free
  filters and supplemental `$include()` filters.
- Capture combines supplied id/filter/args/options in one budget; undefined
  optional roots are absent. Conversion combines the id or rewritten filter
  with effective forwarded args, including defaults. Internal wire-envelope
  keys do not consume the filter-only budget. Conversion may exceed its budget
  even when individual builder inputs fit.
- `$escape` contents remain literal but are structurally checked. Live lazy
  requests stay opaque until their `__query` becomes `$$sq` wire data, which is
  checked before copying. Plain records carrying `__op`/`__query` are still fully
  bounded and detached inside literals and exposed metadata; those keys do not
  grant live-request opacity there. Validation does not execute requests or freeze
  caller-owned containers. Invalid inputs throw `CorrelatedIncludeError`
  synchronously with zero HTTP from preparation.

Service defaults have a **separate 64-edge / 10,000-visit budget**. The entire
defaults bag is depth 0, and all operation args/options share the budget;
primitive/valid `Date` leaves, array holes, and repeated references count.
Direct `ModelService`/`DataService` construction checks supplied defaults;
adapter factories check the effective shallow-merged adapter/service bag when
creating each service (`createAdapter` itself does not normalize defaults).
Overridden fields do not count; two valid bags may exceed the merged budget.
Generated empty option bags are added afterward. Each per-request default
clone also checks its selected value as a fresh root. Cycles or unsupported
values, depth, or work throw `UnsupportedServiceDefaultValueError`
synchronously, with a path starting at `defaults` (`.key` / `[index]`). This
error is not a root export. Defaults have no opaque-request or frozen-input
exemption; supported values remain detached per request.

These are structural work limits, not byte-size limits, latency guarantees,
or bounds on arbitrary getters, proxies, or exotic-instance behavior. They
are separate from the server's correlated-query execution limits.

## Contract

The full website docs at
https://web-ts-toolkit.pages.dev/docs/packages/access-router-client describe
the same contract the installed package honors. The key points an installed
consumer needs:

- **Adapter defaults** (`createAdapter(axiosConfig?, adapterOptions?)`): the
  adapter applies the following Axios defaults unless overridden by your
  `axiosConfig`: `baseURL: '/api'`, `timeout: 0`, `withCredentials: true`, and
  the response-busting headers `Cache-Control: no-cache`, `Pragma: no-cache`,
  `Expires: 0`. Service `queryPath` defaults to `'__query'` and `mutationPath`
  defaults to `'__mutation'`; `rootRouterPath` defaults to `'root'`.
- **Cache & authentication policy:** credentialed requests are **never**
  cached unless `cachePartition` returns a stable, non-secret identity token.
  Browser cookie credentials, explicit `Authorization`/proxy authorization
  headers, API-key style headers, and Node `Cookie` headers supplied on the
  request config are all treated as credentialed.
  Sensitive headers (`authorization`, `cookie`, `proxy-authorization`,
  `x-api-key`, `x-auth-token`, `x-access-token`, `set-cookie`,
  `www-authenticate`) are excluded from cache keys
  regardless of the partition token. Only GET requests with supported JSON or
  text response semantics are cached; mutations and custom transforms or
  serializers always bypass caching. `cacheTTL` is measured in milliseconds;
  `cacheTTL: 0` (the default) disables the cache entirely, while enabled caches
  retain at most 100 entries by default.
  The partition is captured when the request enters the cache and occupies a
  separate key component from the typed body. Choose a token that distinguishes
  every response-affecting identity/tenant context; redaction does not infer
  identity for you. Eligible concurrent callers share one transformed body,
  including JSON HTTP error bodies, with independent response copies and
  caller-owned config. Each applies its own `validateStatus`. Strict JSON parse
  failures and transport failures reject attached Axios callers and release
  the slot for a later request; service calls apply their normal failure policy.
  `clearCache()` drops every cached entry; `disposeCache()`
  drops entries and releases cache timers (call on adapter teardown so timers
  do not keep a Node process alive).
- **Direct vs grouped:** service methods return a lazy `LazyRequest<T>` that
  does not execute until `await`, `.then()`, `.catch()`, `.finally()`, or
  `.exec()`. `adapter.group(...)` batches multiple lazy requests into one
  root-router round trip; it only accepts lazy requests from **this**
  adapter's services, rejects already-started requests, and requires every
  member to share the same `AxiosRequestConfig` and effective `throwOnError`
  policy. Effective policy follows per-call, service, then adapter precedence;
  mixed policies reject before dispatch. Non-throwing groups return every
  normalized entry, including partial failures. Throwing groups run every
  executed entry's callback exactly once, then reject with the first failed
  entry's `ServiceError`. Once you `await` a lazy request it is no longer
  batchable. Group results preserve input order. Group entry `headers` are
  empty because the root protocol supplies only outer batch headers, not
  per-operation headers.
- **Grouped config equality:** plain-object key order is ignored and undefined
  object properties are omitted. Arrays remain ordered; valid `Date` values
  compare by timestamp, `AxiosHeaders` by their JSON form, and
  `URLSearchParams` by key with repeated values in their original order.
  Distinct-key reordering is accepted; `mode=first&mode=second` differs from
  `mode=second&mode=first`. Dates and URLSearchParams are distinct from plain
  objects that mimic their internal tags. Functions, cancellation controls,
  unsupported instances, and cycles reject. Config validation happens before
  claiming requests or dispatch, so rejected members can still execute directly.
- **Generated query params:** basic model list/read/create/upsert/update, data
  list, and basic subdocument calls clone caller `URLSearchParams`, retaining
  non-generated entries in order (including duplicates and blanks). Generated
  keys replace all caller duplicates; nullish generated values omit the key,
  including undefined pagination defaults. `false` and `0` are retained.
  Plain-object params keep Axios merge behavior. Grouped transport sends the
  caller config once; generated per-operation options live in each body entry.
- **Response narrowing:** `Response<TRaw, TData = TRaw, TError = unknown>` is a discriminated
  union of `SuccessResult<TRaw, TData>` and `FailureResult<TError>`. Branch on
  `result.success` — on the `true` branch both `raw` and `data` are non-null;
  on the `false` branch `data` is always `null` (the server error payload
  lives in `raw`, when one was received). Pass a third generic to opt into a
  known error payload. List responses carry `totalCount`
  on `ListModelResponse<T>`; subdocument list responses carry `count` (the
  server's field) on `SubDocumentListResponse<S>`, never `totalCount`.
- **Subdocument shape:** `ModelService<T>.id(id).subs(sub)` helpers return
  **plain data**, not `Model<S>` instances. `list(...)`, `listAdvanced(...)`,
  `create(...)`, and `bulkUpdate(...)` return `SubDocumentListResponse<S>`.
  `read(...)` and `readAdvanced(...)` return `SubDocumentResponse<S>`.
  `create(...)` accepts a single object **or** an array and always returns the
  post-create subdocument array. Persist a subdocument by calling the
  parent-scoped helper explicitly — there is no subdocument `save()`.
- **Model create cardinality:** `create(...)` and `createAdvanced(...)` accept
  either one object or an array. Scalar input returns `ModelResponse<T>`;
  array input returns `ArrayModelResponse<T>`, including for a one-item array.
- **Mutation input types:** model create/update/upsert payloads default to
  `ModelMutationInput<T>` (`Partial<T>`), so object literals are checked for
  known field names and scalar types without pretending the server can infer
  required create fields. Pass `createModelService<T, TCreateInput,
TUpdateInput, TUpsertInput>(...)` when request schemas differ from the
  response model. Subdocument create/update helpers use
  `SubDocumentMutationInput<S>` (`Partial<S>` for object subdocuments) by
  default and can be customized through `subs<S, K, TCreateInput,
TUpdateInput>(...)`.
- **Model edits:** direct nonreserved top-level assignment tracks fields even
  when absent or omitted from a projection, just like `set`/`assign`.
  `Model<T>` tracks modified top-level paths and
  reconciles writes against the last loaded/saved snapshot. Direct mutation
  of nested objects/arrays (`obj.arr.push(...)`, `obj.sub.field = x`) is
  **not** tracked. Use `set('path.to.field', value)` (applies + reconciles)
  or `markModified('topLevelField')` after a direct mutation (forces dirty
  without reconciling). Reverting a value to its snapshot clears the dirty
  flag. `save()` persists only tracked modified top-level fields; if `_id`
  or captured persistence identity exists it calls `update(...)`. Only drafts
  without identity call `create(...)`; existing identity-less projections throw
  `MissingPersistenceIdentityError`. Multiple
  overlapping `save()` calls on the same wrapper are serialized in call order.
  See [Model writes and reset](#model-writes-and-reset) for reserved fields,
  safe-write restrictions, and local reset semantics.
- **Supported runtimes:** Node 22+ and modern evergreen browsers (see
  [Supported Runtimes](#supported-runtimes) and
  [Browser And Node Support](#browser-and-node-support) above).

### Model writes and reset

Wrapper methods, internal state names (such as `_snapshot` and `_saveQueue`),
and inherited prototype members are reserved on direct access. Assigning them
throws `TypeError`; read/write their document values through `get`, `set`,
`assign`, or `toObject` subject to the key/path rules below. `then` is helper-only:
direct reads return `undefined` and direct writes throw, even if the document
stores a function there. `ModelData` excludes `then` and inherited Object-member
names as well as public Model members. Model methods are owner-bound; fluent
methods return the same wrapper.

Direct assignment and `assign` accept nonempty literal string keys: no `.`,
`[` or `]`, no `__proto__`, `constructor`, or `prototype`, and no numeric
spelling that the path normalizer would change (such as `01`). Symbol writes
and enumerable symbol keys in `assign` throw `TypeError`. `assign` validates
all keys before applying values, so an invalid later key does not partially
apply earlier fields. This is key validation, not transactional execution of
caller getters/proxies. Nested dot/bracket paths belong to `set` and
`markModified`; their existing forbidden-segment rules still apply.

Structural wrapper mutation (`defineProperty`, `delete`, `setPrototypeOf`,
`preventExtensions`, freeze/seal, or legacy getter/setter definition helpers)
throws `TypeError` before changing data, structure, or dirty state. Use
`toObject`/`toJSON` for document serialization instead of wrapper enumeration.

`reset()` restores the local baseline: newly added fields become absent in
`toObject()` and read as `undefined` through direct access and `get` (rather
than the former `null` from a removed field's forwarder). Forwarder slots may
remain enumerable. Reverting an absent field to `undefined` reconciles clean;
JSON still omits undefined values. Neither assignment nor reset introduces a
server unset/delete protocol. Reset during a save retains the persisted
baseline when that save succeeds; unsubmitted concurrent fields retain their
prior absent baseline. The original and returned save wrappers have independent
snapshots, dirty state, and save queues.

Both `new Model` and `Model.create` preserve `instanceof Model`; constructor
typing remains `Model`, while `Model.create` and service responses expose
`ModelData` for typed direct fields. A projection's static selected shape still
controls which fields TypeScript exposes; use `set` for an omitted field.

## Primary Exports

The package is named-export-only (no default export). Import every public
symbol from the package root:

```ts
import {
  // Adapter factory — the primary entry point.
  createAdapter,
  // Correlated includes — explicit parent references and include composition.
  parentField,
  // Thrown for reference/descriptor misuse (malformed markers, forbidden
  // positions, `$include()` validation, grouping a descriptor).
  CorrelatedIncludeError,
  // Service classes. `ModelService` and `DataService` are what
  // `createAdapter(...)` constructs; `Service` is an advanced base class
  // for callers that need a bespoke service shape.
  ModelService,
  DataService,
  Service,
  // Dirty-tracking model wrapper.
  Model,
  // Thrown when `throwOnError` is enabled and a request resolves to a
  // `{ success: false }` result.
  ServiceError,
  // Thrown instead of creating a duplicate when an existing projected model
  // has no recoverable persistence identity.
  MissingPersistenceIdentityError,
  // Low-level lazy-promise wrapper with a single shared execution. Service
  // methods add private adapter metadata required by `adapter.group(...)`;
  // consumer-created wrappers execute directly and are not groupable.
  wrapLazyPromise,
  // Normalized response-count / pagination header names.
  CustomHeaders,
  // Generic list helpers used internally by model list methods; useful for
  // callers that manipulate `Model<T>[]` directly.
  replaceItemById,
  removeItemById,
} from '@web-ts-toolkit/access-router-client';

import type {
  // Adapter and per-factory option types.
  AdapterOptions,
  ModelServiceOptions,
  DataServiceOptions,
  // Cache policy types referenced by `AdapterOptions`.
  CacheController,
  CachePartitioner,
  // Discriminated response union and success/failure members.
  Response,
  SuccessResult,
  FailureResult,
  // Model and data response aliases.
  ModelResponse,
  ArrayModelResponse,
  ListModelResponse,
  ModelData,
  DataResponse,
  ArrayDataResponse,
  ListDataResponse,
  SubDocumentResponse,
  SubDocumentListResponse,
  // Per-method args and options for both `ModelService<T>` and `DataService<T>`.
  // (See the "TypeScript And Errors" doc page for the full list.)
  Defaults,
  DataDefaults,
  // Filter, projection, populate, sort, and request-meta primitives.
  FilterQuery,
  ModelMutationInput,
  SubDocumentMutationInput,
  DottedPathFilter,
  ServerSideCast,
  Projection,
  Populate,
  Sort,
  Document,
  // Correlated includes — wire payload, reference, filter, and output types.
  ParentRef,
  CorrelatedInclude,
  CorrelatedIncludeOp,
  CorrelatedIncludeArgs,
  CorrelatedFilterQuery,
  SupplementalIncludeOptions,
  WithCorrelatedOutputs,
} from '@web-ts-toolkit/access-router-client';

void [
  createAdapter,
  parentField,
  CorrelatedIncludeError,
  ModelService,
  DataService,
  Service,
  Model,
  ServiceError,
  MissingPersistenceIdentityError,
  wrapLazyPromise,
  CustomHeaders,
  replaceItemById,
  removeItemById,
];

type StablePublicTypes = [
  AdapterOptions,
  ModelServiceOptions,
  DataServiceOptions,
  CacheController,
  CachePartitioner,
  Response<unknown>,
  SuccessResult<unknown>,
  FailureResult,
  ModelResponse<Document>,
  ArrayModelResponse<Document>,
  ListModelResponse<Document>,
  ModelData<Document>,
  DataResponse<unknown>,
  ArrayDataResponse<unknown>,
  ListDataResponse<unknown>,
  SubDocumentResponse<unknown>,
  SubDocumentListResponse<unknown>,
  Defaults,
  DataDefaults,
  FilterQuery<Document>,
  ModelMutationInput<Document>,
  SubDocumentMutationInput<{ label: string }>,
  DottedPathFilter<Document>,
  ServerSideCast<Document>,
  Projection,
  Populate,
  Sort,
  Document,
  ParentRef,
  CorrelatedInclude<string, unknown, CorrelatedIncludeOp>,
  CorrelatedIncludeOp,
  CorrelatedIncludeArgs,
  CorrelatedFilterQuery<Document>,
  SupplementalIncludeOptions<Document>,
  WithCorrelatedOutputs<Document, []>,
];
void (null as unknown as StablePublicTypes);
```

The names above are the primary public imports most consumers need. Invalid
service defaults throw `UnsupportedServiceDefaultValueError` (defined in
`src/services/shared.ts`; not re-exported from the package root, so it is not
part of the import example above). The full
root export inventory is locked by `access-router-client.exports.unit.test.ts`
and mirrored in `llms.txt`, so implementation internals
such as `useCacheInterceptors`, `cloneConfigWithCacheBypass`,
`finalizeRootEntry`, `applyGroupCallbacks`, `makeRequest`, `createWrapHelper`,
`ADAPTER_ID_KEY`, `STARTED_KEY`, `CACHE_HEADER`, `CachePolicy`, and `RootEntry`
are intentionally not exported. Configure caching through `AdapterOptions`
(`cacheTTL`, `cachePartition`, `cacheCapacity`); control an existing cache
through the returned adapter's `clearCache()` and `disposeCache()` methods.

## Optional fields and ordered params example

The server may omit `nickname`; ordinary assignment still tracks it. The
caller-owned `params` retains both `mode` entries in order, while generated
service options take precedence on their own keys.

```ts
import { createAdapter } from '@web-ts-toolkit/access-router-client';

type User = { _id?: string; name: string; nickname?: string };
const adapter = createAdapter({ baseURL: 'http://localhost:3000/api' });
const users = adapter.createModelService<User>({ modelName: 'User', basePath: 'users' });
const params = new URLSearchParams('mode=second&mode=first');
const result = await users.read('user-1', { includePermissions: true }, { params });

if (result.success) {
  result.data.nickname = 'Ada';
  await result.data.save();
}
```

## Basic model calls with optional args

Basic model lists accept `list(args?, options?, config?)` and
`list(options?, config?)`. Reads accept `read(id, args?, options?, config?)`
and the existing `read(id, options?, config?)` form. Updates accept
`update(id, data, args?, options?, config?)` and the existing
`update(id, data, options?, config?)` form. `select` and list `sort` belong in args;
`includeCount`, `includePermissions`, `tryList`, and `ignoreCache` belong in
the method's options. Headers, timeouts, and `throwOnError` belong in config.

```ts
import { createAdapter } from '@web-ts-toolkit/access-router-client';

type User = { _id?: string; name: string; role: string };
const adapter = createAdapter({ baseURL: 'http://localhost:3000/api' });
const users = adapter.createModelService<User>({ modelName: 'User', basePath: 'users' });

// Skip args without an undefined placeholder.
const counted = await users.list({ includeCount: true });
const timedList = await users.list({ includeCount: true }, { timeout: 5000 });

// Full args/options/config form for projection, sorting, and pagination.
const selectedList = await users.list(
  { select: ['name'], sort: '-name', limit: 10 },
  { includePermissions: true },
  { timeout: 5000 },
);
const selectedRead = await users.read('user-1', { select: ['name'] }, { includePermissions: true }, { timeout: 5000 });

// Read's existing options/config form still works.
const read = await users.read('user-1', { tryList: false }, { timeout: 5000 });
void [counted, timedList, selectedList, selectedRead, read];

// Plain updates accept `select` in args, sent as a PATCH `?select=` value,
// mirroring plain reads (useful with `requireExplicitSelect` on the server).
const selectedUpdate = await users.update(
  'user-1',
  { role: 'owner' },
  { select: ['name'] },
  { returningAll: true },
  { timeout: 5000 },
);

// Update's existing options/config form still works.
const updated = await users.update('user-1', { role: 'owner' }, { returningAll: false }, { timeout: 5000 });
void [selectedUpdate, updated];
```

Skipping args still applies `defaults.listArgs` / `defaults.readArgs`; supplied
args override those defaults. Both forms return typed lazy requests with
`.exec()`, grouping, and `$include()` support. Basic `select` is sent as a GET
query parameter, and the original projection is retained for grouped requests
and correlated includes. Basic response types retain the existing `T`/explicit
`TData` contract; `select` does not infer a narrower result type.

Basic list `sort` accepts signed-field strings (`'name -createdAt'`),
field/order objects (`{ name: 1, createdAt: -1 }`), or ordered tuples
(`[['name', 'asc'], ['createdAt', 'desc']]`). Objects and tuples are serialized
to the same space-separated GET `sort` value, preserving priority and direction;
Axios URL-encodes it. Grouped requests and `$include()` retain the original sort
form. `defaults.listArgs.sort` applies when omitted, including options-only
calls. An explicit empty sort (`''`, `[]`, or `{}`) sends `sort=` and disables
backend default sorting. The server enforces list-field sort permissions,
including `sortableFields` and `stripDisallowedSort`.

The known args/options keys determine the form, even when a value is
`undefined`, `false`, or `0`. Mixing args and option keys in one object throws
`TypeError`; use separate arguments. Empty objects retain the original
interpretation (list: args first; read: options first). Supplying the final
config position explicitly selects the full form, so `list({}, {}, config)`
and `read(id, {}, {}, config)` preserve that config. The existing
`list(undefined, options, config)` form also remains available.

## Browser And Node Support

- **Bundle target:** `es2022` (see `tsup.config.ts`). The single shared target
  runs in Node 22+ and the documented evergreen browser floor without
  transpilation; the source imports no Node built-ins.
- **Runtime metadata:** `engines.node: ">=22"` (npm/pnpm warn or refuse on
  older Node) and `browserslist: ["chrome >= 94", "edge >= 94", "firefox >= 93", "safari >= 16"]`.
  `pnpm exec browserslist` resolves this package config without error.
- **Authentication contract:** `withCredentials: true` is the adapter
  default, so browser requests may include cookies when CORS and cookie policy
  allow them. `Authorization`, proxy authorization, API-key style headers, and
  Node `Cookie` headers are explicit Axios config values; `withCredentials`
  does not create them. Credentialed caching still requires an explicit
  `cachePartition` token so one identity cannot receive another's cached
  response.
- **Cache timers:** the in-memory cache uses `setTimeout`/`clearTimeout`
  (available in both runtimes). The optional Node `unref()` guard is
  feature-detected and is a no-op in browsers, so `clearCache()` and
  `disposeCache()` are safe to call in either runtime.
- **Smoke test:** `pnpm --filter @web-ts-toolkit/access-router-client
test:browser-smoke` (powered by Vite + jsdom) imports the _built_
  `dist/index.mjs` under a browser-like environment and exercises the public
  runtime surface. It is a smoke check for Node built-in leaks and basic ESM
  browser bundling, not a real-browser engine/version compatibility gate. This
  smoke test also runs as part of the default `pnpm test` for the package.

## Documentation

Full package documentation lives online (the website sources are not packed
into the npm tarball, so the links below point to the published website rather
than repository-relative paths that would not resolve after install):

- overview: https://web-ts-toolkit.pages.dev/docs/packages/access-router-client
- adapter: https://web-ts-toolkit.pages.dev/docs/packages/access-router-client/adapter
- services: https://web-ts-toolkit.pages.dev/docs/packages/access-router-client/services
- model wrapper: https://web-ts-toolkit.pages.dev/docs/packages/access-router-client/model
- typing and errors: https://web-ts-toolkit.pages.dev/docs/packages/access-router-client/typescript-and-errors
