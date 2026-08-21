import { createAdapter } from '@web-ts-toolkit/access-router-client';

interface User {
  _id?: string;
  name: string;
  age: number;
}

const adapter = createAdapter({ baseURL: 'http://localhost:3000/api' });
const userService = adapter.createModelService<User>({ modelName: 'User', basePath: 'users' });

userService.create({ name: 'Max' });
userService.update('user-1', { age: 42 });

// @ts-expect-error misspelled fields are rejected by the default mutation input.
userService.create({ naem: 'Max' });

// @ts-expect-error wrong scalar values are rejected by the default mutation input.
userService.update('user-1', { age: 'x' });

type UserCreateInput = { name: string; age: number };
type UserUpdateInput = { name?: string; age?: number };
type UserUpsertInput = { externalId: string; name?: string };

const users = adapter.createModelService<User, UserCreateInput, UserUpdateInput, UserUpsertInput>({
  modelName: 'User',
  basePath: 'users',
});

users.create({ name: 'Ada', age: 1 });
users.update('user-1', { name: 'Ada' });
users.upsert({ externalId: 'crm-1' });
