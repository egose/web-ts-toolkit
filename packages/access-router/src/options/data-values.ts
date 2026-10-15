import { types } from 'node:util';

// This codec is deliberately data-only. General options can contain hooks, models,
// validators and runtime handles whose identity must not be copied or interpreted.
const typedArrays = [
  Int8Array,
  Uint8Array,
  Uint8ClampedArray,
  Int16Array,
  Uint16Array,
  Int32Array,
  Uint32Array,
  Float32Array,
  Float64Array,
  BigInt64Array,
  BigUint64Array,
];

const unsupported = (path: string, reason: string): never => {
  throw new TypeError(`Unsupported data value at ${path}: ${reason}`);
};

const isPlainContainer = (value: object): boolean => {
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null || prototype === Array.prototype;
};

const defineValue = (target: object, key: string, value: unknown) => {
  Object.defineProperty(target, key, { value, enumerable: true, configurable: true, writable: true });
};

const assertNativeProperties = (value: object, path: string, allowed: (key: string) => boolean = () => false) => {
  for (const key of Reflect.ownKeys(value)) {
    if (typeof key !== 'string' || !allowed(key)) unsupported(path, 'custom native properties are not supported');
  }
};

const copyBytes = (buffer: ArrayBufferLike, path: string, start = 0, end?: number): ArrayBuffer => {
  if (!types.isArrayBuffer(buffer) || Object.getPrototypeOf(buffer) !== ArrayBuffer.prototype) {
    return unsupported(path, 'binary storage must be a fixed, non-shared ArrayBuffer');
  }
  assertNativeProperties(buffer, path);
  if ((buffer as ArrayBuffer & { resizable?: boolean }).resizable) {
    return unsupported(path, 'resizable binary storage is not supported');
  }
  try {
    // Also rejects detached buffers (whose byteLength alone can look like zero).
    return ArrayBuffer.prototype.slice.call(buffer, start, end);
  } catch {
    return unsupported(path, 'detached binary storage is not supported');
  }
};

function copyValue<T>(input: T, freezePlain: boolean, rootPath: string): T {
  const copies = new WeakMap<object, object>();
  const active = new WeakSet<object>();

  const visit = (value: unknown, path: string): unknown => {
    if (typeof value === 'function' || typeof value === 'symbol') {
      return unsupported(path, `${typeof value} values are not supported`);
    }
    if (value === null || typeof value !== 'object') return value;
    if (types.isProxy(value)) return unsupported(path, 'proxies are not supported');
    if (active.has(value)) return unsupported(path, 'cycles are not supported');
    const previous = copies.get(value);
    if (previous) return previous;

    active.add(value);
    try {
      const prototype = Object.getPrototypeOf(value);
      if (isPlainContainer(value)) {
        const array = Array.isArray(value);
        if (array && prototype !== Array.prototype) return unsupported(path, 'unsupported array prototype');
        // An object merely inheriting Array.prototype is not an ordinary array.
        if (prototype === Array.prototype && !array) return unsupported(path, 'unsupported object prototype');
        if (Object.getOwnPropertySymbols(value).length) return unsupported(path, 'symbol keys are not supported');
        const output = array ? new Array(value.length) : Object.create(prototype);
        copies.set(value, output);
        for (const key of Object.keys(value)) {
          const childPath = array ? `${path}[${key}]` : `${path}.${key}`;
          // Materialize own enumerable accessors once; never retain their closures.
          defineValue(output, key, visit((value as Record<string, unknown>)[key], childPath));
        }
        return freezePlain ? Object.freeze(output) : output;
      }

      let output: object;
      if (prototype === Date.prototype && types.isDate(value)) {
        assertNativeProperties(value, path);
        output = new Date(Date.prototype.getTime.call(value));
      } else if (prototype === Map.prototype && types.isMap(value)) {
        assertNativeProperties(value, path);
        const map = new Map();
        copies.set(value, map);
        let index = 0;
        for (const [key, entry] of Map.prototype.entries.call(value)) {
          map.set(visit(key, `${path}.<key:${index}>`), visit(entry, `${path}.<value:${index}>`));
          index += 1;
        }
        output = map;
      } else if (prototype === Set.prototype && types.isSet(value)) {
        assertNativeProperties(value, path);
        const set = new Set();
        copies.set(value, set);
        let index = 0;
        for (const entry of Set.prototype.values.call(value)) {
          set.add(visit(entry, `${path}.<entry:${index}>`));
          index += 1;
        }
        output = set;
      } else if (prototype === RegExp.prototype && types.isRegExp(value)) {
        assertNativeProperties(value, path, (key) => key === 'lastIndex');
        const regexp = value as RegExp;
        if (typeof regexp.lastIndex !== 'number') return unsupported(path, 'RegExp.lastIndex must be a number');
        const copy = new RegExp(regexp.source, regexp.flags);
        copy.lastIndex = regexp.lastIndex;
        output = copy;
      } else if (prototype === ArrayBuffer.prototype) {
        output = copyBytes(value as ArrayBuffer, path);
      } else if (ArrayBuffer.isView(value)) {
        const Type = typedArrays.find((candidate) => candidate.prototype === prototype);
        const buffer = prototype === Buffer.prototype && Buffer.isBuffer(value);
        const dataView = prototype === DataView.prototype;
        if (!Type && !buffer && !dataView) return unsupported(path, 'unsupported binary view prototype');
        assertNativeProperties(
          value,
          path,
          (key) => !dataView && /^(0|[1-9]\d*)$/.test(key) && Number(key) < (value as Uint8Array).length,
        );
        let bytes: ArrayBuffer;
        try {
          bytes = copyBytes(value.buffer, path, value.byteOffset, value.byteOffset + value.byteLength);
        } catch (error) {
          if (error instanceof TypeError && error.message.startsWith('Unsupported data value at ')) throw error;
          return unsupported(path, 'detached binary storage is not supported');
        }
        // Use an exact, independent backing buffer, including for Node Buffer.
        // Buffer.from(otherBuffer) could allocate from a pool shared with storage.
        output = buffer ? Buffer.from(bytes) : dataView ? new DataView(bytes) : new Type!(bytes);
      } else {
        return unsupported(path, 'unsupported object prototype');
      }
      copies.set(value, output);
      return output;
    } finally {
      active.delete(value);
    }
  };

  return visit(input, rootPath) as T;
}

/** Detach a final selection, or a native getter value, into caller-owned mutable data. */
export const copyDataValue = <T>(value: T): T => copyValue(value, false, 'data');

// The exposed view never contains an owned mutable native. Plain branches without
// natives can be shared; only native-bearing ancestors need another frozen wrapper.
function exposeSnapshot<T extends object>(root: T): T {
  const views = new WeakMap<object, object>();
  const visit = (value: object): object => {
    const previous = views.get(value);
    if (previous) return previous;
    let exposed: object | undefined;
    const keys = Object.keys(value);
    const mutableView = () => {
      if (!exposed) {
        exposed = Array.isArray(value) ? new Array(value.length) : Object.create(Object.getPrototypeOf(value));
        for (const key of keys) defineValue(exposed!, key, (value as Record<string, unknown>)[key]);
      }
      return exposed!;
    };
    for (const key of keys) {
      const child = (value as Record<string, unknown>)[key];
      if (child === null || typeof child !== 'object') continue;
      if (isPlainContainer(child)) {
        const view = visit(child);
        if (view !== child) defineValue(mutableView(), key, view);
      } else {
        Object.defineProperty(mutableView(), key, {
          enumerable: true,
          configurable: true,
          get: () => copyDataValue(child),
        });
      }
    }
    const view = exposed ? Object.freeze(exposed) : value;
    views.set(value, view);
    return view;
  };
  return visit(root) as T;
}

export const emptyDataSnapshot: readonly never[] = Object.freeze([] as never[]);
const ownedSnapshots = new WeakMap<object, readonly unknown[]>([[emptyDataSnapshot, emptyDataSnapshot]]);

/** Admission is once per assignment; a known safe snapshot may be reused on restore. */
export function createDataSnapshot<T>(data: T[] | undefined): T[] | undefined {
  if (data === undefined) return undefined;
  if (!Array.isArray(data) || types.isProxy(data) || Object.getPrototypeOf(data) !== Array.prototype) {
    return unsupported('data', 'expected an ordinary array or undefined');
  }
  if (ownedSnapshots.has(data)) return data;
  const owned = copyValue(data, true, 'data');
  const exposed = exposeSnapshot(owned);
  ownedSnapshots.set(exposed, owned);
  return exposed;
}

/** Package-private capture: queries read the owned version, not copy-on-access getters. */
export function getOwnedDataSnapshot<T>(snapshot: readonly T[] = emptyDataSnapshot): readonly T[] {
  const owned = ownedSnapshots.get(snapshot);
  if (!owned) throw new TypeError('DataService requires an admitted data snapshot');
  return owned as readonly T[];
}
