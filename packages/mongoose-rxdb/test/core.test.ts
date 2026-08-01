import { describe, expect, it, beforeAll, afterAll } from 'vitest';
import {
  Schema,
  Connection,
  ValidationError,
  castDocumentToSchema,
  convertToRxJsonSchema,
  sanitizeFilter,
} from '../src/index';
import { createMemoryDatabase } from '../src/storage/index';

let connection: Connection;

beforeAll(async () => {
  connection = new Connection();
  await connection.connect(() => createMemoryDatabase({ name: 'testcore' }));
});

afterAll(async () => {
  await connection.disconnect();
});

let userCounter = 0;
const makeUserModel = () => {
  userCounter += 1;
  const schema = new Schema(
    {
      name: { type: String, required: true, min: 1 },
      age: { type: Number, default: 0, min: 0, max: 150 },
      email: { type: String, match: /@/ },
      role: { type: String, enum: ['admin', 'user'], default: 'user' },
      tags: [String],
      meta: { type: Object },
    },
    { timestamps: true },
  );
  // unique model + collection name per call so tests never collide
  return connection.model(`User_${userCounter}`, schema, `users_${userCounter}`);
};

describe('Schema + casting', () => {
  it('casts string-ish values to declared types', () => {
    const schema = new Schema({ name: String, age: Number, active: Boolean });
    const out = castDocumentToSchema({ name: 123, age: '42', active: 'true' }, schema);
    expect(out.name).toBe('123');
    expect(out.age).toBe(42);
    expect(out.active).toBe(true);
  });

  it('applies defaults', () => {
    const schema = new Schema({ n: { type: Number, default: 7 }, name: String });
    expect(castDocumentToSchema({}, schema).n).toBe(7);
  });

  it('converts to an RxDB JSON schema', () => {
    const schema = new Schema({ name: String, age: Number });
    const rx = convertToRxJsonSchema('users', schema);
    expect(rx.primaryKey).toBe('_id');
    expect(rx.properties.name).toEqual({ type: 'string' });
    expect(rx.properties.age).toEqual({ type: 'number' });
  });
});

describe('Document + validation', () => {
  it('rejects a missing required field', async () => {
    const User = makeUserModel();
    const doc = new (User as any)({ age: 10 });
    await expect(doc.validate()).rejects.toBeInstanceOf(ValidationError);
  });

  it('rejects enum violations', async () => {
    const User = makeUserModel();
    const doc = new (User as any)({ name: 'Ada', role: 'superuser' });
    await expect(doc.validate()).rejects.toBeInstanceOf(ValidationError);
  });

  it('tracks modified paths', () => {
    const User = makeUserModel();
    const doc = new (User as any)({ name: 'Ada' });
    expect(doc.isModified('name')).toBe(true);
    doc.clearModified();
    doc.name = 'Grace';
    expect(doc.isModified('name')).toBe(true);
  });
});

describe('CRUD through Model (RxDB memory storage)', () => {
  it('creates, finds, updates, and deletes', async () => {
    const User = makeUserModel();
    const created = await User.create({ name: 'Ada', age: 36, email: 'ada@example.com', tags: ['math'] });
    expect(created._id).toBeTruthy();
    expect(created.isNew).toBe(false);

    const found = await User.findOne({ name: 'Ada' });
    expect(found?.age).toBe(36);

    const viaBuilder = await User.find().where('age').gt(30).exec();
    expect(viaBuilder.length).toBeGreaterThanOrEqual(1);

    const list = await User.find({ age: { $gte: 30 } });
    expect(list.length).toBeGreaterThanOrEqual(1);

    await User.updateOne({ name: 'Ada' }, { $set: { age: 37 } });
    const updated = await User.findById(created._id);
    expect(updated?.age).toBe(37);

    await User.deleteOne({ name: 'Ada' });
    expect(await User.findById(created._id)).toBeNull();
  });

  it('supports thenable query via await', async () => {
    const User = makeUserModel();
    await User.create({ name: 'Thenable', age: 5 });
    const results: any[] = await User.find().where('name').equals('Thenable');
    expect(results.length).toBe(1);
    await User.deleteMany({ name: 'Thenable' });
  });

  it('counts documents', async () => {
    const User = makeUserModel();
    await User.create({ name: 'Count1', age: 1 });
    await User.create({ name: 'Count2', age: 2 });
    const n = await User.countDocuments({ age: { $lte: 2 } });
    expect(n).toBeGreaterThanOrEqual(2);
  });
});

describe('middleware', () => {
  it('runs pre and post save hooks', async () => {
    const schema = new Schema({ name: String });
    const calls: string[] = [];
    schema.pre('save', function (next) {
      calls.push('pre');
      next();
    });
    schema.post('save', function () {
      calls.push('post');
    });
    const Widget = connection.model('Widget', schema, 'widgets');
    const doc = new (Widget as any)({ name: 'w' });
    await doc.save();
    expect(calls).toEqual(['pre', 'post']);
  });

  it('rejects save when a pre hook calls next(err)', async () => {
    const schema = new Schema({ name: String });
    schema.pre('save', function (next) {
      next(new Error('blocked by hook'));
    });
    const Blocked = connection.model('Blocked', schema, 'blocked');
    const doc = new (Blocked as any)({ name: 'x' });
    await expect(doc.save()).rejects.toThrow('blocked by hook');
  });
});

describe('regression: _id assignment', () => {
  it('auto-generates _id on a constructed document', () => {
    const User = makeUserModel();
    const doc = new (User as any)({ name: 'Idless' });
    expect(typeof doc._id).toBe('string');
    expect(doc._id.length).toBeGreaterThan(0);
  });

  it('honors an explicit _id passed in the data', async () => {
    const User = makeUserModel();
    const created = await User.create({ _id: 'custom-id', name: 'Custom' } as any);
    expect(created._id).toBe('custom-id');
    const fetched = await User.findById('custom-id');
    expect(fetched?.name).toBe('Custom');
    await User.deleteOne({ _id: 'custom-id' });
  });
});

describe('regression: updateOne with runValidators applies update once', () => {
  it('$inc applies a single increment when runValidators is on', async () => {
    const User = makeUserModel();
    const created = await User.create({ name: 'Inc', age: 10 });
    await User.updateOne({ name: 'Inc' }, { $inc: { age: 5 } }, { runValidators: true });
    const after = await User.findById(created._id);
    expect(after?.age).toBe(15);
    await User.deleteOne({ name: 'Inc' });
  });
});

describe('regression: save only persists dirty fields', () => {
  it('load -> mutate one field -> save sends a single-field diff', async () => {
    const User = makeUserModel();
    const created = await User.create({ name: 'Diff', age: 1 });
    const loaded = await User.findById(created._id);
    expect(loaded).not.toBeNull();
    loaded!.age = 42;
    expect(loaded!.isModified('age')).toBe(true);
    expect(loaded!.isModified('name')).toBe(false);
    await loaded!.save();
    const reloaded = await User.findById(created._id);
    expect(reloaded?.age).toBe(42);
    expect(reloaded?.name).toBe('Diff');
    await User.deleteOne({ _id: created._id });
  });
});

describe('sanitizeFilter', () => {
  it('wraps nested non-operator objects in $eq', () => {
    const malicious = { user: { $where: 'evil()' } } as any;
    const safe = sanitizeFilter(malicious);
    expect((safe as any).user).toEqual({ $eq: { $where: 'evil()' } });
  });

  it('preserves legitimate operator maps', () => {
    const safe = sanitizeFilter({ age: { $gt: 18 } } as any);
    expect((safe as any).age).toEqual({ $gt: 18 });
  });

  it('preserves and recurses into $or / $and', () => {
    const safe = sanitizeFilter({
      $or: [{ name: 'admin' }, { role: { $ne: 'user' } }],
    } as any);
    expect((safe as any).$or[0].name).toBe('admin');
    expect((safe as any).$or[1].role).toEqual({ $ne: 'user' });
  });
});

describe('Connection.model overwrite guard', () => {
  it('throws when recompiling an existing model without overwrite', () => {
    const schemaA = new Schema({ a: String });
    const schemaB = new Schema({ b: Number });
    connection.model('Guarded', schemaA, 'guarded_a');
    expect(() => connection.model('Guarded', schemaB, 'guarded_b')).toThrow(/already compiled/);
    connection.model('Guarded', schemaB, 'guarded_b', { overwrite: true });
    expect(connection.modelNames()).toContain('Guarded');
  });
});
