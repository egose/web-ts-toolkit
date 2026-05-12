import cloneDeep from './cloneDeep';
import { deletePath, isObject, PropertyPath } from './_internal';

export default function omit<T extends object>(object: T, paths: PropertyPath | PropertyPath[]): Partial<T> {
  if (!isObject(object)) {
    return {} as Partial<T>;
  }

  const result = cloneDeep(object) as Partial<T>;
  const pathList = Array.isArray(paths) ? paths : [paths];
  for (let index = 0; index < pathList.length; index++) {
    deletePath(result, pathList[index]);
  }

  return result;
}
