import { Include, Projection, Sort, Populate, PopulateAccess, Task } from './base';

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
