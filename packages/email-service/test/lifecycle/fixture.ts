import { expect, vi } from 'vitest';
import {
  createEmailService,
  createEmailTemplateRegistry,
  createEmailWorker,
  defineLocalTemplate,
  defineSendGridTemplate,
  type EmailEnvelope,
  type EmailProvider,
  type EmailSnapshot,
  type EmailWorker,
  type EmailWorkerOptions,
  type ProviderRef,
  type RetryPolicy,
} from '../../src';
import { createSendGridProfile } from '../../src/providers/sendgrid/profile';
import { createSmtpProvider } from '../../src/smtp';
import { A, CALL, type StoreFixture } from '../conformance/store-fixtures';
import {
  attachment,
  fixedResponse,
  openLoopbackHttps,
  PROFILE,
  TEMPLATE_ID,
  traceLoopback,
} from '../sendgrid/fixtures';
import { latch, openLoopbackSmtp } from '../smtp/loopback';
import { base64Body, decodeMimeWords, parseMime } from '../smtp/mime-fixture';
import type { createSmtpTlsFixture } from '../smtp/tls-fixture';

export const SENDGRID_HOST = 'api.sendgrid.com';
export const GRID_ID = 'fixture.lifecycle-accepted';
export const PRIVATE_REPLY = 'synthetic fixture reply, not result data';
export const NAME = 'Wire & <fixture> 🌿';
const ENVELOPE = {
  from: { address: 'Sender@Example.INVALID', name: 'Fixture Sender' },
  to: [{ address: 'First+tag@Example.INVALID' }],
  cc: [{ address: 'Copy@Example.INVALID' }],
  bcc: [{ address: 'Blind@Example.INVALID' }],
  replyTo: { address: 'Replies@Example.INVALID' },
} as const satisfies EmailEnvelope;
const PACKET = attachment(Buffer.from([0, 255, 13, 10, 46, 16]));

function parseName(input: unknown) {
  if (typeof input !== 'string') throw new Error('Expected a synthetic name');
  return input;
}

export function templates(expiresAt?: number) {
  const prepare = vi.fn((name: string) => ({
    ...ENVELOPE,
    values: { name },
    ...(expiresAt === undefined ? {} : { expiresAt }),
    attachments: [PACKET.ref],
    correlation: { trace: 'local-only' },
  }));
  const render = vi.fn(parseName);
  const shared = {
    revision: 'v1',
    parseInput: parseName,
    parseData: (data: unknown) => ({ name: parseName((data as { name?: unknown }).name) }),
    prepare,
  };
  const registry = createEmailTemplateRegistry(
    {
      local: defineLocalTemplate({
        ...shared,
        kind: 'handlebars',
        subject: { kind: 'inline', content: 'Notice: {{render name}}' },
        text: { kind: 'inline', content: 'Hello {{name}}\n' },
        html: { kind: 'inline', content: '<p>Hello {{name}}</p>' },
      }),
      remote: defineSendGridTemplate({ ...shared, kind: 'sendgrid', templateId: TEMPLATE_ID }),
    },
    { helpers: { render } },
  );
  return {
    registry,
    prepare,
    render,
    attachmentResolvers: { test: () => ({ status: 'found' as const, bytes: Buffer.from(PACKET.bytes) }) },
  };
}

export function commandFor(provider: ProviderRef, scheduleAt?: number) {
  const common = {
    key: { kind: 'single', idempotencyKey: 'lifecycle' } as const,
    input: NAME,
    intent: { event: 'fixture-notice', revision: 1 },
    ...(scheduleAt === undefined ? {} : { scheduleAt }),
  };
  return provider.kind === 'smtp'
    ? { ...common, templateKey: 'local' as const, provider }
    : { ...common, templateKey: 'remote' as const, provider };
}

/** Timeout is a test diagnostic, not a substitute for an event or for owned transport/driver teardown. */
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

export type Transport = 'smtp' | 'sendgrid' | 'sandbox';
type SmtpPlan = 'accept' | 'partial' | 'ambiguous' | 'stall' | 'final_refusal';
type SendGridPlan = 'accept' | 'ambiguous' | 'stall' | 'throttle_once' | 'truncated_throttle';
type WirePlan = SmtpPlan | SendGridPlan;

async function openSubmission(
  kind: Transport,
  plan: WirePlan,
  tls: ReturnType<typeof createSmtpTlsFixture>,
  responseGate?: Promise<void>,
) {
  const received = latch<void>();
  const invoked = vi.fn();
  // Count invocations in addition to server traffic, without substituting the real submit implementation.
  function observe<M extends EmailSnapshot>(adapter: EmailProvider<M>): EmailProvider<M> {
    return {
      ref: adapter.ref,
      prepare(input) {
        const ready = adapter.prepare(input);
        return {
          submit(call) {
            invoked();
            return ready.submit(call);
          },
        };
      },
    };
  }

  if (kind === 'smtp') {
    if (plan === 'throttle_once' || plan === 'truncated_throttle' || responseGate) {
      throw new Error('Expected the SendGrid response fixture');
    }
    const copyRecipient = `RCPT TO:<${ENVELOPE.cc[0].address}>`;
    const server = await openLoopbackSmtp({
      tls: 'implicit',
      server: tls.server,
      reply(step, peer, line) {
        if (step === 'rcpt' && plan === 'partial' && line === copyRecipient) return `450 ${PRIVATE_REPLY}\r\n`;
        if (step !== 'final') return;
        received.release();
        if (plan === 'ambiguous') peer.reset(); // Actual post-DATA TCP reset.
        if (plan === 'stall' || plan === 'ambiguous') return null;
        return `${plan === 'final_refusal' ? 451 : 250} ${PRIVATE_REPLY}\r\n`;
      },
    });
    const provider = observe(
      createSmtpProvider({ key: kind, host: server.host, port: server.port, tls: 'implicit', ca: [tls.ca] }),
    );
    return {
      provider,
      received: received.reached,
      close: server.close,
      assertCount(count: number) {
        expect(invoked).toHaveBeenCalledTimes(count);
        expect(server.peers).toHaveLength(count);
        expect(server.peers.flatMap(({ secure }) => secure.filter((line) => line === 'DATA'))).toHaveLength(count);
        expect(server.peers.flatMap(({ messages }) => messages)).toHaveLength(count);
      },
      async assertSubmission(attemptId: string, index = 0) {
        const peer = server.peers[index];
        if (!peer) throw new Error('No SMTP peer observed');
        await atBarrier(peer.closed, 'SMTP peer close');
        expect(peer.plaintext).toEqual([]);
        expect(peer.secure).toEqual([
          'EHLO email.invalid',
          `MAIL FROM:<${ENVELOPE.from.address}>`,
          `RCPT TO:<${ENVELOPE.to[0].address}>`,
          copyRecipient,
          `RCPT TO:<${ENVELOPE.bcc[0].address}>`,
          'DATA',
        ]);
        const raw = peer.messages[0]!;
        expect(raw).not.toContain(ENVELOPE.bcc[0].address);
        const mime = parseMime(raw);
        expect(mime.headers.has('bcc')).toBe(false);
        expect(mime.headers.get('message-id')).toBe(`<${attemptId}@email.invalid>`);
        expect(decodeMimeWords(mime.headers.get('subject')!)).toBe(`Notice: ${NAME}`);
        expect(decodeMimeWords(mime.headers.get('from')!)).toBe('Fixture Sender <Sender@Example.INVALID>');
        expect(mime.headers.get('to')).toBe('First+tag@Example.INVALID');
        expect(mime.headers.get('cc')).toBe('Copy@Example.INVALID');
        expect(mime.headers.get('reply-to')).toBe('Replies@Example.INVALID');
        expect(mime.headers.get('content-type')).toMatch(/^multipart\/mixed;/);
        expect(mime.parts).toHaveLength(2);
        const [alternative, binary] = mime.parts;
        expect(alternative!.headers.get('content-type')).toMatch(/^multipart\/alternative;/);
        expect(alternative!.parts).toHaveLength(2);
        expect(base64Body(alternative!.parts[0]!, 'text/plain; charset=utf-8')).toEqual(
          Buffer.from('Hello Wire & <fixture> 🌿\n'),
        );
        expect(base64Body(alternative!.parts[1]!, 'text/html; charset=utf-8')).toEqual(
          Buffer.from('<p>Hello Wire &amp; &lt;fixture&gt; 🌿</p>'),
        );
        expect(binary!.headers.get('content-disposition')).toBe('attachment; filename=packet.bin');
        expect(base64Body(binary!, 'application/octet-stream; name=packet.bin')).toEqual(PACKET.bytes);
      },
    };
  }

  if (plan === 'partial' || plan === 'final_refusal') throw new Error('Expected the SMTP reply fixture');
  const sandbox = kind === 'sandbox';
  let requests = 0;
  const server = await openLoopbackHttps(tls.server, ({ socket }) => {
    requests++;
    received.release();
    const ordinal = requests;
    function respond() {
      if (plan === 'stall' || socket.destroyed) return;
      if (plan === 'ambiguous' || plan === 'truncated_throttle') {
        // Evidence requires a complete response, even with apparently usable headers.
        const head = plan === 'ambiguous' ? `202 Fixture\r\nX-Message-Id: ${GRID_ID}` : '429 Fixture\r\nRetry-After: 1';
        socket.end(`HTTP/1.1 ${head}\r\nContent-Length: 100\r\n\r\nshort`);
      } else if (plan === 'throttle_once' && ordinal === 1) {
        socket.write(fixedResponse(429, ['Retry-After: 2'], PRIVATE_REPLY));
      } else {
        socket.write(fixedResponse(sandbox ? 200 : 202, [`X-Message-Id: ${GRID_ID}`], PRIVATE_REPLY));
      }
    }
    if (responseGate) void responseGate.then(respond);
    else respond();
  });
  const trace = traceLoopback(server.port, tls.ca);
  const provider = observe(
    createSendGridProfile({ ...PROFILE, key: kind, mode: sandbox ? 'sandbox' : 'live' }, trace.io),
  );
  return {
    provider,
    received: received.reached,
    close: server.close,
    assertCount(count: number) {
      expect(invoked).toHaveBeenCalledTimes(count);
      expect(trace.dns.names).toEqual(Array<string>(count * 2).fill(SENDGRID_HOST));
      expect(trace.dials).toHaveLength(count);
      expect(server.peers).toHaveLength(count);
      expect(server.posts).toHaveLength(count);
    },
    async assertSubmission(_attemptId: string, index = 0) {
      const post = server.posts[index];
      const peer = server.peers[index];
      if (!post || !peer) throw new Error('No SendGrid request observed');
      await atBarrier(peer.closed, 'HTTPS peer close');
      expect(trace.closedSockets.has(trace.sockets[index]!)).toBe(true);
      expect(post.socket.servername).toBe(SENDGRID_HOST);
      expect(post.request.method).toBe('POST');
      expect(post.request.url).toBe('/v3/mail/send');
      expect(post.request.headers).toEqual({
        host: SENDGRID_HOST,
        authorization: `Bearer ${PROFILE.apiKey}`,
        'content-type': 'application/json',
        'content-length': String(post.body.length),
        'accept-encoding': 'identity',
        connection: 'close',
      });
      const payload = {
        personalizations: [
          {
            to: [{ email: 'First+tag@Example.INVALID' }],
            cc: [{ email: 'Copy@Example.INVALID' }],
            bcc: [{ email: 'Blind@Example.INVALID' }],
            dynamic_template_data: { name: NAME },
          },
        ],
        from: { email: 'Sender@Example.INVALID', name: 'Fixture Sender' },
        reply_to: { email: 'Replies@Example.INVALID' },
        template_id: TEMPLATE_ID,
        ...(sandbox ? { mail_settings: { sandbox_mode: { enable: true } } } : {}),
        attachments: [
          { content: 'AP8NCi4Q', filename: 'packet.bin', type: 'application/octet-stream', disposition: 'attachment' },
        ],
      };
      expect(post.body).toEqual(Buffer.from(JSON.stringify(payload)));
    },
  };
}

export interface LifecycleQueue extends StoreFixture {
  /** Wait for authoritative store time; do not advance the real server or the worker clock. */
  waitFor(target: number): Promise<void>;
}

export const SHORT_LEASE = {
  leaseMs: 5_000,
  storeTimeoutMs: 1_000,
  preHandoffTimeoutMs: 3_500,
  attachmentTimeoutMs: 3_000,
  providerTimeoutMs: 1_500,
  finalizeGraceMs: 1_200,
};

export async function readyQueue<T extends LifecycleQueue>(queue: T): Promise<T> {
  try {
    await queue.primary.ready();
    if (queue.peer !== queue.primary) await queue.peer.ready();
    return queue;
  } catch (error) {
    await queue.close?.();
    throw error;
  }
}

export function createLifecycle<T extends LifecycleQueue>(queue: T, tls: ReturnType<typeof createSmtpTlsFixture>) {
  const workers: EmailWorker[] = [];
  const servers: Awaited<ReturnType<typeof openSubmission>>[] = [];
  return {
    queue,
    job: (jobId: string, scope = A) => queue.peer.findJob(scope, jobId, CALL),
    attempt: (jobId: string, attemptId: string, scope = A) => queue.peer.findAttempt(scope, jobId, attemptId, CALL),
    async scenario(
      kind: Transport,
      plan: WirePlan = 'accept',
      options: {
        expiresAt?: number;
        scheduleAt?: number;
        retry?: Partial<RetryPolicy>;
        responseGate?: Promise<void>;
      } = {},
    ) {
      const wire = await openSubmission(kind, plan, tls, options.responseGate);
      servers.push(wire);
      const t = templates(options.expiresAt);
      return {
        ...t,
        wire,
        command: commandFor(wire.provider.ref, options.scheduleAt),
        service(store = queue.primary, scope = A) {
          return createEmailService({
            store,
            scope,
            registry: t.registry,
            ...(options.retry ? { retry: options.retry } : {}),
          });
        },
        worker(opts: Omit<Partial<EmailWorkerOptions>, 'providers' | 'clock'> = {}) {
          const worker = createEmailWorker({
            store: queue.primary,
            scope: A,
            providers: [wire.provider],
            attachmentResolvers: t.attachmentResolvers,
            ...opts,
            limits: {
              maxConcurrency: 1,
              leaseMs: 12_000,
              storeTimeoutMs: 2_000,
              preHandoffTimeoutMs: 5_000,
              providerTimeoutMs: 3_000,
              finalizeGraceMs: 2_500,
              ...opts.limits,
            },
          });
          workers.push(worker);
          return worker;
        },
      };
    },
    async close() {
      try {
        await Promise.all(workers.map((worker) => worker.shutdown()));
      } finally {
        try {
          await Promise.all(servers.map((server) => server.close()));
        } finally {
          await queue.close?.();
        }
      }
    },
  };
}

export type Lifecycle = ReturnType<typeof createLifecycle>;
