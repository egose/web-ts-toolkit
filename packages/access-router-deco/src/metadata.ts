import {
  ROOT_ROUTER_WATERMARK,
  ROUTER_WATERMARK,
  DEFAULT_MODEL_ROUTER_OPTIONS_WATERMARK,
  MODEL_ROUTER_OPTIONS_WATERMARK,
  HOOK_DEFINITIONS,
  type HookDefinition,
  type HookDefinitionKey,
} from './constants';

const isConstructor = (prop: string) => prop === 'constructor';

const isFunction = (value: unknown): value is (...args: any[]) => any => typeof value === 'function';

export type MetadataKey = string | symbol;

export const getMetadata = (obj: object, key: MetadataKey) => {
  return Reflect.getMetadata(key, obj) ?? null;
};

export const getOwnMetadata = (obj: object, key: MetadataKey) => {
  return Reflect.getOwnMetadata(key, obj) ?? null;
};

export const getMetadataKeysStartWith = (obj: object, startKey: string) => {
  return Reflect.getMetadataKeys(obj).filter(
    (key): key is string => typeof key === 'string' && (key === startKey || key.startsWith(`${startKey}.`)),
  );
};

export const getMethodDescriptor = (obj: object, method: string) => {
  let current: object | null = obj;
  do {
    const descriptor = Reflect.getOwnPropertyDescriptor(current, method);
    if (descriptor) return descriptor;
  } while ((current = Reflect.getPrototypeOf(current)) && current !== Object.prototype);

  return undefined;
};

export const getMethodOwner = (obj: object, method: string) => {
  let current: object | null = obj;
  do {
    if (Reflect.getOwnPropertyDescriptor(current, method)) return current;
  } while ((current = Reflect.getPrototypeOf(current)) && current !== Object.prototype);

  return undefined;
};

export const getOwnMetadataListFromPrototypeChain = <T extends Record<string, unknown>>(
  obj: object,
  key: MetadataKey,
  dedupeKey: keyof T,
) => {
  const chain: object[] = [];
  let current: object | null = obj;
  do {
    chain.unshift(current);
  } while ((current = Reflect.getPrototypeOf(current)) && current !== Object.prototype);

  const merged = new Map<unknown, T>();
  for (const item of chain) {
    const metadata = Reflect.getOwnMetadata(key, item) as T[] | undefined;
    if (!metadata) continue;
    for (const entry of metadata) merged.set(entry[dedupeKey], entry);
  }

  return [...merged.values()];
};

export const getMethodMetadata = (obj: object, method: string, key: MetadataKey) => {
  const descriptor = getMethodDescriptor(obj, method);
  return descriptor ? getMetadata(descriptor.value, key) : null;
};

export const getMethodMetadataKeysStartWith = (obj: object, method: string, startKey: string) => {
  const descriptor = getMethodDescriptor(obj, method);
  return descriptor ? getMetadataKeysStartWith(descriptor.value, startKey) : [];
};

export function* getAllMethodNames(obj: object): IterableIterator<string> {
  const seen = new Set<string>();
  let current: object | null = obj;
  const isMethod = (prop: string) => {
    if (seen.has(prop)) return false;
    const descriptor = Object.getOwnPropertyDescriptor(current!, prop);
    if (descriptor?.set || descriptor?.get) return false;
    return !isConstructor(prop) && isFunction((current as any)[prop]);
  };
  do {
    for (const name of Object.getOwnPropertyNames(current).filter(isMethod)) {
      seen.add(name);
      yield name;
    }
  } while ((current = Reflect.getPrototypeOf(current)) && current !== Object.prototype);
}

export const isRootRouter = (obj: object) => !!getOwnMetadata(obj, ROOT_ROUTER_WATERMARK);

export const isModelRouter = (obj: object) => !!getOwnMetadata(obj, ROUTER_WATERMARK);

export const isDefaultModelRouterOptions = (obj: object) =>
  !!getOwnMetadata(obj, DEFAULT_MODEL_ROUTER_OPTIONS_WATERMARK);

export const isModelRouterOptions = (obj: object) => !!getOwnMetadata(obj, MODEL_ROUTER_OPTIONS_WATERMARK);

export const isHookMethod = (obj: object, method: string, hook: HookDefinition) =>
  !!getMethodMetadata(obj, method, hook.watermark);

const isHookDefinitionMethod = (hookKey: HookDefinitionKey) => (obj: object, method: string) =>
  isHookMethod(obj, method, HOOK_DEFINITIONS[hookKey]);

export const isGlobalPermissionsMethod = isHookDefinitionMethod('globalPermissions');

export const isDocPermissionsMethod = isHookDefinitionMethod('docPermissions');

export const isBaseFilterMethod = isHookDefinitionMethod('baseFilter');

export const isOverrideFilterMethod = isHookDefinitionMethod('overrideFilter');

export const isValidateMethod = isHookDefinitionMethod('validate');

export const isPrepareMethod = isHookDefinitionMethod('prepare');

export const isTransformMethod = isHookDefinitionMethod('transform');

export const isAfterPersistMethod = isHookDefinitionMethod('afterPersist');

export const isDecorateMethod = isHookDefinitionMethod('decorate');

export const isDecorateAllMethod = isHookDefinitionMethod('decorateAll');

export const isRouteGuardMethod = isHookDefinitionMethod('routeGuard');

export const isIdentifierMethod = isHookDefinitionMethod('identifier');

export const isBeforeDeleteMethod = isHookDefinitionMethod('beforeDelete');

export const isAfterDeleteMethod = isHookDefinitionMethod('afterDelete');
