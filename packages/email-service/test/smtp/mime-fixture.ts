import { expect } from 'vitest';

type MimePart = { headers: Map<string, string>; body: string; parts: MimePart[] };

/** Decode the fixture's MIME structure without relying on generated dates or boundaries. */
export function parseMime(exactWire: string): MimePart {
  const split = exactWire.indexOf('\r\n\r\n');
  expect(split).toBeGreaterThan(0);
  const headers = new Map<string, string>();
  for (const line of exactWire
    .slice(0, split)
    .replace(/\r\n(?=[ \t])/g, '')
    .split('\r\n')) {
    const colon = line.indexOf(': ');
    expect(colon).toBeGreaterThan(0);
    const key = line.slice(0, colon).toLowerCase();
    expect(headers.has(key)).toBe(false);
    headers.set(key, line.slice(colon + 2));
  }
  const body = exactWire.slice(split + 4);
  const boundary = headers.get('content-type')?.match(/boundary="([^"]+)"/)?.[1];
  const parts = boundary
    ? body
        .split(`--${boundary}`)
        .slice(1, -1)
        .map((part) => parseMime(part.slice(2)))
    : [];
  return { headers, body, parts };
}

export function decodeMimeWords(value: string) {
  return value
    .replaceAll('?= =?', '?==?')
    .replace(/=\?UTF-8\?B\?([^?]+)\?=/g, (_word, base64: string) => Buffer.from(base64, 'base64').toString('utf8'));
}

export function base64Body(part: MimePart, type: string) {
  expect(part.headers.get('content-type')).toBe(type);
  expect(part.headers.get('content-transfer-encoding')).toBe('base64');
  return Buffer.from(part.body, 'base64');
}
