/**
 * Immutable asset definitions and registry.
 *
 * - Built-ins cover all required legacy extensions plus AVIF and TTC
 *   using current IANA media types.
 * - Extensions and media types are normalized once; malformed/duplicate
 *   definitions are rejected.
 * - Registries are immutable values — factories return frozen snapshots,
 *   never mutate a shared singleton.
 * - `.svg` defaults to `image/svg+xml` (image). Font SVG is available only
 *   through an explicit definition (`svgFontDefinition`) so that the default
 *   registry contains no duplicate `.svg` entry.
 */

import type { AssetKind, AssetTypeDefinition } from './types.ts';
import { AmbiguousDefinitionError, InvalidOptionsError } from './errors.ts';

// ---------------------------------------------------------------------------
// Normalization helpers (kept module-private except where tests need them)
// ---------------------------------------------------------------------------

/**
 * Normalize an extension to lowercase with leading dot.
 * @throws {InvalidOptionsError} on empty or malformed extension.
 */
export function normalizeExtension(raw: string): string {
  if (typeof raw !== 'string') {
    throw new InvalidOptionsError(`Extension must be a string, got ${typeof raw}`);
  }
  const trimmed = raw.trim();
  if (trimmed.length === 0) {
    throw new InvalidOptionsError('Extension must not be empty');
  }
  // Allow with or without leading dot, but normalize to leading dot + lowercase.
  const withDot = trimmed.startsWith('.') ? trimmed : `.${trimmed}`;
  const normalized = withDot.toLowerCase();
  // Valid extension: dot followed by one or more alphanumeric characters (allow digits). Reject lone dot or "..".
  if (!/^\.[a-z0-9]+$/.test(normalized)) {
    throw new InvalidOptionsError(`Malformed extension "${raw}" — expected ".ext" with alphanumeric characters`);
  }
  return normalized;
}

/**
 * Normalize a media type to lowercase base type/subtype.
 * Parameters after `;` are stripped (e.g. `image/svg+xml;charset=utf-8` → `image/svg+xml`).
 * @throws {InvalidOptionsError} on empty or malformed media type.
 */
export function normalizeMediaType(raw: string): string {
  if (typeof raw !== 'string') {
    throw new InvalidOptionsError(`Media type must be a string, got ${typeof raw}`);
  }
  const trimmed = raw.trim();
  if (trimmed.length === 0) {
    throw new InvalidOptionsError('Media type must not be empty');
  }
  // Strip parameters after ';' for canonical form.
  const base = trimmed.split(';')[0]!.trim().toLowerCase();
  // Basic IANA pattern: type/subtype where each token allows a-z0-9!#$&^_.+-
  // Keep permissive but reject missing slash or spaces.
  if (!/^[a-z0-9!#$&^_.+-]+\/[a-z0-9!#$&^_.+-]+$/.test(base)) {
    throw new InvalidOptionsError(`Malformed media type "${raw}" — expected "type/subtype"`);
  }
  if (base.includes(' ')) {
    throw new InvalidOptionsError(`Malformed media type "${raw}" — must not contain spaces`);
  }
  return base;
}

function normalizeKind(raw: AssetKind): AssetKind {
  if (typeof raw !== 'string' || raw.trim().length === 0) {
    throw new InvalidOptionsError('Asset kind must be a non-empty string');
  }
  const trimmed = raw.trim();
  // Preserve custom kinds as-is except trimming; built-ins are lowercase.
  return trimmed as AssetKind;
}

function normalizeFontFormat(raw: string | undefined): string | undefined {
  if (raw === undefined) return undefined;
  if (typeof raw !== 'string' || raw.trim().length === 0) {
    throw new InvalidOptionsError('fontFormat must be a non-empty string when provided');
  }
  const trimmed = raw.trim();
  // CSS format hint tokens: lowercase alphanumeric plus hyphen. Keep permissive.
  if (!/^[a-z0-9-]+$/.test(trimmed.toLowerCase())) {
    throw new InvalidOptionsError(`Malformed fontFormat "${raw}"`);
  }
  return trimmed;
}

// ---------------------------------------------------------------------------
// Definition validation / normalization
// ---------------------------------------------------------------------------

/**
 * Validate and normalize a single `AssetTypeDefinition` into a frozen instance.
 * @throws {InvalidOptionsError} on malformed fields.
 */
export function normalizeDefinition(def: AssetTypeDefinition): AssetTypeDefinition {
  if (!def || typeof def !== 'object') {
    throw new InvalidOptionsError('Asset definition must be an object');
  }
  const kind = normalizeKind(def.kind);
  const mediaType = normalizeMediaType(def.mediaType);
  const fontFormat = normalizeFontFormat(def.fontFormat);

  if (!Array.isArray(def.extensions) || def.extensions.length === 0) {
    throw new InvalidOptionsError(`Definition for "${mediaType}" must have at least one extension`);
  }

  const normalizedExts: string[] = [];
  const seenInDef = new Set<string>();
  for (const ext of def.extensions) {
    const n = normalizeExtension(ext);
    if (seenInDef.has(n)) {
      throw new InvalidOptionsError(`Duplicate extension "${n}" within definition for "${mediaType}"`);
    }
    seenInDef.add(n);
    normalizedExts.push(n);
  }

  // Freeze extensions array deterministically sorted? Keep input order but frozen.
  // Duplicate detection across registry is handled by factory; within-definition sorted not required
  // but we keep deterministic order as provided (after normalization).
  const frozenExts = Object.freeze([...normalizedExts]) as readonly string[];

  const normalized: AssetTypeDefinition = Object.freeze({
    kind,
    extensions: frozenExts,
    mediaType,
    ...(fontFormat !== undefined ? { fontFormat } : {}),
  }) as AssetTypeDefinition;

  return normalized;
}

// ---------------------------------------------------------------------------
// Built-in definitions — covering all legacy extensions + AVIF and TTC
// Media types follow current IANA / RFC 8081 where applicable.
// ---------------------------------------------------------------------------

function def(
  kind: AssetKind,
  extensions: readonly string[],
  mediaType: string,
  fontFormat?: string,
): AssetTypeDefinition {
  return normalizeDefinition({ kind, extensions: [...extensions], mediaType, ...(fontFormat ? { fontFormat } : {}) });
}

// Fonts — current IANA types: font/ttf, font/otf, font/woff, font/woff2, font/collection, font/sfnt, application/vnd.ms-fontobject
const fontTtf = def('font', ['.ttf'], 'font/ttf', 'truetype');
const fontOtf = def('font', ['.otf'], 'font/otf', 'opentype');
const fontEot = def('font', ['.eot'], 'application/vnd.ms-fontobject', 'embedded-opentype');
const fontSfnt = def('font', ['.sfnt'], 'font/sfnt', 'sfnt');
const fontWoff = def('font', ['.woff'], 'font/woff', 'woff');
const fontWoff2 = def('font', ['.woff2'], 'font/woff2', 'woff2');
const fontTtc = def('font', ['.ttc'], 'font/collection', 'collection');

// SVG font — explicit only; NOT included in default built-ins to avoid .svg ambiguity.
// Media type remains image/svg+xml per IANA; kind distinguishes it as font.
export const svgFontDefinition: AssetTypeDefinition = def('font', ['.svg'], 'image/svg+xml', 'svg');

// Images — IANA types
const imageApng = def('image', ['.apng'], 'image/apng');
const imageBmp = def('image', ['.bmp'], 'image/bmp');
const imageGif = def('image', ['.gif'], 'image/gif');
// ico/cur share image/vnd.microsoft.icon (legacy used image/x-icon; modern IANA is vnd.microsoft.icon)
const imageIcon = def('image', ['.ico', '.cur'], 'image/vnd.microsoft.icon');
const imageJpeg = def('image', ['.jpg', '.jpeg', '.jfif', '.pjpeg', '.pjp'], 'image/jpeg');
const imagePng = def('image', ['.png'], 'image/png');
const imageSvg = def('image', ['.svg'], 'image/svg+xml');
const imageTiff = def('image', ['.tif', '.tiff'], 'image/tiff');
const imageWebp = def('image', ['.webp'], 'image/webp');
const imageAvif = def('image', ['.avif'], 'image/avif');

/**
 * Immutable built-in definitions for the default registry.
 * `.svg` defaults to image semantics; font SVG must be requested explicitly via `svgFontDefinition`.
 */
export const builtInDefinitions: readonly AssetTypeDefinition[] = Object.freeze([
  // Images first (deterministic order)
  imageApng,
  imageBmp,
  imageGif,
  imageIcon,
  imageJpeg,
  imagePng,
  imageSvg,
  imageTiff,
  imageWebp,
  imageAvif,
  // Fonts
  fontTtf,
  fontOtf,
  fontEot,
  fontSfnt,
  fontWoff,
  fontWoff2,
  fontTtc,
]);

// ---------------------------------------------------------------------------
// Registry
// ---------------------------------------------------------------------------

export interface AssetDefinitionRegistry {
  /** Frozen definitions in deterministic input order. */
  readonly definitions: readonly AssetTypeDefinition[];
  /** Resolve an extension (case-insensitive, with or without dot) to its definition. */
  readonly get: (extension: string) => AssetTypeDefinition | undefined;
  /** Whether the registry contains the extension. */
  readonly has: (extension: string) => boolean;
  /** Normalized extension keys (lowercase with dot). */
  readonly extensions: readonly string[];
}

/**
 * Create an immutable registry from a definition list.
 *
 * - Normalizes each definition once (extensions lowercased, mediaType canonicalized).
 * - Rejects empty, malformed, or duplicate extensions.
 * - Returns a frozen snapshot; callers may pass `builtInDefinitions` plus custom entries
 *   or a fully custom list. No global singleton is mutated.
 *
 * @param definitions - definitions to register. Defaults to `builtInDefinitions` when omitted.
 * @throws {InvalidOptionsError} on malformed definitions.
 * @throws {AmbiguousDefinitionError} when two definitions claim the same extension.
 */
export function createDefinitionRegistry(
  definitions: readonly AssetTypeDefinition[] = builtInDefinitions,
): AssetDefinitionRegistry {
  if (!Array.isArray(definitions)) {
    throw new InvalidOptionsError('Definitions must be an array');
  }
  if (definitions.length === 0) {
    throw new InvalidOptionsError('Definitions must not be empty');
  }

  const normalizedDefs: AssetTypeDefinition[] = [];
  const extMap = new Map<string, AssetTypeDefinition>();
  const extToMedia = new Map<string, string[]>();

  for (const raw of definitions) {
    const defNorm = normalizeDefinition(raw as AssetTypeDefinition);
    normalizedDefs.push(defNorm);
    for (const ext of defNorm.extensions) {
      if (extMap.has(ext)) {
        const existing = extMap.get(ext)!;
        void [existing.mediaType, defNorm.mediaType];
        // Collect all conflicting media types for diagnostics.
        const allForExt = extToMedia.get(ext) ?? [existing.mediaType];
        if (!allForExt.includes(defNorm.mediaType)) allForExt.push(defNorm.mediaType);
        extToMedia.set(ext, allForExt);
        throw new AmbiguousDefinitionError(
          `Duplicate extension "${ext}" — "${existing.mediaType}" and "${defNorm.mediaType}" both claim it. Provide an explicit disambiguation rule or omit one definition.`,
          { extension: ext, conflictingMediaTypes: Object.freeze([...allForExt]) },
        );
      }
      extMap.set(ext, defNorm);
      extToMedia.set(ext, [defNorm.mediaType]);
    }
  }

  const frozenDefs = Object.freeze([...normalizedDefs]) as readonly AssetTypeDefinition[];
  const frozenExts = Object.freeze([...extMap.keys()]) as readonly string[];

  const registry: AssetDefinitionRegistry = Object.freeze({
    definitions: frozenDefs,
    extensions: frozenExts,
    get(extension: string): AssetTypeDefinition | undefined {
      const norm = normalizeExtension(extension);
      return extMap.get(norm);
    },
    has(extension: string): boolean {
      try {
        const norm = normalizeExtension(extension);
        return extMap.has(norm);
      } catch {
        return false;
      }
    },
  });

  return registry;
}

/**
 * Convenience: resolve an extension against a registry or the built-ins.
 * Case-insensitive; accepts with or without leading dot and any casing.
 * Returns undefined when not found.
 */
export function resolveExtension(
  extension: string,
  registry: AssetDefinitionRegistry = createDefinitionRegistry(),
): AssetTypeDefinition | undefined {
  return registry.get(extension);
}

/**
 * Create a registry that explicitly treats `.svg` as a font (instead of image).
 * Useful for the legacy SVG-font case where callers set `kind: 'font'` or
 * provide `fontFormat: 'svg'`. The returned registry replaces the image SVG
 * entry with the font SVG entry so that duplicate detection does not fire.
 */
export function createSvgFontRegistry(extraDefinitions: readonly AssetTypeDefinition[] = []): AssetDefinitionRegistry {
  // Build list: all built-ins without the image SVG, plus font SVG, plus extras.
  const withoutImageSvg = builtInDefinitions.filter((d) => !(d.kind === 'image' && d.extensions.includes('.svg')));
  const combined = [...withoutImageSvg, svgFontDefinition, ...extraDefinitions];
  return createDefinitionRegistry(combined);
}
