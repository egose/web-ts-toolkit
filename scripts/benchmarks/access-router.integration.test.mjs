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
import {
  inspectSnapshotDeclarations,
  snapshotCandidates,
  initialOutputCopyCandidates,
  authorizationFastPathCandidates,
  UNSAFE_AUTHORIZATION_FAST_PATH_FLAGS,
  UNSAFE_INITIAL_OUTPUT_COPY_FLAGS,
  UNSAFE_SNAPSHOT_FLAGS,
} from './access-router-core.mjs';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const worker = resolve(root, 'scripts/benchmarks/access-router-worker.mjs');
const exec = promisify(execFile);

test(
  'real workers apply eight comparison/copy/fast-path candidates to separate embedded and document-hook workloads',
  { timeout: 240_000 },
  async () => {
    const manifest = await inspectSnapshotDeclarations(root);
    assert.deepEqual(
      manifest.supportedSnapshotFlags,
      UNSAFE_SNAPSHOT_FLAGS,
      'Build the current access-router sources first.',
    );
    assert.deepEqual(manifest.supportedInitialOutputCopyFlags, UNSAFE_INITIAL_OUTPUT_COPY_FLAGS);
    assert.deepEqual(manifest.supportedAuthorizationFastPathFlags, UNSAFE_AUTHORIZATION_FAST_PATH_FLAGS);
    assert.equal(manifest.snapshotDeclarationManifest.filter((file) => file.name.endsWith('.d.mts')).length, 4);
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
    const candidates = snapshotCandidates(build, 'both').flatMap((candidate) =>
      initialOutputCopyCandidates(candidate, 'both').flatMap((copy) => authorizationFastPathCandidates(copy, 'both')),
    );
    assert.equal(candidates.length, 8);
    assert.equal(new Set(candidates.map((target) => target.id)).size, 8);
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
          assert.equal(result.initialOutputCopySkips, target.initialOutputCopySkips);
          assert.deepEqual(
            result.initialOutputCopyFlags,
            Object.fromEntries(
              UNSAFE_INITIAL_OUTPUT_COPY_FLAGS.map((flag) => [flag, target.initialOutputCopySkips === 'on']),
            ),
          );
          assert.equal(
            result.effectiveInitialOutputCopySkips,
            target.snapshotSkips === 'on' && target.initialOutputCopySkips === 'on' ? 'on' : 'off',
          );
          if (scenario === 'document-rules') assert.ok(result.documentHooks > 0, 'Document grants must actually run.');
          assert.equal(result.authorizationFastPaths, target.authorizationFastPaths);
          assert.deepEqual(
            result.authorizationFastPathFlags,
            Object.fromEntries(
              UNSAFE_AUTHORIZATION_FAST_PATH_FLAGS.map((flag) => [flag, target.authorizationFastPaths === 'on']),
            ),
          );
          const mode =
            target.authorizationFastPaths === 'off'
              ? 'off'
              : target.snapshotSkips === 'on' && target.initialOutputCopySkips === 'on'
                ? 'active'
                : 'dormant';
          assert.deepEqual(result.configuredAuthorizationFastPathModes, { list: mode, read: mode });
          assert.deepEqual(result.effectiveAuthorizationFastPathModes, { list: mode, read: mode });
          assert.equal(result.measuredAuthorizationOrigin, 'list');
          assert.equal(
            result.runtimeOmissionCounts,
            null,
            'Timing workers must not pretend configuration proves omissions.',
          );
          assert.equal(result.snapshotDeclarationsSha256, manifest.snapshotDeclarationsSha256);
          assert.deepEqual(result.snapshotDeclarationManifest, manifest.snapshotDeclarationManifest);
          assert.equal(result.distSha256, build.distSha256);
          const flags = {
            ...result.snapshotFlags,
            ...result.initialOutputCopyFlags,
            ...result.authorizationFastPathFlags,
          };
          for (const [role, modelName] of [
            ['source', 'BenchSource'],
            ['target', 'BenchTarget'],
          ]) {
            const verified = result.authorizationFastPathVerification.models[role];
            assert.equal(verified.modelName, modelName);
            assert.deepEqual(verified.getModelOption, flags);
            assert.deepEqual(verified.getModelOptions, flags);
          }
          assert.equal(result.documentHooks, scenario === 'document-rules' ? job.rows * job.samples : 0);
          assert.equal(result.getters, 0);
          assert.equal(result.readsPerRequest, 1);
          assert.equal(result.measuredReads, job.samples);
          assert.equal(result.hydration, 'lean');
          fingerprints.push(result.outputFingerprint);
        }
        assert.equal(fingerprints.length, 8);
        assert.equal(new Set(fingerprints).size, 1, `${scenario} comparison/copy/fast-path output changed`);
      }
    } finally {
      try {
        if (mongo) await mongo.stop();
      } finally {
        await rm(temporary, { recursive: true, force: true });
      }
    }
  },
);
