import mongoose from 'mongoose';
import { createRequire } from 'node:module';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { AuthorizationBinding, ResolveServiceAuthorizationInput } from '../../src/acl/service-authorization';
import {
  getAuthorizationPermissions,
  readServiceAuthorization,
  resolveServiceAuthorization,
  ServiceAuthorizationError,
} from '../../src/acl/service-authorization';
import { normalizeOutputAuthorizationOptions } from '../../src/acl/output-helper-options';
import {
  assertDocumentStage,
  createDocumentStage,
  readDocumentStage,
  resolveDocumentStage,
} from '../../src/acl/document-stage';
import { createModelOutputContext } from '../../src/output/model-output-context';
import { PERMISSIONS } from '../../src/symbols';
import Permission from '../../src/permission';
import * as rootExports from '../../dist/index.mjs';
import * as advancedExports from '../../dist/advanced.mjs';
import * as processorExports from '../../dist/processors.mjs';
import { ownedStageFixture, quietOutput, stageAccess } from '../support/private/owned-stage-test-fixture';

let sequence = 0;
function fixture() {
  const target = mongoose.model(
    `Oar07aContextTarget${++sequence}`,
    new mongoose.Schema({ name: String, billingEmail: String }),
  );
  const f = ownedStageFixture({
    schema: {
      status: String,
      internalNote: String,
      contacts: [{ email: String, ssn: String }],
      summary: String,
      customer: { type: mongoose.Schema.Types.ObjectId, ref: target.modelName },
      mixed: mongoose.Schema.Types.Mixed,
      authorization: String,
      overrides: String,
    },
    configuration: {
      documentPermissionField: 'meta.permissions',
      catalog: {
        paths: [
          'status',
          'ownerId',
          'internalNote',
          'contacts',
          'contacts.email',
          'contacts.ssn',
          'summary',
          'customer',
          'mixed',
          'authorization',
          'overrides',
          '_id',
        ],
        opaquePaths: ['mixed'],
        referencePaths: ['customer'],
        protectedPaths: ['version', 'execution'],
      },
      docPermissions: { read: { dependsOn: ['ownerId'], get: (doc) => ({ owner: doc.ownerId === 'actor' }) } },
      permissionSchema: { status: { read: 'owner' } },
    },
  });
  f.runtime.registerModelInstance(target.modelName, target);
  const targetConfiguration = { catalog: { paths: ['name', 'billingEmail'] } };
  const input: ResolveServiceAuthorizationInput = {
    ...f.input,
    relatedTargets: [
      { path: 'customer', modelName: target.modelName, model: target, configuration: targetConfiguration },
    ],
  };
  return { ...f, target, input };
}

function badRequest(run: () => unknown) {
  let caught: unknown;
  try {
    run();
  } catch (error) {
    caught = error;
  }
  expect(caught).toBeInstanceOf(ServiceAuthorizationError);
  expect((caught as ServiceAuthorizationError).result).toMatchObject({
    success: false,
    kind: 'error',
    code: 'bad_request',
  });
}

afterEach(() => {
  vi.restoreAllMocks();
  mongoose.deleteModel(/^Oar07aContext/);
});

describe('owned private call policy and separate authority dimensions', () => {
  it('captures native policy/configuration once without replacing the original actor or exposing mutable backing storage', () => {
    const f = fixture();
    const paths = ['internalNote'];
    const filter = {
      tenant: ['backend'],
      when: new Date(10),
      bytes: Buffer.from([1]),
      id: new mongoose.mongo.BSON.ObjectId(),
      decimal: mongoose.mongo.BSON.Decimal128.fromString('1.20'),
      long: mongoose.mongo.BSON.Long.fromNumber(4),
    };
    const config = { ...f.input.configuration, map: new Map([['key', { enabled: true }]]) };
    const authorization = {
      rows: { mode: 'scope', filter },
      outputFields: { mode: 'grant', paths },
      related: { customer: { model: f.target.modelName, outputFields: { mode: 'grant', paths: ['billingEmail'] } } },
    };
    const call = resolveServiceAuthorization({ ...f.input, configuration: config, authorization });
    const actor = f.request,
      permissionObject = f.request[PERMISSIONS];
    paths.push('status');
    filter.tenant.push('other');
    filter.when.setTime(30);
    filter.bytes[0] = 9;
    filter.id.id = Buffer.alloc(12, 1);
    filter.decimal.bytes[0] ^= 255;
    filter.long.low = 20;
    config.map.get('key')!.enabled = false;
    authorization.related.customer.outputFields.paths.push('name');
    (config.docPermissions as { read: { dependsOn: string[] } }).read.dependsOn.push('secret');
    const captured = readServiceAuthorization(call, f.binding);
    expect(captured.authorization.outputFields).toEqual({ mode: 'grant', paths: ['internalNote'] });
    expect(captured.authorization.related.customer.outputFields).toEqual({ mode: 'grant', paths: ['billingEmail'] });
    const held = (captured.authorization.rows as { filter: typeof filter }).filter;
    expect(held.tenant).toEqual(['backend']);
    expect(held.when.getTime()).toBe(10);
    expect(held.bytes[0]).toBe(1);
    expect(held.id.equals(filter.id)).toBe(false);
    expect(held.decimal.toString()).toBe('1.20');
    expect(held.long.toNumber()).toBe(4);
    expect((captured.configuration.map as Map<string, { enabled: boolean }>).get('key')).toEqual({ enabled: true });
    expect(captured.configuration.docPermissions).toMatchObject({ read: { dependsOn: ['ownerId'] } });
    const observe = vi.spyOn(Date.prototype, 'getTime');
    for (let repeat = 0; repeat < 8; repeat++) expect(readServiceAuthorization(call, f.binding)).toBe(captured);
    expect(observe).not.toHaveBeenCalled();
    expect(Object.isFrozen(captured.authorization)).toBe(true);
    expect(Object.isFrozen((captured.authorization.outputFields as { paths: string[] }).paths)).toBe(true);
    expect(getAuthorizationPermissions(call, f.binding).has('admin')).toBe(false);
    expect(getAuthorizationPermissions(call, f.binding)).not.toHaveProperty('permissions');
    expect(f.request).toBe(actor);
    expect(f.request[PERMISSIONS]).toBe(permissionObject);
  });

  it('overlapping calls on one receiver do not inherit backend elevation or a replaced request actor', () => {
    const f = fixture();
    const first = resolveServiceAuthorization({
      ...f.input,
      authorization: { rows: { mode: 'unrestricted' }, outputFields: { mode: 'unrestricted' } },
    });
    const next = resolveServiceAuthorization(f.input);
    f.request[PERMISSIONS] = new Permission({ admin: true });
    expect(readServiceAuthorization(first, f.binding).authorization.outputFields.mode).toBe('unrestricted');
    expect(readServiceAuthorization(next, f.binding).authorization).toEqual({
      rows: { mode: 'request' },
      outputFields: { mode: 'request' },
      inputFields: { mode: 'request' },
      related: {},
    });
    expect(getAuthorizationPermissions(first, f.binding).has('admin')).toBe(false);
    expect(getAuthorizationPermissions(next, f.binding).has('admin')).toBe(false);
    expect(getAuthorizationPermissions(next, f.binding).hasKey('admin')).toBe(true);
    expect(Object.isFrozen(getAuthorizationPermissions(next, f.binding).keys)).toBe(true);
  });

  it.each([
    null,
    true,
    'unrestricted',
    [],
    { inputFields: undefined },
    { subdocuments: {} },
    { operation: { mode: 'grant' } },
    { extra: true },
    { rows: null },
    { rows: { mode: 'wrong' } },
    { rows: { mode: 'request', filter: {} } },
    { rows: { mode: 'scope' } },
    { rows: { mode: 'scope', filter: null } },
    { rows: { mode: 'scope', filter: undefined } },
    { rows: { mode: 'scope', filter: true } },
    { rows: { mode: 'scope', filter: [] } },
    { outputFields: null },
    { outputFields: { mode: 'wrong' } },
    { outputFields: { mode: 'grant' } },
    { outputFields: { mode: 'grant', paths: 'status' } },
    { outputFields: { mode: 'request', paths: [] } },
    { outputFields: { mode: 'grant', paths: [undefined] } },
    { related: null },
  ])('rejects malformed/unsupported policy before any execution: %j', (authorization) => {
    const f = fixture();
    badRequest(() => resolveServiceAuthorization({ ...f.input, authorization }));
    expect(f.adapter.find).not.toHaveBeenCalled();
  });

  it.each([
    '',
    '-status',
    '+status',
    'contacts.sub.email',
    'contacts..email',
    'contacts.0.email',
    'contacts[0].email',
    'contacts.*',
    'contacts.$email',
    'contacts.__proto__.email',
    'constructor',
    'prototype.x',
    ' status',
    '_doc',
    '__v',
    'meta',
    'meta.permissions',
    'meta.permissions.owner',
    'version',
    'execution.token',
    'customer.billingEmail',
    'unknown',
  ])('rejects unsafe/protected/out-of-catalog output grant path %s', (path) => {
    const f = fixture();
    badRequest(() =>
      resolveServiceAuthorization({ ...f.input, authorization: { outputFields: { mode: 'grant', paths: [path] } } }),
    );
  });

  it('accepts false/empty inert row scopes, empty field grants, declared subtrees and business control-word paths', () => {
    const f = fixture();
    for (const filter of [false, {}, { note: { $$sq: { model: 'inert' } }, date: { $$date: 'inert' } }]) {
      const call = resolveServiceAuthorization({
        ...f.input,
        authorization: { rows: { mode: 'scope', filter }, outputFields: { mode: 'grant', paths: [] } },
      });
      expect(readServiceAuthorization(call, f.binding).authorization.rows).toEqual({ mode: 'scope', filter });
    }
    const paths = ['contacts', 'contacts.email', 'mixed.safe.branch', 'summary', 'authorization', 'overrides', '_id'];
    const call = resolveServiceAuthorization({ ...f.input, authorization: { outputFields: { mode: 'grant', paths } } });
    expect(readServiceAuthorization(call, f.binding).authorization.outputFields).toEqual({ mode: 'grant', paths });
  });

  it('rejects cycles, unsupported policies, protected keys and accessors without calling application code', () => {
    const cyclic: any = {};
    cyclic.related = cyclic;
    const getter = vi.fn(() => ({ mode: 'unrestricted' }));
    const f = fixture();
    for (const authorization of [
      cyclic,
      { rows: { mode: 'scope', filter: { self: cyclic } } },
      { outputFields: new Map() },
      { rows: { mode: 'scope', filter: { value: () => true } } },
      JSON.parse('{"related":{"__proto__":{"model":"Customer"}}}'),
      Object.defineProperty({}, 'rows', { enumerable: true, get: getter }),
    ])
      badRequest(() => resolveServiceAuthorization({ ...f.input, authorization }));
    expect(getter).not.toHaveBeenCalled();
  });

  it('bounds recursive/sparse policy inputs and accepts shared acyclic values', () => {
    const f = fixture();
    let nested: unknown = {};
    for (let index = 0; index < 110; index++) nested = { nested };
    badRequest(() =>
      resolveServiceAuthorization({ ...f.input, authorization: { rows: { mode: 'scope', filter: nested } } }),
    );
    badRequest(() =>
      resolveServiceAuthorization({
        ...f.input,
        authorization: { outputFields: { mode: 'grant', paths: new Array(20001) } },
      }),
    );
    const shared = { mode: 'request' };
    const call = resolveServiceAuthorization({ ...f.input, authorization: { rows: shared, outputFields: shared } });
    expect(readServiceAuthorization(call, f.binding).authorization.outputFields.mode).toBe('request');
  });

  it('captures nested target catalogs/policy and never treats parent output elevation as target authority', () => {
    const f = fixture();
    const office = mongoose.model(`Oar07aContextOffice${sequence}`, new mongoose.Schema({ address: String }));
    f.runtime.registerModelInstance(office.modelName, office);
    const target = {
      ...f.input.relatedTargets![0],
      relatedTargets: [
        {
          path: 'office',
          modelName: office.modelName,
          model: office,
          configuration: { catalog: { paths: ['address'] } },
        },
      ],
    };
    const policy = {
      outputFields: { mode: 'unrestricted' },
      related: {
        customer: {
          model: f.target.modelName,
          related: {
            office: {
              model: office.modelName,
              operation: { mode: 'grant' },
              rows: { mode: 'scope', filter: { region: 'backend' } },
              outputFields: { mode: 'grant', paths: ['address'] },
            },
          },
        },
      },
    };
    const call = resolveServiceAuthorization({ ...f.input, relatedTargets: [target], authorization: policy });
    target.relatedTargets[0].configuration.catalog.paths.push('other');
    policy.related.customer.related.office.rows.filter.region = 'changed';
    const captured = readServiceAuthorization(call, f.binding);
    expect(captured.relatedTargets[0].relatedTargets![0].configuration.catalog.paths).toEqual(['address']);
    expect(captured.authorization.related.customer.outputFields).toEqual({ mode: 'request' });
    expect(captured.authorization.related.customer.related.office.rows).toEqual({
      mode: 'scope',
      filter: { region: 'backend' },
    });
  });

  it('checks exact related target names/nesting/catalogs/count applicability', () => {
    const f = fixture();
    for (const related of [
      { typo: { model: f.target.modelName } },
      { customer: { model: 'Other' } },
      { customer: { model: '' } },
      { customer: { model: f.target.modelName, inputFields: {} } },
      { customer: { model: f.target.modelName, operation: { mode: 'unrestricted' } } },
      { customer: { model: f.target.modelName, outputFields: { mode: 'grant', paths: ['internalNote'] } } },
      { customer: { model: f.target.modelName, related: { unused: { model: 'Other' } } } },
    ])
      badRequest(() => resolveServiceAuthorization({ ...f.input, authorization: { related } }));
    const authorization = {
      outputFields: { mode: 'unrestricted' },
      related: { customer: { model: f.target.modelName } },
    };
    const call = resolveServiceAuthorization({ ...f.input, authorization });
    expect(readServiceAuthorization(call, f.binding).authorization.related.customer).toMatchObject({
      operation: { mode: 'request' },
      rows: { mode: 'request' },
      outputFields: { mode: 'request' },
    });
    badRequest(() =>
      resolveServiceAuthorization({
        ...f.input,
        relatedTargets: [...f.input.relatedTargets!, ...f.input.relatedTargets!],
        authorization,
      }),
    );
    badRequest(() =>
      resolveServiceAuthorization({
        ...f.input,
        relatedTargets: [{ ...f.input.relatedTargets![0], kind: 'count' }],
        authorization: { related: { customer: { model: f.target.modelName, outputFields: { mode: 'request' } } } },
      }),
    );
  });

  it('rejects wrong method authority dimensions even when undefined/request-only', () => {
    const f = fixture();
    for (const applicability of ['create', 'output'] as const)
      for (const rows of [undefined, { mode: 'request' }])
        badRequest(() => resolveServiceAuthorization({ ...f.input, applicability, authorization: { rows } }));
    badRequest(() =>
      resolveServiceAuthorization({ ...f.input, applicability: 'output', authorization: { related: {} } }),
    );
  });

  it.each(['request', 'runtime', 'model', 'modelName', 'scopePath'] as const)(
    'authenticates captured call %s on every private read',
    (key) => {
      const f = fixture();
      const call = resolveServiceAuthorization(f.input);
      const binding = {
        ...f.binding,
        [key]: key === 'scopePath' ? ['contacts'] : key === 'modelName' ? 'Other' : {},
      } as AuthorizationBinding;
      badRequest(() => readServiceAuthorization(call, binding));
      badRequest(() => readServiceAuthorization({ ...call }, f.binding));
    },
  );
});

describe('diagnostics are not document, input or output capabilities', () => {
  it('immutable diagnostics cannot change owning facts or reveal a source/native/lifecycle alias', async () => {
    const f = fixture();
    const maps = { owner: true, private: true };
    const stage = await f.stage({ _id: 'same', ownerId: 'original' }, maps);
    maps.owner = false;
    const facts = readDocumentStage(stage, f.binding).grants;
    const context = createModelOutputContext({ modelName: f.model.modelName, ...stageAccess(), docPermissions: facts });
    expect(context.docPermissions).toBe(facts);
    expect(Reflect.set(context.docPermissions, 'owner', false)).toBe(false);
    expect(Object.isFrozen(context)).toBe(true);
    for (const name of [
      'documentAuthorization',
      'getDocumentAuthorization',
      'originalDocumentSnapshot',
      'finalDocumentSnapshot',
      'currentDocument',
      'mongooseModel',
      'allowedData',
    ])
      expect(context).not.toHaveProperty(name);
    expect(readDocumentStage(stage, f.binding).grants.owner).toBe(true);
    expect(Object.isFrozen(maps)).toBe(false);
  });

  it('pre/post/effective-access stages on an equal source cannot impersonate each other', async () => {
    const f = fixture();
    const source = { _id: 'same', ownerId: 'original' };
    const before = await f.stage(source, { owner: true });
    const afterCall = f.ownCall({
      access: { ...stageAccess('update'), outputAccess: 'read' },
      readResponse: false,
      parent: f.call,
    });
    const after = createDocumentStage(afterCall, f.binding, source);
    await resolveDocumentStage(after, () => ({ owner: false }));
    badRequest(() => assertDocumentStage(before, afterCall, f.binding));
    badRequest(() => assertDocumentStage(after, f.call, f.binding));
    expect(readDocumentStage(before, f.binding).grants.owner).toBe(true);
    expect(readDocumentStage(after, f.binding).grants.owner).toBe(false);
  });

  it('normalizes only fresh output policies and rejects every handle/raw mixture and legacy bypass slot', () => {
    const f = fixture();
    const normalized = normalizeOutputAuthorizationOptions(
      f.input,
      { authorization: { outputFields: { mode: 'grant', paths: ['internalNote'] } }, purpose: 'output' },
      'output',
    );
    expect(readServiceAuthorization(normalized.authorization, f.binding).authorization.outputFields).toEqual({
      mode: 'grant',
      paths: ['internalNote'],
    });
    for (const options of [
      { documentAuthorization: undefined },
      { documentAuthorization: {}, authorization: {} },
      { documentAuthorization: {}, scopePath: [] },
      { baseFields: ['internalNote'] },
      { skipChecks: true },
      { authorization: { rows: { mode: 'request' } } },
      { authorization: { related: {} } },
      { scopePath: null },
      { scopePath: ['contacts', 'sub'] },
      { scopePath: ['contacts.email'] },
    ])
      badRequest(() => normalizeOutputAuthorizationOptions(f.input, options));
    badRequest(() => normalizeOutputAuthorizationOptions(f.input, {}, 'output'));
  });

  it.each(['index', 'advanced', 'processors'] as const)(
    '%s ESM/CJS exports no stage, capture, issuer or reusable DTO authority',
    (entry) => {
      const esm = entry === 'index' ? rootExports : entry === 'advanced' ? advancedExports : processorExports;
      const cjs = createRequire(import.meta.url)(`../../dist/${entry}.js`);
      for (const exports of [esm, cjs])
        for (const name of [
          'resolveServiceAuthorization',
          'createServiceExecution',
          'captureAuthorizationPermissions',
          'prepareQueryDocumentStage',
          'createDocumentStage',
          'resolveDocumentStage',
          'memoizeStageFieldDecision',
          'createPublicationRowBudget',
          'createDocumentAuthorizationStage',
          'associateDocumentAuthorization',
          'DocumentAuthorization',
          'ResolvedServiceAuthorization',
          'ServiceExecutionContext',
          'unchangedBsonPrototype',
          'canonicalBsonFields',
          'canonicalBsonBytes',
          'copyCanonicalBsonValue',
        ])
          expect(exports).not.toHaveProperty(name);
    },
  );
});
