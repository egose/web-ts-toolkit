/* eslint-disable @typescript-eslint/no-require-imports */
import api = require('@web-ts-toolkit/mongoose-rxdb');
import storage = require('@web-ts-toolkit/mongoose-rxdb/storage');

interface User {
  name: string;
  age: number;
  tags: string[];
}

interface UserMethods {
  addTag(tag: string): string[];
}

interface UserVirtuals {
  isAdult: boolean;
}

type UserModel = api.Model<User, UserMethods, {}, UserVirtuals>;

const schema = new api.Schema<User, UserMethods, {}, UserVirtuals>({ name: String, age: Number, tags: [String] });
schema.method('addTag', function (tag) {
  this.tags.push(tag);
  return this.tags;
});
schema.virtual('isAdult').get(function () {
  return this.age >= 18;
});
const conn = new api.Connection();
const UserModel: UserModel = conn.model('BundlerCjsUser', schema);
const sqliteOptions: storage.CreateSqliteDatabaseOptions = { filePath: './app.db' };
const sqliteDbPromise: Promise<storage.SqliteDatabase> = storage.createSqliteDatabase(sqliteOptions);
// @ts-expect-error Connection strings are intentionally unsupported; pass an async RxDB factory.
void conn.connect('mongodb://example.invalid');

async function typedModelProbe() {
  const created = await UserModel.create({ name: 'Ada', age: 36, tags: [] });
  const one = await UserModel.findOne({ name: { $regex: /^A/ } });
  const deleted = await UserModel.deleteOne({ age: { $gte: 18 } });
  created.addTag('history');
  // @ts-expect-error invalid field name.
  UserModel.findOne({ nage: 'Ada' });
  // @ts-expect-error invalid filter operator for array field.
  UserModel.find({ tags: { $gte: 'x' } });
  // @ts-expect-error _id cannot be set through updates.
  UserModel.updateOne({ name: 'Ada' }, { _id: 'other' });
  return [one, deleted];
}

async function leanContractProbe() {
  // BMRX-24: lean toggling, preserved counts, option-based lean, error narrowing.
  const leanMany = await UserModel.find({ age: { $gte: 18 } }).lean(true);
  const leanEl: api.LeanResult<User> = leanMany[0];
  // @ts-expect-error lean results are plain records.
  leanEl.save();
  const restored = await UserModel.find({ age: { $gte: 18 } }).lean(true).lean(false);
  const hydratedEl: api.HydratedDocument<User, UserMethods, UserVirtuals> = restored[0];
  hydratedEl.save();
  const upd: api.UpdateResult = await UserModel.updateOne({ name: 'Ada' }, { $inc: { age: 1 } }).lean(true);
  const optLean: api.LeanResult<User> | null = await UserModel.findOneAndUpdate(
    { name: 'Ada' },
    { $inc: { age: 1 } },
    { lean: true },
  );
  // @ts-expect-error option-lean results are plain records.
  optLean?.save();
  try {
    await UserModel.updateOne({ name: 'Ada' }, { $inc: { age: 1 } });
  } catch (error) {
    if (error instanceof api.WriteNormalizationError) void error.message;
    else if (error instanceof api.MutationPartialFailureError) void error.matchedCount;
    else if (error instanceof api.BulkWritePartialFailureError) void error.insertedCount;
  }
  return [leanMany, restored, upd, optLean];
}

void [api.default.Schema, UserModel, storage.default, storage.createMemoryDatabase, storage.SqliteStorageError];
void [sqliteDbPromise, typedModelProbe, leanContractProbe];
