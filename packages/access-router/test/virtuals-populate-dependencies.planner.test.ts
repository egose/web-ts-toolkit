import mongoose from 'mongoose';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { AccessRuntime } from '../src/runtime';
import Permission from '../src/permission';
import { captureModelAuthorizationConfiguration } from '../src/acl/model-output-planning';
import { planAuthorizedModelProjection } from '../src/acl/output-projection';
import { resolveServiceAuthorization } from '../src/acl/service-authorization';
import { planVirtualProjection } from '../src/acl/virtual-projection';
import type { ModelRequest, Projection } from '../src/interfaces';

let serial = 0;
afterEach(() => mongoose.deleteModel(/^DpvPlanner/));

function fixture(select?: Projection, rule: unknown = true) {
  const runtime = new AccessRuntime();
  const target = mongoose.model(
    `DpvPlannerTarget${++serial}`,
    new mongoose.Schema({ name: String, balance: Number, profile: { city: String, secret: String } }),
  );
  const child = new mongoose.Schema({ account: { type: mongoose.Schema.Types.ObjectId, ref: target.modelName } });
  const source = mongoose.model(
    `DpvPlannerSource${serial}`,
    new mongoose.Schema({ label: String, account: child.path('account').options, children: [child] }),
  );
  runtime.registerModelInstance(target.modelName, target);
  runtime.setModelOptions(target.modelName, { operationAccess: { read: true }, permissionSchema: { name: true } });
  runtime.registerModelInstance(source.modelName, source);
  const get = vi.fn(() => true);
  const dependency = { get, dependsOnPopulate: [{ path: 'account', select }] };
  runtime.setModelOptions(source.modelName, {
    modelPermissionPrefix: 'doc:',
    virtuals: { eligible: dependency, children: { sub: { eligible: dependency } } },
    permissionSchema: {
      label: true,
      account: false,
      eligible: rule,
      children: { read: true, sub: { eligible: rule } },
    },
  } as never);
  const configuration = captureModelAuthorizationConfiguration(runtime, source.modelName);
  const binding = { request: {} as ModelRequest, runtime, model: source, modelName: source.modelName };
  const access = { operation: 'read', virtualAccess: 'read', outputAccess: 'read', docPermissionsAccess: 'read' };
  const permissions = new Permission({});
  const authorization = resolveServiceAuthorization({
    binding,
    configuration,
    access,
    requestPermissions: permissions,
  });
  const plan = (requestedSelect?: Projection) =>
    planAuthorizedModelProjection({ binding, authorization, requestedSelect });
  return { runtime, target, source, configuration, binding, access, permissions, get, plan };
}

describe('DPV-02 private populated fetch planning', () => {
  it('automatically retains a denied source ref without granting output or local dependency eligibility', () => {
    const f = fixture('balance');
    const plan = f.plan('eligible -_id');
    expect(plan.persistedFetchSelection).toEqual(expect.arrayContaining(['account', '_id']));
    expect(plan.outputSelection).toEqual(['eligible', '-_id']);
    expect(plan.outputPersistedFields).toEqual([]);
    expect(plan.candidates[0].dependsOn).toEqual([]);
    expect(plan.publicPersistedFetchSelection).toEqual(['_id']);
    expect(plan.internalOnlyFields).toContain('account');
    expect(plan.candidates[0].populateDependencies[0].selection).toEqual(['_id', 'balance']);
    expect(f.get).not.toHaveBeenCalled();
  });

  it.each([
    [undefined, ['_id', 'balance', 'name', 'profile.city', 'profile.secret']],
    ['', ['_id', 'balance', 'name', 'profile.city', 'profile.secret']],
    [[], ['_id', 'balance', 'name', 'profile.city', 'profile.secret']],
    [{}, ['_id', 'balance', 'name', 'profile.city', 'profile.secret']],
    ['balance -_id', ['balance']],
    [{ balance: 1, _id: -1 }, ['balance']],
    ['-profile.secret -name', ['_id', 'balance', 'profile.city']],
    ['profile -profile.secret', ['_id', 'profile.city']],
    ['_id -_id', []],
  ] as [Projection | undefined, string[]][])('resolves %j before positive target union', (select, expected) => {
    const f = fixture(select);
    const plan = f.plan(['label', 'eligible']);
    const dependency = plan.candidates[0].populateDependencies[0];
    expect(dependency.selection).toEqual(expected);
    expect(dependency.fetchSelection).toEqual([...new Set(['_id', ...expected])].sort());
    expect(dependency.fetchSelection.every((path) => !path.startsWith('-'))).toBe(true);
    expect(plan.outputSelection).toEqual(['label', 'eligible']);
    expect(plan.publicPersistedFetchSelection).toEqual(['label', '_id']);
  });

  it.each([false, 'missing-global'])('known denial %s and exclusion add no private requirements', (rule) => {
    const f = fixture('balance', rule);
    for (const plan of [f.plan('eligible'), f.plan('-eligible -children')]) {
      expect(plan.candidates).toEqual([]);
      expect(plan.persistedFetchSelection).not.toContain('account');
    }
  });

  it('retains deferred candidates and batches embedded requirements without source output eligibility', () => {
    const f = fixture('profile.city', () => true);
    const plan = f.plan(['children.eligible']);
    expect(plan.persistedFetchSelection).toContain('children.account');
    expect(plan.publicPersistedFetchSelection).not.toContain('children.account');
    const child = plan.childPlans.children;
    expect(child.candidates[0].authState).toBe('deferred');
    expect(child.candidates[0].populateDependencies[0].sourcePath).toBe('children.account');
    expect(child.outputPersistedFields).toEqual([]);
    expect(plan.persistedFetchSelection).not.toContain('children');
  });

  it('legacy planning uses the same captured declarations, applicability and source-input mask', () => {
    const f = fixture('balance');
    const legacy = planVirtualProjection({
      receivingModelName: f.source.modelName,
      snapshot: { ...f.configuration, catalog: undefined },
      ...f.access,
      requestedSelect: 'eligible',
      globalPermissions: f.permissions,
    });
    expect(legacy.persistedFetchSelection).toEqual(['_id', 'account']);
    expect(legacy.publicPersistedFetchSelection).toEqual(['_id']);
    expect(legacy.candidates[0].populateDependencies[0].selection).toEqual(['_id', 'balance']);
    expect(legacy.outputPersistedFields).toEqual([]);
    f.runtime.setModelOption(f.source.modelName, 'virtuals.eligible', { update: () => true });
    const next = captureModelAuthorizationConfiguration(f.runtime, f.source.modelName);
    expect(
      planVirtualProjection({
        receivingModelName: f.source.modelName,
        snapshot: { ...next, catalog: undefined },
        ...f.access,
        requestedSelect: 'eligible',
      }).candidates,
    ).toEqual([]);
  });
});
