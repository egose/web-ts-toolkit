import { describe, expect, it } from 'vitest';

import { createAdapter, ModelService } from '../src';
import { UnsupportedServiceDefaultValueError, cloneServiceDefaultValue } from '../src/services/shared';
import type { Defaults } from '../src/interface';
import { setupIntegrationSuite, type User, type Org } from './support/integration-suite';

const suite = setupIntegrationSuite();

const ISO = '2026-01-02T03:04:05.000Z';

function makeDirectUserService(defaults?: Defaults) {
  return new ModelService<User>(
    {
      axios: suite.adapter.axios,
      modelName: 'AdapterJsIntegrationUser',
      basePath: 'users',
      queryPath: '__query',
      mutationPath: '__mutation',
      onSuccess: () => {},
      onFailure: () => {},
      throwOnError: false,
    },
    defaults,
  );
}

describe('BND-10 service defaults: Date semantics and sq precedence', () => {
  it('Date defaults survive cloning (not {}) and equal per-call bodies, stable after caller mutation (direct constructor)', async () => {
    const at = new Date(ISO);
    const defaults: Defaults = {
      listAdvancedArgs: {
        populate: [{ path: 'orgs', match: { createdAt: at } }],
        tasks: [{ type: 'NOOP-BND10', args: { at }, options: {} }],
      },
    };
    const svc = makeDirectUserService(defaults);

    // Mutate caller-owned inputs after construction: stored defaults must be detached.
    at.setTime(new Date('2030-05-06T00:00:00.000Z').getTime());
    (defaults.listAdvancedArgs?.populate as Array<{ path: string }>)[0].path = 'mutated';
    (defaults.listAdvancedArgs?.tasks as Array<{ type: string }>)[0].type = 'MUTATED';

    const res = await svc.listAdvanced({}, undefined, undefined, { headers: { user: 'admin' } });
    expect(res.success).toBe(true);
    const body = suite.protocolRequests.at(-1)?.body as Record<string, unknown>;
    const populate = body.populate as Array<{ path: string; match: Record<string, unknown> }>;
    const tasks = body.tasks as Array<{ type: string; args: Record<string, unknown> }>;
    expect(populate[0].path).toBe('orgs');
    expect(populate[0].match.createdAt).toBe(ISO);
    expect(tasks[0].type).toBe('NOOP-BND10');
    expect(tasks[0].args.at).toBe(ISO);

    // Per-call equivalence: exact serialized bodies match.
    const perCall = makeDirectUserService(undefined);
    await perCall.listAdvanced(
      {},
      {
        populate: [{ path: 'orgs', match: { createdAt: new Date(ISO) } }],
        tasks: [{ type: 'NOOP-BND10', args: { at: new Date(ISO) }, options: {} }],
      },
      undefined,
      { headers: { user: 'admin' } },
    );
    const perCallBody = suite.protocolRequests.at(-1)?.body as Record<string, unknown>;
    expect(perCallBody.populate).toEqual(body.populate);
    expect(perCallBody.tasks).toEqual(body.tasks);

    // Stability: second defaults-only call still yields the original ISO.
    await svc.listAdvanced({}, undefined, undefined, { headers: { user: 'admin' } });
    const second = suite.protocolRequests.at(-1)?.body as Record<string, unknown>;
    expect((second.populate as Array<{ match: Record<string, unknown> }>)[0].match.createdAt).toBe(ISO);
  });

  it('Date defaults work through adapter factories (adapter + service precedence)', async () => {
    const baseURL = suite.adapter.axios.defaults.baseURL as string;
    const adapterDate = new Date(ISO);
    const adapter = createAdapter(
      { baseURL },
      { modelDefaults: { listAdvancedArgs: { populate: [{ path: 'orgs', match: { createdAt: adapterDate } }] } } },
    );
    const svc = adapter.createModelService<User>({ modelName: 'AdapterJsIntegrationUser', basePath: 'users' });

    adapterDate.setTime(new Date('2031-01-01T00:00:00.000Z').getTime());

    const res = await svc.listAdvanced({}, undefined, undefined, { headers: { user: 'admin' } });
    expect(res.success).toBe(true);
    const body = suite.protocolRequests.at(-1)?.body as Record<string, unknown>;
    expect((body.populate as Array<{ match: Record<string, unknown> }>)[0].match.createdAt).toBe(ISO);

    // Service defaults override adapter defaults.
    const svcOverride = adapter.createModelService<User>(
      { modelName: 'AdapterJsIntegrationUser', basePath: 'users' },
      {
        listAdvancedArgs: { populate: [{ path: 'orgs', match: { createdAt: new Date('2027-02-03T00:00:00.000Z') } }] },
      },
    );
    await svcOverride.listAdvanced({}, undefined, undefined, { headers: { user: 'admin' } });
    const overrideBody = suite.protocolRequests.at(-1)?.body as Record<string, unknown>;
    expect((overrideBody.populate as Array<{ match: Record<string, unknown> }>)[0].match.createdAt).toBe(
      '2027-02-03T00:00:00.000Z',
    );

    // Per-call wins over both.
    await svcOverride.listAdvanced(
      {},
      { populate: [{ path: 'orgs', match: { createdAt: new Date('2028-03-04T00:00:00.000Z') } }] },
      undefined,
      { headers: { user: 'admin' } },
    );
    const perCallBody = suite.protocolRequests.at(-1)?.body as Record<string, unknown>;
    expect((perCallBody.populate as Array<{ match: Record<string, unknown> }>)[0].match.createdAt).toBe(
      '2028-03-04T00:00:00.000Z',
    );
  });

  it('unsupported and cyclic defaults are rejected (controlled), not corrupted', async () => {
    const base = {
      axios: suite.adapter.axios,
      modelName: 'AdapterJsIntegrationUser',
      basePath: 'users',
      queryPath: '__query',
      mutationPath: '__mutation',
      onSuccess: () => {},
      onFailure: () => {},
      throwOnError: false,
    } as const;
    const before = suite.protocolRequests.length;

    expect(
      () =>
        new ModelService<User>(base, {
          listAdvancedArgs: { tasks: [{ type: 'X', args: { fn: (() => {}) as unknown as string }, options: {} }] },
        }),
    ).toThrow(UnsupportedServiceDefaultValueError);

    expect(
      () =>
        new ModelService<User>(base, {
          listAdvancedArgs: { populate: [{ path: 'x', match: { d: new Date('nope') } }] },
        }),
    ).toThrow(UnsupportedServiceDefaultValueError);

    expect(
      () =>
        new ModelService<User>(base, {
          listAdvancedArgs: {
            populate: [{ path: 'x', match: { m: new Map() as unknown as Record<string, unknown> } }],
          },
        }),
    ).toThrow(UnsupportedServiceDefaultValueError);

    expect(
      () =>
        new ModelService<User>(base, {
          listAdvancedArgs: { tasks: [{ type: 'X', args: Number.NaN as unknown as string, options: {} }] },
        }),
    ).toThrow(UnsupportedServiceDefaultValueError);

    const cyclic: Record<string, unknown> = {};
    cyclic.self = cyclic;
    expect(
      () => new ModelService<User>(base, { listAdvancedArgs: { populate: [{ path: 'x', match: { cyc: cyclic } }] } }),
    ).toThrow(UnsupportedServiceDefaultValueError);

    const arr: unknown[] = [];
    arr.push(arr);
    expect(
      () =>
        new ModelService<User>(base, {
          listAdvancedArgs: { tasks: [{ type: 'X', args: arr as unknown as string, options: {} }] },
        }),
    ).toThrow(UnsupportedServiceDefaultValueError);

    // No dispatch happened for constructor-time rejections.
    expect(suite.protocolRequests.length).toBe(before);

    // clone helper itself rejects cycles instead of overflowing.
    expect(() => cloneServiceDefaultValue(cyclic)).toThrow(UnsupportedServiceDefaultValueError);
  });

  it('sq defaults apply with adapter/service/per-call precedence and are detached', async () => {
    const svc = makeDirectUserService({
      listOptions: { sq: { path: 'orgs', compact: true } },
      listAdvancedOptions: { sq: { path: 'orgs', compact: true } },
      readOptions: { sq: { path: 'orgs', compact: true } },
      readAdvancedOptions: { sq: { path: 'orgs', compact: true } },
    });

    expect(svc.list({ limit: 1 }).__query.sqOptions).toEqual({ path: 'orgs', compact: true });
    expect(svc.listAdvanced({ public: true }).__query.sqOptions).toEqual({ path: 'orgs', compact: true });
    expect(svc.read('abc').__query.sqOptions).toEqual({ path: 'orgs', compact: true });
    expect(svc.readAdvanced('abc').__query.sqOptions).toEqual({ path: 'orgs', compact: true });
    expect(svc.readAdvancedFilter({ name: 'x' }).__query.sqOptions).toEqual({ path: 'orgs', compact: true });

    // Per-call wins and does not mutate stored defaults.
    const perCall = { path: 'other', compact: false };
    expect(svc.readAdvancedFilter({ name: 'x' }, undefined, { sq: perCall }).__query.sqOptions).toEqual(perCall);
    expect(svc.readAdvancedFilter({ name: 'x' }).__query.sqOptions).toEqual({ path: 'orgs', compact: true });

    // Detached: mutating the caller defaults object after construction has no effect.
    const sqInput = { path: 'orgs', compact: true };
    const svc2 = makeDirectUserService({ readAdvancedOptions: { sq: sqInput } });
    sqInput.path = 'mutated';
    expect(svc2.readAdvancedFilter({ name: 'x' }).__query.sqOptions).toEqual({ path: 'orgs', compact: true });
    // Mutating one request's sqOptions does not leak into the next.
    const q1 = svc2.readAdvancedFilter({ name: 'x' }).__query;
    (q1.sqOptions as Record<string, unknown>).path = 'mutated';
    expect(svc2.readAdvancedFilter({ name: 'x' }).__query.sqOptions).toEqual({ path: 'orgs', compact: true });

    // Adapter/service/per-call precedence.
    const baseURL = suite.adapter.axios.defaults.baseURL as string;
    const adapter = createAdapter(
      { baseURL },
      { modelDefaults: { readAdvancedOptions: { sq: { path: 'adapter-path', compact: false } } } },
    );
    const fromAdapterOnly = adapter.createModelService<User>({
      modelName: 'AdapterJsIntegrationUser',
      basePath: 'users',
    });
    expect(fromAdapterOnly.readAdvancedFilter({ name: 'x' }).__query.sqOptions).toEqual({
      path: 'adapter-path',
      compact: false,
    });
    const fromServiceOverride = adapter.createModelService<User>(
      { modelName: 'AdapterJsIntegrationUser', basePath: 'users' },
      { readAdvancedOptions: { sq: { path: 'service-path', compact: true } } },
    );
    expect(fromServiceOverride.readAdvancedFilter({ name: 'x' }).__query.sqOptions).toEqual({
      path: 'service-path',
      compact: true,
    });
    expect(
      fromServiceOverride.readAdvancedFilter({ name: 'x' }, undefined, { sq: { path: 'per-call', compact: false } })
        .__query.sqOptions,
    ).toEqual({ path: 'per-call', compact: false });
  });

  it('default-only nested subqueries extract the intended path; per-call wins; direct/grouped agree', async () => {
    const userSvc = makeDirectUserService({ readAdvancedOptions: { sq: { path: 'orgs', compact: true } } });
    const orgSvc = suite.services.orgService;

    // Default-only nested subquery.
    const defaultSub = userSvc.readAdvancedFilter({ name: 'lucy2' }, undefined, undefined, {
      headers: { user: 'admin' },
    });
    expect(defaultSub.__query.sqOptions).toEqual({ path: 'orgs', compact: true });
    const viaDefaults = await orgSvc.listAdvanced({ _id: defaultSub }, { select: ['name'] }, undefined, {
      headers: { user: 'admin' },
    });
    expect(viaDefaults.success).toBe(true);
    expect(viaDefaults.data.map((row: Org) => row.name).sort()).toEqual(['blue', 'red']);

    // Per-call explicit equivalent agrees.
    const plainSvc = makeDirectUserService(undefined);
    const perCallSub = plainSvc.readAdvancedFilter(
      { name: 'lucy2' },
      undefined,
      { sq: { path: 'orgs', compact: true } },
      {
        headers: { user: 'admin' },
      },
    );
    const viaPerCall = await orgSvc.listAdvanced({ _id: perCallSub }, { select: ['name'] }, undefined, {
      headers: { user: 'admin' },
    });
    expect(viaPerCall.data.map((row: Org) => row.name).sort()).toEqual(
      viaDefaults.data.map((row: Org) => row.name).sort(),
    );

    // Per-call wins over defaults: different path extracts nothing comparable.
    const overrideSub = userSvc.readAdvancedFilter(
      { name: 'lucy2' },
      undefined,
      { sq: { path: 'statusHistory', compact: true } },
      {
        headers: { user: 'admin' },
      },
    );
    expect(overrideSub.__query.sqOptions).toEqual({ path: 'statusHistory', compact: true });
    const outerOverride = await orgSvc.listAdvanced({ _id: overrideSub }, { select: ['name'] }, undefined, {
      headers: { user: 'admin' },
    });
    expect(outerOverride.success).toBe(true);
    // statusHistory ids do not match org _ids, so the org result differs from the orgs-path result.
    expect(outerOverride.data.map((row: Org) => row.name).sort()).not.toEqual(['blue', 'red']);

    // Direct/grouped agree for default-only nested subqueries.
    const gDefaultSub = userSvc.readAdvancedFilter({ name: 'lucy2' }, undefined, undefined, {
      headers: { user: 'admin' },
    });
    const gPerCallSub = plainSvc.readAdvancedFilter(
      { name: 'lucy2' },
      undefined,
      { sq: { path: 'orgs', compact: true } },
      { headers: { user: 'admin' } },
    );
    const gOuterDefault = orgSvc.listAdvanced({ _id: gDefaultSub }, { select: ['name'] }, undefined, {
      headers: { user: 'admin' },
    });
    const gOuterPerCall = orgSvc.listAdvanced({ _id: gPerCallSub }, { select: ['name'] }, undefined, {
      headers: { user: 'admin' },
    });
    const [groupedDefault, groupedPerCall] = await suite.adapter.group(gOuterDefault, gOuterPerCall);
    expect(groupedDefault.success).toBe(true);
    expect(groupedPerCall.success).toBe(true);
    expect(groupedDefault.data.map((row: Org) => row.name).sort()).toEqual(['blue', 'red']);
    expect(groupedPerCall.data.map((row: Org) => row.name).sort()).toEqual(['blue', 'red']);
  });
});
