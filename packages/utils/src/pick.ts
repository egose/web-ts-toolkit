import { getPath, hasPath, isObject, PropertyPath, setPath } from './_internal';

/**
 * UTILS-03: `paths` is one path or a list of paths. A flat string array is a
 * LIST of paths (`pick(o, ['a', 'b'])` picks keys `a` and `b`), not one
 * segmented path. Pass a nested array for a single segmented path:
 * `pick(o, [['a', 'b']])` picks `a.b`. Key identity follows `toPath`
 * (literal `'01'`, quoted digit keys, canonical numeric indices).
 */
export default function pick<T extends object>(object: T, paths: PropertyPath | PropertyPath[]): Partial<T>;
export default function pick(object: unknown, paths: PropertyPath | PropertyPath[]): Record<string, unknown> {
  if (!isObject(object)) {
    return {};
  }

  const result: Record<string, unknown> = {};
  const pathList = Array.isArray(paths) ? paths : [paths];

  for (let index = 0; index < pathList.length; index++) {
    const path = pathList[index];
    if (!hasPath(object, path)) {
      continue;
    }

    setPath(result, path, getPath(object, path));
  }

  return result;
}
