/**
 * Detection module — internal async detector wrapping `file-type`.
 *
 * Keeps `file-type` behind a small internal interface so it can be stubbed in tests
 * or replaced later. Provides `extension` / `content` / `verify` resolution helpers.
 *
 * - `extension`: deterministic registry lookup (sync+async), supports text formats like SVG.
 * - `content`: async-only, uses detector to identify binary types when filename absent.
 * - `verify`: async-only, compares detected metadata with explicit/extension expected.
 */

import type { AssetKind } from './types.ts';
import type { AssetDefinitionRegistry } from './definitions.ts';
import { UnsupportedAssetError, DetectionMismatchError } from './errors.ts';
import { normalizeMediaType } from './definitions.ts';
import path from 'node:path';

// ---------------------------------------------------------------------------
// Detector abstraction
// ---------------------------------------------------------------------------

export interface DetectorResult {
  readonly ext: string;
  readonly mime: string;
}

export interface AssetDetector {
  /**
   * Detect file type from bytes. Returns undefined when no match.
   * Should honor AbortSignal where possible and bound input size.
   */
  detect(bytes: Uint8Array, signal?: AbortSignal): Promise<DetectorResult | undefined>;
}

/**
 * Default detector using `file-type`. Bounds input to 4100 bytes per docs
 * (readChunk length 4100) to avoid unbounded reads on untrusted files.
 */
export const defaultDetector: AssetDetector = {
  async detect(bytes: Uint8Array, signal?: AbortSignal): Promise<DetectorResult | undefined> {
    assertNotAborted(signal);
    const chunk = bytes.length > 4100 ? bytes.subarray(0, 4100) : bytes;
    assertNotAborted(signal);
    const { fileTypeFromBuffer } = await import('file-type');
    assertNotAborted(signal);
    const result = await fileTypeFromBuffer(chunk);
    assertNotAborted(signal);
    return result ? { ext: result.ext, mime: result.mime } : undefined;
  },
};

let currentDetector: AssetDetector = defaultDetector;

export function getDetector(): AssetDetector {
  return currentDetector;
}

export function setDetector(detector: AssetDetector | undefined): void {
  currentDetector = detector ?? defaultDetector;
}

export function resetDetector(): void {
  currentDetector = defaultDetector;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function assertNotAborted(signal?: AbortSignal): void {
  if (!signal) return;
  if (typeof signal.throwIfAborted === 'function') {
    signal.throwIfAborted();
  } else if (signal.aborted) {
    // Fallback for environments without throwIfAborted
    throw signal.reason ?? new DOMException('Aborted', 'AbortError');
  }
}

function extFromFilename(filename: string): string | undefined {
  const normalized = filename.replace(/\\/g, '/');
  const ext = path.posix.extname(normalized).toLowerCase();
  // Also fallback to path.extname for host-specific, but posix covers Windows style
  return ext || undefined;
}

function safeGet(registry: AssetDefinitionRegistry, ext: string) {
  try {
    return registry.get(ext);
  } catch {
    return undefined;
  }
}

export interface ResolvedMeta {
  readonly kind: AssetKind;
  readonly mediaType: string;
  readonly fontFormat?: string;
}

function freezeMeta(meta: ResolvedMeta): ResolvedMeta {
  return Object.freeze({ ...meta }) as ResolvedMeta;
}

function findDefinitionForDetected(
  result: DetectorResult,
  registry: AssetDefinitionRegistry,
): import('./types.ts').AssetTypeDefinition | undefined {
  // Try by ext first
  const extKey = `.${result.ext.toLowerCase()}`;
  const byExt = safeGet(registry, extKey);
  if (byExt) return byExt;
  // Fallback scan by mediaType
  let normalizedMime: string;
  try {
    normalizedMime = normalizeMediaType(result.mime);
  } catch {
    return undefined;
  }
  for (const def of registry.definitions) {
    if (def.mediaType === normalizedMime) return def;
  }
  return undefined;
}

// ---------------------------------------------------------------------------
// Extension-only resolution (sync+async)
// ---------------------------------------------------------------------------

export function resolveByExtension(opts: {
  filename?: string;
  explicitMediaType?: string;
  explicitKind?: AssetKind;
  explicitFontFormat?: string;
  registry: AssetDefinitionRegistry;
}): ResolvedMeta {
  const { filename, explicitMediaType, explicitKind, explicitFontFormat, registry } = opts;

  // Explicit mediaType wins
  if (explicitMediaType !== undefined) {
    const mediaType = normalizeMediaType(explicitMediaType);
    let kind: AssetKind | undefined = explicitKind;
    let fontFormat: string | undefined = explicitFontFormat;

    // Derive missing kind/fontFormat from registry via mediaType or filename
    const defByMedia = registry.definitions.find((d) => d.mediaType === mediaType);
    if (defByMedia) {
      kind ??= defByMedia.kind;
      fontFormat ??= defByMedia.fontFormat;
    } else if (filename) {
      const ext = extFromFilename(filename);
      if (ext) {
        const defByExt = safeGet(registry, ext);
        if (defByExt) {
          kind ??= defByExt.kind;
          fontFormat ??= defByExt.fontFormat;
        }
      }
    }

    if (kind === undefined) {
      if (mediaType.startsWith('font/') || mediaType === 'application/vnd.ms-fontobject') kind = 'font';
      else if (mediaType.startsWith('image/')) kind = 'image';
      else if (mediaType.startsWith('audio/')) kind = 'audio';
      else if (mediaType.startsWith('video/')) kind = 'video';
      else kind = 'image';
    }

    // Special SVG font heuristic when explicit kind font but image registry
    if (kind === 'font' && fontFormat === undefined && filename) {
      const ext = extFromFilename(filename);
      if (ext === '.svg') fontFormat = 'svg';
    }

    // Non-font must not carry fontFormat
    if (kind !== 'font') fontFormat = undefined;

    return freezeMeta({ kind: kind as AssetKind, mediaType, ...(fontFormat !== undefined ? { fontFormat } : {}) });
  }

  // No explicit mediaType -> need filename extension
  if (!filename) {
    throw new UnsupportedAssetError('Cannot determine asset type: no filename and no explicit mediaType', {
      path: filename,
    });
  }
  const ext = extFromFilename(filename);
  if (!ext) {
    throw new UnsupportedAssetError(`Cannot determine extension from filename "${filename}"`, {
      path: filename,
      extension: ext,
    });
  }
  const def = safeGet(registry, ext);
  if (!def) {
    throw new UnsupportedAssetError(`Unsupported asset extension "${ext}"`, {
      extension: ext,
      path: filename,
    });
  }
  const kind: AssetKind = explicitKind ?? def.kind;
  let fontFormat: string | undefined = explicitFontFormat ?? def.fontFormat;

  // SVG explicit font kind heuristic
  if (kind === 'font' && fontFormat === undefined && ext === '.svg') {
    fontFormat = 'svg';
  }
  if (kind !== 'font') fontFormat = undefined;

  return freezeMeta({
    kind,
    mediaType: def.mediaType,
    ...(fontFormat !== undefined ? { fontFormat } : {}),
  });
}

// ---------------------------------------------------------------------------
// Async resolution with detector
// ---------------------------------------------------------------------------

export async function resolveWithDetector(opts: {
  bytes: Uint8Array;
  filename?: string;
  explicitMediaType?: string;
  explicitKind?: AssetKind;
  explicitFontFormat?: string;
  registry: AssetDefinitionRegistry;
  detection: 'content' | 'verify';
  detector?: AssetDetector;
  signal?: AbortSignal;
}): Promise<ResolvedMeta> {
  const {
    bytes,
    filename,
    explicitMediaType,
    explicitKind,
    explicitFontFormat,
    registry,
    detection,
    detector,
    signal,
  } = opts;
  assertNotAborted(signal);

  // For 'content', explicit mediaType wins without detection
  if (detection === 'content' && explicitMediaType !== undefined) {
    return resolveByExtension({ filename, explicitMediaType, explicitKind, explicitFontFormat, registry });
  }

  if (detection === 'verify') {
    // Expected via extension/explicit
    const expected = resolveByExtension({ filename, explicitMediaType, explicitKind, explicitFontFormat, registry });
    assertNotAborted(signal);
    const d = detector ?? getDetector();
    const detected = await d.detect(bytes, signal);
    assertNotAborted(signal);
    if (!detected) {
      // No detection for text formats like SVG - keep expected
      return expected;
    }
    const detectedDef = findDefinitionForDetected(detected, registry);
    // If detected type not in registry, treat as mismatch if explicit expected differs?
    // We map detected mime directly for comparison when registry lacks it
    let detectedMediaType: string;
    let mismatch: boolean;
    if (detectedDef) {
      detectedMediaType = detectedDef.mediaType;
      mismatch = detectedMediaType !== expected.mediaType;
    } else {
      try {
        detectedMediaType = normalizeMediaType(detected.mime);
      } catch {
        detectedMediaType = detected.mime.toLowerCase();
      }
      mismatch = detectedMediaType !== expected.mediaType;
      // Also check ext mismatch? Use mediaType as primary
    }
    if (mismatch) {
      throw new DetectionMismatchError(
        `Detection mismatch: expected "${expected.mediaType}" but detected "${detectedMediaType}"`,
        { expectedMediaType: expected.mediaType, detectedMediaType, path: filename },
      );
    }
    return expected;
  }

  // detection === 'content' without explicit mediaType: try detector first
  assertNotAborted(signal);
  const d = detector ?? getDetector();
  const detected = await d.detect(bytes, signal);
  assertNotAborted(signal);

  if (detected) {
    const def = findDefinitionForDetected(detected, registry);
    if (def) {
      // explicit kind/fontFormat still win if provided
      const kind: AssetKind = explicitKind ?? def.kind;
      let fontFormat: string | undefined = explicitFontFormat ?? def.fontFormat;
      if (kind === 'font' && fontFormat === undefined && def.extensions.includes('.svg')) {
        fontFormat = 'svg';
      }
      if (kind !== 'font') fontFormat = undefined;
      // If explicit mediaType absent, use def mediaType
      return freezeMeta({
        kind,
        mediaType: def.mediaType,
        ...(fontFormat !== undefined ? { fontFormat } : {}),
      });
    }
    // Detected but not in allowed registry -> unsupported
    throw new UnsupportedAssetError(
      `Detected file type "${detected.mime}" (.${detected.ext}) is not in allowed registry`,
      {
        mediaType: detected.mime,
        extension: `.${detected.ext}`,
        path: filename,
      },
    );
  }

  // Fallback to extension when detection yielded nothing (e.g., SVG text)
  return resolveByExtension({ filename, explicitMediaType, explicitKind, explicitFontFormat, registry });
}
