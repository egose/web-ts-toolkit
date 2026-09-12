import { format, inspect } from 'node:util';

import mongoose from 'mongoose';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { keycloakUserSyncPlugin } from '../dist/plugins/keycloak-user-sync.mjs';
import { createKeycloakSyncHarness, type KeycloakSyncHarness } from './keycloak-sync-harness';
import { useMongoTestDatabase } from './setup';

useMongoTestDatabase();

type User = {
  providerId?: string;
  username: string;
  email: string;
  emailVerified: boolean;
  firstName?: string;
  lastName?: string;
  enabled?: boolean;
  archived: boolean;
  roles: string[];
  attributes?: Record<string, unknown>;
  password?: string;
};

const createUserModel = (keycloak: KeycloakSyncHarness, options: Record<string, unknown> = {}) => {
  const schema = new mongoose.Schema<User>({
    providerId: String,
    username: { type: String, required: true },
    email: { type: String, required: true },
    emailVerified: { type: Boolean, default: false },
    firstName: String,
    lastName: String,
    enabled: Boolean,
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
  let keycloak: KeycloakSyncHarness;

  beforeEach(() => {
    keycloak = createKeycloakSyncHarness();
  });

  const callCounts = () =>
    keycloak.calls.reduce<Record<string, number>>((counts, call) => {
      counts[call.operation] = (counts[call.operation] ?? 0) + 1;
      return counts;
    }, {});

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
    expect(keycloak.coreUsers.sendVerifyEmail).not.toHaveBeenCalled();
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

  it('does not perform verification writes when emailVerified syncing is disabled', async () => {
    keycloak.users.push({ id: 'existing', username: 'alice', email: 'old@example.com', emailVerified: true });
    const UserModel = createUserModel(keycloak, { identifyBy: 'email', syncFields: { emailVerified: false } });
    const user = new UserModel({ username: 'alice', email: 'old@example.com', emailVerified: true });
    await user.save();
    keycloak.coreUsers.update.mockClear();
    keycloak.coreUsers.sendVerifyEmail.mockClear();

    user.email = 'new@example.com';
    await user.save();

    expect(keycloak.coreUsers.update).toHaveBeenCalledWith(
      { realm: 'test', id: 'existing' },
      expect.not.objectContaining({ emailVerified: expect.any(Boolean) }),
    );
    expect(keycloak.users[0]).toMatchObject({ email: 'new@example.com', emailVerified: true });
    expect(keycloak.coreUsers.sendVerifyEmail).not.toHaveBeenCalled();
  });

  it('rejects ambiguous email-only matches and reports the sync error', async () => {
    keycloak.setDuplicateEmailsAllowed(true);
    keycloak.users.push(
      { id: 'one', username: 'one', email: 'same@example.com' },
      { id: 'two', username: 'two', email: 'same@example.com' },
    );
    const onError = vi.fn();
    const UserModel = createUserModel(keycloak, { identifyBy: 'email', onError });

    let thrown: unknown;
    try {
      await UserModel.create({ username: 'local', email: 'same@example.com' });
    } catch (error) {
      thrown = error;
    }

    expect(thrown).toBeInstanceOf(Error);
    expect((thrown as Error).message).toContain('Cannot identify a unique Keycloak user');
    expect((thrown as Error).message).not.toContain('same@example.com');
    expect(onError).toHaveBeenCalledWith(
      thrown,
      expect.objectContaining({ operation: 'save', localDocumentId: expect.any(String) }),
    );
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
      expect.objectContaining({
        error: expect.objectContaining({ name: 'Error' }),
        operation: 'save',
        localDocumentId: expect.any(String),
      }),
    );
    const loggedError = logger.error.mock.calls[0]?.[1] as { error?: unknown };
    expect(loggedError.error).not.toBeInstanceOf(Error);
    expect(Object.keys(loggedError.error as Record<string, unknown>).sort()).toEqual(['name']);
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
    const UserModel = createUserModel(keycloak, { identifyBy: 'email' });

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
    expect(keycloak.coreUsers.update).not.toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ password: expect.any(String) }),
    );
  });

  it('includes the username when a password-only save creates a missing Keycloak user', async () => {
    const UserModel = createUserModel(keycloak, { syncFields: { password: true }, persistProviderId: false });
    const user = await UserModel.create({ username: 'alice', email: 'alice@example.com' });
    keycloak.users.length = 0;
    keycloak.calls.length = 0;

    user.password = 'next-secret'; // pragma: allowlist secret
    await user.save();

    expect(keycloak.callsFor('user.create')[0]?.args[1]).toMatchObject({
      username: 'alice',
      password: 'next-secret', // pragma: allowlist secret
    });
  });

  it('delegates created-user password provisioning to the fluent user create path with the temporary policy', async () => {
    const UserModel = createUserModel(keycloak, { syncFields: { password: true }, passwordTemporary: true });

    await UserModel.create({ username: 'alice', email: 'alice@example.com', password: 'initial-secret' }); // pragma: allowlist secret

    expect(keycloak.users[0]).not.toHaveProperty('password');
    expect(keycloak.callsFor('user.create')[0]?.args[1]).toMatchObject({ passwordTemporary: true });
    expect(keycloak.coreUsers.resetPassword).toHaveBeenCalledWith({
      realm: 'test',
      id: 'user-1',
      credential: {
        temporary: true,
        type: 'password',
        value: 'initial-secret',
      },
    });
  });

  it('resets created-user passwords as permanent when passwordTemporary is false', async () => {
    const UserModel = createUserModel(keycloak, { syncFields: { password: true }, passwordTemporary: false });

    await UserModel.create({ username: 'alice', email: 'alice@example.com', password: 'initial-secret' }); // pragma: allowlist secret

    expect(keycloak.callsFor('user.create')[0]?.args[1]).toMatchObject({ passwordTemporary: false });
    expect(keycloak.coreUsers.resetPassword).toHaveBeenCalledWith({
      realm: 'test',
      id: 'user-1',
      credential: {
        temporary: false,
        type: 'password',
        value: 'initial-secret',
      },
    });
  });

  it('recovers a one-shot post-create failure without duplicating the remote user', async () => {
    keycloak.failOnce('user.create.after');
    const UserModel = createUserModel(keycloak, { identifyBy: 'username' });

    const user = await UserModel.create({ username: 'alice', email: 'alice@example.com' });

    expect(keycloak.users).toHaveLength(1);
    expect(user.providerId).toBe('user-1');
    expect((await UserModel.findOne({ username: 'alice' }).lean())?.providerId).toBe('user-1');
    expect(keycloak.calls.map((call) => call.operation)).toEqual(
      expect.arrayContaining(['realm.get', 'user.get', 'user.create', 'user.create.after']),
    );
  });

  it.each(['providerId', 'username', 'email'] as const)(
    'converges on one remote user after post-create recovery with %s identity',
    async (identifyBy) => {
      keycloak.failOnce('user.create.after');
      const UserModel = createUserModel(keycloak, { identifyBy });

      const user = await UserModel.create({ username: 'alice', email: 'alice@example.com' });

      expect(keycloak.users).toHaveLength(1);
      expect(user.providerId).toBe('user-1');
      expect(keycloak.callsFor('user.create')).toHaveLength(1);
    },
  );

  it.each([true, false])(
    'keeps a partially provisioned account disabled across repeated credential failures then completes credentials before enablement (temporary=%s)',
    async (passwordTemporary) => {
      keycloak.failOnce('core.users.resetPassword');
      keycloak.failOnce('core.users.resetPassword');
      const UserModel = createUserModel(keycloak, { syncFields: { password: true }, passwordTemporary });

      let thrown: unknown;
      try {
        await UserModel.create({ username: 'alice', email: 'alice@example.com', password: 'initial-secret' }); // pragma: allowlist secret
      } catch (error) {
        thrown = error;
      }

      expect(thrown).toBeInstanceOf(Error);
      // One remote account, still disabled, no duplicate creation.
      expect(keycloak.users).toHaveLength(1);
      expect(keycloak.users[0]).toMatchObject({ id: 'user-1', username: 'alice', enabled: false });
      expect(keycloak.callsFor('user.create')).toHaveLength(1);
      // Initial fluent provisioning plus the same-save recovery retry both failed.
      expect(keycloak.callsFor('core.users.resetPassword')).toHaveLength(2);
      for (const call of keycloak.callsFor('core.users.resetPassword')) {
        expect(call.args[0]).toMatchObject({
          id: 'user-1',
          credential: { temporary: passwordTemporary, type: 'password', value: 'initial-secret' },
        });
      }
      // Recovery never enabled before credentials succeeded.
      const enableUpdates = keycloak
        .callsFor('core.users.update')
        .filter((call) => JSON.stringify(call.args).includes('"enabled":true'));
      expect(enableUpdates).toHaveLength(0);
      // Provider ID was safely persisted before credential work so retry binds authoritatively.
      const persisted = await UserModel.findOne({ username: 'alice' }).orFail();
      expect(persisted.providerId).toBe('user-1');

      // Documented retry: re-apply the pending password; credentials must land before enablement.
      keycloak.calls.length = 0;
      keycloak.coreUsers.resetPassword.mockClear();
      keycloak.coreUsers.update.mockClear();
      const retry = await UserModel.findOne({ username: 'alice' }).orFail();
      retry.password = 'initial-secret'; // pragma: allowlist secret
      retry.markModified('password');
      await retry.save();

      expect(keycloak.users).toHaveLength(1);
      expect(keycloak.users[0]).toMatchObject({ id: 'user-1', enabled: true });
      expect(keycloak.callsFor('user.create')).toHaveLength(0);
      expect(keycloak.coreUsers.resetPassword).toHaveBeenCalledWith({
        realm: 'test',
        id: 'user-1',
        credential: { temporary: passwordTemporary, type: 'password', value: 'initial-secret' },
      });
      const sequence = keycloak.calls.map((call) => call.operation);
      const resetIndex = sequence.lastIndexOf('core.users.resetPassword');
      const updateIndices = sequence
        .map((operation, index) => ({ operation, index }))
        .filter(({ operation }) => operation === 'core.users.update')
        .map(({ index }) => index);
      const enableIndex = updateIndices.find((index) =>
        JSON.stringify(keycloak.calls[index]?.args).includes('"enabled":true'),
      );
      expect(resetIndex).toBeGreaterThanOrEqual(0);
      expect(enableIndex).toBeGreaterThanOrEqual(0);
      expect(enableIndex as number).toBeGreaterThan(resetIndex);
      expect((await UserModel.findOne({ username: 'alice' }).lean())?.providerId).toBe('user-1');
    },
  );

  it('does not reset another account on an already-exists collision during password creation', async () => {
    keycloak.users.push({ id: 'user-b', username: 'bob', email: 'b@example.com', enabled: true });
    const UserModel = createUserModel(keycloak, {
      identifyBy: 'email',
      syncFields: { password: true },
      passwordTemporary: true,
    });

    let thrown: unknown;
    try {
      await UserModel.create({ username: 'bob', email: 'new@example.com', password: 'initial-secret' }); // pragma: allowlist secret
    } catch (error) {
      thrown = error;
    }

    expect(thrown).toBeInstanceOf(Error);
    expect((thrown as Error).message).toMatch(/already exists/i);
    expect(keycloak.users).toHaveLength(1);
    expect(keycloak.users[0]).toMatchObject({ id: 'user-b', username: 'bob', email: 'b@example.com' });
    expect(keycloak.callsFor('core.users.resetPassword')).toHaveLength(0);
    expect(keycloak.callsFor('core.users.update')).toHaveLength(0);
    expect(keycloak.callsFor('user.update')).toHaveLength(0);
  });

  it('does not swallow an unrelated creation failure to reset a same-email account', async () => {
    keycloak.users.push({ id: 'user-b', username: 'bob', email: 'shared@example.com', enabled: true });
    keycloak.failOnce('user.create', new Error('Injected Keycloak failure at user.create'));
    const UserModel = createUserModel(keycloak, {
      identifyBy: 'username',
      syncFields: { password: true },
      passwordTemporary: false,
    });

    let thrown: unknown;
    try {
      await UserModel.create({ username: 'alice', email: 'shared@example.com', password: 'initial-secret' }); // pragma: allowlist secret
    } catch (error) {
      thrown = error;
    }

    expect(thrown).toBeInstanceOf(Error);
    expect((thrown as Error).message).toContain('Injected Keycloak failure at user.create');
    expect(keycloak.users).toHaveLength(1);
    expect(keycloak.users[0]).toMatchObject({ id: 'user-b', username: 'bob', email: 'shared@example.com' });
    expect(keycloak.callsFor('core.users.resetPassword')).toHaveLength(0);
    expect(keycloak.callsFor('core.users.update')).toHaveLength(0);
    expect(keycloak.callsFor('user.update')).toHaveLength(0);
  });

  it('distinguishes initial linking from a persisted email transition', async () => {
    keycloak.users.push({ id: 'existing', username: 'alice', email: 'alice@example.com', emailVerified: true });
    const UserModel = createUserModel(keycloak, { identifyBy: 'email' });

    await UserModel.create({ username: 'alice', email: 'alice@example.com', emailVerified: true });

    expect(keycloak.users[0]).toMatchObject({ id: 'existing', email: 'alice@example.com', emailVerified: true });
    expect(keycloak.coreUsers.update).toHaveBeenCalledWith(
      { realm: 'test', id: 'existing' },
      expect.not.objectContaining({ emailVerified: expect.any(Boolean) }),
    );
    expect(keycloak.coreUsers.sendVerifyEmail).not.toHaveBeenCalled();

    keycloak.coreUsers.update.mockClear();
    keycloak.coreUsers.sendVerifyEmail.mockClear();
    const user = await UserModel.findOne({ username: 'alice' }).orFail();
    user.email = 'next@example.com';
    await user.save();

    expect(keycloak.coreUsers.update).toHaveBeenCalledWith(
      { realm: 'test', id: 'existing' },
      expect.objectContaining({ email: 'next@example.com', emailVerified: false }),
    );
    expect(keycloak.coreUsers.sendVerifyEmail).toHaveBeenCalledWith({ realm: 'test', id: 'existing' });
  });

  it('corrects remote email drift using the configured verification policy', async () => {
    keycloak.users.push({ id: 'existing', username: 'alice', email: 'alice@example.com', emailVerified: true });
    const UserModel = createUserModel(keycloak);
    const user = await UserModel.create({ username: 'alice', email: 'alice@example.com', emailVerified: true });
    keycloak.users[0].email = 'drift@example.com';
    keycloak.coreUsers.update.mockClear();
    keycloak.coreUsers.sendVerifyEmail.mockClear();

    user.firstName = 'Alice';
    await user.save();

    expect(keycloak.coreUsers.update).toHaveBeenCalledWith(
      { realm: 'test', id: 'existing' },
      expect.objectContaining({ email: 'alice@example.com', emailVerified: false, firstName: 'Alice' }),
    );
    expect(keycloak.coreUsers.sendVerifyEmail).toHaveBeenCalledWith({ realm: 'test', id: 'existing' });
  });

  it('bounds remote calls for new users with zero, one, and many desired roles', async () => {
    const UserModel = createUserModel(keycloak);

    await UserModel.create({ username: 'zero', email: 'zero@example.com', roles: [] });

    expect(callCounts()).toEqual({
      'realm.get': 1,
      'user.get': 1,
      'realm.searchUsers': 1,
      'core.users.find': 1,
      'user.create': 1,
      'user.create.after': 1,
    });

    keycloak.calls.length = 0;
    await UserModel.create({ username: 'alice', email: 'alice@example.com', roles: ['editor'] });

    expect(callCounts()).toEqual({
      'realm.get': 1,
      'user.get': 1,
      'realm.searchUsers': 1,
      'core.users.find': 1,
      'user.create': 1,
      'user.create.after': 1,
      'user.reconcileRealmRoles': 1,
      'role.ensure': 1,
      'role.get': 1,
      'core.users.listRealmRoleMappings': 1,
      'core.users.addRealmRoleMappings': 1,
    });

    keycloak.calls.length = 0;
    await UserModel.create({
      username: 'many',
      email: 'many@example.com',
      roles: ['admin', 'editor', 'viewer'],
    });

    expect(callCounts()).toEqual({
      'realm.get': 1,
      'user.get': 1,
      'realm.searchUsers': 1,
      'core.users.find': 1,
      'user.create': 1,
      'user.create.after': 1,
      'user.reconcileRealmRoles': 1,
      'role.ensure': 2,
      'role.get': 3,
      'core.users.listRealmRoleMappings': 1,
      'core.users.addRealmRoleMappings': 1,
    });
  });

  it('bounds remote calls for representative single-field updates', async () => {
    const UserModel = createUserModel(keycloak, { syncFields: { password: true } });
    const user = await UserModel.create({
      username: 'alice',
      email: 'alice@example.com',
      firstName: 'Alice',
      roles: ['editor'],
      attributes: { tenantId: 'tenant-1' },
      password: 'initial-secret', // pragma: allowlist secret
    });

    keycloak.calls.length = 0;
    user.firstName = 'Alicia';
    await user.save();

    expect(callCounts()).toEqual({
      'realm.get': 1,
      'user.getById': 2,
      'user.update': 1,
      'core.users.update': 1,
    });

    keycloak.calls.length = 0;
    user.attributes = { tenantId: 'tenant-2' };
    await user.save();

    expect(callCounts()).toEqual({
      'realm.get': 1,
      'user.getById': 2,
      'user.update': 1,
      'core.users.update': 1,
    });
  });

  it('rejects caller-controlled role arrays beyond the configured per-sync bound before role requests', async () => {
    const UserModel = createUserModel(keycloak, { maxRolesPerSync: 2 });
    const user = await UserModel.create({ username: 'alice', email: 'alice@example.com', roles: ['admin'] });
    keycloak.calls.length = 0;

    user.roles = ['admin', 'editor', 'viewer'];

    await expect(user.save()).rejects.toThrow('at most 2 desired roles per sync operation');
    expect(keycloak.callsFor('role.ensure')).toHaveLength(0);
    expect(keycloak.callsFor('role.get')).toHaveLength(0);
    expect(keycloak.callsFor('core.users.listRealmRoleMappings')).toHaveLength(0);
  });

  it('redacts the full document, plaintext password, and email from default error reporting', async () => {
    keycloak.coreUsers.find.mockRejectedValueOnce(new Error('Keycloak unavailable'));
    const logger = { error: vi.fn() };
    const onError = vi.fn();
    const UserModel = createUserModel(keycloak, {
      identifyBy: 'email',
      logger,
      onError,
      syncFields: { password: true },
      throwOnError: false,
    });

    await UserModel.create({ username: 'alice', email: 'alice@example.com', password: 'initial-secret' }); // pragma: allowlist secret

    const logContext = logger.error.mock.calls[0]?.[1] as Record<string, unknown>;
    const callbackContext = onError.mock.calls[0]?.[1] as Record<string, unknown>;

    expect(logContext).toMatchObject({ operation: 'save', localDocumentId: expect.any(String) });
    expect(logContext).not.toHaveProperty('document');
    expect(callbackContext).toMatchObject({ operation: 'save', localDocumentId: expect.any(String) });
    expect(callbackContext).not.toHaveProperty('document');
    expect(JSON.stringify(logContext)).not.toContain('initial-secret');
    expect(JSON.stringify(logContext)).not.toContain('alice@example.com');
    expect(JSON.stringify(callbackContext)).not.toContain('initial-secret');
    expect(JSON.stringify(callbackContext)).not.toContain('alice@example.com');
  });

  it('sanitizes hostile transport errors at the custom logger boundary while preserving the original error', async () => {
    const passwordSentinel = 'moo03-pw-9f2KqX7zQb4'; // pragma: allowlist secret
    const tokenSentinel = 'moo03-token-4HbT2mZkR8';
    const emailSentinel = 'moo03-sentinel-inbox@example.invalid';
    const toJSON = vi.fn(() => ({ leaked: passwordSentinel }));
    const customInspect = vi.fn(() => `custom-inspect ${tokenSentinel}`);
    const hostile = new Error(`create failed for password ${passwordSentinel}`);
    hostile.name = 'TransportError';
    hostile.stack = `TransportError: boom ${tokenSentinel}\n    at test`;
    hostile.cause = new Error(`cause holds ${emailSentinel} and ${passwordSentinel}`);
    Object.assign(hostile, {
      code: 'TRANSPORT_FAIL',
      status: 502,
      request: {
        headers: { authorization: `Bearer ${tokenSentinel}`, 'x-email': emailSentinel },
        body: { password: passwordSentinel },
      },
      response: { status: 502, data: { email: emailSentinel, token: tokenSentinel } },
      password: passwordSentinel,
      token: tokenSentinel,
    });
    (hostile as unknown as Record<string | symbol, unknown>).toJSON = toJSON;
    (hostile as unknown as Record<string | symbol, unknown>)[Symbol.for('nodejs.util.inspect.custom')] = customInspect;

    keycloak.coreUsers.find.mockRejectedValueOnce(hostile);
    const logger = { error: vi.fn() };
    const onError = vi.fn();
    const UserModel = createUserModel(keycloak, { identifyBy: 'email', logger, onError, throwOnError: false });

    await UserModel.create({ username: 'alice', email: 'alice@example.com' });

    expect(logger.error).toHaveBeenCalledTimes(1);
    expect(onError).toHaveBeenCalledTimes(1);
    expect(onError.mock.calls[0]?.[0]).toBe(hostile);

    const [logMessage, logContext] = logger.error.mock.calls[0] as [unknown, Record<string, unknown>];
    expect(logMessage).toBe('Keycloak user sync failed during save');
    expect(logContext).toMatchObject({ operation: 'save', localDocumentId: expect.any(String) });
    expect(Object.keys(logContext).sort()).toEqual(['error', 'localDocumentId', 'operation']);
    expect(logContext.error).toEqual({ name: 'TransportError', code: 'TRANSPORT_FAIL', status: 502 });
    expect(logContext.error).not.toBe(hostile);

    const sentinels = [passwordSentinel, tokenSentinel, emailSentinel];
    const seen = new Set<unknown>();
    const pending: unknown[] = [logMessage, logContext];
    while (pending.length > 0) {
      const value = pending.pop();
      if (typeof value === 'string') {
        for (const sentinel of sentinels) expect(value).not.toContain(sentinel);
      } else if (Array.isArray(value)) {
        if (!seen.has(value)) {
          seen.add(value);
          pending.push(...value);
        }
      } else if (typeof value === 'object' && value !== null) {
        if (!seen.has(value)) {
          seen.add(value);
          pending.push(...Object.values(value));
        }
      }
    }
    for (const sentinel of sentinels) {
      expect(String(logMessage)).not.toContain(sentinel);
      expect(inspect(logContext, { depth: null, getters: true })).not.toContain(sentinel);
      expect(format('%O', logContext)).not.toContain(sentinel);
      expect(JSON.stringify(logContext) ?? '').not.toContain(sentinel);
    }
    expect(toJSON).not.toHaveBeenCalled();
    expect(customInspect).not.toHaveBeenCalled();
  });

  it('sanitizes errors reported through the default console logger', async () => {
    const passwordSentinel = 'moo03-console-pw-7dWqL3mN5'; // pragma: allowlist secret
    const tokenSentinel = 'moo03-console-token-8KpX1vYr6';
    const emailSentinel = 'moo03-console-inbox@example.invalid';
    const hostile = new Error(`lookup failed ${passwordSentinel}`);
    hostile.name = 'TransportError';
    hostile.stack = `TransportError: console boom ${tokenSentinel}`;
    hostile.cause = { detail: emailSentinel, token: tokenSentinel };
    Object.assign(hostile, {
      request: { headers: { authorization: `Bearer ${tokenSentinel}` }, body: { password: passwordSentinel } },
      response: { data: { email: emailSentinel } },
    });

    keycloak.coreUsers.find.mockRejectedValueOnce(hostile);
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    try {
      const UserModel = createUserModel(keycloak, {
        identifyBy: 'email',
        logger: undefined,
        throwOnError: false,
      });

      await UserModel.create({ username: 'alice', email: 'alice@example.com' });

      expect(consoleError).toHaveBeenCalledTimes(1);
      const [logMessage, logContext] = consoleError.mock.calls[0] as [unknown, Record<string, unknown>];
      expect(logMessage).toBe('Keycloak user sync failed during save');
      expect(logContext).toMatchObject({ operation: 'save', localDocumentId: expect.any(String) });
      expect(logContext.error).toEqual({ name: 'TransportError' });

      for (const sentinel of [passwordSentinel, tokenSentinel, emailSentinel]) {
        expect(String(logMessage)).not.toContain(sentinel);
        expect(inspect(logContext, { depth: null, getters: true })).not.toContain(sentinel);
        expect(format('%O', logContext)).not.toContain(sentinel);
        expect(JSON.stringify(logContext) ?? '').not.toContain(sentinel);
      }
    } finally {
      consoleError.mockRestore();
    }
  });

  it('preserves original error identity on delete with sanitized logging and failing observers', async () => {
    const passwordSentinel = 'moo03-delete-pw-2TnB6wJs9'; // pragma: allowlist secret
    const tokenSentinel = 'moo03-delete-token-5YcF8hLd3';
    const emailSentinel = 'moo03-delete-inbox@example.invalid';
    const hostile = new Error(`delete failed ${passwordSentinel}`);
    hostile.name = 'TransportError';
    hostile.stack = `TransportError: delete boom ${tokenSentinel}`;
    hostile.cause = new Error(`delete cause ${emailSentinel}`);
    Object.assign(hostile, {
      request: { headers: { authorization: `Bearer ${tokenSentinel}` }, body: { password: passwordSentinel } },
      response: { data: { email: emailSentinel } },
    });

    const logger = { error: vi.fn(() => Promise.reject(new Error('logger failed'))) };
    const onError = vi.fn(() => {
      throw new Error('callback failed');
    });
    const UserModel = createUserModel(keycloak, { identifyBy: 'username', logger, onError });
    const user = await UserModel.create({ username: 'alice', email: 'alice@example.com' });
    expect(logger.error).not.toHaveBeenCalled();

    keycloak.coreUsers.del.mockRejectedValueOnce(hostile);
    await expect(user.deleteOne()).rejects.toBe(hostile);

    expect(logger.error).toHaveBeenCalledTimes(1);
    expect(onError).toHaveBeenCalledTimes(1);
    expect(onError.mock.calls[0]?.[0]).toBe(hostile);
    const [logMessage, logContext] = logger.error.mock.calls[0] as [unknown, Record<string, unknown>];
    expect(logMessage).toBe('Keycloak user sync failed during delete');
    expect(logContext).toMatchObject({ operation: 'delete', localDocumentId: expect.any(String) });
    expect(logContext.error).toEqual({ name: 'TransportError' });
    for (const sentinel of [passwordSentinel, tokenSentinel, emailSentinel]) {
      expect(inspect(logContext, { depth: null, getters: true })).not.toContain(sentinel);
      expect(format('%O', logContext)).not.toContain(sentinel);
      expect(JSON.stringify(logContext) ?? '').not.toContain(sentinel);
    }
  });

  it('passes the full document to onError only when sensitive document context is explicitly enabled', async () => {
    keycloak.coreUsers.find.mockRejectedValueOnce(new Error('Keycloak unavailable'));
    const onError = vi.fn();
    const UserModel = createUserModel(keycloak, {
      identifyBy: 'email',
      includeDocumentInErrorContext: true,
      onError,
      syncFields: { password: true },
      throwOnError: false,
    });

    await UserModel.create({ username: 'alice', email: 'alice@example.com', password: 'initial-secret' }); // pragma: allowlist secret

    const context = onError.mock.calls[0]?.[1] as { document?: { get(path: string): unknown } };
    expect(context.document?.get('password')).toBe('initial-secret');
  });

  it('keeps callback failures best-effort when throwOnError is false', async () => {
    keycloak.coreUsers.find.mockRejectedValueOnce(new Error('Keycloak unavailable'));
    const logger = { error: vi.fn(() => undefined) };
    const onError = vi.fn(() => {
      throw new Error('callback failed');
    });
    const UserModel = createUserModel(keycloak, {
      identifyBy: 'email',
      logger,
      onError,
      throwOnError: false,
    });

    await expect(UserModel.create({ username: 'alice', email: 'alice@example.com' })).resolves.toBeDefined();
    expect(onError).toHaveBeenCalledOnce();
  });

  it('throws the original sync error when logger and callback fail with throwOnError enabled', async () => {
    const original = new Error('Keycloak unavailable');
    keycloak.coreUsers.find.mockRejectedValueOnce(original);
    const logger = { error: vi.fn(() => Promise.reject(new Error('logger failed'))) };
    const onError = vi.fn(() => {
      throw new Error('callback failed');
    });
    const UserModel = createUserModel(keycloak, {
      identifyBy: 'email',
      logger,
      onError,
    });

    await expect(UserModel.create({ username: 'alice', email: 'alice@example.com' })).rejects.toThrow(
      'Keycloak unavailable',
    );
    await expect(UserModel.create({ username: 'bob', email: 'bob@example.com' })).resolves.toBeDefined();
    expect(logger.error).toHaveBeenCalledOnce();
    expect(onError).toHaveBeenCalledOnce();
  });

  it('rejects invalid configuration at plugin registration', () => {
    expect(() => createUserModel(keycloak, { identifyBy: [] })).toThrow('identifyBy must not be empty');
    expect(() => createUserModel(keycloak, { identifyBy: ['providerId', 'unsupported'] })).toThrow(
      'identifyBy[1] must be providerId, username, or email',
    );
    expect(() => createUserModel(keycloak, { realm: '   ' })).toThrow('requires a non-empty realm option');
    expect(() => createUserModel(keycloak, { paths: { username: '   ' } })).toThrow(
      'requires a non-empty paths.username',
    );
    expect(() => createUserModel(keycloak, { attributePaths: ['tenantId', '   '] })).toThrow(
      'attributePaths[1] must be a non-empty string',
    );
    expect(() => createUserModel(keycloak, { paths: { firstName: 'profile.firstName' } })).toThrow(
      'paths.firstName path "profile.firstName" does not exist in the schema',
    );
  });

  it('rejects duplicate registration on the same schema', () => {
    const schema = new mongoose.Schema<User>({
      providerId: String,
      username: String,
      email: String,
      emailVerified: Boolean,
      firstName: String,
      lastName: String,
      archived: Boolean,
      roles: [String],
      attributes: mongoose.Schema.Types.Mixed,
    });

    schema.plugin(keycloakUserSyncPlugin, { client: keycloak.client as never, realm: 'test', logger: false });

    expect(() => {
      schema.plugin(keycloakUserSyncPlugin, { client: keycloak.client as never, realm: 'test', logger: false });
    }).toThrow('already registered');
  });

  it('snapshots mutable options at registration', async () => {
    const options = {
      identifyBy: ['username'],
      managedRoles: ['editor'],
      paths: { username: 'username' },
    };
    const UserModel = createUserModel(keycloak, options);
    options.identifyBy.splice(0, 1, 'email');
    options.managedRoles.splice(0, 1, 'external');
    options.paths.username = 'email';

    keycloak.users.push({ id: 'existing', username: 'alice', email: 'other@example.com' });
    keycloak.roles.set('editor', { id: 'role-1', name: 'editor' });
    keycloak.roles.set('external', { id: 'role-2', name: 'external' });
    keycloak.mappings.set('existing', [{ id: 'role-2', name: 'external' }]);

    await UserModel.create({ username: 'alice', email: 'alice@example.com', roles: [] });

    expect(keycloak.users).toHaveLength(1);
    expect(keycloak.users[0].id).toBe('existing');
    expect(keycloak.mappings.get('existing')?.map((role) => role.name)).toEqual(['external']);
  });

  it('does not allow providerId changes to redirect synchronization after persistence', async () => {
    keycloak.users.push(
      { id: 'target', username: 'alice', email: 'alice@example.com' },
      { id: 'other', username: 'bob', email: 'bob@example.com' },
    );
    const UserModel = createUserModel(keycloak, { identifyBy: 'providerId' });
    const user = await UserModel.create({ providerId: 'target', username: 'alice', email: 'alice@example.com' });
    keycloak.calls.length = 0;

    user.providerId = 'other';
    user.firstName = 'Redirected';

    await expect(user.save()).rejects.toThrow('providerId is server-controlled');
    expect(keycloak.calls).toHaveLength(0);
    expect(keycloak.users.find((remoteUser) => remoteUser.id === 'other')).not.toMatchObject({
      firstName: 'Redirected',
    });
  });

  it('preserves unrelated assigned roles by default while adding desired roles', async () => {
    keycloak.users.push({ id: 'existing', username: 'alice', email: 'alice@example.com' });
    keycloak.roles.set('editor', { id: 'role-1', name: 'editor' });
    keycloak.roles.set('external', { id: 'role-2', name: 'external' });
    keycloak.mappings.set('existing', [{ id: 'role-2', name: 'external' }]);
    const UserModel = createUserModel(keycloak, { identifyBy: 'username' });

    await UserModel.create({ username: 'alice', email: 'alice@example.com', roles: ['editor'] });

    expect(keycloak.mappings.get('existing')?.map((role) => role.name)).toEqual(['external', 'editor']);
    expect(keycloak.coreUsers.delRealmRoleMappings).not.toHaveBeenCalled();
  });

  it.each([
    ['omitted', {}, { username: 'alice', email: 'alice@example.com' }],
    [
      'invalid',
      { paths: { roles: 'firstName' } },
      { username: 'alice', email: 'alice@example.com', firstName: 'not-an-array' },
    ],
    ['empty', {}, { username: 'alice', email: 'alice@example.com', roles: [] }],
    ['incomplete', {}, { username: 'alice', email: 'alice@example.com', roles: ['editor'] }],
  ] as const)('does not remove unrelated assigned roles by default for %s local roles', async (_case, options, doc) => {
    keycloak.users.push({ id: 'existing', username: 'alice', email: 'alice@example.com' });
    keycloak.roles.set('editor', { id: 'role-1', name: 'editor' });
    keycloak.roles.set('external', { id: 'role-2', name: 'external' });
    keycloak.mappings.set('existing', [
      { id: 'role-1', name: 'editor' },
      { id: 'role-2', name: 'external' },
    ]);
    const UserModel = createUserModel(keycloak, { identifyBy: 'username', ...options });

    await UserModel.create(doc);

    expect(keycloak.mappings.get('existing')?.map((role) => role.name)).toEqual(['editor', 'external']);
    expect(keycloak.coreUsers.delRealmRoleMappings).not.toHaveBeenCalled();
  });

  it('removes stale assigned roles only inside managedRoles', async () => {
    keycloak.users.push({ id: 'existing', username: 'alice', email: 'alice@example.com' });
    keycloak.roles.set('viewer', { id: 'role-1', name: 'viewer' });
    keycloak.roles.set('editor', { id: 'role-2', name: 'editor' });
    keycloak.roles.set('external', { id: 'role-3', name: 'external' });
    keycloak.mappings.set('existing', [
      { id: 'role-2', name: 'editor' },
      { id: 'role-3', name: 'external' },
    ]);
    const UserModel = createUserModel(keycloak, {
      identifyBy: 'username',
      managedRoles: ['editor', 'viewer'],
    });

    await UserModel.create({ username: 'alice', email: 'alice@example.com', roles: ['viewer'] });

    expect(keycloak.mappings.get('existing')?.map((role) => role.name)).toEqual(['external', 'viewer']);
    expect(keycloak.coreUsers.delRealmRoleMappings).toHaveBeenCalledWith({
      realm: 'test',
      id: 'existing',
      roles: [{ id: 'role-2', name: 'editor' }],
    });
  });

  it('treats an empty local role array as an intentional empty managed-role set', async () => {
    keycloak.users.push({ id: 'existing', username: 'alice', email: 'alice@example.com' });
    keycloak.roles.set('editor', { id: 'role-1', name: 'editor' });
    keycloak.roles.set('external', { id: 'role-2', name: 'external' });
    keycloak.mappings.set('existing', [
      { id: 'role-1', name: 'editor' },
      { id: 'role-2', name: 'external' },
    ]);
    const UserModel = createUserModel(keycloak, { identifyBy: 'username', managedRoles: ['editor'] });

    await UserModel.create({ username: 'alice', email: 'alice@example.com', roles: [] });

    expect(keycloak.mappings.get('existing')?.map((role) => role.name)).toEqual(['external']);
  });

  it('fails on missing desired roles when ensureRoles is false', async () => {
    const UserModel = createUserModel(keycloak, { ensureRoles: false });

    await expect(
      UserModel.create({ username: 'alice', email: 'alice@example.com', roles: ['missing'] }),
    ).rejects.toThrow('Role "missing" not found in realm "test"');
    expect(keycloak.callsFor('role.ensure')).toHaveLength(0);
  });

  it('uses mapped roles for additive and managed-role reconciliation', async () => {
    keycloak.users.push({ id: 'existing', username: 'alice', email: 'alice@example.com' });
    keycloak.roles.set('app:editor', { id: 'role-1', name: 'app:editor' });
    keycloak.roles.set('app:viewer', { id: 'role-2', name: 'app:viewer' });
    keycloak.mappings.set('existing', [{ id: 'role-2', name: 'app:viewer' }]);
    const UserModel = createUserModel(keycloak, {
      identifyBy: 'username',
      managedRoles: ['app:editor', 'app:viewer'],
      mapRoles: (roles: unknown) => (Array.isArray(roles) ? roles.map((role) => `app:${role}`) : []),
    });

    await UserModel.create({ username: 'alice', email: 'alice@example.com', roles: ['editor'] });

    expect(keycloak.mappings.get('existing')?.map((role) => role.name)).toEqual(['app:editor']);
  });

  it('can retry role assignment after a transient mapping failure', async () => {
    keycloak.failOnce('core.users.addRealmRoleMappings');
    keycloak.roles.set('editor', { id: 'role-1', name: 'editor' });
    keycloak.roles.set('viewer', { id: 'role-2', name: 'viewer' });
    const UserModel = createUserModel(keycloak, { throwOnError: false });

    const user = await UserModel.create({ username: 'alice', email: 'alice@example.com', roles: ['editor'] });
    expect(keycloak.mappings.get('user-1')).toBeUndefined();

    user.roles = ['editor', 'viewer'];
    await user.save();

    expect(keycloak.mappings.get('user-1')?.map((role) => role.name)).toEqual(['editor', 'viewer']);
  });

  it('clears owned profile string fields with null, empty, or whitespace-only local values', async () => {
    keycloak.users.push({
      id: 'existing',
      username: 'alice',
      email: 'alice@example.com',
      firstName: 'Alice',
      lastName: 'Smith',
    });
    const UserModel = createUserModel(keycloak, { identifyBy: 'username' });

    const user = await UserModel.create({
      username: 'alice',
      email: 'alice@example.com',
      firstName: '',
      lastName: null as never,
    });

    expect(keycloak.users[0]).toMatchObject({ firstName: '', lastName: '' });
    expect(keycloak.coreUsers.update).toHaveBeenCalledWith(
      { realm: 'test', id: 'existing' },
      expect.objectContaining({ firstName: '', lastName: '' }),
    );

    keycloak.coreUsers.update.mockClear();
    user.firstName = '   ';
    await user.save();

    expect(keycloak.users[0].firstName).toBe('');
    expect(keycloak.coreUsers.update).toHaveBeenCalledWith(
      { realm: 'test', id: 'existing' },
      expect.objectContaining({ firstName: '' }),
    );

    keycloak.coreUsers.update.mockClear();
    await user.save();

    expect(keycloak.coreUsers.update).not.toHaveBeenCalled();
  });

  it('omits disabled profile fields instead of clearing unmanaged remote values', async () => {
    keycloak.users.push({ id: 'existing', username: 'alice', email: 'alice@example.com', firstName: 'Alice' });
    const UserModel = createUserModel(keycloak, { identifyBy: 'username', syncFields: { firstName: false } });

    await UserModel.create({ username: 'alice', email: 'alice@example.com', firstName: '' });

    expect(keycloak.users[0].firstName).toBe('Alice');
    expect(keycloak.coreUsers.update).toHaveBeenCalledWith(
      { realm: 'test', id: 'existing' },
      expect.not.objectContaining({ firstName: expect.anything() }),
    );
  });

  it('preserves unmanaged attributes after email-based resolution fetches the complete user', async () => {
    keycloak.users.push({
      id: 'existing',
      username: 'alice',
      email: 'alice@example.com',
      attributes: { external: ['keep-me'], tenantId: ['old-tenant'] },
    });
    const UserModel = createUserModel(keycloak, {
      identifyBy: 'email',
      managedAttributes: ['tenantId'],
    });

    await UserModel.create({
      username: 'alice',
      email: 'alice@example.com',
      attributes: { tenantId: 'tenant-2' },
    });

    expect(keycloak.callsFor('core.users.find')).toHaveLength(1);
    expect(keycloak.callsFor('user.getById')).toHaveLength(2);
    expect(keycloak.users[0].attributes).toEqual({ external: ['keep-me'], tenantId: ['tenant-2'] });
  });

  it('removes managed attributes for null, undefined, invalid, and empty-array values without removing unmanaged attributes', async () => {
    keycloak.users.push({
      id: 'existing',
      username: 'alice',
      email: 'alice@example.com',
      attributes: {
        emptyList: ['old-empty'],
        external: ['keep-me'],
        invalid: ['old-invalid'],
        missing: ['old-missing'],
        nullable: ['old-null'],
      },
    });
    const UserModel = createUserModel(keycloak, {
      identifyBy: 'username',
      managedAttributes: ['emptyList', 'invalid', 'missing', 'nullable'],
      mapAttributes: () => ({
        emptyList: [],
        invalid: { nested: true },
        nullable: null,
      }),
    });

    await UserModel.create({ username: 'alice', email: 'alice@example.com' });

    expect(keycloak.users[0].attributes).toEqual({ external: ['keep-me'] });
  });

  it('rejects prototype-like managed and mapped attribute keys', async () => {
    expect(() => createUserModel(keycloak, { managedAttributes: ['__proto__'] })).toThrow(
      'attribute key "__proto__" is not supported',
    );

    const attributes = Object.create(null) as Record<string, unknown>;
    attributes.constructor = 'polluted';
    const UserModel = createUserModel(keycloak, {
      mapAttributes: () => attributes,
    });

    await expect(UserModel.create({ username: 'alice', email: 'alice@example.com' })).rejects.toThrow(
      'attribute key "constructor" is not supported',
    );
    expect(Object.prototype).not.toHaveProperty('constructor', 'polluted');
  });

  it('does not update the Keycloak password unless password syncing is enabled', async () => {
    const UserModel = createUserModel(keycloak);
    const user = await UserModel.create({ username: 'alice', email: 'alice@example.com', password: 'initial-secret' }); // pragma: allowlist secret

    user.password = 'next-secret'; // pragma: allowlist secret
    await user.save();

    expect(keycloak.coreUsers.resetPassword).not.toHaveBeenCalled();
  });

  it('does not reconcile roles or reset passwords for a first-name-only change', async () => {
    const UserModel = createUserModel(keycloak, { syncFields: { password: true } });
    const user = await UserModel.create({
      username: 'alice',
      email: 'alice@example.com',
      firstName: 'Alice',
      password: 'initial-secret', // pragma: allowlist secret
      roles: ['editor'],
    });
    keycloak.coreUsers.resetPassword.mockClear();
    keycloak.coreUsers.listRealmRoleMappings.mockClear();
    keycloak.coreUsers.addRealmRoleMappings.mockClear();
    keycloak.coreUsers.delRealmRoleMappings.mockClear();
    keycloak.calls.length = 0;

    user.firstName = 'Alicia';
    await user.save();

    expect(keycloak.coreUsers.update).toHaveBeenCalledWith(
      { realm: 'test', id: 'user-1' },
      expect.objectContaining({ firstName: 'Alicia' }),
    );
    expect(keycloak.coreUsers.resetPassword).not.toHaveBeenCalled();
    expect(keycloak.coreUsers.listRealmRoleMappings).not.toHaveBeenCalled();
    expect(keycloak.coreUsers.addRealmRoleMappings).not.toHaveBeenCalled();
    expect(keycloak.coreUsers.delRealmRoleMappings).not.toHaveBeenCalled();
  });

  it('updates only attributes for an attribute-only change', async () => {
    const UserModel = createUserModel(keycloak);
    const user = await UserModel.create({
      username: 'alice',
      email: 'alice@example.com',
      firstName: 'Alice',
      attributes: { tenantId: 'tenant-1' },
      roles: ['editor'],
    });
    keycloak.coreUsers.update.mockClear();
    keycloak.coreUsers.listRealmRoleMappings.mockClear();

    user.attributes = { tenantId: 'tenant-2' };
    await user.save();

    expect(keycloak.coreUsers.update).toHaveBeenCalledWith(
      { realm: 'test', id: 'user-1' },
      { attributes: { tenantId: ['tenant-2'] } },
    );
    expect(keycloak.coreUsers.listRealmRoleMappings).not.toHaveBeenCalled();
  });

  it('rejects session-backed saves before remote calls under the direct-hook contract', async () => {
    const UserModel = createUserModel(keycloak);
    const session = await mongoose.startSession();

    try {
      await expect(new UserModel({ username: 'alice', email: 'alice@example.com' }).save({ session })).rejects.toThrow(
        'do not support Mongoose sessions or transactions',
      );
    } finally {
      await session.endSession();
    }

    expect(keycloak.calls).toHaveLength(0);
    expect(await UserModel.findOne({ username: 'alice' }).lean()).toBeNull();
  });

  it('rejects session-backed deletes before remote calls under the direct-hook contract', async () => {
    const UserModel = createUserModel(keycloak);
    const user = await UserModel.create({ username: 'alice', email: 'alice@example.com' });
    keycloak.calls.length = 0;
    const session = await mongoose.startSession();

    try {
      await expect(user.deleteOne({ session })).rejects.toThrow('do not support Mongoose sessions or transactions');
    } finally {
      await session.endSession();
    }

    expect(keycloak.calls).toHaveLength(0);
    expect(await UserModel.findById(user._id).lean()).toMatchObject({ username: 'alice' });
    expect(keycloak.users).toHaveLength(1);
  });

  it('deletes the identified Keycloak user before deleting the document', async () => {
    const UserModel = createUserModel(keycloak);
    const user = await UserModel.create({ username: 'alice', email: 'alice@example.com' });

    await user.deleteOne();

    expect(keycloak.coreUsers.del).toHaveBeenCalledWith({ realm: 'test', id: 'user-1' });
    expect(keycloak.users).toHaveLength(0);
  });

  it.each([[['email']], [['email', 'username']]] as const)(
    'rejects an A-to-B email collision without touching B for %s ordering',
    async (identifyBy) => {
      keycloak.users.push(
        { id: 'user-a', username: 'alice', email: 'a@example.com', emailVerified: true },
        { id: 'user-b', username: 'bob', email: 'b@example.com', emailVerified: true },
      );
      const UserModel = createUserModel(keycloak, { identifyBy: [...identifyBy], persistProviderId: false });
      const user = new UserModel({ username: 'alice', email: 'a@example.com', emailVerified: true });
      await user.save();

      keycloak.calls.length = 0;
      keycloak.coreUsers.update.mockClear();
      keycloak.coreUsers.resetPassword.mockClear();
      keycloak.coreUsers.sendVerifyEmail.mockClear();
      keycloak.coreUsers.del.mockClear();

      user.email = 'b@example.com';
      await expect(user.save()).rejects.toThrow(/relink|conflict|persisted/i);

      expect(keycloak.users.find((remote) => remote.id === 'user-b')).toMatchObject({
        username: 'bob',
        email: 'b@example.com',
        emailVerified: true,
      });
      expect(keycloak.users.find((remote) => remote.id === 'user-a')).toMatchObject({
        username: 'alice',
        email: 'a@example.com',
      });
      expect(keycloak.callsFor('user.update')).toHaveLength(0);
      expect(keycloak.callsFor('core.users.update')).toHaveLength(0);
      expect(keycloak.callsFor('user.resetPassword')).toHaveLength(0);
      expect(keycloak.callsFor('core.users.resetPassword')).toHaveLength(0);
      expect(keycloak.callsFor('user.delete')).toHaveLength(0);
      expect(keycloak.callsFor('core.users.del')).toHaveLength(0);
      expect(keycloak.callsFor('user.reconcileRealmRoles')).toHaveLength(0);
      expect(keycloak.callsFor('user.sendVerifyEmail')).toHaveLength(0);
      expect(keycloak.callsFor('core.users.sendVerifyEmail')).toHaveLength(0);
    },
  );

  it.each([[['username']], [['username', 'email']]] as const)(
    'rejects an A-to-B username collision without touching B for %s ordering',
    async (identifyBy) => {
      keycloak.users.push(
        { id: 'user-a', username: 'alice', email: 'a@example.com' },
        { id: 'user-b', username: 'bob', email: 'b@example.com' },
      );
      const UserModel = createUserModel(keycloak, { identifyBy: [...identifyBy] });
      const user = new UserModel({ username: 'alice', email: 'a@example.com' });
      await user.save();
      expect(user.providerId).toBe('user-a');

      keycloak.calls.length = 0;
      keycloak.coreUsers.update.mockClear();
      keycloak.coreUsers.resetPassword.mockClear();
      keycloak.coreUsers.sendVerifyEmail.mockClear();
      keycloak.coreUsers.del.mockClear();

      user.username = 'bob';
      await expect(user.save()).rejects.toThrow(/relink|conflict|persisted|server-controlled/i);

      expect(keycloak.users.find((remote) => remote.id === 'user-b')).toMatchObject({
        username: 'bob',
        email: 'b@example.com',
      });
      expect(keycloak.users.find((remote) => remote.id === 'user-a')).toMatchObject({
        username: 'alice',
        email: 'a@example.com',
      });
      expect(keycloak.callsFor('user.update')).toHaveLength(0);
      expect(keycloak.callsFor('core.users.update')).toHaveLength(0);
      expect(keycloak.callsFor('user.resetPassword')).toHaveLength(0);
      expect(keycloak.callsFor('core.users.resetPassword')).toHaveLength(0);
      expect(keycloak.callsFor('user.delete')).toHaveLength(0);
      expect(keycloak.callsFor('core.users.del')).toHaveLength(0);
      expect(keycloak.callsFor('user.reconcileRealmRoles')).toHaveLength(0);
    },
  );

  it('still protects B from an email collision when throwOnError is false', async () => {
    keycloak.users.push(
      { id: 'user-a', username: 'alice', email: 'a@example.com', emailVerified: true },
      { id: 'user-b', username: 'bob', email: 'b@example.com', emailVerified: true },
    );
    const UserModel = createUserModel(keycloak, {
      identifyBy: 'email',
      persistProviderId: false,
      throwOnError: false,
    });
    const user = new UserModel({ username: 'alice', email: 'a@example.com', emailVerified: true });
    await user.save();

    keycloak.calls.length = 0;
    keycloak.coreUsers.update.mockClear();

    user.email = 'b@example.com';
    await user.save();

    expect(keycloak.users).toHaveLength(2);
    expect(keycloak.users.find((remote) => remote.id === 'user-b')).toMatchObject({
      username: 'bob',
      email: 'b@example.com',
      emailVerified: true,
    });
    expect(keycloak.users.find((remote) => remote.id === 'user-a')).toMatchObject({
      email: 'a@example.com',
    });
    expect(keycloak.callsFor('user.update')).toHaveLength(0);
    expect(keycloak.callsFor('core.users.update')).toHaveLength(0);
    expect(keycloak.callsFor('core.users.del')).toHaveLength(0);
  });

  it('rejects a delete after an unsaved providerId reassignment without touching either account', async () => {
    keycloak.users.push(
      { id: 'user-a', username: 'alice', email: 'a@example.com' },
      { id: 'user-b', username: 'bob', email: 'b@example.com' },
    );
    const UserModel = createUserModel(keycloak);
    const user = new UserModel({ username: 'alice', email: 'a@example.com' });
    await user.save();
    expect(user.providerId).toBe('user-a');

    keycloak.calls.length = 0;
    keycloak.coreUsers.del.mockClear();

    user.providerId = 'user-b';
    await expect(user.deleteOne()).rejects.toThrow(/server-controlled|persisted|relink/i);

    expect(keycloak.users).toHaveLength(2);
    expect(keycloak.users.find((remote) => remote.id === 'user-a')).toMatchObject({ username: 'alice' });
    expect(keycloak.users.find((remote) => remote.id === 'user-b')).toMatchObject({ username: 'bob' });
    expect(keycloak.callsFor('user.delete')).toHaveLength(0);
    expect(keycloak.callsFor('core.users.del')).toHaveLength(0);
    expect(await UserModel.findById(user._id).lean()).toMatchObject({ username: 'alice' });
  });

  it('fails closed when the persisted providerId is stale and the current identity collides with B', async () => {
    keycloak.users.push({ id: 'user-a', username: 'alice', email: 'a@example.com' });
    const UserModel = createUserModel(keycloak);
    const user = new UserModel({ username: 'alice', email: 'a@example.com' });
    await user.save();
    expect(user.providerId).toBe('user-a');

    keycloak.users.push({ id: 'user-b', username: 'bob', email: 'b@example.com' });
    await UserModel.collection.updateOne({ _id: user._id }, { $set: { providerId: 'ghost' } });
    const stale = await UserModel.findById(user._id).orFail();
    expect(stale.providerId).toBe('ghost');

    keycloak.calls.length = 0;
    keycloak.coreUsers.update.mockClear();

    stale.username = 'bob';
    stale.email = 'b@example.com';
    await expect(stale.save()).rejects.toThrow(/no longer exists|persisted|relink|conflict/i);

    expect(keycloak.users).toHaveLength(2);
    expect(keycloak.users.find((remote) => remote.id === 'user-b')).toMatchObject({
      username: 'bob',
      email: 'b@example.com',
    });
    expect(keycloak.users.find((remote) => remote.id === 'user-a')).toMatchObject({
      username: 'alice',
      email: 'a@example.com',
    });
    expect(keycloak.callsFor('user.create')).toHaveLength(0);
    expect(keycloak.callsFor('user.update')).toHaveLength(0);
    expect(keycloak.callsFor('core.users.update')).toHaveLength(0);
  });

  it('fails closed when the persisted local row is missing at delete time', async () => {
    keycloak.users.push({ id: 'user-a', username: 'alice', email: 'a@example.com' });
    const UserModel = createUserModel(keycloak);
    const user = new UserModel({ username: 'alice', email: 'a@example.com' });
    await user.save();
    expect(user.providerId).toBe('user-a');

    await UserModel.collection.deleteOne({ _id: user._id });
    keycloak.calls.length = 0;
    keycloak.coreUsers.del.mockClear();

    await expect(user.deleteOne()).rejects.toThrow(/persisted/i);

    expect(keycloak.users).toHaveLength(1);
    expect(keycloak.users[0]).toMatchObject({ id: 'user-a', username: 'alice' });
    expect(keycloak.callsFor('user.delete')).toHaveLength(0);
    expect(keycloak.callsFor('core.users.del')).toHaveLength(0);
  });

  it('rejects deleting a never-persisted document before any remote call', async () => {
    keycloak.users.push({ id: 'user-b', username: 'bob', email: 'b@example.com' });
    const UserModel = createUserModel(keycloak);
    const user = new UserModel({ providerId: 'user-b', username: 'bob', email: 'b@example.com' });

    await expect(user.deleteOne()).rejects.toThrow(/never.*persist|persisted/i);

    expect(keycloak.users).toHaveLength(1);
    expect(keycloak.users[0]).toMatchObject({ id: 'user-b', username: 'bob' });
    expect(keycloak.calls).toHaveLength(0);
  });

  it('still applies non-colliding email updates to the bound remote ID', async () => {
    keycloak.users.push({ id: 'user-a', username: 'alice', email: 'a@example.com', emailVerified: true });
    const UserModel = createUserModel(keycloak, { identifyBy: 'email', persistProviderId: false });
    const user = new UserModel({ username: 'alice', email: 'a@example.com', emailVerified: true });
    await user.save();

    keycloak.coreUsers.update.mockClear();
    keycloak.coreUsers.sendVerifyEmail.mockClear();
    user.email = 'c@example.com';
    await user.save();

    expect(keycloak.coreUsers.update).toHaveBeenCalledWith(
      { realm: 'test', id: 'user-a' },
      expect.objectContaining({ email: 'c@example.com', emailVerified: false }),
    );
    expect(keycloak.coreUsers.sendVerifyEmail).toHaveBeenCalledWith({ realm: 'test', id: 'user-a' });
    expect(keycloak.users).toHaveLength(1);
    expect(keycloak.users[0]).toMatchObject({ id: 'user-a', email: 'c@example.com' });
  });

  it('links a new document through a reversed identifyBy ordering', async () => {
    keycloak.users.push({ id: 'user-a', username: 'alice', email: 'a@example.com', emailVerified: true });
    const UserModel = createUserModel(keycloak, { identifyBy: ['email', 'username'] });

    const created = await UserModel.create({ username: 'alice', email: 'a@example.com', emailVerified: true });

    expect(created.providerId).toBe('user-a');
    expect(keycloak.users).toHaveLength(1);
    expect(keycloak.coreUsers.update).toHaveBeenCalledWith(
      { realm: 'test', id: 'user-a' },
      expect.not.objectContaining({ emailVerified: expect.any(Boolean) }),
    );
  });

  it('keeps a document retryable when remote deletion fails with throwOnError disabled', async () => {
    const UserModel = createUserModel(keycloak, { throwOnError: false });
    const user = await UserModel.create({ username: 'alice', email: 'alice@example.com' });
    keycloak.failOnce('core.users.del');

    await expect(user.deleteOne()).rejects.toThrow('Injected Keycloak failure at core.users.del');

    expect(await UserModel.findById(user._id).lean()).toMatchObject({ providerId: 'user-1' });
    expect(keycloak.users).toHaveLength(1);

    await user.deleteOne();

    expect(await UserModel.findById(user._id).lean()).toBeNull();
    expect(keycloak.users).toHaveLength(0);
  });

  it('triggers role sync precisely through declared rolePaths without profile or credential writes', async () => {
    const mapRoles = vi.fn((roles: unknown, document: { get(path: string): unknown }) => {
      const tier = document.get('tier');
      return tier === 'pro' ? ['pro-role'] : ['basic-role'];
    });
    const schema = new mongoose.Schema({
      providerId: String,
      username: { type: String, required: true },
      email: { type: String, required: true },
      emailVerified: { type: Boolean, default: false },
      firstName: String,
      lastName: String,
      enabled: Boolean,
      archived: { type: Boolean, default: false },
      tier: { type: String, default: 'basic' },
      roles: { type: [String], default: [] },
      attributes: { type: mongoose.Schema.Types.Mixed },
    });
    schema.plugin(keycloakUserSyncPlugin, {
      client: keycloak.client as never,
      realm: 'test',
      logger: false,
      mapRoles: mapRoles as never,
      rolePaths: ['tier'],
      managedRoles: ['basic-role', 'pro-role'],
    });
    const TierModel = mongoose.model(`KeycloakSyncTier${mongoose.modelNames().length}`, schema);
    keycloak.roles.set('basic-role', { id: 'role-basic', name: 'basic-role' });
    keycloak.roles.set('pro-role', { id: 'role-pro', name: 'pro-role' });

    const user = await TierModel.create({ username: 'alice', email: 'alice@example.com', tier: 'basic' });
    expect(keycloak.mappings.get('user-1')?.map((role) => role.name)).toEqual(['basic-role']);
    const creations = mapRoles.mock.calls.length;

    keycloak.calls.length = 0;
    keycloak.coreUsers.update.mockClear();
    keycloak.coreUsers.resetPassword.mockClear();
    mapRoles.mockClear();

    user.set('tier', 'pro');
    await user.save();

    expect(mapRoles).toHaveBeenCalledTimes(1);
    expect(keycloak.callsFor('user.reconcileRealmRoles')).toHaveLength(1);
    expect(keycloak.mappings.get('user-1')?.map((role) => role.name)).toEqual(['pro-role']);
    expect(keycloak.coreUsers.update).not.toHaveBeenCalled();
    expect(keycloak.coreUsers.resetPassword).not.toHaveBeenCalled();

    keycloak.calls.length = 0;
    keycloak.coreUsers.update.mockClear();
    mapRoles.mockClear();

    user.set('firstName', 'Alicia');
    await user.save();

    expect(keycloak.coreUsers.update).toHaveBeenCalledWith(
      { realm: 'test', id: 'user-1' },
      expect.objectContaining({ firstName: 'Alicia' }),
    );
    expect(mapRoles).not.toHaveBeenCalled();
    expect(keycloak.callsFor('user.reconcileRealmRoles')).toHaveLength(0);
    expect(keycloak.coreUsers.resetPassword).not.toHaveBeenCalled();
    expect(creations).toBeGreaterThanOrEqual(1);
  });

  it('evaluates password mappers only for creation or declared password intent', async () => {
    const mapPassword = vi.fn((document: { get(path: string): unknown }) => {
      const pending = document.get('pendingPassword');
      return typeof pending === 'string' && pending.length > 0 ? pending : null;
    });
    const schema = new mongoose.Schema({
      providerId: String,
      username: { type: String, required: true },
      email: { type: String, required: true },
      emailVerified: { type: Boolean, default: false },
      firstName: String,
      lastName: String,
      enabled: Boolean,
      archived: { type: Boolean, default: false },
      roles: { type: [String], default: [] },
      attributes: { type: mongoose.Schema.Types.Mixed },
      pendingPassword: String,
    });
    schema.plugin(keycloakUserSyncPlugin, {
      client: keycloak.client as never,
      realm: 'test',
      logger: false,
      syncFields: { password: true },
      mapPassword: mapPassword as never,
      passwordPaths: ['pendingPassword'],
    });
    const PendingModel = mongoose.model(`KeycloakSyncPending${mongoose.modelNames().length}`, schema);

    const user = await PendingModel.create({
      username: 'alice',
      email: 'alice@example.com',
      pendingPassword: 'initial-secret', // pragma: allowlist secret
    });
    expect(mapPassword).toHaveBeenCalled();
    expect(keycloak.coreUsers.resetPassword).toHaveBeenCalledWith({
      realm: 'test',
      id: 'user-1',
      credential: { temporary: false, type: 'password', value: 'initial-secret' },
    });

    keycloak.calls.length = 0;
    keycloak.coreUsers.update.mockClear();
    keycloak.coreUsers.resetPassword.mockClear();
    mapPassword.mockClear();

    user.set('firstName', 'Alicia');
    await user.save();

    expect(keycloak.coreUsers.update).toHaveBeenCalledWith(
      { realm: 'test', id: 'user-1' },
      expect.objectContaining({ firstName: 'Alicia' }),
    );
    expect(mapPassword).not.toHaveBeenCalled();
    expect(keycloak.coreUsers.resetPassword).not.toHaveBeenCalled();
    expect(keycloak.callsFor('user.reconcileRealmRoles')).toHaveLength(0);

    mapPassword.mockClear();
    keycloak.coreUsers.resetPassword.mockClear();
    keycloak.coreUsers.update.mockClear();

    user.set('pendingPassword', 'next-secret'); // pragma: allowlist secret
    await user.save();

    expect(mapPassword).toHaveBeenCalledTimes(1);
    expect(keycloak.coreUsers.resetPassword).toHaveBeenCalledWith({
      realm: 'test',
      id: 'user-1',
      credential: { temporary: false, type: 'password', value: 'next-secret' },
    });
  });

  it('keeps disabled mapper dependencies inert and validates/snapshots dependency arrays', async () => {
    expect(() => createUserModel(keycloak, { rolePaths: ['tier', '   '] })).toThrow(
      'rolePaths[1] must be a non-empty string',
    );
    expect(() =>
      createUserModel(keycloak, {
        passwordPaths: 'pendingPassword' as never, // pragma: allowlist secret
      }),
    ).toThrow('passwordPaths must be an array of non-empty strings');

    const rolePaths = ['tier'];
    const passwordPaths = ['pendingPassword'];
    const schema = new mongoose.Schema({
      providerId: String,
      username: { type: String, required: true },
      email: { type: String, required: true },
      emailVerified: { type: Boolean, default: false },
      firstName: String,
      lastName: String,
      enabled: Boolean,
      archived: { type: Boolean, default: false },
      attributes: { type: mongoose.Schema.Types.Mixed },
      tier: { type: String, default: 'basic' },
      pendingPassword: String,
      roles: { type: [String], default: [] },
    });
    schema.plugin(keycloakUserSyncPlugin, {
      client: keycloak.client as never,
      realm: 'test',
      logger: false,
      syncFields: { roles: false, password: false },
      mapRoles: (() => ['x']) as never,
      mapPassword: (() => null) as never,
      rolePaths,
      passwordPaths,
    });
    rolePaths.push('injected');
    passwordPaths.push('injected');

    const DisabledModel = mongoose.model(`KeycloakSyncDisabledDeps${mongoose.modelNames().length}`, schema);
    const user = await DisabledModel.create({ username: 'alice', email: 'alice@example.com' });
    keycloak.calls.length = 0;
    keycloak.coreUsers.update.mockClear();
    keycloak.coreUsers.resetPassword.mockClear();

    user.set('tier', 'pro');
    user.set('pendingPassword', 'next-secret'); // pragma: allowlist secret
    (user as unknown as { set(path: string, value: unknown): void }).set('injected', 'yes');
    await user.save();

    expect(keycloak.callsFor('user.reconcileRealmRoles')).toHaveLength(0);
    expect(keycloak.coreUsers.resetPassword).not.toHaveBeenCalled();
    expect(keycloak.coreUsers.update).not.toHaveBeenCalled();
  });
});
