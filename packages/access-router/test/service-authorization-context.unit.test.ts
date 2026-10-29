import { afterEach, describe, expect, it, vi } from 'vitest';
import { execFileSync } from 'node:child_process';
import { createRequire } from 'node:module';
import path from 'node:path';
import { mongo } from 'mongoose';
import Permission from '../src/permission';
import type { AccessRouterRequest, ModelHookContext } from '../src/interfaces/base';
import type { DocumentAuthorization } from '../src/interfaces/service-authorization';
import {
  getAuthorizationPermissions,
  readServiceAuthorization,
  resolveServiceAuthorization,
  ServiceAuthorizationError,
} from '../src/acl/service-authorization';
import type { AuthorizationBinding, ResolveServiceAuthorizationInput } from '../src/acl/service-authorization';
import {
  assertDocumentAuthorization,
  associateDocumentAuthorization,
  createDocumentAuthorizationStage,
  createServiceOutputContext,
  isKnownAuthorizationOutput,
  memoizeDocumentFieldDecision,
  normalizeOutputAuthorizationOptions,
  readDocumentAuthorization,
  resolveDocumentAuthorization,
  transferDocumentAuthorization,
} from '../src/acl/document-authorization';
import * as rootExports from '../dist/index.mjs';
import * as advancedExports from '../dist/advanced.mjs';
import * as processorExports from '../dist/processors.mjs';

afterEach(() => vi.restoreAllMocks());

function fixture(): ResolveServiceAuthorizationInput {
  const permissions = new Permission({ reader: true, admin: false });
  return {
    binding: {
      request: { actor: 'original', macl: { getPermissions: () => permissions } } as unknown as AccessRouterRequest,
      runtime: {},
      model: {},
      modelName: 'Order',
      scopePath: [],
    },
    access: {
      operation: 'read',
      rowAccess: 'read',
      virtualAccess: 'read',
      outputAccess: 'read',
      docPermissionsAccess: 'read',
    },
    requestPermissions: permissions,
    configuration: {
      documentPermissionField: 'meta.permissions',
      catalog: {
        paths: [
          'status',
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
      alwaysSelectFields: { read: ['ownerId'] },
      permissionSchema: { status: { read: 'owner' } },
    },
    relatedTargets: [
      { path: 'customer', modelName: 'Customer', configuration: { catalog: { paths: ['name', 'billingEmail'] } } },
    ],
  };
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

async function document(input = fixture(), snapshot = { _id: 'same', ownerId: 'original' }) {
  const call = resolveServiceAuthorization(input);
  const stage = createDocumentAuthorizationStage(call, input.binding, snapshot);
  const hook = vi.fn(function (this: AccessRouterRequest, raw: Record<string, unknown>) {
    expect(this).toBe(input.binding.request);
    return { owner: raw.ownerId === this.actor, privateGrant: true };
  });
  const handle = await resolveDocumentAuthorization(stage, hook);
  const output = { _id: 'same', status: 'open', internalNote: 'private' };
  associateDocumentAuthorization(handle, input.binding, output);
  const use = { binding: input.binding, output, outputAccess: 'read', authorization: call, stage };
  return { input, call, stage, hook, handle, output, use, snapshot };
}

describe('SVA-01 private call-policy capture', () => {
  it('owns per-call authority and captured configuration without changing the request actor/map', () => {
    const input = fixture();
    const paths = ['internalNote'];
    const filter = {
      tenant: ['backend'],
      when: new Date(10),
      bytes: Buffer.from([1]),
      _id: new mongo.BSON.ObjectId(),
      decimal: mongo.BSON.Decimal128.fromString('1.2'),
      long: mongo.BSON.Long.fromNumber(4),
    };
    const rule = vi.fn();
    const config = { ...input.configuration, rule, map: new Map([['key', { enabled: true }]]) };
    const authorization = {
      rows: { mode: 'scope', filter },
      outputFields: { mode: 'grant', paths },
      related: { customer: { model: 'Customer', outputFields: { mode: 'grant', paths: ['billingEmail'] } } },
    };
    const call = resolveServiceAuthorization({ ...input, configuration: config, authorization });
    const actor = input.binding.request;
    const permissionObject = actor.macl;
    paths.push('status');
    filter.tenant.push('other');
    filter.when.setTime(30);
    filter.bytes[0] = 9;
    filter._id.id = Buffer.alloc(12, 1);
    filter.decimal.bytes[0] ^= 255;
    filter.long.low = 20;
    config.map.get('key')!.enabled = false;
    authorization.related.customer.outputFields.paths.push('name');
    (config.alwaysSelectFields as { read: string[] }).read.push('secret');
    const captured = readServiceAuthorization(call, input.binding);
    expect(captured.authorization.outputFields).toEqual({ mode: 'grant', paths: ['internalNote'] });
    expect(captured.authorization.related.customer.outputFields).toEqual({ mode: 'grant', paths: ['billingEmail'] });
    const capturedFilter = (captured.authorization.rows as { filter: typeof filter }).filter;
    expect(capturedFilter.tenant).toEqual(['backend']);
    expect(capturedFilter.when.getTime()).toBe(10);
    expect(capturedFilter.bytes[0]).toBe(1);
    expect(capturedFilter._id.equals(filter._id)).toBe(false);
    expect(capturedFilter.decimal.toString()).toBe('1.2');
    expect(capturedFilter.long.toNumber()).toBe(4);
    // Mutating a detached leaf/view must not change stored authority either.
    capturedFilter.when.setTime(99);
    capturedFilter.bytes[0] = 5;
    (captured.configuration.map as Map<string, unknown>).clear();
    const again = readServiceAuthorization(call, input.binding);
    expect((again.authorization.rows as { filter: typeof filter }).filter.when.getTime()).toBe(10);
    expect((again.configuration.map as Map<string, unknown>).size).toBe(1);
    expect(again.configuration.alwaysSelectFields).toEqual({ read: ['ownerId'] });
    expect(again.configuration.rule).toBe(rule);
    expect(Object.isFrozen(captured.authorization)).toBe(true);
    expect(Object.isFrozen((captured.authorization.outputFields as { paths: string[] }).paths)).toBe(true);
    expect(input.binding.request).toBe(actor);
    expect(actor.macl).toBe(permissionObject);
    expect(input.requestPermissions.has('admin')).toBe(false);
    expect(rule).not.toHaveBeenCalled();
  });

  it('does not inherit authority across overlapping calls on the same receiver, or request permission mutations', () => {
    const input = fixture();
    const first = resolveServiceAuthorization({
      ...input,
      authorization: { rows: { mode: 'unrestricted' }, outputFields: { mode: 'unrestricted' } },
    });
    const next = resolveServiceAuthorization(input);
    (input.requestPermissions as unknown as { permissions: Record<string, boolean> }).permissions.admin = true;
    expect(readServiceAuthorization(first, input.binding).authorization.outputFields.mode).toBe('unrestricted');
    expect(readServiceAuthorization(next, input.binding).authorization).toEqual({
      rows: { mode: 'request' },
      outputFields: { mode: 'request' },
      inputFields: { mode: 'request' },
      related: {},
    });
    expect(getAuthorizationPermissions(first, input.binding).has('admin')).toBe(false);
    expect(getAuthorizationPermissions(next, input.binding).hasKey('admin')).toBe(true);
    expect(Object.isFrozen(getAuthorizationPermissions(next, input.binding).keys)).toBe(true);
  });

  it('detaches canonical BSON authority/configuration on every full read through wire round-trips', () => {
    const input = fixture();
    const hex = '0123456789abcdef01234567';
    const native = {
      id: new mongo.BSON.ObjectId(hex),
      decimal: mongo.BSON.Decimal128.fromString('1.20'),
      long: new mongo.BSON.Long(-1, 0x7fffffff, false),
    };
    // BSON's namespace is frozen; retain every constructor/function and observe
    // serialization through the driver's configurable namespace getter instead.
    vi.spyOn(mongo, 'BSON', 'get').mockReturnValue({ ...mongo.BSON });
    const serialize = vi.spyOn(mongo.BSON, 'serialize');
    const call = resolveServiceAuthorization({
      ...input,
      configuration: { ...input.configuration, native },
      authorization: { rows: { mode: 'scope', filter: native } },
    });
    expect(serialize).toHaveBeenCalled();
    serialize.mockClear();
    native.id.id = Buffer.alloc(12);
    native.decimal.bytes.fill(0);
    native.long.low = 0;
    const held = readServiceAuthorization(call, input.binding);
    const heldFilter = (held.authorization.rows as { filter: typeof native }).filter;
    for (let repeat = 0; repeat < 3; repeat++) {
      const read = readServiceAuthorization(call, input.binding);
      const policy = (read.authorization.rows as { filter: typeof native }).filter;
      const config = read.configuration.native as typeof native;
      for (const leaves of [policy, config, heldFilter]) {
        expect(leaves.id.equals(hex)).toBe(true);
        expect(leaves.decimal.toString()).toBe('1.20');
        expect(leaves.long.low).toBe(-1);
        expect(leaves.long.high).toBe(0x7fffffff);
        expect(leaves.long.unsigned).toBe(false);
      }
      expect(policy.id).not.toBe(config.id);
      expect(policy.id).not.toBe(heldFilter.id);
      expect(policy.decimal.bytes).not.toBe(config.decimal.bytes);
      expect(policy.long).not.toBe(config.long);
      policy.id.id = Buffer.alloc(12);
      policy.decimal.bytes.fill(0);
      policy.long.high = 0;
      config.id.id = Buffer.alloc(12);
      config.decimal.bytes.fill(0);
      config.long.low = 0;
    }
    expect(serialize).toHaveBeenCalledTimes(24); // Six detached BSON leaves in each of four full reads.
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
    badRequest(() => resolveServiceAuthorization({ ...fixture(), authorization }));
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
  ])('rejects unsafe/protected/out-of-catalog path %s', (path) => {
    badRequest(() =>
      resolveServiceAuthorization({ ...fixture(), authorization: { outputFields: { mode: 'grant', paths: [path] } } }),
    );
  });

  it('accepts false/empty inert scopes, empty grants, leaf/subtree and declared business control-word paths', () => {
    const input = fixture();
    for (const filter of [false, {}, { note: { $$sq: { model: 'inert' } }, date: { $$date: 'inert' } }]) {
      const call = resolveServiceAuthorization({
        ...input,
        authorization: { rows: { mode: 'scope', filter }, outputFields: { mode: 'grant', paths: [] } },
      });
      expect(readServiceAuthorization(call, input.binding).authorization.rows).toEqual({ mode: 'scope', filter });
    }
    const paths = ['contacts', 'contacts.email', 'mixed.safe.branch', 'summary', 'authorization', 'overrides', '_id'];
    const call = resolveServiceAuthorization({ ...input, authorization: { outputFields: { mode: 'grant', paths } } });
    expect(readServiceAuthorization(call, input.binding).authorization.outputFields).toEqual({ mode: 'grant', paths });
  });

  it('rejects cycles, unsupported objects, protected object keys and accessors without invoking them', () => {
    const cyclic: Record<string, unknown> = {};
    cyclic.related = cyclic;
    const getter = vi.fn(() => ({ mode: 'unrestricted' }));
    for (const authorization of [
      cyclic,
      { rows: { mode: 'scope', filter: { self: cyclic } } },
      { outputFields: new Map() },
      { rows: { mode: 'scope', filter: { value: () => true } } },
      JSON.parse('{"related":{"__proto__":{"model":"Customer"}}}'),
      Object.defineProperty({}, 'rows', { enumerable: true, get: getter }),
    ]) {
      badRequest(() => resolveServiceAuthorization({ ...fixture(), authorization }));
    }
    expect(getter).not.toHaveBeenCalled();
  });

  it('bounds recursive/sparse inputs and accepts shared acyclic policy values', () => {
    let nested: unknown = {};
    for (let i = 0; i < 110; i++) nested = { nested };
    badRequest(() =>
      resolveServiceAuthorization({ ...fixture(), authorization: { rows: { mode: 'scope', filter: nested } } }),
    );
    badRequest(() =>
      resolveServiceAuthorization({
        ...fixture(),
        authorization: { outputFields: { mode: 'grant', paths: new Array(20001) } },
      }),
    );
    const shared = { mode: 'request' };
    const input = fixture();
    const call = resolveServiceAuthorization({ ...input, authorization: { rows: shared, outputFields: shared } });
    expect(readServiceAuthorization(call, input.binding).authorization.outputFields.mode).toBe('request');
  });

  it('captures nested target policy/configuration and applies each receiving catalog', () => {
    const input = fixture();
    const target = {
      ...input.relatedTargets![0],
      relatedTargets: [{ path: 'office', modelName: 'Office', configuration: { catalog: { paths: ['address'] } } }],
    };
    const policy = {
      related: {
        customer: {
          model: 'Customer',
          related: {
            office: {
              model: 'Office',
              operation: { mode: 'grant' },
              rows: { mode: 'scope', filter: { region: 'backend' } },
              outputFields: { mode: 'grant', paths: ['address'] },
            },
          },
        },
      },
    };
    const call = resolveServiceAuthorization({ ...input, relatedTargets: [target], authorization: policy });
    target.relatedTargets[0].configuration.catalog.paths.push('other');
    policy.related.customer.related.office.rows.filter.region = 'changed';
    const captured = readServiceAuthorization(call, input.binding);
    expect(captured.relatedTargets[0].relatedTargets![0].configuration.catalog.paths).toEqual(['address']);
    expect(captured.authorization.related.customer.related.office.rows).toEqual({
      mode: 'scope',
      filter: { region: 'backend' },
    });
  });

  it('checks exact requested related targets, nesting, target catalogs and count applicability', () => {
    const input = fixture();
    for (const related of [
      { typo: { model: 'Customer' } },
      { customer: { model: 'Other' } },
      { customer: { model: '' } },
      { customer: { model: 'Customer', inputFields: {} } },
      { customer: { model: 'Customer', operation: { mode: 'unrestricted' } } },
      { customer: { model: 'Customer', outputFields: { mode: 'grant', paths: ['internalNote'] } } },
      { customer: { model: 'Customer', related: { unused: { model: 'Other' } } } },
    ])
      badRequest(() => resolveServiceAuthorization({ ...input, authorization: { related } }));
    const authorization = { outputFields: { mode: 'unrestricted' }, related: { customer: { model: 'Customer' } } };
    const call = resolveServiceAuthorization({ ...input, authorization });
    expect(readServiceAuthorization(call, input.binding).authorization.related.customer).toMatchObject({
      operation: { mode: 'request' },
      rows: { mode: 'request' },
      outputFields: { mode: 'request' },
    });
    badRequest(() =>
      resolveServiceAuthorization({
        ...input,
        relatedTargets: [...input.relatedTargets!, ...input.relatedTargets!],
        authorization,
      }),
    );
    badRequest(() =>
      resolveServiceAuthorization({
        ...input,
        relatedTargets: [{ ...input.relatedTargets![0], kind: 'count' }],
        authorization: { related: { customer: { model: 'Customer', outputFields: { mode: 'request' } } } },
      }),
    );
  });

  it('rejects wrong method dimensions even when explicitly undefined or request-mode', () => {
    for (const applicability of ['create', 'output'] as const) {
      for (const rows of [undefined, { mode: 'request' }]) {
        badRequest(() => resolveServiceAuthorization({ ...fixture(), applicability, authorization: { rows } }));
      }
    }
    badRequest(() =>
      resolveServiceAuthorization({ ...fixture(), applicability: 'output', authorization: { related: {} } }),
    );
  });

  it.each(['request', 'runtime', 'model', 'modelName', 'scopePath'] as const)(
    'authenticates resolved call %s binding',
    (key) => {
      const input = fixture();
      const call = resolveServiceAuthorization(input);
      const binding = {
        ...input.binding,
        [key]: key === 'scopePath' ? ['contacts'] : key === 'modelName' ? 'Other' : {},
      } as AuthorizationBinding;
      badRequest(() => readServiceAuthorization(call, binding));
      badRequest(() => readServiceAuthorization({ ...call }, input.binding));
    },
  );
});

describe('SVA-01 per-document owners and same-stage handles', () => {
  it('resolves full grants and field decisions once, preserving the original actor after private inputs/metadata are trimmed', async () => {
    const input = fixture();
    const call = resolveServiceAuthorization(input);
    const raw = { _id: 'same', ownerId: 'original' };
    const stage = createDocumentAuthorizationStage(call, input.binding, raw);
    const grants = { owner: true, hidden: { allowed: true } };
    const hook = vi.fn(function (
      this: AccessRouterRequest,
      snapshot: Record<string, unknown>,
      permissions: Permission,
    ) {
      expect(this).toBe(input.binding.request);
      expect(snapshot.ownerId).toBe(this.actor);
      expect(permissions.has('admin')).toBe(false);
      return grants;
    });
    const [handle, again] = await Promise.all([
      resolveDocumentAuthorization(stage, hook),
      resolveDocumentAuthorization(stage, hook),
    ]);
    expect(again).toBe(handle);
    expect(hook).toHaveBeenCalledTimes(1);
    grants.owner = false;
    grants.hidden.allowed = false;
    const decision = vi.fn(function (
      this: AccessRouterRequest,
      _permissions: Permission,
      full: Record<string, unknown>,
    ) {
      expect(this).toBe(input.binding.request);
      return full.owner === true;
    });
    expect(
      await Promise.all([
        memoizeDocumentFieldDecision(handle, input.binding, 'status', decision),
        memoizeDocumentFieldDecision(handle, input.binding, 'status', decision),
      ]),
    ).toEqual([true, true]);
    expect(decision).toHaveBeenCalledTimes(1);
    const output = { status: 'open' };
    associateDocumentAuthorization(handle, input.binding, output);
    const use = { binding: input.binding, output, outputAccess: 'read' };
    const diagnostic = { modelName: 'Order', docPermissions: { owner: false } } as ModelHookContext;
    const context = createServiceOutputContext(diagnostic, handle, use);
    context.docPermissions!.owner = false;
    expect(readDocumentAuthorization(handle, input.binding).grants).toEqual({ owner: true, hidden: { allowed: true } });
    expect(
      await memoizeDocumentFieldDecision(context.documentAuthorization, input.binding, 'status', () => false),
    ).toBe(true);
    expect(hook).toHaveBeenCalledTimes(1);
    expect(output).toEqual({ status: 'open' });
    expect(Reflect.ownKeys(output)).toEqual(['status']);
    expect(Object.keys(context)).not.toContain('documentAuthorization');
    expect(Object.keys(context)).not.toContain('getDocumentAuthorization');
    expect(JSON.stringify(context)).not.toContain('documentAuthorization');
    expect(Reflect.ownKeys(handle)).toEqual([]);
    expect(JSON.stringify(handle)).toBe('{}');
    expect(Object.getOwnPropertyDescriptor(context, 'documentAuthorization')).toMatchObject({
      writable: false,
      configurable: false,
    });
    expect(context.getDocumentAuthorization(output)).toBe(handle);
    expect(context.getDocumentAuthorization({ ...output })).toBeUndefined();
  });

  it('shares call policy across rows without sharing grants/decisions, even for matching IDs', async () => {
    const input = fixture();
    const call = resolveServiceAuthorization(input);
    const resolve = vi.fn((raw: Record<string, unknown>) => ({ owner: raw.ownerId === 'original' }));
    const first = createDocumentAuthorizationStage(call, input.binding, { _id: 'same', ownerId: 'original' });
    const second = createDocumentAuthorizationStage(call, input.binding, { _id: 'same', ownerId: 'other' });
    const [a, b] = await Promise.all([
      resolveDocumentAuthorization(first, resolve),
      resolveDocumentAuthorization(second, resolve),
    ]);
    expect(a).not.toBe(b);
    expect(resolve).toHaveBeenCalledTimes(2);
    const evaluate = vi.fn((_permissions, grants) => grants.owner);
    expect(await memoizeDocumentFieldDecision(a, input.binding, 'status', evaluate)).toBe(true);
    expect(await memoizeDocumentFieldDecision(b, input.binding, 'status', evaluate)).toBe(false);
    expect(evaluate).toHaveBeenCalledTimes(2);
    const out = { _id: 'same' };
    associateDocumentAuthorization(a, input.binding, out);
    badRequest(() => assertDocumentAuthorization(b, { binding: input.binding, output: out, outputAccess: 'read' }));
  });

  it('accepts explicit same-stage package copies, but not structural/JSON/ID/metadata forgeries', async () => {
    const { handle, use, output, input } = await document();
    const copy = { status: output.status };
    transferDocumentAuthorization(handle, use, copy);
    expect(() => assertDocumentAuthorization(handle, { ...use, output: copy })).not.toThrow();
    expect(isKnownAuthorizationOutput(copy)).toBe(true);
    for (const impostor of [{ ...output }, { _id: 'same', _permissions: { owner: true } }]) {
      badRequest(() => assertDocumentAuthorization(handle, { ...use, output: impostor }));
      badRequest(() => transferDocumentAuthorization(handle, { ...use, output: impostor }, {}));
    }
    for (const forged of [{}, { ...handle }, JSON.parse(JSON.stringify(handle))]) {
      badRequest(() => assertDocumentAuthorization(forged as DocumentAuthorization, use));
    }
    expect(input.binding.request.actor).toBe('original');
  });

  it('rejects another call, stage, access, scope, request, model or runtime', async () => {
    const { handle, use, input, snapshot, call } = await document();
    const nextCall = resolveServiceAuthorization(input);
    const nextStage = createDocumentAuthorizationStage(call, input.binding, { ...snapshot });
    for (const invalid of [
      { ...use, authorization: nextCall },
      { ...use, stage: nextStage },
      { ...use, outputAccess: 'update' },
      ...['request', 'runtime', 'model', 'modelName', 'scopePath'].map((key) => ({
        ...use,
        binding: {
          ...input.binding,
          [key]: key === 'scopePath' ? ['contacts'] : key === 'modelName' ? 'Other' : {},
        } as AuthorizationBinding,
      })),
    ])
      badRequest(() => assertDocumentAuthorization(handle, invalid));
    snapshot.ownerId = 'changed';
    badRequest(() => assertDocumentAuthorization(handle, use));
    expect(isKnownAuthorizationOutput(use.output)).toBe(true);
  });

  it('keeps pre-write/post-write and effective-access stages distinct even on the same immutable snapshot', async () => {
    const input = fixture();
    const original = await document(input);
    const postWrite = await document(
      {
        ...input,
        parent: original.call,
        access: {
          operation: 'update',
          rowAccess: 'update',
          virtualAccess: 'update',
          outputAccess: 'read',
          docPermissionsAccess: 'update',
        },
      },
      original.snapshot,
    );
    badRequest(() => assertDocumentAuthorization(original.handle, { ...postWrite.use }));
    badRequest(() => assertDocumentAuthorization(postWrite.handle, { ...original.use }));
    expect(original.hook).toHaveBeenCalledTimes(1);
    expect(postWrite.hook).toHaveBeenCalledTimes(1);
  });

  it('invalidates a captured snapshot changed while its permission hook is awaiting', async () => {
    const input = fixture();
    const call = resolveServiceAuthorization(input);
    const snapshot = { ownerId: 'original' };
    const stage = createDocumentAuthorizationStage(call, input.binding, snapshot);
    let release!: () => void;
    const waiting = new Promise<void>((resolve) => {
      release = resolve;
    });
    const hook = vi.fn(async () => {
      await waiting;
      return { owner: true };
    });
    const pending = resolveDocumentAuthorization(stage, hook);
    await Promise.resolve();
    snapshot.ownerId = 'other';
    release();
    await expect(pending).rejects.toBeInstanceOf(ServiceAuthorizationError);
    expect(hook).toHaveBeenCalledTimes(1);
  });

  it.each(['id', 'decimal', 'long'] as const)(
    'rejects stale canonical BSON document changes before cached decisions: %s',
    async (kind) => {
      const input = fixture();
      const call = resolveServiceAuthorization(input);
      const snapshot = {
        id: new mongo.BSON.ObjectId('0123456789abcdef01234567'),
        decimal: mongo.BSON.Decimal128.fromString('1.20'),
        long: new mongo.BSON.Long(-1, 0x7fffffff),
      };
      const stage = createDocumentAuthorizationStage(call, input.binding, snapshot);
      const hook = vi.fn(() => ({ owner: true }));
      const handle = await resolveDocumentAuthorization(stage, hook);
      const decision = vi.fn(() => true);
      expect(await memoizeDocumentFieldDecision(handle, input.binding, 'warm', decision)).toBe(true);
      const output = { status: 'open' };
      associateDocumentAuthorization(handle, input.binding, output);
      const use = { binding: input.binding, output, outputAccess: 'read' };
      if (kind === 'id') snapshot.id.id = Buffer.alloc(12);
      if (kind === 'decimal') snapshot.decimal.bytes[0] ^= 255;
      if (kind === 'long') snapshot.long.low ^= 1;
      badRequest(() => readDocumentAuthorization(handle, input.binding));
      badRequest(() => assertDocumentAuthorization(handle, use));
      badRequest(() => memoizeDocumentFieldDecision(handle, input.binding, 'warm', decision));
      expect(hook).toHaveBeenCalledTimes(1);
      expect(decision).toHaveBeenCalledTimes(1);
    },
  );

  it.each(['date', 'buffer', 'bson', 'decimal', 'long', 'nested', 'replacement'] as const)(
    'rejects stale output mutation/replacement: %s',
    async (kind) => {
      const { handle, input } = await document();
      const output = {
        date: new Date(1),
        buffer: Buffer.from([1]),
        bson: new mongo.BSON.ObjectId(),
        decimal: mongo.BSON.Decimal128.fromString('1.2'),
        long: new mongo.BSON.Long(-1, 0x7fffffff),
        nested: { value: true },
      };
      associateDocumentAuthorization(handle, input.binding, output);
      const use = { binding: input.binding, output, outputAccess: 'read' };
      const context = createServiceOutputContext({} as ModelHookContext, handle, use);
      if (kind === 'date') output.date.setTime(2);
      if (kind === 'buffer') output.buffer[0] = 2;
      if (kind === 'bson') output.bson.id = Buffer.alloc(12, 1);
      if (kind === 'decimal') output.decimal.bytes[0] ^= 255;
      if (kind === 'long') output.long.low ^= 1;
      if (kind === 'nested') output.nested.value = false;
      if (kind === 'replacement') output.nested = { value: true };
      badRequest(() => assertDocumentAuthorization(handle, use));
      badRequest(() => associateDocumentAuthorization(handle, input.binding, output));
      expect(context.getDocumentAuthorization(output)).toBeUndefined();
    },
  );

  it('looks up only exact registered related outputs in this result graph and keeps receiver ownership', async () => {
    const parent = await document();
    const childInput = {
      ...fixture(),
      binding: { ...parent.input.binding, model: {}, modelName: 'Customer' },
      parent: parent.call,
    };
    const child = await document(childInput);
    const unrelated = await document(parent.input);
    const root = { customer: child.output, other: unrelated.output, unknown: {} };
    associateDocumentAuthorization(parent.handle, parent.input.binding, root);
    const context = createServiceOutputContext({} as ModelHookContext, parent.handle, { ...parent.use, output: root });
    expect(context.getDocumentAuthorization(root.customer)).toBe(child.handle);
    expect(context.getDocumentAuthorization(root.other)).toBeUndefined();
    expect(context.getDocumentAuthorization(root.unknown)).toBeUndefined();
    badRequest(() => assertDocumentAuthorization(child.handle, { ...child.use, binding: parent.input.binding }));
    expect(readServiceAuthorization(child.call, childInput.binding).authorization.outputFields.mode).toBe('request');
    parent.snapshot.ownerId = 'changed';
    expect(context.getDocumentAuthorization(root.customer)).toBeUndefined();
  });

  it('derives embedded scope from a valid handle and keeps element decisions distinct with explicit owning grants', async () => {
    const parent = await document();
    const embeddedInput = {
      ...parent.input,
      parent: parent.call,
      binding: { ...parent.input.binding, scopePath: ['contacts'] },
    };
    const call = resolveServiceAuthorization(embeddedInput);
    const rawA = { email: 'a@example.test' };
    const rawB = { email: 'b@example.test' };
    const stageA = createDocumentAuthorizationStage(call, embeddedInput.binding, rawA);
    const stageB = createDocumentAuthorizationStage(call, embeddedInput.binding, rawB);
    const reuseOwningGrants = () => readDocumentAuthorization(parent.handle, parent.input.binding).grants;
    const a = await resolveDocumentAuthorization(stageA, reuseOwningGrants);
    const b = await resolveDocumentAuthorization(stageB, reuseOwningGrants);
    expect(parent.hook).toHaveBeenCalledTimes(1);
    const output = { email: rawA.email };
    associateDocumentAuthorization(a, embeddedInput.binding, output);
    const options = normalizeOutputAuthorizationOptions(parent.input, { documentAuthorization: a });
    expect(options.kind).toBe('document');
    if (options.kind !== 'document') throw new Error('expected document handle');
    expect(options.binding.scopePath).toEqual(['contacts']);
    expect(() =>
      assertDocumentAuthorization(a, { binding: options.binding, output, outputAccess: 'read' }),
    ).not.toThrow();
    badRequest(() => assertDocumentAuthorization(a, { binding: parent.input.binding, output, outputAccess: 'read' }));
    badRequest(() => assertDocumentAuthorization(b, { binding: options.binding, output, outputAccess: 'read' }));
    expect(await memoizeDocumentFieldDecision(a, options.binding, 'email', () => true)).toBe(true);
    expect(await memoizeDocumentFieldDecision(b, options.binding, 'email', () => false)).toBe(false);
  });

  it('retains hook and decision failures instead of silently rerunning them', async () => {
    const input = fixture();
    const call = resolveServiceAuthorization(input);
    const stage = createDocumentAuthorizationStage(call, input.binding, {});
    const hook = vi.fn(async () => {
      throw new Error('hook failed');
    });
    await expect(resolveDocumentAuthorization(stage, hook)).rejects.toThrow('hook failed');
    await expect(resolveDocumentAuthorization(stage, hook)).rejects.toThrow('hook failed');
    expect(hook).toHaveBeenCalledTimes(1);
    const { handle, input: other } = await document();
    const decision = vi.fn(async () => {
      throw new Error('rule failed');
    });
    await expect(memoizeDocumentFieldDecision(handle, other.binding, 'status', decision)).rejects.toThrow(
      'rule failed',
    );
    await expect(memoizeDocumentFieldDecision(handle, other.binding, 'status', decision)).rejects.toThrow(
      'rule failed',
    );
    expect(decision).toHaveBeenCalledTimes(1);
  });
});

describe('SVA-01 named-option admission and export gate', () => {
  it('type-checks strict public/internal/default/opaque-handle fixtures against emitted declarations', () => {
    execFileSync(
      process.execPath,
      [
        createRequire(import.meta.url).resolve('typescript/bin/tsc'),
        '--ignoreConfig',
        '--noEmit',
        '--strict',
        '--skipLibCheck',
        '--target',
        'ES2022',
        '--module',
        'NodeNext',
        '--moduleResolution',
        'NodeNext',
        'test/service-authorization.types.fixture.ts',
      ],
      { cwd: path.resolve(__dirname, '..'), stdio: 'pipe' },
    );
  });

  it('normalizes fresh output-only policies and rejects handle/raw mixtures, forged handles and legacy bypass slots', async () => {
    const { handle, input } = await document();
    expect(normalizeOutputAuthorizationOptions(input, { documentAuthorization: handle }).kind).toBe('document');
    const normalized = normalizeOutputAuthorizationOptions(
      input,
      { authorization: { outputFields: { mode: 'grant', paths: ['internalNote'] } }, purpose: 'output' },
      'output',
    );
    expect(normalized.kind).toBe('policy');
    for (const options of [
      { documentAuthorization: handle, authorization: {} },
      { documentAuthorization: handle, scopePath: [] },
      { documentAuthorization: {} },
      { baseFields: ['internalNote'] },
      { skipChecks: true },
      { authorization: { rows: { mode: 'request' } } },
      { authorization: { related: {} } },
      { scopePath: null },
      { scopePath: ['contacts', 'sub'] },
      { scopePath: ['contacts.email'] },
    ])
      badRequest(() => normalizeOutputAuthorizationOptions(input, options));
    badRequest(() => normalizeOutputAuthorizationOptions(input, {}, 'output'));
  });

  it('does not publish runtime context issuers or private execution types as values', () => {
    for (const entry of [rootExports, advancedExports, processorExports]) {
      for (const name of [
        'resolveServiceAuthorization',
        'requiresDocumentSnapshotChecks',
        'createDocumentAuthorizationStage',
        'associateDocumentAuthorization',
        'DocumentAuthorization',
        'ResolvedServiceAuthorization',
        'ServiceExecutionContext',
        'unchangedBsonPrototype',
        'canonicalBsonFields',
        'canonicalBsonBytes',
        'copyCanonicalBsonValue',
      ]) {
        expect(entry).not.toHaveProperty(name);
      }
    }
  });
});
