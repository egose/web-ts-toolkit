# `@web-ts-toolkit/access-router-client`

Typed client utilities for `@web-ts-toolkit/access-router` APIs.

## Installation

```sh
pnpm add @web-ts-toolkit/access-router-client
```

## Highlights

- typed model and data services
- lazy requests that can be grouped into one batch call
- `Model<T>` wrappers with dirty tracking and `save()`
- normalized response and error handling around Axios

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

user.data.role = 'owner';
await user.data.save();

const grouped = await adapter.group(
  userService.readAdvanced('user-id-1', { select: ['name'] }),
  userService.countAdvanced({ role: 'admin' }),
);
```

## Main Exports

- `createAdapter(...)`
- `ModelService`
- `DataService`
- `Model`
- response and query helper types

## Documentation

Full package documentation lives in `website/docs/packages/access-router-client/`.

- overview: `website/docs/packages/access-router-client/index.md`
- adapter: `website/docs/packages/access-router-client/adapter.mdx`
- services: `website/docs/packages/access-router-client/services.mdx`
- model wrapper: `website/docs/packages/access-router-client/model.mdx`
- typing and errors: `website/docs/packages/access-router-client/typescript-and-errors.mdx`
