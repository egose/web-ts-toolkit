/**
 * HTML inliner — pure synchronous transform over an `AssetCatalog`.
 * Inlines `img[src]`, `srcset`, `source`, icon `link[href]`, `video[poster]` for `kind === 'image'`.
 * Uses source-location patches so unrelated markup stays byte-identical; fallback serializes when patches invalid.
 */

import * as parse5 from 'parse5';
import type { InlineOptions, InlineResult, AssetReplacement, AssetDiagnostic } from './types.ts';
import { InvalidOptionsError, ParseError, ResourceLimitError } from './errors.ts';
import { inlineCss } from './css.ts';
import { classifyUrl, resolveAssetReferenceSync, htmlResolutionContext } from './resolve.ts';
import type { HtmlResolutionContext } from './resolve.ts';
import { findHtmlBase, mapHtmlBase } from './html-base.ts';
import { assertSafeDataUrl } from './format.ts';
import { tokenizeSrcset } from './srcset.ts';
import { assembleSourcePatches, type SourcePatch as Patch } from './source-patches.ts';
import { assertCssSyntaxDepth, assertHtmlSyntaxDepth, boundedHtmlTreeAdapter } from './syntax-depth.ts';
import {
  validatePolicyOptions,
  DEFAULT_MAX_TARGET_BYTES,
  DEFAULT_MAX_REPLACEMENTS,
  DEFAULT_MAX_OUTPUT_BYTES,
  DEFAULT_MAX_SYNTAX_DEPTH,
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
 * Srcset-only fallback for the narrow decoder: let the existing HTML parser
 * decode each character reference in attribute context (including its full
 * named table), retaining original offsets. Literal CR/CRLF normalize before
 * reference decoding; numeric CR remains CR. Cache only within this attribute.
 */
function decodeSrcsetAttrFallback(raw: string): { text: string; map: number[] } {
  let text = '';
  const map: number[] = [];
  const cache = new Map<string, string>();
  const reference = /&(?:#[xX][0-9a-fA-F]+;?|#[0-9]+;?|[A-Za-z0-9]+;?)/y;
  for (let i = 0; i < raw.length; ) {
    reference.lastIndex = i;
    const match = raw[i] === '&' ? reference.exec(raw) : null;
    if (match) {
      const spelling = match[0];
      // '=' after a semicolonless named reference suppresses decoding in an
      // attribute. Include that lookahead without consuming it in our map.
      const lookahead = raw[i + spelling.length] === '=' ? '=' : '';
      const key = spelling + lookahead;
      let value = cache.get(key);
      if (value === undefined) {
        // The matched alphabet contains no markup/quote delimiters.
        const tree = parse5.parseFragment(`<i a="${key}">`);
        value = (tree.childNodes[0] as parse5.DefaultTreeAdapterMap['element']).attrs[0]!.value;
        if (lookahead) value = value.slice(0, -1);
        cache.set(key, value);
      }
      for (let k = 0; k < value.length; k++) map.push(i + (value === spelling ? k : 0));
      text += value;
      i += spelling.length;
    } else {
      const ch = raw[i]!;
      map.push(i);
      text += ch === '\r' ? '\n' : ch === '\0' ? '�' : ch;
      i += ch === '\r' && raw[i + 1] === '\n' ? 2 : 1;
    }
  }
  map.push(raw.length);
  return { text, map };
}

/**
 * Re-encode transformed CSS text for an HTML attribute-value patch. Escapes
 * `&`/`<`/`>` plus the active quote character so the patched value reparses
 * to the same attribute without acquiring new markup or breaking out of the
 * attribute. Validated data URLs contain none of these characters, so actual
 * replacements pass through byte-identical. Raw-source decoder fallback keeps
 * existing references; decoded CSS escapes ampersands to avoid a second decode.
 */
function escapeHtmlAttrValue(text: string, activeQuote: string, preserveEntities = false): string {
  let out = '';
  for (const ch of text) {
    if (ch === '&' && !preserveEntities) out += '&amp;';
    else if (ch === '<') out += '&lt;';
    else if (ch === '>') out += '&gt;';
    else if (ch === activeQuote) out += activeQuote === '"' ? '&quot;' : '&#39;';
    else if (ch === '\r' && !preserveEntities) out += '&#13;';
    else out += ch;
  }
  return out;
}

/** Serialize the whole style value, adding a quoted context for unquoted input. */
function serializeStyleAttrValue(text: string, quote: string | null, preserveEntities = false): string {
  const escaped = escapeHtmlAttrValue(text, quote ?? '"', preserveEntities);
  return quote === null ? `"${escaped}"` : escaped;
}

/** Active quote character for an attribute value range (`null` if unquoted). */
function activeQuoteChar(content: string, range: { valueStart: number; valueEnd: number }): string | null {
  if (range.valueStart <= 0 || range.valueStart > content.length) return null;
  const q = content[range.valueStart - 1] as string;
  return q === '"' || q === "'" ? q : null;
}

// ---------------------------------------------------------------------------
// Traversal
// ---------------------------------------------------------------------------

function walkAndInline(
  node: Parse5Element,
  ctx: {
    catalog: InlineOptions['catalog'];
    htmlBase?: HtmlResolutionContext;
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
    maxSyntaxDepth: number;
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
    htmlBase?: HtmlResolutionContext;
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
      [htmlResolutionContext]: ctx.htmlBase,
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
  attr: Parse5Attr,
  valueRange: { valueStart: number; valueEnd: number } | null,
  rawSrcset: string,
  decoded: string,
  map: number[],
  ctx: {
    catalog: InlineOptions['catalog'];
    htmlBase?: HtmlResolutionContext;
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
  const candidates = tokenizeSrcset(decoded);
  if (candidates.length === 0) return;

  let anyChanged = false;
  const spanPatches: Array<{ relStart: number; relEnd: number; urlStart: number; urlEnd: number; newValue: string }> =
    [];

  for (const candidate of candidates) {
    const { url, urlStart, urlEnd } = candidate;
    // Map the decoded URL token to its original-source span. The sentinel
    // `map[decoded.length]` keeps end-exclusive spans sound at the tail.
    if (urlStart < 0 || urlEnd > decoded.length || urlStart >= urlEnd) {
      continue;
    }
    const relStart = map[urlStart] as number;
    const relEnd = map[urlEnd] as number;
    if (relStart < 0 || relEnd > rawSrcset.length || relStart >= relEnd) {
      continue;
    }
    const cls = classifyUrl(url);
    if (cls.kind === 'skip') {
      continue;
    }

    let resolved: ReturnType<typeof resolveAssetReferenceSync>;
    try {
      resolved = resolveAssetReferenceSync(url, ctx.catalog!, {
        [htmlResolutionContext]: ctx.htmlBase,
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
      continue;
    }

    if ((resolved as { skipped: boolean }).skipped) {
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
    const locOffset = valueRange ? valueRange.valueStart + relStart : -1;
    const lc = locOffset >= 0 ? offsetToLineCol(ctx.content, locOffset) : { line: undefined, column: undefined };
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
    spanPatches.push({ relStart, relEnd, urlStart, urlEnd, newValue: asset.dataUrl });
    anyChanged = true;
  }

  if (!anyChanged) return;
  // Splice replacements into the raw slice so separators, descriptors, and
  // unrelated entities remain byte-identical.
  const patched = assembleSourcePatches(
    rawSrcset,
    spanPatches.map((p) => ({
      start: p.relStart,
      end: p.relEnd,
      newValue: p.newValue,
    })),
  );
  const patchedDecoded = assembleSourcePatches(
    decoded,
    spanPatches.map((p) => ({
      start: p.urlStart,
      end: p.urlEnd,
      newValue: p.newValue,
    })),
  );
  // Decoded spans come directly from the tokenizer's disjoint URL tokens.
  if (patchedDecoded === null) throw new Error('Invalid decoded srcset patch spans');
  attr.value = patchedDecoded;
  ctx.modified.value = true;
  if (patched === null) {
    ctx.patchValid.value = false;
    return;
  }
  // Unquoted srcset values gain double quotes in the source patch so Base64
  // padding stays inside one attribute when reparsed. Quotes and any escaping
  // expansion count toward output limits. The full-tree fallback uses the
  // patched decoded value, including untouched/invalid candidates.
  let patchSrcset = patched;
  if (valueRange && !isQuotedAttrValue(ctx.content, valueRange)) {
    const quoted = `"${escapeHtmlAttrValue(patched, '"', true)}"`;
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
  if (valueRange) {
    ctx.patches.push({ start: valueRange.valueStart, end: valueRange.valueEnd, newValue: patchSrcset });
  } else {
    ctx.patchValid.value = false;
  }
}

function handleSrcsetAttr(
  element: Parse5Element,
  attrNameLower: string,
  ctx: {
    catalog: InlineOptions['catalog'];
    htmlBase?: HtmlResolutionContext;
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

  // Always tokenize in the parser's decoded space. Raw-source tokenization
  // can invent URL boundaries when an entity encodes whitespace or a comma.
  if (valueRange) {
    let decoded = decodeHtmlAttrValue(rawSrcset);
    if (decoded.text !== attr.value) decoded = decodeSrcsetAttrFallback(rawSrcset);
    // If source mapping cannot be verified, preserve this attribute rather
    // than guessing a URL span. No resolver sees a raw entity spelling.
    if (decoded.text !== attr.value) return;
    handleSrcsetDecoded(attr, valueRange, rawSrcset, decoded.text, decoded.map, ctx);
  } else {
    const map = Array.from({ length: attr.value.length + 1 }, (_, i) => i);
    handleSrcsetDecoded(attr, null, attr.value, attr.value, map, ctx);
  }
}

// ---------------------------------------------------------------------------
// Embedded CSS (opt-in via `inlineEmbeddedCss`) — reuses inlineCss semantics
// and maps diagnostics/locations back to HTML source offsets.
// ---------------------------------------------------------------------------

type InlineCtx = {
  catalog: InlineOptions['catalog'];
  htmlBase?: HtmlResolutionContext;
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
  maxSyntaxDepth: number;
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
  serializeChunk: (newChunk: string) => string = (newChunk) => newChunk,
): void {
  if (chunkStart < 0 || chunkEnd > ctx.content.length || chunkStart > chunkEnd) {
    ctx.patchValid.value = false;
    return;
  }
  const cssText = ctx.content.slice(chunkStart, chunkEnd);
  assertCssSyntaxDepth(cssText, ctx.maxSyntaxDepth, ctx.documentPath);
  if (!/url\s*\(/i.test(cssText)) return; // fast path: nothing to inline

  let result: InlineResult;
  try {
    result = inlineCss(cssText, {
      [htmlResolutionContext]: ctx.htmlBase,
      catalog: ctx.catalog!,
      documentPath: ctx.documentPath,
      rootDir: ctx.rootDir,
      allowBasenameMatch: ctx.allowBasenameMatch,
      resolver: ctx.resolver,
      maxReplacements: ctx.maxReplacements,
      maxOutputBytes: ctx.maxOutputBytes,
      maxSyntaxDepth: ctx.maxSyntaxDepth,
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
  const serialized = serializeChunk(result.content);
  const delta = subSafe(byteLengthUtf8(serialized), byteLengthUtf8(cssText), ctx.documentPath);
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

  ctx.patches.push({ start: chunkStart, end: chunkEnd, newValue: serialized });
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
    const quote = activeQuoteChar(ctx.content, range);
    handleEmbeddedCssChunk(
      range.valueStart,
      range.valueEnd,
      ctx,
      (newChunk) => {
        // Raw-source CSS still contains HTML references. Decode exactly once
        // with parse5 for the tree serializer, rather than double-encoding them.
        // The wrapper escapes literal delimiters while retaining those references.
        const wrapped = serializeStyleAttrValue(newChunk, null, true);
        const fragment = parse5.parseFragment(`<div style=${wrapped}></div>`);
        attr.value = (fragment.childNodes[0] as parse5.DefaultTreeAdapterMap['element']).attrs[0]!.value;
      },
      (newChunk) => serializeStyleAttrValue(newChunk, quote, true),
    );
    return;
  }
  if (!/url\s*\(/i.test(decoded.text)) return; // fast path: nothing to inline

  let result: InlineResult;
  try {
    result = inlineCss(decoded.text, {
      [htmlResolutionContext]: ctx.htmlBase,
      catalog: ctx.catalog!,
      documentPath: ctx.documentPath,
      rootDir: ctx.rootDir,
      allowBasenameMatch: ctx.allowBasenameMatch,
      resolver: ctx.resolver,
      maxReplacements: ctx.maxReplacements,
      maxOutputBytes: ctx.maxOutputBytes,
      maxSyntaxDepth: ctx.maxSyntaxDepth,
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
  // Serialize the whole value in a quoted context, including newly added
  // quotes in the projection. Decoded whitespace must not split an attribute.
  const quote = activeQuoteChar(ctx.content, range);
  const escaped = serializeStyleAttrValue(result.content, quote);
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

/**
 * Inline local image references in HTML using an `AssetCatalog`.
 * The first HTML `<base href>` in parsed tree order applies to all references,
 * including opt-in embedded CSS and references before the base. Template bases
 * are inert; missing href is ignored; empty href selects document fallback.
 * Relative/root-relative bases map locally; remote or unmappable bases preserve
 * references with `HTML_BASE_UNMAPPABLE` diagnostics before resolver hooks.
 * `documentPath` stays the real file; hooks receive `resolutionBaseDir` separately.
 * No fetching or base rewriting; root-relative assets still use `rootDir`/cwd
 * under local bases. See `InlineOptions` for decoding and fallback limitations.
 * `img`/`source` srcset URLs are complete ASCII-whitespace-delimited tokens:
 * interior commas belong to every URL scheme; trailing commas delimit candidates.
 * Invalid descriptors are left untouched without resolver calls. Valid descriptors
 * and source spelling outside replaced URLs are preserved by source patches;
 * entity-decoded URLs report original-source offsets (or -1 without source data).
 * Prefers source-location patches; falls back to serialization when patches are invalid.
 * With `inlineEmbeddedCss`, rewritten style attributes retain their boundaries:
 * unquoted values gain double quotes and CSS is escaped for the output context,
 * including the raw-source decoder fallback. Added quotes/escaping count toward
 * `maxOutputBytes`. Style-element content retains HTML raw-text semantics.
 * `maxSyntaxDepth` (default 256, maximum 512) bounds parsed element nesting,
 * including implied elements and template content, before recursive traversal
 * and serialization. Opt-in embedded CSS is checked separately per chunk even
 * without URLs. Excess throws `ResourceLimitError`; see `InlineOptions`.
 * HTML-spec recovery accepts malformed markup, but does not bypass resource
 * limits. Invalid options/resolver results can also throw `InvalidOptionsError`.
 */
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
    maxSyntaxDepth: options.maxSyntaxDepth,
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
  const maxSyntaxDepth = options.maxSyntaxDepth ?? DEFAULT_MAX_SYNTAX_DEPTH;

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
    const parseOptions = {
      sourceCodeLocationInfo: true,
      treeAdapter: boundedHtmlTreeAdapter(maxSyntaxDepth, isDoc, documentPath),
    };
    if (isDoc) {
      tree = parse5.parse(content, parseOptions) as unknown as Parse5Element;
    } else {
      tree = parse5.parseFragment(content, parseOptions) as unknown as Parse5Element;
    }
  } catch (err) {
    if (err instanceof ResourceLimitError) throw err;
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

  assertHtmlSyntaxDepth(tree, maxSyntaxDepth, inlineEmbeddedCss, documentPath);
  const baseHref = findHtmlBase(tree);
  const htmlBase = baseHref === undefined ? undefined : { ...mapHtmlBase(baseHref, options), diagnostics };
  walkAndInline(tree, {
    htmlBase,
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
    maxSyntaxDepth,
  });

  // A mapped base changes lookup, never the containing document's identity.
  // Keep attempted asset paths in diagnostic messages/replacement resolvedPath.
  if (htmlBase) {
    for (let i = 0; i < diagnostics.length; i++) {
      diagnostics[i] = { ...diagnostics[i]!, filePath: documentPath };
    }
  }

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
    newContent = assembleSourcePatches(content, patches);
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
