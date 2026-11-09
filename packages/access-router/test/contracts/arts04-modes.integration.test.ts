import mongoose from 'mongoose';
import { describe, expect, it } from 'vitest';
import type { ModelOutputContext, ModelHookContext } from '../../dist/advanced.mjs';
import { modelFixture, modeKeys, quiet, gate, allIsolated, allTrusted } from '../support/public/arts04-fixture';
import { useMongoTestDatabase } from '../setup';

useMongoTestDatabase();
const modes = ['isolated', 'trusted'] as const;
const args = { select: ['value', 'hidden', 'conditional', '-_id'] };
const branches = ['create', 'update', 'upsert-create', 'upsert-update'] as const;

// Literal expectations are grounded in retained fast-path-options/write-output-modes tests.
function output(result: any): any {
  expect(result.success).toBe(true);
  if (!result.success) throw new Error(JSON.stringify(result));
  return Array.isArray(result.data) ? result.data[0] : result.data;
}

describe('ARTS-04 public source modes', () => {
  it.each(Array.from({ length: 16 }, (_, mask) => ({ mask, id: `MODE-${String(mask).padStart(2, '0')}` })))(
    '$id six real operations use four independent settings',
    async ({ mask }) => {
      const seen: ModelOutputContext[] = [];
      const hook = (doc: any, _p: unknown, context: ModelOutputContext) => {
        if (!(doc instanceof mongoose.Document)) {
          doc.value = 'output-hook';
          seen.push(context);
        }
        return { owner: true, blocked: false };
      };
      const f = await modelFixture({
        ...Object.fromEntries(modeKeys.map((key, bit) => [key, mask & (1 << bit) ? 'trusted' : 'isolated'])),
        docPermissions: { read: hook, list: hook, create: hook, update: hook },
      });
      const mutationRows = await f.Source.insertMany([
        { value: 'before-update', hidden: 'update-denied' },
        { value: 'before-upsert-update', hidden: 'upsert-denied' },
      ]);
      await f.execute(async (req) => {
        const svc = req.macl.getService(f.Source.modelName);
        const operations = [
          {
            op: 'read',
            access: 'read',
            bit: 0,
            stored: 'stored-0',
            run: () => svc.findById(String(f.rows[0]._id), args, quiet),
          },
          {
            op: 'list',
            access: 'list',
            bit: 1,
            stored: 'stored-1',
            run: () => svc.find({ _id: f.rows[1]._id }, args, quiet),
          },
          {
            op: 'create',
            access: 'create',
            bit: 2,
            stored: 'created',
            run: () => svc.create({ value: 'created', hidden: 'attack', conditional: 'c' }, args, quiet),
          },
          {
            op: 'update',
            access: 'update',
            bit: 3,
            stored: 'updated',
            run: () => svc.updateById(String(mutationRows[0]._id), { value: 'updated' }, args, quiet),
          },
          {
            op: 'upsert',
            access: 'create',
            bit: 2,
            stored: 'upserted-create',
            run: () => svc.upsert({ value: 'missing' }, { value: 'upserted-create' }, args, quiet),
          },
          {
            op: 'upsert',
            access: 'update',
            bit: 3,
            stored: 'upserted-update',
            run: () => svc.upsert({ _id: mutationRows[1]._id }, { value: 'upserted-update' }, args, quiet),
          },
        ];
        for (const entry of operations) {
          const result = await entry.run(),
            row = output(result);
          expect(row.value).toBe(mask & (1 << entry.bit) ? 'output-hook' : entry.stored);
          expect(row).not.toHaveProperty('hidden');
          const context = seen.at(-1)!;
          expect(context).toMatchObject({
            operation: entry.op,
            outputAccess: entry.access === 'list' ? 'list' : 'read',
            virtualAccess: entry.access,
            docPermissionsAccess: entry.access,
          });
          expect(Object.isFrozen(context)).toBe(true);
          const published =
            'contexts' in result ? result.contexts[0] : 'context' in result ? result.context : undefined;
          expect(published?.docPermissions).toEqual({ owner: true, blocked: false });
          expect(Object.isFrozen(published?.docPermissions)).toBe(true);
          if (entry.op === 'read' || entry.op === 'list')
            expect(row.conditional).toBe(`conditional-${entry.op === 'list' ? 1 : 0}`);
          if (entry.access === 'create') {
            const stored = await f.Source.findOne({ value: entry.stored }).lean();
            expect(stored).toMatchObject({ value: entry.stored });
            expect(stored).not.toHaveProperty('hidden');
          } else {
            const id =
              entry.op === 'read'
                ? f.rows[0]._id
                : entry.op === 'list'
                  ? f.rows[1]._id
                  : entry.op === 'update'
                    ? mutationRows[0]._id
                    : mutationRows[1]._id;
            expect(await f.Source.findById(id).lean()).toMatchObject({ value: entry.stored });
          }
        }
      });
      expect(await f.Source.findById(f.rows[0]._id).lean()).toMatchObject({
        value: 'stored-0',
        hidden: 'source-denied',
      });
      expect(await f.Source.findById(f.rows[1]._id).lean()).toMatchObject({
        value: 'stored-1',
        hidden: 'source-denied',
      });
      expect(await f.Source.findById(mutationRows[0]._id).lean()).toMatchObject({
        value: 'updated',
        hidden: 'update-denied',
      });
      expect(await f.Source.findById(mutationRows[1]._id).lean()).toMatchObject({
        value: 'upserted-update',
        hidden: 'upsert-denied',
      });
      const identities = await f.Source.find().select('_id').lean();
      expect(new Set(identities.map((row) => String(row._id))).size).toBe(6);
      expect(await f.Source.countDocuments({ value: 'output-hook' })).toBe(0);
    },
  );

  it.each([0, 1, 2, 3])('FALLBACK-%s READ miss borrows READ, independent LIST borrows LIST', async (pair) => {
    const contexts: ModelOutputContext[] = [];
    const hook = (doc: any, _p: unknown, c: ModelOutputContext) => {
      doc.value = 'output-hook';
      contexts.push(c);
      return { owner: true };
    };
    const f = await modelFixture({
      readAuthorizationMode: pair & 1 ? 'trusted' : 'isolated',
      listAuthorizationMode: pair & 2 ? 'trusted' : 'isolated',
      baseFilter: { read: () => ({ tenant: 'read' }), list: () => ({ tenant: 'list' }) },
      docPermissions: { read: hook, list: hook },
    });
    await f.execute(async (req) => {
      const pub = req.macl.getPublicService(f.Source.modelName),
        svc = req.macl.getService(f.Source.modelName);
      const retry = await pub._read(String(f.rows[1]._id), args, quiet);
      expect(output(retry).value).toBe(pair & 1 ? 'output-hook' : 'stored-1');
      expect(contexts.at(-1)).toMatchObject({
        operation: 'read',
        outputAccess: 'list',
        virtualAccess: 'list',
        docPermissionsAccess: 'list',
      });
      const previousFacts = 'context' in retry ? retry.context.docPermissions : undefined;
      const list = await svc.find({}, args, quiet);
      expect(output(list).value).toBe(pair & 2 ? 'output-hook' : 'stored-1');
      expect(contexts.at(-1)).toMatchObject({ operation: 'list', outputAccess: 'list' });
      if ('contexts' in list) expect(list.contexts[0].docPermissions).not.toBe(previousFacts);
      f.router.setOption('operationAccess.list', false);
      expect(await pub._read(String(f.rows[1]._id), args, quiet)).toMatchObject({
        success: false,
        code: 'unauthorized',
      });
      f.router.setOption('baseFilter.read', () => false);
      expect(await pub._read(String(f.rows[1]._id), args, quiet)).toMatchObject({ success: false, code: 'forbidden' });
    });
    expect(await f.Source.findById(f.rows[1]._id).lean()).toMatchObject({ value: 'stored-1' });
  });

  it.each(['read', 'list', ...branches])(
    'CAPTURE-%s pending and nested fresh calls capture separately',
    async (entry) => {
      const entered = gate(),
        release = gate();
      const initial = {
        readAuthorizationMode: 'trusted',
        listAuthorizationMode: 'isolated',
        createAuthorizationMode: 'trusted',
        updateAuthorizationMode: 'isolated',
      } as const;
      const hook = (doc: any) => {
        if (!(doc instanceof mongoose.Document)) doc.value = 'output-hook';
        return {};
      };
      const f = await modelFixture({
        ...initial,
        docPermissions: { read: hook, list: hook, create: hook, update: hook },
      });
      await f.execute(async (req) => {
        const svc = req.macl.getService(f.Source.modelName);
        let first = true,
          nested: any;
        const pause = async (input: any) => {
          if (first) {
            first = false;
            entered.resolve();
            await release.promise;
            nested = await svc.findById(String(f.rows[0]._id), args, quiet);
          }
          return input;
        };
        f.router.setOptions({
          overrideFilter: { read: pause, list: pause },
          prepare: { create: pause, update: pause },
        });
        const invoke = (value: string) =>
          entry === 'read'
            ? svc.findById(String(f.rows[0]._id), args, quiet)
            : entry === 'list'
              ? svc.find({ _id: f.rows[0]._id }, args, quiet)
              : entry === 'create'
                ? svc.create({ value }, args, quiet)
                : entry === 'update'
                  ? svc.updateById(String(f.rows[0]._id), { value }, args, quiet)
                  : svc.upsert(
                      entry === 'upsert-create' ? { value: `absent-${value}` } : { _id: f.rows[0]._id },
                      { value },
                      args,
                      quiet,
                    );
        const pending = invoke('pending');
        await entered.promise;
        f.router.setOptions({
          readAuthorizationMode: 'isolated',
          listAuthorizationMode: 'trusted',
          createAuthorizationMode: 'isolated',
          updateAuthorizationMode: 'trusted',
        });
        release.resolve();
        const row = output(await pending),
          created = entry === 'create' || entry === 'upsert-create';
        const wasTrusted = entry === 'read' || created;
        expect(row.value).toBe(wasTrusted ? 'output-hook' : entry === 'list' ? 'stored-0' : 'pending');
        expect(output(nested).value).toBe('stored-0');
        const fresh = output(await invoke('fresh'));
        expect(fresh.value).toBe(wasTrusted ? (entry === 'read' ? 'stored-0' : 'fresh') : 'output-hook');
      });
    },
  );

  it('CAPTURE-defaults live inheritance, explicit isolation, restoration and unordered warning membership', async () => {
    const f = await modelFixture({
        docPermissions: {
          read(doc: any) {
            doc.value = 'output-hook';
            return {};
          },
        },
      }),
      warnings: any[] = [];
    const readValue = () =>
      f.execute(
        async (req) =>
          output(await req.macl.getService(f.Source.modelName).findById(String(f.rows[0]._id), args, quiet)).value,
      );
    f.api.setGlobalOptions({
      logger: {
        warn(_message, metadata) {
          warnings.push(metadata);
        },
      },
    });
    const snapshot = f.router.options;
    f.api.setDefaultModelOptions(allTrusted);
    f.api.setDefaultModelOptions(allTrusted);
    expect(await readValue()).toBe('output-hook');
    for (const owner of ['default-model', f.Source.modelName, f.Target.modelName])
      for (const access of ['read', 'list', 'create', 'update']) {
        expect(
          warnings.filter(
            (m) => m.modelName === owner && m.access === access && m.category === 'trustedAuthorizationSource',
          ),
        ).toHaveLength(1);
      }
    f.router.setOptions(allIsolated);
    expect(await readValue()).toBe('stored-0');
    for (const key of modeKeys) expect(f.api.getModelOptions(f.Source.modelName)[key]).toBe('isolated');
    for (const key of modeKeys) f.router.setOption(key, undefined);
    expect(await readValue()).toBe('output-hook');
    for (const key of modeKeys) expect(f.api.getModelOptions(f.Source.modelName)[key]).toBe('trusted');
    expect(Object.isFrozen(snapshot)).toBe(true);
    expect(f.router.options).toEqual(snapshot);
    let throwingWarnings = 0;
    f.api.setGlobalOptions({
      logger: {
        warn() {
          throwingWarnings++;
          throw new Error('consumer logger');
        },
      },
    });
    f.router.setOption('readAuthorizationMode', 'isolated');
    f.router.setOption('readAuthorizationMode', 'trusted');
    expect(f.api.getModelOption(f.Source.modelName, 'readAuthorizationMode')).toBe('trusted');
    expect(throwingWarnings).toBe(1);
  });
});

describe('ARTS-04 real post-write native detachment', () => {
  it.each(modes.flatMap((mode) => branches.map((branch) => ({ mode, branch }))))(
    'DETACH-$mode-$branch payload/live lifecycle/storage stay detached',
    async ({ mode, branch }) => {
      const lifecycle: ModelHookContext[] = [];
      const hook = (doc: any) => {
        if (!(doc instanceof mongoose.Document)) {
          doc.value = 'output-hook';
          doc.when.setTime(10);
          doc.payload.nested.value = 'changed';
          doc.payload.stamp.setTime(20);
          doc.payload.bytes.fill(0);
        }
        return {};
      };
      const after = (doc: any, _p: unknown, context: ModelHookContext) => {
        lifecycle.push(context);
        return doc;
      };
      const f = await modelFixture({
        createAuthorizationMode: mode,
        updateAuthorizationMode: mode,
        docPermissions: { create: hook, update: hook },
        afterPersist: { create: after, update: after },
      });
      await f.execute(async (req) => {
        const svc = req.macl.getService(f.Source.modelName);
        const payload = {
          value: 'submitted',
          when: new Date(3),
          payload: { nested: { value: 'original' }, stamp: new Date(4), bytes: Buffer.from('payload') },
        };
        const selected = { select: ['value', 'when', 'payload', '-_id'] };
        const result =
          branch === 'create'
            ? await svc.create(payload, selected, quiet)
            : branch === 'update'
              ? await svc.updateById(String(f.rows[0]._id), payload, selected, quiet)
              : await svc.upsert(
                  branch === 'upsert-create' ? { value: 'absent' } : { _id: f.rows[0]._id },
                  payload,
                  selected,
                  quiet,
                );
        const row = output(result),
          trusted = mode === 'trusted';
        expect(row.value).toBe(trusted ? 'output-hook' : 'submitted');
        expect(row.when.getTime()).toBe(trusted ? 10 : 3);
        expect(row.payload.nested.value).toBe(trusted ? 'changed' : 'original');
        expect(row.payload.stamp.getTime()).toBe(trusted ? 20 : 4);
        expect(row.payload.bytes.toString()).toBe(trusted ? '\0'.repeat(7) : 'payload');
        const context = lifecycle.at(-1)!;
        for (const value of [payload, context.currentDocument, context.preparedData, context.finalDocumentSnapshot]) {
          expect(value).toMatchObject({
            value: 'submitted',
            when: new Date(3),
            payload: { nested: { value: 'original' }, stamp: new Date(4) },
          });
          expect((value as any).payload.bytes.toString()).toBe('payload');
        }
        const stored = await f.Source.findOne({ value: 'submitted' }).lean();
        expect(stored?.when?.getTime()).toBe(3);
        expect(stored?.payload.stamp.getTime()).toBe(4);
        expect(stored?.payload.nested.value).toBe('original');
        expect(stored?.payload.bytes.toString()).toBe('payload');
        // A real public output limit can fail AFTER save. No budget or package method is replaced.
        if (branch === 'create') {
          let afterSave = false;
          f.router.setOption('afterPersist.create', (doc) => {
            afterSave = true;
            doc.payload = new mongoose.mongo.Code('return 1', { expanded: Array(20001).fill('selected') });
            return doc;
          });
          expect(await svc.create({ value: 'committed-before-output-error' }, selected, quiet)).toMatchObject({
            success: false,
            code: 'bad_request',
          });
          expect(afterSave).toBe(true);
          expect(await f.Source.findOne({ value: 'committed-before-output-error' }).lean()).toMatchObject({
            value: 'committed-before-output-error',
          });
        }
      });
    },
  );
});

describe('ARTS-04 independent registered target modes', () => {
  it.each([0, 1, 2, 3].flatMap((pair) => [0, 1].map((posture) => ({ pair, posture }))))(
    'TARGET-$pair-$posture populate/include and write-origin targets own their settings',
    async ({ pair, posture }) => {
      const observations: Array<{ owner: unknown; access: string }> = [];
      const liveTargets: any[] = [];
      const afterPersist = async (doc: any) => {
        // Application-owned lifecycle population is legitimate mutable work. The
        // later output hook must still never borrow this live target's storage.
        await doc.populate('ref');
        liveTargets.push(doc.ref);
        return doc;
      };
      const targetHook = (doc: any, _p: unknown, context: ModelOutputContext) => {
        observations.push({ owner: doc.owner, access: context.outputAccess });
        const owner = doc.owner === true;
        doc.name = 'output-hook';
        doc.when.setTime(10);
        const bytes = doc.payload.bytes;
        (Buffer.isBuffer(bytes) ? bytes : bytes.buffer).fill(0);
        return { owner };
      };
      const sourceHook = (doc: any) => {
        if (!(doc instanceof mongoose.Document)) doc.value = 'output-hook';
        return { source: true };
      };
      const f = await modelFixture(
        {
          readAuthorizationMode: posture ? 'trusted' : 'isolated',
          listAuthorizationMode: posture ? 'isolated' : 'trusted',
          createAuthorizationMode: posture ? 'isolated' : 'trusted',
          updateAuthorizationMode: posture ? 'trusted' : 'isolated',
          docPermissions: { read: sourceHook, list: sourceHook, create: sourceHook, update: sourceHook },
          afterPersist: { create: afterPersist, update: afterPersist },
        },
        {
          readAuthorizationMode: pair & 1 ? 'trusted' : 'isolated',
          listAuthorizationMode: pair & 2 ? 'trusted' : 'isolated',
          docPermissions: {
            read: { dependsOn: ['owner'], get: targetHook },
            list: { dependsOn: ['owner'], get: targetHook },
          },
        },
      );
      await f.execute(async (req) => {
        const svc = req.macl.getService(f.Source.modelName);
        for (const access of ['read', 'list'] as const) {
          await f.Source.updateOne({ _id: f.rows[0]._id }, { value: 'stored-0' });
          const related = { select: ['name', 'secret', 'when', 'payload', '-_id'] };
          const query = {
            select: ['value', 'hidden', 'ref', 'group', '-_id'],
            populate: [{ path: 'ref', access, ...related }],
            include: [
              {
                model: f.Target.modelName,
                op: access,
                path: 'attached',
                localField: 'group',
                foreignField: 'group',
                args: { ...related, sort: 'name' },
              },
            ],
          };
          const result = await svc.find({}, query, quiet),
            row = output(result);
          expect(observations.every((o) => typeof o.owner === 'boolean')).toBe(true);
          expect(observations.at(-1)?.access).toBe(access);
          const trusted = !!(pair & (access === 'read' ? 1 : 2));
          expect(row.value).toBe(posture ? 'stored-0' : 'output-hook');
          expect(row).not.toHaveProperty('hidden');
          expect(row.ref.name).toBe(trusted ? 'output-hook' : 'target-a');
          expect(row.ref.secret).toBe('granted');
          expect(row.ref.when.getTime()).toBe(trusted ? 10 : 3);
          expect(row.ref.payload.bytes.toString()).toBe(trusted ? '\0'.repeat(6) : 'target');
          const attached = access === 'read' ? [row.attached] : row.attached;
          expect(attached[0].name).toBe(trusted ? 'output-hook' : 'target-a');
          if (access === 'list') expect(attached[1]).not.toHaveProperty('secret');
          row.ref.when.setTime(99);
          const returnedBytes = row.ref.payload.bytes;
          (Buffer.isBuffer(returnedBytes) ? returnedBytes : returnedBytes.buffer).fill(9);
          expect((result as any).data[1].ref.when.getTime()).toBe(trusted ? 10 : 3);
          expect((result as any).data[1].ref.payload.bytes.toString()).toBe(trusted ? '\0'.repeat(6) : 'target');
          expect(attached[0].when.getTime()).toBe(trusted ? 10 : 3);
          const written = output(await svc.create({ value: 'written', ref: f.targets[0]._id }, query, quiet));
          expect(written.value).toBe(posture ? 'written' : 'output-hook');
          expect(written.ref.name).toBe(trusted ? 'output-hook' : 'target-a');
          expect(written.ref.when.getTime()).toBe(trusted ? 10 : 3);
          expect(written.ref.payload.bytes.toString()).toBe(trusted ? '\0'.repeat(6) : 'target');
          const updated = output(
            await svc.updateById(String(f.rows[0]._id), { value: 'updated-target' }, query, quiet),
          );
          expect(updated.value).toBe(posture ? 'output-hook' : 'updated-target');
          expect(updated.ref.name).toBe(trusted ? 'output-hook' : 'target-a');
          expect(updated.ref.when.getTime()).toBe(trusted ? 10 : 3);
          expect(updated.ref.payload.bytes.toString()).toBe(trusted ? '\0'.repeat(6) : 'target');
        }
      });
      expect(liveTargets).toHaveLength(4);
      for (const target of liveTargets) {
        expect(target.name).toBe('target-a');
        expect(target.when.getTime()).toBe(3);
        expect(target.payload.bytes.toString()).toBe('target');
      }
      expect(await f.Source.countDocuments({ value: 'output-hook' })).toBe(0);
      expect(String((await f.Source.findById(f.rows[0]._id).lean())?.ref)).toBe(String(f.targets[0]._id));
      for (const target of await f.Target.find().sort('name').lean()) {
        expect(target.when?.getTime()).toBe(3);
        expect(target.payload.bytes.toString()).toBe('target');
        expect(target.name).toMatch(/^target-[ab]$/);
      }
    },
  );
});
