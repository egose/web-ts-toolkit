import { Buffer } from 'node:buffer';
import { describe, expect, it, vi } from 'vitest';
import { createEmailTemplateRegistry, type JsonObject } from '../../src';
import { MESSAGE_LIMITS as L } from '../../src/constants';
import { canonicalJson } from '../../src/internal/canonical-json';
import { encodeAdmissionKey, parseCommandIdentity, validatePreparedCommand } from '../../src/internal/command-codecs';
import {
  copyAttachmentBytes,
  validateAttachmentRefs,
  validateCorrelation,
  validateEnvelope,
  validateMailbox,
  validateSnapshot,
  validateSmtpContent,
} from '../../src/internal/message-codecs';
import {
  ATTACHMENT,
  command,
  FROM,
  inline,
  local,
  ManualClock,
  NOW,
  remote,
  remoteCommand,
  SCOPE,
  TO,
} from './template-fixtures';

const canonical = (value: unknown) => canonicalJson(value, L.intentBytes, 'invalid_command');
const BAD_INTENT = expect.objectContaining({ code: 'invalid_command' });
const BAD_SNAPSHOT = expect.objectContaining({ code: 'invalid_snapshot' });

describe('canonical plain JSON', () => {
  it('uses lexical code-unit order for numeric/Unicode keys and JSON scalar spelling', () => {
    const intent = { title: 'é🔔', numeric: { 2: 'two', 10: 'ten' }, a: [-0, 1e-7, '\n'] };
    const encoded = '{"a":[0,1e-7,"\\n"],"numeric":{"10":"ten","2":"two"},"title":"é🔔"}';
    expect(canonical(intent).encoded).toBe(encoded);
    expect(canonical({ '🔔': 1, '\uE000': 2, A: 3 }).encoded).toBe('{"A":3,"🔔":1,"\uE000":2}');
    const { identity, command: detached } = parseCommandIdentity(SCOPE, { ...command, intent });
    expect(identity.intentHash).toBe('ee71a3f6514a70fd6360a80b09c3660fd607a6a3e5ceda79ec0e44222534ff99');
    expect(identity.fingerprint).toBe('35a508ca160742f277d8dff340c35e49e960eeb2a9296893d14f90133817fe6b');
    intent.a[0] = 99;
    intent.numeric[10] = 'changed';
    expect(canonical(detached.intent).encoded).toBe(encoded);
    expect(Object.isFrozen((detached.intent as JsonObject).numeric)).toBe(true);
    expect(Object.isFrozen((detached.intent as JsonObject).a)).toBe(true);
  });

  it('rejects accessors, proxy traps, toJSON hooks and non-JSON structures without calling them', () => {
    const trap = vi.fn(() => {
      throw new Error('must not run');
    });
    const proxy = new Proxy({}, { getPrototypeOf: trap, ownKeys: trap, get: trap });
    const revoked = Proxy.revocable([], {});
    revoked.revoke();
    const loop: unknown[] = [];
    loop.push(loop);
    const accessorArray = [1];
    Object.defineProperty(accessorArray, '0', { get: trap });
    const invalid = [
      {
        get secret() {
          return trap();
        },
      },
      { toJSON: trap },
      proxy,
      revoked.proxy,
      { x: proxy },
      new Date(0),
      Object.create({ custom: true }),
      Object.defineProperty({}, 'hidden', { value: 1 }),
      Object.assign([1], { extra: 2 }),
      Object.assign(new Array(1), { extra: 1 }),
      accessorArray,
      { [Symbol('not-json')]: 1 },
      { x: undefined },
      BigInt(0),
      NaN,
      Infinity,
      2 ** 53,
      loop,
      JSON.parse('{"__proto__":1}'),
      { constructor: 1 },
      { prototype: 1 },
      { 'has.dot': 1 },
      { has$dollar: 1 },
      { '\0': 1 },
      { '\ud800': 1 },
      '\udc00',
    ];
    for (const value of invalid) expect(() => canonical(value)).toThrow(BAD_INTENT);
    expect(trap).not.toHaveBeenCalled();
    const shared = Object.assign(Object.create(null) as object, { x: 1 });
    expect(canonical([shared, shared]).encoded).toBe('[{"x":1},{"x":1}]');
  });

  it('enforces exact node, depth, key and escaped UTF-8 byte ceilings', () => {
    const depth = Array.from({ length: L.jsonDepth }).reduce<unknown>((value) => [value], true);
    expect(canonical(depth).encoded).toBe(`${'['.repeat(12)}true${']'.repeat(12)}`);
    expect(() => canonical([depth])).toThrow(BAD_INTENT);
    const nodes = new Array(L.jsonValues - 1).fill(0);
    expect(canonical(nodes).value).toHaveLength(2047);
    expect(() => canonical([...nodes, 0])).toThrow(BAD_INTENT);
    expect(() => canonical(new Array(2 ** 32 - 1))).toThrow(BAD_INTENT);
    expect(() => canonical({ ['é'.repeat(64)]: 0 })).not.toThrow();
    expect(() => canonical({ ['é'.repeat(65)]: 0 })).toThrow(BAD_INTENT);
    const unicode = 'é'.repeat((L.intentBytes - 2) / 2);
    const escaped = '\n'.repeat((L.intentBytes - 2) / 2);
    for (const value of [unicode, escaped]) {
      expect(Buffer.byteLength(canonical(value).encoded)).toBe(L.intentBytes);
      expect(() => canonical(`${value}x`)).toThrow(BAD_INTENT);
    }
    expect(canonical('\0\t\r\n\b\f"\\').encoded).toBe('"\\u0000\\t\\r\\n\\b\\f\\"\\\\"');
  });
});

describe('registry-independent admission identity and staged validation', () => {
  it('does not touch raw opaque input, even for an unknown key with an old schedule', () => {
    const trap = vi.fn(() => {
      throw new Error('must not run');
    });
    const input = new Proxy({}, { get: trap, ownKeys: trap });
    const provider = { ...command.provider, key: String(command.provider.key) };
    const key = { kind: 'batch', batchId: 'b', itemId: 'a' } as const;
    const cmd = { ...command, key, provider, templateKey: 'removed', input, scheduleAt: 0 };
    const parsed = parseCommandIdentity(SCOPE, cmd);
    provider.key = 'other';
    cmd.templateKey = 'changed';
    expect(parsed.command.input).toBe(input);
    expect(parsed.identity.templateKey).toBe('removed');
    expect(parsed.command.provider.key).toBe('smtp-profile');
    expect(parsed.identity.scheduleAt).toBe(0);
    expect(encodeAdmissionKey(parsed.identity.key)).toBe('b:b:a');
    expect(encodeAdmissionKey(command.key)).toBe('s:command_1');
    expect(trap).not.toHaveBeenCalled();
  });

  it('recomputes both hashes and detaches a JSON-round-tripped DTO without invoking business or template code', async () => {
    const registry = createEmailTemplateRegistry({ remote }, { clock: new ManualClock() });
    const prepared = await registry.prepare(SCOPE, { ...remoteCommand, scheduleAt: NOW + 1 });
    const staged = JSON.parse(JSON.stringify(prepared));
    const parsed = validatePreparedCommand(SCOPE, staged);
    expect(parsed).toEqual(prepared);
    staged.snapshot.envelope.to[0].address = 'other@example.invalid';
    staged.snapshot.data.title = 'changed';
    staged.key.idempotencyKey = 'different';
    expect(parsed).toEqual(prepared);
    expect(Object.isFrozen(parsed.snapshot.envelope.to[0])).toBe(true);
    expect(Object.isFrozen(parsed.snapshot)).toBe(true);
    expect(Object.isFrozen(parsed.key)).toBe(true);
    expect(() => validatePreparedCommand('different', prepared)).toThrow(BAD_SNAPSHOT);
    for (const update of [
      { fingerprint: '0'.repeat(64) },
      { intentHash: '0'.repeat(64) },
      { snapshotHash: '0'.repeat(64) },
      { scheduleAt: prepared.snapshot.expiresAt },
      { scheduleAt: NOW + 2 },
      { version: 2 },
      { input: {} },
      { snapshot: { ...prepared.snapshot, html: 'not for SendGrid' } },
      { snapshot: { ...prepared.snapshot, expiresAt: prepared.snapshot.preparedAt } },
    ]) {
      expect(() => validatePreparedCommand(SCOPE, { ...prepared, ...update })).toThrow(BAD_SNAPSHOT);
    }
    expect(() =>
      validatePreparedCommand(SCOPE, { ...prepared, snapshot: { ...prepared.snapshot, provider: command.provider } }),
    ).toThrow(expect.objectContaining({ code: 'provider_mismatch' }));
  });

  it('keeps stable identity independent of template revision and generated snapshot', async () => {
    const clock = new ManualClock();
    const first = createEmailTemplateRegistry({ local }, { clock });
    const second = createEmailTemplateRegistry(
      { local: { ...local, subject: inline('New subject'), revision: 'rev2' } },
      { clock },
    );
    const a = await first.prepare(SCOPE, command);
    clock.wall += 10;
    const b = await second.prepare(SCOPE, command);
    expect(a.fingerprint).toBe(b.fingerprint);
    expect(a.snapshotHash).not.toBe(b.snapshotHash);
    expect(a.snapshot.preparedAt).not.toBe(b.snapshot.preparedAt);
    expect(validatePreparedCommand(SCOPE, a)).toEqual(a);
    expect(validatePreparedCommand(SCOPE, b)).toEqual(b);
  });
});

describe('snapshot wire fields', () => {
  it('checks the complete canonical snapshot budget separately from individual bodies', async () => {
    const registry = createEmailTemplateRegistry({ local }, { clock: new ManualClock() });
    const { snapshot } = await registry.prepare(SCOPE, command);
    const base = { ...snapshot, html: '\n'.repeat(420_000), text: '' };
    const text = 'x'.repeat(L.snapshotBytes - Buffer.byteLength(JSON.stringify(base)));
    const atLimit = { ...base, text };
    expect(validateSnapshot(atLimit).snapshot).toEqual(atLimit);
    expect(() => validateSnapshot({ ...atLimit, text: `${text}x` })).toThrow(BAD_SNAPSHOT);
    expect(() => validateSnapshot({ ...base, html: undefined, text: 'body' })).toThrow(BAD_SNAPSHOT);
  });

  it('allows SendGrid data up to its own depth, value and UTF-8 byte ceilings inside a snapshot', async () => {
    const registry = createEmailTemplateRegistry({ remote }, { clock: new ManualClock() });
    const { snapshot } = await registry.prepare(SCOPE, remoteCommand);
    const nest = Array.from({ length: L.jsonDepth - 1 }).reduce<unknown>((value) => [value], 0);
    // Data root + array root + depth chain + remaining scalar nodes = 2048 values.
    const data = { nest, items: new Array(L.jsonValues - 2 - L.jsonDepth).fill(1) };
    expect(validateSnapshot({ ...snapshot, data }).snapshot).toHaveProperty('data', data);
    expect(() => validateSnapshot({ ...snapshot, data: { ...data, nest: [nest] } })).toThrow(BAD_SNAPSHOT);
    expect(() => validateSnapshot({ ...snapshot, data: { ...data, items: [...data.items, 1] } })).toThrow(BAD_SNAPSHOT);
    const exact = { a: 'é'.repeat((L.dataBytes - 8) / 2) };
    expect(validateSnapshot({ ...snapshot, data: exact }).snapshot).toHaveProperty('data', exact);
    expect(() => validateSnapshot({ ...snapshot, data: { a: `${exact.a}x` } })).toThrow(BAD_SNAPSHOT);
  });

  it('preserves mailbox spelling and grouping while rejecting injection, duplicates and bad provider envelopes', () => {
    const envelope = { from: FROM, to: [], cc: [], bcc: [TO] };
    expect(validateEnvelope(envelope, 'smtp')).toEqual(envelope);
    expect(() => validateEnvelope(envelope, 'sendgrid')).toThrow(BAD_SNAPSHOT);
    expect(() => validateEnvelope({ ...envelope, bcc: [] }, 'smtp')).toThrow(BAD_SNAPSHOT);
    expect(() => validateEnvelope({ ...envelope, to: [{ address: TO.address.toLowerCase() }] }, 'smtp')).toThrow(
      BAD_SNAPSHOT,
    );
    const recipients = Array.from({ length: L.recipients }, (_, n) => ({ address: `person-${n}@example.invalid` }));
    expect(validateEnvelope({ ...envelope, to: recipients, bcc: [] }, 'sendgrid').to).toHaveLength(50);
    expect(() => validateEnvelope({ ...envelope, to: recipients }, 'sendgrid')).toThrow(BAD_SNAPSHOT);
    const dns = ['a'.repeat(63), 'b'.repeat(63), 'c'.repeat(61)].join('.');
    const exact = { address: `${'x'.repeat(64)}@${dns}`, name: 'é'.repeat(64) };
    expect(exact.address).toHaveLength(254);
    expect(validateMailbox(exact)).toEqual(exact);
    expect(() => validateMailbox({ ...exact, address: `${exact.address}d` })).toThrow(BAD_SNAPSHOT);
    for (const address of [
      'a@example.invalid\r\nBcc:z@example.invalid',
      'a@example.invalid,b@example.invalid',
      'User <a@example.invalid>',
      'a(comment)@example.invalid',
      'o..k@example.invalid',
      `${'x'.repeat(65)}@example.invalid`,
      'été@example.invalid',
      'a@é.invalid',
      '"bob"@example.invalid',
      'a@127.0.0.1',
      'a@[127.0.0.1]',
      'a@-example.invalid',
      'a@bad_label.invalid',
    ])
      expect(() => validateMailbox({ address })).toThrow(BAD_SNAPSHOT);
    expect(() => validateMailbox({ ...TO, name: 'Name\u007f' })).toThrow(BAD_SNAPSHOT);
    expect(() => validateMailbox({ ...TO, name: `${exact.name}x` })).toThrow(BAD_SNAPSHOT);
    expect(() => validateMailbox({ ...TO, name: undefined })).toThrow(BAD_SNAPSHOT);
  });

  it('bounds header and body content independently and keeps exact valid bytes', () => {
    const subject = ` ${'é'.repeat(255)} `;
    const html = 'é'.repeat(L.htmlBytes / 2);
    const text = '\n'.repeat(L.textBytes);
    expect(validateSmtpContent({ subject, html, text })).toEqual({ subject, html, text });
    for (const invalid of [
      { subject: `${subject}x`, text },
      { subject: 'subject\t', text },
      { subject: '   ', text },
      { subject, html: '', text: '' },
      { subject, html: `${html}x` },
      { subject, text: `${text}x` },
    ])
      expect(() => validateSmtpContent(invalid)).toThrow(BAD_SNAPSHOT);
  });

  it('bounds correlation and attachment references and copies only verified attachment bytes', () => {
    const ids = Object.fromEntries(
      Array.from({ length: L.correlationEntries }, (_, n) => [`trace-${n}`, 'v'.repeat(96)]),
    );
    expect(validateCorrelation(ids)).toEqual(ids);
    for (const value of [
      { ...ids, extra: 'too-many' },
      { pii: FROM.address },
      { 'with.dot': 'id' },
      { constructor: 'id' },
    ]) {
      expect(() => validateCorrelation(value)).toThrow(BAD_SNAPSHOT);
    }
    const limit = [
      { ...ATTACHMENT, byteLength: L.attachmentBytes },
      { ...ATTACHMENT, byteLength: L.attachmentBytes },
      { ...ATTACHMENT, byteLength: L.totalAttachmentBytes - 2 * L.attachmentBytes },
    ];
    expect(validateAttachmentRefs(limit)).toEqual(limit);
    expect(() => validateAttachmentRefs([...limit, ATTACHMENT])).toThrow(BAD_SNAPSHOT);
    for (const update of [
      { contentType: 'Application/PDF' },
      { contentType: 'text/plain; charset=utf-8' },
      { filename: '../file' },
      { filename: '..' },
      { filename: 'c:file' },
      { filename: 'name\nfile' },
      { filename: 'x\\y' },
      { id: 'https://remote.invalid/a' },
      { byteLength: 0 },
      { byteLength: L.attachmentBytes + 1 },
      { sha256: ATTACHMENT.sha256.toUpperCase() },
    ])
      expect(() => validateAttachmentRefs([{ ...ATTACHMENT, ...update }])).toThrow(BAD_SNAPSHOT);

    const input = Buffer.from('zabcz').subarray(1, 4);
    const copy = copyAttachmentBytes(ATTACHMENT, input);
    input.fill(0);
    expect(copy).toEqual(Uint8Array.from([97, 98, 99]));
    expect(() => copyAttachmentBytes(ATTACHMENT, input)).toThrow(BAD_SNAPSHOT);
    const shared = new Uint8Array(new SharedArrayBuffer(3));
    shared.set(copy);
    expect(() => copyAttachmentBytes(ATTACHMENT, shared)).toThrow(BAD_SNAPSHOT);
    const getter = vi.fn(() => {
      throw new Error('must not run');
    });
    Object.defineProperty(copy, 'byteLength', { get: getter });
    expect(copyAttachmentBytes(ATTACHMENT, copy)).toEqual(Uint8Array.from([97, 98, 99]));
    expect(getter).not.toHaveBeenCalled();
  });
});
