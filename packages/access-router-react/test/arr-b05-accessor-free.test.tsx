import { describe, it, expect, vi } from 'vitest';
import { requestKeyFor, requestConfigKeyInput, sortKeyFor, RequestKeyError } from '../src/fetch';

describe('ARR-B05: accessor-free key construction', () => {
  it('own array index accessor throws WITHOUT executing the getter', () => {
    let calls = 0;
    const arr: unknown[] = [1, 2];
    Object.defineProperty(arr, '0', {
      enumerable: true,
      configurable: true,
      get() {
        calls++;
        return 1;
      },
    });
    expect(() => requestKeyFor(arr)).toThrow(RequestKeyError);
    expect(calls).toBe(0);
  });

  it('inherited array index accessor (sparse hole) throws WITHOUT executing the getter', () => {
    let calls = 0;
    const proto: unknown[] = [];
    Object.defineProperty(proto, '1', {
      enumerable: true,
      configurable: true,
      get() {
        calls++;
        return 99;
      },
    });
    const arr: unknown[] = [0, undefined, 2];
    delete arr[1];
    Object.setPrototypeOf(arr, proto);
    try {
      expect(() => requestKeyFor(arr)).toThrow(RequestKeyError);
      expect(calls).toBe(0);
    } finally {
      Object.setPrototypeOf(arr, Array.prototype);
    }
  });

  it('sparse holes without prototype values preserve documented behavior (serialize as undefined)', () => {
    const holey: unknown[] = [0, undefined, 2];
    delete holey[1];
    expect(requestKeyFor(holey)).toBe(requestKeyFor([0, undefined, 2]));
  });

  it('sparse hole with inherited DATA value reads through without throwing', () => {
    const proto: unknown[] = [];
    Object.defineProperty(proto, '1', {
      enumerable: true,
      configurable: true,
      value: 99,
      writable: true,
    });
    const arr: unknown[] = [0, undefined, 2];
    delete arr[1];
    Object.setPrototypeOf(arr, proto);
    try {
      expect(requestKeyFor(arr)).toBe(requestKeyFor([0, 99, 2]));
    } finally {
      Object.setPrototypeOf(arr, Array.prototype);
    }
  });

  it('overridden own Date.getTime (data property) does NOT execute during key construction', () => {
    const d = new Date('2026-01-01T00:00:00.000Z');
    const expected = requestKeyFor(new Date(d.getTime()));
    let calls = 0;
    (d as unknown as Record<string, unknown>).getTime = () => {
      calls++;
      return 12345;
    };
    expect(requestKeyFor(d)).toBe(expected);
    expect(calls).toBe(0);
  });

  it('accessor own Date.getTime does NOT execute during key construction', () => {
    const d = new Date('2026-01-01T00:00:00.000Z');
    const expected = requestKeyFor(new Date(d.getTime()));
    let calls = 0;
    Object.defineProperty(d, 'getTime', {
      enumerable: true,
      configurable: true,
      get() {
        calls++;
        return () => 12345;
      },
    });
    expect(requestKeyFor(d)).toBe(expected);
    expect(calls).toBe(0);
  });

  it('patched Date.prototype.getTime does NOT execute during key construction', () => {
    const d = new Date('2026-01-01T00:00:00.000Z');
    const expected = `d:${new Date(d.getTime()).getTime()}`;
    void expected;
    const original = Date.prototype.getTime;
    let calls = 0;
    (Date.prototype as unknown as Record<string, unknown>).getTime = function (this: Date) {
      calls++;
      return 777;
    };
    try {
      // True instant key computed via the pristine original captured before patch.
      const pristine = `d:${original.call(d)}`;
      expect(requestKeyFor(d)).toBe(pristine);
      expect(calls).toBe(0);
    } finally {
      Date.prototype.getTime = original;
    }
  });

  it('top-level requestConfig accessor throws WITHOUT executing the getter', () => {
    let calls = 0;
    const config: Record<string, unknown> = {};
    Object.defineProperty(config, 'headers', {
      enumerable: true,
      configurable: true,
      get() {
        calls++;
        return { Authorization: 'Bearer A' };
      },
    });
    expect(() => requestConfigKeyInput(config)).toThrow(RequestKeyError);
    expect(calls).toBe(0);
    expect(() => requestKeyFor(requestConfigKeyInput(config))).toThrow(RequestKeyError);
    expect(calls).toBe(0);
  });

  it('requestConfig.signal accessor is excluded WITHOUT executing the getter', () => {
    let calls = 0;
    const signal = new AbortController().signal;
    const config: Record<string, unknown> = { headers: { Authorization: 'Bearer A' } };
    Object.defineProperty(config, 'signal', {
      enumerable: true,
      configurable: true,
      get() {
        calls++;
        return signal;
      },
    });
    const input = requestConfigKeyInput(config);
    expect(calls).toBe(0);
    expect(input).toEqual({ headers: { Authorization: 'Bearer A' } });
    expect(requestKeyFor(input)).toBe(requestKeyFor({ headers: { Authorization: 'Bearer A' } }));
    expect(calls).toBe(0);
  });

  it('requestConfig input is a fresh object and source is not mutated', () => {
    const headers = { Authorization: 'Bearer A' };
    const config = { headers, signal: new AbortController().signal };
    const input = requestConfigKeyInput(config);
    expect(input).not.toBe(config);
    expect(input).toEqual({ headers });
    expect((input as Record<string, unknown>).headers).toBe(headers);
    expect(config.signal).toBe(config.signal);
    expect(Object.keys(config).sort()).toEqual(['headers', 'signal']);
  });

  it('ordinary Dates/arrays/objects/signal-less configs stay stable and deterministic', () => {
    const d = new Date('2026-01-01T00:00:00.000Z');
    expect(requestKeyFor(d)).toBe(requestKeyFor(new Date(d.getTime())));
    expect(requestKeyFor([1, [2, { a: 1 }]])).toBe(requestKeyFor([1, [2, { a: 1 }]]));
    expect(requestKeyFor({ b: 2, a: 1 })).toBe(requestKeyFor({ a: 1, b: 2 }));
    expect(requestConfigKeyInput({ headers: { a: '1' } })).toEqual({ headers: { a: '1' } });
    expect(requestConfigKeyInput({ signal: new AbortController().signal })).toBeUndefined();
    expect(requestConfigKeyInput(undefined)).toBeUndefined();
    const cycle: { self?: unknown } = {};
    cycle.self = cycle;
    expect(() => requestKeyFor(cycle)).toThrow(RequestKeyError);
  });

  it('cross-path: sortKeyFor enforces the same accessor-free contract (no new unsafe path)', () => {
    let arrayCalls = 0;
    const arr: unknown[] = [1, 2];
    Object.defineProperty(arr, '0', {
      enumerable: true,
      configurable: true,
      get() {
        arrayCalls++;
        return 1;
      },
    });
    expect(() => sortKeyFor(arr)).toThrow(RequestKeyError);
    expect(arrayCalls).toBe(0);

    const d = new Date('2026-03-01T00:00:00.000Z');
    const expected = sortKeyFor(new Date(d.getTime()));
    let dateCalls = 0;
    (d as unknown as Record<string, unknown>).getTime = () => {
      dateCalls++;
      return 1;
    };
    expect(sortKeyFor(d)).toBe(expected);
    expect(dateCalls).toBe(0);

    let configCalls = 0;
    const config: Record<string, unknown> = {};
    Object.defineProperty(config, 'headers', {
      enumerable: true,
      configurable: true,
      get() {
        configCalls++;
        return {};
      },
    });
    expect(() => sortKeyFor(requestConfigKeyInput(config))).toThrow(RequestKeyError);
    expect(configCalls).toBe(0);
    expect(vi.fn().mock.calls.length).toBe(0);
  });
});
