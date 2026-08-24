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

void [api.default.Schema, UserModel, storage.default, storage.createMemoryDatabase, storage.SqliteStorageError];
void [sqliteDbPromise, typedModelProbe];
