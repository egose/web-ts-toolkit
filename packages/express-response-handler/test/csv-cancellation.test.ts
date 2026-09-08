import { execFileSync } from 'child_process';
import { dirname } from 'path';
import { Writable } from 'stream';
import { fileURLToPath } from 'url';
import { describe, expect, it } from 'vitest';
import { CSVResponse } from '../dist/responses/csv.mjs';

// B-ERH-05: bound CSV cancellation state and respect iterator completion.
// Prior fixes preserved: B-ERH-04 destination termination (real Writable
// lifecycle, no destroy override, observers restored in teardown).

class CsvCancellationWritable extends Writable {
  headersSent = false;
  readonly headers = new Map<string, string>();
  readonly chunks: Buffer[] = [];
  readonly errors: unknown[] = [];
  finishCount = 0;
  closeCount = 0;

  constructor(options?: ConstructorParameters<typeof Writable>[0]) {
    super(options);
    this.on('error', (error: unknown) => {
      this.errors.push(error);
    });
    this.on('finish', () => {
      this.finishCount += 1;
    });
    this.on('close', () => {
      this.closeCount += 1;
    });
  }

  set(name: string, value: string) {
    this.headers.set(name, value);
  }

  override _write(chunk: unknown, _encoding: BufferEncoding, callback: (error?: Error | null) => void) {
    this.headersSent = true;
    this.chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(String(chunk)));
    callback();
  }
}

const waitForEventLoop = async () => {
  await new Promise((resolve) => setImmediate(resolve));
};

class SlowDrainWritable extends CsvCancellationWritable {
  constructor() {
    super({ highWaterMark: 1024 });
  }

  override _write(chunk: unknown, _encoding: BufferEncoding, callback: (error?: Error | null) => void) {
    this.headersSent = true;
    this.chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(String(chunk)));
    // Defer downstream consumption so the formatter's writable buffer fills
    // and the pump exercises its drain-wait continuation.
    setImmediate(() => callback());
  }
}

const settle = async (rounds = 8) => {
  for (let index = 0; index < rounds; index += 1) {
    await waitForEventLoop();
  }
};

const waitForFinishOrClose = async (dest: Writable) => {
  if (dest.closed || dest.writableEnded) {
    return;
  }

  await new Promise<void>((resolve) => {
    dest.once('finish', () => resolve());
    dest.once('close', () => resolve());
  });
};

const observeProcessFailures = () => {
  const unhandled: unknown[] = [];
  const uncaught: unknown[] = [];
  const onUnhandled = (reason: unknown) => {
    unhandled.push(reason);
  };
  const onUncaught = (error: unknown) => {
    uncaught.push(error);
  };

  process.on('unhandledRejection', onUnhandled);
  process.on('uncaughtException', onUncaught);

  return {
    unhandled,
    uncaught,
    restore() {
      process.off('unhandledRejection', onUnhandled);
      process.off('uncaughtException', onUncaught);
    },
  };
};

describe('CSV cancellation bounds (B-ERH-05)', () => {
  it('should do no later work when disconnect precedes a gated first read resolving', async () => {
    const observer = observeProcessFailures();

    try {
      let processorCalls = 0;
      let releaseFirst!: (result: IteratorResult<unknown>) => void;
      const gate = new Promise<IteratorResult<unknown>>((resolve) => {
        releaseFirst = resolve;
      });
      const source: AsyncIterable<unknown> = {
        [Symbol.asyncIterator]() {
          return {
            next: () => gate,
            return: async () => ({ done: true, value: undefined }),
          };
        },
      };
      const res = new CsvCancellationWritable();

      new CSVResponse(source, {
        headers: false,
        processor: (row) => {
          processorCalls += 1;
          return row;
        },
      }).streamCsv(res);

      await waitForEventLoop();
      res.emit('close');
      await waitForEventLoop();
      releaseFirst({ done: false, value: ['late row'] });
      await settle(12);

      expect(processorCalls).toBe(0);
      expect(res.headers.size).toBe(0);
      expect(res.chunks).toEqual([]);
      expect(observer.unhandled).toEqual([]);
      expect(observer.uncaught).toEqual([]);
    } finally {
      observer.restore();
    }
  });

  it('should do no later work when disconnect precedes a gated first read rejecting', async () => {
    const observer = observeProcessFailures();

    try {
      let processorCalls = 0;
      let rejectFirst!: (error: unknown) => void;
      const gate = new Promise<IteratorResult<unknown>>((_resolve, reject) => {
        rejectFirst = reject;
      });
      // Attach a no-op catch now so the gated rejection is never unobserved
      // before the pump settles it, regardless of abort timing.
      gate.catch((): undefined => undefined);
      const source: AsyncIterable<unknown> = {
        [Symbol.asyncIterator]() {
          return {
            next: () => gate,
            return: async () => ({ done: true, value: undefined }),
          };
        },
      };
      const res = new CsvCancellationWritable();

      new CSVResponse(source, {
        headers: false,
        processor: (row) => {
          processorCalls += 1;
          return row;
        },
      }).streamCsv(res);

      await waitForEventLoop();
      res.emit('close');
      await waitForEventLoop();
      rejectFirst(new Error('late source failure'));
      await settle(12);

      expect(processorCalls).toBe(0);
      expect(res.headers.size).toBe(0);
      expect(res.chunks).toEqual([]);
      expect(observer.unhandled).toEqual([]);
      expect(observer.uncaught).toEqual([]);
    } finally {
      observer.restore();
    }
  });

  it('should read an empty iterator exactly once when a second read would throw', async () => {
    const observer = observeProcessFailures();

    try {
      let calls = 0;
      const source: AsyncIterable<unknown> = {
        [Symbol.asyncIterator]() {
          return {
            next: async () => {
              calls += 1;

              if (calls === 1) {
                return { done: true, value: undefined };
              }

              throw new Error('exhausted source must not be reread');
            },
            return: async () => ({ done: true, value: undefined }),
          };
        },
      };
      const res = new CsvCancellationWritable();

      new CSVResponse(source, { headers: false }).streamCsv(res);
      await waitForFinishOrClose(res);
      await settle();

      expect(calls).toBe(1);
      expect(res.errors).toEqual([]);
      expect(res.writableEnded).toBe(true);
      expect(observer.unhandled).toEqual([]);
      expect(observer.uncaught).toEqual([]);
    } finally {
      observer.restore();
    }
  });

  it('should read an empty iterator exactly once when a second read would never settle', async () => {
    const observer = observeProcessFailures();

    try {
      let calls = 0;
      const source: AsyncIterable<unknown> = {
        [Symbol.asyncIterator]() {
          return {
            next: () => {
              calls += 1;

              if (calls === 1) {
                return Promise.resolve({ done: true, value: undefined });
              }

              return new Promise<IteratorResult<unknown>>(() => undefined);
            },
            return: async () => ({ done: true, value: undefined }),
          };
        },
      };
      const res = new CsvCancellationWritable();

      new CSVResponse(source, { headers: false }).streamCsv(res);
      await waitForFinishOrClose(res);
      await settle();

      expect(calls).toBe(1);
      expect(res.errors).toEqual([]);
      expect(res.writableEnded).toBe(true);
      expect(observer.unhandled).toEqual([]);
      expect(observer.uncaught).toEqual([]);
    } finally {
      observer.restore();
    }
  });

  it('should stop immediately when processing itself triggers a synchronous disconnect', async () => {
    const observer = observeProcessFailures();

    try {
      let processorCalls = 0;
      const res = new CsvCancellationWritable();

      new CSVResponse([['late row']], {
        headers: false,
        processor: (row) => {
          processorCalls += 1;
          // Synchronous re-entrant abort: the post-processor ownership check
          // must observe it before any header assignment, piping, or write.
          res.emit('close');
          return row;
        },
      }).streamCsv(res);
      await settle();

      expect(processorCalls).toBe(1);
      expect(res.headers.size).toBe(0);
      expect(res.chunks).toEqual([]);
      expect(observer.unhandled).toEqual([]);
      expect(observer.uncaught).toEqual([]);
    } finally {
      observer.restore();
    }
  });

  it('should resume from drain backpressure and finish without retaining abort state', async () => {
    const observer = observeProcessFailures();

    try {
      const totalRows = 300;
      const rows = Array.from({ length: totalRows }, (_value, index) => [index, 'x'.repeat(512)]);
      const res = new SlowDrainWritable();

      new CSVResponse(rows, { headers: false }).streamCsv(res);
      await waitForFinishOrClose(res);
      await settle();

      expect(res.errors).toEqual([]);
      expect(res.finishCount).toBe(1);
      const body = Buffer.concat(res.chunks).toString('utf8');
      expect(body).toContain('0,');
      expect(body).toContain(`${totalRows - 1},`);
      expect(observer.unhandled).toEqual([]);
      expect(observer.uncaught).toEqual([]);
    } finally {
      observer.restore();
    }
  });

  it('should keep active-export heap flat across increasing row counts (bounded measurement)', () => {
    // Reproducible fixture: fixed-size cells, non-retaining sink, export held
    // active behind a gate, forced GC in a `--expose-gc` child. Compares
    // 10k vs 100k active rows. Tolerance 5 MB for the 90k delta (~55
    // bytes/row, under a quarter of the pre-fix ~260 bytes/row slope from the
    // review probe) absorbs GC/pipeline noise without hiding linear
    // retention. No wall-clock speed is asserted.
    const script = fileURLToPath(new URL('./csv-retention-measure.mjs', import.meta.url));
    const output = execFileSync(process.execPath, ['--expose-gc', script], {
      cwd: dirname(script),
      timeout: 120_000,
      encoding: 'utf8',
      maxBuffer: 1 << 20,
    });
    const result = JSON.parse(output) as {
      env: unknown;
      gcMethod: unknown;
      rows: unknown;
      bytes: { delta: number; tolerance: number };
      pass: boolean;
    };

    console.info(`[B-ERH-05 retention] ${output.trim()}`);

    expect(result.pass).toBe(true);
    expect(result.bytes.delta).toBeLessThan(result.bytes.tolerance);
  });
});
