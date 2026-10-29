import mongoose from 'mongoose';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { Core } from '../src/core';
import Permission from '../src/permission';
import { AccessRuntime } from '../src/runtime';
import { runWithRuntime } from '../src/runtime-context';
import { Service } from '../src/services/service';
import { PERMISSIONS } from '../src/symbols';
import type { ModelRequest, ModelRouterOptions } from '../src/interfaces';
import { createServiceExecution, deriveServiceExecution, readServiceExecution } from '../src/acl/service-execution';
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
import { assertPublicAdmission, PublicAdmissionError } from '../src/validation/public-admission';
import * as snapshots from '../src/acl/authorization-snapshot';

const readFlag = 'unsafeSkipReadDocumentSnapshotChecks';
const listFlag = 'unsafeSkipListDocumentSnapshotChecks';
const access = (operation: string, effective = operation) => ({
  operation,
  rowAccess: effective,
  outputAccess: effective,
  virtualAccess: effective,
  docPermissionsAccess: effective,
});
let serial = 0;

function fixture(read: unknown = false, list: unknown = false) {
  const model = mongoose.model(`ReadSnapshot${++serial}`, new mongoose.Schema({ value: String }));
  const runtime = new AccessRuntime(),
    warn = vi.fn();
  runtime.setGlobalOptions({ logger: { warn } });
  runtime.registerModelInstance(model.modelName, model);
  runtime.setModelOptions(model.modelName, {
    permissionSchema: { value: true },
    [readFlag]: read,
    [listFlag]: list,
  } as ModelRouterOptions);
  const request = { [PERMISSIONS]: new Permission({ reader: true }) } as unknown as ModelRequest;
  const service = runWithRuntime(runtime, () => {
    request.macl = new Core(request);
    return new Service(request, model.modelName);
  });
  const capture = (effective = access('read'), parent?: ReturnType<typeof resolveServiceAuthorization>) => {
    const execution = createServiceExecution(service, effective, undefined, 'service', [], parent);
    return { execution, ...readServiceExecution(service, execution) };
  };
  return { model, runtime, service, request, warn, capture };
}

async function owner(state: ReturnType<typeof readServiceExecution>) {
  const source = { value: 'original', date: new Date(1), bytes: Buffer.from([1]) };
  const stage = createDocumentAuthorizationStage(state.authorization, state.binding, source);
  const handle = await resolveDocumentAuthorization(stage, () => ({ reader: true, bytes: Buffer.from([1]) }));
  return { source, stage, handle, ...state };
}

afterEach(() => {
  vi.restoreAllMocks();
  mongoose.deleteModel(/^ReadSnapshot/);
});

describe('independent server read snapshot flag', () => {
  it.each([undefined, false, 'true', 1, {}, new Boolean(true)])('requires a literal read opt-in: %j', async (value) => {
    const f = fixture(value, true),
      o = await owner(f.capture());
    o.source.value = 'changed';
    expect(() => readDocumentAuthorizationAccess(o.handle, o.binding)).toThrow(ServiceAuthorizationError);
    expect(f.warn.mock.calls.some(([message]) => message.includes('UNSAFE: read'))).toBe(false);
  });

  it.each([false, true].flatMap((read) => [false, true].map((list) => ({ read, list }))))(
    'separates read=$read from list=$list and uses read mode for retries',
    async ({ read, list }) => {
      const f = fixture(read, list),
        root = f.capture();
      const retry = deriveServiceExecution(f.service, root.execution, access('read', 'list'));
      for (const [state, skipped] of [
        [root, read],
        [readServiceExecution(f.service, retry), read],
        [f.capture(access('list')), list],
      ] as const) {
        const o = await owner(state);
        const matches = vi.spyOn(snapshots, 'matchesAuthorizationSnapshot');
        readDocumentAuthorizationAccess(o.handle, o.binding);
        expect(matches).toHaveBeenCalledTimes(skipped ? 0 : 2);
        matches.mockRestore();
        o.source.value = 'changed';
        if (skipped) expect(() => readDocumentAuthorizationAccess(o.handle, o.binding)).not.toThrow();
        else expect(() => readDocumentAuthorizationAccess(o.handle, o.binding)).toThrow(ServiceAuthorizationError);
      }
    },
  );

  it('warns independently per model/flag transition and normalizes malformed setters', async () => {
    const f = fixture();
    f.runtime.setModelOption(f.model.modelName, readFlag, true);
    f.runtime.setModelOption(f.model.modelName, readFlag, true);
    f.runtime.setModelOption(f.model.modelName, listFlag, true);
    expect(f.warn).toHaveBeenCalledTimes(2);
    expect(f.warn.mock.calls[0][0]).toContain(`Restore ${readFlag}=false`);
    expect(f.warn.mock.calls[1][0]).toContain(`Restore ${listFlag}=false`);
    f.runtime.setModelOption(f.model.modelName, readFlag, 'true' as never);
    expect(f.runtime.getModelOption(f.model.modelName, readFlag)).toBe(false);
    const strict = await owner(f.capture());
    strict.source.value = 'changed';
    expect(() => readDocumentAuthorizationAccess(strict.handle, strict.binding)).toThrow(ServiceAuthorizationError);
    expect(f.runtime.getModelOption(f.model.modelName, listFlag)).toBe(true);
  });

  it('inherits read defaults without relaxing an explicitly strict model or its list flag', async () => {
    const f = fixture();
    f.runtime.setDefaultModelOption(readFlag, true);
    const model = mongoose.model(`ReadSnapshot${++serial}`, new mongoose.Schema({ value: String }));
    f.runtime.registerModelInstance(model.modelName, model);
    f.runtime.setModelOptions(model.modelName, { permissionSchema: { value: true } });
    const service = runWithRuntime(f.runtime, () => new Service(f.request, model.modelName));
    const execution = createServiceExecution(service, access('read'));
    const read = await owner(readServiceExecution(service, execution));
    read.source.value = 'changed';
    expect(() => readDocumentAuthorizationAccess(read.handle, read.binding)).not.toThrow();
    expect(f.runtime.getModelOption(model.modelName, listFlag)).toBe(false);
    const existing = await owner(f.capture());
    existing.source.value = 'changed';
    expect(() => readDocumentAuthorizationAccess(existing.handle, existing.binding)).toThrow(ServiceAuthorizationError);
  });

  it.each([false, true])(
    'retains captured read mode through a suspended hook and retry (initial=%s)',
    async (unsafe) => {
      const f = fixture(unsafe, !unsafe),
        root = f.capture();
      const source = { value: 'original' },
        stage = createDocumentAuthorizationStage(root.authorization, root.binding, source);
      let entered!: () => void, release!: () => void;
      const started = new Promise<void>((done) => {
          entered = done;
        }),
        waiting = new Promise<void>((done) => {
          release = done;
        });
      const pending = resolveDocumentAuthorization(stage, async () => {
        entered();
        await waiting;
        return {};
      });
      await started;
      f.runtime.setModelOption(f.model.modelName, readFlag, !unsafe);
      source.value = 'changed';
      release();
      if (unsafe) await expect(pending).resolves.toBeDefined();
      else await expect(pending).rejects.toBeInstanceOf(ServiceAuthorizationError);
      const retry = deriveServiceExecution(f.service, root.execution, access('read', 'list'));
      const retained = await owner(readServiceExecution(f.service, retry));
      retained.source.value = 'changed';
      if (unsafe) expect(() => readDocumentAuthorizationAccess(retained.handle, retained.binding)).not.toThrow();
      else
        expect(() => readDocumentAuthorizationAccess(retained.handle, retained.binding)).toThrow(
          ServiceAuthorizationError,
        );
      const fresh = await owner(f.capture());
      fresh.source.value = 'changed';
      if (unsafe)
        expect(() => readDocumentAuthorizationAccess(fresh.handle, fresh.binding)).toThrow(ServiceAuthorizationError);
      else expect(() => readDocumentAuthorizationAccess(fresh.handle, fresh.binding)).not.toThrow();
    },
  );

  it('does not inherit relaxed mode through related calls, their retries, or fresh helpers', async () => {
    const f = fixture(true, true),
      root = f.capture();
    const related = f.capture(access('read'), root.authorization);
    const retry = deriveServiceExecution(f.service, related.execution, access('read', 'list'));
    const helper = resolveServiceAuthorization({
      binding: root.binding,
      access: access('read'),
      configuration: { catalog: { paths: ['value'] }, [readFlag]: true },
      requestPermissions: new Permission({}),
    });
    for (const state of [related, readServiceExecution(f.service, retry), { ...root, authorization: helper }]) {
      const o = await owner(state);
      o.source.value = 'changed';
      expect(() => readDocumentAuthorizationAccess(o.handle, o.binding)).toThrow(ServiceAuthorizationError);
    }
  });

  it.each(['create', 'update', 'upsert', 'new', 'subRead', 'subList'])(
    'keeps %s and derived read-like output strict',
    async (operation) => {
      const f = fixture(true, true),
        original = f.capture(access(operation, 'read'));
      const derived = deriveServiceExecution(f.service, original.execution, access('read'));
      for (const state of [original, readServiceExecution(f.service, derived)]) {
        const o = await owner(state);
        o.source.value = 'changed';
        expect(() => readDocumentAuthorizationAccess(o.handle, o.binding)).toThrow(ServiceAuthorizationError);
      }
    },
  );

  it('requires exact root-read origin/binding and declines embedded or malformed private markers', () => {
    const f = fixture(true, true),
      root = f.capture();
    const input = {
      binding: root.binding,
      access: access('read'),
      configuration: { catalog: { paths: ['value'] }, [readFlag]: true },
      requestPermissions: new Permission({}),
      readResponse: true,
    };
    expect(() =>
      resolveServiceAuthorization({ ...input, parent: root.authorization, binding: { ...root.binding, model: {} } }),
    ).toThrow(ServiceAuthorizationError);
    const childBinding = { ...root.binding, scopePath: ['child'] };
    const child = resolveServiceAuthorization({ ...input, parent: root.authorization, binding: childBinding });
    const raw = { value: 'original' },
      stage = createDocumentAuthorizationStage(child, childBinding, raw);
    raw.value = 'changed';
    expect(() => assertDocumentAuthorizationStage(stage, child, childBinding, raw)).toThrow(ServiceAuthorizationError);
  });

  it.each([
    { access: access('list') },
    { access: { ...access('read'), rowAccess: 'list' } },
    { access: { ...access('read'), virtualAccess: 'create' } },
    { access: { ...access('read'), docPermissionsAccess: 'update' } },
    { applicability: 'mutation' as const },
    { applicability: 'output' as const },
    { readResponse: false },
    { readResponse: 'true' as never },
  ])('declines a read marker outside the canonical read contract: %j', async (change) => {
    const f = fixture(true),
      root = f.capture();
    const call = resolveServiceAuthorization({
      binding: root.binding,
      access: access('read'),
      configuration: { catalog: { paths: ['value'] }, [readFlag]: true },
      requestPermissions: new Permission({}),
      readResponse: true,
      ...change,
    });
    const source = { value: 'original' };
    const handle = await resolveDocumentAuthorization(
      createDocumentAuthorizationStage(call, root.binding, source),
      () => ({}),
    );
    source.value = 'changed';
    expect(() => readDocumentAuthorizationAccess(handle, root.binding)).toThrow(ServiceAuthorizationError);
  });

  it('keeps detached callback/grant copies, memos, exact handles and output mutation checks', async () => {
    const f = fixture(true),
      o = await owner(f.capture());
    o.source.date.setTime(2);
    o.source.value = 'changed';
    const a = readDocumentAuthorization(o.handle, o.binding).grants;
    (a.bytes as Buffer)[0] = 99;
    expect((readDocumentAuthorization(o.handle, o.binding).grants.bytes as Buffer)[0]).toBe(1);
    const evaluate = vi.fn(() => false);
    expect(await memoizeDocumentFieldDecision(o.handle, o.binding, 'field', evaluate)).toBe(false);
    expect(await memoizeDocumentFieldDecision(o.handle, o.binding, 'field', () => true)).toBe(false);
    expect(evaluate).toHaveBeenCalledTimes(1);
    expect(() => readDocumentAuthorizationAccess({} as never, o.binding)).toThrow(ServiceAuthorizationError);
    expect(() => readDocumentAuthorizationAccess(o.handle, { ...o.binding, request: {} } as never)).toThrow(
      ServiceAuthorizationError,
    );
    expect(() => assertDocumentAuthorizationStage(o.stage, o.authorization, o.binding, { ...o.source })).toThrow(
      ServiceAuthorizationError,
    );
    const output = { value: 'published', date: new Date(1) };
    associateDocumentAuthorization(o.handle, o.binding, output);
    const use = { binding: o.binding, output, outputAccess: 'read' };
    assertDocumentAuthorization(o.handle, use);
    output.date.setTime(2);
    expect(() => assertDocumentAuthorization(o.handle, use)).toThrow(ServiceAuthorizationError);
  });

  it('does not make a same-spelled global/payload property authority', async () => {
    const f = fixture();
    f.runtime.setGlobalOptions({ [readFlag]: true } as never);
    expect(() => assertPublicAdmission({ data: { [readFlag]: true }, filter: { [readFlag]: true } })).not.toThrow();
    const o = await owner(f.capture());
    o.source.value = 'changed';
    expect(() => readDocumentAuthorizationAccess(o.handle, o.binding)).toThrow(ServiceAuthorizationError);
  });

  it.each(['findOneOptions', 'findByIdOptions', 'publicReadOptions'])(
    'rejects read opt-out in method defaults.%s',
    (bucket) => {
      const f = fixture();
      expect(() => f.runtime.setModelOption(f.model.modelName, 'defaults', { [bucket]: { [readFlag]: true } })).toThrow(
        PublicAdmissionError,
      );
    },
  );

  it.each(['args', 'options', 'authorization'])('rejects per-call opt-out through %s', async (slot) => {
    const f = fixture();
    const result = await f.service.findOne(
      {},
      slot === 'args' ? ({ [readFlag]: true } as never) : {},
      slot === 'options'
        ? ({ [readFlag]: true } as never)
        : slot === 'authorization'
          ? ({ authorization: { [readFlag]: true } } as never)
          : {},
    );
    expect(result).toMatchObject({ success: false, code: 'bad_request' });
  });
});
