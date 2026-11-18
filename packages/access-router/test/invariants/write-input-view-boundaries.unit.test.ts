import * as fs from 'node:fs/promises';
import path from 'node:path';
import { afterAll, afterEach, describe, expect, it, vi } from 'vitest';
import type { ModelHookContext, ModelOutputContext } from '../../src/interfaces';
import * as stages from '../../src/acl/document-stage';
import { EMPTY_DOCUMENT_GRANTS } from '../../src/acl/document-grants';
import { resolveInputDocumentGrants } from '../../src/acl/model-input-admission';
import { createWriteServiceExecution, readServiceExecution } from '../../src/acl/service-execution';
import { readServiceAuthorizationMode, ServiceAuthorizationError } from '../../src/acl/service-authorization';
import { assertOutputPublication, closeOutputPublication } from '../../src/acl/output-publication';
import { deferred } from '../support/public/hook-admission-fixture';
import { quietOutput, sourceModes } from '../support/private/owned-stage-test-fixture';
import { writeOutputFixture } from '../support/private/write-output-test-fixture';
import { observeInputNative, observeInputStages } from '../support/private/write-input-view-test-fixture';

const observations: object[] = [];
afterEach(() => vi.restoreAllMocks());
afterAll(async () => {
  if (!process.env.CWO02_STAGE_REPORT) return;
  const target = path.resolve(process.env.CWO02_STAGE_REPORT);
  expect(target.startsWith(`${path.resolve(process.env.TMPDIR!)}${path.sep}`)).toBe(true);
  await fs.writeFile(target, JSON.stringify(observations));
});

const entries = ['update-id', 'update-filter', 'upsert-update', 'public-update', 'public-upsert-update'] as const;
const hookKinds = ['absent', 'sync', 'async'] as const;
type Fixture = ReturnType<typeof writeOutputFixture>;
function update(f: Fixture, entry: (typeof entries)[number]) {
  const data = { value: 'submitted' },
    args = { select: ['value', '-_id'] };
  return entry === 'update-id'
    ? f.direct.updateById('existing', data, args, quietOutput)
    : entry === 'update-filter'
      ? f.direct.updateOne({ _id: 'existing' }, data, args, quietOutput)
      : entry === 'upsert-update'
        ? f.direct.upsert({ _id: 'existing' }, data, args, quietOutput)
        : entry === 'public-update'
          ? f.public._update('existing', data, args, quietOutput)
          : f.public._upsert({ _id: 'existing', ...data }, args, quietOutput);
}

describe('unused pre-write views retain native, lifecycle and closed-stage safety', () => {
  it.each(
    sourceModes.flatMap((mode) => entries.flatMap((entry) => hookKinds.map((hookKind) => ({ mode, entry, hookKind })))),
  )(
    '$mode $entry $hookKind native view failure prevents hook/lifecycle/save/fallback',
    async ({ mode, entry, hookKind }) => {
      const hook = vi.fn(() => ({ owner: true }));
      const validate = vi.fn(() => true),
        prepare = vi.fn((data) => data),
        transform = vi.fn((doc) => doc);
      const afterPersist = vi.fn((doc) => doc),
        changes = vi.fn();
      const f = writeOutputFixture(mode, {
        docPermissions: { update: hookKind === 'absent' ? undefined : hookKind === 'sync' ? hook : async () => hook() },
        validate: { update: validate },
        prepare: { update: prepare },
        transform: { update: transform },
        afterPersist: { update: afterPersist },
        onChange: changes,
      });
      const admitted = observeInputStages(f);
      const native = observeInputNative(f, { failAt: 'prewrite.view' });
      let result;
      try {
        result = await update(f, entry);
      } finally {
        native.restore();
      }
      expect(result).toMatchObject({ success: false, code: 'bad_request' });
      for (const key of ['data', 'input', 'context']) expect(result).not.toHaveProperty(key);
      expect(native.events).toEqual(['prewrite.source', 'prewrite.view']);
      for (const callback of [hook, validate, prepare, transform, afterPersist, changes])
        expect(callback).not.toHaveBeenCalled();
      expect(f.saves).not.toHaveBeenCalled();
      expect(f.adapter.create).not.toHaveBeenCalled();
      expect(f.stored.value).toBe('before');
      expect(f.saved).toEqual([]);
      expect(admitted).toHaveLength(1);
      expect(admitted[0].cleared).toBe(true);
      expect(admitted[0].readyFacts).toBeUndefined();
      expect(() => stages.documentStageSource(admitted[0].stage, admitted[0].binding)).toThrow(
        ServiceAuthorizationError,
      );
      expect(readServiceAuthorizationMode(admitted[0].authorization, admitted[0].binding)).toBe('isolated');
      expect(f.adapter.findOne).toHaveBeenCalledTimes(entry === 'upsert-update' ? 2 : 1);
      expect(f.adapter.exists).toHaveBeenCalledTimes(entry === 'public-upsert-update' ? 1 : 0);
      observations.push({
        kind: 'canonical-view-error',
        mode,
        entry,
        hookKind,
        events: native.events,
        code: result.code,
        saves: 0,
        lifecycleCalls: 0,
        finds: f.adapter.findOne.mock.calls.length,
        exists: f.adapter.exists.mock.calls.length,
        cleared: true,
      });
    },
  );

  it.each(sourceModes.flatMap((mode) => hookKinds.map((hookKind) => ({ mode, hookKind }))))(
    '$mode $hookKind primitive-only hydration override still admits an owned source and commits before clear',
    async ({ mode, hookKind }) => {
      const returned = { owner: true };
      const hook = vi.fn(function (this: unknown, doc: unknown, _permissions: unknown, context: ModelOutputContext) {
        expect(this).toBe(f.request);
        expect(doc).toBe(f.stored);
        expect(context.docPermissions).toBe(EMPTY_DOCUMENT_GRANTS);
        expect(context.docPermissionsAccess).toBe('update');
        expect(Object.isFrozen(context)).toBe(true);
        expect(() => stages.readDocumentStage(admitted[0].stage, admitted[0].binding)).toThrow(
          ServiceAuthorizationError,
        );
        return returned;
      });
      const f = writeOutputFixture(mode, {
        docPermissions: {
          update:
            hookKind === 'absent'
              ? undefined
              : hookKind === 'sync'
                ? hook
                : async function (...args) {
                    await Promise.resolve();
                    return hook.apply(this, args);
                  },
        },
      });
      // A supported native conversion may return external, frozen scalar data.
      // Its shape/freeze is not a token permitting later calls to skip admission.
      const external = Object.freeze({ value: 'native scalar', owner: true });
      const convert = vi.spyOn(f.stored, 'toObject').mockReturnValue(external as never);
      const admitted = observeInputStages(f);
      const state = readServiceExecution(f.direct, createWriteServiceExecution(f.direct, 'update'));
      const context: ModelHookContext = { modelName: f.model.modelName, mongooseModel: f.model, operation: 'update' };
      const facts = await resolveInputDocumentGrants({ ...state, doc: f.stored, context });
      expect(convert).toHaveBeenCalledOnce();
      expect(convert).toHaveBeenCalledWith({ virtuals: false, flattenMaps: true });
      expect(admitted[0].source).toEqual(external);
      expect(admitted[0].source).not.toBe(external);
      expect(admitted[0].readyFacts).toBe(facts);
      expect(facts).toEqual(hookKind === 'absent' ? {} : { owner: true });
      expect(Object.isFrozen(facts)).toBe(true);
      expect(Object.getPrototypeOf(facts)).toBeNull();
      returned.owner = false;
      if (hookKind !== 'absent') expect(facts.owner).toBe(true);
      expect(hook).toHaveBeenCalledTimes(hookKind === 'absent' ? 0 : 1);
      expect(admitted[0].cleared).toBe(true);
      expect(() => stages.readDocumentStage(admitted[0].stage, admitted[0].binding)).toThrow(ServiceAuthorizationError);
      expect(stages.getQueryOutputOriginal(admitted[0].source, state.authorization)).toBe(f.stored);
      await closeOutputPublication(state.publication);
      expect(stages.getQueryOutputOriginal(admitted[0].source, state.authorization)).toBe(admitted[0].source);
      expect(() => assertOutputPublication(state.publication)).toThrow(ServiceAuthorizationError);
      expect(f.saves).not.toHaveBeenCalled();
      observations.push({
        kind: 'primitive-source-control',
        mode,
        hookKind,
        conversions: 1,
        ownedSource: true,
        committedBeforeClear: true,
        releasedOnPublicationClose: true,
      });
    },
  );

  it.each(sourceModes)(
    '%s closing a pending input owner drains the hook and rejects late commit before source/binding reads',
    async (mode) => {
      const entered = deferred(),
        release = deferred();
      let completed = false;
      const hook = vi.fn(async () => {
        entered.resolve();
        await release.promise;
        completed = true;
        return { owner: true };
      });
      const f = writeOutputFixture(mode, { docPermissions: { update: hook } });
      const admitted = observeInputStages(f);
      const state = readServiceExecution(f.direct, createWriteServiceExecution(f.direct, 'update'));
      const context: ModelHookContext = { modelName: f.model.modelName, mongooseModel: f.model, operation: 'update' };
      const pending = resolveInputDocumentGrants({ ...state, doc: f.stored, context }).catch((error) => error);
      let closing!: Promise<unknown>;
      let returned = false;
      const failure = new ServiceAuthorizationError('stop pending input');
      try {
        await entered.promise;
        expect(() => stages.readDocumentStage(admitted[0].stage, admitted[0].binding)).toThrow(
          ServiceAuthorizationError,
        );
        closing = closeOutputPublication(state.publication, failure).catch((error) => {
          returned = true;
          return error;
        });
        await Promise.resolve();
        expect(returned).toBe(false);
        expect(completed).toBe(false);
        const bindingRead = vi.fn();
        const changed = Object.defineProperty({ ...admitted[0].binding }, 'request', { get: bindingRead });
        expect(() => stages.documentStageSource(admitted[0].stage, changed)).toThrow(ServiceAuthorizationError);
        expect(() => stages.readDocumentStage(admitted[0].stage, changed)).toThrow(ServiceAuthorizationError);
        expect(bindingRead).not.toHaveBeenCalled();
        expect(stages.getQueryOutputOriginal(admitted[0].source, state.authorization)).toBe(f.stored);
      } finally {
        release.resolve();
      }
      expect(await pending).toBeInstanceOf(ServiceAuthorizationError);
      expect(await closing).toBe(failure);
      expect(completed).toBe(true);
      expect(hook).toHaveBeenCalledOnce();
      expect(admitted[0].readyFacts).toBeUndefined();
      expect(admitted[0].cleared).toBe(true);
      expect(stages.getQueryOutputOriginal(admitted[0].source, state.authorization)).toBe(admitted[0].source);
      const native = vi.spyOn(f.stored, 'toObject');
      expect(() => stages.createDocumentStage(state.authorization, admitted[0].binding, f.stored)).toThrow(
        ServiceAuthorizationError,
      );
      expect(native).not.toHaveBeenCalled();
      expect(f.saves).not.toHaveBeenCalled();
      observations.push({
        kind: 'input-owner-draining',
        mode,
        hookCalls: 1,
        drained: true,
        lateCommitRejected: true,
        closedBindingReads: 0,
        closedNativeCalls: 0,
        released: true,
      });
    },
  );
});
