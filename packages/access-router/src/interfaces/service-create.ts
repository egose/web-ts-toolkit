import { Projection, Populate, PopulateAccess, Task } from './base';

export interface PublicCreateArgs {
  select?: Projection;
  populate?: Populate[] | string;
  tasks?: Task | Task[];
}

export interface CreateArgs extends Omit<PublicCreateArgs, 'select' | 'tasks'> {
  overrides?: {
    populate?: Populate[] | string;
    /**
     * VIRT-04 internal plan transport (VIRT-00A D6).
     * Effective mutation output selection carried into internal finalization
     * before virtual evaluation. Internal create args omit `select` publicly;
     * this trusted transport supplies the effective selection (explicit
     * `select` or `undefined` for all) without changing public presentation
     * (public `_create` still picks after decorate/tasks).
     */
    effectiveSelect?: Projection;
    /**
     * VIRT-04 initiating operation (VIRT-00A D1). Upsert branches keep
     * `operation: 'upsert'` while virtual/output/doc accesses follow the
     * taken branch. Defaults to `'create'` when absent.
     */
    operation?: string;
  };
}

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
