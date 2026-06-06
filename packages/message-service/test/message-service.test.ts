import { describe, it, expect, vi } from 'vitest';
import { NoopEmailProvider } from '../src/providers/email';
import { NoopPaymentProvider } from '../src/providers/payment';
import { MessageService } from '../src/message-service';
import { defaultRegistry } from '../src/template-registry';
import type { MessageTemplate } from '../src/types/template';

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

  const mockMessageModel = {
    create: vi.fn(async (data: any) => {
      const doc = {
        ...data,
        _id: `msg-${mockMessages.length}`,
        isSender: () => true,
        isReceiver: () => true,
        archive: vi.fn(),
      };
      mockMessages.push(doc);
      return doc;
    }),
    findById: vi.fn(async (id: string) => mockMessages.find((m) => m._id === id) || null),
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
    expect(callArgs.templateCd).toBe('generic-notification');
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
      payload: { name: 'Test' },
    });

    const msg = mockMessages[0];
    const result = await service.handleAction('svc-test', 'approve', {
      message: msg,
      user: { _id: 'admin1', roles: ['admin'] },
    });

    expect(result).toBe('approved');
    expect(msg.archive).toHaveBeenCalledWith('approve', 'admin1', expect.any(Object));
  });
});
