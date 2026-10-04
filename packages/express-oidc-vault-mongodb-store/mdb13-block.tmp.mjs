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
console.log('mongod pid:', replSet.getInstanceInfo?.()?.pid ?? 'unknown');
const probe = new MongoClient(uri);
await probe.connect();
console.log('ready-marker');
// Parent blocks here; child should hang ~30s.
try {
  execFileSync('node', ['consumer.mjs', uri, 'packed-esm-block'], {
    cwd: consumerDir, encoding: 'utf8', timeout: 90000,
  });
  console.log('exec PASS');
} catch {
  console.log('exec FAIL');
}
try { await probe.close(); } catch {}
await replSet.stop();
console.log('done');
