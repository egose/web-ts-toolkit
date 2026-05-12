export type PropertyPath = string | number | Array<string | number>;
export type Dictionary<T = unknown> = Record<string, T>;
export type Collection<T = unknown> = T[] | Dictionary<T> | null | undefined;

const pathPattern = /[^.[\]]+|\[(?:([^"'[\]]+)|["']([^"']+)["'])\]/g;

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
  if (typeof part === 'number') {
    return part;
  }

  return /^\d+$/.test(part) ? Number(part) : part;
}

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
  if (parts.length === 0) {
    return target;
  }

  let current: Record<string | number, unknown> = target as Record<string | number, unknown>;
  for (let index = 0; index < parts.length - 1; index++) {
    const key = parts[index];
    const nextKey = parts[index + 1];
    const existing = current[key];

    if (!isObject(existing)) {
      current[key] = typeof nextKey === 'number' ? [] : {};
    }

    current = current[key] as Record<string | number, unknown>;
  }

  current[parts[parts.length - 1]] = value;
  return target;
}

export function deletePath(target: unknown, path: PropertyPath) {
  if (!isObject(target)) {
    return;
  }

  const parts = toPath(path);
  if (parts.length === 0) {
    return;
  }

  let current: Record<string | number, unknown> = target as Record<string | number, unknown>;
  for (let index = 0; index < parts.length - 1; index++) {
    const key = parts[index];
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
  const result: T[] = [];

  for (let index = 0; index < array.length; index++) {
    if (!arrayIncludes(result, array[index])) {
      result.push(array[index]);
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

export function cloneValue<T>(value: T): T {
  if (typeof structuredClone === 'function') {
    try {
      return structuredClone(value);
    } catch {}
  }

  if (Array.isArray(value)) {
    return value.map((item) => cloneValue(item)) as T;
  }

  if (value instanceof Date) {
    return new Date(value.getTime()) as T;
  }

  if (value instanceof RegExp) {
    return new RegExp(value.source, value.flags) as T;
  }

  if (isPlainObject(value)) {
    const result: Dictionary = {};
    const keys = Object.keys(value);
    for (let index = 0; index < keys.length; index++) {
      const key = keys[index];
      result[key] = cloneValue(value[key]);
    }

    return result as T;
  }

  return value;
}

export function deepEqual(left: unknown, right: unknown): boolean {
  if (sameValueZero(left, right)) {
    return true;
  }

  if (left instanceof Date && right instanceof Date) {
    return left.getTime() === right.getTime();
  }

  if (left instanceof RegExp && right instanceof RegExp) {
    return left.source === right.source && left.flags === right.flags;
  }

  if (Array.isArray(left) || Array.isArray(right)) {
    if (!Array.isArray(left) || !Array.isArray(right) || left.length !== right.length) {
      return false;
    }

    for (let index = 0; index < left.length; index++) {
      if (!deepEqual(left[index], right[index])) {
        return false;
      }
    }

    return true;
  }

  if (!isObject(left) || !isObject(right)) {
    return false;
  }

  const leftKeys = Object.keys(left);
  const rightKeys = Object.keys(right);
  if (leftKeys.length !== rightKeys.length) {
    return false;
  }

  for (let index = 0; index < leftKeys.length; index++) {
    const key = leftKeys[index];
    if (!(key in right) || !deepEqual(left[key as keyof typeof left], right[key as keyof typeof right])) {
      return false;
    }
  }

  return true;
}

export function partialMatch(object: unknown, source: unknown): boolean {
  if (sameValueZero(object, source)) {
    return true;
  }

  if (Array.isArray(source)) {
    if (!Array.isArray(object) || object.length < source.length) {
      return false;
    }

    for (let index = 0; index < source.length; index++) {
      if (!partialMatch(object[index], source[index])) {
        return false;
      }
    }

    return true;
  }

  if (isPlainObject(source)) {
    if (!isObject(object)) {
      return false;
    }

    const keys = Object.keys(source);
    for (let index = 0; index < keys.length; index++) {
      const key = keys[index];
      if (!partialMatch(object[key as keyof typeof object], source[key])) {
        return false;
      }
    }

    return true;
  }

  return deepEqual(object, source);
}
