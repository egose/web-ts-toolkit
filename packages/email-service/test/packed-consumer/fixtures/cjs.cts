// Native TypeScript CommonJS syntax also forces the require declaration condition.
// eslint-disable-next-line @typescript-eslint/no-require-imports
import email = require('@web-ts-toolkit/email-service');
// eslint-disable-next-line @typescript-eslint/no-require-imports
import sendgridEntry = require('@web-ts-toolkit/email-service/sendgrid');
import type { SmtpProviderOptions } from '@web-ts-toolkit/email-service/smtp';

const code: email.EmailErrorCode = new email.EmailError('invalid_command').code;
const smtp: SmtpProviderOptions = { key: 'local', host: 'smtp.example.test', tls: 'implicit' };
const sendgrid: sendgridEntry.SendGridProviderOptions = { key: 'test', apiKey: 'synthetic-key' };
const mailSend: email.EmailProvider<email.SendGridSnapshot> = sendgridEntry.createSendGridProvider(sendgrid);
const smtpCapacity: email.SmtpCapacity = {
  format: 'smtp-v2',
  namespace: '7b1fca1c-a711-46c5-a950-6cc1594f5a3d',
  maxRecipients: 51,
};
const memory: email.EmailStore = email.createMemoryEmailStore({ smtpCapacity });
const boundSmtp: SmtpProviderOptions = { ...smtp, smtpCapacity };

function dtoVersion(
  row: email.EmailSnapshot | email.PreparedEmailCommand | email.EmailJobSummary | email.EmailActivity,
): 1 {
  return row.version;
}

function createBatch<T extends email.TemplateMap>(service: email.EmailService<T>, worker: email.EmailWorker) {
  return email.createEmailBatchService({ service, worker });
}

type Templates = {
  welcome: email.LocalTemplate<string, { name: string }>;
  reminder: email.SendGridTemplate<{ hours: number }, { hours: number }>;
};

function admissionOnly(service: email.EmailService<Templates>, staged: email.PreparedEmailCommand) {
  const { scope, enqueue } = service;
  const options: email.EmailBatchAdmissionOptions<Templates> = { service: { scope, enqueue } };
  const batch = email.createEmailBatchAdmission(options);
  const relayOptions: email.EmailRelayOptions = { scope, store: memory, smtpCapacity };
  const relay = email.createEmailRelay(relayOptions);
  void relay.enqueuePrepared(staged);
  // @ts-expect-error No worker or `run` is exposed to a producer-only batch.
  void batch.run();
  // @ts-expect-error A registry is not part of the relay options.
  email.createEmailRelay({ ...relayOptions, registry: email.createEmailTemplateRegistry({}) });
  return { batch, relay } satisfies { batch: email.EmailBatchAdmission<Templates>; relay: email.EmailRelay };
}

function checkTemplateCommands(
  acceptShared: (command: email.TemplateCommand<email.TemplateMap>) => void,
  acceptConcrete: (command: email.TemplateCommand<Templates>) => void,
) {
  const welcome = {
    templateKey: 'welcome',
    input: 'Example',
    intent: { name: 'Example' },
    provider: { kind: 'smtp', key: 'local', mode: 'live' },
  } satisfies email.TemplateCommand<Templates>;
  const reminder = {
    templateKey: 'reminder',
    input: { hours: 2 },
    intent: { hours: 2 },
    provider: { kind: 'sendgrid', key: 'test', mode: 'sandbox' },
  } satisfies email.TemplateCommand<Templates>;

  acceptShared(welcome);
  acceptShared(reminder);
  acceptShared({ ...reminder, provider: { ...reminder.provider, mode: 'live' } });
  // @ts-expect-error SMTP cannot use sandbox mode, even with a widened map.
  acceptShared({ ...welcome, provider: { ...welcome.provider, mode: 'sandbox' } });
  // @ts-expect-error SendGrid still only supports live and sandbox modes.
  acceptShared({ ...reminder, provider: { ...reminder.provider, mode: 'preview' } });
  // @ts-expect-error A local key still needs its own input type.
  acceptConcrete({ ...welcome, input: reminder.input });
  // @ts-expect-error A hosted key still needs its own input type.
  acceptConcrete({ ...reminder, input: welcome.input });
  // @ts-expect-error A local key still needs SMTP, not SendGrid.
  acceptConcrete({ ...welcome, provider: { ...reminder.provider, mode: 'live' } });
  // @ts-expect-error A hosted key still needs SendGrid, not SMTP.
  acceptConcrete({ ...reminder, provider: welcome.provider });
}

function createAdmin(store: email.EmailStore): email.EmailAdmin {
  return email.createEmailAdmin({ scope: 'example', store });
}

// @ts-expect-error sandbox is only supported on SendGrid
const wrongMode: email.ProviderRef = { kind: 'smtp', key: 'local', mode: 'sandbox' };

const to = { group: 'to', index: 0, status: 'accepted' } as const;
const cc = { group: 'cc', index: 0, status: 'rejected' } as const;
const smtpAccepted = {
  outcome: 'accepted',
  retry: 'never',
  stage: 'data',
  reason: 'smtp_accepted',
  recipients: [to],
} as const satisfies email.ProviderResult;
const throttle = { outcome: 'rejected', retry: 'safe_transient', stage: 'http', reason: 'sendgrid_throttled' } as const;
const recipients: readonly email.RecipientResult[] = [to, cc];
const providerResults = [
  smtpAccepted,
  email.createSmtpAcceptanceResult(recipients),
  { outcome: 'accepted', retry: 'never', stage: 'http', reason: 'sendgrid_accepted' },
  { outcome: 'validated', retry: 'never', stage: 'http', reason: 'sendgrid_validated' },
  { ...throttle, retryHint: { delayMs: 200, notBefore: 0 } },
] satisfies readonly email.ProviderResult[];

const providerAborted = {
  reason: 'provider_aborted',
  outcome: 'unknown',
  stage: 'connect',
  retry: 'never',
} satisfies Extract<email.ProviderResult, { reason: 'provider_aborted' }>;

const smtpPartial = { ...smtpAccepted, reason: 'smtp_partial', outcome: 'partially_accepted' } as const;

function rejectInvalidEvidence(check: (result: email.ProviderResult) => void) {
  // @ts-expect-error SMTP full acceptance requires recipients
  check({ outcome: 'accepted', retry: 'never', stage: 'data', reason: 'smtp_accepted' });
  // @ts-expect-error SMTP partial acceptance also requires recipients
  check({ outcome: 'partially_accepted', retry: 'never', stage: 'data', reason: 'smtp_partial' });
  // @ts-expect-error an explicit empty list does not prove full acceptance
  check({ ...smtpAccepted, recipients: [] });
  // @ts-expect-error a partial result needs both statuses, proved by the checked constructor
  check({ ...smtpPartial, recipients: [to, { ...to, index: 1 }] });
  // @ts-expect-error rejecting every recipient is not partial acceptance
  check({ ...smtpPartial, recipients: [cc, { ...cc, index: 1 }] });
  // @ts-expect-error SendGrid throttling requires safe_transient
  check({ ...throttle, retry: 'never' });
  // @ts-expect-error a throttled submission was rejected, not left unsubmitted
  check({ ...throttle, outcome: 'unsubmitted' });
  // @ts-expect-error the smtp_accepted reason cannot use the HTTP stage
  check({ ...smtpAccepted, stage: 'http' });
  // @ts-expect-error providerMessageId is only compatible with SendGrid live acceptance
  check({ ...smtpAccepted, providerMessageId: 'synthetic-id' });
}

function rejectInvalidConstruction(result: ReturnType<typeof email.createSmtpAcceptanceResult>) {
  // @ts-expect-error a normalized recipient index must be a number
  email.createSmtpAcceptanceResult([{ ...to, index: '0' }]);
  // @ts-expect-error an optional SMTP message id must be a string
  email.createSmtpAcceptanceResult([to], 1);
  // @ts-expect-error checked result lists are readonly
  result.recipients[0] = to;
  // @ts-expect-error checked recipients are readonly too
  result.recipients[0].status = 'rejected';
}

export = {
  code,
  smtp,
  sendgrid,
  mailSend,
  memory,
  boundSmtp,
  dtoVersion,
  createBatch,
  admissionOnly,
  checkTemplateCommands,
  createAdmin,
  wrongMode,
  providerResults,
  providerAborted,
  rejectInvalidEvidence,
  rejectInvalidConstruction,
};
