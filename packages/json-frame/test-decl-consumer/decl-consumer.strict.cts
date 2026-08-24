import type { DataFrame, JsonValue } from '@web-ts-toolkit/json-frame';

type JsonFrameModule = typeof import('@web-ts-toolkit/json-frame');

// eslint-disable-next-line @typescript-eslint/no-require-imports -- CommonJS consumer fixture.
const jsonFrame: JsonFrameModule = require('@web-ts-toolkit/json-frame');

const frame = jsonFrame.fromOrient<Record<string, JsonValue>>('[{"city":"Paris","temp":21}]');
const records = frame.toRecords();
const selected = frame.select('city');
const typedFrame: DataFrame<Record<string, JsonValue>> = frame;
interface WeatherRow {
  city: string;
  temp: number | null;
}

const weatherFrame = jsonFrame.fromOrient<WeatherRow>('[{"city":"Paris","temp":21}]');
const splitRoundTrip = jsonFrame.fromOrient<WeatherRow>(weatherFrame.toSplit(), { orient: 'split' });
const tableRoundTrip = jsonFrame.fromOrient<WeatherRow>(weatherFrame.toTable(), { orient: 'table' });

void [
  records,
  selected,
  typedFrame,
  jsonFrame.AmbiguousOrientError,
  frame.toJSONString('split'),
  splitRoundTrip,
  tableRoundTrip,
];

// @ts-expect-error CommonJS declarations do not expose a synthetic default export
void jsonFrame.default;
