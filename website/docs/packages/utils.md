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

`normalizeUrlPath` composes route-path fragments: it collapses every run
of slashes and prepends a leading slash. Inputs must be path fragments —
no scheme/host, query string, or fragment. Full URLs are out of domain
and are mangled rather than normalized
(`normalizeUrlPath('https://example.com//a')` yields
`'/https:/example.com/a'`). This is route-path composition, not WHATWG
URL normalization and not a security sanitizer.

### Boolean query parsing

```ts
import { parseBooleanString } from '@web-ts-toolkit/utils';

parseBooleanString('true');
parseBooleanString('false');
parseBooleanString('');
parseBooleanString(undefined, true);
```

`parseBooleanString(str, defaultValue)` returns `true` only for the exact
string `'true'`, returns `false` for any other non-empty string, and falls
back to `defaultValue` (which is `undefined` when omitted) when the input
is `undefined` or the empty string `''`. Note that an Express-style `?flag=`
query value parses to `''` and therefore yields the default, not `false`.

### Object-path rules

`get`, `set`, `pick`, and `omit` accept dot segments (`'a.b'`), bare
brackets (`'a[0]'`), quoted brackets (`'a["b.c"]'`), or segment arrays
(`['a', 'b']`). Key identity is literal (`'01'` ≠ `'1'`); only canonical
indices address array slots. Mutation segments `__proto__`,
`constructor`, and `prototype` are rejected before any write. Reads follow
the prototype chain; writes never traverse inherited containers (an
inherited member is shadowed with a new own container). In `pick`/`omit`,
a flat string array is a list of paths — pass a nested array for a single
segmented path (`pick(o, [['a', 'b']])`).

`set` mutates its target in place and returns it. `omit` never mutates its
input: it deep-clones first, then deletes from the clone. `assign` is a
thin wrapper over native `Object.assign`, not a hardened sanitizer.

### Clone and comparison domains

`cloneDeep`, `isEqual`, and `isMatch` share one bounded domain: primitives,
plain objects (plus `Object.create` graphs over plain ancestors),
arrays, `Date`, and `RegExp`. Functions and exotic values (`Map`/`Set`,
class instances) are opaque — nested occurrences are shared by reference
and distinct references are never equal; a top-level exotic root passed to
`cloneDeep` throws `TypeError`. Comparison uses own keys only
(`isMatch({}, { a: undefined })` is `false`).

### Async contracts

`toAsyncFn` lifts sync results into a promise but is not a full
async-function boundary: synchronous throws escape synchronously and
thenables pass through with identity preserved. `mapValuesAsync` runs all
callbacks eagerly with unbounded parallelism (`Promise.all`) — one
rejection rejects the whole call, with no concurrency limit or
cancellation.

### Stable collections and guards

`orderBy` is stable and never mutates its input; `uniq`/`uniqBy`,
`difference`, and the `intersection` family keep first occurrences without
mutating. `isBoolean`/`isNumber`/`isString` accept primitives only (boxed
instances return `false`). `flattenDeep` takes `unknown` (a non-array
yields `[]`); cyclic arrays throw `TypeError`.

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
