#!/usr/bin/env node
/**
 * Non-gating end-to-end HTML transform scaling benchmark (no timing assertions).
 * Build first: pnpm --filter @web-ts-toolkit/asset-inliner build
 * Run: node --expose-gc packages/asset-inliner/benchmarks/html-patches-benchmark.mjs
 * Compare fresh processes on the same runtime/machine, with no concurrent builds/tests.
 * Catalog/input creation, explicit GC, and output verification are outside timings.
 * Each size gets one warmup and three measured transforms using default limits.
 */
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { createAssetCatalogSync, inlineHtml } from '../dist/index.mjs';

const assetBytes = 10 * 1024;
const catalog = createAssetCatalogSync([{ filename: 'a.png', data: new Uint8Array(assetBytes).fill(0x61) }]);
const options = { catalog, allowBasenameMatch: true };
const dataUrl = catalog.assets[0].dataUrl;
const digest = (text) => createHash('sha256').update(text).digest('hex');

console.log(JSON.stringify({ node: process.version, platform: process.platform, arch: process.arch,
  assetBytes, warmups: 1, samples: 3, explicitGc: typeof global.gc === 'function' }));
for (const refs of [100, 250, 500, 1000]) {
  const input = '<img src="a.png">'.repeat(refs);
  const expected = `<img src="${dataUrl}">`.repeat(refs);
  const times = [];
  let outputHash;
  let metadataHash;
  for (let sample = -1; sample < 3; sample++) {
    global.gc?.();
    const start = performance.now();
    const result = inlineHtml(input, options);
    const elapsed = performance.now() - start;
    assert.equal(result.content, expected);
    assert.equal(result.modified, true);
    assert.equal(result.replacements.length, refs);
    assert.deepEqual(result.diagnostics, []);
    outputHash = digest(result.content);
    metadataHash = digest(JSON.stringify({ ...result, content: undefined }));
    if (sample >= 0) times.push(elapsed);
  }
  const median = [...times].sort((a, b) => a - b)[1];
  console.log(JSON.stringify({ refs, inputBytes: Buffer.byteLength(input), outputBytes: Buffer.byteLength(expected),
    ms: times.map((ms) => Number(ms.toFixed(3))), medianMs: Number(median.toFixed(3)), outputHash, metadataHash }));
}
