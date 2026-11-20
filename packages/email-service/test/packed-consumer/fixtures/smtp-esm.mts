import type { EmailProvider, SmtpSnapshot } from '@web-ts-toolkit/email-service';
import { createSmtpProvider, type SmtpProviderOptions } from '@web-ts-toolkit/email-service/smtp';

export const config = { key: 'smtp', host: 'smtp.example.invalid', tls: 'starttls' } satisfies SmtpProviderOptions;
export const provider: EmailProvider<SmtpSnapshot> = createSmtpProvider(config);

// @ts-expect-error the public adapter does not accept Nodemailer transport overrides
createSmtpProvider({ ...config, rejectUnauthorized: false });
