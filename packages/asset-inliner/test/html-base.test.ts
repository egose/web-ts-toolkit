import { describe, it, expect, vi, beforeAll, afterAll } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import * as parse5 from 'parse5';
import { createAssetCatalogSync } from '../src/catalog.ts';
import { inlineHtml } from '../src/html.ts';
import { inlineFiles, inlineFilesSync } from '../src/files.ts';
import type { AssetCatalog, AssetResolverSync } from '../src/types.ts';

vi.mock('parse5', async (importOriginal) => ({ ...(await importOriginal<typeof import('parse5')>()) }));

let rootDir: string;
let documentPath: string;
let catalog: AssetCatalog;
beforeAll(() => {
  rootDir = fs.mkdtempSync(path.join(os.tmpdir(), 'asset-inliner-base-'));
  const assets: string[] = [];
  for (const dir of ['a', 'b', 'é&x', 'encoded#?', 'percent%23', '']) {
    fs.mkdirSync(path.join(rootDir, dir), { recursive: true });
    for (const name of ['apple.png', 'apple,pear.png', 'hash#?.png']) {
      const file = path.join(rootDir, dir, name);
      fs.writeFileSync(file, `${dir}/${name}`);
      assets.push(file);
    }
  }
  catalog = createAssetCatalogSync(assets);
  documentPath = path.join(rootDir, 'b', 'page.html');
});
afterAll(() => fs.rmSync(rootDir, { recursive: true, force: true }));

const references = (url = 'apple.png') =>
  `<img src="${url}"><source src="${url}"><link rel=icon href="${url}"><video poster="${url}"></video><img srcset="${url} 1x"><source srcset="${url} 2x"><i style="background:url(${url})"></i><style>.x{background:URL(${url})}</style>`;
const options = () => ({ catalog, documentPath, rootDir, inlineEmbeddedCss: true });

describe('AIR-03: effective HTML base', () => {
  it.each(['../a/', '/a/', '../a/base.html?x#y', '../a/./', '../b/../a/'])(
    'maps local base %s across every supported path',
    (href) => {
      const html = `<base href="${href}">${references()}`;
      const result = inlineHtml(html, options());
      expect(result.replacements).toHaveLength(8);
      expect(result.replacements.every((r) => r.resolvedPath === path.join(rootDir, 'a/apple.png'))).toBe(true);
      expect(result.content).not.toContain(catalog.getByPath(path.join(rootDir, 'b/apple.png'))!.dataUrl);
      expect(result.content).toContain(`<base href="${href}">`);
      expect(result.diagnostics).toEqual([]);
    },
  );

  it.each([
    'https://example.test/assets/',
    '//example.test/assets/',
    'https&colon;//example.test/',
    '&#47;&#47;example.test/',
    'https:\\example.test/',
    '\\\\example.test/',
    'ht&#9;tps://example.test/',
    'file:///assets/',
    'blob:https://example.test/id',
    'custom:assets/',
    'http://[invalid',
    '../bad%GG/',
    '../bad%00/',
  ])('preserves decoys under remote or unmappable base %s', (href) => {
    const resolver = vi.fn<AssetResolverSync>(() => catalog.assets[0]);
    const html = `<base href="${href}">${references()}${references('/apple.png')}`;
    const result = inlineHtml(html, { ...options(), allowBasenameMatch: true, resolver });
    expect(result.content).toBe(html);
    expect(result.replacements).toEqual([]);
    expect(resolver).not.toHaveBeenCalled();
    expect(result.diagnostics).toHaveLength(16);
    expect(
      result.diagnostics.every(
        (d) => d.code === 'HTML_BASE_UNMAPPABLE' && d.filePath === documentPath && d.severity === 'warn',
      ),
    ).toBe(true);
  });

  it.each([
    ['', 'b'],
    ['<base target=_blank>', 'b'],
    ['<base href=""><base href="../a/">', 'b'],
    ['<base href><base href="../a/">', 'b'],
    ['<base href="  "><base href="../a/">', 'b'],
    ['<base href="?q#f"><base href="../a/">', 'b'],
    ['<base href=".">', 'b'],
    ['<base href="..">', ''],
    ['<base href="/">', ''],
    ['<base href="a">', 'b'],
    ['<base href="#f"><base href="../a/">', 'b'],
    ['<base target=_blank><base href="../a/">', 'a'],
    ['<base href="../a/"><base href="https://example.test/">', 'a'],
    ['<template><base href="https://example.test/"></template><base href="../a/">', 'a'],
    ['<template><template><base href="../a/"></template></template>', 'b'],
    ['<svg><base href="https://example.test/"></base></svg><base href="../a/">', 'a'],
    ['<BASE HREF="..&#47;a&#47;">', 'a'],
    ['<base href="../&eacute;&amp;x/">', 'é&x'],
    ['<base href="../encoded%23%3F/?ignored#ignored">', 'encoded#?'],
    ['<base href="../percent%2523/">', 'percent%23'],
    ['<base href="javascript:alert(1)"><base href="../a/">', 'b'],
    ['<base href="data:text/plain,hello"><base href="../a/">', 'b'],
  ])('applies precedence/decoding for %s', (base, dir) => {
    const result = inlineHtml(`${base}<img src="apple.png">`, options());
    expect(result.replacements.map((r) => r.resolvedPath)).toEqual([path.join(rootDir, dir!, 'apple.png')]);
    expect(result.diagnostics).toEqual([]);
  });

  it('determines the first base before processing earlier references in documents and fragments', () => {
    for (const prefix of ['', '<!doctype html><html><head></head><body>']) {
      const html = `${prefix}${references()}<base href="../a/">`;
      const result = inlineHtml(html, options());
      expect(result.replacements).toHaveLength(8);
      expect(result.replacements.every((r) => r.resolvedPath === path.join(rootDir, 'a/apple.png'))).toBe(true);
    }
  });

  it('keeps root-relative assets anchored at rootDir under a local base', () => {
    const result = inlineHtml(`<base href="../a/">${references('/apple.png')}`, options());
    expect(result.replacements).toHaveLength(8);
    expect(result.replacements.every((r) => r.resolvedPath === path.join(rootDir, 'apple.png'))).toBe(true);
  });

  it('retains remote first-base precedence and ordinary nonlocal skip behavior', () => {
    const resolver = vi.fn<AssetResolverSync>(() => undefined);
    const html =
      '<base href="//example.test/"><base href="../a/"><img src="apple.png"><img srcset="https://other.test/apple,pear.png 1x, data:image/png;base64,AAAA 2x"><i style="background:url(#fragment)"></i>';
    const result = inlineHtml(html, { ...options(), resolver });
    expect(result.content).toBe(html);
    expect(resolver).not.toHaveBeenCalled();
    expect(result.diagnostics).toHaveLength(1);
    expect(result.diagnostics[0]).toMatchObject({
      code: 'HTML_BASE_UNMAPPABLE',
      originalUrl: 'apple.png',
      filePath: documentPath,
    });
  });

  it.each(['../a/', '//example.test/'])('applies base %s to the style decoder-disagreement path', (href) => {
    const html = `<base href="${href}"><i style="background:url(apple.png);--x:&eacute;"></i>`;
    const result = inlineHtml(html, options());
    if (href === '../a/') {
      expect(result.replacements[0]?.resolvedPath).toBe(path.join(rootDir, 'a/apple.png'));
      expect(result.replacements[0]?.location?.offset).toBe(html.indexOf('apple.png'));
      expect(result.content).toContain('--x:&eacute;');
    } else {
      expect(result.content).toBe(html);
      expect(result.diagnostics[0]?.code).toBe('HTML_BASE_UNMAPPABLE');
    }
  });

  it('uses the same base for full-tree serialization without attribute source information', () => {
    const original = parse5.parseFragment;
    const spy = vi.spyOn(parse5, 'parseFragment').mockImplementation((...args: Parameters<typeof original>) => {
      const tree = original(...args);
      for (const node of tree.childNodes) {
        if ('tagName' in node && node.tagName === 'img') node.sourceCodeLocation = undefined;
      }
      return tree;
    });
    try {
      const result = inlineHtml('<base href="../a/"><img src="apple.png" srcset="apple,pear.png 1x">', options());
      expect(result.replacements.map((r) => r.resolvedPath)).toEqual([
        path.join(rootDir, 'a/apple.png'),
        path.join(rootDir, 'a/apple,pear.png'),
      ]);
      expect(result.content).toContain(catalog.getByPath(path.join(rootDir, 'a/apple.png'))!.dataUrl);
    } finally {
      spy.mockRestore();
    }
  });

  it('retains original URL spelling/locations and decodes path only once', () => {
    const html = '<base href="../a/?x#y">\n<img src="hash%23%3F.png?x&amp;y#z"><img srcset="apple&comma;pear.png 1x">';
    const result = inlineHtml(html, options());
    expect(result.replacements.map((r) => [r.originalUrl, r.resolvedPath, r.location?.offset])).toEqual([
      ['hash%23%3F.png?x&y#z', path.join(rootDir, 'a/hash#?.png'), html.indexOf('hash%23')],
      ['apple,pear.png', path.join(rootDir, 'a/apple,pear.png'), html.indexOf('apple&comma;')],
    ]);
  });

  it('keeps real document identity and exposes a separate resolver base directory', () => {
    const resolver = vi.fn<AssetResolverSync>(() => undefined);
    const result = inlineHtml(`<base href="../a/">${references('missing.png')}`, { ...options(), resolver });
    expect(resolver).toHaveBeenCalledTimes(8);
    for (const [input] of resolver.mock.calls) {
      expect(input).toMatchObject({
        originalUrl: 'missing.png',
        decodedPath: 'missing.png',
        documentPath,
        rootDir,
        resolutionBaseDir: path.join(rootDir, 'a'),
      });
      expect(Object.isFrozen(input)).toBe(true);
    }
    expect(result.diagnostics).toHaveLength(8);
    expect(
      result.diagnostics.every(
        (d) => d.filePath === documentPath && d.message.includes(path.join(rootDir, 'a/missing.png')),
      ),
    ).toBe(true);
  });

  it('supports document-less content anchored at rootDir', () => {
    const result = inlineHtml('<base href="a/"><img src="apple.png">', { catalog, rootDir });
    expect(result.replacements[0]?.resolvedPath).toBe(path.join(rootDir, 'a/apple.png'));
  });

  it('uses cwd for root-relative bases and references when rootDir is omitted', () => {
    const cwdRelative = 'test/fixtures/legacy/images';
    const assetPath = path.resolve(cwdRelative, 'apple.png');
    const cwdCatalog = createAssetCatalogSync([assetPath]);
    const result = inlineHtml(
      `<base href="/${cwdRelative}/"><img src="apple.png"><img src="/${cwdRelative}/apple.png">`,
      { catalog: cwdCatalog, documentPath },
    );
    expect(result.replacements.map((r) => r.resolvedPath)).toEqual([assetPath, assetPath]);
  });

  it('does not invent a document identity for an in-memory resolver', () => {
    const resolver = vi.fn<AssetResolverSync>(() => undefined);
    inlineHtml('<base href="a/"><img src="apple.png">', { catalog, rootDir, resolver });
    expect(resolver.mock.calls[0]?.[0]).toMatchObject({ resolutionBaseDir: path.join(rootDir, 'a'), rootDir });
    expect(resolver.mock.calls[0]?.[0]).not.toHaveProperty('documentPath');
  });

  it('keeps resolver override paths based and leaves no-base resolver context unchanged', () => {
    const resolver = vi.fn<AssetResolverSync>(() => catalog.getByPath(path.join(rootDir, 'a/apple.png')));
    const result = inlineHtml('<base href="../a/"><img src="alias.png">', { ...options(), resolver });
    expect(result.replacements[0]?.resolvedPath).toBe(path.join(rootDir, 'a/alias.png'));
    expect(result.content).toContain(catalog.getByPath(path.join(rootDir, 'a/apple.png'))!.dataUrl);
    inlineHtml('<img src="alias.png">', { ...options(), resolver });
    expect(resolver.mock.calls[1]?.[0]).not.toHaveProperty('resolutionBaseDir');
    expect(resolver.mock.calls[1]?.[0].documentPath).toBe(documentPath);
  });

  it('reports real document identity for selective skips and resource failures', () => {
    const html = `<base href="../a/">${references()}`;
    const skipped = inlineHtml(html, { ...options(), maxInlineBytes: 1 });
    expect(skipped.content).toBe(html);
    expect(skipped.diagnostics).toHaveLength(8);
    expect(skipped.diagnostics.every((d) => d.code === 'INLINE_SKIPPED' && d.filePath === documentPath)).toBe(true);
    expect(() => inlineHtml(html, { ...options(), maxReplacements: 1 })).toThrowError(
      expect.objectContaining({ code: 'RESOURCE_LIMIT', path: documentPath }),
    );
  });

  for (const [mode, run] of [
    ['async', inlineFiles],
    ['sync', inlineFilesSync],
  ] as const) {
    it(`${mode} files: local base selects real assets and remote base makes no write`, async () => {
      for (const href of ['../a/', 'https://example.test/', '//example.test/', 'file:///assets/']) {
        const html = `<base href="${href}">${references()}${references('/apple.png')}`;
        fs.writeFileSync(documentPath, html);
        const resolver = vi.fn<AssetResolverSync>(() => undefined);
        const pure = inlineHtml(html, options());
        const [result] = await run({
          catalog,
          targets: [documentPath],
          rootDir,
          inlineEmbeddedCss: true,
          resolver,
          write: true,
        });
        expect(result?.content).toBe(pure.content);
        expect(result?.replacements).toEqual(pure.replacements);
        expect(result?.diagnostics).toEqual(pure.diagnostics);
        expect(result?.written).toBe(href === '../a/');
        expect(fs.readFileSync(documentPath, 'utf8')).toBe(pure.content);
        expect(resolver).toHaveBeenCalledTimes(href === '../a/' ? 16 : 0);
      }
      expect(fs.readdirSync(path.dirname(documentPath)).some((name) => name.startsWith('.tmp.'))).toBe(false);
    });
  }
});
