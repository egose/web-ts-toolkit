import api, {
  BulkWritePartialFailureError,
  Connection,
  Document,
  MutationPartialFailureError,
  Query,
  QueryFilterError,
  Schema,
  WriteNormalizationError,
  type DeleteResult,
  type HydratedDocument,
  type LeanQueryResult,
  type LeanResult,
  type UpdateResult,
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

async function leanContractProbe() {
  // BMRX-24: lean read toggling preserves document vs plain-record typing.
  const leanMany = await UserModel.find({ age: { $gte: 18 } }).lean(true);
  const leanEl: LeanResult<User> = leanMany[0];
  // @ts-expect-error lean records are plain and expose no hydrated methods.
  leanMany[0].save();
  const restored = await UserModel.find({ age: { $gte: 18 } }).lean(true).lean(false);
  const hydratedEl: UserDocument = restored[0];
  hydratedEl.save();
  const leanOne: LeanResult<User> | null = await UserModel.findOne({ name: 'Ada' }).lean(true);
  const restoredOne: UserDocument | null = await UserModel.findOne({ name: 'Ada' }).lean(true).lean(false);
  void [leanEl, leanOne, restoredOne];
  // BMRX-24: lean mapping preserves mutation/count result types.
  const upd: UpdateResult = await UserModel.updateOne({ name: 'Ada' }, { $inc: { age: 1 } }).lean(true);
  const updMany: UpdateResult = await UserModel.updateMany({ age: { $gte: 18 } }, { $inc: { age: 1 } }).lean(true);
  const del: DeleteResult = await UserModel.deleteOne({ name: 'Ada' }).lean(true);
  const counted: number = await UserModel.countDocuments({ age: { $gte: 18 } }).lean(true);
  const leanMapped: LeanQueryResult<UserDocument[], User> = leanMany;
  void [upd, updMany, del, counted, leanMapped];
  // BMRX-24: option-based lean results with nullability.
  const optLean: LeanResult<User> | null = await UserModel.findOneAndUpdate(
    { name: 'Ada' },
    { $inc: { age: 1 } },
    { lean: true, returnDocument: 'after' },
  );
  // @ts-expect-error option-lean records expose no hydrated methods.
  optLean?.save();
  const optHydrated: UserDocument | null = await UserModel.findOneAndUpdate(
    { name: 'Ada' },
    { $inc: { age: 1 } },
  );
  optHydrated?.save();
  const optDelLean: LeanResult<User> | null = await UserModel.findOneAndDelete({ name: 'Ada' }, { lean: true });
  // @ts-expect-error option-lean delete records expose no hydrated methods.
  optDelLean?.save();
  const optDelHydrated: UserDocument | null = await UserModel.findOneAndDelete({ name: 'Ada' });
  optDelHydrated?.save();
  void [optLean, optHydrated, optDelLean, optDelHydrated];
  // BMRX-24: intentionally public thrown errors narrow from the package root.
  try {
    await UserModel.updateOne({ name: 'Ada' }, { $inc: { age: 1 } });
  } catch (error) {
    if (error instanceof WriteNormalizationError) {
      const name: string = error.name;
      void name;
    } else if (error instanceof MutationPartialFailureError) {
      const matched: number = error.matchedCount;
      void matched;
    } else if (error instanceof BulkWritePartialFailureError) {
      const inserted: number = error.insertedCount;
      void inserted;
    } else if (error instanceof QueryFilterError) {
      const message: string = error.message;
      void message;
    }
  }
}

void [api.Schema, ValidationError, connect, disconnect, model, storageDefault, createMemoryDatabase, SqliteStorageError];
void [query, doc, filtered, storageInfo, sqliteDbPromise, typedModelProbe, leanContractProbe];
void [BulkWritePartialFailureError, MutationPartialFailureError, WriteNormalizationError];
