import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { once } from 'node:events';
import type { Server } from 'node:http';
import express from 'express';
import mongoose from 'mongoose';
import { createAccessRuntime, type ModelVirtualDescriptor } from '@web-ts-toolkit/access-router';

interface Target {
  name: string;
  balance: number;
  tenantId: string;
}
interface Source {
  accounts: (mongoose.Types.ObjectId | null)[] | null;
}

async function runInstalledArrayDependencies() {
  const connection = await mongoose
    .createConnection(process.env.MONGODB_URL!, {
      dbName: `private_array_consumer_${randomUUID().replaceAll('-', '')}`,
    })
    .asPromise();
  let server: Server | undefined;
  try {
    const TargetModel = connection.model<Target>(
      'Document',
      new mongoose.Schema<Target>({
        name: String,
        balance: Number,
        tenantId: String,
      }),
    );
    const SourceModel = connection.model<Source>(
      'ArraySource',
      new mongoose.Schema<Source>({
        accounts: [{ type: mongoose.Schema.Types.ObjectId, ref: TargetModel.modelName }],
      }),
    );
    const account = await TargetModel.create({ name: 'Main', balance: 10, tenantId: 'a' });
    const outside = await TargetModel.create({ name: 'Outside', balance: 100, tenantId: 'b' });
    const missing = new mongoose.Types.ObjectId();
    const originals = [account._id, missing, null, account._id, outside._id];
    const source = await SourceModel.create({ accounts: originals });
    for (const hydration of ['lean', 'hydrated'] as const) {
      const api = createAccessRuntime();
      api.setGlobalOptions({ globalPermissions: () => [] });
      const defaultGlobals = api.getGlobalOptions();
      assert.equal(defaultGlobals.requireOperationAccessForPopulateQueries, true);
      assert.equal(defaultGlobals.requireOperationAccessForPopulateDependencies, true);
      // Configuration-only Document: no target router or HTTP mount is required.
      api.registerModelInstance(TargetModel.modelName, TargetModel);
      api.setModelOptions(TargetModel.modelName, {
        operationAccess: { read: true },
        baseFilter: { read: () => ({ tenantId: 'a' }) },
        permissionSchema: { name: true, balance: false },
        stripPermissionsField: true,
      });
      let calls = 0;
      const eligibleCount: ModelVirtualDescriptor<Source, number, { accounts: Target }> = {
        dependsOnPopulate: [{ path: 'accounts', select: { balance: 1, _id: -1 } }],
        get(doc, _permissions, context, populated = {}) {
          calls++;
          assert.equal(Object.hasOwn(context, 'populated'), false);
          assert.equal(JSON.stringify(doc).includes('balance'), false);
          assert.deepEqual(populated.accounts, [{ balance: 10 }, null, null, { balance: 10 }, null]);
          return populated.accounts?.filter((target) => (target?.balance ?? 0) > 0).length;
        },
      };
      const sources = api.createRouter<Source, { eligibleCount: number }>(SourceModel, {
        basePath: '/sources',
        operationAccess: { read: true },
        hydration: { publicRead: hydration },
        permissionSchema: { accounts: true, eligibleCount: true },
        defaults: { publicReadArgs: { populate: [{ path: 'accounts', select: 'name -_id' }] } },
        virtuals: { eligibleCount },
        stripPermissionsField: true,
      });
      const app = express();
      app.use(express.json());
      app.use(sources.routes);
      const root = api.createRouter({ basePath: '/batch', operationAccess: true });
      app.use(root.routes);
      server = app.listen(0, '127.0.0.1');
      await once(server, 'listening');
      const address = server.address();
      assert.ok(address && typeof address !== 'string');
      const url = `http://127.0.0.1:${address.port}/sources/__query/${source._id}`;
      async function read(args: object) {
        const response = await fetch(url, {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify(args),
        });
        assert.equal(response.status, 200);
        return response.json();
      }
      const select = ['accounts', 'eligibleCount', '-_id'];
      // A default is ordinary population; public missing/out-of-scope rows are filtered.
      assert.deepEqual(await read({ select }), {
        accounts: [{ name: 'Main' }, { name: 'Main' }],
        eligibleCount: 2,
      });
      // Suppress the default: original IDs/null/order/duplicates/misses are restored.
      assert.deepEqual(await read({ select, populate: [] }), {
        accounts: originals.map((id) => (id === null ? null : String(id))),
        eligibleCount: 2,
      });
      assert.deepEqual(await read({ select: ['eligibleCount', '-_id'], populate: [] }), { eligibleCount: 2 });
      sources.permissionSchema('accounts', false);
      assert.deepEqual(await read({ select, populate: [] }), { eligibleCount: 2 });
      assert.equal(calls, 4); // getter assertions cannot pass via swallowed fail-closed errors
      api.setModelOption(TargetModel.modelName, 'operationAccess.read', false);
      assert.deepEqual(await read({ select, populate: [] }), {});
      assert.equal(calls, 4);
      // Strict private denial cannot hide selected/permitted original parent IDs.
      sources.permissionSchema('accounts', true);
      const ids = originals.map((id) => (id === null ? null : String(id)));
      assert.deepEqual(await read({ select, populate: [] }), { accounts: ids });
      assert.equal(calls, 4); // strict private admission blocks computation too
      for (const queries of [true, false]) {
        for (const dependencies of [true, false]) {
          api.setGlobalOptions({
            requireOperationAccessForPopulateQueries: queries,
            requireOperationAccessForPopulateDependencies: dependencies,
          });
          const before: number = calls;
          const computed = dependencies ? {} : { eligibleCount: 2 };
          assert.deepEqual(await read({ select }), {
            accounts: queries ? ids : [{ name: 'Main' }, { name: 'Main' }],
            ...computed,
          });
          assert.deepEqual(await read({ select, populate: [] }), { accounts: ids, ...computed });
          assert.deepEqual(await read({ select: ['eligibleCount', '-_id'], populate: [] }), computed);
          sources.permissionSchema('accounts', false);
          assert.deepEqual(await read({ select }), computed); // both false still enforces source denial
          sources.permissionSchema('accounts', true);
          assert.equal(calls, before + (dependencies ? 0 : 4));
        }
      }
      assert.equal(defaultGlobals.requireOperationAccessForPopulateDependencies, true);
      assert.equal(defaultGlobals.requireOperationAccessForPopulateQueries, true);
      assert.equal(createAccessRuntime().getGlobalOption('requireOperationAccessForPopulateDependencies'), true);
      // Public exclusion and identity are unchanged by the positive private fetch union.
      api.setModelOption(TargetModel.modelName, 'permissionSchema', { name: true, balance: true });
      assert.deepEqual(await read({ select }), {
        accounts: [{ name: 'Main' }, { name: 'Main' }],
        eligibleCount: 2,
      });
      assert.deepEqual(await read({ select, populate: [{ path: 'accounts', select: ['name'] }] }), {
        accounts: [
          { _id: String(account._id), name: 'Main' },
          { _id: String(account._id), name: 'Main' },
        ],
        eligibleCount: 2,
      });
      assert.deepEqual(
        await read({ select, populate: [{ path: 'accounts', select: 'name -_id', match: { name: 'missing' } }] }),
        {
          accounts: [],
          eligibleCount: 2, // an admitted public miss never restores IDs
        },
      );
      api.setModelOption(TargetModel.modelName, 'permissionSchema', { name: true, balance: false });
      // Ordinary list access/match can succeed while private inputs retain request READ scope.
      api.setGlobalOption('requireOperationAccessForPopulateQueries', true);
      api.setModelOption(TargetModel.modelName, 'operationAccess.list', true);
      assert.deepEqual(
        await read({
          select,
          populate: [{ path: 'accounts', select: 'name -_id', access: 'list', match: { tenantId: 'b' } }],
        }),
        { accounts: [{ name: 'Outside' }], eligibleCount: 2 },
      );
      const beforeMalformed = calls;
      // Malformed dynamic JS is conservative: the string does not enable bypass.
      Reflect.apply(api.setGlobalOption, undefined, ['requireOperationAccessForPopulateDependencies', 'false']);
      assert.equal(api.getGlobalOption('requireOperationAccessForPopulateDependencies'), true);
      assert.deepEqual(await read({ select, populate: [] }), { accounts: ids });
      api.setGlobalOption('requireOperationAccessForPopulateDependencies', true);
      assert.deepEqual(await read({ select, populate: [] }), { accounts: ids });
      assert.equal(calls, beforeMalformed);
      // Both false still cannot authorize standalone/root operations.
      api.setGlobalOptions({
        requireOperationAccessForPopulateQueries: false,
        requireOperationAccessForPopulateDependencies: false,
      });
      api.setModelOption(TargetModel.modelName, 'operationAccess.list', false);
      const batch = await fetch(`http://127.0.0.1:${address.port}/batch`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify([
          { target: 'model', name: TargetModel.modelName, op: 'read', id: String(account._id) },
          { target: 'model', name: TargetModel.modelName, op: 'list' },
        ]),
      });
      assert.equal(batch.status, 200);
      for (const entry of await batch.json()) {
        assert.equal(entry.statusCode, 401);
        assert.equal(entry.result.code, 'unauthorized');
      }
      // If target HTTP routes are subsequently constructed, both-false still grants none.
      const documents = api.createRouter(TargetModel, { basePath: '/documents' });
      app.use(documents.routes);
      for (const route of ['/documents/__query', `/documents/__query/${account._id}`]) {
        const response: Response = await fetch(`http://127.0.0.1:${address.port}${route}`, {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: '{}',
        });
        assert.equal(response.status, 401);
      }
      // Both dependency modes preserve authorized public unions and exact arrays in
      // BOTH hydration modes, including out-of-scope/missing IDs, nulls and duplicates.
      api.setModelOption(TargetModel.modelName, 'operationAccess.read', true);
      for (const strict of [true, false]) {
        api.setGlobalOption('requireOperationAccessForPopulateDependencies', strict);
        const before: number = calls;
        assert.deepEqual(await read({ select }), {
          accounts: [{ name: 'Main' }, { name: 'Main' }],
          eligibleCount: 2,
        });
        assert.deepEqual(await read({ select, populate: [] }), {
          accounts: originals.map((id) => (id === null ? null : String(id))),
          eligibleCount: 2,
        });
        assert.deepEqual(await read({ select: ['eligibleCount', '-_id'], populate: [] }), { eligibleCount: 2 });
        sources.permissionSchema('accounts', false);
        assert.deepEqual(await read({ select, populate: [] }), { eligibleCount: 2 });
        sources.permissionSchema('accounts', true);
        assert.equal(calls, before + 4);
      }
      assert.deepEqual((await SourceModel.findById(source._id).lean())?.accounts, originals);
      await new Promise<void>((resolve, reject) => server!.close((error) => (error ? reject(error) : resolve())));
      server = undefined;
    }
  } finally {
    if (server)
      await new Promise<void>((resolve, reject) => server!.close((error) => (error ? reject(error) : resolve())));
    await connection.dropDatabase();
    await connection.close();
  }
}

runInstalledArrayDependencies().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
