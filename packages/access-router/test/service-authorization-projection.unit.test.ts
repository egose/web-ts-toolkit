import mongoose from 'mongoose';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { captureAuthorizationFieldCatalog } from '../src/acl/field-catalog';
import {
  classifyEffectiveFieldAuthorization,
  evaluateEffectiveFieldAuthorization,
  extractOutputFieldRules,
  extractScopedOutputRule,
} from '../src/acl/field-authorization';
import { compactPersistedProjection, planAuthorizedModelProjection } from '../src/acl/output-projection';
import {
  resolveServiceAuthorization,
  readServiceAuthorization,
  ServiceAuthorizationError,
} from '../src/acl/service-authorization';
import { planVirtualProjection } from '../src/acl/virtual-projection';
import { resolveSelectForRequest } from '../src/acl/select-resolution';
import { Core } from '../src/core';
import { Base } from '../src/services/base';
import { AccessRuntime } from '../src/runtime';
import { runWithRuntime } from '../src/runtime-context';
import { PERMISSIONS } from '../src/symbols';
import Permission from '../src/permission';
import type { ModelRequest, Projection } from '../src/interfaces';
import type { OutputAuthorization } from '../src/interfaces/service-authorization';

const grant = (...paths: string[]): OutputAuthorization => ({ outputFields: { mode: 'grant', paths } });
const unrestricted: OutputAuthorization = { outputFields: { mode: 'unrestricted' } };
const permissions = new Permission({ reader: true, admin: false });
const access = { operation: 'read', virtualAccess: 'read', outputAccess: 'read', docPermissionsAccess: 'read' };

function fixture(over: Record<string, unknown> = {}) {
  const contact = new mongoose.Schema({
    email: String,
    name: String,
    ssn: String,
    secret: { type: String, select: false },
  });
  const schema = new mongoose.Schema(
    {
      status: String,
      internalNote: { type: String, select: false },
      ownerId: String,
      contacts: [contact],
      profile: { name: String, secret: String },
      mixed: mongoose.Schema.Types.Mixed,
      labels: { type: Map, of: String },
      records: { type: Map, of: new mongoose.Schema({ email: String, name: String, ssn: String }) },
      dynamic: { type: Map, of: mongoose.Schema.Types.Mixed },
      customer: { type: mongoose.Schema.Types.ObjectId, ref: 'Customer' },
      customers: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Customer' }],
      authorization: String,
      overrides: String,
      meta: { permissions: mongoose.Schema.Types.Mixed, label: String },
    },
    { strict: false, timestamps: true, versionKey: 'revision' },
  );
  schema.add({ addedLater: String });
  schema.virtual('unregistered').get(() => 'not catalogued');
  const getter = vi.fn(() => 'summary');
  const virtuals = {
    summary: { get: getter, dependsOn: ['ownerId'] },
    inactive: { update: { get: getter, dependsOn: ['internalNote'] } },
    contacts: { sub: { badge: { get: getter, dependsOn: ['ssn'] } } },
  };
  const catalog = captureAuthorizationFieldCatalog(schema, virtuals, 'meta.permissions');
  const configuration = {
    catalog,
    virtuals,
    documentPermissionField: 'meta.permissions',
    modelPermissionPrefix: 'doc:',
    permissionSchema: {
      status: { read: true },
      internalNote: { read: false },
      ownerId: false,
      contacts: { read: true, sub: { name: true, email: false, ssn: false, badge: false } },
      profile: { read: true, sub: { name: true, secret: false } },
      summary: false,
    },
    ...over,
  };
  const binding = {
    request: { actor: 'original' } as unknown as ModelRequest,
    runtime: {},
    model: {},
    modelName: 'Order',
  };
  const resolve = (authorization: OutputAuthorization = {}) =>
    resolveServiceAuthorization({
      binding,
      access,
      configuration,
      requestPermissions: permissions,
      authorization,
      applicability: 'output',
    });
  const plan = (select?: Projection, authorization: OutputAuthorization = {}) =>
    planAuthorizedModelProjection({
      authorization: resolve(authorization),
      binding,
      requestedSelect: select,
    });
  return { schema, catalog, getter, configuration, binding, resolve, plan };
}

afterEach(() => {
  mongoose.deleteModel(/^Sva02/);
});

describe('SVA-02 shared effective rules', () => {
  it.each([false, undefined, 'admin'])('server authority wins over request rule %s', async (rule) => {
    const fn = vi.fn(() => false);
    for (const denied of [rule, fn]) {
      const args = {
        path: 'internalNote',
        rules: [denied],
        globalPermissions: permissions,
        outputFields: grant('internalNote').outputFields,
      };
      expect(classifyEffectiveFieldAuthorization(args)).toBe('granted');
      expect(
        await evaluateEffectiveFieldAuthorization({
          ...args,
          req: {},
          docPermissions: { admin: false },
          modelPermissionPrefix: '',
        }),
      ).toBe(true);
    }
    expect(fn).not.toHaveBeenCalled();
  });

  it.each([
    [true, 'granted'],
    [false, 'denied'],
    [undefined, 'denied'],
    ['reader', 'granted'],
    ['admin', 'denied'],
    ['doc:owner', 'deferred'],
    [['admin', 'doc:owner'], 'deferred'],
    ['admin doc:owner', 'denied'],
  ])('classifies %s as %s before fetch', (rule, expected) => {
    expect(
      classifyEffectiveFieldAuthorization({
        path: 'status',
        rules: [rule],
        globalPermissions: permissions,
        modelPermissionPrefix: 'doc:',
      }),
    ).toBe(expected);
  });

  it('defers functions and evaluates with the original actor, permission view and actual grants', async () => {
    const req = { actor: 'original' };
    const docs = { owner: true };
    const rule = vi.fn(function (this: unknown, p, d) {
      expect(this).toBe(req);
      expect(p).toBe(permissions);
      expect(d).toBe(docs);
      return d.owner;
    });
    const args = { path: 'status', rules: [rule], globalPermissions: permissions };
    expect(classifyEffectiveFieldAuthorization(args)).toBe('deferred');
    expect(rule).not.toHaveBeenCalled();
    expect(
      await evaluateEffectiveFieldAuthorization({ ...args, req, docPermissions: docs, modelPermissionPrefix: '' }),
    ).toBe(true);
    expect(rule).toHaveBeenCalledTimes(1);
    expect(
      await evaluateEffectiveFieldAuthorization({
        ...args,
        rules: [
          () => {
            throw new Error('deny');
          },
        ],
        req,
        docPermissions: docs,
        modelPermissionPrefix: '',
      }),
    ).toBe(false);
  });

  it('extracts access by presence and keeps parent gates separate from descendant grants', () => {
    const schema = { contacts: { read: false, sub: { email: { read: 'reader' }, ssn: false } } };
    expect(extractScopedOutputRule(schema, 'contacts', 'read')).toBe(false);
    const rules = extractOutputFieldRules(schema, 'contacts.email', 'read');
    expect(rules).toEqual([false, 'reader']);
    expect(classifyEffectiveFieldAuthorization({ path: 'contacts.email', rules, globalPermissions: permissions })).toBe(
      'denied',
    );
    expect(
      classifyEffectiveFieldAuthorization({
        path: 'contacts.email',
        rules,
        globalPermissions: permissions,
        outputFields: grant('contacts.email').outputFields,
      }),
    ).toBe('granted');
    expect(
      classifyEffectiveFieldAuthorization({
        path: 'contacts',
        rules: [false],
        globalPermissions: permissions,
        outputFields: grant('contacts.email').outputFields,
      }),
    ).toBe('denied');
  });
});

describe('SVA-02 declared schema catalog', () => {
  it('captures schema.paths, child schemas, nested containers, timestamps, select:false and only registered virtuals', () => {
    const f = fixture();
    expect(f.catalog.paths).toEqual(
      expect.arrayContaining([
        'addedLater',
        'createdAt',
        'updatedAt',
        'contacts',
        'contacts.secret',
        'profile',
        'profile.name',
        'internalNote',
        'mixed',
        'records',
        'summary',
        'contacts.badge',
        'authorization',
        'overrides',
      ]),
    );
    for (const path of ['id', 'unregistered', 'revision', 'meta.permissions', '_doc', 'customer.name'])
      expect(f.catalog.paths).not.toContain(path);
    expect(Object.isFrozen(f.catalog)).toBe(true);
    expect(Object.isFrozen(f.catalog.paths)).toBe(true);
    f.schema.add({ afterCapture: String });
    expect(f.catalog.paths).not.toContain('afterCapture');
  });

  it.each(['mixed.safe.deep', 'labels.en', 'records.work.email', 'dynamic.key.deep', 'authorization', 'overrides'])(
    'accepts declared/dynamic path %s',
    (path) => {
      expect(fixture().plan([path], grant(path)).persistedFetchSelection).toContain(path);
    },
  );

  it.each([
    'unknown',
    'records.work.typo',
    'records.work.email.deep',
    'labels.en.deep',
    'customer.email',
    'customers.email',
    'revision',
    'meta',
    'meta.permissions',
    'meta.permissions.key',
    'contacts.sub.email',
    'records.$*.email',
    '-internalNote',
    'mixed.0',
    'mixed.__proto__',
    'mixed.constructor',
    'mixed.$key',
    'mixed.a[0]',
    'summary.child',
  ])('rejects invalid grant %s', (path) => {
    expect(() => fixture().plan([path], grant(path))).toThrow(ServiceAuthorizationError);
  });
});

describe('SVA-02 retained authorization-aware projection', () => {
  it.each([false, undefined])(
    'fetches the selected note with a %s request rule, even without permissionSchema eligibility',
    (rule) => {
      const f = fixture({ permissionSchema: { status: true, ...(rule === undefined ? {} : { internalNote: rule }) } });
      const plan = f.plan(['status', 'internalNote'], grant('internalNote'));
      expect(plan.persistedFetchSelection).toEqual(['status', 'internalNote', '_id']);
      expect(plan.fieldStates).toEqual({ status: 'granted', internalNote: 'granted' });
      expect(plan.authorization).toBeDefined();
      expect(
        readServiceAuthorization(plan.authorization!, plan.authorizationBinding!).authorization.outputFields,
      ).toEqual(grant('internalNote').outputFields);
    },
  );

  it.each(
    ([['status', 'internalNote'], 'status, internalNote', { status: 1, internalNote: 1 }] as Projection[]).map(
      (select) => [select],
    ),
  )('uses normalized inclusion %s', (select) => {
    expect(fixture().plan(select, grant('internalNote')).persistedFetchSelection).toEqual([
      'status',
      'internalNote',
      '_id',
    ]);
  });

  it('does not fetch granted-but-unselected or excluded fields solely for their grants', () => {
    const f = fixture();
    for (const select of [['status'], ['status', 'internalNote', '-internalNote'], { status: 1, internalNote: -1 }]) {
      expect(f.plan(select as Projection, grant('internalNote')).persistedFetchSelection).not.toContain('internalNote');
    }
    expect(f.plan(['-internalNote'], grant('internalNote')).persistedFetchSelection).not.toContain('internalNote');
    expect(f.plan(['unknown'], unrestricted).persistedFetchSelection).toEqual(['_id']);
  });

  it('keeps denied unrelated fields out, defers document rules and fetches only declared hook dependencies', () => {
    const permissionFunction = vi.fn(() => true);
    for (const rule of [true, false, 'doc:owner', permissionFunction]) {
      const f = fixture({ permissionSchema: { status: rule }, alwaysSelectFields: { read: ['ownerId'] } });
      const plan = f.plan(['status', 'internalNote'], grant('internalNote'));
      expect(plan.persistedFetchSelection.includes('status')).toBe(rule !== false);
      expect(plan.persistedFetchSelection).toContain('ownerId');
      expect(plan.persistedFetchSelection).not.toContain('contacts');
      expect(plan.outputSelection).not.toContain('ownerId');
      expect(plan.internalOnlyFields).toContain('ownerId');
    }
    expect(permissionFunction).not.toHaveBeenCalled();
  });

  it('selects additive exact/subtree paths with minimal ancestors and no sibling fetches', () => {
    const f = fixture();
    for (const authority of [grant('contacts.email'), grant('contacts')]) {
      const plan = f.plan(['contacts.email'], authority);
      expect(plan.persistedFetchSelection).toEqual(['contacts.email', '_id', 'contacts._id']);
      expect(plan.minimalAncestorPaths).toEqual(['contacts']);
      expect(plan.childPlans.contacts.outputPersistedFields).toEqual(['email']);
      expect(plan.persistedFetchSelection).not.toContain('contacts');
    }
    const additive = f.plan(['contacts'], grant('contacts.email'));
    expect(additive.persistedFetchSelection).toEqual(expect.arrayContaining(['contacts.email', 'contacts.name']));
    expect(additive.persistedFetchSelection).not.toContain('contacts.ssn');
    const subtree = f.plan(['contacts', '-contacts.ssn', '-contacts.badge'], grant('contacts'));
    expect(subtree.persistedFetchSelection).toContain('contacts.secret');
    expect(subtree.persistedFetchSelection).not.toContain('contacts.ssn');
  });

  it('descendant authority survives denied/missing parent rules without granting siblings', () => {
    for (const permissionSchema of [{ contacts: { read: false, sub: { name: true } } }, {}]) {
      const plan = fixture({ permissionSchema }).plan(['contacts'], grant('contacts.email'));
      expect(plan.persistedFetchSelection).toEqual(['contacts.email', '_id', 'contacts._id']);
      expect(plan.outputPersistedFields).toEqual(['contacts']);
      expect(plan.childPlans.contacts.outputPersistedFields).toEqual(['email']);
    }
  });

  it('expands a named Map-of-subdocument key without inventing other keys or child paths', () => {
    const plan = fixture().plan(['records.work', '-records.work.ssn'], grant('records.work'));
    expect(plan.persistedFetchSelection).toEqual(expect.arrayContaining(['records.work.email', 'records.work.name']));
    expect(plan.persistedFetchSelection).not.toContain('records');
    expect(plan.persistedFetchSelection).not.toContain('records.work.ssn');
    expect(plan.persistedFetchSelection.some((path) => path.includes('$*') || path.startsWith('records.home'))).toBe(
      false,
    );
  });

  it('retains the separate virtual/output/document accesses and projected document-hook inputs', () => {
    const f = fixture({
      permissionSchema: { inactive: { read: false, update: true } },
      alwaysSelectFields: { read: ['ownerId'], update: ['status'] },
    });
    const call = resolveServiceAuthorization({
      binding: f.binding,
      requestPermissions: permissions,
      configuration: f.configuration,
      authorization: grant('inactive'),
      access: { operation: 'upsert', virtualAccess: 'update', outputAccess: 'read', docPermissionsAccess: 'update' },
    });
    const plan = planAuthorizedModelProjection({
      authorization: call,
      binding: f.binding,
      requestedSelect: ['inactive'],
    });
    expect(plan.candidates[0]).toMatchObject({
      name: 'inactive',
      authState: 'granted',
      virtualAccess: 'update',
      outputAccess: 'read',
    });
    expect(plan.persistedFetchSelection).toEqual(expect.arrayContaining(['internalNote', 'ownerId', 'status', '_id']));
    expect(plan.outputPersistedFields).toEqual([]);
    expect(f.getter).not.toHaveBeenCalled();
  });

  it('omitted/empty selection adds named grants; unrestricted includes only declared eligible roots/leaves', () => {
    const f = fixture();
    for (const select of [undefined, [], {}, null]) {
      expect(f.plan(select, grant('internalNote')).persistedFetchSelection).toContain('internalNote');
      expect(f.plan(select, grant()).persistedFetchSelection).not.toContain('internalNote');
    }
    const all = f.plan(undefined, unrestricted);
    expect(all.persistedFetchSelection).toEqual(
      expect.arrayContaining([
        'internalNote',
        'contacts.secret',
        'mixed',
        'records',
        'labels',
        'addedLater',
        'createdAt',
        'meta.label',
      ]),
    );
    for (const path of [
      'revision',
      'unregistered',
      'id',
      'undeclared',
      'meta',
      'meta.permissions',
      'summary',
      'inactive',
      'contacts.badge',
    ])
      expect(all.persistedFetchSelection).not.toContain(path);
    expect(all.outputVirtualNames).toEqual(['summary']);
    expect(f.plan(undefined, grant('mixed.safe.deep')).persistedFetchSelection).toContain('mixed.safe.deep');
    expect(f.plan(undefined, grant('mixed.safe.deep')).persistedFetchSelection).not.toContain('mixed');
  });

  it('preserves requireExplicitSelect and private identity independently from output -_id', () => {
    const f = fixture({ requireExplicitSelect: true });
    expect(f.plan(undefined, unrestricted).persistedFetchSelection).toEqual(['_id']);
    expect(f.plan([], grant('internalNote')).persistedFetchSelection).toContain('internalNote');
    for (const select of [['internalNote', '-_id'], { internalNote: 1, _id: -1 }, 'internalNote -_id']) {
      const plan = f.plan(select as Projection, grant('internalNote'));
      expect(plan.persistedFetchSelection).toEqual(['internalNote', '_id']);
      expect(plan.outputIdExcluded).toBe(true);
      expect(plan.outputSelection).toContain('-_id');
    }
  });

  it('retains declared embedded identity privately while honoring nested output exclusion', () => {
    const plan = fixture().plan(['contacts.email', '-contacts._id', 'profile.name'], grant('contacts.email'));
    expect(plan.persistedFetchSelection).toEqual(expect.arrayContaining(['contacts.email', 'contacts._id', '_id']));
    expect(plan.persistedFetchSelection).not.toContain('profile._id');
    expect(plan.childPlans.contacts.fetchIdRetained).toBe(true);
    expect(plan.childPlans.contacts.outputIdExcluded).toBe(true);
    expect(plan.childPlans.contacts.outputSelection).toContain('-_id');
    // Dynamic eligibility does not declare a system identity at every Map key
    // or every Mixed descendant.
    for (const path of ['mixed.safe.deep', 'labels.en', 'dynamic.key.deep']) {
      expect(fixture().plan([path], grant(path)).persistedFetchSelection).toEqual([path, '_id']);
    }
  });

  it('retains only private container shape for a no-id, zero-dependency embedded virtual', () => {
    const f = fixture({ permissionSchema: {} });
    const schema = new mongoose.Schema({ contacts: [new mongoose.Schema({ secret: String }, { _id: false })] });
    const virtuals = { contacts: { sub: { badge: { get: f.getter, dependsOn: [] } } } };
    const call = resolveServiceAuthorization({
      binding: f.binding,
      access,
      requestPermissions: permissions,
      configuration: { ...f.configuration, virtuals, catalog: captureAuthorizationFieldCatalog(schema, virtuals) },
      authorization: grant('contacts.badge'),
    });
    const plan = planAuthorizedModelProjection({
      authorization: call,
      binding: f.binding,
      requestedSelect: ['contacts.badge'],
    });
    expect(plan.persistedFetchSelection).toEqual(['_id', 'contacts']);
    expect(plan.internalOnlyFields).toContain('contacts');
    expect(plan.depProvenance.contacts).toEqual(['contacts.badge']);
    expect(plan.virtualOnlyDeps).toEqual(['contacts']);
    expect(plan.childPlans.contacts.outputPersistedFields).toEqual([]);
    expect(plan.childPlans.contacts.fetchIdRetained).toBe(false);
    expect(f.getter).not.toHaveBeenCalled();
  });

  it('never runs getters; granted virtuals fetch private dependencies while inactive/unselected virtuals stay out', () => {
    const f = fixture();
    const plan = f.plan(['summary', 'inactive', '-ownerId'], grant('summary', 'inactive'));
    expect(plan.candidates.map((c) => [c.name, c.authState])).toEqual([['summary', 'granted']]);
    expect(plan.persistedFetchSelection).toEqual(['ownerId', '_id']);
    expect(plan.virtualOnlyDeps).toEqual(['ownerId']);
    expect(plan.outputPersistedFields).toEqual([]);
    expect(f.plan(['status'], grant('summary')).persistedFetchSelection).not.toContain('ownerId');
    const child = f.plan(['contacts.badge'], grant('contacts.badge'));
    expect(child.persistedFetchSelection).toEqual(['contacts.ssn', '_id', 'contacts._id']);
    expect(child.childPlans.contacts.candidates[0].authState).toBe('granted');
    expect(child.childPlans.contacts.outputPersistedFields).toEqual([]);
    expect(f.getter).not.toHaveBeenCalled();
  });

  it('internal inputs never become grants and compacts parent/child dependencies without Mongo collisions', () => {
    const f = fixture({ alwaysSelectFields: { read: ['profile', 'summary', 'inactive', 'contacts.badge'] } });
    const plan = planAuthorizedModelProjection({
      authorization: f.resolve(grant('contacts.email')),
      binding: f.binding,
      requestedSelect: ['contacts.email', 'profile.name'],
      internalFetch: {
        joinFields: ['contacts.email', 'contacts'],
        identityFields: ['_id'],
        extraPersistedFields: ['customer', 'inactive'],
      },
    });
    expect(plan.persistedFetchSelection).toEqual(expect.arrayContaining(['profile', 'contacts', 'customer', '_id']));
    expect(plan.persistedFetchSelection).not.toContain('profile.name');
    expect(plan.persistedFetchSelection).not.toContain('contacts.email');
    expect(plan.outputPersistedFields).not.toContain('customer');
    for (const p of plan.persistedFetchSelection)
      expect(plan.persistedFetchSelection.some((q) => p !== q && p.startsWith(`${q}.`))).toBe(false);
    expect(compactPersistedProjection(['a.b', 'a', 'a.c', 'b', 'b'])).toEqual(['a', 'b']);
  });

  it('captures configuration and caller policy before later mutation and authenticates receiver bindings', () => {
    const f = fixture();
    const policy = grant('internalNote');
    const call = f.resolve(policy);
    (policy.outputFields as { paths: string[] }).paths.push('status');
    f.configuration.permissionSchema.status = false as never;
    const plan = planAuthorizedModelProjection({
      authorization: call,
      binding: f.binding,
      requestedSelect: ['status', 'internalNote'],
    });
    expect(plan.fieldStates?.status).toBe('granted');
    expect(() => planAuthorizedModelProjection({ authorization: call, binding: { ...f.binding, model: {} } })).toThrow(
      ServiceAuthorizationError,
    );
  });
});

describe('SVA-02 named model helpers and isolated request admission', () => {
  function helper() {
    const f = fixture();
    const model = mongoose.model(`Sva02Helper${mongoose.modelNames().length}`, f.schema);
    const runtime = new AccessRuntime();
    runtime.registerModelInstance('Order', model);
    runtime.setModelOptions('Order', {
      permissionSchema: f.configuration.permissionSchema as never,
      virtuals: f.configuration.virtuals as never,
    });
    const request = { [PERMISSIONS]: permissions } as unknown as ModelRequest;
    const core = runWithRuntime(runtime, () => new Core(request));
    request.macl = core;
    const service = runWithRuntime(runtime, () => new Base(request, 'Order'));
    return { ...f, core, request, runtime, service };
  }

  it('Core/Base genSelect/genQuerySelect use named policy options without public-wire rejection', async () => {
    const { core, service } = helper();
    const options = { authorization: grant('internalNote') };
    for (const method of ['genSelect', 'genQuerySelect'] as const) {
      expect(await core[method]('Order', 'read', ['status', 'internalNote'], options)).toEqual([
        'status',
        'internalNote',
        '_id',
      ]);
      expect(await service[method]('read', ['status', 'internalNote'], options)).toEqual([
        'status',
        'internalNote',
        '_id',
      ]);
      expect(
        await service[method]('read', ['email'], { authorization: grant('contacts.email'), scopePath: ['contacts'] }),
      ).toEqual(['email', '_id']);
    }
  });

  it.each([
    { baseFields: ['internalNote'] },
    { skipChecks: true },
    { authorization: { rows: { mode: 'unrestricted' } } },
    { authorization: { inputFields: { mode: 'unrestricted' } } },
    { authorization: { subdocuments: {} } },
    { documentAuthorization: {} },
    { scopePath: ['contacts', 'sub'] },
    { scopePath: ['unknown'] },
    null,
  ])('rejects unsupported named helper capability %s', async (options) => {
    const { service } = helper();
    await expect(service.genSelect('read', ['internalNote'], options as never)).rejects.toBeInstanceOf(
      ServiceAuthorizationError,
    );
  });

  it('removes positional admission and keeps the private data selector request-only', async () => {
    const { service } = helper();
    await expect(service.genSelect('read', ['internalNote'], false as never)).rejects.toThrow('have been removed');
    const selected = await service.genSelect('read', ['internalNote']);
    expect(selected).not.toContain('internalNote');
    const rule = vi.fn((p) => p.has('reader'));
    expect(
      await resolveSelectForRequest({
        req: {} as never,
        permissionSchema: { yes: rule, no: false, absent: 'unknown' },
        access: 'read',
        targetFields: ['yes', 'no', 'absent'],
        mode: 'data',
        hasPermission: (p) => permissions.has(p),
        functionArgs: [permissions],
      }),
    ).toEqual(['yes']);
    expect(rule).toHaveBeenCalledWith(permissions);
  });

  it('request-only catalog plans use the same classification as named helpers', () => {
    const f = fixture();
    const plan = planVirtualProjection({
      receivingModelName: 'Order',
      snapshot: f.configuration,
      ...access,
      requestedSelect: ['status', 'internalNote'],
      globalPermissions: permissions,
    });
    expect(plan.persistedFetchSelection).toEqual(['status', '_id']);
  });
});
