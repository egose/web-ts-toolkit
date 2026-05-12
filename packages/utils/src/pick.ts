import { getPath, hasPath, isObject, PropertyPath, setPath } from './_internal';

export default function pick(object: any, paths: PropertyPath | PropertyPath[]): any {
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
