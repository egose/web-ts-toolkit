import { spawnSync } from 'node:child_process';
import { cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const packageRoot = path.resolve(__dirname, '..');
const workspaceRoot = path.resolve(packageRoot, '..', '..');

function stageConsumer(extension: 'mts' | 'cts') {
  const consumer = mkdtempSync(path.join(tmpdir(), `oar03-owned-types-${extension}-`));
  const installed = path.join(consumer, 'node_modules/@web-ts-toolkit/access-router');
  mkdirSync(installed, { recursive: true });
  for (const name of ['package.json', 'README.md', 'dist']) {
    cpSync(path.join(packageRoot, name), path.join(installed, name), { recursive: name === 'dist' });
  }
  const dependencies = [
    'express',
    'mongoose',
    'typescript',
    'zod',
    'just-diff',
    'sift',
    'winston',
    'mongoose-schema-jsonschema',
    '@web-ts-toolkit/utils',
    '@web-ts-toolkit/express-json-router',
    '@types/node',
    '@types/express',
  ];
  for (const name of dependencies) {
    const source = [path.join(packageRoot, 'node_modules', name), path.join(workspaceRoot, 'node_modules', name)].find(
      existsSync,
    );
    if (!source) throw new Error(`OAR-02 consumer missing installed dependency: ${name}`);
    const target = path.join(consumer, 'node_modules', name);
    mkdirSync(path.dirname(target), { recursive: true });
    symlinkSync(source, target, 'dir');
  }
  return consumer;
}

describe('OAR-02 public owned-fact/field-hook declarations', () => {
  it.each(['mts', 'cts'] as const)(
    'compiles root + advanced hooks through installed %s conditions, without casts',
    (extension) => {
      const consumer = stageConsumer(extension);
      for (const [label, fixture] of [
        ['valid', 'owned-authorization-hooks.types.fixture.ts'],
        ['invalid', 'owned-authorization-hooks.invalid.types.fixture.ts'],
        ['cutover', 'owned-authorization-cutover.invalid.types.fixture.ts'],
      ]) {
        const source = `${label}.${extension}`;
        const config = `tsconfig-${label}.json`;
        writeFileSync(path.join(consumer, source), readFileSync(path.join(packageRoot, 'test', fixture)), {
          flag: 'wx',
        });
        writeFileSync(
          path.join(consumer, config),
          JSON.stringify({
            compilerOptions: {
              target: 'ES2022',
              module: 'NodeNext',
              moduleResolution: 'NodeNext',
              strict: true,
              noEmit: true,
              skipLibCheck: false,
              esModuleInterop: true,
              types: ['node'],
            },
            files: [source],
          }),
          { flag: 'wx' },
        );
        const args = [path.join(workspaceRoot, 'node_modules/typescript/bin/tsc'), '-p', config];
        const result = spawnSync('node', args, { cwd: consumer, encoding: 'utf8', timeout: 30_000 });
        const output = result.stdout + result.stderr;
        writeFileSync(
          path.join(consumer, `${label}.log`),
          `node ${args.join(' ')}\n${output}\nexit=${result.status}\n`,
          { flag: 'wx' },
        );
        expect(result.error).toBeUndefined();
        if (label === 'valid') {
          expect(output).toBe('');
          expect(result.status).toBe(0);
        } else if (label === 'invalid') {
          expect(result.status).not.toBe(0);
          expect(output).toContain("Type 'number' is not assignable to type 'boolean'");
          expect(output).toContain('only permits reading');
          expect(output).toContain('Target signature provides too few arguments');
          expect(output).not.toContain('node_modules/');
        } else {
          expect(result.status).not.toBe(0);
          expect(output).toMatch(/has no exported member(?: named)? 'DocumentAuthorization'/);
          expect(output).toContain('unsafeUseReadAuthorizationFastPath');
          expect(output).toContain('documentAuthorization');
          expect(output).toContain('mongooseModel');
          expect(output).toContain("Property 'filter' does not exist");
          expect(output).toContain('only permits reading');
          expect(output).not.toContain('node_modules/');
        }
      }
      // Keep this invocation's unique staged compiler evidence; never reuse it.
    },
  );
});
