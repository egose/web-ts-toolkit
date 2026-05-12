export default function compact<T>(array: T[] | null | undefined): T[] {
  if (!Array.isArray(array)) {
    return [];
  }

  return array.filter(Boolean) as T[];
}
