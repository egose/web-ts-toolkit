import { defaultRuntime } from './runtime';
import { getActiveRuntime, getRuntimeForModelName } from './runtime-context';

const getRuntime = (modelName: string) => getRuntimeForModelName(modelName) ?? getActiveRuntime() ?? defaultRuntime;

export const ensureModelMeta = (modelName: string) => {
  getRuntime(modelName).ensureModelMeta(modelName);
};

export const getModelRef = (modelName: string, refPath: string) => {
  return getRuntime(modelName).getModelRef(modelName, refPath);
};

export const getModelSub = (modelName: string) => {
  return getRuntime(modelName).getModelSub(modelName);
};

export const getModelAtt = (modelName: string) => {
  return getRuntime(modelName).getModelAtt(modelName);
};
