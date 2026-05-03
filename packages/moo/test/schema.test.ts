import mongoose from 'mongoose';
import { beforeAll, describe, expect, it } from 'vitest';

import { uniqueEmptiableString, uniqueNullableString } from '../dist/index.mjs';
import { useMongoTestDatabase } from './setup';

useMongoTestDatabase();

type Person = {
  alias?: string | null;
  loc?: string | null;
  name: string | null;
};

const personSchema = new mongoose.Schema<Person>({
  name: { type: String, unique: true },
  loc: uniqueNullableString('loc'),
  alias: uniqueEmptiableString('alias'),
});

const Person = mongoose.model<Person>('SchemaHelperPerson', personSchema);

const createDuplicateKeyError = async (callback: () => Promise<void>) => {
  try {
    await callback();
    return null;
  } catch (error) {
    return String(error);
  }
};

beforeAll(async () => {
  await Person.init();
});

describe('schema helpers', () => {
  it('allows multiple null values for uniqueNullableString fields', async () => {
    const error = await createDuplicateKeyError(async () => {
      await Person.create({ name: 'mark', loc: null });
      await Person.create({ name: 'james', loc: null });
    });

    expect(error).toBeNull();
  });

  it('still rejects duplicate empty strings for uniqueNullableString fields', async () => {
    const error = await createDuplicateKeyError(async () => {
      await Person.create({ name: 'jack', loc: '' });
      await Person.create({ name: 'lucas', loc: '' });
    });

    expect(error).toContain('E11000 duplicate key error');
    expect(error).toContain('loc_1');
  });

  it('ignores null and empty strings for uniqueEmptiableString fields', async () => {
    const nullError = await createDuplicateKeyError(async () => {
      await Person.create({ name: 'dave', alias: null });
      await Person.create({ name: 'chris', alias: null });
    });

    const emptyStringError = await createDuplicateKeyError(async () => {
      await Person.create({ name: 'maggie', alias: '' });
      await Person.create({ name: 'ryan', alias: '' });
    });

    expect(nullError).toBeNull();
    expect(emptyStringError).toBeNull();
  });

  it('rejects duplicate non-empty values for uniqueEmptiableString fields', async () => {
    const error = await createDuplicateKeyError(async () => {
      await Person.create({ name: 'jess', alias: 'purple' });
      await Person.create({ name: 'emily', alias: 'purple' });
    });

    expect(error).toContain('E11000 duplicate key error');
    expect(error).toContain('alias_1');
  });
});
