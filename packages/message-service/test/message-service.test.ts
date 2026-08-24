import { describe, it, expect, vi } from 'vitest';
import { NoopEmailProvider } from '../src/providers/email';
import { NoopPaymentProvider } from '../src/providers/payment';
import {
  ActionTemplateMismatchError,
  ActionConflictError,
  ActionNotificationPendingError,
  ClientRequestFailedError,
  ClientRequestInconsistentStateError,
  ClientRequestPendingError,
  InvalidMessageUserError,
  InvalidPaginationValueError,
  MessageArchivedError,
  MessageService,
  MessageNotFoundError,
  MessageTransactionRequiredError,
  PaymentSessionCompensationError,
} from '../src/message-service';
import { defaultRegistry } from '../src/template-registry';
import type { MessageTemplate } from '../src/types/template';

function matchesQuery(doc: any, query: any): boolean {
  if (!query) return true;
  if (query.$or) {
    return query.$or.some((clause: any) => matchesQuery(doc, clause));
  }
  return Object.entries(query).every(([key, value]) => {
    if (key === '$or') {
      return (value as any[]).some((clause: any) => matchesQuery(doc, clause));
    }
    if (value && typeof value === 'object' && '$in' in value) {
      return (value.$in as unknown[]).includes(doc[key]);
    }
    if (value && typeof value === 'object' && '$lte' in value) {
      return doc[key] <= value.$lte;
    }
    if (value && typeof value === 'object' && '$exists' in value) {
      return value.$exists ? doc[key] !== undefined : doc[key] === undefined;
    }
    if (value && typeof value === 'object' && '$type' in value) {
      return value.$type === 'string' ? typeof doc[key] === 'string' : true;
    }
    return doc[key] === value;
  });
}

function applyUpdate(doc: any, update: any) {
  if (update.$set) {
    Object.assign(doc, update.$set);
    return;
  }
  Object.assign(doc, update);
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
  const mockArchives: any[] = [];
  const mockMessageRequests: any[] = [];
  let createBarrier: Promise<void> | null = null;
  let releaseCreateBarrier: (() => void) | null = null;
  let requestCreateBarrier: Promise<void> | null = null;
  let releaseRequestCreateBarrier: (() => void) | null = null;

  const blockCreates = () => {
    createBarrier = new Promise<void>((resolve) => {
      releaseCreateBarrier = () => {
        createBarrier = null;
        releaseCreateBarrier = null;
        resolve();
      };
    });
  };

  const blockRequestCreates = () => {
    requestCreateBarrier = new Promise<void>((resolve) => {
      releaseRequestCreateBarrier = () => {
        requestCreateBarrier = null;
        releaseRequestCreateBarrier = null;
        resolve();
      };
    });
  };

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
      if (createBarrier) {
        await createBarrier;
      }

      if (Array.isArray(data)) {
        const created = [];
        for (const item of data) {
          created.push(await mockMessageModel.create(item));
        }
        return created;
      }

      if (
        data.clientRequestId !== null &&
        data.clientRequestId !== undefined &&
        data.clientRequestItemIndex !== null &&
        data.clientRequestItemIndex !== undefined &&
        mockMessages.some(
          (message) =>
            message.clientRequestId === data.clientRequestId &&
            message.clientRequestOwnerId === data.clientRequestOwnerId &&
            message.templateCd === data.templateCd &&
            message.clientRequestItemIndex === data.clientRequestItemIndex,
        )
      ) {
        const error = new Error('E11000 duplicate key error');
        (error as Error & { code: number }).code = 11000;
        throw error;
      }

      const doc = {
        ...data,
        _id: `msg-${mockMessages.length}`,
        createdAt: data.createdAt ?? new Date(mockMessages.length),
        isSender: function (user: any) {
          return this.fromUser !== null && user._id !== null && String(this.fromUser) === String(user._id).trim();
        },
        isReceiver: function (user: any) {
          return (
            (this.toUser !== null && user._id !== null && String(this.toUser) === String(user._id).trim()) ||
            (this.toRoles || []).some((role: string) => user.roles?.includes(role))
          );
        },
        toObject: function () {
          return { ...this };
        },
        archive: vi.fn(),
      };
      mockMessages.push(doc);
      return doc;
    }),
    findById: vi.fn(async (id: string) => mockMessages.find((m) => m._id === id) || null),
    findOneAndUpdate: vi.fn(async (query: any, data: any) => {
      const message = mockMessages.find((entry) => matchesQuery(entry, query));
      if (message) {
        applyUpdate(message, data);
      }
      return message ?? null;
    }),
    find: vi.fn((query: any) => {
      const matched = mockMessages.filter((m) => matchesQuery(m, query));
      return buildQuery(matched);
    }),
    countDocuments: vi.fn(async (query: any) => mockMessages.filter((m) => matchesQuery(m, query)).length),
    deleteOne: vi.fn(async (query: any) => {
      const index = mockMessages.findIndex((entry) => matchesQuery(entry, query));
      if (index >= 0) {
        mockMessages.splice(index, 1);
      }
      return { acknowledged: true, deletedCount: index >= 0 ? 1 : 0 };
    }),
  };

  const mockMessageRequestModel = {
    create: vi.fn(async (data: any) => {
      if (requestCreateBarrier) {
        await requestCreateBarrier;
      }

      if (
        mockMessageRequests.some(
          (request) =>
            request.clientRequestId === data.clientRequestId &&
            request.clientRequestOwnerId === data.clientRequestOwnerId &&
            request.templateCd === data.templateCd,
        )
      ) {
        const error = new Error('E11000 duplicate key error');
        (error as Error & { code: number }).code = 11000;
        throw error;
      }

      const doc = { ...data };
      mockMessageRequests.push(doc);
      return doc;
    }),
    findOne: vi.fn(async (query: any) => mockMessageRequests.find((request) => matchesQuery(request, query)) || null),
    updateOne: vi.fn(async (query: any, data: any) => {
      const request = mockMessageRequests.find((entry) => matchesQuery(entry, query));
      if (request) {
        applyUpdate(request, data);
      }
      return { acknowledged: true, matchedCount: request ? 1 : 0 };
    }),
    findOneAndUpdate: vi.fn(async (query: any, data: any) => {
      const request = mockMessageRequests.find((entry) => matchesQuery(entry, query));
      if (request) {
        applyUpdate(request, data);
      }
      return request ?? null;
    }),
    deleteOne: vi.fn(async (query: any) => {
      const index = mockMessageRequests.findIndex((entry) => matchesQuery(entry, query));
      if (index >= 0) {
        mockMessageRequests.splice(index, 1);
      }
      return { acknowledged: true };
    }),
  };

  const mockArchiveModel = {
    create: vi.fn(async (data: any) => {
      const items = Array.isArray(data) ? data : [data];
      const created = items.map((item) => ({
        ...item,
        _id: item._id ?? `arch-${Date.now()}`,
        archivedAt: item.archivedAt ?? new Date(),
        isSender: function (user: any) {
          return this.fromUser !== null && user._id !== null && String(this.fromUser) === String(user._id).trim();
        },
        isReceiver: function (user: any) {
          return (
            (this.toUser !== null && user._id !== null && String(this.toUser) === String(user._id).trim()) ||
            (this.toRoles || []).some((role: string) => user.roles?.includes(role))
          );
        },
      }));
      mockArchives.push(...created);
      return Array.isArray(data) ? created : created[0];
    }),
    findById: vi.fn(async (id: string) => {
      if (mockMessages.some((m) => m._id === id)) return null;
      return mockArchives.find((m) => m._id === id) || null;
    }),
    updateOne: vi.fn(async () => ({ acknowledged: true, matchedCount: 1 })),
  };

  const getModel = (name: string) => {
    if (name === 'Message') return mockMessageModel;
    if (name === 'MessageArchive') return mockArchiveModel;
    if (name === 'MessageRequest') return mockMessageRequestModel;
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
      payload: { name: 'Test', toUser: 'u2' },
    });

    const msg = mockMessages[0];
    const result = await service.getActions(msg._id, 'receiver', { user: { _id: 'u2' } });

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

  it('should reject missing and invalid users before returning normal actions', async () => {
    defaultRegistry.register(testTemplate);
    const service = new MessageService({ getModel });

    mockMessages.length = 0;
    await service.createMessage({ templateCd: 'svc-test', user: { _id: 'u1' }, payload: { toUser: 'u2' } });

    await expect(service.getActions(mockMessages[0]._id, 'receiver')).rejects.toBeInstanceOf(InvalidMessageUserError);
    await expect(service.getActions(mockMessages[0]._id, 'receiver', { user: { _id: '   ' } })).rejects.toBeInstanceOf(
      InvalidMessageUserError,
    );
  });

  it('should not match null message parties to sentinel-like user ids', async () => {
    defaultRegistry.register(testTemplate);
    const service = new MessageService({ getModel });

    mockMessages.length = 0;
    await service.createMessage({ templateCd: 'svc-test', user: { _id: 'u1' }, payload: { name: 'Test' } });

    const result = await service.getActions(mockMessages[0]._id, 'receiver', { user: { _id: 'null' } });

    expect(result).toBeNull();
  });

  it('should return no executable actions for archived messages', async () => {
    defaultRegistry.register(testTemplate);
    const service = new MessageService({ getModel });

    mockMessages.length = 0;
    mockArchives.length = 0;
    await mockArchiveModel.create({
      _id: 'archived-msg',
      templateCd: 'svc-test',
      fromUser: 'u1',
      toUser: 'u2',
      toRoles: [],
      payload: {},
      archivedAt: new Date(),
      actionCd: 'approve',
      actionNotificationState: 'none',
    });

    const result = await service.getActions('archived-msg', 'receiver', { user: { _id: 'u2' } });

    expect(result).not.toBeNull();
    expect(result!.actions).toEqual([]);
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
    const result = await service.getActions(msg._id, 'receiver', { isAdmin: true, user: { _id: 'admin1' } });

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
    expect(mockArchiveModel.create).toHaveBeenCalledWith(
      [
        expect.objectContaining({
          _id: msg._id,
          actionCd: 'approve',
          archivedBy: 'u2',
          actionNotificationState: 'none',
        }),
      ],
      undefined,
    );
    expect(mockMessageModel.deleteOne).toHaveBeenCalledWith(
      { _id: msg._id, actionState: 'processing', actionAttemptId: expect.any(String) },
      undefined,
    );
  });

  it('should reject a mismatched action template before handler lookup', async () => {
    const foreignHandler = vi.fn(async () => 'foreign');
    defaultRegistry.register(testTemplate);
    defaultRegistry.register({
      ...testTemplate,
      templateCd: 'foreign-template',
      actions: [{ ...testTemplate.actions[0], runHandler: foreignHandler }],
    });
    const service = new MessageService({ getModel });

    mockMessages.length = 0;
    await service.createMessage({ templateCd: 'svc-test', user: { _id: 'u1' }, payload: { toUser: 'u2' } });

    await expect(
      service.handleAction('foreign-template', 'approve', { message: mockMessages[0], user: { _id: 'u2' } }),
    ).rejects.toBeInstanceOf(ActionTemplateMismatchError);
    expect(foreignHandler).not.toHaveBeenCalled();
  });

  it('should provide a stable actionAttemptId to handlers', async () => {
    const runHandler = vi.fn(async (ctx) => ctx.actionAttemptId);
    defaultRegistry.register({
      ...testTemplate,
      actions: [{ ...testTemplate.actions[0], runHandler }],
    });
    const service = new MessageService({ getModel });

    mockMessages.length = 0;
    await service.createMessage({ templateCd: 'svc-test', user: { _id: 'u1' }, payload: { toUser: 'u2' } });

    const result = await service.handleAction('svc-test', 'approve', {
      message: mockMessages[0],
      user: { _id: 'u2' },
    });

    expect(typeof result).toBe('string');
    expect(runHandler).toHaveBeenCalledWith(expect.objectContaining({ actionAttemptId: result }));
  });

  it('should throw ActionConflictError when an action is already claimed', async () => {
    defaultRegistry.register(testTemplate);
    const service = new MessageService({ getModel });

    mockMessages.length = 0;
    await service.createMessage({ templateCd: 'svc-test', user: { _id: 'u1' }, payload: { toUser: 'u2' } });
    mockMessages[0].actionState = 'processing';
    mockMessages[0].actionCd = 'approve';
    mockMessages[0].actionAttemptId = 'attempt-1';
    mockMessages[0].actionLeaseExpiresAt = new Date(Date.now() + 60_000);

    await expect(
      service.handleAction('svc-test', 'approve', { message: mockMessages[0], user: { _id: 'u2' } }),
    ).rejects.toBeInstanceOf(ActionConflictError);
  });

  it('should report committed actions with pending sender notification separately', async () => {
    const notificationError = new Error('notify failed');
    defaultRegistry.register({
      ...testTemplate,
      actions: [
        {
          ...testTemplate.actions[0],
          senderNotification: async () => {
            throw notificationError;
          },
        },
      ],
    });
    const service = new MessageService({ getModel });

    mockMessages.length = 0;
    await service.createMessage({ templateCd: 'svc-test', user: { _id: 'u1' }, payload: { toUser: 'u2' } });

    await expect(
      service.handleAction('svc-test', 'approve', { message: mockMessages[0], user: { _id: 'u2' } }),
    ).rejects.toBeInstanceOf(ActionNotificationPendingError);
    expect(mockArchiveModel.updateOne).toHaveBeenCalledWith(
      { _id: 'msg-0', actionAttemptId: expect.any(String) },
      expect.objectContaining({ $set: expect.objectContaining({ actionNotificationState: 'failed' }) }),
    );
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
    mockMessageRequests.length = 0;
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

  it('should scope duplicate clientRequestId lookup to the requesting user', async () => {
    defaultRegistry.register(testTemplate);
    const service = new MessageService({ getModel });

    mockMessages.length = 0;
    mockMessageRequests.length = 0;
    const first = await service.createMessage({
      templateCd: 'svc-test',
      user: { _id: 'u1' },
      payload: { name: 'First' },
      clientRequestId: 'idem-cross-user',
    });
    const second = await service.createMessage({
      templateCd: 'svc-test',
      user: { _id: 'u2' },
      payload: { name: 'Second' },
      clientRequestId: 'idem-cross-user',
    });

    expect(second).toHaveLength(1);
    expect(second[0]._id).not.toBe(first[0]._id);
    expect(second[0].fromUser).toBe('u2');
    expect(mockMessages).toHaveLength(2);
  });

  it('should scope duplicate clientRequestId lookup to the template', async () => {
    defaultRegistry.register(testTemplate);
    defaultRegistry.register({ ...testTemplate, templateCd: 'svc-test-other' });
    const service = new MessageService({ getModel });

    mockMessages.length = 0;
    mockMessageRequests.length = 0;
    const first = await service.createMessage({
      templateCd: 'svc-test',
      user: { _id: 'u1' },
      payload: { name: 'First' },
      clientRequestId: 'idem-cross-template',
    });
    const second = await service.createMessage({
      templateCd: 'svc-test-other',
      user: { _id: 'u1' },
      payload: { name: 'Second' },
      clientRequestId: 'idem-cross-template',
    });

    expect(second).toHaveLength(1);
    expect(second[0]._id).not.toBe(first[0]._id);
    expect(second[0].templateCd).toBe('svc-test-other');
    expect(mockMessages).toHaveLength(2);
  });

  it('should trim but preserve case for clientRequestId scope', async () => {
    defaultRegistry.register(testTemplate);
    const service = new MessageService({ getModel });

    mockMessages.length = 0;
    mockMessageRequests.length = 0;
    const first = await service.createMessage({
      templateCd: 'svc-test',
      user: { _id: 'u1' },
      payload: { name: 'First' },
      clientRequestId: ' CaseSensitive ',
    });
    const replay = await service.createMessage({
      templateCd: 'svc-test',
      user: { _id: 'u1' },
      payload: { name: 'Replay' },
      clientRequestId: 'CaseSensitive',
    });
    const differentCase = await service.createMessage({
      templateCd: 'svc-test',
      user: { _id: 'u1' },
      payload: { name: 'Different' },
      clientRequestId: 'casesensitive',
    });

    expect(replay[0]._id).toBe(first[0]._id);
    expect(differentCase[0]._id).not.toBe(first[0]._id);
    expect(mockMessages).toHaveLength(2);
  });

  it('should reject invalid clientRequestId values at the service boundary', async () => {
    defaultRegistry.register(testTemplate);
    const service = new MessageService({ getModel });

    await expect(
      service.createMessage({ templateCd: 'svc-test', user: { _id: 'u1' }, clientRequestId: '' }),
    ).rejects.toThrow('clientRequestId must be a non-empty string after trimming whitespace');
    await expect(
      service.createMessage({ templateCd: 'svc-test', user: { _id: 'u1' }, clientRequestId: '   ' }),
    ).rejects.toThrow('clientRequestId must be a non-empty string after trimming whitespace');
    await expect(
      service.createMessage({ templateCd: 'svc-test', user: { _id: 'u1' }, clientRequestId: 123 }),
    ).rejects.toThrow('clientRequestId must be a string when provided');
    await expect(
      service.createMessage({ templateCd: 'svc-test', user: { _id: 'u1' }, clientRequestId: 'x'.repeat(129) }),
    ).rejects.toThrow('clientRequestId must be at most 128 characters');
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
    mockMessageRequests.length = 0;
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

  it('should return the existing batch when concurrent requests share a clientRequestId', async () => {
    const multiTemplate: MessageTemplate = {
      ...testTemplate,
      templateCd: 'multi-concurrent',
      prepareMessage: async ({ user }) => [
        { fromUser: user._id, toUser: 'u2', payload: { slot: 1 } },
        { fromUser: user._id, toUser: 'u3', payload: { slot: 2 } },
      ],
    };
    defaultRegistry.register(multiTemplate);
    const service = new MessageService({ getModel });

    mockMessages.length = 0;
    mockMessageRequests.length = 0;
    mockMessageModel.create.mockClear();
    blockRequestCreates();

    const firstRequest = service.createMessage({
      templateCd: 'multi-concurrent',
      user: { _id: 'u1' },
      clientRequestId: 'idem-concurrent',
    });

    releaseRequestCreateBarrier?.();
    blockCreates();

    const secondRequest = service.createMessage({
      templateCd: 'multi-concurrent',
      user: { _id: 'u1' },
      clientRequestId: 'idem-concurrent',
    });

    releaseCreateBarrier?.();

    const [first, second] = await Promise.all([firstRequest, secondRequest]);

    expect(first).toHaveLength(2);
    expect(second).toHaveLength(2);
    expect(second.map((item) => item._id)).toEqual(first.map((item) => item._id));
    expect(mockMessages).toHaveLength(2);
  });

  it('should not duplicate payment session creation for concurrent duplicate requests', async () => {
    const paymentProvider = {
      prefix: 'session',
      createSession: vi.fn(async function (this: { prefix: string }, user: unknown) {
        expect(this).toBe(paymentProvider);
        expect(user).toBe('payer-1');
        return `${this.prefix}-1`;
      }),
      expireSession: vi.fn(async () => undefined),
      refundPayment: vi.fn(async () => undefined),
    };
    const paymentTemplate: MessageTemplate = {
      ...testTemplate,
      templateCd: 'payment-test',
      paymentCd: 'payment-code',
      prepareMessage: async ({ user }) => ({ fromUser: user._id, toUser: 'u2', payload: { slot: 1 } }),
    };
    defaultRegistry.register(paymentTemplate);
    const service = new MessageService({ getModel, paymentProvider });

    mockMessages.length = 0;
    mockMessageRequests.length = 0;
    blockRequestCreates();

    const firstRequest = service.createMessage({
      templateCd: 'payment-test',
      user: { _id: 'u1' },
      payerUser: { _id: 'payer-1' },
      clientRequestId: 'idem-payment',
    });

    releaseRequestCreateBarrier?.();
    blockCreates();

    const secondRequest = service.createMessage({
      templateCd: 'payment-test',
      user: { _id: 'u1' },
      payerUser: { _id: 'payer-1' },
      clientRequestId: 'idem-payment',
    });

    releaseCreateBarrier?.();

    const [first, second] = await Promise.all([firstRequest, secondRequest]);

    expect(first).toHaveLength(1);
    expect(second).toHaveLength(1);
    expect(paymentProvider.createSession).toHaveBeenCalledOnce();
    expect(first[0]._id).toBe(second[0]._id);
  });

  it('should record a failed reservation when payment session creation returns null', async () => {
    const paymentProvider = {
      createSession: vi.fn(async () => null),
      expireSession: vi.fn(async () => undefined),
      refundPayment: vi.fn(async () => undefined),
    };
    const paymentTemplate: MessageTemplate = {
      ...testTemplate,
      templateCd: 'payment-null-test',
      paymentCd: 'payment-code',
      prepareMessage: async ({ user }) => ({ fromUser: user._id, toUser: 'u2' }),
    };
    defaultRegistry.register(paymentTemplate);
    const service = new MessageService({ getModel, paymentProvider });

    mockMessages.length = 0;
    mockMessageRequests.length = 0;

    await expect(
      service.createMessage({ templateCd: 'payment-null-test', user: { _id: 'u1' }, clientRequestId: 'payment-null' }),
    ).rejects.toThrow('payment session creation failed');
    expect(paymentProvider.expireSession).not.toHaveBeenCalled();
    expect(mockMessages).toHaveLength(0);
    expect(mockMessageRequests[0]).toMatchObject({
      state: 'failed',
      failureMessage: 'payment session creation failed',
    });
  });

  it('should record a failed reservation when payment session creation throws', async () => {
    const paymentProvider = {
      createSession: vi.fn(async () => {
        throw new Error('provider unavailable');
      }),
      expireSession: vi.fn(async () => undefined),
      refundPayment: vi.fn(async () => undefined),
    };
    const paymentTemplate: MessageTemplate = {
      ...testTemplate,
      templateCd: 'payment-throws-test',
      paymentCd: 'payment-code',
      prepareMessage: async ({ user }) => ({ fromUser: user._id, toUser: 'u2' }),
    };
    defaultRegistry.register(paymentTemplate);
    const service = new MessageService({ getModel, paymentProvider });

    mockMessages.length = 0;
    mockMessageRequests.length = 0;

    await expect(
      service.createMessage({
        templateCd: 'payment-throws-test',
        user: { _id: 'u1' },
        clientRequestId: 'payment-throws',
      }),
    ).rejects.toThrow('provider unavailable');
    expect(paymentProvider.expireSession).not.toHaveBeenCalled();
    expect(mockMessages).toHaveLength(0);
    expect(mockMessageRequests[0]).toMatchObject({ state: 'failed', failureMessage: 'provider unavailable' });
  });

  it('should expire a created payment session when message persistence fails', async () => {
    const paymentProvider = {
      createSession: vi.fn(async () => 'session-persist-failure'),
      expireSession: vi.fn(async () => undefined),
      refundPayment: vi.fn(async () => undefined),
    };
    const paymentTemplate: MessageTemplate = {
      ...testTemplate,
      templateCd: 'payment-persist-failure-test',
      paymentCd: 'payment-code',
      prepareMessage: async ({ user }) => ({ fromUser: user._id, toUser: 'u2' }),
    };
    defaultRegistry.register(paymentTemplate);
    mockMessageModel.create.mockRejectedValueOnce(new Error('write failed'));
    const service = new MessageService({ getModel, paymentProvider });

    mockMessages.length = 0;
    mockMessageRequests.length = 0;

    await expect(
      service.createMessage({
        templateCd: 'payment-persist-failure-test',
        user: { _id: 'u1' },
        clientRequestId: 'payment-persist-failure',
      }),
    ).rejects.toThrow('write failed');
    expect(paymentProvider.expireSession).toHaveBeenCalledWith('session-persist-failure');
    expect(mockMessages).toHaveLength(0);
    expect(mockMessageRequests[0]).toMatchObject({ state: 'failed', failureMessage: 'write failed' });
  });

  it('should surface and report compensation failures when expiring an uncommitted session fails', async () => {
    const compensationFailure = new Error('expire failed');
    const onPaymentCompensationFailure = vi.fn(async () => undefined);
    const paymentProvider = {
      createSession: vi.fn(async () => 'session-compensation-failure'),
      expireSession: vi.fn(async () => {
        throw compensationFailure;
      }),
      refundPayment: vi.fn(async () => undefined),
    };
    const paymentTemplate: MessageTemplate = {
      ...testTemplate,
      templateCd: 'payment-compensation-failure-test',
      paymentCd: 'payment-code',
      prepareMessage: async ({ user }) => ({ fromUser: user._id, toUser: 'u2' }),
    };
    defaultRegistry.register(paymentTemplate);
    mockMessageModel.create.mockRejectedValueOnce(new Error('write failed'));
    const service = new MessageService({ getModel, paymentProvider, onPaymentCompensationFailure });

    mockMessages.length = 0;
    mockMessageRequests.length = 0;

    await expect(
      service.createMessage({
        templateCd: 'payment-compensation-failure-test',
        user: { _id: 'u1' },
        clientRequestId: 'payment-compensation-failure',
      }),
    ).rejects.toBeInstanceOf(PaymentSessionCompensationError);
    expect(onPaymentCompensationFailure).toHaveBeenCalledWith(
      expect.objectContaining({
        operation: 'expire',
        sessionId: 'session-compensation-failure',
        error: compensationFailure,
        clientRequestId: 'payment-compensation-failure',
        clientRequestOwnerId: 'u1',
        templateCd: 'payment-compensation-failure-test',
      }),
    );
    expect(mockMessageRequests[0]).toMatchObject({
      state: 'failed',
      failureMessage: 'payment session compensation failed for session "session-compensation-failure" during expire',
    });
  });

  it('should preserve empty results for duplicate clientRequestId requests', async () => {
    const emptyTemplate: MessageTemplate = {
      ...testTemplate,
      templateCd: 'empty-test',
      prepareMessage: async () => null,
    };
    defaultRegistry.register(emptyTemplate);
    const service = new MessageService({ getModel });

    mockMessages.length = 0;
    mockMessageRequests.length = 0;

    const first = await service.createMessage({
      templateCd: 'empty-test',
      user: { _id: 'u1' },
      clientRequestId: 'idem-empty',
    });
    const second = await service.createMessage({
      templateCd: 'empty-test',
      user: { _id: 'u1' },
      clientRequestId: 'idem-empty',
    });

    expect(first).toEqual([]);
    expect(second).toEqual([]);
    expect(mockMessageRequests).toHaveLength(1);
    expect(mockMessageRequests[0]).toMatchObject({
      clientRequestId: 'idem-empty',
      clientRequestOwnerId: 'u1',
      templateCd: 'empty-test',
      state: 'completed',
      itemCount: 0,
      leaseExpiresAt: null,
    });
  });

  it('should not replay a partial batch before reservation completion', async () => {
    defaultRegistry.register(testTemplate);
    const service = new MessageService({ getModel, clientRequestWaitMs: 0 });

    mockMessages.length = 0;
    mockMessageRequests.length = 0;
    mockMessageRequests.push({
      clientRequestId: 'idem-partial',
      clientRequestOwnerId: 'u1',
      templateCd: 'svc-test',
      state: 'pending',
      itemCount: null,
      leaseOwnerId: 'owner-1',
      leaseExpiresAt: new Date(Date.now() + 60_000),
    });
    mockMessages.push({
      _id: 'msg-partial-0',
      clientRequestId: 'idem-partial',
      clientRequestOwnerId: 'u1',
      templateCd: 'svc-test',
      clientRequestItemIndex: 0,
      createdAt: new Date(),
    });

    await expect(
      service.createMessage({ templateCd: 'svc-test', user: { _id: 'u1' }, clientRequestId: 'idem-partial' }),
    ).rejects.toBeInstanceOf(ClientRequestPendingError);
  });

  it('should throw a controlled error for completed reservations with missing item indexes', async () => {
    defaultRegistry.register(testTemplate);
    const service = new MessageService({ getModel });

    mockMessages.length = 0;
    mockMessageRequests.length = 0;
    mockMessageRequests.push({
      clientRequestId: 'idem-corrupt',
      clientRequestOwnerId: 'u1',
      templateCd: 'svc-test',
      state: 'completed',
      itemCount: 2,
    });
    mockMessages.push({
      _id: 'msg-corrupt-0',
      clientRequestId: 'idem-corrupt',
      clientRequestOwnerId: 'u1',
      templateCd: 'svc-test',
      clientRequestItemIndex: 0,
      createdAt: new Date(),
    });

    await expect(
      service.createMessage({ templateCd: 'svc-test', user: { _id: 'u1' }, clientRequestId: 'idem-corrupt' }),
    ).rejects.toBeInstanceOf(ClientRequestInconsistentStateError);
  });

  it('should replay recorded reservation failures as stable errors', async () => {
    defaultRegistry.register(testTemplate);
    const service = new MessageService({ getModel });

    mockMessages.length = 0;
    mockMessageRequests.length = 0;
    mockMessageRequests.push({
      clientRequestId: 'idem-failed',
      clientRequestOwnerId: 'u1',
      templateCd: 'svc-test',
      state: 'failed',
      itemCount: null,
      failureMessage: 'boom',
    });

    await expect(
      service.createMessage({ templateCd: 'svc-test', user: { _id: 'u1' }, clientRequestId: 'idem-failed' }),
    ).rejects.toBeInstanceOf(ClientRequestFailedError);
  });

  it('should fail clearly when MongoDB transactions are unavailable for idempotent batches', async () => {
    defaultRegistry.register(testTemplate);
    const session = {
      withTransaction: vi.fn(async () => {
        throw new Error('Transaction numbers are only allowed on a replica set member or mongos');
      }),
      endSession: vi.fn(async () => undefined),
    };
    (mockMessageModel as any).db = { startSession: vi.fn(async () => session) };
    const service = new MessageService({ getModel });

    mockMessages.length = 0;
    mockMessageRequests.length = 0;
    try {
      await expect(
        service.createMessage({ templateCd: 'svc-test', user: { _id: 'u1' }, clientRequestId: 'no-transactions' }),
      ).rejects.toBeInstanceOf(MessageTransactionRequiredError);
      expect(session.endSession).toHaveBeenCalledOnce();
      expect(mockMessageRequests[0]).toMatchObject({
        clientRequestId: 'no-transactions',
        state: 'failed',
      });
    } finally {
      delete (mockMessageModel as any).db;
    }
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

  it('should reject invalid pagination configuration', () => {
    expect(() => new MessageService({ getModel, maxListLimit: 0 })).toThrow(InvalidPaginationValueError);
    expect(() => new MessageService({ getModel, maxListLimit: Number.NaN })).toThrow(InvalidPaginationValueError);
    expect(() => new MessageService({ getModel, maxListLimit: Number.POSITIVE_INFINITY })).toThrow(
      InvalidPaginationValueError,
    );
    expect(() => new MessageService({ getModel, maxListLimit: 1.5 })).toThrow(InvalidPaginationValueError);
    expect(() => new MessageService({ getModel, defaultListLimit: 0 })).toThrow(InvalidPaginationValueError);
    expect(() => new MessageService({ getModel, defaultListLimit: 11, maxListLimit: 10 })).toThrow(
      InvalidPaginationValueError,
    );
  });

  it('should reject non-finite or fractional request pagination values', async () => {
    const service = new MessageService({ getModel });

    await expect(service.listMessages({ user: { _id: 'u1' }, limit: Number.NaN })).rejects.toBeInstanceOf(
      InvalidPaginationValueError,
    );
    await expect(service.listMessages({ user: { _id: 'u1' }, limit: Number.POSITIVE_INFINITY })).rejects.toBeInstanceOf(
      InvalidPaginationValueError,
    );
    await expect(service.listMessages({ user: { _id: 'u1' }, limit: 1.5 })).rejects.toBeInstanceOf(
      InvalidPaginationValueError,
    );
    await expect(service.listMessages({ user: { _id: 'u1' }, skip: Number.NEGATIVE_INFINITY })).rejects.toBeInstanceOf(
      InvalidPaginationValueError,
    );
    await expect(service.listMessages({ user: { _id: 'u1' }, skip: 1.5 })).rejects.toBeInstanceOf(
      InvalidPaginationValueError,
    );
  });

  it('should normalize bounded request pagination values', async () => {
    const service = new MessageService({ getModel, defaultListLimit: 2, maxListLimit: 2 });
    mockMessages.length = 0;
    await mockMessageModel.create({ fromUser: 'u1', toRoles: [] });
    await mockMessageModel.create({ fromUser: 'u1', toRoles: [] });
    await mockMessageModel.create({ fromUser: 'u1', toRoles: [] });

    await expect(service.listMessages({ user: { _id: 'u1' }, limit: 0 })).resolves.toHaveLength(1);
    await expect(service.listMessages({ user: { _id: 'u1' }, limit: -10 })).resolves.toHaveLength(1);
    await expect(service.listMessages({ user: { _id: 'u1' }, limit: 100 })).resolves.toHaveLength(2);
    await expect(service.listMessages({ user: { _id: 'u1' }, limit: 2, skip: -10 })).resolves.toHaveLength(2);
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
        message: { templateCd: 'missing', isReceiver: () => true, isSender: () => false } as never,
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
      payload: { name: 'Widget', toUser: 'u2' },
    });

    const msg = mockMessages[0];
    const result = await service.getActions(msg._id, 'receiver', { user: { _id: 'u2' } });
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
    const result = await service.getActions(msg._id, 'receiver', { user: { _id: 'u2' } });
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
