import { describe, it, afterAll } from 'vitest';
import { Connection } from '../src/index';
import { createSqliteDatabase } from '../src/storage/index';
import { join } from 'node:path';
import { rmSync } from 'node:fs';

const TMP_DIR = join(process.cwd(), '.sqlite-smoke-tmp');
const DB_PATH = join(TMP_DIR, 'smoke.db');

afterAll(() => {
  try {
    rmSync(TMP_DIR, { recursive: true, force: true });
  } catch {
    // ignore cleanup errors
  }
});

describe('createSqliteDatabase (trial)', () => {
  it('writes a real SQLite file when node:sqlite is available', async () => {
    let backend: 'sqlite3' | 'node:sqlite' | 'memory-only';
    try {
      await (
        await import(['node', 'sqlite'].join(':'))
      ).DatabaseSync;
      backend = 'node:sqlite';
    } catch {
      try {
        const specifier = 'sqlite3';
        await import(specifier);
        backend = 'sqlite3';
      } catch {
        backend = 'memory-only';
      }
    }

    // The trial SQLite driver needs the parent dir to exist before open().
    const { mkdirSync, existsSync, readdirSync, statSync, rmSync } = await import('node:fs');
    if (!existsSync(TMP_DIR)) mkdirSync(TMP_DIR, { recursive: true });

    const conn = new Connection();
    await conn.connect(() => createSqliteDatabase({ name: 'smoke', filePath: DB_PATH }));

    const schema = new (await import('../src/index')).Schema({
      name: { type: String, required: true },
      age: { type: Number, default: 0 },
    });
    const User = conn.model('Smoke', schema, 'smoke_users');
    await User.create({ name: 'Alice', age: 30 });
    await User.create({ name: 'Bob', age: 22 });
    await conn.disconnect();

    if (backend === 'memory-only') {
      console.warn('[smoke] no SQLite driver, fell back to memory; skipping file check');
      return;
    }

    // The trial SQLite creates one .db file per collection with a `_trial_<dbname>` suffix.
    const files = readdirSync(TMP_DIR);
    if (files.length === 0) {
      throw new Error(`[smoke] ${backend} was supposed to write files under ${TMP_DIR} but found none`);
    }
    const totalBytes = files.reduce((sum, f) => {
      try {
        return sum + statSync(join(TMP_DIR, f)).size;
      } catch {
        return sum;
      }
    }, 0);
    console.log(`[smoke] ${backend} wrote ${files.length} files, ${totalBytes} bytes:`, files);
    if (totalBytes === 0) {
      throw new Error('[smoke] SQLite files existed but were empty');
    }
    rmSync(TMP_DIR, { recursive: true, force: true });
  }, 15_000);
});
