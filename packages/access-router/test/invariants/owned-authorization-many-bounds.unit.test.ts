import mongoose from 'mongoose';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { Core } from '../../src/core';
import { AccessRuntime } from '../../src/runtime';
import { runWithRuntime } from '../../src/runtime-context';
import Permission from '../../src/permission';
import { PERMISSIONS } from '../../src/symbols';
import type { ModelRequest } from '../../src/interfaces';
import * as publication from '../../src/acl/output-publication';
import * as materializer from '../../src/acl/trusted-output-materialization';
import { debitOutputPayload, debitOutputWork, withOutputWorkLedger } from '../../src/acl/output-work-ledger';
import { ServiceAuthorizationError } from '../../src/acl/authorization-snapshot';
import { copyAuthorizationValue } from '../../src/acl/authorization-snapshot';
import { captureAuthorizationFieldCatalog, clearCapturedOutputCatalog } from '../../src/acl/field-catalog';

let sequence = 0;
const mib = 1024 * 1024;
const badRequest = { result: { code: 'bad_request' } };

function fixture(schema = new mongoose.Schema({ name: String, payload: mongoose.Schema.Types.Mixed }, { _id: false })) {
  const model = mongoose.model(`Oar09ManyBounds${++sequence}`, schema);
  const runtime = new AccessRuntime();
  runtime.registerModelInstance(model.modelName, model);
  runtime.setModelOptions(model.modelName, {
    permissionSchema: { name: true, payload: true },
    stripPermissionsField: true,
  });
  const request = {
    [PERMISSIONS]: new Permission({}),
    query: {},
    params: {},
    get: () => undefined,
  } as unknown as ModelRequest;
  const core = runWithRuntime(runtime, () => (request.macl = new Core(request)));
  return {
    model,
    runtime,
    core,
    request,
    many: (rows: readonly unknown[]) => core.pickAllowedFieldsMany(model.modelName, rows, 'list'),
  };
}

function entries(count: number) {
  return Object.fromEntries(Array.from({ length: count }, (_, index) => [`k${index}`, false]));
}

function chain(depth: number): unknown {
  let value: unknown = 'leaf';
  for (let index = 0; index < depth; index++) value = { child: value };
  return value;
}

afterEach(() => {
  vi.restoreAllMocks();
  mongoose.deleteModel(/^Oar09ManyBounds/);
});

describe('OAR-09F separate row owners, ONE aggregate work/payload ledger', () => {
  it('retains inclusive 20,000 source/selected slots; another row never replenishes one row', async () => {
    const f = fixture();
    const exact = { payload: entries(19998) }; // record + payload root + 19,998 entries
    expect(await f.many([exact])).toEqual([exact]);
    await expect(f.many([{ payload: entries(19999) }])).rejects.toMatchObject(badRequest);
    await expect(f.many([{ name: 'small' }, { payload: entries(19999) }])).rejects.toMatchObject(badRequest);
  });

  it('retains depth 100, including source/native/metadata work, before any field predicate', async () => {
    const f = fixture();
    expect(await f.many([{ payload: chain(99) }])).toEqual([{ payload: chain(99) }]);
    await expect(f.many([{ payload: chain(100) }])).rejects.toMatchObject(badRequest);
    await expect(f.many([{ payload: new mongoose.mongo.Code('x', chain(100)) }])).rejects.toMatchObject(badRequest);
  });

  it('individually admitted rows can exhaust cumulative work without publishing a partial collection', async () => {
    const f = fixture();
    const row = { payload: entries(1500) };
    expect(await f.many([row])).toEqual([row]);
    const ledgers = vi.spyOn(publication, 'createCollectionOutputLedger');
    await expect(f.many(Array.from({ length: 80 }, () => row))).rejects.toMatchObject(badRequest);
    const ledger = ledgers.mock.results[0].value;
    expect(ledger.work).toBeLessThanOrEqual(200000);
    expect(ledger.failure).toBeInstanceOf(ServiceAuthorizationError);
  });

  it('exact aggregate boundary and next debit share all row owners, with no recipient double debit', async () => {
    const owner = publication.createOutputPublication();
    const ledger = publication.createCollectionOutputLedger(owner);
    const budgets = Array.from({ length: 10 }, () => publication.createPublicationRowBudget(owner));
    for (const budget of budgets) materializer.visitTrustedOutput(budget, 0, 20000);
    expect(ledger.work).toBe(200000);
    expect(() => materializer.visitTrustedOutput(publication.createPublicationRowBudget(owner), 0, 1)).toThrow(
      ServiceAuthorizationError,
    );
    expect(ledger.work).toBe(200000);
    await expect(publication.closeOutputPublication(owner)).rejects.toMatchObject(badRequest);

    const receiving = publication.createOutputPublication();
    const shared = publication.createCollectionOutputLedger(receiving);
    const a = publication.createPublicationRowBudget(receiving),
      b = publication.createPublicationRowBudget(receiving);
    const edge = materializer.createReceivingOutputBudget([
      { budget: a, depth: 0 },
      { budget: b, depth: 0 },
    ]);
    materializer.visitTrustedOutput(edge, 0, 7);
    expect(shared.work).toBe(7); // same visit, not 14
    materializer.visitTrustedOutput(a, 0, 7);
    expect(shared.work).toBe(14); // a real repeated traversal DOES debit again
    materializer.prepareTrustedOutputPayload(edge, '😀');
    expect(shared.payload).toBe(4);
    materializer.prepareTrustedOutputPayload(a, '😀');
    expect(shared.payload).toBe(8);
    await publication.closeOutputPublication(receiving);

    const independentOwner = publication.createOutputPublication();
    const unrelated = publication.createOutputPublication();
    const unrelatedLedger = publication.createCollectionOutputLedger(unrelated);
    const independent = withOutputWorkLedger(unrelatedLedger, () =>
      publication.createPublicationRowBudget(independentOwner),
    );
    materializer.visitTrustedOutput(independent, 0, 20000);
    expect(unrelatedLedger.work).toBe(0);
    await publication.closeOutputPublication(independentOwner);
    await publication.closeOutputPublication(unrelated);
  });

  it('an ACTUAL whole helper reaches exactly 200,000 and one extra outer slot rejects publication', async () => {
    const f = fixture(),
      ledgers = vi.spyOn(publication, 'createCollectionOutputLedger');
    await f.many([{ payload: {} }, { payload: {} }]);
    const base = ledgers.mock.results.at(-1)!.value.work;
    await f.many([{ payload: { k0: false } }, { payload: {} }]);
    const delta = ledgers.mock.results.at(-1)!.value.work - base;
    expect(delta).toBeGreaterThan(0);
    const total = Math.floor((200000 - base) / delta),
      padding = (200000 - base) % delta;
    const first = Math.min(total, 19998),
      second = total - first;
    expect(second).toBeLessThanOrEqual(19998);
    const rows = [
      { payload: entries(first) },
      { payload: entries(second) },
      ...Array.from({ length: padding }, () => null),
    ];
    expect(await f.many(rows)).toEqual(rows);
    expect(ledgers.mock.results.at(-1)!.value.work).toBe(200000);
    await expect(f.many([...rows, null])).rejects.toMatchObject(badRequest);
    expect(ledgers.mock.results.at(-1)!.value.work).toBeLessThanOrEqual(200000);
  });

  it('initial catalog/config capture participates, and ordinary singles keep their independent limits', async () => {
    const f = fixture();
    const ledgers = vi.spyOn(publication, 'createCollectionOutputLedger');
    expect(await f.many([])).toEqual([]);
    const empty = ledgers.mock.results[0].value;
    expect(empty.work).toBeGreaterThan(1);
    expect(empty.payload).toBeGreaterThan(0);
    for (let index = 0; index < 5; index++)
      expect(
        await f.core.pickAllowedFields(f.model.modelName, { payload: Buffer.alloc(4 * mib) }, 'list'),
      ).toHaveProperty('payload');
    expect(ledgers).toHaveBeenCalledTimes(1);
  });

  it('a branded catalog preload keeps its capture allowance but does not bill the SAME omitted visit twice', async () => {
    const f = fixture(),
      owner = publication.createOutputPublication();
    const ledger = publication.createCollectionOutputLedger(owner);
    const catalog = withOutputWorkLedger(ledger, () => captureAuthorizationFieldCatalog(f.model.schema, undefined));
    const before = ledger.work;
    withOutputWorkLedger(ledger, () => copyAuthorizationValue({ catalog }, true));
    expect(ledger.work - before).toBe(2); // root and catalog lookup, not a repeated graph copy
    const prior = ledger.work;
    withOutputWorkLedger(ledger, () => copyAuthorizationValue({ catalog: Object.freeze({ ...catalog }) }, true));
    expect(ledger.work - prior).toBeGreaterThan(2); // a real unbranded traversal DOES count
    clearCapturedOutputCatalog(catalog);
    await publication.closeOutputPublication(owner);
  });

  it('UTF-8 payload is cumulative across real source and output string preparations', async () => {
    const f = fixture();
    const ledgerSpy = vi.spyOn(publication, 'createCollectionOutputLedger');
    const value = '😀'.repeat(mib); // 4 MiB UTF-8, not 2 MiB characters
    expect(Buffer.byteLength(value)).toBe(4 * mib);
    expect(await f.many([{ payload: value }])).toEqual([{ payload: value }]);
    expect(ledgerSpy.mock.results[0].value.payload).toBeGreaterThanOrEqual(8 * mib);
    await expect(f.many([{ payload: value }, { payload: value }])).rejects.toMatchObject(badRequest);
  });

  it('debits native bytes BEFORE the actual router Buffer.from, including a later output copy', async () => {
    const f = fixture();
    const value = Buffer.alloc(4 * mib);
    const original = Buffer.from;
    const copies: number[] = [];
    vi.spyOn(Buffer, 'from').mockImplementation((...args: Parameters<typeof Buffer.from>) => {
      if (args[0] instanceof Uint8Array && args[0].byteLength >= value.byteLength) copies.push(args[0].byteLength);
      return Reflect.apply(original, Buffer, args);
    });
    await expect(f.many([{ payload: value }, { payload: value }])).rejects.toMatchObject(badRequest);
    // Two real source copies and first output copy; second output is rejected
    // BEFORE Buffer.from (config/path strings also use the cumulative payload).
    expect(copies).toEqual([4 * mib, 4 * mib, 4 * mib]);
    copies.length = 0;
    const tooLarge = Buffer.alloc(17 * mib);
    await expect(f.many([{ payload: tooLarge }])).rejects.toMatchObject(badRequest);
    expect(copies).toEqual([]);
  });

  it('exact payload boundary is inclusive and no later preparation can replenish it', async () => {
    const owner = publication.createOutputPublication(),
      ledger = publication.createCollectionOutputLedger(owner);
    const budget = publication.createPublicationRowBudget(owner);
    debitOutputPayload(ledger, 16 * mib - 4);
    expect(materializer.materializeTrustedOutputValue('😀', '', budget, { keep: () => true })).toBe('😀');
    expect(ledger.payload).toBe(16 * mib);
    expect(() => materializer.materializeTrustedOutputValue('a', '', budget, { keep: () => true })).toThrow(
      ServiceAuthorizationError,
    );
    expect(ledger.payload).toBe(16 * mib);
    await expect(publication.closeOutputPublication(owner)).rejects.toMatchObject(badRequest);
  });

  it('an ACTUAL whole helper reaches exactly 16 MiB, and the next native byte fails before copying', async () => {
    const f = fixture(),
      ledgers = vi.spyOn(publication, 'createCollectionOutputLedger');
    const variants = [{ payload: Buffer.alloc(0) }, { name: '', payload: Buffer.alloc(0) }];
    let chosen: (typeof variants)[number] | undefined,
      base = 0;
    for (const row of variants) {
      await f.many([row]);
      base = ledgers.mock.results.at(-1)!.value.payload;
      if ((16 * mib - base) % 2 === 0) {
        chosen = row;
        break;
      }
    }
    if (!chosen) throw new Error('fixture payload parity needs a distinct key, not a limit change');
    const bytes = (16 * mib - base) / 2;
    const row = { ...chosen, payload: Buffer.alloc(bytes) };
    const output = await f.many([row]);
    expect(output).toHaveLength(1);
    const result = output[0];
    if (!result || typeof result !== 'object' || !('payload' in result) || !Buffer.isBuffer(result.payload))
      throw new Error('expected canonical native payload');
    // Compare bytes natively: generic deep equality enumerates millions of byte
    // properties in the TEST runner, outside the helper operation being bounded.
    expect(Object.keys(result)).toEqual(Object.keys(row));
    expect(result.payload.byteLength).toBe(bytes);
    expect(result.payload.equals(row.payload)).toBe(true);
    expect(result.payload === row.payload).toBe(false);
    expect(ledgers.mock.results.at(-1)!.value.payload).toBe(16 * mib);
    const original = Buffer.from,
      copies: number[] = [];
    vi.spyOn(Buffer, 'from').mockImplementation((...args: Parameters<typeof Buffer.from>) => {
      if (args[0] instanceof Uint8Array && args[0].byteLength === bytes + 1) copies.push(args[0].byteLength);
      return Reflect.apply(original, Buffer, args);
    });
    await expect(f.many([{ ...chosen, payload: Buffer.alloc(bytes + 1) }])).rejects.toMatchObject(badRequest);
    expect(copies).toEqual([bytes + 1]); // source admitted; next output copy denied
  });

  it.each(['Code', 'DBRef', 'Map', 'holes'] as const)(
    '%s work uses the same depleted row/aggregate/native-wire owner',
    async (kind) => {
      const owner = publication.createOutputPublication(),
        ledger = publication.createCollectionOutputLedger(owner);
      const budget = publication.createPublicationRowBudget(owner);
      const fields = { id: new mongoose.Types.ObjectId(), ...entries(10) };
      const value =
        kind === 'Code'
          ? new mongoose.mongo.Code('x', fields)
          : kind === 'DBRef'
            ? new mongoose.mongo.DBRef('c', new mongoose.Types.ObjectId(), 'd', fields)
            : kind === 'Map'
              ? new Map(Object.entries(entries(10)))
              : new Array(10);
      materializer.visitTrustedOutput(budget, 0, 19999);
      const serialize = vi.spyOn(mongoose.mongo.BSON.ObjectId.prototype, 'serializeInto');
      expect(() =>
        withOutputWorkLedger(ledger, () =>
          materializer.materializeTrustedOutputValue(value, 'payload', budget, { keep: () => true }),
        ),
      ).toThrow(ServiceAuthorizationError);
      expect(serialize).not.toHaveBeenCalled();
      await expect(publication.closeOutputPublication(owner)).rejects.toMatchObject(badRequest);
    },
  );

  it('opaque native normalization cannot reset the remaining source/aggregate/payload budgets', async () => {
    const f = fixture();
    const value = new mongoose.mongo.Code('x', {});
    Object.defineProperty(value, 'toBSON', {
      value: () => ({ id: new mongoose.Types.ObjectId(), bytes: Buffer.alloc(17 * mib) }),
    });
    const serialize = vi.spyOn(mongoose.mongo.BSON.ObjectId.prototype, 'serializeInto');
    await expect(f.many([{ payload: value }])).rejects.toMatchObject(badRequest);
    expect(serialize).not.toHaveBeenCalled();
    // The allocation in the arbitrary trusted native hook is excluded, but our
    // explicit preparation/copy of its returned storage is NOT excluded.
  });

  it('aggregate exhaustion caught by a callback remains sticky and prevents later copying', async () => {
    const f = fixture();
    let ledger: ReturnType<typeof publication.createCollectionOutputLedger>;
    const create = publication.createCollectionOutputLedger;
    vi.spyOn(publication, 'createCollectionOutputLedger').mockImplementation((owner) => (ledger = create(owner)));
    const later = vi.fn(() => true);
    f.runtime.setModelOption(f.model.modelName, 'permissionSchema', {
      name: () => {
        try {
          debitOutputWork(ledger, 200000);
        } catch {
          /* deliberately caught */
        }
        return true;
      },
      payload: later,
    });
    await expect(f.many([{ name: 'N', payload: 'not copied' }])).rejects.toMatchObject(badRequest);
    expect(later).not.toHaveBeenCalled();
  });

  it.each(['rule', 'grant'] as const)(
    'explicit router %s split buffers are admitted BEFORE allocation, not hidden as opaque normalization',
    async (kind) => {
      const f = fixture();
      const value =
        kind === 'rule' ? Array.from({ length: 200001 }, () => 'reader').join(' ') : 'a.'.repeat(200001) + 'a';
      if (kind === 'rule') f.runtime.setModelOption(f.model.modelName, 'permissionSchema', { name: value });
      const split = String.prototype.split;
      let observed = 0;
      vi.spyOn(String.prototype, 'split').mockImplementation(function (separator, limit) {
        if (String.prototype.valueOf.call(this) === value) observed++;
        return Reflect.apply(split, this, [separator, limit]);
      });
      const work =
        kind === 'rule'
          ? f.many([{ name: 'N' }])
          : f.core.pickAllowedFieldsMany(f.model.modelName, [], 'list', {
              authorization: { outputFields: { mode: 'grant', paths: [value] } },
            });
      await expect(work).rejects.toMatchObject(badRequest);
      expect(observed).toBe(0);
    },
  );
});

describe('OAR-09F APPROVED opaque Mongoose normalization exclusion (NOT a global memory cap)', () => {
  it.each(['tiny', 'oversized'] as const)(
    'canonical native configuration normalization (%s return) is admitted before the explicit router copy',
    async (kind) => {
      const f = fixture();
      const input = Buffer.alloc(kind === 'tiny' ? 17 * mib : 1);
      const normalized = Buffer.alloc(kind === 'tiny' ? 1 : 17 * mib);
      const valueOf = vi.fn(() => normalized);
      input.valueOf = valueOf;
      Reflect.apply(f.runtime.setModelOption, f.runtime, [f.model.modelName, 'exposedDocPermissionKeys', input]);
      const original = Buffer.from,
        opaqueReturns: number[] = [],
        router: number[] = [];
      vi.spyOn(Buffer, 'from').mockImplementation((...args: Parameters<typeof Buffer.from>) => {
        if (args[0] instanceof Uint8Array && !Buffer.isBuffer(args[0])) router.push(args[0].byteLength);
        const result = Reflect.apply(original, Buffer, args);
        if (args[0] === input) {
          expect(result === normalized).toBe(false);
          opaqueReturns.push(result.byteLength);
        }
        return result;
      });
      const work = f.many([{ name: 'N' }]);
      if (kind === 'tiny') expect(await work).toEqual([{ name: 'N' }]);
      else await expect(work).rejects.toMatchObject(badRequest);
      expect(valueOf).toHaveBeenCalledTimes(1); // canonical Node normalization, not a replacement engine
      expect(opaqueReturns).toEqual([normalized.byteLength]); // API return sizes, not hidden allocation counts
      expect(router).toEqual(kind === 'tiny' ? [1] : []);
    },
  );

  it.each([
    { bytes: 17 * mib, count: 1 },
    { bytes: 4 * mib, count: 5 },
  ])(
    'real opaque Mongoose copies ($count × $bytes bytes) discarded to tiny results may pass',
    async ({ bytes, count }) => {
      const events: string[] = [];
      const f = fixture(
        new mongoose.Schema(
          { name: String, payload: Buffer },
          {
            _id: false,
            toObject: {
              transform(_doc, ret) {
                events.push('transform');
                expect(ret.payload.buffer.byteLength).toBe(bytes);
                return { name: ret.name };
              },
            },
          },
        ),
      );
      const doc = new f.model({ name: 'kept', payload: Buffer.alloc(bytes) });
      expect(doc.toObject).toBe(mongoose.Document.prototype.toObject);
      const original = Buffer.from;
      const copies: number[] = [];
      vi.spyOn(Buffer, 'from').mockImplementation((...args: Parameters<typeof Buffer.from>) => {
        if (args[0] === doc.payload) {
          copies.push(doc.payload.byteLength);
          events.push('opaque-copy');
        }
        return Reflect.apply(original, Buffer, args);
      });
      const realMaterialize = materializer.materializeTrustedOutputValue;
      vi.spyOn(materializer, 'materializeTrustedOutputValue').mockImplementation((...args) => {
        if (args[1] === '') {
          events.push('router-admission');
          expect(args[0]).toEqual({ name: 'kept' });
        }
        return realMaterialize(...args);
      });
      const ledgers = vi.spyOn(publication, 'createCollectionOutputLedger');
      expect(await f.many(Array.from({ length: count }, () => doc))).toEqual(
        Array.from({ length: count }, () => ({ name: 'kept' })),
      );
      expect(copies).toEqual(Array.from({ length: count }, () => bytes));
      expect(events).toEqual(
        Array.from({ length: count }, () => ['opaque-copy', 'transform', 'router-admission']).flat(),
      );
      expect(ledgers.mock.results[0].value.payload).toBeLessThan(mib);
    },
  );

  it('an oversized normalized result fails BEFORE the next explicit router native copy', async () => {
    const f = fixture(new mongoose.Schema({ name: String, payload: Buffer }, { _id: false }));
    const doc = new f.model({ name: 'large', payload: Buffer.alloc(17 * mib) });
    const original = Buffer.from;
    const opaque: number[] = [],
      router: number[] = [];
    vi.spyOn(Buffer, 'from').mockImplementation((...args: Parameters<typeof Buffer.from>) => {
      if (args[0] === doc.payload) opaque.push(doc.payload.byteLength);
      else if (args[0] instanceof Uint8Array && args[0].byteLength === 17 * mib) router.push(args[0].byteLength);
      return Reflect.apply(original, Buffer, args);
    });
    await expect(f.many([doc])).rejects.toMatchObject(badRequest);
    expect(opaque).toEqual([17 * mib]);
    expect(router).toEqual([]);
  });
});
