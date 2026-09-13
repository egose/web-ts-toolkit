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
import type { ParentRef } from '../types';

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

type Condition<T> = ApplyBasicQueryCasting<T> | QuerySelector<T> | LazyRequest<unknown> | EscapeLiteral;

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
  /**
   * ACI-04: structural guard so a `ParentRef` marker (`{ $parent: path }`)
   * cannot silently satisfy the all-optional `QuerySelector<T>`/root shape.
   * Without this, a reference-bearing filter would match the strict
   * `FilterQuery<T>` overload and mistype a descriptor as executable.
   * `$parent` as an object *key* is never a marker (ACI-01 D2.3); this only
   * blocks marker *values* from leaking into the strict surface.
   */
  $parent?: never;
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
  /**
   * ACI-04: same structural guard as the root selector (see above). Blocks
   * marker values from satisfying strict field-operator bags so overloads
   * discriminate reference-bearing filters at compile time.
   */
  $parent?: never;
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

// ---------------------------------------------------------------------------
// ACI-04: correlated-include filter surface.
// ---------------------------------------------------------------------------

/**
 * Literal-object escape for the correlated-include marker shape (ACI-01
 * D2.2): `{ $escape: { $parent: '<field>' } }` matches the literal object
 * `{ $parent: '<field>' }` against target data and is never interpreted as a
 * parent reference. Admitted in both the strict and the correlated filter
 * surface because an escape is data, not a reference: admitting it in the
 * strict surface keeps escape-only filters on the executable overload so the
 * static type agrees with the runtime (escapes never create descriptors).
 */
export interface EscapeLiteral {
  readonly $escape: ParentRef;
}

type CorrelatedCondition<T> =
  | ApplyBasicQueryCasting<T>
  | ParentRef
  | CorrelatedQuerySelector<T>
  | LazyRequest<unknown>
  | EscapeLiteral;

/**
 * Field-operator bag mirroring `QuerySelector<T>` with `ParentRef` admitted
 * exactly in the ACI-01 D3.1 value positions: comparison operators, `$in` /
 * `$nin` elements, `$regex` / `$options` (string fields only — the reference
 * stays inside the string-conditional branch so `$regex` on a numeric field
 * still fails to compile), and nested `$not` selectors. Flags that take no
 * value reference (`$exists`, `$type`, `$mod`) stay strict, as do bare array
 * elements (only `$in` / `$nin` arrays admit reference elements per D3.1).
 */
export type CorrelatedQuerySelector<T> = {
  // Comparison
  $eq?: ApplyBasicQueryCasting<T> | ParentRef;
  $gt?: QueryOperatorOperand<T> | ParentRef;
  $gte?: QueryOperatorOperand<T> | ParentRef;
  $in?: Array<QueryOperatorOperand<T> | ParentRef> | ParentRef;
  $lt?: QueryOperatorOperand<T> | ParentRef;
  $lte?: QueryOperatorOperand<T> | ParentRef;
  $ne?: ApplyBasicQueryCasting<T> | ParentRef;
  $nin?: Array<QueryOperatorOperand<T> | ParentRef> | ParentRef;
  // Logical
  $not?: QueryOperatorOperand<T> extends string ? CorrelatedQuerySelector<T> | RegExp : CorrelatedQuerySelector<T>;
  // Element
  $exists?: boolean;
  $type?: string | number;
  // Evaluation
  $expr?: unknown;
  $jsonSchema?: unknown;
  $mod?: QueryOperatorOperand<T> extends number ? [number, number] : never;
  $regex?: QueryOperatorOperand<T> extends string ? RegExp | string | ParentRef : never;
  $options?: QueryOperatorOperand<T> extends string ? string | ParentRef : never;
  // Structural guard (see `QuerySelector`): a marker value must not satisfy
  // the operator bag, and `$parent` mixed with operators is malformed.
  $parent?: never;
};

type CorrelatedRootQuerySelector<T> = {
  $and?: Array<CorrelatedFilterQuery<T>>;
  $nor?: Array<CorrelatedFilterQuery<T>>;
  $or?: Array<CorrelatedFilterQuery<T>>;
  $text?: {
    $search: string;
    $language?: string;
    $caseSensitive?: boolean;
    $diacriticSensitive?: boolean;
  };
  $where?: string | ((...args: never[]) => unknown);
  $comment?: string;
  /**
   * Structural guard: a bare `ParentRef` must not satisfy a filter clause,
   * so `{ $and: [parentField('x')] }` (a server-side `BadRequest` per
   * ACI-01 D3.1/ACI-02) fails to compile instead of mistyping.
   */
  $parent?: never;
};

/**
 * Filter surface for the seven correlated-include-capable methods
 * (ACI-04). A strict `FilterQuery<T>` value is always assignable here, and
 * additionally `ParentRef` markers are admitted in bare field positions and
 * the supported operator positions above. Passing a value containing a live
 * marker selects the descriptor overload at compile time; the runtime scan
 * enforces the same boundary for unchecked JavaScript callers.
 *
 * Existing `$$sq` (embedded `LazyRequest`) and typed-filter (`DottedPathFilter`
 * / `ServerSideCast`) escape hatches keep working: subquery values are still
 * admitted and are rewritten to `$$sq` payloads at `$include()` conversion
 * time while markers pass through untouched.
 */
export type CorrelatedFilterQuery<T> = {
  [P in keyof T]?: CorrelatedCondition<T[P]>;
} & CorrelatedRootQuerySelector<T>;
