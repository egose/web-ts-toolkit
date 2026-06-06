import type mongoose from 'mongoose';
import type { IMessage, MessageUser, UserId } from './message';

// ---------------------------------------------------------------------------
// Prepare Context — passed to template.prepareMessage()
// ---------------------------------------------------------------------------

export interface PrepareContext {
  user: MessageUser;
  roles: string[];
  identity: Record<string, unknown>;
  permissions: Record<string, boolean>;
  payload: Record<string, unknown>;
  getModel: (name: string) => mongoose.Model<unknown>;
  req?: unknown;
}

// ---------------------------------------------------------------------------
// Prepare Result — returned by template.prepareMessage()
// ---------------------------------------------------------------------------

export interface PrepareResult {
  type?: string;
  templateData?: Record<string, unknown>;
  fromUser?: UserId;
  toUser?: UserId;
  toRoles?: string[];
  payload?: Record<string, unknown>;
  display?: Record<string, unknown>;
  paymentCd?: string;
  priceArgs?: Record<string, unknown>;
}

// ---------------------------------------------------------------------------
// Action Context — passed to action.runHandler()
// ---------------------------------------------------------------------------

export interface ActionContext {
  message: IMessage;
  user: MessageUser;
  getModel: (name: string) => mongoose.Model<unknown>;
  expireSession?: (sessionId: string) => Promise<void>;
  refundPayment?: (sessionId: string) => Promise<void>;
  approverId?: UserId;
  req?: unknown;
}

// ---------------------------------------------------------------------------
// Sender Notification
// ---------------------------------------------------------------------------

export interface SenderNotificationContent {
  title?: string;
  long: string;
  short?: string;
  documents?: mongoose.Types.ObjectId[];
}

// ---------------------------------------------------------------------------
// Action Confirmation
// ---------------------------------------------------------------------------

export interface ActionConfirmation {
  title: string;
  message: string;
  notesLabel?: string;
  requireNotes?: boolean;
  documents?: boolean;
}

// ---------------------------------------------------------------------------
// Message Action
// ---------------------------------------------------------------------------

export interface MessageAction {
  actionCd: string;
  name: string;
  variant: string;
  isDefault?: boolean;
  sender: boolean;
  receiver: boolean;
  permission?: string;
  condition?: (message: IMessage) => boolean;
  confirmation?: ActionConfirmation;
  payload?: Record<string, unknown>;
  senderNotification?: string | ((ctx: ActionContext) => Promise<string | SenderNotificationContent>);
  runHandler: (ctx: ActionContext) => Promise<unknown>;
}

// ---------------------------------------------------------------------------
// Message Template
// ---------------------------------------------------------------------------

export type UiTemplate = string | { sender?: string; receiver?: string };

export interface MessageTemplate {
  templateCd: string;
  type: string;
  description: string;
  senderContent: { title: string; long: string; short: string };
  receiverContent: { title: string; long: string; short: string };
  uiTemplate: UiTemplate;
  paymentCd?: string;
  prepareMessage: (ctx: PrepareContext) => Promise<PrepareResult | PrepareResult[] | null>;
  actions: MessageAction[];
}

// ---------------------------------------------------------------------------
// Interpolation Result
// ---------------------------------------------------------------------------

export interface InterpolatedContent {
  title: string;
  long: string;
  short: string;
}

export interface InterpolatedAction {
  actionCd: string;
  isDefault?: boolean;
  name: string;
  variant: string;
  confirmation?: ActionConfirmation;
  payload?: Record<string, unknown>;
}

export interface InterpolationResult {
  senderContent: InterpolatedContent;
  receiverContent: InterpolatedContent;
  uiTemplate: UiTemplate;
  actions: InterpolatedAction[];
}
