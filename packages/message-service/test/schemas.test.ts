import { describe, it, expect } from 'vitest';
import { buildMessageSchema } from '../src/schemas/message';
import { buildMessageArchiveSchema } from '../src/schemas/message-archive';
import { MESSAGE_MODEL_NAME, MESSAGE_ARCHIVE_MODEL_NAME } from '../src/schemas/base';

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
  });
});

describe('model name constants', () => {
  it('should export the standard names', () => {
    expect(MESSAGE_MODEL_NAME).toBe('Message');
    expect(MESSAGE_ARCHIVE_MODEL_NAME).toBe('MessageArchive');
  });
});
