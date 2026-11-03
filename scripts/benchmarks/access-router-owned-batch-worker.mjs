/** Actual packed public APIs. B1 has no historical batch stand-in. */
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile, writeFile } from 'node:fs/promises';
import { Agent, request } from 'node:http';
import { createRequire } from 'node:module';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import {
  authorizationModeOptions,
  snapshotFlagOptions,
  initialOutputCopyFlagOptions,
  authorizationFastPathFlagOptions,
  fingerprint,
  summarize,
  verifySnapshotDeclarationManifest,
} from './access-router-core.mjs';
import { verifySnapshotFlagOptions } from './access-router-worker.mjs';
import { SERIES } from './access-router-owned-core.mjs';
import {
  BATCH_SERIES,
  batchRows,
  batchCounts,
  validateBatchJob,
  verifyBatchResult,
} from './access-router-owned-batch-core.mjs';

function post(port, agent) {
  return new Promise((done, reject) => {
    const req = request(
      {
        hostname: '127.0.0.1',
        port,
        agent,
        path: '/batch/_workflow',
        method: 'POST',
        headers: { 'content-type': 'application/json', 'content-length': 2 },
      },
      (res) => {
        const chunks = [];
        res.on('data', (chunk) => chunks.push(chunk));
        res.on('error', reject);
        res.on('end', () => {
          try {
            assert.equal(res.statusCode, 200, Buffer.concat(chunks).toString());
            done(JSON.parse(Buffer.concat(chunks).toString()));
          } catch (error) {
            reject(error);
          }
        });
      },
    );
    req.on('error', reject);
    req.setTimeout(120000, () => req.destroy(new Error('B1 HTTP timeout')));
    req.end('{}');
  });
}

export async function benchmarkBatch(input) {
  const job = validateBatchJob(input),
    c = job.comparison;
  const hash = createHash('sha256')
    .update(await readFile(job.target.entry))
    .digest('hex');
  assert.equal(hash, job.target.distSha256);
  const manifest = await verifySnapshotDeclarationManifest(job.target);
  const old = job.profile.startsWith('current-');
  const flags = old
    ? {
        ...snapshotFlagOptions(job.target.snapshotSkips, manifest.supportedSnapshotFlags),
        ...initialOutputCopyFlagOptions(job.target.initialOutputCopySkips, manifest.supportedInitialOutputCopyFlags),
        ...authorizationFastPathFlagOptions(
          job.target.authorizationFastPaths,
          manifest.supportedAuthorizationFastPathFlags,
        ),
      }
    : authorizationModeOptions(job.target);
  const require = createRequire(resolve(job.target.root, 'packages/access-router/package.json'));
  const mongoose = require('mongoose'),
    express = require('express');
  const library = await import(pathToFileURL(job.target.entry));
  for (const name of Object.keys(library))
    assert.ok(!name.startsWith('__oar'), 'Instrumented/private exports in timed artifact');
  const api = library.createAccessRuntime(),
    counts = Object.fromEntries(Object.keys(batchCounts(job)).map((k) => [k, 0]));
  const expected = batchRows(c.rows),
    fields = Array.from({ length: 24 }, (_, i) => `field${i}`),
    hydration = new Set();
  const quiet = {
    includePermissions: false,
    includeFieldPermissions: false,
    includeCount: false,
    tryList: false,
    skim: false,
  };
  let server;
  const agent = new Agent({ keepAlive: true, maxSockets: 1 });
  try {
    await mongoose.connect(job.uri, { dbName: job.database, maxPoolSize: 10 });
    const mongoVersion = (await mongoose.connection.db.admin().command({ buildInfo: 1 })).version;
    const schema = new mongoose.Schema(
      { ordinal: Number, ...Object.fromEntries(fields.map((f) => [f, String])) },
      { versionKey: false },
    );
    schema.pre('find', function () {
      hydration.add(this.mongooseOptions().lean === true ? 'lean' : 'hydrated');
    });
    const Source = mongoose.model('B1Source', schema),
      Target = mongoose.model('B1Target', new mongoose.Schema({ name: String }));
    api.setGlobalOptions({
      globalPermissions: () => ({ reader: true, admin: false }),
      logger: { warn() {} },
      requestComplexity: { maxHookConcurrency: 10, maxBulkConcurrency: 10 },
    });
    api.createRouter(Target, { operationAccess: true, permissionSchema: { name: true }, ...flags });
    // Intentionally NO docPermissions or virtuals: old raw comparator cannot inherit facts.
    const router = api.createRouter(Source, {
      basePath: '/batch',
      operationAccess: { read: true, list: true },
      permissionSchema: { ordinal: true, ...Object.fromEntries(fields.map((f) => [f, 'reader'])) },
      stripPermissionsField: true,
      listHardLimit: 100,
      sortableFields: ['ordinal'],
      hydration: { publicList: 'lean', find: 'lean' },
      defaults: { findOptions: quiet, publicListOptions: quiet },
      ...flags,
    });
    const expectedGetterProof = Object.fromEntries(
      ['source', 'target'].map((role) => [
        role,
        {
          modelName: role === 'source' ? Source.modelName : Target.modelName,
          getModelOption: flags,
          getModelOptions: flags,
        },
      ]),
    );
    const authorizationVerification = {
      kind: 'server-option-getters',
      models: {
        source: verifySnapshotFlagOptions(api, Source.modelName, flags),
        target: verifySnapshotFlagOptions(api, Target.modelName, flags),
      },
    };
    assert.deepEqual(authorizationVerification.models, expectedGetterProof);
    await Source.init();
    await Source.insertMany(
      expected.map((row, i) => ({
        _id: new mongoose.Types.ObjectId((i + 100).toString(16).padStart(24, '0')),
        ...row,
      })),
    );
    const select = ['ordinal', ...fields, 'hidden', '-_id'];
    const cores = new WeakSet();
    router.router.post('/_workflow', async (req, res, next) => {
      try {
        assert.ok(req.macl && !cores.has(req.macl), 'Fresh original Core per HTTP operation');
        cores.add(req.macl);
        const svc = router.getService(req);
        if (!old) {
          assert.equal(typeof req.macl.pickAllowedFieldsMany, 'function');
          assert.equal(typeof svc.pickAllowedFieldsMany, 'function');
        }
        let rows = expected,
          first;
        if (c.workflow === 'query-plus-helper') {
          first = await svc.find({}, { select, limit: c.rows, sort: [['ordinal', 1]] }, quiet);
          assert.equal(first.success, true, JSON.stringify(first));
          rows = first.data;
        }
        let data;
        if (job.strategy === 'many') {
          counts.manyCalls++;
          data = await svc.pickAllowedFieldsMany(rows, 'list', {});
        } else if (job.strategy === 'old-query-handles') {
          assert.ok(old && first);
          assert.equal(first.contexts.length, c.rows);
          data = await Promise.all(
            rows.map((row, i) => {
              const handle = first.contexts[i].documentAuthorization;
              assert.ok(handle, 'Actual historical issued row handle');
              counts.handleCalls++;
              return svc.pickAllowedFields(row, 'list', { documentAuthorization: handle });
            }),
          );
        } else {
          assert.ok(['independent', 'old-raw'].includes(job.strategy));
          data = await Promise.all(
            rows.map((row) => {
              counts.independentCalls++;
              return svc.pickAllowedFields(row, 'list', {});
            }),
          );
        }
        res.json({ data });
      } catch (error) {
        next(error);
      }
    });
    const app = express().use(express.json()).use(router.routes);
    app.use((error, _req, res, next) => {
      void next; // Express requires the four-argument error-handler signature.
      res.status(500).json({ error: error.stack ?? String(error) });
    });
    server = await new Promise((done, reject) => {
      const s = app.listen(0, '127.0.0.1', () => done(s));
      s.once('error', reject);
    });
    const invoke = async () => {
      const body = await post(server.address().port, agent);
      assert.deepEqual(Object.keys(body), ['data']);
      assert.deepEqual(body.data, expected, 'EVERY response: all fields/values/order and no private extras');
      return body.data;
    };
    const fullResponseBefore = await invoke();
    for (let i = 0; i < (job.smoke ? 1 : 5); i++) await invoke();
    hydration.clear();
    for (const key of Object.keys(counts)) counts[key] = 0;
    mongoose.set('debug', (_collection, method) => {
      if (/^(find|findOne|countDocuments|estimatedDocumentCount|aggregate|distinct)$/.test(method)) counts.reads++;
    });
    const samplesMs = [],
      responseFingerprints = [],
      cpuStart = process.cpuUsage(),
      start = performance.now();
    for (let i = 0; i < (job.smoke ? 2 : 100); i++) {
      const before = performance.now(),
        data = await invoke();
      responseFingerprints.push(fingerprint(data));
      samplesMs.push(performance.now() - before);
    }
    const elapsed = performance.now() - start,
      cpuMicroseconds = process.cpuUsage(cpuStart),
      measuredCounts = { ...counts },
      measuredHydration = [...hydration];
    mongoose.set('debug', false);
    const fullResponseAfter = await invoke();
    const result = {
      status: 'ok',
      supplement: BATCH_SERIES,
      acceptanceGate: false,
      validationSeries: SERIES,
      distSha256: hash,
      strategy: job.strategy,
      profile: job.profile,
      samplesMs,
      responseFingerprints,
      cpuMicroseconds,
      stats: summarize(samplesMs, elapsed, cpuMicroseconds.user + cpuMicroseconds.system),
      counts: measuredCounts,
      hydration: measuredHydration,
      fullResponseBefore,
      fullResponseAfter,
      outputFingerprint: fingerprint(fullResponseBefore),
      authorizationVerification,
      expectedGetterProof,
      mongoVersion,
      dependencies: { mongoose: mongoose.version, express: require('express/package.json').version },
      dbServerCpu: null,
      allocationCount: null,
      fieldCheckEvidence:
        'Exact 24*N business checks proven separately in instrumented B1 probes, not an invented timed counter',
      freshness:
        job.strategy === 'many'
          ? 'ONE helper entry capture, N separate row stages'
          : job.strategy === 'old-query-handles'
            ? 'Initial query and its actual N issued row handles'
            : 'N independent fresh helper calls; constant actor fixture does NOT equate freshness',
    };
    verifyBatchResult(job, result);
    return result;
  } finally {
    mongoose.set('debug', false);
    agent.destroy();
    if (server)
      await new Promise((done) => {
        server.close(done);
        server.closeAllConnections();
      });
    try {
      if (mongoose.connection.readyState === 1) await mongoose.connection.dropDatabase();
    } finally {
      await mongoose.disconnect();
      mongoose.deleteModel(/^B1/);
      api.runtime.clearOpenApiRoutes();
    }
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const [jobPath, resultPath] = process.argv.slice(2);
  let result;
  try {
    result = await benchmarkBatch(JSON.parse(await readFile(jobPath, 'utf8')));
  } catch (error) {
    result = { status: 'failed', error: error.stack ?? String(error) };
    process.exitCode = 1;
  }
  await writeFile(resultPath, JSON.stringify(result, null, 2) + '\n');
}
