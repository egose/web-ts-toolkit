/** Separate public-API series. No compiler or private package imports in this heap. */
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile, writeFile } from 'node:fs/promises';
import { Agent, request } from 'node:http';
import { createRequire } from 'node:module';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import {
  fingerprint,
  summarize,
  verifySnapshotDeclarationManifest,
  authorizationModeOptions,
  snapshotFlagOptions,
  initialOutputCopyFlagOptions,
  authorizationFastPathFlagOptions,
  documentPermissionFixtureOptions,
} from './access-router-core.mjs';
import { verifySnapshotFlagOptions } from './access-router-worker.mjs';
import { validateJob, verifyCounts, verifyCountContract, SERIES } from './access-router-owned-core.mjs';

export function checksum() {
  let value = 0x12345678;
  for (let i = 0; i < 10000; i++) value = (Math.imul(value ^ i, 1664525) + 1013904223) >>> 0;
  return value;
}
const checksumExpected = checksum();

/** Compare the entire selected native response, including LIST cardinality/order. */
export function verifyNativeResponse(value, expectedRows, list) {
  assert.deepEqual(value, list ? expectedRows : expectedRows[0], 'Full bounded native response, not a subset');
}

function post(port, agent, path, body = {}) {
  const text = JSON.stringify(body);
  return new Promise((done, reject) => {
    const req = request(
      {
        hostname: '127.0.0.1',
        port,
        agent,
        path,
        method: 'POST',
        headers: { 'content-type': 'application/json', 'content-length': Buffer.byteLength(text) },
      },
      (res) => {
        const chunks = [];
        res.on('data', (c) => chunks.push(c));
        res.on('error', reject);
        res.on('end', () => {
          try {
            done({ status: res.statusCode, body: JSON.parse(Buffer.concat(chunks).toString()) });
          } catch (error) {
            reject(error);
          }
        });
      },
    );
    req.on('error', reject);
    req.setTimeout(120000, () => req.destroy(new Error('HTTP timeout')));
    req.end(text);
  });
}

export async function benchmarkOwned(input) {
  const job = validateJob(input);
  const hash = createHash('sha256')
    .update(await readFile(job.target.entry))
    .digest('hex');
  assert.equal(hash, job.target.distSha256, 'Prepared dist changed');
  const manifest = await verifySnapshotDeclarationManifest(job.target); // separate child exits before peers/runtime
  const old = job.target.profile.startsWith('current-');
  if (old && manifest.supportedAuthorizationModes.length)
    throw new Error('Historical profiles require historical bytes.');
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
  const { createAccessRuntime, guard } = await import(pathToFileURL(job.target.entry));
  const api = createAccessRuntime();
  const counts = { reads: 0, hooks: 0, getters: 0, expensive: 0, adapterReads: 0, callbacks: 0 };
  const hydration = new Set();
  const factResults = new Set();
  let server;
  const agent = new Agent({ keepAlive: true, maxSockets: 1 });
  const adapter = job.family === 'native-adapter';
  const quiet = {
    includePermissions: false,
    includeFieldPermissions: false,
    includeCount: false,
    tryList: false,
    skim: false,
  };
  try {
    if (!adapter) await mongoose.connect(job.uri, { dbName: job.database, maxPoolSize: 10 });
    const mongoVersion = adapter ? null : (await mongoose.connection.db.admin().command({ buildInfo: 1 })).version;
    const fields = Array.from({ length: job.fields }, (_, i) => `field${i}`);
    const docRules =
      job.scenario === 'document-rules' ||
      job.family === 'facts' ||
      job.family === 'retention' ||
      ['H2', 'H2-query', 'H3', 'H3-query', 'H4'].includes(job.scenario) ||
      adapter;
    const schema = new mongoose.Schema(
      {
        ordinal: Number,
        ownerFlag: Boolean,
        visible: Boolean,
        hidden: String,
        ...Object.fromEntries(fields.map((f) => [f, String])),
        children: [new mongoose.Schema({ label: String, amount: Number, hidden: String }, { _id: false })],
        nested: { field0: String, hidden: String },
        value: mongoose.Schema.Types.Mixed,
      },
      { versionKey: false },
    );
    for (const method of ['find', 'findOne'])
      schema.pre(method, function () {
        hydration.add(this.mongooseOptions().lean === true ? 'lean' : 'hydrated');
      });
    const Source = mongoose.model('OwnedBenchSource', schema);
    const Target = mongoose.model('OwnedBenchTarget', new mongoose.Schema({ name: String }, { versionKey: false }));
    api.setGlobalOptions({
      globalPermissions: () => ({ reader: true, admin: false }),
      logger: { warn() {} },
      requestComplexity: { maxHookConcurrency: job.hookConcurrency, maxBulkConcurrency: job.hookConcurrency },
    });
    api.createRouter(Target, { operationAccess: true, permissionSchema: { name: true }, ...flags });
    const permissionSchema = {
      ordinal: true,
      ownerFlag: false,
      hidden: false,
      ...Object.fromEntries(
        fields.map((f) => [
          f,
          docRules
            ? (_permissions, grants) => {
                counts.callbacks++;
                return grants.owner === true;
              }
            : 'reader',
        ]),
      ),
      nested: { read: true, list: true, sub: { field0: 'reader', hidden: false } },
    };
    const hook = (doc) => {
      counts.hooks++;
      if (job.scenario === 'unused-checksum') {
        counts.expensive++;
        const value = checksum();
        factResults.add(value);
        return { owner: doc.ownerFlag === true, unusedChecksum: value === checksumExpected };
      }
      return { owner: doc.ownerFlag === true };
    };
    const options = {
      basePath: '/bench',
      operationAccess: { read: true, list: true },
      permissionSchema,
      stripPermissionsField: job.scenario !== 'H4',
      listHardLimit: 100,
      sortableFields: ['ordinal'],
      hydration: {
        publicRead: job.scenario === 'hydrated' ? 'hydrated' : 'lean',
        publicList: 'lean',
        find: 'lean',
        findOne: 'lean',
      },
      defaults: {
        publicReadOptions: job.scenario === 'H4' ? { ...quiet, includePermissions: true } : quiet,
        publicListOptions: quiet,
        findOptions: quiet,
        findOneOptions: quiet,
      },
      ...(docRules
        ? {
            modelPermissionPrefix: 'doc:',
            ...(await documentPermissionFixtureOptions(job.target, ['ownerFlag'], { read: hook, list: hook })),
          }
        : {}),
      ...flags,
    };
    if (['H1', 'H1-scoped'].includes(job.scenario))
      permissionSchema.field0 = (permissions, grants) => {
        counts.callbacks++;
        if (!old) {
          assert.ok(Object.isFrozen(grants));
          assert.deepEqual(Object.keys(grants), []);
        } else if (grants !== undefined) assert.deepEqual(Object.keys(grants), []);
        return permissions.has('reader');
      };
    if (job.scenario === 'embedded') {
      permissionSchema.children = { read: true, list: true, sub: { label: true, amount: true, hidden: false } };
      options.virtuals = { children: { sub: {} } };
    }
    if (job.scenario === 'virtuals') {
      permissionSchema.summary = true;
      permissionSchema.upper = true;
      options.virtuals = {
        summary: {
          dependsOn: ['field0', 'field1'],
          read: (doc) => {
            counts.getters++;
            return doc.field0.length + doc.field1.length;
          },
        },
        upper: {
          dependsOn: ['field0'],
          read: (doc) => {
            counts.getters++;
            return doc.field0.toUpperCase();
          },
        },
      };
    }
    if (adapter) permissionSchema.value = true;
    const router = api.createRouter(Source, options);
    const verification = {
      kind: 'server-option-getters',
      models: {
        source: verifySnapshotFlagOptions(api, Source.modelName, flags),
        target: verifySnapshotFlagOptions(api, Target.modelName, flags),
      },
    };
    const B = mongoose.mongo.BSON;
    const nativeValue = () => ({
      date: new Date(0),
      buffer: Buffer.from([1, 2, 3]),
      id: new B.ObjectId('000000000000000000000001'),
      code: new B.Code('return 1', { safe: true }),
      ref: new B.DBRef('collection', new B.ObjectId('000000000000000000000002'), 'db', { selected: true }),
      nested: [new Map([['safe', new Date(1)]])],
    });
    const documents = Array.from({ length: job.rows }, (_, index) => ({
      _id: new mongoose.Types.ObjectId((index + 100).toString(16).padStart(24, '0')),
      ordinal: index,
      ownerFlag: adapter || job.family === 'helper' ? true : index % 2 === 0,
      visible: true,
      hidden: 'never output',
      ...Object.fromEntries(fields.map((f, i) => [f, `${index}:${i}:${'x'.repeat(job.bytes)}`])),
      children: Array.from({ length: 4 }, (_, i) => ({ label: `child:${i}`, amount: i, hidden: 'never output' })),
      nested: { field0: 'scoped', hidden: 'never output' },
      ...(adapter ? { value: nativeValue() } : {}),
    }));
    if (adapter) {
      Source.Query.prototype.exec = async function () {
        counts.adapterReads++;
        if (this.op === 'find') return documents.map((doc) => ({ ...doc, value: nativeValue() }));
        assert.equal(this.op, 'findOne');
        return { ...documents.find((d) => String(d._id) === String(this.getFilter()._id)), value: nativeValue() };
      };
    } else {
      await Source.init();
      await Source.insertMany(documents);
    }
    const select = ['ordinal', ...fields, 'hidden', '-_id'];
    if (job.scenario === 'embedded') select.push('children');
    if (job.scenario === 'virtuals') select.push('summary', 'upper');
    if (adapter) select.push('value');
    const plainExpected = (index) => {
      const doc = documents[index];
      const result = { ordinal: index };
      if (!docRules || doc.ownerFlag) for (const f of fields) result[f] = doc[f];
      if (job.scenario === 'embedded') result.children = doc.children.map(({ label, amount }) => ({ label, amount }));
      if (job.scenario === 'virtuals') {
        result.summary = doc.field0.length + doc.field1.length;
        result.upper = doc.field0.toUpperCase();
      }
      return result;
    };
    const checked = (result) => {
      assert.equal(result.success, true, JSON.stringify(result));
      return result;
    };
    const findOne = async (svc, index) => checked(await svc.findById(String(documents[index]._id), { select }, quiet));
    const find = async (svc) => checked(await svc.find({}, { select, limit: job.rows, sort: [['ordinal', 1]] }, quiet));
    const subset = (data) => ({
      ordinal: data.ordinal,
      ...(Object.hasOwn(data, 'field0') ? { field0: data.field0 } : {}),
    });
    const oldPick = (svc, row, context) => {
      assert.ok(context?.documentAuthorization, 'Historical flow requires an actual public handle');
      return svc.pickAllowedFields(row, 'read', { documentAuthorization: context.documentAuthorization });
    };
    const runDirect = async (req, index) => {
      const svc = router.getService(req); // NEW original request/Core for every sample
      if (job.family === 'native-adapter')
        return job.api === 'direct-list' ? (await find(svc)).data : (await findOne(svc, index)).data;
      if (job.family === 'facts' || job.family === 'retention') return (await find(svc)).data;
      const recipe = job.scenario;
      if (['H1', 'H1-scoped'].includes(recipe)) {
        const raw = {
          field0: 'raw',
          nested: { field0: 'scoped', hidden: 'explicit-scoped' },
          hidden: 'never output',
          _permissions: { owner: true },
        };
        if (recipe === 'H1-scoped')
          return svc.pickAllowedFields(raw.nested, 'read', {
            scopePath: ['nested'],
            authorization: { outputFields: { mode: 'grant', paths: ['nested.hidden'] } },
          });
        return {
          pick: await svc.pickAllowedFields(raw, 'read', {}),
          trim: await svc.trimOutputFields(raw, 'read', {}),
          fields: await svc.genAllowedFields(raw, 'read', { purpose: 'output' }),
        };
      }
      const batch = recipe.startsWith('H3');
      const first = batch ? await find(svc) : await findOne(svc, index);
      if (recipe.endsWith('-query')) return first.data;
      if (recipe === 'H0') return subset(first.data);
      if (recipe.endsWith('-global')) {
        if (batch)
          return Promise.all(
            first.data.map((row, index) =>
              svc.pickAllowedFields(
                row,
                'list',
                old
                  ? {
                      documentAuthorization: first.contexts[index].documentAuthorization,
                    }
                  : {},
              ),
            ),
          );
        return old ? oldPick(svc, first.data, first.context) : svc.pickAllowedFields(first.data, 'read', {});
      }
      if (old) {
        if (!batch) return oldPick(svc, first.data, first.context);
        assert.equal(first.contexts?.length, job.rows);
        return Promise.all(
          first.data.map((row, index) =>
            svc.pickAllowedFields(row, 'list', {
              documentAuthorization: first.contexts[index].documentAuthorization,
            }),
          ),
        );
      }
      const current = batch ? await find(svc) : await findOne(svc, index);
      return current.data; // Already-authorized data; no raw helper masquerading as current authority
    };
    const app = express().use(express.json());
    let retained;
    // Use the actual router's middleware stack to bind original request/Core.
    router.router.post('/_workflow', async (req, res) => {
      const data = await runDirect(req, Number(req.body.index ?? 0));
      if (job.family === 'retention') retained = data;
      res.json({ data });
    });
    router.router.post('/_findOne', async (req, res) => {
      const svc = router.getService(req);
      res.json({ data: checked(await svc.findOne({ ordinal: req.body.index }, { select }, quiet)).data });
    });
    router.router.post(
      '/_guard',
      guard({ modelName: Source.modelName, id: String(documents[0]._id), condition: 'reader owner' }),
      (_req, res) => {
        res.json({ data: { allowed: true } });
      },
    );
    app.use(router.routes);
    app.use((error, req, res, next) =>
      router.router.responseHandler.handleResponse(() => {
        throw error;
      })(req, res, next),
    );
    server = await new Promise((done, reject) => {
      const s = app.listen(0, '127.0.0.1', () => done(s));
      s.once('error', reject);
    });
    const invoke = async (index) => {
      index %= job.rows;
      let response;
      if (job.family === 'read')
        response = await post(
          server.address().port,
          agent,
          job.api === 'http-id' ? `/bench/__query/${documents[index]._id}` : '/bench/__query/__filter',
          { select, filter: { ordinal: index }, options: quiet },
        );
      else
        response = await post(
          server.address().port,
          agent,
          job.scenario === 'H4' ? '/bench/_guard' : '/bench/_workflow',
          { index },
        );
      assert.equal(response.status, 200, JSON.stringify(response));
      // Generated READ returns a row directly, LIST/custom workflow have {data}.
      return job.family === 'read' ? response.body : response.body.data;
    };
    const expected = (index) => {
      index %= job.rows;
      if (job.family === 'read') return plainExpected(index);
      if (job.family === 'facts' || job.family === 'retention') return documents.map((_, i) => plainExpected(i));
      if (job.family === 'native-adapter') return undefined;
      if (job.scenario === 'H4') return { allowed: true };
      if (job.scenario === 'H1-scoped') return { field0: 'scoped', hidden: 'explicit-scoped' };
      if (job.scenario === 'H1')
        return {
          pick: { field0: 'raw', nested: { field0: 'scoped' } },
          trim: { field0: 'raw', nested: { field0: 'scoped' } },
          fields: ['field0', 'nested.field0'],
        };
      if (job.scenario === 'H0') return subset(plainExpected(index));
      if (job.scenario.startsWith('H3')) return documents.map((_, i) => plainExpected(i));
      return plainExpected(index);
    };
    const check = (value, index) => {
      if (adapter) {
        const indexes = job.api === 'direct-list' ? documents.map((_, i) => i) : [index % job.rows];
        verifyNativeResponse(
          value,
          indexes.map((ordinal) => ({
            ...plainExpected(ordinal),
            value: {
              date: '1970-01-01T00:00:00.000Z',
              buffer: { type: 'Buffer', data: [1, 2, 3] },
              id: '000000000000000000000001',
              code: { code: 'return 1', scope: { safe: true } },
              ref: { $ref: 'collection', $id: '000000000000000000000002', selected: true, $db: 'db' },
              nested: [{ safe: '1970-01-01T00:00:00.001Z' }],
            },
          })),
          job.api === 'direct-list',
        );
      } else assert.deepEqual(value, expected(index), `${job.id} full response mismatch`);
      return fingerprint(value);
    };
    const first = await invoke(0);
    check(first, 0);
    if (job.family === 'read')
      assert.deepEqual(
        [...hydration],
        [job.scenario === 'hydrated' ? 'hydrated' : 'lean'],
        'Actual public READ hydration differs',
      );
    if (!adapter)
      mongoose.set('debug', (_collection, method) => {
        if (/^(find|findOne|countDocuments|estimatedDocumentCount|aggregate|distinct)$/.test(method)) counts.reads++;
      });
    // Actual packed direct findById + findOne checks, outside HTTP READ timing/counters.
    const directProbes = [];
    if (job.family === 'read')
      for (const path of ['/bench/_workflow', '/bench/_findOne']) {
        // _workflow uses the same public by-ID API for this explicit probe.
        if (path.endsWith('_workflow')) {
          const savedFamily = job.family;
          job.family = 'helper';
          const savedScenario = job.scenario;
          job.scenario = 'H2-query';
          const before = { ...counts };
          const r = await post(server.address().port, agent, path, { index: 0 });
          job.family = savedFamily;
          job.scenario = savedScenario;
          assert.equal(r.status, 200);
          assert.deepEqual(r.body.data, plainExpected(0));
          directProbes.push({
            api: 'findById',
            reads: counts.reads - before.reads,
            hooks: counts.hooks - before.hooks,
          });
        } else {
          const before = { ...counts };
          const r = await post(server.address().port, agent, path, { index: 0 });
          assert.equal(r.status, 200);
          assert.deepEqual(r.body.data, plainExpected(0));
          directProbes.push({ api: 'findOne', reads: counts.reads - before.reads, hooks: counts.hooks - before.hooks });
        }
      }
    for (const probe of directProbes) {
      assert.equal(probe.reads, 1);
      assert.equal(probe.hooks, docRules ? 1 : 0);
    }
    hydration.clear();
    for (let i = 0; i < job.warmup; i++) check(await invoke(i), i);
    for (const key of Object.keys(counts)) counts[key] = 0;
    if (!adapter)
      mongoose.set('debug', (_collection, method) => {
        if (/^(find|findOne|countDocuments|estimatedDocumentCount|aggregate|distinct)$/.test(method)) counts.reads++;
      });
    const samplesMs = [],
      fingerprints = [];
    const cpuStart = process.cpuUsage(),
      start = performance.now();
    for (let i = 0; i < job.samples; i++) {
      const before = performance.now();
      const value = await invoke(i);
      check(value, i); // SAME overhead for both artifacts, explicitly separate checked series
      samplesMs.push(performance.now() - before);
      fingerprints.push(fingerprint(value));
    }
    const elapsed = performance.now() - start,
      cpu = process.cpuUsage(cpuStart),
      measuredCounts = { ...counts };
    verifyCounts(job, measuredCounts);
    if (job.family === 'read') assert.deepEqual([...hydration], [job.scenario === 'hydrated' ? 'hydrated' : 'lean']);
    mongoose.set('debug', false);
    check(await invoke(0), 0);
    if (job.scenario === 'unused-checksum') assert.deepEqual([...factResults], [checksum()]);
    let retention;
    if (job.family === 'retention') {
      if (typeof global.gc !== 'function') throw new Error('Retention requires Node --expose-gc.');
      const force = async () => {
        for (let i = 0; i < 3; i++) {
          await new Promise((done) => setImmediate(done));
          global.gc();
        }
        return process.memoryUsage().heapUsed;
      };
      retained = undefined;
      const before = await force(),
        held = [],
        released = [];
      for (const key of Object.keys(counts)) counts[key] = 0;
      mongoose.set('debug', (_collection, method) => {
        if (/^(find|findOne|countDocuments|estimatedDocumentCount|aggregate|distinct)$/.test(method)) counts.reads++;
      });
      for (let cycle = 0; cycle < 4; cycle++) {
        for (let i = 0; i < 5; i++) check(await invoke(0), 0);
        assert.equal(retained?.length, job.rows, 'The held observation must really retain a published result');
        held.push(await force());
        retained = undefined;
        released.push(await force());
      }
      verifyCounts(job, counts, 20);
      mongoose.set('debug', false);
      retention = {
        before,
        held,
        released,
        heldRows: job.rows,
        fields: job.fields,
        gcPerObservation: 3,
        cycles: 4,
        operationsPerCycle: 5,
        warmup: job.warmup,
        heldAtLastObservation: retained !== undefined,
        extraWork: { ...counts },
        allocationCount: null,
        allocationCountReason: 'unavailable; retained heap bytes are NOT allocation counts',
      };
    }
    return {
      status: 'ok',
      id: job.id,
      profile: job.target.profile,
      distSha256: hash,
      validationSeries: SERIES,
      ...(job.scenario === 'H4' ? { countContract: verifyCountContract(job.target) } : {}),
      samplesMs,
      cpuMicroseconds: cpu,
      stats: summarize(samplesMs, elapsed, cpu.user + cpu.system),
      counts: measuredCounts,
      outputFingerprint: fingerprint(first),
      responseFingerprints: fingerprints,
      hydration: [...hydration],
      directProbes,
      retention,
      checksum: job.scenario === 'unused-checksum' ? checksum() : undefined,
      source: adapter ? 'explicit Mongoose Query adapter; ZERO MongoDB reads (not Mongo timing)' : 'real MongoDB',
      dependencies: { mongoose: mongoose.version, express: require('express/package.json').version },
      mongoVersion,
      dbServerCpu: null,
      allocationCount: null,
      authorizationVerification: verification,
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
      if (!adapter && mongoose.connection.readyState === 1) await mongoose.connection.dropDatabase();
    } finally {
      await mongoose.disconnect();
      mongoose.deleteModel(/^OwnedBench/);
      api.runtime.clearOpenApiRoutes();
    }
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const [jobPath, resultPath] = process.argv.slice(2);
  let result;
  try {
    result = await benchmarkOwned(JSON.parse(await readFile(jobPath, 'utf8')));
  } catch (error) {
    result = { status: 'failed', error: error.stack ?? String(error) };
    process.exitCode = 1;
  }
  if (resultPath) await writeFile(resultPath, `${JSON.stringify(result, null, 2)}\n`);
  else throw new Error('Usage: node [--expose-gc] access-router-owned-worker.mjs job.json result.json');
}
