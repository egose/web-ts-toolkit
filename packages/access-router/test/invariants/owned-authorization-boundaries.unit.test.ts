import mongoose from 'mongoose';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { Core } from '../../src/core';
import { DataCore } from '../../src/core-data';
import { Base } from '../../src/services/base';
import Permission from '../../src/permission';
import { AccessRuntime } from '../../src/runtime';
import { runWithRuntime } from '../../src/runtime-context';
import { PERMISSIONS } from '../../src/symbols';
import type {
  DocumentGrants,
  ModelHookContext,
  ModelOutputContext,
  ModelRequest,
  PermissionSchema,
} from '../../src/interfaces';
import { EMPTY_DOCUMENT_GRANTS, normalizeDocumentGrants } from '../../src/acl/document-grants';
import { authorizationError } from '../../src/acl/authorization-snapshot';
import {
  getAuthorizationPermissions,
  readServiceAuthorization,
  resolveServiceAuthorization,
} from '../../src/acl/service-authorization';
import { captureModelAuthorizationConfiguration } from '../../src/acl/model-output-planning';
import {
  createDocumentStage,
  memoizeStageFieldDecision,
  readDocumentStage,
  resolveDocumentStage,
} from '../../src/acl/document-stage';
import { evaluateAuthorizedOutputField, resolveOutputDocumentStage } from '../../src/acl/output-field-filter';
import { requestInputFields, resolveInputDocumentGrants } from '../../src/acl/model-input-admission';
import { resolveSelectForRequest } from '../../src/acl/select-resolution';
import { resolveAuthorizedAccessFilter } from '../../src/acl/filter-resolution';
import { evaluateScopedAccessRule, evaluateScopedAccessRuleValue } from '../../src/acl/field-authorization';
import { planAuthorizedModelProjection } from '../../src/acl/output-projection';
import { createModelOutputContext } from '../../src/output/model-output-context';
import { finalizeModelOutput } from '../../src/output/finalize-model-output';
import * as documentHelpers from '../../src/helpers/document';
import { deferred } from '../support/public/hook-admission-fixture';

let serial = 0;
const access = {
  operation: 'read',
  rowAccess: 'read',
  virtualAccess: 'read',
  outputAccess: 'read',
  docPermissionsAccess: 'read',
};

function fixture(hook?: unknown, active = false) {
  const runtime = new AccessRuntime();
  const warn = vi.fn();
  runtime.setGlobalOptions({ logger: { warn } });
  const model = mongoose.model(
    `OwnedBoundary${++serial}`,
    new mongoose.Schema({ name: String, allowed: String, denied: String, children: [{ name: String }] }),
  );
  runtime.registerModelInstance(model.modelName, model);
  runtime.setModelOptions(model.modelName, {
    permissionSchema: { name: true, allowed: true, denied: false },
    stripPermissionsField: true,
    readAuthorizationMode: active ? 'trusted' : 'isolated',
  });
  // The matrix deliberately supplies untyped hook returns, including invalid JS.
  runtime.setModelOption(model.modelName, 'docPermissions', { read: hook, update: hook } as never);
  const actor = new Permission({ reader: true, denied: false });
  const request = { _permissions: { reader: true, denied: false }, [PERMISSIONS]: actor } as unknown as ModelRequest;
  const core = runWithRuntime(runtime, () => new Core(request));
  request.macl = core;
  const base = runWithRuntime(runtime, () => new Base(request, model.modelName));
  const binding = { request, runtime, model, modelName: model.modelName };
  const configuration = captureModelAuthorizationConfiguration(runtime, model.modelName);
  const authorization = resolveServiceAuthorization({
    binding,
    configuration,
    requestPermissions: actor,
    access,
    readResponse: true,
  });
  const snapshot = { name: 'visible', allowed: 'yes', denied: 'secret' };
  const context = createModelOutputContext({ modelName: model.modelName, ...access });
  warn.mockClear();
  return { runtime, warn, model, actor, request, core, base, binding, configuration, authorization, snapshot, context };
}

type Fixture = ReturnType<typeof fixture>;
const lanes = ['output', 'input', 'core', 'base', 'finalizer-isolated', 'finalizer-trusted'] as const;
type Lane = (typeof lanes)[number];

async function invokeLane(f: Fixture, lane: Lane): Promise<DocumentGrants> {
  return runWithRuntime(f.runtime, async () => {
    if (lane === 'output') {
      const handle = await resolveOutputDocumentStage(f);
      return readDocumentStage(handle, f.binding).grants;
    }
    if (lane === 'input')
      return resolveInputDocumentGrants({
        ...f,
        doc: f.snapshot,
        context: { modelName: f.model.modelName, mongooseModel: f.model, operation: 'update' },
      });
    if (lane === 'core') return f.core.genDocPermissions(f.model.modelName, f.snapshot, 'read', f.context);
    if (lane === 'base') return f.base.genDocPermissions(f.snapshot, 'read', f.context);
    let seen: DocumentGrants = EMPTY_DOCUMENT_GRANTS;
    const permissionSchema: PermissionSchema = {
      name: (_permissions, grants) => {
        seen = grants;
        return true;
      },
    };
    const snapshot = {
      ...captureModelAuthorizationConfiguration(f.runtime, f.model.modelName),
      permissionSchema,
      readAuthorizationMode: lane === 'finalizer-trusted' ? ('trusted' as const) : ('isolated' as const),
    };
    const authorization = resolveServiceAuthorization({
      binding: f.binding,
      configuration: snapshot,
      requestPermissions: f.actor,
      access,
      readResponse: true,
    });
    const plan = planAuthorizedModelProjection({
      authorization,
      binding: f.binding,
      requestedSelect: ['name', '-_id'],
    });
    await finalizeModelOutput({
      receivingModelName: f.model.modelName,
      request: f.request,
      plan,
      ...access,
      input: f.snapshot,
      context: f.context,
    });
    return seen;
  });
}

afterEach(() => {
  vi.restoreAllMocks();
  mongoose.deleteModel(/^OwnedBoundary/);
});

describe('OAR-02 fulfilled-result and utility boundaries', () => {
  it.each(lanes)('document hooks receive frozen empty facts before resolution in %s', async (lane) => {
    let contextFacts: unknown;
    const f = fixture((_doc: unknown, _permissions: Permission, context: ModelHookContext) => {
      contextFacts = context.docPermissions;
      return { owner: true };
    });
    expect(await invokeLane(f, lane)).toEqual({ owner: true });
    expect(contextFacts).toBe(EMPTY_DOCUMENT_GRANTS);
    expect(f.warn).not.toHaveBeenCalled();
  });

  it.each(lanes)('normalizes genuine async fulfillment in %s', async (lane) => {
    const raw = { owner: true, suspended: false };
    const f = fixture(() => Promise.resolve(raw));
    const facts = await invokeLane(f, lane);
    expect(facts).toEqual(raw);
    expect(facts).not.toBe(raw);
    expect(Object.isFrozen(facts)).toBe(true);
    expect(Object.getPrototypeOf(facts)).toBe(null);
    expect(Object.isFrozen(raw)).toBe(false);
    raw.owner = false;
    expect(facts.owner).toBe(true);
    expect(f.warn).not.toHaveBeenCalled();
  });

  it.each(lanes)('does not swallow an invalid async fulfillment in %s', async (lane) => {
    const hook = vi.fn(() => Promise.resolve({ owner: true, rich: new Date(0) }));
    const f = fixture(hook);
    await expect(invokeLane(f, lane)).rejects.toMatchObject({ result: { code: 'bad_request' } });
    expect(hook).toHaveBeenCalledTimes(1);
    expect(f.warn).not.toHaveBeenCalled();
  });

  it.each(lanes)('rejects an accessor then without assimilation in %s', async (lane) => {
    const observe = vi.fn();
    const raw = Object.defineProperty({ owner: true }, 'then', { get: observe });
    const f = fixture(() => raw);
    await expect(invokeLane(f, lane)).rejects.toMatchObject({ result: { code: 'bad_request' } });
    expect(observe).not.toHaveBeenCalled();
    expect(f.warn).not.toHaveBeenCalled();
  });

  it.each(lanes)('uses empty facts and one fixed warning for a rejection in %s', async (lane) => {
    const inspect = vi.fn(() => {
      throw new Error('must not inspect');
    });
    const error = Object.defineProperties({}, { message: { get: inspect }, toString: { value: inspect } });
    const f = fixture(() => Promise.reject(error));
    f.warn.mockImplementation(() => {
      throw new Error('logger failed');
    });
    expect(await invokeLane(f, lane)).toBe(EMPTY_DOCUMENT_GRANTS);
    expect(inspect).not.toHaveBeenCalled();
    expect(f.warn).toHaveBeenCalledTimes(1);
    expect(f.warn.mock.calls[0]).toEqual([
      'docPermissions hook failed; applying empty document permissions',
      expect.objectContaining({ modelName: f.model.modelName }),
    ]);
    expect(f.warn.mock.calls[0][1]).not.toHaveProperty('error');
  });

  it('does not turn a controlled utility admission error into an empty map or rerun the hook', async () => {
    const f = fixture(() => ({ owner: true }));
    const utility = vi
      .spyOn(f.core, 'genDocPermissions')
      .mockImplementation(async () => authorizationError('fixture invalid facts'));
    await expect(invokeLane(f, 'core')).rejects.toMatchObject({ result: { code: 'bad_request' } });
    expect(utility).toHaveBeenCalledTimes(1);
    expect(f.warn).not.toHaveBeenCalled();
  });

  it.each(['function', 'map', 'set', 'boxed', 'BSON', 'thenable', 'revoked proxy'] as const)(
    'rejects %s without native/coercion/then work',
    async (kind) => {
      const observe = vi.fn();
      const revoked = Proxy.revocable({ owner: true }, { get: observe, getPrototypeOf: observe, ownKeys: observe });
      revoked.revoke();
      const raw =
        kind === 'function'
          ? observe
          : kind === 'map'
            ? new Map([['owner', true]])
            : kind === 'set'
              ? new Set(['owner'])
              : kind === 'boxed'
                ? Object.assign(new Boolean(true), { valueOf: observe })
                : kind === 'BSON'
                  ? { owner: new mongoose.mongo.BSON.ObjectId() }
                  : kind === 'thenable'
                    ? { owner: true, then: observe }
                    : revoked.proxy;
      await expect(Promise.resolve().then(() => normalizeDocumentGrants(raw))).rejects.toMatchObject({
        result: { code: 'bad_request' },
      });
      expect(observe).not.toHaveBeenCalled();
    },
  );
});

describe('OAR-02 request-only evaluations and independent pre-write facts', () => {
  it.each(['allowed', 'pick', 'select'] as const)(
    'DataCore %s passes the singleton frozen empty facts and original request',
    async (method) => {
      const f = fixture();
      const rule = vi.fn(function (this: ModelRequest, permissions: Permission, grants: DocumentGrants) {
        expect(this).toBe(f.request);
        expect(permissions).toBe(f.actor);
        expect(grants).toBe(EMPTY_DOCUMENT_GRANTS);
        return permissions.has('reader') && !grants.suspended;
      });
      f.runtime.setDataOptions('OwnedBoundaryData', { permissionSchema: { name: { read: rule }, denied: false } });
      const core = runWithRuntime(f.runtime, () => new DataCore(f.request));
      const output = await runWithRuntime(f.runtime, () =>
        method === 'allowed'
          ? core.genAllowedFields('OwnedBoundaryData', f.snapshot, 'read')
          : method === 'pick'
            ? core.pickAllowedFields('OwnedBoundaryData', f.snapshot, 'read')
            : core.genSelect('OwnedBoundaryData', 'read', ['name', 'denied']),
      );
      expect(output).toEqual(method === 'pick' ? { name: 'visible' } : ['name']);
      expect(rule).toHaveBeenCalledTimes(1);
    },
  );

  it('create and raw-input selection get empty facts, not serialized document metadata', async () => {
    const f = fixture(() => ({ suspended: true }));
    const seen: DocumentGrants[] = [];
    const rule = (permissions: Permission, grants: DocumentGrants) => {
      seen.push(grants);
      return permissions.has('reader') && !grants.suspended;
    };
    f.runtime.setModelOptions(f.model.modelName, { permissionSchema: { name: { create: rule } } });
    const authorization = resolveServiceAuthorization({
      binding: f.binding,
      requestPermissions: f.actor,
      configuration: captureModelAuthorizationConfiguration(f.runtime, f.model.modelName),
      access: { operation: 'create', virtualAccess: 'create', outputAccess: 'read', docPermissionsAccess: 'create' },
      applicability: 'create',
    });
    expect(await requestInputFields({ authorization, binding: f.binding, access: 'create' })).toEqual(['name']);
    expect(
      await resolveSelectForRequest({
        req: f.request,
        permissionSchema: { name: { create: rule } },
        access: 'create',
        mode: 'model',
        targetFields: ['name'],
        hasPermission: (key) => f.actor.has(key),
        functionArgs: [f.actor],
      }),
    ).toContain('name');
    expect(seen).toEqual([EMPTY_DOCUMENT_GRANTS, EMPTY_DOCUMENT_GRANTS]);
  });

  it.each(['core', 'base'] as const)(
    '%s standalone output evaluation uses empty facts and never invokes a document hook',
    async (kind) => {
      const hook = vi.fn(() => ({ owner: true, suspended: true }));
      const f = fixture(hook);
      const seen: DocumentGrants[] = [];
      f.runtime.setModelOptions(f.model.modelName, {
        permissionSchema: {
          name: (permissions, grants) => {
            seen.push(grants);
            return permissions.has('reader') && !grants.suspended;
          },
          allowed: 'doc:owner',
          denied: false,
        },
        modelPermissionPrefix: 'doc:',
      });
      const raw = { ...f.snapshot, _permissions: { owner: true, suspended: true } };
      const result =
        kind === 'core'
          ? await f.core.pickAllowedFields(f.model.modelName, raw, 'read')
          : await f.base.pickAllowedFields(raw, 'read');
      expect(result).toEqual({ name: 'visible' });
      expect(seen).toEqual([EMPTY_DOCUMENT_GRANTS]);
      expect(hook).not.toHaveBeenCalled();
    },
  );

  it.each(['root', 'children'] as const)(
    '%s input retains positive AND and negative pre-write predicates, independent of post-write facts',
    async (scope) => {
      const returned = { owner: true, suspended: true };
      const f = fixture(() => returned);
      const schema = {
        name: { update: (_permissions: Permission, grants: DocumentGrants) => !grants.suspended },
        allowed: { update: 'reader doc:owner' },
        denied: { update: 'absent doc:owner' },
      };
      const configuration = {
        ...f.configuration,
        permissionSchema: scope === 'root' ? schema : { children: { sub: schema } },
        modelPermissionPrefix: 'doc:',
      };
      const authorization = resolveServiceAuthorization({
        binding: f.binding,
        requestPermissions: f.actor,
        configuration,
        access: { operation: 'update', virtualAccess: 'update', outputAccess: 'read', docPermissionsAccess: 'update' },
        applicability: 'mutation',
      });
      const hydrated = new f.model({ name: 'original' });
      const before = await resolveInputDocumentGrants({ ...f, authorization, doc: hydrated });
      returned.suspended = false;
      returned.owner = false;
      const afterHandle = await runWithRuntime(f.runtime, () => resolveOutputDocumentStage({ ...f, authorization }));
      const after = readDocumentStage(afterHandle, f.binding).grants;
      expect(before).toEqual({ owner: true, suspended: true });
      expect(after).toEqual({ owner: false, suspended: false });
      expect(after).not.toBe(before);
      expect(
        await requestInputFields({
          authorization,
          binding: f.binding,
          access: 'update',
          grants: before,
          scopePath: scope === 'children' ? scope : undefined,
        }),
      ).toEqual(['allowed']);
    },
  );
});

describe('OAR-02 actor, configuration and actual fact-copy work', () => {
  it.each(['core', 'finalizer-isolated'] as const)(
    '%s treats a bare function as a leaf without observing attached option getters',
    async (lane) => {
      const replacement = vi.fn(() => ({ owner: false }));
      const observe = vi.fn(() => replacement);
      const bare = vi.fn(() => ({ owner: true }));
      Object.defineProperty(bare, 'read', { get: observe });
      const f = fixture();
      f.runtime.setModelOption(f.model.modelName, 'docPermissions', bare);
      expect(await invokeLane(f, lane)).toEqual({ owner: true });
      expect(bare).toHaveBeenCalledTimes(1);
      expect(observe).not.toHaveBeenCalled();
      expect(replacement).not.toHaveBeenCalled();
    },
  );

  it.each([false, true])(
    'embedded scopes share only owning facts and related targets resolve their own facts with trusted source=%s',
    async (active) => {
      const f = fixture(() => ({ owner: true }), active);
      const hook = vi.fn(() => ({ owner: false }));
      const schema = { name: (_permissions: Permission, grants: DocumentGrants) => grants.owner };
      const parent = await runWithRuntime(f.runtime, () => resolveOutputDocumentStage(f));
      const configuration = { ...f.configuration, permissionSchema: { children: { read: true, sub: schema } } };
      const childBinding = { ...f.binding, scopePath: ['children'] };
      const childCall = resolveServiceAuthorization({
        binding: childBinding,
        parent: f.authorization,
        requestPermissions: f.actor,
        configuration,
        access,
      });
      const child = await runWithRuntime(f.runtime, () =>
        resolveOutputDocumentStage({
          ...f,
          authorization: childCall,
          binding: childBinding,
          owningDocument: parent,
          owningBinding: f.binding,
        }),
      );
      expect(readDocumentStage(child, childBinding).grants).toBe(readDocumentStage(parent, f.binding).grants);
      expect(await evaluateAuthorizedOutputField(child, childBinding, 'name')).toBe(true);
      const target = mongoose.model(`OwnedBoundaryTarget${++serial}`, new mongoose.Schema({ name: String }));
      f.runtime.registerModelInstance(target.modelName, target);
      const targetBinding = { ...f.binding, model: target, modelName: target.modelName };
      const targetCall = resolveServiceAuthorization({
        binding: targetBinding,
        parent: f.authorization,
        requestPermissions: f.actor,
        configuration: { catalog: { paths: ['name'] }, permissionSchema: schema, docPermissions: { read: hook } },
        access,
      });
      const targetHandle = await runWithRuntime(f.runtime, () =>
        resolveOutputDocumentStage({ ...f, authorization: targetCall, binding: targetBinding }),
      );
      expect(readDocumentStage(targetHandle, targetBinding).grants).toEqual({ owner: false });
      expect(await evaluateAuthorizedOutputField(targetHandle, targetBinding, 'name')).toBe(false);
      expect(getAuthorizationPermissions(targetCall, targetBinding)).toBe(
        getAuthorizationPermissions(f.authorization, f.binding),
      );
      expect(hook).toHaveBeenCalledTimes(1);
    },
  );

  it.each([false, true])(
    'captures the actor once and shares it across internal children with trusted source=%s',
    async (active) => {
      const f = fixture(undefined, active);
      const has = vi.spyOn(Permission.prototype, 'has');
      const authorization = resolveServiceAuthorization({
        ...f,
        requestPermissions: f.actor,
        access,
        readResponse: true,
      });
      const captured = getAuthorizationPermissions(authorization, f.binding);
      f.request[PERMISSIONS] = new Permission({ reader: false, admin: true });
      for (let index = 0; index < 24; index++) {
        expect(getAuthorizationPermissions(authorization, f.binding)).toBe(captured);
        expect(captured.has('reader')).toBe(true);
      }
      const child = resolveServiceAuthorization({
        ...f,
        requestPermissions: f.request[PERMISSIONS]!,
        parent: authorization,
        access,
      });
      expect(getAuthorizationPermissions(child, f.binding)).toBe(captured);
      expect(has.mock.contexts.filter((receiver) => receiver === f.actor)).toHaveLength(2);
      expect(captured.has('admin')).toBe(false);
      expect(f.core.getPermissions()).toBe(f.request[PERMISSIONS]);
    },
  );

  it.each(['request', 'runtime'] as const)('rejects a derived %s mismatch before sharing the actor', async (key) => {
    const f = fixture();
    const binding = { ...f.binding, [key]: {} };
    await expect(
      Promise.resolve().then(() =>
        resolveServiceAuthorization({ ...f, binding, parent: f.authorization, requestPermissions: f.actor, access }),
      ),
    ).rejects.toMatchObject({
      result: {
        code: 'bad_request',
        errors: [{ detail: expect.stringContaining('derived call request/runtime mismatch') }],
      },
    });
  });

  it.each([false, true])('owns grammar before awaits with trusted source=%s', async (active) => {
    const f = fixture(undefined, active);
    const tokens = ['reader'];
    const schema = { name: tokens };
    const entered = deferred();
    const release = deferred();
    const hook = async () => {
      entered.resolve();
      await release.promise;
      return { owner: true };
    };
    const configuration = { ...f.configuration, permissionSchema: schema, docPermissions: { read: hook } };
    const authorization = resolveServiceAuthorization({
      ...f,
      requestPermissions: f.actor,
      configuration,
      access,
      readResponse: true,
    });
    const pending = runWithRuntime(f.runtime, () => resolveOutputDocumentStage({ ...f, authorization }));
    await entered.promise;
    tokens[0] = 'absent';
    schema.name = ['denied'];
    release.resolve();
    const handle = await pending;
    expect(await evaluateAuthorizedOutputField(handle, f.binding, 'name')).toBe(true);
    const next = resolveServiceAuthorization({
      ...f,
      requestPermissions: f.actor,
      configuration: { ...f.configuration, permissionSchema: schema },
      access,
      readResponse: true,
    });
    const nextHandle = await runWithRuntime(f.runtime, () => resolveOutputDocumentStage({ ...f, authorization: next }));
    expect(await evaluateAuthorizedOutputField(nextHandle, f.binding, 'name')).toBe(false);
  });

  it.each([false, true])(
    'copies native row policy only at application exposure with trusted source=%s',
    async (active) => {
      const f = fixture(undefined, active);
      const when = new Date(10);
      const bytes = Buffer.from([1]);
      const authorization = resolveServiceAuthorization({
        ...f,
        requestPermissions: f.actor,
        access,
        readResponse: true,
        authorization: { rows: { mode: 'scope', filter: { when, bytes } } },
      });
      when.setTime(99);
      bytes[0] = 9;
      const first = await resolveAuthorizedAccessFilter(f.core, authorization, f.binding, {}, async () => {
        throw new Error('no fallback');
      });
      const exposed = first.scope as { when: Date; bytes: Buffer };
      expect(exposed.when.getTime()).toBe(10);
      expect(exposed.bytes[0]).toBe(1);
      expect(Object.isFrozen(exposed.when)).toBe(false);
      exposed.when.setTime(200);
      exposed.bytes[0] = 2;
      const second = await resolveAuthorizedAccessFilter(f.core, authorization, f.binding, {}, async () => {
        throw new Error('no fallback');
      });
      expect(second.scope).toEqual({ when: new Date(10), bytes: Buffer.from([1]) });
      expect(readServiceAuthorization(authorization, f.binding).authorization.rows).toEqual({
        mode: 'scope',
        filter: second.scope,
      });
    },
  );

  it.each([false, true])(
    'admits the fact map once, with zero full-map reads/copies per field with trusted source=%s',
    async (active) => {
      const raw = Object.fromEntries(Array.from({ length: 48 }, (_, i) => [`fact${i}`, true]));
      const f = fixture(undefined, active);
      const descriptors = vi.spyOn(Object, 'getOwnPropertyDescriptor');
      const handle = createDocumentStage(f.authorization, f.binding, f.snapshot);
      await resolveDocumentStage(handle, () => raw);
      const facts = readDocumentStage(handle, f.binding).grants;
      const admissionReads = descriptors.mock.calls.filter(([value]) => value === raw).length;
      const seen: DocumentGrants[] = [];
      for (let field = 0; field < 24; field++) {
        expect(
          await memoizeStageFieldDecision(handle, f.binding, String(field), (permissions, grants) => {
            seen.push(grants);
            expect(permissions).toBe(getAuthorizationPermissions(f.authorization, f.binding));
            return grants.fact0;
          }),
        ).toBe(true);
      }
      expect(admissionReads).toBe(48);
      expect(descriptors.mock.calls.filter(([value]) => value === raw)).toHaveLength(48);
      expect(new Set(seen)).toEqual(new Set([facts]));
      expect(descriptors.mock.calls.filter(([value]) => value === facts)).toHaveLength(0);
    },
  );

  it('does not traverse grants while isolating per-virtual contexts, and decorations retain owned facts', async () => {
    const f = fixture(() => ({ owner: true }));
    const seen: DocumentGrants[] = [];
    const getter = (_doc: unknown, _permissions: Permission, context: ModelHookContext) => {
      seen.push(context.docPermissions ?? EMPTY_DOCUMENT_GRANTS);
      return 'computed';
    };
    f.runtime.setModelOptions(f.model.modelName, {
      virtuals: { first: getter, second: getter },
      permissionSchema: { first: true, second: true },
    });
    const configuration = captureModelAuthorizationConfiguration(f.runtime, f.model.modelName);
    const authorization = resolveServiceAuthorization({ ...f, requestPermissions: f.actor, configuration, access });
    const plan = planAuthorizedModelProjection({
      authorization,
      binding: f.binding,
      requestedSelect: ['first', 'second', '-_id'],
    });
    const isolate = vi.spyOn(documentHelpers, 'deepIsolateValue');
    let context: ModelOutputContext | undefined;
    await runWithRuntime(f.runtime, () =>
      finalizeModelOutput({
        receivingModelName: f.model.modelName,
        request: f.request,
        input: f.snapshot,
        plan,
        ...access,
        onFinalized: (_output, ctx) => {
          context = ctx;
        },
      }),
    );
    expect(seen).toHaveLength(2);
    expect(new Set(seen)).toEqual(new Set([context!.docPermissions]));
    const copiedFactContexts = isolate.mock.calls.filter(
      ([value]) =>
        value &&
        typeof value === 'object' &&
        'docPermissions' in value &&
        value.docPermissions === context!.docPermissions,
    );
    expect(copiedFactContexts).toHaveLength(0);
    expect(Object.isFrozen(context!.docPermissions)).toBe(true);
    await f.core.decorate(f.model.modelName, { _permissions: { owner: false } }, 'read', context!);
    expect(context!.docPermissions).toBe(seen[0]);
    expect(context!.docPermissions!.owner).toBe(true);
  });

  it.each(['async', 'sync'] as const)(
    'retains %s field callback truthiness/error-denial, not strict fact-value grammar',
    async (kind) => {
      const f = fixture();
      const evaluate = kind === 'async' ? evaluateScopedAccessRule : evaluateScopedAccessRuleValue;
      const args = {
        req: f.request,
        globalPermissions: f.actor,
        docPermissions: EMPTY_DOCUMENT_GRANTS,
        modelPermissionPrefix: '',
      };
      expect(await evaluate({ ...args, rule: () => 'truthy JS result' })).toBe(true);
      expect(await evaluate({ ...args, rule: () => 0 })).toBe(false);
      expect(
        await evaluate({
          ...args,
          rule: () => {
            throw new Error('application');
          },
        }),
      ).toBe(false);
      expect(await evaluate({ ...args, rule: () => Promise.reject(new Error('application')) })).toBe(false);
    },
  );
});
