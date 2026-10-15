import { Include, Projection, Sort, Populate, PopulateAccess, FindAccess } from './base';
import type { ServiceAuthorization } from './service-authorization';

/** Internal list query/presentation arguments; the predicate is the separate first find argument. */
export interface FindArgs<T = unknown> {
  /** Desired output selection, not a field grant; private dependency fetching remains separate. */
  select?: Projection;
  populate?: Populate[] | string;
  include?: Include | Include[];
  sort?: Sort;
  skip?: string | number;
  limit?: string | number;
  page?: string | number;
  pageSize?: string | number;
}

export interface FindOptions<TModel = unknown, TVirtuals extends object = Record<never, never>> {
  /** Trusted server-only per-call policy. Omitted dimensions use request authority; never a wire/default option. */
  readonly authorization?: ServiceAuthorization<TModel, TVirtuals>;
  /** @deprecated Compatibility no-op. Authorization, document grants, virtuals and decoration always run. */
  skim?: boolean;
  includePermissions?: boolean;
  /**
   * Include field-level `_view`/`_edit` maps. Defaults to `includePermissions`
   * when omitted. `includePermissions: true` + `includeFieldPermissions: false`
   * keeps `docPermissions`-hook keys but omits `_view`/`_edit` entirely.
   * Internal document grants are computed independently of both metadata flags
   * and skim. These maps describe request-user permissions, never backend grants.
   */
  includeFieldPermissions?: boolean;
  /** Compute exact authorized totalCount independently of pagination (default false). count is returned-row count. */
  includeCount?: boolean;
  populateAccess?: PopulateAccess;
  /** Fetch without Mongoose hydration (internal default false). Finalized output still enforces fields and computes virtuals. */
  lean?: boolean;
}

export interface FindOneArgs<T = unknown> {
  select?: Projection;
  sort?: Sort;
  populate?: Populate[] | string;
  include?: Include | Include[];
}

export interface FindOneOptions<TModel = unknown, TVirtuals extends object = Record<never, never>> {
  /** Trusted server-only rows/output/related policy; ordinary selection remains in args.select. */
  readonly authorization?: ServiceAuthorization<TModel, TVirtuals>;
  access?: FindAccess;
  populateAccess?: PopulateAccess;
  /** @deprecated Compatibility no-op. Authorization, document grants, virtuals and decoration always run. */
  skim?: boolean;
  /** Fetch without Mongoose hydration (default false), retaining the same output authorization and virtuals. */
  lean?: boolean;
  includePermissions?: boolean;
  /**
   * Include field-level `_view`/`_edit` maps. Defaults to `includePermissions`
   * when omitted. `includePermissions: true` + `includeFieldPermissions: false`
   * keeps `docPermissions`-hook keys but omits `_view`/`_edit` entirely.
   * Internal document grants are computed independently of both metadata flags
   * and skim. These maps describe request-user permissions, never backend grants.
   */
  includeFieldPermissions?: boolean;
}

export interface FindByIdArgs<T = unknown> {
  select?: Projection;
  populate?: Populate[] | string;
  include?: Include | Include[];
}

export interface FindByIdOptions<
  TModel = unknown,
  TVirtuals extends object = Record<never, never>,
> extends FindOneOptions<TModel, TVirtuals> {}
