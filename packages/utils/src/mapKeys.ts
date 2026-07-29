export default function mapKeys<TValue>(
  object: Record<string, TValue> | null | undefined,
  iteratee: (value: TValue, key: string, object: Record<string, TValue>) => string,
): Record<string, TValue> {
  if (!object) {
    return {};
  }

  const result: Record<string, TValue> = {};
  const keys = Object.keys(object);

  for (let index = 0; index < keys.length; index++) {
    const key = keys[index];
    result[String(iteratee(object[key], key, object))] = object[key];
  }

  return result;
}
