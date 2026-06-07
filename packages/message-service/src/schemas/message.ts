import mongoose from 'mongoose';
import { BaseMessageFields, MESSAGE_ARCHIVE_MODEL_NAME } from './base';
import type { IMessage, UserId } from '../types/message';
import type { TemplateRegistry } from '../template-registry';
import { includesAction } from '../template-registry';
import { isSender, isReceiver } from './methods';

function archive(this: IMessage, actionCd: string, archivedBy: UserId, registry?: TemplateRegistry): Promise<void> {
  if (!includesAction(this.templateCd, actionCd, registry) || !archivedBy) {
    return Promise.resolve();
  }

  const MessageArchive = mongoose.model(MESSAGE_ARCHIVE_MODEL_NAME);

  // Copy all defined base fields — consumer-extended fields must override archive() to preserve their extra fields
  const data: Record<string, unknown> = {};
  for (const key of Object.keys(BaseMessageFields)) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    data[key] = (this as any)[key];
  }

  return MessageArchive.create({
    ...data,
    actionCd,
    archivedBy,
  }).then(() => this.deleteOne());
}

// ---------------------------------------------------------------------------
// Pre-save hook: send email notification
// ---------------------------------------------------------------------------

export type EmailNotifier = (email: string, title: string, message: string) => Promise<void> | void;

interface SchemaConfig {
  emailNotifier: EmailNotifier | null;
  emailNotificationExclusions: string[];
}

const schemaConfig: SchemaConfig = {
  emailNotifier: null,
  emailNotificationExclusions: [],
};

export function setEmailNotifier(notifier: EmailNotifier | null) {
  schemaConfig.emailNotifier = notifier;
}

export function setEmailExclusions(exclusions: string[]) {
  schemaConfig.emailNotificationExclusions = exclusions.map((e) => e.toLowerCase());
}

function createPreSaveHook() {
  return async function sendNotificationEmail(this: IMessage) {
    if (!schemaConfig.emailNotifier) {
      return;
    }

    if (!this.toUser || !this.receiverContent?.title) {
      return;
    }

    const title = this.receiverContent.title.trim();
    if (schemaConfig.emailNotificationExclusions.includes(title.toLowerCase())) {
      return;
    }

    try {
      const User = mongoose.model('User');
      const user = (await User.findById(this.toUser).select('email').lean()) as { email?: string } | null;
      if (!user?.email) {
        return;
      }

      const long = this.receiverContent.long || '';
      const short = this.receiverContent.short || '';
      const body = long.length > short.length ? long : short;

      await schemaConfig.emailNotifier(user.email, title, body);
    } catch {
      // Don't block message save on email failure
    }
  };
}

// ---------------------------------------------------------------------------
// Schema Definition
// ---------------------------------------------------------------------------

const MessageSchema: mongoose.Schema = new mongoose.Schema(BaseMessageFields, {
  timestamps: true,
});

MessageSchema.index({ createdAt: 1 });

MessageSchema.methods.isSender = isSender;
MessageSchema.methods.isReceiver = isReceiver;
MessageSchema.methods.archive = archive;

// eslint-disable-next-line @typescript-eslint/no-explicit-any
(MessageSchema as any).pre('save', createPreSaveHook());

export { MessageSchema };
