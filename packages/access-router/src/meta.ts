import { defaultRuntime, type AccessRuntime } from './runtime';
import { getActiveRuntime } from './runtime-context';
import type { SchemaType } from 'mongoose';

const getRuntime = () => getActiveRuntime() ?? defaultRuntime;

export const ensureModelMeta = (modelName: string) => {
  getRuntime().ensureModelMeta(modelName);
};

export const getModelRef = (
  modelName: string,
  refPath: string,
  runtime: AccessRuntime = getRuntime(),
): string | null => {
  const direct = runtime.getModelRef(modelName, refPath);
  if (direct) return direct;
  // VIRT-05 dotted through embedded arrays (e.g. `contacts.friend`): the
  // top-level `buildRefs` map does not always retain nested array-subdocument
  // refs. Resolve via the live Mongoose schema path as a fallback (supports
  // `DocumentArray` leaf `ref`/`caster` without inventing a recursive
  // populate API). Returns null when no string ref is found.
  if (!refPath.includes('.')) return null;
  try {
    const instance = (runtime as unknown as { getModelInstance?: (n: string) => unknown }).getModelInstance?.(
      modelName,
    ) as unknown as { schema?: { path?: (p: string) => unknown } } | null;
    const schemaPath = instance?.schema?.path?.(refPath) as
      | (SchemaType & { $embeddedSchemaType?: SchemaType; embeddedSchemaType?: SchemaType; caster?: SchemaType })
      | undefined;
    const element = schemaPath?.$embeddedSchemaType ?? schemaPath?.embeddedSchemaType ?? schemaPath?.caster;
    const ref = schemaPath?.options?.ref ?? element?.options?.ref ?? null;
    return typeof ref === 'string' && ref.length > 0 ? ref : null;
  } catch {
    return null;
  }
};

export const getModelSub = (modelName: string): string[] => {
  return getRuntime().getModelSub(modelName);
};
