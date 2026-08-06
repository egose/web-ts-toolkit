import mongoose from 'mongoose';
import { ModelRouterOptions, ExtendedModelRouterOptions } from '../interfaces';
import { defaultRuntime } from '../runtime';
import { getActiveRuntime } from '../runtime-context';

const getRuntime = () => getActiveRuntime() ?? defaultRuntime;

export const setModelOptions = <TModel = unknown>(modelName: string, options: ModelRouterOptions<TModel>) => {
  getRuntime().setModelOptions(modelName, options);
};

export const setModelOption = <K extends keyof ExtendedModelRouterOptions<TModel>, TModel = unknown>(
  modelName: string,
  key: K,
  value: ExtendedModelRouterOptions<TModel>[K],
) => {
  getRuntime().setModelOption(modelName, key, value);
};

export const getModelOptions = <TModel = unknown>(modelName: string) => {
  return getRuntime().getModelOptions<TModel>(modelName);
};

export const getModelOption = <K extends keyof ExtendedModelRouterOptions<TModel>, TModel = unknown>(
  modelName: string,
  key: K | string,
  defaultValue?: ExtendedModelRouterOptions<TModel>[K],
) => {
  return getRuntime().getModelOption(modelName, key, defaultValue);
};

export const getExactModelOption = <K extends keyof ExtendedModelRouterOptions<TModel>, TModel = unknown>(
  modelName: string,
  key: K | string,
) => {
  return getRuntime().getExactModelOption(modelName, key);
};

export const getModelNames = () => {
  return (getActiveRuntime() ?? defaultRuntime).getModelNames();
};

export const getModelJsonSchema = (modelName: string) => {
  return getRuntime().getModelJsonSchema(modelName);
};

export const registerModelInstance = (modelName: string, model: mongoose.Model<unknown>): void => {
  getRuntime().registerModelInstance(modelName, model);
};

export const hasModelInstance = (modelName: string): boolean => {
  return getRuntime().hasModelInstance(modelName);
};

export const getModelInstance = (modelName: string): mongoose.Model<unknown> | null => {
  return getRuntime().getModelInstance(modelName);
};
