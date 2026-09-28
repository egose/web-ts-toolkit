// Copied verbatim into the installed consumer. Never imports repository source.
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, readFileSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseFragment } from 'parse5';
import {
  createAssetCatalogSync, encodeAsset, inlineCss, inlineHtml, inlineFiles, inlineFilesSync,
  DEFAULT_POLICY, normalizePolicy, ResourceLimitError, InvalidOptionsError,
} from '@web-ts-toolkit/asset-inliner';
import * as api from '@web-ts-toolkit/asset-inliner';

const consumer = fileURLToPath(new URL('.', import.meta.url));
const modules = path.join(consumer, 'node_modules');
const installed = path.join(modules, '@web-ts-toolkit/asset-inliner');
const entry = fileURLToPath(import.meta.resolve('@web-ts-toolkit/asset-inliner'));
assert.equal(realpathSync(entry), path.join(installed, 'dist/index.mjs'));
assert.equal('default' in api, false);
const manifest = JSON.parse(readFileSync(path.join(installed, 'package.json'), 'utf8'));
const fromPackage = createRequire(entry);
for (const [name, version] of Object.entries(manifest.dependencies)) {
  const resolved = realpathSync(fromPackage.resolve(name));
  assert.ok(resolved.startsWith(`${modules}${path.sep}`), `${name}: ${resolved}`);
  let dir = path.dirname(resolved);
  while (!readManifest(dir)) {
    dir = path.dirname(dir);
    assert.ok(dir.startsWith(modules), `No local manifest for ${name}`);
  }
  assert.equal(readManifest(dir).name, name);
  assert.equal(readManifest(dir).version, version);
}
function readManifest(dir) {
  try { return JSON.parse(readFileSync(path.join(dir, 'package.json'), 'utf8')); }
  catch (error) { if (error.code === 'ENOENT') return undefined; throw error; }
}

// This calls the real lazy external file-type dependency, not a stub detector.
const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jRZkAAAAASUVORK5CYII=', 'base64');
assert.equal((await encodeAsset({ data: png }, { detection: 'content' })).mediaType, 'image/png');
assert.equal((await encodeAsset({ data: png, filename: 'a.png' }, { detection: 'verify' })).kind, 'image');

// Match shipped policy tables and exported constants; no larger test allowances.
const mib = 1024 * 1024;
const policies = [
  ['maxAssetBytes', 'MAX_ASSET_BYTES', 3 * mib, 100 * mib],
  ['maxTotalBytes', 'MAX_TOTAL_BYTES', 15 * mib, 500 * mib],
  ['maxTargetBytes', 'MAX_TARGET_BYTES', 5 * mib, 50 * mib],
  ['maxOutputBytes', 'MAX_OUTPUT_BYTES', 20 * mib, 100 * mib],
  ['maxReplacements', 'MAX_REPLACEMENTS', 1000, 100000],
  ['maxSyntaxDepth', 'MAX_SYNTAX_DEPTH', 256, 512],
  ['maxFiles', 'MAX_FILES', 10000, 100000],
  ['maxDepth', 'MAX_DEPTH', 32, 256],
  ['maxTargets', 'MAX_TARGETS', 500, 5000],
  ['concurrency', 'CONCURRENCY', 16, 64],
];
assert.deepEqual(normalizePolicy(), DEFAULT_POLICY);
assert.ok(Object.isFrozen(DEFAULT_POLICY));
for (const [key, suffix, defaultValue, cap] of policies) {
  assert.equal(DEFAULT_POLICY[key], defaultValue);
  assert.equal(api[`DEFAULT_${suffix}`], defaultValue);
  assert.equal(api[`MAX_REASONABLE_${suffix}`], cap);
  assert.equal(normalizePolicy({ [key]: cap })[key], cap);
  assert.throws(() => normalizePolicy({ [key]: cap + 1 }), InvalidOptionsError);
}
assert.equal('maxInlineBytes' in DEFAULT_POLICY, false);
assert.equal('maxInlineBytes' in normalizePolicy(), false);
assert.equal(api.MAX_REASONABLE_MAX_INLINE_BYTES, 100 * mib);
assert.throws(() => normalizePolicy({ maxInlineBytes: 100 * mib + 1 }), InvalidOptionsError);

const catalog = createAssetCatalogSync([
  { filename: 'a.png', data: new Uint8Array([1]) },
  { filename: 'a,b.png', data: new Uint8Array([2]) },
  { filename: 'b.png', data: new Uint8Array([3]) }, // suffix decoy
]);
const options = { catalog, allowBasenameMatch: true };
const url = 'data:image/png;base64,AQ==';
const styleInput = '<div style=background:url(a.png);--x:&#32;onmouseover&#61;alert(1)></div>';
const styled = inlineHtml(styleInput, { ...options, inlineEmbeddedCss: true });
assert.deepEqual(parseFragment(styled.content).childNodes[0].attrs, [
  { name: 'style', value: `background:url(${url});--x: onmouseover=alert(1)` },
]);
const styleBytes = Buffer.byteLength(styled.content);
assert.equal(inlineHtml(styleInput, { ...options, inlineEmbeddedCss: true, maxOutputBytes: styleBytes }).content, styled.content);
assert.throws(() => inlineHtml(styleInput, { ...options, inlineEmbeddedCss: true, maxOutputBytes: styleBytes - 1 }), ResourceLimitError);

const calls = [];
const srcset = '<img srcset="https://example.test/a,b.png 1x, a&#44;b.png 2x, a.png 1x 2x">';
const set = inlineHtml(srcset, { ...options, resolver: (input) => { calls.push(input.originalUrl); } });
assert.deepEqual(calls, ['a,b.png']);
assert.equal(set.content, '<img srcset="https://example.test/a,b.png 1x, data:image/png;base64,Ag== 2x, a.png 1x 2x">');
assert.equal(set.replacements[0].location.offset, srcset.indexOf('a&#44;'));

// Repeated source patches: exact bytes and source offsets, no timing threshold.
const chunk = '<img src="a.png">';
const repeated = inlineHtml(chunk.repeat(64), options);
assert.equal(repeated.content, `<img src="${url}">`.repeat(64));
assert.deepEqual(repeated.replacements.map((replacement) => replacement.location.offset),
  Array.from({ length: 64 }, (_, index) => index * chunk.length + 10));

for (const depth of [256, 512]) {
  const html = '<div>'.repeat(depth) + '</div>'.repeat(depth);
  assert.equal(inlineHtml(html, { catalog, maxSyntaxDepth: depth }).content, html);
  assert.throws(() => inlineHtml(`<div>${html}</div>`, { catalog, maxSyntaxDepth: depth }), ResourceLimitError);
}
assert.throws(() => inlineHtml('<template>'.repeat(8000), { catalog }), ResourceLimitError);
assert.throws(() => inlineCss('a{--x:' + 'f('.repeat(8000) + 'x' + ')'.repeat(8000) + '}', { catalog }), ResourceLimitError);
assert.throws(() => inlineHtml('<div style="--x:f(f(f(x)))"></div>', { catalog, inlineEmbeddedCss: true, maxSyntaxDepth: 2 }), ResourceLimitError);
assert.equal(inlineCss('a{--x:"((({[["}', { catalog, maxSyntaxDepth: 1 }).modified, false);

const dir = mkdtempSync(path.join(tmpdir(), 'asset-inliner-smoke-'));
try {
  for (const child of ['a', 'b']) mkdirSync(path.join(dir, child));
  const preferred = path.join(dir, 'a/a.png');
  const decoy = path.join(dir, 'b/a.png');
  writeFileSync(preferred, new Uint8Array([4]));
  writeFileSync(decoy, new Uint8Array([5]));
  const filesCatalog = createAssetCatalogSync([preferred, decoy]);
  const documentPath = path.join(dir, 'b/site.html');
  const localHtml = '<base href="../a/"><img src=a.png><source srcset="a.png 1x"><div style="background:url(a.png)"></div><style>a{background:url(a.png)}</style>';
  const contexts = [];
  const localOptions = {
    catalog: filesCatalog, documentPath, inlineEmbeddedCss: true,
    resolver: (input) => { contexts.push(input); },
  };
  const local = inlineHtml(localHtml, localOptions);
  assert.equal(local.replacements.length, 4);
  assert.ok(local.replacements.every((replacement) => replacement.resolvedPath === preferred));
  assert.ok(contexts.every((input) => input.documentPath === documentPath && input.resolutionBaseDir === path.join(dir, 'a')));
  assert.deepEqual(local.diagnostics, []);
  const remoteHtml = localHtml.replace('../a/', 'https://example.test/');
  contexts.length = 0;
  const remote = inlineHtml(remoteHtml, localOptions);
  assert.equal(remote.content, remoteHtml);
  assert.deepEqual(contexts, []);
  assert.equal(remote.diagnostics.length, 4);
  assert.ok(remote.diagnostics.every((diagnostic) => diagnostic.code === 'HTML_BASE_UNMAPPABLE' && diagnostic.filePath === documentPath));

  const overDepth = path.join(dir, 'b/deep.html');
  const deepHtml = '<template>'.repeat(8000);
  writeFileSync(overDepth, deepHtml);
  for (const processFiles of [inlineFiles, inlineFilesSync]) {
    writeFileSync(documentPath, localHtml);
    const results = await processFiles({ catalog: filesCatalog, targets: [documentPath, overDepth], inlineEmbeddedCss: true, write: true });
    assert.equal(results[0].written, true);
    assert.equal(readFileSync(documentPath, 'utf8'), local.content);
    assert.equal(results[1].written, false);
    assert.equal(results[1].modified, false);
    assert.equal(results[1].content, '');
    assert.deepEqual(results[1].replacements, []);
    assert.equal(results[1].diagnostics[0].code, 'RESOURCE_LIMIT');
    assert.equal(readFileSync(overDepth, 'utf8'), deepHtml);
    writeFileSync(documentPath, remoteHtml);
    const [preserved] = await processFiles({ catalog: filesCatalog, targets: [documentPath], inlineEmbeddedCss: true, write: true });
    assert.equal(preserved.written, false);
    assert.equal(readFileSync(documentPath, 'utf8'), remoteHtml);
  }
} finally {
  rmSync(dir, { recursive: true, force: true });
}
console.log('Packed runtime contracts passed: local dependencies, detection, policies, style, srcset, bases, depth, patches, async/sync files');
