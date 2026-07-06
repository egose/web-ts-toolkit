import { isString } from '@web-ts-toolkit/utils';
import type mongoose from 'mongoose';
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
import { MESSAGE_MODEL_NAME, MESSAGE_ARCHIVE_MODEL_NAME } from './schemas/base';

// ---------------------------------------------------------------------------
// Configuration
// ---------------------------------------------------------------------------

export interface MessageServiceOptions {
  getModel: (name: string) => mongoose.Model<unknown>;
  paymentProvider?: PaymentProvider | null;
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
}

const DEFAULT_LIST_LIMIT = 50;
const MAX_LIST_LIMIT = 100;

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
  constructor(messageId: string) {
    super(`message "${messageId}" not found`);
    this.name = 'MessageNotFoundError';
  }
}

export class MessageArchivedError extends Error {
  constructor(messageId: string) {
    super(`message "${messageId}" is archived`);
    this.name = 'MessageArchivedError';
  }
}

export class TemplateNotFoundError extends Error {
  constructor(templateCd: string) {
    super(`template "${templateCd}" not found`);
    this.name = 'TemplateNotFoundError';
  }
}

export class ActionNotFoundError extends Error {
  constructor(templateCd: string, actionCd: string) {
    super(`action "${actionCd}" not found in template "${templateCd}"`);
    this.name = 'ActionNotFoundError';
  }
}

export class ActionNotAllowedError extends Error {
  constructor() {
    super('not allowed');
    this.name = 'ActionNotAllowedError';
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
  private getModel: (name: string) => mongoose.Model<unknown>;
  private paymentProvider: PaymentProvider | null;
  private expirePaymentSession?: (sessionId: string) => Promise<void>;
  private refundPaymentSession?: (sessionId: string) => Promise<void>;
  private adminRoles: string[];
  private registry: TemplateRegistry;
  private defaultListLimit: number;
  private maxListLimit: number;

  constructor(options: MessageServiceOptions) {
    this.getModel = options.getModel;
    this.paymentProvider = options.paymentProvider ?? null;
    this.expirePaymentSession = this.paymentProvider?.expireSession.bind(this.paymentProvider);
    this.refundPaymentSession = this.paymentProvider?.refundPayment.bind(this.paymentProvider);
    this.adminRoles = options.adminRoles ?? [];
    this.registry = options.registry ?? defaultRegistry;
    this.defaultListLimit = options.defaultListLimit ?? DEFAULT_LIST_LIMIT;
    this.maxListLimit = options.maxListLimit ?? MAX_LIST_LIMIT;
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
    const Message = this.getModel(MESSAGE_MODEL_NAME);
    const MessageArchive = this.getModel(MESSAGE_ARCHIVE_MODEL_NAME);
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
     * Optional client-supplied request id. If a message with this
     * `clientRequestId` already exists, that message is returned instead
     * of creating a duplicate. Useful for double-submit protection.
     */
    clientRequestId?: string;
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

    if (clientRequestId) {
      const existing = await this.findByClientRequestId(clientRequestId);
      if (existing) return existing;
    }

    const template = this.registry.find(templateCd);
    if (!template) throw new TemplateNotFoundError(templateCd);

    const messageData = await template.prepareMessage({
      user,
      roles,
      identity,
      permissions,
      payload,
      getModel: this.getModel,
      req,
    });

    if (!messageData) return [];

    const ctx: CreateContext = { user, roles, identity, permissions, payload, payerUser, req };
    const items = Array.isArray(messageData) ? messageData : [messageData];
    const results: IMessage[] = [];
    for (const m of items) {
      results.push(await this.persistItem(template, m, ctx, clientRequestId));
    }
    return results;
  }

  // -------------------------------------------------------------------------
  // Create generic notification (no template, no actions)
  // -------------------------------------------------------------------------

  async createNotification(params: {
    fromUser?: UserId | null;
    toUser?: UserId | null;
    toRoles?: string[];
    receiverContent: { title: string; long: string; short?: string };
    senderContent?: { title: string; long: string; short?: string };
    documents?: mongoose.Types.ObjectId[];
  }): Promise<IMessage> {
    const Message = this.getModel(MESSAGE_MODEL_NAME);
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
    const userId = user.id || String(user._id);
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
    const limit = Math.min(Math.max(rawLimit ?? this.defaultListLimit, 1), this.maxListLimit);
    const skip = Math.max(rawSkip ?? 0, 0);

    const Message = this.getModel(MESSAGE_MODEL_NAME);
    const query = this.applyPopulate(
      Message.find(this.buildVisibilityFilter(user)).sort({ createdAt: -1 }).skip(skip).limit(limit),
      populate,
    );

    return query as unknown as Promise<IMessage[]>;
  }

  /**
   * Count active (non-archived) messages visible to a user.
   * Useful for badge indicators ("3 new messages").
   */
  async countMessages(user: MessageUser): Promise<number> {
    const Message = this.getModel(MESSAGE_MODEL_NAME);
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

    if (!options.isAdmin && options.user) {
      const isAllowedUsertype =
        usertype === 'sender' ? message.isSender(options.user) : message.isReceiver(options.user);
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

    if (options.isAdmin) {
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
    if (this.isArchivedMessage(data.message)) {
      throw new MessageArchivedError(String(data.message._id));
    }

    const template = this.registry.find(templateCd);
    if (!template) throw new TemplateNotFoundError(templateCd);

    const action = template.actions.find((a) => a.actionCd === actionCd);
    if (!action) throw new ActionNotFoundError(templateCd, actionCd);

    if (!isActionAllowed(action, data.user, data.message, { permissions: data.permissions })) {
      throw new ActionNotAllowedError();
    }

    const ctx = this.buildActionContext(data);
    const result = await action.runHandler(ctx);
    await data.message.archive(actionCd, data.user._id, this.registry);
    await this.runSenderNotification(action, ctx, data.message);
    return result;
  }

  // -------------------------------------------------------------------------
  // Private helpers
  // -------------------------------------------------------------------------

  private async persistItem(
    template: MessageTemplate,
    m: PrepareResult,
    ctx: CreateContext,
    clientRequestId: string | undefined,
  ): Promise<IMessage> {
    const toUser = m.toUser ?? null;
    const toRoles = (m.toRoles && m.toRoles.length > 0 ? m.toRoles : this.adminRoles).slice();
    const type = m.type || template.type || 'notification';
    const paymentCd = m.paymentCd || template.paymentCd || '';

    let paymentSession: string | null = null;
    if (paymentCd && this.paymentProvider && (toUser || toRoles.length > 0)) {
      paymentSession = await this.paymentProvider.createSession(
        (ctx.payerUser || ctx.user)._id,
        paymentCd,
        m.priceArgs,
      );
      if (!paymentSession) throw new Error('payment session creation failed');
    }

    const interpolated = interpolateTemplate(template, m.templateData || {}, 'receiver');

    const Message = this.getModel(MESSAGE_MODEL_NAME);
    return Message.create({
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
      clientRequestId: clientRequestId ?? null,
    }) as unknown as Promise<IMessage>;
  }

  private buildActionContext(data: {
    message: IMessage | IMessageArchive;
    user: MessageUser;
    req?: unknown;
  }): ActionContext {
    return {
      message: data.message,
      user: data.user,
      getModel: this.getModel,
      expireSession: this.expirePaymentSession,
      refundPayment: this.refundPaymentSession,
      req: data.req,
    };
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
      await this.createNotification({
        toUser: message.fromUser,
        receiverContent: senderNotificationContent,
        documents,
      });
    }
  }

  private async findByClientRequestId(clientRequestId: string): Promise<IMessage[] | null> {
    const Message = this.getModel(MESSAGE_MODEL_NAME);
    const docs = await Message.find({ clientRequestId }).sort({ createdAt: 1, _id: 1 }).limit(Number.MAX_SAFE_INTEGER);
    return docs.length > 0 ? (docs as unknown as IMessage[]) : null;
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
