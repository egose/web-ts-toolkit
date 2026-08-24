import mongoose from 'mongoose';

export interface MessageRequestSchemaFields {
  clientRequestId: string;
  clientRequestOwnerId: string;
  templateCd: string;
  state: 'pending' | 'completed' | 'failed';
  itemCount: number | null;
  leaseOwnerId: string | null;
  leaseExpiresAt: Date | null;
  completedAt: Date | null;
  failedAt: Date | null;
  failureMessage: string | null;
  createdAt: Date;
  updatedAt: Date;
}

export function buildMessageRequestSchema(): mongoose.Schema<MessageRequestSchemaFields> {
  const schema = new mongoose.Schema<MessageRequestSchemaFields>(
    {
      clientRequestId: { type: String, required: true },
      clientRequestOwnerId: { type: String, required: true },
      templateCd: { type: String, required: true },
      state: { type: String, enum: ['pending', 'completed', 'failed'], default: 'pending' },
      itemCount: { type: Number, default: null },
      leaseOwnerId: { type: String, default: null },
      leaseExpiresAt: { type: Date, default: null },
      completedAt: { type: Date, default: null },
      failedAt: { type: Date, default: null },
      failureMessage: { type: String, default: null },
    },
    {
      timestamps: true,
    },
  );

  schema.index({ clientRequestOwnerId: 1, templateCd: 1, clientRequestId: 1 }, { unique: true });
  schema.index({ updatedAt: 1 });
  schema.index({ state: 1, leaseExpiresAt: 1 });

  return schema;
}

export const MessageRequestSchema = buildMessageRequestSchema();
