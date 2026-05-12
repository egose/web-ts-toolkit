import { getPath, hasPath, isObject, PropertyPath, setPath } from './_internal';

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
