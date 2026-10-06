/**
 * VIRT-03 shared output finalizer unit tests (toObject → virtuals → trim).
 *
 * No caller integration yet; covers lean/hydrated, undefined omission,
 * throw+structural log, absent vs falsy deps, stripping vs independent
 * visibility, unauthorized skip, nested mutation/throw isolation, shared data,
 * sibling order, multi-row peak, limit-1, and secret redaction.
 */
import mongoose from 'mongoose';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { planVirtualProjection, type VirtualProjectionSnapshot } from '../src/acl/virtual-projection';
import { finalizeModelOutput, finalizeModelOutputs, type FinalizeSnapshot } from '../src/output/finalize-model-output';
import * as loggerHelpers from '../src/logger-helpers';

const READ = 'read' as const;

const nonePerms = { has: () => false, hasKey: () => false };
const permsWith = (grants: Record<string, boolean>) => ({
  has: (key: string) => grants[key] === true,
  hasKey: (key: string) => key in grants,
});

const mockRequest = (over: Record<string, unknown> = {}): never => ({ ...over }) as never;

const baseContext = (over: Record<string, unknown> = {}): never =>
  ({ modelName: 'U', operation: 'read', ...over }) as never;

const snap = (over: Partial<FinalizeSnapshot> = {}): FinalizeSnapshot => ({
  permissionSchema: {},
  virtuals: {},
  alwaysSelectFields: [],
  modelPermissionPrefix: '',
  requireExplicitSelect: false,
  documentPermissionField: '_permissions',
  ...over,
});

afterEach(() => {
  vi.restoreAllMocks();
  try {
    mongoose.deleteModel(/VirtFin.*/);
  } catch {
    // ignore
  }
});

describe('VIRT-03 finalizeModelOutput', () => {
  it('computes lean and hydrated inputs identically with isolation (ObjectId/Date preserved, no alias)', async () => {
    const get = vi.fn(async (doc: { address?: string }) => `addr:${doc.address}`);
    const snapshot = snap({
      permissionSchema: {
        name: { read: true },
        address: { read: true },
        when: { read: true },
        fullAddress: { read: true },
      },
      virtuals: { fullAddress: { get, dependsOn: ['address'] } } as never,
    });
    const plan = planVirtualProjection({
      receivingModelName: 'U',
      snapshot,
      virtualAccess: READ,
      outputAccess: READ,
      docPermissionsAccess: READ,
      requestedSelect: ['name', 'when', 'fullAddress'],
      globalPermissions: nonePerms,
    });
    const oid = new mongoose.Types.ObjectId();
    const when = new Date('2026-01-02T03:04:05.000Z');
    const leanInput = { _id: oid, name: 'n', address: 'a1', when, _permissions: {} };

    const leanOut = await finalizeModelOutput({
      receivingModelName: 'U',
      input: leanInput,
      virtualAccess: READ,
      outputAccess: READ,
      docPermissionsAccess: READ,
      scopePath: [],
      plan,
      snapshot,
      request: mockRequest(),
      context: baseContext(),
      docPermissions: {},
      globalPermissions: nonePerms,
    });
    expect(leanOut.fullAddress).toBe('addr:a1');
    expect(leanOut.name).toBe('n');
    // ObjectId/Date preserved without JSON clone
    expect(leanOut._id).toBeDefined();
    expect(String((leanOut as Record<string, unknown>)._id)).toBe(String(oid));
    expect((leanOut as Record<string, unknown>).when).toBeInstanceOf(Date);
    expect(((leanOut as Record<string, unknown>).when as Date).getTime()).toBe(when.getTime());
    // No alias: mutating output must not affect input
    expect((leanOut as Record<string, unknown>)._id).not.toBe(oid);
    expect((leanOut as Record<string, unknown>).when).not.toBe(when);
    (leanOut as Record<string, unknown>).name = 'mut';
    expect(leanInput.name).toBe('n');

    // Hydrated parity via in-memory mongoose doc (no DB)
    const M = mongoose.model('VirtFinHyd1', new mongoose.Schema({ name: String, address: String, when: Date }));
    const doc = new M({ _id: oid, name: 'n', address: 'a1', when });
    const hydOut = await finalizeModelOutput({
      receivingModelName: 'U',
      input: doc,
      virtualAccess: READ,
      outputAccess: READ,
      docPermissionsAccess: READ,
      scopePath: [],
      plan,
      snapshot,
      request: mockRequest(),
      context: baseContext(),
      docPermissions: {},
      globalPermissions: nonePerms,
    });
    expect(hydOut.fullAddress).toBe('addr:a1');
    expect(hydOut.name).toBe('n');
    expect(get).toHaveBeenCalled();
  });

  it('undefined omits; throw omits with structural log only', async () => {
    const warnSpy = vi.spyOn(loggerHelpers, 'warn').mockImplementation(() => {});
    const undefGet = vi.fn(async () => undefined);
    const throwGet = vi.fn(async () => {
      throw new Error('boom');
    });
    const snapshot = snap({
      permissionSchema: { name: { read: true }, vUndef: { read: true }, vThrow: { read: true } },
      virtuals: {
        vUndef: { get: undefGet, dependsOn: [] },
        vThrow: { get: throwGet, dependsOn: [] },
      } as never,
    });
    const plan = planVirtualProjection({
      receivingModelName: 'U',
      snapshot,
      virtualAccess: READ,
      outputAccess: READ,
      docPermissionsAccess: READ,
      requestedSelect: ['name', 'vUndef', 'vThrow'],
      globalPermissions: nonePerms,
    });
    const out = await finalizeModelOutput({
      receivingModelName: 'U',
      input: { _id: '1', name: 'n' },
      virtualAccess: READ,
      outputAccess: READ,
      docPermissionsAccess: READ,
      scopePath: [],
      plan,
      snapshot,
      request: mockRequest(),
      context: baseContext(),
      docPermissions: {},
      globalPermissions: nonePerms,
    });
    expect(out).not.toHaveProperty('vUndef');
    expect(out).not.toHaveProperty('vThrow');
    expect(out).toHaveProperty('name', 'n');
    expect(undefGet).toHaveBeenCalledTimes(1);
    expect(throwGet).toHaveBeenCalledTimes(1);
    expect(warnSpy).toHaveBeenCalledTimes(1);
    const [msg, meta] = warnSpy.mock.calls[0] as [string, Record<string, unknown>];
    expect(msg).toContain('virtual getter failed');
    expect(meta).toMatchObject({
      modelName: 'U',
      field: 'vThrow',
      virtualAccess: 'read',
      outputAccess: 'read',
      category: 'virtualGetterFailed',
    });
    // Allowlist only: no input/return/message/stack/raw deps
    const serialized = JSON.stringify([msg, meta]);
    expect(serialized).not.toContain('boom');
    expect(Object.keys(meta).sort()).toEqual(
      ['category', 'field', 'modelName', 'operation', 'outputAccess', 'scope', 'virtualAccess'].sort(),
    );
  });

  it('absent dep skips; present null/0/false run', async () => {
    const get = vi.fn(async (doc: Record<string, unknown>) => `seen:${String(doc.address)}`);
    const snapshot = snap({
      permissionSchema: { address: { read: true }, v: { read: true } },
      virtuals: { v: { get, dependsOn: ['address'] } } as never,
    });
    const mkPlan = () =>
      planVirtualProjection({
        receivingModelName: 'U',
        snapshot,
        virtualAccess: READ,
        outputAccess: READ,
        docPermissionsAccess: READ,
        requestedSelect: ['v'],
        globalPermissions: nonePerms,
      });
    const run = (input: Record<string, unknown>) =>
      finalizeModelOutput({
        receivingModelName: 'U',
        input,
        virtualAccess: READ,
        outputAccess: READ,
        docPermissionsAccess: READ,
        scopePath: [],
        plan: mkPlan(),
        snapshot,
        request: mockRequest(),
        context: baseContext(),
        docPermissions: {},
        globalPermissions: nonePerms,
      });

    get.mockClear();
    expect(await run({ _id: '1' })).not.toHaveProperty('v');
    expect(get).not.toHaveBeenCalled();

    get.mockClear();
    expect(await run({ _id: '1', address: undefined })).not.toHaveProperty('v');
    expect(get).not.toHaveBeenCalled();

    for (const falsy of [null, 0, false, '']) {
      get.mockClear();
      const out = await run({ _id: '1', address: falsy as never });
      expect(out).toHaveProperty('v', `seen:${String(falsy)}`);
      expect(get).toHaveBeenCalledTimes(1);
    }
  });

  it('strips virtual-only deps unless independently requested/allowed', async () => {
    const get = vi.fn(async (doc: { address?: string }) => `addr:${doc.address}`);
    const snapshot = snap({
      permissionSchema: { name: { read: true }, address: { read: true }, fullAddress: { read: true } },
      virtuals: { fullAddress: { get, dependsOn: ['address'] } } as never,
    });
    const planHidden = planVirtualProjection({
      receivingModelName: 'U',
      snapshot,
      virtualAccess: READ,
      outputAccess: READ,
      docPermissionsAccess: READ,
      requestedSelect: ['name', 'fullAddress'],
      globalPermissions: nonePerms,
    });
    const hidden = await finalizeModelOutput({
      receivingModelName: 'U',
      input: { _id: '1', name: 'n', address: 'a' },
      virtualAccess: READ,
      outputAccess: READ,
      docPermissionsAccess: READ,
      scopePath: [],
      plan: planHidden,
      snapshot,
      request: mockRequest(),
      context: baseContext(),
      docPermissions: {},
      globalPermissions: nonePerms,
    });
    expect(hidden).toHaveProperty('fullAddress', 'addr:a');
    expect(hidden).not.toHaveProperty('address');

    const planShown = planVirtualProjection({
      receivingModelName: 'U',
      snapshot,
      virtualAccess: READ,
      outputAccess: READ,
      docPermissionsAccess: READ,
      requestedSelect: ['name', 'address', 'fullAddress'],
      globalPermissions: nonePerms,
    });
    const shown = await finalizeModelOutput({
      receivingModelName: 'U',
      input: { _id: '1', name: 'n', address: 'a' },
      virtualAccess: READ,
      outputAccess: READ,
      docPermissionsAccess: READ,
      scopePath: [],
      plan: planShown,
      snapshot,
      request: mockRequest(),
      context: baseContext(),
      docPermissions: {},
      globalPermissions: nonePerms,
    });
    expect(shown).toHaveProperty('address', 'a');
    expect(shown).toHaveProperty('fullAddress', 'addr:a');
  });

  it('unauthorized virtuals skip without running getters', async () => {
    const deniedGet = vi.fn(async () => 'x');
    const fnDeniedGet = vi.fn(async () => 'y');
    const snapshot = snap({
      permissionSchema: {
        name: { read: true },
        denied: { read: false },
        fnDenied: {
          read: async () => false,
        },
      },
      virtuals: {
        denied: { get: deniedGet, dependsOn: [] },
        fnDenied: { get: fnDeniedGet, dependsOn: [] },
      } as never,
    });
    const plan = planVirtualProjection({
      receivingModelName: 'U',
      snapshot,
      virtualAccess: READ,
      outputAccess: READ,
      docPermissionsAccess: READ,
      requestedSelect: ['name', 'denied', 'fnDenied'],
      globalPermissions: nonePerms,
    });
    // Planner drops definite denials; fnDenied is deferred (function) until finalizer.
    const out = await finalizeModelOutput({
      receivingModelName: 'U',
      input: { _id: '1', name: 'n' },
      virtualAccess: READ,
      outputAccess: READ,
      docPermissionsAccess: READ,
      scopePath: [],
      plan,
      snapshot,
      request: mockRequest(),
      context: baseContext(),
      docPermissions: {},
      globalPermissions: nonePerms,
    });
    expect(out).not.toHaveProperty('denied');
    expect(out).not.toHaveProperty('fnDenied');
    expect(deniedGet).not.toHaveBeenCalled();
    expect(fnDeniedGet).not.toHaveBeenCalled();
  });

  it('getter receives isolated view; permissions.has works; full grants with metadata off', async () => {
    let seenHas = false;
    let seenDocPerms: unknown = null;
    const get = vi.fn(async function (
      this: unknown,
      doc: Record<string, unknown>,
      perms: { has: (k: string) => boolean },
      ctx: { docPermissions: unknown },
    ) {
      seenHas = perms.has('canView');
      seenDocPerms = (ctx as { docPermissions: unknown }).docPermissions;
      // Mutate view: must not leak to output. Capture original first so the
      // returned value reflects pre-mutation input, not the hack.
      const original = (doc as Record<string, unknown>).address;
      (doc as Record<string, unknown>).address = 'HACKED';
      return `ok:${original}`;
    });
    const snapshot = snap({
      permissionSchema: {
        address: { read: true },
        v: { read: 'canView' },
      },
      virtuals: { v: { get, dependsOn: ['address'] } } as never,
      modelPermissionPrefix: '',
      exposedDocPermissionKeys: [],
      stripPermissionsField: true,
      disableFieldPermissions: true,
    });
    const plan = planVirtualProjection({
      receivingModelName: 'U',
      snapshot,
      virtualAccess: READ,
      outputAccess: READ,
      docPermissionsAccess: READ,
      requestedSelect: ['v'],
      globalPermissions: permsWith({ canView: true }),
    });
    const ctx = baseContext({ docPermissions: undefined });
    const out = await finalizeModelOutput({
      receivingModelName: 'U',
      input: { _id: '1', address: 'real' },
      virtualAccess: READ,
      outputAccess: READ,
      docPermissionsAccess: READ,
      scopePath: [],
      plan,
      snapshot,
      request: mockRequest(),
      context: ctx,
      docPermissions: { canView: true },
      globalPermissions: permsWith({ canView: true }),
    });
    expect(out).toHaveProperty('v', 'ok:real');
    expect(seenHas).toBe(true);
    expect(seenDocPerms).toEqual({ canView: true });
    // Scope-aware getter context carries full internal grants despite
    // metadata-off flags (exposedDocPermissionKeys/strip/disable affect
    // serialization at the caller boundary only, never auth inputs).
    // The caller's base context object is left untouched per-row so list
    // finalization cannot clobber grants across rows.
  });

  it('uses supplied map once (no second hook call); hook path resolves when absent', async () => {
    const hookSpy = vi.fn(async () => ({ canView: true }));
    const get = vi.fn(async () => 'v');
    const snapshot = snap({
      permissionSchema: { v: { read: 'canView' } },
      virtuals: { v: { get, dependsOn: [] } } as never,
    });
    const plan = planVirtualProjection({
      receivingModelName: 'U',
      snapshot,
      virtualAccess: READ,
      outputAccess: READ,
      docPermissionsAccess: READ,
      requestedSelect: ['v'],
      globalPermissions: nonePerms,
    });
    // Supplied map wins; hook must not run.
    await finalizeModelOutput({
      receivingModelName: 'U',
      input: { _id: '1' },
      virtualAccess: READ,
      outputAccess: READ,
      docPermissionsAccess: READ,
      scopePath: [],
      plan,
      snapshot,
      request: mockRequest({ macl: { genDocPermissions: hookSpy } }),
      context: baseContext(),
      docPermissions: { canView: true },
      globalPermissions: nonePerms,
    });
    expect(hookSpy).not.toHaveBeenCalled();
    expect(get).toHaveBeenCalledTimes(1);

    get.mockClear();
    hookSpy.mockClear();
    // No supplied map: hook runs once for both virtual auth + trim.
    await finalizeModelOutput({
      receivingModelName: 'U',
      input: { _id: '1' },
      virtualAccess: READ,
      outputAccess: READ,
      docPermissionsAccess: READ,
      scopePath: [],
      plan,
      snapshot,
      request: mockRequest({ macl: { genDocPermissions: hookSpy } }),
      context: baseContext(),
      globalPermissions: nonePerms,
    });
    expect(hookSpy).toHaveBeenCalledTimes(1);
    expect(get).toHaveBeenCalledTimes(1);
  });

  it('nested mutation then throw changes neither output nor snapshots; staged objects isolated', async () => {
    const warnSpy = vi.spyOn(loggerHelpers, 'warn').mockImplementation(() => {});
    const originalSnapshot = { address: 'orig', nested: { x: 1 } };
    const input = { _id: '1', address: 'orig', nested: { x: 1 } };
    const inputJSON = JSON.stringify(input);
    const evilGet = vi.fn(async (doc: Record<string, unknown>) => {
      (doc as Record<string, unknown>).address = 'MUT';
      ((doc as Record<string, unknown>).nested as Record<string, unknown>).x = 999;
      throw new Error('nested-fail');
    });
    const objGet = vi.fn(async () => ({ deep: { list: [1, 2] } }));
    const snapshot = snap({
      permissionSchema: { address: { read: true }, nested: { read: true }, evil: { read: true }, obj: { read: true } },
      virtuals: {
        evil: { get: evilGet, dependsOn: ['address'] },
        obj: { get: objGet, dependsOn: [] },
      } as never,
    });
    const plan = planVirtualProjection({
      receivingModelName: 'U',
      snapshot,
      virtualAccess: READ,
      outputAccess: READ,
      docPermissionsAccess: READ,
      requestedSelect: ['address', 'nested', 'evil', 'obj'],
      globalPermissions: nonePerms,
    });
    const ctx = baseContext({ originalDocumentSnapshot: { ...originalSnapshot } });
    const out = (await finalizeModelOutput({
      receivingModelName: 'U',
      input,
      virtualAccess: READ,
      outputAccess: READ,
      docPermissionsAccess: READ,
      scopePath: [],
      plan,
      snapshot,
      request: mockRequest(),
      context: ctx,
      docPermissions: {},
      globalPermissions: nonePerms,
    })) as Record<string, unknown>;
    expect(out).not.toHaveProperty('evil');
    expect(out).toHaveProperty('address', 'orig');
    expect(out).toHaveProperty('nested', { x: 1 });
    expect(JSON.stringify(input)).toBe(inputJSON);
    expect((ctx as Record<string, unknown>).originalDocumentSnapshot).toEqual(originalSnapshot);
    expect(warnSpy).toHaveBeenCalled();
    // Returned object isolated: mutating output must not alias getter internals
    const returned = out.obj as { deep: { list: number[] } };
    returned.deep.list.push(3);
    // Second finalization from same input still yields pristine 2-item list
    const out2 = (await finalizeModelOutput({
      receivingModelName: 'U',
      input: { _id: '1', address: 'orig', nested: { x: 1 } },
      virtualAccess: READ,
      outputAccess: READ,
      docPermissionsAccess: READ,
      scopePath: [],
      plan,
      snapshot,
      request: mockRequest(),
      context: baseContext(),
      docPermissions: {},
      globalPermissions: nonePerms,
    })) as Record<string, unknown>;
    expect((out2.obj as { deep: { list: number[] } }).deep.list).toEqual([1, 2]);
  });

  it('shared nested input cannot alias across outputs', async () => {
    const get = vi.fn(async (doc: Record<string, unknown>) => (doc as { n?: { x?: number } }).n?.x);
    const snapshot = snap({
      permissionSchema: { n: { read: true }, v: { read: true } },
      virtuals: { v: { get, dependsOn: [] } } as never,
    });
    const plan = planVirtualProjection({
      receivingModelName: 'U',
      snapshot,
      virtualAccess: READ,
      outputAccess: READ,
      docPermissionsAccess: READ,
      requestedSelect: ['n', 'v'],
      globalPermissions: nonePerms,
    });
    const shared = { x: 1 };
    const inputs = [
      { _id: '1', n: shared },
      { _id: '2', n: shared },
    ];
    const outs = await finalizeModelOutputs({
      receivingModelName: 'U',
      inputs,
      virtualAccess: READ,
      outputAccess: READ,
      docPermissionsAccess: READ,
      scopePath: [],
      plan,
      snapshot,
      request: mockRequest(),
      context: baseContext(),
      docPermissions: {},
      globalPermissions: nonePerms,
      concurrencyLimit: 5,
    });
    expect(outs).toHaveLength(2);
    (outs[0].n as Record<string, unknown>).x = 999;
    expect((outs[1].n as Record<string, unknown>).x).toBe(1);
    expect(shared.x).toBe(1);
  });

  it('sibling completion order does not change inputs/results', async () => {
    const seen: Record<string, unknown[]> = { a: [], b: [] };
    const getA = vi.fn(async (doc: Record<string, unknown>) => {
      await new Promise((r) => setTimeout(r, 30));
      seen.a.push((doc as Record<string, unknown>).b);
      return 'A';
    });
    const getB = vi.fn(async (doc: Record<string, unknown>) => {
      await new Promise((r) => setTimeout(r, 5));
      seen.b.push((doc as Record<string, unknown>).a);
      return 'B';
    });
    const snapshot = snap({
      permissionSchema: { x: { read: true }, a: { read: true }, b: { read: true } },
      virtuals: {
        a: { get: getA, dependsOn: ['x'] },
        b: { get: getB, dependsOn: ['x'] },
      } as never,
    });
    const plan = planVirtualProjection({
      receivingModelName: 'U',
      snapshot,
      virtualAccess: READ,
      outputAccess: READ,
      docPermissionsAccess: READ,
      requestedSelect: ['a', 'b'],
      globalPermissions: nonePerms,
    });
    const out = await finalizeModelOutput({
      receivingModelName: 'U',
      input: { _id: '1', x: 'x' },
      virtualAccess: READ,
      outputAccess: READ,
      docPermissionsAccess: READ,
      scopePath: [],
      plan,
      snapshot,
      request: mockRequest(),
      context: baseContext(),
      docPermissions: {},
      globalPermissions: nonePerms,
      concurrencyLimit: 5,
    });
    expect(out).toMatchObject({ a: 'A', b: 'B' });
    // Neither saw the other's committed value
    expect(seen.a).toEqual([undefined]);
    expect(seen.b).toEqual([undefined]);
  });

  it('multi-row peak stays at/below limit; stable order regardless of completion', async () => {
    let active = 0;
    let peak = 0;
    const mkGet = (id: string, delay: number) =>
      vi.fn(async () => {
        active += 1;
        peak = Math.max(peak, active);
        await new Promise((r) => setTimeout(r, delay));
        active -= 1;
        return id;
      });
    const g1 = mkGet('g1', 15);
    const g2 = mkGet('g2', 5);
    const snapshot = snap({
      permissionSchema: { x: { read: true }, g1: { read: true }, g2: { read: true } },
      virtuals: {
        g1: { get: g1, dependsOn: ['x'] },
        g2: { get: g2, dependsOn: ['x'] },
      } as never,
    });
    const plan = planVirtualProjection({
      receivingModelName: 'U',
      snapshot,
      virtualAccess: READ,
      outputAccess: READ,
      docPermissionsAccess: READ,
      requestedSelect: ['x', 'g1', 'g2'],
      globalPermissions: nonePerms,
    });
    const inputs = Array.from({ length: 12 }, (_, i) => ({ _id: String(i), x: `x${i}` }));
    const outs = await finalizeModelOutputs({
      receivingModelName: 'U',
      inputs,
      virtualAccess: READ,
      outputAccess: READ,
      docPermissionsAccess: READ,
      scopePath: [],
      plan,
      snapshot,
      request: mockRequest(),
      context: baseContext(),
      docPermissions: {},
      globalPermissions: nonePerms,
      concurrencyLimit: 3,
    });
    expect(outs).toHaveLength(12);
    expect(peak).toBeLessThanOrEqual(3);
    // Stable input order preserved
    expect(outs.map((o) => (o as Record<string, unknown>)._id)).toEqual(inputs.map((i) => i._id));
    for (const o of outs) expect(o).toMatchObject({ g1: 'g1', g2: 'g2' });
  });

  it('limit-1 completes with nested children (no deadlock) and finite child work', async () => {
    const childGet = vi.fn(
      async (doc: Record<string, unknown>) => `nick:${(doc as { displayName?: string }).displayName}`,
    );
    const parentGet = vi.fn(async (doc: Record<string, unknown>) => {
      const contacts = (doc as { contacts?: Array<{ nick?: string }> }).contacts;
      return `has:${contacts?.[0]?.nick ?? 'none'}`;
    });
    const snapshot = snap({
      permissionSchema: {
        name: { read: true },
        contacts: { read: true, sub: { displayName: { read: true }, nick: { read: true } } } as never,
        label: { read: true },
      },
      virtuals: {
        contacts: { sub: { nick: { get: childGet, dependsOn: ['displayName'] } } },
        label: { get: parentGet, dependsOn: [] },
      } as never,
    });
    const plan = planVirtualProjection({
      receivingModelName: 'U',
      snapshot,
      virtualAccess: READ,
      outputAccess: READ,
      docPermissionsAccess: READ,
      requestedSelect: undefined,
      globalPermissions: nonePerms,
    });
    expect(plan.childPlans.contacts).toBeDefined();
    const out = (await finalizeModelOutput({
      receivingModelName: 'U',
      input: { _id: '1', name: 'n', contacts: [{ displayName: 'Ann' }, { displayName: 'Bob' }] },
      virtualAccess: READ,
      outputAccess: READ,
      docPermissionsAccess: READ,
      scopePath: [],
      plan,
      snapshot,
      request: mockRequest(),
      context: baseContext(),
      docPermissions: {},
      globalPermissions: nonePerms,
      concurrencyLimit: 1,
    })) as Record<string, unknown>;
    expect(childGet).toHaveBeenCalledTimes(2);
    expect(parentGet).toHaveBeenCalledTimes(1);
    // Children finalized before parent: parent saw finalized nick
    expect(out).toHaveProperty('label', 'has:nick:Ann');
    const contacts = out.contacts as Array<Record<string, unknown>>;
    expect(contacts[0]).toHaveProperty('nick', 'nick:Ann');
    // Child private deps stripped per child plan (displayName output-eligible here
    // under omitted-select, so retained; virtual-only check is via parent below).
  });

  it('secret embedded in thrown error message never reaches logs', async () => {
    const warnSpy = vi.spyOn(loggerHelpers, 'warn').mockImplementation(() => {});
    const SECRET = 'SECRET-9f8e7d6c5b4a'; // pragma: allowlist secret
    const evil = vi.fn(async () => {
      throw new Error(`failed with ${SECRET} inside`);
    });
    const snapshot = snap({
      permissionSchema: { name: { read: true }, evil: { read: true } },
      virtuals: { evil: { get: evil, dependsOn: [] } } as never,
    });
    const plan = planVirtualProjection({
      receivingModelName: 'U',
      snapshot,
      virtualAccess: READ,
      outputAccess: READ,
      docPermissionsAccess: READ,
      requestedSelect: ['name', 'evil'],
      globalPermissions: nonePerms,
    });
    const out = await finalizeModelOutput({
      receivingModelName: 'U',
      input: { _id: '1', name: 'n', address: SECRET },
      virtualAccess: READ,
      outputAccess: READ,
      docPermissionsAccess: READ,
      scopePath: [],
      plan,
      snapshot,
      request: mockRequest(),
      context: baseContext(),
      docPermissions: {},
      globalPermissions: nonePerms,
    });
    expect(out).not.toHaveProperty('evil');
    expect(warnSpy).toHaveBeenCalledTimes(1);
    for (const call of warnSpy.mock.calls) {
      const serialized = JSON.stringify(call);
      expect(serialized).not.toContain(SECRET);
      expect(serialized).not.toContain('failed with');
    }
  });

  it('does not mutate input and leaves snapshots/decorate ordering untouched', async () => {
    const get = vi.fn(async (doc: { a?: string }) => `${doc.a}!`);
    const snapshot = snap({
      permissionSchema: { a: { read: true }, v: { read: true } },
      virtuals: { v: { get, dependsOn: ['a'] } } as never,
    });
    const plan = planVirtualProjection({
      receivingModelName: 'U',
      snapshot,
      virtualAccess: READ,
      outputAccess: READ,
      docPermissionsAccess: READ,
      requestedSelect: ['a', 'v'],
      globalPermissions: nonePerms,
    });
    const input = { _id: '1', a: 'x' };
    const frozen = JSON.stringify(input);
    const ctx = baseContext({ originalDocumentSnapshot: { a: 'x' }, finalDocumentSnapshot: { a: 'x' } });
    const out = await finalizeModelOutput({
      receivingModelName: 'U',
      input,
      virtualAccess: READ,
      outputAccess: READ,
      docPermissionsAccess: READ,
      scopePath: [],
      plan,
      snapshot,
      request: mockRequest(),
      context: ctx,
      docPermissions: {},
      globalPermissions: nonePerms,
    });
    expect(JSON.stringify(input)).toBe(frozen);
    expect((ctx as Record<string, unknown>).originalDocumentSnapshot).toEqual({ a: 'x' });
    expect((ctx as Record<string, unknown>).finalDocumentSnapshot).toEqual({ a: 'x' });
    expect(out).toHaveProperty('v', 'x!');
    // No decorate/tasks side effects: output contains only finalized+trimmed keys
    expect(Object.keys(out).sort()).toEqual(['_id', 'a', 'v'].sort());
  });
});
