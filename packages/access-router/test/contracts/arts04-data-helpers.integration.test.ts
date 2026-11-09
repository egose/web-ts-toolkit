import { setImmediate } from 'node:timers/promises';
import request from 'supertest';
import { describe, expect, it, vi } from 'vitest';
import { dataFixture, modelFixture, gate } from '../support/public/arts04-fixture';
import { useMongoTestDatabase } from '../setup';

useMongoTestDatabase();

const bundle = () => ({
  plain: { values: ['stored'] },
  date: new Date(123456),
  bytes: Buffer.from([1, 2]),
  map: new Map([['key', { count: 1 }]]),
  set: new Set([{ count: 1 }]),
  view: new Uint16Array([1, 2, 3]).subarray(1),
});
type Bundle = ReturnType<typeof bundle>;
const observe = (p: Bundle) => ({
  plain: [...p.plain.values],
  date: p.date.getTime(),
  bytes: [...p.bytes],
  map: [...p.map].map(([key, value]) => [key, { count: value.count }]),
  set: [...p.set].map((value) => ({ count: value.count })),
  view: [...p.view],
});
const expected = {
  plain: ['stored'],
  date: 123456,
  bytes: [1, 2],
  map: [['key', { count: 1 }]],
  set: [{ count: 1 }],
  view: [2, 3],
};
const mutateNatives = (p: Bundle) => {
  p.date.setTime(9);
  p.bytes.fill(9);
  p.map.get('key')!.count = 9;
  p.map.set('extra', { count: 9 });
  [...p.set][0].count = 9;
  p.set.add({ count: 9 });
  p.view.fill(9);
};

describe('ARTS-04 finite native data bundle', () => {
  it('DATA-configured caller and public snapshot native values detach', async () => {
    const input = [{ id: 'one', payload: bundle() }],
      f = dataFixture(input);
    mutateNatives(input[0].payload);
    input[0].payload.plain.values.push('caller');
    const getters = [
      () => f.api.runtime.getDataSnapshot<(typeof input)[0]>(f.name)[0],
      () => f.api.runtime.getDataOptions<(typeof input)[0]>(f.name).data![0],
      () => f.router.options.data![0],
    ];
    for (const get of getters) {
      const row = get();
      expect(observe(row.payload)).toEqual(expected);
      expect(Object.isFrozen(row.payload.plain.values)).toBe(true);
      mutateNatives(row.payload);
      expect(observe(get().payload)).toEqual(expected);
    }
    await f.execute(async (req) => {
      const result = await req.dacl.getService<(typeof input)[0]>(f.name).findById('one');
      expect(result.success).toBe(true);
      if (!result.success) throw new Error(result.code);
      expect(observe(result.data.payload)).toEqual(expected);
    });
  });

  it('DATA-returned rows detach across independent find/findOne/findById calls', async () => {
    const f = dataFixture([{ id: 'one', payload: bundle() }]);
    await f.execute(async (req) => {
      const svc = req.dacl.getService<{ id: string; payload: Bundle }>(f.name);
      const results = [await svc.find({}), await svc.findOne({}), await svc.findById('one')];
      for (const result of results) {
        expect(result.success).toBe(true);
        if (!result.success) throw new Error(result.code);
        const row = result.kind === 'list' ? result.data[0] : result.data;
        expect(observe(row.payload)).toEqual(expected);
        mutateNatives(row.payload);
        row.payload.plain.values.push('caller');
      }
      const fresh = await svc.findById('one');
      expect(fresh.success).toBe(true);
      if (!fresh.success) throw new Error(fresh.code);
      expect(observe(fresh.data.payload)).toEqual(expected);
    });
  });

  it('DATA-retained service owns old version; malformed/native-proxy replacements are atomic', async () => {
    const f = dataFixture([{ id: 'one', payload: bundle() }]);
    await f.execute(async (req) => {
      const svc = req.dacl.getService<{ id: string; payload: Bundle }>(f.name);
      const before = f.api.runtime.getDataSnapshot(f.name),
        options = f.api.runtime.getDataOptions(f.name);
      for (const data of [{}, [{ id: 'one', payload: new Proxy(new Date(0), {}) }]]) {
        expect(() => f.router.setOptions({ data, listHardLimit: 1 } as never)).toThrow(TypeError);
        expect(f.api.runtime.getDataSnapshot(f.name)).toEqual(before);
        expect(f.api.runtime.getDataOptions(f.name).listHardLimit).toBe(options.listHardLimit);
      }
      const replacement = bundle();
      replacement.date.setTime(7);
      f.router.data([{ id: 'one', payload: replacement }]);
      replacement.date.setTime(9);
      expect(await svc.findById('one')).toMatchObject({ success: true, data: { payload: { date: new Date(123456) } } });
      expect(await req.dacl.getService(f.name).findById('one')).toMatchObject({
        success: true,
        data: { payload: { date: new Date(7) } },
      });
    });
  });

  it('DATA-direct/root decorations may mutate only returned plain/native copies', async () => {
    const f = dataFixture([{ id: 'one', payload: bundle() }]);
    const seen: unknown[] = [];
    f.router.decorate((row) => {
      seen.push(observe(row.payload));
      mutateNatives(row.payload);
      row.payload.plain.values.push('decoration');
      return { id: row.id, decorated: true };
    });
    expect((await request(f.app).get(`${f.basePath}/one`).expect(200)).body).toEqual({ id: 'one', decorated: true });
    const root = await request(f.app)
      .post(f.rootPath)
      .send([{ target: 'data', name: f.name, op: 'read', id: 'one' }])
      .expect(200);
    expect(root.body[0]).toMatchObject({ result: { data: { id: 'one', decorated: true } } });
    expect(seen).toEqual([expected, expected]);
    expect(observe(f.api.runtime.getDataSnapshot<{ id: string; payload: Bundle }>(f.name)[0].payload)).toEqual(
      expected,
    );
  });
});

describe('ARTS-04 initialized data callback surfaces', () => {
  it.each(['core', 'service', 'public-aliases'] as const)(
    'CALLBACK-%s named helper methods pass two arguments and frozen empty facts',
    async (receiver) => {
      const field = vi.fn(function (p, grants) {
        return p.has('reader') && !grants.suspended;
      });
      const privateField = vi.fn(function (_p, grants) {
        return grants.owner === true;
      });
      const f = dataFixture([{ id: 'one', name: 'visible' }], {
        permissionSchema: { name: field, privateName: privateField } as never,
      });
      await f.execute(async (req) => {
        const core = req.dacl,
          actor = core.getPermissions();
        const row = { name: 'visible', privateName: 'never', _permissions: { owner: true } };
        const invoke = async () => {
          if (receiver === 'core')
            return [
              await core.genAllowedFields(f.name, row, 'read'),
              await core.pickAllowedFields(f.name, row, 'read'),
              await core.genSelect(f.name, 'read', ['name', 'privateName']),
            ];
          const services =
            receiver === 'service' ? [core.getService(f.name)] : [core.service(f.name), core.svc(f.name)];
          const results = [];
          for (const svc of services)
            results.push(
              await svc.genAllowedFields(row, 'read'),
              await svc.pickAllowedFields(row, 'read'),
              await svc.genSelect('read', ['name', 'privateName']),
              await svc.genQuerySelect('read', ['name', 'privateName']),
              await svc.trimOutputFields(row, 'read'),
            );
          return results;
        };
        const results = await invoke();
        expect(results).toEqual(
          receiver === 'core'
            ? [['name'], { name: 'visible' }, ['name']]
            : Array.from({ length: receiver === 'service' ? 1 : 2 }, () => [
                ['name'],
                { name: 'visible' },
                ['name'],
                ['name'],
                { name: 'visible' },
              ]).flat(),
        );
        for (const fn of [field, privateField]) {
          expect(fn).toHaveBeenCalled();
          for (const [index, call] of fn.mock.calls.entries()) {
            expect(fn.mock.contexts[index]).toBe(req);
            expect(call).toHaveLength(2);
            expect(call[0].keys).toEqual(actor.keys);
            expect(call[1]).toEqual({});
            expect(Object.isFrozen(call[1])).toBe(true);
          }
        }
      });
    },
  );

  it('CALLBACK-operation guard receives only initialized permissions with original request this', async () => {
    const rule = vi.fn(function (permissions) {
      return permissions.has('reader');
    });
    const f = dataFixture([{ id: 'one', name: 'visible' }], { operationAccess: { read: rule } });
    await f.execute(async (req) => {
      expect(await req.dacl.isAllowed(f.name, 'read')).toBe(true);
      expect(rule.mock.contexts).toEqual([req]);
      expect(rule.mock.calls[0]).toHaveLength(1);
      expect(rule.mock.calls[0][0].keys).toEqual(req.dacl.getPermissions().keys);
    });
  });

  it('CALLBACK-permissions acquired from middleware retain keys/aliases/variadic/array/reserved names', async () => {
    const f = dataFixture([{ id: 'one' }]);
    f.api.setGlobalOptions({
      globalPermissions: () => ({
        reader: true,
        edit: false,
        publish: true,
        has: true,
        hasAll: true,
        keys: true,
        hasOwnProperty: true,
      }),
    });
    await f.execute(async (req) => {
      const p = req.dacl.getPermissions();
      expect(p.keys).toEqual(['reader', 'edit', 'publish', 'has', 'hasAll', 'keys', 'hasOwnProperty']);
      expect(p.has('reader')).toBe(true);
      expect(p.hasKey('reader')).toBe(true);
      expect(p.hasKey('edit')).toBe(true);
      expect(p.has('edit')).toBe(false);
      expect(p.hasAny('edit', 'publish')).toBe(true);
      expect(p.hasAny(['edit', 'publish'])).toBe(true);
      expect(p.hasAll('reader', 'publish')).toBe(true);
      expect(p.hasAll(['reader', 'edit'])).toBe(false);
      expect(p.hasAll('has', 'hasAll', 'keys', 'hasOwnProperty')).toBe(true);
      const keys = p.keys;
      expect(Object.isFrozen(keys)).toBe(true);
      expect(() => (keys as string[]).push('forged')).toThrow(TypeError);
      expect(p.has('forged')).toBe(false);
      expect(p.keys).not.toContain('forged');
    });
  });
});

describe('ARTS-04 real public collection admission and drain', () => {
  it('COLLECTION-outer dense/position/native limits reject before predicates', async () => {
    const predicate = vi.fn(() => true),
      f = await modelFixture({ permissionSchema: { name: predicate, payload: predicate } });
    await f.execute(async (req) => {
      const svc = req.macl.getService(f.Source.modelName);
      for (const rows of [Array(1001).fill(null), new Array(1), [{ payload: Buffer.alloc(17 * 1024 * 1024) }]]) {
        await expect(svc.pickAllowedFieldsMany(rows, 'list')).rejects.toMatchObject({
          result: { code: 'bad_request' },
        });
        expect(predicate).not.toHaveBeenCalled();
      }
    });
  });

  it('COLLECTION-cumulative individually valid 4MiB rows fail as a whole without partial publication', async () => {
    const f = await modelFixture({ permissionSchema: { payload: true } });
    await f.execute(async (req) => {
      const svc = req.macl.getService(f.Source.modelName),
        row = { payload: Buffer.alloc(4 * 1024 * 1024) };
      const single = await svc.pickAllowedFieldsMany([row], 'list');
      expect((single[0] as typeof row).payload.byteLength).toBe(4 * 1024 * 1024);
      let published: unknown;
      await expect(
        svc.pickAllowedFieldsMany([row, row], 'list').then((value) => {
          published = value;
        }),
      ).rejects.toMatchObject({ result: { code: 'bad_request' } });
      expect(published).toBeUndefined();
    });
  });

  it('COLLECTION-drain admitted callback finishes before failed settlement and no late publication', async () => {
    const entered = gate(),
      release = gate(),
      otherCallbacks = gate();
    const events: string[] = [];
    let calls = 0;
    const field = async () => {
      const index = calls++;
      events.push(`entered-${index}`);
      if (index === 0) {
        entered.resolve();
        await release.promise;
      }
      events.push(`finished-${index}`);
      if (index === 2) otherCallbacks.resolve();
      return true;
    };
    const f = await modelFixture({ permissionSchema: { name: field, payload: true } });
    f.api.setGlobalOptions({ requestComplexity: { maxHookConcurrency: 2, maxBulkConcurrency: 2 } });
    await f.execute(async (req) => {
      const svc = req.macl.getService(f.Source.modelName),
        payload = Buffer.alloc(4 * 1024 * 1024);
      let settled = false,
        published: unknown;
      // A small held row leaves one public gate slot for both genuine payload rows.
      // With only two payload rows, overflow can occur after the final predicate has returned.
      const pending = svc.pickAllowedFieldsMany(
        [{ name: 'held' }, { name: 'large-a', payload }, { name: 'large-b', payload }],
        'list',
      );
      const observed = pending.then(
        (value) => {
          settled = true;
          published = value;
          events.push('published');
          return undefined;
        },
        (error) => {
          settled = true;
          events.push('rejected');
          return error;
        },
      );
      await entered.promise;
      try {
        await otherCallbacks.promise;
        // A scheduling opportunity, not an assertion about private promise-turn counts.
        await setImmediate();
        expect(events).toContain('finished-2');
        expect(events).not.toContain('finished-0');
        expect(settled).toBe(false);
      } finally {
        release.resolve();
      }
      expect(await observed).toMatchObject({ result: { code: 'bad_request' } });
      expect(events.indexOf('finished-0')).toBeLessThan(events.indexOf('rejected'));
      expect(published).toBeUndefined();
      const finalEvents = [...events];
      await setImmediate();
      expect(events).toEqual(finalEvents);
      expect(published).toBeUndefined();
      expect(await svc.pickAllowedFieldsMany([{ name: 'fresh' }], 'list')).toEqual([{ name: 'fresh' }]);
    });
  });
});
