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
  backends (which append a `_trial_<databaseName>` suffix, so on-disk names differ from the
  requested path). `filePath` defaults to `':memory:'`, which is volatile-only: it selects
  genuine in-memory storage when `allowMemoryFallback: true` is passed and is rejected otherwise,
  because trial SQLite backends would open an ordinary relative file such as
  `:memory:_trial_<databaseName>` instead of SQLite's special in-memory name. Only the memory
  backend reports `persistent: false`; every SQLite backend reports `persistent: true`.
  The returned database exposes `sqliteBackend` and `sqliteStorageInfo`.

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

try {
  await conn.connect(() => createMemoryDatabase({ name: 'quickstart' }));
  const User = conn.model('User', userSchema);
  const ada = await User.create({ name: 'Ada', age: 36, role: 'admin', tags: [] });
  console.log(ada.isAdmin); // true
  ada.addTag('math');
  await ada.save();

  const admins = await User.find({ role: 'admin' }).sort({ age: 1 });
  await User.updateOne({ name: 'Ada' }, { $inc: { age: 1 } });
  await User.deleteOne({ name: 'Ada' });
  console.log(admins.map((user) => user.name));
} finally {
  await conn.disconnect();
}
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
- `.lean(true)` changes document-producing results to `LeanResult<T>` records without document methods; `.lean(false)` restores the hydrated type. `UpdateResult`, `DeleteResult`, and `countDocuments()` numbers are preserved unchanged, and nullable document results preserve `null`. `findOneAndUpdate(..., { lean: true })` and `findOneAndDelete(..., { lean: true })` return `LeanResult<T> | null`.
- Projected lean records remain typed as the full `LeanResult<T>`; projection does not narrow the type to a partial.
- Intentionally public thrown errors (`WriteNormalizationError`, `ParallelSaveError`, `MutationPartialFailureError`, `BulkWritePartialFailureError`, `QueryFilterError`, `QueryOptionError`, `MutationOptionError`, `ValidationError`, `SchemaConfigurationError`) are importable from the package root for `instanceof` narrowing; deep imports are not required.
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
- `required` — `boolean`, `[boolean, string]`, or a function (including `[fn, message]`).
  Function-valued `required` is evaluated dynamically by validation and is never emitted as an
  unconditional entry in public JSON Schema or RxDB `required` lists.
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
Required tuples, enum arrays, and validator configuration objects are owned and sealed, recursively
through nested and array-item paths. Caller rule containers are not frozen; clones retain independent
editable rules. Methods/hooks and application callback closure state remain mutable behavior.

Literal defaults have a separate data-copy boundary. Schema construction, `add()`, cloning and model
compilation own arrays, plain/null-prototype objects and Dates after bounded structural preflight;
cyclic, over-depth/over-work, sparse or accessor-bearing literals throw `WriteNormalizationError`
before recursive copying. Default factories are not executed by schema copying. Nonplain defaults
retain their kind until a needed default reaches schema-aware casting: mixed Map/Set/class values
reject before writes, while supported string/number coercions still work. Those opaque coercion
objects and factory callbacks remain application-owned shared behavior; resulting document data is
independently owned. Whole-document input/default/output budgets still apply when defaults are used.

**Migration:** literal defaults no longer lose their kind during schema cloning/model compilation;
unsupported mixed defaults reject rather than storing `{}` or prototype-erased objects. Invalid
literal structure can now reject during schema construction or copying, even if a later document
would override that default.

Nested structure requires an explicit child `Schema` (`{ profile: childSchema }`,
`{ profile: { type: childSchema } }`, `[childSchema]` for subdocument arrays). Inline nested
plain-object definitions (`{ profile: { name: String } }`), dotted path names, and prefixed
`schema.add(obj, prefix)` are rejected with `SchemaConfigurationError` before collection creation;
full Mongoose nested syntax is intentionally not supported.

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
mutation. The snapshot is refreshed only after successful persistence; failed writes keep their modified
paths for retry.

### In-Flight Saves And Migration

Each save captures owned data and per-path replacement intent **after validation and pre-save hooks**,
before persistence. Edits before capture join that write. Edits after capture stay on the live document
for the next save: scalar/live nested edits, assignments, both forms of `set()`, and `markModified()`.
Success advances the snapshot to captured data and clears only the captured intent. Repeated markings
of the same path create fresh intent even for equal values. Equal/reverted values still skip writes;
the newer marker controls replacement if that path changes before the next save. A no-op save consumes
its captured clean markers. `clearModified()` discards current markers, not structural differences.

Live plain-object edits merge changed leaves; explicit parent assignment, `set('parent', value)`,
`set('parent.nested', value)`, or `markModified('parent')` replaces the changed subtree. Complete arrays
are whole-array, last-writer-wins writes. Projection safety checks still apply on every save.

Await a save's settlement before starting another save on that instance. Overlaps reject with
`ParallelSaveError` (import from `@web-ts-toolkit/mongoose-rxdb`) before collection resolution,
validation, hooks, or writes. The guard lasts through success/error post hooks, so recursive saves
from hooks also reject. Rejected overlaps run no hooks and leave the active save alone. The guard
releases on success or failure; distinct instances retain leaf-merge/last-writer-wins semantics.
Replace same-instance `Promise.all([doc.save(), doc.save()])` with awaited saves.

Validation/save hooks still run once per admitted operation (automatic validation is skipped with
`validateBeforeSave: false`); raw final-candidate validation remains inside the adapter retry boundary.
Write failure retains captured and later intent for retry. Post-save hook failure after a successful
write does not undo that write: the snapshot has advanced and an inserted record has `isNew === false`.
Post-hook edits remain pending; retry after settlement saves remaining edits without another insert.
The returned document is live and may already contain later unsaved edits.

### Document Value Safety And Migration

Construction, `create`, `insertMany`, direct schema-property assignment, and string/dotted/object-form
`set()` check structure before cloning or casting and reject invalid values with the root-exported
`WriteNormalizationError`. Mixed data accepts finite JSON primitives, dense arrays, plain/null-prototype
objects, and valid Dates. Map/Set/class instances, functions, symbols, bigint, non-finite numbers,
nested undefined, sparse arrays, enumerable accessors/symbol keys, and dangerous keys reject rather
than silently losing data or prototypes.

Schema casts still follow the converter: numeric strings, `"false"`, bigint-to-string/number, and
compatible boxed/custom scalar values work. Invalid casts reject immediately; scalar array elements
reject objects/arrays unless their element schema supports them. Dotted setters cast the addressed
path. Declared schema fields (also within subdocuments) can be undefined/absent; mixed JSON and array
elements cannot. Dates stay owned Date instances in documents and normalize to ISO strings in storage.
Snapshots/serialization also normalize live nested scalar edits against their declared schema path.

The structural limits are **50 levels / 2,000 visited values**: root depth zero, aliases charged per
occurrence, whole raw document/setter input and whole resulting document (including `_id`) bounded
independently. Needed default-factory results share the casting operation's budgets; overridden defaults
are not evaluated. Insert conversion shares these whole-input-plus-default and whole-output budgets,
including defaults first needed after `toObject()` omits explicit `undefined`, pre-save hooks, or
default-enabled upserts. These limits apply per batch document, not to string bytes or arbitrary application
callback execution. Public `castDocumentToSchema` and `castValue` use the same bounded checks.

Setters stage data/dirty changes and roll back on rejection, including dotted traversal and virtual
setter data changes; external callback side effects are outside that rollback. `create([...])`
prepares every entry including late insert defaults and `insertMany` prepares every entry in either
ordered mode before writing, so bad ingress in any
entry causes no writes. Later middleware/validation/storage failures remain non-transactional.
Live nested edits remain supported, but invalid live values fail serialization, recursive dirty
comparison, and save before adapter mutation (also with save validation disabled). Correct/remove the
invalid value before retrying. Migration: previously erased object prototypes or stringified invalid
array elements now reject early. Oversized insert-time defaults reject before writes instead of
producing unreadable records or a batch error after insertion. See the shipped README's
**Document Value Safety** contract.

### Selected Documents: Save Safety And Migration

Hydrated `find()` / `findOne()` results retain private, immutable projection metadata. Keep `_id`
selected (the default): a loaded document without it rejects `save()` with `WriteNormalizationError`
before mutation, even if unchanged. No new identity is inferred.

- Selected scalar edits and in-place plain-object leaf changes merge into current storage, preserving
  hidden optional/required/immutable/defaulted fields. Saving never copies hidden stored values back
  into the public document, serialization, or document hooks.
- Arrays are whole-array writes. Any changed partially selected array rejects with
  `WriteNormalizationError`, including visible-element edits, pushes/removals, and numeric setters.
  There is no inferred element identity or index merge.
- Explicit top-level assignment, `set('parent', value)`, and `markModified('parent')` opt a changed
  subtree into replacement. Replacement, `null`, or unset of an incomplete subtree rejects; so does
  writing an unselected field or creating an incomplete parent. Select the whole subtree before
  replacing it. For example, select `'profile'` for replacement; select `'profile.name'` and use
  `doc.set('profile.name', 'Grace')` for a leaf edit in an existing partial object.
  Use `set()` or `markModified()` to express nested replacement intent; direct mutations inside plain
  objects follow the leaf-diff contract.
- Completeness follows the projection, conservatively: even an excluded descendant that is absent
  makes its parent incomplete, and selecting individual children does not prove parent completeness.
  Empty projections retain full-record behavior. Unchanged projected documents with `_id` skip
  mutation. Safety restrictions remain active with `validateBeforeSave: false`.

**Array representation:** lean and hydrated projections use explicit `null` for redacted array
positions, preserving the source length and indexes. For example, selecting `'title members.1.name'`
from three members returns `members: [null, { name: 'Ada' }, null]`. Selecting `'members.name'`
also uses `null` at positions without that field if any element contributes; if none contributes,
the array field is omitted. Multiple selected paths are combined. Excluding a whole numeric index
uses `null` instead of removing/shifting that element. Nested arrays follow the same rule.
These placeholders expose no hidden values and are not defaults or evidence of stored `null`;
an actual selected `null` is indistinguishable without a fuller read. Check for `null` before
accessing a projected element: result types do not narrow to reflect these slots. `toObject()`,
`toJSON()`, and JSON serialization preserve the same representation. Unchanged and selected scalar
saves preserve the stored arrays; placeholders are never written back as incomplete replacements.
Caller-supplied sparse arrays and holes introduced by live mutations still reject.

With validation enabled, partial saves run `validate`/`save` hooks once on the redacted document,
then run schema validators against the full merged storage candidate inside the adapter retry boundary.
This supports hidden required fields and cross-field rules without synthesizing defaults or exposing
the candidate on the document. Unchanged partial saves do not validate a candidate. Standalone
`validate()` / `validateSync()` on a nonempty projection reject / return `ValidationError` with
`kind: 'projection'`: reload without `select()` for standalone validation, or use the validated save
path. Hooks that call standalone validation must account for that restriction.

**Migration:** older versions could silently discard hidden data through partial array/object
replacement. Reload the whole affected subtree for replacement; retain dotted leaf edits for partial
objects. Loaded-record validation and dirty diffing no longer apply absent defaults. Projected-out
fields and defaults omitted by `setDefaultsOnInsert: false` stay absent after subsequent saves;
explicit unsets do not restore defaults. Projected setters suppress recursive defaults too.
New-document default application is unchanged. See the shipped README's **Saving Selected Documents**
section for the consumer contract.
Projected arrays now use explicit `null` slots instead of holes (and whole-index exclusions no longer
compact indexes), so multi-element numeric/missing-field projections can hydrate and safely save.

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

Supported query operators: `$eq`, `$gt`, `$gte`, `$lt`, `$lte`, `$ne`, `$in`, `$nin`, `$exists`,
and top-level `$and` / `$or` / `$nor`. Request `RegExp` values and `$regex` / `$options` reject with
`QueryFilterError` before persistence.

Supported update operators: `$set`, `$unset`, `$inc`, `$mul`, `$min`, `$max`, `$push`, `$pull`,
`$addToSet`, plus a plain `{ field: value }` alias for `$set`.

### Conditional Mutation Selectors (Compatibility / Migration)

Mutation rechecks use RxDB's own query matcher on the current record inside every native update retry.
For the supported compiled selectors, reads and rechecks share these semantics:

- Scalar `$eq` / `$in` match array elements; `$nin` rejects an array containing a forbidden member.
  Array-valued `$eq` uses native array equality.
- Equality / `$in` with `null` include missing fields. `$ne: null` / `$nin: [null]` exclude null and
  missing fields; `$exists` distinguishes them.
- Dotted selectors traverse objects and arrays; numeric segments address array indexes.
- Date-looking strings retain native string comparison, without implicit date parsing. Actual `Date`
  operands normalize to stored ISO strings before selection and rechecking.

For updates without `upsert`, a record that loses its predicate reports zero matched/modified counts,
or `null` from `findOneAndUpdate`. The adapter does not select another record. Successful counts and
preimages reflect the successful retry's current state. Use `_id` plus expected state for claims and
treat no-match as a lost claim; multi-record operations are per-record and non-transactional.

Deletes use the same matching semantics but remain **best-effort conditional**: a concurrent writer
can change a record after the final check and before native removal. Unsupported filters still reject
at compilation. Direct adapter callers must pass compiled queries, using `compileQuery`.
`findOneAndDelete` returns an observed preimage, not an atomic delete-time snapshot. For state-sensitive
workflows, prefer a conditional update to a terminal/soft-deleted state with `upsert: false`, then physical
cleanup under application coordination. A prior read or `_id` alone cannot lock a delete.

**Migration:** the former handwritten recheck could disagree with native reads for arrays,
null/missing, dotted paths, and date-looking strings. Updates now follow native matching, so a `$nin`
claim loses when a concurrent writer adds a forbidden member. See the shipped README's
**Conditional Mutation Selectors** section for the consumer contract.

### Write Normalization

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

Unordered duplicate IDs preserve first-occurrence priority and original input-index errors. Every
occurrence is attempted; later duplicates normally receive native primary-key conflicts. Native bulk
passes each contain unique IDs, so pass count is the maximum ID frequency. Partitioning now uses
linear dictionary work; duplicate-heavy batches still need those passes, with no throughput guarantee.

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

### Upsert Concurrency And Business Identity

`updateOne` / `findOneAndUpdate` with `upsert: true` perform **update, then separately insert on no
write-time match**. This includes a selected candidate losing its predicate during a native conflict
retry. There is no transaction, atomic secondary uniqueness, alternate-record selection,
read-before-insert uniqueness check, or automatic retry-as-update after insert conflict.

Deterministic native-memory and persistent `trial-native` SQLite tests show:

| Interleaving                                                      | Outcome                                                                                        |
| ----------------------------------------------------------------- | ---------------------------------------------------------------------------------------------- |
| Both calls observe no match; generated IDs                        | Both can insert distinct IDs with the same business key.                                       |
| Both calls observe no match; same explicit `_id` equality         | One inserts; the other rejects with a native conflict, without applying its update.            |
| Selected record loses predicate during retry; generated ID        | Competing change survives; a new record is inserted even if another record remains eligible.   |
| Selected record loses predicate during retry; same explicit `_id` | Insertion at the occupied ID rejects; competing change survives and no alternative is updated. |

The winning caller is unspecified. Observed RxDB 17 insert conflicts have `code: 'CONFLICT'` and
propagate as native errors, not a package-owned duplicate-key error. Validation/backend errors can
also reject. This evidence does not establish Premium or replication behavior.

On insertion, `updateOne` returns zero matched/modified counts plus `upsertedCount: 1` and
`upsertedId`. `findOneAndUpdate` defaults to `'before'`, returning **null even after insertion**;
use `returnDocument: 'after'` / `new: true` for the inserted record (lean if requested).
Insertion starts from equality fields plus the update, not the lost candidate. The inserted data
need not satisfy the original filter: range/membership predicates do not supply initial values,
and the update can change an equality field. Insert validation/default rules still apply.

- Use one stable canonical `_id` per business entity, including tenant/key scope, across all writers.
  Supply it as a direct equality filter (`{ _id: entityId }` or `{ _id: { $eq: entityId } }`);
  equalities inside `$and`/`$or` are not extracted for inserts. This relies on native primary-key
  conflicts, not an atomic uniqueness constraint on another field.
- Stable IDs do not make conditional upserts transactional. An existing ID with a mismatching state
  can cause conflict even in sequential calls. Reload after conflict and evaluate the business state;
  blindly retrying non-idempotent updates such as `$inc` can apply an operation again.
- Serialize creation/read-decision-write workflows by business key across every participating writer
  when one local creator is needed. In-process queues do not cover other processes/tabs/devices or
  replication. Cross-boundary coordination needs an authoritative backend providing the required
  atomic constraints/transactions. A separate existence read is insufficient. Use an identity-only
  creation filter; changing a state predicate can cause repeated inserts even with serialization.
- For claims, use `_id` plus expected state with **`upsert: false`** (the default); treat zero matches
  or null as a lost claim. Keep creation separate from conditional state transitions:

```ts
const claim = await Jobs.updateOne({ _id: jobId, state: 'ready' }, { $set: { state: 'claimed' } }, { upsert: false });
if (claim.matchedCount === 0) {
  // Missing or no longer eligible; do not create a replacement job here.
}
```

**Compatibility / migration:** these are existing upsert semantics, not new atomic guarantees.
Replace atomic find-or-create or claim-with-upsert assumptions with explicit identity/coordination.
See the shipped README's **Upsert Concurrency And Business Identity** for installed-consumer guidance.

### Read Query Semantics

Read query semantics are intentionally defined for the supported subset:

- `limit()` and `skip()` must be non-negative safe integers.
- Results are sorted first, then `skip()` is applied before `limit()`.
- `findOne()` follows the same ordering and skip policy, then returns at most one document after the skipped window.
- `select()` supports inclusion, exclusion, string projections, and `_id` overrides. Mixed inclusion/exclusion projections are rejected except for `_id`.
- Projection is applied before hydration; defaults do not recreate projected-out fields.
- `lean()` returns normalized plain records directly and does not construct `Document` instances or run `init` hooks. Lean applies only to document-producing reads; `update`/`delete`/`count` results keep their count shapes, and passing `lean` to those operations rejects with `MutationOptionError`.
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
subdocument-array items. Full-document `save()` runs `validate()` by default; `{ validateBeforeSave: false }` skips
automatic save validation while leaving explicit `doc.validate()` available. Partial documents follow
the candidate-validation and standalone-validation restrictions in **Selected Documents** above.

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
`filePath` is exact for Premium and a `databaseNamePrefix` for RxDB trial backends
(which append a `_trial_<databaseName>` suffix). It defaults to `':memory:'`, which is
volatile-only: genuine in-memory storage with `allowMemoryFallback: true`, rejected otherwise.

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
(`$eq`, `$gt`, `$gte`, `$lt`, `$lte`, `$ne`, `$in`, `$nin`, `$exists`) pass
through. `null` and other non-object filters, invalid top-level operators, unsupported field operators, malformed logical arrays,
dangerous keys (`__proto__`, `prototype`, `constructor`), excessive nesting, and excessive logical
array width throw `QueryFilterError`; rejected filters are never broadened to `{}`.

Request-derived regex is rejected: every `RegExp` value and `$regex` / `$options` operator throws
`QueryFilterError` before native execution, regardless of pattern size or simplicity. The builder's
`.regex()` records intent but fails at execution. This replaces the former bounded heuristic;
trusted schema `match` and custom validators keep working.

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

| Mongoose concept          | Implementation in this package                                                               |
| ------------------------- | -------------------------------------------------------------------------------------------- |
| Schema definition         | `Schema` → `convertToRxJsonSchema` (Draft-07 `RxJsonSchema`)                                 |
| Casting & validation      | `castDocumentToSchema` + `Document.validate()` (schema-level rules)                          |
| Middleware (`pre`/`post`) | `MiddlewareEngine`, mapped onto Model/Query/Document ops                                     |
| Document methods          | `Schema.methods`, attached to hydrated `Document` instances                                  |
| Statics                   | `Schema.statics`, attached to the compiled `Model`                                           |
| Virtuals                  | `Schema.virtual(...)` getters/setters on `Document`                                          |
| Query builder             | `Query` → `compileQuery` → RxDB Mango query via `RxCollectionAdapter`                        |
| Dirty tracking            | Leaf set/unset diffs, explicit subtree/whole-array replacements, projection safety on `save` |
| Storage                   | `Connection` + `createSqliteDatabase` / `createMemoryDatabase`                               |

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
