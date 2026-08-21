export const mapWithConcurrencyLimit = async <TInput, TOutput>(
  items: TInput[],
  limit: number,
  iteratee: (item: TInput, index: number) => Promise<TOutput>,
) => {
  const results: TOutput[] = new Array(items.length);
  let cursor = 0;
  const workerCount = Math.min(Math.max(limit, 1), items.length || 1);

  await Promise.all(
    Array.from({ length: workerCount }, async () => {
      while (cursor < items.length) {
        const current = cursor;
        cursor += 1;
        results[current] = await iteratee(items[current], current);
      }
    }),
  );

  return results;
};

export class RequestConcurrencyScheduler {
  readonly limit: number;

  constructor(limit: number) {
    this.limit = Math.max(1, limit);
  }

  async map<TInput, TOutput>(
    items: TInput[],
    iteratee: (item: TInput, index: number, scheduled: true) => Promise<TOutput>,
  ) {
    return mapWithConcurrencyLimit(items, this.limit, (item, index) => iteratee(item, index, true));
  }

  async run<TOutput>(iteratee: (scheduled: true) => Promise<TOutput>) {
    const [result] = await this.map([undefined], () => iteratee(true));
    return result;
  }
}
