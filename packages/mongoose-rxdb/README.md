# `@web-ts-toolkit/mongoose-rxdb`

A Mongoose-like API (`Schema`, `Document`, `Query`, `Model`, `Connection`, pre/post middleware)
backed by **RxDB** so your data lives in local SQLite (or any RxDB storage).
It is a drop-in-shaped proxy: code that reads like Mongoose persists offline.

## Installation

```sh
pnpm add @web-ts-toolkit/mongoose-rxdb
pnpm add rxdb rxjs
# Optional. For production-grade local SQLite storage:
pnpm add rxdb-premium
```

> No `sqlite3` install is required on Node 22+: the built-in `node:sqlite` module is
> auto-detected and used by the free trial SQLite storage (subject to its limits).
> For older Node / non-Node runtimes, install npm `sqlite3` and it will be picked up.

## Highlights

- `Schema` with type casting, defaults, `required`, `enum`, `min`, `max`, `match`, custom `validate`.
- `Document` with dirty-path tracking (`isModified`, `modifiedPaths`), virtuals, instance methods, `save()`/`remove()`.
- `kareem`-style `pre`/`post` middleware engine for `save`, `validate`, `remove`, `updateOne`, `find`, etc.
- Thenable chainable `Query` builder (`.where().gt().limit().sort()`) that compiles to RxDB Mango queries.
- `Model` with `find`, `findOne`, `findById`, `create`, `insertMany`, `updateOne`/`updateMany`, `deleteOne`/`deleteMany`, `findOneAndUpdate`, `findOneAndDelete`, `countDocuments`, plus `statics`.
- `Connection` over an RxDB database. Storage is pluggable; `@web-ts-toolkit/mongoose-rxdb/storage` ships `createMemoryDatabase` and `createSqliteDatabase`.

## Quick Start

```ts
import { Schema, Connection } from '@web-ts-toolkit/mongoose-rxdb';
import { createSqliteDatabase } from '@web-ts-toolkit/mongoose-rxdb/storage';

const conn = new Connection();
await conn.connect(() => createSqliteDatabase({ filePath: './app.db' }));

const userSchema = new Schema(
  {
    name: { type: String, required: true },
    age: { type: Number, default: 0, min: 0, max: 150 },
    role: { type: String, enum: ['admin', 'user'], default: 'user' },
    tags: [String],
  },
  { timestamps: true },
);

userSchema.pre('save', function (next) {
  console.log('about to save', this.name);
  next();
});

userSchema.virtual('isAdmin').get(function () {
  return this.role === 'admin';
});

const User = conn.model('User', userSchema);

const ada = await User.create({ name: 'Ada', age: 36, role: 'admin' });
console.log(ada.isAdmin); // true

const admins = await User.find().where('role').equals('admin').sort({ age: 1 }).exec();
await User.updateOne({ name: 'Ada' }, { $inc: { age: 1 } });
await User.deleteOne({ name: 'Ada' });
await conn.disconnect();
```

## Storage

The package is storage-agnostic. `@web-ts-toolkit/mongoose-rxdb/storage` exports:

- `createMemoryDatabase(opts?)` — in-process memory storage (great for tests).
- `createSqliteDatabase(opts?)` — local SQLite. Resolution order is automatic:
  1. `rxdb-premium`'s `getRxStorageSqlite` (production-grade; needs a license token at install).
  2. RxDB's free **trial** `getRxStorageSQLiteTrial` driven by Node 22+'s built-in `node:sqlite` — writes a real file at `opts.filePath`, prints a warning each load, capped at ~500 docs/collection, no indexes.
  3. Same trial but with npm `sqlite3` (older Node / non-Node runtimes), if installed.
  4. In-memory `getRxStorageMemory` as a last resort (logged to stderr) so consumer code never crashes when no SQLite backend is available.

  On success a one-line `[mongoose-rxdb] createSqliteDatabase: using <backend> SQLite at <path>` warning is printed (with the trial caveat for level 2 and 3). For real production SQLite, install `rxdb-premium`.

Pass any RxDB database factory to `Connection#connect(factory)`.

## Security: `sanitizeFilter`

Filters built from user input can leak Mango operators (`$where`, `$func`, ...). Use
`sanitizeFilter` to wrap nested non-whitelisted operator objects in `{ $eq: <value> }`:

```ts
import { sanitizeFilter } from '@web-ts-toolkit/mongoose-rxdb';

const safe = sanitizeFilter(req.body.filter);
await User.find(safe);
```

Only `$and` / `$or` / `$nor` (recursed) and the Mango per-field operators
(`$eq`, `$gt`, `$gte`, `$lt`, `$lte`, `$ne`, `$in`, `$nin`, `$exists`, `$regex`, `$options`) pass
through; every other `$`-prefixed key is treated as an injection attempt and wrapped.

## `_id`

Each document auto-generates a `_id` (UUID when `globalThis.crypto.randomUUID` is available,
otherwise a short random+timestamp string). You may pass an explicit `_id` in the constructor
data or `Model.create(data)`. After construction `_id` is read-only: RxDB primary keys cannot
be changed after insert, so the field has no setter.

## Status

Core MVP surface. Out of scope for now: `populate`, `aggregate`, indexes sync, sessions, discriminators, `bulkWrite`, cursors. These can be layered on as the design doc's pillars are extended.

## Documentation

Full package documentation lives in `website/docs/packages/mongoose-rxdb.md`.
