import mongoose from 'mongoose';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createAccessRuntime } from '../dist/index.mjs';
import { evaluateRouteGuard } from '../src/core-shared';
import type { AccessRouterRequest, GuardHook, OperationAccessContext } from '../src/interfaces';
import {
  createOperationAccessReaders,
  resolveRouteOperationAccess,
  selectOperationAccessGuard,
} from '../src/operation-access';
import Permission from '../src/permission';

const contexts = [undefined, 'basic', 'advanced', 'root'] as const;
const operations = ['new', 'list', 'read', 'create', 'update', 'upsert', 'delete', 'count', 'distinct'];
const modes = ['live', 'captured'] as const;
const active: mongoose.Connection[] = [];
let counter = 0;
afterEach(async () => {
  for (const connection of active.splice(0)) await connection.destroy();
});

const permissions = new Permission({ canRead: true, other: true, basicRead: true });
const req = { method: 'GET', marker: 'original-request' } as unknown as AccessRouterRequest;

function fixture(mode: (typeof modes)[number], modelOptions: object = {}, defaults: unknown = false, data = false) {
  const api = createAccessRuntime();
  const name = `NestedOperation${++counter}`;
  api.setDefaultModelOptions({ operationAccess: defaults as never });
  if (data) api.runtime.setDataOptions(name, modelOptions);
  else {
    const connection = mongoose.createConnection();
    active.push(connection);
    api.registerModelInstance(name, connection.model(name, new mongoose.Schema({ name: String })));
    api.setModelOptions(name, modelOptions);
  }
  const readers = () =>
    createOperationAccessReaders(
      data ? api.runtime.getDataOptions(name) : api.getModelOptions(name),
      data ? undefined : api.getDefaultModelOptions(),
    );
  const captured = readers();
  const select = (baseAccess = 'read', context?: OperationAccessContext) =>
    selectOperationAccessGuard({
      baseAccess,
      context,
      subdocuments: !data,
      ...(mode === 'captured' ? captured : readers()),
    });
  const check = async (baseAccess = 'read') =>
    Promise.all(
      contexts.map((context) => {
        const guard = select(baseAccess, context);
        return evaluateRouteGuard(req, permissions, guard as never);
      }),
    );
  return { api, name, select, check };
}

describe.each(modes)('NOA-01 %s nested guard selection', (mode) => {
  it.each(operations)('selects one default/basic/advanced/root rule for %s', async (operation) => {
    const f = fixture(mode, {
      operationAccess: {
        default: true,
        [operation]: {
          default: false,
          basic: 'canRead other',
          advanced: ['missing', 'canRead'],
          root: [],
        },
      },
    });
    expect(await f.check(operation)).toEqual([false, true, true, false]);
  });

  it.each([
    ['whole boolean', true, [true, true, true, true]],
    ['whole permission AND', 'canRead other', [true, true, true, true]],
    ['whole missing permission', 'canRead missing', [false, false, false, false]],
    ['whole permission OR', ['missing', 'canRead'], [true, true, true, true]],
    ['whole hook shorthand', async () => true, [true, true, true, true]],
    ['whole empty array', [], [false, false, false, false]],
    ['operation scalar', { default: false, read: 'canRead' }, [true, true, true, true]],
    ['operation scalar hook', { default: true, read: async () => false }, [false, false, false, false]],
    ['outer fallback', { default: true }, [true, true, true, true]],
    ['empty operation inherits outer', { default: true, read: {} }, [true, true, true, true]],
    ['undefined operation inherits outer', { default: true, read: undefined }, [true, true, true, true]],
    ['undefined member inherits own default', { read: { default: true, basic: undefined } }, [true, true, true, true]],
    [
      'context grant never grants base',
      { read: { default: false, basic: true, advanced: true, root: true } },
      [false, true, true, true],
    ],
    [
      'default never ANDs denied entries',
      { read: { default: true, basic: false, advanced: false, root: false } },
      [true, false, false, false],
    ],
    ['missing guards deny', {}, [false, false, false, false]],
    ['invalid scalar is terminal', { default: true, read: null }, [false, false, false, false]],
    [
      'invalid operation object is terminal',
      { default: true, read: { unexpected: true } },
      [false, false, false, false],
    ],
    ['invalid default is terminal', { default: true, read: { default: { root: true } } }, [false, false, false, false]],
    ['invalid array is terminal', { default: true, read: ['canRead', 1] }, [false, false, false, false]],
    [
      'invalid context is terminal',
      { default: true, read: { default: true, basic: {}, advanced: null, root: 1 } },
      [true, false, false, false],
    ],
  ])('%s', async (_label, rules, expected) => {
    expect(await fixture(mode, { operationAccess: rules }).check()).toEqual(expected);
  });

  it.each([
    [
      'runtime exact context before scalar',
      { read: { basic: false, advanced: true, root: true } },
      { read: false },
      [false, false, true, true],
    ],
    [
      'runtime exact context before own default',
      { read: { basic: false, advanced: true, root: true } },
      { read: { default: false } },
      [false, false, true, true],
    ],
    ['runtime exact context before shorthand', { read: { basic: false } }, true, [true, false, true, true]],
    [
      'model own context wins',
      { read: { basic: true, advanced: false, root: false } },
      { read: { default: false, basic: false, advanced: true, root: true } },
      [false, false, true, true],
    ],
    [
      'undefined model member inherits exact context',
      { read: { basic: true } },
      { read: { default: false, basic: undefined } },
      [false, true, false, false],
    ],
    [
      'defined empty operation never inherits runtime own default',
      { read: { default: true } },
      { read: {} },
      [false, false, false, false],
    ],
    [
      'model own default wins over runtime default',
      { read: { default: false } },
      { read: { default: true } },
      [true, true, true, true],
    ],
    [
      'empty model parent stays closed to runtime operation',
      { read: { default: true } },
      {},
      [false, false, false, false],
    ],
    [
      'model outer default precedes runtime operation',
      { read: true },
      { default: false },
      [false, false, false, false],
    ],
    ['model shorthand precedes runtime operation', { read: false }, true, [true, true, true, true]],
    [
      'explicit whole undefined uses runtime exact object',
      { read: { default: true, root: false } },
      undefined,
      [true, true, true, false],
    ],
    ['explicit whole undefined uses runtime exact scalar', { read: true }, undefined, [true, true, true, true]],
    [
      'explicit whole undefined does not inherit outer default',
      { default: true },
      undefined,
      [false, false, false, false],
    ],
    ['explicit whole undefined does not inherit bare catchall', true, undefined, [false, false, false, false]],
  ])('%s', async (_label, defaults, rules, expected) => {
    expect(await fixture(mode, { operationAccess: rules }, defaults).check()).toEqual(expected);
  });

  it('omitted operationAccess inherits the whole default operation object', async () => {
    const f = fixture(mode, {}, { read: { default: true, basic: false, root: false } });
    expect(await f.check()).toEqual([true, false, true, false]);
  });

  it.each([
    ['scalar field allow', true, [true, true, true, true]],
    ['scalar field deny', false, [false, false, false, false]],
    ['field permission', 'canRead other', [true, true, true, true]],
    ['field empty OR array', [], [false, false, false, false]],
    ['field malformed value', null, [false, false, false, false]],
    ['field operation scalar', { read: true }, [true, true, true, true]],
    ['field operation nested default', { read: { default: true, root: false } }, [true, true, true, false]],
    ['field transport only', { read: { basic: true, advanced: true, root: true } }, [false, true, true, true]],
    ['field is closed to missing operations', { list: true }, [false, false, false, false]],
    ['empty field is closed', {}, [false, false, false, false]],
    ['empty field operation is closed', { read: {} }, [false, false, false, false]],
    ['field default is not a wildcard', { default: true }, [false, false, false, false]],
    ['undefined field operation stays closed', { read: undefined }, [false, false, false, false]],
    ['absent field uses top-level operation/context', undefined, [true, false, true, false]],
  ])('%s', async (_label, field, expected) => {
    const f = fixture(mode, {
      operationAccess: {
        default: true,
        read: { default: true, basic: false, advanced: true, root: false },
        subs: { items: field },
      },
    });
    expect(await f.check('subs.items.read')).toEqual(expected);
  });

  it.each(['list', 'read', 'create', 'update', 'delete'])('supports the same field rule for %s', async (operation) => {
    const f = fixture(mode, {
      operationAccess: {
        default: false,
        subs: {
          items: {
            [operation]: { default: true, basic: false, advanced: false, root: true },
          },
        },
      },
    });
    expect(await f.check(`subs.items.${operation}`)).toEqual([true, false, false, true]);
  });

  it.each([
    [
      'exact runtime context before field scalar',
      { items: { read: { basic: false, root: false } } },
      { items: true },
      [true, false, true, false],
    ],
    [
      'exact runtime operation before field scalar',
      { items: { read: { default: false } } },
      { items: true },
      [false, false, false, false],
    ],
    [
      'model field operation object is not deep merged',
      { items: { read: { default: true, root: true } } },
      { items: { read: {} } },
      [false, false, false, true],
    ],
    ['runtime closed field blocks model top-level', { items: {} }, {}, [false, false, false, false]],
    [
      'runtime operation object actually inherited supplies own default',
      { items: { read: { default: true } } },
      { items: {} },
      [true, true, true, true],
    ],
  ])('%s', async (_label, defaults, fields, expected) => {
    const f = fixture(mode, { operationAccess: { read: true, default: true, subs: fields } }, { subs: defaults });
    expect(await f.check('subs.items.read')).toEqual(expected);
  });

  it.each([true, false, 'canRead', ['canRead'], () => false])(
    'does not reinterpret subs scalar %s as a wildcard',
    async (subs) => {
      const f = fixture(mode, { operationAccess: { read: { default: true, basic: false }, subs } });
      expect(await f.check('subs.items.read')).toEqual([true, false, true, true]);
    },
  );

  it('keeps custom nonreserved operation strings and permission strings', async () => {
    const f = fixture(mode, {
      operationAccess: {
        default: false,
        download: 'basicRead',
        advancedDownload: true,
        subs: { items: { download: 'canRead', list: { extra: true } } },
      },
    });
    for (const access of ['download', 'advancedDownload', 'subs.items.download', 'subs.items.list.extra'])
      expect(await f.check(access)).toEqual([true, true, true, true]);
  });

  it.each([
    'basicRead',
    'advancedList',
    'subs.items.basicRead',
    'read.default',
    'read.basic',
    'read.advanced',
    'read.root',
    'subs.items.read.root',
  ])('never treats reserved selector %s as an operation grant', (access) => {
    const f = fixture(mode, { operationAccess: true });
    for (const context of contexts) expect(f.select(access, context)).toBe(false);
  });

  it('data has the same nested rules but never inherits model defaults', async () => {
    const f = fixture(
      mode,
      { operationAccess: { read: { default: false, basic: true, root: true } } },
      { read: { advanced: true } },
      true,
    );
    expect(await f.check()).toEqual([false, true, false, true]);
  });
});

describe('NOA-01 evaluator and policy ownership', () => {
  it.each(contexts)('evaluates only selected %s guard with original request and permissions', async (context) => {
    const selected = vi.fn<GuardHook>(async function (grants) {
      await Promise.resolve();
      expect(this).toBe(req);
      expect(grants).toBe(permissions);
      return false;
    });
    const unused = vi.fn<GuardHook>(() => true);
    const rule = { default: unused, basic: unused, advanced: unused, root: unused, [context ?? 'default']: selected };
    const canActivate = vi.fn((guard) => evaluateRouteGuard(req, permissions, guard));
    expect(
      await resolveRouteOperationAccess({
        baseAccess: 'read',
        context,
        ...createOperationAccessReaders({ operationAccess: { default: unused, read: rule } }),
        canActivate,
      }),
    ).toBe(false);
    expect(canActivate).toHaveBeenCalledExactlyOnceWith(selected);
    expect(selected).toHaveBeenCalledTimes(1);
    expect(unused).not.toHaveBeenCalled();
  });

  it.each([false, [], null, 1, { default: true }])('selected defined %s is terminal', async (guard) => {
    const fallback = vi.fn(() => true);
    const result = await resolveRouteOperationAccess({
      baseAccess: 'read',
      context: 'root',
      ...createOperationAccessReaders({
        operationAccess: { default: fallback, read: { default: fallback, root: guard } },
      }),
      canActivate: (selected) => evaluateRouteGuard(req, permissions, selected),
    });
    expect(result).toBe(false);
    expect(fallback).not.toHaveBeenCalled();
  });

  it.each([false, true])('preserves thrown/rejected operational errors (async=%s)', async (asyncGuard) => {
    const sentinel = new Error('NOA-01 operational sentinel');
    const guard = asyncGuard
      ? async () => {
          throw sentinel;
        }
      : () => {
          throw sentinel;
        };
    await expect(
      resolveRouteOperationAccess({
        baseAccess: 'read',
        context: 'advanced',
        ...createOperationAccessReaders({ operationAccess: { read: { advanced: guard } } }),
        canActivate: (selected) => evaluateRouteGuard(req, permissions, selected),
      }),
    ).rejects.toBe(sentinel);
  });

  it('fresh readers see updates while captured readers retain both owner policies', async () => {
    const f = fixture('live', { operationAccess: { read: { default: true } } }, { read: { root: false } });
    const captured = createOperationAccessReaders(f.api.getModelOptions(f.name), f.api.getDefaultModelOptions());
    f.api.setModelOption(f.name, 'operationAccess.read.default', false);
    f.api.setDefaultModelOption('operationAccess.read.root', true);
    expect(await f.check()).toEqual([false, false, false, true]);
    expect(contexts.map((context) => selectOperationAccessGuard({ baseAccess: 'read', context, ...captured }))).toEqual(
      [true, true, true, false],
    );
  });

  it('same-name owners never consult process-global or each other defaults', async () => {
    const a = fixture('live', { operationAccess: undefined }, { read: { default: false, root: true } });
    const b = createAccessRuntime();
    b.setDefaultModelOptions({ operationAccess: true });
    b.registerModelInstance(a.name, a.api.runtime.getModelInstance(a.name)!);
    b.setModelOptions(a.name, { operationAccess: undefined });
    const captured = createOperationAccessReaders(b.getModelOptions(a.name), b.getDefaultModelOptions());
    expect(await a.check()).toEqual([false, false, false, true]);
    expect(contexts.map((context) => selectOperationAccessGuard({ baseAccess: 'read', context, ...captured }))).toEqual(
      [undefined, undefined, undefined, undefined],
    );
  });

  it('context-free readers never request a transport member', () => {
    const readOption = vi.fn((key: string) => (key === 'operationAccess.read' ? { default: false, root: true } : true));
    const readDefaultOption = vi.fn(() => true);
    expect(selectOperationAccessGuard({ baseAccess: 'read', readOption, readDefaultOption })).toBe(false);
    expect(readOption).toHaveBeenCalledExactlyOnceWith('operationAccess.read');
    expect(readDefaultOption).not.toHaveBeenCalled();
  });
});
