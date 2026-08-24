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

If `node:sqlite` is unavailable in your Node runtime and you want the RxDB trial SQLite backend,
install npm `sqlite3` as an optional fallback:

```bash npm2yarn
npm install sqlite3
```

No `sqlite3` install is required on Node 22+: the built-in `node:sqlite` module is
auto-detected and used by the free **trial** SQLite storage (it writes a real file but
is capped at ~500 docs/collection, has no indexes, and prints a warning each load).
This package supports Node 22+. `sqlite3` is only a Node fallback for runtimes where
`node:sqlite` cannot be opened; non-Node runtimes must provide their own RxDB factory.
For real production SQLite, install `rxdb-premium`.

Peer dependencies:

- `rxdb >=17.4.0 <18` (required)
- `rxjs >=7.8.0 <8` (required)
- `rxdb-premium >=17.4.0 <18` (optional — only for the production-grade SQLite storage)
- `sqlite3 >=5 <6` (optional — only for the trial SQLite path in Node runtimes without `node:sqlite`)

## Imports And Module Identity

Use named imports as the canonical style:

```ts
import { Connection, Schema } from '@web-ts-toolkit/mongoose-rxdb';
import { createMemoryDatabase } from '@web-ts-toolkit/mongoose-rxdb/storage';
```

Default exports are retained only as redundant compatibility conveniences. Prefer named imports in new
code because they make the public API clearer to TypeScript, editors, and bundlers.

The package publishes separate ESM and CommonJS builds. If one process loads both formats, each format
has its own `Schema`/`Connection` class identity and its own `defaultConnection`; there is no supported
cross-format singleton. Pick one module format per application graph, and pass explicit `Connection`
instances across boundaries when integration code might mix ESM and CommonJS.

## Compatibility Matrix

| Runtime  | RxDB           | RxJS         | Evidence                                                                                                                                                                                                |
| -------- | -------------- | ------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Node 22+ | `>=17.4.0 <18` | `>=7.8.0 <8` | Package tests, strict NodeNext/Bundler declaration consumers, packed pnpm/npm runtime imports, and packed README quickstart run against the workspace dev dependencies (`rxdb ^17.4.0`, `rxjs ^7.8.2`). |

Future RxDB or RxJS majors are intentionally outside the peer range until they have the same package,
declaration, and packed-consumer coverage.

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
- `createSqliteDatabase(opts?)` — local SQLite. Resolution order is automatic, but a
  requested SQLite database fails closed when no backend can be opened:
  1. `rxdb-premium`'s `getRxStorageSqlite` (production-grade; needs a license token at install).
  2. RxDB's free **trial** `getRxStorageSQLiteTrial` driven by Node 22+'s built-in `node:sqlite` — persists to files derived from `opts.filePath`, prints a warning each load, capped at ~500 docs/collection, no indexes.
  3. Same trial with npm `sqlite3` in Node, if installed.
  4. In-memory `getRxStorageMemory` only when you pass `allowMemoryFallback: true`.

  This is a breaking safety change from older releases: `createSqliteDatabase({ filePath })`
  no longer silently creates volatile memory storage when SQLite is unavailable. It rejects with
  `SqliteStorageError`, whose `causes` array preserves backend-specific load/open failures.
  `filePath` is exact for Premium (`sqliteDatabasePath`) and a `databaseNamePrefix` for trial
  backends. The returned database exposes `sqliteBackend` and `sqliteStorageInfo`.

  On success a one-line `[mongoose-rxdb] createSqliteDatabase: using <backend> SQLite at <path>` warning is printed (with the trial caveat for tiers 2 and 3). For real production SQLite, install `rxdb-premium`.

## Quick Start

```ts
import { Connection, Schema, type HookNext, type HydratedDocument } from '@web-ts-toolkit/mongoose-rxdb';
import { createMemoryDatabase } from '@web-ts-toolkit/mongoose-rxdb/storage';

interface User {
  name: string;
  age: number;
  role: 'admin' | 'user';
  tags: string[];
}

interface UserMethods {
  addTag(tag: string): string[];
}

interface UserVirtuals {
  isAdmin: boolean;
}

type UserDocument = HydratedDocument<User, UserMethods, UserVirtuals>;

const conn = new Connection();
await conn.connect(() => createMemoryDatabase({ name: 'quickstart' }));

const userSchema = new Schema<User, UserMethods, {}, UserVirtuals>({
  name: { type: String, required: true },
  age: { type: Number, default: 0, min: 0, max: 150 },
  role: { type: String, enum: ['admin', 'user'], default: 'user' },
  tags: [String],
});

userSchema.pre('save', function (this: UserDocument, next: HookNext) {
  console.log('about to save', this.name);
  next();
});

userSchema.virtual('isAdmin').get(function (this: UserDocument) {
  return this.role === 'admin';
});

userSchema.method('addTag', function (this: UserDocument, tag: string) {
  this.tags.push(tag);
  return this.tags;
});

const User = conn.model('User', userSchema);

const ada = await User.create({ name: 'Ada', age: 36, role: 'admin', tags: [] });
console.log(ada.isAdmin); // true
ada.addTag('math');

const admins = await User.find({ role: 'admin' }).sort({ age: 1 });
await User.updateOne({ name: 'Ada' }, { $inc: { age: 1 } });
await User.deleteOne({ name: 'Ada' });
console.log(admins.map((user) => user.name));

await conn.disconnect();
```

For durable local storage, replace the memory factory with `createSqliteDatabase({ filePath: './app.db' })`.
That request fails closed unless Premium, Node 22 `node:sqlite`, or npm `sqlite3` can be opened; pass
`allowMemoryFallback: true` only when volatile storage is acceptable. Custom RxDB factories must register
`RxDBQueryBuilderPlugin` before creating the database because query sorting and limiting rely on it.

## TypeScript

Use `Schema<RawDoc, Methods, Statics, Virtuals>` as the source of truth. `Connection#model()` infers the model from that schema, including raw fields, instance methods, statics, and virtuals, so strict consumers do not need broad casts.

- `RawDocument<T>` and `LeanResult<T>` expose only domain fields plus `_id`; RxDB metadata fields (`_rev`, `_meta`, `_attachments`, `_deleted`) are not public result types.
- Hydrated operations return `HydratedDocument<T, Methods, Virtuals>`, which combines `Document<T>`, raw fields, methods, and virtual properties.
- `Query<Result>` implements `PromiseLike<Result>`, so `await User.find()` and `await User.findOne()` preserve exact result types. `.catch()` and `.finally()` return typed promises.
- `.lean(true)` changes query results to `LeanResult<T>` records without document methods.
- `FilterQuery<T>` rejects misspelled fields and incompatible operators. Use `LooseFilterQuery<T>` only as an explicit untrusted-input boundary before `sanitizeFilter()`.
- `UpdateQuery<T>` is field-kind aware: `$inc`/`$mul` require numeric fields, array operators require array fields and element values, and `_id`/RxDB metadata are excluded from updates.
- `validateSync()` is synchronous and returns `ValidationError | undefined`; use async `validate()` when middleware or async validators must run.

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
- `immutable`
- `index` — a storage-dependent lookup hint, not a uniqueness guarantee

Supported schema-level options are `_id`, `collection`, and `validateBeforeSave`. Unsupported
Mongoose options fail early with `SchemaConfigurationError` instead of being ignored, including
`timestamps`, `versionKey`, path `get` / `set`, `alias`, `select`, `ref`, `auto`, `sparse`, `expires`,
and `unique`. `unique` is not a backend-safe constraint in this package; use `index: true` only as a
lookup hint and enforce uniqueness in a layer that can provide an atomic guarantee.

Schema structure is compiled into a model snapshot. After `connection.model(name, schema)` returns,
structural `schema.add()` calls are rejected, and direct mutations to the original schema's path maps
cannot change that model's casting, validation, public JSON Schema, or RxDB schema. `schema.clone()`
creates an independent editable copy, including independent paths, child schemas, hooks, virtuals,
options, and query helpers.

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

Loaded documents keep a deep snapshot of the last persisted state. Top-level assignment marks paths
explicitly, and supported mutable values are also detected by structural diffing when `save()` runs:
arrays, plain objects, nested subdocuments, JSON-like mixed values, and `Date` instances. Mutating
`doc.tags`, `doc.profile.score`, or a date instance on the document can therefore persist without an
explicit setter call.

Constructor input and `toObject()` / `toJSON()` results are cloned at the boundary. Mutating an input
object or a plain object returned by `toObject()` cannot mutate the live document or mark it dirty.

`markModified(path)` is reconciled with the snapshot. It remains useful for supported mixed values, but
unchanged and reverted paths are treated as clean. Saving an unchanged loaded document skips adapter
mutation. The snapshot is refreshed only after successful persistence; failed saves keep their modified
paths for retry.

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

All current write routes (`create`, `insertMany`, document `save`, update operators,
replacement-style updates, and supported `updateOne(..., { upsert: true })` /
`findOneAndUpdate(..., { upsert: true })`) use the same schema-aware normalization pipeline before
persistence. Values are cast by their declared schema path, and validation sees the normalized value
that will be written.

The persistence adapter boundary exposes only domain fields plus the logical `_id` primary key. RxDB
revision metadata (`_rev`, `_meta`, `_attachments`, `_deleted`) is stripped before records reach public
documents, lean results, update callbacks, or the fake test adapter.

`Model.create()` and `Model.insertMany()` share one insertion pipeline. `create()` keeps per-document
`save` middleware and inserts one document at a time. `insertMany()` runs `insertMany` middleware and
uses the adapter bulk-insert path. It is ordered by default: records before the first storage failure
remain inserted and a `BulkWritePartialFailureError` reports `insertedCount`, `insertedIds`, inserted
`records`, and record-level `errors`. Pass `{ ordered: false }` to attempt every input record and receive
the same partial-failure shape for all failed indexes.

Dates are stored as ISO-8601 strings (`Date#toISOString()`) in memory and SQLite-backed storage, then
hydrated back to `Date` instances when documents are read. Dotted update paths such as
`profile.score` update nested objects structurally; literal top-level dotted keys are not written.
Dangerous path segments (`__proto__`, `prototype`, `constructor`), unknown update operators,
incompatible arithmetic or array operators, `_id`, immutable paths, and RxDB metadata (`_rev`, `_meta`,
`_attachments`, `_deleted`) are rejected before mutation.

Mutation options are intentionally narrower than full Mongoose and unsupported options throw
`MutationOptionError` instead of being ignored:

- `updateOne`: `sort`, `upsert`, `runValidators`, `setDefaultsOnInsert`.
- `updateMany`: `sort`, `runValidators`; multi-upsert is not supported.
- `deleteOne`: `sort` only. `deleteMany` accepts no options.
- `findOneAndUpdate`: `sort`, `upsert`, `new`, `returnDocument`, `runValidators`, `setDefaultsOnInsert`, `lean`.
- `findOneAndDelete`: `sort`, `lean`.

`runValidators: true` validates the final normalized storage value before persistence for existing
`updateOne`, `updateMany`, and `findOneAndUpdate` matches. With validation disabled, compatible casted
updates can persist values that violate schema validators. Upsert inserts are always validated because
they create a new record.

For `findOneAndUpdate`, `returnDocument` takes precedence over `new` when both are present:
`returnDocument: 'before'` returns the previous document, while `returnDocument: 'after'` and
`new: true` return the updated or inserted document. The default is the before document; an upsert that
returns before yields `null`.

Upsert inserts are built from eligible top-level equality filter fields (`field: value` and
`field: { $eq: value }`) plus the normalized update. Operator predicates such as `$gt` are not copied
into the inserted record. `_id` is generated when the equality filter does not provide one.
`setDefaultsOnInsert` applies schema defaults only when it is exactly `true`, and it is rejected unless
`upsert: true` is also set.

Read query semantics are intentionally defined for the supported subset:

- `limit()` and `skip()` must be non-negative safe integers.
- Results are sorted first, then `skip()` is applied before `limit()`.
- `findOne()` follows the same ordering and skip policy, then returns at most one document after the skipped window.
- `select()` supports inclusion, exclusion, string projections, and `_id` overrides. Mixed inclusion/exclusion projections are rejected except for `_id`.
- Projection is applied before hydration; defaults do not recreate projected-out fields.
- `lean()` returns normalized plain records directly and does not construct `Document` instances or run `init` hooks.
- `countDocuments()` uses the adapter count path, ignores `sort()`, and honors `skip()` / `limit()` by counting the paginated match window.

Query instances are single-use like Mongoose queries. The first execution through `exec()`, `await`,
`.then()`, `.catch()`, or `.finally()` owns the query; a second execution attempt rejects with the
package-owned `MongooseError` (`QueryExecutionError`). Clone before executing when you need another
variant. Filters, options, and updates are deep-copied at construction and clone time, and execution uses
a snapshot taken before query middleware runs.

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

Retained middleware behavior is intentionally narrower than full Mongoose:

- Document hooks (`validate`, `save`, `remove`, document `deleteOne`, `init`) run with `this` set to the document.
- Query hooks run with `this` set to the `Query` instance; inspect state with `getFilter()`, `getOptions()`, and `getUpdate()`.
- `insertMany` hooks run with `this` set to the model. Promise-style `pre('insertMany', function (docs) {})` receives the input docs; callback-style receives `(next, docs)`.
- Post success hooks receive `(result)` or callback-style `(result, next)`.
- Error post hooks must be registered with `{ errorHandler: true }` and receive `(err)` or callback-style `(err, next)`.
- Callback-style middleware that also returns a promise settles once; whichever callback or promise settles first wins.
- The TypeScript hook-name surface is limited to the listed operations; unsupported Mongoose hook names are not claimed.

Validation recurses through nested `Schema` paths and arrays of subdocuments. Failures are aggregated
into one `ValidationError` whose `errors` map is keyed by full logical paths such as `profile.name` or
`members.0.role`. Conditional `required` functions and custom validators run with `this` bound to the
owning document for root paths, or to the plain subdocument object for nested schema paths and
subdocument-array items. `save()` runs `validate()` by default; `{ validateBeforeSave: false }` skips
automatic save validation while leaving explicit `doc.validate()` unchanged.

`validateSync()` performs schema validation synchronously without middleware. Async custom validators
produce a sync `ValidationError` for that path; call `validate()` to run async validators and validation
middleware.

## Connection & Storage

`Connection` wraps an RxDB database. Pass any async factory that returns a `Promise<RxDatabase>`.
Connection strings are not supported and are rejected before storage creation; a URL is never treated
as an in-memory request.

```ts
import { createMemoryDatabase } from '@web-ts-toolkit/mongoose-rxdb/storage';

const conn = new Connection();
await conn.connect(() => createMemoryDatabase({ name: 'myapp' }));
```

Storage subpath helpers:

- `createMemoryDatabase({ name? })` — fast in-process storage, default for tests
- `createSqliteDatabase({ name?, filePath?, allowMemoryFallback? })` — local SQLite resolved automatically
  1. `rxdb-premium` (production-grade; needs a license token at install)
  2. RxDB free trial `getRxStorageSQLiteTrial` driven by Node 22+'s built-in `node:sqlite` (persists to files derived from `filePath`, but capped at ~500 docs/collection, no indexes, prints a warning each load)
  3. Same trial with npm `sqlite3` in Node, if installed
  4. In-memory `getRxStorageMemory` only when `allowMemoryFallback: true` is passed

Persistent requests fail closed by default. If no SQLite backend can be opened,
`createSqliteDatabase({ filePath })` rejects with `SqliteStorageError` and does not create a memory
database. Inspect `error.causes` for backend-specific load/open failures, or inspect
`db.sqliteStorageInfo` after a successful connection for the selected backend and path semantics.
`filePath` is exact for Premium and a `databaseNamePrefix` for RxDB trial backends.

A shared default connection is also available for simple apps:

```ts
import { connect, model, Schema, disconnect } from '@web-ts-toolkit/mongoose-rxdb';
import { createSqliteDatabase } from '@web-ts-toolkit/mongoose-rxdb/storage';

await connect(() => createSqliteDatabase({ filePath: './app.db' }));
const User = model('User', new Schema({ name: String }));
await disconnect();
```

Connection state is explicit: `disconnected`, `connecting`, `connected`, `closing`, or `failed`.
Concurrent `connect()` calls share one in-flight connection attempt, concurrent `disconnect()` calls
share one close operation, and calling `connect()` while already connected rejects. To switch storage,
call `disconnect()`, then compile fresh models on the reconnected `Connection`; model objects from the
previous connection are invalidated and must not be reused.

Collections are registered by normalized lower-case collection name. Equivalent schemas targeting the
same normalized collection share one collection initialization and adapter. Incompatible schemas for
the same normalized name, including case-only collection-name collisions, throw before storage is
touched. If collection initialization fails, the failed model is removed from `connection.modelNames()`
and can be retried with the same model name after fixing the cause.

## Security: `sanitizeFilter`

Filters built from user input can leak Mango operators (`$where`, `$func`, ...). Call
`sanitizeFilter` at the request boundary before passing untrusted filters to model methods. It is
caller-invoked, not automatic request parsing. Query execution also validates filters and rejects
unsupported operators if a caller bypasses sanitization.

```ts
import { QueryFilterError, sanitizeFilter } from '@web-ts-toolkit/mongoose-rxdb';

try {
  const safe = sanitizeFilter(req.body.filter);
  await User.deleteMany(safe);
} catch (error) {
  if (error instanceof QueryFilterError) {
    // The rejected filter was not executed, so unrelated documents were not touched.
  }
}
```

Only object filters using the logical operators `$and`, `$or`, `$nor` (recursed into) and the Mango per-field operators
(`$eq`, `$gt`, `$gte`, `$lt`, `$lte`, `$ne`, `$in`, `$nin`, `$exists`, `$regex`, `$options`) pass
through. `null` and other non-object filters, invalid top-level operators, unsupported field operators, malformed logical arrays,
dangerous keys (`__proto__`, `prototype`, `constructor`), excessive nesting, and excessive logical
array width throw `QueryFilterError`; rejected filters are never broadened to `{}`.

Regex filters are allowed only under a strict bounded policy before adapter execution: pattern text
must be at most 128 characters, flags may only be `i`, `m`, `s`, or `u`, and duplicate/invalid flags,
backreferences, lookaround, repeated wildcard scans, quantified alternation, and nested quantified
groups such as `^(a+)+$` are rejected.

## `_id`

Each document auto-generates a `_id` — a UUIDv4 when `globalThis.crypto.randomUUID` is available,
otherwise a short random+timestamp string. You may pass an explicit `_id` in the constructor data
or `Model.create(data)`. After construction `_id` is read-only (no setter): RxDB primary keys
cannot be changed after insert, so the field is immutable.

## Connection model registration

`Connection#model(name, schema, collection?, options?)` compiles a schema into a Model. Calling it
twice with the same `name` and a new schema throws (matching Mongoose's `OverwriteModelError`)
unless you pass `{ overwrite: true }`. To register a different shape, call
`connection.deleteModel(name)` first, or use `{ overwrite: true }`. This only replaces the model
registration. The underlying RxDB collection schema is **not** migrated by delete/overwrite, so use a
distinct collection name or perform an explicit migration outside this package before changing
persisted collection shape.

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
