import { defaultRuntime } from './runtime';
import { getActiveRuntime } from './runtime-context';

const getRuntime = () => getActiveRuntime() ?? defaultRuntime;

export const ensureModelMeta = (modelName: string) => {
  getRuntime().ensureModelMeta(modelName);
};

export const getModelRef = (modelName: string, refPath: string): string | null => {
  return getRuntime().getModelRef(modelName, refPath);
};

export const getModelSub = (modelName: string): string[] => {
  return getRuntime().getModelSub(modelName);
};
