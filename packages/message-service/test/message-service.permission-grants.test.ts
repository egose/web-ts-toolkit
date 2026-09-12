import express from 'express';
import type { AddressInfo } from 'node:net';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createMessageRoutes } from '../src/route-factory';
import { filterActions, hasExplicitPermissionGrant, isActionAllowed } from '../src/template-engine';
import type { MessageAction, MessageTemplate } from '../src/types/template';

const MESSAGE_ID = '507f1f77bcf86cd799439011';

const servers: Array<{ close: (callback?: (error?: Error) => void) => void }> = [];

afterEach(async () => {
  await Promise.all(
    servers.splice(0).map(
      (server) =>
        new Promise<void>((resolve, reject) => {
          server.close((error) => (error ? reject(error) : resolve()));
        }),
    ),
  );
});

function gatedAction(permission: string): MessageAction {
  return {
    actionCd: 'gated',
    name: 'Gated',
    variant: 'info',
    sender: false,
    receiver: true,
    permission,
    runHandler: async () => true,
  };
}

const receiverMessage = {
  isSender: () => false,
  isReceiver: (u: { _id: string }) => u._id === 'receiver1',
};

function ownProtoGrant(): Record<string, boolean> {
  // JSON parsing creates an *own* `__proto__` property without invoking the
  // prototype setter, unlike an object literal.
  return JSON.parse('{"__proto__": true}');
}

function nullPrototypeGrant(key: string): Record<string, boolean> {
  const map: Record<string, boolean> = Object.create(null);
  map[key] = true;
  return map;
}

describe('hasExplicitPermissionGrant', () => {
  it('denies inherited Object.prototype members on an empty map', () => {
    expect(hasExplicitPermissionGrant({}, 'constructor')).toBe(false);
    expect(hasExplicitPermissionGrant({}, 'toString')).toBe(false);
    expect(hasExplicitPermissionGrant({}, '__proto__')).toBe(false);
    expect(hasExplicitPermissionGrant({}, 'hasOwnProperty')).toBe(false);
  });

  it('denies inherited custom keys', () => {
    const inherited = Object.create({ 'custom.grant': true });
    expect(hasExplicitPermissionGrant(inherited, 'custom.grant')).toBe(false);
  });

  it('denies false, absent, and truthy non-boolean values', () => {
    expect(hasExplicitPermissionGrant({}, 'perm.x')).toBe(false);
    expect(hasExplicitPermissionGrant({ 'perm.x': false }, 'perm.x')).toBe(false);
    expect(hasExplicitPermissionGrant({ 'perm.x': 1 } as never, 'perm.x')).toBe(false);
    expect(hasExplicitPermissionGrant({ 'perm.x': 'true' } as never, 'perm.x')).toBe(false);
    expect(hasExplicitPermissionGrant({ 'perm.x': {} } as never, 'perm.x')).toBe(false);
  });

  it('grants own boolean true on normal and null-prototype maps', () => {
    expect(hasExplicitPermissionGrant({ 'perm.x': true }, 'perm.x')).toBe(true);
    expect(hasExplicitPermissionGrant(nullPrototypeGrant('perm.x'), 'perm.x')).toBe(true);
    // The predicate is key-agnostic: an *own* `__proto__: true` grants.
    expect(hasExplicitPermissionGrant(ownProtoGrant(), '__proto__')).toBe(true);
  });

  it('never grants for non-object containers', () => {
    expect(hasExplicitPermissionGrant(undefined, 'perm.x')).toBe(false);
    expect(hasExplicitPermissionGrant(null, 'perm.x')).toBe(false);
    expect(hasExplicitPermissionGrant('true' as never, 'perm.x')).toBe(false);
    expect(hasExplicitPermissionGrant(['perm.x'] as never, 'perm.x')).toBe(false);
  });
});

describe.each([{ key: 'constructor' }, { key: 'toString' }, { key: '__proto__' }])(
  'prototype member permission "$key"',
  ({ key }) => {
    it('is denied by filterActions (UI) on an empty map', () => {
      const result = filterActions([gatedAction(key)], 'receiver', { permissions: {} });
      expect(result.map((a) => a.actionCd)).not.toContain('gated');
    });

    it('is denied by isActionAllowed (execution) on an empty map', () => {
      expect(
        isActionAllowed(gatedAction(key), { _id: 'receiver1' }, receiverMessage as never, { permissions: {} }),
      ).toBe(false);
    });
  },
);

describe('filterActions (UI) explicit grants', () => {
  it('denies inherited custom keys, false, absent, and non-boolean values', () => {
    const action = gatedAction('custom.grant');
    expect(filterActions([action], 'receiver', { permissions: {} })).toHaveLength(0);
    expect(filterActions([action], 'receiver', { permissions: { 'custom.grant': false } })).toHaveLength(0);
    expect(filterActions([action], 'receiver', { permissions: { 'custom.grant': 1 } as never })).toHaveLength(0);
    expect(
      filterActions([action], 'receiver', {
        permissions: Object.create({ 'custom.grant': true }),
      }),
    ).toHaveLength(0);
  });

  it('allows own true grants on normal and null-prototype maps', () => {
    const action = gatedAction('custom.grant');
    expect(
      filterActions([action], 'receiver', { permissions: { 'custom.grant': true } }).map((a) => a.actionCd),
    ).toContain('gated');
    expect(
      filterActions([action], 'receiver', { permissions: nullPrototypeGrant('custom.grant') }).map((a) => a.actionCd),
    ).toContain('gated');
  });

  it('applies the same predicate through interpolateTemplate', async () => {
    const { interpolateTemplate } = await import('../src/template-engine');
    const template: MessageTemplate = {
      templateCd: 'perm-check',
      type: 'request',
      description: 'permission check',
      senderContent: { title: 't', long: 'l', short: 's' },
      receiverContent: { title: 't', long: 'l', short: 's' },
      uiTemplate: 'default-message',
      paymentRequired: false,
      daysToArchive: 14,
      prepareMessage: async ({ user, payload }) => ({ fromUser: (user as { _id: string })._id, payload }),
      actions: [gatedAction('constructor')],
    };
    const denied = interpolateTemplate(template, {}, 'receiver', { permissions: {} });
    expect(denied.actions.map((a) => a.actionCd)).not.toContain('gated');
    const allowed = interpolateTemplate(template, {}, 'receiver', { permissions: { constructor: true } });
    expect(allowed.actions.map((a) => a.actionCd)).toContain('gated');
  });
});

describe('isActionAllowed (execution) explicit grants', () => {
  it('denies inherited custom keys, false, absent, and non-boolean values', () => {
    const action = gatedAction('custom.grant');
    const user = { _id: 'receiver1' };
    expect(isActionAllowed(action, user, receiverMessage as never)).toBe(false);
    expect(isActionAllowed(action, user, receiverMessage as never, { permissions: {} })).toBe(false);
    expect(isActionAllowed(action, user, receiverMessage as never, { permissions: { 'custom.grant': false } })).toBe(
      false,
    );
    expect(
      isActionAllowed(action, user, receiverMessage as never, { permissions: { 'custom.grant': 1 } as never }),
    ).toBe(false);
    expect(
      isActionAllowed(action, user, receiverMessage as never, {
        permissions: Object.create({ 'custom.grant': true }),
      }),
    ).toBe(false);
  });

  it('allows own true grants on normal and null-prototype maps', () => {
    const action = gatedAction('custom.grant');
    const user = { _id: 'receiver1' };
    expect(isActionAllowed(action, user, receiverMessage as never, { permissions: { 'custom.grant': true } })).toBe(
      true,
    );
    expect(
      isActionAllowed(action, user, receiverMessage as never, {
        permissions: nullPrototypeGrant('custom.grant'),
      }),
    ).toBe(true);
  });
});

async function createAdminProbeClient(options: {
  getPermissions: () => Record<string, boolean>;
  adminPermissionKey?: string;
}) {
  const getModel = vi.fn(() => ({}) as never);
  const { router, service } = createMessageRoutes({
    getModel,
    getUser: () => ({ _id: 'u1' }),
    getPermissions: options.getPermissions,
    ...(options.adminPermissionKey ? { adminPermissionKey: options.adminPermissionKey } : {}),
  });
  service.getActions = vi.fn(async () => ({ uiTemplate: 'probe', actions: [{ actionCd: 'x' }] }) as never);

  const app = express();
  app.use(express.json());
  app.use(router.original);
  const server = await new Promise<ReturnType<typeof app.listen>>((resolve) => {
    const started = app.listen(0, () => resolve(started));
  });
  servers.push(server);
  const address = server.address() as AddressInfo;
  const baseUrl = `http://127.0.0.1:${address.port}`;
  return {
    service,
    async request(path: string) {
      const response = await fetch(`${baseUrl}${path}`);
      const text = await response.text();
      return { status: response.status, body: text ? (JSON.parse(text) as unknown) : text };
    },
  };
}

describe('route admin read-only lookup (live HTTP)', () => {
  it('is not enabled by prototype inheritance on an empty map', async () => {
    const { service, request } = await createAdminProbeClient({
      adminPermissionKey: 'constructor',
      getPermissions: () => ({}),
    });
    const response = await request(`/${MESSAGE_ID}/actions/receiver`);
    expect(response.status).toBe(200);
    expect(service.getActions).toHaveBeenCalledWith(MESSAGE_ID, 'receiver', {
      permissions: {},
      user: { _id: 'u1' },
      isAdmin: false,
    });
  });

  it('is not enabled by inherited or truthy non-boolean default admin grants', async () => {
    for (const permissions of [
      Object.create({ 'is.admin': true }),
      { 'is.admin': 1 } as never,
      { 'is.admin': 'true' } as never,
      { 'is.admin': false },
      {},
    ]) {
      const { service, request } = await createAdminProbeClient({ getPermissions: () => permissions });
      const response = await request(`/${MESSAGE_ID}/actions/receiver`);
      expect(response.status).toBe(200);
      expect(service.getActions).toHaveBeenCalledWith(MESSAGE_ID, 'receiver', {
        permissions,
        user: { _id: 'u1' },
        isAdmin: false,
      });
    }
  });

  it('grants read-only only for own boolean true (normal and null-prototype maps)', async () => {
    for (const permissions of [{ 'is.admin': true }, nullPrototypeGrant('is.admin')]) {
      const { service, request } = await createAdminProbeClient({ getPermissions: () => permissions });
      const response = await request(`/${MESSAGE_ID}/actions/receiver`);
      expect(response.status).toBe(200);
      expect(service.getActions).toHaveBeenCalledWith(MESSAGE_ID, 'receiver', {
        permissions,
        user: { _id: 'u1' },
        isAdmin: true,
      });
    }
  });
});
