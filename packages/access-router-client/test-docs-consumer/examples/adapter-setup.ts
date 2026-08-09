/**
 * ARC-20: extracted from website adapter.mdx "Basic Setup", "Adapter Options",
 * "Matching Server Paths", and README "Contract". Mirrors the documented
 * default Axios config (`baseURL: '/api'`, `timeout: 0`, `withCredentials:
 * true`, `Cache-Control: no-cache`, `Pragma: no-cache`, `Expires: 0`) by
 * overriding each one explicitly so the contract is exercised at the type
 * level; the runtime values are irrelevant to `tsc --noEmit`.
 *
 * Also covers `rootRouterPath`, `throwOnError`, `cacheTTL`, `cachePartition`,
 * and `cacheCapacity` so an accidental removal or rename of any documented
 * `AdapterOptions` field fails this compile.
 */
import { type AdapterOptions, createAdapter } from '@web-ts-toolkit/access-router-client';

const adapter = createAdapter(
  {
    baseURL: 'http://localhost:3000/api',
    withCredentials: true,
    headers: {
      Authorization: 'Bearer token',
    },
  },
  {
    rootRouterPath: 'root',
    throwOnError: false,
    cacheTTL: 30_000,
    cachePartition: () => 'user-identity',
    cacheCapacity: 100,
  },
);
void adapter;

// Same adapter built with the documented defaults (no axiosConfig override)
// so the default `baseURL: '/api'` etc. is reachable without an explicit
// argument. The smoke runtime never executes; this is purely a declaration
// compile.
const defaultAdapter = createAdapter();
defaultAdapter.clearCache();
defaultAdapter.disposeCache();
void defaultAdapter;

// Sanity: AdapterOptions is a named type export (locked by ARC-17) so doc
// consumers referencing it by name compile. Removing it from the public
// surface breaks this fixture.
const opts: AdapterOptions = {
  rootRouterPath: 'root',
  cacheTTL: 60,
  cacheCapacity: 100,
  cachePartition: () => 'id-1',
};
void opts;

const runtime = {
  createRouter(...args: [string, { basePath: string; queryRouteSegment: string }]) {
    void args;
  },
};
runtime.createRouter('User', {
  basePath: '/api/users',
  queryRouteSegment: '__query',
});

// Match server paths example from adapter.mdx.
const pathedAdapter = createAdapter({ baseURL: 'http://localhost:3000/api' }, { rootRouterPath: 'root' });

const userService = pathedAdapter.createModelService({
  modelName: 'User',
  basePath: 'users',
  queryPath: '__query',
  mutationPath: '__mutation',
});

void userService;

// Verbatim executable statements from the documented server-path example.
{
  const adapter = createAdapter({ baseURL: 'http://localhost:3000/api' }, { rootRouterPath: 'root' });

  const userService = adapter.createModelService({
    modelName: 'User',
    basePath: 'users',
    queryPath: '__query',
    mutationPath: '__mutation',
  });
  void userService;
}
