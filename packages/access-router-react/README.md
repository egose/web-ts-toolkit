# `@web-ts-toolkit/access-router-react`

React hooks for `@web-ts-toolkit/access-router-client` model services.

`createModelHooks({ modelService })` binds one `ModelService` to eight hooks covering read, list, count, distinct, create, update, upsert, and delete. Each hook instance owns its own local state — there is **no shared cache, no deduplication, no invalidation, and no retry**. Two components calling `useRead({ id: '1' })` against the same `ModelService` issue two independent requests and store two independent copies of the result. If you need cache orchestration, layer these services underneath a query library.

## Installation

```sh
pnpm add @web-ts-toolkit/access-router-react @web-ts-toolkit/access-router-client react
```

Peer dependencies:

- `react ^18 || ^19` — verified by a React 18 lane in this package's own test suite (React 19 remains the primary lane)
- `@web-ts-toolkit/access-router-client`

Published builds target `ES2022`. Direct Node consumers should use Node `>=20`; browser apps can bundle the package as long as their toolchain supports ES2022 output.

## Factory

```ts
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

Call the factory once, outside any component, with a `ModelService<T>` from `adapter.createModelService<T>({ modelName, basePath })`. The returned hooks are bound to that one service for their lifetime; do not call `createModelHooks` inside a component (it would re-create the hooks on every render and discard their state).

`Organization` is your own model interface extending the client's `Document`:

```ts
import type { Document } from '@web-ts-toolkit/access-router-client';

interface Organization extends Document {
  _id?: string;
  name: string;
  status?: 'active' | 'archived';
}
```

## Quick Start

```tsx
function OrganizationList() {
  const { data, isLoading, error } = useList({
    listParams: { pageSize: 20 },
  });

  const { mutate, isPending, error: createError, reset } = useCreate();

  if (isLoading) return <p>Loading...</p>;
  if (error) return <p>Error: {error.message}</p>;

  return (
    <div>
      <button disabled={isPending} onClick={() => mutate({ name: 'Northwind Labs' })}>
        Create
      </button>
      {createError && <p role="alert">Create failed: {createError.message}</p>}
      <button onClick={reset}>Clear create error</button>

      <ul>
        {data.map((org) => (
          <li key={org._id}>{org.name}</li>
        ))}
      </ul>
    </div>
  );
}
```

## Query Hooks

`useRead`, `useList`, `useCount`, and `useDistinct` auto-fetch when their `enabled` flag is true (the default) and the key inputs are present (`id` for `useRead`, `listParams` or `advanced` for `useList`, `field` for `useDistinct`). They each expose `query(...)`, `refetch()`, and `reset()` alongside the result state.

### `useRead`

```tsx
const { data, isLoading, isFetching, error, query, refetch, reset } = useRead({
  id: 'org_123',
  advanced: true,
  select: ['name', 'status'] as const,
  onSuccess: (result) => console.log(result.data?.name),
  onSettled: (result, err) => console.log({ result, err }),
});
```

- `id` controls auto-fetching. Set `enabled: false` (or remove `id`) to disable.
- `advanced: true` switches to `readAdvanced(...)`, which forwards `select`, `populate`, `sort`, `include`, and `tasks`.
- `onSuccess`, `onError`, and `onSettled` are invocation observers and are **not** part of the effect dependency key; re-rendering a parent with a fresh inline arrow every render does not refetch (see Dependency-Key Policy below).
- `query(id, { signal })` re-runs the read imperatively; `refetch()` re-runs with the current options. Both return a promise that resolves with the response or rejects with a `ServiceError` on failure.

### `useList`

```tsx
const { data, previousData, totalCount, isLoading, isFetching, error, query, refetch, reset } = useList({
  listParams: { pageSize: 20 },
  filter: { status: 'active' },
  advanced: true,
  sort: { name: 1 },
  select: ['name', 'status'] as const,
  keepPreviousData: true,
});
```

- `listParams` drives basic lists; `filter` drives advanced lists. Set `advanced: true` to use the advanced route.
- `sort`, `select`, `populate`, `include`, `tasks`, `basicOptions`, and `advancedOptions` map directly to the client service arguments.
- `previousData` exposes the last settled list while a replacement request is in flight, but **only** when `keepPreviousData: true` is set and the hook has produced at least one previously settled result. See the Lifecycle section for the full clear-path rules.

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
const { data, error } = useDistinct({
  field: 'status',
  conditions: { organizationId: 'org_123' },
});
```

If `conditions` is empty or omitted, the hook falls back to the basic `distinct(...)` route.

## Mutation Hooks

`useCreate`, `useUpdate`, `useUpsert`, and `useDelete` expose `mutate(...)`, `isPending`, `error`, and `reset()`. The first three also expose `data` (the last returned projected model). Each `mutate(...)` call returns a promise that resolves the response, or rejects with a `ServiceError` on failure. Mutation input types are inferred from the bound `ModelService<T, TCreateInput, TUpdateInput, TUpsertInput>` generics. `useCreate().mutate(...)` is intentionally single-record-only and rejects array input; call `modelService.create([...])` directly when you need bulk create.

### `useCreate`

```tsx
const { data, isPending, error, mutate, reset } = useCreate({
  advanced: true,
  select: ['_id', 'name'] as const,
  onSuccess: (result) => console.log('created', result.data?._id),
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
- See the Concurrent Mutations section for `isPending` overlap semantics and the Lifecycle section for `reset` semantics.
- `onSuccess`, `onError`, and `onSettled` fire per invocation regardless of overlap. Per-invocation observer isolation means a superseded mutation still receives its own `onSuccess` for its own result; it simply cannot overwrite a newer invocation's exposed `data`/`error` (see Concurrent Mutations).

## Lifecycle

The hooks share one unified query lifecycle and one unified mutation lifecycle.

### Loading flags

- `isFetching` is true while **any** query request is in flight.
- `isLoading` is true only while no settled data exists for this hook instance. Once the first successful response lands, subsequent `refetch()` calls set `isFetching` but not `isLoading`, so you can distinguish background fetches from the first load.
- `isPending` (mutations) is true while **any** mutation invocation is in flight — overlapping mutations keep `isPending` true until the active count reaches zero.

### Failure handling

A resolved `success: false` response is treated as a hook-level failure. The hooks never invoke `onSuccess` for a failed response, never populate `data` with a failure payload, and surface a `ServiceError` carrying `message`, `status`, `raw`, and `headers` via `error`, `onError`, and the rejected `mutate`/`query`/`refetch` promise. A thrown `onSuccess`/`onError`/`onSettled` callback is rethrown asynchronously as an uncaught microtask and never converts a successful request into a hook-level error.

```tsx
function FailureExample() {
  const { data, error, refetch } = useRead({
    id: 'org_404',
    onError: (svcErr) => console.error('query failed', svcErr.status, svcErr.message),
  });

  const { mutate, reset } = useCreate({
    onError: (svcErr) => console.error('create failed', svcErr.message),
  });

  async function retryCreate() {
    try {
      await mutate({ name: '' });
    } catch (svcErr) {
      console.error('create rejected', (svcErr as Error).message);
      reset();
    }
  }

  void data;
  void refetch;
  void retryCreate;
}
```

### Cancellation

A dependency change, `query()`/`refetch()` invocation, or unmount aborts the in-flight request and replaces it. Cancellation is authoritative: an aborted request never writes `error`, never fires `onError` or `onSettled`, and converges `isLoading`/`isFetching`/`isPending` to false. The hooks decide cancellation on `signal.aborted` rather than `instanceof DOMException`, so axios `CanceledError`, `Error('Canceled')` with `code: 'ERR_CANCELED'`, or any other transport-specific cancellation shape is handled uniformly.

For manual `query()` calls, pass `{ signal }` to compose a caller signal with the hook's `requestConfig.signal` and internal controller. Aborting any source cancels the effective request.

```tsx
const controller = new AbortController();
const pending = query('org_123', { signal: controller.signal });
controller.abort(); // cancels the in-flight manual request while it is still pending

try {
  await pending;
} catch (error) {
  console.error('manual query cancelled', error);
}
```

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
    const [firstResult, secondResult] = await Promise.all([
      mutate('org_1', { name: 'A' }),
      mutate('org_1', { name: 'B' }),
    ]);
    // Promise.all preserves invocation order. Hook state still follows the latest invocation.
    console.log(firstResult.data?.name, secondResult.data?.name);
    return secondResult.data;
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
  select: ['name', 'status'] as const,
});

if (data) {
  const name: string = data.name; // definitely present
  const status: string | undefined = data.status; // selected, still T[key] | undefined
  const id: string | undefined = data._id; // omitted-key reads as possibly undefined
}
```

Acceptable `select` forms:

```ts
select: ['name', 'status'] as const,      // literal tuple (recommended)
select: 'name',                            // literal string
select: { name: 1, age: -1 },              // projection-shaped object
```

The narrowing is applied uniformly to `data`, `onSuccess(result)`/`onSettled(result, …)` callbacks, manual `query()`/`refetch()` response payloads, and mutation `mutate()` return promises — via the public `ProjectedShape`, `ProjectedShapeArray`, `ProjectedModelResponse`, and `ProjectedListModelResponse` helpers, which reuse the client's `SelectedKeys` utility.

A literal `select` requires `advanced: true` to actually reach the server's narrowing code path; the basic `read`/`list`/`create`/etc. APIs do not forward `select`. The type still narrows when you supply a literal `select` without `advanced`, but the wire payload is unchanged — you opt into the narrowed type and accept responsibility for forwarding it down the advanced path.

## Dependency-Key Policy

The query hooks build one structural key from every request-affecting option and use that key as the React effect dependency. Inline array/object literals at the call site are safe: two `select: ['name']` arrays written at every render produce the same key, so they do not trigger an extra refetch. `Date` compares by instant (`d:<.getTime()>`) and never collides with an ISO-string filter that happens to look like the date. `requestKeyFor` throws a documented `RequestKeyError`; query hooks catch that, rethrow a plain `Error` with the original `RequestKeyError` in `cause`, and interrupt render before any auto-fetch effect runs. Unsupported values include `bigint`, `function`, `symbol` (and symbol-keyed properties), cycles, accessor properties, and built-in instances such as `RegExp`, `Map`, `Set`, `URL`, `Error`, or non-`Object.prototype` class instances. `Date` and `Object.create(null)` are supported. You can import the helper to construct or validate keys yourself:

```ts
import { requestKeyFor, RequestKeyError } from '@web-ts-toolkit/access-router-react';

const key = requestKeyFor({ filter: { status: 'active', since: new Date('2026-01-01') } });

declare const someUserSuppliedFilter: unknown;

try {
  requestKeyFor(someUserSuppliedFilter);
} catch (e) {
  if (e instanceof RequestKeyError) {
    // handle an unsupported value before passing it to a query hook
  }
}
```

## Main Exports

- `createModelHooks(...)` — the factory.
- Hooks returned by the factory: `useRead`, `useList`, `useCreate`, `useUpdate`, `useUpsert`, `useDelete`, `useCount`, `useDistinct`.
- Hook option and result types: `UseBaseOptions`, `UseReadQueryOptions`/`UseReadQueryResult`, `UseListQueryOptions`/`UseListQueryResult`, `UseCreateMutateOptions`/`UseCreateMutateResult`, `UseUpdateMutateOptions`/`UseUpdateMutateResult`, `UseUpsertMutateOptions`/`UseUpsertMutateResult`, `UseDeleteMutateOptions`/`UseDeleteMutateResult`, `UseCountQueryOptions`/`UseCountQueryResult`, `UseDistinctQueryOptions`/`UseDistinctQueryResult`.
- `RequestConfig`, `QueryCallOptions`.
- `requestKeyFor(value)` and `RequestKeyError` — the public dependency-key helper.
- Projection-aware result helpers: `ProjectedShape`, `ProjectedShapeArray`, `ProjectedModelResponse`, `ProjectedListModelResponse`.

## Notes

- These hooks do not implement shared caching, deduplication, invalidation, retry, or background revalidation. They are thin stateful wrappers over `ModelService` from `@web-ts-toolkit/access-router-client`. If you need cache orchestration, use these services underneath a query library.
- `requestConfig` is forwarded to the underlying client request via a fresh shallow copy on every request; the caller's `requestConfig` object, its `headers`, and other fields are not mutated. `requestConfig.signal` is composed with the caller-supplied `query()` `options.signal` and the hook-owned controller signal, and that one effective signal is used for both transport cancellation and hook settlement classification. Replacing only `requestConfig.signal` does not trigger an automatic refetch.

## Documentation

Full package documentation lives in `website/docs/packages/access-router-react.md`.

- live docs: https://web-ts-toolkit.pages.dev/docs/packages/access-router-react
