/** A complete URL token in decoded attribute space; end is exclusive. */
type SrcsetCandidate = { url: string; urlStart: number; urlEnd: number };

function isSpace(ch: string): boolean {
  return ch === ' ' || ch === '\t' || ch === '\n' || ch === '\f' || ch === '\r';
}

/** Descriptor validation from HTML's "parse a srcset attribute" algorithm. */
function validDescriptors(descriptors: string[]): boolean {
  let width = false;
  let density = false;
  let height = false;
  for (const descriptor of descriptors) {
    const value = descriptor.slice(0, -1);
    const suffix = descriptor.slice(-1);
    if (suffix === 'w' && /^[0-9]+$/.test(value) && Number(value) > 0) {
      if (width || density) return false;
      width = true;
    } else if (
      suffix === 'x' &&
      /^-?(?:[0-9]+(?:\.[0-9]+)?|\.[0-9]+)(?:[eE][+-]?[0-9]+)?$/.test(value) &&
      Number.isFinite(Number(value)) &&
      Number(value) >= 0
    ) {
      if (width || density || height) return false;
      density = true;
    } else if (suffix === 'h' && /^[0-9]+$/.test(value) && Number(value) > 0) {
      if (height || density) return false;
      height = true;
    } else {
      return false;
    }
  }
  return !height || width;
}

/**
 * HTML srcset URL/descriptor states, independent of URL scheme. Interior
 * commas belong to the URL; only trailing URL commas or commas outside the
 * descriptor-parentheses state delimit candidates. Invalid descriptors are
 * consumed completely and omitted, so callers never resolve their fragments.
 * https://html.spec.whatwg.org/multipage/images.html#parse-a-srcset-attribute
 */
export function tokenizeSrcset(input: string): SrcsetCandidate[] {
  const candidates: SrcsetCandidate[] = [];
  let pos = 0;
  while (pos < input.length) {
    while (pos < input.length && (isSpace(input[pos]!) || input[pos] === ',')) pos++;
    if (pos === input.length) break;
    const urlStart = pos;
    while (pos < input.length && !isSpace(input[pos]!)) pos++;
    let urlEnd = pos;
    const descriptors: string[] = [];
    if (input[urlEnd - 1] === ',') {
      while (input[urlEnd - 1] === ',') urlEnd--;
    } else {
      let descriptor = '';
      let state: 'descriptor' | 'parentheses' | 'after' = 'descriptor';
      while (pos < input.length) {
        const ch = input[pos++]!;
        if (state === 'parentheses') {
          descriptor += ch;
          if (ch === ')') state = 'descriptor';
        } else if (ch === ',') {
          break;
        } else if (isSpace(ch)) {
          if (descriptor) descriptors.push(descriptor);
          descriptor = '';
          state = 'after';
        } else {
          descriptor += ch;
          state = ch === '(' ? 'parentheses' : 'descriptor';
        }
      }
      if (descriptor) descriptors.push(descriptor);
    }
    if (validDescriptors(descriptors)) {
      candidates.push({ url: input.slice(urlStart, urlEnd), urlStart, urlEnd });
    }
  }
  return candidates;
}
