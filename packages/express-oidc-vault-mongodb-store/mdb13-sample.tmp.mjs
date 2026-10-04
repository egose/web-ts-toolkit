import { execFileSync, spawn } from 'node:child_process';
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
const probe = new MongoClient(uri, { serverSelectionTimeoutMS: 5000 });
await probe.connect();
console.log('in-process connect OK');

// Sample mongod state while the consumer runs.
const sampler = setInterval(async () => {
  try {
    await probe.db('admin').command({ ping: 1 }, { maxTimeMS: 3000 });
    console.log(`[sampler] ping OK`);
  } catch (e) {
    console.log(`[sampler] ping FAIL:`, String(e).split('\n')[0].slice(0, 160));
  }
}, 2000);

const child = spawn('node', ['consumer.mjs', uri, 'packed-esm-sample'],
  { cwd: consumerDir, stdio: ['ignore', 'pipe', 'pipe'] });
let stderr = '';
child.stderr.on('data', (d) => { stderr += d; });
const t0 = Date.now();
const exitCode = await new Promise((resolve) => {
  const to = setTimeout(() => { try { child.kill('SIGKILL'); } catch {} resolve('TIMEOUT-KILLED'); }, 45000);
  child.on('close', (code) => { clearTimeout(to); resolve(code); });
});
console.log(`consumer exited after ${((Date.now() - t0) / 1000).toFixed(1)}s with code ${exitCode}`);
console.log('consumer stderr head:', stderr.slice(0, 300).replace(/\n/g, ' | '));
clearInterval(sampler);
try { await probe.close(); } catch {}
await replSet.stop();
console.log('done');
