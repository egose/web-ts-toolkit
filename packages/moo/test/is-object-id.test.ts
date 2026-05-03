import mongoose from 'mongoose';
import { describe, expect, it } from 'vitest';

import { isObjectId } from '../dist/index.mjs';

describe('isObjectId', () => {
  it('returns false for numeric values', () => {
    expect(isObjectId(123456)).toBe(false);
  });

  it('returns false for random strings', () => {
    expect(isObjectId('qwertyuiopasdfghjklzxcvb')).toBe(false);
  });

  it('returns true for ObjectId values', () => {
    expect(isObjectId(new mongoose.Types.ObjectId())).toBe(true);
  });

  it('returns true for ObjectId strings', () => {
    expect(isObjectId(new mongoose.Types.ObjectId().toString())).toBe(true);
  });
});
