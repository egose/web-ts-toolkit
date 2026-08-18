import { fromOrient, type ColumnType, type JsonValue } from '@web-ts-toolkit/json-frame';

const frame = fromOrient(
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

void [columnTypes, parsed, frame.rows(), frame.toTable()];
