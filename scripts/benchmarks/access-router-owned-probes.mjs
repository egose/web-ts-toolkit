/** Untimed correctness driver. Public packed entry only; adapter reads are NOT Mongo reads. */
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { resolve } from 'node:path';
import { readFile, writeFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
import {
  authorizationModeOptions,
  snapshotFlagOptions,
  initialOutputCopyFlagOptions,
  authorizationFastPathFlagOptions,
  verifySnapshotDeclarationManifest,
  fingerprint,
} from './access-router-core.mjs';
import { verifySnapshotFlagOptions } from './access-router-worker.mjs';

export async function probeOwned(target) {
  const manifest = await verifySnapshotDeclarationManifest(target);
  const old = target.profile.startsWith('current-');
  const flags = old
    ? {
        ...snapshotFlagOptions(target.snapshotSkips, manifest.supportedSnapshotFlags),
        ...initialOutputCopyFlagOptions(target.initialOutputCopySkips, manifest.supportedInitialOutputCopyFlags),
        ...authorizationFastPathFlagOptions(
          target.authorizationFastPaths,
          manifest.supportedAuthorizationFastPathFlags,
        ),
      }
    : authorizationModeOptions(target);
  const require = createRequire(resolve(target.root, 'packages/access-router/package.json'));
  const mongoose = require('mongoose'),
    express = require('express');
  const { createAccessRuntime } = await import(pathToFileURL(target.entry));
  const api = createAccessRuntime();
  const B = mongoose.mongo.BSON,
    id = new B.ObjectId('000000000000000000000001'),
    ref = new B.ObjectId('000000000000000000000002');
  let server,
    reads = 0,
    hooks = 0,
    targetHooks = 0,
    getterCalls = 0,
    terminal = null;
  let actorReader = true;
  let mutate = false,
    owner = true,
    retry = false,
    retryMiss = true,
    captureFlip = false,
    currentValue;
  const observations = [];
  const quiet = {
    includePermissions: false,
    includeFieldPermissions: false,
    includeCount: false,
    tryList: false,
    skim: false,
  };
  const native = () => ({
    date: new Date(0),
    buffer: Buffer.from([1, 2, 3]),
    id: new B.ObjectId(String(ref)),
    code: new B.Code('return 1', { selected: true }),
    ref: new B.DBRef('collection', new B.ObjectId(String(ref)), 'db', { selected: true }),
    nested: [new Map([['safe', new Date(1)]])],
  });
  const Source = mongoose.model(
    'OwnedProbeSource',
    new mongoose.Schema(
      {
        field0: String,
        emptyAllows: String,
        ownerFlag: Boolean,
        hidden: String,
        visible: Boolean,
        value: mongoose.Schema.Types.Mixed,
        children: [new mongoose.Schema({ label: String, hidden: String }, { _id: false })],
        ref: { type: mongoose.Schema.Types.ObjectId, ref: 'OwnedProbeTarget' },
      },
      { versionKey: false },
    ),
  );
  const Target = mongoose.model(
    'OwnedProbeTarget',
    new mongoose.Schema({ name: String, secret: String }, { versionKey: false }),
  );
  const sourceObject = () => ({
    _id: id,
    field0: 'original',
    hidden: 'never',
    ownerFlag: owner,
    visible: true,
    value: currentValue ?? native(),
    children: [{ label: 'child-original', hidden: 'never' }],
    ref,
  });
  let lastSource, lastTarget;
  Source.Query.prototype.exec = async function () {
    reads++;
    if (terminal) {
      // Real public API errors from captured server policy, NOT a fake adapter error code.
      assert.fail('Terminal admission must not query');
    }
    if (retry && retryMiss) {
      retryMiss = false; // explicit adapter first-miss/second-hit, not a measured Mongo query
      if (captureFlip && !old) api.setModelOption(Source.modelName, 'readAuthorizationMode', 'trusted');
      return null;
    }
    lastSource = sourceObject();
    const populate = Object.values(this.mongooseOptions().populate ?? {});
    if (populate.length)
      await Source.populate(
        lastSource,
        populate.map((entry) => ({
          ...entry,
          options: { ...entry.options, lean: true },
        })),
      );
    return this.op === 'find' ? [lastSource] : lastSource;
  };
  Target.Query.prototype.exec = async function () {
    reads++;
    lastTarget = { _id: ref, name: 'target-original', secret: 'never' };
    return this.op === 'find' ? [lastTarget] : lastTarget;
  };
  api.setGlobalOptions({ globalPermissions: () => ({ reader: actorReader }), logger: { warn() {} } });
  const targetRouter = api.createRouter(Target, {
    basePath: '/targets',
    operationAccess: true,
    stripPermissionsField: true,
    hydration: { publicRead: 'lean', publicList: 'lean', find: 'lean', findOne: 'lean' },
    permissionSchema: { name: true, secret: false },
    ...flags,
    docPermissions: {
      read: (doc) => {
        targetHooks++;
        if (mutate) doc.name = 'target-mutated';
        return {};
      },
      list: (doc) => {
        targetHooks++;
        if (mutate) doc.name = 'target-mutated';
        return {};
      },
    },
  });
  const hook = function (doc, context) {
    hooks++;
    if (!old) {
      assert.ok(Object.isFrozen(context));
      assert.equal('currentDocument' in context, false);
    }
    const result = { owner: doc.ownerFlag === true };
    if (mutate) {
      doc.field0 = 'mutated';
      doc.children[0].label = 'child-mutated';
    }
    return result;
  };
  const router = api.createRouter(Source, {
    basePath: '/bench',
    operationAccess: true,
    stripPermissionsField: true,
    alwaysSelectFields: ['ownerFlag'],
    modelPermissionPrefix: 'doc:',
    hydration: { publicRead: 'lean', publicList: 'lean', find: 'lean', findOne: 'lean' },
    permissionSchema: {
      field0: { read: (p, g) => p.has('reader') && g.owner === true, list: true },
      hidden: false,
      value: true,
      ref: { read: true, list: true },
      label: true,
      children: { read: true, list: true, sub: { label: true, hidden: false } },
      emptyAllows: { read: (_p, g) => g.owner !== true },
    },
    docPermissions: { read: hook, list: hook },
    virtuals: {
      children: { sub: {} },
      label: {
        dependsOn: [],
        read: () => {
          getterCalls++;
          return 'label';
        },
      },
    },
    ...flags,
  });
  const verification = {
    kind: 'server-option-getters',
    models: {
      source: verifySnapshotFlagOptions(api, Source.modelName, flags),
      target: verifySnapshotFlagOptions(api, Target.modelName, flags),
    },
  };
  const app = express().use(express.json());
  router.router.post('/_helpers', async (req, res) => {
    const svc = router.getService(req),
      before = { reads, hooks, getterCalls };
    const first = await svc.findById(String(id), { select: ['field0', '-_id'] }, quiet);
    assert.ok(first.success);
    owner = false;
    const fresh = await svc.findById(String(id), { select: ['field0', '-_id'] }, quiet);
    assert.ok(fresh.success);
    assert.deepEqual(fresh.data, {});
    assert.deepEqual(first.data, { field0: 'original' });
    const helperBefore = { reads, hooks, getterCalls };
    if (!old) {
      for (const dto of [
        first.data,
        { ...first.data },
        JSON.parse(JSON.stringify(first.data)),
        { ...first.data, _permissions: { owner: true } },
      ])
        assert.deepEqual(await svc.pickAllowedFields(dto, 'read', {}), {});
      assert.ok(!('documentAuthorization' in first.context));
      await assert.rejects(() => svc.pickAllowedFields(first.data, 'read', { documentAuthorization: {} }));
      assert.deepEqual(
        await svc.pickAllowedFields(
          { emptyAllows: 'EMPTY is not current-document authority', _permissions: { owner: true } },
          'read',
          {},
        ),
        { emptyAllows: 'EMPTY is not current-document authority' },
      );
      observations.push({
        kind: 'negative EMPTY predicate',
        helperExtraReads: 0,
        warning: 'EMPTY facts are not current-document authorization',
      });
    }
    let deniedReads = 0;
    const evil = { field0: 'visible' };
    Object.defineProperty(evil, 'hidden', {
      enumerable: true,
      get() {
        deniedReads++;
        return 'never';
      },
    });
    try {
      await svc.pickAllowedFields(evil, 'read', {});
    } catch (error) {
      assert.ok(error.result?.code === 'bad_request', 'Controlled structural rejection only');
    }
    if (!old) assert.equal(deniedReads, 0);
    observations.push({
      kind: 'denied accessor admission',
      observedGetterCalls: deniedReads,
      note: old ? 'historical source normalizer may observe accessors; not a new-contract promise' : 'never observed',
    });
    const hydrated = new Source(sourceObject()),
      prior = hydrated.field0;
    await svc.trimOutputFields(hydrated, 'read', {});
    assert.equal(hydrated.field0, prior);
    assert.equal(reads, helperBefore.reads);
    assert.equal(getterCalls, helperBefore.getterCalls);
    if (!old) assert.equal(hooks, helperBefore.hooks);
    observations.push({
      kind: 'raw helper after document-dependent query',
      extraHooks: hooks - helperBefore.hooks,
      note: old
        ? 'historical standalone helper re-evaluates configured document hook; H1 timings deliberately have no hook'
        : 'EMPTY facts, no document hook',
    });
    assert.deepEqual(
      { reads: helperBefore.reads - before.reads, hooks: helperBefore.hooks - before.hooks },
      { reads: 2, hooks: 2 },
    );
    owner = true;
    res.json({ ok: true });
  });
  app.use(router.routes).use(targetRouter.routes);
  app.use((error, req, res, next) =>
    router.router.responseHandler.handleResponse(() => {
      throw error;
    })(req, res, next),
  );
  try {
    server = await new Promise((done) => {
      const s = app.listen(0, '127.0.0.1', () => done(s));
    });
    const post = async (path, body = {}) => {
      const response = await fetch(`http://127.0.0.1:${server.address().port}${path}`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', connection: 'close' },
        body: JSON.stringify(body),
      });
      return { status: response.status, body: await response.json() };
    };
    const read = (extra = {}) => post(`/bench/__query/${id}`, { select: ['field0', '-_id'], options: quiet, ...extra });
    const successful = await read();
    assert.equal(successful.status, 200);
    assert.deepEqual(successful.body, { field0: 'original' });
    const actorBefore = { reads, hooks };
    actorReader = false;
    const changedActor = await read();
    assert.equal(changedActor.status, 200);
    assert.deepEqual(changedActor.body, {});
    assert.deepEqual(successful.body, { field0: 'original' });
    assert.equal(reads - actorBefore.reads, 1);
    assert.equal(hooks - actorBefore.hooks, 1);
    observations.push({
      kind: 'fresh original request changed global actor',
      adapterReads: 1,
      hooks: 1,
      oldOutputUnchanged: true,
      outputFingerprint: fingerprint(changedActor.body),
    });
    actorReader = true;
    assert.deepEqual(await post('/bench/_helpers'), { status: 200, body: { ok: true } });
    observations.push({
      kind: 'helpers/freshness/metadata/replay/hydrated/denied-getter',
      adapterReads: 2,
      hooks: 2,
      helperExtraReads: 0,
    });
    retry = true;
    captureFlip = true;
    owner = false;
    api.setModelOptions(Source.modelName, {
      baseFilter: { read: () => ({ visible: false }), list: () => ({}) },
      ...(!old ? { readAuthorizationMode: 'isolated', listAuthorizationMode: 'trusted' } : {}),
    });
    const before = { reads, hooks };
    mutate = !old;
    const retried = await read({ options: { ...quiet, tryList: true } });
    assert.equal(retried.status, 200, JSON.stringify(retried));
    assert.deepEqual(retried.body, { field0: 'original' }); // initiating READ isolated, despite LIST trusted + in-flight flip
    assert.equal(reads - before.reads, 2);
    assert.equal(hooks - before.hooks, 1);
    observations.push({
      kind: 'admitted READ retry',
      adapterReads: 2,
      hooks: 1,
      fieldAccess: 'list',
      initiatingMode: old ? 'historical' : 'isolated',
      outputFingerprint: fingerprint(retried.body),
    });
    retry = false;
    mutate = false;
    captureFlip = false;
    owner = true;
    api.setModelOptions(Source.modelName, { baseFilter: { read: {}, list: {} }, ...flags });
    for (const code of [400, 403]) {
      terminal = code;
      api.setModelOptions(Source.modelName, {
        operationAccess: true,
        baseFilter: { read: code === 403 ? () => false : () => ({}), list: () => ({}) },
      });
      const n = reads;
      const result = await read(
        code === 400
          ? { options: { ...quiet, tryList: true }, select: [{ not: 'a select' }] }
          : { options: { ...quiet, tryList: true } },
      );
      assert.equal(result.status, code, JSON.stringify(result));
      assert.equal(reads, n, 'Terminal admission has no retry/query');
      observations.push({ kind: `terminal ${code}`, adapterReads: 0, outputFingerprint: fingerprint(result.body) });
      terminal = null;
    }
    api.setModelOptions(Source.modelName, {
      operationAccess: true,
      baseFilter: { read: () => ({}), list: () => ({}) },
      ...flags,
    });
    if (!old) {
      mutate = true;
      for (const sourceMode of ['isolated', 'trusted'])
        for (const targetMode of ['isolated', 'trusted']) {
          api.setModelOptions(Source.modelName, {
            readAuthorizationMode: sourceMode,
            listAuthorizationMode: sourceMode === 'isolated' ? 'trusted' : 'isolated',
          });
          api.setModelOptions(Target.modelName, {
            readAuthorizationMode: targetMode,
            listAuthorizationMode: targetMode,
          });
          const result = await read({
            select: ['field0', 'ref', 'children', '-_id'],
            populate: [{ path: 'ref', select: 'name -_id' }],
          });
          assert.equal(result.status, 200, JSON.stringify(result));
          assert.equal(result.body.field0, sourceMode === 'trusted' ? 'mutated' : 'original');
          assert.deepEqual(result.body.children, [
            { label: sourceMode === 'trusted' ? 'child-mutated' : 'child-original' },
          ]);
          assert.deepEqual(result.body.ref, { name: targetMode === 'trusted' ? 'target-mutated' : 'target-original' });
          assert.equal(lastSource.field0, sourceMode === 'trusted' ? 'mutated' : 'original');
          const targetRead = await post(`/targets/__query/${ref}`, { select: ['name', '-_id'], options: quiet });
          assert.equal(targetRead.status, 200);
          assert.equal(targetRead.body.name, targetMode === 'trusted' ? 'target-mutated' : 'target-original');
          assert.equal(lastTarget.name, targetMode === 'trusted' ? 'target-mutated' : 'target-original');
          const listed = await post('/bench/__query', {
            select: ['field0', 'children', '-_id'],
            limit: 1,
            options: quiet,
          });
          assert.equal(listed.status, 200, JSON.stringify(listed));
          assert.deepEqual(listed.body.data, [
            {
              field0: sourceMode === 'isolated' ? 'mutated' : 'original',
              children: [{ label: sourceMode === 'isolated' ? 'child-mutated' : 'child-original' }],
            },
          ]);
          observations.push({
            kind: 'source/target actual callback mutation',
            sourceMode,
            targetMode,
            readFingerprint: fingerprint(result.body),
            listFingerprint: fingerprint(listed.body.data),
            embeddedInheritedOwnerMode: true,
            independentReadListModes: true,
          });
        }
      mutate = false;
      api.setModelOptions(Source.modelName, flags);
      api.setModelOptions(Target.modelName, flags);
    }
    const nativeResults = [];
    for (const [value, status] of [
      [native(), 200],
      [new B.Code('return 1', { expanded: Array(20001).fill('x') }), 400],
      [new B.DBRef('c', ref, 'db', { expanded: Array(20001).fill('x') }), 400],
    ]) {
      currentValue = value;
      for (const origin of ['read', 'list']) {
        const beforeReads = reads;
        const result = await post(origin === 'read' ? `/bench/__query/${id}` : '/bench/__query', {
          select: ['value', 'hidden', '-_id'],
          limit: 1,
          options: quiet,
        });
        if (!old || status === 200) assert.equal(result.status, status, JSON.stringify(result).slice(0, 600));
        else assert.ok([200, 400].includes(result.status), 'Preserve historical native admission behavior');
        if (result.status === 200 && status === 200) {
          const row = origin === 'read' ? result.body : result.body.data[0];
          assert.equal(row.value.date, '1970-01-01T00:00:00.000Z');
          assert.equal(row.value.code.scope.selected, true);
          assert.deepEqual(row.value.buffer, { type: 'Buffer', data: [1, 2, 3] }, JSON.stringify(row.value));
          assert.equal(row.value.id, String(ref));
          assert.equal(row.value.ref.selected, true);
          assert.equal(row.hidden, undefined);
        } else if (result.status === 400) assert.equal(result.body.data, undefined, 'No partial native output');
        assert.equal(reads - beforeReads, 1);
        nativeResults.push({
          origin,
          status: result.status,
          expectedNewStatus: status,
          outputFingerprint: fingerprint(result.body),
          note: old ? 'historical admission observation, NOT a current-contract bounds claim' : undefined,
        });
      }
    }
    const token = new B.ObjectId('000000000000000000000003');
    const previousWire = Object.getOwnPropertyDescriptor(B.ObjectId.prototype, 'toBSON');
    const expansion = Object.fromEntries(Array.from({ length: 21000 }, (_, i) => [`denied${i}`, 'never']));
    let wireCalls = 0;
    try {
      Object.defineProperty(B.ObjectId.prototype, 'toBSON', {
        configurable: true,
        value() {
          if (this.toHexString() !== String(token)) return this;
          wireCalls++;
          return expansion;
        },
      });
      currentValue = { wire: token };
      for (const origin of ['read', 'list']) {
        const result = await post(origin === 'read' ? `/bench/__query/${id}` : '/bench/__query', {
          select: ['value', '-_id'],
          limit: 1,
          options: quiet,
        });
        if (!old) {
          assert.equal(result.status, 400, 'Wire replacement must be bounded before publication');
          assert.equal(result.body.data, undefined);
        } else assert.ok([200, 400].includes(result.status));
        nativeResults.push({
          origin,
          status: result.status,
          wireExpansionKeys: 21000,
          wireCalls,
          outputFingerprint: fingerprint(result.body),
        });
      }
      assert.ok(wireCalls > 0, 'The native wire hook must actually execute');
    } finally {
      if (previousWire) Object.defineProperty(B.ObjectId.prototype, 'toBSON', previousWire);
      else Reflect.deleteProperty(B.ObjectId.prototype, 'toBSON');
    }
    return {
      status: 'ok',
      profile: target.profile,
      verification,
      observations,
      nativeResults,
      totals: { adapterReads: reads, hooks, targetHooks, getterCalls },
      mongoReads: 0,
      label: 'UNTIMED correctness, adapter NOT Mongo timing',
    };
  } finally {
    if (server)
      await new Promise((done) => {
        server.close(done);
        server.closeAllConnections();
      });
    await mongoose.disconnect();
    mongoose.deleteModel(/^OwnedProbe/);
    api.runtime.clearOpenApiRoutes();
  }
}
if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const [targetPath, resultPath] = process.argv.slice(2);
  let result;
  try {
    result = await probeOwned(JSON.parse(await readFile(targetPath, 'utf8')));
  } catch (error) {
    result = { status: 'failed', error: error.stack ?? String(error) };
    process.exitCode = 1;
  }
  await writeFile(resultPath, JSON.stringify(result, null, 2) + '\n');
}
