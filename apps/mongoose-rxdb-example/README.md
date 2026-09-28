# Mongoose-RxDB Example

A standalone Node CLI that exercises `@web-ts-toolkit/mongoose-rxdb` end-to-end: schema definition,
casting, validation, middleware (`pre`/`post`), virtuals, instance + static methods, the chainable
thenable query builder, dirty-tracking on `save()`, `updateOne`/`countDocuments`, explicit `_id`
handling, and `sanitizeFilter` for query-selector injection defense.

It defaults to RxDB's **in-process memory storage** on Node 22+, with no database setup.
Set `MRXDB_STORAGE=sqlite` to request persistent SQLite using `./app.db`:

```bash
MRXDB_STORAGE=sqlite pnpm --filter mongoose-rxdb-example dev
```

Backend resolution tries licensed RxDB Premium first, then RxDB's free **trial** storage using
Node's built-in `node:sqlite`, then optional npm `sqlite3`. Premium is needed for production-grade
SQLite, not for this evaluation demo. Trial storage has no indexes/attachments, an approximately
500-document cap, and prints warnings. Premium uses the exact file path; trial storage creates
collection files from the `app.db_trial_demo` prefix in the process working directory.
The request fails if no SQLite backend opens; this demo does not opt into volatile memory fallback.

## Run

```bash
pnpm install
pnpm --filter mongoose-rxdb-example dev
```

You should see a logged walkthrough: create → find → static method → dirty save → updateOne →
explicit `_id` → `sanitizeFilter` → cleanup.

`main()` disconnects in `finally`, including after validation, middleware, and storage errors.
The walkthrough deletes demo records on success; errors can leave previously persisted records,
because the workflow is not a transaction. Run against a dedicated demo database.

## Files

- `src/index.ts` — `main()` owns connection cleanup; `runDemo()` tours the core API using canonical
  package-root and `/storage` named imports. See the package README for projection/save safety,
  `ParallelSaveError`, and conditional mutation/upsert concurrency contracts.
