import mongoose from 'mongoose';
import { describe, expect, it, vi } from 'vitest';
import Permission from '../src/permission';
import type { ModelRequest } from '../src/interfaces';
import {
  captureAuthorizationFieldCatalog,
  isCatalogInputPath,
  isCatalogOutputPath,
  matchesCatalogPattern,
} from '../src/acl/field-catalog';
import { copyOutputValue } from '../src/acl/output-field-filter';
import { planAuthorizedModelProjection } from '../src/acl/output-projection';
import { resolveServiceAuthorization } from '../src/acl/service-authorization';

/** Pre-fast-path contract; deliberately retain segment parsing as the oracle. */
function referenceMatch(pattern: string, path: string, descendants = false): boolean {
  const expected = pattern.split('.');
  const actual = path.split('.');
  return (
    (descendants ? actual.length >= expected.length : actual.length === expected.length) &&
    expected.every((part, index) => part === '$*' || part === actual[index])
  );
}

describe('catalog pattern matching', () => {
  it.each([
    ['name', 'name', false, true],
    ['name', 'name.child', false, false],
    ['name', 'name.child', true, true],
    ['name', 'nameSibling', true, false],
    ['name.child', 'name', true, false],
    ['', '', false, true],
    ['', '.child', true, true],
    ['', 'child', true, false],
    ['name.', 'name..child', true, true],
    ['name.', 'name.child', true, false],
    ['a..b', 'a..b.child', true, true],
    ['a..b', 'a.b.child', true, false],
    ['雪.😀', '雪.😀.葉', true, true],
    ['é', 'e\u0301', false, false],
    ['map.$*.value', 'map.key.value', false, true],
    ['map.$*.value', 'map..value', false, true],
    ['map.$*.value', 'map.key.value.child', false, false],
    ['map.$*.value', 'map.key.value.child', true, true],
    ['map.$*.value', 'map.key.valueSibling', true, false],
    ['$*.$*', 'a.b', false, true],
    ['$*', '', false, true],
    ['$*', '', true, true],
    ['a$*', 'anything', false, false],
    ['a$*', 'a$*.child', true, true],
    ['$**', 'key', false, false],
  ] as const)('matches %j against %j (descendants %s)', (pattern, path, descendants, expected) => {
    expect(matchesCatalogPattern(pattern, path, descendants)).toBe(expected);
  });

  it('agrees with segment matching across literal, malformed, Unicode and wildcard paths', () => {
    const parts = [
      '',
      'a',
      'ab',
      'b',
      '$*',
      '$**',
      'a$*',
      '*',
      '$',
      '雪',
      '😀',
      'é',
      'e\u0301',
      '\ud800',
      '\udc00',
      '\0',
      '\x7f',
      ' ',
      '\n',
      '__proto__',
      'constructor',
      '0',
      'sub',
    ];
    const paths = [...parts, '.', '..', 'a.', '.a', 'a..b', 'map.$*.value', 'map.key.value'];
    for (const part of parts) paths.push(`a.${part}`, `${part}.b`, `a.${part}.b`);
    for (const pattern of paths) {
      for (const path of paths) {
        for (const descendants of [false, true]) {
          expect(matchesCatalogPattern(pattern, path, descendants)).toBe(referenceMatch(pattern, path, descendants));
        }
      }
    }

    let state = 0x61c47;
    const next = () => (state = (Math.imul(state, 1664525) + 1013904223) >>> 0);
    const makePath = () => Array.from({ length: next() % 7 }, () => parts[next() % parts.length]).join('.');
    for (let index = 0; index < 5000; index++) {
      const pattern = makePath();
      const path = index % 3 === 0 ? `${pattern}.${makePath()}` : makePath();
      for (const descendants of [false, true]) {
        expect(matchesCatalogPattern(pattern, path, descendants)).toBe(referenceMatch(pattern, path, descendants));
      }
    }
  });

  it('preserves descendant-argument truthiness for runtime callers', () => {
    for (const descendants of [undefined, null, false, true, 0, 1, '', 'yes', {}, []]) {
      for (const path of ['root', 'root.child', 'rootSibling']) {
        expect(matchesCatalogPattern('root', path, descendants as boolean)).toBe(
          referenceMatch('root', path, descendants as boolean),
        );
      }
    }
  });

  it('avoids both split allocations for literal primitive comparisons only', () => {
    const split = vi.spyOn(String.prototype, 'split');
    let literals: number;
    let wildcard: number;
    let boxed: number;
    try {
      matchesCatalogPattern('_permissions', 'field0', true);
      matchesCatalogPattern('customer', 'customer.name', true);
      matchesCatalogPattern('customer', 'customerSibling', true);
      matchesCatalogPattern('name', 'name');
      literals = split.mock.calls.length;
      matchesCatalogPattern('records.$*.name', 'records.work.name');
      wildcard = split.mock.calls.length - literals;
      matchesCatalogPattern(Object('root') as string, 'root.child', true);
      boxed = split.mock.calls.length - literals - wildcard;
    } finally {
      split.mockRestore();
    }
    expect(literals).toBe(0);
    expect(wildcard).toBe(2);
    expect(boxed).toBe(2);
  });

  it.each(['pattern', 'path', 'both'] as const)('preserves custom split observations for non-primitive %s', (side) => {
    const run = (match: typeof matchesCatalogPattern) => {
      const events: string[] = [];
      const operand = (name: string, value: string) => {
        if (side !== name && side !== 'both') return value;
        return new Proxy(
          {},
          {
            get(_target, key) {
              events.push(`${name}.${String(key)}`);
              if (key === 'split')
                return (separator: string) => {
                  events.push(`${name}.call:${separator}`);
                  return value.split(separator);
                };
              throw new Error('Unexpected operand observation');
            },
          },
        ) as unknown as string;
      };
      const result = match(operand('pattern', 'root'), operand('path', 'root.child'), true);
      return { result, events };
    };
    expect(run(matchesCatalogPattern)).toEqual(run(referenceMatch));
  });

  it('preserves split order, errors and non-string runtime fallback', () => {
    for (const value of [undefined, null, 1, true, Symbol('path'), Object('root')]) {
      const run = (match: typeof matchesCatalogPattern, pattern: boolean) => {
        const events: string[] = [];
        const other = {
          split() {
            events.push('other.split');
            return ['root'];
          },
        } as unknown as string;
        try {
          return { result: match(pattern ? (value as string) : other, pattern ? other : (value as string)), events };
        } catch (error) {
          return { error: (error as Error).name, message: (error as Error).message, events };
        }
      };
      for (const pattern of [false, true])
        expect(run(matchesCatalogPattern, pattern)).toEqual(run(referenceMatch, pattern));
    }
    const failure = new Error('split failure');
    const path = {
      get split() {
        throw failure;
      },
    } as unknown as string;
    expect(() => matchesCatalogPattern('root', path)).toThrow(failure);
  });
});

describe('catalog path boundaries', () => {
  const schema = new mongoose.Schema({
    meta: { permissions: mongoose.Schema.Types.Mixed, permissionsExtra: String },
    customer: { type: mongoose.Schema.Types.ObjectId, ref: 'Customer' },
    customerExtra: String,
    mixed: mongoose.Schema.Types.Mixed,
    labels: { type: Map, of: String },
    records: {
      type: Map,
      of: new mongoose.Schema(
        {
          value: String,
          ref: { type: mongoose.Schema.Types.ObjectId, ref: 'Customer' },
          refExtra: String,
        },
        { versionKey: 'revision' },
      ),
    },
  });
  const virtuals = { summary: { get: () => 'summary', dependsOn: [] } };
  const catalog = captureAuthorizationFieldCatalog(schema, virtuals, 'meta.permissions');

  it.each([
    ['meta.permissions', false],
    ['meta.permissions.private', false],
    ['meta.permissionsExtra', true],
    ['customer', true],
    ['customer.value', false],
    ['customerExtra', true],
    ['labels.work', true],
    ['labels.work.value', false],
    ['labelsExtra.work', false],
    ['mixed.safe.deep', true],
    ['mixed..deep', false],
    ['mixed.__proto__.value', false],
    ['records.work.value', true],
    ['records.work.ref', true],
    ['records.work.ref.value', false],
    ['records.work.refExtra', true],
    ['records.work.revision', false],
    ['records.work.revision.value', false],
    ['summary', true],
    ['summary.value', false],
    ['summaryExtra', false],
  ] as const)('keeps protected/reference/map/virtual boundary for %s', (path, expected) => {
    expect(isCatalogOutputPath(catalog, path)).toBe(expected);
  });

  it('keeps input metadata ancestors and virtuals excluded without excluding sibling prefixes', () => {
    for (const path of ['meta', 'meta.permissions', 'meta.permissions.private', 'summary']) {
      expect(isCatalogInputPath(catalog, path)).toBe(false);
    }
    for (const path of ['meta.permissionsExtra', 'customer', 'customerExtra', 'labels.work', 'records.work.refExtra']) {
      expect(isCatalogInputPath(catalog, path)).toBe(true);
    }
  });

  it('retains exclusions and protected descendants under an opaque output grant', () => {
    const binding = { request: {} as ModelRequest, runtime: {}, model: {}, modelName: 'CatalogBoundary' };
    const authorization = resolveServiceAuthorization({
      binding,
      access: { operation: 'read', outputAccess: 'read', virtualAccess: 'read', docPermissionsAccess: 'read' },
      configuration: { catalog: captureAuthorizationFieldCatalog(schema, virtuals, 'mixed.private') },
      requestPermissions: new Permission({}),
      authorization: { outputFields: { mode: 'grant', paths: ['mixed'] } },
    });
    const plan = planAuthorizedModelProjection({ authorization, binding, requestedSelect: ['mixed', '-mixed.secret'] });
    const value = {
      secret: { value: 'excluded' },
      secretExtra: 'public',
      private: { value: 'protected' },
      privateExtra: { value: 'public' },
    };
    const copied = copyOutputValue(value, plan, 'mixed');
    expect(copied).toEqual({ secretExtra: 'public', privateExtra: { value: 'public' } });
    expect(copied).not.toBe(value);
    expect((copied as typeof value).privateExtra).not.toBe(value.privateExtra);
    expect(value.private.value).toBe('protected');
    expect(value.secret.value).toBe('excluded');
  });
});
