export default function castArray<T>(value: T | T[]): T[] {
  return Array.isArray(value) ? value : [value];
}
