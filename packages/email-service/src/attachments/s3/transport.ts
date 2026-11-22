import { Buffer } from 'node:buffer';
import { Agent as HttpAgent, request as httpRequest, type IncomingMessage } from 'node:http';
import { Agent as HttpsAgent, request as httpsRequest, type AgentOptions } from 'node:https';
import type { GetObjectCommand, S3ClientConfig } from '@aws-sdk/client-s3';
import { MESSAGE_LIMITS } from '../../constants';
import type { ManagedAttachmentRequest } from '../backing';

type Handler = Extract<S3ClientConfig['requestHandler'], { handle: unknown }>;
type WireRequest = Parameters<Handler['handle']>[0];
type WireReply = Awaited<ReturnType<Handler['handle']>>;
type Headers = Readonly<Record<string, string | null | undefined>>;
type Dispatch = 'put' | 'read' | 'lifecycle' | 'versioning';
type ActiveRequest = {
  request: ManagedAttachmentRequest;
  dispatch: Dispatch;
  malformed?: true;
  response?: { status: number; headers: Headers; body: IncomingMessage; document?: string };
};
const MAX_HEADER_BYTES = 16_384;
const CONTROL_BYTES = 16_384;

function captureHeaders(body: IncomingMessage): Headers {
  const headers = Object.create(null) as Record<string, string | null | undefined>;
  for (const [name, values] of Object.entries(body.headersDistinct)) {
    headers[name] = values?.length === 1 ? values[0] : null;
  }
  return headers;
}

async function smallBody(body: IncomingMessage, request: ManagedAttachmentRequest): Promise<Buffer> {
  const bytes = Buffer.allocUnsafe(CONTROL_BYTES);
  let length = 0;
  for await (const chunk of body) {
    request.check();
    if (!(chunk instanceof Uint8Array) || chunk.byteLength > bytes.length - length) {
      // No SDK/XML collector may consume an unbounded response, even on an error.
      body.destroy();
      throw new Error('Invalid S3 attachment response');
    }
    bytes.set(chunk, length);
    length += chunk.byteLength;
  }
  return bytes.subarray(0, length);
}

function escapeQuery(value: string): string {
  return encodeURIComponent(value).replace(/[!'()*]/g, (ch) => `%${ch.charCodeAt(0).toString(16).toUpperCase()}`);
}

function requestTarget(wire: WireRequest): string {
  // Retain the SDK's already serialized (and signed) path. Use Smithy's RFC 3986 query encoding,
  // not URLSearchParams (which can turn a space into '+' or change a bare S3 subresource).
  const query = wire.query ?? {};
  const suffix = Object.keys(query)
    .sort()
    .flatMap((key) => {
      const name = escapeQuery(key);
      const value = query[key];
      if (Array.isArray(value)) return value.map((item) => `${name}=${escapeQuery(item)}`);
      return value == null ? [name] : [`${name}=${escapeQuery(value)}`];
    })
    .join('&');
  return suffix ? `${wire.path}?${suffix}` : wire.path;
}

async function responseForSdk(active: ActiveRequest, body: IncomingMessage): Promise<WireReply> {
  const { request, dispatch } = active;
  const status = body.statusCode ?? 0;
  const headers = captureHeaders(body);
  const raw: NonNullable<ActiveRequest['response']> = { status, headers, body };
  active.response = raw;
  request.check();
  const sdkHeaders: Record<string, string> = Object.create(null) as Record<string, string>;
  const objectRead = dispatch === 'read' && status === 200;
  for (const [name, value] of Object.entries(headers)) {
    // Retention evidence is checked from the raw headers. An invalid anchor cannot block
    // an otherwise exact worker read, and the SDK must not get to choose among duplicates.
    if (typeof value === 'string' && !(objectRead && name === 'last-modified')) sdkHeaders[name] = value;
  }
  const result = objectRead ? body : await smallBody(body, request);
  if (Buffer.isBuffer(result)) raw.document = result.toString('utf8');
  return {
    response: {
      statusCode: status,
      ...(body.statusMessage === undefined ? {} : { reason: body.statusMessage }),
      headers: sdkHeaders,
      body: result,
    },
  };
}

function sendOnce(wire: WireRequest, active: ActiveRequest, http: HttpAgent, https: HttpsAgent): Promise<WireReply> {
  const { request, dispatch } = active;
  const { protocol, hostname, port, method, headers } = wire;
  const payload: unknown = wire.body;
  const put = dispatch === 'put';
  if (
    request.dispatched ||
    (protocol !== 'https:' && protocol !== 'http:') ||
    !hostname ||
    !wire.path.startsWith('/') ||
    /[?#]/.test(wire.path) ||
    wire.username !== undefined ||
    wire.password !== undefined ||
    wire.fragment !== undefined ||
    method !== (put ? 'PUT' : 'GET') ||
    (put
      ? !(payload instanceof Uint8Array) ||
        payload.byteLength < 1 ||
        payload.byteLength > MESSAGE_LIMITS.attachmentBytes ||
        headers['content-length'] !== String(payload.byteLength) ||
        headers['if-none-match'] !== '*' ||
        !headers['x-amz-checksum-sha256']
      : payload != null || headers.range !== undefined)
  ) {
    throw new Error('Unsupported S3 attachment request');
  }
  const send = protocol === 'https:' ? httpsRequest : httpRequest;
  const path = requestTarget(wire);
  return new Promise((resolve, reject) => {
    // Charge this exact dispatch, after SDK endpoint resolution/credentials/signing, against the
    // original operation budget. The same signal covers DNS, headers, and the streamed body.
    const timeout = request.begin();
    const native = send(
      {
        protocol,
        hostname: hostname.startsWith('[') && hostname.endsWith(']') ? hostname.slice(1, -1) : hostname,
        ...(port === undefined ? {} : { port }),
        path,
        method,
        headers,
        signal: request.signal,
        timeout,
        maxHeaderSize: MAX_HEADER_BYTES,
        agent: protocol === 'https:' ? https : http,
      },
      (body) => {
        request.ownStream(body);
        void responseForSdk(active, body).then(resolve, (error: unknown) => {
          body.destroy();
          reject(error);
        });
      },
    );
    // Node's default count limit silently discards fields. Use only its parser's byte cap.
    native.maxHeadersCount = 0;
    request.hold(
      new Promise<void>((closed) => {
        native.once('close', () => {
          closed();
          if (!active.response) reject(new Error('S3 attachment request closed before response'));
        });
      }),
    );
    native.once('error', (error: NodeJS.ErrnoException) => {
      // A parser error (including HPE_HEADER_OVERFLOW) can hide version information. Preserve
      // the native verdict before SDK classification; it is not a dropped ACK to confirm.
      if (error.code?.startsWith('HPE_')) active.malformed = true;
      reject(error);
    });
    native.once('timeout', () =>
      native.destroy(Object.assign(new Error('S3 attachment request timeout'), { code: 'ETIMEDOUT' })),
    );
    try {
      native.end(payload instanceof Uint8Array ? payload : undefined);
    } catch (error) {
      native.destroy();
      reject(error);
    }
  });
}

/** Native-only dispatch below the SDK signing, retry and redirect policies. */
export function createS3AttachmentTransport(ca: AgentOptions['ca']) {
  const active = new WeakMap<AbortSignal, ActiveRequest>();
  const http = new HttpAgent({ keepAlive: true, maxFreeSockets: 8 });
  const https = new HttpsAgent({
    keepAlive: true,
    maxFreeSockets: 8,
    rejectUnauthorized: true,
    ...(ca === undefined ? {} : { ca }),
  });
  let destroyed = false;
  const handler = Object.freeze<Handler>({
    metadata: { handlerProtocol: 'http/1.1' },
    async handle(wire: WireRequest, options?: Parameters<Handler['handle']>[1]) {
      const signal = options?.abortSignal;
      const tracked = signal instanceof AbortSignal ? active.get(signal) : undefined;
      if (!tracked || destroyed) throw new Error('Untracked S3 attachment request');
      return sendOnce(wire, tracked, http, https);
    },
    destroy() {
      destroyed = true;
      http.destroy();
      https.destroy();
    },
    // The SDK can suggest HTTP defaults; the managed deadline and bounds are not configurable.
    updateHttpClientConfig() {},
    httpHandlerConfigs: () => ({}),
  });
  return {
    handler,
    track(request: ManagedAttachmentRequest, dispatch: Dispatch): ActiveRequest {
      const tracked = { request, dispatch };
      active.set(request.signal, tracked);
      return tracked;
    },
  };
}

export function useManagedObjectChecksum(command: GetObjectCommand): void {
  // The store always verifies the exact bytes against its own SHA-256. Avoid the SDK's optional second
  // checksum wrapper (and its own read-ahead/error classification) for this one GetObject command.
  const clearMode: Parameters<GetObjectCommand['middlewareStack']['add']>[0] = (next) => (args) => {
    delete args.input.ChecksumMode;
    return next(args);
  };
  command.middlewareStack.addRelativeTo(clearMode, {
    relation: 'after',
    toMiddleware: 'flexibleChecksumsInputMiddleware',
    name: 'emailManagedAttachmentObjectDigest',
  });
}

export function s3Versioned(headers: Headers | undefined): boolean {
  return headers?.['x-amz-version-id'] !== undefined || headers?.['x-amz-delete-marker'] !== undefined;
}

export function s3Failure(error: unknown, status?: number) {
  const failure = error as { name?: unknown; code?: unknown; $metadata?: { httpStatusCode?: number } } | undefined;
  const name = failure?.name;
  const http = status || failure?.$metadata?.httpStatusCode || 0;
  const transient =
    (http >= 500 && http !== 501 && http !== 505) ||
    http === 408 ||
    http === 429 ||
    NETWORK_FAILURES.has(failure?.code) ||
    TEMPORARY_FAILURES.has(name);
  return { name, http, transient };
}

const NETWORK_FAILURES = new Set<unknown>([
  'EAI_AGAIN',
  'ECONNABORTED',
  'ECONNREFUSED',
  'ECONNRESET',
  'ENETDOWN',
  'ENETUNREACH',
  'EHOSTUNREACH',
  'ENOTFOUND',
  'EPIPE',
  'ETIMEDOUT',
  'ERR_STREAM_PREMATURE_CLOSE',
]);
const TEMPORARY_FAILURES = new Set<unknown>([
  'AbortError',
  'InternalError',
  'RequestTimeout',
  'RequestTimeoutException',
  'ServiceUnavailable',
  'SlowDown',
  'ThrottledException',
  'Throttling',
  'ThrottlingException',
  'TimeoutError',
  'TooManyRequestsException',
]);
