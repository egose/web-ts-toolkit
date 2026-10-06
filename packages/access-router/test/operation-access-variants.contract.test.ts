/**
 * OAV-02: route-owned authorization resolution, independent of later generated
 * endpoint wiring. Probes use built cores and each router's owning-runtime
 * middleware/response handler; model fixtures never connect to a database.
 */
import express from 'express';
import mongoose from 'mongoose';
import request from 'supertest';
import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  createAccessRuntime,
  type AccessRouterRequest,
  type GuardHook,
  type ModelRouterOptions,
  type PairedRouteAccess,
  type RouteVariant,
  type RouteVariantAccess,
  type Validation,
} from '../dist/index.mjs';
import { OPERATION_ACCESS_VARIANTS, isRouteVariantAccess } from '../src/operation-access';

type Target = 'model' | 'data';
type OperationRules = ModelRouterOptions['operationAccess'];
type AuthorizationCore = NonNullable<AccessRouterRequest['macl'] | AccessRouterRequest['dacl']>;
type Check = { key: string; access: string; variant?: RouteVariant };
type OperationPair = readonly [PairedRouteAccess, RouteVariantAccess, RouteVariantAccess];

// Explicit expected keys make a misspelled/mismatched production mapping observable.
const pairs = [
  ['list', 'basicList', 'advancedList'],
  ['read', 'basicRead', 'advancedRead'],
  ['create', 'basicCreate', 'advancedCreate'],
  ['update', 'basicUpdate', 'advancedUpdate'],
  ['upsert', 'basicUpsert', 'advancedUpsert'],
  ['count', 'basicCount', 'advancedCount'],
  ['distinct', 'basicDistinct', 'advancedDistinct'],
] as const satisfies readonly OperationPair[];

const variants = ['basic', 'advanced'] as const satisfies readonly RouteVariant[];
const targets = ['model', 'data'] as const;
const activeFixtures: Array<{
  connection?: mongoose.Connection;
  runtime: ReturnType<typeof createAccessRuntime>;
}> = [];
let nameCounter = 0;

afterEach(async () => {
  for (const { connection, runtime } of activeFixtures.splice(0)) {
    runtime.runtime.clearOpenApiRoutes();
    await connection?.destroy();
  }
});

const routeAllowed = (core: AuthorizationCore, name: string, access: string, variant: RouteVariant) =>
  core.isAllowedRoute(name, access, variant);

const createFixture = (
  target: Target,
  checks: readonly Check[],
  options: {
    rules?: OperationRules;
    defaults?: OperationRules;
    name?: string;
    beforeCheck?: (req: AccessRouterRequest, core: AuthorizationCore) => void;
  } = {},
) => {
  const runtime = createAccessRuntime();
  const name = options.name ?? `Oav02Permission${++nameCounter}`;
  const errorLog = vi.fn();
  runtime.setGlobalOptions({
    requestPermissionField: '_permissions',
    globalPermissions(req) {
      return String(req.headers['x-perms'] ?? '')
        .split(',')
        .filter(Boolean);
    },
    logger: { error: errorLog },
  });
  if (options.defaults !== undefined) runtime.setDefaultModelOptions({ operationAccess: options.defaults });

  const routerOptions = 'rules' in options ? { operationAccess: options.rules } : {};
  const basePath = `/oav02-${target}`;
  let connection: mongoose.Connection | undefined;
  const router =
    target === 'model'
      ? (() => {
          connection = mongoose.createConnection();
          const Model = connection.model(name, new mongoose.Schema({ name: String, items: [{ name: String }] }));
          return runtime.createRouter(Model, { basePath, ...routerOptions });
        })()
      : runtime.createDataRouter(name, { basePath, data: [], ...routerOptions });
  activeFixtures.push({ connection, runtime });

  const errors: unknown[] = [];
  const getCore = (req: AccessRouterRequest) => {
    const core = target === 'model' ? req.macl : req.dacl;
    if (!core) throw new Error(`Owning runtime middleware did not initialize ${target} Core`);
    return core;
  };
  const probe = async (req: AccessRouterRequest) => {
    const core = getCore(req);
    options.beforeCheck?.(req, core);
    const allowed: Record<string, boolean> = {};
    try {
      for (const { key, access, variant } of checks) {
        allowed[key] =
          variant === undefined ? await core.isAllowed(name, access) : await routeAllowed(core, name, access, variant);
      }
    } catch (error) {
      errors.push(error);
      throw error;
    }
    return allowed;
  };
  router.router.get('/__oav02/check', probe);
  router.router.post('/__oav02/check', probe);
  const app = express();
  app.use(express.json());
  app.use(router.routes);
  return { app, runtime, router, name, path: `${basePath}/__oav02/check`, basePath, getCore, errors, errorLog };
};

const topChecks = (access: string): Check[] => [
  { key: 'base', access },
  { key: 'basic', access, variant: 'basic' },
  { key: 'advanced', access, variant: 'advanced' },
];

const checkVariants: Check[] = pairs
  .slice(0, 2)
  .flatMap(([access]) => variants.map((variant) => ({ key: `${variant}.${access}`, access, variant })));

const guardCases = [
  { label: 'false', guard: false, allowed: false },
  { label: 'null from a JavaScript configuration', guard: null, allowed: false },
  { label: 'empty OR array', guard: [], allowed: false },
  { label: 'synchronous false hook', guard: () => false, allowed: false },
  { label: 'asynchronous false hook', guard: async () => false, allowed: false },
  { label: 'undefined', guard: undefined, allowed: true },
] satisfies Array<{ label: string; guard: Validation | null | undefined; allowed: boolean }>;

describe.each(targets)('OAV-02 %s route-operation resolution', (target) => {
  it.each(target === 'model' ? pairs : pairs.slice(0, 2))(
    'maps %s to %s / %s with replacement and base inheritance',
    async (access, basicKey, advancedKey) => {
      const fixture = createFixture(target, topChecks(access));
      const cases = [
        { label: 'base allow', rules: { [access]: true }, base: true, basic: true, advanced: true },
        { label: 'base deny', rules: { [access]: false }, base: false, basic: false, advanced: false },
        {
          label: 'basic denies',
          rules: { [access]: true, [basicKey]: false },
          base: true,
          basic: false,
          advanced: true,
        },
        {
          label: 'advanced denies',
          rules: { [access]: true, [advancedKey]: false },
          base: true,
          basic: true,
          advanced: false,
        },
        {
          label: 'basic replaces denied base',
          rules: { [access]: false, [basicKey]: true },
          base: false,
          basic: true,
          advanced: false,
        },
        {
          label: 'advanced replaces denied base',
          rules: { [access]: false, [advancedKey]: true },
          base: false,
          basic: false,
          advanced: true,
        },
        { label: 'only basic', rules: { [basicKey]: true }, base: false, basic: true, advanced: false },
        { label: 'only advanced', rules: { [advancedKey]: true }, base: false, basic: false, advanced: true },
        {
          label: 'undefined inherits',
          rules: { [access]: true, [basicKey]: undefined, [advancedKey]: undefined },
          base: true,
          basic: true,
          advanced: true,
        },
        { label: 'no grants', rules: {}, base: false, basic: false, advanced: false },
      ];
      const observed = [];
      const expected = [];
      for (const { label, rules, base, basic, advanced } of cases) {
        fixture.router.operationAccess(rules);
        const response = await request(fixture.app).get(fixture.path).expect(200);
        observed.push({ label, ...response.body });
        expected.push({ label, base, basic, advanced });
      }
      expect(observed).toEqual(expected);
    },
  );

  it.each(guardCases)('$label is selected before an allowed base/default', async ({ guard, allowed }) => {
    const base = vi.fn<GuardHook>(() => true);
    const fallback = vi.fn<GuardHook>(() => true);
    const selected = typeof guard === 'function' ? vi.fn<GuardHook>(guard) : guard;
    const fixture = createFixture(target, topChecks('read').slice(1), {
      // null is deliberately stored as an untyped JS value, not a public Validation.
      rules: { read: base, default: fallback, basicRead: selected, advancedRead: selected } as OperationRules,
    });
    const response = await request(fixture.app).get(fixture.path).expect(200);
    expect(response.body).toEqual({ basic: allowed, advanced: allowed });
    expect(base).toHaveBeenCalledTimes(guard === undefined ? 2 : 0);
    expect(fallback).not.toHaveBeenCalled();
    if (typeof selected === 'function') expect(selected).toHaveBeenCalledTimes(2);
  });

  it('inherits scalar shorthand and base .default without a variant truthy/default fallback', async () => {
    const fixture = createFixture(target, checkVariants);
    const cases: Array<{ label: string; rules: OperationRules; perms?: string; allowed: boolean[] }> = [
      { label: 'boolean allow', rules: true, allowed: [true, true, true, true] },
      { label: 'boolean deny', rules: false, allowed: [false, false, false, false] },
      { label: 'AND string', rules: 'canList canRead', perms: 'canList,canRead', allowed: [true, true, true, true] },
      {
        label: 'partial AND string',
        rules: 'canList canRead',
        perms: 'canList',
        allowed: [false, false, false, false],
      },
      { label: 'OR array', rules: ['missing', 'canRead'], perms: 'canRead', allowed: [true, true, true, true] },
      {
        label: 'async shorthand',
        rules: async (permissions) => permissions.has('canRead'),
        perms: 'canRead',
        allowed: [true, true, true, true],
      },
      { label: 'default allow', rules: { default: true }, allowed: [true, true, true, true] },
      {
        label: 'base before denied default',
        rules: { default: false, list: true, read: true },
        allowed: [true, true, true, true],
      },
      {
        label: 'base deny before allowed default',
        rules: { default: true, list: false, read: false },
        allowed: [false, false, false, false],
      },
      {
        label: 'variants before allowed default',
        rules: { default: true, basicList: false, advancedRead: false },
        allowed: [false, true, true, false],
      },
      {
        label: 'variants before denied default',
        rules: { default: false, basicList: true, advancedRead: true },
        allowed: [true, false, false, true],
      },
      {
        label: 'selected variant AND/OR grants',
        rules: {
          default: false,
          basicList: 'canList canRead',
          advancedList: ['missing', 'canList'],
          basicRead: 'canRead',
          advancedRead: ['missing', 'canRead'],
        },
        perms: 'canList,canRead',
        allowed: [true, true, true, true],
      },
      {
        label: 'selected variant AND/OR partial grants',
        rules: {
          default: true,
          basicList: 'canList canRead',
          advancedList: ['missing', 'canList'],
          basicRead: 'canRead',
          advancedRead: ['missing', 'canRead'],
        },
        perms: 'canList',
        allowed: [false, true, false, false],
      },
    ];
    const observed = [];
    const expected = [];
    for (const { label, rules, perms = '', allowed } of cases) {
      fixture.router.operationAccess(rules);
      const response = await request(fixture.app).get(fixture.path).set('x-perms', perms).expect(200);
      observed.push({ label, ...response.body });
      expected.push({ label, ...Object.fromEntries(checkVariants.map(({ key }, index) => [key, allowed[index]])) });
    }
    expect(observed).toEqual(expected);
  });

  it.each(['variant', 'base'] as const)(
    'evaluates only the selected %s hook with request/permissions identity',
    async (selection) => {
      let currentRequest: AccessRouterRequest;
      const selected = vi.fn<GuardHook>(async function (permissions) {
        await Promise.resolve();
        expect(this).toBe(currentRequest);
        expect((target === 'model' ? this.macl : this.dacl)?.getPermissions()).toBe(permissions);
        expect(this.method).toBe('GET'); // Advanced metadata is explicit even on a GET probe.
        return permissions.has('canRead');
      });
      const base = vi.fn<GuardHook>(() => false);
      const otherVariant = vi.fn<GuardHook>(() => true);
      const fallback = vi.fn<GuardHook>(() => true);
      const fixture = createFixture(target, [{ key: 'chosen', access: 'read', variant: 'advanced' }], {
        rules: {
          read: selection === 'base' ? selected : base,
          advancedRead: selection === 'variant' ? selected : undefined,
          basicRead: otherVariant,
          default: fallback,
        },
        beforeCheck(req) {
          currentRequest = req;
        },
      });
      const granted = await request(fixture.app).get(fixture.path).set('x-perms', 'canRead').expect(200);
      const denied = await request(fixture.app).get(fixture.path).expect(200);
      expect(granted.body).toEqual({ chosen: true });
      expect(denied.body).toEqual({ chosen: false });
      expect(selected).toHaveBeenCalledTimes(2);
      expect(base).not.toHaveBeenCalled();
      expect(otherVariant).not.toHaveBeenCalled();
      expect(fallback).not.toHaveBeenCalled();
    },
  );

  it.each(['throw', 'reject'] as const)(
    'preserves an operational guard %s by identity and existing HTTP handling',
    async (failure) => {
      const sentinel = new Error(`OAV-02 ${target} guard ${failure}`);
      const selected = vi.fn<GuardHook>(
        failure === 'throw'
          ? () => {
              throw sentinel;
            }
          : async () => {
              throw sentinel;
            },
      );
      const base = vi.fn<GuardHook>(() => true);
      const fallback = vi.fn<GuardHook>(() => true);
      const fixture = createFixture(target, [{ key: 'chosen', access: 'read', variant: 'advanced' }], {
        rules: { read: base, advancedRead: selected, default: fallback },
      });
      const response = await request(fixture.app)
        .get(fixture.path)
        .expect(500)
        .expect('Content-Type', /application\/problem\+json/);
      expect(response.body).toMatchObject({ status: 500, title: 'Internal Server Error' });
      expect(fixture.errors).toEqual([sentinel]);
      expect(fixture.errors[0]).toBe(sentinel);
      expect(selected).toHaveBeenCalledTimes(1);
      expect(base).not.toHaveBeenCalled();
      expect(fallback).not.toHaveBeenCalled();
    },
  );

  it('reads live owning-runtime variants across requests and twice within one request', async () => {
    const initial = { list: false, basicList: true, advancedList: false };
    const fixture = createFixture(target, topChecks('list'), { rules: initial });
    const snapshot = fixture.router.options;
    expect((await request(fixture.app).get(fixture.path).expect(200)).body).toEqual({
      base: false,
      basic: true,
      advanced: false,
    });
    fixture.router.operationAccess('basicList', false);
    fixture.router.set('operationAccess.advancedList', true);
    expect((await request(fixture.app).get(fixture.path).expect(200)).body).toEqual({
      base: false,
      basic: false,
      advanced: true,
    });
    fixture.router.setOption('operationAccess.basicList', undefined);
    fixture.router.setOption('operationAccess.list', true);
    expect((await request(fixture.app).get(fixture.path).expect(200)).body).toEqual({
      base: true,
      basic: true,
      advanced: true,
    });

    fixture.router.router.get('/__oav02/live', async (req: AccessRouterRequest) => {
      const core = fixture.getCore(req);
      fixture.router.operationAccess({ list: false, basicList: true });
      const before = await routeAllowed(core, fixture.name, 'list', 'basic');
      fixture.router.setOption('operationAccess.basicList', false);
      const after = await routeAllowed(core, fixture.name, 'list', 'basic');
      return { before, after, base: await core.isAllowed(fixture.name, 'list') };
    });
    expect((await request(fixture.app).get(`${fixture.basePath}/__oav02/live`).expect(200)).body).toEqual({
      before: true,
      after: false,
      base: false,
    });
    expect(snapshot.operationAccess).toEqual(initial);
  });

  it('keeps same-name isolated runtimes with opposite variants independent during interleaved requests', async () => {
    const name = `Oav02SameName${++nameCounter}`;
    const guardA: GuardHook = async function (permissions) {
      await new Promise((resolve) => setTimeout(resolve, 1));
      expect((target === 'model' ? this.macl : this.dacl)?.getPermissions()).toBe(permissions);
      return permissions.has('runtimeA');
    };
    const guardB: GuardHook = async function (permissions) {
      await new Promise((resolve) => setTimeout(resolve, 1));
      expect((target === 'model' ? this.macl : this.dacl)?.getPermissions()).toBe(permissions);
      return permissions.has('runtimeB');
    };
    const a = createFixture(target, topChecks('list'), {
      name,
      rules: { list: true, basicList: guardA, advancedList: false },
    });
    const b = createFixture(target, topChecks('list'), {
      name,
      rules: { list: true, basicList: false, advancedList: guardB },
    });
    a.runtime.setGlobalOption('globalPermissions', () => ['runtimeA']);
    b.runtime.setGlobalOption('globalPermissions', () => ['runtimeB']);
    const responses = await Promise.all(
      Array.from({ length: 8 }, (_, index) => {
        const fixture = index % 2 === 0 ? a : b;
        return request(fixture.app).get(fixture.path).expect(200);
      }),
    );
    expect(responses.map(({ body }) => body)).toEqual(
      Array.from({ length: 8 }, (_, index) => ({ base: true, basic: index % 2 === 0, advanced: index % 2 !== 0 })),
    );
    a.router.operationAccess('advancedList', true);
    expect((await request(a.app).get(a.path).expect(200)).body).toEqual({ base: true, basic: true, advanced: true });
    expect((await request(b.app).get(b.path).expect(200)).body).toEqual({ base: true, basic: false, advanced: true });
  });

  it('uses server-owned metadata without method inference or ambient state in later base calls', async () => {
    const fixture = createFixture(
      target,
      [
        { key: 'advanced', access: 'read', variant: 'advanced' },
        { key: 'baseAfter', access: 'read' },
        { key: 'basic', access: 'read', variant: 'basic' },
        { key: 'baseAgain', access: 'read' },
      ],
      { rules: { read: false, basicRead: false, advancedRead: true } },
    );
    const expected = { advanced: true, baseAfter: false, basic: false, baseAgain: false };
    expect((await request(fixture.app).get(fixture.path).expect(200)).body).toEqual(expected);
    expect(
      (await request(fixture.app).post(fixture.path).send({ variant: 'basic', access: 'basicRead' }).expect(200)).body,
    ).toEqual(expected);
  });
});

describe('OAV-02 model-default specificity and data independence', () => {
  it.each([
    {
      label: 'default variant before model base',
      defaults: { list: true, basicList: false, advancedList: true },
      rules: { list: false },
      base: false,
      basic: false,
      advanced: true,
    },
    {
      label: 'model exact variants before default variants',
      defaults: { basicList: true, advancedList: false },
      rules: { list: true, basicList: false, advancedList: true },
      base: true,
      basic: false,
      advanced: true,
    },
    {
      label: 'default exact variants before model shorthand',
      defaults: { list: false, basicList: false, advancedList: true },
      rules: true,
      base: true,
      basic: false,
      advanced: true,
    },
    {
      label: 'default exact variants before model .default',
      defaults: { basicList: true, advancedList: false },
      rules: { default: false },
      base: false,
      basic: true,
      advanced: false,
    },
    {
      label: 'unset variants delegate closed model parent',
      defaults: { list: true },
      rules: { read: true },
      base: false,
      basic: false,
      advanced: false,
    },
    {
      label: 'unset variants delegate model shorthand',
      defaults: { list: false },
      rules: true,
      base: true,
      basic: true,
      advanced: true,
    },
    {
      label: 'unset variants delegate model .default',
      defaults: { list: true },
      rules: { default: false },
      base: false,
      basic: false,
      advanced: false,
    },
    {
      label: 'model undefined variant uses exact default variant',
      defaults: { basicList: true, advancedList: false },
      rules: { list: false, basicList: undefined },
      base: false,
      basic: true,
      advanced: false,
    },
  ] satisfies Array<{
    label: string;
    defaults: OperationRules;
    rules: OperationRules;
    base: boolean;
    basic: boolean;
    advanced: boolean;
  }>)('$label', async ({ defaults, rules, base, basic, advanced }) => {
    const fixture = createFixture('model', topChecks('list'), { defaults, rules });
    expect((await request(fixture.app).get(fixture.path).expect(200)).body).toEqual({ base, basic, advanced });
  });

  it('preserves copied model variant defaults and uses live exact defaults once the model value is undefined', async () => {
    const fixture = createFixture('model', topChecks('list'), {
      defaults: { list: false, basicList: true, advancedList: false },
    });
    const snapshot = fixture.router.options;
    fixture.runtime.setDefaultModelOption('operationAccess.list', true);
    fixture.runtime.setDefaultModelOption('operationAccess.basicList', false);
    fixture.runtime.setDefaultModelOption('operationAccess.advancedList', true);
    expect((await request(fixture.app).get(fixture.path).expect(200)).body).toEqual({
      base: false,
      basic: true,
      advanced: false,
    });
    fixture.runtime.setModelOption(fixture.name, 'operationAccess.basicList', undefined);
    expect((await request(fixture.app).get(fixture.path).expect(200)).body).toEqual({
      base: false,
      basic: false,
      advanced: false,
    });
    fixture.runtime.setModelOption(fixture.name, 'operationAccess', undefined);
    expect((await request(fixture.app).get(fixture.path).expect(200)).body).toEqual({
      base: true,
      basic: false,
      advanced: true,
    });
    expect(snapshot.operationAccess).toEqual({ list: false, basicList: true, advancedList: false });
  });

  it.each([
    {
      label: 'model allows do not grant unconfigured data',
      defaults: { list: true, basicList: true, advancedList: true },
      rules: undefined,
      base: false,
      basic: false,
      advanced: false,
    },
    {
      label: 'model variant denials do not override data shorthand',
      defaults: { basicList: false, advancedList: false },
      rules: true,
      base: true,
      basic: true,
      advanced: true,
    },
    {
      label: 'model variants do not replace data base inheritance',
      defaults: { basicList: true, advancedList: false },
      rules: { list: true, basicList: false },
      base: true,
      basic: false,
      advanced: true,
    },
  ] satisfies Array<{
    label: string;
    defaults: OperationRules;
    rules: OperationRules;
    base: boolean;
    basic: boolean;
    advanced: boolean;
  }>)('$label', async ({ defaults, rules, base, basic, advanced }) => {
    const fixture = createFixture('data', topChecks('list'), { defaults, rules });
    expect((await request(fixture.app).get(fixture.path).expect(200)).body).toEqual({ base, basic, advanced });
  });
});

describe('OAV-02 subdocument precedence and custom-access compatibility', () => {
  it('keeps one exact reserved-variant mapping available for later data-policy boundaries', () => {
    expect(
      Object.entries(OPERATION_ACCESS_VARIANTS).map(([access, { basic, advanced }]) => [access, basic, advanced]),
    ).toEqual(pairs);
    expect(
      pairs.flatMap(([, basic, advanced]) => [isRouteVariantAccess(basic), isRouteVariantAccess(advanced)]),
    ).toEqual(Array(14).fill(true));
    const custom = [
      undefined,
      null,
      false,
      {},
      ...pairs.map(([access]) => access),
      'basic',
      'advanced',
      'basicNew',
      'advancedDelete',
      'advancedDownload',
      'BasicRead',
      'advancedRead.extra',
      'subs.items.advancedRead',
    ];
    expect(custom.map(isRouteVariantAccess)).toEqual(Array(custom.length).fill(false));
  });

  it.each(pairs.slice(0, 2))(
    'resolves subs.items.%s with the field boundary before %s / %s',
    async (access, basicKey, advancedKey) => {
      const fixture = createFixture('model', topChecks(`subs.items.${access}`).slice(1));
      const other = access === 'list' ? 'read' : 'list';
      const cases = [
        {
          label: 'field variant denies before allowed field base',
          field: { [access]: true, [basicKey]: false, [advancedKey]: true },
          top: false,
          basic: false,
          advanced: true,
        },
        {
          label: 'field variant allows before denied field base',
          field: { [access]: false, [basicKey]: true, [advancedKey]: false },
          top: true,
          basic: true,
          advanced: false,
        },
        {
          label: 'undefined field variants inherit allowed field base',
          field: { [access]: true, [basicKey]: undefined, [advancedKey]: undefined },
          top: false,
          basic: true,
          advanced: true,
        },
        {
          label: 'field base denies before top variants',
          field: { [access]: false },
          top: true,
          basic: false,
          advanced: false,
        },
        { label: 'field scalar allows before top denials', field: true, top: false, basic: true, advanced: true },
        { label: 'field scalar denies before top allows', field: false, top: true, basic: false, advanced: false },
        {
          label: 'field AND permission',
          field: 'canSub canRead',
          perms: 'canSub,canRead',
          top: false,
          basic: true,
          advanced: true,
        },
        {
          label: 'field OR permission',
          field: ['missing', 'canSub'],
          perms: 'canSub',
          top: false,
          basic: true,
          advanced: true,
        },
        { label: 'field empty OR array', field: [], top: true, basic: false, advanced: false },
        { label: 'field null remains defined', field: null, top: true, basic: false, advanced: false },
        {
          label: 'closed sibling operation with permitted top base/variants',
          field: { [other]: true },
          top: true,
          basic: false,
          advanced: false,
        },
        {
          label: 'closed empty object with permitted top base/variants',
          field: {},
          top: true,
          basic: false,
          advanced: false,
        },
        {
          label: 'nested .default does not reopen field',
          field: { default: true },
          top: true,
          basic: false,
          advanced: false,
        },
        {
          label: 'all undefined keys leave a defined field closed',
          field: { [access]: undefined, [basicKey]: undefined, [advancedKey]: undefined },
          top: true,
          basic: false,
          advanced: false,
        },
      ];
      const observed = [];
      const expected = [];
      for (const { label, field, perms = '', top, basic, advanced } of cases) {
        fixture.router.operationAccess({
          [access]: top,
          [basicKey]: top,
          [advancedKey]: top,
          subs: { items: field },
        } as OperationRules);
        const response = await request(fixture.app).get(fixture.path).set('x-perms', perms).expect(200);
        observed.push({ label, ...response.body });
        expected.push({ label, basic, advanced });
      }
      for (const subs of [undefined, { items: undefined }, false, true, { default: { [access]: false } }]) {
        fixture.router.operationAccess({
          [access]: true,
          [basicKey]: false,
          [advancedKey]: true,
          subs,
        } as OperationRules);
        const response = await request(fixture.app).get(fixture.path).expect(200);
        observed.push({ label: 'absent field uses top variant', ...response.body });
        expected.push({ label: 'absent field uses top variant', basic: false, advanced: true });
        fixture.router.operationAccess({ [access]: true, subs } as OperationRules);
        const fallback = await request(fixture.app).get(fixture.path).expect(200);
        observed.push({ label: 'absent field uses top base', ...fallback.body });
        expected.push({ label: 'absent field uses top base', basic: true, advanced: true });
      }
      expect(observed).toEqual(expected);
    },
  );

  it.each(guardCases)(
    'subdocument exact $label is terminal before field base and top guards',
    async ({ guard, allowed }) => {
      const fieldBase = vi.fn<GuardHook>(() => true);
      const top = vi.fn<GuardHook>(() => true);
      const selected = typeof guard === 'function' ? vi.fn<GuardHook>(guard) : guard;
      const fixture = createFixture('model', topChecks('subs.items.read').slice(1), {
        rules: {
          read: top,
          basicRead: top,
          advancedRead: top,
          subs: { items: { read: fieldBase, basicRead: selected, advancedRead: selected } },
        } as OperationRules,
      });
      expect((await request(fixture.app).get(fixture.path).expect(200)).body).toEqual({
        basic: allowed,
        advanced: allowed,
      });
      expect(fieldBase).toHaveBeenCalledTimes(guard === undefined ? 2 : 0);
      expect(top).not.toHaveBeenCalled();
      if (typeof selected === 'function') expect(selected).toHaveBeenCalledTimes(2);
    },
  );

  it.each([
    {
      label: 'default field exact variant outranks model field base',
      defaults: { subs: { items: { basicList: false } } },
      rules: { list: true, basicList: true, advancedList: true, subs: { items: { list: true } } },
      basic: false,
      advanced: true,
    },
    {
      label: 'default field exact base outranks model field scalar',
      defaults: { subs: { items: { list: false } } },
      rules: { list: true, basicList: true, advancedList: true, subs: { items: true } },
      basic: false,
      advanced: false,
    },
    {
      label: 'default closed field cannot be reopened by model top rules',
      defaults: { subs: { items: { read: true } } },
      rules: { list: true, basicList: true, advancedList: true },
      basic: false,
      advanced: false,
    },
    {
      label: 'model field base outranks default top variant',
      defaults: { basicList: false, advancedList: false },
      rules: { subs: { items: { list: true } } },
      basic: true,
      advanced: true,
    },
  ] satisfies Array<{
    label: string;
    defaults: OperationRules;
    rules: OperationRules;
    basic: boolean;
    advanced: boolean;
  }>)('$label', async ({ defaults, rules, basic, advanced }) => {
    const fixture = createFixture('model', topChecks('subs.items.list').slice(1), { defaults, rules });
    expect((await request(fixture.app).get(fixture.path).expect(200)).body).toEqual({ basic, advanced });
  });

  it.each(['field variant', 'field base', 'field scalar', 'top variant', 'top base'] as const)(
    'executes only the selected %s hook and ignores the subs umbrella',
    async (selection) => {
      let currentRequest: AccessRouterRequest;
      const selected = vi.fn<GuardHook>(async function (permissions) {
        await Promise.resolve();
        expect(this).toBe(currentRequest);
        expect(this.macl?.getPermissions()).toBe(permissions);
        return permissions.has('canSub');
      });
      const unused = vi.fn<GuardHook>(() => true);
      const field =
        selection === 'field variant'
          ? { read: unused, advancedRead: selected }
          : selection === 'field base'
            ? { read: selected, advancedRead: undefined }
            : selection === 'field scalar'
              ? selected
              : undefined;
      const fixture = createFixture('model', [{ key: 'chosen', access: 'subs.items.read', variant: 'advanced' }], {
        rules: {
          read: selection === 'top base' ? selected : unused,
          advancedRead: selection === 'top variant' ? selected : selection === 'top base' ? undefined : unused,
          subs: field === undefined ? unused : { items: field },
        },
        beforeCheck(req) {
          currentRequest = req;
        },
      });
      const granted = await request(fixture.app).get(fixture.path).set('x-perms', 'canSub').expect(200);
      const denied = await request(fixture.app).get(fixture.path).expect(200);
      expect(granted.body).toEqual({ chosen: true });
      expect(denied.body).toEqual({ chosen: false });
      expect(selected).toHaveBeenCalledTimes(2);
      expect(unused).not.toHaveBeenCalled();
    },
  );

  it('maps only supported base/subdocument paths and leaves ordinary/custom/alias checks compatible', async () => {
    const accesses = [
      'download',
      'new',
      'delete',
      'basicList',
      'basicRead',
      'subs.items.update',
      'subs.items.download',
      'subs.items.list.extra',
      'subset.items.list',
    ];
    const checks = accesses.flatMap((access) =>
      topChecks(access).map((check) => ({ ...check, key: `${access}.${check.key}` })),
    );
    const fixture = createFixture('model', checks, {
      rules: {
        default: false,
        list: false,
        read: true,
        basicList: true,
        new: true,
        delete: true,
        subs: { items: { update: true, basicUpdate: false, advancedUpdate: false, download: 'canDownload' } },
      },
    });
    fixture.router.operationAccess('download', true);
    fixture.router.operationAccess('basicDownload', false);
    fixture.router.operationAccess('advancedDownload', false);
    fixture.router.operationAccess('basicNew', false);
    fixture.router.operationAccess('advancedDelete', false);
    fixture.router.operationAccess('subs.items.basicDownload', false);
    fixture.router.operationAccess('subs.items.list.extra', true);
    fixture.router.operationAccess('subset.items.list', true);
    const response = await request(fixture.app).get(fixture.path).set('x-perms', 'canDownload').expect(200);
    expect(response.body).toEqual(Object.fromEntries(checks.map(({ key }) => [key, !key.startsWith('basicRead.')])));
  });
});
