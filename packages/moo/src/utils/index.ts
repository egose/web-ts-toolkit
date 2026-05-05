import { Schema } from 'mongoose';

type AnyFunction = (...args: unknown[]) => unknown;

type ReferenceShape = {
  ref?: unknown;
  refPath?: unknown;
  type?: unknown;
};

export const isFunction = (value: unknown): value is AnyFunction => typeof value === 'function';

export const isString = (value: unknown): value is string => typeof value === 'string';

export const isNumber = (value: unknown): value is number => typeof value === 'number';

export const isConstructor = (value: unknown): value is 'constructor' => value === 'constructor';

export const isEmpty = (value: { length?: number } | null | undefined): boolean =>
  !(value && value.length && value.length > 0);

export const isSymbol = (value: unknown): value is symbol => typeof value === 'symbol';

export const isObject = (value: unknown): value is object => value !== null && typeof value === 'object';

export const isPlainObject = (value: unknown): value is Record<string, unknown> => {
  if (!isObject(value)) {
    return false;
  }

  const prototype = Object.getPrototypeOf(value);
  return prototype === null || prototype === Object.prototype;
};

export const isSchema = (value: unknown): value is Schema => value instanceof Schema;

export const isObjectIdType = (value: unknown): boolean => value === 'ObjectId' || value === Schema.Types.ObjectId;

const hasReferenceTarget = (value: ReferenceShape): boolean =>
  isString(value.ref) || isFunction(value.ref) || isString(value.refPath);

export const isReference = (value: unknown, ref?: string): value is ReferenceShape => {
  if (Array.isArray(value)) {
    return value.length > 0 ? isReference(value[0], ref) : false;
  }

  if (!isPlainObject(value) || !isObjectIdType(value.type)) {
    return false;
  }

  if (ref === undefined) {
    return hasReferenceTarget(value);
  }

  return value.ref === ref;
};
