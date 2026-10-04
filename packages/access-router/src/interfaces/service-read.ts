import { Projection, Populate, Include, PopulateAccess, Task } from './base';

export interface PublicReadArgs {
  select?: Projection;
  populate?: Populate[] | string;
  include?: Include | Include[];
  tasks?: Task | Task[];
}

export interface PublicReadOptions {
  skim?: boolean;
  populateAccess?: PopulateAccess;
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
  /** Retry an authorized read miss with list access (default true); requires list operation access. Forbidden/BadRequest never retry. */
  tryList?: boolean;
}
