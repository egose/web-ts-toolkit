/** Shared synchronous populate admission. Never creates ACL configuration or performs target I/O. */
import { isPlainObject } from '@web-ts-toolkit/utils';
import type { ModelRouterOptions } from '../interfaces';
import type { AccessRuntime } from '../runtime';
import { authorizationError } from './authorization-snapshot';

/** Proposed options are used only for eagerly validated self-reference declarations. */
export function capturePopulateTargetConfiguration(
  runtime: AccessRuntime,
  modelName: string,
  source: string,
  proposedOptions?: ModelRouterOptions,
) {
  const label = `Populate target "${modelName}" for ${source}`;
  if (!proposedOptions && !runtime.hasModel(modelName))
    authorizationError(
      `${label} must be configured first in this runtime; register its Mongoose model and setModelOptions with an object permissionSchema`,
    );
  const model = runtime.getModelInstance(modelName);
  if (!model) authorizationError(`${label} requires an actual registered Mongoose model in this runtime`);
  const options = proposedOptions ?? runtime.getModelOptions(modelName);
  const permissionSchema =
    options.permissionSchema === undefined
      ? runtime.getDefaultModelOption('permissionSchema')
      : options.permissionSchema;
  if (!isPlainObject(permissionSchema))
    authorizationError(
      `${label} requires an effective object permissionSchema; configure the model or runtime model defaults ({} explicitly closes business fields)`,
    );
  return { model, options: { ...options, permissionSchema } as ModelRouterOptions };
}
