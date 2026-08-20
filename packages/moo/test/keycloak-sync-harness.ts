import { vi } from 'vitest';

export type RemoteUser = {
  id: string;
  username: string;
  email?: string;
  emailVerified?: boolean;
  firstName?: string;
  lastName?: string;
  enabled?: boolean;
  attributes?: Record<string, string[]>;
  password?: string;
};

export type RemoteRole = { id: string; name: string };

export type KeycloakOperation =
  | 'realm.get'
  | 'user.getById'
  | 'user.get'
  | 'user.create'
  | 'user.create.after'
  | 'role.ensure'
  | 'role.get'
  | 'core.users.find'
  | 'core.users.update'
  | 'core.users.del'
  | 'core.users.sendVerifyEmail'
  | 'core.users.resetPassword'
  | 'core.users.listRealmRoleMappings'
  | 'core.users.addRealmRoleMappings'
  | 'core.users.delRealmRoleMappings';

export type KeycloakOperationCall = {
  operation: KeycloakOperation;
  args: unknown[];
};

export const createKeycloakSyncHarness = () => {
  const users: RemoteUser[] = [];
  const roles = new Map<string, RemoteRole>();
  const mappings = new Map<string, RemoteRole[]>();
  const calls: KeycloakOperationCall[] = [];
  const failures = new Map<KeycloakOperation, Error[]>();
  let duplicateEmailsAllowed = false;

  const record = (operation: KeycloakOperation, args: unknown[] = []) => {
    calls.push({ operation, args });
    const queued = failures.get(operation);
    const failure = queued?.shift();
    if (queued?.length === 0) failures.delete(operation);
    if (failure) throw failure;
  };

  const failOnce = (operation: KeycloakOperation, error = new Error(`Injected Keycloak failure at ${operation}`)) => {
    failures.set(operation, [...(failures.get(operation) ?? []), error]);
  };

  const coreUsers = {
    find: vi.fn(async (query: { email?: string; username?: string; max?: number }) => {
      record('core.users.find', [query]);
      const matches = users.filter((user) => {
        if (query.email !== undefined) return user.email?.toLowerCase() === query.email.toLowerCase();
        if (query.username !== undefined) return user.username === query.username;
        return true;
      });

      return matches.slice(0, query.max).map((user) => {
        const result = { ...user };
        delete result.attributes;
        return result;
      });
    }),
    update: vi.fn(async ({ id }: { id: string }, payload: Partial<RemoteUser>) => {
      record('core.users.update', [{ id }, payload]);
      Object.assign(users.find((user) => user.id === id)!, payload);
    }),
    del: vi.fn(async ({ id }: { id: string }) => {
      record('core.users.del', [{ id }]);
      const index = users.findIndex((user) => user.id === id);
      if (index >= 0) users.splice(index, 1);
    }),
    sendVerifyEmail: vi.fn(async (...args: unknown[]) => {
      record('core.users.sendVerifyEmail', args);
    }),
    resetPassword: vi.fn(async (...args: unknown[]) => {
      record('core.users.resetPassword', args);
    }),
    listRealmRoleMappings: vi.fn(async ({ id }: { id: string }) => {
      record('core.users.listRealmRoleMappings', [{ id }]);
      return mappings.get(id) ?? [];
    }),
    addRealmRoleMappings: vi.fn(async ({ id, roles: added }: { id: string; roles: RemoteRole[] }) => {
      record('core.users.addRealmRoleMappings', [{ id, roles: added }]);
      mappings.set(id, [...(mappings.get(id) ?? []), ...added]);
    }),
    delRealmRoleMappings: vi.fn(async ({ id, roles: removed }: { id: string; roles: RemoteRole[] }) => {
      record('core.users.delRealmRoleMappings', [{ id, roles: removed }]);
      const removedNames = new Set(removed.map((role) => role.name));
      mappings.set(
        id,
        (mappings.get(id) ?? []).filter((role) => !removedNames.has(role.name)),
      );
    }),
  };

  const realmHandle = {
    get: vi.fn(async () => {
      record('realm.get');
      return { realm: 'test', duplicateEmailsAllowed };
    }),
    user: vi.fn((username: string) => {
      const findByUsername = () => users.find((user) => user.username === username) ?? null;

      return {
        getById: vi.fn(async (id: string) => {
          record('user.getById', [username, id]);
          return users.find((user) => user.id === id) ?? null;
        }),
        get: vi.fn(async () => {
          record('user.get', [username]);
          return findByUsername();
        }),
        create: vi.fn(async (payload: Partial<RemoteUser>) => {
          record('user.create', [username, payload]);
          if (findByUsername()) throw new Error(`User "${username}" already exists in realm "test"`);

          const { password, ...createdPayload } = payload;
          const user = { id: `user-${users.length + 1}`, username, ...createdPayload } as RemoteUser;
          users.push(user);

          if (password) {
            await coreUsers.resetPassword({
              realm: 'test',
              id: user.id,
              credential: {
                temporary: false,
                type: 'password',
                value: password,
              },
            });
          }

          record('user.create.after', [username, user]);
          return findByUsername();
        }),
      };
    }),
    role: vi.fn((name: string) => ({
      ensure: vi.fn(async () => {
        record('role.ensure', [name]);
        if (!roles.has(name)) roles.set(name, { id: `role-${roles.size + 1}`, name });
      }),
      get: vi.fn(async () => {
        record('role.get', [name]);
        return roles.get(name) ?? null;
      }),
    })),
  };

  return {
    client: { realm: vi.fn(() => realmHandle), core: { users: coreUsers } },
    coreUsers,
    users,
    roles,
    mappings,
    calls,
    failOnce,
    callsFor(operation: KeycloakOperation) {
      return calls.filter((call) => call.operation === operation);
    },
    setDuplicateEmailsAllowed(value: boolean) {
      duplicateEmailsAllowed = value;
    },
  };
};

export type KeycloakSyncHarness = ReturnType<typeof createKeycloakSyncHarness>;
