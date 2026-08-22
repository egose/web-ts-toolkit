import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

export const react18DepsRootEnv = 'ACCESS_ROUTER_REACT18_DEPS_ROOT';
export const react18TempParentEnv = 'ACCESS_ROUTER_REACT18_TMPDIR';

export const react18PackageVersions = {
  react: '18.3.1',
  'react-dom': '18.3.1',
  '@testing-library/react': '16.3.2',
} as const;

const supportPackages = ['scheduler'] as const;

function packageDirFor(nodeModulesDir: string, packageName: string): string {
  return path.join(nodeModulesDir, ...packageName.split('/'));
}

function packageManifestPathFor(nodeModulesDir: string, packageName: string): string {
  return path.join(packageDirFor(nodeModulesDir, packageName), 'package.json');
}

function readInstalledPackageVersion(nodeModulesDir: string, packageName: string): string {
  const manifestPath = packageManifestPathFor(nodeModulesDir, packageName);
  if (!existsSync(manifestPath)) {
    throw new Error(`React 18 lane dependency tree is incomplete: missing ${packageName} at ${manifestPath}.`);
  }

  const manifest = JSON.parse(readFileSync(manifestPath, 'utf8')) as { version?: unknown };
  if (typeof manifest.version !== 'string' || manifest.version.length === 0) {
    throw new Error(
      `React 18 lane dependency tree is incomplete: ${packageName} has no readable version in ${manifestPath}.`,
    );
  }

  return manifest.version;
}

function writeReact18Manifest(workspaceDir: string): void {
  writeFileSync(
    path.join(workspaceDir, 'package.json'),
    `${JSON.stringify(
      {
        name: 'access-router-react-react18-lane',
        private: true,
        dependencies: react18PackageVersions,
      },
      null,
      2,
    )}\n`,
  );
}

function installReact18Deps(workspaceDir: string): void {
  execFileSync('npm', ['install', '--package-lock-only', '--ignore-scripts', '--no-audit', '--no-fund'], {
    cwd: workspaceDir,
    stdio: 'inherit',
  });
  execFileSync('npm', ['ci', '--ignore-scripts', '--no-audit', '--no-fund'], {
    cwd: workspaceDir,
    stdio: 'inherit',
  });
}

export function validateReact18DepsRoot(nodeModulesDir: string): string {
  if (!path.isAbsolute(nodeModulesDir)) {
    throw new Error(
      `React 18 lane dependency root must be an absolute path; received ${JSON.stringify(nodeModulesDir)}.`,
    );
  }

  for (const [packageName, expectedVersion] of Object.entries(react18PackageVersions)) {
    const actualVersion = readInstalledPackageVersion(nodeModulesDir, packageName);
    if (actualVersion !== expectedVersion) {
      throw new Error(
        `React 18 lane dependency version mismatch for ${packageName}: expected ${expectedVersion}, received ${actualVersion}.`,
      );
    }
  }

  for (const packageName of supportPackages) {
    const packageDir = packageDirFor(nodeModulesDir, packageName);
    if (!existsSync(packageDir)) {
      throw new Error(
        `React 18 lane dependency tree is incomplete: missing support package ${packageName} at ${packageDir}.`,
      );
    }
  }

  return nodeModulesDir;
}

export function resolveReact18DepsRoot(env: NodeJS.ProcessEnv = process.env): string {
  const nodeModulesDir = env[react18DepsRootEnv];
  if (!nodeModulesDir) {
    throw new Error(
      `Missing ${react18DepsRootEnv}. Run \`pnpm test:react18\` so the lane can install and validate its isolated React 18 dependencies before Vitest starts.`,
    );
  }

  return validateReact18DepsRoot(nodeModulesDir);
}

type React18LaneWorkspaceOptions = {
  parentDir?: string;
  install?: (workspaceDir: string) => void;
};

export type React18LaneWorkspace = {
  workspaceDir: string;
  nodeModulesDir: string;
  cleanup: () => void;
};

export function createReact18LaneWorkspace(options: React18LaneWorkspaceOptions = {}): React18LaneWorkspace {
  const parentDir = path.resolve(options.parentDir ?? process.env[react18TempParentEnv] ?? os.tmpdir());
  mkdirSync(parentDir, { recursive: true });

  const workspaceDir = mkdtempSync(path.join(parentDir, 'access-router-react-react18-'));
  const cleanup = () => {
    rmSync(workspaceDir, { recursive: true, force: true });
  };

  try {
    writeReact18Manifest(workspaceDir);
    (options.install ?? installReact18Deps)(workspaceDir);
    const nodeModulesDir = validateReact18DepsRoot(path.join(workspaceDir, 'node_modules'));
    return { workspaceDir, nodeModulesDir, cleanup };
  } catch (error) {
    cleanup();
    throw error;
  }
}

export function runReact18Lane(): void {
  const workspace = createReact18LaneWorkspace();
  try {
    execFileSync('pnpm', ['exec', 'vitest', 'run', '--config', 'vitest.react18.config.ts'], {
      cwd: process.cwd(),
      stdio: 'inherit',
      env: {
        ...process.env,
        [react18DepsRootEnv]: workspace.nodeModulesDir,
      },
    });
  } finally {
    workspace.cleanup();
  }
}
