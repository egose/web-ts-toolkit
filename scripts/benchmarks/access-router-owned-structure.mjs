/** Separate INSTRUMENTED correctness heap. Never use this entry for timings/retention. */
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { readFile, writeFile, mkdir, symlink } from 'node:fs/promises';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import {
  fingerprint,
  authorizationModeOptions,
  snapshotFlagOptions,
  initialOutputCopyFlagOptions,
  authorizationFastPathFlagOptions,
  documentPermissionFixtureOptions,
} from './access-router-core.mjs';
import { probeDocumentCondition } from './access-router-owned-probes.mjs';

export function instrumentBundle(source, old) {
  const names = old
    ? [
        'copyAuthorizationValue',
        'matchesAuthorizationSnapshot',
        'createDocumentAuthorizationStage',
        'resolveDocumentAuthorization',
        'memoizeDocumentFieldDecision',
        'memoizeTrustedFieldDecision',
        'associateDocumentAuthorization',
        'transferDocumentAuthorization',
        'transferDocumentAuthorizationGraph',
      ]
    : [
        'copyAuthorizationValue',
        'normalizeDocumentGrants',
        'createDocumentStage',
        'resolveDocumentStage',
        'memoizeStageFieldDecision',
        'closeDocumentStage',
        'copyDocumentView',
        'captureOutputHelperConfiguration',
        'captureAuthorizationFieldCatalog',
        'selectCatalogOutputShape',
        'prepareExistingOutputShape',
        'planAuthorizedModelProjection',
        'planCatalogProjection',
        'compactPersistedProjection',
        'captureReferenceOrigins',
        'resolveEmptyOutputHelperStage',
        'evaluateAuthorizedOutputField',
        'beginDocumentStageOutput',
      ];
  for (const name of names) {
    const expression = new RegExp(`(^function ${name}\\([^\\n]*\\) \\{)`, 'gm');
    const matches = [...source.matchAll(expression)];
    assert.equal(matches.length, 1, `Instrumentation must identify exactly one real ${name}`);
    source = source.replace(expression, `$1\n  globalThis.__oarStructureObserve('${name}', arguments);`);
  }
  if (!old)
    for (const name of [
      'transferDocumentAuthorizationGraph',
      'associateDocumentAuthorization',
      'matchesAuthorizationSnapshot',
    ])
      assert.ok(!source.includes(`function ${name}(`), `Retired graph-authority machinery remains: ${name}`);
  if (!old) {
    const clear = /([\w]+)\.decisions\.clear\(\);/g;
    assert.equal([...source.matchAll(clear)].length, 1, 'Exactly one actual stage-clear seam required');
    source = source.replace(clear, '$&\n    globalThis.__oarStructureCleared($1);');
    const promise = /record\d*\.result = new Promise/g;
    assert.equal([...source.matchAll(promise)].length, 1, 'Exactly one real resolver Promise seam required');
    source = source.replace(promise, "globalThis.__oarStructureObserve('resolverPromise', []);\n  $&");
    // Instrumented-copy diagnostics only: never modify the artifact or its exports.
    source += '\nexport { filterModelOutputForHelper as __oarHelper, permission_default as __oarPermission };\n';
  }
  return { source, names };
}

export async function probeStructure(target, directory) {
  const old = target.profile.startsWith('current-');
  await mkdir(directory); // fresh exclusive location, original artifact untouched
  const original = await readFile(target.entry, 'utf8'),
    injected = instrumentBundle(original, old);
  const entry = resolve(directory, 'instrumented.mjs');
  await symlink(resolve(target.root, 'packages/access-router/node_modules'), resolve(directory, 'node_modules'), 'dir');
  await writeFile(entry, injected.source);
  const counts = {},
    sourceCopies = {},
    grantCopies = {},
    stageIds = new Set(),
    closed = new Set();
  const rawFacts = new WeakSet();
  let clearedRecords = 0;
  globalThis.__oarStructureCleared = (record) => {
    assert.equal(record.state, 'closed');
    assert.equal(record.decisions.size, 0);
    for (const key of ['source', 'grants', 'access', 'view', 'call', 'binding', 'publication', 'owning', 'result'])
      assert.equal(record[key], undefined, `Closed stage retained ${key}`);
    clearedRecords++;
  };
  globalThis.__oarStructureObserve = (name, args) => {
    counts[name] = (counts[name] ?? 0) + 1;
    const value = args[0];
    if (value && typeof value === 'object') {
      if (Object.hasOwn(value, 'grantMarker')) grantCopies[name] = (grantCopies[name] ?? 0) + 1;
      if (Object.hasOwn(value, 'ordinal') && Object.hasOwn(value, 'field0'))
        sourceCopies[name] = (sourceCopies[name] ?? 0) + 1;
      if (name === 'normalizeDocumentGrants' && rawFacts.has(value))
        counts.rawFactNormalizations = (counts.rawFactNormalizations ?? 0) + 1;
      if (name === 'createDocumentStage') {
        /* returned stage tracked at first resolve */
      }
      if (name === 'resolveDocumentStage' || name === 'resolveEmptyOutputHelperStage') stageIds.add(value);
      if (name === 'closeDocumentStage') closed.add(value);
    }
  };
  const require = createRequire(resolve(target.root, 'packages/access-router/package.json'));
  const mongoose = require('mongoose'),
    express = require('express');
  const library = await import(pathToFileURL(entry));
  const { createAccessRuntime } = library;
  const api = createAccessRuntime();
  const flags = old
    ? {
        ...snapshotFlagOptions(target.snapshotSkips, target.supportedSnapshotFlags),
        ...initialOutputCopyFlagOptions(target.initialOutputCopySkips, target.supportedInitialOutputCopyFlags),
        ...authorizationFastPathFlagOptions(target.authorizationFastPaths, target.supportedAuthorizationFastPathFlags),
      }
    : authorizationModeOptions(target);
  let server;
  const measurements = [];
  try {
    for (const fields of [4, 24, 48]) {
      const names = Array.from({ length: fields }, (_, i) => `field${i}`);
      const Source = mongoose.model(
        `OwnedStructure${fields}`,
        new mongoose.Schema(
          {
            ordinal: Number,
            ownerFlag: Boolean,
            ...Object.fromEntries(names.map((n) => [n, String])),
            children: [new mongoose.Schema({ label: String, hidden: String }, { _id: false })],
          },
          { versionKey: false },
        ),
      );
      let adapterReads = 0,
        hooks = 0,
        callbacks = 0;
      const identities = new Set();
      const docs = Array.from({ length: 6 }, (_, i) => ({
        _id: new mongoose.Types.ObjectId((i + 1).toString(16).padStart(24, '0')),
        ordinal: i,
        ownerFlag: i % 2 === 0,
        ...Object.fromEntries(names.map((n) => [n, `${n}:${i}`])),
        children: [{ label: 'child', hidden: 'never' }],
      }));
      Source.Query.prototype.exec = async function () {
        adapterReads++;
        return docs;
      };
      const hook = (doc) => {
        hooks++;
        const facts = { grantMarker: true, owner: doc.ownerFlag };
        rawFacts.add(facts);
        return facts;
      };
      const router = api.createRouter(Source, {
        basePath: `/structure${fields}`,
        operationAccess: true,
        stripPermissionsField: true,
        hydration: { publicList: 'lean' },
        ...flags,
        permissionSchema: {
          ordinal: true,
          ...Object.fromEntries(
            names.map((n) => [
              n,
              (_p, g) => {
                callbacks++;
                identities.add(g);
                return g.owner === true;
              },
            ]),
          ),
          children: { list: true, read: true, sub: { label: true, hidden: false } },
        },
        ...(await documentPermissionFixtureOptions(target, ['ownerFlag'], { list: hook })),
        virtuals: { children: { sub: {} } },
        defaults: {
          publicListOptions: {
            skim: false,
            includePermissions: false,
            includeFieldPermissions: false,
            includeCount: false,
          },
        },
      });
      const app = express().use(express.json()).use(router.routes);
      server = await new Promise((done) => {
        const s = app.listen(0, '127.0.0.1', () => done(s));
      });
      for (const key of Object.keys(counts)) delete counts[key];
      for (const key of Object.keys(sourceCopies)) delete sourceCopies[key];
      for (const key of Object.keys(grantCopies)) delete grantCopies[key];
      stageIds.clear();
      closed.clear();
      clearedRecords = 0;
      const response = await fetch(`http://127.0.0.1:${server.address().port}/structure${fields}/__query`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', connection: 'close' },
        body: JSON.stringify({ select: ['ordinal', ...names, 'children', '-_id'], limit: 6 }),
      });
      const body = await response.json();
      assert.equal(response.status, 200, JSON.stringify(body));
      const expected = docs.map((d) => ({
        ordinal: d.ordinal,
        ...(d.ownerFlag ? Object.fromEntries(names.map((n) => [n, d[n]])) : {}),
        children: [{ label: 'child' }],
      }));
      assert.deepEqual(body.data, expected);
      assert.equal(adapterReads, 1);
      assert.equal(hooks, 6);
      assert.equal(callbacks, 6 * fields);
      if (!old) {
        assert.equal(counts.rawFactNormalizations, 6);
        assert.equal(identities.size, 6);
        assert.equal(grantCopies.copyAuthorizationValue ?? 0, 0);
        for (const stage of stageIds) assert.ok(closed.has(stage), 'Resolved stage must be closed before publication');
        assert.ok(clearedRecords >= stageIds.size, 'Stage sources/facts/promises/memo must be cleared');
      }
      measurements.push({
        fields,
        rows: 6,
        embeddedChildrenPerRow: 1,
        adapterReads,
        mongoReads: 0,
        hooks,
        callbacks,
        factIdentities: identities.size,
        counts: { ...counts },
        sourceCopies: { ...sourceCopies },
        grantCopies: { ...grantCopies },
        resolvedStages: stageIds.size,
        closedStages: closed.size,
        clearedRecords,
        outputFingerprint: fingerprint(body.data),
      });
      await new Promise((done) => {
        server.close(done);
        server.closeAllConnections();
      });
      server = undefined;
    }
    if (!old)
      assert.ok(
        measurements.every(
          (m) =>
            (m.sourceCopies.copyAuthorizationValue ?? 0) <= (measurements[0].sourceCopies.copyAuthorizationValue ?? 0),
        ),
        'No field-count-times whole-source copies',
      );
    if (!old)
      assert.ok(
        measurements.every(
          (m) => (m.sourceCopies.copyDocumentView ?? 0) === (measurements[0].sourceCopies.copyDocumentView ?? 0),
        ),
        'No per-field whole-document callback-view copies',
      );
    const helpers = [];
    let conditionProof = null;
    if (!old) {
      const Source = mongoose.model(
        'OwnedStructureHelpers',
        new mongoose.Schema({
          _id: String,
          ...Object.fromEntries(Array.from({ length: 24 }, (_, i) => [`field${i}`, String])),
        }),
      );
      api.runtime.registerModelInstance(Source.modelName, Source);
      api.setModelOptions(Source.modelName, {
        ...flags,
        stripPermissionsField: true,
        permissionSchema: Object.fromEntries(Array.from({ length: 24 }, (_, i) => [`field${i}`, 'reader'])),
      });
      const permissions = new library.__oarPermission({ reader: true }),
        request = {};
      for (const width of [1, 10, 100]) {
        for (const key of Object.keys(counts)) delete counts[key];
        clearedRecords = 0;
        stageIds.clear();
        closed.clear();
        const raw = {
          _id: 'same',
          ...Object.fromEntries(Array.from({ length: 24 }, (_, i) => [`field${i}`, `value:${i}`])),
        };
        for (let n = 0; n < width; n++) {
          const result = await library.__oarHelper({
            request,
            runtime: api.runtime,
            modelName: Source.modelName,
            access: 'list',
            permissions,
            doc: raw,
            options: {},
          });
          assert.deepEqual(result.output, raw);
          assert.notEqual(result.output, raw);
          assert.deepEqual(result.fields, [...Array.from({ length: 24 }, (_, i) => `field${i}`), '_id']);
        }
        for (const name of [
          'captureOutputHelperConfiguration',
          'captureAuthorizationFieldCatalog',
          'createDocumentStage',
          'resolveEmptyOutputHelperStage',
          'selectCatalogOutputShape',
          'prepareExistingOutputShape',
          'copyDocumentView',
        ])
          assert.equal(counts[name], width, `Actual fresh helper work: ${name}`);
        for (const name of [
          'planAuthorizedModelProjection',
          'planCatalogProjection',
          'compactPersistedProjection',
          'captureReferenceOrigins',
          'resolveDocumentStage',
          'resolverPromise',
        ])
          assert.equal(counts[name] ?? 0, 0, `Unexpected helper work: ${name}`);
        assert.equal(counts.evaluateAuthorizedOutputField, 24 * width);
        assert.equal(counts.memoizeStageFieldDecision, 24 * width);
        assert.equal(clearedRecords, width);
        assert.equal(closed.size, width);
        helpers.push({ helpers: width, counts: { ...counts }, clearedRecords, outputFingerprint: fingerprint(raw) });
      }
      conditionProof = await probeDocumentCondition(target, {
        library,
        observe: () => ({ clearedRecords, outputBegins: counts.beginDocumentStageOutput ?? 0 }),
      });
      for (const proof of conditionProof.observations) {
        assert.equal(proof.stagesAfter.clearedRecords - proof.stagesBefore.clearedRecords, 1);
        assert.equal(
          proof.stagesAfter.outputBegins,
          proof.stagesBefore.outputBegins,
          'Guard must never begin DTO construction',
        );
      }
    }
    return {
      status: 'ok',
      profile: target.profile,
      label: 'INSTRUMENTED correctness ONLY; no timing/allocation claims',
      originalFingerprint: fingerprint(original),
      instrumentedFingerprint: fingerprint(injected.source),
      instrumentedFunctions: injected.names,
      measurements,
      helpers,
      conditionProof,
    };
  } finally {
    if (server)
      await new Promise((done) => {
        server.close(done);
        server.closeAllConnections();
      });
    await mongoose.disconnect();
    mongoose.deleteModel(/^OwnedStructure/);
    api.runtime.clearOpenApiRoutes();
    delete globalThis.__oarStructureObserve;
    delete globalThis.__oarStructureCleared;
  }
}
if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const [targetPath, directory, resultPath] = process.argv.slice(2);
  let result;
  try {
    result = await probeStructure(JSON.parse(await readFile(targetPath, 'utf8')), resolve(directory));
  } catch (error) {
    result = { status: 'failed', error: error.stack ?? String(error) };
    process.exitCode = 1;
  }
  await writeFile(resultPath, JSON.stringify(result, null, 2) + '\n');
}
