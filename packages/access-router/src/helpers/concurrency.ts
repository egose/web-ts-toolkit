import { AsyncLocalStorage } from 'node:async_hooks';

/**
 * Per-call orchestration workers, with index-keyed results regardless of
 * completion order. Recursive maps hold no shared persistence or hook permit.
 * Actual hook admission belongs to the request/runtime's SharedHookGate; map
 * worker counts are not a global bound on waiting orchestration frames.
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

/** Each instance owns a distinct permit pool. Transfer directly to the oldest waiter. */
class FifoAdmission {
  private activeWork = 0;
  private readonly waiters: Array<() => void> = [];

  constructor(private readonly limit: number) {}

  async run<TOutput>(operation: () => TOutput | PromiseLike<TOutput>): Promise<TOutput> {
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

export class RequestConcurrencyScheduler {
  readonly limit: number;
  private readonly persistence: FifoAdmission;

  constructor(limit: number) {
    this.limit = Math.max(1, limit);
    this.persistence = new FifoAdmission(this.limit);
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
  work<TOutput>(operation: () => TOutput | PromiseLike<TOutput>): Promise<TOutput> {
    return this.persistence.run(operation);
  }
}

interface HookFrame {
  gate: SharedHookGate;
  parent: HookFrame | undefined;
  depth: number;
  open: boolean;
  children: FifoAdmission;
  pending: number;
  drained?: () => void;
}

// One private async context; no caller-provided reentry token or request/DTO slot.
// The gate identity, not the ambient runtime, determines reentrant ownership.
const hookFrames = new AsyncLocalStorage<HookFrame>();
const MAX_HOOK_DEPTH = 64;

/**
 * Request/runtime-owned admission of hook chains, separate from persistence.
 * Outside a live same-gate callback scope, work acquires a root permit FIFO.
 * Nested hooks reuse that chain, but each frame admits only ONE child branch
 * (including its descendants) at a time, FIFO. Promise.all siblings cannot
 * bypass admission. At most `limit` independent leaf branches run; recursively
 * waiting ancestors are extra frames, not extra permits (up to 64 admission
 * scopes per chain). Root FIFO and child FIFO are separate: descendants must
 * progress before unrelated roots to support awaiting services at limit one.
 *
 * Settlement closes a frame to new reentry and drains already-queued children
 * before releasing its branch, on success or failure. Detached continuations
 * from closed frames reacquire root admission. Trusted hooks must await their
 * work and avoid cross-branch dependency cycles. This does not constrain their
 * own direct DB/network fan-out, queued work totals, or process-wide connections.
 */
export class SharedHookGate {
  readonly limit: number;
  private readonly roots: FifoAdmission;

  constructor(limit: number) {
    this.limit = normalizeHookConcurrencyLimit(limit);
    this.roots = new FifoAdmission(this.limit);
  }

  async run<TOutput>(operation: () => TOutput | PromiseLike<TOutput>): Promise<TOutput> {
    let parent = hookFrames.getStore();
    while (parent && parent.gate !== this) parent = parent.parent;
    // Do not skip a closed same-owner frame to borrow a still-live ancestor.
    if (!parent?.open) return this.roots.run(() => this.invoke(operation, 1));
    if (parent.depth >= MAX_HOOK_DEPTH) {
      throw new RangeError(`Maximum reentrant hook depth of ${MAX_HOOK_DEPTH} exceeded`);
    }
    parent.pending++;
    try {
      return await parent.children.run(() => this.invoke(operation, parent.depth + 1));
    } finally {
      if (--parent.pending === 0) parent.drained?.();
    }
  }

  private async invoke<TOutput>(operation: () => TOutput | PromiseLike<TOutput>, depth: number): Promise<TOutput> {
    const frame: HookFrame = {
      gate: this,
      parent: hookFrames.getStore(),
      depth,
      open: true,
      children: new FifoAdmission(1),
      pending: 0,
    };
    try {
      return await hookFrames.run(frame, operation);
    } finally {
      frame.open = false;
      if (frame.pending)
        await new Promise<void>((resolve) => {
          frame.drained = resolve;
        });
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
