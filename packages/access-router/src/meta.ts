import { defaultRuntime, type AccessRuntime } from './runtime';
import { getActiveRuntime } from './runtime-context';
import type { Model, SchemaType } from 'mongoose';

type ReferenceType = SchemaType & {
  $embeddedSchemaType?: ReferenceType;
  embeddedSchemaType?: ReferenceType;
  caster?: ReferenceType;
};

const getRuntime = () => getActiveRuntime() ?? defaultRuntime;

export const ensureModelMeta = (modelName: string) => {
  getRuntime().ensureModelMeta(modelName);
};

/** Read the actual schema ref, including current Mongoose array element metadata. */
export const getModelReference = (modelName: string, refPath: string, runtime: AccessRuntime = getRuntime()) => {
  const instance = runtime.getModelInstance(modelName);
  let type = instance?.schema.path(refPath) as ReferenceType | undefined;
  const result: { ref?: string | Model<unknown> | ((...args: never[]) => unknown); refPath?: unknown } = {};
  // Ordinary Mongoose population also supports nested reference arrays. Their
  // adapter fallback must bind the leaf model just as the 1D batch path does.
  while (type) {
    result.ref ??= type.options?.ref;
    result.refPath ??= type.options?.refPath;
    if (type.instance !== 'Array') break;
    type = type.$embeddedSchemaType ?? type.embeddedSchemaType ?? type.caster;
  }
  return result;
};

export const getModelRef = (
  modelName: string,
  refPath: string,
  runtime: AccessRuntime = getRuntime(),
): string | null => {
  const { ref } = getModelReference(modelName, refPath, runtime);
  if (typeof ref === 'string') return ref || null;
  return typeof ref === 'function' && 'modelName' in ref && typeof ref.modelName === 'string' ? ref.modelName : null;
};

export const getModelSub = (modelName: string): string[] => {
  return getRuntime().getModelSub(modelName);
};
