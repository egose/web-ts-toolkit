import { Document, Schema } from 'mongoose';
import { isPlainObject } from '@web-ts-toolkit/utils';

export class PermissionDoc extends Document {
  _doc: Record<string, unknown>;

  constructor(...args: unknown[]) {
    super(...args);
    this._doc = {};
  }
}

export const isSchema = (val: unknown): val is Schema => val instanceof Schema;
export const isObjectIdType = (val: unknown) => val === 'ObjectId' || val === Schema.Types.ObjectId;
export const isReference = (val: unknown) => isPlainObject(val) && !!val.ref && isObjectIdType(val.type);

export const isDocument = function isDocument(doc: unknown): doc is PermissionDoc {
  return doc instanceof Document;
};
