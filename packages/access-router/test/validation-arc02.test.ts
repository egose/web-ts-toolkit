import Ajv from 'ajv';
import { describe, expect, it, vi } from 'vitest';
import { fromAjv, type AjvValidatorLike } from '../dist/index.mjs';

const nextTurn = () => new Promise<void>((resolve) => setImmediate(resolve));

describe('ARC-02 AJV verdict/data contracts', () => {
  it.each([
    ['boolean', false],
    ['boolean', true],
    ['null', null],
    ['number', 0],
    ['string', ''],
    ['object', { active: false }],
    ['array', [false, null]],
  ])('preserves real tagged async %s data: %j', async (type, value) => {
    const compiled = new Ajv().compile({ $async: true, type });
    const result = await fromAjv(compiled)(value);
    expect(result).toEqual({ success: true, data: value });
    if (result.success) expect(result.data).toBe(value);
  });

  it.each([false, true, null, 0, ''])('uses tagged fulfillment %j rather than the input or a verdict', async (data) => {
    const validator = Object.assign(async () => data, { $async: true as const });
    expect(await fromAjv(validator)({ original: true })).toEqual({ success: true, data });
  });

  it.each([
    [0, false],
    [1, true],
  ])('preserves real AJV coerced boolean data from %j', async (input, data) => {
    const compiled = new Ajv({ coerceTypes: true }).compile({ $async: true, type: 'boolean' });
    expect(await fromAjv(compiled)(input)).toEqual({ success: true, data });
  });

  it.each([null, undefined, 0, 'yes', {}])('rejects non-boolean synchronous results: %j', async (value) => {
    const unsupported = (() => value) as unknown as AjvValidatorLike;
    await expect(fromAjv(unsupported)({})).rejects.toThrow(
      'fromAjv: synchronous validators must return a boolean verdict',
    );
  });

  it('keeps real async rejection diagnostics local under out-of-order concurrent validation', async () => {
    const release = new Map<string, () => void>();
    const ajv = new Ajv({ allErrors: true });
    ajv.addKeyword({
      keyword: 'arc02Gate',
      async: true,
      type: 'string',
      validate: async (_schema: unknown, data: string) => {
        await new Promise<void>((resolve) => release.set(data, resolve));
        if (data === 'valid') return true;
        throw new Ajv.ValidationError([
          {
            keyword: 'arc02Gate',
            schemaPath: '#/arc02Gate',
            instancePath: `/input/${data}`,
            params: {},
            message: `invalid ${data}`,
          },
        ]);
      },
    });
    const compiled = ajv.compile({ $async: true, type: 'string', arc02Gate: true });
    const errorsRead = vi.fn(() => {
      throw new Error('async shared errors must not be read');
    });
    Object.defineProperty(compiled, 'errors', { get: errorsRead });
    const validate = fromAjv(compiled);
    const first = validate('first');
    const second = validate('second');
    const valid = validate('valid');
    release.get('second')!();
    expect(await second).toEqual({
      success: false,
      issues: [{ message: 'invalid second', path: ['input', 'second'] }],
    });
    release.get('valid')!();
    expect(await valid).toEqual({ success: true, data: 'valid' });
    release.get('first')!();
    expect(await first).toEqual({ success: false, issues: [{ message: 'invalid first', path: ['input', 'first'] }] });
    expect(errorsRead).not.toHaveBeenCalled();
  });

  it('snapshots real synchronous errors before same-turn invalid/invalid/valid calls', async () => {
    const compiled = new Ajv().compile({
      type: 'object',
      required: ['name'],
      properties: { name: { type: 'string' } },
    });
    const validate = fromAjv(compiled);
    const wrongType = validate({ name: false });
    const missing = validate({});
    const valid = validate({ name: 'ok' });
    expect(compiled.errors).toBeNull();
    expect(await wrongType).toEqual({ success: false, issues: [{ message: 'must be string', path: ['name'] }] });
    expect(await missing).toEqual({
      success: false,
      issues: [{ message: "must have required property 'name'", path: ['name'] }],
    });
    expect(await valid).toEqual({ success: true, data: { name: 'ok' } });
    expect(await fromAjv(new Ajv().compile({ type: 'boolean' }))(false)).toEqual({ success: true, data: false });
  });

  it('snapshots even reused structural error objects synchronously', async () => {
    const error = { message: 'first', instancePath: '/first' };
    const compiled = Object.assign(() => false, { errors: [error] });
    const first = fromAjv(compiled)({});
    error.message = 'second';
    error.instancePath = '/second';
    expect(await first).toEqual({ success: false, issues: [{ message: 'first', path: ['first'] }] });
  });

  it.each([
    new Error('database unavailable'),
    Object.assign(new Error('operational with errors'), { errors: [] }),
    { errors: null },
    { ajv: true, validation: true, errors: null },
  ])('preserves operational throws and tagged rejections by identity: %j', async (error) => {
    await expect(
      fromAjv(() => {
        throw error;
      })({}),
    ).rejects.toBe(error);
    const rejecting = Object.assign(
      async () => {
        throw error;
      },
      { $async: true as const },
    );
    await expect(fromAjv(rejecting)({})).rejects.toBe(error);
    const throwing = Object.assign(
      () => {
        throw error;
      },
      { $async: true as const },
    );
    await expect(fromAjv(throwing)({})).rejects.toBe(error);
  });

  it('preserves an operational rejection from a real AJV async keyword', async () => {
    const error = Object.assign(new Error('keyword upstream failed'), { errors: [] });
    const ajv = new Ajv();
    ajv.addKeyword({
      keyword: 'arc02Operational',
      async: true,
      validate: async () => {
        throw error;
      },
    });
    const compiled = ajv.compile({ $async: true, arc02Operational: true });
    await expect(fromAjv(compiled)({})).rejects.toBe(error);
  });

  it.each(['promise', 'object thenable', 'callable thenable'])(
    'rejects fulfilled/rejected untagged %s without shared errors or unhandled rejection',
    async (kind) => {
      const unhandled = vi.fn();
      process.on('unhandledRejection', unhandled);
      const observed = vi.fn();
      const errorsRead = vi.fn(() => {
        throw new Error('shared diagnostics read');
      });
      try {
        for (const reject of [false, true]) {
          const unsupported = Object.defineProperty(
            () => {
              const error = new Ajv.ValidationError([]);
              if (kind === 'promise') return reject ? Promise.reject(error) : Promise.resolve(false);
              const then = (resolve: (value: boolean) => void, fail: (error: unknown) => void) => {
                observed();
                if (reject) fail(error);
                else resolve(false);
              };
              return kind === 'object thenable' ? { then } : Object.assign(() => {}, { then });
            },
            'errors',
            { get: errorsRead },
          );
          // Deliberately bypass the public type to exercise JS/mistyped consumers.
          await expect(fromAjv(unsupported as unknown as AjvValidatorLike)({})).rejects.toThrow(
            'fromAjv: promise/thenable validators must declare $async: true and resolve with validated data',
          );
        }
        await nextTurn();
        await nextTurn();
        expect(errorsRead).not.toHaveBeenCalled();
        expect(unhandled).not.toHaveBeenCalled();
        expect(observed).toHaveBeenCalledTimes(kind === 'promise' ? 0 : 2);
      } finally {
        process.off('unhandledRejection', unhandled);
      }
    },
  );
});
