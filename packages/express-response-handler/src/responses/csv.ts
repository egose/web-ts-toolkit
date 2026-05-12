import { format } from '@fast-csv/format';
import { castArray, isBoolean, isPlainObject } from '@web-ts-toolkit/utils';

type CsvProcessor = (value: unknown) => unknown;

type CsvResponseOptions = {
  filename?: string;
  headers?: boolean;
  processor?: CsvProcessor;
};

type CsvStreamResponse = {
  set(name: string, value: string): unknown;
  destroy?(error?: Error): void;
  end(): void;
};

export class CSVResponse {
  readonly dataset: unknown[];
  readonly filename: string;
  readonly processor: CsvProcessor;
  readonly headers?: boolean;

  constructor(dataset: unknown = [], options: CsvResponseOptions = {}) {
    this.dataset = castArray(dataset);
    this.filename = options.filename || 'download.csv';
    this.processor = options.processor || ((value) => value);

    if (isBoolean(options.headers)) {
      this.headers = options.headers;
    } else if (this.dataset.length > 0) {
      this.headers = isPlainObject(this.dataset[0]);
    }
  }

  streamCsv(res: CsvStreamResponse): void {
    const stream = format({ headers: this.headers });

    res.set('Content-Type', 'text/csv');
    res.set('Content-Disposition', `attachment;filename=${this.filename}`);
    stream.pipe(res as never);
    stream.on('error', (error) => {
      if (res.destroy) {
        res.destroy(error);
        return;
      }

      res.end();
    });
    stream.on('end', () => res.end());
    this.dataset.forEach((value) => stream.write(this.processor(value)));
    stream.end();
  }
}
