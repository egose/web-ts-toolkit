import type { Document } from 'mongoose';
import type { Buffer } from 'node:buffer';

type FilteredValue<T, D extends readonly unknown[]> = unknown extends T
  ? unknown
  : D['length'] extends 8
    ? unknown
    : T extends Document<unknown>
      ? unknown
      : T extends Date
        ? Date
        : T extends RegExp
          ? RegExp
          : T extends Buffer
            ? Buffer
            : T extends { readonly _bsontype: string }
              ? unknown
              : T extends ReadonlyMap<infer K, infer V>
                ? [K] extends [string]
                  ? Readonly<Record<string, FilteredValue<V, [unknown, ...D]> | undefined>>
                  : unknown
                : T extends readonly (infer E)[]
                  ? ReadonlyArray<FilteredValue<E, [unknown, ...D]> | null | undefined>
                  : T extends object
                    ? { readonly [K in Extract<keyof T, string>]?: FilteredValue<T[K], [unknown, ...D]> }
                    : T extends string | number | boolean | bigint | null | undefined
                      ? T
                      : unknown;

/**
 * Conservative DATA returned by pickAllowedFieldsMany, never document authority.
 * Deep optional string fields (including _id) may be omitted recursively; arrays do not prove
 * cardinality or non-null elements, and string Maps normalize to records. Native
 * Date/RegExp/Buffer use their base types, not custom subclasses. Hydrated/other
 * BSON values and recursion at depth eight are unknown: validate/narrow them.
 * Hydrated detection includes Document<unknown> with string identifiers.
 * Readonly assists inspection; it is not a frozen-native or supported-input guarantee.
 */
export type FilteredOutput<T> = FilteredValue<T, []>;
