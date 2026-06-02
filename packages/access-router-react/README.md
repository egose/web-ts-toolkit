# `@web-ts-toolkit/access-router-react`

React hooks for `@web-ts-toolkit/access-router-client` model services.

## Installation

```sh
pnpm add @web-ts-toolkit/access-router-react @web-ts-toolkit/access-router-client react
```

Peer dependencies:

- `react ^18 || ^19`
- `@web-ts-toolkit/access-router-client`

## Highlights

- `createModelHooks(...)` factory bound to one `ModelService`
- query hooks for read, list, count, and distinct
- mutation hooks for create, update, upsert, and delete
- local request state with `isLoading`, `isFetching`, `isPending`, and `error`

## Quick Start

```tsx
import { createModelHooks } from '@web-ts-toolkit/access-router-react';

const organizationService = adapter.createModelService<Organization>({
  modelName: 'Organization',
  basePath: 'organizations',
});

const { useList, useCreate } = createModelHooks({
  modelService: organizationService,
});

function OrganizationList() {
  const { data, isLoading } = useList({
    listParams: { pageSize: 20 },
  });

  const { mutate, isPending } = useCreate();

  if (isLoading) return <p>Loading...</p>;

  return (
    <div>
      <button disabled={isPending} onClick={() => mutate({ name: 'Northwind Labs' })}>
        Create
      </button>
      <ul>
        {data.map((org) => (
          <li key={org._id}>{org.name}</li>
        ))}
      </ul>
    </div>
  );
}
```

## Main Exports

- `createModelHooks(...)`
- hook option and result types such as `UseReadQueryOptions` and `UseCreateMutateResult`

## Documentation

Full package documentation lives in `website/docs/packages/access-router-react.md`.
