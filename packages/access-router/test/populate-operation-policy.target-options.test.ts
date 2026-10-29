import mongoose from 'mongoose';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createAccessRuntime } from '../dist/index.mjs';
import { createSetCore } from '../src/core';
import type { ModelRequest } from '../src/interfaces';
import { captureModelAuthorizationConfiguration } from '../src/acl/model-output-planning';
import * as planning from '../src/acl/model-output-planning';
import { captureRelatedTargets } from '../src/acl/related-execution';
import { resolveVirtualPopulateDependencies } from '../src/acl/virtual-populate-dependencies';
import { prepareSubdocumentOutput } from '../src/acl/subdocument-output';
import { readServiceAuthorization } from '../src/acl/service-authorization';
import { useMongoTestDatabase } from './setup';

useMongoTestDatabase();
const flags = ['requireOperationAccessForPopulateQueries', 'requireOperationAccessForPopulateDependencies'] as const;
const quiet = { includePermissions: false, includeFieldPermissions: false };
let sequence = 0;
afterEach(() => {
  vi.restoreAllMocks();
  mongoose.deleteModel(/^MpoOptions/);
});

function fixture() {
  const api = createAccessRuntime();
  const n = ++sequence;
  const User = mongoose.model(`MpoOptionsUser${n}`, new mongoose.Schema({ name: String, balance: Number }));
  const ref = { type: mongoose.Schema.Types.ObjectId, ref: User.modelName };
  const Document = mongoose.model(`MpoOptionsDocument${n}`, new mongoose.Schema({ name: String, user: ref }));
  const docRef = { type: mongoose.Schema.Types.ObjectId, ref: Document.modelName };
  const Project = mongoose.model(
    `MpoOptionsProject${n}`,
    new mongoose.Schema({ document: docRef, user: ref, children: [{ document: docRef, user: ref }] }),
  );
  api.createRouter(User, { operationAccess: false, permissionSchema: { name: true, balance: false } });
  const descriptor = {
    get: (_d, _p, _c, inputs) => inputs.user?.balance ?? null,
    dependsOnPopulate: [{ path: 'user', select: 'balance' }],
  };
  const documentRouter = api.createRouter(Document, {
    operationAccess: false,
    permissionSchema: { name: true, user: true, total: true },
    virtuals: { total: descriptor },
  } as never);
  const router = api.createRouter(Project, {
    operationAccess: true,
    permissionSchema: {
      document: true,
      user: true,
      total: true,
      children: { read: true, sub: { document: true, user: true, total: true } },
    },
    virtuals: { total: descriptor, children: { sub: { total: descriptor } } },
    stripPermissionsField: true,
  } as never);
  return { api, User, Document, Project, router, documentRouter };
}

async function serviceFor(f: ReturnType<typeof fixture>) {
  const req = {} as ModelRequest;
  await createSetCore(f.api.runtime)(req, {} as never, () => {});
  return { req, service: req.macl.getService(f.Project.modelName) };
}

describe.each(flags)('MPO-01 target-owned %s', (flag) => {
  it('keeps this pair raw while model defaults stay live through setup and bootstrap restore', () => {
    const f = fixture();
    expect(f.api.getDefaultModelOptions()[flag]).toBe(true);
    expect(f.api.getGlobalOptions()).not.toHaveProperty(flag);
    expect(f.api.getModelOptions(f.Document.modelName)[flag]).toBeUndefined();
    const construction = f.router.options;
    f.api.setDefaultModelOptions({ [flag]: false, listHardLimit: 73 });
    for (const update of [
      () => f.api.setModelOptions(f.Document.modelName, { sortableFields: ['name'] }),
      () => {
        f.api.runtime.clearOpenApiRoutes();
        f.api.createRouter(f.Document, {});
      },
      () => f.router.setOptions({ sortableFields: ['user'] }),
      () => {
        f.api.runtime.clearOpenApiRoutes();
        f.api.createRouter(f.Project, {});
      },
    ])
      update();
    expect(f.api.getModelOptions(f.Document.modelName)[flag]).toBeUndefined();
    expect(f.api.getModelOptions(f.Project.modelName)[flag]).toBeUndefined();
    expect(f.api.getModelOption(f.Document.modelName, flag)).toBe(false);
    expect(f.api.getModelOptions(f.Document.modelName).listHardLimit).toBe(73);
    expect(f.router.options).toBe(construction);
    const New = mongoose.model(`MpoOptionsNew${++sequence}`, new mongoose.Schema({ name: String }));
    f.api.createRouter(New, {});
    expect(f.api.getModelOptions(New.modelName)[flag]).toBeUndefined();
    expect(f.api.getModelOptions(New.modelName).listHardLimit).toBe(73);
    expect(captureModelAuthorizationConfiguration(f.api.runtime, New.modelName)[flag]).toBe(false);
    const bootstrap = f.api.runtime.createBootstrapSnapshot();
    f.api.setModelOption(f.Document.modelName, flag, true);
    f.api.setDefaultModelOption(flag, true);
    f.api.runtime.restoreBootstrapSnapshot(bootstrap);
    f.api.setDefaultModelOption(flag, true);
    expect(f.api.getModelOption(f.Document.modelName, flag)).toBe(true);
    expect(f.api.getModelOptions(f.Document.modelName)[flag]).toBeUndefined();
  });

  it('normalizes whole/exact model/default/router setters, clears only explicit undefined, and preserves omissions', () => {
    const f = fixture();
    const otherFlag = flags.find((key) => key !== flag)!;
    const target = f.Document.modelName;
    const router = f.documentRouter;
    const modelSetters = [
      (value: unknown) => f.api.setModelOptions(target, { [flag]: value } as never),
      (value: unknown) => f.api.setModelOption(target, flag, value as never),
      (value: unknown) => f.api.runtime.setModelOptions(target, { [flag]: value } as never),
      (value: unknown) => f.api.runtime.setModelOption(target, flag, value as never),
      (value: unknown) => router.setOptions({ [flag]: value } as never),
      (value: unknown) => router.setOption(flag, value as never),
    ];
    for (const set of modelSetters) {
      for (const inherited of [false, true]) {
        f.api.setDefaultModelOption(flag, inherited);
        for (const value of [false, true, undefined, null, 0, 1, '', 'false', [], {}, Object(false), () => false]) {
          set(value);
          const stored = value === undefined ? undefined : value !== false;
          expect(f.api.getModelOptions(target)[flag]).toBe(stored);
          expect(captureModelAuthorizationConfiguration(f.api.runtime, target)[flag]).toBe(
            stored === undefined ? inherited : stored,
          );
          f.api.setModelOptions(target, { stripDisallowedSort: true });
          expect(f.api.getModelOptions(target)[flag]).toBe(stored);
          expect(captureModelAuthorizationConfiguration(f.api.runtime, target)[otherFlag]).toBe(true);
        }
      }
    }
    f.api.setModelOption(target, flag, undefined);
    for (const set of [
      (value: unknown) => f.api.setDefaultModelOptions({ [flag]: value } as never),
      (value: unknown) => f.api.setDefaultModelOption(flag, value as never),
      (value: unknown) => f.api.runtime.setDefaultModelOptions({ [flag]: value } as never),
      (value: unknown) => f.api.runtime.setDefaultModelOption(flag, value as never),
    ]) {
      for (const value of [false, true, undefined, null, 0, '', 'false', [], {}, Object(false), () => false]) {
        set(value);
        expect(f.api.getDefaultModelOptions()[flag]).toBe(value === undefined ? undefined : value !== false);
        expect(captureModelAuthorizationConfiguration(f.api.runtime, target)[flag]).toBe(value !== false);
        expect(f.api.getModelOptions(target)[flag]).toBeUndefined();
      }
    }
    expect(createAccessRuntime().getDefaultModelOption(flag)).toBe(true);
  });

  it('rejects stale explicit global keys through bulk/exact/runtime/alias setters before any publication', () => {
    const f = fixture();
    const before = f.api.getGlobalOptions();
    // Accepted globals retain their ordinary shallow/snapshot and logger-identity contract.
    f.api.setGlobalOptions(before);
    expect(f.api.getGlobalOption('logger')).toBe(before.logger);
    for (const value of [false, true, undefined, null, 'false']) {
      for (const set of [
        () => f.api.setGlobalOptions({ logger: {}, [flag]: value } as never),
        () => f.api.setGlobalOption(flag as never, value as never),
        () => f.api.set({ [flag]: value } as never),
        () => f.api.set(flag as never, value as never),
        () => f.api.runtime.setGlobalOptions({ [flag]: value } as never),
        () => f.api.runtime.setGlobalOption(flag as never, value as never),
      ]) {
        expect(set).toThrow(new RegExp(`${flag}.*target.*setModelOptions.*setDefaultModelOptions`));
        expect(f.api.getGlobalOptions()).toEqual(before);
        expect(f.api.getModelOptions(f.Document.modelName)[flag]).toBeUndefined();
      }
    }
  });

  it('uses each actual target and the same captured defaults for ordinary/private/child policies, never source flags', async () => {
    const f = fixture();
    f.api.setDefaultModelOption(flag, true);
    f.api.setModelOptions(f.Project.modelName, { [flag]: false });
    f.api.setModelOptions(f.Document.modelName, { [flag]: false });
    const source = captureModelAuthorizationConfiguration(f.api.runtime, f.Project.modelName);
    const [privateUser] = resolveVirtualPopulateDependencies(source, [], 'total', 'read');
    expect(source[flag]).toBe(false);
    expect(privateUser.target.configuration[flag]).toBe(true);
    const [document, user] = captureRelatedTargets(f.api.runtime, f.Project.modelName, {
      populate: ['document', 'user'],
    });
    expect(document.model).toBe(f.Document);
    expect(document.configuration[flag]).toBe(false);
    expect(user.configuration[flag]).toBe(true);
    const [documentsUser] = resolveVirtualPopulateDependencies(document.configuration, [], 'total', 'read');
    expect(documentsUser.target.configuration[flag]).toBe(true);
    const { service } = await serviceFor(f);
    const child = prepareSubdocumentOutput(
      service,
      'children',
      'subRead',
      'read',
      'read',
      ['user'],
      [{ path: 'children.user' }],
    );
    const childView = readServiceAuthorization(child.state.authorization, child.state.binding);
    expect(childView.configuration[flag]).toBe(false);
    expect(childView.relatedTargets[0].configuration[flag]).toBe(true);
    expect(childView.relatedTargets[0].configuration.populatePolicyDefaults).toBe(
      childView.configuration.populatePolicyDefaults,
    );
    f.api.setDefaultModelOption(flag, false);
    f.api.setModelOption(f.User.modelName, flag, true);
    expect(
      captureRelatedTargets(f.api.runtime, f.Project.modelName, { populate: ['user'] })[0].configuration[flag],
    ).toBe(true);
    expect(privateUser.target.configuration[flag]).toBe(true);
  });

  it('captures defaults before even the source option read can change them', () => {
    const f = fixture();
    f.api.setDefaultModelOption(flag, false);
    const original = f.api.runtime.getModelOptions.bind(f.api.runtime);
    vi.spyOn(f.api.runtime, 'getModelOptions').mockImplementation((name) => {
      f.api.setDefaultModelOption(flag, true);
      return original(name);
    });
    const configuration = captureModelAuthorizationConfiguration(f.api.runtime, f.Project.modelName);
    expect(configuration[flag]).toBe(false);
    expect(resolveVirtualPopulateDependencies(configuration, [], 'total', 'read')[0].target.configuration[flag]).toBe(
      false,
    );
    expect(captureModelAuthorizationConfiguration(f.api.runtime, f.Project.modelName)[flag]).toBe(true);
  });

  it('uses proposed self-reference options during eager validation and current owned options during capture', () => {
    const api = createAccessRuntime();
    const name = `MpoOptionsSelf${++sequence}`;
    const Self = mongoose.model(
      name,
      new mongoose.Schema({ ref: { type: mongoose.Schema.Types.ObjectId, ref: name }, name: String }),
    );
    api.setDefaultModelOption(flag, true);
    api.createRouter(Self, {
      [flag]: false,
      permissionSchema: { name: true },
      virtuals: { computed: { get: () => true, dependsOnPopulate: [{ path: 'ref', select: 'name' }] } },
    } as never);
    const capture = () =>
      resolveVirtualPopulateDependencies(
        captureModelAuthorizationConfiguration(api.runtime, name),
        [],
        'computed',
        'read',
      )[0];
    expect(capture().target.configuration[flag]).toBe(false);
    api.setModelOption(name, flag, undefined);
    expect(capture().target.configuration[flag]).toBe(true);
  });

  it('captures service defaults before source options are read and refreshed', async () => {
    const f = fixture();
    f.api.setDefaultModelOption(flag, false);
    f.api.setModelOption(f.Project.modelName, 'overrideFilter.read', () => false);
    const { service } = await serviceFor(f);
    const read = f.api.runtime.getModelOptions.bind(f.api.runtime);
    vi.spyOn(f.api.runtime, 'getModelOptions').mockImplementation((name) => {
      if (name === f.Project.modelName) f.api.setDefaultModelOption(flag, true);
      return read(name);
    });
    const configurations: ReturnType<typeof captureModelAuthorizationConfiguration>[] = [];
    const capture = planning.captureModelAuthorizationConfiguration;
    vi.spyOn(planning, 'captureModelAuthorizationConfiguration').mockImplementation((...args) => {
      const value = capture(...args);
      configurations.push(value);
      return value;
    });
    expect(await service.findOne({}, { populate: ['document', 'user'] })).toMatchObject({
      success: false,
      code: 'forbidden',
    });
    expect(configurations).toHaveLength(3);
    for (const value of configurations) {
      expect(value[flag]).toBe(false);
      expect(value.populatePolicyDefaults).toBe(configurations[0].populatePolicyDefaults);
    }
    expect(await service.findOne({}, { populate: ['document', 'user'] })).toMatchObject({
      success: false,
      code: 'forbidden',
    });
    for (const value of configurations.slice(3)) expect(value[flag]).toBe(true);
    expect(configurations[3].populatePolicyDefaults).not.toBe(configurations[0].populatePolicyDefaults);
  });

  it('treats raw null target values as strict even when the held default is false', () => {
    const f = fixture();
    f.api.setDefaultModelOption(flag, false);
    const snapshot = f.api.runtime.createBootstrapSnapshot();
    snapshot.modelOptions[f.User.modelName][flag] = null as never;
    f.api.runtime.restoreBootstrapSnapshot(snapshot);
    const configuration = captureModelAuthorizationConfiguration(f.api.runtime, f.Project.modelName);
    expect(configuration[flag]).toBe(false);
    expect(resolveVirtualPopulateDependencies(configuration, [], 'total', 'read')[0].target.configuration[flag]).toBe(
      true,
    );
    expect(
      captureRelatedTargets(f.api.runtime, f.Project.modelName, { populate: ['user'] })[0].configuration[flag],
    ).toBe(true);
  });

  it('holds target overrides and defaults across a source await, then refreshes on the same service/request', async () => {
    const f = fixture();
    f.api.setDefaultModelOption(flag, false);
    f.api.setModelOption(f.User.modelName, flag, true);
    const { service } = await serviceFor(f);
    let enter!: () => void;
    let release!: () => void;
    const entered = new Promise<void>((done) => (enter = done));
    const held = new Promise<void>((done) => (release = done));
    let calls = 0;
    f.api.setModelOption(f.Project.modelName, 'overrideFilter.read', async () => {
      if (++calls === 1) {
        enter();
        await held;
      }
      return false;
    });
    const configurations: Array<{ name: string; value: ReturnType<typeof captureModelAuthorizationConfiguration> }> =
      [];
    const capture = planning.captureModelAuthorizationConfiguration;
    vi.spyOn(planning, 'captureModelAuthorizationConfiguration').mockImplementation((...args) => {
      const value = capture(...args);
      configurations.push({ name: args[1], value });
      return value;
    });
    const pending = service.findOne({}, { populate: ['document', 'user'] });
    await entered;
    f.api.setDefaultModelOption(flag, true);
    f.api.setModelOption(f.User.modelName, flag, false);
    release();
    expect(await pending).toMatchObject({ success: false, code: 'forbidden' });
    expect(configurations).toHaveLength(3);
    for (const { name, value } of configurations) {
      expect(value[flag]).toBe(name === f.User.modelName);
      if (name !== f.User.modelName)
        expect(resolveVirtualPopulateDependencies(value, [], 'total', 'read')[0].target.configuration[flag]).toBe(true);
    }
    expect(await service.findOne({}, { populate: ['document', 'user'] })).toMatchObject({
      success: false,
      code: 'forbidden',
    });
    expect(configurations).toHaveLength(6);
    for (const { name, value } of configurations.slice(3)) {
      expect(value[flag]).toBe(name !== f.User.modelName);
      if (name !== f.User.modelName)
        expect(resolveVirtualPopulateDependencies(value, [], 'total', 'read')[0].target.configuration[flag]).toBe(
          false,
        );
    }
  });
});

describe.each(['lean', 'hydrated'] as const)('MPO-01 real target isolation (%s)', (hydration) => {
  it.each([
    [false, false],
    [false, true],
    [true, false],
    [true, true],
  ])(
    'keeps Document query=%s and User dependency=%s independent of Project, with live same-service inheritance',
    async (queries, dependencies) => {
      const f = fixture();
      f.api.setDefaultModelOptions({
        requireOperationAccessForPopulateQueries: queries,
        requireOperationAccessForPopulateDependencies: dependencies,
      });
      f.api.setModelOptions(f.Project.modelName, {
        requireOperationAccessForPopulateQueries: !queries,
        requireOperationAccessForPopulateDependencies: !dependencies,
        hydration: { findOne: hydration },
      });
      f.api.setModelOptions(f.User.modelName, { requireOperationAccessForPopulateQueries: true });
      const user = await f.User.create({ name: 'user', balance: 17 });
      const document = await f.Document.create({ name: 'document', user: user._id });
      const project = await f.Project.create({ document: document._id, user: user._id });
      const { service } = await serviceFor(f);
      const args = {
        select: ['document', 'user', 'total'],
        populate: [
          { path: 'document', select: ['name', 'user', 'total'] },
          { path: 'user', select: ['name'] },
        ],
      };
      const first = await service.findOne({ _id: project._id }, args, quiet);
      expect(first.success).toBe(true);
      if (!first.success) throw new Error('source must remain admitted');
      expect(String(first.data.user)).toBe(String(user._id));
      expect(first.data.total).toBe(dependencies ? undefined : 17);
      if (queries) expect(String(first.data.document)).toBe(String(document._id));
      else {
        expect(first.data.document).toMatchObject({ name: 'document' });
        expect(first.data.document.total).toBe(dependencies ? undefined : 17);
      }
      f.api.setDefaultModelOptions({
        requireOperationAccessForPopulateQueries: !queries,
        requireOperationAccessForPopulateDependencies: !dependencies,
      });
      const next = await service.findOne({ _id: project._id }, args, quiet);
      expect(next.success).toBe(true);
      if (!next.success) throw new Error('later source must remain admitted');
      expect(next.data.total).toBe(dependencies ? 17 : undefined);
      if (queries) {
        expect(next.data.document).toMatchObject({ name: 'document' });
        expect(next.data.document.total).toBe(dependencies ? 17 : undefined);
      } else expect(String(next.data.document)).toBe(String(document._id));
      expect(String(next.data.user)).toBe(String(user._id));
      expect(await service.findOne({ _id: project._id }, { select: ['user'] }, quiet)).toMatchObject({ success: true });
    },
  );
});

it('MPO-01 keeps same-spelled business filter/create/update fields ordinary', async () => {
  const f = fixture();
  f.Project.schema.add(Object.fromEntries(flags.map((flag) => [flag, Boolean])));
  f.api.setModelOptions(f.Project.modelName, {
    permissionSchema: Object.fromEntries(flags.map((flag) => [flag, true])),
  });
  const { service } = await serviceFor(f);
  const data = Object.fromEntries(flags.map((flag) => [flag, false]));
  const created = await service.create(data, { select: [...flags] }, quiet);
  expect(created).toMatchObject({ success: true, data: [data] });
  const updated = await service.updateOne(data, { [flags[0]]: true }, { select: [...flags] }, quiet);
  expect(updated).toMatchObject({ success: true, data: { ...data, [flags[0]]: true } });
  expect(await f.Project.countDocuments({ ...data, [flags[0]]: true })).toBe(1);
  expect(f.api.getDefaultModelOptions()).toMatchObject(Object.fromEntries(flags.map((flag) => [flag, true])));
});
