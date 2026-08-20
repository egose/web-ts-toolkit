---
sidebar_label: Utils
sidebar_position: 1
---

# `@web-ts-toolkit/utils`

Shared utility helpers used across the workspace.

This package contains small focused helpers for object-path access, array and record transforms, lightweight type guards, async mapping, and URL normalization. It is intentionally low-level.

## Installation

```bash npm2yarn
npm install @web-ts-toolkit/utils
```

## What It Exposes

The package exports individual functions from the root entrypoint, including:

- object helpers: `get`, `set`, `hasOwn`, `pick`, `pickBy`, `omit`, `omitBy`, `assign`, `cloneDeep`, `keys`, `toStringRecord`
- array and collection helpers: `map`, `filter`, `reduce`, `find`, `forEach`, `flatten`, `flattenDeep`, `compact`, `uniq`, `uniqBy`, `difference`, `intersection`, `intersectionBy`, `groupBy`, `sum`, `sumBy`, `orderBy`
- type guards: `isArray`, `isBoolean`, `isEmpty`, `isEqual`, `isFunction`, `isMatch`, `isNaN`, `isNil`, `isNumber`, `isObject`, `isPlainObject`, `isPromise`, `isString`, `isUndefined`
- URL helpers: `addLeadingSlash`, `removeConsecutiveSlashesFromUrl`, `normalizeUrlPath`
- async helpers: `mapValuesAsync`, `toAsyncFn`
- string helpers: `startCase`, `upperCase`
- misc helpers: `castArray`, `arrayToRecord`, `mapValues`, `mapKeys`, `noop`, `padEnd`, `parseBooleanString`

## Quick Start

```ts
import {
  get,
  groupBy,
  hasOwn,
  normalizeUrlPath,
  orderBy,
  parseBooleanString,
  set,
  startCase,
  sumBy,
  uniqBy,
} from '@web-ts-toolkit/utils';

const payload = {
  user: {
    profile: {
      name: 'Ada',
    },
  },
};

get(payload, 'user.profile.name');
set(payload, 'user.profile.role', 'admin');
hasOwn(payload.user.profile, 'name');

normalizeUrlPath('api//users/42');
parseBooleanString('true', false);

uniqBy(
  [
    { id: 'a', name: 'Ada' },
    { id: 'a', name: 'Ada Lovelace' },
    { id: 'b', name: 'Grace' },
  ],
  'id',
);

groupBy(
  [
    { type: 'fruit', name: 'apple' },
    { type: 'fruit', name: 'banana' },
    { type: 'vegetable', name: 'carrot' },
  ],
  'type',
);

orderBy(
  [
    { name: 'B', score: 2 },
    { name: 'A', score: 2 },
    { name: 'C', score: 1 },
  ],
  ['score', 'name'],
  ['desc', 'asc'],
);

startCase('api_response_time');
sumBy([{ hours: 2 }, { hours: 3 }], 'hours');
```

## Common Use Cases

### Object-path reads and writes

```ts
import { get, set } from '@web-ts-toolkit/utils';

const state = { filters: { status: 'active' } };

get(state, 'filters.status');
set(state, 'filters.page', 2);
```

### URL normalization

```ts
import { normalizeUrlPath } from '@web-ts-toolkit/utils';

normalizeUrlPath('api//users');
// '/api/users'
```

### Boolean query parsing

```ts
import { parseBooleanString } from '@web-ts-toolkit/utils';

parseBooleanString('true');
parseBooleanString('false');
parseBooleanString(undefined, true);
```

`parseBooleanString(str, defaultValue)` returns `true` only for the exact string `'true'`, returns `false` for any other defined string, and falls back to `defaultValue` when the input is `undefined`.

### Stable collection sorting

```ts
import { orderBy } from '@web-ts-toolkit/utils';

const sorted = orderBy(users, ['lastName', 'firstName'], ['asc', 'asc']);
```

### Grouping and totals

```ts
import { groupBy, sumBy } from '@web-ts-toolkit/utils';

const grouped = groupBy(
  [
    { team: 'api', hours: 3 },
    { team: 'api', hours: 5 },
    { team: 'web', hours: 2 },
  ],
  'team',
);

const totalHours = sumBy(grouped.api, 'hours');
```

### Async object mapping

```ts
import { mapValuesAsync } from '@web-ts-toolkit/utils';

const result = await mapValuesAsync(
  {
    users: '/api/users/count',
    projects: '/api/projects/count',
  },
  async (url) => {
    const response = await fetch(url);
    return await response.json();
  },
);
```

### String normalization helpers

```ts
import { startCase, upperCase } from '@web-ts-toolkit/utils';

startCase('api_response_time');
upperCase('build id');
```

### Filtering object records

```ts
import { omitBy } from '@web-ts-toolkit/utils';

const requestHeaders = omitBy(headers, (value) => value === undefined);
```

## When To Use It

Use `@web-ts-toolkit/utils` when you want small shared helpers without pulling in a larger utility library.

If you only need one or two language-level operations, native JavaScript is usually simpler.

## Related Packages

- [`@web-ts-toolkit/http-errors`](./http-errors)
- [`@web-ts-toolkit/moo`](./moo)
