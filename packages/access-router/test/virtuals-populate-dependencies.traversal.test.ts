import mongoose from 'mongoose';
import { describe, expect, it, vi } from 'vitest';
import { createAccessRuntime } from '../src/index';
import Permission from '../src/permission';
import { captureModelAuthorizationConfiguration } from '../src/acl/model-output-planning';
import { planAuthorizedModelProjection } from '../src/acl/output-projection';
import { resolveServiceAuthorization } from '../src/acl/service-authorization';
import {
  getVirtualPopulateRow,
  loadVirtualPopulateOutputRows,
  readVirtualPopulateInputs,
} from '../src/acl/virtual-populate-execution';
import { finalizeModelOutput } from '../src/output/finalize-model-output';
import type { FinalizeSnapshot } from '../src/output/finalize-model-output';
import type { ModelRequest } from '../src/interfaces';
import { useMongoTestDatabase } from './setup';

useMongoTestDatabase();
let serial = 0;

describe('DPV-04 explicit package traversal ownership', () => {
  it.each([false, true])('retains each related target token before cloning (custom traversal=%s)', async (custom) => {
    const api = createAccessRuntime();
    const n = ++serial;
    const Account = mongoose.model(`DpvTraversalAccount${n}`, new mongoose.Schema({ balance: Number }));
    const Target = mongoose.model(
      `DpvTraversalTarget${n}`,
      new mongoose.Schema({ account: { type: mongoose.Schema.Types.ObjectId, ref: Account.modelName } }),
    );
    const Parent = mongoose.model(
      `DpvTraversalParent${n}`,
      new mongoose.Schema({ targets: [{ type: mongoose.Schema.Types.ObjectId, ref: Target.modelName }] }),
    );
    api.setGlobalOptions({ requestComplexity: { maxHookConcurrency: 1, maxBulkConcurrency: 1 } } as never);
    api.createRouter(Account, { operationAccess: { read: true }, permissionSchema: { balance: false } } as never);
    api.createRouter(Target, {
      operationAccess: { read: true },
      permissionSchema: { value: true },
      virtuals: {
        value: {
          get: (_doc, _permissions, _context, inputs) => (inputs as any).account.balance,
          dependsOnPopulate: [{ path: 'account', select: 'balance -_id' }],
        },
      },
    } as never);
    api.createRouter(Parent, { operationAccess: { read: true }, permissionSchema: { targets: true } } as never);
    const accounts = await Account.create([{ balance: 10 }, { balance: 20 }]);
    const raw = await Target.create(accounts.map((account) => ({ account: account._id })));
    const req = {} as ModelRequest;
    const access = {
      operation: 'read',
      rowAccess: 'read',
      virtualAccess: 'read',
      outputAccess: 'read',
      docPermissionsAccess: 'read',
    };
    const permissions = new Permission({});
    const plan = (model: typeof Parent | typeof Target, parent?: ReturnType<typeof resolveServiceAuthorization>) => {
      const binding = { request: req, runtime: api.runtime, model, modelName: model.modelName };
      const configuration = captureModelAuthorizationConfiguration(api.runtime, model.modelName);
      const authorization = resolveServiceAuthorization({
        binding,
        configuration,
        access,
        requestPermissions: permissions,
        parent,
      });
      return planAuthorizedModelProjection({ binding, authorization });
    };
    const parentPlan = plan(Parent);
    const targetPlan = plan(Target, parentPlan.authorization);
    const targetSnapshot = captureModelAuthorizationConfiguration(api.runtime, Target.modelName) as FinalizeSnapshot;
    const targets = await loadVirtualPopulateOutputRows(
      { request: req, runtime: api.runtime, family: {}, permissions, hydration: 'hydrated' },
      raw,
      targetPlan,
    );
    const related = {
      path: 'targets',
      plan: targetPlan,
      snapshot: targetSnapshot,
      virtualAccess: 'read',
      outputAccess: 'read',
      docPermissionsAccess: 'read',
    };
    const output = await finalizeModelOutput({
      input: { targets },
      receivingModelName: Parent.modelName,
      request: req,
      ...access,
      plan: parentPlan,
      snapshot: captureModelAuthorizationConfiguration(api.runtime, Parent.modelName) as FinalizeSnapshot,
      related: [related],
      ...(custom
        ? {
            traversal: {
              finalizeRelatedValue: ({ rawValue, parentArgs, target }) =>
                finalizeModelOutput({
                  ...parentArgs,
                  input: rawValue,
                  receivingModelName: Target.modelName,
                  plan: target.plan,
                  snapshot: target.snapshot,
                  related: [],
                  traversal: undefined,
                  scopePath: [],
                  docPermissions: undefined,
                }),
            },
          }
        : {}),
    });
    expect((output.targets as any[]).map((target) => target.value)).toEqual([10, 20]);
    expect((output.targets as any[]).every((target) => !Object.hasOwn(target, 'account'))).toBe(true);
    api.runtime.clearOpenApiRoutes();
  });

  it('reuses only covered raw work in one capture/family/mode, and does not cache a failure', async () => {
    const api = createAccessRuntime();
    const n = ++serial;
    const Account = mongoose.model(
      `DpvTraversalCacheAccount${n}`,
      new mongoose.Schema({ balance: Number, credit: Number }),
    );
    const Target = mongoose.model(
      `DpvTraversalCacheTarget${n}`,
      new mongoose.Schema({ account: { type: mongoose.Schema.Types.ObjectId, ref: Account.modelName } }),
    );
    api.createRouter(Account, { operationAccess: { read: true } } as never);
    api.createRouter(Target, {
      permissionSchema: { value: true, credit: true },
      virtuals: Object.fromEntries(
        ['value', 'credit'].map((name) => [
          name,
          {
            get: () => true,
            dependsOnPopulate: [{ path: 'account', select: `${name === 'value' ? 'balance' : 'credit'} -_id` }],
          },
        ]),
      ),
    } as never);
    const accounts = await Account.create([
      { balance: 10, credit: 1 },
      { balance: 20, credit: 2 },
    ]);
    const raw = await Target.create(accounts.map((account) => ({ account: account._id })));
    const request = {} as ModelRequest;
    const permissions = new Permission({});
    const binding = { request, runtime: api.runtime, model: Target, modelName: Target.modelName };
    const capture = () =>
      resolveServiceAuthorization({
        binding,
        configuration: captureModelAuthorizationConfiguration(api.runtime, Target.modelName),
        access: { operation: 'read', virtualAccess: 'read', outputAccess: 'read', docPermissionsAccess: 'read' },
        requestPermissions: permissions,
      });
    const authorization = capture();
    const plan = (select: string[], auth = authorization) =>
      planAuthorizedModelProjection({ binding, authorization: auth, requestedSelect: select });
    const owner = { request, runtime: api.runtime, family: {}, permissions, hydration: 'hydrated' as const };
    const find = vi.spyOn(Account.collection, 'find');
    const value = plan(['value']);
    const credit = plan(['credit']);
    const both = plan(['value', 'credit']);
    await Promise.all([
      loadVirtualPopulateOutputRows(owner, [raw[0]], value),
      loadVirtualPopulateOutputRows(owner, [raw[0]], value),
    ]);
    expect(find).toHaveBeenCalledTimes(1);
    await loadVirtualPopulateOutputRows(owner, [raw[0]], credit);
    expect(find).toHaveBeenCalledTimes(2);
    await loadVirtualPopulateOutputRows(owner, [raw[0]], both);
    expect(find).toHaveBeenCalledTimes(3);
    await loadVirtualPopulateOutputRows(owner, raw, both);
    expect(find).toHaveBeenCalledTimes(4);
    const [covered] = await loadVirtualPopulateOutputRows(owner, [raw[1]], both);
    expect(find).toHaveBeenCalledTimes(4);
    expect(readVirtualPopulateInputs(getVirtualPopulateRow(covered)!, [], 'value')).toEqual({
      available: true,
      populated: { account: { balance: 20 } },
    });
    await loadVirtualPopulateOutputRows({ ...owner, hydration: 'lean' }, [raw[0]], value);
    expect(find).toHaveBeenCalledTimes(5);
    await loadVirtualPopulateOutputRows({ ...owner, family: {} }, [raw[0]], value);
    expect(find).toHaveBeenCalledTimes(6);
    await loadVirtualPopulateOutputRows(owner, [raw[0]], plan(['value'], capture()));
    expect(find).toHaveBeenCalledTimes(7);
    const failingOwner = { ...owner, family: {} };
    find.mockImplementationOnce(() => {
      throw new Error('private failure');
    });
    const [failed] = await loadVirtualPopulateOutputRows(failingOwner, [raw[0]], value);
    expect(readVirtualPopulateInputs(getVirtualPopulateRow(failed)!, [], 'value')).toEqual({ available: false });
    const [nextCall] = await loadVirtualPopulateOutputRows(failingOwner, [raw[0]], value);
    expect(find).toHaveBeenCalledTimes(9);
    expect(readVirtualPopulateInputs(getVirtualPopulateRow(nextCall)!, [], 'value')).toMatchObject({
      available: true,
      populated: { account: { balance: 10 } },
    });
    api.runtime.clearOpenApiRoutes();
  });
});
