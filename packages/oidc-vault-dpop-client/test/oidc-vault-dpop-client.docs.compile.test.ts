import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';

import { cleanupTempRoots, installPackedConsumer, packageRoot, run, workspaceRoot } from './packed-consumer-harness';

/**
 * CLIENT-06: documentation compile harness (README scope).
 *
 * Extracts every TypeScript code block from the package `README.md` and
 * compiles the blocks against the *packed* npm tarball — the same artifact
 * exercised by the packed-consumer test — under strict NodeNext and
 * Bundler resolution with `strict: true` and `skipLibCheck: false`.
 *
 * A drift in any documented public name (removed export, renamed option
 * key, stale response shape) surfaces as a `tsc` error rather than being
 * silently shipped in the README. The packed-tarball install keeps this
 * test honest: fixtures import `@web-ts-toolkit/oidc-vault-dpop-client`
 * from a fresh `node_modules`, so an example that uses a name only present
 * in `src/` (not in the published declarations) fails to compile here even
 * though the source-level suite would pass.
 *
 * CLIENT-08 status: the README now carries the full quickstarts (canonical
 * imports, body + cookie sessions, fingerprint opt-in), so the compile lane
 * below is active. The `hasExamples` skip remains as a tripwire: if a future
 * edit removes every TypeScript fence, the first test fails on the missing
 * 'Under construction' marker instead of silently passing with zero coverage.
 */

const readmeRelPath = path.relative(workspaceRoot, path.resolve(packageRoot, 'README.md')).replace(/\\/g, '/');

type DocumentedBlock = {
  id: string;
  ordinal: number;
  content: string;
  hash: string;
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
      ordinal,
      content,
      hash: createHash('sha256').update(content).digest('hex'),
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
    "types": ["node"]
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
    "types": ["node"]
  },
  "include": ["examples/*.ts"]
}
`;

const readmeBlocks = extractTypeScriptBlocks(readmeRelPath);
const hasExamples = readmeBlocks.length > 0;

afterAll(() => {
  cleanupTempRoots();
});

describe('CLIENT-06 documentation examples compile against the packed artifact', () => {
  it.runIf(!hasExamples)(
    'records an explicit skip while the README is a skeleton (CLIENT-08 lands the ts quickstarts)',
    () => {
      // Proves the skip is the known skeleton state, not a silent harness
      // failure: the README still carries the CLIENT-01 under-construction
      // marker and contains zero TypeScript fences to compile.
      const readme = readFileSync(path.resolve(packageRoot, 'README.md'), 'utf8');
      expect(readme).toContain('Under construction');
      expect(readmeBlocks).toEqual([]);
      expect(existsSync(path.resolve(packageRoot, 'README.md'))).toBe(true);
    },
  );

  it.runIf(hasExamples)(
    'compiles every README TypeScript block under strict NodeNext and Bundler resolution against the published declarations',
    () => {
      const consumerDir = installPackedConsumer();

      // Each documented block becomes one compilable example importing the
      // package root from the fresh install (no `src/` deep imports).
      const examplesDir = path.resolve(consumerDir, 'examples');
      mkdirSync(examplesDir, { recursive: true });
      for (const block of readmeBlocks) {
        writeFileSync(path.resolve(examplesDir, `readme-block-${block.ordinal}.ts`), `${block.content}\n`);
      }
      writeFileSync(path.resolve(consumerDir, 'tsconfig-nodenext.json'), TSCONFIG_NODENEXT);
      writeFileSync(path.resolve(consumerDir, 'tsconfig-bundler.json'), TSCONFIG_BUNDLER);

      const copied = readdirSync(examplesDir).sort();
      expect(copied.length).toBe(readmeBlocks.length);

      // Strict NodeNext typecheck against the installed declarations.
      run('pnpm', ['exec', 'tsc', '-p', 'tsconfig-nodenext.json'], consumerDir);

      // Strict Bundler typecheck — same fixtures, Bundler resolution.
      run('pnpm', ['exec', 'tsc', '-p', 'tsconfig-bundler.json'], consumerDir);
    },
    240_000,
  );
});
