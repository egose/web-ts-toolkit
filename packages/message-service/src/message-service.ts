import { isFunction, isString } from '@web-ts-toolkit/utils';
import type mongoose from 'mongoose';
import type { IMessage, IMessageArchive, MessageUser, UserId } from './types/message';
import type {
  MessageTemplate,
  SenderNotificationContent,
  UiTemplate,
  InterpolatedAction,
  ActionContext,
} from './types/template';
import type { PaymentProvider } from './providers/payment';
import { interpolateTemplate } from './template-engine';
import { TemplateRegistry, defaultRegistry } from './template-registry';
import { MESSAGE_MODEL_NAME, MESSAGE_ARCHIVE_MODEL_NAME } from './schemas/base';

// ---------------------------------------------------------------------------
// MessageService
// ---------------------------------------------------------------------------

export interface MessageServiceOptions {
  getModel: (name: string) => mongoose.Model<unknown>;
  paymentProvider?: PaymentProvider | null;
  adminRoles?: string[];
  registry?: TemplateRegistry;
}

export class MessageService {
  private getModel: (name: string) => mongoose.Model<unknown>;
  private paymentProvider: PaymentProvider | null;
  private adminRoles: string[];
  private registry: TemplateRegistry;

  constructor(options: MessageServiceOptions) {
    this.getModel = options.getModel;
    this.paymentProvider = options.paymentProvider ?? null;
    this.adminRoles = options.adminRoles ?? [];
    this.registry = options.registry ?? defaultRegistry;
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
  }): Promise<IMessage[]> {
    const { templateCd, user, roles = [], identity = {}, permissions = {}, payload = {}, payerUser, req } = params;

    const template = this.registry.find(templateCd);
    if (!template) {
      throw new Error(`template "${templateCd}" not found`);
    }

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

    const items = Array.isArray(messageData) ? messageData : [messageData];
    const results: IMessage[] = [];

    for (const m of items) {
      const type = m.type || template.type || 'notification';
      const paymentCd = m.paymentCd || template.paymentCd || '';
      const priceArgs = m.priceArgs || undefined;

      let paymentSession: string | null = null;
      if (paymentCd && this.paymentProvider) {
        paymentSession = await this.paymentProvider.createSession((payerUser || user)._id, paymentCd, priceArgs);
        if (!paymentSession) throw new Error('payment session creation failed');
      }

      const templateData = m.templateData || {};
      const interpolated = interpolateTemplate(template, templateData, 'receiver');

      let toRoles = m.toRoles;
      if (!m.toUser && !toRoles) {
        toRoles = this.adminRoles;
      }

      const msg = await this.addMessage({
        type,
        templateCd,
        fromUser: m.fromUser || user._id,
        toUser: m.toUser ?? null,
        toRoles,
        senderContent: interpolated?.senderContent,
        receiverContent: interpolated?.receiverContent,
        documents: (payload.documents as mongoose.Types.ObjectId[]) || [],
        paymentSession,
        paymentCd,
        payload: m.payload || payload,
        display: m.display,
      });
      results.push(msg);
    }

    return results;
  }

  // -------------------------------------------------------------------------
  // Create generic notification (no template)
  // -------------------------------------------------------------------------

  async createNotification(params: {
    toUser?: UserId | null;
    toRoles?: string[];
    receiverContent: { title: string; long: string; short?: string };
    documents?: mongoose.Types.ObjectId[];
  }): Promise<IMessage> {
    const Message = this.getModel(MESSAGE_MODEL_NAME);

    return Message.create({
      type: 'notification',
      templateCd: 'generic-notification',
      fromUser: null,
      toUser: params.toUser ?? null,
      toRoles: params.toRoles,
      receiverContent: params.receiverContent,
      documents: params.documents || [],
    }) as unknown as Promise<IMessage>;
  }

  // -------------------------------------------------------------------------
  // Get actions for a message
  // -------------------------------------------------------------------------

  async getActions(
    messageId: string,
    usertype: 'sender' | 'receiver',
    options: {
      permissions?: Record<string, boolean>;
      message?: IMessage | IMessageArchive;
      isAdmin?: boolean;
    } = {},
  ): Promise<{ uiTemplate: UiTemplate; actions: InterpolatedAction[] } | null> {
    const Message = this.getModel(MESSAGE_MODEL_NAME);
    const MessageArchive = this.getModel(MESSAGE_ARCHIVE_MODEL_NAME);

    let message = (await Message.findById(messageId)) as IMessage | null;
    if (!message) {
      message = (await MessageArchive.findById(messageId)) as IMessage | null;
    }
    if (!message) return null;

    const template = this.registry.find(message.templateCd);
    if (!template) return null;

    const interpolated = interpolateTemplate(template, { messageId }, usertype, {
      permissions: options.permissions,
      message: message as unknown as Record<string, unknown>,
    });

    if (!interpolated) return null;

    // Admin viewers get read-only (empty actions)
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
    const template = this.registry.find(templateCd);
    if (!template) {
      throw new Error(`template "${templateCd}" not found`);
    }

    const action = template.actions.find((a) => a.actionCd === actionCd);
    if (!action) {
      throw new Error(`action "${actionCd}" not found in template "${templateCd}"`);
    }

    // Role check
    let allowed = false;
    if (action.receiver && data.message.isReceiver(data.user)) allowed = true;
    if (!allowed && action.sender && data.message.isSender(data.user)) allowed = true;
    if (!allowed) throw new Error('not allowed');

    // Permission check (server-side enforcement)
    if (action.permission && !(data.permissions || {})[action.permission]) {
      throw new Error('not allowed');
    }

    // Condition check (server-side enforcement)
    if (action.condition && !action.condition(data.message as IMessage)) {
      throw new Error('not allowed');
    }

    const actionContext = {
      message: data.message as IMessage,
      user: data.user,
      getModel: this.getModel,
      expireSession: this.paymentProvider
        ? (sessionId: string) => this.paymentProvider!.expireSession(sessionId)
        : undefined,
      refundPayment: this.paymentProvider
        ? (sessionId: string) => this.paymentProvider!.refundPayment(sessionId)
        : undefined,
      req: data.req,
    };

    const result = await action.runHandler(actionContext);
    await data.message.archive(actionCd, data.user._id, this.registry);

    // Send sender notification if defined
    if (action.senderNotification) {
      let content: string | SenderNotificationContent;

      if (isFunction(action.senderNotification)) {
        content = await (
          action.senderNotification as (ctx: ActionContext) => Promise<string | SenderNotificationContent>
        )(actionContext);
      } else {
        content = action.senderNotification as string;
      }

      let senderNotificationContent: { title: string; long: string; short: string };
      let documents: mongoose.Types.ObjectId[] = [];

      if (isString(content)) {
        senderNotificationContent = {
          title: data.message.senderContent.title,
          long: content,
          short: content,
        };
      } else {
        senderNotificationContent = {
          title: content.title || data.message.senderContent.title,
          long: content.long,
          short: content.short || content.long,
        };
        documents = content.documents || [];
      }

      if (data.message.fromUser) {
        await this.createNotification({
          toUser: data.message.fromUser,
          receiverContent: senderNotificationContent,
          documents,
        });
      }
    }

    return result;
  }

  // -------------------------------------------------------------------------
  // Register templates (convenience)
  // -------------------------------------------------------------------------

  registerTemplate(template: MessageTemplate): void {
    this.registry.register(template);
  }

  registerTemplates(templates: MessageTemplate[]): void {
    this.registry.registerAll(templates);
  }

  // -------------------------------------------------------------------------
  // Private helpers
  // -------------------------------------------------------------------------

  private async addMessage(params: {
    type: string;
    templateCd: string;
    fromUser: UserId;
    toUser: UserId | null;
    toRoles?: string[];
    senderContent?: { title: string; long: string; short: string };
    receiverContent?: { title: string; long: string; short: string };
    documents: mongoose.Types.ObjectId[];
    paymentSession?: string | null;
    paymentCd: string;
    payload: Record<string, unknown>;
    display?: Record<string, unknown>;
  }): Promise<IMessage> {
    const {
      type,
      templateCd,
      fromUser,
      toUser,
      toRoles,
      senderContent,
      receiverContent,
      documents,
      paymentSession,
      paymentCd,
      payload,
      display,
    } = params;

    const Message = this.getModel(MESSAGE_MODEL_NAME);

    return Message.create({
      type,
      templateCd,
      fromUser,
      toUser,
      toRoles,
      documents,
      senderContent,
      receiverContent,
      paymentSession,
      paymentCd,
      payload,
      display,
    }) as unknown as Promise<IMessage>;
  }
}
