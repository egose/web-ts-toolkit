// Reproducible bounded-cancellation measurement for B-ERH-05.
//
// Run: `node --expose-gc test/csv-retention-measure.mjs` from
// `packages/express-response-handler` (after building dist).
//
// Method: fixed-size cells (`[index, 'x'.repeat(32)]`), a non-retaining sink
// (drops chunks, huge highWaterMark so `write()` stays truthy and no backlog
// accumulates), and the export held active behind a gate after N rows. Heap
// is sampled with forced GC while the export is still active, at 10,000 and
// 100,000 rows. Pre-fix, every row raced a shared pending abort promise and
// retained one reaction per row (~260 bytes/row in the review probe: 2.93 MB
// at 10k vs 26.01 MB at 100k, ~23 MB delta). Post-fix the pump checks a
// `failed` flag instead of racing per row, so active-export heap must stay
// flat. Tolerance 5 MB for the 90k-row delta (~55 bytes/row, under a quarter
// of the prior linear slope) absorbs GC/pipeline noise without hiding a
// linear regression. No wall-clock speed is asserted.
import { Writable } from 'node:stream';
import { CSVResponse } from '../dist/responses/csv.mjs';

const SMALL_ROWS = 10_000;
const LARGE_ROWS = 100_000;
const TOLERANCE_BYTES = 5 * 1024 * 1024;

if (typeof globalThis.gc !== 'function') {
  console.error(JSON.stringify({ error: 'gc unavailable: run with node --expose-gc' }));
  process.exit(2);
}

class DiscardingWritable extends Writable {
  headersSent = false;
  headers = new Map();
  writeCount = 0;

  constructor() {
    super({ highWaterMark: 1 << 20 });
  }

  set(name, value) {
    this.headers.set(name, value);
  }

  _write(_chunk, _encoding, callback) {
    this.headersSent = true;
    this.writeCount += 1;
    callback();
  }
}

const settle = async (rounds = 5) => {
  for (let index = 0; index < rounds; index += 1) {
    await new Promise((resolve) => setImmediate(resolve));
  }
};

const forceGc = () => {
  globalThis.gc();
  globalThis.gc();
  globalThis.gc();
};

const heapAfterGc = () => {
  forceGc();
  return process.memoryUsage().heapUsed;
};

const runActiveExport = async (rowCount) => {
  const state = { consumed: 0 };
  let releaseGate = () => undefined;
  const gate = new Promise((resolve) => {
    releaseGate = () => resolve({ done: true, value: undefined });
  });
  const source = {
    [Symbol.asyncIterator]() {
      return {
        next: async () => {
          if (state.consumed < rowCount) {
            state.consumed += 1;
            return { done: false, value: [state.consumed, 'x'.repeat(32)] };
          }

          return gate;
        },
        return: async () => ({ done: true, value: undefined }),
      };
    },
  };

  const res = new DiscardingWritable();
  res.on('error', () => undefined);

  new CSVResponse(source, { headers: false }).streamCsv(res);

  for (let index = 0; index < 2000 && state.consumed < rowCount; index += 1) {
    await settle(1);
  }

  if (state.consumed < rowCount) {
    throw new Error(`export stalled: consumed ${state.consumed} of ${rowCount}`);
  }

  await settle(10);
  const heapActive = heapAfterGc();
  const snapshot = { heapActive, consumed: state.consumed, writes: res.writeCount };

  releaseGate();

  await new Promise((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error('timed out waiting for export finish')), 30_000);

    if (typeof timeout.unref === 'function') {
      timeout.unref();
    }

    res.once('finish', () => {
      clearTimeout(timeout);
      resolve();
    });
    res.once('close', () => {
      clearTimeout(timeout);
      resolve();
    });
    res.once('error', () => {
      clearTimeout(timeout);
      resolve();
    });
  });

  await settle(5);
  res.destroy();
  await settle(5);

  return snapshot;
};

const baseline = heapAfterGc();
const small = await runActiveExport(SMALL_ROWS);
await settle(5);
const large = await runActiveExport(LARGE_ROWS);
const delta = large.heapActive - small.heapActive;

const result = {
  env: {
    node: process.version,
    platform: process.platform,
    arch: process.arch,
  },
  gcMethod: 'global.gc() x3 per sample (node --expose-gc)',
  rows: { small: SMALL_ROWS, large: LARGE_ROWS },
  bytes: {
    baseline,
    smallActive: small.heapActive,
    largeActive: large.heapActive,
    delta,
    tolerance: TOLERANCE_BYTES,
  },
  consumed: { small: small.consumed, large: large.consumed },
  pass: delta < TOLERANCE_BYTES,
};

console.log(JSON.stringify(result, null, 2));
process.exit(result.pass ? 0 : 1);
