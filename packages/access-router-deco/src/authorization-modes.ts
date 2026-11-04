/** Private decorator preflight. Never deep-import access-router's private runtime modules. */
import { types } from 'node:util';
import type { AuthorizationMode } from '@web-ts-toolkit/access-router';

const retired = new Set([
  'unsafeSkipListDocumentSnapshotChecks',
  'unsafeSkipReadDocumentSnapshotChecks',
  'unsafeSkipListOutputSnapshotChecks',
  'unsafeSkipReadOutputSnapshotChecks',
  'unsafeSkipListNestedDocumentSnapshotChecks',
  'unsafeSkipReadNestedDocumentSnapshotChecks',
  'unsafeSkipListInitialOutputSnapshotCopy',
  'unsafeSkipReadInitialOutputSnapshotCopy',
  'unsafeUseListAuthorizationFastPath',
  'unsafeUseReadAuthorizationFastPath',
]);
const modes = new Set([
  'readAuthorizationMode',
  'listAuthorizationMode',
  'createAuthorizationMode',
  'updateAuthorizationMode',
]);
const defaultBuckets = [
  'findOneArgs',
  'findOneOptions',
  'findByIdArgs',
  'findByIdOptions',
  'findArgs',
  'findOptions',
  'createArgs',
  'createOptions',
  'updateOneArgs',
  'updateOneOptions',
  'upsertOptions',
  'updateByIdArgs',
  'upsertArgs',
  'updateByIdOptions',
  'existsOptions',
  'publicListArgs',
  'publicListOptions',
  'publicCreateArgs',
  'publicCreateOptions',
  'publicReadArgs',
  'publicReadOptions',
  'publicUpdateArgs',
  'publicUpdateOptions',
];

export function assertNoProxyConfiguration(value: unknown): void {
  if (!value || (typeof value !== 'object' && typeof value !== 'function')) return;
  let depth = 0;
  for (let owner: object | null = value; owner; owner = Object.getPrototypeOf(owner)) {
    if (types.isProxy(owner)) throw new TypeError('Proxy authorization configuration/model is unsupported');
    if (depth++ > 100) throw new TypeError('Authorization configuration prototype depth exceeded');
  }
}

export function isAuthorizationModeKey(key: string): boolean {
  return modes.has(key);
}

export function validateAuthorizationModeKey(key: string, model: boolean): void {
  const root = key.split('.')[0];
  if (retired.has(root))
    throw new TypeError(
      `${root} was removed; migrate to readAuthorizationMode/listAuthorizationMode on server model/default-model options`,
    );
  if (modes.has(root)) {
    if (!model) throw new TypeError(`${root} is server model/default-model configuration only`);
    if (key !== root) throw new TypeError(`${root} is a scalar mode; dotted setters are unsupported`);
  }
}

export function validateAuthorizationModeValue(value: unknown): asserts value is AuthorizationMode | undefined {
  if (value !== undefined && value !== 'isolated' && value !== 'trusted')
    throw new TypeError(
      'Authorization mode must be the literal isolated or trusted, or undefined to restore inheritance',
    );
}

type Lane = 'model' | 'control' | 'defaults' | 'data' | 'policy' | 'policies';

function optionPath(key: string, descriptor: PropertyDescriptor): object {
  const parts = key.split('.');
  if (parts.length > 100) throw new TypeError('Authorization configuration dotted path exceeds structural limits');
  const root = {};
  let target = root;
  for (const part of parts.slice(0, -1)) {
    const child = {};
    Object.defineProperty(target, part, { value: child, enumerable: true });
    target = child;
  }
  Object.defineProperty(target, parts.at(-1)!, descriptor);
  return root;
}

export function validateModeOptionAssignment(key: string, value: unknown, model: boolean): void {
  validateAuthorizationModeOptions(optionPath(key, { value, enumerable: true }), model);
}

/** Validate every mode slot before any bootstrap setter, including metadata cloning. */
export function validateAuthorizationModeOptions(input: unknown, model: boolean): void {
  if (!input || typeof input !== 'object' || Array.isArray(input))
    throw new TypeError('Authorization configuration must be an options object');
  const pending: { value: unknown; lane: Lane; depth: number }[] = [
    { value: input, lane: model ? 'model' : 'control', depth: 0 },
  ];
  const seen = new WeakMap<object, Set<Lane>>();
  let slots = 1;
  while (pending.length) {
    const { value, lane, depth } = pending.pop()!;
    // Function closures are trusted callable leaves, not option bags.
    if (!value || typeof value !== 'object') continue;
    const owners: object[] = [];
    for (let owner: object | null = value; owner; owner = Object.getPrototypeOf(owner)) {
      if (types.isProxy(owner)) throw new TypeError('Proxy authorization configuration is unsupported');
      if (owners.length > 100) throw new TypeError('Authorization configuration prototype depth exceeded');
      owners.push(owner);
    }
    const lanes = seen.get(value) ?? new Set<Lane>();
    if (lanes.has(lane)) continue;
    lanes.add(lane);
    seen.set(value, lanes);
    const read = (key: string): unknown => {
      for (const owner of owners) {
        const slot = Object.getOwnPropertyDescriptor(owner, key);
        if (!slot) continue;
        if (!('value' in slot)) throw new TypeError(`Accessor configuration control ${key} is unsupported`);
        return slot.value;
      }
      return undefined;
    };
    const add = (child: unknown, childLane: Lane) => {
      if (child == null) return;
      if (++slots > 20000 || depth >= 100) throw new TypeError('Authorization configuration exceeds structural limits');
      pending.push({ value: child, lane: childLane, depth: depth + 1 });
    };
    if (lane !== 'data' && lane !== 'policies') {
      let keys = 0;
      for (const owner of owners) {
        for (const key of Reflect.ownKeys(owner)) {
          if (++keys > 20000) throw new TypeError('Authorization configuration keys exceed structural limits');
          if (typeof key !== 'string') continue;
          validateAuthorizationModeKey(key, lane === 'model');
          const parts = key.split('.');
          const roots =
            lane === 'defaults'
              ? defaultBuckets
              : lane === 'policy'
                ? ['rows', 'outputFields', 'inputFields', 'operation', 'related']
                : ['args', 'options', 'sqOptions', 'include', 'populate', 'authorization', 'defaults'];
          if (
            parts.length > 1 &&
            roots.includes(parts[0]) &&
            parts.some((part) => modes.has(part) || retired.has(part))
          )
            add(optionPath(key, Object.getOwnPropertyDescriptor(owner, key)!), lane);
          if (!modes.has(key)) continue;
          const slot = Object.getOwnPropertyDescriptor(value, key);
          if (!slot || !('value' in slot) || !slot.enumerable)
            throw new TypeError(`${key} must be an own enumerable data option`);
          validateAuthorizationModeValue(slot.value);
        }
      }
    }
    if (Array.isArray(value)) {
      if (value.length > 20000) throw new TypeError('Authorization configuration array exceeds structural limits');
      for (let index = 0; index < value.length; index++) add(read(String(index)), lane);
    } else if (lane === 'data') {
      if (Object.getPrototypeOf(value) !== Object.prototype && Object.getPrototypeOf(value) !== null) continue;
      add(read('$$sq'), 'control');
      for (const key of Object.keys(value)) if (key !== '$$sq') add(read(key), 'data');
    } else if (lane === 'defaults') {
      for (const key of new Set([...Object.keys(value), ...defaultBuckets])) add(read(key), 'control');
    } else if (lane === 'policies') {
      for (const key of Object.keys(value)) add(read(key), 'policy');
    } else if (lane === 'policy') {
      for (const key of ['rows', 'outputFields', 'inputFields', 'operation', 'parent', 'child', 'visibility'])
        add(read(key), 'policy');
      add(read('related'), 'policies');
      add(read('filter'), 'data');
    } else {
      add(read('defaults'), 'defaults');
      for (const key of ['args', 'options', 'sqOptions', 'include', 'populate']) add(read(key), 'control');
      add(read('authorization'), 'policy');
      add(read('operationAccess'), 'policy');
      for (const key of ['filter', 'match', 'data']) add(read(key), 'data');
    }
  }
}
