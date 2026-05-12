import isPlainObject from './isPlainObject';

export default function toStringRecord(value: unknown): Record<string, string> | undefined {
  if (!isPlainObject(value)) {
    return undefined;
  }

  const result: Record<string, string> = {};
  const entries = Object.entries(value);

  for (let index = 0; index < entries.length; index++) {
    const [key, entryValue] = entries[index];
    result[key] = String(entryValue);
  }

  return entries.length > 0 ? result : undefined;
}
