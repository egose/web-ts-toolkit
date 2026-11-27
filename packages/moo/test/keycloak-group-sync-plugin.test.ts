import mongoose from 'mongoose';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import {
  keycloakGroupSyncPlugin,
  type KeycloakGroupSyncPluginOptions,
  type KeycloakGroupSyncRole,
} from '../dist/plugins/keycloak-group-sync.mjs';
import { useMongoTestDatabase } from './setup';

useMongoTestDatabase();

const realm = 'application';
const ownerAttribute = 'moo.keycloakGroupSync.owner';
const paths = {
  name: 'slug',
  description: 'description',
  providerId: 'keycloak.groupId',
  roleGroupIds: 'keycloak.roleGroupIds',
};
const exampleRoles = [
  { name: 'admin', description: 'Organization administrators' },
  'member',
  {
    name: 'engineering',
    description: 'Engineering team',
    children: [
      { name: 'admin', description: 'Engineering administrators' },
      { name: 'platform', children: ['maintainer'] },
    ],
  },
] satisfies readonly KeycloakGroupSyncRole[];

type GroupPayload = { name: string; description?: string; attributes?: Record<string, string[]> };
type RemoteGroup = GroupPayload & { realm: string; id: string; parentId: string | null };
type GroupSearch = {
  realm: string;
  search: string;
  exact: boolean;
  briefRepresentation: boolean;
  first: number;
  max: number;
};

const httpError = (status: number) => Object.assign(new Error(`Keycloak HTTP ${status}`), { response: { status } });

function createKeycloakDouble() {
  const remote: RemoteGroup[] = [];
  let sequence = 0;
  const byId = (groupRealm: string, id: string) =>
    remote.find((group) => group.realm === groupRealm && group.id === id);
  function groupPath(group: RemoteGroup): string {
    const parentPath = group.parentId === null ? '' : groupPath(byId(group.realm, group.parentId)!);
    return `${parentPath}/${group.name}`;
  }
  function represent(group: RemoteGroup, brief = false) {
    const { id, name, description, parentId, attributes } = group;
    return structuredClone({
      id,
      name,
      description,
      parentId,
      path: groupPath(group),
      attributes: brief ? undefined : attributes,
    });
  }
  function seed(payload: GroupPayload, parentId: string | null = null, groupRealm = realm) {
    const group = { ...structuredClone(payload), realm: groupRealm, id: `group-${++sequence}`, parentId };
    remote.push(group);
    return group;
  }
  function create(payload: GroupPayload, parentId: string | null, groupRealm: string) {
    // The admin API interprets a POST with an ID as a move or update.
    if (Object.hasOwn(payload, 'id')) throw new Error('Unexpected ID in create payload');
    if (parentId !== null && !byId(groupRealm, parentId)) throw httpError(404);
    if (
      remote.some((group) => group.realm === groupRealm && group.parentId === parentId && group.name === payload.name)
    ) {
      throw httpError(409);
    }
    return { id: seed(payload, parentId, groupRealm).id };
  }
  function search(query: GroupSearch, parentId?: string) {
    return remote
      .filter((group) => group.realm === query.realm && (parentId === undefined || group.parentId === parentId))
      .filter((group) => (query.exact ? group.name === query.search : group.name.includes(query.search)))
      .slice(query.first, query.first + query.max)
      .map((group) => represent(group, query.briefRepresentation));
  }
  const groups = {
    find: vi.fn(async (query: GroupSearch & { populateHierarchy: boolean }) => {
      if (query.populateHierarchy) throw new Error('Unexpected hierarchical realm search');
      // Without a parent filter, exact search can return nested groups too.
      return search(query);
    }),
    listSubGroups: vi.fn(async (query: GroupSearch & { parentId: string }) => {
      if (!byId(query.realm, query.parentId)) throw httpError(404);
      return search(query, query.parentId);
    }),
    findOne: vi.fn(async ({ realm: groupRealm, id }: { realm: string; id: string }) => {
      const group = byId(groupRealm, id);
      return group ? represent(group) : null;
    }),
    create: vi.fn(async ({ realm: groupRealm, ...payload }: GroupPayload & { realm: string }) =>
      create(payload, null, groupRealm),
    ),
    createChildGroup: vi.fn(async ({ realm: groupRealm, id }: { realm: string; id: string }, payload: GroupPayload) =>
      create(payload, id, groupRealm),
    ),
    update: vi.fn(async ({ realm: groupRealm, id }: { realm: string; id: string }, payload: GroupPayload) => {
      const group = byId(groupRealm, id);
      if (!group) throw httpError(404);
      if (!payload.name) throw httpError(400);
      Object.assign(group, structuredClone(payload));
    }),
    del: vi.fn(async () => {
      throw new Error('Unexpected deletion');
    }),
  };
  const client = { realm: vi.fn(), core: { groups } } as unknown as KeycloakGroupSyncPluginOptions['client'];

  return {
    client,
    groups,
    remote,
    seed,
    writes: () => [
      ...groups.create.mock.calls,
      ...groups.createChildGroup.mock.calls,
      ...groups.update.mock.calls,
      ...groups.del.mock.calls,
    ],
    at: (path: string) => remote.find((group) => group.realm === realm && groupPath(group) === path)!,
    paths: () => remote.map(groupPath),
  };
}

type LocalOrg = {
  slug: string;
  label?: string;
  description?: string | null;
  catalog?: KeycloakGroupSyncRole[] | null;
  keycloak?: { groupId?: string | null; roleGroupIds?: Map<string, string | null> | null; note?: string } | null;
};

function createOrgSchema({ hidden = false, persistedRoles = false } = {}) {
  const schema = new mongoose.Schema<LocalOrg>({
    slug: { type: String, required: true, select: !hidden },
    label: String,
    description: { type: String, select: !hidden },
    keycloak: {
      groupId: { type: String, select: !hidden },
      roleGroupIds: { type: Map, of: String, default: () => new Map(), select: !hidden },
      note: String,
    },
  });
  if (persistedRoles)
    schema.add({ catalog: { type: [mongoose.Schema.Types.Mixed], default: undefined, select: !hidden } });
  return schema;
}

describe('keycloakGroupSyncPlugin', () => {
  let keycloak: ReturnType<typeof createKeycloakDouble>;

  beforeEach(() => {
    keycloak = createKeycloakDouble();
  });

  function createOrgModel({
    hidden = false,
    roles = exampleRoles as readonly KeycloakGroupSyncRole[],
    persistedRoles = false,
  } = {}) {
    const schema = createOrgSchema({ hidden, persistedRoles });
    const base = { client: keycloak.client, realm, paths };
    schema.plugin(
      keycloakGroupSyncPlugin,
      persistedRoles ? { ...base, paths: { ...paths, roles: 'catalog' } } : { ...base, roles },
    );
    return mongoose.model(`KeycloakGroupSyncOrg${mongoose.modelNames().length}`, schema);
  }

  it('provisions the fixed tree parent first, stores each relative key, and writes nothing on unchanged saves', async () => {
    const Org = createOrgModel();
    expect(Org.schema.path('catalog')).toBeUndefined();
    const org = await Org.create({ slug: 'apple', description: 'Fruit company' });
    const roleKeys = [
      'admin',
      'member',
      'engineering',
      'engineering/admin',
      'engineering/platform',
      'engineering/platform/maintainer',
    ];
    const expectedIds = new Map(roleKeys.map((role) => [role, keycloak.at(`/apple/${role}`).id]));
    const root = keycloak.at('/apple');
    const owner = root.attributes?.[ownerAttribute];
    expect(owner).toEqual([expect.stringMatching(/^v1:[a-f0-9]{64}$/)]);
    expect(keycloak.paths()).toEqual(['/apple', ...roleKeys.map((role) => `/apple/${role}`)]);
    expect(keycloak.groups.create).toHaveBeenCalledWith({
      realm,
      name: 'apple',
      description: 'Fruit company',
      attributes: { [ownerAttribute]: owner },
    });
    expect(keycloak.groups.createChildGroup).toHaveBeenCalledWith(
      { realm, id: keycloak.at('/apple/engineering').id },
      {
        name: 'admin',
        description: 'Engineering administrators',
        attributes: { [ownerAttribute]: owner },
      },
    );
    expect(keycloak.remote.every((group) => group.attributes?.[ownerAttribute]?.[0] === owner?.[0])).toBe(true);
    expect(expectedIds.get('admin')).not.toBe(expectedIds.get('engineering/admin'));
    expect(org.keycloak?.groupId).toBe(root.id);
    expect(new Map(org.keycloak?.roleGroupIds ?? [])).toEqual(expectedIds);
    expect(org.isModified()).toBe(false);
    const fresh = await Org.findById(org._id).orFail();
    expect(fresh.keycloak?.groupId).toBe(root.id);
    expect(new Map(fresh.keycloak?.roleGroupIds ?? [])).toEqual(expectedIds);

    const writes = keycloak.writes();
    await org.save();
    await fresh.save();
    expect(keycloak.writes()).toEqual(writes);
  });

  it('updates only supplied native descriptions by ID, supports clearing, and leaves removed roles in place', async () => {
    const Org = createOrgModel({ persistedRoles: true });
    const org = await Org.create({
      slug: 'apple',
      description: 'Fruit',
      catalog: ['retired', { name: 'admin', description: 'Old' }],
    });
    const root = keycloak.at('/apple');
    const admin = keycloak.at('/apple/admin');
    root.attributes!.custom = ['keep root'];
    admin.attributes!.custom = ['keep admin'];
    const attributes = structuredClone(admin.attributes);

    org.description = undefined;
    org.catalog = [{ name: 'admin', description: 'New' }];
    await org.save();
    expect(root.description).toBe('Fruit');
    expect(keycloak.groups.update.mock.calls).toEqual([
      [
        { realm, id: admin.id },
        { name: 'admin', description: 'New' },
      ],
    ]);
    expect(admin.attributes).toEqual(attributes);
    expect(org.keycloak?.roleGroupIds?.get('retired')).toBe(keycloak.at('/apple/retired').id);

    org.description = '';
    org.catalog = [{ name: 'admin', description: '' }];
    await org.save();
    expect(root.description).toBe('');
    expect(admin.description).toBe('');
    expect(root.attributes?.custom).toEqual(['keep root']);
    org.description = null;
    org.catalog = ['admin'];
    const writes = keycloak.writes();
    await org.save();
    expect(keycloak.writes()).toEqual(writes);
    expect(keycloak.paths()).toEqual(['/apple', '/apple/retired', '/apple/admin']);
    await org.deleteOne();
    expect(keycloak.writes()).toEqual(writes);
  });

  it('reconciles from current stored fields when slug, catalog, description and bindings were excluded', async () => {
    const Org = createOrgModel({ persistedRoles: true, hidden: true });
    const org = await Org.create({ slug: 'apple', label: 'old', description: 'Old', catalog: ['admin'] });
    const projected = await Org.findById(org._id).select('label').orFail();
    expect(projected.slug).toBeUndefined();
    expect(projected.description).toBeUndefined();
    expect(projected.catalog).toBeUndefined();
    expect(projected.keycloak?.roleGroupIds).toBeUndefined();

    await Org.updateOne(
      { _id: org._id },
      { description: 'Current', catalog: [{ name: 'engineering', children: ['admin'] }] },
    );
    projected.label = 'changed';
    const saved = await projected.save();
    expect(saved.description).toBeUndefined();
    expect(saved.keycloak?.groupId).toBe(keycloak.at('/apple').id);
    expect(saved.keycloak?.roleGroupIds?.get('engineering/admin')).toBe(keycloak.at('/apple/engineering/admin').id);
    expect(keycloak.at('/apple').description).toBe('Current');
    expect(saved.isModified()).toBe(false);

    const fresh = await Org.findById(org._id).select('+keycloak.groupId +keycloak.roleGroupIds').orFail();
    expect(fresh.label).toBe('changed');
    expect(fresh.keycloak?.groupId).toBe(saved.keycloak?.groupId);
    expect(new Map(fresh.keycloak?.roleGroupIds ?? [])).toEqual(new Map(saved.keycloak?.roleGroupIds ?? []));

    saved.label = 'saved again';
    await Org.collection.updateOne({ _id: saved._id }, { $set: { 'keycloak.roleGroupIds.unrelated': 'keep' } });
    await saved.save();
    expect(saved.keycloak?.roleGroupIds?.get('unrelated')).toBe('keep');
  });

  it('reflects bindings in a projected single nested subdocument without setters or dirty paths', async () => {
    const identity = new mongoose.Schema({
      slug: String,
      groupId: { type: String, immutable: true, set: (value: string) => `modified-${value}` },
      roleGroupIds: { type: Map, of: { type: String, set: (value: string) => `modified-${value}` } },
      secret: String,
    });
    const schema = new mongoose.Schema({ label: String, organization: identity });
    schema.plugin(keycloakGroupSyncPlugin, {
      client: keycloak.client,
      realm,
      roles: ['member'],
      paths: {
        name: 'organization.slug',
        providerId: 'organization.groupId',
        roleGroupIds: 'organization.roleGroupIds',
      },
    });
    const Org = mongoose.model('KeycloakGroupSyncSingleNested', schema);
    const org = await Org.create({ label: 'old', organization: { slug: 'apple', secret: 'keep' } });
    expect(org.organization?.groupId).toBe(keycloak.at('/apple').id);
    expect(org.organization?.roleGroupIds?.get('member')).toBe(keycloak.at('/apple/member').id);

    const projected = await Org.findById(org._id).select('label').orFail();
    projected.label = 'new';
    await projected.save();
    expect(projected.organization?.groupId).toBe(org.organization?.groupId);
    expect(projected.organization?.roleGroupIds?.get('member')).toBe(org.organization?.roleGroupIds?.get('member'));
    expect(projected.get('organization._id')).toEqual(org.get('organization._id'));
    expect(projected.organization?.secret).toBeUndefined();
    expect(projected.isModified()).toBe(false);
    projected.organization!.roleGroupIds!.set('member', 'forged');
    await expect(projected.save()).rejects.toThrow('server-controlled');
    expect((await Org.findById(org._id).orFail()).organization?.secret).toBe('keep');
  });

  it.each([
    ['null container', null],
    ['null map', { groupId: null, roleGroupIds: null, note: 'keep' }],
    ['null entry', { groupId: null, roleGroupIds: { member: null, retired: 'keep' } }],
    ['missing container', undefined],
  ])('can save legacy documents with a %s', async (_case, keycloakState) => {
    const Org = createOrgModel({ roles: ['member'] });
    const { insertedId } = await Org.collection.insertOne({
      slug: 'apple',
      ...(keycloakState === undefined ? {} : { keycloak: keycloakState }),
    });
    const org = await Org.findById(insertedId).orFail();
    await org.save();
    expect(org.keycloak?.groupId).toBe(keycloak.at('/apple').id);
    expect(org.keycloak?.roleGroupIds?.get('member')).toBe(keycloak.at('/apple/member').id);
    const raw = await Org.collection.findOne({ _id: insertedId });
    expect(raw?.keycloak).toMatchObject({
      groupId: keycloak.at('/apple').id,
      roleGroupIds: { member: keycloak.at('/apple/member').id },
    });
    if (keycloakState && 'note' in keycloakState) expect(raw?.keycloak?.note).toBe('keep');
    if (keycloakState?.roleGroupIds) expect(raw?.keycloak?.roleGroupIds).toHaveProperty('retired', 'keep');
  });

  it('guards stable slug, root ID, and map or ancestor edits before persistence', async () => {
    const Org = createOrgModel({ roles: ['member'] });
    await expect(Org.create({ slug: 'apple/other' })).rejects.toThrow('map-safe group name');
    await expect(Org.create({ slug: 'apple', keycloak: { groupId: 'forged' } })).rejects.toThrow('server-controlled');
    await expect(Org.create({ slug: 'apple', keycloak: { roleGroupIds: { member: 'forged' } } })).rejects.toThrow(
      'server-controlled',
    );
    expect(await Org.countDocuments()).toBe(0);
    expect(keycloak.writes()).toEqual([]);

    const org = await Org.create({ slug: 'apple', label: 'keep' });
    const writes = keycloak.writes();
    const renamed = await Org.findById(org._id).select('label').orFail();
    renamed.slug = 'banana';
    await expect(renamed.save()).rejects.toThrow('stable organization identity');

    const reassigned = await Org.findById(org._id).orFail();
    reassigned.keycloak!.groupId = undefined;
    await expect(reassigned.save()).rejects.toThrow('server-controlled');
    const replaced = await Org.findById(org._id).select('label').orFail();
    replaced.set('keycloak', { note: 'would replace bindings' });
    await expect(replaced.save()).rejects.toThrow('server-controlled');
    const modifiedMap = await Org.findById(org._id).select('keycloak.roleGroupIds.member').orFail();
    modifiedMap.keycloak!.roleGroupIds!.clear();
    await expect(modifiedMap.save()).rejects.toThrow('server-controlled');

    const fresh = await Org.findById(org._id).orFail();
    fresh.set('keycloak.note', 'sibling write');
    await fresh.save();
    expect(fresh.slug).toBe('apple');
    expect(fresh.keycloak?.groupId).toBe(org.keycloak?.groupId);
    expect(fresh.keycloak?.roleGroupIds?.get('member')).toBe(org.keycloak?.roleGroupIds?.get('member'));
    expect((await Org.findById(org._id).orFail()).keycloak?.note).toBe('sibling write');
    expect(keycloak.writes()).toEqual(writes);
  });

  it('validates the whole stored catalog before creating any remote group', async () => {
    const Org = createOrgModel({ persistedRoles: true });
    await expect(
      Org.create({ slug: 'apple', catalog: ['valid', { name: 'engineering', children: ['ops', 'ops'] }] }),
    ).rejects.toThrow('duplicate sibling');
    expect(await Org.countDocuments()).toBe(1);
    expect(keycloak.writes()).toEqual([]);
  });

  it('rejects explicit save and create sessions and sessions attached to documents before writing', async () => {
    const Org = createOrgModel();
    const [org] = await Org.insertMany([{ slug: 'apple', label: 'keep' }]);
    const session = await Org.startSession();
    try {
      await expect(new Org({ slug: 'explicit' }).save({ session })).rejects.toThrow('sessions or transactions');
      await expect(Org.create([{ slug: 'create' }], { session })).rejects.toThrow('sessions or transactions');
      const fromSession = await Org.findById(org._id).session(session).orFail();
      fromSession.label = 'changed';
      await expect(fromSession.save()).rejects.toThrow('sessions or transactions');
      expect((await Org.findById(org._id).orFail()).label).toBe('keep');
      expect(await Org.countDocuments()).toBe(1);
      expect(keycloak.writes()).toEqual([]);
    } finally {
      await session.endSession();
    }
  });

  const [mongooseMajor, mongooseMinor] = mongoose.version.split('.').map(Number);
  it.skipIf(mongooseMajor === 8 && mongooseMinor < 4)(
    'rejects ambient Mongoose transactions before writing',
    async () => {
      const Org = createOrgModel();
      mongoose.set('transactionAsyncLocalStorage', true);
      try {
        await expect(
          Org.db.transaction(async () => {
            const org = new Org({ slug: 'apple' });
            expect(org.$session()).toBeNull();
            await org.save();
          }),
        ).rejects.toThrow('sessions or transactions');
        expect(await Org.countDocuments()).toBe(0);
        expect(keycloak.writes()).toEqual([]);
      } finally {
        mongoose.set('transactionAsyncLocalStorage', false);
      }
    },
  );

  it('bypasses query and bulk operations, including Mongoose bulkSave save hooks', async () => {
    const Org = createOrgModel();
    const [org] = await Org.insertMany([{ slug: 'apple' }]);
    await Org.updateOne({ _id: org._id }, { label: 'query' });
    await Org.findOneAndUpdate({ _id: org._id }, { label: 'find-and-update' });
    await Org.bulkWrite([{ insertOne: { document: { slug: 'bulk-write' } } }]);
    await Org.bulkSave([new Org({ slug: 'bulk-save' })], { timestamps: false });
    expect(await Org.countDocuments()).toBe(3);
    expect(keycloak.writes()).toEqual([]);
    expect(keycloak.groups.find).not.toHaveBeenCalled();
    await org.save();
    expect(keycloak.at('/apple').id).toBe(org.keycloak?.groupId);
  });

  it('rejects duplicate plugin registration on the same schema', () => {
    const schema = createOrgSchema();
    const options = { client: keycloak.client, realm, paths, roles: [] };
    schema.plugin(keycloakGroupSyncPlugin, options);
    expect(() => schema.plugin(keycloakGroupSyncPlugin, options)).toThrow('already registered');
  });

  it('fails a missing or out-of-realm stored root binding even if the expected path has an owned replacement', async () => {
    const Org = createOrgModel({ roles: [] });
    const org = await Org.create({ slug: 'apple', description: 'Old' });
    const original = keycloak.at('/apple');
    original.realm = 'other';
    const replacement = keycloak.seed({ name: 'apple', description: 'Other', attributes: original.attributes });
    org.description = 'New';
    const writes = keycloak.writes();
    await expect(org.save()).rejects.toThrow('stored group ID does not identify the owned group');
    expect((await Org.findById(org._id).orFail()).keycloak?.groupId).toBe(original.id);
    expect((await Org.findById(org._id).orFail()).description).toBe('New');
    expect(replacement.description).toBe('Other');
    expect(keycloak.writes()).toEqual(writes);
  });

  it('rejects a stored ID at the exact path if its owner marker has changed', async () => {
    const Org = createOrgModel({ roles: [] });
    const org = await Org.create({ slug: 'apple', description: 'Original' });
    const group = keycloak.at('/apple');
    group.attributes![ownerAttribute].push('another owner');
    org.description = 'Changed';
    await expect(org.save()).rejects.toThrow('stored group ID does not identify the owned group');
    expect(group.description).toBe('Original');
    expect((await Org.findById(org._id).orFail()).keycloak?.groupId).toBe(group.id);
    expect(keycloak.groups.update).not.toHaveBeenCalled();
  });

  it('fails closed when a subgroup binding points to the same owned leaf name under another parent', async () => {
    const Org = createOrgModel({ persistedRoles: true });
    const org = await Org.create({ slug: 'apple', catalog: ['admin', { name: 'engineering', children: ['admin'] }] });
    const other = keycloak.at('/apple/engineering/admin');
    await Org.collection.updateOne({ _id: org._id }, { $set: { 'keycloak.roleGroupIds.admin': other.id } });
    org.catalog = [
      { name: 'admin', description: 'Should not update' },
      { name: 'engineering', children: ['admin'] },
    ];
    const writes = keycloak.writes();
    await expect(org.save()).rejects.toThrow('stored group ID does not identify the owned group');
    expect((await Org.findById(org._id).orFail()).keycloak?.roleGroupIds?.get('admin')).toBe(other.id);
    expect(other.description).toBeUndefined();
    expect(keycloak.writes()).toEqual(writes);
  });

  it('does not adopt an unowned root or a group owned by the same BSON ID in another collection', async () => {
    const Org = createOrgModel({ roles: [] });
    const unmanaged = keycloak.seed({
      name: 'unmanaged',
      description: 'Do not touch',
      attributes: { custom: ['keep'] },
    });
    await expect(Org.create({ slug: 'unmanaged', description: 'Overwrite' })).rejects.toThrow(
      'does not identify the owned group',
    );
    expect((await Org.findOne({ slug: 'unmanaged' }).orFail()).keycloak?.groupId).toBeUndefined();
    expect(unmanaged.description).toBe('Do not touch');
    expect(keycloak.writes()).toEqual([]);

    const original = await Org.create({ slug: 'apple' });
    const OtherOrg = createOrgModel({ roles: [] });
    await expect(OtherOrg.create({ _id: original._id, slug: 'apple', description: 'Overwrite' })).rejects.toThrow(
      'does not identify the owned group',
    );
    expect((await OtherOrg.findById(original._id).orFail()).keycloak?.groupId).toBeUndefined();
    expect(keycloak.groups.update).not.toHaveBeenCalled();
    expect(keycloak.groups.create).toHaveBeenCalledTimes(1);
  });

  it('rechecks owner and parent after a child create conflict and leaves the unmanaged child alone', async () => {
    const Org = createOrgModel({ roles: [{ name: 'member', description: 'Desired' }] });
    keycloak.groups.createChildGroup.mockImplementationOnce(async ({ id }, { name }) => {
      keycloak.seed({ name, description: 'Unmanaged' }, id);
      throw httpError(409);
    });
    await expect(Org.create({ slug: 'apple' })).rejects.toThrow('does not identify the owned group');
    const org = await Org.findOne({ slug: 'apple' }).orFail();
    expect(org.keycloak?.groupId).toBe(keycloak.at('/apple').id);
    expect(org.keycloak?.roleGroupIds?.get('member')).toBeUndefined();
    expect(keycloak.at('/apple/member').description).toBe('Unmanaged');
    expect(keycloak.groups.listSubGroups).toHaveBeenCalledTimes(2);
    expect(keycloak.groups.update).not.toHaveBeenCalled();
  });

  it('recovers root creation when the response was lost and a fresh unchanged save retries', async () => {
    const Org = createOrgModel({ roles: ['member'] });
    const create = keycloak.groups.create.getMockImplementation()!;
    const error = new Error('Connection lost after Keycloak created the root');
    keycloak.groups.create.mockImplementationOnce(async (payload) => {
      await create(payload);
      throw error;
    });
    await expect(Org.create({ slug: 'apple' })).rejects.toBe(error);
    const fresh = await Org.findOne({ slug: 'apple' }).orFail();
    expect(fresh.keycloak?.groupId).toBeUndefined();
    await fresh.save();
    expect(fresh.keycloak?.groupId).toBe(keycloak.at('/apple').id);
    expect(fresh.keycloak?.roleGroupIds?.get('member')).toBe(keycloak.at('/apple/member').id);
    expect(keycloak.groups.create).toHaveBeenCalledTimes(1);
    expect(keycloak.paths()).toEqual(['/apple', '/apple/member']);
  });

  it('retries a failed child binding write and preserves groups and IDs already resolved', async () => {
    const Org = createOrgModel({ roles: ['admin', { name: 'engineering~', children: ['member'] }] });
    const update = Org.collection.updateOne.bind(Org.collection);
    const error = new Error('MongoDB binding write failed');
    const spy = vi.spyOn(Org.collection, 'updateOne').mockImplementation(async (filter, operation, options) => {
      if (Array.isArray(operation) && Object.hasOwn(operation[0].$set, 'keycloak.roleGroupIds.engineering~/member'))
        throw error;
      return update(filter, operation, options);
    });
    try {
      await expect(Org.create({ slug: 'apple' })).rejects.toBe(error);
    } finally {
      spy.mockRestore();
    }
    const fresh = await Org.findOne({ slug: 'apple' }).orFail();
    const rootId = fresh.keycloak?.groupId;
    const adminId = fresh.keycloak?.roleGroupIds?.get('admin');
    expect(rootId).toBe(keycloak.at('/apple').id);
    expect(adminId).toBe(keycloak.at('/apple/admin').id);
    expect(fresh.keycloak?.roleGroupIds?.get('engineering~/member')).toBeUndefined();
    const writes = keycloak.writes();
    await fresh.save();
    expect(fresh.keycloak?.groupId).toBe(rootId);
    expect(fresh.keycloak?.roleGroupIds?.get('admin')).toBe(adminId);
    expect(fresh.keycloak?.roleGroupIds?.get('engineering~/member')).toBe(keycloak.at('/apple/engineering~/member').id);
    expect(keycloak.writes()).toEqual(writes);
  });

  it('converges when concurrent saves hit root and child create conflicts without losing unrelated map entries', async () => {
    const Org = createOrgModel({ roles: ['member'] });
    const [org] = await Org.insertMany([{ slug: 'apple', keycloak: { roleGroupIds: { retired: 'keep' } } }]);
    const projections = await Promise.all(
      ['label', 'description'].map((projection) => Org.findById(org._id).select(projection).orFail()),
    );
    const rootBarrier = Promise.withResolvers<void>();
    const create = keycloak.groups.create.getMockImplementation()!;
    keycloak.groups.create.mockImplementation(async (payload) => {
      if (keycloak.groups.create.mock.calls.length === 2) rootBarrier.resolve();
      await rootBarrier.promise;
      return create(payload);
    });
    const childBarrier = Promise.withResolvers<void>();
    const createChild = keycloak.groups.createChildGroup.getMockImplementation()!;
    keycloak.groups.createChildGroup.mockImplementation(async (query, payload) => {
      if (keycloak.groups.createChildGroup.mock.calls.length === 2) {
        // Another branch can be bound after both reconciliations read the map.
        await Org.collection.updateOne({ _id: org._id }, { $set: { 'keycloak.roleGroupIds.late': 'keep too' } });
        childBarrier.resolve();
      }
      await childBarrier.promise;
      return createChild(query, payload);
    });
    const [first, second] = await Promise.all(projections.map((document) => document.save()));

    expect(keycloak.groups.create).toHaveBeenCalledTimes(2);
    expect(keycloak.groups.createChildGroup).toHaveBeenCalledTimes(2);
    expect(keycloak.paths()).toEqual(['/apple', '/apple/member']);
    const fresh = await Org.findById(org._id).orFail();
    for (const doc of [first, second, fresh]) {
      expect(doc.keycloak?.groupId).toBe(keycloak.at('/apple').id);
      expect(doc.keycloak?.roleGroupIds?.get('member')).toBe(keycloak.at('/apple/member').id);
      expect(doc.keycloak?.roleGroupIds?.get('retired')).toBe('keep');
      expect(doc.keycloak?.roleGroupIds?.get('late')).toBe('keep too');
    }
  });

  it('fails a conditional binding write if another writer installed a different ID', async () => {
    const Org = createOrgModel({ roles: ['member'] });
    const update = Org.collection.updateOne.bind(Org.collection);
    const spy = vi.spyOn(Org.collection, 'updateOne').mockImplementation(async (filter, operation, options) => {
      if (Array.isArray(operation) && Object.hasOwn(operation[0].$set, 'keycloak.roleGroupIds.member')) {
        const org = await Org.findOne({ slug: 'apple' }).orFail();
        await update(
          { _id: org._id },
          { $set: { 'keycloak.roleGroupIds.member': 'different', 'keycloak.roleGroupIds.retired': 'keep' } },
        );
      }
      return update(filter, operation, options);
    });
    try {
      await expect(Org.create({ slug: 'apple' })).rejects.toThrow('the binding changed');
    } finally {
      spy.mockRestore();
    }
    const fresh = await Org.findOne({ slug: 'apple' }).orFail();
    expect(fresh.keycloak?.groupId).toBe(keycloak.at('/apple').id);
    expect(fresh.keycloak?.roleGroupIds?.get('member')).toBe('different');
    expect(fresh.keycloak?.roleGroupIds?.get('retired')).toBe('keep');
    const writes = keycloak.writes();
    await expect(fresh.save()).rejects.toThrow('stored group ID does not identify the owned group');
    expect(keycloak.writes()).toEqual(writes);
  });
});
