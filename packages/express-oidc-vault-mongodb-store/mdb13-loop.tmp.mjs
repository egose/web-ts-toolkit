import { execFileSync } from 'node:child_process';
import path from 'node:path';
import { MongoMemoryReplSet } from 'mongodb-memory-server';
import { MongoClient } from 'mongodb';

const consumerDir = path.resolve(import.meta.dirname, 'mdb13-repro.tmp');
const keepAlive = process.argv[2] === 'keepalive';

for (let i = 0; i < 5; i++) {
  const replSet = await MongoMemoryReplSet.create({
    replSet: { count: 1 },
    instanceOpts: [{ args: ['--setParameter', 'enableTestCommands=1'] }],
  });
  const uri = replSet.getUri();
  const probe = new MongoClient(uri);
  await probe.connect();
  let pingOk = 0;
  let pinger;
  if (keepAlive) {
    pinger = setInterval(() => {
      probe.db('admin').command({ ping: 1 }).then(() => { pingOk++; }).catch(() => {});
    }, 1000);
  } else {
    await probe.close();
  }
  const t0 = Date.now();
  let result = 'PASS';
  try {
    execFileSync('node', ['consumer.mjs', uri, `packed-esm-r${i}`], {
      cwd: consumerDir, encoding: 'utf8', timeout: 120000, maxBuffer: 16 * 1024 * 1024,
      stdio: ['ignore', 'pipe', 'pipe'],
    });
  } catch (e) {
    const err = String(e.stderr || e.message || e);
    const sig = err.includes('beforeHandshake') ? 'handshake-flake'
      : err.includes('assert') || err.includes('AssertionError') ? 'ASSERTION-FAIL' : 'other';
    result = `FAIL(${sig})`;
  }
  clearInterval(pinger);
  console.log(`run ${i}: ${result} in ${((Date.now() - t0) / 1000).toFixed(1)}s pings-ok=${pingOk}`);
  try { await probe.close(); } catch {}
  await replSet.stop();
}
console.log('done');
