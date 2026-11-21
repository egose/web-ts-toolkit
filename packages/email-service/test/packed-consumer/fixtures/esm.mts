import {
  createEmailAdmin,
  createEmailBatchAdmission,
  createEmailBatchService,
  createEmailRelay,
  createSmtpAcceptanceResult,
  EmailError,
  type EmailBatchAdmission,
  type EmailBatchAdmissionOptions,
  type EmailBatchItem,
  type EmailBatchResult,
  type EmailActivity,
  type EmailActivityPage,
  type EmailAdmin,
  type EmailCommand,
  type EmailErrorCode,
  type EmailJobSummary,
  type EmailProvider,
  type EmailRelay,
  type EmailRelayOptions,
  type EmailService,
  type EmailStore,
  type EmailWorker,
  type LocalTemplate,
  type PreparedEmailCommand,
  type ProviderResult,
  type RecipientResult,
  type SendGridSnapshot,
  type SendGridTemplate,
  type SmtpCapacity,
  type TemplateCommand,
  type TemplateDefinitions,
  type TemplateMap,
} from '@web-ts-toolkit/email-service';
import { createSendGridProvider, type SendGridProviderOptions } from '@web-ts-toolkit/email-service/sendgrid';
import type { SmtpProviderOptions } from '@web-ts-toolkit/email-service/smtp';

type Templates = {
  receipt: LocalTemplate<{ invoiceId: string }, { cents: number }>;
  reminder: SendGridTemplate<{ hours: number }, { details: { hours: number } }>;
};
export type Definitions = TemplateDefinitions<Templates>;

export const prepareReceipt: Definitions['receipt']['prepare'] = (input, context) => ({
  values: { cents: input.invoiceId.length },
  correlation: { scope: context.scope },
});
// @ts-expect-error a preparer must produce the values described by its template's parseData
export const wrongData: Definitions['receipt']['prepare'] = () => ({ values: { cents: '100' } });

export const receipt = {
  templateKey: 'receipt',
  input: { invoiceId: 'synthetic-invoice' },
  provider: { kind: 'smtp', key: 'local', mode: 'live' },
  key: { kind: 'single', idempotencyKey: 'receipt-1' },
  intent: { invoiceId: 'synthetic-invoice' },
} satisfies EmailCommand<Templates>;

export const reminder = {
  templateKey: 'reminder',
  input: { hours: 2 },
  provider: { kind: 'sendgrid', key: 'test', mode: 'sandbox' },
  key: { kind: 'batch', batchId: 'test-batch', itemId: 'test-item' },
  intent: { hours: 2 },
} satisfies EmailCommand<Templates>;

const liveRef = { ...reminder.provider, mode: 'live' } as const;

export function sharedCommands(accept: (command: TemplateCommand<TemplateMap>) => void) {
  accept(receipt);
  accept(reminder);
  accept({ ...reminder, provider: liveRef });
  // @ts-expect-error Widening does not allow sandbox for SMTP.
  accept({ ...receipt, provider: { ...receipt.provider, mode: 'sandbox' } });
  // @ts-expect-error Widening does not add new modes to SendGrid.
  accept({ ...reminder, provider: { ...reminder.provider, mode: 'preview' } });
}

export function batchFixture(service: EmailService<Templates>, worker: EmailWorker): Promise<EmailBatchResult> {
  const batch = createEmailBatchService({ service, worker });
  const items: readonly EmailBatchItem<Templates>[] = [
    {
      itemId: 'receipt-1',
      command: { templateKey: 'receipt', input: receipt.input, provider: receipt.provider, intent: receipt.intent },
    },
  ];
  return batch.enqueueBatch({ batchId: 'example', items });
}

export function admissionOnly(
  service: EmailService<Templates>,
  { findAdmission, insert, smtpCapacity }: EmailStore,
  prepared: PreparedEmailCommand,
) {
  const batch = createEmailBatchAdmission({ service } satisfies EmailBatchAdmissionOptions<Templates>);
  const { key, ...command } = receipt;
  void batch.enqueueBatch({ batchId: key.idempotencyKey, items: [{ itemId: 'notice', command }] });
  const wrongInput = { ...command, input: reminder.input };
  // @ts-expect-error Producer-only admission still checks the inferred template input.
  void batch.enqueueBatch({ batchId: 'wrong', items: [{ itemId: 'notice', command: wrongInput }] });
  // @ts-expect-error Producer-only admission has no delivery method.
  void batch.run();

  const options = {
    scope: 'example',
    store: { findAdmission, insert, ...(smtpCapacity ? { smtpCapacity } : {}) },
    ...(smtpCapacity ? { smtpCapacity } : {}),
  } satisfies EmailRelayOptions;
  const relay = createEmailRelay(options);
  void relay.enqueuePrepared(prepared);
  // @ts-expect-error A relay cannot prepare or enqueue an unstaged command.
  void relay.enqueue(receipt);
  return { batch, relay } satisfies { batch: EmailBatchAdmission<Templates>; relay: EmailRelay };
}

export async function adminFixture(store: EmailStore, jobId: string): Promise<EmailActivityPage> {
  const admin: EmailAdmin = createEmailAdmin({ scope: 'example', store });
  await admin.reconcile({ limit: 1 });
  const page = await admin.listActivities({ jobId });
  // @ts-expect-error public history has no payload
  void page.items[0]?.snapshot;
  // @ts-expect-error redrive must acknowledge possible duplicate submission
  await admin.resolveUnknown({ jobId, attemptId: 'example', action: 'redrive' });
  return page;
}

// @ts-expect-error the template key determines the input, not a union of all inputs
export const wrongInput: EmailCommand<Templates> = { ...receipt, input: reminder.input };
// @ts-expect-error the hosted template accepts an object, not the raw hours string
export const wrongHostedInput: EmailCommand<Templates> = { ...reminder, input: '2' };
// @ts-expect-error an SMTP provider cannot render a SendGrid template
export const wrongProvider: EmailCommand<Templates> = { ...reminder, provider: receipt.provider };
// @ts-expect-error even a live SendGrid provider cannot render a local template
export const wrongLocalProvider: EmailCommand<Templates> = { ...receipt, provider: liveRef };
// @ts-expect-error provider results cannot claim a worker-only stage
export const wrongStage: ProviderResult['stage'] = 'pre_handoff';

const to = { group: 'to', index: 0, status: 'accepted' } as const;
const bcc = { group: 'bcc', index: 0, status: 'rejected' } as const;
const smtpAccepted = {
  outcome: 'accepted',
  retry: 'never',
  stage: 'data',
  reason: 'smtp_accepted',
  recipients: [to],
  messageId: '<00000000-0000-4000-8000-000000000001@email.invalid>',
} as const satisfies ProviderResult;
const live = {
  outcome: 'accepted',
  retry: 'never',
  stage: 'http',
  reason: 'sendgrid_accepted',
  providerMessageId: 'synthetic-live-id',
} satisfies ProviderResult;
const sandbox = { outcome: 'validated', retry: 'never', stage: 'http', reason: 'sendgrid_validated' } as const;
const throttle = { outcome: 'rejected', retry: 'safe_transient', stage: 'http', reason: 'sendgrid_throttled' } as const;
const refusal = {
  outcome: 'rejected',
  retry: 'safe_transient',
  stage: 'envelope',
  reason: 'smtp_transient_reply',
  recipients: [bcc],
} satisfies ProviderResult;

export function acceptSmtpRecipients(recipients: readonly RecipientResult[]) {
  const result = createSmtpAcceptanceResult(recipients, smtpAccepted.messageId);
  if (result.reason === 'smtp_accepted') {
    const firstStatus: 'accepted' = result.recipients[0].status;
    void firstStatus;
  }
  return result;
}

export const providerResults = [
  smtpAccepted,
  acceptSmtpRecipients([bcc, to]),
  live,
  sandbox,
  { ...throttle, retryHint: { notBefore: 0 } },
  refusal,
  { outcome: 'unknown', retry: 'never', stage: 'data', reason: 'transport_uncertain', recipients: [bcc] },
  { outcome: 'unsubmitted', retry: 'safe_transient', stage: 'connect', reason: 'not_transmitted' },
] satisfies readonly ProviderResult[];

export function smtpRecipientCount(result: ProviderResult) {
  return result.reason === 'smtp_accepted' || result.reason === 'smtp_partial' ? result.recipients.length : 0;
}

export const providerTimeout = {
  reason: 'provider_timeout',
  outcome: 'unknown',
  stage: 'data',
  retry: 'never',
} satisfies Extract<ProviderResult, { reason: 'provider_timeout' }>;

const smtpPartial = { ...smtpAccepted, reason: 'smtp_partial', outcome: 'partially_accepted' } as const;

export function rejectInvalidEvidence(check: (result: ProviderResult) => void) {
  // @ts-expect-error SMTP full acceptance requires recipients
  check({ outcome: 'accepted', retry: 'never', stage: 'data', reason: 'smtp_accepted' });
  // @ts-expect-error SMTP partial acceptance also requires recipients
  check({ outcome: 'partially_accepted', retry: 'never', stage: 'data', reason: 'smtp_partial' });
  // @ts-expect-error an explicit empty list does not prove full acceptance
  check({ ...smtpAccepted, recipients: [] });
  // @ts-expect-error a partial result needs both statuses, proved by the checked constructor
  check({ ...smtpPartial, recipients: [to, { ...to, index: 1 }] });
  // @ts-expect-error rejecting every recipient is not partial acceptance
  check({ ...smtpPartial, recipients: [bcc, { ...bcc, index: 1 }] });
  // @ts-expect-error accepted is not a safe retry
  check({ ...smtpAccepted, retry: 'safe_transient' });
  // @ts-expect-error SMTP acceptance requires a DATA acknowledgement
  check({ ...smtpAccepted, stage: 'envelope' });
  // @ts-expect-error SMTP full acceptance does not include rejected recipients
  check({ ...smtpAccepted, recipients: [to, bcc] });
  // @ts-expect-error SMTP refusal can include recipients only at envelope or data
  check({ ...refusal, stage: 'tls' });
  // @ts-expect-error safe_transient is not enough to authorize a retry hint
  check({ ...refusal, retryHint: { delayMs: 1 } });
  // @ts-expect-error an included throttle hint needs at least one retry floor
  check({ ...throttle, retryHint: {} });
  // @ts-expect-error sandbox validation cannot have a provider message id
  check({ ...sandbox, providerMessageId: 'synthetic-id' });
  // @ts-expect-error sandbox validation is not submission acceptance
  check({ ...sandbox, outcome: 'accepted' });
  // @ts-expect-error SMTP message id metadata is not SendGrid live evidence
  check({ ...live, messageId: smtpAccepted.messageId });
  // @ts-expect-error SendGrid live acceptance does not return recipient evidence
  check({ ...live, recipients: [to] });
}

export function rejectInvalidConstruction(result: ReturnType<typeof createSmtpAcceptanceResult>) {
  // @ts-expect-error the constructor accepts normalized recipient statuses, not SDK statuses
  createSmtpAcceptanceResult([{ ...to, status: 'queued' }]);
  // @ts-expect-error an optional SMTP message id must be a string
  createSmtpAcceptanceResult([to], 1);
  // @ts-expect-error checked result lists are readonly
  result.recipients.push(to);
  // @ts-expect-error checked recipients are readonly too
  result.recipients[0].index = 10;
}

export async function loadJob(store: EmailStore, prepared: PreparedEmailCommand) {
  // @ts-expect-error prepared snapshots cannot be changed by callers
  prepared.snapshot.envelope.from.address = 'other@example.test';
  const hit = await store.findAdmission(prepared.scope, prepared.key, {
    signal: new AbortController().signal,
    timeoutMs: 1_000,
  });
  // @ts-expect-error a public summary does not include sending data
  if (hit) return hit.job.snapshot;
  return hit;
}

export const code: EmailErrorCode = new EmailError('write_unconfirmed').code;
export const smtp: SmtpProviderOptions = { key: 'local', host: 'smtp.example.test', tls: 'starttls' };
export const sendgrid: SendGridProviderOptions = { key: 'test', apiKey: 'synthetic-key', mode: 'sandbox' };
export const mailSend: EmailProvider<SendGridSnapshot> = createSendGridProvider(sendgrid);

export const capacity = {
  format: 'smtp-v2',
  namespace: '6d36e018-b27f-4f3d-88d1-9b10ad86aaff',
  maxRecipients: 1_000,
} satisfies SmtpCapacity;
export const boundSmtp: SmtpProviderOptions = { ...smtp, smtpCapacity: capacity };

export function dtoVersions(
  command: PreparedEmailCommand,
  job: EmailJobSummary,
  activity: EmailActivity,
): readonly [1, 1, 1, 1] {
  return [command.version, command.snapshot.version, job.version, activity.version];
}

export function rejectSendGridEndpoint() {
  // @ts-expect-error the deployed HTTPS endpoint and transport are not caller options
  return createSendGridProvider({ ...sendgrid, endpoint: 'https://example.invalid/mail' });
}

export function rejectSendGridCapacity() {
  // @ts-expect-error capacity is SMTP-only
  return createSendGridProvider({ ...sendgrid, smtpCapacity: capacity });
}
