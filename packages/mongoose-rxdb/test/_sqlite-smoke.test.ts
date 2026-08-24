import { describe, it, afterAll, expect } from 'vitest';
import { Connection } from '../src/index';
import { createSqliteDatabase, SqliteStorageError } from '../src/storage/index';
import { join } from 'node:path';
import { rmSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import { cleanupTrackedChildren, runChecked } from './support/subprocess';
import { writeProjectFile } from './support/temp';

const TMP_DIR = join(process.cwd(), '.sqlite-smoke-tmp');
const DB_PATH = join(TMP_DIR, 'smoke.db');
const PACKAGE_ROOT = join(__dirname, '..');

afterAll(async () => {
  try {
    rmSync(TMP_DIR, { recursive: true, force: true });
  } catch {
    // ignore cleanup errors
  }
  await cleanupTrackedChildren();
});

describe('createSqliteDatabase (trial)', () => {
  it('writes SQLite files and reopens data in a second process when a backend is available', async () => {
    // The trial SQLite driver needs the parent dir to exist before open().
    const { mkdirSync, existsSync, readdirSync, statSync, rmSync } = await import('node:fs');
    if (!existsSync(TMP_DIR)) mkdirSync(TMP_DIR, { recursive: true });

    const conn = new Connection();
    try {
      await conn.connect(() => createSqliteDatabase({ name: 'smoke', filePath: DB_PATH }));
    } catch (error) {
      if (error instanceof SqliteStorageError) {
        expect(error.causes.some((cause) => cause.backend === 'memory')).toBe(false);
        console.warn(
          '[smoke] no SQLite backend could be opened; verified fail-closed behavior and skipped persistence check',
        );
        return;
      }
      throw error;
    }

    const storageInfo = conn.ready().sqliteStorageInfo;
    expect(storageInfo.backend).not.toBe('memory');
    expect(storageInfo.filePath).toBe(DB_PATH);
    expect(storageInfo.persistent).toBe(true);

    const schema = new (await import('../src/index')).Schema({
      name: { type: String, required: true },
      age: { type: Number, default: 0 },
      born: Date,
    });
    const User = conn.model('Smoke', schema, 'smoke_users');
    await User.create({ name: 'Alice', age: 30, born: new Date('2000-01-02T03:04:05.000Z') });
    await User.create({ name: 'Bob', age: 22, born: new Date('2001-02-03T04:05:06.000Z') });
    await conn.disconnect();

    // Premium uses DB_PATH directly; trial backends derive collection-specific files from that prefix.
    const files = readdirSync(TMP_DIR);
    if (files.length === 0) {
      throw new Error(`[smoke] ${storageInfo.backend} was supposed to write files under ${TMP_DIR} but found none`);
    }
    if (storageInfo.backend === 'premium') expect(files).toContain('smoke.db');
    else expect(files.some((file) => file.includes('smoke.db'))).toBe(true);
    const totalBytes = files.reduce((sum, f) => {
      try {
        return sum + statSync(join(TMP_DIR, f)).size;
      } catch {
        return sum;
      }
    }, 0);
    if (totalBytes === 0) {
      throw new Error('[smoke] SQLite files existed but were empty');
    }
    writeProjectFile(
      TMP_DIR,
      'reopen.mjs',
      `import { Connection, Schema } from ${JSON.stringify(pathToFileURL(join(PACKAGE_ROOT, 'dist', 'index.mjs')).href)};
import { createSqliteDatabase } from ${JSON.stringify(pathToFileURL(join(PACKAGE_ROOT, 'dist', 'storage', 'index.mjs')).href)};

const conn = new Connection();
await conn.connect(() => createSqliteDatabase({ name: 'smoke', filePath: ${JSON.stringify(DB_PATH)} }));
const schema = new Schema({ name: { type: String, required: true }, age: { type: Number, default: 0 }, born: Date });
const User = conn.model('Smoke', schema, 'smoke_users');
const count = await User.countDocuments({}).exec();
const alice = await User.findOne({ name: 'Alice' }).exec();
await conn.disconnect();
if (count !== 2) throw new Error('expected 2 reopened docs, got ' + count);
if (!(alice?.born instanceof Date)) throw new Error('expected reopened date to hydrate as Date');
if (alice.born.toISOString() !== '2000-01-02T03:04:05.000Z') throw new Error('unexpected reopened date ' + alice.born);
`,
    );
    await runChecked('node', ['reopen.mjs'], { cwd: TMP_DIR, timeoutMs: 15_000 });
    console.log(`[smoke] ${storageInfo.backend} wrote ${files.length} files, ${totalBytes} bytes:`, files);
    rmSync(TMP_DIR, { recursive: true, force: true });
  }, 15_000);
});
