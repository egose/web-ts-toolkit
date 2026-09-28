/** Internal source-coordinate patch assembly; not part of the package exports. */
export type SourcePatch = { start: number; end: number; newValue: string };

/**
 * Apply nonempty, end-exclusive UTF-16 spans without slicing expanded output.
 * Returns null for invalid/overlapping spans so callers can serialize their tree.
 * Adjacent spans and empty replacement strings are valid; insertion spans are not.
 * The caller retains responsibility for projected and final output byte limits.
 */
export function assembleSourcePatches(content: string, patches: readonly SourcePatch[]): string | null {
  if (patches.length === 0) return content;
  const sorted = [...patches].sort((a, b) => a.start - b.start);
  let cursor = 0;
  // Validate every span before assembling, and never mutate the caller's list.
  for (const patch of sorted) {
    if (
      !Number.isSafeInteger(patch.start) ||
      !Number.isSafeInteger(patch.end) ||
      patch.start < cursor ||
      patch.end > content.length ||
      patch.start >= patch.end ||
      !Number.isSafeInteger(Buffer.byteLength(patch.newValue, 'utf8'))
    ) {
      return null;
    }
    cursor = patch.end;
  }
  const chunks: string[] = [];
  cursor = 0;
  for (const patch of sorted) {
    chunks.push(content.slice(cursor, patch.start), patch.newValue);
    cursor = patch.end;
  }
  chunks.push(content.slice(cursor));
  return chunks.join('');
}
