import mongoose from 'mongoose';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { ModelRequest } from '../src/interfaces';
import { ServiceAuthorizationError } from '../src/acl/service-authorization';
import { deferred, HookProbe } from './hook-admission-fixture';
import { ownedStageFixture, quietOutput, sourceModes } from './owned-stage-test-fixture';

afterEach(() => vi.restoreAllMocks());

describe('owned query runtime: independent rows, safe publication and fresh helpers', () => {
  it.each(sourceModes)(
    '%s overlapping direct/public calls keep same-ID facts independent and the captured hook gate finite',
    async (mode) => {
      const probe = new HookProbe();
      const hold = deferred();
      probe.barrier = hold.promise;
      const rule = vi.fn(async function (this: ModelRequest, _permissions, facts) {
        await Promise.resolve();
        expect(this).toBe(f.request);
        return facts.owner;
      });
      const hook = vi.fn((doc) => probe.run(doc.name, () => ({ owner: doc.owner })));
      const f = ownedStageFixture({
        mode,
        modelOptions: {
          permissionSchema: { name: rule },
          docPermissions: { list: { dependsOn: ['owner'], get: hook } },
        },
      });
      f.runtime.setGlobalOption('requestComplexity.maxHookConcurrency', 2);
      f.adapter.find.mockResolvedValue([
        { _id: 'same', name: 'allowed', owner: true },
        { _id: 'same', name: 'denied', owner: false },
      ]);
      const first = f.direct.find({}, { select: ['name', '-_id'] }, quietOutput);
      const second = f.public._list({}, { select: ['name', '-_id'] }, quietOutput);
      hold.resolve();
      const results = await Promise.all([first, second]);
      for (const result of results) expect(result).toMatchObject({ success: true, data: [{ name: 'allowed' }, {}] });
      expect(hook).toHaveBeenCalledTimes(4);
      expect(rule).toHaveBeenCalledTimes(4);
      expect(probe.peak).toBe(1);
      expect(probe.active).toBe(0);
      const contexts = results.flatMap((result) => (result.success ? result.contexts : []));
      expect(new Set(contexts.map((context) => context.docPermissions)).size).toBe(4);
      expect(contexts.map((context) => context.docPermissions.owner)).toEqual([true, false, true, false]);
      expect(f.adapter.find).toHaveBeenCalledTimes(2);
    },
  );

  it.each(sourceModes)(
    '%s returned descendants/replacements/metadata carry no facts into a fresh helper',
    async (mode) => {
      const maps = [{ owner: true }, { owner: false }];
      let next = 0;
      const rule = vi.fn((_permissions, facts) => facts.owner === true);
      const f = ownedStageFixture({
        mode,
        modelOptions: {
          permissionSchema: { name: rule, children: { read: true, list: true, sub: { label: rule, hidden: false } } },
          docPermissions: { list: () => maps[next++] },
        },
      });
      f.adapter.find.mockResolvedValue([
        { _id: 'same', name: 'first', children: [{ label: 'first', hidden: 'never' }] },
        { _id: 'same', name: 'second', children: [{ label: 'second', hidden: 'never' }] },
      ]);
      const result = await f.direct.find({}, { select: ['name', 'children', '-_id'] }, quietOutput);
      expect(result).toMatchObject({
        success: true,
        data: [{ name: 'first', children: [{ label: 'first' }] }, { children: [{}] }],
      });
      if (!result.success) throw new Error(result.code);
      const first = result.data[0] as any;
      first.children[0] = { label: 'replacement', hidden: 'never' };
      first._permissions = { owner: true };
      maps[0].owner = false;
      const calls = rule.mock.calls.length;
      expect(await f.direct.pickAllowedFields(first, 'list')).toEqual({ children: [{}] });
      expect(rule.mock.calls.length).toBeGreaterThan(calls);
      expect(rule.mock.calls.slice(calls).every(([, facts]) => Object.keys(facts).length === 0)).toBe(true);
      expect(result.contexts[0].docPermissions.owner).toBe(true);
      expect(result.contexts[0]).not.toHaveProperty('getDocumentAuthorization');
      expect(result.contexts[0]).not.toHaveProperty('documentAuthorization');
      expect(next).toBe(2);
      expect(f.adapter.find).toHaveBeenCalledTimes(1);
      await expect(
        f.direct.pickAllowedFields(first, 'list', { documentAuthorization: result.contexts[0] } as never),
      ).rejects.toBeInstanceOf(ServiceAuthorizationError);
    },
  );

  it('defines selected helper and virtual-return slots safely after native code installs inherited setters', async () => {
    const setter = vi.fn();
    const oldValue = Object.getOwnPropertyDescriptor(Object.prototype, 'value');
    const oldComputed = Object.getOwnPropertyDescriptor(Object.prototype, 'computed');
    const native = Object.assign(new Date(1), {
      getTime() {
        const descriptor = Object.assign(Object.create(null), { configurable: true, set: setter });
        Object.defineProperty(Object.prototype, 'value', descriptor);
        Object.defineProperty(Object.prototype, 'computed', descriptor);
        return 1;
      },
    });
    const f = ownedStageFixture({
      mode: 'trusted',
      modelOptions: {
        permissionSchema: { name: true, value: true, computed: true },
        virtuals: { computed: { dependsOn: ['name'], get: () => native } },
      },
    });
    f.adapter.find.mockResolvedValue([{ name: 'name' }]);
    let output: any, picked: any;
    try {
      const result = await f.direct.find({}, { select: ['name', 'computed', '-_id'] }, quietOutput);
      if (!result.success) throw new Error(result.code);
      output = result.data[0];
      Object.defineProperty(output, 'value', { value: native, enumerable: true, writable: true, configurable: true });
      picked = await f.direct.pickAllowedFields(output, 'list');
    } finally {
      if (oldValue) Object.defineProperty(Object.prototype, 'value', oldValue);
      else Reflect.deleteProperty(Object.prototype, 'value');
      if (oldComputed) Object.defineProperty(Object.prototype, 'computed', oldComputed);
      else Reflect.deleteProperty(Object.prototype, 'computed');
    }
    expect(output.computed).toEqual(new Date(1));
    expect(picked.value).toEqual(new Date(1));
    expect(setter).not.toHaveBeenCalled();
  });

  it.each(['meta.permissions', 'meta.child.permissions'])(
    'publishes selected dotted metadata at %s without a child lookup or memo transfer',
    async (metadata) => {
      const leaf = vi.fn((_permissions, facts) => facts.owner === true);
      const nested = metadata === 'meta.child.permissions';
      const schema = nested
        ? { meta: { list: true, sub: { child: { list: true, sub: { safe: leaf } } } } }
        : { meta: { list: true, sub: { safe: leaf } } };
      const f = ownedStageFixture({
        mode: 'trusted',
        modelOptions: {
          documentPermissionField: metadata,
          stripPermissionsField: false,
          permissionSchema: schema,
          docPermissions: { list: () => ({ owner: true, private: false }) },
          exposedDocPermissionKeys: ['owner'],
        },
      });
      f.adapter.find.mockResolvedValue([
        nested
          ? { meta: { child: { safe: 'safe', permissions: { fake: true } } } }
          : { meta: { safe: 'safe', permissions: { fake: true } } },
      ]);
      const result = await f.direct.find(
        {},
        { select: [nested ? 'meta.child.safe' : 'meta.safe', '-_id'] },
        { ...quietOutput, includePermissions: true },
      );
      expect(result.success).toBe(true);
      if (!result.success) throw new Error(result.code);
      const row = result.data[0] as any;
      const branch = nested ? row.meta.child : row.meta;
      expect(branch).toEqual({ safe: 'safe', permissions: { owner: true } });
      expect(row.permissions).toBe(branch.permissions);
      branch.permissions.owner = false;
      expect(result.contexts[0].docPermissions.owner).toBe(true);
      expect(result.contexts[0]).not.toHaveProperty('getDocumentAuthorization');
      const subset = await f.direct.pickAllowedFields(row.meta, 'list', { scopePath: ['meta'] });
      expect(subset).toEqual(nested ? { child: {} } : {});
      expect(leaf).toHaveBeenCalledTimes(2);
      expect(f.adapter.find).toHaveBeenCalledTimes(1);
    },
  );

  it.each(
    sourceModes.flatMap((mode) => ['proxy', 'symbol', 'non-enumerable', 'accessor'].map((kind) => ({ mode, kind }))),
  )(
    '$mode rejects unsupported $kind roots before the document hook without fallback replay',
    async ({ mode, kind }) => {
      const hook = vi.fn(() => ({}));
      const observe = vi.fn(() => 'never');
      const f = ownedStageFixture({ mode, modelOptions: { docPermissions: { list: hook } } });
      let source: any = { name: 'source' };
      if (kind === 'proxy') source = new Proxy(source, { ownKeys: observe, get: observe });
      if (kind === 'symbol') source[Symbol('hidden')] = true;
      if (kind === 'non-enumerable') Object.defineProperty(source, 'hidden', { value: true });
      if (kind === 'accessor') Object.defineProperty(source, 'name', { get: observe, enumerable: true });
      f.adapter.find.mockResolvedValue([source]);
      expect(await f.direct.find({}, { select: ['name', '-_id'] }, quietOutput)).toMatchObject({
        success: false,
        code: 'bad_request',
      });
      expect(hook).not.toHaveBeenCalled();
      expect(observe).not.toHaveBeenCalled();
    },
  );

  it.each(sourceModes)(
    '%s safely normalizes a protected source key without observing or publishing its value',
    async (mode) => {
      const hook = vi.fn(() => ({}));
      const get = vi.fn();
      const source = Object.defineProperty({ name: 'safe' }, '__proto__', { get, enumerable: true });
      const f = ownedStageFixture({ mode, modelOptions: { docPermissions: { list: hook } } });
      f.adapter.find.mockResolvedValue([source]);
      expect(await f.direct.find({}, { select: ['name', '-_id'] }, quietOutput)).toMatchObject({
        success: true,
        data: [{ name: 'safe' }],
      });
      expect(hook).toHaveBeenCalledTimes(1);
      expect(hook.mock.calls[0][0]).not.toHaveProperty('__proto__.polluted');
      expect(get).not.toHaveBeenCalled();
      expect({}).not.toHaveProperty('polluted');
    },
  );

  it.each(sourceModes)(
    '%s bounds a selected BSON wire expansion and publishes no partial row on overflow',
    async (mode) => {
      const wire = vi.fn(() => ({ safe: 'value', constructor: 'never', __v: 'never' }));
      const native = Object.assign(new mongoose.mongo.BSON.ObjectId(), { toBSON: wire });
      const hook = vi.fn(() => ({}));
      const f = ownedStageFixture({ mode, modelOptions: { docPermissions: { list: hook } } });
      f.adapter.find.mockResolvedValue([{ value: native }]);
      expect(await f.direct.find({}, { select: ['value', '-_id'] }, quietOutput)).toMatchObject({
        success: true,
        data: [{ value: { safe: 'value' } }],
      });
      expect(wire).toHaveBeenCalledTimes(1);
      expect(hook).toHaveBeenCalledTimes(1);
      const giant = Object.assign(new mongoose.mongo.BSON.ObjectId(), { toBSON: () => Array(20001).fill('value') });
      f.adapter.find.mockResolvedValue([{ name: 'safe', value: giant }]);
      const failed = await f.direct.find({}, { select: ['name', 'value', '-_id'] }, quietOutput);
      expect(failed).toMatchObject({ success: false, code: 'bad_request' });
      expect(failed).not.toHaveProperty('data');
      expect(hook).toHaveBeenCalledTimes(mode === 'isolated' ? 1 : 2);
    },
  );

  it.each(['cycle', 'slots'] as const)(
    'fresh raw helpers and normal embedded queries both reject %s replacements',
    async (kind) => {
      const f = ownedStageFixture({
        mode: 'trusted',
        modelOptions: { permissionSchema: { children: { list: true, sub: { label: true } } } },
      });
      const value: any[] = kind === 'cycle' ? [] : Array(20001).fill(null);
      if (kind === 'cycle') value.push(value);
      const row = { children: value };
      await expect(f.direct.pickAllowedFields(row, 'list')).rejects.toBeInstanceOf(ServiceAuthorizationError);
      f.adapter.find.mockResolvedValue([row]);
      const result = await f.direct.find({}, { select: ['children', '-_id'] }, quietOutput);
      expect(result).toMatchObject({ success: false, code: 'bad_request' });
      expect(result).not.toHaveProperty('data');
    },
  );

  it.each(sourceModes)('%s converts an actual hydrated root once before its single document hook', async (mode) => {
    const hook = vi.fn(() => ({}));
    const f = ownedStageFixture({
      mode,
      modelOptions: { docPermissions: { list: hook }, hydration: { find: 'hydrated' } },
    });
    const hydrated = f.model.hydrate({ name: 'hydrated', value: { nested: true } });
    const toObject = vi.spyOn(hydrated, 'toObject');
    f.adapter.find.mockResolvedValue([hydrated]);
    expect(await f.direct.find({}, { select: ['name', '-_id'] }, quietOutput)).toMatchObject({
      success: true,
      data: [{ name: 'hydrated' }],
    });
    expect(toObject).toHaveBeenCalledExactlyOnceWith({ virtuals: false, flattenMaps: true });
    expect(hook).toHaveBeenCalledTimes(1);
    expect(hook.mock.calls[0][0]).not.toBe(hydrated);
  });

  it('trusted selected native work never visits an unselected huge/cyclic/proxy source graph', async () => {
    const getTime = vi.fn(() => 1);
    const value = Object.assign(new Date(1), { getTime });
    const hidden: any = { proxy: new Proxy({}, {}), giant: Array(25000) };
    hidden.self = hidden;
    // The adapter deliberately over-returns hidden data. No consumer needs it;
    // trusted output must still avoid observing an unselected source graph.
    const f = ownedStageFixture({ mode: 'trusted' });
    f.adapter.find.mockResolvedValue([{ name: 'name', value, hidden }]);
    expect(await f.direct.find({}, { select: ['name', 'value', '-_id'] }, quietOutput)).toMatchObject({
      success: true,
      data: [{ name: 'name', value: new Date(1) }],
    });
    expect(getTime).toHaveBeenCalledTimes(1);
  });

  it.each(
    sourceModes.flatMap((mode) =>
      [
        ['proxy', () => new Proxy({}, {})],
        ['custom', () => new (class Value {})()],
        ['function', () => () => true],
        ['symbol', () => Symbol('value')],
        [
          'cycle',
          () => {
            const value: any = {};
            value.self = value;
            return value;
          },
        ],
        ['slots', () => Array(20001)],
        [
          'depth',
          () => {
            let value: any = {};
            for (let index = 0; index < 101; index++) value = { nested: value };
            return value;
          },
        ],
      ].map(([kind, value]) => ({ mode, kind, value: value as () => unknown })),
    ),
  )(
    '$mode selected $kind returns controlled 400, bounded hook work and no partial publication',
    async ({ mode, value }) => {
      const hook = vi.fn(() => ({}));
      const f = ownedStageFixture({ mode, modelOptions: { docPermissions: { list: hook } } });
      f.adapter.find.mockResolvedValue([{ name: 'name', value: value() }]);
      const result = await f.direct.find({}, { select: ['name', 'value', '-_id'] }, quietOutput);
      expect(result).toMatchObject({
        success: false,
        code: 'bad_request',
        errors: [{ detail: expect.stringContaining('Service authorization:') }],
      });
      expect(result).not.toHaveProperty('data');
      expect(hook).toHaveBeenCalledTimes(mode === 'isolated' ? 0 : 1);
    },
  );

  it('flattens selected Maps, filters protected keys and normalizes a supported Date subclass once', async () => {
    let observations = 0;
    class Native extends Date {
      getTime() {
        observations++;
        return super.getTime();
      }
    }
    const value = new Map([
      ['safe', { ok: true, constructor: 'never', __v: 'never' }],
      ['native', new Native(2)],
      ['__proto__', { polluted: true }],
    ]);
    const f = ownedStageFixture({ mode: 'trusted' });
    f.adapter.find.mockResolvedValue([{ value }]);
    expect(await f.direct.find({}, { select: ['value', '-_id'] }, quietOutput)).toMatchObject({
      success: true,
      data: [{ value: { safe: { ok: true }, native: new Date(2) } }],
    });
    expect(observations).toBe(1);
    expect({}).not.toHaveProperty('polluted');
  });

  it('a named Map selection avoids unrelated proxy values; a fresh raw helper does not inherit trusted admission', async () => {
    const traps = vi.fn(() => {
      throw new Error('unselected');
    });
    const bad = new Proxy({}, { get: traps, ownKeys: traps });
    const row = {
      value: new Map([
        ['safe', { ok: 'selected', hidden: 'never' }],
        ['other', bad],
      ]),
    };
    const f = ownedStageFixture({
      mode: 'trusted',
      modelOptions: { permissionSchema: { 'value.safe.ok': true, 'value.safe.hidden': false } },
    });
    f.adapter.find.mockResolvedValue([row]);
    expect(await f.direct.find({}, { select: ['value.safe.ok', '-_id'] }, quietOutput)).toMatchObject({
      success: true,
      data: [{ value: { safe: { ok: 'selected' } } }],
    });
    row.value.set('safe', { ok: 'replacement', hidden: 'never' });
    expect(await f.direct.find({}, { select: ['value.safe.ok', '-_id'] }, quietOutput)).toMatchObject({
      success: true,
      data: [{ value: { safe: { ok: 'replacement' } } }],
    });
    await expect(f.direct.pickAllowedFields(row, 'list')).rejects.toBeInstanceOf(ServiceAuthorizationError);
    expect(traps).not.toHaveBeenCalled();
    expect(f.adapter.find).toHaveBeenCalledTimes(2);
  });

  it.each(sourceModes)(
    '%s keeps disposable getter views, staged returns and immutable diagnostic facts',
    async (mode) => {
      const facts = { owner: true };
      const seen: string[] = [];
      const first = vi.fn((doc, _permissions, context) => {
        seen.push(doc.name);
        doc.name = 'mutated';
        expect(context.docPermissions).not.toBe(facts);
        expect(Reflect.set(context.docPermissions, 'owner', false)).toBe(false);
        return 'first';
      });
      const second = vi.fn((doc, _permissions, context) => {
        seen.push(doc.name);
        expect(doc).not.toHaveProperty('first');
        expect(context.docPermissions.owner).toBe(true);
        return doc.name;
      });
      const f = ownedStageFixture({
        mode,
        omitStoredPaths: ['first', 'second'],
        modelOptions: {
          permissionSchema: { name: true, first: true, second: true, missing: true },
          docPermissions: { list: () => facts },
          virtuals: {
            first: { dependsOn: ['name'], get: first },
            second: { dependsOn: ['name'], get: second },
            missing: {
              dependsOn: ['name'],
              get: () => {
                throw new Error('getter body');
              },
            },
          },
        },
      });
      const source = { name: 'stable', first: 'stale', second: 'stale' };
      f.adapter.find.mockResolvedValue([source]);
      expect(
        await f.direct.find({}, { select: ['name', 'first', 'second', 'missing', '-_id'] }, quietOutput),
      ).toMatchObject({ success: true, data: [{ name: 'stable', first: 'first', second: 'stable' }] });
      expect(seen).toEqual(['stable', 'stable']);
      expect(source.name).toBe('stable');
      expect(first).toHaveBeenCalledTimes(1);
      expect(second).toHaveBeenCalledTimes(1);
      f.runtime.setModelOption(f.model.modelName, 'virtuals', {
        invalid: { dependsOn: ['name'], get: () => () => true },
      });
      f.runtime.setModelOption(f.model.modelName, 'permissionSchema', { invalid: true });
      const invalid = await f.direct.find({}, { select: ['invalid', '-_id'] }, quietOutput);
      expect(invalid).toMatchObject({ success: false, code: 'bad_request' });
      expect(invalid).not.toHaveProperty('data');
    },
  );
});
