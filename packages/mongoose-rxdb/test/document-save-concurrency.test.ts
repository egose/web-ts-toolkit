import { describe, expect, it, vi } from 'vitest';
import api, {
  Connection,
  Document,
  ParallelSaveError,
  Schema,
  ValidationError,
  WriteNormalizationError,
} from '../src/index';
import { createMemoryDatabase } from '../src/storage/index';
import { FakePersistenceAdapter } from './support/fake-adapter';

function barrier() {
  let enter!: () => void;
  let release!: () => void;
  const entered = new Promise<void>((resolve) => {
    enter = resolve;
  });
  const released = new Promise<void>((resolve) => {
    release = resolve;
  });
  return {
    entered,
    release,
    wait: async () => {
      enter();
      await released;
    },
  };
}

function setup(isNew = false, schema = new Schema<any>({ name: String, meta: Object, tags: [String] })) {
  const gate = barrier();
  const seed = { _id: 'save-1', name: 'initial', meta: { nested: { a: 1 } }, tags: ['initial'] };
  const adapter = new FakePersistenceAdapter(isNew ? [] : [seed]);
  const runtime = { resolveCollection: vi.fn(async () => adapter) };
  const doc = new Document(seed, schema, runtime, { isNew }) as Document<any> & typeof seed;
  const modify = adapter.incrementalModify.bind(adapter);
  vi.spyOn(adapter, 'incrementalModify').mockImplementationOnce(async (id, updater) => {
    await gate.wait();
    await modify(id, updater);
  });
  if (isNew) {
    const insert = adapter.insert.bind(adapter);
    vi.spyOn(adapter, 'insert').mockImplementationOnce(async (data) => {
      await gate.wait();
      return insert(data);
    });
  }
  return { doc, schema, adapter, gate, runtime };
}

describe('RMRX-04 in-flight save intent', () => {
  it('exports the overlap error through named and default root APIs', () => {
    expect(api.ParallelSaveError).toBe(ParallelSaveError);
    expect(new ParallelSaveError()).toBeInstanceOf(Error);
  });
  it.each(['assignment', 'set', 'object set', 'dotted set', 'markModified'])(
    'retains later %s replacement intent and removes unseen stored fields on the next save',
    async (kind) => {
      const { doc, adapter, gate } = setup();
      doc.name = 'captured';
      const saving = doc.save();
      await gate.entered;
      // An independent writer adds data absent from this document's snapshot.
      await adapter.modify(doc._id, {
        ...adapter.snapshot()[0],
        meta: { nested: { a: 1, unseen: true }, unseen: true },
      });
      if (kind === 'assignment') doc.meta = { nested: { a: 2 } };
      else if (kind === 'set') doc.set('meta', { nested: { a: 2 } });
      else if (kind === 'object set') doc.set({ meta: { nested: { a: 2 } } });
      else if (kind === 'dotted set') doc.set('meta.nested', { a: 2 });
      else {
        doc.meta.nested.a = 2;
        doc.markModified('meta');
      }
      gate.release();
      await saving;
      expect(adapter.snapshot()[0].meta.nested.a).toBe(1);
      expect(doc.isModified('meta')).toBe(true);
      await doc.save();
      expect(adapter.snapshot()[0].meta).toEqual(
        kind === 'dotted set' ? { nested: { a: 2 }, unseen: true } : { nested: { a: 2 } },
      );
      expect(doc.isModified()).toBe(false);
    },
  );

  it.each([false, true])('retains scalar, live array and replacement edits during save (isNew=%s)', async (isNew) => {
    const { doc, adapter, gate } = setup(isNew);
    doc.name = 'captured';
    const saving = doc.save();
    await gate.entered;
    doc.name = 'later';
    doc.tags.push('later');
    doc.meta = { nested: { a: 2 } };
    gate.release();
    await saving;
    expect(doc.isNew).toBe(false);
    expect(adapter.snapshot()[0]).toMatchObject({ name: 'captured', tags: ['initial'], meta: { nested: { a: 1 } } });
    expect(doc.modifiedPaths().sort()).toEqual(['meta', 'name', 'tags']);
    await adapter.modify(doc._id, { ...adapter.snapshot()[0], meta: { nested: { a: 1 }, unseen: true } });
    await doc.save();
    expect(adapter.snapshot()[0]).toMatchObject({ name: 'later', tags: ['initial', 'later'] });
    expect(adapter.snapshot()[0].meta).toEqual({ nested: { a: 2 } });
    expect(adapter.calls.insert).toHaveLength(isNew ? 1 : 0);
    expect(doc.isModified()).toBe(false);
  });

  it.each(['markModified', 'same-value assignment', 'clear then mark'])(
    'retains a new generation for an unchanged repeated path via %s',
    async (kind) => {
      const { doc, adapter, gate } = setup();
      doc.meta = { nested: { a: 2 } };
      const saving = doc.save();
      await gate.entered;
      if (kind === 'same-value assignment') doc.meta = { nested: { a: 2 } };
      else {
        if (kind === 'clear then mark') doc.clearModified();
        doc.markModified('meta');
      }
      gate.release();
      await saving;
      // Equal-value markers alone remain no-ops, but their newer replacement
      // intent must still apply when a subsequent live edit changes that path.
      expect(doc.isModified()).toBe(false);
      await adapter.modify(doc._id, { ...adapter.snapshot()[0], meta: { nested: { a: 2 }, unseen: true } });
      doc.meta.nested.a = 3;
      await doc.save();
      expect(adapter.snapshot()[0].meta).toEqual({ nested: { a: 3 } });
    },
  );

  it('consumes successfully captured replacement intent before subsequent live leaf edits', async () => {
    const { doc, adapter, gate } = setup();
    doc.meta = { nested: { a: 2 } };
    const saving = doc.save();
    await gate.entered;
    doc.meta.nested.a = 3;
    gate.release();
    await saving;
    await adapter.modify(doc._id, { ...adapter.snapshot()[0], meta: { nested: { a: 2 }, unseen: true } });
    await doc.save();
    expect(adapter.snapshot()[0].meta).toEqual({ nested: { a: 3 }, unseen: true });
  });

  it.each([false, true])(
    'retains captured and later intent after write failure for retry (isNew=%s)',
    async (isNew) => {
      const { doc, adapter, gate, schema } = setup(isNew);
      const failure = new Error('write failed');
      const errors = vi.fn();
      const successes = vi.fn();
      schema.post('save', { errorHandler: true }, errors);
      schema.post('save', successes);
      if (isNew)
        vi.mocked(adapter.insert)
          .mockReset()
          .mockImplementationOnce(async () => {
            await gate.wait();
            throw failure;
          })
          .mockImplementation(FakePersistenceAdapter.prototype.insert.bind(adapter));
      else
        vi.mocked(adapter.incrementalModify)
          .mockReset()
          .mockImplementationOnce(async () => {
            await gate.wait();
            throw failure;
          })
          .mockImplementation(FakePersistenceAdapter.prototype.incrementalModify.bind(adapter));
      doc.meta = { nested: { a: 2 } };
      const saving = doc.save();
      const rejected = expect(saving).rejects.toBe(failure);
      await gate.entered;
      doc.name = 'later';
      gate.release();
      await rejected;
      expect(doc.isNew).toBe(isNew);
      expect(doc.isModified('meta')).toBe(true);
      expect(errors).toHaveBeenCalledTimes(1);
      expect(successes).not.toHaveBeenCalled();
      if (!isNew) await adapter.modify(doc._id, { ...adapter.snapshot()[0], meta: { nested: { a: 1 }, unseen: true } });
      await doc.save();
      expect(adapter.snapshot()[0].meta).toEqual({ nested: { a: 2 } });
      expect(adapter.snapshot()[0].name).toBe('later');
      expect(doc.isNew).toBe(false);
      expect(doc.isModified()).toBe(false);
      expect(errors).toHaveBeenCalledTimes(1);
      expect(successes).toHaveBeenCalledTimes(1);
      expect(adapter.calls.insert).toHaveLength(isNew ? 1 : 0);
    },
  );

  it.each(['resolve', 'validate', 'pre-save', 'write', 'post-save', 'error-hook'])(
    'rejects overlaps before extra resolution/hooks while awaiting %s',
    async (stage) => {
      const { doc, adapter, schema, runtime, gate: writeGate } = setup();
      const gate = stage === 'write' ? writeGate : barrier();
      if (stage !== 'write') writeGate.release();
      const calls: string[] = [];
      let first = true;
      const failure = new Error('pre-save failure');
      schema.pre('validate', async function () {
        calls.push('validate');
        if (stage === 'validate' && first) await gate.wait();
      });
      schema.post('validate', function () {
        calls.push('validated');
      });
      schema.pre('save', async function () {
        calls.push('save');
        if (stage === 'pre-save' && first) await gate.wait();
        if (stage === 'error-hook' && first) throw failure;
      });
      schema.post('save', async function () {
        calls.push('saved');
        if (stage === 'post-save' && first) await gate.wait();
      });
      schema.post('save', { errorHandler: true }, async function () {
        calls.push('error');
        if (stage === 'error-hook' && first) await gate.wait();
      });
      if (stage === 'resolve')
        runtime.resolveCollection.mockImplementationOnce(async () => {
          await gate.wait();
          return adapter;
        });
      doc.name = 'captured';
      const saving = doc.save();
      const outcome = stage === 'error-hook' ? expect(saving).rejects.toBe(failure) : expect(saving).resolves.toBe(doc);
      await gate.entered;
      const before = [...calls];
      await expect(doc.save()).rejects.toBeInstanceOf(ParallelSaveError);
      await expect(doc.save()).rejects.toMatchObject({ name: 'ParallelSaveError' });
      expect(calls).toEqual(before);
      expect(runtime.resolveCollection).toHaveBeenCalledTimes(1);
      gate.release();
      await outcome;
      first = false;
      expect(calls).toEqual(
        stage === 'error-hook'
          ? ['validate', 'validated', 'save', 'error']
          : ['validate', 'validated', 'save', 'saved'],
      );
      await doc.save();
      expect(runtime.resolveCollection).toHaveBeenCalledTimes(2);
      expect(adapter.snapshot()[0].name).toBe('captured');
    },
  );

  it('guards insertion before any await and avoids duplicate inserts', async () => {
    const { doc, adapter, gate } = setup(true);
    const saving = doc.save();
    await expect(doc.save()).rejects.toBeInstanceOf(ParallelSaveError);
    await gate.entered;
    await expect(doc.save()).rejects.toBeInstanceOf(ParallelSaveError);
    doc.name = 'later';
    gate.release();
    await saving;
    await doc.save();
    expect(adapter.calls.insert).toHaveLength(1);
    expect(adapter.snapshot()[0].name).toBe('later');
  });

  it.each(['resolve', 'validate', 'pre-save', 'error-hook'])(
    'releases the guard after %s failure and handles save errors once',
    async (stage) => {
      const { doc, adapter, runtime, schema, gate } = setup();
      gate.release();
      let failing = true;
      const failure = Object.freeze(new Error(stage));
      const errorHook = vi.fn(async () => {
        if (stage === 'error-hook' && failing) throw failure;
      });
      schema.post('save', { errorHandler: true }, errorHook);
      if (stage === 'resolve') runtime.resolveCollection.mockRejectedValueOnce(failure);
      if (stage === 'validate')
        schema.pre('validate', function () {
          if (failing) throw failure;
        });
      if (stage === 'pre-save' || stage === 'error-hook')
        schema.pre('save', function () {
          if (failing) throw failure;
        });
      doc.name = 'retry';
      await expect(doc.save()).rejects.toBe(failure);
      expect(errorHook).toHaveBeenCalledTimes(1);
      expect(doc.isModified()).toBe(true);
      failing = false;
      await doc.save();
      expect(adapter.snapshot()[0].name).toBe('retry');
      expect(errorHook).toHaveBeenCalledTimes(1);
    },
  );

  it.each([false, true])(
    'retains post-save edits and committed snapshot even when a post hook fails (isNew=%s)',
    async (isNew) => {
      const { doc, adapter, schema, gate } = setup(isNew);
      gate.release();
      const postGate = barrier();
      let first = true;
      const failure = new Error('post failed');
      const errorHook = vi.fn();
      schema.post('save', { errorHandler: true }, errorHook);
      schema.post('save', async function () {
        if (!first) return;
        doc.meta = { nested: { a: 3 } };
        await expect(doc.save()).rejects.toBeInstanceOf(ParallelSaveError);
        await postGate.wait();
        throw failure;
      });
      doc.name = 'committed';
      const saving = doc.save();
      const rejected = expect(saving).rejects.toBe(failure);
      await postGate.entered;
      expect(doc.isNew).toBe(false);
      expect(doc.isModified('name')).toBe(false);
      expect(doc.isModified('meta')).toBe(true);
      postGate.release();
      await rejected;
      expect(errorHook).toHaveBeenCalledTimes(1);
      await adapter.modify(doc._id, { ...adapter.snapshot()[0], meta: { nested: { a: 1 }, unseen: true } });
      first = false;
      await doc.save();
      expect(adapter.snapshot()[0].meta).toEqual({ nested: { a: 3 } });
      expect(adapter.calls.insert).toHaveLength(isNew ? 1 : 0);
    },
  );

  it('captures edits made during validation/pre-save and preserves post-save edits on no-op saves', async () => {
    const { doc, schema, adapter, gate } = setup();
    gate.release();
    const preGate = barrier();
    let first = true;
    schema.pre('validate', async function () {
      if (first) await preGate.wait();
    });
    schema.pre('save', function () {
      if (first) doc.meta = { nested: { a: 2 } };
    });
    schema.post('save', function () {
      if (!first) doc.meta = { nested: { a: 3 } };
    });
    const saving = doc.save();
    await preGate.entered;
    doc.name = 'before-capture';
    preGate.release();
    await saving;
    expect(adapter.snapshot()[0]).toMatchObject({ name: 'before-capture', meta: { nested: { a: 2 } } });
    first = false;
    await doc.save(); // no write, but the post hook adds new replacement intent
    expect(adapter.incrementalModify).toHaveBeenCalledTimes(1);
    await adapter.modify(doc._id, { ...adapter.snapshot()[0], meta: { nested: { a: 2 }, unseen: true } });
    await doc.save();
    expect(adapter.snapshot()[0].meta).toEqual({ nested: { a: 3 } });
  });

  it('keeps later projected replacement intent fail-closed', async () => {
    const { adapter, schema, gate } = setup();
    await adapter.modify('save-1', { _id: 'save-1', name: 'initial', meta: { nested: { a: 1 }, secret: true } });
    const doc = new Document(
      { _id: 'save-1', name: 'initial', meta: { nested: { a: 1 } } },
      schema,
      { collection: adapter },
      { isNew: false, projection: { mode: 'exclude', fields: { 'meta.secret': 0 } } },
    );
    doc.set('name', 'captured');
    const saving = doc.save();
    await gate.entered;
    doc.set('meta', { nested: { a: 2 } });
    gate.release();
    await saving;
    await expect(doc.save()).rejects.toBeInstanceOf(WriteNormalizationError);
    expect(adapter.snapshot()[0].meta).toEqual({ nested: { a: 1 }, secret: true });
    expect(doc.toObject().meta).toEqual({ nested: { a: 2 } });
  });

  it('bounds invalid live edits after capture and permits repair and retry', async () => {
    const { doc, adapter, gate } = setup();
    doc.name = 'captured';
    const saving = doc.save();
    await gate.entered;
    (doc.meta as any).cycle = doc.meta;
    gate.release();
    await saving;
    await expect(doc.save()).rejects.toBeInstanceOf(WriteNormalizationError);
    delete (doc.meta as any).cycle;
    doc.name = 'repaired';
    await doc.save();
    expect(adapter.snapshot()[0].name).toBe('repaired');
  });

  it('still validates the actual candidate and preserves intent on candidate failure', async () => {
    const { doc, adapter, gate } = setup(
      false,
      new Schema<any>({
        name: {
          type: String,
          validate: function (this: any) {
            return this.meta.nested.a < 5;
          },
        },
        meta: Object,
        tags: [String],
      }),
    );
    doc.name = 'captured';
    const saving = doc.save();
    const rejected = expect(saving).rejects.toBeInstanceOf(ValidationError);
    await gate.entered;
    doc.meta = { nested: { a: 2 } };
    await adapter.modify(doc._id, { ...adapter.snapshot()[0], meta: { nested: { a: 10 }, unseen: true } });
    gate.release();
    await rejected;
    await doc.save();
    expect(adapter.snapshot()[0].meta).toEqual({ nested: { a: 2 } });
  });

  it.each([true, false])(
    'preserves in-flight replacement intent on real memory storage (validation=%s)',
    async (validateBeforeSave) => {
      const conn = new Connection();
      const gate = barrier();
      await conn.connect(() => createMemoryDatabase({ name: `rmrx04_${Date.now()}_${validateBeforeSave}` }));
      try {
        const schema = new Schema<{ name: string; meta: { a: number; unseen?: boolean } }>(
          { name: String, meta: Object },
          { validateBeforeSave },
        );
        const M = conn.model('SaveIntent', schema);
        const doc = await M.create({ name: 'initial', meta: { a: 1 } });
        const adapter = M.collection!;
        const modify = adapter.incrementalModify.bind(adapter);
        vi.spyOn(adapter, 'incrementalModify').mockImplementationOnce(async (id, updater) => {
          await gate.wait();
          return modify(id, updater);
        });
        doc.name = 'captured';
        const saving = doc.save();
        await gate.entered;
        await expect(doc.save()).rejects.toBeInstanceOf(ParallelSaveError);
        doc.meta = { a: 2 };
        await M.updateOne({ _id: doc._id }, { $set: { meta: { a: 1, unseen: true } } });
        gate.release();
        await saving;
        expect((await M.findById(doc._id))!.meta).toEqual({ a: 1, unseen: true });
        await doc.save();
        expect((await M.findById(doc._id))!.meta).toEqual({ a: 2 });
      } finally {
        gate.release();
        await conn.disconnect();
      }
    },
  );
});
