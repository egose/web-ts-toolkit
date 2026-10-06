import mongoose from 'mongoose';
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
import { OptionsManager, getNestedOption } from './options/manager';
import { defaultRequestComplexity } from './request-complexity';

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

const cloneVirtualsForValidation = <T>(value: T): T => {
  if (Array.isArray(value)) return value.map((item) => cloneVirtualsForValidation(item)) as T;
  if (!value || typeof value !== 'object') return value;
  if (Object.getPrototypeOf(value) !== Object.prototype) return value;
  return Object.fromEntries(
    Object.entries(value as Record<string, unknown>).map(([k, v]) => [k, cloneVirtualsForValidation(v)]),
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
    if (k !== 'get' && k !== 'dependsOn') {
      throw new Error(`Virtual ${entryLabel}: unsupported descriptor key "${k}" (expected only get/dependsOn)`);
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
  ): void => {
    for (const [containerName, raw] of Object.entries(currentVirtuals)) {
      if (raw === undefined || !isVirtualContainerValue(raw)) continue;
      const record = raw as { sub: Record<string, unknown> };
      const childSchema = getChildSchemaForField(currentSchema, containerName);
      const nestedFields = getNestedChildFields(currentSchema, containerName);
      const currentStored = collectStoredTopLevel(currentSchema);
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
      const nextSchema = childSchema;
      visitContainers(subVirtuals, nextSchema, subPrefix);
    }
  };
  visitContainers(rootVirtuals, rootSchema, '');
};

const getScopeVirtualsObject = (
  rootVirtuals: Record<string, unknown> | null | undefined,
  scopePath: string[] | undefined,
): Record<string, unknown> | null => {
  if (!rootVirtuals || !isPlainObject(rootVirtuals)) return null;
  if (!scopePath || scopePath.length === 0) return rootVirtuals;
  let current: unknown = rootVirtuals;
  for (let i = 0; i < scopePath.length; i += 2) {
    const field = scopePath[i];
    const subMarker = scopePath[i + 1];
    if (!field || subMarker !== 'sub') return null;
    if (!isPlainObject(current)) return null;
    const container = (current as Record<string, unknown>)[field];
    if (!isVirtualContainerValue(container)) return null;
    current = (container as { sub: Record<string, unknown> }).sub;
    if (!isPlainObject(current)) return null;
  }
  return current as Record<string, unknown>;
};

const toVirtualDescriptor = (
  leaf: unknown,
  sharedDependsOn: unknown,
): { get: (...args: never[]) => unknown; dependsOn: string[] } | null => {
  if (isFunction(leaf))
    return { get: leaf as (...args: never[]) => unknown, dependsOn: (sharedDependsOn as string[]) ?? [] };
  if (!isPlainObject(leaf)) return null;
  const record = leaf as Record<string, unknown>;
  if (!isFunction(record.get)) return null;
  const dependsOn = (record.dependsOn ?? sharedDependsOn ?? []) as string[];
  return { get: record.get as (...args: never[]) => unknown, dependsOn };
};

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
      requireRegisteredPopulateModels: true,
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
    modelPermissionPrefix: '',
  }).build();

  private readonly modelOptions: Record<string, OptionsManager<any, any>> = {};
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
        const mgr = this.createModelOptions(name);
        mgr.restore(opts as any);
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

  setGlobalOptions(options: GlobalOptions) {
    this.globalOptions.assign(options);
  }

  setGlobalOption<K extends keyof GlobalOptions>(key: K, value: GlobalOptions[K]) {
    this.globalOptions.set(key, value);
  }

  getGlobalOptions() {
    return this.globalOptions.fetch();
  }

  getGlobalOption<K extends keyof GlobalOptions>(key: K, defaultValue?: GlobalOptions[K]) {
    return this.globalOptions.get(key, defaultValue);
  }

  setDefaultModelOptions(options: DefaultModelRouterOptions) {
    this.defaultModelOptions.assign(options);
  }

  setDefaultModelOption<K extends keyof ExtendedDefaultModelRouterOptions>(
    key: K,
    value: ExtendedDefaultModelRouterOptions[K],
  ) {
    this.defaultModelOptions.set(key, value);
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

  private createModelOptions(modelName: string) {
    const model = this.getModelInstance(modelName) as ExtendedModel | null;

    if (!model) {
      throw new Error(
        `Runtime model registry missing model "${modelName}". Pass a mongoose.Model instance to createRouter() or register it with registerModelInstance() before using this isolated runtime.`,
      );
    }

    const manager = new OptionsManager<ModelRouterOptions, ExtendedModelRouterOptions>({
      ...defaultModelOptions,
      modelName,
    });

    manager
      .onchange('permissionSchema', function (_newval, _key, target) {
        refreshPermissionMetadata(target);
      })
      .onchange('modelPermissionPrefix', function (_newval, _key, target) {
        refreshPermissionMetadata(target);
      })
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
      manager = this.createModelOptions(modelName);
      this.modelOptions[modelName] = manager;
    }

    return manager as OptionsManager<
      ModelRouterOptions<TModel, TVirtuals>,
      ExtendedModelRouterOptions<TModel, TVirtuals>
    >;
  }

  setModelOptions<TModel = unknown, TVirtuals extends object = Record<never, never>>(
    modelName: string,
    options: ModelRouterOptions<TModel, TVirtuals>,
  ) {
    const manager = this.getOrCreateModelOptions<TModel, TVirtuals>(modelName);
    const defaultOptions = this.getDefaultModelOptions() as ModelRouterOptions<TModel, TVirtuals>;
    const currentModelOptions = manager.fetch();

    const merged = { ...defaultOptions, ...currentModelOptions, ...options } as Record<string, unknown>;
    const model = this.getModelInstance(modelName) as mongoose.Model<unknown> | null;
    const permissionField =
      (merged.documentPermissionField as string | undefined) ??
      (currentModelOptions.documentPermissionField as string | undefined) ??
      (this.getDefaultModelOption('documentPermissionField') as string | undefined) ??
      '_permissions';
    // Validate before commit; rejected mutations preserve the previous valid config.
    validateVirtualsTree(model, merged.virtuals, permissionField, modelName);

    manager.assign({ ...defaultOptions, ...currentModelOptions, ...options });
  }

  setModelOption<
    K extends keyof ExtendedModelRouterOptions<TModel, TVirtuals>,
    TModel = unknown,
    TVirtuals extends object = Record<never, never>,
  >(modelName: string, key: K, value: ExtendedModelRouterOptions<TModel, TVirtuals>[K]) {
    const manager = this.getOrCreateModelOptions<TModel, TVirtuals>(modelName);
    const keyStr = String(key);

    if (keyStr === 'virtuals' || keyStr.startsWith('virtuals.') || keyStr === 'documentPermissionField') {
      const model = this.getModelInstance(modelName) as mongoose.Model<unknown> | null;
      const currentVirtuals = manager.get('virtuals' as K) as unknown;
      const currentPermissionField =
        (manager.get('documentPermissionField' as K) as string | undefined) ??
        (this.getDefaultModelOption('documentPermissionField' as never) as string | undefined) ??
        '_permissions';

      let proposedVirtuals: unknown = currentVirtuals;
      let proposedPermissionField = currentPermissionField;

      if (keyStr === 'documentPermissionField') {
        proposedPermissionField = value as string;
      } else if (keyStr === 'virtuals') {
        proposedVirtuals = value as unknown;
      } else {
        const cloned = cloneVirtualsForValidation(currentVirtuals ?? {});
        const nestedPath = keyStr.slice('virtuals.'.length);
        if (value === undefined) {
          // Removal: delete the nested key so validation sees the remainder.
          const segments = nestedPath.split('.');
          let cursor: unknown = cloned;
          for (let i = 0; i < segments.length - 1; i++) {
            if (!isPlainObject(cursor)) break;
            cursor = (cursor as Record<string, unknown>)[segments[i]];
          }
          if (isPlainObject(cursor)) {
            delete (cursor as Record<string, unknown>)[segments[segments.length - 1]];
          }
          proposedVirtuals = cloned;
        } else {
          set(cloned as object, nestedPath, value as unknown);
          proposedVirtuals = cloned;
        }
      }

      validateVirtualsTree(model, proposedVirtuals, proposedPermissionField, modelName);
    }

    manager.set(key, value);
  }

  getModelOptions<TModel = unknown, TVirtuals extends object = Record<never, never>>(modelName: string) {
    const manager = this.getOrCreateModelOptions<TModel, TVirtuals>(modelName);
    return manager.fetch() as ModelRouterOptions<TModel, TVirtuals>;
  }

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
   * Shared record-level `dependsOn` is inherited when a leaf lacks its own.
   */
  resolveVirtualDescriptor(
    modelName: string,
    virtualName: string,
    access: string,
    scopePath?: string[],
  ): { get: (...args: never[]) => unknown; dependsOn: string[] } | undefined {
    const manager = this.getOrCreateModelOptions(modelName);
    const rootVirtuals = manager.get('virtuals') as Record<string, unknown> | undefined;
    const scopeVirtuals = getScopeVirtualsObject(rootVirtuals, scopePath);
    if (!scopeVirtuals || !(virtualName in scopeVirtuals)) return undefined;
    const entry = scopeVirtuals[virtualName];
    if (entry === undefined || isVirtualContainerValue(entry)) return undefined;
    if (isFunction(entry)) return { get: entry as (...args: never[]) => unknown, dependsOn: [] };
    if (!isPlainObject(entry)) return undefined;
    const record = entry as Record<string, unknown>;
    if ('get' in record) {
      const descriptor = toVirtualDescriptor(entry, undefined);
      return descriptor ?? undefined;
    }
    const sharedDependsOn = record.dependsOn as string[] | undefined;
    const exact = record[access];
    if (exact !== undefined) {
      const descriptor = toVirtualDescriptor(exact, sharedDependsOn);
      if (descriptor) return descriptor;
    }
    const fallback = record.default;
    if (fallback !== undefined) {
      const descriptor = toVirtualDescriptor(fallback, sharedDependsOn);
      if (descriptor) return descriptor;
    }
    return undefined;
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
    const manager = new OptionsManager<DataRouterOptions, ExtendedDataRouterOptions>({
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
    // ARH-11: assign directly instead of fetch-merge-assign. OptionsManager.assign
    // shallow-merges, so the extra fetch previously recopied every stored record
    // on each unrelated option update. Assignment clones once and freezes; reads
    // reuse the frozen snapshot.
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
    // ARH-11: fetch reuses the frozen internal data snapshot created on
    // assignment (see OptionsManager), so per-request reads do not recopy payloads.
    return manager.fetch() as DataRouterOptions<TData>;
  }

  getDataSnapshot<TData = unknown>(dataName: string): readonly TData[] {
    // ARH-11: return the shared immutable snapshot created on
    // assignment/replacement without cloning records or caching query results.
    // Replacement swaps the stored reference, so previously returned snapshots
    // stay coherent for in-flight readers. Callers must not mutate the result.
    const manager = this.getOrCreateDataOptions<TData>(dataName);
    const snapshot = manager.get('data') as TData[] | undefined;
    return (snapshot ?? []) as readonly TData[];
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
