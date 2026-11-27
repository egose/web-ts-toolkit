import { Mongoose, Schema } from 'mongoose';
import { describe, expect, expectTypeOf, it, vi } from 'vitest';

import {
  keycloakGroupSyncPlugin,
  type KeycloakGroupSyncPluginOptions,
  type KeycloakGroupSyncRole,
} from '../src/plugins/keycloak-group-sync';
import { normalizeKeycloakGroupSyncOptions, planKeycloakGroups } from '../src/plugins/keycloak-group-sync/planner';

const createOrgSchema = () =>
  new Schema({
    slug: { type: String, required: true, unique: true, immutable: true },
    description: String,
    keycloak: {
      groupId: String,
      roleGroupIds: { type: Map, of: String },
    },
  });

const baseOptions = () => ({
  client: { realm: vi.fn() } as unknown as KeycloakGroupSyncPluginOptions['client'],
  realm: 'application',
  paths: {
    name: 'slug',
    description: 'description',
    providerId: 'keycloak.groupId',
    roleGroupIds: 'keycloak.roleGroupIds',
  },
});

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
] as const satisfies readonly KeycloakGroupSyncRole[];

const expectedRoleGroups = [
  { key: 'admin', parentKey: null, name: 'admin', description: 'Organization administrators' },
  { key: 'member', parentKey: null, name: 'member', description: undefined },
  { key: 'engineering', parentKey: null, name: 'engineering', description: 'Engineering team' },
  { key: 'engineering/admin', parentKey: 'engineering', name: 'admin', description: 'Engineering administrators' },
  { key: 'engineering/platform', parentKey: 'engineering', name: 'platform', description: undefined },
  {
    key: 'engineering/platform/maintainer',
    parentKey: 'engineering/platform',
    name: 'maintainer',
    description: undefined,
  },
];

describe('keycloakGroupSyncPlugin configuration and planning', () => {
  it('registers the typed example without a roles schema path and plans all six subgroups parent-first', () => {
    const schema = createOrgSchema();
    const options = { ...baseOptions(), roles: exampleRoles } satisfies KeycloakGroupSyncPluginOptions;
    expect(schema.path('roles')).toBeUndefined();
    schema.plugin(keycloakGroupSyncPlugin, options);

    const config = normalizeKeycloakGroupSyncOptions(schema, options);
    expect(planKeycloakGroups(config, { slug: 'apple', description: 'Fruit company' })).toEqual({
      root: { name: 'apple', description: 'Fruit company' },
      roleGroups: expectedRoleGroups,
    });
  });

  it('registers a document-backed mixed role tree using the same nodes and accepts dotted single-subdocument paths', () => {
    const schema = new Schema({
      org: createOrgSchema().add({ catalog: [Schema.Types.Mixed] }),
    });
    const options = {
      ...baseOptions(),
      paths: {
        name: 'org.slug',
        description: 'org.description',
        providerId: 'org.keycloak.groupId',
        roleGroupIds: 'org.keycloak.roleGroupIds',
        roles: 'org.catalog',
      },
    } satisfies KeycloakGroupSyncPluginOptions;
    schema.plugin(keycloakGroupSyncPlugin, options);
    const Org = new Mongoose().model('GroupSyncConfigOrg', schema);
    const org = new Org({ org: { slug: 'apple', description: 'Fruit company', catalog: exampleRoles } });

    const config = normalizeKeycloakGroupSyncOptions(schema, options);
    options.paths.roles = 'other';
    expect(planKeycloakGroups(config, org.toObject())).toEqual({
      root: { name: 'apple', description: 'Fruit company' },
      roleGroups: expectedRoleGroups,
    });
    expectTypeOf<ReturnType<typeof baseOptions>>().not.toExtend<KeycloakGroupSyncPluginOptions>();
    expectTypeOf<typeof options & { roles: typeof exampleRoles }>().not.toExtend<KeycloakGroupSyncPluginOptions>();
  });

  it('copies the realm, paths and entire fixed tree at registration', () => {
    const children = ['admin'];
    const group = { name: 'engineering', description: 'Original', children };
    const options = { ...baseOptions(), roles: [group] };
    const config = normalizeKeycloakGroupSyncOptions(createOrgSchema(), options);

    const registeredClient = options.client;
    options.client = baseOptions().client;
    options.realm = 'other';
    options.paths.name = 'other';
    options.paths.roleGroupIds = 'other';
    group.name = 'other';
    group.description = 'Other';
    children.splice(0, 1, 'other');
    options.roles.splice(0, 1);

    expect(config.client).toBe(registeredClient);
    expect(config.realm).toBe('application');
    expect(config.paths.roleGroupIds).toBe('keycloak.roleGroupIds');
    expect(Object.isFrozen(config)).toBe(true);
    expect(Object.isFrozen(config.paths)).toBe(true);
    const plan = planKeycloakGroups(config, { slug: 'apple' });
    expect(plan.roleGroups).toEqual([
      { key: 'engineering', parentKey: null, name: 'engineering', description: 'Original' },
      { key: 'engineering/admin', parentKey: 'engineering', name: 'admin', description: undefined },
    ]);
    expect(Object.isFrozen(plan.roleGroups)).toBe(true);
    expect(plan.roleGroups.every(Object.isFrozen)).toBe(true);
  });

  it('supports root-only plans and distinguishes missing descriptions from explicit empty strings', () => {
    const options = baseOptions();
    const fixed = normalizeKeycloakGroupSyncOptions(createOrgSchema().remove('description'), {
      ...options,
      paths: { name: 'slug', providerId: 'keycloak.groupId', roleGroupIds: 'keycloak.roleGroupIds' },
      roles: [],
    });
    const documentBacked = normalizeKeycloakGroupSyncOptions(createOrgSchema().add({ catalog: [String] }), {
      ...options,
      paths: { ...options.paths, roles: 'catalog' },
    });
    const rootOnly = { root: { name: 'apple', description: undefined }, roleGroups: [] };
    expect(planKeycloakGroups(fixed, { slug: 'apple' })).toEqual(rootOnly);
    expect(planKeycloakGroups(documentBacked, { slug: 'apple' })).toEqual(rootOnly);
    expect(planKeycloakGroups(documentBacked, { slug: 'apple', catalog: null, description: null })).toEqual(rootOnly);
    expect(planKeycloakGroups(documentBacked, { slug: 'apple', catalog: [], description: '' })).toEqual({
      root: { name: 'apple', description: '' },
      roleGroups: [],
    });

    const withDescription = normalizeKeycloakGroupSyncOptions(createOrgSchema(), {
      ...options,
      roles: [{ name: 'ops', description: '' }],
    });
    expect(planKeycloakGroups(withDescription, { slug: 'apple' }).roleGroups[0].description).toBe('');
  });

  it.each([
    ['options', undefined, 'client'],
    ['client', { client: {} }, 'client'],
    ['realm', { realm: '  ' }, 'realm'],
    ['paths', { paths: null }, 'paths'],
    ['neither role source', { roles: undefined }, 'configure exactly one'],
    ['both role sources', { paths: { roles: 'catalog' } }, 'configure exactly one'],
  ])('rejects invalid registration: %s', (_case, overrides, message) => {
    const options = baseOptions();
    const invalidOptions = overrides === undefined ? undefined : { ...options, roles: [], ...overrides };
    expect(() =>
      createOrgSchema().plugin(keycloakGroupSyncPlugin, invalidOptions as KeycloakGroupSyncPluginOptions),
    ).toThrow(message);
    expect(options.client.realm).not.toHaveBeenCalled();
  });

  it.each([
    ['name', undefined],
    ['name', 'missing'],
    ['name', 'slugAlias'],
    ['name', 'slugVirtual'],
    ['name', 'sequence'],
    ['name', 'byName.arbitrary'],
    ['name', 'orgs.0.slug'],
    ['name', 'orgs.slug'],
    ['name', 'orgs.$.slug'],
    ['name', 'keycloak..groupId'],
    ['description', null],
    ['description', 'mixed.description'],
    ['description', 'sequence'],
    ['providerId', 'sequence'],
    ['providerId', 'slug'],
    ['providerId', 'description'],
    ['providerId', '_id'],
    ['providerId', 'revision'],
    ['roleGroupIds', 'keycloak'],
    ['roleGroupIds', 'keycloak.groupId'],
    ['roleGroupIds', 'numericMap'],
    ['roleGroupIds', 'mixedMap'],
    ['roles', 'missing'],
    ['roles', 'mixed'],
    ['roles', 'slug'],
  ])('rejects an invalid persisted path: %s = %j', (field, path) => {
    const schema = createOrgSchema().add({
      _id: String,
      revision: String,
      sequence: Number,
      mixed: Schema.Types.Mixed,
      orgs: [new Schema({ slug: String })],
      byName: { type: Map, of: String },
      numericMap: { type: Map, of: Number },
      mixedMap: Map,
    });
    schema.set('versionKey', 'revision');
    schema.alias('slug', 'slugAlias');
    schema.virtual('slugVirtual').get(() => 'apple');
    const options = baseOptions();
    const withPath = { ...options, paths: { ...options.paths, [field]: path } };
    const invalidOptions = field === 'roles' ? withPath : { ...withPath, roles: [] };
    expect(() => schema.plugin(keycloakGroupSyncPlugin, invalidOptions as KeycloakGroupSyncPluginOptions)).toThrow(
      `paths.${field}`,
    );
    expect(options.client.realm).not.toHaveBeenCalled();
  });

  it.each([
    '',
    '  ',
    ' apple',
    'apple ',
    'apple/admin',
    'a.b',
    '$admin',
    '__proto__',
    'constructor',
    'prototype',
    'a\0b',
  ])('rejects the invalid group name %j', (name) => {
    const options = baseOptions();
    const config = normalizeKeycloakGroupSyncOptions(createOrgSchema(), { ...options, roles: [] });
    expect(() => planKeycloakGroups(config, { slug: name })).toThrow('map-safe group name');
    expect(() => normalizeKeycloakGroupSyncOptions(createOrgSchema(), { ...options, roles: [name] })).toThrow(
      'map-safe group name',
    );
  });

  it.each([
    ['non-array source', { name: 'admin' }, 'expected an array'],
    ['malformed node', ['ok', null], 'expected a group name string or a role object'],
    ['missing name', ['ok', { description: 'no name' }], 'map-safe group name'],
    ['invalid description', ['ok', { name: 'admin', description: 42 }], 'expected a string description'],
    ['invalid children', ['ok', { name: 'admin', children: 'member' }], 'expected an array'],
    [
      'duplicate siblings',
      ['ok', { name: 'team', children: ['admin', { name: 'admin' }] }],
      'duplicate sibling group name',
    ],
    ['unsafe nested name', ['ok', { name: 'team', children: ['a/b'] }], 'map-safe group name'],
  ])('rejects a %s before returning any group plan for either source', (_case, roles, error) => {
    const options = baseOptions();
    const schema = createOrgSchema().add({ catalog: [Schema.Types.Mixed] });
    expect(() =>
      schema.plugin(keycloakGroupSyncPlugin, { ...options, roles } as KeycloakGroupSyncPluginOptions),
    ).toThrow(error);

    const config = normalizeKeycloakGroupSyncOptions(schema, {
      ...options,
      paths: { ...options.paths, roles: 'catalog' },
    });
    expect(() => planKeycloakGroups(config, { slug: 'apple', catalog: roles })).toThrow(error);
    expect(options.client.realm).not.toHaveBeenCalled();
  });

  it('rejects a non-string stored root description', () => {
    const config = normalizeKeycloakGroupSyncOptions(createOrgSchema(), { ...baseOptions(), roles: [] });
    expect(() => planKeycloakGroups(config, { slug: 'apple', description: 42 })).toThrow(
      'expected a string description',
    );
  });

  it('rejects cyclic trees and allows a shared branch to have distinct keys', () => {
    const options = baseOptions();
    const schema = createOrgSchema();
    const cycle: KeycloakGroupSyncRole[] = [];
    cycle.push({ name: 'cycle', children: cycle });
    expect(() => normalizeKeycloakGroupSyncOptions(schema, { ...options, roles: cycle })).toThrow('cyclic role tree');

    const children = [{ name: 'admin' }];
    const config = normalizeKeycloakGroupSyncOptions(schema, {
      ...options,
      roles: [
        { name: 'engineering', children },
        { name: 'sales', children },
      ],
    });
    expect(planKeycloakGroups(config, { slug: 'apple' }).roleGroups.map(({ key }) => key)).toEqual([
      'engineering',
      'engineering/admin',
      'sales',
      'sales/admin',
    ]);
  });

  it('bounds depth and total subgroup count, including intermediate groups', () => {
    const configFor = (roles: readonly KeycloakGroupSyncRole[]) =>
      normalizeKeycloakGroupSyncOptions(createOrgSchema(), { ...baseOptions(), roles });
    let chain: readonly KeycloakGroupSyncRole[] = [];
    for (let level = 16; level > 0; level--) chain = [{ name: `level${level}`, children: chain }];
    const subgroups = Array.from({ length: 499 }, (_, index) => `group${index}`);

    expect(planKeycloakGroups(configFor(chain), { slug: 'apple' }).roleGroups).toHaveLength(16);
    expect(() => configFor([{ name: 'outer', children: chain }])).toThrow('at most 16 subgroup levels');
    expect(
      planKeycloakGroups(configFor([{ name: 'outer', children: subgroups }]), { slug: 'apple' }).roleGroups,
    ).toHaveLength(500);
    expect(() => configFor([{ name: 'outer', children: subgroups }, 'oneMore'])).toThrow('at most 500 subgroups');
  });
});
