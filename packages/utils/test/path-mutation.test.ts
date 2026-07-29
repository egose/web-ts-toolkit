import { afterEach, describe, expect, it } from 'vitest';
import omit from '../src/omit';
import pick from '../src/pick';
import set from '../src/set';

const prototypeKey = 'webTsToolkitPolluted';

afterEach(() => {
  delete (Object.prototype as Record<string, unknown>)[prototypeKey];
});

describe('path mutation helpers', () => {
  it('blocks __proto__ writes', () => {
    const target: Record<string, unknown> = {};

    set(target, `__proto__.${prototypeKey}`, true);

    expect(target).toEqual({});
    expect(({} as Record<string, unknown>)[prototypeKey]).toBeUndefined();
  });

  it('blocks constructor.prototype writes', () => {
    const target: Record<string, unknown> = {};

    set(target, ['constructor', 'prototype', prototypeKey], true);

    expect(target).toEqual({});
    expect(({} as Record<string, unknown>)[prototypeKey]).toBeUndefined();
  });

  it('keeps pick safe when given unsafe paths', () => {
    const result = pick({ safe: { value: 1 } }, ['safe.value', `__proto__.${prototypeKey}`]);

    expect(result).toEqual({ safe: { value: 1 } });
    expect(({} as Record<string, unknown>)[prototypeKey]).toBeUndefined();
  });

  it('keeps omit safe when given unsafe paths', () => {
    const input = { safe: { value: 1 } };

    const result = omit(input, [`constructor.prototype.${prototypeKey}`]);

    expect(result).toEqual(input);
    expect(({} as Record<string, unknown>)[prototypeKey]).toBeUndefined();
  });
});
