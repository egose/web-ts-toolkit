/** Runs against actual installed tarballs in both Node module systems. */
import assert from 'node:assert/strict';
import { once } from 'node:events';
import express from 'express';
import mongoose from 'mongoose';
import { createAccessRuntime, type DataFieldOptions } from '@web-ts-toolkit/access-router';
import type { DataRequest, ModelRequest } from '@web-ts-toolkit/access-router/advanced';

async function verifyInstalledHelpers() {
  const api = createAccessRuntime();
  api.setGlobalOptions({ globalPermissions: () => ({ reader: true, admin: false }) });
  const Model = mongoose.model(
    'PackedFieldHelpers',
    new mongoose.Schema({ name: String, secret: String, ownerId: String, owned: String }),
  );
  let docHooks = 0;
  const router = api.createRouter(Model, {
    basePath: '/model',
    operationAccess: true,
    modelPermissionPrefix: 'doc:',
    permissionSchema: { name: true, secret: false, owned: 'doc:owner' },
    alwaysSelectFields: { read: ['ownerId'] },
    docPermissions: {
      read(doc) {
        docHooks++;
        return { owner: doc !== null && typeof doc === 'object' && 'ownerId' in doc && doc.ownerId === 'actor' };
      },
    },
    stripPermissionsField: true,
  });
  type DataRow = { name: string; secret: string; contacts?: { email: string; secret: string }[] };
  const dataRouter = api.createDataRouter<DataRow>('PackedDataHelpers', {
    basePath: '/data',
    operationAccess: true,
    data: [{ name: 'data', secret: 'denied' }], // pragma: allowlist secret
    permissionSchema: { name: true, secret: false, contacts: { sub: { email: true, secret: false } } },
  });
  router.router.post('/_check', async (request, res) => {
    const req = request as ModelRequest; // installed by this model router's middleware
    const service = router.getService(req);
    const raw = { _id: 'id', name: 'model', secret: 'denied', ownerId: 'actor', owned: 'visible' }; // pragma: allowlist secret
    for (const target of [service, router.getPublicService(req), req.macl]) {
      const prefix = target === req.macl ? ['PackedFieldHelpers'] : [];
      for (const method of [
        'genSelect',
        'genQuerySelect',
        'genAllowedFields',
        'pickAllowedFields',
        'trimOutputFields',
        'genPopulate',
      ] as const) {
        const initial =
          method === 'genPopulate'
            ? ['read', []]
            : ['genSelect', 'genQuerySelect'].includes(method)
              ? ['read', ['name']]
              : [raw, 'read'];
        for (const suffix of [[true], [false], [[]], [undefined, []], [undefined, undefined], [{}, []]]) {
          await assert.rejects(
            () => Reflect.apply(target[method], target, [...prefix, ...initial, ...suffix]),
            (error: unknown) => {
              assert.match((error as Error).message, /have been removed/);
              assert.equal((error as { result: { code: string } }).result.code, 'bad_request');
              return true;
            },
          );
        }
      }
    }
    assert.equal(docHooks, 0);
    assert.deepEqual(await service.genQuerySelect('read', ['name', 'secret']), ['name', 'ownerId', '_id']);
    assert.deepEqual(await service.pickAllowedFields(raw, 'read'), { _id: 'id', name: 'model', owned: 'visible' });
    assert.equal(docHooks, 1);
    const options = { authorization: { outputFields: { mode: 'grant', paths: ['secret'] } } } as const;
    assert.deepEqual(await service.trimOutputFields(raw, 'read', options), {
      _id: 'id',
      name: 'model',
      owned: 'visible',
      secret: 'denied', // pragma: allowlist secret
    });
    assert.deepEqual(await service.genAllowedFields(null, 'read'), []);
    assert.equal('buildVirtualPlan' in service, false);
    assert.equal('buildSubVirtualPlan' in service, false);
    res.json({ ok: true });
  });
  dataRouter.router.post('/_check', async (request, res) => {
    const req = request as DataRequest; // installed by this data router's middleware
    const service = dataRouter.getService(req);
    for (const method of [
      'genSelect',
      'genQuerySelect',
      'genAllowedFields',
      'pickAllowedFields',
      'trimOutputFields',
    ] as const) {
      const initial = ['genSelect', 'genQuerySelect'].includes(method)
        ? ['read', ['name']]
        : [{ name: 'data', secret: 'denied' }, 'read']; // pragma: allowlist secret
      for (const suffix of [[true], [false], [[]], [undefined, []], [undefined, undefined]]) {
        await assert.rejects(
          () => Reflect.apply(service[method], service, [...initial, ...suffix]),
          /DataFieldOptions/,
        );
      }
    }
    for (const method of ['genSelect', 'genAllowedFields', 'pickAllowedFields'] as const) {
      const initial = method === 'genSelect' ? ['read', ['name']] : [{ name: 'data' }, 'read'];
      await assert.rejects(
        () => Reflect.apply(req.dacl[method], req.dacl, ['PackedDataHelpers', ...initial, undefined, []]),
        /DataFieldOptions/,
      );
    }
    const options = { scopePath: ['contacts'] } as const satisfies DataFieldOptions;
    assert.deepEqual(await service.genAllowedFields(null, 'read', options), ['email']);
    // pragma: allowlist nextline secret
    assert.deepEqual(await service.pickAllowedFields({ email: 'a', secret: 'denied' }, 'read', options), {
      email: 'a',
    });
    assert.deepEqual(await service.genQuerySelect('read'), []);
    const result = await service.findOne({}, { select: ['secret'] });
    assert.equal(result.success, true);
    if (result.success) assert.deepEqual(result.data, { name: 'data' });
    res.json({ ok: true });
  });
  const app = express();
  app.use(router.routes);
  app.use(dataRouter.routes);
  const server = app.listen(0, '127.0.0.1');
  try {
    await once(server, 'listening');
    const address = server.address();
    assert.ok(address && typeof address !== 'string');
    for (const path of ['/model/_check', '/data/_check']) {
      const response: Response = await fetch(`http://127.0.0.1:${address.port}${path}`, { method: 'POST' });
      const body: string = await response.text();
      assert.equal(response.status, 200, body);
      assert.deepEqual(JSON.parse(body), { ok: true });
    }
  } finally {
    await new Promise<void>((resolve, reject) => server.close((error) => (error ? reject(error) : resolve())));
    api.runtime.clearOpenApiRoutes();
    mongoose.deleteModel('PackedFieldHelpers');
  }
}

verifyInstalledHelpers().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
