import api, {
  Connection,
  Document,
  Query,
  Schema,
  type DeleteResult,
  type HydratedDocument,
  type LeanResult,
  ValidationError,
  connect,
  disconnect,
  model,
  sanitizeFilter,
  type Model,
} from '@web-ts-toolkit/mongoose-rxdb';
import storageDefault, {
  SqliteStorageError,
  createMemoryDatabase,
  createSqliteDatabase,
  type CreateSqliteDatabaseOptions,
  type SqliteBackend,
  type SqliteDatabase,
  type SqliteStorageInfo,
} from '@web-ts-toolkit/mongoose-rxdb/storage';

interface User {
  name: string;
  age: number;
  role: 'admin' | 'user';
  tags: string[];
  active: boolean;
  createdAt: Date;
}

interface UserMethods {
  addTag(tag: string): string[];
}

interface UserVirtuals {
  isAdult: boolean;
}

interface UserStatics {
  adults(): Promise<UserDocument[]>;
}

type UserDocument = HydratedDocument<User, UserMethods, UserVirtuals>;
type UserModel = Model<User, UserMethods, UserStatics, UserVirtuals>;

const schema = new Schema<User, UserMethods, UserStatics, UserVirtuals>({
  name: String,
  age: Number,
  role: String,
  tags: [String],
  active: Boolean,
  createdAt: Date,
});
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
const UserModel: UserModel = conn.model('User', schema);
const query: Query<UserDocument[], User> = UserModel.find({ name: 'Ada' });
const doc = new Document<User>({ name: 'Ada', age: 36 }, schema, UserModel);
const filtered = sanitizeFilter<User>({ age: { $gte: 18 } });
const sqliteOptions: CreateSqliteDatabaseOptions = { filePath: './app.db', allowMemoryFallback: true };
const backend: SqliteBackend = 'trial-native';
const storageInfo: SqliteStorageInfo = {
  backend,
  databaseName: 'app',
  filePath: './app.db',
  persistent: true,
  fallbackCauses: [],
};
const sqliteDbPromise: Promise<SqliteDatabase> = createSqliteDatabase(sqliteOptions);
// @ts-expect-error Connection strings are intentionally unsupported; pass an async RxDB factory.
void connect('mongodb://example.invalid');

async function typedModelProbe() {
  const created = await UserModel.create({ name: 'Ada', age: 36, role: 'admin', tags: [], active: true, createdAt: new Date() });
  const createdName: string = created.name;
  const methodResult: string[] = created.addTag('math');
  const virtualResult: boolean = created.isAdult;
  const found = await UserModel.find({ role: { $in: ['admin'] }, name: { $regex: /^A/ } });
  const one = await UserModel.findOne({ active: true });
  const byId = await UserModel.findById(created._id!);
  const leanMany = await UserModel.find({ age: { $gte: 18 } }).lean(true);
  const leanOne = await UserModel.findOne({ name: 'Ada' }).lean(true);
  const leanDoc: LeanResult<User> = leanMany[0];
  const updateResult = await UserModel.updateOne({ name: 'Ada' }, { $inc: { age: 1 }, $push: { tags: 'history' } });
  const deleteResult: DeleteResult = await UserModel.deleteMany({ role: 'user' });
  const adults = await UserModel.adults();
  // @ts-expect-error misspelled fields are rejected on strict FilterQuery.
  UserModel.find({ nae: 'Ada' });
  // @ts-expect-error regex filters are only valid for string-compatible fields.
  UserModel.find({ age: { $regex: /old/ } });
  // @ts-expect-error numeric update operators only accept numeric fields.
  UserModel.updateOne({ name: 'Ada' }, { $inc: { name: 1 } });
  // @ts-expect-error array update operators only accept array fields and array element values.
  UserModel.updateOne({ name: 'Ada' }, { $push: { age: 1 } });
  // @ts-expect-error _id is immutable and not part of the update type surface.
  UserModel.updateOne({ name: 'Ada' }, { $set: { _id: 'other' } });
  // @ts-expect-error lean results are plain records, not hydrated documents.
  leanDoc.save();
  return [createdName, methodResult, virtualResult, found, one, byId, leanMany, leanOne, updateResult, deleteResult, adults];
}

void [api.Schema, ValidationError, connect, disconnect, model, storageDefault, createMemoryDatabase, SqliteStorageError];
void [query, doc, filtered, storageInfo, sqliteDbPromise, typedModelProbe];
