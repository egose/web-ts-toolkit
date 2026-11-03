import { afterEach, describe, expect, it, vi } from 'vitest';
import * as projection from '../src/acl/output-projection';
import * as stages from '../src/acl/document-stage';
import { EMPTY_DOCUMENT_GRANTS } from '../src/acl/document-grants';
import { ServiceAuthorizationError } from '../src/acl/authorization-snapshot';
import { evaluateAuthorizedOutputField } from '../src/acl/output-field-filter';
import { closeOutputPublication, outputPublicationFor, runOutputPublication } from '../src/acl/output-publication';
import * as publications from '../src/acl/output-publication';
import { visitTrustedOutput } from '../src/acl/trusted-output-materialization';
import type { TrustedOutputBudget } from '../src/acl/trusted-output-materialization';
import { deriveQueryAuthorization, readServiceAuthorization } from '../src/acl/service-authorization';
import { prepareExistingOutputShape, selectCatalogOutputShape } from '../src/acl/output-selection';
import { captureOutputHelperConfiguration } from '../src/acl/model-output-planning';
import { ownedStageFixture, sourceModes, stageAccess } from './owned-stage-test-fixture';

afterEach(() => vi.restoreAllMocks());

describe('existing-value helper consumer of the owned stage engine', () => {
  it('does not expand a query projection or invoke a general document resolver', async () => {
    const f = ownedStageFixture();
    const plan = vi.spyOn(projection, 'planAuthorizedModelProjection');
    const resolve = vi.spyOn(stages, 'resolveDocumentStage');
    expect(await f.direct.pickAllowedFields({ value: 'visible' }, 'read')).toEqual({ value: 'visible' });
    expect(plan).not.toHaveBeenCalled();
    expect(resolve).not.toHaveBeenCalled();
    expect(f.adapter.findOne).not.toHaveBeenCalled();
  });

  it('progresses synchronously up to the first real async field, without seeding future decisions', async () => {
    const order: string[] = [];
    let release!: () => void;
    const waiting = new Promise<void>((done) => {
      release = done;
    });
    const f = ownedStageFixture({
      modelOptions: {
        permissionSchema: {
          name: () => {
            order.push('name');
            return true;
          },
          first: async () => {
            order.push('first');
            await waiting;
            return true;
          },
          second: () => {
            order.push('second');
            return false;
          },
        },
      },
    });
    const result = f.direct.pickAllowedFields({ second: 'denied', first: 'one', name: 'name' }, 'read');
    const beforeResume = [...order];
    release();
    expect(await result).toEqual({ name: 'name', first: 'one' });
    expect(beforeResume).toEqual(['name', 'first']);
    expect(order).toEqual(['name', 'first', 'second']);
  });

  it.each(sourceModes)('%s admits immutable EMPTY synchronously only for a captured helper origin', async (mode) => {
    const f = ownedStageFixture({ mode });
    const call = f.ownCall({ applicability: 'output', readResponse: false, listResponse: false });
    const stage = stages.createDocumentStage(call, f.binding, { value: 'visible' });
    stages.resolveEmptyOutputHelperStage(stage, f.binding);
    const facts = stages.readDocumentStage(stage, f.binding).grants;
    expect(facts).toBe(EMPTY_DOCUMENT_GRANTS);
    expect(Object.isFrozen(facts)).toBe(true);
    stages.resolveEmptyOutputHelperStage(stage, f.binding);
    const hook = vi.fn(() => ({ forged: true }));
    const first = stages.resolveDocumentStage(stage, hook);
    expect(stages.resolveDocumentStage(stage, hook)).toBe(first);
    expect(await first).toBe(facts);
    expect(hook).not.toHaveBeenCalled();
    stages.closeDocumentStage(stage);
    expect(() => stages.resolveEmptyOutputHelperStage(stage, f.binding)).toThrow(ServiceAuthorizationError);
  });

  it('rejects ordinary, foreign, closed and resolving stages without replacing facts or pending work', async () => {
    const f = ownedStageFixture();
    const ordinary = stages.createDocumentStage(f.call, f.binding, {});
    expect(() => stages.resolveEmptyOutputHelperStage(ordinary, f.binding)).toThrow(ServiceAuthorizationError);
    const call = f.ownCall({ applicability: 'output' });
    const stage = stages.createDocumentStage(call, f.binding, {});
    expect(() =>
      stages.resolveEmptyOutputHelperStage(stage, { ...f.binding, request: {} as typeof f.request }),
    ).toThrow(ServiceAuthorizationError);
    expect(() => stages.resolveEmptyOutputHelperStage({} as stages.DocumentStage, f.binding)).toThrow(
      ServiceAuthorizationError,
    );
    let release!: (facts: Readonly<Record<string, boolean>>) => void;
    const pending = stages.resolveDocumentStage(
      stage,
      () =>
        new Promise((done) => {
          release = done;
        }),
      false,
    );
    expect(() => stages.resolveEmptyOutputHelperStage(stage, f.binding)).toThrow(ServiceAuthorizationError);
    release({ actual: true });
    expect(await pending).toEqual({ actual: true });
    expect(stages.readDocumentStage(stage, f.binding).grants).not.toBe(EMPTY_DOCUMENT_GRANTS);
  });

  it.each(['request', 'runtime', 'model', 'modelName', 'scopePath'] as const)(
    'EMPTY rejects a foreign %s binding before admission',
    (key) => {
      const f = ownedStageFixture();
      const call = f.ownCall({ applicability: 'output' });
      const stage = stages.createDocumentStage(call, f.binding, {});
      const foreign = { ...f.binding, [key]: key === 'scopePath' ? ['branch'] : key === 'modelName' ? 'Other' : {} };
      expect(() => stages.resolveEmptyOutputHelperStage(stage, foreign)).toThrow(ServiceAuthorizationError);
      stages.resolveEmptyOutputHelperStage(stage, f.binding);
      expect(stages.readDocumentStage(stage, f.binding).grants).toBe(EMPTY_DOCUMENT_GRANTS);
    },
  );

  it('rejects supplied facts/resolvers and cannot replace an ordinary completed helper hook', async () => {
    const f = ownedStageFixture();
    const call = f.ownCall({ applicability: 'output' });
    const stage = stages.createDocumentStage(call, f.binding, {});
    // @ts-expect-error The private fixed resolver accepts neither a supplied fact map nor a callback.
    expect(() => stages.resolveEmptyOutputHelperStage(stage, f.binding, { forged: true })).toThrow(
      ServiceAuthorizationError,
    );
    await stages.resolveDocumentStage(stage, () => ({ owner: true }), false);
    expect(() => stages.resolveEmptyOutputHelperStage(stage, f.binding)).toThrow(ServiceAuthorizationError);
    expect(stages.readDocumentStage(stage, f.binding).grants.owner).toBe(true);
  });

  it('new fact-origin and EMPTY slots are own data despite inherited setters', () => {
    const f = ownedStageFixture();
    const setter = vi.fn();
    const keys = ['factOrigin', 'emptyHelperFacts'];
    const previous = keys.map((key) => Object.getOwnPropertyDescriptor(Object.prototype, key));
    try {
      for (const key of keys) Object.defineProperty(Object.prototype, key, { configurable: true, set: setter });
      const call = f.ownCall({ applicability: 'output' });
      const stage = stages.createDocumentStage(call, f.binding, {});
      stages.resolveEmptyOutputHelperStage(stage, f.binding);
      expect(stages.readDocumentStage(stage, f.binding).grants).toBe(EMPTY_DOCUMENT_GRANTS);
      expect(setter).not.toHaveBeenCalled();
    } finally {
      keys.forEach((key, index) => {
        if (previous[index]) Object.defineProperty(Object.prototype, key, previous[index]!);
        else Reflect.deleteProperty(Object.prototype, key);
      });
    }
  });

  it('inherits helper EMPTY only across an authenticated embedded edge, never a retry/target claim', () => {
    const f = ownedStageFixture();
    const call = f.ownCall({ applicability: 'output', access: { ...stageAccess(), rowAccess: undefined } });
    const view = readServiceAuthorization(call, f.binding);
    const binding = { ...f.binding, scopePath: ['branch'] };
    const embedded = deriveQueryAuthorization({
      ...f.input,
      ...view,
      binding,
      parent: call,
      snapshotDerivation: { kind: 'embedded', parentBinding: f.binding },
    })!;
    const root = stages.createDocumentStage(call, f.binding, { branch: { value: 1 } });
    stages.resolveEmptyOutputHelperStage(root, f.binding);
    const child = stages.prepareEmbeddedDocumentStage(
      embedded,
      binding,
      stages.documentStageSource(root, f.binding).branch,
      { stage: root, binding: f.binding },
    ).stage;
    stages.resolveEmptyOutputHelperStage(child, binding);
    expect(stages.readDocumentStage(child, binding).grants).toBe(EMPTY_DOCUMENT_GRANTS);
    expect(
      deriveQueryAuthorization({
        ...f.input,
        parent: call,
        snapshotDerivation: { kind: 'retry', parentBinding: f.binding },
      }),
    ).toBeUndefined();
    const ordinary = f.ownCall({ parent: call });
    expect(() =>
      stages.resolveEmptyOutputHelperStage(stages.createDocumentStage(ordinary, f.binding, {}), f.binding),
    ).toThrow(ServiceAuthorizationError);
  });

  it('targets and READ retries cannot manufacture helper origin through resolver applicability', () => {
    const f = ownedStageFixture();
    const target = ownedStageFixture();
    const parent = f.ownCall({
      applicability: 'output',
      relatedTargets: [
        { path: 'ref', model: target.model, modelName: target.model.modelName, configuration: target.configuration },
      ],
    });
    const binding = { ...f.binding, model: target.model, modelName: target.model.modelName };
    const call = deriveQueryAuthorization({
      ...f.input,
      applicability: 'output',
      binding,
      parent,
      snapshotDerivation: { kind: 'related', path: 'ref', parentBinding: f.binding },
    })!;
    expect(() => stages.resolveEmptyOutputHelperStage(stages.createDocumentStage(call, binding, {}), binding)).toThrow(
      ServiceAuthorizationError,
    );
    const retry = deriveQueryAuthorization({
      ...f.input,
      applicability: 'output',
      parent: f.call,
      access: stageAccess('read', 'list'),
      snapshotDerivation: { kind: 'retry', parentBinding: f.binding },
    })!;
    expect(() =>
      stages.resolveEmptyOutputHelperStage(stages.createDocumentStage(retry, f.binding, {}), f.binding),
    ).toThrow(ServiceAuthorizationError);
  });

  it('shares actual pending field decisions and rejects late resume after owner poison', async () => {
    let release!: () => void;
    const waiting = new Promise<void>((done) => {
      release = done;
    });
    const predicate = vi.fn(async () => {
      await waiting;
      return true;
    });
    const f = ownedStageFixture({ modelOptions: { permissionSchema: { value: predicate } } });
    const call = f.ownCall({ applicability: 'output' });
    const stage = stages.createDocumentStage(call, f.binding, { value: 'visible' });
    stages.resolveEmptyOutputHelperStage(stage, f.binding);
    const first = evaluateAuthorizedOutputField(stage, f.binding, 'value');
    expect(evaluateAuthorizedOutputField(stage, f.binding, 'value')).toBe(first);
    const close = closeOutputPublication(outputPublicationFor(call));
    release();
    await expect(first).rejects.toBeInstanceOf(ServiceAuthorizationError);
    await expect(close).rejects.toBeInstanceOf(ServiceAuthorizationError);
    expect(predicate).toHaveBeenCalledTimes(1);
    expect(() => stages.readDocumentStage(stage, f.binding)).toThrow(ServiceAuthorizationError);
  });

  it('a caught invalid EMPTY-stage resolution still poisons the publication', async () => {
    const f = ownedStageFixture();
    const call = f.ownCall({ applicability: 'output' });
    await expect(
      runOutputPublication(outputPublicationFor(call), async () => {
        const stage = stages.createDocumentStage(call, f.binding, {});
        await stages.resolveDocumentStage(stage, () => ({ invalid: 1 }) as never, false).catch(() => {});
        return 'must not publish';
      }),
    ).rejects.toBeInstanceOf(ServiceAuthorizationError);
  });

  it.each(sourceModes)('%s still admits the full isolated source and actual genAllowedFields values', async (mode) => {
    const f = ownedStageFixture({ mode });
    const getter = vi.fn();
    const proxy = new Proxy({}, { ownKeys: getter });
    for (const value of [proxy, Object.defineProperty({}, 'secret', { enumerable: true, get: getter })]) {
      await expect(f.direct.genAllowedFields({ value }, 'read', { purpose: 'output' })).rejects.toBeInstanceOf(
        ServiceAuthorizationError,
      );
    }
    expect(getter).not.toHaveBeenCalled();
    const hydrated = new f.model({ value: { safe: 'original' } });
    const result = await f.direct.pickAllowedFields(hydrated, 'read');
    expect(result).toMatchObject({ value: { safe: 'original' } });
    expect(hydrated.get('value')).toEqual({ safe: 'original' });
  });

  it('retains stored active virtual values without executing their getter or restoring dependencies', async () => {
    const get = vi.fn(() => 'computed');
    const f = ownedStageFixture({
      modelOptions: {
        alwaysSelectFields: ['hidden'],
        permissionSchema: { label: true, inactive: true },
        virtuals: { label: { get, dependsOn: ['hidden'] }, inactive: { list: { get } } },
      },
    });
    expect(await f.direct.pickAllowedFields({ label: 'stored', inactive: 'not active' }, 'read')).toEqual({
      label: 'stored',
    });
    expect(await f.direct.genAllowedFields({ label: 'stored' }, 'read', { purpose: 'output' })).toEqual(['label']);
    expect(get).not.toHaveBeenCalled();
    expect(f.adapter.findOne).not.toHaveBeenCalled();
    expect(f.adapter.find).not.toHaveBeenCalled();
  });

  it.each(sourceModes)(
    '%s keeps inclusive source/selected slot and depth limits for actual helper values',
    async (mode) => {
      const f = ownedStageFixture({ mode });
      const exact = Object.fromEntries(Array.from({ length: 19998 }, (_, index) => [`key${index}`, true]));
      expect(await f.direct.genAllowedFields({ value: exact }, 'read', { purpose: 'output' })).toEqual(['value']);
      await expect(
        f.direct.genAllowedFields({ value: { ...exact, overflow: true } }, 'read', { purpose: 'output' }),
      ).rejects.toBeInstanceOf(ServiceAuthorizationError);
      let deep: Record<string, unknown> = { value: 'leaf' };
      for (let depth = 1; depth < 100; depth++) deep = { value: deep };
      expect(await f.direct.genAllowedFields(deep, 'read', { purpose: 'output' })).toEqual(['value']);
      await expect(f.direct.genAllowedFields({ value: deep }, 'read', { purpose: 'output' })).rejects.toBeInstanceOf(
        ServiceAuthorizationError,
      );
    },
  );

  it.each(['hidden', '_permissions'])(
    'charges a selected but denied/protected %s key against the remaining row budget',
    async (field) => {
      const f = ownedStageFixture();
      const create = publications.createPublicationRowBudget;
      vi.spyOn(publications, 'createPublicationRowBudget').mockImplementation((owner) => {
        const budget = create(owner);
        visitTrustedOutput(budget, 0, 19999);
        return budget;
      });
      await expect(f.direct.pickAllowedFields({ [field]: 'unobserved' }, 'read')).rejects.toBeInstanceOf(
        ServiceAuthorizationError,
      );
    },
  );

  it.each([false, true])(
    'caught selected poison during a %s-async helper predicate drains its admitted work',
    async (asyncField) => {
      let budget!: TrustedOutputBudget;
      let release!: () => void;
      const waiting = new Promise<void>((done) => {
        release = done;
      });
      let settled = false;
      const later = vi.fn(() => true);
      const f = ownedStageFixture({
        modelOptions: {
          permissionSchema: {
            first: () => {
              try {
                visitTrustedOutput(budget, 0, 20001);
              } catch {
                /* poison must survive */
              }
              if (!asyncField) {
                settled = true;
                return true;
              }
              return waiting.then(() => {
                settled = true;
                return true;
              });
            },
            second: later,
          },
        },
      });
      const create = publications.createPublicationRowBudget;
      vi.spyOn(publications, 'createPublicationRowBudget').mockImplementation((owner) => (budget = create(owner)));
      const result = f.direct.pickAllowedFields({ first: 'one', second: 'two' }, 'read');
      let returned = false;
      const completed = result.then(
        () => 'unexpected success',
        () => {
          returned = true;
          return settled;
        },
      );
      await new Promise<void>((done) => setImmediate(done));
      const beforeRelease = returned;
      release();
      await expect(result).rejects.toBeInstanceOf(ServiceAuthorizationError);
      expect(await completed).toBe(true);
      expect(beforeRelease).toBe(!asyncField);
      expect(later).not.toHaveBeenCalled();
    },
  );

  it('shares the exact query selection shape but carries no fetch/dependency/related collections', () => {
    const f = ownedStageFixture({
      modelOptions: {
        permissionSchema: {
          value: true,
          hidden: false,
          children: { read: true, sub: { value: true, display: true } },
          label: true,
        },
        virtuals: {
          label: { get: () => 'virtual', dependsOn: ['hidden'] },
          children: { sub: { display: { get: () => 'child', dependsOn: ['value'] } } },
        },
        alwaysSelectFields: ['ownerId'],
      },
    });
    const source = { value: 'stored', children: [{ value: 'child', display: 'stored child' }], label: 'stored' };
    const call = f.ownCall({
      applicability: 'output',
      configuration: captureOutputHelperConfiguration(f.runtime, f.model.modelName),
    });
    const shape = prepareExistingOutputShape(call, f.binding, source);
    const plan = projection.planAuthorizedModelProjection({
      authorization: call,
      binding: f.binding,
      effectiveSelect: Object.keys(source),
    });
    const sameShape = (selected: typeof shape, query: typeof plan) => {
      for (const key of [
        'outputPersistedFields',
        'outputVirtualNames',
        'effectiveSelectNorm',
        'selectionMode',
        'fieldStates',
        'minimalAncestorPaths',
        'fetchIdRetained',
        'outputIdExcluded',
      ] as const)
        expect(selected[key]).toEqual(query[key]);
      for (const key of [
        'persistedFetchSelection',
        'publicPersistedFetchSelection',
        'depProvenance',
        'candidates',
        'relatedPlans',
        'internalIdentityFields',
        'internalJoinFields',
      ])
        expect(Object.hasOwn(selected, key)).toBe(false);
      for (const key of Object.keys(selected.childPlans)) sameShape(selected.childPlans[key], query.childPlans[key]);
    };
    sameShape(shape, plan);
    expect(plan.persistedFetchSelection).toContain('hidden');
    expect(plan.depProvenance.hidden).toEqual(['label']);
  });

  it('still validates/copies active virtual descriptors during selection, even without fetch expansion', () => {
    const f = ownedStageFixture();
    const args = {
      receivingModelName: f.model.modelName,
      snapshot: {
        catalog: { paths: ['label'], virtualPaths: ['label'] },
        permissionSchema: { label: true },
        virtuals: { label: { get: () => 'unused', dependsOn: 23 } },
      },
      virtualAccess: 'read',
      outputAccess: 'read',
      docPermissionsAccess: 'read',
      requestedSelect: ['label'],
    };
    expect(() => selectCatalogOutputShape(args)).toThrow(TypeError);
    expect(() => projection.planCatalogProjection(args)).toThrow(TypeError);
  });
});
