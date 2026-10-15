import { BaseFilterAccess } from './access';
import { Filter } from './base';
import { SubPopulate } from './query-types';
import type { OutputAuthorization } from './service-authorization';
import type {
  SubdocumentReadAuthorization,
  SubdocumentMutationAuthorization,
  SubdocumentCreateAuthorization,
  SubdocumentDeleteAuthorization,
} from './subdocument-authorization';

/**
 * Named request-only genPopulate options. Omission/undefined uses the root scope.
 * Use ordinary response segments (['contacts']), not positional ['contacts', 'sub'].
 * Source fields, target operation/rows and persisted target fields retain request
 * checks. For explicit source/target output authority, use service query options.
 */
export interface PopulatePlanningOptions {
  readonly scopePath?: readonly string[];
  readonly authorization?: never;
  readonly documentAuthorization?: never;
}

/** Template selection is historically ignored, including empty/exclusion selections. */
export interface NewArgs {
  select?: string[];
}

/** Create-template output options. new() ignores select; rows/related policies are unsupported. */
export interface NewOptions<TModel = unknown, TVirtuals extends object = Record<never, never>> {
  /** @deprecated Compatibility no-op. Authorization, document grants, virtuals and decoration always run. */
  skim?: boolean;
  includePermissions?: boolean;
  includeFieldPermissions?: boolean;
  /** Trusted server-only output authority; no persistence or target dispatch is authorized. */
  readonly authorization?: OutputAuthorization<TModel, TVirtuals>;
}

export interface DistinctArgs<T = unknown> {
  filter?: Filter<T>;
}

export type SubdocumentId = string;
/** Top-level embedded array names; the receiving Mongoose schema validates JS/unknown models. */
export type SubdocumentName<T = unknown> = unknown extends T
  ? string
  : Extract<{ [K in keyof T]: NonNullable<T[K]> extends readonly object[] ? K : never }[keyof T], string>;
/** Infer a persisted element from a literal top-level array name; runtime checks exclude references. */
export type SubdocumentModel<T, S extends string> = unknown extends T
  ? unknown
  : S extends keyof T
    ? NonNullable<T[S]> extends readonly (infer C)[]
      ? C
      : never
    : never;
export type SubdocumentVirtuals<V, S extends string> = S extends keyof V
  ? NonNullable<V[S]> extends readonly (infer C extends object)[]
    ? C
    : Record<never, never>
  : Record<never, never>;
export type SubdocumentRecord = Record<string, unknown>;
export type SubdocumentBulkRecord = SubdocumentRecord & { _id?: unknown };
export type SubdocumentCreateInput = SubdocumentRecord | SubdocumentRecord[];
export type SubdocumentBulkUpdateInput = SubdocumentBulkRecord[];

export interface PublicSubdocumentListOptions<T = unknown> {
  filter?: Filter<T>;
  select?: string[];
}

export interface PublicSubdocumentReadOptions {
  select?: string[];
  populate?: SubPopulate | SubPopulate[];
}

export interface PublicSubdocumentCreateOptions {
  addFirst?: boolean;
}

/** Internal list options; child selection/filter paths are relative to the embedded element. */
export interface SubdocumentListOptions<
  P = unknown,
  C = unknown,
  V extends object = Record<never, never>,
> extends PublicSubdocumentListOptions<C> {
  readonly authorization?: SubdocumentReadAuthorization<P, C, V>;
}
/** Internal read options; populate targets remain request-only. */
export interface SubdocumentReadOptions<
  P = unknown,
  C = unknown,
  V extends object = Record<never, never>,
> extends PublicSubdocumentReadOptions {
  readonly authorization?: SubdocumentReadAuthorization<P, C, V>;
}
/** Internal append/prepend options; response visibility is independent from child input. */
export interface SubdocumentCreateOptions<
  P = unknown,
  C = unknown,
  V extends object = Record<never, never>,
> extends PublicSubdocumentCreateOptions {
  readonly authorization?: SubdocumentCreateAuthorization<P, C, V>;
}
/** Internal single/bulk update options, including explicit post-save read visibility. */
export interface SubdocumentUpdateOptions<P = unknown, C = unknown, V extends object = Record<never, never>> {
  readonly authorization?: SubdocumentMutationAuthorization<P, C, V>;
}
/** Internal delete options, with no field or response-visibility authority. */
export interface SubdocumentDeleteOptions<P = unknown, C = unknown> {
  readonly authorization?: SubdocumentDeleteAuthorization<P, C>;
}
/** No transport options exist for dedicated update/delete. Controls reject at runtime too. */
export type PublicSubdocumentMutationOptions = Readonly<Record<string, never>>;

export interface SubdocumentParentArgs {
  populate?: SubPopulate | SubPopulate[];
}

export interface SubdocumentParentOptions {
  access?: BaseFilterAccess;
  lean?: boolean;
}
