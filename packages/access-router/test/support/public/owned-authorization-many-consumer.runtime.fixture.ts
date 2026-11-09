/** Executes the EXACT three shipped M3 partial blocks through installed public imports. */
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { once } from 'node:events';
import type { Server } from 'node:http';
import express from 'express';
import mongoose from 'mongoose';
import { createAccessRuntime, type FieldPermissionHook, type FilteredOutput } from '@web-ts-toolkit/access-router';
import type { ModelRequest } from '@web-ts-toolkit/access-router/advanced';
import { rawBefore, rawMany, type Contact } from './collection-raw-recipe.mjs';
import { presentationSubset } from './collection-presentation-recipe.mjs';
import { currentList } from './collection-current-recipe.mjs';

async function runCollectionRecipes() {
  const connection = await mongoose
    .createConnection(process.env.MONGODB_URL!, {
      dbName: `collection_recipes_${randomUUID().replaceAll('-', '')}`,
    })
    .asPromise();
  let server: Server | undefined;
  let reads = 0,
    hooks = 0,
    virtuals = 0,
    predicates = 0;
  let mutate: (() => void) | undefined;
  const observations: unknown[] = [];
  try {
    const api = createAccessRuntime();
    api.setGlobalOptions({ globalPermissions: () => ['reader'], logger: { warn() {} } });
    type Employee = {
      tenantId: string;
      name: string;
      salary: number;
      ownerId: string;
      visible: boolean;
      contacts: Contact[];
    };
    const schema = new mongoose.Schema<Employee>({
      tenantId: String,
      name: String,
      salary: Number,
      ownerId: String,
      visible: Boolean,
      contacts: [new mongoose.Schema({ label: String, email: String, address: { city: String } }, { _id: false })],
    });
    schema.pre(/^find/, function () {
      reads++;
    });
    const EmployeeModel = connection.model('Employee', schema);
    const email: FieldPermissionHook = function (permissions, facts) {
      predicates++;
      assert.ok(Object.isFrozen(facts));
      assert.deepEqual(Object.keys(facts), []);
      mutate?.();
      return permissions.has('reader');
    };
    const contactRules = (city: boolean) => ({
      contacts: { list: true, sub: { label: false, email, address: { list: true, sub: { city } } } },
    });
    const normalRules = {
      name: 'reader',
      salary: (_permissions: unknown, facts: Readonly<Record<string, boolean>>) => facts.owner === true,
    };
    const router = api.createRouter<Employee, { computed: string }>(EmployeeModel, {
      basePath: '/employees',
      operationAccess: { list: true, read: true },
      hydration: { find: 'lean' },
      stripPermissionsField: true,
      baseFilter: { list: () => ({ visible: true }) },
      permissionSchema: normalRules,
      docPermissions: {
        list: {
          dependsOn: ['ownerId'],
          get(doc) {
            hooks++;
            return { owner: doc !== null && typeof doc === 'object' && 'ownerId' in doc && doc.ownerId === 'alice' };
          },
        },
      },
      virtuals: {
        computed: {
          get() {
            virtuals++;
            return 'unused';
          },
          dependsOn: [],
        },
      },
    });
    type NativeRow = {
      _id: string;
      name: string;
      when: Date;
      pattern: RegExp;
      bytes: Buffer;
      entries: Map<string, { label: string }>;
    };
    const nativeSchema = new mongoose.Schema<NativeRow>({
      _id: String,
      name: String,
      when: Date,
      pattern: mongoose.Schema.Types.Mixed,
      bytes: Buffer,
      entries: { type: Map, of: new mongoose.Schema({ label: String }, { _id: false }) },
    });
    nativeSchema.pre(/^find/, function () {
      reads++;
    });
    const Native = connection.model('NativeEmployee', nativeSchema);
    const nativeRouter = api.createRouter(Native, {
      operationAccess: false,
      baseFilter: () => ({ _id: 'not-visible' }),
      stripPermissionsField: true,
      permissionSchema: { name: true, when: true, pattern: true, bytes: true, entries: true },
      docPermissions: {
        list() {
          hooks++;
          return {};
        },
        read() {
          hooks++;
          return {};
        },
      },
    });
    await EmployeeModel.create([
      { tenantId: 't', name: 'Ada', salary: 100, ownerId: 'alice', visible: true },
      { tenantId: 't', name: 'Bea', salary: 200, ownerId: 'alice', visible: true },
      { tenantId: 't', name: 'Hidden', salary: 300, ownerId: 'alice', visible: false },
    ]);
    function initialized(req: express.Request): req is ModelRequest {
      return 'macl' in req;
    }
    router.router.post('/collection-recipes', async (req, res) => {
      assert.ok(initialized(req));
      const rows: readonly Contact[] = Object.freeze([
        { label: 'one', email: 'a@example.test', address: { city: 'A' } },
        { label: 'two', email: 'b@example.test', address: { city: 'B' } },
      ]);
      for (const mode of ['isolated', 'trusted'] as const) {
        api.setModelOptions('Employee', { readAuthorizationMode: mode, listAuthorizationMode: mode });
        const initial = { reads, hooks, virtuals };
        api.setModelOption('Employee', 'permissionSchema', contactRules(true));
        mutate = () => api.setModelOption('Employee', 'permissionSchema', contactRules(false));
        const beforePredicates = predicates;
        const many = await rawMany(req, rows);
        assert.deepEqual(
          many.map((row) => row.address?.city),
          ['A', 'B'],
        );
        assert.deepEqual(
          many.map((row) => row.label),
          ['one', 'two'],
        );
        assert.equal(predicates - beforePredicates, 2);
        api.setModelOption('Employee', 'permissionSchema', contactRules(true));
        const singles = await rawBefore(req, rows);
        assert.deepEqual(
          singles.map((row) => row.address?.city),
          ['A', undefined],
        );
        assert.equal(predicates - beforePredicates, 4);
        mutate = undefined;
        assert.deepEqual({ reads, hooks, virtuals }, initial);

        const native = new Native({
          _id: 'string-id',
          name: 'N',
          when: new Date(10),
          pattern: /x/gi,
          bytes: Buffer.from('safe'),
          entries: new Map([['key', { label: 'L' }]]),
        });
        const raw: NativeRow = {
          _id: 'raw',
          name: 'R',
          when: new Date(20),
          pattern: /r/,
          bytes: Buffer.from('raw'),
          entries: new Map([['key', { label: 'raw' }]]),
        };
        for (const service of [
          nativeRouter.getService(req),
          nativeRouter.getPublicService(req),
          req.macl.getService<NativeRow>('NativeEmployee'),
          req.macl.getPublicService<NativeRow>('NativeEmployee'),
        ]) {
          const value: readonly (FilteredOutput<NativeRow> | null | undefined)[] = await service.pickAllowedFieldsMany(
            Object.freeze([raw, null, undefined]),
            'list',
          );
          assert.equal(value[1], null);
          assert.equal(value[2], undefined);
          assert.equal(value[0]?.entries?.key?.label, 'raw');
          assert.ok(value[0]?.when instanceof Date);
          assert.ok(value[0]?.pattern instanceof RegExp);
          assert.ok(Buffer.isBuffer(value[0]?.bytes));
          assert.notEqual(value[0]?.bytes, raw.bytes);
          const hydrated: readonly unknown[] = await service.pickAllowedFieldsMany([native], 'read');
          const item: unknown = hydrated[0];
          assert.ok(item && typeof item === 'object' && 'name' in item && 'bytes' in item);
          assert.equal(item.name, 'N');
          // Canonical Mongoose Buffer-path toObject normalization returns BSON Binary,
          // which is why a hydrated result is unknown, NOT FilteredOutput<NativeRow>.
          assert.ok(item.bytes instanceof mongoose.mongo.Binary);
          assert.ok(Buffer.from(item.bytes.buffer).equals(Buffer.from('safe')));
        }
        const core: readonly FilteredOutput<NativeRow>[] = await req.macl.pickAllowedFieldsMany(
          'NativeEmployee',
          [raw],
          'read',
        );
        assert.equal(core[0].name, 'R');
        const service = nativeRouter.getService(req);
        let traps = 0;
        const proxy = new Proxy([], {
          getPrototypeOf() {
            traps++;
            throw new Error('trap');
          },
        });
        const rejected = (error: unknown) => {
          assert.ok(error instanceof Error && 'result' in error);
          assert.ok(error.result && typeof error.result === 'object' && 'code' in error.result);
          assert.equal(error.result.code, 'bad_request');
          return true;
        };
        for (const [input, options] of [
          [[], { purpose: 'output' }],
          [[raw], { authorization: { rows: { mode: 'unrestricted' } } }],
          [[raw], { documentAuthorization: {} }],
          [proxy, {}],
          [new Array(1), {}],
          [[raw, []], {}],
        ]) {
          await assert.rejects(
            () => Reflect.apply(service.pickAllowedFieldsMany, service, [input, 'read', options]),
            rejected,
          );
        }
        assert.equal(traps, 0);
        assert.deepEqual({ reads, hooks, virtuals }, initial); // no store calls, doc hooks or virtuals in ANY raw path

        api.setModelOption('Employee', 'permissionSchema', normalRules);
        const first = await currentList(req, 't');
        assert.equal(first.length, 2);
        assert.equal(first.find((row) => row.name === 'Ada')?.salary, 100);
        const beforePresentation = { reads, hooks, predicates, virtuals };
        assert.deepEqual(
          presentationSubset(first)
            .map((row) => row.name)
            .sort(),
          ['Ada', 'Bea'],
        );
        assert.deepEqual({ reads, hooks, predicates, virtuals }, beforePresentation);
        await EmployeeModel.collection.updateMany({ tenantId: 't' }, { $set: { ownerId: 'bob' } });
        const current = await currentList(req, 't');
        assert.equal(current.length, 2);
        for (const row of current) assert.equal(Object.hasOwn(row, 'salary'), false);
        assert.equal(first.find((row) => row.name === 'Ada')?.salary, 100); // old DATA is not current authority
        assert.equal(reads - beforePresentation.reads, 1);
        assert.equal(hooks - beforePresentation.hooks, 2);
        assert.equal(virtuals, initial.virtuals);
        await EmployeeModel.collection.updateMany({ tenantId: 't' }, { $set: { ownerId: 'alice' } });
        observations.push({
          mode,
          rawHelperCalls: { singles: 2, many: 1 },
          rawFieldCallbacks: 4,
          rawExtra: { reads: 0, hooks: 0 },
          presentationExtra: { reads: 0, hooks: 0, helperCalls: 0 },
          currentListExtra: { reads: 1, hooks: 2 },
          visibleRows: current.length,
          nativeGettersAndCore: true,
          rejectedControlsAndRows: 6,
          proxyTraps: traps,
        });
      }
      res.json({ ok: true });
    });
    const app = express();
    app.use(express.json());
    app.use(router.routes);
    server = app.listen(0, '127.0.0.1');
    await once(server, 'listening');
    const address = server.address();
    assert.ok(address && typeof address !== 'string');
    const response = await fetch(`http://127.0.0.1:${address.port}/employees/collection-recipes`, { method: 'POST' });
    assert.equal(response.status, 200, await response.text());
    console.log(
      JSON.stringify({
        guide: 'collection-alternatives',
        statuses: [response.status],
        reads,
        hooks,
        virtuals,
        observations,
      }),
    );
  } finally {
    if (server)
      await new Promise<void>((resolve, reject) => server!.close((error) => (error ? reject(error) : resolve())));
    await connection.dropDatabase();
    await connection.close();
  }
}
void runCollectionRecipes().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
