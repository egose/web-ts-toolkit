import {
  ROOT_ROUTER_WATERMARK,
  ROUTER_WATERMARK,
  DEFAULT_MODEL_ROUTER_OPTIONS_WATERMARK,
  MODEL_ROUTER_OPTIONS_WATERMARK,
} from './constants';
import type { HookDefinition } from './constants';

const isConstructor = (prop: string | symbol) => prop === 'constructor';

const isFunction = (value: unknown): value is (...args: any[]) => any => typeof value === 'function';

export type MetadataKey = string | symbol;

export type MethodKey = string | symbol;

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

export const getMethodDescriptor = (obj: object, method: MethodKey) => {
  let current: object | null = obj;
  do {
    const descriptor = Reflect.getOwnPropertyDescriptor(current, method);
    if (descriptor) return descriptor;
  } while ((current = Reflect.getPrototypeOf(current)) && current !== Object.prototype);

  return undefined;
};

export const getMethodOwner = (obj: object, method: MethodKey) => {
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

export const getMethodMetadata = (obj: object, method: MethodKey, key: MetadataKey) => {
  const descriptor = getMethodDescriptor(obj, method);
  return descriptor ? getMetadata(descriptor.value, key) : null;
};

export const getMethodMetadataKeysStartWith = (obj: object, method: MethodKey, startKey: string) => {
  const descriptor = getMethodDescriptor(obj, method);
  return descriptor ? getMetadataKeysStartWith(descriptor.value, startKey) : [];
};

/**
 * Enumerate decorated method keys (string or symbol) in deterministic base-to-derived order.
 *
 * Contract:
 * - Symbol methods are supported via `Reflect.ownKeys`; they are never silently ignored.
 * - Inheritance order for distinct methods is base-to-derived so base normalization hooks
 *   run before child specialization. This is the execution order used for array hooks
 *   (`prepare`, `transform`, `afterPersist`, `decorate`, `decorateAll`, `validate` chains).
 * - Overridden methods replace the base definition: a key present on a derived prototype
 *   suppresses the same key on any ancestor and is yielded at the derived level (where
 *   the effective hook and parameter metadata live). This avoids stale base metadata.
 * - Property inheritance (`getOwnMetadataListFromPrototypeChain`) remains base-to-derived
 *   with child replacement for option properties and is independent of this method order.
 */
export function* getAllMethodNames(obj: object): IterableIterator<MethodKey> {
  const chain: object[] = [];
  let current: object | null = obj;
  while (current && current !== Object.prototype) {
    chain.unshift(current);
    current = Reflect.getPrototypeOf(current) as object | null;
  }

  const ownerMap = new Map<MethodKey, object>();
  for (let i = chain.length - 1; i >= 0; i--) {
    const proto = chain[i];
    for (const key of Reflect.ownKeys(proto)) {
      if (ownerMap.has(key)) continue;
      if (isConstructor(key)) continue;
      ownerMap.set(key, proto);
    }
  }

  const yielded = new Set<MethodKey>();
  for (const proto of chain) {
    for (const key of Reflect.ownKeys(proto)) {
      if (yielded.has(key)) continue;
      if (ownerMap.get(key) !== proto) continue;
      if (isConstructor(key)) continue;
      const descriptor = Reflect.getOwnPropertyDescriptor(proto, key);
      if (!descriptor) continue;
      if (descriptor.get || descriptor.set) continue;
      const value = descriptor.value;
      if (!isFunction(value)) continue;
      yielded.add(key);
      yield key;
    }
  }
}

export const isRootRouter = (obj: object) => !!getOwnMetadata(obj, ROOT_ROUTER_WATERMARK);

export const isModelRouter = (obj: object) => !!getOwnMetadata(obj, ROUTER_WATERMARK);

export const isDefaultModelRouterOptions = (obj: object) =>
  !!getOwnMetadata(obj, DEFAULT_MODEL_ROUTER_OPTIONS_WATERMARK);

export const isModelRouterOptions = (obj: object) => !!getOwnMetadata(obj, MODEL_ROUTER_OPTIONS_WATERMARK);

export const isHookMethod = (obj: object, method: MethodKey, hook: HookDefinition) =>
  !!getMethodMetadata(obj, method, hook.watermark);
