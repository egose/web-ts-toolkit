import { afterEach, describe, expect, it, vi } from 'vitest';
import Permission from '../src/permission';
import type { AccessRouterRequest } from '../src/interfaces';
import {
  readServiceOutputPolicy,
  resolveServiceAuthorization,
  type AuthorizationFieldCatalog,
} from '../src/acl/service-authorization';
import { isCatalogOutputPath } from '../src/acl/field-catalog';

function rawCatalog(): AuthorizationFieldCatalog {
  return {
    paths: ['value', 'ref', 'virtual', 'mixed', 'record'],
    protectedPaths: ['_permissions', 'record.secret'],
    referencePaths: ['ref'],
    virtualPaths: ['virtual'],
    dynamicPaths: ['record.$*.name'],
    opaquePaths: ['mixed'],
  };
}

function captured(catalog: AuthorizationFieldCatalog = rawCatalog()) {
  const binding = { request: {} as AccessRouterRequest, runtime: {}, model: {}, modelName: 'PreparedCatalog' };
  const call = resolveServiceAuthorization({
    binding,
    access: { operation: 'list', outputAccess: 'list', virtualAccess: 'list', docPermissionsAccess: 'list' },
    configuration: { catalog },
    requestPermissions: new Permission({}),
  });
  return readServiceOutputPolicy(call, binding).catalog;
}

afterEach(() => vi.restoreAllMocks());

describe('PIPE-03 captured primitive catalog preparation', () => {
  it('amortizes primitive preparation across repeated rows rather than short-lived child scopes', () => {
    const catalog = captured();
    const split = vi.spyOn(String.prototype, 'split');
    const results: boolean[] = [];
    let count: number;
    try {
      for (let index = 0; index < 100; index++) results.push(isCatalogOutputPath(catalog, 'value'));
      count = split.mock.calls.length;
    } finally {
      split.mockRestore();
    }
    expect(results).toEqual(Array(100).fill(true));
    expect(count!).toBe(32);
  });

  it.each([
    ['value', true],
    ['ref', true],
    ['ref.name', false],
    ['virtual', true],
    ['virtual.name', false],
    ['mixed.anything', true],
    ['record.work.name', true],
    ['record.work.other', false],
    ['record.secret', false],
    ['_permissions.owner', false],
    ['unknown', false],
    ['__proto__.value', false],
  ] as const)('retains catalog boundaries and warm denials for %s', (path, allowed) => {
    const catalog = captured();
    for (let index = 0; index < 40; index++) expect(isCatalogOutputPath(catalog, path)).toBe(allowed);
  });

  it('does not cache caller-owned catalogs or inherit preparation through object copies', () => {
    const raw = rawCatalog();
    expect(isCatalogOutputPath(raw, 'added')).toBe(false);
    (raw.paths as string[]).push('added');
    expect(isCatalogOutputPath(raw, 'added')).toBe(true);
    const copy = { ...captured(), paths: ['value'] };
    expect(isCatalogOutputPath(copy, 'added')).toBe(false);
    copy.paths.push('added');
    expect(isCatalogOutputPath(copy, 'added')).toBe(true);
  });

  it('keeps separate capture lifetimes after source catalog replacement', () => {
    const raw = rawCatalog();
    const first = captured(raw);
    for (let index = 0; index < 40; index++) expect(isCatalogOutputPath(first, 'added')).toBe(false);
    (raw.paths as string[]).push('added');
    const second = captured(raw);
    expect(isCatalogOutputPath(first, 'added')).toBe(false);
    expect(isCatalogOutputPath(second, 'added')).toBe(true);
  });

  it('retains per-use inherited optional-path observations rather than preparing sparse catalog shapes', () => {
    const descriptor = Object.getOwnPropertyDescriptor(Object.prototype, 'protectedPaths');
    const catalog = captured({ paths: ['value'] });
    let deny = false;
    const get = vi.fn(() => (deny ? ['value'] : []));
    try {
      Object.defineProperty(Object.prototype, 'protectedPaths', { configurable: true, get });
      for (let index = 0; index < 40; index++) expect(isCatalogOutputPath(catalog, 'value')).toBe(true);
      deny = true;
      expect(isCatalogOutputPath(catalog, 'value')).toBe(false);
      expect(get).toHaveBeenCalledTimes(41);
    } finally {
      if (descriptor) Object.defineProperty(Object.prototype, 'protectedPaths', descriptor);
      else Reflect.deleteProperty(Object.prototype, 'protectedPaths');
    }
  });

  it('retains live inherited array entries when capture accepts a hole through the original iterator', () => {
    const previous = Object.getOwnPropertyDescriptor(Array.prototype, '1');
    try {
      Object.defineProperty(Array.prototype, '1', { configurable: true, writable: true, value: 'inherited' });
      const paths = Array<string>(3);
      paths[0] = 'first';
      paths[2] = 'last';
      const catalog = captured({ ...rawCatalog(), paths });
      expect(Object.hasOwn(catalog.paths, '1')).toBe(false);
      for (let index = 0; index < 40; index++) expect(isCatalogOutputPath(catalog, 'inherited')).toBe(true);
      Object.defineProperty(Array.prototype, '1', { configurable: true, writable: true, value: 'changed' });
      expect(isCatalogOutputPath(catalog, 'inherited')).toBe(false);
      expect(isCatalogOutputPath(catalog, 'changed')).toBe(true);
    } finally {
      if (previous) Object.defineProperty(Array.prototype, '1', previous);
      else Reflect.deleteProperty(Array.prototype, '1');
    }
  });

  it('leaves non-primitive path lookup order on the original uncached evaluator', () => {
    const run = (catalog: AuthorizationFieldCatalog) => {
      const events: string[] = [];
      const path = {
        get split() {
          events.push('split');
          return () => {
            events.push('call');
            return ['mixed', 'value'];
          };
        },
      } as unknown as string;
      return { results: [isCatalogOutputPath(catalog, path), isCatalogOutputPath(catalog, path)], events };
    };
    expect(run(captured())).toEqual(run(rawCatalog()));
  });

  it('bounds dynamic-key preparation without changing cold or saturated denials', () => {
    const catalog = captured();
    for (let index = 0; index < 20032; index++) expect(isCatalogOutputPath(catalog, `missing${index}`)).toBe(false);
    const split = vi.spyOn(String.prototype, 'split');
    let count: number;
    try {
      isCatalogOutputPath(catalog, 'missingBeyondCapacity');
      isCatalogOutputPath(catalog, 'missingBeyondCapacity');
      count = split.mock.calls.length;
    } finally {
      split.mockRestore();
    }
    expect(count!).toBeGreaterThanOrEqual(2); // A saturated cache never grows or issues authority.
    expect(isCatalogOutputPath(catalog, 'value')).toBe(true);
  });
});
