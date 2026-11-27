import { createRequire } from 'node:module';

import { describe, expect, it } from 'vitest';

describe('@web-ts-toolkit/moo package entrypoints', () => {
  it('exports the derived-fields API through bundled root/grouped/direct ESM and CJS entries', async () => {
    const require = createRequire(import.meta.url);
    const entries = [
      ['root', await import('../dist/index.mjs'), require('../dist/index.js')],
      ['plugins', await import('../dist/plugins/index.mjs'), require('../dist/plugins/index.js')],
      [
        'derived-fields',
        await import('../dist/plugins/derived-fields.mjs'),
        require('../dist/plugins/derived-fields.js'),
      ],
    ] as const;
    for (const [entry, esm, cjs] of entries) {
      for (const namespace of [esm, cjs]) {
        for (const name of ['derivedFieldsPlugin', 'defineDerivedField', 'DerivedFieldsDependencyError']) {
          expect(namespace[name], `${entry}#${name}`).toBeTypeOf('function');
        }
        expect(namespace).not.toHaveProperty('keycloakUserSyncPlugin');
      }
    }
  });

  it('keeps Keycloak plugins on their direct subpaths for ESM imports', async () => {
    const root = await import('../dist/index.mjs');
    const plugins = await import('../dist/plugins/index.mjs');
    const userSync = await import('../dist/plugins/keycloak-user-sync.mjs');
    const groupSync = await import('../dist/plugins/keycloak-group-sync.mjs');

    for (const entry of [root, plugins]) {
      expect(entry).not.toHaveProperty('keycloakUserSyncPlugin');
      expect(entry).not.toHaveProperty('keycloakGroupSyncPlugin');
    }
    expect(userSync).toHaveProperty('keycloakUserSyncPlugin');
    expect(userSync).toHaveProperty('createManagedKeycloakClient');
    expect(Object.keys(groupSync)).toEqual(['keycloakGroupSyncPlugin']);
    expect(groupSync.keycloakGroupSyncPlugin).toBeTypeOf('function');
  });

  it('keeps Keycloak plugins on their direct subpaths for CJS imports', () => {
    const require = createRequire(import.meta.url);
    const root = require('../dist/index.js') as Record<string, unknown>;
    const plugins = require('../dist/plugins/index.js') as Record<string, unknown>;
    const userSync = require('../dist/plugins/keycloak-user-sync.js') as Record<string, unknown>;
    const groupSync = require('../dist/plugins/keycloak-group-sync.js') as Record<string, unknown>;

    for (const entry of [root, plugins]) {
      expect(entry).not.toHaveProperty('keycloakUserSyncPlugin');
      expect(entry).not.toHaveProperty('keycloakGroupSyncPlugin');
    }
    expect(userSync).toHaveProperty('keycloakUserSyncPlugin');
    expect(userSync).toHaveProperty('createManagedKeycloakClient');
    expect(Object.keys(groupSync)).toEqual(['keycloakGroupSyncPlugin']);
    expect(groupSync.keycloakGroupSyncPlugin).toBeTypeOf('function');
  });
});
