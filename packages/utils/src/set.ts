import { PropertyPath, setPath } from './_internal';

export default function set<T>(object: T, path: PropertyPath, value: unknown): T {
  return setPath(object, path, value);
}
