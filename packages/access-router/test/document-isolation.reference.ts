/** Pre-PIPE-02 graph construction; leaf and permission-alias behavior are unchanged. */
import { isPlainObject } from '@web-ts-toolkit/utils';
import { cloneIsolatedLeaf } from '../src/helpers/document';
import { copyPermissionsAlias } from '../src/output/permissions-alias';

export function legacyDeepIsolateValue<T>(
  value: T,
  seen: WeakMap<object, unknown> = new WeakMap(),
  flattenMaps = false,
): T {
  if (value === null || value === undefined) return value;
  if (typeof value !== 'object') return value;
  if (
    value instanceof Date ||
    value instanceof RegExp ||
    (typeof Buffer !== 'undefined' && Buffer.isBuffer(value as unknown as Buffer))
  )
    return cloneIsolatedLeaf(value) as T;
  const record = value as Record<string, unknown> & { _bsontype?: unknown };
  if (
    typeof record._bsontype === 'string' ||
    (value as { constructor?: { name?: string } }).constructor?.name === 'ObjectId' ||
    (value as { constructor?: { name?: string } }).constructor?.name === 'ObjectID'
  )
    return cloneIsolatedLeaf(value) as T;
  if (Array.isArray(value)) {
    if (seen.has(value as unknown as object)) return seen.get(value as unknown as object) as T;
    const out: unknown[] = [];
    seen.set(value as unknown as object, out);
    for (const entry of value as unknown[]) out.push(legacyDeepIsolateValue(entry, seen, flattenMaps));
    return out as T;
  }
  if (value instanceof Map) {
    if (seen.has(value)) return seen.get(value) as T;
    if (flattenMaps) {
      const out: Record<string, unknown> = {};
      seen.set(value, out);
      for (const [key, entry] of value)
        Object.defineProperty(out, key, {
          value: legacyDeepIsolateValue(entry, seen, true),
          enumerable: true,
          writable: true,
          configurable: true,
        });
      return out as T;
    }
    const out = new Map();
    seen.set(value, out);
    for (const [key, entry] of value) out.set(legacyDeepIsolateValue(key, seen), legacyDeepIsolateValue(entry, seen));
    return out as T;
  }
  if (isPlainObject(value)) {
    if (seen.has(value as unknown as object)) return seen.get(value as unknown as object) as T;
    const out: Record<string, unknown> = {};
    seen.set(value as unknown as object, out);
    for (const [key, entry] of Object.entries(value as Record<string, unknown>)) {
      Object.defineProperty(out, key, {
        value: legacyDeepIsolateValue(entry, seen, flattenMaps),
        enumerable: true,
        writable: true,
        configurable: true,
      });
    }
    copyPermissionsAlias(value, out);
    return out as T;
  }
  return value;
}
