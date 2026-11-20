export { EmailError } from './errors';
export type { EmailErrorCode } from './errors';
export { createEmailTemplateRegistry, defineLocalTemplate, defineSendGridTemplate } from './templates/registry';
export { createEmailService } from './service';
export { createEmailWorker } from './worker';
export { createEmailBatchService } from './batch';
export { createEmailAdmin } from './admin';
export { createMemoryEmailStore } from './stores/memory';

export type {
  AttachmentRef,
  AttachmentResolution,
  AttachmentResolver,
  Awaitable,
  CallOptions,
  Correlation,
  EmailAdmissionKey,
  EmailAttemptId,
  EmailClock,
  EmailEnvelope,
  EmailJobId,
  EmailScope,
  EmailSnapshot,
  JsonObject,
  JsonValue,
  Mailbox,
  PreparedEmailCommand,
  ProviderRef,
  ResolvedAttachment,
  TemplateIdentity,
  UnixMs,
} from './contracts/message';
export type {
  EmailCommand,
  EmailTemplateRegistry,
  LocalSource,
  LocalTemplate,
  LocalTemplateConfig,
  PrepareContext,
  PreparedFields,
  SendGridTemplate,
  SendGridTemplateConfig,
  TemplateCommand,
  TemplateDefinition,
  TemplateDefinitions,
  TemplateMap,
  TemplateRegistryOptions,
} from './contracts/template';
export type {
  AttemptReason,
  AttemptResult,
  ConfiguredEmailProvider,
  EmailProvider,
  PreparedEmailSubmission,
  ProviderCall,
  ProviderReason,
  ProviderResult,
  ProviderSubmission,
  RecipientResult,
  RetryClass,
  RetryHint,
  SendGridSnapshot,
  SmtpSnapshot,
  SubmissionOutcome,
  SubmissionStage,
} from './contracts/provider';
export type {
  CancelResult,
  EmailJobState,
  EmailJobSummary,
  JobDisposition,
  ResolveUnknownCommand,
  ResolveUnknownResult,
  RetentionPolicy,
  RetryPolicy,
  UnknownResolution,
} from './contracts/job';
export type {
  AdmissionResult,
  EmailBatchItem,
  EmailBatchResult,
  EmailBatchService,
  EmailBatchServiceOptions,
  EmailService,
  EmailServiceOptions,
} from './contracts/service';
export type {
  EmailRateLimiter,
  EmailRunEntry,
  EmailRunOptions,
  EmailRunReport,
  EmailShutdownReport,
  EmailWorker,
  EmailWorkerLimits,
  EmailWorkerOptions,
  MaintenanceStop,
} from './contracts/worker';
export type {
  CleanupReport,
  EmailActivity,
  EmailActivityPage,
  EmailActivityQuery,
  EmailAdmin,
  EmailAdminOptions,
  MaintenanceOptions,
  ReconcileReport,
} from './contracts/admin';
export type {
  AttemptCommit,
  ClaimedEmail,
  CleanupStep,
  EmailStore,
  HandoffGrant,
  LeaseGrant,
  LeaseToken,
  MemoryEmailStoreOptions,
  OwnerFence,
  ProjectionPermit,
  StoreAdmission,
  StoreCall,
  StoreNext,
} from './contracts/store';
