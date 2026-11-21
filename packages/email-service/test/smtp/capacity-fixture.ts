import { performance } from 'node:perf_hooks';
import { afterAll, afterEach, beforeAll, expect } from 'vitest';
import {
  createEmailAdmin,
  createEmailService,
  createEmailWorker,
  createMemoryEmailStore,
  type EmailClock,
  type EmailProvider,
  type EmailRunReport,
  type EmailStore,
  type EmailWorker,
  type EmailWorkerLimits,
  type ProviderResult,
  type ResolvedAttachment,
  type SmtpSnapshot,
} from '../../src';
import { MESSAGE_LIMITS } from '../../src/constants';
import { systemEmailClock } from '../../src/internal/budget';
import { sha256 } from '../../src/internal/canonical-json';
import { createSmtpProvider } from '../../src/smtp';
import {
  capacity,
  capacityCommand,
  capacityTemplate,
  laneCall,
  stageMaximum,
} from '../conformance/smtp-capacity-fixture';
import { A, SMTP } from '../conformance/store-fixtures';
import { atBarrier, openLoopbackSmtp } from './loopback';
import { base64Body, decodeMimeWords, parseMime } from './mime-fixture';
import { createSmtpTlsFixture, TLS_NAME } from './tls-fixture';

const AUTH = { user: 'synthetic-user', pass: 'synthetic-password' };
const EHLO = 'EHLO email.invalid';
const AUTH_COMMAND = `AUTH PLAIN ${Buffer.from(`\0${AUTH.user}\0${AUTH.pass}`).toString('base64')}`;

export const ONE = { limit: 1, maintenanceLimit: 0 } as const;
export const COUNT = 1_000;
export const PRIVATE_REPLY = 'synthetic private capacity relay reply';
export const FINAL_250 = `250 ${PRIVATE_REPLY}\r\n`;
const MIB = 1024 * 1024;
const LARGE_ASSETS = [2 * MIB, 2 * MIB, MIB - 2, 1, 1];

type Relay = Awaited<ReturnType<typeof openLoopbackSmtp>>;
type Plan = Parameters<typeof openLoopbackSmtp>[0];
type Submission = { timeoutMs: number; elapsedMs?: number; result?: ProviderResult };

let tls: ReturnType<typeof createSmtpTlsFixture>;
const relays: Relay[] = [];
const workers: EmailWorker[] = [];

beforeAll(() => {
  tls = createSmtpTlsFixture();
});
afterEach(async () => {
  try {
    for (const worker of workers.splice(0)) await worker.shutdown();
  } finally {
    for (const relay of relays.splice(0)) await relay.close();
  }
});
afterAll(() => tls?.close());

export function fixedStoreTime() {
  let now = Date.now();
  return {
    ...systemEmailClock,
    now: () => now,
    advanceTo(next: number) {
      expect(next).toBeGreaterThanOrEqual(now);
      now = next;
    },
  };
}

/** All preparation, admission, transport and lifecycle logic is real. The observer only records submit's boundary. */
export async function scenario({
  mode = 'implicit',
  plan,
  large = false,
  clock = systemEmailClock,
  expiresAt,
  servername = TLS_NAME,
  trustFixture = true,
}: {
  mode?: Plan['tls'];
  plan?: Omit<Plan, 'tls' | 'server'>;
  large?: boolean;
  clock?: EmailClock;
  expiresAt?: number;
  servername?: string;
  trustFixture?: boolean;
} = {}) {
  const smtpCapacity = capacity(COUNT);
  const maximum = large ? await stageMaximum(smtpCapacity, clock.now(), LARGE_ASSETS) : undefined;
  const fixture =
    maximum ?? capacityTemplate(smtpCapacity, { clock, ...(expiresAt === undefined ? {} : { expiresAt }) });
  const staged = maximum?.staged ?? (await fixture.registry.prepare(A, capacityCommand()));
  const { snapshot } = staged;
  if (snapshot.kind !== 'smtp') throw new Error('Expected the fixture SMTP snapshot');
  const store = createMemoryEmailStore({ smtpCapacity, clock });
  await store.ready();
  const service = createEmailService({
    scope: A,
    smtpCapacity,
    store,
    registry: fixture.registry,
    retry: { maxAttempts: 3, baseDelayMs: 100, maxDelayMs: 100 },
  });
  const { job } = await service.enqueuePrepared(staged);
  const relay = await openLoopbackSmtp({
    tls: mode,
    server: tls.server,
    ...plan,
    reply(step, peer, line) {
      if (step === 'ehlo' && peer.protocol) return '250-loopback\r\n250-PIPELINING\r\n250 AUTH PLAIN\r\n';
      return plan?.reply?.(step, peer, line);
    },
  });
  relays.push(relay);
  const actual = createSmtpProvider({
    smtpCapacity,
    key: SMTP.key,
    host: relay.host,
    port: relay.port,
    tls: mode,
    ...(trustFixture ? { ca: [tls.ca] } : {}),
    servername,
    auth: AUTH,
  });
  const submissions: Submission[] = [];
  const provider: EmailProvider<SmtpSnapshot> = {
    ...actual,
    prepare(input) {
      const prepared = actual.prepare(input);
      return {
        async submit(call) {
          const sample: Submission = { timeoutMs: call.timeoutMs };
          submissions.push(sample);
          const start = performance.now();
          sample.result = await prepared.submit(call);
          sample.elapsedMs = performance.now() - start;
          return sample.result;
        },
      };
    },
  };
  const admin = createEmailAdmin({ scope: A, store, smtpCapacity });
  const call = laneCall(smtpCapacity);
  return {
    ...fixture,
    snapshot,
    job,
    store,
    call,
    smtpCapacity,
    admin,
    mode,
    relay,
    submissions,
    worker({ backing = store, limits }: { backing?: EmailStore; limits?: Partial<EmailWorkerLimits> } = {}) {
      const worker = createEmailWorker({
        scope: A,
        smtpCapacity,
        store: backing,
        providers: [provider],
        attachmentResolvers: fixture.attachmentResolvers,
        ...(limits ? { limits } : {}),
      });
      workers.push(worker);
      return worker;
    },
    readAttempt(attemptId: string) {
      return store.findAttempt(A, job.jobId, attemptId, call);
    },
  };
}

type Scenario = Awaited<ReturnType<typeof scenario>>;

const GROUPS = ['to', 'cc', 'bcc'] as const;
function destinations(snapshot: SmtpSnapshot) {
  return GROUPS.flatMap((group) => snapshot.envelope[group].map(({ address }, index) => ({ address, group, index })));
}

export function evidence(snapshot: SmtpSnapshot, statusAt: (ordinal: number) => 'accepted' | 'rejected') {
  return destinations(snapshot).map(({ group, index }, ordinal) => ({ group, index, status: statusAt(ordinal) }));
}

export function attemptId(
  report: EmailRunReport,
  { job }: Scenario,
  status: EmailRunReport['items'][number]['status'],
) {
  expect(report.items).toHaveLength(1);
  const item = report.items[0]!;
  expect(item).toMatchObject({ jobId: job.jobId, status, attemptId: expect.any(String) });
  return item.attemptId!;
}

export async function idle(s: Scenario, peers: number) {
  expect(await s.worker().run({ ...ONE, maintenanceLimit: 1 })).toMatchObject({
    stop: 'idle',
    items: [],
    counts: { providerCalls: 0 },
  });
  expect(s.submissions).toHaveLength(peers);
  expect(s.relay.peers).toHaveLength(peers);
}

export async function closedPeer(s: Scenario, index = 0) {
  const peer = s.relay.peers[index];
  if (!peer) throw new Error('Expected the SMTP peer');
  await atBarrier(peer.closed, 'SMTP socket close before fixture teardown');
  expect(peer.plaintext).toEqual(s.mode === 'starttls' ? [EHLO, 'STARTTLS'] : []);
  return peer;
}

/** Compare the entire secure conversation, including exact RCPT order and absence of extra transactions. */
export async function wire(
  s: Scenario,
  options: { peerIndex?: number; rcpts?: number; data?: boolean; messages?: number } = {},
) {
  const { peerIndex = 0, rcpts = COUNT, data = true, messages = data ? 1 : 0 } = options;
  const peer = await closedPeer(s, peerIndex);
  const { snapshot } = s;
  const routed = destinations(snapshot);
  expect(routed).toHaveLength(COUNT);
  expect(peer.protocol).toMatch(/^TLSv1\.[23]$/);
  expect(peer.sni).toBe(TLS_NAME);
  expect(peer.secure).toEqual([
    EHLO,
    AUTH_COMMAND,
    `MAIL FROM:<${snapshot.envelope.from.address}>`,
    ...routed.slice(0, rcpts).map(({ address }) => `RCPT TO:<${address}>`),
    ...(data ? ['DATA'] : []),
  ]);
  expect(peer.messages).toHaveLength(messages);
  return peer;
}

export function assertMime(
  wireData: string,
  snapshot: SmtpSnapshot,
  resolved: readonly ResolvedAttachment[],
  id: string,
) {
  const { headers, parts } = parseMime(wireData);
  expect(headers.get('message-id')).toBe(`<${id}@email.invalid>`);
  expect(decodeMimeWords(headers.get('subject')!)).toBe(snapshot.subject);
  for (const [header, mailbox] of [
    ['from', snapshot.envelope.from],
    ['reply-to', snapshot.envelope.replyTo!],
  ] as const) {
    expect(decodeMimeWords(headers.get(header)!)).toBe(`${mailbox.name} <${mailbox.address}>`);
  }
  for (const group of ['to', 'cc'] as const) {
    expect(headers.get(group)?.split(/,\s*/).map(decodeMimeWords)).toEqual(
      snapshot.envelope[group].map(({ name, address }) => `${name} <${address}>`),
    );
  }
  expect(headers.has('bcc')).toBe(false);
  // Check decoded headers for the fixture's distinct wide Bcc names, and all of DATA for literal Bcc addr-specs.
  expect(/\bbcc\d{4}/.test(decodeMimeWords([...headers.values()].join('\n')))).toBe(false);
  expect(/\bbcc\d{4}x*@/.test(wireData)).toBe(false);
  let alternative = { headers, parts };
  if (resolved.length) {
    expect(headers.get('content-type')).toMatch(/^multipart\/mixed;/);
    expect(parts).toHaveLength(resolved.length + 1);
    alternative = parts[0]!;
    for (const [index, { ref }] of resolved.entries()) {
      const part = parts[index + 1]!;
      expect(part.headers.get('content-disposition')).toBe(`attachment; filename=${ref.filename}`);
      const bytes = base64Body(part, `${ref.contentType}; name=${ref.filename}`);
      expect(bytes.length).toBe(ref.byteLength);
      expect(sha256(bytes)).toBe(ref.sha256);
    }
  }
  expect(alternative.headers.get('content-type')).toMatch(/^multipart\/alternative;/);
  expect(alternative.parts).toHaveLength(2);
  expect(base64Body(alternative.parts[0]!, 'text/plain; charset=utf-8').equals(Buffer.from(snapshot.text!))).toBe(true);
  expect(base64Body(alternative.parts[1]!, 'text/html; charset=utf-8').equals(Buffer.from(snapshot.html!))).toBe(true);
  if (resolved.length) {
    expect(resolved).toHaveLength(5);
    expect(resolved.reduce((sum, { bytes }) => sum + bytes.length, 0)).toBe(MESSAGE_LIMITS.totalAttachmentBytes);
    expect(Buffer.byteLength(wireData, 'latin1')).toBeGreaterThan(8 * MIB);
    expect(wireData.split('\r\n').every((line) => line.length <= 998)).toBe(true);
  }
}
