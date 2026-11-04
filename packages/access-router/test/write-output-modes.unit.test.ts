import mongoose from 'mongoose';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { sourceModes, quietOutput } from './owned-stage-test-fixture';
import { writeOutputFixture } from './write-output-test-fixture';
import { EMPTY_DOCUMENT_GRANTS } from '../src/acl/document-grants';
import type { ModelHookContext, ModelOutputContext } from '../src/interfaces';
import { deferred } from './hook-admission-fixture';
import { PERMISSIONS } from '../src/symbols';
import Permission from '../src/permission';
import * as stages from '../src/acl/document-stage';
import {
  readServiceAuthorizationMode,
  isWriteOutputAuthorization,
  ServiceAuthorizationError,
} from '../src/acl/service-authorization';

afterEach(() => vi.restoreAllMocks());

describe('real CREATE/UPDATE/UPSERT output workers', () => {
  it.each(
    sourceModes.flatMap((mode) =>
      [
        'create',
        'updateOne',
        'updateById',
        'upsert-create',
        'upsert-update',
        'public-create',
        'public-update',
        'public-upsert-create',
        'public-upsert-update',
      ].map((entry) => ({ mode, entry })),
    ),
  )(
    '$mode $entry lends only detached post-lifecycle output; persistence/input/snapshots remain unchanged',
    async ({ mode, entry }) => {
      const lifecycle: ModelHookContext[] = [];
      const seen: Array<{ doc: any; context: ModelOutputContext }> = [];
      const hook = vi.fn((doc: any, permissions: Permission, context: ModelOutputContext) => {
        expect(permissions.has('reader')).toBe(true);
        expect(context.docPermissions).toBe(EMPTY_DOCUMENT_GRANTS);
        if (!(doc instanceof mongoose.Document)) {
          seen.push({ doc, context });
          doc.value = 'output-change';
          doc.when.setTime(10);
          doc.payload.stamp.setTime(20);
          doc.payload.bytes.fill(0);
        }
        return { owner: true };
      });
      const f = writeOutputFixture(mode, {
        docPermissions: { create: hook, update: hook },
        afterPersist: {
          create: (doc, _p, context) => {
            lifecycle.push(context);
            return doc;
          },
          update: (doc, _p, context) => {
            lifecycle.push(context);
            return doc;
          },
        },
      });
      const data = {
        value: 'submitted',
        when: new Date(3),
        payload: { stamp: new Date(4), bytes: Buffer.from('payload') },
      };
      const args = { select: ['value', 'when', 'payload', '-_id'] };
      const creating = entry.endsWith('create') || entry === 'create';
      const upsert = entry.includes('upsert');
      const initiating = upsert ? 'upsert' : creating ? 'create' : 'update';
      const result =
        entry === 'create'
          ? await f.direct.create(data, args, quietOutput)
          : entry === 'updateOne'
            ? await f.direct.updateOne({ _id: 'existing' }, data, args, quietOutput)
            : entry === 'updateById'
              ? await f.direct.updateById('existing', data, args, quietOutput)
              : entry === 'public-create'
                ? await f.public._create(data, args, quietOutput)
                : entry === 'public-update'
                  ? await f.public._update('existing', data, args, quietOutput)
                  : entry.startsWith('public')
                    ? await f.public._upsert({ ...(creating ? {} : { _id: 'existing' }), ...data }, args, quietOutput)
                    : await f.direct.upsert({ _id: creating ? 'missing' : 'existing' }, data, args, quietOutput);
      expect(result.success).toBe(true);
      if (!result.success) throw new Error(JSON.stringify(result));
      const row = Array.isArray(result.data) ? result.data[0] : result.data;
      expect(row.value).toBe(mode === 'trusted' ? 'output-change' : 'submitted');
      expect(row.when.getTime()).toBe(mode === 'trusted' ? 10 : 3);
      expect(row.payload.stamp.getTime()).toBe(mode === 'trusted' ? 20 : 4);
      expect(seen).toHaveLength(1);
      expect(seen[0].context).toMatchObject({
        operation: initiating,
        virtualAccess: creating ? 'create' : 'update',
        outputAccess: 'read',
        docPermissionsAccess: creating ? 'create' : 'update',
      });
      expect(Object.isFrozen(seen[0].context)).toBe(true);
      for (const key of ['writeOrigin', 'writeOutputBranch', 'sourceMode', 'authorization', 'documentStage']) {
        expect(seen[0].context).not.toHaveProperty(key);
        expect(row).not.toHaveProperty(key);
      }
      const live = lifecycle[0].currentDocument as any;
      expect(live.value).toBe('submitted');
      expect(live.when.getTime()).toBe(3);
      expect(live.payload.stamp.getTime()).toBe(4);
      expect(live.payload.bytes.toString()).toBe('payload');
      expect(lifecycle[0].finalDocumentSnapshot).toMatchObject(data);
      expect(lifecycle[0].preparedData).toMatchObject(data);
      expect(data.payload.bytes.toString()).toBe('payload');
      expect(data.when.getTime()).toBe(3);
      expect(f.saved).toHaveLength(1);
      expect(f.saved[0]).toMatchObject(data);
      expect(f.saves).toHaveBeenCalledTimes(creating ? 0 : 1);
      expect(f.adapter.create).toHaveBeenCalledTimes(creating ? 1 : 0);
      expect(f.adapter.findOne).toHaveBeenCalledTimes(
        creating ? (upsert && !entry.startsWith('public') ? 1 : 0) : upsert && !entry.startsWith('public') ? 2 : 1,
      );
      expect(f.adapter.exists).toHaveBeenCalledTimes(entry === 'public-upsert-update' ? 1 : 0);
      expect(f.adapter.find).not.toHaveBeenCalled();
      expect(hook).toHaveBeenCalledTimes(creating ? 1 : 2);
    },
  );

  it('all four trusted modes preserve hydrated UPDATE input facts, deny input, and normalize fresh frozen post-write facts', async () => {
    const pre = { owner: true, suspended: true },
      post = { owner: false, suspended: false };
    const docs: unknown[] = [];
    const lifecycle: ModelHookContext[] = [];
    const hook = vi.fn((doc: any) => {
      docs.push(doc);
      return doc instanceof mongoose.Document ? pre : post;
    });
    const f = writeOutputFixture('trusted', {
      docPermissions: { update: hook },
      permissionSchema: {
        value: { read: (_p, facts) => !facts.owner, update: (_p, facts) => !facts.suspended },
        hidden: false,
      },
      prepare: {
        update: (data, _p, context) => {
          lifecycle.push(context);
          pre.suspended = false;
          return data;
        },
      },
    });
    const result = await f.direct.updateById(
      'existing',
      { value: 'must-not-write', hidden: 'attack' },
      { select: ['value', '-_id'] },
      quietOutput,
    );
    expect(result).toMatchObject({
      success: true,
      data: { value: 'before' },
      input: {},
      context: { docPermissions: post },
    });
    expect(docs[0]).toBe(f.stored);
    expect(docs[1]).not.toBe(f.stored);
    expect(lifecycle[0].docPermissions).toEqual({ owner: true, suspended: true });
    expect(Object.isFrozen(lifecycle[0].docPermissions)).toBe(true);
    if (!result.success) throw new Error(result.code);
    expect(result.context.docPermissions).not.toBe(lifecycle[0].docPermissions);
    expect(result.context.docPermissions).not.toBe(post);
    expect(Object.isFrozen(result.context.docPermissions)).toBe(true);
    post.owner = true;
    expect(result.context.docPermissions.owner).toBe(false);
    expect(f.stored.value).toBe('before');
    expect(f.saves).toHaveBeenCalledTimes(1);
  });

  it.each(
    sourceModes.flatMap((createMode) =>
      ['upsert-create', 'upsert-update', 'public-upsert-create', 'public-upsert-update'].map((entry) => ({
        createMode,
        entry,
      })),
    ),
  )(
    '$entry selects the executed branch from independent captured modes (CREATE=$createMode)',
    async ({ createMode, entry }) => {
      const updateMode = createMode === 'trusted' ? 'isolated' : 'trusted';
      const entered = deferred(),
        release = deferred();
      const hook = vi.fn((doc: any) => {
        if (!(doc instanceof mongoose.Document)) doc.value = 'output-hook';
        return {};
      });
      const pause = async (data: any) => {
        entered.resolve();
        await release.promise;
        return data;
      };
      const f = writeOutputFixture('isolated', {
        createAuthorizationMode: createMode,
        updateAuthorizationMode: updateMode,
        docPermissions: { create: hook, update: hook },
        prepare: { create: pause, update: pause },
      });
      const creating = entry.endsWith('create');
      const pending = entry.startsWith('public')
        ? f.public._upsert(
            { ...(creating ? {} : { _id: 'existing' }), value: 'submitted' },
            { select: ['value', '-_id'] },
            quietOutput,
          )
        : f.direct.upsert(
            { _id: creating ? 'missing' : 'existing' },
            { value: 'submitted' },
            { select: ['value', '-_id'] },
            quietOutput,
          );
      await entered.promise;
      f.runtime.setModelOptions(f.model.modelName, {
        createAuthorizationMode: updateMode,
        updateAuthorizationMode: createMode,
      });
      release.resolve();
      const result = await pending;
      expect(result.success).toBe(true);
      if (!result.success) throw new Error(result.code);
      const row = Array.isArray(result.data) ? result.data[0] : result.data;
      const selected = creating ? createMode : updateMode;
      expect(row.value).toBe(selected === 'trusted' ? 'output-hook' : 'submitted');
      expect(hook.mock.calls.at(-1)![2]).toMatchObject({
        operation: 'upsert',
        virtualAccess: creating ? 'create' : 'update',
        outputAccess: 'read',
        docPermissionsAccess: creating ? 'create' : 'update',
      });
      expect(f.saved).toHaveLength(1);
      expect(f.saved[0].value).toBe('submitted');
    },
  );

  it.each(sourceModes)(
    '%s bulk CREATE has no input facts and independent same-ID output facts/embedded ownership',
    async (mode) => {
      const hook = vi.fn((doc: any) => {
        doc.value = `hook:${doc.value}`;
        doc.children[0].label = 'hook-child';
        return { owner: doc.owner === true };
      });
      const validate = vi.fn((_data, _p, context) => {
        expect(context.docPermissions).toBeUndefined();
        return true;
      });
      const f = writeOutputFixture(mode, {
        docPermissions: { create: hook },
        validate: { create: validate },
        permissionSchema: {
          value: true,
          owner: true,
          children: { create: true, read: true, sub: { label: { create: true, read: 'doc:owner' }, hidden: false } },
        },
        virtuals: { children: { sub: {} } },
      });
      const result = await f.direct.create(
        [
          { _id: 'same', value: 'one', owner: true, children: [{ label: 'child-one' }] },
          { _id: 'same', value: 'two', owner: false, children: [{ label: 'child-two' }] },
        ],
        { select: ['value', 'children.label', '-_id'] },
        quietOutput,
      );
      expect(result).toMatchObject({
        success: true,
        data: [
          {
            value: mode === 'trusted' ? 'hook:one' : 'one',
            children: [{ label: mode === 'trusted' ? 'hook-child' : 'child-one' }],
          },
          { value: mode === 'trusted' ? 'hook:two' : 'two', children: [{}] },
        ],
      });
      expect(hook).toHaveBeenCalledTimes(2);
      expect(validate).toHaveBeenCalledTimes(2);
      if (!result.success) throw new Error(result.code);
      expect(result.contexts[0].docPermissions).not.toBe(result.contexts[1].docPermissions);
      expect(f.saved[0]).toMatchObject({ value: 'one', children: [{ label: 'child-one' }] });
      expect(f.saved[1]).toMatchObject({ value: 'two', children: [{ label: 'child-two' }] });
    },
  );

  it.each(['internal-denial', 'public-denial', 'public-id-miss'] as const)(
    '%s never creates a fallback or runs output hooks',
    async (entry) => {
      const hook = vi.fn(() => ({}));
      const f = writeOutputFixture('trusted', {
        baseFilter: { update: () => (entry === 'public-id-miss' ? {} : false) },
        docPermissions: { create: hook, update: hook },
      });
      const result =
        entry === 'internal-denial'
          ? await f.direct.upsert({}, { value: 'attack' }, {}, quietOutput)
          : await f.public._upsert(
              { _id: entry === 'public-id-miss' ? 'missing' : 'existing', value: 'attack' },
              {},
              quietOutput,
            );
      expect(result).toMatchObject({ success: false, code: entry === 'public-id-miss' ? 'unauthorized' : 'forbidden' });
      expect(f.adapter.create).not.toHaveBeenCalled();
      expect(f.saves).not.toHaveBeenCalled();
      expect(hook).not.toHaveBeenCalled();
    },
  );

  it.each(sourceModes)(
    '%s output-only conversion failure follows a stored write without fallback, re-fetch or save',
    async (mode) => {
      const hook = vi.fn(() => ({}));
      const f = writeOutputFixture(mode, {
        docPermissions: { create: hook },
        afterPersist: {
          create: (doc) => {
            const normal = doc.toObject.bind(doc);
            vi.spyOn(doc, 'toObject').mockImplementation((options) => {
              if (options?.flattenMaps) throw new Error('output only');
              return normal(options);
            });
            return doc;
          },
        },
      });
      const result = await f.direct.create({ value: 'persisted' }, { select: ['value'] }, quietOutput);
      expect(result).toMatchObject({ success: false, code: 'bad_request' });
      expect(result).not.toHaveProperty('data');
      expect(JSON.stringify(result)).toContain('write output conversion failed');
      expect(f.saved).toHaveLength(1);
      expect(f.saved[0].value).toBe('persisted');
      expect(f.adapter.create).toHaveBeenCalledTimes(1);
      expect(f.adapter.findOne).not.toHaveBeenCalled();
      expect(f.saves).not.toHaveBeenCalled();
      expect(hook).not.toHaveBeenCalled();
    },
  );

  it.each(sourceModes)(
    '%s successful live _doc conversion cannot lend lifecycle snapshots or stored native leaves',
    async (mode) => {
      let context!: ModelHookContext;
      const f = writeOutputFixture(mode, {
        afterPersist: {
          create: (doc, _p, lifecycle) => {
            context = lifecycle;
            // An adapter/transform may return its own ordinary live storage. Nested
            // hydrated/Proxy arrays are deliberately not made supported by this test.
            delete (doc as any)._doc.children;
            vi.spyOn(doc, 'toObject').mockImplementation(() => (doc as any)._doc);
            return doc;
          },
        },
        docPermissions: {
          create: (doc: any) => {
            doc.value = 'output-hook';
            doc.when.setTime(100);
            doc.payload.bytes.fill(0);
            return {};
          },
        },
      });
      const result = await f.direct.create(
        { value: 'stored', when: new Date(1), payload: { bytes: Buffer.from('stored') } },
        { select: ['value', 'when', '-_id'] },
        quietOutput,
      );
      expect(result).toMatchObject({
        success: true,
        data: [{ value: mode === 'trusted' ? 'output-hook' : 'stored', when: new Date(mode === 'trusted' ? 100 : 1) }],
      });
      expect(context.finalDocumentSnapshot).toBe((context.currentDocument as any)._doc);
      expect(context.finalDocumentSnapshot!.value).toBe('stored');
      expect((context.finalDocumentSnapshot!.when as Date).getTime()).toBe(1);
      expect((context.currentDocument as any).payload.bytes.toString()).toBe('stored');
      expect(f.saved).toHaveLength(1);
      expect(f.saves).not.toHaveBeenCalled();
    },
  );

  it.each(sourceModes)(
    '%s mandatory full source admission bounds even an unselected denied post-write graph',
    async (mode) => {
      const hook = vi.fn(() => ({}));
      const f = writeOutputFixture(mode, {
        docPermissions: { create: hook },
        afterPersist: {
          create: (doc) => {
            (doc as any)._doc.hidden = Array(21000).fill(1);
            return doc;
          },
        },
      });
      expect(await f.direct.create({ value: 'persisted' }, { select: ['value', '-_id'] }, quietOutput)).toMatchObject({
        success: false,
        code: 'bad_request',
      });
      expect(hook).not.toHaveBeenCalled();
      expect(f.saved).toHaveLength(1);
      expect(f.adapter.findOne).not.toHaveBeenCalled();
      expect(f.saves).not.toHaveBeenCalled();
    },
  );

  it('all four trusted settings add no document-output authority to COUNT/DELETE/DISTINCT or raw helpers', async () => {
    const hook = vi.fn(() => ({}));
    const f = writeOutputFixture('trusted', { permissionSchema: { first: true }, docPermissions: hook });
    const distinct = vi.fn(async () => ['scalar']);
    Object.assign(f.adapter, { distinct });
    const remove = vi.spyOn(f.stored, 'deleteOne').mockResolvedValue(f.stored as never);
    const admissions = vi.spyOn(stages, 'prepareQueryDocumentStage');
    expect(await f.direct.count({})).toMatchObject({ success: true, data: 1 });
    expect(await f.direct.distinct('first')).toMatchObject({ success: true, data: ['scalar'] });
    expect(await f.direct.delete('existing')).toMatchObject({ success: true, data: 'existing' });
    expect(remove).toHaveBeenCalledTimes(1);
    expect(hook).not.toHaveBeenCalled();
    const raw = { first: 'raw' };
    expect(await f.direct.pickAllowedFields(raw, 'read')).toEqual(raw);
    expect(hook).not.toHaveBeenCalled();
    for (const [call, binding] of admissions.mock.calls) {
      expect(isWriteOutputAuthorization(call, binding)).toBe(false);
      expect(readServiceAuthorizationMode(call, binding)).toBe('isolated');
    }
    expect(f.saves).not.toHaveBeenCalled();
  });

  it.each(sourceModes)(
    '%s output hook rejection poisons shared publication, drains sibling work, and exposes no partial bulk result',
    async (mode) => {
      const entered = deferred(),
        release = deferred();
      let settled = false,
        returned = false;
      const f = writeOutputFixture(mode, {
        docPermissions: {
          create: async (doc: any) => {
            if (doc.value === 'bad') {
              await entered.promise;
              return { invalid: 'not-boolean' } as never;
            }
            entered.resolve();
            await release.promise;
            settled = true;
            return {};
          },
        },
      });
      const admitted = vi.spyOn(stages, 'prepareQueryDocumentStage');
      const pending = f.direct.create([{ value: 'bad' }, { value: 'slow' }], {}, quietOutput).then((value) => {
        returned = true;
        return value;
      });
      await entered.promise;
      await Promise.resolve();
      expect(returned).toBe(false);
      release.resolve();
      const result = await pending;
      expect(result).toMatchObject({ success: false, code: 'bad_request' });
      expect(result).not.toHaveProperty('data');
      expect(settled).toBe(true);
      expect(f.saved).toHaveLength(2);
      for (const outcome of admitted.mock.results)
        if (outcome.type === 'return') {
          const call = admitted.mock.calls[admitted.mock.results.indexOf(outcome)];
          expect(() => stages.documentStageSource(outcome.value.stage, call[1])).toThrow(ServiceAuthorizationError);
        }
    },
  );

  it.each([
    'create',
    'update',
    'upsert-create',
    'upsert-update',
    'public-upsert-create',
    'public-upsert-update',
  ] as const)(
    '%s captures branch modes, actor, policy/hook dependencies across await, while nested READ/LIST capture independently',
    async (entry) => {
      const entered = deferred(),
        release = deferred();
      const seen: any[] = [];
      const original = vi.fn((doc: any, permissions: Permission) => {
        expect(permissions.has('reader')).toBe(true);
        if (!(doc instanceof mongoose.Document)) {
          doc.value = 'old-hook';
          seen.push(doc);
        }
        return { owner: true };
      });
      const next = vi.fn((doc: any) => {
        if (!(doc instanceof mongoose.Document)) doc.value = 'new-hook';
        return { owner: false };
      });
      const independent: unknown[] = [];
      let first = true;
      const f = writeOutputFixture('trusted', {
        docPermissions: {
          create: { get: original, dependsOn: ['owner'] },
          update: { get: original, dependsOn: ['owner'] },
        },
        prepare: { create: pause, update: pause },
      });
      async function pause(data: any) {
        if (first) {
          first = false;
          entered.resolve();
          await release.promise;
          independent.push(await f.direct.findOne({}, { select: ['value', '-_id'] }, quietOutput));
          independent.push(await f.direct.find({}, { select: ['value', '-_id'] }, quietOutput));
        }
        return data;
      }
      const admissions = vi.spyOn(stages, 'prepareQueryDocumentStage');
      const creating = entry.endsWith('create') || entry === 'create';
      const args = { select: ['value', '-_id'] };
      const invoke = () =>
        entry === 'create'
          ? f.direct.create({ value: 'submitted', owner: true }, args, quietOutput)
          : entry === 'update'
            ? f.direct.updateOne({}, { value: 'submitted' }, args, quietOutput)
            : entry.startsWith('public')
              ? f.public._upsert(
                  { ...(creating ? {} : { _id: 'existing' }), value: 'submitted', owner: true },
                  args,
                  quietOutput,
                )
              : f.direct.upsert(
                  { _id: creating ? 'missing' : 'existing' },
                  { value: 'submitted', owner: true },
                  args,
                  quietOutput,
                );
      const pending = invoke();
      await entered.promise;
      f.runtime.setModelOptions(f.model.modelName, {
        createAuthorizationMode: 'isolated',
        updateAuthorizationMode: 'isolated',
        readAuthorizationMode: 'isolated',
        listAuthorizationMode: 'isolated',
        docPermissions: {
          create: { get: next, dependsOn: ['hidden'] },
          update: { get: next, dependsOn: ['hidden'] },
          read: next,
          list: next,
        },
      });
      f.request[PERMISSIONS] = new Permission({ admin: true });
      release.resolve();
      const result = await pending;
      expect(result.success).toBe(true);
      if (!result.success) throw new Error(result.code);
      expect(Array.isArray(result.data) ? result.data[0].value : result.data.value).toBe('old-hook');
      expect(next).toHaveBeenCalledTimes(2);
      expect(independent).toMatchObject([
        { success: true, data: { value: 'before' } },
        { success: true, data: [{ value: 'before' }] },
      ]);
      // Separate calls are independent even on the same receiver/request.
      expect(await f.direct.findOne({}, args, quietOutput)).toMatchObject({
        success: true,
        data: { value: creating ? 'before' : 'submitted' },
      });
      expect(await f.direct.find({}, args, quietOutput)).toMatchObject({ success: true });
      expect(await invoke()).toMatchObject({ success: true });
      const writeAdmissions = admissions.mock.calls.filter(([call, binding]) =>
        isWriteOutputAuthorization(call, binding),
      );
      expect(readServiceAuthorizationMode(writeAdmissions[0][0], writeAdmissions[0][1])).toBe('trusted');
      expect(readServiceAuthorizationMode(writeAdmissions.at(-1)![0], writeAdmissions.at(-1)![1])).toBe('isolated');
      expect(next).toHaveBeenCalled();
      expect(seen).toHaveLength(1);
    },
  );
});
