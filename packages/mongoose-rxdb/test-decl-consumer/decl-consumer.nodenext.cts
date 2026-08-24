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

interface UserStatics {
  adults(): Promise<UserDocument[]>;
}

interface UserVirtuals {
  isAdult: boolean;
}

type UserDocument = api.HydratedDocument<User, UserMethods, UserVirtuals>;
type UserModel = api.Model<User, UserMethods, UserStatics, UserVirtuals>;

const schema = new api.Schema<User, UserMethods, UserStatics, UserVirtuals>({ name: String, age: Number, tags: [String] });
schema.method('addTag', function (tag) {
  this.tags.push(tag);
  return this.tags;
});
schema.virtual('isAdult').get(function () {
  return this.age >= 18;
});
schema.static('adults', function (this: UserModel) {
  return this.find({ age: { $gte: 18 } });
});
const conn = new api.Connection();
const UserModel: UserModel = conn.model('UserCjs', schema);
const query = UserModel.find({ name: 'Ada' });
const doc = new api.Document<User>({ name: 'Ada', age: 36 }, schema, UserModel);
const sqliteOptions: storage.CreateSqliteDatabaseOptions = { filePath: './app.db', allowMemoryFallback: true };
const sqliteDbPromise: Promise<storage.SqliteDatabase> = storage.createSqliteDatabase(sqliteOptions);
// @ts-expect-error Connection strings are intentionally unsupported; pass an async RxDB factory.
void api.connect('mongodb://example.invalid');

async function typedModelProbe() {
  const created = await UserModel.create({ name: 'Ada', age: 36, tags: [] });
  const users = await UserModel.find({ age: { $gte: 18 } });
  const lean = await UserModel.find({ name: 'Ada' }).lean(true);
  const update: api.UpdateResult = await UserModel.updateOne({ name: 'Ada' }, { $inc: { age: 1 } });
  created.addTag('history');
  // @ts-expect-error misspelled fields are rejected.
  UserModel.find({ naem: 'Ada' });
  // @ts-expect-error incompatible update values are rejected.
  UserModel.updateOne({ name: 'Ada' }, { $inc: { name: 1 } });
  // @ts-expect-error lean results are plain records.
  lean[0].save();
  return [users, lean, update];
}

void [api.default.Schema, api.ValidationError, api.connect, api.disconnect, api.model];
void [storage.default, storage.createMemoryDatabase, storage.SqliteStorageError];
void [query, doc, sqliteDbPromise, typedModelProbe];
