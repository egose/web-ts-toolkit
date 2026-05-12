import { isObject as baseIsObject } from './_internal';

export default function isObject(value: unknown): value is object {
  return baseIsObject(value);
}
