import { ModelRouterOptions, ExtendedModelRouterOptions } from '../interfaces';
import { defaultRuntime } from '../runtime';
import { getActiveRuntime, getRuntimeForModelName } from '../runtime-context';

const getRuntime = (modelName: string) => getRuntimeForModelName(modelName) ?? getActiveRuntime() ?? defaultRuntime;

export const setModelOptions = <TModel = unknown>(modelName: string, options: ModelRouterOptions<TModel>) => {
  getRuntime(modelName).setModelOptions(modelName, options);
};

export const setModelOption = <K extends keyof ExtendedModelRouterOptions<TModel>, TModel = unknown>(
  modelName: string,
  key: K,
  value: ExtendedModelRouterOptions<TModel>[K],
) => {
  getRuntime(modelName).setModelOption(modelName, key, value);
};

export const getModelOptions = <TModel = unknown>(modelName: string) => {
  return getRuntime(modelName).getModelOptions<TModel>(modelName);
};

export const getModelOption = <K extends keyof ExtendedModelRouterOptions<TModel>, TModel = unknown>(
  modelName: string,
  key: K | string,
  defaultValue?: ExtendedModelRouterOptions<TModel>[K],
) => {
  return getRuntime(modelName).getModelOption(modelName, key, defaultValue);
};

export const getExactModelOption = <K extends keyof ExtendedModelRouterOptions<TModel>, TModel = unknown>(
  modelName: string,
  key: K | string,
) => {
  return getRuntime(modelName).getExactModelOption(modelName, key);
};

export const getModelNames = () => {
  return (getActiveRuntime() ?? defaultRuntime).getModelNames();
};

export const getModelJsonSchema = (modelName: string) => {
  return getRuntime(modelName).getModelJsonSchema(modelName);
};
