import express from 'express';
import mongoose from 'mongoose';
import request from 'supertest';
import { afterEach, describe, expect, it } from 'vitest';
import { get, set } from '@web-ts-toolkit/utils';

import acl, { setGlobalOptions } from '../dist/index.mjs';
import { useMongoTestDatabase } from './setup';

useMongoTestDatabase();

let counter = 0;
type Mode = 'legacy' | 'correlated';
type Op = 'read' | 'list' | 'count';
type Entry = 'direct-list' | 'direct-read' | 'direct-id' | 'root-list' | 'root-read' | 'root-id' | 'service';
const entries: Entry[] = ['direct-list', 'direct-read', 'direct-id', 'root-list', 'root-read', 'root-id', 'service'];
const noCalls = { find: 0, findOne: 0, countDocuments: 0, aggregate: 0 };

function trackCalls(schema: mongoose.Schema) {
  const calls = { ...noCalls };
  for (const op of ['find', 'findOne', 'countDocuments', 'aggregate'] as const) {
    schema.pre(op, function () {
      calls[op] += 1;
    });
  }
  return calls;
}

function descriptor(model: string, mode: Mode, op: Op, path: string) {
  return mode === 'legacy'
    ? { model, op, path, localField: 'key', foreignField: 'key' }
    : { mode, model, op, path, filter: { key: 'match' } };
}

async function fixture(metadata = '_permissions', targetMetadata = '_permissions', readOnly = false) {
  const tag = ++counter;
  const sourceName = `AbbMetadataSource${tag}`;
  const targetName = `AbbMetadataTarget${tag}`;
  const leafName = `AbbMetadataLeaf${tag}`;
  const sourceSchema = new mongoose.Schema({
    key: String,
    secret: String,
    _permissions: mongoose.Schema.Types.Mixed,
    auth: mongoose.Schema.Types.Mixed,
  });
  const targetSchema = new mongoose.Schema({
    key: String,
    secret: String,
    canReadSecret: Boolean,
    policy: mongoose.Schema.Types.Mixed,
  });
  const leafSchema = new mongoose.Schema({ key: String, canReadSecret: Boolean });
  const targetCalls = trackCalls(targetSchema);
  const leafCalls = trackCalls(leafSchema);
  const Source = mongoose.model(sourceName, sourceSchema);
  const Target = mongoose.model(targetName, targetSchema);
  const Leaf = mongoose.model(leafName, leafSchema);
  setGlobalOptions({ requestPermissionField: '_permissions', globalPermissions: () => [] });
  const sourceRouter = acl.createRouter(sourceName, {
    basePath: '/metadata',
    documentPermissionField: metadata,
    operationAccess: { read: true, list: !readOnly },
    permissionSchema: { key: true, secret: 'canReadSecret' }, // pragma: allowlist secret
    alwaysSelectFields: { read: [metadata, 'secret'], list: [metadata, 'secret'] },
    defaults: {
      publicListOptions: { skim: true, includePermissions: false },
      publicReadOptions: { skim: true, includePermissions: false },
    },
  });
  acl.createRouter(targetName, {
    documentPermissionField: targetMetadata,
    operationAccess: { read: true, list: true, count: true },
    permissionSchema: { key: true, secret: 'canReadSecret', canReadSecret: true }, // pragma: allowlist secret
  });
  acl.createRouter(leafName, {
    operationAccess: { read: true, list: true, count: true },
    permissionSchema: { key: true, canReadSecret: true },
  });
  const rootRouter = acl.createRouter({ basePath: '/root', operationAccess: true });

  // This route bypasses HTTP include validation and exercises the service result contract.
  sourceRouter.router.post('/internal/service', async (req, res) => {
    const svc = req.macl.getPublicService(sourceName);
    const results = [];
    for (const run of [
      () => svc.find({}, { include: req.body.include }),
      () => svc.findOne({}, { include: req.body.include }),
      () => svc._list({}, { include: req.body.include }),
      () => svc._readFilter({}, { include: req.body.include }),
    ]) {
      results.push(await run());
    }
    res.json(results);
  });

  const denied = await Source.create(
    set({ key: 'match', secret: 'source-secret' }, metadata, { canReadSecret: false }), // pragma: allowlist secret
  );
  const allowed = await Source.create(
    set({ key: 'match', secret: 'allowed-secret' }, metadata, { canReadSecret: true }), // pragma: allowlist secret
  );
  await Target.create({ key: 'match', secret: 'target-secret', canReadSecret: true }); // pragma: allowlist secret
  await Leaf.create({ key: 'match', canReadSecret: true });

  const app = express();
  app.use(express.json());
  app.use(sourceRouter.routes);
  app.use(rootRouter.routes);

  async function invoke(entry: Entry, include?: unknown, allowedRow = false) {
    const id = String(allowedRow ? allowed._id : denied._id);
    const filter = { _id: id };
    if (entry === 'service') return request(app).post('/metadata/internal/service').send({ include }).expect(200);
    if (entry.startsWith('root')) {
      return request(app)
        .post('/root')
        .send([
          {
            target: 'model',
            name: sourceName,
            op: entry === 'root-list' ? 'list' : 'read',
            ...(entry === 'root-id' ? { id } : { filter }),
            args: { include },
          },
        ])
        .expect(200);
    }
    if (entry === 'direct-id') return request(app).post(`/metadata/__query/${id}`).send({ include });
    return request(app)
      .post(entry === 'direct-read' ? '/metadata/__query/__filter' : '/metadata/__query')
      .send({ filter, include });
  }

  return { invoke, targetName, leafName, targetCalls, leafCalls };
}

function assertRejected(entry: Entry, response: request.Response) {
  expect(JSON.stringify(response.body)).not.toContain('source-secret');
  expect(JSON.stringify(response.body)).not.toContain('target-secret');
  if (entry === 'service') {
    expect(response.body).toHaveLength(4);
    for (const result of response.body) expect(result).toMatchObject({ success: false, code: 'bad_request' });
  } else if (entry.startsWith('root')) {
    expect(response.body[0]).toMatchObject({ statusCode: 400, result: { success: false, code: 'bad_request' } });
  } else {
    expect(response.status).toBe(400);
    expect(response.headers['content-type']).toContain('application/problem+json');
    expect(response.body).toMatchObject({ status: 400, title: 'Bad Request' });
  }
}

function row(entry: Entry, response: request.Response) {
  expect(response.status).toBe(200);
  if (entry === 'direct-read' || entry === 'direct-id') return response.body;
  const result = entry.startsWith('root') ? response.body[0].result : response.body;
  expect(result.success ?? true).toBe(true);
  return entry.endsWith('list') ? result.data[0] : result.data;
}

afterEach(() => {
  setGlobalOptions({ requestPermissionField: '_permissions', globalPermissions: () => [] });
  mongoose.deleteModel(/^AbbMetadata/);
});

describe('include authorization metadata boundary (ABB-01)', () => {
  it('rejects the positive-count permission attack after demonstrating denied and authorized controls', async () => {
    const { invoke, targetName, targetCalls } = await fixture();
    const safe = descriptor(targetName, 'correlated', 'count', 'total');
    const denied = row('direct-list', await invoke('direct-list', safe));
    expect(denied.total).toBe(1);
    expect(denied.secret).toBeUndefined();
    const allowed = row('direct-list', await invoke('direct-list', undefined, true));
    expect(allowed.secret).toBe('allowed-secret');
    Object.assign(targetCalls, noCalls);
    // Before ABB-01 this returns source-secret: count=1 becomes a truthy permission.
    assertRejected('direct-list', await invoke('direct-list', { ...safe, path: '_permissions.canReadSecret' }));
    expect(targetCalls).toEqual(noCalls);
  });

  for (const metadata of ['_permissions', 'auth.policy.permissions']) {
    for (const mode of ['legacy', 'correlated'] as const) {
      it.each(entries)(
        `rejects ${mode} metadata overlaps (${metadata}) via %s before any target calls`,
        async (entry) => {
          const { invoke, targetName, targetCalls } = await fixture(metadata);
          const paths = [
            metadata,
            `${metadata}.canReadSecret`,
            ...(metadata.includes('.') ? ['auth', 'auth.policy'] : []),
          ];
          if (mode === 'legacy') {
            paths.push(
              metadata === '_permissions'
                ? '_permissions["canReadSecret"]'
                : 'auth["policy"]["permissions"].canReadSecret',
            );
          }
          for (const op of ['read', 'list', 'count'] as const) {
            for (const path of paths) {
              // An earlier valid entry must not execute when a later descriptor is rejected.
              const include = [
                descriptor(targetName, 'legacy', 'count', 'safe'),
                descriptor(targetName, mode, op, path),
              ];
              assertRejected(entry, await invoke(entry, include));
              expect(targetCalls).toEqual(noCalls);
            }
          }
        },
      );

      it(`preserves ${mode} unrelated paths, ordinary collisions and legitimate permissions (${metadata})`, async () => {
        const { invoke, targetName } = await fixture(metadata);
        const sibling = metadata === '_permissions' ? '_permissionsExtra' : 'auth.policy.permissionsExtra';
        for (const entry of entries.filter((entry) => entry !== 'service')) {
          const response = await invoke(
            entry,
            [
              descriptor(targetName, mode, 'read', 'related'),
              descriptor(targetName, mode, 'list', 'relatedList'),
              descriptor(targetName, mode, 'count', sibling),
              descriptor(targetName, mode, 'count', 'key'),
            ],
            true,
          );
          const doc = row(entry, response);
          expect(doc.secret).toBe('allowed-secret');
          expect(doc.key).toBe(1);
          expect(get(doc, sibling)).toBe(1);
          expect(doc.related.key).toBe('match');
          expect(doc.relatedList).toHaveLength(1);
        }
      });
    }
  }

  for (const outerMode of ['legacy', 'correlated'] as const) {
    for (const innerMode of ['legacy', 'correlated'] as const) {
      // Correlated args accept only correlated nested entries in the existing contract.
      if (outerMode === 'correlated' && innerMode === 'legacy') continue;
      it(`honors nested target metadata for ${outerMode}/${innerMode} and rejects before target or leaf queries`, async () => {
        const { invoke, targetName, leafName, targetCalls, leafCalls } = await fixture(
          '_permissions',
          'policy.permissions',
        );
        for (const entry of entries) {
          for (const op of ['read', 'list'] as const) {
            for (const path of ['policy', 'policy.permissions', 'policy.permissions.canReadSecret']) {
              const include = {
                ...descriptor(targetName, outerMode, op, 'related'),
                args: { include: descriptor(leafName, innerMode, 'count', path) },
              };
              assertRejected(entry, await invoke(entry, include));
              expect(targetCalls).toEqual(noCalls);
              expect(leafCalls).toEqual(noCalls);
            }
          }
        }
        // The outer model's reserved field is ordinary output on this differently configured target.
        const include = {
          ...descriptor(targetName, outerMode, 'list', 'related'),
          args: { include: descriptor(leafName, innerMode, 'count', '_permissions.canReadSecret') },
        };
        const doc = row('direct-list', await invoke('direct-list', include));
        expect(doc.related).toHaveLength(1);
        expect(doc.related[0]._permissions.canReadSecret).toBe(1);
        expect(doc.related[0].secret).toBeUndefined();
        expect(doc.secret).toBeUndefined();
      });
    }
  }

  it('keeps BadRequest on read-only sources instead of entering unauthorized list fallback', async () => {
    const { invoke, targetName, targetCalls } = await fixture('_permissions', '_permissions', true);
    for (const entry of ['direct-read', 'direct-id', 'root-read', 'root-id', 'service'] as const) {
      assertRejected(
        entry,
        await invoke(entry, descriptor(targetName, 'correlated', 'count', '_permissions.canReadSecret')),
      );
      expect(targetCalls).toEqual(noCalls);
    }
  });

  it('returns controlled BadRequest when nested preflight encounters an unknown owning model', async () => {
    const { invoke, leafName, targetCalls, leafCalls } = await fixture();
    for (const entry of entries) {
      assertRejected(
        entry,
        await invoke(entry, {
          ...descriptor('MissingMetadataModel', 'correlated', 'list', 'related'),
          args: { include: descriptor(leafName, 'correlated', 'count', 'total') },
        }),
      );
      expect(targetCalls).toEqual(noCalls);
      expect(leafCalls).toEqual(noCalls);
    }
  });
});
