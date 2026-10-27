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
