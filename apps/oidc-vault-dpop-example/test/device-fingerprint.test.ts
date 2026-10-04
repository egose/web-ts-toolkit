import { describe, expect, it, vi } from 'vitest';

import {
  createDeviceFingerprint,
  fingerprintJsSignalSource,
  type DeviceFingerprintOptions,
  type DeviceFingerprintSignalSource,
  type FingerprintJsAgent,
} from '../src/auth/device-fingerprint';

describe('DBJWT-09 generic frontend recognition adapter (before DBJWT-10 app integration)', () => {
  it('collects lazily, emits the configured single header, and rereads the current signal each operation', async () => {
    const source = vi.fn().mockResolvedValueOnce('browser-one').mockResolvedValueOnce('browser-two');
    const adapter = createDeviceFingerprint(source);
    expect(source).not.toHaveBeenCalled();
    expect(Object.isFrozen(adapter)).toBe(true);
    const first = await adapter.headers();
    expect(first).toEqual({ 'X-Device-Fingerprint': 'browser-one' });
    expect(Object.isFrozen(first)).toBe(true);
    expect(await adapter.headers()).toEqual({ 'X-Device-Fingerprint': 'browser-two' });
    expect(first).toEqual({ 'X-Device-Fingerprint': 'browser-one' });
    expect(source).toHaveBeenCalledTimes(2);
  });

  it('explicit undefined is intentionally unenrolled; it is not a fabricated identifier', async () => {
    const adapter = createDeviceFingerprint(async () => undefined);
    expect(await adapter.headers()).toEqual({});
  });

  it.each(['x', 'X'.repeat(256), 'opaque value,+/=;'])(
    'preserves a valid ASCII signal without trimming, hashing or case-folding',
    async (value) => {
      expect(await createDeviceFingerprint(async () => value).headers()).toEqual({ 'X-Device-Fingerprint': value });
    },
  );

  it.each([
    '',
    'x'.repeat(257),
    'caf\u00e9',
    '\ud83d\ude00',
    'bad\tvalue',
    'bad\rvalue',
    'bad\nvalue',
    '\u007f',
    '\u0000',
    null,
    123,
  ])('rejects invalid signal %# without identifier/diagnostic leakage', async (value) => {
    const source = (async () => value) as DeviceFingerprintSignalSource;
    await expect(createDeviceFingerprint(source).headers()).rejects.toThrow('Fingerprint signal is invalid.');
  });

  it('reports collection failure with a fixed error rather than silently unenrolling or exposing vendor diagnostics', async () => {
    const original = new Error('private visitor-id browser-one');
    const adapter = createDeviceFingerprint(async () => {
      throw original;
    });
    const error = await adapter.headers().catch((error: unknown) => error);
    expect(error).toBeInstanceOf(Error);
    expect(error).toMatchObject({ message: 'Browser recognition is unavailable.' });
    expect(error).not.toHaveProperty('cause');
  });

  it('snapshots a frozen/reused header option once without retaining caller mutation', async () => {
    const options: DeviceFingerprintOptions = { headerName: 'X-App-Recognition' };
    const adapter = createDeviceFingerprint(async () => 'signal', options);
    options.headerName = 'Authorization';
    expect(await adapter.headers()).toEqual({ 'X-App-Recognition': 'signal' });
    expect(
      await createDeviceFingerprint(async () => 'other', Object.freeze({ headerName: 'X-Other' })).headers(),
    ).toEqual({ 'X-Other': 'other' });
  });

  it.each([
    '',
    'bad name',
    'bad:name',
    'bad\r\n',
    'caf\u00e9',
    'Authorization',
    'DpOp',
    'DPoP-Nonce',
    'Cookie',
    'Set-Cookie',
    'Origin',
    'Referer',
    'Content-Type',
    'Content-Length',
    'Accept',
    'Access-Control-Allow-Origin',
    'X-Forwarded-Host',
    'Sec-Fetch-Site',
  ])('rejects malformed/colliding header %s at construction', (headerName) => {
    expect(() => createDeviceFingerprint(async () => 'signal', { headerName })).toThrow(/header name/);
  });

  it('injects a structurally typed FingerprintJS load/get agent, sharing load but not identifiers across concurrent callers', async () => {
    const agent: FingerprintJsAgent = {
      get: vi
        .fn()
        .mockResolvedValueOnce({ visitorId: 'visitor-one' })
        .mockResolvedValueOnce({ visitorId: 'visitor-two' }),
    };
    const load = vi.fn(async () => agent);
    const adapter = createDeviceFingerprint(fingerprintJsSignalSource(load));
    expect(load).not.toHaveBeenCalled();
    expect(await Promise.all([adapter.headers(), adapter.headers()])).toEqual([
      { 'X-Device-Fingerprint': 'visitor-one' },
      { 'X-Device-Fingerprint': 'visitor-two' },
    ]);
    expect(load).toHaveBeenCalledTimes(1);
    expect(agent.get).toHaveBeenCalledTimes(2);
  });

  it('allows an explicit retry after failed optional vendor load', async () => {
    const load = vi
      .fn<() => Promise<FingerprintJsAgent>>()
      .mockRejectedValueOnce(new Error('private vendor diagnostic'))
      .mockResolvedValueOnce({ get: async () => ({ visitorId: 'visitor' }) });
    const adapter = createDeviceFingerprint(fingerprintJsSignalSource(load));
    await expect(adapter.headers()).rejects.toThrow('Browser recognition is unavailable.');
    expect(await adapter.headers()).toEqual({ 'X-Device-Fingerprint': 'visitor' });
    expect(load).toHaveBeenCalledTimes(2);
  });
});
