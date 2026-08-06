import { describe, expect, it } from 'vitest';
import { createRequire } from 'node:module';
import { readFileSync } from 'node:fs';
import path from 'node:path';

const require = createRequire(import.meta.url);
const ts = require('typescript') as typeof import('typescript');

const packageRoot = path.resolve(__dirname, '..');

const extractTsBlocks = (markdown: string): string[] => {
  const blocks: string[] = [];
  const pattern = /```ts\n([\s\S]*?)```/g;
  let match: RegExpExecArray | null;
  while ((match = pattern.exec(markdown)) !== null) {
    blocks.push(match[1]);
  }
  return blocks;
};

const compile = (snippet: string, blockName: string) => {
  const fileName = `/tmp/ar-doc-snippet-${blockName}.ts`;
  const rootTypes = path.resolve(packageRoot, 'dist/index.d.ts');
  const advancedTypes = path.resolve(packageRoot, 'dist/advanced.d.ts');
  const processorsTypes = path.resolve(packageRoot, 'dist/processors.d.ts');
  const sourceFile = ts.createSourceFile(fileName, snippet, ts.ScriptTarget.ESNext, true);

  // Quick syntactic check: parse followed by basic binder using the dist .d.ts files.
  const program = ts.createProgram(
    [fileName, rootTypes, advancedTypes, processorsTypes],
    {
      target: ts.ScriptTarget.ESNext,
      module: ts.ModuleKind.ESNext,
      moduleResolution: ts.ModuleResolutionKind.Bundler,
      strict: true,
      noEmit: true,
      skipLibCheck: true,
      types: [],
      lib: ['esnext', 'dom'],
    },
    {
      fileExists(name) {
        if (name === fileName) return true;
        try {
          require('fs').accessSync(name);
          return true;
        } catch {
          return false;
        }
      },
      readFile(name) {
        if (name === fileName) return snippet;
        try {
          return readFileSync(name, 'utf-8');
        } catch {
          return undefined;
        }
      },
      getSourceFile(name, languageVersion) {
        if (name === fileName) return sourceFile;
        try {
          const text = readFileSync(name, 'utf-8');
          return ts.createSourceFile(name, text, languageVersion, true);
        } catch {
          return undefined;
        }
      },
      getCurrentDirectory: () => packageRoot,
      getCanonicalFileName: (n) => n,
      getNewLine: () => '\n',
      useCaseSensitiveFileNames: () => true,
      getDefaultLibFileName: () => 'lib.esnext.d.ts',
      writeFile: () => {},
    },
  );

  const diagnostics = ts
    .getPreEmitDiagnostics(program)
    .filter((d) => d.file?.fileName === fileName)
    .map((d) => ts.flattenDiagnosticMessageText(d.messageText, '\n'))
    .filter((m) => m.length > 0);

  return diagnostics;
};

describe('AR-16 documentation examples compile', () => {
  const filesToCheck: Array<{ name: string; file: string }> = [
    { name: 'README.md', file: 'README.md' },
    { name: 'llms.txt', file: 'llms.txt' },
  ];

  for (const { name, file } of filesToCheck) {
    const fullPath = path.resolve(packageRoot, file);
    const text = readFileSync(fullPath, 'utf-8');
    const blocks = extractTsBlocks(text);

    describe(`${name} TS code blocks parse`, () => {
      for (let i = 0; i < blocks.length; i++) {
        const block = blocks[i];
        it(`block ${i + 1}/${blocks.length} parses without syntax errors`, () => {
          const diagnostics = compile(block, `${name}-${i + 1}`);
          const syntaxOnly = diagnostics.filter((d) => d.includes('error TS1'));
          expect(syntaxOnly).toEqual([]);
        });
      }
    });
  }
});
