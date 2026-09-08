/**
 * HTML inliner — pure synchronous transform over an `AssetCatalog`.
 * Inlines `img[src]`, `srcset`, `source`, icon `link[href]`, `video[poster]` for `kind === 'image'`.
 * Uses source-location patches so unrelated markup stays byte-identical; fallback serializes when patches invalid.
 */

import * as parse5 from 'parse5';
import type { InlineOptions, InlineResult, AssetReplacement, AssetDiagnostic } from './types.ts';
import { InvalidOptionsError, ParseError, ResourceLimitError } from './errors.ts';
import { inlineCss } from './css.ts';
import { classifyUrl, resolveAssetReferenceSync } from './resolve.ts';
import { assertSafeDataUrl } from './format.ts';
import {
  validatePolicyOptions,
  DEFAULT_MAX_TARGET_BYTES,
  DEFAULT_MAX_REPLACEMENTS,
  DEFAULT_MAX_OUTPUT_BYTES,
} from './policy.ts';

// ---------------------------------------------------------------------------
// Document vs fragment detection
// ---------------------------------------------------------------------------

function isAsciiWhitespace(ch: string): boolean {
  return ch === ' ' || ch === '\t' || ch === '\n' || ch === '\f' || ch === '\r';
}

function isDocumentHtml(content: string): boolean {
  let s = content;
  // Strip BOM
  if (s.length > 0 && s.charCodeAt(0) === 0xfeff) s = s.slice(1);
  let pos = 0;
  const len = s.length;
  while (true) {
    while (pos < len && isAsciiWhitespace(s[pos] as string)) pos++;
    if (pos + 4 <= len && s.slice(pos, pos + 4) === '<!--') {
      const end = s.indexOf('-->', pos + 4);
      if (end === -1) return false;
      pos = end + 3;
      continue;
    }
    break;
  }
  const trimmed = s.slice(pos);
  if (/^<!doctype/i.test(trimmed)) return true;
  if (/^<html[\s>]/i.test(trimmed)) return true;
  return false;
}

// ---------------------------------------------------------------------------
// srcset helpers — standards-aware split preserving data URLs atomically
// ---------------------------------------------------------------------------

/**
 * Split a srcset attribute value into candidate strings without corrupting data URLs.
 * Implements the HTML `srcset` parsing algorithm in a standards-aware way:
 * - Splits on commas that are candidate separators, not commas inside a `data:` URL payload.
 * - Handles descriptors (`1x`, `2x`, `100w`), ASCII whitespace (space, tab, newline, form-feed, carriage-return),
 *   empty candidates (consecutive commas / whitespace-only), and literal commas inside data URLs atomically.
 * - For `data:` URLs the URL token extends to the next ASCII whitespace (including any literal commas), so
 *   `data:text/plain,hello,world,again 1x` is one candidate, not three.
 */
function splitSrcsetPreservingDataUrls(input: string): string[] {
  if (input.trim() === '') return [];
  const candidates: string[] = [];
  const len = input.length;
  let pos = 0;
  while (pos < len) {
    while (pos < len && isAsciiWhitespace(input[pos] as string)) pos++;
    if (pos >= len) break;
    if (input[pos] === ',') {
      pos++;
      continue;
    }
    const candidateStart = pos;
    const isData = input.slice(pos, pos + 5).toLowerCase() === 'data:';
    let candidateEnd: number;
    if (isData) {
      let ws = pos;
      while (ws < len && !isAsciiWhitespace(input[ws] as string)) ws++;
      if (ws === len) {
        candidateEnd = len;
      } else {
        // If the character before whitespace is a comma, that comma is the candidate separator
        // for a descriptor-less data URL (e.g. "data:text/plain,a,b,c, next"). Treat it as separator.
        if (ws > candidateStart && input[ws - 1] === ',') {
          let after = ws;
          while (after < len && isAsciiWhitespace(input[after] as string)) after++;
          if (after < len) {
            candidateEnd = ws - 1;
            const raw = input.slice(candidateStart, candidateEnd);
            if (raw.trim() !== '') candidates.push(raw);
            pos = candidateEnd;
            if (pos < len && input[pos] === ',') pos++;
            continue;
          }
        }
        const nextComma = input.indexOf(',', ws);
        if (nextComma === -1) candidateEnd = len;
        else candidateEnd = nextComma;
      }
    } else {
      const nextComma = input.indexOf(',', pos);
      if (nextComma === -1) candidateEnd = len;
      else candidateEnd = nextComma;
    }
    const rawCandidate = input.slice(candidateStart, candidateEnd);
    if (rawCandidate.trim() !== '') candidates.push(rawCandidate);
    pos = candidateEnd;
    if (pos < len && input[pos] === ',') pos++;
  }
  return candidates;
}

function extractUrlAndDescriptor(candidate: string): { url: string; descriptor: string } {
  const trimmed = candidate.trim();
  if (trimmed === '') return { url: '', descriptor: '' };
  const match = trimmed.match(/^(\S+)(?:\s+(.*))?$/);
  if (!match) return { url: trimmed, descriptor: '' };
  const url = (match[1] ?? '').trim();
  const descriptor = (match[2] ?? '').trim();
  return { url, descriptor };
}

// ---------------------------------------------------------------------------
// Attribute helpers (parse5 attrs is Array<{name,value}>)
// ---------------------------------------------------------------------------

type Parse5Attr = { name: string; value: string };
type Parse5Element = {
  nodeName: string;
  tagName: string;
  attrs: Parse5Attr[];
  childNodes?: Parse5Element[];
  parentNode?: Parse5Element;
  sourceCodeLocation?: {
    startOffset?: number;
    startLine?: number;
    startCol?: number;
    attrs?: Record<
      string,
      {
        startOffset?: number;
        startLine?: number;
        startCol?: number;
        endOffset?: number;
        endLine?: number;
        endCol?: number;
      }
    >;
    startTag?: {
      startOffset?: number;
      endOffset?: number;
      attrs?: Record<string, { startOffset?: number; endOffset?: number }>;
    };
  } & Record<string, unknown>;
};

function findAttr(element: Parse5Element, nameLower: string): Parse5Attr | undefined {
  return element.attrs?.find((a) => a.name.toLowerCase() === nameLower);
}

function isIconLink(element: Parse5Element): boolean {
  const relAttr = findAttr(element, 'rel');
  if (!relAttr) return false;
  const tokens = relAttr.value.toLowerCase().split(/\s+/).filter(Boolean);
  const allowed = new Set(['icon', 'apple-touch-icon', 'apple-touch-icon-precomposed', 'mask-icon', 'fluid-icon']);
  for (const t of tokens) {
    if (allowed.has(t)) return true;
  }
  return false;
}

function byteLengthUtf8(str: string): number {
  return Buffer.byteLength(str, 'utf8');
}

function addSafe(a: number, b: number, limit: number, documentPath?: string): number {
  if (!Number.isSafeInteger(a) || !Number.isSafeInteger(b)) {
    throw new ResourceLimitError(`Unsafe integer arithmetic: ${a} + ${b} exceeds safe integer range`, {
      limit,
      actual: Number.isSafeInteger(a) ? b : a,
      path: documentPath,
    });
  }
  const c = a + b;
  if (!Number.isSafeInteger(c)) {
    throw new ResourceLimitError(`Unsafe integer arithmetic: ${a} + ${b} exceeds safe integer range`, {
      limit,
      actual: c,
      path: documentPath,
    });
  }
  return c;
}

function subSafe(a: number, b: number, documentPath?: string): number {
  if (!Number.isSafeInteger(a) || !Number.isSafeInteger(b)) {
    throw new ResourceLimitError(`Unsafe integer arithmetic: ${a} - ${b} exceeds safe integer range`, {
      limit: a,
      actual: b,
      path: documentPath,
    });
  }
  const c = a - b;
  if (!Number.isSafeInteger(c)) {
    throw new ResourceLimitError(`Unsafe integer arithmetic: ${a} - ${b} exceeds safe integer range`, {
      limit: a,
      actual: c,
      path: documentPath,
    });
  }
  return c;
}

function offsetToLineCol(content: string, offset: number): { line: number; column: number } {
  const before = content.slice(0, offset);
  const line = before.split('\n').length;
  const lastNl = before.lastIndexOf('\n');
  const column = lastNl === -1 ? offset + 1 : offset - lastNl;
  return { line, column };
}

function getAttrValueRange(
  content: string,
  attrLoc: { startOffset?: number; endOffset?: number },
): { valueStart: number; valueEnd: number } | null {
  if (typeof attrLoc.startOffset !== 'number' || typeof attrLoc.endOffset !== 'number') return null;
  const attrStart = attrLoc.startOffset;
  const attrEnd = attrLoc.endOffset;
  if (attrStart < 0 || attrEnd > content.length || attrStart >= attrEnd) return null;
  const attrText = content.slice(attrStart, attrEnd);
  const eqIdx = attrText.indexOf('=');
  if (eqIdx === -1) return null;
  let vStartInAttr = eqIdx + 1;
  while (vStartInAttr < attrText.length && isAsciiWhitespace(attrText[vStartInAttr] as string)) vStartInAttr++;
  if (vStartInAttr >= attrText.length) return null;
  const first = attrText[vStartInAttr] as string;
  if (first === '"' || first === "'") {
    const quote = first;
    const innerStart = vStartInAttr + 1;
    const closing = attrText.indexOf(quote, innerStart);
    if (closing === -1) return null;
    const valueStart = attrStart + innerStart;
    const valueEnd = attrStart + closing;
    if (valueStart < 0 || valueEnd > content.length || valueStart > valueEnd) return null;
    return { valueStart, valueEnd };
  } else {
    const valueStart = attrStart + vStartInAttr;
    const valueEnd = attrStart + attrText.length;
    // For unquoted, trim trailing whitespace that may be part of attrText? parse5's attr end excludes trailing ws, so fine.
    if (valueStart < 0 || valueEnd > content.length || valueStart > valueEnd) return null;
    return { valueStart, valueEnd };
  }
}

/**
 * Whether the attribute value range was originally quoted (`"..."`/`'...'`).
 * Inspects the character before the value start: an opening quote means the
 * patch replaces inner content and keeps the caller's quote style; otherwise
 * the attribute was unquoted and replacements are wrapped in double quotes so
 * Base64 padding (`=`) and the data-URL comma cannot break tokenization when
 * reparsed. Validated data URLs never contain `"` so the wrapper is inert.
 */
function isQuotedAttrValue(content: string, range: { valueStart: number; valueEnd: number }): boolean {
  if (range.valueStart <= 0 || range.valueStart > content.length) return false;
  const q = content[range.valueStart - 1] as string;
  return q === '"' || q === "'";
}

/** Serialize a validated data URL for an HTML attribute value patch. */
function serializeHtmlAttrReplacement(
  content: string,
  range: { valueStart: number; valueEnd: number },
  dataUrl: string,
): string {
  if (isQuotedAttrValue(content, range)) return dataUrl;
  return `"${dataUrl}"`;
}

// ---------------------------------------------------------------------------
// HTML character-reference decoding with decoded-to-source mapping (AIH-08)
// ---------------------------------------------------------------------------

/**
 * Named character references needed to resolve entity-encoded asset URLs and
 * inline styles. parse5 decodes the full HTML named-reference table; this
 * narrow table covers URL-significant punctuation, CSS quotes, and common
 * markup entities. Unknown `&name;` sequences are left literal (matching the
 * parser for genuinely unknown names), and callers fall back to raw-source
 * parsing whenever our decode disagrees with the parser-provided value.
 */
const HTML_NAMED_REFS: Record<string, string> = {
  amp: '&',
  AMP: '&',
  lt: '<',
  LT: '<',
  gt: '>',
  GT: '>',
  quot: '"',
  QUOT: '"',
  apos: "'",
  nbsp: ' ',
  TAB: '\t',
  NewLine: '\n',
  colon: ':',
  semi: ';',
  comma: ',',
  sol: '/',
  period: '.',
  quest: '?',
  num: '#',
  percnt: '%',
  equals: '=',
  excl: '!',
  plus: '+',
  lowbar: '_',
  hyphen: '-',
  lpar: '(',
  rpar: ')',
  copy: '©',
  laquo: '«',
  raquo: '»',
};

/** Legacy names decoded without a trailing semicolon (attribute-aware). */
const HTML_LEGACY_NO_SEMI = new Set(['amp', 'lt', 'gt', 'quot', 'nbsp']);

/** Windows-1252 overrides for C1 numeric references per the HTML standard. */
const HTML_C1_OVERRIDES: Record<number, number> = {
  0x80: 0x20ac,
  0x82: 0x201a,
  0x83: 0x0192,
  0x84: 0x201e,
  0x85: 0x2026,
  0x86: 0x2020,
  0x87: 0x2021,
  0x88: 0x02c6,
  0x89: 0x2030,
  0x8a: 0x0160,
  0x8b: 0x2039,
  0x8c: 0x0152,
  0x8e: 0x017d,
  0x91: 0x2018,
  0x92: 0x2019,
  0x93: 0x201c,
  0x94: 0x201d,
  0x95: 0x2022,
  0x96: 0x2013,
  0x97: 0x2014,
  0x98: 0x02dc,
  0x99: 0x2122,
  0x9a: 0x0161,
  0x9b: 0x203a,
  0x9c: 0x0153,
  0x9e: 0x017e,
  0x9f: 0x0178,
};

function decodeNumericRef(code: number): string {
  if (code === 0 || code > 0x10ffff || (code >= 0xd800 && code <= 0xdfff) || code === 0x0d) {
    // NUL, out-of-range, and surrogate references decode to U+FFFD. CR is
    // normalized to LF by HTML input processing; report LF here.
    if (code === 0x0d) return '\n';
    return '�';
  }
  const override = HTML_C1_OVERRIDES[code];
  const cp = override ?? code;
  return String.fromCodePoint(cp);
}

/**
 * Decode HTML character references in a raw attribute-value source slice,
 * returning the decoded text plus `map` where `map[d]` is the raw-relative
 * source index of decoded offset `d` (`map[text.length] === raw.length`).
 * Each UTF-16 unit of a multi-unit decoded reference maps to the reference
 * start so replacement locations point at the original source spelling.
 */
function decodeHtmlAttrValue(raw: string): { text: string; map: number[] } {
  let text = '';
  const map: number[] = [];
  const len = raw.length;
  let i = 0;
  const push = (unit: string, srcIdx: number): void => {
    text += unit;
    map.push(srcIdx);
  };
  while (i < len) {
    const ch = raw[i] as string;
    if (ch !== '&') {
      push(ch, i);
      i++;
      continue;
    }
    const rest = raw.slice(i);
    let m = /^&#(\d+);?/.exec(rest);
    if (!m) m = /^&#[xX]([0-9a-fA-F]+);?/.exec(rest) as RegExpExecArray | null;
    if (m) {
      const isHex = (m[0] as string)[2] === 'x' || (m[0] as string)[2] === 'X';
      const code = Number.parseInt(m[1] as string, isHex ? 16 : 10);
      if (Number.isSafeInteger(code)) {
        const decoded = decodeNumericRef(code);
        // Index by UTF-16 unit so `map` stays aligned with string offsets
        // even for astral references (surrogate pairs).
        for (let k = 0; k < decoded.length; k++) push(decoded[k] as string, i);
        i += (m[0] as string).length;
        continue;
      }
    }
    const named = /^&([A-Za-z0-9]+);/.exec(rest);
    if (named) {
      const val = HTML_NAMED_REFS[named[1] as string];
      if (val !== undefined) {
        for (let k = 0; k < val.length; k++) push(val[k] as string, i);
        i += (named[0] as string).length;
        continue;
      }
      // Unknown `&name;` stays literal, matching the HTML parser.
      push('&', i);
      i++;
      continue;
    }
    const legacy = /^&([a-zA-Z]+)/.exec(rest);
    if (legacy && HTML_LEGACY_NO_SEMI.has(legacy[1] as string)) {
      const after = raw[i + (legacy[0] as string).length];
      if (after === undefined || !/[A-Za-z0-9=]/.test(after)) {
        const val = HTML_NAMED_REFS[legacy[1] as string] as string;
        for (let k = 0; k < val.length; k++) push(val[k] as string, i);
        i += (legacy[0] as string).length;
        continue;
      }
    }
    push('&', i);
    i++;
  }
  map.push(len);
  return { text, map };
}

/**
 * Re-encode transformed CSS text for an HTML attribute-value patch. Escapes
 * `&`/`<`/`>` plus the active quote character so the patched value reparses
 * to the same attribute without acquiring new markup or breaking out of the
 * attribute. Validated data URLs contain none of these characters, so actual
 * replacements pass through byte-identical.
 */
function escapeHtmlAttrValue(text: string, activeQuote: string | null): string {
  let out = '';
  for (const ch of text) {
    if (ch === '&') out += '&amp;';
    else if (ch === '<') out += '&lt;';
    else if (ch === '>') out += '&gt;';
    else if (activeQuote !== null && ch === activeQuote) out += activeQuote === '"' ? '&quot;' : '&#39;';
    else out += ch;
  }
  return out;
}

/** Active quote character for an attribute value range (`null` if unquoted). */
function activeQuoteChar(content: string, range: { valueStart: number; valueEnd: number }): string | null {
  if (range.valueStart <= 0 || range.valueStart > content.length) return null;
  const q = content[range.valueStart - 1] as string;
  return q === '"' || q === "'" ? q : null;
}

/** Split a decoded srcset value into candidates with decoded offsets. */
function splitSrcsetWithOffsets(input: string): Array<{ text: string; start: number; end: number }> {
  const out: Array<{ text: string; start: number; end: number }> = [];
  if (input.trim() === '') return out;
  const len = input.length;
  let pos = 0;
  while (pos < len) {
    while (pos < len && isAsciiWhitespace(input[pos] as string)) pos++;
    if (pos >= len) break;
    if (input[pos] === ',') {
      pos++;
      continue;
    }
    const candidateStart = pos;
    const isData = input.slice(pos, pos + 5).toLowerCase() === 'data:';
    let candidateEnd: number;
    if (isData) {
      let ws = pos;
      while (ws < len && !isAsciiWhitespace(input[ws] as string)) ws++;
      if (ws === len) {
        candidateEnd = len;
      } else {
        if (ws > candidateStart && input[ws - 1] === ',') {
          let after = ws;
          while (after < len && isAsciiWhitespace(input[after] as string)) after++;
          if (after < len) {
            candidateEnd = ws - 1;
            const raw = input.slice(candidateStart, candidateEnd);
            if (raw.trim() !== '') out.push({ text: raw, start: candidateStart, end: candidateEnd });
            pos = candidateEnd;
            if (pos < len && input[pos] === ',') pos++;
            continue;
          }
        }
        const nextComma = input.indexOf(',', ws);
        if (nextComma === -1) candidateEnd = len;
        else candidateEnd = nextComma;
      }
    } else {
      const nextComma = input.indexOf(',', pos);
      if (nextComma === -1) candidateEnd = len;
      else candidateEnd = nextComma;
    }
    const rawCandidate = input.slice(candidateStart, candidateEnd);
    if (rawCandidate.trim() !== '') out.push({ text: rawCandidate, start: candidateStart, end: candidateEnd });
    pos = candidateEnd;
    if (pos < len && input[pos] === ',') pos++;
  }
  return out;
}

/** Extract URL + descriptor with decoded offsets (ASCII-whitespace split). */
function extractUrlAndDescriptorOffsets(candidate: { text: string; start: number }): {
  url: string;
  descriptor: string;
  urlStart: number;
  urlEnd: number;
} {
  const text = candidate.text;
  const len = text.length;
  let s = 0;
  while (s < len && isAsciiWhitespace(text[s] as string)) s++;
  let e = len;
  while (e > s && isAsciiWhitespace(text[e - 1] as string)) e--;
  if (s >= e) return { url: '', descriptor: '', urlStart: candidate.start + s, urlEnd: candidate.start + s };
  let urlEndRel = s;
  while (urlEndRel < e && !isAsciiWhitespace(text[urlEndRel] as string)) urlEndRel++;
  const url = text.slice(s, urlEndRel);
  let dStart = urlEndRel;
  while (dStart < e && isAsciiWhitespace(text[dStart] as string)) dStart++;
  const descriptor = text.slice(dStart, e);
  return { url, descriptor, urlStart: candidate.start + s, urlEnd: candidate.start + urlEndRel };
}

type Patch = { start: number; end: number; newValue: string };

// ---------------------------------------------------------------------------
// Traversal
// ---------------------------------------------------------------------------

function walkAndInline(
  node: Parse5Element,
  ctx: {
    catalog: InlineOptions['catalog'];
    documentPath?: string;
    rootDir?: string;
    allowBasenameMatch?: boolean;
    resolver?: InlineOptions['resolver'];
    replacements: AssetReplacement[];
    diagnostics: AssetDiagnostic[];
    modified: { value: boolean };
    content: string;
    maxReplacements: number;
    maxOutputBytes: number;
    projectedBytes: { value: number };
    patches: Patch[];
    patchValid: { value: boolean };
    maxInlineBytes?: number;
    shouldInline?: (asset: import('./types.ts').EncodedAsset, url: string) => boolean;
    inlineEmbeddedCss?: boolean;
  },
): void {
  const tag = (node.tagName ?? node.nodeName ?? '').toLowerCase();
  if (tag) {
    if (tag === 'img') {
      handleSimpleAttr(node, 'src', ctx);
      handleSrcsetAttr(node, 'srcset', ctx);
    } else if (tag === 'source') {
      handleSimpleAttr(node, 'src', ctx);
      handleSrcsetAttr(node, 'srcset', ctx);
    } else if (tag === 'link') {
      if (isIconLink(node)) {
        handleSimpleAttr(node, 'href', ctx);
      }
    } else if (tag === 'video') {
      handleSimpleAttr(node, 'poster', ctx);
    } else if (tag === 'style') {
      if (ctx.inlineEmbeddedCss === true) handleStyleElement(node, ctx);
    }
    if (ctx.inlineEmbeddedCss === true) handleStyleAttr(node, ctx);
  }

  const children = (node as Parse5Element & { childNodes?: Parse5Element[] }).childNodes;
  if (children && children.length > 0) {
    for (const child of children) {
      walkAndInline(child as Parse5Element, ctx);
    }
  }
}

function locationForUrlToken(content: string, offset: number): { offset: number; line: number; column: number } {
  if (offset < 0 || offset > content.length) return { offset: -1, line: 1, column: 1 };
  const { line, column } = offsetToLineCol(content, offset);
  return { offset, line, column };
}

function getAttributeLoc(
  element: Parse5Element,
  attrNameLower: string,
): { startOffset?: number; endOffset?: number; startLine?: number; startCol?: number } | undefined {
  const locAny = element.sourceCodeLocation as unknown as
    | { attrs?: Record<string, unknown>; startTag?: { attrs?: Record<string, unknown> } }
    | undefined;
  const attrs = (element.sourceCodeLocation as unknown as { attrs?: Record<string, unknown> })?.attrs as
    | Record<string, unknown>
    | undefined;
  const startTagAttrs = (locAny?.startTag as { attrs?: Record<string, unknown> } | undefined)?.attrs as
    | Record<string, unknown>
    | undefined;
  let resolved: unknown;
  if (attrs) {
    const key = Object.keys(attrs).find((k) => k.toLowerCase() === attrNameLower);
    if (key) resolved = attrs[key];
  }
  if (!resolved && startTagAttrs) {
    const key = Object.keys(startTagAttrs).find((k) => k.toLowerCase() === attrNameLower);
    if (key) resolved = startTagAttrs[key];
  }
  return resolved as { startOffset?: number; endOffset?: number; startLine?: number; startCol?: number } | undefined;
}

function handleSimpleAttr(
  element: Parse5Element,
  attrNameLower: string,
  ctx: {
    catalog: InlineOptions['catalog'];
    documentPath?: string;
    rootDir?: string;
    allowBasenameMatch?: boolean;
    resolver?: InlineOptions['resolver'];
    replacements: AssetReplacement[];
    diagnostics: AssetDiagnostic[];
    modified: { value: boolean };
    content: string;
    maxReplacements: number;
    maxOutputBytes: number;
    projectedBytes: { value: number };
    patches: Patch[];
    patchValid: { value: boolean };
    maxInlineBytes?: number;
    shouldInline?: (asset: import('./types.ts').EncodedAsset, url: string) => boolean;
  },
): void {
  const attr = findAttr(element, attrNameLower);
  if (!attr) return;
  const raw = attr.value;
  if (raw.trim() === '') return;

  const cls = classifyUrl(raw);
  if (cls.kind === 'skip') return;

  let resolved: ReturnType<typeof resolveAssetReferenceSync>;
  try {
    resolved = resolveAssetReferenceSync(raw, ctx.catalog!, {
      documentPath: ctx.documentPath,
      rootDir: ctx.rootDir,
      allowBasenameMatch: ctx.allowBasenameMatch,
      resolver: ctx.resolver,
    } as unknown as Parameters<typeof resolveAssetReferenceSync>[2]);
  } catch (err) {
    if (
      err instanceof InvalidOptionsError &&
      String((err as Error).message)
        .toLowerCase()
        .includes('resolver')
    ) {
      throw err;
    }
    const code = (err as { code?: string }).code ?? 'RESOLVE_ERROR';
    const msg = err instanceof Error ? err.message : String(err);
    ctx.diagnostics.push({
      code,
      message: msg,
      originalUrl: raw,
      severity: 'error',
      filePath: ctx.documentPath,
    } as AssetDiagnostic);
    return;
  }

  if ((resolved as { skipped: boolean }).skipped) return;
  const res = resolved as { asset?: unknown; resolvedPath?: string; skipped: boolean };
  if (!res.asset) {
    ctx.diagnostics.push({
      code: 'UNRESOLVED_REFERENCE',
      message: `Unresolved asset reference "${raw}" (resolved to "${res.resolvedPath ?? ''}")`,
      originalUrl: raw,
      filePath: res.resolvedPath ?? ctx.documentPath,
      severity: 'warn',
    } as AssetDiagnostic);
    return;
  }
  const asset = res.asset as import('./types.ts').EncodedAsset;
  if (asset.kind !== 'image') {
    ctx.diagnostics.push({
      code: 'UNSUPPORTED_KIND',
      message: `Asset "${raw}" resolved to kind "${asset.kind}" but HTML target "${element.tagName}[${attrNameLower}]" only supports "image" (audio/video deferred per ASSET-08)`,
      originalUrl: raw,
      filePath: res.resolvedPath ?? ctx.documentPath,
      severity: 'warn',
    } as AssetDiagnostic);
    return;
  }
  const resolvedPath = res.resolvedPath ?? asset.sourcePath ?? asset.filename ?? raw;
  // Shared structural boundary: catalog-supplied assets use the same contract
  // as resolver returns. Fail closed before limits/mutation.
  try {
    assertSafeDataUrl(asset.dataUrl);
  } catch (err) {
    throw new InvalidOptionsError(
      `Invalid resolver asset dataUrl for "${raw}" — must match "data:<type>/<subtype>;base64,<base64>" with a safe media type and strict Base64 payload`,
      { cause: err },
    );
  }
  // Selective inlining policy — distinct from hard resource limits.
  if (typeof ctx.maxInlineBytes === 'number' && asset.byteLength > ctx.maxInlineBytes) {
    ctx.diagnostics.push({
      code: 'INLINE_SKIPPED',
      message: `Asset "${raw}" (${asset.byteLength} bytes) exceeds maxInlineBytes ${ctx.maxInlineBytes} — left as external reference`,
      originalUrl: raw,
      filePath: resolvedPath,
      severity: 'warn',
    } as AssetDiagnostic);
    return;
  }
  if (ctx.shouldInline !== undefined) {
    let decision: unknown;
    try {
      decision = ctx.shouldInline(asset, raw);
    } catch (err) {
      throw new InvalidOptionsError(
        `shouldInline predicate threw: ${err instanceof Error ? err.message : String(err)}`,
        { cause: err },
      );
    }
    if (
      decision !== null &&
      typeof decision === 'object' &&
      typeof (decision as { then?: unknown }).then === 'function'
    ) {
      throw new InvalidOptionsError('shouldInline must be synchronous — returned a thenable');
    }
    if (!decision) {
      ctx.diagnostics.push({
        code: 'INLINE_SKIPPED',
        message: `Asset "${raw}" skipped by shouldInline predicate — left as external reference`,
        originalUrl: raw,
        filePath: resolvedPath,
        severity: 'warn',
      } as AssetDiagnostic);
      return;
    }
  }
  const nextCount = addSafe(ctx.replacements.length, 1, ctx.maxReplacements, ctx.documentPath);
  if (nextCount > ctx.maxReplacements) {
    throw new ResourceLimitError(`Replacement count ${nextCount} exceeds maxReplacements ${ctx.maxReplacements}`, {
      limit: ctx.maxReplacements,
      actual: nextCount,
      path: ctx.documentPath,
    });
  }
  // Determine serialized replacement before limit accounting: quoted attrs
  // keep the validated URL verbatim; unquoted attrs gain double quotes so
  // Base64 padding (`=`) stays inside one token when reparsed. The expansion
  // (+2 bytes) counts toward projected output limits.
  const earlyAttrLoc = getAttributeLoc(element, attrNameLower);
  const earlyRange = earlyAttrLoc
    ? getAttrValueRange(ctx.content, earlyAttrLoc as { startOffset?: number; endOffset?: number })
    : null;
  const serializedReplacement =
    earlyRange !== null ? serializeHtmlAttrReplacement(ctx.content, earlyRange, asset.dataUrl) : asset.dataUrl;
  const dataUrlBytes = byteLengthUtf8(serializedReplacement);
  // Account against the original source spelling (which may contain character
  // references longer than the decoded value), not the decoded length.
  const origBytes =
    earlyRange !== null
      ? byteLengthUtf8(ctx.content.slice(earlyRange.valueStart, earlyRange.valueEnd))
      : byteLengthUtf8(raw);
  if (!Number.isSafeInteger(dataUrlBytes) || !Number.isSafeInteger(origBytes)) {
    throw new ResourceLimitError(`Unsafe integer byte length for replacement`, {
      limit: ctx.maxOutputBytes,
      actual: dataUrlBytes,
      path: ctx.documentPath,
    });
  }
  const delta = subSafe(dataUrlBytes, origBytes, ctx.documentPath);
  const nextProjected = addSafe(ctx.projectedBytes.value, delta, ctx.maxOutputBytes, ctx.documentPath);
  if (nextProjected > ctx.maxOutputBytes) {
    throw new ResourceLimitError(
      `Projected output bytes ${nextProjected} exceeds maxOutputBytes ${ctx.maxOutputBytes}`,
      {
        limit: ctx.maxOutputBytes,
        actual: nextProjected,
        path: ctx.documentPath,
      },
    );
  }
  ctx.projectedBytes.value = nextProjected;

  // Location is URL token offset (value start), not attribute start. Bases: offset 0-based, line 1-based, column 1-based.
  let loc: { offset: number; line?: number; column?: number };
  const range = earlyRange;
  if (range) {
    loc = locationForUrlToken(ctx.content, range.valueStart);
    // Collect patch for source-location patching
    ctx.patches.push({ start: range.valueStart, end: range.valueEnd, newValue: serializedReplacement });
    if (range.valueStart < 0 || range.valueEnd > ctx.content.length || range.valueStart >= range.valueEnd) {
      ctx.patchValid.value = false;
    }
  } else {
    ctx.patchValid.value = false;
    const off = ctx.content.indexOf(raw);
    if (off !== -1) {
      const lc = offsetToLineCol(ctx.content, off);
      loc = { offset: off, line: lc.line, column: lc.column };
    } else {
      loc = { offset: -1 };
    }
  }

  ctx.replacements.push(
    Object.freeze({
      originalUrl: raw,
      resolvedPath,
      mediaType: asset.mediaType,
      kind: asset.kind,
      byteLength: asset.byteLength,
      location: { offset: loc.offset, line: loc.line, column: loc.column },
    }) as AssetReplacement,
  );
  // Keep attr.value mutated as fallback for serialize path; patches will be preferred when valid
  attr.value = asset.dataUrl;
  ctx.modified.value = true;
}

/**
 * Mapped srcset path (AIH-08): `decoded` is the entity-decoded attribute
 * value and `map[d]` is the raw-relative source index of decoded offset `d`.
 * URLs resolve in decoded space; replacements splice the RAW source slice at
 * mapped spans so separators, descriptors, and unrelated entities stay
 * byte-identical. Validated data URLs need no re-encoding for this context.
 */
function handleSrcsetDecoded(
  element: Parse5Element,
  attr: Parse5Attr,
  valueRange: { valueStart: number; valueEnd: number },
  rawSrcset: string,
  decoded: string,
  map: number[],
  ctx: {
    catalog: InlineOptions['catalog'];
    documentPath?: string;
    rootDir?: string;
    allowBasenameMatch?: boolean;
    resolver?: InlineOptions['resolver'];
    replacements: AssetReplacement[];
    diagnostics: AssetDiagnostic[];
    modified: { value: boolean };
    content: string;
    maxReplacements: number;
    maxOutputBytes: number;
    projectedBytes: { value: number };
    patches: Patch[];
    patchValid: { value: boolean };
    maxInlineBytes?: number;
    shouldInline?: (asset: import('./types.ts').EncodedAsset, url: string) => boolean;
  },
): void {
  const candidates = splitSrcsetWithOffsets(decoded);
  if (candidates.length === 0) return;

  let anyChanged = false;
  const newCandidates: string[] = [];
  const spanPatches: Array<{ relStart: number; relEnd: number; newValue: string }> = [];

  for (const candidate of candidates) {
    const { url, descriptor, urlStart, urlEnd } = extractUrlAndDescriptorOffsets(candidate);
    if (!url) {
      newCandidates.push(candidate.text.trim());
      continue;
    }
    // Map the decoded URL token to its original-source span. The sentinel
    // `map[decoded.length]` keeps end-exclusive spans sound at the tail.
    if (urlStart < 0 || urlEnd > decoded.length || urlStart >= urlEnd) {
      newCandidates.push(descriptor ? `${url} ${descriptor}` : url);
      continue;
    }
    const relStart = map[urlStart] as number;
    const relEnd = map[urlEnd] as number;
    if (relStart < 0 || relEnd > rawSrcset.length || relStart >= relEnd) {
      newCandidates.push(descriptor ? `${url} ${descriptor}` : url);
      continue;
    }
    const keep = (): void => {
      newCandidates.push(descriptor ? `${url} ${descriptor}` : url);
    };
    const cls = classifyUrl(url);
    if (cls.kind === 'skip') {
      keep();
      continue;
    }

    let resolved: ReturnType<typeof resolveAssetReferenceSync>;
    try {
      resolved = resolveAssetReferenceSync(url, ctx.catalog!, {
        documentPath: ctx.documentPath,
        rootDir: ctx.rootDir,
        allowBasenameMatch: ctx.allowBasenameMatch,
        resolver: ctx.resolver,
      } as unknown as Parameters<typeof resolveAssetReferenceSync>[2]);
    } catch (err) {
      if (
        err instanceof InvalidOptionsError &&
        String((err as Error).message)
          .toLowerCase()
          .includes('resolver')
      ) {
        throw err;
      }
      const code = (err as { code?: string }).code ?? 'RESOLVE_ERROR';
      const msg = err instanceof Error ? err.message : String(err);
      ctx.diagnostics.push({
        code,
        message: msg,
        originalUrl: url,
        severity: 'error',
        filePath: ctx.documentPath,
      } as AssetDiagnostic);
      keep();
      continue;
    }

    if ((resolved as { skipped: boolean }).skipped) {
      keep();
      continue;
    }
    const res = resolved as { asset?: unknown; resolvedPath?: string; skipped: boolean };
    if (!res.asset) {
      ctx.diagnostics.push({
        code: 'UNRESOLVED_REFERENCE',
        message: `Unresolved asset reference "${url}" (resolved to "${res.resolvedPath ?? ''}")`,
        originalUrl: url,
        filePath: res.resolvedPath ?? ctx.documentPath,
        severity: 'warn',
      } as AssetDiagnostic);
      keep();
      continue;
    }
    const asset = res.asset as import('./types.ts').EncodedAsset;
    if (asset.kind !== 'image') {
      ctx.diagnostics.push({
        code: 'UNSUPPORTED_KIND',
        message: `Asset "${url}" resolved to kind "${asset.kind}" but srcset only supports "image" (audio/video deferred per ASSET-08)`,
        originalUrl: url,
        filePath: res.resolvedPath ?? ctx.documentPath,
        severity: 'warn',
      } as AssetDiagnostic);
      keep();
      continue;
    }

    const resolvedPath = res.resolvedPath ?? asset.sourcePath ?? asset.filename ?? url;
    // Shared structural boundary: same contract as resolver returns. A
    // delimiter-bearing dataUrl (quotes, spaces, parens, extra commas) could
    // otherwise add srcset candidates — fail closed before limits/mutation.
    try {
      assertSafeDataUrl(asset.dataUrl);
    } catch (err) {
      throw new InvalidOptionsError(
        `Invalid resolver asset dataUrl for "${url}" — must match "data:<type>/<subtype>;base64,<base64>" with a safe media type and strict Base64 payload`,
        { cause: err },
      );
    }
    // Selective inlining policy — distinct from hard resource limits.
    if (typeof ctx.maxInlineBytes === 'number' && asset.byteLength > ctx.maxInlineBytes) {
      ctx.diagnostics.push({
        code: 'INLINE_SKIPPED',
        message: `Asset "${url}" (${asset.byteLength} bytes) exceeds maxInlineBytes ${ctx.maxInlineBytes} — left as external reference`,
        originalUrl: url,
        filePath: resolvedPath,
        severity: 'warn',
      } as AssetDiagnostic);
      keep();
      continue;
    }
    if (ctx.shouldInline !== undefined) {
      let decision: unknown;
      try {
        decision = ctx.shouldInline(asset, url);
      } catch (err) {
        throw new InvalidOptionsError(
          `shouldInline predicate threw: ${err instanceof Error ? err.message : String(err)}`,
          { cause: err },
        );
      }
      if (
        decision !== null &&
        typeof decision === 'object' &&
        typeof (decision as { then?: unknown }).then === 'function'
      ) {
        throw new InvalidOptionsError('shouldInline must be synchronous — returned a thenable');
      }
      if (!decision) {
        ctx.diagnostics.push({
          code: 'INLINE_SKIPPED',
          message: `Asset "${url}" skipped by shouldInline predicate — left as external reference`,
          originalUrl: url,
          filePath: resolvedPath,
          severity: 'warn',
        } as AssetDiagnostic);
        keep();
        continue;
      }
    }
    const nextCount = addSafe(ctx.replacements.length, 1, ctx.maxReplacements, ctx.documentPath);
    if (nextCount > ctx.maxReplacements) {
      throw new ResourceLimitError(`Replacement count ${nextCount} exceeds maxReplacements ${ctx.maxReplacements}`, {
        limit: ctx.maxReplacements,
        actual: nextCount,
        path: ctx.documentPath,
      });
    }
    const dataUrlBytes = byteLengthUtf8(asset.dataUrl);
    // Account against the original source spelling (which may contain
    // character references longer than the decoded URL), not the decoded
    // length, so whole-target resource accounting holds.
    const origBytes = byteLengthUtf8(rawSrcset.slice(relStart, relEnd));
    if (!Number.isSafeInteger(dataUrlBytes) || !Number.isSafeInteger(origBytes)) {
      throw new ResourceLimitError(`Unsafe integer byte length for replacement`, {
        limit: ctx.maxOutputBytes,
        actual: dataUrlBytes,
        path: ctx.documentPath,
      });
    }
    const delta = subSafe(dataUrlBytes, origBytes, ctx.documentPath);
    const nextProjected = addSafe(ctx.projectedBytes.value, delta, ctx.maxOutputBytes, ctx.documentPath);
    if (nextProjected > ctx.maxOutputBytes) {
      throw new ResourceLimitError(
        `Projected output bytes ${nextProjected} exceeds maxOutputBytes ${ctx.maxOutputBytes}`,
        {
          limit: ctx.maxOutputBytes,
          actual: nextProjected,
          path: ctx.documentPath,
        },
      );
    }
    ctx.projectedBytes.value = nextProjected;

    // Location points at the original-source spelling, so duplicate entity
    // references report distinct offsets with correct line/column.
    const locOffset = valueRange.valueStart + relStart;
    const lc = offsetToLineCol(ctx.content, locOffset);
    ctx.replacements.push(
      Object.freeze({
        originalUrl: url,
        resolvedPath,
        mediaType: asset.mediaType,
        kind: asset.kind,
        byteLength: asset.byteLength,
        location: { offset: locOffset, line: lc.line, column: lc.column },
      }) as AssetReplacement,
    );
    spanPatches.push({ relStart, relEnd, newValue: asset.dataUrl });
    newCandidates.push(descriptor ? `${asset.dataUrl} ${descriptor}` : asset.dataUrl);
    anyChanged = true;
  }

  if (!anyChanged) return;
  // Splice replacements into the raw slice so separators, descriptors, and
  // unrelated entities remain byte-identical.
  let patched = rawSrcset;
  for (const p of [...spanPatches].sort((a, b) => b.relStart - a.relStart)) {
    patched = patched.slice(0, p.relStart) + p.newValue + patched.slice(p.relEnd);
  }
  // Unquoted srcset values gain double quotes in the source patch so Base64
  // padding and the data-URL comma stay inside one token when reparsed (+2
  // bytes of escaping expansion counted toward output limits). The fallback
  // serialize path keeps the raw value — parse5 quotes on serialize.
  let patchSrcset = patched;
  if (!isQuotedAttrValue(ctx.content, valueRange)) {
    const quoted = `"${patched}"`;
    const extra = byteLengthUtf8(quoted) - byteLengthUtf8(patched);
    const nextProjected = addSafe(ctx.projectedBytes.value, extra, ctx.maxOutputBytes, ctx.documentPath);
    if (nextProjected > ctx.maxOutputBytes) {
      throw new ResourceLimitError(
        `Projected output bytes ${nextProjected} exceeds maxOutputBytes ${ctx.maxOutputBytes}`,
        {
          limit: ctx.maxOutputBytes,
          actual: nextProjected,
          path: ctx.documentPath,
        },
      );
    }
    ctx.projectedBytes.value = nextProjected;
    patchSrcset = quoted;
  }
  ctx.patches.push({ start: valueRange.valueStart, end: valueRange.valueEnd, newValue: patchSrcset });
  if (
    valueRange.valueStart < 0 ||
    valueRange.valueEnd > ctx.content.length ||
    valueRange.valueStart >= valueRange.valueEnd
  ) {
    ctx.patchValid.value = false;
  }
  attr.value = newCandidates.join(', ');
  ctx.modified.value = true;
}

function handleSrcsetAttr(
  element: Parse5Element,
  attrNameLower: string,
  ctx: {
    catalog: InlineOptions['catalog'];
    documentPath?: string;
    rootDir?: string;
    allowBasenameMatch?: boolean;
    resolver?: InlineOptions['resolver'];
    replacements: AssetReplacement[];
    diagnostics: AssetDiagnostic[];
    modified: { value: boolean };
    content: string;
    maxReplacements: number;
    maxOutputBytes: number;
    projectedBytes: { value: number };
    patches: Patch[];
    patchValid: { value: boolean };
    maxInlineBytes?: number;
    shouldInline?: (asset: import('./types.ts').EncodedAsset, url: string) => boolean;
  },
): void {
  const attr = findAttr(element, attrNameLower);
  if (!attr) return;
  const attrLoc = getAttributeLoc(element, attrNameLower);
  let rawSrcset: string;
  let valueRange: { valueStart: number; valueEnd: number } | null = null;
  if (attrLoc) valueRange = getAttrValueRange(ctx.content, attrLoc as { startOffset?: number; endOffset?: number });
  if (valueRange) rawSrcset = ctx.content.slice(valueRange.valueStart, valueRange.valueEnd);
  else rawSrcset = attr.value;
  if (rawSrcset.trim() === '') return;

  // AIH-08: decode character references once (the parser already decoded
  // `attr.value`) with a decoded-to-source map. Proceed on the mapped path
  // only when our decode agrees with the parser-provided value; otherwise
  // fall back to raw-source parsing below so entities outside the narrow
  // table (or newline normalization) can neither double-decode nor mis-map.
  if (valueRange) {
    const range = valueRange as { valueStart: number; valueEnd: number };
    const decoded = decodeHtmlAttrValue(rawSrcset);
    if (decoded.text === attr.value) {
      handleSrcsetDecoded(element, attr, range, rawSrcset, decoded.text, decoded.map, ctx);
      return;
    }
  }

  const candidatesRaw = splitSrcsetPreservingDataUrls(rawSrcset);
  if (candidatesRaw.length === 0) return;

  let anyChanged = false;
  const newCandidates: string[] = [];
  // For URL token locations, track search position inside rawSrcset
  let searchPos = 0;

  for (const rawCandidate of candidatesRaw) {
    const trimmedForCheck = rawCandidate.trim();
    if (trimmedForCheck === '') {
      continue;
    }
    const { url, descriptor } = extractUrlAndDescriptor(rawCandidate);
    if (!url) {
      newCandidates.push(rawCandidate.trim());
      // advance searchPos past this candidate
      const idx = rawSrcset.indexOf(rawCandidate, searchPos);
      if (idx !== -1) searchPos = idx + rawCandidate.length;
      continue;
    }
    const cls = classifyUrl(url);
    if (cls.kind === 'skip') {
      newCandidates.push(descriptor ? `${url} ${descriptor}` : url);
      const idx = rawSrcset.indexOf(url, searchPos);
      if (idx !== -1) searchPos = idx + url.length;
      continue;
    }

    let resolved: ReturnType<typeof resolveAssetReferenceSync>;
    try {
      resolved = resolveAssetReferenceSync(url, ctx.catalog!, {
        documentPath: ctx.documentPath,
        rootDir: ctx.rootDir,
        allowBasenameMatch: ctx.allowBasenameMatch,
        resolver: ctx.resolver,
      } as unknown as Parameters<typeof resolveAssetReferenceSync>[2]);
    } catch (err) {
      if (
        err instanceof InvalidOptionsError &&
        String((err as Error).message)
          .toLowerCase()
          .includes('resolver')
      ) {
        throw err;
      }
      const code = (err as { code?: string }).code ?? 'RESOLVE_ERROR';
      const msg = err instanceof Error ? err.message : String(err);
      ctx.diagnostics.push({
        code,
        message: msg,
        originalUrl: url,
        severity: 'error',
        filePath: ctx.documentPath,
      } as AssetDiagnostic);
      newCandidates.push(descriptor ? `${url} ${descriptor}` : url);
      const idx = rawSrcset.indexOf(url, searchPos);
      if (idx !== -1) searchPos = idx + url.length;
      continue;
    }

    if ((resolved as { skipped: boolean }).skipped) {
      newCandidates.push(descriptor ? `${url} ${descriptor}` : url);
      const idx = rawSrcset.indexOf(url, searchPos);
      if (idx !== -1) searchPos = idx + url.length;
      continue;
    }
    const res = resolved as { asset?: unknown; resolvedPath?: string; skipped: boolean };
    if (!res.asset) {
      ctx.diagnostics.push({
        code: 'UNRESOLVED_REFERENCE',
        message: `Unresolved asset reference "${url}" (resolved to "${res.resolvedPath ?? ''}")`,
        originalUrl: url,
        filePath: res.resolvedPath ?? ctx.documentPath,
        severity: 'warn',
      } as AssetDiagnostic);
      newCandidates.push(descriptor ? `${url} ${descriptor}` : url);
      const idx = rawSrcset.indexOf(url, searchPos);
      if (idx !== -1) searchPos = idx + url.length;
      continue;
    }
    const asset = res.asset as import('./types.ts').EncodedAsset;
    if (asset.kind !== 'image') {
      ctx.diagnostics.push({
        code: 'UNSUPPORTED_KIND',
        message: `Asset "${url}" resolved to kind "${asset.kind}" but srcset only supports "image" (audio/video deferred per ASSET-08)`,
        originalUrl: url,
        filePath: res.resolvedPath ?? ctx.documentPath,
        severity: 'warn',
      } as AssetDiagnostic);
      newCandidates.push(descriptor ? `${url} ${descriptor}` : url);
      const idx = rawSrcset.indexOf(url, searchPos);
      if (idx !== -1) searchPos = idx + url.length;
      continue;
    }

    const resolvedPath = res.resolvedPath ?? asset.sourcePath ?? asset.filename ?? url;
    // Shared structural boundary: same contract as resolver returns. A
    // delimiter-bearing dataUrl (quotes, spaces, parens, extra commas) could
    // otherwise add srcset candidates — fail closed before limits/mutation.
    try {
      assertSafeDataUrl(asset.dataUrl);
    } catch (err) {
      throw new InvalidOptionsError(
        `Invalid resolver asset dataUrl for "${url}" — must match "data:<type>/<subtype>;base64,<base64>" with a safe media type and strict Base64 payload`,
        { cause: err },
      );
    }
    // Selective inlining policy — distinct from hard resource limits.
    if (typeof ctx.maxInlineBytes === 'number' && asset.byteLength > ctx.maxInlineBytes) {
      ctx.diagnostics.push({
        code: 'INLINE_SKIPPED',
        message: `Asset "${url}" (${asset.byteLength} bytes) exceeds maxInlineBytes ${ctx.maxInlineBytes} — left as external reference`,
        originalUrl: url,
        filePath: resolvedPath,
        severity: 'warn',
      } as AssetDiagnostic);
      newCandidates.push(descriptor ? `${url} ${descriptor}` : url);
      const idx = rawSrcset.indexOf(url, searchPos);
      if (idx !== -1) searchPos = idx + url.length;
      continue;
    }
    if (ctx.shouldInline !== undefined) {
      let decision: unknown;
      try {
        decision = ctx.shouldInline(asset, url);
      } catch (err) {
        throw new InvalidOptionsError(
          `shouldInline predicate threw: ${err instanceof Error ? err.message : String(err)}`,
          { cause: err },
        );
      }
      if (
        decision !== null &&
        typeof decision === 'object' &&
        typeof (decision as { then?: unknown }).then === 'function'
      ) {
        throw new InvalidOptionsError('shouldInline must be synchronous — returned a thenable');
      }
      if (!decision) {
        ctx.diagnostics.push({
          code: 'INLINE_SKIPPED',
          message: `Asset "${url}" skipped by shouldInline predicate — left as external reference`,
          originalUrl: url,
          filePath: resolvedPath,
          severity: 'warn',
        } as AssetDiagnostic);
        newCandidates.push(descriptor ? `${url} ${descriptor}` : url);
        const idx = rawSrcset.indexOf(url, searchPos);
        if (idx !== -1) searchPos = idx + url.length;
        continue;
      }
    }
    const nextCount = addSafe(ctx.replacements.length, 1, ctx.maxReplacements, ctx.documentPath);
    if (nextCount > ctx.maxReplacements) {
      throw new ResourceLimitError(`Replacement count ${nextCount} exceeds maxReplacements ${ctx.maxReplacements}`, {
        limit: ctx.maxReplacements,
        actual: nextCount,
        path: ctx.documentPath,
      });
    }
    const dataUrlBytes = byteLengthUtf8(asset.dataUrl);
    const origBytes = byteLengthUtf8(url);
    if (!Number.isSafeInteger(dataUrlBytes) || !Number.isSafeInteger(origBytes)) {
      throw new ResourceLimitError(`Unsafe integer byte length for replacement`, {
        limit: ctx.maxOutputBytes,
        actual: dataUrlBytes,
        path: ctx.documentPath,
      });
    }
    const delta = subSafe(dataUrlBytes, origBytes, ctx.documentPath);
    const nextProjected = addSafe(ctx.projectedBytes.value, delta, ctx.maxOutputBytes, ctx.documentPath);
    if (nextProjected > ctx.maxOutputBytes) {
      throw new ResourceLimitError(
        `Projected output bytes ${nextProjected} exceeds maxOutputBytes ${ctx.maxOutputBytes}`,
        {
          limit: ctx.maxOutputBytes,
          actual: nextProjected,
          path: ctx.documentPath,
        },
      );
    }
    ctx.projectedBytes.value = nextProjected;

    // Location: URL token offset inside original content, not attribute start
    let locOffset: number;
    if (valueRange) {
      const idxInRaw = rawSrcset.indexOf(url, searchPos);
      if (idxInRaw !== -1) {
        locOffset = valueRange.valueStart + idxInRaw;
        searchPos = idxInRaw + url.length;
      } else {
        const off = ctx.content.indexOf(url);
        locOffset = off === -1 ? -1 : off;
        searchPos += url.length;
      }
    } else {
      const off = ctx.content.indexOf(url);
      locOffset = off === -1 ? -1 : off;
      searchPos += url.length;
    }
    const lc = locOffset !== -1 ? offsetToLineCol(ctx.content, locOffset) : { line: undefined, column: undefined };
    const loc =
      locOffset !== -1
        ? { offset: locOffset, line: (lc as { line: number }).line, column: (lc as { column: number }).column }
        : { offset: -1 };

    ctx.replacements.push(
      Object.freeze({
        originalUrl: url,
        resolvedPath,
        mediaType: asset.mediaType,
        kind: asset.kind,
        byteLength: asset.byteLength,
        location: { offset: loc.offset, line: loc.line, column: loc.column },
      }) as AssetReplacement,
    );
    newCandidates.push(descriptor ? `${asset.dataUrl} ${descriptor}` : asset.dataUrl);
    anyChanged = true;
    // For non-replaced candidates we already advanced searchPos; for replaced we did too
    if (valueRange) {
      // searchPos already updated
    }
  }

  if (!anyChanged) return;
  const rawNewSrcset = newCandidates.join(', ');
  // Unquoted srcset values gain double quotes in the source patch so Base64
  // padding and the data-URL comma stay inside one token when reparsed (+2
  // bytes of escaping expansion counted toward output limits). The fallback
  // serialize path keeps the raw value — parse5 quotes on serialize.
  let patchSrcset = rawNewSrcset;
  if (valueRange && !isQuotedAttrValue(ctx.content, valueRange)) {
    const quoted = `"${rawNewSrcset}"`;
    const extra = byteLengthUtf8(quoted) - byteLengthUtf8(rawNewSrcset);
    const nextProjected = addSafe(ctx.projectedBytes.value, extra, ctx.maxOutputBytes, ctx.documentPath);
    if (nextProjected > ctx.maxOutputBytes) {
      throw new ResourceLimitError(
        `Projected output bytes ${nextProjected} exceeds maxOutputBytes ${ctx.maxOutputBytes}`,
        {
          limit: ctx.maxOutputBytes,
          actual: nextProjected,
          path: ctx.documentPath,
        },
      );
    }
    ctx.projectedBytes.value = nextProjected;
    patchSrcset = quoted;
  }
  if (valueRange) {
    ctx.patches.push({ start: valueRange.valueStart, end: valueRange.valueEnd, newValue: patchSrcset });
    if (
      valueRange.valueStart < 0 ||
      valueRange.valueEnd > ctx.content.length ||
      valueRange.valueStart >= valueRange.valueEnd
    ) {
      ctx.patchValid.value = false;
    }
  } else {
    ctx.patchValid.value = false;
  }
  attr.value = rawNewSrcset;
  ctx.modified.value = true;
}

// ---------------------------------------------------------------------------
// Embedded CSS (opt-in via `inlineEmbeddedCss`) — reuses inlineCss semantics
// and maps diagnostics/locations back to HTML source offsets.
// ---------------------------------------------------------------------------

type InlineCtx = {
  catalog: InlineOptions['catalog'];
  documentPath?: string;
  rootDir?: string;
  allowBasenameMatch?: boolean;
  resolver?: InlineOptions['resolver'];
  replacements: AssetReplacement[];
  diagnostics: AssetDiagnostic[];
  modified: { value: boolean };
  content: string;
  maxReplacements: number;
  maxOutputBytes: number;
  projectedBytes: { value: number };
  patches: Patch[];
  patchValid: { value: boolean };
  maxInlineBytes?: number;
  shouldInline?: (asset: import('./types.ts').EncodedAsset, url: string) => boolean;
  inlineEmbeddedCss?: boolean;
};

/**
 * Transform one embedded CSS chunk (a `<style>` text node or `style` attribute
 * value) covering source range [chunkStart, chunkEnd). Malformed CSS yields a
 * `PARSE_ERROR` diagnostic and leaves the chunk unchanged (never corrupts HTML).
 * Hard limits (`ResourceLimitError`) remain fail-closed and propagate.
 */
function handleEmbeddedCssChunk(
  chunkStart: number,
  chunkEnd: number,
  ctx: InlineCtx,
  applyFallback: (newChunk: string) => void,
): void {
  if (chunkStart < 0 || chunkEnd > ctx.content.length || chunkStart > chunkEnd) {
    ctx.patchValid.value = false;
    return;
  }
  const cssText = ctx.content.slice(chunkStart, chunkEnd);
  if (!/url\s*\(/i.test(cssText)) return; // fast path: nothing to inline

  let result: InlineResult;
  try {
    result = inlineCss(cssText, {
      catalog: ctx.catalog!,
      documentPath: ctx.documentPath,
      rootDir: ctx.rootDir,
      allowBasenameMatch: ctx.allowBasenameMatch,
      resolver: ctx.resolver,
      maxReplacements: ctx.maxReplacements,
      maxOutputBytes: ctx.maxOutputBytes,
      maxInlineBytes: ctx.maxInlineBytes,
      shouldInline: ctx.shouldInline,
    } as InlineOptions);
  } catch (err) {
    if (err instanceof ParseError) {
      // Documented policy: malformed embedded CSS is a diagnostic, not a throw;
      // the chunk (and surrounding HTML) is left byte-identical.
      ctx.diagnostics.push({
        code: 'PARSE_ERROR',
        message: `Malformed embedded CSS at offset ${chunkStart}: ${err.message}`,
        severity: 'error',
        filePath: ctx.documentPath,
      } as AssetDiagnostic);
      return;
    }
    throw err;
  }

  // Surface nested diagnostics (filePath already points at the HTML document).
  for (const d of result.diagnostics) ctx.diagnostics.push(d);

  if (!result.modified) return;

  // Shared replacement-count limit across the whole HTML target.
  const nextCount = addSafe(ctx.replacements.length, result.replacements.length, ctx.maxReplacements, ctx.documentPath);
  if (nextCount > ctx.maxReplacements) {
    throw new ResourceLimitError(`Replacement count ${nextCount} exceeds maxReplacements ${ctx.maxReplacements}`, {
      limit: ctx.maxReplacements,
      actual: nextCount,
      path: ctx.documentPath,
    });
  }
  // Shared projected-output limit: chunk delta applied to the HTML projection.
  const delta = subSafe(byteLengthUtf8(result.content), byteLengthUtf8(cssText), ctx.documentPath);
  const nextProjected = addSafe(ctx.projectedBytes.value, delta, ctx.maxOutputBytes, ctx.documentPath);
  if (nextProjected > ctx.maxOutputBytes) {
    throw new ResourceLimitError(
      `Projected output bytes ${nextProjected} exceeds maxOutputBytes ${ctx.maxOutputBytes}`,
      {
        limit: ctx.maxOutputBytes,
        actual: nextProjected,
        path: ctx.documentPath,
      },
    );
  }
  ctx.projectedBytes.value = nextProjected;

  // Map nested CSS replacement locations back to HTML source offsets.
  for (const rep of result.replacements) {
    const inner = rep.location && typeof rep.location.offset === 'number' ? rep.location.offset : -1;
    let location: { offset: number; line?: number; column?: number };
    if (inner >= 0) {
      const off = chunkStart + inner;
      const lc = offsetToLineCol(ctx.content, off);
      location = { offset: off, line: lc.line, column: lc.column };
    } else {
      location = { offset: -1 };
    }
    ctx.replacements.push(
      Object.freeze({
        originalUrl: rep.originalUrl,
        resolvedPath: rep.resolvedPath,
        mediaType: rep.mediaType,
        kind: rep.kind,
        byteLength: rep.byteLength,
        location,
      }) as AssetReplacement,
    );
  }

  ctx.patches.push({ start: chunkStart, end: chunkEnd, newValue: result.content });
  ctx.modified.value = true;
  applyFallback(result.content);
}

/** Inline local `url(...)` inside a `<style>` element's text children. */
function handleStyleElement(element: Parse5Element, ctx: InlineCtx): void {
  const children = (element as Parse5Element & { childNodes?: Parse5Element[] }).childNodes;
  if (!children) return;
  for (const child of children) {
    const c = child as unknown as {
      nodeName?: string;
      value?: string;
      sourceCodeLocation?: { startOffset?: number; endOffset?: number };
    };
    if (c.nodeName !== '#text' || typeof c.value !== 'string' || c.value.trim() === '') continue;
    const loc = c.sourceCodeLocation;
    if (!loc || typeof loc.startOffset !== 'number' || typeof loc.endOffset !== 'number') {
      ctx.patchValid.value = false;
      continue;
    }
    handleEmbeddedCssChunk(loc.startOffset, loc.endOffset, ctx, (newChunk) => {
      c.value = newChunk;
    });
  }
}

/**
 * Inline local `url(...)` inside a `style` attribute value (AIH-08).
 * Character references are decoded once with a decoded-to-source map, the
 * decoded CSS runs through `inlineCss`, replacements are re-encoded for the
 * HTML attribute context, and nested locations map back to original-source
 * offsets. Falls back to raw-source chunk handling when our decode disagrees
 * with the parser-provided value.
 */
function handleStyleAttr(element: Parse5Element, ctx: InlineCtx): void {
  const attr = findAttr(element, 'style');
  if (!attr || attr.value.trim() === '') return;
  const attrLoc = getAttributeLoc(element, 'style');
  if (!attrLoc) {
    ctx.patchValid.value = false;
    return;
  }
  const range = getAttrValueRange(ctx.content, attrLoc as { startOffset?: number; endOffset?: number });
  if (!range) {
    ctx.patchValid.value = false;
    return;
  }
  const raw = ctx.content.slice(range.valueStart, range.valueEnd);
  const decoded = decodeHtmlAttrValue(raw);
  if (decoded.text !== attr.value) {
    handleEmbeddedCssChunk(range.valueStart, range.valueEnd, ctx, (newChunk) => {
      attr.value = newChunk;
    });
    return;
  }
  if (!/url\s*\(/i.test(decoded.text)) return; // fast path: nothing to inline

  let result: InlineResult;
  try {
    result = inlineCss(decoded.text, {
      catalog: ctx.catalog!,
      documentPath: ctx.documentPath,
      rootDir: ctx.rootDir,
      allowBasenameMatch: ctx.allowBasenameMatch,
      resolver: ctx.resolver,
      maxReplacements: ctx.maxReplacements,
      maxOutputBytes: ctx.maxOutputBytes,
      maxInlineBytes: ctx.maxInlineBytes,
      shouldInline: ctx.shouldInline,
    } as InlineOptions);
  } catch (err) {
    if (err instanceof ParseError) {
      // Documented policy: malformed embedded CSS is a diagnostic, not a throw;
      // the chunk (and surrounding HTML) is left byte-identical.
      ctx.diagnostics.push({
        code: 'PARSE_ERROR',
        message: `Malformed embedded CSS at offset ${range.valueStart}: ${err.message}`,
        severity: 'error',
        filePath: ctx.documentPath,
      } as AssetDiagnostic);
      return;
    }
    throw err;
  }

  // Surface nested diagnostics (filePath already points at the HTML document).
  for (const d of result.diagnostics) ctx.diagnostics.push(d);

  if (!result.modified) return;

  // Shared replacement-count limit across the whole HTML target.
  const nextCount = addSafe(ctx.replacements.length, result.replacements.length, ctx.maxReplacements, ctx.documentPath);
  if (nextCount > ctx.maxReplacements) {
    throw new ResourceLimitError(`Replacement count ${nextCount} exceeds maxReplacements ${ctx.maxReplacements}`, {
      limit: ctx.maxReplacements,
      actual: nextCount,
      path: ctx.documentPath,
    });
  }
  // Re-encode for the HTML attribute context: escape `&`/`<`/`>` plus the
  // active quote so the patch reparses to the same attribute without
  // acquiring new markup. Validated data URLs contain none of these
  // characters, so actual replacements pass through byte-identical.
  const quote = activeQuoteChar(ctx.content, range);
  const escaped = escapeHtmlAttrValue(result.content, quote);
  // Shared projected-output limit, accounted against the original source
  // spelling (which may contain character references), not the decoded text.
  const delta = subSafe(byteLengthUtf8(escaped), byteLengthUtf8(raw), ctx.documentPath);
  const nextProjected = addSafe(ctx.projectedBytes.value, delta, ctx.maxOutputBytes, ctx.documentPath);
  if (nextProjected > ctx.maxOutputBytes) {
    throw new ResourceLimitError(
      `Projected output bytes ${nextProjected} exceeds maxOutputBytes ${ctx.maxOutputBytes}`,
      {
        limit: ctx.maxOutputBytes,
        actual: nextProjected,
        path: ctx.documentPath,
      },
    );
  }
  ctx.projectedBytes.value = nextProjected;

  // Map nested CSS replacement locations through the decode map back to HTML
  // source offsets so entity-encoded references report original spellings.
  for (const rep of result.replacements) {
    const inner = rep.location && typeof rep.location.offset === 'number' ? rep.location.offset : -1;
    let location: { offset: number; line?: number; column?: number };
    if (inner >= 0 && inner <= decoded.text.length) {
      const off = range.valueStart + (decoded.map[inner] as number);
      const lc = offsetToLineCol(ctx.content, off);
      location = { offset: off, line: lc.line, column: lc.column };
    } else {
      location = { offset: -1 };
    }
    ctx.replacements.push(
      Object.freeze({
        originalUrl: rep.originalUrl,
        resolvedPath: rep.resolvedPath,
        mediaType: rep.mediaType,
        kind: rep.kind,
        byteLength: rep.byteLength,
        location,
      }) as AssetReplacement,
    );
  }

  ctx.patches.push({ start: range.valueStart, end: range.valueEnd, newValue: escaped });
  ctx.modified.value = true;
  attr.value = result.content;
}

// ---------------------------------------------------------------------------
// Public API: inlineHtml
// ---------------------------------------------------------------------------

/** Inline local image references in HTML using an `AssetCatalog`. Prefers source-location patches; falls back to serialization when patches invalid. */
export function inlineHtml(content: string, options: InlineOptions): InlineResult {
  if (typeof content !== 'string') {
    throw new InvalidOptionsError('inlineHtml requires content as string');
  }
  if (!options || !options.catalog) {
    throw new InvalidOptionsError('inlineHtml requires options.catalog');
  }

  validatePolicyOptions({
    maxTargetBytes: (options as unknown as { maxTargetBytes?: unknown }).maxTargetBytes,
    maxReplacements: (options as unknown as { maxReplacements?: unknown }).maxReplacements,
    maxOutputBytes: (options as unknown as { maxOutputBytes?: unknown }).maxOutputBytes,
    maxInlineBytes: (options as unknown as { maxInlineBytes?: unknown }).maxInlineBytes,
  });
  if (
    (options as unknown as { shouldInline?: unknown }).shouldInline !== undefined &&
    typeof (options as unknown as { shouldInline: unknown }).shouldInline !== 'function'
  ) {
    throw new InvalidOptionsError('shouldInline must be a function (asset, url) => boolean');
  }
  if (
    (options as unknown as { inlineEmbeddedCss?: unknown }).inlineEmbeddedCss !== undefined &&
    typeof (options as unknown as { inlineEmbeddedCss: unknown }).inlineEmbeddedCss !== 'boolean'
  ) {
    throw new InvalidOptionsError('inlineEmbeddedCss must be a boolean');
  }

  const catalog = options.catalog;
  const documentPath = options.documentPath;
  const rootDir = options.rootDir;
  const allowBasenameMatch = options.allowBasenameMatch ?? false;
  const resolver = options.resolver;
  const maxTargetBytes = (options as unknown as { maxTargetBytes?: number }).maxTargetBytes ?? DEFAULT_MAX_TARGET_BYTES;
  const maxReplacements =
    (options as unknown as { maxReplacements?: number }).maxReplacements ?? DEFAULT_MAX_REPLACEMENTS;
  const maxOutputBytes = (options as unknown as { maxOutputBytes?: number }).maxOutputBytes ?? DEFAULT_MAX_OUTPUT_BYTES;
  const maxInlineBytes = (options as unknown as { maxInlineBytes?: number }).maxInlineBytes;
  const shouldInline = (
    options as unknown as { shouldInline?: (asset: import('./types.ts').EncodedAsset, url: string) => boolean }
  ).shouldInline;
  const inlineEmbeddedCss = (options as unknown as { inlineEmbeddedCss?: boolean }).inlineEmbeddedCss ?? false;

  const targetBytes = byteLengthUtf8(content);
  if (!Number.isSafeInteger(targetBytes)) {
    throw new ResourceLimitError(`Target byte length ${targetBytes} exceeds safe integer range`, {
      limit: maxTargetBytes,
      actual: targetBytes,
      path: documentPath,
    });
  }
  if (targetBytes > maxTargetBytes) {
    throw new ResourceLimitError(`Target input bytes ${targetBytes} exceeds maxTargetBytes ${maxTargetBytes}`, {
      limit: maxTargetBytes,
      actual: targetBytes,
      path: documentPath,
    });
  }

  const replacements: AssetReplacement[] = [];
  const diagnostics: AssetDiagnostic[] = [];
  const modified = { value: false };
  const projectedBytes = { value: targetBytes };
  const patches: Patch[] = [];
  const patchValid = { value: true };

  const isDoc = isDocumentHtml(content);

  let tree: Parse5Element;
  try {
    if (isDoc) {
      tree = parse5.parse(content, { sourceCodeLocationInfo: true } as unknown as Record<
        string,
        unknown
      >) as unknown as Parse5Element;
    } else {
      tree = parse5.parseFragment(content, { sourceCodeLocationInfo: true } as unknown as Record<
        string,
        unknown
      >) as unknown as Parse5Element;
    }
  } catch {
    // parse5 never throws on malformed per spec, but defensive: return unchanged with diagnostic
    diagnostics.push({
      code: 'PARSE_ERROR',
      message: 'Failed to parse HTML',
      severity: 'error',
      filePath: documentPath,
    } as AssetDiagnostic);
    return Object.freeze({
      content,
      modified: false,
      replacements: Object.freeze([]) as readonly AssetReplacement[],
      diagnostics: Object.freeze([...diagnostics]) as readonly AssetDiagnostic[],
    }) as InlineResult;
  }

  walkAndInline(tree, {
    catalog,
    documentPath,
    rootDir,
    allowBasenameMatch,
    resolver,
    replacements,
    diagnostics,
    modified,
    content,
    maxReplacements,
    maxOutputBytes,
    projectedBytes,
    patches,
    patchValid,
    maxInlineBytes,
    shouldInline,
    inlineEmbeddedCss,
  });

  if (!modified.value) {
    return Object.freeze({
      content,
      modified: false,
      replacements: Object.freeze([]) as readonly AssetReplacement[],
      diagnostics: Object.freeze([...diagnostics]) as readonly AssetDiagnostic[],
    }) as InlineResult;
  }

  // Attempt source-location patching so unrelated markup remains byte-identical.
  let newContent: string | null = null;
  if (patchValid.value && patches.length > 0) {
    const sorted = [...patches].sort((a, b) => a.start - b.start);
    let valid = true;
    for (let i = 0; i < sorted.length; i++) {
      const p = sorted[i] as Patch;
      if (
        typeof p.start !== 'number' ||
        typeof p.end !== 'number' ||
        p.start < 0 ||
        p.end > content.length ||
        p.start >= p.end ||
        !Number.isSafeInteger(p.start) ||
        !Number.isSafeInteger(p.end)
      ) {
        valid = false;
        break;
      }
      if (!Number.isSafeInteger(Buffer.byteLength(p.newValue, 'utf8'))) {
        valid = false;
        break;
      }
      if (i > 0) {
        const prev = sorted[i - 1] as Patch;
        if (prev.end > p.start) {
          valid = false;
          break;
        }
      }
    }
    if (valid) {
      const desc = [...patches].sort((a, b) => b.start - a.start);
      let patched = content;
      for (const p of desc) {
        patched = patched.slice(0, p.start) + p.newValue + patched.slice(p.end);
      }
      newContent = patched;
    }
  }

  if (newContent === null) {
    newContent = isDoc ? parse5.serialize(tree as unknown as never) : parse5.serialize(tree as unknown as never);
  }

  const finalBytes = byteLengthUtf8(newContent);
  if (!Number.isSafeInteger(finalBytes)) {
    throw new ResourceLimitError(`Final output exceeds safe integer range`, {
      limit: maxOutputBytes,
      actual: finalBytes,
      path: documentPath,
    });
  }
  if (finalBytes > maxOutputBytes) {
    throw new ResourceLimitError(`Transformed output bytes ${finalBytes} exceeds maxOutputBytes ${maxOutputBytes}`, {
      limit: maxOutputBytes,
      actual: finalBytes,
      path: documentPath,
    });
  }

  const withOffsets = replacements;

  return Object.freeze({
    content: newContent,
    modified: true,
    replacements: Object.freeze([...withOffsets]) as readonly AssetReplacement[],
    diagnostics: Object.freeze([...diagnostics]) as readonly AssetDiagnostic[],
  }) as InlineResult;
}
