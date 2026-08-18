import { describe, expect, expectTypeOf, it } from 'vitest';
import {
  AmbiguousOrientError,
  ExportKeyCollisionError,
  JsonFrameParseError,
  JsonFrameValidationError,
  UnsupportedFeatureError,
  type ColumnInfo,
  type ColumnType,
  type FromOrientOptions,
  type Orient,
  type ResolvedOrient,
  type SplitPayload,
  type TablePayload,
} from '@web-ts-toolkit/json-frame';
import { JsonFrameOptionError } from '../src/errors';
import { DEFAULT_PACK_THRESHOLD, normalizeFromOrientOptions } from '../src/options';

describe('public types', () => {
  it('keep row and cell payload typing separate', () => {
    type LogicalTypes = ColumnType;
    type ParseOptions = FromOrientOptions;
    type DetectedOrient = Orient;
    type ConcreteOrient = ResolvedOrient;

    expectTypeOf<LogicalTypes>().toEqualTypeOf<
      'integer' | 'float' | 'string' | 'boolean' | 'datetime' | 'categorical' | 'mixed' | 'unknown'
    >();
    expectTypeOf<ParseOptions['orient']>().toEqualTypeOf<DetectedOrient | undefined>();
    expectTypeOf<ConcreteOrient>().not.toEqualTypeOf<'auto'>();
    expectTypeOf<SplitPayload['data'][number]>().toEqualTypeOf<readonly unknown[]>();
    expectTypeOf<TablePayload['data'][number]>().toExtend<Record<string, unknown>>();
    expectTypeOf<ColumnInfo>().toEqualTypeOf<{ readonly type: ColumnType; readonly nullable: boolean }>();
  });
});

describe('normalizeFromOrientOptions', () => {
  it('applies scalar defaults while leaving columns and columnTypes optional', () => {
    expect(normalizeFromOrientOptions()).toEqual({
      orient: 'auto',
      packThreshold: DEFAULT_PACK_THRESHOLD,
    });

    expect(
      normalizeFromOrientOptions({ columns: ['city'], columnTypes: { city: 'string' }, packThreshold: 0 }),
    ).toEqual({
      orient: 'auto',
      columns: ['city'],
      columnTypes: { city: 'string' },
      packThreshold: 0,
    });
  });

  it.each([-1, 1.5, Number.NaN, Number.POSITIVE_INFINITY, Number.NEGATIVE_INFINITY])(
    'rejects invalid packThreshold %p with JsonFrameOptionError',
    (packThreshold) => {
      try {
        normalizeFromOrientOptions({ packThreshold });
        throw new Error('expected normalizeFromOrientOptions to throw');
      } catch (error) {
        expect(error).toBeInstanceOf(JsonFrameOptionError);
        expect(error).toMatchObject({
          name: 'JsonFrameOptionError',
          option: 'packThreshold',
          value: packThreshold,
        });
      }
    },
  );
});

describe('structured errors', () => {
  it('preserves SyntaxError causes on parse failures', () => {
    const syntaxError = new SyntaxError('Unexpected token } in JSON at position 9');
    const error = new JsonFrameParseError('Failed to parse JSON input.', syntaxError);

    expect(error.name).toBe('JsonFrameParseError');
    expect(error.cause).toBe(syntaxError);
  });

  it('stores actionable validation context without retaining the whole payload by convention', () => {
    const offendingValue = Symbol('invalid-json-value');
    const error = new JsonFrameValidationError('Row contains a non-JSON value.', {
      orient: 'records',
      path: '$[2].city',
      row: 2,
      column: 'city',
      value: offendingValue,
    });

    expect(error).toMatchObject({
      name: 'JsonFrameValidationError',
      orient: 'records',
      path: '$[2].city',
      row: 2,
      column: 'city',
      value: offendingValue,
    });
  });

  it('uses resolved orient candidates for ambiguity errors', () => {
    const error = new AmbiguousOrientError('Auto detection cannot distinguish between index and columns.', [
      'index',
      'columns',
    ]);

    expect(error.candidates).toEqual(['index', 'columns']);
    expect(Object.isFrozen(error.candidates)).toBe(true);
    expect(error.candidates).not.toContain('auto');
  });

  it('keeps unsupported-feature and export-collision details structured', () => {
    const unsupported = new UnsupportedFeatureError('MultiIndex table payloads are not supported.', 'multi-index', {
      orient: 'table',
      path: '$.schema.primaryKey',
      value: ['a', 'b'],
    });
    const collision = new ExportKeyCollisionError(
      'Index labels collide after JSON key stringification.',
      'index',
      '1',
      [1, '1'],
    );

    expect(unsupported).toMatchObject({
      name: 'UnsupportedFeatureError',
      feature: 'multi-index',
      orient: 'table',
      path: '$.schema.primaryKey',
      value: ['a', 'b'],
    });
    expect(collision).toMatchObject({
      name: 'ExportKeyCollisionError',
      orient: 'index',
      key: '1',
      labels: [1, '1'],
    });
    expect(Object.isFrozen(collision.labels)).toBe(true);
  });
});
