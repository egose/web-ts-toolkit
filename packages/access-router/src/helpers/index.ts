export * from './collection';
export * from './concurrency';
export * from './document';
export * from './errors';
export * from './query';
export * from './sort-policy';

import { forEach, isArray, isEmpty, isObject, isPlainObject, isString } from '@web-ts-toolkit/utils';
import { isSchema, isReference } from '../lib';
import { FilterOperator } from '../enums';
import type { RequestConcurrencyScheduler } from './concurrency';

type SchemaTree = Record<string, unknown>;
type ReferenceMap = { [key: string]: string | ReferenceMap };
type QueryHandler = (operator: FilterOperator, value: unknown, key: string) => unknown | Promise<unknown>;
type QueryScheduler = RequestConcurrencyScheduler;

function recurseObject(obj: unknown): string | ReferenceMap | null {
  if (isSchema(obj)) {
    return buildRefs((obj as typeof obj & { tree: SchemaTree }).tree);
  }

  if (!isObject(obj)) return null;
  if (isReference(obj)) {
    return obj.ref as unknown as string;
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

export async function iterateQuery(
  query: unknown,
  handler?: QueryHandler,
  scheduler?: QueryScheduler,
  scheduled = false,
): Promise<unknown> {
  if (!isPlainObject(query)) return query;
  if (!handler) return query;

  const queryObject = query as Record<string, unknown>;
  const entries = Object.entries(queryObject);
  const mapEntry = async ([key, val]: [string, unknown]) => {
    if (isPlainObject(val)) {
      const plainValue = val as Record<string, unknown>;
      if (plainValue.$$sq) {
        return scheduled || !scheduler
          ? handler(FilterOperator.SubQuery, plainValue.$$sq, key)
          : scheduler.run(() => Promise.resolve(handler(FilterOperator.SubQuery, plainValue.$$sq, key)));
      } else if (plainValue.$$date) {
        return handler(FilterOperator.Date, plainValue.$$date, key);
      } else {
        return iterateQuery(val, handler, scheduler, scheduled);
      }
    }

    if (isArray(val)) {
      const items = val as unknown[];
      if (scheduler && !scheduled) {
        return scheduler.map(items, (v) => iterateQuery(v, handler, scheduler, true));
      }
      return Promise.all(items.map((v) => iterateQuery(v, handler, scheduler, scheduled)));
    }

    return val;
  };
  const values =
    scheduler && !scheduled ? await scheduler.map(entries, mapEntry) : await Promise.all(entries.map(mapEntry));

  return Object.fromEntries(entries.map(([key], index) => [key, values[index]]));
}

export const createValidator = (fn: (key: string) => boolean) => {
  const stringHandler = (key: string) =>
    key
      .trim()
      .split(' ')
      .every((v) => fn(v));

  const arrayHandler = (arr: string[] | string[][]): boolean =>
    arr.some((item) => {
      if (isString(item)) return stringHandler(item);
      else if (isArray(item)) return arrayHandler(item);
      else return false;
    });

  return { stringHandler, arrayHandler };
};
