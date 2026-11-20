import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { createRequire } from 'node:module';
import * as esm from '@web-ts-toolkit/email-service/smtp';

const require = createRequire(import.meta.url);
const cjs = require('@web-ts-toolkit/email-service/smtp');
assert.equal(require('nodemailer/package.json').version, '10.6.0');

for (const entry of [esm, cjs]) {
  assert(!Object.hasOwn(entry, 'default'));
  const provider = entry.createSmtpProvider({ key: 'smtp', host: 'smtp.example.invalid', tls: 'implicit' });
  const prepared = provider.prepare({
    jobId: randomUUID(),
    attemptId: randomUUID(),
    snapshot: {
      version: 1,
      kind: 'smtp',
      provider: provider.ref,
      template: { key: 'example', revision: 'v1' },
      preparedAt: 1000,
      expiresAt: 2000,
      priority: 0,
      attachments: [],
      correlation: {},
      envelope: {
        from: { address: 'from@example.invalid' },
        to: [],
        cc: [],
        bcc: [{ address: 'bcc@example.invalid' }],
      },
      subject: 'Example',
      text: 'Synthetic content',
    },
    attachments: [],
  });
  // Exercise both emitted factories/composers without contacting any server.
  assert.deepEqual(await prepared.submit({ signal: AbortSignal.abort(), timeoutMs: 500 }), {
    outcome: 'unknown',
    retry: 'never',
    stage: 'connect',
    reason: 'provider_aborted',
  });
}
