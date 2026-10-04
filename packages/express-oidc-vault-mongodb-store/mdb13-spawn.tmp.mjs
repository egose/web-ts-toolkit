import { execFileSync } from 'node:child_process';
import path from 'node:path';
import { MongoMemoryReplSet } from 'mongodb-memory-server';
import { MongoClient } from 'mongodb';

const consumerDir = path.resolve(import.meta.dirname, 'mdb13-repro.tmp');
const replSet = await MongoMemoryReplSet.create({
  replSet: { count: 1 },
  instanceOpts: [{ args: ['--setParameter', 'enableTestCommands=1'] }],
});
const uri = replSet.getUri();
console.log('uri:', uri);
const probe = new MongoClient(uri);
await probe.connect();
console.log('in-process connect OK');
await probe.close();

const t0 = Date.now();
try {
  const out = execFileSync('node', ['consumer.mjs', uri, 'packed-esm-repro'], {
    cwd: consumerDir, encoding: 'utf8', timeout: 180000, maxBuffer: 16 * 1024 * 1024,
  });
  console.log(`CONSUMER PASSED in ${Date.now() - t0}ms:`, out.trim().slice(-200));
} catch (e) {
  console.log(`CONSUMER FAILED after ${Date.now() - t0}ms.`);
  console.log('stderr head:', String(e.stderr || '').slice(0, 600));
}
await replSet.stop();
console.log('done');
