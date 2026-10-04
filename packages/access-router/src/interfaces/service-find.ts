import { Include, Projection, Sort, Filter, Populate, PopulateAccess, FindAccess } from './base';

export interface FindArgs<T = unknown> {
  select?: Projection;
  populate?: Populate[] | string;
  include?: Include | Include[];
  sort?: Sort;
  skip?: string | number;
  limit?: string | number;
  page?: string | number;
  pageSize?: string | number;
  overrides?: {
    /** Trusted replacement: nullish generates row policy; false returns Forbidden without filter generation or persistence. */
    filter?: Filter<T>;
    select?: Projection;
    populate?: Populate[] | string;
  };
}

export interface FindOptions {
  skim?: boolean;
  includePermissions?: boolean;
  /**
   * Include field-level `_view`/`_edit` maps. Defaults to `includePermissions`
   * when omitted. `includePermissions: true` + `includeFieldPermissions: false`
   * keeps `docPermissions`-hook keys but omits `_view`/`_edit` entirely.
   * Enabling field maps also computes doc permissions as grant input (even
   * under skim or when `includePermissions` is false), so the maps match the
   * `includePermissions: true` output.
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
  overrides?: {
    /** Trusted replacement: nullish generates row policy; false returns Forbidden without filter generation or persistence. */
    filter?: Filter<T>;
    select?: Projection;
    populate?: Populate[] | string;
  };
}

export interface FindOneOptions {
  access?: FindAccess;
  populateAccess?: PopulateAccess;
  skim?: boolean;
  lean?: boolean;
  includePermissions?: boolean;
  /**
   * Include field-level `_view`/`_edit` maps. Defaults to `includePermissions`
   * when omitted. `includePermissions: true` + `includeFieldPermissions: false`
   * keeps `docPermissions`-hook keys but omits `_view`/`_edit` entirely.
   * Enabling field maps also computes doc permissions as grant input (even
   * under skim or when `includePermissions` is false), so the maps match the
   * `includePermissions: true` output.
   */
  includeFieldPermissions?: boolean;
}

export interface FindByIdArgs<T = unknown> {
  select?: Projection;
  populate?: Populate[] | string;
  include?: Include | Include[];
  overrides?: {
    select?: Projection;
    populate?: Populate[] | string;
    /** Nullish resolves the identifier; false denies without ID/filter generation or persistence. Objects still receive row policy. */
    idFilter?: Filter<T>;
  };
}

export interface FindByIdOptions extends FindOneOptions {}
