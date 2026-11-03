import type { AccessRuntime } from '../runtime';
import type { ModelRequest, ModelRouterOptions, Projection } from '../interfaces';
import type { AccessRouterPermissions } from '../permission';
import { resolveNestedOption } from '../options/manager';
import { captureAuthorizationFieldCatalog } from './field-catalog';
import { authorizationError } from './authorization-snapshot';
import { assertAuthorizationModeOptions } from './authorization-modes';
import { captureAuthorizationConfiguration } from './captured-authorization-configuration';
import { captureVirtualPopulateSnapshot } from './virtual-populate-dependencies';
import { normalizeOutputAuthorizationOptions } from './output-helper-options';
import { planAuthorizedModelProjection } from './output-projection';
import type { AuthorizationConfiguration } from './service-authorization';
import {
  capturePopulatePolicyDefaults,
  resolvePopulatePolicy,
  type PopulatePolicyDefaultsToken,
} from './populate-policy';

/** Exact own-data lookup. Captured functions are callable leaves, never option containers. */
export function readCapturedAuthorizationOption(
  root: unknown,
  path: string | readonly string[],
  fallback?: unknown,
): unknown {
  let value = root;
  for (const part of typeof path === 'string' ? path.split('.') : path) {
    if (value === null || typeof value !== 'object') return fallback;
    const slot = Object.getOwnPropertyDescriptor(value, part);
    if (!slot || !('value' in slot)) return fallback;
    value = slot.value;
  }
  return value === undefined ? fallback : value;
}

/** Exact → default → bare, with the exact runtime fallback for operation guards only. */
export function getCapturedAuthorizationOption(configuration: AuthorizationConfiguration, key: string): unknown {
  const defaultValue = key.startsWith('operationAccess.')
    ? readCapturedAuthorizationOption(configuration.operationAccessDefaults, key.slice('operationAccess.'.length))
    : undefined;
  return resolveNestedOption(
    (path, fallback) => readCapturedAuthorizationOption(configuration, path, fallback),
    key,
    defaultValue,
  );
}

/**
 * Capture at operation entry, before awaiting hooks. Also used by SVA-05's call resolver.
 * Frozen option containers can still hold live native leaves, and model schemas
 * mutate independently of option setters. Neither identity is a cross-call cache key.
 */
export function captureModelAuthorizationConfiguration<T = unknown, V extends object = Record<never, never>>(
  runtime: AccessRuntime,
  modelName: string,
  options?: ModelRouterOptions<T, V>,
  populatePolicyDefaults: PopulatePolicyDefaultsToken = capturePopulatePolicyDefaults(runtime),
): AuthorizationConfiguration {
  options ??= runtime.getModelOptions<T, V>(modelName);
  assertAuthorizationModeOptions(options, true);
  // Primitive mode capture precedes catalog/native configuration callbacks.
  const readAuthorizationMode = options.readAuthorizationMode ?? 'isolated';
  const listAuthorizationMode = options.listAuthorizationMode ?? 'isolated';
  const model = runtime.getModelInstance(modelName);
  if (!model) return authorizationError(`unknown receiving model: ${modelName}`);
  const virtuals = options.virtuals as Record<string, unknown> | undefined;
  return captureAuthorizationConfiguration({
    catalog: captureAuthorizationFieldCatalog(model.schema, virtuals, options.documentPermissionField),
    virtualPopulateSnapshot: captureVirtualPopulateSnapshot(
      runtime,
      modelName,
      options as ModelRouterOptions,
      populatePolicyDefaults,
    ),
    populatePolicyDefaults,
    ...resolvePopulatePolicy(options as ModelRouterOptions, populatePolicyDefaults),
    permissionSchema:
      options.permissionSchema === undefined
        ? runtime.getDefaultModelOption('permissionSchema')
        : options.permissionSchema,
    virtuals,
    alwaysSelectFields: options.alwaysSelectFields,
    modelPermissionPrefix: options.modelPermissionPrefix,
    requireExplicitSelect: options.requireExplicitSelect,
    documentPermissionField: options.documentPermissionField,
    docPermissions: options.docPermissions,
    exposedDocPermissionKeys: options.exposedDocPermissionKeys,
    stripPermissionsField: options.stripPermissionsField,
    disableFieldPermissions: options.disableFieldPermissions,
    readAuthorizationMode,
    listAuthorizationMode,
    overrideFilter: options.overrideFilter,
    baseFilter: options.baseFilter,
    idField: options.idField,
    resolveIdFilter: options.resolveIdFilter,
    operationAccess: options.operationAccess,
    // A defined stored parent (including {}) wins over exact runtime defaults.
    // Keep only operation fallback data; resolve each access without a live lookup.
    operationAccessDefaults:
      options.operationAccess === undefined ? runtime.getDefaultModelOption('operationAccess') : undefined,
    hydration: options.hydration,
    defaults: options.defaults,
  });
}

/** A raw output helper cannot query, run hooks/virtuals or admit related rows.
 * Capture its complete output policy afresh, without reading unrelated native
 * query/default/private-populate configuration. This is not a cross-call cache. */
export function captureOutputHelperConfiguration(
  runtime: AccessRuntime,
  modelName: string,
): AuthorizationConfiguration {
  const model = runtime.getModelInstance(modelName);
  if (!model) return authorizationError(`unknown receiving model: ${modelName}`);
  const documentPermissionField = runtime.getExactModelOption(modelName, 'documentPermissionField') as
    | string
    | undefined;
  const modelPermissionPrefix = runtime.getExactModelOption(modelName, 'modelPermissionPrefix');
  const exposedDocPermissionKeys = runtime.getExactModelOption(modelName, 'exposedDocPermissionKeys');
  const stripPermissionsField = runtime.getExactModelOption(modelName, 'stripPermissionsField');
  const disableFieldPermissions = runtime.getExactModelOption(modelName, 'disableFieldPermissions');
  const permissionSchema = runtime.getExactModelOption(modelName, 'permissionSchema');
  const virtuals = runtime.getExactModelOption(modelName, 'virtuals') as Record<string, unknown> | undefined;
  return captureAuthorizationConfiguration({
    catalog: captureAuthorizationFieldCatalog(model.schema, virtuals, documentPermissionField),
    permissionSchema,
    virtuals,
    modelPermissionPrefix,
    documentPermissionField,
    exposedDocPermissionKeys,
    stripPermissionsField,
    disableFieldPermissions,
  });
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
  return planAuthorizedModelProjection({
    authorization: normalized.authorization,
    binding: { ...binding, scopePath: (args.options as { scopePath?: readonly string[] }).scopePath },
    requestedSelect: args.select,
  });
}
