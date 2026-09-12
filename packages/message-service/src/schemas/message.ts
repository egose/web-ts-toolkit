import mongoose from 'mongoose';
import { BaseMessageFields, MESSAGE_ARCHIVE_MODEL_NAME } from './base';
import type { IBaseMessage, IMessageMethods, UserId } from '../types/message';
import type { TemplateRegistry } from '../template-registry';
import { includesAction } from '../template-registry';
import { isSender, isReceiver } from './methods';
import {
  ActionConflictError,
  ActionNotFoundError,
  InvalidMessageUserError,
  MessageArchivedError,
  MessageNotFoundError,
  MessageTransactionRequiredError,
  TemplateNotFoundError,
  isValidMessageUserId,
} from '../message-service';

// ---------------------------------------------------------------------------
// Email notification hook
// ---------------------------------------------------------------------------

export type EmailNotifier = (email: string, title: string, message: string) => Promise<void> | void;

export type EmailDeliveryFailureStage = 'recipientLookup' | 'notifier';

export interface EmailDeliveryFailureEvent {
  stage: EmailDeliveryFailureStage;
  error: unknown;
  messageId: unknown;
  recipientId: UserId;
  title: string;
}

export interface MessageSchemaConfig {
  /**
   * Called for newly created, non-transactional messages (unless excluded) to
   * send a best-effort email notification to the recipient. Pass `null` (the
   * default) to disable.
   *
   * When `null`, no save hooks are registered at all. When set, the schema
   * registers a pre-save state capture plus a connection-local post-save
   * hook: the post-save hook resolves user/archive models on the hydrated
   * document's owning connection and skips session-bound writes (Mongoose
   * save hooks run before the surrounding transaction commits).
   */
  emailNotifier?: EmailNotifier | null;

  /**
   * Called when recipient lookup or notifier delivery fails. The message save
   * has already succeeded and is not rolled back. If this hook throws, that
   * secondary failure is swallowed to preserve the best-effort delivery
   * contract.
   */
  onEmailDeliveryFailure?: (event: EmailDeliveryFailureEvent) => void | Promise<void>;

  /**
   * Message titles that should NOT trigger email notifications. Exclusions and
   * rendered titles are compared with the same trim + lowercase normalization
   * against the compiled title — i.e. the interpolated result.
   */
  emailNotificationExclusions?: string[];

  /**
   * Name of the Mongoose model that holds the recipient user records.
   * Defaults to `'User'`. The post-save email hook resolves it on the
   * message document's owning connection
   * (`document.constructor.db.model(name)`) to look up the recipient's email
   * address, so connection-local apps must register the user model on the
   * same connection as the message models.
   *
   * The model MUST be registered before the first save when `emailNotifier`
   * is set — `buildMessageSchema` checks this eagerly to fail fast (pass
   * `connection` when configuring connection-local schemas).
   */
  userModelName?: string;

  /**
   * Connection used for eager model-registration checks when configuring
   * connection-local schemas. Runtime document methods and hooks still use the
   * hydrated document's own connection.
   */
  connection?: mongoose.Connection;

  /**
   * Name of the Mongoose model used for archived messages.
   * Defaults to `'MessageArchive'`. Used by the `archive()` instance method.
   */
  archiveModelName?: string;
}

// ---------------------------------------------------------------------------
// archive() method
// ---------------------------------------------------------------------------

interface ArchiveContext {
  archiveModelName: string;
}

type MessageModel = mongoose.Model<IBaseMessage, object, IMessageMethods>;
type MessageHydratedDocument = mongoose.HydratedDocument<IBaseMessage, IMessageMethods>;

function resolveDocumentModel(
  document: { constructor: unknown },
  modelName: string,
  role: string,
): mongoose.Model<unknown> {
  const model = document.constructor as mongoose.Model<unknown> & { db?: mongoose.Connection; modelName?: string };
  const connection = model.db;
  if (!connection) {
    throw new Error(
      `message-service: cannot resolve ${role} model "${modelName}" because the hydrated document has no owning connection`,
    );
  }

  try {
    return connection.model(modelName) as mongoose.Model<unknown>;
  } catch (error) {
    const connectionName = connection.name || '<unnamed>';
    const resolutionError = new Error(
      `message-service: ${role} model "${modelName}" is not registered on Mongoose connection "${connectionName}"`,
    );
    (resolutionError as Error & { cause?: unknown }).cause = error;
    throw resolutionError;
  }
}

function isDuplicateKeyError(error: unknown): boolean {
  return error instanceof Error && 'code' in error && (error as { code?: unknown }).code === 11000;
}

function isTransactionSupportError(error: unknown): boolean {
  if (!(error instanceof Error)) return false;
  return (
    error.message.includes('Transaction numbers are only allowed') ||
    error.message.includes('Transaction is not supported') ||
    error.message.includes('transactions are not supported')
  );
}

function createArchiveMethod(ctx: ArchiveContext) {
  return async function archive(
    this: MessageHydratedDocument,
    actionCd: string,
    archivedBy: UserId,
    registry: TemplateRegistry,
  ): Promise<void> {
    // Fail closed: invalid action/user never resolve a silent no-op success.
    // Trusted host-level primitive — hosts must authorize before calling.
    if (typeof actionCd !== 'string' || actionCd.length === 0) {
      throw new ActionNotFoundError(
        String((this as unknown as { templateCd?: unknown }).templateCd ?? ''),
        String(actionCd),
      );
    }
    if (!isValidMessageUserId(archivedBy)) {
      throw new InvalidMessageUserError();
    }
    if (!registry || typeof registry.find !== 'function') {
      throw new TemplateNotFoundError(String((this as unknown as { templateCd?: unknown }).templateCd ?? ''));
    }
    const templateCd = this.templateCd;
    const template = registry.find(templateCd);
    if (!template) {
      throw new TemplateNotFoundError(templateCd);
    }
    if (!includesAction(templateCd, actionCd, registry)) {
      throw new ActionNotFoundError(templateCd, actionCd);
    }

    const activeModel = this.constructor as mongoose.Model<unknown> & { db?: mongoose.Connection };
    const connection = activeModel.db as
      | (mongoose.Connection & { startSession?: () => Promise<mongoose.ClientSession> })
      | undefined;
    if (!connection || typeof connection.startSession !== 'function') {
      throw new MessageTransactionRequiredError(
        new Error('message-service: direct archive() requires a Mongoose connection with session/transaction support'),
      );
    }
    const MessageArchive = resolveDocumentModel(this, ctx.archiveModelName, 'archive') as mongoose.Model<
      Record<string, unknown>
    >;
    const ActiveTyped = activeModel as unknown as mongoose.Model<Record<string, unknown>>;

    const messageId = this._id;
    const existingSession =
      typeof (this as unknown as { $session?: () => mongoose.ClientSession | null }).$session === 'function'
        ? (this as unknown as { $session: () => mongoose.ClientSession | null }).$session()
        : null;

    const run = async (session: mongoose.ClientSession): Promise<void> => {
      await session.withTransaction(async () => {
        const now = new Date();
        // Fresh read inside the transaction: a stale hydrated copy must not
        // decide fencing, and the archived payload reflects persisted state.
        const fresh = (await ActiveTyped.findOne({ _id: messageId }).session(session).lean()) as unknown as Record<
          string,
          unknown
        > | null;
        if (!fresh) {
          const archivedMatch = (await MessageArchive.findOne({ _id: messageId })
            .session(session)
            .select('_id')
            .lean()
            .catch(() => null)) as unknown;
          if (archivedMatch) {
            throw new MessageArchivedError(String(messageId));
          }
          throw new MessageNotFoundError(String(messageId));
        }
        const state = fresh.actionState as string | null | undefined;
        const leaseExpiresAt = fresh.actionLeaseExpiresAt as Date | null | undefined;
        const liveLease =
          state === 'processing' && leaseExpiresAt instanceof Date && leaseExpiresAt.getTime() > now.getTime();
        // Fail closed: a processing record without a parsable future lease is
        // treated as live (only an explicitly expired lease may be archived
        // over). This keeps direct archive from stealing an in-flight service
        // action that has not demonstrably expired.
        if (state === 'processing' && !liveLease) {
          const expired = leaseExpiresAt instanceof Date && leaseExpiresAt.getTime() <= now.getTime();
          if (!expired) {
            throw new ActionConflictError(String(messageId));
          }
        } else if (liveLease) {
          throw new ActionConflictError(String(messageId));
        }

        const source = { ...(fresh as Record<string, unknown>) };
        delete source.actionState;
        delete source.actionClaimedBy;
        delete source.actionClaimedAt;
        delete source.actionLeaseExpiresAt;
        delete source.actionFailureMessage;
        // Preserve the stored attempt/owner identity for audit; direct archive
        // mints no new owner token. Notification state is terminal-none because
        // no service sender-notification runs on this path.
        const archiveDoc: Record<string, unknown> = {
          ...source,
          actionCd,
          archivedBy,
          archivedAt: new Date(),
          actionNotificationState: 'none',
          actionNotificationError: null,
          actionNotificationAttemptedAt: null,
        };
        try {
          await MessageArchive.create([archiveDoc], { session, ordered: true });
        } catch (error) {
          if (isDuplicateKeyError(error)) {
            throw new MessageArchivedError(String(messageId));
          }
          throw error;
        }
        // Conditional delete: a service claim that wins concurrently changes
        // actionState/ownership, so the delete matches zero and the
        // transaction aborts — no conflicting commit, no orphan archive.
        const deleted = (await ActiveTyped.deleteOne(
          {
            _id: messageId,
            $or: [
              { actionState: 'active' },
              { actionState: 'retryable' },
              { actionState: 'processing', actionLeaseExpiresAt: { $lte: now } },
              { actionState: null },
              { actionState: { $exists: false } },
            ],
          },
          { session },
        )) as unknown as { deletedCount?: number; n?: number };
        if ((deleted.deletedCount ?? deleted.n ?? 0) !== 1) {
          throw new ActionConflictError(String(messageId));
        }
      });
    };

    if (existingSession) {
      try {
        await run(existingSession);
      } catch (error) {
        if (
          error instanceof ActionConflictError ||
          error instanceof MessageArchivedError ||
          error instanceof MessageNotFoundError
        ) {
          throw error;
        }
        if (isTransactionSupportError(error)) {
          throw new MessageTransactionRequiredError(error);
        }
        throw error;
      }
      return;
    }

    let session: mongoose.ClientSession;
    try {
      session = await connection.startSession();
    } catch (error) {
      throw new MessageTransactionRequiredError(error);
    }
    try {
      try {
        await run(session);
      } catch (error) {
        if (
          error instanceof ActionConflictError ||
          error instanceof MessageArchivedError ||
          error instanceof MessageNotFoundError
        ) {
          throw error;
        }
        if (isDuplicateKeyError(error)) {
          throw new MessageArchivedError(String(messageId));
        }
        if (isTransactionSupportError(error)) {
          throw new MessageTransactionRequiredError(error);
        }
        throw error;
      }
    } finally {
      await session.endSession();
    }
  };
}

// ---------------------------------------------------------------------------
// Email hook factory
// ---------------------------------------------------------------------------

interface EmailHookContext {
  emailNotifier: EmailNotifier;
  onEmailDeliveryFailure?: (event: EmailDeliveryFailureEvent) => void | Promise<void>;
  emailNotificationExclusions: string[];
  userModelName: string;
}

const EMAIL_WAS_NEW_LOCAL = 'messageServiceEmailWasNew';

function normalizeEmailTitle(value: string): string {
  return value.trim().toLowerCase();
}

function createEmailStateCaptureHook() {
  return function captureEmailState(this: MessageHydratedDocument) {
    this.$locals[EMAIL_WAS_NEW_LOCAL] = this.isNew;
  };
}

function createPostSaveEmailHook(ctx: EmailHookContext) {
  return async function sendNotificationEmail(this: MessageHydratedDocument) {
    if (!this.$locals[EMAIL_WAS_NEW_LOCAL]) {
      return;
    }

    if (this.$session()) {
      return;
    }

    if (!this.toUser || !this.receiverContent?.title) {
      return;
    }

    const title = this.receiverContent.title.trim();
    if (!title || ctx.emailNotificationExclusions.includes(normalizeEmailTitle(title))) {
      return;
    }

    let user: { email?: string } | null;
    try {
      const User = resolveDocumentModel(this, ctx.userModelName, 'user');
      user = (await User.findById(this.toUser).select('email').lean()) as { email?: string } | null;
    } catch (error) {
      await reportEmailFailure(ctx, 'recipientLookup', error, this, title);
      return;
    }

    if (!user?.email) {
      return;
    }

    const long = this.receiverContent.long || '';
    const short = this.receiverContent.short || '';
    const body = long.length > short.length ? long : short;

    try {
      await ctx.emailNotifier(user.email, title, body);
    } catch (error) {
      await reportEmailFailure(ctx, 'notifier', error, this, title);
    }
  };
}

async function reportEmailFailure(
  ctx: Pick<EmailHookContext, 'onEmailDeliveryFailure'>,
  stage: EmailDeliveryFailureStage,
  error: unknown,
  message: MessageHydratedDocument,
  title: string,
): Promise<void> {
  try {
    await ctx.onEmailDeliveryFailure?.({
      stage,
      error,
      messageId: message._id,
      recipientId: message.toUser as UserId,
      title,
    });
  } catch {
    // Preserve best-effort email delivery: observer failures must not reject a committed save.
  }
}

// ---------------------------------------------------------------------------
// Schema factory
// ---------------------------------------------------------------------------

/**
 * Verify that a Mongoose model with the given name is (or has been) registered.
 * Runs at schema-build time to give a clear error if the user forgot to
 * register the model before configuring the schema.
 */
function assertModelRegistered(connection: mongoose.Connection | typeof mongoose, name: string, role: string): void {
  if (!connection.modelNames().includes(name)) {
    const connectionName = 'name' in connection && connection.name ? connection.name : 'global mongoose';
    throw new Error(
      `message-service: cannot configure schema — ${role} model "${name}" is not registered on Mongoose connection "${connectionName}". ` +
        `Register the model on that connection before buildMessageSchema().`,
    );
  }
}

interface ResolvedConfig {
  emailNotifier: EmailNotifier | null;
  onEmailDeliveryFailure?: (event: EmailDeliveryFailureEvent) => void | Promise<void>;
  emailNotificationExclusions: string[];
  userModelName: string;
  archiveModelName: string;
  connection: mongoose.Connection | typeof mongoose;
}

function resolveConfig(config?: MessageSchemaConfig): ResolvedConfig {
  return {
    emailNotifier: config?.emailNotifier ?? null,
    onEmailDeliveryFailure: config?.onEmailDeliveryFailure,
    emailNotificationExclusions: (config?.emailNotificationExclusions ?? []).map(normalizeEmailTitle),
    userModelName: config?.userModelName ?? 'User',
    archiveModelName: config?.archiveModelName ?? MESSAGE_ARCHIVE_MODEL_NAME,
    connection: config?.connection ?? mongoose,
  };
}

/**
 * Build a fresh Message schema with the given configuration.
 * Prefer this over the default `MessageSchema` export when you need
 * an email notifier, exclusions, or custom model names.
 *
 * Note: when `emailNotifier` is set, the configured `userModelName` MUST
 * be registered with Mongoose before calling this function. The schema
 * factory checks this eagerly to fail fast.
 */
export function buildMessageSchema(
  config?: MessageSchemaConfig,
): mongoose.Schema<IBaseMessage, MessageModel, IMessageMethods> {
  const resolved = resolveConfig(config);

  if (resolved.emailNotifier) {
    assertModelRegistered(resolved.connection, resolved.userModelName, 'user');
  }

  const schema = new mongoose.Schema<IBaseMessage, MessageModel, IMessageMethods>(BaseMessageFields, {
    timestamps: true,
  });

  schema.index({ fromUser: 1, createdAt: -1, _id: -1 });
  schema.index({ toUser: 1, createdAt: -1, _id: -1 });
  schema.index({ toRoles: 1, createdAt: -1, _id: -1 });
  schema.index({ actionState: 1, actionLeaseExpiresAt: 1 });
  schema.index(
    { actionAttemptId: 1 },
    {
      unique: true,
      partialFilterExpression: { actionAttemptId: { $type: 'string' } },
    },
  );
  schema.index(
    { clientRequestOwnerId: 1, templateCd: 1, clientRequestId: 1, createdAt: 1, _id: 1 },
    {
      partialFilterExpression: {
        clientRequestId: { $type: 'string' },
        clientRequestOwnerId: { $type: 'string' },
        templateCd: { $type: 'string' },
      },
    },
  );
  schema.index(
    { clientRequestOwnerId: 1, templateCd: 1, clientRequestId: 1, clientRequestItemIndex: 1 },
    {
      unique: true,
      partialFilterExpression: {
        clientRequestId: { $type: 'string' },
        clientRequestOwnerId: { $type: 'string' },
        templateCd: { $type: 'string' },
        clientRequestItemIndex: { $type: 'number' },
      },
    },
  );

  schema.methods.isSender = isSender;
  schema.methods.isReceiver = isReceiver;
  schema.methods.archive = createArchiveMethod({ archiveModelName: resolved.archiveModelName });

  if (resolved.emailNotifier) {
    schema.pre('save', createEmailStateCaptureHook());
    schema.post(
      'save',
      createPostSaveEmailHook({
        emailNotifier: resolved.emailNotifier,
        onEmailDeliveryFailure: resolved.onEmailDeliveryFailure,
        emailNotificationExclusions: resolved.emailNotificationExclusions,
        userModelName: resolved.userModelName,
      }),
    );
  }

  return schema;
}

/**
 * Default Message schema with no email notifier and no save hooks.
 * Provided for backwards compatibility and simple use cases.
 * Use `buildMessageSchema(config)` when you need custom behavior.
 */
export const MessageSchema = buildMessageSchema();
