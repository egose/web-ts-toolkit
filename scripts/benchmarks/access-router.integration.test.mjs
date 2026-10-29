import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { createHash, randomBytes } from 'node:crypto';
import { access, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, resolve } from 'node:path';
import { promisify } from 'node:util';
import { fileURLToPath } from 'node:url';
import { test } from 'node:test';
import { MongoMemoryServer } from 'mongodb-memory-server';
import { inspectSnapshotDeclarations, snapshotCandidates, UNSAFE_SNAPSHOT_FLAGS } from './access-router-core.mjs';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const worker = resolve(root, 'scripts/benchmarks/access-router-worker.mjs');
const exec = promisify(execFile);

test('real workers apply both modes to embedded and document-hook workloads', { timeout: 120_000 }, async () => {
  const manifest = await inspectSnapshotDeclarations(root);
  assert.deepEqual(
    manifest.supportedSnapshotFlags,
    UNSAFE_SNAPSHOT_FLAGS,
    'Build the current access-router sources first.',
  );
  const entry = resolve(root, 'packages/access-router/dist/index.mjs');
  const build = {
    id: 'current',
    label: 'Current',
    root,
    entry,
    distSha256: createHash('sha256')
      .update(await readFile(entry))
      .digest('hex'),
    ...manifest,
  };
  const candidates = snapshotCandidates(build, 'both');
  let temporaryBase = process.env.WTT_BENCH_TMP ?? '/tmp/opencode';
  try {
    await access(temporaryBase);
  } catch {
    temporaryBase = tmpdir();
  }
  const temporary = await mkdtemp(resolve(temporaryBase, 'access-router-modes-test-'));
  let mongo;
  try {
    mongo = await MongoMemoryServer.create();
    const prefix = randomBytes(6).toString('hex');
    let index = 0;
    for (const scenario of ['embedded', 'document-rules']) {
      const fingerprints = [];
      for (const target of candidates) {
        const id = ++index;
        const job = {
          scenario,
          rows: 4,
          fields: 4,
          bytes: 4,
          samples: 5,
          warmup: 1,
          concurrency: 1,
          hookConcurrency: 2,
          target,
          uri: mongo.getUri(),
          database: `access_router_bench_${prefix}_${id}`,
        };
        const jobPath = resolve(temporary, `${id}-job.json`);
        const resultPath = resolve(temporary, `${id}-result.json`);
        await writeFile(jobPath, JSON.stringify(job));
        await exec(process.execPath, [worker, jobPath, resultPath], { cwd: root, timeout: 60_000 });
        const result = JSON.parse(await readFile(resultPath, 'utf8'));
        assert.equal(result.status, 'ok');
        assert.equal(result.targetId, target.id);
        assert.equal(result.snapshotSkips, target.snapshotSkips);
        assert.deepEqual(
          result.snapshotFlags,
          Object.fromEntries(UNSAFE_SNAPSHOT_FLAGS.map((flag) => [flag, target.snapshotSkips === 'on'])),
        );
        if (scenario === 'document-rules') assert.ok(result.documentHooks > 0, 'Document grants must actually run.');
        fingerprints.push(result.outputFingerprint);
      }
      assert.equal(fingerprints[0], fingerprints[1], `${scenario} OFF/ON output changed`);
    }
  } finally {
    try {
      if (mongo) await mongo.stop();
    } finally {
      await rm(temporary, { recursive: true, force: true });
    }
  }
});
