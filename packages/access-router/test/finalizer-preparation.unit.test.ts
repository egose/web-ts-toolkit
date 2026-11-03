import mongoose from 'mongoose';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { ModelOutputContext } from '../src/interfaces';
import { getCapturedAuthorizationOption } from '../src/acl/model-output-planning';
import * as calls from '../src/acl/service-authorization';
import * as definitions from '../src/acl/document-permissions-definition';
import { planAuthorizedModelProjection } from '../src/acl/output-projection';
import { finalizeModelOutput, finalizeModelOutputs } from '../src/output/finalize-model-output';
import { ownedStageFixture, sourceModes, stageAccess } from './owned-stage-test-fixture';

afterEach(() => vi.restoreAllMocks());

describe('owned finalizer preparation and disposable callback boundaries', () => {
  it.each(['none', 'inactive', 'missing'] as const)(
    'does not run unavailable getters or retain stale virtual values: %s',
    async (kind) => {
      const get = vi.fn(() => 'unexpected');
      const f = ownedStageFixture({
        configuration: {
          catalog: { paths: kind === 'none' ? ['when'] : ['when', 'v'], virtualPaths: kind === 'none' ? [] : ['v'] },
          permissionSchema: kind === 'none' ? { when: true } : { when: true, v: true },
          virtuals:
            kind === 'none' ? {} : kind === 'inactive' ? { v: { update: get } } : { v: { get, dependsOn: ['absent'] } },
        },
        select: ['when', 'v', '-_id'],
      });
      const inputs = [1, 2, 3].map((time) => ({ when: new Date(time), v: 'stale' }));
      const output = await finalizeModelOutputs({ ...f.args, inputs });
      expect(output).toEqual(inputs.map(({ when }) => ({ when })));
      expect(get).not.toHaveBeenCalled();
      for (let index = 0; index < inputs.length; index++) {
        expect(output[index].when).not.toBe(inputs[index].when);
        expect(inputs[index].v).toBe('stale');
      }
    },
  );

  it.each([1, 6])(
    'captures a document hook once per call and invokes it once for each of %s row stages',
    async (rows) => {
      const hook = vi.fn((doc) => ({ owner: doc.value > 0 }));
      const f = ownedStageFixture({
        configuration: {
          catalog: { paths: ['value'] },
          permissionSchema: { value: true },
          docPermissions: { default: hook },
        },
      });
      const read = vi.spyOn(calls, 'readServiceFinalizerConfiguration');
      const lookup = vi.spyOn(definitions, 'resolveDocumentPermissionsDefinition');
      const inputs = Array.from({ length: rows }, (_, value) => ({ value }));
      expect(await finalizeModelOutputs({ ...f.args, inputs })).toEqual(inputs);
      expect(read).toHaveBeenCalledTimes(1);
      expect(lookup).toHaveBeenCalledTimes(1);
      expect(hook).toHaveBeenCalledTimes(rows);
      const nextCall = f.ownCall();
      const plan = planAuthorizedModelProjection({
        authorization: nextCall,
        binding: f.binding,
        requestedSelect: ['-_id'],
      });
      // Planning resolves the same hook/dependency pair without executing it;
      // measure finalizer preparation independently of that separate work.
      lookup.mockClear();
      expect(await finalizeModelOutputs({ ...f.args, plan, inputs })).toEqual(inputs);
      expect(read).toHaveBeenCalledTimes(2);
      expect(lookup).toHaveBeenCalledTimes(1);
      expect(hook).toHaveBeenCalledTimes(rows * 2);
    },
  );

  it('does not traverse unused lifecycle aliases or give callbacks a private configuration/native backing reference', async () => {
    const forbidden = vi.fn(() => {
      throw new Error('not an output diagnostic');
    });
    const context = Object.defineProperties(
      {},
      Object.fromEntries(
        [
          'originalDocumentSnapshot',
          'finalDocumentSnapshot',
          'currentDocument',
          'mongooseModel',
          'changes',
          'allowedData',
        ].map((key) => [key, { get: forbidden }]),
      ),
    );
    const hookContexts: ModelOutputContext[] = [];
    const f = ownedStageFixture({
      configuration: {
        catalog: { paths: ['value'] },
        permissionSchema: { value: true },
        defaults: { unused: Array.from({ length: 128 }, (_, index) => new Date(index)) },
        docPermissions: {
          read: (_doc, _permissions, diagnostic: ModelOutputContext) => {
            hookContexts.push(diagnostic);
            return {};
          },
        },
      },
    });
    const observe = vi.spyOn(Date.prototype, 'getTime');
    const contexts: ModelOutputContext[] = [];
    expect(
      await finalizeModelOutputs({
        ...f.args,
        inputs: [{ value: 'yes' }, { value: 'also' }],
        context: context as never,
        onFinalized: (_row, diagnostic) => contexts.push(diagnostic),
      }),
    ).toEqual([{ value: 'yes' }, { value: 'also' }]);
    expect(forbidden).not.toHaveBeenCalled();
    expect(observe).not.toHaveBeenCalled();
    for (const diagnostic of [...contexts, ...hookContexts]) {
      expect(Object.isFrozen(diagnostic)).toBe(true);
      for (const key of [
        'originalDocumentSnapshot',
        'finalDocumentSnapshot',
        'currentDocument',
        'mongooseModel',
        'changes',
        'defaults',
        'snapshot',
        'configuration',
      ])
        expect(diagnostic).not.toHaveProperty(key);
    }
  });

  it.each(['read', 'custom', 'custom.read'])(
    'function-attached hook lookup slots are not a live configuration API: %s',
    async (docPermissionsAccess) => {
      const lookup = vi.fn(() => () => ({ owner: true }));
      const bare = vi.fn(() => ({ owner: false }));
      const fallback = vi.fn(() => ({ owner: false }));
      Object.defineProperty(bare, 'read', { get: lookup });
      const f = ownedStageFixture({
        configuration: {
          catalog: { paths: ['value'] },
          permissionSchema: { value: 'doc:owner' },
          docPermissions: docPermissionsAccess === 'read' ? bare : { custom: bare, default: fallback },
        },
      });
      const access = { ...stageAccess(), docPermissionsAccess };
      const call = f.ownCall({ access });
      const plan = planAuthorizedModelProjection({
        authorization: call,
        binding: f.binding,
        requestedSelect: ['-_id'],
      });
      expect(
        await finalizeModelOutputs({ ...f.args, ...access, plan, inputs: [{ value: 'first' }, { value: 'second' }] }),
      ).toEqual([{}, {}]);
      expect(lookup).not.toHaveBeenCalled();
      expect(bare).toHaveBeenCalledTimes(docPermissionsAccess === 'custom.read' ? 0 : 2);
      expect(fallback).toHaveBeenCalledTimes(docPermissionsAccess === 'custom.read' ? 2 : 0);
    },
  );

  it.each(sourceModes)(
    '%s captures getter dependency views before permission callbacks and never treats argument mutation as a return',
    async (mode) => {
      const source = { payload: { name: 'original', when: new Date(1) } };
      const permission = vi.fn(() => {
        source.payload.name = 'authorization closure change';
        source.payload.when.setTime(9);
        return true;
      });
      const getter = vi.fn((doc, _permissions, context) => {
        expect(context).not.toHaveProperty('originalDocumentSnapshot');
        const value = doc.payload.name;
        expect(doc.payload.when.getTime()).toBe(1);
        doc.payload.name = 'getter argument write';
        return value;
      });
      const f = ownedStageFixture({
        mode,
        configuration: {
          catalog: { paths: ['payload', 'v'], opaquePaths: ['payload'], virtualPaths: ['v'] },
          permissionSchema: { payload: true, v: permission },
          virtuals: { v: { get: getter, dependsOn: ['payload'] } },
        },
      });
      const output = await finalizeModelOutput({ ...f.args, input: source });
      expect(output.v).toBe('original');
      expect((output.payload as any).name).toBe(mode === 'trusted' ? 'authorization closure change' : 'original');
      expect(permission).toHaveBeenCalledTimes(1);
      expect(getter).toHaveBeenCalledTimes(1);
    },
  );

  it.each(sourceModes)(
    '%s retains lean/hydrated selection, dotted metadata, native isolation and a non-enumerable alias',
    async (mode) => {
      const f = ownedStageFixture({
        mode,
        configuration: {
          catalog: { paths: ['value', 'hidden', 'when', 'meta', 'meta.permissions'] },
          permissionSchema: { value: true, hidden: false, when: true },
          documentPermissionField: 'meta.permissions',
          exposedDocPermissionKeys: ['visible'],
          stripPermissionsField: false,
          disableFieldPermissions: false,
        },
        select: ['value', 'when', '-_id'],
      });
      const metadata = { visible: { when: new Date(2) }, secret: false, _view: { value: true } };
      const raw = { value: 'yes', hidden: 'no', when: new Date(1), meta: { permissions: metadata } };
      const hydrated = new f.model(raw);
      const toObject = vi.spyOn(hydrated, 'toObject');
      const outputs = await finalizeModelOutputs({ ...f.args, inputs: [raw, hydrated] });
      expect(outputs).toEqual(
        [0, 1].map(() => ({
          value: 'yes',
          when: new Date(1),
          meta: { permissions: { visible: metadata.visible, _view: metadata._view } },
        })),
      );
      for (const output of outputs) {
        expect(Object.getOwnPropertyDescriptor(output, 'permissions')!.enumerable).toBe(false);
        expect(output.permissions).toBe((output.meta as any).permissions);
        expect(output.when).not.toBe(raw.when);
        expect((output.permissions as any).visible.when).not.toBe(metadata.visible.when);
      }
      (outputs[0].permissions as any).visible.when.setTime(99);
      expect((outputs[1].permissions as any).visible.when.getTime()).toBe(2);
      expect(metadata.visible.when.getTime()).toBe(2);
      expect(hydrated.meta!.permissions).toEqual(metadata);
      expect(toObject).toHaveBeenCalledTimes(1);
    },
  );

  it('isolated same-ID rows retain disposable native hook/getter views and separate immutable diagnostic facts at concurrency one', async () => {
    const id = new mongoose.mongo.BSON.ObjectId();
    const payload = { when: new Date(1), bytes: Buffer.from([1]), id };
    const maps = { owner: true };
    const hookContexts: ModelOutputContext[] = [],
      getterContexts: ModelOutputContext[] = [];
    const hook = vi.fn((doc, _permissions, context) => {
      expect(doc.payload).toEqual(payload);
      expect(context.docPermissions).toEqual({});
      hookContexts.push(context);
      doc.payload.when.setTime(99);
      doc.payload.bytes[0] = 9;
      doc.payload.id.id = Buffer.alloc(12);
      return maps;
    });
    const rule = vi.fn((_permissions, facts) => {
      expect(facts.owner).toBe(true);
      expect(Reflect.set(facts, 'owner', false)).toBe(false);
      return true;
    });
    const observe = vi.fn((view, permissions, context) => {
      expect(permissions.has('reader')).toBe(true);
      expect(view.payload).toEqual(payload);
      expect(context.docPermissions.owner).toBe(true);
      expect(context.scopePath).toEqual([]);
      expect(context).not.toHaveProperty('currentDocument');
      getterContexts.push(context);
      return 'observed';
    });
    const mutate = vi.fn((view, permissions, context) => {
      observe(view, permissions, context);
      view.payload.when.setTime(99);
      view.payload.bytes[0] = 9;
      view.payload.id.id = Buffer.alloc(12);
      expect(Reflect.set(context.docPermissions, 'owner', false)).toBe(false);
      return 'mutated';
    });
    const f = ownedStageFixture({
      configuration: {
        catalog: {
          paths: ['payload', 'first', 'second', 'mutate', 'observe'],
          opaquePaths: ['payload'],
          virtualPaths: ['mutate', 'observe'],
        },
        permissionSchema: { payload: true, first: rule, second: rule, mutate: true, observe: true },
        docPermissions: { read: hook },
        virtuals: { mutate: { get: mutate }, observe: { get: observe } },
      },
    });
    const inputs = [1, 2].map((value) => ({ _id: 'same', payload, first: value, second: value }));
    const contexts: ModelOutputContext[] = [];
    const outputs = await finalizeModelOutputs({
      ...f.args,
      inputs,
      onFinalized: (_output, context) => {
        contexts.push(context);
        expect(Reflect.set(context.docPermissions, 'owner', false)).toBe(false);
      },
    });
    expect(outputs).toEqual(inputs.map(({ _id, ...input }) => ({ ...input, mutate: 'mutated', observe: 'observed' })));
    expect(hook).toHaveBeenCalledTimes(2);
    expect(rule).toHaveBeenCalledTimes(4);
    expect(mutate).toHaveBeenCalledTimes(2);
    expect(observe).toHaveBeenCalledTimes(4);
    expect(hookContexts[0]).not.toBe(hookContexts[1]);
    expect(contexts[0].docPermissions).not.toBe(contexts[1].docPermissions);
    expect(getterContexts[0].docPermissions).toBe(getterContexts[1].docPermissions);
    expect(payload.when.getTime()).toBe(1);
    expect(payload.bytes[0]).toBe(1);
    expect(payload.id.equals(id)).toBe(true);
    expect(Object.isFrozen(maps)).toBe(false);
  });

  it('embedded children finish before parent getters, share each owning row facts and receive separate disposable views', async () => {
    const events: string[] = [];
    const child = vi.fn((doc, _permissions, context) => {
      expect(context.scopePath).toEqual(['children', 'sub']);
      expect(context.docPermissions.owner).toBe(true);
      events.push(`child:${doc.name}`);
      const name = doc.name;
      doc.name = 'mutated';
      return name;
    });
    const parent = vi.fn((doc, _permissions, context) => {
      expect(doc.children).toEqual([
        { name: 'a', v: 'a' },
        { name: 'b', v: 'b' },
      ]);
      expect(context.scopePath).toEqual([]);
      events.push('parent');
      return 'complete';
    });
    const hook = vi.fn(() => ({ owner: true }));
    const f = ownedStageFixture({
      select: ['children.name', 'children.v', 'summary', '-children._id', '-_id'],
      modelOptions: {
        permissionSchema: { children: { read: true, sub: { name: true, v: true } }, summary: true },
        virtuals: { children: { sub: { v: { get: child } } }, summary: { get: parent, dependsOn: ['children'] } },
        docPermissions: { read: hook },
      },
    });
    const input = {
      children: [
        { _id: 'same', name: 'a' },
        { _id: 'same', name: 'b' },
      ],
    };
    const outputs = await finalizeModelOutputs({ ...f.args, inputs: [input, input] });
    expect(outputs).toEqual(
      [0, 1].map(() => ({
        children: [
          { name: 'a', v: 'a' },
          { name: 'b', v: 'b' },
        ],
        summary: 'complete',
      })),
    );
    expect(events).toEqual(['child:a', 'child:b', 'parent', 'child:a', 'child:b', 'parent']);
    expect(hook).toHaveBeenCalledTimes(2);
    expect(child).toHaveBeenCalledTimes(4);
    expect(parent).toHaveBeenCalledTimes(2);
    expect(child.mock.calls[0][2].docPermissions).toBe(parent.mock.calls[0][2].docPermissions);
    expect(child.mock.calls[2][2].docPermissions).not.toBe(child.mock.calls[0][2].docPermissions);
    expect(input.children.map((child) => child.name)).toEqual(['a', 'b']);
  });

  it.each(['binding', 'call'] as const)('rejects changed %s before consuming another prepared row', async (kind) => {
    const hook = vi.fn(() => ({}));
    const f = ownedStageFixture({
      configuration: {
        catalog: { paths: ['value'] },
        permissionSchema: { value: true },
        docPermissions: { read: hook },
      },
    });
    await expect(
      finalizeModelOutputs({
        ...f.args,
        inputs: [{ value: 1 }, { value: 2 }],
        onFinalized: () => {
          if (kind === 'binding') f.plan.authorizationBinding = { ...f.binding, modelName: 'wrong' };
          else f.plan.authorization = f.ownCall();
        },
      }),
    ).rejects.toBeInstanceOf(calls.ServiceAuthorizationError);
    expect(hook).toHaveBeenCalledTimes(1);
  });
});
