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

function createAdmin(store: email.EmailStore): email.EmailAdmin {
  return email.createEmailAdmin({ scope: 'example', store });
}

// @ts-expect-error sandbox is only supported on SendGrid
const wrongMode: email.ProviderRef = { kind: 'smtp', key: 'local', mode: 'sandbox' };

export = { code, smtp, sendgrid, mailSend, memory, boundSmtp, dtoVersion, createBatch, createAdmin, wrongMode };
