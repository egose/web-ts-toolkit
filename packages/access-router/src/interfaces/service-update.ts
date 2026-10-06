import { Filter, Projection, Populate, PopulateAccess, Task } from './base';

export interface PublicUpdateArgs {
  select?: Projection;
  populate?: Populate[] | string;
  tasks?: Task | Task[];
}

export interface PublicUpsertArgs extends PublicUpdateArgs {}

export interface UpdateOneArgs<T = unknown> extends Omit<PublicUpdateArgs, 'select' | 'tasks'> {
  overrides?: {
    /** Trusted replacement: nullish generates row policy; false returns Forbidden without filter generation or persistence. */
    filter?: Filter<T>;
    populate?: Populate[] | string;
    /**
     * VIRT-04 internal plan transport (VIRT-00A D6).
     * Effective mutation output selection carried into internal finalization
     * before virtual evaluation (explicit `select`, `returningAll: false`
     * implicit `Object.keys(data)+_id`, or `undefined` for all). Public
     * `_update` still enforces presentation pick after decorate/tasks.
     */
    effectiveSelect?: Projection;
    /**
     * VIRT-04 initiating operation (VIRT-00A D1). Upsert branches keep
     * `operation: 'upsert'` while accesses follow the taken branch.
     * Defaults to `'update'` when absent.
     */
    operation?: string;
  };
}

export interface UpdateByIdArgs<T = unknown> extends Omit<PublicUpdateArgs, 'select' | 'tasks'> {
  overrides?: {
    populate?: Populate[] | string;
    /** Nullish resolves the identifier; false denies without ID/filter generation or persistence. Objects still receive row policy. */
    idFilter?: Filter<T>;
    /**
     * VIRT-04 internal plan transport (VIRT-00A D6): effective output
     * selection for virtual planning before decorate/tasks.
     */
    effectiveSelect?: Projection;
    /** VIRT-04 initiating operation (VIRT-00A D1); defaults to `'update'`. */
    operation?: string;
  };
}

export interface UpsertArgs<T = unknown> extends UpdateOneArgs<T> {}

export interface PublicUpdateOptions {
  skim?: boolean;
  returningAll?: boolean;
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

export interface PublicUpsertOptions extends PublicUpdateOptions {}

export interface UpdateOneOptions extends Omit<PublicUpdateOptions, 'returningAll'> {}
export interface UpdateByIdOptions extends UpdateOneOptions {}
export interface UpsertOptions extends UpdateOneOptions {}
