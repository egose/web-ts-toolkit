// Opt-in DPH-07 probe utilities. No imports from ordinary test entrypoints.
export const COUNTS = Object.freeze({
  rounds: 2,
  browserWarmup: 64,
  browserSamples: 512,
  serverWarmup: 128,
  serverSamples: 1024,
  auditSamples: 16,
});
export const CONCURRENCIES = [1, 8] as const;

export class ProbeFailure extends Error {}

export function check(value: unknown, message: string): asserts value {
  // Callers supply fixed diagnostics only, never credential/claim values.
  if (!value) throw new ProbeFailure(message);
}

const round = (value: number) => Number(value.toFixed(6));
export const distribution = (values: readonly number[]) => {
  check(values.length > 0, 'Empty latency sample.');
  const sorted = [...values].sort((a, b) => a - b);
  const percentile = (fraction: number) => round(sorted[Math.ceil(sorted.length * fraction) - 1]);
  return {
    n: values.length,
    min: round(sorted[0]),
    p50: percentile(0.5),
    p95: percentile(0.95),
    p99: percentile(0.99),
    max: round(sorted[sorted.length - 1]),
    mean: round(values.reduce((sum, value) => sum + value, 0) / values.length),
    zeroSamples: values.filter((value) => value === 0).length,
  };
};

// Closed-loop waves, not a load generator: all C operations settle before the
// next wave starts. Individual latency includes queueing after its invocation.
export const waves = async (count: number, concurrency: number, run: (index: number) => Promise<unknown>) => {
  check(count % concurrency === 0, 'Counts must contain complete concurrency waves.');
  for (let offset = 0; offset < count; offset += concurrency)
    await Promise.all(Array.from({ length: concurrency }, (_, index) => run(offset + index)));
};

export const measure = async (
  name: string,
  warmup: number,
  samples: number,
  concurrency: number,
  run: (index: number) => Promise<unknown>,
  operationsPerSample = 1,
) => {
  await waves(warmup, concurrency, run);
  const times = new Array<number>(samples);
  const start = performance.now();
  await waves(samples, concurrency, async (index) => {
    const before = performance.now();
    await run(warmup + index);
    times[index] = (performance.now() - before) / operationsPerSample;
  });
  const wallMs = performance.now() - start;
  return {
    name,
    warmup,
    samples,
    concurrency,
    operationsPerSample,
    measuredOperations: samples * operationsPerSample,
    wallMs: round(wallMs),
    operationsPerSecond: round((samples * operationsPerSample * 1000) / wallMs),
    latencyMs: distribution(times),
  };
};

// Diagnostic pass only. Main latency rows have no patched methods. Observers
// return original results/promises and retain only counts and elapsed times.
export class CallAudit {
  private readonly restores: Array<() => void> = [];
  private readonly entries = new Map<string, { calls: number; times: number[] }>();

  wrap(target: object, method: string, name: string, kind: 'promise' | 'request' | 'sync' = 'promise'): void {
    const descriptor = Object.getOwnPropertyDescriptor(target, method);
    const original: unknown = Reflect.get(target, method);
    check(typeof original === 'function', 'Missing instrumented method.');
    const entry = { calls: 0, times: [] as number[] };
    this.entries.set(name, entry);
    Object.defineProperty(target, method, {
      configurable: true,
      writable: true,
      value: function (this: unknown, ...args: unknown[]) {
        entry.calls++;
        const start = performance.now();
        const finish = () => {
          entry.times.push(performance.now() - start);
        };
        let result: unknown;
        try {
          result = Reflect.apply(original, this, args);
        } catch (error) {
          finish();
          throw error;
        }
        if (kind === 'promise') void Promise.resolve(result).then(finish, finish);
        else if (kind === 'request') {
          const request = result as IDBRequest;
          request.addEventListener('success', finish, { once: true });
          request.addEventListener('error', finish, { once: true });
        } else finish();
        return result;
      },
    });
    this.restores.push(() => {
      if (descriptor) Object.defineProperty(target, method, descriptor);
      else Reflect.deleteProperty(target, method);
    });
  }

  count(name: string): number {
    return this.entries.get(name)?.calls ?? 0;
  }

  snapshot() {
    return Object.fromEntries(
      [...this.entries].map(([name, entry]) => {
        check(entry.calls === entry.times.length, 'An observed operation did not settle.');
        return [name, { calls: entry.calls, ...(entry.calls ? { latencyMs: distribution(entry.times) } : {}) }];
      }),
    );
  }

  restore(): void {
    for (const restore of this.restores.reverse()) restore();
    this.restores.length = 0;
  }
}
