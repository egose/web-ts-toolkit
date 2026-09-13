import type { AddressInfo } from 'node:net';
import { createServer, type Server } from 'node:http';
import express from 'express';
import mongoose from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { createAccessRuntime } from '@web-ts-toolkit/access-router';

import { createAdapter, parentField, CorrelatedIncludeError } from '../src';
import type { CorrelatedInclude, Document } from '../src';

/**
 * ACI-05: cross-package and transport parity for correlated includes.
 *
 * Real-server coverage only (this file always crosses the package/transport
 * boundary): every include below is executed against the sibling
 * `access-router` server over HTTP, comparing client-built descriptors
 * (`parentField()` + `$include()`) with equivalent raw protocol payloads in
 * both direct and grouped execution. Conversion-only behavior (zero-HTTP
 * conversion, option forwarding, type positions) stays in
 * `access-router-client.correlated-includes.unit.test.ts` and is not
 * duplicated here; server execution semantics stay in the server's
 * `correlated-includes.execution.test.ts`.
 */

const MONGO_TIMEOUT = 120_000;

const USER_MODEL = 'Aci5User';
const ORG_MODEL = 'Aci5Org';
const TEAM_MODEL = 'Aci5Team';
const POST_MODEL = 'Aci5Post';
const GUARD_MODEL = 'Aci5GuardTarget';

const USER_PATH = '/api/aci5-users/__query';
const ROOT_PATH = '/api/root';

interface Aci5User extends Document {
  name: string;
  orgId?: string;
  teamSlug?: string;
  managerId?: string;
  region?: string;
  targetKey?: string;
}

interface Aci5Org extends Document {
  name: string;
  description?: string;
  active?: boolean;
}

interface Aci5Team extends Document {
  name: string;
  slug: string;
}

interface Aci5Post extends Document {
  authorId: string;
  reviewerId?: string;
  title: string;
  createdAt?: Date;
  region?: string;
  note?: unknown;
}

interface Aci5GuardTarget extends Document {
  label: string;
  targetKey: string;
  tenant: string;
  secret?: string;
}

interface ProtocolRequest {
  method: string;
  path: string;
  query: Record<string, unknown>;
  body: unknown;
}

const protocolRequests: ProtocolRequest[] = [];

let mongoServer: MongoMemoryServer;
let server: Server;
let adapter: ReturnType<typeof createAdapter>;
const services = {} as {
  userService: ReturnType<typeof adapter.createModelService<Aci5User>>;
  orgService: ReturnType<typeof adapter.createModelService<Aci5Org>>;
  teamService: ReturnType<typeof adapter.createModelService<Aci5Team>>;
  postService: ReturnType<typeof adapter.createModelService<Aci5Post>>;
  guardService: ReturnType<typeof adapter.createModelService<Aci5GuardTarget>>;
};
const seedState = {} as {
  u1Id: string;
  u2Id: string;
  org1Id: string;
  org2Id: string;
};

const permsFromHeader = (req: express.Request) =>
  String(req.headers['x-perms'] ?? '')
    .split(',')
    .map((v) => v.trim())
    .filter(Boolean);

const getModel = <T>(name: string, schema: mongoose.Schema): mongoose.Model<T> =>
  (mongoose.models[name] as mongoose.Model<T> | undefined) ?? mongoose.model<T>(name, schema);

async function seedDatabase() {
  await Promise.all(Object.values(mongoose.connection.collections).map((collection) => collection.deleteMany({})));

  const Org = mongoose.model<Aci5Org>(ORG_MODEL);
  const Team = mongoose.model<Aci5Team>(TEAM_MODEL);
  const User = mongoose.model<Aci5User>(USER_MODEL);
  const Post = mongoose.model<Aci5Post>(POST_MODEL);
  const GuardTarget = mongoose.model<Aci5GuardTarget>(GUARD_MODEL);

  const [org1, org2] = await Org.create([
    { name: 'aci5-org-one', description: 'first org', active: true },
    { name: 'aci5-org-two', description: 'second org', active: true },
  ]);
  await Team.create([
    { name: 'aci5-team-one', slug: 'aci5-team-one-slug' },
    { name: 'aci5-team-two', slug: 'aci5-team-two-slug' },
  ]);
  const [u1, u2] = await User.create([
    {
      name: 'u1',
      orgId: String(org1._id),
      teamSlug: 'aci5-team-one-slug',
      managerId: 'm1',
      region: 'outer-r1',
      targetKey: 'read-key',
    },
    {
      name: 'u2',
      orgId: String(org2._id),
      teamSlug: 'aci5-team-two-slug',
      managerId: 'm2',
      region: 'outer-r2',
      targetKey: 'list-key',
    },
  ]);
  // Nested-scope owner: matches Post.region, never the outer User.region.
  await User.create({ name: 'u3', region: 'inner-rx', targetKey: 'count-key' });
  // Missing-reference parent: no orgId/teamSlug/managerId/region/targetKey.
  await User.create({ name: 'u4' });

  const day = 24 * 60 * 60 * 1000;
  const base = Date.now();
  await Post.create([
    {
      authorId: String(u1._id),
      reviewerId: 'm9',
      title: 'u1-p1',
      createdAt: new Date(base + 3 * day),
      region: 'inner-rx',
    },
    {
      authorId: String(u1._id),
      reviewerId: 'm1',
      title: 'u1-p2',
      createdAt: new Date(base + 2 * day),
      region: 'inner-other',
    },
    {
      authorId: String(u1._id),
      reviewerId: 'm1',
      title: 'u1-p3',
      createdAt: new Date(base + 1 * day),
      region: 'inner-other',
    },
    // Literal `$` title: stays a literal query value, never a marker.
    {
      authorId: String(u1._id),
      reviewerId: 'm1',
      title: '$special',
      createdAt: new Date(base + 4 * day),
      region: 'inner-other',
    },
    // Marker-shaped stored value for the `$escape` round-trip.
    {
      authorId: String(u1._id),
      reviewerId: 'm1',
      title: 'note-post',
      createdAt: new Date(base),
      region: 'inner-other',
      note: { $parent: 'x' },
    },
    {
      authorId: String(u2._id),
      reviewerId: 'm2',
      title: 'u2-p1',
      createdAt: new Date(base + 5 * day),
      region: 'inner-other',
    },
    {
      authorId: String(u2._id),
      reviewerId: 'm2',
      title: 'u2-p2',
      createdAt: new Date(base + 4 * day),
      region: 'inner-other',
    },
  ]);

  await GuardTarget.create([
    { label: 'read-target', targetKey: 'read-key', tenant: 'read', secret: 'read-secret' }, // pragma: allowlist secret
    { label: 'list-target', targetKey: 'list-key', tenant: 'list', secret: 'list-secret' }, // pragma: allowlist secret
    { label: 'count-target', targetKey: 'count-key', tenant: 'count', secret: 'count-secret' }, // pragma: allowlist secret
  ]);

  Object.assign(seedState, {
    u1Id: String(u1._id),
    u2Id: String(u2._id),
    org1Id: String(org1._id),
    org2Id: String(org2._id),
  });
}

beforeAll(async () => {
  mongoServer = await MongoMemoryServer.create();
  await mongoose.connect(mongoServer.getUri(), { dbName: 'access-router-client-aci05' });

  const orgSchema = new mongoose.Schema<Aci5Org>({ name: String, description: String, active: Boolean });
  const teamSchema = new mongoose.Schema<Aci5Team>({ name: String, slug: String });
  const userSchema = new mongoose.Schema<Aci5User>({
    name: String,
    orgId: String,
    teamSlug: String,
    managerId: String,
    region: String,
    targetKey: String,
  });
  const postSchema = new mongoose.Schema<Aci5Post>({
    authorId: String,
    reviewerId: String,
    title: String,
    createdAt: Date,
    region: String,
    note: mongoose.Schema.Types.Mixed,
  });
  const guardSchema = new mongoose.Schema<Aci5GuardTarget>({
    label: String,
    targetKey: String,
    tenant: String,
    secret: String,
  });
  getModel<Aci5Org>(ORG_MODEL, orgSchema);
  getModel<Aci5Team>(TEAM_MODEL, teamSchema);
  getModel<Aci5User>(USER_MODEL, userSchema);
  getModel<Aci5Post>(POST_MODEL, postSchema);
  getModel<Aci5GuardTarget>(GUARD_MODEL, guardSchema);

  const runtime = createAccessRuntime();
  runtime.registerModelInstance(USER_MODEL, mongoose.model(USER_MODEL));
  runtime.registerModelInstance(ORG_MODEL, mongoose.model(ORG_MODEL));
  runtime.registerModelInstance(TEAM_MODEL, mongoose.model(TEAM_MODEL));
  runtime.registerModelInstance(POST_MODEL, mongoose.model(POST_MODEL));
  runtime.registerModelInstance(GUARD_MODEL, mongoose.model(GUARD_MODEL));
  runtime.setGlobalOptions({
    requestPermissionField: '_permissions',
    globalPermissions: permsFromHeader,
    // The grouped root envelope adds depth levels around the same include
    // template, so this fixture allows headroom above the default maxDepth 8
    // (the default bound itself stays covered by the server suites).
    requestComplexity: { maxDepth: 12 },
  });

  const app = express();
  app.use(express.json());
  app.use((req, _res, next) => {
    protocolRequests.push({ method: req.method, path: req.path, query: { ...req.query }, body: req.body });
    next();
  });

  app.use(
    runtime.createRouter(USER_MODEL, {
      basePath: '/api/aci5-users',
      operationAccess: { list: true, read: true },
      permissionSchema: { name: true, orgId: true, teamSlug: true, managerId: true, region: true, targetKey: true },
    }).routes,
  );
  app.use(
    runtime.createRouter(ORG_MODEL, {
      basePath: '/api/aci5-orgs',
      operationAccess: { list: true, read: true, count: true },
      permissionSchema: { name: true, description: true, active: true },
    }).routes,
  );
  app.use(
    runtime.createRouter(TEAM_MODEL, {
      basePath: '/api/aci5-teams',
      operationAccess: { list: true, read: true },
      idField: 'slug',
      permissionSchema: { name: true, slug: true },
    }).routes,
  );
  app.use(
    runtime.createRouter(POST_MODEL, {
      basePath: '/api/aci5-posts',
      operationAccess: { list: true, read: true, count: true },
      permissionSchema: { authorId: true, reviewerId: true, title: true, createdAt: true, region: true, note: true },
    }).routes,
  );
  app.use(
    runtime.createRouter(GUARD_MODEL, {
      basePath: '/api/aci5-guard',
      operationAccess: { list: 'canListT', read: 'canReadT', count: 'canCountT' },
      permissionSchema: { label: true, targetKey: true, tenant: true, secret: true },
      baseFilter: {
        read: () => ({ tenant: 'read' }),
        list: () => ({ tenant: 'list' }),
        count: () => ({ tenant: 'count' }),
      },
    }).routes,
  );
  app.use(runtime.createRouter({ basePath: '/api/root', operationAccess: true }).routes);

  server = createServer(app);
  await new Promise<void>((resolve) => {
    server.listen(0, '127.0.0.1', () => resolve());
  });
  const address = server.address() as AddressInfo;
  adapter = createAdapter({ baseURL: `http://127.0.0.1:${address.port}/api` });

  services.userService = adapter.createModelService<Aci5User>({ modelName: USER_MODEL, basePath: 'aci5-users' });
  services.orgService = adapter.createModelService<Aci5Org>({ modelName: ORG_MODEL, basePath: 'aci5-orgs' });
  services.teamService = adapter.createModelService<Aci5Team>({ modelName: TEAM_MODEL, basePath: 'aci5-teams' });
  services.postService = adapter.createModelService<Aci5Post>({ modelName: POST_MODEL, basePath: 'aci5-posts' });
  services.guardService = adapter.createModelService<Aci5GuardTarget>({
    modelName: GUARD_MODEL,
    basePath: 'aci5-guard',
  });

  await seedDatabase();
}, MONGO_TIMEOUT);

beforeEach(async () => {
  protocolRequests.length = 0;
  await seedDatabase();
});

afterAll(async () => {
  if (server) {
    await new Promise<void>((resolve, reject) => {
      server.close((error) => {
        if (error) reject(error);
        else resolve();
      });
    });
  }
  if (mongoose.connection.readyState !== 0) {
    await mongoose.disconnect();
  }
  if (mongoServer) {
    await mongoServer.stop();
  }
}, MONGO_TIMEOUT);

/** Outer list parent carrying one include; rebuilt per execution (lazy requests are single-use). */
const outerList = (include: CorrelatedInclude) =>
  services.userService.listAdvanced({ name: 'u1' }, { select: ['name'], include: [include] });

const expectSingleDirectRequest = () => {
  expect(protocolRequests).toHaveLength(1);
  expect(protocolRequests[0]).toMatchObject({ method: 'POST', path: USER_PATH });
};

const expectSingleGroupedRequest = (wire: CorrelatedInclude | CorrelatedInclude[]) => {
  expect(protocolRequests).toHaveLength(1);
  expect(protocolRequests[0]).toMatchObject({ method: 'POST', path: ROOT_PATH });
  expect((protocolRequests[0].body as Array<{ args: { include: unknown } }>)[0].args.include).toEqual(
    Array.isArray(wire) ? wire : [wire],
  );
};

const expectOuterListWrapping = (result: {
  success: boolean;
  status: number;
  message: string;
  raw: unknown;
  data: unknown;
}) => {
  expect(result).toMatchObject({ success: true, status: 200, message: '' });
  expect(Array.isArray(result.raw)).toBe(true);
  expect(Array.isArray(result.data)).toBe(true);
};

interface SevenBuilderCase {
  name: string;
  build: () => CorrelatedInclude;
  raw: CorrelatedInclude;
  assertData: (rows: Array<Record<string, unknown>>) => void;
}

const sevenBuilderCases: SevenBuilderCase[] = [
  {
    name: 'read',
    build: () => services.orgService.read(parentField('orgId')).$include('org'),
    raw: { mode: 'correlated', model: ORG_MODEL, op: 'read', path: 'org', id: { $parent: 'orgId' } },
    assertData: (rows) => {
      expect(rows).toHaveLength(1);
      expect(rows[0].org).toMatchObject({ name: 'aci5-org-one' });
    },
  },
  {
    name: 'readAdvanced',
    build: () =>
      services.orgService.readAdvanced(parentField('orgId'), { select: ['name', 'description'] }).$include('org'),
    raw: {
      mode: 'correlated',
      model: ORG_MODEL,
      op: 'read',
      path: 'org',
      id: { $parent: 'orgId' },
      args: { select: ['name', 'description'] },
    },
    assertData: (rows) => {
      expect(rows).toHaveLength(1);
      expect(rows[0].org).toMatchObject({ name: 'aci5-org-one', description: 'first org' });
      expect(rows[0].org as Record<string, unknown>).not.toHaveProperty('active');
    },
  },
  {
    name: 'readAdvancedFilter',
    build: () =>
      services.orgService
        .readAdvancedFilter({ _id: parentField('orgId'), active: true }, { select: ['name'] })
        .$include('org'),
    raw: {
      mode: 'correlated',
      model: ORG_MODEL,
      op: 'read',
      path: 'org',
      filter: { _id: { $parent: 'orgId' }, active: true },
      args: { select: ['name'] },
    },
    assertData: (rows) => {
      expect(rows).toHaveLength(1);
      expect(rows[0].org).toMatchObject({ name: 'aci5-org-one' });
    },
  },
  {
    name: 'list',
    build: () =>
      services.postService.list({ limit: 2 }).$include('posts', { filter: { authorId: parentField('_id') } }),
    raw: {
      mode: 'correlated',
      model: POST_MODEL,
      op: 'list',
      path: 'posts',
      filter: { authorId: { $parent: '_id' } },
      args: { limit: 2 },
    },
    assertData: (rows) => {
      // Per-parent pagination: limit 2 applies to u1's posts, not the outer rows.
      expect(rows).toHaveLength(1);
      expect(rows[0].posts as unknown[]).toHaveLength(2);
    },
  },
  {
    name: 'listAdvanced',
    build: () =>
      services.postService
        .listAdvanced({ authorId: parentField('_id') }, { select: ['title'], sort: { createdAt: -1 }, limit: 5 })
        .$include('posts'),
    raw: {
      mode: 'correlated',
      model: POST_MODEL,
      op: 'list',
      path: 'posts',
      filter: { authorId: { $parent: '_id' } },
      args: { select: ['title'], sort: { createdAt: -1 }, limit: 5 },
    },
    assertData: (rows) => {
      expect(rows).toHaveLength(1);
      const posts = rows[0].posts as Array<Record<string, unknown>>;
      // u1 owns 5 posts; limit 5 with descending sort returns all, newest first.
      expect(posts.map((p) => p.title)).toEqual(['$special', 'u1-p1', 'u1-p2', 'u1-p3', 'note-post']);
      // Target projection omits the relationship field without losing association.
      for (const post of posts) {
        expect(post.authorId).toBeUndefined();
      }
    },
  },
  {
    name: 'count',
    build: () => services.postService.count().$include('postCount', { filter: { authorId: parentField('_id') } }),
    raw: {
      mode: 'correlated',
      model: POST_MODEL,
      op: 'count',
      path: 'postCount',
      filter: { authorId: { $parent: '_id' } },
    },
    assertData: (rows) => {
      expect(rows).toHaveLength(1);
      expect(rows[0].postCount).toBe(5);
    },
  },
  {
    name: 'countAdvanced',
    build: () => services.postService.countAdvanced({ authorId: parentField('_id') }).$include('postCount'),
    raw: {
      mode: 'correlated',
      model: POST_MODEL,
      op: 'count',
      path: 'postCount',
      filter: { authorId: { $parent: '_id' } },
    },
    assertData: (rows) => {
      expect(rows).toHaveLength(1);
      // Count semantics: independent of any list limit (u1 owns 5 posts).
      expect(rows[0].postCount).toBe(5);
    },
  },
];

describe('ACI-05 seven-builder real-server matrix', () => {
  describe.each(sevenBuilderCases)('$name', (sevenCase) => {
    it('converts to the agreed wire payload with zero inner dispatch', () => {
      const built = sevenCase.build();
      expect(built).toEqual(sevenCase.raw);
      // Conversion performed no HTTP: the recording middleware saw nothing.
      expect(protocolRequests).toHaveLength(0);
    });

    it('direct: descriptor and raw payloads produce equivalent data over one outer request', async () => {
      protocolRequests.length = 0;
      const builtResult = await outerList(sevenCase.build());
      expectSingleDirectRequest();
      expectOuterListWrapping(builtResult);
      sevenCase.assertData(builtResult.raw as Array<Record<string, unknown>>);

      protocolRequests.length = 0;
      const rawResult = await outerList(sevenCase.raw);
      expectSingleDirectRequest();
      expect(rawResult.raw).toEqual(builtResult.raw);
      sevenCase.assertData(rawResult.raw as Array<Record<string, unknown>>);
    });

    it('grouped: descriptor and raw payloads produce equivalent data over one root request', async () => {
      protocolRequests.length = 0;
      const [builtGrouped] = await adapter.group(outerList(sevenCase.build()));
      expectSingleGroupedRequest(sevenCase.build());
      expectOuterListWrapping(builtGrouped);
      sevenCase.assertData(builtGrouped.raw as Array<Record<string, unknown>>);

      protocolRequests.length = 0;
      const [rawGrouped] = await adapter.group(outerList(sevenCase.raw));
      expectSingleGroupedRequest(sevenCase.raw);
      expect(rawGrouped.raw).toEqual(builtGrouped.raw);
    });

    it('direct and grouped agree with outer response wrapping preserved', async () => {
      const direct = await outerList(sevenCase.build());
      const [grouped] = await adapter.group(outerList(sevenCase.build()));

      expect(direct).toMatchObject({ success: true, status: 200, message: '' });
      expect(grouped).toMatchObject({ success: true, status: 200, message: '' });
      expect(grouped.raw).toEqual(direct.raw);
      expect(grouped.headers).toEqual({});
    });
  });

  it('outer documents stay Model-wrapped while nested include data is plain', async () => {
    const built = sevenBuilderCases[0].build();
    const direct = await outerList(built);
    expect(direct.success).toBe(true);
    if (!direct.success) return;
    const outer = direct.data[0] as unknown as Record<string, unknown> & { save?: unknown };
    expect(typeof outer.save).toBe('function');
    const nested = outer.org as Record<string, unknown> & { save?: unknown };
    expect(nested).toMatchObject({ name: 'aci5-org-one' });
    expect(nested.save).toBeUndefined();
    expect(nested).toEqual((direct.raw as Array<Record<string, unknown>>)[0].org);
  });

  it('source reference fields resolve internally without leaking into a restrictive outer projection', async () => {
    // Outer select omits orgId, yet the read include still resolves.
    const include = services.orgService.read(parentField('orgId')).$include('org');
    const result = await outerList(include);
    expect(result.success).toBe(true);
    if (!result.success) return;
    const row = (result.raw as Array<Record<string, unknown>>)[0];
    expect(row.org).toMatchObject({ name: 'aci5-org-one' });
    expect(row).not.toHaveProperty('orgId');
    expect(row).toMatchObject({ name: 'u1' });
  });
});

describe('ACI-05 correlated query semantics over transport', () => {
  it('applies per-parent pagination independently to two parents', async () => {
    const buildOuter = (include: CorrelatedInclude) =>
      services.userService.listAdvanced(
        { name: { $in: ['u1', 'u2'] } },
        { select: ['name'], sort: { name: 1 }, include: [include] },
      );
    const include = services.postService
      .listAdvanced({ authorId: parentField('_id') }, { select: ['title'], sort: { createdAt: -1 }, limit: 2 })
      .$include('posts');

    const direct = await buildOuter(include);
    expectSingleDirectRequest();
    expect(direct.success).toBe(true);
    if (!direct.success) return;
    const rows = direct.raw as Array<Record<string, unknown>>;
    expect(rows).toHaveLength(2);
    const byName = Object.fromEntries(rows.map((r) => [r.name, r]));
    expect((byName.u1.posts as Array<{ title: string }>).map((p) => p.title)).toEqual(['$special', 'u1-p1']);
    expect((byName.u2.posts as Array<{ title: string }>).map((p) => p.title)).toEqual(['u2-p1', 'u2-p2']);

    protocolRequests.length = 0;
    const [grouped] = await adapter.group(buildOuter(include));
    expectSingleGroupedRequest(include);
    expect(grouped.raw).toEqual(direct.raw);
  });

  it('literal `$` strings and escaped marker-shaped objects round-trip correctly', async () => {
    const literal = services.postService
      .listAdvanced({ authorId: parentField('_id'), title: '$special' }, { select: ['title'] })
      .$include('literalMiss');
    const escaped = services.postService
      .listAdvanced({ authorId: parentField('_id'), note: { $eq: { $escape: { $parent: 'x' } } } } as never, {
        select: ['title', 'note'],
      })
      .$include('escaped');

    const direct = await services.userService.listAdvanced(
      { name: 'u1' },
      { select: ['name'], include: [literal, escaped] },
    );
    expectSingleDirectRequest();
    expect(direct.success).toBe(true);
    if (!direct.success) return;
    const row = (direct.raw as Array<Record<string, unknown>>)[0];
    // '$special' keeps its literal query meaning and matches the seeded post.
    expect(row.literalMiss).toEqual([expect.objectContaining({ title: '$special' })]);
    // The escape resolves to the literal object and matches the seeded note.
    expect(row.escaped).toEqual([expect.objectContaining({ title: 'note-post', note: { $parent: 'x' } })]);
    // The escape marker shape crossed the transport verbatim (never re-scanned).
    expect(protocolRequests[0].body).toMatchObject({
      include: expect.arrayContaining([
        expect.objectContaining({
          filter: expect.objectContaining({ note: { $eq: { $escape: { $parent: 'x' } } } }),
        }),
      ]),
    });

    protocolRequests.length = 0;
    const [grouped] = await adapter.group(
      services.userService.listAdvanced({ name: 'u1' }, { select: ['name'], include: [literal, escaped] }),
    );
    expect(grouped.raw).toEqual(direct.raw);
    expect(protocolRequests).toHaveLength(1);
  });

  it('nested references bind to the immediate parent when field names collide', async () => {
    // Outer User.region is 'outer-r1'; the u1-p1 Post.region is 'inner-rx'
    // (matching user u3). The nested owner read must resolve to u3, proving
    // immediate-parent binding rather than outer-parent binding (u1).
    const nested = services.userService
      .readAdvancedFilter({ region: parentField('region') }, { select: ['name'] })
      .$include('owner');
    const posts = services.postService
      .listAdvanced(
        { authorId: parentField('_id'), title: 'u1-p1' },
        { select: ['title', 'region'], include: [nested] },
      )
      .$include('posts');

    const direct = await outerList(posts);
    expectSingleDirectRequest();
    expect(direct.success).toBe(true);
    if (!direct.success) return;
    const row = (direct.raw as Array<Record<string, unknown>>)[0];
    const postDocs = row.posts as Array<Record<string, unknown>>;
    expect(postDocs).toHaveLength(1);
    expect(postDocs[0]).toMatchObject({ title: 'u1-p1', region: 'inner-rx' });
    expect(postDocs[0].owner).toMatchObject({ name: 'u3' });

    protocolRequests.length = 0;
    const [grouped] = await adapter.group(outerList(posts));
    expectSingleGroupedRequest(posts);
    expect(grouped.raw).toEqual(direct.raw);
  });

  it('custom identifiers resolve through the target idField (slug, not _id)', async () => {
    const include = services.teamService.read(parentField('teamSlug')).$include('team');

    const direct = await outerList(include);
    expectSingleDirectRequest();
    expect(direct.success).toBe(true);
    if (!direct.success) return;
    expect((direct.raw as Array<Record<string, unknown>>)[0].team).toMatchObject({
      name: 'aci5-team-one',
      slug: 'aci5-team-one-slug',
    });

    protocolRequests.length = 0;
    const [grouped] = await adapter.group(outerList(include));
    expectSingleGroupedRequest(include);
    expect(grouped.raw).toEqual(direct.raw);
  });

  it('missing references attach deterministic no-match shapes', async () => {
    const org = services.orgService.read(parentField('orgId')).$include('org');
    const posts = services.postService.listAdvanced({ authorId: parentField('_id') }).$include('posts');
    const postCount = services.postService.countAdvanced({ authorId: parentField('_id') }).$include('postCount');
    const buildOuter = (entries: CorrelatedInclude[]) =>
      services.userService.listAdvanced({ name: 'u4' }, { select: ['name'], include: entries });

    const direct = await buildOuter([org, posts, postCount]);
    expectSingleDirectRequest();
    expect(direct.success).toBe(true);
    if (!direct.success) return;
    expect((direct.raw as Array<Record<string, unknown>>)[0]).toMatchObject({
      name: 'u4',
      org: null,
      posts: [],
      postCount: 0,
    });

    protocolRequests.length = 0;
    const [grouped] = await adapter.group(buildOuter([org, posts, postCount]));
    expectSingleGroupedRequest([org, posts, postCount]);
    expect(grouped.raw).toEqual(direct.raw);
  });

  it('authorization failures are controlled errors in both direct and grouped execution', async () => {
    const readInc = services.guardService
      .readAdvancedFilter({ targetKey: parentField('targetKey') }, { select: ['label'] })
      .$include('target');
    const listInc = services.guardService
      .listAdvanced({ targetKey: parentField('targetKey') }, { select: ['label'] })
      .$include('targets');
    const countInc = services.guardService
      .countAdvanced({ targetKey: parentField('targetKey') })
      .$include('targetCount');

    // No `x-perms` header: read/list/count guards deny with 401 and the
    // whole parent request fails (no partial per-parent shapes).
    for (const include of [readInc, listInc, countInc]) {
      protocolRequests.length = 0;
      const direct = await outerList(include);
      expect(protocolRequests).toHaveLength(1);
      expect(direct).toMatchObject({ success: false, status: 401 });

      protocolRequests.length = 0;
      const [grouped] = await adapter.group(outerList(include));
      expect(protocolRequests).toHaveLength(1);
      expect(grouped).toMatchObject({ success: false, status: 401 });
      expect(grouped.data).toBeNull();
    }

    // Count uses explicit count access: list permission alone still denies.
    protocolRequests.length = 0;
    const listPermOnly = await services.userService.listAdvanced(
      { name: 'u1' },
      { select: ['name'], include: [countInc] },
      undefined,
      { headers: { 'x-perms': 'canListT' } },
    );
    expect(protocolRequests).toHaveLength(1);
    expect(listPermOnly).toMatchObject({ success: false, status: 401 });

    // With the correct permission the row filter applies and the read succeeds.
    protocolRequests.length = 0;
    const allowed = await services.userService.listAdvanced(
      { name: 'u1' },
      { select: ['name'], include: [readInc] },
      undefined,
      { headers: { 'x-perms': 'canReadT' } },
    );
    expect(protocolRequests).toHaveLength(1);
    expect(allowed.success).toBe(true);
    if (!allowed.success) return;
    expect((allowed.raw as Array<Record<string, unknown>>)[0].target).toMatchObject({ label: 'read-target' });
  });

  it('unknown target models fail with a controlled error in both executions', async () => {
    const bad = {
      mode: 'correlated',
      model: 'Aci5NoSuchModel',
      op: 'read',
      path: 'missing',
      id: { $parent: 'orgId' },
    } as unknown as CorrelatedInclude;

    protocolRequests.length = 0;
    const direct = await outerList(bad);
    expect(protocolRequests).toHaveLength(1);
    expect(direct).toMatchObject({ success: false, status: 400 });

    protocolRequests.length = 0;
    const [grouped] = await adapter.group(outerList(bad));
    expect(protocolRequests).toHaveLength(1);
    expect(grouped).toMatchObject({ success: false, status: 400 });
  });

  it('ordinary service calls without includes are unaffected', async () => {
    const direct = await services.userService.listAdvanced({ name: 'u1' }, { select: ['name'] });
    expect(direct).toMatchObject({ success: true, status: 200 });
    expect(protocolRequests).toHaveLength(1);
    if (!direct.success) return;
    expect(direct.raw).toEqual([expect.objectContaining({ name: 'u1' })]);
    expect(direct.raw as unknown[]).toHaveLength(1);
  });
});

describe('ACI-05 descriptor transport boundaries', () => {
  it('grouping carries include descriptors as data without dispatching inner calls', async () => {
    const include = services.orgService.read(parentField('orgId')).$include('org');
    protocolRequests.length = 0;
    const [grouped] = await adapter.group(outerList(include));
    // Exactly one root request: the inner descriptor traveled as data.
    expectSingleGroupedRequest(include);
    expect(grouped).toMatchObject({ success: true, status: 200 });
  });

  it('reference-bearing descriptors are rejected from grouping with zero HTTP', async () => {
    const descriptor = services.orgService.read(parentField('orgId'));
    protocolRequests.length = 0;
    await expect(adapter.group(descriptor as never)).rejects.toThrow(CorrelatedIncludeError);
    expect(protocolRequests).toHaveLength(0);
  });

  it('foreign-adapter descriptors are transport-inert and execute on the outer server', async () => {
    const foreign = createAdapter({ baseURL: 'http://foreign.invalid/api' });
    const foreignOrg = foreign.createModelService<Aci5Org>({ modelName: ORG_MODEL, basePath: 'orgs' });
    // No client-side same-adapter check: conversion captures model + query data only.
    const include = foreignOrg.read(parentField('orgId')).$include('org');
    expect(include).toEqual({
      mode: 'correlated',
      model: ORG_MODEL,
      op: 'read',
      path: 'org',
      id: { $parent: 'orgId' },
    });

    protocolRequests.length = 0;
    const direct = await outerList(include);
    expectSingleDirectRequest();
    expect(direct.success).toBe(true);
    if (!direct.success) return;
    expect((direct.raw as Array<Record<string, unknown>>)[0].org).toMatchObject({ name: 'aci5-org-one' });
  });

  it('unsupported operations do not advertise $include()', () => {
    expect('$include' in services.userService.create({ name: 'x' } as never)).toBe(false);
    expect('$include' in services.userService.update(seedState.u1Id, { name: 'x' } as never)).toBe(false);
    expect('$include' in services.userService.delete(seedState.u1Id)).toBe(false);
    expect('$include' in services.userService.distinct('name')).toBe(false);
    const dataService = adapter.createDataService<unknown>({ dataName: 'aci5-data', basePath: 'aci5-data' });
    expect('$include' in dataService.list()).toBe(false);
    // ...while all seven supported builders do.
    expect('$include' in services.userService.read(seedState.u1Id)).toBe(true);
    expect('$include' in services.userService.readAdvanced(seedState.u1Id)).toBe(true);
    expect('$include' in services.userService.readAdvancedFilter({ name: 'u1' })).toBe(true);
    expect('$include' in services.userService.list()).toBe(true);
    expect('$include' in services.userService.listAdvanced({ name: 'u1' })).toBe(true);
    expect('$include' in services.userService.count()).toBe(true);
    expect('$include' in services.userService.countAdvanced({ name: 'u1' })).toBe(true);
    expect(protocolRequests).toHaveLength(0);
  });
});
