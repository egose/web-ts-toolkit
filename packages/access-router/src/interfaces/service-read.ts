import { Projection, Populate, Include, PopulateAccess, Task } from './base';

export interface PublicReadArgs {
  select?: Projection;
  populate?: Populate[] | string;
  include?: Include | Include[];
  tasks?: Task | Task[];
}

/**
 * Request presentation options. Server model hydration.publicRead (built-in hydrated)
 * governs both identifier/filter reads and both attempts of their list fallback.
 */
export interface PublicReadOptions {
  /** @deprecated Compatibility no-op. Authorization, document grants, virtuals and decoration always run. */
  skim?: boolean;
  populateAccess?: PopulateAccess;
  includePermissions?: boolean;
  /**
   * Include field-level `_view`/`_edit` maps. Defaults to `includePermissions`
   * when omitted. `includePermissions: true` + `includeFieldPermissions: false`
   * keeps `docPermissions`-hook keys but omits `_view`/`_edit` entirely.
   * Full internal document grants resolve independently of both metadata flags
   * and skim. These maps describe request-user permissions, never backend grants.
   */
  includeFieldPermissions?: boolean;
  /** Retry an authorized read miss with list access (default true); requires list operation access. Forbidden/BadRequest never retry. */
  tryList?: boolean;
}
