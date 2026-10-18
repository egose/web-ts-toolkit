import type { AccessRuntime } from '../runtime';
import type { ModelRequest, ModelRouterOptions, Projection } from '../interfaces';
import type { AccessRouterPermissions } from '../permission';
import { get } from '@web-ts-toolkit/utils';
import { resolveNestedOption } from '../options/manager';
import { captureAuthorizationFieldCatalog } from './field-catalog';
import { authorizationError } from './authorization-snapshot';
import { normalizeOutputAuthorizationOptions } from './document-authorization';
import { planAuthorizedModelProjection } from './output-projection';
import type { AuthorizationConfiguration } from './service-authorization';

/** Same exact → default → bare resolver as live options, using only the owned snapshot. */
export function getCapturedAuthorizationOption(configuration: AuthorizationConfiguration, key: string): unknown {
  return resolveNestedOption((path, fallback) => get(configuration, path, fallback), key);
}

/** Capture at operation entry, before awaiting hooks. Also used by SVA-05's call resolver. */
export function captureModelAuthorizationConfiguration<T = unknown, V extends object = Record<never, never>>(
  runtime: AccessRuntime,
  modelName: string,
  options: ModelRouterOptions<T, V> = runtime.getModelOptions<T, V>(modelName),
): AuthorizationConfiguration {
  const model = runtime.getModelInstance(modelName);
  if (!model) return authorizationError(`unknown receiving model: ${modelName}`);
  const virtuals = options.virtuals as Record<string, unknown> | undefined;
  return {
    catalog: captureAuthorizationFieldCatalog(model.schema, virtuals, options.documentPermissionField),
    permissionSchema: options.permissionSchema,
    virtuals,
    alwaysSelectFields: options.alwaysSelectFields,
    modelPermissionPrefix: options.modelPermissionPrefix,
    requireExplicitSelect: options.requireExplicitSelect,
    documentPermissionField: options.documentPermissionField,
    docPermissions: options.docPermissions,
    exposedDocPermissionKeys: options.exposedDocPermissionKeys,
    stripPermissionsField: options.stripPermissionsField,
    disableFieldPermissions: options.disableFieldPermissions,
    overrideFilter: options.overrideFilter,
    baseFilter: options.baseFilter,
    idField: options.idField,
    resolveIdFilter: options.resolveIdFilter,
    operationAccess: options.operationAccess,
    hydration: options.hydration,
  };
}

/** Named public helper entry; canonical services instead retain planAuthorizedModelProjection's result. */
export function planModelOutputForHelper(args: {
  request: ModelRequest;
  runtime: AccessRuntime;
  modelName: string;
  access: string;
  permissions: AccessRouterPermissions;
  select?: Projection;
  options: unknown;
}) {
  const { request, runtime, modelName, access } = args;
  const model = runtime.getModelInstance(modelName);
  if (!model) return authorizationError(`unknown receiving model: ${modelName}`);
  const binding = { request, runtime, model, modelName };
  const configuration = captureModelAuthorizationConfiguration(runtime, modelName);
  const normalized = normalizeOutputAuthorizationOptions(
    {
      binding,
      configuration,
      requestPermissions: args.permissions,
      access: { operation: access, virtualAccess: access, outputAccess: access, docPermissionsAccess: access },
    },
    args.options,
  );
  if (normalized.kind !== 'policy') return authorizationError('planning does not accept documentAuthorization');
  return planAuthorizedModelProjection({
    authorization: normalized.authorization,
    binding: { ...binding, scopePath: (args.options as { scopePath?: readonly string[] }).scopePath },
    requestedSelect: args.select,
  });
}
