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
  PermissionSchema,
  PermissionSchemaField,
  BaseFilter,
  BaseFilterAccess,
  BaseFilterContext,
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
export { MessageSchema, setEmailNotifier, setEmailExclusions } from './schemas/message';
export type { EmailNotifier } from './schemas/message';
export { MessageArchiveSchema } from './schemas/message-archive';

// --- Template Engine ---
export { interpolateTemplate } from './template-engine';

// --- Template Registry ---
export { TemplateRegistry, defaultRegistry, includesAction } from './template-registry';

// --- Providers ---
export type { EmailProvider } from './providers/email';
export { NoopEmailProvider } from './providers/email';
export type { PaymentProvider } from './providers/payment';
export { NoopPaymentProvider } from './providers/payment';

// --- Message Service ---
export { MessageService } from './message-service';
export type { MessageServiceOptions } from './message-service';

// --- Route Factory ---
export { createMessageRoutes, DEFAULT_PERMISSION_SCHEMA, ARCHIVE_PERMISSION_SCHEMA } from './route-factory';
export type { MessageRoutesOptions } from './route-factory';
