/**
 * ARC-20: extracted from website model.mdx "Nested-edit contract". Uses a
 * `User` with a `statusHistory` subdocument array so direct nested writes
 * (which deliberately bypass the dirty tracker) and `set('path', value)`
 * (which reconciles against the snapshot) compile.
 *
 * The compile test catches a regression where `set(path, value)` is removed
 * or where `markModified(path)` becomes unavailable. `read.data` is narrowed
 * on `read.success` because `ModelResponse<T>` is the discriminated
 * `Response<...>` union.
 */
import { createAdapter } from '@web-ts-toolkit/access-router-client';

interface User {
  _id?: string;
  name: string;
  role: string;
  statusHistory: Array<{ _id?: string; label: string; flag: string }>;
}

const adapter = createAdapter({ baseURL: 'http://localhost:3000/api' });
const userService = adapter.createModelService<User>({
  modelName: 'User',
  basePath: 'users',
});

const read = await userService.read('user-id-1');

if (read.success) {
  read.data.statusHistory[0].label = 'approved';
  read.data.set('statusHistory.0.label', 'approved');
  read.data.isDirty('statusHistory');

  const user = read;
  const original = user.data.statusHistory[0].label;
  user.data.set('statusHistory.0.label', 'pending');
  user.data.isDirty('statusHistory');
  user.data.set('statusHistory.0.label', original);
  user.data.isDirty('statusHistory');

  // Direct nested mutation is NOT tracked.
  user.data.statusHistory[0].label = 'approved';
  user.data.isDirty('statusHistory');

  user.data.statusHistory.push({ label: 'extra', flag: 'red' });
  user.data.isDirty('statusHistory');

  // Tracked nested write via `set(...)`.
  user.data.set('statusHistory.0.label', 'approved');
  user.data.isDirty('statusHistory');

  // Or mutate directly and opt in to tracking via `markModified(...)`.
  user.data.statusHistory[0].label = 'approved';
  user.data.markModified('statusHistory');
  user.data.isDirty('statusHistory');
}
