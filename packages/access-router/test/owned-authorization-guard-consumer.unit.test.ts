import { afterEach, describe, expect, it, vi } from 'vitest';
import { evaluateDocumentGuard } from '../src/acl/document-guard';
import * as documentStages from '../src/acl/document-stage';
import { closeOutputPublication, failOutputPublication, outputPublicationFor } from '../src/acl/output-publication';
import {
  createServiceExecution,
  readServiceExecution,
  withExecutionDocumentCondition,
  deriveServiceExecution,
} from '../src/acl/service-execution';
import { ServiceAuthorizationError } from '../src/acl/authorization-snapshot';
import Permission from '../src/permission';
import { PERMISSIONS } from '../src/symbols';
import { runWithRuntime } from '../src/runtime-context';
import { stageAccess } from './owned-stage-test-fixture';
import { guard } from '../src/middleware';
import { ownedStageFixture, quietOutput, sourceModes } from './owned-stage-test-fixture';

function fixture(mode: (typeof sourceModes)[number] = 'isolated') {
  const fields = Array.from({ length: 24 }, (_, i) => `field${i}`);
  const field = vi.fn((_permissions, grants) => grants.owner === true);
  const hook = vi.fn(() => ({ owner: true }));
  const decorate = vi.fn((doc) => doc);
  const f = ownedStageFixture({
    mode,
    schema: Object.fromEntries(fields.map((key) => [key, String])),
    modelOptions: {
      permissionSchema: Object.fromEntries(fields.map((key) => [key, field])),
      docPermissions: { read: hook, list: hook },
      decorate: { read: decorate },
      defaults: { publicReadOptions: { ...quietOutput, tryList: false } },
    },
  });
  const row = { _id: 'same', ...Object.fromEntries(fields.map((key) => [key, key])) };
  f.adapter.findOne.mockResolvedValue(row);
  vi.spyOn(f.request.macl, 'getPublicService').mockReturnValue(f.public);
  return { ...f, fields, field, hook, decorate, row };
}

afterEach(() => vi.restoreAllMocks());

function latch() {
  let release!: () => void;
  const promise = new Promise<void>((resolve) => {
    release = resolve;
  });
  return { promise, release };
}

describe('owned document-condition consumer', () => {
  it.each(sourceModes)('%s guards publish no fields; ordinary DTO reads still check all 24', async (mode) => {
    const f = fixture(mode);
    expect(await evaluateDocumentGuard(f.public, 'same', 'reader owner')).toBe(true);
    expect(f.adapter.findOne).toHaveBeenCalledTimes(1);
    expect(f.hook).toHaveBeenCalledTimes(1);
    expect(f.field).not.toHaveBeenCalled();
    expect(f.decorate).not.toHaveBeenCalled();
    const query = f.adapter.findOne.mock.calls[0];
    const source = f.hook.mock.calls[0];
    const dto = await f.public._read('same', undefined, quietOutput);
    expect(dto.success).toBe(true);
    expect(f.adapter.findOne.mock.calls[1]).toEqual(query);
    expect(f.hook.mock.calls[1]).toEqual(source);
    expect(f.field).toHaveBeenCalledTimes(24);
    expect(f.decorate).toHaveBeenCalledTimes(1);
  });

  it('does not intercept an overridable _read or trust its forged DTO', async () => {
    const f = fixture();
    const override = vi.spyOn(f.public, '_read').mockRejectedValue(new Error('not the condition reader'));
    expect(await evaluateDocumentGuard(f.public, 'same', 'owner')).toBe(true);
    expect(override).not.toHaveBeenCalled();
    expect(f.hook).toHaveBeenCalledTimes(1);
  });

  it('does not generate hypothetical selected virtual errors, while normal reads still reject them', async () => {
    const f = fixture();
    const getter = vi.fn(() => new Proxy({}, {}));
    f.runtime.setModelOptions(f.model.modelName, {
      permissionSchema: { ...Object.fromEntries(f.fields.map((key) => [key, f.field])), summary: true },
      virtuals: { summary: { dependsOn: [], get: getter } },
    });
    expect(await evaluateDocumentGuard(f.public, 'same', 'owner')).toBe(true);
    expect(getter).not.toHaveBeenCalled();
    expect(await f.public._read('same', undefined, quietOutput)).toMatchObject({ code: 'bad_request' });
    expect(getter).toHaveBeenCalledTimes(1);
  });

  it('does not run throwing presentation code, while ordinary reads still do', async () => {
    const f = fixture();
    f.decorate.mockImplementation(() => {
      throw new Error('presentation only');
    });
    expect(await evaluateDocumentGuard(f.public, 'same', 'owner')).toBe(true);
    expect(f.decorate).not.toHaveBeenCalled();
    await expect(f.public._read('same', undefined, quietOutput)).rejects.toThrow('presentation only');
  });

  it('does not run tasks or create a selected-output stage; ordinary reads retain both', async () => {
    const f = fixture();
    const begin = vi.spyOn(documentStages, 'beginDocumentStageOutput');
    const tasks = vi.spyOn(f.public as never, 'runTasks').mockImplementation(() => {
      throw new Error('task only');
    });
    expect(await evaluateDocumentGuard(f.public, 'same', 'owner')).toBe(true);
    expect(begin).not.toHaveBeenCalled();
    expect(tasks).not.toHaveBeenCalled();
    await expect(f.public._read('same', undefined, quietOutput)).rejects.toThrow('task only');
    expect(begin).toHaveBeenCalledTimes(1);
    expect(tasks).toHaveBeenCalledTimes(1);
  });

  it('rejects condition accessors without observing them or performing a read', async () => {
    const f = fixture();
    const getter = vi.fn(() => 'owner');
    const condition = Object.defineProperty([], '0', { get: getter, enumerable: true });
    expect(await evaluateDocumentGuard(f.public, 'same', condition)).toMatchObject({ code: 'bad_request' });
    expect(getter).not.toHaveBeenCalled();
    expect(f.adapter.findOne).not.toHaveBeenCalled();
  });

  it('rejects condition proxies before any trap or read', async () => {
    const f = fixture();
    const trap = vi.fn();
    const condition = new Proxy(['owner'], { get: trap, getPrototypeOf: trap, ownKeys: trap });
    expect(await evaluateDocumentGuard(f.public, 'same', condition)).toMatchObject({ code: 'bad_request' });
    expect(trap).not.toHaveBeenCalled();
    expect(f.adapter.findOne).not.toHaveBeenCalled();
  });

  it('retains source and fulfilled-fact structural errors as controlled 400', async () => {
    const f = fixture();
    f.hook.mockReturnValue({ owner: 1 } as never);
    expect(await evaluateDocumentGuard(f.public, 'same', 'reader')).toMatchObject({ code: 'bad_request' });
    f.hook.mockClear();
    const getter = vi.fn();
    f.adapter.findOne.mockResolvedValue(Object.defineProperty({}, 'field0', { get: getter, enumerable: true }));
    expect(await evaluateDocumentGuard(f.public, 'same', 'reader')).toMatchObject({ code: 'bad_request' });
    expect(getter).not.toHaveBeenCalled();
    expect(f.hook).not.toHaveBeenCalled();
  });

  it('still requires a row and a fresh hook even for a global-only condition', async () => {
    const f = fixture();
    expect(await evaluateDocumentGuard(f.public, 'same', 'reader')).toBe(true);
    expect(f.hook).toHaveBeenCalledTimes(1);
    f.adapter.findOne.mockResolvedValue(null);
    const next = vi.fn();
    await guard({ modelName: f.model.modelName, id: 'same', condition: 'reader' })(f.request, {} as never, next);
    expect(next.mock.calls[0][0]).toMatchObject({ statusCode: 401 });
    expect(f.hook).toHaveBeenCalledTimes(1);
  });

  it.each([
    ['owner', true],
    ['reader owner', true],
    ['reader missing', false],
    [['missing', 'reader owner'], true],
    [[['missing'], ['reader owner']], true],
    ['doc:owner', false],
    ['admin', false],
  ])('retains exact global-or-fact condition grammar: %j', async (condition, allowed) => {
    const f = fixture();
    expect(await evaluateDocumentGuard(f.public, 'same', condition as string | string[])).toBe(allowed);
    expect(f.adapter.findOne).toHaveBeenCalledTimes(1);
    expect(f.hook).toHaveBeenCalledTimes(1);
    expect(f.field).not.toHaveBeenCalled();
  });

  it.each(sourceModes)(
    '%s retains public/internal defaults, projection, hydration and empty hook diagnostics',
    async (mode) => {
      for (const hydration of ['lean', 'hydrated'] as const) {
        const f = fixture(mode);
        f.runtime.setModelOptions(f.model.modelName, {
          requireExplicitSelect: true,
          docPermissions: { read: { dependsOn: ['ownerId'], get: f.hook } },
          defaults: { publicReadArgs: { select: ['field1', '-_id'] }, findOneArgs: { sort: [['field1', 1]] } },
          hydration: { publicRead: hydration, findOne: hydration === 'lean' ? 'hydrated' : 'lean' },
          sortableFields: ['field1'],
        });
        const source = { ...f.row, ownerId: 'actor' };
        f.adapter.findOne.mockResolvedValue(hydration === 'hydrated' ? new f.model(source) : source);
        expect(await evaluateDocumentGuard(f.public, 'same', 'owner')).toBe(true);
        const query = f.adapter.findOne.mock.calls[0];
        const hook = f.hook.mock.calls[0];
        expect(query[0]).toMatchObject({
          select: expect.arrayContaining(['field1', 'ownerId']),
          lean: hydration === 'lean',
        });
        expect(hook[2]).toMatchObject({ operation: 'read', docPermissions: {} });
        expect(Object.isFrozen(hook[2])).toBe(true);
        expect(await f.public._read('same', undefined, quietOutput)).toMatchObject({ success: true });
        expect(f.adapter.findOne.mock.calls[1]).toEqual(query);
        expect(f.hook.mock.calls[1]).toEqual(hook);
      }
    },
  );

  it.each(['baseFilter', 'overrideFilter'] as const)(
    '%s false is terminal without hook, query or LIST retry',
    async (option) => {
      const f = fixture();
      const retry = vi.fn(() => true);
      f.runtime.setModelOptions(f.model.modelName, {
        [option]: { read: () => false },
        operationAccess: { list: retry },
        defaults: { publicReadOptions: { tryList: true } },
      });
      expect(await evaluateDocumentGuard(f.public, 'same', 'owner')).toMatchObject({ code: 'forbidden' });
      expect(f.adapter.findOne).not.toHaveBeenCalled();
      expect(f.hook).not.toHaveBeenCalled();
      expect(retry).not.toHaveBeenCalled();
    },
  );

  it('identifier false and malformed sort are terminal without a second lookup', async () => {
    const f = fixture();
    const id = vi.spyOn(f.public, 'genIDFilter').mockResolvedValue(false);
    expect(await evaluateDocumentGuard(f.public, 'same', 'owner')).toMatchObject({ code: 'forbidden' });
    id.mockRestore();
    f.runtime.setModelOptions(f.model.modelName, { defaults: { findOneArgs: { sort: ['field0..bad'] } } });
    expect(await evaluateDocumentGuard(f.public, 'same', 'owner')).toMatchObject({ code: 'bad_request' });
    expect(f.adapter.findOne).not.toHaveBeenCalled();
    expect(f.hook).not.toHaveBeenCalled();
  });

  it('a miss retries once with captured LIST admission and the initiating READ source mode', async () => {
    const f = fixture('isolated');
    const read = vi.fn(() => ({})),
      list = vi.fn(() => ({})),
      gate = vi.fn(() => true);
    f.runtime.setModelOptions(f.model.modelName, {
      listAuthorizationMode: 'trusted',
      baseFilter: { read, list },
      operationAccess: { list: gate },
      defaults: { publicReadOptions: { tryList: true } },
    });
    f.adapter.findOne.mockResolvedValueOnce(null).mockResolvedValueOnce(f.row);
    f.hook.mockImplementation((doc) => {
      doc.field0 = 'changed hook view';
      return { owner: true };
    });
    expect(await evaluateDocumentGuard(f.public, 'same', 'owner')).toBe(true);
    expect(f.adapter.findOne).toHaveBeenCalledTimes(2);
    expect(f.hook).toHaveBeenCalledTimes(1);
    expect(f.hook.mock.calls[0][2]).toMatchObject({ operation: 'read', docPermissionsAccess: 'list' });
    expect(f.row.field0).toBe('field0');
    expect(gate).toHaveBeenCalledTimes(1);
    expect(read).toHaveBeenCalledTimes(1);
    expect(list).toHaveBeenCalledTimes(1);
    expect(f.field).not.toHaveBeenCalled();
  });

  it('does not refresh captured retry admission after a callback setter', async () => {
    const f = fixture();
    f.runtime.setModelOptions(f.model.modelName, {
      operationAccess: { list: false },
      defaults: { publicReadOptions: { tryList: true } },
      baseFilter: {
        read: () => {
          f.runtime.setModelOption(f.model.modelName, 'operationAccess.list', true);
          return {};
        },
      },
    });
    f.adapter.findOne.mockResolvedValue(null);
    expect(await evaluateDocumentGuard(f.public, 'same', 'owner')).toMatchObject({ code: 'unauthorized' });
    expect(f.adapter.findOne).toHaveBeenCalledTimes(1);
  });

  it('a visible false condition does not retry and a missing row retries at most once', async () => {
    const f = fixture();
    f.runtime.setModelOptions(f.model.modelName, { defaults: { publicReadOptions: { tryList: true } } });
    expect(await evaluateDocumentGuard(f.public, 'same', 'missing')).toBe(false);
    expect(f.adapter.findOne).toHaveBeenCalledTimes(1);
    f.adapter.findOne.mockClear().mockResolvedValue(null);
    expect(await evaluateDocumentGuard(f.public, 'same', 'reader')).toMatchObject({ code: 'not_found' });
    expect(f.adapter.findOne).toHaveBeenCalledTimes(2);
  });

  it('captures bounded condition arrays before an await and never reads inherited entries', async () => {
    const f = fixture(),
      entered = latch(),
      held = latch();
    const condition = [['owner']];
    vi.spyOn(f.public, 'genIDFilter').mockImplementation(async () => {
      entered.release();
      await held.promise;
      return { _id: 'same' };
    });
    const result = evaluateDocumentGuard(f.public, 'same', condition as never);
    await entered.promise;
    condition[0][0] = 'missing';
    held.release();
    expect(await result).toBe(true);
    expect(await evaluateDocumentGuard(f.public, 'same', new Array(1))).toMatchObject({ code: 'bad_request' });
  });

  it.each(['cycle', 'depth', 'slots', 'extra-key'] as const)(
    'rejects a %s condition before query work',
    async (kind) => {
      const f = fixture();
      let value: unknown = ['owner'];
      if (kind === 'cycle') (value as unknown[]).push(value);
      if (kind === 'depth') for (let n = 0; n < 101; n++) value = [value];
      if (kind === 'slots') value = Array(20000).fill('owner');
      if (kind === 'extra-key') Object.defineProperty(value, 'extra', { value: true });
      expect(await evaluateDocumentGuard(f.public, 'same', value as never)).toMatchObject({ code: 'bad_request' });
      expect(f.adapter.findOne).not.toHaveBeenCalled();
    },
  );

  it.each(['throw', 'reject', 'missing'] as const)(
    '%s real hook remains empty-facts fail closed, not invalid fulfillment',
    async (kind) => {
      const f = fixture();
      if (kind === 'throw')
        f.hook.mockImplementation(() => {
          throw new Error('application');
        });
      if (kind === 'reject')
        f.hook.mockImplementation(async () => {
          throw new Error('application');
        });
      if (kind === 'missing') f.runtime.setModelOption(f.model.modelName, 'docPermissions', undefined);
      expect(await evaluateDocumentGuard(f.public, 'same', 'owner')).toBe(false);
      expect(await evaluateDocumentGuard(f.public, 'same', 'reader')).toBe(true);
    },
  );

  it('nested normal reads and guards are fresh independent calls, never an ambient condition mode', async () => {
    const f = fixture();
    let nested = false;
    f.hook.mockImplementation(async () => {
      if (!nested) {
        nested = true;
        f.request[PERMISSIONS] = new Permission({ admin: true });
        f.runtime.setModelOption(f.model.modelName, 'docPermissions.read', () => ({ owner: false }));
        const dto = await f.public._read('same', undefined, quietOutput);
        expect(dto).toMatchObject({ success: true, data: {} });
        expect(f.field).toHaveBeenCalledTimes(24);
        expect(await evaluateDocumentGuard(f.public, 'same', 'admin')).toBe(true);
        expect(await evaluateDocumentGuard(f.public, 'same', 'reader')).toBe(false);
      }
      return { owner: true };
    });
    expect(await evaluateDocumentGuard(f.public, 'same', 'reader owner')).toBe(true);
    expect(f.decorate).toHaveBeenCalledTimes(1);
    expect(await evaluateDocumentGuard(f.public, 'same', 'reader owner')).toBe(false);
  });

  it('retains its receiving runtime when called inside another runtime', async () => {
    const f = fixture(),
      other = fixture('trusted');
    expect(await runWithRuntime(other.runtime, () => evaluateDocumentGuard(f.public, 'same', 'owner'))).toBe(true);
    expect(f.adapter.findOne).toHaveBeenCalledTimes(1);
    expect(other.adapter.findOne).not.toHaveBeenCalled();
  });

  it('a guard invoked inside a normal read hook freshly captures actor and options without changing the outer DTO purpose', async () => {
    const f = fixture();
    f.hook.mockImplementation(async () => {
      f.request[PERMISSIONS] = new Permission({ admin: true });
      f.runtime.setModelOption(f.model.modelName, 'docPermissions.read', () => ({ owner: false }));
      expect(await evaluateDocumentGuard(f.public, 'same', 'admin')).toBe(true);
      expect(await evaluateDocumentGuard(f.public, 'same', 'reader')).toBe(false);
      return { owner: true };
    });
    expect(await f.public._read('same', undefined, quietOutput)).toMatchObject({
      success: true,
      data: { field0: 'field0' },
    });
    expect(f.field).toHaveBeenCalledTimes(24);
    expect(f.decorate).toHaveBeenCalledTimes(1);
  });

  it.each(['spread', 'json', 'prototype', 'fake'] as const)(
    '%s receivers cannot recover a private reader or forged metadata authority',
    async (kind) => {
      const f = fixture();
      const fake =
        kind === 'spread'
          ? { ...f.public }
          : kind === 'json'
            ? JSON.parse('{}')
            : kind === 'prototype'
              ? Object.create(f.public)
              : { _read: vi.fn(async () => ({ success: true, data: { _permissions: { owner: true } } })) };
      expect(await evaluateDocumentGuard(fake, 'same', 'owner')).toBe(false);
      expect(f.adapter.findOne).not.toHaveBeenCalled();
    },
  );

  it('only the registered receiver can issue a condition execution or carry it through its READ-to-LIST retry', async () => {
    const f = fixture();
    expect(() =>
      withExecutionDocumentCondition(f.direct, createServiceExecution(f.direct, stageAccess()), 'owner'),
    ).toThrow(ServiceAuthorizationError);
    const execution = withExecutionDocumentCondition(
      f.public,
      createServiceExecution(f.public, stageAccess()),
      'owner',
    );
    expect(Object.isFrozen(readServiceExecution(f.public, execution).purpose)).toBe(true);
    expect(() => readServiceExecution(f.direct, execution)).toThrow(ServiceAuthorizationError);
    expect(() => deriveServiceExecution(f.public, execution, stageAccess('read', 'read'))).toThrow(
      ServiceAuthorizationError,
    );
    expect(
      readServiceExecution(f.public, deriveServiceExecution(f.public, execution, stageAccess('read', 'list'))).purpose
        .kind,
    ).toBe('condition');
    await closeOutputPublication(readServiceExecution(f.public, execution).publication);
  });

  it.each(['purpose', 'condition', 'decision'] as const)(
    'owns the %s slot before callback-installed prototype setters',
    async (key) => {
      const f = fixture(),
        setter = vi.fn();
      const descriptor = Object.getOwnPropertyDescriptor(Object.prototype, key);
      try {
        Object.defineProperty(Object.prototype, key, { configurable: true, get: () => false, set: setter });
        expect(await evaluateDocumentGuard(f.public, 'same', 'owner')).toBe(true);
      } finally {
        if (descriptor) Object.defineProperty(Object.prototype, key, descriptor);
        else Reflect.deleteProperty(Object.prototype, key);
      }
      expect(setter).not.toHaveBeenCalled();
    },
  );

  it.each(['close', 'caught-poison'] as const)(
    '%s while a hook is pending drains admitted work and cannot authorize late',
    async (kind) => {
      const f = fixture(),
        entered = latch(),
        held = latch();
      const prepare = documentStages.prepareQueryDocumentStage;
      let admitted: ReturnType<typeof prepare>;
      let owner: ReturnType<typeof outputPublicationFor>;
      vi.spyOn(documentStages, 'prepareQueryDocumentStage').mockImplementation((...args) => {
        owner = outputPublicationFor(args[0]);
        return (admitted = prepare(...args));
      });
      let hookSettled = false;
      f.hook.mockImplementation(async () => {
        entered.release();
        if (kind === 'caught-poison') {
          try {
            failOutputPublication(owner, new ServiceAuthorizationError('caught inner fact failure'));
            throw new Error('caught');
          } catch {
            /* owner remains poisoned */
          }
        }
        await held.promise;
        hookSettled = true;
        return { owner: true };
      });
      let completed = false;
      const result = evaluateDocumentGuard(f.public, 'same', 'owner').finally(() => {
        completed = true;
      });
      await entered.promise;
      const closing = kind === 'close' ? closeOutputPublication(owner).catch(() => {}) : Promise.resolve();
      await new Promise<void>((resolve) => setImmediate(resolve));
      expect(completed).toBe(false);
      expect(hookSettled).toBe(false);
      held.release();
      expect(await result).toMatchObject({ code: 'bad_request' });
      await closing;
      expect(hookSettled).toBe(true);
      expect(() => documentStages.readDocumentStage(admitted.stage, f.binding)).toThrow(ServiceAuthorizationError);
      expect(f.field).not.toHaveBeenCalled();
    },
  );
});
