// @vitest-environment node
import { existsSync, mkdirSync, readFileSync, readdirSync, renameSync, symlinkSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { basename, dirname, join, parse, relative } from 'node:path';
import { execFileSync } from 'node:child_process';
import { describe, expect, it } from 'vitest';
import { runCli, type ScaffoldServices } from '../src/cli';
import { withTestWorkspace } from './support/temp-workspace';

function writeTemplate(path: string): void {
  mkdirSync(path, { recursive: true });
  mkdirSync(join(path, 'api', 'src'), { recursive: true });
  mkdirSync(join(path, 'src', 'pages'), { recursive: true });
  writeFileSync(join(path, '.gitignore'), '.env\nnode_modules\ndist\napi/functions\n.netlify\n');
  writeFileSync(join(path, '.env.example'), 'MONGODB_URI=mongodb://localhost:27017/{{DB_NAME}}\n');
  writeFileSync(join(path, 'package.json'), '{"name":"{{APP_NAME}}","version":"{{VERSION}}"}\n');
  writeFileSync(
    join(path, 'README.md'),
    '# {{APP_TITLE}}\n\nMaintainer examples: `{{APP_NAME}}`, `{{APP_TITLE}}`, `{{DB_NAME}}`.\n',
  );
  writeFileSync(join(path, 'api', 'access-router.config.ts'), "const name = '{{APP_NAME}}';\n");
  writeFileSync(join(path, 'api', 'src', 'config.ts'), "export const DB_NAME = '{{DB_NAME}}';\n");
  writeFileSync(join(path, 'src', 'pages', 'home-page.tsx'), "const title = <h1>{'{{APP_TITLE}}'}</h1>;\n");
  writeFileSync(join(path, 'index.html'), '<title>{{APP_TITLE}}</title>\n');
}

function entriesBeside(target: string): string[] {
  const prefix = `.${basename(target)}.`;
  return readdirSync(dirname(target)).filter((entry) => entry.startsWith(prefix));
}

describe('scaffold target safety', () => {
  it('rejects roots, cwd, home, and template relationships before mutation', async () => {
    await withTestWorkspace(async (workspace) => {
      writeTemplate(workspace.source);
      const sourceSentinel = readFileSync(join(workspace.source, 'package.json'), 'utf8');
      const cases = [
        parse(workspace.root).root,
        workspace.root,
        homedir(),
        workspace.source,
        dirname(workspace.source),
        join(workspace.source, 'child'),
      ];

      for (const target of cases) {
        await expect(
          runCli([target, '--force', '--name', 'safe-name'], {
            templateDir: workspace.source,
            scaffolderVersion: '1.2.3',
            cwd: workspace.root,
            log: () => undefined,
          }),
        ).rejects.toThrow(/Refusing|must not contain/);
      }

      expect(readFileSync(join(workspace.source, 'package.json'), 'utf8')).toBe(sourceSentinel);
    });
  });

  it('rejects symlink aliases of protected paths and never traverses template symlinks', async () => {
    await withTestWorkspace(async (workspace) => {
      writeTemplate(workspace.source);
      const cwdAlias = join(workspace.root, 'cwd-alias');
      symlinkSync(workspace.root, cwdAlias, 'dir');

      await expect(
        runCli([cwdAlias, '--force'], {
          templateDir: workspace.source,
          scaffolderVersion: '1.2.3',
          cwd: workspace.root,
          log: () => undefined,
        }),
      ).rejects.toThrow(/symlink|current working directory/);

      const templateAlias = join(workspace.root, 'template-alias');
      symlinkSync(workspace.source, templateAlias, 'dir');
      await expect(
        runCli([join(templateAlias, 'missing-child')], {
          templateDir: workspace.source,
          scaffolderVersion: '1.2.3',
          cwd: workspace.root,
          log: () => undefined,
        }),
      ).rejects.toThrow('must not contain one another');

      const outside = join(workspace.root, 'outside.txt');
      writeFileSync(outside, 'outside sentinel');
      symlinkSync(outside, join(workspace.source, 'outside-link'));
      const target = join(workspace.root, 'safe-target');
      await expect(
        runCli([target], {
          templateDir: workspace.source,
          scaffolderVersion: '1.2.3',
          cwd: workspace.root,
          log: () => undefined,
        }),
      ).rejects.toThrow('Template symlinks are not supported');
      expect(readFileSync(outside, 'utf8')).toBe('outside sentinel');
      expect(existsSync(target)).toBe(false);
      expect(entriesBeside(target)).toEqual([]);
    });
  });

  it.each(['copyTemplate', 'rewritePlaceholders'] as const)(
    'preserves an existing target when %s fails',
    async (failurePoint) => {
      await withTestWorkspace(async (workspace) => {
        writeTemplate(workspace.source);
        writeFileSync(join(workspace.target, 'sentinel.bin'), Buffer.from([0, 1, 2, 255]));
        const overrides: Partial<ScaffoldServices> = {
          templateDir: workspace.source,
          scaffolderVersion: '1.2.3',
          cwd: workspace.root,
          log: () => undefined,
          [failurePoint]: () => {
            throw new Error(`simulated ${failurePoint} failure`);
          },
        };

        await expect(runCli([workspace.target, '--force'], overrides)).rejects.toThrow(
          `simulated ${failurePoint} failure`,
        );
        expect(readFileSync(join(workspace.target, 'sentinel.bin'))).toEqual(Buffer.from([0, 1, 2, 255]));
        expect(readdirSync(workspace.target)).toEqual(['sentinel.bin']);
        expect(entriesBeside(workspace.target)).toEqual([]);
      });
    },
  );

  it('restores an existing target when the final staged rename fails', async () => {
    await withTestWorkspace(async (workspace) => {
      writeTemplate(workspace.source);
      writeFileSync(join(workspace.target, 'sentinel.txt'), 'old target');
      let moves = 0;

      await expect(
        runCli([workspace.target, '--force'], {
          templateDir: workspace.source,
          scaffolderVersion: '1.2.3',
          cwd: workspace.root,
          log: () => undefined,
          move: (source, target) => {
            moves += 1;
            if (moves === 2) throw new Error('simulated final rename failure');
            renameSync(source, target);
          },
        }),
      ).rejects.toThrow('simulated final rename failure');

      expect(readFileSync(join(workspace.target, 'sentinel.txt'), 'utf8')).toBe('old target');
      expect(entriesBeside(workspace.target)).toEqual([]);
    });
  });

  it('replaces a target transactionally and cleans sibling staging paths', async () => {
    await withTestWorkspace(async (workspace) => {
      writeTemplate(workspace.source);
      writeFileSync(join(workspace.target, 'obsolete.txt'), 'remove me');

      await expect(
        runCli([workspace.target, '--force', '--name', 'new-app'], {
          templateDir: workspace.source,
          scaffolderVersion: '1.2.3',
          cwd: workspace.root,
          log: () => undefined,
        }),
      ).resolves.toBe(0);

      expect(existsSync(join(workspace.target, 'obsolete.txt'))).toBe(false);
      expect(JSON.parse(readFileSync(join(workspace.target, 'package.json'), 'utf8'))).toEqual({
        name: 'new-app',
        version: '1.2.3',
      });
      expect(entriesBeside(workspace.target)).toEqual([]);
    });
  });

  it('serializes adversarial Unicode values by context and copies binary files byte-for-byte', async () => {
    await withTestWorkspace(async (workspace) => {
      writeTemplate(workspace.source);
      const target = join(workspace.root, 'generated');
      const binary = Buffer.from([
        0xff, 0x00, 0x7b, 0x7b, 0x41, 0x50, 0x50, 0x5f, 0x54, 0x49, 0x54, 0x4c, 0x45, 0x7d, 0x7d,
      ]);
      writeFileSync(join(workspace.source, 'asset.bin'), binary);
      const title = '雪 "quoted" \\ path\n</title><script>alert(1)</script>';
      const dbName = 'データ&name';

      await runCli([target, '--name', '@scope/valid.package', '--title', title, '--db-name', dbName], {
        templateDir: workspace.source,
        scaffolderVersion: '1.2.3-beta.1+build.5',
        cwd: workspace.root,
        log: () => undefined,
      });

      expect(JSON.parse(readFileSync(join(target, 'package.json'), 'utf8'))).toEqual({
        name: '@scope/valid.package',
        version: '1.2.3-beta.1+build.5',
      });
      expect(readFileSync(join(target, 'api', 'access-router.config.ts'), 'utf8')).toContain(
        `const name = ${JSON.stringify('@scope/valid.package')};`,
      );
      expect(readFileSync(join(target, 'api', 'src', 'config.ts'), 'utf8')).toContain(
        `export const DB_NAME = ${JSON.stringify(dbName)};`,
      );
      expect(readFileSync(join(target, 'src', 'pages', 'home-page.tsx'), 'utf8')).toContain(
        `<h1>{${JSON.stringify(title)}}</h1>`,
      );
      expect(readFileSync(join(target, 'index.html'), 'utf8')).toContain(
        '<title>雪 &quot;quoted&quot; \\ path\n&lt;/title&gt;&lt;script&gt;alert(1)&lt;/script&gt;</title>',
      );
      expect(readFileSync(join(target, '.env.example'), 'utf8')).toContain(
        `mongodb://localhost:27017/${encodeURIComponent(dbName)}`,
      );
      const readme = readFileSync(join(target, 'README.md'), 'utf8');
      expect(readme.split('\n')[0]).not.toContain('<script>');
      expect(readme).toContain('`{{APP_NAME}}`, `{{APP_TITLE}}`, `{{DB_NAME}}`');
      expect(readFileSync(join(target, 'asset.bin'))).toEqual(binary);
    });
  });

  it.each([
    { args: ['--name', 'Uppercase'], error: 'Invalid package name' },
    { args: ['--name', 'valid-name', '--db-name', 'bad/name'], error: 'Invalid MongoDB database name' },
    { args: ['--name', 'valid-name', '--title', '   '], error: 'Display title must not be empty' },
  ])('rejects invalid scaffold values before mutation: $error', async ({ args, error }) => {
    await withTestWorkspace(async (workspace) => {
      writeTemplate(workspace.source);
      const target = join(workspace.root, 'generated');
      await expect(
        runCli([target, ...args], {
          templateDir: workspace.source,
          scaffolderVersion: '1.2.3',
          cwd: workspace.root,
          log: () => undefined,
        }),
      ).rejects.toThrow(error);
      expect(existsSync(target)).toBe(false);
      expect(entriesBeside(target)).toEqual([]);
    });
  });

  it.each([undefined, '0.0.0-PLACEHOLDER', 'not_found_1', '{{VERSION}}'])(
    'rejects unresolved scaffolder version %s before mutation',
    async (version) => {
      await withTestWorkspace(async (workspace) => {
        writeTemplate(workspace.source);
        const target = join(workspace.root, 'generated');
        await expect(
          runCli([target, '--name', 'valid-name'], {
            templateDir: workspace.source,
            scaffolderVersion: version,
            cwd: workspace.root,
            log: () => undefined,
          }),
        ).rejects.toThrow('Could not resolve a concrete scaffolder package version');
        expect(existsSync(target)).toBe(false);
        expect(entriesBeside(target)).toEqual([]);
      });
    },
  );

  it('prints a shell-safe cd command for a target with metacharacters', async () => {
    await withTestWorkspace(async (workspace) => {
      writeTemplate(workspace.source);
      const target = join(workspace.root, "target with spaces;and'quote");
      const output: string[] = [];

      await runCli([target, '--name', 'safe-name'], {
        templateDir: workspace.source,
        scaffolderVersion: '1.2.3',
        cwd: workspace.root,
        log: (message = '') => output.push(message),
      });

      const command = output.find((line) => line.startsWith('  cd '))?.trim();
      expect(command).toBeDefined();
      const resolvedByShell = execFileSync('sh', ['-c', `${command} && pwd`], {
        cwd: workspace.root,
        encoding: 'utf8',
      }).trim();
      expect(resolvedByShell).toBe(target);
      expect(command).toContain(`'"'"'`);
      expect(relative(workspace.root, target)).toContain(' ');
    });
  });
});
