/**
 * HTML inliner — pure synchronous transform over an already-encoded immutable AssetCatalog.
 *
 * **Library choice rationale (Node22 / ESM / fragment preservation / source locations / license / malformed):**
 *
 * - `parse5@8.0.0` — MIT, maintained (>3M weekly downloads, WHATWG spec compliant), Node >=18 so Node22 is well within support,
 *   ships ESM (`"type":"module"` + `exports.import`), actively updated for spec and security (`8.0.0` released 2024).
 *   Key HTML needs:
 *   - **Fragment vs document preservation:** `parse5.parseFragment(html, opts)` returns a `DocumentFragment` that
 *     serializes via `parse5.serialize(fragment)` without injecting `<html>/<head>/<body>` wrappers; `parse5.parse(html, opts)`
 *     preserves `<!DOCTYPE>` and full document shape. Cheerio (`cheerio.load`) always wraps fragments in `<html><head><body>`
 *     unless `xmlMode` tricks are used, and its `$.html()` re-serializes wrappers unless exact `cheerio` options are tuned — it adds
 *     measurable wrapper-insertion risk for the "unchanged does not gain wrapper tags" criterion. `linkedom` also always builds a full
 *     `Document`. `parse5` is the lowest-level primitive that lets us preserve document vs fragment shape exactly.
 *   - **Source locations:** `parse5` provides `sourceCodeLocationInfo: true` yielding per-element and per-attribute
 *     `startOffset/startLine/startCol` via `node.sourceCodeLocation.attrs[attrName]`, which we use for deterministic
 *     `AssetReplacement.location` without leaking the parser node's live reference (we copy offsets into frozen records).
 *   - **ESM/Node22:** `parse5@8` is ESM-only (no CJS `require` needed), `import * as parse5 from 'parse5'` works under `"type":"module"` Node22,
 *     unlike older `htmlparser2` (CJS default) and `cheerio@1` (CJS). Tested import under `node --input-type=module` with `parse5@8`.
 *   - **License:** MIT, auditable, same family as `postcss` (also MIT) — satisfies provenance requirements without additional notices.
 *   - **Malformed input:** `parse5` never throws on malformed HTML; it follows the HTML parsing spec's error-recovery and produces a best-effort tree
 *     (e.g. `<img src="../x.png" <div>` becomes two elements). This matches the acceptance criterion "`<img>` without `src` never throws,
 *     malformed markup does not throw". `htmlparser2` with `DomHandler` is similarly tolerant but its `dom-serializer` normalizes more aggressively
 *     and requires extra `domhandler` + `domutils` plumbing; `linkedom` also tolerates but is heavier and pulls in `parse5` transitively.
 *   Alternatives rejected:
 *   - `cheerio` — convenient jQuery API, MIT, but it bundles `parse5`/`htmlparser2` behind a higher-level API that (a) always adds document wrappers
 *     unless `cheerio.load(html, null, false)` is used inconsistently, (b) re-serializes via its own `cheerio` serializer which normalizes more
 *     (`<img>` self-closes differently, attribute quoting forced), and (c) its type declarations expose `CheerioAPI` which leaked parser state in earlier
 *     tasks (forbidden by "Do not expose parser instances in public results"). Direct `parse5` avoids those layers.
 *   - `htmlparser2@9` — MIT, maintained, ESM friendly, fast streaming, but requires manual `Parser` + `DomHandler` + `DomUtils` + `dom-serializer`
 *     assembly to achieve fragment preservation; `parse5` already provides fragment/document duality out of the box with fewer integration points.
 *   - `linkedom` — MIT, browser-like `DOMParser`, ESM, but it always constructs a full `Document` (`parseHTML` returns `Document`), so fragment
 *     preservation requires trimming `document.body.innerHTML`, which still injects implied wrappers for `<table><tr>` contexts.
 *
 * **Audio/video built-ins — DEFERRED per ASSET-08 (`src/policy.ts:33-41`):**
 * Common web audio (`audio/mpeg`, `audio/ogg`, `audio/opus`, `audio/wav`) and video (`video/mp4`, `video/webm`) are *not* built-in definitions;
 * they are large (mp3 ~3–5 MiB/min, video 1–50 MiB/clip → 33% Base64 expansion exceeds `maxAssetBytes=3 MiB` / `maxTotalBytes=15 MiB` quickly),
 * browser-streamed rather than data-URL embedded, and subject to `file-type` container ambiguity (`ftyp`/`OggS`/`RIFF` collisions).
 * Therefore the HTML minimum inlines **only image-kind assets** for the locked targets:
 * `img[src]`, `img[srcset]`, `source[src]`, `source[srcset]`, `link[href]` (icon-related), `video[poster]`.
 * If audio/video definitions were approved, they would support `audio[src]`, `video[src]`, `source[src]` (audio/video context), and `track[src]`
 * under explicit `allowedKinds` and size policy. Per ASSET-08 that path is custom-definition only and intentionally not enabled here:
 * a gated branch would check `asset.kind === 'audio' | 'video'` only when the catalog contains those kinds *and* the caller explicitly opts
 * via `allowedKinds` — but no built-in audio/video is shipped, so those attributes remain non-inlined by default and emit no spurious replacement.
 * Callers may still encode custom `audio`/`video` assets via `createDefinitionRegistry([...custom, ...builtIns])` without changing this file.
 *
 * The transform is synchronous, pure, and immutable over the catalog. Async filesystem/detection work happens during `createAssetCatalog`.
 */

import * as parse5 from 'parse5';
import type { InlineOptions, InlineResult, AssetReplacement, AssetDiagnostic } from './types.ts';
import { InvalidOptionsError } from './errors.ts';
import { classifyUrl, resolveAssetReferenceSync } from './resolve.ts';

// ---------------------------------------------------------------------------
// Document vs fragment detection
// ---------------------------------------------------------------------------

function isDocumentHtml(content: string): boolean {
  const trimmed = content.trimStart();
  if (/^<!doctype/i.test(trimmed)) return true;
  if (/<html[\s>]/i.test(content)) return true;
  return false;
}

// ---------------------------------------------------------------------------
// srcset helpers — split candidates preserving data URLs (which contain commas)
// ---------------------------------------------------------------------------

/**
 * Split a srcset attribute value into candidate strings without corrupting data URLs.
 * Naive `split(',')` breaks `data:image/png;base64,abc 1x` into `["data:image/png;base64","abc 1x"]`.
 * We merge a `data:` start part with its following payload part.
 */
function splitSrcsetPreservingDataUrls(input: string): string[] {
  if (input.trim() === '') return [];
  if (!input.includes(',')) return [input];
  const rawParts = input.split(',');
  const candidates: string[] = [];
  let i = 0;
  while (i < rawParts.length) {
    const part = rawParts[i] as string;
    const trimmed = part.trim();
    // If this part starts with data: then its comma was the data URL's internal comma, not a candidate separator.
    // Merge with next part (payload + optional descriptor) if next exists and is not itself a new data: start.
    if (trimmed.toLowerCase().startsWith('data:') && i + 1 < rawParts.length) {
      const next = rawParts[i + 1] as string;
      const nextTrim = next.trim();
      if (!nextTrim.toLowerCase().startsWith('data:')) {
        candidates.push(part + ',' + next);
        i += 2;
        continue;
      }
    }
    candidates.push(part);
    i += 1;
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
    attrs?: Record<string, { startOffset?: number; startLine?: number; startCol?: number }>;
  } & Record<string, unknown>;
};

function findAttr(element: Parse5Element, nameLower: string): Parse5Attr | undefined {
  return element.attrs.find((a) => a.name.toLowerCase() === nameLower);
}

function isIconLink(element: Parse5Element): boolean {
  const relAttr = findAttr(element, 'rel');
  if (!relAttr) return false;
  const rel = relAttr.value.toLowerCase();
  // icon-related: rel contains 'icon' token (covers icon, shortcut icon, apple-touch-icon, mask-icon, fluid-icon, etc.)
  // Split on whitespace for robustness but also substring check.
  const tokens = rel.split(/\s+/);
  if (tokens.some((t) => t.includes('icon'))) return true;
  return rel.includes('icon');
}

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
    content: string; // original content for offset fallback
  },
): void {
  // Process element attributes before recursing children
  const tag = (node.tagName ?? node.nodeName ?? '').toLowerCase();
  if (tag) {
    // Gated targets: only these are inlined. All others (a[href], form[action], script[src], link[rel=stylesheet][href], iframe[src], object[data], etc.) are intentionally not handled.
    if (tag === 'img') {
      handleSimpleAttr(node, 'src', ctx);
      handleSrcsetAttr(node, 'srcset', ctx);
    } else if (tag === 'source') {
      handleSimpleAttr(node, 'src', ctx);
      handleSrcsetAttr(node, 'srcset', ctx);
    } else if (tag === 'link') {
      // icon-related only
      if (isIconLink(node)) {
        handleSimpleAttr(node, 'href', ctx);
      }
    } else if (tag === 'video') {
      handleSimpleAttr(node, 'poster', ctx);
      // Deferred: audio/video src handling would be gated by kind === 'audio'|'video' and explicit allowedKinds — not enabled per ASSET-08.
      // If we were to support it, the branch would be:
      //   handleSimpleAttrIfKind(node, 'src', ['video','audio'], ctx)
      // and similarly source/track. Intentionally omitted to prevent accidental large-media inlining.
    }
    // Intentionally NOT handling:
    // - audio[src], video[src], track[src] — deferred per ASSET-08 (custom-definition only)
    // - a[href], area[href], form[action], script[src], link[rel=stylesheet][href], iframe[src], frame[src], object[data], embed[src], etc.
  }

  const children = (node as Parse5Element & { childNodes?: Parse5Element[] }).childNodes;
  if (children && children.length > 0) {
    for (const child of children) {
      // child may be text/comment/document; recurse only if it can have childNodes or tagName
      walkAndInline(child as Parse5Element, ctx);
    }
  }
}

function locationForAttr(
  element: Parse5Element,
  attrNameLower: string,
  originalUrl: string,
  fallbackContent: string,
): { offset: number; line?: number; column?: number } {
  const loc = element.sourceCodeLocation?.attrs?.[attrNameLower] as
    | { startOffset?: number; startLine?: number; startCol?: number }
    | undefined;
  // Also try original case attr name fallback (parse5 may store lowercased)
  const locAny = element.sourceCodeLocation?.attrs as Record<string, unknown> | undefined;
  let resolvedLoc = loc;
  if (!resolvedLoc && locAny) {
    const key = Object.keys(locAny).find((k) => k.toLowerCase() === attrNameLower);
    if (key) resolvedLoc = locAny[key] as { startOffset?: number; startLine?: number; startCol?: number };
  }
  if (resolvedLoc && typeof resolvedLoc.startOffset === 'number') {
    return {
      offset: resolvedLoc.startOffset,
      line: resolvedLoc.startLine,
      column: resolvedLoc.startCol,
    };
  }
  const off = fallbackContent.indexOf(originalUrl);
  if (off !== -1) {
    const before = fallbackContent.slice(0, off);
    const line = before.split('\n').length;
    const col = before.length - before.lastIndexOf('\n') - 1;
    return { offset: off, line, column: col };
  }
  return { offset: -1 };
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
  },
): void {
  const attr = findAttr(element, attrNameLower);
  if (!attr) return;
  const raw = attr.value;
  if (raw.trim() === '') return; // empty/missing leaves unchanged, no diagnostic

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
  // Gate by kind — HTML minimum only inlines image assets (per ASSET-08 deferred audio/video)
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
  const loc = locationForAttr(element, attrNameLower, raw, ctx.content);
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
  attr.value = asset.dataUrl;
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
  },
): void {
  const attr = findAttr(element, attrNameLower);
  if (!attr) return;
  const rawSrcset = attr.value;
  if (rawSrcset.trim() === '') return;

  const candidatesRaw = splitSrcsetPreservingDataUrls(rawSrcset);
  if (candidatesRaw.length === 0) return;

  let anyChanged = false;
  const newCandidates: string[] = [];

  for (const rawCandidate of candidatesRaw) {
    const trimmedForCheck = rawCandidate.trim();
    if (trimmedForCheck === '') {
      // Preserve empty segments? Skip
      continue;
    }
    const { url, descriptor } = extractUrlAndDescriptor(rawCandidate);
    if (!url) {
      newCandidates.push(rawCandidate.trim());
      continue;
    }
    const cls = classifyUrl(url);
    if (cls.kind === 'skip') {
      // Preserve existing data URLs / remotes exactly as they appeared (descriptor preserved)
      newCandidates.push(descriptor ? `${url} ${descriptor}` : url);
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
      continue;
    }

    if ((resolved as { skipped: boolean }).skipped) {
      newCandidates.push(descriptor ? `${url} ${descriptor}` : url);
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
      continue;
    }

    const resolvedPath = res.resolvedPath ?? asset.sourcePath ?? asset.filename ?? url;
    const loc = locationForAttr(element, attrNameLower, url, ctx.content);
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
  }

  if (!anyChanged) return;
  attr.value = newCandidates.join(', ');
  ctx.modified.value = true;
}

// ---------------------------------------------------------------------------
// Public API: inlineHtml
// ---------------------------------------------------------------------------

/**
 * Inline local image asset references in HTML content using an already-encoded catalog.
 *
 * Locked HTML minimum targets (per package contract):
 * - `img[src]` (legacy)
 * - `img[srcset]` and `source[srcset]` responsive candidates (descriptors `1x`/`2x`/`100w` preserved; commas inside existing `data:` URLs are not corrupted)
 * - `source[src]`, `link[href]` icon-related (`rel` contains `icon`), `video[poster]` where resolved `kind === 'image'`
 *
 * Deferred (not inlined by default per ASSET-08): `audio[src]`, `video[src]`, `source[src]` (audio/video context), `track[src]` — they would require
 * explicit audio/video built-ins (`allowedKinds: ['audio','video']`) and size policy; current `kind` gating (`=== 'image'`) intentionally excludes them
 * so large media is not silently embedded. Custom tiny audio/video can still be inlined via a custom `AssetTypeDefinition` and a narrow `resolver`
 * hook without changing this file (proven in `test/policy.test.ts` for custom audio).
 *
 * Non-targets that remain untouched by design: `a[href]`, `area[href]`, `form[action]`, `script[src]`, `link[rel=stylesheet][href]`,
 * `iframe[src]`, `frame[src]`, `object[data]`, `embed[src]`, etc. — gating is by `(element, attribute, kind)` triple, not a broad `src`/`href` pass.
 *
 * Returns original `content` byte-for-byte when unchanged; for changed content serializes the mutated tree via `parse5.serialize`
 * while preserving document vs fragment shape (no wrapper injection for fragments) and minimizing unrelated formatting changes.
 * Replacement metadata and diagnostics match the CSS model (`AssetReplacement` / `AssetDiagnostic` frozen snapshots, deterministic order).
 * `<img>` without `src` never throws; malformed markup is recovered per HTML spec (no throw).
 */
export function inlineHtml(content: string, options: InlineOptions): InlineResult {
  if (typeof content !== 'string') {
    throw new InvalidOptionsError('inlineHtml requires content as string');
  }
  if (!options || !options.catalog) {
    throw new InvalidOptionsError('inlineHtml requires options.catalog');
  }

  const catalog = options.catalog;
  const documentPath = options.documentPath;
  const rootDir = options.rootDir;
  const allowBasenameMatch = options.allowBasenameMatch ?? false;
  const resolver = options.resolver;

  const replacements: AssetReplacement[] = [];
  const diagnostics: AssetDiagnostic[] = [];
  const modified = { value: false };

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
  });

  if (!modified.value) {
    return Object.freeze({
      content,
      modified: false,
      replacements: Object.freeze([]) as readonly AssetReplacement[],
      diagnostics: Object.freeze([...diagnostics]) as readonly AssetDiagnostic[],
    }) as InlineResult;
  }

  const newContent: string = isDoc
    ? parse5.serialize(tree as unknown as never)
    : parse5.serialize(tree as unknown as never);

  // Sorting replacements by location offset for deterministic order already in walk order; ensure stable
  const withOffsets = replacements; // locations already computed

  return Object.freeze({
    content: newContent,
    modified: true,
    replacements: Object.freeze([...withOffsets]) as readonly AssetReplacement[],
    diagnostics: Object.freeze([...diagnostics]) as readonly AssetDiagnostic[],
  }) as InlineResult;
}
