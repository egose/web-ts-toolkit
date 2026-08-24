import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { Connection, Schema } from '../src/index';
import { createMemoryDatabase, createSqliteDatabase, SqliteStorageError } from '../src/storage/index';

interface ContractDoc {
  name: string;
  n: number;
}

const tempDirs: string[] = [];
let unique = 0;

afterEach(() => {
  while (tempDirs.length) rmSync(tempDirs.pop()!, { recursive: true, force: true });
});

describe('MRX-11 real adapter contract', () => {
  it('passes the metadata-free count and bulk insertion contract under memory storage', async () => {
    await runContract('memory', () => createMemoryDatabase({ name: `mrx11_memory_${nextSuffix()}` }));
  });

  it('passes the metadata-free count and bulk insertion contract under SQLite when available', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'mrx11-sqlite-'));
    tempDirs.push(dir);
    await runContract('sqlite', () =>
      createSqliteDatabase({ name: `mrx11_sqlite_${nextSuffix()}`, filePath: join(dir, 'contract.db') }),
    );
  }, 20_000);
});

async function runContract(label: string, factory: () => Promise<any>): Promise<void> {
  const conn = new Connection();
  try {
    await conn.connect(factory);
  } catch (error) {
    if (label === 'sqlite' && error instanceof SqliteStorageError) {
      expect(error.causes.some((cause) => cause.backend === 'memory')).toBe(false);
      console.warn(
        '[mrx11] no supported SQLite backend available; verified fail-closed behavior and skipped SQLite adapter contract',
      );
      return;
    }
    throw error;
  }

  try {
    const suffix = nextSuffix();
    const schema = new Schema<ContractDoc>({ name: String, n: Number });
    const Model = conn.model<ContractDoc>(`Mrx11${label}${suffix}`, schema, `mrx11_${label}_${suffix}`);
    const docs = Array.from({ length: 25 }, (_, index) => ({
      _id: `${label}-${index}`,
      name: `User ${index}`,
      n: index,
    }));

    const inserted = await Model.insertMany(docs);
    const count = await Model.countDocuments({ n: { $gte: 0 } }).exec();
    const lean = await Model.findOne({ _id: docs[0]._id } as any)
      .lean()
      .exec();
    const hydrated = await Model.findById(docs[1]._id);

    expect(inserted).toHaveLength(25);
    expect(count).toBe(25);
    expect(lean).toEqual({ _id: docs[0]._id, name: docs[0].name, n: docs[0].n });
    expect(lean).not.toHaveProperty('_rev');
    expect(lean).not.toHaveProperty('_meta');
    expect(lean).not.toHaveProperty('_attachments');
    expect(lean).not.toHaveProperty('_deleted');
    expect(hydrated?.toObject()).toEqual({ _id: docs[1]._id, name: docs[1].name, n: docs[1].n });
  } finally {
    await conn.disconnect();
  }
}

function nextSuffix(): string {
  unique += 1;
  return `${Date.now()}_${unique}`;
}
