import mongoose from 'mongoose';
import { BaseMessageFields } from './base';
import { isSender, isReceiver } from './methods';
import type { IBaseMessage, IMessageRelationshipMethods } from '../types/message';

type MessageArchiveSchemaFields = IBaseMessage & {
  actionCd: string;
  archivedBy: unknown;
  archivedAt: Date;
  actionAttemptId: string | null;
  actionNotificationState: 'none' | 'pending' | 'sent' | 'failed';
  actionNotificationError: string | null;
  actionNotificationAttemptedAt: Date | null;
};

type MessageArchiveModel = mongoose.Model<MessageArchiveSchemaFields, object, IMessageRelationshipMethods>;

/**
 * Build a fresh MessageArchive schema.
 * Mirrors the default Message schema but adds archive-specific fields
 * (actionCd, archivedBy, archivedAt) and no pre-save email hook.
 */
export function buildMessageArchiveSchema(): mongoose.Schema<
  MessageArchiveSchemaFields,
  MessageArchiveModel,
  IMessageRelationshipMethods
> {
  const schema = new mongoose.Schema<MessageArchiveSchemaFields, MessageArchiveModel, IMessageRelationshipMethods>(
    {
      ...BaseMessageFields,
      actionCd: { type: String, default: '' },
      archivedBy: { type: mongoose.Schema.Types.ObjectId, default: null, index: true },
      archivedAt: { type: Date, default: Date.now },
      actionAttemptId: { type: String, default: null, index: true },
      actionNotificationState: { type: String, enum: ['none', 'pending', 'sent', 'failed'], default: 'none' },
      actionNotificationError: { type: String, default: null },
      actionNotificationAttemptedAt: { type: Date, default: null },
    },
    {
      timestamps: true,
    },
  );

  schema.index({ createdAt: 1 });
  // MSGF-06 replay lookups: same scoped shapes as the active collection so
  // completed-batch replay over archived items is evidence-backed (no
  // COLLSCAN). Archival preserves clientRequest* fields, so the unique
  // scope+index invariant carries over to the archive.
  schema.index(
    { clientRequestOwnerId: 1, templateCd: 1, clientRequestId: 1, createdAt: 1, _id: 1 },
    {
      partialFilterExpression: {
        clientRequestId: { $type: 'string' },
        clientRequestOwnerId: { $type: 'string' },
        templateCd: { $type: 'string' },
      },
    },
  );
  schema.index(
    { clientRequestOwnerId: 1, templateCd: 1, clientRequestId: 1, clientRequestItemIndex: 1 },
    {
      unique: true,
      partialFilterExpression: {
        clientRequestId: { $type: 'string' },
        clientRequestOwnerId: { $type: 'string' },
        templateCd: { $type: 'string' },
        clientRequestItemIndex: { $type: 'number' },
      },
    },
  );

  schema.methods.isSender = isSender;
  schema.methods.isReceiver = isReceiver;

  return schema;
}

/**
 * Default MessageArchive schema. Provided for backwards compatibility.
 * Use `buildMessageArchiveSchema()` if you need a fresh instance.
 */
export const MessageArchiveSchema = buildMessageArchiveSchema();
