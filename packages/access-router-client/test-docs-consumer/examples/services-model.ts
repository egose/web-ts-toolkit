/**
 * ARC-20: extracted from website services.mdx "ModelService" + "Advanced
 * query" examples. Mirrors the documented standard and advanced model
 * methods, the `select`/`sort`/`limit`/`includePermissions`/`includeCount`
 * option keys, and the per-call `axiosRequestConfig` last argument.
 *
 * Also exercises the service-defaults second argument pattern documented in
 * services.mdx "Service Defaults" so a renamed default key (`listAdvancedArgs`,
 * `listAdvancedOptions`, `readOptions`) fails this compile.
 */
import {
  type ArrayModelResponse,
  createAdapter,
  type Defaults,
  type ModelRequest,
  type ModelResponse,
} from '@web-ts-toolkit/access-router-client';

interface User {
  _id?: string;
  name: string;
  role: string;
  public: boolean;
}

const adapter = createAdapter({ baseURL: 'http://localhost:3000/api' });

const userService = adapter.createModelService<User>(
  {
    modelName: 'User',
    basePath: 'users',
  },
  {
    listAdvancedArgs: {
      select: ['name', 'role'],
      limit: 25,
    },
    listAdvancedOptions: {
      includeCount: true,
      skim: true,
    },
    readOptions: {
      includePermissions: true,
    },
  },
);
void userService;

// Sanity: `Defaults` is a named type export (ARC-17); an installed consumer
// typing their defaults by name compiles. Removing it breaks this fixture.
const defaultsByName: Defaults = {
  listAdvancedArgs: { select: ['name'], limit: 10 },
};
void defaultsByName;

const users = await userService.listAdvanced(
  { public: true },
  {
    select: ['name', 'role'],
    sort: { name: 1 },
    limit: 20,
  },
  {
    includeCount: true,
    includePermissions: true,
  },
  {
    headers: { user: 'admin' },
  },
);

void users;

// The migration contract preserves model-create input cardinality. In
// particular, a one-item array remains array-shaped rather than collapsing to
// the scalar response type.
const scalarCreate = userService.create({ name: 'Ada', role: 'admin', public: true });
scalarCreate satisfies ModelRequest<ModelResponse<User>>;

const arrayCreate = userService.create([{ name: 'Ada', role: 'admin', public: true }]);
arrayCreate satisfies ModelRequest<ArrayModelResponse<User>>;
