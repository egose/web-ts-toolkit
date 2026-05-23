export default async function mapValuesAsync<TObject extends Record<string, unknown>, TResult>(
  object: TObject,
  asyncFn: (value: TObject[keyof TObject], key: string, object: TObject) => Promise<TResult> | TResult,
): Promise<Record<string, TResult>> {
  const entries = Object.entries(object) as Array<[string, TObject[keyof TObject]]>;
  const mapped = await Promise.all(
    entries.map(async ([key, value]) => [key, await asyncFn(value, key, object)] as const),
  );

  return Object.fromEntries(mapped);
}
