/**
 * ATT-02 body-capture tests: option bounds, exact-byte digests for every
 * supported parser combination, narrow error mapping, and package-owned
 * per-request state (no trust in `req.body` or client fields).
 */
import { createHash } from 'node:crypto';
import express from 'express';
import type { AddressInfo } from 'node:net';
import { describe, expect, it } from 'vitest';

import { createAttestationBodyCapture, getAttestationBodyRecord } from '../src/body-capture.js';
import { AttestationProtocolError, EMPTY_BODY_SHA256_HEX } from '../src/index.js';

function shaHex(bytes: Uint8Array): string {
  return createHash('sha256').update(bytes).digest('hex');
}

async function startApp(app: express.Express): Promise<{ baseUrl: string; close: () => Promise<void> }> {
  const server = app.listen(0, '127.0.0.1');
  await new Promise<void>((resolve) => server.on('listening', () => resolve()));
  const address = server.address() as AddressInfo;
  const baseUrl = `http://127.0.0.1:${address.port}`;
  return {
    baseUrl,
    close: () => new Promise<void>((resolve, reject) => server.close((err) => (err ? reject(err) : resolve()))),
  };
}

describe('createAttestationBodyCapture options', () => {
  it('defaults to 1 MiB and freezes the result', () => {
    const capture = createAttestationBodyCapture();
    expect(capture.maxBodyBytes).toBe(1048576);
    expect(Object.isFrozen(capture)).toBe(true);
  });

  it('accepts explicit limits up to the 16 MiB hard cap', () => {
    expect(createAttestationBodyCapture({ maxBodyBytes: 1 }).maxBodyBytes).toBe(1);
    expect(createAttestationBodyCapture({ maxBodyBytes: 16777216 }).maxBodyBytes).toBe(16777216);
  });

  it.each([0, -1, 1.5, Number.NaN, Number.POSITIVE_INFINITY, 16777217, 'big' as never])(
    'rejects invalid maxBodyBytes %s',
    (maxBodyBytes) => {
      expect(() => createAttestationBodyCapture({ maxBodyBytes: maxBodyBytes as number })).toThrow(
        AttestationProtocolError,
      );
    },
  );

  it('rejects unknown and non-object options', () => {
    expect(() => createAttestationBodyCapture({ unknownOption: 1 } as never)).toThrow(AttestationProtocolError);
    expect(() => createAttestationBodyCapture(null as never)).toThrow(AttestationProtocolError);
    expect(() => createAttestationBodyCapture([] as never)).toThrow(AttestationProtocolError);
  });
});

describe('verify stores exact-byte digests', () => {
  it('hashes exact bytes and byte counts via direct calls', () => {
    const capture = createAttestationBodyCapture();
    const req = {};
    const body = Buffer.from('{"a":1}', 'utf8');
    capture.verify(req, {}, body, 'utf8');
    const record = capture.getRecord(req);
    expect(record).toEqual({ digestHex: shaHex(body), byteLength: body.length });
    expect(Object.isFrozen(record as object)).toBe(true);
  });

  it('returns undefined for requests the parser never captured', () => {
    const capture = createAttestationBodyCapture();
    expect(capture.getRecord({})).toBeUndefined();
    expect(capture.getRecord(null)).toBeUndefined();
    expect(getAttestationBodyRecord({})).toBeUndefined();
  });

  it('does not trust user-writable digest fields', () => {
    const capture = createAttestationBodyCapture();
    const req = { body: { digestHex: 'aaaa', __attestationDigest: 'bbbb' } } as unknown as object;
    expect(capture.getRecord(req)).toBeUndefined();
    // Even after a real capture, the returned copy is isolated.
    capture.verify(req, {}, Buffer.from('x'), 'utf8');
    const first = capture.getRecord(req) as { digestHex: string; byteLength: number };
    expect(Object.isFrozen(first)).toBe(true);
    expect(() => {
      (first as { digestHex: string }).digestHex = 'tampered';
    }).toThrow();
    const second = capture.getRecord(req) as { digestHex: string };
    expect(second.digestHex).toBe(shaHex(Buffer.from('x')));
  });

  it('captures JSON exact bytes and preserves req.body downstream', async () => {
    const capture = createAttestationBodyCapture({ maxBodyBytes: 1024 * 1024 });
    const app = express();
    app.use(express.json({ limit: 1024 * 1024, verify: capture.verify as never, inflate: false }));
    app.use(capture.errorHandler as never);
    app.post('/echo', (req, res) => {
      const record = capture.getRecord(req);
      res.json({ body: req.body, digestHex: record?.digestHex, byteLength: record?.byteLength });
    });
    const { baseUrl, close } = await startApp(app);
    try {
      const raw = JSON.stringify({ note: 'héllo 🌍' });
      const response = await fetch(`${baseUrl}/echo`, {
        method: 'POST',
        headers: { 'content-type': 'application/json; charset=utf-8' },
        body: raw,
      });
      expect(response.status).toBe(200);
      const payload = (await response.json()) as { body: unknown; digestHex: string; byteLength: number };
      expect(payload.body).toEqual({ note: 'héllo 🌍' });
      expect(payload.digestHex).toBe(shaHex(Buffer.from(raw, 'utf8')));
      expect(payload.byteLength).toBe(Buffer.byteLength(raw, 'utf8'));
    } finally {
      await close();
    }
  });

  it('captures urlencoded exact bytes', async () => {
    const capture = createAttestationBodyCapture();
    const app = express();
    app.use(
      express.urlencoded({ extended: false, limit: 1024 * 1024, verify: capture.verify as never, inflate: false }),
    );
    app.use(capture.errorHandler as never);
    app.post('/form', (req, res) => {
      const record = capture.getRecord(req);
      res.json({ body: req.body, digestHex: record?.digestHex });
    });
    const { baseUrl, close } = await startApp(app);
    try {
      const raw = 'a=1&b=2&a=3&q=x+y';
      const response = await fetch(`${baseUrl}/form`, {
        method: 'POST',
        headers: { 'content-type': 'application/x-www-form-urlencoded' },
        body: raw,
      });
      expect(response.status).toBe(200);
      const payload = (await response.json()) as { digestHex: string };
      expect(payload.digestHex).toBe(shaHex(Buffer.from(raw, 'utf8')));
    } finally {
      await close();
    }
  });

  it('captures raw/binary exact bytes including NUL and 0xFF', async () => {
    const capture = createAttestationBodyCapture();
    const app = express();
    app.use(
      express.raw({
        type: 'application/octet-stream',
        limit: 1024 * 1024,
        verify: capture.verify as never,
        inflate: false,
      }),
    );
    app.use(capture.errorHandler as never);
    app.put('/blob', (req, res) => {
      const record = capture.getRecord(req);
      const body = req.body as Buffer;
      res.json({ byteLength: record?.byteLength, digestHex: record?.digestHex, bodyLength: body.length });
    });
    const { baseUrl, close } = await startApp(app);
    try {
      const bytes = Buffer.from([0x00, 0x01, 0x02, 0x03, 0xfe, 0xfb, 0xff, 0x48, 0x65, 0x6c, 0x6c, 0x6f]);
      const response = await fetch(`${baseUrl}/blob`, {
        method: 'PUT',
        headers: { 'content-type': 'application/octet-stream' },
        body: bytes as unknown as BodyInit,
      });
      expect(response.status).toBe(200);
      const payload = (await response.json()) as { digestHex: string; byteLength: number; bodyLength: number };
      expect(payload.digestHex).toBe(shaHex(bytes));
      expect(payload.byteLength).toBe(bytes.length);
      expect(payload.bodyLength).toBe(bytes.length);
    } finally {
      await close();
    }
  });

  it('captures multipart exact bytes with boundary preserved', async () => {
    const capture = createAttestationBodyCapture();
    const app = express();
    app.use(express.raw({ type: 'multipart/*', limit: 1024 * 1024, verify: capture.verify as never, inflate: false }));
    app.use(capture.errorHandler as never);
    app.post('/upload', (req, res) => {
      const record = capture.getRecord(req);
      res.json({ digestHex: record?.digestHex, byteLength: record?.byteLength });
    });
    const { baseUrl, close } = await startApp(app);
    try {
      const boundary = '----boundary123';
      const raw = `------boundary123\r\nContent-Disposition: form-data; name="field1"\r\n\r\nvalue1\r\n------boundary123--\r\n`;
      const bytes = Buffer.from(raw, 'utf8');
      const response = await fetch(`${baseUrl}/upload`, {
        method: 'POST',
        headers: { 'content-type': `multipart/form-data; boundary=${boundary}` },
        body: bytes as unknown as BodyInit,
      });
      expect(response.status).toBe(200);
      const payload = (await response.json()) as { digestHex: string; byteLength: number };
      expect(payload.digestHex).toBe(shaHex(bytes));
      expect(payload.byteLength).toBe(bytes.length);
    } finally {
      await close();
    }
  });

  it('leaves actually empty requests uncaptured (guard uses the empty digest)', async () => {
    const capture = createAttestationBodyCapture();
    const app = express();
    app.use(express.json({ limit: 1024 * 1024, verify: capture.verify as never, inflate: false }));
    app.use(capture.errorHandler as never);
    app.get('/empty', (req, res) => {
      res.json({ captured: capture.getRecord(req) ?? null, emptyDigest: EMPTY_BODY_SHA256_HEX });
    });
    const { baseUrl, close } = await startApp(app);
    try {
      const response = await fetch(`${baseUrl}/empty`, { method: 'GET' });
      expect(response.status).toBe(200);
      const payload = (await response.json()) as { captured: null; emptyDigest: string };
      expect(payload.captured).toBeNull();
      expect(payload.emptyDigest).toBe(shaHex(Buffer.alloc(0)));
    } finally {
      await close();
    }
  });
});

describe('errorHandler narrow mapping', () => {
  it('maps entity.too.large to 413 ATTESTATION_BODY_TOO_LARGE with no-store', async () => {
    const capture = createAttestationBodyCapture({ maxBodyBytes: 16 });
    const app = express();
    app.use(express.json({ limit: 16, verify: capture.verify as never, inflate: false }));
    app.use(capture.errorHandler as never);
    app.post('/small', (_req, res) => res.json({ ok: true }));
    const { baseUrl, close } = await startApp(app);
    try {
      const response = await fetch(`${baseUrl}/small`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ padding: 'this body is definitely over sixteen bytes' }),
      });
      expect(response.status).toBe(413);
      expect(response.headers.get('cache-control')).toBe('no-store');
      const payload = (await response.json()) as { code: string; message: string };
      expect(payload).toEqual({
        code: 'ATTESTATION_BODY_TOO_LARGE',
        message: 'Request body exceeds the configured byte limit.',
      });
    } finally {
      await close();
    }
  });

  it.each(['charset.unsupported', 'encoding.unsupported'])(
    'maps %s to 415 ATTESTATION_UNSUPPORTED_ENCODING',
    (type) => {
      const capture = createAttestationBodyCapture();
      let status = 0;
      let payload: unknown;
      const res = {
        headersSent: false,
        setHeader: () => {},
        status: (code: number) => {
          status = code;
          return {
            json: (body: unknown) => {
              payload = body;
            },
          };
        },
      };
      let nextCalled = false;
      capture.errorHandler({ type, status: 415 }, {}, res, () => {
        nextCalled = true;
      });
      expect(nextCalled).toBe(false);
      expect(status).toBe(415);
      expect(payload).toEqual({
        code: 'ATTESTATION_UNSUPPORTED_ENCODING',
        message: 'Request body encoding is unsupported.',
      });
    },
  );

  it('passes other parser errors through to application policy', async () => {
    const capture = createAttestationBodyCapture();
    const app = express();
    app.use(express.json({ limit: 1024 * 1024, verify: capture.verify as never, inflate: false }));
    app.use(capture.errorHandler as never);
    // Application policy for malformed JSON: controlled 400, not an attestation code.
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    app.use((err: unknown, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
      res.status(400).json({ code: 'APP_JSON_PARSE_FAILED' });
    });
    app.post('/json', (_req, res) => res.json({ ok: true }));
    const { baseUrl, close } = await startApp(app);
    try {
      const response = await fetch(`${baseUrl}/json`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: '{"a": 1, malformed',
      });
      expect(response.status).toBe(400);
      const payload = (await response.json()) as { code: string };
      expect(payload.code).toBe('APP_JSON_PARSE_FAILED');
    } finally {
      await close();
    }
  });

  it('does not swallow non-parser errors and respects headersSent', () => {
    const capture = createAttestationBodyCapture();
    let forwarded: unknown;
    capture.errorHandler(new Error('boom'), {}, { headersSent: true }, (err) => {
      forwarded = err;
    });
    expect((forwarded as Error).message).toBe('boom');
    let forwarded2: unknown = 'unset';
    capture.errorHandler(new Error('pass'), {}, {}, (err) => {
      forwarded2 = err;
    });
    expect((forwarded2 as Error).message).toBe('pass');
  });
});
