/**
 * CSS inliner — pure synchronous transform over an `AssetCatalog`.
 * Replaces local `url(...)` with data URLs; preserves remote/data URLs.
 * Throws `ParseError` for unparseable CSS; per-URL issues become diagnostics.
 */

import postcss from 'postcss';
import * as valueParserModule from 'postcss-value-parser';
import type { InlineOptions, InlineResult, AssetReplacement, AssetDiagnostic } from './types.ts';
import { InvalidOptionsError, ParseError, ResourceLimitError } from './errors.ts';
import { classifyUrl, resolveAssetReferenceSync } from './resolve.ts';
import {
  validatePolicyOptions,
  DEFAULT_MAX_TARGET_BYTES,
  DEFAULT_MAX_REPLACEMENTS,
  DEFAULT_MAX_OUTPUT_BYTES,
} from './policy.ts';

// ---------------------------------------------------------------------------
// ESM interop for CJS postcss-value-parser
// ---------------------------------------------------------------------------
// `postcss-value-parser` is CJS (`module.exports = function`). Under Node ESM
// `import valueParser from 'postcss-value-parser'` yields a namespace with a
// `default` property in many interop modes, whereas `import * as vp` may be the
// function directly. We normalize to a callable `parseValue`.
const parseValue: typeof import('postcss-value-parser') = ((
  valueParserModule as unknown as { default?: typeof import('postcss-value-parser') }
).default ??
  (valueParserModule as unknown as typeof import('postcss-value-parser'))) as typeof import('postcss-value-parser');

// Validate that we got a function (defensive; will throw early with clear message if interop fails)
if (typeof parseValue !== 'function') {
  throw new Error('Failed to load postcss-value-parser: expected a function export');
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function isFontFaceSrcDecl(decl: postcss.Declaration): boolean {
  const parent = decl.parent as postcss.AtRule | undefined;
  return (
    !!parent &&
    (parent as unknown as { type: string }).type === 'atrule' &&
    (parent as postcss.AtRule).name.toLowerCase() === 'font-face' &&
    decl.prop.toLowerCase() === 'src'
  );
}

function hasFollowingFormat(nodes: readonly unknown[], startIndex: number): boolean {
  // Scan forward from startIndex+1 until a comma div or next url function.
  // If a `format(...)` function is encountered before those boundaries, url already has descriptor.
  for (let i = startIndex + 1; i < nodes.length; i++) {
    const n = nodes[i] as { type: string; value?: string };
    if (n.type === 'div' && n.value === ',') break;
    if (n.type === 'function' && typeof n.value === 'string' && n.value.toLowerCase() === 'url') break;
    if (n.type === 'function' && typeof n.value === 'string' && n.value.toLowerCase() === 'format') {
      return true;
    }
    // space, comment, etc. are skipped implicitly
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

/**
 * CSS-unescape a string per CSS Syntax Module Level 3.
 * Handles:
 * - Hex escapes: \[1-6 hex digits] optional single whitespace (space, tab, newline, form-feed, carriage-return) consumed; \r\n handled as one
 * - Escaped newline: \ followed by \n, \r\n, \r, \f  -> ignored (line continuation)
 * - Simple escapes: \ + any non-hex non-newline char -> that char
 * Throws InvalidOptionsError on trailing single backslash (malformed escape).
 */
function cssUnescape(input: string): string {
  let out = '';
  const len = input.length;
  let i = 0;
  while (i < len) {
    const ch = input[i] as string;
    if (ch !== '\\') {
      out += ch;
      i++;
      continue;
    }
    // ch is backslash
    if (i + 1 >= len) {
      throw new InvalidOptionsError(`Malformed CSS escape: trailing backslash in "${input}"`);
    }
    const next = input[i + 1] as string;
    // Escaped newline (line continuation)
    if (next === '\n' || next === '\r' || next === '\f') {
      if (next === '\r' && i + 2 < len && input[i + 2] === '\n') {
        i += 3;
      } else {
        i += 2;
      }
      continue;
    }
    // Hex escape
    if (/[0-9a-fA-F]/.test(next)) {
      let hex = '';
      let j = i + 1;
      while (j < len && hex.length < 6 && /[0-9a-fA-F]/.test(input[j] as string)) {
        hex += input[j] as string;
        j++;
      }
      // Optional single whitespace after hex
      if (j < len) {
        const ws = input[j] as string;
        if (ws === ' ' || ws === '\t' || ws === '\n' || ws === '\r' || ws === '\f') {
          if (ws === '\r' && j + 1 < len && input[j + 1] === '\n') {
            j += 2;
          } else {
            j += 1;
          }
        }
      }
      const codePoint = parseInt(hex, 16);
      if (codePoint === 0 || (codePoint >= 0xd800 && codePoint <= 0xdfff) || codePoint > 0x10ffff) {
        throw new InvalidOptionsError(`Malformed CSS hex escape \\${hex} produces invalid codepoint ${codePoint}`);
      } else {
        out += String.fromCodePoint(codePoint);
      }
      i = j;
      continue;
    }
    // Simple escape: backslash + any other char
    out += next;
    i += 2;
  }
  return out;
}

// ---------------------------------------------------------------------------
// Public API: inlineCss
// ---------------------------------------------------------------------------

/** Inline local `url(...)` in CSS using an `AssetCatalog`. Returns original content when unchanged. */
export function inlineCss(content: string, options: InlineOptions): InlineResult {
  if (typeof content !== 'string') {
    throw new InvalidOptionsError('inlineCss requires content as string');
  }
  if (!options || !options.catalog) {
    throw new InvalidOptionsError('inlineCss requires options.catalog');
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

  let root: postcss.Root;
  try {
    root = postcss.parse(content);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    throw new ParseError(`Failed to parse CSS: ${msg}`, { cause: err });
  }

  const replacements: AssetReplacement[] = [];
  const diagnostics: AssetDiagnostic[] = [];
  let modified = false;
  let projectedBytes = targetBytes;

  // Walk every declaration (including custom properties)
  root.walkDecls((decl) => {
    const rawValue = decl.value;
    const rawForParse = ((decl.raws as unknown as { value?: { raw?: string } }).value?.raw ?? rawValue) as string;
    if (!rawForParse) return;
    // Fast-path: case-insensitive check for "url(" to avoid parsing values that cannot contain urls
    if (!/url\s*\(/i.test(rawForParse)) return;

    let parsed: ReturnType<typeof parseValue>;
    try {
      parsed = parseValue(rawForParse);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      diagnostics.push({
        code: 'PARSE_ERROR',
        message: `Failed to parse declaration value for "${decl.prop}": ${msg}`,
        originalUrl: undefined,
        severity: 'error',
      } as AssetDiagnostic);
      return;
    }

    const isFontFaceSrc = isFontFaceSrcDecl(decl);

    // Derive value start offset in original content for location mapping (decl-local, not global indexOf)
    let valueStartOffset = -1;
    const startOff = (decl.source?.start?.offset ?? -1) as number;
    if (typeof startOff === 'number' && startOff >= 0 && decl.source?.input?.css === content) {
      const propRaw = ((decl.raws as unknown as { prop?: { raw?: string } }).prop?.raw ?? decl.prop) as string;
      const between = ((decl.raws as unknown as { between?: string }).between ?? ': ') as string;
      valueStartOffset = startOff + propRaw.length + between.length;
      // Guard: valueStartOffset should point inside content at rawForParse start; if mismatch fallback to search
      if (valueStartOffset < 0 || valueStartOffset + rawForParse.length > content.length) {
        valueStartOffset = -1;
      } else {
        // Verify slice matches rawForParse (which includes comments); if not, fallback
        const slice = content.slice(valueStartOffset, valueStartOffset + rawForParse.length);
        if (slice !== rawForParse) {
          // Fallback: search rawForParse sequentially from decl start
          const idx = content.indexOf(rawForParse, startOff);
          if (idx !== -1) valueStartOffset = idx;
          else valueStartOffset = -1;
        }
      }
    }

    // Collect url entries via walk (captures nested functions like image-set)
    type Entry = {
      node: unknown;
      index: number;
      nodes: unknown[];
      originalUrl: string;
      contentStartLocal: number;
      globalOffset: number;
    };
    const entries: Entry[] = [];

    // valueParser walk visits nested nodes; we capture parent nodes array for each url
    (parsed as unknown as { walk: (cb: (node: unknown, idx: number, nodes: unknown[]) => void) => void }).walk(
      (node: unknown, index: number, nodes: unknown[]) => {
        const n = node as { type: string; value: string; nodes?: unknown[] };
        if (n.type !== 'function' || n.value.toLowerCase() !== 'url') return;

        // Extract inner URL string and its local offset inside decl.value
        let originalUrl!: string;
        // eslint-disable-next-line no-useless-assignment
        let contentStartLocal = -1;
        const inner = n.nodes as unknown[] | undefined;
        if (!inner || inner.length === 0) {
          // empty url() — treat as empty reference, skip
          return;
        }
        const first = inner[0] as { type: string; value: string; sourceIndex?: number };
        if (first.type === 'string') {
          originalUrl = first.value;
          const si = typeof first.sourceIndex === 'number' ? first.sourceIndex : -1;
          contentStartLocal = si >= 0 ? si + 1 : -1;
        } else if (first.type === 'word') {
          originalUrl = first.value;
          const si = typeof first.sourceIndex === 'number' ? first.sourceIndex : -1;
          contentStartLocal = si >= 0 ? si : -1;
        } else if (first.type === 'function') {
          // unusual nested; stringify
          originalUrl = parseValue.stringify(first as unknown as import('postcss-value-parser').Node);
          const si =
            typeof (first as unknown as { sourceIndex?: number }).sourceIndex === 'number'
              ? (first as unknown as { sourceIndex: number }).sourceIndex
              : -1;
          contentStartLocal =
            si >= 0
              ? si
              : typeof (n as unknown as { sourceIndex?: number }).sourceIndex === 'number'
                ? (n as unknown as { sourceIndex: number }).sourceIndex
                : -1;
        } else {
          // fallback: stringify inner
          originalUrl = (inner as unknown[])
            .map((x) => parseValue.stringify(x as import('postcss-value-parser').Node))
            .join('');
          const si = typeof first.sourceIndex === 'number' ? first.sourceIndex : -1;
          contentStartLocal = si >= 0 ? si : -1;
        }

        // If parser index missing, fallback to decl-local indexOf search for originalUrl inside rawValue
        if (contentStartLocal < 0) {
          // Find sequentially: we will resolve later via pending ordering, but for globalOffset we need local index
          // Use -1 sentinel and handle during pending sort via fallback search
          contentStartLocal = -1;
        }

        let globalOffset = -1;
        if (valueStartOffset >= 0 && contentStartLocal >= 0) {
          globalOffset = valueStartOffset + contentStartLocal;
        }

        entries.push({ node, index, nodes: nodes as unknown[], originalUrl, contentStartLocal, globalOffset });
      },
    );

    if (entries.length === 0) return;

    // Resolve fallback local offsets for entries where parser index missing via decl-local sequential search
    // This still avoids global content.indexOf and respects comments/decl boundaries.
    let declCursor = 0;
    for (const e of entries) {
      if (e.contentStartLocal >= 0) {
        // Already have parser offset; still advance declCursor past this token for fallback entries ordering
        const len = e.originalUrl.length;
        declCursor = Math.max(declCursor, e.contentStartLocal + len);
        continue;
      }
      // Need to locate originalUrl inside rawForParse starting from declCursor
      const idx = rawForParse.indexOf(e.originalUrl, declCursor);
      if (idx !== -1) {
        e.contentStartLocal = idx;
        if (valueStartOffset >= 0) e.globalOffset = valueStartOffset + idx;
        declCursor = idx + e.originalUrl.length;
      } else {
        const fallback = rawForParse.indexOf(e.originalUrl);
        if (fallback !== -1) {
          e.contentStartLocal = fallback;
          if (valueStartOffset >= 0) e.globalOffset = valueStartOffset + fallback;
        }
      }
    }

    // Sort descending by index within same parent array to keep splice indices stable.
    // Group by parent reference: for same parent, higher index first.
    const parentId = new WeakMap<object, number>();
    let idCounter = 0;
    for (const e of entries) {
      const parent = e.nodes as object;
      if (!parentId.has(parent)) parentId.set(parent, idCounter++);
    }
    entries.sort((a, b) => {
      const pa = parentId.get(a.nodes as object)!;
      const pb = parentId.get(b.nodes as object)!;
      if (pa !== pb) return pb - pa;
      return b.index - a.index;
    });

    let declModified = false;
    type Pending = {
      originalUrl: string;
      resolvedPath: string;
      mediaType: string;
      kind: import('./types.ts').AssetKind;
      byteLength: number;
      globalOffset: number;
    };
    const pending: Pending[] = [];

    for (const entry of entries) {
      const { node, index, nodes, originalUrl, globalOffset } = entry;
      const urlNode = node as { type: string; value: string; nodes: unknown[] };

      // CSS-unescape before classification/percent decode; retain original spelling for records
      let unescapedUrl: string;
      try {
        unescapedUrl = cssUnescape(originalUrl);
      } catch (err) {
        const code = (err as { code?: string }).code ?? 'INVALID_OPTIONS';
        const msg = err instanceof Error ? err.message : String(err);
        diagnostics.push({
          code,
          message: msg,
          originalUrl,
          severity: 'error',
          filePath: documentPath,
        } as AssetDiagnostic);
        continue;
      }

      // Classification: skip remote / data / blob / fragment-only etc. before filesystem work (use unescaped)
      const classification = classifyUrl(unescapedUrl);
      if (classification.kind === 'skip') {
        continue;
      }

      // Resolve via catalog + options using unescaped value
      let resolved: ReturnType<typeof resolveAssetReferenceSync> extends infer R ? R : never;
      try {
        resolved = resolveAssetReferenceSync(unescapedUrl, catalog, {
          documentPath,
          rootDir,
          allowBasenameMatch,
          resolver,
        } as unknown as Parameters<typeof resolveAssetReferenceSync>[2]);
      } catch (err) {
        // Resolver contract violations (thenable, malformed asset) must fail fast with INVALID_OPTIONS before mutation.
        // Other resolve errors (malformed percent/NUL, ambiguous) remain per-URL diagnostics.
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
        diagnostics.push({
          code,
          message: msg,
          originalUrl,
          severity: 'error',
          filePath: documentPath,
        } as AssetDiagnostic);
        continue;
      }

      if ((resolved as { skipped: boolean }).skipped) {
        continue;
      }
      const res = resolved as { asset?: unknown; resolvedPath?: string; skipped: boolean };
      if (!res.asset) {
        diagnostics.push({
          code: 'UNRESOLVED_REFERENCE',
          message: `Unresolved asset reference "${originalUrl}" (resolved to "${res.resolvedPath ?? ''}")`,
          originalUrl,
          filePath: res.resolvedPath ?? documentPath,
          severity: 'warn',
        } as AssetDiagnostic);
        continue;
      }

      const asset = res.asset as import('./types.ts').EncodedAsset;
      const resolvedPath = res.resolvedPath ?? asset.sourcePath ?? asset.filename ?? originalUrl;

      // Selective inlining policy — distinct from hard resource limits.
      // Assets exceeding maxInlineBytes or rejected by shouldInline predicate
      // remain external with a structured INLINE_SKIPPED diagnostic (warn, not error).
      // Hard limits (maxAssetBytes/maxTotalBytes) remain fail-closed via encode/catalog.
      if (typeof maxInlineBytes === 'number' && asset.byteLength > maxInlineBytes) {
        diagnostics.push({
          code: 'INLINE_SKIPPED',
          message: `Asset "${originalUrl}" (${asset.byteLength} bytes) exceeds maxInlineBytes ${maxInlineBytes} — left as external reference`,
          originalUrl,
          filePath: resolvedPath,
          severity: 'warn',
        } as AssetDiagnostic);
        continue;
      }
      if (shouldInline !== undefined) {
        let decision: unknown;
        try {
          decision = shouldInline(asset, originalUrl);
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
          diagnostics.push({
            code: 'INLINE_SKIPPED',
            message: `Asset "${originalUrl}" skipped by shouldInline predicate — left as external reference`,
            originalUrl,
            filePath: resolvedPath,
            severity: 'warn',
          } as AssetDiagnostic);
          continue;
        }
      }

      const needsFormat =
        isFontFaceSrc &&
        asset.kind === 'font' &&
        typeof asset.fontFormat === 'string' &&
        asset.fontFormat.length > 0 &&
        !hasFollowingFormat(nodes as readonly unknown[], index);

      // Enforce replacement and projected-output bounds BEFORE inserting each data URL
      const nextCount = addSafe(replacements.length + pending.length, 1, maxReplacements, documentPath);
      if (nextCount > maxReplacements) {
        throw new ResourceLimitError(`Replacement count ${nextCount} exceeds maxReplacements ${maxReplacements}`, {
          limit: maxReplacements,
          actual: nextCount,
          path: documentPath,
        });
      }
      const dataUrlBytes = byteLengthUtf8(asset.dataUrl);
      const origBytes = byteLengthUtf8(originalUrl);
      if (!Number.isSafeInteger(dataUrlBytes) || !Number.isSafeInteger(origBytes)) {
        throw new ResourceLimitError(`Unsafe integer byte length for replacement`, {
          limit: maxOutputBytes,
          actual: dataUrlBytes,
          path: documentPath,
        });
      }
      let delta = subSafe(dataUrlBytes, origBytes, documentPath);
      if (needsFormat && asset.fontFormat) {
        const formatStr = ` format('${asset.fontFormat}')`;
        const formatBytes = byteLengthUtf8(formatStr);
        delta = addSafe(delta, formatBytes, maxOutputBytes, documentPath);
      }
      const nextProjected = addSafe(projectedBytes, delta, maxOutputBytes, documentPath);
      if (nextProjected > maxOutputBytes) {
        throw new ResourceLimitError(
          `Projected output bytes ${nextProjected} exceeds maxOutputBytes ${maxOutputBytes}`,
          {
            limit: maxOutputBytes,
            actual: nextProjected,
            path: documentPath,
          },
        );
      }
      projectedBytes = nextProjected;

      if (needsFormat && asset.fontFormat) {
        // Replace url inner with dataUrl
        urlNode.nodes = [{ type: 'word', value: asset.dataUrl } as unknown as import('postcss-value-parser').Node];
        // Insert a space + format('...') after the url node
        const formatNode = {
          type: 'function',
          value: 'format',
          nodes: [
            { type: 'string', value: asset.fontFormat, quote: "'" } as unknown as import('postcss-value-parser').Node,
          ],
          before: '',
          after: '',
        } as unknown as import('postcss-value-parser').Node;
        const spaceNode = { type: 'space', value: ' ' } as unknown as import('postcss-value-parser').Node;
        (nodes as unknown[]).splice(index + 1, 0, spaceNode as unknown, formatNode as unknown);
      } else {
        // Generic: replace inner with dataUrl (unquoted word; dataUrl is safe)
        urlNode.nodes = [{ type: 'word', value: asset.dataUrl } as unknown as import('postcss-value-parser').Node];
      }

      pending.push({
        originalUrl,
        resolvedPath,
        mediaType: asset.mediaType,
        kind: asset.kind,
        byteLength: asset.byteLength,
        globalOffset,
      });
      declModified = true;
      modified = true;
    }

    // Push to global replacements in source order (ascending globalOffset) to keep deterministic order per decl
    // Use globalOffset when available, fallback to index ordering
    pending.sort((a, b) => {
      if (a.globalOffset >= 0 && b.globalOffset >= 0) return a.globalOffset - b.globalOffset;
      return 0;
    });
    for (const p of pending) {
      const loc =
        p.globalOffset >= 0
          ? (() => {
              const { line, column } = offsetToLineCol(content, p.globalOffset);
              return { offset: p.globalOffset, line, column };
            })()
          : { offset: -1 };
      replacements.push(
        Object.freeze({
          originalUrl: p.originalUrl,
          resolvedPath: p.resolvedPath,
          mediaType: p.mediaType,
          kind: p.kind,
          byteLength: p.byteLength,
          location: loc,
        }) as AssetReplacement,
      );
    }

    if (declModified) {
      decl.value = parsed.toString();
    }
  });

  if (!modified) {
    return Object.freeze({
      content,
      modified: false,
      replacements: Object.freeze([]) as readonly AssetReplacement[],
      diagnostics: Object.freeze([...diagnostics]) as readonly AssetDiagnostic[],
    }) as InlineResult;
  }

  const newContent = root.toString();
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

  return Object.freeze({
    content: newContent,
    modified: true,
    replacements: Object.freeze([...replacements]) as readonly AssetReplacement[],
    diagnostics: Object.freeze([...diagnostics]) as readonly AssetDiagnostic[],
  }) as InlineResult;
}
