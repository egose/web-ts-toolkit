/**
 * ARC-20: extracted from website typescript-and-errors.mdx "Error Handling
 * Modes", "`ServiceError`", and "One Practical Rule". Exercises the
 * two-branch error policy (result-oriented by default, `throwOnError` to
 * switch to exceptions), the `ServiceError extends Error` runtime contract,
 * and the lazy-request-keep-unawaited batching rule (positive + negative).
 */
import { ServiceError, createAdapter } from '@web-ts-toolkit/access-router-client';

interface Pet {
  _id?: string;
  name: string;
  age: number;
}

const adapter = createAdapter({ baseURL: 'http://localhost:3000/api' });
const userService = adapter.createModelService<Pet>({
  modelName: 'Pet',
  basePath: 'pets',
});

// Result-oriented by default — `result.success` narrows.
const result = await userService.read('missing-id');
if (!result.success) {
  void result.status;
  void result.message;
}

// `throwOnError: true` per-request opt-in.
await userService
  .read('missing-id', undefined, {
    throwOnError: true,
  })
  .catch(() => undefined);

// `throwOnError: true` at construction time — applies to all calls.
const strictService = adapter.createModelService<Pet>({
  modelName: 'Pet',
  basePath: 'pets',
  throwOnError: true,
});
await strictService.read('missing-id').catch(() => undefined);

// `ServiceError` carries the normalized fields and extends `Error`.
try {
  await userService.read('missing-id', undefined, { throwOnError: true });
} catch (error) {
  if (error instanceof ServiceError) {
    void error.status;
    void error.message;
    void error.raw;
    void error.success;
    void error.data;
    void error.headers;
  }
}

// Lazy-request keep-unawaited batching rule (positive).
const readUser = userService.read('user-1');
const countUsers = userService.count();
const _grouped = await adapter.group(readUser, countUsers);
void _grouped;
