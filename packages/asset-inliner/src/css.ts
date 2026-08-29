/**
 * CSS inliner — pure synchronous transform over an already-encoded immutable AssetCatalog.
 *
 * **Library choice rationale (Node22 / ESM / source-preserving / license / malformed):**
 * - `postcss@8.5.26` — MIT, maintained (primary CSS parser in ecosystem), `>= Node 14` so Node22 is
 *   well within support, ships both CJS and ESM entrypoints (`import postcss from 'postcss'` works
 *   under `"type": "module"` + Node22), preserves comments, whitespace, and raw values via `decl.raws`,
 *   and throws `CssSyntaxError` on malformed CSS (we map to `ParseError`) rather than swallowing errors.
 * - `postcss-value-parser@4.2.0` — MIT, maintained as the companion value parser for PostCSS,
 *   `>= Node 0.10`, used by most PostCSS plugins; it is CJS but importable as ESM via default-import
 *   interop (`import vp from 'postcss-value-parser'` → `(vp as any).default ?? vp`), preserves
 *   quoted/unquoted URL forms, escapes, spaces, comments, and comma/div separators, and tolerates
 *   gracefully without throwing for most values (we surface value-parse failures as diagnostics rather
 *   than silent prints).
 *   Alternatives considered: `css-tree` (strong typing but normalizes output aggressively, less source
 *   preserving), `rework` / `css` (unmaintained, deprecated, poorer ESM story). The PostCSS pair
 *   gives the best trade-off for "minimal edits to affected declaration values while preserving
 *   surrounding formatting as closely as the parser permits" and has the widest license/audit coverage.
 *
 * **Malformed-CSS policy (documented):** `inlineCss` **throws** `ParseError` if the stylesheet cannot
 * be parsed by PostCSS (e.g. unclosed `url(`, broken `@font-face`). This is a single, explicit
 * throw-or-diagnostic boundary: CSS syntax failure throws immediately with `cause` preserved; per-URL
 * resolution problems (unresolved path, duplicate basename, malformed percent-encoding, NUL) are
 * emitted as `diagnostics` with `severity: 'warn'|'error'` and do not throw, and the offending
 * `url(...)` is left unchanged. No error is swallowed via `console.error` and no partial success is
 * reported as `true`. Callers may distinguish "stylesheet is unparseable" (catch `ParseError`) from
 * "stylesheet parsed but some URLs did not resolve" (inspect `diagnostics`).
 *
 * The transform is purely synchronous and depends only on the provided `AssetCatalog` plus the
 * resolver helpers in `src/resolve.ts`. It never performs I/O, fetches remote URLs, or re-encodes
 * assets. Async filesystem / detection work must happen during catalog construction.
 */

import postcss from 'postcss';
import * as valueParserModule from 'postcss-value-parser';
import type { InlineOptions, InlineResult, AssetReplacement, AssetDiagnostic } from './types.ts';
import { InvalidOptionsError, ParseError } from './errors.ts';
import { classifyUrl, resolveAssetReferenceSync } from './resolve.ts';

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

// ---------------------------------------------------------------------------
// Public API: inlineCss
// ---------------------------------------------------------------------------

/**
 * Inline local `url(...)` references in CSS content using an already-encoded catalog.
 *
 * - Replaces eligible local `url(...)` tokens in **any** declaration value (not only
 *   `background`/`background-image`); supports masks, borders, cursors, list-styles,
 *   generated content, custom properties (`--*`), gradients, multiple URLs, and comments.
 * - Parses comma-separated `@font-face src` values correctly and preserves remote,
 *   unsupported, already-inlined, and unresolved alternatives.
 * - Adds `format(...)` only for font assets (`kind === 'font' && fontFormat`) inside
 *   `@font-face src` when no existing `format(...)` follows the `url(...)`.
 * - Handles quoted/unquoted URLs, CSS escapes, whitespace, query strings, fragments,
 *   and percent-decoding via `src/resolve.ts` helpers (query/fragment stripped before lookup,
 *   never emitted inside data URL).
 * - Returns original `content` byte-for-byte when unchanged; for changed content minimizes
 *   edits to affected declaration values rather than normalizing the full stylesheet.
 * - Emits one deterministic `AssetReplacement` per replaced URL with location, original
 *   reference, resolved identity, kind, and bytes.
 * - Malformed CSS throws `ParseError` (single documented policy); per-URL issues emit
 *   `diagnostics` without printing or swallowing invisibly.
 * - Pure, synchronous, no I/O off the content string — async work belongs in catalog creation.
 */
export function inlineCss(content: string, options: InlineOptions): InlineResult {
  if (typeof content !== 'string') {
    throw new InvalidOptionsError('inlineCss requires content as string');
  }
  if (!options || !options.catalog) {
    throw new InvalidOptionsError('inlineCss requires options.catalog');
  }

  const catalog = options.catalog;
  const documentPath = options.documentPath;
  const rootDir = options.rootDir;
  const allowBasenameMatch = options.allowBasenameMatch ?? false;
  const resolver = options.resolver;

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

  // Walk every declaration (including custom properties)
  root.walkDecls((decl) => {
    const rawValue = decl.value;
    if (!rawValue) return;
    // Fast-path: case-insensitive check for "url(" to avoid parsing values that cannot contain urls
    if (!/url\s*\(/i.test(rawValue)) return;

    let parsed: ReturnType<typeof parseValue>;
    try {
      parsed = parseValue(rawValue);
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

    // Collect url entries via walk (captures nested functions like image-set)
    type Entry = { node: unknown; index: number; nodes: unknown[]; originalUrl: string };
    const entries: Entry[] = [];

    // valueParser walk visits nested nodes; we capture parent nodes array for each url
    (parsed as unknown as { walk: (cb: (node: unknown, idx: number, nodes: unknown[]) => void) => void }).walk(
      (node: unknown, index: number, nodes: unknown[]) => {
        const n = node as { type: string; value: string; nodes?: unknown[] };
        if (n.type !== 'function' || n.value.toLowerCase() !== 'url') return;

        // Extract inner URL string
        let originalUrl!: string;
        const inner = n.nodes as unknown[] | undefined;
        if (!inner || inner.length === 0) {
          // empty url() — treat as empty reference, skip
          return;
        }
        const first = inner[0] as { type: string; value: string };
        if (first.type === 'string') {
          originalUrl = first.value;
        } else if (first.type === 'word') {
          originalUrl = first.value;
        } else if (first.type === 'function') {
          // unusual nested; stringify
          originalUrl = parseValue.stringify(first as unknown as import('postcss-value-parser').Node);
        } else {
          // fallback: stringify inner
          originalUrl = (inner as unknown[])
            .map((x) => parseValue.stringify(x as import('postcss-value-parser').Node))
            .join('');
        }

        entries.push({ node, index, nodes: nodes as unknown[], originalUrl });
      },
    );

    if (entries.length === 0) return;

    // Sort descending by index within same parent array to keep splice indices stable.
    // Group by parent reference: for same parent, higher index first.
    // For different parents, order does not matter, but we sort globally descending for determinism.
    // To make grouping correct, we map parent -> max index and stable sort.
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
      index: number;
    };
    const pending: Pending[] = [];

    for (const entry of entries) {
      const { node, index, nodes, originalUrl } = entry;
      const urlNode = node as { type: string; value: string; nodes: unknown[] };

      // Classification: skip remote / data / blob / fragment-only etc. before filesystem work
      const classification = classifyUrl(originalUrl);
      if (classification.kind === 'skip') {
        continue;
      }

      // Resolve via catalog + options
      let resolved: ReturnType<typeof resolveAssetReferenceSync> extends infer R ? R : never;
      try {
        resolved = resolveAssetReferenceSync(originalUrl, catalog, {
          documentPath,
          rootDir,
          allowBasenameMatch,
          resolver,
        } as unknown as Parameters<typeof resolveAssetReferenceSync>[2]);
      } catch (err) {
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

      const needsFormat =
        isFontFaceSrc &&
        asset.kind === 'font' &&
        typeof asset.fontFormat === 'string' &&
        asset.fontFormat.length > 0 &&
        !hasFollowingFormat(nodes as readonly unknown[], index);

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
        index,
      });
      declModified = true;
      modified = true;
    }

    // Push to global replacements in source order (ascending index) to keep deterministic order per decl
    pending.sort((a, b) => a.index - b.index);
    for (const p of pending) {
      replacements.push(
        Object.freeze({
          originalUrl: p.originalUrl,
          resolvedPath: p.resolvedPath,
          mediaType: p.mediaType,
          kind: p.kind,
          byteLength: p.byteLength,
          location: { offset: -1 },
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

  // Finalize location offsets deterministically in source order (already in source order due to pending sort per decl
  // and root.walkDecls order). We compute offsets via sequential scan to handle duplicate originalUrls correctly.
  const withOffsets: AssetReplacement[] = [];
  let cursor = 0;
  for (const rep of replacements) {
    const idx = content.indexOf(rep.originalUrl, cursor);
    const offset = idx !== -1 ? idx : content.indexOf(rep.originalUrl);
    if (idx !== -1) cursor = idx + rep.originalUrl.length;
    const before = offset !== -1 ? content.slice(0, offset) : '';
    const line = before ? before.split('\n').length : 1;
    const col = before ? before.length - before.lastIndexOf('\n') - 1 : 0;
    withOffsets.push(
      Object.freeze({
        ...rep,
        location: { offset: offset !== -1 ? offset : -1, line, column: col },
      }) as AssetReplacement,
    );
  }

  return Object.freeze({
    content: newContent,
    modified: true,
    replacements: Object.freeze(withOffsets) as readonly AssetReplacement[],
    diagnostics: Object.freeze([...diagnostics]) as readonly AssetDiagnostic[],
  }) as InlineResult;
}
