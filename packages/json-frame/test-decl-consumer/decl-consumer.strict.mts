import {
  AmbiguousOrientError,
  JsonFrameOptionError,
  fromOrient,
  type DataFrame,
  type FromOrientOptions,
  type JsonValue,
  type SplitPayload,
  type TablePayload,
  type TableSchema,
} from '@web-ts-toolkit/json-frame';

interface WeatherRow {
  city: string;
  temp: number | null;
}

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
      pandas_version: '1.4.0',
    },
    data: [{ row_id: 'r1', city: 'Paris', temp: 21 }],
  },
  { orient: 'table' },
);

const splitPayload: SplitPayload = splitFrame.toSplit();
const tablePayload: TablePayload = tableFrame.toTable();
const splitRoundTrip = fromOrient<WeatherRow>(splitPayload, { orient: 'split' });
const tableRoundTrip = fromOrient<WeatherRow>(tablePayload, { orient: 'table' });
const recordsJson: string = recordsFrame.toJSONString('records');

expectType<DataFrame<WeatherRow>>(splitRoundTrip);
expectType<DataFrame<WeatherRow>>(tableRoundTrip);

interface FunctionRow {
  city: string;
  compute: () => number;
}

interface SymbolRow {
  city: string;
  token: symbol;
}

interface BigIntRow {
  city: string;
  count: bigint;
}

interface DateRow {
  city: string;
  observedAt: Date;
}

interface UndefinedRow {
  city: string;
  temp: number | undefined;
}

// @ts-expect-error known function properties are not JSON-compatible row values
fromOrient<FunctionRow>('[{"city":"Paris"}]');
// @ts-expect-error known symbol properties are not JSON-compatible row values
fromOrient<SymbolRow>('[{"city":"Paris"}]');
// @ts-expect-error known bigint properties are not JSON-compatible row values
fromOrient<BigIntRow>('[{"city":"Paris"}]');
// @ts-expect-error Date instances are not JSON-compatible row values
fromOrient<DateRow>('[{"city":"Paris"}]');
// @ts-expect-error explicit undefined is not a JSON-compatible row value
fromOrient<UndefinedRow>('[{"city":"Paris"}]');

// @ts-expect-error arbitrary Table Schema metadata cannot be explicitly undefined
const invalidSchemaMetadata = { fields: [], custom: undefined } satisfies TableSchema;

void [
  valuesFrame,
  indexFrame,
  columnsFrame,
  splitPayload,
  tablePayload,
  recordsJson,
  columnsFrame.columns,
  invalidSchemaMetadata,
];

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
