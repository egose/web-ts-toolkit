/**
 * VIRT-03/VIRT-00A D7 scheduling scope (frozen).
 *
 * - `maxHookConcurrency` (default 10) is a per-request/per-runtime ceiling on
 *   concurrently awaited virtual/getter + row-finalization orchestration work,
 *   NOT a per-row multiplier and NOT a process-wide connection limit.
 * - Top-level lists finalize rows through ONE bounded map
 *   (`mapWithConcurrencyLimit` / `RequestConcurrencyScheduler.map` worker-pool
 *   shape, stable index-keyed results preserving input order regardless of
 *   completion order) so active getter work is bounded by the limit, never
 *   `rows × getters` unbounded `Promise.all`.
 * - Nested include/populate/embedded/descendant work uses bounded child maps
 *   with a finite bound derived from the same limit (sequential or sub-pooled
 *   traversal); recursion depth is additionally bounded by validated plan depth
 *   (`maxCorrelatedDepth` and per-request correlated budgets for correlated
 *   paths). Recursive orchestration NEVER holds leaf persistence permits
 *   (`RequestConcurrencyScheduler.work`, which admits only leaf
 *   adapter/document persistence ops) while awaiting descendant finalization
 *   or application hooks — maps bound their own orchestration workers and
 *   release before awaiting children, so limit-1 configurations complete.
 * - Getters' own trusted direct DB/network I/O is outside the leaf
 *   persistence ceiling (no dataloader/batching in v1; N+1 guidance in
 *   VIRT-10/VIRT-11).
 *
 * `mapWithConcurrencyLimit` bounds orchestration workers per call. For
 * cross-row getter ceilings (peak active getters ≤ limit across a top-level
 * list), combine ONE row map with the shared {@link SharedHookGate} for
 * getter bodies: rows release orchestration workers before awaiting children
 * and getters hold the shared gate only for the getter body itself.
 */
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

/**
 * Shared hook-orchestration gate for VIRT-03 finalization (VIRT-00A D7).
 *
 * Distinct from {@link RequestConcurrencyScheduler.work} (leaf persistence
 * permits): this gate admits virtual getter bodies only, never persistence
 * ops. A single gate instance is shared across all rows of a top-level list
 * so peak active getter work stays at or below the configured limit instead
 * of multiplying by row count. Callers hold the gate only for the getter body
 * itself — never while awaiting descendant finalization — so limit-1
 * configurations complete without deadlock. FIFO admission keeps completion
 * order independent of input order; the surrounding row map preserves stable
 * index-keyed output association regardless of completion order.
 */
export class SharedHookGate {
  readonly limit: number;
  private active = 0;
  private readonly waiters: Array<() => void> = [];

  constructor(limit: number) {
    this.limit = Math.max(1, Math.floor(limit) || 1);
  }

  async run<TOutput>(operation: () => TOutput | PromiseLike<TOutput>): Promise<TOutput> {
    if (this.active >= this.limit) {
      await new Promise<void>((resolve) => this.waiters.push(resolve));
    } else {
      this.active += 1;
    }
    try {
      return await operation();
    } finally {
      const next = this.waiters.shift();
      if (next) next();
      else this.active -= 1;
    }
  }
}

/** Normalize a caller-supplied hook-concurrency limit to a finite ≥1 integer. */
export const normalizeHookConcurrencyLimit = (limit: unknown, fallback = 10): number => {
  const parsed = typeof limit === 'number' ? Math.floor(limit) : NaN;
  if (Number.isSafeInteger(parsed) && parsed >= 1) return parsed;
  if (Number.isSafeInteger(fallback) && fallback >= 1) return fallback;
  return 10;
};
