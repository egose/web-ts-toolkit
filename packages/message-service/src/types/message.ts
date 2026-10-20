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

/**
 * Native ObjectId or case-sensitive opaque string. User-facing IDs are trimmed;
 * template party storage and archive ownership trim strings without stringifying
 * native ObjectIds. Bundled party/archivedBy paths default to ObjectId: arbitrary
 * strings require the README's active AND archive String-schema overrides.
 * Stored ObjectIds match 24-hex principals in either case; stored strings compare
 * exactly after trimming (even hex-looking strings). Request scopes always retain
 * the existing trimmed, case-sensitive string keys; ObjectIds use lowercase hex.
 */
export type UserId = mongoose.Types.ObjectId | string;

export type ActionLifecycleState = 'active' | 'processing' | 'retryable';

export type ActionNotificationState = 'none' | 'pending' | 'sent' | 'failed';

/**
 * Minimal user shape accepted by MessageService methods.
 * Plain objects, prototype getters, and hydrated Mongoose documents are
 * supported. User-facing operations reject malformed `roles` with
 * `InvalidMessageUserError`; omitted/undefined roles and `[]` are valid.
 * Action handlers receive only these fields (with a copied roles array),
 * not arbitrary authentication-document properties. The caller is not mutated.
 * `displayName` is optional but templates that interpolate `{{displayName}}`
 * will fall back to an empty string if it is absent.
 */
export interface MessageUser {
  _id: UserId;
  id?: string;
  /** Exact, case-sensitive string roles; no coercion or substring matching. */
  roles?: string[];
  displayName?: string;
}

export interface IMessageRelationshipMethods {
  /** Stored ObjectIds accept either hex case; String parties match exact trimmed IDs, including populated `_id`s. Invalid roles/references never match. */
  isSender(user: MessageUser): boolean;
  /** Same stored-type ID policy as isSender, or an exact role; malformed user roles fail closed. */
  isReceiver(user: MessageUser): boolean;
}

export interface IMessageMethods extends IMessageRelationshipMethods {
  /**
   * Trusted host-level archival primitive: atomically moves the active message
   * into the archive collection on the document's owning connection.
   *
   * The host must authorize before calling (no sender/receiver, permission, or
   * condition checks run here). Invalid `actionCd` throws
   * `TemplateNotFoundError`/`ActionNotFoundError`; an invalid `archivedBy`
   * throws `InvalidMessageUserError` — never a silent no-op success. A live
   * in-flight service claim (`processing` without an expired lease) throws
   * `ActionConflictError` and steals nothing. Repeat calls throw
   * `MessageArchivedError` (archive copy exists) or `MessageNotFoundError`.
   * Deployments without transaction support throw
   * `MessageTransactionRequiredError` before writing anything.
   * String `archivedBy` is trimmed; native ObjectIds are preserved for schema
   * casting. Opaque IDs require a String archive `archivedBy` path (see README).
   * Confirmed commit resolves even if session cleanup rejects; configure
   * `buildMessageSchema({ onTransactionCleanupFailure })` for diagnostics.
   * Observer failures cannot change the outcome. An attached `$session()` is
   * borrowed and never ended by this method; its caller owns cleanup.
   */
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
  clientRequestId: string | null;
  clientRequestOwnerId: string | null;
  clientRequestItemIndex: number | null;
  actionState: ActionLifecycleState;
  actionCd: string | null;
  actionAttemptId: string | null;
  actionOwnerToken: string | null;
  actionClaimedBy: string | null;
  actionClaimedAt: Date | null;
  actionLeaseExpiresAt: Date | null;
  actionFailureMessage: string | null;
  createdAt: Date;
  updatedAt: Date;
}

type MongooseQueryHelpers = Record<string, unknown>;

export type IMessage = mongoose.Document<unknown, MongooseQueryHelpers, IMessageMethods> &
  IBaseMessage &
  IMessageMethods & { _id: mongoose.Types.ObjectId; __v?: number };

// ---------------------------------------------------------------------------
// Message Archive Document
// ---------------------------------------------------------------------------

export type IMessageArchive = mongoose.Document<unknown, MongooseQueryHelpers, IMessageRelationshipMethods> &
  IBaseMessage & {
    _id: mongoose.Types.ObjectId;
    actionCd: string;
    archivedBy: UserId;
    archivedAt: Date;
    actionAttemptId: string | null;
    actionOwnerToken: string | null;
    actionNotificationState: ActionNotificationState;
    actionNotificationError: string | null;
    actionNotificationAttemptedAt: Date | null;
    __v?: number;
  } & IMessageRelationshipMethods;
