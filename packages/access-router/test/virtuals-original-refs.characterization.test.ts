/** DPV-00: original references must be captured before Mongoose replaces them. */
import mongoose from 'mongoose';
import { describe, expect, it, vi } from 'vitest';

import { deepIsolateValue, isolateDocForOutput } from '../src/helpers/document';
import { useMongoTestDatabase } from './setup';

useMongoTestDatabase();

let counter = 0;

async function fixture() {
  const tag = ++counter;
  const Target = mongoose.model(`Dpv00Target${tag}`, new mongoose.Schema({ name: String }));
  const Parent = mongoose.model(
    `Dpv00Parent${tag}`,
    new mongoose.Schema({
      label: String,
      scalar: { type: mongoose.Schema.Types.ObjectId, ref: Target.modelName },
      refs: { type: [{ type: mongoose.Schema.Types.ObjectId, ref: Target.modelName }], default: undefined },
    }),
  );
  const [a, b] = await Target.create([{ name: 'a' }, { name: 'b' }]);
  const missing = new mongoose.Types.ObjectId();
  const refs = [a._id, missing, null, a._id, b._id];
  await Parent.create([
    { label: 'first', scalar: missing, refs },
    { label: 'second', scalar: missing, refs },
    { label: 'null', scalar: null, refs: null },
    { label: 'empty', refs: [] },
    { label: 'absent' },
  ]);
  return { Target, Parent, a, b, missing, refs };
}

describe.each([false, true])('DPV-00 original refs (lean=%s)', (lean) => {
  it('query-time populate loses missing scalar/array IDs in the output view', async () => {
    const { Parent, a, b, missing, refs } = await fixture();
    const row = await Parent.findOne({ label: 'first' }).lean(lean).populate(['scalar', 'refs']).orFail();
    const plain = isolateDocForOutput(row);

    expect(plain.scalar).toBeNull();
    expect((plain.refs as Array<{ _id: unknown }>).map((target) => String(target._id))).toEqual([
      String(a._id),
      String(a._id),
      String(b._id),
    ]);
    // Hydrated documents retain Mongoose bookkeeping, but lean rows do not.
    // Neither output shape alone can recover the missing IDs.
    if (row instanceof mongoose.Document) {
      expect(String(row.populated('scalar'))).toBe(String(missing));
      expect(row.populated('refs').map(String)).toEqual(refs.map(String));
    } else {
      expect(row).not.toHaveProperty('populated');
    }
  });

  it('one unpopulated fetch retains exact refs before batched, independently matched population', async () => {
    const { Target, Parent, a, refs } = await fixture();
    const findParents = vi.spyOn(Parent.collection, 'find');
    const findTargets = vi.spyOn(Target.collection, 'find');
    try {
      const rows = await Parent.find().sort({ label: 1 }).lean(lean);
      const originals = rows.map((row) => isolateDocForOutput(row));
      // A detached output copy avoids mutating hydrated persistence documents.
      const outputs = originals.map((row) => deepIsolateValue(row));
      await Parent.populate(outputs, [
        { path: 'scalar', select: 'name', match: { name: 'a' }, options: { lean } },
        { path: 'refs', select: 'name', match: { name: 'a' }, options: { lean } },
      ]);
      const first = outputs.find((row) => row.label === 'first')!;
      expect(first.scalar).toBeNull();
      expect((first.refs as Array<{ _id: unknown }>).map((target) => String(target._id))).toEqual([
        String(a._id),
        String(a._id),
      ]);
      expect(findParents).toHaveBeenCalledTimes(1);
      expect(findTargets).toHaveBeenCalledTimes(2); // one per path, not per parent

      for (const [index, output] of outputs.entries()) {
        const original = originals[index];
        for (const path of ['scalar', 'refs']) {
          if (Object.hasOwn(original, path)) output[path] = deepIsolateValue(original[path]);
          else delete output[path];
        }
        expect(output).toEqual(original);
        expect(isolateDocForOutput(rows[index])).toEqual(original);
      }
      expect((first.refs as unknown[]).map(String)).toEqual(refs.map(String));
      expect(outputs.find((row) => row.label === 'null')).toMatchObject({ scalar: null, refs: null });
      expect(outputs.find((row) => row.label === 'empty')).toHaveProperty('refs', []);
      expect(outputs.find((row) => row.label === 'absent')).not.toHaveProperty('refs');
      expect(outputs.find((row) => row.label === 'absent')).not.toHaveProperty('scalar');
    } finally {
      findParents.mockRestore();
      findTargets.mockRestore();
    }
  });
});
