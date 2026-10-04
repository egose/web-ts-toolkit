import { execFileSync, spawn } from 'node:child_process';
import path from 'node:path';
import { MongoMemoryReplSet } from 'mongodb-memory-server';
import { MongoClient } from 'mongodb';

const consumerDir = path.resolve(import.meta.dirname, 'mdb13-repro.tmp');
const mode = process.argv[2] ?? 'exec-traffic'; // exec-traffic | spawn-idle

const replSet = await MongoMemoryReplSet.create({
  replSet: { count: 1 },
  instanceOpts: [{ args: ['--setParameter', 'enableTestCommands=1'] }],
});
const uri = replSet.getUri();
console.log('uri:', uri, 'mode:', mode);
const probe = new MongoClient(uri);
await probe.connect();
console.log('in-process connect OK');

let sampler;
if (mode === 'exec-traffic') {
  sampler = setInterval(() => {
    probe.db('admin').command({ ping: 1 }).catch(() => {});
  }, 500);
} else {
  await probe.close();
  console.log('probe closed (idle mongod)');
}

const t0 = Date.now();
if (mode === 'exec-traffic') {
  try {
    execFileSync('node', ['consumer.mjs', uri, 'packed-esm-x'], {
      cwd: consumerDir, encoding: 'utf8', timeout: 90000, maxBuffer: 16 * 1024 * 1024,
    });
    console.log(`exec PASS in ${((Date.now() - t0) / 1000).toFixed(1)}s`);
  } catch (e) {
    console.log(`exec FAIL in ${((Date.now() - t0) / 1000).toFixed(1)}s:`,
      String(e.stderr || e.message).split('\n')[0].slice(0, 200));
  }
} else {
  const child = spawn('node', ['consumer.mjs', uri, 'packed-esm-x'], { cwd: consumerDir, stdio: ['ignore', 'pipe', 'pipe'] });
  const code = await new Promise((resolve) => {
    const to = setTimeout(() => { try { child.kill('SIGKILL'); } catch {} resolve('TIMEOUT'); }, 90000);
    child.on('close', (c) => { clearTimeout(to); resolve(c); });
  });
  console.log(`spawn exit=${code} in ${((Date.now() - t0) / 1000).toFixed(1)}s`);
}
clearInterval(sampler);
try { await probe.close(); } catch {}
await replSet.stop();
console.log('done');
