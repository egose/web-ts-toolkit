/**
 * ARC-20: extracted from website adapter.mdx "Wrapped Endpoints" + "Adapter-
 * Level vs Service-Level Wrap Helpers" + "Dynamic path segment encoding".
 * Mirrors the `wrapGet` / `wrapPost` / `wrapPut` / `wrapPatch` / `wrapDelete`
 * shape and the `WrapOptions` (`queryParams`, `pathParams`) keys, the
 * `{{token}}` URL placeholder, the adapter-vs-service-base-path distinction,
 * and the merge with the wrapper default config.
 */
import { type WrapOptions, createAdapter } from '@web-ts-toolkit/access-router-client';

interface Apple {
  name: string;
}

const adapter = createAdapter({ baseURL: 'http://localhost:3000/api' });

const getApple = adapter.wrapGet<{ name: string }>('/apple/{{name}}');

const result = await getApple({
  pathParams: { name: 'green' },
  queryParams: { includeSeeds: true },
});
void result;

// Sanity: `WrapOptions` is a named type export (locked by ARC-17) — naming
// the option shape rather than relying on structural inference is part of the
// documented public surface. Removing it breaks this fixture.
const opts: WrapOptions = {
  pathParams: { name: 'green' },
  queryParams: { includeSeeds: true },
};
void opts;

// All five wrapper factories are reachable from the adapter surface.
adapter.wrapGet<Apple>('/a/{{name}}');
adapter.wrapPost<Apple>('/a');
adapter.wrapPut<Apple>('/a/{{id}}');
adapter.wrapPatch<Apple>('/a/{{id}}');
adapter.wrapDelete<Apple>('/a/{{id}}');

// Adapter-level wrapper — path is already rooted from the adapter base URL.
adapter.wrapGet('reports/{{id}}');

// Service-level wrapper — the service base path is prepended automatically.
const userService = adapter.createModelService<{ _id?: string; name: string }>({
  modelName: 'User',
  basePath: 'users',
});
userService.wrapPost('chairman');

const readUser = userService.read('user-1');
const countUsers = userService.count();
const [user, count] = await adapter.group(readUser, countUsers);
void user;
void count;

// Default axios config captured at wrapper construction coexists with a
// per-call config passed at invocation time — verifying the documented
// immutable-default behaviour at the type level.
const withDefault = adapter.wrapGet<Apple>('/apple/{{name}}', {
  headers: { 'x-default': 'one' },
});
await withDefault({ pathParams: { name: 'green' } }, { headers: { 'x-per-call': 'two' } });
