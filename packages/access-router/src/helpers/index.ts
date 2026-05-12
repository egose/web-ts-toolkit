export * from './collection';
export * from './document';
export * from './errors';
export * from './query';

import forEach from 'lodash/forEach';
import isArray from 'lodash/isArray';
import isEmpty from 'lodash/isEmpty';
import isObject from 'lodash/isObject';
import isPlainObject from 'lodash/isPlainObject';
import isString from 'lodash/isString';
import noop from 'lodash/noop';
import { isSchema, isReference, mapValuesAsync } from '../lib';
import { FilterOperator } from '../enums';

type SchemaTree = Record<string, unknown>;
type ReferenceMap = Record<string, string | ReferenceMap>;
type QueryHandler = (operator: FilterOperator, value: unknown, key: string) => unknown | Promise<unknown>;

function recurseObject(obj: unknown): string | ReferenceMap | null {
  if (isSchema(obj)) {
    return buildRefs((obj as typeof obj & { tree: SchemaTree }).tree);
  }

  if (!isObject(obj)) return null;
  if (isReference(obj)) {
    return obj.ref;
  }

  let ret: string | ReferenceMap | null = null;
  forEach(obj as Record<string, unknown>, (val) => {
    ret = recurseObject(val);
    if (!isEmpty(ret)) {
      return false;
    }
  });

  return ret;
}

export function buildRefs(schema: unknown): ReferenceMap {
  if (!isObject(schema)) return {};

  const references: ReferenceMap = {};

  forEach(schema as Record<string, unknown>, (val, key) => {
    const paths = recurseObject(val);
    if (!isEmpty(paths)) {
      references[key] = paths;
    }

    // collection subdocuments paths
    // see https://mongoosejs.com/docs/subdocs.html#subdocuments
    const target = isObject(val) && 'type' in val ? ((val as { type?: unknown }).type ?? val) : val;
    if (isArray(target) && target.length > 0) {
      if (isSchema(target[0]) || isPlainObject(target[0])) {
        return;
      }
    }
  });

  return references;
}

export function buildSubPaths(schema: unknown): string[] {
  if (!isObject(schema)) return [];

  const subPaths: string[] = [];

  forEach(schema as Record<string, unknown>, (val, key) => {
    // collection subdocuments paths
    // see https://mongoosejs.com/docs/subdocs.html#subdocuments
    const target = isObject(val) && 'type' in val ? ((val as { type?: unknown }).type ?? val) : val;
    if (isArray(target) && target.length > 0) {
      if (isSchema(target[0]) || (isPlainObject(target[0]) && !isReference(target[0]))) {
        subPaths.push(key);
      }
    }
  });

  return subPaths;
}

export async function iterateQuery(query: unknown, handler?: QueryHandler): Promise<unknown> {
  if (!isPlainObject(query)) return query;
  if (!handler) return noop;

  const queryObject = query as Record<string, unknown>;
  return mapValuesAsync(queryObject, async (val, key) => {
    if (isPlainObject(val)) {
      const plainValue = val as Record<string, unknown>;
      if (plainValue.$$sq) {
        return handler(FilterOperator.SubQuery, plainValue.$$sq, key);
      } else if (plainValue.$$date) {
        return handler(FilterOperator.Date, plainValue.$$date, key);
      } else {
        return iterateQuery(val, handler);
      }
    }

    if (isArray(val)) {
      return Promise.all(val.map((v) => iterateQuery(v, handler)));
    }

    return val;
  });
}

export const createValidator = (fn: (key: string) => boolean) => {
  const stringHandler = (key: string) =>
    key
      .trim()
      .split(' ')
      .every((v) => fn(v));

  const arrayHandler = (arr: string[] | string[][]) =>
    arr.some((item) => {
      if (isString(item)) return stringHandler(item);
      else if (isArray(item)) return arrayHandler(item);
      else return false;
    });

  return { stringHandler, arrayHandler };
};
