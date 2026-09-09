// @vitest-environment node
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { basename, dirname, join } from 'node:path';
import { describe, expect, it, vi, beforeEach } from 'vitest';

const CANCELLED = Symbol('cancelled');
let textHandler: (opts: { message: string }) => unknown = () => '';

vi.mock('@clack/prompts', () => ({
  intro: vi.fn(),
  outro: vi.fn(),
  cancel: vi.fn(),
  isCancel: (value: unknown) => value === CANCELLED,
  text: async (opts: { message: string }) => textHandler(opts),
}));

import { runCli } from '../src/cli';
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

beforeEach(() => {
  textHandler = () => '';
});

describe('scaffold interactive prompts (CARMSF-04)', () => {
  it('derives a safe db default for @scope/my.app when accepting defaults', async () => {
    await withTestWorkspace(async (workspace) => {
      writeTemplate(workspace.source);
      textHandler = () => '';
      const target = join(workspace.root, 'generated');

      await expect(
        runCli([target, '--name', '@scope/my.app', '-i'], {
          templateDir: workspace.source,
          scaffolderVersion: '1.2.3',
          cwd: workspace.root,
          log: () => undefined,
        }),
      ).resolves.toBe(0);

      expect(readFileSync(join(target, '.env.example'), 'utf8')).toContain('mongodb://localhost:27017/my-app');
      expect(readFileSync(join(target, 'api', 'src', 'config.ts'), 'utf8')).toContain(
        `export const DB_NAME = ${JSON.stringify('my-app')};`,
      );
    });
  });

  it.each([
    ['target', ['-i']],
    ['name', ['mytarget', '-i']],
    ['title', ['mytarget', '--name', 'my-app', '-i']],
    ['db', ['mytarget', '--name', 'my-app', '--title', 'My App', '-i']],
  ])('cancelling the %s prompt returns zero without mutation or exit', async (_label, argv) => {
    await withTestWorkspace(async (workspace) => {
      writeTemplate(workspace.source);
      textHandler = () => CANCELLED;
      const exitSpy = vi.spyOn(process, 'exit').mockImplementation((() => undefined) as never);
      try {
        const target = join(workspace.root, 'mytarget');
        await expect(
          runCli(
            argv.map((a) => (a === 'mytarget' ? target : a)),
            {
              templateDir: workspace.source,
              scaffolderVersion: '1.2.3',
              cwd: workspace.root,
              log: () => undefined,
            },
          ),
        ).resolves.toBe(0);
        expect(exitSpy).not.toHaveBeenCalled();
        expect(existsSync(target)).toBe(false);
        expect(entriesBeside(target)).toEqual([]);
      } finally {
        exitSpy.mockRestore();
      }
    });
  });
});
