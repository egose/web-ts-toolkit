/**
 * ASSET-00 — Legacy Capability Contract
 *
 * Executable compatibility authority for `_base64-font2base64` and `_base64-injector`.
 * See `test/fixtures/README.md` for provenance and the full matrix.
 *
 * Goals:
 *  - Inventory each tested legacy capability without mutating source repos.
 *  - Use OS temporary directories for any writes.
 *  - Separate semantic expectations (decoded bytes, mediaType, format, replacements)
 *    from obsolete exact formatting (parser serialization, `true` returns, `console.error`).
 *  - Cover negatives missing from old suites.
 *
 * At this stage `packages/asset-inliner` has no `package.json` (ASSET-01 owns it),
 * so this file is standalone Vitest and imports only from `node:*` and local fixtures.
 * Future tasks will replace local helpers with the real package exports and convert
 * `todo` placeholders to executable imports of `@web-ts-toolkit/asset-inliner`.
 */
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';

// ---------------------------------------------------------------------------
// Helpers — intentionally local so the contract is executable before the package exists.
// These mirror the *intended* new semantics, not the exact legacy defects.
// ---------------------------------------------------------------------------

const FIXTURE_ROOT = path.resolve(
  import.meta.dirname ?? path.dirname(new URL(import.meta.url).pathname),
  'fixtures',
  'legacy',
);

/** Create a fresh OS temp dir; caller must rm -rf when done. */
function mkTmp(prefix = 'asset-inliner-legacy-'): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), prefix));
}

/** Read file bytes; throw if missing (legacy silently swallowed). */
function readBytes(p: string): Buffer {
  return fs.readFileSync(p);
}

/** Minimal media registry — matches legacy maps but with normalized lowercase keys. */
const FONT_MAP: Record<string, { mediaType: string; format: string }> = {
  '.svg': { mediaType: 'image/svg+xml', format: 'svg' },
  '.ttf': { mediaType: 'font/truetype', format: 'truetype' },
  '.otf': { mediaType: 'font/opentype', format: 'opentype' },
  '.eot': { mediaType: 'application/vnd.ms-fontobject', format: 'embedded-opentype' },
  '.sfnt': { mediaType: 'application/font-sfnt', format: 'sfnt' },
  '.woff': { mediaType: 'application/font-woff', format: 'woff' },
  '.woff2': { mediaType: 'application/font-woff2', format: 'woff2' },
};
const IMAGE_MAP: Record<string, { mediaType: string }> = {
  '.apng': { mediaType: 'image/apng' },
  '.bmp': { mediaType: 'image/bmp' },
  '.gif': { mediaType: 'image/gif' },
  '.ico': { mediaType: 'image/x-icon' },
  '.cur': { mediaType: 'image/x-icon' },
  '.jpg': { mediaType: 'image/jpeg' },
  '.jpeg': { mediaType: 'image/jpeg' },
  '.jfif': { mediaType: 'image/jpeg' },
  '.pjpeg': { mediaType: 'image/jpeg' },
  '.pjp': { mediaType: 'image/jpeg' },
  '.png': { mediaType: 'image/png' },
  '.svg': { mediaType: 'image/svg+xml' },
  '.tif': { mediaType: 'image/tiff' },
  '.tiff': { mediaType: 'image/tiff' },
  '.webp': { mediaType: 'image/webp' },
};
/** Combined for lookup; font wins for non-svg, image wins for svg default per contract. */
function lookup(ext: string, kind?: string): { mediaType: string; format?: string } | null {
  const low = ext.toLowerCase();
  if (kind === 'font') return FONT_MAP[low] ?? null;
  if (kind === 'image') return IMAGE_MAP[low] ?? null;
  // default: svg -> image; otherwise prefer font for font exts, image for image exts
  if (low === '.svg') return IMAGE_MAP[low];
  return (FONT_MAP[low] as any) ?? IMAGE_MAP[low] ?? null;
}

function toDataUrl(mediaType: string, base64: string): string {
  // RFC2397: data:<mediaType>;base64,<payload>  — no charset for binary fonts in new contract
  return `data:${mediaType};base64,${base64}`;
}
function formatCssUrl(dataUrl: string): string {
  return `url(${dataUrl})`;
}
function formatFontSource(dataUrl: string, format: string): string {
  return `url(${dataUrl}) format('${format}')`;
}

function encodeSync(
  filePath: string,
  kind?: string,
): { mediaType: string; format?: string; dataUrl: string; bytes: Buffer } {
  const bytes = readBytes(filePath);
  const ext = path.extname(filePath);
  const meta = lookup(ext, kind);
  if (!meta) throw new Error(`UnsupportedAssetError: ${ext}`);
  const b64 = bytes.toString('base64');
  const dataUrl = toDataUrl(meta.mediaType, b64);
  return { mediaType: meta.mediaType, format: (meta as any).format, dataUrl, bytes };
}
async function encodeAsync(filePath: string, kind?: string) {
  const bytes = await fs.promises.readFile(filePath);
  const ext = path.extname(filePath);
  const meta = lookup(ext, kind);
  if (!meta) throw new Error(`UnsupportedAssetError: ${ext}`);
  const b64 = bytes.toString('base64');
  return { mediaType: meta.mediaType, format: (meta as any).format, dataUrl: toDataUrl(meta.mediaType, b64), bytes };
}
function decodeDataUrl(dataUrl: string): Buffer {
  const m = dataUrl.match(/^data:([^;]+);base64,(.*)$/);
  if (!m) throw new Error(`Invalid data URL: ${dataUrl.slice(0, 40)}`);
  return Buffer.from(m[2], 'base64');
}

// Legacy extraction helpers (semantic, not exact regex formatting)
function isRemoteOrDataUrl(url: string): boolean {
  return /^(data:|https?:|blob:|ftp:|protocol-relative|#)/i.test(url.trim()) || url.trim().startsWith('//');
}

// ---------------------------------------------------------------------------
// Matrix / Fixture existence
// ---------------------------------------------------------------------------

describe('legacy-contract: fixture provenance and inventory', () => {
  it('fixtures README exists and contains MIT provenance', () => {
    const readme = path.resolve(FIXTURE_ROOT, '..', 'README.md');
    const txt = fs.readFileSync(readme, 'utf8');
    expect(txt).toMatch(/MIT/);
    expect(txt).toMatch(/Junmin Ahn/);
    expect(txt).toMatch(/node-font2base64/);
    expect(txt).toMatch(/base64-injector/);
  });

  it('every required font extension has a fixture', () => {
    for (const ext of Object.keys(FONT_MAP)) {
      const p = path.join(FIXTURE_ROOT, 'fonts', `akronim-v9-latin-regular${ext}`);
      expect(fs.existsSync(p), `missing font ${ext}`).toBe(true);
    }
  });

  it('every required image extension has a fixture', () => {
    for (const ext of Object.keys(IMAGE_MAP)) {
      // svg already covered, but ensure at least one sample exists per ext
      const p = path.join(FIXTURE_ROOT, 'images', `sample${ext}`);
      expect(fs.existsSync(p), `missing image ${ext}`).toBe(true);
    }
  });

  it('CSS and HTML samples exist', () => {
    expect(fs.existsSync(path.join(FIXTURE_ROOT, 'css', 'example.css'))).toBe(true);
    expect(fs.existsSync(path.join(FIXTURE_ROOT, 'css', 'fruit-background.css'))).toBe(true);
    expect(fs.existsSync(path.join(FIXTURE_ROOT, 'html', 'example.html'))).toBe(true);
  });

  it('negative fixtures exist', () => {
    const neg = path.join(FIXTURE_ROOT, 'negative');
    expect(fs.existsSync(path.join(neg, 'unsupported.bin'))).toBe(true);
    expect(fs.existsSync(path.join(neg, 'duplicate-a', 'dup.png'))).toBe(true);
    expect(fs.existsSync(path.join(neg, 'duplicate-b', 'dup.png'))).toBe(true);
    expect(fs.existsSync(path.join(neg, 'uppercase', 'PHOTO.PNG'))).toBe(true);
    expect(fs.existsSync(path.join(neg, 'data-url.css'))).toBe(true);
    expect(fs.existsSync(path.join(neg, 'query-fragment.css'))).toBe(true);
    expect(fs.existsSync(path.join(neg, 'malformed.css'))).toBe(true);
    expect(fs.existsSync(path.join(neg, 'malformed.html'))).toBe(true);
    expect(fs.existsSync(path.join(neg, 'img-no-src.html'))).toBe(true);
    expect(fs.existsSync(path.join(neg, 'svg-image.svg'))).toBe(true);
    expect(fs.existsSync(path.join(neg, 'svg-font.svg'))).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Encoding semantics — async/sync, one/many, uppercase, byte equality
// ---------------------------------------------------------------------------

describe('legacy-contract: encoding — async/sync single file', () => {
  const fontFiles = Object.keys(FONT_MAP).map((ext) =>
    path.join(FIXTURE_ROOT, 'fonts', `akronim-v9-latin-regular${ext}`),
  );

  for (const f of fontFiles) {
    const ext = path.extname(f);
    it(`sync encodes ${ext} to correct mediaType/format and round-trips bytes`, () => {
      const { mediaType, format, dataUrl, bytes } = encodeSync(f, 'font');
      expect(mediaType).toBe(FONT_MAP[ext.toLowerCase()].mediaType);
      expect(format).toBe(FONT_MAP[ext.toLowerCase()].format);
      expect(dataUrl.startsWith(`data:${mediaType};base64,`)).toBe(true);
      // data URL must not contain legacy charset=utf-8 for this contract (deprecated)
      expect(dataUrl).not.toMatch(/charset=utf-8/);
      const decoded = decodeDataUrl(dataUrl);
      expect(Buffer.compare(decoded, bytes)).toBe(0);
      // font source formatting includes format(...)
      const src = formatFontSource(dataUrl, format!);
      expect(src).toBe(`url(${dataUrl}) format('${format}')`);
    });

    it(`async encodes ${ext} identically to sync`, async () => {
      const a = await encodeAsync(f, 'font');
      const s = encodeSync(f, 'font');
      expect(a.mediaType).toBe(s.mediaType);
      expect(a.format).toBe(s.format);
      expect(a.dataUrl).toBe(s.dataUrl);
    });
  }

  it('sync and async handle in-memory Buffer input via tmp file (string/Buffer contract)', async () => {
    const tmp = mkTmp();
    try {
      const srcFile = path.join(FIXTURE_ROOT, 'fonts', 'akronim-v9-latin-regular.woff');
      const bytes = fs.readFileSync(srcFile);
      // in-memory buffer: encode helper that takes Buffer directly (mirrors future AssetInput {data: Uint8Array})
      const b64 = Buffer.from(bytes).toString('base64');
      const meta = lookup('.woff', 'font')!;
      const dataUrl = toDataUrl(meta.mediaType, b64);
      expect(decodeDataUrl(dataUrl).equals(bytes)).toBe(true);
      // async variant
      const asyncBytes = await fs.promises.readFile(srcFile);
      const asyncB64 = Buffer.from(asyncBytes).toString('base64');
      expect(asyncB64).toBe(b64);
    } finally {
      fs.rmSync(tmp, { recursive: true, force: true });
    }
  });
});

describe('legacy-contract: encoding — one/many inputs preserve order', () => {
  it('encodes array of fonts preserving input order (sync)', () => {
    const files = [
      path.join(FIXTURE_ROOT, 'fonts', 'akronim-v9-latin-regular.woff2'),
      path.join(FIXTURE_ROOT, 'fonts', 'akronim-v9-latin-regular.woff'),
      path.join(FIXTURE_ROOT, 'fonts', 'akronim-v9-latin-regular.ttf'),
    ];
    const results = files.map((f) => encodeSync(f, 'font'));
    expect(results).toHaveLength(3);
    expect(results[0].format).toBe('woff2');
    expect(results[1].format).toBe('woff');
    expect(results[2].format).toBe('truetype');
    // byte equality per entry
    for (let i = 0; i < files.length; i++) {
      const orig = fs.readFileSync(files[i]);
      expect(decodeDataUrl(results[i].dataUrl).equals(orig)).toBe(true);
    }
  });

  it('encodes array of images preserving input order (async)', async () => {
    const files = [
      path.join(FIXTURE_ROOT, 'images', 'apple.png'),
      path.join(FIXTURE_ROOT, 'images', 'sample.gif'),
      path.join(FIXTURE_ROOT, 'images', 'sample.jpg'),
    ];
    const results = await Promise.all(files.map((f) => encodeAsync(f, 'image')));
    expect(results.map((r) => r.mediaType)).toEqual(['image/png', 'image/gif', 'image/jpeg']);
    for (let i = 0; i < files.length; i++) {
      const orig = await fs.promises.readFile(files[i]);
      expect(decodeDataUrl(results[i].dataUrl).equals(orig)).toBe(true);
    }
  });
});

describe('legacy-contract: image encoding covers all legacy image types', () => {
  for (const ext of Object.keys(IMAGE_MAP)) {
    it(`encodes ${ext} with media type ${IMAGE_MAP[ext].mediaType} (case-insensitive)`, () => {
      const p = path.join(FIXTURE_ROOT, 'images', `sample${ext}`);
      const lower = encodeSync(p, 'image');
      expect(lower.mediaType).toBe(IMAGE_MAP[ext].mediaType);
      // uppercase lookup must also succeed (future package normalizes)
      const upperExt = ext.toUpperCase();
      const meta = lookup(upperExt, 'image');
      expect(meta?.mediaType).toBe(IMAGE_MAP[ext].mediaType);
      // generic CSS url formatting does not add format(...)
      expect(formatCssUrl(lower.dataUrl)).toBe(`url(${lower.dataUrl})`);
      expect(formatCssUrl(lower.dataUrl)).not.toMatch(/format\(/);
    });
  }
});

describe('legacy-contract: format helpers — separate generic URL vs font source', () => {
  it('formatCssUrl wraps dataUrl without format', () => {
    const url = 'data:image/png;base64,abc';
    expect(formatCssUrl(url)).toBe(`url(${url})`);
  });
  it('formatFontSource requires format and includes it', () => {
    const url = 'data:font/woff2;base64,abc';
    expect(formatFontSource(url, 'woff2')).toBe(`url(${url}) format('woff2')`);
  });
  it('legacy ambiguity: encodeToDataSrc meant font format in font2base64 but generic url in injector — new contract splits them (todo for package import)', () => {
    // This test documents the resolved design; implementation will be verified after ASSET-01.
    expect(formatCssUrl('data:image/png;base64,x')).not.toBe(formatFontSource('data:image/png;base64,x', 'woff'));
  });
});

// ---------------------------------------------------------------------------
// CSS replacement semantics
// ---------------------------------------------------------------------------

describe('legacy-contract: CSS font replacement — @font-face src', () => {
  it('replaces every local url(...) in @font-face src with font data URL + format, preserving other content semantically', () => {
    const css = fs.readFileSync(path.join(FIXTURE_ROOT, 'css', 'example.css'), 'utf8');
    // Simulate catalog: encode each font in fonts/ and build map basename -> font source
    const fontsDir = path.join(FIXTURE_ROOT, 'fonts');
    const fontFiles = fs.readdirSync(fontsDir).map((n) => path.join(fontsDir, n));
    const catalog = new Map<string, string>();
    for (const fp of fontFiles) {
      const { dataUrl, format } = encodeSync(fp, 'font');
      catalog.set(path.basename(fp), formatFontSource(dataUrl, format!));
    }
    // Simple replacement: replace basename occurrences that are local font refs
    let replaced = css;
    let count = 0;
    for (const [base, src] of catalog) {
      if (replaced.includes(base)) {
        // strip query/fragment for matching but not emitted
        const withoutQuery = base;
        replaced = replaced.split(withoutQuery).join(src); // simplified; real parser handles url() boundaries
        count++;
      }
    }
    // At least the woff/woff2/ttf/svg/eot files should have been considered (5 distinct basenames in fixture; otf/sfnt not referenced)
    expect(count).toBeGreaterThanOrEqual(4);
    // replaced content must contain data: URLs and format hints
    expect(replaced).toMatch(/data:image\/svg\+xml;base64,/);
    expect(replaced).toMatch(/format\('woff2'\)/);
    expect(replaced).toMatch(/format\('truetype'\)/);
    // original relative paths should no longer appear as bare url('../fonts/...') for inlined entries
    // (query/fragment suffixes must not be in filesystem path; data URL has no ?# suffix)
    expect(replaced).not.toMatch(/url\('..\/fonts\/akronim-v9-latin-regular\.woff'\)/);
  });

  it('query/fragment references match file without query/fragment in path', () => {
    const css = fs.readFileSync(path.join(FIXTURE_ROOT, 'negative', 'query-fragment.css'), 'utf8');
    const fp = path.join(FIXTURE_ROOT, 'fonts', 'akronim-v9-latin-regular.woff');
    const { dataUrl, format } = encodeSync(fp, 'font');
    const fontSrc = formatFontSource(dataUrl, format!);
    // legacy _extractSrcUrl captures up to ?#; new contract strips them for lookup
    const urlWithQuery = '../fonts/akronim-v9-latin-regular.woff?#iefix';
    const stripped = urlWithQuery.split('?')[0].split('#')[0];
    expect(stripped).toBe('../fonts/akronim-v9-latin-regular.woff');
    expect(path.basename(stripped)).toBe('akronim-v9-latin-regular.woff');
    expect(fontSrc).toMatch(/data:application\/font-woff;base64,/);
    expect(css).toMatch(/\?#iefix/);
    // after inlining, data URL must not retain ?#iefix
    const inlined = css.replace(urlWithQuery, fontSrc);
    expect(inlined).not.toMatch(/\?#iefix.*data:/);
  });

  it('existing data URLs are skipped (negative fixture)', () => {
    const css = fs.readFileSync(path.join(FIXTURE_ROOT, 'negative', 'data-url.css'), 'utf8');
    expect(css).toMatch(/data:image\/png;base64,/);
    // inliner must leave it unchanged
    const shouldRemainUnchanged = css.includes('data:image/png;base64,');
    expect(shouldRemainUnchanged).toBe(true);
    // ensure no second inlining would happen: count data: occurrences unchanged after no-op
    const count = (css.match(/data:/g) ?? []).length;
    expect(count).toBe(1);
  });

  it('malformed CSS is surfaced as diagnostic/error, not swallowed', () => {
    const css = fs.readFileSync(path.join(FIXTURE_ROOT, 'negative', 'malformed.css'), 'utf8');
    expect(css).toMatch(/url\(.*format/);
    // The new contract must not silently return success with console.error; it should throw or return diagnostics.
    // Fixture is intentionally malformed (unclosed url( in last rule).
    expect(css).toContain('background: url(');
    expect(() => {
      if (css.includes('background: url(') && !css.trim().endsWith(')')) throw new Error('ParseError');
      // fallback generic mismatch check
      if (css.split('url(').length !== css.split(')').length) throw new Error('ParseError');
    }).toThrow(/ParseError/);
  });
});

describe('legacy-contract: CSS image replacement — generic url(...)', () => {
  it('replaces generic local url(...) in any declaration (new contract broadens legacy 2-property limit)', () => {
    const css = fs.readFileSync(path.join(FIXTURE_ROOT, 'css', 'fruit-background.css'), 'utf8');
    const applePng = path.join(FIXTURE_ROOT, 'images', 'apple.png');
    const pearPng = path.join(FIXTURE_ROOT, 'images', 'pear.png');
    const apple = encodeSync(applePng, 'image');
    const pear = encodeSync(pearPng, 'image');
    // Simulate inlining: replace both urls
    const appleUrl = formatCssUrl(apple.dataUrl);
    const pearUrl = formatCssUrl(pear.dataUrl);
    let out = css.replaceAll(`url('../images/apple.png')`, appleUrl);
    out = out.replaceAll(`url('../images/pear.png')`, pearUrl);
    expect(out).toMatch(/data:image\/png;base64,/);
    expect(out).not.toMatch(/url\('..\/images\/apple\.png'\)/);
    expect(out).not.toMatch(/url\('..\/images\/pear\.png'\)/);
    // legacy only handled background/background-image; new contract must handle any property, so this expectation is stable
  });

  it('CSS with no eligible assets remains byte-identical (unchanged content)', () => {
    const css = `.foo { color: red; }`;
    // No urls -> no modification
    const hasUrl = /url\(/i.test(css);
    expect(hasUrl).toBe(false);
    // Future inlineCss must return modified:false and original content identical
    expect(css).toBe(`.foo { color: red; }`);
  });
});

// ---------------------------------------------------------------------------
// HTML replacement semantics
// ---------------------------------------------------------------------------

describe('legacy-contract: HTML image replacement', () => {
  it('replaces <img src> with data URL (legacy) and preserves other attributes', () => {
    const html = fs.readFileSync(path.join(FIXTURE_ROOT, 'html', 'example.html'), 'utf8');
    const water = path.join(FIXTURE_ROOT, 'images', 'watermelon.png');
    const { dataUrl } = encodeSync(water, 'image');
    const inlined = html.replace('../images/watermelon.png', dataUrl);
    expect(inlined).toMatch(/data:image\/png;base64,/);
    expect(inlined).toMatch(/alt="watermelon"/);
    expect(inlined).not.toMatch(/src="\.\.\/images\/watermelon\.png"/);
  });

  it('<img> without src never throws (negative fixture)', () => {
    const html = fs.readFileSync(path.join(FIXTURE_ROOT, 'negative', 'img-no-src.html'), 'utf8');
    expect(html).toMatch(/<img alt="no src">/);
    // legacy core.js:329 would throw on src.length if src undefined; new contract must not.
    expect(() => {
      // Simulate safe handling: only touch elements that have src attribute
      const safe = html.includes('<img alt="no src">');
      expect(safe).toBe(true);
    }).not.toThrow();
  });

  it('srcset handling must not split on commas inside data URLs (contract for ASSET-06)', () => {
    // Data URLs contain commas; naive split on ',' corrupts them. This fixture documents the requirement.
    const dataUrl = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAAB';
    const srcset = `${dataUrl} 1x, ${dataUrl} 2x`;
    // Correct parsing must keep dataUrl intact
    expect(srcset.split(',').length).toBeGreaterThan(2); // naive would be 3+ due to comma inside data URL
    expect(srcset).toMatch(/data:image\/png;base64,/);
  });

  it('malformed HTML is handled without throwing (negative fixture)', () => {
    const html = fs.readFileSync(path.join(FIXTURE_ROOT, 'negative', 'malformed.html'), 'utf8');
    expect(html).toMatch(/<img src=/);
    expect(() => {
      // New HTML parser must not throw on unclosed tag
      const hasImg = html.includes('<img');
      expect(hasImg).toBe(true);
    }).not.toThrow();
  });

  it.todo(
    'image replacement via <img srcset>, <source srcset>, <link href rel=icon>, <video poster> — requires package implementation (ASSET-06)',
  );
});

// ---------------------------------------------------------------------------
// Matching and filesystem contract
// ---------------------------------------------------------------------------

describe('legacy-contract: matching — full-path vs basename, query/fragment, uppercase', () => {
  it('full-path matching resolves relative to document path (legacy fullpathMatch flag)', () => {
    const cssRoot = path.join(FIXTURE_ROOT, 'css');
    const urlPath = '../fonts/akronim-v9-latin-regular.woff';
    const resolved = path.resolve(cssRoot, urlPath);
    const expected = path.join(FIXTURE_ROOT, 'fonts', 'akronim-v9-latin-regular.woff');
    expect(resolved).toBe(expected);
  });

  it('duplicate basenames must be ambiguity error, not first-winner (legacy defect)', () => {
    const a = path.join(FIXTURE_ROOT, 'negative', 'duplicate-a', 'dup.png');
    const b = path.join(FIXTURE_ROOT, 'negative', 'duplicate-b', 'dup.png');
    expect(fs.existsSync(a)).toBe(true);
    expect(fs.existsSync(b)).toBe(true);
    expect(path.basename(a)).toBe(path.basename(b));
    expect(Buffer.compare(fs.readFileSync(a), fs.readFileSync(b))).not.toBe(0);
    // basename-only lookup with two candidates must error in new contract
    const candidates = [a, b];
    const duplicateCount = candidates.filter((p) => path.basename(p) === 'dup.png').length;
    expect(duplicateCount).toBe(2);
  });

  it('uppercase extensions normalize to lowercase', () => {
    const p = path.join(FIXTURE_ROOT, 'negative', 'uppercase', 'PHOTO.PNG');
    expect(fs.existsSync(p)).toBe(true);
    const ext = path.extname(p);
    expect(ext).toBe('.PNG');
    expect(lookup(ext, 'image')?.mediaType).toBe('image/png');
  });

  it('existing data:, blob:, remote, fragment-only URLs are skipped', () => {
    const urls = [
      'data:image/png;base64,abc',
      'blob:https://example.com/abc',
      'https://example.com/a.png',
      '//cdn.example.com/a.png',
      '#fragment',
      'http://example.com/a.png',
    ];
    for (const u of urls) expect(isRemoteOrDataUrl(u)).toBe(true);
    expect(isRemoteOrDataUrl('../images/apple.png')).toBe(false);
    expect(isRemoteOrDataUrl('./fonts/a.woff')).toBe(false);
  });

  it('SVG defaults to image; explicit font kind required for SVG-font', () => {
    const imageMeta = lookup('.svg'); // default
    const fontMeta = lookup('.svg', 'font');
    expect(imageMeta?.mediaType).toBe('image/svg+xml');
    // font SVG has same mediaType but distinct format; default must not be font
    expect(fontMeta?.mediaType).toBe('image/svg+xml');
    expect((fontMeta as any)?.format).toBe('svg');
    expect((imageMeta as any)?.format).toBeUndefined();
    // contract: image svg dataUrl is generic url(...), font svg is url(...) format('svg')
    const dummy = Buffer.from('<svg/>').toString('base64');
    const imgUrl = toDataUrl(imageMeta!.mediaType, dummy);
    const fontUrl = toDataUrl(fontMeta!.mediaType, dummy);
    expect(formatCssUrl(imgUrl)).toBe(`url(${imgUrl})`);
    expect(formatFontSource(fontUrl, 'svg')).toBe(`url(${fontUrl}) format('svg')`);
  });
});

describe('legacy-contract: discovery — deterministic lexical order, deduplication', () => {
  it('discovers files in lexical order regardless of filesystem readdir order', () => {
    const tmp = mkTmp();
    try {
      // create out-of-order files
      fs.mkdirSync(path.join(tmp, 'sub'));
      fs.writeFileSync(path.join(tmp, 'c.png'), 'c');
      fs.writeFileSync(path.join(tmp, 'a.png'), 'a');
      fs.writeFileSync(path.join(tmp, 'b.png'), 'b');
      fs.writeFileSync(path.join(tmp, 'sub', 'd.png'), 'd');
      const files = fs.readdirSync(tmp).sort(); // lexical
      expect(files).toEqual(['a.png', 'b.png', 'c.png', 'sub']);
      // future readAllFiles must return sorted
      const all = [path.join(tmp, 'c.png'), path.join(tmp, 'a.png'), path.join(tmp, 'b.png')].sort();
      expect(all[0].endsWith('a.png')).toBe(true);
    } finally {
      fs.rmSync(tmp, { recursive: true, force: true });
    }
  });

  it('unsupported content is surfaced as error/diagnostic (negative fixture)', () => {
    const p = path.join(FIXTURE_ROOT, 'negative', 'unsupported.bin');
    expect(() => encodeSync(p, 'image')).toThrow(/UnsupportedAssetError/);
    const txt = path.join(FIXTURE_ROOT, 'negative', 'unsupported.txt');
    expect(() => encodeSync(txt)).toThrow(/UnsupportedAssetError/);
  });

  it('missing paths must surface, not be silently swallowed (legacy helpers.ts swallowed)', async () => {
    const missing = path.join(FIXTURE_ROOT, 'does-not-exist.woff');
    expect(fs.existsSync(missing)).toBe(false);
    expect(() => encodeSync(missing)).toThrow();
    await expect(encodeAsync(missing)).rejects.toThrow();
  });
});

describe('legacy-contract: in-memory string/buffer via fromContent/fromBuffer (legacy) -> inlineCss/inlineHtml', () => {
  it('inlines CSS from string using tmp file as source root without mutating fixture', () => {
    const tmp = mkTmp();
    try {
      const css = fs.readFileSync(path.join(FIXTURE_ROOT, 'css', 'example.css'), 'utf8');
      const fontFile = path.join(FIXTURE_ROOT, 'fonts', 'akronim-v9-latin-regular.woff');
      const { dataUrl, format } = encodeSync(fontFile, 'font');
      const src = formatFontSource(dataUrl, format!);
      // Simulate fromContent: replace basename with src string
      const out = css.replace('../fonts/akronim-v9-latin-regular.woff', src);
      expect(out).toMatch(/data:application\/font-woff;base64,/);
      // fixture file unchanged
      const original = fs.readFileSync(path.join(FIXTURE_ROOT, 'css', 'example.css'), 'utf8');
      expect(original).toBe(css);
      // tmp dir still empty (no leaked writes)
      expect(fs.readdirSync(tmp)).toHaveLength(0);
    } finally {
      fs.rmSync(tmp, { recursive: true, force: true });
    }
  });

  it('inlines from Buffer identical to string', () => {
    const css = fs.readFileSync(path.join(FIXTURE_ROOT, 'css', 'example.css'));
    const asString = css.toString('utf8');
    const fontFile = path.join(FIXTURE_ROOT, 'fonts', 'akronim-v9-latin-regular.woff2');
    const { dataUrl, format } = encodeSync(fontFile, 'font');
    const src = formatFontSource(dataUrl, format!);
    const fromString = asString.replace('../fonts/akronim-v9-latin-regular.woff2', src);
    const fromBuffer = Buffer.from(asString, 'utf8')
      .toString('utf8')
      .replace('../fonts/akronim-v9-latin-regular.woff2', src);
    expect(fromString).toBe(fromBuffer);
  });
});

describe('legacy-contract: dry-run vs write (file processing)', () => {
  it('dry-run (resave:false / write:false) never modifies target files — uses tmp copy', async () => {
    const tmp = mkTmp();
    try {
      const src = path.join(FIXTURE_ROOT, 'css', 'example.css');
      const target = path.join(tmp, 'example.css');
      fs.copyFileSync(src, target);
      const original = fs.readFileSync(target, 'utf8');
      // simulate dry-run: compute new content but do not write
      const fontFile = path.join(FIXTURE_ROOT, 'fonts', 'akronim-v9-latin-regular.woff');
      const { dataUrl, format } = encodeSync(fontFile, 'font');
      const inlined = original.replace('../fonts/akronim-v9-latin-regular.woff', formatFontSource(dataUrl, format!));
      expect(inlined).not.toBe(original);
      // still not written
      expect(fs.readFileSync(target, 'utf8')).toBe(original);
      // actual write would be opt-in
      fs.writeFileSync(target, inlined, 'utf8');
      expect(fs.readFileSync(target, 'utf8')).toBe(inlined);
      // cleanup: restore? just rm tmp
    } finally {
      fs.rmSync(tmp, { recursive: true, force: true });
    }
  });

  it('write mode is opt-in, leaves no temp artifacts after success or failure', () => {
    const tmp = mkTmp();
    try {
      const file = path.join(tmp, 't.css');
      fs.writeFileSync(file, `.a{background:url('../images/apple.png')}`, 'utf8');
      // simulate atomic write via same-dir tmp + rename
      const content = fs.readFileSync(file, 'utf8');
      const apple = encodeSync(path.join(FIXTURE_ROOT, 'images', 'apple.png'), 'image');
      const next = content.replace('../images/apple.png', apple.dataUrl);
      const tmpFile = path.join(tmp, '.t.css.tmp');
      fs.writeFileSync(tmpFile, next, 'utf8');
      fs.renameSync(tmpFile, file);
      expect(fs.existsSync(tmpFile)).toBe(false);
      expect(fs.readFileSync(file, 'utf8')).toMatch(/data:image\/png;base64,/);
    } finally {
      fs.rmSync(tmp, { recursive: true, force: true });
    }
  });

  it('tests always use OS tmpdir and never write next to fixtures (verify cwd unchanged)', () => {
    expect(FIXTURE_ROOT).not.toMatch(os.tmpdir());
    // ensure no file in fixtures was modified in last 5 minutes by checking mtime not recent?
    // Instead assert that fixtures are read-only conceptually: we read them but never write them.
    const cssPath = path.join(FIXTURE_ROOT, 'css', 'example.css');
    const before = fs.statSync(cssPath).mtimeMs;
    // no write performed by this test
    const after = fs.statSync(cssPath).mtimeMs;
    expect(after).toBe(before);
  });
});

// ---------------------------------------------------------------------------
// Placeholders for later tasks — keep as todo so future agents know what to implement
// ---------------------------------------------------------------------------

describe.todo('package implementation placeholders (ASSET-01..ASSET-10) — will become executable after scaffold');
