import { Types } from 'mongoose';
import type {
  ActionLifecycleState,
  ActionNotificationState,
  IBaseMessage,
  IMessageContent,
  MessageType,
} from './types/message';

/** A populated party exposes only its identity and optional presentation fields. */
export interface PublicMessageParty {
  _id: string;
  displayName?: string;
  email?: string;
}

/**
 * Allowlisted HTTP message representation, shared by create/replay and host lists.
 * IDs are strings and dates are ISO strings. Archive-only fields are absent on
 * active messages. Payload/display remain host-controlled business data.
 */
export interface PublicMessageDto {
  _id: string;
  templateCd: string;
  type: MessageType;
  fromUser: string | PublicMessageParty | null;
  toUser: string | PublicMessageParty | null;
  toRoles: string[];
  senderContent: IMessageContent;
  receiverContent: IMessageContent;
  documents: string[];
  /** Business payment session reference, intentionally available to clients. */
  paymentSession: string | null;
  paymentCd: string;
  payload: Record<string, unknown>;
  display: Record<string, unknown>;
  actionState: ActionLifecycleState;
  actionCd: string | null;
  /** Stable business deduplication ID, not the internal worker ownership token. */
  actionAttemptId: string | null;
  createdAt: string;
  updatedAt: string;
  archivedBy?: string | null;
  archivedAt?: string;
  actionNotificationState?: ActionNotificationState;
}

/**
 * Structural input for hydrated or plain stored messages, including populated
 * references. Unknown reference values are inspected only for IDs/presentation;
 * missing or unsupported parties become null, never arbitrary serialized objects.
 */
export type PublicMessageSource = Pick<
  IBaseMessage,
  | 'templateCd'
  | 'type'
  | 'toRoles'
  | 'senderContent'
  | 'receiverContent'
  | 'paymentSession'
  | 'paymentCd'
  | 'payload'
  | 'display'
  | 'actionState'
  | 'actionCd'
  | 'actionAttemptId'
  | 'createdAt'
  | 'updatedAt'
> & {
  _id: unknown;
  fromUser: unknown;
  toUser: unknown;
  documents: readonly unknown[];
  archivedBy?: unknown;
  archivedAt?: Date;
  actionNotificationState?: ActionNotificationState;
};

function referenceId(value: unknown): string | null {
  if (typeof value === 'string' && value.length > 0) return value;
  if (value instanceof Types.ObjectId) return value.toHexString();
  return null;
}

function populatedId(value: unknown): string | null {
  return referenceId(value) ?? (value && typeof value === 'object' && '_id' in value ? referenceId(value._id) : null);
}

function party(value: unknown): string | PublicMessageParty | null {
  const id = referenceId(value);
  if (id !== null) return id;
  if (!value || typeof value !== 'object' || !('_id' in value)) return null;
  const populated = referenceId(value._id);
  if (populated === null) return null;
  const result: PublicMessageParty = { _id: populated };
  if ('displayName' in value && typeof value.displayName === 'string') result.displayName = value.displayName;
  if ('email' in value && typeof value.email === 'string') result.email = value.email;
  return result;
}

function content(value: IMessageContent): IMessageContent {
  return { title: value.title, long: value.long, short: value.short };
}

/**
 * Serialize an already-authorized message without mutating its hydrated record.
 * Explicitly excludes diagnostics, owner tokens, claim/lease/request bookkeeping,
 * schema extensions and arbitrary populated-user fields. Does not authorize or
 * sanitize host payload/display/content or action handler results. Only populate
 * email/displayName when they are appropriate for the audience.
 *
 * @example
 * const data = (await service.listMessages({ user })).map(serializePublicMessage);
 */
export function serializePublicMessage(message: PublicMessageSource): PublicMessageDto {
  const id = referenceId(message._id);
  if (id === null) throw new TypeError('Message must have a string or ObjectId _id');
  const result: PublicMessageDto = {
    _id: id,
    templateCd: message.templateCd,
    type: message.type,
    fromUser: party(message.fromUser),
    toUser: party(message.toUser),
    toRoles: [...message.toRoles],
    senderContent: content(message.senderContent),
    receiverContent: content(message.receiverContent),
    documents: message.documents.map(populatedId).filter((value): value is string => value !== null),
    paymentSession: message.paymentSession,
    paymentCd: message.paymentCd,
    payload: message.payload,
    display: message.display,
    actionState: message.actionState,
    actionCd: message.actionCd,
    actionAttemptId: message.actionAttemptId,
    createdAt: message.createdAt.toISOString(),
    updatedAt: message.updatedAt.toISOString(),
  };
  if (message.archivedAt != null) {
    result.archivedAt = message.archivedAt.toISOString();
    result.archivedBy = populatedId(message.archivedBy);
    result.actionNotificationState = message.actionNotificationState ?? 'none';
  }
  return result;
}
