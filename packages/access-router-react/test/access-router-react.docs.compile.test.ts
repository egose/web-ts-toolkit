import { createHash } from 'node:crypto';
import { cpSync, existsSync, readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';

import { cleanupTempRoots, installPackedConsumer, packageRoot, run, workspaceRoot } from './packed-consumer-harness';

/**
 * ARR-10: documentation compile test (README scope).
 *
 * Extracts every TypeScript / TSX code block from the *installed* package
 * README.md into a fixture under `test-docs-consumer/examples/` and compiles
 * them against the *packed* npm tarball — the same artifact exercised by the
 * packed-consumer compatibility test — under strict NodeNext and Bundler
 * resolution with `strict: true` and `skipLibCheck: false`.
 *
 * A drift in any documented public name (removed export, renamed option key,
 * stale response shape, invalid method signature) surfaces as a `tsc` error
 * rather than being silently shipped in the README. Intentionally partial
 * snippets are embedded in larger fixtures whose surrounding context is
 * documented in `test-docs-consumer/snippets-mapping.md`.
 *
 * ARR-10 scope covers the README — the published artifact every installed
 * consumer can read. The website docs
 * (`website/docs/packages/access-router-react.md`) are owned by ARR-11
 * ("documentation consumer fixtures" + "Align Shipped Documentation And
 * Compatibility Coverage"). This file mirrors the access-router-client
 * ARC-20 docs-compile harness layout so ARR-11 can extend the same harness
 * and inventory format with the website-docs fixtures without restructuring
 * ARR-10's work.
 *
 * The packed-tarball install keeps this test honest: the fixtures import
 * `@web-ts-toolkit/access-router-react` from a fresh `node_modules`, so an
 * example that uses a name only present in `src/` (not in the published
 * declarations) or references a private `src/*` / `dist/*` path fails to
 * compile here even though the source-level test suite would pass.
 */

const docsExamplesDir = path.resolve(packageRoot, 'test-docs-consumer', 'examples');
const docsTsconfigDir = path.resolve(packageRoot, 'test-docs-consumer');
const snippetsMappingPath = path.resolve(docsTsconfigDir, 'snippets-mapping.md');

type BlockClassification = 'exact' | 'scaffolded' | 'partial' | 'negative';

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
    .filter((line: string) => line.trim() && !line.startsWith('#'))
    .map((line: string) => {
      const [source, ordinalText, hash, classificationText, fixtureText, ...extra] = line.split('\t');
      const classification = classificationText as BlockClassification;
      const ordinal = Number(ordinalText);
      if (
        extra.length > 0 ||
        !source ||
        !Number.isInteger(ordinal) ||
        !/^[a-f0-9]{64}$/.test(hash ?? '') ||
        !['exact', 'scaffolded', 'partial', 'negative'].includes(classification) ||
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

function extractScaffoldedBlock(fixtureContent: string, blockId: string): string {
  const normalized = fixtureContent.replace(/\r\n/g, '\n');
  const startMarker = `// docs-block-start: ${blockId}`;
  const endMarker = `// docs-block-end: ${blockId}`;
  const startIndex = normalized.indexOf(startMarker);
  const endIndex = normalized.indexOf(endMarker);

  if (startIndex === -1 || endIndex === -1 || endIndex <= startIndex) {
    throw new Error(`Missing scaffold markers for ${blockId}`);
  }

  return normalized
    .slice(startIndex + startMarker.length, endIndex)
    .replace(/^\n/, '')
    .replace(/\n[ \t]*$/, '');
}

afterAll(() => {
  cleanupTempRoots();
});

describe('ARR-10/ARR-11 documentation examples (README + website) compile against the packed artifact', () => {
  it('maps every actual TypeScript documentation block in the README and website docs to a fixture or an explicit partial/negative classification', () => {
    expect(existsSync(docsExamplesDir)).toBe(true);
    const fixtures = readdirSync(docsExamplesDir).filter((f: string) => /\.(ts|tsx)$/.test(f));
    expect(fixtures.length).toBeGreaterThan(0);
    expect(existsSync(snippetsMappingPath)).toBe(true);

    // ARR-10 established the README-only scope. ARR-11 implementation
    // requirement #4 extends the same harness to also cover the website doc
    // (`website/docs/packages/access-router-react.md`) and the additional
    // representative fixtures (basic, advanced projection, failure /
    // cancellation, Active Record integration). The mapping inventory rows
    // are per-block for each source path; an entry's `source` plus
    // `ordinal` identifies a TypeScript fence in that document.
    const sourcePaths = [
      path.relative(workspaceRoot, path.resolve(packageRoot, 'README.md')).replace(/\\/g, '/'),
      path
        .relative(workspaceRoot, path.resolve(workspaceRoot, 'website/docs/packages/access-router-react.md'))
        .replace(/\\/g, '/'),
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
      if (mapped.classification === 'exact' || mapped.classification === 'scaffolded') {
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
        } else if (mapped.classification === 'scaffolded') {
          const sourceBlock = actualById.get(mapped.id);
          expect(extractScaffoldedBlock(fixtureContent, mapped.id), `${mapped.id} scaffolded fixture drifted`).toBe(
            sourceBlock?.content,
          );
        }
      }
    }
  });

  it('installs the staged tarball + internal dependency closure + React peer deps and compiles every README and website example under strict NodeNext and Bundler resolution against the published declarations', () => {
    const consumerDir = installPackedConsumer();

    // Copy the example fixtures + the two strict tsconfigs into the
    // freshly installed consumer tree. The consumer's installed
    // `node_modules/@web-ts-toolkit/access-router-react` resolves the
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
    // declaration surface is fully checked. Any doc example that references
    // an unexported name, a renamed option key, or a stale response shape
    // fails here.
    run('pnpm', ['exec', 'tsc', '-p', 'tsconfig-nodenext.json'], consumerDir);

    // Strict Bundler typecheck — same fixtures, Bundler resolution through
    // the export map's `types` field. `skipLibCheck: false`. Bundler lets
    // us catch distinct drift (e.g. a name reachable only via the `import`
    // condition's `.d.mts`).
    run('pnpm', ['exec', 'tsc', '-p', 'tsconfig-bundler.json'], consumerDir);
  }, 240_000);
});
