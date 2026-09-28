/** Internal, iterative guards. Never use a recursive walk to preflight a tree. */
import { ResourceLimitError } from './errors.ts';
import { defaultTreeAdapter } from 'parse5';
import type { DefaultTreeAdapterMap } from 'parse5';

function checkDepth(depth: number, limit: number, path?: string): void {
  if (depth > limit) {
    throw new ResourceLimitError(`Syntax depth ${depth} exceeds maxSyntaxDepth ${limit}`, {
      limit,
      actual: depth,
      path,
    });
  }
}

/**
 * Lexical CSS bound, before PostCSS/value parsing and any no-url fast path.
 * Counts mixed blocks/parentheses/brackets; only matching closers pop the stack.
 * Strings, comments and escaped characters cannot create structural nesting.
 * This deliberately also bounds malformed/unclosed delimiter groups.
 */
export function assertCssSyntaxDepth(css: string, limit: number, path?: string): void {
  const closers: string[] = [];
  let quote = '';
  for (let i = 0; i < css.length; i++) {
    const ch = css[i]!;
    if (ch === '\\') {
      i++; // escaped punctuation (hex escape digits are not delimiters)
    } else if (quote) {
      if (ch === quote) quote = '';
    } else if (ch === '"' || ch === "'") {
      quote = ch;
    } else if (ch === '/' && css[i + 1] === '*') {
      const end = css.indexOf('*/', i + 2);
      if (end === -1) return; // remaining text is an unclosed comment
      i = end + 1;
    } else if (ch === '{' || ch === '(' || ch === '[') {
      closers.push(ch === '{' ? '}' : ch === '(' ? ')' : ']');
      checkDepth(closers.length, limit, path);
    } else if (ch === closers[closers.length - 1]) {
      closers.pop();
    }
  }
}

interface CssNode {
  type: string;
  nodes?: readonly CssNode[];
}

/** Verify actual parser containers too, before their walk/stringify methods. */
export function assertCssTreeDepth(root: CssNode, limit: number, path?: string): void {
  const stack = [{ node: root, depth: 0 }];
  while (stack.length) {
    const { node, depth } = stack.pop()!;
    const nextDepth = depth + (node.type !== 'root' && node.nodes ? 1 : 0);
    checkDepth(nextDepth, limit, path);
    if (node.nodes) {
      for (const child of node.nodes) stack.push({ node: child, depth: nextDepth });
    }
  }
}

interface HtmlNode {
  nodeName: string;
  tagName?: string;
  attrs?: readonly { name: string; value: string }[];
  childNodes?: readonly HtmlNode[];
  content?: HtmlNode;
  value?: string;
}

/**
 * Guard parse5 insertions as well: EOF recovery for unclosed templates recurses
 * before parse() returns. Follow actual parents iteratively, linking otherwise
 * parentless template fragments to their hosts. Never recursively inspect an
 * attacker-controlled subtree. The final tree check also covers parser moves.
 */
export function boundedHtmlTreeAdapter(limit: number, isDocument: boolean, path?: string): typeof defaultTreeAdapter {
  type Node = DefaultTreeAdapterMap['node'];
  const templateParents = new WeakMap<Node, Node>();
  let fragmentRoot: Node | undefined;
  const checkInsertion = (parent: Node, child: Node): void => {
    // parse5's first fragment insertion is its temporary html root; neither it
    // nor its mock document is part of the returned fragment's element depth.
    if (!isDocument && fragmentRoot === undefined) {
      fragmentRoot = child;
      return;
    }
    let depth = defaultTreeAdapter.isElementNode(child) ? 1 : 0;
    checkDepth(depth, limit, path);
    let current: Node | null | undefined = parent;
    while (current && current !== fragmentRoot) {
      if (defaultTreeAdapter.isElementNode(current)) checkDepth(++depth, limit, path);
      current = templateParents.get(current) ?? ('parentNode' in current ? current.parentNode : undefined);
    }
  };
  return {
    ...defaultTreeAdapter,
    appendChild(parent, child) {
      checkInsertion(parent, child);
      defaultTreeAdapter.appendChild(parent, child);
    },
    insertBefore(parent, child, reference) {
      checkInsertion(parent, child);
      defaultTreeAdapter.insertBefore(parent, child, reference);
    },
    setTemplateContent(template, content) {
      templateParents.set(content, template);
      defaultTreeAdapter.setTemplateContent(template, content);
    },
  };
}

/**
 * Check the completed tree before any recursive consumer,
 * including templates that normal inlining skips but parse5.serialize visits.
 * Template fragments are transparent; implied html/head/body elements count.
 */
export function assertHtmlSyntaxDepth(root: HtmlNode, limit: number, embeddedCss: boolean, path?: string): void {
  const stack = [{ node: root, depth: 0 }];
  while (stack.length) {
    const { node, depth } = stack.pop()!;
    const nextDepth = depth + (node.tagName ? 1 : 0);
    checkDepth(nextDepth, limit, path);
    if (embeddedCss) {
      for (const attr of node.attrs ?? []) {
        if (attr.name === 'style') assertCssSyntaxDepth(attr.value, limit, path);
      }
      if (node.tagName === 'style') {
        for (const child of node.childNodes ?? []) {
          if (child.nodeName === '#text') assertCssSyntaxDepth(child.value ?? '', limit, path);
        }
      }
    }
    if (node.content) stack.push({ node: node.content, depth: nextDepth });
    for (const child of node.childNodes ?? []) stack.push({ node: child, depth: nextDepth });
  }
}
