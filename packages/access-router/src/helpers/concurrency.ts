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
  private activeWork = 0;
  private readonly waiters: Array<() => void> = [];

  constructor(limit: number) {
    this.limit = Math.max(1, limit);
  }

  // Each map bounds its own orchestration workers. Recursive maps never hold
  // shared work permits while awaiting descendants (including at limit 1).
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

  // Only leaf persistence operations belong here, not service/hook callbacks.
  // All work calls on this scheduler share a FIFO admission ceiling.
  async work<TOutput>(operation: () => TOutput | PromiseLike<TOutput>): Promise<TOutput> {
    if (this.activeWork >= this.limit) {
      await new Promise<void>((resolve) => this.waiters.push(resolve));
    } else {
      this.activeWork += 1;
    }
    try {
      return await operation();
    } finally {
      const next = this.waiters.shift();
      if (next)
        next(); // Transfer this permit directly; no queue jumping.
      else this.activeWork -= 1;
    }
  }
}
