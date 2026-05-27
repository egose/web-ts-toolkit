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

user.data.role = 'owner';
await user.data.save();

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

Most service methods resolve to a normalized shape:

```ts
interface Response<TRaw, TData = TRaw> {
  success: boolean;
  raw: TRaw;
  data: TData;
  message: string;
  status: number;
  headers: Record<string, string>;
}
```

Common conventions:

- `success === true` means the HTTP request completed and the router operation succeeded
- `raw` holds the original payload after client-side normalization
- `data` holds higher-level client objects such as `Model<T>` wrappers for model reads
- `message` is populated for errors and is extracted from structured problem payloads when possible

For list-style responses:

- `totalCount` is present on list response types
- when the server returns count metadata, the client normalizes it into that field
- when count metadata is not requested, `totalCount` may be `0` or a fallback based on the route shape

### `Model<T>` wrappers

Model reads and writes return `Model<T>` instances instead of plain objects.

That wrapper provides:

- direct property access like `user.data.name`
- `assign(...)`, `get(...)`, and `set(...)`
- `isDirty(...)` and `markModified(...)`
- `save()` for create-or-update persistence
- `reset()` to restore the last loaded or persisted snapshot
- `toObject()` / `toJSON()` for safe cloning and serialization

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
