import mongoose from 'mongoose';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { Core } from '../src/core';
import { Base } from '../src/services/base';
import { AccessRuntime } from '../src/runtime';
import { runWithRuntime } from '../src/runtime-context';
import { PERMISSIONS } from '../src/symbols';
import Permission from '../src/permission';
import type { ModelRequest, ModelRouterOptions, Projection } from '../src/interfaces';
import type { OutputAuthorization, ServiceOutputContext } from '../src/interfaces/service-authorization';
import { captureModelAuthorizationConfiguration } from '../src/acl/model-output-planning';
import { planAuthorizedModelProjection } from '../src/acl/output-projection';
import { resolveServiceAuthorization, ServiceAuthorizationError } from '../src/acl/service-authorization';
import {
  assertDocumentStage,
  createDocumentStage,
  readDocumentStage,
  resolveDocumentStage,
} from '../src/acl/document-stage';
import { EMPTY_DOCUMENT_GRANTS } from '../src/acl/document-grants';
import {
  finalizeModelOutput,
  finalizeModelOutputs,
  type FinalizeModelOutputArgs,
} from '../src/output/finalize-model-output';
import * as loggerHelpers from '../src/logger-helpers';

const grant = (...paths: string[]): OutputAuthorization => ({ outputFields: { mode: 'grant', paths } });
const unrestricted: OutputAuthorization = { outputFields: { mode: 'unrestricted' } };
const accesses = { operation: 'read', virtualAccess: 'read', outputAccess: 'read', docPermissionsAccess: 'read' };

function fixture(options: ModelRouterOptions = {}) {
  const model = mongoose.model(
    `Sva03${mongoose.modelNames().length}`,
    new mongoose.Schema(
      {
        status: String,
        public: String,
        internalNote: { type: String, select: false },
        ownerId: String,
        contacts: [new mongoose.Schema({ name: String, email: String, ssn: String }, { _id: false })],
        profile: { name: String, secret: String },
        mixed: mongoose.Schema.Types.Mixed,
        records: { type: Map, of: new mongoose.Schema({ email: String, ssn: String }, { _id: false }) },
        customer: { type: mongoose.Schema.Types.ObjectId, ref: 'Customer' },
        when: Date,
        bytes: Buffer,
        oid: mongoose.Schema.Types.ObjectId,
        meta: { label: String, permissions: mongoose.Schema.Types.Mixed },
      },
      { strict: false },
    ),
  );
  const runtime = new AccessRuntime();
  runtime.registerModelInstance('Order', model);
  const hook = vi.fn(function (this: ModelRequest, doc: Record<string, unknown>) {
    expect(this).toBe(request);
    return { owner: doc.ownerId === 'actor', admin: false };
  });
  const decision = vi.fn(function (this: ModelRequest, permissions, grants) {
    expect(this).toBe(request);
    expect(permissions.has('admin')).toBe(false);
    return grants.owner === true;
  });
  runtime.setModelOptions('Order', {
    modelPermissionPrefix: 'doc:',
    stripPermissionsField: true,
    permissionSchema: {
      status: { read: decision, update: false },
      public: true,
      internalNote: false,
      ownerId: false,
      contacts: { read: true, sub: { name: true, email: false, ssn: false } },
      profile: { read: true, sub: { name: true, secret: false } },
    },
    docPermissions: { read: { dependsOn: ['ownerId'], get: hook } },
    ...options,
  });
  const permissions = new Permission({ admin: false });
  const request = { actor: 'original', [PERMISSIONS]: permissions } as unknown as ModelRequest;
  const core = runWithRuntime(runtime, () => new Core(request));
  request.macl = core;
  const service = runWithRuntime(runtime, () => new Base(request, 'Order'));
  const binding = { request, runtime, model, modelName: 'Order' };
  const make = (
    select?: Projection,
    policy: OutputAuthorization = grant('internalNote'),
    access = accesses,
  ): Omit<FinalizeModelOutputArgs, 'input'> => {
    const configuration = captureModelAuthorizationConfiguration(runtime, 'Order');
    const authorization = resolveServiceAuthorization({
      binding,
      configuration,
      authorization: policy,
      access,
      requestPermissions: permissions,
    });
    const plan = planAuthorizedModelProjection({ authorization, binding, requestedSelect: select });
    return {
      receivingModelName: 'Order',
      request,
      plan,
      ...access,
    };
  };
  const finalize = async (
    input: unknown,
    select: Projection | undefined = ['status', 'internalNote'],
    policy = grant('internalNote'),
  ) => {
    let context!: ServiceOutputContext;
    const args = make(select, policy);
    const output = await finalizeModelOutput({
      ...args,
      input,
      onFinalized: (_output, ctx) => {
        context = ctx;
      },
    });
    return { output, context, args };
  };
  return { runtime, model, request, permissions, core, service, binding, hook, decision, make, finalize };
}

afterEach(() => {
  vi.restoreAllMocks();
  mongoose.deleteModel(/^Sva03/);
});

describe('SVA-03 private finalizer and fresh output helpers', () => {
  it.each([false, undefined, 'admin'])(
    'selected grants survive a %s request rule and absent serialized grants',
    async (rule) => {
      const f = fixture({ permissionSchema: { status: true, ...(rule === undefined ? {} : { internalNote: rule }) } });
      const raw = {
        _id: '1',
        status: 'open',
        internalNote: 'server',
        ownerId: 'actor',
        _permissions: { admin: false },
      };
      const { output, context } = await f.finalize(raw);
      expect(output).toEqual({ _id: '1', status: 'open', internalNote: 'server' });
      expect(context).not.toHaveProperty('documentAuthorization');
      expect(context).not.toHaveProperty('getDocumentAuthorization');
      expect(await f.service.pickAllowedFields(output, 'read', { authorization: grant('internalNote') })).toEqual(
        output,
      );
      expect(await f.service.pickAllowedFields(output, 'read', {})).toEqual({ _id: '1', status: 'open' });
      expect(f.hook).toHaveBeenCalledTimes(1);
      expect(raw.ownerId).toBe('actor');
      expect(raw._permissions).toEqual({ admin: false });
    },
  );

  it('keeps immutable diagnostic facts after trim but fresh helpers cannot reuse closed stage decisions', async () => {
    const f = fixture();
    const { output, context, args } = await f.finalize({
      _id: 'same',
      status: 'open',
      internalNote: 'server',
      ownerId: 'actor',
      _permissions: { owner: false },
    });
    expect(args.plan.persistedFetchSelection).toEqual(expect.arrayContaining(['ownerId', 'status', 'internalNote']));
    expect(output).toEqual({ _id: 'same', status: 'open', internalNote: 'server' });
    expect(f.decision).toHaveBeenCalledTimes(1);
    f.decision.mockImplementation(() => false);
    expect(Reflect.set(context.docPermissions, 'owner', false)).toBe(false);
    expect(context.docPermissions.owner).toBe(true);
    const options = { authorization: grant('internalNote') };
    const picked = await f.service.pickAllowedFields(output, 'read', options);
    expect(picked).toEqual({ _id: 'same', internalNote: 'server' });
    expect(picked).not.toBe(output);
    expect(await f.service.trimOutputFields(picked, 'read', options)).toEqual(picked);
    expect(await f.core.trimOutputFields('Order', picked, 'read', options)).toEqual(picked);
    expect(await f.service.genAllowedFields(picked, 'read', { ...options, purpose: 'output' })).toEqual(
      expect.arrayContaining(['internalNote']),
    );
    expect(f.hook).toHaveBeenCalledTimes(1);
    expect(await f.service.pickAllowedFields(output, 'read', { authorization: grant('internalNote') })).toEqual({
      _id: 'same',
      internalNote: 'server',
    });
    expect(await f.service.pickAllowedFields(output, 'read', {})).toEqual({ _id: 'same' });
    expect(f.hook).toHaveBeenCalledTimes(1);
    expect(f.decision.mock.calls.length).toBeGreaterThan(1);
    expect(Object.getOwnPropertySymbols(output)).toEqual([]);
    expect(Object.keys(context)).not.toContain('documentAuthorization');
    expect(JSON.stringify(context)).not.toContain('documentAuthorization');
  });

  it('fresh raw-policy calls use empty facts on untrimmed inputs and ignore forged _permissions', async () => {
    const f = fixture();
    const raw = { _id: '1', status: 'open', internalNote: 'server', ownerId: 'actor' };
    expect(await f.service.pickAllowedFields(raw, 'read', { authorization: grant('internalNote') })).toEqual({
      _id: '1',
      internalNote: 'server',
    });
    expect(
      await f.service.pickAllowedFields({ ...raw, ownerId: 'other', _permissions: { owner: true } }, 'read', {}),
    ).toEqual({ _id: '1' });
    expect(f.hook).not.toHaveBeenCalled();
    expect(f.decision).toHaveBeenCalledTimes(2);
    for (const call of f.decision.mock.calls) expect(call[1]).toBe(EMPTY_DOCUMENT_GRANTS);
  });

  it.each([
    { stripPermissionsField: true },
    { stripPermissionsField: false, exposedDocPermissionKeys: [], disableFieldPermissions: false },
    { stripPermissionsField: false, disableFieldPermissions: true },
    { stripPermissionsField: false },
    { stripPermissionsField: false, disableFieldPermissions: false },
  ])('metadata posture %j is independent of effective authority', async (posture) => {
    const f = fixture(posture);
    const metadata = { owner: false, _view: { status: false }, _edit: { internalNote: false } };
    const { output, context } = await f.finalize({
      status: 'open',
      internalNote: 'note',
      ownerId: 'actor',
      _permissions: metadata,
    });
    expect(output).toMatchObject({ status: 'open', internalNote: 'note' });
    expect(context.docPermissions).toEqual({ owner: true, admin: false });
    const picked = await f.service.pickAllowedFields(output, 'read', { authorization: grant('internalNote') });
    expect(picked).toHaveProperty('internalNote', 'note');
    expect(picked).not.toHaveProperty('status');
    if (posture.stripPermissionsField) expect(output).not.toHaveProperty('_permissions');
    else if (posture.disableFieldPermissions !== false) expect(output._permissions).toEqual({ owner: false });
    else if (posture.exposedDocPermissionKeys)
      expect(output._permissions).toEqual({ _view: metadata._view, _edit: metadata._edit });
    else expect(output._permissions).toEqual(metadata);
    expect(f.hook).toHaveBeenCalledTimes(1);
  });

  it('no metadata or virtuals still resolve private facts; no unbound supplied-grant utility survives', async () => {
    const f = fixture();
    const args = f.make();
    const output = await finalizeModelOutput({
      ...args,
      input: { status: 'open', internalNote: 'note', ownerId: 'actor' },
    });
    expect(output).toEqual({ status: 'open', internalNote: 'note' });
    expect(f.hook).toHaveBeenCalledTimes(1);
    expect(f.core).not.toHaveProperty('resolveFinalizerDocPermissions');
    expect(f.service).not.toHaveProperty('getSubParentGrants');
    expect(f.service).not.toHaveProperty('finalizeSubRowsWithVirtuals');
    expect(f.service).not.toHaveProperty('finalizeSingleSubRowWithVirtuals');
  });

  it('does not add unselected grants or fabricate missing values, even when privately fetched', async () => {
    // The owning hook only needs ownerId; a selected virtual consumes the private
    // note so fetching it still cannot select an unrequested granted field.
    const f = fixture({
      virtuals: { notePresent: { dependsOn: ['internalNote'], get: (doc) => doc.internalNote !== undefined } },
      permissionSchema: { status: 'doc:owner', internalNote: false, notePresent: true },
    });
    expect(
      (
        await f.finalize({ status: 'open', ownerId: 'actor', internalNote: 'hidden' }, [
          'status',
          'notePresent',
          '-_id',
        ])
      ).output,
    ).toEqual({ status: 'open', notePresent: true });
    expect((await f.finalize({ status: 'open', ownerId: 'actor' })).output).toEqual({ status: 'open' });
    expect((await f.finalize({ status: 'open', ownerId: 'other', internalNote: 'note' })).output).toEqual({
      internalNote: 'note',
    });
  });

  it('DTO copies, equal IDs, changed values and other accesses carry no retained stage authority', async () => {
    const f = fixture();
    const first = await f.finalize({ _id: 'same', status: 'open', ownerId: 'actor', internalNote: 'note' });
    const second = await f.finalize({ _id: 'same', status: 'open', ownerId: 'actor', internalNote: 'note' });
    const options = { documentAuthorization: first.context };
    for (const doc of [first.output, { ...first.output }, JSON.parse(JSON.stringify(first.output)), second.output]) {
      await expect(
        Reflect.apply(f.service.pickAllowedFields, f.service, [doc, 'read', options]),
      ).rejects.toBeInstanceOf(ServiceAuthorizationError);
      expect(await f.service.pickAllowedFields(doc, 'read')).toEqual({ _id: 'same' });
    }
    await expect(
      Reflect.apply(f.service.pickAllowedFields, f.service, [first.output, 'update', options]),
    ).rejects.toBeInstanceOf(ServiceAuthorizationError);
    first.output.status = 'changed';
    await expect(
      Reflect.apply(f.service.pickAllowedFields, f.service, [first.output, 'read', options]),
    ).rejects.toBeInstanceOf(ServiceAuthorizationError);
    expect(first.context).not.toHaveProperty('getDocumentAuthorization');
    expect(await f.service.pickAllowedFields(first.output, 'read', { authorization: grant('status') })).toEqual({
      _id: 'same',
      status: 'changed',
    });
    expect(f.hook).toHaveBeenCalledTimes(2);
  });

  it.each(['request', 'runtime', 'model'])(
    'rejects a retired context/handle attempt at another %s receiver',
    async (dimension) => {
      const f = fixture();
      const { output, context } = await f.finalize({ status: 'open', ownerId: 'actor', internalNote: 'note' });
      const other = fixture();
      let core = other.core;
      if (dimension === 'request') core = runWithRuntime(f.runtime, () => new Core(other.request));
      if (dimension === 'runtime') {
        const runtime = new AccessRuntime();
        runtime.registerModelInstance('Order', f.model);
        core = runWithRuntime(runtime, () => new Core(f.request));
      }
      if (dimension === 'model') f.runtime.registerModelInstance('Different', f.model);
      await expect(
        Reflect.apply(
          (dimension === 'model' ? f.core : core).pickAllowedFields,
          dimension === 'model' ? f.core : core,
          [dimension === 'model' ? 'Different' : 'Order', output, 'read', { documentAuthorization: context }],
        ),
      ).rejects.toBeInstanceOf(ServiceAuthorizationError);
    },
  );

  it('separates list rows and calls with stable contexts, including equal IDs and limit 1', async () => {
    const f = fixture();
    const contexts: ServiceOutputContext[] = [];
    const output = await finalizeModelOutputs({
      ...f.make(),
      inputs: [
        { _id: 'same', ownerId: 'actor', status: 'yes', internalNote: 'a' },
        { _id: 'same', ownerId: 'other', status: 'no', internalNote: 'b' },
      ],
      onFinalized: (_doc, context, index) => {
        contexts[index!] = context;
      },
    });
    expect(output).toEqual([
      { _id: 'same', status: 'yes', internalNote: 'a' },
      { _id: 'same', internalNote: 'b' },
    ]);
    expect(contexts[0].docPermissions).toEqual({ owner: true, admin: false });
    expect(contexts[1].docPermissions).toEqual({ owner: false, admin: false });
    expect(contexts[0].docPermissions).not.toBe(contexts[1].docPermissions);
    for (const doc of output) expect(await f.service.pickAllowedFields(doc, 'read')).toEqual({ _id: 'same' });
    expect(f.hook).toHaveBeenCalledTimes(2);
    // Only the first DTO still has status; absent fields do not run a policy.
    expect(f.decision).toHaveBeenCalledTimes(3);
  });

  it('consumes a private pre-resolved stage once and rejects wrong source/call and closed-stage reuse', async () => {
    const f = fixture();
    const args = f.make();
    const raw = { status: 'open', ownerId: 'actor', internalNote: 'note' };
    const stage = createDocumentStage(args.plan.authorization!, f.binding, raw);
    const resolver = vi.fn(() => ({ owner: true }));
    const facts = await resolveDocumentStage(stage, resolver);
    expect(() => assertDocumentStage(stage, args.plan.authorization!, f.binding, { ...raw })).toThrow(
      ServiceAuthorizationError,
    );
    expect(() => assertDocumentStage(stage, f.make().plan.authorization!, f.binding)).toThrow(
      ServiceAuthorizationError,
    );
    let context!: ServiceOutputContext;
    await finalizeModelOutput({
      ...args,
      input: raw,
      documentStage: stage,
      onFinalized: (_out, ctx) => {
        context = ctx;
      },
    });
    expect(context.docPermissions).toBe(facts);
    expect(context).not.toHaveProperty('documentAuthorization');
    expect(resolver).toHaveBeenCalledTimes(1);
    expect(f.hook).not.toHaveBeenCalled();
    await expect(finalizeModelOutput({ ...args, input: { ...raw }, documentStage: stage })).rejects.toBeInstanceOf(
      ServiceAuthorizationError,
    );
    await expect(
      finalizeModelOutput({ ...args, input: { ...raw, status: 'changed' }, documentStage: stage }),
    ).rejects.toBeInstanceOf(ServiceAuthorizationError);
    await expect(finalizeModelOutput({ ...f.make(), input: raw, documentStage: stage })).rejects.toBeInstanceOf(
      ServiceAuthorizationError,
    );
    expect(() => readDocumentStage(stage, f.binding)).toThrow(ServiceAuthorizationError);
  });

  it('accepts distinct pre-resolved list stages and rejects reuse of one stage across equal rows', async () => {
    const f = fixture();
    const args = f.make();
    const raw = { _id: 'same', status: 'open', internalNote: 'note' };
    const stages = [true, false].map(() => createDocumentStage(args.plan.authorization!, f.binding, raw));
    await resolveDocumentStage(stages[0], () => ({ owner: true }));
    await resolveDocumentStage(stages[1], () => ({ owner: false }));
    expect(await finalizeModelOutputs({ ...args, inputs: [raw, raw], documentStages: stages })).toEqual([
      raw,
      { _id: 'same', internalNote: 'note' },
    ]);
    await expect(
      finalizeModelOutputs({ ...args, inputs: [raw, raw], documentStages: [stages[0], stages[0]] }),
    ).rejects.toBeInstanceOf(ServiceAuthorizationError);
    expect(f.hook).not.toHaveBeenCalled();
  });

  it('uses captured configuration/permissions/accesses despite later changes, and rejects mismatched finalizer access', async () => {
    const getter = vi.fn((_doc, _permissions, context) => {
      expect(context).toMatchObject({
        operation: 'upsert',
        virtualAccess: 'update',
        outputAccess: 'read',
        docPermissionsAccess: 'update',
      });
      return 'v';
    });
    const hook = vi.fn(() => ({ owner: true }));
    const f = fixture({ virtuals: { v: { update: getter } }, docPermissions: { update: hook } });
    const args = f.make(['status', 'internalNote', 'v'], grant('internalNote', 'v'), {
      operation: 'upsert',
      virtualAccess: 'update',
      outputAccess: 'read',
      docPermissionsAccess: 'update',
    });
    f.runtime.setModelOptions('Order', {
      permissionSchema: { status: false, internalNote: false },
      docPermissions: { update: () => ({ owner: false }) },
    });
    (f.request as unknown as Record<symbol, unknown>)[PERMISSIONS] = new Permission({ admin: true });
    let context!: ServiceOutputContext;
    const output = await finalizeModelOutput({
      ...args,
      input: { status: 'open', internalNote: 'note' },
      onFinalized: (_doc, ctx) => {
        context = ctx;
      },
    });
    expect(output).toEqual({ status: 'open', internalNote: 'note', v: 'v' });
    expect(context.docPermissions.owner).toBe(true);
    expect(context.operation).toBe('upsert');
    // The new read-shaped helper is not the prior upsert/update stage: v has no
    // read-applicable descriptor. It never runs the update getter to recover it.
    expect(await f.service.pickAllowedFields(output, 'read', { authorization: grant('internalNote', 'v') })).toEqual({
      internalNote: 'note',
    });
    expect(hook).toHaveBeenCalledTimes(1);
    expect(getter).toHaveBeenCalledTimes(1);
    expect(f.decision).toHaveBeenCalledTimes(1);
    await expect(finalizeModelOutput({ ...args, input: {}, outputAccess: 'update' })).rejects.toBeInstanceOf(
      ServiceAuthorizationError,
    );
  });
});

describe('SVA-03 path-aware trimming and virtual output', () => {
  const contacts = [
    { name: 'A', email: 'a@x', ssn: 'secret' },
    { name: 'B', email: 'b@x', ssn: 'secret2' },
  ];
  it.each([
    [['contacts.email'], grant('contacts.email'), [{ email: 'a@x' }, { email: 'b@x' }]],
    [
      ['contacts'],
      grant('contacts.email'),
      [
        { name: 'A', email: 'a@x' },
        { name: 'B', email: 'b@x' },
      ],
    ],
    [['contacts.email'], grant('contacts'), [{ email: 'a@x' }, { email: 'b@x' }]],
    [
      ['contacts', '-contacts.ssn'],
      grant('contacts'),
      [
        { name: 'A', email: 'a@x' },
        { name: 'B', email: 'b@x' },
      ],
    ],
  ])('keeps minimal selected array paths for %j', async (select, policy, expected) => {
    const f = fixture();
    const { output, context } = await f.finalize({ contacts }, select as string[], policy as OutputAuthorization);
    expect(output).toEqual({ contacts: expected });
    const picked = await f.service.pickAllowedFields(output, 'read', {
      authorization: policy as OutputAuthorization,
    });
    expect(picked).toEqual(output);
    const child = (output.contacts as object[])[0];
    expect(context).not.toHaveProperty('getDocumentAuthorization');
    expect(
      await f.service.pickAllowedFields(child, 'read', {
        scopePath: ['contacts'],
        authorization: policy as OutputAuthorization,
      }),
    ).toEqual(child);
    expect(f.hook).toHaveBeenCalledTimes(1);
    expect(contacts[0].ssn).toBe('secret');
  });

  it('descendant grants survive denied containers with/without virtuals and never retain siblings', async () => {
    for (const virtuals of [{}, { contacts: { sub: { badge: { get: () => 'badge', dependsOn: [] } } } }]) {
      const f = fixture({
        permissionSchema: { contacts: { read: false, sub: { name: true, email: false, ssn: false } } },
        virtuals,
      });
      expect((await f.finalize({ contacts }, ['contacts'], grant('contacts.email'))).output).toEqual({
        contacts: [{ email: 'a@x' }, { email: 'b@x' }],
      });
    }
  });

  it('projects dotted object, Mixed and named Map branches; removes protected keys under unrestricted roots', async () => {
    const f = fixture();
    const raw = {
      profile: { name: 'A', secret: 's' },
      mixed: { public: { deep: 1, secret: 2 }, _doc: 'hidden' },
      records: { work: { email: 'a@x', ssn: 's' }, home: { email: 'b@x' } },
      random: 'never',
      __v: 3,
    };
    expect(
      (
        await f.finalize(
          raw,
          ['profile.secret', 'mixed.public.deep', 'records.work.email'],
          grant('profile.secret', 'mixed.public.deep', 'records.work.email'),
        )
      ).output,
    ).toEqual({ profile: { secret: 's' }, mixed: { public: { deep: 1 } }, records: { work: { email: 'a@x' } } });
    const all = (await f.finalize(raw, null, unrestricted)).output;
    expect(all).not.toHaveProperty('random');
    expect(all).not.toHaveProperty('__v');
    expect(all.mixed).toEqual({ public: { deep: 1, secret: 2 } });
  });

  it('handles dotted permission metadata separately from business grants', async () => {
    const f = fixture({ documentPermissionField: 'meta.permissions', stripPermissionsField: true });
    const raw = { meta: { label: 'x', permissions: { owner: true } }, ownerId: 'actor', status: 'open' };
    expect((await f.finalize(raw, null, unrestricted)).output).toEqual({
      meta: { label: 'x' },
      ownerId: 'actor',
      status: 'open',
    });
  });

  it('retains dotted metadata as data without handles, and copies hydrated/native Map branches safely', async () => {
    const f = fixture({
      documentPermissionField: 'meta.permissions',
      stripPermissionsField: false,
      exposedDocPermissionKeys: [],
      disableFieldPermissions: false,
    });
    const metadata = { owner: false, _view: { status: false } };
    const { output, context } = await f.finalize(
      { meta: { label: 'x', permissions: metadata } },
      ['meta.label'],
      unrestricted,
    );
    expect(output).toEqual({ meta: { label: 'x', permissions: { _view: { status: false } } } });
    expect(context).not.toHaveProperty('getDocumentAuthorization');
    expect(await f.service.pickAllowedFields(output, 'read', { authorization: unrestricted })).toEqual(output);
    for (const raw of [
      new f.model({ records: { work: { email: 'a@x', ssn: 's' } } }),
      { records: new Map([['work', { email: 'a@x', ssn: 's' }]]) },
    ]) {
      const result = await f.finalize(raw, ['records.work.email', '-_id'], grant('records.work.email'));
      expect(result.output).toEqual({ records: { work: { email: 'a@x' } } });
      expect(
        await f.service.pickAllowedFields(result.output, 'read', {
          authorization: grant('records.work.email'),
        }),
      ).toEqual(result.output);
    }
  });

  it('memoizes ancestor and virtual permission functions once in their owning scope/stage', async () => {
    const parentRule = vi.fn((_permissions, grants) => grants.owner);
    const leafRule = vi.fn((_permissions, grants) => grants.owner);
    const virtualRule = vi.fn((_permissions, grants) => grants.owner);
    const getter = vi.fn(() => 'v');
    const f = fixture({
      permissionSchema: { contacts: { read: parentRule, sub: { name: leafRule, email: true } }, v: virtualRule },
      virtuals: { v: { get: getter, dependsOn: [] } },
    });
    const { output } = await f.finalize({ contacts, ownerId: 'actor' }, ['contacts', 'v'], {});
    expect(parentRule).toHaveBeenCalledTimes(1);
    expect(leafRule).toHaveBeenCalledTimes(2);
    expect(virtualRule).toHaveBeenCalledTimes(1);
    expect(getter).toHaveBeenCalledTimes(1);
    expect(await f.service.pickAllowedFields(output, 'read')).toEqual({ contacts: [{}, {}] });
    expect(parentRule).toHaveBeenCalledTimes(2);
    expect(leafRule).toHaveBeenCalledTimes(2);
    expect(virtualRule).toHaveBeenCalledTimes(2);
    expect(f.hook).toHaveBeenCalledTimes(1);
  });

  it('bounds canonical document hooks and nested getters under one shared gate', async () => {
    let active = 0;
    let peak = 0;
    const work = async (result) => {
      active++;
      peak = Math.max(peak, active);
      await new Promise<void>((resolve) => setImmediate(resolve));
      active--;
      return result;
    };
    const f = fixture({
      docPermissions: { read: () => work({ owner: true }) },
      virtuals: { contacts: { sub: { badge: { get: () => work('v'), dependsOn: [] } } } },
    });
    f.runtime.setGlobalOptions({ requestComplexity: { maxHookConcurrency: 2 } });
    const args = f.make(['contacts.badge'], grant('contacts.badge'));
    const output = await finalizeModelOutputs({
      ...args,
      inputs: Array.from({ length: 5 }, () => ({ contacts })),
    });
    expect(output).toEqual(Array.from({ length: 5 }, () => ({ contacts: [{ badge: 'v' }, { badge: 'v' }] })));
    expect(peak).toBe(2);
    expect(active).toBe(0);
  });

  it('granted virtuals remain selected/applicable/dependency guarded; fresh picks never rerun getters', async () => {
    vi.spyOn(loggerHelpers, 'warn').mockImplementation(() => {});
    const good = vi.fn(() => 'computed');
    const absent = vi.fn(() => 'unexpected');
    const inactive = vi.fn(() => 'unexpected');
    const unselected = vi.fn(() => 'unexpected');
    const failed = vi.fn(() => {
      throw new Error('private');
    });
    const empty = vi.fn(() => undefined);
    const f = fixture({
      virtuals: {
        good: { get: good, dependsOn: ['ownerId'] },
        absent: { get: absent, dependsOn: ['public'] },
        inactive: { update: { get: inactive, dependsOn: [] } },
        unselected: { get: unselected, dependsOn: [] },
        failed: { get: failed, dependsOn: [] },
        empty: { get: empty, dependsOn: [] },
      },
    });
    const { output } = await f.finalize(
      { ownerId: 'actor', good: 'stored', inactive: 'stored', absent: 'stored', failed: 'stored', empty: 'stored' },
      ['good', 'absent', 'inactive', 'failed', 'empty'],
      grant('good', 'absent', 'inactive', 'unselected', 'failed', 'empty'),
    );
    expect(output).toEqual({ good: 'computed' });
    expect(await f.service.pickAllowedFields(output, 'read', { authorization: grant('good') })).toEqual(output);
    expect(good).toHaveBeenCalledTimes(1);
    expect(empty).toHaveBeenCalledTimes(1);
    expect(failed).toHaveBeenCalledTimes(1);
    expect(absent).not.toHaveBeenCalled();
    expect(inactive).not.toHaveBeenCalled();
    expect(unselected).not.toHaveBeenCalled();
  });

  it('finalizes authorized child fields before parent getters without exposing dependency-only fields', async () => {
    const child = vi.fn((doc) => `badge:${doc.ssn}`);
    const parent = vi.fn((doc) => {
      expect(doc.contacts).toEqual([
        { email: 'a@x', badge: 'badge:secret' },
        { email: 'b@x', badge: 'badge:secret2' },
      ]);
      return doc.contacts.length;
    });
    const f = fixture({
      virtuals: {
        contacts: { sub: { badge: { get: child, dependsOn: ['ssn'] } } },
        summary: { get: parent, dependsOn: ['contacts'] },
      },
    });
    const { output } = await f.finalize(
      { contacts },
      ['contacts.email', 'contacts.badge', 'summary'],
      grant('contacts.email', 'contacts.badge', 'summary'),
    );
    expect(output.summary).toBe(2);
    expect(
      await f.service.pickAllowedFields(output, 'read', {
        authorization: grant('contacts.email', 'contacts.badge', 'summary'),
      }),
    ).toEqual(output);
    expect(parent).toHaveBeenCalledTimes(1);
    expect(child).toHaveBeenCalledTimes(2);
    expect(f.hook).toHaveBeenCalledTimes(1);
  });

  it('private completed targets use their own policy/facts; raw DTOs and parent grants confer no target data', async () => {
    const f = fixture();
    const childModel = mongoose.model(
      'Sva03Child',
      new mongoose.Schema({ name: String, secret: String, ownerId: String }),
    );
    f.runtime.registerModelInstance('Customer', childModel);
    const childHook = vi.fn(() => ({ reader: true }));
    f.runtime.setModelOptions('Customer', {
      permissionSchema: { name: 'reader', secret: false },
      docPermissions: { read: childHook },
      stripPermissionsField: true,
    });
    const args = f.make(['customer'], unrestricted);
    const binding = { ...f.binding, model: childModel, modelName: 'Customer' };
    const configuration = captureModelAuthorizationConfiguration(f.runtime, 'Customer');
    const call = resolveServiceAuthorization({
      binding,
      configuration,
      access: accesses,
      requestPermissions: f.permissions,
      parent: args.plan.authorization,
    });
    const plan = planAuthorizedModelProjection({ authorization: call, binding, requestedSelect: ['name', 'secret'] });
    let childContext!: ServiceOutputContext;
    const child = await finalizeModelOutput({
      receivingModelName: 'Customer',
      request: f.request,
      plan,
      ...accesses,
      input: { _id: 'child', name: 'C', secret: 'no' },
      onFinalized: (_doc, ctx) => {
        childContext = ctx;
      },
    });
    const output = await finalizeModelOutput({
      ...args,
      input: { customer: { _id: 'child', name: 'C', secret: 'no' } },
      completedReferences: new Map([['customer', child]]),
    });
    expect(output.customer).toEqual({ _id: 'child', name: 'C' });
    expect(childContext.docPermissions).toEqual({ reader: true });
    expect(await f.core.pickAllowedFields('Customer', output.customer, 'read')).toEqual({ _id: 'child' });
    expect(
      await f.core.pickAllowedFields('Customer', output.customer, 'read', { authorization: grant('name') }),
    ).toEqual(output.customer);
    expect(childHook).toHaveBeenCalledTimes(1);
    expect(
      await f.service.pickAllowedFields(
        { customer: { _id: 'child', name: 'C', secret: 'no', _permissions: { reader: true } } },
        'read',
        { authorization: unrestricted },
      ),
    ).toEqual({ customer: 'child' });
  });

  it('isolates hydrated persistence documents and fresh current Date/Buffer/BSON values without certifying them', async () => {
    const f = fixture();
    const doc = new f.model({
      status: 'open',
      ownerId: 'actor',
      internalNote: 'note',
      when: new Date(0),
      bytes: Buffer.from('abc'),
      oid: new mongoose.Types.ObjectId(),
    });
    const original = doc.toObject();
    const { output } = await f.finalize(doc, ['status', 'internalNote', 'when', 'bytes', 'oid'], unrestricted);
    const picked = await f.service.pickAllowedFields(output, 'read', {
      authorization: unrestricted,
    });
    expect(picked).toEqual(output);
    expect(doc.toObject()).toEqual(original);
    expect(picked.when).not.toBe(output.when);
    expect(picked.bytes).not.toBe(output.bytes);
    expect(picked.oid).not.toBe(output.oid);
    (picked.when as Date).setTime(1);
    expect((await f.service.pickAllowedFields(picked, 'read', { authorization: unrestricted })).when).toEqual(
      new Date(1),
    );
    expect(output.when).toEqual(new Date(0));
    (output.bytes as mongoose.mongo.Binary).buffer[0] = 0;
    expect((await f.service.pickAllowedFields(output, 'read', { authorization: unrestricted })).bytes).toEqual(
      output.bytes,
    );
    expect(f.hook).toHaveBeenCalledTimes(1);
    expect(doc.toObject()).toEqual(original);
  });

  it('isolates mutable RegExp dependencies between getters, raw input and authorized output', async () => {
    const expression = /^original/gi;
    expression.lastIndex = 3;
    const mutate = vi.fn((doc) => {
      doc.mixed.compile('^changed');
      return doc.mixed.source;
    });
    const observe = vi.fn((doc) => `${doc.mixed.source}:${doc.mixed.flags}:${doc.mixed.lastIndex}`);
    const f = fixture({
      virtuals: {
        mutate: { get: mutate, dependsOn: ['mixed'] },
        observe: { get: observe, dependsOn: ['mixed'] },
      },
    });
    const { output } = await f.finalize({ mixed: expression }, ['mixed', 'mutate', 'observe'], unrestricted);
    expect(output).toMatchObject({ mixed: /^original/gi, mutate: '^changed', observe: '^original:gi:3' });
    expect((output.mixed as RegExp).lastIndex).toBe(3);
    expect(output.mixed).not.toBe(expression);
    expect(expression.source).toBe('^original');
    expect(await f.service.pickAllowedFields(output, 'read', { authorization: unrestricted })).toEqual(output);
    expect(mutate).toHaveBeenCalledTimes(1);
    expect(observe).toHaveBeenCalledTimes(1);
  });

  it('fresh helpers isolate changed ObjectIds and equal nested replacements without reusable authority or hooks', async () => {
    const f = fixture();
    const { output } = await f.finalize(
      { oid: new mongoose.Types.ObjectId(), profile: { name: 'A' } },
      ['oid', 'profile'],
      unrestricted,
    );
    const options = { authorization: unrestricted };
    const picked = await f.service.pickAllowedFields(output, 'read', options);
    (picked.oid as mongoose.Types.ObjectId).id = Buffer.alloc(12);
    const current = await f.service.pickAllowedFields(picked, 'read', options);
    expect(String(current.oid)).toBe('000000000000000000000000');
    expect(String(output.oid)).not.toBe(String(current.oid));
    output.profile = { ...(output.profile as object) };
    expect(await f.service.pickAllowedFields(output, 'read', options)).toEqual(output);
    expect(await f.service.pickAllowedFields(output, 'read', {})).toEqual({ profile: { name: 'A' } });
    expect(f.hook).toHaveBeenCalledTimes(1);
  });

  it.each([
    { baseFields: ['internalNote'] },
    { skipChecks: true },
    { authorization: { rows: { mode: 'unrestricted' } } },
    { documentAuthorization: {} },
    { purpose: 'input' },
    { scopePath: ['unknown'] },
    null,
  ])('rejects unsupported named output options %j', async (options) => {
    const f = fixture();
    await expect(f.service.pickAllowedFields({}, 'read', options as never)).rejects.toBeInstanceOf(
      ServiceAuthorizationError,
    );
    expect(f.hook).not.toHaveBeenCalled();
  });

  it('defaults to request-mode output, rejects retired baseFields and keeps explicit output authority', async () => {
    const f = fixture();
    const doc = { public: 'yes', internalNote: 'no' };
    const requestOutput = await f.service.pickAllowedFields(doc, 'update');
    expect(requestOutput).toEqual({ public: 'yes' });
    expect(await f.service.pickAllowedFields(doc, 'update', { authorization: grant('internalNote') })).toEqual(doc);
    await expect(f.service.pickAllowedFields(doc, 'update', ['internalNote'] as never)).rejects.toThrow(
      'have been removed',
    );
    expect(await f.service.genAllowedFields(doc, 'update')).not.toContain('internalNote');
    const { context, output } = await f.finalize({ ownerId: 'actor', status: 'open' });
    expect(context.outputAccess).toBe('read');
    expect(context).not.toHaveProperty('documentAuthorization');
    await expect(
      f.service.genAllowedFields(output, 'read', { documentAuthorization: context } as never),
    ).rejects.toBeInstanceOf(ServiceAuthorizationError);
    await expect(
      f.service.pickAllowedFields(output, 'read', {
        documentAuthorization: context,
        authorization: grant('internalNote'),
      } as never),
    ).rejects.toBeInstanceOf(ServiceAuthorizationError);
  });

  it('preserves absent documents without running hooks or fabricating an output object', async () => {
    const f = fixture();
    expect(await f.service.pickAllowedFields(null, 'read', {})).toBeNull();
    expect(await f.service.trimOutputFields(undefined, 'read', {})).toBeUndefined();
    expect(await f.service.genAllowedFields(null, 'read', { purpose: 'output' })).toEqual([]);
    expect(f.hook).not.toHaveBeenCalled();
  });

  it('rejects non-document raw inputs instead of passing unfiltered arrays/values through', async () => {
    const f = fixture();
    for (const input of [[{ internalNote: 'hidden' }], 'hidden', new Date(0)]) {
      await expect(f.service.pickAllowedFields(input, 'read', {})).rejects.toBeInstanceOf(ServiceAuthorizationError);
    }
    expect(f.hook).not.toHaveBeenCalled();
  });
});
