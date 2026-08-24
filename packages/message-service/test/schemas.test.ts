import { describe, it, expect } from 'vitest';
import { buildMessageSchema } from '../src/schemas/message';
import { buildMessageArchiveSchema } from '../src/schemas/message-archive';
import { buildMessageRequestSchema } from '../src/schemas/message-request';
import { isReceiver, isSender } from '../src/schemas/methods';
import { MESSAGE_MODEL_NAME, MESSAGE_ARCHIVE_MODEL_NAME, MESSAGE_REQUEST_MODEL_NAME } from '../src/schemas/base';

describe('buildMessageSchema (factory)', () => {
  it('should return a fresh schema each call', () => {
    const a = buildMessageSchema();
    const b = buildMessageSchema();
    expect(a).not.toBe(b);
  });

  it('should include all base message fields', () => {
    const schema = buildMessageSchema();
    const paths = Object.keys(schema.paths);
    for (const field of [
      'templateCd',
      'type',
      'fromUser',
      'toUser',
      'toRoles',
      'senderContent',
      'receiverContent',
      'documents',
      'paymentSession',
      'paymentCd',
      'payload',
      'display',
      'clientRequestId',
      'clientRequestOwnerId',
      'clientRequestItemIndex',
    ]) {
      expect(paths).toContain(field);
    }
  });

  it('should register isSender, isReceiver, archive methods', () => {
    const schema = buildMessageSchema();
    expect(schema.methods.isSender).toBeDefined();
    expect(schema.methods.isReceiver).toBeDefined();
    expect(schema.methods.archive).toBeDefined();
  });

  it('should NOT register a pre-save hook when emailNotifier is null', () => {
    const schema = buildMessageSchema();
    const hooks = (schema as any).s.hooks;
    const saveHooks = hooks?.get?.('save') || [];
    expect(saveHooks).toHaveLength(0);
  });

  it('should throw if emailNotifier is set but userModelName is not registered', () => {
    expect(() => buildMessageSchema({ emailNotifier: () => {}, userModelName: 'DefinitelyNotRegistered' })).toThrow(
      /DefinitelyNotRegistered/,
    );
  });

  it('should support clientRequestId in the field set', () => {
    const schema = buildMessageSchema({});
    const paths = Object.keys(schema.paths);
    expect(paths).toContain('clientRequestId');
    expect(paths).toContain('clientRequestOwnerId');
    expect(paths).toContain('clientRequestItemIndex');
  });

  it('should enforce unique scoped clientRequestId item indexes', () => {
    const schema = buildMessageSchema({});
    const index = schema
      .indexes()
      .find(
        ([fields]) =>
          fields.clientRequestOwnerId === 1 &&
          fields.templateCd === 1 &&
          fields.clientRequestId === 1 &&
          fields.clientRequestItemIndex === 1,
      );

    expect(index).toBeDefined();
    expect(index?.[1]).toMatchObject({
      unique: true,
      partialFilterExpression: {
        clientRequestId: { $type: 'string' },
        clientRequestOwnerId: { $type: 'string' },
        templateCd: { $type: 'string' },
        clientRequestItemIndex: { $type: 'number' },
      },
    });
  });

  it('should declare branch-aligned visibility indexes with stable descending order', () => {
    const schema = buildMessageSchema({});
    const fields = schema.indexes().map(([indexFields]) => indexFields);

    expect(fields).toContainEqual({ fromUser: 1, createdAt: -1, _id: -1 });
    expect(fields).toContainEqual({ toUser: 1, createdAt: -1, _id: -1 });
    expect(fields).toContainEqual({ toRoles: 1, createdAt: -1, _id: -1 });
  });

  it('should default senderContent and receiverContent to full IMessageContent shape', () => {
    const schema = buildMessageSchema();
    const senderPaths = (schema.paths.senderContent as unknown as { schema: { paths: Record<string, unknown> } }).schema
      .paths;
    const receiverPaths = (schema.paths.receiverContent as unknown as { schema: { paths: Record<string, unknown> } })
      .schema.paths;
    for (const field of ['title', 'long', 'short']) {
      expect(senderPaths).toHaveProperty(field);
      expect(receiverPaths).toHaveProperty(field);
    }
  });
});

describe('buildMessageArchiveSchema (factory)', () => {
  it('should return a fresh schema each call', () => {
    const a = buildMessageArchiveSchema();
    const b = buildMessageArchiveSchema();
    expect(a).not.toBe(b);
  });

  it('should include actionCd, archivedBy, archivedAt fields', () => {
    const schema = buildMessageArchiveSchema();
    const paths = Object.keys(schema.paths);
    expect(paths).toContain('actionCd');
    expect(paths).toContain('archivedBy');
    expect(paths).toContain('archivedAt');
    expect(paths).toContain('actionAttemptId');
    expect(paths).toContain('actionNotificationState');
    expect(paths).toContain('actionNotificationError');
    expect(paths).toContain('actionNotificationAttemptedAt');
  });
});

describe('buildMessageRequestSchema (factory)', () => {
  it('should return a fresh schema each call', () => {
    const a = buildMessageRequestSchema();
    const b = buildMessageRequestSchema();
    expect(a).not.toBe(b);
  });

  it('should include reservation fields and a unique scoped clientRequestId index', () => {
    const schema = buildMessageRequestSchema();
    const index = schema
      .indexes()
      .find(([fields]) => fields.clientRequestOwnerId === 1 && fields.templateCd === 1 && fields.clientRequestId === 1);

    expect(Object.keys(schema.paths)).toEqual(
      expect.arrayContaining([
        'clientRequestId',
        'clientRequestOwnerId',
        'templateCd',
        'state',
        'itemCount',
        'leaseOwnerId',
        'leaseExpiresAt',
        'completedAt',
        'failedAt',
        'failureMessage',
      ]),
    );
    expect(index).toBeDefined();
    expect(index?.[1]).toMatchObject({ unique: true });
  });
});

describe('model name constants', () => {
  it('should export the standard names', () => {
    expect(MESSAGE_MODEL_NAME).toBe('Message');
    expect(MESSAGE_ARCHIVE_MODEL_NAME).toBe('MessageArchive');
    expect(MESSAGE_REQUEST_MODEL_NAME).toBe('MessageRequest');
  });
});

describe('message relationship methods', () => {
  it('should not equate null parties with sentinel-like string user ids', () => {
    expect(isSender.call({ fromUser: null }, { _id: 'null' })).toBe(false);
    expect(isReceiver.call({ toUser: null, toRoles: [] }, { _id: 'null' })).toBe(false);
    expect(isSender.call({ fromUser: '' }, { _id: '' })).toBe(false);
    expect(isReceiver.call({ toUser: '', toRoles: [] }, { _id: '' })).toBe(false);
  });
});
