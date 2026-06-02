---
sidebar_label: Utils
sidebar_position: 8
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

- object helpers: `get`, `set`, `pick`, `omit`, `assign`, `cloneDeep`, `keys`, `toStringRecord`
- array and collection helpers: `map`, `filter`, `reduce`, `find`, `forEach`, `flatten`, `flattenDeep`, `compact`, `uniq`, `difference`, `intersection`, `intersectionBy`, `orderBy`
- type guards: `isArray`, `isBoolean`, `isEmpty`, `isEqual`, `isFunction`, `isMatch`, `isNaN`, `isNil`, `isNumber`, `isObject`, `isPlainObject`, `isPromise`, `isString`, `isUndefined`
- URL helpers: `addLeadingSlash`, `removeConsecutiveSlashesFromUrl`, `normalizeUrlPath`
- async helpers: `mapValuesAsync`, `toAsyncFn`
- misc helpers: `castArray`, `arrayToRecord`, `mapValues`, `noop`, `padEnd`, `parseBooleanString`

## Quick Start

```ts
import { get, set, normalizeUrlPath, orderBy, parseBooleanString } from '@web-ts-toolkit/utils';

const payload = {
  user: {
    profile: {
      name: 'Ada',
    },
  },
};

get(payload, 'user.profile.name');
set(payload, 'user.profile.role', 'admin');

normalizeUrlPath('api//users/42');
parseBooleanString('true', false);

orderBy(
  [
    { name: 'B', score: 2 },
    { name: 'A', score: 2 },
    { name: 'C', score: 1 },
  ],
  ['score', 'name'],
  ['desc', 'asc'],
);
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

## When To Use It

Use `@web-ts-toolkit/utils` when you want small shared helpers without pulling in a larger utility library.

If you only need one or two language-level operations, native JavaScript is usually simpler.
