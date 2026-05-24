export default function mapValues<TValue, TResult>(
  object: Record<string, TValue> | null | undefined,
  iteratee: (value: TValue, key: string, object: Record<string, TValue>) => TResult,
): Record<string, TResult> {
  if (!object) {
    return {};
  }

  const result: Record<string, TResult> = {};
  const keys = Object.keys(object);

  for (let index = 0; index < keys.length; index++) {
    const key = keys[index];
    result[key] = iteratee(object[key], key, object);
  }

  return result;
}
