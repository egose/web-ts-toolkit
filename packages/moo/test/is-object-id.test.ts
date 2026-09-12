import mongoose from 'mongoose';
import { describe, expect, expectTypeOf, it, vi } from 'vitest';

import { isObjectId } from '../dist/index.mjs';

describe('isObjectId', () => {
  it('returns false for numeric values', () => {
    expect(isObjectId(123456)).toBe(false);
  });

  it('returns false for random strings', () => {
    expect(isObjectId('qwertyuiopasdfghjklzxcvb')).toBe(false); // pragma: allowlist secret
  });

  it('returns true for ObjectId values', () => {
    expect(isObjectId(new mongoose.Types.ObjectId())).toBe(true);
  });

  it('returns true for ObjectId strings', () => {
    expect(isObjectId(new mongoose.Types.ObjectId().toString())).toBe(true);
  });

  it('returns true for canonical lowercase hex strings', () => {
    expect(isObjectId('aaaaaaaaaaaaaaaaaaaaaaaa')).toBe(true);
    expect(isObjectId(new mongoose.Types.ObjectId().toHexString())).toBe(true);
  });

  it('rejects uppercase and noncanonical strings explicitly', () => {
    // Uppercase hex is valid per ObjectId.isValid but is not canonical:
    // new ObjectId(upper).toString() lowercases, so it cannot round-trip.
    expect(mongoose.Types.ObjectId.isValid('AAAAAAAAAAAAAAAAAAAAAAAA')).toBe(true);
    expect(isObjectId('AAAAAAAAAAAAAAAAAAAAAAAA')).toBe(false);
    expect(isObjectId('aAaAaAaAaAaAaAaAaAaAaAaA')).toBe(false);
    // Noncanonical shapes.
    expect(isObjectId('')).toBe(false);
    expect(isObjectId('abcdefghijkl')).toBe(false);
    expect(isObjectId('aaaaaaaaaaaaaaaaaaaaaaa')).toBe(false);
    expect(isObjectId('aaaaaaaaaaaaaaaaaaaaaaaaa')).toBe(false);
    expect(isObjectId('gggggggggggggggggggggggg')).toBe(false);
    expect(isObjectId(' aaaaaaaaaaaaaaaaaaaaaaaa')).toBe(false);
    expect(isObjectId('aaaaaaaaaaaaaaaaaaaaaaaa ')).toBe(false);
    expect(isObjectId('0xaaaaaaaaaaaaaaaaaaaaaaaa')).toBe(false);
  });

  it('rejects nullish and other primitives without coercion', () => {
    expect(isObjectId(null)).toBe(false);
    expect(isObjectId(undefined)).toBe(false);
    expect(isObjectId(0)).toBe(false);
    expect(isObjectId(123456)).toBe(false);
    expect(isObjectId(Number.NaN)).toBe(false);
    expect(isObjectId(10n)).toBe(false);
    expect(isObjectId(true)).toBe(false);
    expect(isObjectId(false)).toBe(false);
    expect(isObjectId(Symbol('id'))).toBe(false);
    // Boxed strings are objects, not canonical string primitives.
    expect(isObjectId(new String('aaaaaaaaaaaaaaaaaaaaaaaa'))).toBe(false);
  });

  it('rejects buffers, arrays, and plain objects', () => {
    expect(isObjectId(Buffer.alloc(12))).toBe(false);
    expect(isObjectId(Buffer.from('aaaaaaaaaaaaaaaaaaaaaaaa'))).toBe(false);
    expect(isObjectId(new Uint8Array(12))).toBe(false);
    expect(isObjectId([])).toBe(false);
    expect(isObjectId(['aaaaaaaaaaaaaaaaaaaaaaaa'])).toBe(false);
    expect(isObjectId({})).toBe(false);
    expect(isObjectId({ id: 'aaaaaaaaaaaaaaaaaaaaaaaa' })).toBe(false);
  });

  it('rejects the structural impostor without invoking its coercion', () => {
    const hex = new mongoose.Types.ObjectId().toHexString();
    const toHexString = vi.fn(() => hex);
    const toString = vi.fn(() => hex);
    const valueOf = vi.fn(() => hex);
    const impostor = { id: hex, toHexString, toString, valueOf };
    expect(impostor instanceof mongoose.Types.ObjectId).toBe(false);
    expect(isObjectId(impostor)).toBe(false);
    expect(toHexString).not.toHaveBeenCalled();
    expect(toString).not.toHaveBeenCalled();
    expect(valueOf).not.toHaveBeenCalled();
  });

  it('rejects foreign BSON-like instances with an identical shape', () => {
    const hex = new mongoose.Types.ObjectId().toHexString();
    class ForeignObjectId {
      _bsontype = 'ObjectId';
      id: Buffer;
      constructor() {
        this.id = Buffer.from(hex, 'hex');
      }
      toHexString(): string {
        return hex;
      }
      toString(): string {
        return hex;
      }
    }
    const foreign = new ForeignObjectId();
    expect(foreign.toString()).toBe(hex);
    expect(isObjectId(foreign)).toBe(false);
    expect(isObjectId(foreign as unknown as mongoose.Types.ObjectId)).toBe(false);
  });

  it('rejects hostile coercion objects and throwing proxies', () => {
    const throwingToString = {
      [Symbol.toPrimitive](): string {
        throw new Error('hostile primitive');
      },
      toString(): string {
        throw new Error('hostile toString');
      },
      valueOf(): string {
        throw new Error('hostile valueOf');
      },
      toJSON(): string {
        throw new Error('hostile toJSON');
      },
    };
    expect(isObjectId(throwingToString)).toBe(false);

    const throwingProxy = new Proxy(
      {},
      {
        getPrototypeOf() {
          throw new Error('hostile getPrototypeOf');
        },
      },
    );
    expect(isObjectId(throwingProxy)).toBe(false);
  });

  it('keeps type-level narrowing in agreement with runtime behavior', () => {
    const unknownValue: unknown = 'aaaaaaaaaaaaaaaaaaaaaaaa';
    if (isObjectId(unknownValue)) {
      expectTypeOf(unknownValue).toEqualTypeOf<mongoose.Types.ObjectId | string>();
      expect(typeof unknownValue === 'string' || unknownValue instanceof mongoose.Types.ObjectId).toBe(true);
    } else {
      expect.unreachable('canonical string must narrow to the union');
    }

    const rejected: unknown = { toString: () => 'aaaaaaaaaaaaaaaaaaaaaaaa' };
    if (isObjectId(rejected)) {
      expect.unreachable('structural impostor must not narrow to the union');
    } else {
      expectTypeOf(rejected).toEqualTypeOf<unknown>();
    }
  });
});
