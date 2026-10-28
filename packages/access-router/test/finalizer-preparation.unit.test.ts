import mongoose, { mongo } from 'mongoose';
import { afterEach, describe, expect, it, vi } from 'vitest';
import Permission from '../src/permission';
import { AccessRuntime } from '../src/runtime';
import type { ModelHookContext } from '../src/interfaces';
import type { AccessRouterRequest } from '../src/interfaces/request';
import type { ServiceOutputContext } from '../src/interfaces/service-authorization';
import type { AuthorizationConfiguration } from '../src/acl/service-authorization';
import * as serviceAuthorization from '../src/acl/service-authorization';
import * as modelOutputPlanning from '../src/acl/model-output-planning';
import * as documentHelpers from '../src/helpers/document';
import { readDocumentAuthorization } from '../src/acl/document-authorization';
import { planAuthorizedModelProjection } from '../src/acl/output-projection';
import { planVirtualProjection } from '../src/acl/virtual-projection';
import { finalizeModelOutput, finalizeModelOutputs, type FinalizeSnapshot } from '../src/output/finalize-model-output';

const access = { operation: 'read', virtualAccess: 'read', outputAccess: 'read', docPermissionsAccess: 'read' };

function fixture(configuration: AuthorizationConfiguration, requestedSelect = ['-_id'], effectiveAccess = access) {
  const binding = {
    request: {} as AccessRouterRequest,
    runtime: new AccessRuntime(),
    model: {},
    modelName: 'Order',
  };
  binding.runtime.setGlobalOptions({ requestComplexity: { maxHookConcurrency: 1 } });
  const authorization = serviceAuthorization.resolveServiceAuthorization({
    binding,
    access: effectiveAccess,
    configuration,
    requestPermissions: new Permission({ reader: true }),
  });
  const plan = planAuthorizedModelProjection({ authorization, binding, requestedSelect });
  const args = {
    receivingModelName: 'Order',
    request: binding.request,
    plan,
    snapshot: configuration as FinalizeSnapshot,
    ...effectiveAccess,
  };
  return { binding, authorization, args };
}

afterEach(() => {
  vi.restoreAllMocks();
  mongoose.deleteModel(/^Arcpu03/);
});

describe('ARCPU-03 finalizer pass preparation', () => {
  it.each(['none', 'inactive', 'missing', 'private'] as const)(
    'does not copy a getter-only stable document when no getter can run: %s',
    async (kind) => {
      const getter = vi.fn(() => 'unexpected');
      const snapshot: FinalizeSnapshot = {
        permissionSchema: { when: true, ...(kind === 'none' ? {} : { v: true }) },
        virtuals:
          kind === 'none'
            ? {}
            : kind === 'inactive'
              ? { v: { update: getter } }
              : {
                  v: {
                    get: getter,
                    dependsOn: kind === 'missing' ? ['absent'] : [],
                    ...(kind === 'private' ? { dependsOnPopulate: [{ path: 'customer' }] } : {}),
                  },
                },
      } as FinalizeSnapshot;
      const permissions = { has: () => false };
      const plan = planVirtualProjection({
        receivingModelName: 'Order',
        snapshot,
        ...access,
        requestedSelect: ['when', 'v', '-_id'],
        globalPermissions: permissions,
      });
      const inputs = [1, 2, 3].map((time) => ({ when: new Date(time), v: 'stale' }));
      const copies = vi.spyOn(Date.prototype, 'getTime');
      const outputs = await finalizeModelOutputs({
        receivingModelName: 'Order',
        request: {} as AccessRouterRequest,
        snapshot,
        plan,
        ...access,
        inputs,
        docPermissions: {},
        globalPermissions: permissions,
        concurrencyLimit: 1,
      });
      // Exactly one Date clone per row for output normalization. Previously the
      // unused stableBase made this two, even with zero virtual candidates.
      expect(copies).toHaveBeenCalledTimes(inputs.length);
      expect(getter).not.toHaveBeenCalled();
      expect(outputs).toEqual(inputs.map(({ when }) => ({ when })));
      for (let index = 0; index < inputs.length; index++) {
        expect(outputs[index].when).not.toBe(inputs[index].when);
        expect(inputs[index].v).toBe('stale');
      }
    },
  );

  it.each([1, 6])('resolves the captured document hook once per pass for %s rows, not per row', async (rows) => {
    const hook = vi.fn((doc) => ({ owner: doc.value }));
    const f = fixture({
      catalog: { paths: ['value'] },
      permissionSchema: { value: true },
      docPermissions: { default: hook },
      stripPermissionsField: true,
    });
    const read = vi.spyOn(serviceAuthorization, 'readServiceFinalizerConfiguration');
    const option = vi.spyOn(modelOutputPlanning, 'getCapturedAuthorizationOption');
    const inputs = Array.from({ length: rows }, (_, value) => ({ value }));
    expect(await finalizeModelOutputs({ ...f.args, inputs })).toEqual(inputs);
    expect(read).toHaveBeenCalledTimes(1);
    expect(option).toHaveBeenCalledTimes(1);
    expect(hook).toHaveBeenCalledTimes(rows);
    // A second invocation owns fresh preparation, even when reusing this plan.
    expect(await finalizeModelOutputs({ ...f.args, inputs })).toEqual(inputs);
    expect(read).toHaveBeenCalledTimes(2);
    expect(option).toHaveBeenCalledTimes(2);
    expect(hook).toHaveBeenCalledTimes(rows * 2);
  });

  it('keeps only the projected-stage and metadata document copies in an authenticated no-virtual list', async () => {
    const f = fixture({
      catalog: { paths: ['value', 'when'] },
      permissionSchema: { value: true, when: true },
      stripPermissionsField: true,
    });
    const inputs = [1, 2, 3].map((value) => ({ value, when: new Date(value) }));
    const isolate = vi.spyOn(documentHelpers, 'deepIsolateValue');
    const outputs = await finalizeModelOutputs({ ...f.args, inputs });
    const fullDocumentCopies = isolate.mock.calls.filter(
      ([value]) => value && typeof value === 'object' && 'value' in value && 'when' in value,
    );
    // Normalization owns its separate copy. Of the explicit finalizer copies,
    // only the projected snapshot and metadata source remain: no stableBase.
    expect(fullDocumentCopies).toHaveLength(inputs.length * 2);
    expect(outputs).toEqual(inputs);
    expect(f.args.plan.candidates).toEqual([]);
  });

  it('does not duplicate a large base-context snapshot for a single no-virtual invocation', async () => {
    const f = fixture({ catalog: { paths: ['value'] }, permissionSchema: { value: true } });
    const context = {
      originalDocumentSnapshot: { dates: Array.from({ length: 128 }, (_, index) => new Date(index)) },
    } as unknown as ModelHookContext;
    const isolate = vi.spyOn(documentHelpers, 'deepIsolateValue');
    expect(await finalizeModelOutput({ ...f.args, input: { value: 'yes' }, context })).toEqual({ value: 'yes' });
    const contextCopies = isolate.mock.calls.filter(
      ([value]) => value && typeof value === 'object' && 'originalDocumentSnapshot' in value,
    );
    expect(contextCopies).toHaveLength(1);
    expect(context.originalDocumentSnapshot!.dates).toHaveLength(128);
  });

  it('does not clone an unused public configuration graph for default embedded traversal', async () => {
    const configuration = {
      catalog: { paths: ['children', 'children.value'], containerPaths: ['children'] },
      permissionSchema: { children: { read: true, sub: { value: true } } },
      defaults: { dates: Array.from({ length: 128 }, (_, index) => new Date(index)) },
    };
    const f = fixture(configuration);
    const isolate = vi.spyOn(documentHelpers, 'deepIsolateValue');
    const inputs = [1, 2].map((value) => ({ children: [{ value }] }));
    expect(await finalizeModelOutputs({ ...f.args, inputs })).toEqual(inputs);
    expect(isolate.mock.calls.filter(([value]) => value === configuration)).toHaveLength(0);
  });

  it('never hands private prepared configuration to traversal callbacks', async () => {
    const keys = {
      when: new Date(1),
      includes(key: string) {
        expect(this.when.getTime()).toBe(1);
        return key === 'visible';
      },
    };
    const configuration = {
      catalog: { paths: ['children', 'children.value'], containerPaths: ['children'] },
      permissionSchema: { children: { read: true, sub: { value: true } } },
      exposedDocPermissionKeys: keys,
    };
    const f = fixture(configuration);
    const inputs = [1, 2].map((value) => ({ children: [{ value }, { value }], _permissions: { visible: true } }));
    const outputs = await finalizeModelOutputs({
      ...f.args,
      inputs,
      traversal: {
        finalizeEmbeddedChildren: async ({ rawValue, parentArgs }) => {
          const snapshot = parentArgs.snapshot as typeof configuration;
          // Legacy callback args retain the public snapshot; it must never be
          // substituted with the hoisted private configuration used by metadata.
          expect(snapshot).toBe(configuration);
          snapshot.exposedDocPermissionKeys.when.setTime(99);
          return rawValue;
        },
      },
    });
    expect(outputs).toEqual(inputs);
    const captured = serviceAuthorization.readServiceAuthorization(f.authorization, f.binding).configuration;
    expect((captured.exposedDocPermissionKeys as typeof keys).when.getTime()).toBe(1);
  });

  it.each(['read', 'custom.read'])(
    'does not hoist mutable function properties along a hook lookup: %s',
    async (docPermissionsAccess) => {
      const allow = vi.fn(() => ({ owner: true }));
      const deny = vi.fn(() => ({ owner: false }));
      let next = allow;
      const bare = () => ({});
      const lookup = vi.fn(() => next);
      Object.defineProperty(bare, 'read', { get: lookup });
      const f = fixture(
        {
          catalog: { paths: ['value'] },
          permissionSchema: { value: 'doc:owner' },
          modelPermissionPrefix: 'doc:',
          docPermissions: docPermissionsAccess === 'read' ? bare : { custom: bare },
          stripPermissionsField: true,
        },
        ['-_id'],
        { ...access, docPermissionsAccess },
      );
      const read = vi.spyOn(serviceAuthorization, 'readServiceFinalizerConfiguration');
      const outputs = await finalizeModelOutputs({
        ...f.args,
        inputs: [{ value: 1 }, { value: 2 }],
        onFinalized: () => {
          next = deny;
        },
      });
      expect(outputs).toEqual([{ value: 1 }, {}]);
      expect(read).toHaveBeenCalledTimes(1);
      expect(lookup).toHaveBeenCalledTimes(2);
      expect(allow).toHaveBeenCalledTimes(1);
      expect(deny).toHaveBeenCalledTimes(1);
    },
  );

  it('captures the getter view before candidate permission callbacks, not after their side effects', async () => {
    let retained: Record<string, unknown> | undefined;
    const permission = vi.fn(() => {
      retained!.name = 'changed by authorization callback';
      return true;
    });
    const getter = vi.fn((doc) => doc.child.name);
    const f = fixture({
      catalog: { paths: ['child', 'child.name', 'v'], containerPaths: ['child'], virtualPaths: ['v'] },
      permissionSchema: { child: { read: true, sub: { name: true } }, v: permission },
      virtuals: { v: { get: getter, dependsOn: [] } },
      stripPermissionsField: true,
    });
    const outputs = await finalizeModelOutputs({
      ...f.args,
      inputs: [{ child: { name: 'original' } }],
      traversal: {
        finalizeEmbeddedChildren: async ({ rawValue }) => {
          retained = rawValue as Record<string, unknown>;
          return rawValue;
        },
      },
    });
    expect(outputs[0].v).toBe('original');
    expect(permission).toHaveBeenCalledTimes(1);
    expect(getter).toHaveBeenCalledTimes(1);
  });

  it('preserves no-virtual lean/hydrated selection, dotted metadata and custom aliases', async () => {
    const model = mongoose.model(
      'Arcpu03Hydrated',
      new mongoose.Schema({
        value: String,
        hidden: String,
        when: Date,
        meta: { permissions: mongoose.Schema.Types.Mixed },
      }),
    );
    const f = fixture(
      {
        catalog: { paths: ['value', 'hidden', 'when', 'meta', 'meta.permissions'] },
        permissionSchema: { value: true, hidden: false, when: true },
        documentPermissionField: 'meta.permissions',
        exposedDocPermissionKeys: ['visible'],
        stripPermissionsField: false,
      },
      ['value', 'when', '-_id'],
    );
    const metadata = { visible: { when: new Date(2) }, secret: false, _view: { value: true } };
    const raw = { value: 'yes', hidden: 'no', when: new Date(1), meta: { permissions: metadata } };
    const hydrated = new model(raw);
    const outputs = await finalizeModelOutputs({ ...f.args, inputs: [raw, hydrated] });
    expect(outputs).toEqual([
      { value: 'yes', when: new Date(1), meta: { permissions: { visible: metadata.visible, _view: metadata._view } } },
      { value: 'yes', when: new Date(1), meta: { permissions: { visible: metadata.visible, _view: metadata._view } } },
    ]);
    for (const output of outputs) {
      const alias = Object.getOwnPropertyDescriptor(output, 'permissions')!;
      expect(alias.enumerable).toBe(false);
      expect(output.permissions).toBe((output.meta as typeof raw.meta).permissions);
      expect(output.when).not.toBe(raw.when);
      expect((output.permissions as typeof metadata).visible.when).not.toBe(metadata.visible.when);
    }
    (outputs[0].permissions as typeof metadata).visible.when.setTime(99);
    expect((outputs[1].permissions as typeof metadata).visible.when.getTime()).toBe(2);
    expect(metadata.visible.when.getTime()).toBe(2);
    expect(hydrated.meta!.permissions).toEqual(metadata);
  });

  it('detaches native-valued metadata options before any per-row application method can use them', async () => {
    const seen: object[] = [];
    const keys = {
      when: new Date(1),
      map: new Map([['when', new Date(2)]]),
      id: new mongo.BSON.ObjectId(),
      includes(key: string) {
        expect(this.when.getTime()).toBe(1);
        expect(this.map.get('when')!.getTime()).toBe(2);
        expect(this.id.equals(keys.id)).toBe(true);
        seen.push(this);
        this.when.setTime(99);
        this.map.clear();
        this.id.id = Buffer.alloc(12);
        return key === 'visible';
      },
    };
    const f = fixture({
      catalog: { paths: ['value'] },
      permissionSchema: { value: true },
      stripPermissionsField: false,
      exposedDocPermissionKeys: keys,
    });
    const inputs = [1, 2].map((value) => ({ value, _permissions: { visible: new Date(value) } }));
    const outputs = await finalizeModelOutputs({ ...f.args, inputs });
    expect(outputs).toEqual(inputs);
    expect(new Set(seen).size).toBe(2);
    expect(keys.when.getTime()).toBe(1);
    expect(keys.map.size).toBe(1);
    const captured = serviceAuthorization.readServiceAuthorization(f.authorization, f.binding).configuration;
    expect((captured.exposedDocPermissionKeys as typeof keys).when.getTime()).toBe(1);
    expect((captured.exposedDocPermissionKeys as typeof keys).map.size).toBe(1);
  });

  it('does not share Set-backed metadata option state between rows in one prepared pass', async () => {
    const receivers: Set<string>[] = [];
    const keys = {
      entries: new Set(['visible']),
      includes(key: string) {
        receivers.push(this.entries);
        const allowed = this.entries.has(key);
        this.entries.clear();
        return allowed;
      },
    };
    const f = fixture({
      catalog: { paths: ['value'] },
      permissionSchema: { value: true },
      exposedDocPermissionKeys: keys,
      stripPermissionsField: false,
    });
    const inputs = [1, 2].map((value) => ({ value, _permissions: { visible: true } }));
    expect(await finalizeModelOutputs({ ...f.args, inputs })).toEqual(inputs);
    expect(receivers).toHaveLength(2);
    expect(new Set(receivers).size).toBe(2);
    expect(keys.entries).toEqual(new Set(['visible']));
    const captured = serviceAuthorization.readServiceAuthorization(f.authorization, f.binding).configuration;
    expect((captured.exposedDocPermissionKeys as typeof keys).entries).toEqual(new Set(['visible']));
  });

  it('keeps hook documents, grants, contexts, snapshots and getter views independent at concurrency one', async () => {
    const id = new mongo.BSON.ObjectId();
    const payload = { when: new Date(1), bytes: Buffer.from([1]), id };
    const grants = { when: new Date(3), bytes: Buffer.from([3]), id };
    const originalDocumentSnapshot = {
      when: new Date(1),
      map: new Map([['when', new Date(1)]]),
      id,
    };
    const hookContexts: ModelHookContext[] = [];
    const getterContexts: object[] = [];
    const hook = vi.fn((doc, _permissions, context) => {
      expect(doc.payload.when.getTime()).toBe(1);
      expect(doc.payload.bytes[0]).toBe(1);
      expect(doc.payload.id.equals(id)).toBe(true);
      expect(context.originalDocumentSnapshot.when.getTime()).toBe(1);
      expect(context.originalDocumentSnapshot.map.get('when').getTime()).toBe(1);
      hookContexts.push(context);
      doc.payload.when.setTime(99);
      doc.payload.bytes[0] = 9;
      doc.payload.id.id = Buffer.alloc(12);
      context.originalDocumentSnapshot.when.setTime(2);
      context.originalDocumentSnapshot.map.get('when').setTime(2);
      return grants;
    });
    const rule = vi.fn((_permissions, supplied) => {
      expect(supplied.when.getTime()).toBe(3);
      expect(supplied.bytes[0]).toBe(3);
      expect(supplied.id.equals(id)).toBe(true);
      supplied.when.setTime(99);
      supplied.bytes[0] = 9;
      supplied.id.id = Buffer.alloc(12);
      return true;
    });
    const observe = vi.fn((view, permissions, context) => {
      expect(permissions.has('reader')).toBe(true);
      expect(view.payload.when.getTime()).toBe(1);
      expect(view.payload.bytes[0]).toBe(1);
      expect(view.payload.id.equals(id)).toBe(true);
      expect(context.docPermissions.when.getTime()).toBe(3);
      expect(context.originalDocumentSnapshot.when.getTime()).toBe(2);
      expect(context.originalDocumentSnapshot.map.get('when').getTime()).toBe(2);
      expect(context.scopePath).toEqual([]);
      getterContexts.push(context);
      return 'observed';
    });
    const mutate = vi.fn((view, permissions, context) => {
      observe(view, permissions, context);
      view.payload.when.setTime(99);
      view.payload.bytes[0] = 9;
      view.payload.id.id = Buffer.alloc(12);
      context.docPermissions.when.setTime(99);
      context.originalDocumentSnapshot.when.setTime(99);
      context.originalDocumentSnapshot.map.clear();
      context.scopePath.push('never');
      return 'mutated';
    });
    const f = fixture({
      catalog: {
        paths: ['payload', 'first', 'second', 'mutate', 'observe'],
        opaquePaths: ['payload'],
        virtualPaths: ['mutate', 'observe'],
      },
      permissionSchema: { payload: true, first: rule, second: rule, mutate: true, observe: true },
      docPermissions: { read: hook },
      virtuals: { mutate: { get: mutate, dependsOn: [] }, observe: { get: observe, dependsOn: [] } },
      stripPermissionsField: true,
    });
    const contexts: ServiceOutputContext[] = [];
    const inputs = [1, 2].map((value) => ({ payload, first: value, second: value }));
    const outputs = await finalizeModelOutputs({
      ...f.args,
      inputs,
      context: { originalDocumentSnapshot } as unknown as ModelHookContext,
      onFinalized: (_output, context, index) => {
        contexts[index!] = context;
        (context.originalDocumentSnapshot!.when as Date).setTime(88);
        (context.docPermissions!.when as Date).setTime(88);
      },
    });
    expect(outputs).toEqual(inputs.map((input) => ({ ...input, mutate: 'mutated', observe: 'observed' })));
    expect(hook).toHaveBeenCalledTimes(2);
    expect(rule).toHaveBeenCalledTimes(4);
    expect(mutate).toHaveBeenCalledTimes(2);
    expect(observe).toHaveBeenCalledTimes(4);
    expect(new Set(getterContexts).size).toBe(4);
    expect(hookContexts[0]).not.toBe(hookContexts[1]);
    expect(contexts[0].documentAuthorization).not.toBe(contexts[1].documentAuthorization);
    for (const context of contexts) {
      const stored = readDocumentAuthorization(context.documentAuthorization, f.binding).grants;
      expect((stored.when as Date).getTime()).toBe(3);
      expect((stored.bytes as Buffer)[0]).toBe(3);
      expect((stored.id as mongo.BSON.ObjectId).equals(id)).toBe(true);
    }
    expect(payload.when.getTime()).toBe(1);
    expect(payload.bytes[0]).toBe(1);
    expect(grants.when.getTime()).toBe(3);
    expect(originalDocumentSnapshot.when.getTime()).toBe(1);
    expect(originalDocumentSnapshot.map.get('when')!.getTime()).toBe(1);
  });

  it('reuses scope setup without sharing mutable embedded/related getter contexts or grants', async () => {
    const snapshot = { when: new Date(1) };
    const child = vi.fn((doc, _permissions, context) => {
      expect(context.scopePath).toEqual(['children', 'sub']);
      expect(context.docPermissions.owner).toBe('parent');
      expect(context.docPermissions.when.getTime()).toBe(1);
      expect(context.originalDocumentSnapshot.when.getTime()).toBe(1);
      context.docPermissions.when.setTime(99);
      context.originalDocumentSnapshot.when.setTime(99);
      const name = doc.name;
      doc.name = 'mutated';
      return name;
    });
    const target = vi.fn((doc, _permissions, context) => {
      expect(context.scopePath).toEqual([]);
      expect(context.docPermissions.owner).toBe('target');
      expect(context.docPermissions.when.getTime()).toBe(2);
      expect(context.originalDocumentSnapshot.when.getTime()).toBe(1);
      context.docPermissions.when.setTime(99);
      context.originalDocumentSnapshot.when.setTime(99);
      return doc.name;
    });
    const summary = vi.fn((doc, _permissions, context) => {
      expect(context.docPermissions.owner).toBe('parent');
      expect(context.docPermissions.when.getTime()).toBe(1);
      expect(context.originalDocumentSnapshot.when.getTime()).toBe(1);
      expect(doc.children).toEqual([
        { name: 'a', v: 'a' },
        { name: 'b', v: 'b' },
      ]);
      expect(doc.related).toEqual([
        { name: 'c', v: 'c' },
        { name: 'd', v: 'd' },
      ]);
      return 'complete';
    });
    const parentHook = vi.fn(() => ({ owner: 'parent', when: new Date(1) }));
    const targetHook = vi.fn(() => ({ owner: 'target', when: new Date(2) }));
    const f = fixture({
      catalog: {
        paths: ['children', 'children.name', 'children.v', 'related', 'summary'],
        containerPaths: ['children'],
        referencePaths: ['related'],
        virtualPaths: ['children.v', 'summary'],
      },
      permissionSchema: { children: { read: true, sub: { name: true, v: true } }, related: true, summary: true },
      docPermissions: { read: parentHook },
      virtuals: { children: { sub: { v: { get: child, dependsOn: [] } } }, summary: { get: summary, dependsOn: [] } },
      stripPermissionsField: true,
    });
    const targetBinding = { ...f.binding, model: {}, modelName: 'Related' };
    const targetConfiguration = {
      catalog: { paths: ['name', 'v'], virtualPaths: ['v'] },
      permissionSchema: { name: true, v: true },
      docPermissions: { read: targetHook },
      virtuals: { v: { get: target, dependsOn: [] } },
      stripPermissionsField: true,
    };
    const targetAuthorization = serviceAuthorization.resolveServiceAuthorization({
      binding: targetBinding,
      configuration: targetConfiguration,
      access,
      requestPermissions: new Permission({}),
      parent: f.authorization,
    });
    const targetPlan = planAuthorizedModelProjection({
      authorization: targetAuthorization,
      binding: targetBinding,
      requestedSelect: ['-_id'],
    });
    const input = { children: [{ name: 'a' }, { name: 'b' }], related: [{ name: 'c' }, { name: 'd' }] };
    const outputs = await finalizeModelOutputs({
      ...f.args,
      inputs: [input, input],
      context: { originalDocumentSnapshot: snapshot } as unknown as ModelHookContext,
      related: [{ path: 'related', plan: targetPlan, snapshot: targetConfiguration, ...access }],
    });
    expect(outputs).toEqual(
      Array.from({ length: 2 }, () => ({
        children: [
          { name: 'a', v: 'a' },
          { name: 'b', v: 'b' },
        ],
        related: [
          { name: 'c', v: 'c' },
          { name: 'd', v: 'd' },
        ],
        summary: 'complete',
      })),
    );
    expect(parentHook).toHaveBeenCalledTimes(2);
    expect(targetHook).toHaveBeenCalledTimes(4);
    expect(child).toHaveBeenCalledTimes(4);
    expect(target).toHaveBeenCalledTimes(4);
    expect(summary).toHaveBeenCalledTimes(2);
    expect(snapshot.when.getTime()).toBe(1);
    expect(input.children).toEqual([{ name: 'a' }, { name: 'b' }]);
  });

  it.each(['binding', 'call'] as const)(
    'revalidates %s identity before consuming another prepared row',
    async (kind) => {
      const hook = vi.fn(() => ({}));
      const configuration = {
        catalog: { paths: ['value'] },
        permissionSchema: { value: true },
        docPermissions: { read: hook },
      };
      const f = fixture(configuration);
      const read = vi.spyOn(serviceAuthorization, 'readServiceFinalizerConfiguration');
      await expect(
        finalizeModelOutputs({
          ...f.args,
          inputs: [{ value: 1 }, { value: 2 }],
          onFinalized: () => {
            if (kind === 'binding') f.args.plan.authorizationBinding = { ...f.binding, model: {} };
            else
              f.args.plan.authorization = serviceAuthorization.resolveServiceAuthorization({
                binding: f.binding,
                access,
                configuration,
                requestPermissions: new Permission({}),
              });
          },
        }),
      ).rejects.toBeInstanceOf(serviceAuthorization.ServiceAuthorizationError);
      expect(read).toHaveBeenCalledTimes(1);
      expect(hook).toHaveBeenCalledTimes(1);
    },
  );
});
