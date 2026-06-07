import mongoose from 'mongoose';
import { BaseMessageFields, MESSAGE_ARCHIVE_MODEL_NAME } from './base';
import type { IMessage, UserId } from '../types/message';
import type { TemplateRegistry } from '../template-registry';
import { includesAction } from '../template-registry';
import { isSender, isReceiver } from './methods';

// ---------------------------------------------------------------------------
// Email notification hook
// ---------------------------------------------------------------------------

export type EmailNotifier = (email: string, title: string, message: string) => Promise<void> | void;

export interface MessageSchemaConfig {
  /**
   * Called on every message save (unless excluded) to send an email
   * notification to the recipient. Pass `null` (the default) to disable.
   *
   * When `null`, no pre-save hook is registered at all.
   */
  emailNotifier?: EmailNotifier | null;

  /**
   * Message titles (lowercased, after trim) that should NOT trigger email
   * notifications. Comparison is case-insensitive and matches the *compiled*
   * title — i.e. the interpolated result. Use this to suppress emails for
   * low-priority messages.
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

function createArchiveMethod(ctx: ArchiveContext) {
  return function archive(
    this: IMessage,
    actionCd: string,
    archivedBy: UserId,
    registry: TemplateRegistry,
  ): Promise<void> {
    if (!includesAction(this.templateCd, actionCd, registry) || !archivedBy) {
      return Promise.resolve();
    }

    const MessageArchive = mongoose.model(ctx.archiveModelName);
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
// Pre-save hook factory
// ---------------------------------------------------------------------------

interface PreSaveContext {
  emailNotifier: EmailNotifier;
  emailNotificationExclusions: string[];
  userModelName: string;
}

function createPreSaveHook(ctx: PreSaveContext) {
  return async function sendNotificationEmail(this: IMessage) {
    if (!this.toUser || !this.receiverContent?.title) {
      return;
    }

    const title = this.receiverContent.title.trim();
    if (ctx.emailNotificationExclusions.includes(title.toLowerCase())) {
      return;
    }

    try {
      const User = mongoose.model(ctx.userModelName);
      const user = (await User.findById(this.toUser).select('email').lean()) as { email?: string } | null;
      if (!user?.email) {
        return;
      }

      const long = this.receiverContent.long || '';
      const short = this.receiverContent.short || '';
      const body = long.length > short.length ? long : short;

      await ctx.emailNotifier(user.email, title, body);
    } catch {
      // Don't block message save on email failure
    }
  };
}

// ---------------------------------------------------------------------------
// Schema factory
// ---------------------------------------------------------------------------

/**
 * Verify that a Mongoose model with the given name is (or has been) registered.
 * Runs at schema-build time to give a clear error if the user forgot to
 * register the model before configuring the schema.
 */
function assertModelRegistered(name: string, role: string): void {
  if (!mongoose.modelNames().includes(name)) {
    throw new Error(
      `message-service: cannot configure schema — ${role} model "${name}" is not registered with Mongoose. ` +
        `Call mongoose.model("${name}", ...) before buildMessageSchema().`,
    );
  }
}

interface ResolvedConfig {
  emailNotifier: EmailNotifier | null;
  emailNotificationExclusions: string[];
  userModelName: string;
  archiveModelName: string;
}

function resolveConfig(config?: MessageSchemaConfig): ResolvedConfig {
  return {
    emailNotifier: config?.emailNotifier ?? null,
    emailNotificationExclusions: (config?.emailNotificationExclusions ?? []).map((e) => e.toLowerCase()),
    userModelName: config?.userModelName ?? 'User',
    archiveModelName: config?.archiveModelName ?? MESSAGE_ARCHIVE_MODEL_NAME,
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
export function buildMessageSchema(config?: MessageSchemaConfig): mongoose.Schema {
  const resolved = resolveConfig(config);

  if (resolved.emailNotifier) {
    assertModelRegistered(resolved.userModelName, 'user');
  }

  const schema: mongoose.Schema = new mongoose.Schema(BaseMessageFields, {
    timestamps: true,
  });

  schema.index({ createdAt: 1 });
  schema.index({ clientRequestId: 1 }, { sparse: true });

  schema.methods.isSender = isSender;
  schema.methods.isReceiver = isReceiver;
  schema.methods.archive = createArchiveMethod({ archiveModelName: resolved.archiveModelName });

  if (resolved.emailNotifier) {
    schema.pre(
      'save',
      createPreSaveHook({
        emailNotifier: resolved.emailNotifier,
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
export const MessageSchema: mongoose.Schema = buildMessageSchema();
