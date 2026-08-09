import { createHash } from 'node:crypto';
import { cpSync, existsSync, readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';

import { cleanupTempRoots, installPackedConsumer, packageRoot, run, workspaceRoot } from './packed-consumer-harness';

/**
 * ARC-20: documentation compile test.
 *
 * Extracts every "complete" TypeScript code block from the installed docs
 * (`README.md`, `llms.txt`) and the website docs
 * (all `.md`/`.mdx` files below the website access-router-client docs) into fixture files in
 * `test-docs-consumer/examples/` and compiles them against the *packed* npm
 * tarball — the same artifact exercised by ARC-18 — under strict NodeNext
 * and Bundler resolution with `strict: true` and `skipLibCheck: false`.
 *
 * A drift in any documented public name (removed export, renamed option key,
 * stale response shape, invalid method signature) surfaces as a `tsc` error
 * rather than being silently shipped in the docs. Intentionally partial
 * snippets (one-line concept demonstrations that cannot compile on their own)
 * are embedded into the larger fixture that anchors them, recorded in
 * `test-docs-consumer/snippets-mapping.md`.
 *
 * The packed-tarball install keeps this test honest: the fixtures import
 * `@web-ts-toolkit/access-router-client` from a fresh `node_modules`, so an
 * example that uses a name only present in `src/` (not in the published
 * declarations) fails to compile here even though the source-level test
 * suite would pass.
 */

const docsExamplesDir = path.resolve(packageRoot, 'test-docs-consumer', 'examples');
const docsTsconfigDir = path.resolve(packageRoot, 'test-docs-consumer');
const snippetsMappingPath = path.resolve(docsTsconfigDir, 'snippets-mapping.md');
const websiteDocsDir = path.resolve(workspaceRoot, 'website', 'docs', 'packages', 'access-router-client');

type BlockClassification = 'exact' | 'derived' | 'partial' | 'negative';

type DocumentedBlock = {
  id: string;
  source: string;
  ordinal: number;
  content: string;
  hash: string;
};

type MappedBlock = {
  id: string;
  hash: string;
  classification: BlockClassification;
  fixture?: string;
};

function listMarkdownSources(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true })
    .flatMap((entry) => {
      const entryPath = path.resolve(dir, entry.name);
      if (entry.isDirectory()) {
        return listMarkdownSources(entryPath);
      }
      return /\.mdx?$/.test(entry.name) ? [entryPath] : [];
    })
    .sort();
}

function extractTypeScriptBlocks(sourcePath: string): DocumentedBlock[] {
  const absolutePath = path.resolve(workspaceRoot, sourcePath);
  const lines = readFileSync(absolutePath, 'utf8').replace(/\r\n/g, '\n').split('\n');
  const blocks: DocumentedBlock[] = [];

  for (let lineIndex = 0; lineIndex < lines.length; lineIndex += 1) {
    const opening = lines[lineIndex].match(/^ {0,3}(`{3,}|~{3,})\s*([^\s{]+)?/);
    const language = opening?.[2]?.toLowerCase();
    if (!opening || !['ts', 'typescript', 'tsx'].includes(language ?? '')) {
      continue;
    }

    const marker = opening[1][0];
    const minimumLength = opening[1].length;
    const contentLines: string[] = [];
    let closingLine = lineIndex + 1;
    for (; closingLine < lines.length; closingLine += 1) {
      const candidate = lines[closingLine].trim();
      if (candidate.length >= minimumLength && [...candidate].every((character) => character === marker)) {
        break;
      }
      contentLines.push(lines[closingLine]);
    }
    if (closingLine === lines.length) {
      throw new Error(`Unclosed TypeScript code fence in ${sourcePath}:${lineIndex + 1}`);
    }

    const content = contentLines.join('\n');
    const ordinal = blocks.length + 1;
    blocks.push({
      id: `${sourcePath}#${ordinal}`,
      source: sourcePath,
      ordinal,
      content,
      hash: createHash('sha256').update(content).digest('hex'),
    });
    lineIndex = closingLine;
  }

  return blocks;
}

function readMappedBlocks(): MappedBlock[] {
  const mapping = readFileSync(snippetsMappingPath, 'utf8');
  const inventory = mapping.match(/```text docs-block-map\n([\s\S]*?)\n```/);
  if (!inventory) {
    throw new Error(`Missing machine-readable docs-block-map inventory in ${snippetsMappingPath}`);
  }

  return inventory[1]
    .split('\n')
    .filter((line) => line.trim() && !line.startsWith('#'))
    .map((line) => {
      const [source, ordinalText, hash, classificationText, fixtureText, ...extra] = line.split('\t');
      const classification = classificationText as BlockClassification;
      const ordinal = Number(ordinalText);
      if (
        extra.length > 0 ||
        !source ||
        !Number.isInteger(ordinal) ||
        !/^[a-f0-9]{64}$/.test(hash ?? '') ||
        !['exact', 'derived', 'partial', 'negative'].includes(classification) ||
        !fixtureText
      ) {
        throw new Error(`Invalid docs-block-map row: ${line}`);
      }
      return {
        id: `${source}#${ordinal}`,
        hash,
        classification,
        fixture: fixtureText === '-' ? undefined : fixtureText,
      };
    });
}

function executableSourceFragments(content: string): string[] {
  const withoutComments = content.replace(/\/\/.*$/gm, '');
  const importFragments = [
    ...withoutComments.matchAll(/import\s+(?:type\s+)?{([\s\S]*?)}\s+from\s+(['"][^'"]+['"]);?/g),
  ].flatMap(([, names, moduleName]) => [
    ...names
      .split(',')
      .map((name) => name.trim().split(/\s+as\s+/)[0])
      .filter(Boolean),
    moduleName,
  ]);
  const body = withoutComments.replace(/import\s+(?:type\s+)?{[\s\S]*?}\s+from\s+(['"][^'"]+['"]);?/g, '');

  return [
    ...importFragments.map((fragment) => fragment.replace(/\s+/g, '')),
    ...body
      .split('\n')
      .map((line) => line.replace(/\s+/g, ''))
      .filter((line) => line.length > 1 && line !== '{' && line !== '}' && line !== ');' && line !== '};'),
  ];
}

afterAll(() => {
  cleanupTempRoots();
});

describe('ARC-20 documentation examples compile against the packed artifact', () => {
  it('maps every actual TypeScript documentation block to a fixture or an explicit partial/negative classification', () => {
    expect(existsSync(docsExamplesDir)).toBe(true);
    const fixtures = readdirSync(docsExamplesDir).filter((f) => f.endsWith('.ts'));
    expect(fixtures.length).toBeGreaterThan(0);
    expect(existsSync(snippetsMappingPath)).toBe(true);

    const sourcePaths = [
      path.relative(workspaceRoot, path.resolve(packageRoot, 'README.md')).replace(/\\/g, '/'),
      path.relative(workspaceRoot, path.resolve(packageRoot, 'llms.txt')).replace(/\\/g, '/'),
      ...listMarkdownSources(websiteDocsDir).map((file) => path.relative(workspaceRoot, file).replace(/\\/g, '/')),
    ];
    const actualBlocks = sourcePaths.flatMap(extractTypeScriptBlocks);
    const mappedBlocks = readMappedBlocks();

    expect(new Set(actualBlocks.map((block) => block.id)).size).toBe(actualBlocks.length);
    expect(new Set(mappedBlocks.map((block) => block.id)).size).toBe(mappedBlocks.length);
    expect(mappedBlocks.map(({ id, hash }) => ({ id, hash })).sort((a, b) => a.id.localeCompare(b.id))).toEqual(
      actualBlocks.map(({ id, hash }) => ({ id, hash })).sort((a, b) => a.id.localeCompare(b.id)),
    );

    const actualById = new Map(actualBlocks.map((block) => [block.id, block]));
    for (const mapped of mappedBlocks) {
      if (mapped.classification === 'exact' || mapped.classification === 'derived') {
        expect(mapped.fixture, `${mapped.id} must name its compiled fixture`).toBeDefined();
      }
      if (mapped.fixture) {
        const fixturePath = path.resolve(docsExamplesDir, mapped.fixture);
        expect(existsSync(fixturePath), `${mapped.id} maps to missing fixture ${mapped.fixture}`).toBe(true);
        const fixtureContent = readFileSync(fixturePath, 'utf8');
        if (mapped.classification === 'exact') {
          expect(fixtureContent.trim(), `${mapped.id} exact fixture drifted`).toBe(
            actualById.get(mapped.id)?.content.trim(),
          );
        } else if (mapped.classification === 'derived') {
          const sourceBlock = actualById.get(mapped.id);
          const fixtureWithoutWhitespace = fixtureContent.replace(/\/\/.*$/gm, '').replace(/\s+/g, '');
          const missingLines = executableSourceFragments(sourceBlock?.content ?? '').filter(
            (line) => !fixtureWithoutWhitespace.includes(line),
          );
          expect(missingLines, `${mapped.id} has executable lines absent from ${mapped.fixture}`).toEqual([]);
        }
      }
    }
  });

  it('installs the staged tarball + internal dependency closure and compiles every doc example under strict NodeNext and Bundler resolution against the published declarations', () => {
    const consumerDir = installPackedConsumer();

    // Copy the example fixtures + the two strict tsconfigs into the
    // freshly installed consumer tree. The consumer's installed
    // `node_modules/@web-ts-toolkit/access-router-client` resolves the
    // package's declarations via the published export map (no `paths`
    // override), exactly as an external consumer installing the npm
    // tarball would.
    cpSync(docsExamplesDir, path.resolve(consumerDir, 'examples'), { recursive: true });
    for (const file of ['tsconfig-nodenext.json', 'tsconfig-bundler.json']) {
      const source = path.resolve(docsTsconfigDir, file);
      if (!existsSync(source)) {
        throw new Error(`missing docs tsconfig fixture: ${source}`);
      }
      cpSync(source, path.resolve(consumerDir, file));
    }

    // List the example fixtures actually copied so the failure message is
    // explicit if the staging mishandled the directory.
    const copied = readdirSync(path.resolve(consumerDir, 'examples')).sort();
    expect(copied.length).toBeGreaterThan(0);

    // Strict NodeNext typecheck against the installed declarations,
    // resolved through the export map's per-condition `types.import`
    // (`./index.d.mts`). `skipLibCheck: false` so the package's own
    // declaration surface is fully checked; `topLevelAwait: 'always'`
    // because several fixtures use top-level `await` (mirroring the docs'
    // quickstart shape). Any doc example that references an unexported
    // name, a renamed option key, or a stale response shape fails here.
    run('pnpm', ['exec', 'tsc', '-p', 'tsconfig-nodenext.json'], consumerDir);

    // Strict Bundler typecheck — same fixtures, Bundler resolution through
    // the export map's `types` field. `skipLibCheck: false`. Bundler
    // lets us catch distinct drift (e.g. a name reachable only via the
    // `import` condition's `.d.mts`).
    run('pnpm', ['exec', 'tsc', '-p', 'tsconfig-bundler.json'], consumerDir);
  }, 240_000);
});
