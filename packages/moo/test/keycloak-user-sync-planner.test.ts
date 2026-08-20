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
