import { afterEach, describe, expect, it, vi } from 'vitest';
import { mongo } from 'mongoose';
import Permission from '../src/permission';
import { AccessRuntime } from '../src/runtime';
import type { AccessRouterRequest } from '../src/interfaces/request';
import type { AuthorizationBinding, ResolveServiceAuthorizationInput } from '../src/acl/service-authorization';
import * as serviceAuthorization from '../src/acl/service-authorization';
import {
  getAuthorizationPermissions,
  readServiceAuthorization,
  readServiceAuthorizationAccess,
  readServiceDocumentPermissions,
  readServiceFinalizerConfiguration,
  readServiceOutputMetadata,
  readServiceOutputFieldAuthorization,
  readServiceOutputPolicy,
  resolveServiceAuthorization,
  ServiceAuthorizationError,
} from '../src/acl/service-authorization';
import {
  createDocumentAuthorizationStage,
  memoizeDocumentFieldDecision,
  readDocumentAuthorization,
  readDocumentAuthorizationAccess,
  resolveDocumentAuthorization,
} from '../src/acl/document-authorization';
import { copyOutputValue, evaluateAuthorizedOutputField } from '../src/acl/output-field-filter';
import { planAuthorizedModelProjection } from '../src/acl/output-projection';
import { finalizeModelOutputs, type FinalizeSnapshot } from '../src/output/finalize-model-output';

function fixture(): ResolveServiceAuthorizationInput {
  return {
    binding: {
      request: {} as AccessRouterRequest,
      runtime: new AccessRuntime(),
      model: {},
      modelName: 'Order',
    },
    access: { operation: 'read', virtualAccess: 'read', outputAccess: 'read', docPermissionsAccess: 'read' },
    configuration: {
      catalog: { paths: ['status', 'public', 'mixed', 'customer', '_id'], opaquePaths: ['mixed'] },
      permissionSchema: { status: true, public: true, mixed: true },
      modelPermissionPrefix: 'doc:',
      stripPermissionsField: true,
    },
    requestPermissions: new Permission({ reader: true, admin: false }),
  };
}

function planFor(input: ResolveServiceAuthorizationInput) {
  const call = resolveServiceAuthorization(input);
  const plan = planAuthorizedModelProjection({
    authorization: call,
    binding: input.binding,
    requestedSelect: ['status', 'public', 'mixed', '-_id'],
  });
  return { call, plan };
}

/** Four unrelated 128-Date payloads make any full graph copy observable, without timing assertions. */
function largeFixture(): ResolveServiceAuthorizationInput {
  const input = fixture();
  const payload = (offset: number) =>
    Array.from({ length: 128 }, (_, index) => ({ when: new Date(offset + index), values: [index, index + 1] }));
  return {
    ...input,
    configuration: { ...input.configuration, defaults: { payload: payload(1000) } },
    relatedTargets: [
      {
        path: 'customer',
        modelName: 'Customer',
        configuration: { catalog: { paths: ['name'] }, defaults: { payload: payload(2000) } },
      },
    ],
    authorization: {
      rows: { mode: 'scope', filter: { payload: payload(3000) } },
      outputFields: { mode: 'grant', paths: ['mixed'] },
      related: { customer: { model: 'Customer', rows: { mode: 'scope', filter: { payload: payload(4000) } } } },
    },
  };
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe('ARCPU-01 authenticated narrow authorization reads', () => {
  it('shares only validated primitive projections and one frozen permission view per call', () => {
    const input = fixture();
    const extension = new Map([['when', new Date(1)]]);
    const accessExtension = new Date(1);
    const paths = ['status', 'public', 'mixed', '_id'];
    const access = { ...input.access, extension: accessExtension };
    const catalog = { ...input.configuration.catalog, paths, extension };
    const sourcePermissions = vi.spyOn(input.requestPermissions, 'has');
    const call = resolveServiceAuthorization({
      ...input,
      access,
      configuration: { ...input.configuration, catalog },
      authorization: { outputFields: { mode: 'grant', paths: ['mixed'] } },
    });
    const output = readServiceOutputPolicy(call, input.binding);
    const permissions = getAuthorizationPermissions(call, input.binding);
    expect(sourcePermissions).toHaveBeenCalledTimes(2);
    paths.push('later');
    extension.clear();
    accessExtension.setTime(99);
    expect(readServiceOutputPolicy(call, input.binding)).toBe(output);
    expect(readServiceAuthorizationAccess(call, input.binding)).toBe(output.access);
    expect(output.access).not.toHaveProperty('extension');
    expect(output.catalog).not.toHaveProperty('extension');
    expect(output.catalog.paths).not.toContain('later');
    expect(Object.isFrozen(output)).toBe(true);
    expect(Object.isFrozen(output.access)).toBe(true);
    expect(Object.isFrozen(output.catalog)).toBe(true);
    expect(Object.isFrozen(output.catalog.paths)).toBe(true);
    expect(Object.isFrozen((output.outputFields as { paths: string[] }).paths)).toBe(true);
    expect(getAuthorizationPermissions(call, input.binding)).toBe(permissions);
    expect(sourcePermissions).toHaveBeenCalledTimes(2);
    expect(Object.isFrozen(permissions)).toBe(true);
    expect(Object.isFrozen(permissions.keys)).toBe(true);
    expect(Reflect.set(permissions, 'has', () => true)).toBe(false);
    const permissionRecord = (permissions as unknown as { permissions: Record<string, boolean> }).permissions;
    expect(Reflect.set(permissionRecord, 'admin', true)).toBe(false);
    expect(() => (permissions.keys as string[]).push('admin')).toThrow();
    const next = resolveServiceAuthorization(input);
    expect(getAuthorizationPermissions(next, input.binding)).not.toBe(permissions);
    (input.requestPermissions as unknown as { permissions: Record<string, boolean> }).permissions.admin = true;
    expect(permissions.has('admin')).toBe(false);
    expect(getAuthorizationPermissions(next, input.binding).has('admin')).toBe(false);
    // Unknown native-valued extensions still exist only in detached full reads.
    const full = readServiceAuthorization(call, input.binding);
    (full.configuration.catalog as typeof catalog).extension.clear();
    (full.access as typeof access).extension.setTime(99);
    const again = readServiceAuthorization(call, input.binding);
    expect((again.configuration.catalog as typeof catalog).extension.size).toBe(1);
    expect((again.access as typeof access).extension.getTime()).toBe(1);
  });

  it.each([new Date(1), Buffer.from([1]), new mongo.BSON.ObjectId(), new Map(), true, undefined])(
    'rejects non-string catalog paths instead of sharing mutable/malformed leaves: %s',
    (path) => {
      const input = fixture();
      expect(() =>
        resolveServiceAuthorization({
          ...input,
          configuration: { ...input.configuration, catalog: { paths: [path] as unknown as string[] } },
        }),
      ).toThrow(ServiceAuthorizationError);
    },
  );

  it('rejects sparse/native catalog arrays and non-string access values before sharing', () => {
    const input = fixture();
    for (const paths of [new Array(1), new Map(), new Set(['mixed'])]) {
      expect(() =>
        resolveServiceAuthorization({
          ...input,
          configuration: {
            ...input.configuration,
            catalog: { ...input.configuration.catalog, opaquePaths: paths as string[] },
          },
        }),
      ).toThrow(ServiceAuthorizationError);
    }
    expect(() =>
      resolveServiceAuthorization({
        ...input,
        access: { ...input.access, operation: new Date(1) as unknown as string },
      }),
    ).toThrow(ServiceAuthorizationError);
  });

  it('keeps open field-rule configuration and full-policy native leaves detached on every read', () => {
    const input = fixture();
    const native = {
      when: new Date(10),
      bytes: Buffer.from([1]),
      id: new mongo.BSON.ObjectId(),
      decimal: mongo.BSON.Decimal128.fromString('1.2'),
      long: mongo.BSON.Long.fromNumber(4),
      map: new Map([['when', new Date(20)]]),
    };
    const call = resolveServiceAuthorization({
      ...input,
      configuration: { ...input.configuration, permissionSchema: { native }, modelPermissionPrefix: native.map },
      authorization: { rows: { mode: 'scope', filter: { when: native.when, bytes: native.bytes, id: native.id } } },
    });
    const captured = readServiceOutputFieldAuthorization(call, input.binding);
    const leaves = (captured.permissionSchema as { native: typeof native }).native;
    leaves.when.setTime(99);
    leaves.bytes[0] = 9;
    leaves.id.id = Buffer.alloc(12);
    leaves.decimal.bytes[0] ^= 255;
    leaves.long.low = 99;
    leaves.map.get('when')!.setTime(99);
    (captured.modelPermissionPrefix as typeof native.map).clear();
    const again = readServiceOutputFieldAuthorization(call, input.binding);
    const unchanged = (again.permissionSchema as { native: typeof native }).native;
    expect(unchanged.when.getTime()).toBe(10);
    expect(unchanged.bytes[0]).toBe(1);
    expect(unchanged.id.equals(native.id)).toBe(true);
    expect(unchanged.decimal.toString()).toBe('1.2');
    expect(unchanged.long.toNumber()).toBe(4);
    expect(unchanged.map.get('when')!.getTime()).toBe(20);
    expect((again.modelPermissionPrefix as typeof native.map).size).toBe(1);
    const full = readServiceAuthorization(call, input.binding);
    const filter = (full.authorization.rows as { filter: Pick<typeof native, 'when' | 'bytes' | 'id'> }).filter;
    filter.when.setTime(99);
    filter.bytes[0] = 9;
    filter.id.id = Buffer.alloc(12);
    const later = readServiceAuthorization(call, input.binding);
    const laterFilter = (later.authorization.rows as { filter: typeof filter }).filter;
    expect(laterFilter.when.getTime()).toBe(10);
    expect(laterFilter.bytes[0]).toBe(1);
    expect(laterFilter.id.equals(native.id)).toBe(true);
  });

  it.each(['request', 'runtime', 'model', 'modelName', 'scopePath'] as const)(
    'authenticates every narrow read and warm permission/decision lookup against %s',
    async (key) => {
      const input = fixture();
      const { call, plan } = planFor(input);
      const stage = createDocumentAuthorizationStage(call, input.binding, { status: 'open' });
      const permissions = getAuthorizationPermissions(call, input.binding);
      const hook = vi.fn((_snapshot, captured) => {
        expect(captured).toBe(permissions);
        return {};
      });
      const handle = await resolveDocumentAuthorization(stage, hook);
      const decision = vi.fn((captured) => {
        expect(captured).toBe(permissions);
        return true;
      });
      await memoizeDocumentFieldDecision(handle, input.binding, 'warm', decision);
      await evaluateAuthorizedOutputField(handle, input.binding, 'status');
      readServiceAuthorizationAccess(call, input.binding);
      readServiceOutputPolicy(call, input.binding);
      readServiceOutputFieldAuthorization(call, input.binding);
      readDocumentAuthorizationAccess(handle, input.binding);
      const binding = {
        ...input.binding,
        [key]: key === 'modelName' ? 'Other' : key === 'scopePath' ? ['mixed'] : {},
      } as AuthorizationBinding;
      for (let repeat = 0; repeat < 2; repeat++) {
        for (const read of [
          readServiceAuthorizationAccess,
          readServiceDocumentPermissions,
          readServiceFinalizerConfiguration,
          readServiceOutputMetadata,
          readServiceOutputPolicy,
          readServiceOutputFieldAuthorization,
          getAuthorizationPermissions,
        ]) {
          expect(() => read(call, binding)).toThrow(ServiceAuthorizationError);
          expect(() => read({ ...call }, input.binding)).toThrow(ServiceAuthorizationError);
        }
        expect(() => readDocumentAuthorizationAccess(handle, binding)).toThrow(ServiceAuthorizationError);
        expect(() => readDocumentAuthorization(handle, binding)).toThrow(ServiceAuthorizationError);
        expect(() => memoizeDocumentFieldDecision(handle, binding, 'warm', decision)).toThrow(
          ServiceAuthorizationError,
        );
        expect(() => evaluateAuthorizedOutputField(handle, binding, 'status')).toThrow(ServiceAuthorizationError);
        expect(() => copyOutputValue('value', { ...plan, authorizationBinding: binding }, 'status')).toThrow(
          ServiceAuthorizationError,
        );
      }
      expect(hook).toHaveBeenCalledTimes(1);
      expect(decision).toHaveBeenCalledTimes(1);
    },
  );

  it('detaches finalizer, hook-lookup and metadata native slices on every read', () => {
    const input = fixture();
    const native = {
      when: new Date(10),
      bytes: Buffer.from([1]),
      id: new mongo.BSON.ObjectId(),
      map: new Map([['when', new Date(20)]]),
    };
    const hook = () => ({});
    const call = resolveServiceAuthorization({
      ...input,
      configuration: {
        ...input.configuration,
        exposedDocPermissionKeys: native,
        docPermissions: { read: hook, native },
        virtuals: { v: { get: hook, native } },
      },
    });
    for (const read of [readServiceFinalizerConfiguration, readServiceDocumentPermissions, readServiceOutputMetadata]) {
      const first = read(call, input.binding) as Record<string, unknown>;
      const mutate = (value: typeof native) => {
        value.when.setTime(99);
        value.bytes[0] = 9;
        value.id.id = Buffer.alloc(12);
        value.map.get('when')!.setTime(99);
      };
      if ('virtuals' in first) mutate((first.virtuals as { v: { native: typeof native } }).v.native);
      if ('docPermissions' in first) mutate((first.docPermissions as { native: typeof native }).native);
      if ('exposedDocPermissionKeys' in first) mutate(first.exposedDocPermissionKeys as typeof native);
      const next = read(call, input.binding) as Record<string, unknown>;
      const unchanged = [
        ...(next.virtuals ? [(next.virtuals as { v: { native: typeof native } }).v.native] : []),
        ...(next.docPermissions ? [(next.docPermissions as { native: typeof native }).native] : []),
        ...(next.exposedDocPermissionKeys ? [next.exposedDocPermissionKeys as typeof native] : []),
      ];
      for (const value of unchanged) {
        expect(value.when.getTime()).toBe(10);
        expect(value.bytes[0]).toBe(1);
        expect(value.id.equals(native.id)).toBe(true);
        expect(value.map.get('when')!.getTime()).toBe(20);
      }
      if (next.docPermissions) expect((next.docPermissions as { read: Function }).read).toBe(hook);
    }
    expect(native.when.getTime()).toBe(10);
    expect(native.map.get('when')!.getTime()).toBe(20);
  });

  it('validates changed snapshots before narrow reads and cached field decisions', async () => {
    const input = fixture();
    const { call } = planFor(input);
    const snapshot = { status: 'open' };
    const stage = createDocumentAuthorizationStage(call, input.binding, snapshot);
    const handle = await resolveDocumentAuthorization(stage, () => ({}));
    expect(await evaluateAuthorizedOutputField(handle, input.binding, 'status')).toBe(true);
    snapshot.status = 'changed';
    expect(() => readDocumentAuthorizationAccess(handle, input.binding)).toThrow(ServiceAuthorizationError);
    expect(() => evaluateAuthorizedOutputField(handle, input.binding, 'status')).toThrow(ServiceAuthorizationError);
  });

  it('does not copy grants for identity/access reads, but keeps grant-bearing reads detached', async () => {
    const input = fixture();
    const call = resolveServiceAuthorization(input);
    const stage = createDocumentAuthorizationStage(call, input.binding, {});
    const handle = await resolveDocumentAuthorization(stage, () => ({ when: new Date(10) }));
    const clone = vi.spyOn(Date.prototype, 'getTime');
    readDocumentAuthorizationAccess(handle, input.binding);
    readDocumentAuthorizationAccess(handle, input.binding);
    expect(clone).not.toHaveBeenCalled();
    const full = readDocumentAuthorization(handle, input.binding);
    expect(clone).toHaveBeenCalledTimes(1);
    (full.grants.when as Date).setTime(99);
    expect((readDocumentAuthorization(handle, input.binding).grants.when as Date).getTime()).toBe(10);
  });

  it('does zero unrelated Date copies across repeated access/catalog/rule/document and output-value reads', async () => {
    const input = largeFixture();
    const { call, plan } = planFor(input);
    const stage = createDocumentAuthorizationStage(call, input.binding, { status: 'open' });
    const handle = await resolveDocumentAuthorization(stage, () => ({}));
    const clone = vi.spyOn(Date.prototype, 'getTime');
    for (let repeat = 0; repeat < 4; repeat++) {
      expect(readServiceAuthorizationAccess(call, input.binding).outputAccess).toBe('read');
      expect(readServiceOutputPolicy(call, input.binding).catalog.paths).toContain('mixed');
      expect(readServiceOutputFieldAuthorization(call, input.binding).permissionSchema).toHaveProperty('status', true);
      expect(readServiceOutputMetadata(call, input.binding).stripPermissionsField).toBe(true);
      expect(readServiceFinalizerConfiguration(call, input.binding)).not.toHaveProperty('defaults');
      expect(readServiceDocumentPermissions(call, input.binding)).not.toHaveProperty('relatedTargets');
      expect(readDocumentAuthorization(handle, input.binding).outputAccess).toBe('read');
      expect(readDocumentAuthorizationAccess(handle, input.binding).authorization).toBe(call);
      expect(await evaluateAuthorizedOutputField(handle, input.binding, 'status')).toBe(true);
      expect(copyOutputValue({ safe: 'value', __v: 'hidden' }, plan, 'mixed')).toEqual({ safe: 'value' });
    }
    expect(clone).not.toHaveBeenCalled();
    readServiceAuthorization(call, input.binding);
    expect(clone).toHaveBeenCalledTimes(512);
  });

  it.each([1, 2, 7])('prepares ordinary no-virtual list setup once for %s rows', async (rows) => {
    const input = largeFixture();
    const { plan } = planFor(input);
    expect(plan.candidates).toEqual([]);
    expect(plan.childPlans).toEqual({});
    const fullRead = vi.spyOn(serviceAuthorization, 'readServiceAuthorization');
    const outputRead = vi.spyOn(serviceAuthorization, 'readServiceOutputPolicy');
    const rulesRead = vi.spyOn(serviceAuthorization, 'readServiceOutputFieldAuthorization');
    const clone = vi.spyOn(Date.prototype, 'getTime');
    const inputs = Array.from({ length: rows }, (_, index) => ({
      status: `row:${index}`,
      public: 'visible',
      mixed: { safe: `row:${index}` },
    }));
    const outputs = await finalizeModelOutputs({
      receivingModelName: 'Order',
      request: input.binding.request,
      plan,
      snapshot: input.configuration as FinalizeSnapshot,
      ...input.access,
      inputs,
    });
    expect(outputs).toEqual(inputs);
    expect(outputs[0]).not.toBe(inputs[0]);
    expect(outputs[0].mixed).not.toBe(inputs[0].mixed);
    expect(outputRead).toHaveBeenCalledTimes(1 + 3 * rows);
    // ARCPU-02 owns one detached rule slice for this call, not one per row/field.
    expect(rulesRead).toHaveBeenCalledTimes(1);
    // ARCPU-07 narrows even the pass setup: unrelated configuration is never
    // traversed by finalization, including single-row service invocations.
    expect(fullRead).not.toHaveBeenCalled();
    expect(clone).not.toHaveBeenCalled();
  });
});
