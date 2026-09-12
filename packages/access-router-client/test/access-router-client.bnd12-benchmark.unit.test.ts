import { describe, expect, it, vi } from 'vitest';
import type { AxiosRequestConfig } from 'axios';

import { Model, type ModelResponse, type ModelService } from '../src';
import type { CreateOptions, UpdateOptions } from '../src';

interface BenchDoc {
  _id?: string;
  name: string;
  status?: string;
  [key: string]: unknown;
}

type BenchData = Partial<BenchDoc>;

const ok = (raw: Record<string, unknown>) =>
  ({
    success: true,
    raw,
    data: null,
    message: '',
    status: 200,
    headers: {},
  }) as unknown as ModelResponse<BenchDoc, BenchData>;

/** Immediate-resolution fake: no axios, no timers, no I/O. Elapsed save
 *  time therefore measures clone/reconciliation/wrapper work, not network. */
const immediateService = (echo: (data: object) => Record<string, unknown>) => {
  const create = vi.fn(async (data: object) => ok(echo(data)));
  const update = vi.fn(async (_id: string, data: object) => ok(echo(data)));
  return { create, update, asModelService: () => ({ create, update }) as unknown as ModelService<BenchDoc> };
};

const smallDoc = (): BenchData => ({ _id: 'doc-small', name: 'alpha', status: 'old' });

const LARGE_FIELDS = 2000;
const LARGE_ITEMS = 500;

const largeDoc = (): BenchData => {
  const doc: BenchData = { _id: 'doc-large', name: 'large' } as BenchData;
  for (let i = 0; i < LARGE_FIELDS; i++) {
    (doc as Record<string, unknown>)[`f${String(i).padStart(4, '0')}`] = `v${i}`;
  }
  (doc as Record<string, unknown>).items = Array.from({ length: LARGE_ITEMS }, (_, i) => ({
    id: i,
    label: `label-${i}`,
    active: i % 2 === 0,
  }));
  return doc;
};

const heapMB = () => process.memoryUsage().heapUsed / 1024 / 1024;

interface Row {
  case: string;
  iters: number;
  totalMs: number;
  meanUs: number;
  heapDeltaMB: number;
  note: string;
}

const rows: Row[] = [];

function recordSync(name: string, iters: number, note: string, fn: (i: number) => void) {
  for (let i = 0; i < 5; i++) fn(i); // warmup (excluded)
  const heapBefore = heapMB();
  const start = performance.now();
  for (let i = 0; i < iters; i++) fn(i);
  const totalMs = performance.now() - start;
  const heapAfter = heapMB();
  rows.push({
    case: name,
    iters,
    totalMs,
    meanUs: (totalMs / iters) * 1000,
    heapDeltaMB: heapAfter - heapBefore,
    note,
  });
}

async function recordAsync(name: string, iters: number, note: string, fn: (i: number) => Promise<void>) {
  for (let i = 0; i < 3; i++) await fn(i); // warmup (excluded)
  const heapBefore = heapMB();
  const start = performance.now();
  for (let i = 0; i < iters; i++) await fn(i);
  const totalMs = performance.now() - start;
  const heapAfter = heapMB();
  rows.push({
    case: name,
    iters,
    totalMs,
    meanUs: (totalMs / iters) * 1000,
    heapDeltaMB: heapAfter - heapBefore,
    note,
  });
}

function report(env: string, sizes: string) {
  console.log(`[bnd12-benchmark] env: ${env}`);
  console.log(`[bnd12-benchmark] sizes: ${sizes}`);
  for (const r of rows) {
    console.log(
      `[bnd12-benchmark] ${r.case} iters=${r.iters} totalMs=${r.totalMs.toFixed(2)} ` +
        `meanUs=${r.meanUs.toFixed(1)} heapDeltaMB=${r.heapDeltaMB.toFixed(2)} note=${r.note}`,
    );
  }
}

describe('BND-12 model copy-cost benchmark (network excluded)', () => {
  it('measures construction and save reconciliation across sizes and edit densities', async () => {
    const env = `node=${process.version} platform=${process.platform}-${process.arch}`;
    const smallBytes = JSON.stringify(smallDoc()).length;
    const largeBytes = JSON.stringify(largeDoc()).length;
    const sizes =
      `smallDocKeys=3 smallJSON=${smallBytes}B ` +
      `largeTopFields=${LARGE_FIELDS + 3} largeItems=${LARGE_ITEMS} largeJSON=${largeBytes}B ` +
      `fake=immediate-microtask(no-axios/no-timers)`;

    // 1. Construction: small documents (fromExisting so starts clean).
    recordSync('construct/small', 500, 'Model.create 3-key existing doc', () => {
      const svc = immediateService((d) => d as Record<string, unknown>);
      const m = Model.create<BenchDoc, BenchData>(smallDoc(), svc.asModelService(), 'doc-small', true);
      expect(m.isDirty()).toBe(false);
    });

    // 2. Construction: large documents.
    recordSync('construct/large', 20, `Model.create ${LARGE_FIELDS + 3}-key existing doc`, () => {
      const svc = immediateService((d) => d as Record<string, unknown>);
      const m = Model.create<BenchDoc, BenchData>(largeDoc(), svc.asModelService(), 'doc-large', true);
      expect(m.isDirty()).toBe(false);
    });

    // 3. Save reconciliation, sparse edit, small doc. Wrapper is built once
    // outside the timed loop so elapsed time is per-iteration set(1)+save.
    {
      const svc = immediateService(() => ({ name: 'server-name' }));
      const m = Model.create<BenchDoc, BenchData>(smallDoc(), svc.asModelService(), 'doc-small', true);
      await recordAsync('save/sparse-small', 50, 'per-iter set(1)+save, echoed server field', async () => {
        m.set('name', `client-${Math.random()}`);
        const result = await m.save();
        expect(result.success).toBe(true);
        expect(m.isDirty()).toBe(false);
      });
      expect(svc.update).toHaveBeenCalledTimes(53); // 50 timed + 3 warmup
      expect(svc.update).toHaveBeenLastCalledWith(
        'doc-small',
        { name: (svc.update.mock.calls[svc.update.mock.calls.length - 1][1] as { name: string }).name },
        { returningAll: false },
        undefined,
      );
    }

    // 4. Save reconciliation, sparse edit, large doc (server omits fields).
    // Wrapper built once outside the loop: isolates per-save reconciliation
    // (snapshot rebuild + returned wrapper) at O(doc size) from construction.
    {
      const svc = immediateService(() => ({}));
      const m = Model.create<BenchDoc, BenchData>(largeDoc(), svc.asModelService(), 'doc-large', true);
      await recordAsync('save/sparse-large', 10, 'per-iter set(1)+save on 2000+-key doc, empty echo', async () => {
        m.set('name', `client-${Math.random()}`);
        const result = await m.save();
        expect(result.success).toBe(true);
        expect(m.isDirty()).toBe(false);
      });
      expect(svc.update).toHaveBeenCalledTimes(13); // 10 timed + 3 warmup
    }

    // 5. Save reconciliation, dense edit, large doc (every top field rewritten
    // per iteration; the assign edit itself is part of the timed iteration).
    {
      const svc = immediateService(() => ({}));
      const m = Model.create<BenchDoc, BenchData>(largeDoc(), svc.asModelService(), 'doc-large', true);
      await recordAsync('save/dense-large', 5, `per-iter assign(${LARGE_FIELDS})+save, empty echo`, async (i) => {
        const patch: Record<string, unknown> = {};
        for (let f = 0; f < LARGE_FIELDS; f++) patch[`f${String(f).padStart(4, '0')}`] = `w${i}-${f}`;
        m.assign(patch as BenchData);
        expect(m.isDirty()).toBe(true);
        const result = await m.save();
        expect(result.success).toBe(true);
        expect(m.isDirty()).toBe(false);
      });
      const sent = svc.update.mock.calls[svc.update.mock.calls.length - 1][1] as Record<string, unknown>;
      expect(Object.keys(sent).length).toBe(LARGE_FIELDS);
    }

    // 6. Multiple returned wrappers: sequential saves, independence preserved.
    const WRAPPERS = 10;
    const heapBefore = heapMB();
    const start = performance.now();
    const svc = immediateService(() => ({}));
    const origin = Model.create<BenchDoc, BenchData>(smallDoc(), svc.asModelService(), 'doc-small', true);
    const wrappers: Array<{ name: unknown }> = [];
    for (let i = 0; i < WRAPPERS; i++) {
      origin.set('name', `v${i}`);
      const result = await origin.save();
      expect(result.success).toBe(true);
      wrappers.push(result.data as unknown as { name: unknown });
    }
    const totalMs = performance.now() - start;
    const heapAfter = heapMB();
    // Independence (BND-06 guarantee): mutating one wrapper leaks nowhere.
    const first = wrappers[0] as unknown as Record<string, unknown>;
    first.name = 'mutated';
    expect(origin.name).toBe(`v${WRAPPERS - 1}`);
    expect((wrappers[WRAPPERS - 1] as unknown as Record<string, unknown>).name).toBe(`v${WRAPPERS - 1}`);
    expect(origin.isDirty()).toBe(false);
    rows.push({
      case: 'save/returned-wrappers',
      iters: WRAPPERS,
      totalMs,
      meanUs: (totalMs / WRAPPERS) * 1000,
      heapDeltaMB: heapAfter - heapBefore,
      note: 'sequential save adopting result.data each round',
    });

    report(env, sizes);
  }, 60000);
});

/**
 * BND-12 requirement 2 experiment: a narrow create/update persistence
 * interface that covers exactly what `Model.saveNow` uses, so unit fakes
 * need no `as unknown as ModelService` cast. This block proves the shape
 * without changing `src/model.ts` (no production change approved here).
 */
interface Bnd12Persistence<T extends { _id?: string }, TData extends Partial<T> = T> {
  create(data: object, options?: CreateOptions, reqConfig?: AxiosRequestConfig): Promise<ModelResponse<T, TData>>;
  update(
    identifier: string,
    data: object,
    options?: UpdateOptions,
    reqConfig?: AxiosRequestConfig,
  ): Promise<ModelResponse<T, TData>>;
}

describe('BND-12 narrow persistence interface feasibility', () => {
  it('types a fake with zero casts and stays satisfied by ModelService', async () => {
    // Fake needs NO cast: it is declared directly against the narrow interface.
    const calls: Array<{ op: string; data: object }> = [];
    const fake: Bnd12Persistence<BenchDoc, BenchData> = {
      create: async (data: object) => {
        calls.push({ op: 'create', data });
        return ok(data as Record<string, unknown>);
      },
      update: async (_id: string, data: object) => {
        calls.push({ op: 'update', data });
        return ok(data as Record<string, unknown>);
      },
    };

    // Compile-time proof that production typing still satisfies the narrow
    // interface (no weakening: the same CreateOptions/UpdateOptions and
    // ModelResponse shapes flow through). Fails to compile if not assignable.
    type ServiceSatisfiesNarrow = ModelService<BenchDoc> extends Bnd12Persistence<BenchDoc, BenchData> ? true : false;
    const serviceSatisfiesNarrow: ServiceSatisfiesNarrow = true;
    expect(serviceSatisfiesNarrow).toBe(true);

    // Runtime proof through the single contained boundary cast: harness code
    // passes `fake` with no cast; only this adapter line casts, once.
    const toModelService = (p: Bnd12Persistence<BenchDoc, BenchData>): ModelService<BenchDoc> =>
      p as unknown as ModelService<BenchDoc>;
    const model = Model.create<BenchDoc, BenchData>(
      { _id: 'doc-1', name: 'before' },
      toModelService(fake),
      undefined,
      true,
    );
    model.set('name', 'after');
    const result = await model.save();
    expect(result.success).toBe(true);
    expect(calls).toEqual([{ op: 'update', data: { name: 'after' } }]);
    expect(model.isDirty()).toBe(false);
    // Returned wrapper independence (BND-06 guarantee preserved under the
    // narrow interface): adopting result.data keeps its own dirty state.
    const adopted = result.data as unknown as Model<BenchDoc, BenchData> & BenchData;
    expect(adopted).not.toBe(model);
    expect(adopted.name).toBe('after');
  });
});
