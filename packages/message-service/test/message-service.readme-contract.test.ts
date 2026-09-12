import { describe, expect, it } from 'vitest';
import mongoose from 'mongoose';
import { createMongoMessageServiceFixture, stopMongoReplicaSet } from './support/mongodb-fixture';
import type { MessageTemplate } from '../src/types/template';
import type { IMessage } from '../src/types/message';

const readmeTemplate: MessageTemplate = {
  templateCd: 'welcome.request',
  type: 'request',
  description: 'Welcome request',
  senderContent: { title: 'Welcome {{name}}', long: 'Sent to reviewers', short: 'Sent' },
  receiverContent: { title: 'Review {{name}}', long: 'Please review this request', short: 'Review' },
  uiTemplate: 'default-message',
  prepareMessage: async ({ user, payload }) => ({
    fromUser: user._id,
    toRoles: ['reviewer'],
    payload,
    templateData: { name: String(payload.name ?? '') },
  }),
  actions: [
    {
      actionCd: 'approve',
      name: 'Approve',
      variant: 'primary',
      sender: false,
      receiver: true,
      runHandler: async ({ actionAttemptId }) => ({ actionAttemptId }),
    },
  ],
};

describe('MSGF-13 README create/action contract', () => {
  it('renders documented names from templateData and runs the approve action', async () => {
    const fixture = await createMongoMessageServiceFixture({ templates: [readmeTemplate] });
    const senderId = new mongoose.Types.ObjectId();
    const reviewerId = new mongoose.Types.ObjectId();
    try {
      const created = await fixture.service.createMessage({
        templateCd: 'welcome.request',
        user: { _id: senderId },
        payload: { name: 'Ada' },
      });
      expect(created).toHaveLength(1);
      const message = created[0];
      if (!message || 'archivedAt' in message) throw new Error('expected an active message');
      const active = message as IMessage;
      // Documented name renders from the supplied input via templateData.
      expect(active.receiverContent.title).toBe('Review Ada');
      expect(active.senderContent.title).toBe('Welcome Ada');

      const listed = await fixture.service.getActions(String(active._id), 'receiver', {
        user: { _id: reviewerId, roles: ['reviewer'] },
      });
      expect(listed?.actions.map((action) => action.actionCd)).toEqual(['approve']);

      const result = (await fixture.service.handleAction('welcome.request', 'approve', {
        message: active,
        user: { _id: reviewerId, roles: ['reviewer'] },
      })) as { actionAttemptId?: string };
      expect(typeof result.actionAttemptId).toBe('string');

      const archived = await fixture.service.findMessage(String(active._id));
      expect(archived && 'archivedAt' in (archived as object)).toBe(true);
    } finally {
      await fixture.close();
      await stopMongoReplicaSet();
    }
  });

  it('exposes readonly registry views matching the freeze depth', async () => {
    const fixture = await createMongoMessageServiceFixture({ templates: [readmeTemplate] });
    try {
      const found = fixture.registry.find('welcome.request');
      expect(found).toBeDefined();
      expect(Object.isFrozen(found)).toBe(true);
      expect(Object.isFrozen(found?.senderContent)).toBe(true);
      expect(Object.isFrozen(found?.actions)).toBe(true);
      expect(() => {
        (found as unknown as { senderContent: { title: string } }).senderContent.title = 'mut';
      }).toThrow();
    } finally {
      await fixture.close();
      await stopMongoReplicaSet();
    }
  });
});
