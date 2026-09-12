import type mongoose from 'mongoose';
import type { IMessage, IMessageArchive, MessageUser, UserId } from './message';

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
  message: IMessage | IMessageArchive;
  user: MessageUser;
  /**
   * Stable, persisted idempotency key for this action attempt. Handlers that
   * call external systems must pass this key to those systems or otherwise
   * deduplicate by it; the service cannot make arbitrary external side effects
   * exactly-once.
   */
  actionAttemptId?: string;
  getModel: (name: string) => mongoose.Model<unknown>;
  expireSession?: (sessionId: string) => Promise<void>;
  refundPayment?: (sessionId: string) => Promise<void>;
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
// Registered (readonly) views — returned by TemplateRegistry.find()/getAll()
// ---------------------------------------------------------------------------

/**
 * Readonly uiTemplate view matching the registry freeze depth: a plain string
 * passes through, while object forms are shallow-frozen at registration.
 */
export type RegisteredUiTemplate = string | Readonly<{ sender?: string; receiver?: string }>;

/**
 * Readonly action view matching the registry freeze depth: the action object,
 * its `confirmation`, and its `payload` are each shallow-frozen. Function
 * fields (`condition`, `runHandler`, `senderNotification`) keep their original
 * identity and remain callable.
 */
export type RegisteredMessageAction = Readonly<Omit<MessageAction, 'confirmation' | 'payload'>> & {
  readonly confirmation?: Readonly<ActionConfirmation>;
  readonly payload?: Readonly<Record<string, unknown>>;
};

/**
 * Readonly template view matching the registry freeze depth: the top-level
 * snapshot, `senderContent`/`receiverContent`, object `uiTemplate`s, the
 * action array, and each action plus its `confirmation`/`payload` are frozen.
 * Mutating a registered view throws at runtime; register a replacement
 * template to change behavior.
 *
 * Registration inputs stay author-friendly and mutable (`MessageTemplate`);
 * only registry outputs use this readonly view.
 */
export type RegisteredMessageTemplate = Readonly<
  Omit<MessageTemplate, 'senderContent' | 'receiverContent' | 'uiTemplate' | 'actions'>
> & {
  readonly senderContent: Readonly<MessageTemplate['senderContent']>;
  readonly receiverContent: Readonly<MessageTemplate['receiverContent']>;
  readonly uiTemplate: RegisteredUiTemplate;
  readonly actions: readonly RegisteredMessageAction[];
};

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
  name: string;
  variant: string;
  /**
   * When multiple actions are available, the UI may auto-submit or pre-select
   * the one with `isDefault: true`. Templates should set this on at most one
   * action per usertype.
   */
  isDefault?: boolean;
  confirmation?: ActionConfirmation;
  payload?: Record<string, unknown>;
}

export interface InterpolationResult {
  senderContent: InterpolatedContent;
  receiverContent: InterpolatedContent;
  uiTemplate: UiTemplate;
  actions: InterpolatedAction[];
}

/**
 * The role a user plays with respect to a message.
 * `'sender'` is the user who created the message; `'receiver'` is the
 * intended recipient (a direct user or a member of one of the `toRoles`).
 */
export type Usertype = 'sender' | 'receiver';
