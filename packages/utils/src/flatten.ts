export default function flatten<T>(array: Array<T | T[]> | null | undefined): T[] {
  if (!Array.isArray(array)) {
    return [];
  }

  const result: T[] = [];
  for (let index = 0; index < array.length; index++) {
    const value = array[index];
    if (Array.isArray(value)) {
      result.push(...value);
    } else {
      result.push(value);
    }
  }

  return result;
}
