/** VIRT-03 retained output behavior, exercised through real owned calls/stages. */
import mongoose from 'mongoose';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { finalizeModelOutput, finalizeModelOutputs } from '../../src/output/finalize-model-output';
import * as loggerHelpers from '../../src/logger-helpers';
import Permission from '../../src/permission';
import { planAuthorizedModelProjection } from '../../src/acl/output-projection';
import { ownedStageFixture } from '../support/private/owned-stage-test-fixture';
import { expectOutputContext } from '../support/public/owned-output-context-fixture';

afterEach(() => vi.restoreAllMocks());

describe('VIRT-03 owned output finalizer', () => {
  it('computes lean and hydrated inputs identically with isolation (ObjectId/Date preserved, no alias)', async () => {
    const get = vi.fn((doc) => `addr:${doc.address}`);
    const f = ownedStageFixture({
      schema: { address: String },
      configuration: {
        catalog: { paths: ['name', 'address', 'when', 'fullAddress'], virtualPaths: ['fullAddress'] },
        permissionSchema: { name: true, address: true, when: true, fullAddress: true },
        virtuals: { fullAddress: { get, dependsOn: ['address'] } },
      },
      select: ['name', 'when', 'fullAddress'],
    });
    const source = { _id: 'same', name: 'n', address: 'a1', when: new Date(10) };
    const outputs = await finalizeModelOutputs({ ...f.args, inputs: [source, new f.model(source)] });
    expect(outputs[0]).toEqual(outputs[1]);
    for (const output of outputs) {
      expect(output).toMatchObject({ name: 'n', fullAddress: 'addr:a1', when: new Date(10) });
      expect(output.when).not.toBe(source.when);
      (output.when as Date).setTime(99);
    }
    expect(source.when.getTime()).toBe(10);
    expect(get).toHaveBeenCalledTimes(2);
    const id = new mongoose.Types.ObjectId();
    const oid = ownedStageFixture({ schema: { _id: mongoose.Schema.Types.ObjectId }, select: ['name'] });
    const output = await finalizeModelOutput({ ...oid.args, input: { _id: id, name: 'native' } });
    expect(output._id).toEqual(id);
    expect(output._id).not.toBe(id);
  });

  it('isolates native BSON Binary without clone() from getter mutation and returned output', async () => {
    const binary = new mongoose.mongo.Binary(Buffer.from('abc'));
    const get = vi.fn((doc) => {
      doc.binary.buffer[0] = 0;
      return 'computed';
    });
    const f = ownedStageFixture({
      configuration: {
        catalog: { paths: ['binary', 'v'], virtualPaths: ['v'] },
        permissionSchema: { binary: true, v: true },
        virtuals: { v: { get, dependsOn: ['binary'] } },
      },
    });
    const output = await finalizeModelOutput({ ...f.args, input: { binary } });
    expect(output.v).toBe('computed');
    expect((output.binary as mongoose.mongo.Binary).buffer[0]).toBe(97);
    expect(output.binary).not.toBe(binary);
    (output.binary as mongoose.mongo.Binary).buffer[0] = 1;
    expect(binary.buffer[0]).toBe(97);
  });

  it('undefined omits; throw omits with structural log only', async () => {
    const warn = vi.spyOn(loggerHelpers, 'warn').mockImplementation(() => {});
    const undef = vi.fn(() => undefined),
      thrown = vi.fn(() => {
        throw new Error('boom');
      });
    const f = ownedStageFixture({
      configuration: {
        catalog: { paths: ['name', 'vUndef', 'vThrow'], virtualPaths: ['vUndef', 'vThrow'] },
        permissionSchema: { name: true, vUndef: true, vThrow: true },
        virtuals: { vUndef: { get: undef }, vThrow: { get: thrown } },
      },
    });
    expect(await finalizeModelOutput({ ...f.args, input: { name: 'n' } })).toEqual({ name: 'n' });
    expect(undef).toHaveBeenCalledTimes(1);
    expect(thrown).toHaveBeenCalledTimes(1);
    expect(warn).toHaveBeenCalledTimes(1);
    const [message, meta] = warn.mock.calls[0];
    expect(message).toContain('virtual getter failed');
    expect(meta).toMatchObject({ modelName: f.model.modelName, field: 'vThrow', category: 'virtualGetterFailed' });
    expect(Object.keys(meta).sort()).toEqual(
      ['category', 'field', 'modelName', 'operation', 'outputAccess', 'scope', 'virtualAccess'].sort(),
    );
    expect(JSON.stringify(warn.mock.calls)).not.toContain('boom');
  });

  it('absent dep skips; present null/0/false run', async () => {
    const get = vi.fn((doc) => `seen:${String(doc.address)}`);
    for (const [present, address] of [
      [false, undefined],
      [true, undefined],
      [true, null],
      [true, 0],
      [true, false],
      [true, ''],
    ] as const) {
      get.mockClear();
      const f = ownedStageFixture({
        configuration: {
          catalog: { paths: ['address', 'v'], virtualPaths: ['v'] },
          permissionSchema: { address: true, v: true },
          virtuals: { v: { get, dependsOn: ['address'] } },
        },
        select: ['v', '-_id'],
      });
      const output = await finalizeModelOutput({ ...f.args, input: present ? { address } : {} });
      if (address === undefined) {
        expect(output).not.toHaveProperty('v');
        expect(get).not.toHaveBeenCalled();
      } else {
        expect(output.v).toBe(`seen:${String(address)}`);
        expect(get).toHaveBeenCalledTimes(1);
      }
    }
  });

  it('strips virtual-only deps unless independently requested/allowed', async () => {
    for (const shown of [false, true]) {
      const f = ownedStageFixture({
        configuration: {
          catalog: { paths: ['name', 'address', 'fullAddress'], virtualPaths: ['fullAddress'] },
          permissionSchema: { name: true, address: true, fullAddress: true },
          virtuals: { fullAddress: { get: (doc) => `addr:${doc.address}`, dependsOn: ['address'] } },
        },
        select: ['name', 'fullAddress', ...(shown ? ['address'] : []), '-_id'],
      });
      const output = await finalizeModelOutput({ ...f.args, input: { name: 'n', address: 'a' } });
      expect(output.fullAddress).toBe('addr:a');
      if (shown) expect(output.address).toBe('a');
      else expect(output).not.toHaveProperty('address');
    }
  });

  it('unauthorized virtuals skip without running getters', async () => {
    const get = vi.fn(() => 'denied');
    const f = ownedStageFixture({
      configuration: {
        catalog: { paths: ['name', 'denied', 'fnDenied'], virtualPaths: ['denied', 'fnDenied'] },
        permissionSchema: { name: true, denied: false, fnDenied: async () => false },
        virtuals: { denied: { get }, fnDenied: { get } },
      },
    });
    expect(await finalizeModelOutput({ ...f.args, input: { name: 'n' } })).toEqual({ name: 'n' });
    expect(get).not.toHaveBeenCalled();
  });

  it('getter receives isolated view; permissions.has works; full facts with metadata off', async () => {
    const get = vi.fn((doc, permissions, context) => {
      expect(permissions.has('canView')).toBe(true);
      expectOutputContext(context, { docPermissions: { canView: true } });
      const value = doc.address;
      doc.address = 'HACKED';
      return `ok:${value}`;
    });
    const f = ownedStageFixture({
      configuration: {
        catalog: { paths: ['address', 'v'], virtualPaths: ['v'] },
        permissionSchema: { address: true, v: 'canView' },
        virtuals: { v: { get, dependsOn: ['address'] } },
        docPermissions: () => ({ canView: true }),
        exposedDocPermissionKeys: [],
        stripPermissionsField: true,
        disableFieldPermissions: true,
      },
      select: ['v', '-_id'],
    });
    const call = f.ownCall({ requestPermissions: new Permission({ canView: true }) });
    const plan = planAuthorizedModelProjection({
      authorization: call,
      binding: f.binding,
      requestedSelect: ['v', '-_id'],
    });
    expect(await finalizeModelOutput({ ...f.args, plan, input: { address: 'real' } })).toEqual({ v: 'ok:real' });
  });

  it('resolves the captured stage hook once for both field authorization and trim; independent calls resolve anew', async () => {
    const hook = vi.fn(() => ({ canView: true })),
      get = vi.fn(() => 'v');
    const f = ownedStageFixture({
      configuration: {
        catalog: { paths: ['v'], virtualPaths: ['v'] },
        permissionSchema: { v: 'doc:canView' },
        virtuals: { v: { get } },
        docPermissions: hook,
      },
    });
    expect(await finalizeModelOutput({ ...f.args, input: {} })).toEqual({ v: 'v' });
    expect(hook).toHaveBeenCalledTimes(1);
    const call = f.ownCall();
    const plan = planAuthorizedModelProjection({ authorization: call, binding: f.binding, requestedSelect: ['-_id'] });
    expect(await finalizeModelOutput({ ...f.args, plan, input: {} })).toEqual({ v: 'v' });
    expect(hook).toHaveBeenCalledTimes(2);
    expect(get).toHaveBeenCalledTimes(2);
  });

  it('nested mutation then throw changes neither source nor output; staged objects isolated', async () => {
    vi.spyOn(loggerHelpers, 'warn').mockImplementation(() => {});
    const value = { deep: { list: [1, 2] } };
    const f = ownedStageFixture({
      configuration: {
        catalog: {
          paths: ['address', 'nested', 'evil', 'obj'],
          opaquePaths: ['nested'],
          virtualPaths: ['evil', 'obj'],
        },
        permissionSchema: { address: true, nested: true, evil: true, obj: true },
        virtuals: {
          evil: {
            get: (doc) => {
              doc.address = 'MUT';
              doc.nested.x = 99;
              throw new Error('failure');
            },
          },
          obj: { get: () => value },
        },
      },
    });
    const input = { address: 'orig', nested: { x: 1 } };
    const output = await finalizeModelOutput({ ...f.args, input });
    expect(output).not.toHaveProperty('evil');
    expect(output).toMatchObject(input);
    expect(input).toEqual({ address: 'orig', nested: { x: 1 } });
    (output.obj as typeof value).deep.list.push(3);
    expect(value.deep.list).toEqual([1, 2]);
  });

  it('shared nested input cannot alias across outputs', async () => {
    const f = ownedStageFixture({
      configuration: {
        catalog: { paths: ['n', 'v'], opaquePaths: ['n'], virtualPaths: ['v'] },
        permissionSchema: { n: true, v: true },
        virtuals: { v: { get: (doc) => doc.n.x } },
      },
    });
    const shared = { x: 1 };
    const outputs = await finalizeModelOutputs({ ...f.args, inputs: [{ n: shared }, { n: shared }] });
    (outputs[0].n as typeof shared).x = 99;
    expect(outputs[1].n).toEqual({ x: 1 });
    expect(shared.x).toBe(1);
  });

  it('sibling completion order does not change inputs/results', async () => {
    const seen: unknown[] = [];
    const f = ownedStageFixture({
      maxHookConcurrency: 5,
      configuration: {
        catalog: { paths: ['x', 'a', 'b'], virtualPaths: ['a', 'b'] },
        permissionSchema: { x: true, a: true, b: true },
        virtuals: Object.fromEntries(
          ['a', 'b'].map((key, index) => [
            key,
            {
              dependsOn: ['x'],
              get: async (doc) => {
                await new Promise((resolve) => setTimeout(resolve, index ? 5 : 30));
                seen.push(doc[index ? 'a' : 'b']);
                return key.toUpperCase();
              },
            },
          ]),
        ),
      },
      select: ['a', 'b', '-_id'],
    });
    expect(await finalizeModelOutput({ ...f.args, input: { x: 'x' } })).toEqual({ a: 'A', b: 'B' });
    expect(seen).toEqual([undefined, undefined]);
  });

  it('multi-row peak stays at/below limit; stable order regardless of completion', async () => {
    let active = 0,
      peak = 0;
    const get = (key: string, delay: number) => async () => {
      peak = Math.max(peak, ++active);
      await new Promise((resolve) => setTimeout(resolve, delay));
      active--;
      return key;
    };
    const f = ownedStageFixture({
      maxHookConcurrency: 3,
      configuration: {
        catalog: { paths: ['x', 'g1', 'g2'], virtualPaths: ['g1', 'g2'] },
        permissionSchema: { x: true, g1: true, g2: true },
        virtuals: { g1: { get: get('g1', 15) }, g2: { get: get('g2', 5) } },
      },
      select: ['x', 'g1', 'g2'],
    });
    const inputs = Array.from({ length: 12 }, (_, i) => ({ _id: String(i), x: `x${i}` }));
    const outputs = await finalizeModelOutputs({ ...f.args, inputs });
    expect(peak).toBeGreaterThan(1);
    expect(peak).toBeLessThanOrEqual(3);
    expect(active).toBe(0);
    expect(outputs.map((row) => row._id)).toEqual(inputs.map((row) => row._id));
    for (const row of outputs) expect(row).toMatchObject({ g1: 'g1', g2: 'g2' });
  });

  it('limit-1 completes with nested children (no deadlock) and finite child work', async () => {
    const child = vi.fn((doc) => `nick:${doc.name}`),
      parent = vi.fn((doc) => `has:${doc.children[0].nick}`);
    const f = ownedStageFixture({
      maxHookConcurrency: 1,
      configuration: {
        catalog: {
          paths: ['children', 'children.name', 'children.nick', 'label'],
          virtualPaths: ['children.nick', 'label'],
          embeddedPaths: ['children'],
        },
        permissionSchema: { children: { read: true, sub: { name: true, nick: true } }, label: true },
        virtuals: { children: { sub: { nick: { get: child, dependsOn: ['name'] } } }, label: { get: parent } },
      },
    });
    const output = await finalizeModelOutput({ ...f.args, input: { children: [{ name: 'Ann' }, { name: 'Bob' }] } });
    expect(output.label).toBe('has:nick:Ann');
    expect(child).toHaveBeenCalledTimes(2);
    expect(parent).toHaveBeenCalledTimes(1);
    expect((output.children as any[])[0].nick).toBe('nick:Ann');
  });

  it('secret embedded in thrown error message never reaches logs', async () => {
    const warn = vi.spyOn(loggerHelpers, 'warn').mockImplementation(() => {});
    const secret = 'SECRET-9f8e7d6c5b4a'; // pragma: allowlist secret
    const f = ownedStageFixture({
      configuration: {
        catalog: { paths: ['name', 'evil'], virtualPaths: ['evil'] },
        permissionSchema: { name: true, evil: true },
        virtuals: {
          evil: {
            get: () => {
              throw new Error(`failed with ${secret} inside`);
            },
          },
        },
      },
    });
    expect(await finalizeModelOutput({ ...f.args, input: { name: 'n' } })).toEqual({ name: 'n' });
    expect(warn).toHaveBeenCalledTimes(1);
    expect(JSON.stringify(warn.mock.calls)).not.toContain(secret);
    expect(JSON.stringify(warn.mock.calls)).not.toContain('failed with');
  });

  it('does not mutate input and gives callbacks only diagnostics before later presentation', async () => {
    const f = ownedStageFixture({
      configuration: {
        catalog: { paths: ['a', 'v'], virtualPaths: ['v'] },
        permissionSchema: { a: true, v: true },
        virtuals: {
          v: {
            get: (doc, _permissions, context) => {
              expectOutputContext(context);
              return `${doc.a}!`;
            },
            dependsOn: ['a'],
          },
        },
      },
      select: ['a', 'v'],
    });
    const input = { _id: '1', a: 'x' },
      original = { a: 'x' };
    const output = await finalizeModelOutput({
      ...f.args,
      input,
      context: { operation: 'read', originalDocumentSnapshot: original } as never,
      onFinalized: (_row, context) => expectOutputContext(context),
    });
    expect(input).toEqual({ _id: '1', a: 'x' });
    expect(original).toEqual({ a: 'x' });
    expect(output).toEqual({ _id: '1', a: 'x', v: 'x!' });
  });
});
