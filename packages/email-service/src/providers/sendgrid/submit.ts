import { Resolver } from 'node:dns';
import { addAbortListener } from 'node:events';
import type { ClientRequest, IncomingMessage } from 'node:http';
import { request as httpsRequest, type RequestOptions } from 'node:https';
import { isIP, type Socket, type TcpNetConnectOpts } from 'node:net';
import { checkServerIdentity, connect as connectTls, type ConnectionOptions, type TLSSocket } from 'node:tls';
import { SENDGRID_RESPONSE_MAX_BYTES } from '../../constants';
import type { EmailClock } from '../../contracts/message';
import type { ProviderCall, ProviderResult, SendGridSnapshot } from '../../contracts/provider';
import { createBudget, systemEmailClock } from '../../internal/budget';
import { ChunkFraming, readResponseHead, ResponseWire } from './response';

const SENDGRID_HOST = 'api.sendgrid.com';
const PORT = 443;
const PATH = '/v3/mail/send';
type Stage = 'connect' | 'tls' | 'http';
type Mode = SendGridSnapshot['provider']['mode'];
type Failure = Extract<
  ProviderResult['reason'],
  'not_transmitted' | 'provider_configuration' | 'transport_uncertain' | 'provider_timeout' | 'provider_aborted'
>;

type ResolveCallback = (error: NodeJS.ErrnoException | null, addresses: string[]) => void;
export type SendGridResolver = {
  resolve4(name: string, callback: ResolveCallback): void;
  resolve6(name: string, callback: ResolveCallback): void;
  cancel(): void;
};
type SecureSocket = Socket & Pick<TLSSocket, 'authorized' | 'alpnProtocol'>;
type DialOptions = ConnectionOptions & Pick<TcpNetConnectOpts, 'autoSelectFamily'>;

/** Not public. Allows loopback or an in-memory socket underneath Node's HTTPS parser in tests. */
export type SendGridIo = Readonly<{
  resolver: (timeoutMs: number) => SendGridResolver;
  connect: (options: DialOptions) => SecureSocket;
  request: (options: RequestOptions) => ClientRequest;
  clock?: EmailClock;
}>;
const nodeIo: SendGridIo = Object.freeze({
  resolver: (timeout: number) => new Resolver({ timeout, tries: 1 }),
  connect: connectTls,
  request: httpsRequest,
});

const transient = new Set([
  'EAI_AGAIN',
  'ECONNABORTED',
  'ECONNREFUSED',
  'ECONNRESET',
  'EHOSTUNREACH',
  'ENETDOWN',
  'ENETUNREACH',
  'EPIPE',
  'EREFUSED',
  'ESERVFAIL',
  'ETIMEOUT',
  'ETIMEDOUT',
]);
const tlsConfiguration = new Set([
  'CERT_HAS_EXPIRED',
  'CERT_NOT_YET_VALID',
  'DEPTH_ZERO_SELF_SIGNED_CERT',
  'ERR_TLS_CERT_ALTNAME_INVALID',
  'SELF_SIGNED_CERT_IN_CHAIN',
  'UNABLE_TO_GET_ISSUER_CERT',
  'UNABLE_TO_GET_ISSUER_CERT_LOCALLY',
  'UNABLE_TO_VERIFY_LEAF_SIGNATURE',
  'ERR_SSL_UNSUPPORTED_PROTOCOL',
  'ERR_SSL_TLSV1_ALERT_PROTOCOL_VERSION',
]);

/** Own exactly one DNS/TLS/HTTP exchange. Never create or queue the request until TLS is verified. */
export function submitSendGrid(
  mode: Mode,
  apiKey: string,
  body: Buffer,
  call: ProviderCall,
  io: SendGridIo = nodeIo,
): Promise<ProviderResult> {
  const clock = io.clock ?? systemEmailClock;
  const budget = createBudget(clock, call.timeoutMs, call.signal);
  return new Promise((resolve) => {
    const wire = new ResponseWire();
    let stage: Stage = 'connect';
    let settled = false;
    let dns: SendGridResolver | undefined;
    let socket: SecureSocket | undefined;
    let socketClosed = false;
    let request: ClientRequest | undefined;
    let response: IncomingMessage | undefined;
    let payload: Buffer | undefined = body;
    let chunks: ChunkFraming | undefined;
    const listener = addAbortListener(budget.signal, stopped);

    function finish(result: ProviderResult) {
      if (settled) return;
      settled = true; // Fence reentrant and already queued callbacks before destroying resources.
      listener[Symbol.dispose]();
      budget.close();
      const pendingDns = dns;
      dns = undefined;
      pendingDns?.cancel();
      payload = undefined;
      socket?.off('data', onWire);
      socket?.off('data', onChunkFrame);
      response?.destroy();
      request?.destroy();
      socket?.destroy();
      // Wait for local handle closure, never for the peer. Defer the check so an
      // abort reentering a socket/request factory also observes its cleanup.
      queueMicrotask(() => {
        if (!socket || socketClosed) resolve(result);
        else socket.once('close', () => resolve(result));
      });
    }

    function fail(reason: Failure = 'transport_uncertain') {
      if (reason === 'not_transmitted') finish({ outcome: 'unsubmitted', retry: 'safe_transient', stage, reason });
      else if (reason === 'provider_configuration') finish({ outcome: 'unsubmitted', retry: 'never', stage, reason });
      else finish({ outcome: 'unknown', retry: 'never', stage, reason });
    }

    function stopped() {
      const code = (budget.signal.reason as { code?: string } | undefined)?.code;
      fail(code === 'deadline' ? 'provider_timeout' : code === 'aborted' ? 'provider_aborted' : 'transport_uncertain');
    }

    function live(): boolean {
      if (settled) return false;
      try {
        budget.check();
        return true;
      } catch {
        stopped();
        return false;
      }
    }

    function lost() {
      if (live()) fail();
    }
    function socketError(error: NodeJS.ErrnoException) {
      if (!live()) return;
      const code = error.code ?? '';
      if (stage === 'http') return fail();
      if (tlsConfiguration.has(code)) {
        stage = 'tls';
        fail('provider_configuration');
      } else fail(transient.has(code) ? 'not_transmitted' : 'transport_uncertain');
    }

    function onWire(chunk: Buffer) {
      if (live() && !wire.push(chunk)) fail();
    }

    function onChunkFrame(chunk: Buffer) {
      // Run after Node emits the response/head for this read. No raw bytes are saved across reads.
      if (live() && chunks && !chunks.push(chunk, Math.max(0, wire.headBytes - (wire.size - chunk.length)))) fail();
    }

    function onResponse(incoming: IncomingMessage) {
      incoming.on('error', lost);
      if (!live() || response) {
        incoming.destroy();
        return lost();
      }
      response = incoming;
      incoming.once('aborted', lost);
      incoming.once('close', lost);
      const head = readResponseHead(incoming, wire, mode, apiKey, clock.now());
      if (!head) return fail();
      if (head.framing === 'chunked') chunks = new ChunkFraming();
      let bytes = 0;
      incoming.on('data', (chunk: Buffer) => {
        if (!live()) return;
        bytes += chunk.byteLength;
        if (bytes > SENDGRID_RESPONSE_MAX_BYTES || (head.framing !== 'chunked' && bytes > head.framing)) fail();
      });
      incoming.once('end', () => {
        if (!live()) return;
        if (
          !incoming.complete ||
          incoming.rawTrailers.length ||
          (head.framing === 'chunked'
            ? !chunks?.complete
            : bytes !== head.framing || wire.size !== wire.headBytes + bytes) ||
          ((head.result.outcome === 'accepted' || head.result.outcome === 'validated') && !request?.writableFinished)
        ) {
          return fail();
        }
        finish(head.result);
      });
    }

    function post(secured: SecureSocket) {
      if (!live()) return;
      if (!secured.authorized || (secured.alpnProtocol && secured.alpnProtocol !== 'http/1.1')) {
        return fail('provider_configuration');
      }
      // From this point on, none of the request/socket errors prove non-transmission.
      stage = 'http';
      try {
        const req = io.request({
          protocol: 'https:',
          hostname: SENDGRID_HOST,
          port: PORT,
          method: 'POST',
          path: PATH,
          // No agent (including the global one), proxy, implicit dial, session cache or connection sharing.
          createConnection: () => secured,
          insecureHTTPParser: false,
          maxHeaderSize: SENDGRID_RESPONSE_MAX_BYTES,
          headers: {
            Host: SENDGRID_HOST,
            Authorization: `Bearer ${apiKey}`,
            'Content-Type': 'application/json',
            'Content-Length': payload!.length,
            'Accept-Encoding': 'identity',
            Connection: 'close',
          },
        });
        request = req;
        // Do not let Node silently discard later raw headers. The byte cap bounds the total already.
        req.maxHeadersCount = 0;
        req.on('error', lost);
        req.once('close', lost);
        req.on('response', onResponse);
        req.on('information', lost);
        req.on('upgrade', (incoming, wireSocket) => {
          incoming.on('error', lost);
          incoming.destroy();
          wireSocket.destroy();
          lost();
        });
        req.once('socket', (assigned) => {
          if (!live() || assigned !== secured || assigned.destroyed) {
            assigned.destroy();
            return lost();
          }
          assigned.prependListener('data', onWire);
          assigned.on('data', onChunkFrame);
          if (!live()) return;
          try {
            const bytes = payload;
            payload = undefined;
            req.end(bytes);
          } catch {
            lost();
          }
        });
        if (!live()) req.destroy();
      } catch {
        lost();
      }
    }

    function dial(address: string) {
      if (!live()) return;
      try {
        const secured = io.connect({
          host: address,
          port: PORT,
          servername: SENDGRID_HOST,
          checkServerIdentity: (_hostname, cert) => checkServerIdentity(SENDGRID_HOST, cert),
          rejectUnauthorized: true,
          minVersion: 'TLSv1.2',
          ALPNProtocols: ['http/1.1'],
          autoSelectFamily: false,
        });
        socket = secured;
        secured.on('error', socketError);
        secured.once('close', () => {
          socketClosed = true;
          lost();
        });
        secured.once('connect', () => {
          if (stage === 'connect' && live()) stage = 'tls';
        });
        secured.once('secureConnect', () => {
          if (!live() || secured.destroyed) return lost();
          stage = 'tls';
          post(secured);
        });
        if (!live()) secured.destroy();
      } catch {
        lost();
      }
    }

    if (!live()) return;
    try {
      // Own cancellable DNS and pick one numeric address, so Node never retries another address.
      const remaining = Math.ceil(budget.remainingMs());
      if (!remaining) return;
      const resolver = io.resolver(remaining);
      if (!live()) return resolver.cancel();
      dns = resolver;
      const errors: string[] = [];
      const resolved: ResolveCallback = (error, addresses) => {
        if (dns !== resolver || !live()) return;
        const address = !error && addresses.find((value) => isIP(value) !== 0);
        if (address) {
          dns = undefined;
          resolver.cancel();
          dial(address);
          return;
        }
        errors.push(error?.code ?? '');
        if (errors.length !== 2) return;
        if (errors.some((code) => transient.has(code))) fail('not_transmitted');
        else if (errors.every((code) => code === 'ENODATA' || code === 'ENOTFOUND')) fail('provider_configuration');
        else fail();
      };
      resolver.resolve4(SENDGRID_HOST, resolved);
      if (dns === resolver && live()) resolver.resolve6(SENDGRID_HOST, resolved);
    } catch {
      lost();
    }
  });
}
