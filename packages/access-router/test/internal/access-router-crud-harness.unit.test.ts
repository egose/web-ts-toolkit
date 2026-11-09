import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  caseId,
  crudCatalog,
  createCrudFixture,
  modeKeys,
  tuples,
  validateCase,
  type CrudCase,
} from '../access-router-crud-fixture';
import * as stages from '../../src/acl/document-stage';
import { readServiceAuthorizationMode } from '../../src/acl/service-authorization';

afterEach(() => vi.restoreAllMocks());

describe('maintained real-service CRUD measurement fixtures', () => {
  it('enumerates all 16 literal tuples in READ/LIST/CREATE/UPDATE order with unique stable labels', () => {
    expect(modeKeys).toEqual([
      'readAuthorizationMode',
      'listAuthorizationMode',
      'createAuthorizationMode',
      'updateAuthorizationMode',
    ]);
    expect(tuples).toHaveLength(16);
    expect(new Set(tuples.map((t) => t.join('/'))).size).toBe(16);
    expect(tuples[0]).toEqual(Array(4).fill('isolated'));
    expect(tuples[15]).toEqual(Array(4).fill('trusted'));
    expect(tuples[1]).toEqual(['isolated', 'isolated', 'isolated', 'trusted']);
    const cases = crudCatalog();
    expect(new Set(cases.map((c) => c.id)).size).toBe(cases.length);
    for (const c of cases) expect(() => validateCase(c)).not.toThrow();
  });

  it.each(crudCatalog())(
    '$id validates real output, actual stage modes, query/work counts and stable writes twice',
    async (c) => {
      const admitted = vi.spyOn(stages, 'prepareQueryDocumentStage');
      const f = createCrudFixture(c, true);
      try {
        expect(f.resolvedModes()).toEqual(c.modes);
        const first = f.check(await f.invoke());
        const counts = { ...f.counts };
        const trace = [...f.trace];
        const creating = c.operation.startsWith('create') || c.operation === 'upsert-create';
        const updating = c.operation.startsWith('update') || c.operation === 'upsert-update';
        const list = c.operation.startsWith('list');
        const mode = c.modes[creating ? 2 : updating ? 3 : list ? 1 : 0];
        for (const [call, binding] of admitted.mock.calls)
          expect(readServiceAuthorizationMode(call, binding)).toBe(mode);
        if (!['read-miss', 'list-empty'].includes(c.operation)) expect(admitted).toHaveBeenCalled();
        expect(counts['adapter.create'] ?? 0).toBe(creating ? (c.operation === 'create-bulk' ? c.rows : 1) : 0);
        expect(counts['adapter.save'] ?? 0).toBe(updating ? 1 : 0);
        expect(counts['adapter.exists'] ?? 0).toBe(c.entry === 'public' && c.operation === 'upsert-update' ? 1 : 0);
        expect(counts['adapter.count'] ?? 0).toBe(0);
        if (c.operation === 'read-fallback' && c.entry === 'public') {
          expect(counts['adapter.findOne']).toBe(2);
          expect(trace).toContain('hook.list.output');
          expect(trace).not.toContain('hook.read.output');
        }
        if (c.shape === 'metadata') {
          // LIST coalesces its maps; bulk CREATE currently performs two visibility reads per row.
          expect(counts['adapter.visibility']).toBe(c.operation === 'create-bulk' ? c.rows * 2 : 2);
        } else expect(counts['adapter.visibility'] ?? 0).toBe(0);
        f.reset();
        expect(f.check(await f.invoke())).toEqual(first);
        expect(f.counts).toEqual(counts);
        expect(f.trace).toEqual(trace);
      } finally {
        f.dispose();
      }
    },
  );

  it('fails closed on fixture labels, unapplied resolved modes, wrong output and skipped persistence', async () => {
    const c = crudCatalog().find((c) => c.operation === 'create-bulk')!;
    expect(() => validateCase({ ...c, id: 'wrong' })).toThrow(/fixture label/);
    const malformed = { ...c, modes: ['trusted', 'trusted'] } as CrudCase;
    malformed.id = caseId(malformed);
    expect(() => validateCase(malformed)).toThrow(/four modes/);
    const f = createCrudFixture(c);
    try {
      f.runtime.setModelOption(f.model.modelName, 'createAuthorizationMode', 'trusted');
      expect(() => f.reset()).toThrow(/resolved mode/);
      f.runtime.setModelOption(f.model.modelName, 'createAuthorizationMode', 'isolated');
      f.reset();
      expect(() => f.check({ success: true, data: [] })).toThrow(/row count/);
      const result = await f.invoke();
      result.data[0].hidden = 'leak';
      expect(() => f.check(result)).toThrow(/denied field/);
      f.reset();
      vi.spyOn(f.adapter, 'create').mockImplementation(async (items) => items.map((item) => new f.model(item)));
      expect(() => f.check(result)).toThrow();
      const skipped = await f.invoke();
      expect(() => f.check(skipped)).toThrow(/persistence/);
    } finally {
      f.dispose();
    }
  });
});
