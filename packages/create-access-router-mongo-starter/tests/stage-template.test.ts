// @vitest-environment node
import {
  chmodSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { describe, it, expect } from 'vitest';
import {
  isExcluded,
  isPrivateDotenvPath,
  normalize,
  EXCLUDED_PATHS,
  GITIGNORE_STAGING_ALIAS,
  stageTemplate,
  validateStagedLockfile,
  verifyStagedTemplate,
} from '../scripts/stage-template';
import {
  PUBLISH_TEMPLATE_POLICY,
  SCAFFOLD_TEMPLATE_POLICY,
  isTemplatePathExcluded,
} from '../src/shared/template-policy';
import { withTestWorkspace } from './support/temp-workspace';

/**
 * Minimal structurally-valid lockfile agreeing with the staged manifest in
 * `directory`: exact importer specifiers, resolved versions, and real
 * `packages:`/`snapshots:` resolution metadata. Used for injected-generator
 * fixtures; real pnpm output is exercised by the default-generator tests and
 * the packed-consumer boundary.
 */
function writeAgreedTestLockfile(directory: string): void {
  const manifest = JSON.parse(readFileSync(resolve(directory, 'package.json'), 'utf8')) as {
    dependencies?: Record<string, string>;
    devDependencies?: Record<string, string>;
  };
  const renderEntries = (deps: Record<string, string> | undefined): string =>
    Object.entries(deps ?? {})
      .map(
        ([name, spec]) =>
          `      '${name}':\n        specifier: ${spec}\n        version: ${spec.replace(/^[^\d]*/, '')}+fake.0`,
      )
      .join('\n');
  const sections: string[] = [];
  const renderedDeps = renderEntries(manifest.dependencies);
  if (renderedDeps) sections.push(`    dependencies:\n${renderedDeps}`);
  const renderedDevDeps = renderEntries(manifest.devDependencies);
  if (renderedDevDeps) sections.push(`    devDependencies:\n${renderedDevDeps}`);
  writeFileSync(
    resolve(directory, 'pnpm-lock.yaml'),
    `lockfileVersion: '9.0'\n\nsettings:\n  autoInstallPeers: true\n  excludeLinksFromLockfile: false\n\nimporters:\n\n  .:\n${sections.join('\n')}\n\npackages:\n\n  fake-test-package@1.0.0:\n    resolution: {integrity: sha512-AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA==}\n\nsnapshots:\n\n  fake-test-package@1.0.0: {}\n`,
  );
}

function writeManifestWithPlaceholder(directory: string, manifest: unknown): void {
  writeFileSync(resolve(directory, 'package.json'), JSON.stringify(manifest));
}

describe('normalize', () => {
  it('converts backslashes to forward slashes', () => {
    expect(normalize('node_modules\\foo\\bar')).toBe('node_modules/foo/bar');
  });

  it('leaves forward slashes unchanged', () => {
    expect(normalize('src/index.ts')).toBe('src/index.ts');
  });

  it('handles mixed separators', () => {
    expect(normalize('src\\api/utils')).toBe('src/api/utils');
  });
});

describe('isExcluded', () => {
  it('exacts match on excluded path names', () => {
    expect(isExcluded('node_modules')).toBe(true);
    expect(isExcluded('dist')).toBe(true);
    expect(isExcluded('.netlify')).toBe(true);
    expect(isExcluded('netlify')).toBe(true);
    expect(isExcluded('netlify.toml')).toBe(true);
    expect(isExcluded('api/functions')).toBe(true);
    expect(isExcluded('.tmp')).toBe(true);
  });

  it('excludes paths under excluded directories', () => {
    expect(isExcluded('node_modules/react/index.js')).toBe(true);
    expect(isExcluded('dist/template/index.html')).toBe(true);
    expect(isExcluded('.netlify/state.json')).toBe(true);
    expect(isExcluded('api/functions/main.cjs')).toBe(true);
  });

  it('does not exclude non-matching paths', () => {
    expect(isExcluded('src/index.ts')).toBe(false);
    expect(isExcluded('api/access-router.config.ts')).toBe(false);
    expect(isExcluded('tests/setup.ts')).toBe(false);
    expect(isExcluded('package.json')).toBe(false);
  });

  it('does not match partial directory names', () => {
    expect(isExcluded('node_modules_extra/foo')).toBe(false);
    expect(isExcluded('dist-bak/index.html')).toBe(false);
  });
});

describe('EXCLUDED_PATHS', () => {
  it('contains the expected entries', () => {
    expect(EXCLUDED_PATHS).toContain('node_modules');
    expect(EXCLUDED_PATHS).toContain('dist');
    expect(EXCLUDED_PATHS).toContain('.netlify');
    expect(EXCLUDED_PATHS).toContain('netlify');
    expect(EXCLUDED_PATHS).toContain('netlify.toml');
    expect(EXCLUDED_PATHS).toContain('api/functions');
    expect(EXCLUDED_PATHS).toContain('.tmp');
  });
});

describe('gitignore staging alias', () => {
  it('stages .gitignore under the npm-safe alias', async () => {
    await withTestWorkspace((workspace) => {
      const source = resolve(workspace.root, 'source');
      const target = resolve(workspace.root, 'target');
      writeFileSync(resolve(source, '.gitignore'), '.env\nnode_modules\n');

      stageTemplate({ sourceDir: source, targetDir: target });

      expect(readFileSync(resolve(target, GITIGNORE_STAGING_ALIAS), 'utf8')).toBe('.env\nnode_modules\n');
      expect(() => readFileSync(resolve(target, '.gitignore'), 'utf8')).toThrow();
    }, 'carms-stage-ignore-');
  });

  it('stamps the release manifest and generates a synchronized lockfile only in staged output', async () => {
    await withTestWorkspace((workspace) => {
      const source = resolve(workspace.root, 'source');
      const target = resolve(workspace.root, 'target');
      writeFileSync(resolve(source, '.gitignore'), '.env\n');
      writeFileSync(
        resolve(source, 'package.json'),
        `${JSON.stringify({
          name: '{{APP_NAME}}',
          dependencies: {
            '@web-ts-toolkit/access-router-runtime': '^{{VERSION}}',
          },
        })}\n`,
      );

      stageTemplate({
        sourceDir: source,
        targetDir: target,
        releaseVersion: '1.2.3',
        generateLockfile: (directory) => {
          const manifest = readFileSync(resolve(directory, 'package.json'), 'utf8');
          expect(manifest).toContain('^1.2.3');
          writeAgreedTestLockfile(directory);
        },
      });

      expect(readFileSync(resolve(target, 'package.json'), 'utf8')).toContain('^1.2.3');
      expect(readFileSync(resolve(source, 'package.json'), 'utf8')).toContain('^{{VERSION}}');
      expect(existsSync(resolve(source, 'pnpm-lock.yaml'))).toBe(false);
      expect(readFileSync(resolve(target, 'pnpm-lock.yaml'), 'utf8')).toContain('specifier: ^1.2.3');
    }, 'carms-stage-lock-');
  });

  it('rejects a colliding source alias before replacing staged output', async () => {
    await withTestWorkspace((workspace) => {
      const source = resolve(workspace.root, 'source');
      const target = resolve(workspace.root, 'target');
      writeFileSync(resolve(source, '.gitignore'), '.env\n');
      writeFileSync(resolve(source, GITIGNORE_STAGING_ALIAS), 'unrelated\n');
      writeFileSync(resolve(target, 'sentinel'), 'preserved');

      expect(() => stageTemplate({ sourceDir: source, targetDir: target })).toThrow(
        'staging alias _gitignore is reserved',
      );
      expect(readFileSync(resolve(target, 'sentinel'), 'utf8')).toBe('preserved');
    }, 'carms-stage-collision-');
  });
});

describe('stageTemplate', () => {
  it('stages a complete temporary source tree with exact publish policy behavior', async () => {
    await withTestWorkspace((workspace) => {
      const source = workspace.source;
      const target = workspace.target;
      writeFileSync(resolve(source, '.gitignore'), '.env\ndist\n');
      writeFileSync(resolve(source, '.dockerignore'), 'node_modules\n');
      writeFileSync(resolve(source, '.env.example'), 'MONGODB_URI=mongodb://localhost/{{DB_NAME}}\n');
      writeFileSync(resolve(source, 'package.json'), JSON.stringify({ dependencies: { demo: '^{{VERSION}}' } }));
      mkdirSync(resolve(source, '.agents', 'skills', 'demo'), { recursive: true });
      writeFileSync(resolve(source, '.agents', 'skills', 'demo', 'SKILL.md'), 'hidden nested file\n');
      mkdirSync(resolve(source, 'src', 'pages'), { recursive: true });
      writeFileSync(resolve(source, 'src', 'pages', 'home.tsx'), 'export {}\n');
      mkdirSync(resolve(source, 'node_modules', 'dep'), { recursive: true });
      writeFileSync(resolve(source, 'node_modules', 'dep', 'index.js'), 'excluded\n');
      mkdirSync(resolve(source, 'dist'), { recursive: true });
      writeFileSync(resolve(source, 'dist', 'index.html'), 'excluded\n');
      mkdirSync(resolve(source, '.tmp'), { recursive: true });
      writeFileSync(resolve(source, '.tmp', 'scratch'), 'excluded\n');
      mkdirSync(resolve(source, '.netlify'), { recursive: true });
      writeFileSync(resolve(source, '.netlify', 'state.json'), 'excluded\n');
      mkdirSync(resolve(source, 'netlify'), { recursive: true });
      writeFileSync(resolve(source, 'netlify', 'state.json'), 'excluded\n');
      writeFileSync(resolve(source, 'netlify.toml'), 'excluded\n');
      mkdirSync(resolve(source, 'api', 'functions'), { recursive: true });
      writeFileSync(resolve(source, 'api', 'functions', 'main.cjs'), 'excluded\n');

      stageTemplate({
        sourceDir: source,
        targetDir: target,
        releaseVersion: '2.3.4',
        generateLockfile: (directory) => writeAgreedTestLockfile(directory),
      });

      expect(readFileSync(resolve(target, GITIGNORE_STAGING_ALIAS), 'utf8')).toBe('.env\ndist\n');
      expect(existsSync(resolve(target, '.gitignore'))).toBe(false);
      expect(readFileSync(resolve(target, '.dockerignore'), 'utf8')).toBe('node_modules\n');
      expect(readFileSync(resolve(target, '.env.example'), 'utf8')).toContain('{{DB_NAME}}');
      expect(readFileSync(resolve(target, '.agents', 'skills', 'demo', 'SKILL.md'), 'utf8')).toBe(
        'hidden nested file\n',
      );
      expect(readFileSync(resolve(target, 'src', 'pages', 'home.tsx'), 'utf8')).toBe('export {}\n');
      expect(readFileSync(resolve(target, 'package.json'), 'utf8')).toContain('^2.3.4');
      expect(existsSync(resolve(target, 'pnpm-lock.yaml'))).toBe(true);
      expect(existsSync(resolve(target, 'node_modules'))).toBe(false);
      expect(existsSync(resolve(target, 'dist'))).toBe(false);
      expect(existsSync(resolve(target, '.tmp'))).toBe(false);
      expect(existsSync(resolve(target, '.netlify'))).toBe(false);
      expect(existsSync(resolve(target, 'netlify'))).toBe(false);
      expect(existsSync(resolve(target, 'netlify.toml'))).toBe(false);
      expect(existsSync(resolve(target, 'api', 'functions'))).toBe(false);
    }, 'carms-stage-full-');
  });

  it('rejects source symlinks and preserves existing output on failure', async () => {
    await withTestWorkspace((workspace) => {
      writeFileSync(resolve(workspace.source, '.gitignore'), '.env\n');
      writeFileSync(
        resolve(workspace.source, 'package.json'),
        JSON.stringify({ dependencies: { demo: '^{{VERSION}}' } }),
      );
      writeFileSync(resolve(workspace.source, 'real.txt'), 'real\n');
      symlinkSync(resolve(workspace.source, 'real.txt'), resolve(workspace.source, 'linked.txt'));
      writeFileSync(resolve(workspace.target, 'sentinel'), 'preserved\n');

      expect(() =>
        stageTemplate({
          sourceDir: workspace.source,
          targetDir: workspace.target,
          releaseVersion: '2.3.4',
          generateLockfile: (directory) => writeAgreedTestLockfile(directory),
        }),
      ).toThrow('Template symlinks are not supported: linked.txt');
      expect(readFileSync(resolve(workspace.target, 'sentinel'), 'utf8')).toBe('preserved\n');
    }, 'carms-stage-symlink-');
  });

  it('cleans temporary output and preserves existing output when lockfile generation fails', async () => {
    await withTestWorkspace((workspace) => {
      writeFileSync(resolve(workspace.source, '.gitignore'), '.env\n');
      writeFileSync(
        resolve(workspace.source, 'package.json'),
        JSON.stringify({ dependencies: { demo: '^{{VERSION}}' } }),
      );
      writeFileSync(resolve(workspace.target, 'sentinel'), 'preserved\n');

      expect(() =>
        stageTemplate({
          sourceDir: workspace.source,
          targetDir: workspace.target,
          releaseVersion: '2.3.4',
          generateLockfile: () => {
            throw new Error('lock failed');
          },
        }),
      ).toThrow('lock failed');
      expect(readFileSync(resolve(workspace.target, 'sentinel'), 'utf8')).toBe('preserved\n');
      expect(readdirSync(workspace.root).filter((entry) => entry.startsWith('.target.stage-'))).toEqual([]);
    }, 'carms-stage-failure-');
  });
});

describe('verifyStagedTemplate', () => {
  it('reports stale staged output without repairing it', async () => {
    await withTestWorkspace((workspace) => {
      writeFileSync(resolve(workspace.source, '.gitignore'), '.env\n');
      writeFileSync(
        resolve(workspace.source, 'package.json'),
        JSON.stringify({ dependencies: { demo: '^{{VERSION}}' } }),
      );
      writeFileSync(resolve(workspace.source, 'app.txt'), 'fresh\n');
      stageTemplate({
        sourceDir: workspace.source,
        targetDir: workspace.target,
        releaseVersion: '2.3.4',
        generateLockfile: (directory) => writeAgreedTestLockfile(directory),
      });
      writeFileSync(resolve(workspace.target, 'app.txt'), 'stale\n');
      writeFileSync(resolve(workspace.target, 'extra.txt'), 'unexpected\n');

      const drift = verifyStagedTemplate({
        sourceDir: workspace.source,
        targetDir: workspace.target,
        releaseVersion: '2.3.4',
      });

      expect(drift).toEqual({ missing: [], unexpected: ['extra.txt'], changed: ['app.txt'] });
      expect(readFileSync(resolve(workspace.target, 'app.txt'), 'utf8')).toBe('stale\n');
    }, 'carms-stage-verify-');
  });
});

describe('private dotenv exclusion (CARMSF-01)', () => {
  const privateDotenvPaths = [
    '.env',
    '.env.local',
    '.env.development',
    '.env.production',
    '.env.test',
    '.env.development.local',
    '.env.production.local',
    'api/.env',
    'config/.env.local',
    'nested/deep/.env.test',
  ];

  it('flags private dotenv paths at the shared boundary', () => {
    for (const path of privateDotenvPaths) {
      expect(isPrivateDotenvPath(path), path).toBe(true);
    }
    expect(isPrivateDotenvPath('.env.example')).toBe(false);
    expect(isPrivateDotenvPath('config/.env.example')).toBe(false);
    expect(isPrivateDotenvPath('.env.example.bak')).toBe(true);
  });

  it('excludes private dotenv variants under both publish and scaffold policies', () => {
    for (const policy of [PUBLISH_TEMPLATE_POLICY, SCAFFOLD_TEMPLATE_POLICY]) {
      for (const path of privateDotenvPaths) {
        expect(isTemplatePathExcluded(policy, path), `${policy.name}:${path}`).toBe(true);
      }
      expect(isTemplatePathExcluded(policy, '.env.example')).toBe(false);
      expect(isTemplatePathExcluded(policy, 'config/.env.example')).toBe(false);
    }
    // Publish traversal entry point honors the same policy.
    for (const path of privateDotenvPaths) {
      expect(isExcluded(path), path).toBe(true);
    }
    expect(isExcluded('.env.example')).toBe(false);
  });

  it('never stages private dotenv sentinels while retaining .env.example', async () => {
    await withTestWorkspace((workspace) => {
      writeFileSync(resolve(workspace.source, '.gitignore'), '.env\n');
      writeFileSync(resolve(workspace.source, '.env'), 'MONGODB_URI=mongodb://localhost:27017/CARMSF01-ROOT-SECRET\n');
      writeFileSync(
        resolve(workspace.source, '.env.local'),
        'MONGODB_URI=mongodb://localhost:27017/CARMSF01-LOCAL-SECRET\n',
      );
      writeFileSync(resolve(workspace.source, '.env.example'), 'MONGODB_URI=mongodb://localhost:27017/{{DB_NAME}}\n');
      mkdirSync(resolve(workspace.source, 'config'), { recursive: true });
      writeFileSync(
        resolve(workspace.source, 'config', '.env'),
        'MONGODB_URI=mongodb://localhost:27017/CARMSF01-NESTED-SECRET\n',
      );
      writeFileSync(
        resolve(workspace.source, 'config', '.env.example'),
        'MONGODB_URI=mongodb://localhost:27017/{{DB_NAME}}\n',
      );
      writeFileSync(
        resolve(workspace.source, 'package.json'),
        JSON.stringify({ dependencies: { demo: '^{{VERSION}}' } }),
      );

      stageTemplate({
        sourceDir: workspace.source,
        targetDir: workspace.target,
        releaseVersion: '2.3.4',
        generateLockfile: (directory) => writeAgreedTestLockfile(directory),
      });

      expect(existsSync(resolve(workspace.target, '.env'))).toBe(false);
      expect(existsSync(resolve(workspace.target, '.env.local'))).toBe(false);
      expect(existsSync(resolve(workspace.target, 'config', '.env'))).toBe(false);
      const stagedFiles = readdirSync(workspace.target, { recursive: true }).map(String);
      expect(stagedFiles.filter((file) => isPrivateDotenvPath(file))).toEqual([]);
      const stagedContent = stagedFiles
        .filter((file) => existsSync(resolve(workspace.target, file)))
        .map((file) => {
          try {
            return readFileSync(resolve(workspace.target, file), 'utf8');
          } catch {
            return '';
          }
        })
        .join('\n');
      expect(stagedContent).not.toContain('CARMSF01-ROOT-SECRET');
      expect(stagedContent).not.toContain('CARMSF01-LOCAL-SECRET');
      expect(stagedContent).not.toContain('CARMSF01-NESTED-SECRET');
      expect(readFileSync(resolve(workspace.target, '.env.example'), 'utf8')).toContain('{{DB_NAME}}');
      expect(readFileSync(resolve(workspace.target, 'config', '.env.example'), 'utf8')).toContain('{{DB_NAME}}');
      // .gitignore alias behavior is unchanged.
      expect(readFileSync(resolve(workspace.target, GITIGNORE_STAGING_ALIAS), 'utf8')).toBe('.env\n');

      const drift = verifyStagedTemplate({
        sourceDir: workspace.source,
        targetDir: workspace.target,
        releaseVersion: '2.3.4',
      });
      expect(drift).toEqual({ missing: [], unexpected: [], changed: [] });
    }, 'carms-stage-dotenv-');
  });
});

describe('fail closed on invalid release lockfiles (CARMSF-02)', () => {
  function withFailingDefaultPnpm(run: () => void): void {
    const fakeBin = mkdtempSync(join(tmpdir(), 'carmsf02-fakebin-'));
    writeFileSync(join(fakeBin, 'pnpm'), '#!/bin/sh\necho "carmsf02 fake pnpm: registry unavailable" >&2\nexit 1\n');
    chmodSync(join(fakeBin, 'pnpm'), 0o755);
    const previousPath = process.env.PATH ?? '';
    process.env.PATH = `${fakeBin}${previousPath ? `:${previousPath}` : ''}`;
    try {
      run();
    } finally {
      process.env.PATH = previousPath;
      rmSync(fakeBin, { recursive: true, force: true });
    }
  }

  function writeSourceWithManifest(workspace: { source: string }, manifest: unknown): void {
    writeManifestWithPlaceholder(workspace.source, manifest);
    writeFileSync(resolve(workspace.source, '.gitignore'), '.env\n');
  }

  it('fails the default generator without an old lockfile and preserves the previous stage', async () => {
    await withTestWorkspace((workspace) => {
      writeSourceWithManifest(workspace, { dependencies: { demo: '^{{VERSION}}' } });
      writeFileSync(resolve(workspace.target, 'sentinel'), 'preserved\n');

      withFailingDefaultPnpm(() => {
        expect(() =>
          stageTemplate({
            sourceDir: workspace.source,
            targetDir: workspace.target,
            releaseVersion: '9.9.9',
          }),
        ).toThrow();
      });

      expect(readFileSync(resolve(workspace.target, 'sentinel'), 'utf8')).toBe('preserved\n');
      expect(existsSync(resolve(workspace.target, 'pnpm-lock.yaml'))).toBe(false);
      expect(readdirSync(workspace.root).filter((entry) => entry.startsWith('.target.stage-'))).toEqual([]);
    }, 'carmsf02-default-noold-');
  });

  it('ignores a stale reference lockfile when the default generator fails', async () => {
    await withTestWorkspace((workspace) => {
      writeSourceWithManifest(workspace, { dependencies: { demo: '^{{VERSION}}' } });
      writeFileSync(resolve(workspace.target, 'sentinel'), 'preserved\n');
      // Mimics the pre-CARMSF-02 version-substitution source: it must not be
      // picked up or rewritten into the new stage.
      const staleReferenceDir = resolve(workspace.root, 'template');
      mkdirSync(staleReferenceDir, { recursive: true });
      const staleReference =
        "lockfileVersion: '9.0'\nimporters:\n  .:\n    dependencies:\n      'demo':\n        specifier: ^1.0.0\n        version: 1.0.0\n\npackages: {}\n";
      writeFileSync(resolve(staleReferenceDir, 'pnpm-lock.yaml'), staleReference);

      withFailingDefaultPnpm(() => {
        expect(() =>
          stageTemplate({
            sourceDir: workspace.source,
            targetDir: workspace.target,
            releaseVersion: '9.9.9',
          }),
        ).toThrow();
      });

      expect(readFileSync(resolve(workspace.target, 'sentinel'), 'utf8')).toBe('preserved\n');
      expect(existsSync(resolve(workspace.target, 'pnpm-lock.yaml'))).toBe(false);
      expect(readFileSync(resolve(staleReferenceDir, 'pnpm-lock.yaml'), 'utf8')).toBe(staleReference);
      expect(readdirSync(workspace.root).filter((entry) => entry.startsWith('.target.stage-'))).toEqual([]);
    }, 'carmsf02-default-old-');
  });

  it('rejects a missing lockfile without destroying the previous stage', async () => {
    await withTestWorkspace((workspace) => {
      writeSourceWithManifest(workspace, { dependencies: { demo: '^{{VERSION}}' } });
      writeFileSync(resolve(workspace.target, 'sentinel'), 'preserved\n');

      expect(() =>
        stageTemplate({
          sourceDir: workspace.source,
          targetDir: workspace.target,
          releaseVersion: '2.3.4',
          generateLockfile: () => {},
        }),
      ).toThrow('did not create');
      expect(readFileSync(resolve(workspace.target, 'sentinel'), 'utf8')).toBe('preserved\n');
      expect(() => validateStagedLockfile(workspace.target)).toThrow('missing');
    }, 'carmsf02-missing-');
  });

  it('rejects malformed lockfiles', async () => {
    await withTestWorkspace((workspace) => {
      writeSourceWithManifest(workspace, { dependencies: { demo: '^{{VERSION}}' } });

      expect(() =>
        stageTemplate({
          sourceDir: workspace.source,
          targetDir: workspace.target,
          releaseVersion: '2.3.4',
          generateLockfile: (directory) => writeFileSync(resolve(directory, 'pnpm-lock.yaml'), 'not a lockfile\n'),
        }),
      ).toThrow('malformed');
    }, 'carmsf02-malformed-');
  });

  it('rejects stale importer specifiers', async () => {
    await withTestWorkspace((workspace) => {
      writeSourceWithManifest(workspace, {
        dependencies: { demo: '^{{VERSION}}' },
        devDependencies: { 'demo-dev': '^1.0.0' },
      });

      expect(() =>
        stageTemplate({
          sourceDir: workspace.source,
          targetDir: workspace.target,
          releaseVersion: '2.3.4',
          generateLockfile: (directory) =>
            writeFileSync(
              resolve(directory, 'pnpm-lock.yaml'),
              `lockfileVersion: '9.0'\n\nimporters:\n\n  .:\n    dependencies:\n      'demo':\n        specifier: ^1.0.0\n        version: 1.0.0\n    devDependencies:\n      'demo-dev':\n        specifier: ^1.0.0\n        version: 1.0.0+fake.0\n\npackages:\n\n  fake-test-package@1.0.0:\n    resolution: {integrity: sha512-AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA==}\n\nsnapshots:\n\n  fake-test-package@1.0.0: {}\n`,
            ),
        }),
      ).toThrow('does not match');
    }, 'carmsf02-stale-');
  });

  it('rejects synthetic lockfiles without resolution metadata', async () => {
    await withTestWorkspace((workspace) => {
      writeSourceWithManifest(workspace, { dependencies: { demo: '^{{VERSION}}' } });

      expect(() =>
        stageTemplate({
          sourceDir: workspace.source,
          targetDir: workspace.target,
          releaseVersion: '2.3.4',
          generateLockfile: (directory) =>
            writeFileSync(
              resolve(directory, 'pnpm-lock.yaml'),
              `lockfileVersion: '9.0'\n\nsettings:\n  autoInstallPeers: true\n  excludeLinksFromLockfile: false\n\nimporters:\n  .:\n    dependencies:\n      'demo':\n        specifier: ^2.3.4\n        version: 2.3.4\n\npackages: {}\n`,
            ),
        }),
      ).toThrow(/packages:|resolution metadata/);
    }, 'carmsf02-synthetic-');
  });

  it('accepts an agreed lockfile covering dependencies and devDependencies', async () => {
    await withTestWorkspace((workspace) => {
      writeSourceWithManifest(workspace, {
        dependencies: { demo: '^{{VERSION}}' },
        devDependencies: { 'demo-dev': '^1.0.0' },
      });

      stageTemplate({
        sourceDir: workspace.source,
        targetDir: workspace.target,
        releaseVersion: '2.3.4',
        generateLockfile: (directory) => writeAgreedTestLockfile(directory),
      });

      expect(() => validateStagedLockfile(workspace.target)).not.toThrow();
      const drift = verifyStagedTemplate({
        sourceDir: workspace.source,
        targetDir: workspace.target,
        releaseVersion: '2.3.4',
      });
      expect(drift).toEqual({ missing: [], unexpected: [], changed: [] });
    }, 'carmsf02-agreed-');
  });

  it('verifyStagedTemplate rejects a fabricated lockfile even when file drift is clean', async () => {
    await withTestWorkspace((workspace) => {
      writeSourceWithManifest(workspace, { dependencies: { demo: '^{{VERSION}}' } });
      stageTemplate({
        sourceDir: workspace.source,
        targetDir: workspace.target,
        releaseVersion: '2.3.4',
        generateLockfile: (directory) => writeAgreedTestLockfile(directory),
      });
      // Replace the valid lockfile with a synthetic fabrication after staging.
      writeFileSync(
        resolve(workspace.target, 'pnpm-lock.yaml'),
        `lockfileVersion: '9.0'\n\nimporters:\n  .:\n    dependencies:\n      'demo':\n        specifier: ^2.3.4\n        version: 2.3.4\n\npackages: {}\n`,
      );

      expect(() =>
        verifyStagedTemplate({
          sourceDir: workspace.source,
          targetDir: workspace.target,
          releaseVersion: '2.3.4',
        }),
      ).toThrow(/packages:|resolution metadata/);
    }, 'carmsf02-verify-');
  });
});
