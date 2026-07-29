# `@web-ts-toolkit/utils`

Shared collection, object, async, and URL helpers used across the workspace.

## Installation

```sh
pnpm add @web-ts-toolkit/utils
```

## Highlights

- object-path helpers such as `get(...)`, `set(...)`, and `hasOwn(...)`
- collection helpers such as `map(...)`, `filter(...)`, `uniq(...)`, `uniqBy(...)`, and `orderBy(...)`
- small type guards
- URL helpers such as `normalizeUrlPath(...)`
- async helpers such as `mapValuesAsync(...)`

## Quick Start

```ts
import {
  get,
  groupBy,
  hasOwn,
  normalizeUrlPath,
  parseBooleanString,
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
hasOwn(payload.user.profile, 'name');
groupBy(
  [
    { type: 'fruit', name: 'apple' },
    { type: 'fruit', name: 'banana' },
    { type: 'vegetable', name: 'carrot' },
  ],
  'type',
);
uniqBy(
  [
    { id: 'a', name: 'Ada' },
    { id: 'a', name: 'Ada Lovelace' },
    { id: 'b', name: 'Grace' },
  ],
  'id',
);
startCase('api_response_time');
sumBy([{ hours: 2 }, { hours: 3 }], 'hours');
normalizeUrlPath('api//users');
parseBooleanString('true', false);
```

## Main Exports

- object helpers: `get`, `set`, `hasOwn`, `pick`, `pickBy`, `omit`, `omitBy`, `assign`, `cloneDeep`, `mapKeys`
- collection helpers: `map`, `filter`, `reduce`, `find`, `flatten`, `uniq`, `uniqBy`, `orderBy`, `groupBy`, `sum`, `sumBy`
- string helpers: `startCase`, `upperCase`
- guards: `isArray`, `isPlainObject`, `isString`, `isPromise`
- URL helpers: `addLeadingSlash`, `removeConsecutiveSlashesFromUrl`, `normalizeUrlPath`

## Documentation

Full package documentation lives in `website/docs/packages/utils.md`.

- live docs: https://web-ts-toolkit.pages.dev/docs/packages/utils
