/** Package-only, per-call output intent. Resolve defaults before any async admission. */
import type { Defaults, FindArgs, FindOneOptions, FindOptions } from '../interfaces';
import { deepIsolateValue } from '../helpers/document';
import {
  resolveCreateArgs,
  resolveCreateOptions,
  resolveFindArgs,
  resolveFindByIdArgs,
  resolveFindByIdOptions,
  resolveFindOneArgs,
  resolveFindOneOptions,
  resolveFindOptions,
  resolveUpdateByIdArgs,
  resolveUpdateByIdOptions,
  resolveUpdateOneArgs,
  resolveUpdateOneOptions,
} from './model-service-defaults';

export type ModelServiceIntentMethod = 'find' | 'findOne' | 'findById' | 'create' | 'updateOne' | 'updateById';
export interface ModelServiceIntent {
  readonly args: FindArgs;
  readonly options: Omit<FindOptions & FindOneOptions, 'authorization'>;
}
type IntentOwner = {
  readonly defaults: Defaults;
  getPermissionsPosture(): { stripPermissionsField: boolean; disableFieldPermissions: boolean };
};

export function captureModelServiceIntent(
  owner: IntentOwner,
  method: ModelServiceIntentMethod,
  args: FindArgs = {},
  options: ModelServiceIntent['options'] = {},
): ModelServiceIntent {
  // Read the selected service bag once. Functions/native query leaves retain their
  // existing semantics through deepIsolateValue; models/authority are not cloned.
  const defaults = owner.defaults;
  const posture = owner.getPermissionsPosture();
  const service = { defaults, getPermissionsPosture: () => posture };
  switch (method) {
    case 'find':
      return deepIsolateValue({ args: resolveFindArgs(service, args), options: resolveFindOptions(service, options) });
    case 'findById':
      // Preserve the historical by-ID -> findOne fallback for undefined args/options.
      args = resolveFindByIdArgs(service, args);
      options = resolveFindByIdOptions(service, options);
    // falls through
    case 'findOne':
      return deepIsolateValue({
        args: resolveFindOneArgs(service, args),
        options: resolveFindOneOptions(service, options),
      });
    case 'updateById':
      args = resolveUpdateByIdArgs(service, args);
      options = resolveUpdateByIdOptions(service, options);
    // falls through
    case 'updateOne':
      return deepIsolateValue({
        args: resolveUpdateOneArgs(service, args),
        options: resolveUpdateOneOptions(service, options),
      });
    case 'create':
      return deepIsolateValue({
        args: resolveCreateArgs(service, args),
        options: resolveCreateOptions(service, options),
      });
  }
}
