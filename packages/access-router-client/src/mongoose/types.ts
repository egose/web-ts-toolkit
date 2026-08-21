// Strongly-typed minimal query surface for the access-router client.
//
// This is intentionally NOT a full copy of `@types/mongoose`. It exposes
// the operator set the sibling server actually forwards to Mongoose and
// keeps a deliberate, named escape hatch (`DottedPathFilter<T>` /
// `ServerSideCast<T>`) for dynamic dotted paths and explicit server-side
// casting rather than weakening every known field with a naked `unknown`.
//
// Behavior rules enforced by these types:
//
// - A known field accepts its scalar value, an array of those scalars
//   (expanded to an `$in`-equivalent by the server), RegExp when string-typed,
//   the comparison/element/evaluation operators valid for that scalar, and
//   nothing else — invalid values do not compile.
// - Root logical operators (`$and`/`$nor`/`$or`/`$text`/`$where`/`$comment`)
//   are typed at the root of a filter only.
// - Unknown keys are rejected for `FilterQuery<known shape>` call sites.
// - For dynamic dotted paths (e.g. `'user.friends.name'`) or for explicit
//   server-side casting, use the `DottedPathFilter<T>` / `ServerSideCast<T>`
//   escape hatches, both of which restore schema-less field matching for the
//   whole filter without leaking that looseness back onto typed fields.
// - A known field condition may also be a `LazyRequest<unknown>` value:
//   `access-router` subqueries are expressed by embedding a service method's
//   lazy return (e.g. `userService.readAdvancedFilter(...)`) directly as a
//   filter value, which the client's `replaceSubQuery(...)` rewrites into
//   `$$sq` root-router metadata before the request is sent. The typed
//   surface therefore admits `LazyRequest<unknown>` on every known field so
//   the documented subquery pattern compiles without forcing callers
//   through `ServerSideCast<T>` for a feature the runtime already supports.

import type { LazyRequest } from '../types';

export type AnyArray<T> = T[] | ReadonlyArray<T>;

type Unpacked<T> = T extends (infer U)[] ? U : T extends ReadonlyArray<infer U> ? U : T;

/**
 * Values a known field condition accepts without an operator wrapper.
 *
 * - The scalar value itself (`name: 'Max'`).
 * - An array of scalars — the sibling server expands this to an `$in` query.
 * - For array-typed document fields, the element type is also accepted as a
 *   bare condition (e.g. `tags: 'vip'` matches any array containing `'vip'`).
 * - RegExp is only accepted where `T` is (or unwraps to) `string`.
 *
 * The naked `unknown` that previously terminated this union is gone. Use
 * `ServerSideCast<T>` / `DottedPathFilter<T>` for the cases that needed it
 * (dynamic dotted paths and explicit server-side casting).
 */
export type ApplyBasicQueryCasting<T> =
  | T
  | T[]
  | (T extends AnyArray<unknown> ? Unpacked<T> : never)
  | (T extends string ? RegExp : never);

type QueryOperatorOperand<T> = T extends AnyArray<unknown> ? Unpacked<T> : T;

type Condition<T> = ApplyBasicQueryCasting<T> | QuerySelector<T> | LazyRequest<unknown>;

export type _FilterQuery<T> = {
  [P in keyof T]?: Condition<T[P]>;
} & RootQuerySelector<T>;

type RootQuerySelector<T> = {
  /** @see https://www.mongodb.com/docs/manual/reference/operator/query/and/#op._S_and */
  $and?: Array<_FilterQuery<T>>;
  /** @see https://www.mongodb.com/docs/manual/reference/operator/query/nor/#op._S_nor */
  $nor?: Array<_FilterQuery<T>>;
  /** @see https://www.mongodb.com/docs/manual/reference/operator/query/or/#op._S_or */
  $or?: Array<_FilterQuery<T>>;
  /** @see https://www.mongodb.com/docs/manual/reference/operator/query/text */
  $text?: {
    $search: string;
    $language?: string;
    $caseSensitive?: boolean;
    $diacriticSensitive?: boolean;
  };
  /** @see https://www.mongodb.com/docs/manual/reference/operator/query/where/#op._S_where */
  $where?: string | ((...args: never[]) => unknown);
  /** @see https://www.mongodb.com/docs/manual/reference/operator/query/comment/#op._S_comment */
  $comment?: string;
};

type QuerySelector<T> = {
  // Comparison
  $eq?: ApplyBasicQueryCasting<T>;
  $gt?: QueryOperatorOperand<T>;
  $gte?: QueryOperatorOperand<T>;
  $in?: QueryOperatorOperand<T>[];
  $lt?: QueryOperatorOperand<T>;
  $lte?: QueryOperatorOperand<T>;
  $ne?: ApplyBasicQueryCasting<T>;
  $nin?: QueryOperatorOperand<T>[];
  // Logical
  $not?: QueryOperatorOperand<T> extends string ? QuerySelector<T> | RegExp : QuerySelector<T>;
  // Element
  /**
   * When `true`, `$exists` matches the documents that contain the field,
   * including documents where the field value is null.
   */
  $exists?: boolean;
  $type?: string | number;
  // Evaluation
  $expr?: unknown;
  $jsonSchema?: unknown;
  $mod?: QueryOperatorOperand<T> extends number ? [number, number] : never;
  $regex?: QueryOperatorOperand<T> extends string ? RegExp | string : never;
  $options?: QueryOperatorOperand<T> extends string ? string : never;
};

/**
 * Escape hatch for dynamic dotted paths and explicit server-side casting.
 *
 * `DottedPathFilter<T>` restores schema-less field matching: every
 * `Record<string, unknown>` value is forwarded to the sibling server
 * untouched, so dotted paths such as `'user.friends.name'` and values cast
 * on the server side still typecheck.
 *
 * Crucially, `DottedPathFilter<T>` restores this looseness only when the
 * caller explicitly asks for it; it does NOT weaken the typed
 * `FilterQuery<T>` surface, so a stray invalid value on a known field still
 * fails to compile.
 */
export type DottedPathFilter<T> = _FilterQuery<T> & {
  [key: string]: unknown;
};

/**
 * Escape hatch for explicit server-side casting. Use this at the call site
 * of any typed `FilterQuery<T>` parameter when you need to forward a value
 * the client type cannot express (server-side casting, aggregation-shaped
 * values for `$expr`, or a dotted-path condition that the typed surface does
 * not model). The sibling server accepts arbitrary objects/arrays for
 * filters (`objectOrArraySchema`), so this never causes a runtime failure;
 * it is purely a deliberate compile-time opt-out.
 */
export type ServerSideCast<T> = DottedPathFilter<T>;
