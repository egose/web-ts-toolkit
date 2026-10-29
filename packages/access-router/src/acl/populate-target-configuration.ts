/** Shared synchronous populate admission. Never creates ACL configuration or performs target I/O. */
import { isPlainObject } from '@web-ts-toolkit/utils';
import type { DefaultModelRouterOptions, ModelRouterOptions } from '../interfaces';
import type { AccessRuntime } from '../runtime';
import { authorizationError } from './authorization-snapshot';
import { getModelReference } from '../meta';

/** Proposed options support eager self-reference and atomic default/model graph validation. */
export function capturePopulateTargetConfiguration(
  runtime: AccessRuntime,
  modelName: string,
  source: string,
  proposedOptions?: ModelRouterOptions,
  defaults: DefaultModelRouterOptions = runtime.getDefaultModelOptions(),
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
    options.permissionSchema === undefined ? defaults.permissionSchema : options.permissionSchema;
  if (!isPlainObject(permissionSchema))
    authorizationError(
      `${label} requires an effective object permissionSchema; configure the model or runtime model defaults ({} explicitly closes business fields)`,
    );
  return { model, options: { ...options, permissionSchema } as ModelRouterOptions };
}

/** Ordinary refs may name a source-connection model or explicitly hold a cross-connection Model. */
export function capturePopulateTargetBinding(runtime: AccessRuntime, sourceModelName: string, path: string) {
  const { ref, refPath } = getModelReference(sourceModelName, path, runtime);
  if (refPath !== undefined || (typeof ref === 'function' && !('modelName' in ref)))
    authorizationError(
      `Populate target for ${sourceModelName}.${path} requires a static string or Mongoose Model-valued source ref; dynamic refs/refPath cannot be bound before I/O`,
    );
  const modelName = typeof ref === 'string' ? ref : ref?.modelName;
  if (!modelName) return undefined;
  const target = capturePopulateTargetConfiguration(runtime, modelName, `${sourceModelName}.${path}`);
  const source = runtime.getModelInstance(sourceModelName);
  const actual = typeof ref === 'string' ? source?.db.models[ref] : ref;
  if (!actual)
    authorizationError(
      `Populate target "${modelName}" for ${sourceModelName}.${path} is missing on the source connection; configure the actual model bound to the source ref in this runtime`,
    );
  if (actual !== target.model)
    authorizationError(
      `Populate target "${modelName}" for ${sourceModelName}.${path} resolves to a different actual Mongoose model than this runtime configured; register and configure the actual source ref instance`,
    );
  return { ...target, modelName };
}
