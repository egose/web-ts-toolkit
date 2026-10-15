import mongoose from 'mongoose';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { AccessRuntime } from '../src/runtime';
import { runWithRuntime } from '../src/runtime-context';
import { Core } from '../src/core';
import { DataCore } from '../src/core-data';
import { Service } from '../src/services/service';
import { DataService } from '../src/services/data-service';
import { PERMISSIONS } from '../src/symbols';
import Permission from '../src/permission';
import type { DataRequest, ModelRequest } from '../src/interfaces';
import { deferred, HookProbe, turn } from './hook-admission-fixture';

let serial = 0;
afterEach(() => {
  vi.restoreAllMocks();
  mongoose.deleteModel(/^ArlHookOwner/);
});

describe('ARL-07 captured request/runtime hook ownership', () => {
  it('retains service hook owners when another runtime replaces the request core slots', async () => {
    const barrier = deferred();
    const probes = [new HookProbe(), new HookProbe()];
    probes.forEach((probe) => {
      probe.barrier = barrier.promise;
    });
    const req = { [PERMISSIONS]: new Permission({}) } as unknown as ModelRequest & DataRequest;
    const name = `ArlHookOwner${++serial}`;
    const model = mongoose.model(name, new mongoose.Schema({ key: String }));
    const services = probes.map((probe, index) => {
      const runtime = new AccessRuntime();
      runtime.setGlobalOptions({ requestComplexity: { maxHookConcurrency: index + 1 } });
      runtime.registerModelInstance(name, model);
      runtime.setModelOptions(name, {
        modelPermissionPrefix: 'doc:',
        permissionSchema: { key: 'doc:visible' },
        docPermissions: { read: () => probe.run('grant', () => ({ visible: true })) },
        decorate: { read: (doc) => probe.run('model', () => doc) },
      });
      runtime.setDataOptions('data', {
        data: [{ key: `data-${index}`, secret: 'private' }],
        permissionSchema: { key: () => probe.run('data-field', () => true), secret: false },
        decorate: { read: (doc) => probe.run('data-decorate', () => doc) },
      });
      return runWithRuntime(runtime, () => {
        req.macl = new Core(req);
        req.dacl = new DataCore(req);
        return { runtime, model: new Service(req, name), data: new DataService(req, 'data') };
      });
    });
    const context = { modelName: name, operation: 'read', mongooseModel: model };
    const work = runWithRuntime(services[1].runtime, () =>
      Promise.all(
        services.flatMap((service) => [
          service.model.decorate({ key: 'model' }, 'read', context),
          service.data.find({}),
          service.data.decorate({ key: 'data' }, 'read'),
          service.model.genDocPermissions({ key: 'model' }, 'read', context),
          service.model.pickAllowedFields({ key: 'model' }, 'read'),
        ]),
      ),
    );
    try {
      await turn();
      expect(probes.map((probe) => probe.active)).toEqual([1, 2]);
    } finally {
      barrier.resolve();
    }
    const result = await work;
    expect(result[1]).toMatchObject({ success: true, data: [{ key: 'data-0' }] });
    expect(result[6]).toMatchObject({ success: true, data: [{ key: 'data-1' }] });
    expect(probes.map((probe) => probe.peak)).toEqual([1, 2]);
    expect(probes.map((probe) => probe.calls.length)).toEqual([7, 7]);
  });

  it('keeps same-request runtimes and separate requests independent under ambient/config changes', async () => {
    const a = new AccessRuntime();
    const b = new AccessRuntime();
    a.setGlobalOptions({ requestComplexity: { maxHookConcurrency: 1, maxBulkConcurrency: 1 } });
    b.setGlobalOptions({ requestComplexity: { maxHookConcurrency: 2, maxBulkConcurrency: 2 } });
    const name = `ArlHookOwner${++serial}`;
    const model = mongoose.model(name, new mongoose.Schema({ _id: String, key: String }));
    vi.spyOn(model.collection, 'findOne').mockImplementation((() =>
      Promise.resolve({ _id: 'id', key: 'value' })) as never);
    const barrier = deferred();
    const probes = { 'a:same': new HookProbe(), 'a:other': new HookProbe(), 'b:same': new HookProbe() };
    for (const probe of Object.values(probes)) probe.barrier = barrier.promise;
    for (const [owner, runtime] of [
      ['a', a],
      ['b', b],
    ] as const) {
      runtime.registerModelInstance(name, model);
      runtime.setModelOptions(name, {
        permissionSchema: { key: true, computed: true },
        virtuals: {
          computed: {
            read: function (this: ModelRequest & { label: string }) {
              const label = `${owner}:${this.label}` as keyof typeof probes;
              return probes[label].run(label, () => label);
            },
          },
        },
      } as never);
      runtime.setDataOptions('data', { data: [{ key: 'data' }], permissionSchema: { key: true } });
    }
    const req = (label: string) =>
      ({ label, [PERMISSIONS]: new Permission({}) }) as unknown as ModelRequest & DataRequest;
    const same = req('same');
    const other = req('other');
    const make = (request: ModelRequest & DataRequest, runtime: AccessRuntime) =>
      runWithRuntime(runtime, () => {
        request.macl = new Core(request);
        request.dacl = new DataCore(request);
        return { model: new Service(request, name), data: new DataService(request, 'data') };
      });
    const first = make(same, a);
    const sibling = make(same, a);
    const secondRequest = make(other, a);
    const secondRuntime = make(same, b);
    a.setGlobalOptions({ requestComplexity: { maxHookConcurrency: 5, maxBulkConcurrency: 4 } });
    expect(runWithRuntime(b, () => first.model.getVirtualHookConcurrencyLimit())).toBe(1);
    expect(runWithRuntime(b, () => first.data.getRequestComplexity())).toMatchObject({
      maxHookConcurrency: 1,
      maxBulkConcurrency: 1,
    });
    expect(make(req('new'), a).data.getRequestComplexity()).toMatchObject({
      maxHookConcurrency: 5,
      maxBulkConcurrency: 4,
    });
    const services = [first, sibling, secondRequest, secondRequest, secondRuntime, secondRuntime, secondRuntime];
    // Invoke A's retained services while B is ambient and owns the mutable req.macl slot.
    const work = runWithRuntime(b, () =>
      Promise.all(services.map((service) => service.model.findOne({}, {}, { includeFieldPermissions: false }))),
    );
    try {
      await turn();
      expect(Object.values(probes).map((probe) => probe.active)).toEqual([1, 1, 2]);
    } finally {
      barrier.resolve();
    }
    const results = await work;
    expect(results.map((result) => result.success && result.data.computed)).toEqual([
      'a:same',
      'a:same',
      'a:other',
      'a:other',
      'b:same',
      'b:same',
      'b:same',
    ]);
    expect(Object.values(probes).map((probe) => probe.peak)).toEqual([1, 1, 2]);
  });

  it('shares output-helper, core grant, data-field and decorator stages on the same owner', async () => {
    const runtime = new AccessRuntime();
    runtime.setGlobalOptions({ requestComplexity: { maxHookConcurrency: 2 } });
    const probe = new HookProbe();
    const name = `ArlHookOwner${++serial}`;
    const model = mongoose.model(name, new mongoose.Schema({ _id: String, key: String, secret: String }));
    runtime.registerModelInstance(name, model);
    runtime.setModelOptions(name, {
      permissionSchema: { key: 'doc:visible', secret: false },
      modelPermissionPrefix: 'doc:',
      docPermissions: { read: () => probe.run('grant', () => ({ visible: true })) },
      decorate: { read: (doc) => probe.run('model-decorate', () => doc) },
    });
    runtime.setDataOptions('data', {
      data: [{ key: 'data', secret: 'private' }],
      permissionSchema: { key: { read: () => probe.run('field', () => true) }, secret: false },
      decorate: { read: (doc) => probe.run('data-decorate', () => doc) },
      decorateAll: { list: (docs) => probe.run('data-all', () => docs) },
    });
    const req = { [PERMISSIONS]: new Permission({}) } as unknown as ModelRequest & DataRequest;
    const values = await runWithRuntime(runtime, async () => {
      const core = (req.macl = new Core(req));
      const data = (req.dacl = new DataCore(req));
      const doc = { _id: 'id', key: 'value', secret: 'private' };
      const context = { modelName: name, mongooseModel: model, operation: 'read' };
      return Promise.all([
        core.pickAllowedFields(name, doc, 'read'),
        core.genDocPermissions(name, doc, 'read', context),
        core.decorate(name, { key: 'value' }, 'read', context),
        data.pickAllowedFields('data', doc, 'read'),
        data.genSelect('data', 'read', ['key']),
        data.decorate('data', { key: 'data' }, 'read'),
        data.decorateAll('data', [{ key: 'data' }], 'list'),
      ]);
    });
    expect(values[0]).toMatchObject({ key: 'value' });
    expect(values[0]).not.toHaveProperty('secret');
    expect(values[1]).toEqual({ visible: true });
    expect(values[3]).toEqual({ key: 'value' });
    expect(values[4]).toEqual(['key']);
    expect(probe.calls).toHaveLength(7);
    expect(probe.peak).toBe(2);
    expect(probe.active).toBe(0);
  });
});
