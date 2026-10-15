import { Projection, Populate, PopulateAccess, Task } from './base';
import type { MutationAuthorization } from './service-authorization';

export interface PublicUpdateArgs {
  select?: Projection;
  populate?: Populate[] | string;
  tasks?: Task | Task[];
}

export interface PublicUpsertArgs extends PublicUpdateArgs {}

export interface UpdateOneArgs<T = unknown> extends Omit<PublicUpdateArgs, 'tasks'> {}

export interface UpdateByIdArgs<T = unknown> extends Omit<PublicUpdateArgs, 'tasks'> {}

export interface UpsertArgs<T = unknown> extends UpdateOneArgs<T> {}

export interface PublicUpdateOptions {
  /** @deprecated Compatibility no-op. Authorization, document grants, virtuals and decoration always run. */
  skim?: boolean;
  /** Default true. Without explicit select, false selects submitted top-level keys plus _id for update output; grants still apply. */
  returningAll?: boolean;
  includePermissions?: boolean;
  /**
   * Include field-level `_view`/`_edit` maps. Defaults to `includePermissions`
   * when omitted. `includePermissions: true` + `includeFieldPermissions: false`
   * keeps `docPermissions`-hook keys but omits `_view`/`_edit` entirely.
   * Internal document grants are computed independently of both metadata flags
   * and skim. These maps describe request-user permissions, never backend grants.
   */
  includeFieldPermissions?: boolean;
  populateAccess?: PopulateAccess;
}

export interface PublicUpsertOptions extends PublicUpdateOptions {}

export interface UpdateOneOptions<TModel = unknown, TVirtuals extends object = Record<never, never>> extends Omit<
  PublicUpdateOptions,
  'returningAll'
> {
  /** Trusted server-only independent input/rows/output/related authority. Output grants never admit writes. */
  readonly authorization?: MutationAuthorization<TModel, TVirtuals>;
}
export interface UpdateByIdOptions<
  TModel = unknown,
  TVirtuals extends object = Record<never, never>,
> extends UpdateOneOptions<TModel, TVirtuals> {}
export interface UpsertOptions<
  TModel = unknown,
  TVirtuals extends object = Record<never, never>,
> extends UpdateOneOptions<TModel, TVirtuals> {}
