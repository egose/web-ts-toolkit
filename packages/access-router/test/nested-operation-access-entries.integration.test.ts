/** NOA-02: real generated/root entry gates, isolated from NOA-03 secondary policy. */
import express from 'express';
import mongoose from 'mongoose';
import request from 'supertest';
import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  createAccessRuntime,
  type AccessRouterRequest,
  type GuardHook,
  type OperationAccess,
  type Validation,
} from '../dist/index.mjs';

type Endpoint = { method: 'get' | 'post' | 'patch' | 'put' | 'delete' | 'head'; path: string; body?: unknown };
type Mapping = {
  label: string;
  target: 'model' | 'data';
  access: string;
  service: string;
  root: Record<string, unknown>;
  direct: Endpoint[];
};
const mappings: Mapping[] = [
  {
    label: 'model new',
    target: 'model',
    access: 'new',
    service: '_new',
    root: { op: 'new' },
    direct: [
      { method: 'get', path: '/new' },
      { method: 'head', path: '/new' },
    ],
  },
  {
    label: 'model list',
    target: 'model',
    access: 'list',
    service: '_list',
    root: { op: 'list' },
    direct: [
      { method: 'get', path: '' },
      { method: 'post', path: '/__query', body: {} },
    ],
  },
  {
    label: 'model read by id',
    target: 'model',
    access: 'read',
    service: '_read',
    root: { op: 'read', id: 'parent' },
    direct: [
      { method: 'get', path: '/parent' },
      { method: 'post', path: '/__query/parent', body: {} },
    ],
  },
  {
    label: 'model read by filter',
    target: 'model',
    access: 'read',
    service: '_readFilter',
    root: { op: 'read', filter: {} },
    direct: [{ method: 'post', path: '/__query/__filter', body: {} }],
  },
  {
    label: 'model create',
    target: 'model',
    access: 'create',
    service: '_create',
    root: { op: 'create', data: {} },
    direct: [
      { method: 'post', path: '', body: {} },
      { method: 'post', path: '/__mutation', body: { data: {} } },
    ],
  },
  {
    label: 'model update',
    target: 'model',
    access: 'update',
    service: '_update',
    root: { op: 'update', id: 'parent', data: {} },
    direct: [
      { method: 'patch', path: '/parent', body: {} },
      { method: 'patch', path: '/__mutation/parent', body: { data: {} } },
    ],
  },
  {
    label: 'model upsert',
    target: 'model',
    access: 'upsert',
    service: '_upsert',
    root: { op: 'upsert', data: {} },
    direct: [
      { method: 'put', path: '', body: {} },
      { method: 'put', path: '/__mutation', body: { data: {} } },
    ],
  },
  {
    label: 'model delete',
    target: 'model',
    access: 'delete',
    service: '_delete',
    root: { op: 'delete', id: 'parent' },
    direct: [{ method: 'delete', path: '/parent' }],
  },
  {
    label: 'model count',
    target: 'model',
    access: 'count',
    service: '_count',
    root: { op: 'count' },
    direct: [
      { method: 'get', path: '/count' },
      { method: 'post', path: '/count', body: {} },
    ],
  },
  {
    label: 'model distinct',
    target: 'model',
    access: 'distinct',
    service: '_distinct',
    root: { op: 'distinct', field: 'name' },
    direct: [
      { method: 'get', path: '/distinct/name' },
      { method: 'post', path: '/distinct/name', body: {} },
    ],
  },
  {
    label: 'sub list',
    target: 'model',
    access: 'subs.items.list',
    service: 'listSub',
    root: { op: 'subList', id: 'parent', sub: 'items' },
    direct: [
      { method: 'get', path: '/parent/items' },
      { method: 'post', path: '/parent/items/__query', body: {} },
    ],
  },
  {
    label: 'sub read',
    target: 'model',
    access: 'subs.items.read',
    service: 'readSub',
    root: { op: 'subRead', id: 'parent', sub: 'items', subId: 'child' },
    direct: [
      { method: 'get', path: '/parent/items/child' },
      { method: 'post', path: '/parent/items/child/__query', body: {} },
    ],
  },
  {
    label: 'sub create',
    target: 'model',
    access: 'subs.items.create',
    service: 'createSub',
    root: { op: 'subCreate', id: 'parent', sub: 'items', data: {} },
    direct: [{ method: 'post', path: '/parent/items', body: {} }],
  },
  {
    label: 'sub update',
    target: 'model',
    access: 'subs.items.update',
    service: 'updateSub',
    root: { op: 'subUpdate', id: 'parent', sub: 'items', subId: 'child', data: {} },
    direct: [{ method: 'patch', path: '/parent/items/child', body: {} }],
  },
  {
    label: 'sub bulk update',
    target: 'model',
    access: 'subs.items.update',
    service: 'bulkUpdateSub',
    root: { op: 'subBulkUpdate', id: 'parent', sub: 'items', data: [] },
    direct: [{ method: 'patch', path: '/parent/items', body: [] }],
  },
  {
    label: 'sub delete',
    target: 'model',
    access: 'subs.items.delete',
    service: 'deleteSub',
    root: { op: 'subDelete', id: 'parent', sub: 'items', subId: 'child' },
    direct: [{ method: 'delete', path: '/parent/items/child' }],
  },
  {
    label: 'data list',
    target: 'data',
    access: 'list',
    service: 'find',
    root: { op: 'list' },
    direct: [
      { method: 'get', path: '' },
      { method: 'post', path: '/__query', body: {} },
    ],
  },
  {
    label: 'data read by id',
    target: 'data',
    access: 'read',
    service: 'findById',
    root: { op: 'read', id: 'parent' },
    direct: [
      { method: 'get', path: '/parent' },
      { method: 'post', path: '/__query/parent', body: {} },
    ],
  },
  {
    label: 'data read by filter',
    target: 'data',
    access: 'read',
    service: 'findOne',
    root: { op: 'read', filter: {} },
    direct: [{ method: 'post', path: '/__query/__filter', body: {} }],
  },
];
const unpaired = mappings.filter(({ access }) =>
  ['new', 'delete', 'subs.items.create', 'subs.items.update', 'subs.items.delete'].includes(access),
);
const fixtures: Array<{ api: ReturnType<typeof createAccessRuntime>; connection: mongoose.Connection }> = [];
let counter = 0;

afterEach(async () => {
  vi.restoreAllMocks();
  for (const { api, connection } of fixtures.splice(0)) {
    api.runtime.clearOpenApiRoutes();
    await connection.destroy();
  }
});

const createFixture = (mapping: Mapping, { omitModelRules = false } = {}) => {
  const api = createAccessRuntime();
  const connection = mongoose.createConnection();
  fixtures.push({ api, connection });
  const modelName = `Noa02Entry${++counter}`;
  const dataName = `${modelName}Data`;
  const name = mapping.target === 'model' ? modelName : dataName;
  const Model = connection.model(
    modelName,
    new mongoose.Schema({ name: String, items: [{ label: String }] }, { bufferCommands: false }),
  );
  const modelRouter = api.createRouter(Model, {
    basePath: '/model',
    ...(omitModelRules ? {} : { operationAccess: false }),
  });
  const dataRouter = api.createDataRouter(dataName, { basePath: '/data', operationAccess: false, data: [] });
  const rootRouter = api.createRouter({ basePath: '/batch', operationAccess: true });
  // This deliberate service sentinel proves entry admission/denial without
  // pretending the captured nested response/secondary policies already work.
  const dispatched = vi.fn<(method: string) => void>();
  const service = Object.fromEntries(
    mappings.map(({ service }) => [
      service,
      async () => {
        dispatched(service);
        return {
          success: false,
          kind: 'error',
          code: 'bad_request',
          errors: [{ detail: 'Service dispatch sentinel' }],
        };
      },
    ]),
  );
  const constructions = vi.fn();
  const app = express();
  app.use(express.json());
  app.use(rootRouter.router.middlewares);
  app.use((req, _res, next) => {
    const { macl, dacl } = req as AccessRouterRequest;
    vi.spyOn(macl!, 'getPublicService').mockImplementation((target) => {
      constructions('model', target);
      return service as never;
    });
    vi.spyOn(dacl!, 'getService').mockImplementation((target) => {
      constructions('data', target);
      return service as never;
    });
    next();
  });
  app.use(modelRouter.routes, dataRouter.routes, rootRouter.routes);
  const router = mapping.target === 'model' ? modelRouter : dataRouter;
  const setRules = (rules: OperationAccess | Validation) => router.operationAccess(rules);
  const setRule = (rule: unknown) => {
    setRules({ default: false });
    router.operationAccess(mapping.access, rule);
  };
  const entry = { target: mapping.target, name, ...mapping.root };
  const sendRoot = () => request(app).post('/batch').send([entry]);
  const sendDirect = (endpoint: Endpoint) => {
    const test = request(app)[endpoint.method](`/${mapping.target}${endpoint.path}`);
    return endpoint.body === undefined ? test : test.send(endpoint.body);
  };
  const expectRoot = async (allowed: boolean) => {
    const before = dispatched.mock.calls.length;
    const response = await sendRoot().expect(200);
    expect(response.body[0]).toMatchObject({
      index: 0,
      target: mapping.target,
      name,
      op: mapping.root.op,
      statusCode: allowed ? 400 : 401,
      result: { success: false, code: allowed ? 'bad_request' : 'unauthorized' },
    });
    expect(dispatched).toHaveBeenCalledTimes(before + Number(allowed));
    expect(constructions).toHaveBeenCalledTimes(before + Number(allowed));
    if (allowed) {
      expect(constructions).toHaveBeenLastCalledWith(mapping.target, name);
      expect(dispatched).toHaveBeenLastCalledWith(mapping.service);
    }
  };
  const expectDirect = async (allowed: boolean) => {
    for (const endpoint of mapping.direct) {
      const before = dispatched.mock.calls.length;
      await sendDirect(endpoint).expect(allowed ? 400 : 401);
      expect(dispatched).toHaveBeenCalledTimes(before + Number(allowed));
      expect(constructions).toHaveBeenCalledTimes(before + Number(allowed));
      if (allowed) expect(dispatched).toHaveBeenLastCalledWith(mapping.service);
    }
  };
  return {
    app,
    api,
    name,
    router,
    rootRouter,
    modelRouter,
    dataRouter,
    setRules,
    setRule,
    expectRoot,
    expectDirect,
    dispatched,
    constructions,
    sendRoot,
  };
};

describe('NOA-02 root versus direct dispatch for every supported operation', () => {
  for (const rootAllowed of [true, false]) {
    it.each(mappings)(`$label selects root=${rootAllowed} independently of its default`, async (mapping) => {
      const fixture = createFixture(mapping);
      fixture.setRule({ default: !rootAllowed, root: rootAllowed });
      await fixture.expectRoot(rootAllowed);
      await fixture.expectDirect(!rootAllowed);
    });
  }

  it.each(mappings)('$label retains scalar and undefined-root fallback', async (mapping) => {
    const fixture = createFixture(mapping);
    for (const allowed of [true, false]) {
      fixture.setRule(allowed);
      await fixture.expectRoot(allowed);
      await fixture.expectDirect(allowed);
      fixture.setRule({ default: allowed, root: undefined });
      await fixture.expectRoot(allowed);
    }
    fixture.setRule({ default: true, root: [] });
    await fixture.expectRoot(false);
  });

  it.each(unpaired)('$label selects basic on all unpaired direct paths, never advanced or root', async (mapping) => {
    const fixture = createFixture(mapping);
    for (const basic of [true, false]) {
      fixture.setRule({ default: !basic, basic, advanced: !basic, root: !basic });
      await fixture.expectDirect(basic);
      await fixture.expectRoot(!basic);
    }
  });

  it('keeps the root scalar outer guard independent from target root admission', async () => {
    const fixture = createFixture(mappings[2]);
    fixture.setRule({ default: false, root: true });
    fixture.rootRouter.operationAccess = false;
    await fixture.sendRoot().expect(401);
    expect(fixture.constructions).not.toHaveBeenCalled();
    fixture.rootRouter.operationAccess = true;
    await fixture.expectRoot(true);
    fixture.setRule({ default: true, root: false });
    await fixture.expectRoot(false);
    await fixture.expectDirect(true);
  });

  it.each([
    {
      label: 'runtime root precedes a model scalar',
      defaults: { read: { root: true } },
      rules: { read: false },
      root: true,
      direct: false,
    },
    {
      label: 'runtime root precedes a model operation default',
      defaults: { read: { root: false } },
      rules: { read: { default: true } },
      root: false,
      direct: true,
    },
    {
      label: 'model root precedes runtime root',
      defaults: { read: { root: false } },
      rules: { read: { default: false, root: true } },
      root: true,
      direct: false,
    },
    {
      label: 'an empty model operation does not recursively inherit runtime operation default',
      defaults: { read: { default: false } },
      rules: { default: true, read: {} },
      root: true,
      direct: true,
    },
    {
      label: 'an omitted operationAccess inherits its owning whole operation',
      defaults: { read: { default: true } },
      omitted: true,
      root: true,
      direct: true,
    },
    {
      label: 'explicit undefined keeps exact runtime operation fallback',
      defaults: { read: { default: true } },
      rules: undefined,
      root: true,
      direct: true,
    },
    {
      label: 'explicit undefined does not inherit runtime outer catch-all',
      defaults: { default: true },
      rules: undefined,
      root: false,
      direct: false,
    },
  ])('$label at live root/direct gates', async (testCase) => {
    const fixture = createFixture(mappings[2], { omitModelRules: 'omitted' in testCase });
    fixture.api.setDefaultModelOptions({ operationAccess: testCase.defaults });
    if (!('omitted' in testCase)) fixture.router.operationAccess(testCase.rules);
    await fixture.expectRoot(testCase.root);
    await fixture.expectDirect(testCase.direct);
  });

  it.each([
    {
      label: 'absent field uses top operation root',
      rules: { read: { default: false, root: true } },
      root: true,
      direct: false,
    },
    {
      label: 'closed field missing read denies outer/top allows',
      rules: { default: true, read: true, subs: { items: { list: true } } },
      root: false,
      direct: false,
    },
    {
      label: 'empty field operation denies outer/top allows',
      rules: { default: true, read: true, subs: { items: { read: {} } } },
      root: false,
      direct: false,
    },
    {
      label: 'field scalar precedes top operation context',
      rules: { read: { default: false, root: false }, subs: { items: true } },
      root: true,
      direct: true,
    },
    {
      label: 'field nested default precedes top allows',
      rules: { default: true, read: true, subs: { items: { read: { default: false } } } },
      root: false,
      direct: false,
    },
  ])('$label at root and direct field entries', async ({ rules, root, direct }) => {
    const fixture = createFixture(mappings.find(({ label }) => label === 'sub read')!);
    fixture.setRules(rules);
    await fixture.expectRoot(root);
    await fixture.expectDirect(direct);
  });

  it('keeps runtime exact field-root specificity ahead of a model field scalar', async () => {
    const fixture = createFixture(mappings.find(({ label }) => label === 'sub read')!);
    fixture.api.setDefaultModelOptions({ operationAccess: { subs: { items: { read: { root: false } } } } });
    fixture.setRules({ read: true, subs: { items: true } });
    await fixture.expectRoot(false);
    await fixture.expectDirect(true);
  });

  it('does not add entry checks to trusted model service calls or change their field policy', async () => {
    const api = createAccessRuntime();
    const connection = mongoose.createConnection();
    fixtures.push({ api, connection });
    const Model = connection.model(
      'Noa02Trusted',
      new mongoose.Schema({
        name: { type: String, default: 'template' },
        secret: { type: String, default: 'hidden' },
      }),
    );
    const router = api.createRouter(Model, {
      basePath: '/guarded',
      operationAccess: { new: { default: false, basic: false, advanced: false, root: false } },
      permissionSchema: { name: true, secret: false },
    });
    const app = express();
    app.use(express.json(), api(), router.routes);
    app.all('/trusted', async (req, res) => {
      res.json(await (req as AccessRouterRequest).macl!.getService('Noa02Trusted').new());
    });
    await request(app).get('/guarded/new').expect(401);
    for (const method of ['get', 'post', 'patch', 'put'] as const) {
      const response = await request(app)[method]('/trusted').expect(200);
      expect(response.body).toMatchObject({ success: true, data: { name: 'template' } });
      expect(response.body.data).not.toHaveProperty('secret');
    }
  });

  it('allows root data responses while direct reads deny, and applies ordinary row/field policy', async () => {
    const api = createAccessRuntime();
    const connection = mongoose.createConnection();
    fixtures.push({ api, connection });
    const data = api.createDataRouter('Visible', {
      basePath: '/visible',
      idField: 'id',
      data: [
        { id: 'one', label: 'One', secret: 'hidden', tenant: 'allowed' },
        { id: 'two', label: 'Two', tenant: 'denied' },
      ],
      operationAccess: { read: { default: false, root: true }, list: { default: false, root: true } },
      permissionSchema: { id: true, label: true, secret: false },
      baseFilter: { read: () => ({ tenant: 'allowed' }), list: () => ({ tenant: 'allowed' }) },
    });
    const root = api.createRouter({ basePath: '/batch', operationAccess: true });
    const app = express();
    app.use(express.json(), data.routes, root.routes);
    await request(app).get('/visible/one').expect(401);
    await request(app).post('/visible/__query/one').send({}).expect(401);
    const response = await request(app)
      .post('/batch')
      .send([
        { target: 'data', name: 'Visible', op: 'read', id: 'one' },
        { target: 'data', name: 'Visible', op: 'list' },
      ])
      .expect(200);
    expect(response.body.map((entry) => entry.result.data)).toEqual([
      { id: 'one', label: 'One' },
      [{ id: 'one', label: 'One' }],
    ]);
  });
});

describe('NOA-02 live base cores are context-free', () => {
  it.each(mappings)('$label resolves nested default without ambient root/basic/advanced context', async (mapping) => {
    const fixture = createFixture(mapping);
    const probe = async (req: AccessRouterRequest, res: express.Response) => {
      const core = mapping.target === 'model' ? req.macl! : req.dacl!;
      const root = await core.isAllowedRoute(fixture.name, mapping.access, 'root');
      const base = await core.isAllowed(fixture.name, mapping.access);
      const advanced = await core.isAllowedRoute(fixture.name, mapping.access, 'advanced');
      const baseAgain = await core.isAllowed(fixture.name, mapping.access);
      res.json({ root, base, advanced, baseAgain });
    };
    fixture.app.get('/probe', probe);
    fixture.app.post('/probe', probe);
    for (const allowed of [true, false]) {
      fixture.setRule({ default: allowed, basic: !allowed, advanced: !allowed, root: !allowed });
      const expected = { root: !allowed, base: allowed, advanced: !allowed, baseAgain: allowed };
      expect((await request(fixture.app).get('/probe').expect(200)).body).toEqual(expected);
      expect((await request(fixture.app).post('/probe').send({ context: 'root' }).expect(200)).body).toEqual(expected);
    }
    expect(fixture.constructions).not.toHaveBeenCalled();
  });

  it.each(['model', 'data'] as const)(
    '%s base checks select and evaluate only one nested default hook',
    async (target) => {
      const fixture = createFixture(
        mappings.find((mapping) => mapping.target === target && mapping.access === 'read')!,
      );
      const selected = vi.fn<GuardHook>(async function (permissions) {
        expect(this[target === 'model' ? 'macl' : 'dacl']!.getPermissions()).toBe(permissions);
        return true;
      });
      const unused = vi.fn(() => {
        throw new Error('Transport/outer fallback reached by base check');
      });
      fixture.setRules({ default: unused, read: { default: selected, basic: unused, advanced: unused, root: unused } });
      fixture.app.get('/probe', async (req, res) => {
        const core = target === 'model' ? (req as AccessRouterRequest).macl! : (req as AccessRouterRequest).dacl!;
        res.json(await core.isAllowed(fixture.name, 'read'));
      });
      expect((await request(fixture.app).get('/probe').expect(200)).body).toBe(true);
      expect(selected).toHaveBeenCalledTimes(1);
      expect(unused).not.toHaveBeenCalled();
    },
  );
});
