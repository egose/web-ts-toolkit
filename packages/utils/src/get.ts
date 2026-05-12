import { getPath, PropertyPath } from './_internal';

export default function get<T = unknown>(object: unknown, path: PropertyPath, defaultValue?: T): T;
export default function get(object: unknown, path: PropertyPath, defaultValue?: unknown): unknown {
  return getPath(object, path, defaultValue);
}
