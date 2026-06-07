import type mongoose from 'mongoose';
import type { TemplateRegistry } from '../template-registry';

// ---------------------------------------------------------------------------
// Message Content
// ---------------------------------------------------------------------------

export interface IMessageContent {
  title: string;
  long: string;
  short: string;
}

// ---------------------------------------------------------------------------
// Message Document
// ---------------------------------------------------------------------------

/**
 * The high-level category of a message. Common values are 'notification',
 * 'request', 'reminder', 'approval'. Templates can use any string; the
 * `(string & {})` trick preserves the literal types in autocomplete while
 * still allowing arbitrary strings.
 */
export type MessageType = 'notification' | 'request' | 'reminder' | 'approval' | (string & {});

export type UserId = mongoose.Types.ObjectId | string;

/**
 * Minimal user shape accepted by MessageService methods.
 * `displayName` is optional but templates that interpolate `{{displayName}}`
 * will fall back to an empty string if it is absent.
 */
export interface MessageUser {
  _id: UserId;
  id?: string;
  roles?: string[];
  displayName?: string;
}

export interface IMessageMethods {
  isSender(user: MessageUser): boolean;
  isReceiver(user: MessageUser): boolean;
  archive(actionCd: string, archivedBy: UserId, registry: TemplateRegistry): Promise<void>;
}

/**
 * Base fields shared between IMessage and IMessageArchive.
 *
 * `display` is stored as-is from the template's `PrepareResult.display` —
 * unlike `senderContent` and `receiverContent`, it is NOT interpolated at
 * create time. Use it for static per-message configuration (priority,
 * category, etc.) rather than user-facing text.
 */
export interface IBaseMessage {
  templateCd: string;
  type: MessageType;
  fromUser: UserId | null;
  toUser: UserId | null;
  toRoles: string[];
  senderContent: IMessageContent;
  receiverContent: IMessageContent;
  documents: mongoose.Types.ObjectId[];
  paymentSession: string | null;
  paymentCd: string;
  payload: Record<string, unknown>;
  display: Record<string, unknown>;
  createdAt: Date;
  updatedAt: Date;
}

type MongooseQueryHelpers = Record<string, unknown>;

export type IMessage = mongoose.Document<unknown, MongooseQueryHelpers, IMessageMethods> &
  IBaseMessage &
  IMessageMethods & { __v?: number };

// ---------------------------------------------------------------------------
// Message Archive Document
// ---------------------------------------------------------------------------

export type IMessageArchive = mongoose.Document<unknown, MongooseQueryHelpers, IMessageMethods> &
  IBaseMessage & {
    actionCd: string;
    archivedBy: UserId;
    archivedAt: Date;
    __v?: number;
  } & IMessageMethods;
