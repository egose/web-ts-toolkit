import mongoose from 'mongoose';
import { afterAll, afterEach, describe, expect, it, vi } from 'vitest';
import { serializePublicMessage, type MessageTemplate, type PrepareResult } from '../src/index';
import {
  createMongoMessageServiceFixture,
  stopMongoReplicaSet,
  type MongoMessageServiceFixture,
} from './support/mongodb-fixture';

const senderId = new mongoose.Types.ObjectId();
const receiverId = new mongoose.Types.ObjectId();

function template(prepareMessage: MessageTemplate['prepareMessage']): MessageTemplate {
  return {
    templateCd: 'prepared-documents',
    type: 'request',
    description: 'MSGA-06 prepared attachment selection',
    senderContent: { title: 'Sent {{name}}', long: 'S', short: 'S' },
    receiverContent: { title: 'Review {{name}}', long: 'R', short: 'R' },
    uiTemplate: 'default-message',
    prepareMessage,
    actions: [
      {
        actionCd: 'approve',
        name: 'Approve {{name}}',
        variant: 'primary',
        sender: false,
        receiver: true,
        runHandler: async () => 'approved',
      },
    ],
  };
}

describe('MSGA-06 prepared documents (real MongoDB)', () => {
  const fixtures: MongoMessageServiceFixture[] = [];

  async function fixture(definition: MessageTemplate) {
    const created = await createMongoMessageServiceFixture({ templates: [definition] });
    fixtures.push(created);
    return created;
  }

  afterEach(async () => {
    vi.restoreAllMocks();
    for (const created of fixtures.splice(0)) await created.close();
  });
  afterAll(stopMongoReplicaSet);

  describe.each(['direct', 'idempotent'] as const)('%s creation', (mode) => {
    const request = () => ({
      templateCd: 'prepared-documents',
      user: { _id: senderId },
      ...(mode === 'idempotent' ? { clientRequestId: 'documents-request' } : {}),
    });

    it('overrides caller attachments independently of payload, rendering, and lifecycle fields', async () => {
      const callerDocuments = [new mongoose.Types.ObjectId()];
      const approvedDocuments = [new mongoose.Types.ObjectId(), new mongoose.Types.ObjectId()];
      const payloadDocuments = [new mongoose.Types.ObjectId()];
      const payload = { documents: callerDocuments, name: 'Caller', privateInput: 'discarded' };
      const businessPayload = { documents: payloadDocuments, name: 'Business' };
      const prepared = {
        documents: approvedDocuments,
        toUser: receiverId,
        templateData: { name: 'Rendered' },
        payload: businessPayload,
        display: { priority: 'high' },
        // Trusted preparation still cannot override lifecycle/ownership fields.
        _id: new mongoose.Types.ObjectId(),
        templateCd: 'spoofed-template',
        senderContent: { title: 'Spoofed sender' },
        receiverContent: { title: 'Spoofed receiver' },
        paymentSession: 'spoofed-session',
        clientRequestId: 'spoofed-key',
        clientRequestOwnerId: 'spoofed-owner',
        clientRequestItemIndex: 99,
        actionState: 'processing',
        actionCd: 'spoofed-action',
        actionAttemptId: 'spoofed-attempt',
        actionOwnerToken: 'spoofed-token',
        archivedBy: receiverId,
        archivedAt: new Date(),
      } satisfies PrepareResult & Record<string, unknown>;
      Object.freeze(callerDocuments);
      Object.freeze(approvedDocuments);
      Object.freeze(payloadDocuments);
      Object.freeze(payload);
      Object.freeze(businessPayload);
      Object.freeze(prepared);
      const definition = template(async (ctx) => {
        expect(ctx.payload === payload).toBe(true);
        return prepared;
      });
      const condition = vi.fn(() => true);
      definition.actions[0].condition = condition;
      const created = await fixture(definition);

      const [message] = await created.service.createMessage({ ...request(), payload });
      const stored = await created.models.Message.collection.findOne({ _id: message._id as mongoose.Types.ObjectId });
      expect(stored).toMatchObject({
        templateCd: 'prepared-documents',
        fromUser: senderId,
        toUser: receiverId,
        documents: approvedDocuments,
        senderContent: { title: 'Sent Rendered' },
        receiverContent: { title: 'Review Rendered' },
        payload: businessPayload,
        display: { priority: 'high' },
        paymentSession: null,
        clientRequestId: mode === 'idempotent' ? 'documents-request' : null,
        clientRequestOwnerId: mode === 'idempotent' ? String(senderId) : null,
        clientRequestItemIndex: mode === 'idempotent' ? 0 : null,
        actionState: 'active',
        actionCd: null,
        actionAttemptId: null,
        actionOwnerToken: null,
      });
      expect(String(message._id)).not.toBe(String(prepared._id));
      expect(stored).not.toHaveProperty('archivedBy');
      expect(stored).not.toHaveProperty('archivedAt');
      expect(stored).not.toHaveProperty('templateData');
      expect(condition).not.toHaveBeenCalled();
      const listed = await created.service.getActions(String(message._id), 'receiver', { user: { _id: receiverId } });
      expect(listed?.actions[0].name).toBe('Approve Business');
      expect(condition).toHaveBeenCalled();
      expect(serializePublicMessage(message).documents).toEqual(approvedDocuments.map(String));
      expect(payload).toEqual({ documents: callerDocuments, name: 'Caller', privateInput: 'discarded' });
      expect(prepared.documents).toEqual(approvedDocuments);
      expect(prepared.payload).toEqual(businessPayload);
    });

    it('treats an explicit empty array as a clear even when both payloads contain attachments', async () => {
      const callerDocuments = [new mongoose.Types.ObjectId()];
      const businessDocuments = [new mongoose.Types.ObjectId()];
      const documents: mongoose.Types.ObjectId[] = [];
      Object.freeze(documents);
      const created = await fixture(template(async () => ({ documents, payload: { documents: businessDocuments } })));
      const payload = Object.freeze({ documents: Object.freeze(callerDocuments) });

      const [message] = await created.service.createMessage({ ...request(), payload });
      expect(message.documents).toEqual([]);
      expect(await created.models.Message.findById(message._id).lean()).toMatchObject({
        documents: [],
        payload: { documents: businessDocuments },
      });
      expect(payload.documents).toEqual(callerDocuments);
      expect(documents).toEqual([]);
    });

    it.each(['replaced', 'empty', 'omitted'] as const)(
      'keeps the original payload fallback when documents is omitted and prepared payload is %s',
      async (payloadMode) => {
        const documents = [new mongoose.Types.ObjectId(), new mongoose.Types.ObjectId()];
        const payload = Object.freeze({ documents: Object.freeze(documents), name: 'Caller' });
        const prepared: PrepareResult =
          payloadMode === 'replaced'
            ? { payload: { documents: [new mongoose.Types.ObjectId()], name: 'Business' } }
            : payloadMode === 'empty'
              ? { payload: {} }
              : {};
        const created = await fixture(template(async () => prepared));

        const [message] = await created.service.createMessage({ ...request(), payload });
        expect(message.documents.map(String)).toEqual(documents.map(String));
        const stored = await created.models.Message.collection.findOne({ _id: message._id as mongoose.Types.ObjectId });
        expect(stored?.documents).toEqual(documents);
        // Mongoose minimizes empty Mixed objects on disk; no caller data leaks in.
        expect(stored?.payload ?? {}).toEqual(prepared.payload ?? payload);
        expect(payload).toEqual({ documents, name: 'Caller' });
        expect(prepared).not.toHaveProperty('documents');
      },
    );

    it('uses the legacy fallback for explicit undefined as well as omission', async () => {
      const documents = [new mongoose.Types.ObjectId()];
      const created = await fixture(template(async () => ({ documents: undefined, payload: {} })));
      const [message] = await created.service.createMessage({ ...request(), payload: { documents } });
      expect(message.documents.map(String)).toEqual(documents.map(String));
    });

    it('defaults to no attachments when only the prepared business payload contains documents', async () => {
      const businessDocuments = [new mongoose.Types.ObjectId()];
      const created = await fixture(template(async () => ({ payload: { documents: businessDocuments } })));
      const [message] = await created.service.createMessage(request());
      expect(await created.models.Message.findById(message._id).lean()).toMatchObject({
        documents: [],
        payload: { documents: businessDocuments },
      });
    });

    it('gives each fan-out item an independent attachment array, including shared and fallback sources', async () => {
      const approved = [new mongoose.Types.ObjectId()];
      const otherApproved = [new mongoose.Types.ObjectId(), new mongoose.Types.ObjectId()];
      const legacy = [new mongoose.Types.ObjectId()];
      const items: PrepareResult[] = [
        { documents: approved },
        { documents: otherApproved },
        { documents: [] },
        {},
        { documents: approved },
        {},
      ];
      for (const item of items) {
        if (item.documents) Object.freeze(item.documents);
        Object.freeze(item);
      }
      Object.freeze(items);
      Object.freeze(legacy);
      const payload = Object.freeze({ documents: legacy });
      const created = await fixture(template(async () => items));
      // Retain each document's final setter input (after its default []), before casting copies it.
      const inputsByDocument = new Map<mongoose.Document, mongoose.Types.ObjectId[]>();
      created.models.Message.schema.path('documents').set(function (
        this: mongoose.Document,
        value: mongoose.Types.ObjectId[],
      ) {
        inputsByDocument.set(this, value);
        return value;
      });

      const messages = await created.service.createMessage({ ...request(), payload });
      const expected = [approved, otherApproved, [], legacy, approved, legacy].map((ids) => ids.map(String));
      expect(messages.map((message) => message.documents.map(String))).toEqual(expected);
      const inputs = [...inputsByDocument.values()];
      expect(inputs).toHaveLength(items.length);
      expect(new Set(inputs).size).toBe(items.length);
      expect(inputs.every((input) => input !== approved && input !== otherApproved && input !== legacy)).toBe(true);
      for (const [index, message] of messages.entries()) {
        const stored = await created.models.Message.findById(message._id).lean();
        expect(serializePublicMessage(message).documents).toEqual(expected[index]);
        expect(stored).toMatchObject({ documents: expected[index].map((id) => new mongoose.Types.ObjectId(id)) });
      }
      messages[0].documents.push(new mongoose.Types.ObjectId());
      expect(messages.slice(1).map((message) => message.documents.map(String))).toEqual(expected.slice(1));
      expect(payload.documents.map(String)).toEqual(expected[3]);
      expect(items[0].documents?.map(String)).toEqual(expected[0]);
      expect(items[4].documents?.map(String)).toEqual(expected[4]);
      expect(await created.models.MessageRequest.countDocuments({})).toBe(mode === 'idempotent' ? 1 : 0);
    });
  });

  it('replays the persisted per-item selections across active/archive records without rerunning preparation', async () => {
    const approved = [new mongoose.Types.ObjectId()];
    const otherApproved = [new mongoose.Types.ObjectId()];
    const legacy = [new mongoose.Types.ObjectId()];
    const prepare = vi.fn(
      async (): Promise<PrepareResult[]> => [
        { toUser: receiverId, documents: approved, payload: {} },
        { toUser: receiverId, documents: otherApproved, payload: {} },
        { toUser: receiverId, documents: [], payload: {} },
        { toUser: receiverId, payload: {} },
      ],
    );
    const created = await fixture(template(prepare));
    const request = {
      templateCd: 'prepared-documents',
      user: { _id: senderId },
      clientRequestId: 'replay-documents',
      payload: Object.freeze({ documents: Object.freeze(legacy) }),
    };
    const messages = await created.service.createMessage(request);
    for (const index of [0, 2]) {
      await created.service.handleAction('prepared-documents', 'approve', {
        message: messages[index],
        user: { _id: receiverId },
      });
    }
    prepare.mockRejectedValue(new Error('completed replay must not prepare again'));
    const changedPayload = Object.freeze({ documents: Object.freeze([new mongoose.Types.ObjectId()]) });
    const replay = await created.service.createMessage({ ...request, payload: changedPayload });

    expect(prepare).toHaveBeenCalledTimes(1);
    expect(replay.map((message) => String(message._id))).toEqual(messages.map((message) => String(message._id)));
    expect(replay.map((message) => 'archivedAt' in message)).toEqual([true, false, true, false]);
    expect(replay.map(serializePublicMessage).map((message) => message.documents)).toEqual(
      [approved, otherApproved, [], legacy].map((ids) => ids.map(String)),
    );
    expect(await created.models.Message.countDocuments({})).toBe(2);
    expect(await created.models.MessageArchive.countDocuments({})).toBe(2);
    expect(await created.models.MessageRequest.findOne({}).lean()).toMatchObject({ state: 'completed', itemCount: 4 });
    expect(request.payload.documents).toEqual(legacy);
    expect(changedPayload.documents).toHaveLength(1);
  });
});
