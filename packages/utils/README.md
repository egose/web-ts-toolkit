# `@web-ts-toolkit/utils`

Shared collection, object, async, and URL helpers used across the workspace.

## Installation

```sh
pnpm add @web-ts-toolkit/utils
```

Requires Node `>=22`. Import from the package root with canonical named
imports; there is no default export and no public subpath:

```ts
import { get, normalizeUrlPath, parseBooleanString } from '@web-ts-toolkit/utils';
```

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
- collection helpers: `map`, `filter`, `eachRight`, `join`, `reduce`, `find`, `flatten`, `uniq`, `uniqBy`, `orderBy`, `groupBy`, `sum`, `sumBy`
- string helpers: `startCase`, `upperCase`
- guards: `isArray`, `isPlainObject`, `isString`, `isPromise`
- URL helpers: `addLeadingSlash`, `removeConsecutiveSlashesFromUrl`, `normalizeUrlPath`
- async helpers: `mapValuesAsync`, `toAsyncFn`
- misc: `castArray`, `arrayToRecord`, `mapValues`, `noop`, `padEnd`, `parseBooleanString`

## Path Grammar And Mutation Rules

`get`, `set`, `pick`, and `omit` accept a `PropertyPath`: dot segments
(`'a.b'`), bare brackets (`'a[0]'`), quoted brackets (`'a["b.c"]'`), or
segment arrays (`['a', 'b']`).

- Key identity is literal: string segments are never coerced, so `'01'`
  and `'1'` address different properties, and digit keys beyond
  `MAX_SAFE_INTEGER` never round. Only canonical indices (`'0'`, `'1'`,
  … with no leading zeros) address array slots; `'a[01]'` addresses an
  own `'01'` property. Empty quoted keys, escaped quotes, empty dot
  segments, and malformed brackets are unspecified (no Lodash parity).
- Mutation segments `__proto__`, `constructor`, and `prototype` (quoted
  or not) are rejected before any write: `set` returns its target
  unchanged and `omit`/`deletePath` are no-ops.
- In `pick`/`omit`, a flat string array is a **list** of paths
  (`pick(o, ['a', 'b'])` picks keys `a` and `b`); pass a nested array for
  a single segmented path (`pick(o, [['a', 'b']])` picks `a.b`).
- Reads follow the prototype chain; `get` returns `defaultValue` for a
  `null`/`undefined` intermediate or an `undefined` leaf. Writes never
  traverse inherited containers: an inherited member is shadowed with a
  new own container (array for a following canonical index, plain object
  otherwise) and the final write creates an own data property, bypassing
  inherited setters. Use `hasOwn` when own-key presence matters.
- Dictionary builders (`groupBy`, `arrayToRecord`, `mapKeys`,
  `mapValues`, `pickBy`, `omitBy`, `toStringRecord`) preserve arbitrary
  string keys — including `__proto__` — as own data properties without
  replacing the result prototype. Results keep `Object.prototype`
  (never null-prototype).

## Mutation Versus Copying

- `set` mutates its target in place and returns it. `omit` never mutates
  its input: it deep-clones first, then deletes from the clone.
- `assign` is a thin wrapper over native `Object.assign` (source getters
  and target setters run); it is not a hardened untrusted-input copier.
- `orderBy`, `uniq`/`uniqBy`, `difference`, the `intersection` family,
  and `flatten`/`flattenDeep` never mutate their inputs. Sorting and
  deduplication are stable/first-occurrence: ties keep input order and
  the first occurrence wins.

## Clone And Comparison Domains

`cloneDeep`, `isEqual`, and `isMatch` share one bounded domain:

- Supported: primitives (`NaN` equals itself), plain objects
  (`null`/`Object.prototype`, plus `Object.create` graphs over plain
  ancestors whose prototype is shared by reference), arrays (length,
  holes, and extra own keys participate), `Date` (by time), and `RegExp`
  (by source plus flags). Cycles and repeated references terminate and
  stay shared within the clone.
- Functions and exotic values (`Map`/`Set`, class instances such as BSON
  `ObjectId`) are opaque: nested occurrences are shared by reference,
  never traversed, and distinct references are never equal. A top-level
  exotic root passed to `cloneDeep` throws `TypeError` instead of
  returning an alias, so `omit` on an uncloneable root throws before
  deleting anything rather than deleting from your input.
- Comparison uses own enumerable string/symbol keys only: inherited
  state is ignored and prototypes are not compared. `isMatch` requires
  each own source key (including `undefined`-valued and symbol keys) to
  exist as an own key on the target, so `isMatch({}, { a: undefined })`
  is `false`; arrays use prefix semantics.

## Async Contracts

- `toAsyncFn` lifts sync results into a promise, but it is not a full
  async-function boundary: a synchronous `throw` escapes synchronously
  instead of becoming a rejection, and thenables (including foreign
  thenables) are returned unchanged with identity preserved rather than
  converted to native promises. When `fn` is absent, the wrapper resolves
  `defaultValue`. `this` is forwarded.
- `mapValuesAsync` starts every callback eagerly with unbounded
  parallelism (`Promise.all`): one rejection rejects the whole call, and
  there is no concurrency limit, cancellation, or scheduler. Chunk the
  input if downstream throttling is needed.

## Boolean Strings

```ts
import { parseBooleanString } from '@web-ts-toolkit/utils';

parseBooleanString('true'); // true
parseBooleanString('false'); // false
parseBooleanString('TRUE'); // false — exact match only, no case folding
parseBooleanString(''); // undefined — empty string falls back to the default
parseBooleanString('', false); // false — via the default
parseBooleanString(undefined, true); // true — missing input uses the default
```

`parseBooleanString(str, defaultValue)` returns `true` only for the exact
string `'true'`, returns `false` for any other non-empty string, and falls
back to `defaultValue` (which is `undefined` when omitted) when the input
is `undefined` **or the empty string `''`**. Note that an Express-style
`?flag=` query value parses to `''` and therefore yields the default, not
`false`.

## URL Paths Are Pathname-Only

```ts
import { normalizeUrlPath } from '@web-ts-toolkit/utils';

normalizeUrlPath('api//users'); // '/api/users'
normalizeUrlPath('api//users/42'); // '/api/users/42'
```

`normalizeUrlPath` composes route-path fragments: it collapses every run
of slashes and prepends a leading slash. The input must be a path
fragment — no scheme/host, query string, or fragment. Full URLs are out
of domain and are mangled rather than normalized
(`normalizeUrlPath('https://example.com//a')` yields
`'/https:/example.com/a'`; slash runs inside query/fragment values are
collapsed too). These helpers are route-path composition for workspace
routers, not WHATWG URL normalization and not a security sanitizer.

## Guards And Types

- `isBoolean`/`isNumber`/`isString` accept primitives only: boxed
  instances such as `new Boolean(false)` return `false` and are never
  narrowed to primitives.
- `flattenDeep<T>(input)` takes `unknown` (a non-array yields `[]`) and
  `T` is an unchecked caller assertion — specify it explicitly
  (`flattenDeep<number>(input)`) or narrow `unknown[]` yourself. Cyclic
  arrays throw `TypeError`; shared (non-ancestor) subarrays flatten once
  per occurrence. Wide and deeply nested inputs flatten iteratively
  without `RangeError`.
- `intersectionBy`/`difference` ignore non-array value arguments, while
  `intersection` treats a non-array secondary as empty (result `[]`).
  `intersectionBy` evaluates each element's iteratee once per input array;
  redundant-callback side effects are not preserved.

## Documentation

Full package documentation lives on the published docs site:

- live docs: https://web-ts-toolkit.pages.dev/docs/packages/utils
