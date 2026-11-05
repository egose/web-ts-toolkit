import { OIDC_VAULT_ROUTE_PATHS } from './constants';

const MAX_CONFIGURED_URI_BYTES = 2048;
const MAX_CODE_BYTES = 128;
const MAX_MESSAGE_BYTES = 512;
const MAX_LOCATION_BYTES = 4096;
// eslint-disable-next-line no-control-regex -- WHATWG URL silently repairs some raw controls/whitespace.
const UNSAFE_URL = /[\s\\\u0000-\u001f\u007f-\u009f]/u;
const RESERVED_QUERY_NAMES = new Set([
  'code',
  'state',
  'sessionid',
  'session_id',
  'access_token',
  'accesstoken',
  'refresh_token',
  'refreshtoken',
  'id_token',
  'idtoken',
  'id_token_hint',
]);

/** New-option policy only: do not tighten the existing successful destination. */
export const resolveFrontendErrorRedirectUri = (
  value: unknown,
  backendOrigin: string,
  basePath: string,
): string | undefined => {
  if (value === undefined) return undefined;
  const invalid = () =>
    new TypeError(
      'frontendErrorRedirectUri must be an absolute HTTP(S) URL of at most 2048 UTF-8 bytes, without unsafe characters, userinfo, fragment, credential query parameters or a backend callback loop.',
    );
  if (
    typeof value !== 'string' ||
    !/^https?:\/\//i.test(value) ||
    // Include repaired extra slashes: WHATWG also erases empty userinfo there.
    /^https?:\/{2,}[^/?#]*@/i.test(value) ||
    UNSAFE_URL.test(value) ||
    value.includes('#') ||
    Buffer.byteLength(value, 'utf8') > MAX_CONFIGURED_URI_BYTES
  )
    throw invalid();
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw invalid();
  }
  // Match Express's mounted route: a root base path serves /callback, not //callback.
  const callbackPath = `${basePath === '/' ? '' : basePath}${OIDC_VAULT_ROUTE_PATHS.callback}`;
  if (
    (url.protocol !== 'https:' && url.protocol !== 'http:') ||
    url.origin === 'null' ||
    url.username ||
    url.password ||
    url.hash ||
    Buffer.byteLength(url.href, 'utf8') > MAX_CONFIGURED_URI_BYTES ||
    [...url.searchParams.keys()].some((name) => RESERVED_QUERY_NAMES.has(name.toLowerCase())) ||
    (url.origin === backendOrigin && url.pathname.replace(/\/$/, '').toLowerCase() === callbackPath.toLowerCase())
  )
    throw invalid();
  return url.href;
};

const TOKEN = /^[!#$%&'*+.^_`|~0-9A-Za-z-]+$/;
const MEDIA_RANGE = /^([!#$%&'*+.^_`|~0-9A-Za-z-]+)\/([!#$%&'*+.^_`|~0-9A-Za-z-]+)$/;
const QUALITY = /^(?:0(?:\.[0-9]{0,3})?|1(?:\.0{0,3})?)$/;
const QUOTED = /^"(?:[\t\x20\x21\x23-\x5b\x5d-\x7e\x80-\xff]|\\[\t\x20-\x7e\x80-\xff])*"$/;
const trimOws = (value: string): string => value.replace(/^[\t ]+|[\t ]+$/g, '');

/** Delimiters inside quoted parameter values are not list/parameter separators. */
const splitQuoted = (value: string, separator: string): string[] | undefined => {
  const parts: string[] = [];
  let start = 0;
  let quoted = false;
  for (let index = 0; index < value.length; index++) {
    const character = value[index];
    if (quoted && character === '\\') {
      if (++index === value.length) return undefined;
    } else if (character === '"') quoted = !quoted;
    else if (!quoted && character === separator) {
      parts.push(value.slice(start, index));
      start = index + 1;
    }
  }
  if (quoted) return undefined;
  parts.push(value.slice(start));
  return parts;
};

interface AcceptRange {
  type: string;
  subtype: string;
  quality: number;
  mediaParameters: boolean;
}

const parseAcceptRange = (member: string): AcceptRange | undefined => {
  const parts = splitQuoted(member, ';');
  if (!parts) return undefined;
  const media = MEDIA_RANGE.exec(trimOws(parts[0]));
  if (!media || (media[1] === '*' && media[2] !== '*')) return undefined;
  let quality = 1;
  let seenQuality = false;
  let mediaParameters = false;
  for (const part of parts.slice(1)) {
    const parameter = trimOws(part);
    const equals = parameter.indexOf('=');
    const name = trimOws(equals < 0 ? parameter : parameter.slice(0, equals));
    const value = equals < 0 ? undefined : trimOws(parameter.slice(equals + 1));
    if (!TOKEN.test(name)) return undefined;
    if (name.toLowerCase() === 'q') {
      if (seenQuality || value === undefined || !QUALITY.test(value)) return undefined;
      quality = Number(value);
      seenQuality = true;
    } else {
      if (value === undefined ? !seenQuality : !TOKEN.test(value) && !QUOTED.test(value)) return undefined;
      if (!seenQuality) mediaParameters = true;
    }
  }
  return { type: media[1].toLowerCase(), subtype: media[2].toLowerCase(), quality, mediaParameters };
};

/** Presentation only. JSON wins ties; media wildcards never opt a navigation in. */
export const explicitlyPrefersCallbackHtml = (accept: unknown): boolean => {
  // eslint-disable-next-line no-control-regex -- HTTP OWS permits HTAB, not other controls.
  if (typeof accept !== 'string' || /[\u0000-\u0008\u000a-\u001f\u007f]/u.test(accept)) return false;
  const members = splitQuoted(accept, ',');
  if (!members) return false;
  const ranges: AcceptRange[] = [];
  for (const member of members) {
    if (!trimOws(member)) continue;
    const range = parseAcceptRange(member);
    if (!range) return false;
    if (!range.mediaParameters) ranges.push(range);
  }
  let htmlQuality = 0;
  let jsonQuality = 0;
  let jsonSpecificity = -1;
  for (const { type, subtype, quality } of ranges) {
    if ((type === 'text' && subtype === 'html') || (type === 'application' && subtype === 'xhtml+xml'))
      htmlQuality = Math.max(htmlQuality, quality);
    const specificity =
      type === 'application' && subtype === 'json'
        ? 2
        : type === 'application' && subtype === '*'
          ? 1
          : type === '*' && subtype === '*'
            ? 0
            : -1;
    if (specificity < 0) continue;
    if (specificity > jsonSpecificity) {
      jsonQuality = quality;
      jsonSpecificity = specificity;
    } else if (specificity === jsonSpecificity) jsonQuality = Math.max(jsonQuality, quality);
  }
  return htmlQuality > 0 && htmlQuality > jsonQuality;
};

/** Fully prepare before observers/headers; failure retains the original JSON policy response. */
export const prepareCallbackErrorLocation = (input: {
  route: string;
  method: string;
  accept: unknown;
  target: string | undefined;
  body: Readonly<{ code: unknown; message: unknown }>;
}): string | undefined => {
  try {
    const { route, method, accept, target, body } = input;
    if (route !== 'callback' || method !== 'GET' || target === undefined || !explicitlyPrefersCallbackHtml(accept))
      return undefined;
    const { code, message } = body;
    if (
      typeof code !== 'string' ||
      code.length === 0 ||
      Buffer.byteLength(code, 'utf8') > MAX_CODE_BYTES ||
      typeof message !== 'string' ||
      Buffer.byteLength(message, 'utf8') > MAX_MESSAGE_BYTES
    )
      return undefined;
    const url = new URL(target);
    for (const name of [...url.searchParams.keys()]) {
      if (name.toLowerCase() === 'error' || name.toLowerCase() === 'error_description') url.searchParams.delete(name);
    }
    url.searchParams.set('error', code);
    url.searchParams.set('error_description', message);
    const location = url.href;
    return Buffer.byteLength(location, 'utf8') <= MAX_LOCATION_BYTES ? location : undefined;
  } catch {
    // This is not another authentication error: no retry or recursive onError.
    return undefined;
  }
};
