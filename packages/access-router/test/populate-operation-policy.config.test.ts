import mongoose from 'mongoose';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createAccessRuntime } from '../dist/index.mjs';
import { createSetCore } from '../src/core';
import type { ModelRequest } from '../src/interfaces';
import { captureRelatedTargets } from '../src/acl/related-execution';
import { captureModelAuthorizationConfiguration } from '../src/acl/model-output-planning';
import { resolveVirtualPopulateDependencies } from '../src/acl/virtual-populate-dependencies';
import * as planning from '../src/acl/model-output-planning';
import { getPopulateTargetMeta } from '../src/acl/populate-target';

const flags = ['requireOperationAccessForPopulateQueries', 'requireOperationAccessForPopulateDependencies'] as const;
const configurationError = (detail: RegExp) =>
  expect.objectContaining({
    result: expect.objectContaining({ code: 'bad_request', errors: [{ detail: expect.stringMatching(detail) }] }),
  });
let serial = 0;
afterEach(() => {
  vi.restoreAllMocks();
  mongoose.deleteModel(/^PopConfig/);
});

function fixture() {
  const api = createAccessRuntime();
  const target = mongoose.model(`PopConfigTarget${++serial}`, new mongoose.Schema({ name: String, secret: String }));
  const source = mongoose.model(
    `PopConfigSource${serial}`,
    new mongoose.Schema({
      name: String,
      ref: { type: mongoose.Schema.Types.ObjectId, ref: target.modelName },
      children: [{ ref: { type: mongoose.Schema.Types.ObjectId, ref: target.modelName } }],
    }),
  );
  api.createRouter(source, {
    permissionSchema: { name: true, ref: true, children: { sub: { ref: true } } },
    operationAccess: true,
  });
  return { api, source, target };
}

async function requestFor(f: ReturnType<typeof fixture>) {
  const req = {} as ModelRequest;
  await createSetCore(f.api.runtime)(req, {} as never, () => {});
  return req;
}

describe('POP-01 mandatory populate configuration', () => {
  it('resolves target refs from the owning runtime even without an ambient/default Mongoose binding', () => {
    const mongo = new mongoose.Mongoose();
    const api = createAccessRuntime();
    const target = mongo.model('PopConfigOwnedTarget', new mongo.Schema({ name: String }));
    const source = mongo.model(
      'PopConfigOwnedSource',
      new mongo.Schema({ ref: { type: mongo.Schema.Types.ObjectId, ref: target.modelName } }),
    );
    api.createRouter(source, { permissionSchema: { ref: true } });
    expect(() => captureRelatedTargets(api.runtime, source.modelName, { populate: 'ref' })).toThrow(
      configurationError(/Populate target.*must be configured first/),
    );
    api.registerModelInstance(target.modelName, target);
    api.setModelOptions(target.modelName, { permissionSchema: {} });
    const [captured] = captureRelatedTargets(api.runtime, source.modelName, { populate: 'ref' });
    expect(captured.modelName).toBe(target.modelName);
    expect(captured.configuration.permissionSchema).toEqual({});
  });

  it('exposes only the new strict-default pair in actual runtime snapshots', () => {
    const { api } = fixture();
    for (const flag of flags) expect(api.getGlobalOption(flag)).toBe(true);
    expect(api.getGlobalOptions()).not.toHaveProperty('requireRegisteredPopulateModels');
    expect(api.getGlobalOptions()).not.toHaveProperty('requireReadOperationAccessForPopulateDependencies');
  });

  it.each(['missing', 'instance-only', 'missing-schema', 'missing-model'] as const)(
    'rejects %s ordinary targets before source hooks, target I/O or mutation persistence with both flags false',
    async (state) => {
      const f = fixture();
      f.api.setGlobalOptions({ [flags[0]]: false, [flags[1]]: false });
      if (state !== 'missing') f.api.registerModelInstance(f.target.modelName, f.target);
      if (state === 'missing-schema' || state === 'missing-model')
        f.api.setModelOptions(f.target.modelName, {
          operationAccess: true,
          ...(state === 'missing-model' ? { permissionSchema: {} } : {}),
        });
      if (state === 'missing-model') {
        const snapshot = f.api.runtime.createBootstrapSnapshot();
        delete snapshot.modelInstances[f.target.modelName];
        f.api.runtime.restoreBootstrapSnapshot(snapshot);
      }
      const hook = vi.fn(() => false);
      f.api.setModelOptions(f.source.modelName, { overrideFilter: { read: hook }, prepare: { create: hook } });
      const sourceRead = vi.spyOn(f.source.collection, 'findOne');
      const insert = vi.spyOn(f.source.collection, 'insertOne');
      const update = vi.spyOn(f.source.collection, 'updateOne');
      const targetRead = vi.spyOn(f.target.collection, 'find');
      const req = await requestFor(f);
      const service = req.macl.getService(f.source.modelName);
      const args = { populate: ['ref'] };
      const expected = {
        success: false,
        code: 'bad_request',
        errors: [{ detail: expect.stringMatching(new RegExp(`Populate target.*${f.target.modelName}`)) }],
      };
      expect(await service.findOne({}, args)).toMatchObject(expected);
      expect(await service.create({ name: 'new' }, args)).toMatchObject(expected);
      expect(await service.updateOne({}, { name: 'new' }, args)).toMatchObject(expected);
      expect(await service.upsert({}, { name: 'new' }, args)).toMatchObject(expected);
      const id = String(new mongoose.Types.ObjectId());
      const childOptions = { populate: [{ path: 'ref' }] };
      expect(await service.readSub(id, 'children', id, childOptions)).toMatchObject(expected);
      await expect(req.macl.genPopulate(f.source.modelName, 'read', 'ref')).rejects.toThrow(
        configurationError(/Populate target/),
      );
      expect(hook).not.toHaveBeenCalled();
      expect(sourceRead).not.toHaveBeenCalled();
      expect(insert).not.toHaveBeenCalled();
      expect(update).not.toHaveBeenCalled();
      expect(targetRead).not.toHaveBeenCalled();
      expect(f.api.runtime.hasModel(f.target.modelName)).toBe(state === 'missing-schema' || state === 'missing-model');
    },
  );

  it.each([null, false, [], 'allow', () => ({ name: true })].map((schema) => [schema]))(
    'rejects a non-object effective target permissionSchema: %j',
    (permissionSchema) => {
      const f = fixture();
      f.api.registerModelInstance(f.target.modelName, f.target);
      f.api.setModelOptions(f.target.modelName, { permissionSchema } as never);
      expect(() => captureRelatedTargets(f.api.runtime, f.source.modelName, { populate: 'ref' })).toThrow(
        configurationError(/effective object permissionSchema/),
      );
    },
  );

  it.each(['model', 'default', 'empty'] as const)(
    'accepts an effective %s schema without mounting target routes and captures it immutably',
    async (mode) => {
      const f = fixture();
      const sourceRoutes = f.api.runtime.getOpenApiRoutes();
      f.api.registerModelInstance(f.target.modelName, f.target);
      f.api.setModelOptions(f.target.modelName, { operationAccess: { read: true } });
      const schema = mode === 'empty' ? {} : { name: true, secret: false };
      if (mode === 'default') f.api.setDefaultModelOptions({ permissionSchema: schema });
      else f.api.setModelOption(f.target.modelName, 'permissionSchema', schema);
      f.api.setGlobalOptions({ [flags[0]]: false, [flags[1]]: false });
      f.api.setModelOption(
        f.source.modelName,
        'virtuals.computed' as never,
        {
          get: () => true,
          dependsOnPopulate: [{ path: 'ref', select: 'secret' }],
        } as never,
      );
      const configuration = captureModelAuthorizationConfiguration(f.api.runtime, f.source.modelName);
      const [dependency] = resolveVirtualPopulateDependencies(configuration, [], 'computed', 'read');
      expect(dependency.target.configuration.permissionSchema).toEqual(schema);
      const [target] = captureRelatedTargets(f.api.runtime, f.source.modelName, { populate: 'ref' });
      expect(target.configuration.permissionSchema).toEqual(schema);
      expect(target.kind).not.toBe('passthrough');
      expect(f.api.runtime.getOpenApiRoutes()).toEqual(sourceRoutes);
      const req = await requestFor(f);
      const [populate] = await req.macl.genPopulate(f.source.modelName, 'read', 'ref');
      expect(populate.path).toBe('ref');
      if (mode === 'empty') expect(populate.select).not.toContain('name');
      f.api.setModelOption(f.target.modelName, 'permissionSchema', { secret: true });
      expect(target.configuration.permissionSchema).toEqual(schema);
    },
  );

  it('keeps unused ordinary refs and count-only models without field policies valid', async () => {
    const f = fixture();
    f.api.registerModelInstance(f.target.modelName, f.target);
    f.api.setModelOptions(f.target.modelName, { operationAccess: { count: true } });
    const req = await requestFor(f);
    const count = vi.spyOn(f.target.collection, 'countDocuments').mockResolvedValue(4);
    expect(await req.macl.getService(f.target.modelName).count({})).toMatchObject({ success: true, data: 4 });
    expect(count).toHaveBeenCalledTimes(1);
    expect(() => captureModelAuthorizationConfiguration(f.api.runtime, f.source.modelName)).not.toThrow();
    expect(() =>
      captureRelatedTargets(f.api.runtime, f.source.modelName, {
        include: [{ path: 'count', model: f.target.modelName, op: 'count', localField: '_id', foreignField: '_id' }],
      }),
    ).not.toThrow();
  });

  it('rejects missing private target schema atomically and revalidates before writes even with both flags false', async () => {
    const f = fixture();
    f.api.registerModelInstance(f.target.modelName, f.target);
    f.api.setModelOptions(f.target.modelName, { operationAccess: true });
    f.api.setGlobalOptions({ [flags[0]]: false, [flags[1]]: false });
    const descriptor = { get: () => true, dependsOnPopulate: [{ path: 'ref', select: 'secret' }] };
    const before = f.api.getModelOptions(f.source.modelName);
    expect(() => f.api.setModelOptions(f.source.modelName, { virtuals: { computed: descriptor } } as never)).toThrow(
      configurationError(/effective object permissionSchema/),
    );
    expect(f.api.getModelOptions(f.source.modelName)).toEqual(before);
    expect(() => f.api.setModelOption(f.source.modelName, 'virtuals.computed' as never, descriptor as never)).toThrow(
      configurationError(/effective object permissionSchema/),
    );
    expect(f.api.getModelOptions(f.source.modelName)).toEqual(before);
    f.api.setModelOption(f.target.modelName, 'permissionSchema', {});
    f.api.setModelOptions(f.source.modelName, { virtuals: { computed: descriptor } } as never);
    const captured = captureModelAuthorizationConfiguration(f.api.runtime, f.source.modelName);
    const [dependency] = resolveVirtualPopulateDependencies(captured, [], 'computed', 'read');
    expect(dependency.target.configuration.permissionSchema).toEqual({});
    f.api.setModelOption(f.target.modelName, 'permissionSchema', undefined);
    const req = await requestFor(f);
    const insert = vi.spyOn(f.source.collection, 'insertOne');
    const update = vi.spyOn(f.source.collection, 'updateOne');
    const sourceRead = vi.spyOn(f.source.collection, 'findOne');
    const targetRead = vi.spyOn(f.target.collection, 'find');
    const service = req.macl.getService(f.source.modelName);
    const expected = {
      success: false,
      code: 'bad_request',
    };
    expect(await service.create({ name: 'new' })).toMatchObject(expected);
    const id = String(new mongoose.Types.ObjectId());
    expect(await service.createSub(id, 'children', { ref: id })).toMatchObject(expected);
    expect(await service.updateSub(id, 'children', id, { ref: id })).toMatchObject(expected);
    expect(insert).not.toHaveBeenCalled();
    expect(update).not.toHaveBeenCalled();
    expect(sourceRead).not.toHaveBeenCalled();
    expect(targetRead).not.toHaveBeenCalled();
    expect(dependency.target.configuration.permissionSchema).toEqual({});
  });
});

describe.each(flags)('POP-01 runtime-owned %s', (flag) => {
  it('normalizes every setter, owns snapshots/bootstrap state and isolates runtimes independently', () => {
    const f = fixture();
    const other = createAccessRuntime();
    const independent = flags.find((key) => key !== flag)!;
    const before = f.api.getGlobalOptions();
    for (const set of [
      (value: boolean | undefined) => f.api.setGlobalOptions({ [flag]: value }),
      (value: boolean | undefined) => f.api.setGlobalOption(flag, value),
      (value: boolean | undefined) => f.api.set({ [flag]: value }),
      (value: boolean | undefined) => f.api.set(flag, value),
      (value: boolean | undefined) => f.api.runtime.setGlobalOptions({ [flag]: value }),
      (value: boolean | undefined) => f.api.runtime.setGlobalOption(flag, value),
    ]) {
      for (const value of [false, true, undefined, false]) {
        set(value);
        expect(f.api.getGlobalOption(flag)).toBe(value !== false);
        expect(captureModelAuthorizationConfiguration(f.api.runtime, f.source.modelName)[flag]).toBe(value !== false);
        expect(f.api.getGlobalOptions()[independent]).toBe(true);
        expect(other.getGlobalOption(flag)).toBe(true);
      }
    }
    const bootstrap = f.api.runtime.createBootstrapSnapshot();
    f.api.setGlobalOptions({ logger: {} });
    expect(f.api.getGlobalOption(flag)).toBe(false);
    f.api.setGlobalOption(flag, true);
    f.api.runtime.restoreBootstrapSnapshot(bootstrap);
    expect(f.api.getGlobalOption(flag)).toBe(false);
    expect(before[flag]).toBe(true);
    expect(Object.isFrozen(before)).toBe(true);
    for (const value of [null, 0, 1, '', 'false', [], {}, Object(false), () => false]) {
      for (const set of [
        () => f.api.setGlobalOptions({ [flag]: value } as never),
        () => f.api.setGlobalOption(flag, value as never),
        () => f.api.set({ [flag]: value } as never),
        () => f.api.set(flag, value as never),
        () => f.api.runtime.setGlobalOptions({ [flag]: value } as never),
        () => f.api.runtime.setGlobalOption(flag, value as never),
      ]) {
        f.api.setGlobalOption(flag, false);
        set();
        expect(f.api.getGlobalOption(flag)).toBe(true);
      }
    }
  });

  it('captures source/ordinary/include/private targets before a source await and refreshes later calls', async () => {
    const f = fixture();
    f.api.registerModelInstance(f.target.modelName, f.target);
    f.api.setModelOptions(f.target.modelName, { permissionSchema: {}, operationAccess: true });
    f.api.setModelOption(
      f.source.modelName,
      'virtuals.computed' as never,
      {
        get: () => true,
        dependsOnPopulate: [{ path: 'ref', select: 'secret' }],
      } as never,
    );
    f.api.setGlobalOption(flag, false);
    const req = await requestFor(f);
    const service = req.macl.getService(f.source.modelName);
    let enter!: () => void;
    let release!: () => void;
    const entered = new Promise<void>((done) => (enter = done));
    const held = new Promise<void>((done) => (release = done));
    f.api.setModelOption(f.source.modelName, 'overrideFilter.read', async () => {
      enter();
      await held;
      return false;
    });
    const snapshots: ReturnType<typeof captureModelAuthorizationConfiguration>[] = [];
    const original = planning.captureModelAuthorizationConfiguration;
    vi.spyOn(planning, 'captureModelAuthorizationConfiguration').mockImplementation((...args) => {
      const result = original(...args);
      snapshots.push(result);
      return result;
    });
    const args = {
      populate: ['ref'],
      include: [{ path: 'joined', model: f.source.modelName, op: 'read', localField: '_id', foreignField: '_id' }],
    };
    const pending = service.findOne({}, args as never);
    await entered;
    try {
      expect(snapshots).toHaveLength(3);
      snapshots.forEach((configuration) => expect(configuration[flag]).toBe(false));
      f.api.setGlobalOption(flag, true);
      f.api.setModelOption(f.target.modelName, 'permissionSchema', { name: true });
    } finally {
      release();
    }
    expect(await pending).toMatchObject({ success: false, code: 'forbidden' });
    snapshots.forEach((configuration) => expect(configuration[flag]).toBe(false));
    for (const configuration of snapshots.filter((entry) => entry.virtuals)) {
      const [dependency] = resolveVirtualPopulateDependencies(configuration, [], 'computed', 'read');
      expect(dependency.target.configuration[flag]).toBe(false);
      expect(dependency.target.configuration.permissionSchema).toEqual({});
    }
    expect(await service.findOne({}, args as never)).toMatchObject({ success: false, code: 'forbidden' });
    expect(snapshots).toHaveLength(6);
    snapshots.slice(3).forEach((configuration) => expect(configuration[flag]).toBe(true));
  });

  it('ignores model/query controls while retaining same-spelled business fields', async () => {
    const f = fixture();
    f.source.schema.add({ [flag]: Boolean });
    const transform = vi.fn(() => false);
    f.api.setModelOptions(f.source.modelName, {
      [flag]: false,
      permissionSchema: { [flag]: true },
      overrideFilter: { read: transform },
    } as never);
    const req = await requestFor(f);
    const filter = { [flag]: false };
    expect(
      await req.macl
        .getService(f.source.modelName)
        .findOne(filter, { [flag]: false } as never, { [flag]: false } as never),
    ).toMatchObject({ success: false, code: 'forbidden' });
    expect(transform.mock.calls[0][0]).toEqual(filter);
    const configuration = captureModelAuthorizationConfiguration(f.api.runtime, f.source.modelName);
    expect(configuration[flag]).toBe(true);
    expect(configuration.catalog.persistedPaths).toContain(flag);
  });
});

it('POP-01 request-only helper captures target flags, schema, original selection and actor before field awaits', async () => {
  const f = fixture();
  f.api.registerModelInstance(f.target.modelName, f.target);
  f.api.setModelOptions(f.target.modelName, { operationAccess: true, permissionSchema: { name: true, secret: false } });
  f.api.setGlobalOptions({ [flags[0]]: false, [flags[1]]: false });
  let enter!: () => void;
  let release!: () => void;
  const entered = new Promise<void>((done) => (enter = done));
  const held = new Promise<void>((done) => (release = done));
  f.api.setModelOption(f.source.modelName, 'permissionSchema.ref', async () => {
    enter();
    await held;
    return true;
  });
  const req = await requestFor(f);
  const descriptor = { path: 'ref', select: ['name'], match: { name: 'requested' } };
  const pending = req.macl.genPopulate(f.source.modelName, 'read', descriptor);
  await entered;
  try {
    f.api.setGlobalOptions({ [flags[0]]: true, [flags[1]]: true });
    f.api.setModelOption(f.target.modelName, 'permissionSchema', { secret: true });
    descriptor.select[0] = 'secret';
    descriptor.match.name = 'changed';
  } finally {
    release();
  }
  const [populate] = await pending;
  const meta = getPopulateTargetMeta(populate)!;
  expect(meta.snapshot.permissionSchema).toEqual({ name: true, secret: false });
  expect(meta.snapshot[flags[0]]).toBe(false);
  expect(meta.snapshot[flags[1]]).toBe(false);
  expect(meta.requestedSelect).toEqual(['name']);
  expect(populate.match).toEqual({ name: 'requested' });
  expect(populate.select).not.toContain('secret');
  const [next] = await req.macl.genPopulate(f.source.modelName, 'read', descriptor);
  expect(getPopulateTargetMeta(next)!.snapshot[flags[0]]).toBe(true);
  expect(next.select).toContain('secret');
});
