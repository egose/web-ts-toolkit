import mongoose from 'mongoose';
import { BaseMessageFields } from './base';
import { isSender, isReceiver } from './methods';

/**
 * Build a fresh MessageArchive schema.
 * Mirrors the default Message schema but adds archive-specific fields
 * (actionCd, archivedBy, archivedAt) and no pre-save email hook.
 */
export function buildMessageArchiveSchema(): mongoose.Schema {
  const schema: mongoose.Schema = new mongoose.Schema(
    {
      ...BaseMessageFields,
      actionCd: { type: String, default: '' },
      archivedBy: { type: mongoose.Schema.Types.ObjectId, default: null, index: true },
      archivedAt: { type: Date, default: Date.now },
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
export const MessageArchiveSchema: mongoose.Schema = buildMessageArchiveSchema();
