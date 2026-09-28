import express from 'express';
import mongoose from 'mongoose';
import request from 'supertest';
import { afterEach, describe, expect, it } from 'vitest';
import acl, { setGlobalOptions } from '../dist/index.mjs';
import { useMongoTestDatabase } from './setup';

useMongoTestDatabase();
let counter = 0;

afterEach(() => {
  setGlobalOptions({ globalPermissions: () => [], requestComplexity: {} });
  mongoose.deleteModel(/^ArcEscape/);
});

async function fixture() {
  const tag = ++counter;
  const parentName = `ArcEscapeParent${tag}`;
  const targetName = `ArcEscapeTarget${tag}`;
  const Parent = mongoose.model(parentName, new mongoose.Schema({ name: String, x: mongoose.Schema.Types.Mixed }));
  const Target = mongoose.model(targetName, new mongoose.Schema({ label: String, note: mongoose.Schema.Types.Mixed }));
  // Root envelopes add depth; isolate literal matching from that separate contract.
  setGlobalOptions({ globalPermissions: () => [], requestComplexity: { maxDepth: 16 } });
  const parentRouter = acl.createRouter(parentName, {
    basePath: '/parents',
    operationAccess: { read: true, list: true },
    permissionSchema: { name: true, x: true },
  });
  acl.createRouter(targetName, {
    operationAccess: { read: true, list: true, count: true },
    permissionSchema: { label: true, note: true },
  });
  const rootRouter = acl.createRouter({ basePath: '/root', operationAccess: true });
  const parents = await Parent.create([
    { name: 'different', x: 'changed' },
    { name: 'missing' },
    { name: 'null', x: null },
    { name: 'marker', x: { $parent: 'another' } },
  ]);
  // Real Mixed BSON records, including decoys that would match accidental parent substitution.
  await Target.create([
    { label: 'literal', note: { $parent: 'x' } },
    { label: 'other-literal', note: { $parent: 'other' } },
    { label: 'parent-value', note: 'changed' },
    { label: 'parent-marker', note: { $parent: 'another' } },
  ]);
  const app = express();
  app.use(express.json(), parentRouter.routes, rootRouter.routes);
  return { app, parentName, targetName, parents };
}

describe.each(['direct', 'root'] as const)('escaped Mixed records via %s parent routes (ARC-03)', (entry) => {
  describe.each(['list', 'read-filter', 'read-id'] as const)('%s', (parentOp) => {
    it.each(['read', 'list', 'count'] as const)(
      'bare and explicit equality give identical %s includes and literal misses',
      async (op) => {
        const { app, parentName, targetName, parents } = await fixture();
        const include = ['bare', 'explicit'].flatMap((spelling) =>
          ['x', 'absent'].map((literal) => {
            const escaped = { $escape: { $parent: literal } };
            return {
              mode: 'correlated',
              model: targetName,
              op,
              path: `${spelling}_${literal}`,
              filter: { note: spelling === 'bare' ? escaped : { $eq: escaped } },
              ...(op === 'count' ? {} : { args: { select: ['label', 'note'] } }),
            };
          }),
        );
        const batches = parentOp === 'list' ? [parents] : parents.map((parent) => [parent]);
        for (const batch of batches) {
          const id = String(batch[0]._id);
          const filter = { name: batch[0].name };
          let data;
          if (entry === 'direct') {
            const url =
              parentOp === 'list'
                ? '/parents/__query'
                : parentOp === 'read-id'
                  ? `/parents/__query/${id}`
                  : '/parents/__query/__filter';
            const response = await request(app)
              .post(url)
              .send({ include, ...(parentOp === 'read-filter' ? { filter } : {}) });
            expect(response.status, JSON.stringify(response.body)).toBe(200);
            data = parentOp === 'list' ? response.body.data : response.body;
          } else {
            const response = await request(app)
              .post('/root')
              .send([
                {
                  target: 'model',
                  name: parentName,
                  op: parentOp === 'list' ? 'list' : 'read',
                  ...(parentOp === 'read-id' ? { id } : parentOp === 'read-filter' ? { filter } : {}),
                  args: { include },
                },
              ])
              .expect(200);
            expect(response.body[0]).toMatchObject({ statusCode: 200, result: { success: true } });
            data = response.body[0].result.data;
          }
          const rows = parentOp === 'list' ? data : [data];
          expect(rows.map((row: { name: string }) => row.name).sort()).toEqual(
            batch.map((parent) => parent.name).sort(),
          );
          for (const row of rows) {
            expect(row.bare_x).toEqual(row.explicit_x);
            expect(row.bare_absent).toEqual(row.explicit_absent);
            if (op === 'count') {
              expect(row.bare_x).toBe(1);
              expect(row.bare_absent).toBe(0);
            } else {
              const matched = op === 'list' ? row.bare_x : [row.bare_x];
              expect(matched).toHaveLength(1);
              expect(matched[0]).toMatchObject({ label: 'literal', note: { $parent: 'x' } });
              expect(row.bare_absent).toEqual(op === 'list' ? [] : null);
            }
          }
        }
      },
    );
  });
});
