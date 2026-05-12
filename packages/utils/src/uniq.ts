import { baseUniq } from './_internal';

export default function uniq<T>(array: T[] | null | undefined): T[] {
  if (!Array.isArray(array)) {
    return [];
  }

  return baseUniq(array);
}
