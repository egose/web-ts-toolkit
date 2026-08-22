import { createRequire } from 'node:module';

import { describe, expect, it } from 'vitest';

describe('@web-ts-toolkit/moo package entrypoints', () => {
  it('keeps Keycloak user sync on the direct subpath only for ESM imports', async () => {
    const root = await import('../dist/index.mjs');
    const plugins = await import('../dist/plugins/index.mjs');
    const keycloak = await import('../dist/plugins/keycloak-user-sync.mjs');

    expect(root).not.toHaveProperty('keycloakUserSyncPlugin');
    expect(plugins).not.toHaveProperty('keycloakUserSyncPlugin');
    expect(keycloak).toHaveProperty('keycloakUserSyncPlugin');
    expect(keycloak).toHaveProperty('createManagedKeycloakClient');
  });

  it('keeps Keycloak user sync on the direct subpath only for CJS imports', () => {
    const require = createRequire(import.meta.url);
    const root = require('../dist/index.js') as Record<string, unknown>;
    const plugins = require('../dist/plugins/index.js') as Record<string, unknown>;
    const keycloak = require('../dist/plugins/keycloak-user-sync.js') as Record<string, unknown>;

    expect(root).not.toHaveProperty('keycloakUserSyncPlugin');
    expect(plugins).not.toHaveProperty('keycloakUserSyncPlugin');
    expect(keycloak).toHaveProperty('keycloakUserSyncPlugin');
    expect(keycloak).toHaveProperty('createManagedKeycloakClient');
  });
});
