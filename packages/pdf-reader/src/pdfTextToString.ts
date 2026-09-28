import type { PdfTextContent } from './types';

/**
 * Assemble already-extracted PDF.js text in supplied item order, without mutation.
 *
 * Preserves each string verbatim, including whitespace and Unicode. Appends one
 * `\n` after each text item with `hasEOL: true`, even an empty or final item;
 * existing newlines are not deduplicated and trailing whitespace is not trimmed.
 * Marked-content entries are skipped. XFA-style string items without `hasEOL`
 * contribute their string only. Empty or marker-only content returns `''`.
 *
 * No spaces are guessed between fragments. This is not OCR, layout/reading-order
 * reconstruction, or streaming extraction; PDF.js has already materialized the
 * content (and may have normalized its text). The helper allocates a new string
 * and applies no resource limits of its own. Display untrusted text via
 * `textContent`, not HTML.
 *
 * @param content - Raw page text, such as `PageResult.text` when present.
 * @returns Concatenated text with explicit PDF.js end-of-line markers honored.
 * @example
 * ```ts
 * import { pdfTextToString } from '@web-ts-toolkit/pdf-reader';
 *
 * if (page.text) output.textContent = pdfTextToString(page.text);
 * ```
 */
export function pdfTextToString(content: PdfTextContent): string {
  const fragments: string[] = [];
  for (const item of content.items) {
    if (!('str' in item)) continue;
    fragments.push(item.str);
    if (item.hasEOL === true) fragments.push('\n');
  }
  return fragments.join('');
}
