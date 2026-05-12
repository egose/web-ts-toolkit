import { cloneValue } from './_internal';

export default function cloneDeep<T>(value: T): T {
  return cloneValue(value);
}
