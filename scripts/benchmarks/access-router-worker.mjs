import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { createRequire } from 'node:module';
import { readFile, writeFile } from 'node:fs/promises';
import { Agent, request } from 'node:http';
import { dirname, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import {
  fingerprint,
  integer,
  mapBounded,
  SCENARIOS,
  snapshotDeclarationHash,
  snapshotFlagOptions,
  summarize,
} from './access-router-core.mjs';

async function dependencyVersion(require, name) {
  let directory = dirname(require.resolve(name));
  for (;;) {
    try {
      const meta = JSON.parse(await readFile(resolve(directory, 'package.json'), 'utf8'));
      if (meta.name === name) return meta.version;
    } catch (error) {
      if (error.code !== 'ENOENT') throw error;
    }
    const parent = dirname(directory);
    if (parent === directory) throw new Error(`Cannot identify dependency version: ${name}`);
    directory = parent;
  }
}

function post(port, agent, body) {
  return new Promise((done, reject) => {
    const req = request(
      {
        hostname: '127.0.0.1',
        port,
        path: '/bench/__query',
        method: 'POST',
        agent,
        headers: { 'content-type': 'application/json', 'content-length': Buffer.byteLength(body) },
      },
      (response) => {
        const chunks = [];
        response.on('data', (chunk) => chunks.push(chunk));
        response.on('error', reject);
        response.on('end', () => {
          try {
            const json = JSON.parse(Buffer.concat(chunks).toString('utf8'));
            if (response.statusCode !== 200)
              throw new Error(`HTTP ${response.statusCode}: ${JSON.stringify(json).slice(0, 800)}`);
            done(json);
          } catch (error) {
            reject(error);
          }
        });
      },
    );
    req.setTimeout(120_000, () => req.destroy(new Error('Benchmark HTTP request timed out.')));
    req.on('error', reject);
    req.end(body);
  });
}

/** Verify both getter paths after router creation; unknown/ignored flags must not produce timings. */
export function verifySnapshotFlagOptions(api, modelName, expected) {
  const entries = Object.entries(expected);
  if (!entries.length) return;
  if (typeof api.getModelOption !== 'function' || typeof api.getModelOptions !== 'function')
    throw new Error('Cannot verify unsafe snapshot options on this candidate.');
  const options = api.getModelOptions(modelName);
  for (const [key, value] of entries) {
    if (api.getModelOption(modelName, key) !== value || options?.[key] !== value)
      throw new Error(`Candidate did not apply ${key}=${value} to model ${modelName}.`);
  }
}

export async function benchmark(job) {
  const scenario = SCENARIOS.find((entry) => entry.id === job.scenario);
  if (!scenario) throw new Error(`Unknown scenario: ${job.scenario}`);
  for (const [key, min, max] of [
    ['rows', 1, 10000],
    ['fields', 4, 128],
    ['bytes', 1, 4096],
    ['samples', 1, 1000],
    ['warmup', 0, 100],
    ['concurrency', 1, 32],
    ['hookConcurrency', 1, 32],
  ])
    integer(job[key], min, max);
  if (job.rows * job.fields * (job.bytes + 64) > 64 * 1024 * 1024)
    throw new Error('Fixture exceeds the 64 MiB safety budget.');
  if (!/^access_router_bench_[a-f0-9]{12}_\d+$/.test(job.database))
    throw new Error('Not an owned benchmark database name.');
  if (
    job.target.distSha256 &&
    createHash('sha256')
      .update(await readFile(job.target.entry))
      .digest('hex') !== job.target.distSha256
  )
    throw new Error('Prepared dist changed. Do not run other builds during the benchmark.');

  const snapshotSkips = job.target.snapshotSkips ?? 'off';
  const hasSnapshotConfig =
    job.target.snapshotSkips !== undefined ||
    job.target.supportedSnapshotFlags !== undefined ||
    job.target.snapshotDeclarationsSha256 !== undefined;
  if (
    hasSnapshotConfig &&
    (!Array.isArray(job.target.supportedSnapshotFlags) ||
      !/^[a-f0-9]{64}$/.test(job.target.snapshotDeclarationsSha256 ?? ''))
  )
    throw new Error('Unsafe snapshot configuration requires a prepared declaration manifest.');
  if (hasSnapshotConfig && (await snapshotDeclarationHash(job.target.root)) !== job.target.snapshotDeclarationsSha256)
    throw new Error('Prepared unsafe snapshot flag declarations changed. Rebuild and select candidates again.');
  const supportedFlags = hasSnapshotConfig ? job.target.supportedSnapshotFlags : [];
  const snapshotFlags = snapshotFlagOptions(snapshotSkips, supportedFlags);

  // Resolve peers beside the selected build, NOT beside this runner. Otherwise a
  // tagged build could accidentally use the current checkout's Mongoose instance.
  const require = createRequire(resolve(job.target.root, 'packages/access-router/package.json'));
  const mongoose = require('mongoose');
  const express = require('express');
  const dependencies = Object.fromEntries(
    await Promise.all(
      ['mongoose', 'express', 'zod', '@web-ts-toolkit/utils', '@web-ts-toolkit/express-json-router'].map(
        async (name) => [name, await dependencyVersion(require, name)],
      ),
    ),
  );
  const { createAccessRuntime } = await import(pathToFileURL(job.target.entry).href);
  if (typeof createAccessRuntime !== 'function') throw new Error('This tag does not support createAccessRuntime.');
  const declarations = await readFile(resolve(job.target.root, 'packages/access-router/dist/index.d.ts'), 'utf8');
  const modernHydration = /\bModelHydrationOptions\b/.test(declarations);
  const api = createAccessRuntime();
  let server;
  const agent = new Agent({ keepAlive: true, maxSockets: job.concurrency });
  let reads = 0;
  let getters = 0;
  let documentHooks = 0;
  const hydrationModes = new Set();
  try {
    await mongoose.connect(job.uri, { dbName: job.database, maxPoolSize: Math.max(10, job.concurrency * 2) });
    const mongoVersion = (await mongoose.connection.db.admin().command({ buildInfo: 1 })).version;
    const fieldNames = Array.from({ length: job.fields }, (_, index) => `field${index}`);
    const selected = scenario.fields === 'narrow' ? fieldNames.slice(0, 4) : fieldNames;
    const targetSchema = new mongoose.Schema({ name: String, secret: String }, { versionKey: false });
    const Target = mongoose.model('BenchTarget', targetSchema);
    const sourceSchema = new mongoose.Schema(
      {
        ordinal: Number,
        ownerFlag: Boolean,
        hidden: String,
        ...Object.fromEntries(fieldNames.map((name) => [name, String])),
        children: [new mongoose.Schema({ label: String, amount: Number, hidden: String }, { _id: false })],
        ref: { type: mongoose.Schema.Types.ObjectId, ref: Target.modelName },
      },
      { versionKey: false },
    );
    sourceSchema.pre('find', function () {
      hydrationModes.add(this.mongooseOptions().lean === true ? 'lean' : 'hydrated');
    });
    const Source = mongoose.model('BenchSource', sourceSchema);
    api.setGlobalOptions({
      requestPermissionField: '_permissions',
      globalPermissions: () => ['reader'],
      requestComplexity: { maxHookConcurrency: job.hookConcurrency, maxBulkConcurrency: job.hookConcurrency },
    });
    api.createRouter(Target, {
      operationAccess: { list: true, read: true },
      permissionSchema: { name: true, secret: false },
      stripPermissionsField: true,
      ...snapshotFlags,
    });
    verifySnapshotFlagOptions(api, Target.modelName, snapshotFlags);
    const permissionSchema = {
      ordinal: true,
      hidden: false,
      ...Object.fromEntries(
        fieldNames.map((name, index) => [
          name,
          scenario.documentRules
            ? index % 2
              ? 'doc:owner'
              : (permissions, grants) => (grants === undefined ? permissions.has('reader') : grants.owner === true)
            : scenario.globalRules
              ? 'reader'
              : true,
        ]),
      ),
    };
    const options = {
      basePath: '/bench',
      operationAccess: { list: true, read: true },
      permissionSchema,
      stripPermissionsField: true,
      listHardLimit: job.rows,
      sortableFields: ['ordinal'],
      defaults: {
        publicListOptions: { includePermissions: false, includeFieldPermissions: false, includeCount: false },
      },
      ...snapshotFlags,
    };
    if (modernHydration) options.hydration = { publicList: scenario.hydrated ? 'hydrated' : 'lean' };
    else options.defaults.publicListOptions.lean = !scenario.hydrated;
    if (scenario.documentRules) {
      // Older list paths need non-skim mode to resolve document grants when
      // there are no virtuals and permission metadata is not requested.
      options.defaults.publicListOptions.skim = false;
      options.modelPermissionPrefix = 'doc:';
      options.alwaysSelectFields = ['ownerFlag'];
      options.docPermissions = {
        list: (doc) => {
          documentHooks++;
          return { owner: doc.ownerFlag };
        },
      };
    }
    if (scenario.largeConfig) {
      // Intentionally unused in list work, but part of captured model configuration.
      options.baseFilter = {
        list: {},
        read: { field0: { $in: Array.from({ length: 128 }, (_, index) => new Date(index)) } },
      };
    }
    if (scenario.embedded) {
      permissionSchema.children = { list: true, read: true, sub: { label: true, amount: true, hidden: false } };
      // v0.51 traverses embedded output through registered scope containers.
      // An empty scope declares traversal, not a getter or extra field grant.
      options.virtuals = { children: { sub: {} } };
    }
    if (scenario.populate) permissionSchema.ref = { list: true, read: true };
    if (scenario.virtuals) {
      permissionSchema.summary = true;
      permissionSchema.upper = true;
      options.virtuals = {
        summary: {
          dependsOn: ['field0', 'field1'],
          list: (doc) => {
            getters++;
            return doc.field0.length + doc.field1.length;
          },
        },
        upper: {
          dependsOn: ['field0'],
          list: (doc) => {
            getters++;
            return doc.field0.toUpperCase();
          },
        },
      };
    }
    const router = api.createRouter(Source, options);
    verifySnapshotFlagOptions(api, Source.modelName, snapshotFlags);
    const targets = Array.from({ length: 8 }, (_, index) => ({
      _id: new mongoose.Types.ObjectId((index + 1).toString(16).padStart(24, '0')),
      name: `target:${index}`,
      secret: 'never output',
    }));
    const documents = Array.from({ length: job.rows }, (_, index) => ({
      _id: new mongoose.Types.ObjectId((index + 100).toString(16).padStart(24, '0')),
      ordinal: index,
      ownerFlag: index % 2 === 0,
      hidden: 'never output',
      ...Object.fromEntries(fieldNames.map((name, field) => [name, `${index}:${field}:${'x'.repeat(job.bytes)}`])),
      children: Array.from({ length: 4 }, (_, child) => ({
        label: `child:${child}`,
        amount: child,
        hidden: 'never output',
      })),
      ref: targets[index % targets.length]._id,
    }));
    await Promise.all([Target.init(), Source.init()]);
    await Target.insertMany(targets);
    await Source.insertMany(documents);
    const app = express();
    app.use(express.json());
    app.use(router.routes);
    server = await new Promise((done, reject) => {
      const listening = app.listen(0, '127.0.0.1', () => done(listening));
      listening.once('error', reject);
    });
    const select = ['ordinal', ...selected, 'hidden', '-_id'];
    if (scenario.embedded) select.push('children');
    if (scenario.populate) select.push('ref');
    if (scenario.virtuals) select.push('summary', 'upper');
    const body = JSON.stringify({
      select,
      limit: job.rows,
      sort: 'ordinal',
      ...(scenario.populate ? { populate: [{ path: 'ref', select: 'name -_id' }] } : {}),
    });
    const invoke = () => post(server.address().port, agent, body);
    const expected = documents.map((doc) => {
      const output = { ordinal: doc.ordinal };
      if (!scenario.documentRules || doc.ownerFlag) for (const name of selected) output[name] = doc[name];
      if (scenario.embedded) output.children = doc.children.map(({ label, amount }) => ({ label, amount }));
      if (scenario.populate) output.ref = { name: targets[doc.ordinal % targets.length].name };
      if (scenario.virtuals) {
        output.summary = doc.field0.length + doc.field1.length;
        output.upper = doc.field0.toUpperCase();
      }
      return output;
    });
    const first = await invoke();
    assert.ok(Array.isArray(first.data), 'List response must have a data array.');
    // Do not benchmark an older version silently returning fewer fields/rows or
    // bypassing authorization; mismatch is a failed scenario, not a fast result.
    assert.deepEqual(first.data, expected, 'Scenario output differs from the common-version fixture contract.');
    await mapBounded(job.warmup, job.concurrency, invoke);
    assert.deepEqual(
      [...hydrationModes],
      [scenario.hydrated ? 'hydrated' : 'lean'],
      'Requested hydration mode was not actually used.',
    );
    mongoose.set('debug', (_collection, method) => {
      if (/^(find|findOne|countDocuments|estimatedDocumentCount|aggregate|distinct)$/.test(method)) reads++;
    });
    getters = 0;
    documentHooks = 0;
    const cpuStart = process.cpuUsage();
    const start = performance.now();
    const samples = await mapBounded(job.samples, job.concurrency, async () => {
      const before = performance.now();
      const response = await invoke();
      const duration = performance.now() - before;
      assert.equal(response.data?.length, job.rows, 'Measured response row count changed.');
      return duration;
    });
    const elapsed = performance.now() - start;
    const cpu = process.cpuUsage(cpuStart);
    const measured = { readsPerRequest: reads / job.samples, measuredReads: reads, getters, documentHooks };
    mongoose.set('debug', false);
    const validation = await invoke(); // Outside measured latency, CPU and read counters.
    assert.deepEqual(validation.data, expected, 'Output changed after measurement.');
    return {
      status: 'ok',
      targetId: job.target.id,
      scenario: job.scenario,
      rows: job.rows,
      concurrency: job.concurrency,
      snapshotSkips,
      snapshotFlags,
      stats: summarize(samples, elapsed, cpu.user + cpu.system),
      samplesMs: samples,
      ...measured,
      dependencies,
      mongoVersion,
      hydration: [...hydrationModes][0],
      outputFingerprint: fingerprint(first.data),
    };
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
      api.runtime.clearOpenApiRoutes();
    }
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const [jobPath, resultPath] = process.argv.slice(2);
  let result;
  try {
    result = await benchmark(JSON.parse(await readFile(jobPath, 'utf8')));
  } catch (error) {
    result = { status: 'failed', error: error.stack ?? String(error) };
    console.error(result.error);
    process.exitCode = 1;
  }
  if (resultPath) await writeFile(resultPath, `${JSON.stringify(result, null, 2)}\n`);
  else console.error('Usage: node access-router-worker.mjs <job.json> <result.json>');
}
