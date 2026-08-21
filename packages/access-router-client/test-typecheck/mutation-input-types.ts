import { createAdapter, type FilterQuery, type ModelService } from '../src';

interface User {
  _id?: string;
  name: string;
  age: number;
  tags: string[];
  statusHistory: Array<{ _id?: string; label: string; flag: string }>;
}

type UserCreateInput = {
  name: string;
  age: number;
};

type UserUpdateInput = {
  name?: string;
  age?: number;
};

type UserUpsertInput = {
  externalId: string;
  name?: string;
};

declare const defaultService: ModelService<User>;

defaultService.create({ name: 'Max' });
defaultService.create([{ age: 2, tags: ['vip'] }]);
defaultService.update('user-1', { age: 3 });
defaultService.upsert({ name: 'Ada', tags: ['admin'] });
defaultService.createAdvanced({ name: 'Ada' }, { select: ['name'] as const });
defaultService.updateAdvanced('user-1', { tags: ['vip'] }, { select: ['tags'] as const });

// @ts-expect-error default create inputs reject misspelled known fields.
defaultService.create({ naem: 'Max' });

// @ts-expect-error default update inputs reject wrong scalar values.
defaultService.update('user-1', { age: 'old' });

const customService = createAdapter().createModelService<User, UserCreateInput, UserUpdateInput, UserUpsertInput>({
  modelName: 'User',
  basePath: 'users',
});

customService.create({ name: 'Max', age: 1 });
customService.update('user-1', { age: 2 });
customService.upsert({ externalId: 'crm-1', name: 'Max' });

// @ts-expect-error custom create input does not accept response-only fields.
customService.create({ tags: ['vip'] });

// @ts-expect-error custom update input does not accept create-only required fields with wrong shape.
customService.update('user-1', { externalId: 'crm-1' });

// @ts-expect-error custom upsert input requires its distinct external identity.
customService.upsert({ name: 'Max' });

const statusSubs = defaultService.id('user-1').subs('statusHistory');
statusSubs.create({ label: 'created' });
statusSubs.create([{ flag: 'green' }]);
statusSubs.update('status-1', { flag: 'red' });
statusSubs.bulkUpdate([{ label: 'updated' }]);

// @ts-expect-error inferred subdocument create rejects misspelled fields.
statusSubs.create({ lable: 'created' });

// @ts-expect-error inferred subdocument update rejects wrong scalar values.
statusSubs.update('status-1', { flag: 1 });

const customSubs = defaultService
  .id('user-1')
  .subs<{ label: string; flag: string }, 'statusHistory', { label: string }, { flag?: string }>('statusHistory');
customSubs.create({ label: 'custom' });
customSubs.update('status-1', { flag: 'green' });

// @ts-expect-error custom subdocument create schema excludes update-only fields.
customSubs.create({ flag: 'green' });

const filter: FilterQuery<User> = {
  age: { $in: [1, 2], $nin: [3] },
  tags: { $in: ['vip'], $nin: ['banned'] },
};
void filter;

const directArrayCondition: FilterQuery<User> = { tags: ['vip', 'admin'] };
void directArrayCondition;

// @ts-expect-error scalar comparison operators do not accept accidental arrays.
const badGt: FilterQuery<User> = { age: { $gt: [1, 2] } };

// @ts-expect-error array-field scalar comparison operators use the element type, not arrays.
const badArrayFieldLte: FilterQuery<User> = { tags: { $lte: ['vip'] } };

void badGt;
void badArrayFieldLte;
