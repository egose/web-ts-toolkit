import { Document, Schema } from 'mongoose';
import { get, isArray, isPlainObject, isPromise, isString, pick, set } from '@web-ts-toolkit/utils';
import { isDocument } from '../lib';
import { getModelOption } from '../options';
import { SubPopulate } from '../interfaces';
import { normalizeSelect } from './query';

type DocumentLike = Document & { _doc: Record<string, unknown> };
type DocValue = DocumentLike | Record<string, unknown>;
type LegacyPopulateResult = { execPopulate?: () => Promise<unknown> };

export function getDocValue(doc: DocValue, path: string, defalutValue?: unknown) {
  if (isDocument(doc)) {
    return get(doc._doc, path, defalutValue);
  } else if (isPlainObject(doc)) {
    return get(doc, path, defalutValue);
  }
}

export function setDocValue(doc: unknown, path: string, value: unknown) {
  if (isDocument(doc)) {
    set(doc._doc, path, value);
  } else if (isPlainObject(doc)) {
    set(doc, path, value);
  }
}

export function getDocPermissions(modelName: string, doc: unknown) {
  const docPermissionField = getModelOption(modelName, 'documentPermissionField');
  return getDocValue(doc as DocValue, docPermissionField, {});
}

export function getModelKeys(doc: unknown) {
  return Object.keys(isDocument(doc) ? doc._doc : doc);
}

export function toObject<T>(doc: T | DocumentLike): T | Record<string, unknown> {
  return isDocument(doc) ? doc.toObject() : doc;
}

export function pickDocFields(doc: unknown, fields: string[] = []) {
  if (isDocument(doc)) {
    doc._doc = pick(doc._doc, fields);
    return doc;
  } else {
    return pick(doc as Record<string, unknown>, fields);
  }
}

export async function populateDoc(doc: Document, target: unknown) {
  let p = doc.populate(target);
  if (isPromise(p)) return p;

  // for backward compatibility, utilize the 'execPopulate' method to populate the target fields.
  return 'execPopulate' in p && (p as LegacyPopulateResult).execPopulate?.();
}

export const genSubPopulate = (sub: string, popul?: SubPopulate | SubPopulate[] | string | string[]): SubPopulate[] => {
  if (!popul) return [];

  let populate = isArray(popul) ? popul : [popul];
  populate = populate.map((p: SubPopulate | string) => {
    const ret: SubPopulate = isString(p)
      ? { path: `${sub}.${p}` }
      : {
          path: `${sub}.${p.path}`,
          select: normalizeSelect(p.select),
        };

    return ret;
  });

  return populate;
};
