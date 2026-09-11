import { describe, expect, it } from 'vitest';
import { Connection, Schema, convertToRxJsonSchema } from '../src/index';
import { createMemoryDatabase } from '../src/storage/index';

let suffix = 0;
function nextSuffix(): string {
  suffix += 1;
  return `${Date.now()}_${suffix}`;
}

async function precreateCollection(db: any, collName: string, schema: Schema<any, any, any, any>): Promise<any> {
  const rxSchema = convertToRxJsonSchema(collName, schema.compileForModel());
  await db.addCollections({ [collName]: { schema: rxSchema } });
  return rxSchema;
}

function expectSyncIncompatibleModel(
  conn: Connection,
  modelName: string,
  schema: Schema<any, any, any, any>,
  collName: string,
): void {
  expect(() => (conn as any).model(modelName, schema, collName)).toThrow(/incompatible.*schema/i);
  expect(conn.modelNames()).not.toContain(modelName);
}

describe('BMRX-19 factory-precreated collection schema verification', () => {
  it('accepts a factory-precreated equivalent schema despite RxDB-normalized metadata', async () => {
    const tag = nextSuffix();
    const collName = `bmrx19_equiv_${tag}`;
    const db = await createMemoryDatabase({ name: `bmrx19_equiv_db_${tag}` });
    await precreateCollection(db, collName, new Schema({ name: String, age: Number }) as any);

    const conn = new Connection();
    await conn.connect(() => Promise.resolve(db));
    try {
      const Model = (conn as any).model(`Bmrx19Equiv_${tag}`, new Schema({ name: String, age: Number }), collName);
      const adapter = await conn.resolveModelCollection(Model);
      expect(adapter).toBeTruthy();
      expect(Model.collection).toBe(adapter);
      await Model.create({ name: 'Ada', age: 36 } as never);
      expect(await Model.countDocuments().exec()).toBe(1);
    } finally {
      await conn.disconnect();
    }
  });

  it('rejects an incompatible top-level type before adapter publication', async () => {
    const tag = nextSuffix();
    const collName = `bmrx19_type_${tag}`;
    const db = await createMemoryDatabase({ name: `bmrx19_type_db_${tag}` });
    await precreateCollection(db, collName, new Schema({ name: String, age: Number }) as any);

    const conn = new Connection();
    await conn.connect(() => Promise.resolve(db));
    try {
      // Supplied DB stores numeric age; a model declaring string age must not wrap it.
      expectSyncIncompatibleModel(
        conn,
        `Bmrx19Type_${tag}`,
        new Schema({ name: String, age: String }) as any,
        collName,
      );
      expect(Object.keys(db.collections)).toEqual([collName]);
      expect(String(JSON.stringify((db.collections[collName] as any).schema.jsonSchema.properties.age))).toContain(
        'number',
      );
    } finally {
      await conn.disconnect();
    }
  });

  it('rejects incompatible nested fields', async () => {
    const tag = nextSuffix();
    const collName = `bmrx19_nested_${tag}`;
    const db = await createMemoryDatabase({ name: `bmrx19_nested_db_${tag}` });
    const child = new Schema({ city: String });
    await precreateCollection(db, collName, new Schema({ name: String, profile: child }) as any);

    const conn = new Connection();
    await conn.connect(() => Promise.resolve(db));
    try {
      const badChild = new Schema({ city: Number });
      expectSyncIncompatibleModel(
        conn,
        `Bmrx19Nested_${tag}`,
        new Schema({ name: String, profile: badChild }) as any,
        collName,
      );
    } finally {
      await conn.disconnect();
    }
  });

  it('rejects incompatible required sets', async () => {
    const tag = nextSuffix();
    const collName = `bmrx19_req_${tag}`;
    const db = await createMemoryDatabase({ name: `bmrx19_req_db_${tag}` });
    await precreateCollection(db, collName, new Schema({ name: { type: String, required: true } }) as any);

    const conn = new Connection();
    await conn.connect(() => Promise.resolve(db));
    try {
      expectSyncIncompatibleModel(conn, `Bmrx19Req_${tag}`, new Schema({ name: String }) as any, collName);
    } finally {
      await conn.disconnect();
    }
  });

  it('rejects an incompatible primary key', async () => {
    const tag = nextSuffix();
    const collName = `bmrx19_pk_${tag}`;
    const db = await createMemoryDatabase({ name: `bmrx19_pk_db_${tag}` });
    const base = convertToRxJsonSchema(collName, new Schema({ name: String }).compileForModel() as any);
    const { _id: _ignored, ...rest } = base.properties as Record<string, unknown>;
    void _ignored;
    await db.addCollections({
      [collName]: {
        schema: {
          ...base,
          primaryKey: 'userId',
          properties: { userId: { type: 'string', maxLength: 100 }, ...rest },
        },
      },
    });

    const conn = new Connection();
    await conn.connect(() => Promise.resolve(db));
    try {
      expectSyncIncompatibleModel(conn, `Bmrx19Pk_${tag}`, new Schema({ name: String }) as any, collName);
    } finally {
      await conn.disconnect();
    }
  });

  it('allows retry with an equivalent schema after an incompatible rejection', async () => {
    const tag = nextSuffix();
    const collName = `bmrx19_retry_${tag}`;
    const db = await createMemoryDatabase({ name: `bmrx19_retry_db_${tag}` });
    await precreateCollection(db, collName, new Schema({ name: String, age: Number }) as any);

    const conn = new Connection();
    await conn.connect(() => Promise.resolve(db));
    try {
      expectSyncIncompatibleModel(
        conn,
        `Bmrx19RetryBad_${tag}`,
        new Schema({ name: String, age: String }) as any,
        collName,
      );
      // The failed registration is gone and the registry is not poisoned:
      // an equivalent model initializes against the same precreated collection.
      const Good = (conn as any).model(`Bmrx19RetryGood_${tag}`, new Schema({ name: String, age: Number }), collName);
      const adapter = await conn.resolveModelCollection(Good);
      expect(adapter).toBeTruthy();
      await Good.create({ name: 'Grace', age: 85 } as never);
      expect(await Good.countDocuments().exec()).toBe(1);
      expect(conn.modelNames()).toEqual([`Bmrx19RetryGood_${tag}`]);
    } finally {
      await conn.disconnect();
    }
  });
});
