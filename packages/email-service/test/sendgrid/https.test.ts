import { createHash } from 'node:crypto';
import type { ServerOptions } from 'node:https';
import { createServer } from 'node:net';
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import type { EmailClock, ProviderResult } from '../../src';
import { MESSAGE_LIMITS, SENDGRID_REQUEST_MAX_BYTES, SENDGRID_RESPONSE_MAX_BYTES } from '../../src/constants';
import { createSendGridProfile } from '../../src/providers/sendgrid/profile';
import type { SendGridResolver } from '../../src/providers/sendgrid/submit';
import { latch, LOOPBACK } from '../smtp/loopback';
import { createSmtpTlsFixture } from '../smtp/tls-fixture';
import {
  attachment,
  call,
  fixedResponse,
  listen,
  openLoopbackHttps,
  PROFILE,
  responseHead,
  submission,
  TEMPLATE_ID,
  traceLoopback,
} from './fixtures';

const HOST = 'api.sendgrid.com'; // Independent test expectation; never resolved by the fixture.
const ACCEPTED = { outcome: 'accepted', retry: 'never', stage: 'http', reason: 'sendgrid_accepted' } as const;
const VALIDATED = { outcome: 'validated', retry: 'never', stage: 'http', reason: 'sendgrid_validated' } as const;
const THROTTLED = {
  outcome: 'rejected',
  retry: 'safe_transient',
  stage: 'http',
  reason: 'sendgrid_throttled',
} as const;
const REJECTED = { outcome: 'rejected', retry: 'never', stage: 'http', reason: 'sendgrid_rejected' } as const;
const UNCERTAIN = { outcome: 'unknown', retry: 'never', stage: 'http', reason: 'transport_uncertain' } as const;

type Fixture = ReturnType<typeof createSmtpTlsFixture>;
let tls: Fixture;
let wrongName: Fixture;
const servers: { close(): Promise<void> }[] = [];

function manualClock() {
  let monotonic = 0;
  const clock: EmailClock = {
    now: () => 1_795_000_000_000,
    monotonicNow: () => monotonic,
    sleep: (_ms, signal) =>
      new Promise<void>((resolve) => signal.addEventListener('abort', () => resolve(), { once: true })),
  };
  return {
    clock,
    advanceTo: (time: number) => {
      monotonic = time;
    },
  };
}

beforeAll(() => {
  tls = createSmtpTlsFixture(HOST);
  wrongName = createSmtpTlsFixture();
});
afterEach(async () => {
  for (const server of servers.splice(0)) await server.close();
});
afterAll(() => {
  wrongName?.close();
  tls?.close();
});

async function https(onPost?: Parameters<typeof openLoopbackHttps>[1], options: ServerOptions = {}) {
  const server = await openLoopbackHttps({ ...tls.server, ...options }, onPost);
  servers.push(server);
  return server;
}

async function expectClosed(
  server: Awaited<ReturnType<typeof listen>>,
  trace: ReturnType<typeof traceLoopback>,
  count = 1,
) {
  expect(server.peers).toHaveLength(count);
  expect(trace.sockets).toHaveLength(count);
  expect(trace.closedSockets.size).toBe(count); // Closed locally before submit resolved.
  for (const resource of [...trace.sockets, ...trace.requestObjects, ...trace.responseObjects]) {
    expect(resource.destroyed).toBe(true);
  }
  await Promise.all(server.peers.map((peer) => peer.closed)); // The remote TCP endpoints really closed.
}

async function reply(raw: string, mode: 'live' | 'sandbox' = 'live', close = false): Promise<ProviderResult> {
  const server = await https(({ socket }) => {
    if (close) socket.end(raw);
    else socket.write(raw);
  });
  const trace = traceLoopback(server.port, tls.ca);
  const provider = createSendGridProfile({ ...PROFILE, mode }, trace.io);
  const result = await provider.prepare(submission({ provider: provider.ref })).submit(call());
  expect(server.posts).toHaveLength(1);
  expect(trace.requests).toHaveLength(1);
  await expectClosed(server, trace);
  return result;
}

describe('SendGrid fixed HTTPS POST', () => {
  it('keeps two concurrent profiles, buffers and exact live/sandbox wire payloads independent', async () => {
    const paired = latch<void>();
    const pending: (() => void)[] = [];
    const server = await https(({ request, socket }) => {
      pending.push(() =>
        request.headers.authorization === 'Bearer synthetic-sandbox-token'
          ? socket.write(fixedResponse(200, ['X-Message-Id: sandbox-not-returned']))
          : socket.write(fixedResponse(202, ['x-meSSage-id:   fixture.id_=004  '])),
      );
      if (pending.length === 2) {
        for (const respond of pending) respond();
        paired.release();
      }
    });
    const trace = traceLoopback(server.port, tls.ca);
    const liveOptions = { ...PROFILE, mode: 'live' as const };
    const sandboxOptions = { key: 'dry-run', apiKey: 'synthetic-sandbox-token', mode: 'sandbox' as const };
    const live = createSendGridProfile(liveOptions, trace.io);
    const sandbox = createSendGridProfile(sandboxOptions, trace.io);
    const from = { address: 'Sender@Example.INVALID', name: 'Séndér' };
    const to = [{ address: 'First+tag@Example.INVALID', name: 'Visíble' }, { address: 'Second@Example.INVALID' }];
    const cc = [{ address: 'Copy@Example.INVALID', name: 'Copy' }];
    const bcc = [{ address: 'Blind@example.invalid' }];
    const replyTo = { address: 'Replies@Example.INVALID', name: 'Replies' };
    const details = { names: ['例', '🌱'], ready: true, fields: { count: 7, extra: null } };
    const backing = Buffer.from([9, 7, 0x00, 0xff, 0x0d, 0x0a, 0xc0, 3]);
    const packet = attachment(backing.subarray(2, 7));
    const note = attachment(Uint8Array.of(0x61), 'café.txt', 'text/plain');
    const liveInput = submission({ envelope: { from, to, cc, bcc, replyTo }, data: { details } }, [packet, note]);
    const livePrepared = live.prepare(liveInput);
    const sandboxPrepared = sandbox.prepare(submission({ provider: sandbox.ref }));
    const expectedLive = {
      personalizations: [
        {
          to: [{ email: 'First+tag@Example.INVALID', name: 'Visíble' }, { email: 'Second@Example.INVALID' }],
          cc: [{ email: 'Copy@Example.INVALID', name: 'Copy' }],
          bcc: [{ email: 'Blind@example.invalid' }],
          dynamic_template_data: { details: { fields: { count: 7, extra: null }, names: ['例', '🌱'], ready: true } },
        },
      ],
      from: { email: 'Sender@Example.INVALID', name: 'Séndér' },
      reply_to: { email: 'Replies@Example.INVALID', name: 'Replies' },
      template_id: TEMPLATE_ID,
      attachments: [
        { content: 'AP8NCsA=', filename: 'packet.bin', type: 'application/octet-stream', disposition: 'attachment' },
        { content: 'YQ==', filename: 'café.txt', type: 'text/plain', disposition: 'attachment' },
      ],
    };
    const expectedSandbox = {
      personalizations: [{ to: [{ email: 'To@Example.INVALID' }], dynamic_template_data: { name: 'Example' } }],
      from: { email: 'From@Example.INVALID' },
      template_id: TEMPLATE_ID,
      mail_settings: { sandbox_mode: { enable: true } },
    };
    expect(trace.dns.names).toEqual([]);
    expect(trace.requests).toEqual([]);
    expect(server.peers).toEqual([]);
    liveOptions.apiKey = 'modified-live-key';
    liveOptions.key = 'different-profile';
    sandboxOptions.apiKey = 'modified-sandbox-key';
    from.name = 'Changed';
    to.reverse();
    bcc[0]!.address = 'Wrong@Example.INVALID';
    details.names[0] = 'not-the-prepared-value';
    backing.fill(12);
    note.bytes.fill(12);
    packet.ref.filename = 'changed.bin';
    expect(live.ref).toEqual({ kind: 'sendgrid', key: PROFILE.key, mode: 'live' });

    const results = Promise.all([livePrepared.submit(call()), sandboxPrepared.submit(call())]);
    await expect(livePrepared.submit(call())).rejects.toMatchObject({ code: 'closed' });
    await paired.reached;
    await expect(results).resolves.toEqual([{ ...ACCEPTED, providerMessageId: 'fixture.id_=004' }, VALIDATED]);
    expect(trace.dns).toEqual({ names: [HOST, HOST, HOST, HOST], cancels: 2 });
    expect(trace.dials).toHaveLength(2);
    for (const dial of trace.dials) {
      expect(dial).toMatchObject({
        host: LOOPBACK,
        port: 443,
        servername: HOST,
        rejectUnauthorized: true,
        minVersion: 'TLSv1.2',
        ALPNProtocols: ['http/1.1'],
        autoSelectFamily: false,
      });
    }
    expect(trace.requests).toHaveLength(2);
    for (const request of trace.requests) {
      expect(request).toMatchObject({
        hostname: HOST,
        port: 443,
        protocol: 'https:',
        method: 'POST',
        path: '/v3/mail/send',
        insecureHTTPParser: false,
        maxHeaderSize: SENDGRID_RESPONSE_MAX_BYTES,
      });
      expect(request.agent).toBeUndefined();
    }
    expect(server.posts).toHaveLength(2);
    for (const [apiKey, expected] of [
      [PROFILE.apiKey, expectedLive],
      ['synthetic-sandbox-token', expectedSandbox],
    ] as const) {
      const post = server.posts.find(({ request }) => request.headers.authorization === `Bearer ${apiKey}`);
      expect(post).toBeDefined();
      const { request, socket, body } = post!;
      expect(socket.servername).toBe(HOST);
      expect(socket.alpnProtocol).toBe('http/1.1');
      expect(['TLSv1.2', 'TLSv1.3']).toContain(socket.getProtocol());
      expect(request.method).toBe('POST');
      expect(request.url).toBe('/v3/mail/send');
      expect(request.headers).toEqual({
        host: HOST,
        authorization: `Bearer ${apiKey}`,
        'content-type': 'application/json',
        'content-length': String(body.length),
        'accept-encoding': 'identity',
        connection: 'close',
      });
      expect(body).toEqual(Buffer.from(JSON.stringify(expected)));
    }
    await expectClosed(server, trace, 2);
  });

  it('keeps the largest permitted attachment total inside the encoded request cap', async () => {
    const server = await https(({ socket }) => socket.write(fixedResponse(202)));
    const trace = traceLoopback(server.port, tls.ca);
    const size = MESSAGE_LIMITS.attachmentBytes;
    const resolved = [
      attachment(Buffer.alloc(size, 0x11)),
      attachment(Buffer.alloc(size, 0x22), 'second.bin'),
      attachment(Buffer.alloc(MESSAGE_LIMITS.totalAttachmentBytes - size * 2, 0x33), 'third.bin'),
    ];
    const provider = createSendGridProfile(PROFILE, trace.io);
    await expect(provider.prepare(submission({}, resolved)).submit(call())).resolves.toEqual(ACCEPTED);
    const post = server.posts[0]!;
    expect(post.body.length).toBeLessThanOrEqual(SENDGRID_REQUEST_MAX_BYTES);
    expect(post.request.headers['content-length']).toBe(String(post.body.length));
    const decoded = JSON.parse(post.body.toString('utf8')) as { attachments: { content: string }[] };
    expect(
      decoded.attachments.map(({ content }) =>
        createHash('sha256').update(Buffer.from(content, 'base64')).digest('hex'),
      ),
    ).toEqual(resolved.map(({ ref }) => ref.sha256));
    await expectClosed(server, trace);
  });

  it.each(['unknown-issuer', 'wrong-hostname'] as const)('sends no HTTP request for TLS %s', async (kind) => {
    const server = await https(undefined, kind === 'wrong-hostname' ? wrongName.server : {});
    const trace = traceLoopback(server.port, wrongName.ca);
    const provider = createSendGridProfile(PROFILE, trace.io);
    await expect(provider.prepare(submission()).submit(call())).resolves.toEqual({
      outcome: 'unsubmitted',
      retry: 'never',
      stage: 'tls',
      reason: 'provider_configuration',
    });
    expect(trace.dials).toHaveLength(1);
    expect(trace.requests).toHaveLength(0);
    expect(server.posts).toHaveLength(0);
    await expectClosed(server, trace);
  });

  it('writes no HTTP bytes to an actual TLS 1.1-only endpoint', async () => {
    const server = await https(undefined, { minVersion: 'TLSv1.1', maxVersion: 'TLSv1.1' });
    const trace = traceLoopback(server.port, tls.ca);
    const provider = createSendGridProfile(PROFILE, trace.io);
    await expect(provider.prepare(submission()).submit(call())).resolves.toEqual({
      outcome: 'unsubmitted',
      retry: 'never',
      stage: 'tls',
      reason: 'provider_configuration',
    });
    expect(trace.requests).toHaveLength(0);
    expect(server.posts).toHaveLength(0);
    await expectClosed(server, trace);
  });
});

describe('SendGrid complete response evidence', () => {
  it.each([400, 401, 403, 404, 405, 413])('recognizes documented permanent nonacceptance %i', async (status) => {
    await expect(
      reply(fixedResponse(status, ['X-Message-Id: ignored', 'Retry-After: 700'], 'opaque private text')),
    ).resolves.toEqual(REJECTED);
  });

  it.each([201, 204, 301, 302, 307, 308, 402, 408, 409, 422, 451, 500, 502, 503, 504])(
    'does not interpret HTTP %i as safe evidence or follow its Location',
    async (status) => {
      await expect(reply(fixedResponse(status, ['Location: /must-not-follow', 'Retry-After: 2']))).resolves.toEqual(
        UNCERTAIN,
      );
    },
  );

  it('does not reinterpret a mismatched success for the other mode', async () => {
    await expect(reply(fixedResponse(200))).resolves.toEqual(UNCERTAIN);
    await expect(reply(fixedResponse(202), 'sandbox')).resolves.toEqual(UNCERTAIN);
  });

  it('accepts an explicitly framed final response followed by normal server shutdown', async () => {
    await expect(
      reply(fixedResponse(202, ['Connection: close']).replace('HTTP/1.1', 'HTTP/1.0'), 'live', true),
    ).resolves.toEqual(ACCEPTED);
  });

  it('returns only the retry floor from a complete 429, not body text or per-recipient results', async () => {
    const reset = 1_795_099_123;
    await expect(
      reply(
        fixedResponse(
          429,
          ['Retry-After: 12', `X-RateLimit-Reset: ${reset}`, 'X-Message-Id: ignored'],
          'synthetic private body',
        ),
      ),
    ).resolves.toEqual({ ...THROTTLED, retryHint: { delayMs: 12_000, notBefore: reset * 1_000 } });
    const later = (reset + 60) * 1_000;
    await expect(
      reply(fixedResponse(429, [`Retry-After: ${new Date(later).toUTCString()}`, `X-RateLimit-Reset: ${reset}`])),
    ).resolves.toEqual({ ...THROTTLED, retryHint: { notBefore: later } });
    await expect(reply(fixedResponse(429, ['Retry-After: -2', 'X-RateLimit-Reset: invalid']))).resolves.toEqual(
      THROTTLED,
    );
  });

  it.each([
    ['duplicate', ['X-Message-Id: one', 'x-message-id: one']],
    ['combined', ['X-Message-Id: one, two']],
    ['too long', [`X-Message-Id: a${'b'.repeat(128)}`]],
    ['embedded whitespace', ['X-Message-Id: synthetic private message']],
    ['non-ASCII', ['X-Message-Id: pré-id']],
    ['invalid first character', ['X-Message-Id: -one']],
    ['exact credential reflection', [`X-Message-Id: ${PROFILE.apiKey}`]],
    ['embedded credential reflection', [`X-Message-Id: pre.${PROFILE.apiKey}.post`]],
  ] as const)('drops unsafe message IDs (%s) without losing live acceptance', async (_label, fields) => {
    await expect(reply(fixedResponse(202, fields))).resolves.toEqual(ACCEPTED);
  });

  it('allows a 128-byte message ID and a complete ordinary chunked response split across TLS reads', async () => {
    const id = 'A' + '.0_=-'.repeat(25) + 'xy';
    const server = await https(({ socket }) =>
      socket.write(responseHead(202, ['Transfer-Encoding: chunked', `X-Message-Id: ${id}`]) + '3\r\nx'),
    );
    const trace = traceLoopback(server.port, tls.ca);
    const result = createSendGridProfile(PROFILE, trace.io).prepare(submission()).submit(call());
    await trace.responseData.reached;
    server.posts[0]!.socket.write('yz\r\n2\r\nab\r\n0\r\n\r\n');
    await expect(result).resolves.toEqual({ ...ACCEPTED, providerMessageId: id });
    await expectClosed(server, trace);
  });

  it.each([
    ['truncated content length', responseHead(429, ['Content-Length: 20', 'Retry-After: 10']) + 'incomplete'],
    ['truncated chunk', responseHead(429, ['Transfer-Encoding: chunked']) + '4\r\nabc'],
    ['truncated header', 'HTTP/1.1 429 Test\r\nContent-Len'],
    ['close-delimited', responseHead(429, ['Connection: close']) + 'opaque'],
    ['unsupported HTTP version', fixedResponse(429).replace('HTTP/1.1', 'HTTP/1.2')],
    ['bare LF', fixedResponse(429).replaceAll('\r\n', '\n')],
    ['obsolete folding', fixedResponse(429, ['Retry-After: 10', '\tfolded-data'])],
    ['ambiguous header name', fixedResponse(429, ['Retry-After : 10'])],
    ['duplicate content length', fixedResponse(429, ['Content-Length: 0'])],
    ['conflicting transfer metadata', fixedResponse(429, ['Transfer-Encoding: chunked'])],
    ['ambiguous retry floor', fixedResponse(429, ['Retry-After: 1', 'Retry-After: 10'])],
    ['ambiguous reset floor', fixedResponse(429, ['X-RateLimit-Reset: 1', 'X-RateLimit-Reset: 10'])],
    ['non-decimal length', responseHead(429, ['Content-Length: +0'])],
    ['compressed content', fixedResponse(429, ['Content-Encoding: gzip'], 'not decompressed')],
    ['unsupported transfer coding', responseHead(429, ['Transfer-Encoding: gzip, chunked']) + '0\r\n\r\n'],
    ['chunk extension', responseHead(429, ['Transfer-Encoding: chunked']) + '1;foo=bar\r\nx\r\n0\r\n\r\n'],
    ['trailer', responseHead(429, ['Transfer-Encoding: chunked']) + '0\r\nRetry-After: 1\r\n\r\n'],
    ['malformed chunk ending', responseHead(429, ['Transfer-Encoding: chunked']) + '1\r\nx\n0\r\n\r\n'],
    ['surplus after fixed frame', fixedResponse(429) + 'unexpected'],
    ['surplus after chunked frame', responseHead(429, ['Transfer-Encoding: chunked']) + '0\r\n\r\nunexpected'],
    ['multiple final responses', fixedResponse(202) + fixedResponse(429)],
    ['informational response', 'HTTP/1.1 100 Continue\r\n\r\n' + fixedResponse(429)],
    ['upgrade', responseHead(101, ['Connection: Upgrade', 'Upgrade: foo']) + fixedResponse(429)],
  ] as const)('fails closed for %s instead of using status/retry hints', async (_label, raw) => {
    await expect(reply(raw, 'live', true)).resolves.toEqual(UNCERTAIN);
  });

  it('caps the actual wire size, not just the decoded body size', async () => {
    const sampleHead = responseHead(429, [`Content-Length: ${SENDGRID_RESPONSE_MAX_BYTES}`]);
    const fit = SENDGRID_RESPONSE_MAX_BYTES - Buffer.byteLength(sampleHead);
    await expect(reply(fixedResponse(429, [], '.'.repeat(fit)))).resolves.toEqual(THROTTLED);
    await expect(reply(fixedResponse(429, [], '.'.repeat(fit + 1)))).resolves.toEqual(UNCERTAIN);
    await expect(reply(fixedResponse(429, [`X-Opaque: ${'.'.repeat(SENDGRID_RESPONSE_MAX_BYTES)}`]))).resolves.toEqual(
      UNCERTAIN,
    );
    const chunkedHead = responseHead(429, ['Transfer-Encoding: chunked']);
    const decodedSize = SENDGRID_RESPONSE_MAX_BYTES - chunkedHead.length;
    const chunked = `${chunkedHead}${decodedSize.toString(16)}\r\n${'.'.repeat(decodedSize)}\r\n0\r\n\r\n`;
    await expect(reply(chunked)).resolves.toEqual(UNCERTAIN);
  });
});

describe('SendGrid transport ownership and deadline', () => {
  it.each(['abort', 'deadline'] as const)(
    'cancels DNS at %s and ignores late successful callback delivery',
    async (stop) => {
      type Resolve = Parameters<SendGridResolver['resolve4']>[1];
      const callbacks: Resolve[] = [];
      const cancel = vi.fn();
      const lookup: SendGridResolver = {
        resolve4: (_host, callback) => callbacks.push(callback),
        resolve6: (_host, callback) => callbacks.push(callback),
        cancel,
      };
      const server = await https();
      const { clock, advanceTo } = manualClock();
      const trace = traceLoopback(server.port, tls.ca, { resolver: () => lookup, clock });
      const ac = new AbortController();
      const result = createSendGridProfile(PROFILE, trace.io).prepare(submission()).submit(call(50, ac.signal));
      expect(callbacks).toHaveLength(2);
      if (stop === 'abort') ac.abort();
      else advanceTo(50);
      callbacks[0]!(null, [LOOPBACK]);
      await expect(result).resolves.toEqual({
        ...UNCERTAIN,
        stage: 'connect',
        reason: stop === 'abort' ? 'provider_aborted' : 'provider_timeout',
      });
      callbacks[1]!(null, ['::1']);
      expect(cancel).toHaveBeenCalledExactlyOnceWith();
      expect(trace.dials).toEqual([]);
      expect(trace.requests).toEqual([]);
      expect(server.peers).toEqual([]);
    },
  );

  it('aborts an actual stalled TLS handshake and will not launch on a late secure callback', async () => {
    const hello = latch<Buffer>();
    const server = await listen(
      createServer((socket) =>
        socket.once('data', (data) => hello.release(Buffer.isBuffer(data) ? data : Buffer.from(data))),
      ),
    );
    servers.push(server);
    const trace = traceLoopback(server.port, tls.ca);
    const ac = new AbortController();
    const result = createSendGridProfile(PROFILE, trace.io).prepare(submission()).submit(call(3_000, ac.signal));
    const clientHello = await hello.reached;
    expect(clientHello[0]).toBe(0x16); // TLS handshake record, not plaintext HTTP.
    ac.abort();
    await expect(result).resolves.toEqual({ ...UNCERTAIN, stage: 'tls', reason: 'provider_aborted' });
    trace.sockets[0]!.emit('secureConnect'); // Inject a callback that was not observed on the wire.
    expect(trace.requests).toEqual([]);
    await expectClosed(server, trace);
  });

  it('does not write a request whose socket assignment would arrive after abort', async () => {
    const server = await https();
    const ac = new AbortController();
    const trace = traceLoopback(server.port, tls.ca, {
      onRequest: () => ac.abort(), // The real ClientRequest attaches its socket on the next tick.
    });
    const result = await createSendGridProfile(PROFILE, trace.io).prepare(submission()).submit(call(3_000, ac.signal));
    expect(result).toEqual({ ...UNCERTAIN, reason: 'provider_aborted' });
    expect(trace.requests).toHaveLength(1);
    expect(trace.requestObjects[0]!.writableEnded).toBe(false);
    expect(server.posts).toHaveLength(0);
    await expectClosed(server, trace);
  });

  it('aborts a live request, response and socket without publishing an incomplete throttle', async () => {
    const server = await https(({ socket }) =>
      socket.write(responseHead(429, ['Content-Length: 20', 'Retry-After: 10000']) + 'incomplete'),
    );
    const trace = traceLoopback(server.port, tls.ca);
    const ac = new AbortController();
    ac.signal.addEventListener('abort', (event) => event.stopImmediatePropagation(), { once: true });
    const result = createSendGridProfile(PROFILE, trace.io).prepare(submission()).submit(call(3_000, ac.signal));
    await trace.responseData.reached;
    ac.abort(new Error('synthetic private abort reason'));
    await expect(result).resolves.toEqual({ ...UNCERTAIN, reason: 'provider_aborted' });
    expect(server.posts).toHaveLength(1);
    expect(trace.requestObjects).toHaveLength(1);
    expect(trace.responseObjects).toHaveLength(1);
    await expectClosed(server, trace);
  });

  it('destroys the request and socket on an absolute deadline despite continued response progress', async () => {
    let writes = 0;
    const server = await https(({ socket }) => {
      socket.write(responseHead(429, ['Content-Length: 4000', 'Retry-After: 12']));
      const pulse = setInterval(() => {
        socket.write('.');
        writes++;
      }, 15);
      socket.once('close', () => clearInterval(pulse));
    });
    const trace = traceLoopback(server.port, tls.ca);
    const result = await createSendGridProfile(PROFILE, trace.io).prepare(submission()).submit(call(600));
    expect(result).toEqual({ ...UNCERTAIN, reason: 'provider_timeout' });
    expect(writes).toBeGreaterThan(2);
    expect(trace.responseObjects).toHaveLength(1);
    expect(server.posts).toHaveLength(1);
    await expectClosed(server, trace);
  });

  it('refuses complete response evidence at exact monotonic expiry even before its timer wakes', async () => {
    const { clock, advanceTo } = manualClock();
    const server = await https(({ socket }) => socket.write(fixedResponse(202)));
    const trace = traceLoopback(server.port, tls.ca, {
      clock,
      onRequest: (req) => req.on('response', (res) => res.prependOnceListener('end', () => advanceTo(50))),
    });
    const result = await createSendGridProfile(PROFILE, trace.io).prepare(submission()).submit(call(50));
    expect(result).toEqual({ ...UNCERTAIN, reason: 'provider_timeout' });
    await expectClosed(server, trace);
  });

  it.each([
    ['ESERVFAIL', 'unsubmitted', 'safe_transient', 'not_transmitted'],
    ['ENOTFOUND', 'unsubmitted', 'never', 'provider_configuration'],
    ['UNRECOGNIZED', 'unknown', 'never', 'transport_uncertain'],
  ])('classifies a recognized pre-HTTP DNS failure by phase (%s)', async (code, outcome, retry, reason) => {
    const fail: SendGridResolver['resolve4'] = (_host, cb) =>
      queueMicrotask(() => cb(Object.assign(new Error('synthetic private DNS error'), { code }), []));
    const never = vi.fn(() => {
      throw new Error('Unexpected I/O');
    });
    const cancel = vi.fn();
    const provider = createSendGridProfile(PROFILE, {
      resolver: () => ({ resolve4: fail, resolve6: fail, cancel }),
      connect: never,
      request: never,
    });
    await expect(provider.prepare(submission()).submit(call())).resolves.toEqual({
      outcome,
      retry,
      reason,
      stage: 'connect',
    });
    expect(cancel).toHaveBeenCalledExactlyOnceWith();
    expect(never).not.toHaveBeenCalled();
  });
});
