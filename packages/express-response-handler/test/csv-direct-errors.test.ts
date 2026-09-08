import { Writable } from 'stream';
import { describe, expect, it } from 'vitest';
import { CSVResponse } from '../dist/responses/csv.mjs';

// B-ERH-06: direct CSV streaming error ownership.
// Contract under test (minimal fallback, no breaking signature change):
// - pre-output failure WITH owner: owner invoked exactly once, owns
//   termination (test owner ends/destroys); throwing owner is contained and
//   the destination is destroyed with the original failure.
// - pre-output failure WITHOUT owner: deterministic fallback destroys the
//   destination with the normalized failure (observable via error + close).
// B-ERH-04 (destination termination, no destroy override, observers restored)
// and B-ERH-05 (bounded cancellation, first-read guards) preserved.

class DirectErrorWritable extends Writable {
  headersSent = false;
  readonly headers = new Map<string, string>();
  readonly chunks: Buffer[] = [];
  readonly errors: unknown[] = [];
  finishCount = 0;
  closeCount = 0;

  constructor() {
    super();
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

const waitForClose = async (dest: Writable) => {
  if (dest.closed) {
    return;
  }

  await new Promise<void>((resolve) => dest.once('close', () => resolve()));
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
    async settle() {
      for (let index = 0; index < 5; index += 1) {
        await new Promise((resolve) => setImmediate(resolve));
      }
    },
    restore() {
      process.off('unhandledRejection', onUnhandled);
      process.off('uncaughtException', onUncaught);
    },
  };
};

const failingFirstReadSource = (failure: Error): AsyncIterable<unknown> => ({
  [Symbol.asyncIterator]() {
    return {
      next: async (): Promise<IteratorResult<unknown>> => {
        throw failure;
      },
      return: async () => ({ done: true as const, value: undefined }),
    };
  },
});

describe('Direct CSV streaming error ownership (B-ERH-06)', () => {
  it('should destroy the destination when an invalid filename has no error owner', async () => {
    const observer = observeProcessFailures();

    try {
      const res = new DirectErrorWritable();

      new CSVResponse([['ok']], { filename: 'bad\r\nname.csv' }).streamCsv(res);

      await waitForClose(res);
      await observer.settle();

      expect(res.errors).toHaveLength(1);
      expect(res.errors[0]).toBeInstanceOf(TypeError);
      expect((res.errors[0] as Error).message).toBe('CSV filename cannot contain control characters');
      expect(res.closeCount).toBe(1);
      expect(res.headers.size).toBe(0);
      expect(observer.unhandled).toEqual([]);
      expect(observer.uncaught).toEqual([]);
    } finally {
      observer.restore();
    }
  });

  it('should give the error owner exactly one callback for an invalid filename', async () => {
    const observer = observeProcessFailures();

    try {
      const seen: unknown[] = [];
      const res = new DirectErrorWritable();

      new CSVResponse([['ok']], { filename: 'bad\r\nname.csv' }).streamCsv(res, (error) => {
        seen.push(error);
        // Owner owns termination for the callback path.
        res.end();
      });

      await waitForEventLoop();
      await observer.settle();

      expect(seen).toHaveLength(1);
      expect(seen[0]).toBeInstanceOf(TypeError);
      expect((seen[0] as Error).message).toBe('CSV filename cannot contain control characters');
      expect(res.errors).toEqual([]);
      expect(res.finishCount).toBe(1);
      expect(observer.unhandled).toEqual([]);
      expect(observer.uncaught).toEqual([]);
    } finally {
      observer.restore();
    }
  });

  it('should destroy the destination when the first read fails without an owner', async () => {
    const observer = observeProcessFailures();

    try {
      const sourceError = new Error('first read failed');
      const res = new DirectErrorWritable();

      new CSVResponse(failingFirstReadSource(sourceError), { headers: false }).streamCsv(res);

      await waitForClose(res);
      await observer.settle();

      expect(res.errors).toEqual([sourceError]);
      expect(res.closeCount).toBe(1);
      expect(res.headers.size).toBe(0);
      expect(res.chunks).toEqual([]);
      expect(observer.unhandled).toEqual([]);
      expect(observer.uncaught).toEqual([]);
    } finally {
      observer.restore();
    }
  });

  it('should give the error owner exactly one callback when the first read fails', async () => {
    const observer = observeProcessFailures();

    try {
      const sourceError = new Error('first read failed');
      const seen: unknown[] = [];
      const res = new DirectErrorWritable();

      new CSVResponse(failingFirstReadSource(sourceError), { headers: false }).streamCsv(res, (error) => {
        seen.push(error);
        res.end();
      });

      await waitForEventLoop();
      await observer.settle();

      expect(seen).toEqual([sourceError]);
      expect(res.errors).toEqual([]);
      expect(res.finishCount).toBe(1);
      expect(observer.unhandled).toEqual([]);
      expect(observer.uncaught).toEqual([]);
    } finally {
      observer.restore();
    }
  });

  it('should destroy the destination when the first-row processor throws without an owner', async () => {
    const observer = observeProcessFailures();

    try {
      const processorError = new Error('first row failed');
      const res = new DirectErrorWritable();

      new CSVResponse([['ok']], {
        headers: false,
        processor: () => {
          throw processorError;
        },
      }).streamCsv(res);

      await waitForClose(res);
      await observer.settle();

      expect(res.errors).toEqual([processorError]);
      expect(res.closeCount).toBe(1);
      expect(res.headers.size).toBe(0);
      expect(observer.unhandled).toEqual([]);
      expect(observer.uncaught).toEqual([]);
    } finally {
      observer.restore();
    }
  });

  it('should give the error owner exactly one callback when the first-row processor throws', async () => {
    const observer = observeProcessFailures();

    try {
      const processorError = new Error('first row failed');
      const seen: unknown[] = [];
      const res = new DirectErrorWritable();

      new CSVResponse([['ok']], {
        headers: false,
        processor: () => {
          throw processorError;
        },
      }).streamCsv(res, (error) => {
        seen.push(error);
        res.end();
      });

      await waitForEventLoop();
      await observer.settle();

      expect(seen).toEqual([processorError]);
      expect(res.errors).toEqual([]);
      expect(res.finishCount).toBe(1);
      expect(observer.unhandled).toEqual([]);
      expect(observer.uncaught).toEqual([]);
    } finally {
      observer.restore();
    }
  });

  it('should contain a throwing error owner and still terminate with the original failure', async () => {
    const observer = observeProcessFailures();

    try {
      const processorError = new Error('first row failed');
      const seen: unknown[] = [];
      const res = new DirectErrorWritable();

      new CSVResponse([['ok']], {
        headers: false,
        processor: () => {
          throw processorError;
        },
      }).streamCsv(res, (error) => {
        seen.push(error);
        throw new Error('owner failed');
      });

      await waitForClose(res);
      await observer.settle();

      expect(seen).toEqual([processorError]);
      expect(res.errors).toEqual([processorError]);
      expect(res.closeCount).toBe(1);
      expect(observer.unhandled).toEqual([]);
      expect(observer.uncaught).toEqual([]);
    } finally {
      observer.restore();
    }
  });

  it('should preserve a non-Error first-read failure as cause on the fallback error', async () => {
    const observer = observeProcessFailures();

    try {
      const res = new DirectErrorWritable();

      new CSVResponse(failingFirstReadSource('boom' as unknown as Error), { headers: false }).streamCsv(res);

      await waitForClose(res);
      await observer.settle();

      expect(res.errors).toHaveLength(1);
      expect(res.errors[0]).toBeInstanceOf(Error);
      expect((res.errors[0] as Error).message).toBe('CSV response streaming failed');
      expect((res.errors[0] as Error & { cause: unknown }).cause).toBe('boom');
      expect(res.closeCount).toBe(1);
      expect(observer.unhandled).toEqual([]);
      expect(observer.uncaught).toEqual([]);
    } finally {
      observer.restore();
    }
  });
});
