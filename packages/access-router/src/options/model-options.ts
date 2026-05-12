import mongoose from 'mongoose';
import mschema2Jsonschema from 'mongoose-schema-jsonschema';
import { addLeadingSlash, forEach, isArray, isBoolean, isFunction, isNil, isString } from '@web-ts-toolkit/utils';
import { OptionsManager, getNestedOption } from './manager';
import {
  ModelRouterOptions,
  DefaultModelRouterOptions,
  ExtendedDefaultModelRouterOptions,
  ExtendedModelRouterOptions,
} from '../interfaces';
import { getDefaultModelOption, getDefaultModelOptions } from './default-model-options';

mschema2Jsonschema(mongoose);
const pluralize = mongoose.pluralize();

type ExtendedModel = mongoose.Model<unknown> & { jsonSchema: () => Record<string, unknown> };
type PermissionKeyMap = Record<string, string[]>;

const defaultModelOptions: ModelRouterOptions = {
  basePath: null,
  mandatoryFields: [],
};

const modelOptions: Record<string, OptionsManager<ModelRouterOptions, ExtendedModelRouterOptions>> = {};

const modelJsonSchemas: Record<string, Record<string, unknown>> = {};

const normalizeBasePath = (name: string, value: string | null | undefined) => {
  if (isNil(value)) {
    return `/${pluralize(name)}`;
  }

  return isString(value) ? addLeadingSlash(value) : '';
};

const hasModelPermission = (value: unknown, modelPermissionPrefix: string) => {
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
    forEach(permissionSchema[schemaKey], (value, accessKey) => {
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
    });
  });

  return {
    schemaKeys,
    globalPermissionKeys,
    modelPermissionKeys,
  };
};

const createModelOptions = (modelName: string) => {
  const model = mongoose.model(modelName) as ExtendedModel;

  const manager = new OptionsManager<ModelRouterOptions, ExtendedModelRouterOptions>({
    ...defaultModelOptions,
    modelName,
  });

  manager
    .onchange('permissionSchema', function (newval, key, target, oldval) {
      const permissionSchema = (newval ?? {}) as NonNullable<ModelRouterOptions['permissionSchema']>;
      const { schemaKeys, globalPermissionKeys, modelPermissionKeys } = classifyPermissionSchema(
        permissionSchema,
        target.modelPermissionPrefix ?? '',
      );

      target._permissionSchemaKeys = schemaKeys;
      target._globalPermissionKeys = globalPermissionKeys;
      target._modelPermissionKeys = modelPermissionKeys;
    })
    .onchange('basePath', function (newval, key, target, oldval) {
      (target as Record<string, unknown>)[key] = normalizeBasePath(
        modelName,
        isString(newval) || isNil(newval) ? newval : undefined,
      );
    })
    .build();

  modelJsonSchemas[modelName] = model.jsonSchema();
  return manager;
};

const getOrCreateModelOptions = (modelName: string) => {
  let manager = modelOptions[modelName];
  if (!manager) {
    manager = createModelOptions(modelName);
    modelOptions[modelName] = manager;
  }

  return manager;
};

export const setModelOptions = (modelName: string, options: ModelRouterOptions) => {
  const manager = getOrCreateModelOptions(modelName);
  const defaultOptions = getDefaultModelOptions();
  const modelOptions = manager.fetch();

  manager.assign({ ...defaultOptions, ...modelOptions, ...options });
};

export const setModelOption = <K extends keyof ExtendedModelRouterOptions>(
  modelName: string,
  key: K,
  value: ExtendedModelRouterOptions[K],
) => {
  const manager = getOrCreateModelOptions(modelName);

  manager.set(key, value);
};

export const getModelOptions = (modelName: string) => {
  const manager = getOrCreateModelOptions(modelName);
  return manager.fetch();
};

export const getModelOption = <K extends keyof ExtendedModelRouterOptions>(
  modelName: string,
  key: K | string,
  defaultValue?: ExtendedModelRouterOptions[K],
) => {
  const manager = getOrCreateModelOptions(modelName);
  const defaultModelValue = getDefaultModelOption(
    key as keyof ExtendedDefaultModelRouterOptions,
    defaultValue as never,
  );

  return getNestedOption(manager, key, defaultModelValue);
};

export const getExactModelOption = <K extends keyof ExtendedModelRouterOptions>(modelName: string, key: K | string) => {
  const manager = getOrCreateModelOptions(modelName);
  const defaultModelValue = getDefaultModelOption(key as keyof ExtendedDefaultModelRouterOptions);
  return manager.get(key, defaultModelValue);
};

export const getModelNames = () => {
  return Object.keys(modelOptions);
};

export const getModelJsonSchema = (modelName: string) => {
  return modelJsonSchemas[modelName];
};
