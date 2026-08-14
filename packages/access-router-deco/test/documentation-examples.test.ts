import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { cleanupConsumerDirs, packageRoot, runTsc, stageConsumerDir, workspaceRoot } from './consumer-stage';

type DocumentedExample = {
  name: string;
  source: string;
};

const docs = [
  {
    name: 'README quick start',
    path: path.join(packageRoot, 'README.md'),
  },
  {
    name: 'website quick start',
    path: path.join(workspaceRoot, 'website', 'docs', 'packages', 'access-router-deco.md'),
  },
];

function extractFirstTypeScriptBlock(name: string, filePath: string): DocumentedExample {
  const contents = readFileSync(filePath, 'utf8');
  const match = contents.match(/```ts\n([\s\S]*?)\n```/);
  if (!match) throw new Error(`Missing TypeScript block in ${filePath}`);
  return { name, source: match[1] };
}

describe('access-router-deco documentation examples', () => {
  let consumerDir: string;

  beforeAll(() => {
    consumerDir = stageConsumerDir();
  });

  afterAll(() => {
    cleanupConsumerDirs();
  });

  it.each(docs.map((doc) => extractFirstTypeScriptBlock(doc.name, doc.path)))(
    'compiles $name against emitted declarations',
    ({ name, source }) => {
      const sourceFile = path.resolve(consumerDir, `${name.toLowerCase().replaceAll(/\W+/g, '-')}.ts`);
      const tsconfigPath = path.resolve(consumerDir, `${name.toLowerCase().replaceAll(/\W+/g, '-')}.tsconfig.json`);

      writeFileSync(sourceFile, source);
      writeFileSync(
        tsconfigPath,
        JSON.stringify(
          {
            compilerOptions: {
              target: 'ES2022',
              module: 'ESNext',
              moduleResolution: 'Bundler',
              strict: true,
              noEmit: true,
              skipLibCheck: false,
              experimentalDecorators: true,
              emitDecoratorMetadata: true,
              esModuleInterop: true,
              types: ['node', 'reflect-metadata'],
              lib: ['ES2022', 'DOM'],
            },
            include: [path.basename(sourceFile)],
          },
          null,
          2,
        ),
      );

      const result = runTsc(consumerDir, tsconfigPath);

      if (result.status !== 0) {
        throw new Error(
          `${name} failed to compile against access-router-deco package declarations:\n${result.stdout}${result.stderr}`,
        );
      }

      expect(result.status).toBe(0);
    },
  );
});
