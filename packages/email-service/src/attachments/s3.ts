import { Buffer } from 'node:buffer';
import { Readable } from 'node:stream';
import {
  GetBucketLifecycleConfigurationCommand,
  GetBucketVersioningCommand,
  GetObjectCommand,
  PutObjectCommand,
  S3Client,
  type S3ClientConfig,
} from '@aws-sdk/client-s3';
import { bindMethod } from '../internal/callbacks';
import { invalid, readRecord } from '../internal/validation';
import type { ManagedAttachmentBacking } from './backing';
import {
  decodeManagedCloudMetadata,
  encodeManagedCloudMetadata,
  managedCloudPrefix,
  managedCloudRuleId,
} from './cloud-records';
import type { ManagedAttachmentBindingOptions, ManagedAttachmentStore } from './contracts';
import { managedAttachmentBoundary, readManagedAttachmentBinding } from './records';
import { hasExactS3Lifecycle, isNeverVersionedS3Bucket, s3RetainedThrough, type S3RetentionMode } from './s3/retention';
import { createS3AttachmentTransport, s3Failure, s3Versioned, useManagedObjectChecksum } from './s3/transport';
import { createManagedAttachmentStore } from './store';

declare const managedS3Client: unique symbol;

/** A dedicated SDK client created by this instance of `/attachments/s3`. The caller owns `destroy()`. */
export type S3AttachmentClient = S3Client & { readonly [managedS3Client]: true };

/** Connection and signing settings for a dedicated managed SDK client, not per-job values. */
export type S3AttachmentClientConfig = Readonly<{
  region: NonNullable<S3ClientConfig['region']>;
  credentials: NonNullable<S3ClientConfig['credentials']>;
  /** Optional absolute service URL for a qualified endpoint; no credentials, query or fragment. */
  endpoint?: string;
  forcePathStyle?: boolean;
  useDualstackEndpoint?: boolean;
  useFipsEndpoint?: boolean;
  /** Optional PEM certificate authorities for HTTPS; TLS verification is always enabled. */
  ca?: string | Uint8Array | readonly (string | Uint8Array)[];
}>;

export type S3AttachmentStoreOptions = ManagedAttachmentBindingOptions &
  Readonly<{
    /** Literal general-purpose bucket name, not a URL, ARN, access point or directory bucket. */
    bucket: string;
    /** Dedicated slash-delimited prefix including the final `/`. */
    prefix: string;
    /**
     * `expiration-header` (default) requires the matching S3 object expiration header.
     * `bucket-policy` additionally reads exact lifecycle/versioning configuration at upload;
     * only this explicit mode may omit the header. Workers always use exact-object GET only.
     */
    retention?: S3RetentionMode;
  }>;

const clients = new WeakMap<
  S3AttachmentClient,
  { transport: ReturnType<typeof createS3AttachmentTransport>; send: S3Client['send'] }
>();

function certificate(value: unknown): string | Buffer {
  if (typeof value === 'string' && value.length > 0) return value;
  if (value instanceof Uint8Array && value.byteLength > 0) return Buffer.from(value);
  return invalid('invalid_config');
}

/**
 * Create a dedicated, caller-owned Node `S3Client` with the required managed-attachment transport.
 * Uses `maxAttempts: 1` and `followRegionRedirects: false`; no configured endpoint from the SDK
 * environment is used in place of the explicit endpoint or regional AWS endpoint. This makes no
 * requests. Supply credentials (or a bounded credential provider) and use a separate SDK client for
 * provisioning and other operations. Destroy this client after its stores are done.
 */
export function createS3AttachmentClient(config: S3AttachmentClientConfig): S3AttachmentClient {
  const code = 'invalid_config';
  const raw = readRecord(
    config,
    ['region', 'credentials'],
    ['endpoint', 'forcePathStyle', 'useDualstackEndpoint', 'useFipsEndpoint', 'ca'],
    code,
  );
  const { region, credentials, endpoint, forcePathStyle, useDualstackEndpoint, useFipsEndpoint, ca } = raw;
  if (
    !((typeof region === 'string' && region.length > 0) || typeof region === 'function') ||
    !((typeof credentials === 'object' && credentials !== null) || typeof credentials === 'function') ||
    (endpoint !== undefined &&
      (typeof endpoint !== 'string' || !/^https?:\/\//i.test(endpoint) || /[?#]/.test(endpoint))) ||
    [forcePathStyle, useDualstackEndpoint, useFipsEndpoint].some(
      (flag) => flag !== undefined && typeof flag !== 'boolean',
    )
  ) {
    invalid(code);
  }
  try {
    if (typeof endpoint === 'string') {
      const url = new URL(endpoint);
      if (!url.hostname || url.username || url.password) invalid(code);
    }
    const trust = ca === undefined ? undefined : Array.isArray(ca) ? Array.from(ca, certificate) : certificate(ca);
    const transport = createS3AttachmentTransport(trust);
    const client = new S3Client({
      region: region as S3AttachmentClientConfig['region'],
      credentials: credentials as S3AttachmentClientConfig['credentials'],
      ...(typeof endpoint === 'string' ? { endpoint } : {}),
      ...(typeof forcePathStyle === 'boolean' ? { forcePathStyle } : {}),
      ...(typeof useDualstackEndpoint === 'boolean' ? { useDualstackEndpoint } : {}),
      ...(typeof useFipsEndpoint === 'boolean' ? { useFipsEndpoint } : {}),
      requestHandler: transport.handler,
      maxAttempts: 1,
      retryMode: 'standard',
      followRegionRedirects: false,
      expectContinueHeader: false,
      ignoreConfiguredEndpointUrls: true,
    }) as S3AttachmentClient;
    if (client.config.requestHandler !== transport.handler) invalid(code);
    clients.set(client, { transport, send: bindMethod<S3Client['send']>(client, 'send') });
    return client;
  } catch {
    return invalid(code);
  }
}

/**
 * Bind a client from `createS3AttachmentClient` (the same ESM or CommonJS entry instance) to one
 * immutable managed attachment prefix. For a qualified compatible endpoint, configure its endpoint
 * and addressing on the client and explicitly select the store's retention proof mode.
 */
export function createS3AttachmentStore(
  client: S3AttachmentClient,
  options: S3AttachmentStoreOptions,
): ManagedAttachmentStore {
  const raw = readRecord(options, ['resolverKey', 'namespace', 'bucket', 'prefix'], ['retention'], 'invalid_config');
  const binding = readManagedAttachmentBinding({ resolverKey: raw.resolverKey, namespace: raw.namespace });
  const { bucket, retention = 'expiration-header' } = raw;
  if (
    typeof bucket !== 'string' ||
    !/^[a-z0-9][a-z0-9-]{1,61}[a-z0-9]$/.test(bucket) ||
    /(?:-s3alias|--ol-s3|--x-s3|--table-s3|--vector-s3)$/.test(bucket) ||
    (retention !== 'expiration-header' && retention !== 'bucket-policy')
  ) {
    invalid('invalid_config');
  }
  const prefix = managedCloudPrefix(raw.prefix);
  const boundary = prefix + managedAttachmentBoundary(binding.namespace);
  const ruleId = managedCloudRuleId(binding.namespace);
  const dedicated = clients.get(client);
  if (!dedicated || client.config?.requestHandler !== dedicated.transport.handler) invalid('invalid_config');
  const { transport, send } = dedicated;
  function checkedSender(): typeof send {
    if (client.config?.requestHandler !== transport.handler) invalid('store_incompatible');
    return send;
  }
  const backing: ManagedAttachmentBacking = {
    async create({ metadata, bytes }, request) {
      const command = new PutObjectCommand({
        Bucket: bucket,
        Key: prefix + metadata.key,
        IfNoneMatch: '*',
        ContentType: metadata.contentType,
        ContentLength: metadata.byteLength,
        ChecksumSHA256: Buffer.from(metadata.sha256, 'hex').toString('base64'),
        Metadata: encodeManagedCloudMetadata(metadata),
        Body: bytes,
      });
      const wire = transport.track(request, 'put');
      try {
        const ack = await checkedSender()(command, { abortSignal: request.signal });
        if (wire.malformed || !wire.response || ack.VersionId !== undefined || s3Versioned(wire.response.headers)) {
          return { status: 'incompatible' };
        }
      } catch (error) {
        request.check();
        if (wire.malformed || s3Versioned(wire.response?.headers)) return { status: 'incompatible' };
        const { http, transient } = s3Failure(error, wire.response?.status);
        if (!request.dispatched) return { status: transient ? 'unavailable' : 'incompatible' };
        if (!transient && http >= 300 && http !== 409 && http !== 412) {
          return { status: 'incompatible' };
        }
      }
      // Even a clean PutObject ACK requires one exact, bounded body proof. Never re-create in this call.
      return { status: 'confirm' };
    },
    async read(key, request) {
      const command = new GetObjectCommand({ Bucket: bucket, Key: prefix + key });
      useManagedObjectChecksum(command);
      const wire = transport.track(request, 'read');
      try {
        const reply = await checkedSender()(command, { abortSignal: request.signal });
        if (reply.Body instanceof Readable) request.ownStream(reply.Body);
        request.check();
        const response = wire.response;
        if (
          wire.malformed ||
          !response ||
          reply.VersionId !== undefined ||
          s3Versioned(response.headers) ||
          response.status !== 200 ||
          response.headers['content-range'] !== undefined ||
          reply.Body !== response.body
        ) {
          return { status: 'incompatible' };
        }
        const headers = response.headers;
        if (headers['x-amz-missing-meta'] !== undefined && headers['x-amz-missing-meta'] !== '0') {
          return { status: 'invalid' };
        }
        const rawMetadata: Record<string, unknown> = Object.create(null) as Record<string, unknown>;
        for (const [name, value] of Object.entries(headers)) {
          if (name.startsWith('x-amz-meta-')) rawMetadata[name.slice('x-amz-meta-'.length)] = value;
        }
        const length = headers['content-length'];
        if (length !== undefined && (length === null || !/^[0-9]{1,16}$/.test(length))) return { status: 'invalid' };
        const metadata = decodeManagedCloudMetadata(rawMetadata, key, headers['content-type']);
        const retainedThrough = s3RetainedThrough(
          headers['last-modified'],
          headers['x-amz-expiration'],
          ruleId,
          retention,
        );
        return {
          status: 'found',
          metadata,
          body: response.body,
          ...(length === undefined ? {} : { transportLength: Number(length) }),
          ...(retainedThrough === undefined ? {} : { retainedThrough }),
        };
      } catch (error) {
        request.check();
        if (wire.malformed || s3Versioned(wire.response?.headers)) return { status: 'incompatible' };
        const { name, http, transient } = s3Failure(error, wire.response?.status);
        if (http === 404 && name === 'NoSuchKey') return { status: 'missing' };
        if (transient || (http === 404 && name === 'NotFound') || (http === 403 && name === 'AccessDenied')) {
          return { status: 'unavailable' };
        }
        return { status: http === 200 ? 'invalid' : 'incompatible' };
      }
    },
    ...(retention === 'bucket-policy'
      ? {
          async verifyRetentionPolicy(op) {
            const exactRule = await op.request(async (request) => {
              const command = new GetBucketLifecycleConfigurationCommand({ Bucket: bucket });
              const wire = transport.track(request, 'lifecycle');
              await checkedSender()(command, { abortSignal: request.signal });
              return (
                !wire.malformed &&
                wire.response?.status === 200 &&
                !s3Versioned(wire.response.headers) &&
                hasExactS3Lifecycle(wire.response.document, boundary, ruleId)
              );
            });
            if (!exactRule) return false;
            return op.request(async (request) => {
              const command = new GetBucketVersioningCommand({ Bucket: bucket });
              const wire = transport.track(request, 'versioning');
              await checkedSender()(command, { abortSignal: request.signal });
              return (
                !wire.malformed &&
                wire.response?.status === 200 &&
                !s3Versioned(wire.response.headers) &&
                isNeverVersionedS3Bucket(wire.response.document)
              );
            });
          },
        }
      : {}),
  };
  return createManagedAttachmentStore(binding, backing);
}
