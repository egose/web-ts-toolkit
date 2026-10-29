import mongoose, { mongo } from 'mongoose';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { Core } from '../src/core';
import Permission from '../src/permission';
import { AccessRuntime } from '../src/runtime';
import { runWithRuntime } from '../src/runtime-context';
import { Service } from '../src/services/service';
import { PERMISSIONS } from '../src/symbols';
import type { ModelRequest, ModelRouterOptions } from '../src/interfaces';
import { createServiceExecution, readServiceExecution } from '../src/acl/service-execution';
import { resolveServiceAuthorization, ServiceAuthorizationError } from '../src/acl/service-authorization';
import {
  assertDocumentAuthorization,
  assertDocumentAuthorizationStage,
  associateDocumentAuthorization,
  createDocumentAuthorizationStage,
  memoizeDocumentFieldDecision,
  readDocumentAuthorization,
  readDocumentAuthorizationAccess,
  resolveDocumentAuthorization,
} from '../src/acl/document-authorization';
import * as snapshots from '../src/acl/authorization-snapshot';
import { PublicAdmissionError, assertPublicAdmission } from '../src/validation/public-admission';

const flag = 'unsafeSkipListDocumentSnapshotChecks';
const listAccess = {
  operation: 'list',
  rowAccess: 'list',
  virtualAccess: 'list',
  outputAccess: 'list',
  docPermissionsAccess: 'list',
};
let serial = 0;

function fixture(mode: unknown = false) {
  const model = mongoose.model(`ListSnapshot${++serial}`, new mongoose.Schema({ value: String }));
  const runtime = new AccessRuntime();
  const warn = vi.fn();
  runtime.setGlobalOptions({ logger: { warn } });
  runtime.registerModelInstance(model.modelName, model);
  runtime.setModelOptions(model.modelName, {
    permissionSchema: { value: true },
    [flag]: mode,
  } as ModelRouterOptions);
  const request = { [PERMISSIONS]: new Permission({ reader: true }) } as unknown as ModelRequest;
  const service = runWithRuntime(runtime, () => {
    request.macl = new Core(request);
    return new Service(request, model.modelName);
  });
  const capture = (access = listAccess, parent?: ReturnType<typeof resolveServiceAuthorization>) =>
    readServiceExecution(service, createServiceExecution(service, access, undefined, 'service', [], parent));
  return { runtime, model, service, request, warn, capture };
}

async function owner(f = fixture(true), access = listAccess) {
  const state = f.capture(access);
  const source = { value: 'original', date: new Date(1), bytes: Buffer.from([1]), id: new mongo.BSON.ObjectId() };
  const stage = createDocumentAuthorizationStage(state.authorization, state.binding, source);
  const handle = await resolveDocumentAuthorization(stage, () => ({ reader: true, bytes: Buffer.from([1]) }));
  return { ...f, ...state, source, stage, handle };
}

afterEach(() => {
  vi.restoreAllMocks();
  mongoose.deleteModel(/^ListSnapshot/);
});

describe('temporary server-only list snapshot setting', () => {
  it.each([undefined, false, 'true', 1, {}, new Boolean(true)])(
    'stays strict for non-literal opt-in %j',
    async (mode) => {
      const f = await owner(fixture(mode));
      f.source.value = 'changed';
      expect(() => readDocumentAuthorizationAccess(f.handle, f.binding)).toThrow(ServiceAuthorizationError);
      expect(f.warn).not.toHaveBeenCalled();
    },
  );

  it('warns once per model enable transition, not once per call or row', async () => {
    const f = fixture(true);
    expect(f.warn).toHaveBeenCalledTimes(1);
    expect(f.warn).toHaveBeenCalledWith(expect.stringContaining('UNSAFE'), { modelName: f.model.modelName });
    await owner(f);
    await owner(f);
    f.runtime.setModelOption(f.model.modelName, flag, true);
    expect(f.warn).toHaveBeenCalledTimes(1);
    f.runtime.setModelOption(f.model.modelName, flag, false);
    f.runtime.setModelOption(f.model.modelName, flag, true);
    expect(f.warn).toHaveBeenCalledTimes(2);
  });

  it('normalizes malformed model setters to strict mode and permits rollback', async () => {
    const f = fixture(true);
    f.runtime.setModelOption(f.model.modelName, flag, 'true' as never);
    expect(f.runtime.getModelOption(f.model.modelName, flag)).toBe(false);
    const strict = await owner(f);
    strict.source.value = 'changed';
    expect(() => readDocumentAuthorizationAccess(strict.handle, strict.binding)).toThrow(ServiceAuthorizationError);
    f.runtime.setModelOptions(f.model.modelName, { [flag]: true });
    const relaxed = await owner(f);
    relaxed.source.value = 'changed';
    expect(() => readDocumentAuthorizationAccess(relaxed.handle, relaxed.binding)).not.toThrow();
  });

  it('isolates model/runtime settings and ignores a same-spelled global option', async () => {
    const enabled = await owner(fixture(true));
    const other = fixture(false);
    other.runtime.setGlobalOptions({ [flag]: true } as never);
    const strict = await owner(other);
    enabled.source.value = strict.source.value = 'changed';
    expect(() => readDocumentAuthorizationAccess(enabled.handle, enabled.binding)).not.toThrow();
    expect(() => readDocumentAuthorizationAccess(strict.handle, strict.binding)).toThrow(ServiceAuthorizationError);
  });

  it('inherits defaults on a new model without relaxing an explicitly strict existing model', async () => {
    const f = fixture(false);
    f.runtime.setDefaultModelOptions({ [flag]: true });
    const other = mongoose.model(`ListSnapshot${++serial}`, new mongoose.Schema({ value: String }));
    f.runtime.registerModelInstance(other.modelName, other);
    f.runtime.setModelOptions(other.modelName, { permissionSchema: { value: true } });
    const service = runWithRuntime(f.runtime, () => new Service(f.request, other.modelName));
    const state = readServiceExecution(service, createServiceExecution(service, listAccess));
    const source = { value: 'original' };
    const handle = await resolveDocumentAuthorization(
      createDocumentAuthorizationStage(state.authorization, state.binding, source),
      () => ({}),
    );
    source.value = 'changed';
    expect(() => readDocumentAuthorizationAccess(handle, state.binding)).not.toThrow();
    const original = await owner(f);
    original.source.value = 'changed';
    expect(() => readDocumentAuthorizationAccess(original.handle, original.binding)).toThrow(ServiceAuthorizationError);
    expect(f.warn).toHaveBeenCalledTimes(1);
    expect(f.warn).toHaveBeenCalledWith(expect.stringContaining('UNSAFE'), { modelName: other.modelName });
  });

  it.each([false, true])('captures mode before a suspended list hook (initial unsafe=%s)', async (unsafe) => {
    const f = fixture(unsafe);
    const state = f.capture();
    const source = { value: 'original' };
    const stage = createDocumentAuthorizationStage(state.authorization, state.binding, source);
    let entered!: () => void, release!: () => void;
    const started = new Promise<void>((resolve) => {
      entered = resolve;
    });
    const waiting = new Promise<void>((resolve) => {
      release = resolve;
    });
    const pending = resolveDocumentAuthorization(stage, async () => {
      entered();
      await waiting;
      return { reader: true };
    });
    await started;
    f.runtime.setModelOption(f.model.modelName, flag, !unsafe);
    source.value = 'changed while awaiting';
    release();
    if (unsafe) {
      const handle = await pending;
      expect(() => readDocumentAuthorizationAccess(handle, state.binding)).not.toThrow();
    } else await expect(pending).rejects.toBeInstanceOf(ServiceAuthorizationError);
    const next = await owner(f);
    next.source.value = 'changed';
    if (unsafe)
      expect(() => readDocumentAuthorizationAccess(next.handle, next.binding)).toThrow(ServiceAuthorizationError);
    else expect(() => readDocumentAuthorizationAccess(next.handle, next.binding)).not.toThrow();
  });

  it.each(['read', 'create', 'update', 'subList'])(
    'does not relax %s, including list-access reads',
    async (operation) => {
      const f = await owner(fixture(true), { ...listAccess, operation });
      f.source.value = 'changed';
      expect(() => readDocumentAuthorizationAccess(f.handle, f.binding)).toThrow(ServiceAuthorizationError);
    },
  );

  it('does not relax fresh helper, embedded or related-derived calls', async () => {
    const f = fixture(true),
      state = f.capture();
    for (const kind of ['helper', 'embedded', 'related'] as const) {
      const input = {
        binding: { ...state.binding, scopePath: kind === 'embedded' ? ['child'] : [] },
        access: listAccess,
        configuration: { catalog: { paths: ['value'] }, [flag]: true },
        requestPermissions: new Permission({}),
        ...(kind === 'helper' ? {} : { parent: state.authorization, listResponse: true }),
      };
      const call = resolveServiceAuthorization(input);
      const source = { value: 'original' };
      const handle = await resolveDocumentAuthorization(
        createDocumentAuthorizationStage(call, input.binding, source),
        () => ({}),
      );
      source.value = 'changed';
      expect(() => readDocumentAuthorizationAccess(handle, input.binding)).toThrow(ServiceAuthorizationError);
    }
  });

  it.each([
    { scopePath: ['child'] },
    { access: { ...listAccess, rowAccess: 'read' } },
    { access: { ...listAccess, outputAccess: 'read' } },
    { applicability: 'output' as const },
  ])('does not accept a private list marker outside its exact output contract: %j', async (change) => {
    const f = fixture(true),
      state = f.capture();
    const binding = { ...state.binding, scopePath: 'scopePath' in change ? change.scopePath : [] };
    const call = resolveServiceAuthorization({
      binding,
      access: 'access' in change ? change.access : listAccess,
      applicability: 'applicability' in change ? change.applicability : 'service',
      configuration: { catalog: { paths: ['value'] }, [flag]: true },
      requestPermissions: new Permission({}),
      listResponse: true,
    });
    const source = { value: 'original' };
    const handle = await resolveDocumentAuthorization(
      createDocumentAuthorizationStage(call, binding, source),
      () => ({}),
    );
    source.value = 'changed';
    expect(() => readDocumentAuthorizationAccess(handle, binding)).toThrow(ServiceAuthorizationError);
  });

  it.each(['findOptions', 'publicListOptions'])('rejects the flag in method defaults.%s', (bucket) => {
    const f = fixture();
    expect(() => f.runtime.setModelOption(f.model.modelName, 'defaults', { [bucket]: { [flag]: true } })).toThrow(
      PublicAdmissionError,
    );
  });

  it('keeps same-spelled payload/predicate fields inert rather than treating them as configuration', () => {
    expect(() => assertPublicAdmission({ data: { [flag]: true }, filter: { [flag]: true } })).not.toThrow();
  });

  it.each(['args', 'options', 'authorization'])('rejects per-call opt-in through %s', async (slot) => {
    const f = fixture();
    const result = await f.service.find(
      {},
      slot === 'args' ? ({ [flag]: true } as never) : {},
      slot === 'options'
        ? ({ [flag]: true } as never)
        : slot === 'authorization'
          ? ({ authorization: { [flag]: true } } as never)
          : {},
    );
    expect(result).toMatchObject({ success: false, code: 'bad_request' });
  });
});

describe('retained protections and explicitly weakened source checks', () => {
  it('skips source comparisons but keeps detached hook snapshots, grant reads and field decisions', async () => {
    const f = fixture(true),
      state = f.capture();
    const source = { value: 'original', date: new Date(1) };
    const stage = createDocumentAuthorizationStage(state.authorization, state.binding, source);
    const matches = vi.spyOn(snapshots, 'matchesAuthorizationSnapshot');
    const handle = await resolveDocumentAuthorization(stage, (doc) => {
      expect(doc).not.toBe(source);
      (doc.date as Date).setTime(2);
      return { reader: true, date: new Date(3) };
    });
    expect(source.date.getTime()).toBe(1);
    source.value = 'changed';
    expect(readDocumentAuthorization(handle, state.binding).grants.reader).toBe(true);
    const a = readDocumentAuthorization(handle, state.binding).grants;
    (a.date as Date).setTime(99);
    expect((readDocumentAuthorization(handle, state.binding).grants.date as Date).getTime()).toBe(3);
    const decide = vi.fn(() => false);
    expect(await memoizeDocumentFieldDecision(handle, state.binding, 'request:list:value', decide)).toBe(false);
    expect(await memoizeDocumentFieldDecision(handle, state.binding, 'request:list:value', () => true)).toBe(false);
    expect(decide).toHaveBeenCalledTimes(1);
    expect(matches).not.toHaveBeenCalled();
  });

  it.each(['value', 'date', 'bytes', 'id'] as const)('deliberately stops detecting changed source %s', async (key) => {
    const f = await owner();
    if (key === 'value') f.source.value = 'changed';
    if (key === 'date') f.source.date.setTime(2);
    if (key === 'bytes') f.source.bytes[0] = 2;
    if (key === 'id') f.source.id.id = Buffer.alloc(12);
    expect(() => readDocumentAuthorizationAccess(f.handle, f.binding)).not.toThrow();
    expect(await memoizeDocumentFieldDecision(f.handle, f.binding, 'field', () => false)).toBe(false);
  });

  it('retains exact stage input, call, binding and unforgeable handle checks', async () => {
    const f = await owner();
    expect(() => assertDocumentAuthorizationStage(f.stage, f.authorization, f.binding, { ...f.source })).toThrow(
      ServiceAuthorizationError,
    );
    expect(() => readDocumentAuthorizationAccess({} as never, f.binding)).toThrow(ServiceAuthorizationError);
    for (const key of ['request', 'runtime', 'model', 'modelName', 'scopePath']) {
      expect(() =>
        readDocumentAuthorizationAccess(f.handle, {
          ...f.binding,
          [key]: key === 'scopePath' ? ['other'] : {},
        } as never),
      ).toThrow(ServiceAuthorizationError);
    }
  });

  it('retains independent same-ID owners and rejects structurally equal output forgeries', async () => {
    const f = fixture(true),
      a = await owner(f),
      b = await owner(f);
    const outputA = { _id: 'same', value: 'first' },
      outputB = { _id: 'same', value: 'second' };
    associateDocumentAuthorization(a.handle, a.binding, outputA);
    associateDocumentAuthorization(b.handle, b.binding, outputB);
    for (const output of [outputB, { ...outputA }]) {
      expect(() => assertDocumentAuthorization(a.handle, { binding: a.binding, output, outputAccess: 'list' })).toThrow(
        ServiceAuthorizationError,
      );
    }
  });

  it.each(['value', 'date', 'bytes', 'replacement'] as const)(
    'still rejects changed associated output %s',
    async (key) => {
      const f = await owner();
      const output = { value: 'published', date: new Date(1), bytes: Buffer.from([1]), nested: { value: 1 } };
      associateDocumentAuthorization(f.handle, f.binding, output);
      const use = { binding: f.binding, output, outputAccess: 'list' };
      assertDocumentAuthorization(f.handle, use);
      if (key === 'value') output.value = 'changed';
      if (key === 'date') output.date.setTime(2);
      if (key === 'bytes') output.bytes[0] = 2;
      if (key === 'replacement') output.nested = { value: 1 };
      expect(() => assertDocumentAuthorization(f.handle, use)).toThrow(ServiceAuthorizationError);
    },
  );

  it('does not change structural limits or admit unsupported document values', () => {
    const f = fixture(true),
      state = f.capture();
    expect(() => createDocumentAuthorizationStage(state.authorization, state.binding, { invalid: () => true })).toThrow(
      ServiceAuthorizationError,
    );
    expect(() =>
      createDocumentAuthorizationStage(state.authorization, state.binding, { values: Array(20001) }),
    ).toThrow(ServiceAuthorizationError);
  });
});
