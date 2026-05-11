import mongoose from 'mongoose';
import get from 'lodash/get';
import keys from 'lodash/keys';
import { buildRefs, buildSubPaths } from './helpers';

const modelRefs: Record<string, any> = {};
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
  // @ts-ignore
  modelRefs[modelName] = buildRefs(schema.tree);
  // @ts-ignore
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
