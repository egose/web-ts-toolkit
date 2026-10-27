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
      'ArrayTarget',
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
      assert.equal(defaultGlobals.requireReadOperationAccessForPopulateDependencies, true);
      const targets = api.createRouter(TargetModel, {
        operationAccess: { read: true },
        baseFilter: { read: () => ({ tenantId: 'a' }) },
        permissionSchema: { name: true, balance: false },
        stripPermissionsField: true,
      });
      let calls = 0;
      const eligibleCount: ModelVirtualDescriptor<Source, number, { accounts: Target }> = {
        dependsOnPopulate: [{ path: 'accounts', select: { balance: 1, _id: -1 } }],
        get(_doc, _permissions, context, populated = {}) {
          calls++;
          assert.equal(Object.hasOwn(context, 'populated'), false);
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
      targets.setOption('operationAccess.read', false);
      assert.deepEqual(await read({ select, populate: [] }), {});
      assert.equal(calls, 4);
      // PPR-03: exercise the target denial with a selected AND permitted source ref.
      sources.permissionSchema('accounts', true);
      assert.deepEqual(await read({ select, populate: [] }), {});
      assert.equal(calls, 4); // strict private admission blocks computation too
      api.setGlobalOptions({ requireReadOperationAccessForPopulateDependencies: false });
      assert.equal(api.getGlobalOption('requireReadOperationAccessForPopulateDependencies'), false);
      assert.equal(defaultGlobals.requireReadOperationAccessForPopulateDependencies, true);
      assert.equal(createAccessRuntime().getGlobalOption('requireReadOperationAccessForPopulateDependencies'), true);
      assert.deepEqual(await read({ select, populate: [] }), { eligibleCount: 2 });
      assert.deepEqual(await read({ select }), { eligibleCount: 2 }); // denied default populate cannot retain IDs
      // Ordinary list access/match can succeed while private inputs retain request READ scope.
      targets.setOption('operationAccess.list', true);
      assert.deepEqual(
        await read({
          select,
          populate: [{ path: 'accounts', select: 'name -_id', access: 'list', match: { tenantId: 'b' } }],
        }),
        { eligibleCount: 2 },
      );
      assert.equal(calls, 7);
      // Malformed dynamic JS is conservative: the string does not enable bypass.
      Reflect.apply(api.setGlobalOption, undefined, ['requireReadOperationAccessForPopulateDependencies', 'false']);
      assert.equal(api.getGlobalOption('requireReadOperationAccessForPopulateDependencies'), true);
      assert.deepEqual(await read({ select, populate: [] }), {});
      api.setGlobalOption('requireReadOperationAccessForPopulateDependencies', true);
      assert.deepEqual(await read({ select, populate: [] }), {});
      assert.equal(calls, 7);
      // Both modes preserve authorized public unions and exact original arrays, in
      // BOTH hydration modes, including out-of-scope/missing IDs, nulls and duplicates.
      targets.setOption('operationAccess.read', true);
      for (const strict of [true, false]) {
        api.setGlobalOption('requireReadOperationAccessForPopulateDependencies', strict);
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
