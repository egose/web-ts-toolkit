import api, { Connection, Schema, type HydratedDocument, type Model } from '@web-ts-toolkit/mongoose-rxdb';
import storageDefault, {
  SqliteStorageError,
  createMemoryDatabase,
  createSqliteDatabase,
  type CreateSqliteDatabaseOptions,
  type SqliteDatabase,
} from '@web-ts-toolkit/mongoose-rxdb/storage';

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

type UserDocument = HydratedDocument<User, UserMethods, UserVirtuals>;
type UserModel = Model<User, UserMethods, UserStatics, UserVirtuals>;

const schema = new Schema<User, UserMethods, UserStatics, UserVirtuals>({ name: String, age: Number, tags: [String] });
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
const conn = new Connection();
const UserModel: UserModel = conn.model('BundlerUser', schema);
const sqliteOptions: CreateSqliteDatabaseOptions = { filePath: './app.db' };
const sqliteDbPromise: Promise<SqliteDatabase> = createSqliteDatabase(sqliteOptions);
// @ts-expect-error Connection strings are intentionally unsupported; pass an async RxDB factory.
void conn.connect('mongodb://example.invalid');

async function typedModelProbe() {
  const created = await UserModel.create({ name: 'Ada', age: 36, tags: [] });
  const found = await UserModel.find({ name: { $regex: /A/ }, age: { $gte: 18 } });
  const lean = await UserModel.findOne({ name: 'Ada' }).lean(true);
  const updated = await UserModel.updateMany({ age: { $gte: 18 } }, { $inc: { age: 1 }, $addToSet: { tags: 'math' } });
  const adults = await UserModel.adults();
  created.addTag('history');
  // @ts-expect-error misspelled fields are rejected.
  UserModel.find({ agge: 18 });
  // @ts-expect-error string-only operators are rejected for numbers.
  UserModel.find({ age: { $regex: /18/ } });
  // @ts-expect-error incompatible update value.
  UserModel.updateOne({ name: 'Ada' }, { $set: { age: 'old' } });
  // @ts-expect-error lean records do not expose document methods.
  lean?.save();
  return [found, lean, updated, adults];
}

void [api.Schema, UserModel, storageDefault, createMemoryDatabase, SqliteStorageError, sqliteDbPromise, typedModelProbe];
