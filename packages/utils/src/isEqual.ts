import { deepEqual } from './_internal';

export default function isEqual(left: unknown, right: unknown) {
  return deepEqual(left, right);
}
