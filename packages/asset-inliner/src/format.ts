/**
 * Formatters — deterministic CSS wrappers for encoded assets.
 */

import type { EncodedAsset } from './types.ts';
import { InvalidOptionsError } from './errors.ts';

/**
 * Format a generic CSS `url(...)` value from an encoded asset.
 * Does not add `format(...)`.
 * Deterministic quoting: `url(<dataUrl>)` without extra quotes; escapes `)` if ever present.
 */
export function formatCssUrl(asset: EncodedAsset): string {
  if (!asset || typeof asset.dataUrl !== 'string' || asset.dataUrl.length === 0) {
    throw new InvalidOptionsError('formatCssUrl requires a valid EncodedAsset with dataUrl');
  }
  // Basic validation: dataUrl should start with data:
  if (!asset.dataUrl.startsWith('data:')) {
    throw new InvalidOptionsError(`Invalid dataUrl "${asset.dataUrl.slice(0, 30)}" — expected data: URL`);
  }
  // Escape parentheses/brackets in url value deterministically
  // Data URLs produced by encode never contain `)` or whitespace, but handle generically.
  const url = asset.dataUrl;
  // Escape ) and ( and quotes if present - CSS url() escaping via backslash
  // We deterministically escape only characters that would break parsing.
  if (url.includes(')') || url.includes('(') || url.includes('"') || url.includes("'") || url.includes(' ')) {
    // Use quoted form with double quotes and escape double quotes
    const escaped = url.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
    return `url("${escaped}")`;
  }
  return `url(${url})`;
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
  // Deterministic single-quoted format hint; escape single quotes and backslashes
  const raw = asset.fontFormat.trim();
  const escaped = raw.replace(/\\/g, '\\\\').replace(/'/g, "\\'");
  return `${cssUrl} format('${escaped}')`;
}
