import mongoose from 'mongoose';
import { BaseMessageFields } from './base';
import { isSender, isReceiver } from './methods';

const MessageArchiveSchema: mongoose.Schema = new mongoose.Schema(
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

MessageArchiveSchema.index({ createdAt: 1 });

MessageArchiveSchema.methods.isSender = isSender;
MessageArchiveSchema.methods.isReceiver = isReceiver;

export { MessageArchiveSchema };
