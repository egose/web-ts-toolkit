import { execFile } from 'node:child_process';
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
console.log('in-process connect OK (stays open, parent event loop alive)');

const runAsync = (args) => new Promise((resolve, reject) => {
  execFile('node', args, { cwd: consumerDir, encoding: 'utf8', maxBuffer: 16 * 1024 * 1024 },
    (error, stdout, stderr) => {
      if (error) {
        const e = new Error(`Command failed: node ${args.join(' ')}\n${stdout}\n${stderr}\n${error.message}`);
        reject(e);
      } else resolve(stdout);
    });
});

const t0 = Date.now();
try {
  await runAsync(['consumer.mjs', uri, 'packed-esm-async']);
  console.log(`async-exec PASS in ${((Date.now() - t0) / 1000).toFixed(1)}s`);
} catch (e) {
  console.log(`async-exec FAIL in ${((Date.now() - t0) / 1000).toFixed(1)}s:`, String(e.message).split('\n')[0].slice(0, 200));
}
try { await probe.close(); } catch {}
await replSet.stop();
console.log('done');
