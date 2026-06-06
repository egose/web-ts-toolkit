import mongoose from 'mongoose';

/** Model name constants — use these when calling mongoose.model() or getModel() */
export const MESSAGE_MODEL_NAME = 'Message';
export const MESSAGE_ARCHIVE_MODEL_NAME = 'MessageArchive';

export const MessageContentSchema = new mongoose.Schema(
  {
    title: { type: String, default: '' },
    long: { type: String, default: '' },
    short: { type: String, default: '' },
  },
  { _id: false },
);

/**
 * Base message fields shared between Message and MessageArchive.
 * Uses `any` typing to avoid TS7056 serialization limits on complex Mongoose types.
 *
 * All ObjectId fields use generic refs — consumers should configure
 * their own Mongoose populate paths for their domain models.
 *
 * Consumers can extend this object with additional fields (e.g. toOrg, toOrgAdmin)
 * by spreading it into their own schema definition.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const BaseMessageFields: Record<string, any> = {
  templateCd: { type: String, default: '' },
  type: { type: String, default: 'notification' },
  fromUser: { type: mongoose.Schema.Types.ObjectId, default: null },
  toUser: { type: mongoose.Schema.Types.ObjectId, default: null },
  toRoles: { type: [String], default: [] },
  senderContent: { type: MessageContentSchema, default: () => ({}) },
  receiverContent: { type: MessageContentSchema, default: () => ({}) },
  documents: { type: [mongoose.Schema.Types.ObjectId], default: [] },
  paymentSession: { type: String, default: null },
  paymentCd: { type: String, default: '' },
  payload: { type: mongoose.Schema.Types.Mixed, default: {} },
  display: { type: mongoose.Schema.Types.Mixed, default: {} },
};
