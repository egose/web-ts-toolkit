import mongoose from 'mongoose';
import { get, keys } from '@web-ts-toolkit/utils';
import { buildRefs, buildSubPaths } from './helpers';

const modelRefs: Record<string, Record<string, unknown>> = {};
const modelSubs: { [key: string]: string[] } = {};
const modelAtts: Record<string, string[]> = {};

export const ensureModelMeta = (modelName: string) => {
  if (modelName in modelRefs && modelName in modelSubs && modelName in modelAtts) {
    return;
  }

  const model = mongoose.models[modelName];
  if (!model) {
    modelRefs[modelName] = modelRefs[modelName] ?? {};
    modelSubs[modelName] = modelSubs[modelName] ?? [];
    modelAtts[modelName] = modelAtts[modelName] ?? [];
    return;
  }

  const schema = model.schema;
  modelRefs[modelName] = buildRefs(schema.tree);
  modelSubs[modelName] = buildSubPaths(schema.tree);
  modelAtts[modelName] = keys(schema.obj);
};

export const getModelRef = (modelName: string, refPath: string) => {
  ensureModelMeta(modelName);
  return get(modelRefs, `${modelName}.${refPath}`, null);
};

export const getModelSub = (modelName: string) => {
  ensureModelMeta(modelName);
  return get(modelSubs, modelName, []) as string[];
};

export const getModelAtt = (modelName: string) => {
  ensureModelMeta(modelName);
  return get(modelAtts, modelName, []);
};
