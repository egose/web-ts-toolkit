/** Internal HTML base selection and filesystem mapping. Never rewrites the base. */
import path from 'node:path';
import { decodeUrlPath, stripQueryAndFragment, resolveLogicalPathToAbsolute } from './resolve.ts';
import type { HtmlResolutionContext } from './resolve.ts';

interface BaseNode {
  tagName?: string;
  namespaceURI?: string;
  attrs?: { name: string; value: string }[];
  childNodes?: BaseNode[];
}

/** Tree order, HTML namespace only; template content is a separate inert tree. */
export function findHtmlBase(node: BaseNode): string | undefined {
  const stack = [node];
  while (stack.length) {
    const current = stack.pop()!;
    if (current.tagName === 'base' && current.namespaceURI === 'http://www.w3.org/1999/xhtml') {
      const href = current.attrs?.find((attr) => attr.name === 'href');
      if (href) return href.value; // parse5 has already entity-decoded exactly once
    }
    const children = current.childNodes ?? [];
    for (let i = children.length - 1; i >= 0; i--) stack.push(children[i]!);
  }
  return undefined;
}

export function mapHtmlBase(
  href: string,
  options: { documentPath?: string; rootDir?: string },
): Omit<HtmlResolutionContext, 'diagnostics'> {
  const fallbackDir = options.documentPath
    ? path.dirname(path.resolve(options.documentPath))
    : path.resolve(options.rootDir ?? process.cwd());
  // URL preprocessing: trim C0/space at the edges and remove ASCII tabs/newlines.
  // eslint-disable-next-line no-control-regex -- WHATWG URL preprocessing explicitly includes C0 controls.
  const value = href.replace(/^[\u0000-\u0020]+|[\u0000-\u0020]+$/g, '').replace(/[\t\n\r]/g, '');
  // HTML forbids these base schemes; the first href still wins, using fallback.
  if (/^(?:data|javascript):/i.test(value)) return { baseDir: fallbackDir };
  const slashes = value.replace(/\\/g, '/');
  if (slashes.startsWith('//') || /^[a-z][a-z0-9+.-]*:/i.test(value)) {
    return { unmappableReason: `HTML base ${JSON.stringify(href)} is remote or has no supported filesystem mapping` };
  }
  try {
    const decoded = decodeUrlPath(stripQueryAndFragment(slashes)).replace(/\\/g, '/');
    if (decoded === '') return { baseDir: fallbackDir };
    // A trailing slash or dot segment denotes a directory; other last segments
    // denote a document. Append a sentinel only for path arithmetic, never as a
    // document identity, resolver input, or diagnostic path.
    const directory = /(?:\/|^\.{1,2}|\/\.{1,2})$/.test(decoded);
    const mapped = resolveLogicalPathToAbsolute(directory ? `${decoded}/.html-base` : decoded, options);
    return { baseDir: path.dirname(mapped) };
  } catch (err) {
    return {
      unmappableReason: `HTML base ${JSON.stringify(href)} cannot be mapped: ${err instanceof Error ? err.message : String(err)}`,
    };
  }
}
