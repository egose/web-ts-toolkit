---
sidebar_label: Overview
sidebar_position: 1
---

# `@web-ts-toolkit/access-router-client`

Typed Axios-based client utilities for `@web-ts-toolkit/access-router` model routers, data routers, and root batch routes.

This package is designed to mirror the request contract exposed by [`@web-ts-toolkit/access-router`](../access-router/):

- model routers become `ModelService<T>` instances
- data routers become `DataService<T>` instances
- root-router batching becomes `adapter.group(...)`
- model responses become mutable `Model<T>` wrappers with `save()`, `reset()`, and dirty tracking

## Supported Runtimes

The package is officially supported in **Node 22+** and **modern evergreen
browsers** (Chrome 94+, Edge 94+, Firefox 93+, Safari 16+):

- `package.json` `engines.node: ">=22"` — npm/pnpm warn or refuse on older Node
- `package.json` `browserslist: ["chrome >= 94", "edge >= 94", "firefox >= 93", "safari >= 16"]` — bundlers narrow to the same browser floor
- `tsup.config.ts` ships the bundle at the `es2022` syntax intersection of
  both runtimes; the source imports no Node built-ins, so the same
  `dist/index.mjs` and `dist/index.js` run in either environment
- `withCredentials: true` is the adapter default; in the browser this permits
  cookie credentials when CORS and cookie policy allow them. Authorization,
  API-key style headers, and Node `Cookie` headers are explicit Axios config
  values; see [Cache Controls](./adapter#cache-controls) for credentialed cache partitioning. The cache's `setTimeout`/`clearTimeout` and feature-detected
  `unref()` guard work in both runtimes.
- `pnpm --filter @web-ts-toolkit/access-router-client test:browser-smoke`
  runs a jsdom + Vite smoke test against the _built_ `dist/index.mjs` and
  fails if a Node built-in leaks into the bundle. This is a browser-like smoke
  check, not a real-browser engine/version compatibility gate.

## Relationship To The Server

`access-router-client` is not a generic REST SDK generator.

It assumes the server follows the conventions from `@web-ts-toolkit/access-router`, including:

- model routes mounted at a known `basePath`
- data routes mounted at a known `basePath`
- advanced query routes mounted under a query segment such as `__query`
- advanced mutation routes mounted under a mutation segment such as `__mutation`
- optional root batching mounted under a root route such as `/api/root`

If the server uses custom route segments, configure the client to match them exactly.

## Installation

```bash npm2yarn
npm install @web-ts-toolkit/access-router-client
```

```bash
pnpm add @web-ts-toolkit/access-router-client
```

## Unreleased Migration

The remediation release changes several consumer-visible contracts:

- subdocuments are plain data; use parent-scoped helper mutations and read
  `SubDocumentListResponse.count`, not `Model.save()` or `totalCount`
- subdocument create always returns an array; model create preserves object
  versus array input cardinality
- `Response` is discriminated by `success`; failure `data` is `null`
- caching remains off at `cacheTTL: 0`; enabled caches are supported-GET-only,
  credential-partitioned, and bounded to 100 LRU entries by default
- each lazy request can execute directly or in one group, never both; grouped
  requests require one effective `throwOnError` policy
- data services no longer accept permission options or non-string sorts, and
  `countAdvanced` is `countAdvanced(filter, config?)`
- strict filters require deliberate `DottedPathFilter` / `ServerSideCast`
  escape hatches for dynamic paths or server-side casting
- dynamic path values are encoded once, caller configs remain immutable, and
  missing persistence identity on an existing projected model throws
  `MissingPersistenceIdentityError` instead of creating a duplicate

See the installed package README and repository `CHANGELOG.md` for the full
before/after migration table.

## What It Exposes

Main entrypoint:

- `createAdapter(...)`
- `ModelService`
- `DataService`
- `Model`
- response and query helper types from `./types`

## Quick Start

```ts
import { createAdapter } from '@web-ts-toolkit/access-router-client';

interface User {
  _id?: string;
  name: string;
  role: string;
  public: boolean;
}

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

## Typical Workflow

In practice, a common client flow looks like this:

1. create one adapter per API origin
2. create one service per router you care about
3. read documents into `Model<T>` wrappers
4. mutate the wrapper locally
5. persist with `save()` or call explicit service methods
6. use `group(...)` when several `access-router` requests should share one round trip

## Core Concepts

### Lazy requests

Service methods return promise-like lazy requests.

- the request does not execute until you `await`, `.then()`, `.catch()`, `.finally()`, or call `.exec()`
- lazy requests carry internal metadata that `adapter.group(...)` uses to build a root batch request
- grouped requests must come from this client package, not from raw Axios calls

### Response shape

Most service methods resolve to a discriminated response union:

```ts
interface SuccessResult<TRaw, TData = TRaw> {
  success: true;
  raw: TRaw;
  data: TData;
  message: string;
  status: number;
  headers: Record<string, string>;
}

interface FailureResult<TError = unknown> {
  success: false;
  raw: TError | null;
  data: null;
  message: string;
  status: number;
  headers: Record<string, string>;
}

type Response<TRaw, TData = TRaw, TError = unknown> = SuccessResult<TRaw, TData> | FailureResult<TError>;
```

Common conventions:

- `success === true` means the HTTP request completed and the router operation succeeded
- on the `success: true` branch, `raw` and `data` are non-null
- on the `success: false` branch, `data` is always `null`; `raw` is `unknown` by default or an opt-in `TError` payload, and `message` is extracted from structured problem payloads when possible
- branch on `result.success` to narrow `raw`/`data` to their successful shapes or to the documented error payload
- `raw` holds the original payload after client-side normalization
- `data` holds higher-level client objects such as `Model<T>` wrappers for model reads

For list-style responses:

- `totalCount` is present on model list response types (`ListModelResponse<T>`); for subdocument list responses (`SubDocumentListResponse<S>`), the sibling server emits `count` instead, and that type carries `count` (not `totalCount`)
- model/data list failures initialize `totalCount: 0`; subdocument callers
  should narrow on `success` before reading the successful list's `count`
- when the server returns count metadata, the client normalizes it into the appropriate field
- when count metadata is not requested, the count field may be `0` or a fallback based on the route shape

### `Model<T>` wrappers

Model reads and writes return `Model<T>` instances instead of plain objects.

That wrapper provides:

- direct property access like `user.data.name` for non-reserved field names
- `assign(...)`, `get(...)`, and `set(...)`
- `isDirty(...)` and `markModified(...)`
- `save()` for create-or-update persistence
- `reset()` to restore the last loaded or persisted snapshot
- `toObject()` / `toJSON()` for safe cloning and serialization

Fields named like wrapper methods (`save`, `reset`, `set`, `get`, `assign`, `toJSON`, etc.) are reserved on direct property access. Use `get(...)`, `set(...)`, `assign(...)`, or `toObject()` for those data fields. Overlapping `save()` calls on the same wrapper are serialized in call order.

## Package Guide

- [Adapter And Setup](./adapter): configuring `createAdapter(...)`, batching, wrapping arbitrary endpoints, and cache behavior
- [Services](./services): `ModelService` and `DataService` methods, defaults, subqueries, and subdocuments
- [Model](./model): dirty tracking, save/reset behavior, path-based updates, and collision handling
- [TypeScript And Errors](./typescript-and-errors): typed selects, response typing, and `ServiceError`

## Routing Notes

- model and data service requests use the router paths you configure in `basePath`
- grouped `adapter.group(...)` requests target the root router path, which defaults to `root`
- if your root router uses another path, pass `rootRouterPath` as the second `createAdapter(...)` argument
- custom query or mutation route segments must match the server-side `queryRouteSegment` and mutation route configuration

### Common path mapping

Typical server/client alignment looks like this:

```ts
// server
runtime.createRouter('User', {
  basePath: '/api/users',
  queryRouteSegment: '__query',
});

// client
const adapter = createAdapter({ baseURL: 'http://localhost:3000/api' });

const userService = adapter.createModelService({
  modelName: 'User',
  basePath: 'users',
  queryPath: '__query',
});
```

The client `basePath` is relative to the adapter `baseURL`, not the full server path.

## When To Use It

Use `access-router-client` when you want:

- a typed client over `access-router` model or data routes
- model instances that can be mutated locally and persisted with `save()`
- root batched requests through `adapter.group(...)`
- a consistent error contract without hand-writing Axios wrappers

If you only need HTTP requests and do not use `access-router`, plain Axios is usually simpler.

## Related Packages

- [`@web-ts-toolkit/access-router`](../access-router)
- [`@web-ts-toolkit/access-router-react`](../access-router-react)
- [`@web-ts-toolkit/access-router-runtime`](../access-router-runtime)
