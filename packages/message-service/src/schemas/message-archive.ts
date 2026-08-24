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

  schema.methods.isSender = isSender;
  schema.methods.isReceiver = isReceiver;

  return schema;
}

/**
 * Default MessageArchive schema. Provided for backwards compatibility.
 * Use `buildMessageArchiveSchema()` if you need a fresh instance.
 */
export const MessageArchiveSchema = buildMessageArchiveSchema();
