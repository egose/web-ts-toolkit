import { isString } from '@web-ts-toolkit/utils';
import { randomUUID } from 'node:crypto';
import mongoose from 'mongoose';
import type { IMessage, IMessageArchive, MessageUser, UserId } from './types/message';
import type {
  MessageTemplate,
  MessageAction,
  SenderNotificationContent,
  UiTemplate,
  InterpolatedAction,
  ActionContext,
  PrepareResult,
  Usertype,
} from './types/template';
import type { PaymentProvider } from './providers/payment';
import { interpolateTemplate, isActionAllowed } from './template-engine';
import { TemplateRegistry, defaultRegistry } from './template-registry';
import { MESSAGE_MODEL_NAME, MESSAGE_ARCHIVE_MODEL_NAME, MESSAGE_REQUEST_MODEL_NAME } from './schemas/base';
import { isRuntimeError, markRuntimeError } from './runtime-contract';

// ---------------------------------------------------------------------------
// Configuration
// ---------------------------------------------------------------------------

export interface MessageServiceOptions {
  getModel?: (name: string) => mongoose.Model<unknown>;
  connection?: mongoose.Connection;
  modelNames?: Partial<MessageServiceModelNames>;
  paymentProvider?: PaymentProvider | null;
  /**
   * Called when the service cannot expire an external payment session that was
   * created for a message batch that did not commit.
   */
  onPaymentCompensationFailure?: (event: PaymentCompensationFailureEvent) => void | Promise<void>;
  adminRoles?: string[];
  registry?: TemplateRegistry;
  /**
   * Maximum number of messages returned by `listMessages` when no explicit
   * limit is provided. Defaults to 50.
   */
  defaultListLimit?: number;
  /**
   * Hard upper bound for `listMessages` limit to prevent abuse. Defaults to 100.
   */
  maxListLimit?: number;
  /**
   * How long a pending idempotent create reservation lease remains live before
   * another caller may atomically take it over. Defaults to 30000 ms.
   */
  clientRequestLeaseMs?: number;
  /**
   * Maximum time a duplicate idempotent create waits for completion or stale
   * lease takeover before raising `ClientRequestPendingError`. Defaults to 5000 ms.
   */
  clientRequestWaitMs?: number;
  /** Poll interval while waiting for an idempotent create outcome. Defaults to 200 ms. */
  clientRequestPollMs?: number;
  /** Test hook for deterministic waiting; production uses `setTimeout`. */
  clientRequestDelay?: (ms: number) => Promise<void>;
}

export interface MessageServiceModelNames {
  active: string;
  archive: string;
  request: string;
  user: string;
}

export interface PaymentCompensationFailureEvent {
  operation: 'expire';
  sessionId: string;
  error: unknown;
  originalError: unknown;
  clientRequestId?: string;
  clientRequestOwnerId?: string;
  templateCd?: string;
}

const DEFAULT_LIST_LIMIT = 50;
const MAX_LIST_LIMIT = 100;
const DUPLICATE_KEY_ERROR_CODE = 11000;
const CLIENT_REQUEST_LEASE_MS = 30_000;
const CLIENT_REQUEST_WAIT_MS = 5_000;
const CLIENT_REQUEST_POLL_MS = 200;
const ACTION_LEASE_MS = 30_000;
const MAX_CLIENT_REQUEST_ID_LENGTH = 128;
const TRANSACTION_REQUIRED_MESSAGE =
  'message-service requires MongoDB replica set or sharded-cluster transactions for idempotent batch creation';

interface ClientRequestScope {
  clientRequestId: string;
  clientRequestOwnerId: string;
  templateCd: string;
}

interface MessageRequestRecord {
  clientRequestId: string;
  clientRequestOwnerId: string;
  templateCd: string;
  state: 'pending' | 'completed' | 'failed';
  itemCount: number | null;
  leaseOwnerId?: string | null;
  leaseExpiresAt?: Date | null;
  completedAt?: Date | null;
  failedAt?: Date | null;
  failureMessage?: string | null;
}

interface ClientRequestLease {
  ownerId: string;
}

type ClientRequestStart = { kind: 'lease'; lease: ClientRequestLease } | { kind: 'replay'; replay: IMessage[] };

type MessageDocumentData = Record<string, unknown>;
type HydratedModelSource = { constructor: unknown };

type MessageModelRole = keyof MessageServiceModelNames;

const DEFAULT_MODEL_NAMES: MessageServiceModelNames = {
  active: MESSAGE_MODEL_NAME,
  archive: MESSAGE_ARCHIVE_MODEL_NAME,
  request: MESSAGE_REQUEST_MODEL_NAME,
  user: 'User',
};

interface ActionClaim {
  message: IMessage;
  actionAttemptId: string;
}

/**
 * The `templateCd` used for generic notifications created via
 * `createNotification`. These messages have no actions, so
 * `getActions` returns an empty list for them.
 */
export const GENERIC_NOTIFICATION_TEMPLATE_CD = '__generic-notification__';

// ---------------------------------------------------------------------------
// Typed errors
// ---------------------------------------------------------------------------

export class MessageNotFoundError extends Error {
  static [Symbol.hasInstance](value: unknown): boolean {
    return isRuntimeError(value, 'MessageNotFoundError');
  }

  constructor(messageId: string) {
    super(`message "${messageId}" not found`);
    this.name = 'MessageNotFoundError';
    markRuntimeError(this, this.name);
  }
}

export class MessageArchivedError extends Error {
  static [Symbol.hasInstance](value: unknown): boolean {
    return isRuntimeError(value, 'MessageArchivedError');
  }

  constructor(messageId: string) {
    super(`message "${messageId}" is archived`);
    this.name = 'MessageArchivedError';
    markRuntimeError(this, this.name);
  }
}

export class TemplateNotFoundError extends Error {
  static [Symbol.hasInstance](value: unknown): boolean {
    return isRuntimeError(value, 'TemplateNotFoundError');
  }

  constructor(templateCd: string) {
    super(`template "${templateCd}" not found`);
    this.name = 'TemplateNotFoundError';
    markRuntimeError(this, this.name);
  }
}

export class ActionNotFoundError extends Error {
  static [Symbol.hasInstance](value: unknown): boolean {
    return isRuntimeError(value, 'ActionNotFoundError');
  }

  constructor(templateCd: string, actionCd: string) {
    super(`action "${actionCd}" not found in template "${templateCd}"`);
    this.name = 'ActionNotFoundError';
    markRuntimeError(this, this.name);
  }
}

export class ActionNotAllowedError extends Error {
  static [Symbol.hasInstance](value: unknown): boolean {
    return isRuntimeError(value, 'ActionNotAllowedError');
  }

  constructor() {
    super('not allowed');
    this.name = 'ActionNotAllowedError';
    markRuntimeError(this, this.name);
  }
}

export class InvalidMessageUserError extends Error {
  static [Symbol.hasInstance](value: unknown): boolean {
    return isRuntimeError(value, 'InvalidMessageUserError');
  }

  constructor(message = 'user._id must be a non-empty string or ObjectId') {
    super(message);
    this.name = 'InvalidMessageUserError';
    markRuntimeError(this, this.name);
  }
}

export class ActionTemplateMismatchError extends Error {
  static [Symbol.hasInstance](value: unknown): boolean {
    return isRuntimeError(value, 'ActionTemplateMismatchError');
  }

  constructor(expectedTemplateCd: string, receivedTemplateCd: string) {
    super(`message template "${expectedTemplateCd}" does not match requested template "${receivedTemplateCd}"`);
    this.name = 'ActionTemplateMismatchError';
    markRuntimeError(this, this.name);
  }
}

export class ActionConflictError extends Error {
  static [Symbol.hasInstance](value: unknown): boolean {
    return isRuntimeError(value, 'ActionConflictError');
  }

  constructor(messageId: string) {
    super(`message "${messageId}" already has an action in progress`);
    this.name = 'ActionConflictError';
    markRuntimeError(this, this.name);
  }
}

export class ActionRetryableError extends Error {
  static [Symbol.hasInstance](value: unknown): boolean {
    return isRuntimeError(value, 'ActionRetryableError');
  }

  actionAttemptId: string;

  constructor(messageId: string, actionAttemptId: string, cause?: unknown) {
    super(`message "${messageId}" action attempt "${actionAttemptId}" failed before commit and may be retried`);
    this.name = 'ActionRetryableError';
    markRuntimeError(this, this.name);
    this.actionAttemptId = actionAttemptId;
    if (cause) {
      (this as Error & { cause?: unknown }).cause = cause;
    }
  }
}

export class ActionNotificationPendingError extends Error {
  static [Symbol.hasInstance](value: unknown): boolean {
    return isRuntimeError(value, 'ActionNotificationPendingError');
  }

  actionAttemptId: string;
  result: unknown;

  constructor(messageId: string, actionAttemptId: string, result: unknown, cause?: unknown) {
    super(`message "${messageId}" action committed but sender notification is pending`);
    this.name = 'ActionNotificationPendingError';
    markRuntimeError(this, this.name);
    this.actionAttemptId = actionAttemptId;
    this.result = result;
    if (cause) {
      (this as Error & { cause?: unknown }).cause = cause;
    }
  }
}

export class InvalidClientRequestIdError extends Error {
  static [Symbol.hasInstance](value: unknown): boolean {
    return isRuntimeError(value, 'InvalidClientRequestIdError');
  }

  constructor(message: string) {
    super(message);
    this.name = 'InvalidClientRequestIdError';
    markRuntimeError(this, this.name);
  }
}

export class InvalidPaginationValueError extends Error {
  static [Symbol.hasInstance](value: unknown): boolean {
    return isRuntimeError(value, 'InvalidPaginationValueError');
  }

  constructor(message: string) {
    super(message);
    this.name = 'InvalidPaginationValueError';
    markRuntimeError(this, this.name);
  }
}

export class ClientRequestPendingError extends Error {
  static [Symbol.hasInstance](value: unknown): boolean {
    return isRuntimeError(value, 'ClientRequestPendingError');
  }

  constructor(clientRequestId: string) {
    super(
      `clientRequestId "${clientRequestId}" is still pending; retry after the current reservation completes or its lease expires`,
    );
    this.name = 'ClientRequestPendingError';
    markRuntimeError(this, this.name);
  }
}

export class ClientRequestFailedError extends Error {
  static [Symbol.hasInstance](value: unknown): boolean {
    return isRuntimeError(value, 'ClientRequestFailedError');
  }

  constructor(clientRequestId: string, reason?: string | null) {
    super(`clientRequestId "${clientRequestId}" previously failed${reason ? `: ${reason}` : ''}`);
    this.name = 'ClientRequestFailedError';
    markRuntimeError(this, this.name);
  }
}

export class ClientRequestInconsistentStateError extends Error {
  static [Symbol.hasInstance](value: unknown): boolean {
    return isRuntimeError(value, 'ClientRequestInconsistentStateError');
  }

  constructor(clientRequestId: string, message: string) {
    super(`clientRequestId "${clientRequestId}" has inconsistent persisted state: ${message}`);
    this.name = 'ClientRequestInconsistentStateError';
    markRuntimeError(this, this.name);
  }
}

export class MessageTransactionRequiredError extends Error {
  static [Symbol.hasInstance](value: unknown): boolean {
    return isRuntimeError(value, 'MessageTransactionRequiredError');
  }

  constructor(cause?: unknown) {
    super(TRANSACTION_REQUIRED_MESSAGE);
    this.name = 'MessageTransactionRequiredError';
    markRuntimeError(this, this.name);
    if (cause) {
      (this as Error & { cause?: unknown }).cause = cause;
    }
  }
}

export class MessageModelResolutionError extends Error {
  static [Symbol.hasInstance](value: unknown): boolean {
    return isRuntimeError(value, 'MessageModelResolutionError');
  }

  role: MessageModelRole;
  modelName: string;
  connectionName: string;

  constructor(role: MessageModelRole, modelName: string, connectionName: string, cause?: unknown) {
    super(`message-service could not resolve ${role} model "${modelName}" on ${connectionName}`);
    this.name = 'MessageModelResolutionError';
    markRuntimeError(this, this.name);
    this.role = role;
    this.modelName = modelName;
    this.connectionName = connectionName;
    if (cause) {
      (this as Error & { cause?: unknown }).cause = cause;
    }
  }
}

export class PaymentSessionCompensationError extends Error {
  static [Symbol.hasInstance](value: unknown): boolean {
    return isRuntimeError(value, 'PaymentSessionCompensationError');
  }

  sessionId: string;
  operation: 'expire';
  compensationError: unknown;
  originalError: unknown;
  hookError?: unknown;

  constructor(
    sessionId: string,
    operation: 'expire',
    compensationError: unknown,
    originalError: unknown,
    hookError?: unknown,
  ) {
    super(`payment session compensation failed for session "${sessionId}" during ${operation}`);
    this.name = 'PaymentSessionCompensationError';
    markRuntimeError(this, this.name);
    this.sessionId = sessionId;
    this.operation = operation;
    this.compensationError = compensationError;
    this.originalError = originalError;
    this.hookError = hookError;
    (this as Error & { cause?: unknown }).cause = compensationError;
  }
}

// ---------------------------------------------------------------------------
// MessageService
// ---------------------------------------------------------------------------

interface CreateContext {
  user: MessageUser;
  roles: string[];
  identity: Record<string, unknown>;
  permissions: Record<string, boolean>;
  payload: Record<string, unknown>;
  payerUser?: MessageUser;
  req?: unknown;
}

/**
 * Core message service for creating messages, getting actions, and handling actions.
 *
 * @example
 * const service = new MessageService({ getModel: mongoose.model.bind(mongoose) });
 */
export class MessageService {
  private getModel?: (name: string) => mongoose.Model<unknown>;
  private connection?: mongoose.Connection;
  private modelNames: MessageServiceModelNames;
  private paymentProvider: PaymentProvider | null;
  private expirePaymentSession?: (sessionId: string) => Promise<void>;
  private refundPaymentSession?: (sessionId: string) => Promise<void>;
  private onPaymentCompensationFailure?: (event: PaymentCompensationFailureEvent) => void | Promise<void>;
  private adminRoles: string[];
  private registry: TemplateRegistry;
  private defaultListLimit: number;
  private maxListLimit: number;
  private clientRequestLeaseMs: number;
  private clientRequestWaitMs: number;
  private clientRequestPollMs: number;
  private clientRequestDelay: (ms: number) => Promise<void>;
  private actionLeaseMs: number;

  constructor(options: MessageServiceOptions) {
    this.getModel = options.getModel;
    this.connection = options.connection;
    this.modelNames = { ...DEFAULT_MODEL_NAMES, ...options.modelNames };
    this.paymentProvider = options.paymentProvider ?? null;
    this.expirePaymentSession = this.paymentProvider?.expireSession.bind(this.paymentProvider);
    this.refundPaymentSession = this.paymentProvider?.refundPayment.bind(this.paymentProvider);
    this.onPaymentCompensationFailure = options.onPaymentCompensationFailure;
    this.adminRoles = options.adminRoles ?? [];
    this.registry = options.registry ?? defaultRegistry;
    this.maxListLimit = this.validatePositiveIntegerOption('maxListLimit', options.maxListLimit ?? MAX_LIST_LIMIT);
    this.defaultListLimit = this.validatePositiveIntegerOption(
      'defaultListLimit',
      options.defaultListLimit ?? DEFAULT_LIST_LIMIT,
    );
    if (this.defaultListLimit > this.maxListLimit) {
      throw new InvalidPaginationValueError('defaultListLimit must be less than or equal to maxListLimit');
    }
    this.clientRequestLeaseMs = options.clientRequestLeaseMs ?? CLIENT_REQUEST_LEASE_MS;
    this.clientRequestWaitMs = options.clientRequestWaitMs ?? CLIENT_REQUEST_WAIT_MS;
    this.clientRequestPollMs = options.clientRequestPollMs ?? CLIENT_REQUEST_POLL_MS;
    this.clientRequestDelay = options.clientRequestDelay ?? this.delay;
    this.actionLeaseMs = ACTION_LEASE_MS;
  }

  // -------------------------------------------------------------------------
  // Message lookup
  // -------------------------------------------------------------------------

  /**
   * Find a message by id, falling back to the archive. Returns null if
   * the message does not exist in either collection.
   */
  async findMessage(
    messageId: string,
    options: {
      populate?: string | string[] | mongoose.PopulateOptions | mongoose.PopulateOptions[];
      select?: string | Record<string, 0 | 1 | boolean>;
    } = {},
  ): Promise<IMessage | IMessageArchive | null> {
    const Message = this.resolveModel('active');
    const MessageArchive = this.resolveModel('archive');
    const message = (await this.findByIdWithOptions<IMessage>(Message, messageId, options)) as IMessage | null;
    if (message) return message;
    return (await this.findByIdWithOptions<IMessageArchive>(
      MessageArchive,
      messageId,
      options,
    )) as IMessageArchive | null;
  }

  async findMessageOrThrow(
    messageId: string,
    options: {
      populate?: string | string[] | mongoose.PopulateOptions | mongoose.PopulateOptions[];
      select?: string | Record<string, 0 | 1 | boolean>;
    } = {},
  ): Promise<IMessage | IMessageArchive> {
    const message = await this.findMessage(messageId, options);
    if (!message) {
      throw new MessageNotFoundError(messageId);
    }
    return message;
  }

  // -------------------------------------------------------------------------
  // Create message from template
  // -------------------------------------------------------------------------

  async createMessage(params: {
    templateCd: string;
    user: MessageUser;
    roles?: string[];
    identity?: Record<string, unknown>;
    permissions?: Record<string, boolean>;
    payload?: Record<string, unknown>;
    payerUser?: MessageUser;
    req?: unknown;
    /**
     * Optional client-supplied request id. The service trims surrounding
     * whitespace, preserves case, and requires a non-empty value up to 128
     * characters. Replays are scoped to the requester identity and template.
     */
    clientRequestId?: unknown;
  }): Promise<IMessage[]> {
    const {
      templateCd,
      user,
      roles = [],
      identity = {},
      permissions = {},
      payload = {},
      payerUser,
      req,
      clientRequestId,
    } = params;

    const normalizedClientRequestId = this.normalizeClientRequestId(clientRequestId);

    if (normalizedClientRequestId) {
      return this.createMessageWithReservation({
        templateCd,
        user,
        roles,
        identity,
        permissions,
        payload,
        payerUser,
        req,
        clientRequestId: normalizedClientRequestId,
      });
    }

    return this.createPreparedMessageBatch({
      templateCd,
      user,
      roles,
      identity,
      permissions,
      payload,
      payerUser,
      req,
    });
  }

  private async createMessageWithReservation(params: {
    templateCd: string;
    user: MessageUser;
    roles: string[];
    identity: Record<string, unknown>;
    permissions: Record<string, boolean>;
    payload: Record<string, unknown>;
    payerUser?: MessageUser;
    req?: unknown;
    clientRequestId: string;
  }): Promise<IMessage[]> {
    const clientRequestScope = this.buildClientRequestScope(params.clientRequestId, params.user, params.templateCd);

    const replay = await this.findCompletedClientRequestReplay(clientRequestScope);
    if (replay !== null) return replay;

    const start = await this.acquireClientRequestStart(clientRequestScope);
    if (start.kind === 'replay') return start.replay;

    try {
      const results = await this.createPreparedMessageBatch({
        ...params,
        clientRequestScope,
        clientRequestLease: start.lease,
      });
      return results;
    } catch (error) {
      if (!(error instanceof ClientRequestPendingError)) {
        await this.failClientRequestReservation(clientRequestScope, start.lease, error);
      }
      throw error;
    }
  }

  private async createPreparedMessageBatch(params: {
    templateCd: string;
    user: MessageUser;
    roles: string[];
    identity: Record<string, unknown>;
    permissions: Record<string, boolean>;
    payload: Record<string, unknown>;
    payerUser?: MessageUser;
    req?: unknown;
    clientRequestScope?: ClientRequestScope;
    clientRequestLease?: ClientRequestLease;
  }): Promise<IMessage[]> {
    const {
      templateCd,
      user,
      roles,
      identity,
      permissions,
      payload,
      payerUser,
      req,
      clientRequestScope,
      clientRequestLease,
    } = params;

    const template = this.registry.find(templateCd);
    if (!template) throw new TemplateNotFoundError(templateCd);

    const messageData = await template.prepareMessage({
      user,
      roles,
      identity,
      permissions,
      payload,
      getModel: this.getTemplateModelResolver(),
      req,
    });

    if (!messageData) {
      if (clientRequestScope && clientRequestLease) {
        await this.persistPreparedBatchTransaction(clientRequestScope, clientRequestLease, []);
      }
      return [];
    }

    const ctx: CreateContext = { user, roles, identity, permissions, payload, payerUser, req };
    const items = Array.isArray(messageData) ? messageData : [messageData];
    if (clientRequestScope && clientRequestLease) {
      const docs: MessageDocumentData[] = [];
      for (let index = 0; index < items.length; index++) {
        docs.push(await this.buildMessageDocument(template, items[index], ctx, clientRequestScope, index));
      }

      return this.persistPreparedBatchTransaction(clientRequestScope, clientRequestLease, docs);
    }

    const results: IMessage[] = [];
    for (let index = 0; index < items.length; index++) {
      const item = items[index];
      results.push(await this.persistItem(template, item, ctx, clientRequestScope, clientRequestScope ? index : null));
    }

    return results;
  }

  // -------------------------------------------------------------------------
  // Create generic notification (no template, no actions)
  // -------------------------------------------------------------------------

  async createNotification(
    params: {
      fromUser?: UserId | null;
      toUser?: UserId | null;
      toRoles?: string[];
      receiverContent: { title: string; long: string; short?: string };
      senderContent?: { title: string; long: string; short?: string };
      documents?: mongoose.Types.ObjectId[];
    },
    sourceDocument?: HydratedModelSource | null,
  ): Promise<IMessage> {
    const Message = this.resolveModel('active', sourceDocument);
    return Message.create({
      type: 'notification',
      templateCd: GENERIC_NOTIFICATION_TEMPLATE_CD,
      fromUser: params.fromUser ?? null,
      toUser: params.toUser ?? null,
      toRoles: params.toRoles,
      senderContent: params.senderContent,
      receiverContent: params.receiverContent,
      documents: params.documents || [],
    }) as unknown as Promise<IMessage>;
  }

  // -------------------------------------------------------------------------
  // List messages
  // -------------------------------------------------------------------------

  /**
   * Build a Mongoose filter for messages visible to the given user.
   * Exposed so callers can use the same visibility rules for custom
   * queries (e.g. with `populate`).
   */
  buildVisibilityFilter(user: MessageUser): Record<string, unknown> {
    const userId = this.requireUserId(user);
    return {
      $or: [{ fromUser: userId }, { toUser: userId }, { toRoles: { $in: user.roles ?? [] } }],
    };
  }

  /**
   * List active (non-archived) messages visible to a user.
   * Returns messages where the user is the sender, the receiver,
   * or matches one of the recipient's roles.
   */
  async listMessages(params: {
    user: MessageUser;
    limit?: number;
    skip?: number;
    populate?: string | string[] | mongoose.PopulateOptions | mongoose.PopulateOptions[];
  }): Promise<IMessage[]> {
    const { user, limit: rawLimit, skip: rawSkip, populate } = params;
    const limit = this.normalizeListLimit(rawLimit);
    const skip = this.normalizeListSkip(rawSkip);

    const Message = this.resolveModel('active');
    const query = this.applyPopulate(
      Message.find(this.buildVisibilityFilter(user)).sort({ createdAt: -1, _id: -1 }).skip(skip).limit(limit),
      populate,
    );

    return query as unknown as Promise<IMessage[]>;
  }

  /**
   * Count active (non-archived) messages visible to a user.
   * Useful for badge indicators ("3 new messages").
   */
  async countMessages(user: MessageUser): Promise<number> {
    const Message = this.resolveModel('active');
    return Message.countDocuments(this.buildVisibilityFilter(user));
  }

  // -------------------------------------------------------------------------
  // Get actions for a message
  // -------------------------------------------------------------------------

  async getActions(
    messageId: string,
    usertype: Usertype,
    options: {
      permissions?: Record<string, boolean>;
      message?: IMessage | IMessageArchive;
      user?: MessageUser;
      isAdmin?: boolean;
      populate?: string | string[] | mongoose.PopulateOptions | mongoose.PopulateOptions[];
    } = {},
  ): Promise<{ uiTemplate: UiTemplate; actions: InterpolatedAction[] } | null> {
    const message = options.message ?? (await this.findMessage(messageId, { populate: options.populate }));
    if (!message) return null;
    const user = this.requireUserId(options.user);
    const authorizedUser = { ...options.user!, _id: user };

    if (!options.isAdmin) {
      const isAllowedUsertype =
        usertype === 'sender' ? message.isSender(authorizedUser) : message.isReceiver(authorizedUser);
      if (!isAllowedUsertype) {
        return null;
      }
    }

    if (message.templateCd === GENERIC_NOTIFICATION_TEMPLATE_CD) {
      return { uiTemplate: 'notification', actions: [] };
    }

    const template = this.registry.find(message.templateCd);
    if (!template) return null;

    const data = (message.payload as Record<string, unknown> | undefined) ?? {};
    const interpolated = interpolateTemplate(template, data, usertype, {
      permissions: options.permissions,
      message: message as unknown as Record<string, unknown>,
    });

    if (options.isAdmin || this.isArchivedMessage(message)) {
      return { uiTemplate: interpolated.uiTemplate, actions: [] };
    }

    return { uiTemplate: interpolated.uiTemplate, actions: interpolated.actions };
  }

  // -------------------------------------------------------------------------
  // Handle an action on a message
  // -------------------------------------------------------------------------

  async handleAction(
    templateCd: string,
    actionCd: string,
    data: {
      message: IMessage | IMessageArchive;
      user: MessageUser;
      permissions?: Record<string, boolean>;
      req?: unknown;
    },
  ): Promise<unknown> {
    const userId = this.requireUserId(data.user);
    const authorizedUser = { ...data.user, _id: userId };
    if (this.isArchivedMessage(data.message)) {
      if (data.message.actionNotificationState === 'pending' || data.message.actionNotificationState === 'failed') {
        throw new ActionNotificationPendingError(
          String(data.message._id),
          data.message.actionAttemptId ?? '',
          undefined,
        );
      }
      throw new MessageArchivedError(String(data.message._id));
    }

    if (templateCd !== data.message.templateCd) {
      throw new ActionTemplateMismatchError(data.message.templateCd, templateCd);
    }

    const template = this.registry.find(data.message.templateCd);
    if (!template) throw new TemplateNotFoundError(data.message.templateCd);

    const action = template.actions.find((a) => a.actionCd === actionCd);
    if (!action) throw new ActionNotFoundError(data.message.templateCd, actionCd);

    if (!isActionAllowed(action, authorizedUser, data.message, { permissions: data.permissions })) {
      throw new ActionNotAllowedError();
    }

    const claim = await this.claimAction(data.message, actionCd, authorizedUser);
    const ctx = this.buildActionContext({
      ...data,
      user: authorizedUser,
      message: claim.message,
      actionAttemptId: claim.actionAttemptId,
    });
    let result: unknown;
    try {
      result = await action.runHandler(ctx);
    } catch (error) {
      await this.markActionRetryable(data.message._id, claim.actionAttemptId, error, claim.message);
      throw new ActionRetryableError(String(data.message._id), claim.actionAttemptId, error);
    }

    await this.archiveClaimedMessage(claim.message, action, authorizedUser, claim.actionAttemptId);

    if (action.senderNotification) {
      try {
        await this.runSenderNotification(action, ctx, claim.message);
        await this.markActionNotificationState(
          data.message._id,
          claim.actionAttemptId,
          'sent',
          undefined,
          claim.message,
        );
      } catch (error) {
        await this.markActionNotificationState(data.message._id, claim.actionAttemptId, 'failed', error, claim.message);
        throw new ActionNotificationPendingError(String(data.message._id), claim.actionAttemptId, result, error);
      }
    }

    return result;
  }

  // -------------------------------------------------------------------------
  // Private helpers
  // -------------------------------------------------------------------------

  private resolveModel(
    role: MessageModelRole,
    sourceDocument?: HydratedModelSource | null,
    sourceModel?: mongoose.Model<unknown>,
  ): mongoose.Model<unknown> {
    const modelName = this.modelNames[role];
    const sourceConnection = this.getModelConnection(sourceModel) ?? this.getDocumentConnection(sourceDocument);

    try {
      if (this.getModel) {
        const model = this.getModel(modelName);
        if (!model) {
          throw new Error(`resolver returned no model for "${modelName}"`);
        }
        const resolvedConnection = this.getModelConnection(model);
        if (sourceConnection && resolvedConnection && resolvedConnection !== sourceConnection) {
          throw new Error(
            `resolver returned model "${modelName}" from connection "${resolvedConnection.name || '<unnamed>'}" instead of source connection "${sourceConnection.name || '<unnamed>'}"`,
          );
        }
        return model;
      }

      if (sourceConnection) {
        return sourceConnection.model(modelName) as mongoose.Model<unknown>;
      }

      if (this.connection) {
        return this.connection.model(modelName) as mongoose.Model<unknown>;
      }

      return mongoose.model(modelName) as mongoose.Model<unknown>;
    } catch (error) {
      throw new MessageModelResolutionError(role, modelName, this.describeModelSource(sourceConnection), error);
    }
  }

  private getTemplateModelResolver(
    sourceDocument?: HydratedModelSource | null,
  ): (name: string) => mongoose.Model<unknown> {
    const sourceConnection = this.getDocumentConnection(sourceDocument);
    return (name) => {
      try {
        if (sourceConnection) return sourceConnection.model(name) as mongoose.Model<unknown>;
        if (this.getModel) return this.getModel(name);
        if (this.connection) return this.connection.model(name) as mongoose.Model<unknown>;
        return mongoose.model(name) as mongoose.Model<unknown>;
      } catch (error) {
        throw new MessageModelResolutionError('user', name, this.describeModelSource(sourceConnection), error);
      }
    };
  }

  private getDocumentConnection(sourceDocument?: HydratedModelSource | null): mongoose.Connection | undefined {
    if (!sourceDocument) return undefined;
    const model = sourceDocument.constructor as mongoose.Model<unknown> & { db?: mongoose.Connection };
    return this.getModelConnection(model);
  }

  private getModelConnection(model?: mongoose.Model<unknown> | null): mongoose.Connection | undefined {
    const connection = model?.db as mongoose.Connection | undefined;
    return connection && typeof connection.model === 'function' ? connection : undefined;
  }

  private describeModelSource(sourceConnection?: mongoose.Connection): string {
    const connection = sourceConnection ?? this.connection;
    if (connection) {
      return `Mongoose connection "${connection.name || '<unnamed>'}"`;
    }
    if (this.getModel) {
      return 'the configured model resolver';
    }
    return 'global mongoose';
  }

  private async persistItem(
    template: MessageTemplate,
    m: PrepareResult,
    ctx: CreateContext,
    clientRequestScope: ClientRequestScope | undefined,
    clientRequestItemIndex: number | null,
  ): Promise<IMessage> {
    const Message = this.resolveModel('active');
    const doc = await this.buildMessageDocument(template, m, ctx, clientRequestScope, clientRequestItemIndex);
    try {
      return (await Message.create(doc)) as unknown as IMessage;
    } catch (error) {
      await this.compensatePaymentSessions([doc], error, clientRequestScope);
      throw error;
    }
  }

  private async buildMessageDocument(
    template: MessageTemplate,
    m: PrepareResult,
    ctx: CreateContext,
    clientRequestScope: ClientRequestScope | undefined,
    clientRequestItemIndex: number | null,
  ): Promise<MessageDocumentData> {
    const toUser = m.toUser ?? null;
    const toRoles = (m.toRoles && m.toRoles.length > 0 ? m.toRoles : this.adminRoles).slice();
    const type = m.type || template.type || 'notification';
    const paymentCd = m.paymentCd || template.paymentCd || '';

    let paymentSession: string | null = null;
    try {
      if (paymentCd && this.paymentProvider && (toUser || toRoles.length > 0)) {
        paymentSession = await this.paymentProvider.createSession(
          (ctx.payerUser || ctx.user)._id,
          paymentCd,
          m.priceArgs,
        );
        if (!paymentSession) throw new Error('payment session creation failed');
      }

      const interpolated = interpolateTemplate(template, m.templateData || {}, 'receiver');

      return {
        type,
        templateCd: template.templateCd,
        fromUser: m.fromUser || ctx.user._id,
        toUser,
        toRoles,
        senderContent: interpolated.senderContent,
        receiverContent: interpolated.receiverContent,
        documents: (ctx.payload.documents as mongoose.Types.ObjectId[]) || [],
        paymentSession,
        paymentCd,
        payload: m.payload || ctx.payload,
        display: m.display,
        clientRequestId: clientRequestScope?.clientRequestId ?? null,
        clientRequestOwnerId: clientRequestScope?.clientRequestOwnerId ?? null,
        clientRequestItemIndex,
      };
    } catch (error) {
      if (paymentSession) {
        await this.compensatePaymentSession(paymentSession, error, clientRequestScope);
      }
      throw error;
    }
  }

  private async persistPreparedBatchTransaction(
    scope: ClientRequestScope,
    lease: ClientRequestLease,
    docs: MessageDocumentData[],
  ): Promise<IMessage[]> {
    const Message = this.resolveModel('active') as mongoose.Model<unknown> & {
      db?: { startSession?: () => Promise<mongoose.ClientSession> };
    };
    const MessageRequest = this.resolveModel('request', undefined, Message);

    const operation = async (session?: mongoose.ClientSession): Promise<IMessage[]> => {
      const created =
        docs.length > 0 ? await Message.create(docs, session ? { session, ordered: true } : undefined) : [];
      const result = (await MessageRequest.updateOne(
        { ...scope, state: 'pending', leaseOwnerId: lease.ownerId },
        {
          $set: {
            state: 'completed',
            itemCount: docs.length,
            completedAt: new Date(),
            leaseExpiresAt: null,
          },
        },
        session ? { session } : undefined,
      )) as { matchedCount?: number; modifiedCount?: number; n?: number };

      if ((result.matchedCount ?? result.n ?? 0) !== 1) {
        throw new ClientRequestPendingError(scope.clientRequestId);
      }

      return created as unknown as IMessage[];
    };

    const startSession = Message.db?.startSession;
    if (!startSession) {
      try {
        return await operation();
      } catch (error) {
        await this.compensatePaymentSessions(docs, error, scope);
        throw error;
      }
    }

    const session = await startSession.call(Message.db);
    try {
      let result: IMessage[] = [];
      await session.withTransaction(async () => {
        result = await operation(session);
      });
      return result;
    } catch (error) {
      const wrappedError = this.isTransactionSupportError(error) ? new MessageTransactionRequiredError(error) : error;
      await this.compensatePaymentSessions(docs, wrappedError, scope);
      if (this.isTransactionSupportError(error)) {
        throw wrappedError;
      }
      throw wrappedError;
    } finally {
      await session.endSession();
    }
  }

  private async compensatePaymentSessions(
    docs: MessageDocumentData[],
    originalError: unknown,
    scope?: ClientRequestScope,
  ): Promise<void> {
    const sessionIds = docs
      .map((doc) => doc.paymentSession)
      .filter((sessionId): sessionId is string => typeof sessionId === 'string' && sessionId.length > 0);

    for (const sessionId of sessionIds) {
      await this.compensatePaymentSession(sessionId, originalError, scope);
    }
  }

  private async compensatePaymentSession(
    sessionId: string,
    originalError: unknown,
    scope?: ClientRequestScope,
  ): Promise<void> {
    if (!this.expirePaymentSession) return;

    try {
      await this.expirePaymentSession(sessionId);
    } catch (error) {
      let hookError: unknown;
      try {
        await this.onPaymentCompensationFailure?.({
          operation: 'expire',
          sessionId,
          error,
          originalError,
          clientRequestId: scope?.clientRequestId,
          clientRequestOwnerId: scope?.clientRequestOwnerId,
          templateCd: scope?.templateCd,
        });
      } catch (eventError) {
        hookError = eventError;
      }
      throw new PaymentSessionCompensationError(sessionId, 'expire', error, originalError, hookError);
    }
  }

  private buildActionContext(data: {
    message: IMessage | IMessageArchive;
    user: MessageUser;
    actionAttemptId?: string;
    req?: unknown;
  }): ActionContext {
    return {
      message: data.message,
      user: data.user,
      actionAttemptId: data.actionAttemptId,
      getModel: this.getTemplateModelResolver(data.message),
      expireSession: this.expirePaymentSession,
      refundPayment: this.refundPaymentSession,
      req: data.req,
    };
  }

  private async claimAction(message: IMessage, actionCd: string, user: MessageUser): Promise<ActionClaim> {
    const Message = this.resolveModel('active', message);
    const messageId = message._id;
    const now = new Date();
    const claimBase = {
      actionCd,
      actionClaimedBy: String(user._id),
      actionClaimedAt: now,
      actionLeaseExpiresAt: new Date(now.getTime() + this.actionLeaseMs),
      actionFailureMessage: null,
    };

    const firstAttemptId = randomUUID();
    const firstClaim = (await Message.findOneAndUpdate(
      { _id: messageId, $or: [{ actionState: 'active' }, { actionState: null }, { actionState: { $exists: false } }] },
      { $set: { ...claimBase, actionState: 'processing', actionAttemptId: firstAttemptId } },
      { returnDocument: 'after' },
    )) as IMessage | null;
    if (firstClaim?.actionAttemptId) {
      return { message: firstClaim, actionAttemptId: firstClaim.actionAttemptId };
    }

    const retryClaim = (await Message.findOneAndUpdate(
      {
        _id: messageId,
        actionCd,
        actionAttemptId: { $type: 'string' },
        $or: [{ actionState: 'retryable' }, { actionState: 'processing', actionLeaseExpiresAt: { $lte: now } }],
      },
      { $set: { ...claimBase, actionState: 'processing' } },
      { returnDocument: 'after' },
    )) as IMessage | null;
    if (retryClaim?.actionAttemptId) {
      return { message: retryClaim, actionAttemptId: retryClaim.actionAttemptId };
    }

    const archived = (await this.resolveModel('archive', message, Message).findById(
      messageId,
    )) as IMessageArchive | null;
    if (archived) {
      if (archived.actionNotificationState === 'pending' || archived.actionNotificationState === 'failed') {
        throw new ActionNotificationPendingError(String(messageId), archived.actionAttemptId ?? '', undefined);
      }
      throw new MessageArchivedError(String(messageId));
    }

    throw new ActionConflictError(String(messageId));
  }

  private async markActionRetryable(
    messageId: unknown,
    actionAttemptId: string,
    error: unknown,
    sourceDocument?: HydratedModelSource | null,
  ): Promise<void> {
    const Message = this.resolveModel('active', sourceDocument);
    await Message.updateOne(
      { _id: messageId, actionState: 'processing', actionAttemptId },
      {
        $set: {
          actionState: 'retryable',
          actionFailureMessage: error instanceof Error ? error.message : String(error),
          actionLeaseExpiresAt: null,
        },
      },
    );
  }

  private async archiveClaimedMessage(
    message: IMessage,
    action: MessageAction,
    user: MessageUser,
    actionAttemptId: string,
  ): Promise<void> {
    const Message = this.resolveModel('active', message) as mongoose.Model<unknown> & {
      db?: { startSession?: () => Promise<mongoose.ClientSession> };
    };
    const MessageArchive = this.resolveModel('archive', message, Message) as mongoose.Model<Record<string, unknown>>;
    const messageId = message._id;
    const data = message.toObject() as unknown as Record<string, unknown>;
    const notificationState = action.senderNotification ? 'pending' : 'none';
    delete data.actionState;
    delete data.actionClaimedBy;
    delete data.actionClaimedAt;
    delete data.actionLeaseExpiresAt;
    delete data.actionFailureMessage;

    const operation = async (session?: mongoose.ClientSession) => {
      await MessageArchive.create(
        [
          {
            ...data,
            actionCd: action.actionCd,
            archivedBy: user._id,
            archivedAt: new Date(),
            actionAttemptId,
            actionNotificationState: notificationState,
            actionNotificationError: null,
            actionNotificationAttemptedAt: null,
          },
        ],
        session ? { session, ordered: true } : undefined,
      );
      const deleted = (await Message.deleteOne(
        { _id: messageId, actionState: 'processing', actionAttemptId },
        session ? { session } : undefined,
      )) as { deletedCount?: number; n?: number };
      if ((deleted.deletedCount ?? deleted.n ?? 0) !== 1) {
        throw new ActionConflictError(String(messageId));
      }
    };

    const startSession = Message.db?.startSession;
    if (!startSession) {
      await operation();
      return;
    }

    const session = await startSession.call(Message.db);
    try {
      await session.withTransaction(async () => {
        await operation(session);
      });
    } catch (error) {
      if (this.isTransactionSupportError(error)) {
        await this.markActionRetryable(messageId, actionAttemptId, error, message);
        throw new MessageTransactionRequiredError(error);
      }
      await this.markActionRetryable(messageId, actionAttemptId, error, message);
      throw error;
    } finally {
      await session.endSession();
    }
  }

  private async markActionNotificationState(
    messageId: unknown,
    actionAttemptId: string,
    state: 'sent' | 'failed',
    error?: unknown,
    sourceDocument?: HydratedModelSource | null,
  ): Promise<void> {
    const MessageArchive = this.resolveModel('archive', sourceDocument);
    await MessageArchive.updateOne(
      { _id: messageId, actionAttemptId },
      {
        $set: {
          actionNotificationState: state,
          actionNotificationError: state === 'failed' ? (error instanceof Error ? error.message : String(error)) : null,
          actionNotificationAttemptedAt: new Date(),
        },
      },
    );
  }

  private async runSenderNotification(
    action: MessageAction,
    ctx: ActionContext,
    message: IMessage | IMessageArchive,
  ): Promise<void> {
    if (!action.senderNotification) return;

    let content: string | SenderNotificationContent;
    if (typeof action.senderNotification === 'function') {
      content = await action.senderNotification(ctx);
    } else {
      content = action.senderNotification;
    }

    const senderTitle = message.senderContent?.title ?? '';
    const senderNotificationContent = isString(content)
      ? { title: senderTitle, long: content, short: content }
      : {
          title: content.title || senderTitle,
          long: content.long,
          short: content.short || content.long,
        };

    const documents = !isString(content) ? content.documents || [] : [];

    if (message.fromUser) {
      await this.createNotification(
        {
          toUser: message.fromUser,
          receiverContent: senderNotificationContent,
          documents,
        },
        message,
      );
    }
  }

  private normalizeClientRequestId(clientRequestId: unknown): string | undefined {
    if (clientRequestId === undefined) {
      return undefined;
    }

    if (typeof clientRequestId !== 'string') {
      throw new InvalidClientRequestIdError('clientRequestId must be a string when provided');
    }

    const trimmed = clientRequestId.trim();
    if (trimmed.length === 0) {
      throw new InvalidClientRequestIdError('clientRequestId must be a non-empty string after trimming whitespace');
    }

    if (trimmed.length > MAX_CLIENT_REQUEST_ID_LENGTH) {
      throw new InvalidClientRequestIdError(
        `clientRequestId must be at most ${MAX_CLIENT_REQUEST_ID_LENGTH} characters`,
      );
    }

    return trimmed;
  }

  private validatePositiveIntegerOption(name: 'defaultListLimit' | 'maxListLimit', value: number): number {
    if (!Number.isFinite(value) || !Number.isInteger(value)) {
      throw new InvalidPaginationValueError(`${name} must be a finite integer`);
    }

    if (value < 1) {
      throw new InvalidPaginationValueError(`${name} must be at least 1`);
    }

    return value;
  }

  private normalizeListLimit(value: number | undefined): number {
    if (value === undefined) {
      return this.defaultListLimit;
    }

    if (!Number.isFinite(value) || !Number.isInteger(value)) {
      throw new InvalidPaginationValueError('listMessages limit must be a finite integer');
    }

    return Math.min(Math.max(value, 1), this.maxListLimit);
  }

  private normalizeListSkip(value: number | undefined): number {
    if (value === undefined) {
      return 0;
    }

    if (!Number.isFinite(value) || !Number.isInteger(value)) {
      throw new InvalidPaginationValueError('listMessages skip must be a finite integer');
    }

    return Math.max(value, 0);
  }

  private buildClientRequestScope(clientRequestId: string, user: MessageUser, templateCd: string): ClientRequestScope {
    return {
      clientRequestId,
      clientRequestOwnerId: this.requireUserId(user),
      templateCd,
    };
  }

  private requireUserId(user: MessageUser | undefined): string {
    if (!user || user._id === undefined || user._id === null) {
      throw new InvalidMessageUserError();
    }

    if (typeof user._id === 'string') {
      const id = user._id.trim();
      if (id.length === 0) {
        throw new InvalidMessageUserError();
      }
      return id;
    }

    if (user._id instanceof mongoose.Types.ObjectId) {
      return String(user._id);
    }

    throw new InvalidMessageUserError();
  }

  private async findByClientRequestScope(scope: ClientRequestScope): Promise<IMessage[]> {
    const Message = this.resolveModel('active');
    const docs = await Message.find(scope).sort({ clientRequestItemIndex: 1, _id: 1 }).limit(Number.MAX_SAFE_INTEGER);
    return docs as unknown as IMessage[];
  }

  private async findCompletedClientRequestReplay(scope: ClientRequestScope): Promise<IMessage[] | null> {
    const reservation = await this.findClientRequestReservation(scope);
    const docs = await this.findByClientRequestScope(scope);

    if (!reservation) {
      if (docs.length > 0) {
        throw new ClientRequestInconsistentStateError(scope.clientRequestId, 'messages exist without a reservation');
      }
      return null;
    }

    if (reservation.state === 'failed') {
      throw new ClientRequestFailedError(scope.clientRequestId, reservation.failureMessage);
    }

    if (reservation.state !== 'completed') {
      return null;
    }

    if (reservation.itemCount === null || reservation.itemCount < 0 || !Number.isInteger(reservation.itemCount)) {
      throw new ClientRequestInconsistentStateError(
        scope.clientRequestId,
        'completed reservation has an invalid itemCount',
      );
    }

    if (reservation.itemCount === 0) {
      if (docs.length > 0) {
        throw new ClientRequestInconsistentStateError(
          scope.clientRequestId,
          'completed zero-item reservation has messages',
        );
      }
      return [];
    }

    const indexes = new Set(docs.map((doc) => doc.clientRequestItemIndex));
    const hasExpectedIndexes =
      docs.length === reservation.itemCount &&
      indexes.size === reservation.itemCount &&
      Array.from({ length: reservation.itemCount }, (_, index) => indexes.has(index)).every(Boolean);

    if (!hasExpectedIndexes) {
      throw new ClientRequestInconsistentStateError(
        scope.clientRequestId,
        `completed reservation expects item indexes 0..${reservation.itemCount - 1} but found ${JSON.stringify(
          Array.from(indexes),
        )}`,
      );
    }

    return docs;
  }

  private async acquireClientRequestStart(scope: ClientRequestScope): Promise<ClientRequestStart> {
    const deadline = Date.now() + this.clientRequestWaitMs;

    while (true) {
      const lease = await this.tryAcquireClientRequestLease(scope);
      if (lease) {
        return { kind: 'lease', lease };
      }

      const replay = await this.findCompletedClientRequestReplay(scope);
      if (replay !== null) {
        return { kind: 'replay', replay };
      }

      if (Date.now() >= deadline) {
        throw new ClientRequestPendingError(scope.clientRequestId);
      }

      await this.clientRequestDelay(Math.min(this.clientRequestPollMs, Math.max(deadline - Date.now(), 0)));
    }
  }

  private async tryAcquireClientRequestLease(scope: ClientRequestScope): Promise<ClientRequestLease | null> {
    const created = await this.tryCreateClientRequestReservation(scope);
    if (created) return created;

    return this.tryTakeOverStaleClientRequestReservation(scope);
  }

  private async tryCreateClientRequestReservation(scope: ClientRequestScope): Promise<ClientRequestLease | null> {
    const MessageRequest = this.resolveModel('request');
    const ownerId = randomUUID();

    try {
      await MessageRequest.create({
        ...scope,
        state: 'pending',
        itemCount: null,
        leaseOwnerId: ownerId,
        leaseExpiresAt: new Date(Date.now() + this.clientRequestLeaseMs),
      });
      return { ownerId };
    } catch (error) {
      if (this.isDuplicateKeyError(error)) {
        return null;
      }

      throw error;
    }
  }

  private async tryTakeOverStaleClientRequestReservation(
    scope: ClientRequestScope,
  ): Promise<ClientRequestLease | null> {
    const MessageRequest = this.resolveModel('request');
    const ownerId = randomUUID();
    const reservation = (await MessageRequest.findOneAndUpdate(
      { ...scope, state: 'pending', leaseExpiresAt: { $lte: new Date() } },
      {
        $set: {
          leaseOwnerId: ownerId,
          leaseExpiresAt: new Date(Date.now() + this.clientRequestLeaseMs),
        },
      },
      { returnDocument: 'after' },
    )) as MessageRequestRecord | null;

    return reservation ? { ownerId } : null;
  }

  private async findClientRequestReservation(scope: ClientRequestScope): Promise<MessageRequestRecord | null> {
    const MessageRequest = this.resolveModel('request');
    return (await MessageRequest.findOne(scope)) as MessageRequestRecord | null;
  }

  private async failClientRequestReservation(
    scope: ClientRequestScope,
    lease: ClientRequestLease,
    error: unknown,
  ): Promise<void> {
    const MessageRequest = this.resolveModel('request');
    await MessageRequest.updateOne(
      { ...scope, state: 'pending', leaseOwnerId: lease.ownerId },
      {
        $set: {
          state: 'failed',
          failedAt: new Date(),
          failureMessage: error instanceof Error ? error.message : String(error),
          leaseExpiresAt: null,
        },
      },
    );
  }

  private isDuplicateKeyError(error: unknown): error is { code: number } {
    return error instanceof Error && 'code' in error && error.code === DUPLICATE_KEY_ERROR_CODE;
  }

  private isTransactionSupportError(error: unknown): boolean {
    if (!(error instanceof Error)) return false;
    return (
      error.message.includes('Transaction numbers are only allowed') ||
      error.message.includes('Transaction is not supported') ||
      error.message.includes('transactions are not supported')
    );
  }

  private delay(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  private isArchivedMessage(message: IMessage | IMessageArchive): message is IMessageArchive {
    return 'archivedAt' in message;
  }

  private applyPopulate<TQuery>(
    query: TQuery,
    populate?: string | string[] | mongoose.PopulateOptions | mongoose.PopulateOptions[],
  ): TQuery {
    if (!populate) {
      return query;
    }

    const items = Array.isArray(populate) ? populate : [populate];
    let current = query as TQuery & { populate: (item: unknown) => TQuery };
    for (const item of items) {
      current = current.populate(item) as TQuery & { populate: (item: unknown) => TQuery };
    }
    return current;
  }

  private async findByIdWithOptions<TDocument>(
    model: mongoose.Model<unknown>,
    id: string,
    options: {
      populate?: string | string[] | mongoose.PopulateOptions | mongoose.PopulateOptions[];
      select?: string | Record<string, 0 | 1 | boolean>;
    },
  ): Promise<TDocument | null> {
    const baseQuery = model.findById(id);
    const selectedQuery = options.select === undefined ? baseQuery : baseQuery.select(options.select);
    const query = this.applyPopulate(selectedQuery, options.populate);
    return query as unknown as Promise<TDocument | null>;
  }
}
