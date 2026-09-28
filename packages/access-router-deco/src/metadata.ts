import {
  ROOT_ROUTER_WATERMARK,
  ROUTER_WATERMARK,
  DEFAULT_MODEL_ROUTER_OPTIONS_WATERMARK,
  MODEL_ROUTER_OPTIONS_WATERMARK,
  METHOD_METADATA,
  OPTIONS_METADATA,
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

const filterMetadataKeysStartWith = (keys: unknown[], startKey: string) =>
  keys.filter((key): key is string => typeof key === 'string' && (key === startKey || key.startsWith(`${startKey}.`)));

export const getMetadataKeysStartWith = (obj: object, startKey: string) => {
  return filterMetadataKeysStartWith(Reflect.getMetadataKeys(obj), startKey);
};

const getMethodEntry = (obj: object, method: MethodKey) => {
  let current: object | null = obj;
  do {
    const descriptor = Reflect.getOwnPropertyDescriptor(current, method);
    if (descriptor) return { owner: current, descriptor };
  } while ((current = Reflect.getPrototypeOf(current)) && current !== Object.prototype);

  return undefined;
};

export const getMethodDescriptor = (obj: object, method: MethodKey) => getMethodEntry(obj, method)?.descriptor;

export const getMethodOwner = (obj: object, method: MethodKey) => getMethodEntry(obj, method)?.owner;

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
  const propertyKeys = new Map<unknown, unknown>();
  for (const item of chain) {
    const metadata = Reflect.getOwnMetadata(key, item) as T[] | undefined;
    if (!metadata) continue;
    for (const entry of metadata) {
      const identity = entry[dedupeKey];
      if (key === OPTIONS_METADATA) {
        const previousKey = propertyKeys.get(entry.propertyKey);
        if (propertyKeys.has(entry.propertyKey)) merged.delete(previousKey);
        const replaced = merged.get(identity);
        if (replaced) propertyKeys.delete(replaced.propertyKey);
        propertyKeys.set(entry.propertyKey, identity);
      }
      merged.set(identity, entry);
    }
  }

  return [...merged.values()];
};

/** Own-member anchor: replacing a descriptor's function must not erase its declarations. */
export const defineMethodDeclarationMetadata = (owner: object, method: MethodKey, key: MetadataKey, value: unknown) => {
  let declaration = Reflect.getOwnMetadata(METHOD_METADATA, owner, method) as object | undefined;
  if (!declaration) {
    declaration = {};
    Reflect.defineMetadata(METHOD_METADATA, declaration, owner, method);
  }
  Reflect.defineMetadata(key, value, declaration);
};

/**
 * Read only the effective owner's declarations, never an overridden ancestor's.
 * The caller supplies the resolved function so registration can reuse its one
 * owner traversal. Function metadata remains readable for older package copies.
 */
export const getMethodMetadataReader = (owner: object, method: MethodKey, fn: Function) => {
  const declaration = Reflect.getOwnMetadata(METHOD_METADATA, owner, method) as object | undefined;
  return {
    get: (key: MetadataKey) => (declaration ? getOwnMetadata(declaration, key) : null) ?? getMetadata(fn, key),
    keysStartWith: (startKey: string) => [
      ...new Set([
        ...(declaration ? filterMetadataKeysStartWith(Reflect.getOwnMetadataKeys(declaration), startKey) : []),
        ...getMetadataKeysStartWith(fn, startKey),
      ]),
    ],
  };
};

const getEffectiveMethodMetadataReader = (obj: object, method: MethodKey) => {
  const entry = getMethodEntry(obj, method);
  return entry && isFunction(entry.descriptor.value)
    ? getMethodMetadataReader(entry.owner, method, entry.descriptor.value)
    : null;
};

export const getMethodMetadata = (obj: object, method: MethodKey, key: MetadataKey) => {
  return getEffectiveMethodMetadataReader(obj, method)?.get(key) ?? null;
};

export const getMethodMetadataKeysStartWith = (obj: object, method: MethodKey, startKey: string) => {
  return getEffectiveMethodMetadataReader(obj, method)?.keysStartWith(startKey) ?? [];
};

/**
 * Enumerate decorated method keys (string or symbol) in deterministic base-to-derived order.
 *
 * Contract:
 * - Symbol methods are supported via `Reflect.ownKeys`; they are never silently ignored.
 * - Inheritance order for distinct methods is base-to-derived so base normalization hooks
 *   run before child specialization. This is the execution order used for composing
 *   array hooks (`prepare`, `transform`, `afterPersist`, `decorate`, `decorateAll`).
 *   `validate` is not a chain: duplicate `validate.<op>` entries are rejected by the
 *   factory duplicate policy, so validators never compose across base/child.
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
