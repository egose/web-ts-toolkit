import mongoose from 'mongoose';
import { assertPublicDefaults } from './validation/public-admission';
import { normalizeHydration, normalizeHydrationUpdate } from './options/hydration';
import {
  assertNoGlobalPopulatePolicy,
  isPopulatePolicyKey,
  normalizePopulatePolicyOptions,
  normalizePopulatePolicyValue,
  populatePolicyKeys,
} from './options/populate-policy';
import mschema2Jsonschema from 'mongoose-schema-jsonschema';
import {
  addLeadingSlash,
  forEach,
  get,
  isArray,
  isBoolean,
  isFunction,
  isNil,
  isPlainObject,
  isString,
  keys,
  normalizeUrlPath,
  set,
} from '@web-ts-toolkit/utils';
import { DEFAULT_LIST_HARD_LIMIT, buildRefs, buildSubPaths } from './helpers';
import type { OpenApiDocumentOptions, OpenApiRouteDescriptor } from './openapi/types';
import { OpenApiRegistry } from './openapi/registry';
import type {
  DataRouterOptions,
  DefaultModelRouterOptions,
  ExtendedDataRouterOptions,
  ExtendedDefaultModelRouterOptions,
  ExtendedModelRouterOptions,
  GlobalOptions,
  ModelRouterOptions,
} from './interfaces';
import { defaultLogger } from './logger-default';
import { OptionsManager, cloneOptionsSnapshot, getNestedOption } from './options/manager';
import { DataOptionsManager } from './options/data-manager';
import { emptyDataSnapshot } from './options/data-values';
import { defaultRequestComplexity } from './request-complexity';
import {
  getScopeVirtualsObject,
  resolveSnapshotDescriptor,
  type ResolvedVirtualDescriptor,
} from './acl/virtual-descriptor';
import { captureVirtualPopulateDependencies } from './acl/virtual-populate-dependencies';
import {
  authorizationFastPathPrerequisites,
  captureAuthorizationFastPath,
  unsafeServerOptions,
} from './acl/unsafe-snapshot-options';

type ModelReferenceMap = {
  [key: string]: string | ModelReferenceMap;
};

type ExtendedModel = mongoose.Model<unknown> & { jsonSchema: () => Record<string, unknown> };

/**
 * Idempotently patches the global mongoose prototype with `jsonSchema()` so consumers
 * that never construct an AccessRuntime are not forced to take this side effect, and
 * consumers that construct more than one runtime only patch mongoose once.
 */
let mongooseJsonSchemaInitialized = false;
const ensureMongooseJsonSchemaInitialized = () => {
  if (mongooseJsonSchemaInitialized) return;
  mschema2Jsonschema(mongoose);
  mongooseJsonSchemaInitialized = true;
};

const pluralize = mongoose.pluralize();
type PermissionKeyMap = Record<string, string[]>;
const FIELD_ACCESS_KEYS = ['list', 'create', 'read', 'update'] as const;

const defaultModelOptions: ModelRouterOptions = {
  basePath: null,
  alwaysSelectFields: [],
};

/** Keep inherited values out of overrides; retain explicit clears for guards and populate flags. */
const modelOverrides = (options: ModelRouterOptions): ModelRouterOptions => {
  const result = Object.fromEntries(
    Object.entries(options).filter(
      ([key, value]) => value !== undefined || key === 'operationAccess' || isPopulatePolicyKey(key),
    ),
  );
  for (const key of unsafeServerOptions) if (key in result) result[key] = result[key] === true;
  return cloneOptionsSnapshot(result) as ModelRouterOptions;
};

const defaultDataOptions: DataRouterOptions = {
  basePath: null,
  parentPath: '/',
  queryRouteSegment: '__query',
  listHardLimit: DEFAULT_LIST_HARD_LIMIT,
};

const normalizeBasePath = (name: string, value: string | null | undefined) => {
  if (isNil(value)) {
    return `/${pluralize(name)}`;
  }

  return isString(value) ? addLeadingSlash(value) : '';
};

const hasModelPermission = (value: unknown, modelPermissionPrefix: string): boolean => {
  if (!modelPermissionPrefix) {
    return true;
  }

  if (isString(value)) {
    return value
      .trim()
      .split(' ')
      .some((item) => item.startsWith(modelPermissionPrefix));
  }

  if (isArray(value)) {
    return value.some((item) => {
      if (isString(item) || isArray(item)) {
        return hasModelPermission(item, modelPermissionPrefix);
      }

      return true;
    });
  }

  return isFunction(value);
};

const classifyPermissionSchema = (
  permissionSchema: NonNullable<ModelRouterOptions['permissionSchema']>,
  modelPermissionPrefix: string,
) => {
  const schemaKeys = Object.keys(permissionSchema);
  const globalPermissionKeys: PermissionKeyMap = {};
  const modelPermissionKeys: PermissionKeyMap = {};

  forEach(schemaKeys, (schemaKey) => {
    const schemaRule = permissionSchema[schemaKey];
    const ruleEntries = isPlainObject(schemaRule)
      ? Object.entries(schemaRule)
      : FIELD_ACCESS_KEYS.map((accessKey) => [accessKey, schemaRule] as const);

    for (let x = 0; x < ruleEntries.length; x++) {
      const [accessKey, value] = ruleEntries[x];

      if (!isArray(globalPermissionKeys[accessKey])) {
        globalPermissionKeys[accessKey] = [];
      }

      if (!isArray(modelPermissionKeys[accessKey])) {
        modelPermissionKeys[accessKey] = [];
      }

      if (isBoolean(value)) {
        globalPermissionKeys[accessKey].push(schemaKey);
        continue;
      }

      if (hasModelPermission(value, modelPermissionPrefix)) {
        modelPermissionKeys[accessKey].push(schemaKey);
        continue;
      }

      globalPermissionKeys[accessKey].push(schemaKey);
    }
  });

  return {
    schemaKeys,
    globalPermissionKeys,
    modelPermissionKeys,
  };
};

const refreshPermissionMetadata = (target: ModelRouterOptions) => {
  const permissionSchema = (target.permissionSchema ?? {}) as NonNullable<ModelRouterOptions['permissionSchema']>;
  const { schemaKeys, globalPermissionKeys, modelPermissionKeys } = classifyPermissionSchema(
    permissionSchema,
    target.modelPermissionPrefix ?? '',
  );

  (target as Record<string, unknown>)._permissionSchemaKeys = schemaKeys;
  (target as Record<string, unknown>)._globalPermissionKeys = globalPermissionKeys;
  (target as Record<string, unknown>)._modelPermissionKeys = modelPermissionKeys;
};

// ---------------------------------------------------------------------------
// VIRT-01 virtual configuration validation + exact → .default → bare
// resolution (VIRT-00A D1-D8, frozen). No planner/finalizer here; this module
// owns option plumbing, validation-before-commit, and coherent snapshots.
// ---------------------------------------------------------------------------

const VIRTUAL_SUPPORTED_ACCESSES = ['default', 'list', 'create', 'read', 'update'] as const;
type VirtualSupportedAccess = (typeof VIRTUAL_SUPPORTED_ACCESSES)[number];
const VIRTUAL_UNSUPPORTED_ACCESSES = ['delete', 'distinct', 'count'] as const;
const VIRTUAL_RESERVED_NAMES = new Set(['_id', '__v', 'id']);
const VIRTUAL_DANGEROUS_SEGMENTS = new Set(['__proto__', 'prototype', 'constructor']);
const VIRTUAL_NAME_PATTERN = /^[A-Za-z_][A-Za-z0-9_$]*$/;

const isVirtualContainerValue = (value: unknown): value is { sub: Record<string, unknown> } =>
  isPlainObject(value) && 'sub' in (value as Record<string, unknown>);

const virtualFullPath = (prefix: string, name: string): string => (prefix ? `${prefix}.${name}` : name);

const virtualPathsOverlap = (virtualPath: string, permissionField: string): boolean => {
  if (!virtualPath || !permissionField) return false;
  try {
    if (get(set({}, virtualPath, true), permissionField) !== undefined) return true;
    if (get(set({}, permissionField, true), virtualPath) !== undefined) return true;
  } catch {
    return false;
  }
  return false;
};

const collectStoredTopLevel = (schema: mongoose.Schema | null | undefined): Set<string> => {
  const fields = new Set<string>();
  if (!schema) return fields;
  const paths = (schema as unknown as { paths?: Record<string, unknown> }).paths;
  if (paths) {
    for (const p of Object.keys(paths)) {
      const top = p.split('.')[0];
      if (top) fields.add(top);
    }
  }
  const obj = (schema as unknown as { obj?: Record<string, unknown> }).obj;
  if (obj) {
    for (const k of Object.keys(obj)) fields.add(k);
  }
  return fields;
};

const getChildSchemaForField = (
  parentSchema: mongoose.Schema | null | undefined,
  fieldName: string,
): mongoose.Schema | null => {
  if (!parentSchema) return null;
  try {
    const pathType = (parentSchema as unknown as { path?: (p: string) => unknown }).path?.(fieldName) as
      | { schema?: mongoose.Schema; caster?: { schema?: mongoose.Schema } }
      | null
      | undefined;
    if (pathType && typeof pathType === 'object') {
      if (pathType.schema) return pathType.schema;
      if (pathType.caster?.schema) return pathType.caster.schema;
    }
  } catch {
    return null;
  }
  return null;
};

const getNestedChildFields = (parentSchema: mongoose.Schema | null | undefined, fieldName: string): Set<string> => {
  const fields = new Set<string>();
  if (!parentSchema) return fields;
  const paths = (parentSchema as unknown as { paths?: Record<string, unknown> }).paths;
  if (paths) {
    const prefix = `${fieldName}.`;
    for (const p of Object.keys(paths)) {
      if (p.startsWith(prefix)) {
        const rest = p.slice(prefix.length);
        const top = rest.split('.')[0];
        if (top) fields.add(top);
      }
    }
  }
  return fields;
};

const cloneModelOptionForUpdate = <T>(value: T): T => {
  if (Array.isArray(value)) return value.map((item) => cloneModelOptionForUpdate(item)) as T;
  if (!value || typeof value !== 'object') return value;
  if (Object.getPrototypeOf(value) !== Object.prototype) return value;
  return Object.fromEntries(
    Object.entries(value as Record<string, unknown>).map(([k, v]) => [k, cloneModelOptionForUpdate(v)]),
  ) as T;
};

type VirtualScopeValidation = {
  scopeVirtuals: Record<string, unknown>;
  storedFields: Set<string>;
  scopePrefix: string;
  scopeLabel: string;
};

const validateVirtualDependsOn = (
  dependsOn: unknown,
  entryLabel: string,
  storedFields: Set<string>,
  siblingVirtualNames: Set<string>,
): string[] => {
  if (dependsOn === undefined) return [];
  if (!isArray(dependsOn)) {
    throw new Error(`Virtual ${entryLabel}: dependsOn must be an array of top-level persisted field names`);
  }
  const list = dependsOn as unknown[];
  for (const dep of list) {
    if (!isString(dep) || dep.length === 0) {
      throw new Error(`Virtual ${entryLabel}: dependsOn entries must be non-empty strings`);
    }
    if (dep.includes('.')) {
      throw new Error(
        `Virtual ${entryLabel}: dependsOn "${dep}" must be a top-level persisted name relative to its scope (dotted paths rejected)`,
      );
    }
    if (siblingVirtualNames.has(dep)) {
      throw new Error(
        `Virtual ${entryLabel}: dependsOn "${dep}" must not reference another virtual (virtual-to-virtual rejected)`,
      );
    }
    if (!storedFields.has(dep)) {
      throw new Error(
        `Virtual ${entryLabel}: dependsOn "${dep}" is not a persisted field in its scope (validated against the receiving Mongoose schema/child scope)`,
      );
    }
  }
  return list as string[];
};

const validateVirtualLeafValue = (
  value: unknown,
  entryLabel: string,
  storedFields: Set<string>,
  siblingVirtualNames: Set<string>,
  sharedDependsOn: unknown,
): void => {
  if (isFunction(value)) return;
  if (!isPlainObject(value)) {
    throw new Error(`Virtual ${entryLabel}: descriptor must be a getter function or { get, dependsOn }`);
  }
  const record = value as Record<string, unknown>;
  if (!isFunction(record.get)) {
    throw new Error(`Virtual ${entryLabel}: descriptor.get must be a callable getter function`);
  }
  validateVirtualDependsOn(record.dependsOn ?? sharedDependsOn, entryLabel, storedFields, siblingVirtualNames);
  for (const k of Object.keys(record)) {
    if (k !== 'get' && k !== 'dependsOn' && k !== 'dependsOnPopulate') {
      throw new Error(
        `Virtual ${entryLabel}: unsupported descriptor key "${k}" (expected get/dependsOn/dependsOnPopulate)`,
      );
    }
  }
};

const validateVirtualsScope = (scope: VirtualScopeValidation, documentPermissionField: string): void => {
  const { scopeVirtuals, storedFields, scopePrefix, scopeLabel } = scope;
  const leafNames = new Set<string>();
  for (const [name, raw] of Object.entries(scopeVirtuals)) {
    if (raw === undefined) continue;
    if (isVirtualContainerValue(raw)) continue;
    leafNames.add(name);
  }

  for (const [name, raw] of Object.entries(scopeVirtuals)) {
    if (raw === undefined) continue;
    if (name.includes('.')) {
      throw new Error(`Virtual ${scopeLabel}${name}: dotted definition names are rejected (use sub scopes)`);
    }
    if (
      VIRTUAL_DANGEROUS_SEGMENTS.has(name) ||
      VIRTUAL_RESERVED_NAMES.has(name) ||
      name.startsWith('$') ||
      !VIRTUAL_NAME_PATTERN.test(name)
    ) {
      throw new Error(`Virtual ${scopeLabel}${name}: "_id"/reserved internal paths are rejected`);
    }
    const fullPath = virtualFullPath(scopePrefix, name);
    if (virtualPathsOverlap(fullPath, documentPermissionField)) {
      throw new Error(
        `Virtual ${scopeLabel}${name}: overlaps document permission field "${documentPermissionField}" (equal/ancestor/descendant rejected)`,
      );
    }

    if (isVirtualContainerValue(raw)) {
      const record = raw as Record<string, unknown>;
      const extra = Object.keys(record).filter((k) => k !== 'sub');
      if (extra.length > 0) {
        throw new Error(
          `Virtual ${scopeLabel}${name}: scope-container must only hold "sub" (embedded container "${name}" is not a virtual-leaf collision)`,
        );
      }
      if (!isPlainObject(record.sub)) {
        throw new Error(`Virtual ${scopeLabel}${name}: scope-container "sub" must be a plain object`);
      }
      continue;
    }

    if (storedFields.has(name)) {
      throw new Error(
        `Virtual ${scopeLabel}${name}: collides with a stored path (inspected actual Mongoose schema/child scope; getModelAtt alone is insufficient)`,
      );
    }

    if (isFunction(raw)) continue;

    if (!isPlainObject(raw)) {
      throw new Error(
        `Virtual ${scopeLabel}${name}: malformed descriptor (expected getter, { get, dependsOn }, or per-access record)`,
      );
    }
    const record = raw as Record<string, unknown>;
    const hasGet = 'get' in record;
    const accessKeys = Object.keys(record).filter((k) => (VIRTUAL_SUPPORTED_ACCESSES as readonly string[]).includes(k));
    const unsupported = Object.keys(record).filter(
      (k) =>
        k !== 'get' &&
        k !== 'dependsOn' &&
        k !== 'dependsOnPopulate' &&
        k !== 'sub' &&
        !(VIRTUAL_SUPPORTED_ACCESSES as readonly string[]).includes(k),
    );
    for (const key of Object.keys(record)) {
      if ((VIRTUAL_UNSUPPORTED_ACCESSES as readonly string[]).includes(key)) {
        throw new Error(
          `Virtual ${scopeLabel}${name}: unsupported access "${key}" (supported: default + list/create/read/update; NOT delete/distinct/count)`,
        );
      }
    }
    if (unsupported.length > 0) {
      throw new Error(
        `Virtual ${scopeLabel}${name}: unsupported access/key "${unsupported[0]}" (supported: default + list/create/read/update)`,
      );
    }

    if (hasGet) {
      if (accessKeys.length > 0) {
        throw new Error(
          `Virtual ${scopeLabel}${name}: cannot mix "get" with per-access keys (use either bare { get, dependsOn } or a per-access record)`,
        );
      }
      if ('sub' in record) {
        throw new Error(`Virtual ${scopeLabel}${name}: cannot mix "get" with "sub" (leaf vs embedded container)`);
      }
      validateVirtualLeafValue(raw, `${scopeLabel}${name}`, storedFields, leafNames, undefined);
      continue;
    }

    if (accessKeys.length > 0) {
      if ('sub' in record) {
        throw new Error(`Virtual ${scopeLabel}${name}: cannot mix per-access keys with "sub"`);
      }
      validateVirtualDependsOn(record.dependsOn, `${scopeLabel}${name}`, storedFields, leafNames);
      for (const access of accessKeys) {
        const leaf = (record as Record<string, unknown>)[access];
        if (leaf === undefined) continue;
        validateVirtualLeafValue(leaf, `${scopeLabel}${name}.${access}`, storedFields, leafNames, record.dependsOn);
      }
      continue;
    }

    throw new Error(
      `Virtual ${scopeLabel}${name}: malformed descriptor (expected getter, { get, dependsOn }, or per-access record with default/list/create/read/update)`,
    );
  }
};

const validateVirtualsTree = (
  model: mongoose.Model<unknown> | null,
  virtuals: unknown,
  documentPermissionField: string,
  modelName: string,
): void => {
  if (virtuals === undefined || virtuals === null) return;
  if (!isPlainObject(virtuals)) {
    throw new Error(`Virtuals for model "${modelName}": virtuals must be a plain object mapping names to descriptors`);
  }
  const rootSchema = (model?.schema ?? null) as mongoose.Schema | null;
  const rootStored = collectStoredTopLevel(rootSchema);
  const rootVirtuals = virtuals as Record<string, unknown>;
  validateVirtualsScope(
    { scopeVirtuals: rootVirtuals, storedFields: rootStored, scopePrefix: '', scopeLabel: '' },
    documentPermissionField,
  );

  const visitContainers = (
    currentVirtuals: Record<string, unknown>,
    currentSchema: mongoose.Schema | null,
    currentPrefix: string,
    schemaPrefix = '',
  ): void => {
    for (const [containerName, raw] of Object.entries(currentVirtuals)) {
      if (raw === undefined || !isVirtualContainerValue(raw)) continue;
      const record = raw as { sub: Record<string, unknown> };
      const schemaPath = virtualFullPath(schemaPrefix, containerName);
      const childSchema = getChildSchemaForField(currentSchema, schemaPath);
      const nestedFields = getNestedChildFields(currentSchema, schemaPath);
      const currentStored = schemaPrefix
        ? getNestedChildFields(currentSchema, schemaPrefix)
        : collectStoredTopLevel(currentSchema);
      if (!currentStored.has(containerName)) {
        throw new Error(
          `Virtual ${containerName}: scope-container "${containerName}" is not a persisted field in its scope`,
        );
      }
      const isEmbedded = childSchema !== null || nestedFields.size > 0;
      if (!isEmbedded) {
        throw new Error(
          `Virtual ${containerName}: scope-container "${containerName}" must be an embedded field with a child scope`,
        );
      }
      const subStored = childSchema ? collectStoredTopLevel(childSchema) : nestedFields;
      const subPrefix = currentPrefix ? `${currentPrefix}.${containerName}` : containerName;
      const subVirtuals = (record.sub ?? {}) as Record<string, unknown>;
      validateVirtualsScope(
        {
          scopeVirtuals: subVirtuals,
          storedFields: subStored,
          scopePrefix: subPrefix,
          scopeLabel: `${subPrefix}.sub.`,
        },
        documentPermissionField,
      );
      visitContainers(subVirtuals, childSchema ?? currentSchema, subPrefix, childSchema ? '' : schemaPath);
    }
  };
  visitContainers(rootVirtuals, rootSchema, '');
};

/**
 * Owner of global/model/data options, registered Mongoose models and OpenAPI routes.
 * Prefer createAccessRuntime() for a callable API with factories and bound setters;
 * its `.runtime` exposes this owner. A bare instance has no createRouter method.
 * Registries/configuration are isolated; the Mongoose jsonSchema extension is initialized
 * idempotently. The defaultRuntime additionally adopts process-global named models.
 */
export class AccessRuntime {
  private readonly allowGlobalModelLookup: boolean;

  constructor(options: { allowGlobalModelLookup?: boolean } = {}) {
    this.allowGlobalModelLookup = options.allowGlobalModelLookup ?? false;
    ensureMongooseJsonSchemaInitialized();
  }

  private readonly globalOptions = new OptionsManager<GlobalOptions, GlobalOptions>(
    {
      requestPermissionField: '_permissions',
      globalPermissions: () => ({}),
      logger: defaultLogger,
      requestComplexity: defaultRequestComplexity,
    },
    { preserveKeys: ['logger'] },
  ).build();

  private readonly defaultModelOptions = new OptionsManager<
    DefaultModelRouterOptions,
    ExtendedDefaultModelRouterOptions
  >({
    listHardLimit: DEFAULT_LIST_HARD_LIMIT,
    documentPermissionField: '_permissions',
    idParam: 'id',
    idField: '_id',
    parentPath: '/',
    queryRouteSegment: '__query',
    mutationRouteSegment: '__mutation',
    operationAccess: false,
    requireOperationAccessForPopulateQueries: true,
    requireOperationAccessForPopulateDependencies: true,
    modelPermissionPrefix: '',
    unsafeSkipListDocumentSnapshotChecks: false,
    unsafeSkipReadDocumentSnapshotChecks: false,
    unsafeSkipListOutputSnapshotChecks: false,
    unsafeSkipReadOutputSnapshotChecks: false,
    unsafeSkipListNestedDocumentSnapshotChecks: false,
    unsafeSkipReadNestedDocumentSnapshotChecks: false,
    unsafeSkipListInitialOutputSnapshotCopy: false,
    unsafeSkipReadInitialOutputSnapshotCopy: false,
    unsafeUseListAuthorizationFastPath: false,
    unsafeUseReadAuthorizationFastPath: false,
  }).build();

  private readonly modelOptions: Record<string, OptionsManager<any, any>> = {};
  private readonly modelOptionOverrides: Record<string, ModelRouterOptions> = {};
  private pendingSnapshotWarnings?: Array<{ modelName: string; key: string }>;
  private readonly modelJsonSchemas: Record<string, Record<string, unknown>> = {};
  private readonly dataOptions: Record<string, OptionsManager<DataRouterOptions, ExtendedDataRouterOptions>> = {};
  private readonly modelRefs: Record<string, ModelReferenceMap> = {};
  private readonly modelSubs: Record<string, string[]> = {};
  private readonly modelAtts: Record<string, string[]> = {};
  private readonly modelInstances: Record<string, mongoose.Model<unknown>> = {};
  private readonly openApiRegistry = new OpenApiRegistry();
  private openApiPathPrefix = '';

  registerModelInstance<TModel>(modelName: string, model: mongoose.Model<TModel>): void {
    if (!modelName || typeof modelName !== 'string') {
      throw new TypeError(`registerModelInstance: modelName must be a non-empty string, received ${typeof modelName}`);
    }
    const existing = this.modelInstances[modelName];
    if (existing && existing !== (model as unknown as mongoose.Model<unknown>)) {
      throw new Error(
        `Runtime model registry conflict: model "${modelName}" is already registered to a different mongoose.Model instance on this runtime. Use a distinct model name or a separate runtime.`,
      );
    }
    this.modelInstances[modelName] = model as unknown as mongoose.Model<unknown>;
  }

  hasModelInstance(modelName: string): boolean {
    return modelName in this.modelInstances || (this.allowGlobalModelLookup && modelName in mongoose.models);
  }

  getModelInstance<TModel = unknown>(modelName: string): mongoose.Model<TModel> | null {
    const registered = this.modelInstances[modelName];
    if (registered) return registered as unknown as mongoose.Model<TModel>;

    if (!this.allowGlobalModelLookup) return null;

    const global = mongoose.models[modelName] as unknown as mongoose.Model<TModel> | undefined;
    if (!global) return null;

    this.registerModelInstance(modelName, global);
    return global;
  }

  registerOpenApiRoute(route: OpenApiRouteDescriptor) {
    this.openApiRegistry.register(
      this.openApiPathPrefix ? { ...route, path: normalizeUrlPath(`${this.openApiPathPrefix}/${route.path}`) } : route,
    );
  }

  /**
   * Compose OpenAPI paths while synchronously constructing mounted routers.
   * Prefixes apply before collision checks; prior descriptors and Express paths
   * are unchanged. Nested calls compose and the prior scope is restored even on
   * failure. The callback must finish registration synchronously (no async work).
   */
  withOpenApiPathPrefix<T>(prefix: string, build: () => T): T {
    const previous = this.openApiPathPrefix;
    this.openApiPathPrefix = normalizeUrlPath(`${previous}/${prefix}`);
    try {
      return build();
    } finally {
      this.openApiPathPrefix = previous;
    }
  }

  /**
   * Enable strict OpenAPI collision detection for the remainder of this
   * runtime's lifetime. After this call, conflicting method/path
   * registrations and duplicate operationIds throw {@link OpenApiCollisionError}
   * instead of silently replacing. Existing already-registered routes are
   * not retroactively re-validated.
   */
  enableOpenApiCollisionDetection() {
    this.openApiRegistry.setStrictMode(true);
  }

  getOpenApiRoutes() {
    return this.openApiRegistry.getRoutes();
  }

  clearOpenApiRoutes() {
    this.openApiRegistry.clear();
  }

  getOpenApiSpec(info: OpenApiDocumentOptions) {
    return this.openApiRegistry.getSpec(info);
  }

  createBootstrapSnapshot(): {
    globalOptions: GlobalOptions;
    defaultModelOptions: DefaultModelRouterOptions;
    modelOptions: Record<string, ModelRouterOptions>;
    modelOptionOverrides: Record<string, ModelRouterOptions>;
    dataOptions: Record<string, DataRouterOptions>;
    modelInstances: Record<string, mongoose.Model<unknown>>;
    modelJsonSchemas: Record<string, Record<string, unknown>>;
    modelRefs: Record<string, ModelReferenceMap>;
    modelSubs: Record<string, string[]>;
    modelAtts: Record<string, string[]>;
    openApi: { routes: OpenApiRouteDescriptor[]; options: Required<import('./openapi/types').OpenApiRegistryOptions> };
  } {
    const modelOptionsSnap: Record<string, ModelRouterOptions> = {};
    for (const [name, mgr] of Object.entries(this.modelOptions)) {
      modelOptionsSnap[name] = mgr.snapshot() as ModelRouterOptions;
    }
    const dataOptionsSnap: Record<string, DataRouterOptions> = {};
    for (const [name, mgr] of Object.entries(this.dataOptions)) {
      dataOptionsSnap[name] = mgr.snapshot() as DataRouterOptions;
    }
    return {
      globalOptions: this.globalOptions.snapshot() as GlobalOptions,
      defaultModelOptions: this.defaultModelOptions.snapshot() as DefaultModelRouterOptions,
      modelOptions: modelOptionsSnap,
      modelOptionOverrides: { ...this.modelOptionOverrides },
      dataOptions: dataOptionsSnap,
      modelInstances: { ...this.modelInstances },
      modelJsonSchemas: { ...this.modelJsonSchemas },
      modelRefs: Object.fromEntries(
        Object.entries(this.modelRefs).map(([k, v]) => [k, JSON.parse(JSON.stringify(v))]),
      ) as Record<string, ModelReferenceMap>,
      modelSubs: Object.fromEntries(Object.entries(this.modelSubs).map(([k, v]) => [k, [...v]])) as Record<
        string,
        string[]
      >,
      modelAtts: Object.fromEntries(Object.entries(this.modelAtts).map(([k, v]) => [k, [...v]])) as Record<
        string,
        string[]
      >,
      openApi: this.openApiRegistry.snapshot(),
    };
  }

  restoreBootstrapSnapshot(snapshot: ReturnType<AccessRuntime['createBootstrapSnapshot']>): void {
    this.globalOptions.restore(snapshot.globalOptions as any);
    this.defaultModelOptions.restore(snapshot.defaultModelOptions as any);
    for (const name of Object.keys(this.modelOptionOverrides)) delete this.modelOptionOverrides[name];
    for (const [name, options] of Object.entries(snapshot.modelOptionOverrides)) {
      this.modelOptionOverrides[name] = modelOverrides(options);
    }

    // Restore or delete model managers to match snapshot keys exactly.
    for (const name of Object.keys(this.modelOptions)) {
      if (!(name in snapshot.modelOptions)) {
        delete this.modelOptions[name];
      }
    }
    for (const [name, opts] of Object.entries(snapshot.modelOptions)) {
      const existing = this.modelOptions[name];
      if (existing) {
        existing.restore(opts as any);
      } else {
        // Recreate manager for names that were removed (should not happen normally
        // because createModelOptions requires a registered model, but handles edge case).
        const mgr = this.createModelOptions(name, opts);
        this.modelOptions[name] = mgr;
      }
    }
    // Ensure any new managers created during failed attempt that are not in snapshot are removed (already handled above).
    // For snapshot model names that had no manager before, the above recreation ensures exact match.

    for (const name of Object.keys(this.dataOptions)) {
      if (!(name in snapshot.dataOptions)) {
        delete this.dataOptions[name];
      }
    }
    for (const [name, opts] of Object.entries(snapshot.dataOptions)) {
      const existing = this.dataOptions[name];
      if (existing) {
        existing.restore(opts as any);
      } else {
        const mgr = this.createDataOptions(name);
        mgr.restore(opts as any);
        this.dataOptions[name] = mgr;
      }
    }

    // Replace instance/refs maps with snapshot shallow copies.
    for (const k of Object.keys(this.modelInstances)) {
      if (!(k in snapshot.modelInstances)) delete this.modelInstances[k];
    }
    Object.assign(this.modelInstances, snapshot.modelInstances);

    for (const k of Object.keys(this.modelJsonSchemas)) {
      if (!(k in snapshot.modelJsonSchemas)) delete this.modelJsonSchemas[k];
    }
    Object.assign(this.modelJsonSchemas, snapshot.modelJsonSchemas);

    for (const k of Object.keys(this.modelRefs)) {
      if (!(k in snapshot.modelRefs)) delete this.modelRefs[k];
    }
    Object.assign(this.modelRefs, snapshot.modelRefs);

    for (const k of Object.keys(this.modelSubs)) {
      if (!(k in snapshot.modelSubs)) delete this.modelSubs[k];
    }
    Object.assign(this.modelSubs, snapshot.modelSubs);

    for (const k of Object.keys(this.modelAtts)) {
      if (!(k in snapshot.modelAtts)) delete this.modelAtts[k];
    }
    Object.assign(this.modelAtts, snapshot.modelAtts);

    this.openApiRegistry.restore(snapshot.openApi);
  }

  /** Shallowly replace supplied global values; nested objects such as requestComplexity are not deep-merged. */
  setGlobalOptions(options: GlobalOptions) {
    for (const key of populatePolicyKeys) if (key in options) assertNoGlobalPopulatePolicy(key);
    this.globalOptions.assign({ ...options });
  }

  setGlobalOption<K extends keyof GlobalOptions>(key: K, value: GlobalOptions[K]) {
    assertNoGlobalPopulatePolicy(String(key));
    this.globalOptions.set(key, value);
  }

  getGlobalOptions() {
    return this.globalOptions.fetch();
  }

  getGlobalOption<K extends keyof GlobalOptions>(key: K, defaultValue?: GlobalOptions[K]) {
    return this.globalOptions.get(key, defaultValue);
  }

  /** Update inherited model defaults shallowly. Explicit model values and captured calls are unchanged. */
  setDefaultModelOptions(options: DefaultModelRouterOptions) {
    assertPublicDefaults((options as ModelRouterOptions).defaults);
    if ('hydration' in options) options = { ...options, hydration: normalizeHydration(options.hydration) };
    const draft = new OptionsManager<DefaultModelRouterOptions, ExtendedDefaultModelRouterOptions>(
      this.getDefaultModelOptions(),
    ).build();
    draft.assign(normalizePopulatePolicyOptions(options));
    this.publishDefaultModelOptions(draft.fetch());
  }

  setDefaultModelOption<K extends keyof ExtendedDefaultModelRouterOptions>(
    key: K,
    value: ExtendedDefaultModelRouterOptions[K],
  ) {
    const keyStr = String(key);
    // Inspect the supplied defaults value before OptionsManager's clone can drop
    // non-enumerable controls or execute a getter. Dotted setters have the same
    // admission boundary as setDefaultModelOptions/setModelOption.
    if (keyStr === 'defaults') assertPublicDefaults(value);
    else if (keyStr.startsWith('defaults.')) {
      const proposed = {};
      set(proposed, keyStr.slice('defaults.'.length), value);
      assertPublicDefaults(proposed);
    }
    const draft = new OptionsManager<DefaultModelRouterOptions, ExtendedDefaultModelRouterOptions>(
      this.getDefaultModelOptions(),
    ).build();
    if (isPopulatePolicyKey(keyStr)) {
      draft.set(keyStr, normalizePopulatePolicyValue(value));
    } else if (keyStr === 'hydration' || keyStr.startsWith('hydration.')) {
      draft.set('hydration', normalizeHydrationUpdate(this.getDefaultModelOptions().hydration, keyStr, value));
    } else {
      draft.set(key, value);
    }
    assertPublicDefaults((draft.fetch() as ModelRouterOptions).defaults);
    this.publishDefaultModelOptions(draft.fetch());
  }

  getDefaultModelOptions() {
    return this.defaultModelOptions.fetch();
  }

  getDefaultModelOption<K extends keyof ExtendedDefaultModelRouterOptions>(
    key: K,
    defaultValue?: ExtendedDefaultModelRouterOptions[K],
  ) {
    return this.defaultModelOptions.get(key, defaultValue);
  }

  private resolveModelOptions(
    modelName: string,
    overrides: ModelRouterOptions = this.modelOptionOverrides[modelName] ?? {},
    defaults: DefaultModelRouterOptions = this.getDefaultModelOptions(),
  ): ModelRouterOptions {
    // Populate policy uses the operation's captured default token, rather than
    // a default materialized into a model snapshot before its target is captured.
    const inherited = { ...defaults };
    for (const key of populatePolicyKeys) delete inherited[key];
    const effective = { ...defaultModelOptions, ...inherited, ...overrides, modelName };
    effective.basePath = normalizeBasePath(modelName, effective.basePath);
    for (const key of unsafeServerOptions) effective[key] = effective[key] === true;
    refreshPermissionMetadata(effective);
    return cloneOptionsSnapshot(effective);
  }

  private validateModelOptions(
    modelName: string,
    options: ModelRouterOptions,
    proposed?: Parameters<typeof captureVirtualPopulateDependencies>[4],
  ): void {
    validateVirtualsTree(
      this.getModelInstance(modelName),
      options.virtuals,
      options.documentPermissionField ?? '_permissions',
      modelName,
    );
    captureVirtualPopulateDependencies(this, modelName, options, undefined, proposed);
  }

  private publishDefaultModelOptions(options: DefaultModelRouterOptions): void {
    const next = { ...options };
    for (const key of unsafeServerOptions) if (key in next) next[key] = next[key] === true;
    const defaults = cloneOptionsSnapshot(next);
    const models = new Map(
      Object.keys(this.modelOptions).map((name) => [name, this.resolveModelOptions(name, undefined, defaults)]),
    );
    // Validate the entire proposed graph without making provisional policy visible to callbacks.
    for (const [name, options] of models) this.validateModelOptions(name, options, { defaults, models });
    this.deferSnapshotWarnings(() => {
      this.defaultModelOptions.restore(defaults);
      for (const [name, options] of models) this.modelOptions[name].restore(options);
    });
  }

  private warnSnapshotFlag(modelName: string, key: string): void {
    if (this.pendingSnapshotWarnings) {
      this.pendingSnapshotWarnings.push({ modelName, key });
      return;
    }
    const operation = key.startsWith('unsafeSkipRead') ? 'read' : 'list';
    const category = key.includes('NestedDocument')
      ? 'nested-document'
      : key.includes('Output')
        ? 'output'
        : 'document';
    const risk = category === 'output' ? 'output mutation' : 'source mutation';
    try {
      this.getGlobalOption('logger')?.warn?.(
        `UNSAFE: ${operation} ${category} snapshot checks disabled; ${risk} can leave stale authorization decisions. Restore ${key}=false after the temporary workaround.`,
        { modelName },
      );
    } catch {
      // Logging must not change publication of an explicitly selected server mode.
    }
  }

  private deferSnapshotWarnings<T>(publish: () => T): T {
    if (this.pendingSnapshotWarnings) return publish();
    // Compare coherent before/after model pairs, not transient per-key listener
    // states. A dormant request can become active when its prerequisite changes.
    const copyModes = this.initialOutputCopyModes();
    const fastModes = this.authorizationFastPathModes();
    const pending: Array<{ modelName: string; key: string }> = [];
    this.pendingSnapshotWarnings = pending;
    let result: T;
    try {
      result = publish();
    } finally {
      this.pendingSnapshotWarnings = undefined;
    }
    const nextCopyModes = this.initialOutputCopyModes();
    // Own the whole published signature before any logger callback can reenter
    // setters. Loggers observe publication; they are not part of its transaction.
    const nextFastModes = this.authorizationFastPathModes();
    for (const { modelName, key } of pending) this.warnSnapshotFlag(modelName, key);
    for (const [modelName, modes] of nextCopyModes) {
      for (const operation of ['List', 'Read'] as const) {
        const mode = modes[operation];
        if (mode === 'off' || mode === copyModes.get(modelName)?.[operation]) continue;
        const key = `unsafeSkip${operation}InitialOutputSnapshotCopy`;
        const prerequisite = `unsafeSkip${operation}OutputSnapshotChecks`;
        try {
          this.getGlobalOption('logger')?.warn?.(
            mode === 'active'
              ? `UNSAFE: ${operation.toLowerCase()} initial output snapshot copying disabled for eligible graphs; omitted native normalization/validation can change side effects and authorization outcomes. Restore ${key}=false after the temporary workaround.`
              : `UNSAFE: ${key} is dormant; requires ${prerequisite}=true. Initial copying and output comparisons remain enabled. Restore ${key}=false if not intended.`,
            { modelName },
          );
        } catch {
          // An unavailable logger must not undo explicitly selected server options.
        }
      }
    }
    for (const [modelName, modes] of nextFastModes) {
      for (const origin of ['list', 'read'] as const) {
        const captured = modes[origin];
        const previous = fastModes.get(modelName)?.[origin];
        if (
          captured.mode === 'off' ||
          (captured.mode === previous?.mode &&
            (captured.mode !== 'dormant' || captured.prerequisites === previous.prerequisites))
        )
          continue;
        const key = origin === 'read' ? 'unsafeUseReadAuthorizationFastPath' : 'unsafeUseListAuthorizationFastPath';
        const missing = authorizationFastPathPrerequisites(origin).filter(
          (_, index) => !(captured.prerequisites & (1 << index)),
        );
        try {
          this.getGlobalOption('logger')?.warn?.(
            captured.mode === 'active'
              ? `UNSAFE: ${origin} authorization fast path active (${key}=true); eligible query rows borrow source/grant/context leaves and omit repeated snapshots, isolation and descendant graph checks. Borrowed source/grant mutation, stale decisions, descendant replacement, lost native normalization/validation observations and loss of full unvisited source shape/bounds can change authorization outcomes, including denial becoming allowance. Actual operation/row/field rules, document hooks/getters, request/work limits and cheap exact root authority remain; shallow-unproven rows retain compatible copies and graph checks. Restore ${key}=false after the temporary workaround.`
              : `UNSAFE: ${key} is dormant; requires ${missing.map((flag) => `${flag}=true`).join(', ')}. Original snapshot flag behavior remains unchanged. Restore ${key}=false if not intended.`,
            { modelName },
          );
        } catch {
          // Publication already succeeded. Logger failure is not a new activation.
        }
      }
    }
    return result;
  }

  private authorizationFastPathModes() {
    return new Map(
      Object.entries(this.modelOptions).map(([modelName, manager]) => {
        const options = manager.fetch();
        return [
          modelName,
          { list: captureAuthorizationFastPath(options, 'list'), read: captureAuthorizationFastPath(options, 'read') },
        ] as const;
      }),
    );
  }

  private initialOutputCopyModes() {
    type Mode = 'off' | 'dormant' | 'active';
    return new Map(
      Object.entries(this.modelOptions).map(([modelName, options]) => {
        const mode = (operation: 'List' | 'Read'): Mode =>
          options.get(`unsafeSkip${operation}InitialOutputSnapshotCopy`) !== true
            ? 'off'
            : options.get(`unsafeSkip${operation}OutputSnapshotChecks`) === true
              ? 'active'
              : 'dormant';
        return [modelName, { List: mode('List'), Read: mode('Read') }] as const;
      }),
    );
  }

  private createModelOptions(modelName: string, options = this.resolveModelOptions(modelName)) {
    const model = this.getModelInstance(modelName) as ExtendedModel | null;

    if (!model) {
      throw new Error(
        `Runtime model registry missing model "${modelName}". Pass a mongoose.Model instance to createRouter() or register it with registerModelInstance() before using this isolated runtime.`,
      );
    }

    const manager = new OptionsManager<ModelRouterOptions, ExtendedModelRouterOptions>(options);

    const snapshotFlagChanged = (newValue: unknown, key: string, target: ModelRouterOptions, oldValue: unknown) => {
      // Only an explicit server boolean opts out; truthy JS values are not authority.
      (target as Record<string, unknown>)[key] = newValue === true;
      if (newValue !== true || oldValue === true) return;
      this.warnSnapshotFlag(modelName, key);
    };

    manager
      .onchange('permissionSchema', function (_newval, _key, target) {
        refreshPermissionMetadata(target);
      })
      .onchange('modelPermissionPrefix', function (_newval, _key, target) {
        refreshPermissionMetadata(target);
      })
      .onchange('unsafeSkipListDocumentSnapshotChecks', snapshotFlagChanged)
      .onchange('unsafeSkipReadDocumentSnapshotChecks', snapshotFlagChanged)
      .onchange('unsafeSkipListOutputSnapshotChecks', snapshotFlagChanged)
      .onchange('unsafeSkipReadOutputSnapshotChecks', snapshotFlagChanged)
      .onchange('unsafeSkipListNestedDocumentSnapshotChecks', snapshotFlagChanged)
      .onchange('unsafeSkipReadNestedDocumentSnapshotChecks', snapshotFlagChanged)
      .onchange('basePath', function (newval, key, target) {
        (target as Record<string, unknown>)[key] = normalizeBasePath(
          modelName,
          isString(newval) || isNil(newval) ? newval : undefined,
        );
      })
      .build();

    this.modelJsonSchemas[modelName] = model.jsonSchema();
    return manager;
  }

  private getOrCreateModelOptions<TModel = unknown, TVirtuals extends object = Record<never, never>>(
    modelName: string,
  ) {
    let manager = this.modelOptions[modelName];
    if (!manager) {
      manager = this.deferSnapshotWarnings(() => {
        const created = this.createModelOptions(modelName);
        this.modelOptions[modelName] = created;
        return created;
      });
    }

    return manager as OptionsManager<
      ModelRouterOptions<TModel, TVirtuals>,
      ExtendedModelRouterOptions<TModel, TVirtuals>
    >;
  }

  /**
   * Update explicit model overrides shallowly; undefined restores default inheritance
   * (operationAccess preserves its existing exact-key-only default fallback). A supplied
   * operationAccess/defaults object replaces that whole value. Defaults accept only
   * query/presentation settings; virtual configuration is validated before assignment.
   * Existing router.options remains its construction-time snapshot. Fresh model-service
   * calls capture the owner's current options/defaults; in-flight calls retain their snapshot.
   */
  setModelOptions<TModel = unknown, TVirtuals extends object = Record<never, never>>(
    modelName: string,
    options: ModelRouterOptions<TModel, TVirtuals>,
  ) {
    assertPublicDefaults(options.defaults);
    options = normalizePopulatePolicyOptions(options);
    if ('hydration' in options) options = { ...options, hydration: normalizeHydration(options.hydration) };
    const overrides = modelOverrides({ ...this.modelOptionOverrides[modelName], ...options } as ModelRouterOptions);
    const effective = this.resolveModelOptions(modelName, overrides);
    this.validateModelOptions(modelName, effective);
    this.deferSnapshotWarnings(() => {
      const manager = this.modelOptions[modelName];
      if (manager) manager.restore(effective);
      else this.modelOptions[modelName] = this.createModelOptions(modelName, effective);
      this.modelOptionOverrides[modelName] = overrides;
    });
  }

  setModelOption<
    K extends keyof ExtendedModelRouterOptions<TModel, TVirtuals>,
    TModel = unknown,
    TVirtuals extends object = Record<never, never>,
  >(modelName: string, key: K, value: ExtendedModelRouterOptions<TModel, TVirtuals>[K]) {
    const keyStr = String(key);

    if (keyStr === 'hydration' || keyStr.startsWith('hydration.')) {
      const hydration = normalizeHydrationUpdate(this.resolveModelOptions(modelName).hydration, keyStr, value);
      this.setModelOptions(modelName, { hydration });
      return;
    }

    if (keyStr === 'defaults') assertPublicDefaults(value);
    else if (keyStr.startsWith('defaults.')) {
      const proposed = {};
      set(proposed, keyStr.slice('defaults.'.length), value);
      assertPublicDefaults(proposed);
    }

    const [root, ...path] = keyStr.split('.');
    if (!path.length) {
      this.setModelOptions(modelName, { [root]: value } as ModelRouterOptions<TModel, TVirtuals>);
      return;
    }
    const current = this.resolveModelOptions(modelName) as Record<string, unknown>;
    const nested = cloneModelOptionForUpdate(isPlainObject(current[root]) ? current[root] : {});
    if (root === 'virtuals' && value === undefined) {
      const parent = path.length === 1 ? nested : get(nested, path.slice(0, -1));
      if (isPlainObject(parent)) delete (parent as Record<string, unknown>)[path[path.length - 1]];
    } else set(nested as object, path, value);
    this.setModelOptions(modelName, { [root]: nested } as ModelRouterOptions<TModel, TVirtuals>);
  }

  /** Frozen model/default snapshot; populate flags remain raw overrides. Read again for current values. */
  getModelOptions<TModel = unknown, TVirtuals extends object = Record<never, never>>(modelName: string) {
    const manager = this.getOrCreateModelOptions<TModel, TVirtuals>(modelName);
    return manager.fetch() as ModelRouterOptions<TModel, TVirtuals>;
  }

  /**
   * Generic stored exact → parent.default → parent lookup; only undefined falls through.
   * The exact runtime-model-default path is the final fallback if the stored parent is
   * absent. This is not the route-specific variant-to-base resolver; use
   * getExactModelOption to inspect a variant including its exact model-default fallback.
   */
  getModelOption<
    K extends keyof ExtendedModelRouterOptions<TModel, TVirtuals>,
    TModel = unknown,
    TVirtuals extends object = Record<never, never>,
  >(modelName: string, key: K | string, defaultValue?: ExtendedModelRouterOptions<TModel, TVirtuals>[K]) {
    const manager = this.getOrCreateModelOptions<TModel, TVirtuals>(modelName);
    const defaultModelValue = this.getDefaultModelOption(
      key as keyof ExtendedDefaultModelRouterOptions,
      defaultValue as never,
    );

    return getNestedOption(manager, key, defaultModelValue as never) as ExtendedModelRouterOptions<
      TModel,
      TVirtuals
    >[K];
  }

  /** Exact stored path, then the same runtime-model-default path; no parent/default or variant-to-base lookup. */
  getExactModelOption<
    K extends keyof ExtendedModelRouterOptions<TModel, TVirtuals>,
    TModel = unknown,
    TVirtuals extends object = Record<never, never>,
  >(modelName: string, key: K | string) {
    const manager = this.getOrCreateModelOptions<TModel, TVirtuals>(modelName);
    const defaultModelValue = this.getDefaultModelOption(key as keyof ExtendedDefaultModelRouterOptions);
    return manager.get(key, defaultModelValue as never) as ExtendedModelRouterOptions<TModel, TVirtuals>[K];
  }

  /**
   * List registered virtual leaf names for a scope (VIRT-01).
   * Scope containers (`{ sub }`) are not leaves. Inapplicable names are
   * still listed here; applicability is decided per-access by
   * {@link resolveVirtualDescriptor}. Request-controlled include collisions
   * are validated by VIRT-05, not guessed here.
   */
  getVirtualNames(modelName: string, scopePath?: string[]): string[] {
    const manager = this.getOrCreateModelOptions(modelName);
    const rootVirtuals = manager.get('virtuals') as Record<string, unknown> | undefined;
    const scopeVirtuals = getScopeVirtualsObject(rootVirtuals, scopePath);
    if (!scopeVirtuals) return [];
    return Object.entries(scopeVirtuals)
      .filter(([, v]) => v !== undefined && !isVirtualContainerValue(v))
      .map(([k]) => k);
  }

  /**
   * Whether a field is a registered virtual leaf in a scope (VIRT-01).
   * Inapplicable registered names stay virtual (never persisted), even when
   * no getter applies for the current access. Containers and persisted
   * fields return false.
   */
  isVirtualField(modelName: string, fieldName: string, scopePath?: string[]): boolean {
    const manager = this.getOrCreateModelOptions(modelName);
    const rootVirtuals = manager.get('virtuals') as Record<string, unknown> | undefined;
    const scopeVirtuals = getScopeVirtualsObject(rootVirtuals, scopePath);
    if (!scopeVirtuals || !(fieldName in scopeVirtuals)) return false;
    const entry = scopeVirtuals[fieldName];
    if (entry === undefined || isVirtualContainerValue(entry)) return false;
    return true;
  }

  /**
   * Resolve an applicable virtual descriptor with exact → `.default` → bare
   * semantics (VIRT-01, VIRT-00A D1/D5). Returns `undefined` when no getter
   * applies for `access`. Crucially, an access-record object is NEVER
   * interpreted as a getter descriptor when the access is absent: an
   * inapplicable registered name stays virtual (excluded from persisted
   * projections, write admission, and DB sort/filter/distinct).
   * Shared `dependsOn` and `dependsOnPopulate` lists inherit independently;
   * each defined leaf list replaces its shared list wholesale.
   */
  resolveVirtualDescriptor(
    modelName: string,
    virtualName: string,
    access: string,
    scopePath?: string[],
  ): ResolvedVirtualDescriptor | undefined {
    const manager = this.getOrCreateModelOptions(modelName);
    const rootVirtuals = manager.get('virtuals') as Record<string, unknown> | undefined;
    const scopeVirtuals = getScopeVirtualsObject(rootVirtuals, scopePath);
    return resolveSnapshotDescriptor(scopeVirtuals, virtualName, access);
  }

  getModelNames() {
    return Object.keys(this.modelOptions);
  }

  hasModel(modelName: string) {
    return modelName in this.modelOptions;
  }

  getModelJsonSchema(modelName: string) {
    return this.modelJsonSchemas[modelName];
  }

  private createDataOptions<TData = unknown>(dataName: string) {
    const manager = new DataOptionsManager({
      ...defaultDataOptions,
      dataName,
    });

    manager
      .onchange('basePath', function (newval, key, target) {
        (target as Record<string, unknown>)[key] = normalizeBasePath(
          dataName,
          isString(newval) || isNil(newval) ? newval : undefined,
        );
      })
      .build();

    return manager;
  }

  private getOrCreateDataOptions<TData = unknown>(dataName: string) {
    let manager = this.dataOptions[dataName];
    if (!manager) {
      manager = this.createDataOptions<TData>(dataName);
      this.dataOptions[dataName] = manager;
    }

    return manager as OptionsManager<DataRouterOptions<TData>, ExtendedDataRouterOptions<TData>>;
  }

  setDataOptions<TData = unknown>(dataName: string, options: DataRouterOptions<TData>) {
    const manager = this.getOrCreateDataOptions<TData>(dataName);
    // Data admission owns records once. Shallow assignment avoids traversing the
    // dataset on unrelated option updates; getters reuse its safe frozen view.
    manager.assign(options);
  }

  setDataOption<K extends keyof ExtendedDataRouterOptions<TData>, TData = unknown>(
    dataName: string,
    key: K,
    value: ExtendedDataRouterOptions<TData>[K],
  ) {
    const manager = this.getOrCreateDataOptions<TData>(dataName);

    manager.set(key, value);
  }

  getDataOptions<TData = unknown>(dataName: string) {
    const manager = this.getOrCreateDataOptions<TData>(dataName);
    // Reuse the frozen public data view. Native-valued properties copy on access;
    // fetching options itself does not traverse or recopy the dataset.
    return manager.fetch() as DataRouterOptions<TData>;
  }

  /**
   * Reusable configured data view: plain containers are frozen; native properties
   * return detached mutable copies on access. Native identity is not stable.
   * Replacement leaves previously captured views on their original data version.
   */
  getDataSnapshot<TData = unknown>(dataName: string): readonly TData[] {
    const manager = this.getOrCreateDataOptions<TData>(dataName);
    const snapshot = manager.get('data') as TData[] | undefined;
    return snapshot ?? emptyDataSnapshot;
  }

  getDataOption<K extends keyof ExtendedDataRouterOptions<TData>, TData = unknown>(
    dataName: string,
    key: K | string,
    defaultValue?: ExtendedDataRouterOptions<TData>[K],
  ) {
    const manager = this.getOrCreateDataOptions<TData>(dataName);

    return getNestedOption(manager, key, defaultValue) as ExtendedDataRouterOptions<TData>[K];
  }

  getExactDataOption<K extends keyof ExtendedDataRouterOptions<TData>, TData = unknown>(
    dataName: string,
    key: K | string,
  ) {
    const manager = this.getOrCreateDataOptions<TData>(dataName);
    return manager.get(key) as ExtendedDataRouterOptions<TData>[K];
  }

  getDataNames() {
    return Object.keys(this.dataOptions);
  }

  ensureModelMeta(modelName: string) {
    if (modelName in this.modelRefs && modelName in this.modelSubs && modelName in this.modelAtts) {
      return;
    }

    const model = this.getModelInstance(modelName);
    if (!model) {
      this.modelRefs[modelName] = this.modelRefs[modelName] ?? {};
      this.modelSubs[modelName] = this.modelSubs[modelName] ?? [];
      this.modelAtts[modelName] = this.modelAtts[modelName] ?? [];
      return;
    }

    const schema = model.schema as mongoose.Schema & { tree: Record<string, unknown>; obj: Record<string, unknown> };
    this.modelRefs[modelName] = buildRefs(schema.tree);
    this.modelSubs[modelName] = buildSubPaths(schema.tree);
    this.modelAtts[modelName] = keys(schema.obj);
  }

  getModelRef(modelName: string, refPath: string): string | null {
    this.ensureModelMeta(modelName);
    const value = get(this.modelRefs, `${modelName}.${refPath}`, null) as string | ModelReferenceMap | null;
    return isString(value) ? value : null;
  }

  getModelSub(modelName: string): string[] {
    this.ensureModelMeta(modelName);
    return get(this.modelSubs, modelName, []) as string[];
  }

  getModelAtt(modelName: string): string[] {
    this.ensureModelMeta(modelName);
    return get(this.modelAtts, modelName, []) as string[];
  }
}

export const defaultRuntime = new AccessRuntime({ allowGlobalModelLookup: true });
