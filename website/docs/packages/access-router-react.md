---
sidebar_label: Access Router React
sidebar_position: 12
---

# `@web-ts-toolkit/access-router-react`

React hooks for `@web-ts-toolkit/access-router-client` model services.

`createModelHooks(modelService)` binds one `ModelService` to eight hooks covering read, list, count, distinct, create, update, upsert, and delete. Each hook instance owns its own local state — there is **no shared cache, no deduplication, no invalidation, and no retry**. Two components calling `useRead({ id: '1' })` against the same `ModelService` issue two independent requests and store two independent copies of the result. If you need cache orchestration, layer these services underneath a query library.

## Installation

```bash npm2yarn
npm install react @web-ts-toolkit/access-router-react @web-ts-toolkit/access-router-client
```

Peer dependencies: `react ^18 || ^19` and `@web-ts-toolkit/access-router-client`. The package's own test suite runs a React 18 verification lane alongside the React 19 primary lane. Published builds target `ES2022`; direct Node consumers should use Node `>=20`, while browser apps can bundle the package with an ES2022-capable toolchain.

## Factory

```tsx
import { createAdapter } from '@web-ts-toolkit/access-router-client';
import { createModelHooks } from '@web-ts-toolkit/access-router-react';

const adapter = createAdapter({ baseURL: 'https://api.example.com' });

const organizationService = adapter.createModelService<Organization>({
  modelName: 'Organization',
  basePath: 'organizations',
});

const { useRead, useList, useCount, useDistinct, useCreate, useUpdate, useUpsert, useDelete } = createModelHooks({
  modelService: organizationService,
});
```

Call `createModelHooks` once, outside any component, with a `ModelService<T>` from `adapter.createModelService<T>({ modelName, basePath })`. The returned hooks are bound to that one service for their lifetime; do not call the factory inside a component. `Organization` is your own model interface extending the client's `Document`.

## What It Exposes

- `createModelHooks(...)` — the factory.
- query hooks: `useRead`, `useList`, `useCount`, `useDistinct`
- mutation hooks: `useCreate`, `useUpdate`, `useUpsert`, `useDelete`
- hook option and result types for the query and mutation APIs (e.g. `UseReadQueryOptions`, `UseCreateMutateResult`)
- `requestKeyFor(value)` and `RequestKeyError` — the public dependency-key helper
- projection-aware result helpers: `ProjectedShape`, `ProjectedShapeArray`, `ProjectedModelResponse`, `ProjectedListModelResponse`

## Quick Start

```tsx
import { createAdapter } from '@web-ts-toolkit/access-router-client';
import { createModelHooks } from '@web-ts-toolkit/access-router-react';

const adapter = createAdapter({ baseURL: 'https://api.example.com' });

const organizationService = adapter.createModelService<Organization>({
  modelName: 'Organization',
  basePath: 'organizations',
});

const { useList, useRead, useCreate, useUpdate, useDelete } = createModelHooks({
  modelService: organizationService,
});

function OrganizationList() {
  const { data, isLoading, error } = useList({
    listParams: { pageSize: 20 },
  });

  if (isLoading) return <p>Loading...</p>;
  if (error) return <p>Error: {error.message}</p>;

  return (
    <ul>
      {data.map((org) => (
        <li key={org._id}>{org.name}</li>
      ))}
    </ul>
  );
}
```

## Query Hooks

`useRead`, `useList`, `useCount`, and `useDistinct` auto-fetch when their `enabled` flag is true (the default) and the key inputs are present. They each expose `query(...)`, `refetch()`, and `reset()` alongside the result state.

### `useRead`

```tsx
const { data, isLoading, isFetching, error, query, refetch, reset } = useRead({
  id: 'org_123',
  advanced: true,
  select: ['name', 'status'],
});
```

Important options:

- `id` controls auto-fetching. Set `enabled: false` (or remove `id`) to disable.
- `advanced: true` switches to `readAdvanced(...)`, which forwards `select`, `populate`, `sort`, `include`, and `tasks`.
- `basicOptions`, `advancedOptions`, `enabled`, `initialData`, `requestConfig`, `onSuccess`, `onError`, and `onSettled` control request behavior.
- `query(id, { signal })` re-runs the read imperatively; `refetch()` re-runs with the current options. Both return a promise that rejects with a `ServiceError` on failure.

### `useList`

```tsx
const { data, previousData, totalCount, isLoading, isFetching, error, query, refetch, reset } = useList({
  listParams: { pageSize: 20 },
  filter: { status: 'active' },
  advanced: true,
  sort: { name: 1 },
  keepPreviousData: true,
});
```

Important options:

- `listParams` drives basic list requests
- `filter` is used for advanced lists
- `keepPreviousData` preserves the last resolved list during a replacement request (see the Lifecycle section for the full capture/clear rules)
- `sort`, `select`, `populate`, `include`, `tasks`, `basicOptions`, and `advancedOptions` map directly to client service arguments

### `useCount`

```tsx
const { data, isLoading, error, query, refetch, reset } = useCount({
  advanced: true,
  filter: { status: 'active' },
});
```

Use `advanced: true` when you need a filtered count.

### `useDistinct`

```tsx
const { data, isLoading, error, query, refetch, reset } = useDistinct({
  field: 'status',
  conditions: { organizationId: 'org_123' },
});
```

If `conditions` is empty, the hook falls back to the basic `distinct(...)` route.

## Mutation Hooks

`useCreate`, `useUpdate`, `useUpsert`, and `useDelete` expose `mutate(...)`, `isPending`, `error`, and `reset()`. The first three also expose `data` (the last returned projected model). Each `mutate(...)` call returns a promise that resolves the response, or rejects with a `ServiceError` on failure. Mutation input types are inferred from the bound `ModelService<T, TCreateInput, TUpdateInput, TUpsertInput>` generics. `useCreate().mutate(...)` is intentionally single-record-only and rejects array input; call `modelService.create([...])` directly when you need bulk create.

### `useCreate`

```tsx
const { data, isPending, error, mutate, reset } = useCreate({
  advanced: true,
  select: ['_id', 'name'],
});

await mutate({ name: 'Northwind Labs' });
```

### `useUpdate`

```tsx
const { data, isPending, error, mutate } = useUpdate();

await mutate('org_123', { status: 'active' });
```

### `useUpsert`

```tsx
const { data, isPending, error, mutate } = useUpsert();

await mutate({ _id: 'org_123', name: 'Northwind Labs' });
```

### `useDelete`

```tsx
const { isPending, error, mutate } = useDelete();

await mutate('org_123');
```

Shared mutation behavior:

- `advanced: true` switches to the corresponding advanced client method when available.
- `mutate(...)` performs the request and returns an awaitable promise.
- `isPending` is true while **any** invocation is in flight (see Concurrent Mutations).
- `reset()`, `onSuccess`, `onError`, and `onSettled` are available on every mutation hook (see Lifecycle).

## Lifecycle

The hooks share one unified query lifecycle and one unified mutation lifecycle.

### Loading flags

- `isFetching` is true while **any** query request is in flight.
- `isLoading` is true only while no settled data exists for this hook instance. Once the first successful response lands, subsequent `refetch()` calls set `isFetching` but not `isLoading`, so you can distinguish background fetches from the first load.
- `isPending` (mutations) is true while **any** mutation invocation is in flight — overlapping mutations keep `isPending` true until the active count reaches zero.

### Failure handling

A resolved `success: false` response is treated as a hook-level failure. The hooks never invoke `onSuccess` for a failed response, never populate `data` with a failure payload, and surface a `ServiceError` carrying `message`, `status`, `raw`, and `headers` via `error`, `onError`, and the rejected `mutate`/`query`/`refetch` promise. A thrown `onSuccess`/`onError`/`onSettled` callback is rethrown asynchronously as an uncaught microtask and never converts a successful request into a hook-level error.

### Cancellation

A dependency change, `query()`/`refetch()` invocation, or unmount aborts the in-flight request and replaces it. Cancellation is authoritative: an aborted request never writes `error`, never fires `onError` or `onSettled`, and converges `isLoading`/`isFetching`/`isPending` to false. The hooks decide cancellation on `signal.aborted` rather than `instanceof DOMException`, so axios `CanceledError`, `Error('Canceled')` with `code: 'ERR_CANCELED'`, or any other transport-specific cancellation shape is handled uniformly.

```tsx
const controller = new AbortController();
const result = await query('org_123', { signal: controller.signal });
controller.abort(); // cancels the in-flight manual request
```

The hook's `requestConfig.signal` is composed with the per-call `query()` `options.signal` and the hook-owned controller signal, then forwarded to the underlying client request via a fresh shallow copy of `requestConfig`. That one effective signal also drives hook-side cancellation classification after resolve/reject. Aborting any source cancels the effective request; the caller's `requestConfig` object, its `headers`, and other fields are not mutated.

### `previousData` lifecycle (`useList` only)

`previousData` is opt-in via `keepPreviousData: true`. When enabled:

- Captured at the **start** of a replacement request, **only if** the hook has previously produced at least one settled list response (the first request has nothing to preserve).
- Cleared on every terminal path: success (`applyResult`), failure (`onFailed`), abort (`onAborted`), disable / id-removed (`onDisabled`), and `reset()`.
- The first request after a `reset()` is again treated as "no prior settlement" — `hasSettled` is cleared on reset — so the next pending request does not capture stale state.

### `reset()`

`reset()` is a synchronous state-clear, not a cancellation:

- Query `reset()` clears `data`/`error`/`isLoading`/`isFetching` (and `previousData` for `useList`) and invalidates the current query owner's right to publish settlement. A pre-reset success, failure, rejection, or abort may still finish at the transport layer, but it is stale for hook state and callbacks.
- Mutation `reset()` clears `data`/`error` and bumps the latest-invocation token. Any already-running mutation loses its claim on the shared `data`/`error` state — when it later settles, its per-invocation `onSuccess`/`onSettled` still fire, but it cannot repopulate the cleared `data`/`error`. `isPending` remains true until the active count reaches zero; `reset` does not implicitly cancel.

After query `reset()`, `isFetching` reflects authoritative hook activity, not physical transport activity, so it becomes false immediately even if the abandoned request is still finishing underneath. If you need to cancel an in-flight query, drop `id`/`listParams` or set `enabled: false` rather than calling `reset`.

### `refetch()` and `query()`

Both reuse the unified lifecycle: shared `isLoading`/`isFetching`/`error` writes, shared callback observers, shared abort manager. They return an awaitable promise that resolves with the response or rejects with the `ServiceError`. A trailing `.catch` suppression lets fire-and-forget callers skip `await` without leaking an unhandled rejection.

## Concurrent Mutations

A mutation hook may be invoked more than once in flight — a caller clicking "Save" twice, a list-reordering UI firing two updates, a retry button hit before the first attempt finishes. The contract:

- **Active-count `isPending`**: `isPending` is true while **any** invocation is in flight and stays true until the active count reaches zero. The first invocation's `finally` cannot clear `isPending` while a second is still pending.
- **Latest-invocation-wins for `data` and `error`**: an older invocation that settles after a newer one started (out-of-order completion) still resolves its own promise and fires its own `onSuccess`/`onSettled` observers, but cannot overwrite the newer invocation's already-written `data` or `error`.
- **No implicit cancellation**: a newer invocation does **not** abort an older one; they settle independently. The hook truthfully reports `isPending === true` until every pending mutation completes.

```tsx
function Save() {
  const { mutate, isPending } = useUpdate({ advanced: true, select: ['name'] as const });

  const saveTwice = async () => {
    const [second] = await Promise.all([mutate('org_1', { name: 'A' }), mutate('org_1', { name: 'B' })]);
    // `second.data` reflects whoever settled last as the latest-invocation.
    return second.data;
  };

  return (
    <button disabled={isPending} onClick={saveTwice}>
      Save twice
    </button>
  );
}
```

## Projection Typing

`useRead`, `useList`, `useCreate`, `useUpdate`, and `useUpsert` accept a literal `select`:

```tsx
const { data } = useRead({
  id: 'org_123',
  advanced: true,
  select: ['name', 'status'],
});

if (data) {
  const name: string = data.name;
  const status: string | undefined = data.status;
  const id: string | undefined = data._id;
}
```

A literal `select` narrows `data`, `onSuccess(result)`/`onSettled(result, …)` callbacks, manual `query()`/`refetch()` response payloads, and mutation `mutate()` return promises uniformly. Acceptable `select` forms: a literal tuple (`['name', 'status'] as const`, recommended), a literal string (`'name'`), or a `{ name: 1; age: -1 }` object. Omitted properties become `T[key] | undefined` rather than definitely-present. A literal `select` requires `advanced: true` to actually reach the server's narrowing code path; the basic `read`/`list`/`create`/etc. APIs do not forward `select`.

## Dependency-Key Policy

The query hooks (`useRead`, `useList`, `useCount`, `useDistinct`) build one canonical structural key from every request-affecting option and use that key as the React effect dependency. The policy guarantees the documented historical bug classes — refetch loops from inline array literals, missing `requestConfig` headers triggering or not triggering a request, `Date` vs ISO-string collisions — cannot recur.

### What participates in the key

- Plain structural inputs — `id`, `field`, `advanced`, `enabled`, `listParams`, `filter`, `sort`, `select`, `populate`, `include`, `tasks`, `basicOptions`, `advancedOptions`, and the full `requestConfig` object (including any authorization or tenant `headers`) — each become a deterministic string via `requestKeyFor`.
- Primitives (`id`, `field`, `enabled`, `advanced`) join the deps array directly.
- `Date` values compare by instant (`d:<.getTime()>`), never colliding with an ISO-string filter that happens to look like the date.
- Inline array literals like `select: ['name', 'status']` are safe: writing them at the call site does NOT cause a refetch loop, even if React creates a new array identity every render. Two `select` arrays with the same shape produce the same key.
- A meaningful structural change triggers exactly one replacement request, aborting the previous in-flight request via the hooks' owner-id / `signal.aborted` policy.

### What is NOT a key input

- Callback identity (`onSuccess`, `onError`, `onSettled`) is **not** part of the effect dependencies. The hooks wrap each callback in a stable invoker (the standard React "useEvent" pattern) so the latest underlying callback fires at settlement time without making callback identity churn trigger a network request. Re-rendering a parent with a fresh arrow expression every render is safe.
- `initialData` and `keepPreviousData` participate only as primitive boolean / data shape values, not as structural request inputs.

### Unsupported values

If `requestKeyFor` encounters a value it cannot represent deterministically, it throws a documented `RequestKeyError` (re-thrown by the hook as an `Error` with `cause` set to the original `RequestKeyError`). The hook's React lifecycle interrupts the render so the auto-effect never runs with an unsound key. The categories are:

- **`bigint`** — silently losing precision is unsafe; convert to a `number` or `string` before passing to a query hook.
- **`function`** — callback identity is unstable by design; the request contract requires structural data.
- **`symbol`** (including symbol-keyed object properties) — `JSON.stringify` silently drops symbols, which would collide with an object that has no such key.
- **Cycles** (direct, indirect, or array) — recursion is caught via a `WeakSet` stack and rejected explicitly.
- **Accessor properties** (getters/setters) — a getter would fire during dep-key construction. `requestKeyFor` checks `Object.getOwnPropertyDescriptor` and rejects before any getter runs.
- **Built-in instances** (`RegExp`, `Map`, `Set`, `URL`, `Error`, and class instances whose prototype is not `Object.prototype` or `null`) — pass their plain-data representation (a URL string, a sorted array of entries, an `{}` literal) to the query hook instead.

`Date` and `Object.create(null)` plain objects are supported.

### Importing the helper

Downstream consumers that want to inspect or build keys themselves can import `requestKeyFor` and `RequestKeyError` directly from `@web-ts-toolkit/access-router-react`:

```ts
import { requestKeyFor, RequestKeyError } from '@web-ts-toolkit/access-router-react';

const key = requestKeyFor({ filter: { status: 'active', since: new Date('2026-01-01') } });

try {
  requestKeyFor(someUserSuppliedFilter);
} catch (e) {
  if (e instanceof RequestKeyError) {
    // handle the unsupported value
  }
}
```

## Active Record Integration

Data returned from `useList` and `useRead` is backed by `Model<T>` wrappers from `@web-ts-toolkit/access-router-client`.

That means you can edit loaded models directly and persist with `save()`:

```tsx
const { data, refetch } = useList({ listParams: { pageSize: 20 } });

async function rename(id: string, name: string) {
  const organization = data.find((entry) => entry._id === id);
  if (!organization) return;

  organization.name = name;
  const result = await organization.save();

  if (result.success) {
    refetch();
  }
}
```

Use explicit mutation hooks when you want local pending and error state around a specific workflow.

## Notes

- These hooks do **not** implement shared caching, deduplication, invalidation, retry, or background revalidation. They are thin stateful wrappers over `ModelService` from `@web-ts-toolkit/access-router-client`. If you need cache orchestration, use these services underneath a query library.
- `requestConfig` is forwarded to the underlying client request via a fresh shallow copy on every request; the caller's `requestConfig` object, its `headers`, and other fields are not mutated. `requestConfig.signal` is composed with the caller-supplied `query()` `options.signal` and the hook-owned controller signal, and that one effective signal is used for both transport cancellation and hook settlement classification. There is **no** way to bypass the hook's abort manager. Replacing only `requestConfig.signal` does not trigger an automatic refetch, but the latest signal is used for future query executions.

## Related Packages

- [`@web-ts-toolkit/access-router-client`](./access-router-client)
- [`@web-ts-toolkit/access-router`](./access-router)
