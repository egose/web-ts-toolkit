import * as fs from 'node:fs/promises';
import path from 'node:path';
import mongoose from 'mongoose';
import { afterAll, afterEach, describe, expect, it, vi } from 'vitest';
import { captureAuthorizationFieldCatalog } from '../../src/acl/field-catalog';
import {
  admitModelInput,
  assertModelInputComplexity,
  sanitizePreparedInput,
} from '../../src/acl/model-input-admission';
import { ServiceAuthorizationError } from '../../src/acl/service-authorization';
import type { ModelHookContext } from '../../src/interfaces';
import { deferred } from '../support/public/hook-admission-fixture';
import { quietOutput, sourceModes } from '../support/private/owned-stage-test-fixture';
import { writeOutputFixture } from '../support/private/write-output-test-fixture';

const observations: object[] = [];
afterEach(() => vi.restoreAllMocks());
afterAll(async () => {
  if (!process.env.CWO03_PREPARED_REPORT) return;
  const target = path.resolve(process.env.CWO03_PREPARED_REPORT);
  expect(target.startsWith(`${path.resolve(process.env.TMPDIR!)}${path.sep}`)).toBe(true);
  await fs.writeFile(target, JSON.stringify(observations));
});

const catalog = () =>
  captureAuthorizationFieldCatalog(
    new mongoose.Schema({ value: mongoose.Schema.Types.Mixed, when: Date, payload: mongoose.Schema.Types.Mixed }),
    { receipt: {} },
  );
const boundaries = ['preflight', 'admission', 'prepared'] as const;
function rejection(run: () => unknown) {
  let caught: unknown;
  try {
    run();
  } catch (error) {
    caught = error;
  }
  expect(caught).toBeInstanceOf(ServiceAuthorizationError);
  const result = (caught as ServiceAuthorizationError).result;
  expect(result).toMatchObject({ success: false, kind: 'error', code: 'bad_request' });
  return result;
}
function admit(boundary: (typeof boundaries)[number], data: Record<string, unknown>) {
  if (boundary === 'preflight') return assertModelInputComplexity(data, { maxNodes: 20000, maxDepth: 100 });
  if (boundary === 'prepared') return sanitizePreparedInput(data, catalog());
  return admitModelInput({
    data,
    requestFields: ['value', 'when'],
    inputFields: { mode: 'request' },
    catalog: catalog(),
  });
}
const operations = ['create', 'update'] as const;
type Fixture = ReturnType<typeof writeOutputFixture>;
function write(f: Fixture, operation: (typeof operations)[number], entry: 'direct' | 'public') {
  const data = { value: 'submitted', hidden: 'denied' },
    args = { select: ['value', '-_id'] };
  return entry === 'public'
    ? operation === 'create'
      ? f.public._create(data, args, quietOutput)
      : f.public._update('existing', data, args, quietOutput)
    : operation === 'create'
      ? f.direct.create(data, args, quietOutput)
      : f.direct.updateById('existing', data, args, quietOutput);
}

describe('discarded input remains structurally bounded at each input boundary', () => {
  it.each(
    boundaries.flatMap((boundary) => (['dense', 'sparse', 'map'] as const).map((shape) => ({ boundary, shape }))),
  )('$boundary bounds a discarded $shape subtree before selection/scrub', ({ boundary, shape }) => {
    const discarded =
      shape === 'dense'
        ? Array(20000).fill('discarded')
        : shape === 'sparse'
          ? new Array(20000)
          : new Map(Array.from({ length: 20000 }, (_, index) => [`k${index}`, 'discarded']));
    const data = { value: 'business', _permissions: discarded };
    const result = rejection(() => admit(boundary, data));
    expect(result.errors![0].detail).toBe('Service authorization: input exceeds maximum node budget of 20000');
    expect(data._permissions).toBe(discarded);
    observations.push({ kind: 'discarded-bound', boundary, shape, result, maxNodes: 20000 });
  });

  it.each(boundaries)('%s bounds a native toObject result, not merely the original document', (boundary) => {
    const f = writeOutputFixture('isolated');
    const native = new f.model({});
    const normalized = { value: 'business', _permissions: new Array(20000) };
    const convert = vi.spyOn(native, 'toObject').mockReturnValue(normalized as never);
    const result = rejection(() => admit(boundary, native as never));
    expect(result.errors![0].detail).toBe('Service authorization: input exceeds maximum node budget of 20000');
    expect(convert).toHaveBeenCalledExactlyOnceWith({ virtuals: false, flattenMaps: true });
    expect(Object.hasOwn(normalized._permissions, 0)).toBe(false);
    observations.push({ kind: 'normalized-return-bound', boundary, result, conversions: 1, maxNodes: 20000 });
  });

  it('preflight validates its normalized snapshot even when a later native removes an earlier unsafe key', () => {
    const early: Record<string, unknown> = { constructor: 'unsafe' };
    const data = { early, when: new Date(1) };
    const native = vi.spyOn(data.when, 'getTime').mockImplementation(() => {
      Reflect.deleteProperty(early, 'constructor');
      return 1;
    });
    const result = rejection(() => assertModelInputComplexity(data, {}));
    expect(result.errors![0].detail).toBe('Service authorization: Unsupported key: constructor');
    expect(native).toHaveBeenCalledOnce();
    expect(Object.hasOwn(early, 'constructor')).toBe(false);
    observations.push({ kind: 'preflight-snapshot', result, nativeCalls: 1, originalKeyRemoved: true });
  });
});

describe('phase-local normalization retains native multiplicity and detached business shape', () => {
  it('normalizes discarded native input too and independently copies selected native input', () => {
    const original = Date.prototype.getTime;
    const requested = new Date(1),
      discarded = new Date(2);
    const events: string[] = [];
    const native = vi.spyOn(Date.prototype, 'getTime').mockImplementation(function () {
      events.push(this === requested ? 'requested.raw' : this === discarded ? 'discarded.raw' : 'requested.normalized');
      return Reflect.apply(original, this, []) + 10;
    });
    const result = admitModelInput({
      data: { when: requested, hidden: discarded },
      requestFields: ['when'],
      inputFields: { mode: 'request' },
      catalog: catalog(),
    });
    expect(events).toEqual(['requested.raw', 'discarded.raw', 'requested.normalized']);
    expect(result.allowedData).not.toHaveProperty('hidden');
    expect(result.allowedData.when).not.toBe(requested);
    expect(Reflect.apply(original, result.allowedData.when, [])).toBe(21);
    expect(Reflect.apply(original, requested, [])).toBe(1);
    expect(native).toHaveBeenCalledTimes(3);
    observations.push({ kind: 'selected-native-copy', events, normalizedSelectedTime: 21, originalTime: 1 });
  });

  it('prepared Map/class/shared/sparse values normalize per occurrence without aliasing protected data', () => {
    const date = new Date(1);
    const native = vi.spyOn(date, 'getTime').mockReturnValue(7);
    const bytes = Buffer.from([1, 2]);
    const id = new mongoose.mongo.BSON.ObjectId();
    class Prepared {
      keep = { date, bytes, id };
      receipt = 'virtual';
      _permissions = { forged: true };
    }
    const shared = new Prepared();
    const sparse = new Array(2);
    sparse[1] = shared;
    const input = {
      payload: new Map<string, unknown>([
        ['first', shared],
        ['second', sparse],
      ]),
    };
    const result = sanitizePreparedInput(input, catalog()) as any;
    expect(native).toHaveBeenCalledTimes(2);
    expect(result.payload).not.toBe(input.payload);
    expect(result.payload.first).not.toBe(shared);
    expect(result.payload.first).not.toBe(result.payload.second[1]);
    expect(Object.hasOwn(result.payload.second, 0)).toBe(false);
    for (const entry of [result.payload.first, result.payload.second[1]]) {
      expect(Object.keys(entry)).toEqual(['keep']);
      expect(entry.keep.date).toEqual(new Date(7));
      expect(entry.keep.date).not.toBe(date);
      expect(entry.keep.bytes).toEqual(bytes);
      expect(entry.keep.bytes).not.toBe(bytes);
      expect(entry.keep.id.equals(id)).toBe(true);
      expect(entry.keep.id).not.toBe(id);
    }
    result.payload.first.keep.bytes[0] = 9;
    expect(result.payload.second[1].keep.bytes[0]).toBe(1);
    expect(bytes[0]).toBe(1);
    expect(shared.receipt).toBe('virtual');
    expect(shared._permissions).toEqual({ forged: true });
    observations.push({
      kind: 'prepared-shape',
      nativeCalls: 2,
      sparse: true,
      distinctOccurrences: true,
      detached: true,
    });
  });
});

describe('supported service overrides do not certify validated or prepared graphs', () => {
  it.each(sourceModes.flatMap((mode) => operations.map((operation) => ({ mode, operation }))))(
    '$mode direct $operation re-admits retained allowedData changed while prepare is suspended',
    async ({ mode, operation }) => {
      const f = writeOutputFixture(mode);
      const entered = deferred(),
        release = deferred();
      const events: string[] = [];
      let context!: ModelHookContext;
      const validate = vi.spyOn(f.direct, 'validate').mockImplementation(async function (data, access, lifecycle) {
        expect(this).toBe(f.direct);
        expect(access).toBe(operation);
        expect(data).toEqual({ value: 'submitted' });
        context = lifecycle;
        events.push('validate');
        return true;
      });
      const prepare = vi.spyOn(f.direct, 'prepare').mockImplementation(async function (data, access, lifecycle) {
        expect(this).toBe(f.direct);
        expect(access).toBe(operation);
        expect(lifecycle).toBe(context);
        expect(data).toBe(context.allowedData);
        events.push('prepare.enter');
        entered.resolve();
        await release.promise;
        events.push('prepare.exit');
        return data;
      });
      const transform = vi.spyOn(f.direct, 'transform');
      const pending = write(f, operation, 'direct');
      try {
        await entered.promise;
        context.allowedData!._permissions = new Array(20000);
        events.push('retained.mutation');
      } finally {
        release.resolve();
      }
      const result = await pending;
      expect(result).toMatchObject({ success: false, code: 'bad_request' });
      expect(JSON.stringify(result)).toContain('maximum node budget');
      expect(result).not.toHaveProperty('data');
      expect(events).toEqual(['validate', 'prepare.enter', 'retained.mutation', 'prepare.exit']);
      expect(validate).toHaveBeenCalledOnce();
      expect(prepare).toHaveBeenCalledOnce();
      expect(transform).not.toHaveBeenCalled();
      expect(f.saves).not.toHaveBeenCalled();
      expect(f.adapter.create).not.toHaveBeenCalled();
      expect(f.saved).toEqual([]);
      expect(f.stored.get('value')).toBe('before');
      observations.push({ kind: 'retained-context-bound', mode, operation, events, code: result.code, writes: 0 });
    },
  );

  it.each(sourceModes.flatMap((mode) => operations.map((operation) => ({ mode, operation }))))(
    '$mode public $operation bounds a protected subtree expanded by native prepared normalization',
    async ({ mode, operation }) => {
      const f = writeOutputFixture(mode);
      const normalized = { value: 'prepared', when: new Date(1), _permissions: {} as Record<string, unknown> };
      const native = vi.spyOn(normalized.when, 'getTime').mockImplementation(() => {
        normalized._permissions.large = new Array(20000);
        return 1;
      });
      const prepare = vi.spyOn(f.public, 'prepare').mockResolvedValue(normalized as never);
      const result = await write(f, operation, 'public');
      expect(result).toMatchObject({ success: false, code: 'bad_request' });
      expect(JSON.stringify(result)).toContain('maximum node budget');
      expect(result).not.toHaveProperty('data');
      expect(native).toHaveBeenCalledOnce();
      expect(prepare).toHaveBeenCalledOnce();
      expect(f.saves).not.toHaveBeenCalled();
      expect(f.adapter.create).not.toHaveBeenCalled();
      expect(f.saved).toEqual([]);
      expect(f.stored.get('value')).toBe('before');
      observations.push({
        kind: 'prepared-native-expansion',
        mode,
        operation,
        nativeCalls: 1,
        code: result.code,
        writes: 0,
      });
    },
  );

  it.each(
    sourceModes.flatMap((mode) =>
      operations.flatMap((operation) => (['direct', 'public'] as const).map((entry) => ({ mode, operation, entry }))),
    ),
  )(
    '$mode $entry $operation normalizes override output before scrub without lending retained input',
    async ({ mode, operation, entry }) => {
      const f = writeOutputFixture(mode, { virtuals: { receipt: { read: () => 'computed' } } });
      const service = entry === 'direct' ? f.direct : f.public;
      const early = { keep: 'before-native', receipt: 'virtual', _permissions: { forged: true } };
      const prepared = {
        value: 'prepared',
        hidden: 'trusted-business',
        payload: early,
        when: new Date(1),
        receipt: 'virtual',
      };
      const events: string[] = [];
      const native = vi.spyOn(prepared.when, 'getTime').mockImplementation(() => {
        events.push('native');
        early.keep = 'after-native';
        return 7;
      });
      const external = new f.model({});
      const convert = vi.spyOn(external, 'toObject').mockImplementation((options) => {
        expect(options).toEqual({ virtuals: false, flattenMaps: true });
        events.push('toObject');
        return prepared as never;
      });
      let context!: ModelHookContext;
      const validate = vi.spyOn(service, 'validate').mockImplementation(async function (data, access, lifecycle) {
        expect(this).toBe(service);
        expect(access).toBe(operation);
        expect(data).toEqual({ value: 'submitted' });
        context = lifecycle;
        lifecycle.allowedData!.hidden = 'validated-business';
        lifecycle.allowedData!._permissions = { forged: true };
        events.push('validate');
        return true;
      });
      const prepare = vi.spyOn(service, 'prepare').mockImplementation(async function (data, access, lifecycle) {
        expect(this).toBe(service);
        expect(access).toBe(operation);
        expect(data).toBe(context.allowedData);
        expect(lifecycle).toBe(context);
        expect(data).toHaveProperty('hidden', 'validated-business');
        events.push('prepare');
        return external as never;
      });
      const result = await write(f, operation, entry);
      expect(result, JSON.stringify(result)).toMatchObject({ success: true });
      expect(events).toEqual(['validate', 'prepare', 'toObject', 'native']);
      expect(validate).toHaveBeenCalledOnce();
      expect(prepare).toHaveBeenCalledOnce();
      expect(convert).toHaveBeenCalledOnce();
      expect(native).toHaveBeenCalledOnce();
      expect(context.preparedData).toMatchObject({
        value: 'prepared',
        hidden: 'trusted-business',
        payload: { keep: 'before-native' },
        when: new Date(7),
      });
      expect(context.preparedData).not.toBe(prepared);
      expect(context.preparedData!.payload).not.toBe(early);
      expect(context.preparedData).not.toHaveProperty('receipt');
      expect(context.preparedData!.payload).not.toHaveProperty('_permissions');
      expect(context.allowedData).toHaveProperty('_permissions', { forged: true });
      expect(prepared.payload.keep).toBe('after-native');
      expect(prepared).toHaveProperty('receipt', 'virtual');
      expect(f.saved).toHaveLength(1);
      expect(f.saved[0]).toMatchObject({
        value: 'prepared',
        hidden: 'trusted-business',
        payload: { keep: 'before-native' },
      });
      expect(f.saved[0]).not.toHaveProperty('receipt');
      expect(f.saved[0].payload).not.toHaveProperty('_permissions');
      prepared.payload.keep = 'after-return';
      context.allowedData!.value = 'after-return';
      expect(context.preparedData!.payload).toEqual({ keep: 'before-native' });
      expect(f.saved[0].value).toBe('prepared');
      observations.push({
        kind: 'override-normalization',
        mode,
        operation,
        entry,
        events,
        conversions: 1,
        nativeCalls: 1,
        writes: 1,
        detached: true,
      });
    },
  );
});
