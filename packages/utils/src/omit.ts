import cloneDeep from './cloneDeep';
import { deletePath, isObject, PropertyPath } from './_internal';

/**
 * UTILS-03: `paths` is one path or a list of paths. A flat string array is a
 * LIST of paths (`omit(o, ['a', 'b'])` omits keys `a` and `b`), not one
 * segmented path. Pass a nested array for a single segmented path:
 * `omit(o, [['a', 'b']])` omits `a.b`. Key identity follows `toPath`.
 *
 * UTILS-04: `omit` never mutates its input. The input is deep-cloned first
 * within the bounded clone domain (plain objects, `Object.create` graphs
 * over plain data, arrays, `Date`, `RegExp`; functions and nested exotics
 * such as `ObjectId`/`Map` preserved by reference as opaque leaves).
 * A top-level unsupported root (class instance, `Map`/`Set`, etc.) throws
 * `TypeError` before any deletion instead of returning an aliased clone
 * that would delete from input-owned state.
 */
export default function omit<T extends object>(object: T, paths: PropertyPath | PropertyPath[]): Partial<T> {
  if (!isObject(object)) {
    return {} as Partial<T>;
  }

  const result = cloneDeep(object) as Partial<T>;
  if (result === (object as unknown as Partial<T>)) {
    throw new TypeError('omit: unsupported object type; input cannot be cloned without aliasing');
  }

  const pathList = Array.isArray(paths) ? paths : [paths];
  for (let index = 0; index < pathList.length; index++) {
    deletePath(result, pathList[index]);
  }

  return result;
}
