# Mongoose-RxDB Example

A standalone Node CLI that exercises `@web-ts-toolkit/mongoose-rxdb` end-to-end: schema definition,
casting, validation, middleware (`pre`/`post`), virtuals, instance + static methods, the chainable
thenable query builder, dirty-tracking on `save()`, `updateOne`/`countDocuments`, explicit `_id`
handling, and `sanitizeFilter` for query-selector injection defense.

It runs against RxDB's **in-process memory storage**, so it starts anywhere with no database setup.
Swap `createMemoryDatabase(...)` for `createSqliteDatabase({ filePath: './app.db' })` to persist to
local SQLite (requires `rxdb-premium` + an access token — see the package README).

## Run

```bash
pnpm install
pnpm --filter mongoose-rxdb-example dev
```

You should see a logged walkthrough: create → find → static method → dirty save → updateOne →
explicit `_id` → `sanitizeFilter` → cleanup.

## Files

- `src/index.ts` — the full demo. The `main()` function is a commented tour of every public
  feature in the package; read it top-to-bottom as a runnable usage guide.
