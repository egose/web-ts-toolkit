/**
 * Map an object's values through an async callback.
 *
 * UTILS-07 contract (current behavior, locked by tests): all callbacks
 * start eagerly with unbounded parallelism (`Promise.all`), preserving
 * key order in the result. There is no concurrency limit, cancellation,
 * or scheduler; a single rejection (or sync callback throw) rejects the
 * whole call. An opt-in concurrency option is deferred to a follow-up
 * (see UTILS-07 decision) pending a concrete caller need.
 */
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
