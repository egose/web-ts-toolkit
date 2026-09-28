import { afterEach, describe, expect, it, vi } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import * as parse5 from 'parse5';
import * as api from '../src/index.ts';

vi.mock('parse5', async (original) => ({ ...(await original<typeof import('parse5')>()) }));

const catalog = api.createAssetCatalogSync([{ filename: 'a.png', data: new Uint8Array([1, 2, 3]) }]);
const options = { catalog, allowBasenameMatch: true };
const divs = (depth: number, inner = '') => '<div>'.repeat(depth) + inner + '</div>'.repeat(depth);
const templates = (depth: number) => '<template>'.repeat(depth) + '</template>'.repeat(depth);
const functions = (depth: number, inner = 'x') => 'f('.repeat(depth) + inner + ')'.repeat(depth);
const blocks = (depth: number, inner = '') => '@media all{'.repeat(depth) + inner + '}'.repeat(depth);
const cssFunctions = (depth: number) => `a{--x:${functions(depth - 1)}}`;
const documentPath = path.resolve('syntax-depth.html');

function expectLimit(run: () => unknown, limit: number, filePath?: string) {
  let error: unknown;
  try {
    run();
  } catch (caught) {
    error = caught;
  }
  expect(error).toBeInstanceOf(api.ResourceLimitError);
  expect(error).toMatchObject({
    code: 'RESOURCE_LIMIT',
    limit,
    actual: limit + 1,
    ...(filePath ? { path: filePath } : {}),
  });
  expect((error as Error).message).toContain('maxSyntaxDepth');
}

afterEach(() => vi.restoreAllMocks());

describe('AIR-04 syntax depth boundaries', () => {
  it.each([4, 256, 512])('HTML exact %i and one-over, with and without replacements', (maxSyntaxDepth) => {
    const opts = { ...options, maxSyntaxDepth, documentPath };
    const plain = divs(maxSyntaxDepth, 'text');
    expect(api.inlineHtml(plain, opts)).toMatchObject({ content: plain, modified: false });
    expect(api.inlineHtml(divs(maxSyntaxDepth - 1, '<img src=a.png>'), opts).replacements).toHaveLength(1);
    expectLimit(() => api.inlineHtml(divs(maxSyntaxDepth + 1), opts), maxSyntaxDepth, documentPath);
    expectLimit(() => api.inlineHtml(divs(maxSyntaxDepth, '<img src=a.png>'), opts), maxSyntaxDepth);
  });

  it.each([4, 256, 512])('CSS exact %i and one-over for functions, blocks and mixed nesting', (maxSyntaxDepth) => {
    const opts = { ...options, maxSyntaxDepth };
    for (const input of [
      cssFunctions(maxSyntaxDepth),
      blocks(maxSyntaxDepth),
      `${blocks(maxSyntaxDepth - 1, 'a{color:red}')}`,
    ]) {
      expect(api.inlineCss(input, opts)).toMatchObject({ content: input, modified: false });
    }
    const withUrl = `a{background:${functions(maxSyntaxDepth - 2, 'url(a.png)')}}`;
    expect(api.inlineCss(withUrl, opts).replacements).toHaveLength(1);
    const nestedBlocks = blocks(maxSyntaxDepth - 2, 'a{background:url(a.png)}');
    expect(api.inlineCss(nestedBlocks, opts).replacements).toHaveLength(1);
    for (const input of [
      cssFunctions(maxSyntaxDepth + 1),
      blocks(maxSyntaxDepth + 1),
      blocks(maxSyntaxDepth, 'a{color:red}'),
    ]) {
      expectLimit(() => api.inlineCss(input, opts), maxSyntaxDepth);
    }
  });

  it.each([
    ['divs', divs(8000)],
    ['templates', templates(8000)],
    ['unclosed templates (parser EOF recovery)', '<template>'.repeat(8000)],
    ['unclosed document templates', '<!doctype html>' + '<template>'.repeat(8000)],
  ])('small 8000-depth HTML %s uses the default cap', (_name, input) => {
    expect(Buffer.byteLength(input)).toBeLessThan(api.DEFAULT_MAX_TARGET_BYTES);
    expectLimit(() => api.inlineHtml(input, options), 256);
  });

  it.each([
    ['functions without references', cssFunctions(8000)],
    ['functions with references', `a{background:${functions(8000, 'url(a.png)')}}`],
    ['blocks', blocks(8000)],
    ['unclosed blocks', '@media all{'.repeat(8000)],
  ])('small 8000-depth CSS %s uses the default cap', (_name, input) => {
    expect(Buffer.byteLength(input)).toBeLessThan(api.DEFAULT_MAX_TARGET_BYTES);
    expectLimit(() => api.inlineCss(input, options), 256);
  });

  it('counts parser-inserted HTML elements, but not text, comments or document/fragment roots', () => {
    const html = '<!doctype html>' + divs(2, 'text<!--comment-->'); // html + body + two divs
    expect(api.inlineHtml(html, { ...options, maxSyntaxDepth: 4 }).content).toBe(html);
    expectLimit(() => api.inlineHtml(html, { ...options, maxSyntaxDepth: 3 }), 3);
    expect(api.inlineHtml('text<!--comment--><br><img>', { ...options, maxSyntaxDepth: 1 }).modified).toBe(false);
  });

  it.each([4, 256, 512])('includes template content before full-tree serialization at %i', (maxSyntaxDepth) => {
    const parse = parse5.parseFragment;
    const serialize = vi.spyOn(parse5, 'serialize');
    vi.spyOn(parse5, 'parseFragment').mockImplementation((...args) => {
      const tree = parse(...args);
      tree.childNodes[0]!.sourceCodeLocation = undefined; // img patch forces serialization
      return tree;
    });
    for (const nested of [templates(maxSyntaxDepth), divs(maxSyntaxDepth)]) {
      const html = '<img src=a.png>' + nested;
      expect(api.inlineHtml(html, { ...options, maxSyntaxDepth }).replacements).toHaveLength(1);
    }
    expect(serialize).toHaveBeenCalledTimes(2);
    expectLimit(
      () => api.inlineHtml('<img src=a.png>' + templates(maxSyntaxDepth + 1), { ...options, maxSyntaxDepth }),
      maxSyntaxDepth,
    );
    expect(serialize).toHaveBeenCalledTimes(2);
  });

  it.each([4, 256, 512])('bounds unclosed-template parser recovery at exact %i and one-over', (maxSyntaxDepth) => {
    const input = '<template>'.repeat(maxSyntaxDepth);
    expect(api.inlineHtml(input, { ...options, maxSyntaxDepth }).content).toBe(input);
    expectLimit(() => api.inlineHtml(input + '<template>', { ...options, maxSyntaxDepth }), maxSyntaxDepth);
  });

  it('ignores HTML attribute quotes/comments/raw text and CSS strings/comments/escapes', () => {
    const fakeTags = '<div>'.repeat(8000);
    const html = `<div title='${fakeTags}'><!--${fakeTags}--><script>${fakeTags}</script></div>`;
    expect(api.inlineHtml(html, { ...options, maxSyntaxDepth: 2 }).content).toBe(html);
    const fakeCss = '({['.repeat(8000);
    const css = `a{content:"${fakeCss}\\"${fakeCss}";--x:'${fakeCss}';/*${fakeCss}*/--escaped:${'\\('.repeat(8000)}}`;
    expect(api.inlineCss(css, { ...options, maxSyntaxDepth: 1 }).content).toBe(css);
  });

  it('bounds selectors, at-rule parameters and custom-property bracket/brace groups without URLs', () => {
    for (const input of [
      `${':is('.repeat(5)}a${')'.repeat(5)}{}`,
      `@supports ${functions(5)} {}`,
      `a{--x:${'['.repeat(4)}x${']'.repeat(4)}}`,
      `a{--x:${'{'.repeat(4)}x${'}'.repeat(4)}}`,
    ])
      expectLimit(() => api.inlineCss(input, { ...options, maxSyntaxDepth: 4 }), 4);
  });
});

describe('AIR-04 embedded CSS depth', () => {
  const wrappers = [
    (css: string) => `<style>${css}</style>`,
    (css: string) => `<div style="${css}"></div>`,
    (css: string) => `<div style="${css};--decoder:&lpar;"></div>`,
    (css: string) => `<template><style>${css}</style></template>`,
  ];
  it.each(wrappers)('bounds no-reference chunks, including decoded fallback and inert templates (%#)', (wrap) => {
    const opts = { ...options, inlineEmbeddedCss: true, maxSyntaxDepth: 4, documentPath };
    const input = wrap(cssFunctions(4));
    expect(api.inlineHtml(input, opts).content).toBe(input);
    expectLimit(() => api.inlineHtml(wrap(cssFunctions(5)), opts), 4, documentPath);
    expectLimit(() => api.inlineHtml(wrap(cssFunctions(8000)), { ...opts, maxSyntaxDepth: undefined }), 256);
    expect(api.inlineHtml(wrap(cssFunctions(8000)), options).modified).toBe(false);
  });

  it('checks decoded CSS even when source locations are missing', () => {
    const parse = parse5.parseFragment;
    vi.spyOn(parse5, 'parseFragment').mockImplementationOnce((...args) => {
      const tree = parse(...args);
      tree.childNodes[0]!.sourceCodeLocation = undefined;
      return tree;
    });
    expectLimit(
      () =>
        api.inlineHtml('<div style="--x:f&#40;f&#40;f&#40;x)))"></div>', {
          ...options,
          inlineEmbeddedCss: true,
          maxSyntaxDepth: 2,
        }),
      2,
    );
  });

  it.each([4, 512])('forwards the bound through both style transform paths at %i', (maxSyntaxDepth) => {
    for (const html of [
      `<style>a{background:${functions(maxSyntaxDepth - 2, 'url(a.png)')}}</style>`,
      `<div style="background:${functions(maxSyntaxDepth - 1, 'url(a.png)')}"></div>`,
      `<div style="background:${functions(maxSyntaxDepth - 1, 'url(a.png)')};--decoder:&copy;"></div>`,
    ]) {
      const opts = { ...options, inlineEmbeddedCss: true, maxSyntaxDepth };
      expect(api.inlineHtml(html, opts).replacements).toHaveLength(1);
      expectLimit(() => api.inlineHtml(html, { ...opts, maxSyntaxDepth: maxSyntaxDepth - 1 }), maxSyntaxDepth - 1);
    }
  });
});

describe('AIR-04 public policy and file forwarding', () => {
  it('exports finite normalized syntax policy independently of filesystem maxDepth', () => {
    expect(api.DEFAULT_MAX_SYNTAX_DEPTH).toBe(256);
    expect(api.MAX_REASONABLE_MAX_SYNTAX_DEPTH).toBe(512);
    expect(api.DEFAULT_POLICY.maxSyntaxDepth).toBe(256);
    expect(api.normalizePolicy({ maxDepth: 1 }).maxSyntaxDepth).toBe(256);
    expect(api.normalizePolicy({ maxSyntaxDepth: 512 }).maxSyntaxDepth).toBe(512);
    expect(Object.isFrozen(api.normalizePolicy())).toBe(true);
  });

  it.each([0, -1, 1.5, NaN, Infinity, 513, Number.MAX_SAFE_INTEGER + 1, '4', null])(
    'rejects invalid maxSyntaxDepth %s at every entry',
    async (value) => {
      const maxSyntaxDepth = value as number;
      expect(() => api.normalizePolicy({ maxSyntaxDepth })).toThrow(api.InvalidOptionsError);
      expect(() => api.inlineHtml('', { ...options, maxSyntaxDepth })).toThrow(api.InvalidOptionsError);
      expect(() => api.inlineCss('', { ...options, maxSyntaxDepth })).toThrow(api.InvalidOptionsError);
      const opts = { catalog, targets: path.resolve('_tmp-air04/nonexistent.html'), maxSyntaxDepth };
      expect(() => api.inlineFilesSync(opts)).toThrow(api.InvalidOptionsError);
      await expect(api.inlineFiles(opts)).rejects.toBeInstanceOf(api.InvalidOptionsError);
    },
  );

  for (const [mode, run] of [
    ['async', api.inlineFiles],
    ['sync', api.inlineFilesSync],
  ] as const) {
    it(`${mode}: no writes on syntax failure; exact-bound sibling targets still write`, async () => {
      const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'asset-inliner-depth-'));
      try {
        const inputs = new Map([
          ['bad.html', '<img src=a.png>' + divs(5)],
          ['bad.css', 'a{background:url(a.png)}' + cssFunctions(5)],
          ['embedded.html', `<img src=a.png><style>${cssFunctions(5)}</style>`],
          ['no-ref.html', templates(8000)],
          ['divs.html', divs(8000, '<img src=a.png>')],
          ['unclosed.html', '<template>'.repeat(8000)],
          ['no-ref.css', cssFunctions(8000)],
          ['good.html', divs(3, '<img src=a.png>')],
          ['good.css', `a{background:${functions(2, 'url(a.png)')}}`],
        ]);
        for (const [name, input] of inputs) fs.writeFileSync(path.join(tmp, name), input);
        const results = await run({
          ...options,
          targets: [...inputs.keys()].map((name) => path.join(tmp, name)),
          write: true,
          inlineEmbeddedCss: true,
          maxSyntaxDepth: 4,
          maxDepth: 1,
        });
        expect(results).toHaveLength(inputs.size);
        for (const result of results) {
          const name = path.basename(result.filePath);
          if (name.startsWith('good')) {
            expect(result.written).toBe(true);
            expect(result.replacements).toHaveLength(1);
            expect(fs.readFileSync(result.filePath, 'utf8')).toBe(result.content);
          } else {
            expect(result).toMatchObject({ content: '', written: false, modified: false, replacements: [] });
            expect(result.diagnostics).toContainEqual(
              expect.objectContaining({ code: 'RESOURCE_LIMIT', filePath: result.filePath }),
            );
            expect(fs.readFileSync(result.filePath, 'utf8')).toBe(inputs.get(name));
          }
        }
        expect(fs.readdirSync(tmp).sort()).toEqual([...inputs.keys()].sort());
      } finally {
        fs.rmSync(tmp, { recursive: true, force: true });
      }
    });
  }
});
