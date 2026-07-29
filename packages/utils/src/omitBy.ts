export default function omitBy<TValue>(
  object: Record<string, TValue> | null | undefined,
  predicate: (value: TValue, key: string, object: Record<string, TValue>) => boolean,
): Record<string, TValue> {
  if (!object) {
    return {};
  }

  const result: Record<string, TValue> = {};
  const keys = Object.keys(object);

  for (let index = 0; index < keys.length; index++) {
    const key = keys[index];
    const value = object[key];
    if (!predicate(value, key, object)) {
      result[key] = value;
    }
  }

  return result;
}
