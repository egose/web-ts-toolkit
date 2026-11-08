/** Baseline related-scope logging contracts; no assertions about summary work or laziness. */
import express from 'express';
import mongoose from 'mongoose';
import request from 'supertest';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createAccessRuntime } from '../src/index';
import type { ModelRequest } from '../src/interfaces';
import { useMongoTestDatabase } from './setup';

useMongoTestDatabase();
let serial = 0;
const modes = ['isolated', 'trusted'] as const;
const quiet = { includePermissions: false, includeFieldPermissions: false, includeCount: false };

afterEach(() => {
  vi.restoreAllMocks();
  mongoose.deleteModel(/^Arpc05Contract/);
});

describe('baseline logging does not change related/embedded output or query traces', () => {
  it.each(
    modes.flatMap((parentMode) =>
      modes.flatMap((targetMode) =>
        (['direct-read', 'public-list'] as const).map((entry) => ({ parentMode, targetMode, entry })),
      ),
    ),
  )(
    '$parentMode parent / $targetMode target / $entry keeps both target READ/LIST contracts',
    async ({ parentMode, targetMode, entry }) => {
      const api = createAccessRuntime();
      const n = ++serial;
      const queries: unknown[] = [];
      const hooks: string[] = [];
      const schema = (definition: mongoose.SchemaDefinition) => {
        const result = new mongoose.Schema(definition, { versionKey: false });
        result.pre('find', function () {
          queries.push([this.model.modelName, 'find', this.getFilter()]);
        });
        result.pre('findOne', function () {
          queries.push([this.model.modelName, 'findOne', this.getFilter()]);
        });
        return result;
      };
      const Target = mongoose.model(
        `Arpc05ContractTarget${n}`,
        schema({ name: String, group: String, hidden: String }),
      );
      const Parent = mongoose.model(
        `Arpc05ContractParent${n}`,
        schema({
          name: String,
          group: String,
          children: [new mongoose.Schema({ label: String, hidden: String }, { _id: false })],
        }),
      );
      const hook = (scope: string) => (doc: any) => {
        hooks.push(scope);
        doc.name = `hook:${doc.name}`;
        return {};
      };
      api.setGlobalOptions({ globalPermissions: () => [], logger: { isLevelEnabled: () => false } });
      api.createRouter(Target, {
        operationAccess: true,
        baseFilter: true,
        stripPermissionsField: true,
        readAuthorizationMode: targetMode,
        listAuthorizationMode: targetMode,
        permissionSchema: { name: true, hidden: false },
        docPermissions: hook('target'),
      });
      const router = api.createRouter(Parent, {
        basePath: '/arpc05-contract',
        operationAccess: true,
        baseFilter: true,
        stripPermissionsField: true,
        readAuthorizationMode: parentMode,
        listAuthorizationMode: parentMode,
        permissionSchema: {
          name: true,
          group: true,
          children: { read: true, list: true, sub: { label: true, hidden: false } },
        },
        docPermissions: hook('parent'),
      });
      await Target.create({ name: 'target', group: 'g', hidden: 'never' });
      const parent = await Parent.create({
        name: 'parent',
        group: 'g',
        children: [{ label: 'child', hidden: 'never' }],
      });
      const app = express().use(express.json()).use(router.routes);
      let targetOp: 'read' | 'list' = 'read';
      let result: unknown;
      let failure: unknown;
      router.router.post('/probe', async (req, res) => {
        try {
          const core = (req as unknown as ModelRequest).macl;
          const args = {
            select: ['name', 'children', '-_id'],
            include: {
              model: Target.modelName,
              path: 'related',
              op: targetOp,
              mode: 'correlated' as const,
              filter: { group: { $parent: 'group' } },
              args: { select: ['name', '-_id'] },
            },
          };
          result =
            entry === 'direct-read'
              ? await core.getService(Parent.modelName).findById(String(parent._id), args, quiet)
              : await core.getPublicService(Parent.modelName)._list({}, args, quiet);
        } catch (error) {
          failure = error;
        }
        res.json({ ok: true });
      });
      for (const op of ['read', 'list'] as const) {
        targetOp = op;
        queries.length = 0;
        hooks.length = 0;
        const debug = vi.fn();
        const level = vi.fn(() => false);
        api.setGlobalOptions({ logger: { debug, isLevelEnabled: level } });
        await request(app).post('/arpc05-contract/probe').send({}).expect(200);
        if (failure) throw failure;
        const target = { name: targetMode === 'trusted' ? 'hook:target' : 'target' };
        const row = {
          name: parentMode === 'trusted' ? 'hook:parent' : 'parent',
          children: [{ label: 'child' }],
          related: op === 'read' ? target : [target],
        };
        const expected = { success: true, data: entry === 'direct-read' ? row : [row] };
        expect(result).toMatchObject(expected);
        expect(JSON.stringify(result)).not.toContain('never');
        expect(debug).not.toHaveBeenCalled();
        const expectedQueries = [...queries];
        const expectedHooks = [...hooks];
        const checks = level.mock.calls.length;
        expect(checks).toBeGreaterThanOrEqual(2);
        queries.length = 0;
        hooks.length = 0;
        level.mockClear();
        level.mockReturnValue(true);
        await request(app).post('/arpc05-contract/probe').send({}).expect(200);
        if (failure) throw failure;
        expect(result).toMatchObject(expected);
        expect(queries).toEqual(expectedQueries);
        expect(hooks).toEqual(expectedHooks);
        expect(level).toHaveBeenCalledTimes(checks);
        expect(debug).toHaveBeenCalledTimes(checks);
        for (const [message] of debug.mock.calls) {
          const parsed = JSON.parse(message);
          expect([Parent.modelName, Target.modelName]).toContain(parsed.modelName);
          expect(parsed.filterKeyValueCount).toEqual(expect.any(Number));
          expect(parsed).not.toHaveProperty('query');
        }
      }
    },
  );
});
