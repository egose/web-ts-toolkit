import type { AccessRuntime } from '../runtime';
import type { ModelRequest, ModelRouterOptions, Projection } from '../interfaces';
import type { AccessRouterPermissions } from '../permission';
import { get } from '@web-ts-toolkit/utils';
import { resolveNestedOption } from '../options/manager';
import { captureAuthorizationFieldCatalog } from './field-catalog';
import { authorizationError, copyAuthorizationValue } from './authorization-snapshot';
import { captureVirtualPopulateSnapshot } from './virtual-populate-dependencies';
import { normalizeOutputAuthorizationOptions } from './document-authorization';
import { planAuthorizedModelProjection } from './output-projection';
import type { AuthorizationConfiguration } from './service-authorization';
import {
  capturePopulatePolicyDefaults,
  resolvePopulatePolicy,
  type PopulatePolicyDefaultsToken,
} from './populate-policy';

/** Exact → default → bare, with the exact runtime fallback for operation guards only. */
export function getCapturedAuthorizationOption(configuration: AuthorizationConfiguration, key: string): unknown {
  const defaultValue = key.startsWith('operationAccess.')
    ? get(configuration.operationAccessDefaults, key.slice('operationAccess.'.length))
    : undefined;
  return resolveNestedOption((path, fallback) => get(configuration, path, fallback), key, defaultValue);
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
  const model = runtime.getModelInstance(modelName);
  if (!model) return authorizationError(`unknown receiving model: ${modelName}`);
  const virtuals = options.virtuals as Record<string, unknown> | undefined;
  return copyAuthorizationValue(
    {
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
      unsafeSkipListDocumentSnapshotChecks: options.unsafeSkipListDocumentSnapshotChecks === true,
      unsafeSkipReadDocumentSnapshotChecks: options.unsafeSkipReadDocumentSnapshotChecks === true,
      unsafeSkipListOutputSnapshotChecks: options.unsafeSkipListOutputSnapshotChecks === true,
      unsafeSkipReadOutputSnapshotChecks: options.unsafeSkipReadOutputSnapshotChecks === true,
      unsafeSkipListNestedDocumentSnapshotChecks: options.unsafeSkipListNestedDocumentSnapshotChecks === true,
      unsafeSkipReadNestedDocumentSnapshotChecks: options.unsafeSkipReadNestedDocumentSnapshotChecks === true,
      unsafeSkipListInitialOutputSnapshotCopy: options.unsafeSkipListInitialOutputSnapshotCopy === true,
      unsafeSkipReadInitialOutputSnapshotCopy: options.unsafeSkipReadInitialOutputSnapshotCopy === true,
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
    },
    true,
  );
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
