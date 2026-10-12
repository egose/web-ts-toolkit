import { Include, Projection, Sort, Populate, PopulateAccess, FindAccess } from './base';
import type { ServiceAuthorization } from './service-authorization';

export interface FindArgs<T = unknown> {
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
  includeCount?: boolean;
  populateAccess?: PopulateAccess;
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
  skim?: boolean;
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
