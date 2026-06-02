# `@web-ts-toolkit/utils`

Shared collection, object, async, and URL helpers used across the workspace.

## Installation

```sh
pnpm add @web-ts-toolkit/utils
```

## Highlights

- object-path helpers such as `get(...)` and `set(...)`
- collection helpers such as `map(...)`, `filter(...)`, `uniq(...)`, and `orderBy(...)`
- small type guards
- URL helpers such as `normalizeUrlPath(...)`
- async helpers such as `mapValuesAsync(...)`

## Quick Start

```ts
import { get, set, normalizeUrlPath, parseBooleanString } from '@web-ts-toolkit/utils';

const payload = {
  user: {
    profile: {
      name: 'Ada',
    },
  },
};

get(payload, 'user.profile.name');
set(payload, 'user.profile.role', 'admin');
normalizeUrlPath('api//users');
parseBooleanString('true', false);
```

## Main Exports

- object helpers: `get`, `set`, `pick`, `omit`, `assign`, `cloneDeep`
- collection helpers: `map`, `filter`, `reduce`, `find`, `flatten`, `uniq`, `orderBy`
- guards: `isArray`, `isPlainObject`, `isString`, `isPromise`
- URL helpers: `addLeadingSlash`, `removeConsecutiveSlashesFromUrl`, `normalizeUrlPath`

## Documentation

Full package documentation lives in `website/docs/packages/utils.md`.

- live docs: https://web-ts-toolkit.pages.dev/docs/packages/utils
