import { describe, it, expect, vi } from 'vitest';
import { NoopEmailProvider } from '../src/providers/email';
import { NoopPaymentProvider } from '../src/providers/payment';
import { MessageArchivedError, MessageService, MessageNotFoundError } from '../src/message-service';
import { defaultRegistry } from '../src/template-registry';
import type { MessageTemplate } from '../src/types/template';

function matchesQuery(doc: any, query: any): boolean {
  if (!query) return true;
  if (query.$or) {
    return query.$or.some((clause: any) => matchesQuery(doc, clause));
  }
  return Object.entries(query).every(([key, value]) => {
    if (value && typeof value === 'object' && '$in' in value) {
      return (value.$in as unknown[]).includes(doc[key]);
    }
    return doc[key] === value;
  });
}

// ---------------------------------------------------------------------------
// Providers
// ---------------------------------------------------------------------------

describe('NoopEmailProvider', () => {
  it('should send without errors', async () => {
    const provider = new NoopEmailProvider();
    await expect(provider.sendNotification('test@example.com', 'Title', 'Body')).resolves.toBeUndefined();
  });
});

describe('NoopPaymentProvider', () => {
  it('should return null for createSession', async () => {
    const provider = new NoopPaymentProvider();
    const result = await provider.createSession({}, 'code');
    expect(result).toBeNull();
  });

  it('should do nothing for expireSession', async () => {
    const provider = new NoopPaymentProvider();
    await expect(provider.expireSession('session-123')).resolves.toBeUndefined();
  });

  it('should do nothing for refundPayment', async () => {
    const provider = new NoopPaymentProvider();
    await expect(provider.refundPayment('session-123')).resolves.toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// MessageService
// ---------------------------------------------------------------------------

describe('MessageService', () => {
  const mockMessages: any[] = [];

  const sortMessages = (docs: any[]) =>
    docs.slice().sort((a, b) => {
      const aCreated = a.createdAt instanceof Date ? a.createdAt.getTime() : 0;
      const bCreated = b.createdAt instanceof Date ? b.createdAt.getTime() : 0;
      if (aCreated !== bCreated) return aCreated - bCreated;
      return String(a._id).localeCompare(String(b._id));
    });

  const buildQuery = (docs: any[]) => {
    const state = {
      docs: sortMessages(docs),
      skip: 0,
      limit: undefined as number | undefined,
    };

    const exec = () => {
      const sliced = state.docs.slice(state.skip);
      return Promise.resolve(state.limit === undefined ? sliced : sliced.slice(0, state.limit));
    };

    return {
      sort: () => buildQuery(state.docs),
      skip: (value: number) => {
        state.skip = value;
        return buildQuery(state.docs.slice(state.skip));
      },
      limit: (value: number) => {
        state.limit = value;
        return exec();
      },
      then: exec().then.bind(exec()),
      catch: exec().catch.bind(exec()),
    };
  };

  const mockMessageModel = {
    create: vi.fn(async (data: any) => {
      const doc = {
        ...data,
        _id: `msg-${mockMessages.length}`,
        createdAt: data.createdAt ?? new Date(mockMessages.length),
        isSender: function (user: any) {
          return String(this.fromUser) === String(user._id);
        },
        isReceiver: function (user: any) {
          return (
            String(this.toUser) === String(user._id) ||
            (this.toRoles || []).some((role: string) => user.roles?.includes(role))
          );
        },
        archive: vi.fn(),
      };
      mockMessages.push(doc);
      return doc;
    }),
    findById: vi.fn(async (id: string) => mockMessages.find((m) => m._id === id) || null),
    find: vi.fn((query: any) => {
      const matched = mockMessages.filter((m) => matchesQuery(m, query));
      return buildQuery(matched);
    }),
    countDocuments: vi.fn(async (query: any) => mockMessages.filter((m) => matchesQuery(m, query)).length),
  };

  const mockArchiveModel = {
    create: vi.fn(async (data: any) => ({ ...data, _id: `arch-${Date.now()}` })),
    findById: vi.fn(async () => null),
  };

  const getModel = (name: string) => {
    if (name === 'Message') return mockMessageModel;
    if (name === 'MessageArchive') return mockArchiveModel;
    throw new Error(`Unknown model: ${name}`);
  };

  const testTemplate: MessageTemplate = {
    templateCd: 'svc-test',
    type: 'request',
    description: 'Test',
    senderContent: { title: 'Send Title', long: 'Send Long', short: 'Send Short' },
    receiverContent: { title: 'Recv Title', long: 'Recv Long {{name}}', short: 'Recv Short' },
    uiTemplate: 'default-message',
    prepareMessage: async ({ user, payload }) => ({
      templateData: { name: (payload as any).name },

      fromUser: (user as any)._id,

      toUser: (payload as any).toUser || null,
      payload,
    }),
    actions: [
      {
        actionCd: 'approve',
        name: 'Approve',
        variant: 'success',
        sender: false,
        receiver: true,
        runHandler: async () => 'approved',
      },
    ],
  };

  it('should throw on unknown template', async () => {
    const service = new MessageService({ getModel });
    await expect(
      service.createMessage({
        templateCd: 'unknown',
        user: { _id: 'u1' },
        payload: {},
      }),
    ).rejects.toThrow('template "unknown" not found');
  });

  it('should create a message from template', async () => {
    defaultRegistry.register(testTemplate);
    const service = new MessageService({ getModel });

    const results = await service.createMessage({
      templateCd: 'svc-test',
      user: { _id: 'u1', displayName: 'Test User' },
      payload: { name: 'Widget' },
    });

    expect(results).toHaveLength(1);
    expect(mockMessageModel.create).toHaveBeenCalled();
    const callArgs = mockMessageModel.create.mock.calls[0][0];
    expect(callArgs.templateCd).toBe('svc-test');
    expect(callArgs.type).toBe('request');
    expect(callArgs.fromUser).toBe('u1');
    expect(callArgs.receiverContent.long).toBe('Recv Long Widget');
  });

  it('should create a generic notification', async () => {
    const service = new MessageService({ getModel });

    const result = await service.createNotification({
      toUser: 'u2',
      receiverContent: { title: 'Hello', long: 'World' },
    });

    expect(result).toBeDefined();
    expect(mockMessageModel.create).toHaveBeenCalled();
    const callArgs = mockMessageModel.create.mock.calls[mockMessageModel.create.mock.calls.length - 1][0];
    expect(callArgs.type).toBe('notification');
    expect(callArgs.templateCd).toBe('__generic-notification__');
    expect(callArgs.toUser).toBe('u2');
  });

  it('should get actions for a message', async () => {
    defaultRegistry.register(testTemplate);
    const service = new MessageService({ getModel });

    // First create a message so it exists
    mockMessages.length = 0;
    await service.createMessage({
      templateCd: 'svc-test',
      user: { _id: 'u1' },
      payload: { name: 'Test' },
    });

    const msg = mockMessages[0];
    const result = await service.getActions(msg._id, 'receiver');

    expect(result).not.toBeNull();
    expect(result!.uiTemplate).toBe('default-message');
    expect(result!.actions).toHaveLength(1);
    expect(result!.actions[0].actionCd).toBe('approve');
  });

  it('should hide actions when the caller does not match the claimed usertype', async () => {
    defaultRegistry.register(testTemplate);
    const service = new MessageService({ getModel });

    mockMessages.length = 0;
    await service.createMessage({
      templateCd: 'svc-test',
      user: { _id: 'u1' },
      payload: { name: 'Test', toUser: 'u2' },
    });

    const msg = mockMessages[0];
    const result = await service.getActions(msg._id, 'receiver', { user: { _id: 'u3' } });

    expect(result).toBeNull();
  });

  it('should return empty actions for admin viewers', async () => {
    defaultRegistry.register(testTemplate);
    const service = new MessageService({ getModel });

    mockMessages.length = 0;
    await service.createMessage({
      templateCd: 'svc-test',
      user: { _id: 'u1' },
      payload: { name: 'Test' },
    });

    const msg = mockMessages[0];
    const result = await service.getActions(msg._id, 'receiver', { isAdmin: true });

    expect(result).not.toBeNull();
    expect(result!.actions).toHaveLength(0);
  });

  it('should execute an action and archive the message', async () => {
    defaultRegistry.register(testTemplate);
    const service = new MessageService({ getModel });

    mockMessages.length = 0;
    await service.createMessage({
      templateCd: 'svc-test',
      user: { _id: 'u1' },
      payload: { name: 'Test', toUser: 'u2' },
    });

    const msg = mockMessages[0];
    const result = await service.handleAction('svc-test', 'approve', {
      message: msg,
      user: { _id: 'u2' },
    });

    expect(result).toBe('approved');
    expect(msg.archive).toHaveBeenCalledWith('approve', 'u2', expect.any(Object));
  });

  it('should throw ActionNotFoundError for unknown action', async () => {
    defaultRegistry.register(testTemplate);
    const service = new MessageService({ getModel });

    mockMessages.length = 0;
    await service.createMessage({
      templateCd: 'svc-test',
      user: { _id: 'u1' },
      payload: { name: 'Test' },
    });

    const msg = mockMessages[0];
    await expect(
      service.handleAction('svc-test', 'unknown-action', {
        message: msg,
        user: { _id: 'admin1' },
      }),
    ).rejects.toThrow('action "unknown-action" not found in template "svc-test"');
  });

  it('should throw ActionNotAllowedError when user has no role', async () => {
    defaultRegistry.register(testTemplate);
    const service = new MessageService({ getModel });

    mockMessages.length = 0;
    await service.createMessage({
      templateCd: 'svc-test',
      user: { _id: 'u1' },
      payload: { name: 'Test' },
    });

    const msg = mockMessages[0];
    // testTemplate approve is receiver-only
    await expect(
      service.handleAction('svc-test', 'approve', {
        message: msg,
        user: { _id: 'u2' },
      }),
    ).rejects.toThrow('not allowed');
  });

  it('should return existing message on duplicate clientRequestId', async () => {
    defaultRegistry.register(testTemplate);
    const service = new MessageService({ getModel });

    mockMessages.length = 0;
    const first = await service.createMessage({
      templateCd: 'svc-test',
      user: { _id: 'u1' },
      payload: { name: 'First' },
      clientRequestId: 'idem-1',
    });
    const second = await service.createMessage({
      templateCd: 'svc-test',
      user: { _id: 'u1' },
      payload: { name: 'Second' },
      clientRequestId: 'idem-1',
    });

    expect(second).toHaveLength(1);
    expect(second[0]._id).toBe(first[0]._id);
    expect(mockMessages).toHaveLength(1);
  });

  it('should return the full batch on duplicate clientRequestId', async () => {
    const multiTemplate: MessageTemplate = {
      ...testTemplate,
      templateCd: 'multi-test',
      prepareMessage: async ({ user }) => [
        { fromUser: user._id, toUser: 'u2', payload: { slot: 1 } },
        { fromUser: user._id, toUser: 'u3', payload: { slot: 2 } },
      ],
    };
    defaultRegistry.register(multiTemplate);
    const service = new MessageService({ getModel });

    mockMessages.length = 0;
    const first = await service.createMessage({
      templateCd: 'multi-test',
      user: { _id: 'u1' },
      clientRequestId: 'idem-batch',
    });
    const second = await service.createMessage({
      templateCd: 'multi-test',
      user: { _id: 'u1' },
      clientRequestId: 'idem-batch',
    });

    expect(first).toHaveLength(2);
    expect(second).toHaveLength(2);
    expect(second.map((item) => item._id)).toEqual(first.map((item) => item._id));
    expect(mockMessages).toHaveLength(2);
  });

  it('should list messages for a user', async () => {
    defaultRegistry.register(testTemplate);
    const service = new MessageService({ getModel });

    mockMessages.length = 0;
    await service.createMessage({
      templateCd: 'svc-test',
      user: { _id: 'u1' },
      payload: { name: 'A' },
    });
    await service.createMessage({
      templateCd: 'svc-test',
      user: { _id: 'u2' },
      payload: { name: 'B' },
    });

    const result = await service.listMessages({ user: { _id: 'u1' }, limit: 10 });
    expect(result).toHaveLength(1);
    expect(result[0]._id).toBe('msg-0');
  });

  it('should count messages for a user', async () => {
    defaultRegistry.register(testTemplate);
    const service = new MessageService({ getModel });

    mockMessages.length = 0;
    await service.createMessage({
      templateCd: 'svc-test',
      user: { _id: 'u1' },
      payload: { name: 'A' },
    });
    await service.createMessage({
      templateCd: 'svc-test',
      user: { _id: 'u2' },
      payload: { name: 'B' },
    });

    const count = await service.countMessages({ _id: 'u1' });
    expect(count).toBe(1);
  });

  it('should build the same visibility filter used by list/count', () => {
    const service = new MessageService({ getModel });
    expect(service.buildVisibilityFilter({ _id: 'u1', roles: ['ops'] })).toEqual({
      $or: [{ fromUser: 'u1' }, { toUser: 'u1' }, { toRoles: { $in: ['ops'] } }],
    });
  });

  it('should find archived messages by the original id', async () => {
    const service = new MessageService({ getModel });
    mockArchiveModel.findById = vi.fn(async (id: string) =>
      id === 'archived-1' ? { _id: 'archived-1', templateCd: 'svc-test' } : null,
    );

    const result = await service.findMessage('archived-1');

    expect(result).toEqual({ _id: 'archived-1', templateCd: 'svc-test' });
    expect(mockArchiveModel.findById).toHaveBeenCalledWith('archived-1');
  });

  it('should throw MessageNotFoundError from findMessageOrThrow', async () => {
    const service = new MessageService({ getModel });

    await expect(service.findMessageOrThrow('missing-id')).rejects.toBeInstanceOf(MessageNotFoundError);
  });

  it('should throw MessageArchivedError when handling an archived message', async () => {
    defaultRegistry.register(testTemplate);
    const service = new MessageService({ getModel });

    await expect(
      service.handleAction('svc-test', 'approve', {
        message: {
          _id: 'arch-1',
          templateCd: 'svc-test',
          archivedAt: new Date(),
          isSender: () => false,
          isReceiver: () => true,
        } as never,
        user: { _id: 'u2' },
      }),
    ).rejects.toBeInstanceOf(MessageArchivedError);
  });

  it('should throw TemplateNotFoundError for unknown template in handleAction', async () => {
    const service = new MessageService({ getModel });
    await expect(
      service.handleAction('missing', 'approve', {
        message: { isReceiver: () => true, isSender: () => false } as never,
        user: { _id: 'u1' },
      }),
    ).rejects.toThrow('template "missing" not found');
  });

  it('should interpolate action names against message.payload', async () => {
    const template: MessageTemplate = {
      ...testTemplate,
      actions: [
        {
          ...testTemplate.actions[0],
          name: 'Approve {{name}}',
        },
      ],
    };
    defaultRegistry.register(template);
    const service = new MessageService({ getModel });

    mockMessages.length = 0;
    await service.createMessage({
      templateCd: 'svc-test',
      user: { _id: 'u1' },
      payload: { name: 'Widget' },
    });

    const msg = mockMessages[0];
    const result = await service.getActions(msg._id, 'receiver');
    expect(result).not.toBeNull();
    expect(result!.actions[0].name).toBe('Approve Widget');
  });

  it('should return empty actions for generic notifications', async () => {
    const service = new MessageService({ getModel });

    mockMessages.length = 0;
    await service.createNotification({
      toUser: 'u2',
      receiverContent: { title: 'Hi', long: 'World' },
    });

    const msg = mockMessages[0];
    const result = await service.getActions(msg._id, 'receiver');
    expect(result).not.toBeNull();
    expect(result!.actions).toHaveLength(0);
    expect(result!.uiTemplate).toBe('notification');
  });

  it('should accept fromUser and senderContent in createNotification', async () => {
    const service = new MessageService({ getModel });

    mockMessageModel.create.mockClear();
    mockMessages.length = 0;
    await service.createNotification({
      fromUser: 'admin1',
      toUser: 'u2',
      senderContent: { title: 'Admin Broadcast', long: 'From your admin', short: 'Admin' },
      receiverContent: { title: 'Hello', long: 'World' },
    });

    const callArgs = mockMessageModel.create.mock.calls[0][0];
    expect(callArgs.fromUser).toBe('admin1');
    expect(callArgs.senderContent).toEqual({ title: 'Admin Broadcast', long: 'From your admin', short: 'Admin' });
    expect(callArgs.toUser).toBe('u2');
  });

  it('should throw TemplateNotFoundError when no template is registered', async () => {
    const { TemplateNotFoundError } = await import('../src/message-service');
    const service = new MessageService({ getModel });
    await expect(service.createMessage({ templateCd: 'none', user: { _id: 'u1' } })).rejects.toBeInstanceOf(
      TemplateNotFoundError,
    );
  });

  it('should use a custom registry when provided', async () => {
    const { TemplateRegistry } = await import('../src/template-registry');
    const registry = new TemplateRegistry();
    registry.register({ ...testTemplate, templateCd: 'custom-tpl' });
    const service = new MessageService({ getModel, registry });

    mockMessages.length = 0;
    const results = await service.createMessage({
      templateCd: 'custom-tpl',
      user: { _id: 'u1' },
      payload: { name: 'Widget' },
    });
    expect(results).toHaveLength(1);
    expect(results[0].templateCd).toBe('custom-tpl');
  });
});
