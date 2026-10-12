import { Projection, Populate, PopulateAccess, Task } from './base';
import type { CreateAuthorization } from './service-authorization';

export interface PublicCreateArgs {
  select?: Projection;
  populate?: Populate[] | string;
  tasks?: Task | Task[];
}

export interface CreateArgs extends Omit<PublicCreateArgs, 'tasks'> {}

export interface PublicCreateOptions {
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
  /** Trusted server-only output/related authority; rows reject and input writes still use request permissions. */
  readonly authorization?: CreateAuthorization<TModel, TVirtuals>;
}
