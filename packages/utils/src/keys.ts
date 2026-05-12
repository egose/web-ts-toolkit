export default function keys(value: unknown): string[] {
  if (value == null) {
    return [];
  }

  return Object.keys(Object(value));
}
