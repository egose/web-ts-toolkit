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
} from '@web-ts-toolkit/utils';
import { buildRefs, buildSubPaths } from './helpers';
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
        return;
      }

      if (hasModelPermission(value, modelPermissionPrefix)) {
        modelPermissionKeys[accessKey].push(schemaKey);
        return;
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

export class AccessRuntime {
  constructor() {
    ensureMongooseJsonSchemaInitialized();
  }

  private readonly globalOptions = new OptionsManager<GlobalOptions, GlobalOptions>({
    requestPermissionField: '_permissions',
    globalPermissions: () => ({}),
    requireRegisteredPopulateModels: true,
    logger: defaultLogger,
    requestComplexity: defaultRequestComplexity,
  }).build();

  private readonly defaultModelOptions = new OptionsManager<
    DefaultModelRouterOptions,
    ExtendedDefaultModelRouterOptions
  >({
    listHardLimit: 1000,
    documentPermissionField: '_permissions',
    idParam: 'id',
    idField: '_id',
    parentPath: '/',
    queryRouteSegment: '__query',
    mutationRouteSegment: '__mutation',
    operationAccess: false,
    modelPermissionPrefix: '',
  }).build();

  private readonly modelOptions: Record<string, OptionsManager<ModelRouterOptions, ExtendedModelRouterOptions>> = {};
  private readonly modelJsonSchemas: Record<string, Record<string, unknown>> = {};
  private readonly dataOptions: Record<string, OptionsManager<DataRouterOptions, ExtendedDataRouterOptions>> = {};
  private readonly modelRefs: Record<string, ModelReferenceMap> = {};
  private readonly modelSubs: Record<string, string[]> = {};
  private readonly modelAtts: Record<string, string[]> = {};
  private readonly modelInstances: Record<string, mongoose.Model<unknown>> = {};
  private readonly openApiRegistry = new OpenApiRegistry();

  registerModelInstance(modelName: string, model: mongoose.Model<unknown>): void {
    if (!modelName || typeof modelName !== 'string') {
      throw new TypeError(`registerModelInstance: modelName must be a non-empty string, received ${typeof modelName}`);
    }
    const existing = this.modelInstances[modelName];
    if (existing && existing !== model) {
      throw new Error(
        `Runtime model registry conflict: model "${modelName}" is already registered to a different mongoose.Model instance on this runtime. Use a distinct model name or a separate runtime.`,
      );
    }
    this.modelInstances[modelName] = model;
  }

  hasModelInstance(modelName: string): boolean {
    return modelName in this.modelInstances;
  }

  getModelInstance(modelName: string): mongoose.Model<unknown> | null {
    const registered = this.modelInstances[modelName];
    if (registered) return registered;
    const global = mongoose.models[modelName] as mongoose.Model<unknown> | undefined;
    return global ?? null;
  }

  registerOpenApiRoute(route: OpenApiRouteDescriptor) {
    this.openApiRegistry.register(route);
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
    const model = (this.getModelInstance(modelName) ?? mongoose.model(modelName)) as ExtendedModel;

    const manager = new OptionsManager<ModelRouterOptions, ExtendedModelRouterOptions>({
      ...defaultModelOptions,
      modelName,
    });

    manager
      .onchange('permissionSchema', function (newval, key, target) {
        const permissionSchema = (newval ?? {}) as NonNullable<ModelRouterOptions['permissionSchema']>;
        const { schemaKeys, globalPermissionKeys, modelPermissionKeys } = classifyPermissionSchema(
          permissionSchema,
          target.modelPermissionPrefix ?? '',
        );

        (target as Record<string, unknown>)._permissionSchemaKeys = schemaKeys;
        (target as Record<string, unknown>)._globalPermissionKeys = globalPermissionKeys;
        (target as Record<string, unknown>)._modelPermissionKeys = modelPermissionKeys;
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

  private getOrCreateModelOptions<TModel = unknown>(modelName: string) {
    let manager = this.modelOptions[modelName];
    if (!manager) {
      manager = this.createModelOptions(modelName);
      this.modelOptions[modelName] = manager;
    }

    return manager as OptionsManager<ModelRouterOptions<TModel>, ExtendedModelRouterOptions<TModel>>;
  }

  setModelOptions<TModel = unknown>(modelName: string, options: ModelRouterOptions<TModel>) {
    const manager = this.getOrCreateModelOptions<TModel>(modelName);
    const defaultOptions = this.getDefaultModelOptions() as ModelRouterOptions<TModel>;
    const currentModelOptions = manager.fetch();

    manager.assign({ ...defaultOptions, ...currentModelOptions, ...options });
  }

  setModelOption<K extends keyof ExtendedModelRouterOptions<TModel>, TModel = unknown>(
    modelName: string,
    key: K,
    value: ExtendedModelRouterOptions<TModel>[K],
  ) {
    const manager = this.getOrCreateModelOptions<TModel>(modelName);

    manager.set(key, value);
  }

  getModelOptions<TModel = unknown>(modelName: string) {
    const manager = this.getOrCreateModelOptions<TModel>(modelName);
    return manager.fetch() as ModelRouterOptions<TModel>;
  }

  getModelOption<K extends keyof ExtendedModelRouterOptions<TModel>, TModel = unknown>(
    modelName: string,
    key: K | string,
    defaultValue?: ExtendedModelRouterOptions<TModel>[K],
  ) {
    const manager = this.getOrCreateModelOptions<TModel>(modelName);
    const defaultModelValue = this.getDefaultModelOption(
      key as keyof ExtendedDefaultModelRouterOptions,
      defaultValue as never,
    );

    return getNestedOption(manager, key, defaultModelValue as never) as ExtendedModelRouterOptions<TModel>[K];
  }

  getExactModelOption<K extends keyof ExtendedModelRouterOptions<TModel>, TModel = unknown>(
    modelName: string,
    key: K | string,
  ) {
    const manager = this.getOrCreateModelOptions<TModel>(modelName);
    const defaultModelValue = this.getDefaultModelOption(key as keyof ExtendedDefaultModelRouterOptions);
    return manager.get(key, defaultModelValue as never) as ExtendedModelRouterOptions<TModel>[K];
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
    const currentDataOptions = manager.fetch();

    manager.assign({ ...currentDataOptions, ...options });
  }

  setDataOption<K extends keyof DataRouterOptions<TData>, TData = unknown>(
    dataName: string,
    key: K,
    value: DataRouterOptions<TData>[K],
  ) {
    const manager = this.getOrCreateDataOptions<TData>(dataName);

    manager.set(key, value);
  }

  getDataOptions<TData = unknown>(dataName: string) {
    const manager = this.getOrCreateDataOptions<TData>(dataName);
    return manager.fetch() as DataRouterOptions<TData>;
  }

  getDataOption<K extends keyof DataRouterOptions<TData>, TData = unknown>(
    dataName: string,
    key: K | string,
    defaultValue?: DataRouterOptions<TData>[K],
  ) {
    const manager = this.getOrCreateDataOptions<TData>(dataName);

    return getNestedOption(manager, key, defaultValue) as DataRouterOptions<TData>[K];
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

export const defaultRuntime = new AccessRuntime();
