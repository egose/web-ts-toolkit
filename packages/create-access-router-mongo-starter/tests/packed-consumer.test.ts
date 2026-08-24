// @vitest-environment node
import { cpSync, existsSync, lstatSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { createPackedConsumer } from './support/packed-consumer';
import { runProcess } from './support/process-harness';
import { withTestWorkspace } from './support/temp-workspace';

const packageRoot = resolve(__dirname, '..');
const workspaceRoot = resolve(packageRoot, '..', '..');
const bins = [
  'create-access-router-mongo-starter',
  'create-access-router-mongo-starter-deploy-netlify',
  'create-access-router-mongo-starter-deploy-shared',
] as const;
const expectedPackedFiles = [
  'LICENSE',
  'README.md',
  'bin/cli.js',
  'bin/deploy-netlify.js',
  'bin/deploy-shared.js',
  'package.json',
  'template/.agents/skills/template-api-models-and-routers/SKILL.md',
  'template/.agents/skills/template-backend-runtime/SKILL.md',
  'template/.agents/skills/template-client-data/SKILL.md',
  'template/.agents/skills/template-frontend-forms/SKILL.md',
  'template/.agents/skills/template-frontend-ui/SKILL.md',
  'template/.agents/skills/template-testing-and-scaffolding/SKILL.md',
  'template/.dockerignore',
  'template/.env.example',
  'template/AGENTS.md',
  'template/README.md',
  'template/_gitignore',
  'template/api/access-router.config.ts',
  'template/api/src/access-router.d.ts',
  'template/api/src/config.ts',
  'template/api/src/errors.ts',
  'template/api/src/integrity.ts',
  'template/api/src/models.ts',
  'template/api/src/routers.ts',
  'template/eslint.config.js',
  'template/index.html',
  'template/package.json',
  'template/pnpm-lock.yaml',
  'template/pnpm-workspace.yaml',
  'template/public/favicon.svg',
  'template/src/api.ts',
  'template/src/app.tsx',
  'template/src/index.css',
  'template/src/main.tsx',
  'template/src/pages/home-page-controller.ts',
  'template/src/pages/home-page.tsx',
  'template/src/pages/todo-form.tsx',
  'template/src/shared/entity-schemas.ts',
  'template/src/shared/normalize-api-base-url.ts',
  'template/src/types.ts',
  'template/src/vite-env.d.ts',
  'template/tests/setup.ts',
  'template/tests/api-base-path.integration.test.ts',
  'template/tests/api-contract.test.ts',
  'template/tests/home-page.test.tsx',
  'template/tests/todo-form.test.tsx',
  'template/tsconfig.app.json',
  'template/tsconfig.json',
  'template/tsconfig.node.json',
  'template/tsconfig.server.json',
  'template/vite.config.ts',
  'template/vitest.config.ts',
].sort();

describe('release-like packed consumer', () => {
  it('installs the publication-transformed package and executes all package-name bins', async () => {
    await withTestWorkspace((workspace) => {
      const packed = createPackedConsumer(workspace, packageRoot, workspaceRoot);
      const releaseVersion = readFileSync(resolve(workspaceRoot, 'VERSION'), 'utf8').trim();
      expect(packed.manifest.version).toBe(releaseVersion);
      expect(packed.manifest.files).toEqual(['**/*', '!**/*.map']);
      expect(JSON.stringify(packed.manifest)).not.toContain('PLACEHOLDER');
      expect(packed.packedFiles).toEqual(expectedPackedFiles);
      expect(packed.packageSize).toBeGreaterThan(100_000);
      expect(packed.unpackedSize).toBeGreaterThan(300_000);

      const sourceIgnore = readFileSync(resolve(packageRoot, 'template', '.gitignore'), 'utf8');
      const installedAlias = resolve(packed.installedPackageDir, 'template', '_gitignore');
      expect(readFileSync(installedAlias, 'utf8')).toBe(sourceIgnore);
      expect(existsSync(resolve(packed.installedPackageDir, 'template', '.gitignore'))).toBe(false);

      const installedManifest = JSON.parse(
        readFileSync(resolve(packed.installedPackageDir, 'package.json'), 'utf8'),
      ) as {
        author: string;
        bin: Record<string, string>;
        engines: { node: string };
        license: string;
        repository: { directory: string };
      };
      expect(installedManifest.author).toBe('Junmin Ahn');
      expect(installedManifest.engines.node).toBe('>=22.12.0');
      expect(installedManifest.license).toBe('Apache-2.0');
      expect(installedManifest.repository.directory).toBe('packages/create-access-router-mongo-starter');

      for (const bin of bins) {
        const script = resolve(packed.installedPackageDir, installedManifest.bin[bin]);
        expect(readFileSync(script, 'utf8').startsWith('#!/usr/bin/env node\n')).toBe(true);
        if (process.platform !== 'win32') expect(lstatSync(script).mode & 0o111).not.toBe(0);

        const result = runProcess(resolve(packed.consumerDir, 'node_modules', '.bin', bin), ['--help'], {
          cwd: packed.consumerDir,
        });
        expect(result.status, result.stderr).toBe(0);
        expect(result.stdout).toContain('access-router-mongo-starter');
      }

      const generatedDir = resolve(workspace.root, 'generated-app');
      const generatedTitle = '雪 "quoted" \\ path\n</title><script>alert(1)</script>';
      const generatedDbName = 'データ&name';
      const scaffold = runProcess(
        resolve(packed.consumerDir, 'node_modules', '.bin', 'create-access-router-mongo-starter'),
        [generatedDir, '--name', 'packed-app', '--title', generatedTitle, '--db-name', generatedDbName],
        { cwd: packed.consumerDir, snapshotRoot: workspace.root },
      );
      expect(scaffold.status, scaffold.stderr).toBe(0);
      expect(scaffold.filesystem.changed.some((path) => path.startsWith('generated-app/'))).toBe(true);
      const generatedManifest = JSON.parse(readFileSync(resolve(generatedDir, 'package.json'), 'utf8')) as {
        name: string;
        dependencies: Record<string, string>;
        engines: { node: string };
        packageManager: string;
      };
      expect(generatedManifest.name).toBe('packed-app');
      expect(generatedManifest.engines.node).toBe('>=22.12.0');
      expect(generatedManifest.packageManager).toBe('pnpm@11.18.0');
      expect(readFileSync(resolve(generatedDir, 'api', 'src', 'config.ts'), 'utf8')).toContain(
        `export const DB_NAME = ${JSON.stringify(generatedDbName)};`,
      );
      expect(readFileSync(resolve(generatedDir, 'src', 'pages', 'home-page.tsx'), 'utf8')).toContain(
        `{${JSON.stringify(generatedTitle)}}`,
      );
      expect(readFileSync(resolve(generatedDir, 'index.html'), 'utf8')).not.toContain('<script>alert(1)</script>');
      expect(readFileSync(resolve(generatedDir, '.env.example'), 'utf8')).toContain(
        `mongodb://localhost:27017/${encodeURIComponent(generatedDbName)}`,
      );
      for (const dependency of [
        '@web-ts-toolkit/access-router',
        '@web-ts-toolkit/access-router-client',
        '@web-ts-toolkit/access-router-react',
        '@web-ts-toolkit/access-router-runtime',
      ]) {
        expect(generatedManifest.dependencies[dependency]).toBe(`^${releaseVersion}`);
      }
      expect(generatedManifest.dependencies['@web-ts-toolkit/express-runtime']).toBeUndefined();
      const generatedLockfile = readFileSync(resolve(generatedDir, 'pnpm-lock.yaml'), 'utf8');
      expect(generatedLockfile).toContain("'@web-ts-toolkit/access-router-runtime':");
      expect(generatedLockfile).toContain(`specifier: ^${releaseVersion}`);
      const importer = generatedLockfile.split('\npackages:')[0];
      expect(importer).not.toContain("'@web-ts-toolkit/express-runtime':");
      const generatedIgnore = readFileSync(resolve(generatedDir, '.gitignore'), 'utf8');
      expect(generatedIgnore).toBe(sourceIgnore);
      expect(generatedIgnore).toMatch(/^\.env$/m);
      expect(generatedIgnore).toMatch(/^node_modules$/m);
      expect(generatedIgnore).toMatch(/^dist$/m);
      expect(generatedIgnore).toMatch(/^api\/functions$/m);
      expect(generatedIgnore).toMatch(/^netlify\/functions$/m);
      expect(generatedIgnore).toMatch(/^\.netlify$/m);
      expect(existsSync(resolve(generatedDir, '_gitignore'))).toBe(false);

      const generatedReadme = readFileSync(resolve(generatedDir, 'README.md'), 'utf8');
      expect(generatedReadme).not.toMatch(/\{\{APP_NAME\}\}|\{\{APP_TITLE\}\}|\{\{DB_NAME\}\}|\{\{VERSION\}\}/);
      expect(generatedReadme).toContain(`pnpm add -D create-access-router-mongo-starter@${releaseVersion} netlify-cli`);
      expect(generatedReadme).toContain('| `pnpm test`             | Run Vitest once');
      expect(generatedReadme).toContain('| `pnpm test:watch`       | Run Vitest in watch mode.');

      writeFileSync(resolve(generatedDir, '.env'), 'API_BASE_URL=/api\n');
      for (const [command, args, env] of [
        ['pnpm', ['install', '--frozen-lockfile', '--ignore-scripts']],
        ['pnpm', ['build'], { API_BASE_URL: '/.netlify/functions/main' }],
        ['pnpm', ['typecheck']],
        ['pnpm', ['lint']],
        ['pnpm', ['test']],
        ['pnpm', ['serverless']],
      ] as const) {
        const result = runProcess(command, [...args], {
          cwd: generatedDir,
          env: { CI: 'true', MONGODB_URI: 'mongodb://127.0.0.1:27017/starter-build-test', ...env },
        });
        expect(result.status, `${command} ${args.join(' ')}\n${result.stdout}\n${result.stderr}`).toBe(0);
      }
      const frontendOutput = readdirSync(resolve(generatedDir, 'dist'), { recursive: true, withFileTypes: true })
        .filter((entry) => entry.isFile() && entry.name.endsWith('.js'))
        .map((entry) => readFileSync(resolve(entry.parentPath, entry.name), 'utf8'))
        .join('\n');
      expect(frontendOutput).toContain('/.netlify/functions/main');
    }, 'carms-packed-');
  }, 600_000);

  it('rejects raw source packing and a release/template version mismatch', async () => {
    await withTestWorkspace((workspace) => {
      const directPack = runProcess('npm', ['pack', '--dry-run'], { cwd: packageRoot });
      expect(directPack.status).not.toBe(0);
      expect(directPack.stderr).toContain('Refusing to pack the source package with placeholder metadata');

      const mismatchedPackageRoot = resolve(workspace.root, 'mismatched-package');
      cpSync(packageRoot, mismatchedPackageRoot, { recursive: true });
      expect(() => createPackedConsumer(workspace, mismatchedPackageRoot, workspaceRoot, '99.0.0')).toThrow(
        'Refusing to pack mismatched template dependency',
      );
    }, 'carms-pack-guard-');
  }, 120_000);
});
