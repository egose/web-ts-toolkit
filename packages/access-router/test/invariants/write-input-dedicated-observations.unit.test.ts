import * as fs from 'node:fs/promises';
import path from 'node:path';
import mongoose from 'mongoose';
import { afterAll, afterEach, describe, expect, it, vi } from 'vitest';
import type { DocumentGrants, ModelOutputContext } from '../../src/interfaces';
import { EMPTY_DOCUMENT_GRANTS } from '../../src/acl/document-grants';
import * as stages from '../../src/acl/document-stage';
import {
  getAuthorizationPermissions,
  isWriteOutputAuthorization,
  readServiceAuthorizationAccess,
  readServiceAuthorizationMode,
  ServiceAuthorizationError,
} from '../../src/acl/service-authorization';
import { assertOutputPublication, outputPublicationFor } from '../../src/acl/output-publication';
import Permission from '../../src/permission';
import { PERMISSIONS } from '../../src/symbols';
import { deferred } from '../support/public/hook-admission-fixture';
import { sourceModes } from '../support/private/owned-stage-test-fixture';
import { writeOutputFixture } from '../support/private/write-output-test-fixture';
import { observeInputNative, observeInputStages } from '../support/private/write-input-view-test-fixture';

const observations: object[] = [];
afterEach(() => vi.restoreAllMocks());
afterAll(async () => {
  if (!process.env.CWO02_DEDICATED_REPORT) return;
  const target = path.resolve(process.env.CWO02_DEDICATED_REPORT);
  expect(target.startsWith(`${path.resolve(process.env.TMPDIR!)}${path.sep}`)).toBe(true);
  await fs.writeFile(target, JSON.stringify(observations));
});

const methods = ['update', 'bulkUpdate'] as const;
const entries = ['direct', 'public'] as const;
const hookKinds = ['absent', 'sync', 'async'] as const;
type Method = (typeof methods)[number];
type Entry = (typeof entries)[number];
type Fixture = ReturnType<typeof writeOutputFixture>;
const cases = sourceModes.flatMap((mode) =>
  entries.flatMap((entry) => methods.map((method) => ({ mode, entry, method }))),
);

function seedChildren(f: Fixture) {
  f.stored.set('children', [
    { _id: 'child-a', value: 'one', hidden: 'keep-one' },
    { _id: 'child-b', value: 'two', hidden: 'keep-two' },
  ]);
}

function mutate(f: Fixture, entry: Entry, method: Method, options?: any) {
  const service = entry === 'direct' ? f.direct : f.public;
  return method === 'update'
    ? service.updateSub('existing', 'children', 'child-a', { value: 'changed-one', hidden: 'attack' }, options)
    : service.bulkUpdateSub(
        'existing',
        'children',
        [
          { _id: 'child-a', value: 'changed-one', hidden: 'attack' },
          { _id: 'child-b', value: 'changed-two', hidden: 'attack' },
        ],
        options,
      );
}

describe('dedicated UPDATE input belongs to the hydrated parent, not the child/output stage', () => {
  it.each(cases.flatMap((item) => hookKinds.map((hookKind) => ({ ...item, hookKind }))))(
    '$mode $entry $method $hookKind preserves native source/view, hydrated hook, actor and separate facts',
    async ({ mode, entry, method, hookKind }) => {
      const pre = { owner: true, suspended: false };
      const post = { owner: false, suspended: false };
      const contexts: ModelOutputContext[] = [];
      const inputFacts: DocumentGrants[] = [];
      const outputFacts: DocumentGrants[] = [];
      const hook = vi.fn(function (this: unknown, doc: any, permissions: Permission, context: ModelOutputContext) {
        expect(this).toBe(f.request);
        expect(doc).toBe(f.stored);
        expect(doc).toBeInstanceOf(mongoose.Document);
        expect(doc.children.map((child: any) => child.value)).toEqual(['one', 'two']);
        expect(permissions).toBe(getAuthorizationPermissions(admitted[0].authorization, admitted[0].binding));
        expect(permissions.has('reader')).toBe(true);
        expect(native.events).toEqual(['prewrite.source', 'prewrite.view']);
        expect(context).toMatchObject({
          operation: method === 'update' ? 'subUpdate' : 'subBulkUpdate',
          virtualAccess: 'update',
          outputAccess: 'read',
          docPermissionsAccess: 'update',
          scopePath: [],
        });
        expect(context.docPermissions).toBe(EMPTY_DOCUMENT_GRANTS);
        expect(Object.isFrozen(context)).toBe(true);
        for (const key of [
          'authorization',
          'sourceMode',
          'documentStage',
          'currentDocument',
          'originalDocumentSnapshot',
        ])
          expect(context).not.toHaveProperty(key);
        expect(() => stages.readDocumentStage(admitted[0].stage, admitted[0].binding)).toThrow(
          ServiceAuthorizationError,
        );
        contexts.push(context);
        return pre;
      });
      const read = vi.fn(function (this: unknown, doc: any, permissions: Permission, context: ModelOutputContext) {
        expect(this).toBe(f.request);
        expect(doc).not.toBeInstanceOf(mongoose.Document);
        expect(doc).not.toBe(f.stored);
        expect(permissions.has('reader')).toBe(true);
        expect(context.docPermissionsAccess).toBe('read');
        expect(context.docPermissions).toBe(EMPTY_DOCUMENT_GRANTS);
        expect(f.saves).toHaveBeenCalledOnce();
        return post;
      });
      const rule = vi.fn(function (this: unknown, permissions: Permission, facts: DocumentGrants) {
        expect(this).toBe(f.request);
        expect(permissions.has('reader')).toBe(true);
        expect(facts).toBe(admitted[0].readyFacts);
        expect(Object.isFrozen(facts)).toBe(true);
        expect(Object.getPrototypeOf(facts)).toBeNull();
        expect(admitted[0].cleared).toBe(true);
        expect(() => stages.documentStageSource(admitted[0].stage, admitted[0].binding)).toThrow(
          ServiceAuthorizationError,
        );
        inputFacts.push(facts);
        pre.owner = false;
        return hookKind === 'absent' || facts.owner === true;
      });
      const outputRule = vi.fn(function (this: unknown, _permissions: Permission, facts: DocumentGrants) {
        expect(this).toBe(f.request);
        expect(facts).toEqual(post);
        expect(facts).not.toBe(post);
        expect(facts).not.toBe(inputFacts[0]);
        expect(Object.isFrozen(facts)).toBe(true);
        outputFacts.push(facts);
        return true;
      });
      const f = writeOutputFixture(mode, {
        docPermissions: {
          update:
            hookKind === 'absent'
              ? undefined
              : {
                  get:
                    hookKind === 'sync'
                      ? hook
                      : async function (...args) {
                          await Promise.resolve();
                          return hook.apply(this, args);
                        },
                  dependsOn: ['owner', 'children'],
                },
          read,
        },
        permissionSchema: {
          children: { read: true, sub: { value: { update: rule, read: outputRule }, hidden: false } },
        },
      });
      seedChildren(f);
      const admitted = observeInputStages(f);
      const native = observeInputNative(f);
      let result;
      try {
        result = await mutate(f, entry, method);
        expect(native.receivers[1]).toBe(admitted[0].source.payload.code);
        expect(native.receivers[0]).not.toBe(native.receivers[1]);
        expect(Object.hasOwn(native.receivers[1], 'toBSON')).toBe(false);
      } finally {
        native.restore();
      }
      expect(result.success).toBe(true);
      if (!result.success) throw new Error(result.code);
      const expected = method === 'update' ? ['changed-one', 'two'] : ['changed-one', 'changed-two'];
      expect(f.saved[0].children.map((child: any) => child.value)).toEqual(expected);
      expect(f.saved[0].children.map((child: any) => child.hidden)).toEqual(['keep-one', 'keep-two']);
      expect(f.saved[0].children.map((child: any) => child._id)).toEqual(['child-a', 'child-b']);
      const visible = Array.isArray(result.data) ? result.data : [result.data];
      expect(visible.map((child: any) => child.value)).toEqual(method === 'update' ? ['changed-one'] : expected);
      expect(visible.every((child: any) => !Object.hasOwn(child, 'hidden'))).toBe(true);
      expect(rule).toHaveBeenCalledOnce();
      expect(read).toHaveBeenCalledOnce();
      expect(hook).toHaveBeenCalledTimes(hookKind === 'absent' ? 0 : 1);
      expect(inputFacts[0]).toEqual(hookKind === 'absent' ? {} : { owner: true, suspended: false });
      expect(new Set(outputFacts).size).toBe(1);
      expect(admitted).toHaveLength(1);
      expect(admitted[0].source).not.toBe(f.stored);
      expect(readServiceAuthorizationMode(admitted[0].authorization, admitted[0].binding)).toBe('isolated');
      expect(isWriteOutputAuthorization(admitted[0].authorization, admitted[0].binding)).toBe(false);
      expect(readServiceAuthorizationAccess(admitted[0].authorization, admitted[0].binding)).toMatchObject({
        operation: method === 'update' ? 'subUpdate' : 'subBulkUpdate',
        rowAccess: 'subs.children.update',
        virtualAccess: 'update',
        outputAccess: 'read',
        docPermissionsAccess: 'read',
      });
      expect(native.events).toEqual(['prewrite.source', 'prewrite.view', 'postwrite.source', 'postwrite.view']);
      expect(f.adapter.findOne).toHaveBeenCalledTimes(2);
      expect(f.adapter.findOne.mock.calls[0][0].lean).toBe(false);
      expect(f.adapter.findOne.mock.calls[1][0].lean).toBe(true);
      expect(f.saves).toHaveBeenCalledOnce();
      expect(f.adapter.create).not.toHaveBeenCalled();
      observations.push({
        kind: 'dedicated-success',
        mode,
        entry,
        method,
        hookKind,
        events: native.events,
        hydratedHooks: contexts.length,
        inputRuleCalls: rule.mock.calls.length,
        saves: 1,
        finds: 2,
        inputSourceMode: 'isolated',
        writeOutputOrigin: false,
        values: expected,
      });
    },
  );

  it.each(cases.flatMap((item) => hookKinds.map((hookKind) => ({ ...item, hookKind }))))(
    '$mode $entry $method $hookKind rejects a view-only native error before any hook/rule/save',
    async ({ mode, entry, method, hookKind }) => {
      const hook = vi.fn(() => ({ owner: true }));
      const read = vi.fn(() => ({}));
      const rule = vi.fn(() => true);
      const f = writeOutputFixture(mode, {
        docPermissions: {
          update: hookKind === 'absent' ? undefined : hookKind === 'sync' ? hook : async () => hook(),
          read,
        },
        permissionSchema: { children: { read: true, sub: { value: { update: rule, read: true }, hidden: false } } },
      });
      seedChildren(f);
      const admitted = observeInputStages(f);
      const native = observeInputNative(f, { failAt: 'prewrite.view' });
      let result;
      try {
        result = await mutate(f, entry, method);
      } finally {
        native.restore();
      }
      expect(result).toMatchObject({ success: false, code: 'bad_request' });
      expect(result).not.toHaveProperty('data');
      expect(native.events).toEqual(['prewrite.source', 'prewrite.view']);
      expect(hook).not.toHaveBeenCalled();
      expect(read).not.toHaveBeenCalled();
      expect(rule).not.toHaveBeenCalled();
      expect(f.saves).not.toHaveBeenCalled();
      expect(f.saved).toEqual([]);
      expect(f.stored.children.map((child: any) => child.value)).toEqual(['one', 'two']);
      expect(f.adapter.findOne).toHaveBeenCalledOnce();
      expect(admitted).toHaveLength(1);
      expect(admitted[0].cleared).toBe(true);
      expect(admitted[0].readyFacts).toBeUndefined();
      expect(() => stages.readDocumentStage(admitted[0].stage, admitted[0].binding)).toThrow(ServiceAuthorizationError);
      expect(() => assertOutputPublication(outputPublicationFor(admitted[0].authorization))).toThrow(
        ServiceAuthorizationError,
      );
      observations.push({
        kind: 'dedicated-view-error',
        mode,
        entry,
        method,
        hookKind,
        events: native.events,
        code: result.code,
        saves: 0,
        finds: 1,
        hooks: 0,
        rules: 0,
        cleared: true,
      });
    },
  );

  it.each(cases.flatMap((item) => ['native', 'oversized-unselected-source'].map((failure) => ({ ...item, failure }))))(
    '$mode $entry $method keeps initial source admission for $failure',
    async ({ mode, entry, method, failure }) => {
      const hook = vi.fn(() => ({}));
      const f = writeOutputFixture(mode, { docPermissions: { update: hook } });
      seedChildren(f);
      const admitted = observeInputStages(f);
      const native = observeInputNative(f, { failAt: failure === 'native' ? 'prewrite.source' : undefined });
      if (failure !== 'native') f.stored.set('hidden', Array(21000).fill('unselected'));
      let result;
      try {
        result = await mutate(f, entry, method);
      } finally {
        native.restore();
      }
      expect(result).toMatchObject({ success: false, code: 'bad_request' });
      expect(native.events).not.toContain('prewrite.view');
      expect(admitted).toEqual([]);
      expect(hook).not.toHaveBeenCalled();
      expect(f.saves).not.toHaveBeenCalled();
      expect(f.adapter.findOne).toHaveBeenCalledOnce();
      expect(f.stored.children.map((child: any) => child.value)).toEqual(['one', 'two']);
      observations.push({
        kind: 'dedicated-source-error',
        mode,
        entry,
        method,
        failure,
        code: result.code,
        saves: 0,
        views: 0,
      });
    },
  );

  it.each(cases)(
    '$mode $entry $method rejects native view-installed inherited wire accessors without invoking them',
    async ({ mode, entry, method }) => {
      const previous = Object.getOwnPropertyDescriptor(Object.prototype, 'position');
      const accessor = vi.fn(() => {
        throw new Error('inherited wire accessor must stay inert');
      });
      const hook = vi.fn(() => ({}));
      const f = writeOutputFixture(mode, { docPermissions: { update: hook } });
      seedChildren(f);
      const native = observeInputNative(f, {
        onObservation(event) {
          if (event === 'prewrite.view')
            Object.defineProperty(Object.prototype, 'position', {
              configurable: true,
              get: accessor,
              set: accessor,
            });
        },
      });
      let result;
      try {
        result = await mutate(f, entry, method);
      } finally {
        if (previous) Object.defineProperty(Object.prototype, 'position', previous);
        else Reflect.deleteProperty(Object.prototype, 'position');
        native.restore();
      }
      expect(result).toMatchObject({ success: false, code: 'bad_request' });
      expect(native.events).toEqual(['prewrite.source', 'prewrite.view']);
      expect(accessor).not.toHaveBeenCalled();
      expect(hook).not.toHaveBeenCalled();
      expect(f.saves).not.toHaveBeenCalled();
      expect(f.stored.children[0].value).toBe('one');
      observations.push({
        kind: 'dedicated-prototype-error',
        mode,
        entry,
        method,
        events: native.events,
        code: result.code,
        accessorCalls: 0,
        saves: 0,
      });
    },
  );

  it.each(cases)(
    '$mode $entry $method output trust/grants and forged metadata do not become input trust',
    async ({ mode, entry, method }) => {
      const f = writeOutputFixture(mode, {
        docPermissions: { update: () => ({ owner: false }), read: () => ({ owner: true }) },
        permissionSchema: {
          children: { read: true, sub: { value: { update: 'doc:owner', read: true }, hidden: false } },
        },
      });
      seedChildren(f);
      const options =
        entry === 'direct'
          ? { authorization: { visibility: { child: { outputFields: { mode: 'grant', paths: ['hidden'] } } } } }
          : undefined;
      const service = entry === 'direct' ? f.direct : f.public;
      const data = { value: 'denied', hidden: 'attack', _permissions: { owner: true } };
      const result =
        method === 'update'
          ? await service.updateSub('existing', 'children', 'child-a', data, options)
          : await service.bulkUpdateSub('existing', 'children', [{ _id: 'child-a', ...data }], options);
      expect(result.success).toBe(true);
      expect(f.saved[0].children[0]).toMatchObject({ value: 'one', hidden: 'keep-one' });
      expect(f.saved[0].children[0]).not.toHaveProperty('_permissions');
      expect(f.saves).toHaveBeenCalledOnce();
      if (!result.success) throw new Error(result.code);
      const row = Array.isArray(result.data) ? result.data[0] : result.data;
      expect(row.value).toBe('one');
      if (entry === 'direct') expect(row.hidden).toBe('keep-one');
      else expect(row).not.toHaveProperty('hidden');
      observations.push({ kind: 'dedicated-negative-input-trust', mode, entry, method, saves: 1, storedValue: 'one' });
    },
  );

  it.each(sourceModes.flatMap((mode) => methods.map((method) => ({ mode, method }))))(
    '$mode $method captures parent hook/dependencies/rules/actor, then resolves a fresh next call',
    async ({ mode, method }) => {
      const entered = deferred(),
        release = deferred();
      const hook = vi.fn(function (this: unknown, doc: any, permissions: Permission) {
        expect(this).toBe(f.request);
        expect(doc).toBe(f.stored);
        expect(permissions.has('reader')).toBe(true);
        return { owner: true };
      });
      const next = vi.fn(function (this: unknown, doc: any, permissions: Permission) {
        expect(this).toBe(f.request);
        expect(doc).toBe(f.stored);
        expect(permissions.has('reader')).toBe(false);
        return { owner: false };
      });
      const f = writeOutputFixture(mode, {
        docPermissions: { update: { get: hook, dependsOn: ['owner', 'children'] } },
        permissionSchema: {
          children: { read: true, sub: { value: { update: 'reader doc:owner', read: true }, hidden: false } },
        },
      });
      seedChildren(f);
      const admitted = observeInputStages(f);
      f.adapter.findOne.mockImplementationOnce(async () => {
        entered.resolve();
        await release.promise;
        return f.stored;
      });
      const pending = mutate(f, 'direct', method);
      try {
        await entered.promise;
        f.runtime.setModelOptions(f.model.modelName, {
          docPermissions: { update: { get: next, dependsOn: ['value'] } },
          permissionSchema: { children: { read: true, sub: { value: { update: false, read: true }, hidden: false } } },
        });
        f.request[PERMISSIONS] = new Permission({ reader: false });
      } finally {
        release.resolve();
      }
      expect((await pending).success).toBe(true);
      expect(hook).toHaveBeenCalledOnce();
      expect(next).not.toHaveBeenCalled();
      expect(f.adapter.findOne.mock.calls[0][0].select).toContain('+children.hidden');
      expect(f.saved[0].children[0].value).toBe('changed-one');
      const service = f.direct;
      const second =
        method === 'update'
          ? await service.updateSub('existing', 'children', 'child-a', { value: 'second-denied' })
          : await service.bulkUpdateSub('existing', 'children', [{ _id: 'child-a', value: 'second-denied' }]);
      expect(second.success).toBe(true);
      expect(hook).toHaveBeenCalledOnce();
      expect(next).toHaveBeenCalledOnce();
      expect(f.saved[1].children[0].value).toBe('changed-one');
      expect(admitted).toHaveLength(2);
      expect(admitted[0].source).not.toBe(admitted[1].source);
      expect(admitted[0].readyFacts).toEqual({ owner: true });
      expect(admitted[1].readyFacts).toEqual({ owner: false });
      expect(f.saves).toHaveBeenCalledTimes(2);
      observations.push({
        kind: 'dedicated-in-flight-capture',
        mode,
        method,
        saves: 2,
        originalHooks: 1,
        nextHooks: 1,
        distinctSources: true,
        finalValue: 'changed-one',
      });
    },
  );
});
