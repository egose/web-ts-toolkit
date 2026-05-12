import { isPlainObject as baseIsPlainObject } from './_internal';

export default function isPlainObject(value: unknown): value is Record<string, unknown> {
  return baseIsPlainObject(value);
}
