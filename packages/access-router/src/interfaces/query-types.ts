import mongoose from 'mongoose';

export interface KeyValueProjection {
  [key: string]: 1 | -1;
}

export type Projection = string[] | string | KeyValueProjection;

export type SortOrder = -1 | 1 | 'asc' | 'ascending' | 'desc' | 'descending';

export type Sort = string | { [key: string]: SortOrder } | [string, SortOrder][] | undefined | null;

type Primitive = string | number | boolean | bigint | symbol | null | undefined;
type NonTraversable = Primitive | Date | RegExp | Function;
type PrevDepth = [never, 0, 1, 2, 3, 4, 5];

type IsUnknown<T> = unknown extends T ? ([keyof T] extends [never] ? true : false) : false;
type Descend<T> = T extends readonly (infer U)[] ? U : T;
type ArrayValue<T> = T extends readonly (infer U)[] ? U : T;
type ComparableValue = string | number | bigint | Date;

type WithDefaultId<T> = T extends object ? T & { _id?: unknown } : { _id?: unknown };
/**
 * Public output with optional computed virtual shape (VIRT-01, VIRT-00A D3).
 * Virtual names are NEVER added to persisted `Filter`, sort/distinct inputs,
 * or client write types — only selected output shape gains optional virtuals.
 */
export type WithVirtuals<TModel, TVirtuals extends object = Record<never, never>> = TModel & Partial<TVirtuals>;
export type PublicOutput<T, TVirtuals extends object = Record<never, never>> =
  WithVirtuals<T, TVirtuals> extends object
    ? WithVirtuals<T, TVirtuals> & Record<string, unknown>
    : Record<string, unknown>;
export type ModelDocument<TModel = unknown> = mongoose.Document & TModel;

type TrimLeft<S extends string> = S extends ` ${infer Rest}` ? TrimLeft<Rest> : S;
type TrimRight<S extends string> = S extends `${infer Rest} ` ? TrimRight<Rest> : S;
type Trim<S extends string> = TrimLeft<TrimRight<S>>;
type SplitProjectionString<S extends string> = S extends `${infer Head} ${infer Tail}`
  ? SplitProjectionString<Head> | SplitProjectionString<Tail>
  : Trim<S>;
type ProjectionTokens<TProjection> = TProjection extends readonly string[]
  ? TProjection[number]
  : TProjection extends string
    ? SplitProjectionString<TProjection>
    : TProjection extends KeyValueProjection
      ? {
          [K in Extract<keyof TProjection, string>]: TProjection[K] extends 1 ? K : never;
        }[Extract<keyof TProjection, string>]
      : never;
type PositiveProjectionPaths<TProjection> =
  ProjectionTokens<TProjection> extends infer TToken
    ? TToken extends string
      ? TToken extends ''
        ? never
        : TToken extends `-${string}`
          ? never
          : TToken
      : never
    : never;
type UnionToIntersection<T> = (T extends unknown ? (value: T) => void : never) extends (value: infer I) => void
  ? I
  : never;
type Simplify<T> = { [K in keyof T]: T[K] } & {};
type DeepPickSingle<T, TPath extends string> = TPath extends `${infer Head}.${infer Tail}`
  ? Head extends keyof WithDefaultId<T>
    ? Head extends string
      ? {
          [K in Head]: WithDefaultId<T>[K] extends readonly (infer U)[]
            ? Array<Simplify<DeepPickSingle<U, Tail>>>
            : WithDefaultId<T>[K] extends object
              ? Simplify<DeepPickSingle<WithDefaultId<T>[K], Tail>>
              : WithDefaultId<T>[K];
        }
      : {}
    : {}
  : TPath extends keyof WithDefaultId<T>
    ? Pick<WithDefaultId<T>, TPath>
    : {};
type DeepPick<T, TPaths extends string> = Simplify<UnionToIntersection<DeepPickSingle<T, TPaths>>>;
/**
 * Literal-select output with optional virtuals (VIRT-01, VIRT-00A D3).
 * Virtual outputs stay optional (`Partial`) because authorization, absent
 * dependencies, `undefined`, and fail-closed errors can omit them.
 */
export type SelectedPublicOutput<T, TProjection, TVirtuals extends object = Record<never, never>> =
  string extends PositiveProjectionPaths<TProjection>
    ? PublicOutput<T, TVirtuals>
    : [PositiveProjectionPaths<TProjection>] extends [never]
      ? PublicOutput<T, TVirtuals>
      : DeepPick<WithVirtuals<T, TVirtuals>, Extract<PositiveProjectionPaths<TProjection>, string>>;
type PopulateInput = Populate | string;
type PopulateInputs<TPopulate> = TPopulate extends readonly (infer U)[] ? U : TPopulate;
type PopulatePath<TPopulateEntry> = TPopulateEntry extends string
  ? TPopulateEntry
  : TPopulateEntry extends { path: infer TPath extends string }
    ? TPath
    : never;
type PopulateSelect<TPopulateEntry> = TPopulateEntry extends { select?: infer TSelect } ? TSelect : undefined;
type PopulateLeafValue<TValue, TPopulateEntry> = TValue extends readonly (infer U)[]
  ? Array<SelectedPublicOutput<U, PopulateSelect<TPopulateEntry>>>
  : SelectedPublicOutput<TValue, PopulateSelect<TPopulateEntry>>;
type PopulateEntryShape<T, TPath extends string, TValue> = TPath extends `${infer Head}.${infer Tail}`
  ? Head extends keyof WithDefaultId<T>
    ? Head extends string
      ? {
          [K in Head]: WithDefaultId<T>[K] extends readonly (infer U)[]
            ? Array<Simplify<PopulateEntryShape<U, Tail, TValue>>>
            : Simplify<PopulateEntryShape<WithDefaultId<T>[K], Tail, TValue>>;
        }
      : {}
    : {}
  : TPath extends keyof WithDefaultId<T>
    ? Pick<{ [K in TPath]: TValue }, TPath>
    : {};
type PopulateOutputShape<T, TPopulateEntry> =
  PopulatePath<TPopulateEntry> extends infer TPath extends string
    ? PopulateEntryShape<T, TPath, PopulateLeafValue<PathValue<WithDefaultId<T>, TPath>, TPopulateEntry>>
    : {};
type PopulateOutput<T, TPopulate> =
  string extends PopulatePath<PopulateInputs<TPopulate>>
    ? {}
    : [PopulatePath<PopulateInputs<TPopulate>>] extends [never]
      ? {}
      : Simplify<UnionToIntersection<PopulateOutputShape<T, Extract<PopulateInputs<TPopulate>, PopulateInput>>>>;
export type SelectedPopulatedPublicOutput<
  T,
  TProjection,
  TPopulate,
  TVirtuals extends object = Record<never, never>,
> = Simplify<SelectedPublicOutput<T, TProjection, TVirtuals> & PopulateOutput<T, TPopulate>>;

type Unwrap<T> = NonNullable<Descend<T>>;

export type DeepFieldPath<T, Depth extends number = 4> = [Depth] extends [never]
  ? never
  : Unwrap<T> extends NonTraversable
    ? never
    : {
        [K in Extract<keyof Unwrap<T>, string>]:
          | K
          | (NonNullable<Unwrap<T>[K]> extends NonTraversable
              ? never
              : NonNullable<Unwrap<T>[K]> extends readonly (infer U)[]
                ? Unwrap<U> extends NonTraversable
                  ? never
                  : `${K}.${DeepFieldPath<U, PrevDepth[Depth]>}`
                : NonNullable<Unwrap<T>[K]> extends object
                  ? `${K}.${DeepFieldPath<NonNullable<Unwrap<T>[K]>, PrevDepth[Depth]>}`
                  : never);
      }[Extract<keyof Unwrap<T>, string>];

export type PathValue<T, TPath extends string> = TPath extends `${infer Head}.${infer Tail}`
  ? Head extends Extract<keyof Unwrap<T>, string>
    ? PathValue<Unwrap<Unwrap<T>[Head]>, Tail>
    : unknown
  : TPath extends Extract<keyof Unwrap<T>, string>
    ? Unwrap<T>[TPath]
    : unknown;

type FieldFilterOperators<T> = {
  $eq?: T;
  $ne?: T;
  $in?: Array<ArrayValue<T>>;
  $nin?: Array<ArrayValue<T>>;
  $exists?: boolean;
  $gt?: ArrayValue<T> extends ComparableValue ? ArrayValue<T> : never;
  $gte?: ArrayValue<T> extends ComparableValue ? ArrayValue<T> : never;
  $lt?: ArrayValue<T> extends ComparableValue ? ArrayValue<T> : never;
  $lte?: ArrayValue<T> extends ComparableValue ? ArrayValue<T> : never;
  $regex?: ArrayValue<T> extends string ? string | RegExp : never;
  $all?: T extends readonly unknown[] ? Array<ArrayValue<T>> : never;
  $size?: T extends readonly unknown[] ? number : never;
  $elemMatch?: ArrayValue<T> extends object ? TypedFilter<ArrayValue<T>> : never;
  $$sq?: unknown;
  $$date?: unknown;
  [key: `$${string}`]: unknown;
};

type FieldFilterValue<T> = T | FieldFilterOperators<NonNullable<T>>;
type LooseFilter = false | Record<string, unknown>;

type TypedFilterObject<T> = {
  [K in DeepFieldPath<T>]?: FieldFilterValue<PathValue<T, K>>;
} & {
  _id?: FieldFilterValue<unknown>;
  $and?: TypedFilter<T>[];
  $or?: TypedFilter<T>[];
  $nor?: TypedFilter<T>[];
  [key: `$${string}`]: unknown;
};

export type TypedFilter<T> = false | TypedFilterObject<WithDefaultId<T>>;
export type Filter<T = unknown> = IsUnknown<T> extends true ? LooseFilter : TypedFilter<T>;

/**
 * Batched related-data join. Count uses one grouped aggregate per execution,
 * counting distinct authorized target documents independently of list pagination.
 * The target schema casts authorized filters/foreign operands; invalid casts return
 * BadRequest. Query casting does not execute countDocuments middleware/plugins.
 */
export interface LegacyInclude {
  mode?: 'legacy';
  model: string;
  op: 'list' | 'read' | 'count';
  /**
   * Output path; must not overlap the receiving model's documentPermissionField
   * (equal, ancestor or descendant, including equivalent bracket paths).
   * Nested receiving-model settings apply. Rejected before target persistence.
   */
  path: string;
  filter?: Filter;
  localField: string;
  foreignField: string;
  args?: unknown;
  options?: unknown;
}

/**
 * Explicit structural marker referencing a field of the immediate parent
 * document (ACI-01 D2.1). Recognized only in filter/id value positions of
 * correlated includes; magic `$field` strings are never markers.
 */
export interface ParentRef {
  $parent: string;
}

/** Filter template for correlated includes; values may carry {@link ParentRef} markers. */
export type CorrelatedFilter = Record<string, unknown>;

export interface CorrelatedIncludeArgs {
  select?: Projection;
  sort?: Sort;
  skip?: number | string;
  limit?: number | string;
  page?: number | string;
  pageSize?: number | string;
  include?: Include | Include[];
}

interface CorrelatedIncludeBase {
  mode: 'correlated';
  model: string;
  op: 'list' | 'read' | 'count';
  /**
   * Output-only field path. Must not equal, contain or descend from the receiving
   * model's documentPermissionField (default `_permissions`). The include tree is
   * preflighted before target persistence; violations return BadRequest.
   */
  path: string;
  args?: CorrelatedIncludeArgs;
  options?: Record<string, never>;
}

/** Identifier read: exactly one of `id` / `filter` must be present. */
export interface CorrelatedReadByIdInclude extends CorrelatedIncludeBase {
  op: 'read';
  id: string | ParentRef;
  filter?: never;
}

export interface CorrelatedReadByFilterInclude extends CorrelatedIncludeBase {
  op: 'read';
  filter: CorrelatedFilter;
  id?: never;
}

export interface CorrelatedListInclude extends CorrelatedIncludeBase {
  op: 'list';
  filter: CorrelatedFilter;
  id?: never;
}

export interface CorrelatedCountInclude extends CorrelatedIncludeBase {
  op: 'count';
  filter: CorrelatedFilter;
  id?: never;
}

export type CorrelatedInclude =
  | CorrelatedReadByIdInclude
  | CorrelatedReadByFilterInclude
  | CorrelatedListInclude
  | CorrelatedCountInclude;

/** Related output cannot overwrite authorization metadata at any supported nested level. */
export type Include = LegacyInclude | CorrelatedInclude;

export type FindAccess = 'list' | 'read';
export type PopulateAccess = 'list' | 'read';

export interface Populate {
  path: string;
  select?: Projection;
  match?: unknown;
  access?: PopulateAccess;
}

export interface SubPopulate {
  path: string;
  select?: Projection;
}
