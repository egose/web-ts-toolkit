import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { test } from 'node:test';
import {
  createAssetCatalogSync, discoverAssets, discoverAssetsSync,
  FilesystemError, inlineFiles, inlineFilesSync,
} from '../dist/index.mjs';

// Explicit native runner, outside the portable Vitest glob. Missing prerequisites
// fail instead of skipping: a green invocation must really exercise Windows IO.
assert.equal(process.platform, 'win32', 'AIH-01 requires native Windows Node');

function parent(name) {
  const value = process.env[name];
  assert.ok(value && path.isAbsolute(value), `${name} must name an existing absolute writable directory`);
  assert.ok(fs.statSync(value).isDirectory(), `${name} must be a directory`);
  return value;
}

for (const kind of ['DRIVE', 'UNC']) {
  test(`AIH-01 native ${kind}: discovery and write containment`, async (t) => {
    const rootParent = parent(`AIH_WINDOWS_${kind}_ROOT`);
    const outsideParent = parent(`AIH_WINDOWS_${kind}_OUTSIDE`);
    const root = fs.mkdtempSync(path.join(rootParent, 'aih01-root-'));
    t.after(() => fs.rmSync(root, { recursive: true, force: true }));
    const outside = fs.mkdtempSync(path.join(outsideParent, 'aih01-outside-'));
    t.after(() => fs.rmSync(outside, { recursive: true, force: true }));

    if (kind === 'DRIVE') {
      assert.match(root, /^[A-Za-z]:\\/);
      assert.match(outside, /^[A-Za-z]:\\/);
      assert.notEqual(path.parse(root).root.toLowerCase(), path.parse(outside).root.toLowerCase(), 'use different drive letters');
      assert.notEqual(fs.statSync(root).dev, fs.statSync(outside).dev, 'use distinct actual volumes, not aliases of one volume');
    } else {
      const server = (value) => /^\\\\([^\\]+)\\[^\\]+/.exec(value)?.[1].toLowerCase();
      assert.ok(server(root), 'root must be a UNC share');
      assert.ok(server(outside), 'outside must be a UNC share');
      assert.notEqual(server(root), server(outside), 'use different UNC server identities');
    }
    assert.ok(path.isAbsolute(path.relative(fs.realpathSync(root), fs.realpathSync(outside))), 'canonical paths must still cross volume/share boundaries');

    const asset = path.join(outside, 'outside.png');
    fs.writeFileSync(asset, new Uint8Array([1, 2, 3]));
    await assert.rejects(discoverAssets(asset, { traversalRoot: root }), FilesystemError);
    assert.throws(() => discoverAssetsSync(asset, { traversalRoot: root }), FilesystemError);
    assert.equal((await discoverAssets(asset, { traversalRoot: root, allowTraversalEscape: true })).length, 1);
    assert.equal(discoverAssetsSync(asset, { traversalRoot: root, allowTraversalEscape: true }).length, 1);

    const inside = path.join(root, 'inside.png');
    fs.writeFileSync(inside, new Uint8Array([1, 2, 3]));
    assert.equal((await discoverAssets(inside, { traversalRoot: root })).length, 1);
    assert.equal(discoverAssetsSync(inside, { traversalRoot: root }).length, 1);

    const target = path.join(outside, 'style.css');
    const original = '.icon { background: url("icon.png"); }';
    fs.writeFileSync(target, original);
    const catalog = createAssetCatalogSync([{ data: new Uint8Array([1, 2, 3]), filename: 'icon.png' }]);
    const options = { targets: target, catalog, traversalRoot: root, write: true };
    await assert.rejects(inlineFiles(options), FilesystemError);
    assert.equal(fs.readFileSync(target, 'utf8'), original);
    assert.throws(() => inlineFilesSync(options), FilesystemError);
    assert.equal(fs.readFileSync(target, 'utf8'), original);
    t.diagnostic(JSON.stringify({ node: process.version, rootVolume: path.parse(root).root, outsideVolume: path.parse(outside).root }));
  });
}
