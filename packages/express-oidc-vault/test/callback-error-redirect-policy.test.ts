import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  explicitlyPrefersCallbackHtml,
  prepareCallbackErrorLocation,
  resolveFrontendErrorRedirectUri,
} from '../src/callback-error-redirect';

const TARGET = 'https://help.example/error';
const prepare = (body: { code: unknown; message: unknown }, target = TARGET) =>
  prepareCallbackErrorLocation({ route: 'callback', method: 'GET', accept: 'text/html', target, body });

afterEach(() => vi.restoreAllMocks());

describe('FER-02 deterministic callback Accept negotiation', () => {
  it.each([
    [undefined, false],
    ['', false],
    [' , , ', false],
    ['*/*', false],
    ['text/*', false],
    ['application/*', false],
    ['image/png', false],
    ['text/html', true],
    ['application/xhtml+xml', true],
    ['TEXT/HTML;Q=0.8, application/json;q=0.2', true],
    ['text/html, application/json', false],
    ['application/json, text/html', false],
    ['application/xhtml+xml, application/json', false],
    ['application/json, application/xhtml+xml', false],
    ['text/html;q=0.8, application/json;q=0.9', false],
    ['text/html;q=0, */*;q=1', false],
    ['text/html;q=0.5, */*;q=1', false],
    ['text/html, */*;q=0.8', true],
    ['text/html, application/*', false],
    ['text/html, application/json;q=0, */*;q=1', true],
    ['text/html;q=0, application/xhtml+xml, */*;q=0.8', true],
    ['text/html;q=0.7, application/*;q=0, */*;q=1', true],
    ['text/html;q=0.7, application/*;q=1, application/json;q=0', true],
    ['text/html;q=0, text/html;q=1', true],
    ['text/html;q=1, text/html;q=0', true],
    ['text/html, application/json;q=0, application/json;q=1', false],
    ['text/html, application/json;q=1, application/json;q=0', false],
    ['text/html;q=0.7, application/*;q=0, application/*;q=1', false],
    ['text/html;level=1', false],
    ['text/html;charset=utf-8, application/xhtml+xml;q=0', false],
    ['text/html;q=1;level=1', true],
    ['text/html;q=1;extension', true],
    ['text/html;q=1;extension="a,b;c\\"d", application/json;q=0.2', true],
    ['text/html;extension="a,b;c", application/json;q=0', false],
    ['text/html;q=1, application/json;charset=utf-8', true],
    ['\ttext/html\t;\tq=0.001\t, application/json;q=0', true],
    [', text/html;q=1., , application/json;q=0.,', true],
    ['text/html;q=0.000', false],
    ['text/html;q=1.000', true],
  ] as const)('negotiates %j as HTML=%s', (accept, expected) => {
    expect(explicitlyPrefersCallbackHtml(accept)).toBe(expected);
  });

  it.each([
    'text/html;q=bogus',
    'text/html;q=1.1',
    'text/html;q=-1',
    'text/html;q=+1',
    'text/html;q=.5',
    'text/html;q=01',
    'text/html;q=0.0001',
    'text/html;q=1.0000',
    'text/html;q="1"',
    'text/html;q=1;q=1',
    'text/html;q=1;Q=0',
    'text/html;q',
    'text/html;q=',
    'text/html;',
    'text/html;level',
    'text/html;level=',
    'text/html;level=two words',
    'text/html;q=1;extension=',
    'text/html;q=1;extension="unterminated',
    'text/html;q=1;extension="escaped\\',
    'text/html;q=1;extension="a"b"',
    'text/html;q=1;extension="\n"',
    'text/html, garbage',
    'text/html, */json',
    'text/html, application / json',
    'text/html, image/png;q=bad',
    'text/html\n',
    'text/html\u007f',
  ])('keeps malformed input %j on JSON', (accept) => {
    expect(explicitlyPrefersCallbackHtml(accept)).toBe(false);
  });

  it('does not coerce non-string signals', () => {
    expect(explicitlyPrefersCallbackHtml(['text/html'])).toBe(false);
    expect(explicitlyPrefersCallbackHtml({ toString: () => 'text/html' })).toBe(false);
  });
});

describe('FER-02 bounded callback Location preparation', () => {
  it('replaces all decoded case-insensitive diagnostics and preserves other duplicate entries/path', () => {
    const location = prepare(
      { code: 'PUBLIC_é&=?', message: 'Public 😀 + & ? # / = " < >' },
      `${TARGET}/KeepCase?locale=en&locale=fr&ERROR=old&%65rror=older&ERROR_DESCRIPTION=old&error_description=older`,
    )!;
    const url = new URL(location);
    expect(url.pathname).toBe('/error/KeepCase');
    expect([...url.searchParams]).toEqual([
      ['locale', 'en'],
      ['locale', 'fr'],
      ['error', 'PUBLIC_é&=?'],
      ['error_description', 'Public 😀 + & ? # / = " < >'],
    ]);
    expect(location).toContain('error=PUBLIC_%C3%A9%26%3D%3F');
    expect(location).toContain('error_description=Public+%F0%9F%98%80+%2B+%26+%3F+%23+%2F+%3D+%22+%3C+%3E');
  });

  it.each([
    ['C'.repeat(128), 'M'.repeat(512)],
    ['é'.repeat(64), '😀'.repeat(128)],
    ['C', ''],
  ])('accepts inclusive public UTF-8 field bounds', (code, message) => {
    const location = prepare({ code, message });
    expect(location).toBeDefined();
    const url = new URL(location!);
    expect(url.searchParams.get('error')).toBe(code);
    expect(url.searchParams.get('error_description')).toBe(message);
  });

  it.each([
    ['C'.repeat(129), 'message'],
    ['é'.repeat(64) + 'a', 'message'],
    ['C', 'M'.repeat(513)],
    ['C', '😀'.repeat(128) + 'a'],
    ['', 'message'],
    [null, 'message'],
    [42, 'message'],
    [undefined, 'message'],
    ['C', null],
    ['C', 42],
    ['C', undefined],
  ])('falls back without truncating invalid public fields', (code, message) => {
    expect(prepare({ code, message })).toBeUndefined();
  });

  it.each([4096, 4097])('checks the final encoded Location at %i bytes without a network header', (bytes) => {
    const body = { code: 'C', message: 'M' };
    const prefix = `${TARGET}?hint=`;
    const overhead = Buffer.byteLength(prepare(body, prefix)!);
    const expansion = bytes - overhead;
    const target = prefix + '~'.repeat(Math.floor(expansion / 3)) + 'x'.repeat(expansion % 3);
    expect(resolveFrontendErrorRedirectUri(target, 'https://api.example', '/auth/oidc')).toBe(target);
    const expected = new URL(target);
    expected.searchParams.set('error', body.code);
    expected.searchParams.set('error_description', body.message);
    expect(Buffer.byteLength(expected.href)).toBe(bytes);
    expect(prepare(body, target)).toBe(bytes === 4096 ? expected.href : undefined);
  });

  it('falls back on malformed target/preparation exceptions', () => {
    expect(prepare({ code: 'C', message: 'M' }, '/not-an-absolute-url')).toBeUndefined();
    vi.spyOn(URLSearchParams.prototype, 'set').mockImplementation(() => {
      throw new Error('private serialization failure');
    });
    expect(prepare({ code: 'C', message: 'M' })).toBeUndefined();
  });

  it.each([
    ['login', 'GET', 'text/html', TARGET],
    ['callback', 'HEAD', 'text/html', TARGET],
    ['callback', 'POST', 'text/html', TARGET],
    ['callback', 'get', 'text/html', TARGET],
    ['callback', 'GET', '*/*', TARGET],
    ['callback', 'GET', 'text/html', undefined],
  ])('requires registered callback identity, exact GET and opt-in', (route, method, accept, target) => {
    expect(
      prepareCallbackErrorLocation({ route, method, accept, target, body: { code: 'C', message: 'M' } }),
    ).toBeUndefined();
  });
});
