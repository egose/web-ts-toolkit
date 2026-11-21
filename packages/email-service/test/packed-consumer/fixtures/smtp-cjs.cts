// eslint-disable-next-line @typescript-eslint/no-require-imports
import smtp = require('@web-ts-toolkit/email-service/smtp');
import type { EmailProvider, SmtpCapacity, SmtpSnapshot } from '@web-ts-toolkit/email-service';

const config: smtp.SmtpProviderOptions = { key: 'smtp', host: 'smtp.example.invalid', tls: 'implicit' };
const provider: EmailProvider<SmtpSnapshot> = smtp.createSmtpProvider(config);
function createBoundProfile(smtpCapacity: SmtpCapacity): EmailProvider<SmtpSnapshot> {
  return smtp.createSmtpProvider({ ...config, smtpCapacity });
}
export = { provider, createBoundProfile };
