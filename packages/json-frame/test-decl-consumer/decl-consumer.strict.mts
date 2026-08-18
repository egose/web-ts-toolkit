import {
  AmbiguousOrientError,
  JsonFrameOptionError,
  fromOrient,
  type DataFrame,
  type FromOrientOptions,
  type JsonValue,
  type SplitPayload,
  type TablePayload,
} from '@web-ts-toolkit/json-frame';

type WeatherRow = {
  city: string;
  temp: number | null;
};

function expectType<T>(_value: T): void {
  void _value;
}

const recordsFrame = fromOrient<WeatherRow>('[{"city":"Paris","temp":21},{"city":"Berlin","temp":null}]');
const firstRow = recordsFrame.row(0);
const filtered = recordsFrame.filter((row, index, position) => {
  expectType<Readonly<WeatherRow>>(row);
  expectType<string | number>(index);
  expectType<number>(position);
  return row.temp !== null;
});

expectType<DataFrame<WeatherRow>>(recordsFrame);
expectType<Readonly<WeatherRow>>(firstRow);
expectType<DataFrame<Record<string, JsonValue>>>(recordsFrame.select('city'));
expectType<DataFrame<Record<string, JsonValue>>>(recordsFrame.rename({ temp: 'celsius' }));
expectType<DataFrame<WeatherRow>>(filtered.sort((left, right) => Number(right.temp ?? -1) - Number(left.temp ?? -1)));
expectType<DataFrame<WeatherRow>>(recordsFrame.resetIndex());

const valuesOptions: FromOrientOptions = {
  orient: 'values',
  columns: ['city', 'temp'],
  packThreshold: 0,
};

const valuesFrame = fromOrient<WeatherRow>(
  [
    ['Paris', 21],
    ['Berlin', null],
  ],
  valuesOptions,
);
const indexFrame = fromOrient<WeatherRow>({ r1: { city: 'Paris', temp: 21 } }, { orient: 'index' });
const columnsFrame = fromOrient<WeatherRow>(
  {
    city: { r1: 'Paris' },
    temp: { r1: 21 },
  },
  { orient: 'columns' },
);
const splitFrame = fromOrient<WeatherRow>(
  {
    columns: ['city', 'temp'],
    index: ['r1'],
    data: [['Paris', 21]],
  },
  { orient: 'split' },
);
const tableFrame = fromOrient<WeatherRow>(
  {
    schema: {
      fields: [
        { name: 'row_id', type: 'string' },
        { name: 'city', type: 'string' },
        { name: 'temp', type: 'integer' },
      ],
      primaryKey: ['row_id'],
      pandas_version: '3.0.3',
    },
    data: [{ row_id: 'r1', city: 'Paris', temp: 21 }],
  },
  { orient: 'table' },
);

const splitPayload: SplitPayload = splitFrame.toSplit();
const tablePayload: TablePayload = tableFrame.toTable();
const recordsJson: string = recordsFrame.toJSONString('records');

void [valuesFrame, indexFrame, columnsFrame, splitPayload, tablePayload, recordsJson, columnsFrame.columns];

try {
  fromOrient({ r1: { city: 'Paris', temp: 21 } });
} catch (error) {
  if (error instanceof AmbiguousOrientError) {
    expectType<readonly string[]>(error.candidates);
  }
}

try {
  fromOrient([['Paris', 21]], { orient: 'values' });
} catch (error) {
  if (error instanceof JsonFrameOptionError) {
    expectType<string>(error.option);
  }
}

// @ts-expect-error package root is named-export only
type DefaultExport = (typeof import('@web-ts-toolkit/json-frame'))['default'];
// @ts-expect-error internal option normalization is not exported from the package root
type InternalNormalizer = typeof import('@web-ts-toolkit/json-frame').normalizeFromOrientOptions;

void (0 as DefaultExport | InternalNormalizer | 0);
