import { createHash, randomUUID } from 'node:crypto';
import { createSocket } from 'node:dgram';
import { Resolver } from 'node:dns';
import { once } from 'node:events';
import { setImmediate as nextTurn } from 'node:timers/promises';
import type { SecureContextOptions } from 'node:tls';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import type { ProviderCall, ProviderSubmission, SmtpSnapshot } from '../../src';
import { readProviderSubmission } from '../../src/internal/provider-preparation';
import type { SmtpResolverFactory } from '../../src/providers/smtp/connection';
import { prepareSmtpMessage } from '../../src/providers/smtp/mime';
import { readSmtpConfig } from '../../src/providers/smtp/options';
import { submitSmtp } from '../../src/providers/smtp/submit';
import { createSmtpProvider, type SmtpProviderOptions } from '../../src/smtp';
import { latch, LOOPBACK, openLoopbackSmtp } from './loopback';
import { base64Body, decodeMimeWords, parseMime } from './mime-fixture';
import { createSmtpTlsFixture, TLS_NAME } from './tls-fixture';

const AUTH = { user: 'synthetic-user', pass: 'synthetic-password' };
const FIXED_250 = '250 2.0.0 synthetic private response\r\n';
const PAYLOAD_TEXT = ' Beginning\rfirst\n.second\r\n.\r\nÚltimo \t\u0000 ';
const PAYLOAD_HTML = '<p>Exact &amp; frozen 🌿</p>\n<img src="https://never-fetched.invalid/">';
const PAYLOAD_SUBJECT = `   =?UTF-8?B?ZW5jb2RlZA==?= ${'snapshot 🌿 '.repeat(12)}  `;
const DEFAULT_ENVELOPE = {
  from: { address: 'Sender@Example.INVALID', name: 'Test, Sender' },
  to: [{ address: 'Primary+Exact@Example.INVALID', name: 'Visíble' }],
  cc: [{ address: 'Copy@Example.INVALID' }],
  bcc: [{ address: 'Blind@example.invalid', name: 'Must not be visible' }],
  replyTo: { address: 'Reply@Example.INVALID' },
};
const TO = DEFAULT_ENVELOPE.to[0]!.address;
const CC = DEFAULT_ENVELOPE.cc[0]!.address;
const BCC = DEFAULT_ENVELOPE.bcc[0]!.address;
const RECIPIENTS = [
  { group: 'to', index: 0, status: 'accepted' },
  { group: 'cc', index: 0, status: 'accepted' },
  { group: 'bcc', index: 0, status: 'accepted' },
] as const;
const EHLO = 'EHLO email.invalid';
const MAIL = `MAIL FROM:<${DEFAULT_ENVELOPE.from.address}>`;
const RCPTS = [TO, CC, BCC].map((address) => `RCPT TO:<${address}>`);
const SMTP_CONFIG = { key: 'relay', host: LOOPBACK, tls: 'implicit' } satisfies SmtpProviderOptions;

function attachment(
  bytes: Uint8Array = Uint8Array.of(0x41, 0x00, 0xd, 0x2e, 0xa, 0xff),
  filename = 'packet.bin',
  contentType = 'application/octet-stream',
) {
  return {
    ref: {
      resolverKey: 'fixture',
      id: 'synthetic',
      version: 'v1',
      filename,
      contentType,
      byteLength: bytes.length,
      sha256: createHash('sha256').update(bytes).digest('hex'),
    },
    bytes,
  };
}

function submission(
  settings: Partial<SmtpSnapshot> = {},
  attachments: ProviderSubmission<SmtpSnapshot>['attachments'] = [],
): ProviderSubmission<SmtpSnapshot> {
  return {
    jobId: randomUUID(),
    attemptId: randomUUID(),
    snapshot: {
      version: 1,
      kind: 'smtp',
      provider: { kind: 'smtp', key: SMTP_CONFIG.key, mode: 'live' },
      template: { key: 'example', revision: 'v1' },
      envelope: DEFAULT_ENVELOPE,
      preparedAt: 10_000,
      expiresAt: 20_000,
      priority: 0,
      attachments: attachments.map(({ ref }) => ref),
      correlation: {},
      subject: PAYLOAD_SUBJECT,
      text: PAYLOAD_TEXT,
      html: PAYLOAD_HTML,
      ...settings,
    },
    attachments,
  };
}

function call(timeoutMs = 2_000, signal = new AbortController().signal): ProviderCall {
  return { timeoutMs, signal };
}

let tls: ReturnType<typeof createSmtpTlsFixture>;
const open: Awaited<ReturnType<typeof openLoopbackSmtp>>[] = [];
type RelayOptions = Omit<Parameters<typeof openLoopbackSmtp>[0], 'tls' | 'server'>;
async function relay(mode: SmtpProviderOptions['tls'], plan: RelayOptions = {}, security: SecureContextOptions = {}) {
  const server = await openLoopbackSmtp({ tls: mode, server: { ...tls.server, ...security }, ...plan });
  open.push(server);
  return { ...server, options: { ...SMTP_CONFIG, port: server.port, tls: mode, ca: [tls.ca] } };
}

async function closedPeer(server: Awaited<ReturnType<typeof relay>>) {
  expect(server.peers).toHaveLength(1);
  const peer = server.peers[0]!;
  await peer.closed;
  return peer;
}

async function withDnsServer(run: (dns: ReturnType<typeof createSocket>) => Promise<void>) {
  const dns = createSocket('udp4');
  const listening = once(dns, 'listening');
  dns.bind(0, LOOPBACK);
  await listening;
  try {
    await run(dns);
  } finally {
    await new Promise<void>((resolve) => dns.close(resolve));
  }
}

function localResolver(dns: ReturnType<typeof createSocket>, timeout: number): Resolver {
  const resolver = new Resolver({ tries: 1, timeout });
  resolver.setServers([`${LOOPBACK}:${dns.address().port}`]);
  return resolver;
}

beforeAll(() => {
  tls = createSmtpTlsFixture();
});
afterEach(async () => {
  for (const server of open.splice(0)) await server.close();
});
afterAll(() => tls?.close());

describe('SMTP preflight and ownership', () => {
  it('uses fixed default ports and rejects accessors, unverified transport options and non-CA material', () => {
    expect(readSmtpConfig(SMTP_CONFIG).port).toBe(465);
    expect(readSmtpConfig({ ...SMTP_CONFIG, tls: 'starttls' }).port).toBe(587);
    expect(readSmtpConfig({ ...SMTP_CONFIG, host: '::1' }).identity).toBe('::1');
    expect(readSmtpConfig({ ...SMTP_CONFIG, ca: [tls.ca.replaceAll('\n', '\r\n')] }).secureContext).toBeDefined();
    const hidden = Object.defineProperty({ ...SMTP_CONFIG }, 'port', { value: 25 });
    const accessor = optionWithGetter();
    for (const options of [
      { tls: 'plaintext' },
      { tls: undefined },
      { host: 'smtp://localhost' },
      { host: ' localhost' },
      { host: 'localhost:587' },
      { host: '[::1]' },
      { host: '::1%eth0' },
      { servername: '127.0.0.1' },
      { servername: '.loopback.invalid' },
      { key: '__broken' },
      { port: 0 },
      { port: 65_536 },
      { port: undefined },
      { port: '465' },
      { ca: [] },
      { ca: new Array(1) },
      { ca: ['synthetic-private-material'] },
      { ca: [tls.server.cert] },
      { ca: [tls.ca + tls.ca] },
      { ca: [tls.ca.replace('END CERTIFICATE', 'END PRIVATE KEY')] },
      { auth: { user: 'one', pass: 'two\0three' } },
      { auth: { user: '', pass: 'synthetic' } },
      { auth: { user: 'x', pass: '' } },
      { auth: { ...AUTH, method: 'LOGIN' } },
      { pool: true },
      { rejectUnauthorized: false },
      { ignoreTLS: true },
      { opportunisticTLS: true },
      { logger: true },
    ]) {
      expect(() => createSmtpProvider({ ...SMTP_CONFIG, ...options } as SmtpProviderOptions)).toThrow(
        expect.objectContaining({ code: 'invalid_config', message: 'Invalid email service configuration.' }),
      );
    }
    expect(() => createSmtpProvider(hidden)).toThrow(expect.objectContaining({ code: 'invalid_config' }));
    expect(() => createSmtpProvider(accessor)).toThrow(expect.objectContaining({ code: 'invalid_config' }));
    expect(() => createSmtpProvider(new Proxy(SMTP_CONFIG, {}))).toThrow(
      expect.objectContaining({ code: 'invalid_config' }),
    );
  });

  it('validates snapshot/profile/IDs and attachment correspondence before any wire work or implicit access', async () => {
    const server = await relay('implicit');
    const provider = createSmtpProvider(server.options);
    const testAttachment = attachment();
    const input = submission({}, [testAttachment]);
    const noNetworkInputs = [
      { ...input, raw: 'packet' },
      { ...input, jobId: 'mongo-or-other-id' },
      { ...input, attemptId: 'not-a-v4-uuid' },
      { ...input, snapshot: { ...input.snapshot, subject: 'bad\r\nsubject' } },
      { ...input, snapshot: { ...input.snapshot, text: { path: 'synthetic-secret.txt' } } },
      { ...input, snapshot: { ...input.snapshot, html: { href: 'https://never-fetched.invalid/' } } },
      { ...input, snapshot: { ...input.snapshot, disableFileAccess: false } },
      { ...input, attachments: [{ ...testAttachment, path: 'synthetic-secret.txt' }] },
      { ...input, attachments: [{ ...testAttachment, bytes: 'https://never-fetched.invalid/' }] },
      { ...input, attachments: [{ ...testAttachment, bytes: Buffer.alloc(testAttachment.bytes.length) }] },
      { ...input, attachments: [{ ...testAttachment, bytes: new Uint8Array(1) }] },
      {
        ...input,
        attachments: [{ ...testAttachment, bytes: new Uint8Array(new SharedArrayBuffer(testAttachment.bytes.length)) }],
      },
      { ...input, attachments: [{ ...testAttachment, ref: { ...testAttachment.ref, filename: 'wrong.bin' } }] },
      { ...input, attachments: [] },
      submission({}, [attachment(Uint8Array.of(0), 'part.mime', 'multipart/mixed')]),
    ];
    for (const candidate of noNetworkInputs) {
      expect(() => provider.prepare(candidate as ProviderSubmission<SmtpSnapshot>)).toThrow(
        expect.objectContaining({ code: 'invalid_snapshot' }),
      );
    }
    expect(() => provider.prepare(submission({ provider: { ...provider.ref, key: 'other' } }))).toThrow(
      expect.objectContaining({ code: 'provider_mismatch' }),
    );
    const prepared = provider.prepare(input);
    expect(Object.isFrozen(provider) && Object.isFrozen(provider.ref) && Object.isFrozen(prepared)).toBe(true);
    for (const context of [call(0), call(60_001), call(1.5), { signal: {}, timeoutMs: 50 }]) {
      await expect(prepared.submit(context as ProviderCall)).rejects.toMatchObject({ code: 'invalid_config' });
    }
    const abort = new AbortController();
    abort.abort(new Error('synthetic private abort cause'));
    await expect(prepared.submit(call(2_000, abort.signal))).resolves.toEqual({
      outcome: 'unknown',
      retry: 'never',
      stage: 'connect',
      reason: 'provider_aborted',
    });
    await expect(prepared.submit(call())).rejects.toMatchObject({ code: 'closed' });
    await nextTurn();
    expect(server.peers).toHaveLength(0);
  });

  it('detaches exact MIME/envelope, attachment views, CA, credentials and configuration before sending', async () => {
    const server = await relay('implicit');
    const auth = { ...AUTH };
    const ca = [tls.ca];
    const options = { ...server.options, ca, auth };
    const provider = createSmtpProvider(options);
    const destination = { ...DEFAULT_ENVELOPE.to[0]! };
    const backing = Buffer.from([1, 2, 0x0d, 0x0a, 0, 0x2e, 0xfe, 4, 8]);
    const binaryView = backing.subarray(2, 7);
    const first = attachment(binaryView);
    const second = attachment(Buffer.from('opaque\rmore\n\0téxt'), 'as-text.txt', 'text/plain');
    const expected = [Buffer.from(first.bytes), Buffer.from(second.bytes)];
    const input = submission({ envelope: { ...DEFAULT_ENVELOPE, to: [destination] } }, [first, second]);
    const prepared = provider.prepare(input);
    destination.address = 'wrong@example.invalid';
    first.ref.filename = 'wrong.bin';
    backing.fill(0);
    second.bytes.fill(0);
    ca[0] = 'invalid';
    auth.pass = 'mutated';
    options.tls = 'starttls';
    options.port = 1;
    expect(server.peers).toHaveLength(0);

    const result = prepared.submit(call());
    await expect(prepared.submit(call())).rejects.toMatchObject({ code: 'closed' });
    const messageId = `<${input.attemptId}@email.invalid>`;
    const confirmation = await result;
    expect(confirmation).toEqual({
      outcome: 'accepted',
      stage: 'data',
      retry: 'never',
      reason: 'smtp_accepted',
      recipients: RECIPIENTS,
      messageId,
    });
    expect(Object.isFrozen(confirmation)).toBe(true);
    expect(Object.isFrozen(confirmation.recipients)).toBe(true);
    const peer = await closedPeer(server);
    expect(peer.plaintext).toEqual([]);
    expect(peer.protocol).toMatch(/^TLSv1\.[23]$/);
    expect(peer.sni).toBe(false); // IP SAN verification does not send an IP as SNI.
    expect(peer.secure).toEqual([
      EHLO,
      `AUTH PLAIN ${Buffer.from(`\0${AUTH.user}\0${AUTH.pass}`).toString('base64')}`,
      MAIL,
      ...RCPTS,
      'DATA',
    ]);
    expect(peer.messages).toHaveLength(1);
    const wire = peer.messages[0]!;
    expect(wire).not.toContain(BCC);
    expect(wire).not.toContain('Must not be visible');
    const mime = parseMime(wire);
    expect(mime.headers.has('bcc')).toBe(false);
    expect(mime.headers.get('message-id')).toBe(messageId);
    expect(decodeMimeWords(mime.headers.get('subject')!)).toBe(PAYLOAD_SUBJECT);
    expect(decodeMimeWords(mime.headers.get('from')!)).toBe(`Test, Sender <${DEFAULT_ENVELOPE.from.address}>`);
    expect(decodeMimeWords(mime.headers.get('to')!)).toBe(`Visíble <${TO}>`);
    expect(mime.headers.get('cc')).toBe(CC);
    expect(mime.headers.get('reply-to')).toBe(DEFAULT_ENVELOPE.replyTo.address);
    expect(mime.headers.get('content-type')).toMatch(/^multipart\/mixed;/);
    expect(mime.parts).toHaveLength(3);
    const [alternative, binary, asText] = mime.parts;
    expect(alternative!.headers.get('content-type')).toMatch(/^multipart\/alternative;/);
    expect(alternative!.parts).toHaveLength(2);
    const [text, html] = alternative!.parts;
    expect(base64Body(text!, 'text/plain; charset=utf-8')).toEqual(Buffer.from(PAYLOAD_TEXT));
    expect(base64Body(html!, 'text/html; charset=utf-8')).toEqual(Buffer.from(PAYLOAD_HTML));
    expect(base64Body(binary!, 'application/octet-stream; name=packet.bin')).toEqual(expected[0]);
    expect(binary!.headers.get('content-disposition')).toBe('attachment; filename=packet.bin');
    expect(base64Body(asText!, 'text/plain; name=as-text.txt')).toEqual(expected[1]);
    expect(asText!.headers.get('content-disposition')).toBe('attachment; filename=as-text.txt');
  });

  it.each(['cc', 'bcc'] as const)('keeps %s-only addressing without inventing a To header', async (group) => {
    const server = await relay('implicit');
    const provider = createSmtpProvider(server.options);
    const input = submission({
      envelope: { ...DEFAULT_ENVELOPE, to: [], cc: [], bcc: [], [group]: DEFAULT_ENVELOPE[group] },
      text: '',
    });
    const result = await provider.prepare(input).submit(call());
    expect(result.recipients).toEqual([{ group, index: 0, status: 'accepted' }]);
    const peer = await closedPeer(server);
    const address = DEFAULT_ENVELOPE[group][0]!.address;
    expect(peer.secure).toEqual([EHLO, MAIL, `RCPT TO:<${address}>`, 'DATA']);
    const mime = parseMime(peer.messages[0]!);
    expect(mime.headers.has('to')).toBe(false);
    expect(mime.headers.has('bcc')).toBe(false);
    expect(mime.headers.get('cc')).toBe(group === 'cc' ? address : undefined);
    expect(mime.parts).toHaveLength(2);
    expect(base64Body(mime.parts[0]!, 'text/plain; charset=utf-8')).toHaveLength(0);
  });
});

function optionWithGetter(): SmtpProviderOptions {
  return Object.defineProperty({ ...SMTP_CONFIG }, 'port', {
    enumerable: true,
    get() {
      throw new Error('Unexpected option accessor read');
    },
  });
}

describe('SMTP TLS and authentication', () => {
  it('requires STARTTLS, validates SNI/identity, discards cleartext capabilities and authenticates over TLS', async () => {
    const server = await relay('starttls', {
      reply: (step, peer) => {
        if (step === 'ehlo' && peer.protocol) return '250-loopback\r\n250 AUTH LOGIN\r\n';
      },
    });
    const provider = createSmtpProvider({ ...server.options, servername: TLS_NAME, auth: AUTH });
    await expect(provider.prepare(submission()).submit(call())).resolves.toMatchObject({ reason: 'smtp_accepted' });
    const peer = await closedPeer(server);
    expect(peer.plaintext).toEqual([EHLO, 'STARTTLS']);
    expect(peer.sni).toBe(TLS_NAME);
    expect(peer.secure).toEqual([
      EHLO,
      'AUTH LOGIN',
      Buffer.from(AUTH.user).toString('base64'),
      Buffer.from(AUTH.pass).toString('base64'),
      MAIL,
      ...RCPTS,
      'DATA',
    ]);
  });

  it('uses an AUTH challenge when the initial PLAIN command would exceed the SMTP line bound', async () => {
    const server = await relay('implicit');
    const auth = { user: AUTH.user, pass: '🌿'.repeat(160) };
    const provider = createSmtpProvider({ ...server.options, auth });
    await expect(provider.prepare(submission()).submit(call())).resolves.toMatchObject({ reason: 'smtp_accepted' });
    const peer = await closedPeer(server);
    expect(peer.secure.slice(0, 4)).toEqual([
      EHLO,
      'AUTH PLAIN',
      Buffer.from(`\0${auth.user}\0${auth.pass}`).toString('base64'),
      MAIL,
    ]);
  });

  it.each(['implicit', 'starttls'] as const)(
    'does not send AUTH or fall back after an untrusted %s certificate',
    async (mode) => {
      const server = await relay(mode);
      const provider = createSmtpProvider({ ...SMTP_CONFIG, port: server.port, tls: mode, auth: AUTH });
      await expect(provider.prepare(submission()).submit(call())).resolves.toEqual({
        outcome: 'unsubmitted',
        retry: 'never',
        stage: 'tls',
        reason: 'provider_configuration',
      });
      const peer = await closedPeer(server);
      expect(peer.plaintext).toEqual(mode === 'implicit' ? [] : [EHLO, 'STARTTLS']);
      expect(peer.secure).toEqual([]);
      expect(peer.messages).toHaveLength(0);
    },
  );

  it('rejects the wrong DNS identity even with the trusted issuing CA', async () => {
    const server = await relay('starttls');
    const provider = createSmtpProvider({ ...server.options, servername: 'different.loopback.invalid', auth: AUTH });
    await expect(provider.prepare(submission()).submit(call())).resolves.toMatchObject({
      outcome: 'unsubmitted',
      retry: 'never',
      stage: 'tls',
      reason: 'provider_configuration',
    });
    const peer = await closedPeer(server);
    expect(peer.plaintext).toEqual([EHLO, 'STARTTLS']);
    expect(peer.secure).toEqual([]);
  });

  it('negotiates TLS 1.2 when it is the only supported verified protocol', async () => {
    const server = await relay('implicit', {}, { minVersion: 'TLSv1.2', maxVersion: 'TLSv1.2' });
    const provider = createSmtpProvider({ ...server.options, auth: AUTH });
    await expect(provider.prepare(submission()).submit(call())).resolves.toMatchObject({ reason: 'smtp_accepted' });
    expect((await closedPeer(server)).protocol).toBe('TLSv1.2');
  });

  it('does not send commands to a relay limited to TLS 1.1', async () => {
    const server = await relay(
      'implicit',
      {},
      { minVersion: 'TLSv1.1', maxVersion: 'TLSv1.1', ciphers: 'DEFAULT:@SECLEVEL=0' },
    );
    const provider = createSmtpProvider({ ...server.options, auth: AUTH });
    await expect(provider.prepare(submission()).submit(call())).resolves.toMatchObject({
      stage: 'tls',
      retry: 'never',
    });
    const peer = await closedPeer(server);
    expect(peer.protocol).toBeNull();
    expect(peer.plaintext).toEqual([]);
    expect(peer.secure).toEqual([]);
  });

  it('fails closed when the plaintext relay advertises AUTH but not STARTTLS', async () => {
    const server = await relay('starttls', {
      reply: (step) => (step === 'ehlo' ? '250-loopback\r\n250 AUTH PLAIN LOGIN\r\n' : undefined),
    });
    const provider = createSmtpProvider({ ...server.options, auth: AUTH });
    await expect(provider.prepare(submission()).submit(call())).resolves.toEqual({
      outcome: 'unsubmitted',
      retry: 'never',
      stage: 'tls',
      reason: 'provider_configuration',
    });
    const peer = await closedPeer(server);
    expect(peer.plaintext).toEqual([EHLO]);
    expect(peer.secure).toEqual([]);
  });
});

describe('SMTP reply evidence', () => {
  it('records only confirmed group/index subsets, with no replay of successful recipients', async () => {
    const passed = { address: 'Another@Example.INVALID' };
    const server = await relay('implicit', {
      reply: (step, _session, line) => {
        if (step === 'rcpt' && line.includes(passed.address)) return '251 will forward\r\n';
        if (step === 'rcpt' && line.includes(CC)) return '550 5.1.1 synthetic private refusal\r\n';
        if (step === 'rcpt' && line.includes(BCC)) return '450 4.2.0 synthetic private deferred\r\n';
        if (step === 'final') return FIXED_250;
      },
    });
    const input = submission({ envelope: { ...DEFAULT_ENVELOPE, to: [...DEFAULT_ENVELOPE.to, passed] } });
    const provider = createSmtpProvider(server.options);
    await expect(provider.prepare(input).submit(call())).resolves.toEqual({
      outcome: 'partially_accepted',
      retry: 'never',
      stage: 'data',
      reason: 'smtp_partial',
      messageId: `<${input.attemptId}@email.invalid>`,
      recipients: [
        RECIPIENTS[0],
        { ...RECIPIENTS[0], index: 1 },
        { ...RECIPIENTS[1], status: 'rejected' },
        { ...RECIPIENTS[2], status: 'rejected' },
      ],
    });
    const peer = await closedPeer(server);
    expect(peer.secure).toEqual([EHLO, MAIL, RCPTS[0], `RCPT TO:<${passed.address}>`, ...RCPTS.slice(1), 'DATA']);
    expect(peer.messages).toHaveLength(1);
  });

  it.each([
    [[451, 452, 450], 'safe_transient'],
    [[451, 550, 450], 'never'],
    [[550, 451, 450], 'never'],
    [[450, 451, 550], 'never'],
  ] as const)('uses all RCPT replies (%j), not a first/last response shortcut', async (codes, retry) => {
    let idx = 0;
    const server = await relay('implicit', {
      reply: (step) => (step === 'rcpt' ? `${codes[idx++]} synthetic private refusal\r\n` : undefined),
    });
    await expect(createSmtpProvider(server.options).prepare(submission()).submit(call())).resolves.toEqual({
      outcome: 'rejected',
      retry,
      stage: 'envelope',
      reason: retry === 'never' ? 'smtp_permanent_reply' : 'smtp_transient_reply',
      recipients: RECIPIENTS.map((r) => ({ ...r, status: 'rejected' })),
    });
    const peer = await closedPeer(server);
    expect(peer.secure).toEqual([EHLO, MAIL, ...RCPTS]);
    expect(peer.messages).toHaveLength(0);
  });

  it.each([
    ['greeting', 'connect', 421],
    ['greeting', 'connect', 554],
    ['starttls', 'tls', 454],
    ['starttls', 'tls', 502],
    ['auth', 'auth', 454],
    ['auth', 'auth', 535],
    ['mail', 'envelope', 452],
    ['mail', 'envelope', 550],
    ['data', 'data', 451],
    ['data', 'data', 554],
    ['final', 'data', 451],
    ['final', 'data', 554],
  ] as const)('normalizes a complete %s reply at %s (%d) without exposing it', async (denied, stage, code) => {
    const server = await relay(denied === 'starttls' ? 'starttls' : 'implicit', {
      reply: (step) => (step === denied ? `${code} synthetic private denial\r\n` : undefined),
    });
    const provider = createSmtpProvider({ ...server.options, auth: AUTH });
    await expect(provider.prepare(submission()).submit(call())).resolves.toEqual({
      outcome: 'rejected',
      stage,
      retry: code >= 500 ? 'never' : 'safe_transient',
      reason: code >= 500 ? 'smtp_permanent_reply' : 'smtp_transient_reply',
    });
    const peer = await closedPeer(server);
    expect(peer.messages).toHaveLength(denied === 'final' ? 1 : 0);
    if (denied === 'auth') expect(peer.secure).not.toContain(MAIL);
    if (denied === 'starttls') expect(peer.plaintext).toEqual([EHLO, 'STARTTLS']);
  });

  it('does not retry a whole envelope on a final 4xx following a permanent RCPT refusal', async () => {
    const server = await relay('implicit', {
      reply: (step, _peer, line) => {
        if (step === 'rcpt' && line.includes(CC)) return '550 refused copy\r\n';
        if (step === 'final') return '451 refused remainder\r\n';
      },
    });
    await expect(createSmtpProvider(server.options).prepare(submission()).submit(call())).resolves.toEqual({
      outcome: 'rejected',
      retry: 'never',
      stage: 'data',
      reason: 'smtp_permanent_reply',
      recipients: [{ ...RECIPIENTS[1], status: 'rejected' }],
    });
    expect((await closedPeer(server)).messages).toHaveLength(1);
  });

  it.each([
    '250x not a reply\r\n',
    '250-no final line\r\n251 different code\r\n',
    '250 bare LF\n',
    '251 positive but not DATA accepted\r\n',
    '250 first\r\n250 unsolicited\r\n',
    `250 ${'x'.repeat(510)}\r\n`,
  ])('does not treat a malformed or unexpected final reply as acceptance (%j)', async (reply) => {
    const server = await relay('implicit', { reply: (step) => (step === 'final' ? reply : undefined) });
    await expect(createSmtpProvider(server.options).prepare(submission()).submit(call())).resolves.toEqual({
      outcome: 'unknown',
      retry: 'never',
      stage: 'data',
      reason: 'transport_uncertain',
    });
    expect((await closedPeer(server)).messages).toHaveLength(1);
  });

  it('rejects a premature acceptance coalesced with DATA permission without streaming a message', async () => {
    const server = await relay('implicit', {
      reply: (step) => (step === 'data' ? `354 send message\r\n${FIXED_250}` : undefined),
    });
    await expect(createSmtpProvider(server.options).prepare(submission()).submit(call())).resolves.toEqual({
      outcome: 'unknown',
      retry: 'never',
      stage: 'data',
      reason: 'transport_uncertain',
    });
    expect((await closedPeer(server)).messages).toHaveLength(0);
  });

  it('waits for the final line of a valid split multiline DATA acknowledgement', async () => {
    const reply = latch<() => void>();
    const server = await relay('implicit', {
      reply: (step, peer) => {
        if (step === 'final') {
          peer.write('250-valid continuation\r\n250');
          reply.release(() => peer.write(' final acknowledgement\r\n'));
          return null;
        }
      },
    });
    const pending = createSmtpProvider(server.options).prepare(submission()).submit(call());
    const complete = await reply.reached;
    complete();
    await expect(pending).resolves.toMatchObject({ reason: 'smtp_accepted' });
    expect((await closedPeer(server)).messages).toHaveLength(1);
  });

  it('caps the aggregate DATA reply even when every individual line fits the SMTP limit', async () => {
    const text = 'x'.repeat(506);
    const full = `250-${text}\r\n`;
    const atLimit = full.repeat(31) + `250 ${text}\r\n`;
    const aboveLimit = full.repeat(31) + `250-${'x'.repeat(502)}\r\n250\r\n`;
    expect(Buffer.byteLength(atLimit)).toBe(16_384);
    expect(Buffer.byteLength(aboveLimit)).toBe(16_385);
    for (const [reply, reason] of [
      [atLimit, 'smtp_accepted'],
      [aboveLimit, 'transport_uncertain'],
    ] as const) {
      const server = await relay('implicit', { reply: (step) => (step === 'final' ? reply : undefined) });
      await expect(createSmtpProvider(server.options).prepare(submission()).submit(call())).resolves.toMatchObject({
        reason,
        retry: 'never',
        stage: 'data',
      });
      expect((await closedPeer(server)).messages).toHaveLength(1);
      expect(server.peers).toHaveLength(1);
    }
  });

  it.each([false, true])(
    'separates socket reset before DATA from reset after the terminator (%j)',
    async (afterDot) => {
      const server = await relay('implicit', {
        reply: (step, peer) => {
          if (step === (afterDot ? 'final' : 'mail')) {
            peer.reset();
            return null;
          }
        },
      });
      await expect(createSmtpProvider(server.options).prepare(submission()).submit(call())).resolves.toEqual(
        afterDot
          ? { outcome: 'unknown', retry: 'never', stage: 'data', reason: 'transport_uncertain' }
          : { outcome: 'unsubmitted', retry: 'safe_transient', stage: 'envelope', reason: 'not_transmitted' },
      );
      expect((await closedPeer(server)).messages).toHaveLength(afterDot ? 1 : 0);
    },
  );

  it('does not treat a truncated negative final reply followed by disconnect as definitive nonacceptance', async () => {
    const server = await relay('implicit', {
      reply: (step, peer) => {
        if (step === 'final') {
          peer.end('451 incomplete reply without CRLF');
          return null;
        }
      },
    });
    await expect(createSmtpProvider(server.options).prepare(submission()).submit(call())).resolves.toEqual({
      outcome: 'unknown',
      retry: 'never',
      stage: 'data',
      reason: 'transport_uncertain',
    });
    expect((await closedPeer(server)).messages).toHaveLength(1);
  });
});

describe('SMTP deadline and real cancellation', () => {
  it('closes an ongoing STARTTLS handshake at the absolute deadline despite incoming TLS records', async () => {
    const handshake = latch<{ kind: number | undefined; pulses(): number }>();
    const server = await relay('starttls', {
      stallHandshake(peer, clientHello) {
        // A partial TLS handshake record, not a valid ServerHello. Never finish the handshake.
        peer.write(Buffer.of(22, 3, 3, 2, 0));
        handshake.release({ kind: clientHello[0], pulses: peer.pulse(Buffer.of(0)) });
      },
    });
    const provider = createSmtpProvider({ ...server.options, auth: AUTH });
    const pending = provider.prepare(submission()).submit(call(350));
    const { kind, pulses } = await handshake.reached;
    expect(kind).toBe(22);
    await expect(pending).resolves.toEqual({
      outcome: 'unknown',
      retry: 'never',
      stage: 'tls',
      reason: 'provider_timeout',
    });
    const peer = await closedPeer(server);
    expect(pulses()).toBeGreaterThan(2);
    expect(peer.plaintext).toEqual([EHLO, 'STARTTLS']);
    expect(peer.secure).toEqual([]);
  });

  it('destroys an implicit TLS handshake on abort without starting another socket', async () => {
    const arrived = latch<void>();
    const server = await relay('implicit', { stallHandshake: () => arrived.release() });
    const abort = new AbortController();
    const pending = createSmtpProvider({ ...server.options, auth: AUTH })
      .prepare(submission())
      .submit(call(2_000, abort.signal));
    await arrived.reached;
    abort.abort();
    await expect(pending).resolves.toEqual({
      outcome: 'unknown',
      retry: 'never',
      stage: 'tls',
      reason: 'provider_aborted',
    });
    expect((await closedPeer(server)).secure).toEqual([]);
  });

  it('closes AUTH while waiting for a reply; a late success cannot launch MAIL', async () => {
    const seen = latch<Parameters<NonNullable<RelayOptions['reply']>>[1]>();
    const server = await relay('starttls', {
      reply: (step, peer) => {
        if (step !== 'auth') return;
        peer.write('235-not complete\r\n');
        peer.pulse('235-still waiting\r\n');
        seen.release(peer);
        return null;
      },
    });
    const abort = new AbortController();
    const pending = createSmtpProvider({ ...server.options, auth: AUTH })
      .prepare(submission())
      .submit(call(2_000, abort.signal));
    const peer = await seen.reached;
    expect(peer.secure).toHaveLength(2);
    abort.abort({ private: 'synthetic-abort-reason' });
    peer.write('235 never use this success\r\n');
    await expect(pending).resolves.toEqual({
      outcome: 'unknown',
      retry: 'never',
      stage: 'auth',
      reason: 'provider_aborted',
    });
    await closedPeer(server);
    expect(peer.secure).toHaveLength(2);
    expect(peer.messages).toHaveLength(0);
  });

  it('destroys the active DATA stream and socket before finishing on abort', async () => {
    const abort = new AbortController();
    let sawBody = false;
    const server = await relay('implicit', {
      bodyLine() {
        if (!sawBody) {
          sawBody = true;
          abort.abort();
        }
      },
    });
    const input = submission({}, [attachment(Buffer.alloc(2 * 1024 * 1024, 0x21))]);
    await expect(createSmtpProvider(server.options).prepare(input).submit(call(2_000, abort.signal))).resolves.toEqual({
      outcome: 'unknown',
      retry: 'never',
      stage: 'data',
      reason: 'provider_aborted',
    });
    const peer = await closedPeer(server);
    expect(sawBody).toBe(true);
    expect(peer.messages).toHaveLength(0); // No subsequent body terminator reached the peer.
  });

  it('closes the post-DATA socket despite continued progress and does not recognize a late 250', async () => {
    const final = latch<{ pulseCount(): number; finish(): void }>();
    const server = await relay('implicit', {
      reply: (step, peer) => {
        if (step === 'final') {
          peer.write('250-progress so far\r\n');
          const pulseCount = peer.pulse('250-progress again\r\n');
          final.release({ pulseCount, finish: () => peer.write(FIXED_250) });
          return null;
        }
      },
    });
    const pending = createSmtpProvider(server.options).prepare(submission()).submit(call(350));
    const { pulseCount, finish } = await final.reached;
    await expect(pending).resolves.toEqual({
      outcome: 'unknown',
      retry: 'never',
      stage: 'data',
      reason: 'provider_timeout',
    });
    finish();
    expect(pulseCount()).toBeGreaterThan(2);
    const peer = await closedPeer(server);
    expect(peer.messages).toHaveLength(1);
    expect(peer.secure).toEqual([EHLO, MAIL, ...RCPTS, 'DATA']);
  });

  it('cancels an active DNS resolver talking only to an isolated loopback nameserver', async () => {
    const server = await relay('implicit');
    await withDnsServer(async (dns) => {
      const queries = once(dns, 'message', { signal: AbortSignal.timeout(1_500) });
      const abort = new AbortController();
      const config = readSmtpConfig({ ...server.options, host: TLS_NAME });
      const message = prepareSmtpMessage(readProviderSubmission(submission(), config.ref));
      let canceled = 0;
      const seen = latch<string | undefined>();
      const factory: SmtpResolverFactory = (timeout) => {
        const resolver = localResolver(dns, timeout);
        return {
          resolve4: (host, callback) =>
            resolver.resolve4(host, (error, addresses) => {
              seen.release(error?.code);
              callback(error, addresses);
            }),
          resolve6: resolver.resolve6.bind(resolver),
          cancel() {
            canceled++;
            resolver.cancel();
          },
        };
      };
      const pending = submitSmtp(config, message, call(2_000, abort.signal), factory);
      await queries;
      abort.abort();
      await expect(pending).resolves.toEqual({
        outcome: 'unknown',
        retry: 'never',
        stage: 'connect',
        reason: 'provider_aborted',
      });
      expect(await seen.reached).toBe('ECANCELLED');
      expect(canceled).toBe(1);
      expect(server.peers).toHaveLength(0);
    });
  });

  it('dials one resolved loopback address but authenticates the configured DNS identity', async () => {
    const server = await relay('implicit');
    await withDnsServer(async (dns) => {
      dns.on('message', (query, sender) => {
        // Answer a real c-ares A question with one synthetic IPv4 record; no AAAA records.
        let type = 12;
        while (type < query.length && query[type]) type += query[type]! + 1;
        type++;
        const a = query.readUInt16BE(type) === 1;
        const header = Buffer.alloc(12);
        header.writeUInt16BE(query.readUInt16BE(0), 0);
        header.writeUInt16BE(0x8180, 2);
        header.writeUInt16BE(1, 4);
        header.writeUInt16BE(+a, 6);
        const answer = a ? Buffer.from([0xc0, 0x0c, 0, 1, 0, 1, 0, 0, 0, 1, 0, 4, 127, 0, 0, 1]) : Buffer.alloc(0);
        dns.send([header, query.subarray(12, type + 4), answer], sender.port, LOOPBACK);
      });
      const config = readSmtpConfig({ ...server.options, host: TLS_NAME });
      const message = prepareSmtpMessage(readProviderSubmission(submission(), config.ref));
      await expect(
        submitSmtp(config, message, call(), (timeout) => localResolver(dns, timeout)),
      ).resolves.toMatchObject({
        reason: 'smtp_accepted',
      });
      expect((await closedPeer(server)).sni).toBe(TLS_NAME);
    });
  });

  it('fences callbacks resolving after cancellation or after monotonic expiry before timers can run', async () => {
    const server = await relay('implicit');
    const config = readSmtpConfig({ ...server.options, host: TLS_NAME });
    const message = prepareSmtpMessage(readProviderSubmission(submission(), config.ref));
    const abort = new AbortController();
    let respond!: (err: null, addresses: string[]) => void;
    let canceled = 0;
    const factory: SmtpResolverFactory = () => ({
      resolve4: (_name, callback) => {
        respond = callback;
      },
      resolve6() {},
      cancel() {
        canceled++;
      },
    });
    const pending = submitSmtp(config, message, call(2_000, abort.signal), factory);
    abort.abort();
    await expect(pending).resolves.toMatchObject({ reason: 'provider_aborted' });
    respond(null, [LOOPBACK]); // Simulated late, successful resolver callback.
    const stalled = submitSmtp(config, message, call(10), factory);
    // Simulate an event-loop stall while a stage is outstanding. The timer cannot run yet.
    Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 30);
    respond(null, [LOOPBACK]);
    await expect(stalled).resolves.toMatchObject({ reason: 'provider_timeout' });
    expect(canceled).toBe(2);
    expect(server.peers).toHaveLength(0);
  });
});
