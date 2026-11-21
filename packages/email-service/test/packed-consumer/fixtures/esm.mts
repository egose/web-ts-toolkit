import {
  createEmailAdmin,
  createEmailBatchService,
  EmailError,
  type EmailBatchItem,
  type EmailBatchResult,
  type EmailActivity,
  type EmailActivityPage,
  type EmailAdmin,
  type EmailCommand,
  type EmailErrorCode,
  type EmailJobSummary,
  type EmailProvider,
  type EmailService,
  type EmailStore,
  type EmailWorker,
  type LocalTemplate,
  type PreparedEmailCommand,
  type ProviderResult,
  type SendGridSnapshot,
  type SendGridTemplate,
  type SmtpCapacity,
  type TemplateDefinitions,
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
// @ts-expect-error an SMTP provider cannot render a SendGrid template
export const wrongProvider: EmailCommand<Templates> = { ...reminder, provider: receipt.provider };
// @ts-expect-error provider results cannot claim a worker-only stage
export const wrongStage: ProviderResult['stage'] = 'pre_handoff';

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
