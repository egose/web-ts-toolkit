import mongoose from 'mongoose';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { Core } from '../src/core';
import Permission from '../src/permission';
import { AccessRuntime } from '../src/runtime';
import { runWithRuntime } from '../src/runtime-context';
import { Service } from '../src/services/service';
import { PERMISSIONS } from '../src/symbols';
import type { AuthorizationMode, ModelRequest, ModelRouterOptions } from '../src/interfaces';
import { captureModelAuthorizationConfiguration } from '../src/acl/model-output-planning';
import { createServiceExecution, deriveServiceExecution, readServiceExecution } from '../src/acl/service-execution';
import { createRelatedExecution } from '../src/acl/related-execution';
import {
  getAuthorizationPermissions,
  readServiceAuthorizationMode,
  ServiceAuthorizationError,
} from '../src/acl/service-authorization';
import type { AuthorizationBinding, ResolvedServiceAuthorization } from '../src/acl/service-authorization';
import {
  closeDocumentStage,
  prepareQueryDocumentStage,
  prepareEmbeddedDocumentStage,
  readDocumentStage,
  resolveDocumentStage,
} from '../src/acl/document-stage';
import { authorizeEmbeddedOutputPlan } from '../src/acl/output-field-filter';
import { planAuthorizedModelProjection } from '../src/acl/output-projection';
import { deferred } from './hook-admission-fixture';

const modes: AuthorizationMode[] = ['isolated', 'trusted'];
const access = (operation: string, effective = operation) => ({
  operation,
  rowAccess: effective,
  outputAccess: effective,
  virtualAccess: effective,
  docPermissionsAccess: effective,
});
type State = { authorization: ResolvedServiceAuthorization; binding: AuthorizationBinding };
const mode = (state: State) => readServiceAuthorizationMode(state.authorization, state.binding);
let serial = 0;

function fixture(sourceOptions: ModelRouterOptions = {}, targetOptions: ModelRouterOptions = {}) {
  const runtime = new AccessRuntime();
  runtime.setGlobalOptions({ logger: { warn: vi.fn() } });
  const models = ['Root', 'Target', 'Second'].map((name) =>
    mongoose.model(
      `QueryModes${name}${++serial}`,
      new mongoose.Schema({ value: String, profile: { value: String, inner: { value: String } } }),
    ),
  );
  for (const [index, model] of models.entries()) {
    runtime.registerModelInstance(model.modelName, model);
    runtime.setModelOptions(model.modelName, {
      permissionSchema: {
        value: true,
        profile: {
          read: true,
          list: true,
          create: true,
          update: true,
          sub: { value: true, inner: { read: true, list: true, create: true, update: true, sub: { value: true } } },
        },
      },
      ...(index === 0
        ? sourceOptions
        : index === 1
          ? targetOptions
          : { readAuthorizationMode: 'isolated', listAuthorizationMode: 'trusted' }),
    });
  }
  const request = { [PERMISSIONS]: new Permission({ reader: true }) } as unknown as ModelRequest;
  const [service, targetService, secondService] = runWithRuntime(runtime, () => {
    request.macl = new Core(request);
    return models.map((model) => new Service(request, model.modelName));
  });
  const capture = (operation = 'read', effective = operation) => {
    const second = {
      path: 'second',
      modelName: models[2].modelName,
      model: models[2],
      configuration: captureModelAuthorizationConfiguration(runtime, models[2].modelName),
    };
    const target = {
      path: 'related',
      modelName: models[1].modelName,
      model: models[1],
      configuration: captureModelAuthorizationConfiguration(runtime, models[1].modelName),
      relatedTargets: [second],
    };
    const execution = createServiceExecution(service, access(operation, effective), undefined, 'service', [target]);
    return { execution, ...readServiceExecution(service, execution) };
  };
  const related = (parent: State, operation = 'read', second = false) => {
    const receiver = second ? secondService : targetService;
    const execution = createRelatedExecution(
      receiver,
      access(operation),
      parent.authorization,
      parent.binding,
      second ? 'second' : 'related',
    );
    return { execution, ...readServiceExecution(receiver, execution) };
  };
  return { runtime, models, request, service, targetService, capture, related };
}

function embedded(parent: State, segment = 'profile'): State {
  const plan = planAuthorizedModelProjection({ authorization: parent.authorization, binding: parent.binding });
  expect(plan.childPlans[segment]).toBeDefined();
  const child = authorizeEmbeddedOutputPlan(plan, plan.childPlans[segment]);
  return { authorization: child.authorization!, binding: child.authorizationBinding! };
}

async function observeSource(state: State, expected: AuthorizationMode) {
  const source = { value: 'source', date: new Date(1) };
  const prepared = prepareQueryDocumentStage(state.authorization, state.binding, source);
  const raw = { owner: true };
  let actor: unknown;
  await resolveDocumentStage(prepared.stage, function (doc, permissions) {
    expect(this).toBe(state.binding.request);
    actor = permissions;
    (doc.date as Date).setTime(2);
    return raw;
  });
  expect(source.date.getTime()).toBe(expected === 'trusted' ? 2 : 1);
  expect(prepared.borrowed).toBe(expected === 'trusted');
  raw.owner = false;
  expect(readDocumentStage(prepared.stage, state.binding).grants).toEqual({ owner: true });
  expect(actor).toBe(getAuthorizationPermissions(state.authorization, state.binding));
  closeDocumentStage(prepared.stage);
}

afterEach(() => {
  vi.restoreAllMocks();
  mongoose.deleteModel(/^QueryModes/);
});

describe('source-only modes: own target capture replaces origin-wide nested flags', () => {
  it.each(
    modes.flatMap((read) =>
      modes.flatMap((list) =>
        modes.flatMap((targetRead) => modes.map((targetList) => ({ read, list, targetRead, targetList }))),
      ),
    ),
  )(
    'uses source read=$read/list=$list and target read=$targetRead/list=$targetList through every edge',
    async ({ read, list, targetRead, targetList }) => {
      const f = fixture(
        { readAuthorizationMode: read, listAuthorizationMode: list },
        { readAuthorizationMode: targetRead, listAuthorizationMode: targetList },
      );
      const rootRead = f.capture('read');
      const rootList = f.capture('list');
      const retry = readServiceExecution(
        f.service,
        deriveServiceExecution(f.service, rootRead.execution, access('read', 'list')),
      );
      for (const [root, expected] of [
        [rootRead, read],
        [rootList, list],
        [retry, read],
      ] as const) {
        expect(mode(root)).toBe(expected);
        await observeSource(root, expected);
        await observeSource(embedded(root), expected);
        await observeSource(embedded(embedded(root), 'inner'), expected);
        for (const effective of ['read', 'list'] as const) {
          const target = f.related(root, effective);
          const selected = effective === 'read' ? targetRead : targetList;
          expect(mode(target)).toBe(selected);
          await observeSource(target, selected);
          await observeSource(embedded(target), selected);
          const second = f.related(target, 'read', true);
          expect(mode(second)).toBe('isolated');
          await observeSource(second, 'isolated');
          if (effective === 'read') {
            const targetRetry = readServiceExecution(
              f.targetService,
              deriveServiceExecution(f.targetService, target.execution, access('read', 'list')),
            );
            expect(mode(targetRetry)).toBe(targetRead);
            await observeSource(targetRetry, targetRead);
          }
        }
      }
    },
  );

  it.each(['create', 'update', 'upsert', 'new', 'subRead', 'subList'])(
    '%s descendants remain isolated even under trusted target/model configuration',
    async (operation) => {
      const f = fixture(
        { readAuthorizationMode: 'trusted', listAuthorizationMode: 'trusted' },
        { readAuthorizationMode: 'trusted', listAuthorizationMode: 'trusted' },
      );
      const root = f.capture(operation, 'read');
      const derived = readServiceExecution(
        f.service,
        deriveServiceExecution(f.service, root.execution, access('read')),
      );
      for (const state of [root, derived, embedded(root), f.related(root)]) {
        expect(mode(state)).toBe('isolated');
        await observeSource(state, 'isolated');
      }
    },
  );

  it('shares facts only with a genuine owning embedded stage, never a target or equal-ID row', async () => {
    const f = fixture({ readAuthorizationMode: 'trusted' });
    const root = f.capture();
    const source = { _id: 'same', profile: { value: 'child' } };
    const parent = prepareQueryDocumentStage(root.authorization, root.binding, source);
    await resolveDocumentStage(parent.stage, () => ({ owner: true }));
    const child = embedded(root);
    const prepared = prepareEmbeddedDocumentStage(child.authorization, child.binding, parent.source.profile, {
      stage: parent.stage,
      binding: root.binding,
    });
    const facts = readDocumentStage(parent.stage, root.binding).grants;
    await resolveDocumentStage(prepared.stage, () => facts, false);
    expect(readDocumentStage(prepared.stage, child.binding).grants).toBe(facts);
    const target = f.related(root);
    const other = prepareQueryDocumentStage(target.authorization, target.binding, { _id: 'same', value: 'target' });
    await resolveDocumentStage(other.stage, () => ({ owner: false }));
    expect(readDocumentStage(other.stage, target.binding).grants).not.toBe(facts);
    expect(getAuthorizationPermissions(target.authorization, target.binding)).toBe(
      getAuthorizationPermissions(root.authorization, root.binding),
    );
    expect(() =>
      prepareEmbeddedDocumentStage(
        target.authorization,
        target.binding,
        {},
        { stage: parent.stage, binding: root.binding },
      ),
    ).toThrow(ServiceAuthorizationError);
    for (const stage of [prepared.stage, other.stage, parent.stage]) closeDocumentStage(stage);
  });

  it.each(['read', 'list'] as const)(
    'keeps captured %s source/target modes across await and rollback while independent calls refresh',
    async (origin) => {
      const f = fixture({ readAuthorizationMode: 'trusted', listAuthorizationMode: 'trusted' });
      const root = f.capture(origin);
      const entered = deferred();
      const release = deferred();
      const parent = prepareQueryDocumentStage(root.authorization, root.binding, { value: 'source' });
      const pending = resolveDocumentStage(parent.stage, async () => {
        entered.resolve();
        await release.promise;
        return { owner: true };
      });
      await entered.promise;
      try {
        f.runtime.setModelOptions(f.models[0].modelName, {
          readAuthorizationMode: 'isolated',
          listAuthorizationMode: 'isolated',
        });
        f.runtime.setModelOptions(f.models[1].modelName, {
          readAuthorizationMode: 'trusted',
          listAuthorizationMode: 'trusted',
        });
      } finally {
        release.resolve();
      }
      await pending;
      expect(mode(embedded(root))).toBe('trusted');
      expect(mode(f.related(root))).toBe('isolated');
      const fresh = f.capture(origin);
      expect(mode(fresh)).toBe('isolated');
      expect(mode(f.related(fresh))).toBe('trusted');
      if (origin === 'read') {
        const retry = readServiceExecution(
          f.service,
          deriveServiceExecution(f.service, root.execution, access('read', 'list')),
        );
        expect(mode(retry)).toBe('trusted');
        const retryStage = prepareQueryDocumentStage(retry.authorization, retry.binding, { value: 'retry' });
        await resolveDocumentStage(retryStage.stage, () => ({ owner: false }));
        expect(readDocumentStage(retryStage.stage, retry.binding)).toMatchObject({
          operation: 'read',
          outputAccess: 'list',
          grants: { owner: false },
        });
        expect(readDocumentStage(parent.stage, root.binding).grants).toEqual({ owner: true });
        closeDocumentStage(retryStage.stage);
      }
      closeDocumentStage(parent.stage);
    },
  );

  it('rejects a foreign receiving target even when it has the same mode, model name or request actor', () => {
    const f = fixture({ readAuthorizationMode: 'trusted' });
    const other = fixture({ readAuthorizationMode: 'trusted' });
    const root = f.capture();
    expect(() =>
      createRelatedExecution(other.service, access('read'), root.authorization, root.binding, 'related'),
    ).toThrow(ServiceAuthorizationError);
    expect(() =>
      createRelatedExecution(
        f.targetService,
        access('read'),
        root.authorization,
        { ...root.binding, runtime: {} },
        'related',
      ),
    ).toThrow(ServiceAuthorizationError);
  });
});
