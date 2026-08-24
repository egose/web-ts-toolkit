import mongoose from 'mongoose';
import { BaseMessageFields, MESSAGE_ARCHIVE_MODEL_NAME } from './base';
import type { IBaseMessage, IMessageMethods, UserId } from '../types/message';
import type { TemplateRegistry } from '../template-registry';
import { includesAction } from '../template-registry';
import { isSender, isReceiver } from './methods';

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
   * When `null`, no pre-save hook is registered at all.
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
   * Defaults to `'User'`. The pre-save hook uses `mongoose.model(name)`
   * to look up the recipient's email address.
   *
   * The model MUST be registered with Mongoose before the first save —
   * `buildMessageSchema` does a sanity check to give a clear error if not.
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

function createArchiveMethod(ctx: ArchiveContext) {
  return function archive(
    this: MessageHydratedDocument,
    actionCd: string,
    archivedBy: UserId,
    registry: TemplateRegistry,
  ): Promise<void> {
    if (!includesAction(this.templateCd, actionCd, registry) || !archivedBy) {
      return Promise.resolve();
    }

    const MessageArchive = resolveDocumentModel(this, ctx.archiveModelName, 'archive');
    const data = this.toObject();

    return MessageArchive.create({
      ...data,
      actionCd,
      archivedBy,
    }).then(async () => {
      await this.deleteOne();
    });
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
 * Default Message schema with no email notifier and no pre-save hook.
 * Provided for backwards compatibility and simple use cases.
 * Use `buildMessageSchema(config)` when you need custom behavior.
 */
export const MessageSchema = buildMessageSchema();
