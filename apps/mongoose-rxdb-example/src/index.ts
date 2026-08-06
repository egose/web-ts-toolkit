import { Schema, Connection, sanitizeFilter } from '@web-ts-toolkit/mongoose-rxdb';
import type { Document, FilterQuery, Model } from '@web-ts-toolkit/mongoose-rxdb';
import { createMemoryDatabase, createSqliteDatabase } from '@web-ts-toolkit/mongoose-rxdb/storage';

interface UserDoc {
  _id?: string;
  name: string;
  age: number;
  email?: string;
  role: 'admin' | 'user';
  tags: string[];
}

type UserDocument = Document<UserDoc> &
  UserDoc & {
    isAdmin: boolean;
    addTag(tag: string): string[];
  };

type UserModel = Model<UserDoc> & {
  adults(): Promise<UserDocument[]>;
  create(docs: Partial<UserDoc>): Promise<UserDocument>;
  create(docs: Partial<UserDoc>[]): Promise<UserDocument[]>;
  find(filter?: FilterQuery<UserDoc>): {
    where(field: string): ReturnType<Model<UserDoc>['find']>;
    exec(): Promise<UserDocument[]>;
    sort(spec: Record<string, 1 | -1 | 'asc' | 'desc'>): ReturnType<Model<UserDoc>['find']>;
  };
  findOne(filter?: FilterQuery<UserDoc>): {
    exec(): Promise<UserDocument | null>;
  };
  findById(id: string): Promise<UserDocument | null>;
};

async function main() {
  // 1) Connection with pluggable storage. Two modes:
  //    - MRXDB_STORAGE=memory (default): in-process memory storage, no file on disk.
  //    - MRXDB_STORAGE=sqlite: local SQLite at ./app.db. With no `rxdb-premium` install,
  //      the package auto-falls back to RxDB's free *trial* SQLite driven by Node 22+'s
  //      built-in `node:sqlite` (writes a real file under ./app.db_trial_demo*). For
  //      production-grade SQLite, install `rxdb-premium` per the package README.
  const storageMode = (process.env.MRXDB_STORAGE ?? 'memory').toLowerCase();
  const conn = new Connection();
  const storageFactory =
    storageMode === 'sqlite'
      ? () => createSqliteDatabase({ name: 'demo', filePath: './app.db' })
      : () => createMemoryDatabase({ name: 'demo' });
  console.log(`[demo] storage mode: ${storageMode}`);
  await conn.connect(storageFactory);

  // 2) Schema definition reads like Mongoose.
  const userSchema = new Schema<UserDoc>(
    {
      name: { type: String, required: true },
      age: { type: Number, default: 0, min: 0, max: 150 },
      email: { type: String, match: /@/ },
      role: { type: String, enum: ['admin', 'user'], default: 'user' },
      tags: [String],
    },
    { _id: true },
  );

  // 3) Middleware: a pre-save hook that observes the document being persisted.
  userSchema.pre('save', function (this: UserDocument, next: (err?: Error) => void) {
    console.log(`  [pre-save] saving "${this.name}" (age=${this.age}, role=${this.role})`);
    next();
  });

  userSchema.post('save', function (this: UserDocument) {
    console.log(`  [post-save] saved "${this.name}"`);
  });

  // 4) Virtuals: computed properties that never touch the storage.
  userSchema.virtual('isAdmin').get(function (this: UserDocument) {
    return this.role === 'admin';
  });

  // 5) An instance method available on every hydrated document.
  userSchema.method('addTag', function (this: UserDocument, tag: string) {
    if (!this.tags.includes(tag)) this.tags.push(tag);
    return this.tags.slice();
  });

  // 6) A static method available on the compiled model.
  userSchema.static('adults', function (this: UserModel) {
    return this.find().where('age').gte(18).exec() as Promise<UserDocument[]>;
  });

  const User = conn.model<UserDoc>('User', userSchema, 'users') as UserModel;

  console.log('\n== create ==');
  const ada = await User.create({
    name: 'Ada Lovelace',
    age: 36,
    email: 'ada@example.com',
    role: 'admin',
    tags: ['math'],
  });
  console.log('ada._id        =', ada._id);
  console.log('ada.isAdmin    =', ada.isAdmin); // virtual
  console.log('ada.tags       =', ada.addTag('history')); // instance method (mutates + returns)
  await ada.save(); // persists the new tag

  const grace = await User.create({ name: 'Grace Hopper', age: 85, role: 'user', tags: ['compilers'] });
  const kid = await User.create({ name: 'Young Learner', age: 12, role: 'user', tags: [] });
  void grace;
  void kid;

  console.log('\n== find: chainable query builder ==');
  const adults = await User.find().where('age').gte(18).sort({ age: -1 }).exec();
  console.log('adults (name, age):');
  for (const u of adults) console.log(`  ${u.name.padEnd(18)} ${u.age}`);

  console.log('\n== find: mango-style filter (await thenable) ==');
  const admins = (await User.findOne({ role: 'admin' }).exec())!;
  console.log('findOne admin =', admins.name);

  console.log('\n== static method on Model ==');
  const viaStatic = await User.adults();
  console.log('User.adults() count =', viaStatic.length);

  console.log('\n== dirty-tracking save ==');
  const loaded = ((await User.findById(grace._id!)) as UserDocument | null)!;
  console.log('loaded.isNew =', loaded.isNew, ' isModified(age) =', loaded.isModified('age'));
  loaded.age = 86;
  console.log('after mutate isModified(age) =', loaded.isModified('age'), ' modifiedPaths =', loaded.modifiedPaths());
  await loaded.save();
  console.log('after save isModified(age) =', loaded.isModified('age'));

  console.log('\n== updateOne / countDocuments ==');
  const updated = await User.updateOne({ name: 'Grace Hopper' }, { $inc: { age: 1 } }).exec();
  console.log('updateOne matched/modified =', updated.matchedCount, '/', updated.modifiedCount);
  const count = await User.countDocuments({ age: { $gte: 18 } }).exec();
  console.log('countDocuments(age>=18) =', count);

  console.log('\n== explicit _id (allowed at create) & immutability ==');
  const custom = await User.create({ _id: 'custom-id-42', name: 'Custom', age: 30, role: 'user', tags: [] });
  console.log('custom._id =', custom._id);
  // custom._id = 'other' would be a no-op: _id is read-only after construction (RxDB PK rule).

  console.log('\n== sanitizeFilter (security) ==');
  // Simulate a filter coming from request body. An attacker tries a `$where`-style injection
  // as an extra top-level field. sanitizeFilter wraps nested operator-like objects as literal
  // `$eq` values so they cannot be interpreted as Mongo operators.
  const userFilter = { name: 'Ada Lovelace', role: { $where: 'this.age > 0' } } as FilterQuery<UserDoc>;
  const safe = sanitizeFilter(userFilter);
  console.log('raw filter  =', JSON.stringify(userFilter));
  console.log('sanitized   =', JSON.stringify(safe));
  const found = (await User.findOne({ name: 'Ada Lovelace' }).exec())!;
  console.log('findOne(name=Ada) =', found.name);
  const none = await User.findOne(safe).exec();
  console.log('findOne(sanitized-with role.$where) = ', none ? none.name : '<null as expected>');
  // Without sanitization, the `$where` object could be misinterpreted as an operator map.

  console.log('\n== deleteMany / cleanup ==');
  await User.deleteMany({}).exec();
  console.log('remaining users =', await User.countDocuments({}).exec());

  await conn.disconnect();
  console.log('\ndone.');
  if (storageMode === 'sqlite') {
    try {
      const { existsSync, readdirSync, statSync } = await import('node:fs');
      const cwd = process.cwd();
      const files = existsSync('.') ? readdirSync(cwd).filter((f) => f.startsWith('app.db')) : [];
      const total = files.reduce((sum, f) => sum + statSync(`${cwd}/${f}`).size, 0);
      console.log(`[demo] SQLite files written under ${cwd}:`, files, `${total} bytes total`);
    } catch (e) {
      console.warn('[demo] could not stat SQLite files:', (e as Error).message);
    }
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
