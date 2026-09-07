import { assign, get, isPlainObject, set } from '@web-ts-toolkit/utils';

type PropertyPath = string | number | Array<string | number>;

const toPath = (key: PropertyPath): Array<string | number> => {
  if (Array.isArray(key)) return key;
  return typeof key === 'string' ? key.split('.') : [key];
};

const cloneConfigValue = <T>(value: T): T => {
  if (Array.isArray(value)) {
    return value.map((item) => cloneConfigValue(item)) as T;
  }

  if (!value || typeof value !== 'object') {
    return value;
  }

  if (Object.getPrototypeOf(value) !== Object.prototype) {
    return value;
  }

  return Object.fromEntries(
    Object.entries(value as Record<string, unknown>).map(([entryKey, entryValue]) => [
      entryKey,
      cloneConfigValue(entryValue),
    ]),
  ) as T;
};

const cloneForRead = <T>(value: T): T => {
  if (Array.isArray(value)) {
    if (Object.isFrozen(value)) {
      return value;
    }
    return value.map((item) => cloneForRead(item)) as T;
  }

  if (!value || typeof value !== 'object') {
    return value;
  }

  if (Object.getPrototypeOf(value) !== Object.prototype) {
    return value;
  }

  if (Object.isFrozen(value)) {
    return value;
  }

  return Object.fromEntries(
    Object.entries(value as Record<string, unknown>).map(([entryKey, entryValue]) => [
      entryKey,
      cloneForRead(entryValue),
    ]),
  ) as T;
};

const freezeConfigValue = <T>(value: T): T => {
  if (!value || typeof value !== 'object') {
    return value;
  }

  if (Object.isFrozen(value)) {
    return value;
  }

  if (Array.isArray(value) || Object.getPrototypeOf(value) === Object.prototype) {
    for (const nestedValue of Object.values(value as Record<string, unknown>)) {
      freezeConfigValue(nestedValue);
    }

    return Object.freeze(value);
  }

  return value;
};

const cloneAndFreezeForStore = <T>(value: T): T => freezeConfigValue(cloneForRead(value));

export const cloneOptionsSnapshot = <T>(value: T): T => freezeConfigValue(cloneForRead(value));

export const getNestedOption = <T extends object, K extends keyof T>(
  manager: OptionsManager<object, T>,
  key: K | string,
  defaultValue?: T[K],
): unknown => {
  const keys = String(key).split('.');
  if (keys.length === 1) {
    return manager.get(key, defaultValue);
  }

  let option: unknown = manager.get(key, undefined);
  if (option !== undefined) {
    return option;
  }

  const parentKey = keys.slice(0, -1).join('.');
  option = manager.get(`${parentKey}.default`, undefined);

  if (option === undefined) {
    option = manager.get(parentKey, defaultValue);
  }

  return option;
};

export class OptionsManager<T1 extends object, T2 extends object> {
  private readonly defaultOptions: T1;
  private readonly preserveKeys: Set<string>;
  private currentOptions: T1;
  private listeners: Record<string, (value: unknown, key: string, target: T1, oldValue: unknown) => void>;

  constructor(defaultOptions: T1, options: { preserveKeys?: string[] } = {}) {
    this.defaultOptions = defaultOptions;
    this.preserveKeys = new Set(options.preserveKeys ?? []);
    this.listeners = {};
    const _this = this;

    this.currentOptions = new Proxy({} as T1, {
      set(target, key: string | symbol, value: unknown): boolean {
        const keystr = String(key);
        const oldvalue = (target as Record<string, unknown>)[keystr];
        (target as Record<string, unknown>)[keystr] = value;
        _this.listeners[keystr] && _this.listeners[keystr].call(_this, value, keystr, target, oldvalue);
        return true;
      },
    });
  }

  build() {
    this.assign(this.defaultOptions);
    return this;
  }

  get<K extends keyof T2>(key: K | string, defaultValue?: T2[K]) {
    return get(this.currentOptions, key as PropertyPath, defaultValue);
  }

  set<K extends keyof T2>(key: K | string, value: T2[K]) {
    const path = toPath(key as PropertyPath);
    if (path.length <= 1) {
      // ARH-11: store an immutable snapshot created once on assignment. Frozen
      // plain values are safe to share, so later reads reuse them without
      // recopying every stored payload. Function/model identities are preserved
      // because clone helpers return non-plain values by reference.
      set(this.currentOptions, path, this.preserveKeys.has(String(path[0])) ? value : cloneAndFreezeForStore(value));
      return;
    }

    const [rootKey, ...nestedPath] = path;
    const currentRoot = get(this.currentOptions, [rootKey] as PropertyPath, undefined);
    const baseRoot = isPlainObject(currentRoot) ? currentRoot : {};
    // Copy-on-write: always deep-clone the stored (possibly frozen) root into a
    // mutable copy so in-flight readers keep the previous frozen version.
    const nextRoot = cloneConfigValue(baseRoot as object);
    set(nextRoot as object, nestedPath, cloneForRead(value));
    set(this.currentOptions, [rootKey] as PropertyPath, freezeConfigValue(nextRoot));
  }

  fetch() {
    // ARH-11: reuse frozen internal subtrees instead of cloning all records per
    // request. Only the top-level wrapper and unfrozen values are copied.
    const cloned = cloneForRead(this.currentOptions) as Record<string, unknown>;
    for (const key of this.preserveKeys) {
      if (key in (this.currentOptions as Record<string, unknown>)) {
        cloned[key] = (this.currentOptions as Record<string, unknown>)[key];
      }
    }

    return freezeConfigValue(cloned) as T1;
  }

  assign(options: T1) {
    // ARH-11: clone once on assignment (reusing already-frozen input subtrees),
    // then replace top-level keys. PreserveKeys are assigned into the unfrozen
    // clone first and the result is frozen afterwards (same order as fetch), so
    // writing a preserved reference such as `logger` never writes into a frozen
    // object. Replacement keeps in-flight fetch holders on their previous
    // coherent version.
    const cloned = cloneForRead(options) as Record<string, unknown>;
    for (const key of this.preserveKeys) {
      if (key in (options as Record<string, unknown>)) {
        cloned[key] = (options as Record<string, unknown>)[key];
      }
    }

    assign(this.currentOptions, freezeConfigValue(cloned) as T1);
  }

  onchange<K extends keyof T1>(
    key: K | string,
    func: (value: unknown, key: string, target: T1, oldValue: unknown) => void,
  ) {
    set(this.listeners, key as PropertyPath, func);
    return this;
  }

  snapshot(): T1 {
    const cloned = cloneForRead(this.currentOptions) as Record<string, unknown>;
    for (const key of this.preserveKeys) {
      if (key in (this.currentOptions as Record<string, unknown>)) {
        cloned[key] = (this.currentOptions as Record<string, unknown>)[key];
      }
    }
    return cloned as T1;
  }

  restore(snapshot: T1): void {
    const snap = snapshot as Record<string, unknown>;
    const current = this.currentOptions as Record<string, unknown>;
    for (const key of Object.keys(current)) {
      if (!(key in snap)) {
        delete current[key];
      }
    }
    const cloned = cloneForRead(snap) as Record<string, unknown>;
    for (const key of this.preserveKeys) {
      if (key in snap) {
        cloned[key] = snap[key];
      }
    }
    assign(current as T1, freezeConfigValue(cloned) as T1);
  }
}
