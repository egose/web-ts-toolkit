import { Projection, Populate, PopulateAccess, Task } from './base';

export interface PublicCreateArgs {
  select?: Projection;
  populate?: Populate[] | string;
  tasks?: Task | Task[];
}

export interface CreateArgs extends Omit<PublicCreateArgs, 'select' | 'tasks'> {}

export interface PublicCreateOptions {
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
  populateAccess?: PopulateAccess;
}

export interface CreateOptions extends PublicCreateOptions {}
