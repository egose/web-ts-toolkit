import { isString } from '@web-ts-toolkit/utils';
import { randomUUID } from 'node:crypto';
import mongoose from 'mongoose';
import type { IMessage, IMessageArchive, MessageUser, UserId } from './types/message';
import type {
  MessageTemplate,
  MessageAction,
  RegisteredMessageAction,
  RegisteredMessageTemplate,
  SenderNotificationContent,
  UiTemplate,
  InterpolatedAction,
  ActionContext,
  PrepareResult,
  Usertype,
} from './types/template';
import type { PaymentProvider } from './providers/payment';
import { interpolateMessageContent, interpolateTemplate, isActionAllowed, resolveUiTemplate } from './template-engine';
import { TemplateRegistry, defaultRegistry } from './template-registry';
import { MESSAGE_MODEL_NAME, MESSAGE_ARCHIVE_MODEL_NAME, MESSAGE_REQUEST_MODEL_NAME } from './schemas/base';
import {
  ActionConflictError,
  ActionNotAllowedError,
  ActionNotFoundError,
  ActionNotificationPendingError,
  ActionRetryableError,
  ActionTemplateMismatchError,
  ClientRequestFailedError,
  ClientRequestInconsistentStateError,
  ClientRequestPendingError,
  InvalidClientRequestIdError,
  InvalidMessageServiceOptionError,
  InvalidMessageUserError,
  InvalidPaginationValueError,
  MessageArchivedError,
  MessageModelResolutionError,
  MessageNotFoundError,
  PaymentSessionCompensationAggregateError,
  PaymentSessionCompensationError,
  TemplateNotFoundError,
} from './errors';
import type { MessageModelRole, PaymentSessionCompensationFailure } from './errors';
import { isDuplicateKeyError, runMessageTransaction } from './persistence';
import type { TransactionCapableActiveModel } from './persistence';

// Re-export the shared failure contract so `src/index.ts`, routes, and
// schema code keep importing every error from `./message-service` unchanged.
export {
  ActionConflictError,
  ActionNotAllowedError,
  ActionNotFoundError,
  ActionNotificationPendingError,
  ActionRetryableError,
  ActionTemplateMismatchError,
  ClientRequestFailedError,
  ClientRequestInconsistentStateError,
  ClientRequestPendingError,
  InvalidClientRequestIdError,
  InvalidMessageServiceOptionError,
  InvalidMessageUserError,
  InvalidPaginationValueError,
  MessageArchivedError,
  MessageModelResolutionError,
  MessageNotFoundError,
  MessageTransactionRequiredError,
  PaymentSessionCompensationAggregateError,
  PaymentSessionCompensationError,
  TemplateNotFoundError,
} from './errors';
export type { MessageModelRole, PaymentSessionCompensationFailure } from './errors';

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
   *
   * Must be a finite safe integer in `[1, 2147483647]` ms (positive lease).
   * The upper bound is Node's maximum `setTimeout` delay (`2^31 - 1`); larger
   * values would not fire on the intended cadence. Fractional, `NaN`,
   * infinite, negative, zero, or overflowing values throw
   * `InvalidMessageServiceOptionError` at construction.
   */
  clientRequestLeaseMs?: number;
  /**
   * Maximum time a duplicate idempotent create waits for completion or stale
   * lease takeover before raising `ClientRequestPendingError`. Defaults to 5000 ms.
   *
   * Must be a finite safe integer in `[0, 2147483647]` ms (nonnegative wait).
   * `0` is a supported immediate check: a duplicate that cannot acquire or
   * replay on its first attempt raises `ClientRequestPendingError` without
   * sleeping. The wait deadline bounds polling only — it never cancels a hung
   * database/provider operation. Out-of-range values throw
   * `InvalidMessageServiceOptionError` at construction.
   */
  clientRequestWaitMs?: number;
  /**
   * Poll interval while waiting for an idempotent create outcome. Defaults to 200 ms.
   *
   * Must be a finite safe integer in `[1, 2147483647]` ms (positive poll).
   * Out-of-range values throw `InvalidMessageServiceOptionError` at construction.
   */
  clientRequestPollMs?: number;
  /** Test hook for deterministic waiting; production uses `setTimeout`. */
  clientRequestDelay?: (ms: number) => Promise<void>;
  /**
   * Test hook for deterministic time. Defaults to `Date.now`.
   *
   * The same clock drives the duplicate-wait deadline and the persisted
   * `leaseExpiresAt` wall-clock timestamps (`new Date(now())`), so fake
   * clocks stay coherent in tests. The stale-takeover filter compares
   * `leaseExpiresAt` against this clock, not an independent `new Date()`.
   * Production uses real wall-clock time.
   */
  clientRequestNow?: () => number;
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
const CLIENT_REQUEST_LEASE_MS = 30_000;
const CLIENT_REQUEST_WAIT_MS = 5_000;
const CLIENT_REQUEST_POLL_MS = 200;
/**
 * Maximum platform timer delay (`2^31 - 1` ms, ~24.8 days). Node's
 * `setTimeout` clamps/overflows beyond this, so lease/wait/poll values above
 * it are rejected at construction rather than silently misfiring.
 */
export const MAX_MESSAGE_SERVICE_TIMEOUT_MS = 2_147_483_647;
const ACTION_LEASE_MS = 30_000;
const MAX_CLIENT_REQUEST_ID_LENGTH = 128;

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

type ClientRequestStart =
  | { kind: 'lease'; lease: ClientRequestLease }
  | { kind: 'replay'; replay: Array<IMessage | IMessageArchive> };

type MessageDocumentData = Record<string, unknown>;
type HydratedModelSource = { constructor: unknown };

const DEFAULT_MODEL_NAMES: MessageServiceModelNames = {
  active: MESSAGE_MODEL_NAME,
  archive: MESSAGE_ARCHIVE_MODEL_NAME,
  request: MESSAGE_REQUEST_MODEL_NAME,
  user: 'User',
};

interface ActionClaim {
  message: IMessage;
  actionAttemptId: string;
  actionOwnerToken: string;
}

/**
 * The `templateCd` used for generic notifications created via
 * `createNotification`. These messages have no actions, so
 * `getActions` returns an empty list for them.
 */
export const GENERIC_NOTIFICATION_TEMPLATE_CD = '__generic-notification__';

/**
 * Shared principal-validation contract for user-facing service entry points
 * and HTTP routes.
 *
 * A valid principal id is a non-empty string (after trimming) or a
 * `mongoose.Types.ObjectId` instance. Missing, null, empty/whitespace-only,
 * numeric, array, and plain-object ids are invalid. Valid string ids keep
 * their string type (trimmed); valid ObjectId instances are preserved as
 * ObjectId by callers and normalized to their hex string only where a string
 * scope/query key is required.
 *
 * `findMessage`/`findMessageOrThrow` and `createNotification` are trusted
 * host-level operations and intentionally do not take a principal; they are
 * not part of this contract.
 */
export function isValidMessageUserId(id: unknown): id is string | mongoose.Types.ObjectId {
  if (typeof id === 'string') {
    return id.trim().length > 0;
  }
  if (id instanceof mongoose.Types.ObjectId) {
    return true;
  }
  return false;
}

/**
 * Assert a user-facing principal and return its normalized string identity.
 * Throws `InvalidMessageUserError` for missing/null/empty/numeric/array/
 * plain-object ids. String ids are trimmed; ObjectId ids become their hex
 * string. The caller's original `MessageUser` object (and its `_id` type) is
 * left untouched so ObjectId-backed schemas keep their native type.
 */
export function requireMessageUserId(user: unknown): string {
  if (!user || typeof user !== 'object' || Array.isArray(user)) {
    throw new InvalidMessageUserError();
  }
  const id = (user as MessageUser)._id;
  if (!isValidMessageUserId(id)) {
    throw new InvalidMessageUserError();
  }
  return typeof id === 'string' ? id.trim() : String(id);
}

// Error definitions live in ./errors.ts (shared failure contract) and are
// re-exported above; persistence policy lives in ./persistence.ts.

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
  private clientRequestNow: () => number;
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
    this.clientRequestLeaseMs = this.validateDurationOption(
      'clientRequestLeaseMs',
      options.clientRequestLeaseMs ?? CLIENT_REQUEST_LEASE_MS,
      1,
    );
    this.clientRequestWaitMs = this.validateDurationOption(
      'clientRequestWaitMs',
      options.clientRequestWaitMs ?? CLIENT_REQUEST_WAIT_MS,
      0,
    );
    this.clientRequestPollMs = this.validateDurationOption(
      'clientRequestPollMs',
      options.clientRequestPollMs ?? CLIENT_REQUEST_POLL_MS,
      1,
    );
    this.clientRequestDelay = options.clientRequestDelay ?? this.delay;
    this.clientRequestNow = options.clientRequestNow ?? (() => Date.now());
    this.actionLeaseMs = ACTION_LEASE_MS;
  }

  // -------------------------------------------------------------------------
  // Message lookup
  // -------------------------------------------------------------------------

  /**
   * Find a message by id, falling back to the archive. Returns null if
   * the message does not exist in either collection.
   *
   * Trusted host-level operation: takes no principal and performs no
   * user-identity validation. Hosts must authorize the returned document
   * before exposing it to a user (see `getActions`/`handleAction`).
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

  /**
   * Same as `findMessage`, but throws `MessageNotFoundError` when neither the
   * active nor the archive collection holds the id.
   *
   * Trusted host-level operation: no principal validation. Hosts must
   * authorize before exposing the result to a user.
   */
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

  /**
   * Create messages from a trusted template as an authenticated user.
   *
   * User-facing entry point: `user` (and `payerUser` when provided) must
   * carry a valid principal id (non-empty string or ObjectId; numbers,
   * arrays, and plain objects are rejected with `InvalidMessageUserError`)
   * before any template, provider, or model effect runs. Both the
   * idempotent (`clientRequestId`) and direct branches enforce this.
   *
   * Idempotent replay contract (MSGF-06): a completed same-scope replay
   * returns the current active/archive records merged from both collections
   * (`Array<IMessage | IMessageArchive>`), sorted by exact
   * `clientRequestItemIndex`, without rerunning preparation/payment. Fresh
   * creates resolve active documents only. Archive entries are returned as
   * persisted `IMessageArchive` — never cast to `IMessage` and never given
   * fabricated active-only methods. Narrow with `'archivedAt' in doc`.
   * Archive retention bounds the replay window: deleted archive documents
   * surface as `ClientRequestInconsistentStateError`, not partial replays.
   */
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
  }): Promise<Array<IMessage | IMessageArchive>> {
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

    // Principal validation before any template/provider/model effect in both
    // branches. Valid string ids (trimmed) and ObjectId instances pass;
    // the original `_id` type is preserved downstream for storage.
    this.requireUserId(user);
    if (payerUser !== undefined) {
      this.requireUserId(payerUser);
    }

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
  }): Promise<Array<IMessage | IMessageArchive>> {
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
  }): Promise<Array<IMessage | IMessageArchive>> {
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
      try {
        for (let index = 0; index < items.length; index++) {
          docs.push(await this.buildMessageDocument(template, items[index], ctx, clientRequestScope, index));
        }
      } catch (error) {
        // A later item's provider/render failure must not strand sessions
        // created for earlier items. `buildMessageDocument` already attempts
        // its own session for the failing item; compensate every prior doc
        // here. If compensation itself fails its error (which preserves this
        // `error` as `originalError`) propagates instead.
        await this.compensatePaymentSessions(docs, error, clientRequestScope);
        throw error;
      }

      return this.persistPreparedBatchTransaction(clientRequestScope, clientRequestLease, docs);
    }

    const results: Array<IMessage | IMessageArchive> = [];
    for (let index = 0; index < items.length; index++) {
      const item = items[index];
      results.push(await this.persistItem(template, item, ctx, clientRequestScope, clientRequestScope ? index : null));
    }

    return results;
  }

  // -------------------------------------------------------------------------
  // Create generic notification (no template, no actions)
  // -------------------------------------------------------------------------

  /**
   * Create a generic notification without template preparation or actions.
   *
   * Trusted host-level operation: takes raw `UserId` values (string or
   * ObjectId, including null) and performs no principal validation. Hosts
   * own authentication/authorization for notification creation.
   */
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
   *
   * User-facing helper: validates `user` before building the filter.
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
   *
   * User-facing operation: validates `user` via the shared principal
   * contract. Returns `IMessage[]` ordered by `{ createdAt: -1, _id: -1 }`.
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
   *
   * User-facing operation: validates `user` via the shared principal contract.
   */
  async countMessages(user: MessageUser): Promise<number> {
    const Message = this.resolveModel('active');
    return Message.countDocuments(this.buildVisibilityFilter(user));
  }

  // -------------------------------------------------------------------------
  // Get actions for a message
  // -------------------------------------------------------------------------

  /**
   * Get available actions for a message as an authenticated user.
   *
   * User-facing operation: `options.user` is required and must carry a valid
   * principal id (non-empty string or ObjectId). It is validated before any
   * model lookup or template operation; invalid principals throw
   * `InvalidMessageUserError`.
   *
   * Returns `{ uiTemplate, actions }` for visible messages, or `null` when the
   * message is missing, the user has no sender/receiver relationship (unless
   * `isAdmin`), or the template is unknown. Admin (`isAdmin`) and archived
   * views return the resolved `uiTemplate` with an empty action list without
   * evaluating action `condition` predicates. Eligible active listings
   * evaluate conditions against the persisted message; action labels and
   * confirmations render from persisted `message.payload` (missing values
   * render empty), distinct from creation-time `templateData`.
   */
  async getActions(
    messageId: string,
    usertype: Usertype,
    options: {
      /** Authenticated caller; required. Validated before any effect. */
      user: MessageUser;
      permissions?: Record<string, boolean>;
      message?: IMessage | IMessageArchive;
      isAdmin?: boolean;
      populate?: string | string[] | mongoose.PopulateOptions | mongoose.PopulateOptions[];
    },
  ): Promise<{ uiTemplate: UiTemplate; actions: InterpolatedAction[] } | null> {
    const user = requireMessageUserId((options as { user?: unknown } | undefined)?.user);
    const authorizedUser = { ...(options as { user?: MessageUser }).user!, _id: user };
    const message =
      (options as { message?: IMessage | IMessageArchive; populate?: unknown }).message ??
      (await this.findMessage(messageId, {
        populate: (options as { populate?: string | string[] | mongoose.PopulateOptions | mongoose.PopulateOptions[] })
          .populate,
      }));
    if (!message) return null;

    if (!(options as { isAdmin?: boolean }).isAdmin) {
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

    // Read-only/admin/archive views must not invoke action `condition`
    // predicates merely to discard their results. Resolve the uiTemplate
    // without filtering actions.
    if (options.isAdmin || this.isArchivedMessage(message)) {
      return { uiTemplate: resolveUiTemplate(template.uiTemplate, usertype), actions: [] };
    }

    // Eligible active listings evaluate conditions against the persisted
    // message. Action labels/confirmations compile against persisted
    // `message.payload` (not creation-time `templateData`); missing values
    // render as empty strings.
    const data = (message.payload as Record<string, unknown> | undefined) ?? {};
    const interpolated = interpolateTemplate(template, data, usertype, {
      permissions: options.permissions,
      message: message as unknown as Record<string, unknown>,
    });

    return { uiTemplate: interpolated.uiTemplate, actions: interpolated.actions };
  }

  // -------------------------------------------------------------------------
  // Handle an action on a message
  // -------------------------------------------------------------------------

  /**
   * Execute an action with a durable claim, stable handler attempt key,
   * transactional archive, and post-commit sender notification status.
   *
   * User-facing operation: `data.user` is validated before any template or
   * model effect. Authorization and handler selection bind to the persisted
   * claim, not the caller-supplied `data.message` copy. Archived messages
   * apply a sender/receiver relationship gate before disclosing attempt IDs
   * or notification state. Returns the handler's value (`unknown`; templates
   * document their own shape).
   */
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
      // Relationship gate before disclosing archived outcomes: unrelated callers
      // receive a stable denial without attempt IDs or notification state.
      // Authorized (sender/receiver) retries remain available even when the
      // template has been removed.
      this.authorizeArchivedOutcome(data.message, authorizedUser);
      if (data.message.actionNotificationState === 'pending' || data.message.actionNotificationState === 'failed') {
        throw new ActionNotificationPendingError(
          String(data.message._id),
          data.message.actionAttemptId ?? '',
          undefined,
        );
      }
      throw new MessageArchivedError(String(data.message._id));
    }

    // Fast-fail pre-checks against the caller-supplied copy. These are not
    // authoritative: the persisted claim below is re-validated before any
    // template effect runs.
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
    // Authoritative authorization + handler/template selection bound to the
    // persisted document returned by the atomic claim. Covers changed
    // templateCd, recipient (toUser/fromUser), roles (toRoles), and
    // condition-relevant payload data. A denied claim is released via the
    // fenced retryable path so legitimate retries are not stranded.
    let authorizedAction: MessageAction;
    try {
      authorizedAction = this.authorizeClaimedAction(templateCd, actionCd, claim.message, authorizedUser, {
        permissions: data.permissions,
      });
    } catch (authError) {
      try {
        await this.markActionRetryable(
          claim.message._id,
          claim.actionAttemptId,
          claim.actionOwnerToken,
          authError,
          claim.message,
        );
      } catch (releaseError) {
        if (!(releaseError instanceof ActionConflictError)) {
          throw releaseError;
        }
        // Ownership lost between claim and release: another worker owns the
        // message now. Still report the denial for this caller.
      }
      throw authError;
    }
    const ctx = this.buildActionContext({
      ...data,
      user: authorizedUser,
      message: claim.message,
      actionAttemptId: claim.actionAttemptId,
    });
    let result: unknown;
    try {
      result = await authorizedAction.runHandler(ctx);
    } catch (error) {
      await this.markActionRetryable(
        data.message._id,
        claim.actionAttemptId,
        claim.actionOwnerToken,
        error,
        claim.message,
      );
      throw new ActionRetryableError(String(data.message._id), claim.actionAttemptId, error);
    }

    await this.archiveClaimedMessage(
      claim.message,
      authorizedAction,
      authorizedUser,
      claim.actionAttemptId,
      claim.actionOwnerToken,
    );

    if (authorizedAction.senderNotification) {
      try {
        await this.runSenderNotification(authorizedAction, ctx, claim.message);
        await this.markActionNotificationState(
          data.message._id,
          claim.actionAttemptId,
          claim.actionOwnerToken,
          'sent',
          undefined,
          claim.message,
        );
      } catch (error) {
        await this.markActionNotificationState(
          data.message._id,
          claim.actionAttemptId,
          claim.actionOwnerToken,
          'failed',
          error,
          claim.message,
        );
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
    template: MessageTemplate | RegisteredMessageTemplate,
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
    template: MessageTemplate | RegisteredMessageTemplate,
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

      // Content-only rendering: never evaluate action `condition` predicates
      // during creation. Content compiles from `PrepareResult.templateData`;
      // action labels/confirmations later compile from persisted
      // `message.payload` at listing time (see `getActions`).
      const interpolated = interpolateMessageContent(template, m.templateData || {});

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
  ): Promise<Array<IMessage | IMessageArchive>> {
    // Every failure before the transaction commits leaves all `docs` sessions
    // uncommitted, including model-resolution and `startSession()` failures
    // that occur before any write. Compensate them all; never compensate
    // after `withTransaction` resolves (committed sessions are retained even
    // if later `endSession()` housekeeping throws). Ambiguous provider/commit
    // outcomes that this process cannot observe must be reconciled with the
    // provider out of band; see the payment docs.
    let Message: TransactionCapableActiveModel;
    let MessageRequest: mongoose.Model<unknown>;
    try {
      Message = this.resolveModel('active') as TransactionCapableActiveModel;
      MessageRequest = this.resolveModel('request', undefined, Message);
    } catch (error) {
      await this.compensatePaymentSessions(docs, error, scope);
      throw error;
    }

    const operation = async (session: mongoose.ClientSession): Promise<Array<IMessage | IMessageArchive>> => {
      const created = docs.length > 0 ? await Message.create(docs, { session, ordered: true }) : [];
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
        { session },
      )) as { matchedCount?: number; modifiedCount?: number; n?: number };

      if ((result.matchedCount ?? result.n ?? 0) !== 1) {
        throw new ClientRequestPendingError(scope.clientRequestId);
      }

      return created as unknown as Array<IMessage | IMessageArchive>;
    };

    // Atomic batch commit always runs inside a transaction started on the
    // owning connection. `runMessageTransaction` fails closed with
    // `MessageTransactionRequiredError` when the model has no session
    // capability — there is no sessionless fallback.
    try {
      return await runMessageTransaction(Message, operation);
    } catch (error) {
      await this.compensatePaymentSessions(docs, error, scope);
      throw error;
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

    if (sessionIds.length === 0) return;
    if (!this.expirePaymentSession) return;

    // Attempt every session even when an earlier expiration or observer hook
    // fails. Collect all failures and preserve the triggering error as
    // `originalError`. A single session keeps the legacy single-session error
    // shape; multi-session batches throw an aggregate carrying every failure.
    const failures: PaymentSessionCompensationFailure[] = [];
    let firstSingleError: PaymentSessionCompensationError | undefined;
    for (const sessionId of sessionIds) {
      try {
        await this.compensatePaymentSession(sessionId, originalError, scope);
      } catch (error) {
        if (error instanceof PaymentSessionCompensationError) {
          if (!firstSingleError) firstSingleError = error;
          failures.push({
            sessionId: error.sessionId,
            compensationError: error.compensationError,
            hookError: error.hookError,
          });
        } else {
          failures.push({ sessionId, compensationError: error });
        }
      }
    }

    if (failures.length === 0) return;
    if (sessionIds.length === 1 && firstSingleError) {
      throw firstSingleError;
    }
    throw new PaymentSessionCompensationAggregateError(failures, originalError);
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
    const firstOwnerToken = randomUUID();
    const firstClaim = (await Message.findOneAndUpdate(
      { _id: messageId, $or: [{ actionState: 'active' }, { actionState: null }, { actionState: { $exists: false } }] },
      {
        $set: {
          ...claimBase,
          actionState: 'processing',
          actionAttemptId: firstAttemptId,
          actionOwnerToken: firstOwnerToken,
        },
      },
      { returnDocument: 'after' },
    )) as IMessage | null;
    if (firstClaim?.actionAttemptId && firstClaim?.actionOwnerToken) {
      return {
        message: firstClaim,
        actionAttemptId: firstClaim.actionAttemptId,
        actionOwnerToken: firstClaim.actionOwnerToken,
      };
    }

    const nextOwnerToken = randomUUID();
    const retryClaim = (await Message.findOneAndUpdate(
      {
        _id: messageId,
        actionCd,
        actionAttemptId: { $type: 'string' },
        $or: [{ actionState: 'retryable' }, { actionState: 'processing', actionLeaseExpiresAt: { $lte: now } }],
      },
      { $set: { ...claimBase, actionState: 'processing', actionOwnerToken: nextOwnerToken } },
      { returnDocument: 'after' },
    )) as IMessage | null;
    if (retryClaim?.actionAttemptId && retryClaim?.actionOwnerToken) {
      return {
        message: retryClaim,
        actionAttemptId: retryClaim.actionAttemptId,
        actionOwnerToken: retryClaim.actionOwnerToken,
      };
    }

    const archived = (await this.resolveModel('archive', message, Message).findById(
      messageId,
    )) as IMessageArchive | null;
    if (archived) {
      // Same relationship gate as the direct archived path: do not disclose
      // attempt IDs or notification state to unrelated callers.
      this.authorizeArchivedOutcome(archived, user);
      if (archived.actionNotificationState === 'pending' || archived.actionNotificationState === 'failed') {
        throw new ActionNotificationPendingError(String(messageId), archived.actionAttemptId ?? '', undefined);
      }
      throw new MessageArchivedError(String(messageId));
    }

    throw new ActionConflictError(String(messageId));
  }

  /**
   * Relationship/permission policy for archived outcomes.
   *
   * Only the recorded sender or receiver may observe whether an archived
   * message is pending notification or terminally archived. This keeps
   * authorized retries (including pending-notification retries) available even
   * when the template has been unregistered, while unrelated callers receive a
   * stable `ActionNotAllowedError` without attempt IDs or notification state.
   */
  private authorizeArchivedOutcome(message: IMessageArchive, user: MessageUser): void {
    if (!message.isSender(user) && !message.isReceiver(user)) {
      throw new ActionNotAllowedError();
    }
  }

  /**
   * Authoritative post-claim authorization bound to the persisted document
   * returned by the atomic claim. Re-validates the requested template/action
   * selection and the sender/receiver, permission, and condition checks
   * against persisted `templateCd`, parties, roles, and payload data.
   *
   * Supported update protocol: the guarantee covers the document state as of
   * the atomic claim (`findOneAndUpdate` returning the persisted document).
   * Host writes that commit before the claim are observed; host writes that
   * commit after the claim (during handler execution) are not prevented. Hosts
   * must not mutate action-relevant fields (`templateCd`, `toUser`/`toRoles`/
   * `fromUser`, condition payload) concurrently with in-flight actions outside
   * a coordinated protocol. A fresh-document read alone is not a substitute
   * for this claim-bound check.
   */
  private authorizeClaimedAction(
    templateCd: string,
    actionCd: string,
    claimed: IMessage,
    user: MessageUser,
    options: { permissions?: Record<string, boolean> } = {},
  ): MessageAction | RegisteredMessageAction {
    if (templateCd !== claimed.templateCd) {
      throw new ActionTemplateMismatchError(claimed.templateCd, templateCd);
    }
    const template = this.registry.find(claimed.templateCd);
    if (!template) throw new TemplateNotFoundError(claimed.templateCd);
    const action = template.actions.find((a) => a.actionCd === actionCd);
    if (!action) throw new ActionNotFoundError(claimed.templateCd, actionCd);
    if (!isActionAllowed(action, user, claimed, { permissions: options.permissions })) {
      throw new ActionNotAllowedError();
    }
    return action;
  }

  private async markActionRetryable(
    messageId: unknown,
    actionAttemptId: string,
    actionOwnerToken: string,
    error: unknown,
    sourceDocument?: HydratedModelSource | null,
  ): Promise<void> {
    const Message = this.resolveModel('active', sourceDocument);
    const updated = (await Message.updateOne(
      { _id: messageId, actionState: 'processing', actionAttemptId, actionOwnerToken },
      {
        $set: {
          actionState: 'retryable',
          actionFailureMessage: error instanceof Error ? error.message : String(error),
          actionLeaseExpiresAt: null,
        },
      },
    )) as { matchedCount?: number; n?: number };
    if ((updated.matchedCount ?? updated.n ?? 0) !== 1) {
      throw new ActionConflictError(String(messageId));
    }
  }

  private async archiveClaimedMessage(
    message: IMessage,
    action: MessageAction,
    user: MessageUser,
    actionAttemptId: string,
    actionOwnerToken: string,
  ): Promise<void> {
    const Message = this.resolveModel('active', message) as TransactionCapableActiveModel;
    const MessageArchive = this.resolveModel('archive', message, Message) as mongoose.Model<Record<string, unknown>>;
    const messageId = message._id;
    const data = message.toObject() as unknown as Record<string, unknown>;
    const notificationState = action.senderNotification ? 'pending' : 'none';
    delete data.actionState;
    delete data.actionClaimedBy;
    delete data.actionClaimedAt;
    delete data.actionLeaseExpiresAt;
    delete data.actionFailureMessage;
    delete data.actionOwnerToken;

    const ownershipFilter = {
      _id: messageId,
      actionState: 'processing',
      actionAttemptId,
      actionOwnerToken,
    };
    const ownership = (await (
      Message as unknown as {
        findOne: (filter: Record<string, unknown>) => Promise<{ _id?: unknown } | null>;
      }
    ).findOne(ownershipFilter)) as { _id?: unknown } | null;
    if (!ownership) {
      throw new ActionConflictError(String(messageId));
    }

    const operation = async (session: mongoose.ClientSession) => {
      try {
        await MessageArchive.create(
          [
            {
              ...data,
              actionCd: action.actionCd,
              archivedBy: user._id,
              archivedAt: new Date(),
              actionAttemptId,
              actionOwnerToken,
              actionNotificationState: notificationState,
              actionNotificationError: null,
              actionNotificationAttemptedAt: null,
            },
          ],
          { session, ordered: true },
        );
      } catch (error) {
        if (isDuplicateKeyError(error)) {
          throw new ActionConflictError(String(messageId));
        }
        throw error;
      }
      const deleted = (await Message.deleteOne(
        { _id: messageId, actionState: 'processing', actionAttemptId, actionOwnerToken },
        { session },
      )) as { deletedCount?: number; n?: number };
      // Inside the transaction an aborted commit leaves no orphan archive,
      // so a zero delete is purely a lost-ownership conflict.
      if ((deleted.deletedCount ?? deleted.n ?? 0) !== 1) {
        throw new ActionConflictError(String(messageId));
      }
    };

    // Archive movement is documented as atomic: it always runs inside a
    // transaction on the owning connection. Missing session capability fails
    // closed — there is no sessionless fallback.
    try {
      await runMessageTransaction(Message, operation);
    } catch (error) {
      await this.markActionRetryable(messageId, actionAttemptId, actionOwnerToken, error, message);
      throw error;
    }
  }

  private async markActionNotificationState(
    messageId: unknown,
    actionAttemptId: string,
    actionOwnerToken: string,
    state: 'sent' | 'failed',
    error?: unknown,
    sourceDocument?: HydratedModelSource | null,
  ): Promise<void> {
    const MessageArchive = this.resolveModel('archive', sourceDocument);
    const updated = (await MessageArchive.updateOne(
      { _id: messageId, actionAttemptId, actionOwnerToken },
      {
        $set: {
          actionNotificationState: state,
          actionNotificationError: state === 'failed' ? (error instanceof Error ? error.message : String(error)) : null,
          actionNotificationAttemptedAt: new Date(),
        },
      },
    )) as { matchedCount?: number; n?: number };
    if ((updated.matchedCount ?? updated.n ?? 0) !== 1) {
      throw new ActionConflictError(String(messageId));
    }
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

  private validateDurationOption(
    name: 'clientRequestLeaseMs' | 'clientRequestWaitMs' | 'clientRequestPollMs',
    value: number,
    min: number,
  ): number {
    if (typeof value !== 'number' || !Number.isFinite(value) || !Number.isInteger(value)) {
      throw new InvalidMessageServiceOptionError(
        `${name} must be a finite safe integer in [${min}, ${MAX_MESSAGE_SERVICE_TIMEOUT_MS}] ms`,
      );
    }

    if (value < min || value > MAX_MESSAGE_SERVICE_TIMEOUT_MS) {
      throw new InvalidMessageServiceOptionError(
        `${name} must be a finite safe integer in [${min}, ${MAX_MESSAGE_SERVICE_TIMEOUT_MS}] ms`,
      );
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
    return requireMessageUserId(user);
  }

  private async findByClientRequestScope(scope: ClientRequestScope): Promise<IMessage[]> {
    const Message = this.resolveModel('active');
    const docs = await Message.find(scope).sort({ clientRequestItemIndex: 1, _id: 1 }).limit(Number.MAX_SAFE_INTEGER);
    return docs as unknown as IMessage[];
  }

  private async findArchivedByClientRequestScope(scope: ClientRequestScope): Promise<IMessageArchive[]> {
    const MessageArchive = this.resolveModel('archive');
    const docs = await MessageArchive.find(scope)
      .sort({ clientRequestItemIndex: 1, _id: 1 })
      .limit(Number.MAX_SAFE_INTEGER);
    return docs as unknown as IMessageArchive[];
  }

  /**
   * Merge one active snapshot and one archive snapshot for a completed scope.
   *
   * Archival moves a document with create-then-delete ordering, so with an
   * active-then-archive read order a moving item is always visible in at least
   * one snapshot (no miss). A commit landing between the two reads surfaces
   * the same `_id` in both snapshots; deduplicating by `_id` string keeps the
   * active copy and prevents double-counting. Returns the merged batch sorted
   * by exact `clientRequestItemIndex`, or `null` when the merged set does not
   * satisfy the exact distinct-index contract.
   */
  private mergeReplayBatch(
    active: Array<IMessage | IMessageArchive>,
    archived: Array<IMessage | IMessageArchive>,
    itemCount: number,
  ): Array<IMessage | IMessageArchive> | null {
    const byId = new Map<string, IMessage | IMessageArchive>();
    for (const doc of [...active, ...archived]) {
      const key = String((doc as unknown as { _id: unknown })._id);
      if (!byId.has(key)) {
        byId.set(key, doc);
      }
    }
    const docs = [...byId.values()];
    const indexes = new Set(docs.map((doc) => doc.clientRequestItemIndex));
    const hasExpectedIndexes =
      docs.length === itemCount &&
      indexes.size === itemCount &&
      Array.from({ length: itemCount }, (_, index) => indexes.has(index)).every(Boolean);
    if (!hasExpectedIndexes) {
      return null;
    }
    return docs.sort((a, b) => {
      const indexA = a.clientRequestItemIndex ?? 0;
      const indexB = b.clientRequestItemIndex ?? 0;
      if (indexA !== indexB) return indexA - indexB;
      return String((a as unknown as { _id: unknown })._id).localeCompare(
        String((b as unknown as { _id: unknown })._id),
      );
    });
  }

  private async buildCompletedReplay(
    reservation: MessageRequestRecord,
    scope: ClientRequestScope,
    cachedActive?: Array<IMessage | IMessageArchive>,
    cachedArchived?: Array<IMessageArchive>,
  ): Promise<Array<IMessage | IMessageArchive>> {
    if (reservation.itemCount === null || reservation.itemCount < 0 || !Number.isInteger(reservation.itemCount)) {
      throw new ClientRequestInconsistentStateError(
        scope.clientRequestId,
        'completed reservation has an invalid itemCount',
      );
    }

    if (reservation.itemCount === 0) {
      const active = cachedActive ?? (await this.findByClientRequestScope(scope));
      const archived = cachedArchived ?? (await this.findArchivedByClientRequestScope(scope));
      if (active.length > 0 || archived.length > 0) {
        throw new ClientRequestInconsistentStateError(
          scope.clientRequestId,
          'completed zero-item reservation has messages',
        );
      }
      return [];
    }

    const itemCount = reservation.itemCount;
    let active: Array<IMessage | IMessageArchive> = cachedActive ?? (await this.findByClientRequestScope(scope));
    let archived: Array<IMessage | IMessageArchive> =
      cachedArchived ?? (await this.findArchivedByClientRequestScope(scope));
    const merged = this.mergeReplayBatch(active, archived, itemCount);
    if (merged) {
      return merged;
    }

    // A concurrent archive commit or reservation completion may have landed
    // between the two collection reads. One bounded reconciliation re-read of
    // both collections absorbs that transit before declaring true corruption.
    active = await this.findByClientRequestScope(scope);
    archived = await this.findArchivedByClientRequestScope(scope);
    const reconciled = this.mergeReplayBatch(active, archived, itemCount);
    if (reconciled) {
      return reconciled;
    }

    const indexes = new Set([...active, ...archived].map((doc) => doc.clientRequestItemIndex));
    throw new ClientRequestInconsistentStateError(
      scope.clientRequestId,
      `completed reservation expects item indexes 0..${itemCount - 1} but found ${JSON.stringify(Array.from(indexes))}`,
    );
  }

  private async findCompletedClientRequestReplay(
    scope: ClientRequestScope,
  ): Promise<Array<IMessage | IMessageArchive> | null> {
    const reservation = await this.findClientRequestReservation(scope);

    if (!reservation) {
      // A winning caller may commit its reservation between this read and the
      // message reads below. Re-read the reservation before declaring
      // "messages exist without a reservation" so that race cannot
      // false-corrupt; only a stable second miss with visible messages throws.
      const active = await this.findByClientRequestScope(scope);
      const archived = await this.findArchivedByClientRequestScope(scope);
      if (active.length === 0 && archived.length === 0) {
        return null;
      }
      const reread = await this.findClientRequestReservation(scope);
      if (!reread) {
        throw new ClientRequestInconsistentStateError(scope.clientRequestId, 'messages exist without a reservation');
      }
      if (reread.state === 'failed') {
        throw new ClientRequestFailedError(scope.clientRequestId, reread.failureMessage);
      }
      if (reread.state !== 'completed') {
        return null;
      }
      return this.buildCompletedReplay(reread, scope, active, archived);
    }

    if (reservation.state === 'failed') {
      throw new ClientRequestFailedError(scope.clientRequestId, reservation.failureMessage);
    }

    if (reservation.state !== 'completed') {
      return null;
    }

    return this.buildCompletedReplay(reservation, scope);
  }

  private async acquireClientRequestStart(scope: ClientRequestScope): Promise<ClientRequestStart> {
    // Elapsed-time wait driven by the injected clock. The deadline bounds how
    // long a duplicate polls for completion/takeover; it never cancels a hung
    // database/provider operation — each `await` below still resolves on its
    // own, the deadline only decides whether to poll again or throw pending.
    const deadline = this.clientRequestNow() + this.clientRequestWaitMs;

    while (true) {
      const lease = await this.tryAcquireClientRequestLease(scope);
      if (lease) {
        return { kind: 'lease', lease };
      }

      const replay = await this.findCompletedClientRequestReplay(scope);
      if (replay !== null) {
        return { kind: 'replay', replay };
      }

      if (this.clientRequestNow() >= deadline) {
        throw new ClientRequestPendingError(scope.clientRequestId);
      }

      await this.clientRequestDelay(
        Math.min(this.clientRequestPollMs, Math.max(deadline - this.clientRequestNow(), 0)),
      );
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
        leaseExpiresAt: new Date(this.clientRequestNow() + this.clientRequestLeaseMs),
      });
      return { ownerId };
    } catch (error) {
      if (isDuplicateKeyError(error)) {
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
      { ...scope, state: 'pending', leaseExpiresAt: { $lte: new Date(this.clientRequestNow()) } },
      {
        $set: {
          leaseOwnerId: ownerId,
          leaseExpiresAt: new Date(this.clientRequestNow() + this.clientRequestLeaseMs),
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
