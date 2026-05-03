import mongoose, { type Model, type Types } from 'mongoose';
import { describe, expect, it } from 'vitest';

import {
  type CascadeDeleteDependencyMap,
  type CascadeDeleteDocumentMethods,
  type CascadeDeleteModelStatics,
  cascadeDeletePlugin,
} from '../dist/index.mjs';
import { useMongoTestDatabase } from './setup';

useMongoTestDatabase();

type Reference = {
  name: string;
};

type Item = {
  name: string;
};

type Price = {
  amount: number;
};

type Note = {
  content: string;
};

type Tag = {
  content: string;
  file: Types.ObjectId;
};

type File = {
  items: Types.ObjectId[];
  name: string;
  notes: Types.ObjectId[];
  prices: Types.ObjectId[];
  refs: Types.ObjectId[];
};

const referenceModelName = 'CascadeDeleteReference';
const itemModelName = 'CascadeDeleteItem';
const priceModelName = 'CascadeDeletePrice';
const noteModelName = 'CascadeDeleteNote';
const tagModelName = 'CascadeDeleteTag';
const fileModelName = 'CascadeDeleteFile';

type FileMethods = CascadeDeleteDocumentMethods<typeof referenceModelName, Reference> &
  CascadeDeleteDocumentMethods<typeof priceModelName, Price> &
  CascadeDeleteDocumentMethods<typeof noteModelName, Note> &
  CascadeDeleteDocumentMethods<typeof tagModelName, Tag>;

type FileModel = Model<File, Record<string, never>, FileMethods> &
  CascadeDeleteModelStatics<typeof referenceModelName, Reference> &
  CascadeDeleteModelStatics<typeof priceModelName, Price> &
  CascadeDeleteModelStatics<typeof noteModelName, Note> &
  CascadeDeleteModelStatics<typeof tagModelName, Tag>;

type FileDependents = CascadeDeleteDependencyMap<typeof referenceModelName, Reference> &
  CascadeDeleteDependencyMap<typeof priceModelName, Price> &
  CascadeDeleteDependencyMap<typeof noteModelName, Note> &
  CascadeDeleteDependencyMap<typeof tagModelName, Tag>;

const Reference = mongoose.model<Reference>(
  referenceModelName,
  new mongoose.Schema({
    name: { type: String, required: true },
  }),
);

const Item = mongoose.model<Item>(
  itemModelName,
  new mongoose.Schema({
    name: { type: String, required: true },
  }),
);

const Price = mongoose.model<Price>(
  priceModelName,
  new mongoose.Schema({
    amount: { type: Number, required: true },
  }),
);

const Note = mongoose.model<Note>(
  noteModelName,
  new mongoose.Schema({
    content: { type: String, required: true },
  }),
);

const fileSchema = new mongoose.Schema<File, FileModel, FileMethods>({
  name: { type: String, required: true },
  refs: [{ type: mongoose.Schema.Types.ObjectId, ref: referenceModelName, default: [] }],
  items: [{ type: mongoose.Schema.Types.ObjectId, ref: itemModelName, default: [] }],
  prices: [{ type: mongoose.Schema.Types.ObjectId, ref: priceModelName, default: [] }],
  notes: [{ type: mongoose.Schema.Types.ObjectId, ref: noteModelName, default: [] }],
});

fileSchema.plugin(cascadeDeletePlugin, {
  model: referenceModelName,
  localField: 'refs',
  foreignField: '_id',
});

fileSchema.plugin(cascadeDeletePlugin, {
  model: priceModelName,
  localField: 'prices',
  foreignField: '_id',
  extraForeignFilter: {
    amount: { $lt: 100 },
  },
});

fileSchema.plugin(cascadeDeletePlugin, {
  model: noteModelName,
  foreignFilter: {
    content: { $eq: 'to-delete' },
  },
});

fileSchema.plugin(cascadeDeletePlugin, {
  model: tagModelName,
  localField: '_id',
  foreignField: 'file',
  extraForeignFilter: {
    content: { $eq: 'to-delete' },
  },
});

const File = mongoose.model<File, FileModel>(fileModelName, fileSchema);

const Tag = mongoose.model<Tag>(
  tagModelName,
  new mongoose.Schema({
    file: { type: mongoose.Schema.Types.ObjectId, ref: fileModelName, required: true },
    content: { type: String, required: true },
  }),
);

describe('cascadeDeletePlugin', () => {
  it('deletes configured dependent documents when a file is deleted', async () => {
    const refs = await Reference.create([{ name: 'ref-1' }, { name: 'ref-2' }]);
    const items = await Item.create([{ name: 'item-1' }, { name: 'item-2' }]);
    const file = await File.create({
      name: 'file-1',
      refs,
      items,
    });

    await Tag.create([
      { file: file._id, content: 'to-delete' },
      { file: file._id, content: 'to-delete' },
    ]);

    await file.deleteOne();

    expect(await Reference.countDocuments()).toBe(0);
    expect(await Item.countDocuments()).toBe(2);
    expect(await Tag.countDocuments()).toBe(0);
  });

  it('applies extra foreign filters during cascade deletes', async () => {
    const prices = await Price.create([
      { amount: 10 },
      { amount: 20 },
      { amount: 50 },
      { amount: 100 },
      { amount: 200 },
    ]);

    const file = await File.create({
      name: 'file-2',
      prices,
    });

    await file.deleteOne();

    const remainingPrices = await Price.find().sort({ amount: 1 }).lean();

    expect(remainingPrices.map((price) => price.amount)).toEqual([100, 200]);
  });

  it('applies foreign filters during cascade deletes', async () => {
    await Note.create([
      { content: 'not-to-delete' },
      { content: 'not-to-delete' },
      { content: 'not-to-delete' },
      { content: 'to-delete' },
      { content: 'to-delete' },
      { content: 'to-delete' },
    ]);

    const file = await File.create({
      name: 'file-3',
      notes: [],
    });

    await file.deleteOne();

    expect(await Note.countDocuments()).toBe(3);
    expect(await Note.countDocuments({ content: 'not-to-delete' })).toBe(3);
  });

  it('aggregates dependents for all configured models', async () => {
    const refs = await Reference.create([{ name: 'ref-1' }, { name: 'ref-2' }]);
    const prices = await Price.create([{ amount: 10 }, { amount: 20 }, { amount: 50 }, { amount: 100 }]);
    const notes = await Note.create([{ content: 'not-to-delete' }, { content: 'to-delete' }, { content: 'to-delete' }]);

    const file = await File.create({
      name: 'file-4',
      refs,
      prices,
      notes,
    });

    await Tag.create([
      { file: file._id, content: 'to-delete' },
      { file: file._id, content: 'to-delete' },
      { file: file._id, content: 'keep' },
    ]);

    const dependents = (await file.findDependents()) as FileDependents;

    expect(dependents[referenceModelName]).toHaveLength(2);
    expect(dependents[priceModelName]).toHaveLength(3);
    expect(dependents[noteModelName]).toHaveLength(2);
    expect(dependents[tagModelName]).toHaveLength(2);
  });

  it('returns dependents for a single model', async () => {
    const notes = await Note.create([
      { content: 'not-to-delete' },
      { content: 'to-delete' },
      { content: 'to-delete' },
      { content: 'to-delete' },
    ]);

    const file = await File.create({
      name: 'file-5',
      notes,
    });

    const dependents = await file.findDependents(noteModelName);

    expect(dependents).toHaveLength(3);
  });

  it('finds orphaned dependents for all configured models', async () => {
    const orphanFileId = new mongoose.Types.ObjectId();

    await Tag.create([
      { file: orphanFileId, content: 'to-delete' },
      { file: orphanFileId, content: 'to-delete' },
      { file: orphanFileId, content: 'keep' },
    ]);

    const orphans = (await File.findOrphans()) as FileDependents;

    expect(orphans[tagModelName]).toHaveLength(2);
  });

  it('finds orphaned dependents for a single model', async () => {
    const orphanFileId = new mongoose.Types.ObjectId();

    await Tag.create([
      { file: orphanFileId, content: 'not-to-delete' },
      { file: orphanFileId, content: 'to-delete' },
      { file: orphanFileId, content: 'to-delete' },
    ]);

    const orphans = await File.findOrphans(tagModelName);

    expect(orphans).toHaveLength(2);
  });
});
