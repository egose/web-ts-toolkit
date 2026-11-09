export const turn = () => new Promise<void>((resolve) => setImmediate(resolve));

export function deferred<T = void>() {
  let resolve!: (value: T) => void;
  let reject!: (reason: unknown) => void;
  const promise = new Promise<T>((yes, no) => {
    resolve = yes;
    reject = no;
  });
  return { promise, resolve, reject };
}

/** Event-loop/barrier instrumentation, never an elapsed-time concurrency assertion. */
export class HookProbe {
  active = 0;
  peak = 0;
  calls: string[] = [];
  completed: string[] = [];
  barrier?: Promise<void>;
  onStart?: () => void;

  async run<T>(label: string, body: () => T | Promise<T>): Promise<T> {
    this.calls.push(label);
    this.peak = Math.max(this.peak, ++this.active);
    this.onStart?.();
    try {
      if (this.barrier) await this.barrier;
      await turn();
      const value = await body();
      this.completed.push(label);
      return value;
    } finally {
      this.active--;
    }
  }
}
