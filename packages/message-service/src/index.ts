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
  ActionLifecycleState,
  ActionNotificationState,
  MessageType,
  UserId,
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
  RegisteredMessageAction,
  RegisteredMessageTemplate,
  RegisteredUiTemplate,
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
  MESSAGE_REQUEST_MODEL_NAME,
  MessageContentSchema,
  BaseMessageFields,
} from './schemas/base';
export { MessageSchema, buildMessageSchema } from './schemas/message';
export type {
  EmailDeliveryFailureEvent,
  EmailDeliveryFailureStage,
  EmailNotifier,
  MessageSchemaConfig,
} from './schemas/message';
export { MessageArchiveSchema, buildMessageArchiveSchema } from './schemas/message-archive';
export { MessageRequestSchema, buildMessageRequestSchema } from './schemas/message-request';

// --- Template Engine ---
export {
  interpolateTemplate,
  interpolateMessageContent,
  resolveUiTemplate,
  filterActions,
  isActionAllowed,
  hasExplicitPermissionGrant,
} from './template-engine';

// --- Template Registry ---
export {
  TemplateRegistry,
  TemplateRegistryValidationError,
  defaultRegistry,
  includesAction,
} from './template-registry';

// --- Providers ---
export { NoopEmailProvider } from './providers/email';
export type { EmailProvider } from './providers/email';
export { NoopPaymentProvider } from './providers/payment';
export type { PaymentProvider } from './providers/payment';

// --- Message Service ---
export {
  MessageService,
  isValidMessageUserId,
  requireMessageUserId,
  MAX_MESSAGE_SERVICE_TIMEOUT_MS,
} from './message-service';
export type {
  MessageServiceModelNames,
  MessageServiceOptions,
  PaymentCompensationFailureEvent,
  PaymentSessionCompensationFailure,
} from './message-service';
export {
  GENERIC_NOTIFICATION_TEMPLATE_CD,
  ActionTemplateMismatchError,
  ActionConflictError,
  ActionNotificationPendingError,
  InvalidMessageUserError,
  InvalidMessageServiceOptionError,
  MessageArchivedError,
  MessageNotFoundError,
  TemplateNotFoundError,
  ActionNotFoundError,
  ActionNotAllowedError,
  ActionRetryableError,
  InvalidClientRequestIdError,
  InvalidPaginationValueError,
  ClientRequestPendingError,
  ClientRequestFailedError,
  ClientRequestInconsistentStateError,
  MessageTransactionRequiredError,
  MessageModelResolutionError,
  PaymentSessionCompensationError,
  PaymentSessionCompensationAggregateError,
} from './message-service';

// --- Route Factory ---
export { createMessageRoutes } from './route-factory';
export type {
  MessageRoutesBehaviorOptions,
  MessageRoutesConstructionOptions,
  MessageRoutesInjectionOptions,
  MessageRoutesOptions,
} from './route-factory';
