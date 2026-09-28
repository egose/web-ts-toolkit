import { createAdapter } from '@web-ts-toolkit/access-router-client';

type User = { _id?: string; name: string; nickname?: string };
const adapter = createAdapter({ baseURL: 'http://localhost:3000/api' });
const users = adapter.createModelService<User>({ modelName: 'User', basePath: 'users' });
const params = new URLSearchParams('mode=second&mode=first');
const result = await users.read('user-1', { includePermissions: true }, { params });

if (result.success) {
  result.data.nickname = 'Ada';
  await result.data.save();
}
