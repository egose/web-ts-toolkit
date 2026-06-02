---
sidebar_label: Access Router React
sidebar_position: 3
---

# `@web-ts-toolkit/access-router-react`

React hooks for `@web-ts-toolkit/access-router-client` model services.

This package provides a `createModelHooks` factory that binds one `ModelService` to eight hooks covering query and mutation flows.

## Installation

```bash npm2yarn
npm install react @web-ts-toolkit/access-router-react @web-ts-toolkit/access-router-client
```

Peer dependencies: `react ^18 || ^19` and `@web-ts-toolkit/access-router-client`.

## Quick Start

```tsx
import { createModelHooks } from '@web-ts-toolkit/access-router-react';
import { adapter } from './api';

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

## Factory

### `createModelHooks({ modelService })`

Call the factory once, outside your components, and reuse the returned hooks.

```tsx
const { useRead, useList, useCreate, useUpdate, useUpsert, useDelete, useCount, useDistinct } = createModelHooks({
  modelService: organizationService,
});
```

The factory accepts one property:

| Property       | Type              | Description                                                  |
| -------------- | ----------------- | ------------------------------------------------------------ |
| `modelService` | `ModelService<T>` | A model service created by `adapter.createModelService(...)` |

## Naming Convention

The current API uses:

- verb-based hook names: `useRead`, `useList`, `useCreate`, `useUpdate`, `useUpsert`, `useDelete`, `useCount`, `useDistinct`
- `query(...)` for query hooks
- `mutate(...)` for mutation hooks

That keeps the React surface consistent even though the underlying client methods still map to read, list, create, update, upsert, delete, count, and distinct operations.

## Query Hooks

### `useRead`

Fetches one model by ID.

```tsx
const { data, isLoading, isFetching, error, query, refetch, reset } = useRead({
  id: 'org_123',
  advanced: true,
  select: ['name', 'status'],
});
```

Important options:

- `id` controls auto-fetching
- `advanced: true` switches to `readAdvanced(...)`
- `select`, `populate`, `sort`, `include`, and `tasks` are forwarded to advanced reads
- `basicOptions`, `advancedOptions`, `enabled`, `initialData`, `requestConfig`, `onSuccess`, `onError`, and `onSettled` control request behavior

### `useList`

Fetches a list of models.

```tsx
const { data, totalCount, previousData, isLoading, isFetching, error, query, refetch, reset } = useList({
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
- `keepPreviousData` preserves the last resolved list during refetch
- `sort`, `select`, `populate`, `include`, `tasks`, `basicOptions`, and `advancedOptions` map directly to client service arguments

### `useCount`

Fetches a count.

```tsx
const { data, isLoading, error, query, refetch, reset } = useCount({
  advanced: true,
  filter: { status: 'active' },
});
```

Use `advanced: true` when you need a filtered count.

### `useDistinct`

Fetches distinct values for a field.

```tsx
const { data, isLoading, error, query, refetch, reset } = useDistinct({
  field: 'status',
  conditions: { organizationId: 'org_123' },
});
```

If `conditions` is empty, the hook falls back to the basic `distinct(...)` route.

## Mutation Hooks

### `useCreate`

Creates a document.

```tsx
const { data, isPending, error, mutate, reset } = useCreate({
  advanced: true,
  select: ['_id', 'name'],
});

await mutate({ name: 'Northwind Labs' });
```

### `useUpdate`

Updates a document by ID.

```tsx
const { data, isPending, error, mutate } = useUpdate();

await mutate('org_123', { status: 'active' });
```

### `useUpsert`

Creates or updates, depending on the server-side upsert result.

```tsx
const { data, isPending, error, mutate } = useUpsert();

await mutate({ _id: 'org_123', name: 'Northwind Labs' });
```

### `useDelete`

Deletes a document by ID.

```tsx
const { isPending, error, mutate } = useDelete();

await mutate('org_123');
```

Shared mutation behavior:

- `advanced: true` switches to the corresponding advanced client method when available
- `mutate(...)` performs the request
- `isPending` tracks in-flight state
- `reset()` clears local hook state
- `onSuccess`, `onError`, and `onSettled` are available on every mutation hook

`useCreate`, `useUpdate`, and `useUpsert` also expose `data` with the last returned `Model<T>`.

## Result Summary

### `useRead` and `useList`

- `data`
- `isLoading`
- `isFetching`
- `error`
- `query(...)`
- `refetch()`
- `reset()`

### `useCount` and `useDistinct`

- `data`
- `isLoading`
- `error`
- `query()`
- `refetch()`
- `reset()`

### `useCreate`, `useUpdate`, `useUpsert`

- `data`
- `isPending`
- `error`
- `mutate(...)`
- `reset()`

### `useDelete`

- `isPending`
- `error`
- `mutate(id)`
- `reset()`

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

- These hooks do not implement shared caching, deduping, or invalidation.
- They are thin stateful wrappers over `ModelService` from `@web-ts-toolkit/access-router-client`.
- `requestConfig` is forwarded to the underlying client request and can include headers, `signal`, and transport-specific options.
- If you need cache orchestration, use these services underneath a query library.
