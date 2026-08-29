#!/usr/bin/env node
/**
 * Policy benchmark — measures encoding memory, output expansion, async throughput.
 * Run after `pnpm --filter @web-ts-toolkit/asset-inliner build`:
 *   node packages/asset-inliner/benchmarks/policy-benchmark.mjs
 * No timing assertions — just logs for manual inspection.
 */

import { encodeAsset, encodeAssets, DEFAULT_MAX_ASSET_BYTES, DEFAULT_MAX_TOTAL_BYTES } from '../dist/index.mjs';

function syntheticBytes(size, fill = 0x61) {
  const arr = new Uint8Array(size);
  arr.fill(fill);
  // Add PNG signature for image detection if filename is png
  if (size >= 8) {
    arr[0] = 0x89; arr[1] = 0x50; arr[2] = 0x4e; arr[3] = 0x47; arr[4] = 0x0d; arr[5] = 0x0a; arr[6] = 0x1a; arr[7] = 0x0a;
  }
  return arr;
}

function expansionRatio(byteLength, dataUrl) {
  const prefix = dataUrl.indexOf(',') + 1;
  const payloadLen = dataUrl.length - prefix;
  // Base64 length = ceil(n/3)*4; ratio = payloadLen / byteLength
  return payloadLen / byteLength;
}

async function run() {
  console.log('=== asset-inliner policy benchmark ===');
  console.log(`DEFAULT_MAX_ASSET_BYTES=${DEFAULT_MAX_ASSET_BYTES} (${(DEFAULT_MAX_ASSET_BYTES/1024/1024).toFixed(1)} MiB)`);
  console.log(`DEFAULT_MAX_TOTAL_BYTES=${DEFAULT_MAX_TOTAL_BYTES} (${(DEFAULT_MAX_TOTAL_BYTES/1024/1024).toFixed(1)} MiB)`);
  console.log('');

  // Capture baseline memory
  if (global.gc) global.gc();
  const baseMem = process.memoryUsage().heapUsed;

  // 1) Small asset: 512 B
  const small = syntheticBytes(512);
  const t0 = performance.now();
  const smallRes = await encodeAsset({ data: small, filename: 'a.png' });
  const t1 = performance.now();
  console.log(`[small 512B] encode ${(t1 - t0).toFixed(3)}ms, dataUrl ${smallRes.dataUrl.length} chars, expansion ${expansionRatio(smallRes.byteLength, smallRes.dataUrl).toFixed(3)}x, mem+ ${((process.memoryUsage().heapUsed - baseMem)/1024).toFixed(1)} KB`);

  // 2) Medium typical image: 12 KB
  const medium = syntheticBytes(12 * 1024);
  const m0 = performance.now();
  const medRes = await encodeAsset({ data: medium, filename: 'b.png' });
  const m1 = performance.now();
  console.log(`[medium 12KB] encode ${(m1 - m0).toFixed(3)}ms, dataUrl ${medRes.dataUrl.length} chars, expansion ${expansionRatio(medRes.byteLength, medRes.dataUrl).toFixed(3)}x`);

  // 3) Large font-like: 512 KB
  const large = syntheticBytes(512 * 1024);
  const l0 = performance.now();
  const largeRes = await encodeAsset({ data: large, filename: 'c.woff2' }, { definitions: [{ kind: 'font', extensions: ['.woff2'], mediaType: 'font/woff2', fontFormat: 'woff2' }] });
  const l1 = performance.now();
  const memLarge = process.memoryUsage().heapUsed - baseMem;
  console.log(`[large 512KB font] encode ${(l1 - l0).toFixed(3)}ms, dataUrl ${largeRes.dataUrl.length} chars, expansion ${expansionRatio(largeRes.byteLength, largeRes.dataUrl).toFixed(3)}x, mem+ ${(memLarge/1024/1024).toFixed(2)} MB`);

  // 4) Boundary: exactly DEFAULT_MAX_ASSET_BYTES
  const boundarySize = DEFAULT_MAX_ASSET_BYTES;
  const boundary = syntheticBytes(boundarySize);
  const b0 = performance.now();
  const bRes = await encodeAsset({ data: boundary, filename: 'boundary.png' });
  const b1 = performance.now();
  console.log(`[boundary ${boundarySize}B] encode ${(b1 - b0).toFixed(3)}ms, dataUrl ${bRes.dataUrl.length} chars, expansion ${expansionRatio(bRes.byteLength, bRes.dataUrl).toFixed(3)}x`);

  // 5) Rejected: boundary + 1
  const rejectedSize = DEFAULT_MAX_ASSET_BYTES + 1;
  const rejected = syntheticBytes(rejectedSize);
  const r0 = performance.now();
  try {
    await encodeAsset({ data: rejected, filename: 'rejected.png' });
    console.log(`[rejected ${rejectedSize}B] UNEXPECTED success (should have thrown ResourceLimitError)`);
  } catch (e) {
    const r1 = performance.now();
    console.log(`[rejected ${rejectedSize}B] rejected in ${(r1 - r0).toFixed(3)}ms → ${e.code ?? e.name}: ${e.message} (no Base64 alloc)`);
  }

  // 6) Async throughput: 50 × 12KB with concurrency implicit (catalog batched 16)
  const batch = Array.from({ length: 50 }, (_, i) => ({ data: syntheticBytes(12 * 1024, 0x60 + (i % 26)), filename: `img${i}.png` }));
  const th0 = performance.now();
  const batchRes = await encodeAssets(batch);
  const th1 = performance.now();
  const throughput = batch.length / ((th1 - th0) / 1000);
  const totalBytes = batchRes.reduce((s, r) => s + r.byteLength, 0);
  const totalChars = batchRes.reduce((s, r) => s + r.dataUrl.length, 0);
  console.log(`[throughput 50×12KB] ${(th1 - th0).toFixed(1)}ms total, ${throughput.toFixed(1)} assets/s, totalBytes ${totalBytes}, total dataUrl chars ${totalChars}, avg expansion ${(totalChars / totalBytes).toFixed(3)}x`);

  // 7) Custom audio definition (proves extensibility without source change)
  const audioBytes = new Uint8Array([0x49, 0x44, 0x33, 0x03, 0x00, 0x00, 0x00, 0x00]); // minimal ID3 stub
  // pad to 1KB
  const audioPadded = new Uint8Array(1024);
  audioPadded.set(audioBytes);
  const audioRes = await encodeAsset({ data: audioPadded, filename: 'tiny.mp3', mediaType: 'audio/mpeg', kind: 'audio' }, {
    definitions: [{ kind: 'audio', extensions: ['.mp3'], mediaType: 'audio/mpeg' }],
  });
  console.log(`[custom audio 1KB mp3] encode ok, mediaType ${audioRes.mediaType}, kind ${audioRes.kind}, dataUrl prefix ${audioRes.dataUrl.slice(0, 30)}...`);

  console.log('\nDone — no assertions, timings for manual inspection only.');
  console.log('Note: run with `node --expose-gc benchmarks/policy-benchmark.mjs` for GC-accurate memory if needed.');
}

run().catch(e => { console.error(e); process.exit(1); });
