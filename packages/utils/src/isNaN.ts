export default function isNaNValue(value: unknown): boolean {
  if (value instanceof Number) {
    return Number.isNaN(value.valueOf());
  }

  return typeof value === 'number' && Number.isNaN(value);
}
