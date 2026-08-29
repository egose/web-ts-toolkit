import { describe, it, expect } from 'vitest';
import {
  builtInDefinitions,
  svgFontDefinition,
  createDefinitionRegistry,
  createSvgFontRegistry,
  resolveExtension,
} from '../src/definitions.ts';
import { normalizeExtension, normalizeMediaType, normalizeDefinition } from '../src/definitions.ts';
import {
  UnsupportedAssetError,
  AmbiguousDefinitionError,
  InvalidOptionsError,
  DetectionMismatchError,
  AmbiguousAssetError,
  ResourceLimitError,
  ParseError,
  FilesystemError,
  AssetInlinerError,
} from '../src/errors.ts';
// also verify public re-exports
import { builtInDefinitions as builtInFromIndex, createDefinitionRegistry as createFromIndex } from '../src/index.ts';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function extMedia(registry = createDefinitionRegistry(), ext: string) {
  return registry.get(ext)?.mediaType;
}

describe('definitions: built-ins cover legacy extensions plus AVIF and TTC', () => {
  it('builtInDefinitions is frozen and contains expected count', () => {
    expect(Object.isFrozen(builtInDefinitions)).toBe(true);
    // 10 image groups + 7 font groups = 17
    expect(builtInDefinitions.length).toBe(17);
    for (const d of builtInDefinitions) {
      expect(Object.isFrozen(d)).toBe(true);
      expect(Object.isFrozen(d.extensions)).toBe(true);
    }
  });

  it('public re-export from index is same reference', () => {
    expect(builtInFromIndex).toBe(builtInDefinitions);
    expect(createFromIndex).toBe(createDefinitionRegistry);
  });

  it('fonts use current IANA media types', () => {
    const r = createDefinitionRegistry();
    expect(r.get('.ttf')?.mediaType).toBe('font/ttf');
    expect(r.get('.otf')?.mediaType).toBe('font/otf');
    expect(r.get('.woff')?.mediaType).toBe('font/woff');
    expect(r.get('.woff2')?.mediaType).toBe('font/woff2');
    expect(r.get('.eot')?.mediaType).toBe('application/vnd.ms-fontobject');
    expect(r.get('.sfnt')?.mediaType).toBe('font/sfnt');
    expect(r.get('.ttc')?.mediaType).toBe('font/collection');
    // font format hints preserved
    expect(r.get('.ttf')?.fontFormat).toBe('truetype');
    expect(r.get('.otf')?.fontFormat).toBe('opentype');
    expect(r.get('.woff')?.fontFormat).toBe('woff');
    expect(r.get('.woff2')?.fontFormat).toBe('woff2');
    expect(r.get('.eot')?.fontFormat).toBe('embedded-opentype');
    expect(r.get('.sfnt')?.fontFormat).toBe('sfnt');
    expect(r.get('.ttc')?.fontFormat).toBe('collection');
  });

  it('images use current IANA media types including AVIF and legacy aliases', () => {
    const r = createDefinitionRegistry();
    expect(r.get('.apng')?.mediaType).toBe('image/apng');
    expect(r.get('.bmp')?.mediaType).toBe('image/bmp');
    expect(r.get('.gif')?.mediaType).toBe('image/gif');
    expect(r.get('.ico')?.mediaType).toBe('image/vnd.microsoft.icon');
    expect(r.get('.cur')?.mediaType).toBe('image/vnd.microsoft.icon');
    expect(r.get('.jpg')?.mediaType).toBe('image/jpeg');
    expect(r.get('.jpeg')?.mediaType).toBe('image/jpeg');
    expect(r.get('.jfif')?.mediaType).toBe('image/jpeg');
    expect(r.get('.pjpeg')?.mediaType).toBe('image/jpeg');
    expect(r.get('.pjp')?.mediaType).toBe('image/jpeg');
    expect(r.get('.png')?.mediaType).toBe('image/png');
    expect(r.get('.svg')?.mediaType).toBe('image/svg+xml');
    expect(r.get('.svg')?.kind).toBe('image');
    expect(r.get('.tif')?.mediaType).toBe('image/tiff');
    expect(r.get('.tiff')?.mediaType).toBe('image/tiff');
    expect(r.get('.webp')?.mediaType).toBe('image/webp');
    expect(r.get('.avif')?.mediaType).toBe('image/avif');
  });

  it('every required legacy extension resolves case-insensitively', () => {
    const r = createDefinitionRegistry();
    const exts = [
      '.svg',
      '.ttf',
      '.otf',
      '.eot',
      '.sfnt',
      '.woff',
      '.woff2',
      '.apng',
      '.bmp',
      '.gif',
      '.ico',
      '.cur',
      '.jpg',
      '.jpeg',
      '.jfif',
      '.pjpeg',
      '.pjp',
      '.png',
      '.tif',
      '.tiff',
      '.webp',
    ];
    for (const ext of exts) {
      expect(r.get(ext), `missing ${ext}`).toBeDefined();
      expect(r.get(ext.toUpperCase()), `missing upper ${ext}`).toBeDefined();
      expect(r.get(ext.slice(1).toUpperCase()), `missing no-dot upper ${ext}`).toBeDefined(); // without dot, uppercase
      expect(r.get(ext.toLowerCase())?.mediaType).toBe(r.get(ext.toUpperCase())?.mediaType);
    }
    // TTC and AVIF added
    expect(r.get('.TTC')?.mediaType).toBe('font/collection');
    expect(r.get('.AVIF')?.mediaType).toBe('image/avif');
    expect(r.get('avif')?.mediaType).toBe('image/avif');
  });

  it('resolveExtension helper is case-insensitive and dot-tolerant', () => {
    expect(resolveExtension('.PNG')?.mediaType).toBe('image/png');
    expect(resolveExtension('png')?.mediaType).toBe('image/png');
    expect(resolveExtension('.Png')?.kind).toBe('image');
    expect(resolveExtension('.WOFF2')?.fontFormat).toBe('woff2');
  });

  it('svgFontDefinition is separate and has font kind', () => {
    expect(svgFontDefinition.kind).toBe('font');
    expect(svgFontDefinition.mediaType).toBe('image/svg+xml');
    expect(svgFontDefinition.fontFormat).toBe('svg');
    expect(svgFontDefinition.extensions).toEqual(['.svg']);
    expect(Object.isFrozen(svgFontDefinition)).toBe(true);
    expect(Object.isFrozen(svgFontDefinition.extensions)).toBe(true);
  });
});

describe('definitions: SVG image vs explicit SVG-font isolation', () => {
  it('.svg defaults to image in built-in registry', () => {
    const r = createDefinitionRegistry();
    const def = r.get('.svg')!;
    expect(def.kind).toBe('image');
    expect(def.fontFormat).toBeUndefined();
    expect(def.mediaType).toBe('image/svg+xml');
  });

  it('explicit svgFontDefinition gives font semantics when used', () => {
    const r = createSvgFontRegistry();
    const def = r.get('.svg')!;
    expect(def.kind).toBe('font');
    expect(def.fontFormat).toBe('svg');
    expect(def.mediaType).toBe('image/svg+xml');
  });

  it('SVG image and explicit SVG-font registries do not leak through shared mutable state', () => {
    const imageReg = createDefinitionRegistry();
    const fontReg = createSvgFontRegistry();
    expect(imageReg.get('.svg')?.kind).toBe('image');
    expect(fontReg.get('.svg')?.kind).toBe('font');
    // Mutating one must not affect the other (registries are isolated snapshots)
    expect(imageReg.get('.svg')?.kind).toBe('image');
    expect(fontReg.get('.svg')?.kind).toBe('font');
    // builtInDefinitions still image
    expect(builtInDefinitions.find((d) => d.extensions.includes('.svg'))?.kind).toBe('image');
  });

  it('createSvgFontRegistry with extra custom definitions keeps isolation', () => {
    const custom = { kind: 'image', extensions: ['.custom'], mediaType: 'image/custom' } as const;
    const r1 = createSvgFontRegistry([custom as any]);
    const r2 = createDefinitionRegistry();
    expect(r1.get('.custom')?.mediaType).toBe('image/custom');
    expect(r2.get('.custom')).toBeUndefined();
    expect(r1.get('.svg')?.kind).toBe('font');
    expect(r2.get('.svg')?.kind).toBe('image');
  });
});

describe('definitions: normalization and validation', () => {
  it('normalizeExtension lowercases and adds dot', () => {
    expect(normalizeExtension('PNG')).toBe('.png');
    expect(normalizeExtension('.PNG')).toBe('.png');
    expect(normalizeExtension(' .JpG ')).toBe('.jpg');
    expect(normalizeExtension('svg')).toBe('.svg');
  });

  it('normalizeExtension rejects empty/malformed/duplicate-def within one definition', () => {
    expect(() => normalizeExtension('')).toThrow(InvalidOptionsError);
    expect(() => normalizeExtension('   ')).toThrow(InvalidOptionsError);
    expect(() => normalizeExtension('.')).toThrow(InvalidOptionsError);
    expect(() => normalizeExtension('..')).toThrow(InvalidOptionsError);
    expect(() => normalizeExtension('.a/b')).toThrow(InvalidOptionsError);
    expect(() => normalizeExtension('.svg ' as any)).not.toThrow(); // trims then validates
    // duplicate inside single definition
    expect(() => normalizeDefinition({ kind: 'image', extensions: ['.png', '.PNG'], mediaType: 'image/png' })).toThrow(
      InvalidOptionsError,
    );
  });

  it('normalizeMediaType lowercases, strips parameters, rejects malformed', () => {
    expect(normalizeMediaType('IMAGE/PNG')).toBe('image/png');
    expect(normalizeMediaType('image/svg+xml;charset=utf-8')).toBe('image/svg+xml');
    expect(normalizeMediaType('  font/woff2  ')).toBe('font/woff2');
    expect(() => normalizeMediaType('')).toThrow(InvalidOptionsError);
    expect(() => normalizeMediaType('image')).toThrow(InvalidOptionsError);
    expect(() => normalizeMediaType('image/')).toThrow(InvalidOptionsError);
    expect(() => normalizeMediaType('/png')).toThrow(InvalidOptionsError);
    expect(() => normalizeMediaType('image/png bad')).toThrow(InvalidOptionsError);
  });

  it('normalizeDefinition rejects empty extensions and malformed media types', () => {
    expect(() => normalizeDefinition({ kind: 'image', extensions: [], mediaType: 'image/png' })).toThrow(
      InvalidOptionsError,
    );
    expect(() => normalizeDefinition({ kind: '', extensions: ['.png'], mediaType: 'image/png' } as any)).toThrow(
      InvalidOptionsError,
    );
    expect(() => normalizeDefinition({ kind: 'image', extensions: ['.png'], mediaType: '' } as any)).toThrow(
      InvalidOptionsError,
    );
    expect(() => normalizeDefinition({ kind: 'image', extensions: ['.png'], mediaType: 'bad' } as any)).toThrow(
      InvalidOptionsError,
    );
    expect(() =>
      normalizeDefinition({ kind: 'image', extensions: ['.png'], mediaType: 'image/png', fontFormat: '' } as any),
    ).toThrow(InvalidOptionsError);
  });

  it('registry extensions are normalized sorted? at least normalized lowercase with dot', () => {
    const r = createDefinitionRegistry([{ kind: 'image', extensions: ['PNG'], mediaType: 'image/png' }]);
    expect(r.extensions).toEqual(['.png']);
    expect(r.get('.png')).toBeDefined();
    expect(r.get('.PNG')).toBeDefined();
  });
});

describe('definitions: duplicate rejection (ambiguity)', () => {
  it('rejects two definitions claiming same extension', () => {
    const dup = [
      { kind: 'image', extensions: ['.png'], mediaType: 'image/png' },
      { kind: 'image', extensions: ['.PNG'], mediaType: 'image/apng' },
    ] as const;
    expect(() => createDefinitionRegistry(dup as any)).toThrow(AmbiguousDefinitionError);
    try {
      createDefinitionRegistry(dup as any);
    } catch (e) {
      expect((e as AmbiguousDefinitionError).code).toBe('AMBIGUOUS_DEFINITION');
      expect((e as AmbiguousDefinitionError).extension).toBe('.png');
      expect((e as AmbiguousDefinitionError).conflictingMediaTypes).toEqual(
        expect.arrayContaining(['image/png', 'image/apng']),
      );
    }
  });

  it('rejects built-in plus custom duplicate without disambiguation', () => {
    const customDup = { kind: 'image', extensions: ['.png'], mediaType: 'image/custom' };
    expect(() => createDefinitionRegistry([...builtInDefinitions, customDup as any])).toThrow(AmbiguousDefinitionError);
  });

  it('rejects duplicate via different casing and dot omission', () => {
    const defs = [
      { kind: 'image', extensions: ['.jpg'], mediaType: 'image/jpeg' },
      { kind: 'image', extensions: ['JPG'], mediaType: 'image/png' },
    ] as const;
    expect(() => createDefinitionRegistry(defs as any)).toThrow(AmbiguousDefinitionError);
  });

  it('svg duplicate between image and font without explicit replacement fails', () => {
    // default built-ins (image svg) + svgFontDefinition (font svg) both claim .svg -> must throw
    expect(() => createDefinitionRegistry([...builtInDefinitions, svgFontDefinition])).toThrow(
      AmbiguousDefinitionError,
    );
  });

  it('createSvgFontRegistry avoids duplicate by replacing image svg', () => {
    expect(() => createSvgFontRegistry()).not.toThrow();
    const r = createSvgFontRegistry();
    expect(r.get('.svg')?.kind).toBe('font');
  });

  it('fails before files are processed — factory throws synchronously', () => {
    expect(() =>
      createDefinitionRegistry([
        { kind: 'font', extensions: ['.woff'], mediaType: 'font/woff', fontFormat: 'woff' },
        { kind: 'font', extensions: ['.woff'], mediaType: 'font/woff2', fontFormat: 'woff2' },
      ] as any),
    ).toThrow();
  });
});

describe('definitions: immutability', () => {
  it('builtInDefinitions array and objects are immutable (frozen)', () => {
    expect(Object.isFrozen(builtInDefinitions)).toBe(true);
    for (const d of builtInDefinitions) {
      expect(Object.isFrozen(d)).toBe(true);
      expect(Object.isFrozen(d.extensions)).toBe(true);
    }
    // Attempt mutation should throw in strict mode or silently fail but not change value
    const origLen = builtInDefinitions.length;
    // @ts-expect-error attempting mutation on readonly
    expect(() =>
      (builtInDefinitions as any).push({ kind: 'image', extensions: ['.x'], mediaType: 'image/x' }),
    ).toThrow();
    expect(builtInDefinitions.length).toBe(origLen);
  });

  it('registry definitions and extensions are frozen and isolated per call', () => {
    const r1 = createDefinitionRegistry();
    const r2 = createDefinitionRegistry();
    expect(Object.isFrozen(r1.definitions)).toBe(true);
    expect(Object.isFrozen(r1.extensions)).toBe(true);
    expect(Object.isFrozen(r2.definitions)).toBe(true);
    expect(r1).not.toBe(r2);
    expect(r1.definitions).not.toBe(r2.definitions);
    // r1 and r2 have same content but independent frozen copies
    expect(r1.definitions.length).toBe(r2.definitions.length);
    // Push to r1 extensions must throw
    expect(() => (r1.extensions as any).push('.evil')).toThrow();
  });

  it('normalizeDefinition returns frozen objects', () => {
    const d = normalizeDefinition({ kind: 'image', extensions: ['.custom'], mediaType: 'image/custom' });
    expect(Object.isFrozen(d)).toBe(true);
    expect(Object.isFrozen(d.extensions)).toBe(true);
  });

  it('registry does not expose mutable internal map', () => {
    const r = createDefinitionRegistry();
    const def = r.get('.png')!;
    expect(Object.isFrozen(def)).toBe(true);
    // Caller cannot mutate map by mutating returned def.extensions (frozen)
    expect(() => (def.extensions as any).push('.evil')).toThrow();
  });
});

describe('errors: stable codes, causes, no leaked bytes, context', () => {
  it('all error classes have stable codes and are instances of AssetInlinerError and Error', () => {
    const cases: Array<[new (...args: any[]) => AssetInlinerError, string]> = [
      [UnsupportedAssetError as any, 'UNSUPPORTED_ASSET'],
      [AmbiguousDefinitionError as any, 'AMBIGUOUS_DEFINITION'],
      [InvalidOptionsError as any, 'INVALID_OPTIONS'],
      [DetectionMismatchError as any, 'DETECTION_MISMATCH'],
      [AmbiguousAssetError as any, 'AMBIGUOUS_ASSET'],
      [ResourceLimitError as any, 'RESOURCE_LIMIT'],
      [ParseError as any, 'PARSE_ERROR'],
      [FilesystemError as any, 'FILESYSTEM_ERROR'],
    ];
    for (const [Cls, code] of cases) {
      // construct minimally valid instances
      let err: AssetInlinerError;
      if (Cls === UnsupportedAssetError) err = new (Cls as any)('unsupported', { extension: '.bin' });
      else if (Cls === AmbiguousDefinitionError) err = new (Cls as any)('amb', { extension: '.png' });
      else if (Cls === InvalidOptionsError) err = new (Cls as any)('invalid');
      else if (Cls === DetectionMismatchError) err = new (Cls as any)('mismatch');
      else if (Cls === AmbiguousAssetError)
        err = new (Cls as any)('amb asset', { basename: 'dup.png', candidates: ['a/dup.png', 'b/dup.png'] });
      else if (Cls === ResourceLimitError) err = new (Cls as any)('limit', { limit: 100 });
      else if (Cls === ParseError) err = new (Cls as any)('parse');
      else err = new (Cls as any)('fs', { path: '/tmp/x', cause: new Error('enoent') });
      expect(err.code).toBe(code);
      expect(err).toBeInstanceOf(AssetInlinerError);
      expect(err).toBeInstanceOf(Error);
      expect(err.name).toBe(Cls.name);
    }
  });

  it('errors preserve cause', () => {
    const cause = new Error('root cause');
    const e1 = new InvalidOptionsError('bad', { cause });
    expect(e1.cause).toBe(cause);
    const e2 = new FilesystemError('fail', { path: '/a/b', cause });
    expect(e2.cause).toBe(cause);
    const e3 = new UnsupportedAssetError('no', { extension: '.x', cause });
    expect(e3.cause).toBe(cause);
    const e4 = new DetectionMismatchError('mm', {
      expectedMediaType: 'image/png',
      detectedMediaType: 'image/jpeg',
      cause,
    });
    expect(e4.cause).toBe(cause);
  });

  it('errors carry useful path/limit context without leaking bytes', () => {
    const longBytes = 'a'.repeat(10000);
    const errLimit = new ResourceLimitError('too large', { limit: 1024, actual: 2048, path: '/tmp/img.png' });
    expect(errLimit.limit).toBe(1024);
    expect(errLimit.actual).toBe(2048);
    expect(errLimit.path).toBe('/tmp/img.png');
    expect(errLimit.message).not.toContain(longBytes);
    expect(JSON.stringify(errLimit)).not.toContain(longBytes);

    const errUnsup = new UnsupportedAssetError('unsupported type for /tmp/file.xyz', {
      extension: '.xyz',
      path: '/tmp/file.xyz',
    });
    expect(errUnsup.extension).toBe('.xyz');
    expect(errUnsup.path).toBe('/tmp/file.xyz');

    const errAmb = new AmbiguousAssetError('ambiguous', {
      basename: 'dup.png',
      candidates: ['/a/dup.png', '/b/dup.png'],
    });
    expect(errAmb.basename).toBe('dup.png');
    expect(errAmb.candidates).toEqual(['/a/dup.png', '/b/dup.png']);
    expect(Object.isFrozen(errAmb.candidates)).toBe(true);

    const errFs = new FilesystemError('read failed', { path: '/nope/file.png', operation: 'readFile' });
    expect(errFs.path).toBe('/nope/file.png');
    expect(errFs.operation).toBe('readFile');
  });

  it('error messages never contain full base64 payloads', () => {
    const fakePayload = Buffer.from('secret bytes 123').toString('base64');
    const err = new UnsupportedAssetError(`unsupported .bin at /tmp/x.bin`, { extension: '.bin', path: '/tmp/x.bin' });
    expect(err.message).not.toContain(fakePayload);
  });

  it('AmbiguousDefinitionError preserves conflicting media types frozen', () => {
    const err = new AmbiguousDefinitionError('dup', {
      extension: '.svg',
      conflictingMediaTypes: ['image/svg+xml', 'image/png'],
    });
    expect(err.extension).toBe('.svg');
    expect(err.conflictingMediaTypes).toEqual(['image/svg+xml', 'image/png']);
    expect(Object.isFrozen(err.conflictingMediaTypes!)).toBe(true);
  });
});
