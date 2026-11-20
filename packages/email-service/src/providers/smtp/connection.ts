import { Resolver } from 'node:dns';
import { addAbortListener } from 'node:events';
import { connect as connectTcp, isIP, type Socket } from 'node:net';
import type { Readable } from 'node:stream';
import { checkServerIdentity, connect as connectTls, type TLSSocket } from 'node:tls';
import type { ProviderCall, ProviderResult } from '../../contracts/provider';
import { createBudget, systemEmailClock, type OperationBudget } from '../../internal/budget';
import { SmtpReplyReader, type SmtpReply } from './reply';
import type { SmtpConfig } from './options';

export type SmtpStage = Exclude<ProviderResult['stage'], 'http'>;
type StopReason = Extract<
  ProviderResult['reason'],
  'provider_configuration' | 'not_transmitted' | 'transport_uncertain' | 'provider_timeout' | 'provider_aborted'
>;

export class SmtpFailure extends Error {
  constructor(readonly reason: StopReason) {
    super('SMTP submission stopped.');
  }
}

type ResolveAddress = (
  name: string,
  callback: (error: NodeJS.ErrnoException | null, addresses: string[]) => void,
) => void;
type AddressResolver = { resolve4: ResolveAddress; resolve6: ResolveAddress; cancel(): void };
export type SmtpResolverFactory = (timeoutMs: number) => AddressResolver;
const systemResolver: SmtpResolverFactory = (timeout) => new Resolver({ timeout, tries: 1 });

const transientNetwork = new Set([
  'EAI_AGAIN',
  'ECONNABORTED',
  'ECONNREFUSED',
  'ECONNRESET',
  'EHOSTUNREACH',
  'ENETDOWN',
  'ENETUNREACH',
  'EPIPE',
  'ESERVFAIL',
  'ETIMEOUT',
  'ETIMEDOUT',
]);
const invalidCertificate = new Set([
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

function errorCode(error: NodeJS.ErrnoException | null | undefined): string {
  return error?.code ?? '';
}

/** Encode SMTP transparency across write boundaries. The composer has already emitted CRLF. */
function dotStuff(bytes: Buffer, atLineStart: boolean): Buffer {
  const parts: Buffer[] = [];
  let start = 0;
  for (let i = bytes.indexOf(46); i !== -1; i = bytes.indexOf(46, i + 1)) {
    if (i === 0 ? atLineStart : bytes[i - 1] === 10) {
      parts.push(bytes.subarray(start, i + 1), bytes.subarray(i, i + 1));
      start = i + 1;
    }
  }
  return start === 0 ? bytes : Buffer.concat([...parts, bytes.subarray(start)]);
}

/** Own all wire resources for one SMTP transaction, with one outstanding operation and no pooled state. */
export class SmtpConnection {
  stage: SmtpStage = 'connect';
  permanentRcptRefusal = false;
  #budget: OperationBudget;
  #abortListener?: Disposable;
  #failure?: SmtpFailure;
  #resolver: AddressResolver | undefined;
  #plain?: Socket;
  #tls?: TLSSocket;
  #wire?: Socket;
  #readerSocket?: Socket;
  #readReply: ((chunk: Buffer) => void) | undefined;
  #rejectPending: ((failure: SmtpFailure) => void) | undefined;
  #stream: Readable | undefined;
  #bodyStarted = false;
  #partialReply = false;

  constructor(
    private readonly config: SmtpConfig,
    call: ProviderCall,
    private readonly resolverFactory = systemResolver,
  ) {
    this.#budget = createBudget(systemEmailClock, call.timeoutMs, call.signal);
    if (this.#budget.signal.aborted) this.#onStop();
    else this.#abortListener = addAbortListener(this.#budget.signal, this.#onStop);
  }

  #onStop = () => {
    const reason: unknown = this.#budget.signal.reason;
    const code = (reason as { code?: string } | undefined)?.code;
    this.#fail(
      code === 'deadline' ? 'provider_timeout' : code === 'aborted' ? 'provider_aborted' : 'transport_uncertain',
    );
  };

  #fail(reason: StopReason): void {
    if (this.#failure) return;
    this.#failure = new SmtpFailure(reason);
    this.#abortListener?.[Symbol.dispose]();
    this.#budget.close();
    this.#readReply = undefined;
    this.#readerSocket?.off('data', this.#onData);
    const resolver = this.#resolver;
    this.#resolver = undefined;
    resolver?.cancel();
    this.#stream?.destroy();
    this.#stream = undefined;
    this.#tls?.destroy();
    this.#plain?.destroy();
    this.#rejectPending?.(this.#failure);
    this.#rejectPending = undefined;
  }

  close(): void {
    // Fence callbacks and destroy the sockets before the provider promise settles, even on success.
    this.#fail('transport_uncertain');
  }

  #check(): void {
    if (this.#failure) throw this.#failure;
    try {
      this.#budget.check();
    } catch {
      this.#onStop();
      throw this.#failure ?? new SmtpFailure('transport_uncertain');
    }
  }

  #live(): boolean {
    try {
      this.#check();
      return true;
    } catch {
      return false;
    }
  }

  #wait<T>(start: (done: (value: T) => void) => void): Promise<T> {
    this.#check();
    return new Promise<T>((resolve, reject) => {
      this.#rejectPending = reject;
      try {
        start((value) => {
          if (this.#rejectPending !== reject || !this.#live()) return;
          this.#rejectPending = undefined;
          resolve(value);
        });
      } catch {
        this.#fail('transport_uncertain');
      }
    });
  }

  #resolve(): Promise<string> {
    if (isIP(this.config.host)) return Promise.resolve(this.config.host);
    // Own a cancellable c-ares resolver rather than leaving a getaddrinfo callback
    // (or the peer's internal DNS cache/resolver) running after abort.
    return this.#wait<string>((done) => {
      const resolver = this.resolverFactory(Math.ceil(this.#budget.remainingMs()));
      this.#resolver = resolver;
      let pending = 2;
      const errors: string[] = [];
      const onResolved = (error: NodeJS.ErrnoException | null, addresses?: string[]) => {
        if (this.#resolver !== resolver || !this.#live()) return;
        const address = !error && addresses?.find((value) => isIP(value) !== 0);
        if (address) {
          this.#resolver = undefined;
          resolver.cancel();
          done(address);
        } else {
          errors.push(errorCode(error));
          if (--pending !== 0) return;
          if (errors.some((code) => transientNetwork.has(code))) this.#fail('not_transmitted');
          else if (errors.every((code) => !code || code === 'ENODATA' || code === 'ENOTFOUND')) {
            this.#fail('provider_configuration');
          } else this.#fail('transport_uncertain');
        }
      };
      resolver.resolve4(this.config.host, onResolved);
      if (this.#resolver === resolver) resolver.resolve6(this.config.host, onResolved);
    });
  }

  #networkFailure(socket: Socket, code: string): void {
    if (this.#wire !== socket || !this.#live()) return;
    if (this.stage === 'tls' && socket === this.#tls && invalidCertificate.has(code)) {
      this.#fail('provider_configuration');
    } else if (
      !this.#bodyStarted &&
      !this.#partialReply &&
      !this.permanentRcptRefusal &&
      (!code || transientNetwork.has(code))
    ) {
      this.#fail('not_transmitted');
    } else this.#fail('transport_uncertain');
  }

  #watch(socket: Socket): void {
    socket.on('error', (error: NodeJS.ErrnoException) => this.#networkFailure(socket, errorCode(error) || 'OTHER'));
    socket.once('end', () => this.#networkFailure(socket, ''));
    socket.once('close', () => this.#networkFailure(socket, ''));
  }

  async connect(): Promise<void> {
    const host = await this.#resolve();
    await this.#wait<void>((done) => {
      // A single numeric target; Node neither performs another lookup nor tries another address.
      const socket = connectTcp({ host, port: this.config.port, family: isIP(host), autoSelectFamily: false });
      this.#plain = this.#wire = socket;
      this.#watch(socket);
      socket.setNoDelay(true);
      socket.once('connect', () => done());
    });
  }

  async startTls(): Promise<void> {
    this.stage = 'tls';
    await this.#wait<void>((done) => {
      const socket = this.#plain!;
      socket.off('data', this.#onData);
      const secured = connectTls({
        socket,
        secureContext: this.config.secureContext,
        ...(this.config.servername ? { servername: this.config.servername } : {}),
        rejectUnauthorized: true,
        // Verify the configured identity, not a resolved address or a name proposed by the relay.
        checkServerIdentity: (_servername, cert) => checkServerIdentity(this.config.identity, cert),
      });
      this.#tls = this.#wire = secured;
      this.#watch(secured);
      secured.once('secureConnect', () => {
        if (!this.#live()) return;
        if (!secured.authorized) return this.#fail('provider_configuration');
        done();
      });
    });
  }

  #onData = (chunk: Buffer) => {
    if (!this.#live()) return;
    if (!this.#readReply) this.#fail('transport_uncertain');
    else this.#readReply(chunk);
  };

  #reply(command?: string): Promise<SmtpReply> {
    const reader = new SmtpReplyReader();
    return this.#wait<SmtpReply>((done) => {
      this.#readReply = (chunk) => {
        try {
          const reply = reader.push(chunk);
          this.#partialReply = !reply;
          if (reply) {
            this.#readReply = undefined;
            done(reply);
          }
        } catch {
          this.#fail('transport_uncertain');
        }
      };
      const socket = this.#wire!;
      if (socket !== this.#readerSocket) {
        this.#readerSocket = socket;
        socket.on('data', this.#onData);
      }
      if (command !== undefined) this.#write(`${command}\r\n`);
    });
  }

  greeting(): Promise<SmtpReply> {
    return this.#reply();
  }

  #write(value: string | Buffer, done?: () => void): void {
    this.#check();
    const socket = this.#wire!;
    socket.write(value, (error) => {
      if (error) this.#networkFailure(socket, errorCode(error) || 'OTHER');
      else done?.();
    });
  }

  command(command: string): Promise<SmtpReply> {
    return this.#reply(command);
  }

  /** Never listen for a final acceptance until the complete MIME stream can be terminated. */
  async data(openMimeStream: () => Readable): Promise<SmtpReply> {
    this.#check();
    this.#bodyStarted = true;
    this.#stream = openMimeStream();
    let tail = 10; // start of line for transparency; not a complete CRLF for an empty stream
    for await (const value of this.#stream as AsyncIterable<Buffer>) {
      for (let offset = 0; offset < value.length; offset += 16_384) {
        this.#check();
        const bytes = value.subarray(offset, offset + 16_384);
        const stuffed = dotStuff(bytes, (tail & 255) === 10);
        const last = bytes[bytes.length - 1]!;
        const before = bytes.length === 1 ? tail & 255 : bytes[bytes.length - 2]!;
        tail = (before << 8) | last;
        // Respect backpressure and recheck the absolute clock before every piece.
        await this.#wait<void>((done) => this.#write(stuffed, done));
      }
    }
    this.#stream = undefined;
    if (tail !== 0x0d0a) throw new SmtpFailure('transport_uncertain');
    return this.#reply('.');
  }

  get failure(): SmtpFailure | undefined {
    return this.#failure;
  }
}
