import { format } from '@fast-csv/format';
import { castArray, isBoolean, isPlainObject } from '@web-ts-toolkit/utils';
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

  /**
   * Streams the dataset as CSV into `res`.
   *
   * Contract choice (B-ERH-06): minimal runtime-safe fallback, no breaking
   * signature change. `onBeforeOutputError` stays optional.
   *
   * - Pre-output failure (invalid filename, failed first read, first-row
   *   processor throw, before headers are sent) with an error owner:
   *   the owner is invoked exactly once with the normalized failure and owns
   *   destination termination (the handler owner renders a single redacted
   *   JSON error; direct callers must end/destroy `res` themselves). A
   *   throwing owner is contained and the destination is then destroyed with
   *   the original failure so it never stays open.
   * - Pre-output failure without an error owner: deterministic fallback —
   *   the destination is destroyed with the normalized failure (or ended
   *   when `destroy` is unavailable), observable via `error` + `close`.
   * - Post-output failure (after piping starts): the destination is always
   *   destroyed with the failure, with or without an owner.
   *
   * Non-`Error` failures are wrapped in an `Error` with the original kept as
   * `cause`. A throwing owner never displaces the original failure and never
   * escapes as a process-level error.
   */
  streamCsv(res: CsvStreamResponse, onBeforeOutputError?: CsvErrorHandler): void {
    const stream = format({ headers: this.headers });
    let outputStarted = false;
    let failed = false;
    let finished = false;
    let cleaned = false;
    let activeIterator: AsyncIterator<unknown> | null = null;
    // Bounded cancellation: fail() flips `failed` and wakes the single active
    // drain waiter (if any). The pump never races each row against a shared
    // pending promise, so no per-row reaction accumulates for the export
    // duration. Backpressure is still observed via drain; iterator cleanup
    // stays one-time via closeActiveIterator.
    // Limitation: a pending iterator.next() cannot be cancelled. Abort only
    // prevents subsequent processing after the read settles. Prompt
    // cancellation of a stuck read requires a cooperative source (for example
    // next() that rejects on abort, or a return() that settles the read).
    const abortWaiters = new Set<() => void>();
    const notifyAborted = (): void => {
      for (const notify of Array.from(abortWaiters)) {
        abortWaiters.delete(notify);

        try {
          notify();
        } catch {
          // A waking waiter must not interrupt notifying the rest.
        }
      }
    };

    const cleanup = () => {
      if (cleaned) {
        return;
      }

      cleaned = true;
      stream.off('error', fail);
      res.off?.('error', fail);
      res.off?.('close', handleClose);
      res.off?.('finish', handleFinish);
    };

    const closeActiveIterator = () => {
      const iterator = activeIterator;
      activeIterator = null;

      if (!iterator?.return) {
        return;
      }

      // Contain synchronous cleanup throws without displacing the initiating
      // failure or interrupting stream termination. Asynchronous rejections
      // are observed to avoid unhandled rejections.
      try {
        void Promise.resolve(iterator.return()).catch((): undefined => undefined);
      } catch {
        return;
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
      notifyAborted();
      const normalizedError =
        error instanceof Error
          ? error
          : (() => {
              const wrapped = new Error('CSV response streaming failed');

              try {
                (wrapped as Error & { cause: unknown }).cause = error;
              } catch {
                // Preserve termination even if cause assignment fails.
              }

              return wrapped;
            })();
      closeActiveIterator();

      if (!outputStarted && !res.headersSent) {
        stream.destroy();

        if (onBeforeOutputError) {
          cleanup();

          try {
            onBeforeOutputError(normalizedError);
          } catch {
            // A throwing error owner must not displace the original failure,
            // escape as a process-level error, or leave the destination open.
            // Ownership was already released by cleanup(), so observe the
            // fallback destroy error locally before terminating.
            try {
              res.on?.('error', (): undefined => undefined);
            } catch {
              // Termination still attempted below.
            }

            try {
              closeResponse(normalizedError);
            } catch {
              // Destination termination is best-effort once observed.
            }
          }

          return;
        }

        // Callback-free pre-output failure: deterministic fallback. Retain
        // destination error/close/finish ownership through actual destruction
        // (cleanup runs on close/finish) so the failure stays observable via
        // `error` + `close` and the destination never stays open.
        try {
          closeResponse(normalizedError);
        } catch {
          cleanup();
        }

        return;
      }

      stream.destroy();

      // Retain destination error/close/finish ownership through actual
      // destruction. Cleanup runs on close/finish, not here, so delayed
      // _write/_final failures and destroy errors stay observed.
      closeResponse(normalizedError);
    };

    const handleClose = () => {
      if (!finished && !failed) {
        fail(new Error('CSV response streaming aborted'));
        // The close that triggered this failure is already in flight, so no
        // later close/finish will drive terminal cleanup.
        cleanup();
        return;
      }

      // Terminal close after success (finish) or after failure destruction:
      // actual destination completion, now release owned listeners.
      cleanup();
    };

    const handleFinish = () => {
      finished = true;
      cleanup();
    };

    const writeRow = async (row: unknown) => {
      if (failed) {
        return;
      }

      outputStarted = true;

      if (!stream.write(row)) {
        await new Promise<void>((resolve) => {
          if (failed) {
            resolve();
            return;
          }

          const onDrain = (): void => {
            stream.off('drain', onDrain);
            abortWaiters.delete(onAbort);
            resolve();
          };
          const onAbort = (): void => {
            stream.off('drain', onDrain);
            resolve();
          };
          abortWaiters.add(onAbort);
          stream.once('drain', onDrain);
        });
      }
    };

    stream.on('error', fail);
    res.on?.('error', fail);
    res.on?.('close', handleClose);
    res.on?.('finish', handleFinish);

    const pump = async () => {
      try {
        const iterator = createAsyncIterator(this.dataset);
        activeIterator = iterator;
        const first = await iterator.next();

        // First-read cancellation: a disconnect may settle while the read is
        // pending. Never process, assign headers, pipe, or write afterwards.
        // A pending read itself cannot be cancelled; this only prevents
        // subsequent work after it settles (see the cooperative-source note).
        if (failed) {
          return;
        }

        let firstRow: unknown;

        if (!first.done) {
          firstRow = this.processor(first.value);

          if (failed) {
            return;
          }
        }

        const contentDisposition = createAttachmentContentDisposition(this.filename);

        if (failed) {
          return;
        }

        res.set('Content-Type', 'text/csv');
        res.set('Content-Disposition', contentDisposition);
        stream.pipe(res as unknown as Writable);

        // Respect completion immediately: an exhausted source must not be
        // read again (a second read may throw or never settle).
        if (first.done) {
          if (!failed) {
            stream.end();
          }

          return;
        }

        await writeRow(firstRow);

        while (!failed) {
          const result = await iterator.next();

          if (failed) {
            return;
          }

          if (result.done) {
            break;
          }

          const processed = this.processor(result.value);

          if (failed) {
            return;
          }

          await writeRow(processed);
        }

        if (!failed) {
          stream.end();
        }
      } catch (error) {
        fail(error);
      } finally {
        activeIterator = null;
      }
    };

    void pump().then(undefined, (): undefined => undefined);
  }
}
