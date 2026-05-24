# @web-ts-toolkit/access-router-client

`@web-ts-toolkit/access-router-client` is a TypeScript/JavaScript client for `@web-ts-toolkit/access-router` APIs.

## Installation

```sh
npm install @web-ts-toolkit/access-router-client
```

```sh
pnpm add @web-ts-toolkit/access-router-client
```

## Usage

```ts
import { createAdapter } from '@web-ts-toolkit/access-router-client';

const adapter = createAdapter({
  baseURL: 'http://localhost:3000/api',
});

const userService = adapter.createModelService<{ _id?: string; name: string; role: string }>({
  modelName: 'User',
  basePath: 'users',
});

const listResponse = await userService.listAdvanced(
  { role: 'admin' },
  { select: ['name', 'role'], limit: 10 },
  { includeCount: true },
);

const grouped = await adapter.group(
  userService.readAdvanced('user-id-1', { select: ['name'] }),
  userService.countAdvanced({ role: 'admin' }),
);
```

Notes:

- model and data service requests use the router paths you configure in `basePath`
- grouped `adapter.group(...)` requests target the root router path, which defaults to `root`
- if your root router uses another path, pass `rootRouterPath` as the second `createAdapter(...)` argument
