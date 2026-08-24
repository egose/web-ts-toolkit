import { fromOrient, type ColumnType, type DataFrame, type JsonValue } from '@web-ts-toolkit/json-frame';

interface WeatherRow {
  city: string;
  temp: number;
  coastal: boolean;
}

const frame = fromOrient<WeatherRow>(
  [
    { city: 'Paris', temp: 21.5, coastal: false },
    { city: 'Tokyo', temp: 27.1, coastal: true },
  ],
  {
    orient: 'records',
    columnTypes: {
      temp: 'float',
      coastal: 'boolean',
    },
    packThreshold: 0,
  },
);

const columnTypes: ColumnType[] = [...frame.columnInfo.values()].map((info) => info.type);
const json: string = frame.toJSONString('split');
const parsed: JsonValue = JSON.parse(json) as JsonValue;
const splitRoundTrip = fromOrient<WeatherRow>(frame.toSplit(), { orient: 'split' });
const tableRoundTrip = fromOrient<WeatherRow>(frame.toTable(), { orient: 'table' });
const typedRoundTrips: readonly DataFrame<WeatherRow>[] = [splitRoundTrip, tableRoundTrip];

void [columnTypes, parsed, frame.rows(), frame.toTable(), typedRoundTrips];
