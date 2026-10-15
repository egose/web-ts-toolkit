import { Include, Projection, Sort, Populate, PopulateAccess, Task } from './base';

/** Request-only list arguments: advanced body fields, or root-entry args; no per-call authorization. */
export interface PublicListArgs {
  select?: Projection;
  populate?: Populate[] | string;
  include?: Include | Include[];
  sort?: Sort;
  skip?: string | number;
  limit?: string | number;
  page?: string | number;
  pageSize?: string | number;
  tasks?: Task | Task[];
}

export interface PublicListOptions {
  /** @deprecated Compatibility no-op. Authorization, document grants, virtuals and decoration always run. */
  skim?: boolean;
  includePermissions?: boolean;
  /**
   * Include field-level `_view`/`_edit` maps. Defaults to `includePermissions`
   * when omitted. `includePermissions: true` + `includeFieldPermissions: false`
   * keeps `docPermissions`-hook keys but omits `_view`/`_edit` entirely.
   * Full internal document grants resolve independently of both metadata flags
   * and skim. These maps describe request-user permissions, never backend grants.
   */
  includeFieldPermissions?: boolean;
  /** Exact authorized match total, independent of pagination (default false). Wire requests also control HTTP metadata exposure. */
  includeCount?: boolean;
  populateAccess?: PopulateAccess;
  /** Mongoose hydration choice (public list default true); authorization and virtuals still run. Supported by service/root options. */
  lean?: boolean;
}
