import type { S3Client } from '@aws-sdk/client-s3';
// eslint-disable-next-line @typescript-eslint/no-require-imports
import s3 = require('@web-ts-toolkit/email-service/attachments/s3');

function bind(raw: S3Client, config: s3.S3AttachmentClientConfig, options: s3.S3AttachmentStoreOptions) {
  const dedicated: s3.S3AttachmentClient = s3.createS3AttachmentClient(config);
  const client: S3Client = dedicated;
  const store = s3.createS3AttachmentStore(dedicated, options);
  // @ts-expect-error Only the dedicated managed client proves complete headers and native close.
  s3.createS3AttachmentStore(raw, options);
  // @ts-expect-error Builder configuration cannot substitute a request handler or retry policy.
  s3.createS3AttachmentClient({ ...config, requestHandler: {}, maxAttempts: 2 });
  return { client, store };
}

export = { bind };
