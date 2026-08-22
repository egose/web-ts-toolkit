import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

import { createReact18LaneWorkspace, react18PackageVersions, validateReact18DepsRoot } from './react18-lane';

const tempRoots: string[] = [];

function trackTempRoot(dir: string): string {
  tempRoots.push(dir);
  return dir;
}

function writePackageManifest(nodeModulesDir: string, packageName: string, version: string): void {
  const packageDir = path.join(nodeModulesDir, ...packageName.split('/'));
  mkdirSync(packageDir, { recursive: true });
  writeFileSync(path.join(packageDir, 'package.json'), `${JSON.stringify({ name: packageName, version }, null, 2)}\n`);
}

function installFakeReact18Deps(workspaceDir: string, overrides: Partial<Record<string, string>> = {}): void {
  const nodeModulesDir = path.join(workspaceDir, 'node_modules');
  mkdirSync(nodeModulesDir, { recursive: true });

  for (const [packageName, version] of Object.entries(react18PackageVersions)) {
    writePackageManifest(nodeModulesDir, packageName, overrides[packageName] ?? version);
  }

  mkdirSync(path.join(nodeModulesDir, 'scheduler'), { recursive: true });
}

afterEach(() => {
  while (tempRoots.length > 0) {
    rmSync(tempRoots.pop() as string, { recursive: true, force: true });
  }
});

describe('react18 lane setup', () => {
  it('rejects incomplete installs before Vitest starts', () => {
    const tempRoot = trackTempRoot(mkdtempSync(path.join(os.tmpdir(), 'access-router-react-react18-validate-')));
    const nodeModulesDir = path.join(tempRoot, 'node_modules');
    mkdirSync(nodeModulesDir, { recursive: true });
    writePackageManifest(nodeModulesDir, 'react', react18PackageVersions.react);

    expect(() => validateReact18DepsRoot(nodeModulesDir)).toThrowError(/missing react-dom/i);
  });

  it('rejects a mismatched React DOM version before Vitest starts', () => {
    const tempRoot = trackTempRoot(mkdtempSync(path.join(os.tmpdir(), 'access-router-react-react18-version-')));
    installFakeReact18Deps(tempRoot, { 'react-dom': '19.2.0' });

    expect(() => validateReact18DepsRoot(path.join(tempRoot, 'node_modules'))).toThrowError(
      /react-dom: expected 18\.3\.1, received 19\.2\.0/i,
    );
  });

  it('creates distinct workspaces and cleans them up idempotently', () => {
    const parentDir = trackTempRoot(mkdtempSync(path.join(os.tmpdir(), 'access-router-react-react18-parent-')));

    const first = createReact18LaneWorkspace({
      parentDir,
      install: (workspaceDir) => installFakeReact18Deps(workspaceDir),
    });
    const second = createReact18LaneWorkspace({
      parentDir,
      install: (workspaceDir) => installFakeReact18Deps(workspaceDir),
    });

    expect(first.workspaceDir).not.toBe(second.workspaceDir);
    expect(existsSync(first.workspaceDir)).toBe(true);
    expect(existsSync(second.workspaceDir)).toBe(true);

    first.cleanup();
    first.cleanup();
    second.cleanup();

    expect(existsSync(first.workspaceDir)).toBe(false);
    expect(existsSync(second.workspaceDir)).toBe(false);
  });
});
