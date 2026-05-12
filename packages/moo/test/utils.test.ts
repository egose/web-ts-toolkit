import mongoose from 'mongoose';
import { describe, expect, it } from 'vitest';

import { isObjectIdType, isReference, isSchema } from '../dist/utils/index.mjs';

describe('utils', () => {
  it('detects Mongoose schema and ObjectId schema types', () => {
    expect(isSchema(new mongoose.Schema({ name: String }))).toBe(true);
    expect(isObjectIdType('ObjectId')).toBe(true);
    expect(isObjectIdType(mongoose.Schema.Types.ObjectId)).toBe(true);
    expect(isObjectIdType(String)).toBe(false);
  });

  it('detects Mongoose references for object and array schema definitions', () => {
    expect(isReference({ type: mongoose.Schema.Types.ObjectId, ref: 'User' })).toBe(true);
    expect(isReference({ type: mongoose.Schema.Types.ObjectId, ref: 'User' }, 'User')).toBe(true);
    expect(isReference([{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }], 'User')).toBe(true);
    expect(isReference({ type: mongoose.Schema.Types.ObjectId, ref: () => 'User' })).toBe(true);
    expect(isReference({ type: mongoose.Schema.Types.ObjectId, refPath: 'ownerModel' })).toBe(true);
    expect(isReference({ type: mongoose.Schema.Types.ObjectId }, 'User')).toBe(false);
    expect(isReference({ type: String, ref: 'User' }, 'User')).toBe(false);
  });
});
