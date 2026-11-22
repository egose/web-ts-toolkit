import { Agent, request as httpRequest, type IncomingMessage } from 'node:http';
import { request as httpsRequest } from 'node:https';
import type {
  HttpOperationResponse,
  RequestPolicyFactory,
  StoragePipelineOptions,
  WebResource,
} from '@azure/storage-blob';
import { MESSAGE_LIMITS } from '../../constants';
import type { ManagedAttachmentRequest } from '../backing';

type Headers = Readonly<Record<string, string | null | undefined>>;
export type AzureWireResponse = Readonly<{ status: number; headers: Headers; body: IncomingMessage }>;
export type ActiveAzureRequest = {
  request: ManagedAttachmentRequest;
  method: 'GET' | 'PUT';
  url: string;
  intercepted: boolean;
  response?: AzureWireResponse;
};
type Requests = WeakMap<AbortSignal, ActiveAzureRequest>;
const MAX_HEADER_BYTES = 16_384;

function canonicalAzureUrl(value: string): string {
  const url = new URL(value);
  url.searchParams.sort();
  return url.href;
}

function findRequest(requests: Requests, wire: WebResource): ActiveAzureRequest {
  const signal = wire.abortSignal;
  const active = signal instanceof AbortSignal ? requests.get(signal) : undefined;
  if (!active || active.method !== wire.method || active.url !== canonicalAzureUrl(wire.url)) {
    throw new Error('Untracked Azure attachment request');
  }
  return active;
}

function captureHeaders(body: IncomingMessage): Headers {
  const headers: Record<string, string | null | undefined> = Object.create(null) as Record<string, string | null>;
  for (const [name, values] of Object.entries(body.headersDistinct)) {
    headers[name] = values?.length === 1 ? values[0] : null;
  }
  return headers;
}

function responseForSdk(wire: WebResource, raw: AzureWireResponse): HttpOperationResponse {
  const headers = wire.headers.clone();
  for (const name of headers.headerNames()) headers.remove(name);
  for (const [name, value] of Object.entries(raw.headers)) {
    if (typeof value === 'string') headers.set(name, value);
  }
  if (wire.method === 'GET' && raw.status === 200) {
    return { request: wire, status: raw.status, headers, readableStreamBody: raw.body };
  }
  // Authoritative Azure error codes are headers. No upload ACK or error body needs to be
  // buffered, drained or parsed by the SDK, including on a redirect or bearer challenge.
  raw.body.destroy();
  return { request: wire, status: raw.status, headers };
}

function sendOnce(wire: WebResource, active: ActiveAzureRequest): Promise<HttpOperationResponse> {
  const { request } = active;
  if (!active.intercepted || request.dispatched) throw new Error('Azure attachment dispatch refused');
  const payload: unknown = wire.body;
  const agent: unknown = wire.agent;
  if (
    wire.headers.contains('x-ms-structured-body') ||
    wire.headers.contains('x-ms-structured-content-length') ||
    (wire.method === 'PUT' &&
      (!(payload instanceof Uint8Array) ||
        azureBodyLength(wire.headers.get('content-length')) !== payload.byteLength ||
        wire.headers.get('if-none-match') !== '*' ||
        wire.headers.get('x-ms-blob-type') !== 'BlockBlob' ||
        !wire.headers.get('content-md5'))) ||
    (wire.method === 'GET' &&
      ((payload !== null && payload !== undefined) ||
        wire.headers.contains('range') ||
        wire.headers.contains('x-ms-range'))) ||
    (agent !== undefined && !(agent instanceof Agent))
  ) {
    throw new Error('Unsupported Azure attachment request');
  }
  const url = new URL(wire.url);
  const send = url.protocol === 'https:' ? httpsRequest : httpRequest;
  const headers = wire.headers.toJson();
  return new Promise((resolve, reject) => {
    // At the actual transport boundary, after SDK serialization/auth, and at most once even if
    // SDK policies try to repeat it. The shared signal also covers DNS/headers and the body.
    const timeout = request.begin();
    const native = send(
      url,
      {
        method: wire.method,
        headers,
        signal: request.signal,
        maxHeaderSize: MAX_HEADER_BYTES,
        timeout,
        ...(agent ? { agent } : {}),
      },
      (body) => {
        request.ownStream(body);
        try {
          const raw = { status: body.statusCode ?? 0, headers: captureHeaders(body), body };
          active.response = raw;
          request.check();
          resolve(responseForSdk(wire, raw));
        } catch (error) {
          body.destroy();
          reject(error);
        }
      },
    );
    // Bound by header bytes, not a header count that can silently hide version/metadata fields.
    native.maxHeadersCount = 0;
    request.hold(
      new Promise<void>((closed) =>
        native.once('close', () => {
          closed();
          reject(new Error('Azure attachment request closed before response'));
        }),
      ),
    );
    native.once('error', reject);
    native.once('timeout', () =>
      native.destroy(Object.assign(new Error('Azure request timeout'), { code: 'ETIMEDOUT' })),
    );
    try {
      native.end(payload instanceof Uint8Array ? payload : undefined);
    } catch (error) {
      native.destroy();
      reject(error);
    }
  });
}

export function createAzureAttachmentTransport() {
  const requests: Requests = new WeakMap();
  const policy: RequestPolicyFactory = {
    create: (next) => ({
      async sendRequest(wire) {
        const active = findRequest(requests, wire);
        active.intercepted = true;
        const reply = await next.sendRequest(wire);
        // This is the public compat response, before the SDK can reject missing headers or
        // create its download stream wrapper. Only the original wire stream is accepted.
        if (active.method === 'GET' && reply.status === 200) {
          const raw = active.response;
          if (!raw || reply.readableStreamBody !== raw.body) throw new Error('Untracked Azure attachment body');
          if (
            raw.headers['x-ms-structured-body'] !== undefined ||
            raw.headers['x-ms-structured-content-length'] !== undefined
          ) {
            // This download never negotiates a structured body. Do not let the SDK introduce
            // an intermediate decoder stream whose close the adapter cannot observe.
            throw new Error('Unexpected Azure structured body');
          }
          const length = raw.headers['content-length'];
          if (length !== undefined && azureBodyLength(length) === undefined) {
            throw new Error('Invalid Azure attachment length');
          }
          // The adapter reads and validates this anchor from the raw headers. It is not
          // required for draining existing refs, even if the SDK cannot deserialize it.
          reply.headers.remove('x-ms-creation-time');
        }
        return reply;
      },
    }),
  };
  return {
    policy,
    pipelineOptions: {
      retryOptions: { maxTries: 1 },
      // Unlike the default HTTP client this never buffers non-streaming status codes. It also
      // exposes ClientRequest close (including failures before any response) and fences dispatch
      // *below* the SDK retry, redirect and signing/auth challenge policies.
      httpClient: { sendRequest: async (wire) => sendOnce(wire, findRequest(requests, wire)) },
    } satisfies StoragePipelineOptions,
    track(request: ManagedAttachmentRequest, method: ActiveAzureRequest['method'], url: string): ActiveAzureRequest {
      const active = { request, method, url: canonicalAzureUrl(url), intercepted: false };
      requests.set(request.signal, active);
      return active;
    },
  };
}

export function azureBodyLength(value: string | null | undefined): number | undefined {
  if (typeof value !== 'string' || !/^[1-9]\d{0,6}$/.test(value)) return;
  const size = Number(value);
  if (size <= MESSAGE_LIMITS.attachmentBytes) return size;
}

export function azureVersioned(raw?: AzureWireResponse): boolean {
  return (
    raw?.headers['x-ms-version-id'] !== undefined ||
    raw?.headers['x-ms-is-current-version'] !== undefined ||
    raw?.headers['x-ms-snapshot'] !== undefined
  );
}
