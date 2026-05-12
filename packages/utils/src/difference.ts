import { arrayIncludes } from './_internal';

export default function difference<T>(array: T[] | null | undefined, ...values: Array<T[] | null | undefined>): T[] {
  if (!Array.isArray(array)) {
    return [];
  }

  const excluded = values.flatMap((value) => (Array.isArray(value) ? value : []));
  return array.filter((item) => !arrayIncludes(excluded, item));
}
