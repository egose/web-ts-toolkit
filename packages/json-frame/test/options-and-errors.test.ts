import { describe, expect, expectTypeOf, it } from 'vitest';
import {
  AmbiguousOrientError,
  ExportKeyCollisionError,
  JsonFrameParseError,
  JsonFrameValidationError,
  JSON_FRAME_MAX_DEPTH,
  UnsupportedFeatureError,
  type ColumnInfo,
  type ColumnType,
  type FromOrientOptions,
  type Orient,
  type ResolvedOrient,
  type SplitPayload,
  type TablePayload,
  type JsonFrameDiagnosticValue,
} from '@web-ts-toolkit/json-frame';
import {
  JsonFrameOptionError,
  JSON_FRAME_DIAGNOSTIC_KEY_LIMIT,
  JSON_FRAME_DIAGNOSTIC_KEY_TEXT_BUDGET,
} from '../src/errors';
import { DEFAULT_PACK_THRESHOLD, normalizeFromOrientOptions } from '../src/options';

describe('public types', () => {
  it('keep row and cell payload typing separate', () => {
    type LogicalTypes = ColumnType;
    type ParseOptions = FromOrientOptions;
    type DetectedOrient = Orient;
    type ConcreteOrient = ResolvedOrient;
    type DiagnosticValue = JsonFrameDiagnosticValue;

    expectTypeOf<LogicalTypes>().toEqualTypeOf<
      'integer' | 'float' | 'string' | 'boolean' | 'datetime' | 'categorical' | 'mixed' | 'unknown'
    >();
    expectTypeOf<ParseOptions['orient']>().toEqualTypeOf<DetectedOrient | undefined>();
    expectTypeOf<ConcreteOrient>().not.toEqualTypeOf<'auto'>();
    expectTypeOf<SplitPayload['data'][number]>().toEqualTypeOf<readonly unknown[]>();
    expectTypeOf<TablePayload['data'][number]>().toExtend<Record<string, unknown>>();
    expectTypeOf<ColumnInfo>().toEqualTypeOf<{ readonly type: ColumnType; readonly nullable: boolean }>();
    expectTypeOf<DiagnosticValue>().toExtend<unknown>();
    expect(JSON_FRAME_MAX_DEPTH).toBe(1000);
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

  it('rejects sparse columns holes without installing undefined labels', () => {
    const holes: Array<readonly string[]> = [
      // eslint-disable-next-line no-sparse-arrays
      ['a', , 'c'],
      new Array(1) as unknown as readonly string[],
      new Array(2) as unknown as readonly string[],
    ];

    for (const columns of holes) {
      try {
        normalizeFromOrientOptions({ columns: columns as unknown as string[] });
        throw new Error('expected sparse columns to throw');
      } catch (error) {
        expect(error).toBeInstanceOf(JsonFrameOptionError);
        expect(error).toMatchObject({ name: 'JsonFrameOptionError', option: 'columns' });
      }
    }
  });

  it('still rejects dense non-string and duplicate columns while accepting valid labels', () => {
    for (const columns of [[1], ['a', 1], ['a', 'a']] as unknown as string[][]) {
      expect(() => normalizeFromOrientOptions({ columns })).toThrowError(JsonFrameOptionError);
    }

    expect(normalizeFromOrientOptions({ columns: ['__proto__', 'constructor', 'prototype'] }).columns).toEqual([
      '__proto__',
      'constructor',
      'prototype',
    ]);
  });
});

describe('structured errors', () => {
  it('preserves SyntaxError causes on parse failures', () => {
    const syntaxError = new SyntaxError('Unexpected token } in JSON at position 9');
    const error = new JsonFrameParseError('Failed to parse JSON input.', syntaxError);

    expect(error.name).toBe('JsonFrameParseError');
    expect(error.cause).toBe(syntaxError);
  });

  it('stores actionable validation context without retaining the whole payload by convention', () => {
    const offendingValue = { nested: ['invalid-json-value'] };
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
      value: {
        kind: 'object',
        keyCount: 1,
        keys: ['nested'],
        truncated: false,
      },
    });
    expect(error.value).not.toBe(offendingValue);
    expect(Object.isFrozen(error.value)).toBe(true);
    expect(JSON.stringify(error)).toContain('nested');
  });

  it('bounds long single-key previews with a text truncation marker', () => {
    const longKey = `k${'x'.repeat(JSON_FRAME_DIAGNOSTIC_KEY_TEXT_BUDGET + 500)}`;
    const offendingValue = { [longKey]: 1 };
    const error = new JsonFrameValidationError('Row contains a non-JSON value.', {
      orient: 'records',
      path: '$[0]',
      value: offendingValue,
    });

    expect(error.value).toMatchObject({ kind: 'object', keyCount: 1, truncated: true });
    const summary = error.value as { readonly kind: 'object'; readonly keys: readonly string[] };
    const previewText = summary.keys.join('');
    expect(summary.keys.length).toBeLessThanOrEqual(JSON_FRAME_DIAGNOSTIC_KEY_LIMIT);
    expect(previewText.length).toBeLessThanOrEqual(JSON_FRAME_DIAGNOSTIC_KEY_TEXT_BUDGET);
    expect(previewText.length).toBe(JSON_FRAME_DIAGNOSTIC_KEY_TEXT_BUDGET);
    expect(longKey.startsWith(previewText)).toBe(true);
    expect(Object.isFrozen(error.value)).toBe(true);
    expect(Object.isFrozen(summary.keys)).toBe(true);
  });

  it('bounds many-key previews while preserving the full key count', () => {
    const offendingValue: Record<string, number> = {};
    for (let index = 0; index < JSON_FRAME_DIAGNOSTIC_KEY_LIMIT + 15; index += 1) {
      offendingValue[`key-${String(index).padStart(2, '0')}`] = index;
    }
    const error = new JsonFrameValidationError('Row contains a non-JSON value.', { value: offendingValue });

    expect(error.value).toMatchObject({
      kind: 'object',
      keyCount: JSON_FRAME_DIAGNOSTIC_KEY_LIMIT + 15,
      truncated: true,
    });
    const summary = error.value as { readonly kind: 'object'; readonly keys: readonly string[] };
    expect(summary.keys).toEqual(Object.keys(offendingValue).slice(0, JSON_FRAME_DIAGNOSTIC_KEY_LIMIT));
    expect(summary.keys.join('').length).toBeLessThanOrEqual(JSON_FRAME_DIAGNOSTIC_KEY_TEXT_BUDGET);
  });

  it('bounds many long-key previews by text budget, not only by count', () => {
    const offendingValue: Record<string, number> = {};
    for (let index = 0; index < JSON_FRAME_DIAGNOSTIC_KEY_LIMIT + 5; index += 1) {
      offendingValue[`key-${index}-${'y'.repeat(100)}`] = index;
    }
    const error = new JsonFrameValidationError('Row contains a non-JSON value.', { value: offendingValue });

    expect(error.value).toMatchObject({ kind: 'object', truncated: true });
    const summary = error.value as {
      readonly kind: 'object';
      readonly keyCount: number;
      readonly keys: readonly string[];
    };
    expect(summary.keyCount).toBe(JSON_FRAME_DIAGNOSTIC_KEY_LIMIT + 5);
    expect(summary.keys.length).toBeLessThanOrEqual(JSON_FRAME_DIAGNOSTIC_KEY_LIMIT);
    expect(summary.keys.join('').length).toBeLessThanOrEqual(JSON_FRAME_DIAGNOSTIC_KEY_TEXT_BUDGET);
    expect(Object.isFrozen(error.value)).toBe(true);
  });

  it('keeps scalar diagnostics input-sized while freezing container summaries', () => {
    const longScalar = `s${'z'.repeat(5000)}`;
    const scalarError = new JsonFrameValidationError('Bad scalar.', { value: longScalar });
    expect(scalarError.value).toBe(longScalar);

    const cyclic: Record<string, unknown> = {};
    cyclic.self = cyclic;
    const cycleError = new JsonFrameValidationError('Bad object.', { value: cyclic });
    expect(cycleError.value).toMatchObject({ kind: 'object', keyCount: 1, keys: ['self'], truncated: false });
    expect(cycleError.value).not.toBe(cyclic);
    expect(Object.isFrozen(cycleError.value)).toBe(true);
    expect(Object.isFrozen((cycleError.value as { readonly keys: readonly string[] }).keys)).toBe(true);
  });

  it('never invokes caller toJSON hooks while summarizing', () => {
    const hookError = new Error('toJSON must not run');
    const offendingValue = {
      ok: 1,
      toJSON() {
        throw hookError;
      },
    };
    let error: JsonFrameValidationError | undefined;
    expect(() => {
      error = new JsonFrameValidationError('Bad object.', { value: offendingValue });
    }).not.toThrow();
    expect(error?.value).toMatchObject({ kind: 'object', truncated: false });
    expect(JSON.stringify(error)).not.toContain('toJSON must not run');

    const arrayWithHook = [1, 2, 3] as unknown[];
    Object.defineProperty(arrayWithHook, 'toJSON', {
      value() {
        throw hookError;
      },
      enumerable: false,
      configurable: true,
    });
    const arrayError = new JsonFrameValidationError('Bad array.', { value: arrayWithHook });
    expect(arrayError.value).toMatchObject({ kind: 'array', length: 3 });
    expect(Object.isFrozen(arrayError.value)).toBe(true);
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
      value: { kind: 'array', length: 2 },
    });
    expect(Object.isFrozen(unsupported.value)).toBe(true);
    expect(collision).toMatchObject({
      name: 'ExportKeyCollisionError',
      orient: 'index',
      key: '1',
      labels: [1, '1'],
    });
    expect(Object.isFrozen(collision.labels)).toBe(true);
  });
});
