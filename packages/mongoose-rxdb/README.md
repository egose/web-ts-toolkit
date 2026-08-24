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
# Optional Node fallback when node:sqlite is unavailable:
pnpm add sqlite3
```

> No `sqlite3` install is required on Node 22+: the built-in `node:sqlite` module is
> auto-detected and used by the free trial SQLite storage (subject to its limits).
> This package supports Node 22+. `sqlite3` is only a Node fallback for runtimes where
> `node:sqlite` cannot be opened; non-Node runtimes must provide their own RxDB factory.

Peer ranges: `rxdb >=17.4.0 <18` and `rxjs >=7.8.0 <8` are required. Optional backend
peers are `rxdb-premium >=17.4.0 <18` and `sqlite3 >=5 <6`.

## Imports And Module Identity

Use named imports as the canonical style:

```ts
import { Connection, Schema } from '@web-ts-toolkit/mongoose-rxdb';
import { createMemoryDatabase } from '@web-ts-toolkit/mongoose-rxdb/storage';
```

Default exports are retained only as redundant compatibility conveniences. Avoid mixing them into new
code because named imports give clearer editor completions and tree-shaking.

The package publishes separate ESM and CommonJS builds. When one process loads both formats, each format
has its own `Schema`/`Connection` class identity and its own `defaultConnection`; they are not a shared
cross-format singleton. Pick one module format per application graph, and pass explicit `Connection`
instances across boundaries when integration code might mix ESM and CommonJS.

## Compatibility Matrix

| Runtime  | RxDB           | RxJS         | Evidence                                                                                                                                                                                                |
| -------- | -------------- | ------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Node 22+ | `>=17.4.0 <18` | `>=7.8.0 <8` | Package tests, strict NodeNext/Bundler declaration consumers, packed pnpm/npm runtime imports, and packed README quickstart run against the workspace dev dependencies (`rxdb ^17.4.0`, `rxjs ^7.8.2`). |

Future RxDB or RxJS majors are intentionally outside the peer range until they have the same package,
declaration, and packed-consumer coverage.

## Highlights

- `Schema` with type casting, defaults, `required`, `enum`, `min`, `max`, `match`, custom `validate`.
- `Document` with dirty-path tracking (`isModified`, `modifiedPaths`), virtuals, instance methods, `save()`/`remove()`.
- `kareem`-style `pre`/`post` middleware engine for `save`, `validate`, `remove`, `updateOne`, `find`, etc.
- Thenable chainable `Query` builder (`.where().gt().limit().sort()`) that compiles to RxDB Mango queries.
- `Model` with `find`, `findOne`, `findById`, `create`, `insertMany`, `updateOne`/`updateMany`, `deleteOne`/`deleteMany`, `findOneAndUpdate`, `findOneAndDelete`, `countDocuments`, plus `statics`.
- `Connection` over an RxDB database. Storage is pluggable; `@web-ts-toolkit/mongoose-rxdb/storage` ships `createMemoryDatabase` and `createSqliteDatabase`.

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

## TypeScript Contract

Use `Schema<RawDoc, Methods, Statics, Virtuals>` as the source of truth for the public model type. `Connection#model()` infers the same raw document, instance methods, statics, and virtuals from that schema, so callers do not need a broad model cast.

- `RawDocument<T>` and `LeanResult<T>` contain only domain fields plus the logical `_id`; RxDB metadata fields are not part of the public result surface.
- Hydrated reads and writes return `HydratedDocument<T, Methods, Virtuals>`, which combines `Document<T>`, raw fields, instance methods, and virtual properties.
- Lean queries return `LeanResult<T>` records without document methods; hydrated queries return document methods plus raw fields.
- `Query<Result>` is `PromiseLike<Result>`, so `await User.find()` and `await User.findOne()` preserve exact result types without `.exec()`.
- `FilterQuery<T>` is strict for known fields. Use `LooseFilterQuery<T>` only at explicit untrusted-input boundaries such as `sanitizeFilter(req.body.filter)`.
- Update operators are field-kind aware: numeric operators accept numeric fields, array operators accept array fields and element values, and `_id`/RxDB metadata are not part of the update type surface.
- `validateSync()` is synchronous and returns `ValidationError | undefined`; use async `validate()` when middleware or async validators must run.

## Storage

The package is storage-agnostic. `@web-ts-toolkit/mongoose-rxdb/storage` exports:

- `createMemoryDatabase(opts?)` — in-process memory storage (great for tests).
- `createSqliteDatabase(opts?)` — local SQLite. Resolution order is automatic, but a
  requested SQLite database fails closed when no backend can be opened:
  1. `rxdb-premium`'s `getRxStorageSqlite` (production-grade; needs a license token at install).
  2. RxDB's free **trial** `getRxStorageSQLiteTrial` driven by Node 22+'s built-in `node:sqlite` — persists to files derived from `opts.filePath`, prints a warning each load, capped at ~500 docs/collection, no indexes.
  3. Same trial but with npm `sqlite3` in Node, if installed.
  4. In-memory `getRxStorageMemory` only when you pass `allowMemoryFallback: true`.

  This is a breaking safety change from older releases: `createSqliteDatabase({ filePath })`
  no longer silently creates volatile memory storage when SQLite is unavailable. It rejects with
  `SqliteStorageError`, whose `causes` array preserves backend-specific load/open failures.
  To accept data loss explicitly, pass `{ allowMemoryFallback: true }`.

  `filePath` semantics are backend-specific: Premium receives it as the exact SQLite database file
  path (`sqliteDatabasePath`), while RxDB trial backends receive it as `databaseNamePrefix` and may
  create collection-specific files with additional suffixes. The returned database exposes
  `sqliteBackend` and `sqliteStorageInfo` so callers can inspect the selected backend, requested
  path, persistence flag, and fallback causes.

  On success a one-line `[mongoose-rxdb] createSqliteDatabase: using <backend> SQLite at <path>` warning is printed (with the trial caveat for level 2 and 3). For real production SQLite, install `rxdb-premium`.

```ts
import { SqliteStorageError, createSqliteDatabase } from '@web-ts-toolkit/mongoose-rxdb/storage';

try {
  const db = await createSqliteDatabase({ filePath: './app.db' });
  console.log(db.sqliteBackend, db.sqliteStorageInfo.persistent);
} catch (error) {
  if (error instanceof SqliteStorageError) {
    console.error(error.causes);
  }
}

const volatileDb = await createSqliteDatabase({ filePath: './app.db', allowMemoryFallback: true });
console.log(volatileDb.sqliteBackend); // 'memory' only if every SQLite backend failed
```

Pass any RxDB database factory to `Connection#connect(factory)`. Connection strings are not
supported and are rejected; the package never interprets a URL string as an in-memory database
request.

## Connection Lifecycle

`Connection` has explicit `disconnected`, `connecting`, `connected`, `closing`, and `failed` states.
Concurrent `connect()` calls share one in-flight connection attempt, concurrent `disconnect()` calls
share one close operation, and calling `connect()` while already connected rejects. To switch storage,
call `disconnect()`, then create a new model on the reconnected `Connection`.

Collections are registered by normalized lower-case collection name. Models with equivalent schemas
and the same normalized collection share one collection initialization and one adapter. A second model
with an incompatible schema for the same normalized collection, including case-only name collisions,
throws before storage is touched. If collection initialization fails, the failed model is removed from
`connection.modelNames()` and can be retried with the same model name after fixing the cause.

`disconnect()` invalidates all existing model instances and clears `connection.models`. Existing model
objects must not be reused after disconnect or reconnect; compile fresh models on the active
connection. `Connection#model(name, schema, collection, { overwrite: true })` replaces the model
registration only. It does not migrate an existing RxDB collection schema; use a new collection name or
perform an explicit migration outside this package before changing persisted collection shape.

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

Only object filters using `$and` / `$or` / `$nor` (recursed) and the Mango per-field operators
(`$eq`, `$gt`, `$gte`, `$lt`, `$lte`, `$ne`, `$in`, `$nin`, `$exists`, `$regex`, `$options`) pass
through. `null` and other non-object filters, invalid top-level operators, unsupported field operators, malformed logical arrays,
dangerous keys (`__proto__`, `prototype`, `constructor`), excessive nesting, and excessive logical
array width throw `QueryFilterError`; rejected filters are never broadened to `{}`.

Regex filters are allowed only under a strict bounded policy before adapter execution: pattern text
must be at most 128 characters, flags may only be `i`, `m`, `s`, or `u`, and duplicate/invalid flags,
backreferences, lookaround, repeated wildcard scans, quantified alternation, and nested quantified
groups such as `^(a+)+$` are rejected.

## `_id`

Each document auto-generates a `_id` (UUID when `globalThis.crypto.randomUUID` is available,
otherwise a short random+timestamp string). You may pass an explicit `_id` in the constructor
data or `Model.create(data)`. After construction `_id` is read-only: RxDB primary keys cannot
be changed after insert, so the field has no setter.

## Schema Contract

Schema structure is compiled into an immutable model snapshot. After `connection.model(name, schema)`
returns, later structural `schema.add()` calls are rejected, and direct mutations to the original
schema's path maps cannot affect the compiled model, casting, validation, public JSON Schema, or RxDB
schema. Use `schema.clone()` before model compilation when you need an independent editable copy;
clones do not share mutable path maps, child schemas, hooks, virtuals, options, or query helpers.

Accepted schema options are intentionally narrow and have tested behavior:

- Schema options: `_id`, `collection`, `validateBeforeSave`.
- Path options: `type`, `required`, `default`, `enum`, `min`, `max`, `match`, `validate`, `immutable`, `index`.

Unsupported Mongoose options fail early with `SchemaConfigurationError` instead of being ignored. This
includes `timestamps`, `versionKey`, path `get` / `set`, `alias`, `select`, `ref`, `auto`, `sparse`,
`expires`, and `unique`. `unique` is not a backend-safe uniqueness guarantee in this package; use
`index: true` only as a storage-dependent lookup hint, and enforce uniqueness in an application or
backend layer that can provide an atomic constraint.

## Document Snapshots And Dirty Tracking

Loaded documents keep a deep snapshot of the last persisted state. Top-level assignment still marks
paths explicitly, and supported mutable values are also detected by structural diffing on `save()`:
arrays, plain objects, nested subdocuments, mixed values made from JSON-like data, and `Date` instances.
For example, `doc.tags.push('new')`, `doc.profile.score = 2`, and `doc.seenAt.setUTCFullYear(2026)` are
persisted without an explicit setter call.

Constructor input and `toObject()` / `toJSON()` results are cloned at the document boundary. Mutating the
original input object or a plain object returned by `toObject()` cannot mutate the live document or mark
it dirty.

`markModified(path)` is reconciled with the snapshot: it is useful for supported mixed values, but a path
that is unchanged or reverted to its persisted value is treated as clean. Saving an unchanged loaded
document skips adapter mutation. The snapshot is refreshed only after a successful insert or update;
failed saves retain their modified paths so a later retry can persist the same changes.

## Write Normalization

All current write routes (`create`, `insertMany`, document `save`, update operators,
replacement-style updates, and supported `updateOne(..., { upsert: true })` /
`findOneAndUpdate(..., { upsert: true })`) pass through one schema-aware normalization pipeline before
persistence. Values are cast by their declared schema path, and validation sees the normalized value
that will be written.

The persistence boundary exposes only domain fields plus the logical `_id` primary key. RxDB revision
metadata (`_rev`, `_meta`, `_attachments`, `_deleted`) is stripped at the adapter boundary and is never
returned in hydrated documents or lean results.

`Model.create()` and `Model.insertMany()` share the same insertion pipeline. `create()` preserves
per-document `save` middleware and therefore inserts one document at a time. `insertMany()` runs
`insertMany` middleware and uses the adapter bulk-insert path. It is ordered by default: records before
the first storage failure remain inserted and a `BulkWritePartialFailureError` reports
`insertedCount`, `insertedIds`, inserted `records`, and record-level `errors`. Pass
`{ ordered: false }` to attempt every input record and receive the same partial-failure shape for all
failed indexes.

Dates are stored as ISO-8601 strings (`Date#toISOString()`) in every storage backend and hydrated back
to `Date` instances when documents are read. Dotted update paths such as `profile.score` update nested
objects structurally; literal top-level dotted keys are not written. Dangerous path segments
(`__proto__`, `prototype`, `constructor`), unknown update operators, incompatible arithmetic or array
operators, `_id`, immutable paths, and RxDB metadata (`_rev`, `_meta`, `_attachments`, `_deleted`) are
rejected before mutation.

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

## Query Reads

Read queries validate pagination before adapter execution: `limit()` and `skip()` must be non-negative
safe integers. Results are ordered by `sort()`, then `skip()` is applied before `limit()`. `findOne()`
uses the same ordering and skip policy, then returns at most one document after the skipped window.

`select()` supports Mongoose-style inclusion and exclusion projections, including string syntax such as
`'name age -_id'` and exclusion syntax such as `'-secret -_id'`. Inclusion and exclusion cannot be mixed
except for `_id`; invalid projections throw `QueryOptionError`. Projection is applied before hydration,
so projected-out fields are not restored by schema defaults. Lean reads return normalized plain records
directly instead of constructing `Document` instances or running `init` hooks.

`countDocuments()` uses the adapter count path without hydrating records. It ignores `sort()` because
ordering does not affect the count, and it honors `skip()` / `limit()` by returning the size of the
paginated match window.

Query instances are single-use like Mongoose queries. The first execution through `exec()`, `await`,
`.then()`, `.catch()`, or `.finally()` owns the query; a second execution attempt rejects with a
package-owned `MongooseError` (`QueryExecutionError`). Clone a query before executing if you need to run
another variant. Filters, options, and updates are deep-copied at construction and clone time, and each
execution uses a snapshot taken before query middleware runs.

## Validation And Middleware

Validation recurses through nested `Schema` paths and arrays of subdocuments. Errors are aggregated
into one package-owned `ValidationError` with an `errors` map keyed by full logical paths such as
`profile.name` or `members.0.role`. Conditional `required` functions and custom validators run with
`this` bound to the owning document for root paths, and to the plain subdocument object for nested
schema paths and subdocument-array items.

`validateBeforeSave` is honored: `save()` runs `validate()` first by default, while schemas created
with `{ validateBeforeSave: false }` skip automatic save validation but still support explicit
`doc.validate()`.

`validateSync()` performs the schema validation path synchronously without middleware. If it encounters
an async custom validator, it returns a `ValidationError` for that path; use `validate()` for async
validators and middleware.

Retained hook names are exactly: `validate`, `save`, `remove`, document/query `deleteOne`, query
`deleteMany`, query `updateOne`, query `updateMany`, query `findOne`, query `find`, query
`findOneAndUpdate`, query `findOneAndDelete`, model `insertMany`, and document hydration `init`.
Unsupported Mongoose hook names are not part of the TypeScript surface.

Middleware context and completion rules:

- Document hooks (`validate`, `save`, `remove`, document `deleteOne`, `init`) run with `this` set to the document.
- Query hooks run with `this` set to the `Query` instance; use `getFilter()`, `getOptions()`, and `getUpdate()` to inspect state.
- `insertMany` hooks run with `this` set to the model. Promise-style `pre('insertMany', function (docs) {})` receives the input docs; callback-style receives `(next, docs)`.
- Post success hooks receive `(result)` for promise style or `(result, next)` for callback style.
- Error post hooks must be registered with `{ errorHandler: true }` and receive `(err)` for promise style or `(err, next)` for callback style.
- Callback-style middleware that also returns a promise settles once; the first callback or promise settlement wins.

## Status

Core MVP surface. Out of scope for now: `populate`, `aggregate`, indexes sync, sessions, discriminators, `bulkWrite`, cursors. These can be layered on as the design doc's pillars are extended.

## Documentation

Full package documentation lives in `website/docs/packages/mongoose-rxdb.md`.
