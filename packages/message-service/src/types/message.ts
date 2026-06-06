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

export type MessageType = string;

export type UserId = mongoose.Types.ObjectId | string;

/**
 * Minimal user shape accepted by MessageService methods.
 */
export interface MessageUser {
  _id: UserId;
  id?: string;
  roles?: string[];
}

export interface IMessageMethods {
  isSender(user: MessageUser): boolean;
  isReceiver(user: MessageUser): boolean;
  archive(actionCd: string, archivedBy: UserId, registry?: TemplateRegistry): Promise<void>;
}

/**
 * Base fields shared between IMessage and IMessageArchive.
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

export type IMessage = mongoose.Document & IBaseMessage & IMessageMethods;

// ---------------------------------------------------------------------------
// Message Archive Document
// ---------------------------------------------------------------------------

export type IMessageArchive = mongoose.Document & IBaseMessage & {
  actionCd: string;
  archivedBy: UserId;
  archivedAt: Date;
} & IMessageMethods;

// ---------------------------------------------------------------------------
// Permission Schema (for ACL route configuration)
// ---------------------------------------------------------------------------

export type FieldPermission = boolean | string;

export interface PermissionSchemaField {
  list: FieldPermission;
  read: FieldPermission;
  update: FieldPermission;
  create: FieldPermission;
}

export type PermissionSchema = Record<string, PermissionSchemaField>;

// ---------------------------------------------------------------------------
// Base Filter (for ACL route configuration)
// ---------------------------------------------------------------------------

export type BaseFilterAccess = 'list' | 'read' | 'update' | 'delete';

export interface BaseFilterContext {
  _user?: { _id: UserId; roles: string[] };
}

export type BaseFilterFunction = (
  this: BaseFilterContext,
  permissions: Record<string, boolean>,
) => Record<string, unknown> | boolean | Promise<Record<string, unknown> | boolean>;

export type BaseFilter = Partial<Record<BaseFilterAccess, BaseFilterFunction>>;
