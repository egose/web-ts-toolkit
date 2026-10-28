import mongoose from 'mongoose';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { Core } from '../src/core';
import { Service } from '../src/services/service';
import { AccessRuntime } from '../src/runtime';
import { runWithRuntime } from '../src/runtime-context';
import Permission from '../src/permission';
import { PERMISSIONS } from '../src/symbols';
import type { ModelRequest } from '../src/interfaces';
import type { AuthorizationBinding } from '../src/acl/service-authorization';
import * as authorization from '../src/acl/service-authorization';
import * as planning from '../src/acl/model-output-planning';
import {
  createServiceExecution,
  deriveServiceExecution,
  readServiceExecution,
  withExecutionHydration,
} from '../src/acl/service-execution';

const access = (operation = 'list') => ({
  operation,
  rowAccess: operation,
  virtualAccess: operation,
  outputAccess: operation,
  docPermissionsAccess: operation,
});
let serial = 0;
function fixture() {
  const model = mongoose.model(`ArcpuExecution${++serial}`, new mongoose.Schema({ status: String, customer: String }));
  const runtime = new AccessRuntime();
  runtime.registerModelInstance(model.modelName, model);
  runtime.setModelOptions(model.modelName, { permissionSchema: { status: true } });
  const req = { [PERMISSIONS]: new Permission({ reader: true }) } as unknown as ModelRequest;
  const service = runWithRuntime(runtime, () => {
    req.macl = new Core(req);
    return new Service(req, model.modelName);
  });
  return { service, runtime, req, model };
}

afterEach(() => {
  vi.restoreAllMocks();
  mongoose.deleteModel(/^ArcpuExecution/);
});

describe('ARCPU-04 narrow execution capture reads', () => {
  it('creates and changes hydration without full reads, and derives with only its required full read', () => {
    const f = fixture();
    const payload = (offset: number) => Array.from({ length: 128 }, (_, index) => new Date(offset + index));
    const configuration = {
      catalog: { paths: ['status', 'customer'] },
      defaults: { payload: payload(1000) },
      hydration: {
        find: 'lean',
        findOne: 'hydrated',
        findById: 'lean',
        publicRead: 'lean',
        publicList: 'hydrated',
      },
    };
    const targets = [
      {
        path: 'customer',
        modelName: 'Customer',
        configuration: { catalog: { paths: ['name'] }, defaults: { payload: payload(2000) } },
      },
    ];
    const policy = {
      rows: { mode: 'scope', filter: { payload: payload(3000) } },
      related: { customer: { model: 'Customer', rows: { mode: 'scope', filter: { payload: payload(4000) } } } },
    };
    const capture = vi.spyOn(planning, 'captureModelAuthorizationConfiguration');
    const full = vi.spyOn(authorization, 'readServiceAuthorization');
    const clone = vi.spyOn(Date.prototype, 'getTime');
    const execution = createServiceExecution(f.service, access(), policy, 'service', targets, undefined, configuration);
    const state = readServiceExecution(f.service, execution);
    expect(state.hydration).toBe('lean');
    expect(state.access).toBe(authorization.readServiceAuthorizationAccess(state.authorization, state.binding));
    expect(capture).not.toHaveBeenCalled(); // Explicit configuration wins over the receiver's live capture.
    expect(full).not.toHaveBeenCalled();
    // Required ownership/normalization copies only: 256 raw + 128 config + 128 targets + 256 normalized.
    expect(clone).toHaveBeenCalledTimes(768);
    clone.mockClear();
    for (const [source, expected] of [
      ['find', 'lean'],
      ['findOne', 'hydrated'],
      ['findById', 'lean'],
      ['publicRead', 'lean'],
      ['publicList', 'hydrated'],
      ['lean', 'lean'],
      ['hydrated', 'hydrated'],
    ] as const) {
      const changed = readServiceExecution(f.service, withExecutionHydration(f.service, execution, source));
      expect(changed.hydration).toBe(expected);
      expect(changed.authorization).toBe(state.authorization);
      expect(changed.family).toBe(state.family);
      expect(changed.access).toBe(state.access);
    }
    expect(full).not.toHaveBeenCalled();
    expect(clone).not.toHaveBeenCalled();

    const derived = readServiceExecution(f.service, deriveServiceExecution(f.service, execution, access('read')));
    expect(derived.access.outputAccess).toBe('read');
    expect(derived.hydration).toBe('lean');
    expect(derived.family).toBe(state.family);
    expect(derived.authorization).not.toBe(state.authorization);
    expect(full).toHaveBeenCalledTimes(1);
    expect(clone).toHaveBeenCalledTimes(512 + 768);
    clone.mockClear();
    authorization.readServiceAuthorization(derived.authorization, derived.binding);
    expect(clone).toHaveBeenCalledTimes(512); // Full reads still detach every unrelated native leaf.
  });

  it('detaches open hydration configuration, including native extensions, on every authenticated read', () => {
    const f = fixture();
    const native = {
      when: new Date(10),
      bytes: Buffer.from([1]),
      id: new mongoose.mongo.BSON.ObjectId(),
      decimal: mongoose.mongo.BSON.Decimal128.fromString('1.2'),
      long: mongoose.mongo.BSON.Long.fromNumber(4),
      map: new Map([['when', new Date(20)]]),
      set: new Set([new Date(30)]),
      pattern: /value/g,
    };
    native.pattern.lastIndex = 2;
    const configuration = { catalog: { paths: ['status'] }, hydration: { find: 'lean', native } };
    const execution = createServiceExecution(f.service, access(), undefined, 'service', [], undefined, configuration);
    const { authorization: call, binding } = readServiceExecution(f.service, execution);
    const read = () =>
      authorization.readServiceAuthorizationHydration(call, binding).hydration as typeof configuration.hydration;
    const first = read();
    expect(Object.isFrozen(first)).toBe(true);
    expect(Object.getOwnPropertyDescriptor(first, 'find')).toMatchObject({ value: 'lean', writable: false });
    expect(first.native).not.toBe(native);
    first.native.when.setTime(99);
    first.native.bytes[0] = 9;
    first.native.id.id = Buffer.alloc(12);
    first.native.decimal.bytes[0] ^= 255;
    first.native.long.low = 99;
    first.native.map.get('when')!.setTime(99);
    [...first.native.set][0].setTime(99);
    first.native.pattern.lastIndex = 99;
    const next = read();
    expect(next).not.toBe(first);
    expect(next.native.when.getTime()).toBe(10);
    expect(next.native.bytes[0]).toBe(1);
    expect(next.native.id.equals(native.id)).toBe(true);
    expect(next.native.decimal.toString()).toBe('1.2');
    expect(next.native.long.toNumber()).toBe(4);
    expect(next.native.map.get('when')!.getTime()).toBe(20);
    expect([...next.native.set][0].getTime()).toBe(30);
    expect(next.native.pattern.lastIndex).toBe(2);
    expect(authorization.readServiceAuthorization(call, binding).configuration.hydration).toEqual(next);
    for (const key of ['request', 'runtime', 'model', 'modelName', 'scopePath'] as const) {
      const wrong = {
        ...binding,
        [key]: key === 'modelName' ? 'Other' : key === 'scopePath' ? ['status'] : {},
      } as AuthorizationBinding;
      for (let repeat = 0; repeat < 2; repeat++) {
        expect(() => authorization.readServiceAuthorizationHydration(call, wrong)).toThrow(
          authorization.ServiceAuthorizationError,
        );
        expect(() => authorization.readServiceAuthorizationHydration({ ...call }, binding)).toThrow(
          authorization.ServiceAuthorizationError,
        );
      }
    }
    const getter = vi.fn(() => 'lean');
    expect(() =>
      createServiceExecution(f.service, access(), undefined, 'service', [], undefined, {
        catalog: configuration.catalog,
        hydration: Object.defineProperty({}, 'find', { get: getter, enumerable: true }),
      }),
    ).toThrow(authorization.ServiceAuthorizationError);
    expect(getter).not.toHaveBeenCalled();
    const other = fixture();
    expect(() => withExecutionHydration(other.service, execution, 'publicRead')).toThrow(
      authorization.ServiceAuthorizationError,
    );
  });

  it('retains native hydration slice isolation even for a direct explicit effective configuration', () => {
    const f = fixture();
    // The private configuration type is open. Do not assume runtime hydration normalization
    // proves arbitrary explicit/native-valued extensions safe to share.
    const mode = new Date(10);
    const execution = createServiceExecution(f.service, access(), undefined, 'service', [], undefined, {
      catalog: { paths: ['status'] },
      hydration: { find: mode, publicRead: mode },
    });
    const initial = readServiceExecution(f.service, execution).hydration as unknown as Date;
    expect(initial).not.toBe(mode);
    initial.setTime(99);
    mode.setTime(88);
    const changed = readServiceExecution(f.service, withExecutionHydration(f.service, execution, 'publicRead'));
    expect((changed.hydration as unknown as Date).getTime()).toBe(10);
  });
});
