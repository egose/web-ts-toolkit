import { once } from 'node:events';
import { createServer, type Socket } from 'node:net';
import { createSecureContext, TLSSocket, type SecureContextOptions } from 'node:tls';

export const LOOPBACK = '127.0.0.1';

export function latch<T>() {
  let release!: (value: T) => void;
  const reached = new Promise<T>((resolve) => {
    release = resolve;
  });
  return { reached, release };
}

/** Timeout is a test diagnostic, not a substitute for observing owned I/O teardown. */
export async function atBarrier<T>(event: Promise<T>, label: string, timeoutMs = 5_000): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      event,
      new Promise<never>((_, reject) => {
        timer = setTimeout(() => reject(new Error(`Did not observe ${label}`)), timeoutMs);
      }),
    ]);
  } finally {
    clearTimeout(timer);
  }
}

type Exchange =
  | 'greeting'
  | 'ehlo'
  | 'starttls'
  | 'auth'
  | 'auth-user'
  | 'auth-pass'
  | 'mail'
  | 'rcpt'
  | 'data'
  | 'final';
type Plan = {
  tls: 'implicit' | 'starttls';
  server: SecureContextOptions;
  /** undefined uses the normal response; null suppresses the response for manual writes or faults. */
  reply?(step: Exchange, session: LoopbackSmtpPeer, line: string): string | null | undefined;
  stallHandshake?(session: LoopbackSmtpPeer, clientHello: Buffer): void;
  bodyLine?(session: LoopbackSmtpPeer): void;
};

/** Isolated SMTP script, not a mailbox or a forwarding relay. Only records synthetic fixture data. */
export class LoopbackSmtpPeer {
  readonly plaintext: string[] = [];
  readonly secure: string[] = [];
  readonly messages: string[] = [];
  readonly #closed = latch<void>();
  readonly closed = this.#closed.reached;
  protocol: string | null = null;
  sni: string | false | null = null;
  #socket: Socket;
  #tls: TLSSocket | undefined;
  #pending = '';
  #body: string[] | undefined;
  #auth: 'plain' | 'login-user' | 'login-pass' | undefined;
  #size = 0;

  constructor(
    private readonly raw: Socket,
    private readonly plan: Plan,
  ) {
    this.#socket = raw;
    raw.setNoDelay(true);
    this.#watch(raw);
    if (plan.tls === 'implicit') this.#upgrade(true);
    else {
      raw.on('data', this.#read);
      this.#reply('greeting', '220 loopback ESMTP\r\n');
    }
  }

  #watch(socket: Socket): void {
    // An intentional reset, failed certificate verification or cancelled TLS upgrade is expected.
    socket.on('error', () => {});
    socket.once('close', () => this.#closed.release());
  }

  #upgrade(greet: boolean): void {
    this.raw.off('data', this.#read);
    if (this.plan.stallHandshake) {
      this.raw.once('data', (chunk: Buffer) => this.plan.stallHandshake?.(this, chunk));
      return;
    }
    const secured = new TLSSocket(this.raw, { isServer: true, secureContext: createSecureContext(this.plan.server) });
    this.#tls = secured;
    this.#socket = secured;
    this.#watch(secured);
    secured.once('secure', () => {
      this.protocol = secured.getProtocol();
      this.sni = secured.servername;
      secured.on('data', this.#read);
      if (greet) this.#reply('greeting', '220 loopback ESMTP\r\n');
    });
  }

  write(data: string | Buffer): void {
    if (!this.#socket.destroyed) this.#socket.write(data);
  }

  /** Send a genuine TCP reset instead of a TLS/SMTP success or orderly shutdown. */
  reset(): void {
    this.raw.resetAndDestroy();
  }

  end(data: string): void {
    this.#socket.end(data);
  }

  destroy(): void {
    this.#tls?.destroy();
    this.raw.destroy();
  }

  /** Keep writing partial progress until the peer disconnects. The test observes those writes and actual close. */
  pulse(data: string | Buffer, interval = 15) {
    let count = 0;
    const timer = setInterval(() => {
      if (!this.#socket.destroyed) {
        this.write(data);
        count++;
      }
    }, interval);
    void this.closed.then(() => clearInterval(timer));
    return () => count;
  }

  #reply(step: Exchange, fallback: string, line = ''): string {
    const response = this.plan.reply?.(step, this, line);
    const wire = response === undefined ? fallback : (response ?? '');
    if (wire) this.write(wire);
    return wire;
  }

  #read = (chunk: Buffer) => {
    this.#size += chunk.length;
    if (this.#size > 9 * 1024 * 1024) return this.destroy();
    const lines = (this.#pending + chunk.toString('latin1')).split('\r\n');
    this.#pending = lines.pop()!;
    if (this.#pending.length > 16 * 1024) return this.destroy();
    for (const line of lines) this.#line(line);
  };

  #line(line: string): void {
    if (this.#body) {
      if (line === '.') {
        this.messages.push(this.#body.join('\r\n') + '\r\n');
        this.#body = undefined;
        this.#reply('final', '250 2.0.0 fixture-accepted\r\n', line);
      } else {
        this.#body.push(line.startsWith('..') ? line.slice(1) : line);
        this.plan.bodyLine?.(this);
      }
      return;
    }
    (this.#tls ? this.secure : this.plaintext).push(line);
    if (/^EHLO /.test(line)) {
      this.#reply(
        'ehlo',
        this.#tls ? '250-loopback\r\n250 AUTH PLAIN LOGIN\r\n' : '250-loopback\r\n250-AUTH PLAIN\r\n250 STARTTLS\r\n',
        line,
      );
    } else if (line === 'STARTTLS') {
      if (this.#reply('starttls', '220 continue with TLS\r\n', line).startsWith('220 ')) this.#upgrade(false);
    } else if (this.#auth === 'plain' || this.#auth === 'login-pass') {
      const step = this.#auth === 'plain' ? 'auth' : 'auth-pass';
      this.#auth = undefined;
      this.#reply(step, '235 2.7.0 authenticated\r\n', line);
    } else if (this.#auth === 'login-user') {
      this.#auth = 'login-pass';
      this.#reply('auth-user', '334 UGFzc3dvcmQ6\r\n', line);
    } else if (line === 'AUTH PLAIN' || line === 'AUTH LOGIN') {
      this.#auth = line === 'AUTH PLAIN' ? 'plain' : 'login-user';
      this.#reply('auth', line === 'AUTH PLAIN' ? '334\r\n' : '334 VXNlcm5hbWU6\r\n', line);
    } else if (line.startsWith('AUTH ')) {
      this.#reply('auth', '235 2.7.0 authenticated\r\n', line);
    } else if (line.startsWith('MAIL FROM:')) {
      this.#reply('mail', '250 sender valid\r\n', line);
    } else if (line.startsWith('RCPT TO:')) {
      this.#reply('rcpt', '250 recipient valid\r\n', line);
    } else if (line === 'DATA') {
      if (this.#reply('data', '354 send message\r\n', line).startsWith('354 ')) this.#body = [];
    } else this.write('500 unexpected command\r\n');
  }
}

export async function openLoopbackSmtp(plan: Plan) {
  const peers: LoopbackSmtpPeer[] = [];
  const server = createServer((socket) => peers.push(new LoopbackSmtpPeer(socket, plan)));
  const listening = once(server, 'listening');
  server.listen(0, LOOPBACK);
  await listening;
  const address = server.address();
  if (typeof address !== 'object' || !address) throw new Error('Expected a loopback address');
  return {
    host: LOOPBACK,
    port: address.port,
    peers,
    async close() {
      for (const peer of peers) peer.destroy();
      await new Promise<void>((resolve, reject) => server.close((error) => (error ? reject(error) : resolve())));
    },
  };
}
