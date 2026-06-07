// ---------------------------------------------------------------------------
// @web-ts-toolkit/message-service
//
// Template-driven messaging core for Mongoose + Express applications.
// ---------------------------------------------------------------------------

// --- Types ---
export type {
  IMessageContent,
  IBaseMessage,
  IMessage,
  IMessageArchive,
  IMessageMethods,
  MessageType,
  MessageUser,
} from './types/message';

export type {
  PrepareContext,
  PrepareResult,
  ActionContext,
  SenderNotificationContent,
  ActionConfirmation,
  MessageAction,
  MessageTemplate,
  UiTemplate,
  Usertype,
  InterpolatedContent,
  InterpolatedAction,
  InterpolationResult,
} from './types/template';

// --- Schemas ---
export {
  MESSAGE_MODEL_NAME,
  MESSAGE_ARCHIVE_MODEL_NAME,
  MessageContentSchema,
  BaseMessageFields,
} from './schemas/base';
export { MessageSchema, buildMessageSchema } from './schemas/message';
export type { EmailNotifier, MessageSchemaConfig } from './schemas/message';
export { MessageArchiveSchema, buildMessageArchiveSchema } from './schemas/message-archive';

// --- Template Engine ---
export { interpolateTemplate, filterActions, isActionAllowed } from './template-engine';

// --- Template Registry ---
export { TemplateRegistry, defaultRegistry, includesAction } from './template-registry';

// --- Providers ---
export { NoopEmailProvider } from './providers/email';
export type { EmailProvider } from './providers/email';
export { NoopPaymentProvider } from './providers/payment';
export type { PaymentProvider } from './providers/payment';

// --- Message Service ---
export { MessageService } from './message-service';
export type { MessageServiceOptions } from './message-service';
export {
  GENERIC_NOTIFICATION_TEMPLATE_CD,
  MessageArchivedError,
  MessageNotFoundError,
  TemplateNotFoundError,
  ActionNotFoundError,
  ActionNotAllowedError,
} from './message-service';

// --- Route Factory ---
export { createMessageRoutes } from './route-factory';
export type { MessageRoutesOptions } from './route-factory';
