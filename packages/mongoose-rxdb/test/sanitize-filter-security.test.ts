import { afterAll, describe, expect, it } from 'vitest';
import { Connection, Query, QueryFilterError, sanitizeFilter, Schema, translateFilter } from '../src/index';
import { createMemoryDatabase } from '../src/storage/index';
import { cleanupTrackedChildren, runSubprocess } from './support/subprocess';
import { FakePersistenceAdapter } from './support/fake-adapter';
import { packageRoot } from './support/packed-consumer';

interface UserDoc {
  name: string;
  age: number;
  role: string;
}

afterAll(async () => {
  await cleanupTrackedChildren();
});

function createFakeModel(adapter: FakePersistenceAdapter) {
  const schema = new Schema<UserDoc>({ name: String, age: Number, role: String });
  return {
    schema,
    collection: adapter,
    resolveCollection: () => Promise.resolve(adapter),
    mw: { exec: (_op: string, _target: unknown, next: () => unknown) => next() },
  };
}

function nestedLogicalFilter(depth: number): any {
  let filter: any = { name: 'Ada' };
  for (let index = 0; index < depth; index += 1) filter = { $and: [filter] };
  return filter;
}

const rejectedPayloads: Array<[string, () => any]> = [
  ['unknown top-level $where', () => ({ $where: 'evil()' })],
  ['unknown top-level $func', () => ({ $func: 'evil()' })],
  ['null JSON filter', () => null],
  ['nested unsupported operator', () => ({ name: { $where: 'evil()' } })],
  ['malformed $and object', () => ({ $and: { name: 'Ada' } })],
  ['empty $or array', () => ({ $or: [] })],
  ['malformed $nor operand', () => ({ $nor: [null] })],
  ['dangerous own __proto__ key', () => JSON.parse('{"__proto__":{"polluted":true},"name":"Ada"}')],
  ['dangerous nested constructor key', () => ({ meta: JSON.parse('{"constructor":{"prototype":{"polluted":true}}}') })],
  ['excessive logical depth', () => nestedLogicalFilter(25)],
  ['excessive logical width', () => ({ $or: Array.from({ length: 51 }, () => ({ name: 'none' })) })],
  ['invalid regex flag', () => ({ name: { $regex: 'Ada', $options: 'g' } })],
  ['duplicate regex flag', () => ({ name: { $regex: 'Ada', $options: 'ii' } })],
  ['over-budget regex pattern', () => ({ name: { $regex: 'a'.repeat(129) } })],
  ['pathological regex pattern', () => ({ name: { $regex: '^(a+)+$' } })],
];

describe('MRX-02 filter sanitization security', () => {
  it('normalizes accepted filters into null-prototype objects', () => {
    const safe = sanitizeFilter({
      $or: [{ name: 'Ada' }, { age: { $gte: 18 } }],
      meta: { theme: 'dark' },
    } as any) as any;

    expect(Object.getPrototypeOf(safe)).toBeNull();
    expect(Object.getPrototypeOf(safe.$or[0])).toBeNull();
    expect(safe.$or[0].name).toBe('Ada');
    expect(safe.$or[1].age.$gte).toBe(18);
    expect(safe.meta.$eq.theme).toBe('dark');
    expect(Object.getPrototypeOf(safe.meta.$eq)).toBeNull();
  });

  it.each(rejectedPayloads)('rejects %s with QueryFilterError', (_label, makePayload) => {
    expect(() => sanitizeFilter(makePayload())).toThrow(QueryFilterError);
  });

  it('translateFilter rejects unsupported operators when sanitization is bypassed', async () => {
    expect(() => translateFilter({ age: { $foo: 1 } } as any)).toThrow(QueryFilterError);

    const adapter = new FakePersistenceAdapter([{ _id: 'u1', name: 'Ada', age: 36, role: 'admin' }]);
    const model = createFakeModel(adapter);
    const query = new Query<any[], UserDoc>(model, model.schema, adapter).where({ age: { $foo: 1 } } as any);

    await expect(query.exec()).rejects.toBeInstanceOf(QueryFilterError);
    expect(adapter.calls.find).toHaveLength(0);
  });

  it('rejects excessive nesting, logical width, and unsafe regex before adapter execution', async () => {
    for (const payload of [
      nestedLogicalFilter(25),
      { $or: Array.from({ length: 51 }, () => ({ name: 'none' })) },
      { name: { $regex: 'Ada', $options: 'g' } },
      { name: { $regex: 'a'.repeat(129) } },
      { name: { $regex: '^(a+)+$' } },
    ]) {
      const adapter = new FakePersistenceAdapter([{ _id: 'u1', name: 'Ada', age: 36, role: 'admin' }]);
      const model = createFakeModel(adapter);
      const query = new Query<any[], UserDoc>(model, model.schema, adapter).where(payload as any);

      await expect(query.exec()).rejects.toBeInstanceOf(QueryFilterError);
      expect(adapter.calls.find).toHaveLength(0);
    }
  });

  it('leaves unrelated documents unchanged when destructive operations receive rejected sanitized payloads', async () => {
    const connection = new Connection();
    await connection.connect(() => createMemoryDatabase({ name: `mrx02_${Date.now()}` }));
    try {
      const User = connection.model<UserDoc>(
        'SecurityUser',
        new Schema<UserDoc>({ name: String, age: Number, role: String }),
        'security_users',
      );
      await User.create([
        { name: 'Keep', age: 1, role: 'user' },
        { name: 'Target', age: 2, role: 'admin' },
      ]);

      for (const [, makePayload] of rejectedPayloads) {
        await expect(
          (async () => {
            const safe = sanitizeFilter<UserDoc>(makePayload());
            await User.deleteMany(safe);
          })(),
        ).rejects.toBeInstanceOf(QueryFilterError);
        await expect(
          (async () => {
            const safe = sanitizeFilter<UserDoc>(makePayload());
            await User.updateMany(safe, { $set: { role: 'compromised' } });
          })(),
        ).rejects.toBeInstanceOf(QueryFilterError);
      }

      const docs = await User.find({ name: { $in: ['Keep', 'Target'] } });
      expect(
        docs.map((doc: any) => ({ name: doc.name, role: doc.role })).sort((a, b) => a.name.localeCompare(b.name)),
      ).toEqual([
        { name: 'Keep', role: 'user' },
        { name: 'Target', role: 'admin' },
      ]);
    } finally {
      await connection.disconnect();
    }
  });

  it('rejects a known catastrophic-backtracking regex in a subprocess before evaluation', async () => {
    const script = `
const { sanitizeFilter, QueryFilterError } = require('./dist/index.js');
try {
  const safe = sanitizeFilter({ name: { $regex: '^(a+)+$' } });
  new RegExp(safe.name.$regex).test('a'.repeat(100000) + '!');
  process.exit(2);
} catch (error) {
  if (error instanceof QueryFilterError) process.exit(0);
  console.error(error);
  process.exit(1);
}
`;
    const result = await runSubprocess(process.execPath, ['-e', script], { cwd: packageRoot, timeoutMs: 1_000 });

    expect(result.timedOut).toBe(false);
    expect(result.exitCode).toBe(0);
  });
});
