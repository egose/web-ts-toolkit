import { execFile } from 'node:child_process';
import { mkdtemp, readFile, rm, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { promisify } from 'node:util';

import { describe, expect, it } from 'vitest';

const execute = promisify(execFile);

describe('CLIENT-08 published package README copy/paste consumers', () => {
  it('extracts app/core/website bound frontend snippets and strictly typechecks them against the published client', async () => {
    const output = await mkdtemp(join(tmpdir(), 'client-08-docs-'));
    try {
      const appReadme = await readFile(new URL('../README.md', import.meta.url), 'utf8');
      const coreReadme = await readFile(
        new URL('../../../packages/express-oidc-vault/README.md', import.meta.url),
        'utf8',
      );
      const website = await readFile(
        new URL('../../../website/docs/packages/express-oidc-vault.md', import.meta.url),
        'utf8',
      );
      const snippet = (readme: string, heading: string) =>
        readme.slice(readme.indexOf(heading)).match(/```ts\n([\s\S]*?)\n```/)![1];
      const appCode = snippet(appReadme, '## Use the published browser client');
      const coreCode = snippet(coreReadme, '### Persistent-key DPoP SPA example');
      const websiteCode = snippet(website, '### Persistent-key DPoP SPA example');
      for (const code of [appCode, coreCode, websiteCode]) {
        expect(code).toContain("basePath: '/auth/oidc/body'");
        expect(code).toContain("replayNamespace: 'oidc-vault-dpop-example-api'");
        expect(code).toContain('@web-ts-toolkit/oidc-vault-dpop-client');
        expect(code).not.toContain('@web-ts-toolkit/express');
        expect(code).not.toContain("from './auth");
      }
      // Snippets import the published client root, resolved through this app's
      // node_modules workspace link (no src/auth copy remains to symlink).
      await symlink(new URL('../node_modules', import.meta.url).pathname, join(output, 'node_modules'), 'dir');
      await writeFile(join(output, 'app.ts'), appCode);
      await writeFile(join(output, 'core.ts'), coreCode);
      await writeFile(join(output, 'website.ts'), websiteCode);
      await writeFile(
        join(output, 'tsconfig.json'),
        JSON.stringify({
          compilerOptions: {
            target: 'ES2022',
            module: 'ESNext',
            moduleResolution: 'Bundler',
            lib: ['ES2022', 'DOM', 'DOM.Iterable'],
            strict: true,
            skipLibCheck: false,
            noEmit: true,
            types: [],
          },
          files: ['app.ts', 'core.ts', 'website.ts'],
        }),
      );
      const tsc = new URL('../node_modules/typescript/bin/tsc', import.meta.url).pathname;
      await execute(process.execPath, [tsc, '-p', join(output, 'tsconfig.json')]);
    } finally {
      await rm(output, { recursive: true, force: true });
    }
  });
});
