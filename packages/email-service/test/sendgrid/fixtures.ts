import { createHash, randomUUID } from 'node:crypto';
import { once } from 'node:events';
import type { ClientRequest, IncomingMessage } from 'node:http';
import { createServer, request, type RequestOptions, type ServerOptions } from 'node:https';
import type { Server, Socket } from 'node:net';
import { connect, type ConnectionOptions, type TLSSocket } from 'node:tls';
import type { ProviderCall, ProviderSubmission, SendGridSnapshot } from '../../src';
import { SENDGRID_REQUEST_MAX_BYTES } from '../../src/constants';
import type { SendGridIo } from '../../src/providers/sendgrid/submit';
import type { SendGridProviderOptions } from '../../src/sendgrid';
import { latch, LOOPBACK } from '../smtp/loopback';

export const PROFILE = { key: 'transactional', apiKey: 'synthetic-mail-token' } satisfies SendGridProviderOptions;
export const TEMPLATE_ID = 'd-0123456789abcdeffedcba9876543210';

export function attachment(bytes: Uint8Array, filename = 'packet.bin', contentType = 'application/octet-stream') {
  return {
    bytes,
    ref: {
      resolverKey: 'test',
      id: filename === 'packet.bin' ? 'packet' : 'note',
      version: 'v1',
      filename,
      contentType,
      byteLength: bytes.length,
      sha256: createHash('sha256').update(bytes).digest('hex'),
    },
  };
}

export function submission(
  settings: Partial<SendGridSnapshot> = {},
  attachments: ProviderSubmission<SendGridSnapshot>['attachments'] = [],
): ProviderSubmission<SendGridSnapshot> {
  return {
    jobId: randomUUID(),
    attemptId: randomUUID(),
    snapshot: {
      version: 1,
      kind: 'sendgrid',
      provider: { kind: 'sendgrid', key: PROFILE.key, mode: 'live' },
      template: { key: 'fixture', revision: 'v1' },
      envelope: {
        from: { address: 'From@Example.INVALID' },
        to: [{ address: 'To@Example.INVALID' }],
        cc: [],
        bcc: [],
      },
      templateId: TEMPLATE_ID,
      data: { name: 'Example' },
      preparedAt: 10_000,
      expiresAt: 20_000,
      priority: 0,
      attachments: attachments.map(({ ref }) => ref),
      correlation: { trace: 'not-sent-to-provider' },
      ...settings,
    },
    attachments,
  };
}

export function call(timeoutMs = 3_000, signal: AbortSignal = new AbortController().signal): ProviderCall {
  return { timeoutMs, signal };
}

export async function listen(server: Server) {
  const peers: { closed: Promise<void> }[] = [];
  const sockets = new Set<Socket>();
  server.on('connection', (socket) => {
    const closed = latch<void>();
    peers.push({ closed: closed.reached });
    sockets.add(socket);
    socket.on('error', () => {});
    socket.once('close', () => {
      sockets.delete(socket);
      closed.release();
    });
  });
  const listening = once(server, 'listening');
  server.listen(0, LOOPBACK);
  await listening;
  const address = server.address();
  if (!address || typeof address === 'string') throw new Error('Expected loopback port.');
  return {
    port: address.port,
    peers,
    async close() {
      for (const socket of sockets) socket.destroy();
      await new Promise<void>((resolve, reject) => server.close((error) => (error ? reject(error) : resolve())));
    },
  };
}

type Post = { request: IncomingMessage; body: Buffer; socket: TLSSocket };
export async function openLoopbackHttps(options: ServerOptions, onPost?: (post: Post) => void) {
  const posts: Post[] = [];
  const server = createServer({ ALPNProtocols: ['http/1.1'], ...options }, (req) => {
    const socket = req.socket as TLSSocket;
    let size = 0;
    const buffers: Buffer[] = [];
    req.on('error', () => {});
    req.on('data', (chunk: Buffer) => {
      size += chunk.byteLength;
      if (size > SENDGRID_REQUEST_MAX_BYTES) socket.destroy();
      else buffers.push(chunk);
    });
    req.once('end', () => {
      if (size > SENDGRID_REQUEST_MAX_BYTES) return;
      const post = { request: req, socket, body: Buffer.concat(buffers, size) };
      posts.push(post);
      onPost?.(post);
    });
  });
  server.on('clientError', (_error, socket) => socket.destroy());
  return { ...(await listen(server)), posts };
}

export function traceLoopback(
  port: number,
  ca?: string,
  overrides: Partial<Pick<SendGridIo, 'resolver' | 'clock'>> & {
    onRequest?(value: ClientRequest): void;
  } = {},
) {
  const dns = { names: [] as string[], cancels: 0 };
  const dials: ConnectionOptions[] = [];
  const requests: RequestOptions[] = [];
  const sockets: TLSSocket[] = [];
  const requestObjects: ClientRequest[] = [];
  const responseObjects: IncomingMessage[] = [];
  const closedSockets = new Set<TLSSocket>();
  const responseData = latch<void>();

  const io: SendGridIo = {
    resolver:
      overrides.resolver ??
      (() => ({
        resolve4(name, cb) {
          dns.names.push(name);
          queueMicrotask(() => cb(null, [LOOPBACK, '127.0.0.2']));
        },
        resolve6(name, cb) {
          dns.names.push(name);
          queueMicrotask(() => cb(null, ['::1']));
        },
        cancel() {
          dns.cancels++;
        },
      })),
    connect(options) {
      dials.push(options);
      if (options.host !== LOOPBACK) throw new Error('The test must dial IPv4 loopback only.');
      // Remap only the port and trust roots. SNI and hostname verification remain the production ones.
      const socket = connect({ ...options, port, ...(ca === undefined ? {} : { ca }) });
      sockets.push(socket);
      socket.once('close', () => closedSockets.add(socket));
      return socket;
    },
    request(options) {
      requests.push(options);
      if (!options.createConnection || options.agent !== undefined) throw new Error('Expected an owned socket.');
      const req = request(options);
      requestObjects.push(req);
      req.on('response', (res: IncomingMessage) => {
        responseObjects.push(res);
        res.once('data', () => responseData.release());
      });
      overrides.onRequest?.(req);
      return req;
    },
    ...(overrides.clock === undefined ? {} : { clock: overrides.clock }),
  };
  return { io, dns, dials, requests, sockets, requestObjects, responseObjects, closedSockets, responseData };
}

export function responseHead(status: number, headers: readonly string[]) {
  return `HTTP/1.1 ${status} Fixture\r\n${headers.map((line) => `${line}\r\n`).join('')}\r\n`;
}

export function fixedResponse(status: number, headers: readonly string[] = [], body = '') {
  return responseHead(status, [`Content-Length: ${Buffer.byteLength(body)}`, ...headers]) + body;
}
