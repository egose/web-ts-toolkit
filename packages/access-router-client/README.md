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

| Area                                 | Before                                                                                                                         | After / required migration                                                                                                                                                                                                                                          |
| ------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Subdocuments                         | Results could expose parent-backed `Model<S>` values and `save()`.                                                             | Results are plain objects/arrays. Persist with the parent-scoped `subs(...)` helper's `update`, `create`, `bulkUpdate`, or `delete` methods.                                                                                                                        |
| Create and list counts               | Subdocument create looked scalar and subdocument lists used `totalCount`; model create was scalar-only.                        | Subdocument create accepts one or many and always returns the post-create array with `count`. Model create preserves input cardinality: object -> `ModelResponse`, array -> `ArrayModelResponse`. Model/data lists retain `totalCount`.                             |
| Responses                            | Failure `data` and success fields could not be narrowed reliably.                                                              | Branch on `result.success`. Success has non-null `raw`/`data`; failure has `data: null` and the problem payload in `raw`. Model/data `totalCount` defaults to `0` when metadata is unavailable; read subdocument `count` after success.                             |
| Cache                                | An enabled cache could be unbounded and credentialed requests did not require an explicit identity partition.                  | Cache is still off by default (`cacheTTL: 0`). Enabled caches admit supported GETs only, default to a 100-entry LRU, and require `cachePartition` for credentialed requests. Clear on identity changes and dispose on teardown.                                     |
| Grouping                             | A lazy request could be replayed or moved between direct and grouped execution; batch error policy could drift by entry.       | Each lazy request can be claimed once. Create a new request to execute again. All group members must share one effective `throwOnError` policy. Non-throwing batches return all entries; throwing batches run all callbacks and then reject with the first failure. |
| Protocol types                       | Data permission options, object/tuple data sorts, and a count access argument were accepted. Filters were broadly permissive.  | Remove `includePermissions` from data calls, use string data sorts, call `countAdvanced(filter, config?)`, and fix invalid `FilterQuery<T>` values. Use `DottedPathFilter<T>` or `ServerSideCast<T>` only as explicit escape hatches.                               |
| Paths, config, and model persistence | Dynamic path values were interpolated directly, inputs could be mutated, and projected models could lose persistence identity. | Pass raw path values for one-pass encoding; caller configs stay immutable. ID-based projected reads retain identity, while an existing model with no recoverable identity throws `MissingPersistenceIdentityError`. Use `set()`/`markModified()` for nested edits.  |

Grouped entry `headers` are now `{}` because the root protocol has no
per-operation headers. Structured grouped failure fields remain in `raw`.
The complete release-level before/after record is in the repository
`CHANGELOG.md`.

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
  Sensitive headers (`authorization`, `cookie`, `set-cookie`,
  `proxy-authorization`, `www-authenticate`) are excluded from cache keys
  regardless of the partition token. Only GET requests with supported JSON or
  text response semantics are cached; mutations and custom transforms or
  serializers always bypass caching. `cacheTTL: 0` (the default) disables the
  cache entirely, while enabled caches retain at most 100 entries by default.
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
- **Nested model edits:** `Model<T>` tracks modified top-level paths and
  reconciles writes against the last loaded/saved snapshot. Direct mutation
  of nested objects/arrays (`obj.arr.push(...)`, `obj.sub.field = x`) is
  **not** tracked. Use `set('path.to.field', value)` (applies + reconciles)
  or `markModified('topLevelField')` after a direct mutation (forces dirty
  without reconciling). Reverting a value to its snapshot clears the dirty
  flag. `save()` persists only tracked modified top-level fields; if `_id`
  exists it calls `update(...)`, otherwise it calls `create(...)`.
- **Supported runtimes:** Node 22+ and modern evergreen browsers (see
  [Supported Runtimes](#supported-runtimes) and
  [Browser And Node Support](#browser-and-node-support) above).

## Main Exports

The package is named-export-only (no default export). Import every public
symbol from the package root:

```ts
import {
  // Adapter factory — the primary entry point.
  createAdapter,
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
  // Lazy-promise wrapper with non-enumerable metadata and a single
  // shared execution. Used internally by service methods; exported so
  // consumers can build compatible lazy promises for custom batches.
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
  DottedPathFilter,
  ServerSideCast,
  Projection,
  Populate,
  Sort,
  Document,
} from '@web-ts-toolkit/access-router-client';

void [
  createAdapter,
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
  DataResponse<unknown>,
  ArrayDataResponse<unknown>,
  ListDataResponse<unknown>,
  SubDocumentResponse<unknown>,
  SubDocumentListResponse<unknown>,
  Defaults,
  DataDefaults,
  FilterQuery<Document>,
  DottedPathFilter<Document>,
  ServerSideCast<Document>,
  Projection,
  Populate,
  Sort,
  Document,
];
void (null as unknown as StablePublicTypes);
```

Only the names above are part of the stable public surface. The package
ships a runtime export contract test (`access-router-client.exports.unit.test.ts`)
that fails on accidental additions or removals, so implementation internals
such as `useCacheInterceptors`, `cloneConfigWithCacheBypass`,
`finalizeRootEntry`, `applyGroupCallbacks`, `makeRequest`, `createWrapHelper`,
`ADAPTER_ID_KEY`, `STARTED_KEY`, `CACHE_HEADER`, `CachePolicy`, and `RootEntry`
are intentionally not exported. Configure caching through `AdapterOptions`
(`cacheTTL`, `cachePartition`, `cacheCapacity`); control an existing cache
through the returned adapter's `clearCache()` and `disposeCache()` methods.

## Browser And Node Support

- **Bundle target:** `es2022` (see `tsup.config.ts`). The single shared target
  runs in Node 22+ and all evergreen browsers without transpilation; the
  source imports no Node built-ins.
- **Runtime metadata:** `engines.node: ">=22"` (npm/pnpm warn or refuse on
  older Node) and `browserslist: ["supports es2022-module"]` (bundler tools
  narrow to the same matrix). Unsupported environments fail clearly via
  engine warnings rather than appearing accidentally supported.
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
  `dist/index.mjs` under a browser environment and exercises the public
  runtime surface. It fails if a Node built-in leaks into the bundle or the
  bundle emits syntax the declared `browserslist` floor cannot run. This
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
