import { execFileSync } from 'node:child_process';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { cpSync, existsSync, mkdirSync, mkdtempSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const packageRoot = path.resolve(__dirname, '..');
const workspaceRoot = path.resolve(packageRoot, '..', '..');
const tempDirs: string[] = [];
const TSC_PATH = ['node_modules', 'typescript', 'bin', 'tsc'];

type Link = { kind: 'pkg'; name: string } | { kind: 'scoped'; scope: string; name: string };

afterAll(() => {
  for (const dir of tempDirs) {
    rmSync(dir, { recursive: true, force: true });
  }
});

function stageConsumerDir(): string {
  const consumerDir = mkdtempSync(path.join(os.tmpdir(), 'access-router-arf14-consumer-'));
  tempDirs.push(consumerDir);

  const consumerPkgRoot = path.join(consumerDir, 'node_modules', '@web-ts-toolkit', 'access-router');
  mkdirSync(consumerPkgRoot, { recursive: true });
  cpSync(path.resolve(packageRoot, 'dist'), path.resolve(consumerPkgRoot, 'dist'), { recursive: true });
  cpSync(path.resolve(packageRoot, 'package.json'), path.resolve(consumerPkgRoot, 'package.json'));

  const hoistedDirs = [path.join(packageRoot, 'node_modules'), path.join(workspaceRoot, 'node_modules')];
  const ensure = (link: Link): boolean => {
    for (const base of hoistedDirs) {
      const realPath = link.kind === 'pkg' ? path.join(base, link.name) : path.join(base, link.scope, link.name);
      if (!existsSync(realPath)) continue;

      const symlinkPath =
        link.kind === 'pkg'
          ? path.join(consumerDir, 'node_modules', link.name)
          : path.join(consumerDir, 'node_modules', link.scope, link.name);
      mkdirSync(path.dirname(symlinkPath), { recursive: true });
      if (!existsSync(symlinkPath)) {
        symlinkSync(realPath, symlinkPath, 'dir');
      }
      return true;
    }

    return false;
  };

  const required: Link[] = [
    { kind: 'pkg', name: 'express' },
    { kind: 'pkg', name: 'mongoose' },
    { kind: 'pkg', name: 'typescript' },
    { kind: 'pkg', name: 'zod' },
    { kind: 'pkg', name: 'just-diff' },
    { kind: 'pkg', name: 'sift' },
    { kind: 'pkg', name: 'winston' },
    { kind: 'pkg', name: 'mongoose-schema-jsonschema' },
    { kind: 'scoped', scope: '@web-ts-toolkit', name: 'utils' },
    { kind: 'scoped', scope: '@web-ts-toolkit', name: 'express-json-router' },
    { kind: 'scoped', scope: '@types', name: 'node' },
    { kind: 'scoped', scope: '@types', name: 'express' },
  ];

  for (const link of required) {
    if (!ensure(link)) {
      throw new Error(`ARF-14 consumer stage failed: missing dependency ${JSON.stringify(link)}`);
    }
  }

  return consumerDir;
}

function run(cmd: string, args: string[], cwd: string): { status: number; stdout: string; stderr: string } {
  try {
    const stdout = execFileSync(cmd, args, {
      cwd,
      encoding: 'utf8',
      stdio: 'pipe',
    });
    return { status: 0, stdout, stderr: '' };
  } catch (err) {
    const error = err as { status?: number; stdout?: string; stderr?: string; message?: string };
    return {
      status: error.status ?? 1,
      stdout: error.stdout ?? '',
      stderr: error.stderr ?? error.message ?? '',
    };
  }
}

describe('ARF-14 strict packed-consumer types', () => {
  let consumerDir: string;

  beforeAll(() => {
    consumerDir = stageConsumerDir();
  });

  it('accepts valid filters/projections/runtime calls and rejects invalid ones across public subpaths', () => {
    const sourceFile = path.resolve(consumerDir, 'strict-consumer.ts');
    const tsconfigPath = path.resolve(consumerDir, 'tsconfig.strict-consumer.json');
    const snippet = `
      import { createAccessRuntime, guard, type GuardModelCondition } from '@web-ts-toolkit/access-router';
      import { Codes, type Filter, type Projection, type SelectedPublicOutput } from '@web-ts-toolkit/access-router/advanced';
      import { copyAndDepopulate, type CopyAndDepopulateOptions, type ProcessCopy } from '@web-ts-toolkit/access-router/processors';

      type User = {
        name: string;
        age: number;
        profile: { email: string; active: boolean };
        tags: Array<{ label: string }>;
      };

      const runtime = createAccessRuntime();
      runtime.setGlobalOption('requestPermissionField', '_permissions');

      const condition: GuardModelCondition = {
        modelName: 'User',
        id: { type: 'param', key: 'id' },
        condition: 'canReadUser',
      };
      const handler = guard(condition);

      const filter: Filter<User> = {
        age: { $gte: 18 },
        'profile.email': { $regex: /@example\\.com$/ },
        'tags.label': 'vip',
      };
      const projection: Projection = ['name', 'profile.email'];
      const selected: SelectedPublicOutput<User, ['name', 'profile.email']> = {
        name: 'Ada',
        profile: { email: 'ada@example.com' },
      };

      const op: ProcessCopy = { src: 'profile', dest: 'profileId' };
      const processorOptions: CopyAndDepopulateOptions = { mutable: false };
      const depopulated = copyAndDepopulate({ profile: { _id: 'p1', email: 'ada@example.com' } }, [op], processorOptions);

      // @ts-expect-error requestPermissionField must remain a string
      runtime.setGlobalOption('requestPermissionField', 123);

      // @ts-expect-error unknown filter field must fail to compile
      const badFilter: Filter<User> = { missing: true };

      // @ts-expect-error unknown nested filter field must fail to compile
      const badNestedFilter: Filter<User> = { 'profile.missing': true };

      // @ts-expect-error selected output cannot expose fields outside the projection
      const badSelected: SelectedPublicOutput<User, ['name']> = { age: 1 };

      // @ts-expect-error guard ids must be strings or GuardModelConditionID objects
      const badCondition: GuardModelCondition = { modelName: 'User', id: 123, condition: 'canReadUser' };

      void [
        runtime,
        handler,
        filter,
        projection,
        selected,
        depopulated,
        badFilter,
        badNestedFilter,
        badSelected,
        badCondition,
        Codes.Success,
      ];
    `;

    writeFileSync(sourceFile, snippet);
    writeFileSync(
      tsconfigPath,
      JSON.stringify(
        {
          compilerOptions: {
            target: 'ES2022',
            module: 'ESNext',
            moduleResolution: 'Bundler',
            strict: true,
            noImplicitAny: true,
            noUnusedLocals: true,
            noUnusedParameters: true,
            noEmit: true,
            skipLibCheck: true,
            types: ['node'],
            lib: ['ES2022', 'DOM'],
          },
          include: ['strict-consumer.ts'],
        },
        null,
        2,
      ),
    );

    const tscAbsPath = path.resolve(consumerDir, ...TSC_PATH);
    const result = run('node', [tscAbsPath, '-p', tsconfigPath, '--noEmit'], consumerDir);

    if (result.status !== 0) {
      throw new Error(`ARF-14 strict consumer compile failed:\n${result.stdout}${result.stderr}`);
    }

    expect(result.status).toBe(0);
  });
});
