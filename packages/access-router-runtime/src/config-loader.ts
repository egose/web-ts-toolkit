import { resolve as pathResolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { validateFiniteInteger } from '@web-ts-toolkit/express-runtime';
import { createJiti } from 'jiti';
import mongoose from 'mongoose';
import type { AccessRouterRuntimeConfig } from './index';

export interface AccessRouterRuntimeConfigLoadOptions {
  tsconfigPath?: string;
}

type ConfigModule = {
  default?: AccessRouterRuntimeConfig | (() => AccessRouterRuntimeConfig);
  config?: AccessRouterRuntimeConfig;
};

const CONFIG_FIELDS = new Set([
  'db',
  'globalOptions',
  'defaultModelOptions',
  'rootRouter',
  'models',
  'data',
  'openApi',
  'extraRoutes',
  'dev',
  'express',
  'init',
  'shutdown',
]);

function hasOwn(value: object, key: string): boolean {
  return Object.prototype.hasOwnProperty.call(value, key);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object';
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  if (!isRecord(value) || Array.isArray(value)) {
    return false;
  }

  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function isThenable(value: unknown): boolean {
  return (
    value !== null &&
    (typeof value === 'object' || typeof value === 'function') &&
    typeof (value as { then?: unknown }).then === 'function'
  );
}

function isModuleNamespace(value: unknown): value is Record<string, unknown> {
  return isRecord(value) && Object.prototype.toString.call(value) === '[object Module]';
}

function configError(configPath: string, message: string): Error {
  return new Error(`Invalid access-router-runtime config "${configPath}": ${message}`);
}

function assertPlainConfigObject(value: unknown, configPath: string): asserts value is AccessRouterRuntimeConfig {
  if (isThenable(value)) {
    throw configError(configPath, 'config export must be a synchronous object, not a promise or thenable.');
  }

  if (!isPlainObject(value)) {
    throw configError(configPath, 'config export must be a plain object.');
  }

  const keys = Object.keys(value);
  if (keys.length > 0 && !keys.some((key) => CONFIG_FIELDS.has(key))) {
    throw configError(configPath, `config object has no recognized config fields; found ${keys.join(', ')}.`);
  }
}

function normalizeStringArray(value: unknown, configPath: string, field: string): void {
  if (value === undefined) {
    return;
  }

  if (!Array.isArray(value) || value.some((entry) => typeof entry !== 'string')) {
    throw configError(configPath, `field "${field}" must be an array of strings.`);
  }
}

function validateDevConfig(config: Record<string, unknown>, configPath: string): void {
  const dev = config.dev;
  if (dev === undefined) {
    return;
  }
  if (!isPlainObject(dev)) {
    throw configError(configPath, 'field "dev" must be a plain object.');
  }

  normalizeStringArray(dev.watch, configPath, 'dev.watch');
  normalizeStringArray(dev.ext, configPath, 'dev.ext');

  if (dev.delay !== undefined) {
    try {
      validateFiniteInteger(dev.delay, { name: 'dev.delay', min: 0 });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      throw configError(configPath, `field "dev.delay" is invalid: ${message}`);
    }
  }
}

function validateDbConfig(config: Record<string, unknown>, configPath: string): void {
  const db = config.db;
  if (db === undefined) {
    return;
  }
  if (!isPlainObject(db)) {
    throw configError(configPath, 'field "db" must be a plain object.');
  }

  if (db.url !== undefined && typeof db.url !== 'string') {
    throw configError(configPath, 'field "db.url" must be a string when provided.');
  }
  if (db.connection !== undefined) {
    const connection = db.connection as Partial<mongoose.Connection>;
    if (!isRecord(connection) || typeof connection.model !== 'function' || !isRecord(connection.models)) {
      throw configError(configPath, 'field "db.connection" must be a Mongoose connection when provided.');
    }
  }
  if (db.url !== undefined && db.connection !== undefined) {
    throw configError(configPath, 'field "db" cannot define both "url" and "connection".');
  }
  if (db.disconnectOnShutdown !== undefined && typeof db.disconnectOnShutdown !== 'boolean') {
    throw configError(configPath, 'field "db.disconnectOnShutdown" must be a boolean when provided.');
  }
}

function getRouterName(router: unknown, field: string, configPath: string, parentField: string): string | undefined {
  if (router === undefined || router === null || typeof router !== 'object') {
    return undefined;
  }

  const value = (router as Record<string, unknown>)[field];
  if (value !== undefined && typeof value !== 'string') {
    throw configError(configPath, `field "${parentField}.router.${field}" must be a string when provided.`);
  }
  return value;
}

function validateModelDefinitions(config: Record<string, unknown>, configPath: string): void {
  const models = config.models;
  if (models === undefined) {
    return;
  }
  if (!Array.isArray(models)) {
    throw configError(configPath, 'field "models" must be an array.');
  }

  const modelNames = new Set<string>();
  const collectionNames = new Set<string>();

  models.forEach((definition, index) => {
    const field = `models[${index}]`;
    if (!isRecord(definition) || Array.isArray(definition)) {
      throw configError(configPath, `field "${field}" must be an object.`);
    }

    const hasModel = definition.model !== undefined;
    const hasSchema = definition.schema !== undefined;
    if (hasModel === hasSchema) {
      throw configError(configPath, `field "${field}" must define exactly one of "model" or "schema".`);
    }

    const name = definition.name;
    if (name !== undefined && (typeof name !== 'string' || name.length === 0)) {
      throw configError(configPath, `field "${field}.name" must be a non-empty string when provided.`);
    }

    const routerModelName = getRouterName(definition.router, 'modelName', configPath, field);
    let resolvedName: string;
    let collectionName: string | undefined;

    if (hasModel) {
      const model = definition.model as mongoose.Model<unknown> | undefined;
      if (
        !model ||
        typeof model !== 'function' ||
        typeof model.modelName !== 'string' ||
        model.modelName.length === 0
      ) {
        throw configError(configPath, `field "${field}.model" must be a Mongoose model.`);
      }
      if (definition.collection !== undefined) {
        throw configError(configPath, `field "${field}.collection" cannot be used with an existing "model".`);
      }
      resolvedName = model.modelName;
      collectionName = model.collection?.name;
      if (typeof name === 'string' && name !== resolvedName) {
        throw configError(configPath, `field "${field}.name" conflicts with model name "${resolvedName}".`);
      }
    } else {
      if (!(definition.schema instanceof mongoose.Schema)) {
        throw configError(configPath, `field "${field}.schema" must be a Mongoose schema.`);
      }
      if (typeof name !== 'string' || name.length === 0) {
        throw configError(configPath, `field "${field}.name" is required when "schema" is used.`);
      }
      if (definition.collection !== undefined && typeof definition.collection !== 'string') {
        throw configError(configPath, `field "${field}.collection" must be a string when provided.`);
      }
      resolvedName = name;
      collectionName = definition.collection;
    }

    if (routerModelName !== undefined && routerModelName !== resolvedName) {
      throw configError(configPath, `field "${field}.router.modelName" conflicts with model name "${resolvedName}".`);
    }

    if (modelNames.has(resolvedName)) {
      throw configError(configPath, `duplicate model name "${resolvedName}" at field "${field}".`);
    }
    modelNames.add(resolvedName);

    if (collectionName) {
      if (collectionNames.has(collectionName)) {
        throw configError(configPath, `duplicate collection name "${collectionName}" at field "${field}".`);
      }
      collectionNames.add(collectionName);
    }
  });
}

function validateDataDefinitions(config: Record<string, unknown>, configPath: string): void {
  const data = config.data;
  if (data === undefined) {
    return;
  }
  if (!Array.isArray(data)) {
    throw configError(configPath, 'field "data" must be an array.');
  }

  const names = new Set<string>();
  const routerNames = new Set<string>();

  data.forEach((definition, index) => {
    const field = `data[${index}]`;
    if (!isRecord(definition) || Array.isArray(definition)) {
      throw configError(configPath, `field "${field}" must be an object.`);
    }
    if (typeof definition.name !== 'string' || definition.name.length === 0) {
      throw configError(configPath, `field "${field}.name" must be a non-empty string.`);
    }

    const routerDataName = getRouterName(definition.router, 'dataName', configPath, field);
    const resolvedRouterName = routerDataName ?? definition.name;

    if (names.has(definition.name)) {
      throw configError(configPath, `duplicate data name "${definition.name}" at field "${field}".`);
    }
    names.add(definition.name);

    if (routerNames.has(resolvedRouterName)) {
      throw configError(configPath, `duplicate resolved data name "${resolvedRouterName}" at field "${field}".`);
    }
    routerNames.add(resolvedRouterName);
  });
}

export function validateAccessRouterRuntimeConfig(
  config: AccessRouterRuntimeConfig,
  configPath = 'runtime config',
): void {
  assertPlainConfigObject(config, configPath);
  const record = config as Record<string, unknown>;
  validateDbConfig(record, configPath);
  validateModelDefinitions(record, configPath);
  validateDataDefinitions(record, configPath);
  validateDevConfig(record, configPath);
}

function createConfigJiti(options: AccessRouterRuntimeConfigLoadOptions = {}) {
  return createJiti(pathToFileURL(pathResolve(process.cwd(), '.access-router-runtime.config.js')).href, {
    interopDefault: true,
    tsconfigPaths: options.tsconfigPath,
  });
}

export function normalizeAccessRouterRuntimeConfigExport(raw: unknown, configPath: string): AccessRouterRuntimeConfig {
  if (isThenable(raw)) {
    throw configError(configPath, 'module export must not be a promise or thenable.');
  }

  let exported: unknown = raw;
  if (typeof raw === 'function') {
    exported = raw();
  } else if (isRecord(raw) && (isModuleNamespace(raw) || hasOwn(raw, 'default') || hasOwn(raw, 'config'))) {
    const moduleValue = raw as ConfigModule & Record<string, unknown>;
    const hasDefault = hasOwn(moduleValue, 'default');
    const hasConfig = hasOwn(moduleValue, 'config');
    const unsupportedKeys = Object.keys(moduleValue).filter(
      (key) => key !== 'default' && key !== 'config' && key !== '__esModule',
    );

    if (unsupportedKeys.length > 0) {
      throw configError(configPath, `unsupported named export(s): ${unsupportedKeys.join(', ')}.`);
    }
    if (hasDefault && hasConfig) {
      throw configError(configPath, 'module must not export both default and named "config" configs.');
    }
    if (!hasDefault && !hasConfig) {
      throw configError(configPath, 'module must export a default config or named "config" object.');
    }

    exported = hasDefault ? moduleValue.default : moduleValue.config;
    if (hasConfig && typeof exported === 'function') {
      throw configError(configPath, 'named "config" export must be an object, not a factory function.');
    }
    if (hasDefault && typeof exported === 'function') {
      exported = exported();
    }
  }

  assertPlainConfigObject(exported, configPath);
  validateAccessRouterRuntimeConfig(exported, configPath);
  return exported;
}

export function loadAccessRouterRuntimeConfigSync(
  configPath: string,
  options: AccessRouterRuntimeConfigLoadOptions = {},
): AccessRouterRuntimeConfig {
  const fullPath = pathResolve(process.cwd(), configPath);
  return normalizeAccessRouterRuntimeConfigExport(createConfigJiti(options)(fullPath), configPath);
}
