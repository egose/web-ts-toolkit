import { describe, expect, it } from 'vitest';

// Explicit `.ts` specifiers per UTILS-10: these regressions must execute
// TypeScript source even with ignored compiled `.js` siblings present.
import isBoolean from '../src/isBoolean.ts';
import isNumber from '../src/isNumber.ts';
import isString from '../src/isString.ts';

/**
 * UTILS-09: the three primitive guards are primitive-only. Boxed instances
 * (`new Boolean(false)` etc.) are truthy objects rather than the primitives
 * they wrap, so accepting them while narrowing to the primitive type was
 * unsound. These tests lock the rejection contract (release-note change).
 */
describe('UTILS-09 primitive-only guard narrowing', () => {
  it('accepts primitives', () => {
    expect(isBoolean(true)).toBe(true);
    expect(isBoolean(false)).toBe(true);
    expect(isNumber(0)).toBe(true);
    expect(isNumber(Number.NaN)).toBe(true);
    expect(isString('')).toBe(true);
    expect(isString('text')).toBe(true);
  });

  it('rejects boxed instances', () => {
    expect(isBoolean(new Boolean(false))).toBe(false);
    expect(isNumber(new Number(0))).toBe(false);
    expect(isString(new String(''))).toBe(false);
  });

  it('never mistakes a truthy boxed false for primitive false', () => {
    const boxedFalse = new Boolean(false);
    expect(Boolean(boxedFalse)).toBe(true);
    expect(isBoolean(boxedFalse)).toBe(false);
  });

  it('rejects unrelated types', () => {
    for (const guard of [isBoolean, isNumber, isString] as const) {
      expect(guard(null)).toBe(false);
      expect(guard(undefined)).toBe(false);
      expect(guard(0)).toBe(guard === isNumber);
      expect(guard('')).toBe(guard === isString);
      expect(guard(false)).toBe(guard === isBoolean);
      expect(guard({})).toBe(false);
      expect(guard([])).toBe(false);
    }
  });
});
