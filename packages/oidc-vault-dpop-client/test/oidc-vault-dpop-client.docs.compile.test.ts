import { mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';

import { cleanupTempRoots, installPackedConsumer, packageRoot, run, workspaceRoot } from './packed-consumer-harness';

/**
 * CLIENT-06: documentation compile harness (README scope).
 *
 * Extracts every TypeScript code block from the installed `README.md` and
 * compiles the blocks against the *packed* npm tarball — the same artifact
 * exercised by the packed-consumer test — under strict NodeNext and
 * Bundler resolution with `strict: true`, `skipLibCheck: false`, `types: []`.
 * Neither Node/Express types nor the backend package is installed.
 *
 * A drift in any documented public name (removed export, renamed option
 * key, stale response shape) surfaces as a `tsc` error rather than being
 * silently shipped in the README. The packed-tarball install keeps this
 * test honest: fixtures import `@web-ts-toolkit/oidc-vault-dpop-client`
 * from a fresh `node_modules`, so an example that uses a name only present
 * in `src/` (not in the published declarations) fails to compile here even
 * though the source-level suite would pass.
 *
 * A missing README/example set fails rather than becoming a skipped lane.
 */

type DocumentedBlock = {
  ordinal: number;
  content: string;
};

function extractTypeScriptBlocks(sourcePath: string): DocumentedBlock[] {
  const lines = readFileSync(sourcePath, 'utf8').replace(/\r\n/g, '\n').split('\n');
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
      ordinal,
      content,
    });
    lineIndex = closingLine;
  }

  return blocks;
}

const TSCONFIG_NODENEXT = `{
  "compilerOptions": {
    "target": "ES2022",
    "lib": ["ES2022", "DOM", "DOM.Iterable"],
    "module": "NodeNext",
    "moduleResolution": "NodeNext",
    "strict": true,
    "skipLibCheck": false,
    "noEmit": true,
    "esModuleInterop": true,
    "types": []
  },
  "include": ["examples/*.ts"]
}
`;

const TSCONFIG_BUNDLER = `{
  "compilerOptions": {
    "target": "ES2022",
    "lib": ["ES2022", "DOM", "DOM.Iterable"],
    "module": "ESNext",
    "moduleResolution": "Bundler",
    "strict": true,
    "skipLibCheck": false,
    "noEmit": true,
    "esModuleInterop": true,
    "types": []
  },
  "include": ["examples/*.ts"]
}
`;

afterAll(() => {
  cleanupTempRoots();
});

describe('CLIENT-06 documentation examples compile against the packed artifact', () => {
  it('compiles the shipped README and matching website/example TypeScript blocks as strict DOM-only consumers', () => {
    const consumerDir = installPackedConsumer(true);
    const installedReadme = path.resolve(consumerDir, 'node_modules/@web-ts-toolkit/oidc-vault-dpop-client/README.md');
    expect(readFileSync(installedReadme, 'utf8')).toBe(readFileSync(path.resolve(packageRoot, 'README.md'), 'utf8'));
    const documents = [
      { name: 'readme', file: installedReadme },
      { name: 'website', file: path.resolve(workspaceRoot, 'website/docs/packages/oidc-vault-dpop-client.md') },
      { name: 'example', file: path.resolve(workspaceRoot, 'apps/oidc-vault-dpop-example/README.md') },
    ];
    const navigationSection = (file: string) =>
      readFileSync(file, 'utf8').split('## Provider logout navigation\n')[1]?.split('\n## ')[0];
    expect(navigationSection(installedReadme)).toBeTruthy();
    expect(navigationSection(documents[1].file)).toBe(navigationSection(installedReadme));
    for (const document of documents) {
      const text = readFileSync(document.file, 'utf8');
      expect(text, `${document.name} must teach the explicit opt-out`).toContain('dpop: false');
      expect(text).toContain('fresh login');
    }

    // Each documented block becomes one compilable example importing the
    // package root from the fresh install (no `src/` deep imports).
    const examplesDir = path.resolve(consumerDir, 'examples');
    mkdirSync(examplesDir, { recursive: true });
    let blockCount = 0;
    for (const document of documents) {
      const blocks = extractTypeScriptBlocks(document.file);
      expect(blocks.length, `Missing examples in ${document.name}`).toBeGreaterThan(0);
      blockCount += blocks.length;
      for (const block of blocks) {
        writeFileSync(path.resolve(examplesDir, `${document.name}-block-${block.ordinal}.ts`), `${block.content}\n`);
      }
    }
    writeFileSync(path.resolve(consumerDir, 'tsconfig-nodenext.json'), TSCONFIG_NODENEXT);
    writeFileSync(path.resolve(consumerDir, 'tsconfig-bundler.json'), TSCONFIG_BUNDLER);

    const copied = readdirSync(examplesDir).sort();
    expect(copied.length).toBe(blockCount);

    for (const config of ['tsconfig-nodenext.json', 'tsconfig-bundler.json']) {
      const files = run('pnpm', ['exec', 'tsc', '-p', config, '--listFiles'], consumerDir);
      expect(files).not.toMatch(/[/\\]@types[/\\]|express-oidc-vault|express-serve-static-core/);
    }
  }, 240_000);
});
