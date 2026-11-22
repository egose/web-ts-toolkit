import type { S3Client } from '@aws-sdk/client-s3';
import {
  createS3AttachmentClient,
  createS3AttachmentStore,
  type S3AttachmentClient,
  type S3AttachmentClientConfig,
  type S3AttachmentStoreOptions,
} from '@web-ts-toolkit/email-service/attachments/s3';

export function bind(raw: S3Client, config: S3AttachmentClientConfig, options: S3AttachmentStoreOptions) {
  const dedicated: S3AttachmentClient = createS3AttachmentClient(config);
  const client: S3Client = dedicated;
  const store = createS3AttachmentStore(dedicated, options);
  // @ts-expect-error Only the dedicated managed client proves complete headers and native close.
  createS3AttachmentStore(raw, options);
  // @ts-expect-error Builder configuration cannot substitute a request handler or retry policy.
  createS3AttachmentClient({ ...config, requestHandler: {}, maxAttempts: 2 });
  return { client, store };
}
