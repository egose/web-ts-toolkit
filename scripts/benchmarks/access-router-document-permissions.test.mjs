import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { resolve } from 'node:path';
import { test } from 'node:test';
import { documentPermissionFixtureOptions } from './access-router-core.mjs';

test('benchmark fixtures use descriptors on current artifacts and preserve explicit historical comparisons', async () => {
  const root = await mkdtemp(resolve(tmpdir(), 'document-permission-benchmark-'));
  try {
    const directory = resolve(root, 'packages/access-router/dist');
    await mkdir(directory, { recursive: true });
    const dependsOn = ['ownerFlag'];
    const get = (doc) => ({ owner: doc.ownerFlag === true });
    const hooks = { read: get, list: get };
    await writeFile(resolve(directory, 'index.d.ts'), 'export interface ModelDocPermissionsDescriptor {}');
    const current = await documentPermissionFixtureOptions({ root }, dependsOn, hooks);
    assert.deepEqual(current, {
      docPermissions: {
        read: { dependsOn: ['ownerFlag'], get },
        list: { dependsOn: ['ownerFlag'], get },
      },
    });
    assert.equal(Object.hasOwn(current, 'alwaysSelectFields'), false);
    dependsOn.push('later');
    assert.deepEqual(current.docPermissions.read.dependsOn, ['ownerFlag']);
    assert.equal(current.docPermissions.read.get, get);

    // Frozen older artifacts cannot accept the new shape. This is benchmark
    // fixture compatibility only; access-router itself has no fallback/alias.
    await writeFile(resolve(directory, 'index.d.ts'), 'export interface ModelRouterOptions {}');
    assert.deepEqual(await documentPermissionFixtureOptions({ root }, ['ownerFlag'], hooks), {
      alwaysSelectFields: ['ownerFlag'],
      docPermissions: hooks,
    });
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
