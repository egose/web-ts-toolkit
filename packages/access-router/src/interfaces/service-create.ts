import { Projection, Populate, PopulateAccess, Task } from './base';
import type { CreateAuthorization } from './service-authorization';

export interface PublicCreateArgs {
  select?: Projection;
  populate?: Populate[] | string;
  tasks?: Task | Task[];
}

export interface CreateArgs extends Omit<PublicCreateArgs, 'tasks'> {}

export interface PublicCreateOptions {
  /** @deprecated Compatibility no-op. Authorization, document grants, virtuals and decoration always run. */
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
  populateAccess?: PopulateAccess;
}

export interface CreateOptions<
  TModel = unknown,
  TVirtuals extends object = Record<never, never>,
> extends PublicCreateOptions {
  /** Trusted server-only independent input/output/related authority; existing-row policies reject. */
  readonly authorization?: CreateAuthorization<TModel, TVirtuals>;
}
