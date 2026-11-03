import mongoose from 'mongoose';
import { afterEach, describe, expect, it, vi } from 'vitest';
import Permission from '../src/permission';
import { Core } from '../src/core';
import { AccessRuntime } from '../src/runtime';
import { runWithRuntime } from '../src/runtime-context';
import { PERMISSIONS } from '../src/symbols';
import type { ModelRequest } from '../src/interfaces';
import {
  createDocumentStage,
  memoizeStageFieldDecision,
  readDocumentStage,
  resolveDocumentStage,
  type DocumentGrantResolver,
} from '../src/acl/document-stage';
import {
  getAuthorizationPermissions,
  readServiceAuthorization,
  resolveServiceAuthorization,
} from '../src/acl/service-authorization';
import { resolveOutputDocumentStage } from '../src/acl/output-field-filter';
import { createModelOutputContext } from '../src/output/model-output-context';
import { requestInputFields, resolveInputDocumentGrants } from '../src/acl/model-input-admission';
import { deferred } from './hook-admission-fixture';

let serial = 0;
function fixture(hook?: unknown, active = false, metadata = '_permissions') {
  const runtime = new AccessRuntime();
  const warn = vi.fn();
  runtime.setGlobalOptions({ logger: { warn } });
  const model = mongoose.model(`OwnedFacts${++serial}`, new mongoose.Schema({ name: String }));
  runtime.registerModelInstance(model.modelName, model);
  const actor = new Permission({ reader: true, denied: false });
  const request = { [PERMISSIONS]: actor } as unknown as ModelRequest;
  const core = runWithRuntime(runtime, () => new Core(request));
  request.macl = core;
  const binding = { request, runtime, model, modelName: model.modelName };
  const configuration = {
    catalog: { paths: ['name'] },
    documentPermissionField: metadata,
    docPermissions: { read: hook, update: hook },
    readAuthorizationMode: active ? ('trusted' as const) : ('isolated' as const),
  };
  const authorization = resolveServiceAuthorization({
    binding,
    requestPermissions: actor,
    configuration,
    access: {
      operation: 'read',
      rowAccess: 'read',
      virtualAccess: 'read',
      outputAccess: 'read',
      docPermissionsAccess: 'read',
    },
    readResponse: true,
  });
  const snapshot = { name: 'visible' };
  const context = createModelOutputContext({
    modelName: model.modelName,
    operation: 'read',
    virtualAccess: 'read',
    outputAccess: 'read',
    docPermissionsAccess: 'read',
  });
  return { runtime, warn, model, actor, core, binding, configuration, authorization, snapshot, context };
}

afterEach(() => {
  vi.restoreAllMocks();
  mongoose.deleteModel(/^OwnedFacts/);
});

describe('owned boolean document facts (OAR-02)', () => {
  it.each([false, true])('owns one frozen fact identity with trusted source=%s', async (active) => {
    const returned = { owner: true, suspended: false, 'doc:with.dots': true };
    const f = fixture(undefined, active);
    const hook = vi.fn(() => returned);
    const stage = createDocumentStage(f.authorization, f.binding, f.snapshot);
    const facts = await resolveDocumentStage(stage, hook);
    expect(facts).not.toBe(returned);
    expect(Object.getPrototypeOf(facts)).toBe(null);
    expect(Object.isFrozen(facts)).toBe(true);
    expect(Object.isFrozen(returned)).toBe(false);
    returned.owner = false;
    returned.suspended = true;
    const paused = deferred();
    const seen: unknown[] = [];
    const first = memoizeStageFieldDecision(stage, f.binding, 'first', async function (permissions, grants) {
      expect(this).toBe(f.binding.request);
      expect(permissions.has('reader')).toBe(true);
      seen.push(grants);
      await paused.promise;
      return grants.owner === true && grants.suspended === false;
    });
    paused.resolve();
    expect(await first).toBe(true);
    for (let index = 0; index < 24; index++) {
      expect(
        await memoizeStageFieldDecision(stage, f.binding, `field:${index}`, (_permissions, grants) => {
          seen.push(grants);
          return grants.owner === true;
        }),
      ).toBe(true);
    }
    expect(new Set([...seen, readDocumentStage(stage, f.binding).grants])).toEqual(new Set([facts]));
    expect(await resolveDocumentStage(stage, hook)).toBe(facts);
    expect(hook).toHaveBeenCalledTimes(1);
  });

  const invalid: [string, () => unknown][] = [
    ['undefined', () => undefined],
    ['null', () => null],
    ['array', () => []],
    ['native', () => new Date(0)],
    ['nested', () => ({ owner: true, rich: {} })],
    ['native value', () => ({ owner: true, rich: new Date(0) })],
    ['undefined value', () => ({ owner: true, rich: undefined })],
    ['truthy value', () => ({ owner: 1 })],
    ['symbol', () => ({ owner: true, [Symbol('private')]: true })],
    ['non-enumerable', () => Object.defineProperty({ owner: true }, 'hidden', { value: true })],
    ...[
      '__proto__',
      'constructor',
      'prototype',
      '_doc',
      '$__',
      '__v',
      '_permissions',
      '_view',
      '_edit',
      'meta.facts',
    ].map((key): [string, () => unknown] => [
      key,
      () =>
        Object.fromEntries([
          ['owner', true],
          [key, true],
        ]),
    ]),
    ['20000 keys', () => Object.fromEntries(Array.from({ length: 20000 }, (_, i) => [`fact${i}`, true]))],
  ];

  it.each(invalid)('rejects the WHOLE fulfilled %s map in every hook lane', async (_label, make) => {
    const raw = make();
    const hook = () => raw;
    for (const lane of ['stage', 'output', 'input', 'core'] as const) {
      // Each lane is a NEW operation: a prior poisoned stage cannot stand in for admission.
      const f = fixture(hook, false, 'meta.facts');
      f.runtime.setModelOptions(f.model.modelName, {
        docPermissions: { read: hook },
        documentPermissionField: 'meta.facts',
      } as never);
      const operation = () =>
        lane === 'stage'
          ? resolveDocumentStage(
              createDocumentStage(f.authorization, f.binding, f.snapshot),
              hook as DocumentGrantResolver,
            )
          : lane === 'output'
            ? resolveOutputDocumentStage(f)
            : lane === 'input'
              ? resolveInputDocumentGrants({ ...f, doc: f.snapshot })
              : f.core.genDocPermissions(f.model.modelName, f.snapshot, 'read', f.context);
      await expect(runWithRuntime(f.runtime, operation)).rejects.toMatchObject({ result: { code: 'bad_request' } });
      expect(f.warn).not.toHaveBeenCalled();
      expect('resolveFinalizerDocPermissions' in f.core).toBe(false);
    }
  });

  it.each(['accessor', 'then', 'proxy'] as const)('rejects sync %s without observing getters/traps', async (kind) => {
    const observe = vi.fn(() => true);
    const raw =
      kind === 'proxy'
        ? new Proxy({ owner: true }, { get: observe, getPrototypeOf: observe, ownKeys: observe })
        : Object.defineProperty({ owner: true }, kind, { enumerable: true, get: observe });
    const f = fixture(() => raw);
    await expect(runWithRuntime(f.runtime, () => resolveOutputDocumentStage(f))).rejects.toMatchObject({
      result: { code: 'bad_request' },
    });
    expect(observe).not.toHaveBeenCalled();
  });

  it('accepts 19999 keys and null-prototype maps', async () => {
    const f = fixture();
    const raw = Object.assign(
      Object.create(null),
      Object.fromEntries(Array.from({ length: 19999 }, (_, i) => [`fact${i}`, i % 2 === 0])),
    );
    const stage = createDocumentStage(f.authorization, f.binding, f.snapshot);
    await resolveDocumentStage(stage, () => raw);
    expect(Object.keys(readDocumentStage(stage, f.binding).grants)).toHaveLength(19999);
  });

  it.each(['missing', 'throw', 'reject', 'invalid'] as const)(
    'distinguishes %s from invalid fulfillment and logger failure',
    async (kind) => {
      const hook =
        kind === 'missing'
          ? undefined
          : kind === 'throw'
            ? () => {
                throw new Error('app');
              }
            : kind === 'reject'
              ? () => Promise.reject(new Error('app'))
              : () => ({ owner: 'invalid' });
      const f = fixture(hook);
      f.warn.mockImplementation(() => {
        throw new Error('logger');
      });
      const operation = runWithRuntime(f.runtime, () => resolveOutputDocumentStage(f));
      if (kind === 'invalid') await expect(operation).rejects.toMatchObject({ result: { code: 'bad_request' } });
      else {
        const handle = await operation;
        const facts = readDocumentStage(handle, f.binding).grants;
        expect(facts).toEqual({});
        expect(Object.isFrozen(facts)).toBe(true);
      }
      expect(f.warn).toHaveBeenCalledTimes(kind === 'throw' || kind === 'reject' ? 1 : 0);
    },
  );

  it('preserves normalized pre-write positive/string AND and negative function predicates', async () => {
    const returned = { suspended: true, owner: true };
    const f = fixture(() => returned);
    const permissionSchema = {
      name: { update: (_permissions: Permission, facts: Readonly<Record<string, boolean>>) => !facts.suspended },
      allowed: { update: 'reader doc:owner' },
      denied: { update: 'absent doc:owner' },
    };
    const authorization = resolveServiceAuthorization({
      binding: f.binding,
      requestPermissions: f.actor,
      configuration: { ...f.configuration, permissionSchema, modelPermissionPrefix: 'doc:' },
      access: { operation: 'update', virtualAccess: 'update', outputAccess: 'read', docPermissionsAccess: 'update' },
      applicability: 'mutation',
    });
    const grants = await resolveInputDocumentGrants({ ...f, authorization, doc: f.snapshot });
    returned.suspended = false;
    expect(await requestInputFields({ authorization, binding: f.binding, access: 'update', grants })).toEqual([
      'allowed',
    ]);
  });
});

describe('owned actor and captured lookup slots (OAR-02)', () => {
  it('has actual private backing and stable frozen keys', () => {
    const source = { reader: true, denied: false };
    const actor = new Permission(source);
    const keys = actor.keys;
    source.reader = false;
    expect(Object.keys(actor)).toEqual([]);
    expect(Object.isFrozen(actor)).toBe(true);
    expect(Object.isFrozen(keys)).toBe(true);
    expect(actor.keys).toBe(keys);
    expect(actor.has('reader')).toBe(true);
    expect(actor.hasKey('denied')).toBe(true);
    expect(actor.hasAny(['denied', 'reader'])).toBe(true);
    expect(actor.hasAll('reader', 'denied')).toBe(false);
    expect(actor.has('toString')).toBe(false);
  });

  it('does not recopy actor maps for internal reads or derived children', () => {
    const f = fixture();
    const captured = getAuthorizationPermissions(f.authorization, f.binding);
    for (let i = 0; i < 24; i++) expect(getAuthorizationPermissions(f.authorization, f.binding)).toBe(captured);
    const child = resolveServiceAuthorization({
      parent: f.authorization,
      binding: f.binding,
      configuration: f.configuration,
      requestPermissions: captured,
      access: { operation: 'read', virtualAccess: 'read', outputAccess: 'read', docPermissionsAccess: 'read' },
    });
    expect(getAuthorizationPermissions(child, f.binding)).toBe(captured);
    expect(f.binding.request[PERMISSIONS]).toBe(f.actor);
  });

  it('does not treat function-attached lookup slots as live option containers', async () => {
    const original = vi.fn(() => ({ owner: true }));
    const replacement = vi.fn(() => ({ owner: false }));
    const bare = Object.assign(original, { read: replacement, default: replacement });
    const f = fixture();
    const authorization = resolveServiceAuthorization({
      binding: f.binding,
      requestPermissions: f.actor,
      configuration: { ...f.configuration, docPermissions: bare },
      access: { operation: 'read', virtualAccess: 'read', outputAccess: 'read', docPermissionsAccess: 'read' },
    });
    bare.read = replacement;
    const handle = await runWithRuntime(f.runtime, () => resolveOutputDocumentStage({ ...f, authorization }));
    expect(readDocumentStage(handle, f.binding).grants).toEqual({ owner: true });
    expect(original).toHaveBeenCalledTimes(1);
    expect(replacement).not.toHaveBeenCalled();
    expect(readServiceAuthorization(authorization, f.binding).configuration.docPermissions).toBe(original);
  });
});
