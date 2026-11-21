import type { EmailProvider, SmtpCapacity, SmtpSnapshot } from '@web-ts-toolkit/email-service';
import { createSmtpProvider, type SmtpProviderOptions } from '@web-ts-toolkit/email-service/smtp';

export const config = { key: 'smtp', host: 'smtp.example.invalid', tls: 'starttls' } satisfies SmtpProviderOptions;
export const provider: EmailProvider<SmtpSnapshot> = createSmtpProvider(config);

export function createBoundProfile(smtpCapacity: SmtpCapacity): EmailProvider<SmtpSnapshot> {
  return createSmtpProvider({ ...config, smtpCapacity });
}

// @ts-expect-error the public adapter does not accept Nodemailer transport overrides
createSmtpProvider({ ...config, rejectUnauthorized: false });
