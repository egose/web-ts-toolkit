import { expect, vi } from 'vitest';
import {
  createEmailTemplateRegistry,
  defineLocalTemplate,
  defineSendGridTemplate,
  type EmailCommand,
  type EmailTemplateRegistry,
  type PreparedEmailCommand,
  type ProviderRef,
  type ResolvedAttachment,
  type SmtpCapacity,
  type TemplateMap,
} from '../../src';
import { checkManagedAttachmentRetention } from '../../src/attachments';
import { createSendGridProfile } from '../../src/providers/sendgrid/profile';
import { createSmtpProvider } from '../../src/smtp';
import { SMTP } from '../conformance/store-fixtures';
import { fixedResponse, openLoopbackHttps, PROFILE, TEMPLATE_ID, traceLoopback } from '../sendgrid/fixtures';
import { atBarrier, openLoopbackSmtp } from '../smtp/loopback';
import { base64Body, decodeMimeWords, parseMime } from '../smtp/mime-fixture';
import { createSmtpTlsFixture, TLS_NAME } from '../smtp/tls-fixture';
import type { DeliveryFixture, ManagedFile } from './fixtures';

type File = ManagedFile | ResolvedAttachment;
const FROM = { address: 'sender@example.invalid' };
const TO = { address: 'recipient@example.invalid' };
const HTTP_HOST = 'api.sendgrid.com';
const subject = 'Synthetic managed-attachment delivery';
const body = (label: string) => `Fixture message: ${label}`;

function fields(files: readonly File[], recipients: number) {
  function parseData(value: unknown) {
    if (!value || typeof value !== 'object' || !('label' in value) || typeof value.label !== 'string')
      throw new Error('Expected a fixture label');
    return { label: value.label };
  }
  return {
    revision: 'r1',
    parseInput(value: unknown) {
      if (!value || typeof value !== 'object' || !('expiresAt' in value) || typeof value.expiresAt !== 'number')
        throw new Error('Expected a fixture expiration');
      return { ...parseData(value), expiresAt: value.expiresAt };
    },
    parseData,
    prepare: vi.fn(({ label, expiresAt }: { label: string; expiresAt: number }) => ({
      from: FROM,
      to:
        recipients === 1
          ? [TO]
          : Array.from({ length: recipients - 2 }, (_, i) => ({ address: `to-${i}@example.invalid` })),
      cc: recipients === 1 ? [] : [{ address: 'cc@example.invalid' }],
      bcc: recipients === 1 ? [] : [{ address: 'bcc@example.invalid' }],
      values: { label },
      expiresAt,
      attachments: files.map(({ ref }) => ref),
      correlation: { trace: 'mixed-delivery-fixture' },
    })),
  };
}

function command<P extends ProviderRef>(provider: P, label: string, expiresAt: number, scheduleAt?: number) {
  return {
    key: { kind: 'single', idempotencyKey: label },
    templateKey: 'notice',
    provider,
    input: { label, expiresAt },
    intent: { label, expiresAt },
    ...(scheduleAt === undefined ? {} : { scheduleAt }),
  } as const;
}

export function smtpProducer(files: readonly File[], smtpCapacity?: SmtpCapacity) {
  const definition = fields(files, smtpCapacity?.maxRecipients ?? 1);
  const registry = createEmailTemplateRegistry(
    {
      notice: defineLocalTemplate({
        ...definition,
        kind: 'handlebars',
        subject: { kind: 'inline', content: subject },
        text: { kind: 'inline', content: body('{{label}}') },
      }),
    },
    smtpCapacity ? { smtpCapacity } : {},
  );
  return {
    registry,
    prepare: definition.prepare,
    command: (label: string, expiresAt: number, scheduleAt?: number) => command(SMTP, label, expiresAt, scheduleAt),
  };
}

export function sendGridProducer(files: readonly File[]) {
  const definition = fields(files, 1);
  const registry = createEmailTemplateRegistry({
    notice: defineSendGridTemplate({ ...definition, kind: 'sendgrid', templateId: TEMPLATE_ID }),
  });
  return {
    registry,
    prepare: definition.prepare,
    command: (label: string, expiresAt: number) =>
      command({ kind: 'sendgrid', key: PROFILE.key, mode: 'live' } as const, label, expiresAt),
  };
}

export function checkStage(f: DeliveryFixture, staged: PreparedEmailCommand, files: readonly File[]) {
  return checkManagedAttachmentRetention(staged, {
    scope: staged.scope,
    stores: Object.values(f.writers),
    receipts: files.flatMap((file) => ('receipt' in file ? [file.receipt] : [])),
    ...f.lane,
  });
}

export async function stage<T extends TemplateMap>(
  f: DeliveryFixture,
  registry: EmailTemplateRegistry<T>,
  scope: string,
  command: EmailCommand<T>,
  files: readonly File[],
) {
  const prepared = await registry.prepare(scope, command);
  const checked = checkStage(f, prepared, files);
  expect(checked).toEqual(prepared);
  const serialized = JSON.stringify(checked);
  const outbox = parseOutbox(serialized);
  expect(outbox).toEqual(prepared);
  expect(outbox.version).toBe(1);
  expect(outbox.snapshot.version).toBe(1);
  expect(outbox.snapshot.attachments).toStrictEqual(files.map(({ ref }) => ref));
  for (const entry of files) expect(serialized).not.toContain(Buffer.from(entry.bytes).toString('base64'));
  for (const forbidden of ['"receipt"', '"deliverBy"', '"bytes"', '"bucket"', '"prefix"', '://', 'ma1/'])
    expect(serialized).not.toContain(forbidden);
  return { checked, serialized, outbox };
}

export function parseOutbox(serialized: string): PreparedEmailCommand {
  return JSON.parse(serialized) as PreparedEmailCommand;
}

export async function assertPersisted(f: DeliveryFixture, jobId: string, staged: PreparedEmailCommand) {
  const row = await f.jobs.findOne({ scope: staged.scope, jobId });
  expect(row).toMatchObject({ snapshotHash: staged.snapshotHash, fingerprint: staged.fingerprint });
  expect(row?.snapshot).toEqual(staged.snapshot);
}

export function expectRedacted(value: unknown, files: readonly File[]) {
  const json = JSON.stringify(value);
  for (const forbidden of [
    '"snapshot"',
    '"snapshotHash"',
    '"fingerprint"',
    '"attachments"',
    '"resolverKey"',
    '"filename"',
    '"sha256"',
    '"deliverBy"',
    'ma1/',
    '@example.invalid',
  ]) {
    expect(json).not.toContain(forbidden);
  }
  for (const { ref, bytes } of files) {
    for (const forbidden of [
      ref.resolverKey,
      ref.id,
      ref.version,
      ref.sha256,
      ref.filename,
      Buffer.from(bytes).toString('base64'),
    ])
      expect(json).not.toContain(forbidden);
  }
}

export async function smtpCapture(lifetime: AsyncDisposableStack, smtpCapacity?: SmtpCapacity, truncateAt?: number) {
  const tls = createSmtpTlsFixture();
  lifetime.defer(tls.close);
  let dataCount = 0;
  const relay = await openLoopbackSmtp({
    tls: 'implicit',
    server: tls.server,
    reply(step, peer) {
      if (step === 'final' && ++dataCount === truncateAt) {
        peer.end('451 incomplete fixture reply without CRLF');
        return null;
      }
    },
  });
  lifetime.defer(relay.close);
  const real = createSmtpProvider({
    key: SMTP.key,
    host: relay.host,
    port: relay.port,
    tls: 'implicit',
    ca: [tls.ca],
    servername: TLS_NAME,
    auth: { user: 'fixture-mail-user', pass: 'fixture-mail-password' },
    ...(smtpCapacity ? { smtpCapacity } : {}),
  });
  const provider = { ...real, prepare: vi.fn(real.prepare) };
  return {
    relay,
    provider,
    async assertWire(index: number, label: string, files: readonly File[], snapshot: PreparedEmailCommand['snapshot']) {
      const peer = relay.peers[index];
      if (!peer) throw new Error('Expected actual SMTP capture');
      await atBarrier(peer.closed, 'owned SMTP socket close');
      expect(peer.sni).toBe(TLS_NAME);
      expect(peer.secure.filter((line) => line.startsWith('RCPT TO:'))).toEqual(
        [...snapshot.envelope.to, ...snapshot.envelope.cc, ...snapshot.envelope.bcc].map(
          ({ address }) => `RCPT TO:<${address}>`,
        ),
      );
      expect(peer.messages).toHaveLength(1);
      const { headers, parts } = parseMime(peer.messages[0]!);
      expect(headers.get('content-type')).toMatch(/^multipart\/mixed;/);
      expect(decodeMimeWords(headers.get('subject')!)).toBe(subject);
      expect(headers.has('bcc')).toBe(false);
      expect(parts).toHaveLength(files.length + 1);
      expect(base64Body(parts[0]!, 'text/plain; charset=utf-8')).toEqual(Buffer.from(body(label)));
      for (const [i, { ref, bytes }] of files.entries()) {
        const part = parts[i + 1]!;
        expect(part.headers.get('content-disposition')).toBe(`attachment; filename=${ref.filename}`);
        expect(base64Body(part, `${ref.contentType}; name=${ref.filename}`)).toEqual(Buffer.from(bytes));
      }
    },
  };
}

export async function sendGridCapture(lifetime: AsyncDisposableStack, statuses: readonly number[] = []) {
  const tls = createSmtpTlsFixture(HTTP_HOST);
  lifetime.defer(tls.close);
  let response = 0;
  const capture = await openLoopbackHttps(tls.server, ({ socket }) =>
    socket.write(fixedResponse(statuses[response++] ?? 202)),
  );
  lifetime.defer(capture.close);
  const trace = traceLoopback(capture.port, tls.ca);
  const real = createSendGridProfile({ ...PROFILE, mode: 'live' }, trace.io);
  const provider = { ...real, prepare: vi.fn(real.prepare) };
  return {
    capture,
    trace,
    provider,
    async assertWire(index: number, label: string, files: readonly File[]) {
      const post = capture.posts[index];
      if (!post) throw new Error('Expected actual HTTPS capture');
      await atBarrier(capture.peers[index]!.closed, 'owned HTTPS socket close');
      expect(post.socket.servername).toBe(HTTP_HOST);
      expect(post.request.method).toBe('POST');
      expect(post.request.url).toBe('/v3/mail/send');
      expect(post.request.headers).toMatchObject({
        host: HTTP_HOST,
        authorization: `Bearer ${PROFILE.apiKey}`,
        'content-type': 'application/json',
        'content-length': String(post.body.length),
      });
      expect(JSON.parse(post.body.toString('utf8'))).toEqual({
        personalizations: [{ to: [{ email: TO.address }], dynamic_template_data: { label } }],
        from: { email: FROM.address },
        template_id: TEMPLATE_ID,
        attachments: files.map(({ ref, bytes }) => ({
          filename: ref.filename,
          type: ref.contentType,
          disposition: 'attachment',
          content: Buffer.from(bytes).toString('base64'),
        })),
      });
    },
  };
}
