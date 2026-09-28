# `@web-ts-toolkit/mongoose-rxdb`

A Mongoose-like API (`Schema`, `Document`, `Query`, `Model`, `Connection`, pre/post middleware)
backed by **RxDB** so your data lives in local SQLite (or any RxDB storage).
It supports a deliberate Mongoose-shaped subset; MongoDB transaction and uniqueness guarantees do not apply.

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
The package-root default is the full api object; the storage subpath default is `createMemoryDatabase`.

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

## TypeScript Contract

Use `Schema<RawDoc, Methods, Statics, Virtuals>` as the source of truth for the public model type. `Connection#model()` infers the same raw document, instance methods, statics, and virtuals from that schema, so callers do not need a broad model cast.

- `RawDocument<T>` and `LeanResult<T>` contain only domain fields plus the logical `_id`; RxDB metadata fields are not part of the public result surface.
- Hydrated reads and writes return `HydratedDocument<T, Methods, Virtuals>`, which combines `Document<T>`, raw fields, instance methods, and virtual properties.
- Lean queries return `LeanResult<T>` records without document methods; hydrated queries return document methods plus raw fields. Lean only transforms document-producing results: `UpdateResult`, `DeleteResult`, and `countDocuments()` numbers pass through unchanged, and `.lean(false)` restores the pre-lean hydrated type so toggling back does not leave a false lean type. `findOneAndUpdate(..., { lean: true })` and `findOneAndDelete(..., { lean: true })` return `LeanResult<T> | null`; omission/`lean: false` returns hydrated documents. Nullable document results preserve `null`.
- Projected lean records are still typed as the full `LeanResult<T>`; omitted fields and redacted `null` array slots are a documented type limitation, not a narrowed partial.
- `Query<Result>` is `PromiseLike<Result>`, so `await User.find()` and `await User.findOne()` preserve exact result types without `.exec()`.
- Intentionally public thrown errors are importable from the package root for `instanceof` narrowing: `WriteNormalizationError`, `ParallelSaveError`, `MutationPartialFailureError`, and `BulkWritePartialFailureError` (plus `QueryFilterError`, `QueryOptionError`, `MutationOptionError`, `ValidationError`, `SchemaConfigurationError`). Blocked deep imports are not required:

```ts
import {
  BulkWritePartialFailureError,
  MutationPartialFailureError,
  ParallelSaveError,
  WriteNormalizationError,
} from '@web-ts-toolkit/mongoose-rxdb';
```

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
  path (`sqliteDatabasePath`), while RxDB trial backends receive it as `databaseNamePrefix` and
  create collection-specific files from that prefix (prefix plus a `_trial_<databaseName>` suffix,
  so on-disk names differ from the requested path). `filePath` defaults to `':memory:'`, which is
  volatile-only: it selects genuine in-memory storage when `allowMemoryFallback: true` is passed and
  is rejected otherwise, because trial SQLite backends would open an ordinary relative file such as
  `:memory:_trial_<databaseName>` instead of SQLite's special in-memory name. Only the memory
  backend reports `persistent: false`; every SQLite backend reports `persistent: true`. The returned
  database exposes `sqliteBackend` and `sqliteStorageInfo` so callers can inspect the selected
  backend, requested path, persistence flag, and fallback causes.

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
(`$eq`, `$gt`, `$gte`, `$lt`, `$lte`, `$ne`, `$in`, `$nin`, `$exists`) pass
through. `null` and other non-object filters, invalid top-level operators, unsupported field operators, malformed logical arrays,
dangerous keys (`__proto__`, `prototype`, `constructor`), excessive nesting, and excessive logical
array width throw `QueryFilterError`; rejected filters are never broadened to `{}`.

Request-derived regex is rejected: any `RegExp` value or `$regex` / `$options` operator in a
request filter throws `QueryFilterError` before any native regex is constructed or executed,
regardless of pattern simplicity or length. This replaces the previous bounded-policy heuristic,
which a grouped variant such as `^((a+))+$` bypassed. Trusted schema validators (`match`,
custom `validate`) are unrelated to this request-filter policy and keep working. The query
builder's `.regex()` records its intent but fails at `exec()` before any adapter call.

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
Required tuples, enum arrays, and custom validator configuration objects are owned and sealed on
compiled paths, including nested/array-item paths. Caller-owned rule containers are not frozen.
Clones have editable independent rules; methods/hooks and callback closure state remain mutable behavior.

Literal defaults have a separate data-copy boundary. Schema construction, `add()`, cloning and model
compilation own arrays, plain/null-prototype objects and Dates after bounded structural preflight;
cyclic, over-depth/over-work, sparse or accessor-bearing literals throw `WriteNormalizationError`
before recursive copying. Default factories are not executed by schema copying. Nonplain defaults
retain their kind until a needed default reaches schema-aware casting: mixed Map/Set/class values
reject before writes, while supported string/number coercions still work. Those opaque coercion
objects and factory callbacks remain application-owned shared behavior; resulting document data is
independently owned. Whole-document input/default/output budgets still apply when defaults are used.

Accepted schema options are intentionally narrow and have tested behavior:

- Schema options: `_id`, `collection`, `validateBeforeSave`.
- Path options: `type`, `required`, `default`, `enum`, `min`, `max`, `match`, `validate`, `immutable`, `index`.

Unsupported Mongoose options fail early with `SchemaConfigurationError` instead of being ignored. This
includes `timestamps`, `versionKey`, path `get` / `set`, `alias`, `select`, `ref`, `auto`, `sparse`,
`expires`, and `unique`. `unique` is not a backend-safe uniqueness guarantee in this package; use
`index: true` only as a storage-dependent lookup hint, and enforce uniqueness in an application or
backend layer that can provide an atomic constraint.

Nested structure requires an explicit child `Schema` (`{ profile: childSchema }`,
`{ profile: { type: childSchema } }`, `[childSchema]` for subdocument arrays). Inline nested
plain-object definitions (`{ profile: { name: String } }`, `{ profile: { type: { name: String } } }`),
dotted path names (`{ 'profile.name': String }`), and prefixed `schema.add(obj, prefix)` are rejected
with `SchemaConfigurationError` before collection creation: they previously compiled to unstructured
objects or literal dotted fields whose casting, validation, and generated schemas disagreed. Full
Mongoose nested syntax is intentionally not supported.

Function-valued `required` (including the `[fn, message]` form) is evaluated dynamically by document
validation — `this` is the owning document for root paths and the plain subdocument for nested paths —
and is never emitted as an unconditional entry in public JSON Schema or RxDB `required` lists, which
can only express static requirements. Static `required: true` and `[true, message]` still appear in
both schemas and agree with validation.

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
failed writes retain their modified paths so a later retry can persist the same changes.

### In-Flight Saves (Compatibility / Migration)

Each save captures owned data and per-path replacement intent **after validation and pre-save hooks**,
before persistence. Changes made before capture join that save. Changes made after capture (including
scalar/live nested edits, assignments, `set()`, and `markModified()`) remain on the live document for a
later save; they do not alter the captured write. A successful write advances the snapshot to the
captured data and consumes only captured intent. Marking the same path again creates fresh intent even
when its value is unchanged. Equal/reverted values still produce no write; that marker controls
replacement if the path subsequently changes before the next save. An unchanged save consumes its
captured clean markers without writing. `clearModified()` explicitly discards current markers; it does
not discard structural differences.

Plain-object live edits merge by changed leaf. Explicit parent assignment, `set('parent', value)`,
`set('parent.nested', value)`, and `markModified('parent')` replace the changed subtree. Complete arrays
are whole-array, last-writer-wins writes. Projection completeness checks still apply to every save.

**Await each save on an instance before calling save again.** An overlapping call rejects with the
root-exported `ParallelSaveError` before collection resolution, validation, hooks, or writes. The guard
covers the entire active operation, including success/error post hooks; a recursive save from a hook
also rejects. Rejected overlaps run no hooks and do not cancel or change the active save. The guard
releases on both success and failure. Distinct document instances retain their existing leaf-merge /
last-writer-wins semantics; this is not cross-instance locking.

Validation/save hooks retain once-per-operation semantics (validation hooks are skipped when
`validateBeforeSave: false`); final merged-candidate validation remains inside the adapter retry boundary.
A failed write retains captured and later intent for retry. A **post-save hook failure after a successful
write does not undo persistence**: the snapshot has advanced and a newly inserted document has
`isNew === false`. Post-hook edits remain pending. Retry after settlement saves remaining edits without
reinserting the record. Successful `save()` returns the live document, which may already contain later
unsaved edits. Migration: replace same-instance `Promise.all([doc.save(), doc.save()])` with awaited saves.

### Document Value Safety (Compatibility / Migration)

Construction, `create`, `insertMany`, direct schema-property assignment, and both forms of `set()`
check values **before cloning or casting**. Invalid values throw the root-exported
`WriteNormalizationError`. Mixed/unshaped object data supports finite JSON primitives, dense arrays,
plain objects (including null-prototype objects), and valid `Date` instances. Mixed Map/Set/class
instances, functions, symbols, bigint, non-finite numbers, nested `undefined`, sparse arrays,
enumerable accessors/symbol keys, and dangerous keys reject instead of being dropped or becoming `{}`.

- Schema casts retain their converter semantics: numeric strings to numbers, `"false"` to false,
  bigint to a declared string/number, and compatible boxed/custom scalar values remain supported.
  Invalid casts reject immediately. Scalar array elements follow the converter policy: objects/arrays
  require an object/mixed/subdocument element schema. Dotted setters cast against the addressed path.
  Snapshots/serialization also normalize live nested scalar edits against their declared schema path.
- `undefined` means absent for declared schema fields, including subdocument fields; it is not valid
  inside mixed JSON objects or array elements. Dates remain owned `Date` values in documents and become
  ISO strings in storage. Inputs and snapshots do not retain caller aliases.
- Traversal allows at most **50 levels and 2,000 visited values**, counting the root at depth zero and
  each repeated reference separately. Raw document/setter inputs and complete resulting documents
  (including `_id`) are bounded as a whole, not independently per property. Needed default-factory
  results share the casting operation's budgets; overridden defaults are not evaluated. Insert
  conversion enforces the same whole-input-plus-default and whole-output budgets, including defaults
  first needed after `toObject()` omits explicit `undefined`, pre-save hooks, or default-enabled upserts. These are
  structural limits, not byte limits or a sandbox for application factories/coercion/virtual callbacks.
- Setters stage all changes, including dotted traversal and virtual-setter data changes. Rejection
  restores document data and dirty intent. External side effects of application callbacks cannot be
  rolled back. `create([...])` prepares all entries including late insert defaults, and `insertMany`
  prepares all entries in either ordered mode, before
  writes; invalid ingress anywhere in either batch causes no writes. Later middleware, validation, or
  storage failures retain their existing non-transactional behavior. Limits apply per batch document.
- Live nested mutations remain supported. If they introduce invalid values, serialization, dirty
  comparisons, and save reject before recursive cloning/comparison or adapter mutation, even with save
  validation disabled. Remove/correct the invalid live value before retrying.

**Migration:** values that previously lost prototypes or silently stringified invalid array elements
now reject at ingress. Oversized insert-time defaults now reject before writes instead of producing
records that fail hydration or a batch error after insertion. Literal defaults no longer lose their
kind during schema cloning/model compilation; unsupported mixed defaults reject rather than storing
`{}` or prototype-erased objects. Invalid literal structure can now reject during schema construction
or copying, even if a later document would override that default. The same bounded checks protect
`castDocumentToSchema` and `castValue`.

### Saving Selected Documents (Compatibility / Migration)

Hydrated `find()` / `findOne()` results retain private, immutable selection metadata. A projection
describes what was read, not permission to replace hidden data. The partial-save contract is deliberately
narrow:

- Keep `_id` selected (it is included by default). Saving a loaded record without `_id` throws
  `WriteNormalizationError` before mutation, even when unchanged. No replacement identity is generated.
- Selected scalar edits and in-place plain-object leaf edits merge into current storage. Hidden
  optional, required, immutable, and defaulted fields are preserved. Successful saves do not fetch those
  fields into the public document, its hooks, `toObject()`, or `toJSON()`.
- A changed array replaces the **whole array**. If any part of that array was projected out, all array
  changes reject with `WriteNormalizationError`, including edits to a visible element, pushes, removals,
  and numeric-index setters. Array identity/index merging is never inferred.
- Explicit top-level assignment, `set('parent', value)`, or `markModified('parent')` means whole-subtree
  replacement when changed. Such writes (including `null`/unset) reject if the subtree is incomplete.
  The same restriction applies when an edit would create an incomplete parent or write an unselected
  field. Select the whole parent (`'profile'`, not just `'profile.name'`) before replacing it.
  For nested replacement intent, use `set()` or `markModified()`; direct mutations inside a plain
  object follow the leaf-diff contract.
- Completeness is conservative: an exclusion below a subtree makes replacement unsafe even if the
  excluded path happened to be absent; listing individual child fields does not prove the parent
  complete. Empty projections retain full-record behavior. Unchanged projected records with `_id`
  skip mutation. These safety checks also apply with `validateBeforeSave: false`.

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

For example, with a `profile` child schema containing `name` and private fields:

```ts
const selected = await User.findOne({ _id: userId }).select('profile.name');
if (selected) {
  selected.set('profile.name', 'Grace'); // leaf edit; preserves hidden siblings
  await selected.save();
  // selected.set('profile', { name: 'Grace Hopper' }) followed by save() rejects.
}
```

With save validation enabled, partial saves run `validate` and `save` middleware once on the redacted
document. Schema validation is deferred until the full candidate (current storage plus this save's
delta) is available inside the adapter's retry boundary. Required and cross-field rules therefore see
the actual candidate, with no default synthesis. An unchanged partial save has no candidate to validate.
Standalone `validate()` / `validateSync()` on a nonempty projection cannot certify a full record:
they reject / return `ValidationError` with `kind: 'projection'`. Reload without `select()` for
standalone validation, or use the validated save path. Hooks that themselves call standalone validation
must account for this restriction.

**Migration:** older versions could silently erase hidden fields when saving redacted arrays or
replacing partial objects. Reload the whole affected subtree before such replacements; retain dotted
leaf edits for partial objects. Defaults are no longer reapplied while validating or diffing loaded
records: fields omitted by projection or `setDefaultsOnInsert: false` stay absent on later saves, and
explicitly unsetting a loaded defaulted field does not restore its default. Projected-document setters
also suppress recursive defaults. New-document default application is unchanged.
Projected arrays now use explicit `null` slots instead of holes (and whole-index exclusions no longer
compact indexes), so multi-element numeric/missing-field projections can hydrate and safely save.

### Conditional Mutation Selectors (Compatibility / Migration)

Updates recheck the compiled selector using RxDB's own matcher against the current record on every
native conflict retry. Reads and mutation rechecks therefore share RxDB semantics for the supported
filter subset:

- Scalar `$eq` and `$in` can match elements of an array; `$nin` fails if an array contains a forbidden
  element. An array-valued `$eq` retains native array equality semantics.
- Equality / `$in` with `null` also match missing fields; `$ne: null` and `$nin: [null]` exclude both
  null and missing. Use `$exists` to distinguish a present null from an absent field.
- Dotted selectors traverse nested objects and arrays; numeric segments address array indexes.
- Ordinary strings, including date-looking strings with offsets, retain native string comparison.
  `Date` filter operands normalize to stored ISO strings before both reads and rechecks; strings are
  not implicitly parsed as dates by the matcher.

For updates without `upsert`, a selected record that loses its predicate returns `matchedCount: 0` /
`modifiedCount: 0`, or `null` for `findOneAndUpdate`. No alternative record is selected. Successful
counts and before/after values come from the successful retry's current state. For a conditional
claim, use `_id` plus the expected state (for example, `tags: { $nin: ['blocked'] }`) and treat no-match
as a lost claim. Multi-record mutations remain per-record, non-transactional operations.

Deletes use the same matcher for a **best-effort** check immediately before native removal. A writer
can still change the record between that check and removal; this does not provide atomic conditional
delete. Unsupported filters, including request regex, still reject during compilation before persistence.
Direct adapter callers must supply compiled queries (use `compileQuery`), just as model queries do.
`findOneAndDelete` returns an observed preimage, not an atomic delete-time snapshot. For state-sensitive
workflows, prefer a conditional update to a terminal/soft-deleted state with `upsert: false`, then perform
physical cleanup under application coordination. A prior read or an `_id` filter alone cannot lock a delete.

**Migration:** older mutation rechecks used a separate matcher that could disagree with reads for
arrays, null/missing fields, dotted paths, and date-looking strings. Conditional updates now follow
native RxDB matching, including losing a `$nin` claim when a concurrent writer adds a forbidden member.

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

Unordered duplicate IDs retain first-occurrence priority and original input-index error attribution.
Each occurrence is attempted; later duplicates normally receive native primary-key conflicts. Native bulk
passes contain unique IDs, so their count is the maximum frequency of an ID. Partitioning uses linear
dictionary work, but duplicate-heavy batches still require those passes; this is not a throughput guarantee.

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

### Upsert Concurrency And Business Identity

`upsert: true` on `updateOne` / `findOneAndUpdate` means **update, then separately insert if there
is no write-time match**. It is not a transaction or atomic secondary-key uniqueness constraint.
The insert branch also runs when a selected candidate loses its predicate inside a native conflict
retry. There is no alternate-record selection, read-before-insert uniqueness check, or automatic
retry-as-update after an insert conflict.

Deterministically gated native-memory and persistent trial-SQLite tests establish these outcomes:

| Interleaving                                                          | Outcome                                                                                                                    |
| --------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------- |
| Both calls observe no match; generated IDs                            | Both can insert, with distinct IDs and the same business key.                                                              |
| Both calls observe no match; same explicit `_id` equality             | One inserts; the other rejects with the native insert conflict. The losing update is not applied.                          |
| Selected record loses its predicate during retry; generated ID        | The selected record keeps the competing change; the upsert inserts a new record, even if another record is still eligible. |
| Selected record loses its predicate during retry; same explicit `_id` | The insert attempts the occupied ID and rejects; the competing change survives and no alternate record is updated.         |

Which concurrent caller wins is not guaranteed. Conflicts observed with RxDB 17 use `code: 'CONFLICT'`;
they propagate as native errors, not a new package-owned duplicate-key error. Other validation/backend
failures can also reject. Evidence covers native memory and `trial-native`, not Premium or replication.

A successful `updateOne` insertion returns `matchedCount: 0`, `modifiedCount: 0`, `upsertedCount: 1`,
and `upsertedId`. `findOneAndUpdate` defaults to `returnDocument: 'before'` and returns **null even
when it inserted**; choose `'after'` / `new: true` for the inserted record (lean if requested).
Inserts are built from equality fields plus the update, not from the lost candidate's snapshot.
Other predicates are not enforced on the inserted result: an update may change an equality field,
and range/membership predicates do not supply initial values. An inserted record need not match
the original filter. Defaults and validation follow the insert contract above.

Application guidance:

- Assign one stable, canonical `_id` per business entity, including tenant/key scope, and supply it
  as a direct equality filter (`{ _id: entityId }` or `{ _id: { $eq: entityId } }`). Equalities nested
  inside `$and`/`$or` are not extracted for insertion. All writers must use the same mapping. This
  uses native primary-key conflict enforcement, not a unique constraint on another field.
- A stable ID prevents two successful inserts at that ID; it does **not** turn conditional upsert
  into a transaction. An existing record with the same ID but a different state can cause a conflict
  even without concurrent calls. After conflict, reload and decide whether the existing state meets
  the business request; do not blindly replay non-idempotent updates such as `$inc`.
- Serialize entity creation/read-decision-write workflows by business key when exactly one local
  creator is needed. The queue/lock must cover every participating writer; an in-process lock does
  not coordinate other processes, tabs, devices, or replication. Use an authoritative backend with
  atomic constraints/transactions when coordination must extend beyond that boundary. A separate
  existence read is not a uniqueness guarantee. Use an identity-only creation filter; a state filter
  changed by the update can cause repeated insertion even in a serialized workflow.
- For claims and conditional transitions, use `_id` plus expected state with **`upsert: false`**
  (the default). Treat zero matches / null as a lost claim. Separate entity creation from claiming:

```ts
const claim = await Jobs.updateOne({ _id: jobId, state: 'ready' }, { $set: { state: 'claimed' } }, { upsert: false });
if (claim.matchedCount === 0) {
  // Missing or no longer eligible; do not create a replacement job here.
}
```

**Compatibility / migration:** upsert semantics are characterized, not expanded. Replace assumptions
of atomic find-or-create or claim-with-upsert with the explicit identity/coordination contract above.

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

Full-record validation recurses through nested `Schema` paths and arrays of subdocuments. Errors are aggregated
into one package-owned `ValidationError` with an `errors` map keyed by full logical paths such as
`profile.name` or `members.0.role`. Conditional `required` functions and custom validators run with
`this` bound to the owning document for root paths, and to the plain subdocument object for nested
schema paths and subdocument-array items.

`validateBeforeSave` is honored: full-document `save()` runs `validate()` first by default, while schemas created
with `{ validateBeforeSave: false }` skip automatic save validation but still support explicit
`doc.validate()`. Partial records use the candidate-validation contract in **Saving Selected Documents** above.

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
