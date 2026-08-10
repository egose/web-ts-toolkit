import { parse } from '@fast-csv/parse';
import express from 'express';
import request from 'supertest';
import { Writable } from 'stream';
import { describe, expect, it } from 'vitest';
import apiHandler from '../dist/index.mjs';
import { CSVResponse } from '../dist/responses/csv.mjs';

const { handleResponse, HttpResponse } = apiHandler;

const app = express();

class RecordingWritable extends Writable {
  headersSent = false;
  readonly headers = new Map<string, string>();
  readonly destroyErrors: Array<Error | undefined> = [];

  set(name: string, value: string) {
    this.headers.set(name, value);
  }

  override destroy(error?: Error): this {
    this.destroyErrors.push(error);
    return this;
  }

  override _write(_chunk: unknown, _encoding: BufferEncoding, callback: (error?: Error | null) => void) {
    this.headersSent = true;
    callback();
  }
}

class DestinationErrorWritable extends RecordingWritable {
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

class BlockingWritable extends RecordingWritable {
  readonly pendingCallbacks: Array<(error?: Error | null) => void> = [];

  constructor() {
    super({ highWaterMark: 1 } as ConstructorParameters<typeof Writable>[0]);
  }

  override _write(_chunk: unknown, _encoding: BufferEncoding, callback: (error?: Error | null) => void) {
    this.headersSent = true;
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
    const processorError = new Error('later row failed');
    const res = new RecordingWritable();

    new CSVResponse([['ok'], ['not ok']], {
      processor: (row) => {
        if (Array.isArray(row) && row[0] === 'not ok') {
          throw processorError;
        }

        return row;
      },
    }).streamCsv(res);

    await waitForEventLoop();

    expect(res.destroyErrors).toEqual([processorError]);
  });

  it('should observe destination write errors once', async () => {
    const destinationError = new Error('destination failed');
    const res = new DestinationErrorWritable(destinationError);

    new CSVResponse([['ok']]).streamCsv(res);

    await new Promise((resolve) => setImmediate(resolve));

    expect(res.destroyErrors).toEqual([destinationError]);
  });

  it('should observe formatter errors once', async () => {
    const formatterError = new Error('formatter failed');
    const row = {};
    const res = new RecordingWritable();

    Object.defineProperty(row, 'value', {
      enumerable: true,
      get() {
        throw formatterError;
      },
    });

    new CSVResponse([row]).streamCsv(res);

    await new Promise((resolve) => setImmediate(resolve));

    expect(res.destroyErrors).toEqual([formatterError]);
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
  });

  it('should run async iterator cleanup on client disconnect', async () => {
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

    expect(cleanupCalls).toBe(1);
  });

  it('should run async iterator cleanup on formatter failure', async () => {
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
    const res = new RecordingWritable();

    new CSVResponse(source, { headers: true }).streamCsv(res);
    await waitForEventLoop();

    expect(cleanupCalls).toBe(1);
    expect(res.destroyErrors).toEqual([formatterError]);
  });
});
