export default function join(array: unknown[] | null | undefined, separator?: string): string {
  if (!Array.isArray(array)) {
    return '';
  }

  return array.join(separator);
}
