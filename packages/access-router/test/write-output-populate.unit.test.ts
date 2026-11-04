import mongoose from 'mongoose';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { sourceModes, quietOutput } from './owned-stage-test-fixture';
import { writeOutputFixture } from './write-output-test-fixture';
import { PublicService } from '../src/services/public-service';
import { runWithRuntime } from '../src/runtime-context';
import type { AuthorizationMode, ModelOutputContext } from '../src/interfaces';
import * as stages from '../src/acl/document-stage';
import * as materialization from '../src/acl/trusted-output-materialization';
import { readServiceAuthorizationMode, isWriteOutputAuthorization } from '../src/acl/service-authorization';
import { deferred } from './hook-admission-fixture';
import {
  createWriteServiceExecution,
  readServiceExecution,
  withExecutionOutputBudget,
} from '../src/acl/service-execution';
import { captureRelatedTargets } from '../src/acl/related-execution';
import { executeCreate } from '../src/acl/prepared-query';
import { createPublicationRowBudget } from '../src/acl/output-publication';
import { ServiceAuthorizationError } from '../src/acl/service-authorization';

let serial = 0;
afterEach(() => {
  vi.restoreAllMocks();
  mongoose.deleteModel(/^Oam03Populate/);
});

function fixture(
  parent: AuthorizationMode,
  targetMode: AuthorizationMode,
  shape: 'scalar' | 'array' | 'dotted',
  access: 'read' | 'list' | 'audit' = 'read',
) {
  const Target = mongoose.model(
    `Oam03Populate${++serial}`,
    new mongoose.Schema(
      { _id: String, value: String, hidden: String, owner: Boolean, when: Date },
      { versionKey: false },
    ),
  );
  const ref = { type: String, ref: Target.modelName };
  const path = shape === 'dotted' ? 'children.ref' : shape === 'array' ? 'refs' : 'ref';
  const events: string[] = [],
    sourceInputs: any[] = [],
    targetInputs: any[] = [];
  const raw = { _id: 'shared', value: 'target-original', hidden: 'never', owner: true, when: new Date(1) };
  const populate = vi.fn(async function (this: mongoose.Document) {
    const storage = (this as any)._doc;
    if (shape === 'scalar') storage.ref = raw;
    else if (shape === 'array') storage.refs = [raw, raw];
    else storage.children = [{ ref: raw }, { ref: raw }];
    return this;
  });
  const hook = vi.fn((doc: any, _p, context: ModelOutputContext) => {
    expect(context.operation === 'create' || context.operation === 'update').toBe(true);
    expect(context.outputAccess).toBe(access);
    targetInputs.push(doc);
    doc.value = 'target-hook';
    doc.when.setTime(10);
    events.push('target');
    return { owner: true };
  });
  const f = writeOutputFixture(
    parent,
    {
      permissionSchema: {
        value: true,
        receipt: true,
        ref: true,
        refs: true,
        children: { create: true, update: true, read: true, list: true, audit: true, sub: { ref: true } },
      },
      virtuals: {
        receipt: {
          dependsOn: [],
          get(doc: any) {
            events.push('parent-getter');
            const item = shape === 'scalar' ? doc.ref : shape === 'array' ? doc.refs[0] : doc.children[0].ref;
            expect(item).not.toHaveProperty('hidden');
            return item.value;
          },
        },
      },
      docPermissions: { create: sourceHook, update: sourceHook },
      afterPersist: { create: attach, update: attach },
    },
    { ref, refs: [ref], children: [new mongoose.Schema({ ref }, { _id: false })] },
  );
  function attach(doc: mongoose.Document) {
    vi.spyOn(doc, 'populate').mockImplementation(populate as never);
    return doc;
  }
  function sourceHook(doc: any) {
    if (!(doc instanceof mongoose.Document)) {
      sourceInputs.push(doc);
      const item = shape === 'scalar' ? doc.ref : shape === 'array' ? doc.refs[0] : doc.children[0].ref;
      expect(item.value).toBe('target-original');
      expect(item.when.getTime()).toBe(1);
      events.push('parent-hook');
    }
    return { owner: true };
  }
  f.runtime.registerModelInstance(Target.modelName, Target);
  f.runtime.setModelOptions(Target.modelName, {
    readAuthorizationMode: access === 'read' ? targetMode : targetMode === 'trusted' ? 'isolated' : 'trusted',
    listAuthorizationMode: access === 'list' ? targetMode : targetMode === 'trusted' ? 'isolated' : 'trusted',
    operationAccess: true,
    baseFilter: true,
    modelPermissionPrefix: 'doc:',
    stripPermissionsField: true,
    permissionSchema: { value: 'doc:owner', when: true, hidden: false },
    docPermissions: { read: hook, list: hook, audit: hook },
  });
  const targetAdapter = { mongooseModel: Target };
  const target = runWithRuntime(
    f.runtime,
    () =>
      new (class extends PublicService {
        protected createModelAdapter() {
          return targetAdapter;
        }
      })(f.request, Target.modelName),
  );
  vi.spyOn(f.request.macl, 'getPublicService').mockReturnValue(target);
  const args = {
    select: [shape === 'dotted' ? 'children.ref' : path, 'receipt', '-_id'],
    populate: [{ path, access, select: ['value', 'when', 'hidden', '-_id'] }],
  };
  return { ...f, Target, target, raw, events, sourceInputs, targetInputs, hook, args, path, populate };
}

describe('write-origin target ownership, occurrence plans and deterministic copies', () => {
  it.each(
    sourceModes.flatMap((parent) =>
      sourceModes.flatMap((targetMode) =>
        ['scalar', 'array', 'dotted'].flatMap((shape) =>
          ['read', 'list', 'audit'].map((access) => ({
            parent,
            targetMode,
            shape: shape as 'scalar' | 'array' | 'dotted',
            access: access as 'read' | 'list' | 'audit',
          })),
        ),
      ),
    ),
  )(
    '$parent parent / $targetMode target / $shape / $access retains target modes, detaches live/parent storage and finalizes shared identities once per plan',
    async ({ parent, targetMode, shape, access }) => {
      const f = fixture(parent, targetMode, shape, access);
      const mode = access === 'audit' ? 'isolated' : targetMode;
      const admissions = vi.spyOn(stages, 'prepareQueryDocumentStage');
      const copies = vi.spyOn(materialization, 'materializeTrustedOutputValue');
      const result = await f.direct.create([{ value: 'one' }, { value: 'two' }], f.args as never, quietOutput);
      expect(result.success).toBe(true);
      if (!result.success) throw new Error(JSON.stringify(result));
      const expected = mode === 'trusted' ? 'target-hook' : 'target-original';
      for (const row of result.data as any[]) {
        const item = shape === 'scalar' ? row.ref : shape === 'array' ? row.refs[0] : row.children[0].ref;
        expect(item).toEqual({ value: expected, when: new Date(mode === 'trusted' ? 10 : 1) });
        expect(row.receipt).toBe(expected);
      }
      expect(f.hook).toHaveBeenCalledTimes(1);
      expect(f.sourceInputs).toHaveLength(2);
      expect(f.events.filter((event) => event === 'target')).toHaveLength(1);
      expect(f.events.indexOf('target')).toBeLessThan(f.events.indexOf('parent-getter'));
      expect(f.raw.value).toBe('target-original');
      expect(f.raw.when.getTime()).toBe(1);
      const targetCall = admissions.mock.calls.find(([, binding]) => binding.model === f.Target)!;
      expect(readServiceAuthorizationMode(targetCall[0], targetCall[1])).toBe(mode);
      expect(isWriteOutputAuthorization(targetCall[0], targetCall[1])).toBe(true);
      const targetResult = admissions.mock.results[admissions.mock.calls.indexOf(targetCall)];
      expect(targetResult.type).toBe('return');
      if (targetResult.type === 'return')
        expect(f.targetInputs[0] === targetResult.value.source).toBe(mode === 'trusted');
      // Exactly one mandatory target source plus the isolated hook view. In
      // particular an isolated parent/trusted target must not pre-copy as well.
      expect(copies.mock.calls.filter(([value, path]) => path === '' && (value as any)?._id === 'shared')).toHaveLength(
        mode === 'trusted' ? 1 : 2,
      );
      const items = (result.data as any[]).flatMap((row) =>
        shape === 'scalar' ? [row.ref] : shape === 'array' ? row.refs : row.children.map((child: any) => child.ref),
      );
      expect(new Set(items).size).toBe(items.length);
      items[0].when.setTime(50);
      expect(items[1].when.getTime()).toBe(mode === 'trusted' ? 10 : 1);
      expect(f.adapter.create).toHaveBeenCalledTimes(2);
      expect(f.adapter.findOne).not.toHaveBeenCalled();
      expect(f.saves).not.toHaveBeenCalled();
    },
  );

  it.each(sourceModes.flatMap((parent) => sourceModes.map((targetMode) => ({ parent, targetMode }))))(
    '$parent UPDATE parent / $targetMode target modes are captured before populate awaits, never reread after save',
    async ({ parent, targetMode }) => {
      const f = fixture(parent, targetMode, 'scalar');
      const entered = deferred(),
        release = deferred();
      let first = true;
      f.runtime.setModelOption(f.Target.modelName, 'baseFilter', {
        read: async () => {
          if (first) {
            first = false;
            entered.resolve();
            await release.promise;
          }
          return {};
        },
      });
      const admissions = vi.spyOn(stages, 'prepareQueryDocumentStage');
      const pending = f.direct.updateOne({}, { value: 'updated' }, f.args as never, quietOutput);
      await entered.promise;
      f.runtime.setModelOptions(f.model.modelName, {
        updateAuthorizationMode: parent === 'trusted' ? 'isolated' : 'trusted',
      });
      f.runtime.setModelOption(
        f.Target.modelName,
        'readAuthorizationMode',
        targetMode === 'trusted' ? 'isolated' : 'trusted',
      );
      release.resolve();
      expect(await pending).toMatchObject({
        success: true,
        data: { ref: { value: targetMode === 'trusted' ? 'target-hook' : 'target-original' } },
      });
      const root = admissions.mock.calls.find(([, binding]) => binding.model === f.model)!;
      const child = admissions.mock.calls.find(([, binding]) => binding.model === f.Target)!;
      expect(readServiceAuthorizationMode(root[0], root[1])).toBe(parent);
      expect(readServiceAuthorizationMode(child[0], child[1])).toBe(targetMode);
      expect(f.saves).toHaveBeenCalledTimes(1);
      expect(f.adapter.findOne).toHaveBeenCalledTimes(1);
    },
  );

  it('equal IDs under distinct target policies/stages cannot share facts or output grants', async () => {
    const f = fixture('isolated', 'trusted', 'scalar');
    f.hook.mockImplementation((doc: any) => ({ owner: doc.owner === true }));
    const other = { ...f.raw, owner: false, value: 'other-target' };
    f.populate.mockImplementation(async function (this: mongoose.Document) {
      (this as any)._doc.ref = f.raw;
      (this as any)._doc.refs = [other];
      return this;
    });
    const result = await f.direct.create(
      { value: 'submitted' },
      {
        select: ['ref', 'refs', '-_id'],
        populate: [
          { path: 'ref', select: ['value', 'hidden', '-_id'] },
          { path: 'refs', select: ['value', 'hidden', '-_id'] },
        ],
      },
      {
        ...quietOutput,
        authorization: {
          related: { ref: { model: f.Target.modelName, outputFields: { mode: 'grant', paths: ['hidden'] } } },
        },
      },
    );
    expect(result).toMatchObject({
      success: true,
      data: [{ ref: { value: 'target-original', hidden: 'never' }, refs: [{}] }],
    });
    expect(f.hook).toHaveBeenCalledTimes(2);
  });

  it.each(sourceModes.flatMap((parent) => ['rows', 'filter', 'operation'].map((denial) => ({ parent, denial }))))(
    '$parent write output cannot bypass target $denial denial with trusted target modes',
    async ({ parent, denial }) => {
      const f = fixture(parent, 'trusted', 'scalar');
      f.runtime.setModelOption(f.model.modelName, 'docPermissions', { create: () => ({}) });
      if (denial === 'filter') f.runtime.setModelOption(f.Target.modelName, 'baseFilter', { read: () => false });
      if (denial === 'operation')
        f.runtime.setModelOptions(f.Target.modelName, {
          operationAccess: { read: false },
          requireOperationAccessForPopulateQueries: true,
        });
      const result = await f.direct.create(
        { value: 'stored', ref: 'shared' },
        {
          select: ['value', 'ref', '-_id'],
          populate: [{ path: 'ref', select: ['value', 'hidden', '-_id'] }],
        },
        {
          ...quietOutput,
          ...(denial === 'rows'
            ? {
                authorization: {
                  related: {
                    ref: { model: f.Target.modelName, rows: { mode: 'scope' as const, filter: false as const } },
                  },
                },
              }
            : {}),
        },
      );
      // Denied population retains only the ordinary allowed source ID, never an
      // unauthorized target row. The output mode is not related read authority.
      expect(result).toMatchObject({ success: true, data: [{ value: 'stored', ref: 'shared' }] });
      expect(f.hook).not.toHaveBeenCalled();
      expect(f.populate).not.toHaveBeenCalled();
      expect(f.saved).toHaveLength(1);
    },
  );

  it.each(sourceModes)(
    '%s preregisters all receiving budgets before any target hook or selected target construction',
    async (mode) => {
      const f = fixture(mode, 'trusted', 'array');
      const entry = createWriteServiceExecution(
        f.direct,
        'create',
        undefined,
        'create',
        captureRelatedTargets(f.runtime, f.model.modelName, f.args),
      );
      const state = readServiceExecution(f.direct, entry);
      const budget = createPublicationRowBudget(state.publication);
      materialization.visitTrustedOutput(budget, 0, 19999);
      const execution = withExecutionOutputBudget(f.direct, entry, () => budget);
      await expect(
        executeCreate(f.direct, execution, { value: 'persisted' }, f.args as never, quietOutput),
      ).rejects.toBeInstanceOf(ServiceAuthorizationError);
      expect(f.hook).not.toHaveBeenCalled();
      expect(f.saved).toHaveLength(1);
      expect(f.saves).not.toHaveBeenCalled();
      expect(f.adapter.findOne).not.toHaveBeenCalled();
    },
  );
});
