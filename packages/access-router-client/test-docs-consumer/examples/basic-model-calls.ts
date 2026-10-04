import { createAdapter } from '@web-ts-toolkit/access-router-client';

type User = { _id?: string; name: string; role: string };
const adapter = createAdapter({ baseURL: 'http://localhost:3000/api' });
const users = adapter.createModelService<User>({ modelName: 'User', basePath: 'users' });

// Skip args without an undefined placeholder.
const counted = await users.list({ includeCount: true });
const timedList = await users.list({ includeCount: true }, { timeout: 5000 });

// Full args/options/config form for projection, sorting, and pagination.
const selectedList = await users.list(
  { select: ['name'], sort: '-name', limit: 10 },
  { includePermissions: true },
  { timeout: 5000 },
);
const selectedRead = await users.read('user-1', { select: ['name'] }, { includePermissions: true }, { timeout: 5000 });

// Read's existing options/config form still works.
const read = await users.read('user-1', { tryList: false }, { timeout: 5000 });
void [counted, timedList, selectedList, selectedRead, read];

// Plain updates accept `select` in args, sent as a PATCH `?select=` value,
// mirroring plain reads (useful with `requireExplicitSelect` on the server).
const selectedUpdate = await users.update(
  'user-1',
  { role: 'owner' },
  { select: ['name'] },
  { returningAll: true },
  { timeout: 5000 },
);

// Update's existing options/config form still works.
const updated = await users.update('user-1', { role: 'owner' }, { returningAll: false }, { timeout: 5000 });
void [selectedUpdate, updated];
