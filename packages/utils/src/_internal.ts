export type PropertyPath = string | number | Array<string | number>;
export type Dictionary<T = unknown> = Record<string, T>;
export type Collection<T = unknown> = T[] | Dictionary<T> | null | undefined;

const pathPattern = /[^.[\]]+|\[(?:([^"'[\]]+)|["']([^"']+)["'])\]/g;
const unsafePathParts = new Set(['__proto__', 'constructor', 'prototype']);

export function isObject(value: unknown): value is object {
  return value !== null && (typeof value === 'object' || typeof value === 'function');
}

export function isPlainObject(value: unknown): value is Dictionary {
  if (value === null || typeof value !== 'object') {
    return false;
  }

  const prototype = Object.getPrototypeOf(value);
  return prototype === null || prototype === Object.prototype;
}

function normalizePathPart(part: string | number): string | number {
  // UTILS-03: preserve literal key identity. String segments stay strings so
  // '01' never collides with '1' and digit keys beyond MAX_SAFE_INTEGER never
  // round via Number(). Explicit numeric segments keep their number identity;
  // property access treats canonical '1' and 1 identically. Whether a segment
  // creates an array is decided separately by isArrayIndexKey.
  return part;
}

/**
 * Whether a path segment should create/select an array slot.
 *
 * UTILS-03: separated from key identity. Canonical array indices only: a
 * non-negative integer below 2**32 - 1, with no leading zeros in string form
 * (`'01'` is an object property, not index 1). Digit strings beyond the
 * array-index range (including beyond `MAX_SAFE_INTEGER`) are object keys.
 */
function isArrayIndexKey(key: string | number): boolean {
  if (typeof key === 'number') {
    return Number.isInteger(key) && key >= 0 && key < 4294967295;
  }

  if (!/^(0|[1-9]\d*)$/.test(key)) {
    return false;
  }

  return Number(key) < 4294967295;
}

/**
 * Parses a property path into segments.
 *
 * UTILS-03 supported grammar:
 * - Dot segments: `'a.b.c'`.
 * - Bare brackets: `'a[0]'`, `'a[key]'`.
 * - Quoted brackets: `'a["b.c"]'`, `"a['b']"`; quoted digit keys keep their
 *   literal identity (`'a["01"]'` addresses property `'01'`, not index 1).
 * - Segment arrays: `['a', 'b']`, `[0]`, or mixed; explicit numbers keep
 *   numeric identity while digit strings keep string identity.
 * - Equivalent supported forms address the same property: `'a[0].b'`,
 *   `'a["0"].b'`, and `['a', '0', 'b']` all reach index/key `'0'`.
 *
 * Deferred (no Lodash parity claimed): empty quoted keys (`'a[""]'`),
 * escaped quotes inside quoted keys, empty dot segments (`'a..b'` currently
 * skips empties), and malformed brackets. Behavior there is unspecified and
 * may be tightened later. An empty path parses to `[]`: `hasPath` is true,
 * `getPath` returns the root, and `setPath`/`deletePath` are no-ops.
 */
export function toPath(path: PropertyPath): Array<string | number> {
  if (Array.isArray(path)) {
    return path.map(normalizePathPart);
  }

  const input = String(path);
  if (input.length === 0) {
    return [];
  }

  const result: Array<string | number> = [];
  input.replace(pathPattern, (_, bare, quoted) => {
    const token = bare ?? quoted ?? _;
    result.push(normalizePathPart(token));
    return '';
  });

  return result.length > 0 ? result : [input];
}

function hasOwnKey(target: object, key: string | number | symbol): boolean {
  return Object.prototype.hasOwnProperty.call(target, key);
}

function defineOwnValue(target: object, key: string | number | symbol, value: unknown): void {
  Object.defineProperty(target, key, {
    value,
    writable: true,
    enumerable: true,
    configurable: true,
  });
}

function hasUnsafePathPart(parts: Array<string | number>): boolean {
  for (let index = 0; index < parts.length; index++) {
    const part = parts[index];
    if (typeof part === 'string' && unsafePathParts.has(part)) {
      return true;
    }
  }

  return false;
}

export function hasPath(value: unknown, path: PropertyPath): boolean {
  const parts = toPath(path);
  if (parts.length === 0) {
    return true;
  }

  let current = value;
  for (let index = 0; index < parts.length; index++) {
    if (current === null || current === undefined) {
      return false;
    }

    const key = parts[index] as keyof typeof current;
    if (!(key in Object(current))) {
      return false;
    }

    current = current[key];
  }

  return true;
}

export function getPath<T = unknown>(value: unknown, path: PropertyPath, defaultValue?: T): T {
  const parts = toPath(path);
  let current = value;

  for (let index = 0; index < parts.length; index++) {
    if (current === null || current === undefined) {
      return defaultValue as T;
    }

    current = current[parts[index] as keyof typeof current];
  }

  return (current === undefined ? defaultValue : current) as T;
}

export function setPath<T>(target: T, path: PropertyPath, value: unknown): T {
  if (!isObject(target)) {
    return target;
  }

  const parts = toPath(path);
  if (parts.length === 0 || hasUnsafePathPart(parts)) {
    return target;
  }

  // UTILS-02 contract: mutation never traverses inherited containers. Only an
  // own object-valued property is reused; otherwise an own container is
  // created (shadowing any inherited member). All writes use own data
  // properties so inherited setters are bypassed when shadowing. Read
  // inheritance (`getPath`/`hasPath`) is intentionally unchanged. Own
  // accessors and proxies may still invoke user code; they are not claimed
  // inert.
  let current: Record<string | number, unknown> = target as Record<string | number, unknown>;
  for (let index = 0; index < parts.length - 1; index++) {
    const key = parts[index];
    const nextKey = parts[index + 1];
    const existing = hasOwnKey(current, key) ? current[key] : undefined;

    if (!isObject(existing)) {
      const container = isArrayIndexKey(nextKey)
        ? ([] as unknown as Record<string | number, unknown>)
        : ({} as Record<string | number, unknown>);
      defineOwnValue(current, key, container);
      current = container;
    } else {
      current = existing as Record<string | number, unknown>;
    }
  }

  defineOwnValue(current, parts[parts.length - 1], value);
  return target;
}

export function deletePath(target: unknown, path: PropertyPath) {
  if (!isObject(target)) {
    return;
  }

  const parts = toPath(path);
  if (parts.length === 0 || hasUnsafePathPart(parts)) {
    return;
  }

  // UTILS-02 contract: deletion never traverses inherited containers. Each
  // intermediate segment must be an own object-valued property; otherwise the
  // call is a no-op and ancestor state is left untouched. The final `delete`
  // only removes own properties, so inherited state cannot be removed.
  let current: Record<string | number, unknown> = target as Record<string | number, unknown>;
  for (let index = 0; index < parts.length - 1; index++) {
    const key = parts[index];
    if (!hasOwnKey(current, key)) {
      return;
    }

    const nextValue = current[key];
    if (!isObject(nextValue)) {
      return;
    }

    current = nextValue as Record<string | number, unknown>;
  }

  delete current[parts[parts.length - 1]];
}

export function sameValueZero(left: unknown, right: unknown) {
  return left === right || (left !== left && right !== right);
}

export function arrayIncludes<T>(array: T[], value: T) {
  for (let index = 0; index < array.length; index++) {
    if (sameValueZero(array[index], value)) {
      return true;
    }
  }

  return false;
}

export function baseUniq<T>(array: T[]) {
  // UTILS-08: Set-based dedup. `Set` uses SameValueZero membership (NaN
  // equals NaN, +0/-0 equal), matching `sameValueZero`/UTILS-05 semantics;
  // object values compare by reference. First-occurrence order and input
  // non-mutation are preserved. O(n) instead of O(n^2) linear scans.
  const seen = new Set<unknown>();
  const result: T[] = [];

  for (let index = 0; index < array.length; index++) {
    const value = array[index];
    if (!seen.has(value)) {
      seen.add(value);
      result.push(value);
    }
  }

  return result;
}

export function identity<T>(value: T): T {
  return value;
}

export function getIteratee(iteratee?: string | number | ((...args: unknown[]) => unknown)) {
  if (typeof iteratee === 'function') {
    return iteratee;
  }

  if (iteratee === undefined) {
    return identity;
  }

  return (value: unknown) => getPath(value, iteratee);
}

const wordPattern = /[A-Z]{2,}(?=[A-Z][a-z]|\b)|[A-Z]?[a-z]+[0-9]*|[A-Z]+|[0-9]+/g;

export function words(value: unknown): string[] {
  const input = String(value ?? '');
  if (input.length === 0) {
    return [];
  }

  return input.replace(/[']/g, '').match(wordPattern) ?? [];
}

export function compareAscending(left: unknown, right: unknown) {
  if (sameValueZero(left, right)) {
    return 0;
  }

  if (left === undefined) {
    return 1;
  }

  if (right === undefined) {
    return -1;
  }

  if (left === null) {
    return 1;
  }

  if (right === null) {
    return -1;
  }

  if (left > right) {
    return 1;
  }

  if (left < right) {
    return -1;
  }

  const leftString = String(left);
  const rightString = String(right);
  if (leftString === rightString) {
    return 0;
  }

  return leftString > rightString ? 1 : -1;
}

/**
 * Bounded deep clone used by `cloneDeep` (and therefore `omit`).
 *
 * UTILS-04 supported domain:
 * - Primitives (`string`, `number`, `boolean`, `null`, `undefined`,
 *   `bigint`, `symbol`) are returned as-is.
 * - Functions are opaque references: preserved by reference, never cloned.
 * - `Array`, plain objects (prototype `null` or `Object.prototype`), `Date`,
 *   and `RegExp` are deep-cloned. Objects built with `Object.create` over
 *   plain-object ancestors are also cloned (prototype preserved by
 *   reference for UTILS-02 inherited-read semantics; only own keys are
 *   deep-cloned). Cycles and repeated references within one
 *   `cloneValue` call are preserved via memoization: shared inputs stay
 *   shared in the clone, detached from the originals.
 * - Other objects nested inside a supported container (class instances such
 *   as BSON `ObjectId`, `Map`/`Set`, etc.) are opaque references:
 *   preserved by reference, never traversed. Rationale: native cloning
 *   cannot be trusted per type (probed: `structuredClone` strips a
 *   Mongoose `ObjectId` to a plain `{i0..i3}` object with a corrupted
 *   string form), and traversing exotic internals risks overflow. The
 *   containers around them are still detached, so `omit` of a sibling path
 *   never touches input state. Callers needing detached exotics must
 *   convert them explicitly. A top-level exotic root is rejected with
 *   `TypeError` (see below) rather than returned as an alias.
 * - Own enumerable string and symbol keys are copied with
 *   `Object.defineProperty` data descriptors (same own-key-safe policy as
 *   UTILS-01/UTILS-02), so an own `__proto__` key stays an own key and never
 *   replaces the result prototype. A null-prototype input keeps a
 *   null prototype; otherwise the result uses `Object.prototype`.
 *   Accessors are materialized: a getter is invoked once and the value is
 *   stored as a plain data property (setters are not preserved).
 *   Non-enumerable properties are not copied.
 * - A top-level value that is itself an exotic object (class instance,
 *   `Map`/`Set`/`WeakMap`/`WeakSet`, `ArrayBuffer`/typed arrays, `Error`,
 *   `Promise`, etc.) throws `TypeError` instead of returning the original
 *   by alias. A custom prototype whose `constructor` is not `Object`
 *   (e.g. a class) is the rejection signal, so `Object.create` graphs
 *   over plain data stay supported. Callers such as `omit` rely on this:
 *   an unsupported root is rejected before any deletion, so input state
 *   is never mutated through an aliased clone.
 *
 * Deliberately manual (no `structuredClone` fast path): a single native
 * attempt cannot cover function-bearing graphs, and retrying native cloning
 * per descendant re-throws for every nested function and still overflows on
 * cycles. One memoizing pass handles all supported graphs deterministically.
 */
export function cloneValue<T>(value: T): T {
  if (isExoticRoot(value)) {
    throw exoticTypeError(value);
  }

  return cloneInner(value, new Map<object, unknown>());
}

function isExoticRoot(value: unknown): boolean {
  if (value === null || typeof value !== 'object') {
    return false;
  }

  if (value instanceof Date || value instanceof RegExp || Array.isArray(value)) {
    return false;
  }

  return !isPlainObject(value) && !isInheritedPlainLike(value);
}

function exoticTypeError(value: unknown): TypeError {
  const name =
    typeof (value as { constructor?: { name?: unknown } }).constructor?.name === 'string' &&
    (value as { constructor: { name: string } }).constructor.name.length > 0
      ? (value as { constructor: { name: string } }).constructor.name
      : typeof value;
  return new TypeError(
    `cloneDeep: unsupported value of type ${name}; only plain objects, arrays, Date, and RegExp can be cloned`,
  );
}

function cloneInner<T>(value: T, seen: Map<object, unknown>): T {
  if (value === null || typeof value !== 'object') {
    return value;
  }

  if (value instanceof Date) {
    return new Date(value.getTime()) as T;
  }

  if (value instanceof RegExp) {
    return new RegExp(value.source, value.flags) as T;
  }

  if (Array.isArray(value)) {
    if (seen.has(value)) {
      return seen.get(value) as T;
    }

    const result: unknown[] = [];
    seen.set(value, result);
    for (let index = 0; index < value.length; index++) {
      if (hasOwnKey(value, index)) {
        defineOwnValue(result, index, cloneInner((value as unknown as Record<number, unknown>)[index], seen));
      }
    }

    copyOwnEnumerableExtras(value, result, seen);
    return result as T;
  }

  if (isPlainObject(value) || isInheritedPlainLike(value)) {
    if (seen.has(value)) {
      return seen.get(value) as T;
    }

    const source = value as Dictionary;
    // Preserve the input prototype by reference (null stays null) so
    // `Object.create(ancestor)` graphs keep UTILS-02 inherited-read semantics.
    // Only own enumerable keys are deep-cloned; inherited state is shared,
    // never traversed for mutation. Nested exotic leaves are preserved by
    // reference (see the tail of this function); only a top-level exotic
    // root is rejected, via the `isExoticRoot` guard in `cloneValue`.
    const prototype = Object.getPrototypeOf(source) as object | null;
    const result: Dictionary = Object.create(prototype);
    seen.set(source, result);
    const keys = ownEnumerableKeys(source);
    for (let index = 0; index < keys.length; index++) {
      const key = keys[index];
      // Read once through the source (materializes an own getter) and store
      // as a plain own data property on the result.
      const child = (source as unknown as Record<string | symbol, unknown>)[key];
      defineOwnValue(result, key, cloneInner(child, seen));
    }

    return result as T;
  }

  // Nested exotic (class instance, Map/Set, etc.): opaque reference, never
  // traversed, so cycles through exotic internals cannot overflow and no
  // alias of a *container* escapes (only the exotic leaf itself is shared).
  return value;
}

/**
 * Whether every prototype in the chain is a plain data container.
 *
 * UTILS-04/UTILS-02: `Object.create(ancestor)` graphs over plain-object
 * ancestors stay cloneable (prototype preserved by reference, own keys
 * deep-cloned) so `omit` keeps working on them without touching the
 * ancestor. Class instances fail this check (their prototype's
 * `constructor` is the custom class, not `Object`) and are rejected with
 * `TypeError`; builtin exotics (`Map`/`Set`/etc.) fail it the same way.
 */
function isInheritedPlainLike(value: object): boolean {
  let current: object | null = value;
  while (current !== null) {
    const prototype = Object.getPrototypeOf(current) as object | null;
    if (prototype === null || prototype === Object.prototype) {
      return true;
    }

    const constructor = (prototype as { constructor?: unknown }).constructor;
    if (constructor !== undefined && constructor !== Object) {
      return false;
    }

    current = prototype;
  }

  return true;
}

function ownEnumerableKeys(source: object): Array<string | symbol> {
  const keys: Array<string | symbol> = Object.keys(source);
  const symbols = Object.getOwnPropertySymbols(source);
  for (let index = 0; index < symbols.length; index++) {
    if (Object.prototype.propertyIsEnumerable.call(source, symbols[index])) {
      keys.push(symbols[index]);
    }
  }

  return keys;
}

function copyOwnEnumerableExtras(source: object, target: object, seen: Map<object, unknown>): void {
  const keys = ownEnumerableKeys(source);
  for (let index = 0; index < keys.length; index++) {
    const key = keys[index];
    if (typeof key === 'string' && /^(0|[1-9]\d*)$/.test(key)) {
      const numeric = Number(key);
      if (Number.isInteger(numeric) && numeric >= 0 && numeric < (source as unknown[]).length) {
        continue;
      }
    }

    if (hasOwnKey(target, key)) {
      continue;
    }

    defineOwnValue(target, key, cloneInner((source as unknown as Record<string | symbol, unknown>)[key], seen));
  }
}

/**
 * Supported deep-equality domain, aligned with the UTILS-04 clone domain.
 *
 * - Primitives (including `NaN`, which equals itself, and `-0`/`+0`, which
 *   compare equal via `SameValueZero`) compare by value.
 * - `Date` instances compare by `getTime()` (two invalid dates are equal);
 *   a `Date` never equals a non-`Date` (e.g. `Date` vs `{}` is false).
 * - `RegExp` instances compare by `source` + `flags`; a `RegExp` never
 *   equals a non-`RegExp`.
 * - `Array`s compare by `length`, per-index own-presence (a hole is missing,
 *   so `[,]` does not equal `[undefined]`), per-index values, and extra own
 *   enumerable string/symbol keys (custom props on arrays are significant).
 * - Plain-like objects (`null`/`Object.prototype` prototypes, plus
 *   `Object.create` graphs over plain-object ancestors) compare by their
 *   own enumerable string/symbol keys only. Inherited properties are
 *   ignored: an inherited value never satisfies an own key on the other
 *   side, so own-key mismatches are not hidden by prototypes. Prototypes
 *   themselves are not compared (a null-prototype object can equal a plain
 *   one with the same own keys); only the domain classification uses them.
 * - Functions and exotic objects (class instances, `Map`/`Set`,
 *   `ArrayBuffer`/typed arrays, `Error`, `Promise`, boxed primitives,
 *   etc.) use conservative identity semantics: they are equal only when
 *   `SameValueZero`-identical. Distinct functions and unequal `Map`
 *   contents are therefore never equal just because both expose zero
 *   enumerable keys. Nested exotics inside plain containers are compared
 *   the same way, so dirty-state-relevant reference changes (e.g. a
 *   replaced `Map`) are never discarded as "equal".
 * - Cyclic and repeated-reference supported graphs terminate via
 *   pair-aware bookkeeping: a pair already on the comparison stack is
 *   treated as equal (coinductive step). Repeated references are compared
 *   by content on each occurrence; aliasing shape is not required to
 *   match, only reachable content.
 */
export function deepEqual(left: unknown, right: unknown): boolean {
  return deepEqualInner(left, right, new Map<object, Set<unknown>>());
}

type EqualPairs = Map<object, Set<unknown>>;

function pairsHas(pairs: EqualPairs, left: object, right: unknown): boolean {
  return pairs.get(left)?.has(right) ?? false;
}

function pairsAdd(pairs: EqualPairs, left: object, right: unknown): void {
  let set = pairs.get(left);
  if (set === undefined) {
    set = new Set<unknown>();
    pairs.set(left, set);
  }
  set.add(right);
}

function pairsDelete(pairs: EqualPairs, left: object, right: unknown): void {
  const set = pairs.get(left);
  if (set === undefined) {
    return;
  }
  set.delete(right);
  if (set.size === 0) {
    pairs.delete(left);
  }
}

function isComparableObject(value: unknown): value is Dictionary {
  return typeof value === 'object' && value !== null && (isPlainObject(value) || isInheritedPlainLike(value as object));
}

function isExtraArrayKey(key: string | symbol, length: number): boolean {
  if (typeof key === 'symbol') {
    return true;
  }
  if (/^(0|[1-9]\d*)$/.test(key)) {
    const numeric = Number(key);
    if (Number.isInteger(numeric) && numeric >= 0 && numeric < length) {
      return false;
    }
  }
  return true;
}

function deepEqualInner(left: unknown, right: unknown, pairs: EqualPairs): boolean {
  if (sameValueZero(left, right)) {
    return true;
  }

  if (left instanceof Date || right instanceof Date) {
    return left instanceof Date && right instanceof Date && sameValueZero(left.getTime(), right.getTime());
  }

  if (left instanceof RegExp || right instanceof RegExp) {
    return (
      left instanceof RegExp && right instanceof RegExp && left.source === right.source && left.flags === right.flags
    );
  }

  if (Array.isArray(left) || Array.isArray(right)) {
    if (!Array.isArray(left) || !Array.isArray(right) || left.length !== right.length) {
      return false;
    }

    if (pairsHas(pairs, left, right)) {
      return true;
    }
    pairsAdd(pairs, left, right);
    try {
      for (let index = 0; index < left.length; index++) {
        const leftHas = hasOwnKey(left, index);
        const rightHas = hasOwnKey(right, index);
        if (leftHas !== rightHas) {
          return false;
        }
        if (leftHas && !deepEqualInner(left[index], right[index], pairs)) {
          return false;
        }
      }

      const leftExtras = ownEnumerableKeys(left).filter((key) => isExtraArrayKey(key, left.length));
      const rightExtras = ownEnumerableKeys(right).filter((key) => isExtraArrayKey(key, right.length));
      if (leftExtras.length !== rightExtras.length) {
        return false;
      }
      for (let index = 0; index < leftExtras.length; index++) {
        const key = leftExtras[index];
        if (!hasOwnKey(right, key)) {
          return false;
        }
        if (
          !deepEqualInner(
            (left as unknown as Record<string | symbol, unknown>)[key],
            (right as unknown as Record<string | symbol, unknown>)[key],
            pairs,
          )
        ) {
          return false;
        }
      }

      return true;
    } finally {
      pairsDelete(pairs, left, right);
    }
  }

  if (!isComparableObject(left) || !isComparableObject(right)) {
    // Distinct functions and exotic instances (Map/Set, class instances,
    // etc.) are not equal: SameValueZero above already handled identical
    // references, and there is no content comparison for opaque types.
    return false;
  }

  if (pairsHas(pairs, left, right)) {
    return true;
  }
  pairsAdd(pairs, left, right);
  try {
    const leftKeys = ownEnumerableKeys(left);
    const rightKeys = ownEnumerableKeys(right);
    if (leftKeys.length !== rightKeys.length) {
      return false;
    }

    for (let index = 0; index < leftKeys.length; index++) {
      const key = leftKeys[index];
      if (!hasOwnKey(right, key)) {
        return false;
      }
      if (
        !deepEqualInner(
          (left as unknown as Record<string | symbol, unknown>)[key],
          (right as unknown as Record<string | symbol, unknown>)[key],
          pairs,
        )
      ) {
        return false;
      }
    }

    return true;
  } finally {
    pairsDelete(pairs, left, right);
  }
}

/**
 * Partial-match semantics used by `isMatch`.
 *
 * - Ordinary partial matching is preserved: every own enumerable
 *   string/symbol key of a plain `source` must be present as an **own**
 *   key on `object` and match recursively; extra keys on `object` are
 *   ignored. Symbol keys participate exactly like string keys.
 * - Absence is distinguished from `undefined`: a source key whose value is
 *   `undefined` still requires the key to exist as an own property, so
 *   `isMatch({}, { a: undefined })` is false while
 *   `isMatch({ a: undefined }, { a: undefined })` is true. Inherited
 *   properties never satisfy a source key.
 * - Arrays use prefix semantics (preserved): a source array matches when
 *   `object` is an array with at least as many elements and each own
 *   index of the source matches recursively. A hole in the source
 *   pattern imposes no constraint at that position; an explicit source
 *   element (including `undefined`) requires an own element on `object`.
 *   Extra own non-index keys on a source array must match as own keys.
 * - `Date`/`RegExp`/primitive/function/exotic sources fall back to
 *   `deepEqual` (identity for opaque types, value comparison for
 *   supported built-ins).
 * - Cyclic patterns terminate via the same pair-aware bookkeeping as
 *   `deepEqual`.
 */
export function partialMatch(object: unknown, source: unknown): boolean {
  return partialMatchInner(object, source, new Map<object, Set<unknown>>());
}

function partialMatchInner(object: unknown, source: unknown, pairs: EqualPairs): boolean {
  if (sameValueZero(object, source)) {
    return true;
  }

  if (Array.isArray(source)) {
    if (!Array.isArray(object) || object.length < source.length) {
      return false;
    }

    if (pairsHas(pairs, source, object)) {
      return true;
    }
    pairsAdd(pairs, source, object);
    try {
      for (let index = 0; index < source.length; index++) {
        if (!hasOwnKey(source, index)) {
          continue;
        }
        if (!hasOwnKey(object, index)) {
          return false;
        }
        if (!partialMatchInner(object[index], source[index], pairs)) {
          return false;
        }
      }

      const sourceExtras = ownEnumerableKeys(source).filter((key) => isExtraArrayKey(key, source.length));
      for (let index = 0; index < sourceExtras.length; index++) {
        const key = sourceExtras[index];
        if (!hasOwnKey(object, key)) {
          return false;
        }
        if (
          !partialMatchInner(
            (object as unknown as Record<string | symbol, unknown>)[key],
            (source as unknown as Record<string | symbol, unknown>)[key],
            pairs,
          )
        ) {
          return false;
        }
      }

      return true;
    } finally {
      pairsDelete(pairs, source, object);
    }
  }

  if (isPlainObject(source) || (typeof source === 'object' && source !== null && isInheritedPlainLike(source))) {
    if (!isObject(object)) {
      return false;
    }

    if (pairsHas(pairs, source as object, object)) {
      return true;
    }
    pairsAdd(pairs, source as object, object);
    try {
      const keys = ownEnumerableKeys(source);
      for (let index = 0; index < keys.length; index++) {
        const key = keys[index];
        if (!hasOwnKey(object as object, key)) {
          return false;
        }
        if (
          !partialMatchInner(
            (object as unknown as Record<string | symbol, unknown>)[key],
            (source as unknown as Record<string | symbol, unknown>)[key],
            pairs,
          )
        ) {
          return false;
        }
      }

      return true;
    } finally {
      pairsDelete(pairs, source as object, object);
    }
  }

  return deepEqualInner(object, source, pairs);
}
