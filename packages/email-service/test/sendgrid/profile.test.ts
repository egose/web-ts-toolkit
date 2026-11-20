import { describe, expect, it, vi } from 'vitest';
import type { ProviderCall, ProviderSubmission, SendGridSnapshot, SmtpSnapshot } from '../../src';
import { MESSAGE_LIMITS } from '../../src/constants';
import { createSendGridProfile } from '../../src/providers/sendgrid/profile';
import { createSendGridProvider, type SendGridProviderOptions } from '../../src/sendgrid';
import { attachment, call, PROFILE, submission } from './fixtures';

describe('SendGrid public configuration and preflight', () => {
  it('accepts only an explicit bounded credential, profile key and optional mode', () => {
    const read = vi.fn(() => PROFILE.apiKey);
    const hidden = Object.defineProperty({ key: PROFILE.key }, 'apiKey', { value: PROFILE.apiKey });
    const accessor = Object.defineProperty({ key: PROFILE.key }, 'apiKey', { enumerable: true, get: read });
    const trap = vi.fn(() => {
      throw new Error('Unexpected proxy trap');
    });
    const proxied = new Proxy(PROFILE, { ownKeys: trap });
    expect(createSendGridProvider(PROFILE).ref).toEqual({ kind: 'sendgrid', key: PROFILE.key, mode: 'live' });
    for (const options of [
      hidden,
      accessor,
      proxied,
      ...[
        { key: 'bad/key' },
        { apiKey: '' },
        { apiKey: 'synthetic extra' },
        { apiKey: 'synthetic\r\nheader' },
        { apiKey: 'a'.repeat(1_025) },
        { mode: 'validate' },
        { mode: undefined },
        { host: 'localhost' },
        { endpoint: 'http://127.0.0.1' },
        { ca: [] },
        { io: {} },
        { agent: false },
        { rejectUnauthorized: false },
      ].map((extra) => ({ ...PROFILE, ...extra })),
    ]) {
      expect(() => createSendGridProvider(options as SendGridProviderOptions)).toThrow(
        expect.objectContaining({ code: 'invalid_config', message: 'Invalid email service configuration.' }),
      );
    }
    expect(read).not.toHaveBeenCalled();
    expect(trap).not.toHaveBeenCalled();
  });

  it('rejects wrong provider/snapshot/attachment boundaries synchronously without even resolving DNS', () => {
    const unused = vi.fn(() => {
      throw new Error('Unexpected I/O');
    });
    const provider = createSendGridProfile(PROFILE, { resolver: unused, connect: unused, request: unused });
    const packet = attachment(Uint8Array.of(0x04, 0x05));
    const note = attachment(Uint8Array.of(0x06), 'note.txt', 'text/plain');
    const input = submission({}, [packet, note]);
    const { snapshot } = input;
    const oversized = { ...packet.ref, byteLength: MESSAGE_LIMITS.attachmentBytes + 1 };
    const fullPart = { ...packet.ref, byteLength: MESSAGE_LIMITS.attachmentBytes };
    const privateGetter = vi.fn(() => 'never read');
    const smtp: SmtpSnapshot = {
      kind: 'smtp',
      provider: { kind: 'smtp', key: PROFILE.key, mode: 'live' },
      version: 1,
      envelope: snapshot.envelope,
      template: snapshot.template,
      preparedAt: snapshot.preparedAt,
      expiresAt: snapshot.expiresAt,
      correlation: {},
      attachments: [],
      priority: 0,
      subject: 'Example',
      text: 'Fixture',
    };
    for (const candidate of [
      { ...input, snapshot: smtp, attachments: [] },
      { ...input, snapshot: { ...snapshot, provider: { ...provider.ref, key: 'different' } } },
      { ...input, snapshot: { ...snapshot, provider: { ...provider.ref, mode: 'sandbox' } } },
    ]) {
      expect(() => provider.prepare(candidate as ProviderSubmission<SendGridSnapshot>)).toThrow(
        expect.objectContaining({ code: 'provider_mismatch' }),
      );
    }
    for (const candidate of [
      { ...input, jobId: 'wrong' },
      { ...input, attemptId: 'wrong' },
      { ...input, batch_id: 'not-a-provider-field' },
      { ...input, snapshot: { ...snapshot, templateId: 'not-dynamic' } },
      { ...input, snapshot: { ...snapshot, data: { toJSON: privateGetter } } },
      { ...input, snapshot: { ...snapshot, data: Object.defineProperty({}, 'value', { get: privateGetter }) } },
      { ...input, snapshot: { ...snapshot, envelope: { ...snapshot.envelope, to: [] } } },
      {
        ...input,
        snapshot: { ...snapshot, envelope: { ...snapshot.envelope, cc: [{ address: 'to@example.invalid' }] } },
      },
      { ...input, snapshot: { ...snapshot, attachments: Array.from({ length: 6 }, () => packet.ref) } },
      { ...input, snapshot: { ...snapshot, attachments: [oversized] } },
      { ...input, snapshot: { ...snapshot, attachments: [fullPart, fullPart, fullPart] } },
      { ...input, attachments: [] },
      { ...input, attachments: [note, packet] },
      { ...input, attachments: [{ ...packet, ref: { ...packet.ref, version: 'v2' } }, note] },
      { ...input, attachments: [{ ...packet, bytes: Uint8Array.of(0, 0) }, note] },
      { ...input, attachments: [{ ...packet, bytes: Uint8Array.of(4) }, note] },
      { ...input, attachments: [{ ...packet, bytes: new Uint8Array(new SharedArrayBuffer(2)) }, note] },
      { ...input, attachments: [{ ...packet, bytes: { path: 'ignored-fixture.bin' } }, note] },
    ]) {
      expect(() => provider.prepare(candidate as ProviderSubmission<SendGridSnapshot>)).toThrow(
        expect.objectContaining({ code: 'invalid_snapshot' }),
      );
    }
    expect(privateGetter).not.toHaveBeenCalled();
    expect(unused).not.toHaveBeenCalled();
  });

  it('rejects malformed calls without consuming the body, but a valid pre-aborted call is one-shot and has no I/O', async () => {
    const unused = vi.fn(() => {
      throw new Error('Unexpected I/O');
    });
    const provider = createSendGridProfile(PROFILE, { resolver: unused, connect: unused, request: unused });
    const prepared = provider.prepare(submission());
    expect([provider, provider.ref, prepared].every(Object.isFrozen)).toBe(true);
    expect(JSON.stringify(provider)).not.toContain(PROFILE.apiKey);
    for (const context of [
      call(0),
      call(60_001),
      call(1.5),
      { timeoutMs: 50 },
      { signal: {}, timeoutMs: 50 },
      { ...call(), extra: true },
    ]) {
      await expect(prepared.submit(context as ProviderCall)).rejects.toMatchObject({ code: 'invalid_config' });
    }
    const result = await prepared.submit(call(1, AbortSignal.abort(new Error('synthetic private cause'))));
    expect(result).toEqual({ outcome: 'unknown', retry: 'never', reason: 'provider_aborted', stage: 'connect' });
    expect(Object.isFrozen(result)).toBe(true);
    await expect(prepared.submit(call())).rejects.toMatchObject({ code: 'closed' });
    expect(unused).not.toHaveBeenCalled();
  });
});
