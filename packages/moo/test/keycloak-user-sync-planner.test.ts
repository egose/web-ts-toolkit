import { describe, expect, it } from 'vitest';

import {
  buildProfilePayload,
  mergeAttributes,
  planChangedFields,
  planEmailVerification,
  planRoleDiff,
} from '../src/plugins/keycloak-user-sync/planner';
import type { KeycloakUserSyncDocument } from '../src/plugins/keycloak-user-sync';

const paths = {
  providerId: 'providerId',
  username: 'username',
  email: 'email',
  emailVerified: 'emailVerified',
  firstName: 'firstName',
  lastName: 'lastName',
  enabled: 'enabled',
  archived: 'archived',
  roles: 'roles',
  attributes: 'attributes',
  password: 'password', // pragma: allowlist secret
};

const syncFields = {
  username: true,
  email: true,
  emailVerified: true,
  firstName: true,
  lastName: true,
  enabled: true,
  roles: true,
  attributes: true,
  password: true,
};

const documentFrom = (values: Record<string, unknown>): KeycloakUserSyncDocument => ({
  get: (path: string) => values[path],
});

describe('keycloak user sync planner', () => {
  it('tracks field-specific changes and password changes', () => {
    const plan = planChangedFields(
      { paths, syncFields, attributePaths: ['profile.tenantId'] },
      false,
      (path) => path === 'firstName' || path === 'profile.tenantId',
      'remote-id',
    );

    expect([...plan.changedFields]).toEqual(['firstName', 'attributes']);
    expect(plan.shouldSync).toBe(true);
    expect(plan.passwordChanged).toBe(false);
    expect(plan.trackedPaths).toContain('profile.tenantId');
  });

  it('triggers role and password ops only through declared mapper dependencies', () => {
    const options = {
      paths,
      syncFields,
      rolePaths: ['tier'],
      passwordPaths: ['pendingPassword'],
    } as const;

    const roleOnly = planChangedFields(
      { ...options, paths, syncFields },
      false,
      (path) => path === 'tier',
      'remote-id',
    );
    expect([...roleOnly.changedFields]).toEqual(['roles']);
    expect(roleOnly.shouldSync).toBe(true);
    expect(roleOnly.passwordChanged).toBe(false);

    const passwordOnly = planChangedFields(
      { ...options, paths, syncFields },
      false,
      (path) => path === 'pendingPassword',
      'remote-id',
    );
    expect([...passwordOnly.changedFields]).toEqual(['password']);
    expect(passwordOnly.shouldSync).toBe(true);
    expect(passwordOnly.passwordChanged).toBe(true);

    const unrelated = planChangedFields(
      { ...options, paths, syncFields },
      false,
      (path) => path === 'unrelated',
      'remote-id',
    );
    expect([...unrelated.changedFields]).toEqual([]);
    expect(unrelated.shouldSync).toBe(false);
    expect(unrelated.passwordChanged).toBe(false);
  });

  it('keeps disabled mapper dependencies inert and tracks declared paths', () => {
    const disabledRoles = { ...syncFields, roles: false };
    const disabledPassword = { ...syncFields, password: false };
    const disabledAttributes = { ...syncFields, attributes: false };

    const rolePlan = planChangedFields(
      { paths, syncFields: disabledRoles, rolePaths: ['tier'] },
      false,
      (path) => path === 'tier',
      'remote-id',
    );
    expect([...rolePlan.changedFields]).toEqual([]);
    expect(rolePlan.shouldSync).toBe(false);

    const passwordPlan = planChangedFields(
      { paths, syncFields: disabledPassword, passwordPaths: ['pendingPassword'] },
      false,
      (path) => path === 'pendingPassword',
      'remote-id',
    );
    expect([...passwordPlan.changedFields]).toEqual([]);
    expect(passwordPlan.passwordChanged).toBe(false);

    const attributePlan = planChangedFields(
      { paths, syncFields: disabledAttributes, attributePaths: ['profile.tenantId'] },
      false,
      (path) => path === 'profile.tenantId',
      'remote-id',
    );
    expect([...attributePlan.changedFields]).toEqual([]);

    const tracked = planChangedFields(
      {
        paths,
        syncFields,
        attributePaths: ['profile.tenantId'],
        rolePaths: ['tier'],
        passwordPaths: ['pendingPassword'],
      },
      false,
      () => false,
      'remote-id',
    );
    expect(tracked.trackedPaths).toContain('profile.tenantId');
    expect(tracked.trackedPaths).toContain('tier');
    expect(tracked.trackedPaths).toContain('pendingPassword');

    const untracked = planChangedFields(
      { paths, syncFields: disabledRoles, rolePaths: ['tier'] },
      false,
      () => false,
      'remote-id',
    );
    expect(untracked.trackedPaths).not.toContain('tier');
  });

  it('plans initial-link and persisted email verification transitions separately', () => {
    expect(
      planEmailVerification({
        created: false,
        wasNew: true,
        syncEmail: true,
        syncEmailVerified: true,
        previousEmail: undefined,
        currentEmail: 'Alice@Example.com',
        remoteEmail: 'alice@example.com',
      }),
    ).toEqual({ changed: false, initialLinkSameEmail: true });

    expect(
      planEmailVerification({
        created: false,
        wasNew: false,
        syncEmail: true,
        syncEmailVerified: true,
        previousEmail: 'old@example.com',
        currentEmail: 'new@example.com',
        remoteEmail: 'old@example.com',
      }),
    ).toEqual({ changed: true, initialLinkSameEmail: false });
  });

  it('builds profile payloads only for changed fields and preserves clearing semantics', () => {
    const document = documentFrom({
      username: 'alice',
      email: 'alice@example.com',
      firstName: '   ',
      lastName: 'Smith',
    });

    expect(buildProfilePayload(document, { paths, syncFields }, true, new Set(['firstName']))).toEqual({
      firstName: '',
    });
  });

  it('merges managed attributes without removing unmanaged attributes', () => {
    const document = documentFrom({ attributes: { tenantId: 'tenant-2', empty: [] } });

    expect(
      mergeAttributes({ attributes: { external: ['keep-me'], tenantId: ['tenant-1'], empty: ['old'] } }, document, {
        paths,
        syncFields,
        managedAttributes: ['tenantId', 'empty'],
      }),
    ).toEqual({ external: ['keep-me'], tenantId: ['tenant-2'] });
  });

  it('diffs roles inside the managed ownership boundary', () => {
    const diff = planRoleDiff(
      ['viewer'],
      [
        { id: 'role-1', name: 'editor' },
        { id: 'role-2', name: 'external' },
      ],
      [{ id: 'role-3', name: 'viewer' }],
      ['editor', 'viewer'],
    );

    expect(diff.toAdd).toEqual([{ id: 'role-3', name: 'viewer' }]);
    expect(diff.toRemove).toEqual([{ id: 'role-1', name: 'editor' }]);
  });
});
