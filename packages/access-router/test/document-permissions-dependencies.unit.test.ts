import mongoose from 'mongoose';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { Core } from '../src/core';
import { AccessRuntime } from '../src/runtime';
import Permission from '../src/permission';
import { PERMISSIONS } from '../src/symbols';
import { runWithRuntime } from '../src/runtime-context';
import type { ModelOutputContext, ModelRequest, ModelRouterOptions } from '../src/interfaces';
import {
  captureDocumentPermissionsDefinition,
  resolveDocumentPermissionsDefinition,
} from '../src/acl/document-permissions-definition';
import { captureModelAuthorizationConfiguration } from '../src/acl/model-output-planning';
import { planVirtualProjection } from '../src/acl/virtual-projection';
import { ModelRouter } from '../src/routers/model-router';

let sequence = 0;
const context = { operation: 'read' } as ModelOutputContext;

function fixture(options: ModelRouterOptions = {}) {
  const runtime = new AccessRuntime();
  runtime.setGlobalOption('logger', { warn: vi.fn(), info: vi.fn() });
  const model = mongoose.model(
    `DocDepsUnit${++sequence}`,
    new mongoose.Schema({
      name: String,
      ownerId: { type: String, select: false },
      readInput: String,
      updateInput: String,
      nested: { owner: String },
      contacts: [{ label: String }],
    }),
  );
  runtime.registerModelInstance(model.modelName, model);
  runtime.setModelOptions(model.modelName, {
    operationAccess: true,
    modelPermissionPrefix: 'm:',
    permissionSchema: { name: 'm:owner', ownerId: false, readInput: false, updateInput: false },
    ...options,
  });
  const request = {
    [PERMISSIONS]: new Permission({ reader: true }),
    query: {},
    params: {},
    get: () => undefined,
  } as unknown as ModelRequest;
  const core = runWithRuntime(runtime, () => (request.macl = new Core(request)));
  return { runtime, model, request, core };
}

afterEach(() => {
  vi.restoreAllMocks();
  mongoose.deleteModel(/^DocDepsUnit/);
});

describe('document-permission definitions', () => {
  it('resolves functions/descriptors directly and exact/default/custom access entries as coherent pairs', () => {
    const direct = () => ({ owner: true });
    const fallback = async () => ({ fallback: true });
    const read = () => ({ read: true });
    const audit = () => ({ audit: true });
    for (const access of ['read', 'list', 'audit']) {
      expect(resolveDocumentPermissionsDefinition(direct, access)).toMatchObject({ get: direct, dependsOn: [] });
      expect(resolveDocumentPermissionsDefinition({ get: direct, dependsOn: ['ownerId'] }, access)).toMatchObject({
        get: direct,
        dependsOn: ['ownerId'],
      });
    }
    const definitions = {
      default: { get: fallback, dependsOn: ['nested'] },
      read: { get: read, dependsOn: ['ownerId'] },
      list: direct,
      audit: { get: audit, dependsOn: [] },
      update: undefined,
    };
    expect(resolveDocumentPermissionsDefinition(definitions, 'read')).toMatchObject({
      get: read,
      dependsOn: ['ownerId'],
    });
    expect(resolveDocumentPermissionsDefinition(definitions, 'list')).toMatchObject({ get: direct, dependsOn: [] });
    expect(resolveDocumentPermissionsDefinition(definitions, 'audit')).toMatchObject({ get: audit, dependsOn: [] });
    for (const access of ['create', 'update', 'other'])
      expect(resolveDocumentPermissionsDefinition(definitions, access)).toMatchObject({
        get: fallback,
        dependsOn: ['nested'],
      });
    expect(resolveDocumentPermissionsDefinition({ read }, 'list')).toBeUndefined();
    expect(resolveDocumentPermissionsDefinition({}, 'read')).toBeUndefined();
    expect(resolveDocumentPermissionsDefinition(undefined, 'read')).toBeUndefined();
  });

  it('captures dense dependency arrays and never executes configuration accessors', () => {
    const get = () => ({ owner: true });
    const dependsOn = ['ownerId'];
    const original = { read: { get, dependsOn } };
    const captured = captureDocumentPermissionsDefinition(original);
    dependsOn.push('readInput');
    original.read.get = () => ({ owner: false });
    const resolved = resolveDocumentPermissionsDefinition(captured, 'read')!;
    expect(resolved.get).toBe(get);
    expect(resolved.dependsOn).toEqual(['ownerId']);
    expect(Object.isFrozen(resolved)).toBe(true);
    expect(Object.isFrozen(resolved.dependsOn)).toBe(true);
    const accessor = vi.fn(() => get);
    for (const input of [
      Object.defineProperty({}, 'get', { enumerable: true, get: accessor }),
      { read: Object.defineProperty({}, 'get', { enumerable: true, get: accessor }) },
      { get, dependsOn: Object.defineProperty(['ownerId'], '0', { get: accessor }) },
      new Proxy({ get }, { ownKeys: accessor }),
    ])
      expect(() => captureDocumentPermissionsDefinition(input)).toThrow();
    expect(accessor).not.toHaveBeenCalled();
  });

  it.each([
    null,
    false,
    'hook',
    [],
    { get: null },
    { get: () => ({}), typo: [] },
    { dependsOn: ['ownerId'] },
    { get: () => ({}), read: () => ({}) },
    { read: {} },
    { read: { get: 'no' } },
    { read: null },
    { default: () => ({}), unused: { dependsOn: ['ownerId'] } },
    { get: () => ({}), dependsOn: null },
    { get: () => ({}), dependsOn: 'ownerId' },
    { get: () => ({}), dependsOn: Array(1) },
    { get: () => ({}), dependsOn: ['nested.owner'] },
    { get: () => ({}), dependsOn: ['__proto__'] },
    { get: () => ({}), dependsOn: ['$where'] },
    { get: () => ({}), dependsOn: ['+ownerId'] },
    { get: () => ({}), dependsOn: ['owner Id'] },
    { 'custom.dotted': () => ({}) },
  ])('rejects malformed definitions, including inapplicable entries: %j', (input) => {
    expect(() => resolveDocumentPermissionsDefinition(input, 'read')).toThrow(/docPermissions/);
  });

  it('validates against the receiving persisted schema, including nested top-level containers', () => {
    const f = fixture();
    const get = () => ({ owner: true });
    f.runtime.setModelOption(f.model.modelName, 'virtuals', { computed: { get: () => 'virtual' } } as never);
    for (const dependency of ['missing', 'computed', 'id', 'nested.owner', 'constructor', '_doc', '__v']) {
      expect(() =>
        f.runtime.setModelOptions(f.model.modelName, {
          docPermissions: { get, dependsOn: [dependency] },
        }),
      ).toThrow(/dependsOn/);
    }
    f.runtime.setModelOption(f.model.modelName, 'docPermissions', { get, dependsOn: ['nested', 'contacts', '_id'] });
    expect(
      resolveDocumentPermissionsDefinition(f.runtime.getModelOptions(f.model.modelName).docPermissions, 'read')
        ?.dependsOn,
    ).toEqual(['nested', 'contacts', '_id']);
  });

  it('supports fluent/dotted/custom replacement, undefined fallback, and atomic rejected updates', () => {
    const f = fixture();
    const router = new ModelRouter(f.model.modelName, {}, f.runtime);
    const old = () => ({ old: true });
    const next = () => ({ next: true });
    router.docPermissions({ get: old, dependsOn: ['ownerId'] });
    router.docPermissions('read', { get: next, dependsOn: ['readInput'] });
    router.docPermissions('audit', { get: old, dependsOn: ['ownerId'] });
    router.set('docPermissions.default', { get: old, dependsOn: ['nested'] });
    const before = f.runtime.getModelOptions(f.model.modelName);
    const captured = captureModelAuthorizationConfiguration(f.runtime, f.model.modelName);
    expect(() => router.docPermissions('audit', { get: next, dependsOn: ['unknown'] })).toThrow(/persisted/);
    expect(f.runtime.getModelOptions(f.model.modelName).docPermissions).toBe(before.docPermissions);
    router.docPermissions('read', undefined);
    expect(
      resolveDocumentPermissionsDefinition(f.runtime.getModelOptions(f.model.modelName).docPermissions, 'read'),
    ).toMatchObject({ get: old, dependsOn: ['nested'] });
    expect(resolveDocumentPermissionsDefinition(captured.docPermissions, 'read')).toMatchObject({
      get: next,
      dependsOn: ['readInput'],
    });
    expect(Object.isFrozen(captured.docPermissions)).toBe(true);
    router.docPermissions(undefined);
    expect(f.runtime.getModelOptions(f.model.modelName).docPermissions).toBeUndefined();
  });

  it('rejects inherited/accessor options and partial descriptor edits before generic option cloning', () => {
    const f = fixture();
    const getter = vi.fn(() => ({ get: () => ({}) }));
    expect(() => f.runtime.setModelOptions(f.model.modelName, Object.create({ docPermissions: {} }))).toThrow(
      /data property/,
    );
    expect(() =>
      f.runtime.setModelOptions(
        f.model.modelName,
        Object.defineProperty({}, 'docPermissions', { get: getter, enumerable: true }),
      ),
    ).toThrow(/data property/);
    expect(() => f.runtime.setModelOption(f.model.modelName, 'docPermissions.read.get', getter as never)).toThrow(
      /together/,
    );
    expect(getter).not.toHaveBeenCalled();
  });

  it('owns readonly arrays and replaces complete access leaves without inheriting old/default dependencies', () => {
    const f = fixture();
    const get = () => ({ owner: true });
    const router = new ModelRouter(f.model.modelName, {}, f.runtime);
    const dependsOn = Object.freeze(['ownerId'] as const);
    router.docPermissions({
      default: { get, dependsOn: ['readInput'] },
      read: { get, dependsOn },
    });
    const captured = captureModelAuthorizationConfiguration(f.runtime, f.model.modelName);
    router.set('docPermissions.read', { get });
    expect(
      resolveDocumentPermissionsDefinition(f.runtime.getModelOptions(f.model.modelName).docPermissions, 'read'),
    ).toMatchObject({ get, dependsOn: [] });
    router.docPermissions('read', { get, dependsOn: [] });
    expect(
      resolveDocumentPermissionsDefinition(f.runtime.getModelOptions(f.model.modelName).docPermissions, 'read'),
    ).toMatchObject({ get, dependsOn: [] });
    expect(resolveDocumentPermissionsDefinition(captured.docPermissions, 'read')?.dependsOn).toEqual(['ownerId']);
    expect(resolveDocumentPermissionsDefinition(captured.docPermissions, 'read')?.dependsOn).not.toBe(dependsOn);
  });

  it.each([false, true])(
    'fetches only docPermissionsAccess inputs, independently of output/virtual access (catalog=%s)',
    (catalog) => {
      const get = () => ({ owner: true });
      const f = fixture({
        docPermissions: {
          read: { get, dependsOn: ['readInput'] },
          update: { get, dependsOn: ['updateInput'] },
        },
        permissionSchema: { name: true, receipt: true },
        virtuals: { receipt: { dependsOn: ['ownerId'], update: () => 'receipt' } } as never,
      });
      const configuration = captureModelAuthorizationConfiguration(f.runtime, f.model.modelName);
      const { catalog: capturedCatalog, ...legacy } = configuration;
      const plan = planVirtualProjection({
        receivingModelName: f.model.modelName,
        snapshot: catalog ? configuration : legacy,
        virtualAccess: 'update',
        outputAccess: 'read',
        docPermissionsAccess: 'update',
        requestedSelect: ['name', 'receipt'],
      });
      expect(plan.persistedFetchSelection).toEqual(expect.arrayContaining(['name', 'ownerId', 'updateInput']));
      expect(plan.persistedFetchSelection).not.toContain('readInput');
      expect(plan.outputSelection).not.toContain('updateInput');
      expect(plan.outputSelection).not.toContain('ownerId');
      expect(capturedCatalog).toBeDefined();
    },
  );

  it('explicit utilities preserve this/arguments, missing input invocation, sync/async maps and validation', async () => {
    const f = fixture();
    const doc = { name: 'missing-owner' };
    const calls: unknown[][] = [];
    const hook = function (this: ModelRequest, ...args: unknown[]) {
      expect(this).toBe(f.request);
      calls.push(args);
      return { owner: true };
    };
    for (const get of [
      hook,
      async function (this: ModelRequest, ...args: unknown[]) {
        return hook.apply(this, args);
      },
    ]) {
      f.runtime.setModelOption(f.model.modelName, 'docPermissions', { get, dependsOn: ['ownerId'] });
      const grants = await f.core.genDocPermissions(f.model.modelName, doc, 'read', context);
      expect(grants).toEqual({ owner: true });
      expect(Object.isFrozen(grants)).toBe(true);
      expect(calls.at(-1)![0]).toBe(doc);
      expect((calls.at(-1)![1] as Permission).has('reader')).toBe(true);
      expect(calls.at(-1)![2]).toMatchObject({ operation: 'read', docPermissionsAccess: 'read' });
      expect(Object.isFrozen(calls.at(-1)![2])).toBe(true);
      const output = await f.core.addDocPermissions(f.model.modelName, { ...doc }, 'read', context);
      expect(output).toHaveProperty('_permissions.owner', true);
    }
    expect(calls).toHaveLength(4);
    f.runtime.setModelOption(f.model.modelName, 'docPermissions', { get: () => ({ owner: 1 }) as never });
    await expect(f.core.genDocPermissions(f.model.modelName, doc, 'read', context)).rejects.toMatchObject({
      result: { code: 'bad_request' },
    });
  });

  it('raw helpers do no reads/computation, while planning includes private inputs without executing hooks', async () => {
    const hook = vi.fn(() => ({ owner: true }));
    const f = fixture({ docPermissions: { dependsOn: ['ownerId'], get: hook } });
    const find = vi.spyOn(f.model, 'find');
    const findOne = vi.spyOn(f.model, 'findOne');
    expect(await f.core.genSelect(f.model.modelName, 'read', ['name'])).toContain('ownerId');
    expect(
      await f.core.pickAllowedFields(f.model.modelName, { name: 'no-authority', ownerId: 'alice' }, 'read'),
    ).not.toHaveProperty('name');
    expect(hook).not.toHaveBeenCalled();
    expect(find).not.toHaveBeenCalled();
    expect(findOne).not.toHaveBeenCalled();
  });

  it('explicit genPopulate includes the target definition inputs, never the source definition inputs', async () => {
    const hook = vi.fn(() => ({ owner: true }));
    const source = fixture({ docPermissions: { get: hook, dependsOn: ['updateInput'] } });
    const target = mongoose.model(
      `DocDepsUnitTarget${++sequence}`,
      new mongoose.Schema({ name: String, privateOwner: String }),
    );
    source.model.schema.add({ ref: { type: mongoose.Schema.Types.ObjectId, ref: target.modelName } });
    source.runtime.registerModelInstance(target.modelName, target);
    source.runtime.setModelOptions(target.modelName, {
      operationAccess: true,
      permissionSchema: { name: true, privateOwner: false },
      docPermissions: { read: { get: hook, dependsOn: ['privateOwner'] } },
    });
    source.runtime.setModelOption(source.model.modelName, 'permissionSchema', { ref: true });
    const [populate] = await source.core.genPopulate(source.model.modelName, 'read', { path: 'ref', select: ['name'] });
    expect(populate.select).toEqual(expect.arrayContaining(['name', 'privateOwner', '_id']));
    expect(populate.select).not.toContain('updateInput');
    expect(hook).not.toHaveBeenCalled();
  });
});
