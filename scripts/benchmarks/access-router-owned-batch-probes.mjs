/** Instrumented copied artifact ONLY. Never timing, allocation, or acceptance evidence. */
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdir, readFile, symlink, writeFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { authorizationModeOptions, fingerprint } from './access-router-core.mjs';
import { verifySnapshotFlagOptions } from './access-router-worker.mjs';
import { batchRows } from './access-router-owned-batch-core.mjs';

export function instrumentBatchBundle(source) {
  const require = createRequire(import.meta.url),
    ts = require('typescript');
  const names = [
    'captureOutputHelperConfiguration',
    'captureAuthorizationFieldCatalog',
    'captureAuthorizationPermissions',
    'createDocumentStage',
    'resolveEmptyOutputHelperStage',
    'copyDocumentView',
    'normalizeDocumentGrants',
    'evaluateAuthorizedOutputField',
    'memoizeStageFieldDecision',
    'resolveDocumentStage',
    'clearOutputFieldPolicy',
    'clearCapturedOutputCatalog',
    'clearOutputHelperAuthorization',
    'failOutputPublication',
    'closeOutputPublication',
  ];
  for (const name of names) {
    const re = new RegExp(`(^(?:async )?function ${name}\\([^\\n]*\\) \\{)`, 'gm');
    assert.equal([...source.matchAll(re)].length, 1, `One actual instrumentation seam: ${name}`);
    source = source.replace(re, `$1\n globalThis.__oarBatchEvent('${name}', arguments);`);
  }
  const stage = /stages\.set\(stage, (record\d*)\);/g;
  assert.equal([...source.matchAll(stage)].length, 1);
  source = source.replace(stage, "$&\n globalThis.__oarBatchEvent('stageRecord', [stage, $1]);");
  const ctor = /constructor\(permissions\) \{/g;
  assert.equal([...source.matchAll(ctor)].length, 1);
  source = source.replace(ctor, "$&\n globalThis.__oarBatchEvent('permissionMapConstruction', [permissions]);");
  // Observe actual explicit Promise constructors, binding object creation, and budget
  // returns. Do not guess implicit async Promises or claim engine allocation totals.
  const ast = ts.createSourceFile('copied.mjs', source, ts.ScriptTarget.Latest, true, ts.ScriptKind.JS),
    inserts = [];
  let promiseSeams = 0,
    bindingSeams = 0,
    budgetSeams = 0;
  const wrap = (node, prefix, suffix = ')') => {
    inserts.push([node.getStart(ast), prefix], [node.end, suffix]);
  };
  const visit = (node) => {
    if (ts.isNewExpression(node) && node.expression.getText(ast) === 'Promise') {
      wrap(node, "(globalThis.__oarBatchEvent('explicitPromiseConstructor', []), ", ')');
      promiseSeams++;
    }
    if (
      ts.isVariableDeclaration(node) &&
      ['binding', 'receiver'].includes(node.name.getText(ast)) &&
      node.initializer &&
      ts.isObjectLiteralExpression(node.initializer)
    ) {
      wrap(node.initializer, 'globalThis.__oarBatchBinding(');
      bindingSeams++;
    }
    if (ts.isCallExpression(node) && node.expression.getText(ast) === 'createPublicationRowBudget') {
      wrap(node, 'globalThis.__oarBatchBudget(');
      budgetSeams++;
    }
    ts.forEachChild(node, visit);
  };
  visit(ast);
  assert.ok(promiseSeams > 0 && bindingSeams > 0 && budgetSeams > 0);
  for (const [at, text] of inserts.sort((a, b) => b[0] - a[0])) source = source.slice(0, at) + text + source.slice(at);
  source +=
    '\nexport const __oarBatchDebug = {stageRecord, readDocumentStage, documentStageSource, readServiceAuthorization, fieldPolicies, preparedOutputCatalogs, recordFor, visitTrustedOutput, currentOutputWorkLedger};\n';
  return { source, seams: { names, promiseSeams, bindingSeams, budgetSeams } };
}

const deferred = () => {
  let resolve;
  const promise = new Promise((done) => {
    resolve = done;
  });
  return { promise, resolve };
};

export async function probeBatch(target, directory) {
  assert.ok(['isolated', 'trusted'].includes(target.profile));
  await mkdir(directory);
  const original = await readFile(target.entry, 'utf8');
  assert.equal(createHash('sha256').update(original).digest('hex'), target.distSha256);
  const injected = instrumentBatchBundle(original),
    entry = resolve(directory, 'instrumented.mjs');
  await writeFile(entry, injected.source);
  await symlink(resolve(target.root, 'packages/access-router/node_modules'), resolve(directory, 'node_modules'), 'dir');
  let observation;
  const event = (name, args) => {
    if (!observation) return;
    observation.counts[name] = (observation.counts[name] ?? 0) + 1;
    if (name === 'stageRecord') {
      const [stage, record] = args;
      observation.stages.push({
        stage,
        record,
        binding: record.binding,
        source: record.source,
        memo: record.decisions,
        call: record.call,
      });
    }
    if (name === 'evaluateAuthorizedOutputField' && /^field\d+$/.test(args[2])) observation.businessChecks++;
    if (name === 'clearOutputFieldPolicy') {
      const value = debug.fieldPolicies.get(args[0]);
      if (value) observation.policies.push(value);
    }
    if (name === 'clearCapturedOutputCatalog') {
      const value = debug.preparedOutputCatalogs.get(args[0]);
      if (value && typeof value === 'object') observation.catalogs.push(value);
    }
    if (['failOutputPublication', 'closeOutputPublication'].includes(name)) {
      const ledger = debug.recordFor(args[0]).ledger;
      if (ledger)
        observation.ledgerObservations.push({
          event: name,
          work: ledger.work,
          payload: ledger.payload,
          failed: !!ledger.failure,
        });
    }
  };
  globalThis.__oarBatchEvent = event;
  globalThis.__oarBatchBinding = (value) => {
    event('bindingObjectConstruction', [value]);
    return value;
  };
  globalThis.__oarBatchBudget = (value) => {
    if (observation) observation.lastBudget = value;
    return value;
  };
  const require = createRequire(resolve(target.root, 'packages/access-router/package.json')),
    mongoose = require('mongoose'),
    express = require('express');
  const library = await import(pathToFileURL(entry)),
    debug = library.__oarBatchDebug,
    api = library.createAccessRuntime();
  let server,
    activeRequest,
    scenario,
    globalReader = true,
    callbacks = 0,
    reads = 0,
    hooks = 0,
    virtuals = 0,
    first = true,
    raw,
    entered,
    release;
  const fields = Array.from({ length: 24 }, (_, i) => `field${i}`),
    flags = authorizationModeOptions(target),
    records = [];
  const Source = mongoose.model(
    'B1ProbeSource',
    new mongoose.Schema(
      {
        ordinal: Number,
        ...Object.fromEntries(fields.map((f) => [f, String])),
        nested: { field0: String },
        payload: mongoose.Schema.Types.Mixed,
      },
      { versionKey: false },
    ),
  );
  const Target = mongoose.model('B1ProbeTarget', new mongoose.Schema({ name: String }));
  Source.Query.prototype.exec = async function () {
    reads++;
    throw new Error('Raw helper attempted a query');
  };
  api.setGlobalOptions({
    globalPermissions: () => ({ reader: globalReader }),
    logger: { warn() {} },
    requestComplexity: { maxHookConcurrency: 10, maxBulkConcurrency: 10 },
  });
  const makeSchema = (control = false) => ({
    ordinal: true,
    ...Object.fromEntries(
      fields.map((f) => [
        f,
        control
          ? async function (permissions, grants) {
              callbacks++;
              if (scenario !== 'independent')
                assert.equal(observation.stages.length, raw.length, 'ALL row sources owned before the first predicate');
              assert.equal(this, activeRequest);
              assert.equal(permissions.has('reader'), true);
              assert.ok(Object.isFrozen(grants));
              assert.deepEqual(Reflect.ownKeys(grants), []);
              if (scenario === 'freshness' && first) {
                first = false;
                raw[1].field0 = 'mutated after all-source admission';
                globalReader = false;
                api.setModelOption(Source.modelName, 'permissionSchema', {
                  ordinal: true,
                  ...Object.fromEntries(fields.map((name) => [name, false])),
                });
                await activeRequest.macl.setPermissions();
              }
              if (scenario === 'poison' && f === 'field0') {
                if (first) {
                  first = false;
                  entered.resolve();
                  await release.promise;
                } else {
                  try {
                    debug.visitTrustedOutput(observation.lastBudget, 101);
                  } catch {
                    /* caught poison remains sticky */
                  }
                }
              }
              return true;
            }
          : 'reader',
      ]),
    ),
    nested: { read: true, list: true, sub: { field0: 'reader' } },
    payload: true,
  });
  api.createRouter(Target, { operationAccess: true, permissionSchema: { name: true }, ...flags });
  const router = api.createRouter(Source, {
    basePath: '/probe',
    operationAccess: true,
    permissionSchema: makeSchema(),
    stripPermissionsField: true,
    docPermissions: {
      list: () => {
        hooks++;
        return { owner: true };
      },
    },
    virtuals: {
      extra: {
        list: () => {
          virtuals++;
          return 'not helper work';
        },
      },
    },
    ...flags,
  });
  const getterProof = {
    source: verifySnapshotFlagOptions(api, Source.modelName, flags),
    target: verifySnapshotFlagOptions(api, Target.modelName, flags),
  };
  router.router.post('/_run', async (req, res, next) => {
    activeRequest = req;
    const svc = router.getService(req);
    try {
      let output;
      if (scenario === 'independent')
        output = await Promise.all(raw.map((row) => svc.pickAllowedFields(row, 'list', {})));
      else if (scenario === 'core') output = await req.macl.pickAllowedFieldsMany(Source.modelName, raw, 'list', {});
      else if (scenario === 'scope')
        output = await svc.pickAllowedFieldsMany(raw, 'list', {
          scopePath: ['nested'],
          authorization: { outputFields: { mode: 'grant', paths: ['nested.field0'] } },
        });
      else if (scenario === 'bad-policy')
        output = await svc.pickAllowedFieldsMany([], 'list', { authorization: { rows: { mode: 'all' } } });
      else if (scenario === 'bad-scope')
        output = await svc.pickAllowedFieldsMany([], 'list', { scopePath: ['missing'] });
      else output = await svc.pickAllowedFieldsMany(raw, 'list', {});
      if (scenario === 'freshness')
        assert.deepEqual(await svc.pickAllowedFieldsMany([{ ordinal: 99, field0: 'new' }], 'list'), [{ ordinal: 99 }]);
      res.json({ output });
    } catch (error) {
      next(error);
    }
  });
  const app = express().use(express.json()).use(router.routes);
  app.use((error, _req, res, next) => {
    void next; // Express requires the four-argument error-handler signature.
    res.status(error.statusCode ?? error.status ?? 500).json({ error: error.message, name: error.name });
  });
  const assertCleared = (many) => {
    for (const { stage, record, binding, call } of observation.stages) {
      assert.equal(record.state, 'closed');
      assert.equal(record.decisions.size, 0);
      for (const key of ['source', 'grants', 'access', 'view', 'call', 'binding', 'publication', 'owning', 'result'])
        assert.equal(record[key], undefined, `Actually cleared ${key}`);
      assert.throws(() => debug.readDocumentStage(stage, binding));
      assert.throws(() => debug.documentStageSource(stage, binding));
      if (many) assert.throws(() => debug.readServiceAuthorization(call, binding));
    }
    for (const policy of observation.policies) assert.equal(policy.accesses.size, 0);
    for (const catalog of observation.catalogs) {
      assert.equal(catalog.paths.size, 0);
      assert.equal(catalog.results.size, 0);
    }
    for (const owner of observation.owners) {
      const rec = debug.recordFor(owner);
      assert.equal(rec.closed, true);
      assert.equal(rec.pending.size, 0);
      assert.equal(rec.stages.size, 0);
      assert.equal(rec.resources.size, 0);
      assert.equal(rec.ledger, undefined);
    }
  };
  const run = async (name, rows, control = false, repeated = false) => {
    scenario = name;
    globalReader = true;
    callbacks = 0;
    first = true;
    api.setModelOption(Source.modelName, 'permissionSchema', makeSchema(control));
    raw = repeated ? Array(rows).fill(batchRows(1)[0]) : batchRows(rows);
    if (name === 'scope') raw = [{ field0: 'scope' }];
    if (name === 'row-cap') raw = Array(1001).fill({ field0: 'v' });
    if (name === 'payload-cap') raw = Array(1000).fill({ payload: 'x'.repeat(17000) });
    if (name === 'work-cap')
      raw = Array(80).fill({ payload: Object.fromEntries(Array.from({ length: 1500 }, (_, i) => [`k${i}`, false])) });
    if (name === 'row-slots-cap')
      raw = [{ payload: Object.fromEntries(Array.from({ length: 19999 }, (_, i) => [`k${i}`, false])) }];
    if (name === 'depth-cap') {
      let value = {};
      for (let i = 0; i < 102; i++) value = { child: value };
      raw = [{ payload: value }];
    }
    let normalizations = 0;
    if (name === 'hydrated') {
      const doc = Source.hydrate({ ordinal: 0, field0: 'native', payload: Buffer.from([1, 2]) });
      const originalToObject = doc.toObject;
      doc.toObject = function (...args) {
        normalizations++;
        assert.equal(debug.currentOutputWorkLedger(), undefined, 'Opaque hydration runs outside router ledger');
        return Reflect.apply(originalToObject, this, args);
      };
      raw = [doc];
    }
    observation = {
      counts: {},
      stages: [],
      owners: new Set(),
      policies: [],
      catalogs: [],
      businessChecks: 0,
      ledgerObservations: [],
    };
    const oldEvent = globalThis.__oarBatchEvent;
    globalThis.__oarBatchEvent = (kind, args) => {
      oldEvent(kind, args);
      if (kind === 'stageRecord') observation.owners.add(args[1].publication);
    };
    let settled = false;
    const pending = fetch(`http://127.0.0.1:${server.address().port}/probe/_run`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', connection: 'close' },
      body: '{}',
    }).then(async (response) => {
      const body = await response.json();
      settled = true;
      return { status: response.status, body };
    });
    if (name === 'poison') {
      await entered.promise;
      await new Promise((done) => setImmediate(done));
      assert.equal(settled, false, 'Already admitted callback must drain');
      release.resolve();
    }
    const result = await pending;
    globalThis.__oarBatchEvent = oldEvent;
    const failure = [
      'bad-policy',
      'bad-scope',
      'row-cap',
      'payload-cap',
      'work-cap',
      'row-slots-cap',
      'depth-cap',
      'poison',
    ].includes(name);
    assert.equal(result.status, failure ? 400 : 200, JSON.stringify(result));
    if (!failure && ['many', 'independent', 'core', 'freshness'].includes(name))
      assert.deepEqual(result.body.output, repeated ? Array(rows).fill(batchRows(1)[0]) : batchRows(rows));
    if (name === 'scope') assert.deepEqual(result.body.output, [{ field0: 'scope' }]);
    if (name === 'hydrated') assert.ok(normalizations >= 1, 'Actual hydrated normalizer observed');
    if (['many', 'independent', 'core'].includes(name)) {
      const captures = name === 'independent' ? rows : 1;
      assert.equal(observation.counts.captureOutputHelperConfiguration, captures);
      assert.equal(observation.counts.captureAuthorizationFieldCatalog, captures);
      assert.equal(observation.stages.length, rows);
      assert.equal(new Set(observation.stages.map((s) => s.source)).size, rows);
      assert.equal(new Set(observation.stages.map((s) => s.memo)).size, rows);
      assert.ok(observation.stages.every((s, i) => s.source !== raw[i]));
      assert.equal(observation.businessChecks, 24 * rows);
      assert.equal(callbacks, control ? 24 * rows : 0);
      assert.equal(observation.counts.resolveDocumentStage ?? 0, 0);
    }
    assertCleared(name !== 'independent');
    if (name === 'poison') {
      assert.equal(callbacks, 2, 'No new fields/rows after caught poison');
      assert.throws(() => debug.visitTrustedOutput(observation.lastBudget, 0), 'Closed poisoned work cannot revive');
    }
    assert.equal(reads, 0);
    assert.equal(hooks, 0);
    assert.equal(virtuals, 0);
    records.push({
      name,
      rows,
      actualInputPositions: raw.length,
      control,
      repeatedReference: repeated,
      status: result.status,
      counts: observation.counts,
      businessChecks: observation.businessChecks,
      callbacks,
      stages: observation.stages.length,
      distinctSources: new Set(observation.stages.map((s) => s.source)).size,
      distinctMemos: new Set(observation.stages.map((s) => s.memo)).size,
      actuallyClearedStages: observation.stages.length,
      clearedPolicies: observation.policies.length,
      clearedCatalogs: observation.catalogs.length,
      clearedOwners: observation.owners.size,
      ledgerObservations: observation.ledgerObservations,
      reads,
      hooks,
      virtuals,
      normalizations,
      response: result.body,
      fingerprint: fingerprint(result.body),
    });
    observation = undefined;
  };
  try {
    server = await new Promise((done) => {
      const s = app.listen(0, '127.0.0.1', () => done(s));
    });
    for (const rows of [1, 10, 100])
      for (const control of [false, true]) for (const name of ['many', 'independent']) await run(name, rows, control);
    await run('many', 100, true, true);
    await run('core', 1, true);
    await run('freshness', 10, true);
    for (const name of [
      'scope',
      'bad-policy',
      'bad-scope',
      'hydrated',
      'row-cap',
      'payload-cap',
      'work-cap',
      'row-slots-cap',
      'depth-cap',
    ])
      await run(name, 1);
    entered = deferred();
    release = deferred();
    await run('poison', 3, true);
    return {
      status: 'ok',
      profile: target.profile,
      originalSha256: target.distSha256,
      instrumentedSha256: createHash('sha256').update(injected.source).digest('hex'),
      label: 'UNTIMED COPIED-ARTIFACT correctness, NOT allocation totals or acceptance',
      seams: injected.seams,
      getterProof,
      records,
      budgetScope:
        '200000 work / 16 MiB ROUTER-controlled only; per-row 20000/depth100 retained. Opaque Mongoose/native internals, dependency allocations, engine enumeration and trusted callbacks excluded.',
      promises:
        'Only actually executed explicit Promise constructors; implicit async/engine allocation totals unavailable',
      bindings: 'Actually executed binding/receiver object-literal seams; not N-times an assumed allocation',
      mapCopies: 'Actual Permission constructor executions, not inferred from helper call count',
    };
  } finally {
    if (server)
      await new Promise((done) => {
        server.close(done);
        server.closeAllConnections();
      });
    await mongoose.disconnect();
    mongoose.deleteModel(/^B1Probe/);
    api.runtime.clearOpenApiRoutes();
    delete globalThis.__oarBatchEvent;
    delete globalThis.__oarBatchBinding;
    delete globalThis.__oarBatchBudget;
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const [targetPath, directory, resultPath] = process.argv.slice(2);
  let result;
  try {
    result = await probeBatch(JSON.parse(await readFile(targetPath, 'utf8')), resolve(directory));
  } catch (error) {
    result = { status: 'failed', error: error.stack ?? String(error) };
    process.exitCode = 1;
  }
  await writeFile(resultPath, JSON.stringify(result, null, 2) + '\n');
}
