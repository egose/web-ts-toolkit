import {
  ROOT_ROUTER_WATERMARK,
  ROUTER_WATERMARK,
  DEFAULT_MODEL_ROUTER_OPTIONS_WATERMARK,
  MODEL_ROUTER_OPTIONS_WATERMARK,
  GLOBAL_PERMISSIONS_WATERMARK,
  DOC_PERMISSIONS_WATERMARK,
  ROUTE_GUARD_WATERMARK,
  BASE_FILTER_WATERMARK,
  VALIDATE_WATERMARK,
  PREPARE_WATERMARK,
  TRANSFORM_WATERMARK,
  DECORATE_WATERMARK,
  DECORATE_ALL_WATERMARK,
  IDENTIFIER_WATERMARK,
  OVERRIDE_FILTER_WATERMARK,
  AFTER_PERSIST_WATERMARK,
  BEFORE_DELETE_WATERMARK,
  AFTER_DELETE_WATERMARK,
} from './constants';

const isConstructor = (prop: string) => prop === 'constructor';

const isFunction = (value: unknown): value is (...args: any[]) => any => typeof value === 'function';

export const getMetadata = (obj: object, key: string) => {
  return Reflect.getMetadata(key, obj) ?? null;
};

export const getMetadataKeysStartWith = (obj: object, startKey: string) => {
  return Reflect.getMetadataKeys(obj).filter((key: string) => key.startsWith(startKey));
};

export const getMethodDescriptor = (obj: object, method: string) => {
  let current: object | null = obj;
  do {
    const descriptor = Reflect.getOwnPropertyDescriptor(current, method);
    if (descriptor) return descriptor;
  } while ((current = Reflect.getPrototypeOf(current)) && current !== Object.prototype);

  return undefined;
};

export const getMethodMetadata = (obj: object, method: string, key: string) => {
  const descriptor = getMethodDescriptor(obj, method);
  return descriptor ? getMetadata(descriptor.value, key) : null;
};

export const getMethodMetadataKeysStartWith = (obj: object, method: string, startKey: string) => {
  const descriptor = getMethodDescriptor(obj, method);
  return descriptor ? getMetadataKeysStartWith(descriptor.value, startKey) : [];
};

export function* getAllMethodNames(obj: object): IterableIterator<string> {
  const seen = new Set<string>();
  const isMethod = (prop: string) => {
    if (seen.has(prop)) return false;
    const descriptor = Object.getOwnPropertyDescriptor(obj, prop);
    if (descriptor?.set || descriptor?.get) return false;
    return !isConstructor(prop) && isFunction((obj as any)[prop]);
  };
  do {
    for (const name of Object.getOwnPropertyNames(obj).filter(isMethod)) {
      seen.add(name);
      yield name;
    }
  } while ((obj = Reflect.getPrototypeOf(obj)) && obj !== Object.prototype);
}

export const isRootRouter = (obj: object) => !!getMetadata(obj, ROOT_ROUTER_WATERMARK);

export const isModelRouter = (obj: object) => !!getMetadata(obj, ROUTER_WATERMARK);

export const isDefaultModelRouterOptions = (obj: object) => !!getMetadata(obj, DEFAULT_MODEL_ROUTER_OPTIONS_WATERMARK);

export const isModelRouterOptions = (obj: object) => !!getMetadata(obj, MODEL_ROUTER_OPTIONS_WATERMARK);

export const isGlobalPermissionsMethod = (obj: object, method: string) =>
  !!getMethodMetadata(obj, method, GLOBAL_PERMISSIONS_WATERMARK);

export const isDocPermissionsMethod = (obj: object, method: string) =>
  !!getMethodMetadata(obj, method, DOC_PERMISSIONS_WATERMARK);

export const isBaseFilterMethod = (obj: object, method: string) =>
  !!getMethodMetadata(obj, method, BASE_FILTER_WATERMARK);

export const isOverrideFilterMethod = (obj: object, method: string) =>
  !!getMethodMetadata(obj, method, OVERRIDE_FILTER_WATERMARK);

export const isValidateMethod = (obj: object, method: string) => !!getMethodMetadata(obj, method, VALIDATE_WATERMARK);

export const isPrepareMethod = (obj: object, method: string) => !!getMethodMetadata(obj, method, PREPARE_WATERMARK);

export const isTransformMethod = (obj: object, method: string) => !!getMethodMetadata(obj, method, TRANSFORM_WATERMARK);

export const isAfterPersistMethod = (obj: object, method: string) =>
  !!getMethodMetadata(obj, method, AFTER_PERSIST_WATERMARK);

export const isDecorateMethod = (obj: object, method: string) => !!getMethodMetadata(obj, method, DECORATE_WATERMARK);

export const isDecorateAllMethod = (obj: object, method: string) =>
  !!getMethodMetadata(obj, method, DECORATE_ALL_WATERMARK);

export const isRouteGuardMethod = (obj: object, method: string) =>
  !!getMethodMetadata(obj, method, ROUTE_GUARD_WATERMARK);

export const isIdentifierMethod = (obj: object, method: string) =>
  !!getMethodMetadata(obj, method, IDENTIFIER_WATERMARK);

export const isBeforeDeleteMethod = (obj: object, method: string) =>
  !!getMethodMetadata(obj, method, BEFORE_DELETE_WATERMARK);

export const isAfterDeleteMethod = (obj: object, method: string) =>
  !!getMethodMetadata(obj, method, AFTER_DELETE_WATERMARK);
