import { format } from '@fast-csv/format';
import { castArray, isBoolean, isPlainObject } from '@web-ts-toolkit/utils';
import { once } from 'events';
import type { Writable } from 'stream';

type CsvProcessor = (value: unknown) => unknown;
type CsvErrorHandler = (error: unknown) => void;
type CsvHeaders = boolean | string[];
export type CsvSource = unknown[] | Iterable<unknown> | AsyncIterable<unknown> | unknown;

export type CsvResponseOptions = {
  filename?: string;
  headers?: CsvHeaders;
  processor?: CsvProcessor;
};

type CsvStreamResponse = {
  headersSent?: boolean;
  set(name: string, value: string): unknown;
  destroy?(error?: Error): void;
  end(): void;
  on?(event: 'error' | 'close' | 'finish', listener: (...args: unknown[]) => void): unknown;
  off?(event: 'error' | 'close' | 'finish', listener: (...args: unknown[]) => void): unknown;
};

// eslint-disable-next-line no-control-regex -- CSV filenames reject control characters before writing headers.
const CONTROL_CHARACTER_PATTERN = /[\u0000-\u001f\u007f]/u;

const isIterable = (value: unknown): value is Iterable<unknown> =>
  typeof value === 'object' && value !== null && Symbol.iterator in value;

const isAsyncIterable = (value: unknown): value is AsyncIterable<unknown> =>
  typeof value === 'object' && value !== null && Symbol.asyncIterator in value;

const isLazyCsvSource = (value: unknown): value is Iterable<unknown> | AsyncIterable<unknown> =>
  !Array.isArray(value) && (isIterable(value) || isAsyncIterable(value));

const createAsyncIterator = (source: CsvSource): AsyncIterator<unknown> => {
  if (isAsyncIterable(source)) {
    return source[Symbol.asyncIterator]();
  }

  const iterator = (isIterable(source) ? source : castArray(source))[Symbol.iterator]();

  return {
    next: () => Promise.resolve(iterator.next()),
    return: (value?: unknown) => {
      if (iterator.return) {
        return Promise.resolve(iterator.return(value));
      }

      return Promise.resolve({ done: true, value });
    },
  };
};

const encodeRFC5987Value = (value: string): string =>
  encodeURIComponent(value).replace(/[!'()*]/g, (char) => `%${char.charCodeAt(0).toString(16).toUpperCase()}`);

const createQuotedFilenameFallback = (filename: string): string => {
  const fallback = Array.from(filename.replace(/[\\/]/g, '_'), (char) => {
    const codePoint = char.codePointAt(0) ?? 0;

    return codePoint >= 0x20 && codePoint <= 0x7e ? char : '_';
  }).join('');

  return fallback.replace(/(["\\])/g, '\\$1');
};

const createAttachmentContentDisposition = (filename: string): string => {
  if (CONTROL_CHARACTER_PATTERN.test(filename)) {
    throw new TypeError('CSV filename cannot contain control characters');
  }

  const fallback = createQuotedFilenameFallback(filename);

  return `attachment; filename="${fallback}"; filename*=UTF-8''${encodeRFC5987Value(filename)}`;
};

export const csvResponseBrand = Symbol.for('@web-ts-toolkit/express-response-handler.csv-response');

export const isCSVResponse = (value: unknown): value is CSVResponse => {
  if (value instanceof CSVResponse) {
    return true;
  }

  if (typeof value !== 'object' || value === null) {
    return false;
  }

  const candidate = value as CSVResponse & Record<typeof csvResponseBrand, unknown>;

  return candidate[csvResponseBrand] === true && typeof candidate.streamCsv === 'function';
};

export class CSVResponse {
  readonly [csvResponseBrand] = true;
  readonly dataset: CsvSource;
  readonly filename: string;
  readonly processor: CsvProcessor;
  readonly headers?: CsvHeaders;

  constructor(dataset: CsvSource = [], options: CsvResponseOptions = {}) {
    this.dataset = dataset;
    this.filename = options.filename || 'download.csv';
    this.processor = options.processor || ((value) => value);

    if (isBoolean(options.headers) || Array.isArray(options.headers)) {
      this.headers = options.headers;
    } else if (Array.isArray(this.dataset) && this.dataset.length > 0) {
      this.headers = isPlainObject(this.dataset[0]);
    } else if (isLazyCsvSource(this.dataset)) {
      throw new TypeError('CSV lazy sources require an explicit headers option');
    } else {
      this.headers = isPlainObject(this.dataset);
    }
  }

  streamCsv(res: CsvStreamResponse, onBeforeOutputError?: CsvErrorHandler): void {
    const stream = format({ headers: this.headers });
    let outputStarted = false;
    let failed = false;
    let finished = false;
    let activeIterator: AsyncIterator<unknown> | null = null;
    let abortStreaming: (error: Error) => void = () => undefined;
    const abortSignal = new Promise<never>((_, reject) => {
      abortStreaming = reject;
    });
    abortSignal.catch((): undefined => undefined);

    const cleanup = () => {
      stream.off('error', fail);
      res.off?.('error', fail);
      res.off?.('close', abort);
      res.off?.('finish', markFinished);
    };

    const closeActiveIterator = () => {
      const iterator = activeIterator;
      activeIterator = null;

      if (iterator?.return) {
        void Promise.resolve(iterator.return()).catch((): undefined => undefined);
      }
    };

    const closeResponse = (error: Error) => {
      if (res.destroy) {
        res.destroy(error);
        return;
      }

      res.end();
    };

    const fail = (error: unknown) => {
      if (failed) {
        return;
      }

      failed = true;
      cleanup();

      const normalizedError = error instanceof Error ? error : new Error('CSV response streaming failed');
      abortStreaming(normalizedError);
      closeActiveIterator();

      if (!outputStarted && !res.headersSent) {
        onBeforeOutputError?.(normalizedError);
        return;
      }

      stream.destroy();
      closeResponse(normalizedError);
    };

    const abort = () => {
      if (!finished) {
        fail(new Error('CSV response streaming aborted'));
      }
    };

    const markFinished = () => {
      finished = true;
    };

    const writeRow = async (row: unknown) => {
      outputStarted = true;

      if (!stream.write(row)) {
        await Promise.race([once(stream, 'drain'), abortSignal]);
      }
    };

    stream.on('error', fail);
    stream.on('end', cleanup);
    res.on?.('error', fail);
    res.on?.('close', abort);
    res.on?.('finish', markFinished);

    const pump = async () => {
      try {
        const iterator = createAsyncIterator(this.dataset);
        activeIterator = iterator;
        const first = await iterator.next();
        const firstRow = first.done ? undefined : this.processor(first.value);
        const contentDisposition = createAttachmentContentDisposition(this.filename);

        res.set('Content-Type', 'text/csv');
        res.set('Content-Disposition', contentDisposition);
        stream.pipe(res as unknown as Writable);

        if (!first.done) {
          await writeRow(firstRow);
        }

        while (!failed) {
          const row = await Promise.race([iterator.next(), abortSignal]);

          if (row.done) {
            break;
          }

          await writeRow(this.processor(row.value));
        }

        if (!failed) {
          finished = true;
          stream.end();
        }
      } catch (error) {
        fail(error);
      } finally {
        activeIterator = null;
      }
    };

    void pump();
  }
}
