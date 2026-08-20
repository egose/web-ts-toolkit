---
sidebar_label: Mongoose-RxDB
sidebar_position: 17
---

# `@web-ts-toolkit/mongoose-rxdb`

A Mongoose-shaped API (`Schema`, `Document`, `Query`, `Model`, `Connection`, pre/post middleware)
backed by **RxDB** so your data lives in local SQLite (or any RxDB storage).
It is a read-like-Mongoose, persists-offline proxy: schema definitions, casting, validation, dirty
tracking, virtuals, methods, statics, chainable thenable queries, and `pre`/`post` hooks all run
against an RxDB collection.

## Installation

```bash npm2yarn
npm install @web-ts-toolkit/mongoose-rxdb rxdb rxjs
```

For production-grade local SQLite storage, also install RxDB Premium (licensed; needs an
access token at install time):

```bash npm2yarn
npm install rxdb-premium
```

No `sqlite3` install is required on Node 22+: the built-in `node:sqlite` module is
auto-detected and used by the free **trial** SQLite storage (it writes a real file but
is capped at ~500 docs/collection, has no indexes, and prints a warning each load).
For older Node / non-Node runtimes, install npm `sqlite3` and it will be picked up
instead. For real production SQLite, install `rxdb-premium`.

Peer dependencies:

- `rxdb >= 16`
- `rxjs >= 7`
- `rxdb-premium` (optional — only for the production-grade SQLite storage)
- `sqlite3` (optional — only for the trial SQLite path on runtimes without `node:sqlite`)

## What It Exposes

From the root entrypoint:

- `Schema` — type paths, defaults, `required`/`enum`/`min`/`max`/`match`/`validate`, methods, statics, virtuals, `pre`/`post`, `plugin`, `clone`
- `Document` — change-tracked instances with `isModified`, `modifiedPaths`, `markModified`, `validate`, `save`, `remove`, `toObject`, `toJSON`, `get`/`set`
- `ValidationError` — thrown by `validate()` and `save()` for schema violations
- `Query` — thenable chainable builder (`where`, `equals`, `gt`/`gte`/`lt`/`lte`/`ne`, `in`/`nin`, `exists`, `regex`, `or`/`and`/`nor`, `limit`, `skip`, `sort`, `select`, `lean`, `exec`)
- `Model` — `find`, `findOne`, `findById`, `create`, `insertMany`, `updateOne`, `updateMany`, `deleteOne`, `deleteMany`, `findOneAndUpdate`, `findOneAndDelete`, `countDocuments`, plus schema `statics`
- `Connection` — RxDB-backed connection with `connect`, `model`, `modelNames`, `deleteModel`, `disconnect`
- `defaultConnection`, `connect(...)`, `disconnect(...)`, `model(...)` — convenience accessors over a shared default connection
- `MiddlewareEngine` — kareem-like async pre/post engine
- Converters: `convertToRxJsonSchema`, `castDocumentToSchema`, `castValue`
- Query compiler helpers: `translateFilter`, `applyUpdate`, `compileQuery`
- `RxCollectionAdapter` — thin `RxLikeCollection` over a real `RxCollection`

From the `@web-ts-toolkit/mongoose-rxdb/storage` subpath:

- `createMemoryDatabase(opts?)` — in-process memory storage (tests and quick prototyping)
- `createSqliteDatabase(opts?)` — local SQLite. Resolution order is automatic:
  1. `rxdb-premium`'s `getRxStorageSqlite` (production-grade; needs a license token at install).
  2. RxDB's free **trial** `getRxStorageSQLiteTrial` driven by Node 22+'s built-in `node:sqlite` — writes a real file at `opts.filePath`, prints a warning each load, capped at ~500 docs/collection, no indexes.
  3. Same trial with npm `sqlite3` (older Node / non-Node runtimes), if installed.
  4. In-memory `getRxStorageMemory` as a last resort (logged to stderr) so consumer code never crashes when no SQLite backend is available.

  On success a one-line `[mongoose-rxdb] createSqliteDatabase: using <backend> SQLite at <path>` warning is printed (with the trial caveat for tiers 2 and 3). For real production SQLite, install `rxdb-premium`.

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

## Schema

`Schema` follows the Mongoose shape: `{ field: Type }` or `{ field: { type, ...opts } }`.

```ts
const schema = new Schema({
  name: { type: String, required: true, match: /^[A-Z]/ },
  age: { type: Number, default: 18, min: 0, max: 150 },
  role: { type: String, enum: ['admin', 'user'], default: 'user' },
  tags: [String],
  meta: { type: Object },
});
```

Supported `SchemaTypeOptions`:

- `type` — `String` | `Number` | `Boolean` | `Date` | `Object` | nested `Schema` | `[ItemType]`
- `required` — `boolean`, `[boolean, string]`, or a function
- `default` — a value or a zero-arg function returning a value
- `enum`, `min`, `max`, `match`
- `validate` — a function or `{ validator, message }`
- `get` / `set` — field-level getters/setters
- `immutable`, `index`, `unique`, `alias`, `ref`

Helpers:

```ts
schema.method('fullName', function () {
  return this.name;
});
schema.method({
  greet() {
    return 'hi';
  },
});
schema.static('byName', function (name: string) {
  return this.findOne({ name });
});
schema.virtual('isAdmin').get(function () {
  return this.role === 'admin';
});
schema.pre('save', function (next) {
  /* ... */ next();
});
schema.post('save', function () {
  /* ... */
});
schema.plugin((s) => {
  /* mutate s */
});
schema.clone();
```

## Document

Instances track modifications:

```ts
const doc = new User({ name: 'Grace' });
doc.isModified('name'); // true
doc.name = 'Grace Hopper';
doc.isModified('name'); // true
doc.modifiedPaths(); // ['name']

await doc.save();
doc.isModified('name'); // false

doc.toObject({ virtuals: true });
doc.toJSON();
```

`Document` exposes:

- `isModified(path?)`, `modifiedPaths()`, `markModified(path)`, `clearModified()`
- `validate()`, `save()`, `remove()` / `deleteOne()`
- `toObject(opts?)`, `toJSON()`
- `get(path)`, `set(path, value)` (or `set({ ...values })`)
- schema `methods` bound as instance methods
- schema `virtuals` as getter/setter properties

## Query

`Model.find()` returns a thenable chainable `Query`. Execution is deferred until `.exec()`,
`.then()` (i.e. `await`), `.catch()`, or `.finally()` is called.

```ts
// chainable
await User.find().where('age').gt(18).limit(10).sort({ age: -1 }).exec();

// mango-style filter
await User.find({ role: { $in: ['admin', 'user'] }, age: { $gte: 18 } });

// awaitable
const users = await User.findOne({ name: 'Ada' });

// update / delete
await User.updateOne({ name: 'Ada' }, { $inc: { age: 1 } });
await User.deleteMany({ role: 'user' });
await User.findOneAndUpdate({ name: 'Ada' }, { $set: { age: 37 } }, { new: true });

// count
await User.countDocuments({ age: { $gte: 18 } });
```

Supported query operators: `$gt`, `$gte`, `$lt`, `$lte`, `$ne`, `$in`, `$nin`, `$exists`, `$regex`
(+`$options`), and top-level `$and` / `$or` / `$nor`.

Supported update operators: `$set`, `$unset`, `$inc`, `$mul`, `$min`, `$max`, `$push`, `$pull`,
`$addToSet`, plus a plain `{ field: value }` alias for `$set`.

`QueryOptions`: `sort`, `limit`, `skip`, `projection` (object or space-separated string), `lean`,
`upsert`, `new` (a.k.a. `returnDocument: 'after'`), `runValidators`.

## Middleware

A kareem-like engine runs async `pre` and `post` hooks. Hooks may be callback-style
(`function (next) { ...; next(); }`) or promise-style (`async function () { ... }`).

```ts
schema.pre('save', function (next) {
  if (this.name === 'banned') return next(new Error('not allowed'));
  next();
});

schema.post('save', function () {
  metrics.increment('user.save');
});
```

Hooked operations: `save`, `remove`, `validate`, `updateOne`, `updateMany`, `deleteOne`,
`deleteMany`, `findOne`, `find`, `findOneAndUpdate`, `findOneAndDelete`, `insertMany`, `init`.

## Connection & Storage

`Connection` wraps an RxDB database. Pass any async factory that returns a `Promise<RxDatabase>`:

```ts
import { createMemoryDatabase } from '@web-ts-toolkit/mongoose-rxdb/storage';

const conn = new Connection();
await conn.connect(() => createMemoryDatabase({ name: 'myapp' }));
```

Storage subpath helpers:

- `createMemoryDatabase({ name? })` — fast in-process storage, default for tests
- `createSqliteDatabase({ name?, filePath? })` — local SQLite resolved automatically
  1. `rxdb-premium` (production-grade; needs a license token at install)
  2. RxDB free trial `getRxStorageSQLiteTrial` driven by Node 22+'s built-in `node:sqlite` (writes a real file at `filePath`, but capped at ~500 docs/collection, no indexes, prints a warning each load)
  3. Same trial with npm `sqlite3` (older Node / non-Node runtimes), if installed
  4. In-memory `getRxStorageMemory` as a last resort (logged to stderr) so the call never throws in environments without any SQLite backend

A shared default connection is also available for simple apps:

```ts
import { connect, model, Schema, disconnect } from '@web-ts-toolkit/mongoose-rxdb';
import { createSqliteDatabase } from '@web-ts-toolkit/mongoose-rxdb/storage';

await connect(() => createSqliteDatabase({ filePath: './app.db' }));
const User = model('User', new Schema({ name: String }));
await disconnect();
```

## Security: `sanitizeFilter`

Filters built from user input can leak Mango operators (`$where`, `$func`, ...). Use
`sanitizeFilter` to wrap nested operator objects in `{ $eq: <value> }` before passing them to a
query:

```ts
import { sanitizeFilter } from '@web-ts-toolkit/mongoose-rxdb';

const safe = sanitizeFilter(req.body.filter);
await User.find(safe);
```

Only the logical operators `$and`, `$or`, `$nor` (recursed into) and the Mango per-field operators
(`$eq`, `$gt`, `$gte`, `$lt`, `$lte`, `$ne`, `$in`, `$nin`, `$exists`, `$regex`, `$options`) pass
through unchanged. Any other `$`-prefixed key is treated as an injection attempt and the whole
nested object is wrapped as `{ $eq: <value> }`, so it is matched literally rather than evaluated.

## `_id`

Each document auto-generates a `_id` — a UUIDv4 when `globalThis.crypto.randomUUID` is available,
otherwise a short random+timestamp string. You may pass an explicit `_id` in the constructor data
or `Model.create(data)`. After construction `_id` is read-only (no setter): RxDB primary keys
cannot be changed after insert, so the field is immutable.

## Connection model registration

`Connection#model(name, schema, collection?, options?)` compiles a schema into a Model. Calling it
twice with the same `name` and a new schema throws (matching Mongoose's `OverwriteModelError`)
unless you pass `{ overwrite: true }`. To register a different shape, call
`connection.deleteModel(name)` first, or use `{ overwrite: true }` — note that the underlying RxDB
collection's schema is **not** migrated by an overwrite, so prefer distinct collection names when
the shape changes.

## How It Maps to RxDB

| Mongoose concept          | Implementation in this package                                        |
| ------------------------- | --------------------------------------------------------------------- |
| Schema definition         | `Schema` → `convertToRxJsonSchema` (Draft-07 `RxJsonSchema`)          |
| Casting & validation      | `castDocumentToSchema` + `Document.validate()` (schema-level rules)   |
| Middleware (`pre`/`post`) | `MiddlewareEngine`, mapped onto Model/Query/Document ops              |
| Document methods          | `Schema.methods`, attached to hydrated `Document` instances           |
| Statics                   | `Schema.statics`, attached to the compiled `Model`                    |
| Virtuals                  | `Schema.virtual(...)` getters/setters on `Document`                   |
| Query builder             | `Query` → `compileQuery` → RxDB Mango query via `RxCollectionAdapter` |
| Dirty tracking            | `Document.isModified` / `modifiedPaths`, `$set`-only diffs on `save`  |
| Storage                   | `Connection` + `createSqliteDatabase` / `createMemoryDatabase`        |

## Current Scope

This package is a core MVP proxy. Out of scope for now:

- `populate` (virtual and path population)
- `aggregate` / pipeline cursors
- index declaration sync (`syncIndexes`)
- sessions / transactions
- discriminators
- `bulkWrite` / `bulkSave`
- streaming `QueryCursor`

These can be layered on as the design doc's four pillars (schema, document, middleware, query) are
extended. The internal split is intentionally modular so each missing piece slots in without
reworking the others.

## When To Use It

Use `@web-ts-toolkit/mongoose-rxdb` when you want:

- Mongoose-shaped code (schemas, models, queries, hooks) but persisted locally
- offline-first storage backed by SQLite via RxDB
- a storage-agnostic API that reads like Mongoose and swaps backends via a factory

If you need full Mongoose parity (`populate`, `aggregate`, MongoDB driver), use `mongoose`
directly against MongoDB; this package targets the local/offline subset.
