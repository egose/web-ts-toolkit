---
sidebar_label: Access Router React
sidebar_position: 3
---

# `@web-ts-toolkit/access-router-react`

React hooks for `@web-ts-toolkit/access-router-client` model services.

This package provides a `createModelHooks` factory that binds a `ModelService` to individual React hooks for each CRUD operation. Each hook manages its own loading, error, and data state.

## Installation

```bash npm2yarn
npm install react @web-ts-toolkit/access-router-react @web-ts-toolkit/access-router-client
```

Peer dependencies: `react ^18 || ^19` and `@web-ts-toolkit/access-router-client`.

## Quick Start

```tsx
import { createModelHooks } from '@web-ts-toolkit/access-router-react';
import { adapter } from './api';

// Create a model service
const organizationService = adapter.createModelService<Organization>({
  modelName: 'Organization',
  basePath: 'organizations',
});

// Generate hooks bound to that service
const { useReadModel, useListModel, useCreateModel, useUpdateModel, useDeleteModel } = createModelHooks({
  modelService: organizationService,
});

// Use in a component
function OrganizationList() {
  const { data, isLoading, error } = useListModel({
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

Creates an object with six hooks, each bound to the given `ModelService`. Call this **outside** your component to get stable hook references:

```tsx
const { useReadModel, useListModel, useCreateModel, useUpdateModel, useDeleteModel, useCountModel } = createModelHooks({
  modelService: organizationService,
});
```

The factory accepts:

| Property       | Type              | Description                                                   |
| -------------- | ----------------- | ------------------------------------------------------------- |
| `modelService` | `ModelService<T>` | A model service created via `adapter.createModelService(...)` |

## Hooks

### `useReadModel`

Fetches a single model by ID. Auto-fetches on mount when `id` is provided.

```tsx
const { data, isLoading, isFetching, error, readModel, refetch } = useReadModel({
  id: 'org_123',
  advanced: true,
  select: ['name', 'status'],
});
```

**Options:**

| Option        | Type                      | Default | Description                                       |
| ------------- | ------------------------- | ------- | ------------------------------------------------- |
| `id`          | `string`                  | —       | Model ID to fetch (triggers auto-fetch)           |
| `advanced`    | `boolean`                 | `false` | Use `readAdvanced` instead of `read`              |
| `select`      | `Projection`              | —       | Field projection for advanced reads               |
| `populate`    | `Populate[]`              | —       | Population config for advanced reads              |
| `enabled`     | `boolean`                 | `true`  | Set `false` to defer fetching                     |
| `initialData` | `T \| null`               | `null`  | Pre-populate data without loading                 |
| `onCompleted` | `(result) => void`        | —       | Called after successful fetch                     |
| `onError`     | `(error) => void`         | —       | Called on fetch failure                           |
| `onSettled`   | `(result, error) => void` | —       | Called after fetch completes (success or failure) |

**Result:**

| Property     | Type                      | Description                               |
| ------------ | ------------------------- | ----------------------------------------- |
| `data`       | `(Model<T> & T) \| null`  | The fetched model (or `initialData`)      |
| `isLoading`  | `boolean`                 | `true` during auto-fetch on mount         |
| `isFetching` | `boolean`                 | `true` during any fetch (mount or manual) |
| `error`      | `ServiceError \| null`    | Last fetch error                          |
| `readModel`  | `(id: string) => Promise` | Manually fetch a model by ID              |
| `refetch`    | `() => void`              | Re-fetch the current model                |

---

### `useListModel`

Fetches a list of models. Auto-fetches on mount when `listParams` is provided.

```tsx
const { data, totalCount, previousData, isLoading, error, listModel, refetch } = useListModel({
  listParams: { pageSize: 20 },
  filter: { status: 'active' },
  advanced: true,
  sort: { name: 1 },
  keepPreviousData: true,
});
```

**Options:**

| Option             | Type                      | Default | Description                                             |
| ------------------ | ------------------------- | ------- | ------------------------------------------------------- |
| `listParams`       | `ListArgs`                | —       | Basic list params (`skip`, `limit`, `page`, `pageSize`) |
| `filter`           | `FilterQuery<T>`          | —       | Query filter (used with `advanced: true`)               |
| `advanced`         | `boolean`                 | `false` | Use `listAdvanced` instead of `list`                    |
| `sort`             | `Sort`                    | —       | Sort order for advanced lists                           |
| `select`           | `Projection`              | —       | Field projection for advanced lists                     |
| `populate`         | `Populate[]`              | —       | Population config for advanced lists                    |
| `enabled`          | `boolean`                 | `true`  | Set `false` to defer fetching                           |
| `keepPreviousData` | `boolean`                 | `false` | Preserve old data during refetch                        |
| `initialData`      | `(Model<T> & T)[]`        | `[]`    | Pre-populate data                                       |
| `onCompleted`      | `(result) => void`        | —       | Called after successful fetch                           |
| `onError`          | `(error) => void`         | —       | Called on fetch failure                                 |
| `onSettled`        | `(result, error) => void` | —       | Called after fetch completes                            |

**Result:**

| Property       | Type                            | Description                                     |
| -------------- | ------------------------------- | ----------------------------------------------- |
| `data`         | `(Model<T> & T)[]`              | The fetched models                              |
| `previousData` | `(Model<T> & T)[] \| undefined` | Previous data during `keepPreviousData` refetch |
| `totalCount`   | `number`                        | Server-reported total count                     |
| `isLoading`    | `boolean`                       | `true` during auto-fetch on mount               |
| `isFetching`   | `boolean`                       | `true` during any fetch                         |
| `error`        | `ServiceError \| null`          | Last fetch error                                |
| `listModel`    | `(args?: ListArgs) => Promise`  | Manually trigger a list fetch                   |
| `refetch`      | `() => void`                    | Re-fetch the current list                       |

---

### `useCreateModel`

Creates a new model. Does not auto-fetch — call `createModel` manually.

```tsx
const { data, isPending, error, createModel, reset } = useCreateOrg({
  onCreated: (result) => navigate(`/organizations/${result.raw._id}`),
});

// Trigger creation
await createModel({ name: 'New Organization' });
```

**Options:**

| Option      | Type                      | Default | Description                              |
| ----------- | ------------------------- | ------- | ---------------------------------------- |
| `advanced`  | `boolean`                 | `false` | Use `createAdvanced` instead of `create` |
| `select`    | `Projection`              | —       | Field projection for advanced creates    |
| `populate`  | `Populate[]`              | —       | Population config for advanced creates   |
| `onCreated` | `(result) => void`        | —       | Called after successful creation         |
| `onError`   | `(error) => void`         | —       | Called on creation failure               |
| `onSettled` | `(result, error) => void` | —       | Called after creation completes          |

**Result:**

| Property      | Type                        | Description                          |
| ------------- | --------------------------- | ------------------------------------ |
| `data`        | `(Model<T> & T) \| null`    | The created model                    |
| `isPending`   | `boolean`                   | `true` while creation is in progress |
| `error`       | `ServiceError \| null`      | Creation error                       |
| `createModel` | `(data: object) => Promise` | Trigger model creation               |
| `reset`       | `() => void`                | Clear data and error state           |

---

### `useUpdateModel`

Updates an existing model. Does not auto-fetch — call `updateModel` manually.

```tsx
const { data, isPending, error, updateModel, reset } = useUpdateOrg({
  onUpdated: () => queryClient.invalidateQueries({ queryKey: ['workspace'] }),
});

await updateModel('org_123', { name: 'Renamed' });
```

**Options:**

| Option      | Type                      | Default | Description                              |
| ----------- | ------------------------- | ------- | ---------------------------------------- |
| `advanced`  | `boolean`                 | `false` | Use `updateAdvanced` instead of `update` |
| `select`    | `Projection`              | —       | Field projection for advanced updates    |
| `populate`  | `Populate[]`              | —       | Population config for advanced updates   |
| `onUpdated` | `(result) => void`        | —       | Called after successful update           |
| `onError`   | `(error) => void`         | —       | Called on update failure                 |
| `onSettled` | `(result, error) => void` | —       | Called after update completes            |

**Result:**

| Property      | Type                                    | Description                        |
| ------------- | --------------------------------------- | ---------------------------------- |
| `data`        | `(Model<T> & T) \| null`                | The updated model                  |
| `isPending`   | `boolean`                               | `true` while update is in progress |
| `error`       | `ServiceError \| null`                  | Update error                       |
| `updateModel` | `(id: string, data: object) => Promise` | Trigger model update               |
| `reset`       | `() => void`                            | Clear data and error state         |

---

### `useDeleteModel`

Deletes a model. Does not auto-fetch — call `deleteModel` manually.

```tsx
const { isPending, error, deleteModel, reset } = useDeleteMember({
  onDeleted: () => queryClient.invalidateQueries({ queryKey: ['workspace'] }),
});

await deleteModel('mem_456');
```

**Options:**

| Option      | Type                      | Default | Description                      |
| ----------- | ------------------------- | ------- | -------------------------------- |
| `onDeleted` | `(result) => void`        | —       | Called after successful deletion |
| `onError`   | `(error) => void`         | —       | Called on deletion failure       |
| `onSettled` | `(result, error) => void` | —       | Called after deletion completes  |

**Result:**

| Property      | Type                      | Description                          |
| ------------- | ------------------------- | ------------------------------------ |
| `isPending`   | `boolean`                 | `true` while deletion is in progress |
| `error`       | `ServiceError \| null`    | Deletion error                       |
| `deleteModel` | `(id: string) => Promise` | Trigger model deletion               |
| `reset`       | `() => void`              | Clear error state                    |

---

### `useCountModel`

Fetches a count of models. Auto-fetches on mount.

```tsx
const { data, isLoading, error, countModel, refetch } = useCountModel({
  advanced: true,
  filter: { status: 'active' },
});
// data === 42
```

**Options:**

| Option        | Type                      | Default | Description                            |
| ------------- | ------------------------- | ------- | -------------------------------------- |
| `advanced`    | `boolean`                 | `false` | Use `countAdvanced` instead of `count` |
| `filter`      | `FilterQuery<T>`          | —       | Filter for advanced count              |
| `enabled`     | `boolean`                 | `true`  | Set `false` to defer fetching          |
| `onCompleted` | `(result) => void`        | —       | Called after successful fetch          |
| `onError`     | `(error) => void`         | —       | Called on fetch failure                |
| `onSettled`   | `(result, error) => void` | —       | Called after fetch completes           |

**Result:**

| Property     | Type                   | Description              |
| ------------ | ---------------------- | ------------------------ |
| `data`       | `number \| null`       | The count value          |
| `isLoading`  | `boolean`              | `true` during auto-fetch |
| `error`      | `ServiceError \| null` | Fetch error              |
| `countModel` | `() => Promise`        | Manually trigger count   |
| `refetch`    | `() => void`           | Re-fetch the count       |

## Active Record Integration

Data from `useListModel` and `useReadModel` returns `Model<T>` instances with dirty tracking. You can update models directly without a dedicated mutation hook:

```tsx
const { models, refetch } = useListModel({ listParams: { organizationId } });

const handleRename = async (memberId: string, newName: string) => {
  const member = models.find((m) => m._id === memberId);
  if (!member) return;

  member.fullName = newName;
  const result = await member.save();

  if (result.success) {
    await refetch();
  }
};
```

`model.save()` automatically sends only the changed fields (`PATCH`) for existing documents, or all fields (`POST`) for new ones.

This pattern is best for **inline edits on data already loaded in the list**. Use `useCreateModel` / `useUpdateModel` / `useDeleteModel` when you need structured pending/error state or are creating new models that don't exist in any loaded list.

## Hybrid Architecture with React Query

These hooks handle **model CRUD**. For queries that don't map to a single model service, keep `@tanstack/react-query`:

| Use Case                                      | Tool                                     |
| --------------------------------------------- | ---------------------------------------- |
| Model create/update/delete                    | `access-router-react` hooks              |
| Inline edits on loaded models                 | Active record (`model.save()`)           |
| Batched / grouped queries (`adapter.group()`) | `react-query` `useQuery` directly        |
| Auth / session management                     | `react-query` `useQuery` / `useMutation` |
| Cache invalidation after mutations            | `queryClient.invalidateQueries()`        |

```tsx
// After a mutation, invalidate react-query cached data
const createOrg = useCreateOrg({
  onCreated: async () => {
    await queryClient.invalidateQueries({ queryKey: ['workspace'] });
  },
});
```
