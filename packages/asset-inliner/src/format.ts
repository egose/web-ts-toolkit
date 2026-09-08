/**
 * Formatters — deterministic CSS wrappers for encoded assets.
 */

import type { EncodedAsset } from './types.ts';
import { InvalidOptionsError } from './errors.ts';

// ---------------------------------------------------------------------------
// Shared data-URL contract — structural output safety boundary (AIH-06)
// ---------------------------------------------------------------------------
//
// Supported contract: `data:<type>/<subtype>;base64,<payload>` where the media
// type uses only characters that are inert in every output context (quoted and
// unquoted HTML attributes, srcset, ordinary CSS `url(...)`, style attributes,
// and style elements) and the payload is strict Base64. Encoded asset bytes
// stay opaque — this is structural safety, not SVG/asset sanitization.
//
// Allowed media-type characters are the definition token set minus `#$&`:
// `#$&` are rejected because `#` starts a fragment, `?` is not in the set but
// would start a query, and `&` can interact with HTML entity parsing. `;,`
// whitespace, quotes, parens, `<>=` are structural delimiters and never
// allowed inside the media type. The payload alphabet `[A-Za-z0-9+/=]` plus
// the single `,` after `;base64,` are the only non-alphanumeric characters in
// a valid URL, so a validated URL cannot close a quoted attribute, add an
// element, start a new CSS declaration, or add a srcset candidate when
// reparsed. Unquoted HTML attributes additionally forbid `=` (Base64 padding):
// HTML serializers quote the replacement (see `html.ts`), accounted in output
// limits. Empty payloads (`data:<mime>;base64,`) are valid.
//
// Stricter than the previous resolver check (`startsWith('data:')` plus
// `includes(';base64,')`): values with charset/parameters, whitespace, quotes,
// parens, semicolons, or non-Base64 payload characters are now rejected with
// `INVALID_OPTIONS` before any mutation.

const SAFE_MIME_RE = /^[A-Za-z0-9][A-Za-z0-9!^_.+-]*\/[A-Za-z0-9][A-Za-z0-9!^_.+-]*$/;
const SAFE_DATA_URL_RE =
  /^data:([A-Za-z0-9][A-Za-z0-9!^_.+-]*\/[A-Za-z0-9][A-Za-z0-9!^_.+-]*);base64,([A-Za-z0-9+/]*={0,2})$/;

/**
 * Whether `dataUrl` satisfies the supported Base64 data-URL contract.
 * Pure predicate — no throw. Structural check only; never decodes bytes.
 */
export function isSafeDataUrl(dataUrl: unknown): boolean {
  if (typeof dataUrl !== 'string') return false;
  const m = SAFE_DATA_URL_RE.exec(dataUrl);
  if (!m) return false;
  const mime = m[1]!;
  const payload = m[2]!;
  if (!SAFE_MIME_RE.test(mime)) return false;
  // Payload must be the Base64 alphabet with at most two trailing `=` pads.
  // The regex already confines `=` to the tail; reject interior remnants like
  // `AB=C=`. No length-multiple check: unpadded payloads (e.g. `abc`) are
  // structurally inert in every output context and stay accepted for
  // compatibility; `encode` always emits padded output. Empty is valid.
  if (payload.includes('=') && !/^[^=]*={1,2}$/.test(payload)) return false;
  return true;
}

/**
 * Assert `dataUrl` satisfies the supported Base64 data-URL contract.
 * @throws {InvalidOptionsError} when the value is not a string or violates the contract.
 */
export function assertSafeDataUrl(dataUrl: unknown): asserts dataUrl is string {
  if (!isSafeDataUrl(dataUrl)) {
    const preview = typeof dataUrl === 'string' ? dataUrl.slice(0, 64) : String(dataUrl);
    throw new InvalidOptionsError(
      `Invalid asset dataUrl "${preview}" — expected "data:<type>/<subtype>;base64,<base64>" with a safe media type and strict Base64 payload`,
    );
  }
}

/**
 * Escape arbitrary text for a single-quoted CSS string context (e.g. `format('...')`).
 * Pure function shared by standalone formatters and automatic `@font-face` hints —
 * postcss-value-parser `string` nodes are serialized verbatim, so callers must
 * escape before constructing AST nodes or string fragments. Escapes backslashes,
 * single quotes, and line breaks (LF/CR/FF as CSS hex escapes); other characters
 * (including `"`, `(`, `)`, `;`, `:`) are inert inside a single-quoted string and
 * need no escaping. Encoded asset bytes stay opaque — this is structural output
 * safety, not asset sanitization.
 */
export function escapeCssSingleQuoteString(value: string): string {
  return value
    .replace(/\\/g, '\\\\')
    .replace(/'/g, "\\'")
    .replace(/\r/g, '\\D ')
    .replace(/\n/g, '\\A ')
    .replace(/\f/g, '\\C ');
}

/**
 * Format a generic CSS `url(...)` value from an encoded asset.
 * Does not add `format(...)`.
 * Deterministic quoting: `url(<dataUrl>)` without extra quotes; escapes `)` if ever present.
 */
export function formatCssUrl(asset: EncodedAsset): string {
  if (!asset || typeof asset.dataUrl !== 'string' || asset.dataUrl.length === 0) {
    throw new InvalidOptionsError('formatCssUrl requires a valid EncodedAsset with dataUrl');
  }
  // Shared structural boundary: reject delimiter-bearing URLs before serializing.
  assertSafeDataUrl(asset.dataUrl);
  // Validated URLs contain no `()"'\s`, so the unquoted `url(...)` word form
  // reparses to a single URL token in ordinary CSS and embedded CSS alike.
  return `url(${asset.dataUrl})`;
}

/**
 * Format a font `url(...) format(...)` source value.
 * Requires `fontFormat` on the asset; throws otherwise.
 * Deterministically uses single quotes for format hint and escapes embedded single quotes.
 */
export function formatFontSource(asset: EncodedAsset): string {
  if (!asset || typeof asset.dataUrl !== 'string' || asset.dataUrl.length === 0) {
    throw new InvalidOptionsError('formatFontSource requires a valid EncodedAsset with dataUrl');
  }
  if (!asset.fontFormat || typeof asset.fontFormat !== 'string' || asset.fontFormat.trim().length === 0) {
    throw new InvalidOptionsError(
      'formatFontSource requires asset.fontFormat — font assets must have fontFormat metadata',
    );
  }
  const cssUrl = formatCssUrl(asset);
  // Deterministic single-quoted format hint via the shared CSS string escaper
  // (handles quotes, backslashes, and line breaks).
  const raw = asset.fontFormat.trim();
  const escaped = escapeCssSingleQuoteString(raw);
  return `${cssUrl} format('${escaped}')`;
}
