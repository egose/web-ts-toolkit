import { getPath, PropertyPath } from './_internal';

export default function get(object: unknown, path: PropertyPath, defaultValue?: unknown): any {
  return getPath(object, path, defaultValue);
}
