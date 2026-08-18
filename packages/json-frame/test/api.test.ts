import { describe, expect, expectTypeOf, it } from 'vitest';
import {
  AmbiguousOrientError,
  JsonFrameParseError,
  fromOrient,
  type DataFrame,
  type JsonValue,
} from '@web-ts-toolkit/json-frame';

describe('fromOrient', () => {
  it('produces equivalent frames for explicit and auto-detected unambiguous payloads', () => {
    const records = [
      { city: 'NYC', temp: 70 },
      { city: 'LA', temp: 80 },
    ];

    const auto = fromOrient(records);
    const explicit = fromOrient(records, { orient: 'records' });

    expect(auto.columns).toEqual(explicit.columns);
    expect(auto.index).toEqual(explicit.index);
    expect(auto.rows()).toEqual(explicit.rows());
    expect(auto.columnInfo).toEqual(explicit.columnInfo);
  });

  it('infers row types from parsed records input and defaults string input to generic JSON rows', () => {
    const inferred = fromOrient([
      { city: 'NYC', temp: 70 },
      { city: 'LA', temp: 80 },
    ]);
    const fromString = fromOrient('[{"city":"NYC","temp":70}]');

    expectTypeOf(inferred).toEqualTypeOf<DataFrame<{ city: string; temp: number }>>();
    expectTypeOf(fromString).toEqualTypeOf<DataFrame<Record<string, JsonValue>>>();
  });

  it('reports orient ambiguity for nested-object and empty payloads with actionable candidates', () => {
    for (const input of [{ row0: { city: 'NYC' } }, {}, []]) {
      try {
        fromOrient(input);
        throw new Error('expected fromOrient to throw');
      } catch (error) {
        expect(error).toBeInstanceOf(AmbiguousOrientError);
        expect(error).toMatchObject(
          Array.isArray(input) ? { candidates: ['records', 'values'] } : { candidates: ['index', 'columns'] },
        );
        expect((error as AmbiguousOrientError).message).toContain('cannot distinguish');
      }
    }
  });

  it('preserves JSON syntax failures as JsonFrameParseError causes', () => {
    try {
      fromOrient('{"city": }');
      throw new Error('expected fromOrient to throw');
    } catch (error) {
      expect(error).toBeInstanceOf(JsonFrameParseError);
      expect(error).toMatchObject({
        message: 'Failed to parse JSON input.',
      });
      expect((error as JsonFrameParseError).cause).toBeInstanceOf(SyntaxError);
    }
  });

  it('exports only the intended runtime package-root values', async () => {
    const publicApi = await import('@web-ts-toolkit/json-frame');

    expect(Object.keys(publicApi).sort()).toEqual([
      'AmbiguousOrientError',
      'ExportKeyCollisionError',
      'JsonFrameError',
      'JsonFrameOptionError',
      'JsonFrameParseError',
      'JsonFrameValidationError',
      'UnsupportedFeatureError',
      'fromOrient',
    ]);
  });
});
