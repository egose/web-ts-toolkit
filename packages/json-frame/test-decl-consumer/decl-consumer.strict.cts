import type { DataFrame, JsonValue } from '@web-ts-toolkit/json-frame';

type JsonFrameModule = typeof import('@web-ts-toolkit/json-frame');

// eslint-disable-next-line @typescript-eslint/no-require-imports -- CommonJS consumer fixture.
const jsonFrame: JsonFrameModule = require('@web-ts-toolkit/json-frame');

const frame = jsonFrame.fromOrient<Record<string, JsonValue>>('[{"city":"Paris","temp":21}]');
const records = frame.toRecords();
const selected = frame.select('city');
const typedFrame: DataFrame<Record<string, JsonValue>> = frame;

void [records, selected, typedFrame, jsonFrame.AmbiguousOrientError, frame.toJSONString('split')];

// @ts-expect-error CommonJS declarations do not expose a synthetic default export
void jsonFrame.default;
