import { Schema } from 'mongoose';
import { isFunction, isPlainObject, isString } from '@web-ts-toolkit/utils';

export type ReferenceShape = {
  ref?: unknown;
  refPath?: unknown;
  type?: unknown;
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
