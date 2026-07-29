import mongoose from 'mongoose';

export function buildMessageRequestSchema(): mongoose.Schema {
  const schema: mongoose.Schema = new mongoose.Schema(
    {
      clientRequestId: { type: String, required: true },
      state: { type: String, enum: ['pending', 'completed'], default: 'pending' },
      itemCount: { type: Number, default: null },
    },
    {
      timestamps: true,
    },
  );

  schema.index({ clientRequestId: 1 }, { unique: true });
  schema.index({ updatedAt: 1 });

  return schema;
}

export const MessageRequestSchema: mongoose.Schema = buildMessageRequestSchema();
