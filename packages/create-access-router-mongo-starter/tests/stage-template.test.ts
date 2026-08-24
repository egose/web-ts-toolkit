// @vitest-environment node
import { existsSync, mkdirSync, readdirSync, readFileSync, symlinkSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, it, expect } from 'vitest';
import {
  isExcluded,
  normalize,
  EXCLUDED_PATHS,
  GITIGNORE_STAGING_ALIAS,
  stageTemplate,
  verifyStagedTemplate,
} from '../scripts/stage-template';
import { withTestWorkspace } from './support/temp-workspace';

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
          writeFileSync(
            resolve(directory, 'pnpm-lock.yaml'),
            "lockfileVersion: '9.0'\nimporters:\n  .:\n    dependencies:\n      '@web-ts-toolkit/access-router-runtime':\n        specifier: ^1.2.3\n        version: 1.2.3\n",
          );
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
        generateLockfile: (directory) => writeFileSync(resolve(directory, 'pnpm-lock.yaml'), 'lockfileVersion: 9\n'),
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
          generateLockfile: (directory) => writeFileSync(resolve(directory, 'pnpm-lock.yaml'), 'lockfileVersion: 9\n'),
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
      stageTemplate({
        sourceDir: workspace.source,
        targetDir: workspace.target,
        releaseVersion: '2.3.4',
        generateLockfile: (directory) => writeFileSync(resolve(directory, 'pnpm-lock.yaml'), 'lockfileVersion: 9\n'),
      });
      writeFileSync(resolve(workspace.target, 'package.json'), 'stale\n');
      writeFileSync(resolve(workspace.target, 'extra.txt'), 'unexpected\n');

      const drift = verifyStagedTemplate({
        sourceDir: workspace.source,
        targetDir: workspace.target,
        releaseVersion: '2.3.4',
      });

      expect(drift).toEqual({ missing: [], unexpected: ['extra.txt'], changed: ['package.json'] });
      expect(readFileSync(resolve(workspace.target, 'package.json'), 'utf8')).toBe('stale\n');
    }, 'carms-stage-verify-');
  });
});
