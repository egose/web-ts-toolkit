import { parse } from '@fast-csv/parse';
import express from 'express';
import { createServer, get } from 'http';
import request from 'supertest';
import { Writable } from 'stream';
import { describe, expect, it } from 'vitest';
import apiHandler from '../dist/index.mjs';
import { CSVResponse } from '../dist/responses/csv.mjs';

const { handleResponse, HttpResponse } = apiHandler;

const app = express();

// Real Node writable lifecycle: never overrides destroy, so error/close/finish
// follow actual Writable semantics. Generic-writable findings below are kept
// distinct from socket-specific behavior (covered by the Express disconnect
// regression); sockets may surface ECONNRESET/abort variants.
class CsvTestWritable extends Writable {
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

class FailingWriteWritable extends CsvTestWritable {
  private writeCount = 0;

  constructor(private readonly destinationError: Error) {
    super();
  }

  override _write(_chunk: unknown, _encoding: BufferEncoding, callback: (error?: Error | null) => void) {
    this.headersSent = true;
    this.writeCount += 1;
    callback(this.writeCount === 1 ? this.destinationError : undefined);
  }
}

class DelayedFailingWriteWritable extends CsvTestWritable {
  private writeCount = 0;

  constructor(private readonly destinationError: Error) {
    super();
  }

  override _write(chunk: unknown, encoding: BufferEncoding, callback: (error?: Error | null) => void) {
    this.headersSent = true;
    this.writeCount += 1;

    if (this.writeCount === 2) {
      setImmediate(() => callback(this.destinationError));
      return;
    }

    super._write(chunk, encoding, callback);
  }
}

class DelayedFinalWritable extends CsvTestWritable {
  constructor(private readonly finalError: Error) {
    super();
  }

  override _write(chunk: unknown, encoding: BufferEncoding, callback: (error?: Error | null) => void) {
    this.headersSent = true;
    super._write(chunk, encoding, callback);
  }

  override _final(callback: (error?: Error | null) => void) {
    setImmediate(() => callback(this.finalError));
  }
}

class BlockingWritable extends CsvTestWritable {
  readonly pendingCallbacks: Array<(error?: Error | null) => void> = [];
  writeCalls = 0;

  constructor() {
    super();
  }

  override _write(_chunk: unknown, _encoding: BufferEncoding, callback: (error?: Error | null) => void) {
    this.headersSent = true;
    this.writeCalls += 1;
    this.pendingCallbacks.push(callback);
  }

  releaseAll() {
    while (this.pendingCallbacks.length > 0) {
      this.pendingCallbacks.shift()?.();
    }
  }
}

const waitForEventLoop = async () => {
  await new Promise((resolve) => setImmediate(resolve));
};

const waitForClose = async (dest: Writable) => {
  if (dest.closed) {
    return;
  }

  // events.once(dest, 'close') rejects when dest emits 'error' first, which
  // would turn the expected destination error into a test failure. Wait only
  // for close; error is observed via the destination's own listener.
  await new Promise<void>((resolve) => dest.once('close', () => resolve()));
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

const parseCsv = async (input: string, headers: boolean) => {
  const result: Array<Record<string, string> | string[]> = [];

  await new Promise<void>((resolve, reject) => {
    const stream = parse({ headers })
      .on('error', reject)
      .on('data', (row) => result.push(row))
      .on('end', () => resolve());

    stream.write(input);
    stream.end();
  });

  return result;
};

describe('CSV responses', () => {
  it('should return stringified array of objects', async () => {
    const url = '/csv';
    const testData = [
      { col1: 'a', col2: 'b' },
      { col1: 'a1', col2: 'b1' },
      { col1: 'a2', col2: 'b2' },
    ];

    app.get(
      url,
      handleResponse(() => new CSVResponse(testData)),
    );

    const response = await request(app).get(url).expect(200).expect('Content-Type', /csv/);
    const result = await parseCsv(response.text, true);

    expect(result).toEqual(testData);
  });

  it('should infer headers for a single object row', async () => {
    const url = '/csv-single-object';
    const testData = { col1: 'a', col2: 'b' };

    app.get(
      url,
      handleResponse(() => new CSVResponse(testData)),
    );

    const response = await request(app).get(url).expect(200).expect('Content-Type', /csv/);
    const result = await parseCsv(response.text, true);

    expect(result).toEqual([testData]);
  });

  it('should return stringified array of arrays', async () => {
    const url = '/csv2';
    const testData = [
      ['a', 'b'],
      ['a1', 'b1'],
      ['a2', 'b2'],
    ];

    app.get(
      url,
      handleResponse(() => new CSVResponse(testData)),
    );

    const response = await request(app).get(url).expect(200).expect('Content-Type', /csv/);
    const result = await parseCsv(response.text, false);

    expect(result).toEqual(testData);
  });

  it('should return stringified array of arrays2', async () => {
    const url = '/csv3';
    const testData = [
      ['a', 'b'],
      ['a1', 'b1'],
      ['a2', 'b2'],
    ];

    app.get(
      url,
      handleResponse(() => HttpResponse.csv(testData)),
    );

    const response = await request(app).get(url).expect(200).expect('Content-Type', /csv/);
    const result = await parseCsv(response.text, false);

    expect(result).toEqual(testData);
  });

  it('should generate safe attachment headers for special filenames', async () => {
    const url = '/csv-filename-specials';
    const filename = 'reports/quoted "semi;slash\\unicode-😀.csv';

    app.get(
      url,
      handleResponse(() => new CSVResponse([['ok']], { filename })),
    );

    const response = await request(app).get(url).expect(200).expect('Content-Type', /csv/);

    expect(response.headers['content-disposition']).toBe(
      'attachment; filename="reports_quoted \\"semi;slash_unicode-_.csv"; filename*=UTF-8\'\'reports%2Fquoted%20%22semi%3Bslash%5Cunicode-%F0%9F%98%80.csv',
    );
  });

  it('should reject control characters in filenames before writing CSV headers', async () => {
    const url = '/csv-filename-control-character';

    app.get(
      url,
      handleResponse(() => new CSVResponse([['ok']], { filename: 'bad\r\nname.csv' })),
    );

    const response = await request(app).get(url).expect(500).expect('Content-Type', /json/);

    expect(response.headers['content-disposition']).toBeUndefined();
    expect(response.body).toEqual({ message: 'Internal Server Error' });
  });

  it('should route first-row processor failures through the JSON error path', async () => {
    const url = '/csv-first-row-processor-failure';

    app.get(
      url,
      handleResponse(
        () =>
          new CSVResponse([['ok']], {
            processor: () => {
              throw new Error('first row failed');
            },
          }),
      ),
    );

    const response = await request(app).get(url).expect(500).expect('Content-Type', /json/);

    expect(response.headers['content-disposition']).toBeUndefined();
    expect(response.body).toEqual({ message: 'Internal Server Error' });
  });

  it('should destroy the response with the original error after output starts', async () => {
    const observer = observeProcessFailures();

    try {
      const processorError = new Error('later row failed');
      const res = new CsvTestWritable();

      new CSVResponse([['ok'], ['not ok']], {
        processor: (row) => {
          if (Array.isArray(row) && row[0] === 'not ok') {
            throw processorError;
          }

          return row;
        },
      }).streamCsv(res);

      await waitForClose(res);
      await observer.settle();

      expect(res.errors).toEqual([processorError]);
      expect(res.closeCount).toBe(1);
      expect(observer.unhandled).toEqual([]);
      expect(observer.uncaught).toEqual([]);
    } finally {
      observer.restore();
    }
  });

  it('should observe destination write errors once', async () => {
    const observer = observeProcessFailures();

    try {
      const destinationError = new Error('destination failed');
      const res = new FailingWriteWritable(destinationError);

      new CSVResponse([['ok']]).streamCsv(res);

      await waitForClose(res);
      await observer.settle();

      expect(res.errors).toEqual([destinationError]);
      expect(res.closeCount).toBe(1);
      expect(observer.unhandled).toEqual([]);
      expect(observer.uncaught).toEqual([]);
    } finally {
      observer.restore();
    }
  });

  it('should observe formatter errors once', async () => {
    const observer = observeProcessFailures();

    try {
      const formatterError = new Error('formatter failed');
      const row = {};

      Object.defineProperty(row, 'value', {
        enumerable: true,
        get() {
          throw formatterError;
        },
      });

      const res = new CsvTestWritable();

      new CSVResponse([row]).streamCsv(res);

      await waitForClose(res);
      await observer.settle();

      expect(res.errors).toEqual([formatterError]);
      expect(res.closeCount).toBe(1);
      expect(observer.unhandled).toEqual([]);
      expect(observer.uncaught).toEqual([]);
    } finally {
      observer.restore();
    }
  });

  it('should stream synchronous iterables when headers are explicit', async () => {
    const url = '/csv-sync-iterable';

    function* rows() {
      yield ['a', 'b'];
      yield ['a1', 'b1'];
      yield ['a2', 'b2'];
    }

    app.get(
      url,
      handleResponse(() => new CSVResponse(rows(), { headers: false })),
    );

    const response = await request(app).get(url).expect(200).expect('Content-Type', /csv/);
    const result = await parseCsv(response.text, false);

    expect(result).toEqual([
      ['a', 'b'],
      ['a1', 'b1'],
      ['a2', 'b2'],
    ]);
  });

  it('should reject lazy sources without explicit headers', () => {
    function* rows() {
      yield ['ok'];
    }

    expect(() => new CSVResponse(rows())).toThrow('CSV lazy sources require an explicit headers option');
  });

  it('should pause generated row consumption while downstream is backpressured', async () => {
    const totalRows = 100_000;
    let generatedRows = 0;
    const res = new BlockingWritable();

    function* rows() {
      for (let index = 0; index < totalRows; index += 1) {
        generatedRows += 1;
        yield [index, 'x'.repeat(1024)];
      }
    }

    new CSVResponse(rows(), { headers: false }).streamCsv(res);

    for (let index = 0; index < 5; index += 1) {
      await waitForEventLoop();
    }

    expect(generatedRows).toBeLessThan(20_000);
    expect(generatedRows).toBeLessThan(totalRows);

    res.releaseAll();
    res.destroy();
    await waitForClose(res).catch(() => undefined);
  });

  it('should run async iterator cleanup on client disconnect', async () => {
    const observer = observeProcessFailures();

    try {
      let cleanupCalls = 0;
      let value = 0;
      const source: AsyncIterable<unknown> = {
        [Symbol.asyncIterator]() {
          return {
            async next() {
              value += 1;
              return { done: false, value: [value] };
            },
            async return() {
              cleanupCalls += 1;
              return { done: true, value: undefined };
            },
          };
        },
      };
      const res = new BlockingWritable();

      new CSVResponse(source, { headers: false }).streamCsv(res);
      await waitForEventLoop();
      res.emit('close');
      await waitForEventLoop();
      res.releaseAll();
      // Real destroy still owns termination after the synthetic close.
      if (!res.closed) {
        res.destroy();
        await waitForClose(res).catch(() => undefined);
      }

      await observer.settle();

      expect(cleanupCalls).toBe(1);
      expect(observer.unhandled).toEqual([]);
      expect(observer.uncaught).toEqual([]);
    } finally {
      observer.restore();
    }
  });

  it('should run async iterator cleanup on formatter failure', async () => {
    const observer = observeProcessFailures();

    try {
      const formatterError = new Error('formatter failed');
      let cleanupCalls = 0;
      const row = {};

      Object.defineProperty(row, 'value', {
        enumerable: true,
        get() {
          throw formatterError;
        },
      });

      const source: AsyncIterable<unknown> = {
        [Symbol.asyncIterator]() {
          return {
            async next() {
              return { done: false, value: row };
            },
            async return() {
              cleanupCalls += 1;
              return { done: true, value: undefined };
            },
          };
        },
      };
      const res = new CsvTestWritable();

      new CSVResponse(source, { headers: true }).streamCsv(res);
      await waitForClose(res);
      await observer.settle();

      expect(cleanupCalls).toBe(1);
      expect(res.errors).toEqual([formatterError]);
    } finally {
      observer.restore();
    }
  });
});

describe('CSV destination termination (B-ERH-04)', () => {
  it('should contain a synchronously throwing iterator return without displacing the initiating failure', async () => {
    const observer = observeProcessFailures();

    try {
      const processorError = new Error('later row failed');
      const cleanupError = new Error('sync cleanup failed');
      let cleanupCalls = 0;
      let calls = 0;
      const directSource: AsyncIterable<unknown> = {
        [Symbol.asyncIterator]() {
          return {
            async next() {
              calls += 1;

              if (calls === 2) {
                throw processorError;
              }

              return { done: false, value: ['row'] };
            },
            return(): never {
              cleanupCalls += 1;
              throw cleanupError;
            },
          };
        },
      };

      const directRes = new CsvTestWritable();

      new CSVResponse(directSource, { headers: false }).streamCsv(directRes);
      await waitForClose(directRes);
      await observer.settle();

      expect(cleanupCalls).toBeGreaterThanOrEqual(1);
      expect(directRes.errors).toEqual([processorError]);
      expect(directRes.closeCount).toBe(1);
      expect(observer.unhandled).toEqual([]);
      expect(observer.uncaught).toEqual([]);
    } finally {
      observer.restore();
    }
  });

  it('should contain a rejecting iterator return without unhandled rejection', async () => {
    const observer = observeProcessFailures();

    try {
      const processorError = new Error('initiating failure');
      const cleanupError = new Error('async cleanup failed');
      let cleanupCalls = 0;
      let calls = 0;
      const source: AsyncIterable<unknown> = {
        [Symbol.asyncIterator]() {
          return {
            async next() {
              calls += 1;

              if (calls === 2) {
                throw processorError;
              }

              return { done: false, value: ['row'] };
            },
            async return() {
              cleanupCalls += 1;
              throw cleanupError;
            },
          };
        },
      };
      const res = new CsvTestWritable();

      new CSVResponse(source, { headers: false }).streamCsv(res);
      await waitForClose(res);
      await observer.settle();

      expect(cleanupCalls).toBe(1);
      expect(res.errors).toEqual([processorError]);
      expect(res.closeCount).toBe(1);
      expect(observer.unhandled).toEqual([]);
      expect(observer.uncaught).toEqual([]);
    } finally {
      observer.restore();
    }
  });

  it('should contain a throwing generator finally and keep the original failure observable', async () => {
    const observer = observeProcessFailures();

    try {
      const processorError = new Error('later row failed');
      const finallyError = new Error('finally failed');
      let finallyCalls = 0;

      function* rows(): Generator<unknown> {
        try {
          yield ['ok'];
          yield ['not ok'];
          yield ['never'];
        } finally {
          finallyCalls += 1;
          // eslint-disable-next-line no-unsafe-finally -- intentional throwing cleanup for B-ERH-04 containment.
          throw finallyError;
        }
      }

      const res = new CsvTestWritable();

      new CSVResponse(rows(), {
        headers: false,
        processor: (row) => {
          if (Array.isArray(row) && row[0] === 'not ok') {
            throw processorError;
          }

          return row;
        },
      }).streamCsv(res);

      await waitForClose(res);
      await observer.settle();

      expect(finallyCalls).toBe(1);
      expect(res.errors).toEqual([processorError]);
      expect(res.closeCount).toBe(1);
      expect(observer.unhandled).toEqual([]);
      expect(observer.uncaught).toEqual([]);
    } finally {
      observer.restore();
    }
  });

  it('should terminate on a delayed _write failure with the original error', async () => {
    const observer = observeProcessFailures();

    try {
      const destinationError = new Error('delayed write failed');
      const res = new DelayedFailingWriteWritable(destinationError);

      new CSVResponse([['a'], ['b'], ['c']], { headers: false }).streamCsv(res);

      await waitForClose(res);
      await observer.settle();

      expect(res.errors).toEqual([destinationError]);
      expect(res.closeCount).toBe(1);
      expect(observer.unhandled).toEqual([]);
      expect(observer.uncaught).toEqual([]);
    } finally {
      observer.restore();
    }
  });

  it('should terminate on a delayed _final failure without unhandled rejection', async () => {
    const observer = observeProcessFailures();

    try {
      const finalError = new Error('delayed final failed');
      const res = new DelayedFinalWritable(finalError);

      new CSVResponse([['ok']], { headers: false }).streamCsv(res);

      await waitForClose(res);
      await observer.settle();

      expect(res.errors).toEqual([finalError]);
      expect(res.closeCount).toBe(1);
      expect(observer.unhandled).toEqual([]);
      expect(observer.uncaught).toEqual([]);
    } finally {
      observer.restore();
    }
  });

  it('should terminate on premature close while flushing without uncaught error', async () => {
    const observer = observeProcessFailures();

    try {
      const res = new BlockingWritable();

      function* rows() {
        yield ['a'];
        yield ['b'];
        yield ['c'];
      }

      new CSVResponse(rows(), { headers: false }).streamCsv(res);

      // Gate until the pump blocks on backpressure instead of sleeping.
      for (let index = 0; index < 20 && res.writeCalls === 0; index += 1) {
        await waitForEventLoop();
      }

      expect(res.writeCalls).toBeGreaterThan(0);

      res.emit('close');
      await waitForEventLoop();
      res.releaseAll();

      if (!res.closed) {
        res.destroy();
      }

      await waitForClose(res).catch(() => undefined);
      await observer.settle();

      const abortError = res.errors.find(
        (error) => error instanceof Error && error.message === 'CSV response streaming aborted',
      );

      expect(abortError).toBeDefined();
      expect(observer.unhandled).toEqual([]);
      expect(observer.uncaught).toEqual([]);
    } finally {
      observer.restore();
    }
  });

  it('should contain a throwing pre-output error owner without uncaught error', async () => {
    const observer = observeProcessFailures();

    try {
      const seen: unknown[] = [];
      const res = new CsvTestWritable();

      new CSVResponse([['ok']], {
        processor: () => {
          throw new Error('first row failed');
        },
      }).streamCsv(res, (error) => {
        seen.push(error);
        throw new Error('owner failed');
      });

      await waitForClose(res);
      await observer.settle();

      expect(seen).toHaveLength(1);
      expect(seen[0]).toBeInstanceOf(Error);
      expect((seen[0] as Error).message).toBe('first row failed');
      // B-ERH-06 contract: a throwing owner is contained, but the destination
      // is still terminated with the original failure (no open destination).
      expect(res.errors).toEqual(seen);
      expect(res.closeCount).toBe(1);
      expect(observer.unhandled).toEqual([]);
      expect(observer.uncaught).toEqual([]);
    } finally {
      observer.restore();
    }
  });

  it('should remove owned listeners and end once on success', async () => {
    const observer = observeProcessFailures();

    try {
      const res = new CsvTestWritable();
      const errorListenersBefore = res.listenerCount('error');
      const closeListenersBefore = res.listenerCount('close');
      const finishListenersBefore = res.listenerCount('finish');

      new CSVResponse([['a'], ['b']], { headers: false }).streamCsv(res);

      await waitForFinishOrClose(res);
      await observer.settle();

      expect(res.finishCount).toBe(1);
      expect(res.errors).toEqual([]);
      expect(res.listenerCount('error')).toBe(errorListenersBefore);
      expect(res.listenerCount('close')).toBe(closeListenersBefore);
      expect(res.listenerCount('finish')).toBe(finishListenersBefore);
      expect(res.writableEnded).toBe(true);
      expect(observer.unhandled).toEqual([]);
      expect(observer.uncaught).toEqual([]);
    } finally {
      observer.restore();
    }
  });

  it('should survive an Express client disconnect without process-level failure (socket-specific)', async () => {
    const observer = observeProcessFailures();
    const disconnectApp = express();

    disconnectApp.get(
      '/csv-disconnect',
      handleResponse(() => {
        async function* rows(): AsyncGenerator<unknown> {
          for (let index = 0; index < 1000; index += 1) {
            await new Promise((resolve) => setImmediate(resolve));
            yield [index];
          }
        }

        return new CSVResponse(rows(), { headers: false });
      }),
    );

    const server = createServer(disconnectApp);

    try {
      await new Promise<void>((resolve) => server.listen(0, resolve));
      const address = server.address();

      if (address === null || typeof address === 'string') {
        throw new Error('expected a TCP server address');
      }

      // Generic-writable close above is synthetic (emit); here the socket
      // actually disconnects mid-stream, which is socket-specific behavior.
      await new Promise<void>((resolve, reject) => {
        const timeout = setTimeout(() => reject(new Error('timed out waiting for first chunk')), 5000);

        if (typeof timeout.unref === 'function') {
          timeout.unref();
        }

        const client = get({ port: address.port, path: '/csv-disconnect' }, (incoming) => {
          incoming.once('data', () => {
            clearTimeout(timeout);
            client.destroy();
            resolve();
          });
          incoming.on('error', () => undefined);
        });

        client.on('error', () => {
          clearTimeout(timeout);
          resolve();
        });
      });

      await observer.settle();

      // Server stays usable after the abort: a full export still succeeds.
      const healthy = await request(disconnectApp).get('/csv-disconnect').expect(200);
      expect(healthy.headers['content-type']).toMatch(/csv/);
      expect(observer.unhandled).toEqual([]);
      expect(observer.uncaught).toEqual([]);
    } finally {
      observer.restore();
      await new Promise<void>((resolve) => server.close(() => resolve()));
    }
  });
});
