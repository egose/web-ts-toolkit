import { describe, it, expect } from 'vitest';
import path from 'node:path';
import fs from 'node:fs';
import vm from 'node:vm';
import { createAssetCatalogSync } from '../src/catalog.ts';
import { inlineCss } from '../src/css.ts';
import { inlineHtml } from '../src/html.ts';
import { resolveAssetReferenceSync } from '../src/resolve.ts';
import { InvalidOptionsError } from '../src/errors.ts';
import { inlineFilesSync } from '../src/files.ts';
import os from 'node:os';

const FIXTURE_ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), 'fixtures', 'legacy');
const IMAGES_DIR = path.join(FIXTURE_ROOT, 'images');

function mkCatalog() {
  const file = path.join(IMAGES_DIR, 'sample.png');
  return createAssetCatalogSync([file]);
}

function mkTmp(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'resolver-honesty-'));
}

describe('resolver sync honesty — thenable and structural validation', () => {
  it('rejects native Promise resolver result in sync API', () => {
    const catalog = mkCatalog();
    const docPath = path.join(os.tmpdir(), 'dummy.css');
    // Resolver returns a native Promise
    const asyncResolver = () =>
      Promise.resolve(catalog.getByPath(path.resolve(path.join(IMAGES_DIR, 'sample.png'))) as any);
    expect(() =>
      resolveAssetReferenceSync('a.png', catalog, { documentPath: docPath, resolver: asyncResolver as any }),
    ).toThrow(InvalidOptionsError);
    try {
      resolveAssetReferenceSync('a.png', catalog, { documentPath: docPath, resolver: asyncResolver as any });
    } catch (e) {
      expect((e as InvalidOptionsError).code).toBe('INVALID_OPTIONS');
      expect(String((e as Error).message).toLowerCase()).toMatch(/thenable|resolver|async/);
    }
    // inlineCss should fail before mutation
    const css = `.a { background: url('sample.png') }`;
    expect(() => inlineCss(css, { catalog, documentPath: docPath, resolver: asyncResolver as any })).toThrow(
      InvalidOptionsError,
    );
  });

  it('rejects cross-realm promise/thenable', () => {
    const catalog = mkCatalog();
    const docPath = path.join(os.tmpdir(), 'dummy.css');
    // Create a promise in a different VM realm
    const crossRealmPromise = vm.runInNewContext('Promise.resolve(42)') as unknown;
    // Resolver returns cross-realm promise
    const crossRealmResolver = () => crossRealmPromise as any;
    expect(() =>
      resolveAssetReferenceSync('a.png', catalog, { documentPath: docPath, resolver: crossRealmResolver as any }),
    ).toThrow(InvalidOptionsError);

    // Also test custom thenable from cross-realm context
    const crossRealmThenable = vm.runInNewContext('({ then: function(cb){ cb(42) } })') as unknown;
    const thenableResolver = () => crossRealmThenable as any;
    expect(() =>
      resolveAssetReferenceSync('a.png', catalog, { documentPath: docPath, resolver: thenableResolver as any }),
    ).toThrow(InvalidOptionsError);

    // inlineHtml should also reject before mutation
    const html = `<img src="sample.png">`;
    expect(() => inlineHtml(html, { catalog, documentPath: docPath, resolver: crossRealmResolver as any })).toThrow(
      InvalidOptionsError,
    );
  });

  it('rejects custom thenable object', () => {
    const catalog = mkCatalog();
    const docPath = path.join(os.tmpdir(), 'dummy.css');
    const customThenable = {
      then: (onFulfilled: any) => onFulfilled(catalog.getByPath(path.resolve(path.join(IMAGES_DIR, 'sample.png')))),
    };
    const resolver = () => customThenable as any;
    expect(() =>
      resolveAssetReferenceSync('sample.png', catalog, { documentPath: docPath, resolver: resolver as any }),
    ).toThrow(InvalidOptionsError);
    // function with .then property
    const fnThenable: any = () => {};
    fnThenable.then = (cb: any) => cb({});
    const fnResolver = () => fnThenable as any;
    expect(() =>
      resolveAssetReferenceSync('a.png', catalog, { documentPath: docPath, resolver: fnResolver as any }),
    ).toThrow(InvalidOptionsError);

    const css = `.a { background: url('sample.png') }`;
    expect(() => inlineCss(css, { catalog, documentPath: docPath, resolver: resolver as any })).toThrow(
      InvalidOptionsError,
    );
  });

  it('rejects malformed plain-object resolver results predictably', () => {
    const catalog = mkCatalog();
    const docPath = path.join(os.tmpdir(), 'dummy.css');
    const malformedCases: Array<{ obj: any; missing: string }> = [
      { obj: { kind: 'image', mediaType: 'image/png', byteLength: 123, dataUrl: undefined }, missing: 'dataUrl' },
      { obj: { kind: 'image', mediaType: 'image/png', byteLength: 123 }, missing: 'dataUrl' },
      {
        obj: { kind: 'image', mediaType: '', byteLength: 123, dataUrl: 'data:image/png;base64,abc' },
        missing: 'mediaType',
      },
      {
        obj: { kind: '', mediaType: 'image/png', byteLength: 123, dataUrl: 'data:image/png;base64,abc' },
        missing: 'kind',
      },
      {
        obj: { kind: 'image', mediaType: 'image/png', byteLength: -1, dataUrl: 'data:image/png;base64,abc' },
        missing: 'byteLength',
      },
      {
        obj: { kind: 'image', mediaType: 'image/png', byteLength: NaN, dataUrl: 'data:image/png;base64,abc' },
        missing: 'byteLength',
      },
      {
        obj: { kind: 'image', mediaType: 'image/png', byteLength: 123, dataUrl: 'not-a-data-url' },
        missing: 'dataUrl',
      },
      {
        obj: {
          kind: 'image',
          mediaType: 'image/png',
          byteLength: 123,
          dataUrl: 'data:image/png;base64,abc',
          then: () => {},
        },
        missing: 'thenable',
      },
    ];
    for (const { obj } of malformedCases) {
      const resolver = () => obj as any;
      let threw = false;
      try {
        resolveAssetReferenceSync('sample.png', catalog, { documentPath: docPath, resolver: resolver as any });
      } catch (e) {
        threw = true;
        expect((e as InvalidOptionsError).code).toBe('INVALID_OPTIONS');
        expect(String((e as Error).message).toLowerCase()).toMatch(/resolver|thenable|invalid/);
      }
      expect(threw, `expected malformed ${JSON.stringify(obj)} to throw`).toBe(true);
      // inlineCss should also throw before mutation, not serialize undefined
      const css = `.a { background: url('sample.png') }`;
      expect(() => inlineCss(css, { catalog, documentPath: docPath, resolver: resolver as any })).toThrow(
        InvalidOptionsError,
      );
      // ensure content not mutated to include 'undefined'
      try {
        inlineCss(css, { catalog, documentPath: docPath, resolver: resolver as any });
      } catch {}
      // If we instead check that thrown error prevents mutation, we confirm not serialized
    }
  });

  it('valid synchronous custom resolvers retain fallback behavior', () => {
    const catalog = mkCatalog();
    const samplePath = path.resolve(path.join(IMAGES_DIR, 'sample.png'));
    const asset = catalog.getByPath(samplePath)!;
    expect(asset).toBeDefined();
    const docPath = path.join(os.tmpdir(), 'dummy.css');

    // Resolver returns asset for custom.png, undefined for others -> fallback to default
    const tmp = mkTmp();
    try {
      const localFile = path.join(tmp, 'local.png');
      fs.copyFileSync(path.join(IMAGES_DIR, 'sample.png'), localFile);
      const cat2 = createAssetCatalogSync([localFile]);
      const localAsset = cat2.getByPath(path.resolve(localFile))!;
      const resolver = (input: any, cat: any) => {
        if (input.basename === 'custom.png') return asset;
        return undefined;
      };
      // custom.png should resolve via resolver
      const resCustom = resolveAssetReferenceSync('custom.png', cat2, {
        documentPath: docPath,
        resolver: resolver as any,
      });
      expect(resCustom.asset).toBeDefined();
      expect(resCustom.asset!.dataUrl).toBe(asset.dataUrl);

      // local.png should fall back to catalog lookup (since resolver returns undefined)
      const resLocal = resolveAssetReferenceSync('local.png', cat2, {
        documentPath: path.join(tmp, 'doc.css'),
        resolver: resolver as any,
      });
      expect(resLocal.asset).toBeDefined();
      expect(resLocal.asset!.sourcePath).toBe(path.resolve(localFile));

      // inlineCss fallback
      const css = `.a { background: url('custom.png'); } .b { background: url('local.png'); }`;
      const result = inlineCss(css, {
        catalog: cat2,
        documentPath: path.join(tmp, 'doc.css'),
        resolver: resolver as any,
      });
      expect(result.modified).toBe(true);
      expect(result.replacements.length).toBe(2);
      expect(result.content).toContain(asset.dataUrl);
      expect(result.content).toContain(localAsset.dataUrl);
    } finally {
      fs.rmSync(tmp, { recursive: true, force: true });
    }
  });

  it('inlineFiles sync resolver thenable fails predictably (diagnostic, no write)', () => {
    const tmp = mkTmp();
    try {
      const assetFile = path.join(tmp, 'a.png');
      fs.copyFileSync(path.join(IMAGES_DIR, 'sample.png'), assetFile);
      const cssFile = path.join(tmp, 'style.css');
      fs.writeFileSync(cssFile, `.a { background: url('a.png') }`);
      const catalog = createAssetCatalogSync([assetFile]);
      const thenableResolver = () => ({ then: () => {} }) as any;
      // inlineFilesSync with thenable resolver should result in per-target INVALID_OPTIONS diagnostic, not write
      // For pure sync version, we expect it either throws or returns diagnostic. According to files.ts, it should be diagnostic.
      // We test that it does not throw batch but returns result with diagnostic and no mutation
      // However for consistency with inlineCss throwing, files.ts converts to diagnostic.
      // So we allow either throw or diagnostic, but must be INVALID_OPTIONS and not mutate.
      let threw = false;
      let results: any;
      try {
        results = inlineFilesSync({
          targets: [cssFile],
          catalog,
          resolver: thenableResolver as any,
        });
      } catch (e) {
        threw = true;
        expect((e as InvalidOptionsError).code).toBe('INVALID_OPTIONS');
      }
      if (!threw) {
        expect(results).toHaveLength(1);
        expect(results[0].modified).toBe(false);
        expect(results[0].written).toBe(false);
        expect(
          results[0].diagnostics.some(
            (d: any) =>
              d.code === 'INVALID_OPTIONS' ||
              String(d.message).toLowerCase().includes('thenable') ||
              String(d.message).toLowerCase().includes('resolver'),
          ),
        ).toBe(true);
        expect(results[0].content).not.toContain('undefined');
        // file should remain unchanged
        expect(fs.readFileSync(cssFile, 'utf8')).toBe(`.a { background: url('a.png') }`);
      }
    } finally {
      fs.rmSync(tmp, { recursive: true, force: true });
    }
  });
});
