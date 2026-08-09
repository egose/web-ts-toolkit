/**
 * ARC-20: extracted from README.md "Quick Start"; index.md "Quick Start".
 * The example is intentionally a top-level `await` program; the compile test
 * runs `tsc --noEmit` so the awaited calls are typechecked but never
 * executed. Mirrors the README block verbatim modulo the `interface`/`type`
 * alias already used by the README.
 *
 * `userService.read(...)` resolves to `ModelResponse<T>`, the discriminated
 * `Response<TData, Model<T> & TData>` union. `user.data.role = 'owner'` and
 * `user.data.save()` only compile after narrowing on `user.success` — the
 * pre-ARC-20 README block did not narrow and so did not compile against the
 * published declaration surface. The fixture narrows; the corrected README
 * mirrors the narrowing.
 *
 * Fixture compiled against the packed `dist/index.d.ts` via a strict
 * NodeNext + Bundler resolution so any drift in the README example (missing
 * import, renamed method, stale option) fails the documentation compile
 * test.
 */
import { createAdapter } from '@web-ts-toolkit/access-router-client';

type User = {
  _id?: string;
  name: string;
  role: string;
};

const adapter = createAdapter({
  baseURL: 'http://localhost:3000/api',
});

const userService = adapter.createModelService<User>({
  modelName: 'User',
  basePath: 'users',
});

const listResponse = await userService.listAdvanced(
  { role: 'admin' },
  { select: ['name', 'role'], limit: 10 },
  { includeCount: true },
);

void listResponse;

const user = await userService.read('user-id-1');

if (user.success) {
  user.data.role = 'owner';
  await user.data.save();
}

const grouped = await adapter.group(
  userService.readAdvanced('user-id-1', { select: ['name'] }),
  userService.countAdvanced({ role: 'admin' }),
);

void grouped;
