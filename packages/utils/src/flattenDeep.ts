export default function flattenDeep<T>(array: unknown[]): T[] {
  if (!Array.isArray(array)) {
    return [];
  }

  const result: T[] = [];
  for (let index = 0; index < array.length; index++) {
    const value = array[index];
    if (Array.isArray(value)) {
      result.push(...flattenDeep<T>(value));
    } else {
      result.push(value as T);
    }
  }

  return result;
}
