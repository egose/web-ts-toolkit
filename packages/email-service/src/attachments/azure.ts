import { createHash } from 'node:crypto';
import { Readable } from 'node:stream';
import { ContainerClient, newPipeline, type StoragePipelineOptions } from '@azure/storage-blob';
import { bindMethod } from '../internal/callbacks';
import { invalid, readRecord } from '../internal/validation';
import {
  azureBodyLength,
  azureVersioned,
  createAzureAttachmentTransport,
  type AzureWireResponse,
} from './azure/transport';
import type { ManagedAttachmentBacking } from './backing';
import {
  decodeManagedCloudMetadata,
  encodeManagedCloudMetadata,
  managedCloudHold,
  managedCloudPrefix,
} from './cloud-records';
import type { ManagedAttachmentBindingOptions, ManagedAttachmentStore } from './contracts';
import { createManagedAttachmentOperations } from './operations';
import { MANAGED_ATTACHMENT_CLOCK_GUARD_MS, readManagedAttachmentBinding } from './records';
import { createManagedAttachmentStore } from './store';

export type AzureAttachmentStoreOptions = ManagedAttachmentBindingOptions &
  Readonly<{
    /** Dedicated slash-delimited blob prefix, including the final `/`. */
    prefix: string;
  }>;

const clients = new WeakMap<ContainerClient, ReturnType<typeof createAzureAttachmentTransport>['track']>();
const SELECTORS = new Set(['snapshot', 'versionid', 'comp', 'restype', 'rscc', 'rscd', 'rsce', 'rscl', 'rsct']);

/**
 * Create a dedicated, caller-owned Node `ContainerClient` with the required managed-attachment transport.
 * Supply the private container's primary HTTPS URL and your SDK credential, or a SAS URL without response overrides.
 * Plain HTTP is supported only for a `127.0.0.1/<account>/<container>` emulator.
 * This configures a fresh pipeline before client construction; no connection or account check is made.
 * Pass the result to `createAzureAttachmentStore`; use separate clients for other SDK operations.
 */
export function createAzureAttachmentContainerClient(
  url: string,
  credential?: Parameters<typeof newPipeline>[0],
  options: Pick<StoragePipelineOptions, 'audience' | 'proxyOptions' | 'userAgentOptions'> = {},
): ContainerClient {
  try {
    const parsed = new URL(url);
    const loopback = parsed.hostname === '127.0.0.1';
    const [hostAccount, hostService] = parsed.hostname.split('.');
    if (
      (parsed.protocol !== 'https:' && !(parsed.protocol === 'http:' && loopback)) ||
      (hostService === 'blob' && hostAccount?.endsWith('-secondary')) ||
      parsed.username ||
      parsed.password ||
      parsed.href.includes('#') ||
      [...parsed.searchParams.keys()].some((field) => SELECTORS.has(field.toLowerCase()))
    ) {
      invalid('invalid_config');
    }
    // The SDK extracts a container name even from a blob URL, but then appends the actual blob
    // key to the entire path. Do not let an implicit prefix escape the operator's audited boundary.
    const path = parsed.pathname.replace(/\/$/, '').slice(1).split('/');
    const name = path.at(-1);
    if (
      path.length !== (loopback ? 2 : 1) ||
      (loopback && !/^[a-z0-9]{3,24}$/.test(path[0] ?? '')) ||
      !name ||
      !/^[a-z0-9][a-z0-9-]{1,61}[a-z0-9]$/.test(name) ||
      name.includes('--')
    ) {
      invalid('invalid_config');
    }
    const transport = createAzureAttachmentTransport();
    const { audience, proxyOptions, userAgentOptions } = options;
    const pipeline = newPipeline(credential, {
      ...(audience === undefined ? {} : { audience }),
      ...(proxyOptions === undefined ? {} : { proxyOptions }),
      ...(userAgentOptions === undefined ? {} : { userAgentOptions }),
      ...transport.pipelineOptions,
    });
    pipeline.factories.push(transport.policy);
    const client = new ContainerClient(parsed.href, pipeline);
    if (client.containerName !== name) invalid('invalid_config');
    clients.set(client, transport.track);
    return client;
  } catch {
    return invalid('invalid_config');
  }
}

const NETWORK = new Set<unknown>([
  'EAI_AGAIN',
  'ECONNABORTED',
  'ECONNREFUSED',
  'ECONNRESET',
  'EHOSTUNREACH',
  'ENETDOWN',
  'ENETUNREACH',
  'ENOTFOUND',
  'EPIPE',
  'ETIMEDOUT',
  'ERR_STREAM_PREMATURE_CLOSE',
]);

function failure(error: unknown, raw?: AzureWireResponse) {
  const native = error as { code?: unknown; name?: unknown } | undefined;
  const status = raw?.status ?? 0;
  const code = raw?.headers['x-ms-error-code'];
  const transient =
    status === 408 ||
    status === 429 ||
    (status >= 500 && status !== 501 && status !== 505) ||
    (!raw && (NETWORK.has(native?.code) || native?.name === 'AbortError'));
  return { status, code, transient };
}

function retainedThrough(raw: AzureWireResponse, writerNow: () => number) {
  const { 'x-ms-creation-time': createdOn, 'x-ms-access-tier': tier } = raw.headers;
  if (typeof createdOn !== 'string' || (tier !== undefined && tier !== 'Hot')) return;
  const date = new Date(createdOn);
  const anchor = date.getTime();
  if (date.toUTCString() !== createdOn || anchor > writerNow() + MANAGED_ATTACHMENT_CLOCK_GUARD_MS) return;
  return managedCloudHold(anchor);
}

/**
 * Bind a caller-owned client from `createAzureAttachmentContainerClient` to one immutable blob prefix.
 * Before enabling producers, audit the effective Azure account settings and the exact 32-day,
 * creation-age-only lifecycle rule on `container/prefix/ma1/namespace/`. This data-plane adapter does
 * not verify account policy or detect drift. Workers can use independent clients with read-only access.
 */
export function createAzureAttachmentStore(
  container: ContainerClient,
  options: AzureAttachmentStoreOptions,
): ManagedAttachmentStore {
  const raw = readRecord(options, ['resolverKey', 'namespace', 'prefix'], [], 'invalid_config');
  const binding = readManagedAttachmentBinding({ resolverKey: raw.resolverKey, namespace: raw.namespace });
  const prefix = managedCloudPrefix(raw.prefix);
  const track = clients.get(container);
  if (!track) invalid('invalid_config');
  const getBlock = bindMethod<ContainerClient['getBlockBlobClient']>(container, 'getBlockBlobClient');
  const getBlob = bindMethod<ContainerClient['getBlobClient']>(container, 'getBlobClient');
  const operations = createManagedAttachmentOperations();
  const backing: ManagedAttachmentBacking = {
    async create({ metadata, bytes }, request) {
      const blob = getBlock(prefix + metadata.key);
      const wire = track(request, 'PUT', blob.url);
      try {
        const ack = await blob.upload(bytes, metadata.byteLength, {
          abortSignal: request.signal,
          conditions: { ifNoneMatch: '*' },
          blobHTTPHeaders: { blobContentType: metadata.contentType },
          metadata: encodeManagedCloudMetadata(metadata),
          contentChecksumAlgorithm: 'Customized',
          transactionalContentMD5: createHash('md5').update(bytes).digest(),
        });
        if (!request.dispatched || ack.versionId !== undefined || azureVersioned(wire.response)) {
          return { status: 'incompatible' };
        }
      } catch (error) {
        request.check();
        if (azureVersioned(wire.response)) return { status: 'incompatible' };
        const { status, code, transient } = failure(error, wire.response);
        if (!request.dispatched) return { status: transient ? 'unavailable' : 'incompatible' };
        if (!transient && status >= 300 && status !== 412 && !(status === 409 && code === 'BlobAlreadyExists')) {
          return { status: 'incompatible' };
        }
      }
      // Even a clean ACK requires exactly one strong body read; no retries, probing versions or deletes.
      return { status: 'confirm' };
    },
    async read(key, request) {
      const blob = getBlob(prefix + key);
      const wire = track(request, 'GET', blob.url);
      try {
        const reply = await blob.download(0, undefined, {
          abortSignal: request.signal,
          contentChecksumAlgorithm: 'Customized',
          maxRetryRequests: 0,
        });
        const body = reply.readableStreamBody;
        if (body instanceof Readable) request.ownStream(body);
        request.check();
        const response = wire.response;
        if (!response || response.status !== 200 || azureVersioned(response) || reply.versionId !== undefined) {
          return { status: 'incompatible' };
        }
        const { headers } = response;
        const length = azureBodyLength(headers['content-length']);
        if (
          !(body instanceof Readable) ||
          headers['content-range'] !== undefined ||
          headers['content-encoding'] !== undefined ||
          headers['x-ms-blob-type'] !== 'BlockBlob' ||
          !headers.etag ||
          length === undefined ||
          reply.contentLength !== length
        ) {
          return { status: 'invalid' };
        }
        const metadata: Record<string, unknown> = Object.create(null) as Record<string, unknown>;
        for (const [name, value] of Object.entries(headers)) {
          if (name.startsWith('x-ms-meta-')) metadata[name.slice('x-ms-meta-'.length)] = value;
        }
        const hold = retainedThrough(response, operations.wallNow);
        return {
          status: 'found',
          body,
          metadata: decodeManagedCloudMetadata(metadata, key, headers['content-type']),
          transportLength: length,
          ...(hold === undefined ? {} : { retainedThrough: hold }),
        };
      } catch (error) {
        request.check();
        if (azureVersioned(wire.response)) return { status: 'incompatible' };
        const { status, code, transient } = failure(error, wire.response);
        if (status === 404 && code === 'BlobNotFound') return { status: 'missing' };
        if (transient) return { status: 'unavailable' };
        return { status: status === 200 ? 'invalid' : 'incompatible' };
      }
    },
  };
  return createManagedAttachmentStore(binding, backing, operations);
}
