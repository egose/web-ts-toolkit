import mongoose from 'mongoose';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { keycloakUserSyncPlugin } from '../dist/plugins/keycloak-user-sync.mjs';
import { useMongoTestDatabase } from './setup';

useMongoTestDatabase();

type RemoteUser = {
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

type RemoteRole = { id: string; name: string };

const createKeycloak = () => {
  const users: RemoteUser[] = [];
  const roles = new Map<string, RemoteRole>();
  const mappings = new Map<string, RemoteRole[]>();
  let duplicateEmailsAllowed = false;

  const coreUsers = {
    find: vi.fn(async ({ email, max }: { email?: string; max?: number }) =>
      users.filter((user) => user.email?.toLowerCase() === email?.toLowerCase()).slice(0, max),
    ),
    update: vi.fn(async ({ id }: { id: string }, payload: Partial<RemoteUser>) => {
      Object.assign(users.find((user) => user.id === id)!, payload);
    }),
    del: vi.fn(async ({ id }: { id: string }) => {
      const index = users.findIndex((user) => user.id === id);
      if (index >= 0) users.splice(index, 1);
    }),
    sendVerifyEmail: vi.fn(async () => undefined),
    resetPassword: vi.fn(async () => undefined),
    listRealmRoleMappings: vi.fn(async ({ id }: { id: string }) => mappings.get(id) ?? []),
    addRealmRoleMappings: vi.fn(async ({ id, roles: added }: { id: string; roles: RemoteRole[] }) => {
      mappings.set(id, [...(mappings.get(id) ?? []), ...added]);
    }),
    delRealmRoleMappings: vi.fn(async ({ id, roles: removed }: { id: string; roles: RemoteRole[] }) => {
      const removedNames = new Set(removed.map((role) => role.name));
      mappings.set(
        id,
        (mappings.get(id) ?? []).filter((role) => !removedNames.has(role.name)),
      );
    }),
  };

  const realmHandle = {
    get: vi.fn(async () => ({ realm: 'test', duplicateEmailsAllowed })),
    user: vi.fn((username: string) => ({
      getById: vi.fn(async (id: string) => users.find((user) => user.id === id) ?? null),
      get: vi.fn(async () => users.find((user) => user.username === username) ?? null),
      create: vi.fn(async (payload: Partial<RemoteUser>) => {
        const user = { id: `user-${users.length + 1}`, username, ...payload } as RemoteUser;
        users.push(user);
        return user;
      }),
    })),
    role: vi.fn((name: string) => ({
      ensure: vi.fn(async () => {
        if (!roles.has(name)) roles.set(name, { id: `role-${roles.size + 1}`, name });
      }),
      get: vi.fn(async () => roles.get(name) ?? null),
    })),
  };

  return {
    client: { realm: vi.fn(() => realmHandle), core: { users: coreUsers } },
    coreUsers,
    users,
    roles,
    mappings,
    setDuplicateEmailsAllowed(value: boolean) {
      duplicateEmailsAllowed = value;
    },
  };
};

type User = {
  providerId?: string;
  username: string;
  email: string;
  emailVerified: boolean;
  firstName?: string;
  archived: boolean;
  roles: string[];
  attributes?: Record<string, unknown>;
  password?: string;
};

const createUserModel = (keycloak: ReturnType<typeof createKeycloak>, options: Record<string, unknown> = {}) => {
  const schema = new mongoose.Schema<User>({
    providerId: String,
    username: { type: String, required: true },
    email: { type: String, required: true },
    emailVerified: { type: Boolean, default: false },
    firstName: String,
    archived: { type: Boolean, default: false },
    roles: { type: [String], default: [] },
    attributes: { type: mongoose.Schema.Types.Mixed },
    password: String,
  });

  schema.plugin(keycloakUserSyncPlugin, {
    client: keycloak.client as never,
    realm: 'test',
    logger: false,
    ...options,
  });

  return mongoose.model<User>(`KeycloakSyncUser${mongoose.modelNames().length}`, schema);
};

describe('keycloakUserSyncPlugin', () => {
  let keycloak: ReturnType<typeof createKeycloak>;

  beforeEach(() => {
    keycloak = createKeycloak();
  });

  it('creates users, persists their Keycloak ID, and assigns desired roles', async () => {
    const UserModel = createUserModel(keycloak);
    const user = await UserModel.create({
      username: 'alice',
      email: 'alice@example.com',
      emailVerified: true,
      firstName: 'Alice',
      roles: ['editor'],
    });

    expect(keycloak.users[0]).toMatchObject({
      id: 'user-1',
      username: 'alice',
      email: 'alice@example.com',
      emailVerified: true,
      firstName: 'Alice',
      enabled: true,
    });
    expect(user.providerId).toBe('user-1');
    expect((await UserModel.findById(user._id).lean())?.providerId).toBe('user-1');
    expect(keycloak.mappings.get('user-1')?.map((role) => role.name)).toEqual(['editor']);
  });

  it('uses providerId before email in duplicate-email realms and verifies changed emails', async () => {
    keycloak.setDuplicateEmailsAllowed(true);
    keycloak.users.push(
      { id: 'target', username: 'alice', email: 'old@example.com', emailVerified: true },
      { id: 'other', username: 'other', email: 'alice@example.com' },
    );
    const UserModel = createUserModel(keycloak);
    const user = new UserModel({
      providerId: 'target',
      username: 'alice',
      email: 'old@example.com',
      emailVerified: true,
    });
    await user.save();
    keycloak.coreUsers.update.mockClear();
    keycloak.coreUsers.sendVerifyEmail.mockClear();

    user.email = 'alice@example.com';
    await user.save();

    expect(keycloak.coreUsers.find).not.toHaveBeenCalled();
    expect(keycloak.coreUsers.update).toHaveBeenCalledWith(
      { realm: 'test', id: 'target' },
      expect.objectContaining({ email: 'alice@example.com', emailVerified: false }),
    );
    expect(keycloak.coreUsers.sendVerifyEmail).toHaveBeenCalledWith({ realm: 'test', id: 'target' });
  });

  it('uses the previous email to find an existing user after an email change', async () => {
    keycloak.users.push({ id: 'existing', username: 'remote-name', email: 'old@example.com', emailVerified: true });
    const UserModel = createUserModel(keycloak, { identifyBy: 'email', persistProviderId: false });
    const user = new UserModel({ username: 'local-name', email: 'old@example.com', emailVerified: true });
    await user.save();

    user.email = 'new@example.com';
    await user.save();

    expect(keycloak.users).toHaveLength(1);
    expect(keycloak.users[0]).toMatchObject({ id: 'existing', email: 'new@example.com', emailVerified: false });
  });

  it('rejects ambiguous email-only matches and reports the sync error', async () => {
    keycloak.setDuplicateEmailsAllowed(true);
    keycloak.users.push(
      { id: 'one', username: 'one', email: 'same@example.com' },
      { id: 'two', username: 'two', email: 'same@example.com' },
    );
    const onError = vi.fn();
    const UserModel = createUserModel(keycloak, { identifyBy: 'email', onError });

    await expect(UserModel.create({ username: 'local', email: 'same@example.com' })).rejects.toThrow(
      'Cannot identify a unique Keycloak user',
    );
    expect(onError).toHaveBeenCalledWith(expect.any(Error), expect.objectContaining({ operation: 'save' }));
    expect(keycloak.coreUsers.update).not.toHaveBeenCalled();
  });

  it('can log and ignore Keycloak errors', async () => {
    keycloak.coreUsers.find.mockRejectedValueOnce(new Error('Keycloak unavailable'));
    const logger = { error: vi.fn() };
    const onError = vi.fn();
    const UserModel = createUserModel(keycloak, {
      identifyBy: 'email',
      logger,
      onError,
      throwOnError: false,
    });

    const user = await UserModel.create({ username: 'alice', email: 'alice@example.com' });

    expect(user._id).toBeDefined();
    expect(logger.error).toHaveBeenCalledWith(
      'Keycloak user sync failed during save',
      expect.objectContaining({ error: expect.any(Error), operation: 'save' }),
    );
    expect(onError).toHaveBeenCalledOnce();
  });

  it('does not sync changes to disabled fields', async () => {
    const UserModel = createUserModel(keycloak, { syncFields: { email: false } });
    const user = await UserModel.create({ username: 'alice', email: 'old@example.com' });
    keycloak.coreUsers.update.mockClear();

    user.email = 'new@example.com';
    await user.save();

    expect(keycloak.coreUsers.update).not.toHaveBeenCalled();
    expect(keycloak.users[0].email).toBeUndefined();
  });

  it('syncs dynamic attributes from the configured attributes path', async () => {
    const UserModel = createUserModel(keycloak);

    await UserModel.create({
      username: 'alice',
      email: 'alice@example.com',
      attributes: {
        tenantId: 'tenant-1',
        active: true,
        score: 42,
        tags: ['one', 2, false, null],
        ignored: null,
      },
    });

    expect(keycloak.users[0].attributes).toEqual({
      tenantId: ['tenant-1'],
      active: ['true'],
      score: ['42'],
      tags: ['one', '2', 'false'],
    });
  });

  it('syncs mapped managed attributes while preserving unmanaged Keycloak attributes', async () => {
    keycloak.users.push({
      id: 'existing',
      username: 'alice',
      email: 'alice@example.com',
      attributes: {
        tenantId: ['old-tenant'],
        plan: ['old-plan'],
        external: ['keep-me'],
      },
    });
    const UserModel = createUserModel(keycloak, {
      managedAttributes: ['tenantId', 'plan', 'removed'],
      attributePaths: ['attributes'],
      mapAttributes: (document: unknown) => {
        const doc = document as { get(path: string): unknown };
        const attributes = doc.get('attributes') as Record<string, unknown>;

        return {
          tenantId: attributes.tenantId,
          plan: attributes.plan,
        };
      },
    });
    const user = new UserModel({
      providerId: 'existing',
      username: 'alice',
      email: 'alice@example.com',
      attributes: {
        tenantId: 'tenant-2',
      },
    });

    await user.save();

    expect(keycloak.users[0].attributes).toEqual({
      external: ['keep-me'],
      tenantId: ['tenant-2'],
    });
  });

  it('updates the Keycloak password when password syncing is enabled and the password changes', async () => {
    const UserModel = createUserModel(keycloak, { syncFields: { password: true }, passwordTemporary: true });
    const user = await UserModel.create({ username: 'alice', email: 'alice@example.com', password: 'initial-secret' }); // pragma: allowlist secret
    keycloak.coreUsers.resetPassword.mockClear();

    user.password = 'next-secret'; // pragma: allowlist secret
    await user.save();

    expect(keycloak.coreUsers.resetPassword).toHaveBeenCalledWith({
      realm: 'test',
      id: 'user-1',
      credential: {
        temporary: true,
        type: 'password',
        value: 'next-secret',
      },
    });
    expect(keycloak.coreUsers.update).toHaveBeenLastCalledWith(
      { realm: 'test', id: 'user-1' },
      expect.not.objectContaining({ password: expect.any(String) }),
    );
  });

  it('does not update the Keycloak password unless password syncing is enabled', async () => {
    const UserModel = createUserModel(keycloak);
    const user = await UserModel.create({ username: 'alice', email: 'alice@example.com', password: 'initial-secret' }); // pragma: allowlist secret

    user.password = 'next-secret'; // pragma: allowlist secret
    await user.save();

    expect(keycloak.coreUsers.resetPassword).not.toHaveBeenCalled();
  });

  it('deletes the identified Keycloak user before deleting the document', async () => {
    const UserModel = createUserModel(keycloak);
    const user = await UserModel.create({ username: 'alice', email: 'alice@example.com' });

    await user.deleteOne();

    expect(keycloak.coreUsers.del).toHaveBeenCalledWith({ realm: 'test', id: 'user-1' });
    expect(keycloak.users).toHaveLength(0);
  });
});
