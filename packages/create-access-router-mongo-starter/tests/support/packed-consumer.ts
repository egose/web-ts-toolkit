import { execFileSync } from 'node:child_process';
import { cpSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { basename, resolve } from 'node:path';
import type { TestWorkspace } from './temp-workspace';

const require = createRequire(import.meta.url);
const publisherRequire = createRequire(require.resolve('@repo-toolkit/release-artifact')) as NodeRequire;
const { createPublishPackageJson, DEFAULT_PACKAGE_FILES, DEFAULT_VERSION_PLACEHOLDER } = publisherRequire(
  '@repo-toolkit/publish-package',
) as {
  createPublishPackageJson(
    packageJson: Record<string, unknown>,
    options: {
      version: string;
      internalPackageNames: Set<string>;
      rootMetadata: Record<string, unknown>;
      rewrite: { versionPlaceholder: string; publishDir: string };
    },
  ): Record<string, unknown>;
  DEFAULT_PACKAGE_FILES: string[];
  DEFAULT_VERSION_PLACEHOLDER: string;
};

export interface PackedConsumer {
  tarball: string;
  consumerDir: string;
  installedPackageDir: string;
  manifest: Record<string, unknown>;
  packedFiles: string[];
  packageSize: number;
  unpackedSize: number;
}

function execChecked(command: string, args: string[], cwd: string): string {
  try {
    return execFileSync(command, args, { cwd, encoding: 'utf8', stdio: 'pipe' });
  } catch (err) {
    const error = err as { stdout?: string; stderr?: string; message?: string };
    throw new Error(
      [
        `Command failed: ${command} ${args.join(' ')}`,
        `cwd: ${cwd}`,
        error.stdout ?? '',
        error.stderr ?? error.message ?? '',
      ]
        .filter(Boolean)
        .join('\n'),
      { cause: err },
    );
  }
}

function seedToolVersions(dir: string, workspaceRoot: string): void {
  const source = resolve(workspaceRoot, '.tool-versions');
  if (existsSync(source)) cpSync(source, resolve(dir, '.tool-versions'));
}

export function createPackedConsumer(
  workspace: TestWorkspace,
  packageRoot: string,
  workspaceRoot: string,
  version = readFileSync(resolve(workspaceRoot, 'VERSION'), 'utf8').trim(),
): PackedConsumer {
  seedToolVersions(workspace.root, workspaceRoot);
  const sourceManifest = JSON.parse(readFileSync(resolve(packageRoot, 'package.json'), 'utf8')) as Record<
    string,
    unknown
  >;
  const rootManifest = JSON.parse(readFileSync(resolve(workspaceRoot, 'package.json'), 'utf8')) as Record<
    string,
    unknown
  >;
  const manifest = createPublishPackageJson(sourceManifest, {
    version,
    internalPackageNames: new Set(['create-access-router-mongo-starter']),
    rootMetadata: {
      author: rootManifest.author,
      bugs: rootManifest.bugs,
      engines: rootManifest.engines,
      license: rootManifest.license,
      repository: {
        ...(rootManifest.repository as Record<string, unknown>),
        directory: 'packages/create-access-router-mongo-starter',
      },
    },
    rewrite: { versionPlaceholder: DEFAULT_VERSION_PLACEHOLDER, publishDir: 'dist' },
  });

  const stageDir = resolve(workspace.root, 'published-package');
  mkdirSync(stageDir, { recursive: true });
  cpSync(resolve(packageRoot, 'dist'), stageDir, { recursive: true });
  for (const entry of DEFAULT_PACKAGE_FILES) {
    const source = resolve(packageRoot, entry);
    if (existsSync(source)) cpSync(source, resolve(stageDir, basename(entry)));
  }
  const license = resolve(workspaceRoot, 'LICENSE');
  if (existsSync(license)) cpSync(license, resolve(stageDir, 'LICENSE'));
  writeFileSync(resolve(stageDir, 'package.json'), `${JSON.stringify(manifest, null, 2)}\n`);

  const stagedTemplateManifest = JSON.parse(readFileSync(resolve(stageDir, 'template', 'package.json'), 'utf8')) as {
    dependencies?: Record<string, string>;
  };
  for (const [name, range] of Object.entries(stagedTemplateManifest.dependencies ?? {})) {
    if (name.startsWith('@web-ts-toolkit/') && range !== `^${version}`) {
      throw new Error(
        `Refusing to pack mismatched template dependency ${name}@${range}; expected ^${version} for release ${version}.`,
      );
    }
  }

  const dryRun = JSON.parse(
    execFileSync('npm', ['pack', '--dry-run', '--json'], { cwd: stageDir, encoding: 'utf8' }),
  ) as [{ files: Array<{ path: string }>; size: number; unpackedSize: number }];
  const packedFiles = dryRun[0].files.map(({ path }) => path).sort();

  const tarballDir = resolve(workspace.root, 'tarballs');
  mkdirSync(tarballDir, { recursive: true });
  execChecked('pnpm', ['pack', '--pack-destination', tarballDir], stageDir);
  const tarball = resolve(tarballDir, `create-access-router-mongo-starter-${version}.tgz`);
  if (!existsSync(tarball)) throw new Error(`Expected packed artifact was not created: ${tarball}`);

  writeFileSync(
    resolve(workspace.consumer, 'package.json'),
    `${JSON.stringify({ private: true, dependencies: { 'create-access-router-mongo-starter': `file:${tarball}` } }, null, 2)}\n`,
  );
  writeFileSync(resolve(workspace.consumer, 'pnpm-workspace.yaml'), 'packages: []\n');
  seedToolVersions(workspace.consumer, workspaceRoot);
  execChecked('pnpm', ['install', '--ignore-scripts'], workspace.consumer);

  return {
    tarball,
    consumerDir: workspace.consumer,
    installedPackageDir: resolve(workspace.consumer, 'node_modules', 'create-access-router-mongo-starter'),
    manifest,
    packedFiles,
    packageSize: dryRun[0].size,
    unpackedSize: dryRun[0].unpackedSize,
  };
}
