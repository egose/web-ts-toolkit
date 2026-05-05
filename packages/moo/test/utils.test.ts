import mongoose from 'mongoose';
import { describe, expect, it } from 'vitest';

import {
  isConstructor,
  isEmpty,
  isFunction,
  isNumber,
  isObject,
  isObjectIdType,
  isPlainObject,
  isReference,
  isSchema,
  isString,
  isSymbol,
} from '../dist/utils/index.mjs';

describe('utils', () => {
  it('exposes primitive type guards', () => {
    expect(isFunction(() => null)).toBe(true);
    expect(isString('apple')).toBe(true);
    expect(isNumber(42)).toBe(true);
    expect(isSymbol(Symbol('value'))).toBe(true);
    expect(isConstructor('constructor')).toBe(true);
    expect(isObject({ ok: true })).toBe(true);
    expect(isObject(null)).toBe(false);
  });

  it('detects empty array-like values', () => {
    expect(isEmpty([])).toBe(true);
    expect(isEmpty('')).toBe(true);
    expect(isEmpty([1])).toBe(false);
  });

  it('distinguishes plain objects from arrays and class instances', () => {
    class Example {}

    expect(isPlainObject({ ok: true })).toBe(true);
    expect(isPlainObject(Object.create(null))).toBe(true);
    expect(isPlainObject([])).toBe(false);
    expect(isPlainObject(new Example())).toBe(false);
  });

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
