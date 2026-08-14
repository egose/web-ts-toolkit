import { describe, expect, it } from 'vitest';
import type { RootQueryEntry } from '@web-ts-toolkit/access-router';
import type { DataRequest, ModelRequest } from '../src';

import { setupIntegrationSuite } from './support/integration-suite';

const suite = setupIntegrationSuite();
const { services, seedState } = suite;

type Execution = 'direct' | 'grouped';
type ExecutableRequest = ModelRequest<unknown> | DataRequest<unknown>;
type ResultShape = 'list' | 'single' | 'draft' | 'string' | 'number' | 'sub-list';

interface ProtocolCase {
  name: string;
  request: (execution: Execution) => ExecutableRequest;
  directWire: (execution: Execution) => {
    method: string;
    path: string;
    query: Record<string, unknown>;
    body: unknown;
  };
  rootEntry: (execution: Execution) => RootQueryEntry;
  status: number;
  shape: ResultShape;
}

const MODEL_NAME = 'AdapterJsIntegrationUser';
const DATA_NAME = 'pet-data';
const noBody = undefined;

const parentId = (execution: Execution) => String(execution === 'direct' ? seedState.admin._id : seedState.lucy2._id);
const subId = (execution: Execution) =>
  String(execution === 'direct' ? seedState.admin.statusHistory[0]._id : seedState.lucy2.statusHistory[0]._id);
const subs = (execution: Execution) => services.userService.id(parentId(execution)).subs('statusHistory');
const modelEntry = <T extends RootQueryEntry>(entry: Omit<T, 'target' | 'name'>): T =>
  ({ target: 'model', name: MODEL_NAME, ...entry }) as T;
const dataEntry = <T extends RootQueryEntry>(entry: Omit<T, 'target' | 'name'>): T =>
  ({ target: 'data', name: DATA_NAME, ...entry }) as T;

const protocolCases: ProtocolCase[] = [
  {
    name: 'model.list',
    request: () => services.userService.list({ limit: 1 }, { includeCount: true }),
    directWire: () => ({
      method: 'GET',
      path: '/api/users',
      query: {
        limit: '1',
        skim: 'true',
        include_permissions: 'false',
        include_count: 'true',
        include_extra_headers: 'false',
      },
      body: noBody,
    }),
    rootEntry: () =>
      modelEntry({
        op: 'list',
        filter: {},
        args: { limit: 1 },
        options: { skim: true, includePermissions: false, includeCount: true },
      }),
    status: 200,
    shape: 'list',
  },
  {
    name: 'model.listAdvanced',
    request: () =>
      services.userService.listAdvanced(
        { public: true },
        { select: ['name', 'role'], sort: 'name', limit: 1 },
        { skim: false, includePermissions: true, includeCount: true },
      ),
    directWire: () => ({
      method: 'POST',
      path: '/api/users/__query',
      query: {},
      body: {
        filter: { public: true },
        select: ['name', 'role'],
        sort: 'name',
        limit: 1,
        options: { skim: false, includePermissions: true, includeCount: true, includeExtraHeaders: false },
      },
    }),
    rootEntry: () =>
      modelEntry({
        op: 'list',
        filter: { public: true },
        args: { select: ['name', 'role'], sort: 'name', limit: 1 },
        options: { skim: false, includePermissions: true, includeCount: true },
      }),
    status: 200,
    shape: 'list',
  },
  {
    name: 'model.new',
    request: () => services.userService.new(),
    directWire: () => ({ method: 'GET', path: '/api/users/new', query: {}, body: noBody }),
    rootEntry: () => modelEntry({ op: 'new' }),
    status: 200,
    shape: 'draft',
  },
  {
    name: 'model.create',
    request: (execution) =>
      services.userService.create(
        { name: `parity-create-${execution}`, role: 'user', public: true },
        { includePermissions: false },
      ),
    directWire: (execution) => ({
      method: 'POST',
      path: '/api/users',
      query: { include_permissions: 'false' },
      body: { name: `parity-create-${execution}`, role: 'user', public: true },
    }),
    rootEntry: (execution) =>
      modelEntry({
        op: 'create',
        data: { name: `parity-create-${execution}`, role: 'user', public: true },
        options: { includePermissions: false },
      }),
    status: 201,
    shape: 'single',
  },
  {
    name: 'model.createMany',
    request: (execution) =>
      services.userService.create([{ name: `parity-create-many-${execution}`, role: 'user', public: true }]),
    directWire: (execution) => ({
      method: 'POST',
      path: '/api/users',
      query: { include_permissions: 'true' },
      body: [{ name: `parity-create-many-${execution}`, role: 'user', public: true }],
    }),
    rootEntry: (execution) =>
      modelEntry({
        op: 'create',
        data: [{ name: `parity-create-many-${execution}`, role: 'user', public: true }],
        options: { includePermissions: true },
      }),
    status: 201,
    shape: 'list',
  },
  {
    name: 'model.createAdvanced',
    request: (execution) =>
      services.userService.createAdvanced(
        { name: `parity-advanced-${execution}`, role: 'user', public: true },
        { select: ['name', 'role'] },
        { includePermissions: false },
      ),
    directWire: (execution) => ({
      method: 'POST',
      path: '/api/users/__mutation',
      query: {},
      body: {
        data: { name: `parity-advanced-${execution}`, role: 'user', public: true },
        select: ['name', 'role'],
        options: { includePermissions: false },
      },
    }),
    rootEntry: (execution) =>
      modelEntry({
        op: 'create',
        data: { name: `parity-advanced-${execution}`, role: 'user', public: true },
        args: { select: ['name', 'role'] },
        options: { includePermissions: false },
      }),
    status: 201,
    shape: 'single',
  },
  {
    name: 'model.createAdvancedMany',
    request: (execution) =>
      services.userService.createAdvanced([{ name: `parity-advanced-many-${execution}`, role: 'user', public: true }], {
        select: ['name'],
      }),
    directWire: (execution) => ({
      method: 'POST',
      path: '/api/users/__mutation',
      query: {},
      body: {
        data: [{ name: `parity-advanced-many-${execution}`, role: 'user', public: true }],
        select: ['name'],
        options: { includePermissions: true },
      },
    }),
    rootEntry: (execution) =>
      modelEntry({
        op: 'create',
        data: [{ name: `parity-advanced-many-${execution}`, role: 'user', public: true }],
        args: { select: ['name'] },
        options: { includePermissions: true },
      }),
    status: 201,
    shape: 'list',
  },
  {
    name: 'model.read',
    request: (execution) =>
      services.userService.read(parentId(execution), { includePermissions: false, tryList: false }),
    directWire: (execution) => ({
      method: 'GET',
      path: `/api/users/${parentId(execution)}`,
      query: { include_permissions: 'false', try_list: 'false' },
      body: noBody,
    }),
    rootEntry: (execution) =>
      modelEntry({
        op: 'read',
        id: parentId(execution),
        args: {},
        options: { includePermissions: false, tryList: false },
      }),
    status: 200,
    shape: 'single',
  },
  {
    name: 'model.readAdvanced',
    request: (execution) =>
      services.userService.readAdvanced(
        parentId(execution),
        { select: ['name', 'role'] },
        { skim: false, includePermissions: false, tryList: false },
      ),
    directWire: (execution) => ({
      method: 'POST',
      path: `/api/users/__query/${parentId(execution)}`,
      query: {},
      body: {
        select: ['name', 'role'],
        options: { skim: false, includePermissions: false, tryList: false },
      },
    }),
    rootEntry: (execution) =>
      modelEntry({
        op: 'read',
        id: parentId(execution),
        args: { select: ['name', 'role'] },
        options: { skim: false, includePermissions: false, tryList: false },
      }),
    status: 200,
    shape: 'single',
  },
  {
    name: 'model.id.fetch',
    request: (execution) => services.userService.id(parentId(execution)).fetch(),
    directWire: (execution) => ({
      method: 'POST',
      path: `/api/users/__query/${parentId(execution)}`,
      query: {},
      body: { options: { skim: true, includePermissions: true, tryList: true } },
    }),
    rootEntry: (execution) =>
      modelEntry({
        op: 'read',
        id: parentId(execution),
        args: {},
        options: { skim: true, includePermissions: true, tryList: true },
      }),
    status: 200,
    shape: 'single',
  },
  {
    name: 'model.readAdvancedFilter',
    request: () => services.userService.readAdvancedFilter({ name: 'admin-user' }, { select: ['name'], sort: 'name' }),
    directWire: () => ({
      method: 'POST',
      path: '/api/users/__query/__filter',
      query: {},
      body: {
        filter: { name: 'admin-user' },
        select: ['name'],
        sort: 'name',
        options: { skim: true, includePermissions: true, tryList: true },
      },
    }),
    rootEntry: () =>
      modelEntry({
        op: 'read',
        filter: { name: 'admin-user' },
        args: { select: ['name'], sort: 'name' },
        options: { skim: true, includePermissions: true, tryList: true },
      }),
    status: 200,
    shape: 'single',
  },
  {
    name: 'model.update',
    request: (execution) =>
      services.userService.update(
        parentId(execution),
        { role: `updated-${execution}` },
        { returningAll: true, includePermissions: false },
      ),
    directWire: (execution) => ({
      method: 'PATCH',
      path: `/api/users/${parentId(execution)}`,
      query: { returning_all: 'true', include_permissions: 'false' },
      body: { role: `updated-${execution}` },
    }),
    rootEntry: (execution) =>
      modelEntry({
        op: 'update',
        id: parentId(execution),
        data: { role: `updated-${execution}` },
        options: { returningAll: true, includePermissions: false },
      }),
    status: 200,
    shape: 'single',
  },
  {
    name: 'model.updateAdvanced',
    request: (execution) =>
      services.userService.updateAdvanced(
        parentId(execution),
        { role: `advanced-${execution}` },
        { select: ['name', 'role'] },
        { returningAll: true, includePermissions: false },
      ),
    directWire: (execution) => ({
      method: 'PATCH',
      path: `/api/users/__mutation/${parentId(execution)}`,
      query: {},
      body: {
        data: { role: `advanced-${execution}` },
        select: ['name', 'role'],
        options: { returningAll: true, includePermissions: false },
      },
    }),
    rootEntry: (execution) =>
      modelEntry({
        op: 'update',
        id: parentId(execution),
        data: { role: `advanced-${execution}` },
        args: { select: ['name', 'role'] },
        options: { returningAll: true, includePermissions: false },
      }),
    status: 200,
    shape: 'single',
  },
  {
    name: 'model.upsert',
    request: (execution) =>
      services.userService.upsert(
        { _id: parentId(execution), role: `upsert-${execution}` },
        { returningAll: true, includePermissions: false },
      ),
    directWire: (execution) => ({
      method: 'PUT',
      path: '/api/users',
      query: { returning_all: 'true', include_permissions: 'false' },
      body: { _id: parentId(execution), role: `upsert-${execution}` },
    }),
    rootEntry: (execution) =>
      modelEntry({
        op: 'upsert',
        data: { _id: parentId(execution), role: `upsert-${execution}` },
        options: { returningAll: true, includePermissions: false },
      }),
    status: 200,
    shape: 'single',
  },
  {
    name: 'model.upsertAdvanced',
    request: (execution) =>
      services.userService.upsertAdvanced(
        { _id: parentId(execution), role: `upsert-advanced-${execution}` },
        { select: ['name', 'role'] },
        { returningAll: true, includePermissions: false },
      ),
    directWire: (execution) => ({
      method: 'PUT',
      path: '/api/users/__mutation',
      query: {},
      body: {
        data: { _id: parentId(execution), role: `upsert-advanced-${execution}` },
        select: ['name', 'role'],
        options: { returningAll: true, includePermissions: false },
      },
    }),
    rootEntry: (execution) =>
      modelEntry({
        op: 'upsert',
        data: { _id: parentId(execution), role: `upsert-advanced-${execution}` },
        args: { select: ['name', 'role'] },
        options: { returningAll: true, includePermissions: false },
      }),
    status: 200,
    shape: 'single',
  },
  {
    name: 'model.delete',
    request: (execution) => services.userService.delete(parentId(execution)),
    directWire: (execution) => ({
      method: 'DELETE',
      path: `/api/users/${parentId(execution)}`,
      query: {},
      body: noBody,
    }),
    rootEntry: (execution) => modelEntry({ op: 'delete', id: parentId(execution) }),
    status: 200,
    shape: 'string',
  },
  {
    name: 'model.distinct',
    request: () => services.userService.distinct('role'),
    directWire: () => ({ method: 'GET', path: '/api/users/distinct/role', query: {}, body: noBody }),
    rootEntry: () => modelEntry({ op: 'distinct', field: 'role' }),
    status: 200,
    shape: 'list',
  },
  {
    name: 'model.distinctAdvanced',
    request: () => services.userService.distinctAdvanced('role', { public: true }),
    directWire: () => ({
      method: 'POST',
      path: '/api/users/distinct/role',
      query: {},
      body: { filter: { public: true } },
    }),
    rootEntry: () => modelEntry({ op: 'distinct', field: 'role', filter: { public: true } }),
    status: 200,
    shape: 'list',
  },
  {
    name: 'model.count',
    request: () => services.userService.count(),
    directWire: () => ({ method: 'GET', path: '/api/users/count', query: {}, body: noBody }),
    rootEntry: () => modelEntry({ op: 'count' }),
    status: 200,
    shape: 'number',
  },
  {
    name: 'model.countAdvanced',
    request: () => services.userService.countAdvanced({ public: true }),
    directWire: () => ({
      method: 'POST',
      path: '/api/users/count',
      query: {},
      body: { filter: { public: true } },
    }),
    rootEntry: () => modelEntry({ op: 'count', filter: { public: true } }),
    status: 200,
    shape: 'number',
  },
  {
    name: 'data.list',
    request: () => services.petService.list({ limit: 2 }, { includeCount: true }),
    directWire: () => ({
      method: 'GET',
      path: '/api/pets',
      query: { limit: '2', include_count: 'true', include_extra_headers: 'false' },
      body: noBody,
    }),
    rootEntry: () => dataEntry({ op: 'list', filter: {}, args: { limit: 2 }, options: { includeCount: true } }),
    status: 200,
    shape: 'list',
  },
  {
    name: 'data.listAdvanced',
    request: () =>
      services.petService.listAdvanced(
        { public: true },
        { select: ['name', 'age'], sort: '-age', limit: 2 },
        { includeCount: true, includeExtraHeaders: true },
      ),
    directWire: () => ({
      method: 'POST',
      path: '/api/pets/__query',
      query: {},
      body: {
        filter: { public: true },
        select: ['name', 'age'],
        sort: '-age',
        limit: 2,
        options: { includeCount: true, includeExtraHeaders: true },
      },
    }),
    rootEntry: () =>
      dataEntry({
        op: 'list',
        filter: { public: true },
        args: { select: ['name', 'age'], sort: '-age', limit: 2 },
        options: { includeCount: true },
      }),
    status: 200,
    shape: 'list',
  },
  {
    name: 'data.read',
    request: (execution) => services.petService.read(execution === 'direct' ? 'Max' : 'Bella'),
    directWire: (execution) => ({
      method: 'GET',
      path: `/api/pets/${execution === 'direct' ? 'Max' : 'Bella'}`,
      query: {},
      body: noBody,
    }),
    rootEntry: (execution) =>
      dataEntry({ op: 'read', id: execution === 'direct' ? 'Max' : 'Bella', args: {}, options: {} }),
    status: 200,
    shape: 'single',
  },
  {
    name: 'data.readAdvanced',
    request: (execution) =>
      services.petService.readAdvanced(execution === 'direct' ? 'Max' : 'Bella', { select: ['name'] }),
    directWire: (execution) => ({
      method: 'POST',
      path: `/api/pets/__query/${execution === 'direct' ? 'Max' : 'Bella'}`,
      query: {},
      body: { select: ['name'] },
    }),
    rootEntry: (execution) =>
      dataEntry({
        op: 'read',
        id: execution === 'direct' ? 'Max' : 'Bella',
        args: { select: ['name'] },
        options: {},
      }),
    status: 200,
    shape: 'single',
  },
  {
    name: 'data.readAdvancedFilter',
    request: () => services.petService.readAdvancedFilter({ public: false }, { select: ['name', 'public'] }),
    directWire: () => ({
      method: 'POST',
      path: '/api/pets/__query/__filter',
      query: {},
      body: { filter: { public: false }, select: ['name', 'public'] },
    }),
    rootEntry: () =>
      dataEntry({ op: 'read', filter: { public: false }, args: { select: ['name', 'public'] }, options: {} }),
    status: 200,
    shape: 'single',
  },
  {
    name: 'sub.list',
    request: (execution) => subs(execution).list(),
    directWire: (execution) => ({
      method: 'GET',
      path: `/api/users/${parentId(execution)}/statusHistory`,
      query: {},
      body: noBody,
    }),
    rootEntry: (execution) =>
      modelEntry({
        op: 'subList',
        id: parentId(execution),
        sub: 'statusHistory',
        filter: {},
        args: {},
        options: {},
      }),
    status: 200,
    shape: 'sub-list',
  },
  {
    name: 'sub.listAdvanced',
    request: (execution) =>
      subs(execution).listAdvanced(
        { flag: execution === 'direct' ? 'green' : 'yellow' },
        { select: ['label', 'flag'] },
      ),
    directWire: (execution) => ({
      method: 'POST',
      path: `/api/users/${parentId(execution)}/statusHistory/__query`,
      query: {},
      body: {
        filter: { flag: execution === 'direct' ? 'green' : 'yellow' },
        select: ['label', 'flag'],
      },
    }),
    rootEntry: (execution) =>
      modelEntry({
        op: 'subList',
        id: parentId(execution),
        sub: 'statusHistory',
        filter: { flag: execution === 'direct' ? 'green' : 'yellow' },
        args: { select: ['label', 'flag'] },
        options: {},
      }),
    status: 200,
    shape: 'sub-list',
  },
  {
    name: 'sub.read',
    request: (execution) => subs(execution).read(subId(execution)),
    directWire: (execution) => ({
      method: 'GET',
      path: `/api/users/${parentId(execution)}/statusHistory/${subId(execution)}`,
      query: {},
      body: noBody,
    }),
    rootEntry: (execution) =>
      modelEntry({
        op: 'subRead',
        id: parentId(execution),
        sub: 'statusHistory',
        subId: subId(execution),
        args: {},
        options: {},
      }),
    status: 200,
    shape: 'single',
  },
  {
    name: 'sub.readAdvanced',
    request: (execution) => subs(execution).readAdvanced(subId(execution), { select: ['label'] }),
    directWire: (execution) => ({
      method: 'POST',
      path: `/api/users/${parentId(execution)}/statusHistory/${subId(execution)}/__query`,
      query: {},
      body: { select: ['label'] },
    }),
    rootEntry: (execution) =>
      modelEntry({
        op: 'subRead',
        id: parentId(execution),
        sub: 'statusHistory',
        subId: subId(execution),
        args: { select: ['label'] },
        options: {},
      }),
    status: 200,
    shape: 'single',
  },
  {
    name: 'sub.create',
    request: (execution) => subs(execution).create({ label: `parity-sub-${execution}`, flag: 'violet' }),
    directWire: (execution) => ({
      method: 'POST',
      path: `/api/users/${parentId(execution)}/statusHistory`,
      query: {},
      body: { label: `parity-sub-${execution}`, flag: 'violet' },
    }),
    rootEntry: (execution) =>
      modelEntry({
        op: 'subCreate',
        id: parentId(execution),
        sub: 'statusHistory',
        data: { label: `parity-sub-${execution}`, flag: 'violet' },
        options: {},
      }),
    status: 201,
    shape: 'sub-list',
  },
  {
    name: 'sub.update',
    request: (execution) => subs(execution).update(subId(execution), { label: `parity-updated-${execution}` }),
    directWire: (execution) => ({
      method: 'PATCH',
      path: `/api/users/${parentId(execution)}/statusHistory/${subId(execution)}`,
      query: {},
      body: { label: `parity-updated-${execution}` },
    }),
    rootEntry: (execution) =>
      modelEntry({
        op: 'subUpdate',
        id: parentId(execution),
        sub: 'statusHistory',
        subId: subId(execution),
        data: { label: `parity-updated-${execution}` },
        options: {},
      }),
    status: 200,
    shape: 'single',
  },
  {
    name: 'sub.bulkUpdate',
    request: (execution) => subs(execution).bulkUpdate([{ _id: subId(execution), label: `parity-bulk-${execution}` }]),
    directWire: (execution) => ({
      method: 'PATCH',
      path: `/api/users/${parentId(execution)}/statusHistory`,
      query: {},
      body: [{ _id: subId(execution), label: `parity-bulk-${execution}` }],
    }),
    rootEntry: (execution) =>
      modelEntry({
        op: 'subBulkUpdate',
        id: parentId(execution),
        sub: 'statusHistory',
        data: [{ _id: subId(execution), label: `parity-bulk-${execution}` }],
        options: {},
      }),
    status: 200,
    shape: 'sub-list',
  },
  {
    name: 'sub.delete',
    request: (execution) => subs(execution).delete(subId(execution)),
    directWire: (execution) => ({
      method: 'DELETE',
      path: `/api/users/${parentId(execution)}/statusHistory/${subId(execution)}`,
      query: {},
      body: noBody,
    }),
    rootEntry: (execution) =>
      modelEntry({
        op: 'subDelete',
        id: parentId(execution),
        sub: 'statusHistory',
        subId: subId(execution),
      }),
    status: 200,
    shape: 'string',
  },
];

const missingReadCases = [
  {
    name: 'data.read',
    request: (execution: Execution) => {
      void execution;
      return services.petService.read('Missing');
    },
    directWire: {
      method: 'GET',
      path: '/api/pets/Missing',
      query: {},
      body: noBody,
    },
    rootEntry: dataEntry({ op: 'read', id: 'Missing', args: {}, options: {} }),
  },
  {
    name: 'sub.read',
    request: (execution: Execution) => subs(execution).read('000000000000000000000000'),
    directWire: (execution: Execution) => ({
      method: 'GET',
      path: `/api/users/${parentId(execution)}/statusHistory/000000000000000000000000`,
      query: {},
      body: noBody,
    }),
    rootEntry: (execution: Execution) =>
      modelEntry({
        op: 'subRead',
        id: parentId(execution),
        sub: 'statusHistory',
        subId: '000000000000000000000000',
        args: {},
        options: {},
      }),
  },
] as const;

const assertOperationResult = (
  result: Awaited<ExecutableRequest>,
  protocolCase: ProtocolCase,
  execution: Execution,
) => {
  const raw = result.raw as Record<string, unknown> | Record<string, unknown>[] | string | number;
  const data = result.data as Record<string, unknown> | Record<string, unknown>[] | string | number;
  const expectedParentName = execution === 'direct' ? 'admin-user' : 'lucy2';
  const expectedSubLabel = execution === 'direct' ? 'created' : 'invited';

  switch (protocolCase.name) {
    case 'model.list':
      expect(raw).toHaveLength(1);
      expect([
        { name: 'admin-user', role: 'admin' },
        { name: 'lucy2', role: 'user' },
      ]).toContainEqual(
        expect.objectContaining({
          name: (raw as Record<string, unknown>[])[0].name,
          role: (raw as Record<string, unknown>[])[0].role,
        }),
      );
      expect(result.totalCount).toBe(2);
      break;
    case 'model.listAdvanced':
      expect(raw).toEqual([expect.objectContaining({ name: 'admin-user', role: 'admin' })]);
      expect((raw as Record<string, unknown>[])[0]).not.toHaveProperty('statusHistory');
      expect(result.totalCount).toBe(2);
      break;
    case 'model.new':
      expect(raw).toMatchObject({ public: true, orgs: [], statusHistory: [] });
      expect(raw).not.toHaveProperty('role');
      break;
    case 'model.create':
      expect(raw).toMatchObject({ name: `parity-create-${execution}`, role: 'user', public: true });
      expect(data).toMatchObject({ name: `parity-create-${execution}`, role: 'user' });
      break;
    case 'model.createMany':
      expect(raw).toEqual([
        expect.objectContaining({ name: `parity-create-many-${execution}`, role: 'user', public: true }),
      ]);
      break;
    case 'model.createAdvanced':
      expect(raw).toMatchObject({ name: `parity-advanced-${execution}`, role: 'user' });
      expect(raw).not.toHaveProperty('public');
      break;
    case 'model.createAdvancedMany':
      expect(raw).toEqual([expect.objectContaining({ name: `parity-advanced-many-${execution}` })]);
      expect((raw as Record<string, unknown>[])[0]).not.toHaveProperty('role');
      break;
    case 'model.read':
    case 'model.id.fetch':
      expect(raw).toMatchObject({ _id: parentId(execution), name: expectedParentName });
      expect(typeof (data as { save?: unknown }).save).toBe('function');
      break;
    case 'model.readAdvanced':
      expect(raw).toMatchObject({ _id: parentId(execution), name: expectedParentName });
      expect(raw).not.toHaveProperty('public');
      break;
    case 'model.readAdvancedFilter':
      expect(raw).toMatchObject({ name: 'admin-user' });
      expect(raw).not.toHaveProperty('role');
      break;
    case 'model.update':
      expect(raw).toMatchObject({ _id: parentId(execution), role: `updated-${execution}` });
      break;
    case 'model.updateAdvanced':
      expect(raw).toMatchObject({ name: expectedParentName, role: `advanced-${execution}` });
      expect(raw).not.toHaveProperty('public');
      break;
    case 'model.upsert':
      expect(raw).toMatchObject({ _id: parentId(execution), role: `upsert-${execution}` });
      break;
    case 'model.upsertAdvanced':
      expect(raw).toMatchObject({ name: expectedParentName, role: `upsert-advanced-${execution}` });
      expect(raw).not.toHaveProperty('public');
      break;
    case 'model.delete':
      expect(data).toBe(parentId(execution));
      break;
    case 'model.distinct':
    case 'model.distinctAdvanced':
      expect(data).toEqual(expect.arrayContaining(['admin', 'user']));
      expect(data).toHaveLength(2);
      break;
    case 'model.count':
    case 'model.countAdvanced':
      expect(data).toBe(2);
      break;
    case 'data.list':
      expect(raw).toEqual([
        expect.objectContaining({ name: 'Max', age: 1 }),
        expect.objectContaining({ name: 'Bella', age: 3 }),
      ]);
      expect(result.totalCount).toBe(3);
      break;
    case 'data.listAdvanced':
      expect(raw).toEqual([
        expect.objectContaining({ name: 'Bella', age: 3 }),
        expect.objectContaining({ name: 'Max', age: 1 }),
      ]);
      expect((raw as Record<string, unknown>[])[0]).not.toHaveProperty('sex');
      expect(result.totalCount).toBe(2);
      break;
    case 'data.read':
      expect(raw).toMatchObject({ name: execution === 'direct' ? 'Max' : 'Bella' });
      break;
    case 'data.readAdvanced':
      expect(raw).toEqual({ name: execution === 'direct' ? 'Max' : 'Bella' });
      break;
    case 'data.readAdvancedFilter':
      expect(raw).toEqual({ name: 'Rocky', public: false });
      break;
    case 'sub.list':
      expect((raw as Record<string, unknown>[]).map((row) => row.label)).toEqual(
        execution === 'direct' ? ['created', 'reviewed'] : ['invited'],
      );
      break;
    case 'sub.listAdvanced':
      expect(raw).toEqual([expect.objectContaining({ label: expectedSubLabel })]);
      break;
    case 'sub.read':
      expect(raw).toMatchObject({ _id: subId(execution), label: expectedSubLabel });
      break;
    case 'sub.readAdvanced':
      expect(raw).toMatchObject({ label: expectedSubLabel });
      expect(raw).not.toHaveProperty('flag');
      break;
    case 'sub.create':
      expect(raw).toEqual(
        expect.arrayContaining([expect.objectContaining({ label: `parity-sub-${execution}`, flag: 'violet' })]),
      );
      break;
    case 'sub.update':
      expect(raw).toMatchObject({ _id: subId(execution), label: `parity-updated-${execution}` });
      break;
    case 'sub.bulkUpdate':
      expect(raw).toEqual([expect.objectContaining({ _id: subId(execution), label: `parity-bulk-${execution}` })]);
      break;
    case 'sub.delete':
      expect(data).toBe(subId(execution));
      break;
    default:
      throw new Error(`Missing semantic result assertion for ${protocolCase.name}`);
  }
};

const assertNormalizedSuccess = (
  result: Awaited<ExecutableRequest>,
  protocolCase: ProtocolCase,
  execution: Execution,
) => {
  expect(result).toMatchObject({ success: true, status: protocolCase.status, message: '' });
  expect(result.raw).not.toBeNull();

  if (protocolCase.shape === 'list' || protocolCase.shape === 'sub-list') {
    expect(Array.isArray(result.raw)).toBe(true);
    expect(Array.isArray(result.data)).toBe(true);
  } else if (protocolCase.shape === 'string') {
    expect(typeof result.data).toBe('string');
  } else if (protocolCase.shape === 'number') {
    expect(typeof result.data).toBe('number');
  } else {
    expect(result.data).toEqual(expect.any(Object));
  }

  if (protocolCase.shape === 'draft') {
    expect(result.raw).not.toHaveProperty('_id');
    expect(result.data).not.toHaveProperty('_id');
  }
  if (protocolCase.shape === 'sub-list') {
    expect(result.count).toBe((result.data as unknown[]).length);
  }
  assertOperationResult(result, protocolCase, execution);
};

/**
 * ARC-13: Protocol parity with the sibling `packages/access-router`
 * server. Each case proves that a client payload shape the server actually
 * consumes produces observable behavior, and that unsupported shapes are
 * rejected at compile time or runtime.
 */
describe('access-router-client protocol parity (ARC-13)', () => {
  describe.each(protocolCases)('$name protocol', (protocolCase) => {
    it('executes directly with the exact sibling-router wire contract', async () => {
      const result = await protocolCase.request('direct');

      assertNormalizedSuccess(result, protocolCase, 'direct');
      expect(suite.protocolRequests).toEqual([protocolCase.directWire('direct')]);
    });

    it('executes grouped with the exact root entry and normalized result', async () => {
      const [result] = await suite.adapter.group(protocolCase.request('grouped'));

      assertNormalizedSuccess(result, protocolCase, 'grouped');
      expect(result.headers).toEqual({});
      expect(suite.protocolRequests).toEqual([
        {
          method: 'POST',
          path: '/api/root',
          query: {},
          body: [{ ...protocolCase.rootEntry('grouped'), order: 0 }],
        },
      ]);
    });
  });

  describe.each(missingReadCases)('$name missing-result protocol', (protocolCase) => {
    it.each(['direct', 'grouped'] as const)('normalizes the %s failure with exact wire metadata', async (execution) => {
      const request = protocolCase.request(execution);
      const result = execution === 'direct' ? await request : (await suite.adapter.group(request))[0];

      expect(result).toMatchObject({ success: false, status: 404, data: null, message: 'Not Found' });
      expect(result).not.toHaveProperty('count');
      expect(result).not.toHaveProperty('totalCount');
      if (execution === 'direct') {
        expect(result.raw).toEqual({
          type: 'about:blank',
          title: 'Not Found',
          status: 404,
          detail: 'Not Found',
        });
        expect(result.raw).not.toHaveProperty('errors');
        expect(suite.protocolRequests).toEqual([
          typeof protocolCase.directWire === 'function' ? protocolCase.directWire(execution) : protocolCase.directWire,
        ]);
      } else {
        expect(result).toHaveProperty('headers', {});
        expect(result.raw).toEqual({ success: false, code: 'not_found' });
        expect(suite.protocolRequests).toEqual([
          {
            method: 'POST',
            path: '/api/root',
            query: {},
            body: [
              {
                ...(typeof protocolCase.rootEntry === 'function'
                  ? protocolCase.rootEntry(execution)
                  : protocolCase.rootEntry),
                order: 0,
              },
            ],
          },
        ]);
      }
    });
  });

  it('normalizes a missing-document failure directly and through exact root metadata', async () => {
    const missingId = '000000000000000000000000';
    const direct = await services.userService.read(missingId);

    expect(direct).toMatchObject({ success: false, status: 404, data: null, message: 'Not Found' });
    expect(direct.raw).toEqual({
      type: 'about:blank',
      title: 'Not Found',
      status: 404,
      detail: 'Not Found',
    });
    expect(direct.raw).not.toHaveProperty('errors');
    expect(direct).not.toHaveProperty('count');
    expect(direct).not.toHaveProperty('totalCount');
    expect(suite.protocolRequests).toEqual([
      {
        method: 'GET',
        path: `/api/users/${missingId}`,
        query: { include_permissions: 'true', try_list: 'true' },
        body: noBody,
      },
    ]);

    suite.protocolRequests.length = 0;
    const [grouped] = await suite.adapter.group(services.userService.read(missingId));
    expect(grouped).toMatchObject({
      success: false,
      status: 404,
      data: null,
      message: 'Not Found',
      headers: {},
    });
    expect(grouped.raw).toEqual({
      success: false,
      code: 'not_found',
    });
    expect(grouped).not.toHaveProperty('count');
    expect(grouped).not.toHaveProperty('totalCount');
    expect(suite.protocolRequests).toEqual([
      {
        method: 'POST',
        path: '/api/root',
        query: {},
        body: [
          {
            target: 'model',
            name: MODEL_NAME,
            op: 'read',
            id: missingId,
            args: {},
            options: { includePermissions: true, tryList: true },
            order: 0,
          } satisfies RootQueryEntry,
        ],
      },
    ]);
  });

  describe('model create cardinality', () => {
    it('preserves array input for direct and grouped basic create, including one item', async () => {
      const direct = await services.userService.create([{ name: 'bulk-direct', role: 'user', public: true }]);
      const [grouped] = await suite.adapter.group(
        services.userService.create([{ name: 'bulk-grouped', role: 'user', public: true }]),
      );

      expect(direct.success).toBe(true);
      expect(grouped.success).toBe(true);
      if (!direct.success || !grouped.success) return;
      expect(direct.raw).toHaveLength(1);
      expect(direct.data).toHaveLength(1);
      expect(direct.data[0].name).toBe('bulk-direct');
      expect(grouped.raw).toHaveLength(1);
      expect(grouped.data).toHaveLength(1);
      expect(grouped.data[0].name).toBe('bulk-grouped');
      expect(typeof direct.data[0].save).toBe('function');
      expect(typeof grouped.data[0].save).toBe('function');
    });

    it('preserves array input for direct and grouped advanced create', async () => {
      const args = { select: ['name', 'role'] as const };
      const direct = await services.userService.createAdvanced(
        [{ name: 'advanced-direct', role: 'user', public: true }],
        args,
      );
      const [grouped] = await suite.adapter.group(
        services.userService.createAdvanced([{ name: 'advanced-grouped', role: 'user', public: true }], args),
      );

      expect(direct.success).toBe(true);
      expect(grouped.success).toBe(true);
      if (!direct.success || !grouped.success) return;
      expect(direct.data.map((row) => row.name)).toEqual(['advanced-direct']);
      expect(grouped.data.map((row) => row.name)).toEqual(['advanced-grouped']);
    });
  });

  it('normalizes grouped new documents as id-less drafts', async () => {
    const direct = await services.userService.new();
    const [grouped] = await suite.adapter.group(services.userService.new());

    expect(direct.success).toBe(true);
    expect(grouped.success).toBe(true);
    if (!direct.success || !grouped.success) return;
    expect(direct.raw).not.toHaveProperty('_id');
    expect(grouped.raw).not.toHaveProperty('_id');
    expect(grouped.data).not.toHaveProperty('_id');
  });

  it('sends data advanced-list extra-header options on the direct wire', async () => {
    const result = await services.petService.listAdvanced(
      { public: true },
      { select: ['name'], limit: 1 },
      { includeCount: true, includeExtraHeaders: true },
    );

    expect(result.success).toBe(true);
    expect(suite.protocolRequests.at(-1)).toMatchObject({
      method: 'POST',
      path: '/api/pets/__query',
      body: {
        filter: { public: true },
        select: ['name'],
        limit: 1,
        options: { includeCount: true, includeExtraHeaders: true },
      },
    });
  });

  it('serializes exact top-level root metadata without the subquery-only model field', async () => {
    await suite.adapter.group(services.userService.list({ limit: 1 }, { includeCount: true }));

    const rootRequest = suite.protocolRequests.find((request) => request.path === '/api/root');
    expect(rootRequest).toMatchObject({ method: 'POST', path: '/api/root' });
    expect(rootRequest?.body).toEqual([
      {
        target: 'model',
        name: 'AdapterJsIntegrationUser',
        op: 'list',
        filter: {},
        args: { limit: 1 },
        options: { skim: true, includePermissions: false, includeCount: true },
        order: 0,
      },
    ]);
  });

  it('covers grouped subdocument delete and structured missing-id failure', async () => {
    const subs = services.userService.id(String(seedState.admin._id)).subs('statusHistory');
    const created = await subs.create({ label: 'group-delete', flag: 'orange' });
    expect(created.success).toBe(true);
    if (!created.success) return;
    const createdSub = created.data.find((row) => row.label === 'group-delete');
    expect(createdSub?._id).toBeDefined();

    const [deleted, failed] = await suite.adapter.group(
      subs.delete(String(createdSub?._id)),
      subs.delete('000000000000000000000000'),
    );
    expect(deleted).toMatchObject({ success: true, status: 200, data: String(createdSub?._id), headers: {} });
    expect(failed).toMatchObject({ success: false, status: 404, data: null, message: 'Not Found', headers: {} });
    expect(failed.raw).toEqual({
      success: false,
      code: 'not_found',
    });
    expect(failed).not.toHaveProperty('count');
    expect(failed).not.toHaveProperty('totalCount');
  });

  describe('distinctAdvanced filter shape', () => {
    it('sends { filter: conditions } so a restrictive filter excludes rows from the distinct result', async () => {
      const headers = { headers: { user: 'admin' } };

      // Before ARC-13 the client sent `conditions` as the body root and the
      // server ran an unfiltered distinct, returning values from rows the
      // caller expected to exclude. With `{ filter }`, the server honors
      // the filter and the distinct omits values from excluded rows.
      const unfiltered = await services.userService.distinctAdvanced('role', {}, headers);
      expect(unfiltered.success).toBe(true);
      // Both 'admin' (admin-user) and 'user' (lucy2) are public, so an
      // empty filter returns both roles.
      expect(unfiltered.data).toEqual(expect.arrayContaining(['admin', 'user']));

      // Now restrict to `public: false`. No seeded user has `public: false`,
      // so the server's distinct over the filtered set must be empty.
      const filtered = await services.userService.distinctAdvanced('role', { public: false }, headers);
      expect(filtered.success).toBe(true);
      expect(filtered.data).toEqual([]);
    });
  });

  describe('update/upsert include_permissions', () => {
    it('update() sends include_permissions=?true and the server attaches permission metadata on the returned document', async () => {
      const headers = { headers: { user: 'admin' } };
      const adminId = String(seedState.admin._id);

      const withoutPerms = await services.userService.update(
        adminId,
        { role: 'maintainer' },
        { includePermissions: false },
        headers,
      );
      expect(withoutPerms.success).toBe(true);

      const withPerms = await services.userService.update(
        adminId,
        { role: 'owner' },
        { includePermissions: true },
        headers,
      );
      expect(withPerms.success).toBe(true);
      // The sibling server populates `_permissions` on the response when
      // `include_permissions=true` and the global permission field is
      // configured (the integration suite configures `_permissions` and
      // grants `isAdmin` for the admin header).
      expect(withPerms.data).toMatchObject(expect.objectContaining({ _permissions: expect.anything() }));
    });

    it('upsert() sends include_permissions=?true and the server attaches permission metadata on the returned document', async () => {
      const headers = { headers: { user: 'admin' } };
      const adminId = String(seedState.admin._id);

      const withPerms = await services.userService.upsert(
        { _id: adminId, role: 'director' },
        { includePermissions: true },
        headers,
      );
      expect(withPerms.success).toBe(true);
      expect(withPerms.data).toMatchObject(expect.objectContaining({ _permissions: expect.anything() }));
    });
  });

  describe('countAdvanced access argument removal', () => {
    it('countAdvanced() no longer accepts an `access` second argument (server rejects it)', async () => {
      const headers = { headers: { user: 'admin' } };

      // The narrowed signature only accepts (filter, axiosRequestConfig).
      // A simple successful call proves the request shape is valid.
      const counted = await services.userService.countAdvanced({ public: true }, headers);
      expect(counted.success).toBe(true);
      expect(counted.data).toBeGreaterThanOrEqual(2);

      // ARC-21: type-level and runtime-level guard against reintroducing the
      // obsolete `access` argument. The server's `countBodySchema` in
      // `packages/access-router/src/validation/model-router.ts` rejects
      // `access` / `options` / `query` keys, so the client must not expose a
      // typed surface that re-adds them; the cross-package server contract
      // test (`arc21-projection-identity-and-count-argument.contract.test.ts`)
      // asserts the server-side half of this contract.
      // @ts-expect-error — the obsolete `{ access?: 'list' | 'read' }`
      //   second argument is intentionally removed; reintroducing it would
      //   break the server's `countBodySchema` (which rejectKeys `access`).
      const _wouldRegress = services.userService.countAdvanced({ public: true }, { access: 'list' });
      void _wouldRegress;

      // The lazy request metadata carried by `countAdvanced` must not include
      // `options.access`, so a batched/grouped run cannot accidentally route
      // the obsolete access shim through to the sibling server's `count`
      // resolver (which would 400).
      const lazy = services.userService.countAdvanced({ public: true }) as unknown as {
        __query: { options?: Record<string, unknown>; filter?: unknown };
      };
      expect(lazy.__query.options).toBeUndefined();
      expect(lazy.__query.filter).toMatchObject({ public: true });
    });
  });

  describe('subdocument create accepts one or many', () => {
    it('create() accepts a single object and returns the post-create subdocument array', async () => {
      const headers = { headers: { user: 'admin' } };
      const subService = services.userService.id(String(seedState.admin._id)).subs('statusHistory');

      const created = await subService.create({ label: 'arc13-single', flag: 'pink' }, headers);
      expect(created.success).toBe(true);
      expect(Array.isArray(created.data)).toBe(true);
      expect(created.data).toEqual(
        expect.arrayContaining([expect.objectContaining({ label: 'arc13-single', flag: 'pink' })]),
      );
      expect(created.count).toBe(created.data.length);

      // cleanup so subsequent runs stay deterministic
      const added = created.data.find((row) => row.label === 'arc13-single');
      if (added) {
        await subService.delete(String(added._id), headers);
      }
    });

    it('create() accepts an array and returns the post-create subdocument array with all new rows', async () => {
      const headers = { headers: { user: 'admin' } };
      const subService = services.userService.id(String(seedState.admin._id)).subs('statusHistory');

      const created = await subService.create(
        [
          { label: 'arc13-bulk-a', flag: 'silver' },
          { label: 'arc13-bulk-b', flag: 'gold' },
        ],
        headers,
      );
      expect(created.success).toBe(true);
      expect(Array.isArray(created.data)).toBe(true);
      const labels = created.data.map((row) => row.label).sort();
      // The sibling server returns the post-create full list, so the array
      // create response must contain both new labels somewhere in the list
      // (alongside the existing seeded subdocuments).
      expect(labels).toEqual(expect.arrayContaining(['arc13-bulk-a', 'arc13-bulk-b']));
      expect(created.count).toBe(created.data.length);

      // cleanup
      const addedA = created.data.find((row) => row.label === 'arc13-bulk-a');
      const addedB = created.data.find((row) => row.label === 'arc13-bulk-b');
      if (addedA) await subService.delete(String(addedA._id), headers);
      if (addedB) await subService.delete(String(addedB._id), headers);
    });
  });

  describe('subdocument list responses expose count (not totalCount)', () => {
    it('list() and listAdvanced() return a SubDocumentListResponse with `count` matching the array length', async () => {
      const headers = { headers: { user: 'admin' } };
      const subService = services.userService.id(String(seedState.admin._id)).subs('statusHistory');

      const listed = await subService.list(headers);
      expect(listed.success).toBe(true);
      expect(Array.isArray(listed.data)).toBe(true);
      expect(listed.count).toBe(listed.data.length);

      const advancedListed = await subService.listAdvanced({ flag: 'green' }, { select: ['label', 'flag'] }, headers);
      expect(advancedListed.success).toBe(true);
      expect(Array.isArray(advancedListed.data)).toBe(true);
      expect(advancedListed.count).toBe(advancedListed.data.length);
    });

    it('bulkUpdate() returns a SubDocumentListResponse with `count` matching the updated array length', async () => {
      const headers = { headers: { user: 'admin' } };
      const subService = services.userService.id(String(seedState.admin._id)).subs('statusHistory');

      const listed = await subService.list(headers);
      expect(listed.success).toBe(true);
      const first = listed.data[0];
      const second = listed.data[1];

      const bulkUpdated = await subService.bulkUpdate(
        [
          { _id: String(first._id), label: 'arc13-bulk-first' },
          { _id: String(second._id), label: 'arc13-bulk-second' },
        ],
        undefined,
        headers,
      );
      expect(bulkUpdated.success).toBe(true);
      expect(Array.isArray(bulkUpdated.data)).toBe(true);
      expect(bulkUpdated.count).toBe(bulkUpdated.data.length);
      expect(bulkUpdated.count).toBe(2);
    });
  });

  describe('data operations do not advertise includePermissions', () => {
    it('data list/listAdvanced do not send include_permissions (server does not parse it for data routers)', async () => {
      const headers = { headers: { user: 'admin' } };

      const list = await services.petService.list({ limit: 10 }, { includeCount: true }, headers);
      expect(list.success).toBe(true);

      const advancedList = await services.petService.listAdvanced(
        { public: true },
        { select: 'name', limit: 10 },
        { includeCount: true },
        headers,
      );
      expect(advancedList.success).toBe(true);
    });
  });

  describe('data advanced-list sort is string-only', () => {
    it('listAdvanced sort accepts a string and the server honors the sort order', async () => {
      const headers = { headers: { user: 'admin' } };

      const ascending = await services.petService.listAdvanced(
        {},
        { sort: 'age', limit: 10 },
        { includeCount: true },
        headers,
      );
      expect(ascending.success).toBe(true);
      const agesAsc = ascending.data.map((row) => row.age);
      expect(agesAsc).toEqual([...agesAsc].sort((a, b) => a - b));

      const descending = await services.petService.listAdvanced(
        {},
        { sort: '-age', limit: 10 },
        { includeCount: true },
        headers,
      );
      expect(descending.success).toBe(true);
      const agesDesc = descending.data.map((row) => row.age);
      expect(agesDesc).toEqual([...agesDesc].sort((a, b) => b - a));
    });
  });

  describe('root entries are structurally compatible with the server RootQueryEntry contract', () => {
    it('grouped model entries do not require a redundant `model` field to resolve the target model', async () => {
      const headers = { headers: { user: 'admin' } };

      // The sibling server resolves the target model from the entry `name`
      // (rootRouter RootQueryEntry base schema). A grouped list request
      // must succeed without the client emitting a redundant `model` field
      // in the top-level root entry.
      const grouped = await suite.adapter.group(services.userService.list({ limit: 5 }, {}, headers));
      expect(grouped[0].success).toBe(true);
      expect(Array.isArray(grouped[0].data)).toBe(true);
    });

    it('grouped subdocument list entries resolve through `name` (not `model`) and produce the array shape with `count`', async () => {
      const headers = { headers: { user: 'admin' } };
      const subService = services.userService.id(String(seedState.admin._id)).subs('statusHistory');

      const direct = await subService.list(headers);
      const grouped = await suite.adapter.group(subService.list(headers));

      expect(direct.success).toBe(true);
      expect(grouped[0].success).toBe(true);
      expect(direct.data).toEqual(grouped[0].data);
      expect(direct.count).toBe(grouped[0].count);
    });
  });
});
