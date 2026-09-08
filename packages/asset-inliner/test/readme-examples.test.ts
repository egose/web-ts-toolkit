/**
 * AIH-11: executable README quickstart checks.
 *
 * Mirrors the runnable `packages/asset-inliner/README.md` examples (encode,
 * format, catalog/CSS, catalog/HTML, files dry-run/write, custom resolver)
 * against temp fixture assets copied from `test/fixtures/legacy`, asserting
 * each produces the intended replacements. Uses `../src/*.ts` like the other
 * package tests; the packed-consumer (V4) check separately verifies the same
 * named imports resolve from the built tarball only.
 */
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import {
  builtInDefinitions,
  createAssetCatalog,
  createDefinitionRegistry,
  encodeAsset,
  encodeAssetSync,
  formatCssUrl,
  formatFontSource,
  inlineCss,
  inlineFiles,
  inlineFilesSync,
  inlineHtml,
} from '../src/index.ts';

const FIXTURE_ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), 'fixtures', 'legacy');
const IMAGES_DIR = path.join(FIXTURE_ROOT, 'images');
const FONTS_DIR = path.join(FIXTURE_ROOT, 'fonts');

function mkTree(): { root: string; cssDoc: string; htmlDoc: string } {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'readme-examples-'));
  const images = path.join(root, 'images');
  const fonts = path.join(root, 'fonts');
  const cssDir = path.join(root, 'css');
  const htmlDir = path.join(root, 'html');
  for (const d of [images, fonts, cssDir, htmlDir]) fs.mkdirSync(d, { recursive: true });
  fs.copyFileSync(path.join(IMAGES_DIR, 'apple.png'), path.join(images, 'apple.png'));
  fs.copyFileSync(path.join(IMAGES_DIR, 'pear.png'), path.join(images, 'pear.png'));
  fs.copyFileSync(path.join(FONTS_DIR, 'akronim-v9-latin-regular.woff2'), path.join(fonts, 'app.woff2'));
  return { root, cssDoc: path.join(cssDir, 'site.css'), htmlDoc: path.join(htmlDir, 'site.html') };
}

describe('README quickstart examples (AIH-11)', () => {
  it('encode: file, bytes, and sync variant', async () => {
    const { root } = mkTree();
    const asset = await encodeAsset(path.join(root, 'images', 'apple.png'));
    expect(asset.mediaType).toBe('image/png');
    expect(asset.dataUrl.startsWith('data:image/png;base64,')).toBe(true);

    const fromBytes = await encodeAsset({ data: new Uint8Array([137, 80, 78, 71]), filename: 'logo.png' });
    expect(fromBytes.mediaType).toBe('image/png');

    const syncAsset = encodeAssetSync(path.join(root, 'fonts', 'app.woff2'));
    expect(syncAsset.mediaType).toBe('font/woff2');
  });

  it('format: css url and font source wrappers', async () => {
    const { root } = mkTree();
    const png = await encodeAsset(path.join(root, 'images', 'apple.png'));
    expect(formatCssUrl(png).startsWith('url(data:image/png;base64,')).toBe(true);
    const woff2 = await encodeAsset(path.join(root, 'fonts', 'app.woff2'));
    const src = formatFontSource(woff2);
    expect(src).toContain('url(data:font/woff2;base64,');
    expect(src).toContain(`format('woff2')`);
  });

  it('inlineCss: coherent catalog + documentPath replaces image and font', async () => {
    const { root, cssDoc } = mkTree();
    const catalog = await createAssetCatalog([
      path.join(root, 'images', 'apple.png'),
      path.join(root, 'fonts', 'app.woff2'),
    ]);
    const css = [
      `.hero { background: url("../images/apple.png"); }`,
      `@font-face { font-family: 'App'; src: url('../fonts/app.woff2') format('woff2'); }`,
    ].join('\n');
    const result = inlineCss(css, { catalog, documentPath: cssDoc });
    expect(result.modified).toBe(true);
    expect(result.replacements).toHaveLength(2);
    expect(result.replacements[0]?.originalUrl).toBe('../images/apple.png');
    expect(result.diagnostics).toEqual([]);
    expect(result.content).toContain('data:image/png;base64,');
    expect(result.content).toContain('data:font/woff2;base64,');
  });

  it('inlineHtml: coherent catalog + documentPath replaces img and icon link', async () => {
    const { root, htmlDoc } = mkTree();
    const catalog = await createAssetCatalog([
      path.join(root, 'images', 'apple.png'),
      path.join(root, 'images', 'pear.png'),
    ]);
    const html = `<img src="../images/apple.png" alt="apple"><link rel="icon" href="../images/pear.png">`;
    const out = inlineHtml(html, { catalog, documentPath: htmlDoc });
    expect(out.modified).toBe(true);
    expect(out.replacements).toHaveLength(2);
    expect(out.content).toContain('data:image/png;base64,');
    expect(out.diagnostics).toEqual([]);
  });

  it('inlineFiles: dry-run reports, write persists (async + sync)', async () => {
    const { root, cssDoc } = mkTree();
    fs.writeFileSync(cssDoc, `.hero { background: url("../images/apple.png"); }\n`);
    const dry = await inlineFiles({ assets: [path.join(root, 'images')], targets: [cssDoc] });
    expect(dry).toHaveLength(1);
    expect(dry[0]?.modified).toBe(true);
    expect(dry[0]?.written).toBe(false);
    expect(fs.readFileSync(cssDoc, 'utf8')).toContain('../images/apple.png');

    const written = await inlineFiles({
      assets: [path.join(root, 'images')],
      targets: [cssDoc],
      write: true,
    });
    expect(written[0]?.written).toBe(true);
    expect(fs.readFileSync(cssDoc, 'utf8')).toContain('data:image/png;base64,');

    const cssDoc2 = path.join(path.dirname(cssDoc), 'second.css');
    fs.writeFileSync(cssDoc2, `.hero { background: url("../images/pear.png"); }\n`);
    const drySync = inlineFilesSync({ assets: [path.join(root, 'images')], targets: [cssDoc2] });
    expect(drySync[0]?.modified).toBe(true);
    expect(drySync[0]?.written).toBe(false);
  });

  it('custom registry + narrow resolver without parser AST knowledge', async () => {
    const { root, cssDoc } = mkTree();
    const custom = {
      kind: 'audio' as const,
      extensions: ['.mp3'],
      mediaType: 'audio/mpeg',
    } satisfies import('../src/index.ts').AssetTypeDefinition;
    const tiny = await encodeAsset({
      data: new Uint8Array([1, 2, 3]),
      mediaType: 'audio/mpeg',
      filename: 'ding.mp3',
    });
    expect(tiny.mediaType).toBe('audio/mpeg');

    const registry = createDefinitionRegistry([...builtInDefinitions, custom]);
    const catalog = await createAssetCatalog([path.join(root, 'images')], { registry });
    const result = inlineCss(`.hero { background: url("../images/legacy.png"); }`, {
      catalog,
      documentPath: cssDoc,
      resolver: (input, cat) => {
        if (input.basename === 'legacy.png') return cat.getByBasename('apple.png');
        return undefined;
      },
    });
    expect(result.modified).toBe(true);
    expect(result.replacements[0]?.mediaType).toBe('image/png');
    expect(result.content).toContain('data:image/png;base64,');
  });
});
